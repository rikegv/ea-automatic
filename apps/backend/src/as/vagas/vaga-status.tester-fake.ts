import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Column, getTableColumns, getTableName, is } from "drizzle-orm";
import {
  VAGA_STATUS_SEMENTE,
  type VagaStatusItem,
  type VagaStatusPapel,
} from "@ea/shared-types";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A ONDA B2 (o status da vaga vira catálogo por papel) ──────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUÇÃO. O sufixo `.tester-fake` existe por um motivo prático e
 * registrado: na B1 o agente que construiu escolheu, de boa-fé, o MESMO nome de arquivo que o
 * `tester` tinha escolhido, e sobrescreveu o teste em silêncio. Nome que ninguém mais escolheria
 * é a trava mais barata contra isso.
 *
 * ┌─ POR QUE ESTE ARQUIVO PROCURA O CÓDIGO EM VEZ DE IMPORTÁ-LO ────────────────────────────────┐
 * │ ESTES TESTES FORAM ESCRITOS ANTES DO CÓDIGO EXISTIR (§A.40, regra 2), enquanto a construção  │
 * │ corria em paralelo. O REQUISITO nomeia a tabela (`as_vaga_status`), as colunas e a pergunta   │
 * │ (`codigoDoPapel("ENTREGA")`); ele NÃO nomeia o arquivo, a classe nem o método, e essas são    │
 * │ escolhas legítimas de quem constrói. Um teste que morresse porque o serviço se chama          │
 * │ `VagaStatusCatalogoService` em vez de `VagaStatusService` estaria medindo DESENHO, não a       │
 * │ propriedade que o diretor pediu.                                                              │
 * │                                                                                              │
 * │ ENTÃO A BUSCA É PELO TOKEN, e a falha DIZ o que foi procurado e onde. Enquanto o código não   │
 * │ chega, cada teste falha com uma frase que é a especificação dele.                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado pessoal entra aqui. O catálogo é código, rótulo, ordem, cor e cinco booleanos.
 */

// ── 1. ACHAR O CÓDIGO QUE AINDA ESTÁ SENDO ESCRITO ──────────────────────────

const RAIZ_BACKEND = join(__dirname, "..", "..");

/** Todo `.ts` de produção sob `apps/backend/src`, sem spec, sem fake, sem `node_modules`. */
export function arquivosDeProducao(raiz: string = RAIZ_BACKEND): string[] {
  const saida: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome === "dist") continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes(".fake") || nome.includes("tester-fake")) continue;
      saida.push(caminho);
    }
  };
  andar(raiz);
  return saida;
}

export interface ModuloAchado {
  caminho: string;
  mod: Record<string, unknown>;
}

/** Os módulos de produção cujo FONTE menciona o token, já importados. Erro de import vira aviso. */
export async function modulosQueMencionam(
  token: string,
  raiz: string = RAIZ_BACKEND,
): Promise<{ achados: ModuloAchado[]; candidatos: string[]; falhas: string[] }> {
  const { readFileSync } = await import("node:fs");
  const candidatos = arquivosDeProducao(raiz).filter((c) =>
    readFileSync(c, "utf8").includes(token),
  );
  const achados: ModuloAchado[] = [];
  const falhas: string[] = [];
  for (const caminho of candidatos) {
    try {
      achados.push({ caminho, mod: (await import(/* @vite-ignore */ caminho)) as Record<string, unknown> });
    } catch (e) {
      falhas.push(`${caminho}: ${(e as Error).message}`);
    }
  }
  return { achados, candidatos, falhas };
}

/** O primeiro export (função solta ou método de classe) com aquele nome. */
export interface Portador {
  caminho: string;
  nomeDoExport: string;
  funcaoSolta?: (...a: unknown[]) => unknown;
  classe?: new (...a: never[]) => object;
  metodo?: string;
}

export async function portadoresDe(nomeDoMetodo: string): Promise<Portador[]> {
  const { achados, candidatos, falhas } = await modulosQueMencionam(nomeDoMetodo);
  const saida: Portador[] = [];
  for (const { caminho, mod } of achados) {
    for (const [nomeDoExport, valor] of Object.entries(mod)) {
      if (typeof valor !== "function") continue;
      if (nomeDoExport === nomeDoMetodo) {
        saida.push({ caminho, nomeDoExport, funcaoSolta: valor as (...a: unknown[]) => unknown });
        continue;
      }
      const proto = (valor as { prototype?: Record<string, unknown> }).prototype;
      if (proto && typeof proto[nomeDoMetodo] === "function") {
        saida.push({
          caminho,
          nomeDoExport,
          classe: valor as new (...a: never[]) => object,
          metodo: nomeDoMetodo,
        });
      }
    }
  }
  if (!saida.length) {
    throw new Error(
      [
        `Nada exporta \`${nomeDoMetodo}\` (nem como função, nem como método de classe).`,
        `Arquivos que MENCIONAM o nome: ${candidatos.length ? candidatos.join(", ") : "nenhum"}.`,
        falhas.length ? `Módulos que NÃO importaram: ${falhas.join(" | ")}` : "",
        "Enquanto a construção não chega, este arquivo é a especificação dela.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return saida;
}

// ── 2. O CATÁLOGO EM MEMÓRIA, E O BANCO QUE O SERVE ─────────────────────────

/** A linha da tabela, no formato drizzle (camelCase). O `id` é o da serial. */
export interface LinhaStatus extends VagaStatusItem {
  id: number;
}

/** A semente do vocabulário compartilhado virando linhas de banco. Nunca redigitada. */
export function statusSemente(): LinhaStatus[] {
  return VAGA_STATUS_SEMENTE.map((s, i) => ({ ...s, id: i + 1 }));
}

/** A semente MENOS a linha de um papel: o cenário em que `codigoDoPapel` tem de LANÇAR. */
export function semOPapel(papel: VagaStatusPapel): LinhaStatus[] {
  return statusSemente().filter((s) => s.papel !== papel);
}

/**
 * UM STATUS LIVRE PLAUSÍVEL, e ele é o coração do item 4 do requisito.
 *
 * "Stand By" é `recebeCandidato: false` E `encerra: false`: VAGA PAUSADA NÃO É VAGA TERMINADA.
 * Hoje os dois flags coincidem nos mesmos três códigos, e é essa coincidência que faz uma consulta
 * trocar um pelo outro sem nada ficar vermelho. Esta linha desfaz a coincidência.
 */
export const STAND_BY: LinhaStatus = {
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
};

/** Texto de um nó SQL do drizzle, parâmetros incluídos. Mesma técnica do fake das etapas. */
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

const mencionado = (texto: string, valor: string): boolean => {
  if (!valor) return false;
  const escapado = valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escapado}([^A-Za-z0-9_]|$)`).test(texto);
};

/** O nome da PROPRIEDADE drizzle de uma coluna (`criadoEm`), e não o nome cru (`criado_em`). */
function nomeDaProp(col: Column): string {
  const tabela = (col as unknown as { table: object }).table;
  const cols = getTableColumns(tabela as never) as unknown as Record<string, Column>;
  return Object.keys(cols).find((k) => cols[k] === col) ?? String(col.name);
}

export interface Escrita {
  tipo: "insert" | "update" | "delete";
  tabela: string;
  valores: Record<string, unknown>;
  clausula: string;
  naTransacao: boolean;
}

export interface BancoDeStatus {
  db: unknown;
  status: LinhaStatus[];
  vagas: Record<string, unknown>[];
  eventos: Record<string, unknown>[];
  escritas: Escrita[];
  /** A ORDEM DOS GESTOS: é o que prova que a decisão foi tomada COM a linha da vaga travada. */
  ordem: string[];
  consultas: string[];
}

const TABELA_CATALOGO = "as_vaga_status";
const TABELA_EVENTOS = "as_vaga_status_eventos";

/**
 * O BANCO FINGIDO COM MEMÓRIA.
 *
 * ELE É CRU DE PROPÓSITO, e o limite está escrito para não ser descoberto no meio de um vermelho:
 * ele filtra por `codigo`, `id`, `papel` e `ativo` citados na cláusula, e mais nada. Junção com
 * condição, subconsulta e agregação por grupo não existem aqui. Nenhuma delas é necessária para um
 * catálogo de meia dúzia de linhas com uma tabela de eventos ao lado.
 */
export function bancoDeStatus(inicial: {
  status?: LinhaStatus[];
  vagas?: Record<string, unknown>[];
} = {}): BancoDeStatus {
  const estado: BancoDeStatus = {
    db: null,
    status: inicial.status ?? statusSemente(),
    vagas: inicial.vagas ?? [],
    eventos: [],
    escritas: [],
    ordem: [],
    consultas: [],
  };
  const linhasDe = (tabela: string): Record<string, unknown>[] => {
    if (tabela === TABELA_CATALOGO) return estado.status as unknown as Record<string, unknown>[];
    if (tabela === TABELA_EVENTOS) return estado.eventos;
    if (tabela === "vagas") return estado.vagas;
    return [];
  };

  const filtrar = (tabela: string, clausula: string): Record<string, unknown>[] => {
    const linhas = linhasDe(tabela);
    if (!clausula.trim()) return linhas;
    let saida = linhas;
    const ids = [...clausula.matchAll(/\bid\b\s*(?:=|in)\s*\(?\s*([\d\s,]+)/gi)]
      .flatMap((m) => m[1].split(/[\s,]+/))
      .filter(Boolean)
      .map(Number);
    if (ids.length) saida = saida.filter((l) => ids.includes(Number(l.id)));
    const codigos = saida.map((l) => String(l.codigo ?? "")).filter((c) => mencionado(clausula, c));
    if (codigos.length) saida = saida.filter((l) => codigos.includes(String(l.codigo ?? "")));
    const papeis = saida.map((l) => String(l.papel ?? "")).filter((p) => mencionado(clausula, p));
    if (papeis.length) saida = saida.filter((l) => papeis.includes(String(l.papel ?? "")));
    if (/\bativo\b\s*=?\s*true/i.test(clausula)) saida = saida.filter((l) => l.ativo === true);
    return saida;
  };

  /**
   * A PROJEÇÃO COM AGREGADO (`select({ quantas: count(*) })`), que o fake precisa entender porque a
   * trava do apagar CONTA vagas no status. Um fake que devolvesse as linhas cruas faria o serviço
   * quebrar em `const [{ quantas }]`, e o vermelho falaria do fake, não da régua.
   */
  const projetar = (
    proj: Record<string, unknown> | undefined,
    linhas: Record<string, unknown>[],
  ): Record<string, unknown>[] => {
    if (!proj) return linhas.map((l) => ({ ...l }));
    const chaves = Object.entries(proj);
    /*
     * A PROJEÇÃO ANINHADA (`select({ v: vagas, cargoNome: cargos.nome })`), que é a forma da
     * listagem: a chave recebe a LINHA INTEIRA, e as colunas de tabela juntada viram nulo, porque
     * este fake não sabe juntar. Sem isto, a listagem que fecha o `moverStatus` quebraria dentro do
     * fake e o vermelho falaria do dublê, não da régua.
     */
    const ehTabela = (v: unknown) =>
      !!v && typeof v === "object" && !is(v, Column) && Object.values(v as object).some((x) => is(x, Column));
    if (chaves.some(([, v]) => ehTabela(v))) {
      return linhas.map((l) =>
        Object.fromEntries(
          chaves.map(([k, v]) => [k, ehTabela(v) ? { ...l } : is(v, Column) ? (l[nomeDaProp(v as Column)] ?? null) : null]),
        ),
      );
    }
    const agregados = chaves.filter(([, v]) => !is(v, Column));
    if (agregados.length) {
      return [
        Object.fromEntries(
          agregados.map(([k, v]) => {
            const t = serializar(v).toLowerCase();
            if (t.includes("max")) return [k, Math.max(0, ...linhas.map((l) => Number(l.ordem ?? 0)))];
            if (t.includes("min")) return [k, Math.min(0, ...linhas.map((l) => Number(l.ordem ?? 0)))];
            return [k, linhas.length];
          }),
        ),
      ];
    }
    return linhas.map((l) => ({ ...l }));
  };

  const construtorDeLeitura = (executor: "db" | "tx") => (proj?: Record<string, unknown>) => {
    let tabela = "";
    let clausula = "";
    const b: Record<string, unknown> = {};
    const resolver = () => {
      estado.consultas.push(`${tabela}:${clausula}`);
      return Promise.resolve(projetar(proj, filtrar(tabela, clausula)));
    };
    b.from = (t: unknown) => {
      tabela = getTableName(t as never);
      return b;
    };
    b.where = (c: unknown) => {
      clausula += ` ${serializar(c)}`;
      return b;
    };
    b.orderBy = () => b;
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.groupBy = () => b;
    b.offset = () => b;
    b.limit = () => resolver();
    b.for = (modo: string) => {
      estado.ordem.push(
        `${modo === "update" ? "trava" : `for-${modo}`}:${tabela}:${executor === "tx" ? "tx" : "db"}`,
      );
      return resolver();
    };
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolver().then(ok, err);
    b.catch = (f: (e: unknown) => unknown) => resolver().catch(f);
    return b;
  };

  /**
   * QUEM ESCREVEU IMPORTA MAIS DO QUE QUANDO, e é por isso que `naTransacao` sai do EXECUTOR e não
   * de um cronômetro: um `this.db.insert(...)` escrito DENTRO do bloco da transação roda em OUTRA
   * conexão, fora dela, e some se a transação reverter. Marcado pelo tempo, esse defeito passaria
   * verde; marcado pelo executor, ele aparece.
   */
  const registrar = (tipo: Escrita["tipo"], tabela: string, executor: "db" | "tx") => {
    const naTransacao = executor === "tx";
    const aplicar = (valores: Record<string, unknown>, clausula: string) => {
      estado.escritas.push({ tipo, tabela, valores, clausula, naTransacao });
      estado.ordem.push(`${tipo}:${tabela}:${naTransacao ? "tx" : "fora-da-transacao"}`);
      if (tipo === "insert") {
        const destino = linhasDe(tabela);
        const proximo = Math.max(0, ...destino.map((l) => Number(l.id ?? 0))) + 1;
        destino.push({ id: proximo, ...valores });
        return [{ id: proximo, ...valores }];
      }
      const alvos = filtrar(tabela, clausula);
      if (tipo === "delete") {
        const destino = linhasDe(tabela);
        for (const l of alvos) {
          const i = destino.indexOf(l);
          if (i >= 0) destino.splice(i, 1);
        }
        return alvos.map((l) => ({ ...l }));
      }
      for (const l of alvos) Object.assign(l, valores);
      return alvos.map((l) => ({ ...l }));
    };
    return aplicar;
  };

  const encadearEscrita = (
    tipo: Escrita["tipo"],
    tabela: string,
    valores: Record<string, unknown>,
    executor: "db" | "tx",
  ) => {
    const aplicar = registrar(tipo, tabela, executor);
    let feito = false;
    const encadear = (clausula: string): Record<string, unknown> => {
      const p = () => {
        if (feito) return Promise.resolve([]);
        feito = true;
        return Promise.resolve(aplicar(valores, clausula));
      };
      return {
        where: (c: unknown) => encadear(`${clausula} ${serializar(c)}`),
        returning: () => p(),
        onConflictDoNothing: () => ({ returning: () => p(), then: (ok: never, e?: never) => p().then(ok, e) }),
        onConflictDoUpdate: () => ({ returning: () => p(), then: (ok: never, e?: never) => p().then(ok, e) }),
        then: (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => p().then(ok, e),
        catch: (f: (e: unknown) => unknown) => p().catch(f),
      };
    };
    return encadear("");
  };

  const montar = (executor: "db" | "tx"): Record<string, unknown> => {
    const alvo: Record<string, unknown> = {
      select: construtorDeLeitura(executor),
      insert: (t: unknown) => ({
        values: (v: unknown) =>
          encadearEscrita(
            "insert",
            getTableName(t as never),
            (Array.isArray(v) ? v[0] : v) as Record<string, unknown>,
            executor,
          ),
      }),
      update: (t: unknown) => ({
        set: (v: Record<string, unknown>) =>
          encadearEscrita("update", getTableName(t as never), v, executor),
      }),
      delete: (t: unknown) => encadearEscrita("delete", getTableName(t as never), {}, executor),
      execute: () => Promise.resolve([]),
    };
    alvo.query = new Proxy(
      {},
      {
        get: (_a, prop: string) => {
          const tabela = String(prop)
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .toLowerCase();
          return {
            findFirst: async (args?: { where?: unknown }) => {
              const clausula = serializar(args?.where);
              estado.consultas.push(`${tabela}:${clausula}`);
              const linhas = filtrar(tabela, clausula);
              return linhas.length ? { ...linhas[0] } : undefined;
            },
            findMany: async (args?: { where?: unknown }) => {
              const clausula = serializar(args?.where);
              estado.consultas.push(`${tabela}:${clausula}`);
              return filtrar(tabela, clausula).map((l) => ({ ...l }));
            },
          };
        },
      },
    );
    return alvo;
  };

  const tx = montar("tx");
  const db = montar("db");
  db.transaction = async (fn: (t: unknown) => Promise<unknown>) => {
    estado.ordem.push("abre-transacao");
    return fn(tx);
  };
  estado.db = db;
  return estado;
}

/**
 * O MÉTODO DO SERVIÇO, RESOLVIDO PELO PRIMEIRO NOME QUE EXISTIR (padrão do fake das etapas).
 *
 * A PROPRIEDADE é o que está sob teste, não o nome. Quando nenhum existe, a falha diz quais foram
 * procurados, e é ela que vira a conversa com quem construiu.
 */
export function metodoDe(alvo: object, nomes: string[]): (...args: unknown[]) => Promise<unknown> {
  const dono = alvo as unknown as Record<string, unknown>;
  const nome = nomes.find((n) => typeof dono[n] === "function");
  if (!nome) {
    throw new Error(
      `Nenhum destes métodos existe em ${alvo.constructor?.name ?? "o serviço"}: ${nomes.join(", ")}`,
    );
  }
  return (...args: unknown[]) => Promise.resolve((dono[nome] as (...a: unknown[]) => unknown)(...args));
}

/** Instancia uma classe de serviço entregando o mesmo banco fingido a todos os parâmetros dela. */
export function instanciar(classe: new (...a: never[]) => object, db: unknown, extras: unknown[] = []): object {
  const args = Array.from({ length: Math.max(classe.length, 1) }, (_, i) => extras[i] ?? db);
  return new (classe as new (...a: unknown[]) => object)(...args);
}

/** O erro de uma chamada que deveria recusar. `null` quando ela passou. */
export async function erroDe(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}
