import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { nomeLojaNormalizado } from "../../domain/loja";

/**
 * LEITURA DA PLANILHA DE LOJAS (cenário 1, etapa 2). FUNÇÕES PURAS, sem I/O e sem IA.
 *
 * REUSA O PRECEDENTE `matriculas-import.ts` no que serve: XLSX e CSV, formato decidido pelos MAGIC
 * BYTES e não pela extensão (extensão é o que o navegador disse; magic byte é o que o arquivo é), e
 * tolerância a separador vírgula ou ponto e vírgula.
 *
 * ONDE ELA DIFERE, e a diferença é consciente: a de matrículas DISPENSA cabeçalho, porque a célula
 * com 11 dígitos se identifica sozinha como CPF. Aqui nome, endereço e código são os três texto
 * livre, e sem cabeçalho não há como saber qual é qual. Por isso a primeira linha é sempre tratada
 * como cabeçalho, e é justamente ela que a IA lê para dizer qual coluna é o quê.
 *
 * A IA NÃO ENTRA AQUI. Este arquivo lê a grade e aplica um mapeamento que alguém já decidiu (a IA ou
 * o consultor, dá no mesmo). É o que torna a importação determinística: o mesmo arquivo com o mesmo
 * mapeamento dá sempre o mesmo resultado.
 *
 * §A.6: nome de loja e endereço de estabelecimento não são dado pessoal, e nada daqui é logado.
 */

/** Teto de linhas por arquivo (Q7). Cobre o maior caso real (60 lojas) com folga enorme. */
export const MAX_LINHAS_PLANILHA = 2000;

/** Quantas linhas de exemplo vão para a IA. O que decide o mapeamento é o cabeçalho; a amostra confirma. */
export const LINHAS_DE_AMOSTRA = 15;

export interface GradePlanilha {
  /** Primeira linha do arquivo, sempre tratada como cabeçalho. */
  cabecalho: string[];
  /** As demais linhas, já limitadas ao teto. */
  linhas: string[][];
  /** Quantas linhas o arquivo tinha além do teto (0 quando coube inteiro). */
  descartadasPorTeto: number;
}

/** O mapeamento de colunas, venha da IA ou da mão do consultor. Índices base 0, `null` = não existe. */
export interface MapeamentoColunas {
  colunaNome: number | null;
  colunaEndereco: number | null;
  colunaCodigo: number | null;
}

export interface LinhaLoja {
  /** Número da linha NO ARQUIVO (base 1, contando o cabeçalho), para a pessoa achar o erro na planilha dela. */
  linha: number;
  nome: string;
  endereco: string | null;
  codigoExterno: string | null;
}

export interface LinhaRejeitada {
  linha: number;
  motivo: string;
}

/** O arquivo é xlsx? Decidido pelos MAGIC BYTES (PK, zip), não pela extensão. */
export function ehXlsx(buffer: Buffer): boolean {
  return buffer.length > 1 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/** Normaliza uma grade crua: apara as células e descarta linhas totalmente vazias. */
function montarGrade(cruas: string[][]): GradePlanilha {
  const limpas = cruas
    .map((linha) => linha.map((c) => (c ?? "").trim()))
    .filter((linha) => linha.some((c) => c !== ""));
  const [cabecalho = [], ...resto] = limpas;
  return {
    cabecalho,
    linhas: resto.slice(0, MAX_LINHAS_PLANILHA),
    descartadasPorTeto: Math.max(0, resto.length - MAX_LINHAS_PLANILHA),
  };
}

/**
 * XLSX: lê a PRIMEIRA planilha do arquivo. TODA CÉLULA VIRA TEXTO, como na de matrículas, porque o
 * Excel guarda "0012" como número 12 e comeria o zero à esquerda de um código de loja.
 */
export async function lerXlsxLojas(buffer: Buffer): Promise<GradePlanilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { cabecalho: [], linhas: [], descartadasPorTeto: 0 };
  const cruas: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const celulas: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v === null || v === undefined) celulas.push("");
      else if (typeof v === "object" && "result" in v)
        celulas.push(String((v as { result?: unknown }).result ?? ""));
      else if (typeof v === "object" && "text" in v)
        celulas.push(String((v as { text?: unknown }).text ?? ""));
      else celulas.push(String(v));
    });
    cruas.push(celulas);
  });
  return montarGrade(cruas);
}

/**
 * O separador do arquivo, DETECTADO pela primeira linha, e não aceito às cegas.
 *
 * A importação de matrículas passa `delimiter: [",", ";"]`, aceitando os dois ao mesmo tempo, e lá
 * isso é inofensivo: CPF e matrícula não têm vírgula. AQUI QUEBRA, e o teste pegou: endereço tem
 * vírgula quase sempre ("Av. Roque Petroni, 1089"), então aceitar os dois parte o endereço no meio e
 * empurra o resto para a coluna seguinte, silenciosamente.
 *
 * A regra é contar na PRIMEIRA linha: o separador de verdade aparece nela tantas vezes quantas forem
 * as colunas menos um, e o outro caractere, quando aparece, está dentro de um texto.
 */
export function detectarSeparador(conteudo: string): "," | ";" {
  const primeira = conteudo.split(/\r?\n/, 1)[0] ?? "";
  const pontoEVirgula = (primeira.match(/;/g) ?? []).length;
  const virgula = (primeira.match(/,/g) ?? []).length;
  // Empate ou ausência dos dois cai na vírgula, que é o padrão do CSV.
  return pontoEVirgula > virgula ? ";" : ",";
}

/** CSV: tolerante a aspas e BOM como a de matrículas, com o separador DETECTADO. */
export function lerCsvLojas(conteudo: string): GradePlanilha {
  const cruas = parse(conteudo, {
    delimiter: detectarSeparador(conteudo),
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as string[][];
  return montarGrade(cruas);
}

/** A amostra que vai para a IA: poucas linhas, o suficiente para confirmar o que o cabeçalho diz. */
export function amostraParaIa(grade: GradePlanilha): string[][] {
  return grade.linhas.slice(0, LINHAS_DE_AMOSTRA);
}

/**
 * APLICA o mapeamento na grade inteira. É aqui que a importação vira determinística: a IA já disse
 * (ou o consultor escolheu) quais colunas são o quê, e daqui para frente é código.
 *
 * REGRAS, todas decididas com o diretor:
 *  - nome vazio é REJEITADO, com o número da linha no arquivo;
 *  - nome repetido DENTRO da planilha colapsa em um, e a prévia mostra quantas linhas colapsaram;
 *  - endereço e código são opcionais, e vazio vira `null` em vez de string vazia.
 *
 * A comparação de repetido usa `nomeLojaNormalizado`, a MESMA do índice único do banco: o que a
 * planilha considera repetido e o que o banco considera duplicado são, por construção, a mesma coisa.
 */
export function aplicarMapeamento(
  grade: GradePlanilha,
  mapa: MapeamentoColunas,
): { linhas: LinhaLoja[]; rejeitadas: LinhaRejeitada[]; colapsadas: number } {
  const linhas: LinhaLoja[] = [];
  const rejeitadas: LinhaRejeitada[] = [];
  const vistos = new Set<string>();
  let colapsadas = 0;

  if (mapa.colunaNome === null) {
    return { linhas: [], rejeitadas: [], colapsadas: 0 };
  }

  grade.linhas.forEach((celulas, i) => {
    // +2: a linha 1 do arquivo é o cabeçalho, e o índice é base 0.
    const numeroNoArquivo = i + 2;
    const valor = (idx: number | null) =>
      idx === null ? "" : ((celulas[idx] ?? "") as string).trim();

    const nome = valor(mapa.colunaNome);
    if (!nome) {
      rejeitadas.push({ linha: numeroNoArquivo, motivo: "Linha sem nome de loja." });
      return;
    }

    const chave = nomeLojaNormalizado(nome);
    if (vistos.has(chave)) {
      colapsadas += 1;
      return;
    }
    vistos.add(chave);

    linhas.push({
      linha: numeroNoArquivo,
      nome,
      endereco: valor(mapa.colunaEndereco) || null,
      codigoExterno: valor(mapa.colunaCodigo) || null,
    });
  });

  return { linhas, rejeitadas, colapsadas };
}
