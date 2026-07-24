import { describe, expect, it } from "vitest";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_PADRAO_COMUM,
  TODOS_CODIGOS_MENU,
  codigosPadraoDoPapel,
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

  it("Gerador de kit: as 5 operações da tela caem TODAS no menu gerador-kit", () => {
    for (const h of ["processar", "statusProcessar", "downloadFuncionario", "reimportar", "downloadZip"]) {
      expect(menuDaOperacao("KitController", h)).toBe("gerador-kit");
    }
  });

  it("kit-tipos: a LISTA (dropdown do Gerador de kit) é ABERTA; só as escritas são gated por kit-regras", () => {
    expect(menuDaOperacao("KitTiposController", "list")).toBeNull(); // dropdown do Gerador de kit
    expect(menuDaOperacao("KitTiposController", "criar")).toBe("kit-regras");
    expect(menuDaOperacao("KitTiposController", "atualizar")).toBe("kit-regras");
    expect(menuDaOperacao("KitTiposController", "remover")).toBe("kit-regras");
  });
});

describe("padrão do papel (decisão do diretor 24/07/2026): COMUM enxerga toda a Operação", () => {
  it("COMUM recebe TODOS os menus de Operação, INCLUINDO o Gerador de kit, e NENHUM de Administração", () => {
    const c = codigosPadraoDoPapel("COMUM");
    expect(c).toEqual(MENUS_PADRAO_COMUM);
    // padrão = exatamente o grupo OPERACAO.
    expect([...c].sort()).toEqual(
      MENUS.filter((m) => m.grupo === "OPERACAO")
        .map((m) => m.codigo)
        .sort(),
    );
    expect(c).toContain("esteira");
    expect(c).toContain("liberacao");
    expect(c).toContain("gerador-kit"); // a inversão desta OST
    expect(c).not.toContain("clientes"); // Administração fica fora do padrão
    expect(c).not.toContain("usuarios");
  });

  it("padrão do COMUM não inclui nenhum menu de Administração (concessão pontual)", () => {
    const c = new Set(codigosPadraoDoPapel("COMUM"));
    for (const m of MENUS) if (m.grupo === "ADMIN") expect(c.has(m.codigo)).toBe(false);
    expect(codigosPadraoDoPapel("COMUM").length).toBeLessThan(TODOS_CODIGOS_MENU.length);
  });

  it("Diagnóstico e Usuários são bloqueados para COMUM (são @Roles admin-only)", () => {
    expect(MENUS_BLOQUEADOS_COMUM.has("diagnostico")).toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has("usuarios")).toBe(true);
    // e não estão no padrão (padrão é só Operação).
    for (const b of MENUS_BLOQUEADOS_COMUM) expect(codigosPadraoDoPapel("COMUM")).not.toContain(b);
  });

  it("MASTER e SUPER_ADMIN recebem todos (coerência de tela; o guard já os libera por bypass)", () => {
    expect(codigosPadraoDoPapel("MASTER")).toEqual(TODOS_CODIGOS_MENU);
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toEqual(TODOS_CODIGOS_MENU);
  });
});
