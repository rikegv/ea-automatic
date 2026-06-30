import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { asc, eq } from "drizzle-orm";
import type IORedis from "ioredis";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { cargos, clientes, integracaoPandape, tiposDocumento, usuarios } from "../db/schema";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { PandapeApiService, type PandaperPrecollaborator } from "./pandape-api.service";
import { PandapeQueueService } from "./pandape-queue.service";
import { resolverTipoDocumento } from "./resolver-tipo-documento";
import {
  criarConexaoRedis,
  JOB_POLL_TICK,
  JOB_SYNC_CANDIDATE,
  PANDAPE_QUEUE,
  PANDAPE_WORKER_OPTIONS,
  type SyncCandidateJobData,
} from "./pandape.queue";

/**
 * Lógica idempotente da sincronização Pandapé (Fase 5 / INT-1, OST §3) + o Worker BullMQ (consumidor).
 *
 * Idempotência ancorada no unique `idPrecollaborator` (uma admissão por pré-colaborador): dois ticks
 * sobre o MESMO payload não criam duas admissões. A criação reusa `AdmissoesService.create` com
 * `origem=PANDAPE` + `bypassAceite` (regra 5 — a sync nunca trava por campos pendentes). O pull de
 * docs reusa `AuditoriaService.auditarBuffer` (F2 incremental). URLs do Pandapé só em memória; nunca
 * em banco/log. CPF nunca é logado (§A.6).
 */
@Injectable()
export class PandapeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("PandapeSyncService");
  private worker?: Worker;
  private connection?: IORedis;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly api: PandapeApiService,
    private readonly queue: PandapeQueueService,
    private readonly admissoes: AdmissoesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ── Worker lifecycle (consumidor) ─────────────────────────────────────────
  onModuleInit(): void {
    try {
      const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
      const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
      this.connection = criarConexaoRedis(host, port);
      this.connection.on("error", (err) => {
        this.logger.warn(`Conexão Redis (worker Pandapé) com erro: ${err.message}`);
      });
      this.worker = new Worker(
        PANDAPE_QUEUE,
        async (job: Job) => this.processarJob(job),
        { connection: this.connection, ...PANDAPE_WORKER_OPTIONS },
      );
      this.worker.on("failed", (job, err) => {
        this.logger.warn(`Job ${job?.name ?? "?"} falhou (será retentado): ${err.message}`);
      });
      this.logger.log("Worker pandape-sync inicializado.");
    } catch (err) {
      this.logger.warn(
        `Worker pandape-sync indisponível no boot (segue sem derrubar o app): ${
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
    if (job.name === JOB_SYNC_CANDIDATE) {
      const { idPrecollaborator } = job.data as SyncCandidateJobData;
      await this.processarCandidato(idPrecollaborator);
    }
  }

  // ── Entrada do cron ────────────────────────────────────────────────────────
  /** Enfileira um `poll-tick` (chamado pelo controller). */
  async enfileirarTick(): Promise<void> {
    await this.queue.enfileirarTick();
  }

  // ── Tick: varre mudanças e enfileira filhos ──────────────────────────────────
  /** Varre as mudanças no Pandapé e enfileira um `sync-candidate` por idPreCollaborator. Inerte → no-op. */
  async processarTick(): Promise<void> {
    if (!this.api.estaAtivo()) return; // inerte sem token
    const ids = await this.api.listarMudancas();
    for (const id of ids) {
      await this.queue.enfileirarCandidato(id);
    }
    if (ids.length > 0) {
      this.logger.log(`Tick Pandapé: ${ids.length} candidato(s) enfileirado(s).`);
    }
  }

  // ── Sync de 1 pré-colaborador (idempotente) ──────────────────────────────────
  /**
   * Processa 1 idPreCollaborator (OST §3):
   *  a) consulta integracao_pandape (unique idPrecollaborator);
   *  b) NOVO → cria candidato+admissão+frentes pela régua (regra 1) + pull de docs;
   *  c) CONHECIDO, etapa diferente → atualiza só a etapa (sem duplicar admissão);
   *  d) CONHECIDO, mesma etapa → no-op (idempotência).
   * Inerte sem token → no-op.
   */
  async processarCandidato(idPrecollaborator: string): Promise<void> {
    if (!this.api.estaAtivo()) return;

    const existente = await this.db.query.integracaoPandape.findFirst({
      where: eq(integracaoPandape.idPrecollaborator, idPrecollaborator),
    });

    const pc = await this.api.getPrecollaborator(idPrecollaborator);
    if (!pc) {
      this.logger.warn("Pré-colaborador não retornado pelo Pandapé (ignorado neste tick).");
      return;
    }
    const etapaAtual = pc.etapa ?? pc.stage;

    // (c)/(d) CONHECIDO.
    if (existente) {
      if (etapaAtual && etapaAtual !== existente.etapa) {
        await this.db
          .update(integracaoPandape)
          .set({ etapa: etapaAtual, atualizadoEm: new Date() })
          .where(eq(integracaoPandape.id, existente.id));
      }
      // mesma etapa → no-op (idempotência: rodar 2x sobre o mesmo payload não muda nada).
      return;
    }

    // (b) NOVO — cria a admissão.
    await this.criarAdmissao(pc, etapaAtual);
  }

  /**
   * Cria a admissão a partir do pré-colaborador. Resolve cliente/cargo via vaga (best-effort); se não
   * resolver, NÃO cria (a FK exige cliente/cargo válidos) e adia — NÃO inventa cod_cliente (OST §2).
   * A corrida entre dois ticks é tratada pelo unique `idPrecollaborator`: violação = "já existe".
   */
  private async criarAdmissao(
    pc: PandaperPrecollaborator,
    etapa: string | undefined,
  ): Promise<void> {
    if (!pc.cpf || !pc.nome) {
      this.logger.warn("Pré-colaborador sem CPF/nome — sync adiada (não-bloqueio).");
      return;
    }

    const alvo = await this.resolverClienteCargo(pc.idVacancy);
    if (!alvo) {
      // Sem mapeamento de cliente/cargo (insumo do diretor pendente, §A.9): adia sem inventar FK.
      this.logger.warn(
        "Vaga do Pandapé não mapeável para cliente/cargo — admissão adiada (aguardando de/para, §A.9).",
      );
      return;
    }

    try {
      const criada = await this.admissoes.create(
        {
          codCliente: alvo.codCliente,
          cargoId: alvo.cargoId,
          candidato: {
            cpf: pc.cpf,
            nome: pc.nome,
            telefone: pc.telefone,
            email: pc.email,
            dataNascimento: pc.dataNascimento,
          },
        },
        undefined,
        {
          origem: "PANDAPE",
          bypassAceite: true,
          pandape: {
            idPrecollaborator: pc.idPreCollaborator,
            idMatch: pc.idMatch,
            idVacancy: pc.idVacancy,
            etapa,
          },
        },
      );
      // Pull de docs (F2 incremental) após o nascimento das frentes (regra 1).
      await this.puxarDocumentos(criada.admissaoId, pc.documents ?? []);
    } catch (err) {
      // Corrida: outro tick criou a mesma admissão primeiro → o unique idPrecollaborator estoura.
      if (this.ehViolacaoUnique(err)) {
        this.logger.log("Admissão Pandapé já existente (corrida tratada pelo unique) — no-op.");
        return;
      }
      throw err; // demais erros sobem para o backoff do BullMQ.
    }
  }

  /**
   * Pull de documentos (OST §4): baixa cada URL pública para um Buffer EM MEMÓRIA, mapeia o tipo e
   * audita via F2. A URL NUNCA toca banco nem log (§A.6). Tipo não mapeado → pula (não-bloqueio). O
   * buffer é descartado ao fim de cada documento. Roda sob um "usuário sistema" real (ver
   * `resolverUsuarioSistema`) porque o fechamento da régua grava um evento com autor (FK).
   */
  private async puxarDocumentos(
    admissaoId: string,
    documentos: PandaperPrecollaborator["documents"],
  ): Promise<void> {
    if (!documentos || documentos.length === 0) return;

    const userSistema = await this.resolverUsuarioSistema();
    if (!userSistema) {
      this.logger.warn("Sem usuário sistema para auditar docs do Pandapé — pull adiado.");
      return;
    }

    for (const doc of documentos) {
      const url = doc.url;
      if (!url) continue;
      const codigo = resolverTipoDocumento(doc.label ?? doc.tipo);
      if (!codigo) {
        // NUNCA logar a URL nem CPF — só um rótulo genérico (§A.6).
        this.logger.warn("Documento Pandapé com tipo não mapeado — pulado.");
        continue;
      }
      const tipo = await this.db.query.tiposDocumento.findFirst({
        where: eq(tiposDocumento.codigo, codigo),
      });
      if (!tipo) {
        this.logger.warn(`Tipo de documento '${codigo}' ausente no catálogo — pulado.`);
        continue;
      }

      let buffer: Buffer | undefined;
      try {
        const res = await fetch(url); // URL pública, só em memória.
        if (!res.ok) {
          this.logger.warn(`Download de documento do Pandapé falhou (HTTP ${res.status}) — pulado.`);
          continue;
        }
        buffer = Buffer.from(await res.arrayBuffer());
        await this.auditoria.auditarBuffer(
          admissaoId,
          tipo.id,
          { buffer, originalname: `${codigo}` },
          userSistema,
        );
      } catch (err) {
        this.logger.warn(
          `Falha ao puxar/auditar documento do Pandapé: ${
            err instanceof Error ? err.message : "erro"
          }`,
        );
      } finally {
        buffer = undefined; // descarta o binário da memória.
      }
    }
  }

  /**
   * Resolve a vaga do Pandapé para (cod_cliente, cargoId) do EA — INVESTIGAÇÃO (OST §2). Best-effort:
   * tenta o cargo por nome e o cliente por CNPJ. O de/para definitivo depende de insumo do diretor
   * (§A.9). Sem idVacancy ou sem correspondência → undefined (o chamador adia, NÃO inventa).
   */
  private async resolverClienteCargo(
    idVacancy: string | undefined,
  ): Promise<{ codCliente: string; cargoId: string } | undefined> {
    if (!idVacancy) return undefined;
    const vaga = await this.api.getVacancy(idVacancy);
    if (!vaga) return undefined;

    let codCliente: string | undefined;
    if (vaga.clienteCnpj) {
      const cli = await this.db.query.clientes.findFirst({
        where: eq(clientes.cnpj, vaga.clienteCnpj),
      });
      codCliente = cli?.codCliente;
    }
    let cargoId: string | undefined;
    if (vaga.cargoNome) {
      const cargo = await this.db.query.cargos.findFirst({
        where: eq(cargos.nome, vaga.cargoNome),
      });
      cargoId = cargo?.id;
    }
    if (!codCliente || !cargoId) return undefined;
    /* TODO: quando o token chegar, confirmar o de/para vaga→cliente/cargo e tratar nomes divergentes (§A.9). */
    return { codCliente, cargoId };
  }

  /**
   * "Usuário sistema" para a auditoria automatizada. DECISÃO: a auditoria grava um evento de frente
   * com `autorId` (FK a `usuarios`); um AuthUser inventado violaria a FK quando a régua fecha durante
   * o pull. Resolvemos um usuário REAL do banco — preferindo SUPER_ADMIN, senão o mais antigo ativo —
   * para atuar como autor das transições disparadas pela sync. Não há usuário sintético/fake.
   */
  private async resolverUsuarioSistema(): Promise<AuthUser | undefined> {
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
    return { id: u.id, email: u.email, papel: u.papel };
  }

  /** Detecta violação de unique (Postgres 23505) — usado para tratar corrida como "já existe". */
  private ehViolacaoUnique(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    const code = (err as { code?: string }).code;
    return code === "23505";
  }
}
