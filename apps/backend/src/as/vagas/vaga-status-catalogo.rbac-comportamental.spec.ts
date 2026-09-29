import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { beforeAll, describe, expect, it } from "vitest";
import { MenuGuard } from "../../auth/guards/menu.guard";
import type { MenuAreasService } from "../../auth/menu-areas.service";
import type { MenusService } from "../../auth/menus.service";
import { masterPrecisaDeMarcacao, menuDaOperacao } from "../../domain/menus";
import { modulosQueMencionam } from "./vaga-status.tester-fake";

/**
 * ─ QUEM EDITA O CATÁLOGO DE STATUS DA VAGA É QUEM O DIRETOR MARCAR: MEDIDO PELO GUARD ───────────
 *
 * ┌─ A AUTORIDADE MUDOU DE DONO (regra do diretor, 27/09/2026) ─────────────────────────────────┐
 * │ ESTE ARQUIVO AFIRMAVA "só o SUPER_ADMIN escreve", e afirmava certo para o desenho de então: a │
 * │ escrita era `@Roles("SUPER_ADMIN")` na classe. O diretor decidiu que o Super Admin concede    │
 * │ QUALQUER tela a QUALQUER usuário, e com o papel na classe isso era impossível de entregar:    │
 * │ conceder o menu abria uma PORTA TRANCADA, e a marcação era descartada em silêncio.            │
 * │                                                                                             │
 * │ O `@Roles` SAIU e a autoridade passou a ser o `MenuGuard`, pela reivindicação                 │
 * │ `VagaStatusAdminController.*`. ESTE ARQUIVO TROCOU DE GUARD JUNTO: continuar medindo o        │
 * │ `RolesGuard` seria medir um guard que já não governa a rota, e ele deixaria TODO MUNDO passar. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS DOIS FUROS QUE CONTINUAM VALENDO, e nenhum dos dois o menu pega sozinho ────────────────┐
 * │ 1. O MASTER atravessa o `MenuGuard` por PERTENCER À ÁREA (`menu.guard.ts`: "MASTER manda na  │
 * │    área inteira"), e há MASTER na área AS em produção. Quem fecha esse atalho é a entrada    │
 * │    nominal do código em `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`; sem ela, qualquer Master de   │
 * │    A&S renomeia, reordena e INATIVA status de vaga, que é o dado de que dependem o           │
 * │    fechamento, o cancelamento, a trilha, o cilindro de ocupação e cinco telas.               │
 * │ 2. O `MenuGuard` é FAIL-OPEN para operação que NINGUÉM reivindica. Tirar o `@Roles` sem a    │
 * │    reivindicação teria ABERTO a rota a qualquer autenticado, e é o caso "SEM o menu é         │
 * │    barrado" que prova que não foi o que aconteceu.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMPORTAMENTAL, E NÃO "O DECORADOR ESTÁ LÁ": o `MenuGuard` de verdade é instanciado e chamado, com
 * a controller de verdade, e a afirmação é sobre QUEM ELE DEIXA ENTRAR. O módulo já pagou pela
 * distinção: existia teste VERDE afirmando que a rota de fechar vaga não tinha `@Roles` enquanto o
 * sistema era contornável pela rota irmã.
 *
 * A CONTROLLER É DESCOBERTA, não importada por nome (§A.40, regra 2: o teste veio antes do código).
 */

/**
 * O guard de verdade, descrito pelos menus que o usuário TEM. A área é AS nos dois lados: o teto de
 * área é conferido ANTES da marcação, então um usuário fora da área seria recusado por OUTRO motivo e
 * o teste não falaria da concessão, que é o que está em jogo depois da regra do diretor.
 */
function guardReal(codigos: string[] = []): MenuGuard {
  const menus = {
    permissaoDoUsuario: async () => ({ codigos: new Set(codigos), areas: new Set(["AS"]) }),
  } as unknown as MenusService;
  const areas = { visivel: async () => true } as unknown as MenuAreasService;
  return new MenuGuard(new Reflector(), menus, areas);
}

/** O menu que governa a escrita deste catálogo. Descoberto, e não digitado, como a controller. */
const MENU = "as-status-vaga";

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

const handlersDe = (c: new (...a: never[]) => object) =>
  Object.getOwnPropertyNames(c.prototype).filter(
    (n) => n !== "constructor" && typeof (c.prototype as Record<string, unknown>)[n] === "function",
  );

interface Achado {
  nome: string;
  classe: new (...a: never[]) => object;
  rota: string;
}

let escrita: Achado | null = null;
let leitura: Achado | null = null;
let vistas: string[] = [];

beforeAll(async () => {
  const { achados } = await modulosQueMencionam("VagaStatus");
  const controllers: Achado[] = [];
  for (const { mod } of achados) {
    for (const [nome, valor] of Object.entries(mod)) {
      if (typeof valor !== "function" || !/Controller$/.test(nome)) continue;
      const rota = String(Reflect.getMetadata("path", valor) ?? "");
      if (!/status/i.test(nome) && !/status/i.test(rota)) continue;
      controllers.push({ nome, classe: valor as new (...a: never[]) => object, rota });
    }
  }
  vistas = controllers.map((c) => `${c.nome} (@Controller("${c.rota}"))`);
  escrita = controllers.find((c) => /admin/i.test(c.rota) || /Admin/.test(c.nome)) ?? null;
  leitura = controllers.find((c) => c !== escrita) ?? null;
  /*
   * ─ O TETO DE TEMPO É EXPLÍCITO, E NÃO É MÁSCARA DE LENTIDÃO ──────────────────────────────────
   *
   * ESTE `beforeAll` PAGA O GRAFO DE MÓDULOS INTEIRO: `modulosQueMencionam` descobre a controller
   * IMPORTANDO DINAMICAMENTE todo arquivo de produção que menciona o nome, e o conjunto cresce a
   * cada arquivo novo do módulo A&S. MEDIDO: ele estourava o teto padrão de 10.000ms
   * (`Hook timed out in 10000ms`), e o efeito era pior do que uma falha honesta: os casos ficavam
   * PULADOS e o arquivo contava como suíte vermelha sem nenhuma asserção ter sido avaliada, ou seja,
   * o vermelho não dizia nada sobre a regra que o arquivo existe para guardar.
   *
   * É O MESMO ARGUMENTO JÁ REGISTRADO NO VIZINHO (`vaga-status-catalogo.comportamental.spec.ts`,
   * caso do papel de sistema, medido em 4.176ms contra o teto de 5.000): o custo é conhecido, medido
   * e LOCALIZADO na importação dinâmica, não em asserção nenhuma.
   *
   * O QUE ISSO NÃO PODE VIRAR: teto global no runner. Teto global esconde teste genuinamente
   * PENDURADO em toda a suíte, que é o defeito que o tempo limite existe para revelar. O teto é
   * DESTE gancho e de mais nenhum.
   */
}, 30_000);

describe("a escrita do catálogo de status é de quem o diretor marcar, e de mais ninguém", () => {
  it("existe uma controller de ESCRITA do catálogo, sob rota de administração", () => {
    expect(
      escrita,
      `nenhuma controller de administração do catálogo de status foi achada. Vistas: ${vistas.join(", ") || "nenhuma"}`,
    ).not.toBeNull();
  });

  /**
   * ─ O CASO QUE PROVA QUE A ROTA NÃO FICOU ABERTA QUANDO O `@Roles` SAIU ───────────────────────
   *
   * A MUTAÇÃO QUE MORRE AQUI é a remoção da reivindicação em `domain/menus.ts`: sem ela o
   * `MenuGuard` é fail-open e devolve `true` para qualquer autenticado. O usuário do cenário tem um
   * menu de A&S na mão (`as-vagas`), só não tem ESTE, que é o recorte que separa "não tem acesso a
   * nada" de "não tem acesso a ISTO".
   */
  it("TODA operação de escrita é reivindicada pelo menu, senão a rota estaria ABERTA", () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    const handlers = handlersDe(alvo.classe);
    expect(handlers.length, "a controller de escrita não pode estar vazia").toBeGreaterThan(0);
    for (const h of handlers) {
      expect(menuDaOperacao(alvo.nome, h), `${alvo.nome}.${h} sem menu: rota ABERTA`).toBe(MENU);
    }
  });

  it("o COMUM SEM o menu é barrado em TODOS os handlers de escrita", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal(["as-vagas"]).canActivate(contexto(alvo.classe, h, "COMUM")),
        `${alvo.nome}.${h} deixa o COMUM sem o menu escrever`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  /** E o COMUM MARCADO escreve: é a metade que a regra do diretor acrescentou. */
  it("o COMUM COM o menu concedido escreve em TODOS os handlers", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal([MENU]).canActivate(contexto(alvo.classe, h, "COMUM")),
        `${alvo.nome}.${h} recusa quem o diretor marcou`,
      ).resolves.toBe(true);
    }
  });

  /**
   * A MUTAÇÃO QUE MORRE AQUI é a remoção do código de `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`: sem
   * ela o MASTER atravessa pelo bypass de ÁREA e passa a editar o catálogo que governa o desfecho de
   * toda vaga, sem o diretor ter decidido nada. A lista é afirmada junto do comportamento, porque
   * cada uma sozinha esconde metade do mecanismo.
   */
  it("o MASTER SEM marcação é barrado em TODOS os handlers de escrita", async () => {
    expect(escrita).not.toBeNull();
    expect(masterPrecisaDeMarcacao(MENU), "sem esta entrada o MASTER passa pelo atalho de área").toBe(
      true,
    );
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal().canActivate(contexto(alvo.classe, h, "MASTER")),
        `${alvo.nome}.${h} deixa o MASTER sem marcação escrever`,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("o MASTER COM marcação escreve em TODOS os handlers", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal([MENU]).canActivate(contexto(alvo.classe, h, "MASTER")),
      ).resolves.toBe(true);
    }
  });

  /** O contraste, sem o qual os casos acima seriam satisfeitos por uma rota que barra todo mundo. */
  it("o SUPER_ADMIN passa em todos os handlers de escrita, sem depender de marcação", async () => {
    expect(escrita).not.toBeNull();
    const alvo = escrita as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(guardReal().canActivate(contexto(alvo.classe, h, "SUPER_ADMIN"))).resolves.toBe(true);
    }
  });
});

describe("a LEITURA do catálogo é aberta a qualquer autenticado", () => {
  /**
   * O STATUS DA VAGA É DADO DE TRABALHO: a lista, a ficha, o painel, o cilindro de ocupação e os
   * seletores da tela leem o catálogo. Gatar a leitura daria 403 na Central de Vagas inteira para o
   * perfil COMUM, que é o incidente que a régua da casa já pagou uma vez.
   */
  it("existe uma controller de LEITURA do catálogo", () => {
    expect(
      leitura,
      `nenhuma controller de leitura do catálogo de status foi achada. Vistas: ${vistas.join(", ") || "nenhuma"}`,
    ).not.toBeNull();
  });

  it("o COMUM passa em todos os handlers de leitura, sem menu nem @Roles no caminho", async () => {
    expect(leitura).not.toBeNull();
    const alvo = leitura as Achado;
    for (const h of handlersDe(alvo.classe)) {
      await expect(
        guardReal().canActivate(contexto(alvo.classe, h, "COMUM")),
        `${alvo.nome}.${h} fecha a leitura do catálogo para o consultor`,
      ).resolves.toBe(true);
    }
  });
});
