import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { and, asc, eq } from "drizzle-orm";
import type IORedis from "ioredis";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  cargos,
  clientes,
  documentosAdmissao,
  integracaoPandape,
  tiposDocumento,
  usuarios,
} from "../db/schema";
import { AdmissoesService } from "../admissoes/admissoes.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import {
  PandapeApiService,
  type PandapeMatch,
  type PandaperPrecollaborator,
} from "./pandape-api.service";
import type { CandidatoInputDto, SexoValor } from "../admissoes/dto/create-admissao.dto";
import { PandapeQueueService } from "./pandape-queue.service";
import { resolverExtensaoDocumento } from "./mime-documento";
import { resolverTipoDocumento } from "./resolver-tipo-documento";
import {
  criarConexaoRedis,
  JOB_POLL_TICK,
  JOB_PULL_DOCS,
  JOB_SYNC_CANDIDATE,
  PANDAPE_QUEUE,
  PANDAPE_WORKER_OPTIONS,
  type PullDocsJobData,
  type SyncCandidateJobData,
} from "./pandape.queue";

/**
 * Teto de segurança da auditoria por conjunto (BLOCO 1): número máximo de arquivos do MESMO tipo
 * enviados numa única chamada à IA. Cobre frente/verso e páginas de carteira com folga; acima disso
 * (número absurdo), audita os primeiros e registra no log, para não estourar o payload do Vertex.
 */
const MAX_ARQUIVOS_CONJUNTO = 10;

/**
 * Lógica idempotente da sincronização Pandapé (Fase 5 / INT-1, OST §3) + o Worker BullMQ (consumidor).
 *
 * Idempotência ancorada no unique `idPrecollaborator` (uma admissão por pré-colaborador): dois ticks
 * sobre o MESMO payload não criam duas admissões. A criação reusa `AdmissoesService.create` com
 * `origem=PANDAPE` + `bypassAceite` (regra 5 — a sync nunca trava por campos pendentes). O pull de
 * docs reusa `AuditoriaService.auditarBuffer` (F2 incremental). URLs do Pandapé só em memória; nunca
 * em banco/log. CPF nunca é logado (§A.6).
 *
 * TODO — REMAP COMPLETO DO SYNC = FOLLOW-UP (API v1 real, reportado ao diretor):
 *  - CPF/telefone/dataNascimento: NÃO vêm de PreCollaborator/Get → enriquecer via `api.getMatch(idMatch)`
 *    (MatchModel). Hoje o sync lê `pc.cpf` (campo opcional do enrichment, ausente na API v1) → sem CPF
 *    a criação adia (não-bloqueio). Wire do getMatch é follow-up.
 *  - Cliente: a vaga (Vacancy/List) NÃO traz cliente/CNPJ → o de/para vaga→cod_cliente precisa de outra
 *    fonte (Client/List por `cif`=CNPJ + mapeamento do diretor, §A.9). Hoje adia sem inventar FK.
 *  - Cargo: usar `vacancyJob` (string) da vaga; normalização do catálogo é follow-up.
 *  - Etapa: NÃO vem de PreCollaborator/Get → vem do payload do webhook (INT-1). Sem ela, "conhecido"
 *    vira no-op (não atualiza etapa). Follow-up.
 *  - Discovery: a API v1 não lista pré-colaboradores novos → `listarMudancas()` retorna [] (depende de
 *    webhook ou id conhecido). Decisão de arquitetura pendente.
 */
/** O Match manda `birthDate` como datetime; a admissão quer YYYY-MM-DD. */
const DATA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sexo do Pandapé → sexo do EA, pelo dicionário OFICIAL (`GET /v1/Dictionary/Sex`, confirmado ao vivo
 * em 17/07): **1=Masculino, 2=Feminino, 0=Não Especificado**.
 *
 * Não é detalhe cosmético: o sexo condiciona a exigência da **Carteira de Reservista** na régua
 * padrão (só MASCULINO). Inverter o mapa cobraria Reservista de candidata mulher. "Não especificado"
 * e ausente viram `undefined` — o mesmo que o EA já faz com candidato sem sexo (não cobra Reservista),
 * em vez de chutar um valor.
 */
export function sexoDoPandape(idSex: number | string | undefined | null): SexoValor | undefined {
  if (idSex === undefined || idSex === null) return undefined;
  const v = String(idSex).trim();
  if (v === "1") return "MASCULINO";
  if (v === "2") return "FEMININO";
  return undefined;
}

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
      this.worker = new Worker(PANDAPE_QUEUE, async (job: Job) => this.processarJob(job), {
        connection: this.connection,
        ...PANDAPE_WORKER_OPTIONS,
      });
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
      return;
    }
    if (job.name === JOB_PULL_DOCS) {
      const { admissaoId, idPrecollaborator } = job.data as PullDocsJobData;
      await this.puxarDocumentosDaAdmissao(admissaoId, idPrecollaborator);
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
    // O `PreCollaborator/Get` NÃO traz CPF, telefone, nascimento nem sexo: tudo isso vem do MATCH
    // (`GET /v1/Match/Get?idMatch=`, confirmado no swagger oficial e ao vivo). O `idMatch` é a ponte,
    // e vem do próprio pré-colaborador. Sem esta chamada o CPF nunca chega e a sync adia para sempre.
    const match = pc.idMatch ? await this.api.getMatch(String(pc.idMatch)) : undefined;
    const dados = this.candidatoDoMatch(pc, match);

    if (!dados) {
      // §A.6: o motivo é logado, o dado pessoal NÃO. O `idPreCollaborator` é id do ATS (não é
      // atributo da pessoa) e vai junto de propósito: sem ele o evento adiado fica INVISÍVEL e
      // ninguém consegue reprocessar. Era o buraco: adiava calado.
      this.logger.warn(
        `Sync adiada (não-bloqueio) — idPreCollaborator=${pc.idPreCollaborator}, motivo: ${this.motivoAdiamento(pc, match)}.`,
      );
      return;
    }

    const pandapeOpts = {
      idPrecollaborator: pc.idPreCollaborator,
      idMatch: pc.idMatch,
      idVacancy: pc.idVacancy,
      etapa,
    };

    // TRAVA DE DEDUP (b) — antes de criar, olha as admissões VIVAS deste CPF (a idempotência por
    // idPrecollaborator, acima, já cobriu "mesmo evento 2x"; aqui pega mesma pessoa+vaga com id
    // DIFERENTE, ex.: pré-colaborador reemitido, ou histórico vivo que chega pelo webhook).
    //   B1: existe VIVA com o MESMO idVacancy → ADOTA o evento na existente, NÃO cria duplicata.
    //   B2: há VIVA sem idVacancy comparável → cria, mas MARCA "possível duplicata" (humano decide).
    //   B3: nenhuma VIVA (ou só de vaga diferente) → cria normal.
    const vivas = await this.admissoes.vivasPorCpf(dados.cpf);
    const mesmaVaga = pc.idVacancy ? vivas.find((v) => v.idVacancy === pc.idVacancy) : undefined;
    const possivelDuplicata =
      vivas.length > 0 && (!pc.idVacancy || vivas.some((v) => !v.idVacancy));

    const alvo = await this.resolverClienteCargo(pc.idVacancy);

    try {
      if (mesmaVaga) {
        // B1 — mesma pessoa + mesma vaga viva. Não duplica: adota o evento na admissão existente.
        await this.admissoes.adotarEventoPandape(mesmaVaga.id, pandapeOpts);
        this.logger.log(
          `Evento Pandapé adotado em admissão viva existente (mesmo CPF+vaga) — idPreCollaborator=${pc.idPreCollaborator}, sem duplicar.`,
        );
        return;
      }

      if (!alvo) {
        // Sem de/para vaga→cliente (manual por design, §A.9): NÃO adia mais. Cria a PRÉ-ADMISSÃO em
        // AGUARDANDO_LIBERACAO (candidato + IDs do Pandapé), SEM cliente/cargo/frentes/documentos. O
        // consultor atribui cliente+cargo na tela de Liberação Admissional e aí a admissão nasce.
        // NÃO puxa documentos: sem régua (= cliente+cargo) não há onde mapeá-los; o pull acontece
        // depois, no fluxo normal da esteira, após a liberação.
        await this.admissoes.criarPreAdmissao(dados, pandapeOpts, { possivelDuplicata });
        this.logger.log(
          `Pré-admissão criada (AGUARDANDO_LIBERACAO) — idPreCollaborator=${pc.idPreCollaborator}${possivelDuplicata ? " [possível duplicata]" : ""}.`,
        );
        return;
      }

      // Caminho completo (de/para resolvido): admissão nasce direto na esteira.
      const criada = await this.admissoes.create(
        { codCliente: alvo.codCliente, cargoId: alvo.cargoId, candidato: dados },
        undefined,
        { origem: "PANDAPE", bypassAceite: true, pandape: pandapeOpts },
      );
      // Pull de docs (F2 incremental) após o nascimento das frentes (regra 1).
      await this.puxarDocumentos(criada.admissaoId, pc.idPreCollaborator);
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
   * Monta o candidato a partir do pré-colaborador + do MATCH. Devolve `undefined` quando falta o
   * mínimo (CPF ou nome) — aí a criação adia, sem inventar nada.
   *
   * Origem de cada campo (só o que a API devolve DE FATO):
   *  - `cpf`      ← Match (11 dígitos, sem pontuação; `normalizeCpf` no `create` é no-op aqui).
   *  - `nome`     ← PreCollaborator `name` + `surname` (reais); o Match é fallback.
   *  - `email`    ← PreCollaborator (real); Match é fallback.
   *  - `telefone` ← Match (vem "11-987654321", cabe nos 30 do DTO; guardado como veio).
   *  - `dataNascimento` ← Match, fatiado de datetime para YYYY-MM-DD.
   *  - `sexo`     ← Match `idSex` pelo dicionário oficial.
   *
   * CEP/endereço do Match NÃO são mapeados (decisão do diretor): `candidatos` não tem esses campos e
   * `dadosVagaFolha.endereco` é o endereço de FOLHA (local de trabalho, vindo do cliente) — gravar o
   * endereço residencial ali corromperia o dado da folha.
   */
  private candidatoDoMatch(
    pc: PandaperPrecollaborator,
    match: PandapeMatch | undefined,
  ): CandidatoInputDto | undefined {
    const cpf = (pc.cpf ?? match?.cpf ?? "").trim();
    const nome = (
      pc.nome ??
      [pc.name, pc.surname].filter(Boolean).join(" ").trim() ??
      [match?.name, match?.surname].filter(Boolean).join(" ").trim()
    ).trim();
    if (!cpf || !nome) return undefined;

    const nascimento = String(match?.birthDate ?? "").slice(0, 10);
    return {
      cpf,
      nome,
      email: pc.email ?? match?.email,
      telefone: pc.telefone ?? match?.phone,
      dataNascimento: DATA_ISO_RE.test(nascimento) ? nascimento : undefined,
      sexo: sexoDoPandape(match?.idSex),
    };
  }

  /** Motivo legível do adiamento, SEM dado pessoal (§A.6) — só o que falta e de onde viria. */
  private motivoAdiamento(pc: PandaperPrecollaborator, match: PandapeMatch | undefined): string {
    if (!pc.idMatch) return "pré-colaborador sem idMatch (é a ponte até o CPF, no Match)";
    if (!match) return "Match não retornado pela API (inerte, id inexistente ou falha na chamada)";
    if (!match.cpf?.trim()) return "Match sem CPF preenchido";
    return "pré-colaborador sem nome";
  }

  /**
   * Pull de documentos (OST §4): baixa cada URL pública para um Buffer EM MEMÓRIA, mapeia o tipo e
   * audita via F2. A URL NUNCA toca banco nem log (§A.6). Tipo não mapeado → pula (não-bloqueio). O
   * buffer é descartado ao fim de cada documento. Roda sob um "usuário sistema" real (ver
   * `resolverUsuarioSistema`) porque o fechamento da régua grava um evento com autor (FK).
   */
  /**
   * Entrada PÚBLICA do pull, consumida pelo job `pull-docs` que a LIBERAÇÃO enfileira (§A.9). É o
   * mesmo pull do nascimento pelo webhook, só que disparado quando a admissão passa a ter régua
   * (cliente + cargo), que é o que dá destino a cada documento.
   *
   * Inerte sem token (não quebra ambiente sem credencial). Erro sobe para o backoff do BullMQ: o job
   * é retentado, e a LIBERAÇÃO já aconteceu e não é afetada (é job separado, fora da transação).
   */
  async puxarDocumentosDaAdmissao(admissaoId: string, idPrecollaborator: string): Promise<void> {
    if (!this.api.estaAtivo()) return;
    await this.puxarDocumentos(admissaoId, idPrecollaborator);
  }

  private async puxarDocumentos(admissaoId: string, idPrecollaborator: string): Promise<void> {
    const formularios = await this.api.getFormulariosDocumentos(idPrecollaborator);
    if (formularios.length === 0) return;

    const userSistema = await this.resolverUsuarioSistema();
    if (!userSistema) {
      this.logger.warn("Sem usuário sistema para auditar docs do Pandapé — pull adiado.");
      return;
    }

    for (const form of formularios) {
      const rotulo = (form.name ?? "").trim();
      const docs = (form.documents ?? []).filter((d) => d.link ?? d.url);
      if (docs.length === 0) continue; // formulário sem anexo: nada a puxar.

      const codigo = resolverTipoDocumento(rotulo);
      if (!codigo) {
        // BLOCO 2: NÃO descarta calado. O rótulo do FORMULÁRIO não é PII (é "Informações de Vale
        // Transporte", não o nome do arquivo), então vai ao log de propósito: é o que permite ver
        // que chegou algo sem destino. Nome de arquivo e URL seguem proibidos (§A.6).
        this.logger.warn(
          `Documento Pandapé SEM DESTINO no de/para (não auditado, nada perdido no Pandapé) — ` +
            `idPreCollaborator=${idPrecollaborator}, formulário="${rotulo}", arquivos=${docs.length}.`,
        );
        continue;
      }

      const tipo = await this.db.query.tiposDocumento.findFirst({
        where: eq(tiposDocumento.codigo, codigo),
      });
      if (!tipo) {
        this.logger.warn(`Tipo de documento '${codigo}' ausente no catálogo — pulado.`);
        continue;
      }

      // DEDUP (BLOCO 3): tipo já ENTREGUE nesta admissão não é reprocessado. É o que torna a
      // re-consulta futura (OST do scheduler) segura, sem baixar de novo o que já entrou.
      // O enum de `estado` tem só PENDENTE/ENTREGUE/INCONFORME: INCONFORME NÃO entra na trava de
      // propósito, porque documento reprovado deve poder ser reenviado e re-auditado.
      const jaTem = await this.db.query.documentosAdmissao.findFirst({
        where: and(
          eq(documentosAdmissao.admissaoId, admissaoId),
          eq(documentosAdmissao.tipoDocumentoId, tipo.id),
          eq(documentosAdmissao.estado, "ENTREGUE"),
        ),
      });
      if (jaTem) continue;

      // MÚLTIPLOS ARQUIVOS (BLOCO 1): auditoria por CONJUNTO. A "regra do primeiro" da CTPS está
      // REVOGADA (pegava só a página da foto e a régua reprovava por dados que estão na página de
      // qualificação): agora TODAS as páginas/lados vão juntos à IA, que localiza o exigido em
      // qualquer uma. Teto de segurança para não mandar um número absurdo de imagens numa chamada.
      const selecionados = docs.slice(0, MAX_ARQUIVOS_CONJUNTO);
      if (docs.length > MAX_ARQUIVOS_CONJUNTO) {
        this.logger.warn(
          `Formulário com ${docs.length} arquivos no tipo=${codigo}; auditando os primeiros ` +
            `${MAX_ARQUIVOS_CONJUNTO} (teto de segurança do conjunto).`,
        );
      } else if (docs.length > 1) {
        this.logger.log(
          `Formulário com múltiplos arquivos, tipo=${codigo}, arquivos=${docs.length}, ` +
            `auditados como um conjunto único.`,
        );
      }

      // Baixa TODOS os arquivos do tipo (URLs públicas, só em memória, §A.6) e monta o conjunto.
      const arquivos: Array<{ buffer: Buffer; originalname: string }> = [];
      try {
        for (const doc of selecionados) {
          const url = doc.link ?? doc.url;
          if (!url) continue;
          const res = await fetch(url);
          if (!res.ok) {
            this.logger.warn(`Download de documento do Pandapé falhou (HTTP ${res.status}), pulado.`);
            continue;
          }
          const buffer = Buffer.from(await res.arrayBuffer());
          // BLOCO A (fix do mime): o `originalname` é o CÓDIGO do tipo (nunca o nome real, §A.6), sem
          // extensão. Resolvemos a extensão pelo Content-Type (mime NÃO é PII) e, na falta, pelos
          // magic bytes, para a staging gravar COM extensão e a IA receber o mime correto.
          const ext = resolverExtensaoDocumento(res.headers.get("content-type"), buffer);
          arquivos.push({ buffer, originalname: `${codigo}${ext ?? ""}` });
        }
        if (arquivos.length === 0) continue; // nada baixável neste tipo.
        // UMA auditoria sobre o conjunto inteiro (BLOCO 1): um veredito, um registro por tipo. Os
        // buffers ficam SÓ em memória (§A.6) e são liberados ao fim desta iteração (escopo do form).
        await this.auditoria.auditarConjunto(admissaoId, tipo.id, arquivos, userSistema);
      } catch (err) {
        // BLOCO B/C: a coleta NÃO se perde. O documento já foi gravado como AGUARDANDO_AUDITORIA
        // antes da chamada da IA (ver `auditarConjunto`), então a falha aqui deixa só a AUDITORIA
        // pendente, visível na régua, reprocessável sem baixar de novo. §A.6: sem nome/URL.
        this.logger.warn(
          `Documento coletado do Pandapé mas auditoria falhou (fica AGUARDANDO_AUDITORIA, ` +
            `nada perdido): ${err instanceof Error ? err.message : "erro"}`,
        );
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
    // API v1: o cargo da vaga é `job` (string). `cargoNome` é o campo de/para legado (remap follow-up).
    const cargoNome = vaga.cargoNome ?? vaga.job;
    if (cargoNome) {
      const cargo = await this.db.query.cargos.findFirst({
        where: eq(cargos.nome, cargoNome),
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
    return { id: u.id, email: u.email, papel: u.papel, senhaTemporaria: u.senhaTemporaria };
  }

  /** Detecta violação de unique (Postgres 23505) — usado para tratar corrida como "já existe". */
  private ehViolacaoUnique(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    const code = (err as { code?: string }).code;
    return code === "23505";
  }
}
