import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { VagasController } from "./vagas.controller";

/**
 * ─ FECHAR VAGA NÃO TEM `@Roles`, E A AUSÊNCIA É A REGRA (lacuna que o tester provou, 08/09) ─────
 *
 * A DECISÃO. Todo consultor fecha uma vaga que entregou o que prometeu. O que é de MASTER é FORÇAR
 * o fechamento com posição oficial em aberto, e essa conferência mora no SERVICE, que é quem sabe
 * se a vaga entregou. Um `@Roles("MASTER","SUPER_ADMIN")` no handler barraria o fechamento NORMAL
 * do COMUM: a vaga que ele operou inteira deixaria de fechar justamente para ele.
 *
 * ┌─ POR QUE ESTE ARQUIVO PRECISOU EXISTIR, e a lacuna era exatamente esta ────────────────────┐
 * │ JÁ HAVIA UM TESTE dizendo proteger essa regressão (`vagas.fechamento-derivado.spec.ts`,     │
 * │ "FECHA normalmente com 5 de 5, INCLUSIVE para o COMUM"), mas ele chama o SERVICE. A         │
 * │ regressão que ele diz cobrir é um decorador no HANDLER, que o `RolesGuard` aplica ANTES de  │
 * │ o service existir na história: nenhum teste de service alcança isso. Acrescentar `@Roles`   │
 * │ na controller deixaria a suíte INTEIRA verde e o COMUM fora do sistema.                     │
 * │                                                                                            │
 * │ AUSÊNCIA NÃO SE DEFENDE SOZINHA: quatro linhas bem-intencionadas a apagam. O idioma é o do  │
 * │ `admin/lojas/lojas-escrita-aberta.spec.ts`, escrito depois de exatamente essa regressão     │
 * │ derrubar a tela de Liberação.                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A OUTRA METADE, que é o que impede este arquivo de virar um convite: "sem `@Roles`" NÃO quer
 * dizer "aberto a todos". A controller INTEIRA é reivindicada pelo menu `as-vagas`, leitura
 * incluída, e é o menu que controla quem entra. Se alguém tirar a reivindicação achando que está
 * "abrindo o A&S", o módulo fica exposto pela URL da API, e o teste quebra.
 */
describe("as/vagas: quem autoriza o fechamento é o SERVICE, nunca um @Roles na rota", () => {
  const OPERACOES = [
    "list",
    "opcoes",
    "contexto",
    "create",
    "atualizar",
    "editarPosicoes",
    "fechar",
  ] as const;

  it("não há @Roles em CLASSE: um decorador aqui barraria o COMUM em TODAS as rotas do A&S", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
  });

  it("não há @Roles de MÉTODO em nenhuma rota, e `fechar` é a que mais importa", () => {
    const proto = VagasController.prototype as unknown as Record<string, object>;
    for (const op of OPERACOES) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `VagasController.${op}`).toBeUndefined();
    }
  });

  /**
   * A CONTRAPARTIDA DA AUSÊNCIA. Sem o menu, "sem `@Roles`" viraria "aberto a qualquer autenticado",
   * e o A&S precisa ser invisível E INERTE para quem não tem o menu, inclusive pela URL da API.
   */
  it("a controller INTEIRA continua reivindicada pelo menu `as-vagas`, leitura incluída", () => {
    for (const op of OPERACOES) {
      expect(menuDaOperacao("VagasController", op), `VagasController.${op}`).toBe("as-vagas");
    }
  });
});
