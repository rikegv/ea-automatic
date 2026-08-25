import { describe, expect, it } from "vitest";
import {
  VAGA_OBRIGATORIOS,
  textoPendencia,
  vagaPendencias,
  type VagaCamposObrigatorios,
} from "@ea/shared-types";

/**
 * A RÉGUA DOS OBRIGATÓRIOS DA VAGA (OST de 25/08, itens 1 a 4).
 *
 * O QUE ESTES TESTES PROTEGEM, e é o ponto todo da frente: a régua é UMA SÓ, lida pela tela (para o
 * asterisco vermelho e para a lista de pendências do publicar) e pelo backend (para recusar corpo
 * montado fora da tela). Se alguém acrescentar um campo obrigatório em um dos lados e não no outro,
 * volta o pior dos dois mundos, a tela deixa publicar e o servidor recusa.
 */

/** Uma vaga com TODOS os obrigatórios preenchidos, para cada teste apagar só o que quer provar. */
const COMPLETA: VagaCamposObrigatorios = {
  codigo: "PV163983",
  nomeDivulgacao: "Analista Fiscal",
  cargoId: "8f2f1b3e-0d51-4a0e-9c7c-1f2a3b4c5d6e",
  posicoesOficiais: 2,
  natureza: "EFETIVA",
  sazonalidade: "OPERACAO_PADRAO",
  status: "ABERTA",
  dataAbertura: "2026-08-25",
};

describe("vagaPendencias", () => {
  it("não acusa nada quando a vaga está completa", () => {
    expect(vagaPendencias(COMPLETA)).toEqual([]);
  });

  it("LISTA TODOS os campos que faltam de uma vez, nunca só o primeiro", () => {
    // É a exigência literal do diretor: quem preenche 38 campos não pode descobrir as pendências
    // uma por uma, com uma volta ao servidor entre cada duas.
    const pendencias = vagaPendencias({
      ...COMPLETA,
      codigo: "",
      nomeDivulgacao: "",
      cargoId: "",
    });
    expect(pendencias.map((p) => p.campo)).toEqual(["codigo", "nomeDivulgacao", "cargoId"]);
  });

  it("devolve as pendências na ORDEM DA TRILHA, não na ordem em que faltaram", () => {
    const passos = vagaPendencias({ codigo: "", dataAbertura: "" }).map((p) => p.passo);
    expect(passos).toEqual([...passos].sort((a, b) => a - b));
  });

  it("trata espaço em branco como ausência, e não como preenchido", () => {
    expect(vagaPendencias({ ...COMPLETA, codigo: "   " }).map((p) => p.campo)).toEqual(["codigo"]);
  });

  it("trata nulo e ausente como ausência", () => {
    expect(vagaPendencias({ ...COMPLETA, nomeDivulgacao: null }).map((p) => p.campo)).toEqual([
      "nomeDivulgacao",
    ]);
    expect(vagaPendencias({ ...COMPLETA, cargoId: undefined }).map((p) => p.campo)).toEqual([
      "cargoId",
    ]);
  });

  it("ZERO POSIÇÃO OFICIAL NÃO É PREENCHIDO: vaga com zero posição não é vaga", () => {
    expect(vagaPendencias({ ...COMPLETA, posicoesOficiais: 0 }).map((p) => p.campo)).toEqual([
      "posicoesOficiais",
    ]);
    expect(vagaPendencias({ ...COMPLETA, posicoesOficiais: "0" }).map((p) => p.campo)).toEqual([
      "posicoesOficiais",
    ]);
  });

  it("aceita o nº de posições oficiais como TEXTO, que é como o campo da tela o entrega", () => {
    expect(vagaPendencias({ ...COMPLETA, posicoesOficiais: "3" })).toEqual([]);
  });

  // O CONTADOR DE BANCO NÃO É OBRIGATÓRIO (os dois contadores, 25/08): zero é o estado normal da
  // maioria das vagas, e cobrá-lo faria a régua acusar pendência em vaga completa.
  it("NÃO cobra o contador de banco: zero banco é resposta, não lacuna", () => {
    expect(VAGA_OBRIGATORIOS.map((p) => p.campo)).not.toContain("posicoesBanco");
  });

  it("acusa a lista inteira quando a vaga está vazia", () => {
    expect(vagaPendencias({}).map((p) => p.campo)).toEqual(VAGA_OBRIGATORIOS.map((p) => p.campo));
  });
});

describe("textoPendencia", () => {
  it("escreve a pendência com o PASSO e o NOME do campo, como o diretor pediu", () => {
    const codigo = VAGA_OBRIGATORIOS.find((p) => p.campo === "codigo")!;
    expect(textoPendencia(codigo)).toBe("Passo 1 · A Vaga: falta o Código da vaga");
  });

  it("concorda o artigo com o rótulo, para a frase sair em português", () => {
    const data = VAGA_OBRIGATORIOS.find((p) => p.campo === "dataAbertura")!;
    expect(textoPendencia(data)).toBe("Passo 2 · Quem Pediu: falta a Data de abertura");
  });

  it("NUNCA usa travessão (§A.11)", () => {
    for (const p of VAGA_OBRIGATORIOS) expect(textoPendencia(p)).not.toContain("—");
  });
});

describe("VAGA_OBRIGATORIOS", () => {
  it("dá a cada campo uma ÂNCORA PRÓPRIA, senão o salto do item 4 cai no campo errado", () => {
    const ancoras = VAGA_OBRIGATORIOS.map((p) => p.ancora);
    expect(new Set(ancoras).size).toBe(ancoras.length);
  });

  it("não deixa campo sem passo nem sem rótulo", () => {
    for (const p of VAGA_OBRIGATORIOS) {
      expect(p.rotulo.trim()).not.toBe("");
      expect(p.passo).toBeGreaterThanOrEqual(0);
    }
  });
});
