import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { and, asc, eq, inArray } from "drizzle-orm";
import type IORedis from "ioredis";
import { AiClientService, type ItemColetaVt } from "../ai/ai-client.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissaoOperavelSql } from "../db/admissao-filtros";
import { admissaoOperavel } from "../domain/admissao";
import {
  admissoes,
  candidatos,
  clientes,
  documentosAdmissao,
  reguaDocumental,
  tiposDocumento,
  usuarios,
  vtColeta,
} from "../db/schema";
import { montarNomePasta, resolvePastaPaiId } from "../ai/drive-routing";
import {
  agregarCiclo,
  type ResumoItemColeta,
  type StatusColeta,
} from "../domain/scheduler-vt-coleta";
import {
  criarConexaoRedis,
  JOB_SCAN_ADMISSAO,
  JOB_SCAN_TICK,
  VT_COLETA_QUEUE,
  VT_COLETA_WORKER_OPTIONS,
  type ScanAdmissaoJobData,
} from "./vt-coleta.queue";
import { VtColetaSchedulerService } from "./vt-coleta-scheduler.service";

/** Código do tipo de documento do formulário de VT (§A.17). */
const CODIGO_VT = "FORMULARIO_VT";

/** Origem da fonte da coleta, parte da chave de idempotência do ledger (par com o md5). */
const ORIGEM = "GCS";

/** Observação gravada na baixa do documento (§A.11: sem travessão). */
const OBSERVACAO_BAIXA_VT = "Recebido via coleta de formulário de VT";

// A cópia local de `FAROIS_VIVOS` saiu daqui (OST admissão pausada, Bloco 2): a régua dos
// automáticos passou a ser `admissaoOperavel`/`admissaoOperavelSql`, que soma "não pausada" ao
// "farol vivo". Era uma de três cópias, e a duplicação é o que fazia processo novo nascer com o
// recorte errado.

/** Admissão viva candidata ao casamento (só o necessário para arquivar e dar baixa; sem CPF). */
interface AdmissaoMatch {
  id: string;
  codCliente: string | null;
  cargoId: string | null;
  tipoContrato: string | null;
  candidatoNome: string;
  clienteOperacao: string | null;
}

/** Resumo devolvido pela varredura direcionada (o "buscar VT" da ficha). */
export interface ResumoScanAdmissao {
  encontrados: number;
  arquivado: boolean;
  deuBaixa: boolean;
  status: StatusColeta | "SEM_ARQUIVO" | "PASTA_NAO_CONFIGURADA" | "ADMISSAO_NAO_VIVA";
}

/**
 * NÚCLEO da coleta de formulário de VT (§A.17 etapa 3 / INT-2) + o Worker BullMQ (consumidor).
 *
 * Um app externo (Firebase) deposita os PDFs de VT num bucket coletivo do GCS. Esta varredura
 * (periódica e sob demanda) casa cada PDF a uma admissão viva pelo CPF do nome do objeto, arquiva na
 * subpasta BENEFICIOS do prontuário e, quando o FORMULARIO_VT está na régua daquela admissão, dá
 * baixa (marca ENTREGUE e reavalia a régua pelo MESMO pós-veredito da IA/validação humana).
 *
 * §A.6: o CPF, o nome do objeto (NOME+CPF) e o md5 NUNCA são logados; o nome do objeto é um handle
 * TRANSITÓRIO usado só para a baixa e nunca persistido. O ledger guarda só md5 (dedup) + origem
 * ("GCS") + vínculo com a admissão. A URL/binário não trafega por aqui (o ai-service baixa para a
 * staging e devolve só o caminho).
 */
@Injectable()
export class VtColetaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("VtColetaService");
  private worker?: Worker;
  private connection?: IORedis;
  private avisoInerteEmitido = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly ai: AiClientService,
    private readonly auditoria: AuditoriaService,
    private readonly scheduler: VtColetaSchedulerService,
  ) {}

  // ── Worker lifecycle (consumidor) ─────────────────────────────────────────
  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoRedis(host, port);
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (worker coleta VT) com erro: ${err.message}`);
      });
      this.worker = new Worker(VT_COLETA_QUEUE, async (job: Job) => this.processarJob(job), {
        connection: this.connection,
        ...VT_COLETA_WORKER_OPTIONS,
      });
      this.worker.on("failed", (job, err) => {
        this.logger.warn(`Job ${job?.name ?? "?"} falhou (será retentado): ${err.message}`);
      });
      this.logger.log("Worker vt-coleta-scan inicializado.");
    } catch (err) {
      this.logger.warn(
        `Worker vt-coleta-scan indisponível no boot (segue sem derrubar o app): ${
          err instanceof Error ? err.message : "erro"
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.connection?.quit().catch(() => undefined);
  }

  /** Roteia o job para o handler certo. */
  private async processarJob(job: Job): Promise<ResumoScanAdmissao | void> {
    if (job.name === JOB_SCAN_TICK) {
      await this.rodarCiclo();
      return;
    }
    if (job.name === JOB_SCAN_ADMISSAO) {
      const { admissaoId } = job.data as ScanAdmissaoJobData;
      return this.rodarParaAdmissao(admissaoId);
    }
  }

  // ── Ciclo periódico ──────────────────────────────────────────────────────
  /**
   * UM ciclo de varredura do bucket coletivo. Roda NO WORKER (concorrência 1, sob o limiter). Sem o
   * bucket configurado (`VT_COLETA_GCS_BUCKET`), a integração é INERTE: bate o heartbeat com nota e
   * não faz nada (mesmo padrão da integração Pandapé sem token). Um item que lança NÃO derruba o
   * ciclo: vira ledger ERRO e a varredura segue.
   */
  async rodarCiclo(): Promise<void> {
    // Re-checa o liga/desliga: o toggle pode ter virado entre o enfileiramento e a execução.
    if (!(await this.scheduler.estaLigado())) {
      this.logger.log("Ciclo da coleta de VT ignorado: DESLIGADO.");
      return;
    }
    await this.scheduler.marcarInicioCiclo();

    const bucket = this.bucketColetivo();
    if (!bucket) {
      if (!this.avisoInerteEmitido) {
        this.logger.log("Coleta de VT inerte: VT_COLETA_GCS_BUCKET não configurado.");
        this.avisoInerteEmitido = true;
      }
      await this.scheduler.registrarCiclo({
        varridas: 0,
        novos: 0,
        semAdmissao: 0,
        falhas: 0,
        abortado: false,
        nota: "bucket coletivo não configurado",
      });
      return;
    }

    const { arquivos } = await this.ai.listarColetaVt(bucket);
    const resumos: ResumoItemColeta[] = [];
    for (const item of arquivos) {
      try {
        resumos.push(await this.processarItem(item));
      } catch (err) {
        // Falha de UM item não derruba o ciclo. §A.6: sem CPF/nome/md5 no log.
        this.logger.warn(
          `Coleta de VT: falha ao processar um arquivo (segue): ${
            err instanceof Error ? err.message : "erro"
          }`,
        );
        await this.upsertLedger(this.chaveLedger(item), {
          status: "ERRO",
        }).catch(() => undefined);
        resumos.push({ status: "ERRO", novo: false });
      }
    }

    const agg = agregarCiclo(resumos);
    const nota = arquivos.length === 0 ? "bucket coletivo vazio" : null;
    await this.scheduler.registrarCiclo({
      varridas: agg.varridas,
      novos: agg.novos,
      semAdmissao: agg.semAdmissao,
      falhas: agg.falhas,
      abortado: false,
      nota,
    });
    this.logger.log(
      `Ciclo da coleta de VT concluído: varridas=${agg.varridas}, novos=${agg.novos}, ` +
        `semAdmissao=${agg.semAdmissao}, ignorados=${agg.ignorados}, falhas=${agg.falhas}.`,
    );
  }

  // ── Processamento de um item ─────────────────────────────────────────────
  /**
   * Processa UM arquivo da pasta coletiva. Idempotente: um md5 já CASADO é pulado sem re-arquivar.
   * SEM_ADMISSAO fica no ledger e é reavaliado no próximo ciclo (o candidato pode nascer depois).
   */
  async processarItem(item: ItemColetaVt): Promise<ResumoItemColeta> {
    const chave = this.chaveLedger(item);

    if (!item.ehPdf) {
      await this.upsertLedger(chave, { status: "NAO_PDF" });
      return { status: "NAO_PDF", novo: false };
    }

    const cpf = (item.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      await this.upsertLedger(chave, { status: "NOME_FORA_PADRAO" });
      return { status: "NOME_FORA_PADRAO", novo: false };
    }

    // Idempotência: já casado antes → não reprocessa, não re-arquiva.
    const jaProcessado = await this.buscarLedgerStatus(chave);
    if (jaProcessado === "CASADO") {
      return { status: "CASADO", novo: false, jaProcessado: true };
    }

    const matches = await this.buscarMatches(cpf);
    if (matches.length === 0) {
      await this.upsertLedger(chave, { status: "SEM_ADMISSAO" });
      return { status: "SEM_ADMISSAO", novo: false };
    }
    if (matches.length > 1) {
      await this.upsertLedger(chave, { status: "MULTIPLO" });
      return { status: "MULTIPLO", novo: false };
    }

    return this.processarMatch(item, matches[0]);
  }

  /**
   * Casou com UMA admissão: baixa para a staging, arquiva na subpasta BENEFICIOS e, se o FORMULARIO_VT
   * está na régua daquela admissão, dá baixa. Sem pasta-pai do Drive (contrato/cliente não mapeado) →
   * ledger ERRO e segue (nada é arquivado, o objeto permanece no bucket coletivo para o próximo ciclo).
   */
  async processarMatch(item: ItemColetaVt, adm: AdmissaoMatch): Promise<ResumoItemColeta> {
    const chave = this.chaveLedger(item);

    const parentFolderId = resolvePastaPaiId(adm.tipoContrato, adm.codCliente);
    if (!parentFolderId) {
      this.logger.warn(
        `Coleta de VT: sem pasta-pai do Drive para o contrato/cliente da admissão ${adm.id}; arquivo não arquivado.`,
      );
      await this.upsertLedger(chave, {
        status: "ERRO",
        admissaoId: adm.id,
      });
      return { status: "ERRO", novo: false };
    }

    const tipoVt = await this.carregarTipoVt();
    const nomeVt = tipoVt?.nome ?? CODIGO_VT;

    // `item.id` (nome do objeto) é PII e transitório: usado SÓ aqui, para a baixa; nunca persistido.
    const { stagingPath } = await this.ai.baixarColetaVt(this.bucketColetivo(), item.id);
    await this.ai.arquivarDrive({
      parentFolderId,
      pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
      arquivos: [
        {
          stagingPath,
          nomeFinal: `${nomeVt}_${adm.candidatoNome.toUpperCase()}`,
          subpasta: "BENEFICIOS",
        },
      ],
    });

    // Baixa SÓ se o VT está na régua (cliente+cargo) da admissão. Fora da régua: apenas arquivado,
    // sem criar pendência/documento (decisão do diretor).
    let vtNaRegua = false;
    let deuBaixa = false;
    if (tipoVt && (await this.vtEstaNaRegua(adm.codCliente, adm.cargoId, tipoVt.id))) {
      vtNaRegua = true;
      await this.darBaixaVt(adm.id, tipoVt.id);
      deuBaixa = true;
    }

    await this.upsertLedger(chave, {
      status: "CASADO",
      admissaoId: adm.id,
      vtNaRegua,
      arquivadoEm: new Date(),
    });
    this.logger.log(
      `Coleta de VT: arquivo casado e arquivado (admissão ${adm.id}, baixa=${deuBaixa ? "sim" : "não"}).`,
    );
    return { status: "CASADO", novo: true, arquivado: true, deuBaixa };
  }

  // ── Varredura direcionada (o "buscar VT" da ficha) ────────────────────────
  /**
   * Varredura de UMA admissão (manual). Lista o bucket coletivo e processa SÓ os arquivos cujo CPF
   * casa com o candidato desta admissão, reusando o MESMO `processarItem` (sem segundo caminho).
   */
  async rodarParaAdmissao(admissaoId: string): Promise<ResumoScanAdmissao> {
    const bucket = this.bucketColetivo();
    if (!bucket) {
      return { encontrados: 0, arquivado: false, deuBaixa: false, status: "PASTA_NAO_CONFIGURADA" };
    }

    const cpf = await this.cpfDaAdmissaoViva(admissaoId);
    if (!cpf) {
      return { encontrados: 0, arquivado: false, deuBaixa: false, status: "ADMISSAO_NAO_VIVA" };
    }

    const { arquivos } = await this.ai.listarColetaVt(bucket);
    const doCandidato = arquivos.filter((it) => (it.cpf ?? "").replace(/\D/g, "") === cpf);

    let arquivado = false;
    let deuBaixa = false;
    let status: ResumoScanAdmissao["status"] = "SEM_ARQUIVO";
    for (const item of doCandidato) {
      const r = await this.processarItem(item);
      if (r.arquivado) arquivado = true;
      if (r.deuBaixa) deuBaixa = true;
      status = r.status;
    }
    return { encontrados: doCandidato.length, arquivado, deuBaixa, status };
  }

  // ── Acessos ao banco (isolados para o teste poder espiá-los) ──────────────
  /** Admissões VIVAS deste CPF (o universo do casamento). Sem CPF na saída (§A.6). */
  async buscarMatches(cpf: string): Promise<AdmissaoMatch[]> {
    const rows = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
        tipoContrato: admissoes.tipoContrato,
        candidatoNome: candidatos.nome,
        clienteOperacao: clientes.nomeOperacao,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      // PAUSA (ponto 2 dos 6): admissão pausada sai do casamento da coleta de VT.
      .where(and(eq(admissoes.candidatoCpf, cpf), admissaoOperavelSql()));
    return rows.map((r) => ({
      id: r.id,
      codCliente: r.codCliente,
      cargoId: r.cargoId,
      tipoContrato: r.tipoContrato,
      candidatoNome: r.candidatoNome,
      clienteOperacao: r.clienteOperacao,
    }));
  }

  /** Status atual do ledger para este (md5, origem) (ou undefined se nunca visto). */
  async buscarLedgerStatus(chave: string): Promise<string | undefined> {
    const row = await this.db.query.vtColeta.findFirst({
      where: and(eq(vtColeta.md5, chave), eq(vtColeta.origem, ORIGEM)),
    });
    return row?.status;
  }

  /** Tipo FORMULARIO_VT do catálogo (id para a baixa, nome para o arquivo). undefined se ausente. */
  async carregarTipoVt(): Promise<{ id: string; nome: string } | undefined> {
    const t = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.codigo, CODIGO_VT),
    });
    return t ? { id: t.id, nome: t.nome } : undefined;
  }

  /** O FORMULARIO_VT está na régua (cliente+cargo), como OBRIGATORIO ou FACULTATIVO? */
  async vtEstaNaRegua(
    codCliente: string | null,
    cargoId: string | null,
    tipoDocumentoId: string,
  ): Promise<boolean> {
    if (!codCliente || !cargoId) return false;
    const rows = await this.db
      .select({ e: reguaDocumental.exigencia })
      .from(reguaDocumental)
      .where(
        and(
          eq(reguaDocumental.codCliente, codCliente),
          eq(reguaDocumental.cargoId, cargoId),
          eq(reguaDocumental.tipoDocumentoId, tipoDocumentoId),
          inArray(reguaDocumental.exigencia, ["OBRIGATORIO", "FACULTATIVO"]),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Dá baixa no FORMULARIO_VT: marca ENTREGUE (com autor SISTEMA) e reavalia a régua pelo MESMO
   * pós-veredito da IA/validação humana (`aplicarPosVeredito`), que fecha a Auditoria e arquiva se a
   * régua completar. Sem usuário sistema no banco, a baixa é adiada (não quebra o arquivamento).
   */
  async darBaixaVt(admissaoId: string, tipoDocumentoId: string): Promise<void> {
    const user = await this.resolverUsuarioSistema();
    if (!user) {
      this.logger.warn("Sem usuário sistema para dar baixa no VT; baixa adiada (arquivo já arquivado).");
      return;
    }
    const agora = new Date();
    await this.db
      .insert(documentosAdmissao)
      .values({
        admissaoId,
        tipoDocumentoId,
        estado: "ENTREGUE",
        observacao: OBSERVACAO_BAIXA_VT,
        validadoPorId: user.id,
        validadoEm: agora,
      })
      .onConflictDoUpdate({
        target: [documentosAdmissao.admissaoId, documentosAdmissao.tipoDocumentoId],
        set: {
          estado: "ENTREGUE",
          observacao: OBSERVACAO_BAIXA_VT,
          validadoPorId: user.id,
          validadoEm: agora,
          atualizadoEm: agora,
        },
      });
    await this.auditoria.aplicarPosVeredito(admissaoId, user);
  }

  /** CPF (11 dígitos) do candidato de uma admissão VIVA e não pausada, ou undefined (§A.6). */
  async cpfDaAdmissaoViva(admissaoId: string): Promise<string | undefined> {
    const rows = await this.db
      .select({
        cpf: admissoes.candidatoCpf,
        farol: admissoes.farolGlobal,
        pausadaEm: admissoes.pausadaEm,
      })
      .from(admissoes)
      .where(eq(admissoes.id, admissaoId))
      .limit(1);
    const row = rows[0];
    if (!row) return undefined;
    // PAUSA (ponto 2 dos 6, segundo ponto): mesma régua do casamento, agora pelo predicado puro.
    if (!admissaoOperavel(row.farol, row.pausadaEm)) return undefined;
    const cpf = (row.cpf ?? "").replace(/\D/g, "");
    return cpf.length === 11 ? cpf : undefined;
  }

  /**
   * Upsert do ledger pela chave (md5, origem). §A.6: grava só md5/origem/status/admissão, NUNCA
   * CPF/nome/nome-de-objeto (o nome do objeto no bucket contém NOME+CPF e jamais é persistido).
   */
  async upsertLedger(
    chave: string,
    dados: {
      status: StatusColeta;
      admissaoId?: string | null;
      vtNaRegua?: boolean | null;
      arquivadoEm?: Date | null;
    },
  ): Promise<void> {
    const agora = new Date();
    const linha = {
      md5: chave,
      origem: ORIGEM,
      status: dados.status,
      admissaoId: dados.admissaoId ?? null,
      vtNaRegua: dados.vtNaRegua ?? null,
      arquivadoEm: dados.arquivadoEm ?? null,
    };
    await this.db
      .insert(vtColeta)
      .values(linha)
      .onConflictDoUpdate({
        target: [vtColeta.md5, vtColeta.origem],
        set: {
          status: linha.status,
          admissaoId: linha.admissaoId,
          vtNaRegua: linha.vtNaRegua,
          arquivadoEm: linha.arquivadoEm,
          atualizadoEm: agora,
        },
      });
  }

  /**
   * "Usuário sistema" para a baixa automatizada (a baixa grava um evento de frente com autor FK).
   * Prefere SUPER_ADMIN, senão o mais antigo ativo. Não há usuário sintético (mesma regra do Pandapé).
   */
  async resolverUsuarioSistema(): Promise<AuthUser | undefined> {
    const superAdmin = await this.db.query.usuarios.findFirst({
      where: eq(usuarios.papel, "SUPER_ADMIN"),
      orderBy: asc(usuarios.criadoEm),
    });
    const u =
      superAdmin ??
      (await this.db.query.usuarios.findFirst({
        where: eq(usuarios.ativo, true),
        orderBy: asc(usuarios.criadoEm),
      }));
    if (!u) return undefined;
    return { id: u.id, email: u.email, papel: u.papel, senhaTemporaria: u.senhaTemporaria };
  }

  // ── Auxiliares puros ───────────────────────────────────────────────────────
  /**
   * Identidade do arquivo no ledger: o md5 (digest hex). O nome do objeto NÃO é usado como fallback
   * (contém NOME+CPF, §A.6); no GCS o md5 vem sempre. Objeto sem md5 fica com chave vazia e é dedup
   * por (`""`, origem), sem jamais persistir o nome do objeto.
   */
  private chaveLedger(item: ItemColetaVt): string {
    return item.md5 ?? "";
  }

  /** Nome do bucket coletivo do GCS (env). Vazio/ausente → integração inerte. */
  private bucketColetivo(): string {
    return (this.config.get<string>("VT_COLETA_GCS_BUCKET") ?? "").trim();
  }
}
