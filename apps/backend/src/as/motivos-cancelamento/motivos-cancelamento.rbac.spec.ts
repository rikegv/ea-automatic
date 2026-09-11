import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { MENUS, menuDaOperacao } from "../../domain/menus";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento.controller";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE CANCELAMENTO: A LEITURA É ABERTA, A ESCRITA É DO SUPER_ADMIN ────────
 *
 * ┌─ O MOLDE MAIS PRÓXIMO ESTÁ ERRADO PARA ESTE CASO, E É ISSO QUE ESTE TESTE GUARDA ──────────┐
 * │ `admin/motivos-declinio`, o catálogo irmão da Admissão, NÃO tem `@Roles` nenhum, e o        │
 * │ `MenuGuard` é FAIL-OPEN para operação não reivindicada. Copiar aquele molde aqui deixaria a │
 * │ ESCRITA aberta, e a próxima pessoa que abrisse os dois arquivos lado a lado concluiria que  │
 * │ o certo é o de lá. Este teste é quem diz que não é.                                        │
 * │                                                                                            │
 * │ E O MENU SOZINHO NÃO SEGURARIA O MASTER: o `MenuGuard` deixa o MASTER passar por PERTENCER  │
 * │ À ÁREA do menu, e há MASTER na área AS em produção. Quem tranca a porta é o `@Roles`, que é │
 * │ fail-closed no `RolesGuard`.                                                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ERRO SIMÉTRICO, do outro lado, é tão caro quanto: fechar a LEITURA junto daria 403 no seletor de
 * motivo para o consultor COMUM, que é justamente quem cancela vaga. O modal abriria com a lista
 * vazia, e o cancelamento inteiro pararia para quem opera.
 */
describe("motivos de cancelamento: a leitura é aberta, a escrita é do SUPER_ADMIN", () => {
  const ESCRITA = ["listar", "criar", "atualizar", "reativar", "inativar"] as const;

  it("a ESCRITA é @Roles(\"SUPER_ADMIN\") na CLASSE, cobrindo rota que ainda não existe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, MotivosCancelamentoVagaAdminController)).toEqual([
      "SUPER_ADMIN",
    ]);
  });

  it("nenhuma operação de escrita escapa por um @Roles de MÉTODO que afrouxe a classe", () => {
    const proto = MotivosCancelamentoVagaAdminController.prototype as unknown as Record<
      string,
      object
    >;
    for (const op of ESCRITA) {
      expect(typeof proto[op], `o handler ${op} precisa existir`).toBe("function");
      const noMetodo = Reflect.getMetadata(ROLES_KEY, proto[op]) as string[] | undefined;
      expect(noMetodo ?? ["SUPER_ADMIN"], `${op}`).toEqual(["SUPER_ADMIN"]);
    }
  });

  it("a LEITURA não tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, MotivosCancelamentoVagaController)).toBeUndefined();
    const proto = MotivosCancelamentoVagaController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(ROLES_KEY, proto.listar)).toBeUndefined();
  });

  /**
   * A LEITURA NUNCA PODE SER REIVINDICADA POR MENU, e este é o lado que NÃO admite exceção: o
   * `MenuGuard` resolve por nome de classe, então um menu que a reivindicasse daria 403 no seletor
   * de motivo para o consultor COMUM, e o modal de cancelar abriria com a lista vazia. É a mesma
   * falha que já tirou a Liberação do ar uma vez.
   */
  it("a LEITURA não é reivindicada por menu nenhum (senão o modal de cancelar dá 403 ao COMUM)", () => {
    expect(menuDaOperacao("MotivosCancelamentoVagaController", "listar")).toBeNull();
  });

  /**
   * A ADMINISTRAÇÃO ADMITE ZERO OU UM MENU, e a asserção é escrita assim de propósito: hoje é ZERO
   * (a fábrica não cria menu por conta própria, §A.23), e no dia em que o menu do catálogo for
   * registrado ele será UM. DOIS menus reivindicando a mesma classe é que seria defeito, porque a
   * resolução passaria a depender da ordem do registro.
   *
   * E, EM QUALQUER DOS DOIS ESTADOS, QUEM TRANCA A PORTA É O `@Roles` DA CLASSE, afirmado acima: o
   * menu decide se o card aparece, e o menu sozinho não segura o MASTER.
   */
  it("no máximo UM menu reivindica a administração, e a autoridade continua sendo o @Roles", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    expect(reivindicam("MotivosCancelamentoVagaAdminController").length).toBeLessThanOrEqual(1);
    expect(reivindicam("MotivosCancelamentoVagaController")).toEqual([]);
  });
});
