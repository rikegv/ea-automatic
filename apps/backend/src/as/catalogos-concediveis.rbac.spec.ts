import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Area } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../auth/decorators";
import { MenuGuard } from "../auth/guards/menu.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_PADRAO_COMUM,
  MENUS_SOMENTE_SUPER_ADMIN,
  codigosPadraoDoPapel,
  filtrarMenusPorPapel,
  masterPrecisaDeMarcacao,
  menuDaOperacao,
  restricaoDeConcessao,
} from "../domain/menus";
import { ComerciaisAdminController } from "./comerciais/comerciais-admin.controller";
import { EtapasFunilAdminController } from "./etapas/etapas-funil-admin.controller";
import { EtapasFunilController } from "./etapas/etapas-funil.controller";
import { LinhasServicoAdminController } from "./linhas-servico/linhas-servico-admin.controller";
import { LinhasServicoController } from "./linhas-servico/linhas-servico.controller";
import { MotivosCancelamentoVagaAdminController } from "./motivos-cancelamento/motivos-cancelamento-admin.controller";
import { MotivosCancelamentoVagaController } from "./motivos-cancelamento/motivos-cancelamento.controller";
import { MotivosReenvioShortlistAdminController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist-admin.controller";
import { MotivosReenvioShortlistController } from "./motivos-reenvio-shortlist/motivos-reenvio-shortlist.controller";
import { SegmentosAdminController } from "./segmentos/segmentos-admin.controller";
import { SegmentosController } from "./segmentos/segmentos.controller";
import { VagaStatusAdminController } from "./vaga-status/vaga-status-admin.controller";
import { VagaStatusController } from "./vaga-status/vaga-status.controller";

/**
 * ═ OS SETE CATÁLOGOS DE CONFIGURAÇÃO DE A&S VIRARAM CONCEDÍVEIS (regra do diretor, 27/09/2026) ═══
 *
 * A REGRA, com todas as letras: o Super Admin concede QUALQUER tela a QUALQUER usuário. Não existe
 * mais tela de configuração que ele não possa conceder, e é ele que decide, pessoa a pessoa, quem
 * enxerga e quem configura o quê.
 *
 * ┌─ O DEFEITO QUE ISTO CONSERTA, MEDIDO, e ele é o pior possível numa tela de concessão ────────┐
 * │ A tela de permissões OFERECIA a caixa marcável destes sete códigos, o diretor marcava, a tela │
 * │ salvava SEM RECLAMAR e o backend DESCARTAVA EM SILÊNCIO, porque                               │
 * │ `MENUS_SOMENTE_SUPER_ADMIN` era aplicada na GRAVAÇÃO (`auth/menus.service.ts`) e de novo na   │
 * │ LEITURA (`filtrarMenusPorPapel`). Ninguém via erro, e a pessoa simplesmente não recebia o     │
 * │ acesso.                                                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PONTO MAIS PERIGOSO DA FRENTE, E É POR ELE QUE ESTE ARQUIVO EXISTE ───────────────────────┐
 * │ O `MenuGuard` é FAIL-OPEN para operação que NINGUÉM reivindica (`menu.guard.ts`: sem menu     │
 * │ exigido, passa). Então remover o `@Roles("SUPER_ADMIN")` de uma controller de administração   │
 * │ SEM a reivindicação correspondente NÃO a restringe: ABRE A ROTA A QUALQUER AUTENTICADO. As    │
 * │ duas mudanças só fazem sentido JUNTAS, e é este arquivo que as amarra, catálogo por catálogo, │
 * │ HANDLER POR HANDLER, com o coringa derivado do registro e não redigitado.                     │
 * │                                                                                               │
 * │ O CORINGA NÃO DISPENSA A VARREDURA POR HANDLER: `Controller.*` reivindica a classe, mas quem  │
 * │ responde à pergunta é `menuDaOperacao(classe, handler)`, e é essa resposta que o guard         │
 * │ consulta. Afirmar a string do registro provaria o registro; percorrer os handlers prova a      │
 * │ ROTA.                                                                                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ERRO SIMÉTRICO É TÃO CARO QUANTO, e tem bloco próprio no fim: fechar a LEITURA junto daria 403
 * no seletor/pill/filtro do consultor COMUM, que é quem opera. A leitura de cada catálogo vive em
 * CLASSE SEPARADA, sem `@Roles` e reivindicada por menu NENHUM, e isto é afirmado um a um.
 *
 * §A.6: códigos de menu, nomes de classe e nomes de handler. Nenhum dado pessoal neste arquivo.
 */

/** Um catálogo da frente: a classe de administração, a de leitura (quando existe) e o menu. */
interface Catalogo {
  nome: string;
  menu: string;
  admin: new (...args: never[]) => object;
  /**
   * `null` SÓ para `as-comerciais`, e a ausência é desenho, não lacuna: aquele catálogo guarda NOME
   * DE PESSOA e nunca teve leitura aberta. Quem precisa da lista a recebe por superfície já gatada.
   */
  leitura: (new (...args: never[]) => object) | null;
}

const CATALOGOS: Catalogo[] = [
  {
    nome: "etapas do funil",
    menu: "as-etapas",
    admin: EtapasFunilAdminController as never,
    leitura: EtapasFunilController as never,
  },
  {
    nome: "status da vaga",
    menu: "as-status-vaga",
    admin: VagaStatusAdminController as never,
    leitura: VagaStatusController as never,
  },
  {
    nome: "motivos de cancelamento",
    menu: "as-motivos-cancelamento",
    admin: MotivosCancelamentoVagaAdminController as never,
    leitura: MotivosCancelamentoVagaController as never,
  },
  {
    nome: "linhas de serviço",
    menu: "as-linhas-servico",
    admin: LinhasServicoAdminController as never,
    leitura: LinhasServicoController as never,
  },
  {
    nome: "segmentos",
    menu: "as-segmentos",
    admin: SegmentosAdminController as never,
    leitura: SegmentosController as never,
  },
  {
    nome: "comerciais",
    menu: "as-comerciais",
    admin: ComerciaisAdminController as never,
    leitura: null,
  },
  {
    nome: "motivos de reenvio",
    menu: "as-motivos-reenvio",
    admin: MotivosReenvioShortlistAdminController as never,
    leitura: MotivosReenvioShortlistController as never,
  },
];

function handlersDe(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const reflector = { getAllAndOverride: () => false } as unknown as Reflector;

/**
 * O GUARD DE VERDADE, com o usuário descrito pelos menus que ele TEM. A área é AS nos dois lados: o
 * teto de área é conferido ANTES da marcação, então um usuário fora da área seria barrado por OUTRO
 * motivo e o teste não falaria da concessão, que é o que está em jogo aqui.
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. O DESENHO: O PAPEL SAIU, A REIVINDICAÇÃO FICOU, E AS LISTAS DE PAPEL MUDARAM DE CASA
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe.each(CATALOGOS)("$nome: o desenho da autorização", ({ menu, admin }) => {
  const ADMIN = handlersDe(admin);

  it("a controller de administração tem handlers (os laços abaixo não podem ser vazios)", () => {
    expect(ADMIN.length).toBeGreaterThan(0);
  });

  it("a administração NÃO tem mais @Roles em CLASSE: o papel deixou de ser a autoridade", () => {
    expect(Reflect.getMetadata(ROLES_KEY, admin)).toBeUndefined();
  });

  it("nenhum handler reintroduz @Roles por MÉTODO", () => {
    const proto = admin.prototype as unknown as Record<string, object>;
    for (const op of ADMIN) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), op).toBeUndefined();
    }
  });

  /**
   * ═ O TESTE QUE O DESPACHO DESTA FRENTE MANDOU ESCREVER, E O MOTIVO ESTÁ NO GUARD ═══════════
   *
   * SEM ESTA ASSERÇÃO, TIRAR O `@Roles` SERIA ABRIR A ROTA. O `MenuGuard` só fecha o que é
   * reivindicado; operação sem dono é ABERTA a qualquer autenticado. É por handler, e não pela
   * string do registro, porque é a resposta de `menuDaOperacao` que o guard consulta.
   */
  it("TODO handler da administração é reivindicado pelo menu, senão a rota estaria ABERTA", () => {
    for (const op of ADMIN) {
      expect(menuDaOperacao(admin.name, op), `${admin.name}.${op}`).toBe(menu);
    }
  });

  it("UM único menu reivindica a administração, e é ele a autoridade", () => {
    // DOIS menus reivindicando a mesma classe seria defeito: a resolução passaria a depender da
    // ordem do registro, e a autoridade da rota viraria coincidência.
    const reivindicam = MENUS.filter((m) =>
      m.operacoes.some((op) => op.startsWith(`${admin.name}.`)),
    ).map((m) => m.codigo);
    expect(reivindicam).toEqual([menu]);
  });

  /**
   * AS TRÊS LISTAS DE PAPEL, cada uma respondendo uma pergunta diferente. Juntas são o que faz o
   * menu NASCER só para o SUPER_ADMIN (§A.23) e mesmo assim ser CONCEDÍVEL:
   *   . `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`: DENTRO. Fecha o atalho de ÁREA do MASTER;
   *   . `MENUS_SOMENTE_SUPER_ADMIN`: FORA. Ela removeria o menu do `/auth/me` de quem não é
   *     SUPER_ADMIN, e a marcação do diretor seria gravada sem valer nada;
   *   . `MENUS_BLOQUEADOS_COMUM`: FORA. Ela é filtrada ao SALVAR a config de um COMUM, então o menu
   *     nem chegaria a ser gravado para ele.
   */
  it("as três listas de papel estão como a regra do diretor exige", () => {
    expect(masterPrecisaDeMarcacao(menu), "o MASTER passaria pelo bypass de área").toBe(true);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(menu), "o menu ficaria impossível de conceder").toBe(false);
    expect(MENUS_BLOQUEADOS_COMUM.has(menu), "a concessão a um COMUM seria filtrada").toBe(false);
  });

  it("é CONCEDÍVEL: a marcação sobrevive ao filtro por papel, nos dois papéis que a recebem", () => {
    expect(filtrarMenusPorPapel([menu], "MASTER")).toEqual([menu]);
    expect(filtrarMenusPorPapel([menu], "COMUM")).toEqual([menu]);
  });

  it("A PORTA DO NASCIMENTO CONTINUA FECHADA (§A.23): ninguém nasce com o menu", () => {
    expect(codigosPadraoDoPapel("MASTER")).not.toContain(menu);
    expect(codigosPadraoDoPapel("COMUM")).not.toContain(menu);
    // E fora do padrão que `backfill-menus-comum` concede em massa.
    expect(MENUS_PADRAO_COMUM).not.toContain(menu);
    // O SUPER_ADMIN é o dono do menu no dia em que ele nasce.
    expect(codigosPadraoDoPapel("SUPER_ADMIN")).toContain(menu);
  });

  it("a tela recebe `restricao: NENHUMA`, que é o que faz a caixa ficar marcável de verdade", () => {
    expect(restricaoDeConcessao(menu)).toBe("NENHUMA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. A PROPRIEDADE: O GUARD DE VERDADE, INSTANCIADO E CHAMADO
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe.each(CATALOGOS)("$nome: o guard de verdade", ({ menu, admin }) => {
  const ADMIN = handlersDe(admin);

  it.each(ADMIN)("o COMUM COM o menu concedido passa em %s", async (handler) => {
    await expect(guardDe([menu]).canActivate(contexto(admin, handler, "COMUM"))).resolves.toBe(true);
  });

  /**
   * ═ A PROVA DE QUE A ROTA NÃO FICOU ABERTA ═══════════════════════════════════════════════════
   *
   * É o caso que a remoção do `@Roles` poderia ter estragado: um autenticado QUALQUER, com um menu
   * de A&S na mão (`as-vagas`) mas SEM este, tem de tomar 403. Se a reivindicação faltar, o guard
   * devolve `true` aqui e este teste fica vermelho antes de a frente chegar em produção.
   */
  it.each(ADMIN)("o COMUM SEM o menu é RECUSADO em %s (fail-open provaria aqui)", async (handler) => {
    await expect(
      guardDe(["as-vagas"]).canActivate(contexto(admin, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  /**
   * O TESTE QUE SUSTENTA A DECISÃO INDIVIDUAL DO DIRETOR. Sem a entrada nominal em
   * `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, este caso RESOLVE `true` sozinho: o MASTER entra pelo
   * bypass de ÁREA, sem marcação, e o catálogo deixa de ser concedido para virar consequência do
   * papel. Há MASTER na área AS em produção, então seriam todos eles de uma vez.
   */
  it.each(ADMIN)("o MASTER SEM marcação é RECUSADO em %s (o atalho de área não vale)", async (handler) => {
    await expect(
      guardDe([]).canActivate(contexto(admin, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(ADMIN)("o MASTER COM marcação passa em %s", async (handler) => {
    await expect(guardDe([menu]).canActivate(contexto(admin, handler, "MASTER"))).resolves.toBe(
      true,
    );
  });

  /** O contraste, sem o qual os casos acima seriam satisfeitos por uma rota que barra todo mundo. */
  it.each(ADMIN)("o SUPER_ADMIN passa em %s, sem depender de marcação", async (handler) => {
    await expect(guardDe([]).canActivate(contexto(admin, handler, "SUPER_ADMIN"))).resolves.toBe(
      true,
    );
  });

  /**
   * O TETO DE ÁREA CONTINUA POR CIMA DE TUDO, e o despacho desta frente pediu isso explicitamente:
   * conceder menu de OUTRA área não pode passar a funcionar. Mesmo com a marcação na mão, quem está
   * só na ADM é recusado, e é recusado ANTES da pergunta da marcação.
   */
  it.each(ADMIN)("quem está fora da área AS é recusado em %s, mesmo COM a marcação", async (handler) => {
    await expect(
      guardDe([menu], ["ADM"]).canActivate(contexto(admin, handler, "COMUM")),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardDe([menu], ["ADM"]).canActivate(contexto(admin, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. O LIMITE DA FRENTE: A LEITURA CONTINUA ABERTA, E NADA DE ADMINISTRAÇÃO VAZOU PARA ELA
// ─────────────────────────────────────────────────────────────────────────────────────────────

const COM_LEITURA = CATALOGOS.filter((c) => c.leitura !== null);

describe.each(COM_LEITURA)("$nome: a LEITURA é do consultor e não foi tocada", ({ leitura }) => {
  const CLASSE = leitura as new (...args: never[]) => object;
  const LEITURA = handlersDe(CLASSE);

  it("a controller de leitura tem handlers", () => {
    expect(LEITURA.length).toBeGreaterThan(0);
  });

  it("não tem @Roles, nem em classe nem em método", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CLASSE)).toBeUndefined();
    const proto = CLASSE.prototype as unknown as Record<string, object>;
    for (const op of LEITURA) {
      expect(Reflect.getMetadata(ROLES_KEY, proto[op]), op).toBeUndefined();
    }
  });

  /**
   * A LEITURA NUNCA PODE SER REIVINDICADA POR MENU, e este é o lado que NÃO admite exceção: o
   * `MenuGuard` resolve por NOME DE CLASSE, então um menu que a reivindicasse daria 403 no seletor,
   * na pill e no filtro do consultor COMUM. O risco ficou MAIOR depois desta frente, não menor:
   * agora que o menu é a autoridade, a tentação de "reivindicar o catálogo inteiro" tem consequência
   * direta em quem só opera vaga.
   */
  it("nenhum handler de leitura é reivindicado por menu nenhum", () => {
    for (const op of LEITURA) {
      expect(menuDaOperacao(CLASSE.name, op), `${CLASSE.name}.${op}`).toBeNull();
    }
  });

  it.each(LEITURA)("o COMUM SEM menu nenhum passa em %s (o dropdown serve a todos)", async (handler) => {
    await expect(guardDe([]).canActivate(contexto(CLASSE, handler, "COMUM"))).resolves.toBe(true);
  });

  it.each(LEITURA)("o MASTER sem marcação também lê em %s", async (handler) => {
    await expect(guardDe([]).canActivate(contexto(CLASSE, handler, "MASTER"))).resolves.toBe(true);
  });
});

/**
 * ─ O CATÁLOGO DE COMERCIAIS NÃO TEM LEITURA ABERTA, E ISSO PRECISA SER AFIRMADO ─────────────────
 *
 * Ele é o único dos sete em que o `@Get` de listagem mora DENTRO da controller de administração,
 * porque a lista é NOME DE PESSOA (§A.6). O coringa `ComerciaisAdminController.*` cobre esse `@Get`,
 * e é por isso que remover o `@Roles` dali NÃO abriu a folha do comercial: os laços do bloco 2 já
 * percorreram o handler de leitura junto dos de escrita.
 *
 * SE ALGUÉM CRIAR UMA `ComerciaisController` ABERTA um dia, este teste quebra, que é o que obriga a
 * decisão a ser deliberada em vez de entrar de carona numa frente de permissão.
 */
describe("comerciais: a listagem de NOMES fica atrás do menu, e não há classe aberta ao lado", () => {
  it("o `listar` da administração é reivindicado como qualquer escrita", () => {
    expect(handlersDe(ComerciaisAdminController as never)).toContain("listar");
    expect(menuDaOperacao("ComerciaisAdminController", "listar")).toBe("as-comerciais");
  });

  it("nenhum menu reivindica uma `ComerciaisController`, porque ela não existe", () => {
    expect(MENUS.some((m) => m.operacoes.some((op) => op.startsWith("ComerciaisController.")))).toBe(
      false,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. O QUE SOBROU NÃO CONCEDÍVEL, E É PROPOSITAL
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ─ AS DUAS TELAS QUE CONCEDEM PERMISSÃO CONTINUAM FORA DA REGRA, e a exceção é do diretor ───────
 *
 * `usuarios` marca menu por usuário e cadastra ÁREA; `menu-areas` escreve a ÁREA de cada menu, que é
 * o teto aplicado por cima de tudo. Torná-las concedíveis criaria caminho de AUTO-CONCESSÃO: quem
 * recebesse passaria a poder conceder a si mesmo qualquer outro menu, e a decisão individual deixaria
 * de ser do diretor. É por isso que "o Super Admin concede QUALQUER tela" não as alcança.
 *
 * ESTE TESTE É A LISTA PINADA do que sobrou, e quebrar ao acrescentar ou remover um código é o
 * comportamento desejado: entrar ou sair daqui é decisão do diretor (§A.23), nunca efeito colateral.
 */
describe("o que continua NÃO concedível depois desta frente", () => {
  it("sobraram exatamente as duas telas que CONCEDEM permissão", () => {
    expect([...MENUS_SOMENTE_SUPER_ADMIN]).toEqual(["usuarios", "menu-areas"]);
    for (const c of MENUS_SOMENTE_SUPER_ADMIN) {
      expect(restricaoDeConcessao(c)).toBe("SO_SUPER_ADMIN");
    }
  });

  it("nenhum dos sete catálogos de A&S sobrou em qualquer das duas listas de bloqueio", () => {
    for (const { menu } of CATALOGOS) {
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(menu), menu).toBe(false);
      expect(MENUS_BLOQUEADOS_COMUM.has(menu), menu).toBe(false);
    }
  });

  /**
   * O RESTO DO SISTEMA NÃO FOI TOCADO, e a asserção é o par obrigatório da de cima: a frente mexeu
   * em SETE códigos, e qualquer menu a mais que tenha mudado de regime aparece aqui.
   */
  it("os menus NÃO concedíveis a um COMUM são só os `@Roles` admin-only de sempre", () => {
    expect([...MENUS_BLOQUEADOS_COMUM].sort()).toEqual(
      ["diagnostico", "entradas-pandape", "menu-areas", "usuarios"].sort(),
    );
    for (const c of ["diagnostico", "entradas-pandape"]) {
      expect(restricaoDeConcessao(c)).toBe("NAO_PARA_COMUM");
    }
  });
});
