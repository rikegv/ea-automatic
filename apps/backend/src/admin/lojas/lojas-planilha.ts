import { nomeLojaNormalizado } from "../../domain/loja";
import {
  amostraParaIa,
  ehZip,
  LINHAS_DE_AMOSTRA,
  lerPlanilha,
  lerTexto,
  MAX_LINHAS_PLANILHA,
  numeroDaLinhaNoArquivo,
  type GradePlanilha,
} from "../../planilha/leitor";

/**
 * IMPORTAÇÃO DA PLANILHA DE LOJAS (cenário 1, etapa 2). FUNÇÕES PURAS, sem I/O e sem IA.
 *
 * A LEITURA DA GRADE NÃO MORA MAIS AQUI: mora em `planilha/leitor.ts`, que é o leitor ÚNICO do
 * sistema (formato por magic byte incluindo `.xls` legado, cabeçalho localizado em vez de presumido
 * na linha 1, multi aba, e RECUSA explícita do que não sabe ler em vez de devolver lixo em silêncio).
 * Este arquivo ficou com o que é de LOJA: o de/para de colunas e as regras de rejeição e colapso.
 *
 * Os nomes de leitura continuam exportados daqui (`lerCsvLojas`, `lerXlsxLojas`, `ehXlsx`) porque é
 * por eles que o serviço e as specs entram, e trocar assinatura de código validado não era o pedido.
 * Eles são casca fina sobre o leitor único: um leitor só, para não divergirem no primeiro ajuste.
 *
 * A IA NÃO ENTRA AQUI. Este arquivo aplica um mapeamento que alguém já decidiu (a IA ou o consultor,
 * dá no mesmo). É o que torna a importação determinística: o mesmo arquivo com o mesmo mapeamento dá
 * sempre o mesmo resultado.
 *
 * §A.6: nome de loja e endereço de estabelecimento não são dado pessoal, e nada daqui é logado.
 */

export { MAX_LINHAS_PLANILHA, LINHAS_DE_AMOSTRA, amostraParaIa, type GradePlanilha };

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

/**
 * O arquivo é um zip (xlsx)? Decidido pelos MAGIC BYTES (PK), não pela extensão.
 *
 * MANTIDO como nome histórico do serviço e das specs, mas ele já NÃO é o roteador de formato: quem
 * decide o que ler é `lerPlanilhaLojas`, que reconhece também o `.xls` legado (OLE2) e recusa o que
 * não é planilha. Perguntar "é xlsx?" e assumir CSV no `else` foi exatamente o defeito que deixou um
 * binário ser lido como texto.
 */
export function ehXlsx(buffer: Buffer): boolean {
  return ehZip(buffer);
}

/**
 * A PORTA DE LEITURA DA IMPORTAÇÃO DE LOJAS: formato por magic byte (xlsx, xls legado, csv/tsv),
 * cabeçalho localizado, multi aba, e RECUSA com mensagem quando o arquivo não dá grade.
 *
 * Lança `ErroLeituraPlanilha`, que o serviço traduz para 400.
 */
export async function lerPlanilhaLojas(
  buffer: Buffer,
  opcoes?: { aba?: string },
): Promise<GradePlanilha> {
  return lerPlanilha(buffer, opcoes);
}

/** XLSX pelo leitor único (casca fina, mantida pelo nome que o serviço já usa). */
export async function lerXlsxLojas(buffer: Buffer): Promise<GradePlanilha> {
  return lerPlanilha(buffer);
}

/** CSV/TSV pelo leitor único, a partir do texto já decodificado. */
export function lerCsvLojas(conteudo: string): GradePlanilha {
  return lerTexto(conteudo);
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
    // A linha COMO ELA ESTÁ NO ARQUIVO, contada a partir da linha do cabeçalho: cabeçalho na linha 1
    // dá o velho `i + 2`, e cabeçalho na linha 2 (planilha de ERP com título em cima) dá `i + 3`.
    const numeroNoArquivo = numeroDaLinhaNoArquivo(grade, i);
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
