import { describe, expect, it } from "vitest";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_PADRAO_COMUM,
  menuDaOperacao,
} from "../domain/menus";
import { ROLES_KEY } from "../auth/decorators";

/**
 * A PORTA SEM PLACA (item 2 da OST de finalização do INT-4).
 *
 * O levantamento de 28/07 achou o buraco: a tela `/kit` saiu do menu (§A.15) mas continuou
 * alcançável por URL, e `KitController.gerar` não era reivindicado por menu nenhum, então o
 * `MenuGuard` deixava QUALQUER autenticado criar envelope de assinatura. Estes testes travam a
 * correção: a operação passa a pertencer ao menu novo, e quem não tem o menu é barrado.
 */
describe("Gerenciamento de assinatura — governança da criação de envelope", () => {
  it("KitController.gerar passou a ser GOVERNADO pelo menu de assinaturas", () => {
    expect(menuDaOperacao("KitController", "gerar")).toBe("assinaturas");
  });

  it("as 4 operações da tela de assinatura exigem o menu", () => {
    // `solicitar` (upload) deu lugar a `dispararLote` quando o modal foi eliminado: o kit passou a
    // vir anexado pelo Gerador de Kit e o disparo virou ação em massa.
    for (const op of ["listar", "dispararLote", "cancelar", "reenviarCorrecao"]) {
      expect(menuDaOperacao("ClicksignController", op)).toBe("assinaturas");
    }
  });

  it("o tick interno NÃO é assunto de menu (é @Public + InternalTokenGuard)", () => {
    expect(menuDaOperacao("ClicksignController", "tick")).toBeNull();
  });

  it("KitController.download segue ABERTO de propósito (token de uso imediato, compartilhado com a Esteira)", () => {
    // Reivindicá-lo quebraria o reenvio disparado do modal da Esteira para quem não tem este menu.
    expect(menuDaOperacao("KitController", "download")).toBeNull();
  });

  it("o Gerador de kit novo NÃO foi capturado por este menu (segue no menu dele)", () => {
    expect(menuDaOperacao("KitController", "processar")).toBe("gerador-kit");
    expect(menuDaOperacao("KitController", "downloadZip")).toBe("gerador-kit");
  });

  it("o menu existe no registro, é de OPERAÇÃO e entra no padrão do COMUM", () => {
    const menu = MENUS.find((m) => m.codigo === "assinaturas");
    expect(menu).toBeDefined();
    expect(menu?.grupo).toBe("OPERACAO");
    expect(menu?.href).toBe("/assinaturas");
    expect(MENUS_PADRAO_COMUM).toContain("assinaturas");
  });

  it("nenhum outro menu disputa as operações de assinatura (uma operação, um dono)", () => {
    const donos = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith("ClicksignController.")),
    );
    expect(donos.map((m) => m.codigo)).toEqual(["assinaturas"]);
  });
});

/**
 * ASSINANTE DA EMPRESA LIBERADO PARA O COMUM (decisão do diretor, §A.23).
 *
 * A armadilha que estes testes travam é a mesma que derrubou o Gerador de Kit: o `RolesGuard` roda
 * ANTES do `MenuGuard`, então um `@Roles("MASTER","SUPER_ADMIN")` na controller faz o menu APARECER e
 * toda operação tomar 403. Mover o menu de grupo sem tirar o `@Roles` não libera nada.
 */
describe("Assinante Da Empresa: acesso do COMUM", () => {
  it("o menu está em OPERAÇÃO, não em Administração", () => {
    const menu = MENUS.find((m) => m.codigo === "assinante-empresa");
    expect(menu).toBeDefined();
    expect(menu?.grupo).toBe("OPERACAO");
  });

  it("entra no padrão do COMUM (que é exatamente o grupo Operação)", () => {
    expect(MENUS_PADRAO_COMUM).toContain("assinante-empresa");
  });

  it("não está entre os menus proibidos ao COMUM", () => {
    expect(MENUS_BLOQUEADOS_COMUM.has("assinante-empresa")).toBe(false);
  });

  /**
   * O teste que importa de verdade: a controller NÃO pode carregar `@Roles`. Lemos a metadata real do
   * decorator, então este teste quebra se alguém reintroduzir a restrição por papel.
   */
  it("a controller NÃO tem @Roles (senão o COMUM tomaria 403 antes do menu ser consultado)", async () => {
    const { AssinanteEmpresaController } = await import(
      "../admin/assinante-empresa/assinante-empresa.controller"
    );
    const papeis = Reflect.getMetadata(ROLES_KEY, AssinanteEmpresaController);
    expect(papeis).toBeUndefined();
  });

  /** TODAS as operações da tela: se alguma escapar do menu, ela fica aberta ou barrada por engano. */
  it("todas as operações da tela são governadas pelo menu (leitura E escrita)", () => {
    for (const op of ["list", "salvarConjunto", "remove"]) {
      expect(menuDaOperacao("AssinanteEmpresaController", op)).toBe("assinante-empresa");
    }
  });
});
