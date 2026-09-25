import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Papel } from "@ea/shared-types";
import { describe, expect, it } from "vitest";
import { RolesGuard } from "../auth/guards/roles.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import { IS_PUBLIC_KEY } from "../auth/decorators";
import { PortalPendenciasController } from "./portal-pendencias.controller";

/**
 * TESTER INDEPENDENTE (§A.38). R6.11 e R6.12: ZERAR AS TENTATIVAS É DE MASTER E DE SUPER ADMIN.
 *
 * ┌─ POR QUE ESTE É O TESTE MAIS IMPORTANTE DOS QUATRO REQUISITOS ─────────────────────────────┐
 * │ O teto de tentativas é a única coisa que impede um laço de chamadas PAGAS ao motor de IA, no │
 * │ mesmo projeto do Google que atende a esteira de admissão. Quem alcança a rota que zera o teto│
 * │ desliga essa proteção, e desliga em silêncio: nada quebra, nada fica vermelho, a conta é que  │
 * │ aparece depois. Por isso a pergunta não é "o decorador está lá", é "QUEM O GUARD DEIXA        │
 * │ ENTRAR".                                                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS PORTAS DOS FUNDOS, e a terceira é a que ninguém procura ──────────────────────────┐
 * │ 1. a rota nasce SEM `@Roles`: todo autenticado zera o teto, consultor incluído;              │
 * │ 2. o `@Roles` inclui `COMUM` por engano, e a restrição vira enfeite;                         │
 * │ 3. A PIOR: a rota nasce sob o controller `@Public()` do Portal. As duas rotas do candidato    │
 * │    (`portal/credencial`, `portal/confirmar`) são públicas de propósito, protegidas por um     │
 * │    guard de sessão do próprio candidato. Pendurar o destrave ali faz o `@Roles` NUNCA SER     │
 * │    AVALIADO, porque o guard global de autenticação foi tirado do caminho, e o CANDIDATO passa │
 * │    a zerar o próprio teto pelo celular. O teto vira teatro, exatamente como aconteceria se a  │
 * │    contagem fosse por link.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COMPORTAMENTAL, e não "o decorador está lá": o `RolesGuard` de verdade é instanciado, com o
 * `Reflector` de verdade lendo a controller de verdade, e a afirmação é sobre quem ele deixa entrar.
 *
 * A ÁREA É NEUTRALIZADA DE PROPÓSITO nos dublês: o requisito fala de PAPEL, e deixar a segunda
 * dimensão em jogo faria um Master barrado por área parecer um Master barrado por papel. A área é
 * medida à parte, no último bloco.
 *
 * §A.6: nenhum dado pessoal. Papel, id técnico e nome de rota.
 */

function guard(opts: { areasDoUsuario?: string[]; areasDaOperacao?: string[] } = {}): RolesGuard {
  const menus = {
    areasDoUsuario: async () => new Set(opts.areasDoUsuario ?? ["ADM", "AS"]),
  } as unknown as MenusService;
  const areas = {
    areasDaOperacao: async () => opts.areasDaOperacao ?? ["ADM"],
  } as unknown as MenuAreasService;
  return new RolesGuard(new Reflector(), menus, areas);
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

const alcanca = (handler: string, papel: Papel, g = guard()) =>
  g.canActivate(contexto(PortalPendenciasController, handler, papel));

/** O nome do método que zera o teto, e o que solicita o reenvio, descobertos e não supostos. */
const handlers = Object.getOwnPropertyNames(PortalPendenciasController.prototype).filter(
  (n) => n !== "constructor",
);
const ZERAR = handlers.find((n) => /zerar|destrav/i.test(n))!;
const SOLICITAR = handlers.find((n) => /solicitar|reenvio/i.test(n))!;

describe("a rota que zera o teto existe e é identificável", () => {
  it("há um método de zerar tentativas e um de solicitar reenvio", () => {
    expect(ZERAR, `nenhum método de zerar teto. Vistos: ${handlers.join(", ")}`).toBeTruthy();
    expect(SOLICITAR, `nenhum método de solicitar reenvio. Vistos: ${handlers.join(", ")}`).toBeTruthy();
  });
});

describe("R6.11, O MAIS IMPORTANTE: o CONSULTOR não alcança a rota que zera o teto", () => {
  it("COMUM é barrado pelo guard de verdade", async () => {
    await expect(
      alcanca(ZERAR, "COMUM"),
      "o consultor zera o teto de tentativas: a proteção contra o laço de chamadas pagas está desligada",
    ).rejects.toThrow(ForbiddenException);
  });

  it("e é barrado por PAPEL, não por acaso de área", async () => {
    // Mesmo com TODAS as áreas, o COMUM continua fora: quem barra é o papel.
    await expect(
      alcanca(ZERAR, "COMUM", guard({ areasDoUsuario: ["ADM", "AS", "OPERACAO"] })),
    ).rejects.toThrow(/restrito/i);
  });

  it("o `@Roles` da rota NÃO inclui COMUM", () => {
    const papeis = new Reflector().getAllAndOverride<Papel[] | undefined>("roles", [
      (PortalPendenciasController.prototype as unknown as Record<string, unknown>)[ZERAR] as never,
      PortalPendenciasController as never,
    ]);
    expect(papeis, "sem `@Roles`, todo autenticado zera o teto").toBeTruthy();
    expect(papeis).not.toContain("COMUM");
  });
});

describe("R6.12: Master e Super Admin alcançam", () => {
  it("MASTER passa", async () => {
    await expect(alcanca(ZERAR, "MASTER")).resolves.toBe(true);
  });

  it("SUPER_ADMIN passa, e passa mesmo sem área nenhuma (está acima da segmentação)", async () => {
    await expect(alcanca(ZERAR, "SUPER_ADMIN", guard({ areasDoUsuario: [] }))).resolves.toBe(true);
  });
});

describe("R5: solicitar reenvio é do TIME, e continua ao alcance do consultor", () => {
  it("COMUM alcança a solicitação de reenvio", async () => {
    // As duas portas são diferentes de propósito: fechar as duas com `@Roles` tiraria do consultor
    // o fluxo NORMAL de trabalho e o item 5 morreria junto com a proteção do item 6.
    await expect(
      alcanca(SOLICITAR, "COMUM"),
      "o consultor não consegue mais pedir o documento de volta: o item 5 foi fechado junto com o 6",
    ).resolves.toBe(true);
  });
});

describe("R6, A TERCEIRA PORTA: nada disto pode ser PÚBLICO", () => {
  it("nenhuma das rotas do time é `@Public()`", () => {
    const reflector = new Reflector();
    for (const handler of handlers) {
      const publico = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
        (PortalPendenciasController.prototype as unknown as Record<string, unknown>)[handler] as never,
        PortalPendenciasController as never,
      ]);
      expect(
        publico,
        `\`${handler}\` é público: o guard de papel nem chega a ser avaliado e o candidato zera o próprio teto`,
      ).toBeFalsy();
    }
  });

  /**
   * A varredura existe porque a porta dos fundos não precisa estar NESTA controller para existir.
   * Basta alguém, um dia, acrescentar a reabertura ao controller do candidato, que é público por
   * desenho. Aqui a pergunta é feita ao repositório inteiro, e não a um arquivo escolhido.
   */
  it("NENHUM arquivo público do backend reabre pendência ou zera tentativa", () => {
    const raiz = join(__dirname, "..");
    const arquivos: string[] = [];
    const andar = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === "node_modules" || nome === "dist") continue;
        const caminho = join(dir, nome);
        if (statSync(caminho).isDirectory()) andar(caminho);
        else if (nome.endsWith(".ts") && !nome.includes(".spec.") && !nome.includes("fake"))
          arquivos.push(caminho);
      }
    };
    andar(raiz);

    // OS COMENTÁRIOS SAEM ANTES, e isto não é detalhe: o controller correto EXPLICA, em comentário,
    // por que ele não é `@Public()`, e uma varredura crua acusaria justamente o arquivo que acertou.
    // Detector que grita no caso certo é desligado na primeira semana.
    const semComentario = (fonte: string) =>
      fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

    const suspeitos = arquivos.filter((caminho) => {
      const fonte = semComentario(readFileSync(caminho, "utf8"));
      if (!fonte.includes("@Public()")) return false;
      return /zerarTentativas|solicitarReenvio|liberadoEm|liberado_em/.test(fonte);
    });

    expect(
      suspeitos.map((c) => c.replace(raiz, "")),
      "arquivo com rota pública mencionando a reabertura: o candidato pode estar destravando a si mesmo",
    ).toEqual([]);
  });
});

/**
 * A SEGUNDA DIMENSÃO DO GUARD, medida à parte porque ela NÃO é o requisito e mesmo assim decide
 * quem entra na prática. Um Master que só tenha a área de A&S é barrado nesta rota.
 *
 * DE ONDE VEM A ÁREA, E ISTO MUDOU DEPOIS DESTA MEDIÇÃO: quando este arquivo foi escrito, a operação
 * não era reivindicada por menu nenhum e caía no padrão ADM do projeto (fail-closed). Agora ela é
 * reivindicada pelo menu `esteira`, o mesmo das rotas irmãs de auditoria, então a área sai da LINHA
 * DAQUELE MENU, que é governada pela tela do diretor (§A.23). O desfecho medido aqui é o mesmo, e
 * passou a ter dono: quem decide se esta operação é de ADM, de A&S ou das duas é o diretor, e não um
 * default escondido no guard.
 *
 * Isto não é defeito: é o desenho declarado do `RolesGuard`. Está aqui para que o dia em que um
 * Master de outra área reclamar de "acesso restrito", a resposta já esteja medida e escrita.
 */
describe("observação medida: a área também decide, e o padrão é ADM", () => {
  it("MASTER sem a área da operação é barrado, e a mensagem diz que é de outra área", async () => {
    await expect(
      alcanca(ZERAR, "MASTER", guard({ areasDoUsuario: ["AS"], areasDaOperacao: ["ADM"] })),
    ).rejects.toThrow(/outra área/i);
  });
});
