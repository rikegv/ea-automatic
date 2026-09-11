import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { beforeAll, describe, expect, it } from "vitest";
import { RolesGuard } from "../../auth/guards/roles.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { modulosQueMencionam } from "./vaga-status.tester-fake";

/**
 * ─ QUEM EDITA O CATÁLOGO DE STATUS DA VAGA É O SUPER_ADMIN: MEDIDO PELO GUARD ───────────────────
 *
 * ┌─ O CASO QUE O MENU NÃO PEGA, e é a razão de o `@Roles` existir ─────────────────────────────┐
 * │ "A rota está gatada pelo menu" NÃO é a mesma coisa que "só o SUPER_ADMIN escreve". O         │
 * │ `MenuGuard` deixa o MASTER PASSAR por PERTENCER À ÁREA (`auth/guards/menu.guard.ts`: "MASTER │
 * │ manda na área inteira"), e há MASTER na área AS em produção. Com o menu como única trava,    │
 * │ qualquer Master de A&S renomeia, reordena e INATIVA status de vaga, que é o dado de que      │
 * │ dependem o fechamento, o cancelamento, a trilha, o cilindro de ocupação e cinco telas.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMPORTAMENTAL, E NÃO "O DECORADOR ESTÁ LÁ": o `RolesGuard` de verdade é instanciado e chamado,
 * com o `Reflector` de verdade lendo a controller de verdade, e a afirmação é sobre QUEM ELE DEIXA
 * ENTRAR. O módulo já pagou pela distinção: existia teste VERDE afirmando que a rota de fechar vaga
 * não tinha `@Roles` enquanto o sistema era contornável pela rota irmã.
 *
 * A CONTROLLER É DESCOBERTA, não importada por nome (§A.40, regra 2: o teste veio antes do código).
 */

function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set(["AS", "ADM"]) } as unknown as MenusService;
  const areas = { areasDaOperacao: async () => ["AS"] } as unknown as MenuAreasService;
  return new RolesGuard(new Reflector(), menus, areas);
}

function contexto(
  controller: new (...args: never[]) => object,
  handler: string,
  papel: Papel,
): ExecutionContext {
  const proto = controller.prototype as unknown as Record<string, unknown>;
  return {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", papel } }) }),
  } as unknown as ExecutionContext;
}

const handlersDe = (c: new (...a: never[]) => object) =>
  Object.getOwnPropertyNames(c.prototype).filter(
    (n) => n !== "constructor" && typeof (c.prototype as Record<string, unknown>)[n] === "function",
  );

interface Achado {
  nome: string;
  classe: new (...a: never[]) => object;
  rota: string;
}

let escrita: Achado | null = null;
let leitura: Achado | null = null;
let vistas: string[] = [];

beforeAll(async () => {
  const { achados } = await modulosQueMencionam("VagaStatus");
  const controllers: Achado[] = [];
  for (const { mod } of achados) {
    for (const [nome, valor] of Object.entries(mod)) {
      if (typeof valor !== "function" || !/Controller$/.test(nome)) continue;
      const rota = String(Reflect.getMetadata("path", valor) ?? "");
      if (!/status/i.test(nome) && !/status/i.test(rota)) continue;
      controllers.push({ nome, classe: valor as new (...a: never[]) => object, rota });
    }
  }
  vistas = controllers.map((c) => `${c.nome} (@Controller("${c.rota}"))`);
  escrita = controllers.find((c) => /admin/i.test(c.rota) || /Admin/.test(c.nome)) ?? null;
  leitura = controllers.find((c) => c !== escrita) ?? null;
});

describe("a escrita do catálogo de status é do SUPER_ADMIN, e de mais ninguém", () => {
  it("existe uma controller de ESCRITA do catálogo, sob rota de administração", () => {
    expect(
      escrita,
      `nenhuma controller de administração do catálogo de status foi achada. Vistas: ${vistas.join(", ") || "nenhuma"}`,
    ).not.toBeNull();
  });

  /**
   * A MUTAÇÃO 5 MORRE AQUI: sem o `@Roles("SUPER_ADMIN")` na classe, o MASTER atravessa pelo menu e
   * passa a editar o catálogo que governa o desfecho de toda vaga.
   */
  it("o MASTER é barrado em TODOS os handlers de escrita (o menu sozinho deixaria passar)", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    const handlers = handlersDe(alvo.classe);
    expect(handlers.length, "a controller de escrita não pode estar vazia").toBeGreaterThan(0);
    for (const h of handlers) {
      await expect(
        guardReal().canActivate(contexto(alvo.classe, h, "MASTER")),
        `${alvo.nome}.${h} deixa o MASTER escrever`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("o COMUM é barrado em TODOS os handlers de escrita", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal().canActivate(contexto(alvo.classe, h, "COMUM")),
        `${alvo.nome}.${h} deixa o COMUM escrever`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /** O contraste, sem o qual os dois acima seriam satisfeitos por uma rota que barra todo mundo. */
  it("o SUPER_ADMIN passa em todos os handlers de escrita", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(guardReal().canActivate(contexto(alvo.classe, h, "SUPER_ADMIN"))).resolves.toBe(true);
    }
  });
});

describe("a LEITURA do catálogo é aberta a qualquer autenticado", () => {
  /**
   * O STATUS DA VAGA É DADO DE TRABALHO: a lista, a ficha, o painel, o cilindro de ocupação e os
   * seletores da tela leem o catálogo. Gatar a leitura daria 403 na Central de Vagas inteira para o
   * perfil COMUM, que é o incidente que a régua da casa já pagou uma vez.
   */
  it("existe uma controller de LEITURA do catálogo", () => {
    expect(
      leitura,
      `nenhuma controller de leitura do catálogo de status foi achada. Vistas: ${vistas.join(", ") || "nenhuma"}`,
    ).not.toBeNull();
  });

  it("o COMUM passa em todos os handlers de leitura, sem @Roles no caminho", async () => {
    expect(leitura).not.toBeNull();
    const alvo = leitura as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal().canActivate(contexto(alvo.classe, h, "COMUM")),
        `${alvo.nome}.${h} fecha a leitura do catálogo para o consultor`,
      ).resolves.toBe(true);
    }
  });
});
