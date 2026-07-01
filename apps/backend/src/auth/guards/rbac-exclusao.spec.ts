import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { AdmissoesController } from "../../admissoes/admissoes.controller";
import { CargosController } from "../../admin/cargos/cargos.controller";
import { ClientesController } from "../../admin/clientes/clientes.controller";
import { RegrasController } from "../../admin/regras/regras.controller";
import { ReguaController } from "../../admin/regua/regua.controller";
import { UsersController } from "../../users/users.controller";
import { RolesGuard } from "./roles.guard";

/**
 * DoD (§A.3/§A.6): TODAS as rotas destrutivas/administrativas negam o papel COMUM (consultor) e
 * liberam MASTER/SUPER_ADMIN. Testa o RolesGuard REAL sobre os handlers REAIS dos controllers,
 * lendo a metadata @Roles como o Nest faria (getAllAndOverride [handler, class]).
 */
type Alvo = { nome: string; controller: new (...args: never[]) => object; handler: string };

// As 5 rotas de exclusão existentes + as novas de admin/usuarios.
const ALVOS: Alvo[] = [
  { nome: "DELETE /admissoes/:id", controller: AdmissoesController, handler: "deletar" },
  { nome: "DELETE /admin/clientes/:codCliente", controller: ClientesController, handler: "remove" },
  { nome: "DELETE /admin/cargos/:id", controller: CargosController, handler: "remove" },
  { nome: "DELETE /admin/regras/:id", controller: RegrasController, handler: "remove" },
  { nome: "DELETE /admin/regua", controller: ReguaController, handler: "remove" },
  { nome: "admin/usuarios (listar)", controller: UsersController, handler: "listar" },
  { nome: "admin/usuarios (criar)", controller: UsersController, handler: "criar" },
  { nome: "admin/usuarios (atualizar)", controller: UsersController, handler: "atualizar" },
  { nome: "admin/usuarios (reset-senha)", controller: UsersController, handler: "resetarSenha" },
];

function contexto(alvo: Alvo, papel: Papel | undefined): ExecutionContext {
  const proto = alvo.controller.prototype as Record<string, unknown>;
  return {
    getHandler: () => proto[alvo.handler],
    getClass: () => alvo.controller,
    switchToHttp: () => ({
      getRequest: () => ({ user: papel ? { papel } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe("RBAC das rotas de exclusão/administração (DoD)", () => {
  const guard = new RolesGuard(new Reflector());

  for (const alvo of ALVOS) {
    it(`${alvo.nome} — nega COMUM`, () => {
      expect(() => guard.canActivate(contexto(alvo, "COMUM"))).toThrow(ForbiddenException);
    });

    it(`${alvo.nome} — permite MASTER e SUPER_ADMIN`, () => {
      expect(guard.canActivate(contexto(alvo, "MASTER"))).toBe(true);
      expect(guard.canActivate(contexto(alvo, "SUPER_ADMIN"))).toBe(true);
    });

    it(`${alvo.nome} — nega usuário ausente`, () => {
      expect(() => guard.canActivate(contexto(alvo, undefined))).toThrow(ForbiddenException);
    });
  }
});
