import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { CargosController } from "./cargos/cargos.controller";
import { ClientesController } from "./clientes/clientes.controller";
import { menuDaOperacao } from "../domain/menus";

/**
 * REGRESSÃO DA RÉGUA DE ACESSO DOS CATÁLOGOS, evoluída pela OST de permissão de menu.
 *
 * A régua que estes testes protegem é a MESMA de antes: LER catálogo é dado de TRABALHO (aberto),
 * ESCREVER é restrito, e NENHUMA controller volta a ter `@Roles` em CLASSE (foi o que derrubou a
 * Liberação). O que MUDOU é só o ENFORCER da escrita: antes era `@Roles` de método, agora é o MENU
 * (a unidade de permissão virou a OPERAÇÃO, derivada do menu). O intento é idêntico; o mecanismo é o
 * que a OST veio implementar.
 *
 * Se alguém: (a) puser `@Roles` de volta na classe, o primeiro bloco quebra; (b) abrir uma escrita
 * (tirá-la do menu), o segundo quebra; (c) fechar a LEITURA de lista (reivindicá-la por menu), o
 * terceiro quebra.
 */

describe("catálogos: classe sem @Roles (a régua que derrubou a Liberação não pode voltar)", () => {
  it("nem Cargos nem Clientes têm @Roles em CLASSE", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CargosController)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, ClientesController)).toBeUndefined();
  });

  it("também não há @Roles de MÉTODO sobrando (o menu passou a governar a escrita)", () => {
    for (const m of ["list", "create", "update", "reativar", "remove"]) {
      expect(Reflect.getMetadata(ROLES_KEY, (CargosController.prototype as unknown as Record<string, unknown>)[m] as object)).toBeUndefined();
    }
  });
});

describe("escrita é governada por MENU; leitura de lista fica aberta", () => {
  it("toda ESCRITA de cargos é reivindicada por um menu", () => {
    for (const m of ["create", "update", "reativar", "remove"]) {
      expect(menuDaOperacao("CargosController", m), `cargos.${m}`).toBe("cargos");
    }
  });

  it("toda ESCRITA de clientes é reivindicada por um menu", () => {
    for (const m of ["create", "update", "definirVinculo", "reativar", "remove"]) {
      expect(menuDaOperacao("ClientesController", m), `clientes.${m}`).toBe("clientes");
    }
  });

  it("a LEITURA de lista (dado de trabalho) NÃO é reivindicada por menu (fica aberta)", () => {
    expect(menuDaOperacao("CargosController", "list")).toBeNull();
    expect(menuDaOperacao("ClientesController", "list")).toBeNull();
  });
});
