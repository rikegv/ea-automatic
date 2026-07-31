import { describe, expect, it } from "vitest";
import { pendenciasObrigatorias } from "./admissao";
import {
  CHAVES_PENDENCIA,
  exigido,
  itensDoCliente,
  ROTULO_PENDENCIA,
  TUDO_OBRIGATORIO,
  type ChavePendencia,
} from "./pendencia-config";

/**
 * OBRIGATORIEDADE POR CLIENTE (OST da tela de obrigatoriedade).
 *
 * A garantia que estes testes travam, e que é a mais importante da entrega: **cliente sem
 * configuração se comporta EXATAMENTE como antes**. A tela existe para o diretor desligar item que o
 * cliente dele não usa, nunca para mudar sozinha o que já estava valendo.
 */

/** Admissão com TUDO vazio: gera a lista completa de pendências. */
const VAZIA = {
  codCliente: "",
  cargoId: "",
  dataAdmissao: "",
  tipoContrato: "",
  vagaFolha: { salario: "", beneficios: "", escala: "", centroCusto: "", setor: "", gestorBp: "" },
};

const desligar = (...chaves: ChavePendencia[]) => new Set<ChavePendencia>(chaves);

describe("comportamento de quem NÃO foi configurado (intocado)", () => {
  it("sem config, a régua devolve exatamente a lista de sempre", () => {
    const semArg = pendenciasObrigatorias(VAZIA);
    expect(semArg).toEqual([
      "Cliente",
      "Cargo",
      "Salário",
      "Tipo de contrato",
      "Data de admissão",
      "Pacote de benefícios",
      "Escala",
      "Centro de custo",
      "Setor",
      "Gestor / BP",
      // Uniforme (OST Onda 3, item 1): item novo da régua, configurável como todos os outros.
      "Uniforme",
    ]);
    // Config vazia, config nula e ausência de argumento são o MESMO comportamento.
    expect(pendenciasObrigatorias(VAZIA, TUDO_OBRIGATORIO)).toEqual(semArg);
    expect(pendenciasObrigatorias(VAZIA, null)).toEqual(semArg);
  });
});

describe("item desligado deixa de ser cobrado", () => {
  it("desligar Centro de custo tira SÓ ele da lista", () => {
    const pend = pendenciasObrigatorias(VAZIA, desligar("CENTRO_CUSTO"));
    expect(pend).not.toContain("Centro de custo");
    expect(pend).toContain("Setor");
    expect(pend).toContain("Gestor / BP");
  });

  it("o caso da prova: Centro de custo E Setor desligados juntos", () => {
    const pend = pendenciasObrigatorias(VAZIA, desligar("CENTRO_CUSTO", "SETOR"));
    expect(pend).not.toContain("Centro de custo");
    expect(pend).not.toContain("Setor");
  });

  it("desligar TODOS zera a lista (o diretor pode desligar qualquer um)", () => {
    expect(pendenciasObrigatorias(VAZIA, desligar(...CHAVES_PENDENCIA))).toEqual([]);
  });
});

describe("Data de admissão e Termo de Banco são interruptores SEPARADOS", () => {
  const BANCO = { ...VAZIA, isBanco: true, termoBancoEntregue: false };

  it("admissão de banco cobra o Termo, não a Data", () => {
    const pend = pendenciasObrigatorias(BANCO);
    expect(pend).toContain("Termo de Banco");
    expect(pend).not.toContain("Data de admissão");
  });

  it("desligar a DATA não desliga o TERMO", () => {
    const pend = pendenciasObrigatorias(BANCO, desligar("DATA_ADMISSAO"));
    expect(pend).toContain("Termo de Banco");
  });

  it("desligar o TERMO não desliga a DATA da admissão comum", () => {
    expect(pendenciasObrigatorias(BANCO, desligar("TERMO_BANCO"))).not.toContain("Termo de Banco");
    expect(pendenciasObrigatorias(VAZIA, desligar("TERMO_BANCO"))).toContain("Data de admissão");
  });
});

describe("chaves e rótulos", () => {
  it("toda chave tem rótulo, e o rótulo é o texto que a régua devolve", () => {
    for (const chave of CHAVES_PENDENCIA) {
      expect(ROTULO_PENDENCIA[chave]).toBeTruthy();
      expect(ROTULO_PENDENCIA[chave]).not.toContain("—"); // §A.11
    }
  });

  it("itensDoCliente devolve os 11 itens, marcando o que está desligado", () => {
    const itens = itensDoCliente(desligar("SETOR"));
    expect(itens).toHaveLength(CHAVES_PENDENCIA.length);
    expect(itens.find((i) => i.chave === "SETOR")?.obrigatorio).toBe(false);
    expect(itens.find((i) => i.chave === "SALARIO")?.obrigatorio).toBe(true);
  });

  it("exigido: sem config tudo é exigido; com a chave desligada, não", () => {
    expect(exigido("CENTRO_CUSTO")).toBe(true);
    expect(exigido("CENTRO_CUSTO", TUDO_OBRIGATORIO)).toBe(true);
    expect(exigido("CENTRO_CUSTO", desligar("CENTRO_CUSTO"))).toBe(false);
  });
});
