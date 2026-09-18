import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { VagasController } from "./vagas.controller";

/**
 * AS DUAS ROTAS DA FILA DE REVISÃO DE VAGAS, E ELAS TÊM AUTORIDADES OPOSTAS
 *
 * `liberar-revisao` NÃO tem `@Roles`, `corrigir-revisao` TEM, e as duas decisões são deliberadas.
 * Até este arquivo existir, NENHUM teste afirmava nenhuma das duas: tirar o decorador da correção
 * deixava a suíte inteira verde, e um COMUM passaria a poder trocar o cliente de uma vaga já
 * liberada. Decorador de handler roda no `RolesGuard`, ANTES de o service existir na história, então
 * nenhum teste de service (nem o `vagas.correcao-de-cliente.spec.ts`) alcança isto.
 *
 * O PAR É FÁCIL DE UNIFORMIZAR NA DIREÇÃO ERRADA, e é por isso que as duas pontas vivem no mesmo
 * arquivo: quem acrescentar `@Roles` no liberar tira do consultor o trabalho do dia a dia dele, e
 * quem tirar `@Roles` da correção entrega a troca de cliente a qualquer autenticado. Um teste por
 * ponta, lado a lado, para que a leitura de um lembre do outro.
 */

const papeis = (nome: string): unknown =>
  Reflect.getMetadata(
    ROLES_KEY,
    (VagasController.prototype as unknown as Record<string, object>)[nome],
  );

describe("as/vagas: a fila de revisão, liberar é do consultor e corrigir é de Master", () => {
  it("o handler do liberar e o da correção continuam existindo com estes nomes", () => {
    const proto = VagasController.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.liberarRevisao, "VagasController.liberarRevisao").toBe("function");
    expect(typeof proto.corrigirRevisao, "VagasController.corrigirRevisao").toBe("function");
  });

  /**
   * CORRIGIR É DE MASTER, POR INTEIRO. Corrigir a liberação é desfazer o trabalho de outra pessoa e
   * TROCAR O CLIENTE de uma vaga, o que redefine sob qual controlador ficam todas as candidaturas
   * penduradas nela (§A.6). Não é operação de rotina: é a rede de segurança da liberação errada.
   */
  it("a correção exige MASTER e SUPER_ADMIN, exatamente esses dois papéis", () => {
    const exigidos = papeis("corrigirRevisao");
    expect(exigidos, "sem @Roles, o COMUM troca o cliente da vaga pela URL da API").toBeDefined();
    expect(new Set(exigidos as string[])).toEqual(new Set(["MASTER", "SUPER_ADMIN"]));
    expect(exigidos, "o COMUM nunca corrige").not.toContain("COMUM");
  });

  /**
   * O `SUPER_ADMIN` PRECISA ESTAR ESCRITO, e é a linha que quase toda suíte de RBAC esquece: o
   * `RolesGuard` confere `required.includes(user.papel)` e LANÇA antes da linha que trata o
   * SUPER_ADMIN como acima da segmentação (`auth/guards/roles.guard.ts`). Logo `@Roles("MASTER")`
   * sozinho BARRA O PRÓPRIO DIRETOR, e um teste que afirme só "o COMUM leva 403" fica verde com ele.
   * É o molde do `reabrir`.
   */
  it("o SUPER_ADMIN é explícito, o RolesGuard não o promove sozinho", () => {
    expect(papeis("corrigirRevisao")).toContain("SUPER_ADMIN");
  });

  /**
   * A AUSÊNCIA NO LIBERAR É DELIBERADA, NÃO ESQUECIMENTO, e este comentário é metade do valor do
   * teste. DECISÃO DO DIRETOR: revisar a vaga que chegou do Pandapé, vincular o cliente que falta e
   * liberar é FLUXO OPERACIONAL DO DIA A DIA de qualquer consultor, no mesmo molde da Liberação
   * Admissional. Um `@Roles("MASTER","SUPER_ADMIN")` aqui, escrito de boa fé por simetria com a
   * rota vizinha, PARARIA A FILA: quem revisa vaga não é Master, e a fila de revisão deixaria de
   * andar justamente para quem a opera. O que é de Master aqui é DESFAZER, e só.
   *
   * Ausência não se defende sozinha, quatro linhas bem-intencionadas a apagam. Idioma do
   * `vagas.fechar-sem-roles.spec.ts` e do `admin/lojas/lojas-escrita-aberta.spec.ts`.
   */
  it("o liberar NÃO tem @Roles, e a ausência é a regra, não um esquecimento a consertar", () => {
    expect(
      papeis("liberarRevisao"),
      "@Roles aqui barra o consultor que opera a fila de revisão, veja o comentário acima",
    ).toBeUndefined();
  });

  it("nada foi promovido para a CLASSE, um @Roles ali barraria o liberar por tabela", () => {
    expect(Reflect.getMetadata(ROLES_KEY, VagasController)).toBeUndefined();
  });

  /**
   * A CONTRAPARTIDA DA AUSÊNCIA: "sem `@Roles`" não quer dizer "aberto a todos". As duas rotas
   * continuam reivindicadas pelo menu `as-vagas`, e é o menu que controla quem entra. Perdida a
   * reivindicação, o liberar fica alcançável por qualquer autenticado pela URL da API.
   */
  it("as duas rotas continuam reivindicadas pelo menu `as-vagas`", () => {
    for (const nome of ["liberarRevisao", "corrigirRevisao"]) {
      expect(menuDaOperacao("VagasController", nome), `VagasController.${nome}`).toBe("as-vagas");
    }
  });
});
