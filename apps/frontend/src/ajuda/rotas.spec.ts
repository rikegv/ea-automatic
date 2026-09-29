/**
 * Testes das duas funções puras de rota. A derivação das telas do sistema mora aqui, e não na casca
 * que varre o disco, justamente para ter estes casos: grupo de rota do Next e segmento dinâmico são
 * os dois jeitos de o detector medir uma tela que ninguém abre.
 */
import { describe, expect, it } from "vitest";
import {
  ROTAS_FORA_DA_ENUMERACAO,
  ROTAS_PUBLICAS,
  artigosDaRotaEm,
  ehRotaPublica,
  rotasDeArquivosDePagina,
} from "./rotas";
import type { Artigo } from "./tipos";

function artigo(slug: string, rotas: string[]): Artigo {
  return {
    slug,
    titulo: "t",
    modulo: "SOUL_ADM",
    rotas,
    menus: [],
    publico: "AMBOS",
    nivel: "N1",
    resumo: "r",
    termos: [],
    preRequisitos: [],
    passos: [],
    seDerErrado: [],
    regras: [],
    relacionados: [],
    fontes: [],
    revisadoEm: "2026-09-28",
  };
}

describe("rotasDeArquivosDePagina", () => {
  it("tira o grupo de rota do Next, que organiza o disco e não entra na URL", () => {
    expect(rotasDeArquivosDePagina(["(app)/gerenciador/page.tsx"])).toEqual(["/gerenciador"]);
    expect(rotasDeArquivosDePagina(["/(app)/admin/as/segmentos/page.tsx"])).toEqual([
      "/admin/as/segmentos",
    ]);
  });

  it("descarta segmento dinâmico: enumerar `[slug]` exigiria inventar um valor", () => {
    expect(rotasDeArquivosDePagina(["(app)/ajuda/[slug]/page.tsx"])).toEqual([]);
  });

  it("a raiz do grupo vira a raiz do sistema", () => {
    expect(rotasDeArquivosDePagina(["(app)/page.tsx"])).toEqual(["/"]);
  });

  it("aplica a lista declarada de telas fora da enumeração, e cada uma tem motivo escrito", () => {
    expect(rotasDeArquivosDePagina(["login/page.tsx", "(app)/esteira/page.tsx"])).toEqual(["/esteira"]);
    expect(ROTAS_FORA_DA_ENUMERACAO.every((f) => f.motivo.trim().length > 20)).toBe(true);
  });
});

describe("artigosDaRotaEm", () => {
  it("a rota exata ganha do prefixo, para a tela filha não herdar o artigo do pai", () => {
    const artigos = [artigo("pai", ["/diretoria"]), artigo("filha", ["/diretoria/alto-volume"])];
    expect(artigosDaRotaEm(artigos, "/diretoria/alto-volume").map((a) => a.slug)).toEqual(["filha"]);
  });

  it("sem rota exata, casa por prefixo", () => {
    const artigos = [artigo("pai", ["/admin"])];
    expect(artigosDaRotaEm(artigos, "/admin/cargos").map((a) => a.slug)).toEqual(["pai"]);
  });

  it("a barra final não muda o casamento, dos dois lados", () => {
    const artigos = [artigo("a", ["/esteira/"])];
    expect(artigosDaRotaEm(artigos, "/esteira").map((a) => a.slug)).toEqual(["a"]);
    expect(artigosDaRotaEm([artigo("b", ["/esteira"])], "/esteira/").map((a) => a.slug)).toEqual(["b"]);
  });

  it("a raiz não vira prefixo de tudo", () => {
    expect(artigosDaRotaEm([artigo("raiz", ["/"])], "/gerenciador")).toEqual([]);
  });
});

describe("ehRotaPublica: a tela que existe para quem ainda não entrou", () => {
  it("reconhece as quatro rotas públicas, e a etapa filha herda o regime", () => {
    expect(ehRotaPublica("/login")).toBe(true);
    expect(ehRotaPublica("/trocar-senha")).toBe(true);
    expect(ehRotaPublica("/portal")).toBe(true);
    expect(ehRotaPublica("/portal/documentos")).toBe(true);
    expect(ehRotaPublica("/vt")).toBe(true);
  });

  it("é FAIL-CLOSED para o lado que importa: tela interna nunca é pública", () => {
    // Tratar tela interna como pública produziria print do LOGIN dentro do artigo da tela.
    for (const interna of ["/", "/esteira", "/gerenciador", "/admin/clientes", "/as/vagas"]) {
      expect(ehRotaPublica(interna)).toBe(false);
    }
  });

  it("não casa por pedaço de nome: `/vtx` não é `/vt`", () => {
    expect(ehRotaPublica("/vtx")).toBe(false);
    expect(ehRotaPublica("/portal-links")).toBe(false);
  });

  it("cada rota pública tem motivo escrito", () => {
    expect(ROTAS_PUBLICAS.every((p) => p.motivo.trim().length > 20)).toBe(true);
  });
});
