import { describe, expect, it } from "vitest";
import { ADMIN_MENUS, podeAbrirAdministracao } from "./admin-menus";

/**
 * ACESSO À CAMADA DE ADMINISTRAÇÃO: uma lista só, e `assinante-empresa` dentro dela.
 *
 * O incidente: a tela "Assinante Da Empresa" saiu do Menu Gerencial quando o menu mudou de grupo, e
 * um COMUM com o menu liberado passou a ver o item na barra, clicar e cair em "Acesso Restrito". A
 * lista que governa isso estava COPIADA em dois arquivos, então bastava atualizar um e esquecer o
 * outro para o sistema oferecer uma porta e bater com ela.
 */

describe("ADMIN_MENUS: lista única de quem abre a camada /admin", () => {
  it("inclui `assinante-empresa` (a tela vive sob /admin, mesmo com o menu em Operação)", () => {
    expect([...ADMIN_MENUS]).toContain("assinante-empresa");
  });

  it("quem tem SÓ o menu de assinante da empresa consegue abrir a administração", () => {
    const temMenu = (c: string) => c === "assinante-empresa";
    expect(podeAbrirAdministracao(temMenu)).toBe(true);
  });

  it("quem não tem nenhum menu administrativo continua de fora", () => {
    const temMenu = (c: string) => ["inicio", "esteira", "gerenciador"].includes(c);
    expect(podeAbrirAdministracao(temMenu)).toBe(false);
  });

  it("não tem código repetido (era o risco das duas cópias)", () => {
    expect(new Set(ADMIN_MENUS).size).toBe(ADMIN_MENUS.length);
  });
});
