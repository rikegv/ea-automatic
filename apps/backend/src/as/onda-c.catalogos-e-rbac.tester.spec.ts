import "reflect-metadata";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { MenusService } from "../auth/menus.service";
import { MenuAreasService } from "../auth/menu-areas.service";
import {
  MENUS,
  MENUS_BLOQUEADOS_COMUM,
  MENUS_QUE_NASCEM_FORA_DA_ADM,
  MENUS_SOMENTE_SUPER_ADMIN,
  menuDaOperacao,
} from "../domain/menus";
import { menus as tabelaMenus } from "../db/schema";
import { AsModule } from "./as.module";

/**
 * ─ ONDA C, PEÇA 1: QUEM EDITA A LINHA DE SERVIÇO, E QUEM SÓ A LÊ ──────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` JUNTO com a construção (§A.40 regra 2).
 * Auth/RBAC é gatilho de tema da §A.38: este arquivo é a metade do `tester`, e a auditoria
 * adversarial do `seguranca` é a outra. Nenhuma substitui a outra.
 *
 * ┌─ O FURO QUE ELE EXISTE PARA IMPEDIR, e ele é EXATAMENTE o do catálogo de etapas ────────────┐
 * │ "A rota está gatada pelo menu" NÃO É "só o SUPER_ADMIN escreve". O `MenuGuard` deixa o       │
 * │ MASTER PASSAR por PERTENCER À ÁREA, sem depender de marcação (`auth/guards/menu.guard.ts`),  │
 * │ e há MASTER na área AS em produção. Com o menu como única trava, qualquer Master de A&S       │
 * │ RENOMEIA a linha de serviço da operação inteira, e o rótulo renomeado reescreve o nome dela   │
 * │ em TODA vaga que já apontava para ele.                                                        │
 * │                                                                                              │
 * │ E O CONTRÁRIO CUSTA IGUAL: gatar a LEITURA daria 403 na abertura de vaga para o COMUM, que é  │
 * │ quem abre vaga. O catálogo tem de aparecer no seletor dele.                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ AS CONTROLLERS SÃO DESCOBERTAS PELA ROTA, E NÃO IMPORTADAS PELO NOME ───────────────────────
 *
 * Escrever este arquivo ANTES do código significa não saber que nome a classe vai ter. Importar
 * `LinhasServicoAdminController` seria apostar no nome: se a construção escolher outro, o teste
 * fica vermelho por MOTIVO ERRADO, e vermelho por motivo errado é ruído que se aprende a ignorar.
 *
 * O QUE O REQUISITO DIZ DE VERDADE É SOBRE A ROTA: existe uma superfície de ESCRITA em
 * `admin/as/linhas-servico` e uma de LEITURA em `as/linhas-servico`. É isso que se descobre no
 * metadado do Nest, varrendo os controllers do `AsModule`. O nome da classe fica livre.
 *
 * §A.6: nenhum dado pessoal entra aqui. Papéis de sessão, rotas e nomes de menu.
 */

/**
 * ─ OS AJUDANTES MORAM AQUI DENTRO, E ISSO É CORREÇÃO DE UMA DÍVIDA QUE EU MESMO CRIEI ─────────
 *
 * A primeira versão os pôs num `onda-c.tester-fake.ts`, e o `tsconfig.build.json` exclui
 * `**\/*.spec.ts` e mais nada: o arquivo COMPILAVA para o `dist` de produção. Era inerte (ninguém o
 * importava em produção), e peso morto no compilado é dívida do mesmo jeito. Dentro do `.spec` ele
 * fica fora do build por construção, em vez de por disciplina.
 */
type ClasseDeControlador = new (...args: never[]) => object;

/** Os controllers declarados por um módulo Nest, lidos do metadado do decorador. */
function controllersDoModulo(modulo: unknown): ClasseDeControlador[] {
  const lista = Reflect.getMetadata("controllers", modulo as object) as unknown;
  return Array.isArray(lista) ? (lista as ClasseDeControlador[]) : [];
}

/** A ROTA BASE, normalizada: `@Controller("as/x")` e `@Controller("/as/x")` são o mesmo endereço. */
function rotaDe(controller: ClasseDeControlador): string {
  const bruto = Reflect.getMetadata("path", controller) as unknown;
  return typeof bruto === "string" ? bruto.replace(/^\/+/, "").replace(/\/+$/, "") : "";
}

/** Os handlers, descobertos pelo protótipo: rota nova nasce dentro do laço, sem ninguém lembrar. */
function handlersDe(controller: ClasseDeControlador): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

/** A rota de ESCRITA do catálogo de linhas de serviço, como o `as-linhas-servico.ts` já a declara. */
const ROTA_ADMIN = "admin/as/linhas-servico";
/** A rota de LEITURA, que enche o seletor de quem abre vaga. */
const ROTA_LEITURA = "as/linhas-servico";
/** A leitura das cidades do IBGE, que enche o seletor de 5.570 opções. */
const ROTA_CIDADES = "as/cidades";

const CONTROLLERS = controllersDoModulo(AsModule);

function acharPorRota(rota: string) {
  return CONTROLLERS.find((c) => rotaDe(c) === rota) ?? null;
}

function exigirPorRota(rota: string) {
  const achada = acharPorRota(rota);
  if (!achada) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: nenhuma controller do AsModule responde por "${rota}". ` +
        `Rotas encontradas: ${JSON.stringify(CONTROLLERS.map(rotaDe))}`,
    );
  }
  return achada;
}

/**
 * ─ O GUARD DE VERDADE, E O `MenuAreasService` TAMBÉM DE VERDADE ───────────────────────────────
 *
 * ┌─ A CORREÇÃO QUE O `seguranca` PEDIU, e ele estava certo ────────────────────────────────────┐
 * │ A primeira versão falsificava `areasDaOperacao: async () => ["AS"]`. Isso substitui por uma   │
 * │ CONSTANTE justamente a dimensão que mordeu na Onda B: com ela fixa, um menu novo registrado   │
 * │ com a área errada (ADM em vez de AS, que é o DEFAULT fail-closed de quem esquece de declarar) │
 * │ passaria VERDE aqui e barraria o time inteiro de A&S em produção.                             │
 * │                                                                                              │
 * │ AGORA O SERVICE É O REAL. O que se dubla é só o BANCO, e as linhas do banco são as do próprio │
 * │ REGISTRO (`MENUS`), que é a fonte de onde o convergedor de boot as insere. Assim              │
 * │ `menuDaOperacao` roda de verdade, `areasDoMenu` roda de verdade, e a área do menu novo é a    │
 * │ que a construção declarou, não a que o teste quis.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function menuAreasReal(): MenuAreasService {
  const db = {
    select: () => ({
      from: (tabela: unknown) =>
        Promise.resolve(
          tabela === tabelaMenus ? MENUS.map((m) => ({ codigo: m.codigo, areas: m.areas })) : [],
        ),
    }),
  };
  return new MenuAreasService(db as never);
}

/**
 * O USUÁRIO TEM AS DUAS ÁREAS, e isso é deliberado: se ele tivesse só uma, este arquivo passaria a
 * afirmar a área do usuário em vez da área da OPERAÇÃO, e um menu registrado na área errada
 * continuaria escapando. Com as duas, o que decide é a interseção, e a interseção só falha se a
 * operação não tiver área nenhuma.
 */
function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set(["AS", "ADM"]) } as unknown as MenusService;
  return new RolesGuard(new Reflector(), menus, menuAreasReal());
}

function contexto(
  controller: new (...args: never[]) => object,
  handler: string,
  papel: Papel,
): ExecutionContext {
  const proto = controller.prototype as unknown as Record<string, unknown>;
  return {
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "u1", papel } }) }),
  } as unknown as ExecutionContext;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0. O CONTROLE DO PRÓPRIO HARNESS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ SEM ESTE BLOCO, OS 14 VERMELHOS ABAIXO NÃO PROVAM NADA ─────────────────────────────────────
 *
 * Este arquivo nasce inteiro vermelho de propósito (§A.40 regra 2). O risco disso é exatamente o
 * oposto do falso-verde: um harness QUEBRADO (o dublê do banco com a forma errada, o `Reflector` mal
 * montado, o `MenuAreasService` estourando) produziria a MESMA tela de falhas, e eu concluiria
 * "falta construir" quando o certo seria "meu teste não funciona".
 *
 * O CONTROLE É UMA SUPERFÍCIE QUE JÁ EXISTE E JÁ ESTÁ CERTA: o catálogo de ETAPAS, que é o molde
 * desta frente. Se o guard real, com o `MenuAreasService` real, barra o MASTER e deixa o SUPER_ADMIN
 * entrar em `admin/as/etapas`, então o harness responde, e o vermelho do resto é do requisito.
 */
describe("controle: o harness funciona contra uma superfície que JÁ existe", () => {
  const ETAPAS_ADMIN = "admin/as/etapas";

  it("acha a controller de escrita das etapas pelo metadado de rota", () => {
    expect(acharPorRota(ETAPAS_ADMIN)).not.toBeNull();
  });

  it("o guard real barra o MASTER na escrita das etapas", async () => {
    const admin = exigirPorRota(ETAPAS_ADMIN);
    const handler = handlersDe(admin)[0]!;
    await expect(
      guardReal().canActivate(contexto(admin as never, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("o guard real deixa o SUPER_ADMIN entrar na escrita das etapas", async () => {
    const admin = exigirPorRota(ETAPAS_ADMIN);
    const handler = handlersDe(admin)[0]!;
    await expect(
      guardReal().canActivate(contexto(admin as never, handler, "SUPER_ADMIN")),
    ).resolves.toBe(true);
  });

  /**
   * E O CONTROLE DA DIMENSÃO DE ÁREA, que é o motivo da correção deste arquivo: o `MenuAreasService`
   * real resolve a área da operação a partir do REGISTRO, e a das etapas é A&S. Se este teste passar
   * a devolver ADM, o dublê do banco parou de servir as linhas e todo o resto vira teatro.
   */
  it("a área da operação vem do registro, e a das etapas é A&S", async () => {
    const admin = exigirPorRota(ETAPAS_ADMIN);
    const handler = handlersDe(admin)[0]!;
    const areas = await menuAreasReal().areasDaOperacao(admin.name, handler);
    expect(areas).toContain("AS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. AS DUAS SUPERFÍCIES EXISTEM, E SÃO DUAS
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("o catálogo de linhas de serviço tem escrita e leitura SEPARADAS", () => {
  /**
   * UMA CLASSE SÓ NÃO SERVE, e o molde já resolveu isso três vezes (etapas, status da vaga, motivos
   * de cancelamento): com escrita e leitura na mesma controller, `@Roles("SUPER_ADMIN")` fecharia a
   * leitura junto e o consultor perderia o seletor da abertura de vaga.
   */
  it("existe uma controller de ESCRITA em admin/as/linhas-servico", () => {
    expect(acharPorRota(ROTA_ADMIN)).not.toBeNull();
  });

  it("existe uma controller de LEITURA em as/linhas-servico, SEPARADA da de escrita", () => {
    const leitura = acharPorRota(ROTA_LEITURA);
    expect(leitura).not.toBeNull();
    expect(leitura).not.toBe(acharPorRota(ROTA_ADMIN));
  });

  it("existe a leitura das cidades do IBGE em as/cidades", () => {
    expect(acharPorRota(ROTA_CIDADES)).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A ESCRITA É DO SUPER_ADMIN, MEDIDA PELO GUARD DE VERDADE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("a escrita do catálogo de linhas de serviço é do SUPER_ADMIN, e de mais ninguém", () => {
  /**
   * ─ O LAÇO SAI DO PROTÓTIPO, E NÃO DE UMA LISTA DIGITADA ──────────────────────────────────────
   * Rota de escrita que alguém acrescentar amanhã já nasce dentro do teste, sem ninguém lembrar de
   * voltar aqui. É o que a §A.6 pede ("toda rota sensível com guard"), e não "as rotas que o teste
   * conhece".
   */
  it("a controller de escrita tem handlers (o laço abaixo não pode ser vazio)", () => {
    expect(handlersDe(exigirPorRota(ROTA_ADMIN)).length).toBeGreaterThan(0);
  });

  it("o COMUM é barrado em TODOS os handlers de escrita", async () => {
    const admin = exigirPorRota(ROTA_ADMIN);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin as never, handler, "COMUM")),
        `escrita.${handler} para COMUM`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /**
   * O CASO QUE O MENU NÃO PEGA, e é o motivo inteiro deste bloco existir: o MASTER atravessa o
   * `MenuGuard` por ser da área. Se o `@Roles` listar MASTER (ou não existir), ele edita.
   */
  it("o MASTER é barrado em TODOS os handlers de escrita (o menu sozinho deixaria passar)", async () => {
    const admin = exigirPorRota(ROTA_ADMIN);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin as never, handler, "MASTER")),
        `escrita.${handler} para MASTER`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /**
   * ─ O CONTRASTE, E O DIRETOR PEDIU ESTE EM LETRAS MAIÚSCULAS ─────────────────────────────────
   * Sem ele, os dois casos acima seriam satisfeitos por uma rota que barra TODO MUNDO, e o catálogo
   * nasceria administrável por ninguém. Já mordeu nesta onda.
   */
  it("o SUPER_ADMIN PASSA em TODOS os handlers de escrita", async () => {
    const admin = exigirPorRota(ROTA_ADMIN);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin as never, handler, "SUPER_ADMIN")),
        `escrita.${handler} para SUPER_ADMIN`,
      ).resolves.toBe(true);
    }
  });
});

describe("a leitura é de quem abre vaga", () => {
  /**
   * O COMUM É QUEM ABRE VAGA. Um `@Roles` na leitura daria 403 no seletor de linha de serviço e no
   * de cidade, e a abertura de vaga inteira pararia para o perfil que mais a usa. É o incidente que
   * a régua da casa já pagou uma vez ("LER catálogo é dado de TRABALHO e continua ABERTO").
   */
  it("o COMUM passa em TODOS os handlers de leitura das linhas de serviço", async () => {
    const leitura = exigirPorRota(ROTA_LEITURA);
    for (const handler of handlersDe(leitura)) {
      await expect(
        guardReal().canActivate(contexto(leitura as never, handler, "COMUM")),
        `leitura.${handler} para COMUM`,
      ).resolves.toBe(true);
    }
  });

  it("o COMUM passa em TODOS os handlers de leitura das cidades", async () => {
    const cidades = exigirPorRota(ROTA_CIDADES);
    for (const handler of handlersDe(cidades)) {
      await expect(
        guardReal().canActivate(contexto(cidades as never, handler, "COMUM")),
        `cidades.${handler} para COMUM`,
      ).resolves.toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. A REIVINDICAÇÃO POR MENU, E A AUSÊNCIA DELA NA LEITURA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O CÓDIGO DO MENU do catálogo, descoberto pelo registro. O nome exato é escolha da construção
 * (`as-linhas-servico` é o provável, pelo molde do `as-etapas`), e o requisito é o menu EXISTIR e
 * estar nos lugares certos, não a grafia dele.
 */
function codigoDoMenuDoCatalogo(): string {
  const candidatos = MENUS.map((m) => m.codigo).filter(
    (c) => /linha/i.test(c) && /servico|serviço/i.test(c),
  );
  if (candidatos.length !== 1) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: esperava UM menu de linha de serviço no registro, achei ` +
        `${candidatos.length}: ${JSON.stringify(candidatos)}`,
    );
  }
  return candidatos[0]!;
}

describe("o menu reivindica a ESCRITA, e não encosta na leitura", () => {
  /**
   * ─ A CASA TEM DOIS PADRÕES VÁLIDOS AQUI, e o teste não escolhe entre eles ───────────────────
   *
   * `as-etapas` REIVINDICA os handlers do admin; `usuarios` e `menu-areas` declaram `operacoes: []`,
   * com o argumento escrito no próprio `domain/menus.ts`: a controller já é `@Roles("SUPER_ADMIN")`,
   * então marcá-la para outra pessoa não concederia nada (fail-closed no `RolesGuard`).
   *
   * OS DOIS ESTÃO CERTOS, e exigir um deles seria o teste impondo o gosto de quem o escreveu. O que
   * NÃO pode acontecer é a reivindicação apontar para um menu que NÃO é só do SUPER_ADMIN: aí o
   * menu vira a trava aparente de uma rota cuja trava real é outra, e alguém "simplifica" o
   * `@Roles` confiando nele.
   */
  it("se a escrita for reivindicada, o menu dela é SÓ do SUPER_ADMIN", () => {
    const admin = exigirPorRota(ROTA_ADMIN);
    for (const handler of handlersDe(admin)) {
      const menu = menuDaOperacao(admin.name, handler);
      if (menu === null) continue;
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(menu), `${handler} -> ${menu}`).toBe(true);
    }
  });

  /**
   * ─ A AUSÊNCIA NÃO SE DEFENDE SOZINHA ────────────────────────────────────────────────────────
   * Basta alguém acrescentar a controller de LEITURA à lista de operações do menu, achando que está
   * organizando, para o seletor da abertura fechar em silêncio para o COMUM. É o molde do
   * `lojas-escrita-aberta.spec.ts`, escrito depois de exatamente essa regressão derrubar uma tela.
   */
  it("nenhum handler de leitura é reivindicado por menu nenhum", () => {
    for (const rota of [ROTA_LEITURA, ROTA_CIDADES]) {
      const leitura = exigirPorRota(rota);
      for (const handler of handlersDe(leitura)) {
        expect(menuDaOperacao(leitura.name, handler), `${rota}.${handler}`).toBeNull();
      }
    }
  });

  /**
   * ─ §A.23: MENU NOVO NASCE SÓ PARA O SUPER_ADMIN ─────────────────────────────────────────────
   *
   * A regra é do diretor e é permanente: a fábrica REGISTRA o menu no catálogo e PARA POR AÍ. Não
   * distribui, não concede. O teste afirma as duas metades: o menu EXISTE (senão ele não é
   * liberável na tela de permissões, que foi o defeito do `clinicas` em 29/07) e ele está na lista
   * dos que são SÓ do SUPER_ADMIN.
   */
  /**
   * ─ O MENU NOVO ENTRA EM CINCO LUGARES, e não em um (condição da auditoria, §10 do mapa) ──────
   *
   * ┌─ POR QUE CINCO, e o que cada esquecimento custa ────────────────────────────────────────┐
   * │ 1. `MENUS`                        sem ele, o menu sobe funcionando e INVISÍVEL para       │
   * │                                   liberar (o caso `clinicas`, 29/07/2026);                │
   * │ 2. `MENUS_QUE_NASCEM_FORA_DA_ADM` sem ele, o menu de A&S nasce na área ADM, que é o       │
   * │                                   default fail-closed, e o time de A&S é barrado;         │
   * │ 3. `MENUS_BLOQUEADOS_COMUM`       sem ele, a tela de permissões OFERECE marcar o menu      │
   * │                                   para um COMUM, e a marcação não concede nada: promete   │
   * │                                   uma porta que o `RolesGuard` tranca;                    │
   * │ 4. `MENUS_SOMENTE_SUPER_ADMIN`    sem ele, o card APARECE para o Master e dá 403;         │
   * │ 5. `lib/menu-rotas.ts` (frontend) sem ele, a rota da tela não é governada por menu nenhum. │
   * └─────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OS QUATRO PRIMEIROS SÃO AFIRMÁVEIS AQUI. O quinto é do frontend e está coberto no relatório
   * como gap declarado: este arquivo não alcança `apps/frontend`.
   */
  it("o menu do catálogo entra nos QUATRO lugares do backend, e não só no registro", () => {
    const codigo = codigoDoMenuDoCatalogo();

    expect(MENUS.map((m) => m.codigo), "1. o registro").toContain(codigo);
    expect(MENUS_QUE_NASCEM_FORA_DA_ADM.has(codigo), "2. nasce fora da ADM (área AS)").toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has(codigo), "3. bloqueado para o COMUM").toBe(true);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(codigo), "4. só do SUPER_ADMIN").toBe(true);
  });

  /**
   * A ÁREA DECLARADA É A DE A&S, e este é o teste que o `guardReal` falsificado não deixava existir:
   * com `areasDaOperacao` fixada em `["AS"]`, um menu declarado com `areas: ["ADM"]` passava verde e
   * barrava o time inteiro em produção.
   */
  it("o menu nasce na área de A&S, e não no default ADM", () => {
    const def = MENUS.find((m) => m.codigo === codigoDoMenuDoCatalogo());
    expect(def, "o menu não está no registro").toBeDefined();
    expect(def!.areas ?? [], "menu de A&S sem área declarada cai em ADM, fail-closed").toContain(
      "AS",
    );
  });

  it("o menu do catálogo EXISTE no registro e nasce SÓ para o SUPER_ADMIN (§A.23)", () => {
    /*
     * O MENU PRECISA EXISTIR NO REGISTRO, e não é formalidade: a tela de liberação lista a TABELA
     * `menus`, que o `MenusCatalogoService` converge a partir DESTE registro a cada boot. Menu que
     * não está aqui sobe funcionando e INVISÍVEL PARA LIBERAR, que foi exatamente o que aconteceu
     * com o `clinicas` em 29/07/2026: rota, tela e CRUD no ar, e nenhuma opção na tela de permissões.
     */
    const codigos = MENUS.map((m) => m.codigo);
    const doCatalogo = codigos.filter((c) => /linha/i.test(c) && /servico|serviço/i.test(c));
    expect(
      doCatalogo.length,
      `Nenhum menu de linha de serviço registrado. Registrados: ${JSON.stringify(codigos)}`,
    ).toBeGreaterThan(0);

    for (const codigo of doCatalogo) {
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(codigo), `${codigo} fora do SÓ SUPER_ADMIN`).toBe(true);
    }
  });
});
