import { describe, expect, it } from "vitest";
import { FAROIS_VIVOS, admissaoOperavel, ehFarolVivo, ehPausada } from "./admissao";

/**
 * A RÉGUA ÚNICA DA PAUSA (OST admissão pausada, Bloco 2).
 *
 * Estes testes existem porque a pausa só é real se os automáticos a respeitarem, e o jeito de
 * garantir isso a longo prazo não é lembrar de somar `pausada_em IS NULL` em cada query nova: é ter
 * UM predicado, testado, que todo processo automático usa.
 *
 * O que fica travado aqui:
 *  - `admissaoOperavel` é a conjunção real (viva E não pausada), não um alias de `ehFarolVivo`;
 *  - pausada não vira operável só porque o farol é vivo (o erro que a duplicação de FAROIS_VIVOS
 *    convidava a cometer);
 *  - `FAROIS_VIVOS` continua sendo exatamente os dois faróis vivos (era copiado em 3 arquivos).
 */

describe("FAROIS_VIVOS: uma constante só para o repositório", () => {
  it("são exatamente EM_ADMISSAO e BANCO_AGUARDAR", () => {
    expect([...FAROIS_VIVOS]).toEqual(["EM_ADMISSAO", "BANCO_AGUARDAR"]);
  });

  it("concorda com ehFarolVivo (a constante e o predicado não podem divergir)", () => {
    for (const f of FAROIS_VIVOS) expect(ehFarolVivo(f)).toBe(true);
    for (const f of ["ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO", "AGUARDANDO_LIBERACAO"]) {
      expect(ehFarolVivo(f), f).toBe(false);
    }
  });
});

describe("ehPausada: null é o único 'não pausada'", () => {
  it("null e undefined são não pausada", () => {
    expect(ehPausada(null)).toBe(false);
    expect(ehPausada(undefined)).toBe(false);
  });

  it("qualquer instante é pausada (Date ou string do banco)", () => {
    expect(ehPausada(new Date("2026-07-27T12:00:00Z"))).toBe(true);
    expect(ehPausada("2026-07-27T12:00:00Z")).toBe(true);
  });
});

describe("admissaoOperavel: a régua dos processos automáticos", () => {
  it("viva e NÃO pausada é operável", () => {
    expect(admissaoOperavel("EM_ADMISSAO", null)).toBe(true);
    expect(admissaoOperavel("BANCO_AGUARDAR", null)).toBe(true);
  });

  it("VIVA mas PAUSADA não é operável (o ponto todo da OST)", () => {
    const agora = new Date();
    expect(admissaoOperavel("EM_ADMISSAO", agora)).toBe(false);
    expect(admissaoOperavel("BANCO_AGUARDAR", agora)).toBe(false);
  });

  it("não-viva segue fora, pausada ou não (a pausa não ressuscita nada)", () => {
    for (const f of ["ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO", "LIBERACAO_RECUSADA"]) {
      expect(admissaoOperavel(f, null), f).toBe(false);
      expect(admissaoOperavel(f, new Date()), f).toBe(false);
    }
  });

  it("NÃO é um alias de ehFarolVivo: existe pelo menos um caso onde os dois discordam", () => {
    const pausada = new Date();
    expect(ehFarolVivo("EM_ADMISSAO")).toBe(true);
    expect(admissaoOperavel("EM_ADMISSAO", pausada)).toBe(false);
  });
});
