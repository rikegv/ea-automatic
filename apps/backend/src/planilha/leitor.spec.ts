import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  decodificarTexto,
  detectarLinhaCabecalho,
  detectarSeparador,
  ehXlsLegado,
  ehZip,
  ErroLeituraPlanilha,
  formatoDaPlanilha,
  lerPlanilha,
  lerTexto,
  MAX_LINHAS_PLANILHA,
  numeroDaLinhaNoArquivo,
} from "./leitor";

/**
 * O LEITOR ÚNICO DE PLANILHA, e o defeito que estes testes existem para travar.
 *
 * A importação falhou com a base REAL do diretor por TRÊS causas, todas medidas no arquivo dele:
 *   1. o arquivo é `.xls` LEGADO (OLE2/BIFF, magic `d0cf11e0`), e o roteamento era um ternário binário
 *      ("é zip? xlsx : CSV"), então o BINÁRIO foi lido como texto e virou uma coluna de mojibake, SEM
 *      NENHUM ERRO. É a FALHA SILENCIOSA, e é o item mais grave;
 *   2. o cabeçalho NÃO está na linha 1: a linha 1 é o título "Dados: Candidatos", com uma célula só;
 *   3. o arquivo tem DUAS abas (`Candidatos` e `Carimbos`).
 *
 * TODAS AS FIXTURES AQUI SÃO SINTÉTICAS (§A.6). A base real tem PII de 397 pessoas e NÃO entra no
 * repositório: ela foi usada uma vez, fora dos testes, para conferir aba, linha do cabeçalho e
 * colunas, sem despejar conteúdo.
 */

// ── FIXTURES SINTÉTICAS ──────────────────────────────────────────────────────────────────────────

/** `.xls` LEGADO de verdade (BIFF8/OLE2), escrito pelo SheetJS. É o formato da base do diretor. */
function xlsLegado(abas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer;
}

/** XLSX de verdade (zip/PK), escrito pelo exceljs, que é o caminho já em produção. */
async function xlsxReal(abas: Record<string, unknown[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = wb.addWorksheet(nome);
    for (const l of linhas) ws.addRow(l as ExcelJS.CellValue[]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A forma da base real, em dado INVENTADO: título na linha 1, cabeçalho na linha 2, duas abas. */
const COMO_A_BASE_REAL: Record<string, unknown[][]> = {
  Candidatos: [
    ["Dados: Candidatos"],
    ["Cod_cand", "Nome_cand", "Email_cand", "Celular_cand"],
    ["1", "Fulano De Teste", "fulano@exemplo.com", "11999990000"],
    ["2", "Ciclana De Teste", "ciclana@exemplo.com", "11988880000"],
  ],
  Carimbos: [
    ["Dados: Carimbos"],
    ["CodCand_carimbo", "Nome_carimbo", "Fase_carimbo"],
    ["1", "Fulano De Teste", "Triagem"],
  ],
};

// ── 1. FORMATO POR MAGIC BYTE ────────────────────────────────────────────────────────────────────

describe("o formato vem do MAGIC BYTE, nunca da extensão", () => {
  it("reconhece o `.xls` LEGADO (OLE2), que é o formato que quebrou a importação real", () => {
    const buf = xlsLegado({ Plan1: [["A"], ["1"]] });
    expect(buf.subarray(0, 4).toString("hex")).toBe("d0cf11e0");
    expect(ehXlsLegado(buf)).toBe(true);
    expect(ehZip(buf)).toBe(false);
    expect(formatoDaPlanilha(buf)).toBe("XLS");
  });

  it("reconhece o xlsx (zip, PK) e o texto", async () => {
    expect(formatoDaPlanilha(await xlsxReal({ Plan1: [["A"], ["1"]] }))).toBe("XLSX");
    expect(formatoDaPlanilha(Buffer.from("NOME;COD\nLoja A;1\n"))).toBe("TEXTO");
  });

  it("NÃO chama de texto um binário qualquer: é aí que nascia o lixo", () => {
    // PDF: começa em ASCII ("%PDF"), e por isso um teste de "parece texto?" ingênuo o aceitaria.
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from([0x00, 0x01, 0x02, 0x03])]);
    expect(formatoDaPlanilha(pdf)).toBeNull();
    // PNG.
    expect(formatoDaPlanilha(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBeNull();
  });

  it("LÊ o `.xls` legado de ponta a ponta, em vez de transformar o binário em texto", async () => {
    const g = await lerPlanilha(xlsLegado(COMO_A_BASE_REAL));
    expect(g.cabecalho).toEqual(["Cod_cand", "Nome_cand", "Email_cand", "Celular_cand"]);
    expect(g.linhas).toHaveLength(2);
    // A prova de que o defeito morreu: NÃO é uma coluna única de mojibake.
    expect(g.cabecalho.length).toBeGreaterThan(1);
  });

  it("o `.xls` legado guarda a célula como TEXTO: zero à esquerda não se perde", async () => {
    const g = await lerPlanilha(xlsLegado({ Plan1: [["COD", "CPF"], ["0012", "01234567890"]] }));
    expect(g.linhas[0]).toEqual(["0012", "01234567890"]);
  });
});

// ── 2. CABEÇALHO FORA DA LINHA 1 ─────────────────────────────────────────────────────────────────

describe("o cabeçalho é LOCALIZADO, não presumido na linha 1", () => {
  it("pula o título de relatório de ERP e acha o cabeçalho na linha 2", async () => {
    const g = await lerPlanilha(xlsLegado(COMO_A_BASE_REAL));
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho[1]).toBe("Nome_cand");
    expect(g.linhas[0]?.[1]).toBe("Fulano De Teste");
  });

  it("vale para xlsx também, não só para o xls", async () => {
    const g = await lerPlanilha(await xlsxReal(COMO_A_BASE_REAL));
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho).toEqual(["Cod_cand", "Nome_cand", "Email_cand", "Celular_cand"]);
  });

  it("vale para CSV também: título na primeira linha não vira cabeçalho", () => {
    const g = lerTexto("Dados: Candidatos\nNome;Email;Celular\nFulano;f@e.com;11999990000\n");
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Celular"]);
    expect(g.linhas).toHaveLength(1);
  });

  it("cabeçalho JÁ na linha 1 continua sendo a linha 1 (nada de heurística esperta demais)", () => {
    const g = lerTexto("Nome;Email\nFulano;f@e.com\nCiclana;c@e.com\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.linhas).toHaveLength(2);
  });

  it("planilha de UMA coluna ainda tem cabeçalho: é a regra de reserva", () => {
    const g = lerTexto("NOME\nLoja A\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["NOME"]);
  });

  it("o EMPATE de largura fica com a linha de CIMA, porque o cabeçalho vem antes do dado", () => {
    // Cabeçalho com 3 colunas e uma linha de dado com 4: o cabeçalho continua sendo o de cima.
    expect(detectarLinhaCabecalho([["A", "B", "C"], ["1", "2", "3", "4"]])).toBe(1);
  });

  it("cabeçalho SEM dado abaixo não é cabeçalho", () => {
    expect(detectarLinhaCabecalho([["A", "B"], [], []])).toBeNull();
  });

  it("o número da linha do relatório acompanha o cabeçalho, para a pessoa achar o erro na planilha", () => {
    const naLinha1 = lerTexto("Nome;Email\nFulano;f@e.com\n");
    const naLinha2 = lerTexto("Dados\nNome;Email\nFulano;f@e.com\n");
    expect(numeroDaLinhaNoArquivo(naLinha1, 0)).toBe(2);
    expect(numeroDaLinhaNoArquivo(naLinha2, 0)).toBe(3);
  });
});

// ── 3. MULTI ABA ─────────────────────────────────────────────────────────────────────────────────

describe("multi aba: escolhe uma, LISTA todas e aceita a troca", () => {
  it("lista as abas e usa a primeira utilizável", async () => {
    const g = await lerPlanilha(xlsLegado(COMO_A_BASE_REAL));
    expect(g.abasDisponiveis).toEqual(["Candidatos", "Carimbos"]);
    expect(g.abaUsada).toBe("Candidatos");
  });

  it("aceita a aba PEDIDA, que é como o time corrige a escolha automática", async () => {
    const g = await lerPlanilha(xlsLegado(COMO_A_BASE_REAL), { aba: "Carimbos" });
    expect(g.abaUsada).toBe("Carimbos");
    expect(g.cabecalho).toEqual(["CodCand_carimbo", "Nome_carimbo", "Fase_carimbo"]);
  });

  it("PULA a aba vazia e vai para a primeira que tem dado", async () => {
    const g = await lerPlanilha(
      xlsLegado({ Instrucoes: [[]], Dados: [["Nome", "Email"], ["Fulano", "f@e.com"]] }),
    );
    expect(g.abaUsada).toBe("Dados");
    expect(g.abasDisponiveis).toEqual(["Instrucoes", "Dados"]);
  });

  it("CSV não tem aba, e não inventa uma", () => {
    const g = lerTexto("Nome;Email\nFulano;f@e.com\n");
    expect(g.abaUsada).toBeUndefined();
    expect(g.abasDisponiveis).toBeUndefined();
  });
});

// ── 4. TEXTO: separador e encoding FAREJADOS ──────────────────────────────────────────────────────

describe("CSV/TSV: separador e encoding são farejados, não presumidos", () => {
  it("detecta ponto e vírgula, vírgula e tabulação", () => {
    expect(detectarSeparador("A;B;C\n1;2;3")).toBe(";");
    expect(detectarSeparador("A,B,C\n1,2,3")).toBe(",");
    expect(detectarSeparador("A\tB\tC\n1\t2\t3")).toBe("\t");
  });

  it("vírgula DENTRO do texto não vence o ponto e vírgula que separa de verdade", () => {
    const g = lerTexto("LOJA;ENDERECO\nLoja Morumbi;Av. Roque Petroni, 1089\n");
    expect(g.linhas[0]).toEqual(["Loja Morumbi", "Av. Roque Petroni, 1089"]);
  });

  it("lê TSV, que é o que sai de copiar do Excel e colar no Bloco de Notas", async () => {
    const g = await lerPlanilha(Buffer.from("Nome\tEmail\nFulano\tf@e.com\n", "utf8"));
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
    expect(g.linhas[0]).toEqual(["Fulano", "f@e.com"]);
  });

  it("UTF-8 com BOM: o BOM não entra no nome da primeira coluna", async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Nome;Cidade\nJosé;São Paulo\n", "utf8")]);
    const g = await lerPlanilha(buf);
    expect(g.cabecalho[0]).toBe("Nome");
    expect(g.linhas[0]).toEqual(["José", "São Paulo"]);
  });

  it("cp1252/latin1 (o CSV que o Excel em português salva) não volta com acento quebrado", async () => {
    const g = await lerPlanilha(Buffer.from("Nome;Cidade\nJosé;São Paulo\n", "latin1"));
    expect(g.linhas[0]).toEqual(["José", "São Paulo"]);
    expect(JSON.stringify(g.linhas)).not.toContain("�");
  });

  it("decodificarTexto prefere UTF-8 e só cai no cp1252 quando o UTF-8 falha", () => {
    expect(decodificarTexto(Buffer.from("José", "utf8"))).toBe("José");
    expect(decodificarTexto(Buffer.from("José", "latin1"))).toBe("José");
  });

  it("respeita o teto de linhas e diz quantas ficaram de fora", () => {
    const gigante = ["NOME", ...Array.from({ length: MAX_LINHAS_PLANILHA + 10 }, (_, i) => `L ${i}`)].join("\n");
    const g = lerTexto(gigante);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(10);
  });
});

// ── 5. A RECUSA: o fim da falha silenciosa ───────────────────────────────────────────────────────

/** Executa e devolve o erro de leitura, falhando o teste se a leitura NÃO recusou. */
async function recusaDe(buffer: Buffer, aba?: string): Promise<ErroLeituraPlanilha> {
  try {
    await lerPlanilha(buffer, { aba });
  } catch (err) {
    if (err instanceof ErroLeituraPlanilha) return err;
    throw err;
  }
  throw new Error("a leitura NÃO recusou o arquivo, e devia ter recusado");
}

describe("o que não se sabe ler é RECUSADO com mensagem, nunca lido como lixo", () => {
  it("formato desconhecido: FORMATO_NAO_SUPORTADO, e diz o que enviar", async () => {
    const e = await recusaDe(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
    expect(e.motivo).toBe("FORMATO_NAO_SUPORTADO");
    expect(e.message).toContain(".xlsx");
  });

  it("zip que NÃO é planilha: ILEGIVEL, com a instrução de salvar de novo", async () => {
    const e = await recusaDe(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x11, 0x22, 0x33, 0x44, 0x55]));
    expect(e.motivo).toBe("ILEGIVEL");
    expect(e.message).toContain("corrompido");
  });

  it("OLE2 que não é xls: ILEGIVEL, e não meia grade", async () => {
    const e = await recusaDe(
      Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 7)]),
    );
    expect(e.motivo).toBe("ILEGIVEL");
  });

  it("planilha VAZIA: diz que está vazia, e não que falta cabeçalho", async () => {
    const e = await recusaDe(xlsLegado({ Plan1: [[]] }));
    expect(e.motivo).toBe("VAZIA");
  });

  it("CSV só com espaços e quebras de linha também é VAZIA", () => {
    expect(() => lerTexto("\n \n\n")).toThrow(ErroLeituraPlanilha);
    try {
      lerTexto("\n \n\n");
    } catch (err) {
      expect((err as ErroLeituraPlanilha).motivo).toBe("VAZIA");
    }
  });

  it("tem conteúdo mas nenhum cabeçalho com dado abaixo: SEM_CABECALHO", async () => {
    const e = await recusaDe(xlsLegado({ Plan1: [["Relatório de Candidatos"]] }));
    expect(e.motivo).toBe("SEM_CABECALHO");
  });

  it("aba pedida que não existe: ABA_INEXISTENTE, não a aba errada em silêncio", async () => {
    const e = await recusaDe(xlsLegado(COMO_A_BASE_REAL), "Funcionarios");
    expect(e.motivo).toBe("ABA_INEXISTENTE");
  });

  it("NENHUMA mensagem de recusa usa travessão (§A.11)", async () => {
    const mensagens = [
      (await recusaDe(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]))).message,
      (await recusaDe(xlsLegado({ Plan1: [[]] }))).message,
      (await recusaDe(xlsLegado({ Plan1: [["Relatório"]] }))).message,
      (await recusaDe(xlsLegado(COMO_A_BASE_REAL), "Nao Existe")).message,
    ];
    for (const m of mensagens) expect(m).not.toContain("—");
  });

  it("o binário lido como texto NÃO acontece mais: o `.xls` nunca cai no caminho de CSV", async () => {
    // O defeito, escrito como teste: `toString("utf8")` de um `.xls` dá uma coluna com mojibake.
    const buf = xlsLegado(COMO_A_BASE_REAL);
    const comoEra = buf.toString("utf8");
    expect(comoEra).toContain("�");

    const g = await lerPlanilha(buf);
    expect(g.cabecalho).toHaveLength(4);
    expect(JSON.stringify(g.cabecalho)).not.toContain("�");
  });
});
