import { Column, getTableColumns, getTableName, is } from "drizzle-orm";
import { VAGA_STATUS_SEMENTE, type VagaStatusTom, type VagaStatusPapel } from "@ea/shared-types";
import type { AsVagaStatusLinha } from "./vaga-status.service";

/**
 * ─ O BANCO COM MEMÓRIA DO CATÁLOGO DE STATUS DA VAGA ───────────────────────────────────────────
 *
 * INFRAESTRUTURA DE TESTE. Nenhuma linha daqui roda em produção. É o irmão do
 * `etapas-funil.fake-db.ts`, e a semelhança é deliberada: o catálogo tem a mesma forma, então o
 * dublê tem a mesma forma, e quem já leu um lê o outro.
 *
 * ┌─ MOTIVO 1: A ESCRITA DE UMA CHAMADA PRECISA SER LIDA PELA SEGUINTE ────────────────────────┐
 * │ "Criar o status aparece na leitura seguinte" e "inativar tira ele da lista" são afirmações  │
 * │ sobre DUAS chamadas, e um fake sem memória responde a segunda com o mundo de antes da        │
 * │ primeira. O CACHE QUE NÃO INVALIDA passaria verde, e aqui isso é grave: os campos deste      │
 * │ catálogo são TRAVAS, então cache velho é trava desligada.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ MOTIVO 2, E É O QUE SEPARA TESTE CERTO DE TESTE QUE PASSA POR ENGANO ─────────────────────┐
 * │ AS TRÊS CAMADAS DO APAGAR CONTAM: quantas VAGAS estão no status (camada 1) e quantos EVENTOS │
 * │ de trilha o citam (camada 2). Um fake que devolvesse as linhas prontas, ignorando o filtro,  │
 * │ responderia a MESMA contagem para a régua certa e para a errada: o teste ficaria verde nas   │
 * │ duas e não travaria nada.                                                                    │
 * │                                                                                              │
 * │ AQUI O FILTRO É APLICADO DE VERDADE, por um interpretador CRU, e ele é honesto sobre o que   │
 * │ cobre. A vaga é filtrada pelo `status = X` EXATO citado na cláusula, DERIVADO DA CLÁUSULA e  │
 * │ não das linhas presentes: derivar das linhas faria um status VAZIO cair no ramo "nada citado"│
 * │ e devolver TODAS as vagas, e a recusa dispararia no alvo errado (foi o falso positivo que o  │
 * │ fake das etapas já pagou).                                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE NÃO SABE FAZER: junção com condição, subconsulta e agregação por grupo. Nenhuma delas
 * aparece neste catálogo, que é uma tabela de meia dúzia de linhas e duas contagens.
 *
 * §A.6: nenhum dado pessoal entra aqui. As vagas fingidas têm id e status, e nada mais.
 */

export const TAB_STATUS = "as_vaga_status";
export const TAB_VAGAS = "vagas";
export const TAB_EVENTOS = "as_vaga_status_eventos";

const TABELA_DA_PROP: Record<string, string> = {
  asVagaStatus: TAB_STATUS,
  vagas: TAB_VAGAS,
  asVagaStatusEventos: TAB_EVENTOS,
};

export interface LinhaVagaFingida {
  id: string;
  status: string;
  [extra: string]: unknown;
}

export interface LinhaEventoFingido {
  id: string;
  vagaId: string;
  de: string | null;
  para: string;
  [extra: string]: unknown;
}

export interface EstadoDoCatalogo {
  status: AsVagaStatusLinha[];
  vagas: LinhaVagaFingida[];
  eventos: LinhaEventoFingido[];
}

/** Reconstrói o texto de um objeto SQL do drizzle, PARÂMETROS INCLUÍDOS. Coluna vira só o NOME. */
export function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  if ("value" in o && "encoder" in o) return serializar(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/** O valor aparece como TOKEN INTEIRO? Evita `ABERTA` casar dentro de `ABERTA_ESPECIAL`. */
function mencionado(texto: string, valor: string): boolean {
  if (!valor) return false;
  const escapado = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
}

function linhasDa(estado: EstadoDoCatalogo, tabela: string): Record<string, unknown>[] {
  if (tabela === TAB_STATUS) return estado.status as unknown as Record<string, unknown>[];
  if (tabela === TAB_VAGAS) return estado.vagas as unknown as Record<string, unknown>[];
  if (tabela === TAB_EVENTOS) return estado.eventos as unknown as Record<string, unknown>[];
  return [];
}

function filtrarStatus(
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  let saida = linhas;
  const ids = [...clausula.matchAll(/\bid\b\s*(?:=|in)\s*\(?\s*([\d\s,]+)/gi)]
    .flatMap((m) => m[1].split(/[\s,]+/))
    .filter(Boolean)
    .map(Number);
  const codigos = linhas.map((l) => String(l.codigo)).filter((c) => mencionado(clausula, c));

  if (ids.length) saida = saida.filter((l) => ids.includes(Number(l.id)));
  else if (codigos.length) saida = saida.filter((l) => codigos.includes(String(l.codigo)));

  if (/\bativo\b\s*=\s*true/i.test(clausula)) saida = saida.filter((l) => l.ativo === true);
  if (/\bativo\b\s*=\s*false/i.test(clausula)) saida = saida.filter((l) => l.ativo === false);
  return saida;
}

/**
 * A CONTAGEM DA CAMADA 1. O `status = X` vem da CLÁUSULA, e não das linhas: um status VAZIO tem de
 * contar ZERO, e não "todas as vagas do banco fingido". Sem esta escolha, apagar um status sem
 * ninguém dentro seria recusado sempre que existisse QUALQUER vaga em QUALQUER status.
 */
function filtrarVagas(
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  const exatos = [...clausula.matchAll(/\bstatus\b\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  if (exatos.length) return linhas.filter((l) => exatos.includes(String(l.status)));
  const ids = linhas.map((l) => String(l.id)).filter((i) => mencionado(clausula, i));
  if (ids.length) return linhas.filter((l) => ids.includes(String(l.id)));
  return linhas;
}

/** A CAMADA 2 olha os DOIS lados do evento, e o fake precisa olhar os dois também. */
function filtrarEventos(
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  return linhas.filter(
    (l) =>
      mencionado(clausula, String(l.para)) || (l.de ? mencionado(clausula, String(l.de)) : false),
  );
}

function filtrar(
  tabela: string,
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  if (!clausula.trim()) return linhas;
  if (tabela === TAB_STATUS) return filtrarStatus(linhas, clausula);
  if (tabela === TAB_VAGAS) return filtrarVagas(linhas, clausula);
  if (tabela === TAB_EVENTOS) return filtrarEventos(linhas, clausula);
  return linhas;
}

/** Ordenação rasa: o primeiro campo citado no `orderBy` manda, com desempate por `id`. */
function ordenar(linhas: Record<string, unknown>[], ordenacao: string): Record<string, unknown>[] {
  if (!ordenacao.trim()) return linhas;
  const campo = ["ordem", "codigo", "rotulo", "id"].find((c) =>
    new RegExp(`\\b${c}\\b`).test(ordenacao),
  );
  if (!campo) return linhas;
  const desc = /\bdesc\b/i.test(ordenacao);
  return [...linhas].sort((a, b) => {
    const x = a[campo] as number | string;
    const y = b[campo] as number | string;
    const r = x === y ? Number(a.id ?? 0) - Number(b.id ?? 0) : x > y ? 1 : -1;
    return desc ? -r : r;
  });
}

function propDaColuna(col: Column): string {
  const tabela = (col as unknown as { table: object }).table;
  const cols = getTableColumns(tabela as never) as unknown as Record<string, Column>;
  return Object.keys(cols).find((k) => cols[k] === col) ?? String(col.name);
}

function agregar(expr: unknown, linhas: Record<string, unknown>[]): number {
  const t = serializar(expr).toLowerCase();
  if (t.includes("count")) return linhas.length;
  if (t.includes("max") || t.includes("min")) {
    const campo = /\bordem\b/.test(t) ? "ordem" : "id";
    const valores = linhas.map((l) => Number(l[campo] ?? 0));
    if (!valores.length) return 0;
    return t.includes("max") ? Math.max(...valores) : Math.min(...valores);
  }
  return linhas.length;
}

function projetar(
  proj: Record<string, unknown> | undefined,
  linhas: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!proj) return linhas.map((l) => ({ ...l }));
  const agregados = Object.entries(proj).filter(([, v]) => !is(v, Column));
  if (agregados.length) {
    return [Object.fromEntries(agregados.map(([k, v]) => [k, agregar(v, linhas)]))];
  }
  return linhas.map((l) =>
    Object.fromEntries(Object.entries(proj).map(([k, v]) => [k, l[propDaColuna(v as Column)]])),
  );
}

export interface Consulta {
  tabela: string;
  clausula: string;
}

export interface BancoFingidoDeStatus {
  db: unknown;
  estado: EstadoDoCatalogo;
  /** Toda consulta de LEITURA feita, com a cláusula serializada. Para afirmar sobre o filtro. */
  consultas: Consulta[];
}

export function bancoFingidoDeStatus(
  inicial: Partial<EstadoDoCatalogo> = {},
): BancoFingidoDeStatus {
  const estado: EstadoDoCatalogo = {
    status: inicial.status ?? semente(),
    vagas: inicial.vagas ?? [],
    eventos: inicial.eventos ?? [],
  };
  const consultas: Consulta[] = [];
  let seq = Math.max(0, ...estado.status.map((s) => s.id));
  const proximoId = () => ++seq;

  function construtorDeLeitura(proj?: Record<string, unknown>) {
    let tabela = "";
    let clausula = "";
    let ordenacao = "";
    const b: Record<string, unknown> = {};

    const resolver = () => {
      const cruas = filtrar(tabela, linhasDa(estado, tabela), clausula);
      consultas.push({ tabela, clausula });
      return Promise.resolve(projetar(proj, ordenar(cruas, ordenacao)));
    };

    b.from = (t: unknown) => {
      tabela = getTableName(t as never);
      return b;
    };
    b.where = (c: unknown) => {
      clausula += ` ${serializar(c)}`;
      return b;
    };
    b.orderBy = (...a: unknown[]) => {
      ordenacao = serializar(a);
      return b;
    };
    b.leftJoin = (_t: unknown, c: unknown) => {
      clausula += ` ${serializar(c)}`;
      return b;
    };
    b.innerJoin = b.leftJoin;
    b.groupBy = () => b;
    b.limit = () => b;
    b.offset = () => b;
    b.for = () => b;
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolver().then(ok, err);
    b.catch = (f: (e: unknown) => unknown) => resolver().catch(f);
    return b;
  }

  /** O que o `postgres` devolve de verdade. Sem tratamento, vira 500 na cara de quem digitou. */
  function erroDeUnique(): Error {
    return Object.assign(
      new Error('duplicate key value violates unique constraint "as_vaga_status_codigo_unique"'),
      { code: "23505", constraint_name: "as_vaga_status_codigo_unique" },
    );
  }

  function inserir(tabela: string, valores: unknown): Record<string, unknown>[] {
    const lista = (Array.isArray(valores) ? valores : [valores]) as Record<string, unknown>[];
    const criadas: Record<string, unknown>[] = [];
    for (const v of lista) {
      if (tabela === TAB_STATUS) {
        const codigo = String(v.codigo ?? "");
        // A UNIQUE do banco, de verdade: sem ela, "recriar o status inativado" passaria verde
        // inserindo uma SEGUNDA linha com o mesmo código, que é o estado que a FK proíbe.
        if (estado.status.some((s) => s.codigo === codigo)) throw erroDeUnique();
        const linha: AsVagaStatusLinha = {
          id: Number(v.id ?? proximoId()),
          codigo,
          rotulo: String(v.rotulo ?? ""),
          ordem: Number(v.ordem ?? estado.status.length + 1),
          tom: (v.tom ?? "nt") as VagaStatusTom,
          ativo: v.ativo === undefined ? true : v.ativo === true,
          papel: (v.papel ?? "LIVRE") as VagaStatusPapel,
          encerra: v.encerra === true,
          recebeCandidato: v.recebeCandidato === undefined ? true : v.recebeCandidato === true,
          daTrilha: v.daTrilha === true,
          movivelManualmente: v.movivelManualmente === true,
        };
        estado.status.push(linha);
        criadas.push(linha as unknown as Record<string, unknown>);
        continue;
      }
      const destino = linhasDa(estado, tabela);
      const linha = { id: `linha-${destino.length + 1}`, ...v };
      destino.push(linha);
      criadas.push(linha);
    }
    return criadas.map((l) => ({ ...l }));
  }

  const db: Record<string, unknown> = {
    select: (proj?: Record<string, unknown>) => construtorDeLeitura(proj),

    insert: (t: unknown) => ({
      values: (valores: unknown) => {
        const tabela = getTableName(t as never);
        let erro: unknown = null;
        let criadas: Record<string, unknown>[] = [];
        try {
          criadas = inserir(tabela, valores);
        } catch (e) {
          erro = e;
        }
        const p = () => (erro ? Promise.reject(erro) : Promise.resolve(criadas));
        return {
          returning: () => p(),
          then: (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => p().then(ok, e),
          catch: (f: (e: unknown) => unknown) => p().catch(f),
        };
      },
    }),

    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        const tabela = getTableName(t as never);
        let feito = false;
        const aplicar = (clausula: string) => {
          if (feito) return [];
          feito = true;
          const alvos = filtrar(tabela, linhasDa(estado, tabela), clausula);
          for (const linha of alvos) for (const [k, v] of Object.entries(valores)) linha[k] = v;
          return alvos.map((l) => ({ ...l }));
        };
        const encadear = (clausula: string): Record<string, unknown> => {
          const p = () => Promise.resolve(aplicar(clausula));
          return {
            where: (c: unknown) => encadear(`${clausula} ${serializar(c)}`),
            returning: () => p(),
            then: (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => p().then(ok, e),
            catch: (f: (e: unknown) => unknown) => p().catch(f),
          };
        };
        return encadear("");
      },
    }),

    delete: (t: unknown) => {
      const tabela = getTableName(t as never);
      let feito = false;
      const aplicar = (clausula: string) => {
        if (feito) return [];
        feito = true;
        const alvos = filtrar(tabela, linhasDa(estado, tabela), clausula);
        const destino = linhasDa(estado, tabela);
        for (const linha of alvos) {
          const i = destino.indexOf(linha);
          if (i >= 0) destino.splice(i, 1);
        }
        return alvos.map((l) => ({ ...l }));
      };
      const encadear = (clausula: string): Record<string, unknown> => {
        const p = () => Promise.resolve(aplicar(clausula));
        return {
          where: (c: unknown) => encadear(`${clausula} ${serializar(c)}`),
          returning: () => p(),
          then: (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => p().then(ok, e),
          catch: (f: (e: unknown) => unknown) => p().catch(f),
        };
      };
      return encadear("");
    },

    execute: () => Promise.resolve([]),
  };

  // A transação roda no MESMO banco fingido: o que ela escreve fica escrito.
  db.transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(db);

  db.query = new Proxy(
    {},
    {
      get: (_alvo, prop: string) => {
        const tabela = TABELA_DA_PROP[prop] ?? "";
        return {
          findFirst: async (args?: { where?: unknown }) => {
            const clausula = serializar(args?.where);
            consultas.push({ tabela, clausula });
            const linhas = filtrar(tabela, linhasDa(estado, tabela), clausula);
            return linhas.length ? { ...linhas[0] } : undefined;
          },
          findMany: async (args?: { where?: unknown }) => {
            const clausula = serializar(args?.where);
            consultas.push({ tabela, clausula });
            return filtrar(tabela, linhasDa(estado, tabela), clausula).map((l) => ({ ...l }));
          },
        };
      },
    },
  );

  return { db, estado, consultas };
}

/**
 * O CATÁLOGO COMO A MIGRATION 0102 O DEIXA, montado a partir de `VAGA_STATUS_SEMENTE` e NUNCA
 * redigitado: é o vocabulário compartilhado que decide o estado inicial, e uma cópia aqui
 * divergiria dele na primeira correção.
 *
 * O `VAGA_BANCO` NÃO ENTRA, e a ausência é escolha: ele é o valor dormente do enum, e quem afirma o
 * que a migration faz com ele é o teste da própria migration. Aqui interessa o catálogo VIVO.
 */
export function semente(): AsVagaStatusLinha[] {
  return VAGA_STATUS_SEMENTE.map((s, i) => ({ id: i + 1, ...s, tom: s.tom as VagaStatusTom }));
}

/** Um status do diretor, para as camadas do apagar terem um alvo legítimo. */
export function standBy(over: Partial<AsVagaStatusLinha> = {}): AsVagaStatusLinha {
  return {
    id: 90,
    codigo: "STAND_BY",
    rotulo: "Stand By",
    ordem: 6,
    tom: "wn",
    ativo: true,
    papel: "LIVRE",
    encerra: false,
    recebeCandidato: false,
    daTrilha: false,
    movivelManualmente: true,
    ...over,
  };
}
