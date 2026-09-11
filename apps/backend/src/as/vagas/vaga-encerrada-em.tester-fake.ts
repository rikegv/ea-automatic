import { vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { asCandidaturas, vagaBeneficio, vagaMetaReducoes, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA O CARIMBO DE ENCERRAMENTO DA VAGA (`vagas.encerrada_em`) ─────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` é o mesmo da onda B2, e existe pela
 * razão registrada lá: na B1 o agente que construiu escolheu, de boa-fé, o nome de arquivo que o
 * `tester` tinha escolhido, e sobrescreveu um spec em silêncio. Nome que ninguém mais escolheria é
 * a trava mais barata contra isso.
 *
 * O BANCO FINGIDO É O DO `vagas.cancelar.spec.ts`, COPIADO E NÃO IMPORTADO: aquele arquivo é um
 * spec, e importá-lo registraria os testes dele uma segunda vez, com os mesmos nomes, o que
 * transformaria um vermelho de lá num vermelho daqui e vice-versa.
 *
 * ELE TEM MEMÓRIA NA LINHA DA VAGA de propósito (a segunda chamada enxerga o que a primeira
 * gravou), e ele ANOTA O PAYLOAD DE CADA GRAVAÇÃO, que é a única forma de afirmar sobre o que foi
 * carimbado sem depender de banco de verdade. §A.6: os dados de pessoa que passam por aqui são
 * fictícios e existem só para as travas terem o que recusar.
 */

const T0 = new Date("2026-09-10T12:00:00.000Z");

export const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
export const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };

export const MOTIVO_DE_CANCELAMENTO = "Cliente cancelou a solicitação";
const CATALOGO = [
  { id: "mot-1", nome: MOTIVO_DE_CANCELAMENTO, ativo: true },
  { id: "mot-2", nome: "Vaga duplicada", ativo: true },
];

/** Uma candidatura da vaga, na forma que a leitura sob o lock devolve. */
export function pessoa(
  situacao: string,
  nome = "Fulano",
  posicaoLado: string | null = null,
) {
  return {
    candidaturaId: `cand-${nome}-${situacao}`,
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

export interface Escrita {
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
export function bancoFingido(cenario: {
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
     * `values` DEVOLVE UM OBJETO QUE SE PODE AGUARDAR **E** QUE TEM `returning`, que é o que o
     * Drizzle de verdade faz. Antes ele era um `async` puro, e bastava, porque nenhum caminho do
     * `cancelar` precisava do id do que acabou de ser inserido.
     *
     * PASSOU A PRECISAR: o cancelamento agora insere o EVENTO da trilha da vaga e carimba o ID DELE
     * em cada saída de candidatura, que é o marcador que a reabertura lê para saber quem saiu
     * NAQUELE cancelamento. O fake tinha de aprender o mesmo gesto, senão ele reprovaria a produção
     * por uma limitação dele, que é o pior tipo de vermelho: o que não fala sobre o código.
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

/** As gravações na linha da VAGA, que é onde o carimbo de encerramento mora. */
export const naVaga = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === vagas);

/**
 * O PAYLOAD DA GRAVAÇÃO, com as chaves NORMALIZADAS (sem `_`, minúsculas), para o teste afirmar
 * sobre a COLUNA que o requisito nomeia (`encerrada_em`) sem depender de a construção ter escrito
 * `encerradaEm` ou o nome cru. Nome DIFERENTE continua sendo achado, e é o que se quer.
 */
export function gravadoNaVaga(escritas: Escrita[]): Record<string, unknown> {
  const alvo = naVaga(escritas)[0]?.valores ?? {};
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(alvo)) saida[k.replace(/_/g, "").toLowerCase()] = v;
  return saida;
}
