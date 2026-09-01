import { describe, expect, it } from "vitest";
import {
  amostraParaIa,
  aplicarMapeamento,
  ehXlsx,
  lerCsvLojas,
  LINHAS_DE_AMOSTRA,
  MAX_LINHAS_PLANILHA,
} from "./lojas-planilha";

/**
 * A PARTE DETERMINÍSTICA DA IMPORTAÇÃO (etapa 2). A IA decide QUAIS COLUNAS são o quê; tudo o que
 * está aqui é código, e é por isso que a mesma planilha com o mesmo mapeamento dá sempre o mesmo
 * resultado. Estes testes travam exatamente isso, sem tocar no Vertex.
 */

const CSV_PT = "LOJA;ENDERECO;COD\nLoja Morumbi;Av. Roque Petroni, 1089;A1\nLoja Centro;Rua XV, 20;A2\n";
const MAPA = { colunaNome: 0, colunaEndereco: 1, colunaCodigo: 2 };

describe("leitura da planilha", () => {
  it("lê CSV com ponto e vírgula, que é como o Excel em português salva", () => {
    const g = lerCsvLojas(CSV_PT);
    expect(g.cabecalho).toEqual(["LOJA", "ENDERECO", "COD"]);
    expect(g.linhas).toHaveLength(2);
  });

  it("lê CSV com vírgula também, sem o chamador precisar dizer qual é", () => {
    const g = lerCsvLojas("NOME,ENDERECO\nLoja A,Rua 1\n");
    expect(g.cabecalho).toEqual(["NOME", "ENDERECO"]);
    expect(g.linhas).toEqual([["Loja A", "Rua 1"]]);
  });

  it("a PRIMEIRA linha é sempre o cabeçalho, e é ela que a IA lê", () => {
    // Diferença consciente em relação à importação de matrículas, que dispensa cabeçalho porque o
    // CPF se identifica sozinho pelos 11 dígitos. Aqui os três campos são texto livre.
    const g = lerCsvLojas(CSV_PT);
    expect(g.linhas[0]?.[0]).toBe("Loja Morumbi");
  });

  it("descarta linhas totalmente vazias, que toda planilha real tem no fim", () => {
    const g = lerCsvLojas("NOME\nLoja A\n\n\n");
    expect(g.linhas).toEqual([["Loja A"]]);
  });

  it("o formato é decidido pelos MAGIC BYTES, não pela extensão", () => {
    expect(ehXlsx(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(ehXlsx(Buffer.from("NOME;ENDERECO\n"))).toBe(false);
  });

  it("a amostra para a IA é PEQUENA: o cabeçalho decide, a amostra confirma", () => {
    const muitas = ["NOME", ...Array.from({ length: 100 }, (_, i) => `Loja ${i}`)].join("\n");
    expect(amostraParaIa(lerCsvLojas(muitas))).toHaveLength(LINHAS_DE_AMOSTRA);
  });

  it("respeita o teto de 2.000 linhas e diz quantas ficaram de fora", () => {
    const gigante = ["NOME", ...Array.from({ length: 2010 }, (_, i) => `Loja ${i}`)].join("\n");
    const g = lerCsvLojas(gigante);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(10);
  });
});

describe("aplicação do mapeamento", () => {
  it("aplica as três colunas e numera a linha COMO ELA ESTÁ NO ARQUIVO", () => {
    const { linhas } = aplicarMapeamento(lerCsvLojas(CSV_PT), MAPA);
    expect(linhas[0]).toEqual({
      // linha 2 do arquivo: a 1 é o cabeçalho. É esse número que a pessoa procura na planilha dela.
      linha: 2,
      nome: "Loja Morumbi",
      endereco: "Av. Roque Petroni, 1089",
      codigoExterno: "A1",
    });
  });

  it("nome VAZIO é rejeitado, com o número da linha", () => {
    const { linhas, rejeitadas } = aplicarMapeamento(lerCsvLojas("NOME;END\n;Rua 1\nLoja B;Rua 2\n"), MAPA);
    expect(linhas).toHaveLength(1);
    expect(rejeitadas).toEqual([{ linha: 2, motivo: "Linha sem nome de loja." }]);
  });

  it("nome REPETIDO na planilha colapsa em um, e a contagem fica visível", () => {
    // O repetido é detectado pela MESMA normalização do índice único do banco, então o que a
    // planilha considera repetido e o que o banco considera duplicado são a mesma coisa.
    const csv = "NOME;END\nLoja Centro;Rua 1\nLOJA   CENTRO ;Rua 2\nLoja Sul;Rua 3\n";
    const { linhas, colapsadas } = aplicarMapeamento(lerCsvLojas(csv), MAPA);
    expect(linhas.map((l) => l.nome)).toEqual(["Loja Centro", "Loja Sul"]);
    expect(colapsadas).toBe(1);
  });

  it("endereço e código ausentes viram null, não string vazia", () => {
    const { linhas } = aplicarMapeamento(lerCsvLojas("NOME\nLoja A\n"), {
      colunaNome: 0,
      colunaEndereco: null,
      colunaCodigo: null,
    });
    expect(linhas[0]?.endereco).toBeNull();
    expect(linhas[0]?.codigoExterno).toBeNull();
  });

  it("SEM a coluna do nome não produz nada: é o estado do fallback manual", () => {
    // A IA fora ou sem achar o nome devolve isto, e o modal abre vazio para o consultor escolher.
    const r = aplicarMapeamento(lerCsvLojas(CSV_PT), {
      colunaNome: null,
      colunaEndereco: 1,
      colunaCodigo: 2,
    });
    expect(r.linhas).toEqual([]);
    expect(r.rejeitadas).toEqual([]);
  });

  it("trocar a coluna do nome muda o resultado, que é o que a correção do consultor faz", () => {
    // Prova que o mapeamento é o único parâmetro: mesma planilha, mapa diferente, saída diferente,
    // sem a IA entrar de novo.
    const g = lerCsvLojas(CSV_PT);
    const comoNome = aplicarMapeamento(g, { colunaNome: 1, colunaEndereco: 0, colunaCodigo: null });
    expect(comoNome.linhas[0]?.nome).toBe("Av. Roque Petroni, 1089");
    expect(comoNome.linhas[0]?.endereco).toBe("Loja Morumbi");
  });
});
