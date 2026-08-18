import { describe, expect, it } from "vitest";
import {
  avisoDivergenciaBancaria,
  cadastroBancarioParaAuditoria,
  divergenciasReconhecidas,
} from "./cadastro-bancario";

/**
 * Melhorias EAC, item 8. O que estes testes protegem, em ordem de importância:
 *
 *  1. dado bancário NÃO vaza para auditoria de outro tipo de documento (§A.6, minimização);
 *  2. campo em branco é caso NORMAL, nunca divergência (os três são opcionais no Pandapé);
 *  3. o que a IA devolve é filtrado antes de virar aviso na tela.
 */
describe("cadastroBancarioParaAuditoria", () => {
  const digitado = { banco: "NUBANK", agencia: "0001", conta: "12345-6" };

  it("só acompanha a auditoria do COMPROVANTE BANCÁRIO", () => {
    expect(cadastroBancarioParaAuditoria("DADOS_BANCARIOS", digitado)).toEqual(digitado);
  });

  it("NÃO vai junto de nenhum outro tipo de documento", () => {
    for (const tipo of ["RG", "CPF", "COMPROVANTE_RESIDENCIA", "ASO", "CTPS"]) {
      expect(cadastroBancarioParaAuditoria(tipo, digitado)).toBeUndefined();
    }
  });

  it("tolera caixa e espaço no código do tipo", () => {
    expect(cadastroBancarioParaAuditoria(" dados_bancarios ", digitado)).toEqual(digitado);
  });

  it("manda só os campos preenchidos, e nunca rótulo com valor vazio", () => {
    expect(
      cadastroBancarioParaAuditoria("DADOS_BANCARIOS", { banco: "ITAU", agencia: "", conta: "   " }),
    ).toEqual({ banco: "ITAU" });
  });

  it("candidato sem nenhum dado bancário não gera cadastro para comparar", () => {
    expect(cadastroBancarioParaAuditoria("DADOS_BANCARIOS", {})).toBeUndefined();
    expect(
      cadastroBancarioParaAuditoria("DADOS_BANCARIOS", { banco: "", agencia: "", conta: "" }),
    ).toBeUndefined();
  });

  it("NÃO normaliza o valor: o erro de digitação tem de chegar inteiro à comparação", () => {
    const cru = { agencia: " 0001-2 ", conta: "00012345-6" };
    // O trim das pontas é do armazenamento; o miolo (traço, zero à esquerda) fica exatamente como veio.
    expect(cadastroBancarioParaAuditoria("DADOS_BANCARIOS", cru)).toEqual({
      agencia: "0001-2",
      conta: "00012345-6",
    });
  });
});

describe("divergenciasReconhecidas", () => {
  it("aceita os três rótulos conhecidos, em ordem estável", () => {
    expect(divergenciasReconhecidas(["conta", "banco"])).toEqual(["banco", "conta"]);
  });

  it("descarta rótulo inventado pelo modelo, sem quebrar", () => {
    expect(divergenciasReconhecidas(["agencia", "titular_2", "", "  "])).toEqual(["agencia"]);
  });

  it("não repete rótulo duplicado", () => {
    expect(divergenciasReconhecidas(["conta", "conta", "CONTA"])).toEqual(["conta"]);
  });

  it("ausência de divergência é lista vazia, não erro", () => {
    expect(divergenciasReconhecidas(undefined)).toEqual([]);
    expect(divergenciasReconhecidas([])).toEqual([]);
  });
});

describe("avisoDivergenciaBancaria", () => {
  it("sem divergência não há aviso", () => {
    expect(avisoDivergenciaBancaria([])).toBeNull();
  });

  it("um campo", () => {
    expect(avisoDivergenciaBancaria(["agencia"])).toContain("agência do comprovante");
  });

  it("dois campos ligados por 'e'", () => {
    expect(avisoDivergenciaBancaria(["agencia", "conta"])).toContain("agência e conta");
  });

  it("três campos com vírgula e 'e' no último", () => {
    expect(avisoDivergenciaBancaria(["banco", "agencia", "conta"])).toContain(
      "banco, agência e conta",
    );
  });

  it("o aviso diz explicitamente que NÃO bloqueia (§A.3 regra 5)", () => {
    const texto = avisoDivergenciaBancaria(["conta"])!;
    expect(texto).toContain("continua válido");
    expect(texto).toContain("nada foi bloqueado");
  });

  it("§A.11: nenhum travessão no texto que chega ao usuário", () => {
    for (const campos of [["banco"], ["agencia", "conta"], ["banco", "agencia", "conta"]] as const) {
      expect(avisoDivergenciaBancaria([...campos])).not.toContain("—");
    }
  });
});
