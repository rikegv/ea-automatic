import { describe, expect, it } from "vitest";
import { autoMatch, normalizeNome, podeGerar, type AdmissaoSelecionavel } from "./kit";

const adm: AdmissaoSelecionavel = { admissaoId: "a1", candidatoNome: "Maria Souza" };
// O tipo File não existe no runtime node; o conteúdo é irrelevante para a função pura.
const arquivo = {} as File;

describe("podeGerar", () => {
  it("desabilita sem arquivo (mesmo com admissão)", () => {
    expect(podeGerar(adm, null, false)).toBe(false);
  });

  it("desabilita sem admissão (mesmo com arquivo)", () => {
    expect(podeGerar(null, arquivo, false)).toBe(false);
  });

  it("desabilita se a admissão não tem id", () => {
    expect(podeGerar({ admissaoId: "", candidatoNome: "X" }, arquivo, false)).toBe(false);
  });

  it("habilita com admissão + arquivo (ordem não importa)", () => {
    expect(podeGerar(adm, arquivo, false)).toBe(true);
  });

  it("desabilita enquanto gera, mesmo com tudo preenchido", () => {
    expect(podeGerar(adm, arquivo, true)).toBe(false);
  });
});

describe("autoMatch", () => {
  const lista: AdmissaoSelecionavel[] = [
    { admissaoId: "1", candidatoNome: "Maria Souza" },
    { admissaoId: "2", candidatoNome: "João Maria" },
  ];

  it("fixa o item quando o texto bate exatamente (sem acento/caixa)", () => {
    expect(autoMatch(lista, "maria souza")?.admissaoId).toBe("1");
    expect(autoMatch(lista, "  Maria   Souza ")?.admissaoId).toBe("1");
  });

  it("não fixa quando há ambiguidade", () => {
    expect(autoMatch(lista, "maria")).toBeNull();
  });

  it("fixa o único resultado mesmo sem nome exato", () => {
    expect(autoMatch([lista[0]], "mar")?.admissaoId).toBe("1");
  });

  it("retorna null para lista vazia ou texto vazio", () => {
    expect(autoMatch([], "maria")).toBeNull();
    expect(autoMatch(lista, "   ")).toBeNull();
  });
});

describe("normalizeNome", () => {
  it("remove acento, baixa a caixa e colapsa espaços", () => {
    expect(normalizeNome("  José   da Silva ")).toBe("jose da silva");
  });
});
