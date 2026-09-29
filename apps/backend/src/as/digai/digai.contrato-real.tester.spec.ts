import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { isValidCpf } from "@ea/shared-types";
import { autorizar, GradeDigaiViolada } from "./digai-grade";
import { DigaiImportacaoService } from "./digai-importacao.service";
import type { DigaiRepositorio } from "./digai-repositorio";
import * as dominio from "../../domain/digai";
import {
  CAMPOS_COLETADOS_DO_DIGAI,
  chaveDoJobDigai,
  chaveDoRegistroDigai,
  erroDoRegistro,
  espelhoDaVagaDigai,
  etapaDoResultadoDigai,
  identificadoresDoEvento,
  mascararParaLog,
  planoDaImportacao,
  separarPorFinalizacaoDigai,
  admitidoNaIngestaoDigai,
  INGERIR_SOMENTE_QUEM_FINALIZOU,
  ETAPAS_DIGAI,
  projetarResultadoDigai,
  resumoDaImportacao,
  traduzirErroDeBanco,
  ETAPA_DIGAI_FINALIZOU,
  ETAPA_DIGAI_NAO_FINALIZOU,
} from "../../domain/digai";

/**
 * ─ O CONTRATO REAL DO DIGAI, MEDIDO NA PRODUCAO DO FORNECEDOR EM 29/09/2026 ────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e ele e a licao inteira da frente ─────────────────────────────┐
 * │ A ingestao do Digai tinha 174 TESTES VERDES sobre um contrato ERRADO. Os dubles foram         │
 * │ escritos a partir da DOCUMENTACAO do fornecedor, e a documentacao nao bate com a producao:    │
 * │ o envelope e outro, a versao da rota do par e outra, e o campo `name` NAO EXISTE. Nenhum dos  │
 * │ 174 testes ficou vermelho, porque todos perguntavam ao duble aquilo que o duble tinha sido    │
 * │ ensinado a responder.                                                                          │
 * │                                                                                                │
 * │ REGRA QUE FICA ESCRITA: duble que aceita uma forma que a PRODUCAO NUNCA EMITE nao e            │
 * │ tolerancia, e MENTIRA. Tolerar `{results:[...]}`, `{data:[...]}` e array no topo foi o que     │
 * │ permitiu que a implementacao nunca encostasse na forma verdadeira e ainda assim passasse.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO E DO `tester` (secao A.38), e ele NAO conserta producao: ele afirma o REQUISITO.
 * Sufixo `.tester.spec.ts` e trava de DONO UNICO (secao A.39). Nenhum teste aqui toca a rede.
 *
 * SECAO A.6: zero PII real. Todo valor com cara de pessoa e SINTETICO, e a maior parte existe
 * justamente para ser procurada NA SAIDA e NAO ser encontrada.
 *
 * ┌─ O QUE A PRODUCAO DO FORNECEDOR DEVOLVE, medido, e que este arquivo codifica ────────────────┐
 * │ Envelope SEMPRE: `{ message: [...], data: { value: <conteudo> } }`.                            │
 * │   `data` e OBJETO, nunca array. Nao existe `results` no topo. Nunca array no topo.             │
 * │                                                                                                │
 * │   GET /api/v1/public/screenings?page=1                                                         │
 * │     -> data.value = { page, total, screenings: [...] }   (522 numa pagina)                     │
 * │   GET /api/v2/public/screenings/{id}/results?page=1                                            │
 * │     -> data.value = { page, total, candidates: [...] }   (a lista chama-se `candidates`)       │
 * │   GET /api/v1/public/screenings/{id}/users/{userId}/results                                    │
 * │     -> data.value = <UM registro plano>                                                        │
 * │                                                                                                │
 * │ VERSAO POR ROTA: a rota do PAR (`users/{userId}/results`) e **v1**; em v2 ela da 404.          │
 * │   A LISTAGEM de resultados, ao contrario, e **v2**.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */

// ── 0. O DESEMBRULHADOR, QUE E O UNICO PONTO QUE CONHECE O FORMATO DO FORNECEDOR ──────────────

/**
 * `desembrulharRespostaDigai` (em `domain/digai.ts`) devolve `{ conteudo, lista }`:
 *   `conteudo` = o que esta dentro de `data.value` (e o registro unico, na rota do par);
 *   `lista`    = a lista de dentro do conteudo (`candidates` na v2, `screenings` na v1).
 *
 * UM LUGAR SO CONHECE O FORMATO, e isso e o que impede a segunda copia de divergir em silencio:
 * formato nao reconhecido nao levanta erro, SOME, e some para toda a base de uma vez.
 */
type Desembrulhado = { conteudo: unknown; lista: unknown[] };
const desembrulharRespostaDigai = (dominio as Record<string, unknown>)
  .desembrulharRespostaDigai as ((resposta: unknown) => Desembrulhado) | undefined;

function desembrulhar(resposta: unknown): Desembrulhado {
  expect(
    typeof desembrulharRespostaDigai,
    "FALTA IMPLEMENTAR: `domain/digai.ts` precisa exportar `desembrulharRespostaDigai(resposta)` " +
      "devolvendo `{ conteudo, lista }`. Sem um desembrulhador EXPORTADO nao ha como provar o formato " +
      "do fornecedor fora do servico, e foi essa ausencia de prova que deixou 174 testes verdes sobre " +
      "um envelope que a producao nunca emitiu.",
  ).toBe("function");
  return (desembrulharRespostaDigai as (r: unknown) => Desembrulhado)(resposta);
}

// ── 1. AS FIXTURES, NA FORMA MEDIDA E SO NELA ──────────────────────────────────────────────────

/** CPF SINTETICO com digito valido. Conferido no proprio arquivo: numero que o validador recusa faria o teste passar pelo motivo errado. */
const CPF_SINTETICO = "11122233396";
const CPF_SINTETICO_OUTRO = "22233344405";

const USER_ID = "aBcD1234-ef56-7890-ab12-cd34ef567890"; // 36 caracteres, alfabeto [A-Za-z0-9._-], como os 58/58 medidos
const USER_ID_OUTRO = "zYxW9876-ba54-3210-zz99-yy88xx776655";
const SCREENING_ID = "sc-sintetico-1";
const PARTNER_JOB_ID = "1234567"; // 7 digitos, como os 58/58 medidos

/** Os valores SINTETICOS de PII que este arquivo procura NA SAIDA, pelo VALOR e nunca pelo placeholder. */
const PII_SINTETICA = [
  "Fulano",
  "De Teste",
  "fulano.teste@exemplo.invalido",
  "11900000001",
  CPF_SINTETICO,
  "https://cv.exemplo.invalido/fulano-de-teste.pdf",
  "candidato demonstrou baixa aderencia ao perfil",
  "respondeu que ja trabalhou com carga pesada",
  "analise resumida sobre a pessoa",
  "perfil analitico introvertido",
] as const;

/**
 * ─ OS 41 CAMPOS DO REGISTRO REAL, ENUMERADOS, NA ORDEM MEDIDA ──────────────────────────────────
 *
 * A LISTA E O INSTRUMENTO. Um teste que projetasse tres campos proibidos provaria tres; alimentar
 * a projecao com os 41 campos VERDADEIROS e o que transforma "nao vaza o que eu lembrei" em "nao
 * vaza NADA do que o fornecedor manda". Campo novo do fornecedor entra AQUI, e a prova de lista
 * fechada o pega sozinha.
 */
const CAMPOS_REAIS_DO_DIGAI = [
  "accessibilityDeclaration",
  "accessibilityRequest",
  "appliedAt",
  "approvalStatus",
  "attempt",
  "attemptFeedback",
  "attemptId",
  "averageRawScore",
  "averageScore",
  "backgroundCheckHasRecords",
  "backgroundCheckSeverity",
  "comment",
  "cpf",
  "curriculumUrl",
  "distanceKm",
  "dnaScore",
  "dnaScoreRaw",
  "documentRequestStatus",
  "email",
  "expectedAnswersMet",
  "firstname",
  "globalRank",
  "greenhouseApplicationId",
  "hasApproved",
  "justification",
  "lastname",
  "likelyReading",
  "matchLevel",
  "matchPct",
  "partnerJobId",
  "partnerUserId",
  "phoneNumber",
  "proficiencyTest",
  "profileAssessment",
  "rating",
  "requirementDetails",
  "requirementMet",
  "reuseFrom",
  "stages",
  "summarizedAnalysis",
  "userId",
] as const;

/**
 * OS CAMPOS QUE PODEM ATRAVESSAR, em LISTA FECHADA e por ENUMERACAO.
 *
 * `firstname` e `lastname` entram porque `name` NAO EXISTE no registro real (0 de 58 medidos). A
 * lista aceita as duas representacoes do nome no registro PROJETADO (`firstname`+`lastname` ou um
 * `nome`/`name` ja composto) porque QUAL delas a producao escolhe e decisao de quem implementa; o
 * que NAO e negociavel e que nada FORA desta lista atravesse.
 */
const PERMITIDOS_NA_PROJECAO: ReadonlySet<string> = new Set([
  "userId",
  "partnerJobId",
  "firstname",
  "lastname",
  "name",
  "nome",
  "cpf",
  "email",
  "phoneNumber",
  "appliedAt",
]);

/** Os 33 campos reais que NAO podem atravessar (41 menos os 8 lidos), DERIVADOS. Ninguem os digita. */
const PROIBIDOS_NA_PROJECAO = CAMPOS_REAIS_DO_DIGAI.filter((c) => !PERMITIDOS_NA_PROJECAO.has(c));

/**
 * O registro real de 41 campos, com valores SINTETICOS. Cada campo de julgamento carrega texto procuravel.
 *
 * ┌─ O PADRAO E QUEM FINALIZOU A TRIAGEM, E ISSO MUDOU EM 29/09/2026 ────────────────────────────┐
 * │ POR DECISAO DO DIRETOR a ingestao traz APENAS quem FINALIZOU, e quem responde por isso e o    │
 * │ CPF. Um fixture padrao SEM CPF seria um registro que a ingestao RECUSA, e todo teste que o    │
 * │ usasse como "registro qualquer" (nome composto, dedup, espelho da vaga) passaria a provar o    │
 * │ caminho da recusa achando que prova o da escrita. O veiculo tem de ser alguem que ENTRA.       │
 * │                                                                                               │
 * │ A AUSENCIA DE CPF CONTINUA COBERTA, e com nome proprio: ela e o assunto do bloco 9, onde o    │
 * │ `cpf: null` e escrito EXPLICITAMENTE, que e onde ele tem de estar. Regra que decide admissao   │
 * │ nao pode morar no valor implicito de um fixture.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function registroRealDigai(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accessibilityDeclaration: "declarou necessidade de acessibilidade",
    accessibilityRequest: "solicitou interprete de libras",
    appliedAt: "2026-09-10T12:00:00.000Z",
    approvalStatus: "PENDING",
    attempt: 1,
    attemptFeedback: "respondeu que ja trabalhou com carga pesada",
    attemptId: "att-sintetico-1",
    averageRawScore: 7.5,
    averageScore: 75,
    backgroundCheckHasRecords: false,
    backgroundCheckSeverity: "NONE",
    comment: "candidato chegou atrasado na entrevista",
    // FINALIZOU a triagem: e essa a unica populacao que a ingestao admite hoje (ver o bloco acima).
    cpf: CPF_SINTETICO,
    curriculumUrl: "https://cv.exemplo.invalido/fulano-de-teste.pdf",
    distanceKm: 12.4,
    dnaScore: 81,
    dnaScoreRaw: 0.81,
    documentRequestStatus: "NOT_REQUESTED",
    email: "fulano.teste@exemplo.invalido",
    expectedAnswersMet: 4,
    firstname: "Fulano",
    globalRank: 12,
    greenhouseApplicationId: null,
    hasApproved: false,
    justification: "candidato demonstrou baixa aderencia ao perfil",
    lastname: "De Teste",
    likelyReading: "leitura provavel do perfil",
    matchLevel: "MEDIUM",
    matchPct: 62,
    partnerJobId: PARTNER_JOB_ID,
    partnerUserId: null,
    phoneNumber: "11900000001",
    proficiencyTest: { score: 3 },
    profileAssessment: "perfil analitico introvertido",
    rating: 3,
    requirementDetails: [{ requisito: "CNH", atende: false }],
    requirementMet: false,
    reuseFrom: null,
    stages: [{ name: "Etapa 1", answer: "respondeu que ja trabalhou com carga pesada" }],
    summarizedAnalysis: "analise resumida sobre a pessoa",
    userId: USER_ID,
    ...over,
  };
}

/** O envelope REAL, na unica forma que a producao emite. */
function envelope(valor: unknown): unknown {
  return { message: [], data: { value: valor } };
}

// ── 2. O DUBLE DO CLIENTE E DO REPOSITORIO ─────────────────────────────────────────────────────

/** O cliente de rede como duble: ANOTA o caminho pedido e devolve a forma que o teste manda. NUNCA toca a rede. */
function clienteFingido(resposta: unknown) {
  const caminhos: string[] = [];
  return {
    caminhos,
    ativo: true,
    ler: vi.fn(async (caminho: string) => {
      caminhos.push(caminho);
      return resposta;
    }),
  };
}

function repositorioFingido() {
  const escritas: { metodo: string; args: unknown[] }[] = [];
  const anotar = (metodo: string) => (...args: unknown[]) => {
    escritas.push({ metodo, args });
  };
  const conhecidos = new Set<string>();
  return {
    escritas,
    conhecidos,
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async (id: string) =>
      conhecidos.has(id) ? { id: "11111111-1111-4111-8111-111111111111" } : null,
    ),
    candidatoPorDocumento: vi.fn(async () => null),
    criarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("criarCandidato")(...args);
      return { id: "11111111-1111-4111-8111-111111111111" };
    }),
    atualizarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("atualizarCandidato")(...args);
      return { linhasAfetadas: 1 };
    }),
    anexarIdentidade: vi.fn(async (...args: unknown[]) => {
      anotar("anexarIdentidade")(...args);
    }),
    registrarConflito: vi.fn(async (...args: unknown[]) => {
      anotar("registrarConflito")(...args);
    }),
    espelharVaga: vi.fn(async (...args: unknown[]) => {
      anotar("espelharVaga")(...args);
      return { id: "22222222-2222-4222-8222-222222222222" };
    }),
    garantirCandidatura: vi.fn(async (...args: unknown[]) => {
      anotar("garantirCandidatura")(...args);
      return { criada: true, id: "33333333-3333-4333-8333-333333333333" };
    }),
  };
}

const AMBIENTE_LIGADO = {
  DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
  DIGAI_INGESTAO_ATIVA: "true",
};

function montarServico(resposta: unknown, vars: Record<string, string | undefined> = AMBIENTE_LIGADO) {
  const repo = repositorioFingido();
  const config = { get: <T,>(chave: string) => vars[chave] as unknown as T } as ConfigService;
  const servico = new DigaiImportacaoService(config, repo as unknown as DigaiRepositorio);
  const cliente = clienteFingido(resposta);
  // O cliente e construido no construtor do servico; o duble entra no lugar dele, e nada toca a rede.
  (servico as unknown as Record<string, unknown>).cliente = cliente;
  return { servico, repo, cliente };
}

/** Captura TUDO o que o Nest loga durante o bloco, para a cacada ao valor. */
function capturarLog() {
  const linhas: unknown[] = [];
  const espiao = (m: "log" | "warn" | "error" | "debug" | "verbose") =>
    vi.spyOn(Logger.prototype, m).mockImplementation(((...args: unknown[]) => {
      linhas.push(args);
    }) as never);
  const espioes = (["log", "warn", "error", "debug", "verbose"] as const).map(espiao);
  return { linhas, restaurar: () => espioes.forEach((e) => e.mockRestore()) };
}

/** Procura o VALOR real (e as variacoes dele) numa saida qualquer. Vazio = limpo. */
function piiNaSaida(saida: unknown, valores: readonly string[]): string[] {
  const texto = typeof saida === "string" ? saida : JSON.stringify(saida ?? "");
  const alvo = texto.toLowerCase();
  const achados: string[] = [];
  for (const valor of valores) {
    const so = valor.replace(/\D/g, "");
    const formas = new Set<string>([valor]);
    if (so.length === 11) {
      formas.add(so);
      formas.add(`${so.slice(0, 3)}.${so.slice(3, 6)}.${so.slice(6, 9)}-${so.slice(9)}`);
      formas.add(`${so.slice(0, 3)} ${so.slice(3, 6)} ${so.slice(6, 9)} ${so.slice(9)}`);
    }
    for (const forma of formas) {
      if (forma.length >= 4 && alvo.includes(forma.toLowerCase())) achados.push(forma);
    }
  }
  return [...new Set(achados)];
}

// ── 3. O DESEMBRULHO DO ENVELOPE REAL ──────────────────────────────────────────────────────────

describe("1. O ENVELOPE REAL: `{ message, data: { value } }`, e so ele", () => {
  it("a fixture de CPF e SINTETICA e VALIDA, senao todo teste de estagio passa pelo motivo errado", () => {
    expect(isValidCpf(CPF_SINTETICO)).toBe(true);
    expect(isValidCpf(CPF_SINTETICO_OUTRO)).toBe(true);
  });

  it("LISTAGEM DE TRIAGENS (v1): `data.value` = { page, total, screenings: [...] }", () => {
    const { conteudo, lista } = desembrulhar(
      envelope({ page: 1, total: 522, screenings: [{ id: SCREENING_ID }] }),
    );
    const c = conteudo as Record<string, unknown>;
    expect(c.total, "o envelope tem de ser desembrulhado, e nao devolvido cru.").toBe(522);
    expect(lista.length, "a lista de triagens chama-se `screenings`.").toBe(1);
  });

  it("LISTAGEM DE RESULTADOS (v2): a lista chama-se `candidates`, NAO `results`", () => {
    const { conteudo, lista } = desembrulhar(
      envelope({ page: 1, total: 58, candidates: [registroRealDigai()] }),
    );
    expect(
      lista.length,
      "a lista de resultados chama-se `candidates`. `results` NAO EXISTE em lugar nenhum da resposta, " +
        "e foi esse nome inventado que os dubles antigos ensinaram a implementacao a procurar.",
    ).toBe(1);
    expect((lista[0] as Record<string, unknown>).userId).toBe(USER_ID);
    expect("results" in (conteudo as Record<string, unknown>)).toBe(false);
  });

  it("REGISTRO UNICO (v1 do par): `data.value` e UM registro PLANO, sem lista nenhuma", () => {
    const { conteudo, lista } = desembrulhar(envelope(registroRealDigai()));
    expect((conteudo as Record<string, unknown>).userId).toBe(USER_ID);
    expect(Array.isArray(conteudo), "o registro unico NAO vem embrulhado em array.").toBe(false);
    expect(lista, "registro unico nao tem lista: inventar uma daria dois caminhos para o mesmo dado.").toEqual([]);
  });

  it("`{ data: [...] }` (data como ARRAY) e ficcao, e nao pode virar lista", () => {
    /*
     * MEDIDO: `data` e SEMPRE objeto. Aceitar array em `data` seria aceitar uma forma que o
     * fornecedor nunca emitiu, e tolerancia a forma inexistente foi exatamente o que permitiu a
     * implementacao antiga passar sem nunca encostar na forma verdadeira.
     */
    const { lista } = desembrulhar({ message: [], data: [registroRealDigai()] });
    expect(lista).toEqual([]);
  });

  it("`{ results: [...] }` no topo e ficcao da documentacao, e nao pode virar lista", () => {
    expect(desembrulhar({ results: [registroRealDigai()] }).lista).toEqual([]);
  });

  it("ARRAY NO TOPO e ficcao, e nao pode ser aceito nem como lista nem como conteudo", () => {
    /*
     * ┌─ ESTE E O UNICO RESTO DA TOLERANCIA ANTIGA, e ele e o mais perigoso dos tres ─────────────┐
     * │ A producao do Digai NUNCA devolve array no topo: toda resposta vem embrulhada. Aceitar    │
     * │ array cru mantem vivo o caminho pelo qual um duble mentiroso continua passando, que e a   │
     * │ definicao do defeito que esta rodada existe para corrigir. Fail-closed: o que nao e a      │
     * │ forma medida nao e ingerido.                                                              │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { lista } = desembrulhar([registroRealDigai()]);
    expect(
      lista,
      "array no topo nao existe no fornecedor. Tolera-lo e manter aberta a porta por onde o contrato " +
        "errado entrou, e um duble que devolve array continua verde para sempre.",
    ).toEqual([]);
  });

  it("e o SERVICO tambem recusa o array no topo: nada de fora da forma medida vira pessoa", async () => {
    const { servico, repo } = montarServico([registroRealDigai()]);
    const registro = await servico.buscarRegistro({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(registro, "forma que a producao nao emite nao pode produzir ingestao.").toBeNull();
    expect(repo.escritas).toEqual([]);
  });

  it("envelope sem `data.value` nao inventa conteudo: fail-closed", () => {
    expect(desembrulhar({ message: [], data: {} }).lista).toEqual([]);
    expect(desembrulhar({ message: [] }).lista).toEqual([]);
    expect(desembrulhar(null).lista).toEqual([]);
    expect(desembrulhar("texto").lista).toEqual([]);
  });

  it("O SERVICO desembrulha o envelope REAL e devolve o registro (o codigo antigo devolvia `null` em silencio)", async () => {
    /*
     * ESTE E O DEFEITO INTEIRO, EM UM TESTE. Sem desembrulho a busca devolve `null`, a ingestao
     * escreve zero e NADA FALHA: a operacao veria "o Digai nao esta mandando evento", que e a pior
     * especie de defeito, o que nao produz erro nenhum.
     */
    const { servico, cliente } = montarServico(envelope(registroRealDigai()));
    const registro = await servico.buscarRegistro({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(cliente.ler, "a leitura tem de acontecer.").toHaveBeenCalled();
    expect(
      registro,
      "com o envelope REAL na entrada, a busca NAO pode devolver null: e isso que zera a ingestao em silencio.",
    ).not.toBeNull();
    expect(registro?.userId).toBe(USER_ID);
  });

  it("O SERVICO tambem desembrulha a LISTA v2 (`candidates`) e acha o usuario PEDIDO", async () => {
    const outro = registroRealDigai({
      userId: USER_ID_OUTRO,
      firstname: "Beltrano",
      lastname: "Da Silva",
    });
    const { servico } = montarServico(
      envelope({ page: 1, total: 2, candidates: [outro, registroRealDigai()] }),
    );
    const registro = await servico.buscarRegistro({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(registro?.userId, "achar o usuario PEDIDO dentro da pagina, e nunca o primeiro da lista.").toBe(
      USER_ID,
    );
  });
});

// ── 4. A VERSAO DA ROTA DO PAR E v1 ────────────────────────────────────────────────────────────

describe("2. A ROTA DO PAR E v1. Em v2 o fornecedor devolve 404", () => {
  it("a segunda chamada sai em `/api/v1/public/screenings/{id}/users/{userId}/results`", async () => {
    const { servico, cliente } = montarServico(envelope(registroRealDigai()));
    await servico.buscarRegistro({ screeningId: SCREENING_ID, userId: USER_ID });

    expect(cliente.caminhos.length, "exatamente uma leitura por evento.").toBe(1);
    const caminho = cliente.caminhos[0];
    expect(
      caminho,
      "MEDIDO EM 29/09/2026: a v2 desta rota devolve 404 e a v1 devolve 200. Uma rota em v2 aqui nao " +
        "devolve dado errado, devolve NADA, e a ingestao inteira fica muda sem ninguem saber por que.",
    ).toBe(`/api/v1/public/screenings/${SCREENING_ID}/users/${USER_ID}/results`);
  });

  it("e ela NUNCA volta para v2: esta assercao existe para quebrar quem reverter", async () => {
    const { servico, cliente } = montarServico(envelope(registroRealDigai()));
    await servico.buscarRegistro({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(cliente.caminhos[0]).not.toMatch(/^\/api\/v2\//);
    expect(cliente.caminhos[0]).toMatch(/^\/api\/v1\/public\/screenings\/[^/]+\/users\/[^/]+\/results$/);
  });

  it("o caminho v1 do par passa pela grade, e a listagem v2 tambem (as duas versoes convivem)", () => {
    expect(() =>
      autorizar(`/api/v1/public/screenings/${SCREENING_ID}/users/${USER_ID}/results`, "GET"),
    ).not.toThrow();
    expect(() => autorizar(`/api/v2/public/screenings/${SCREENING_ID}/results`, "GET")).not.toThrow();
  });

  it("id com cara de documento continua recusado ANTES da rede, tambem na v1", () => {
    expect(() =>
      autorizar(`/api/v1/public/screenings/${SCREENING_ID}/users/${CPF_SINTETICO}/results`, "GET"),
    ).toThrow(GradeDigaiViolada);
  });
});

// ── 5. O NOME VEM DE `firstname` + `lastname` ──────────────────────────────────────────────────

describe("3. O NOME: `firstname` + `lastname`. O campo `name` NAO EXISTE (0 de 58 medidos)", () => {
  it("a coleta declara `firstname` e `lastname`, e NAO declara `name`", () => {
    const campos = CAMPOS_COLETADOS_DO_DIGAI as readonly string[];
    expect(campos, "`firstname` e campo real e tem de ser coletado.").toContain("firstname");
    expect(campos, "`lastname` e campo real e tem de ser coletado.").toContain("lastname");
    expect(
      campos.includes("name"),
      "`name` NAO EXISTE no registro do Digai (0 de 58 registros medidos). Coletar um campo " +
        "inexistente produz `null` sempre, e `null` sempre vira 'registro sem identificacao minima' " +
        "para TODA a base: a ingestao recusaria 100% das pessoas sem nenhum erro aparecer.",
    ).toBe(false);
  });

  it("a projecao conserva o nome vindo dos DOIS campos", () => {
    const p = projetarResultadoDigai(registroRealDigai()) as unknown as Record<string, unknown>;
    expect(p, "o registro real tem de ser projetavel.").not.toBeNull();
    const nomeComposto = [p.firstname, p.lastname, p.name, p.nome]
      .filter((v) => typeof v === "string")
      .join(" ");
    expect(nomeComposto, "o primeiro nome tem de sobreviver a projecao.").toContain("Fulano");
    expect(nomeComposto, "o sobrenome tem de sobreviver a projecao.").toContain("De Teste");
  });

  it("de ponta a ponta, a pessoa nasce com o nome COMPLETO, e nao so com o primeiro", async () => {
    const { servico, repo } = montarServico(envelope(registroRealDigai()));
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });

    const criacao = repo.escritas.find((e) => e.metodo === "criarCandidato");
    expect(
      criacao,
      "com o contrato certo, o registro real TEM de virar pessoa. Se `criarCandidato` nao foi chamado, " +
        "a ingestao esta recusando a base inteira em silencio.",
    ).toBeDefined();
    const nome = String((criacao?.args[0] as { nome?: unknown })?.nome ?? "");
    expect(nome).toContain("Fulano");
    expect(nome, "o sobrenome nao pode ficar para tras: `lastname` e metade da identificacao.").toContain(
      "De Teste",
    );
  });

  it("registro SEM `firstname` e SEM `lastname` NAO vira pessoa sem nome em silencio", async () => {
    const { servico, repo } = montarServico(
      envelope(registroRealDigai({ firstname: null, lastname: null })),
    );
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(
      repo.escritas.filter((e) => e.metodo === "criarCandidato"),
      "sem nenhum dos dois campos nao ha pessoa a acompanhar: criar uma ficha em branco enche a base " +
        "de linhas que ninguem reconhece, e ninguem as apaga depois.",
    ).toEqual([]);
  });

  it("com SO `firstname` a pessoa entra, porque meio nome ainda identifica e nome nenhum nao", async () => {
    const { servico, repo } = montarServico(envelope(registroRealDigai({ lastname: null })));
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(repo.escritas.some((e) => e.metodo === "criarCandidato")).toBe(true);
  });
});

// ── 6. A ALLOWLIST DE PROJECAO, POR ENUMERACAO E EM LISTA FECHADA ──────────────────────────────

describe("4. A PROJECAO E LISTA FECHADA, alimentada com os 41 campos REAIS", () => {
  it("a fixture tem os 41 campos medidos, nem um a mais nem um a menos", () => {
    expect(CAMPOS_REAIS_DO_DIGAI.length).toBe(41);
    expect(Object.keys(registroRealDigai()).sort()).toEqual([...CAMPOS_REAIS_DO_DIGAI].sort());
  });

  it("NENHUMA chave fora da lista permitida atravessa (lista FECHADA, nao `toContain`)", () => {
    const p = projetarResultadoDigai(registroRealDigai()) as unknown as Record<string, unknown>;
    expect(p).not.toBeNull();
    const intrusos = Object.keys(p).filter((k) => !PERMITIDOS_NA_PROJECAO.has(k));
    expect(
      intrusos,
      "allowlist e o onus invertido: campo novo do fornecedor nasce FORA. Denylist so protege do que " +
        "alguem lembrou de escrever, e foi assim que `stages` ficou de fora da lista por duas semanas.",
    ).toEqual([]);
  });

  it("os 33 campos de julgamento e de PII sao recusados UM A UM, por enumeracao", () => {
    const p = projetarResultadoDigai(registroRealDigai()) as unknown as Record<string, unknown>;
    for (const campo of PROIBIDOS_NA_PROJECAO) {
      expect(
        Object.prototype.hasOwnProperty.call(p, campo),
        `'${campo}' atravessou a projecao. O dado que nao chega ao dominio tambem nao chega ao banco, ao log nem a fila.`,
      ).toBe(false);
    }
  });

  it("os seis campos que o `seguranca` nomeou, mais o `curriculumUrl`, sao verificados explicitamente", () => {
    const p = projetarResultadoDigai(registroRealDigai()) as unknown as Record<string, unknown>;
    for (const campo of [
      "justification",
      "attemptFeedback",
      "summarizedAnalysis",
      "profileAssessment",
      "stages",
      "requirementDetails",
      "curriculumUrl",
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(p, campo),
        `'${campo}' e julgamento sobre a pessoa ou PII pura (o curriculo e o dossie inteiro dela).`,
      ).toBe(false);
    }
  });

  it("o VALOR dos campos proibidos nao sobrevive em NENHUMA forma serializada da projecao", () => {
    const p = projetarResultadoDigai(registroRealDigai());
    const vazamentos = piiNaSaida(p, [
      "candidato demonstrou baixa aderencia ao perfil",
      "respondeu que ja trabalhou com carga pesada",
      "analise resumida sobre a pessoa",
      "perfil analitico introvertido",
      "https://cv.exemplo.invalido/fulano-de-teste.pdf",
      "candidato chegou atrasado na entrevista",
      "solicitou interprete de libras",
      "leitura provavel do perfil",
    ]);
    expect(
      vazamentos,
      "procurar a CHAVE nao basta: o valor pode ter sido copiado para outro campo. Procura-se o VALOR.",
    ).toEqual([]);
  });

  it("a projecao segue recusando registro sem identificador tecnico utilizavel", () => {
    expect(projetarResultadoDigai(registroRealDigai({ userId: CPF_SINTETICO }))).toBeNull();
    expect(projetarResultadoDigai(registroRealDigai({ userId: "../outro" }))).toBeNull();
    expect(projetarResultadoDigai(registroRealDigai({ userId: null }))).toBeNull();
  });
});

// ── 7. ZERO PII EM QUALQUER SUPERFICIE, COM O REGISTRO REAL ────────────────────────────────────

describe("5. ZERO PII em TODA superficie, medido contra o registro real de 41 campos", () => {
  it("`mascararParaLog` do registro REAL nao deixa um unico valor sobreviver", () => {
    expect(piiNaSaida(mascararParaLog(registroRealDigai({ cpf: CPF_SINTETICO })), PII_SINTETICA)).toEqual(
      [],
    );
  });

  it("`erroDoRegistro` do registro REAL so ecoa o identificador tecnico", () => {
    const saida = erroDoRegistro(
      registroRealDigai({ cpf: CPF_SINTETICO }),
      "falha ao gravar o registro",
    );
    expect(piiNaSaida(saida, PII_SINTETICA)).toEqual([]);
    expect(saida, "sem o id tecnico ninguem investiga, e erro que ninguem investiga e ruido.").toContain(
      USER_ID,
    );
  });

  it("`resumoDaImportacao` de uma pagina de 58 registros reais devolve NUMERO, e nada mais", () => {
    const pagina = Array.from({ length: 58 }, (_, i) =>
      registroRealDigai({
        userId: `${USER_ID.slice(0, 30)}${String(i).padStart(6, "0")}`,
        cpf: i < 4 ? CPF_SINTETICO : null,
      }),
    );
    const resumo = resumoDaImportacao(pagina);
    expect(resumo.total).toBe(58);
    expect(
      resumo.finalizaram,
      "4 de 58 com CPF foi o que se mediu, e e esse numero que a contagem tem de reproduzir.",
    ).toBe(4);
    expect(piiNaSaida(resumo, PII_SINTETICA)).toEqual([]);
  });

  it("o PAYLOAD DA FILA carrega SO identificadores tecnicos, mesmo com o registro real dentro do evento", () => {
    const evento = {
      event: "NEW_APPLICATION",
      screeningId: SCREENING_ID,
      userId: USER_ID,
      attemptId: "att-sintetico-1",
      candidate: registroRealDigai({ cpf: CPF_SINTETICO }),
    };
    const ids = identificadoresDoEvento(evento);
    expect(ids).not.toBeNull();
    expect(
      Object.keys(ids ?? {}).sort(),
      "o payload do BullMQ FICA NO REDIS sem TTL, fora do alcance do expurgo: so id tecnico entra.",
    ).toEqual(["attemptId", "screeningId", "userId"]);
    expect(piiNaSaida(ids, PII_SINTETICA)).toEqual([]);
  });

  it("a CHAVE DO JOB nao carrega nada alem do identificador tecnico", () => {
    expect(piiNaSaida(chaveDoJobDigai({ userId: USER_ID }), PII_SINTETICA)).toEqual([]);
    expect(() => chaveDoJobDigai({ userId: CPF_SINTETICO })).toThrow();
  });

  it("o `failedReason` do job: o erro do driver carrega o valor que violou a restricao, e ele nao passa", () => {
    const erroDoDriver = {
      code: "23505",
      constraint_name: "as_candidatos_cpf_key",
      detail: `Key (cpf)=(${CPF_SINTETICO}) already exists.`,
      query: `insert into as_candidatos (nome, cpf, email) values ('Fulano De Teste', '${CPF_SINTETICO}', 'fulano.teste@exemplo.invalido')`,
      message: `duplicate key value violates unique constraint, cpf ${CPF_SINTETICO}`,
    };
    const traduzido = traduzirErroDeBanco(erroDoDriver);
    expect(
      piiNaSaida(traduzido, PII_SINTETICA),
      "nem `detail`, nem `query`, nem `message` podem atravessar: esse texto vai para o `failedReason`, " +
        "que o BullMQ guarda no Redis sem TTL.",
    ).toEqual([]);
    expect(traduzido).toContain("as_candidatos_cpf_key");
  });

  it("A EXCECAO tambem nao vaza: o erro do driver atravessa `importar` sem publicar o valor", async () => {
    const captura = capturarLog();
    try {
      const { servico, repo } = montarServico(envelope(registroRealDigai({ cpf: CPF_SINTETICO })));
      repo.criarCandidato = vi.fn(async () => {
        throw {
          code: "23505",
          constraint_name: "as_candidatos_cpf_key",
          detail: `Key (cpf)=(${CPF_SINTETICO}) already exists.`,
          message: `duplicate key, ${CPF_SINTETICO}, fulano.teste@exemplo.invalido`,
        };
      }) as unknown as typeof repo.criarCandidato;
      await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
      expect(
        captura.linhas.length,
        "SE NADA FOI LOGADO, ESTE TESTE NAO PROVA NADA. Uma falha de gravacao TEM de aparecer no log, " +
          "senao a ingestao perde linha em silencio, e uma assercao de PII sobre saida vazia passa sozinha.",
      ).toBeGreaterThan(0);
      expect(piiNaSaida(captura.linhas, PII_SINTETICA)).toEqual([]);
    } finally {
      captura.restaurar();
    }
  });

  it("OS TRES CAMINHOS QUE REALMENTE LOGAM nao publicam um unico valor de pessoa", async () => {
    /*
     * ┌─ POR QUE NOMEAR OS CAMINHOS, e nao so "rodar o ciclo" ────────────────────────────────────┐
     * │ O caminho feliz do `processarEvento` NAO LOGA NADA, entao uma assercao de PII sobre ele    │
     * │ passa sobre saida VAZIA: verde que nao prova coisa nenhuma, que e exatamente a especie de  │
     * │ verde que esta rodada existe para eliminar. Os caminhos abaixo logam de verdade, e cada um │
     * │ e conferido com a exigencia de que a saida NAO esteja vazia.                                │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const registro = registroRealDigai({ cpf: CPF_SINTETICO });

    const caminhos: { nome: string; rodar: () => Promise<unknown> }[] = [
      {
        nome: "sem registro correspondente (o fornecedor nao devolveu o usuario pedido)",
        rodar: async () => {
          const { servico } = montarServico(envelope({ page: 1, total: 0, candidates: [] }));
          return servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
        },
      },
      {
        nome: "adiado por falta de elo com a vaga",
        rodar: async () => {
          const { servico } = montarServico(envelope({ ...registro, partnerJobId: null }));
          return servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
        },
      },
      {
        nome: "ingestao DESLIGADA (segundo portao fechado)",
        rodar: async () => {
          const { servico } = montarServico(envelope(registro), {
            DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
          });
          return servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
        },
      },
      {
        nome: "sem de/para de etapa (fail-closed com registro)",
        rodar: async () => {
          const { servico, repo } = montarServico(envelope(registro));
          repo.deParaEtapa = vi.fn(async () => null) as unknown as typeof repo.deParaEtapa;
          return servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
        },
      },
    ];

    for (const caminho of caminhos) {
      const captura = capturarLog();
      try {
        await caminho.rodar();
        expect(
          captura.linhas.length,
          `o caminho '${caminho.nome}' NAO LOGOU NADA. Recusa sem aviso vira perda silenciosa, e a ` +
            "assercao de PII sobre saida vazia seria verde de graca.",
        ).toBeGreaterThan(0);
        expect(
          piiNaSaida(captura.linhas, PII_SINTETICA),
          `o caminho '${caminho.nome}' publicou dado de pessoa no log.`,
        ).toEqual([]);
      } finally {
        captura.restaurar();
      }
    }
  });
});

// ── 8. A DEDUP E POR `userId`. NUNCA POR CPF, NUNCA POR NOME ───────────────────────────────────

describe("6. A DEDUP E POR `userId`: unico e permanente (confirmado pelo Ivan, 29/09)", () => {
  it("a chave do registro e o `userId`, mesmo quando o CPF esta presente", () => {
    expect(chaveDoRegistroDigai(registroRealDigai({ cpf: CPF_SINTETICO }))).toBe(USER_ID);
  });

  it("o MESMO `userId` em TRIAGENS DIFERENTES e a MESMA pessoa, e entra uma vez so", () => {
    const plano = planoDaImportacao({
      registros: [
        registroRealDigai({ partnerJobId: "1234567" }),
        registroRealDigai({ partnerJobId: "7654321", cpf: CPF_SINTETICO }),
      ],
      jaImportados: [],
    });
    expect(
      plano.criar.length,
      "`userId` e UNICO E PERMANENTE, o mesmo em todas as triagens. Duas triagens da mesma pessoa nao " +
        "podem virar duas pessoas.",
    ).toBe(1);
  });

  it("CPF NAO PODE SER CHAVE: ele esta em 4 de 58, e aparece DEPOIS no MESMO registro", () => {
    const antes = registroRealDigai({ cpf: null });
    const depois = registroRealDigai({ cpf: CPF_SINTETICO });
    expect(
      chaveDoRegistroDigai(antes),
      "a chave nao pode mudar quando a pessoa finaliza a triagem: duplicaria exatamente quem finalizou, " +
        "que e a unica populacao que importa.",
    ).toBe(chaveDoRegistroDigai(depois));

    // CPF igual em userIds diferentes NAO funde ninguem no plano: quem decide fusao e o desempate
    // do servico, com conflito registrado, e nunca o planejador.
    const plano = planoDaImportacao({
      registros: [
        registroRealDigai({ cpf: CPF_SINTETICO }),
        registroRealDigai({ userId: USER_ID_OUTRO, cpf: CPF_SINTETICO }),
      ],
      jaImportados: [],
    });
    expect(plano.criar.length, "duas identidades distintas sao dois itens de plano.").toBe(2);
  });

  it("NOME NUNCA E CHAVE: dois homonimos com `userId` diferente sao duas pessoas", () => {
    const plano = planoDaImportacao({
      registros: [
        registroRealDigai({ firstname: "Fulano", lastname: "De Teste" }),
        registroRealDigai({
          userId: USER_ID_OUTRO,
          firstname: "Fulano",
          lastname: "De Teste",
        }),
      ],
      jaImportados: [],
    });
    expect(
      plano.criar.length,
      "casar por nome funde homonimos sem volta, e o que se junta por engano nao se separa depois.",
    ).toBe(2);
  });

  it("a MEDICAO dos 54 de 58 sem CPF continua verdadeira sobre o FORNECEDOR, e nao decide mais a admissao", () => {
    /*
     * ┌─ ESTE TESTE MUDOU DE REGUA EM 29/09/2026, POR DECISAO DO DIRETOR ──────────────────────────┐
     * │ Ele se chamava "os 54 de 58 SEM CPF entram normalmente: recusa-los seria recusar a base", e │
     * │ AFIRMAVA O CONTRARIO DA REGRA DE HOJE. Pior: continuava VERDE, porque exercitava so o       │
     * │ `planoDaImportacao`, que nao mudou. Verde que afirma o oposto do requisito e pior do que    │
     * │ vermelho, porque ninguem volta a ler um teste que passa.                                    │
     * │                                                                                             │
     * │ A REGUA NOVA: a ingestao traz APENAS quem FINALIZOU a triagem, ou seja, quem TEM CPF (12% a │
     * │ 17% do universo medido). Quem nao finalizou nao vira pessoa, nem candidatura, nem vaga.     │
     * │                                                                                             │
     * │ O PORTAO QUE REABRE: `INGERIR_SOMENTE_QUEM_FINALIZOU`, em `domain/digai.ts`. Trocar para    │
     * │ `false` volta a admitir todo mundo, e o bloco 9 exercita os DOIS lados dele.                │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * O QUE SE PRESERVA AQUI E A MEDICAO, que continua sendo verdade sobre o fornecedor: 4 de 58
     * com CPF numa pagina real. O que mudou nao foi o dado do outro lado, foi o que NOS fazemos com
     * ele, e separar as duas coisas e o que impede a proxima mudanca de regra de apagar a medicao.
     */
    const pagina = Array.from({ length: 58 }, (_, i) =>
      registroRealDigai({
        userId: `${USER_ID.slice(0, 30)}${String(i).padStart(6, "0")}`,
        cpf: i < 4 ? CPF_SINTETICO : null,
      }),
    );

    // A MEDICAO, intocada: 4 de 58 finalizaram, e o criterio e o CPF valido.
    expect(etapaDoResultadoDigai(pagina[0])).toBe(ETAPA_DIGAI_FINALIZOU);
    expect(etapaDoResultadoDigai(pagina[57])).toBe(ETAPA_DIGAI_NAO_FINALIZOU);
    expect(pagina.filter((r) => etapaDoResultadoDigai(r) === ETAPA_DIGAI_FINALIZOU).length).toBe(4);

    // A REGUA NOVA: 4 entram, 54 ficam de fora, e o plano so e feito sobre os que entram.
    const { admitidos, naoFinalizaram } = separarPorFinalizacaoDigai(pagina);
    expect(admitidos.length, "so quem finalizou a triagem entra na ingestao (decisao do diretor).").toBe(4);
    expect(naoFinalizaram.length).toBe(54);

    const plano = planoDaImportacao({ registros: admitidos, jaImportados: [] });
    expect(
      plano.criar.length,
      "o plano e feito SOBRE OS ADMITIDOS: quem nao finalizou nao chega a ser planejado, e por isso " +
        "nao gera consulta ao banco nem espelho de vaga.",
    ).toBe(4);
    expect(plano.adiar, "nenhum dos admitidos e adiado: todos tem elo com a vaga.").toEqual([]);
  });

  it("reprocessar o MESMO evento duas vezes nao escreve a pessoa duas vezes", async () => {
    const { servico, repo } = montarServico(envelope(registroRealDigai()));
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    repo.conhecidos.add(USER_ID); // a primeira volta criou a identidade
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(
      repo.escritas.filter((e) => e.metodo === "criarCandidato").length,
      "reentrega e o normal do webhook, e ela nao pode duplicar a pessoa.",
    ).toBe(1);
  });

  it("`partnerUserId` esta em 0 de 58 e NAO pode ser chave de coisa nenhuma", () => {
    const semPartner = registroRealDigai({ partnerUserId: null });
    expect(chaveDoRegistroDigai(semPartner)).toBe(USER_ID);
    const plano = planoDaImportacao({ registros: [semPartner], jaImportados: [] });
    expect(plano.criar.length, "campo ausente em 100% da amostra nao pode decidir nada.").toBe(1);
  });
});

// ── 9. O ELO COM A VAGA: `partnerJobId`, NUMERICO DE 7 DIGITOS ─────────────────────────────────

describe("7. `partnerJobId` casa a vaga por `id_vacancy_pandape`, ou a criacao e ADIADA", () => {
  it("os 58 de 58 medidos sao numericos de 7 digitos, e essa forma casa o espelho", () => {
    const espelho = espelhoDaVagaDigai(registroRealDigai({ partnerJobId: "1234567" }));
    expect(espelho).not.toBeNull();
    expect(
      espelho?.id_vacancy_pandape,
      "o `partnerJobId` do Digai E o id da vaga no Pandape (confirmado pelo Ivan): a chave de conflito " +
        "e a MESMA, senao a mesma vaga vira duas e as candidaturas se dividem sem ninguem notar.",
    ).toBe("1234567");
    expect(espelho?.cod_cliente, "a vaga do Digai nasce SEM cliente, marcada para revisao.").toBeNull();
    expect(espelho?.status).toBe("PENDENTE_REVISAO");
  });

  it("`partnerJobId` como NUMERO no JSON casa igual: o fornecedor nao promete o tipo", () => {
    expect(
      espelhoDaVagaDigai(registroRealDigai({ partnerJobId: 1234567 }))?.id_vacancy_pandape,
      "JSON numerico chega como number. Exigir string faria a base inteira ser adiada por diferenca de tipo.",
    ).toBe("1234567");
  });

  it("`partnerJobId` AUSENTE adia, e NUNCA inventa vaga", async () => {
    for (const vazio of [null, undefined, "", "   "]) {
      expect(espelhoDaVagaDigai(registroRealDigai({ partnerJobId: vazio }))).toBeNull();
    }
    const { servico, repo } = montarServico(envelope(registroRealDigai({ partnerJobId: null })));
    const r = await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(r.adiados, "adiar e reprocessavel; inventar `cod_cliente` passa despercebido para sempre (secao A.5).").toBe(1);
    expect(repo.escritas, "adiado nao escreve NADA, nem a pessoa.").toEqual([]);
  });

  it("`partnerJobId` FORA DO FORMATO adia, inclusive quando tem cara de documento", () => {
    for (const hostil of [CPF_SINTETICO, "123.456.789-00", "11987654321", "../outra", "12/34", "a b"]) {
      expect(
        espelhoDaVagaDigai(registroRealDigai({ partnerJobId: hostil })),
        `'${hostil}' nao pode virar chave de vaga: o valor viaja para consulta, log e chave de job.`,
      ).toBeNull();
    }
  });

  it("de ponta a ponta, a vaga e espelhada pelo `partnerJobId` do registro real", async () => {
    const { servico, repo } = montarServico(envelope(registroRealDigai({ partnerJobId: "7654321" })));
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    const espelhada = repo.escritas.find((e) => e.metodo === "espelharVaga");
    expect(espelhada, "com contrato certo, a vaga tem de ser espelhada.").toBeDefined();
    expect(espelhada?.args[0]).toBe("7654321");
  });
});

// ── 9bis. A REGUA DE ADMISSAO: SO QUEM FINALIZOU A TRIAGEM ────────────────────────────────────

describe("9. SO QUEM FINALIZOU A TRIAGEM ENTRA (decisao do diretor, 29/09/2026)", () => {
  /**
   * ┌─ O QUE A DECISAO DIZ, e ela e de COLETA e nao de tela ───────────────────────────────────────┐
   * │ A ingestao traz APENAS quem FINALIZOU a triagem, ou seja, quem tem CPF: 12% a 17% do universo │
   * │ medido (4 de 58 numa pagina, 382 de 2.298 em 60 screenings). Quem nao finalizou NAO VIRA      │
   * │ PESSOA, NAO VIRA CANDIDATURA E NAO VIRA VAGA.                                                 │
   * │                                                                                               │
   * │ "NAO MOSTRAR" E "NAO COLETAR" SAO COISAS DIFERENTES, e so a segunda e minimizacao (secao      │
   * │ A.6). Por isso a prova aqui nao e sobre o que aparece na fila: e sobre o repositorio NAO TER  │
   * │ SIDO CHAMADO, nem para ler. Um filtro aplicado depois da leitura teria feito o banco ser      │
   * │ consultado por causa de quem nunca ia ser escrito.                                            │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */

  /** Quem NAO finalizou: mesmo registro de 41 campos, sem CPF. O `null` e EXPLICITO de proposito. */
  const naoFinalizou = (over: Record<string, unknown> = {}) =>
    registroRealDigai({ cpf: null, ...over });

  it("o criterio e o CPF VALIDO, e lixo repetido do ATS nao passa por finalizacao", () => {
    expect(admitidoNaIngestaoDigai(registroRealDigai())).toBe(true);
    expect(admitidoNaIngestaoDigai(naoFinalizou())).toBe(false);
    for (const lixo of ["00000000000", "11111111111", "123", "", "   ", "abc"]) {
      expect(
        admitidoNaIngestaoDigai(registroRealDigai({ cpf: lixo })),
        `'${lixo}' nao e CPF. Tratar lixo como finalizacao carimbaria conclusao em quem nao concluiu, ` +
          "e o ATS repete esses valores com frequencia.",
      ).toBe(false);
    }
  });

  it("o CPF MASCARADO tambem finaliza: a pontuacao e do fornecedor, nao do candidato", () => {
    const mascarado = `${CPF_SINTETICO.slice(0, 3)}.${CPF_SINTETICO.slice(3, 6)}.${CPF_SINTETICO.slice(6, 9)}-${CPF_SINTETICO.slice(9)}`;
    expect(admitidoNaIngestaoDigai(registroRealDigai({ cpf: mascarado }))).toBe(true);
  });

  it("QUEM NAO FINALIZOU NAO ESCREVE NADA: nem candidato, nem identidade, nem vaga, nem candidatura", async () => {
    const { servico, repo } = montarServico(envelope(naoFinalizou()));
    const r = await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });

    expect(
      repo.escritas,
      "esta e a regra inteira: quem nao finalizou nao vira pessoa, nem candidatura, nem vaga.",
    ).toEqual([]);
    expect(r.escritos).toBe(0);
    expect(
      repo.criarCandidato,
      "`criarCandidato` nao pode nem ser cogitado: minimizacao e nao coletar, e nao coletar e nao gravar.",
    ).not.toHaveBeenCalled();
    expect(repo.espelharVaga, "vaga espelhada por causa de quem nao entra e lixo que ninguem apaga depois.").not.toHaveBeenCalled();
    expect(repo.garantirCandidatura).not.toHaveBeenCalled();
    expect(repo.anexarIdentidade).not.toHaveBeenCalled();
  });

  it("e NEM SEQUER LE o banco por causa dele: o portao vem ANTES da consulta", async () => {
    /*
     * A ORDEM E O QUE FAZ A DIFERENCA. Filtrar depois de consultar produziria o mesmo resultado
     * visivel (zero escrita) e ainda assim faria o banco ser lido uma vez por registro recusado,
     * que e trabalho e exposicao por causa de quem nunca ia entrar.
     */
    const { servico, repo } = montarServico(envelope(naoFinalizou()));
    await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
    expect(repo.candidatoPorIdentidade).not.toHaveBeenCalled();
    expect(repo.candidatoPorDocumento).not.toHaveBeenCalled();
    expect(repo.deParaEtapa).not.toHaveBeenCalled();
  });

  it("A CONTAGEM TEM NOME PROPRIO: `naoFinalizaram` nao se confunde com `adiado` nem com `ignorado`", async () => {
    /*
     * ┌─ POR QUE O NOME PROPRIO IMPORTA, e nao e preciosismo de rotulo ────────────────────────────┐
     * │ ADIADO e falta de ELO COM A VAGA, e e REPROCESSAVEL: quem le vai procurar o `partnerJobId`  │
     * │ que faltou. IGNORADO e quem a base JA CONHECE. Somar "nao finalizou" em qualquer um dos     │
     * │ dois faz o log MENTIR SOBRE O MOTIVO e manda quem investiga procurar um problema que nunca  │
     * │ existiu. E a soma TEM de fechar com o total lido, senao a diferenca vira "sumiu no caminho".│
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { servico } = montarServico(envelope(registroRealDigai()), AMBIENTE_LIGADO);
    const lote = [
      registroRealDigai({ userId: `${USER_ID.slice(0, 30)}000001` }), // finalizou, com elo: ESCRITO
      naoFinalizou({ userId: `${USER_ID.slice(0, 30)}000002` }), // NAO finalizou
      naoFinalizou({ userId: `${USER_ID.slice(0, 30)}000003` }), // NAO finalizou
      registroRealDigai({ userId: `${USER_ID.slice(0, 30)}000004`, partnerJobId: null }), // finalizou, SEM elo: ADIADO
    ].map((cru) => projetarResultadoDigai(cru)!);

    const r = await servico.importar(lote);

    expect(r.naoFinalizaram, "os dois sem CPF sao contados com nome proprio.").toBe(2);
    expect(r.adiados, "adiado e SO a falta de elo com a vaga, e aqui ha exatamente um.").toBe(1);
    expect(r.ignorados, "ignorado e SO quem a base ja conhece, e aqui nao ha nenhum.").toBe(0);
    expect(r.escritos).toBe(1);
    expect(
      r.escritos + r.adiados + r.ignorados + r.naoFinalizaram,
      "A SOMA TEM DE FECHAR COM O TOTAL LIDO. A diferenca que nao fecha vira 'sumiu no caminho', que e " +
        "o modo de falha mais caro de uma ingestao.",
    ).toBe(lote.length);
  });

  it("o log diz o MOTIVO certo, e nao publica um unico valor de pessoa", async () => {
    const captura = capturarLog();
    try {
      const { servico } = montarServico(envelope(naoFinalizou()));
      await servico.processarEvento({ screeningId: SCREENING_ID, userId: USER_ID });
      expect(
        captura.linhas.length,
        "recusa sem aviso vira perda silenciosa, e assercao de PII sobre saida vazia passa de graca.",
      ).toBeGreaterThan(0);
      const texto = JSON.stringify(captura.linhas);
      expect(texto, "o motivo tem de estar escrito, senao quem le procura o elo da vaga que nunca faltou.").toMatch(
        /regua de admissao|nao finalizada|finaliz/i,
      );
      expect(piiNaSaida(captura.linhas, PII_SINTETICA)).toEqual([]);
      expect(
        piiNaSaida(captura.linhas, [USER_ID]),
        "SECAO A.6: aqui nao houve falha a investigar, houve REGRA APLICADA. O identificador sairia " +
          "uma vez por linha do lote, e nao serviria para nada.",
      ).toEqual([]);
    } finally {
      captura.restaurar();
    }
  });

  it("O PORTAO DOS DOIS LADOS: fechado (hoje) recusa, aberto admite. O terreno esta pronto, nao construido", () => {
    /*
     * ┌─ POR QUE PROVAR O LADO QUE NAO ESTA LIGADO ────────────────────────────────────────────────┐
     * │ Porque "o terreno esta preparado" so e verdade se alguem exercitou o outro lado. Portao que │
     * │ nunca foi aberto em teste e promessa, nao preparo, e a hora de descobrir que ele nao abre e │
     * │ justamente o dia em que o diretor pedir os demais. O portao e PARAMETRO com padrao nomeado  │
     * │ exatamente para isto ser comportamento, e nao leitura de codigo-fonte.                       │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(
      INGERIR_SOMENTE_QUEM_FINALIZOU,
      "a decisao VIGENTE do diretor e o portao FECHADO. Trocar esta constante e decisao dele, nao da fabrica (secao A.31).",
    ).toBe(true);

    const pagina = [registroRealDigai(), naoFinalizou({ userId: USER_ID_OUTRO })];

    // LADO FECHADO, que e o padrao de hoje: quem chama sem dizer nada obtem a regra vigente.
    expect(separarPorFinalizacaoDigai(pagina).admitidos.length).toBe(1);
    expect(separarPorFinalizacaoDigai(pagina, true).naoFinalizaram.length).toBe(1);
    expect(admitidoNaIngestaoDigai(naoFinalizou(), true)).toBe(false);

    // LADO ABERTO, que e o dia em que o diretor quiser os demais: NENHUMA outra linha precisa mudar.
    const aberto = separarPorFinalizacaoDigai(pagina, false);
    expect(
      aberto.admitidos.length,
      "abrir o portao admite todo mundo, e o resto da ingestao (plano, espelho, dedup, de/para) ja trata quem nao finalizou.",
    ).toBe(2);
    expect(aberto.naoFinalizaram).toEqual([]);
    expect(admitidoNaIngestaoDigai(naoFinalizou(), false)).toBe(true);

    // E com o portao aberto o plano volta a planejar os dois, sem nenhuma outra mudanca.
    const plano = planoDaImportacao({ registros: aberto.admitidos, jaImportados: [] });
    expect(plano.criar.length).toBe(2);
  });

  it("o de/para de `triagem em andamento` CONTINUA existindo: e ele que faz o portao abrir sozinho", () => {
    /*
     * Se a decisao tivesse APAGADO a linha do de/para, abrir o portao nao bastaria: quem nao
     * finalizou entraria e morreria no fail-closed do de/para, sem etapa para onde ir. Manter a
     * linha e o que transforma "trocar uma constante" em verdade, e nao em promessa.
     */
    const chaves = ETAPAS_DIGAI.map((e) => e.chaveExterna);
    expect(chaves).toContain(ETAPA_DIGAI_NAO_FINALIZOU);
    expect(chaves).toContain(ETAPA_DIGAI_FINALIZOU);
  });
});

// ── 10. O CANARIO: a fixture e a producao nao podem divergir em silencio ───────────────────────

describe("8. CANARIO DO CONTRATO: o que este arquivo afirma sobre o fornecedor", () => {
  /**
   * ┌─ POR QUE UM CANARIO, e nao so os testes acima ───────────────────────────────────────────────┐
   * │ Os 174 verdes sobre o contrato errado nao foram um teste ruim: foram um DUBLE ruim. Um duble │
   * │ nao fica vermelho sozinho quando a realidade muda. O que este bloco faz e deixar por escrito, │
   * │ EM ASSERCAO, o que foi medido, para que a proxima medicao que discordar tenha onde bater.     │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a amostra medida: 58 de 58 com userId/partnerJobId/appliedAt, 4 de 58 com CPF, 0 de 58 com name", () => {
    const r = registroRealDigai();
    expect(typeof r.userId).toBe("string");
    expect(String(r.userId).length, "os userId medidos tem 36 caracteres.").toBe(36);
    expect(String(r.userId)).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(String(r.partnerJobId), "partnerJobId: numerico de 7 digitos, 58 de 58.").toMatch(/^\d{7}$/);
    expect("name" in r, "`name` nao existe no registro real.").toBe(false);
    expect("firstname" in r && "lastname" in r).toBe(true);
    expect(r.partnerUserId, "partnerUserId: 0 de 58.").toBeNull();
  });

  /*
   * ┌─ O QUE ESTAVA AQUI ERA TEATRO, E SAIU (achado do `seguranca` na reauditoria) ───────────────┐
   * │ Havia um `it` chamado "os parametros de query sao IGNORADOS pelo fornecedor" cuja unica     │
   * │ assercao era `["userId","user_id","search","partnerUserId"].length === 4`: uma tautologia    │
   * │ sobre um array literal do PROPRIO teste, que nao toca producao nenhuma e nao pode ficar      │
   * │ vermelha por motivo algum. Verde que nao pode falhar nao e cobertura, e ainda engana quem le │
   * │ o relatorio da suite.                                                                        │
   * │                                                                                              │
   * │ A MEDICAO CONTINUA VALENDO, e por isso fica escrita: `?userId=`, `?user_id=`, `?search=` e   │
   * │ `?partnerUserId=` devolveram os MESMOS 58 de 58 na producao do Digai em 29/09/2026. NAO HA   │
   * │ filtro no servidor, e so `page` tem efeito. Quem escrever paginacao contando com filtro do   │
   * │ lado de la vai processar a pagina inteira acreditando que filtrou, e a conta de "quantos     │
   * │ faltam" nunca vai fechar. O dia em que existir uma paginacao, o teste dela e que prova isso. │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
});
