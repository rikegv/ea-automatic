import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../../domain/menus";
import { LinhasServicoAdminController } from "./linhas-servico-admin.controller";
import { LinhasServicoController } from "./linhas-servico.controller";

/**
 * ─ A DÍVIDA DO MOLDE, PAGA: A PROVA QUE OS COMENTÁRIOS JÁ CITAVAM E QUE NÃO EXISTIA ────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO NASCE NA ONDA E, e não na C, que é quando a linha de serviço nasceu ───┐
 * │ `linhas-servico.controller.ts:18` e `linhas-servico-admin.controller.ts:30` AFIRMAM que      │
 * │ existe um teste provando, handler a handler, que a leitura resolve para `null` no MenuGuard  │
 * │ e que a escrita resolve para `as-linhas-servico`. Os equivalentes de `etapas-funil` e de     │
 * │ `vaga-status` existem; ESTE nunca foi escrito.                                               │
 * │                                                                                              │
 * │ ISSO É PIOR DO QUE NÃO TER TESTE: o comentário faz quem chega depois confiar numa prova que  │
 * │ não roda, e a Onda E manda COPIAR ESTE MOLDE para dois catálogos novos. Copiar o molde       │
 * │ copiaria a afirmação junto, e passariam a ser TRÊS catálogos dizendo que estão provados, com │
 * │ um teste só, o das etapas, que fala de outra coisa. A dívida é barata agora e cara depois.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE ELE GUARDA OS DOIS LADOS DE UM ERRO SIMÉTRICO ───────────────────────────────────────
 *
 * O `MenuGuard` resolve por NOME DE CLASSE (`menuDaOperacao`), e o default de uma operação NÃO
 * REIVINDICADA é PASSAR. Então os dois erros custam caro e nenhum dos dois falha sozinho:
 *   . REIVINDICAR A LEITURA (uma classe só, com `.*`) fecharia o `GET /as/linhas-servico` junto com
 *     a administração, e o seletor da abertura de vaga daria 403 para o consultor COMUM, que é
 *     quem abre vaga, num campo OBRIGATÓRIO para publicar;
 *   . NÃO REIVINDICAR A ESCRITA a deixaria ABERTA no MenuGuard. Ela ainda estaria fechada pelo
 *     `@Roles("SUPER_ADMIN")`, e é por isso que este arquivo afirma AS DUAS camadas, cada uma pelo
 *     seu motivo, nenhuma dependendo de a outra estar certa.
 *
 * §A.6: papéis, nomes de classe e códigos de menu. Nenhum dado pessoal.
 */
describe("linhas de serviço: a leitura é aberta, a escrita é do SUPER_ADMIN", () => {
  const LEITURA = ["listar"] as const;
  const ESCRITA = ["criar", "reordenar", "renomear", "reativar", "inativar", "remover"] as const;

  /** A lista digitada não pode divergir do protótipo: handler novo tem de entrar na régua. */
  it("as listas acima cobrem TODOS os handlers das duas controllers", () => {
    const handlers = (c: object) =>
      Object.getOwnPropertyNames(c).filter(
        (n) => n !== "constructor" && typeof (c as Record<string, unknown>)[n] === "function",
      );
    expect(handlers(LinhasServicoController.prototype).sort()).toEqual([...LEITURA].sort());
    expect(handlers(LinhasServicoAdminController.prototype).sort()).toEqual([...ESCRITA].sort());
  });

  it("a LEITURA não é reivindicada por menu nenhum (senão a abertura de vaga dá 403 para o COMUM)", () => {
    for (const op of LEITURA) {
      expect(menuDaOperacao("LinhasServicoController", op), `LinhasServicoController.${op}`).toBeNull();
    }
  });

  it("a leitura NÃO tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, LinhasServicoController)).toBeUndefined();
    const proto = LinhasServicoController.prototype as unknown as Record<string, object>;
    for (const op of LEITURA) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `LinhasServicoController.${op}`).toBeUndefined();
    }
  });

  it("TODA operação de ESCRITA resolve para o menu `as-linhas-servico`", () => {
    for (const op of ESCRITA) {
      expect(
        menuDaOperacao("LinhasServicoAdminController", op),
        `LinhasServicoAdminController.${op}`,
      ).toBe("as-linhas-servico");
    }
  });

  /**
   * A AUTORIDADE. O menu decide se o card aparece; quem tranca a porta é o papel, e ele está na
   * CLASSE, então operação nova nasce fechada em vez de depender de alguém lembrar do decorator.
   *
   * O MENU SOZINHO NÃO SEGURARIA O MASTER: `menu.guard.ts` deixa o MASTER passar por PERTENCER À
   * ÁREA do menu, e há MASTER na área AS em produção. Um `@Roles` removido "porque o menu já cuida"
   * entregaria a classificação da operação inteira a eles.
   */
  it('a escrita é @Roles("SUPER_ADMIN") na CLASSE, cobrindo inclusive rota que ainda não existe', () => {
    expect(Reflect.getMetadata(ROLES_KEY, LinhasServicoAdminController)).toEqual(["SUPER_ADMIN"]);
  });

  it("o menu `as-linhas-servico` existe, nasce só para o SUPER_ADMIN e não é concedível a COMUM (§A.23)", () => {
    const menu = MENUS.find((m) => m.codigo === "as-linhas-servico");
    expect(menu, "o menu precisa existir no registro para ser selecionável na tela de liberação").toBeDefined();
    expect(menu?.areas, 'sem `areas: ["AS"]` o menu nasce em ADM e some para o time de A&S').toEqual(["AS"]);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-linhas-servico")).toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-linhas-servico")).toBe(true);
  });

  /**
   * NENHUMA OUTRA CLASSE PODE REIVINDICAR ESTAS DUAS. Um menu novo que resolvesse por engano a
   * leitura (por exemplo com `LinhasServicoController.*`) não quebraria nada em desenvolvimento e
   * daria 403 na trilha de abertura do consultor, que é o modo de falha caro desta frente.
   */
  it("só o menu `as-linhas-servico` reivindica a administração, e ninguém reivindica a leitura", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    expect(reivindicam("LinhasServicoAdminController")).toEqual(["as-linhas-servico"]);
    expect(reivindicam("LinhasServicoController")).toEqual([]);
  });
});
