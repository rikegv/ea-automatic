import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area, Papel } from "@ea/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";
import type { MenuAreasService } from "../menu-areas.service";
import type { MenusService } from "../menus.service";

/**
 * RBAC (§A.3 / §A.6): consultor COMUM nunca acessa rotas de administração.
 * Testa o RolesGuard isolado, com Reflector real e ExecutionContext mockado.
 * O metadado de @Roles é simulado por spy em reflector.getAllAndOverride.
 */
describe("RolesGuard (RBAC §A.3)", () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  /**
   * Serviço de menus fingido, devolvendo as áreas informadas. O guard só o consulta para MASTER e
   * COMUM que passaram no papel; SUPER_ADMIN e quem é barrado no papel nunca chegam ao banco.
   */
  function menusComAreas(areas: Area[]): MenusService {
    return { areasDoUsuario: async () => new Set(areas) } as unknown as MenusService;
  }

  /**
   * Fonte viva da área do MENU, hoje a tabela. O dublê devolve ADM para toda operação, que é o que a
   * tabela diz depois do backfill: assim estes casos seguem medindo papel e área do USUÁRIO.
   */
  function areasDaOperacaoFixas(areas: Area[] = ["ADM"]): MenuAreasService {
    return { areasDaOperacao: async () => areas } as unknown as MenuAreasService;
  }

  beforeEach(() => {
    reflector = new Reflector();
    // Padrão dos testes de papel: o usuário é da área ADM, que é onde vivem todas as operações
    // gatadas por @Roles hoje. Assim estes casos seguem medindo PAPEL, e não área.
    guard = new RolesGuard(reflector, menusComAreas(["ADM"]), areasDaOperacaoFixas());
  });

  /** Monta um ExecutionContext cujo request carrega o usuário informado. */
  function contextComUsuario(user: { papel: Papel } | undefined): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  /** Simula @Roles(...) lido pelo Reflector na rota. */
  function exigirPapeis(required: Papel[] | undefined): void {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(required);
  }

  it("barra papel COMUM em rota que exige MASTER/SUPER_ADMIN (consultor fora da administração)", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    await expect(guard.canActivate(contextComUsuario({ papel: "COMUM" }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("permite papel MASTER na rota de administração", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    await expect(guard.canActivate(contextComUsuario({ papel: "MASTER" }))).resolves.toBe(true);
  });

  it("permite papel SUPER_ADMIN na rota de administração", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    await expect(guard.canActivate(contextComUsuario({ papel: "SUPER_ADMIN" }))).resolves.toBe(true);
  });

  it("permite qualquer autenticado em rota sem @Roles (required vazio)", async () => {
    exigirPapeis([]);
    await expect(guard.canActivate(contextComUsuario({ papel: "COMUM" }))).resolves.toBe(true);
  });

  it("permite qualquer autenticado em rota sem @Roles (required undefined)", async () => {
    exigirPapeis(undefined);
    await expect(guard.canActivate(contextComUsuario({ papel: "COMUM" }))).resolves.toBe(true);
  });

  it("barra usuário ausente em rota com @Roles", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    await expect(guard.canActivate(contextComUsuario(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ── Segmentação de área (fundação do módulo de A&S) ──────────────────────
  //
  // A PORTA DOS FUNDOS que estes casos fecham: as operações gatadas só por @Roles não passam por menu
  // nenhum, então o filtro de área do MenuGuard nunca as alcançaria. Sem eles, um Master de A&S
  // chegaria à tela de Usuários pela API e se concederia a área ADM.

  it("barra MASTER de OUTRA área numa operação de ADM, mesmo com o papel certo", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    const g = new RolesGuard(reflector, menusComAreas(["AS"]), areasDaOperacaoFixas());
    await expect(g.canActivate(contextComUsuario({ papel: "MASTER" }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("SUPER_ADMIN passa mesmo SEM área nenhuma: está acima da segmentação", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    const g = new RolesGuard(reflector, menusComAreas([]), areasDaOperacaoFixas());
    await expect(g.canActivate(contextComUsuario({ papel: "SUPER_ADMIN" }))).resolves.toBe(true);
  });

  it("MASTER sem área nenhuma é barrado (fail-closed)", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    const g = new RolesGuard(reflector, menusComAreas([]), areasDaOperacaoFixas());
    await expect(g.canActivate(contextComUsuario({ papel: "MASTER" }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("MASTER híbrido (as duas áreas) passa na operação de ADM", async () => {
    exigirPapeis(["MASTER", "SUPER_ADMIN"]);
    const g = new RolesGuard(reflector, menusComAreas(["ADM", "AS"]), areasDaOperacaoFixas());
    await expect(g.canActivate(contextComUsuario({ papel: "MASTER" }))).resolves.toBe(true);
  });
});
