import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
} from "../../domain/menus";
import { LinhasServicoAdminController } from "./linhas-servico-admin.controller";
import { LinhasServicoController } from "./linhas-servico.controller";

/**
 * ─ A DÍVIDA DO MOLDE, PAGA: A PROVA QUE OS COMENTÁRIOS JÁ CITAVAM E QUE NÃO EXISTIA ────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO NASCE NA ONDA E, e não na C, que é quando a linha de serviço nasceu ───┐
 * │ `linhas-servico.controller.ts:18` e `linhas-servico-admin.controller.ts:30` AFIRMAM que      │
 * │ existe um teste provando, handler a handler, que a leitura resolve para `null` no MenuGuard  │
 * │ e que a escrita resolve para `as-linhas-servico`. Os equivalentes de `etapas-funil` e de     │
 * │ `vaga-status` existem; ESTE nunca foi escrito.                                               │
 * │                                                                                              │
 * │ ISSO É PIOR DO QUE NÃO TER TESTE: o comentário faz quem chega depois confiar numa prova que  │
 * │ não roda, e a Onda E manda COPIAR ESTE MOLDE para dois catálogos novos. Copiar o molde       │
 * │ copiaria a afirmação junto, e passariam a ser TRÊS catálogos dizendo que estão provados, com │
 * │ um teste só, o das etapas, que fala de outra coisa. A dívida é barata agora e cara depois.   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ POR QUE ELE GUARDA OS DOIS LADOS DE UM ERRO SIMÉTRICO ───────────────────────────────────────
 *
 * O `MenuGuard` resolve por NOME DE CLASSE (`menuDaOperacao`), e o default de uma operação NÃO
 * REIVINDICADA é PASSAR. Então os dois erros custam caro e nenhum dos dois falha sozinho:
 *   . REIVINDICAR A LEITURA (uma classe só, com `.*`) fecharia o `GET /as/linhas-servico` junto com
 *     a administração, e o seletor da abertura de vaga daria 403 para o consultor COMUM, que é
 *     quem abre vaga, num campo OBRIGATÓRIO para publicar;
 *   . NÃO REIVINDICAR A ESCRITA a deixaria ABERTA no MenuGuard. Ela ainda estaria fechada pelo
 *     `@Roles("SUPER_ADMIN")`, e é por isso que este arquivo afirma AS DUAS camadas, cada uma pelo
 *     seu motivo, nenhuma dependendo de a outra estar certa.
 *
 * §A.6: papéis, nomes de classe e códigos de menu. Nenhum dado pessoal.
 */
describe("linhas de serviço: a leitura é aberta, a escrita é de quem o diretor marcar", () => {
  const LEITURA = ["listar"] as const;
  const ESCRITA = ["criar", "reordenar", "renomear", "reativar", "inativar", "remover"] as const;

  /** A lista digitada não pode divergir do protótipo: handler novo tem de entrar na régua. */
  it("as listas acima cobrem TODOS os handlers das duas controllers", () => {
    const handlers = (c: object) =>
      Object.getOwnPropertyNames(c).filter(
        (n) => n !== "constructor" && typeof (c as Record<string, unknown>)[n] === "function",
      );
    expect(handlers(LinhasServicoController.prototype).sort()).toEqual([...LEITURA].sort());
    expect(handlers(LinhasServicoAdminController.prototype).sort()).toEqual([...ESCRITA].sort());
  });

  it("a LEITURA não é reivindicada por menu nenhum (senão a abertura de vaga dá 403 para o COMUM)", () => {
    for (const op of LEITURA) {
      expect(menuDaOperacao("LinhasServicoController", op), `LinhasServicoController.${op}`).toBeNull();
    }
  });

  it("a leitura NÃO tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, LinhasServicoController)).toBeUndefined();
    const proto = LinhasServicoController.prototype as unknown as Record<string, object>;
    for (const op of LEITURA) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `LinhasServicoController.${op}`).toBeUndefined();
    }
  });

  it("TODA operação de ESCRITA resolve para o menu `as-linhas-servico`", () => {
    for (const op of ESCRITA) {
      expect(
        menuDaOperacao("LinhasServicoAdminController", op),
        `LinhasServicoAdminController.${op}`,
      ).toBe("as-linhas-servico");
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
   * O CORINGA `LinhasServicoAdminController.*` continua cobrindo rota que ainda não existe, que é a
   * propriedade que o `@Roles` em CLASSE dava e que não podia ser perdida na troca: handler novo
   * nasce reivindicado em vez de nascer aberto.
   *
   * A PROPRIEDADE (o guard de verdade recusando quem não tem o menu, inclusive o MASTER sem
   * marcação) é medida em `as/catalogos-concediveis.rbac.spec.ts`, handler por handler.
   */
  it("a escrita NÃO tem mais @Roles em classe: quem tranca a porta é a reivindicação do menu", () => {
    expect(Reflect.getMetadata(ROLES_KEY, LinhasServicoAdminController)).toBeUndefined();
  });

  it("o menu `as-linhas-servico` existe, nasce só para o SUPER_ADMIN e é CONCEDÍVEL pelo diretor (§A.23)", () => {
    const menu = MENUS.find((m) => m.codigo === "as-linhas-servico");
    expect(menu, "o menu precisa existir no registro para ser selecionável na tela de liberação").toBeDefined();
    expect(menu?.areas, 'sem `areas: ["AS"]` o menu nasce em ADM e some para o time de A&S').toEqual(["AS"]);
    // AS DUAS LISTAS DE BLOQUEIO SAÍRAM (regra do diretor, 27/09/2026): elas TRAVAVAM a concessão,
    // uma na leitura (`filtrarMenusPorPapel`) e outra na gravação (`salvarSelecaoDaTela`), então a
    // tela oferecia a caixa, o diretor marcava e o acesso nunca chegava. A restrição mudou de casa,
    // para `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, que EXIGE a concessão em vez de a impedir.
    expect(MENUS_SOMENTE_SUPER_ADMIN.has("as-linhas-servico")).toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has("as-linhas-servico")).toBe(false);
    expect(masterPrecisaDeMarcacao("as-linhas-servico")).toBe(true);
  });

  /**
   * NENHUMA OUTRA CLASSE PODE REIVINDICAR ESTAS DUAS. Um menu novo que resolvesse por engano a
   * leitura (por exemplo com `LinhasServicoController.*`) não quebraria nada em desenvolvimento e
   * daria 403 na trilha de abertura do consultor, que é o modo de falha caro desta frente.
   */
  it("só o menu `as-linhas-servico` reivindica a administração, e ninguém reivindica a leitura", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    expect(reivindicam("LinhasServicoAdminController")).toEqual(["as-linhas-servico"]);
    expect(reivindicam("LinhasServicoController")).toEqual([]);
  });
});
