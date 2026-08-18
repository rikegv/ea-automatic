import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  COLUNAS_RELATORIO,
  COLUNAS_RELATORIO_PADRAO,
  normalizarColunasRelatorio,
} from "@ea/shared-types";
import {
  fmtDataHoraRelatorio,
  fmtDataRelatorio,
  gerarXlsxRelatorio,
  nomeArquivoRelatorio,
  numeroDoSalario,
  type LinhaRelatorio,
} from "./relatorio-export";

/** Lê de volta o arquivo gerado: o teste confere o xlsx real, não o objeto intermediário. */
async function lerXlsx(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const linhas: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores = row.values as unknown[];
    linhas.push(valores.slice(1)); // o ExcelJS indexa a partir de 1
  });
  return { ws, linhas };
}

const LINHA: LinhaRelatorio = {
  nome: "MARIA DA SILVA",
  cpf: "01234567890",
  telefone: "11999990000",
  email: "maria@exemplo.com",
  cliente: "OPERAÇÃO CENTRO",
  cargo: "AUXILIAR DE LIMPEZA",
  dataAdmissao: "18/08/2026",
  matricula: "000123",
  salario: 2500.5,
  status: "Em Admissão",
};

describe("relatório exportável — catálogo de colunas (item 11c)", () => {
  it("devolve as colunas marcadas na ORDEM CANÔNICA, sem repetição", () => {
    // Marcadas fora de ordem e uma repetida: o arquivo sai sempre igual para o mesmo conjunto.
    expect(normalizarColunasRelatorio(["cargo", "nome", "cargo", "cpf"])).toEqual([
      "nome",
      "cpf",
      "cargo",
    ]);
  });

  it("descarta chave que não existe no catálogo (nada de coluna inventada)", () => {
    expect(normalizarColunasRelatorio(["nome", "senhaHash", "'; drop table"])).toEqual(["nome"]);
  });

  it("§A.6: banco, agência, conta e CPF do substituído NÃO são oferecidos", () => {
    const chaves = COLUNAS_RELATORIO.map((c) => c.chave);
    for (const proibida of ["banco", "agencia", "conta", "substituidoCpf"]) {
      expect(chaves).not.toContain(proibida);
    }
  });

  it("o padrão marcado é o que o diretor pediu: nome e telefone", () => {
    expect([...COLUNAS_RELATORIO_PADRAO]).toEqual(["nome", "telefone"]);
  });
});

describe("relatório exportável — geração do xlsx", () => {
  it("escreve SÓ as colunas marcadas, com o rótulo do catálogo no cabeçalho", async () => {
    const buffer = await gerarXlsxRelatorio(["nome", "telefone"], [LINHA]);
    const { linhas } = await lerXlsx(buffer);
    expect(linhas[0]).toEqual(["Nome", "Telefone"]);
    expect(linhas[1]).toEqual(["MARIA DA SILVA", "11999990000"]);
    // E-mail não foi marcado: não aparece em lugar nenhum do arquivo.
    expect(JSON.stringify(linhas)).not.toContain("maria@exemplo.com");
  });

  it("célula sem dado fica VAZIA, sem marcador de texto (§A.11: nada de travessão)", async () => {
    const buffer = await gerarXlsxRelatorio(["nome", "telefone"], [{ nome: "JOÃO", telefone: null }]);
    const { ws } = await lerXlsx(buffer);
    const cell = ws.getRow(2).getCell(2);
    expect(cell.value ?? null).toBeNull();
    expect(JSON.stringify(ws.getRow(2).values)).not.toContain("—");
  });

  it("matrícula sai como TEXTO (o zero à esquerda da folha sobrevive)", async () => {
    const buffer = await gerarXlsxRelatorio(["matricula"], [LINHA]);
    const { ws } = await lerXlsx(buffer);
    expect(ws.getRow(2).getCell(1).value).toBe("000123");
    expect(ws.getRow(2).getCell(1).numFmt).toBe("@");
  });

  it("salário sai como NÚMERO, para o time somar na planilha", async () => {
    const buffer = await gerarXlsxRelatorio(["salario"], [LINHA]);
    const { ws } = await lerXlsx(buffer);
    expect(ws.getRow(2).getCell(1).value).toBe(2500.5);
  });

  it("não quebra quando a coluna formatada não foi marcada", async () => {
    await expect(gerarXlsxRelatorio(["nome"], [LINHA])).resolves.toBeInstanceOf(Buffer);
  });

  it("gera uma linha por candidato, mais o cabeçalho", async () => {
    const buffer = await gerarXlsxRelatorio(["nome"], [LINHA, LINHA, LINHA]);
    const { linhas } = await lerXlsx(buffer);
    expect(linhas).toHaveLength(4);
  });
});

describe("relatório exportável — formatação", () => {
  it("data ISO vira o formato que o time lê", () => {
    expect(fmtDataRelatorio("2026-08-18")).toBe("18/08/2026");
    expect(fmtDataRelatorio(null)).toBeNull();
    expect(fmtDataRelatorio("")).toBeNull();
  });

  it("data e hora da criação, com zero à esquerda", () => {
    expect(fmtDataHoraRelatorio(new Date(2026, 7, 18, 9, 5))).toBe("18/08/2026 09:05");
    expect(fmtDataHoraRelatorio(null)).toBeNull();
  });

  it("salário do driver (string numérica) vira número; lixo vira vazio", () => {
    expect(numeroDoSalario("2500.00")).toBe(2500);
    expect(numeroDoSalario(1800.9)).toBe(1800.9);
    expect(numeroDoSalario(null)).toBeNull();
    expect(numeroDoSalario("")).toBeNull();
    expect(numeroDoSalario("a combinar")).toBeNull();
  });

  it("o nome do arquivo carrega a data do dia", () => {
    expect(nomeArquivoRelatorio(new Date(2026, 7, 5))).toBe("relatorio-candidatos-2026-08-05.xlsx");
  });
});
