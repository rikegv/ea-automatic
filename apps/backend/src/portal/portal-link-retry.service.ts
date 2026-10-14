import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { eq } from "drizzle-orm";
import { Queue, Worker, type Job } from "bullmq";
import type IORedis from "ioredis";
import type { ResultadoDoEnvioDoLink } from "@ea/shared-types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes } from "../db/schema";
import {
  classificarEmissao,
  desfechoDeExcecao,
  type DesfechoDaEmissao,
  type MotivoDaFalhaDoLink,
} from "../domain/portal-link-falha";
import { criarConexaoRedis } from "../pandape/pandape.queue";
import {
  JOB_RETENTAR_EMISSAO,
  PORTAL_LINK_QUEUE_OPTIONS,
  PORTAL_LINK_RETRY_QUEUE,
  PORTAL_LINK_WORKER_OPTIONS,
  type RetentarEmissaoJobData,
} from "./portal-link.queue";
import { PortalEnvioService } from "./portal-envio.service";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * O FIM DO SILENCIO DA EMISSAO DO LINK (frente A.1). Este serviço é o que falta entre a liberação e
 * o estado consultável: ele classifica o desfecho de `enviarParaAdmissao(...,"AUTOMATICO")` pela
 * taxonomia (`domain/portal-link-falha.ts`), CARIMBA o estado nas três colunas de `admissoes`,
 * grava a trilha e, na falha transitória, ENFILEIRA o retry (BullMQ, backoff exponencial).
 *
 * ┌─ PRODUCER E WORKER NUM SERVICO SO, ao contrário da Clicksign ───────────────────────────────┐
 * │ A Clicksign separa produtor e worker em dois módulos porque o KitModule precisa enfileirar   │
 * │ SEM puxar o worker. Aqui não há terceiro: quem enfileira é o gancho da liberação, que já      │
 * │ injeta ESTE serviço (do PortalModule). As retentativas são do próprio BullMQ (`attempts` +    │
 * │ `backoff`), não um reenfileiramento manual, então o worker nunca enfileira: ele RE-CHAMA a    │
 * │ emissão e, na falha transitória, LANÇA para o BullMQ aplicar o backoff.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NAO TOCA O MIOLO `enviarParaAdmissao`: só o re-chama e lê o resultado, igual aos ganchos.
 *
 * TOLERANTE A REDIS FORA (§A.5): se a fila/worker não subir no boot, o carimbo e a trilha continuam
 * (são DB), só o retry não é enfileirado, e isso é logado. A liberação nunca quebra por causa disto.
 *
 * §A.6: nada aqui loga ou grava e-mail, link, token, CPF, nome ou id de pessoa; só o CÓDIGO do motivo.
 */
@Injectable()
export class PortalLinkRetryService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PortalLinkRetryService.name);
  private producerConn?: IORedis;
  private workerConn?: IORedis;
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly envio: PortalEnvioService,
    private readonly trilha: PortalTrilhaService,
  ) {}

  onModuleInit(): void {
    const host = this.config.get<string>("REDIS_HOST") ?? "127.0.0.1";
    const port = Number(this.config.get<string>("REDIS_PORT") ?? 6380);
    try {
      this.producerConn = criarConexaoRedis(host, port);
      this.producerConn.on("error", (err) => {
        this.log.warn(`Conexao Redis (fila portal-link-retry) com erro: ${err.message}`);
      });
      this.queue = new Queue(PORTAL_LINK_RETRY_QUEUE, {
        connection: this.producerConn,
        ...PORTAL_LINK_QUEUE_OPTIONS,
      });
    } catch (err) {
      this.log.warn(
        `Fila portal-link-retry indisponivel no boot (segue sem derrubar o app): ${
          err instanceof Error ? err.message : "erro"
        }`,
      );
    }
    try {
      this.workerConn = criarConexaoRedis(host, port);
      this.workerConn.on("error", (err) => {
        this.log.warn(`Conexao Redis (worker portal-link-retry) com erro: ${err.message}`);
      });
      this.worker = new Worker(
        PORTAL_LINK_RETRY_QUEUE,
        async (job: Job) => this.processarJob(job),
        { connection: this.workerConn, ...PORTAL_LINK_WORKER_OPTIONS },
      );
      this.worker.on("failed", (job, err) => {
        // §A.6: sem PII, e SÓ o nome da classe do erro (nunca `err.message`), mesma disciplina dos
        // outros catch deste serviço. O motivo real do insucesso já está carimbado na coluna e na
        // trilha; este log é só o FATO de a tentativa ter falhado, à prova de um futuro caminho de
        // erro que carregue mensagem de driver.
        this.log.warn(
          `retry de emissao do link falhou (tentativa ${job?.attemptsMade ?? "?"}): ${
            (err as Error).name
          }`,
        );
      });
      this.log.log("Fila/worker portal-link-retry inicializados.");
    } catch (err) {
      this.log.warn(
        `Worker portal-link-retry indisponivel no boot (segue sem derrubar o app): ${
          err instanceof Error ? err.message : "erro"
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
    await this.workerConn?.quit().catch(() => undefined);
    await this.producerConn?.quit().catch(() => undefined);
  }

  // ══ O CAMINHO DO GANCHO (liberação individual, lote, e o wizard) ════════════════════════════

  /**
   * CHAMADO PELO GANCHO depois de `enviarParaAdmissao` devolver um resultado SEM lançar. Classifica,
   * carimba/limpa o estado, grava a trilha e, se for falha transitória, enfileira o retry. É
   * best-effort: qualquer erro aqui é logado e engolido, porque a LIBERAÇÃO é o fato e isto é o aviso
   * (§A.5). O que mudou em relação ao silêncio antigo é que a falha agora deixa RASTRO consultável.
   */
  async registrarResultado(
    admissaoId: string,
    autorId: string,
    resultado: ResultadoDoEnvioDoLink,
  ): Promise<void> {
    await this.aplicarDoGancho(admissaoId, autorId, classificarEmissao(resultado));
  }

  /** CHAMADO PELO GANCHO quando `enviarParaAdmissao` LANÇOU uma exceção inesperada. Sempre (b). */
  async registrarExcecao(admissaoId: string, autorId: string): Promise<void> {
    await this.aplicarDoGancho(admissaoId, autorId, desfechoDeExcecao());
  }

  private async aplicarDoGancho(
    admissaoId: string,
    autorId: string,
    desfecho: DesfechoDaEmissao,
  ): Promise<void> {
    try {
      if (desfecho.tipo === "SUCESSO") {
        await this.limparEstado(admissaoId);
        return;
      }
      if (desfecho.tipo === "IGNORAR") {
        // (a) Recusa legítima na emissão fresca: não é falha, não carimba, não retenta.
        return;
      }
      // (b)/(c): primeira falha carimbada nesta rodada de liberação, tentativa = 1.
      await this.carimbarFalha(admissaoId, desfecho.motivo, 1);
      await this.gravarEventoFalha(desfecho.motivo, 1);
      if (desfecho.retry) await this.enfileirarRetry(admissaoId, autorId);
    } catch (err) {
      // Nunca deixa a liberação quebrar por causa do rastro. §A.6: só o nome da classe do erro.
      this.log.error(`nao foi possivel registrar o desfecho da emissao do link: ${(err as Error).name}`);
    }
  }

  // ══ O CAMINHO DO WORKER (retry) ═════════════════════════════════════════════════════════════

  private async processarJob(job: Job): Promise<void> {
    if (job.name !== JOB_RETENTAR_EMISSAO) return;
    const { admissaoId, autorId } = job.data as RetentarEmissaoJobData;
    const tentativa = job.attemptsMade + 1;

    let desfecho: DesfechoDaEmissao;
    try {
      const resultado = await this.envio.enviarParaAdmissao(admissaoId, autorId, "AUTOMATICO");
      desfecho = classificarEmissao(resultado);
    } catch {
      desfecho = desfechoDeExcecao();
    }

    // A ESCRITA DE ESTADO É ENVOLTA E NÃO PROPAGA A MENSAGEM DO DRIVER. §A.6: um erro de banco aqui
    // carregaria a `message` do pg (query/ids técnicos/código), e mesmo sem CPF/e-mail/URL a disciplina
    // da frente é logar SÓ o nome da classe. A decisão de RETENTAR não depende do carimbo: o `throw`
    // do (b) fica FORA deste bloco, então uma falha de banco não impede o backoff nem vaza a mensagem.
    try {
      if (desfecho.tipo === "SUCESSO" || desfecho.tipo === "IGNORAR") {
        // Resolvido: ou o link saiu agora, ou virou recusa legítima (link vivo passou a existir, ou a
        // admissão saiu do recorte). Limpa o estado e encerra o job sem retentar.
        await this.limparEstado(admissaoId);
        return;
      }
      // (b)/(c): carimba com a tentativa corrente e grava a trilha.
      await this.carimbarFalha(admissaoId, desfecho.motivo, tentativa);
      await this.gravarEventoFalha(desfecho.motivo, tentativa);
    } catch (err) {
      this.log.warn(`estado da falha de emissao do link nao persistiu no retry: ${(err as Error).name}`);
    }

    // (b) transitória: LANÇA para o BullMQ aplicar o backoff. Esgotadas as `attempts`, o job falha e o
    // estado carimbado permanece consultável (é o ponto da frente). A mensagem é CÓDIGO fechado, nunca
    // PII. (c) dado faltando: NÃO lança, o job conclui e o ADM corrige o e-mail e reemite pelo Gerenciador.
    if (desfecho.tipo === "CARIMBA" && desfecho.retry) {
      throw new Error(`emissao do link ainda falha (motivo ${desfecho.motivo}), retry`);
    }
  }

  // ══ ESTADO E TRILHA ═════════════════════════════════════════════════════════════════════════

  private async carimbarFalha(
    admissaoId: string,
    motivo: MotivoDaFalhaDoLink,
    tentativa: number,
  ): Promise<void> {
    await this.db
      .update(admissoes)
      .set({
        portalLinkFalhaEm: new Date(),
        portalLinkFalhaMotivo: motivo,
        portalLinkTentativas: tentativa,
      })
      .where(eq(admissoes.id, admissaoId));
  }

  private async limparEstado(admissaoId: string): Promise<void> {
    await this.db
      .update(admissoes)
      .set({ portalLinkFalhaEm: null, portalLinkFalhaMotivo: null, portalLinkTentativas: 0 })
      .where(eq(admissoes.id, admissaoId));
  }

  /**
   * Grava o espelho da falha na trilha do portal. GUARDADO: a trilha LANÇA se `PORTAL_LOG_PEPPER`
   * não estiver configurado (homolog pode não ter), e o carimbo na coluna é a verdade consultável,
   * então a trilha não pode derrubar o caminho. §A.6: só motivo (código), origem e a tentativa.
   */
  private async gravarEventoFalha(motivo: MotivoDaFalhaDoLink, tentativa: number): Promise<void> {
    if (!this.trilha.configurada()) return;
    try {
      await this.trilha.registrar("PORTAL_LINK_EMISSAO_FALHOU", {
        motivoCodigo: motivo,
        origem: "AUTOMATICO",
        tentativaN: tentativa,
      });
    } catch (err) {
      this.log.warn(`trilha da falha de emissao do link nao gravou: ${(err as Error).name}`);
    }
  }

  private async enfileirarRetry(admissaoId: string, autorId: string): Promise<void> {
    if (!this.queue) {
      this.log.warn("retry de emissao do link nao enfileirado: fila indisponivel.");
      return;
    }
    // jobId unico por disparo e SEM `:` (separador interno do BullMQ): um job concluido com id
    // estavel seria descartado em silencio na re-liberacao (a armadilha do `removeOnComplete`).
    const jobId = `plink-${admissaoId}-${Date.now().toString(36)}`;
    await this.queue.add(
      JOB_RETENTAR_EMISSAO,
      { admissaoId, autorId } satisfies RetentarEmissaoJobData,
      { jobId },
    );
  }
}
