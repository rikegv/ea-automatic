import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O PORTAL ALCANÇA UM PROVIDER DA COLETA DE VT, E É ESSE MESMO QUE ELE USA.
 *
 * POR QUE ESTE TESTE EXISTE, e o precedente é literal: o cabeçalho de `as/as.module.ts` afirmava
 * que entrava "UMA PORTA SÓ" do `PortalModule`, e era FALSO, porque no Nest importar um módulo
 * torna injetável TUDO que ele EXPORTA (eram três). A auditoria pegou, e a correção não foi
 * reescrever o comentário: foi `as-porta-do-portal.tester.spec.ts`, que mede o alcance.
 *
 * AQUI A ESTRUTURA JÁ FOI CONSERTADA ANTES DO COMENTÁRIO: o emissor do link saiu dos providers do
 * `VtColetaModule` e foi para o `VtLinkModule`, que exporta UMA coisa. Então a afirmação é
 * verdadeira por construção, e este arquivo só impede que ela deixe de ser, de duas maneiras:
 *
 *  1. alguém acrescentar um `export` ao `VtLinkModule`, e o portal público passar a alcançar o
 *     scheduler, o `SolicitacaoVtService` (dono da escrita em `solicitacoes_vt`) ou os órfãos;
 *  2. alguém, de dentro de `portal/`, importar um desses serviços direto pelo caminho do arquivo.
 *
 * O caminho do candidato é PÚBLICO (atrás da barreira e de um guard de sessão), e o que ele
 * precisa da coleta de VT é um endereço. Nada mais da coleta tem o que fazer ali.
 */

const PORTAL = resolve(__dirname);
const VT_LINK_MODULE = resolve(__dirname, "..", "vt-coleta", "vt-link.module.ts");
const ESTE_ARQUIVO = "portal-so-uma-porta-do-vt.tester.spec.ts";

function arquivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const alvo = join(dir, nome);
    if (statSync(alvo).isDirectory()) arquivosTs(alvo, acumulado);
    else if (alvo.endsWith(".ts") && !alvo.endsWith(ESTE_ARQUIVO)) acumulado.push(alvo);
  }
  return acumulado;
}

const DO_PORTAL = arquivosTs(PORTAL);

/** CÓDIGO, NÃO COMENTÁRIO: o `portal.module.ts` CITA os outros serviços em prosa, de propósito. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * O que o módulo grande da coleta exporta e o portal NÃO pode alcançar nem usar.
 *
 * ┌─ O FURO QUE A AUDITORIA ACHOU NESTA LISTA (item F5b) ───────────────────────────────────────┐
 * │ Ela proibia os quatro SERVIÇOS e não proibia o MÓDULO. No Nest, `imports: [..., o módulo    │
 * │ grande]` em `portal.module.ts` torna os quatro injetáveis no caminho público de uma vez só,  │
 * │ e passava aqui em verde: o teste trancava a janela e deixava a porta aberta ao lado. O nome  │
 * │ do módulo entrou na lista, e é uma string.                                                   │
 * │                                                                                               │
 * │ Ele é citado em PROSA no `portal.module.ts` e no cabeçalho acima, de propósito (é o que      │
 * │ explica por que o `VtLinkModule` existe), e por isso a varredura roda sobre o código SEM     │
 * │ comentários. Proibir a menção mataria a explicação junto com o risco.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const FORA_DO_ALCANCE = [
  "VtColetaSchedulerService",
  "SolicitacaoVtService",
  "OrfaoVtService",
  "VtColetaService",
  "VtColetaModule",
] as const;

describe("a ponte do VT entra no portal por UMA porta", () => {
  it("a varredura de fato enxerga os arquivos do portal", () => {
    expect(DO_PORTAL.length, "a varredura nao achou arquivo nenhum sob `portal/`").toBeGreaterThan(20);
  });

  it("o `VtLinkModule` exporta o `VtLinkService` e mais nada", () => {
    const fonte = semComentarios(readFileSync(VT_LINK_MODULE, "utf8"));
    const exports = /exports:\s*\[([^\]]*)\]/.exec(fonte)?.[1] ?? "";
    const lista = exports
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(
      lista,
      "o `PortalModule` importa este módulo, e o que ele EXPORTA fica injetável no caminho " +
        "PÚBLICO do candidato. Precisa exportar mais? Então o portal deixou de alcançar uma porta " +
        "só, e o comentário do `portal.module.ts` passou a mentir: conserte os dois juntos.",
    ).toEqual(["VtLinkService"]);
  });

  for (const servico of FORA_DO_ALCANCE) {
    it(`nenhum arquivo sob \`portal/\` usa \`${servico}\``, () => {
      const achados = DO_PORTAL.filter((arquivo) =>
        semComentarios(readFileSync(arquivo, "utf8")).includes(servico),
      ).map((a) => a.replace(`${PORTAL}/`, ""));
      expect(
        achados,
        `\`${servico}\` entrou no portal. O caminho do candidato é público e precisa da coleta de ` +
          `VT apenas para PEDIR UM ENDEREÇO (\`VtLinkService\`). Registrar solicitação, mexer no ` +
          `scheduler ou tratar órfão é trabalho do TIME, em rota autenticada sob \`vt-coleta/\`.`,
      ).toEqual([]);
    });
  }

  it("o `VtLinkService` continua sendo a porta que o portal usa", () => {
    // Se esta afirmação cair, a importação do `VtLinkModule` em `portal.module.ts` virou alcance
    // sem uso, e o certo passa a ser REMOVER a importação, não afrouxar os testes acima.
    const achados = DO_PORTAL.filter((arquivo) =>
      semComentarios(readFileSync(arquivo, "utf8")).includes("VtLinkService"),
    );
    expect(achados.length, "ninguem em `portal/` usa o `VtLinkService`").toBeGreaterThan(0);
  });
});
