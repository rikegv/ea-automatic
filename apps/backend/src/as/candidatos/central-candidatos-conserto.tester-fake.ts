import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import {
  asCandidatos,
  asCandidaturas,
  cargos,
  clientes,
  vagas,
} from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ BANCO FINGIDO DA CENTRAL DE CANDIDATOS (conserto de 06/10/2026) ─────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38): escrita pelo `tester` SEM ler o codigo novo do service. Ela
 * exercita o REQUISITO do mapa (`docs/MAPA-CENTRAL-CANDIDATOS-CONSERTO.md`), nao a implementacao.
 *
 * Como o `busca-funil.tester-fake`, este fingido NAO e um dable passivo: ele le a consulta MONTADA
 * de verdade (tabela de origem, joins, clausula renderizada, group by, distinct, teto, deslocamento)
 * e responde como o Postgres responderia. E isso que permite ao ORACULO do KPI ser honesto: o KPI
 * so pode somar o conjunto FILTRADO INTEIRO se a agregacao rodar sobre esse conjunto, e um dable
 * passivo devolveria o mesmo numero de qualquer jeito.
 *
 * O PONTO QUE ESTE FINGIDO EXISTE PARA PEGAR (§A.27): se o KPI for derivado da PAGINA (as 200 linhas
 * carregadas) em vez da base filtrada, a soma do `porEtapa`/`porSituacao` encolhe para o tamanho da
 * pagina e para de bater com o `total`. Aqui a pagina corta em 200 enquanto a agregacao conta as 500.
 */

const dialeto = new PgDialect();

/** A clausula como o Postgres a receberia, com os parametros de volta no texto. */
export function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

const ACENTOS = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";
function semAcentoLower(s: string): string {
  return [...s.toLowerCase()]
    .map((ch) => {
      const i = ACENTOS.indexOf(ch);
      return i >= 0 ? SEM_ACENTO[i] : ch;
    })
    .join("");
}

export interface CandidatoFingido {
  id: string;
  nome: string;
  origem?: string;
  cpf?: string | null;
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
  etapa?: string;
  situacao?: string;
  ultimoContatoEm?: Date | null;
}

export interface VagaFingida {
  id: string;
  codigo?: string | null;
  nomeDivulgacao?: string | null;
  status?: string;
  codCliente?: string | null;
  cargoId?: string | null;
}

export interface ClienteFingido {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao?: string | null;
}

export interface CargoFingido {
  id: string;
  nome: string;
}

const ORIGENS = ["PANDAPE", "DIGAI", "MANUAL", "INDICACAO", "IMPORTACAO"];
const SITUACOES_VIVAS = ["ATIVO", "APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"];
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
  distinct: boolean;
  grupo: string[];
  ordem: string[];
  limite: number | null;
  offset: number | null;
  /** Alias -> SQL renderizado do valor selecionado, para mapear a projecao de volta. */
  selecao: Record<string, string>;
}

function nomeDaTabela(t: unknown): string {
  if (t === asCandidatos) return "as_candidatos";
  if (t === asCandidaturas) return "as_candidaturas";
  if (t === vagas) return "vagas";
  if (t === clientes) return "clientes";
  if (t === cargos) return "cargos";
  return "outra";
}

export function bancoDaCentral(cenario: {
  candidatos: CandidatoFingido[];
  candidaturas?: CandidaturaFingida[];
  vagas?: VagaFingida[];
  clientes?: ClienteFingido[];
  cargos?: CargoFingido[];
}) {
  const candidatos = cenario.candidatos;
  const candidaturas = cenario.candidaturas ?? [];
  const vagasDb = cenario.vagas ?? [];
  const clientesDb = cenario.clientes ?? [];
  const cargosDb = cenario.cargos ?? [];
  const consultas: ConsultaRegistrada[] = [];

  const vagaPorId = new Map(vagasDb.map((v) => [v.id, v]));
  const clientePorCod = new Map(clientesDb.map((c) => [c.codCliente, c]));
  const cargoPorId = new Map(cargosDb.map((c) => [c.id, c]));
  const candidatoPorId = new Map(candidatos.map((c) => [c.id, c]));

  /**
   * Um predicado sobre o candidato, lido da clausula renderizada (origem, nome, cpf).
   *
   * O `textoDe` devolve os PARAMETROS BARE (sem aspas), igual ao `busca-funil.tester-fake`, que casa
   * status com `includes(bare)`. Casar `'PANDAPE'` (com aspas) nunca acharia nada: a armadilha que
   * fez o filtro parecer ignorado na primeira rodada.
   */
  function candidatoPassaNoWhere(cand: CandidatoFingido, w: string): boolean {
    if (w.includes("origem")) {
      const citadas = ORIGENS.filter((o) => w.includes(o));
      if (citadas.length > 0 && !citadas.includes(cand.origem ?? "PANDAPE")) return false;
    }
    // nome: `... like %trecho%`. O service aplica translate/lower; comparo sem acento e sem caixa.
    const m = w.match(/like\s+'?%([^%']*)%'?/i);
    if (m && m[1]) {
      if (!semAcentoLower(cand.nome).includes(m[1])) return false;
    }
    const cpfMatch = w.match(/cpf"?\s*=\s*'?(\d{11})'?/i);
    if (cpfMatch) {
      if ((cand.cpf ?? "") !== cpfMatch[1]) return false;
    }
    return true;
  }

  function temVivaNaBase(candidatoId: string): boolean {
    return candidaturas.some(
      (c) => c.candidatoId === candidatoId && SITUACOES_VIVAS.includes(c.situacao ?? "ATIVO"),
    );
  }

  function linhaDePessoa(p: CandidatoFingido) {
    return {
      id: p.id,
      nome: p.nome,
      origem: p.origem ?? "PANDAPE",
      bancoTalentos: p.bancoTalentos ?? false,
      cidade: p.cidade ?? "Sao Paulo",
      uf: p.uf ?? "SP",
      temCpf: p.temCpf ?? p.cpf != null,
      criadoEm: p.criadoEm ?? new Date("2026-10-01T12:00:00.000Z"),
      candidaturasAtivas: candidaturas.filter(
        (c) => c.candidatoId === p.id && SITUACOES_VIVAS.includes(c.situacao ?? "ATIVO"),
      ).length,
    };
  }

  function clienteNomeDaVaga(v: VagaFingida | undefined): string | null {
    if (!v || !v.codCliente) return null;
    const cli = clientePorCod.get(v.codCliente);
    if (!cli) return null;
    return cli.nomeOperacao ?? cli.razaoSocial ?? null;
  }
  function cargoNomeDaVaga(v: VagaFingida | undefined): string | null {
    if (!v || !v.cargoId) return null;
    return cargoPorId.get(v.cargoId)?.nome ?? null;
  }

  /** A linha do funil, em formatos redundantes para o service ler de onde preferir. */
  function linhaDeFunil(c: CandidaturaFingida) {
    const v = vagaPorId.get(c.vagaId);
    const crua = {
      id: c.id,
      candidatoId: c.candidatoId,
      vagaId: c.vagaId,
      vagaCodigo: v?.codigo ?? null,
      vagaNome: v?.nomeDivulgacao ?? null,
      clienteNome: clienteNomeDaVaga(v),
      cargoNome: cargoNomeDaVaga(v),
      etapa: c.etapa ?? "CAPTACAO",
      situacao: c.situacao ?? "ATIVO",
      ultimoContatoEm: c.ultimoContatoEm ?? null,
    };
    return {
      ...crua,
      c: crua,
      candidatura: crua,
      vaga: {
        id: c.vagaId,
        codigo: v?.codigo ?? null,
        nomeDivulgacao: v?.nomeDivulgacao ?? null,
        codCliente: v?.codCliente ?? null,
        cargoId: v?.cargoId ?? null,
      },
      cliente: v?.codCliente ? clientePorCod.get(v.codCliente) ?? null : null,
      cargo: v?.cargoId ? cargoPorId.get(v.cargoId) ?? null : null,
    };
  }

  /**
   * Resolve o valor de um alias a partir do SQL renderizado dele, sobre uma candidatura.
   *
   * ASPAS FORA ANTES DE COMPARAR: o driver renderiza `"as_candidaturas"."etapa"`, e `.etapa` (com
   * ponto) nunca casaria `."etapa"` (com a aspa no meio). Sem isto, a chave do grupo vinha nula e
   * TODO etapa/situacao caia num unico balde, com a soma certa e a quebra por chave errada.
   */
  function valorDoAlias(valSql: string, c: CandidaturaFingida): unknown {
    const s = valSql.toLowerCase().replace(/"/g, "");
    const v = vagaPorId.get(c.vagaId);
    const cli = v?.codCliente ? clientePorCod.get(v.codCliente) : undefined;
    if (s.includes("count(")) return null; // tratado como contagem no agrupamento
    // CLIENTE: o nome depende da EXPRESSAO selecionada, para `coalesce(operacao, razao)` x
    // `razao_social` sozinho MORREREM aqui (mutacao 4). A ordem importa: coalesce antes de razao.
    if (s.includes("nome_operacao") && s.includes("razao_social"))
      return cli ? cli.nomeOperacao ?? cli.razaoSocial ?? null : null;
    if (s.includes("nome_operacao")) return cli ? cli.nomeOperacao ?? null : null;
    if (s.includes("razao_social")) return cli ? cli.razaoSocial ?? null : null;
    if (s.includes("cargos.nome")) return cargoNomeDaVaga(v);
    if (s.includes("cargos.id")) return v?.cargoId ?? null;
    if (s.includes("cod_cliente")) return v?.codCliente ?? null;
    if (s.includes("nome_divulgacao")) return v?.nomeDivulgacao ?? null;
    if (s.includes("vagas.codigo")) return v?.codigo ?? null;
    if (s.includes("vagas.id")) return v?.id ?? c.vagaId;
    if (s.includes("as_candidaturas.etapa") || /\betapa\b/.test(s)) return c.etapa ?? "CAPTACAO";
    if (s.includes("as_candidaturas.situacao") || /\bsituacao\b/.test(s)) return c.situacao ?? "ATIVO";
    if (s.includes("vaga_id")) return c.vagaId;
    return null;
  }

  function temContagem(q: ConsultaRegistrada): boolean {
    return Object.values(q.selecao).some((v) => v.toLowerCase().includes("count("));
  }

  function candidaturasFiltradas(w: string): CandidaturaFingida[] {
    const statusCitados = STATUS_DE_VAGA.filter((st) => w.includes(st));
    // ids de candidato citados na clausula, SO quando ha de fato um `candidato_id in (...)` (o
    // funil). O KPI junta candidatos por ON e nao lista ids no WHERE: sem este gate, um id curto de
    // teste casaria por acaso dentro do texto do filtro de nome e o KPI contaria errado.
    const temInDeIds = /candidato_id"?\s+in\s+\(/i.test(w);
    const idsCitados = temInDeIds
      ? candidatos.map((c) => c.id).filter((id) => w.includes(id))
      : [];
    return candidaturas.filter((c) => {
      const cand = candidatoPorId.get(c.candidatoId);
      if (!cand) return false;
      if (idsCitados.length > 0 && !idsCitados.includes(c.candidatoId)) return false;
      if (!candidatoPassaNoWhere(cand, w)) return false;
      if (statusCitados.length > 0) {
        const v = vagaPorId.get(c.vagaId);
        if (!statusCitados.includes(v?.status ?? "PENDENTE_REVISAO")) return false;
      }
      if (w.includes("cod_cliente") && w.includes("is not null")) {
        if (!vagaPorId.get(c.vagaId)?.codCliente) return false;
      }
      if (w.includes("cargo_id") && w.includes("is not null")) {
        if (!vagaPorId.get(c.vagaId)?.cargoId) return false;
      }
      return true;
    });
  }

  function resolver(q: ConsultaRegistrada): unknown[] {
    if (q.tabela === "as_candidatos") {
      let pessoas = candidatos.filter((p) => candidatoPassaNoWhere(p, q.where));
      // semCandidatura: not exists candidatura viva
      if (q.where.includes("not exists")) {
        pessoas = pessoas.filter((p) => !temVivaNaBase(p.id));
      }
      const total = pessoas.length;
      const de = q.offset ?? 0;
      const ate = q.limite === null ? pessoas.length : de + q.limite;
      return pessoas
        .slice(de, ate)
        .map((p) => ({ ...linhaDePessoa(p), total }) as unknown);
    }

    if (q.tabela === "as_candidaturas") {
      const filtradas = candidaturasFiltradas(q.where);

      // Agregacao (KPI): group by + count -> uma linha por grupo.
      if (q.grupo.length > 0 && temContagem(q)) {
        const aliases = Object.entries(q.selecao);
        const grupos = new Map<string, { chave: Record<string, unknown>; n: number }>();
        for (const c of filtradas) {
          const chave: Record<string, unknown> = {};
          for (const [alias, val] of aliases) {
            if (!val.toLowerCase().includes("count(")) chave[alias] = valorDoAlias(val, c);
          }
          const k = JSON.stringify(chave);
          const g = grupos.get(k) ?? { chave, n: 0 };
          g.n += 1;
          grupos.set(k, g);
        }
        return [...grupos.values()].map((g) => {
          const row: Record<string, unknown> = { ...g.chave };
          for (const [alias, val] of aliases) {
            if (val.toLowerCase().includes("count(")) row[alias] = g.n;
          }
          return row;
        });
      }

      // DISTINCT (opcoes): projeta via alias e deduplica. INNER JOIN a clientes/cargos DESCARTA a
      // candidatura cuja vaga nao tem aquela relacao (e assim o `opcoes` real deixa de fora a vaga
      // em revisao sem cliente, em vez de oferecer um filtro "cliente nulo").
      if (q.distinct) {
        const exigeCliente = q.joins.some((j) => j.tipo === "inner" && j.tabela === "clientes");
        const exigeCargo = q.joins.some((j) => j.tipo === "inner" && j.tabela === "cargos");
        const base = filtradas.filter((c) => {
          const v = vagaPorId.get(c.vagaId);
          if (exigeCliente && (!v?.codCliente || !clientePorCod.has(v.codCliente))) return false;
          if (exigeCargo && (!v?.cargoId || !cargoPorId.has(v.cargoId))) return false;
          return true;
        });
        const aliases = Object.entries(q.selecao);
        const vistos = new Set<string>();
        const saida: unknown[] = [];
        for (const c of base) {
          const row: Record<string, unknown> = {};
          for (const [alias, val] of aliases) row[alias] = valorDoAlias(val, c);
          const k = JSON.stringify(row);
          if (vistos.has(k)) continue;
          vistos.add(k);
          saida.push(row);
        }
        return saida;
      }

      // Funil: projecao por linha, nos formatos redundantes. INNER JOIN a clientes/cargos DESCARTA
      // a candidatura cuja vaga nao tem a relacao (como o Postgres faria); LEFT JOIN mantem, com o
      // nome nulo. E o cliente/cargo sai da EXPRESSAO selecionada, nao de um valor fixo do fingido,
      // para o coalesce x razao-only (mutacao 4) e o inner x left (mutacao 3) morrerem no teste.
      const exigeClienteF = q.joins.some((j) => j.tipo === "inner" && j.tabela === "clientes");
      const exigeCargoF = q.joins.some((j) => j.tipo === "inner" && j.tabela === "cargos");
      const visiveis = filtradas.filter((c) => {
        const v = vagaPorId.get(c.vagaId);
        if (exigeClienteF && (!v?.codCliente || !clientePorCod.has(v.codCliente))) return false;
        if (exigeCargoF && (!v?.cargoId || !cargoPorId.has(v.cargoId))) return false;
        return true;
      });
      return visiveis.map((c) => {
        const row = linhaDeFunil(c);
        if (q.selecao.clienteNome !== undefined)
          row.clienteNome = valorDoAlias(q.selecao.clienteNome, c) as string | null;
        if (q.selecao.cargoNome !== undefined)
          row.cargoNome = valorDoAlias(q.selecao.cargoNome, c) as string | null;
        return row;
      });
    }

    if (q.tabela === "vagas") {
      // opcoes de vaga podem partir de `vagas` com distinct.
      const usadas = new Set(candidaturas.map((c) => c.vagaId));
      const lista = vagasDb.filter((v) => usadas.has(v.id));
      const aliases = Object.entries(q.selecao);
      const rows = lista.map((v) => {
        const row: Record<string, unknown> = {};
        for (const [alias, val] of aliases) {
          const s = val.toLowerCase();
          if (s.includes("nome_divulgacao")) row[alias] = v.nomeDivulgacao ?? null;
          else if (s.includes("codigo")) row[alias] = v.codigo ?? null;
          else if (s.includes('"vagas"."id"') || s.includes("vagas.id") || s.endsWith('."id"'))
            row[alias] = v.id;
          else row[alias] = null;
        }
        return row;
      });
      if (q.distinct) {
        const vistos = new Set<string>();
        return rows.filter((r) => {
          const k = JSON.stringify(r);
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
      }
      return rows;
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
    chain.groupBy = (...cols: unknown[]) => {
      q.grupo = cols.map(textoDe);
      return chain;
    };
    chain.orderBy = (...cols: unknown[]) => {
      q.ordem = cols.map(textoDe);
      return chain;
    };
    chain.having = mesmo;
    chain.limit = (n: number) => {
      q.limite = n;
      return chain;
    };
    chain.offset = (n: number) => {
      q.offset = n;
      return chain;
    };
    chain.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resolver(q)).then(ok, falha);
    return chain;
  }

  function novaConsulta(selecao: Record<string, unknown> | undefined, distinct: boolean) {
    const sel: Record<string, string> = {};
    for (const [k, v] of Object.entries(selecao ?? {})) sel[k] = textoDe(v);
    const q: ConsultaRegistrada = {
      tabela: "",
      joins: [],
      where: "",
      distinct,
      grupo: [],
      ordem: [],
      limite: null,
      offset: null,
      selecao: sel,
    };
    consultas.push(q);
    return construtor(q);
  }

  const db = {
    select: vi.fn((selecao?: Record<string, unknown>) => novaConsulta(selecao, false)),
    selectDistinct: vi.fn((selecao?: Record<string, unknown>) => novaConsulta(selecao, true)),
    query: {
      asCandidaturas: {
        findMany: vi.fn(async (args?: { where?: unknown }) => {
          const q: ConsultaRegistrada = {
            tabela: "as_candidaturas",
            joins: [],
            where: textoDe(args?.where),
            distinct: false,
            grupo: [],
            ordem: [],
            limite: null,
            offset: null,
            selecao: {},
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
    get paginada() {
      return consultas.find((q) => q.tabela === "as_candidatos" && q.limite !== null);
    },
    get agregacoes() {
      return consultas.filter((q) => q.tabela === "as_candidaturas" && q.grupo.length > 0);
    },
  };
}
