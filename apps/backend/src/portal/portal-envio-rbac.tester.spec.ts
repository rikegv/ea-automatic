import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENUS, MENUS_PADRAO_COMUM, menuDaOperacao } from "../domain/menus";
import { RAIZ_BACKEND, semComentarios } from "./portal-envio.tester-fake";

/**
 * ─ RBAC DO ENVIO DO LINK (S12, ALTO), COBERTURA INDEPENDENTE (§A.38/§A.40) ─────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e por que ele NÃO pode ser um teste do autor ──────────────────┐
 * │ `menuDaOperacao` devolve `null` para operação que NENHUM menu reivindica, e `null` quer dizer │
 * │ PASSA LIVRE (`domain/menus.ts:1323`). O índice é por `Controller.handler`, então o coringa    │
 * │ `PortalLinksController.*` NÃO alcança classe nova: handler de envio numa classe nova nasce    │
 * │ ABERTO, e qualquer sessão autenticada dispara e-mail com credencial de acesso ao prontuário   │
 * │ de um candidato, em lote. É o mesmo furo que o `solicitarReenvio` teve, duas frentes atrás.   │
 * │                                                                                              │
 * │ E ELE É INVISÍVEL NA REVISÃO: nada falha, nada loga, e a rota responde 200 para quem não      │
 * │ deveria alcançá-la. Só um teste que pergunte ao ÍNDICE REAL pega isso.                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A varredura é por FONTE, e não por importação, porque as controllers desta frente ainda não
 * existem: importar um arquivo ausente derrubaria o arquivo inteiro e esconderia os testes que já
 * têm o que dizer.
 */

interface ControllerAchada {
  arquivo: string;
  classe: string;
  prefixo: string;
  handlers: string[];
}

/** Toda controller do backend que encosta no serviço de envio. */
function controllersDoEnvio(): ControllerAchada[] {
  const achadas: ControllerAchada[] = [];
  const anda = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name === "node_modules" || entrada.name === "dist") continue;
        anda(caminho);
        continue;
      }
      if (!entrada.name.endsWith(".controller.ts")) continue;
      const bruto = readFileSync(caminho, "utf8");
      if (!/PortalEnvioService/.test(bruto)) continue;
      const fonte = semComentarios(bruto);
      const classe = fonte.match(/export class (\w+)/)?.[1] ?? "";
      const prefixo = fonte.match(/@Controller\(\s*["'`]([^"'`]*)["'`]/)?.[1] ?? "";
      const handlers = [
        ...fonte.matchAll(/@(?:Get|Post|Patch|Put|Delete)\([^)]*\)\s*(?:async\s+)?(\w+)\s*\(/g),
      ].map((m) => m[1]);
      achadas.push({ arquivo: entrada.name, classe, prefixo, handlers });
    }
  };
  anda(join(RAIZ_BACKEND));
  return achadas;
}

const CONTROLLERS = controllersDoEnvio();

describe("as rotas novas do envio existem e são alcançáveis pelo MenuGuard (S12)", () => {
  it("alguma controller expõe o serviço de envio", () => {
    expect(
      CONTROLLERS.length,
      "nenhuma controller referencia `PortalEnvioService`: a frente ainda não tem porta",
    ).toBeGreaterThan(0);
  });

  it("cada controller do envio expõe pelo menos um handler HTTP", () => {
    for (const c of CONTROLLERS) {
      expect(c.handlers.length, `${c.classe} sem handler detectado`).toBeGreaterThan(0);
    }
  });

  /** O teste que morde: operação não reivindicada passa LIVRE. */
  it("NENHUM handler novo fica sem menu reivindicando", () => {
    const abertos: string[] = [];
    for (const c of CONTROLLERS) {
      for (const h of c.handlers) {
        if (menuDaOperacao(c.classe, h) === null) abertos.push(`${c.classe}.${h}`);
      }
    }
    expect(abertos, "operação ABERTA: qualquer sessão autenticada dispara credencial").toEqual([]);
  });

  it("e o menu que as reivindica é o do Portal, o mesmo da emissão que já existe", () => {
    for (const c of CONTROLLERS) {
      for (const h of c.handlers) {
        expect(menuDaOperacao(c.classe, h), `${c.classe}.${h}`).toBe("portal-links");
      }
    }
  });

  /**
   * SE A CLASSE FOR NOVA, O MENU PRECISA CITÁ-LA POR NOME. O coringa da irmã não a alcança, e é
   * exatamente por isso que o registro do menu já cita DUAS controllers hoje.
   */
  it("classe nova aparece nominalmente nas `operacoes` do menu `portal-links`", () => {
    const menu = MENUS.find((m) => m.codigo === "portal-links");
    expect(menu, "o menu do Portal sumiu do registro").toBeTruthy();
    const reivindicadas = (menu?.operacoes ?? []).join(",");
    for (const c of CONTROLLERS) {
      expect(reivindicadas, `${c.classe} não é reivindicada`).toContain(c.classe);
    }
  });
});

describe("S10: a rota nova NÃO nasce sob o prefixo `portal/`", () => {
  /**
   * O prefixo `portal/` é o que a barreira do Fernando allowlista PARA A INTERNET, porque é por
   * onde o candidato entra sem sessão. Uma rota de operação nascida ali fica exposta ao mundo, e a
   * exposição não aparece em teste nenhum do EA: ela mora na configuração do vhost. Precedente:
   * `portal-painel.controller.ts` e `portal-pendencias.controller.ts`, que ficam sob `esteira/`.
   */
  it("nenhuma controller do envio fica sob `portal/`", () => {
    expect(CONTROLLERS.length, "ainda não há controller do envio para medir").toBeGreaterThan(0);
    const expostas = CONTROLLERS.filter((c) => c.prefixo.replace(/^\//, "").startsWith("portal"));
    expect(
      expostas.map((c) => `${c.classe} sob "${c.prefixo}"`),
      [
        "rota de DISPARO sob o prefixo que a barreira do Fernando allowlista para a internet.",
        "A S12 e a S10 se contradizem neste ponto e a decisão é do coordenador com o `seguranca`:",
        "a S12 sugere reusar `PortalLinksController` (coringa do menu, porta fechada de graça),",
        "e ela JÁ MORA em `portal/links`, que é o prefixo que a S10 manda evitar.",
        "As duas leituras novas ficaram certas, em `esteira/portal/envio`; o disparo, não.",
      ].join(" "),
    ).toEqual([]);
  });
});

describe("§A.23: a frente não concede menu a ninguém", () => {
  it("nenhum menu novo nasceu para o envio", () => {
    const suspeitos = MENUS.filter((m) => /envio|correio|email/i.test(m.codigo));
    expect(suspeitos.map((m) => m.codigo)).toEqual([]);
  });

  it("e o menu do Portal continua fora do conjunto que se concede sozinho", () => {
    const portal = MENUS.find((m) => m.codigo === "portal-links");
    expect(portal?.grupo).not.toBe("OPERACAO");
    expect(MENUS_PADRAO_COMUM).not.toContain("portal-links");
  });
});
