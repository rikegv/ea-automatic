import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area, Papel } from "@ea/shared-types";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesController } from "../../admissoes/admissoes.controller";
import { UsersController } from "../../users/users.controller";
import { menuDaOperacao, temIntersecao } from "../../domain/menus";
import type { MenuAreasService } from "../menu-areas.service";
import type { MenusService } from "../menus.service";
import { MenuGuard } from "./menu.guard";
import { RolesGuard } from "./roles.guard";

/**
 * DoD (§A.3/§A.6): TODA rota destrutiva/administrativa NEGA o papel COMUM e libera MASTER/SUPER_ADMIN.
 *
 * A OST de permissão de menu dividiu o ENFORCER em dois, e o DoD é preservado nos dois:
 *  - rotas que continuam ADMIN-only (deletar admissão, gestão de usuários) → `RolesGuard` (@Roles);
 *  - rotas que passaram a ser governadas por MENU (excluir cliente/cargo/regra/régua) → `MenuGuard`,
 *    que nega o COMUM sem o meno correspondente e libera admin por bypass.
 * O intento ("COMUM não exclui") é o mesmo; o mecanismo mudou para os catálogos.
 */

// ── (A) Rotas que SEGUEM sob @Roles admin ────────────────────────────────────
type Alvo = { nome: string; controller: new (...args: never[]) => object; handler: string };
const ALVOS_ROLES: Alvo[] = [
  { nome: "DELETE /admissoes/:id", controller: AdmissoesController, handler: "deletar" },
  { nome: "admin/usuarios (listar)", controller: UsersController, handler: "listar" },
  { nome: "admin/usuarios (criar)", controller: UsersController, handler: "criar" },
  { nome: "admin/usuarios (atualizar)", controller: UsersController, handler: "atualizar" },
  { nome: "admin/usuarios (reset-senha)", controller: UsersController, handler: "resetarSenha" },
  { nome: "admin/usuarios (definir menus)", controller: UsersController, handler: "definirMenus" },
];

function contextoRoles(alvo: Alvo, papel: Papel | undefined): ExecutionContext {
  const proto = alvo.controller.prototype as Record<string, unknown>;
  return {
    getHandler: () => proto[alvo.handler],
    getClass: () => alvo.controller,
    switchToHttp: () => ({ getRequest: () => ({ user: papel ? { papel } : undefined }) }),
  } as unknown as ExecutionContext;
}

/** Serviço de menus fingido: devolve as áreas informadas ao guard. */
function menusComAreas(areas: Area[]): MenusService {
  return { areasDoUsuario: async () => new Set(areas) } as unknown as MenusService;
}

/**
 * Fonte viva da área do MENU (a tabela). Devolve ADM para toda operação, que é o que a tabela diz
 * depois do backfill: assim estes casos seguem medindo papel e área do USUÁRIO.
 */
function areasDaOperacaoFixas(): MenuAreasService {
  return { areasDaOperacao: async () => ["ADM"] as Area[] } as unknown as MenuAreasService;
}

describe("RBAC @Roles: rotas que seguem admin-only", () => {
  // Usuário da área ADM, que é onde vivem todas as operações gatadas por @Roles hoje: assim estes
  // casos seguem medindo PAPEL, exatamente como antes da segmentação de área.
  const guard = new RolesGuard(new Reflector(), menusComAreas(["ADM"]), areasDaOperacaoFixas());
  for (const alvo of ALVOS_ROLES) {
    it(`${alvo.nome}, nega COMUM`, async () => {
      await expect(guard.canActivate(contextoRoles(alvo, "COMUM"))).rejects.toThrow(
        ForbiddenException,
      );
    });
    it(`${alvo.nome}, nega usuário ausente`, async () => {
      await expect(guard.canActivate(contextoRoles(alvo, undefined))).rejects.toThrow(
        ForbiddenException,
      );
    });
  }

  // A GESTÃO DE USUÁRIOS APERTOU para SUPER_ADMIN na segmentação de área (decisão do diretor): é a
  // tela onde as ÁREAS são cadastradas, então um Master que a alcançasse se concederia qualquer área.
  const SO_SUPER_ADMIN = new Set(ALVOS_ROLES.filter((a) => a.controller === UsersController));

  for (const alvo of ALVOS_ROLES) {
    if (SO_SUPER_ADMIN.has(alvo)) {
      it(`${alvo.nome}, nega MASTER e permite SUPER_ADMIN (gestão de usuários apertou)`, async () => {
        await expect(guard.canActivate(contextoRoles(alvo, "MASTER"))).rejects.toThrow(
          ForbiddenException,
        );
        await expect(guard.canActivate(contextoRoles(alvo, "SUPER_ADMIN"))).resolves.toBe(true);
      });
    } else {
      it(`${alvo.nome}, permite MASTER e SUPER_ADMIN`, async () => {
        await expect(guard.canActivate(contextoRoles(alvo, "MASTER"))).resolves.toBe(true);
        await expect(guard.canActivate(contextoRoles(alvo, "SUPER_ADMIN"))).resolves.toBe(true);
      });
    }
  }

  // A PORTA DOS FUNDOS, fechada: sem área no RolesGuard, um Master de A&S alcançaria a tela de
  // Usuários pela API e se cadastraria na área ADM.
  it("Master de A&S não alcança NENHUMA rota administrativa de ADM", async () => {
    const guardAS = new RolesGuard(new Reflector(), menusComAreas(["AS"]), areasDaOperacaoFixas());
    for (const alvo of ALVOS_ROLES) {
      await expect(guardAS.canActivate(contextoRoles(alvo, "MASTER"))).rejects.toThrow(
        ForbiddenException,
      );
    }
  });
});

// ── (B) Rotas destrutivas que passaram a ser governadas por MENU ─────────────
const ALVOS_MENU = [
  { nome: "DELETE /admin/clientes", controller: "ClientesController", handler: "remove", menu: "clientes" },
  { nome: "DELETE /admin/cargos", controller: "CargosController", handler: "remove", menu: "cargos" },
  { nome: "DELETE /admin/regras", controller: "RegrasController", handler: "remove", menu: "regras" },
  { nome: "DELETE /admin/regua", controller: "ReguaController", handler: "remove", menu: "regua" },
] as const;

function contextoMenu(controller: string, handler: string, papel: Papel, id = "u1") {
  return {
    getClass: () => ({ name: controller }),
    getHandler: () => ({ name: handler }),
    switchToHttp: () => ({ getRequest: () => ({ user: { id, papel } }) }),
  } as unknown as ExecutionContext;
}

describe("RBAC menu: rotas destrutivas de catálogo negam COMUM sem o menu", () => {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  // COMUM sem NENHUM menu: tem de ser barrado no backend.
  const semMenus = {
    codigosDoUsuario: vi.fn().mockResolvedValue(new Set<string>()),
    // Área ADM: estes casos medem a permissão de MENU, não a de área. Todas as telas aqui são de ADM.
    permissaoDoUsuario: vi
      .fn()
      .mockResolvedValue({ codigos: new Set<string>(), areas: new Set<Area>(["ADM"]) }),
  } as unknown as MenusService;
  // Fonte viva da área do menu (a tabela): ADM, como o backfill deixou. Estes casos medem MENU.
  const areasDoMenu = {
    visivel: async (_c: string, doUsuario: Iterable<Area>) => temIntersecao(["ADM"], doUsuario),
  } as unknown as MenuAreasService;
  const guard = new MenuGuard(reflector, semMenus, areasDoMenu);

  for (const a of ALVOS_MENU) {
    it(`${a.nome}, é reivindicada pelo menu "${a.menu}"`, () => {
      expect(menuDaOperacao(a.controller, a.handler)).toBe(a.menu);
    });
    it(`${a.nome}, nega COMUM sem o menu (403 no backend)`, async () => {
      await expect(
        guard.canActivate(contextoMenu(a.controller, a.handler, "COMUM")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
    it(`${a.nome}, libera MASTER (na sua área) e SUPER_ADMIN`, async () => {
      await expect(guard.canActivate(contextoMenu(a.controller, a.handler, "MASTER"))).resolves.toBe(
        true,
      );
      await expect(
        guard.canActivate(contextoMenu(a.controller, a.handler, "SUPER_ADMIN")),
      ).resolves.toBe(true);
    });
  }
});
