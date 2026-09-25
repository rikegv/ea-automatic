import { describe, expect, it } from "vitest";
import {
  MENUS,
  MENUS_PADRAO_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../domain/menus";
import { PortalPendenciasController } from "./portal-pendencias.controller";

/**
 * AS AÇÕES DO PORTAL PERTENCEM AO MENU DA ESTEIRA, e isto fecha uma PORTA ABERTA.
 *
 * ┌─ O FURO ────────────────────────────────────────────────────────────────────────────────────┐
 * │ `solicitarReenvio` não tem `@Roles` (é operacional de propósito, como as rotas de auditoria   │
 * │ e reauditoria) e, enquanto nenhum menu a reivindicava, o `MenuGuard` também a deixava passar: │
 * │ operação não reivindicada é operação ABERTA. Somadas, as duas ausências punham ao alcance de  │
 * │ QUALQUER sessão autenticada uma operação que reabre pendência e credita envio ao candidato.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O MENU É O `esteira`, E NÃO UM MENU NOVO ──────────────────────────────────────────┐
 * │ 1. O BOTÃO VIVE NO MODAL DA ABA AUDITORIA, que é a Esteira. Reivindicar por um menu           │
 * │    diferente daria 403 a quem tem a Esteira e não tem o menu novo, que é o time inteiro de    │
 * │    hoje. O `domain/menus.ts` registra os dois precedentes da casa (o download do kit e a      │
 * │    importação de matrículas).                                                                 │
 * │ 2. MENU NOVO SERIA CONCESSÃO, NÃO REGISTRO (§A.23): `MENUS_PADRAO_COMUM` é derivado, então um │
 * │    menu de `OPERACAO` nascido em ADM se concederia sozinho a todo COMUM no próximo backfill.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TESTE É SOBRE O ÍNDICE REAL (`menuDaOperacao`), e não sobre a leitura do arquivo: é o índice
 * que o guard consulta em toda requisição.
 */

/** Os handlers de verdade da controller, lidos do protótipo: lista que não envelhece sozinha. */
const HANDLERS = Object.getOwnPropertyNames(PortalPendenciasController.prototype).filter(
  (n) => n !== "constructor",
);

describe("nenhuma ação do Portal fica sem menu", () => {
  it("a controller tem os três handlers esperados", () => {
    expect(HANDLERS.sort()).toEqual(["situacao", "solicitarReenvio", "zerarTentativas"]);
  });

  it.each(HANDLERS)("`%s` é reivindicada por um menu, e não fica aberta", (handler) => {
    expect(
      menuDaOperacao("PortalPendenciasController", handler),
      `operação não reivindicada por menu nenhum: qualquer sessão autenticada a alcança`,
    ).toBeTruthy();
  });

  it.each(HANDLERS)("`%s` pertence ao menu da ESTEIRA, o mesmo das rotas irmãs", (handler) => {
    expect(menuDaOperacao("PortalPendenciasController", handler)).toBe("esteira");
  });

  it("o menu é o MESMO de `AuditoriaController` e de `ReauditoriaController`", () => {
    const daAuditoria = menuDaOperacao("AuditoriaController", "documento");
    const daReauditoria = menuDaOperacao("ReauditoriaController", "reauditar");
    const doPortal = menuDaOperacao("PortalPendenciasController", "solicitarReenvio");
    expect(doPortal).toBe(daAuditoria);
    expect(doPortal).toBe(daReauditoria);
  });
});

describe("§A.23: registrar não é conceder, e nenhum menu novo nasceu", () => {
  it("não existe menu novo de auditoria no registro", () => {
    const novos = MENUS.filter((m) => /auditoria/i.test(m.codigo));
    expect(
      novos.map((m) => m.codigo),
      "menu novo em OPERACAO se concede sozinho pelo MENUS_PADRAO_COMUM derivado",
    ).toEqual([]);
  });

  /**
   * A REGRA DE VERDADE NÃO É "NENHUM MENU NOVO", É "NENHUM MENU QUE SE CONCEDA SOZINHO".
   *
   * A primeira redação deste arquivo barrava qualquer código casando `/auditoria|portal/`, porque
   * na época o certo era mesmo não criar menu nenhum. A frente da IDENTIDADE precisou de um
   * (`portal-links`, a tela onde o consultor emite e revoga o link do candidato), e a régua passa a
   * ser medida contra o CONJUNTO DERIVADO, que é o que de fato concede: `MENUS_PADRAO_COMUM` junta
   * todo menu de grupo `OPERACAO` nascido em ADM e é aplicado a todo usuário criado e a todo COMUM
   * em qualquer execução do backfill.
   *
   * Assim o teste continua pegando o incidente que o originou (§A.23) e para de proibir o nome.
   */
  it("NENHUM menu do Portal entra no conjunto que se concede sozinho", () => {
    const doPortal = MENUS.filter((m) => /portal/i.test(m.codigo));
    expect(doPortal.map((m) => m.codigo), "o menu do Portal sumiu do registro").toContain(
      "portal-links",
    );
    for (const menu of doPortal) {
      expect(menu.grupo, `${menu.codigo} em OPERACAO entraria no backfill do COMUM`).not.toBe(
        "OPERACAO",
      );
      expect(MENUS_PADRAO_COMUM, `${menu.codigo} se concede sozinho`).not.toContain(menu.codigo);
    }
  });

  /**
   * E O MENU NOVO PRECISA REIVINDICAR AS ROTAS DELE, senão ele é decoração: `PortalLinksController`
   * não tem `@Roles` (emitir link é trabalho de consultor), e operação que NENHUM menu reivindica
   * passa livre pelo `MenuGuard`. Sem esta linha, qualquer sessão autenticada FABRICA credencial de
   * acesso aos documentos de um candidato. É o mesmo furo do `solicitarReenvio`, uma frente depois.
   */
  it("emitir e revogar link são reivindicados pelo menu do Portal", () => {
    for (const handler of ["emitir", "revogar"]) {
      expect(
        menuDaOperacao("PortalLinksController", handler),
        "operação não reivindicada: qualquer sessão autenticada emite link do portal",
      ).toBe("portal-links");
    }
  });

  it("o menu que recebeu as operações já existia e continua sendo o da Esteira", () => {
    const esteira = MENUS.find((m) => m.codigo === "esteira");
    expect(esteira, "o menu da Esteira sumiu do registro").toBeTruthy();
    expect(esteira!.operacoes).toContain("PortalPendenciasController.*");
    // Não virou menu restrito: quem opera a Esteira continua operando.
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("esteira")).toBe(false);
  });
});
