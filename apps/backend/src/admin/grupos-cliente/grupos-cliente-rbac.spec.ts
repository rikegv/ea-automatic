import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { GruposClienteController } from "./grupos-cliente.controller";

/**
 * A RÉGUA DE ACESSO DO GRUPO DE CLIENTES, travada em teste.
 *
 * Duas decisões do diretor viram teste aqui, e nenhuma é formalidade:
 *
 * 1. **NÃO existe menu novo.** O grupo mora dentro da tela de Clientes, e quem administra cliente
 *    administra grupo. Reivindicar as escritas para um menu próprio faria o botão nascer invisível
 *    para todo mundo (§A.23, menu novo nasce só para o SUPER_ADMIN), que é o contrário do pedido.
 * 2. **A leitura fica aberta**, como no resto do cadastro: a ficha do cliente mostra o grupo, e uma
 *    leitura reivindicada faria a ficha tomar 403 de quem só consulta. É o mesmo defeito que já
 *    matou o dropdown do Gerador de Kit uma vez.
 */

const ESCRITAS = ["criar", "atualizar", "previaMembros", "definirMembros"];
const LEITURAS = ["listar", "obter", "catalogoDeClientes", "grupoDoCliente"];

describe("grupos de cliente: quem governa é o menu, nunca @Roles", () => {
  it("a controller NÃO tem @Roles em classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, GruposClienteController)).toBeUndefined();
  });

  it("nenhum método tem @Roles", () => {
    const proto = GruposClienteController.prototype as unknown as Record<string, unknown>;
    for (const m of [...ESCRITAS, ...LEITURAS]) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[m] as object), m).toBeUndefined();
    }
  });
});

describe("grupos de cliente: escrita no menu CLIENTES, leitura aberta", () => {
  it("toda escrita pertence ao menu `clientes`, e não a um menu novo", () => {
    for (const m of ESCRITAS) {
      expect(menuDaOperacao("GruposClienteController", m), `escrita ${m}`).toBe("clientes");
    }
  });

  it("nenhuma leitura é reivindicada por menu", () => {
    for (const m of LEITURAS) {
      expect(menuDaOperacao("GruposClienteController", m), `leitura ${m}`).toBeNull();
    }
  });

  /**
   * A PRÉVIA É ESCRITA para efeito de permissão, embora não grave nada: ela devolve o mapa de quem
   * sai de qual grupo, que é informação de administração. Deixá-la aberta entregaria o desenho do
   * agrupamento a qualquer autenticado.
   */
  it("a PRÉVIA é tratada como escrita, e não como leitura", () => {
    expect(menuDaOperacao("GruposClienteController", "previaMembros")).toBe("clientes");
  });
});
