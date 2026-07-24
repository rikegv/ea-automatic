import { describe, expect, it } from "vitest";
import { motivosDeSuspeita } from "./nome-suspeito";

/**
 * OST A / Bloco 6 — levantamento de cadastro com nome suspeito. Os nomes aqui são FICTÍCIOS.
 * O caso que originou a frente é o token repetido, que derrubou seis documentos bons por
 * "nome não confere com o cadastro".
 */
describe("motivosDeSuspeita (OST A / Bloco 6)", () => {
  it("pega o caso real: palavra repetida em sequência", () => {
    expect(motivosDeSuspeita("Maria Joana Joana Pereira")).toContain("TOKEN_REPETIDO");
  });

  it("NÃO acusa partícula repetida, que é legítima em nome brasileiro", () => {
    expect(motivosDeSuspeita("Ana de Souza de Oliveira")).not.toContain("TOKEN_REPETIDO");
  });

  it("NÃO acusa nome igual em posições separadas (não é duplicação em sequência)", () => {
    expect(motivosDeSuspeita("Silva Pereira Silva")).not.toContain("TOKEN_REPETIDO");
  });

  it("pega nome de uma palavra só", () => {
    expect(motivosDeSuspeita("Fulano")).toContain("UMA_PALAVRA");
  });

  it("pega caractere estranho (número, símbolo, pontuação)", () => {
    expect(motivosDeSuspeita("Joao 2 Silva")).toContain("CARACTERE_ESTRANHO");
    expect(motivosDeSuspeita("Joao Silva (temp)")).toContain("CARACTERE_ESTRANHO");
  });

  it("aceita hífen, apóstrofo e acento como parte legítima do nome", () => {
    expect(motivosDeSuspeita("Ana Clara Vieira-Lopes")).not.toContain("CARACTERE_ESTRANHO");
    expect(motivosDeSuspeita("Maria D’Ávila Conceição")).not.toContain("CARACTERE_ESTRANHO");
  });

  it("pega espaço duplicado e sobra nas pontas", () => {
    expect(motivosDeSuspeita("Ana  Clara Souza")).toContain("ESPACOS_MULTIPLOS");
    expect(motivosDeSuspeita(" Ana Clara Souza")).toContain("ESPACOS_MULTIPLOS");
  });

  it("pega caixa inconsistente: tudo maiúsculo, tudo minúsculo e mistura", () => {
    expect(motivosDeSuspeita("ANA CLARA SOUZA")).toContain("CAIXA_INCONSISTENTE");
    expect(motivosDeSuspeita("ana clara souza")).toContain("CAIXA_INCONSISTENTE");
    expect(motivosDeSuspeita("Ana CLARA Souza")).toContain("CAIXA_INCONSISTENTE");
  });

  it("nome bem formado não gera suspeita nenhuma", () => {
    for (const nome of ["Ana Clara Souza", "João de Souza Neto", "Maria da Silva Ramos"]) {
      expect(motivosDeSuspeita(nome)).toHaveLength(0);
    }
  });

  it("nome vazio não vira ruído no relatório", () => {
    expect(motivosDeSuspeita("")).toHaveLength(0);
    expect(motivosDeSuspeita("   ")).toHaveLength(0);
  });
});
