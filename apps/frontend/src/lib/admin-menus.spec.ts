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

/**
 * A TELA DE USUÁRIOS ESCONDIDA DE QUEM NÃO É SUPER_ADMIN (decisão do diretor).
 *
 * Quem faz o corte é o BACKEND: o `/auth/me` deixou de mandar `usuarios` na lista de quem não é
 * SUPER_ADMIN, e a tela só desenha o que a lista traz. O risco que estes testes travam é o efeito
 * colateral, não a regra: perder UM menu administrativo não pode fechar a porta da camada inteira.
 */
describe("Usuários fora da lista: a camada de administração continua aberta", () => {
  /** Master de hoje: todos os menus administrativos MENOS `usuarios`. */
  const temMenuMaster = (c: string) => ADMIN_MENUS.includes(c as never) && c !== "usuarios";

  it("o Master que perdeu só `usuarios` continua entrando na administração", () => {
    expect(podeAbrirAdministracao(temMenuMaster)).toBe(true);
    // E o card de Usuários some, porque a tela filtra por `temMenu`.
    expect(temMenuMaster("usuarios")).toBe(false);
  });

  it("quem tem SÓ `usuarios` (o Super Admin, na prática) abre a administração", () => {
    expect(podeAbrirAdministracao((c) => c === "usuarios")).toBe(true);
  });

  it("`usuarios` continua na lista de menus que abrem a camada", () => {
    // Tirá-lo daqui faria o Super Admin sem outro menu administrativo perder a própria porta.
    expect([...ADMIN_MENUS]).toContain("usuarios");
  });
});
