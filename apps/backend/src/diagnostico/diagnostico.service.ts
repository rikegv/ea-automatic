import { readdir } from "node:fs/promises";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { AiClientService } from "../ai/ai-client.service";
import { PandapeApiService } from "../pandape/pandape-api.service";
import { PandapeQueueService } from "../pandape/pandape-queue.service";
import { PandapeSchedulerService } from "../pandape/pandape-scheduler.service";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { ReconciliacaoDriveService } from "./reconciliacao-drive.service";
import { MOTIVO_FALHA_IA, type FamiliaFalhaIa } from "../domain/falha-auditoria";
import { LIMIAR_AUDITORIA_PARADA_MS } from "../domain/auditoria-parada";
import { schedulerParado, type EstadoScheduler } from "../domain/scheduler-pandape";
import {
  schedulerParado as schedulerVtParado,
  type EstadoScheduler as EstadoSchedulerVt,
} from "../domain/scheduler-vt-coleta";
import { VtColetaSchedulerService } from "../vt-coleta/vt-coleta-scheduler.service";
import {
  schedulerParado as schedulerClicksignParado,
  type EstadoScheduler as EstadoSchedulerClicksign,
} from "../domain/scheduler-clicksign";
import { ClicksignSchedulerService } from "../clicksign/clicksign-scheduler.service";
import { ExameSchedulerService } from "../esteira/exame-scheduler.service";
import { schedulerParado as schedulerExameParado } from "../domain/scheduler-exame";
import {
  calcularAlerta,
  type Dependencia,
  type DiagnosticoSnapshot,
  type EstadoSchedulerClicksignSnapshot,
  type EstadoSchedulerExameSnapshot,
  type EstadoSchedulerSnapshot,
  type EstadoSchedulerVtColetaSnapshot,
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
    private readonly vtColetaScheduler: VtColetaSchedulerService,
    private readonly clicksignScheduler: ClicksignSchedulerService,
    private readonly exameScheduler: ExameSchedulerService,
    private readonly drivePastaPai: DrivePastaPaiService,
    private readonly reconciliacao: ReconciliacaoDriveService,
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
    // RECONCILIAÇÃO AUTOMÁTICA (decisão do diretor: quem resolve é o sistema, não o diretor). Abrir
    // a tela É o gatilho: antes de montar os cards, o sistema confere o Drive e apaga sozinho o que
    // já está resolvido (pasta duplicada que o diretor apagou, prontuário que existe e o EA não
    // sabia). Tem throttle de 5 minutos por dentro e nunca derruba a tela se falhar.
    await this.reconciliacao.reconciliarSeVencido();
    const [
      pendenteStaging,
      reguaSemPasta,
      paradoAlem6h,
      falhasPorFamilia,
      fopagSemPasta,
      driveVtSemCasar,
      envelopesExpirados,
      arquivamentoFalhou,
      pastaDuplicada,
      estadoScheduler,
      estadoVtColeta,
      estadoClicksign,
      estadoExame,
      esperaExame,
    ] = await Promise.all([
      this.sinalPendenteComStaging(),
      this.sinalReguaFechadaSemPasta(),
      this.sinalParadoAlemLimiar(),
      this.sinalFalhasPorFamilia(),
      this.sinalFopagSemPasta(),
      this.sinalDriveVtSemCasar(),
      this.sinalEnvelopesExpirados(),
      this.sinalArquivamentoDriveFalhou(),
      this.sinalPastaDuplicada(),
      this.scheduler.estado(),
      this.vtColetaScheduler.estado(),
      this.clicksignScheduler.estado(),
      this.exameScheduler.estado(),
      this.exameScheduler.contagemEspera(),
    ]);

    const parado = schedulerParado(estadoScheduler, Date.now());
    const sinais = [
      pendenteStaging,
      reguaSemPasta,
      paradoAlem6h,
      falhasPorFamilia,
      driveVtSemCasar,
      envelopesExpirados,
      arquivamentoFalhou,
      pastaDuplicada,
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
      vtColeta: this.blocoSchedulerVtColeta(estadoVtColeta),
      clicksign: this.blocoSchedulerClicksign(estadoClicksign),
      exame: this.blocoSchedulerExame(estadoExame, esperaExame),
      alerta,
    };
  }

  /** Bloco do scheduler da assinatura (INT-4): estado + resultado do último ciclo. */
  private blocoSchedulerClicksign(
    estado: EstadoSchedulerClicksign,
  ): EstadoSchedulerClicksignSnapshot {
    return {
      ligado: estado.ligado,
      parado: schedulerClicksignParado(estado, Date.now()),
      ultimoCicloEm: estado.ultimoCicloEm,
      ultimoCicloOkEm: estado.ultimoCicloOkEm,
      varridas: estado.varridas,
      assinados: estado.assinados,
      expirados: estado.expirados,
      falhas: estado.falhas,
      nota: estado.nota,
    };
  }

  /**
   * Sinal ENVELOPE EXPIRADO (INT-4): contratos que passaram do prazo de assinatura sem fechar. Não é
   * falha de sistema, é trabalho parado: o candidato não assinou e alguém precisa reenviar. Entra
   * aqui porque, sem sinal, o registro EXPIRADO ficaria invisível fora da tela de assinaturas.
   * §A.6: nome do candidato para identificar (como os demais sinais), nunca CPF.
   */
  private async sinalEnvelopesExpirados(): Promise<Sinal> {
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato
      FROM admissoes a
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      WHERE a.clicksign_status = 'EXPIRADO'
      ORDER BY a.atualizado_em DESC
      LIMIT 50
    `)) as unknown as LinhaAfetada[];
    const itens: SinalItem[] = rows.map((r) => ({
      admissaoId: r.admissao_id,
      candidato: r.candidato,
      detalhe: "envelope expirado sem assinatura: exige reenvio",
    }));
    return {
      chave: "envelope-expirado",
      rotulo: "Envelope de assinatura expirado",
      total: itens.length,
      itens,
    };
  }

  /**
   * Sinal ARQUIVAMENTO NO DRIVE FALHOU (OST re-baixar do Pandapé, item 4). É o fim do silêncio.
   *
   * O caso real que o originou: régua fechada, frente em "Análise Finalizada" na tela e prontuário
   * inexistente no Drive, sem uma linha de aviso em lugar nenhum. Três admissões ficaram assim e só
   * apareceram por conferência manual. Agora todo desfecho que não conclui grava o MOTIVO REAL em
   * `admissoes.drive_falha_motivo`, e este sinal expõe candidata + motivo.
   *
   * Cobre também o prontuário que subiu INCOMPLETO (o motivo permanece mesmo com a pasta criada), que
   * é justamente o caso em que a pasta existir esconderia o problema.
   *
   * §A.6: nome do candidato para identificar (como os demais sinais) e o texto do motivo, que é
   * escrito com código de tipo de documento, nunca com CPF, arquivo ou URL.
   */
  private async sinalArquivamentoDriveFalhou(): Promise<Sinal> {
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato, a.drive_falha_motivo AS detalhe,
             EXTRACT(EPOCH FROM (now() - a.drive_falha_em)) / 3600 AS horas
      FROM admissoes a
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      WHERE a.drive_falha_motivo IS NOT NULL
      ORDER BY a.drive_falha_em DESC
      LIMIT 50
    `)) as unknown as LinhaAfetada[];
    return {
      chave: "arquivamento-drive-falhou",
      rotulo: "Arquivamento No Drive Falhou",
      total: rows.length,
      itens: rows.map((r) => ({
        admissaoId: r.admissao_id,
        candidato: r.candidato,
        detalhe: r.detalhe ?? "arquivamento não concluído",
        ...(r.horas !== undefined && r.horas !== null ? { horas: Math.floor(r.horas) } : {}),
      })),
    };
  }

  /**
   * Bloco do VERIFICADOR DO EXAME (OST Onda 2): estado do loop + o que ele fez no último ciclo + o
   * tamanho ATUAL de cada fila de espera, que é o número sobre o qual o time age.
   */
  private blocoSchedulerExame(
    estado: Awaited<ReturnType<ExameSchedulerService["estado"]>>,
    espera: { aguardando: number; pendentes: number },
  ): EstadoSchedulerExameSnapshot {
    return {
      ligado: estado.ligado,
      parado: schedulerExameParado(estado, Date.now()),
      ultimoCicloEm: estado.ultimoCicloEm,
      ultimoCicloOkEm: estado.ultimoCicloOkEm,
      varridas: estado.varridas,
      aguardando: estado.aguardando,
      pendentes: estado.pendentes,
      falhas: estado.falhas,
      nota: estado.nota,
      totalAguardando: espera.aguardando,
      totalPendentes: espera.pendentes,
    };
  }

  /** Bloco do scheduler da coleta de VT (§A.17 etapa 3): estado + resultado do último ciclo. */
  private blocoSchedulerVtColeta(estado: EstadoSchedulerVt): EstadoSchedulerVtColetaSnapshot {
    return {
      ligado: estado.ligado,
      parado: schedulerVtParado(estado, Date.now()),
      ultimoCicloEm: estado.ultimoCicloEm,
      ultimoCicloOkEm: estado.ultimoCicloOkEm,
      varridas: estado.varridas,
      novos: estado.novos,
      semAdmissao: estado.semAdmissao,
      falhas: estado.falhas,
      abortado: estado.abortado,
      nota: estado.nota,
    };
  }

  /**
   * Sinal VT SEM CASAR (§A.17 etapa 3): arquivos de VT no bucket coletivo que não casaram com
   * uma admissão viva (sem admissão, múltiplo ou nome fora do padrão). §A.6: como o nome do objeto
   * (NOME+CPF) nunca é persistido, cada item leva SÓ um prefixo do md5 e o rótulo do status, NUNCA
   * CPF/nome/arquivo. O admin localiza o arquivo navegando o bucket pelo digest.
   */
  private async sinalDriveVtSemCasar(): Promise<Sinal> {
    const rows = (await this.db.execute(sql`
      SELECT md5, status FROM vt_coleta
      WHERE status IN ('SEM_ADMISSAO', 'MULTIPLO', 'NOME_FORA_PADRAO')
    `)) as unknown as Array<{ md5: string | null; status: string }>;
    const rotulo: Record<string, string> = {
      SEM_ADMISSAO: "sem admissão viva para o CPF",
      MULTIPLO: "mais de uma admissão viva para o CPF",
      NOME_FORA_PADRAO: "nome do arquivo fora do padrão (CPF não identificado)",
    };
    const itens: SinalItem[] = rows.map((r) => ({
      detalhe: rotulo[r.status] ?? r.status,
      md5Prefixo: r.md5 ? r.md5.slice(0, 12) : undefined,
    }));
    return {
      chave: "drive-vt-sem-casar",
      rotulo: "Formulário de VT no bucket sem casar com admissão",
      total: itens.length,
      itens,
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
    const [a, b, c, d, fopag, vtSemCasar, arquivamentoFalhou, estadoScheduler] = await Promise.all([
      this.sinalPendenteComStaging(),
      this.sinalReguaFechadaSemPasta(),
      this.sinalParadoAlemLimiar(),
      this.sinalFalhasPorFamilia(),
      this.sinalFopagSemPasta(),
      this.sinalDriveVtSemCasar(),
      this.sinalArquivamentoDriveFalhou(),
      this.scheduler.estado(),
    ]);
    const sched = this.sinalScheduler(schedulerParado(estadoScheduler, Date.now()));
    // Dependências do cache (se houver): o badge reflete "fora do ar" sem pagar a checagem cara a
    // cada poll. Sem cache ainda (nenhum snapshot rodou), o badge acende só pelos sinais de banco.
    const depsCacheadas =
      this.depsCache && Date.now() - this.depsCache.at < DiagnosticoService.DEPS_TTL_MS
        ? this.depsCache.deps
        : [];
    return calcularAlerta([a, b, c, d, vtSemCasar, arquivamentoFalhou, sched], fopag, depsCacheadas);
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

  /**
   * PASTA DUPLICADA NO DRIVE (OST da duplicação). Lista as admissões em que o arquivamento achou
   * mais de uma pasta com o nome do prontuário e teve de escolher uma.
   *
   * A escolha não trava nada: o sistema liga na pasta MAIS COMPLETA e segue. Este sinal existe
   * porque o que sobrou precisa de mão humana: o módulo do Drive não apaga (§A.6), então a remoção
   * (ou a consolidação, quando as duas têm documento) é do diretor. Sai da lista sozinho quando ele
   * apaga a pasta extra e o próximo arquivamento não encontra mais duplicata.
   *
   * SAI TAMBÉM QUANDO O DIRETOR BAIXA O SINAL pela tela ("Zerar sinal"), que é o caso de ele decidir
   * conviver com as pastas e removê-las à mão depois. Aí o id migra para `drive_duplicatas_baixadas`
   * e esta consulta deixa de vê-lo: a pasta segue no Drive, o aviso é que fica quieto. Duplicata
   * NOVA acende normalmente, porque sobre ela ninguém decidiu nada.
   */
  private async sinalPastaDuplicada(): Promise<Sinal> {
    const rows = (await this.db.execute(sql`
      SELECT a.id AS admissao_id, c.nome AS candidato, a.drive_duplicatas
        FROM admissoes a
        JOIN candidatos c ON c.cpf = a.candidato_cpf
       WHERE a.drive_duplicatas IS NOT NULL AND a.drive_duplicatas <> ''
       ORDER BY a.atualizado_em DESC
    `)) as unknown as Array<LinhaAfetada & { drive_duplicatas: string }>;
    return {
      chave: "pasta-duplicada",
      rotulo: "Pasta duplicada no Drive",
      total: rows.length,
      itens: rows.map((r) => {
        const ids = r.drive_duplicatas.split(",").filter(Boolean);
        return {
          admissaoId: r.admissao_id,
          candidato: r.candidato,
          detalhe: `${ids.length} pasta(s) extra(s) para apagar: ${ids.join(", ")}`,
        };
      }),
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
  /**
   * CLIENTE INATIVO NÃO ACENDE O SINAL (decisão do diretor).
   *
   * O sinal estava cobrando pasta-pai de cliente com quem a Soulan não tem mais relacionamento e que
   * já foi inativado no cadastro. Pendência operacional só faz sentido para cliente ATIVO, então a
   * fonte da verdade passa a ser o CADASTRO: `clientes.ativo`.
   *
   * Os dois blocos recebem o filtro, mas quem estava sujo era o segundo: no momento da mudança, o
   * bloco por admissão viva tinha 19 itens, todos de cliente ativo, e o bloco por vínculo tinha 27,
   * dos quais 9 de cliente INATIVO. São esses 9 que somem.
   */
  private async sinalFopagSemPasta(): Promise<Sinal> {
    // Clientes Fopag com admissão VIVA (o universo onde a lacuna importa).
    const rows = (await this.db.execute(sql`
      SELECT a.cod_cliente, c.nome AS candidato, a.id AS admissao_id
      FROM admissoes a
      JOIN candidatos c ON c.cpf = a.candidato_cpf
      JOIN clientes cli ON cli.cod_cliente = a.cod_cliente
      WHERE a.tipo_contrato = 'Fopag' AND a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')
        AND cli.ativo = true
    `)) as unknown as Array<{ cod_cliente: string; candidato: string; admissao_id: string }>;
    const itens: SinalItem[] = [];
    for (const r of rows) {
      if (await this.drivePastaPai.fopagTemPastaPai(r.cod_cliente)) continue;
      itens.push({
        admissaoId: r.admissao_id,
        candidato: r.candidato,
        detalhe: `cliente ${r.cod_cliente} (Fopag) sem pasta-pai mapeada`,
      });
    }
    // VÍNCULO FOPAG SEM PASTA (OST Onda 3, item 7, Bloco 4). O bloco acima só enxerga a lacuna
    // quando JÁ existe admissão viva, ou seja, quando o problema já está atrapalhando alguém. Com o
    // vínculo, o cadastro do contrato Fopag acontece ANTES da primeira admissão, e é aí que o
    // diretor quer ser avisado: acende no Diagnóstico e não bloqueia o cadastro (decisão do diretor).
    const vinculosFopag = (await this.db.execute(sql`
      SELECT v.cod_cliente, cli.razao_social
      FROM cliente_vinculos v
      JOIN clientes cli ON cli.cod_cliente = v.cod_cliente
      -- Dois "ativo" diferentes, de propósito: v.ativo é o VÍNCULO Fopag em vigor, cli.ativo é o
      -- CADASTRO do cliente. Um vínculo pode continuar marcado como ativo num cliente que a Soulan já
      -- encerrou, e era exatamente por aí que o inativo entrava na fila.
      WHERE v.tipo_servico = 'FOPAG' AND v.ativo = true
        AND cli.ativo = true
    `)) as unknown as Array<{ cod_cliente: string; razao_social: string }>;
    const jaListados = new Set(itens.map((i) => i.detalhe));
    for (const v of vinculosFopag) {
      if (await this.drivePastaPai.fopagTemPastaPai(v.cod_cliente)) continue;
      const detalhe = `vínculo Fopag do cliente ${v.cod_cliente} (${v.razao_social}) sem pasta-pai mapeada`;
      if (jaListados.has(detalhe)) continue;
      // Sem `admissaoId`: o alerta é do CADASTRO, não de uma admissão. §A.6: só código e razão social.
      itens.push({ candidato: v.razao_social, detalhe });
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
