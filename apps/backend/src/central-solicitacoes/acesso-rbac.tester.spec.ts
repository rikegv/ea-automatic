import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { menuDaOperacao } from "../domain/menus";
import { NotificacoesController } from "./notificacoes.controller";
import { SolicitacoesController } from "./solicitacoes.controller";
import { SolicitacoesGestaoController } from "./solicitacoes-gestao.controller";

/**
 * ─ O ACESSO ÀS TRÊS CONTROLLERS (cobertura independente, §A.38) ─────────────────────────────────
 *
 * Um `@Roles` é metadado de HANDLER/CLASSE: nenhum teste de service o alcança, e é exatamente por
 * isso que ele regride em silêncio (o mesmo argumento de `vagas.fechar-sem-roles.spec.ts`). Este
 * arquivo trava os três regimes de acesso da frente, que são DIFERENTES de propósito:
 *
 *   1. GESTÃO (`solicitacoes-gestao`): `@Roles("SUPER_ADMIN")` na CLASSE. Tirá-lo abre a gestão de
 *      TODAS as solicitações a qualquer autenticado, que é o furo mais caro desta frente.
 *   2. USUÁRIO (`solicitacoes`): SEM `@Roles`, gate é o MENU `central-solicitacoes`. Um `@Roles`
 *      aqui barraria o usuário comum que o diretor liberou.
 *   3. NOTIFICAÇÕES (`notificacoes`): SEM `@Roles` e SEM menu, aberta a qualquer autenticado (o
 *      sininho pinga para todos). O escopo por usuário é do service, provado em outro arquivo.
 */

const metaClasse = (c: unknown): unknown => Reflect.getMetadata(ROLES_KEY, c as object);
const metaHandler = (c: { prototype: object }, nome: string): unknown =>
  Reflect.getMetadata(ROLES_KEY, (c.prototype as Record<string, object>)[nome]);

describe("req.7: a gestão é SUPER_ADMIN, carimbada na CLASSE", () => {
  it("SolicitacoesGestaoController tem @Roles('SUPER_ADMIN') na classe", () => {
    expect(metaClasse(SolicitacoesGestaoController)).toEqual(["SUPER_ADMIN"]);
  });

  it("o `listar` da gestão é alcançado pelo @Roles de classe (um COMUM não lista)", () => {
    // O @Roles de classe cobre todo handler; nenhum handler o AFROUXA para menos que SUPER_ADMIN.
    const handlerMeta = metaHandler(SolicitacoesGestaoController, "listar");
    // Ou o handler não tem meta própria (herda a classe), ou tem e é SUPER_ADMIN; nunca mais fraco.
    if (handlerMeta !== undefined) {
      expect(handlerMeta).toEqual(["SUPER_ADMIN"]);
    }
    expect(metaClasse(SolicitacoesGestaoController)).toEqual(["SUPER_ADMIN"]);
  });

  it("a gestão é reivindicada pelo menu `solicitacoes-gestao`", () => {
    for (const op of ["listar", "detalhe", "acao"]) {
      expect(menuDaOperacao("SolicitacoesGestaoController", op), op).toBe("solicitacoes-gestao");
    }
  });
});

describe("req.7: o lado do usuário NÃO tem @Roles (o gate é o menu)", () => {
  it("SolicitacoesController não tem @Roles na classe", () => {
    expect(metaClasse(SolicitacoesController)).toBeUndefined();
  });

  it("nenhum handler do usuário tem @Roles: um @Roles aqui barraria o COMUM liberado", () => {
    for (const op of ["criar", "minhas", "detalhe", "postarMensagem"]) {
      expect(metaHandler(SolicitacoesController, op), op).toBeUndefined();
    }
  });

  it("a controller do usuário é reivindicada pelo menu `central-solicitacoes`", () => {
    for (const op of ["criar", "minhas", "detalhe", "postarMensagem"]) {
      expect(menuDaOperacao("SolicitacoesController", op), op).toBe("central-solicitacoes");
    }
  });
});

describe("req.7: as notificações são abertas a qualquer autenticado", () => {
  it("NotificacoesController não tem @Roles na classe nem nos handlers", () => {
    expect(metaClasse(NotificacoesController)).toBeUndefined();
    for (const op of ["pendentes", "contagem", "ciente"]) {
      expect(metaHandler(NotificacoesController, op), op).toBeUndefined();
    }
  });

  it("NENHUM menu reivindica as notificações (o MenuGuard deixa aberta a operação não reivindicada)", () => {
    for (const op of ["pendentes", "contagem", "ciente"]) {
      expect(menuDaOperacao("NotificacoesController", op), op).toBeNull();
    }
  });
});
