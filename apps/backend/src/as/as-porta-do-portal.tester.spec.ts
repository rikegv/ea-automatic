import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A BARREIRA DE MÓDULO ENTRE `as/` E O PORTAL FICOU MAIS FINA, E ISSO É MEDIDA.
 *
 * Achado da auditoria desta frente. O cabeçalho do `as.module.ts` afirmava que entrava "UMA PORTA
 * SÓ: `PortalEnvioService`", e isso é FALSO: no Nest, importar um módulo torna injetável tudo que
 * ele EXPORTA, e `portal.module.ts` exporta TRÊS serviços. Com `PortalModule` nos `imports`, o
 * A&S passou a alcançar também o `PortalIdentidadeService`, que é o dono de TODA escrita em
 * `portal_links` (`emitirLink`, que REVOGA os links anteriores da admissão, e `revogarLink`), e o
 * `PortalTrilhaService`, que é a única porta de gravação da trilha.
 *
 * NÃO HÁ FALHA HOJE: nada em `as/` injeta as outras duas. O que há é ALCANCE, e alcance descrito
 * por comentário se perde na primeira pessoa que precisar revogar um link "rapidinho" de dentro do
 * funil. O desenho inteiro do `portal-envio.service.ts` se apoia em `portal_links` ter UM ponto de
 * escrita enumerável, que foi o que permitiu a auditoria afirmar o que pode e o que não pode ser
 * gravado sobre um link. Por isso a régua vira teste, e não parágrafo.
 */

const AS = resolve(__dirname);
const ESTE_ARQUIVO = "as-porta-do-portal.tester.spec.ts";

function arquivosTs(dir: string, acumulado: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const alvo = join(dir, nome);
    if (statSync(alvo).isDirectory()) arquivosTs(alvo, acumulado);
    else if (alvo.endsWith(".ts") && !alvo.endsWith(ESTE_ARQUIVO)) acumulado.push(alvo);
  }
  return acumulado;
}

const DO_AS = arquivosTs(AS);

/**
 * CÓDIGO, NÃO COMENTÁRIO. O proprio `as.module.ts` CITA o `PortalIdentidadeService` em prosa, para
 * dizer que quem escreve em `portal_links` e ele, do outro lado da porta. Essa frase e a
 * documentacao da regra, e nao a violacao dela: um teste que casasse texto puniria exatamente o
 * comentario que a auditoria mandou escrever.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Os dois exports do `PortalModule` que o A&S alcança e NÃO pode usar. */
const FORA_DO_ALCANCE = ["PortalIdentidadeService", "PortalTrilhaService"] as const;

describe("o A&S alcança TRÊS exports do Portal, e usa UM", () => {
  it("a varredura de fato enxerga os arquivos do A&S", () => {
    expect(DO_AS.length, "a varredura nao achou arquivo nenhum sob `as/`").toBeGreaterThan(20);
  });

  for (const servico of FORA_DO_ALCANCE) {
    it(`nenhum arquivo sob \`as/\` importa \`${servico}\``, () => {
      const achados = DO_AS.filter((arquivo) =>
        semComentarios(readFileSync(arquivo, "utf8")).includes(servico),
      ).map((a) => a.replace(`${AS}/`, ""));
      expect(
        achados,
        `\`${servico}\` foi alcancado de dentro do A&S. Importar o \`PortalModule\` tornou injetavel TUDO que ele exporta, entao a barreira de modulo nao segura mais isso: quem segura e este teste. O desenho do \`portal-envio.service.ts\` se apoia em \`portal_links\` ter UM ponto de escrita (o \`PortalIdentidadeService\`, do outro lado da porta), e e essa lista enumeravel que torna auditavel a regua do que pode ser gravado sobre um link. Precisa mesmo? Passe pelo \`PortalEnvioService\`, que e a porta que o A&S usa.`,
      ).toEqual([]);
    });
  }

  it("o `PortalEnvioService` continua sendo a porta que o A&S usa", () => {
    // Se esta afirmacao cair, a importacao inteira do `PortalModule` em `as.module.ts` virou
    // alcance sem uso, e o certo passa a ser REMOVER a importacao, nao afrouxar o teste acima.
    const achados = DO_AS.filter((arquivo) =>
      semComentarios(readFileSync(arquivo, "utf8")).includes("PortalEnvioService"),
    );
    expect(achados.length, "ninguem em `as/` usa o `PortalEnvioService`").toBeGreaterThan(0);
  });
});
