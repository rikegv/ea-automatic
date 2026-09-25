import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AVISO_PENDENCIA_NO_TIME,
  RECUSAS_QUE_QUEIMAM,
  TETO_REPROVACOES_POR_PENDENCIA,
  acabouDeCairParaOTime,
  queimaTentativa,
  situacaoDaPendencia,
  type Desfecho,
} from "./portal-tentativas";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO (§A.40 regra 2).
 *
 * REQUISITO: O TETO DE TENTATIVAS DO PORTAL.
 *
 * O candidato reprovado pelo leitor corrige e reenvia, com teto de TRÊS tentativas na MESMA
 * pendência (admissão mais tipo de documento). Atingido o teto, a pendência cai para a fila do time
 * e o candidato para de receber credencial PARA AQUELE TIPO, com mensagem clara em vez de erro seco.
 * Origem: `docs/FLUXO-AUDITORIA-HOJE-E-O-PORTAL.md`, pergunta B, item 2.
 *
 * O PONTO EM QUE O AUTOR TENDE A ERRAR O REQUISITO, e é o motivo de este arquivo existir:
 * **O TETO CONTA REPROVAÇÃO, NÃO ENVIO.** Credencial emitida e nunca usada, e envio que morreu no
 * 4G do candidato, NÃO queimam tentativa. A régua de cota que já existe (`portal-credencial.ts`)
 * conta na EMISSÃO de propósito, porque lá o que se protege é a nossa conta na nuvem. Aqui o que se
 * protege é o candidato, e ele não pode perder a vez por causa da operadora dele. São duas
 * contagens de naturezas diferentes, e fundi-las é o defeito que este arquivo procura.
 *
 * ESCRITO POR QUEM NÃO ESCREVEU O CÓDIGO. Teste do próprio autor pega regressão bem e pega
 * mal-entendido de requisito mal, porque codifica a mesma suposição que gerou o código.
 */

const veredito = (valido: boolean): Desfecho => ({ tipo: "VEREDITO", valido });
const recusa = (codigo: string): Desfecho => ({ tipo: "RECUSA_DO_LEITOR", codigo });
const FALHA: Desfecho = { tipo: "FALHA" };

describe("O TETO É TRÊS, escrito à mão e não derivado de outra cota", () => {
  it("o número do diretor está no código, e é 3", () => {
    expect(TETO_REPROVACOES_POR_PENDENCIA).toBe(3);
  });
});

describe("PROVA 1: até o teto, o candidato continua recebendo credencial", () => {
  it("com zero, uma e duas reprovações a pendência segue com o candidato", () => {
    expect(situacaoDaPendencia({ reprovacoes: 0 })).toEqual({ noTime: false, restantes: 3 });
    expect(situacaoDaPendencia({ reprovacoes: 1 })).toEqual({ noTime: false, restantes: 2 });
    expect(situacaoDaPendencia({ reprovacoes: 2 })).toEqual({ noTime: false, restantes: 1 });
  });

  it("a TERCEIRA tentativa é concedida: o teto é de tentativas, não de reprovações permitidas", () => {
    // O erro de contagem por um: reprovado duas vezes, o candidato AINDA tem a terceira chance.
    // Barrar aqui tiraria dele justamente a tentativa que o teto promete.
    expect(situacaoDaPendencia({ reprovacoes: 2 }).noTime).toBe(false);
  });
});

describe("PROVA 2: NO TETO ele para, e é avisado em vez de receber erro seco", () => {
  it("a terceira reprovação fecha a porta daquela pendência", () => {
    expect(situacaoDaPendencia({ reprovacoes: 3 })).toEqual({ noTime: true, restantes: 0 });
  });

  it("passar do teto continua fechado, sem contagem negativa e sem estourar", () => {
    expect(situacaoDaPendencia({ reprovacoes: 9 })).toEqual({ noTime: true, restantes: 0 });
  });

  it("o aviso ao candidato diz o que aconteceu, quem vai agir e que ele não precisa reenviar", () => {
    expect(AVISO_PENDENCIA_NO_TIME.length).toBeGreaterThan(30);
    expect(AVISO_PENDENCIA_NO_TIME).toMatch(/equipe|time|consultor/i);
    // A parte que separa um aviso de um beco: dizer que ele PARE, e não deixá-lo tentando.
    expect(AVISO_PENDENCIA_NO_TIME).toMatch(/não é preciso|nao e preciso|não precisa/i);
  });

  it("§A.11: o aviso não tem travessão, e não é rótulo técnico", () => {
    expect(AVISO_PENDENCIA_NO_TIME).not.toContain("\u2014");
    expect(AVISO_PENDENCIA_NO_TIME.toUpperCase()).not.toContain("TENTATIVAS_ESGOTADAS");
    expect(AVISO_PENDENCIA_NO_TIME.toUpperCase()).not.toContain("INCONFORME");
  });

  it("o candidato recebe a recusa POR TETO, e não uma recusa de outra trava", () => {
    // Fonte lida, não suposta: a tela precisa dizer "o time assumiu", e não "arquivo grande demais",
    // que mandaria o candidato tentar de novo um envio que não vai mais acontecer.
    const servico = readFileSync(
      join(__dirname, "..", "portal", "portal-credencial.service.ts"),
      "utf8",
    );
    expect(servico).toContain('case "TENTATIVAS_ESGOTADAS"');
    expect(servico).toContain("AVISO_PENDENCIA_NO_TIME");
  });
});

describe("PROVA 3, ONDE O REQUISITO COSTUMA SER MAL ENTENDIDO: conta REPROVAÇÃO, não envio", () => {
  it("veredito NEGATIVO queima: é a reprovação de verdade", () => {
    expect(queimaTentativa(veredito(false))).toBe(true);
  });

  it("veredito POSITIVO não queima: aprovar não pode aproximar ninguém do teto", () => {
    expect(queimaTentativa(veredito(true))).toBe(false);
  });

  it("FALHA DE INFRAESTRUTURA não queima, e este é o item 3 do requisito", () => {
    // Credencial emitida e nunca usada, envio que morreu na rede, leitor fora do ar, cota da IA
    // estourada, tempo esgotado. Nada disso é decisão sobre o documento, e o candidato não pode
    // perder a vez por causa da operadora dele nem da nossa indisponibilidade.
    expect(queimaTentativa(FALHA)).toBe(false);
  });

  it("RECUSA TÉCNICA do arquivo não queima: é o arquivo que não coube, não o documento que não serve", () => {
    // Uma foto de celular grande demais derrubaria o candidato em três toques.
    for (const codigo of ["TAMANHO", "PAGINAS", "DIMENSAO", "TEMPO", "HEIC", "FORMATO", "CONTEUDO_ATIVO"]) {
      expect({ codigo, queima: queimaTentativa(recusa(codigo)) }).toEqual({ codigo, queima: false });
    }
  });

  it("PDF COM SENHA queima: é julgamento do documento, decidido sem gastar IA", () => {
    expect(queimaTentativa(recusa("PROTEGIDO_SENHA"))).toBe(true);
    expect(queimaTentativa(recusa("protegido_senha"))).toBe(true);
  });

  it("a lista do que queima é FECHADA e curta: código desconhecido NÃO queima", () => {
    // Na dúvida, não se queima tentativa do candidato (a assimetria de dano da §A.33). Um código
    // novo que o leitor passe a devolver amanhã não pode começar a punir sozinho.
    expect(queimaTentativa(recusa("MOTIVO_QUE_NINGUEM_PREVIU"))).toBe(false);
    expect(queimaTentativa(recusa(""))).toBe(false);
    expect(RECUSAS_QUE_QUEIMAM).toEqual(["PROTEGIDO_SENHA"]);
  });
});

describe("PROVA 4: a contagem é POR PENDÊNCIA, e sobrevive a link novo", () => {
  const servico = readFileSync(
    join(__dirname, "..", "portal", "portal-credencial.service.ts"),
    "utf8",
  );
  const contagem =
    servico.match(/reprovacoesDaPendencia\([\s\S]*?\n {2}\}/)?.[0] ?? "";

  it("a contagem existe e é lida do BANCO, não de bilhete, cookie ou memória", () => {
    // Contador que o cliente carrega é contador que o cliente forja, e contador em memória de
    // processo morre no primeiro reinício, que é o defeito que já foi corrigido na cota do link.
    expect(contagem).toContain("select");
    expect(contagem).toContain("portalCredenciais");
  });

  it("a chave é ADMISSÃO mais TIPO DE DOCUMENTO", () => {
    expect(contagem).toContain("admissaoId");
    expect(contagem).toContain("tipoDocumentoId");
  });

  it("A CHAVE NÃO É O LINK: filtrar por jtiLink faria pedir link novo ZERAR o teto", () => {
    // É o ponto que o próprio módulo chama de mais fácil de errar da frente inteira, e o teto
    // viraria teatro: o candidato barrado pediria outro link e recomeçaria do zero.
    expect(contagem).not.toContain("jtiLink");
  });

  it("estourar um tipo não derruba os outros: a régua recebe UMA contagem, a daquela pendência", () => {
    expect(situacaoDaPendencia({ reprovacoes: 3 }).noTime).toBe(true);
    expect(situacaoDaPendencia({ reprovacoes: 0 }).noTime).toBe(false);
  });
});

describe("PROVA 5: fica registrado QUANTAS tentativas houve e QUANDO caiu para o time", () => {
  it("o gatilho de 'caiu para o time' é de BORDA: só na reprovação que ATINGE o teto", () => {
    expect(acabouDeCairParaOTime(1)).toBe(false);
    expect(acabouDeCairParaOTime(2)).toBe(false);
    expect(acabouDeCairParaOTime(3)).toBe(true);
  });

  it("a quarta reprovação NÃO volta a carimbar: o carimbo é o da queda, não o do último clique", () => {
    // Sem isto, a hora em que a pendência virou trabalho do time seria reescrita a cada insistência
    // e a fila humana perderia a ordem de chegada.
    expect(acabouDeCairParaOTime(4)).toBe(false);
    expect(acabouDeCairParaOTime(9)).toBe(false);
  });

  it("o REGISTRO é durável: existe onde gravar a reprovação e onde gravar a queda", () => {
    const servico = readFileSync(
      join(__dirname, "..", "portal", "portal-credencial.service.ts"),
      "utf8",
    );
    // A contagem sai das linhas com carimbo de reprovação; a queda tem casa própria, com o instante.
    expect(servico).toContain("reprovadoEm");
    expect(servico).toContain("portalPendenciasNoTime");
  });
});

describe("PROVA 6 (§A.6): a régua do teto não toca dado pessoal", () => {
  it("a entrada é contagem, a saída é contagem e booleano", () => {
    const situacao = situacaoDaPendencia({ reprovacoes: 3 });
    expect(Object.keys(situacao).sort()).toEqual(["noTime", "restantes"]);
    for (const valor of Object.values(situacao)) {
      expect(["number", "boolean"]).toContain(typeof valor);
    }
  });

  it("o desfecho que a régua consome carrega CÓDIGO, nunca o motivo escrito pela IA", () => {
    // O motivo é texto livre endereçado à tela do candidato, e é em texto livre que a PII volta
    // para o log. A régua decide por código e por booleano, então ela não tem como vazar.
    expect(queimaTentativa(recusa("PROTEGIDO_SENHA"))).toBe(true);
    const comMotivo = { tipo: "RECUSA_DO_LEITOR", codigo: "PROTEGIDO_SENHA" } as Desfecho;
    expect(Object.keys(comMotivo).sort()).toEqual(["codigo", "tipo"]);
  });

  it("o aviso ao candidato não repete CPF nem nome", () => {
    expect(AVISO_PENDENCIA_NO_TIME).not.toMatch(/\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("contagem corrompida não vira NaN na tela nem número negativo", () => {
    expect(situacaoDaPendencia({ reprovacoes: Number.NaN })).toEqual({ noTime: false, restantes: 3 });
    expect(situacaoDaPendencia({ reprovacoes: -5 })).toEqual({ noTime: false, restantes: 3 });
  });
});

describe("DEFEITO ACHADO: a ESCALADA por falta de regra ativa QUEIMA tentativa hoje", () => {
  /**
   * O QUE ESTÁ ERRADO, medido nos dois arquivos, e não deduzido.
   *
   * 1. `apps/ai-service/app/routers/portal.py:160-173`. Quando o tipo de documento NÃO tem regra de
   *    auditoria ativa, o leitor NÃO omite o bloco de auditoria: ele devolve um bloco PRESENTE, com
   *    `valido: False`, `status: "PENDENTE"` e o motivo "validação manual necessária". É escalada,
   *    e o §A.9 diz isso com todas as letras: sem regra ativa a IA nem decide.
   *
   * 2. `apps/backend/src/portal/portal-credencial.service.ts`, no confronto do veredito. O
   *    comentário do próprio código afirma "Ausência de bloco de auditoria (tipo sem regra ativa)
   *    NÃO é reprovação e não queima nada", e a guarda escrita é `if (resposta.auditoria)`. A
   *    premissa é FALSA contra o serviço de IA real: naquele caso o bloco EXISTE, então a guarda
   *    abre, `valido === true` dá falso e o desfecho vira `{ tipo: "VEREDITO", valido: false }`.
   *
   * CONSEQUÊNCIA: um tipo de documento sem regra ativa queima as TRÊS tentativas do candidato e o
   * derruba para a fila do time SEM UMA ÚNICA REPROVAÇÃO REAL. É exatamente o item 3 do requisito,
   * "o teto conta REPROVAÇÃO, não envio", violado pelo caminho menos óbvio. Hoje a régua tem 91
   * regras ativas e o catálogo tem 30 tipos vivos, então o caso não é hipotético.
   *
   * O CONSERTO JÁ ESTÁ NA MÃO DE QUEM ESCREVEU: a lista `regras` é montada nesse mesmo método,
   * poucas linhas acima, e lista vazia é a prova de que não houve auditoria. O que falta é a guarda
   * olhar para ela.
   *
   * ESTE TESTE NÃO CONSERTA NADA, e é escrito para sobreviver ao conserto: ele não fixa a forma da
   * correção, só exige que a decisão do veredito CONSULTE a existência de regra ativa.
   */
  const servico = readFileSync(
    join(__dirname, "..", "portal", "portal-credencial.service.ts"),
    "utf8",
  );

  it("a decisão do VEREDITO consulta se havia REGRA ATIVA, e não só a presença do bloco", () => {
    const i = servico.indexOf('tipo: "VEREDITO"');
    expect(i).toBeGreaterThan(-1);
    // A vizinhança da decisão, que é onde a guarda tem de estar.
    const vizinhanca = servico.slice(Math.max(0, i - 900), i + 200);
    const consultaAsRegras = /regras\.length|houveRegra|semRegra|regrasAtivas/.test(vizinhanca);
    expect(consultaAsRegras).toBe(true);
  });

  it("escalada sem regra ativa tem de virar FALHA, e FALHA nunca queima", () => {
    expect(queimaTentativa(FALHA)).toBe(false);
  });

  it("a régua pura está CERTA: quem erra é a tradução, e ela é de quem chama", () => {
    // Os dois casos chegam do leitor com `valido: false` e `status: "PENDENTE"`, então a resposta
    // não os distingue. Quem distingue é o backend, que sabe se enviou lista de regras vazia.
    expect(queimaTentativa(veredito(false))).toBe(true);
    expect(queimaTentativa(FALHA)).toBe(false);
  });
});
