import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * OS TRÊS CAMINHOS PASSAM PELA PORTA ÚNICA (item 1 da OST dos 3 itens).
 *
 * POR QUE ESTE TESTE EXISTE, e por que ele lê o CÓDIGO-FONTE em vez de rodar o serviço.
 * `nascimento-cadastro.spec` já prova que a porta faz a coisa certa quando é chamada. O que não
 * havia teste nenhum era o elo que a §A.26 conta ter quebrado calado: um dos três caminhos DEIXAR DE
 * CHAMAR a porta. Foi assim que a transição pós-ASO parou de funcionar sem nenhum teste ficar
 * vermelho, porque o elo que faltava não tinha teste, e é exatamente a suspeita que abriu esta OST
 * ("a Integração parou de nascer junto com o Cadastro").
 *
 * O Cadastro nasce em TRÊS lugares, e a Integração nasce junto em cada um deles:
 *   1. `EsteiraService.mudarStatus`         — o consultor move o status na tela;
 *   2. `AuditoriaService.autoConcluirAuditoria` — a I.A fecha a Auditoria sozinha (regra 2);
 *   3. `EsteiraService.concluirExamePorAso` — o ASO validado pela I.A fecha o Exame.
 *
 * A leitura é ESTÁTICA de propósito: montar os três fluxos de ponta a ponta com transação, farol e
 * régua custaria um teste de integração inteiro para responder uma pergunta de uma linha. Se um
 * caminho novo nascer amanhã, ele entra nesta lista; se um destes três perder a chamada, o teste
 * fica vermelho na hora, que é tudo o que se pede dele.
 */

const RAIZ = join(__dirname, "..");

/** O corpo de um método, do cabeçalho até o próximo membro no MESMO nível de indentação. */
function corpoDoMetodo(arquivo: string, assinatura: string): string {
  const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
  const inicio = fonte.indexOf(assinatura);
  expect(inicio, `${assinatura} não encontrado em ${arquivo}`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + assinatura.length);
  // Próximo membro da classe: uma linha que começa com exatamente dois espaços e um identificador.
  const fim = resto.search(/\n {2}(?:async |private |public |protected |get |[A-Za-z_])/);
  return fim === -1 ? resto : resto.slice(0, fim);
}

const CAMINHOS: { rotulo: string; arquivo: string; assinatura: string }[] = [
  {
    rotulo: "1. status movido na tela (EsteiraService.mudarStatus)",
    arquivo: "esteira/esteira.service.ts",
    assinatura: "async mudarStatus(",
  },
  {
    rotulo: "2. auto-conclusão da Auditoria pela I.A (AuditoriaService.autoConcluirAuditoria)",
    arquivo: "auditoria/auditoria.service.ts",
    assinatura: "private async autoConcluirAuditoria(",
  },
  {
    rotulo: "3. Exame fechado pelo ASO (EsteiraService.concluirExamePorAso)",
    arquivo: "esteira/esteira.service.ts",
    assinatura: "private async concluirExamePorAso(",
  },
];

describe("nascimento do Cadastro e da Integração: os três caminhos usam a porta única", () => {
  for (const c of CAMINHOS) {
    it(`${c.rotulo} chama nascerCadastroEIntegracao`, () => {
      expect(corpoDoMetodo(c.arquivo, c.assinatura)).toContain("nascerCadastroEIntegracao(");
    });
  }

  it("os dois serviços IMPORTAM a porta única, e não uma cópia local da regra", () => {
    for (const arquivo of ["esteira/esteira.service.ts", "auditoria/auditoria.service.ts"]) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
      expect(fonte, arquivo).toMatch(
        /import \{ nascerCadastroEIntegracao \} from "\.[./]*(esteira\/)?nascimento-cadastro";/,
      );
    }
  });
});
