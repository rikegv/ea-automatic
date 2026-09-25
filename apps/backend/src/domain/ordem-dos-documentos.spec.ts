import { describe, expect, it } from "vitest";
import type { ExigenciaDocumento } from "@ea/shared-types";
import {
  DOCUMENTOS_EM_ORDEM_FIXA,
  compararDocumentosDaTrilha,
  posicaoNaOrdemFixa,
} from "./ordem-dos-documentos";

/**
 * A ORDEM DOS 7 (decisão do diretor, 21/09/2026), medida na função PURA.
 *
 * As duas coisas que este arquivo trava, e são as duas que o coordenador pediu:
 *  1. os 7 saem na ordem pedida quando todos são obrigatórios;
 *  2. o que a régua do cargo NÃO inclui não vira posição vazia: ele simplesmente não está na lista,
 *     e quem vem depois sobe.
 *
 * Mais a que sustenta a leitura escolhida: a EXIGÊNCIA continua mandando sobre a lista fixa.
 */

const doc = (
  codigoTipoDocumento: string,
  nome: string,
  exigencia: ExigenciaDocumento = "OBRIGATORIO",
) => ({ codigoTipoDocumento, nome, exigencia });

describe("a lista fixa dos 7", () => {
  it("é exatamente a que o diretor pediu, na ordem que ele pediu", () => {
    expect([...DOCUMENTOS_EM_ORDEM_FIXA]).toEqual([
      "RG",
      "CPF",
      "COMPROVANTE_RESIDENCIA",
      "DADOS_BANCARIOS",
      "COMPROVANTE_ESCOLARIDADE",
      "CTPS",
      "CERTIDAO_NASC_CASAMENTO",
    ]);
  });

  /**
   * A ARMADILHA DO CATÁLOGO, e ela custou uma correção no meio da frente: existem DOIS documentos
   * de certidão (`CERTIDAO_CASAMENTO`, "Certidão de Casamento", e `CERTIDAO_NASC_CASAMENTO`, a
   * combinada). O que entra na sequência é o COMBINADO, esclarecido pelo diretor. Este teste é o
   * que impede a troca silenciosa de um pelo outro numa edição futura.
   */
  it("NÃO inclui `CERTIDAO_CASAMENTO`, que é o outro documento", () => {
    expect(DOCUMENTOS_EM_ORDEM_FIXA).not.toContain("CERTIDAO_CASAMENTO");
    expect(posicaoNaOrdemFixa("CERTIDAO_CASAMENTO")).toBe(DOCUMENTOS_EM_ORDEM_FIXA.length);
  });

  it("quem não está na lista vai para o fim, empatado entre si", () => {
    expect(posicaoNaOrdemFixa("ASO")).toBe(posicaoNaOrdemFixa("TERMO_BANCO"));
    expect(posicaoNaOrdemFixa("RG")).toBeLessThan(posicaoNaOrdemFixa("ASO"));
  });
});

describe("a ordem da trilha", () => {
  it("os 7 saem na ordem pedida quando TODOS são obrigatórios", () => {
    const embaralhados = [
      doc("CERTIDAO_NASC_CASAMENTO", "Certidão De Nascimento Ou Casamento"),
      doc("CTPS", "Carteira De Trabalho"),
      doc("COMPROVANTE_ESCOLARIDADE", "Comprovante De Escolaridade"),
      doc("DADOS_BANCARIOS", "Comprovante De Conta Bancária"),
      doc("COMPROVANTE_RESIDENCIA", "Comprovante De Residência"),
      doc("CPF", "CPF"),
      doc("RG", "RG"),
    ];
    expect(
      [...embaralhados].sort(compararDocumentosDaTrilha).map((d) => d.codigoTipoDocumento),
    ).toEqual([...DOCUMENTOS_EM_ORDEM_FIXA]);
  });

  /**
   * "SE O CARGO NÃO PEDE, PULA" (exemplo do próprio diretor). A função ORDENA o que existe, e não
   * cria casa nenhuma: tirando CPF e Comprovante De Residência da admissão, quem vem depois sobe,
   * sem buraco e sem posição reservada.
   */
  it("o que a régua não inclui não vira posição vazia: os de trás sobem", () => {
    const parcial = [doc("CTPS", "Carteira De Trabalho"), doc("RG", "RG")];
    expect([...parcial].sort(compararDocumentosDaTrilha).map((d) => d.codigoTipoDocumento)).toEqual([
      "RG",
      "CTPS",
    ]);
  });

  /**
   * A LEITURA ATIVA É A (A), a que o diretor escolheu: os 7 valem DENTRO da faixa de exigência.
   * MEDIDO: `CERTIDAO_NASC_CASAMENTO` é NÃO OBRIGATÓRIA em 133 das 135 réguas de produção, então
   * na leitura oposta ela apareceria antes dos obrigatórios em quase todo cargo, que é exatamente
   * o que a régua da exigência foi escrita para evitar.
   */
  it("a EXIGÊNCIA manda sobre a lista fixa: o obrigatório de fora dos 7 vem antes do não obrigatório de dentro", () => {
    const linhas = [
      doc("CERTIDAO_NASC_CASAMENTO", "Certidão De Nascimento Ou Casamento", "NAO_OBRIGATORIO"),
      doc("ASO", "Atestado De Saúde Ocupacional", "OBRIGATORIO"),
    ];
    expect([...linhas].sort(compararDocumentosDaTrilha).map((d) => d.codigoTipoDocumento)).toEqual([
      "ASO",
      "CERTIDAO_NASC_CASAMENTO",
    ]);
  });

  it("dentro da mesma faixa, quem não está na lista desempata pelo nome em pt-BR", () => {
    const linhas = [
      doc("ZZZ", "Último Documento"),
      doc("AAA", "Ácido Teste"),
      doc("RG", "RG"),
    ];
    expect([...linhas].sort(compararDocumentosDaTrilha).map((d) => d.nome)).toEqual([
      "RG",
      "Ácido Teste",
      "Último Documento",
    ]);
  });

  it("as três faixas de exigência continuam na ordem de sempre", () => {
    const linhas = [
      doc("X", "X", "NAO_OBRIGATORIO"),
      doc("Y", "Y", "FACULTATIVO"),
      doc("Z", "Z", "OBRIGATORIO"),
    ];
    expect([...linhas].sort(compararDocumentosDaTrilha).map((d) => d.nome)).toEqual(["Z", "Y", "X"]);
  });
});
