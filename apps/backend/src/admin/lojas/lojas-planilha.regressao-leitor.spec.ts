import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  aplicarMapeamento,
  ehXlsx,
  lerCsvLojas,
  lerPlanilhaLojas,
  lerXlsxLojas,
  MAX_LINHAS_PLANILHA,
} from "./lojas-planilha";

/**
 * ─ REGRESSÃO DE LOJAS DEPOIS DO LEITOR ÚNICO (cobertura independente, §A.38) ─────────────────────────
 *
 * A importação de Lojas é CÓDIGO JÁ VALIDADO e passou a consumir o leitor novo (`planilha/leitor.ts`).
 * §A.26: o que importa aqui não é o leitor ficar bonito, é LOJAS NÃO MUDAR DE COMPORTAMENTO para os
 * arquivos que ela já aceitava. O `lojas-planilha.spec.ts` prova as regras de loja; este arquivo prova
 * a FRONTEIRA, que é onde a troca de leitor machuca:
 *
 *   R1. os arquivos que Lojas já aceitava dão a MESMA grade (CSV pt-BR com ponto e vírgula e vírgula
 *       dentro do endereço, CSV com vírgula, coluna única, linhas em branco no fim);
 *   R2. PARIDADE ENTRE FORMATOS: o mesmo conteúdo em CSV, xlsx e `.xls` legado dá o mesmo resultado
 *       mapeado, inclusive o NÚMERO DA LINHA no arquivo, que é o que a tela mostra ao consultor;
 *   R3. o `ehXlsx` continua respondendo pelo MAGIC BYTE, porque o serviço e as specs entram por ele;
 *   R4. o GANHO novo não pode ter custo: `.xls` legado e cabeçalho fora da linha 1 passaram a
 *       funcionar em Lojas, e as regras de loja (rejeitar sem nome, colapsar repetido) seguem valendo
 *       sobre a grade nova.
 */

const CSV_PT = "LOJA;ENDERECO;COD\nLoja Morumbi;Av. Roque Petroni, 1089;A1\nLoja Centro;Rua XV, 20;A2\n";
const MAPA = { colunaNome: 0, colunaEndereco: 1, colunaCodigo: 2 };

const CONTEUDO: unknown[][] = [
  ["LOJA", "ENDERECO", "COD"],
  ["Loja Morumbi", "Av. Roque Petroni, 1089", "A1"],
  ["Loja Centro", "Rua XV, 20", "A2"],
];

function xls(linhas: unknown[][], nomeAba = "Plan1"): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nomeAba);
  return XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer;
}

async function xlsx(linhas: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Plan1");
  for (const l of linhas) ws.addRow(l as ExcelJS.CellValue[]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("R1: o que Lojas já aceitava continua lendo igual", () => {
  it("CSV pt-BR com ponto e vírgula e vírgula DENTRO do endereço", () => {
    const g = lerCsvLojas(CSV_PT);
    expect(g.cabecalho).toEqual(["LOJA", "ENDERECO", "COD"]);
    expect(g.linhaCabecalho).toBe(1);
    expect(g.linhas).toEqual([
      ["Loja Morumbi", "Av. Roque Petroni, 1089", "A1"],
      ["Loja Centro", "Rua XV, 20", "A2"],
    ]);
  });

  it("CSV com vírgula, sem o chamador dizer qual é o separador", () => {
    const g = lerCsvLojas("NOME,ENDERECO\nLoja A,Rua 1\n");
    expect(g.cabecalho).toEqual(["NOME", "ENDERECO"]);
    expect(g.linhas).toEqual([["Loja A", "Rua 1"]]);
  });

  it("planilha de UMA coluna e linhas em branco no fim", () => {
    const g = lerCsvLojas("NOME\nLoja A\n\n\n");
    expect(g.cabecalho).toEqual(["NOME"]);
    expect(g.linhas).toEqual([["Loja A"]]);
    expect(g.descartadasPorTeto).toBe(0);
  });

  it("o teto e a contagem declarada continuam os mesmos", () => {
    const gigante = ["NOME", ...Array.from({ length: MAX_LINHAS_PLANILHA + 10 }, (_, i) => `Loja ${i}`)].join("\n");
    const g = lerCsvLojas(gigante);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(10);
  });

  it("as regras de LOJA sobre a grade não mudaram: sem nome rejeita, repetido colapsa", () => {
    const r = aplicarMapeamento(
      lerCsvLojas("NOME;END\n;Rua 1\nLoja B;Rua 2\nloja b;Rua 3\n"),
      { colunaNome: 0, colunaEndereco: 1, colunaCodigo: null },
    );
    expect(r.rejeitadas).toEqual([{ linha: 2, motivo: "Linha sem nome de loja." }]);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Loja B"]);
    expect(r.colapsadas).toBe(1);
  });
});

describe("R2: paridade entre CSV, xlsx e `.xls` legado, número de linha incluído", () => {
  it("o mesmo conteúdo nos três formatos dá o MESMO resultado mapeado", async () => {
    const doCsv = aplicarMapeamento(lerCsvLojas(CSV_PT), MAPA);
    const doXlsx = aplicarMapeamento(await lerXlsxLojas(await xlsx(CONTEUDO)), MAPA);
    const doXls = aplicarMapeamento(await lerPlanilhaLojas(xls(CONTEUDO)), MAPA);

    expect(doXlsx.linhas).toEqual(doCsv.linhas);
    expect(doXls.linhas).toEqual(doCsv.linhas);
    // A linha que a tela mostra é a do ARQUIVO: cabeçalho na 1, dados na 2 e na 3.
    expect(doCsv.linhas.map((l) => l.linha)).toEqual([2, 3]);
    expect(doXls.linhas.map((l) => l.linha)).toEqual([2, 3]);
  });

  it("endereço e código vazios viram `null` igual nos três formatos", async () => {
    const semExtras: unknown[][] = [["LOJA", "ENDERECO", "COD"], ["Loja Sozinha", "", ""]];
    const doXls = aplicarMapeamento(await lerPlanilhaLojas(xls(semExtras)), MAPA);
    const doCsv = aplicarMapeamento(lerCsvLojas("LOJA;ENDERECO;COD\nLoja Sozinha;;\n"), MAPA);
    expect(doXls.linhas[0]).toEqual({ linha: 2, nome: "Loja Sozinha", endereco: null, codigoExterno: null });
    expect(doCsv.linhas[0]).toEqual(doXls.linhas[0]);
  });
});

describe("R3: o `ehXlsx` continua decidindo pelo MAGIC BYTE", () => {
  it("xlsx sim, `.xls` legado não, CSV não", async () => {
    expect(ehXlsx(await xlsx(CONTEUDO))).toBe(true);
    expect(ehXlsx(xls(CONTEUDO))).toBe(false);
    expect(ehXlsx(Buffer.from(CSV_PT, "utf8"))).toBe(false);
  });
});

describe("R4: o ganho novo em Lojas, sem custo para as regras dela", () => {
  it("`.xls` legado com TÍTULO na linha 1 importa, e o número da linha acompanha", async () => {
    const g = await lerPlanilhaLojas(xls([["Dados: Lojas do cliente"], ...CONTEUDO]));
    expect(g.linhaCabecalho).toBe(2);
    const r = aplicarMapeamento(g, MAPA);
    expect(r.linhas.map((l) => l.nome)).toEqual(["Loja Morumbi", "Loja Centro"]);
    // Título na 1, cabeçalho na 2, dados na 3 e na 4.
    expect(r.linhas.map((l) => l.linha)).toEqual([3, 4]);
  });

  it("arquivo que não é planilha PARA a importação de Lojas, em vez de virar loja de lixo", async () => {
    await expect(
      lerPlanilhaLojas(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])),
    ).rejects.toThrow(/\.xlsx/);
  });

  it("mapeamento sem a coluna do nome não inventa loja nenhuma", () => {
    const r = aplicarMapeamento(lerCsvLojas(CSV_PT), {
      colunaNome: null,
      colunaEndereco: 1,
      colunaCodigo: 2,
    });
    expect(r).toEqual({ linhas: [], rejeitadas: [], colapsadas: 0 });
  });
});
