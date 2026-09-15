import "reflect-metadata";
import type { Response } from "express";
import type { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeWebhookController } from "./pandape-webhook.controller";
import { PandapeQueueService } from "./pandape-queue.service";
import { PandapeSyncService } from "./pandape-sync.service";
import { PANDAPE_QUEUE_OPTIONS } from "./pandape.queue";
import type { PandapeApiService, PandaperPrecollaborator } from "./pandape-api.service";
import type { AdmissoesService } from "../admissoes/admissoes.service";
import type { AuditoriaService } from "../auditoria/auditoria.service";

/**
 * ─ A FILA DE ENTRADA DO PANDAPÉ: OS SEIS DESFECHOS E O SILÊNCIO QUE ACABOU ───────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita JUNTO com a construção e ANTES dela (§A.40 regra 2).
 * Nada disto existe quando este arquivo nasce: todo teste aqui FALHA de propósito. Quem constrói
 * faz passar. O contrato de DADOS (tabela, enums, régua pura) vive em
 * `domain/pandape-entrada.tester.spec.ts`; aqui está o COMPORTAMENTO das duas pontas.
 *
 * ┌─ O CONTRATO QUE ESTES TESTES IMPÕEM, em uma tela ───────────────────────────────────────────┐
 * │ 1. `pandape/pandape-entrada.service.ts` exporta `PandapeEntradaService` com                  │
 * │      registrarRecebimento({ idPrecollaborator, idMatch?, idVacancy?, origem })               │
 * │      registrarDesfecho({ idPrecollaborator, desfecho, admissaoId?, motivo? })                │
 * │ 2. `PandapeWebhookController` passa a receber (queue, entradas), nesta ordem.                │
 * │ 3. `PandapeSyncService` passa a receber `entradas` como 8º argumento do construtor.          │
 * │ Os NOMES acima são escolha deste tester e podem ser trocados pelo coordenador; o que NÃO é   │
 * │ negociável é que exista UM ponto de escrita para os dois momentos (chegou / terminou), em    │
 * │ vez de cada caminho gravando do seu jeito.                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE OS CONSTRUTORES SÃO CHAMADOS POR UM ALIAS SOLTO ───────────────────────────────────
 * O argumento novo ainda não existe na assinatura, e passá-lo direto deixaria o `tsc --noEmit` do
 * backend inteiro vermelho enquanto a construção não acontece. Typecheck vermelho por ausência
 * esconde typecheck vermelho de verdade. Com o alias, o typecheck segue verde e a falta aparece
 * como FALHA DE TESTE legível ("esperava registrarDesfecho, não foi chamado"), que é onde ela
 * deve aparecer.
 *
 * §A.6: nenhum CPF, nome, e-mail ou payload é impresso por este arquivo. Os valores de fixture são
 * de FICÇÃO e existem só para provar que eles NÃO chegam ao que é gravado.
 */

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Fixtures e dublês
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** CPF de FICÇÃO com dígito válido. Nunca é impresso; serve para o caminho feliz existir. */
const CPF_VALIDO_FICTICIO = "52998224725";
/** O que o Pandapé devolve ANTES de a pessoa preencher o formulário. É a origem do caso real. */
const CPF_ZERADO = "00000000000";

function pc(over: Partial<PandaperPrecollaborator> = {}): PandaperPrecollaborator {
  return {
    idPreCollaborator: "PC-1",
    idMatch: "M-1",
    idVacancy: "V-1",
    etapa: "DOCUMENTACAO",
    nome: "Fulano De Tal",
    cpf: CPF_VALIDO_FICTICIO,
    documents: [],
    ...over,
  };
}

/** db mock: só os acessos que a sync usa (mesmo molde de `pandape-sync.service.spec.ts`). */
function makeDb() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const select = vi.fn(() => ({
    from: () => ({ where: () => Promise.resolve([] as Array<{ hashConteudo: string }>) }),
  }));
  const insert = vi.fn(() => ({
    values: () => ({ onConflictDoNothing: () => Promise.resolve(undefined) }),
  }));
  return {
    query: {
      integracaoPandape: { findFirst: vi.fn().mockResolvedValue(undefined) },
      clientes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      cargos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(undefined) },
      usuarios: { findFirst: vi.fn().mockResolvedValue(undefined) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(undefined) },
      candidatos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
    select,
    insert,
    update,
  };
}

function makeApi(over: Record<string, unknown> = {}): PandapeApiService {
  return {
    estaAtivo: vi.fn(() => true),
    listarMudancas: vi.fn().mockResolvedValue([]),
    getPrecollaborator: vi.fn().mockResolvedValue(pc()),
    getVacancy: vi.fn().mockResolvedValue(undefined),
    getMatch: vi.fn().mockResolvedValue(undefined),
    getFormulariosDocumentos: vi.fn().mockResolvedValue([]),
    ...over,
  } as unknown as PandapeApiService;
}

/** O dublê do registro durável: as duas escritas que a frente inteira existe para garantir. */
function makeEntradas() {
  return {
    registrarRecebimento: vi.fn().mockResolvedValue(undefined),
    registrarDesfecho: vi.fn().mockResolvedValue(undefined),
  };
}

type Entradas = ReturnType<typeof makeEntradas>;

/** Construtor solto: o argumento novo ainda não existe na assinatura (ver cabeçalho). */
function novoSync(parts: {
  db: ReturnType<typeof makeDb>;
  api: PandapeApiService;
  entradas: Entradas;
  admissoes?: Record<string, unknown>;
  queue?: Record<string, unknown>;
}): PandapeSyncService {
  const queue = {
    enfileirarTick: vi.fn().mockResolvedValue(undefined),
    enfileirarCandidato: vi.fn().mockResolvedValue(true),
    enfileirarPullDocumentos: vi.fn().mockResolvedValue(true),
    ...parts.queue,
  };
  const admissoes = {
    create: vi.fn().mockResolvedValue({ admissaoId: "adm-1" }),
    criarPreAdmissao: vi.fn().mockResolvedValue({ admissaoId: "pre-1" }),
    vivasPorCpf: vi.fn().mockResolvedValue([]),
    adotarEventoPandape: vi.fn().mockResolvedValue(undefined),
    ...parts.admissoes,
  } as unknown as AdmissoesService;
  const auditoria = {
    auditarConjunto: vi.fn().mockResolvedValue({ documento: {}, progresso: {} }),
  } as unknown as AuditoriaService;
  const config = { get: () => undefined } as unknown as ConfigService;
  const scheduler = { estaLigado: vi.fn().mockResolvedValue(true) };
  const Ctor = PandapeSyncService as unknown as new (...args: unknown[]) => PandapeSyncService;
  return new Ctor(
    parts.db,
    config,
    parts.api,
    queue,
    admissoes,
    auditoria,
    scheduler,
    parts.entradas,
  );
}

function fakeRes(): Response & { statusCode: number } {
  const res = {
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number };
}

function novoWebhook(
  enfileirar: ReturnType<typeof vi.fn>,
  entradas: Entradas,
): PandapeWebhookController {
  const Ctor = PandapeWebhookController as unknown as new (
    ...args: unknown[]
  ) => PandapeWebhookController;
  return new Ctor({ enfileirarCandidato: enfileirar }, entradas);
}

/** O desfecho registrado para um id, entre todas as chamadas. `undefined` = ninguém registrou. */
function desfechoDe(entradas: Entradas, id: string): Record<string, unknown> | undefined {
  const chamada = entradas.registrarDesfecho.mock.calls
    .map((c) => c[0] as Record<string, unknown>)
    .find((arg) => arg?.idPrecollaborator === id);
  return chamada;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. A PORTA: o evento vira linha ANTES de virar job
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("webhook: grava a entrada ANTES de enfileirar", () => {
  /**
   * ─ A ORDEM É O REQUISITO, NÃO UM DETALHE DE IMPLEMENTAÇÃO ──────────────────────────────────
   * Gravar depois de enfileirar abre uma janela em que o job já existe e a linha não: o worker
   * pode rodar, terminar e tentar carimbar o desfecho de uma linha que ainda não foi criada. É a
   * mesma classe de erro da INT-4, onde notificar antes de gravar o envelope duplicava o envelope
   * na retentativa (§A.5). Registro primeiro, efeito depois, sempre.
   */
  it("registra o recebimento e SÓ ENTÃO enfileira", async () => {
    const enfileirar = vi.fn().mockResolvedValue(true);
    const entradas = makeEntradas();
    const res = fakeRes();

    await novoWebhook(enfileirar, entradas).receber({ IdPreCollaborator: "423673" }, res);

    expect(entradas.registrarRecebimento).toHaveBeenCalledTimes(1);
    expect(enfileirar).toHaveBeenCalledTimes(1);
    const ordemRegistro = entradas.registrarRecebimento.mock.invocationCallOrder[0] ?? Infinity;
    const ordemFila = enfileirar.mock.invocationCallOrder[0] ?? -Infinity;
    expect(ordemRegistro).toBeLessThan(ordemFila);
    expect(res.statusCode).toBe(202);
  });

  /** A origem separa o que o ATS mandou do que alguém clicou. Sem ela o reprocesso some no volume. */
  it("carimba origem WEBHOOK", async () => {
    const entradas = makeEntradas();
    await novoWebhook(vi.fn().mockResolvedValue(true), entradas).receber(
      { IdPreCollaborator: "423673" },
      fakeRes(),
    );
    expect(entradas.registrarRecebimento).toHaveBeenCalledWith(
      expect.objectContaining({ idPrecollaborator: "423673", origem: "WEBHOOK" }),
    );
  });

  /**
   * ─ §A.6 NA PORTA DE ENTRADA ────────────────────────────────────────────────────────────────
   * O payload do Pandapé é gordo e tem dado pessoal dentro. O caminho mais curto para "depurar
   * depois" é empurrar o payload inteiro para o registro. Este teste fecha essa porta na origem:
   * o que atravessa é uma lista fechada de identificadores de SISTEMA.
   */
  it("passa SÓ identificadores do ATS, nunca o payload (§A.6)", async () => {
    const entradas = makeEntradas();
    await novoWebhook(vi.fn().mockResolvedValue(true), entradas).receber(
      {
        IdPreCollaborator: "423673",
        Cpf: CPF_VALIDO_FICTICIO,
        Name: "Fulano",
        Email: "f@example.com",
      } as Record<string, unknown>,
      fakeRes(),
    );

    const arg = entradas.registrarRecebimento.mock.calls[0]?.[0] as Record<string, unknown>;
    const permitidas = ["idPrecollaborator", "idMatch", "idVacancy", "origem", "etapa"];
    expect(Object.keys(arg ?? {}).filter((k) => !permitidas.includes(k))).toEqual([]);
    expect(JSON.stringify(arg)).not.toContain(CPF_VALIDO_FICTICIO);
    expect(JSON.stringify(arg).toUpperCase()).not.toContain("FULANO");
  });

  /**
   * ─ O CASO QUE PROVA QUE A TABELA NÃO É ENFEITE DA FILA ─────────────────────────────────────
   * Redis fora é exatamente quando o registro durável mais vale: sem ele, o 503 é a única memória
   * do evento, e ela vive no log do Pandapé, não no EA. A linha fica gravada como RECEBIDO,
   * pendente, e aparece na tela mesmo que nenhum job tenha existido um segundo sequer.
   */
  it("fila indisponível: 503, mas a linha JÁ está gravada", async () => {
    const entradas = makeEntradas();
    const res = fakeRes();

    const out = await novoWebhook(vi.fn().mockResolvedValue(false), entradas).receber(
      { IdPreCollaborator: "423673" },
      res,
    );

    expect(entradas.registrarRecebimento).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(503);
    expect(out).toEqual({ enfileirado: false });
  });

  /**
   * FALHAR AO REGISTRAR É FALHAR O WEBHOOK. Enfileirar com o registro quebrado recria o buraco
   * atual (job sem rastro durável) com a agravante de ninguém saber. 503 faz o Pandapé reentregar,
   * que é o comportamento que a §A.5 já escolheu para a fila fora.
   * DECISÃO EXPLÍCITA deste tester, marcada para o diretor confirmar.
   */
  it("registro falhou: responde 503 e NÃO enfileira (não cria job sem rastro)", async () => {
    const entradas = makeEntradas();
    entradas.registrarRecebimento.mockRejectedValue(new Error("banco fora"));
    const enfileirar = vi.fn().mockResolvedValue(true);
    const res = fakeRes();

    const out = await novoWebhook(enfileirar, entradas).receber(
      { IdPreCollaborator: "423673" },
      res,
    );

    expect(enfileirar).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(out).toEqual({ enfileirado: false });
  });

  /** Sem id não há evento identificável: 400, e NADA é gravado (linha órfã não se cria). */
  it("payload sem id: 400 e nenhum registro", async () => {
    const entradas = makeEntradas();
    await expect(
      novoWebhook(vi.fn(), entradas).receber({ outra: "coisa" }, fakeRes()),
    ).rejects.toThrow();
    expect(entradas.registrarRecebimento).not.toHaveBeenCalled();
  });

  /**
   * ─ A RE-ENTREGA NÃO PODE DUPLICAR, E A TRAVA NÃO MUDA DE LUGAR ─────────────────────────────
   * O controller continua NÃO deduplicando (é o contrato atual, e mudar isso moveria a trava para
   * a camada errada). Duas entregas = duas escritas, e a não-duplicação é do UNIQUE em
   * `id_precollaborator` (provado em `domain/pandape-entrada.tester.spec.ts`), que é o mesmo
   * desenho já usado pelo `jobId cand-<id>` e pelo unique de `integracao_pandape`.
   */
  it("mesma entrega 2x: registra 2x com o MESMO id (quem não duplica é o unique, não o controller)", async () => {
    const entradas = makeEntradas();
    const enfileirar = vi.fn().mockResolvedValue(true);
    const ctrl = novoWebhook(enfileirar, entradas);

    await ctrl.receber({ IdPreCollaborator: "423673" }, fakeRes());
    await ctrl.receber({ IdPreCollaborator: "423673" }, fakeRes());

    expect(entradas.registrarRecebimento).toHaveBeenCalledTimes(2);
    const ids = entradas.registrarRecebimento.mock.calls.map(
      (c) => (c[0] as { idPrecollaborator: string }).idPrecollaborator,
    );
    expect(ids).toEqual(["423673", "423673"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O TICK: a outra porta, que hoje enfileira do mesmo jeito e some do mesmo jeito
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("tick: o que entra por re-sync também vira linha", () => {
  /**
   * O valor TICK existe no enum do requisito, então alguém tem de escrevê-lo. Se só o webhook
   * registrar, um re-sync pontual de um id conhecido (o uso que sobrou do tick, §A.5) volta a ser
   * invisível, e a fila passa a mentir por omissão em vez de por erro.
   */
  it("cada id descoberto no tick é registrado com origem TICK", async () => {
    const entradas = makeEntradas();
    const api = makeApi({ listarMudancas: vi.fn().mockResolvedValue(["A-1", "A-2"]) });
    const svc = novoSync({ db: makeDb(), api, entradas });

    await svc.processarTick();

    expect(entradas.registrarRecebimento).toHaveBeenCalledTimes(2);
    for (const chamada of entradas.registrarRecebimento.mock.calls) {
      expect(chamada[0]).toMatchObject({ origem: "TICK" });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. OS DESFECHOS: os cinco caminhos que hoje terminam calados
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("worker: TODO caminho de processarCandidato termina com desfecho registrado", () => {
  /** (1) de/para resolvido: a admissão nasce na esteira. */
  it("de/para resolvido: ADMISSAO_CRIADA com o id da admissão", async () => {
    const db = makeDb();
    db.query.clientes.findFirst.mockResolvedValue({ codCliente: "C-10" });
    db.query.cargos.findFirst.mockResolvedValue({ id: "cargo-1" });
    const api = makeApi({
      getVacancy: vi
        .fn()
        .mockResolvedValue({ idVacancy: "V-1", clienteCnpj: "12345678000190", cargoNome: "Op" }),
    });
    const entradas = makeEntradas();

    await novoSync({ db, api, entradas }).processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({
      desfecho: "ADMISSAO_CRIADA",
      admissaoId: "adm-1",
    });
  });

  /**
   * (2) sem de/para: nasce a PRÉ-ADMISSÃO. Sai desta fila porque tem a própria (Liberação), e
   * cobrar a mesma pendência em duas telas é garantir que ninguém trabalhe em nenhuma.
   */
  it("sem de/para: PRE_ADMISSAO com o id da pré-admissão", async () => {
    const entradas = makeEntradas();
    await novoSync({ db: makeDb(), api: makeApi(), entradas }).processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({
      desfecho: "PRE_ADMISSAO",
      admissaoId: "pre-1",
    });
  });

  /** (3) B1: mesma pessoa + mesma vaga viva. O evento é adotado, nada nasce, e isso É um desfecho. */
  it("adoção em admissão viva (B1): ADOTADO com o id da admissão que absorveu", async () => {
    const entradas = makeEntradas();
    const svc = novoSync({
      db: makeDb(),
      api: makeApi(),
      entradas,
      admissoes: {
        vivasPorCpf: vi.fn().mockResolvedValue([{ id: "adm-viva", idVacancy: "V-1" }]),
      },
    });

    await svc.processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({
      desfecho: "ADOTADO",
      admissaoId: "adm-viva",
    });
  });

  /** (4) conhecido, mesma etapa: no-op de verdade. Não é pendência, e tem de sair da fila. */
  it("conhecido com a MESMA etapa: NO_OP", async () => {
    const db = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue({
      id: "ip-1",
      etapa: "DOCUMENTACAO",
      admissaoId: "adm-9",
    });
    const entradas = makeEntradas();

    await novoSync({ db, api: makeApi(), entradas }).processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({ desfecho: "NO_OP" });
  });

  /** (5) conhecido com etapa NOVA: atualiza a etapa e ainda assim registra. Silêncio é o defeito. */
  it("conhecido com etapa diferente: atualiza a etapa E registra NO_OP (não some)", async () => {
    const db = makeDb();
    db.query.integracaoPandape.findFirst.mockResolvedValue({
      id: "ip-1",
      etapa: "TRIAGEM",
      admissaoId: "adm-9",
    });
    const entradas = makeEntradas();

    await novoSync({ db, api: makeApi(), entradas }).processarCandidato("PC-1");

    expect(db.update).toHaveBeenCalled();
    expect(desfechoDe(entradas, "PC-1")).toMatchObject({ desfecho: "NO_OP" });
  });

  /**
   * ─ (6) O CAMINHO QUE MAIS PREOCUPA: A EXCEÇÃO NO MEIO ──────────────────────────────────────
   * É literalmente o caso medido: `criarPreAdmissao` estoura "CPF inválido", o erro sobe, o BullMQ
   * retenta, esgota e o job termina sem que nada no EA saiba que existiu uma pessoa ali.
   *
   * As DUAS asserções abaixo são igualmente obrigatórias, e é fácil entregar só uma:
   *   . grava FALHOU com motivo classificado (senão o silêncio continua);
   *   . RELANÇA o erro (senão o job "passa", a retentativa some, e trocamos um silêncio por outro
   *     pior, porque agora o painel do BullMQ mostra verde).
   */
  it("exceção no meio: registra FALHOU com motivo classificado E RELANÇA o erro", async () => {
    const entradas = makeEntradas();
    const svc = novoSync({
      db: makeDb(),
      api: makeApi({ getPrecollaborator: vi.fn().mockResolvedValue(pc({ cpf: CPF_ZERADO })) }),
      entradas,
      admissoes: {
        criarPreAdmissao: vi.fn().mockRejectedValue(new Error("CPF inválido")),
      },
    });

    await expect(svc.processarCandidato("PC-1")).rejects.toThrow();

    const reg = desfechoDe(entradas, "PC-1");
    expect(reg).toMatchObject({ desfecho: "FALHOU" });
    expect(String(reg?.motivo)).toMatch(/^[A-Z][A-Z0-9_]*$/);
    expect(String(reg?.motivo)).not.toContain(CPF_ZERADO);
  });

  /**
   * (7) O ADIAMENTO CALADO. Hoje é um `logger.warn` e um `return`: do lado de fora, indistinguível
   * de sucesso. O job termina em `completed`, some da lista de falhados e ninguém re-tenta. É o
   * mesmo buraco da exceção, com a agravante de nem `failedReason` existir.
   */
  it("sem CPF e sem Match (adiamento): registra FALHOU em vez de retornar calado", async () => {
    const entradas = makeEntradas();
    const api = makeApi({
      getPrecollaborator: vi.fn().mockResolvedValue(pc({ cpf: undefined, idMatch: undefined })),
    });

    await novoSync({ db: makeDb(), api, entradas }).processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({ desfecho: "FALHOU" });
  });

  /** (8) O ATS não devolveu o pré-colaborador. Também termina calado hoje. */
  it("pré-colaborador não retornado pela API: registra FALHOU", async () => {
    const entradas = makeEntradas();
    const api = makeApi({ getPrecollaborator: vi.fn().mockResolvedValue(undefined) });

    await novoSync({ db: makeDb(), api, entradas }).processarCandidato("PC-1");

    expect(desfechoDe(entradas, "PC-1")).toMatchObject({ desfecho: "FALHOU" });
  });

  /**
   * (9) INERTE NÃO É FALHA. Ambiente sem credencial (homologação, máquina de quem desenvolve) não
   * pode encher a fila de FALHOU: isso treinaria todo mundo a ignorar a tela, que é o jeito mais
   * eficiente de matar uma fila de trabalho.
   */
  it("integração inerte (sem credencial): NÃO marca FALHOU", async () => {
    const entradas = makeEntradas();
    const api = makeApi({ estaAtivo: vi.fn(() => false) });

    await novoSync({ db: makeDb(), api, entradas }).processarCandidato("PC-1");

    const reg = desfechoDe(entradas, "PC-1");
    expect(reg?.desfecho).not.toBe("FALHOU");
  });

  /**
   * (10) A CORRIDA JÁ TRATADA. Dois eventos do mesmo pré-colaborador em voo: o unique de
   * `integracao_pandape` estoura 23505 e o código de hoje trata como "já existe". Isso é sucesso,
   * não falha, e marcar FALHOU aqui colocaria na fila alguém que JÁ TEM admissão, que é
   * exatamente o que a régua da §A.19 proíbe.
   */
  it("violação de unique (corrida): NÃO é FALHOU", async () => {
    const entradas = makeEntradas();
    const erro = Object.assign(new Error("duplicate key"), { code: "23505" });
    const svc = novoSync({
      db: makeDb(),
      api: makeApi(),
      entradas,
      admissoes: { criarPreAdmissao: vi.fn().mockRejectedValue(erro) },
    });

    await svc.processarCandidato("PC-1");

    const reg = desfechoDe(entradas, "PC-1");
    expect(reg?.desfecho).not.toBe("FALHOU");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. O CASO REAL, DE PONTA A PONTA: falha na primeira passada, nasce na segunda, sai da fila
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o caso medido: CPF zerado hoje, válido dias depois", () => {
  /**
   * ─ A HISTÓRIA INTEIRA EM UM TESTE ──────────────────────────────────────────────────────────
   * Primeira passada (11/09): o ATS devolve 00000000000 porque o evento sai na pasta "Convite de
   * admissão enviado", ANTES de a pessoa preencher. A criação estoura. A linha fica FALHOU e
   * PENDENTE, que é a diferença entre esta frente e o que existe hoje.
   *
   * Segunda passada (15/09, reprocesso): o mesmo id, o dado já preenchido, a pré-admissão nasce.
   * A MESMA linha é atualizada, ganha `resolvido_em` e SAI DA FILA. Nenhuma linha nova: é o mesmo
   * evento, e a fila conta eventos, não tentativas.
   */
  it("reprocesso do MESMO id faz nascer, atualiza a MESMA linha e tira da fila", async () => {
    const entradas = makeEntradas();
    const criarPreAdmissao = vi
      .fn()
      .mockRejectedValueOnce(new Error("CPF inválido"))
      .mockResolvedValueOnce({ admissaoId: "pre-423673" });
    const getPrecollaborator = vi
      .fn()
      .mockResolvedValueOnce(pc({ idPreCollaborator: "423673", cpf: CPF_ZERADO }))
      .mockResolvedValueOnce(pc({ idPreCollaborator: "423673", cpf: CPF_VALIDO_FICTICIO }));
    const svc = novoSync({
      db: makeDb(),
      api: makeApi({ getPrecollaborator }),
      entradas,
      admissoes: { criarPreAdmissao },
    });

    // 11/09 — a passada que hoje termina em silêncio.
    await expect(svc.processarCandidato("423673")).rejects.toThrow();
    expect(entradas.registrarDesfecho).toHaveBeenLastCalledWith(
      expect.objectContaining({ idPrecollaborator: "423673", desfecho: "FALHOU" }),
    );

    // 15/09 — reprocesso do MESMO id.
    await svc.processarCandidato("423673");
    expect(entradas.registrarDesfecho).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idPrecollaborator: "423673",
        desfecho: "PRE_ADMISSAO",
        admissaoId: "pre-423673",
      }),
    );

    // Os DOIS desfechos falam do MESMO id: uma linha, dois updates, nunca duas linhas.
    const ids = new Set(
      entradas.registrarDesfecho.mock.calls.map(
        (c) => (c[0] as { idPrecollaborator: string }).idPrecollaborator,
      ),
    );
    expect([...ids]).toEqual(["423673"]);
  });

  /**
   * §A.6 NO MOTIVO GRAVADO, provado no caminho real e não só na função pura. Este é o ponto onde
   * a mensagem crua entraria: `err.message` do `criarPreAdmissao` está ali, à mão, e copiar é uma
   * linha mais curta do que classificar.
   */
  it("o motivo gravado não carrega CPF nem nome (§A.6)", async () => {
    const entradas = makeEntradas();
    const svc = novoSync({
      db: makeDb(),
      api: makeApi({
        getPrecollaborator: vi.fn().mockResolvedValue(pc({ cpf: CPF_ZERADO, nome: "Fulano De Tal" })),
      }),
      entradas,
      admissoes: {
        criarPreAdmissao: vi
          .fn()
          .mockRejectedValue(new Error(`CPF ${CPF_ZERADO} de Fulano De Tal inválido`)),
      },
    });

    await expect(svc.processarCandidato("PC-1")).rejects.toThrow();

    const motivo = String(desfechoDe(entradas, "PC-1")?.motivo ?? "");
    expect(motivo).not.toContain(CPF_ZERADO);
    expect(motivo.toUpperCase()).not.toContain("FULANO");
    expect(motivo).not.toMatch(/\d{11}/);
    expect(motivo).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. O ESPAÇAMENTO: cinco tentativas em dez segundos nunca vão alcançar um dado que leva dias
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("re-tentativa espaçada em horas/dias", () => {
  function servicoComQueueFake(add: ReturnType<typeof vi.fn>): PandapeQueueService {
    const svc = new PandapeQueueService({ get: () => undefined } as never);
    (svc as unknown as { queue: { add: typeof add } }).queue = { add };
    return svc;
  }

  /** Opções efetivas do job: o default da fila, sobrescrito pelo que o `add` passar. */
  function optsEfetivas(add: ReturnType<typeof vi.fn>): Record<string, unknown> {
    const doAdd = (add.mock.calls[0]?.[2] ?? {}) as Record<string, unknown>;
    return { ...(PANDAPE_QUEUE_OPTIONS.defaultJobOptions ?? {}), ...doAdd };
  }

  /** Os intervalos ATÉ cada retentativa, em ms, derivados da política declarada no job. */
  function agenda(opts: Record<string, unknown>): number[] {
    const attempts = Number(opts.attempts ?? 1);
    const backoff = opts.backoff as { type?: string; delay?: number } | number | undefined;
    const tipo = typeof backoff === "object" ? (backoff?.type ?? "fixed") : "fixed";
    const base = typeof backoff === "object" ? Number(backoff?.delay ?? 0) : Number(backoff ?? 0);
    if (tipo !== "exponential" && tipo !== "fixed") {
      throw new Error(
        `CONTRATO NÃO ATENDIDO: backoff "${tipo}" é uma estratégia customizada e este teste não ` +
          `consegue medir o espaçamento. Exponha a agenda (array de ms) como export do módulo da ` +
          `fila para que ela possa ser medida, em vez de ficar escondida numa função.`,
      );
    }
    const intervalos: number[] = [];
    for (let i = 1; i < attempts; i += 1) {
      intervalos.push(tipo === "exponential" ? base * 2 ** (i - 1) : base);
    }
    return intervalos;
  }

  /**
   * ─ O NÚMERO QUE O CASO REAL DEU ────────────────────────────────────────────────────────────
   * Cinco tentativas, dez segundos, dado que só ficou válido DIAS depois. A primeira retentativa
   * precisa cair em HORAS, não em segundos: o candidato precisa de tempo para preencher o
   * formulário, e nenhuma quantidade de tentativas dentro do mesmo minuto o faz preencher mais
   * rápido. Só gasta o rate limit compartilhado com o webhook da folha (§A.5).
   */
  it("a PRIMEIRA retentativa do sync-candidate cai em pelo menos 1 hora", async () => {
    const add = vi.fn().mockResolvedValue({});
    await servicoComQueueFake(add).enfileirarCandidato("423673");

    const intervalos = agenda(optsEfetivas(add));
    expect(intervalos.length).toBeGreaterThan(0);
    expect(intervalos[0]).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  /**
   * A ÚLTIMA TENTATIVA PRECISA ALCANÇAR O DIA SEGUINTE. O evento chega quando o convite é enviado;
   * a pessoa preenche quando puder. Uma janela total menor que 24h desiste antes de a vida real
   * acontecer, que foi exatamente o que aconteceu.
   */
  it("a janela total das tentativas cobre pelo menos 24 horas", async () => {
    const add = vi.fn().mockResolvedValue({});
    await servicoComQueueFake(add).enfileirarCandidato("423673");

    const total = agenda(optsEfetivas(add)).reduce((s, ms) => s + ms, 0);
    expect(total).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
  });

  /** Regressão explícita do valor que produziu o caso: 2s exponencial não pode voltar por descuido. */
  it("não é mais o backoff de 2 segundos", async () => {
    const add = vi.fn().mockResolvedValue({});
    await servicoComQueueFake(add).enfileirarCandidato("423673");

    const backoff = optsEfetivas(add).backoff as { delay?: number } | undefined;
    expect(Number(backoff?.delay ?? 0)).toBeGreaterThan(2000);
  });

  /**
   * ─ O REPROCESSO DA TELA NÃO PODE SER ENGOLIDO PELO PRÓPRIO jobId ───────────────────────────
   * Achado de leitura, e é o defeito mais provável desta frente inteira: `cand-<id>` é estável
   * PARA SEMPRE, e o BullMQ recusa, calado, um `add` com jobId que ainda consta no conjunto de
   * concluídos (`removeOnComplete: 1000`). O botão "reprocessar" do caso real cairia exatamente
   * aí: o id JÁ rodou, o job antigo ainda está na lista, o novo é descartado sem erro, e a tela
   * mostra "reprocessado" para uma coisa que nunca rodou. Um silêncio novo dentro da frente que
   * existe para acabar com o silêncio.
   *
   * Este projeto JÁ tropeçou nisto e já tem a correção escrita ao lado, em
   * `enfileirarPullDocumentos` ("sem ele, o jobId estável já consta como concluído e a nova
   * solicitação seria descartada calada"): um SUFIXO no jobId. O contrato aqui reusa aquele
   * precedente. O nome do parâmetro é negociável; o que não é negociável é o jobId sair diferente.
   */
  it("reprocesso manual produz jobId DIFERENTE do automático (senão o BullMQ engole calado)", async () => {
    const add = vi.fn().mockResolvedValue({});
    const svc = servicoComQueueFake(add);
    const comOpts = svc.enfileirarCandidato as unknown as (
      id: string,
      opts?: Record<string, unknown>,
    ) => Promise<boolean>;

    await comOpts.call(svc, "423673");
    await comOpts.call(svc, "423673", { jobIdSufixo: "manual-1" });

    const jobIdAutomatico = (add.mock.calls[0]?.[2] as { jobId: string }).jobId;
    const jobIdManual = (add.mock.calls[1]?.[2] as { jobId: string }).jobId;
    expect(jobIdAutomatico).toBe("cand-423673");
    expect(jobIdManual).not.toBe(jobIdAutomatico);
    expect(jobIdManual).not.toContain(":");
  });

  /**
   * ─ A TRAVA ANTIGA NÃO PODE SER QUEBRADA PELA NOVA ──────────────────────────────────────────
   * Mexer nas opções do job é mexer no mesmo objeto onde vive o `jobId cand-<id>`, que é a dedup
   * de jobs em voo e que já quebrou uma vez por causa de um caractere (o ":" que o BullMQ 5
   * rejeita, e que fazia TODO webhook real cair em 503). O espaçamento novo não pode encostar nele.
   */
  it("o jobId `cand-<id>` continua intacto (a dedup em voo não muda de lugar)", async () => {
    const add = vi.fn().mockResolvedValue({});
    const ok = await servicoComQueueFake(add).enfileirarCandidato("423673");

    expect(ok).toBe(true);
    const opts = add.mock.calls[0]?.[2] as { jobId: string };
    expect(opts.jobId).toBe("cand-423673");
    expect(opts.jobId).not.toContain(":");
  });
});
