import { describe, expect, it } from "vitest";
import {
  MENUS,
  MENUS_COMUM_HOJE,
  TODOS_CODIGOS_MENU,
  codigosGrandfather,
  menuDaOperacao,
} from "./menus";

describe("registro de menus", () => {
  it("códigos são únicos", () => {
    expect(new Set(TODOS_CODIGOS_MENU).size).toBe(TODOS_CODIGOS_MENU.length);
  });

  it("todo menu tem rótulo, rota e grupo válido", () => {
    for (const m of MENUS) {
      expect(m.rotulo.length).toBeGreaterThan(0);
      expect(m.href.startsWith("/")).toBe(true);
      expect(["OPERACAO", "ADMIN"]).toContain(m.grupo);
    }
  });
});

describe("mapa operação -> menu", () => {
  it("coringa Controller.* reivindica qualquer handler daquela controller", () => {
    // regua reivindica ReguaController.* e TiposDocumentoController.*
    expect(menuDaOperacao("ReguaController", "upsert")).toBe("regua");
    expect(menuDaOperacao("TiposDocumentoController", "remove")).toBe("regua");
  });

  it("handler exato tem precedência de reivindicação", () => {
    expect(menuDaOperacao("AdmissoesController", "create")).toBe("nova");
    expect(menuDaOperacao("AdmissoesController", "editar")).toBe("gerenciador");
    expect(menuDaOperacao("AdmissoesController", "liberar")).toBe("liberacao");
  });

  it("operação NÃO reivindicada devolve null (rota ABERTA, régua de leitura preservada)", () => {
    // leitura de catálogo / leitura compartilhada
    expect(menuDaOperacao("ClientesController", "list")).toBeNull();
    expect(menuDaOperacao("CatalogosController", "clientes")).toBeNull();
    expect(menuDaOperacao("AdmissoesController", "listar")).toBeNull();
    expect(menuDaOperacao("AuthController", "me")).toBeNull();
  });

  it("a tela de USUÁRIOS não é reivindicada por menu (segue sob @Roles admin, Bloco 4)", () => {
    expect(menuDaOperacao("UsersController", "listar")).toBeNull();
    expect(menuDaOperacao("UsersController", "definirMenus")).toBeNull();
  });

  it("ações restritas seguem fora do menu (continuam @Roles admin)", () => {
    expect(menuDaOperacao("AdmissoesController", "recusar")).toBeNull();
    expect(menuDaOperacao("AdmissoesController", "deletar")).toBeNull();
    expect(menuDaOperacao("NaoConformidadesController", "decidirLiberacao")).toBeNull();
  });
});

describe("grandfather da migração (Bloco 5): reproduz o acesso de hoje, papel a papel", () => {
  it("COMUM recebe os menus de operação, SEM administração e SEM gerador de kit", () => {
    const c = codigosGrandfather("COMUM");
    expect(c).toEqual(MENUS_COMUM_HOJE);
    expect(c).toContain("esteira");
    expect(c).toContain("liberacao");
    expect(c).not.toContain("gerador-kit");
    expect(c).not.toContain("clientes");
    expect(c).not.toContain("usuarios");
  });

  it("dar 'todos' a um COMUM seria escalonar privilégio: o grandfather NÃO faz isso", () => {
    expect(codigosGrandfather("COMUM").length).toBeLessThan(TODOS_CODIGOS_MENU.length);
  });

  it("MASTER e SUPER_ADMIN recebem todos (coerência de tela; o guard já os libera por bypass)", () => {
    expect(codigosGrandfather("MASTER")).toEqual(TODOS_CODIGOS_MENU);
    expect(codigosGrandfather("SUPER_ADMIN")).toEqual(TODOS_CODIGOS_MENU);
  });
});
