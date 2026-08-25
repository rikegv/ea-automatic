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
import { naoPausada } from "../db/admissao-filtros";
import { ehPausada } from "../domain/admissao";
import {
  admissoes,
  candidatos,
  clientes,
  duplaCorrecaoAceites,
  frentesAdmissao,
} from "../db/schema";
import { AiClientService, type ArquivoDrive } from "../ai/ai-client.service";
import { montarNomePasta } from "../ai/drive-routing";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { recomputeFarolGlobal } from "../admissoes/farol";
import type { EstadoFrente } from "../domain/frentes";
import { kitLiberado } from "../domain/frentes";
import { validarPdfKit } from "../domain/pdf-kit";
import { montarAssinantes } from "../domain/clicksign-assinantes";
import { KitService } from "../kit/kit.service";
import { StagingService } from "../staging/staging.service";
import { criarConexaoRedis } from "../pandape/pandape.queue";
import {
  agregarCiclo,
  envelopeExpirado,
  type ResumoEnvelope,
} from "../domain/scheduler-clicksign";
import {
  GRUPO_FUNCIONARIO,
  grupoDaOrdem,
  PAPEL_EMPRESA,
  PAPEL_FUNCIONARIO,
} from "../domain/assinante-empresa";
import { AssinanteEmpresaService } from "./assinante-empresa.service";
import { ClicksignApiService } from "./clicksign-api.service";
import { ClicksignQueueService } from "./clicksign-queue.service";
import { ClicksignSchedulerService } from "./clicksign-scheduler.service";

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
    private readonly drivePastaPai: DrivePastaPaiService,
    private readonly scheduler: ClicksignSchedulerService,
    private readonly assinantes: AssinanteEmpresaService,
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

    // JÁ TEM ENVELOPE VIVO? Não cria um segundo. Esta guarda substituiu o dedup que antes vinha do
    // jobId estável da fila; sem ela, dois cliques no disparo criariam dois envelopes para a mesma
    // pessoa, e o segundo ficaria órfão (o EA só guarda um `clicksign_envelope_id`).
    if (adm.clicksignEnvelopeId && adm.clicksignStatus === "AGUARDANDO_ASSINATURA") {
      this.logger.warn(
        `Envelope não criado: a admissão ${admissaoId} já tem envelope aguardando assinatura.`,
      );
      return;
    }

    // PAUSA (ponto 4 dos 6): admissão pausada NÃO dispara envelope. O job pode ter sido enfileirado
    // antes da pausa, então a checagem é aqui, na execução, e não só na hora de enfileirar: quem
    // pausou depois do kit gerado não pode ver um envelope nascer mesmo assim. Sem envelope criado,
    // não há nada a cancelar ao retomar; o kit continua na staging e o disparo é refeito.
    if (ehPausada(adm.pausadaEm)) {
      this.logger.warn("Envelope não criado: admissão PAUSADA (não é cancelamento, é adiamento).");
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
      this.logger.warn(
        "Envelope não criado: candidato sem e-mail (não-bloqueio, aguarda correção).",
      );
      return;
    }

    // QUEM ASSINA PELA EMPRESA (exceção do cliente, senão o padrão). Resolvido ANTES de criar
    // qualquer coisa na Clicksign: sem representante cadastrado, não nasce envelope pela metade (um
    // draft órfão com só o funcionário ficaria vivo lá e não seria assinável).
    // Item 7: o representante do CONTRATO da admissão, com o do cliente e o padrão como fallback.
    const representantes = await this.assinantes.resolverConjunto(adm.codCliente, adm.clienteVinculoId);
    if (representantes.length === 0) {
      this.logger.warn(
        "Envelope não criado: sem representante da empresa cadastrado (padrão nem exceção do cliente). " +
          "Cadastre em Administração > Assinante da empresa.",
      );
      return;
    }

    // Lê o kit do disco efêmero (nunca do banco — §A.6). Guarda contra path traversal.
    if (!this.staging.dentroDaRaiz(stagingPathKit) || !existsSync(stagingPathKit)) {
      throw new Error("Kit ausente na staging ao criar envelope (backoff)");
    }
    const conteudo = await readFile(stagingPathKit);

    // DEFESA FINAL do PDF (o disparo já validou, na tela). Está duplicado de propósito: este é o
    // último ponto antes de o arquivo virar documento de envelope, e a Clicksign aceita PDF quebrado
    // sem erro nenhum, então quem paga a conta é o candidato que abre o convite e não vê documento.
    // NÃO lança: arquivo corrompido não melhora com backoff, e cinco retentativas só atrasariam o
    // diagnóstico. Sem envelope criado, a admissão continua na fila para o consultor refazer o kit.
    const veredito = validarPdfKit(conteudo);
    if (!veredito.ok) {
      this.logger.error(
        `Envelope NÃO criado: PDF do kit inválido (admissão ${admissaoId}, ${veredito.bytes} bytes). ` +
          "Gere o kit de novo pelo Gerador de Kit.",
      );
      return;
    }

    const env = await this.api.criarEnvelope(`Contrato - ${adm.candidatoNome}`);
    if (!env) throw new Error("Clicksign não retornou id de envelope");

    const doc = await this.api.anexarDocumento(env.id, {
      filename: "contrato.pdf",
      conteudo,
    });
    if (!doc) throw new Error("Clicksign não retornou id de documento");

    // SIGNATÁRIO 1, o FUNCIONÁRIO: papel `employee`, grupo 1 (assina primeiro), pode recusar.
    const signer = await this.api.adicionarSigner(env.id, {
      nome: adm.candidatoNome,
      email: adm.candidatoEmail,
      cpf: adm.candidatoCpf, // formatado dentro do api service; nunca logado
      group: GRUPO_FUNCIONARIO,
      refusable: true,
    });
    if (!signer) throw new Error("Clicksign não retornou id de signatário");
    await this.api.criarRequirement(env.id, {
      documentId: doc.id,
      signerId: signer.id,
      role: PAPEL_FUNCIONARIO,
    });

    // SIGNATÁRIOS DA EMPRESA: N representantes, papel `employer`, cada um no grupo derivado da ORDEM
    // cadastrada (ordem 1 vira grupo 2, e assim por diante). Mesma ordem = MESMO grupo = assinam em
    // paralelo; ordens diferentes = sequência, e o seguinte só é notificado quando chega a vez dele.
    //
    // Nenhum deles pode recusar: recusa da empresa não se decide pelo botão da Clicksign. Quem são
    // saiu do `resolverConjunto` lá em cima, ANTES de o envelope nascer, então sem representante
    // cadastrado o envelope nem chega aqui.
    for (const rep of representantes) {
      const signerEmpresa = await this.api.adicionarSigner(env.id, {
        nome: rep.nome,
        email: rep.email,
        cpf: rep.cpf,
        group: grupoDaOrdem(rep.ordem),
        refusable: false,
      });
      if (!signerEmpresa) throw new Error("Clicksign não retornou id do signatário da empresa");
      await this.api.criarRequirement(env.id, {
        documentId: doc.id,
        signerId: signerEmpresa.id,
        role: PAPEL_EMPRESA,
      });
    }

    await this.api.ativarEnvelope(env.id);

    // `clicksignEnviadoEm` carimba a ATIVAÇÃO: é a base do prazo de 30 dias que o tick usa para
    // marcar EXPIRADO (o mesmo prazo que foi ao `deadline_at` do envelope).
    await this.db
      .update(admissoes)
      .set({
        clicksignEnvelopeId: env.id,
        clicksignStatus: "AGUARDANDO_ASSINATURA",
        clicksignEnviadoEm: new Date(),
        // O kit PERMANECE anexado de propósito: a aba "Gestão Das Assinaturas" mostra ele no olho
        // enquanto a assinatura não fecha. Sair da fila de disparo já é garantido pelo status
        // (AGUARDANDO_ASSINATURA não entra em "Prontos Para Solicitar"), então zerar o caminho aqui
        // só custaria a visualização. Ele é zerado quando o envelope é ASSINADO, porque a partir daí
        // o contrato vive no prontuário do Drive.
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, admissaoId));
    this.logger.log(`Envelope Clicksign ativado (admissão ${admissaoId}).`);

    /**
     * PASSO 5: CHAMA A PESSOA PARA ASSINAR. Ativar o envelope só o deixa pronto; é este POST que
     * dispara o e-mail. Sem ele o contrato ficava `running`, correto e parado, e o funcionário nunca
     * era chamado. Foi o que aconteceu com 106 contratos em 24/08/2026.
     *
     * DEPOIS DO UPDATE, NUNCA ANTES. Se esta chamada rodasse antes de gravar o `clicksignEnvelopeId`
     * e falhasse, o job cairia no backoff e reentraria em `criarEnvelope` com o banco ainda limpo: a
     * guarda de "já tem envelope vivo" não veria nada e um SEGUNDO envelope nasceria, órfão. Gravar
     * primeiro torna a retentativa inofensiva.
     *
     * NÃO LANÇA, pelo mesmo motivo. O envelope já existe e já está ativo; derrubar o job aqui não
     * desfaz nada e ainda arrisca duplicar. Então a falha vira ERRO no log, nomeando a admissão, e o
     * contrato fica notificável de novo (o envelope segue de pé, é só repetir o passo 5).
     *
     * O balde deste endpoint é 1 por minuto POR ENVELOPE, então retentar aqui dentro não ajudaria:
     * um 429 só liberaria na virada do minuto, tempo demais para segurar um job da fila.
     */
    try {
      const r = await this.api.notificarEnvelope(env.id);
      // CARIMBA SÓ COM CONFIRMAÇÃO DA CLICKSIGN. É o que transforma "contrato ativo e não notificado"
      // numa consulta ao banco em vez de uma leitura de log (ver a migração 0080).
      await this.db
        .update(admissoes)
        .set({ clicksignNotificadoEm: new Date(), atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));
      this.logger.log(
        `Solicitação de assinatura enviada (admissão ${admissaoId}): ` +
          `${r?.notificados ?? 0} de ${r?.total ?? 0} signatário(s) do grupo atual.`,
      );
    } catch {
      // §A.6: só o id da admissão, nunca o do envelope, nome ou e-mail.
      this.logger.error(
        `CONTRATO ATIVO MAS NÃO NOTIFICADO (admissão ${admissaoId}): o envelope foi criado e ativado, ` +
          "mas a solicitação de assinatura não saiu. O candidato NÃO foi chamado para assinar; " +
          "reenvie a notificação para esta admissão.",
      );
    }
  }

  // ── (b) Tick: varre os envelopes aguardando assinatura ───────────────────
  /**
   * Lista admissões AGUARDANDO_ASSINATURA e processa cada envelope. Inerte → no-op.
   *
   * PAUSA (OST admissão pausada, ponto 3 dos 6, o mais crítico): admissão pausada sai da LISTA DE
   * ALVOS. O envelope NÃO é cancelado, NÃO é tocado, nem na Clicksign nem aqui: ele simplesmente
   * deixa de ser consultado. Como o alvo é escolhido por `clicksign_status` (que continua
   * AGUARDANDO_ASSINATURA) e não por um cursor, ao retomar o envelope volta à lista exatamente onde
   * estava, sem nada para recuperar. Era o único dos automáticos sem filtro de admissão nenhum.
   */
  async processarTick(): Promise<void> {
    // O ciclo é registrado mesmo inerte: o heartbeat prova que o LOOP está vivo, e sem isso a tela de
    // diagnóstico acusaria "scheduler parado" numa instalação sem token, que é estado legítimo.
    await this.scheduler.marcarInicioCiclo().catch(() => undefined);

    if (!this.api.estaAtivo()) {
      await this.scheduler
        .registrarCiclo({
          varridas: 0,
          assinados: 0,
          expirados: 0,
          falhas: 0,
          nota: "inerte: sem token da Clicksign",
        })
        .catch(() => undefined);
      return;
    }

    const pendentes = await this.db
      .select({
        id: admissoes.id,
        envelopeId: admissoes.clicksignEnvelopeId,
        enviadoEm: admissoes.clicksignEnviadoEm,
        // Painel: o detector de mudança e a existência do painel vêm JUNTO, para não custar um
        // SELECT por envelope. A varredura já lê estas linhas; ler duas colunas a mais é de graça.
        modificadoAntes: admissoes.clicksignEnvelopeModified,
        painelAtual: admissoes.clicksignAssinantes,
      })
      .from(admissoes)
      .where(
        and(
          eq(admissoes.clicksignStatus, "AGUARDANDO_ASSINATURA"),
          isNotNull(admissoes.clicksignEnvelopeId),
          naoPausada(),
        ),
      );

    const resumos: ResumoEnvelope[] = [];
    for (const p of pendentes) {
      if (!p.envelopeId) continue;
      try {
        resumos.push(
          await this.processarEnvelope(p.id, p.envelopeId, p.enviadoEm, {
            modificadoAntes: p.modificadoAntes,
            temPainel: p.painelAtual !== null && p.painelAtual !== undefined,
          }),
        );
      } catch (err) {
        // Um envelope com erro não derruba a varredura dos demais; o tick volta no próximo ciclo.
        resumos.push({ falha: true });
        this.logger.warn(
          `Falha ao processar envelope da admissão ${p.id}: ${
            err instanceof Error ? err.message : "erro"
          }`,
        );
      }
    }

    const ag = agregarCiclo(resumos);
    await this.scheduler.registrarCiclo({ ...ag, nota: null }).catch(() => undefined);
    if (ag.varridas > 0) {
      this.logger.log(
        `Ciclo Clicksign concluído: varridas=${ag.varridas}, assinados=${ag.assinados}, ` +
          `expirados=${ag.expirados}, falhas=${ag.falhas}.`,
      );
    }
  }

  /**
   * Processa 1 envelope: closed → arquiva assinado; canceled → CANCELADO; passou do prazo → EXPIRADO;
   * demais → segue aguardando.
   *
   * A ORDEM IMPORTA. O prazo só é avaliado DEPOIS de closed e canceled: um envelope assinado no
   * último dia do prazo, cujo ciclo só rodou depois do vencimento, tem de ser ARQUIVADO, não expirado.
   * O prazo é o último recurso, para o registro não ficar AGUARDANDO para sempre quando a Clicksign
   * não devolve estado terminal (ela mantém `running` depois do `deadline_at`).
   */
  /**
   * Guarda "quem assinou, quem falta" na própria admissão, para a tela LER em vez de PERGUNTAR.
   *
   * O DETECTOR DE MUDANÇA é o que torna isto barato. Os signatários vêm de graça no GET que o tick já
   * faz (`?include=signers`), mas saber QUEM assinou exige o `/events`, que é uma requisição a mais.
   * Como o `modified` do envelope muda quando alguém assina, comparar com o do ciclo anterior diz se
   * vale a pena perguntar. Em regime quase nada muda entre dois ciclos, então o custo tende a zero.
   *
   * O painel é regravado ainda que só o elenco mude (um signatário adicionado), porque o "de Y" da
   * tela vem dele.
   *
   * §A.6: o `/events` devolve e-mail, CPF, IP e geolocalização. Só o `AssinanteStatus` do domínio
   * (nome, assinou, quando, ordem) é persistido; o resto morre no cliente.
   *
   * NÃO LANÇA: painel é conveniência de leitura, e falhar aqui não pode derrubar a varredura, que tem
   * trabalho mais importante a fazer (arquivar assinado, marcar expirado).
   */
  private async atualizarPainelAssinatura(
    admissaoId: string,
    envelopeId: string,
    signers: Array<{ id: string; nome: string; grupo: number | null }>,
    modified: string | null,
    atual: { modificadoAntes: string | null; temPainel: boolean },
  ): Promise<void> {
    try {
      // Nada mudou no envelope E o painel já existe: não há o que perguntar nem o que gravar.
      const inalterado = modified !== null && atual.modificadoAntes === modified && atual.temPainel;
      if (inalterado) return;

      const eventos = await this.api.listarEventosAssinatura(envelopeId);
      const painel = montarAssinantes(signers, eventos);

      await this.db
        .update(admissoes)
        .set({
          clicksignAssinantes: painel,
          clicksignAssinantesEm: new Date(),
          clicksignEnvelopeModified: modified,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, admissaoId));
    } catch {
      // §A.6: só o id da admissão, nunca nome, e-mail ou id de envelope.
      this.logger.warn(
        `Painel de assinatura não atualizado nesta passada (admissão ${admissaoId}). ` +
          "A tela mostra o último conhecido; o próximo ciclo tenta de novo.",
      );
    }
  }

  private async processarEnvelope(
    admissaoId: string,
    envelopeId: string,
    enviadoEm: Date | null,
    painel: { modificadoAntes: string | null; temPainel: boolean } = {
      modificadoAntes: null,
      temPainel: false,
    },
  ): Promise<ResumoEnvelope> {
    const r = await this.api.consultarEnvelopeComSignatarios(envelopeId);
    if (!r) return {};

    // PAINEL DE ASSINATURA: alimentado aqui, lido pela tela. Antes a tela perguntava isso à Clicksign
    // a cada abertura (2 requisições × 110 linhas = 220), o que virou 60s de espera depois do
    // limitador. Aqui sai quase de graça, porque os signatários vieram no mesmo GET.
    await this.atualizarPainelAssinatura(admissaoId, envelopeId, r.signers, r.modified, painel);

    if (r.status === "canceled") {
      await this.db
        .update(admissoes)
        .set({ clicksignStatus: "CANCELADO", atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));
      this.logger.log(`Envelope cancelado na Clicksign (admissão ${admissaoId}).`);
      return {};
    }

    if (r.status === "closed") {
      const arquivado = await this.arquivarAssinado(admissaoId, envelopeId);
      return { assinado: arquivado };
    }

    // Ainda running/draft na Clicksign. Passou do prazo que o próprio EA mandou no `deadline_at`?
    if (envelopeExpirado(enviadoEm, Date.now())) {
      await this.db
        .update(admissoes)
        .set({ clicksignStatus: "EXPIRADO", atualizadoEm: new Date() })
        .where(eq(admissoes.id, admissaoId));
      this.logger.warn(
        `Envelope EXPIRADO por prazo, sem assinatura (admissão ${admissaoId}). Exige reenvio.`,
      );
      return { expirado: true };
    }

    return {}; // segue aguardando
  }

  /**
   * Baixa o contrato assinado (URL S3 ~5min) SÍNCRONO no mesmo ciclo, salva na staging, arquiva no
   * Drive (subpasta ADMISSAO) e persiste a URL da pasta (referência, não binário — regra 7). A URL
   * de download NUNCA é logada/persistida (§A.6); o buffer é descartado. Sem pasta-pai mapeada → não
   * arquiva (mantém AGUARDANDO para tentar de novo).
   *
   * Devolve se ARQUIVOU de fato neste ciclo (alimenta a contagem `assinados` do ciclo). Todo caminho
   * de desistência devolve false e deixa o registro em AGUARDANDO, para o próximo ciclo retentar.
   */
  private async arquivarAssinado(admissaoId: string, envelopeId: string): Promise<boolean> {
    const adm = await this.carregarAdmissao(admissaoId);
    if (!adm) return false;
    const kitAnexado = adm.kitAssinaturaPath;

    const pastaPaiId = await this.drivePastaPai.resolver(adm.tipoContrato, adm.codCliente);
    if (!pastaPaiId) {
      this.logger.warn(
        `Contrato assinado não arquivado: sem pasta-pai do Drive para a admissão ${admissaoId}.`,
      );
      return false;
    }

    const url = await this.api.obterUrlAssinado(envelopeId);
    if (!url) {
      this.logger.warn(`Envelope closed sem URL de documento assinado (admissão ${admissaoId}).`);
      return false;
    }

    // Download síncrono — a URL expira em ~5min. Só em memória, nunca logada (§A.6).
    let buffer: Buffer | undefined;
    let stagingPath: string | undefined;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Download do contrato assinado falhou (HTTP ${res.status}).`);
        return false;
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

      // ASSINADO: o kit sai do olho da tela de assinaturas. A partir daqui o documento vive no
      // PRONTUÁRIO (Drive) e é lá que se consulta; manter a cópia efêmera seria duplicar a verdade.
      await this.db
        .update(admissoes)
        .set({
          contratoAssinadoDriveUrl: pastaUrl,
          clicksignStatus: "ASSINADO",
          kitAssinaturaPath: null,
          kitAssinaturaEm: null,
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, admissaoId));
      if (kitAnexado) await this.staging.removerArquivo(kitAnexado).catch(() => undefined);
      await recomputeFarolGlobal(this.db, admissaoId);
      this.logger.log(`Contrato assinado arquivado no Drive (admissão ${admissaoId}).`);
      return true;
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
        // Item 7: define QUEM assina pela empresa quando o cliente tem mais de um contrato.
        clienteVinculoId: admissoes.clienteVinculoId,
        clicksignEnvelopeId: admissoes.clicksignEnvelopeId,
        clicksignStatus: admissoes.clicksignStatus,
        candidatoNome: candidatos.nome,
        candidatoCpf: candidatos.cpf,
        candidatoEmail: candidatos.email,
        clienteOperacao: clientes.nomeOperacao,
        pausadaEm: admissoes.pausadaEm,
        kitAssinaturaPath: admissoes.kitAssinaturaPath,
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
