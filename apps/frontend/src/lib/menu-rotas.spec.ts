import { describe, expect, it } from "vitest";
import { menuDaRota } from "./menu-rotas";

describe("menuDaRota (guard de rota do front, OST permissão de menu)", () => {
  it("casa a tela pela rota, inclusive subrotas", () => {
    expect(menuDaRota("/admin/regras")).toBe("regras");
    expect(menuDaRota("/admin/regua")).toBe("regua");
    expect(menuDaRota("/esteira")).toBe("esteira");
    expect(menuDaRota("/esteira/qualquer/coisa")).toBe("esteira");
  });

  it("prefixos mais específicos não são engolidos por parecidos", () => {
    // /admin/regras e /admin/regua começam igual; cada um casa o seu.
    expect(menuDaRota("/admin/regras")).toBe("regras");
    expect(menuDaRota("/admin/regua")).toBe("regua");
  });

  it("rota não governada por menu devolve null (home, raiz do admin, sessão)", () => {
    expect(menuDaRota("/")).toBeNull();
    expect(menuDaRota("/admin")).toBeNull();
    expect(menuDaRota("/trocar-senha")).toBeNull();
  });
});
