import { describe, expect, it } from "vitest";
import { ehCabecalho, ehXlsx, lerPlanilhaMatriculas, lerXlsxMatriculas, soDigitos } from "./matriculas-import";

/**
 * LEITURA DA PLANILHA DE MATRÍCULAS (item 11d).
 *
 * O arquivo vem da folha, salvo por gente diferente em máquinas diferentes, e é aí que uma
 * importação morre: separador do Excel em português, CPF com pontuação, coluna trocada de lugar,
 * cabeçalho que ninguém combinou. Cada caso abaixo é um desses.
 */

describe("separador e formato", () => {
  it("lê ponto e vírgula, que é o que o Excel em português salva", () => {
    const r = lerPlanilhaMatriculas("376.143.458-86;12345\n529.982.247-25;67890");
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ cpf: "37614345886", matricula: "12345" });
  });

  it("lê vírgula também", () => {
    const r = lerPlanilhaMatriculas("37614345886,12345");
    expect(r[0]).toMatchObject({ cpf: "37614345886", matricula: "12345" });
  });

  it("a ORDEM das colunas não importa: o CPF é quem tem 11 dígitos", () => {
    const r = lerPlanilhaMatriculas("12345;376.143.458-86");
    expect(r[0]).toMatchObject({ cpf: "37614345886", matricula: "12345" });
  });

  it("matrícula com zero à esquerda continua texto", () => {
    const r = lerPlanilhaMatriculas("37614345886;000123");
    expect(r[0].matricula).toBe("000123");
  });

  it("linha em branco não vira linha", () => {
    expect(lerPlanilhaMatriculas("37614345886;1\n\n\n")).toHaveLength(1);
  });
});

describe("cabeçalho", () => {
  it("a primeira linha sem CPF falando de CPF é cabeçalho, não erro", () => {
    const r = lerPlanilhaMatriculas("cpf;matricula\n37614345886;12345");
    expect(ehCabecalho(r[0])).toBe(true);
    expect(r[1]).toMatchObject({ cpf: "37614345886", matricula: "12345" });
  });

  it("linha do meio sem CPF NÃO é cabeçalho: é erro para a pessoa ver", () => {
    const r = lerPlanilhaMatriculas("37614345886;1\nsem cpf aqui;2");
    expect(ehCabecalho(r[1])).toBe(false);
    expect(r[1].cpf).toBeNull();
  });
});

describe("normalização do CPF", () => {
  it("tira pontuação", () => {
    expect(soDigitos("376.143.458-86")).toBe("37614345886");
  });
});

/**
 * XLSX (decisão do diretor): o modelo que o time usa já é xlsx, e mandar salvar como csv era atrito
 * da ferramenta, não do processo. A REGRA sobre as células é a mesma dos dois formatos, e é isso que
 * estes testes travam: o que muda é só como as células chegam.
 */
describe("xlsx", () => {
  const planilha = async (linhas: (string | number)[][]): Promise<Buffer> => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("matriculas");
    for (const l of linhas) ws.addRow(l);
    return Buffer.from(await wb.xlsx.writeBuffer());
  };

  it("é reconhecido pelos MAGIC BYTES, não pela extensão", async () => {
    expect(ehXlsx(await planilha([["37614345886", "123"]]))).toBe(true);
    expect(ehXlsx(Buffer.from("376.143.458-86;123"))).toBe(false);
  });

  it("lê CPF e matrícula, com a mesma regra do csv", async () => {
    const r = await lerXlsxMatriculas(await planilha([["376.143.458-86", "MAT001"]]));
    expect(r[0]).toMatchObject({ cpf: "37614345886", matricula: "MAT001" });
  });

  /** O Excel guarda "00123" como número: virar texto na leitura é o que preserva o zero à esquerda. */
  it("matrícula com zero à esquerda sobrevive", async () => {
    const r = await lerXlsxMatriculas(await planilha([["37614345886", "000123"]]));
    expect(r[0].matricula).toBe("000123");
  });

  it("CPF gravado como NÚMERO pelo Excel ainda é reconhecido", async () => {
    const r = await lerXlsxMatriculas(await planilha([[37614345886, "MAT001"]]));
    expect(r[0].cpf).toBe("37614345886");
  });

  it("a ordem das colunas não importa, como no csv", async () => {
    const r = await lerXlsxMatriculas(await planilha([["MAT001", "376.143.458-86"]]));
    expect(r[0]).toMatchObject({ cpf: "37614345886", matricula: "MAT001" });
  });

  it("cabeçalho continua sendo cabeçalho", async () => {
    const r = await lerXlsxMatriculas(await planilha([["CPF", "Matrícula"], ["37614345886", "1"]]));
    expect(ehCabecalho(r[0])).toBe(true);
    expect(r[1].cpf).toBe("37614345886");
  });
});
