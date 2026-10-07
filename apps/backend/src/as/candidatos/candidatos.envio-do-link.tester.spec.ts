import { describe, expect, it } from "vitest";
import {
  corpoDoMetodo,
  fonteOuNulo,
  semComentarios,
  tiposDoConstrutorDaFonte,
} from "../../portal/portal-envio.tester-fake";

/**
 * ─ O GANCHO DO ENVIO DO LINK, COBERTURA INDEPENDENTE (§A.38/§A.40) ─────────────────────────────
 *
 * ┌─ O GANCHO MUDOU DE CASA (migração do `tester`) ──────────────────────────────────────────────┐
 * │ A credencial de acesso ao prontuário (o link do Portal) NÃO sai mais na saída do funil. O      │
 * │ gancho saiu de `CandidatosService.registrarSaida` (A&S) e passou para                          │
 * │ `AdmissoesService.liberar` (admissoes.service.ts): o aviso só faz sentido DEPOIS que a         │
 * │ transação de liberação commita e a admissão vira EM_ADMISSAO, quando já existe destinatário e  │
 * │ o farol deixa de recusar a emissão. Na saída do funil a admissão é pré-admissão em             │
 * │ AGUARDANDO_LIBERACAO, farol que a emissão recusa (SEM_ADMISSAO), então mandar o link ali daria │
 * │ credencial a quem ainda nem foi liberado.                                                      │
 * │                                                                                               │
 * │ O risco continua POSICIONAL e a UMA LINHA de distância, só que no destino novo: o gancho fica  │
 * │ DEPOIS do commit da transação de `liberar`, e é BEST-EFFORT (try que absorve a falha, catch    │
 * │ que não relança), porque a LIBERAÇÃO é o fato e o envio é o aviso (§A.5). Em `liberarEmLote`   │
 * │ (Alto Volume) o gancho NÃO existe, de propósito: o lote mandaria N credenciais de uma vez.     │
 * │                                                                                               │
 * │ A colocação é lida do CÓDIGO EXECUTÁVEL (comentários apagados por `corpoDoMetodo`: eles usam    │
 * │ as mesmas palavras da regra e já deram falso positivo nesta fábrica, ver a memória "varredura  │
 * │ de fonte casa comentário"). O comportamento (chama na hora certa, sobrevive à falha, não       │
 * │ emite na saída do funil) está provado contra o serviço REAL em                                 │
 * │ `admissoes/admissoes.gancho-envio-liberacao.tester.spec.ts`.                                   │
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

/** A casa NOVA do gancho: `AdmissoesService.liberar` vive em admissoes.service.ts. */
const FONTE_ADM = fonteOuNulo("admissoes", "admissoes.service.ts") ?? "";

/**
 * O CORPO DE UM MÉTODO COM ASSINATURA RICA.
 *
 * `corpoDoMetodo` (o auxiliar da casa) abre no PRIMEIRO `{` depois do nome, o que funciona para
 * `registrarSaida` (dto é um tipo NOMEADO), mas NÃO para `liberar`: a assinatura tem um `dto: { ... }`
 * inline e um retorno `Promise<{ ... }>`, então o primeiro `{` é o do TIPO do parâmetro, não o do
 * corpo, e a extração devolveria a declaração do dto. Este auxiliar pula a lista de parâmetros
 * (balanceando `()`), pula a anotação de retorno (o `{` dentro de `<...>` não conta) e só então abre
 * o corpo. Comentários apagados por `semComentarios` ANTES de qualquer casamento (§A.6 / varredura
 * casa comentário).
 */
function corpoAdm(nome: string): string {
  const limpo = semComentarios(FONTE_ADM);
  const marca = new RegExp(
    `^  (?:private |protected |public )?(?:readonly )?(?:async )?${nome}\\s*\\(`,
    "m",
  );
  const achado = limpo.search(marca);
  expect(achado, `método \`${nome}\` não foi encontrado em admissoes.service.ts`).toBeGreaterThanOrEqual(
    0,
  );
  // 1) balanceia a lista de parâmetros, do `(` do método até o `)` que o fecha.
  let i = limpo.indexOf("(", achado);
  let paren = 0;
  for (; i < limpo.length; i += 1) {
    if (limpo[i] === "(") paren += 1;
    else if (limpo[i] === ")") {
      paren -= 1;
      if (paren === 0) {
        i += 1;
        break;
      }
    }
  }
  // 2) acha o `{` do CORPO: o primeiro com profundidade de `<...>` zero (o do retorno fica dentro).
  let angle = 0;
  let abreCorpo = -1;
  for (; i < limpo.length; i += 1) {
    const ch = limpo[i];
    if (ch === "<") angle += 1;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (ch === "{" && angle === 0) {
      abreCorpo = i;
      break;
    }
  }
  expect(abreCorpo, `corpo de \`${nome}\` não localizado`).toBeGreaterThan(0);
  // 3) balanceia as chaves do corpo.
  let brace = 0;
  for (let j = abreCorpo; j < limpo.length; j += 1) {
    if (limpo[j] === "{") brace += 1;
    else if (limpo[j] === "}") {
      brace -= 1;
      if (brace === 0) return limpo.slice(abreCorpo, j + 1);
    }
  }
  throw new Error(`corpo de \`${nome}\` sem fechamento`);
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
// REGRA 7 — O GANCHO NO LUGAR CERTO (S19, migrado para a LIBERAÇÃO). REGRESSÃO IMPORTANTE.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("o envio dispara na LIBERAÇÃO, e não mais na saída do funil (S19, migrado)", () => {
  it("`AdmissoesService.liberar` chama o envio", () => {
    expect(
      CHAMA_O_ENVIO.test(corpoAdm("liberar")),
      "o gancho não está na liberação: ninguém avisa o candidato",
    ).toBe(true);
  });

  /**
   * A ORIGEM É `AUTOMATICO`, e não o disparo manual da tela: é a liberação que puxou o gatilho, não
   * um clique no botão de reenviar. A origem alimenta a trilha e distingue um envio de rotina de um
   * reenvio decidido à mão.
   */
  it("o envio da liberação usa a origem AUTOMATICO", () => {
    expect(
      corpoAdm("liberar"),
      "o gancho da liberação não marca a origem AUTOMATICO",
    ).toMatch(/enviarParaAdmissao\s*\([^)]*AUTOMATICO/s);
  });

  /**
   * DEPOIS DO COMMIT. A admissão só vira EM_ADMISSAO (ganha cliente+cargo, aparece na Esteira)
   * quando a transação de liberação commita. Mandar o link ANTES do commit entregaria credencial de
   * uma liberação que ainda pode reverter, e a retentativa seria recusada (farol já mudou).
   */
  it("o gancho fica DEPOIS do commit da transação de liberação", () => {
    const body = corpoAdm("liberar");
    const posicaoDaTransacao = body.search(/\.\s*transaction\s*\(/);
    const posicaoDoGancho = body.search(/enviarParaAdmissao\s*\(/);
    expect(posicaoDaTransacao, "a transação de liberação sumiu do método").toBeGreaterThanOrEqual(0);
    expect(
      posicaoDoGancho,
      "o gancho ficou antes do commit: credencial de uma liberação que pode reverter",
    ).toBeGreaterThan(posicaoDaTransacao);
  });

  /**
   * A CASA ANTIGA FICOU VAZIA. `registrarSaida` cria a pré-admissão e grava o elo `admissao_id`, mas
   * NÃO emite nem envia link nenhum: naquela hora a admissão é AGUARDANDO_LIBERACAO e a emissão
   * recusa. Deixar o gancho ali daria credencial a quem ainda nem foi liberado. Comentários apagados
   * por `corpoDoMetodo` (a caixa "O LINK DO PORTAL NÃO SAI AQUI" cita "emissão" e "LIBERAÇÃO", e sem
   * a limpeza o próprio comentário daria falso positivo, §A.6 / varredura casa comentário).
   */
  it("`registrarSaida` NÃO chama mais a emissão", () => {
    expect(
      CHAMA_O_ENVIO.test(corpo("registrarSaida")),
      "o gancho antigo sobreviveu: a credencial sairia na saída do funil, antes da liberação",
    ).toBe(false);
  });

  /**
   * O ALTO VOLUME NÃO AVISA, de propósito (requisito). O lote mandaria N credenciais de uma vez, e
   * a decisão do diretor manteve o envio só na liberação INDIVIDUAL.
   */
  it("`liberarEmLote` (Alto Volume) NÃO chama o envio", () => {
    expect(
      CHAMA_O_ENVIO.test(corpoAdm("liberarEmLote")),
      "o lote dispararia uma credencial por pessoa, fora de escopo",
    ).toBe(false);
  });

  /**
   * OS CAMINHOS COMPARTILHADOS DA OCUPAÇÃO DE POSIÇÃO SEGUEM LIMPOS. `mudarSituacaoOcupandoPosicao`
   * é o caminho travado compartilhado por `aprovar` e `alocar`: um envio pendurado ali dispararia
   * credencial na APROVAÇÃO e na ALOCAÇÃO, inclusive em lote. Guarda de regressão.
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
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// REGRA 9 — A LIBERAÇÃO SOBREVIVE À FALHA DE ENVIO (migrado para a `liberar`)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe("envio que falha NÃO derruba a liberação", () => {
  /**
   * O QUE ACONTECE SE CAIR: o Gmail fora do ar (ou a credencial ainda não habilitada) passaria a
   * REVERTER a liberação. Mas a admissão já commitou como EM_ADMISSAO: lançar aqui desfaria um fato
   * consumado por causa de um e-mail, e a retentativa seria recusada (o farol já não é mais
   * AGUARDANDO_LIBERACAO). O envio é ACESSÓRIO; a liberação é o fato operacional.
   */
  it("a chamada do envio está dentro de um `try`", () => {
    const body = corpoAdm("liberar");
    const desdeOTry = body.slice(body.indexOf("try"));
    expect(body.includes("try"), "envio sem `try`: a falha do correio derruba a liberação").toBe(
      true,
    );
    expect(CHAMA_O_ENVIO.test(desdeOTry)).toBe(true);
  });

  it("e o `catch` que o envolve NÃO relança", () => {
    const body = corpoAdm("liberar");
    const catches = [...body.matchAll(/catch\s*\([^)]*\)\s*\{([\s\S]{0,400}?)\}/g)].map((m) => m[1]);
    expect(catches.length, "não há `catch` em volta do envio").toBeGreaterThan(0);
    for (const bloco of catches) {
      expect(bloco, "o `catch` relança: a falha do e-mail derruba a liberação").not.toMatch(
        /\bthrow\b/,
      );
    }
  });

  /**
   * E o que ele registra não pode carregar PII: o erro do correio traz o endereço dentro. Em recusa
   * loga só o CÓDIGO do motivo; em erro inesperado, só o NOME do erro (requisito §A.6).
   *
   * O QUE SE PROCURA É O VALOR INTERPOLADO, e não a palavra: a frase fixa "link do portal nao saiu
   * na liberacao" contém "link" e não vaza nada. Falso positivo em teste de segurança some com o
   * sinal e ensina quem lê a ignorá-lo (medido nesta frente, duas vezes).
   */
  it("o tratamento da falha não loga endereço, URL, token nem CPF (§A.6)", () => {
    const body = corpoAdm("liberar");
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
