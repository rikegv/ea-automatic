import { describe, expect, it } from "vitest";
import { camposDaPlanilha } from "./as-campos-da-planilha";

/**
 * A DERIVAÇÃO É DO SERVIDOR, E O VOCABULÁRIO É FECHADO.
 *
 * O que estes casos travam é a parte da regra que um "conserto" futuro desfaria sem perceber:
 * ausência e lista vazia são "nada da planilha" (a tela fica como era), e valor desconhecido é
 * DESCARTADO em vez de virar marca sem rótulo na tela.
 */
describe("camposDaPlanilha", () => {
  it("devolve vazio quando a vaga não tem a lista, tem nula ou tem vazia", () => {
    expect(camposDaPlanilha(undefined).size).toBe(0);
    expect(camposDaPlanilha(null).size).toBe(0);
    expect(camposDaPlanilha({}).size).toBe(0);
    expect(camposDaPlanilha({ camposVindosDaPlanilha: null }).size).toBe(0);
    expect(camposDaPlanilha({ camposVindosDaPlanilha: [] }).size).toBe(0);
  });

  it("devolve exatamente os campos que o servidor listou", () => {
    const campos = camposDaPlanilha({ camposVindosDaPlanilha: ["cargo", "dataLimite"] });
    expect(campos.has("cargo")).toBe(true);
    expect(campos.has("dataLimite")).toBe(true);
    expect(campos.has("natureza")).toBe(false);
    expect(campos.size).toBe(2);
  });

  it("aceita os cinco campos do vocabulário", () => {
    const campos = camposDaPlanilha({
      camposVindosDaPlanilha: [
        "natureza",
        "linhaServico",
        "cargo",
        "dataAbertura",
        "dataLimite",
      ],
    });
    expect(campos.size).toBe(5);
  });

  it("descarta valor fora do vocabulário em vez de propagá-lo para a tela", () => {
    const campos = camposDaPlanilha({
      camposVindosDaPlanilha: ["cargo", "salarioDeOutraVersao"] as never,
    });
    expect(campos.size).toBe(1);
    expect(campos.has("cargo")).toBe(true);
  });
});
