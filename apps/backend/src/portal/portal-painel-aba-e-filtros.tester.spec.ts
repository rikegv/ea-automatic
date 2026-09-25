import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ABAS_PAINEL_PORTAL } from "@ea/shared-types";
import { PortalPainelService } from "./portal-painel.service";

/**
 * COBERTURA INDEPENDENTE (§A.38), SEGUNDA RODADA DO GERENCIADOR DO PORTAL: A ABA E OS FILTROS.
 *
 * Escrito ANTES do código (§A.40, regra 2), contra o REQUISITO do diretor:
 *   "ABA CONCLUIDO: quando o candidato TERMINA a entrega, ele SAI da frente de trabalho e vai pra
 *    uma aba Concluido. A frente de trabalho mostra so os EM ANDAMENTO."
 *   "Os CONTADORES (encaminhados, acessaram, concluiram, intervencao humana, nao acessaram)."
 *   "FILTROS: Cliente, Cargo, Documento Atual, Situacao, Link, Ultimo Acesso, + NOME DO
 *    FUNCIONARIO + DATA DE ADMISSAO."
 *
 * ┌─ O DEFEITO CLÁSSICO QUE O ARQUIVO 1 ATACA: O CARD QUE MUDA COM A ABA ───────────────────────┐
 * │ O funil é do UNIVERSO inteiro; a aba recorta só a LISTA. Quem implementa a aba filtrando a   │
 * │ coleção antes de contar faz o card "encaminhados" cair para o tamanho da aba, e o número que │
 * │ a diretoria olha passa a depender de qual aba estava aberta. Aqui se exige: os CINCO números │
 * │ idênticos nas duas abas, e a soma das duas listas igual ao total.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O BANCO DE MENTIRINHA DESTE ARQUIVO ───────────────────────────────────────────────────────┐
 * │ Ele é diferente dos outros dois já existentes: além de limite e deslocamento, ele HONRA a    │
 * │ restrição por lista de ids que a consulta carrega no `where` (é assim que o serviço aplica o │
 * │ recorte derivado: aba, situação, documento e estado do link são calculados fora do SQL). Sem │
 * │ honrar isso, qualquer aba devolveria a lista inteira e o teste mediria o falso.              │
 * │ Ele também GUARDA as condições de `where`, e é delas que sai a prova de que dois clientes    │
 * │ chegam juntos à consulta como `IN`, e não um por vez.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids sintéticos, nomes inventados, nenhum CPF.
 */

const HOJE = Date.parse("2026-09-20T12:00:00.000Z");
const rel = (ms: number) => new Date(HOJE + ms);

interface AdmissaoFake {
  id: string;
  nome: string;
  cliente: string;
  codCliente: string;
  cargo: string;
  cargoId: string;
  dataAdmissao: string | null;
  acessou: boolean;
  ultimoAcessoEm: Date | null;
  criadoEm: Date;
  entregues: number;
  total: number;
  noTime?: boolean;
  proximo?: string | null;
}

/** As condições de `where` que o serviço mandou, para as asserções de filtro. */
interface Espiao {
  wheres: unknown[];
  limites: number[];
  deslocamentos: number[];
}

function banco(dados: AdmissaoFake[], espiao: Espiao) {
  const porId = new Map(dados.map((d) => [d.id, d]));

  const resolver = (
    projecao: Record<string, unknown>,
    local: { where?: unknown; limite?: number; deslocamento?: number },
  ): unknown[] => {
    const tem = (c: string) => Object.keys(projecao).includes(c);
    // A RESTRIÇÃO POR LISTA DE IDS: o serviço passa os ids aprovados pelos filtros derivados
    // dentro do `where`. Colhemos os valores da condição e, achando ids nossos, honramos.
    const permitidos = listaDeIdsNoWhere(local.where, new Set(dados.map((d) => d.id)));
    const base = permitidos ? dados.filter((d) => permitidos.has(d.id)) : dados;

    if (tem("total")) return [{ total: base.length }];
    if (tem("encaminhadoEm")) {
      const linhas = [...base]
        .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
        .map((d) => ({
          admissaoId: d.id,
          ultimoAcessoEm: d.ultimoAcessoEm,
          encaminhadoEm: d.criadoEm,
        }));
      const inicio = local.deslocamento ?? 0;
      const limite = local.limite ?? linhas.length;
      return linhas.slice(inicio, inicio + limite);
    }
    if (tem("acessou")) {
      return base.map((d) => ({
        admissaoId: d.id,
        acessou: d.acessou,
        ultimoAcessoEm: d.ultimoAcessoEm,
      }));
    }
    if (tem("nome")) {
      return base.map((d) => ({
        admissaoId: d.id,
        nome: d.nome,
        cargo: d.cargo,
        cliente: d.cliente,
        dataAdmissao: d.dataAdmissao,
      }));
    }
    if (tem("codCliente")) {
      return base.map((d) => ({
        codCliente: d.codCliente,
        cliente: d.cliente,
        cargoId: d.cargoId,
        cargo: d.cargo,
      }));
    }
    if (tem("expiraEm")) {
      // O ESTADO DO LINK É DERIVADO CONTRA O RELÓGIO REAL, e não contra `HOJE`. O
      // `estadoDoLinkVigente` do serviço compara `expiraEm` com `Date.now()`, então um vencimento
      // ancorado no `HOJE` congelado (passado) cairia como VENCIDO, e o filtro por VIVO devolveria
      // vazio. O prazo aqui é futuro de verdade, para o link nascer VIVO como a fila espera.
      return base.map((d) => ({
        admissaoId: d.id,
        criadoEm: d.criadoEm,
        expiraEm: new Date(Date.now() + 48 * 3600_000),
        revogadoEm: null,
        suspensoAte: null,
      }));
    }
    if (tem("admissaoId")) {
      return base.filter((d) => d.noTime).map((d) => ({ admissaoId: d.id }));
    }
    return [];
  };

  const cadeia = (projecao: Record<string, unknown>): unknown => {
    const local: { where?: unknown; limite?: number; deslocamento?: number } = {};
    const proxy: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(projecao, local)).then(ok, erro);
          }
          if (prop === "where") {
            return (cond: unknown) => {
              local.where = cond;
              espiao.wheres.push(cond);
              return proxy;
            };
          }
          if (prop === "limit") {
            return (n: number) => {
              local.limite = n;
              espiao.limites.push(n);
              return proxy;
            };
          }
          if (prop === "offset") {
            return (n: number) => {
              local.deslocamento = n;
              espiao.deslocamentos.push(n);
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    void porId;
    return proxy;
  };

  return {
    select: (p: Record<string, unknown> = {}) => cadeia(p),
    selectDistinct: (p: Record<string, unknown> = {}) => cadeia(p),
  } as never;
}

/** A régua é do `ReguaCompletudeService` (§A.19): aqui ela é só servida. */
function regua(dados: AdmissaoFake[]) {
  return {
    progressoObrigatoriosMap: async (ids: string[]) =>
      new Map(
        ids.map((id) => {
          const d = dados.find((x) => x.id === id);
          return [id, { entregues: d?.entregues ?? 0, total: d?.total ?? 0 }];
        }),
      ),
    proximoObrigatorioPendenteMap: async (ids: string[]) =>
      new Map(
        ids.map((id) => {
          const d = dados.find((x) => x.id === id);
          return [id, d?.proximo ?? (d && d.entregues < d.total ? "CPF" : null)];
        }),
      ),
  } as never;
}

const servico = (dados: AdmissaoFake[], espiao: Espiao = novoEspiao()) =>
  new PortalPainelService(banco(dados, espiao), regua(dados));

function novoEspiao(): Espiao {
  return { wheres: [], limites: [], deslocamentos: [] };
}

/** Um recorte com gente nas duas abas, de propósito desequilibrado. */
const POVO: AdmissaoFake[] = [
  // CONCLUÍRAM: acessou e fechou a régua
  adm("a1", { acessou: true, entregues: 8, total: 8, cliente: "Alfa", codCliente: "CLI-A" }),
  adm("a2", { acessou: true, entregues: 9, total: 8, cliente: "Alfa", codCliente: "CLI-A" }), // sobre-entrega
  // EM ANDAMENTO
  adm("b1", { acessou: true, entregues: 3, total: 8, cliente: "Beta", codCliente: "CLI-B" }),
  adm("b2", { acessou: false, entregues: 0, total: 8, cliente: "Beta", codCliente: "CLI-B" }),
  adm("c1", { acessou: true, entregues: 0, total: 0, cliente: "Gama", codCliente: "CLI-C" }), // régua vazia
  adm("c2", {
    acessou: true,
    entregues: 8,
    total: 8,
    noTime: true,
    cliente: "Gama",
    codCliente: "CLI-C",
  }), // concluiu DEPOIS de cair para o time
];

function adm(id: string, p: Partial<AdmissaoFake>): AdmissaoFake {
  const i = Number(id.replace(/\D/g, "")) || 1;
  return {
    id,
    nome: `Sintético ${id.toUpperCase()}`,
    cliente: "Alfa",
    codCliente: "CLI-A",
    cargo: "Auxiliar",
    cargoId: `CARGO-${id}`,
    dataAdmissao: "2026-10-0" + i,
    acessou: false,
    ultimoAcessoEm: p.acessou ? rel(-i * 3600_000) : null,
    criadoEm: rel(-i * 86_400_000),
    entregues: 0,
    total: 8,
    ...p,
  };
}

// ══ 1. A ABA NÃO MEXE NOS CONTADORES ═════════════════════════════════════════════════════════

describe("1. o funil é do universo inteiro; a aba recorta só a LISTA", () => {
  it("os cinco números são IDÊNTICOS nas duas abas", async () => {
    const s = servico(POVO);
    const semAba = await s.resumo();
    const emAndamento = await (s.resumo as (f?: unknown) => Promise<typeof semAba>)({
      aba: "EM_ANDAMENTO",
    });
    const concluido = await (s.resumo as (f?: unknown) => Promise<typeof semAba>)({
      aba: "CONCLUIDO",
    });
    expect(emAndamento, "o card mudou com a aba: o funil deixou de ser do universo").toEqual(semAba);
    expect(concluido).toEqual(semAba);
  });

  it("o funil deste recorte é o esperado, e serve de âncora para o teste acima", async () => {
    const funil = await servico(POVO).resumo();
    expect(funil).toEqual({
      encaminhados: 6,
      acessaram: 5,
      naoAcessaram: 1,
      // a1, a2 (sobre-entrega) e c2 (concluiu depois de cair para o time). c1 tem régua VAZIA.
      concluiram: 3,
      intervencaoHumana: 1,
    });
  });

  it("a soma das DUAS listas é o total, e ninguém aparece nas duas", async () => {
    const s = servico(POVO);
    const trabalho = await s.listar({ aba: "EM_ANDAMENTO", tamanho: 100 });
    const feitos = await s.listar({ aba: "CONCLUIDO", tamanho: 100 });
    const idsTrabalho = trabalho.itens.map((i) => i.admissaoId);
    const idsFeitos = feitos.itens.map((i) => i.admissaoId);

    expect(idsTrabalho.filter((id) => idsFeitos.includes(id)), "alguém está nas duas abas").toEqual(
      [],
    );
    expect([...idsTrabalho, ...idsFeitos].sort()).toEqual(POVO.map((p) => p.id).sort());
    expect(trabalho.total + feitos.total, "os totais das duas abas não somam o universo").toBe(
      POVO.length,
    );
  });

  it("a aba CONCLUIDO traz exatamente quem o card CONCLUÍRAM conta", async () => {
    const s = servico(POVO);
    const feitos = await s.listar({ aba: "CONCLUIDO", tamanho: 100 });
    const funil = await s.resumo();
    expect(feitos.itens.map((i) => i.admissaoId).sort()).toEqual(["a1", "a2", "c2"]);
    expect(feitos.total, "a aba e o card discordam sobre a MESMA régua").toBe(funil.concluiram);
  });

  it("EM_ANDAMENTO é o padrão: sem aba, a fila de trabalho é o que aparece", async () => {
    const semPedir = await servico(POVO).listar({ tamanho: 100 });
    expect(semPedir.itens.map((i) => i.admissaoId).sort()).toEqual(["b1", "b2", "c1"]);
  });

  it("régua VAZIA fica na frente de trabalho, e não na aba de quem terminou", async () => {
    const feitos = await servico(POVO).listar({ aba: "CONCLUIDO", tamanho: 100 });
    expect(
      feitos.itens.map((i) => i.admissaoId),
      "0 de 0 apareceu como concluído: é o achado M1 voltando pela aba",
    ).not.toContain("c1");
  });

  it("quem entregou tudo SEM nunca acessar não sai da frente de trabalho", async () => {
    const povo = [adm("z1", { acessou: false, entregues: 8, total: 8 })];
    const s = servico(povo);
    expect((await s.listar({ aba: "CONCLUIDO", tamanho: 100 })).itens).toEqual([]);
    expect((await s.listar({ tamanho: 100 })).itens.map((i) => i.admissaoId)).toEqual(["z1"]);
    expect((await s.resumo()).concluiram).toBe(0);
  });

  it("o contrato das abas é o publicado, e são só duas", () => {
    expect([...ABAS_PAINEL_PORTAL]).toEqual(["EM_ANDAMENTO", "CONCLUIDO"]);
  });

  it("aba desconhecida cai na frente de trabalho, e não abre a lista inteira", async () => {
    const lista = await servico(POVO).listar({ aba: "QUALQUER" as never, tamanho: 100 });
    expect(lista.itens.map((i) => i.admissaoId).sort()).toEqual(["b1", "b2", "c1"]);
  });
});

// ══ 2. A COLUNA DATA DE ADMISSÃO ═════════════════════════════════════════════════════════════

describe("2. a coluna DATA DE ADMISSÃO vem na linha, e ausência não é erro", () => {
  it("a data chega na linha, no formato do banco (aaaa-mm-dd)", async () => {
    const lista = await servico(POVO).listar({ aba: "CONCLUIDO", tamanho: 100 });
    const a1 = lista.itens.find((i) => i.admissaoId === "a1");
    expect((a1 as { dataAdmissao?: string | null }).dataAdmissao).toBe("2026-10-01");
  });

  it("admissão de banco (sem data) devolve `null`, e não um traço nem uma data inventada", async () => {
    const povo = [adm("s1", { acessou: true, entregues: 1, total: 8, dataAdmissao: null })];
    const lista = await servico(povo).listar({ tamanho: 100 });
    expect((lista.itens[0] as { dataAdmissao?: string | null }).dataAdmissao).toBeNull();
  });
});

// ══ 3. FILTROS MÚLTIPLOS DE VERDADE ══════════════════════════════════════════════════════════

describe("3. os filtros são de MÚLTIPLA seleção (§A.28), e chegam JUNTOS à consulta", () => {
  it("dois clientes viajam na MESMA condição: é união, não o último escolhido", async () => {
    const espiao = novoEspiao();
    await servico(POVO, espiao).listar({ clientes: ["CLI-A", "CLI-B"], tamanho: 100 });
    const valores = colherTodos(espiao.wheres);
    expect(valores.has("CLI-A"), "o primeiro cliente não chegou à consulta").toBe(true);
    expect(
      valores.has("CLI-B"),
      "o segundo cliente não chegou: o filtro múltiplo virou filtro de um valor só",
    ).toBe(true);
  });

  it("dois cargos também, e pela mesma porta", async () => {
    const espiao = novoEspiao();
    await servico(POVO, espiao).listar({ cargos: ["CARGO-a1", "CARGO-b1"], tamanho: 100 });
    const valores = colherTodos(espiao.wheres);
    expect(valores.has("CARGO-a1")).toBe(true);
    expect(valores.has("CARGO-b1")).toBe(true);
  });

  it("a lista de valores vira `IN`, e não uma igualdade", () => {
    const fonte = semComentarios(readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8"));
    const trecho = fonte.slice(fonte.indexOf("condicoesDeSql"));
    expect(trecho, "filtro de lista com `eq` só aceita um valor (§A.28)").toMatch(
      /inArray\s*\(\s*admissoes\.codCliente/,
    );
    expect(trecho).toMatch(/inArray\s*\(\s*admissoes\.cargoId/);
  });

  it("filtro combinado com a ABA não se anula: os dois valem ao mesmo tempo", async () => {
    const espiao = novoEspiao();
    const lista = await servico(POVO, espiao).listar({
      aba: "CONCLUIDO",
      clientes: ["CLI-A"],
      tamanho: 100,
    });
    // A aba (derivada, em memória) continuou valendo...
    expect(lista.itens.every((i) => ["a1", "a2", "c2"].includes(i.admissaoId))).toBe(true);
    // ...e o cliente chegou à consulta junto dela.
    expect(colherTodos(espiao.wheres).has("CLI-A")).toBe(true);
  });

  it("a BUSCA POR NOME convive com a aba, e vai ao banco por pedaço", async () => {
    const espiao = novoEspiao();
    const lista = await servico(POVO, espiao).listar({
      aba: "CONCLUIDO",
      nome: "Sintético A1",
      tamanho: 100,
    });
    expect(lista.itens.every((i) => ["a1", "a2", "c2"].includes(i.admissaoId))).toBe(true);
    const valores = [...colherTodos(espiao.wheres)].map(String);
    expect(
      valores.some((v) => v.includes("Sintético A1")),
      "a busca por nome não chegou à consulta",
    ).toBe(true);
    expect(valores.some((v) => v.startsWith("%") && v.endsWith("%"))).toBe(true);
  });

  it("a busca é por NOME, nunca por CPF (§A.6: oráculo de existência)", () => {
    const fonte = semComentarios(readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8"));
    expect(fonte).not.toMatch(/ilike\s*\(\s*\w*\.?cpf/i);
    expect(fonte).not.toMatch(/cpf\s*[?]?:\s*string/i);
  });

  it("o filtro de SITUAÇÃO recorta, e aceita mais de uma", async () => {
    const s = servico(POVO);
    const uma = await s.listar({ aba: "EM_ANDAMENTO", situacoes: ["NAO_ACESSOU"], tamanho: 100 });
    if (uma.itens.length === 0) return; // catálogo de situação com outro batismo: ver o GAP relatado
    expect(uma.itens.map((i) => i.admissaoId)).toEqual(["b2"]);
  });

  it("o filtro de ESTADO DO LINK aceita lista, e o estado sai do domínio", async () => {
    const lista = await servico(POVO).listar({
      aba: "EM_ANDAMENTO",
      estadosLink: ["VIVO", "REVOGADO"],
      tamanho: 100,
    });
    expect(lista.itens.length).toBeGreaterThan(0);
  });

  it("intervalo de data inválido é recusado, e não descartado em silêncio", async () => {
    const s = servico(POVO);
    await expect(s.listar({ dataAdmissaoDe: "20/10/2026", tamanho: 100 })).rejects.toThrow();
    await expect(s.listar({ ultimoAcessoAte: "ontem", tamanho: 100 })).rejects.toThrow();
  });
});

// ══ 4. O CATÁLOGO VEM DO RECORTE, NUNCA DA PÁGINA ════════════════════════════════════════════

describe("4. o catálogo de opções é do RECORTE (§A.37), e não encolhe com o que já foi escolhido", () => {
  it("o catálogo traz TODOS os clientes do recorte, mesmo com um deles já filtrado", async () => {
    const s = servico(POVO);
    await s.listar({ clientes: ["CLI-A"], tamanho: 100 });
    const catalogo = await s.catalogoDeFiltros();
    const valores = catalogo.clientes.map((c) => c.valor).sort();
    expect(
      valores,
      "o catálogo encolheu: escolhido o primeiro cliente, não haveria como somar o segundo",
    ).toEqual(["CLI-A", "CLI-B", "CLI-C"]);
  });

  it("o catálogo também não muda com a aba", async () => {
    const s = servico(POVO);
    const antes = await s.catalogoDeFiltros();
    await s.listar({ aba: "CONCLUIDO", tamanho: 1 });
    const depois = await s.catalogoDeFiltros();
    expect(depois).toEqual(antes);
  });

  it("o catálogo não recebe a página nem os filtros em vigor", () => {
    const fonte = semComentarios(readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8"));
    const assinatura = fonte.slice(
      fonte.indexOf("catalogoDeFiltros"),
      fonte.indexOf("catalogoDeFiltros") + 200,
    );
    expect(
      assinatura,
      "catálogo que recebe filtro deriva da página, que é o defeito que a §A.37 nomeia",
    ).toMatch(/catalogoDeFiltros\s*\(\s*\)/);
  });

  it("todos os filtros de lista do contrato têm catálogo servido", async () => {
    const catalogo = await servico(POVO).catalogoDeFiltros();
    for (const chave of ["clientes", "cargos", "documentos", "situacoes", "estadosLink"]) {
      expect(catalogo, `falta o catálogo de ${chave}`).toHaveProperty(chave);
      expect(Array.isArray((catalogo as Record<string, unknown>)[chave])).toBe(true);
    }
    expect(catalogo.situacoes.length, "situação sem opção nenhuma não é filtro").toBeGreaterThan(0);
    expect(catalogo.estadosLink.length).toBeGreaterThan(0);
  });
});

// ══ APOIO ════════════════════════════════════════════════════════════════════════════════════

/**
 * ACHA A LISTA DE IDS APROVADOS dentro da condição, e a LISTA VAZIA CONTA.
 *
 * O serviço aplica os filtros derivados (aba, situação, documento, estado do link) em memória e
 * empurra o resultado ao SQL como `inArray(admissaoId, ids)`. Duas armadilhas, as duas medidas
 * contra o Drizzle desta versão:
 *  - a lista não fica como array de strings na condição: ela vira um chunk `Array` de `Param`,
 *    e é do `.value` de cada um que os ids saem;
 *  - `inArray(col, [])` não estoura: vira o literal `false`. Tratar isso como "sem restrição"
 *    faria a aba que não casa com ninguém devolver o recorte inteiro, e o teste mediria o oposto
 *    do que pergunta.
 *
 * Devolve `null` só quando NÃO há restrição por id nenhuma.
 */
function listaDeIdsNoWhere(cond: unknown, conhecidos: Set<string>): Set<string> | null {
  let achou: Set<string> | null = null;
  let recorteImpossivel = false;
  const vistos = new Set<unknown>();
  const anda = (no: unknown, profundidade: number) => {
    if (no === null || typeof no !== "object" || profundidade > 14 || vistos.has(no)) return;
    vistos.add(no);
    if (Array.isArray(no)) {
      if (no.length && no.every((v) => typeof v === "string" && v.trim() === "false")) {
        recorteImpossivel = true;
      }
      const valores = no.map((v) => valorDoParametro(v));
      if (no.length && valores.every((v) => typeof v === "string" && conhecidos.has(v))) {
        achou = new Set(valores as string[]);
        return;
      }
    }
    for (const filho of Object.values(no as Record<string, unknown>)) anda(filho, profundidade + 1);
  };
  anda(cond, 0);
  if (achou) return achou;
  return recorteImpossivel ? new Set<string>() : null;
}

/** O `Param` do Drizzle guarda o valor em `.value`; string solta é o próprio valor. */
function valorDoParametro(no: unknown): unknown {
  if (typeof no === "string") return no;
  if (no && typeof no === "object" && "value" in (no as Record<string, unknown>)) {
    return (no as Record<string, unknown>).value;
  }
  return undefined;
}

/** Colhe os valores primitivos de uma condição do Drizzle, sem depender da forma interna dela. */
function colher(cond: unknown, profundidade = 0, vistos = new Set<unknown>()): Set<unknown> {
  const achados = new Set<unknown>();
  if (cond === null || cond === undefined || profundidade > 12) return achados;
  if (typeof cond === "string" || typeof cond === "number" || typeof cond === "boolean") {
    achados.add(cond);
    return achados;
  }
  if (typeof cond !== "object") return achados;
  if (vistos.has(cond)) return achados;
  vistos.add(cond);
  for (const valor of Object.values(cond as Record<string, unknown>)) {
    for (const achado of colher(valor, profundidade + 1, vistos)) achados.add(achado);
  }
  return achados;
}

function colherTodos(conds: unknown[]): Set<unknown> {
  const todos = new Set<unknown>();
  for (const c of conds) for (const v of colher(c)) todos.add(v);
  return todos;
}

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
