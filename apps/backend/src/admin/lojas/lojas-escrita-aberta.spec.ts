import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { LojasController } from "./lojas.controller";

/**
 * A LOJA É CADASTRADA POR QUALQUER CONSULTOR AUTENTICADO (decisão do diretor, Q3, 01/09/2026).
 *
 * A recomendação da fábrica era restringir a escrita a Master e Super Admin. O diretor mudou, com
 * razão operacional: quem sabe em qual loja a pessoa vai trabalhar é o consultor que opera a
 * liberação, e ele é perfil COMUM. Fechar o cadastro obrigaria a pedir uma loja nova para a
 * administração no meio de uma liberação.
 *
 * ESTE TESTE EXISTE PORQUE "ABERTO" É A AUSÊNCIA DE ALGO, e ausência não se defende sozinha: basta
 * alguém acrescentar quatro linhas no menu `clientes`, achando que está organizando, para o cadastro
 * fechar em silêncio para o perfil COMUM. Foi exatamente essa a falha que tirou a Liberação do ar
 * uma vez. Aqui a decisão vira asserção: reivindicar a escrita de lojas por menu quebra o teste.
 */
describe("lojas: escrita ABERTA a qualquer autenticado (Q3, decisão do diretor)", () => {
  const OPERACOES = ["list", "listAtivas", "create", "update", "reativar", "remove"] as const;

  it("nenhuma operação de loja é reivindicada por menu (nem leitura, nem escrita)", () => {
    for (const op of OPERACOES) {
      expect(menuDaOperacao("LojasController", op), `LojasController.${op}`).toBeNull();
    }
  });

  it("não há @Roles em CLASSE (a régua que derrubou a Liberação não pode voltar)", () => {
    expect(Reflect.getMetadata(ROLES_KEY, LojasController)).toBeUndefined();
  });

  it("não há @Roles de MÉTODO em nenhuma operação", () => {
    const proto = LojasController.prototype as unknown as Record<string, object>;
    for (const op of OPERACOES) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `LojasController.${op}`).toBeUndefined();
    }
  });
});
