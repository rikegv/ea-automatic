import { ConflictException, HttpException } from "@nestjs/common";
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
describe("a origem: só a vaga EM PROCESSO cancela", () => {
  /**
   * A LISTA VEM DO CATÁLOGO (onda B2), e não mais de `VAGA_STATUS`. O que a trava pergunta deixou
   * de ser "o código é ABERTA?" e passou a ser "esta linha exerce o papel de ABERTURA?", que é a
   * mesma pergunta enquanto os dois concordam, e continua certa quando o diretor renomear a linha.
   *
   * O `VAGA_BANCO` ENTRA NO RECORTE, e é correto: ele não é o status de abertura, então cancelar
   * por ali é recusado. O status dormente nunca teve permissão de cancelar coisa alguma.
   */
  /**
   * ─ A ENTREGA SAIU DO RECORTE (Frente B da Central de Vagas) ─────────────────────────────────
   *
   * MUDANÇA DE REQUISITO: `ENTREGUE` deixou de encerrar e virou estado VIVO. A trava de origem
   * passou a perguntar "esta vaga está EM PROCESSO?" (papel ABERTURA ou ENTREGA), e sem isso a
   * vaga entregue ficaria SEM PORTA DE SAÍDA: o cliente desiste do processo entregue e ninguém
   * consegue cancelar a vaga.
   */
  const OUTROS = linhasDeStatusFingidas()
    .filter((s) => s.papel !== "ABERTURA" && s.papel !== "ENTREGA")
    .map((s) => s.codigo);

  /**
   * O `PENDENTE_REVISAO` ENTROU NO RECORTE quando a fila da vaga espelhada nasceu (migration 0115),
   * e é correto que ele esteja aqui: a vaga que o espelho trouxe sem cliente não exerce o papel de
   * ABERTURA, então cancelar por ali é recusado, como em qualquer outro status que não seja o de
   * abertura. Quem sai daquela fila sai pela liberação, que confere o cliente.
   */
  it("o recorte não é vazio (o catálogo tem os outros status, a fila de revisão e o dormente)", () => {
    expect(OUTROS).toEqual([
      "RASCUNHO",
      "FECHADA",
      "CANCELADA",
      "PENDENTE_REVISAO",
      "VAGA_BANCO",
    ]);
  });

  it("a vaga ENTREGUE CANCELA: o cliente desistiu do processo que já estava com ele", async () => {
    const { service, vaga, escritas } = makeDb({ status: "ENTREGUE", candidaturas: [] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    expect(vaga.status).toBe("CANCELADA");
    expect(naVaga(escritas)).toHaveLength(1);
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
// ITEM 2: O QUE ERA A TRAVA (Frente B: ela deixou de existir, e ninguém é descartado)
// ────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * ┌─ O QUE MUDOU, E ISTO É REQUISITO NOVO DO DIRETOR, NÃO CONSERTO DE TESTE ──────────────────────┐
 * │ ATÉ AQUI: candidato `ATIVO` ou `ALOCADO` BARRAVA o cancelamento; só um MASTER passava com     │
 * │ `forcar: true`, e forçar DESCARTAVA todo mundo que segurava.                                   │
 * │                                                                                                │
 * │ A PARTIR DA FRENTE B: cancelar com candidato dentro é PERMITIDO, para qualquer consultor, e   │
 * │ NINGUÉM É DESCARTADO. Quem está VIVO é movido para o STAND BY e CONTINUA VIVO, ligado à vaga  │
 * │ cancelada, para poder ser transferido ou realocado depois.                                     │
 * │                                                                                                │
 * │ OS TESTES DA TRAVA, DO FORÇAR E DO CARIMBO DE FORÇADO FORAM REMOVIDOS porque o comportamento  │
 * │ que eles afirmavam foi REVOGADO, e não porque ficaram vermelhos. No lugar deles entram os que │
 * │ afirmam a regra nova, e o mais importante é o primeiro: NINGUÉM É DESCARTADO.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `STAND_BY` NÃO ESTÁ NO CATÁLOGO FINGIDO PADRÃO, e a ausência é fiel: ele nasceu na migration 0111
 * e não está em `ETAPAS_FUNIL_SEMENTE`. Quem testa o destino monta o catálogo com ele, abaixo.
 */
const STAND_BY = {
  id: 99,
  codigo: "STAND_BY",
  rotulo: "Stand By",
  ordem: 6,
  tom: "wn" as const,
  inicial: false,
  ativa: true,
  entregaAoCliente: false,
  destinoDoCancelamento: true,
};

/** O catálogo de etapas COM o destino de cancelamento configurado, que é o estado de produção. */
function catalogoComStandBy() {
  const base = catalogoDeEtapasFingido();
  return {
    ...base,
    etapaDoCancelamento: async () => STAND_BY,
    ordemPorCodigo: async () => {
      const mapa = new Map(await base.ordemPorCodigo());
      mapa.set(STAND_BY.codigo, STAND_BY.ordem);
      return mapa;
    },
  };
}

/** O mesmo `makeDb`, com o catálogo de etapas trocado pelo que tem destino de cancelamento. */
function comStandBy(cenario: Parameters<typeof makeDb>[0]) {
  const feito = makeDb(cenario);
  const db = (feito.service as unknown as { db: unknown }).db;
  return {
    ...feito,
    service: new VagasService(
      db as never,
      catalogoComStandBy() as never,
      catalogoDeStatusFingido() as never,
    ),
  };
}

describe("cancelar com candidato dentro: passa, e NINGUÉM é descartado", () => {
  it.each([...SITUACOES_QUE_SEGURAM_CANCELAMENTO])(
    "a vaga com UM %s cancela pela porta normal, sem Master e sem forçar",
    async (situacao) => {
      const { service, vaga, escritas } = comStandBy({
        candidaturas: [pessoa(situacao, "Ana", "OFICIAL")],
      });

      await cancelarDe(service)("vaga-1", CORPO, COMUM);

      expect(vaga.status).toBe("CANCELADA");
      expect(naVaga(escritas)).toHaveLength(1);
    },
  );

  /**
   * ─ A AFIRMAÇÃO CENTRAL DO PONTO 3: NENHUMA SITUAÇÃO DE SAÍDA É GRAVADA ────────────────────────
   *
   * É o teste que pega a volta silenciosa do comportamento antigo: qualquer caminho que volte a
   * chamar `gravarSaidaDaCandidatura` escreve `DESCARTADO`/`DESISTIU` na candidatura, e a pessoa
   * some da fila viva. A asserção é sobre o VALOR gravado, e não sobre o nome da função, porque é o
   * valor que apaga gente.
   */
  it("NINGUÉM vira DESCARTADO nem DESISTIU: nenhuma situação de saída é escrita", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [
        pessoa("ATIVO", "Ana"),
        pessoa("ALOCADO", "Bia", "OFICIAL"),
        pessoa("APROVADO", "Caio"),
      ],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    for (const e of naCandidatura(escritas)) {
      expect(e.valores.situacao, "cancelar não escreve desfecho em candidatura nenhuma").toBeUndefined();
    }
    for (const e of noHistorico(escritas)) {
      expect(e.valores.situacao, "o evento é MOVIMENTO, não desfecho").toBeNull();
    }
  });

  it("quem está VIVO é movido para o STAND BY, e a situação NÃO muda", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [pessoa("ATIVO", "Ana"), pessoa("ALOCADO", "Bia", "OFICIAL")],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    const movimentos = naCandidatura(escritas);
    expect(movimentos).toHaveLength(2);
    for (const m of movimentos) {
      expect(m.valores.etapa).toBe("STAND_BY");
      expect(m.naTransacao, "mover e cancelar são um fato só").toBe(true);
    }
  });

  /**
   * QUEM JÁ TINHA SAÍDO NÃO É ARRASTADO: descartado e desistente saíram por decisão de alguém, e
   * reescrever a etapa deles apagaria o lugar em que a decisão foi tomada ("descartado na Triagem").
   */
  it("quem já estava encerrado NÃO é movido", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [pessoa("DESCARTADO", "Dora"), pessoa("DESISTIU", "Edu")],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(naCandidatura(escritas)).toHaveLength(0);
  });

  it("o movimento aparece na LINHA DO TEMPO, com a etapa de origem preservada", async () => {
    const { service, escritas } = comStandBy({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    const eventos = noHistorico(escritas);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].valores).toMatchObject({ etapaDe: "APROVACAO", etapaPara: "STAND_BY" });
  });

  /**
   * SEM DESTINO CONFIGURADO, O CANCELAMENTO NÃO É BLOQUEADO: as pessoas ficam vivas onde estão.
   * Lançar aqui devolveria a trava por outra porta, agora dependendo de configuração de catálogo.
   */
  it("sem etapa de destino no catálogo, cancela do mesmo jeito e não move ninguém", async () => {
    const { service, vaga, escritas } = makeDb({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    expect(vaga.status).toBe("CANCELADA");
    expect(naCandidatura(escritas)).toHaveLength(0);
  });

  /**
   * §A.6, E É A GARANTIA QUE SUBSTITUI O DESCARTE DO FORÇADO: o prazo de retenção NÃO depende de a
   * candidatura estar encerrada. A cláusula do expurgo lê a VAGA (`s.encerra` + `v.encerrada_em`),
   * e o cancelamento carimba `encerrada_em` com relógio de SERVIDOR na mesma gravação do status.
   * Era essa a razão pela qual o forçado descartava todo mundo, e ela já não vale.
   */
  it("a vaga cancelada carimba `encerrada_em`, que é o relógio do expurgo", async () => {
    const { service, escritas } = comStandBy({ candidaturas: [pessoa("ATIVO", "Ana")] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(gravado(escritas).encerradaem).toBeInstanceOf(Date);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 4: O CARIMBO DA ETAPA (Frente B, ponto 4)
// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("o carimbo da etapa: até onde este processo chegou antes de morrer", () => {
  /**
   * A DEFINIÇÃO É A ETAPA MAIS AVANÇADA ENTRE OS VIVOS, e a ordem da medição é o que este bloco
   * protege: medir DEPOIS de mover todo mundo responderia "STAND_BY" em todo cancelamento, porque
   * ele é a última etapa da fila. É o defeito mais fácil de introduzir aqui, e o mais inútil.
   */
  it("carimba a etapa MAIS AVANÇADA entre os vivos, e não o Stand By para onde eles vão", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [
        { ...pessoa("ATIVO", "Ana"), etapa: "CAPTACAO" },
        { ...pessoa("ATIVO", "Bia"), etapa: "ENTREVISTA_CLIENTE" },
        { ...pessoa("ATIVO", "Caio"), etapa: "TRIAGEM" },
      ],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(gravado(escritas).cancelamentoetapa).toBe("ENTREVISTA_CLIENTE");
  });

  it("ignora quem já tinha saído: a etapa é dos VIVOS", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [
        { ...pessoa("ATIVO", "Ana"), etapa: "CAPTACAO" },
        { ...pessoa("DESCARTADO", "Dora"), etapa: "ENTREVISTA_CLIENTE" },
      ],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(gravado(escritas).cancelamentoetapa).toBe("CAPTACAO");
  });

  /**
   * NULO QUER DIZER UMA COISA SÓ: a vaga foi cancelada vazia. Devolver a etapa inicial aqui
   * afirmaria um fato que não aconteceu, e o relatório contaria processos que nunca existiram.
   */
  it("vaga sem ninguém vivo carimba NULO, e não a etapa inicial", async () => {
    const { service, escritas } = comStandBy({ candidaturas: [pessoa("DESCARTADO", "Dora")] });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);
    expect(gravado(escritas).cancelamentoetapa).toBeNull();
  });

  /**
   * A ETAPA VIAJA TAMBÉM NA NARRATIVA DA TRILHA, e a redundância é requisito: a REABERTURA limpa
   * `cancelamento_etapa` da linha da vaga, e sem a cópia no evento a resposta se perderia para
   * sempre. É a mesma razão pela qual o motivo já viajava nos dois lugares.
   */
  it("a etapa aparece na observação do evento de status, que a reabertura não apaga", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [{ ...pessoa("ATIVO", "Ana"), etapa: "ENTREVISTA_CLIENTE" }],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    const observacoes = escritas
      .map((e) => e.valores.observacao)
      .filter((o): o is string => typeof o === "string");
    expect(observacoes.some((o) => o.includes("ENTREVISTA_CLIENTE"))).toBe(true);
  });

  /**
   * §A.6 NA NARRATIVA: ela carrega vocabulário de processo e uma CONTAGEM, e nada que identifique
   * pessoa. O que identifica alguém vive na linha do tempo dela, nunca na da vaga.
   */
  it("a narrativa conta QUANTOS seguem vivos, e não diz quem", async () => {
    const { service, escritas } = comStandBy({
      candidaturas: [pessoa("ATIVO", "Ana"), pessoa("ALOCADO", "Bia", "OFICIAL")],
    });

    await cancelarDe(service)("vaga-1", CORPO, COMUM);

    const observacoes = escritas
      .map((e) => e.valores.observacao)
      .filter((o): o is string => typeof o === "string")
      .join(" ");
    expect(observacoes).toContain("2");
    expect(observacoes).not.toContain("Ana");
    expect(observacoes).not.toContain("12345678901");
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
