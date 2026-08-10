import { describe, expect, it } from "vitest";
import {
  projetosDoCliente,
  sugerirProjetoPorPeriodo,
  type ProjetoDoSeletor,
} from "./alto-volume";

const proj = (over: Partial<ProjetoDoSeletor> & { id: string }): ProjetoDoSeletor => ({
  codCliente: "51947",
  nome: "Temporada De Setembro 2026",
  dataInicio: "2026-09-01",
  dataFim: "2026-09-30",
  ativo: true,
  ...over,
});

describe("projetosDoCliente", () => {
  it("fica com os ativos daquele cliente", () => {
    const lista = [
      proj({ id: "a" }),
      proj({ id: "b", codCliente: "99999" }),
      proj({ id: "c", ativo: false }),
    ];
    expect(projetosDoCliente(lista, "51947").map((p) => p.id)).toEqual(["a"]);
  });

  it("cliente sem projeto devolve vazio, que é o que some com o bloco na tela", () => {
    expect(projetosDoCliente([proj({ id: "a" })], "00000")).toEqual([]);
  });

  it("sem cliente escolhido não oferece nada", () => {
    expect(projetosDoCliente([proj({ id: "a" })], "")).toEqual([]);
  });
});

describe("sugerirProjetoPorPeriodo", () => {
  const lista = [
    proj({ id: "set", dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
    proj({ id: "out", dataInicio: "2026-10-01", dataFim: "2026-10-31" }),
  ];

  it("sugere o projeto cujo período cobre a data", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-15")).toBe("set");
    expect(sugerirProjetoPorPeriodo(lista, "2026-10-02")).toBe("out");
  });

  it("as bordas do período contam (início e fim inclusivos)", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-01")).toBe("set");
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-30")).toBe("set");
  });

  it("data fora de qualquer período não sugere nada", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-08-31")).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, "2026-12-25")).toBe("");
  });

  it("sem data não sugere nada, que é o estado normal do modal recém-aberto", () => {
    expect(sugerirProjetoPorPeriodo(lista, "")).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, null)).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, undefined)).toBe("");
  });

  it("dois projetos cobrindo a mesma data: vence o de início mais antigo", () => {
    const sobrepostos = [
      proj({ id: "novo", dataInicio: "2026-09-10", dataFim: "2026-09-20" }),
      proj({ id: "antigo", dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
    ];
    expect(sugerirProjetoPorPeriodo(sobrepostos, "2026-09-15")).toBe("antigo");
  });

  it("lista vazia não quebra", () => {
    expect(sugerirProjetoPorPeriodo([], "2026-09-15")).toBe("");
  });
});
