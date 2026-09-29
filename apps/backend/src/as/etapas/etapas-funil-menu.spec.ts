import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
} from "../../domain/menus";
import { EtapasFunilAdminController } from "./etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas-funil.controller";

/**
 * ─ A LINHA QUE SEPARA A LEITURA DO CATÁLOGO DA ESCRITA DELE, AFIRMADA HANDLER A HANDLER ─────────
 *
 * ┌─ POR QUE ESTE TESTE EXISTE, e ele guarda os DOIS lados de um erro simétrico ──────────────────┐
 * │ O `MenuGuard` resolve por NOME DE CLASSE (`menuDaOperacao`), e o default de uma operação NÃO   │
 * │ REIVINDICADA é PASSAR. Então os dois erros custam caro e nenhum dos dois falha sozinho:        │
 * │                                                                                                │
 * │   . REIVINDICAR A LEITURA (uma classe só, com `.*`) fecharia o `GET /as/etapas` junto com a    │
 * │     administração, e o funil inteiro (pill, cards do mover, seletor do lote) daria 403 para o  │
 * │     consultor COMUM. É a mesma falha que já tirou a Liberação do ar uma vez.                    │
 * │   . NÃO REIVINDICAR A ESCRITA a deixaria ABERTA no MenuGuard. Aqui ela ainda estaria fechada   │
 * │     pelo `@Roles("SUPER_ADMIN")`, e é por isso que o teste afirma AS DUAS COISAS: a camada de  │
 * │     papel e a camada de menu, cada uma pelo seu motivo, nenhuma dependendo de a outra estar    │
 * │     certa.                                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MENU SOZINHO NÃO SEGURARIA O MASTER, e é isso que torna o `@Roles` obrigatório em vez de zelo:
 * `menu.guard.ts` deixa o MASTER passar por PERTENCER À ÁREA do menu, e há MASTER na área AS em
 * produção. Um `@Roles` removido "porque o menu já cuida" entregaria o vocabulário do funil a eles.
 */
describe("etapas do funil: a leitura é aberta, a escrita é de quem o diretor marcar", () => {
  const LEITURA = ["listar"] as const;
  const ESCRITA = [
    "criar",
    "renomear",
    "definirTom",
    "definirInicial",
    "reativar",
    // A CONTRAPARTE do `reativar`, acrescentada com a rota de inativação explícita. Ela entra na
    // lista por ser escrita: fora daqui, ninguém afirmaria que ela é reivindicada pelo menu.
    "inativar",
    "reordenar",
    "remover",
  ] as const;

  it("a LEITURA não é reivindicada por menu nenhum (senão o funil dá 403 para o COMUM)", () => {
    for (const op of LEITURA) {
      expect(menuDaOperacao("EtapasFunilController", op), `EtapasFunilController.${op}`).toBeNull();
    }
  });

  it("a leitura NÃO tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, EtapasFunilController)).toBeUndefined();
    const proto = EtapasFunilController.prototype as unknown as Record<string, object>;
    for (const op of LEITURA) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `EtapasFunilController.${op}`).toBeUndefined();
    }
  });

  it("TODA operação de ESCRITA resolve para o menu `as-etapas`", () => {
    for (const op of ESCRITA) {
      expect(
        menuDaOperacao("EtapasFunilAdminController", op),
        `EtapasFunilAdminController.${op}`,
      ).toBe("as-etapas");
    }
  });

  /**
   * ─ A AUTORIDADE MUDOU DE DONO (regra do diretor, 27/09/2026) ──────────────────────────────────
   *
   * O `@Roles("SUPER_ADMIN")` SAIU da classe: o Super Admin concede QUALQUER tela a QUALQUER
   * usuário, e com o papel na classe a concessão do menu abria uma PORTA TRANCADA. Quem tranca a
   * porta passou a ser a REIVINDICAÇÃO afirmada no caso acima, e ela não é decorativa: o
   * `MenuGuard` é FAIL-OPEN para operação que ninguém reivindica, então tirar o papel sem ela teria
   * ABERTO a rota a qualquer autenticado.
   *
   * O CORINGA `EtapasFunilAdminController.*` continua cobrindo rota que ainda não existe, que é a
   * propriedade que o `@Roles` em CLASSE dava e que não podia ser perdida na troca: handler novo
   * nasce reivindicado em vez de nascer aberto.
   *
   * A PROPRIEDADE (o guard de verdade recusando quem não tem o menu, inclusive o MASTER sem
   * marcação) é medida em `as/catalogos-concediveis.rbac.spec.ts`, handler por handler.
   */
  it("a escrita NÃO tem mais @Roles em classe: quem tranca a porta é a reivindicação do menu", () => {
    expect(Reflect.getMetadata(ROLES_KEY, EtapasFunilAdminController)).toBeUndefined();
  });

  it("o menu `as-etapas` existe, nasce só para o SUPER_ADMIN e é CONCEDÍVEL pelo diretor (§A.23)", () => {
    const menu = MENUS.find((m) => m.codigo === "as-etapas");
    expect(menu, "o menu precisa existir no registro para ser selecionável na tela de liberação").toBeDefined();
    expect(menu?.areas, "sem `areas: [\"AS\"]` o menu nasce em ADM e some para o time de A&S").toEqual(["AS"]);
    // AS DUAS LISTAS DE BLOQUEIO SAÍRAM (regra do diretor, 27/09/2026): elas TRAVAVAM a concessão,
    // uma na leitura (`filtrarMenusPorPapel`) e outra na gravação (`salvarSelecaoDaTela`), então a
    // tela oferecia a caixa, o diretor marcava e o acesso nunca chegava. A restrição mudou de casa,
    // para `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, que EXIGE a concessão em vez de a impedir.
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-etapas")).toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-etapas")).toBe(false);
    expect(masterPrecisaDeMarcacao("as-etapas")).toBe(true);
  });

  /**
   * NENHUMA OUTRA CLASSE PODE REIVINDICAR ESTAS DUAS. Um menu novo que resolvesse por engano a
   * leitura (por exemplo com `EtapasFunilController.*`) não quebraria nada em desenvolvimento e
   * daria 403 na Central de Candidatos do consultor, que é o modo de falha caro desta frente.
   */
  it("só o menu `as-etapas` reivindica a administração, e ninguém reivindica a leitura", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    expect(reivindicam("EtapasFunilAdminController")).toEqual(["as-etapas"]);
    expect(reivindicam("EtapasFunilController")).toEqual([]);
  });
});
