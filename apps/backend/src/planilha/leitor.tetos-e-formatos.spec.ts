import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  decodificarTexto,
  ehUtf16,
  ErroLeituraPlanilha,
  formatoDaPlanilha,
  lerPlanilha,
  lerTexto,
  MAX_ABAS_PLANILHA,
  MAX_BYTES_DESCOMPRIMIDOS,
  MAX_BYTES_PLANILHA,
  MAX_LINHAS_PLANILHA,
  tamanhoDescomprimidoDoZip,
} from "./leitor";
import { exigirPlanilhaNoTeto, OPCOES_UPLOAD_PLANILHA } from "./upload";
import { LojasService } from "../admin/lojas/lojas.service";

/**
 * OS TETOS E OS FORMATOS QUE A RODADA DE CORREÇÃO ACRESCENTOU.
 *
 * O que está travado aqui é o que a auditoria de segurança vetou e o que o diretor mandou aceitar:
 *  - TETO DE BYTES, na porta (multer) e na leitura, porque upload sem teto com parse síncrono é o
 *    event loop do backend parado (medido: 27,66 MB viraram 2 GB de RSS e 45,8 s de parse);
 *  - TETO DE LINHAS APLICADO DENTRO DO LAÇO, e não depois: o arquivo inteiro não pode ser
 *    materializado antes do corte;
 *  - TETO DE ABAS;
 *  - UTF-16 COM BOM aceito, que é o "Texto Unicode" que o próprio Excel salva;
 *  - ARQUIVO DE ZERO BYTE dizendo VAZIA, e não "formato não suportado";
 *  - a prévia de LOJAS declarando QUAL ABA foi lida (visibilidade que a troca de leitor tirou).
 *
 * §A.6: fixtures sintéticas, nada da base real.
 */

// ── TETO DE BYTES ────────────────────────────────────────────────────────────────────────────────

describe("teto de BYTES: o arquivo grande demais é recusado, e não parseado", () => {
  it("o multer tem limite de tamanho (o padrão dele é infinito, e era isso o furo)", () => {
    expect(OPCOES_UPLOAD_PLANILHA.limits.fileSize).toBeGreaterThan(MAX_BYTES_PLANILHA);
    expect(OPCOES_UPLOAD_PLANILHA.limits.fileSize).toBeLessThan(MAX_BYTES_PLANILHA * 2);
    expect(OPCOES_UPLOAD_PLANILHA.limits.files).toBe(1);
  });

  it("a rota recusa com 400 e mensagem que diz o limite, ANTES de a leitura tocar no arquivo", () => {
    const grande = { buffer: Buffer.alloc(MAX_BYTES_PLANILHA + 1, 0x41) };
    expect(() => exigirPlanilhaNoTeto(grande)).toThrowError(/limite/i);
    try {
      exigirPlanilhaNoTeto(grande);
    } catch (err) {
      expect((err as { getStatus?: () => number }).getStatus?.()).toBe(400);
      expect((err as Error).message).not.toContain("—");
    }
  });

  it("arquivo dentro do teto passa pela porta", () => {
    const buffer = Buffer.from("Nome;Email\nFulano;f@e.com\n", "utf8");
    expect(exigirPlanilhaNoTeto({ buffer })).toBe(buffer);
  });

  it("a LEITURA também recusa, para nenhum outro chamador entrar por baixo da porta", async () => {
    const texto = Buffer.from("Nome;Email\n", "utf8");
    const grande = Buffer.concat([texto, Buffer.alloc(MAX_BYTES_PLANILHA, 0x41)]);
    await expect(lerPlanilha(grande)).rejects.toMatchObject({ motivo: "GRANDE_DEMAIS" });
  });
});

describe("teto do CONTEÚDO DESCOMPRIMIDO: o zip pequeno por fora e gigante por dentro", () => {
  /**
   * Um zip com diretório central DECLARANDO um conteúdo enorme, e nada dentro.
   *
   * É a fixture honesta para esta guarda: o que o leitor confere é o tamanho DECLARADO, e conferir isso
   * não exige gerar de verdade um arquivo de 50 MB (o xlsx real que mediu o defeito tinha 4,69 MB no
   * disco, 54 MB declarados, 300.001 linhas, e custava 12 s de CPU e 1,2 GB de RSS para ser lido).
   */
  function zipQueDeclara(bytesDescomprimidos: number): Buffer {
    const entrada = Buffer.alloc(46);
    entrada.writeUInt32LE(0x02014b50, 0);
    entrada.writeUInt32LE(bytesDescomprimidos, 24);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(1, 10);
    const cabecalhoLocal = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    fim.writeUInt32LE(cabecalhoLocal.length, 16);
    return Buffer.concat([cabecalhoLocal, entrada, fim]);
  }

  it("o tamanho descomprimido é lido do diretório central, sem descomprimir o arquivo", async () => {
    const buf = zipQueDeclara(MAX_BYTES_DESCOMPRIMIDOS + 1024);
    expect(buf.length).toBeLessThan(MAX_BYTES_PLANILHA);
    expect(tamanhoDescomprimidoDoZip(buf)).toBeGreaterThan(MAX_BYTES_DESCOMPRIMIDOS);

    const t0 = Date.now();
    await expect(lerPlanilha(buf)).rejects.toMatchObject({ motivo: "GRANDE_DEMAIS" });
    // A recusa tem de ser IMEDIATA: se ela demorasse, seria o mesmo congelamento com outro nome.
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("ZIP64 (tamanho não conferível no campo curto) é recusado, e não aceito na dúvida", () => {
    expect(tamanhoDescomprimidoDoZip(zipQueDeclara(0xffffffff))).toBe(Number.POSITIVE_INFINITY);
  });

  it("xlsx honesto de 2.000 linhas passa, e o teto não estorva o caso real", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Plan1");
    ws.addRow(Array.from({ length: 12 }, (_, c) => `COLUNA ${c}`));
    for (let i = 0; i < MAX_LINHAS_PLANILHA; i += 1) {
      ws.addRow(Array.from({ length: 12 }, (_, c) => `valor ${i} coluna ${c} com texto de tamanho real`));
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(tamanhoDescomprimidoDoZip(buf)).toBeLessThan(MAX_BYTES_DESCOMPRIMIDOS);

    const g = await lerPlanilha(buf);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(0);
  }, 120_000);
});

// ── TETO DE LINHAS DENTRO DO LAÇO ────────────────────────────────────────────────────────────────

describe("teto de LINHAS aplicado na leitura, com a contagem do descarte preservada", () => {
  it("CSV muito acima do teto: corta, declara o descarte e a invariante fecha", () => {
    const excedente = 5000;
    const csv = [
      "NOME",
      ...Array.from({ length: MAX_LINHAS_PLANILHA + excedente }, (_, i) => `Pessoa ${i}`),
    ].join("\n");

    const t0 = Date.now();
    const g = lerTexto(csv);
    const ms = Date.now() - t0;

    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(excedente);
    expect(g.linhas.length + g.descartadasPorTeto).toBe(MAX_LINHAS_PLANILHA + excedente);
    // Não é medição de desempenho, é a prova de que o arquivo inteiro NÃO é materializado: 7.000
    // linhas cortadas em 2.000 têm de sair instantâneas.
    expect(ms).toBeLessThan(2000);
  });

  it("`.xls` muito acima do teto: idem, pelo caminho binário", async () => {
    const excedente = 3000;
    const linhas: unknown[][] = [["NOME"]];
    for (let i = 0; i < MAX_LINHAS_PLANILHA + excedente; i += 1) linhas.push([`Pessoa ${i}`]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Plan1");

    const g = await lerPlanilha(XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(excedente);
  });
});

describe("teto de ABAS", () => {
  it("arquivo com mais abas que o teto lê as primeiras e não se perde nas demais", async () => {
    const wb = XLSX.utils.book_new();
    for (let i = 0; i < MAX_ABAS_PLANILHA + 5; i += 1) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Nome", "Email"], [`Pessoa ${i}`, "f@e.com"]]),
        `Aba${i}`,
      );
    }
    const g = await lerPlanilha(XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer);
    expect(g.abasDisponiveis).toHaveLength(MAX_ABAS_PLANILHA);
    expect(g.abaUsada).toBe("Aba0");
  });
});

// ── UTF-16, O "TEXTO UNICODE" DO EXCEL ───────────────────────────────────────────────────────────

describe("UTF-16 COM BOM é aceito: é o que o próprio Excel salva como Texto Unicode", () => {
  const CONTEUDO = "Nome\tCidade\nJosé Antônio\tSão Paulo\nMárcia\tSanto André\n";

  it("UTF-16 LE com BOM: lê a grade com os acentos certos", async () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(CONTEUDO, "utf16le")]);
    expect(ehUtf16(buf)).toBe("utf-16le");
    expect(formatoDaPlanilha(buf)).toBe("TEXTO");

    const g = await lerPlanilha(buf);
    expect(g.cabecalho).toEqual(["Nome", "Cidade"]);
    expect(g.linhas[0]).toEqual(["José Antônio", "São Paulo"]);
  });

  it("UTF-16 BE com BOM também", () => {
    const le = Buffer.from(CONTEUDO, "utf16le");
    const be = Buffer.alloc(le.length);
    for (let i = 0; i < le.length; i += 2) {
      be[i] = le[i + 1] as number;
      be[i + 1] = le[i] as number;
    }
    const buf = Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
    expect(ehUtf16(buf)).toBe("utf-16be");
    expect(decodificarTexto(buf)).toContain("José Antônio");
  });

  it("UTF-16 SEM BOM continua recusado: adivinhar binário é o defeito que a frente matou", async () => {
    await expect(lerPlanilha(Buffer.from(CONTEUDO, "utf16le"))).rejects.toBeInstanceOf(
      ErroLeituraPlanilha,
    );
  });
});

// ── ZERO BYTE ────────────────────────────────────────────────────────────────────────────────────

describe("arquivo de ZERO BYTE", () => {
  it("diz VAZIA, e não FORMATO_NAO_SUPORTADO: o formato dele não tem nada de estranho", async () => {
    await expect(lerPlanilha(Buffer.alloc(0))).rejects.toMatchObject({ motivo: "VAZIA" });
  });
});

// ── LOJAS: A ABA LIDA FICA VISÍVEL ───────────────────────────────────────────────────────────────

describe("prévia de LOJAS declara qual aba foi lida e quais existem", () => {
  it("devolve `abaUsada` e `abasDisponiveis`, para o consultor ver de onde veio a importação", async () => {
    const db = {
      query: { clientes: { findFirst: async () => ({ codCliente: "C1" }) } },
      select: () => ({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
    };
    const ai = { mapearColunasPlanilha: vi.fn(async () => null) };
    const service = new LojasService(db as never, ai as never);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Instrucoes");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["NOME"], ["Loja Centro"]]),
      "Lojas",
    );
    const arquivo = XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer;

    const previa = await service.previaImportacao("C1", arquivo, {
      colunaNome: 0,
      colunaEndereco: null,
      colunaCodigo: null,
    });

    expect(previa.abaUsada).toBe("Lojas");
    expect(previa.abasDisponiveis).toEqual(["Instrucoes", "Lojas"]);
  });
});

