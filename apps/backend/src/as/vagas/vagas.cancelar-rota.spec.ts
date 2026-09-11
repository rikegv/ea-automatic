import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import type { AuthUser } from "../../auth/auth.types";
import { menuDaOperacao } from "../../domain/menus";
import { VagasController } from "./vagas.controller";

/**
 * ─ A ROTA DE CANCELAR: QUEM AUTORIZA É O SERVICE, E O PAPEL VEM DA SESSÃO ───────────────────────
 *
 * ┌─ POR QUE `@Roles` AQUI SERIA REGRESSÃO, E NÃO PROTEÇÃO ─────────────────────────────────────┐
 * │ TODO CONSULTOR CANCELA UMA VAGA LIMPA. O que é de MASTER é FORÇAR o cancelamento por cima de │
 * │ quem ainda não terminou, e essa conferência mora no SERVICE, que é quem sabe se alguém segura │
 * │ a vaga. Um `@Roles("MASTER","SUPER_ADMIN")` no handler barraria o cancelamento NORMAL do      │
 * │ COMUM, que é exatamente a regressão que o `vagas.fechar-sem-roles.spec.ts` já guarda para a   │
 * │ rota irmã de fechamento, e pela mesma razão.                                                  │
 * │                                                                                             │
 * │ E A OUTRA METADE: "sem `@Roles`" NÃO quer dizer "aberto a todos". A controller inteira é      │
 * │ reivindicada pelo menu `as-vagas`, e é o menu que controla quem entra no A&S.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `@CurrentUser()` NÃO É DETALHE DE ESTILO AQUI: é ele que faz o papel vir da SESSÃO. Um handler
 * que tirasse o usuário do CORPO deixaria qualquer um mandar `papel: "MASTER"` e forçar o
 * cancelamento por cima de cinco pessoas alocadas. O teste do metadado abaixo é o que impede isso de
 * ser trocado sem alarme.
 */

const proto = VagasController.prototype as unknown as Record<string, unknown>;

/** Os índices de parâmetro preenchidos por decorador CUSTOMIZADO (`@CurrentUser`, aqui). */
function indicesDeDecoradorCustomizado(handler: string): number[] {
  const md = Reflect.getMetadata("__routeArguments__", VagasController, handler) as
    | Record<string, { index: number }>
    | undefined;
  if (!md) return [];
  return Object.entries(md)
    .filter(([chave]) => chave.includes("__customRouteArgs__"))
    .map(([, valor]) => valor.index);
}

describe("a rota de cancelar existe e não tem @Roles", () => {
  it("o handler `cancelar` existe na controller", () => {
    expect(typeof proto.cancelar, "VagasController.cancelar precisa existir").toBe("function");
  });

  it("não há @Roles em CLASSE (um decorador aqui barraria o COMUM em TODO o A&S)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
  });

  it("não há @Roles no MÉTODO `cancelar`: quem decide o forçamento é o service", () => {
    expect(Reflect.getMetadata(ROLES_KEY, proto.cancelar as object)).toBeUndefined();
  });

  it("a operação `cancelar` continua reivindicada pelo menu `as-vagas`", () => {
    expect(menuDaOperacao("VagasController", "cancelar")).toBe("as-vagas");
  });
});

describe("o usuário vem da SESSÃO, e o corpo não tem como escolher outro", () => {
  it("o handler `cancelar` recebe um parâmetro de decorador customizado (`@CurrentUser`)", () => {
    expect(indicesDeDecoradorCustomizado("cancelar").length).toBeGreaterThan(0);
  });

  it("o handler entrega ao service o id, o corpo e o usuário da sessão, sem reescrever nada", async () => {
    const cancelar = vi.fn().mockResolvedValue({ id: "vaga-1" });
    const controller = new VagasController({ cancelar } as never);
    const user: AuthUser = {
      id: "user-comum",
      email: "consultor@soulan.com.br",
      papel: "COMUM",
      senhaTemporaria: false,
    };
    const corpo = { motivo: "Cliente cancelou a solicitação", dataCancelamento: "2026-09-10" };

    await (
      controller as unknown as Record<
        string,
        (id: string, dto: unknown, user: AuthUser) => Promise<unknown>
      >
    ).cancelar("vaga-1", corpo, user);

    expect(cancelar).toHaveBeenCalledWith("vaga-1", corpo, user);
  });
});
