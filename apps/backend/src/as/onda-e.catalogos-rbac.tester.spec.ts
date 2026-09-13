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
 * ─ ONDA E, PEÇA 1: QUEM EDITA SEGMENTO E COMERCIAL, E QUEM SÓ OS LÊ ────────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` JUNTO com a construção (§A.40 regra 2),
 * A PARTIR DO REQUISITO e não do código. Auth/RBAC é gatilho de tema da §A.38: este arquivo é a
 * metade do `tester`; a auditoria adversarial do `seguranca` é a outra, e nenhuma substitui a outra.
 *
 * ┌─ O QUE MUDA DE PESO NESTA ONDA, e não mudava na C ───────────────────────────────────────────┐
 * │ `as_comerciais` GUARDA NOME DE PESSOA (o §6 do mapa diz isso com todas as letras). É o        │
 * │ primeiro catálogo desta frente com PII, e ele vai para a tela, para o filtro e para a ficha   │
 * │ da vaga. A régua da §A.6 aqui é a mesma dos demais catálogos (a ESCRITA é do SUPER_ADMIN, a   │
 * │ LEITURA é de quem abre vaga), e é justamente por carregar nome que a escrita não pode cair    │
 * │ para o Master "porque é da área".                                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O FURO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ────────────────────────────────────────────────┐
 * │ "A rota está gatada pelo menu" NÃO É "só o SUPER_ADMIN escreve". O `MenuGuard` deixa o MASTER │
 * │ PASSAR por PERTENCER À ÁREA, sem depender de marcação (`auth/guards/menu.guard.ts`), e há     │
 * │ MASTER na área AS em produção. Com o menu como única trava, qualquer Master de A&S RENOMEIA   │
 * │ o segmento da operação inteira, e o rótulo renomeado reescreve o nome dele em TODO cliente e  │
 * │ em TODA vaga que herda dele.                                                                  │
 * │                                                                                               │
 * │ E O CONTRÁRIO CUSTA IGUAL: gatar a LEITURA daria 403 no seletor do cadastro de cliente e no   │
 * │ filtro da Central de Vagas, para o perfil que mais os usa.                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ AS CONTROLLERS SÃO DESCOBERTAS PELA ROTA, E NÃO IMPORTADAS PELO NOME ────────────────────────
 *
 * Escrever antes do código significa não saber o nome da classe. Importar `SegmentosAdminController`
 * seria apostar no nome: escolhido outro, o teste fica vermelho por MOTIVO ERRADO, e vermelho por
 * motivo errado é ruído que se aprende a ignorar. O requisito é sobre a ROTA (uma superfície de
 * ESCRITA em `admin/as/...` e uma de LEITURA em `as/...`), e a rota se lê no metadado do Nest.
 *
 * A BUSCA É POR RADICAL (`/segmento/`, `/comercia/`), não por caminho exato, pelo mesmo motivo:
 * `admin/as/segmentos` é o provável pelo molde, mas `admin/as/segmento` cumpre o mesmo requisito.
 *
 * §A.6: nenhum dado pessoal entra neste arquivo. Papéis de sessão, rotas e códigos de menu. Nenhum
 * nome de comercial é escrito aqui, nem em asserção nem em mensagem de erro.
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

const CONTROLLERS = controllersDoModulo(AsModule);
const ROTAS = CONTROLLERS.map(rotaDe);

function acharPorRota(rota: string) {
  return CONTROLLERS.find((c) => rotaDe(c) === rota) ?? null;
}

/** A controller de ESCRITA de um catálogo: rota que começa em `admin/as/` e cita o radical. */
function escritaDoCatalogo(radical: RegExp) {
  return CONTROLLERS.find((c) => /^admin\/as\//.test(rotaDe(c)) && radical.test(rotaDe(c))) ?? null;
}

/** A de LEITURA: rota que começa em `as/` (NÃO `admin/`) e cita o radical. */
function leituraDoCatalogo(radical: RegExp) {
  return CONTROLLERS.find((c) => /^as\//.test(rotaDe(c)) && radical.test(rotaDe(c))) ?? null;
}

function exigir(achada: ClasseDeControlador | null, oque: string) {
  if (!achada) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: nenhuma controller do AsModule responde por ${oque}. ` +
        `Rotas encontradas: ${JSON.stringify(ROTAS)}`,
    );
  }
  return achada;
}

/**
 * ─ O GUARD DE VERDADE, E O `MenuAreasService` TAMBÉM DE VERDADE ────────────────────────────────
 *
 * Falsificar `areasDaOperacao` substituiria por uma CONSTANTE justamente a dimensão que morde: com
 * ela fixa, um menu novo registrado com a área errada (ADM em vez de AS, que é o DEFAULT
 * fail-closed de quem esquece de declarar) passaria VERDE aqui e barraria o time inteiro de A&S em
 * produção. O que se dubla é só o BANCO, e as linhas do banco são as do próprio REGISTRO (`MENUS`),
 * que é a fonte de onde o convergedor de boot as insere.
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

/** O usuário tem as DUAS áreas de propósito: o que decide passa a ser a área da OPERAÇÃO. */
function guardReal(): RolesGuard {
  const menus = { areasDoUsuario: async () => new Set(["AS", "ADM"]) } as unknown as MenusService;
  return new RolesGuard(new Reflector(), menus, menuAreasReal());
}

function contexto(
  controller: ClasseDeControlador,
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
 * SEM ESTE BLOCO, OS VERMELHOS ABAIXO NÃO PROVAM NADA. Este arquivo nasce vermelho de propósito
 * (§A.40 regra 2), e o risco disso é o oposto do falso-verde: um harness QUEBRADO (dublê do banco
 * com a forma errada, `Reflector` mal montado) produziria a MESMA tela de falhas, e eu concluiria
 * "falta construir" quando o certo seria "meu teste não funciona".
 *
 * O CONTROLE É UMA SUPERFÍCIE QUE JÁ EXISTE E JÁ ESTÁ CERTA: o catálogo de LINHAS DE SERVIÇO, que é
 * o molde EXATO que a OST manda copiar.
 */
describe("controle: o harness responde contra o molde (linhas de serviço), que JÁ existe", () => {
  const MOLDE_ADMIN = "admin/as/linhas-servico";
  const MOLDE_LEITURA = "as/linhas-servico";

  it("acha as duas controllers do molde pelo metadado de rota", () => {
    expect(acharPorRota(MOLDE_ADMIN), MOLDE_ADMIN).not.toBeNull();
    expect(acharPorRota(MOLDE_LEITURA), MOLDE_LEITURA).not.toBeNull();
  });

  it("o guard real barra o MASTER e deixa o SUPER_ADMIN na escrita do molde", async () => {
    const admin = exigir(acharPorRota(MOLDE_ADMIN), MOLDE_ADMIN);
    const handler = handlersDe(admin)[0]!;
    await expect(
      guardReal().canActivate(contexto(admin, handler, "MASTER")),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guardReal().canActivate(contexto(admin, handler, "SUPER_ADMIN")),
    ).resolves.toBe(true);
  });

  it("a área da operação vem do registro, e a do molde é A&S", async () => {
    const admin = exigir(acharPorRota(MOLDE_ADMIN), MOLDE_ADMIN);
    const handler = handlersDe(admin)[0]!;
    expect(await menuAreasReal().areasDaOperacao(admin.name, handler)).toContain("AS");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. OS DOIS CATÁLOGOS, CADA UM COM AS SUAS DUAS SUPERFÍCIES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ A LISTA DOS DOIS É ESCRITA À MÃO, e isso é a correção do PONTO CEGO DE 11/09 ────────────────
 *
 * Derivar os casos de uma CONSTANTE de produção (um `CATALOGOS_AS` qualquer) faria o laço ENCOLHER
 * junto com ela: apagada a entrada, o teste some em silêncio e fica verde. Esta lista é do TESTE,
 * tem dois itens digitados, e não encolhe sozinha. Os casos escritos à mão do bloco 4 são a segunda
 * metade da mesma trava.
 */
const CATALOGOS = [
  { nome: "segmento", radical: /segmento/i, menu: /segmento/i, leituraAberta: true },
  /**
   * ─ O COMERCIAL NÃO TEM LEITURA ABERTA, E ISSO É ACHADO DA AUDITORIA DO MAPA, NÃO ESTILO ──────
   *
   * `as_comerciais` guarda NOME DE PESSOA. No molde, a controller de leitura fica FORA da
   * reivindicação de menu de propósito, e o `MenuGuard` libera o que ninguém reivindica: a lista
   * inteira de nomes ficaria disponível a QUALQUER sessão autenticada, inclusive de quem não opera
   * A&S. Para catálogo de processo (linha de serviço, etapa, cidade) isso é correto; para nome de
   * pessoa, não é (§A.6, minimização de quem lê dado pessoal).
   *
   * ENTÃO A REGRA INVERTE PARA ESTE CATÁLOGO: quem devolve nome de comercial é FECHADO, e a lista
   * que o filtro da Central de Vagas precisa vem por `VagasService.opcoes()`, que já está atrás de
   * `VagasController.*` (menu `as-vagas`).
   */
  { nome: "comercial", radical: /comercia/i, menu: /comercia/i, leituraAberta: false },
] as const;

describe.each(CATALOGOS)("o catálogo de $nome tem escrita e leitura SEPARADAS", ({
  radical,
  leituraAberta,
}) => {
  /**
   * UMA CLASSE SÓ NÃO SERVE, e o molde já resolveu isso quatro vezes (etapas, status da vaga,
   * motivos de cancelamento, linhas de serviço): com escrita e leitura na mesma controller,
   * `@Roles("SUPER_ADMIN")` fecharia a leitura junto e o cadastro de cliente perderia o seletor.
   */
  it("existe uma controller de ESCRITA em admin/as/...", () => {
    expect(escritaDoCatalogo(radical), `rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
  });

  it("a superfície de LEITURA, quando existe, é uma classe SEPARADA da de escrita", () => {
    const leitura = leituraDoCatalogo(radical);
    // PARA O SEGMENTO ELA É OBRIGATÓRIA (a OST pede a leitura na controller sem `admin/`). Para o
    // COMERCIAL ela é OPCIONAL, e se existir NÃO pode ser aberta: quem afirma isso é o bloco da
    // leitura, logo abaixo.
    if (leituraAberta) expect(leitura, `rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
    if (leitura) expect(leitura).not.toBe(escritaDoCatalogo(radical));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A ESCRITA É DO SUPER_ADMIN, MEDIDA PELO GUARD DE VERDADE
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.each(CATALOGOS)("a escrita do catálogo de $nome é do SUPER_ADMIN, e de mais ninguém", ({
  nome,
  radical,
}) => {
  /** O laço abaixo não pode ser vazio: controller sem handler passaria em tudo por não ter o que testar. */
  it("a controller de escrita tem handlers", () => {
    expect(handlersDe(exigir(escritaDoCatalogo(radical), `escrita de ${nome}`)).length).toBeGreaterThan(0);
  });

  /**
   * OS CINCO VERBOS DA OST, e este caso é o que separa "tem uma controller" de "tem o CRUD pedido".
   * Criar, renomear, reordenar, inativar e reativar: o requisito nomeia os cinco, e um catálogo sem
   * reativar deixa o segmento inativado por engano fora de circulação para sempre.
   *
   * A BUSCA É PELO RADICAL DO NOME DO MÉTODO, não pelo verbo HTTP: `inativar`/`desativar` e
   * `reativar`/`ativar` cumprem o mesmo requisito, e o teste não escolhe o gosto de quem escreve.
   */
  it("o CRUD tem os CINCO verbos da OST (criar, renomear, reordenar, inativar, reativar)", () => {
    const handlers = handlersDe(exigir(escritaDoCatalogo(radical), `escrita de ${nome}`)).join(" ");
    for (const [verbo, padrao] of [
      ["criar", /criar|create|post/i],
      ["renomear", /renomear|rename|atualizar|editar/i],
      ["reordenar", /reordenar|reorder|ordem/i],
      ["inativar", /inativar|desativar|remover|delete/i],
      ["reativar", /reativar|ativar/i],
    ] as const) {
      expect(padrao.test(handlers), `falta o verbo ${verbo}. Handlers: ${handlers}`).toBe(true);
    }
  });

  it("o COMUM é barrado em TODOS os handlers de escrita", async () => {
    const admin = exigir(escritaDoCatalogo(radical), `escrita de ${nome}`);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin, handler, "COMUM")),
        `escrita.${handler} para COMUM`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /**
   * O CASO QUE O MENU NÃO PEGA, e é o motivo inteiro deste bloco existir: o MASTER atravessa o
   * `MenuGuard` por ser da área. Se o `@Roles` listar MASTER (ou não existir), ele edita.
   */
  it("o MASTER é barrado em TODOS os handlers de escrita (o menu sozinho deixaria passar)", async () => {
    const admin = exigir(escritaDoCatalogo(radical), `escrita de ${nome}`);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin, handler, "MASTER")),
        `escrita.${handler} para MASTER`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /**
   * O CONTRASTE. Sem ele, os dois casos acima seriam satisfeitos por uma rota que barra TODO MUNDO,
   * e o catálogo nasceria administrável por ninguém. Já mordeu na Onda C.
   */
  it("o SUPER_ADMIN PASSA em TODOS os handlers de escrita", async () => {
    const admin = exigir(escritaDoCatalogo(radical), `escrita de ${nome}`);
    for (const handler of handlersDe(admin)) {
      await expect(
        guardReal().canActivate(contexto(admin, handler, "SUPER_ADMIN")),
        `escrita.${handler} para SUPER_ADMIN`,
      ).resolves.toBe(true);
    }
  });
});

/**
 * ─ A LEITURA, E ELA TEM DUAS RÉGUAS DIFERENTES NESTA ONDA ──────────────────────────────────────
 *
 * SEGMENTO é catálogo de PROCESSO ("Varejo", "Saúde"): a leitura é ABERTA, como a das linhas de
 * serviço e a das cidades, porque ela enche o seletor do cadastro de cliente e o filtro da Central,
 * e fechá-la daria 403 no seletor de quem opera, sem erro visível na tela.
 *
 * COMERCIAL é NOME DE PESSOA: a leitura NÃO pode ser aberta. Ver o comentário em `CATALOGOS`.
 */
describe("a leitura do catálogo de SEGMENTO é de quem cadastra e de quem filtra", () => {
  const radical = /segmento/i;

  it("o COMUM passa em TODOS os handlers de leitura", async () => {
    const leitura = exigir(leituraDoCatalogo(radical), "leitura de segmento");
    for (const handler of handlersDe(leitura)) {
      await expect(
        guardReal().canActivate(contexto(leitura, handler, "COMUM")),
        `leitura.${handler} para COMUM`,
      ).resolves.toBe(true);
    }
  });

  it("o MASTER também passa na leitura (ele é da área e opera a Central)", async () => {
    const leitura = exigir(leituraDoCatalogo(radical), "leitura de segmento");
    for (const handler of handlersDe(leitura)) {
      await expect(
        guardReal().canActivate(contexto(leitura, handler, "MASTER")),
        `leitura.${handler} para MASTER`,
      ).resolves.toBe(true);
    }
  });
});

describe("a leitura do catálogo de COMERCIAL é FECHADA: é nome de pessoa (§A.6)", () => {
  /**
   * ─ O DEFEITO QUE A ONDA MAIS FACILMENTE REINTRODUZ ───────────────────────────────────────────
   *
   * Copiar o molde inteiro (uma controller `as/comerciais` sem `@Roles` e sem menu que a reivindique)
   * é o gesto natural de quem está construindo dois catálogos iguais no mesmo dia. O resultado é a
   * lista de nomes das pessoas do comercial aberta a QUALQUER sessão autenticada, e nada falha: a
   * tela funciona, o teste do molde passa, e ninguém lê aquela rota de novo.
   *
   * A TRAVA: se existir uma superfície de leitura de comercial, ela é reivindicada por menu OU tem
   * `@Roles`. Não existir também é resposta válida, e é a PREFERIDA: a lista que o filtro precisa
   * vem por `VagasService.opcoes()`, que já é governada pelo menu `as-vagas`.
   */
  it("não existe rota de leitura ABERTA de comercial", async () => {
    const leitura = leituraDoCatalogo(/comercia/i);
    if (!leitura) return; // não existir é o desenho preferido
    const abertos: string[] = [];
    for (const handler of handlersDe(leitura)) {
      const reivindicado = menuDaOperacao(leitura.name, handler) !== null;
      const passa = await guardReal()
        .canActivate(contexto(leitura, handler, "COMUM"))
        .then(() => true)
        .catch(() => false);
      if (!reivindicado && passa) abertos.push(handler);
    }
    expect(
      abertos,
      `${leitura.name}: estes handlers devolvem NOME DE PESSOA a qualquer sessão autenticada, ` +
        `porque ninguém os reivindica no MenuGuard e eles não têm @Roles`,
    ).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O MENU: REIVINDICA A ESCRITA, NÃO ENCOSTA NA LEITURA, E NASCE SÓ DO SUPER_ADMIN
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O CÓDIGO DO MENU, descoberto pelo registro e não digitado: `as-segmentos` é o provável pelo molde,
 * e o requisito é o menu EXISTIR e estar nos lugares certos, não a grafia dele.
 *
 * A BUSCA IGNORA OS MENUS QUE JÁ EXISTIAM, e isso importa no caso do COMERCIAL: se algum dia nascer
 * outro menu com "comercial" no código, este leitor acusa ambiguidade em vez de escolher sozinho.
 */
function codigoDoMenu(padrao: RegExp): string {
  const candidatos = MENUS.map((m) => m.codigo).filter((c) => padrao.test(c));
  if (candidatos.length !== 1) {
    throw new Error(
      `CONTRATO NÃO ATENDIDO: esperava UM menu casando ${padrao}, achei ${candidatos.length}: ` +
        `${JSON.stringify(candidatos)}. Registrados: ${JSON.stringify(MENUS.map((m) => m.codigo))}`,
    );
  }
  return candidatos[0]!;
}

describe.each(CATALOGOS)("o menu do catálogo de $nome", ({ nome, menu, radical, leituraAberta }) => {
  /**
   * ─ O MENU NOVO ENTRA EM CINCO LUGARES, e não em um ───────────────────────────────────────────
   *
   * 1. `MENUS`                        sem ele, o menu sobe funcionando e INVISÍVEL para liberar
   *                                   (o caso `clinicas`, 29/07/2026);
   * 2. `MENUS_QUE_NASCEM_FORA_DA_ADM` sem ele, o menu de A&S nasce na área ADM, o default
   *                                   fail-closed, e o time de A&S é barrado;
   * 3. `MENUS_BLOQUEADOS_COMUM`       sem ele, a tela de permissões OFERECE marcar o menu para um
   *                                   COMUM, e a marcação não concede nada;
   * 4. `MENUS_SOMENTE_SUPER_ADMIN`    sem ele, o card APARECE para o Master e dá 403;
   * 5. `lib/menu-rotas.ts` (frontend) sem ele, a rota da tela não é governada por menu nenhum.
   *
   * OS QUATRO PRIMEIROS SÃO AFIRMÁVEIS AQUI. O quinto é do frontend e está coberto no arquivo
   * `as-vagas-onda-e.comportamental.tester.spec.ts`, porque este não alcança `apps/frontend`.
   */
  it("entra nos QUATRO lugares do backend, e não só no registro (§A.23)", () => {
    const codigo = codigoDoMenu(menu);
    expect(MENUS.map((m) => m.codigo), "1. o registro").toContain(codigo);
    expect(MENUS_QUE_NASCEM_FORA_DA_ADM.has(codigo), "2. nasce fora da ADM (área AS)").toBe(true);
    expect(MENUS_BLOQUEADOS_COMUM.has(codigo), "3. bloqueado para o COMUM").toBe(true);
    expect(MENUS_SOMENTE_SUPER_ADMIN.has(codigo), "4. só do SUPER_ADMIN").toBe(true);
  });

  it("nasce na área de A&S, e não no default ADM", () => {
    const def = MENUS.find((m) => m.codigo === codigoDoMenu(menu));
    expect(def, `o menu de ${nome} não está no registro`).toBeDefined();
    expect(def!.areas ?? [], "menu de A&S sem área declarada cai em ADM, fail-closed").toContain(
      "AS",
    );
  });

  /**
   * A CASA TEM DOIS PADRÕES VÁLIDOS aqui (reivindicar os handlers do admin, ou declarar
   * `operacoes: []` confiando no `@Roles`), e o teste não escolhe entre eles. O que NÃO pode
   * acontecer é a reivindicação apontar para um menu que NÃO é só do SUPER_ADMIN: aí o menu vira a
   * trava aparente de uma rota cuja trava real é outra, e alguém "simplifica" o `@Roles` confiando
   * nele.
   */
  it("se a escrita for reivindicada, o menu dela é SÓ do SUPER_ADMIN", () => {
    const admin = exigir(escritaDoCatalogo(radical), `escrita de ${nome}`);
    for (const handler of handlersDe(admin)) {
      const m = menuDaOperacao(admin.name, handler);
      if (m === null) continue;
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(m), `${handler} -> ${m}`).toBe(true);
    }
  });

  /**
   * A AUSÊNCIA NÃO SE DEFENDE SOZINHA: basta alguém acrescentar a controller de LEITURA à lista de
   * operações do menu, achando que está organizando, para o seletor do cadastro de cliente fechar em
   * silêncio para o COMUM. É o molde do `lojas-escrita-aberta.spec.ts`, escrito depois de exatamente
   * essa regressão derrubar uma tela.
   */
  it("nenhum handler de LEITURA é reivindicado por menu nenhum", () => {
    const leitura = leituraDoCatalogo(radical);
    // SÓ VALE PARA QUEM TEM LEITURA ABERTA. O comercial não tem, de propósito (§A.6), e a régua
    // dele é a OPOSTA: nada aberto devolve nome de pessoa. Quem afirma aquilo é o bloco da leitura
    // e o `onda-e.menu-dos-catalogos.tester.spec.ts`, não este.
    if (!leituraAberta) {
      expect(leitura, `${nome}: a leitura não pode ser aberta, e ela existe`).toBeNull();
      return;
    }
    const aberta = exigir(leitura, `leitura de ${nome}`);
    for (const handler of handlersDe(aberta)) {
      expect(menuDaOperacao(aberta.name, handler), `leitura.${handler}`).toBeNull();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. OS CASOS ESCRITOS À MÃO, E A REGRESSÃO DOS CATÁLOGOS QUE JÁ EXISTEM
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE ESTE BLOCO REPETE O QUE O `describe.each` JÁ DIZ ────────────────────────────────────
 *
 * PORQUE O LAÇO PODE ENCOLHER. Se alguém apagar uma entrada de `CATALOGOS` (ou trocar o radical por
 * um que não casa com nada e "consertar" o vermelho assim), o `describe.each` some em silêncio e a
 * suíte fica verde com metade da onda sem teste. Estes dois casos são digitados, citam a rota
 * esperada pelo molde e NÃO dependem da lista de cima.
 */
describe("os dois catálogos da Onda E, escritos à mão (o laço acima pode encolher)", () => {
  it("o de SEGMENTO responde por admin/as/segmentos e por as/segmentos", () => {
    expect(acharPorRota("admin/as/segmentos"), `rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
    expect(acharPorRota("as/segmentos"), `rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
  });

  it("o de COMERCIAL responde por admin/as/comerciais (a leitura aberta NÃO é exigida)", () => {
    expect(acharPorRota("admin/as/comerciais"), `rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
  });

  it("os dois menus da Onda E existem no registro com o código do molde", () => {
    const codigos = MENUS.map((m) => m.codigo);
    expect(codigos, "o menu do gerenciador de segmentos").toContain("as-segmentos");
    expect(codigos, "o menu do gerenciador de comerciais").toContain("as-comerciais");
  });
});

/**
 * ─ A REGRESSÃO: OS CATÁLOGOS DA ONDA C E DA B2 CONTINUAM DE PÉ ─────────────────────────────────
 *
 * ESTE BLOCO NASCE VERDE, e isso é deliberado (não é teste de requisito novo, é rede): a Onda E
 * acrescenta duas controllers e dois menus ao MESMO `AsModule` e ao MESMO `domain/menus`, que são
 * arquivos de lista. Lista editada à mão é onde a entrada vizinha some sem ninguém ver.
 */
describe("regressão: os catálogos que já existiam continuam com as duas superfícies", () => {
  it.each([
    ["linhas de serviço", "admin/as/linhas-servico", "as/linhas-servico"],
    ["etapas do funil", "admin/as/etapas", "as/etapas"],
    ["status da vaga", "admin/as/status-vaga", "as/status-vaga"],
    ["motivos de cancelamento", "admin/as/motivos-cancelamento", "as/motivos-cancelamento"],
  ])("%s continua com escrita e leitura", (_nome, admin, leitura) => {
    expect(acharPorRota(admin), `${admin} sumiu. Rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
    expect(acharPorRota(leitura), `${leitura} sumiu. Rotas: ${JSON.stringify(ROTAS)}`).not.toBeNull();
  });

  it.each(["as-linhas-servico", "as-etapas", "as-status-vaga", "as-motivos-cancelamento"])(
    "o menu %s continua registrado e continua só do SUPER_ADMIN",
    (codigo) => {
      expect(MENUS.map((m) => m.codigo)).toContain(codigo);
      expect(MENUS_SOMENTE_SUPER_ADMIN.has(codigo)).toBe(true);
    },
  );
});
