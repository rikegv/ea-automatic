import { Column, getTableColumns, getTableName, is } from "drizzle-orm";
import { CANDIDATURA_SITUACOES, ETAPAS_FUNIL_SEMENTE } from "@ea/shared-types";

/**
 * ─ O BANCO COM MEMÓRIA DO CATÁLOGO DE ETAPAS, e ele existe por DOIS motivos, não um ────────────
 *
 * INFRAESTRUTURA DE TESTE. Nenhuma linha daqui roda em produção. Mora ao lado dos specs porque os
 * seis arquivos de teste do catálogo precisam do MESMO banco fingido, e seis cópias de um fake
 * divergem no primeiro ajuste, que é a mesma doença que este módulo inteiro combate nas réguas.
 *
 * ┌─ MOTIVO 1: A ESCRITA DE UMA CHAMADA PRECISA SER LIDA PELA SEGUINTE ────────────────────────┐
 * │ "Criar a etapa aparece na leitura seguinte" e "inativar tira ela da lista" são afirmações   │
 * │ sobre DUAS chamadas, e um fake sem memória responde a segunda com o mundo de antes da        │
 * │ primeira. O cache que não invalida (o defeito clássico deste desenho) passaria verde.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ MOTIVO 2, E É O QUE SEPARA TESTE CERTO DE TESTE QUE PASSA POR ENGANO ─────────────────────┐
 * │ A TRAVA DO APAGAR CONTA CANDIDATURAS VIVAS, e "viva" é `candidaturaViva`, ou seja ATIVO,    │
 * │ APROVADO, ALOCADO e ENVIADO_PARA_ADMISSAO. Uma implementação que conte só `situacao =       │
 * │ 'ATIVO'` deixa etapa fantasma, e um fake que devolva as linhas prontas, ignorando o filtro,  │
 * │ responde a MESMA contagem para a régua certa e para a errada: o teste ficaria verde nas duas │
 * │ e não travaria nada. É o mesmo motivo (e quase a mesma técnica) do                           │
 * │ `retencao-candidatos.spec.ts`, que olha o SQL porque o filtro mora dentro da consulta.       │
 * │                                                                                             │
 * │ AQUI O FILTRO É APLICADO DE VERDADE, por um interpretador CRU: a cláusula é serializada e as │
 * │ linhas são filtradas pelos valores que ela menciona. Cru, e honesto sobre o que cobre:       │
 * │   . `in (...)` filtra pelos valores citados;                                                 │
 * │   . `not in (...)` e `<>` INVERTEM (a forma pelo complemento, que é igualmente correta);     │
 * │   . cláusula que não cita situação nenhuma devolve TODAS as linhas, porque nesse caso quem   │
 * │     filtra é o JavaScript do serviço, e é lá que a régua será medida.                        │
 * │ As quatro combinações (SQL certo, SQL ingênuo, JS certo, JS ingênuo) caem do lado certo.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE NÃO SABE FAZER, escrito para não ser descoberto no meio de um vermelho: junção com
 * condição de verdade, subconsulta correlacionada e agregação por grupo. Nenhuma delas é necessária
 * para o catálogo, que tem uma tabela de 5 a 10 linhas e duas contagens.
 *
 * §A.6: nenhum dado pessoal entra aqui. As candidaturas fingidas têm etapa e situação, e nada mais.
 */

/** Os nomes REAIS das tabelas, que é como o fake as reconhece: sem importar o schema. */
export const TAB_ETAPAS = "as_etapas_funil";
export const TAB_CANDIDATURAS = "as_candidaturas";
export const TAB_HISTORICO = "as_candidatura_etapas";

/** A prop do drizzle para cada tabela, usada só pelo `db.query.<tabela>` relacional. */
const TABELA_DA_PROP: Record<string, string> = {
  asEtapasFunil: TAB_ETAPAS,
  etapasFunil: TAB_ETAPAS,
  asCandidaturas: TAB_CANDIDATURAS,
  asCandidaturaEtapas: TAB_HISTORICO,
};

export interface LinhaEtapa {
  id: number;
  codigo: string;
  rotulo: string;
  ordem: number;
  tom: string;
  inicial: boolean;
  ativa: boolean;
  criadoEm?: Date;
  atualizadoEm?: Date;
  [extra: string]: unknown;
}

export interface LinhaCandidatura {
  id: string;
  etapa: string;
  situacao: string;
}

export interface LinhaHistorico {
  id: string;
  candidaturaId: string;
  etapaDe: string | null;
  etapaPara: string;
}

export interface Estado {
  etapas: LinhaEtapa[];
  candidaturas: LinhaCandidatura[];
  historico: LinhaHistorico[];
}

/**
 * Reconstrói o texto de um objeto SQL do drizzle a partir dos pedaços dele, PARÂMETROS INCLUÍDOS.
 *
 * É a mesma técnica do `retencao-candidatos.spec.ts`, com uma diferença que importa: aqui a COLUNA
 * vira só o NOME dela. Ler a coluna inteira traria junto os `enumValues` do tipo do Postgres, e a
 * lista de situações apareceria no texto mesmo quando a consulta não a menciona: o interpretador
 * passaria a "ver" ALOCADO em toda cláusula, e o teste que existe para pegar o filtro ingênuo
 * ficaria verde para sempre.
 */
export function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  // Param do drizzle: o valor literal que vai para o placeholder.
  if ("value" in o && "encoder" in o) return serializar(o.value);
  // StringChunk: pedaços de texto cru.
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/** O valor aparece como TOKEN INTEIRO? Evita `TRIAGEM` casar dentro de `TRIAGEM_INICIAL`. */
function mencionado(texto: string, valor: string): boolean {
  if (!valor) return false;
  const escapado = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
}

function linhasDa(estado: Estado, tabela: string): Record<string, unknown>[] {
  if (tabela === TAB_ETAPAS) return estado.etapas as unknown as Record<string, unknown>[];
  if (tabela === TAB_CANDIDATURAS) return estado.candidaturas as unknown as Record<string, unknown>[];
  if (tabela === TAB_HISTORICO) return estado.historico as unknown as Record<string, unknown>[];
  return [];
}

/**
 * O FILTRO DAS CANDIDATURAS, que é o coração do motivo 2. Ver o cabeçalho do arquivo: as quatro
 * combinações de implementação (SQL certo, SQL ingênuo, JS certo, JS ingênuo) precisam cair do lado
 * certo, e é esta função que decide isso.
 */
function filtrarCandidaturas(
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  /*
   * O `etapa = X` EXATO MANDA, MESMO QUE NENHUMA LINHA TENHA ESSE VALOR, e é aqui que morava um
   * falso positivo: derivar os códigos das LINHAS presentes faz uma etapa VAZIA cair no ramo
   * "nenhum código citado", que devolve TODAS as candidaturas. Uma etapa sem ninguém aparecia
   * CHEIA sempre que houvesse gente viva em QUALQUER outra etapa do catálogo, e a recusa por
   * candidatura viva (`remover`, e agora `inativar`) dispararia no alvo errado.
   *
   * `\betapa\b` não casa `etapa_para` nem `etapa_de` (o `_` é caractere de palavra), então o
   * histórico continua sendo filtrado pelo seu próprio ramo.
   */
  const exatas = [...clausula.matchAll(/\betapa\b\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  const codigos = new Set(
    exatas.length ? exatas : linhas.map((l) => String(l.etapa)).filter((c) => mencionado(clausula, c)),
  );
  let saida = codigos.size ? linhas.filter((l) => codigos.has(String(l.etapa))) : linhas;

  const citadas = CANDIDATURA_SITUACOES.filter((s) => mencionado(clausula, s));
  if (citadas.length) {
    const negado = /not\s+in|<>|!=|not\s*\(/i.test(clausula);
    saida = saida.filter((l) => {
      const dentro = (citadas as readonly string[]).includes(String(l.situacao));
      return negado ? !dentro : dentro;
    });
  }
  return saida;
}

function filtrarEtapas(
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

  // A leitura padrão do catálogo pede só as ATIVAS, e o fake precisa honrar isso: sem ele,
  // "a inativada some da lista" passaria verde com o filtro ausente.
  if (/\bativa\b\s*=\s*true/i.test(clausula)) saida = saida.filter((l) => l.ativa === true);
  if (/\bativa\b\s*=\s*false/i.test(clausula)) saida = saida.filter((l) => l.ativa === false);

  return saida;
}

function filtrar(
  tabela: string,
  linhas: Record<string, unknown>[],
  clausula: string,
): Record<string, unknown>[] {
  if (!clausula.trim()) return linhas;
  if (tabela === TAB_ETAPAS) return filtrarEtapas(linhas, clausula);
  if (tabela === TAB_CANDIDATURAS) return filtrarCandidaturas(linhas, clausula);
  if (tabela === TAB_HISTORICO) {
    return linhas.filter(
      (l) =>
        mencionado(clausula, String(l.etapaPara)) ||
        (l.etapaDe ? mencionado(clausula, String(l.etapaDe)) : false),
    );
  }
  return linhas;
}

/** Ordenação rasa: o primeiro campo citado no `orderBy` manda. */
function ordenar(linhas: Record<string, unknown>[], ordenacao: string): Record<string, unknown>[] {
  if (!ordenacao.trim()) return linhas;
  const campo = ["ordem", "codigo", "rotulo", "id"].find((c) =>
    new RegExp(`\\b${c}\\b`).test(ordenacao),
  );
  if (!campo) return linhas;
  const desc = /\bdesc\b/i.test(ordenacao);
  const chave = campo === "ordem" ? "ordem" : campo;
  return [...linhas].sort((a, b) => {
    const x = a[chave] as number | string;
    const y = b[chave] as number | string;
    const r = x === y ? Number(a.id ?? 0) - Number(b.id ?? 0) : x > y ? 1 : -1;
    return desc ? -r : r;
  });
}

/** O nome da propriedade drizzle de uma coluna, para projetar `{ id: t.id }` sobre a linha crua. */
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

/** O valor a gravar. Entende o `case when id = X then Y` da reescrita de ordem em um update só. */
function valorEscrito(v: unknown, linha: Record<string, unknown>): unknown {
  if (v && typeof v === "object" && Array.isArray((v as { queryChunks?: unknown[] }).queryChunks)) {
    const t = serializar(v);
    for (const m of t.matchAll(/when\s+id\s*=\s*(\d+)\s+then\s+(-?\d+)/gi)) {
      if (Number(m[1]) === Number(linha.id)) return Number(m[2]);
    }
    const so = t.trim().match(/^(-?\d+)$/);
    return so ? Number(so[1]) : t.trim();
  }
  return v;
}

export interface Consulta {
  tabela: string;
  clausula: string;
}

export interface BancoFingido {
  db: unknown;
  estado: Estado;
  /** Toda consulta de LEITURA feita, com a cláusula serializada. Para afirmar sobre o filtro. */
  consultas: Consulta[];
  proximoId: () => number;
}

/**
 * O banco fingido com estado. `estado` é o mesmo objeto que os testes leem depois das escritas: é
 * nele que se afirma "a linha continua lá, com `ativa = false`".
 */
export function bancoFingido(inicial: Partial<Estado> = {}): BancoFingido {
  const estado: Estado = {
    etapas: inicial.etapas ?? [],
    candidaturas: inicial.candidaturas ?? [],
    historico: inicial.historico ?? [],
  };
  const consultas: Consulta[] = [];
  let seq = Math.max(0, ...estado.etapas.map((e) => e.id));
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

  function erroDeUnique(): Error {
    // O que o `postgres` devolve de verdade. É por ele que o serviço tem de NÃO deixar passar: sem
    // tratamento, isto vira 500 na cara de quem digitou um nome que já existiu um dia.
    return Object.assign(
      new Error('duplicate key value violates unique constraint "as_etapas_funil_codigo_unique"'),
      { code: "23505", constraint_name: "as_etapas_funil_codigo_unique" },
    );
  }

  function inserir(tabela: string, valores: unknown): Record<string, unknown>[] {
    const lista = (Array.isArray(valores) ? valores : [valores]) as Record<string, unknown>[];
    const criadas: Record<string, unknown>[] = [];
    for (const v of lista) {
      if (tabela === TAB_ETAPAS) {
        const codigo = String(v.codigo ?? "");
        // A UNIQUE do banco, de verdade. Sem ela, "recriar a etapa inativada" passaria verde
        // inserindo uma segunda linha com o mesmo código, que é o estado que a FK proíbe.
        if (estado.etapas.some((e) => e.codigo === codigo)) throw erroDeUnique();
        const linha: LinhaEtapa = {
          id: Number(v.id ?? proximoId()),
          codigo,
          rotulo: String(v.rotulo ?? ""),
          ordem: Number(v.ordem ?? estado.etapas.length + 1),
          tom: String(v.tom ?? "nt"),
          inicial: v.inicial === true,
          ativa: v.ativa === undefined ? true : v.ativa === true,
          criadoEm: new Date("2026-09-09T12:00:00.000Z"),
          atualizadoEm: new Date("2026-09-09T12:00:00.000Z"),
        };
        estado.etapas.push(linha);
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
          onConflictDoNothing: () => ({ returning: () => p(), then: (ok: never, e?: never) => p().then(ok, e) }),
          onConflictDoUpdate: () => ({ returning: () => p(), then: (ok: never, e?: never) => p().then(ok, e) }),
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
          for (const linha of alvos) {
            for (const [k, v] of Object.entries(valores)) linha[k] = valorEscrito(v, linha);
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

  // A transação roda no MESMO banco fingido: o que ela escreve fica escrito, que é o que os testes
  // de reordenação e de remoção precisam enxergar depois.
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

  return { db, estado, consultas, proximoId };
}

/**
 * AS CINCO DE HOJE, como o banco fica depois da migration da E1. Montadas a partir de
 * `ETAPAS_FUNIL_SEMENTE` e nunca redigitadas: é o vocabulário compartilhado que decide o estado
 * inicial, e uma cópia aqui divergiria dele no primeiro cadastro do diretor.
 */
export function etapasSemente(): LinhaEtapa[] {
  return ETAPAS_FUNIL_SEMENTE.map((e, i) => ({
    id: i + 1,
    codigo: e.codigo,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tom: e.tom,
    inicial: e.ordem === 1,
    ativa: true,
  }));
}

/**
 * O MÉTODO DO SERVIÇO, RESOLVIDO PELO PRIMEIRO NOME QUE EXISTIR.
 *
 * ESTES TESTES FORAM ESCRITOS ANTES DO CÓDIGO (§A.40, regra 2), e o nome do método é escolha de quem
 * constrói. A PROPRIEDADE é o que está sendo guardado, não o nome: um teste que morre porque o
 * método se chama `inativar` em vez de `remover` estaria medindo desenho. Quando nenhum dos nomes
 * existe, a falha diz exatamente quais foram procurados.
 */
export function metodo(
  alvo: object,
  nomes: string[],
): (...args: unknown[]) => Promise<unknown> {
  const dono = alvo as unknown as Record<string, unknown>;
  const nome = nomes.find((n) => typeof dono[n] === "function");
  if (!nome) {
    throw new Error(
      `Nenhum destes métodos existe em ${alvo.constructor?.name ?? "o serviço"}: ${nomes.join(", ")}`,
    );
  }
  return (...args: unknown[]) =>
    Promise.resolve((dono[nome] as (...a: unknown[]) => unknown)(...args));
}

/** A lista devolvida por `listar`, seja ela um array cru ou um envelope. */
export function comoLista(r: unknown): Record<string, unknown>[] {
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  const o = (r ?? {}) as Record<string, unknown>;
  for (const chave of ["etapas", "itens", "items", "data"]) {
    if (Array.isArray(o[chave])) return o[chave] as Record<string, unknown>[];
  }
  throw new Error(`A leitura do catálogo não devolveu uma lista: ${JSON.stringify(r)}`);
}
