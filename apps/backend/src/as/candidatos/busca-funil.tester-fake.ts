import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { asCandidatos, asCandidaturas, vagas } from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * O BANCO FINGIDO DA BUSCA COM FUNIL, e ele NAO e um dable passivo de propositio.
 *
 * Um dable que devolve as linhas que o cenario mandar nao consegue dizer nada sobre a armadilha
 * do ponto E-6 do mapa: se o funil for resolvido por JOIN na consulta paginada, `total` passa a
 * contar candidaturas e o `limite` passa a cortar candidaturas, e um dable passivo devolveria as
 * mesmas pessoas de qualquer jeito. Entao este fingido se comporta como o Postgres se comportaria:
 *
 * 1. le a consulta montada de verdade (tabela de origem, joins, clausula renderizada, teto,
 *    deslocamento);
 * 2. se a consulta paginada tiver JOIN com candidatura, ele EXPANDE as linhas (uma por candidatura,
 *    como o produto faria), conta `count(*) over ()` sobre as linhas expandidas e aplica o `limit`
 *    sobre elas. Join interno descarta quem nao tem candidatura; join externo deixa a pessoa com
 *    uma linha de nulos;
 * 3. a segunda consulta, a que le `as_candidaturas` por `candidato_id in (...)`, so devolve as
 *    candidaturas cujo id de candidato aparece na clausula renderizada: quem pedir ids fora da
 *    pagina ou esquecer de filtrar fica visivel no teste.
 *
 * HEURISTICA DECLARADA, e ela existe para o teste 5 nao ser vazio: se a clausula da segunda
 * consulta mencionar literais de status de vaga, o fingido filtra as candidaturas por esses
 * status, como o banco faria. E assim que um filtro por status (que apagaria a vaga em
 * `PENDENTE_REVISAO` da coluna de vaga) morre no teste em vez de morrer na operacao.
 */

const dialeto = new PgDialect();

/** A clausula como o Postgres a receberia, com os parametros de volta no texto. */
export function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

export interface PessoaFingida {
  id: string;
  nome: string;
  origem?: string;
  cidade?: string | null;
  uf?: string | null;
  temCpf?: boolean;
  bancoTalentos?: boolean;
  criadoEm?: Date;
}

export interface CandidaturaFingida {
  id: string;
  candidatoId: string;
  vagaId: string;
  vagaCodigo?: string | null;
  vagaNome?: string | null;
  etapa?: string;
  situacao?: string;
  ultimoContatoEm?: Date | null;
  /** O status da vaga, que o fingido usa para simular um filtro por status, se houver. */
  vagaStatus?: string;
  /**
   * QUANDO A PESSOA FOI ALOCADA NESTA VAGA. O fingido ORDENA por ele quando a consulta pede, e e
   * por isso que ele esta aqui: sem honrar o `orderBy`, um teste de ordem passaria com a ordem de
   * insercao e um `orderBy` removido numa refatoracao sobreviveria em silencio.
   */
  alocadoEm?: Date;
}

/** Os literais de status de vaga que o fingido reconhece numa clausula. */
const STATUS_DE_VAGA = [
  "ABERTA",
  "EM_ANDAMENTO",
  "PAUSADA",
  "CANCELADA",
  "FECHADA",
  "ENCERRADA",
  "CONCLUIDA",
  "PENDENTE_REVISAO",
  "RASCUNHO",
];

interface ConsultaRegistrada {
  tabela: string;
  joins: Array<{ tipo: "inner" | "left"; tabela: string }>;
  where: string;
  limite: number | null;
  offset: number | null;
  selecao: string[];
  /** As expressoes de `orderBy`, renderizadas, para o fingido ordenar como o banco ordenaria. */
  ordem: string[];
}

function nomeDaTabela(t: unknown): string {
  if (t === asCandidatos) return "as_candidatos";
  if (t === asCandidaturas) return "as_candidaturas";
  if (t === vagas) return "vagas";
  return "outra";
}

function candidaturaCrua(c: CandidaturaFingida) {
  return {
    id: c.id,
    candidatoId: c.candidatoId,
    vagaId: c.vagaId,
    etapa: c.etapa ?? "CAPTACAO",
    situacao: c.situacao ?? "ATIVO",
    motivoDescarte: null,
    alocadoEm: c.alocadoEm ?? new Date("2026-09-20T10:00:00.000Z"),
    atualizadoEm: new Date("2026-09-21T10:00:00.000Z"),
    ultimoContatoEm: c.ultimoContatoEm ?? null,
    alocadoPorId: null,
    posicaoLado: null,
    pretensaoSalarial: null,
  };
}

/**
 * A linha de candidatura como o driver a entrega, nos DOIS formatos que o produtor pode ter pedido:
 * campos achatados com apelido (`vagaCodigo`) e o objeto da tabela embrulhado (`c`), que e o
 * formato que `candidaturasPor` usa hoje. Servir os dois e deliberado: o teste e sobre a FORMA da
 * RESPOSTA do service, nao sobre qual formato de consulta o produtor escolheu.
 */
function linhaDeCandidatura(c: CandidaturaFingida) {
  const crua = candidaturaCrua(c);
  return {
    ...crua,
    c: crua,
    candidatura: crua,
    vagaCodigo: c.vagaCodigo ?? null,
    vagaNome: c.vagaNome ?? null,
    vaga: { id: c.vagaId, codigo: c.vagaCodigo ?? null, nomeDivulgacao: c.vagaNome ?? null },
    candidatoNome: "NAO DEVE SER USADO",
    autor: null,
  };
}

function linhaDePessoa(p: PessoaFingida) {
  return {
    id: p.id,
    nome: p.nome,
    origem: p.origem ?? "PANDAPE",
    bancoTalentos: p.bancoTalentos ?? false,
    cidade: p.cidade ?? "Sao Paulo",
    uf: p.uf ?? "SP",
    temCpf: p.temCpf ?? true,
    criadoEm: p.criadoEm ?? new Date("2026-10-01T12:00:00.000Z"),
    candidaturasAtivas: 0,
  };
}

export function bancoDaBuscaComFunil(cenario: {
  pessoas: PessoaFingida[];
  candidaturas?: CandidaturaFingida[];
}) {
  const pessoas = cenario.pessoas;
  const candidaturas = cenario.candidaturas ?? [];
  const consultas: ConsultaRegistrada[] = [];

  function resolver(q: ConsultaRegistrada): unknown[] {
    const corte = (linhas: unknown[]) => {
      const total = linhas.length;
      const de = q.offset ?? 0;
      const ate = q.limite === null ? linhas.length : de + q.limite;
      return linhas
        .slice(de, ate)
        .map((l) => ({ ...(l as Record<string, unknown>), total }) as unknown);
    };

    if (q.tabela === "as_candidatos") {
      const juncao = q.joins.find((j) => j.tabela === "as_candidaturas");
      if (!juncao) return corte(pessoas.map(linhaDePessoa));

      // O JOIN, simulado como o banco o faria: uma linha por candidatura.
      const expandidas: unknown[] = [];
      for (const p of pessoas) {
        const dela = candidaturas.filter((c) => c.candidatoId === p.id);
        if (dela.length === 0) {
          if (juncao.tipo === "inner") continue; // join interno APAGA quem nao tem vaga
          expandidas.push({
            ...linhaDePessoa(p),
            ...linhaDeCandidatura({ id: "", candidatoId: p.id, vagaId: "" }),
            id: p.id,
          });
          continue;
        }
        for (const c of dela) {
          expandidas.push({ ...linhaDePessoa(p), ...linhaDeCandidatura(c), id: p.id });
        }
      }
      return corte(expandidas);
    }

    if (q.tabela === "as_candidaturas") {
      const ids = pessoas.map((p) => p.id).filter((id) => q.where.includes(id));
      const porId = ids.length > 0 ? candidaturas.filter((c) => ids.includes(c.candidatoId)) : [];
      const statusCitados = STATUS_DE_VAGA.filter((s) => q.where.includes(s));
      const filtradas =
        statusCitados.length > 0
          ? porId.filter((c) => statusCitados.includes(c.vagaStatus ?? "PENDENTE_REVISAO"))
          : porId;
      /*
       * A ORDEM COMO O BANCO A DARIA. Sem `orderBy` na consulta, o fingido devolve a ordem de
       * INSERCAO do cenario, que e o analogo da ordem fisica das linhas: e isso que faz o teste de
       * ordem morrer quando o `orderBy` sai do codigo, em vez de passar por coincidencia.
       */
      const porAlocadoEm = q.ordem.join(" ");
      if (porAlocadoEm.includes("alocado_em")) {
        const desc = porAlocadoEm.includes("desc");
        return [...filtradas]
          .sort((a, b) => {
            const ta = (a.alocadoEm ?? new Date(0)).getTime();
            const tb = (b.alocadoEm ?? new Date(0)).getTime();
            return desc ? tb - ta : ta - tb;
          })
          .map(linhaDeCandidatura);
      }
      return filtradas.map(linhaDeCandidatura);
    }

    return [];
  }

  function construtor(q: ConsultaRegistrada) {
    const chain: Record<string, unknown> = {};
    const mesmo = () => chain;
    chain.from = (t: unknown) => {
      q.tabela = nomeDaTabela(t);
      return chain;
    };
    chain.innerJoin = (t: unknown) => {
      q.joins.push({ tipo: "inner", tabela: nomeDaTabela(t) });
      return chain;
    };
    chain.leftJoin = (t: unknown) => {
      q.joins.push({ tipo: "left", tabela: nomeDaTabela(t) });
      return chain;
    };
    chain.where = (w: unknown) => {
      q.where = textoDe(w);
      return chain;
    };
    chain.orderBy = (...cols: unknown[]) => {
      q.ordem = cols.map(textoDe);
      return chain;
    };
    chain.groupBy = mesmo;
    chain.limit = (n: number) => {
      q.limite = n;
      return chain;
    };
    chain.offset = (n: number) => {
      q.offset = n;
      return chain;
    };
    // THENABLE: o `await` resolve a consulta onde quer que a cadeia termine.
    chain.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resolver(q)).then(ok, falha);
    return chain;
  }

  const db = {
    select: vi.fn((selecao?: Record<string, unknown>) => {
      const q: ConsultaRegistrada = {
        tabela: "",
        joins: [],
        where: "",
        limite: null,
        offset: null,
        selecao: Object.keys(selecao ?? {}),
        ordem: [],
      };
      consultas.push(q);
      return construtor(q);
    }),
    /** A API relacional, para o produtor que preferir `db.query.asCandidaturas.findMany`. */
    query: {
      asCandidaturas: {
        findMany: vi.fn(async (args?: { where?: unknown }) => {
          const q: ConsultaRegistrada = {
            tabela: "as_candidaturas",
            joins: [],
            where: textoDe(args?.where),
            limite: null,
            offset: null,
            selecao: [],
            ordem: [],
          };
          consultas.push(q);
          return resolver(q);
        }),
      },
    },
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );

  return {
    service,
    consultas,
    /** A consulta paginada: a que levou o `limit`. */
    get paginada() {
      return consultas.find((q) => q.limite !== null);
    },
    /** A segunda consulta, a do funil. */
    get doFunil() {
      return consultas.find((q) => q.tabela === "as_candidaturas");
    },
  };
}
