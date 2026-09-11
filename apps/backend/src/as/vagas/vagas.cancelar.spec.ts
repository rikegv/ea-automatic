import { ConflictException, ForbiddenException, HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  CANDIDATURA_SITUACOES,
  SITUACOES_QUE_SEGURAM_CANCELAMENTO,
  seguraOCancelamento,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import { SITUACOES_TRATADAS } from "../../domain/candidatura";
import {
  asCandidaturaEtapas,
  asCandidaturas,
  vagaBeneficio,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ CANCELAR VAGA (B1): O REQUISITO, ESCRITO ANTES DO CÓDIGO (§A.40, regra 2) ────────────────────
 *
 * ESTE ARQUIVO É DO `tester`, E NÃO DE QUEM CONSTRUIU. A régua da §A.38 é essa: teste do próprio
 * autor pega REGRESSÃO bem e pega MAL-ENTENDIDO DE REQUISITO mal, porque ele codifica exatamente a
 * suposição que gerou o código. O que está afirmado aqui é o REQUISITO do diretor, e nada do que a
 * implementação vier a fazer é lido como definição.
 *
 * ┌─ A ARMADILHA CENTRAL, E ELA É UMA LINHA DE CÓDIGO ─────────────────────────────────────────┐
 * │ O módulo já tem uma função PARECIDA e ERRADA para esta pergunta: `pendentesDeTratamento`     │
 * │ (`domain/candidatura.ts`), que serve à trava do FECHAMENTO e enxerga SÓ o `ATIVO`, porque    │
 * │ `SITUACOES_TRATADAS` inclui o `ALOCADO`. Reusá-la aqui entrega uma trava que DEIXA CANCELAR  │
 * │ UMA VAGA COM CINCO ALOCADOS DENTRO, sem Master e sem trilha, e nenhum teste de fechamento    │
 * │ ficaria vermelho, porque para o fechamento a régua está certa.                               │
 * │                                                                                             │
 * │ SÃO DUAS PERGUNTAS DIFERENTES: o fechamento pergunta "sobrou alguém EM SELEÇÃO?"; o          │
 * │ cancelamento pergunta "sobrou alguém cujo processo NÃO TERMINOU?". `ALOCADO` responde        │
 * │ "não" à primeira e "sim" à segunda. A régua do cancelamento é `seguraOCancelamento`, no      │
 * │ vocabulário compartilhado, e o teste abaixo a percorre INTEIRA, situação por situação.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O SEGUNDO FURO COBERTO AQUI é o CARIMBO DIRIGIDO PELO CORPO: um `...(dto.forcar ? {...} : {})`
 * carimba como forçada uma vaga em que ninguém segurava nada, e passa a acusar de exceção quem não
 * fez exceção nenhuma. Só um teste que mande `forcar: true` numa vaga LIMPA pega isso.
 *
 * O TERCEIRO é a LGPD (§A.6): o cancelamento FORÇADO tem de encerrar as candidaturas que atropelou,
 * senão o expurgo (`retencao-candidatos.service.ts`) nunca alcança aquela pessoa, porque ele só
 * anonimiza quem não tem candidatura VIVA, e `ATIVO`/`ALOCADO` são vivas. Vaga cancelada com gente
 * viva dentro retém CPF, nome, e-mail e telefone PARA SEMPRE.
 *
 * O FAKE É O DOS VIZINHOS (`vagas.fechamento-apos-reducao.spec.ts` e
 * `candidatos.guardas-de-situacao.spec.ts`): banco COM MEMÓRIA, porque o duplo clique precisa que a
 * segunda chamada ENXERGUE o que a primeira gravou. Sem memória, o teste da corrida diria que a
 * trava segurou quando ela nem foi consultada.
 */

const T0 = new Date("2026-09-10T12:00:00.000Z");

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };
const SUPER: AuthUser = { ...COMUM, id: "user-super", papel: "SUPER_ADMIN" };

const MOTIVO = "Cliente cancelou a solicitação";
const CATALOGO = [
  { id: "mot-1", nome: MOTIVO, ativo: true },
  { id: "mot-2", nome: "Vaga duplicada", ativo: true },
  { id: "mot-3", nome: "Motivo fora de circulação", ativo: false },
];

const CORPO = { motivo: MOTIVO, dataCancelamento: "2026-09-10" };

/**
 * UMA CANDIDATURA DA VAGA, na forma que a leitura sob o lock devolve.
 *
 * ELA CARREGA CPF, E-MAIL E TELEFONE DE PROPÓSITO (§A.6): é a única forma de o teste do corpo da
 * recusa ter o que provar. Um service que monte `naoEncerrados` espalhando a linha inteira passa a
 * mandar dado pessoal para a tela, e o teste das CHAVES abaixo é quem pega isso.
 */
function pessoa(
  situacao: CandidaturaSituacao,
  nome = "Fulano",
  posicaoLado: string | null = null,
) {
  return {
    candidaturaId: `cand-${nome}`,
    candidatoId: `pessoa-${nome}`,
    candidatoNome: nome,
    etapa: "APROVACAO",
    situacao,
    posicaoLado,
    cpf: "12345678901",
    email: "fulano@exemplo.com",
    telefone: "11999990000",
  };
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  where: unknown;
  naTransacao: boolean;
}

/**
 * O BANCO FINGIDO, com memória na linha da vaga.
 *
 * A ROTA DA TABELA DESCONHECIDA devolve o CATÁLOGO DE MOTIVOS. A tabela do catálogo ainda não
 * existe no schema quando este arquivo é escrito, então não há como casá-la por identidade: tudo que
 * não é `vagas`, `as_candidaturas`, `vaga_beneficio` ou `vaga_meta_reducoes` é lido como o catálogo.
 * Se a construção resolver o motivo por um SERVICE INJETADO em vez de por consulta, este fake não é
 * consultado e os testes do motivo falham por ACOPLAMENTO, não por defeito: está dito aqui para o
 * vermelho ser lido certo.
 */
function makeDb(cenario: {
  status?: string;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  candidaturas?: ReturnType<typeof pessoa>[];
  motivos?: { id: string; nome: string; ativo: boolean }[];
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    codigo: "PS-2026-999",
    nomeDivulgacao: "Vaga de teste",
    status: cenario.status ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
    vagasFechadas: null,
    vagasFechadasBanco: null,
    dataFechamento: null,
    escolaridade: null,
    regioes: [],
    idiomas: [],
    testes: [],
    etapasPs: [],
    criadoEm: T0,
    fechamentoForcadoPorId: null,
    fechamentoForcadoEm: null,
    fechamentoForcadoFaltavam: null,
    canceladaPorId: null,
    canceladaEm: null,
    cancelamentoMotivo: null,
    cancelamentoObservacao: null,
  };

  const linhas = cenario.candidaturas ?? [];
  const motivos = cenario.motivos ?? CATALOGO;
  const ativos = motivos.filter((m) => m.ativo);
  const escritas: Escrita[] = [];
  /** A ORDEM DOS GESTOS, que é o que prova que a decisão foi tomada COM a linha da vaga travada. */
  const ordem: string[] = [];
  let naTransacao = false;

  const agregado = () => {
    const chave = new Map<string, Record<string, unknown>>();
    for (const l of linhas) {
      const k = `${l.situacao}|${l.posicaoLado ?? ""}|${l.etapa}`;
      const atual = chave.get(k) ?? {
        vagaId: "vaga-1",
        situacao: l.situacao,
        posicaoLado: l.posicaoLado,
        etapa: l.etapa,
        quantas: 0,
      };
      atual.quantas = (atual.quantas as number) + 1;
      chave.set(k, atual);
    }
    return [...chave.values()];
  };

  const daListagem = () => ({
    v: { ...vaga },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
    fechamentoForcadoPorNome: null,
    canceladaPorNome: null,
  });

  const linhasDe = (tabela: unknown): unknown[] => {
    if (tabela === vagas) return [daListagem()];
    if (tabela === asCandidaturas) return linhas;
    if (tabela === vagaBeneficio) return [];
    if (tabela === vagaMetaReducoes) return [];
    // A rota da tabela DESCONHECIDA: o catálogo de motivos de cancelamento.
    return ativos.map((m) => ({ ...m }));
  };

  const fabricaDeSelect = (executor: "db" | "tx") => () => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.for = (modo: string) => {
      ordem.push(modo === "update" ? "trava-vaga" : `for-${modo}`);
      return Promise.resolve([{ ...vaga }]);
    };
    b.limit = () => Promise.resolve(linhasDe(tabela));
    b.orderBy = () => {
      /*
       * O EXECUTOR IMPORTA, e é a razão de o fake distinguir os dois: uma leitura feita por
       * `this.db` DENTRO da transação responde sobre um instante ANTERIOR ao lock, e o teste da
       * ordem não teria como notar se as duas portas fossem a mesma função.
       */
      if (tabela === asCandidaturas && naTransacao) {
        ordem.push(executor === "tx" ? "le-candidaturas" : "le-candidaturas-fora-do-lock");
      }
      return Promise.resolve(linhasDe(tabela));
    };
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? agregado() : []);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhasDe(tabela)).then(r);
    return b;
  };

  const select = vi.fn(fabricaDeSelect("db"));
  const selectDaTransacao = vi.fn(fabricaDeSelect("tx"));

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async (cond: unknown) => {
        escritas.push({ tabela, valores, where: cond, naTransacao });
        if (naTransacao) ordem.push(tabela === vagas ? "grava-vaga" : "encerra-candidatura");
        if (tabela === vagas) Object.assign(vaga, valores);
        return undefined;
      },
    }),
    /*
     * AGUARDÁVEL **E** COM `returning`, como o Drizzle de verdade. O `cancelar` passou a inserir o
     * EVENTO da trilha da vaga e a carimbar o ID DELE em cada saída de candidatura, e esse id é o
     * marcador que a reabertura lê para saber quem saiu NAQUELE cancelamento. Sem isto o fake
     * reprovaria a produção por uma limitação dele.
     */
    values: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores, where: null, naTransacao });
      const id = `evento-fake-${escritas.length}`;
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => [{ id, ...valores }],
      };
    },
  });

  const tx = {
    select: selectDaTransacao,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => ativos.map((m) => ({ ...m })),
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  const db = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => ativos.map((m) => ({ ...m })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      naTransacao = true;
      try {
        return await fn(tx);
      } finally {
        naTransacao = false;
      }
    },
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  return {
    service: new VagasService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never),
    vaga,
    escritas,
    ordem,
  };
}

/**
 * O MÉTODO É RESOLVIDO POR NOME, e não chamado direto, pela mesma razão do
 * `candidatos.lote-dto.spec.ts`: enquanto ele não existir, cada teste falha com uma frase que DIZ o
 * que falta, em vez de o `typecheck` do repositório inteiro ficar vermelho por causa deste arquivo.
 */
type Cancelar = (id: string, dto: Record<string, unknown>, user: AuthUser) => Promise<unknown>;

function cancelarDe(service: VagasService): Cancelar {
  const alvo = (service as unknown as Record<string, unknown>).cancelar;
  if (typeof alvo !== "function") {
    throw new Error(
      "VagasService.cancelar ainda não existe. Enquanto a construção não chegar, este arquivo é a especificação dele.",
    );
  }
  return (alvo as Cancelar).bind(service);
}

/** Cancela e devolve o erro, para o teste afirmar sobre ele sem `try/catch` espalhado. */
async function recusa(
  service: VagasService,
  user: AuthUser,
  corpo: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    await cancelarDe(service)("vaga-1", { ...CORPO, ...corpo }, user);
    return null;
  } catch (err) {
    return err;
  }
}

const corpoDe = (erro: unknown): Record<string, unknown> =>
  (erro as ConflictException).getResponse() as Record<string, unknown>;

/** As escritas na linha da VAGA, que é onde a trilha do cancelamento mora. */
const naVaga = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === vagas);
const naCandidatura = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === asCandidaturas);
/** Os eventos escritos na linha do tempo da candidatura: é lá que "descartado na Triagem" vive. */
const noHistorico = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === asCandidaturaEtapas);

/**
 * O PAYLOAD DA GRAVAÇÃO, com as chaves NORMALIZADAS (sem `_`, minúsculas), para o teste afirmar
 * sobre a COLUNA que o requisito nomeia (`cancelada_por_id`) sem depender de a construção ter
 * escrito `canceladaPorId` ou o nome cru. Nome DIFERENTE continua sendo achado, e é o que se quer.
 */
function gravado(escritas: Escrita[]): Record<string, unknown> {
  const alvo = naVaga(escritas)[0]?.valores ?? {};
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(alvo)) saida[k.replace(/_/g, "").toLowerCase()] = v;
  return saida;
}

/** Todo campo de "forçado" que a gravação tocou, com o valor que recebeu. */
function camposDeForcado(escritas: Escrita[]): [string, unknown][] {
  const alvo = naVaga(escritas)[0]?.valores ?? {};
  return Object.entries(alvo).filter(([k]) => /forcad/i.test(k));
}

/** Todos os textos alcançáveis dentro de um objeto, para espiar a cláusula `where` do Drizzle. */
function textosDe(valor: unknown, vistos = new Set<unknown>(), profundidade = 0): string[] {
  if (profundidade > 8 || valor === null || valor === undefined) return [];
  if (typeof valor === "string") return [valor];
  if (typeof valor !== "object") return [];
  if (vistos.has(valor)) return [];
  vistos.add(valor);
  return Object.values(valor as Record<string, unknown>).flatMap((v) =>
    textosDe(v, vistos, profundidade + 1),
  );
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A RÉGUA, ANTES DE QUALQUER COMPORTAMENTO: ela é o que separa esta trava da do fechamento.
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("a régua do cancelamento é OUTRA, e não a do fechamento", () => {
  it("o vocabulário chegou construído ao tempo de execução", () => {
    expect(Array.isArray(SITUACOES_QUE_SEGURAM_CANCELAMENTO)).toBe(true);
    expect(typeof seguraOCancelamento).toBe("function");
  });

  it("quem SEGURA o cancelamento é ATIVO e ALOCADO, e mais ninguém", () => {
    expect([...SITUACOES_QUE_SEGURAM_CANCELAMENTO].sort()).toEqual(["ALOCADO", "ATIVO"]);
  });

  /**
   * A PROVA DE QUE AS DUAS RÉGUAS DIVERGEM, e é ela que documenta o custo de reusar a errada: o
   * `ALOCADO` está nas TRATADAS (não segura o fechamento) e SEGURA o cancelamento. Se um dia as duas
   * listas coincidirem, este teste avisa antes de alguém "simplificar" uma delas para a outra.
   */
  it("o ALOCADO é TRATADO para o fechamento e SEGURA o cancelamento: as réguas não são a mesma", () => {
    expect(SITUACOES_TRATADAS).toContain("ALOCADO");
    expect(SITUACOES_QUE_SEGURAM_CANCELAMENTO).toContain("ALOCADO");
    const naoTratadas = CANDIDATURA_SITUACOES.filter((s) => !SITUACOES_TRATADAS.includes(s));
    expect([...SITUACOES_QUE_SEGURAM_CANCELAMENTO].sort()).not.toEqual([...naoTratadas].sort());
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 1: A ORIGEM
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("a origem: só a vaga no papel de ABERTURA cancela", () => {
  /**
   * A LISTA VEM DO CATÁLOGO (onda B2), e não mais de `VAGA_STATUS`. O que a trava pergunta deixou
   * de ser "o código é ABERTA?" e passou a ser "esta linha exerce o papel de ABERTURA?", que é a
   * mesma pergunta enquanto os dois concordam, e continua certa quando o diretor renomear a linha.
   *
   * O `VAGA_BANCO` ENTRA NO RECORTE, e é correto: ele não é o status de abertura, então cancelar
   * por ali é recusado. O status dormente nunca teve permissão de cancelar coisa alguma.
   */
  const OUTROS = linhasDeStatusFingidas()
    .filter((s) => s.papel !== "ABERTURA")
    .map((s) => s.codigo);

  it("o recorte não é vazio (o catálogo precisa ter os outros quatro mais o dormente)", () => {
    expect(OUTROS).toEqual(["RASCUNHO", "ENTREGUE", "FECHADA", "CANCELADA", "VAGA_BANCO"]);
  });

  it.each(OUTROS)("a vaga %s é recusada com conflito, e nada é gravado", async (status) => {
    const { service, escritas } = makeDb({ status, candidaturas: [] });

    const erro = await recusa(service, MASTER);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(escritas).toHaveLength(0);
  });

  /**
   * A ORDEM DOS GESTOS, que é o que torna a corrida RECUSADA em vez de só ordenada: a linha da vaga
   * é TRAVADA antes de qualquer leitura de candidatura, e a decisão é tomada sobre a fotografia
   * tirada sob o lock. Uma leitura por fora responderia sobre um instante anterior ao da decisão, e
   * a finalização de posição que chegasse no meio passaria despercebida.
   */
  it("a linha da vaga é TRAVADA antes de contar, e a gravação vem depois das duas", async () => {
    const { service, ordem } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const passos = ordem.filter((p) => p !== "for-share");
    expect(passos.slice(0, 2)).toEqual(["trava-vaga", "le-candidaturas"]);
    expect(passos[passos.length - 1]).toBe("grava-vaga");
    // A LEITURA POR FORA DO LOCK responderia sobre um instante anterior ao da decisão.
    expect(passos).not.toContain("le-candidaturas-fora-do-lock");
  });

  /**
   * O DUPLO CLIQUE. Sem a trava de origem, a segunda chamada REESCREVE a trilha (outro autor, outra
   * data, outro motivo) por cima de um cancelamento que já aconteceu, e a história do processo passa
   * a ser a da última vez que alguém apertou o botão.
   */
  it("o duplo clique devolve conflito e NÃO reescreve a trilha da primeira vez", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    const primeira = { ...gravado(escritas) };

    const erro = await recusa(service, MASTER, { motivo: "Vaga duplicada" });
    expect(erro).toBeInstanceOf(ConflictException);

    expect(naVaga(escritas)).toHaveLength(1);
    expect(gravado(escritas)).toEqual(primeira);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 2: A TRAVA
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("a trava: quem ainda não terminou SEGURA o cancelamento", () => {
  /**
   * ─ O TESTE QUE PEGA A RÉGUA ERRADA ────────────────────────────────────────────────────────────
   *
   * UM `ALOCADO` E MAIS NADA. Com `pendentesDeTratamento` no lugar de `seguraOCancelamento`, esta
   * vaga cancela em silêncio, sem Master e sem trilha, com uma pessoa entregue dentro dela.
   */
  it.each([...SITUACOES_QUE_SEGURAM_CANCELAMENTO])(
    "a vaga com UM %s e mais nada recusa o COMUM que não forçou",
    async (situacao) => {
      const { service, escritas } = makeDb({ candidaturas: [pessoa(situacao, "Ana")] });

      const erro = await recusa(service, COMUM);
      expect(erro).toBeInstanceOf(ConflictException);
      expect(corpoDe(erro)).toMatchObject({
        needsConfirmation: true,
        reason: "candidatosNaoEncerrados",
        podeForcar: false,
      });
      const lista = corpoDe(erro).naoEncerrados as Record<string, unknown>[];
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({ candidaturaId: "cand-Ana", situacao });
      // NADA FOI GRAVADO: a recusa não pode deixar meia mudança.
      expect(escritas).toHaveLength(0);
    },
  );

  const ENCERRADAS = CANDIDATURA_SITUACOES.filter((s) => !seguraOCancelamento(s));

  it("o recorte dos encerrados é o esperado (o laço abaixo não pode ser vazio)", () => {
    expect([...ENCERRADAS].sort()).toEqual([
      "APROVADO",
      "DESCARTADO",
      "DESISTIU",
      "ENVIADO_PARA_ADMISSAO",
    ]);
  });

  it.each(ENCERRADAS)("a vaga com UM %s cancela pela porta normal, sem Master", async (situacao) => {
    const { service, vaga, escritas } = makeDb({ candidaturas: [pessoa(situacao, "Bia")] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    expect(vaga.status).toBe("CANCELADA");
    expect(camposDeForcado(escritas)).toEqual([]);
  });

  it("a vaga com TODOS os encerrados juntos cancela: nenhum deles segura nada", async () => {
    const { service, vaga } = makeDb({
      candidaturas: ENCERRADAS.map((s) => pessoa(s, `P-${s}`)),
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(vaga.status).toBe("CANCELADA");
  });

  it("o corpo da recusa lista TODOS os que seguram e NENHUM dos encerrados", async () => {
    const { service } = makeDb({
      candidaturas: [
        pessoa("ATIVO", "Ana"),
        pessoa("ALOCADO", "Bia", "OFICIAL"),
        pessoa("APROVADO", "Caio"),
        pessoa("ENVIADO_PARA_ADMISSAO", "Dora"),
        pessoa("DESCARTADO", "Eli"),
        pessoa("DESISTIU", "Fábio"),
      ],
    });

    const erro = await recusa(service, COMUM);
    const lista = corpoDe(erro).naoEncerrados as Record<string, unknown>[];
    expect(lista.map((i) => i.candidaturaId).sort()).toEqual(["cand-Ana", "cand-Bia"]);
  });

  /**
   * §A.6: A RECUSA VIAJA PARA A TELA. Ela leva id de candidatura, id e NOME do candidato, etapa e
   * situação, que é o que a recusa do fechamento já trafega hoje em produção. CPF, e-mail e telefone
   * estão na linha lida do banco (o fake os coloca lá de propósito) e NÃO podem sair daqui.
   */
  it("o corpo da recusa NÃO carrega CPF, e-mail nem telefone", async () => {
    const { service } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    const erro = await recusa(service, COMUM);
    const lista = corpoDe(erro).naoEncerrados as Record<string, unknown>[];
    for (const item of lista) {
      expect(Object.keys(item).sort()).toEqual([
        "candidatoId",
        "candidatoNome",
        "candidaturaId",
        "etapa",
        "situacao",
      ]);
    }
  });

  it("`podeForcar` é do PAPEL DA SESSÃO: falso para o COMUM, verdadeiro para Master e Super", async () => {
    for (const [user, esperado] of [
      [COMUM, false],
      [MASTER, true],
      [SUPER, true],
    ] as const) {
      const { service } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });
      const erro = await recusa(service, user);
      expect(corpoDe(erro).podeForcar, `papel ${user.papel}`).toBe(esperado);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 3: A AUTORIDADE
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("a autoridade do forçar: só MASTER e SUPER_ADMIN atropelam alguém", () => {
  it("o COMUM que manda `forcar: true` numa vaga travada recebe 403, e nada é gravado", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ALOCADO", "Ana", "OFICIAL")] });

    const erro = await recusa(service, COMUM, { forcar: true });
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(escritas).toHaveLength(0);
  });

  it.each([MASTER, SUPER])("o $papel força e a vaga sai CANCELADA", async (user) => {
    const { service, vaga } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, user);
    expect(vaga.status).toBe("CANCELADA");
  });

  /**
   * O PAPEL VEM DA SESSÃO, NUNCA DO CORPO. O corpo carrega um `papel` de mentira; quem decide é o
   * `AuthUser` que a controller preenche com `@CurrentUser()`.
   */
  it("o papel mandado no CORPO não promove ninguém", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    const erro = await recusa(service, COMUM, {
      forcar: true,
      papel: "SUPER_ADMIN",
      user: { papel: "MASTER" },
    });
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(escritas).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 4: O CARIMBO DO FORÇADO
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("o carimbo do forçado é do FATO, e não do flag que veio no corpo", () => {
  /**
   * ─ O TESTE QUE PEGA O `...(dto.forcar ? {...} : {})` ──────────────────────────────────────────
   *
   * UM COMUM COM `forcar: true` NUMA VAGA EM QUE NINGUÉM SEGURA. A tela manda o flag por descuido, o
   * botão fica pressionado duas vezes, o cliente reenvia o mesmo pedido: em nenhum desses casos
   * houve exceção alguma a registrar. Carimbar aqui é acusar de exceção quem cancelou uma vaga
   * limpa, e é o `cancelamento_forcado_por_id` de alguém que não tem autoridade para forçar.
   */
  it("o COMUM com `forcar: true` numa vaga LIMPA cancela, e a vaga NÃO sai carimbada", async () => {
    const { service, vaga, escritas } = makeDb({
      candidaturas: [pessoa("APROVADO", "Caio"), pessoa("DESISTIU", "Eli")],
    });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, COMUM);

    expect(vaga.status).toBe("CANCELADA");
    // NENHUM campo de "forçado" pode ter sido escrito com valor.
    for (const [campo, valor] of camposDeForcado(escritas)) {
      expect(valor, `${campo} não podia ter sido carimbado`).toBeNull();
    }
  });

  it("a vaga SEM candidatura nenhuma com `forcar: true` também sai sem carimbo", async () => {
    const { service, vaga, escritas } = makeDb({ candidaturas: [] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    expect(vaga.status).toBe("CANCELADA");
    for (const [campo, valor] of camposDeForcado(escritas)) {
      expect(valor, `${campo} não podia ter sido carimbado`).toBeNull();
    }
  });

  /**
   * O CONTRASTE, sem o qual os dois testes acima seriam satisfeitos por uma implementação que nunca
   * carimba nada: quando houve ATROPELO de verdade, o carimbo TEM de existir, com o autor e a hora.
   */
  it("o MASTER que atropela alguém SAI carimbado, com autor e hora", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ALOCADO", "Ana", "OFICIAL")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const campos = camposDeForcado(escritas);
    expect(campos.length, "o forçamento precisa deixar trilha").toBeGreaterThan(0);
    const preenchidos = campos.filter(([, v]) => v !== null && v !== undefined);
    expect(preenchidos.length).toBeGreaterThan(0);
    expect(campos.map(([, v]) => v)).toContain(MASTER.id);
  });

  /**
   * O TAMANHO DA EXCEÇÃO É O QUE A AUDITORIA VAI LER: quantos processos aquele Master atropelou. Um
   * zero gravado aqui descreveria um fato que não aconteceu, e o banco recusa (`CHECK > 0`), então o
   * número tem de ser a contagem de quem segurava NO INSTANTE, e não um recálculo posterior (que
   * daria zero para sempre, porque o próprio cancelamento encerra essas candidaturas).
   */
  it("o carimbo conta QUANTOS seguravam no instante, e o número não é zero", async () => {
    const { service, escritas } = makeDb({
      candidaturas: [
        pessoa("ATIVO", "Ana"),
        pessoa("ALOCADO", "Bia", "OFICIAL"),
        pessoa("APROVADO", "Caio"),
      ],
    });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const numeros = camposDeForcado(escritas)
      .map(([, v]) => v)
      .filter((v): v is number => typeof v === "number");
    expect(numeros, "o carimbo precisa registrar quantos processos foram atropelados").toContain(2);
    for (const n of numeros) expect(n).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 5: O RASTRO
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("o rastro: não existe vaga cancelada sem trilha", () => {
  it("uma gravação SÓ leva status, data, contadores, autor, hora, motivo e observação", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    await cancelarDe(service)(
      "vaga-1",
      { ...CORPO, observacao: "o cliente avisou por e-mail" },
      MASTER,
    );

    // UMA gravação: o estado "cancelada sem trilha" não pode existir nem por um instante.
    expect(naVaga(escritas)).toHaveLength(1);

    const g = gravado(escritas);
    expect(g.status).toBe("CANCELADA");
    expect(g.datafechamento).toBe(CORPO.dataCancelamento);
    expect(g.canceladaporid).toBe(MASTER.id);
    expect(g.canceladaem).toBeInstanceOf(Date);
    expect(g.cancelamentomotivo).toBe(MOTIVO);
    expect(g.cancelamentoobservacao).toBe("o cliente avisou por e-mail");
    // Os dois contadores são SEMPRE escritos, inclusive zerados: é a fotografia do instante.
    expect(g.vagasfechadas).toBe(0);
    expect(g.vagasfechadasbanco).toBe(0);
  });

  it("sem observação, a coluna fica NULA, e não `undefined`", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(gravado(escritas).cancelamentoobservacao).toBeNull();
  });

  /**
   * A OCUPAÇÃO DERIVADA DO INSTANTE, no caso em que ela não tem ambiguidade nenhuma: quem está
   * `ENVIADO_PARA_ADMISSAO` ENCHE O CILINDRO (`finalizaPosicao`) e NÃO segura o cancelamento, então
   * ninguém é atropelado e o número é o mesmo antes e depois.
   */
  it("os contadores saem da CONTAGEM das candidaturas, separados por lado", async () => {
    const { service, escritas } = makeDb({
      posicoesOficiais: 3,
      candidaturas: [
        pessoa("ENVIADO_PARA_ADMISSAO", "Dora", "OFICIAL"),
        pessoa("ENVIADO_PARA_ADMISSAO", "Edu", "BANCO"),
        pessoa("DESCARTADO", "Eli"),
      ],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    const g = gravado(escritas);
    expect(g.vagasfechadas).toBe(1);
    expect(g.vagasfechadasbanco).toBe(1);
  });

  /**
   * ─ ATENÇÃO, ESTE É O PONTO AMBÍGUO DO REQUISITO, e ele está pinado de propósito ───────────────
   *
   * O `ALOCADO` ENCHE O CILINDRO **E** SEGURA O CANCELAMENTO, e o forçado o DESCARTA (item 6). A
   * ocupação, então, tem dois valores possíveis: a de ANTES do descarte (2 e 1, a fotografia do que
   * a vaga tinha no instante em que alguém mandou cancelar) e a de DEPOIS (0 e 0, porque ninguém
   * ficou entregue). O requisito diz "a ocupação derivada do INSTANTE", e o instante do cancelamento
   * é a leitura feita sob o lock, ANTES do descarte: é essa que está afirmada aqui.
   *
   * SE A CONSTRUÇÃO ESCOLHEU A OUTRA, este teste fica vermelho e a pergunta sobe para o diretor. Não
   * é defeito óbvio dos dois lados; é decisão que o requisito não fechou.
   */
  it("o forçado carimba a ocupação do instante ANTERIOR ao descarte", async () => {
    const { service, escritas } = makeDb({
      posicoesOficiais: 3,
      candidaturas: [
        pessoa("ALOCADO", "Ana", "OFICIAL"),
        pessoa("ALOCADO", "Bia", "OFICIAL"),
        pessoa("ALOCADO", "Caio", "BANCO"),
      ],
    });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const g = gravado(escritas);
    expect(g.vagasfechadas).toBe(2);
    expect(g.vagasfechadasbanco).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 6: A LGPD
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("§A.6: o forçado ENCERRA quem atropelou, ou o CPF fica retido para sempre", () => {
  /**
   * POR QUE ISTO É REQUISITO E NÃO ZELO: `retencao-candidatos.service.ts` só anonimiza o candidato
   * que NÃO tem candidatura viva, e `ATIVO`/`ALOCADO` são vivas (`candidaturaViva`). Uma viva
   * pendurada numa vaga CANCELADA nunca mais se move, então o prazo nunca corre e o expurgo nunca
   * alcança aquela pessoa. Nome, CPF, e-mail e telefone ficam no banco indefinidamente.
   */
  it("o cancelamento forçado grava DESCARTADO nas candidaturas, dentro da MESMA transação", async () => {
    const { service, escritas } = makeDb({
      candidaturas: [pessoa("ATIVO", "Ana"), pessoa("ALOCADO", "Bia", "OFICIAL")],
    });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const encerramentos = naCandidatura(escritas);
    expect(encerramentos.length, "o forçado precisa encerrar quem atropelou").toBeGreaterThan(0);
    for (const e of encerramentos) {
      expect(e.valores.situacao).toBe("DESCARTADO");
      expect(e.naTransacao, "o encerramento tem de estar na transação do cancelamento").toBe(true);
      // UM `update` sem `where` varreria a tabela inteira. Nunca pode ser ausente.
      expect(e.where, "o encerramento sem cláusula alcançaria outras vagas").toBeTruthy();
    }
  });

  it("o descarte carrega POR QUÊ, e não encerra em silêncio", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const motivos = naCandidatura(escritas).map((e) => String(e.valores.motivoDescarte ?? ""));
    expect(motivos.length).toBeGreaterThan(0);
    for (const m of motivos) {
      expect(m.trim().length, "o motivo do descarte não pode ser vazio").toBeGreaterThan(0);
      // DERIVADO DO CANCELAMENTO: ou repete o motivo escolhido, ou diz que a vaga foi cancelada.
      expect(m.includes(MOTIVO) || /cancel/i.test(m), `motivo do descarte: ${m}`).toBe(true);
    }
  });

  /**
   * O EVENTO NA LINHA DO TEMPO, e ele não é enfeite: depois da saída, a etapa some da leitura viva
   * da tela, e sem o evento o lugar onde o processo terminou se perde para sempre. Uma implementação
   * que troque a porta de saída por um `update` cru na situação continua passando nos testes acima e
   * quebra neste, que é exatamente o desvio que o módulo já documentou como risco.
   */
  it("o encerramento aparece na LINHA DO TEMPO da candidatura, e não só na coluna", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const eventos = noHistorico(escritas);
    expect(eventos.length, "a saída forçada precisa virar evento no histórico").toBeGreaterThan(0);
    expect(eventos[0].valores).toMatchObject({ candidaturaId: "cand-Ana", situacao: "DESCARTADO" });
    // A AUTORIA É DA SESSÃO: quem autorizou a exceção responde por ela também no histórico.
    expect(eventos[0].valores.porId).toBe(MASTER.id);
  });

  /**
   * O RELÓGIO DA RETENÇÃO É O `atualizado_em` DA CANDIDATURA (`retencao-candidatos.service.ts`: o
   * prazo corre do ÚLTIMO encerramento). Encerrar sem tocar o carimbo faria o prazo correr a partir
   * de uma data velha, e a pessoa seria anonimizada antes do prazo que o diretor definiu.
   */
  it("o encerramento move o carimbo que o prazo de retenção lê", async () => {
    const { service, escritas } = makeDb({ candidaturas: [pessoa("ALOCADO", "Bia", "OFICIAL")] });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    for (const e of naCandidatura(escritas)) {
      expect(e.valores.atualizadoEm).toBeInstanceOf(Date);
    }
  });

  it("o cancelamento NORMAL (ninguém segurando) não toca candidatura nenhuma", async () => {
    const { service, escritas } = makeDb({
      candidaturas: [pessoa("APROVADO", "Caio"), pessoa("ENVIADO_PARA_ADMISSAO", "Dora")],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(naCandidatura(escritas)).toHaveLength(0);
    expect(noHistorico(escritas)).toHaveLength(0);
  });

  /**
   * O APROVADO NÃO PODE SER DESCARTADO JUNTO. Ele é um processo BEM-SUCEDIDO, e transformá-lo em
   * DESCARTADO por causa do cancelamento apaga uma aprovação que aconteceu de verdade. Este teste
   * só consegue afirmar sobre a cláusula quando ela carrega IDS; quando ela filtra por SITUAÇÃO, a
   * afirmação fica com o `naoEncerrados` do teste da trava.
   */
  it("o encerramento não alcança o APROVADO nem o ENVIADO_PARA_ADMISSAO", async () => {
    const { service, escritas } = makeDb({
      candidaturas: [
        pessoa("ATIVO", "Ana"),
        pessoa("APROVADO", "Caio"),
        pessoa("ENVIADO_PARA_ADMISSAO", "Dora"),
      ],
    });

    await cancelarDe(service)("vaga-1", { ...CORPO, forcar: true }, MASTER);

    const textos = naCandidatura(escritas).flatMap((e) => textosDe(e.where));
    const citaIds = textos.some((t) => t.startsWith("cand-"));
    if (citaIds) {
      expect(textos).toContain("cand-Ana");
      expect(textos).not.toContain("cand-Caio");
      expect(textos).not.toContain("cand-Dora");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 7: O MOTIVO, CONTRA O CATÁLOGO
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("o motivo é do CATÁLOGO, e o catálogo é o que manda", () => {
  it("motivo que não está no catálogo é recusado, e nada é gravado", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    const erro = await recusa(service, MASTER, { motivo: "Porque sim" });
    // `HttpException` e não uma classe específica: 400 ou 409 são os dois desfechos defensáveis, e
    // a escolha é da construção. O que NÃO é defensável é o motivo inventado chegar ao banco.
    expect(erro, "motivo fora do catálogo tem de ser recusado").toBeInstanceOf(HttpException);
    expect(escritas).toHaveLength(0);
  });

  it("motivo INATIVO no catálogo é recusado: inativar tira de circulação", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    const erro = await recusa(service, MASTER, { motivo: "Motivo fora de circulação" });
    expect(erro, "motivo inativo tem de ser recusado").toBeInstanceOf(HttpException);
    expect(escritas).toHaveLength(0);
  });

  it("motivo ATIVO do catálogo passa e é gravado como está", async () => {
    const { service, escritas } = makeDb({ candidaturas: [] });

    await cancelarDe(service)("vaga-1", { ...CORPO, motivo: "Vaga duplicada" }, MASTER);
    expect(gravado(escritas).cancelamentomotivo).toBe("Vaga duplicada");
  });
});
