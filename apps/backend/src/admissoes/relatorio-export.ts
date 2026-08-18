import ExcelJS from "exceljs";
import { COLUNAS_RELATORIO } from "@ea/shared-types";

/**
 * MONTAGEM DO RELATÓRIO EXPORTÁVEL EM XLSX (melhorias EAC, item 11c).
 *
 * FUNÇÃO PURA, separada do serviço, pelo mesmo motivo da leitura da planilha de matrículas: a parte
 * que tem borda aqui é a FORMATAÇÃO (data que o Excel BR lê, salário que continua sendo número,
 * matrícula com zero à esquerda, célula vazia), e isso se testa sem banco.
 *
 * §A.6: o arquivo carrega só as colunas que o consultor marcou, e o catálogo de colunas
 * (`@ea/shared-types`) já deixa banco, agência, conta e CPF do substituído fora do que é oferecido.
 */

/** Uma linha do relatório, indexada pela chave da coluna do catálogo. */
export type LinhaRelatorio = Record<string, string | number | null>;

/** "2026-08-18" no formato que o time lê e a planilha entende. Vazio vira célula vazia. */
export function fmtDataRelatorio(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

/** Data e hora (`criado_em`) no mesmo padrão, com a hora local do servidor. */
export function fmtDataHoraRelatorio(valor?: Date | string | null): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/**
 * Salário: NÚMERO, não texto. O driver devolve `numeric` como string ("2500.00"), e mandar isso para
 * a planilha como texto tira do time a soma e a média, que é justamente o que se faz com a coluna de
 * salário depois de exportar. Valor não numérico cai para célula vazia em vez de sujar a coluna.
 */
export function numeroDoSalario(valor?: string | number | null): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Nome do arquivo baixado. Data no nome para o time não sobrescrever o relatório da semana passada. */
export function nomeArquivoRelatorio(agora: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  const dia = `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
  return `relatorio-candidatos-${dia}.xlsx`;
}

/**
 * Gera o xlsx com as colunas marcadas, na ordem canônica do catálogo.
 *
 * A célula vazia fica VAZIA de propósito, e não com um marcador de texto: numa planilha, o vazio é o
 * que deixa o filtro do Excel separar "sem telefone" de "com telefone" e o que mantém a coluna de
 * salário somável. (§A.11 proíbe o travessão como marcador; nenhum texto é escrito aqui.)
 */
export async function gerarXlsxRelatorio(
  colunas: readonly string[],
  linhas: readonly LinhaRelatorio[],
): Promise<Buffer> {
  const defs = COLUNAS_RELATORIO.filter((c) => colunas.includes(c.chave));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Candidatos");

  ws.columns = defs.map((c) => ({ header: c.rotulo, key: c.chave, width: c.largura }));
  // Cabeçalho em negrito e congelado: relatório de 2.000 linhas sem isso obriga a rolar de volta ao
  // topo para lembrar qual coluna é qual.
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const linha of linhas) {
    const row = ws.addRow(
      Object.fromEntries(defs.map((c) => [c.chave, linha[c.chave] ?? null])) as LinhaRelatorio,
    );
    // Matrícula e CPF são TEXTO: os dois têm zero à esquerda na folha, e o Excel come o zero se a
    // célula for numérica. Só toca a célula quando a coluna foi marcada (chave inexistente é erro
    // no ExcelJS, não célula vazia).
    for (const chave of ["matricula", "cpf"]) {
      if (!defs.some((c) => c.chave === chave)) continue;
      const cell = row.getCell(chave);
      if (cell.value !== null && cell.value !== undefined) cell.numFmt = "@";
    }
    if (defs.some((c) => c.chave === "salario")) {
      const salario = row.getCell("salario");
      if (typeof salario.value === "number") salario.numFmt = "#,##0.00";
    }
  }
  // Filtro automático na faixa preenchida: o consultor recorta ainda mais o arquivo sem pedir nada.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: defs.length } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
