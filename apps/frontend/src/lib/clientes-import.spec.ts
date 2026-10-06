import { describe, expect, it } from "vitest";
import {
  linhasParaConfirmar,
  montarFormDataPrevia,
  nomeModelo,
  type LinhaAEntrar,
} from "./clientes-import";

/**
 * O QUE ESTE TESTE PROTEGE: o CONTRATO que a tela e o backend combinaram para a importação em massa.
 * As partes puras (o FormData da prévia, o corpo do confirmar, o nome do modelo) são o ponto em que a
 * UI e o backend têm de concordar, então é aqui que uma divergência futura quebra antes da tela.
 */
describe("montarFormDataPrevia", () => {
  it("põe o arquivo no campo `file` do corpo, nunca em query", () => {
    const file = new File(["a,b\n1,2"], "clientes.csv", { type: "text/csv" });
    const form = montarFormDataPrevia(file);
    const enviado = form.get("file");
    expect(enviado).toBeInstanceOf(File);
    expect((enviado as File).name).toBe("clientes.csv");
  });

  it("não manda `aba` quando ela não foi escolhida", () => {
    const file = new File(["x"], "c.xlsx");
    expect(montarFormDataPrevia(file).has("aba")).toBe(false);
    expect(montarFormDataPrevia(file, null).has("aba")).toBe(false);
    expect(montarFormDataPrevia(file, "").has("aba")).toBe(false);
  });

  it("manda `aba` quando a planilha tem várias e o time trocou", () => {
    const file = new File(["x"], "c.xlsx");
    const form = montarFormDataPrevia(file, "Plan2");
    expect(form.get("aba")).toBe("Plan2");
  });
});

describe("linhasParaConfirmar", () => {
  it("manda só os campos do contrato, preservando a linha do arquivo", () => {
    const aEntrar: LinhaAEntrar[] = [
      { linha: 2, codCliente: "A1", cnpj: "11.111.111/0001-11", razaoSocial: "Alfa", nomeOperacao: "Alfa Op" },
      { linha: 3, codCliente: "B2", cnpj: null, razaoSocial: "Beta", nomeOperacao: null },
    ];
    expect(linhasParaConfirmar(aEntrar)).toEqual([
      { codCliente: "A1", cnpj: "11.111.111/0001-11", razaoSocial: "Alfa", nomeOperacao: "Alfa Op", linha: 2 },
      { codCliente: "B2", cnpj: null, razaoSocial: "Beta", nomeOperacao: null, linha: 3 },
    ]);
  });

  it("lista vazia vira corpo vazio, sem inventar linha", () => {
    expect(linhasParaConfirmar([])).toEqual([]);
  });
});

describe("nomeModelo", () => {
  it("dá um nome com a extensão do formato pedido", () => {
    expect(nomeModelo("xlsx")).toBe("modelo-importacao-clientes.xlsx");
    expect(nomeModelo("csv")).toBe("modelo-importacao-clientes.csv");
  });
});
