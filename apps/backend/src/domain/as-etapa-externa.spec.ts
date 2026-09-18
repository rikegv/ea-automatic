import { describe, expect, it } from "vitest";
import {
  ehFonteExterna,
  lerLinhaDePara,
  normalizarChaveExterna,
} from "./as-etapa-externa";

/**
 * ─ A NORMALIZAÇÃO E A LEITURA DO DE/PARA, medidas sobre os nomes REAIS do Pandapé ──────────────
 *
 * OS NOMES NÃO SÃO INVENTADOS: são os dez que a API devolveu numa vaga da conta
 * (`docs/MAPA-COMPLETO-API-PANDAPE.md`, seção 3.3), com a caixa e a pontuação que vieram. Testar
 * com nomes bonitos deixaria passar exatamente o que quebra na vida real, que é a pasta escrita à
 * mão por quem abriu a vaga.
 *
 * §A.6: nenhum dado pessoal aqui. Nome de pasta de vaga e código de etapa.
 */

describe("a chave de busca é o nome normalizado, e não o nome cru", () => {
  it("a caixa irregular no meio da palavra não cria duas chaves", () => {
    expect(normalizarChaveExterna("Pré-selecionadoS")).toBe(
      normalizarChaveExterna("PRE-SELECIONADOS"),
    );
  });

  /**
   * O CASO QUE PROVA QUE O PARÊNTESE PRECISA SAIR: o conteúdo entre parênteses é INSTRUÇÃO para
   * quem opera a vaga, não o nome da etapa. Mantido, a mesma etapa em duas vagas (uma com a
   * instrução, outra sem) viraria duas chaves, e o diretor teria de mapear a mesma coisa duas vezes.
   */
  it("a instrução entre parênteses não faz parte da chave", () => {
    expect(normalizarChaveExterna("Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)")).toBe(
      "pre selecionados",
    );
  });

  it("a vírgula vira espaço, e os espaços não se acumulam", () => {
    expect(normalizarChaveExterna("SHORT LIST, ENCAMINHADOS CLIENTE")).toBe(
      "short list encaminhados cliente",
    );
  });

  it("os quatro casamentos semeados casam com o nome como a API o escreve", () => {
    expect(normalizarChaveExterna("Lead")).toBe("lead");
    expect(normalizarChaveExterna("Inscritos")).toBe("inscritos");
    expect(normalizarChaveExterna("triados")).toBe("triados");
    expect(normalizarChaveExterna("ENTREVISTA SOULAN")).toBe("entrevista soulan");
  });

  it("espaço sobrando nas pontas não muda a chave", () => {
    expect(normalizarChaveExterna("  Contratados  ")).toBe("contratados");
  });
});

describe("a fonte é lista fechada, e o que não está nela não é fonte", () => {
  it("reconhece as duas de hoje e recusa o resto", () => {
    expect(ehFonteExterna("PANDAPE")).toBe(true);
    expect(ehFonteExterna("DIGAI")).toBe(true);
    expect(ehFonteExterna("pandape")).toBe(false);
    expect(ehFonteExterna("GUPY")).toBe(false);
  });
});

describe("a leitura do de/para é fail-closed: na dúvida, NÃO MAPEADA", () => {
  it("sem linha, não mapeada", () => {
    expect(lerLinhaDePara(null)).toEqual({ mapeada: false });
    expect(lerLinhaDePara(undefined)).toEqual({ mapeada: false });
  });

  /**
   * DESLIGAR UM DE/PARA É O GESTO do diretor para dizer "pare de confiar nesta tradução". Uma
   * leitura que ignorasse o flag transformaria esse gesto em nada, e a etapa voltaria a andar
   * sozinha no dia seguinte.
   */
  it("linha inativa é o mesmo que linha ausente", () => {
    expect(
      lerLinhaDePara({ etapaCodigo: "CAPTACAO", situacao: null, ativo: false }),
    ).toEqual({ mapeada: false });
  });

  it("a etapa mapeada volta como etapa, sem desfecho e sem motivo", () => {
    expect(lerLinhaDePara({ etapaCodigo: "TRIAGEM", situacao: null })).toEqual({
      mapeada: true,
      etapaCodigo: "TRIAGEM",
      situacao: null,
      motivoPadrao: null,
    });
  });

  /**
   * NEM TODA ETAPA EXTERNA É UM CANECO DO FUNIL. `Descartados` muda o DESFECHO, não a etapa, e
   * forçar uma etapa ali escreveria no histórico um movimento que não aconteceu.
   */
  it("o desfecho sozinho é mapeamento válido", () => {
    expect(lerLinhaDePara({ etapaCodigo: null, situacao: "DESCARTADO" })).toEqual({
      mapeada: true,
      etapaCodigo: null,
      situacao: "DESCARTADO",
      motivoPadrao: null,
    });
  });

  /**
   * ─ OS DOIS DESCARTES NÃO PODEM CAIR NO MESMO LUGAR (decisão do diretor, 17/09/2026) ──────────
   *
   * `RETORNO NEGATIVO` e `Descartados` compartilham o desfecho e SÃO COISAS DIFERENTES: uma é o
   * cliente recusando, a outra é a seleção descartando. O que os separa é o MOTIVO, e é por isso
   * que ele viaja junto da resolução: sem ele, a ingestão gravaria os dois como o mesmo descarte e
   * ninguém conseguiria mais distinguir depois, olhando a candidatura.
   */
  it("os dois descartes se separam pelo motivo, com o mesmo desfecho", () => {
    const cliente = lerLinhaDePara({
      etapaCodigo: null,
      situacao: "DESCARTADO",
      motivoPadrao: "Retorno negativo do cliente",
    });
    const selecao = lerLinhaDePara({
      etapaCodigo: null,
      situacao: "DESCARTADO",
      motivoPadrao: "Descartado na seleção",
    });
    expect(cliente).toEqual({
      mapeada: true,
      etapaCodigo: null,
      situacao: "DESCARTADO",
      motivoPadrao: "Retorno negativo do cliente",
    });
    expect(selecao).toEqual({
      mapeada: true,
      etapaCodigo: null,
      situacao: "DESCARTADO",
      motivoPadrao: "Descartado na seleção",
    });
  });

  /**
   * MOTIVO EM BRANCO É MOTIVO AUSENTE. Espaços salvos por engano na configuração virariam um
   * `motivo_descarte` visualmente vazio na candidatura de uma pessoa: igual a "ninguém preencheu"
   * para quem lê, e diferente dele para quem filtra.
   */
  it("motivo só com espaços é tratado como ausente", () => {
    expect(
      lerLinhaDePara({ etapaCodigo: null, situacao: "DESCARTADO", motivoPadrao: "   " }),
    ).toEqual({ mapeada: true, etapaCodigo: null, situacao: "DESCARTADO", motivoPadrao: null });
  });

  /**
   * MOTIVO SOZINHO NÃO É MAPEAMENTO, e a guarda é a mesma da linha muda: motivo não diz o que
   * fazer com a pessoa, e aceitá-lo como destino entregaria ao chamador uma ordem que não existe.
   */
  it("motivo sem etapa e sem desfecho continua sendo não mapeada", () => {
    expect(
      lerLinhaDePara({ etapaCodigo: null, situacao: null, motivoPadrao: "Qualquer coisa" }),
    ).toEqual({ mapeada: false });
  });

  /**
   * A SITUAÇÃO FORA DO VOCABULÁRIO É DESCARTADA, e como ela era a única informação da linha, o
   * resultado é NÃO MAPEADA. Devolver "mapeada" com os dois campos nulos entregaria ao chamador um
   * destino que não diz o que fazer, e ele acreditaria.
   */
  it("situação desconhecida não vira mapeamento", () => {
    expect(
      lerLinhaDePara({ etapaCodigo: null, situacao: "CONTRATADO" as never }),
    ).toEqual({ mapeada: false });
  });

  it("linha sem nenhum destino é tratada como ausente", () => {
    expect(lerLinhaDePara({ etapaCodigo: null, situacao: null })).toEqual({ mapeada: false });
  });
});
