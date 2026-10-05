import "reflect-metadata";
import { ForbiddenException, RequestMethod, type ExecutionContext } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import type { Area, Papel } from "@ea/shared-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { RolesGuard } from "../../auth/guards/roles.guard";
import { menuDaOperacao } from "../../domain/menus";
import { VagasController } from "./vagas.controller";

/**
 * TESTER INDEPENDENTE (§A.38, §A.40 regra 2). RBAC do CRUD da vaga liberada, pelo REQUISITO:
 *
 *  - EDITAR (`GET :id/edicao-previa`, `PATCH :id/editar`): SEM `@Roles`, o menu `as-vagas` cobre.
 *    Qualquer consultor com o menu edita (contrato no shared-types).
 *  - EXCLUIR (`GET :id/exclusao-previa`, `DELETE :id`): `@Roles("SUPER_ADMIN")` e SOMENTE ele.
 *    O Master NÃO exclui, por decisão do diretor (mapa, item 4; emenda E-6).
 *
 * OS HANDLERS SÃO ACHADOS PELA ROTA, NÃO PELO NOME. O tester não conhece os nomes dos métodos que a
 * construção escolheu; o requisito é a ROTA. Ler PATH/METHOD do Nest faz o teste valer para
 * qualquer nome e pega também o erro de declarar a rota com o verbo errado.
 *
 * O E-6 manda este caso NÃO entrar no `auth/guards/rbac-exclusao.spec.ts`, que afirma o contrário
 * (MASTER passa) para as rotas destrutivas de lá. Por isso o arquivo é próprio.
 */

type Proto = Record<string, unknown>;
const proto = VagasController.prototype as unknown as Proto;

function normalizar(caminho: unknown): string {
  return String(caminho ?? "").replace(/^\/+|\/+$/g, "");
}

/** Os nomes dos handlers da controller que respondem a (verbo, caminho). */
function handlersDa(verbo: RequestMethod, caminho: string): string[] {
  return Object.getOwnPropertyNames(proto).filter((nome) => {
    if (nome === "constructor") return false;
    const fn = proto[nome];
    if (typeof fn !== "function") return false;
    const path = Reflect.getMetadata(PATH_METADATA, fn);
    const method = Reflect.getMetadata(METHOD_METADATA, fn);
    if (path === undefined || method === undefined) return false;
    const caminhos = Array.isArray(path) ? path.map(normalizar) : [normalizar(path)];
    return method === verbo && caminhos.includes(caminho);
  });
}

function handlerUnico(verbo: RequestMethod, caminho: string): string {
  const achados = handlersDa(verbo, caminho);
  expect(achados, `${RequestMethod[verbo]} as/vagas/${caminho}: precisa existir UM handler`).toHaveLength(1);
  return achados[0]!;
}

const ROTAS = {
  edicaoPrevia: [RequestMethod.GET, ":id/edicao-previa"],
  editar: [RequestMethod.PATCH, ":id/editar"],
  exclusaoPrevia: [RequestMethod.GET, ":id/exclusao-previa"],
  excluir: [RequestMethod.DELETE, ":id"],
} as const satisfies Record<string, readonly [RequestMethod, string]>;

const papeis = (nome: string): unknown => Reflect.getMetadata(ROLES_KEY, proto[nome] as object);

/** Guard REAL, com o Reflector real lendo o metadado REAL do handler. Usuário da área A&S e ADM. */
function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set<Area>(["ADM", "AS"] as Area[]) } as unknown as MenusService;
  const areas = { areasDaOperacao: async () => ["ADM", "AS"] as Area[] } as unknown as MenuAreasService;
  return new RolesGuard(new Reflector(), menus, areas);
}

function contexto(handler: string, papel: Papel): ExecutionContext {
  return {
    getHandler: () => proto[handler],
    getClass: () => VagasController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u-teste", papel } }) }),
  } as unknown as ExecutionContext;
}

describe("as/vagas CRUD da vaga liberada: as quatro rotas existem", () => {
  for (const [nome, [verbo, caminho]] of Object.entries(ROTAS)) {
    it(`${RequestMethod[verbo]} as/vagas/${caminho} (${nome}) tem exatamente um handler`, () => {
      handlerUnico(verbo, caminho);
    });
  }

  it("a classe continua sem @Roles (um @Roles ali barraria a edição e o liberar por tabela)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
  });
});

describe("as/vagas: EDITAR é do consultor (sem @Roles)", () => {
  for (const chave of ["edicaoPrevia", "editar"] as const) {
    const [verbo, caminho] = ROTAS[chave];

    it(`${caminho}: nenhum @Roles, a ausência é a regra`, () => {
      expect(papeis(handlerUnico(verbo, caminho))).toBeUndefined();
    });

    it(`${caminho}: COMUM, MASTER e SUPER_ADMIN passam pelo RolesGuard real`, async () => {
      const h = handlerUnico(verbo, caminho);
      const g = guardReal();
      for (const papel of ["COMUM", "MASTER", "SUPER_ADMIN"] as Papel[]) {
        await expect(g.canActivate(contexto(h, papel)), papel).resolves.toBe(true);
      }
    });

    it(`${caminho}: reivindicada pelo menu as-vagas (sem @Roles, é o menu que controla quem entra)`, () => {
      expect(menuDaOperacao("VagasController", handlerUnico(verbo, caminho))).toBe("as-vagas");
    });
  }
});

describe("as/vagas: EXCLUIR é só do SUPER_ADMIN", () => {
  for (const chave of ["exclusaoPrevia", "excluir"] as const) {
    const [verbo, caminho] = ROTAS[chave];
    const rotulo = `${RequestMethod[verbo]} ${caminho}`;

    it(`${rotulo}: @Roles é exatamente ["SUPER_ADMIN"]`, () => {
      const exigidos = papeis(handlerUnico(verbo, caminho));
      expect(exigidos, "sem @Roles qualquer consultor exclui vaga pela API").toBeDefined();
      expect([...(exigidos as string[])].sort()).toEqual(["SUPER_ADMIN"]);
    });

    it(`${rotulo}: SUPER_ADMIN passa no RolesGuard real`, async () => {
      await expect(guardReal().canActivate(contexto(handlerUnico(verbo, caminho), "SUPER_ADMIN"))).resolves.toBe(
        true,
      );
    });

    it(`${rotulo}: MASTER recebe 403 (decisão do diretor: o Master não exclui)`, async () => {
      await expect(
        guardReal().canActivate(contexto(handlerUnico(verbo, caminho), "MASTER")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it(`${rotulo}: COMUM recebe 403`, async () => {
      await expect(
        guardReal().canActivate(contexto(handlerUnico(verbo, caminho), "COMUM")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it(`${rotulo}: continua reivindicada pelo menu as-vagas (o MenuGuard segue valendo)`, () => {
      expect(menuDaOperacao("VagasController", handlerUnico(verbo, caminho))).toBe("as-vagas");
    });
  }

  it("o DELETE :id e o GET :id/exclusao-previa não são o mesmo handler da edição", () => {
    const excl = new Set([handlerUnico(...ROTAS.excluir), handlerUnico(...ROTAS.exclusaoPrevia)]);
    expect(excl.has(handlerUnico(...ROTAS.editar))).toBe(false);
    expect(excl.has(handlerUnico(...ROTAS.edicaoPrevia))).toBe(false);
  });

  /**
   * As rotas que já existiam e que a frente não toca (mapa §7) seguem sem mudança de autoridade:
   * o `atualizar` (PATCH :id) e o `liberar-revisao` sem @Roles. Ninguém "uniformiza" por simetria.
   */
  it("o PATCH :id (atualizar do rascunho/revisão) segue sem @Roles", () => {
    expect(papeis(handlerUnico(RequestMethod.PATCH, ":id"))).toBeUndefined();
  });
});

describe("rbac-exclusao.spec.ts não recebe a exclusão de vaga (E-6)", () => {
  it("o spec das destrutivas (que afirma MASTER passa) não importa nem cita a VagasController", () => {
    const fonte = readFileSync(join(__dirname, "../../auth/guards/rbac-exclusao.spec.ts"), "utf8");
    expect(fonte).not.toMatch(/VagasController/);
    expect(fonte).not.toMatch(/as\/vagas/);
  });
});
