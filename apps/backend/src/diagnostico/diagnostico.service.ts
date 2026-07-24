import { readdir } from "node:fs/promises";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { AiClientService } from "../ai/ai-client.service";
import { PandapeApiService } from "../pandape/pandape-api.service";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { PandapeSchedulerService } from "../pandape/pandape-scheduler.service";
import { fopagTemPastaPai } from "../ai/drive-routing";
import { MOTIVO_FALHA_IA, type FamiliaFalhaIa } from "../domain/falha-auditoria";
import { LIMIAR_AUDITORIA_PARADA_MS } from "../domain/auditoria-parada";
import { schedulerParado, type EstadoScheduler } from "../domain/scheduler-pandape";
import {
  calcularAlerta,
  type Dependencia,
  type DiagnosticoSnapshot,
  type EstadoSchedulerSnapshot,
  type Sinal,
  type SinalItem,
} from "../domain/diagnostico";

const STAGING_DIR = process.env.STAGING_DIR ?? "/tmp/ea-staging";

/** Linha crua de admissão afetada (identifica por nome do candidato, NUNCA CPF, §A.6). */
interface LinhaAfetada {
  admissao_id: string;
  candidato: string;
  detalhe?: string;
  horas?: number;
}

/**
 * TELA DE DIAGNÓSTICO DO SISTEMA (OST). Monta o snapshot dos sinais do banco (Bloco 1), da lacuna
 * Fopag (Bloco 2), das dependências externas testadas pelo CAMINHO REAL (Bloco 3), da última coleta
 * (Bloco 4) e do histórico (Bloco 6), e resolve o alerta (Bloco 7).
 *
 * §A.6: nenhuma consulta seleciona CPF, nome de arquivo ou URL. O nome do candidato entra só para o
 * consultor identificar a admissão na tela, como a OST permite.
 */
@Injectable()
export class DiagnosticoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly pandapeApi: PandapeApiService,
    private readonly fila: PandapeQueueService,
    private readonly scheduler: PandapeSchedulerService,
  ) {}

  /**
   * Cache das dependências externas. O badge (alertaLeve) é consultado a todo momento pela sidebar,
   * e checar o Vertex pelo caminho REAL gasta uma geração: não dá para fazer a cada poll. O snapshot
   * completo atualiza o cache; o badge lê o cache se fresco (TTL 5 min). Assim o badge reflete
   * "dependência fora do ar" (Bloco 7) sem queimar quota.
   */
  private depsCache: { at: number; deps: Dependencia[] } | null = null;
  private static readonly DEPS_TTL_MS = 5 * 60 * 1000;

  async snapshot(): Promise<DiagnosticoSnapshot> {
    const [
      pendenteStaging,
      reguaSemPasta,
      paradoAlem6h,
      falhasPorFamilia,
      fopagSemPasta,
      estadoScheduler,
    ] = await Promise.all([
      this.sinalPendenteComStaging(),
      this.sinalReguaFechadaSemPasta(),
      this.sinalParadoAlemLimiar(),
      this.sinalFalhasPorFamilia(),
      this.sinalFopagSemPasta(),
      this.scheduler.estado(),
    ]);

    const parado = schedulerParado(estadoScheduler, Date.now());
    const sinais = [
      pendenteStaging,
      reguaSemPasta,
      paradoAlem6h,
      falhasPorFamilia,
      this.sinalScheduler(parado),
    ];

    const [dependencias, ultimaColeta, historico] = await Promise.all([
      this.dependencias(),
      this.ultimaColeta(),
      this.historico(),
    ]);

    const alerta = calcularAlerta(sinais, fopagSemPasta, dependencias);

    return {
      geradoEm: new Date().toISOString(),
      sinais,
      fopagSemPasta,
      dependencias,
      ultimaColeta,
      historico,
      scheduler: this.blocoScheduler(estadoScheduler, parado),
      alerta,
    };
  }

  /**
   * Sinal SCHEDULER PARADO (Bloco 4): entra na lista de sinais para acender o badge/popup quando o
   * scheduler morre. Sinal de sistema, sem itens por admissão; o detalhe rico vem do bloco `scheduler`.
   */
  private sinalScheduler(parado: boolean): Sinal {
    return {
      chave: "scheduler-parado",
      rotulo: "Scheduler de coleta parado",
      total: parado ? 1 : 0,
      itens: [],
    };
  }

  private blocoScheduler(estado: EstadoScheduler, parado: boolean): EstadoSchedulerSnapshot {
    return {
      ligado: estado.ligado,
      parado,
      ultimoCicloEm: estado.ultimoCicloEm,
      ultimoCicloOkEm: estado.ultimoCicloOkEm,
      varridas: estado.varridas,
      novos: estado.novos,
      falhas: estado.falhas,
      abortado: estado.abortado,
      nota: estado.nota,
    };
  }

  /** Resumo do alerta para o badge/popup: sinais de banco FRESCOS + dependências do CACHE (Bloco 7). */
  async alertaLeve() {
    const [a, b, c, d, fopag, estadoScheduler] = await Promise.all([
      this.sinalPendenteComStaging(),
      this.sinalReguaFechadaSemPasta(),
      this.sinalParadoAlemLimiar(),
      this.sinalFalhasPorFamilia(),
      this.sinalFopagSemPasta(),
      this.scheduler.estado(),
    ]);
    const sched = this.sinalScheduler(schedulerParado(estadoScheduler, Date.now()));
    // Dependências do cache (se houver): o badge reflete "fora do ar" sem pagar a checagem cara a
    // cada poll. Sem cache ainda (nenhum snapshot rodou), o badge acende só pelos sinais de banco.
    const depsCacheadas =
      this.depsCache && Date.now() - this.depsCache.at < DiagnosticoService.DEPS_TTL_MS
        ? this.depsCache.deps
        : [];
    return calcularAlerta([a, b, c, d, sched], fopag, depsCacheadas);
  }

  // ── Bloco 1a: documento PENDENTE COM arquivo na staging (coleta perdida) ────
  private async sinalPendenteComStaging(): Promise<Sinal> {
    // Tipos com arquivo na staging, por admissão (lê o filesystem, sem PII).
    const tiposPorAdmissao = await this.tiposNaStaging();
    if (tiposPorAdmissao.size === 0) {
      return { chave: "pendente-staging", rotulo: "Coleta perdida (PENDENTE com arquivo)", total: 0, itens: [] };
    }
    // Documentos PENDENTE dessas admissões, com o código do tipo, e o nome do candidato.
    const ids = [...tiposPorAdmissao.keys()];
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato, t.codigo AS codigo,
             EXTRACT(EPOCH FROM (now() - d.atualizado_em)) / 3600 AS horas
      FROM admissoes a
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      JOIN documentos_admissao d ON d.admissao_id = a.id
      JOIN tipos_documento t ON t.id = d.tipo_documento_id
      WHERE a.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
        AND d.estado = 'PENDENTE'
        -- COLETA PERDIDA = arquivo na staging, PENDENTE e NUNCA auditado (sem observação). Um
        -- PENDENTE COM observação já passou pela IA (veredito "manual/ilegível"), não é perda; e o
        -- a2a56340 (0 marcas mas com veredito) nunca entra, provando que o sinal não usa marcas.
        AND d.observacao IS NULL
    `)) as unknown as Array<{ admissao_id: string; candidato: string; codigo: string; horas: number }>;

    // Só conta o (admissão, tipo) que TEM arquivo na staging: é o sinal preciso (não "0 marcas").
    const porAdmissao = new Map<string, { candidato: string; tipos: string[]; horas: number }>();
    for (const r of rows) {
      const naStaging = tiposPorAdmissao.get(r.admissao_id);
      if (!naStaging?.has(r.codigo)) continue;
      const cur = porAdmissao.get(r.admissao_id) ?? { candidato: r.candidato, tipos: [], horas: 0 };
      cur.tipos.push(r.codigo);
      cur.horas = Math.max(cur.horas, Math.floor(r.horas ?? 0));
      porAdmissao.set(r.admissao_id, cur);
    }
    const itens: SinalItem[] = [...porAdmissao.entries()].map(([admissaoId, v]) => ({
      admissaoId,
      candidato: v.candidato,
      detalhe: `${v.tipos.length} documento(s) com arquivo na staging sem veredito`,
      horas: v.horas,
    }));
    return {
      chave: "pendente-staging",
      rotulo: "Coleta perdida (PENDENTE com arquivo)",
      total: itens.length,
      itens,
    };
  }

  // ── Bloco 1b: régua fechada e drive_pasta_url nula (só admissões vivas) ─────
  private async sinalReguaFechadaSemPasta(): Promise<Sinal> {
    const rows = (await this.db.execute(sql`
      WITH obrig AS (
        SELECT a.id, c.nome AS candidato,
          COUNT(*) FILTER (WHERE COALESCE(d.estado::text,'PENDENTE') <> 'ENTREGUE'
            AND NOT (t.codigo='RESERVISTA' AND c.sexo IS DISTINCT FROM 'MASCULINO')) AS faltando
        FROM admissoes a
        JOIN candidatos c ON c.cpf = a.candidato_cpf
        JOIN regua_documental r ON r.cod_cliente=a.cod_cliente AND r.cargo_id=a.cargo_id AND r.exigencia='OBRIGATORIO'
        JOIN tipos_documento t ON t.id = r.tipo_documento_id
        LEFT JOIN documentos_admissao d ON d.admissao_id=a.id AND d.tipo_documento_id=r.tipo_documento_id
        WHERE a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR') AND a.drive_pasta_url IS NULL
        GROUP BY a.id, c.nome
      )
      SELECT id AS admissao_id, candidato FROM obrig WHERE faltando = 0
    `)) as unknown as LinhaAfetada[];
    return {
      chave: "regua-sem-pasta",
      rotulo: "Régua fechada sem pasta no Drive",
      total: rows.length,
      itens: rows.map((r) => ({ admissaoId: r.admissao_id, candidato: r.candidato, detalhe: "régua obrigatória completa, prontuário não criado" })),
    };
  }

  // ── Bloco 1c: AGUARDANDO_AUDITORIA há mais que o limiar (6h) ────────────────
  private async sinalParadoAlemLimiar(): Promise<Sinal> {
    const horasLimiar = LIMIAR_AUDITORIA_PARADA_MS / 3_600_000;
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato,
             EXTRACT(EPOCH FROM (now() - d.atualizado_em)) / 3600 AS horas
      FROM documentos_admissao d
      JOIN admissoes a ON a.id = d.admissao_id
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      WHERE d.estado = 'AGUARDANDO_AUDITORIA'
        AND d.atualizado_em <= now() - (${horasLimiar} || ' hours')::interval
    `)) as unknown as Array<{ admissao_id: string; candidato: string; horas: number }>;
    const porAdmissao = new Map<string, { candidato: string; horas: number; n: number }>();
    for (const r of rows) {
      const cur = porAdmissao.get(r.admissao_id) ?? { candidato: r.candidato, horas: 0, n: 0 };
      cur.horas = Math.max(cur.horas, Math.floor(r.horas ?? 0));
      cur.n += 1;
      porAdmissao.set(r.admissao_id, cur);
    }
    return {
      chave: "parado-6h",
      rotulo: `Parado em auditoria acima de ${horasLimiar}h`,
      total: porAdmissao.size,
      itens: [...porAdmissao.entries()].map(([admissaoId, v]) => ({
        admissaoId,
        candidato: v.candidato,
        detalhe: `${v.n} documento(s) parados`,
        horas: v.horas,
      })),
    };
  }

  // ── Bloco 1d: falhas de SISTEMA atuais, classificadas por família ──────────
  private async sinalFalhasPorFamilia(): Promise<Sinal> {
    // AGUARDANDO_AUDITORIA cujo motivo casa com um texto de família (falha de sistema, não a frase
    // inicial de coleta). Classifica pela observacao, que a auditoria grava com o motivo da família.
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato, d.observacao AS observacao
      FROM documentos_admissao d
      JOIN admissoes a ON a.id = d.admissao_id
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      WHERE d.estado = 'AGUARDANDO_AUDITORIA' AND d.observacao IS NOT NULL
    `)) as unknown as Array<{ admissao_id: string; candidato: string; observacao: string }>;
    const familias: FamiliaFalhaIa[] = ["QUOTA", "CREDENCIAL", "INDISPONIBILIDADE", "DESCONHECIDA"];
    const itens: SinalItem[] = [];
    for (const r of rows) {
      const fam = familias.find((f) => r.observacao === MOTIVO_FALHA_IA[f]);
      if (!fam) continue; // observacao inicial ("aguardando a análise") não é falha classificada.
      itens.push({ admissaoId: r.admissao_id, candidato: r.candidato, detalhe: `falha de sistema: ${fam}` });
    }
    return { chave: "falha-familia", rotulo: "Falha de sistema na auditoria (por família)", total: itens.length, itens };
  }

  // ── Bloco 2: cliente Fopag ATIVO sem pasta-pai mapeada + admissões travadas ─
  private async sinalFopagSemPasta(): Promise<Sinal> {
    // Clientes Fopag com admissão VIVA (o universo onde a lacuna importa).
    const rows = (await this.db.execute(sql`
      SELECT a.cod_cliente, c.nome AS candidato, a.id AS admissao_id
      FROM admissoes a
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      WHERE a.tipo_contrato = 'Fopag' AND a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')
    `)) as unknown as Array<{ cod_cliente: string; candidato: string; admissao_id: string }>;
    const itens: SinalItem[] = [];
    for (const r of rows) {
      if (fopagTemPastaPai(r.cod_cliente)) continue;
      itens.push({
        admissaoId: r.admissao_id,
        candidato: r.candidato,
        detalhe: `cliente ${r.cod_cliente} (Fopag) sem pasta-pai mapeada`,
      });
    }
    return { chave: "fopag-sem-pasta", rotulo: "Cliente Fopag sem pasta-pai no Drive", total: itens.length, itens };
  }

  // ── Bloco 3: dependências externas pelo CAMINHO REAL ────────────────────────
  private async dependencias(): Promise<Dependencia[]> {
    const agora = new Date().toISOString();
    const [banco, filaSt, vertex, drive, pandape] = await Promise.all([
      this.checarBanco(),
      this.fila.statusFila(),
      this.ai.readinessVertex(),
      this.ai.readinessDrive(),
      this.pandapeApi.readiness(),
    ]);

    const deps: Dependencia[] = [];
    deps.push({ nome: "Banco de dados", estado: banco.ok ? "ok" : "fora", detalhe: banco.detalhe, verificadoEm: agora, ...(banco.erro ? { ultimoErro: banco.erro } : {}) });

    // Fila BullMQ: fora se não subiu; degradado se há jobs falhados; ok caso contrário.
    if (!filaSt.disponivel) {
      deps.push({ nome: "Fila (BullMQ)", estado: "fora", detalhe: "fila indisponível (Redis fora no boot)", verificadoEm: agora, ...(filaSt.erro ? { ultimoErro: filaSt.erro } : {}) });
    } else {
      const c = filaSt.contagem!;
      const degr = c.falhados > 0;
      deps.push({
        nome: "Fila (BullMQ)",
        estado: degr ? "degradado" : "ok",
        detalhe: `ativos ${c.ativos}, aguardando ${c.aguardando}, falhados ${c.falhados}, atrasados ${c.atrasados}`,
        verificadoEm: agora,
      });
    }

    deps.push({ nome: "Vertex AI (auditoria)", estado: vertex.ok ? "ok" : "fora", detalhe: vertex.detalhe, verificadoEm: agora, ...(vertex.erro ? { ultimoErro: vertex.erro } : {}) });
    deps.push({ nome: "Google Drive", estado: drive.ok ? "ok" : "fora", detalhe: drive.detalhe + (drive.identidade ? ` (${drive.identidade})` : ""), verificadoEm: agora, ...(drive.erro ? { ultimoErro: drive.erro } : {}) });
    deps.push({ nome: "Pandapé (API)", estado: pandape.estado, detalhe: pandape.detalhe, verificadoEm: agora });
    this.depsCache = { at: Date.now(), deps };
    return deps;
  }

  private async checarBanco(): Promise<{ ok: boolean; detalhe: string; erro?: string }> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { ok: true, detalhe: "consulta respondeu" };
    } catch (err) {
      return { ok: false, detalhe: "banco não respondeu", erro: err instanceof Error ? err.name : "erro" };
    }
  }

  // ── Bloco 4: última coleta do Pandapé (com rótulo honesto) ──────────────────
  private async ultimaColeta() {
    const rows = (await this.db.execute(sql`
      SELECT m.admissao_id, c.nome AS candidato, m.criado_em, cnt.total
      FROM documento_arquivos_coletados m
      JOIN admissoes a ON a.id = m.admissao_id
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      JOIN (SELECT admissao_id, COUNT(*) AS total, MAX(criado_em) AS ult FROM documento_arquivos_coletados GROUP BY admissao_id) cnt
        ON cnt.admissao_id = m.admissao_id
      WHERE m.criado_em = (SELECT MAX(criado_em) FROM documento_arquivos_coletados)
      LIMIT 1
    `)) as unknown as Array<{ candidato: string; criado_em: string; total: number }>;
    const r = rows[0];
    return {
      quando: r ? new Date(r.criado_em).toISOString() : null,
      candidato: r ? r.candidato : null,
      arquivos: r ? Number(r.total) : 0,
      nota: "Quando o EA gravou a última marca de arquivo, NÃO quando o candidato enviou. Com o scheduler ligado, o EA vai buscar em cadência fixa: uma marca antiga aqui pode ser só ausência de arquivo NOVO (nada mudou). O sinal de que a COLETA parou é o card do scheduler (sem ciclo bem-sucedido), não a idade desta marca.",
    };
  }

  // ── Bloco 6: histórico de falhas por família (janela 24h e 7d) ──────────────
  private async historico() {
    // Derivado do estado atual dos documentos em AGUARDANDO_AUDITORIA com motivo de família, pela
    // data do último toque. LIMITE HONESTO: é o que está parado AGORA e entrou na janela, não um
    // livro de eventos completo (documento que falhou e depois resolveu não aparece). Uma tabela de
    // eventos de falha daria o histórico pleno; fica proposto. Janela declarada: 24h e 7d.
    const rows = (await this.db.execute(sql`
      SELECT d.observacao AS observacao, d.atualizado_em AS quando
      FROM documentos_admissao d
      WHERE d.estado = 'AGUARDANDO_AUDITORIA' AND d.observacao IS NOT NULL
    `)) as unknown as Array<{ observacao: string; quando: string }>;
    const familias: FamiliaFalhaIa[] = ["QUOTA", "ENTRADA", "CREDENCIAL", "INDISPONIBILIDADE", "DESCONHECIDA"];
    const agora = Date.now();
    const h24 = agora - 24 * 3_600_000;
    const d7 = agora - 7 * 24 * 3_600_000;
    return familias.map((familia) => {
      let u24 = 0;
      let u7 = 0;
      for (const r of rows) {
        if (r.observacao !== MOTIVO_FALHA_IA[familia]) continue;
        const t = new Date(r.quando).getTime();
        if (t >= h24) u24 += 1;
        if (t >= d7) u7 += 1;
      }
      return { familia, ultimas24h: u24, ultimos7d: u7 };
    });
  }

  /** Tipos com arquivo na staging, por admissão. Lê o filesystem; nome de arquivo NUNCA sai daqui. */
  private async tiposNaStaging(): Promise<Map<string, Set<string>>> {
    const mapa = new Map<string, Set<string>>();
    let dirs: string[];
    try {
      dirs = await readdir(STAGING_DIR);
    } catch {
      return mapa;
    }
    for (const admissaoId of dirs) {
      if (admissaoId.startsWith("_")) continue; // _kits e afins não são admissão.
      try {
        const nomes = await readdir(`${STAGING_DIR}/${admissaoId}`);
        const tipos = new Set(nomes.map((n) => n.split("__")[0]).filter(Boolean));
        if (tipos.size > 0) mapa.set(admissaoId, tipos);
      } catch {
        // não é diretório ou sumiu; ignora.
      }
    }
    return mapa;
  }
}
