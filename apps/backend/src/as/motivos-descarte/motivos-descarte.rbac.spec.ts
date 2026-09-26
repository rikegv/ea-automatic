import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { MenuGuard } from "../../auth/guards/menu.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
} from "../../domain/menus";
import { MotivosDescarteAdminController } from "./motivos-descarte-admin.controller";
import { MotivosDescarteController } from "./motivos-descarte.controller";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE DESCARTE: A LEITURA É ABERTA, A ESCRITA É CONCEDIDA PELO MENU ───────
 *
 * ┌─ O QUE MUDOU, E POR QUE O `@Roles("SUPER_ADMIN")` SAIU (decisão do diretor) ────────────────┐
 * │ ESTE ARQUIVO AFIRMAVA O CONTRÁRIO, e afirmava certo para o desenho de então: a escrita era  │
 * │ `@Roles("SUPER_ADMIN")` na classe, e o menu era só a camada de UX. O diretor então fechou a │
 * │ decisão: o catálogo continua RESTRITO, e ele decide INDIVIDUALMENTE quem edita, podendo     │
 * │ CONCEDER o menu a quem quiser. Com o papel na classe isso era impossível de entregar: a     │
 * │ concessão do menu abria uma PORTA TRANCADA, com 403 no CARREGAMENTO da tela (ela lê o `GET` │
 * │ de administração ao abrir), e não só na hora de salvar.                                     │
 * │                                                                                             │
 * │ A AUTORIDADE PASSOU A SER O `MenuGuard`, que já reivindicava esta classe inteira            │
 * │ (`MotivosDescarteAdminController.*`). Ele é FAIL-OPEN só para operação NÃO reivindicada, e  │
 * │ esta é reivindicada: quem não tem o menu não alcança a rota nem digitando a URL.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PONTO QUE DECIDE SE A DECISÃO DO DIRETOR VALE: O ATALHO DO MASTER ───────────────────────┐
 * │ O `MenuGuard` deixa o MASTER passar por PERTENCER À ÁREA do menu, sem marcação nenhuma,     │
 * │ quando o código está FORA de `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`. Este menu é de área AS, │
 * │ e há MASTER na área AS em produção: fora daquela lista, TODOS eles ganhariam o catálogo     │
 * │ sozinhos, e não sobraria decisão individual nenhuma para o diretor tomar. É por isso que o  │
 * │ caso do MASTER SEM MARCAÇÃO está aqui, e ele é o teste mais importante do arquivo.          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ERRO SIMÉTRICO, do outro lado, é tão caro quanto: fechar a LEITURA junto daria 403 no seletor de
 * motivo para o consultor COMUM, que é justamente quem descarta candidato. O desfecho abriria com a
 * lista vazia, e como o servidor passou a RECUSAR motivo fora do catálogo, o descarte inteiro
 * pararia para quem opera. Por isso a leitura fica em CLASSE SEPARADA e fora do menu: tanto o
 * `MenuGuard` quanto o `@Roles` resolvem por CLASSE, então as duas superfícies não podem ser uma só.
 *
 * DOIS NÍVEIS DE ASSERÇÃO, de propósito: o primeiro bloco afirma o DESENHO (o metadado, o registro
 * do menu, as listas de papel) e o segundo afirma a PROPRIEDADE (o guard de verdade decide assim).
 * A distinção não é acadêmica: já houve teste VERDE afirmando decorador enquanto o sistema era
 * contornável.
 *
 * §A.6: nomes de motivo, códigos de menu e ids internos. Nenhum dado pessoal neste arquivo.
 */

const MENU = "as-motivos-descarte";

describe("motivos de descarte: o desenho da autorização", () => {
  const ESCRITA = ["listar", "criar", "atualizar", "reativar", "inativar"] as const;

  it("a ESCRITA NÃO tem mais @Roles: o papel deixou de ser a autoridade desta rota", () => {
    expect(Reflect.getMetadata(ROLES_KEY, MotivosDescarteAdminController)).toBeUndefined();
  });

  it("nenhuma operação de escrita reintroduz @Roles por MÉTODO", () => {
    const proto = MotivosDescarteAdminController.prototype as unknown as Record<string, object>;
    for (const op of ESCRITA) {
      expect(typeof proto[op], `o handler ${op} precisa existir`).toBe("function");
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), `${op}`).toBeUndefined();
    }
  });

  /**
   * SEM ESTA ASSERÇÃO, TIRAR O `@Roles` SERIA ABRIR A ROTA. O `MenuGuard` só fecha o que é
   * reivindicado; operação sem dono é ABERTA a qualquer autenticado. As duas mudanças (tirar o
   * papel e manter a reivindicação) só fazem sentido JUNTAS, e este teste é quem as amarra.
   */
  it("a ESCRITA é reivindicada pelo menu, senão tirar o @Roles teria ABERTO a rota", () => {
    for (const op of ESCRITA) {
      expect(menuDaOperacao("MotivosDescarteAdminController", op), `${op}`).toBe(MENU);
    }
  });

  it("a LEITURA não tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, MotivosDescarteController)).toBeUndefined();
    const proto = MotivosDescarteController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(ROLES_KEY, proto.listar)).toBeUndefined();
  });

  /**
   * A LEITURA NUNCA PODE SER REIVINDICADA POR MENU, e este é o lado que NÃO admite exceção: o
   * `MenuGuard` resolve por nome de classe, então um menu que a reivindicasse daria 403 no seletor
   * de motivo para o consultor COMUM, e o desfecho abriria com a lista vazia. O risco ficou MAIOR
   * depois desta frente, não menor: agora que o menu é a autoridade, a tentação de "reivindicar o
   * catálogo inteiro" tem consequência direta em quem só descarta candidato.
   */
  it("a LEITURA não é reivindicada por menu nenhum (senão o descarte dá 403 ao COMUM)", () => {
    expect(menuDaOperacao("MotivosDescarteController", "listar")).toBeNull();
  });

  it("UM menu reivindica a administração, e é ele a autoridade", () => {
    const reivindicam = (alvo: string) =>
      MENUS.filter((m) => m.operacoes.some((op) => op.startsWith(`${alvo}.`))).map((m) => m.codigo);
    // DOIS menus reivindicando a mesma classe seria defeito: a resolução passaria a depender da
    // ordem do registro, e a autoridade da rota viraria coincidência.
    expect(reivindicam("MotivosDescarteAdminController")).toEqual([MENU]);
    expect(reivindicam("MotivosDescarteController")).toEqual([]);
  });

  /**
   * AS TRÊS LISTAS DE PAPEL, E CADA UMA RESPONDE UMA PERGUNTA DIFERENTE. Juntas são o que faz o
   * menu NASCER só para o SUPER_ADMIN (§A.23) e mesmo assim ser CONCEDÍVEL:
   *   . `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`: DENTRO. É ela que fecha o atalho de área do MASTER;
   *   . `MENUS_SOMENTE_SUPER_ADMIN`: FORA. Ela removeria o menu do `/auth/me` de quem não é
   *     SUPER_ADMIN, e a marcação do diretor seria gravada sem valer nada;
   *   . `MENUS_BLOQUEADOS_COMUM`: FORA. Ela é filtrada ao SALVAR a config de um COMUM, então o
   *     menu nem chegaria a ser gravado para ele.
   */
  it("as três listas de papel estão como a decisão do diretor exige", () => {
    expect(masterPrecisaDeMarcacao(MENU), "o MASTER passaria pelo bypass de área").toBe(true);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(MENU), "o menu ficaria impossível de conceder").toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has(MENU), "a concessão a um COMUM seria filtrada ao salvar").toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// O GUARD DE VERDADE, instanciado e chamado: a propriedade, e não o decorador.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function handlersDe(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const ESCRITA = handlersDe(MotivosDescarteAdminController as never);
const LEITURA = handlersDe(MotivosDescarteController as never);

const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

/**
 * O GUARD COM O USUÁRIO DESCRITO PELOS MENUS QUE ELE TEM. A ÁREA é AS nos dois lados (o menu é de
 * A&S, e o usuário do cenário pertence a ela): o teto de área é conferido ANTES da marcação, então
 * um usuário fora da área seria barrado por outro motivo e o teste não falaria da concessão.
 */
function guardDe(codigos: string[], areasDoUsuario: Area[] = ["AS"]) {
  const menus = {
    permissaoDoUsuario: async () => ({
      codigos: new Set(codigos),
      areas: new Set(areasDoUsuario),
    }),
  } as unknown as MenusService;
  const menuAreas = {
    visivel: async (_codigo: string, doUsuario: Iterable<Area>) => [...doUsuario].includes("AS"),
  } as unknown as MenuAreasService;
  return new MenuGuard(reflector, menus, menuAreas);
}

function contexto(
  controller: new (...args: never[]) => object,
  handler: string,
  papel: string,
): never {
  return {
    getHandler: () => ({ name: handler }),
    getClass: () => ({ name: controller.name }),
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", papel } }) }),
  } as never;
}

describe("o guard de verdade: quem TEM o menu edita, quem não tem nem alcança a rota", () => {
  it("a controller de escrita tem handlers (os laços abaixo não podem ser vazios)", () => {
    expect(ESCRITA.length).toBeGreaterThan(0);
  });

  it.each(ESCRITA)("o COMUM COM o menu concedido edita em %s", async (handler) => {
    await expect(
      guardDe([MENU]).canActivate(contexto(MotivosDescarteAdminController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });

  it.each(ESCRITA)("o COMUM SEM o menu é recusado em %s", async (handler) => {
    await expect(
      guardDe(["as-vagas"]).canActivate(
        contexto(MotivosDescarteAdminController as never, handler, "COMUM"),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * O TESTE QUE SUSTENTA A DECISÃO DO DIRETOR. Sem a entrada nominal em
   * `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, este caso passa a RESOLVER `true` sozinho: o MASTER
   * entra pelo bypass de ÁREA, sem marcação, e o catálogo deixa de ser concedido para virar
   * consequência do papel. É o oposto exato do que foi pedido.
   */
  it.each(ESCRITA)("o MASTER SEM marcação é recusado em %s (o atalho de área não vale aqui)", async (handler) => {
    await expect(
      guardDe([]).canActivate(contexto(MotivosDescarteAdminController as never, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ESCRITA)("o MASTER COM marcação edita em %s", async (handler) => {
    await expect(
      guardDe([MENU]).canActivate(
        contexto(MotivosDescarteAdminController as never, handler, "MASTER"),
      ),
    ).resolves.toBe(true);
  });

  /** O contraste, sem o qual os casos acima seriam satisfeitos por uma rota que barra todo mundo. */
  it.each(ESCRITA)("o SUPER_ADMIN passa em %s, sem depender de marcação", async (handler) => {
    await expect(
      guardDe([]).canActivate(
        contexto(MotivosDescarteAdminController as never, handler, "SUPER_ADMIN"),
      ),
    ).resolves.toBe(true);
  });
});

describe("o guard de verdade: a LEITURA é do consultor, senão o descarte para para quem opera", () => {
  it("a controller de leitura tem handlers", () => {
    expect(LEITURA.length).toBeGreaterThan(0);
  });

  it.each(LEITURA)("o COMUM SEM menu nenhum passa em %s (o dropdown serve a todos)", async (handler) => {
    await expect(
      guardDe([]).canActivate(contexto(MotivosDescarteController as never, handler, "COMUM")),
    ).resolves.toBe(true);
  });

  it.each(LEITURA)("o MASTER sem marcação também lê em %s", async (handler) => {
    await expect(
      guardDe([]).canActivate(contexto(MotivosDescarteController as never, handler, "MASTER")),
    ).resolves.toBe(true);
  });
});
