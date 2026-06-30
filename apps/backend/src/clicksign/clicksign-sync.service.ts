import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";
import type IORedis from "ioredis";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, clientes, duplaCorrecaoAceites, frentesAdmissao } from "../db/schema";
import { AiClientService, type ArquivoDrive } from "../ai/ai-client.service";
import { montarNomePasta, resolvePastaPaiId } from "../ai/drive-routing";
import { recomputeFarolGlobal } from "../admissoes/farol";
import type { EstadoFrente } from "../domain/frentes";
import { kitLiberado } from "../domain/frentes";
import { KitService } from "../kit/kit.service";
import { StagingService } from "../staging/staging.service";
import { criarConexaoRedis } from "../pandape/pandape.queue";
import { ClicksignApiService } from "./clicksign-api.service";
import { ClicksignQueueService } from "./clicksign-queue.service";

/**
 * Termo de ciência da DUPLA CORREÇÃO (§A.5 / §A.6). Bloqueio ativo com aceite explícito: o consultor
 * declara que corrigiu no EA Automatic E diretamente no G.I — porque o envio Pandapé→G.I é único e
 * irreversível, não se corrige pelo Pandapé. É controle por responsabilização, não verificação
 * técnica; o aceite vira log permanente e consultável (duplaCorrecaoAceites).
 */
export const TERMO_DUPLA_CORRECAO =
  "Declaro que corrigi os dados no EA Automatic E diretamente no G.I. Estou ciente de que o envio " +
  "Pandapé → G.I é único e irreversível — a correção não pode ser feita pelo Pandapé.";
import {
  CLICKSIGN_QUEUE,
  CLICKSIGN_WORKER_OPTIONS,
  JOB_CRIAR_ENVELOPE,
  JOB_POLL_TICK,
  type CriarEnvelopeJobData,
} from "./clicksign.queue";

/**
 * Lógica da assinatura Clicksign (INT-4 / F9) + o Worker BullMQ (consumidor). Dois fluxos:
 *
 *  a) criarEnvelope: a partir do kit já materializado na staging (KitService), monta o envelope
 *     (criar → anexar doc → signer com CPF mascarado → 2 requirements → ativar) e persiste o
 *     clicksignEnvelopeId + AGUARDANDO_ASSINATURA. Defesa de gate: revalida `kitLiberado` (3 frentes).
 *  b) processarTick: varre os envelopes AGUARDANDO_ASSINATURA. closed → baixa o assinado SÍNCRONO
 *     (URL S3 expira ~5min, NUNCA persistida/logada — §A.6) → arquiva no Drive (subpasta ADMISSAO,
 *     mesma rotina do ASO) → persiste contratoAssinadoDriveUrl + ASSINADO → expurga a staging.
 *     canceled → CANCELADO.
 *
 * INÉRCIA sem token: `processarTick` e `criarEnvelope` são no-op imediato quando a API está inerte —
 * `fetch` nunca é chamado. CPF/PII/URL de download nunca tocam log (§A.6).
 */
@Injectable()
export class ClicksignSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("ClicksignSyncService");
  private worker?: Worker;
  private connection?: IORedis;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly api: ClicksignApiService,
    private readonly queue: ClicksignQueueService,
    private readonly staging: StagingService,
    private readonly ai: AiClientService,
    private readonly kit: KitService,
  ) {}

  // ── Worker lifecycle (consumidor) ─────────────────────────────────────────
  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoRedis(host, port);
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (worker Clicksign) com erro: ${err.message}`);
      });
      this.worker = new Worker(CLICKSIGN_QUEUE, async (job: Job) => this.processarJob(job), {
        connection: this.connection,
        ...CLICKSIGN_WORKER_OPTIONS,
      });
      this.worker.on("failed", (job, err) => {
        this.logger.warn(`Job ${job?.name ?? "?"} falhou (será retentado): ${err.message}`);
      });
      this.logger.log("Worker clicksign-sync inicializado.");
    } catch (err) {
      this.logger.warn(
        `Worker clicksign-sync indisponível no boot (segue sem derrubar o app): ${
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
  private async processarJob(job: Job): Promise<void> {
    if (job.name === JOB_POLL_TICK) {
      await this.processarTick();
      return;
    }
    if (job.name === JOB_CRIAR_ENVELOPE) {
      const { admissaoId, stagingPathKit } = job.data as CriarEnvelopeJobData;
      await this.criarEnvelope(admissaoId, stagingPathKit);
    }
  }

  /** Enfileira um `poll-tick` (chamado pelo controller). */
  async enfileirarTick(): Promise<void> {
    await this.queue.enfileirarTick();
  }

  // ── (a) Criação do envelope ──────────────────────────────────────────────
  /**
   * Cria e ativa o envelope da admissão a partir do kit na staging. Inerte → no-op. Defesa de gate
   * (regra 3+conclusão do Cadastro): só prossegue com `kitLiberado`. Se o kit não estiver no disco
   * (expurgado pelo TTL antes do worker), LANÇA para o backoff retentar.
   */
  async criarEnvelope(admissaoId: string, stagingPathKit: string): Promise<void> {
    if (!this.api.estaAtivo()) return; // inerte sem token

    const adm = await this.carregarAdmissao(admissaoId);
    if (!adm) {
      this.logger.warn("Admissão não encontrada para criar envelope — ignorado.");
      return;
    }

    // Defesa: o gate F9 (3 frentes concluídas) precisa estar fechado mesmo no caminho da fila.
    const frentes = await this.carregarFrentes(admissaoId);
    if (!kitLiberado(frentes)) {
      this.logger.warn("Envelope não criado: gate F9 não liberado (3 frentes) — defesa.");
      return;
    }

    if (!adm.candidatoEmail) {
      // Sem e-mail não há como autenticar/notificar o signatário (requirement provide_evidence=email).
      this.logger.warn("Envelope não criado: candidato sem e-mail (não-bloqueio, aguarda correção).");
      return;
    }

    // Lê o kit do disco efêmero (nunca do banco — §A.6). Guarda contra path traversal.
    if (!this.staging.dentroDaRaiz(stagingPathKit) || !existsSync(stagingPathKit)) {
      throw new Error("Kit ausente na staging ao criar envelope (backoff)");
    }
    const conteudo = await readFile(stagingPathKit);

    const env = await this.api.criarEnvelope(`Contrato - ${adm.candidatoNome}`);
    if (!env) throw new Error("Clicksign não retornou id de envelope");

    const doc = await this.api.anexarDocumento(env.id, {
      filename: "contrato.pdf",
      conteudo,
    });
    if (!doc) throw new Error("Clicksign não retornou id de documento");

    const signer = await this.api.adicionarSigner(env.id, {
      nome: adm.candidatoNome,
      email: adm.candidatoEmail,
      cpf: adm.candidatoCpf, // mascarado dentro do api service; nunca logado
    });
    if (!signer) throw new Error("Clicksign não retornou id de signatário");

    await this.api.criarRequirement(env.id, { documentId: doc.id, signerId: signer.id });
    await this.api.ativarEnvelope(env.id);

    await this.db
      .update(admissoes)
      .set({
        clicksignEnvelopeId: env.id,
        clicksignStatus: "AGUARDANDO_ASSINATURA",
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, admissaoId));
    this.logger.log(`Envelope Clicksign ativado (admissão ${admissaoId}).`);
  }

  // ── (b) Tick: varre os envelopes aguardando assinatura ───────────────────
  /** Lista admissões AGUARDANDO_ASSINATURA e processa cada envelope. Inerte → no-op. */
  async processarTick(): Promise<void> {
    if (!this.api.estaAtivo()) return; // inerte sem token

    const pendentes = await this.db
      .select({ id: admissoes.id, envelopeId: admissoes.clicksignEnvelopeId })
      .from(admissoes)
      .where(
        and(
          eq(admissoes.clicksignStatus, "AGUARDANDO_ASSINATURA"),
          isNotNull(admissoes.clicksignEnvelopeId),
        ),
      );

    for (const p of pendentes) {
      if (!p.envelopeId) continue;
      try {
        await this.processarEnvelope(p.id, p.envelopeId);
      } catch (err) {
        // Um envelope com erro não derruba a varredura dos demais; o tick volta no próximo ciclo.
        this.logger.warn(
          `Falha ao processar envelope da admissão ${p.id}: ${
            err instanceof Error ? err.message : "erro"
          }`,
        );
      }
    }
  }

  /** Processa 1 envelope: closed → arquiva assinado; canceled → CANCELADO; demais → aguarda. */
  private async processarEnvelope(admissaoId: string, envelopeId: string): Promise<void> {
    const r = await this.api.consultarStatus(envelopeId);
    if (!r) return;

    if (r.status === "canceled") {
      await this.db
        .update(admissoes)
        .set({ clicksignStatus: "CANCELADO", atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));
      this.logger.log(`Envelope cancelado na Clicksign (admissão ${admissaoId}).`);
      return;
    }

    if (r.status !== "closed") return; // running/draft → ainda aguardando

    await this.arquivarAssinado(admissaoId, envelopeId);
  }

  /**
   * Baixa o contrato assinado (URL S3 ~5min) SÍNCRONO no mesmo ciclo, salva na staging, arquiva no
   * Drive (subpasta ADMISSAO) e persiste a URL da pasta (referência, não binário — regra 7). A URL
   * de download NUNCA é logada/persistida (§A.6); o buffer é descartado. Sem pasta-pai mapeada → não
   * arquiva (mantém AGUARDANDO para tentar de novo).
   */
  private async arquivarAssinado(admissaoId: string, envelopeId: string): Promise<void> {
    const adm = await this.carregarAdmissao(admissaoId);
    if (!adm) return;

    const pastaPaiId = resolvePastaPaiId(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.logger.warn(
        `Contrato assinado não arquivado: sem pasta-pai do Drive para a admissão ${admissaoId}.`,
      );
      return;
    }

    const url = await this.api.obterUrlAssinado(envelopeId);
    if (!url) {
      this.logger.warn(`Envelope closed sem URL de documento assinado (admissão ${admissaoId}).`);
      return;
    }

    // Download síncrono — a URL expira em ~5min. Só em memória, nunca logada (§A.6).
    let buffer: Buffer | undefined;
    let stagingPath: string | undefined;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Download do contrato assinado falhou (HTTP ${res.status}).`);
        return;
      }
      buffer = Buffer.from(await res.arrayBuffer());
      stagingPath = await this.staging.salvar(admissaoId, "CONTRATO_ASSINADO", {
        buffer,
        originalname: "contrato_assinado.pdf",
      });

      const arquivo: ArquivoDrive = {
        stagingPath,
        nomeFinal: `Contrato Assinado_${adm.candidatoNome}`,
        subpasta: "ADMISSAO",
      };
      const { pastaUrl } = await this.ai.arquivarDrive({
        parentFolderId: pastaPaiId,
        pastaNome: montarNomePasta(adm.candidatoNome, adm.clienteOperacao),
        arquivos: [arquivo],
      });

      await this.db
        .update(admissoes)
        .set({
          contratoAssinadoDriveUrl: pastaUrl,
          clicksignStatus: "ASSINADO",
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, admissaoId));
      await recomputeFarolGlobal(this.db, admissaoId);
      this.logger.log(`Contrato assinado arquivado no Drive (admissão ${admissaoId}).`);
    } finally {
      buffer = undefined; // descarta o binário da memória
      if (stagingPath) await this.staging.removerArquivo(stagingPath).catch(() => undefined);
    }
  }

  // ── Reenvio por correção (rota operacional) ──────────────────────────────
  /**
   * Reenvio por correção (§A.5): cancela o envelope atual (best-effort no provedor; CANCELADO no EA,
   * mantendo o histórico via aceite + versões no Drive), regenera o kit a partir do PDF-mãe corrigido
   * (reusa KitService.gerar, que re-aplica o gate F9 e enfileira um novo `criar-envelope`).
   *
   * REGRA DUPLA CORREÇÃO: se a admissão veio do Pandapé (origem=PANDAPE) e o body não traz
   * `aceiteDuplaCorrecao=true`, responde 409 needsConfirmation (não prossegue). Com o aceite, GRAVA o
   * registro permanente em duplaCorrecaoAceites ANTES de qualquer ação (log §A.6).
   */
  async reenviarCorrecao(
    admissaoId: string,
    file: Express.Multer.File | undefined,
    aceiteDuplaCorrecao: boolean,
    user: AuthUser,
  ): Promise<{ downloadToken: string; nomeArquivo: string }> {
    const adm = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    // Gate da dupla correção: só admissões do Pandapé exigem o aceite (envio Pandapé→G.I irreversível).
    if (adm.origem === "PANDAPE" && !aceiteDuplaCorrecao) {
      throw new ConflictException({
        needsConfirmation: true,
        reason: "duplaCorrecao",
        message: TERMO_DUPLA_CORRECAO,
      });
    }

    // Com aceite, registra a trilha permanente ANTES de prosseguir (§A.6).
    if (aceiteDuplaCorrecao) {
      await this.db.insert(duplaCorrecaoAceites).values({
        admissaoId,
        autorId: user.id,
        termo: TERMO_DUPLA_CORRECAO,
      });
    }

    // Cancela o envelope atual (best-effort no provedor) e marca CANCELADO no EA (autoritativo).
    if (adm.clicksignEnvelopeId) {
      await this.api.cancelarEnvelope(adm.clicksignEnvelopeId);
      await this.db
        .update(admissoes)
        .set({ clicksignStatus: "CANCELADO", atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));
    }

    // Regenera o kit: re-aplica o gate F9 e enfileira o novo `criar-envelope` (sobrescreve o status).
    return this.kit.gerar(admissaoId, file);
  }

  // ── Helpers de leitura ───────────────────────────────────────────────────
  /** Carrega a admissão + candidato + cliente (sem expor nada em log). */
  private async carregarAdmissao(admissaoId: string) {
    const [adm] = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        tipoContrato: admissoes.tipoContrato,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        candidatoEmail: candidatos.email,
        clienteOperacao: clientes.nomeOperacao,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
      .innerJoin(clientes, eq(admissoes.codCliente, clientes.codCliente))
      .where(eq(admissoes.id, admissaoId));
    return adm;
  }

  /** Carrega o estado das frentes da admissão (para o gate F9). */
  private async carregarFrentes(admissaoId: string): Promise<EstadoFrente[]> {
    const rows = await this.db
      .select({ tipo: frentesAdmissao.tipo, concluida: frentesAdmissao.concluida })
      .from(frentesAdmissao)
      .where(eq(frentesAdmissao.admissaoId, admissaoId));
    return rows.map((r) => ({ tipo: r.tipo, concluida: r.concluida }));
  }
}
