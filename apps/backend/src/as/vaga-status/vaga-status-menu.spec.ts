import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../../domain/menus";
import { VagaStatusAdminController } from "./vaga-status-admin.controller";
import { VagaStatusController } from "./vaga-status.controller";

/**
 * ─ A LINHA QUE SEPARA A LEITURA DO CATÁLOGO DA ESCRITA DELE, AFIRMADA HANDLER A HANDLER ─────────
 *
 * ┌─ POR QUE ESTE TESTE EXISTE, e ele guarda os DOIS lados de um erro simétrico ──────────────────┐
 * │ O `MenuGuard` resolve por NOME DE CLASSE (`menuDaOperacao`), e o default de uma operação NÃO   │
 * │ REIVINDICADA é PASSAR. Então os dois erros custam caro e nenhum dos dois falha sozinho:        │
 * │                                                                                                │
 * │   . REIVINDICAR A LEITURA (uma classe só, com `.*`) fecharia o `GET /as/status-vaga` junto com │
 * │     a administração, e a Central de Vagas inteira (a pill de status, o filtro, o seletor do    │
 * │     movimento manual) daria 403 para quem apenas precisa SABER quais status existem.           │
 * │   . NÃO REIVINDICAR A ESCRITA a deixaria ABERTA no MenuGuard. Aqui ela ainda estaria fechada   │
 * │     pelo `@Roles("SUPER_ADMIN")`, e é por isso que o teste afirma AS DUAS COISAS: a camada de  │
 * │     papel e a camada de menu, cada uma pelo seu motivo, nenhuma dependendo de a outra estar    │
 * │     certa.                                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MENU SOZINHO NÃO SEGURA O MASTER, e é isso que torna o `@Roles` obrigatório em vez de zelo:
 * `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu, e há MASTER na área AS em
 * produção. AQUI ISSO PESA MAIS DO QUE NOS OUTROS DOIS CATÁLOGOS DE A&S: as etapas e os motivos de
 * cancelamento são TEXTO, e este é TRAVA. Ligar `recebeCandidato` num status terminal devolve
 * alocação a vaga encerrada; desligar `movivelManualmente` no status de ABERTURA transforma em zumbi
 * toda vaga que estiver num status do diretor.
 */
describe("status da vaga: a leitura é aberta, a escrita é do SUPER_ADMIN", () => {
  const LEITURA = ["listar"] as const;
  const ESCRITA = ["criar", "atualizar", "inativar", "reativar", "remover"] as const;

  it("a LEITURA não é reivindicada por menu nenhum (senão a Central de Vagas dá 403)", () => {
    for (const op of LEITURA) {
      expect(menuDaOperacao("VagaStatusController", op), `VagaStatusController.${op}`).toBeNull();
    }
  });

  it("a leitura NÃO tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagaStatusController)).toBeUndefined();
    const proto = VagaStatusController.prototype as unknown as Record<string, object>;
    for (const op of LEITURA) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `VagaStatusController.${op}`).toBeUndefined();
    }
  });

  it("TODA operação de ESCRITA resolve para o menu `as-status-vaga`", () => {
    for (const op of ESCRITA) {
      expect(
        menuDaOperacao("VagaStatusAdminController", op),
        `VagaStatusAdminController.${op}`,
      ).toBe("as-status-vaga");
    }
  });

  /**
   * A AUTORIDADE. O menu decide se o card aparece; quem tranca a porta é o papel, e ele está na
   * CLASSE, então operação nova nasce fechada em vez de depender de alguém lembrar do decorator.
   */
  it('a escrita é @Roles("SUPER_ADMIN") na CLASSE, cobrindo inclusive rota que ainda não existe', () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagaStatusAdminController)).toEqual(["SUPER_ADMIN"]);
  });

  it("o menu `as-status-vaga` existe, nasce só para o SUPER_ADMIN e não é concedível a COMUM (§A.23)", () => {
    const menu = MENUS.find((m) => m.codigo === "as-status-vaga");
    expect(
      menu,
      "o menu precisa existir no registro para ser selecionável na tela de liberação (caso `clinicas`, 29/07)",
    ).toBeDefined();
    expect(menu?.areas, 'sem `areas: ["AS"]` o menu nasce em ADM e some para o time de A&S').toEqual([
      "AS",
    ]);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-status-vaga")).toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-status-vaga")).toBe(true);
  });

  /**
   * NENHUMA OUTRA CLASSE PODE REIVINDICAR ESTAS DUAS. Um menu novo que resolvesse por engano a
   * leitura (por exemplo com `VagaStatusController.*`) não quebraria nada em desenvolvimento e daria
   * 403 na Central de Vagas do consultor, que é o modo de falha caro desta frente.
   */
  it("só o menu `as-status-vaga` reivindica a administração, e ninguém reivindica a leitura", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    expect(reivindicam("VagaStatusAdminController")).toEqual(["as-status-vaga"]);
    expect(reivindicam("VagaStatusController")).toEqual([]);
  });

  /**
   * A ROTA DA LEITURA NÃO PODE CAIR DENTRO DA ADMINISTRAÇÃO POR ACIDENTE DE CAMINHO. As duas
   * controllers têm prefixos diferentes de propósito (`as/status-vaga` e `admin/as/status-vaga`), e
   * um dia em que alguém "arrumasse" a leitura para `admin/...` a poria atrás de qualquer proxy ou
   * regra que trate o prefixo administrativo como área fechada.
   */
  it("os prefixos das duas rotas são diferentes, e o da leitura não é o administrativo", () => {
    const caminho = (c: object) => Reflect.getMetadata("path", c) as string;
    expect(caminho(VagaStatusController)).toBe("as/status-vaga");
    expect(caminho(VagaStatusAdminController)).toBe("admin/as/status-vaga");
  });
});
