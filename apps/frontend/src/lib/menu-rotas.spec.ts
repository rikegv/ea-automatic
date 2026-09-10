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

  /**
   * ─ O GERENCIADOR DE ETAPAS, E POR QUE ESTE CASO TEM TESTE PRÓPRIO ────────────────────────────
   *
   * A LEITURA DO CATÁLOGO DE ETAPAS É ABERTA a qualquer autenticado (`GET /as/etapas`), porque a
   * pill da etapa aparece na tela do consultor. Isso torna esta tela o caso em que ESQUECER a linha
   * do guard dói mais: sem ela, qualquer autenticado digita a URL, a tela ABRE e RENDERIZA o funil
   * inteiro com a leitura aberta, e o 403 só chega ao clicar em salvar. A tela ensina o que existe
   * antes de recusar. Os comentários de `menu-rotas.ts` registram esse mesmo esquecimento em três
   * telas anteriores; aqui ele quebra o gate em vez de chegar em produção.
   */
  it("o gerenciador de etapas do funil é governado por `as-etapas`, inclusive em subrota", () => {
    expect(menuDaRota("/admin/as/etapas")).toBe("as-etapas");
    expect(menuDaRota("/admin/as/etapas/qualquer/coisa")).toBe("as-etapas");
  });

  /**
   * `/admin/as/etapas` e `/as/candidatos` compartilham o segmento "as", em posições diferentes. O
   * guard casa por PREFIXO, então uma linha escrita como `/as` engoliria a outra em silêncio.
   */
  it("a tela de admin de A&S não é confundida com as telas de operação de A&S", () => {
    expect(menuDaRota("/as/vagas")).toBe("as-vagas");
    expect(menuDaRota("/as/candidatos")).toBe("as-candidatos");
    expect(menuDaRota("/admin/as/etapas")).not.toBe("as-candidatos");
    expect(menuDaRota("/admin/as/etapas")).not.toBe("as-vagas");
  });

  it("rota não governada por menu devolve null (home, raiz do admin, sessão)", () => {
    expect(menuDaRota("/")).toBeNull();
    expect(menuDaRota("/admin")).toBeNull();
    expect(menuDaRota("/trocar-senha")).toBeNull();
  });
});
