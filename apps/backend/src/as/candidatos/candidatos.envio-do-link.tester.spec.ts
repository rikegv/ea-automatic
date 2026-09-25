import { describe, expect, it } from "vitest";
import {
  corpoDoMetodo,
  fonteOuNulo,
  semComentarios,
  tiposDoConstrutorDaFonte,
} from "../../portal/portal-envio.tester-fake";

/**
 * ─ O GANCHO DO CAMINHO 1, COBERTURA INDEPENDENTE (§A.38/§A.40) ─────────────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO É DE COLOCAÇÃO, e não de comportamento ────────────────────────────────┐
 * │ O risco desta frente (S19) é POSICIONAL e está a UMA LINHA de distância: o gancho pertence ao │
 * │ ramo de `ENVIADO_PARA_ADMISSAO` dentro de `registrarSaida`, e NUNCA dentro de                 │
 * │ `mudarSituacaoOcupandoPosicao`, que também é chamado pela `aprovar` e pela `alocar`.          │
 * │ Pendurado no lugar de baixo, o sistema manda a credencial de acesso ao prontuário na hora em  │
 * │ que o consultor APROVA alguém na entrevista, e em lote, e nada falha.                         │
 * │                                                                                              │
 * │ Um teste de comportamento sobre `aprovar` e `alocar` prova o mesmo, mas exige o caminho       │
 * │ travado inteiro de mentirinha (`FOR UPDATE`, contagem de posição, catálogo de status), que é  │
 * │ justamente onde um dublê frouxo passa verde com o defeito aberto. A colocação é lida do       │
 * │ CÓDIGO EXECUTÁVEL (comentários apagados: eles usam as mesmas palavras da regra e já deram     │
 * │ falso positivo nesta fábrica) e a dependência é lida do CONSTRUTOR REAL, em runtime.          │
 * │                                                                                              │
 * │ GAP DECLARADO: a cobertura de comportamento dos ramos `aprovar`/`alocar` fica para a rodada   │
 * │ do autor, que terá o dublê do caminho travado já montado (`candidatos.lote-ocupacao.spec.ts`).│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const FONTE = fonteOuNulo("as", "candidatos", "candidatos.service.ts") ?? "";
const LIMPO = semComentarios(FONTE);

/**
 * Como o gancho se parece, seja qual for o NOME da propriedade injetada e qual dos dois métodos
 * de entrega ele use (o de uma admissão ou o de candidaturas, que é o que o caminho 1 tem à mão).
 */
const CHAMA_O_ENVIO = /enviarPara(Admissao|Candidaturas)\s*\(|\benvio\w*\s*\.?\s*\n?\s*\.\s*\w+\s*\(/i;
const REVOGA = /revogar|revogaLink|revogarLink|revogarDaAdmissao|revogarPorAdmissao/i;

function corpo(nome: string): string {
  const c = corpoDoMetodo(FONTE, nome);
  expect(c, `método \`${nome}\` não foi encontrado em candidatos.service.ts`).toBeTruthy();
  return c ?? "";
}

describe("a dependência do envio chega ao serviço do funil", () => {
  it("o arquivo do serviço foi lido", () => {
    expect(FONTE.length).toBeGreaterThan(0);
  });

  /**
   * LIDO DA FONTE, e não de `design:paramtypes`: o vitest transpila com esbuild, que NÃO emite
   * `emitDecoratorMetadata`, então o metadado vem VAZIO em teste para toda classe do Nest. Medido
   * nesta frente: a primeira redação deste teste passava a lista vazia adiante.
   */
  it("`PortalEnvioService` está no construtor de `CandidatosService`", () => {
    expect(
      tiposDoConstrutorDaFonte(FONTE, "CandidatosService"),
      "sem a dependência, não existe caminho 1",
    ).toContain("PortalEnvioService");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 7 — O GANCHO NO LUGAR CERTO (S19). REGRESSÃO IMPORTANTE.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("o envio dispara SÓ na saída para admissão (S19)", () => {
  it("`registrarSaida` chama o envio", () => {
    expect(CHAMA_O_ENVIO.test(corpo("registrarSaida")), "o gancho não está no ramo certo").toBe(
      true,
    );
  });

  /**
   * O LUGAR ERRADO. `mudarSituacaoOcupandoPosicao` é o caminho travado COMPARTILHADO: pendurar o
   * envio aqui dispara e-mail com credencial na APROVAÇÃO e na ALOCAÇÃO, inclusive no lote.
   */
  it("`mudarSituacaoOcupandoPosicao` NÃO chama o envio", () => {
    expect(
      CHAMA_O_ENVIO.test(corpo("mudarSituacaoOcupandoPosicao")),
      "e-mail na aprovação e na alocação: credencial para quem ainda nem saiu do funil",
    ).toBe(false);
  });

  it("`aprovar` NÃO chama o envio", () => {
    expect(CHAMA_O_ENVIO.test(corpo("aprovar"))).toBe(false);
  });

  it("`alocar` NÃO chama o envio", () => {
    expect(CHAMA_O_ENVIO.test(corpo("alocar"))).toBe(false);
  });

  /** Só as saídas que consomem posição avançam para a esteira, e o gancho segue a mesma régua. */
  it("o gancho fica no ramo da saída que ocupa posição, e não no desvínculo simples", () => {
    const body = corpo("registrarSaida");
    const ramo = body.slice(0, body.search(/ocupaPosicao\s*\(/) >= 0 ? body.length : body.length);
    const posicaoDoGancho = ramo.search(CHAMA_O_ENVIO);
    const posicaoDoRamo = ramo.search(/ocupaPosicao\s*\(/);
    expect(posicaoDoRamo, "a régua `ocupaPosicao` sumiu do método").toBeGreaterThanOrEqual(0);
    expect(
      posicaoDoGancho,
      "o gancho ficou antes da régua que decide o ramo: dispararia em DESCARTADO e DESISTIU",
    ).toBeGreaterThan(posicaoDoRamo);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 9 — A SAÍDA NO FUNIL SOBREVIVE À FALHA DE ENVIO
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("envio que falha NÃO derruba o registro da saída", () => {
  /**
   * O QUE ACONTECE SE CAIR: o Gmail fora do ar (ou a credencial ainda não habilitada, que é o
   * estado de hoje) passa a REVERTER a movimentação do funil. O consultor clica, vê um erro, e a
   * pessoa continua na etapa anterior, consumindo posição da vaga. O e-mail é ACESSÓRIO da saída;
   * a saída é o fato operacional.
   */
  it("a chamada do envio está dentro de um `try`", () => {
    const body = corpo("registrarSaida");
    const desdeOTry = body.slice(body.indexOf("try"));
    expect(body.includes("try"), "envio sem `try`: a falha do correio derruba a saída").toBe(true);
    expect(CHAMA_O_ENVIO.test(desdeOTry)).toBe(true);
  });

  it("e o `catch` que o envolve NÃO relança", () => {
    const body = corpo("registrarSaida");
    const catches = [...body.matchAll(/catch\s*\([^)]*\)\s*\{([\s\S]{0,400}?)\}/g)].map((m) => m[1]);
    expect(catches.length, "não há `catch` em volta do envio").toBeGreaterThan(0);
    for (const bloco of catches) {
      expect(bloco, "o `catch` relança: a falha do e-mail derruba a saída").not.toMatch(/\bthrow\b/);
    }
  });

  /**
   * E o que ele registra não pode carregar PII: o erro do correio traz o endereço dentro.
   *
   * O QUE SE PROCURA É O VALOR INTERPOLADO, e não a palavra: a frase fixa "envio do link do
   * portal" contém "link" e não vaza nada. Falso positivo em teste de segurança some com o sinal
   * e ensina quem lê a ignorá-lo (medido nesta frente, duas vezes).
   */
  it("o tratamento da falha não loga endereço, URL nem token (§A.6)", () => {
    const body = corpo("registrarSaida");
    const suspeitas = body
      .split("\n")
      .filter((l) => /(this\.log|logger|console)\s*\.\s*\w+\s*\(/i.test(l))
      .filter(
        (l) =>
          /\$\{[^}]*(email|destino|url|link|token|cpf)/i.test(l) ||
          /[,(]\s*\w*(email|destino|url|token|cpf)\w*\s*[,)]/i.test(l),
      );
    expect(suspeitas, "log com dado pessoal ou credencial interpolada").toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 8 — REVERTER O ENVIO REVOGA O LINK (S20)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("reverter o envio para admissão REVOGA o link (decisão 4 do diretor)", () => {
  /**
   * S20: `reverterEnvioParaAdmissao` é `update` próprio e NÃO passa por `registrarSaida`, então
   * ligar a revogação só no caminho de saída deixa este de fora. Sem a revogação, a pessoa sai da
   * esteira e o link dela continua vivo por até 72 horas, aceitando documento para uma admissão
   * que foi desfeita.
   */
  it("o método chama a revogação", () => {
    expect(
      REVOGA.test(corpo("reverterEnvioParaAdmissao")),
      "reversão sem revogação: credencial viva para um envio desfeito",
    ).toBe(true);
  });

  it("a revogação tem MOTIVO próprio na trilha, e não se confunde com incidente", () => {
    const body = corpo("reverterEnvioParaAdmissao");
    expect(
      /motivo|REVERT|ENVIO_REVERTIDO/i.test(body),
      "sem código próprio, a reversão de rotina infla o número que sinaliza vazamento",
    ).toBe(true);
  });

  /** A reversão do funil continua acontecendo mesmo que a revogação falhe: o fato é a reversão. */
  it("a falha da revogação não derruba a reversão", () => {
    const body = corpo("reverterEnvioParaAdmissao");
    const trecho = body.slice(body.search(REVOGA) - 200);
    expect(/try\s*\{/.test(body) || !/await/.test(trecho), "a revogação está sem proteção").toBe(
      true,
    );
  });
});

describe("o arquivo do funil não ganhou PII por tabela nova (§A.6)", () => {
  it("nenhuma escrita do serviço grava endereço de e-mail", () => {
    const escritas = [...LIMPO.matchAll(/\.\s*(values|set)\s*\(\s*\{([\s\S]{0,300}?)\}/g)].map(
      (m) => m[2],
    );
    for (const bloco of escritas) {
      const chaves = [...bloco.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
      for (const chave of chaves) {
        expect(chave).not.toMatch(/^(email|destino|url|link|token)$/i);
      }
    }
  });
});
