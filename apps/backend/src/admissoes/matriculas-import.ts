import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";

/**
 * LEITURA DA PLANILHA DE MATRÍCULAS (melhoria EAC, item 11d).
 *
 * FUNÇÃO PURA, separada do serviço, porque é a parte que mais tem borda: separador, cabeçalho,
 * acento, CPF com pontuação, coluna trocada de lugar. Testar isso sem banco é o que garante que o
 * lote não quebre por causa de um arquivo salvo de outro jeito.
 *
 * DOIS FORMATOS, XLSX E CSV (decisão do diretor): o modelo que o time usa já é xlsx, e mandar salvar
 * como csv era atrito criado pela ferramenta, não pelo processo. A REGRA DE LEITURA É A MESMA para os
 * dois: o que muda é só como as células chegam até aqui.
 *
 * TOLERANTE DE PROPÓSITO. O arquivo vem da folha, salvo por gente diferente em máquinas diferentes:
 *  - separador VÍRGULA ou PONTO E VÍRGULA no csv (o Excel em português usa ponto e vírgula);
 *  - com ou sem cabeçalho, e o cabeçalho não precisa ter nome fixo;
 *  - CPF com ou sem pontuação, e a ORDEM das colunas não importa.
 * A regra é uma só: numa linha, a célula com 11 dígitos é o CPF, e a primeira outra célula com
 * conteúdo é a matrícula. Isso dispensa mapa de colunas e sobrevive a planilha remontada.
 */

export interface LinhaPlanilha {
  /** CPF só com dígitos, do jeito que a chave do candidato é guardada (§A.3). */
  cpf: string | null;
  matricula: string | null;
  /** Número da linha no arquivo, para a pessoa achar o erro na planilha dela. */
  linha: number;
}

/** Só dígitos: "376.143.458-86" e "37614345886" são o mesmo CPF. */
export function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * A MESMA REGRA sobre as células, venham elas do csv ou do xlsx: numa linha, a célula com 11 dígitos
 * é o CPF, e a primeira outra com conteúdo é a matrícula. Manter isto numa função só é o que garante
 * que os dois formatos se comportem igual; duas cópias divergiriam no primeiro ajuste.
 */
function montarLinhas(linhas: string[][]): LinhaPlanilha[] {
  return linhas.map((celulas, i) => {
    const limpas = celulas.map((c) => (c ?? "").trim()).filter((c) => c !== "");
    const cpfCelula = limpas.find((c) => soDigitos(c).length === 11);
    const cpf = cpfCelula ? soDigitos(cpfCelula) : null;
    // A matrícula é a primeira célula que NÃO é o CPF. Fica como texto: matrícula com zero à
    // esquerda é comum na folha, e transformar em número comeria o zero.
    const matricula = limpas.find((c) => c !== cpfCelula) ?? null;
    return { cpf, matricula: matricula || null, linha: i + 1 };
  });
}

/**
 * XLSX: lê a PRIMEIRA planilha do arquivo, que é onde o time põe a lista.
 *
 * TODA CÉLULA VIRA TEXTO, e isso é o ponto: o Excel guarda "00123" como número 123 e o CPF como
 * número gigante, então converter na leitura preserva o zero à esquerda da matrícula e deixa o CPF
 * ser reconhecido pelos 11 dígitos. Célula de fórmula usa o RESULTADO, não a fórmula.
 */
export async function lerXlsxMatriculas(buffer: Buffer): Promise<LinhaPlanilha[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const linhas: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const celulas: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) {
        celulas.push("");
      } else if (typeof v === "object" && "result" in v) {
        celulas.push(String((v as { result?: unknown }).result ?? ""));
      } else if (typeof v === "object" && "text" in v) {
        celulas.push(String((v as { text?: unknown }).text ?? ""));
      } else {
        celulas.push(String(v));
      }
    });
    linhas.push(celulas);
  });
  return montarLinhas(linhas);
}

/** O arquivo é xlsx? Decidido pelos MAGIC BYTES (PK, zip), não pela extensão que o navegador mandou. */
export function ehXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function lerPlanilhaMatriculas(conteudo: string): LinhaPlanilha[] {
  const linhas = parse(conteudo, {
    // O Excel em português salva com ponto e vírgula; o resto do mundo, com vírgula.
    delimiter: [",", ";"],
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as string[][];

  return montarLinhas(linhas);
}

/**
 * A linha é CABEÇALHO? Só a primeira, e só quando não tem CPF e fala de CPF ou matrícula. Serve para
 * não reportar o cabeçalho como erro, que assustaria quem exportou a planilha certinha.
 */
export function ehCabecalho(l: LinhaPlanilha): boolean {
  if (l.linha !== 1 || l.cpf) return false;
  const texto = `${l.matricula ?? ""}`.toLowerCase();
  return texto.includes("cpf") || texto.includes("matr");
}
