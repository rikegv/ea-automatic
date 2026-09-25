import type { MapaColunasCandidato } from "@ea/shared-types";
import {
  amostraParaIa,
  assinaturaDoCabecalho,
  ErroLeituraPlanilha,
  lerPlanilha,
  MAX_LINHAS_PLANILHA,
  numeroDaLinhaNoArquivo,
  type GradePlanilha,
  type OpcoesLeitura,
} from "../../planilha/leitor";

/**
 * LEITURA DA PLANILHA DE CANDIDATOS (Central de Candidatos, importação por planilha).
 *
 * REUSA O LEITOR ÚNICO (`planilha/leitor.ts`), e não é atalho: ele é função pura de grade (formato por
 * MAGIC BYTE incluindo o `.xls` legado, toda célula vira texto para não comer zero à esquerda,
 * cabeçalho LOCALIZADO em vez de presumido na linha 1, multi aba, separador e encoding farejados, teto
 * de linhas, e RECUSA explícita do que não é planilha). Duplicar a grade só criaria dois leitores para
 * divergirem no primeiro ajuste. O que é PRÓPRIO de candidato é só o de/para de colunas, e é o que
 * este arquivo acrescenta.
 *
 * O QUE MUDOU AQUI, e foi a base REAL do diretor que provou: o roteamento era um ternário binário
 * ("é xlsx? senão é CSV"), então o `.xls` legado (OLE2, magic `d0cf11e0`) caiu no `toString("utf8")` e
 * virou uma coluna de mojibake com uma contagem de linhas inventada, SEM NENHUM ERRO. Agora formato
 * desconhecido é recusado com mensagem, e nunca mais lido como texto.
 *
 * A IA NÃO ENTRA AQUI. Este arquivo lê a grade e aplica um mapeamento que alguém já decidiu (a IA na
 * prévia ou o time na correção). É o que torna a importação determinística: o mesmo arquivo com o
 * mesmo mapa dá sempre o mesmo resultado.
 *
 * §A.6: nada daqui é logado, e a AMOSTRA que vai à IA é limitada; a planilha inteira nunca sai do
 * backend.
 */

export {
  MAX_LINHAS_PLANILHA,
  amostraParaIa,
  assinaturaDoCabecalho,
  ErroLeituraPlanilha,
  type GradePlanilha,
  type OpcoesLeitura,
};

/**
 * A ASSINATURA DA GRADE LIDA: aba + cabeçalho, do jeito que a leitura entendeu.
 *
 * Existe para que a prévia e o aplicar calculem a MESMA coisa a partir da MESMA fonte (a grade), e
 * não cada um a partir do que tinha em mão. Duas contas diferentes divergiriam no primeiro ajuste, e
 * uma divergência aqui vira recusa de importação legítima.
 */
export function assinaturaDaGrade(grade: GradePlanilha): string {
  return assinaturaDoCabecalho(grade.cabecalho, grade.abaUsada);
}

/**
 * Lê a grade da planilha: xlsx, `.xls` legado e csv/tsv, formato pelos MAGIC BYTES e não pela
 * extensão. `aba` é opcional e serve para o time TROCAR quando a escolha automática pegou a aba
 * errada (a base real vem com `Candidatos` e `Carimbos` no mesmo arquivo).
 *
 * LANÇA `ErroLeituraPlanilha` quando o arquivo não dá grade. Não existe mais "devolve o que der".
 */
export async function lerGradeCandidatos(
  arquivo: Buffer,
  opcoes?: OpcoesLeitura,
): Promise<GradePlanilha> {
  return lerPlanilha(arquivo, opcoes);
}

/** Uma linha crua da planilha, com os campos JÁ separados pelo de/para, mas ainda sem higiene. */
export interface LinhaCandidatoBruta {
  /** Número da linha NO ARQUIVO (base 1, contando o cabeçalho), para a pessoa achar o erro na dela. */
  linha: number;
  nome: string;
  cpf: string;
  email: string;
  telefone: string;
  nascimento: string;
  cidade: string;
  uf: string;
}

/**
 * APLICA o de/para na grade inteira e devolve UMA entrada por linha de dado (inclusive as sem nome:
 * quem decide o que é INVALIDO é o serviço, que precisa do número da linha para o relatório).
 *
 * Coluna não mapeada (`null`) ou índice fora da linha vira string vazia, nunca `undefined`: o serviço
 * trata ausência com a mesma régua, venha ela de coluna inexistente ou de célula em branco.
 */
export function extrairLinhas(
  grade: GradePlanilha,
  mapa: MapaColunasCandidato,
): LinhaCandidatoBruta[] {
  const valor = (celulas: string[], idx: number | null): string =>
    idx === null || idx < 0 ? "" : ((celulas[idx] ?? "") as string).trim();

  return grade.linhas.map((celulas, i) => ({
    // A linha COMO ELA ESTÁ NO ARQUIVO, contada a partir da linha do cabeçalho: cabeçalho na linha 1
    // dá o velho `i + 2`, e cabeçalho na linha 2 (base de ERP com título em cima) dá `i + 3`. O número
    // que o relatório mostra tem de ser o que a pessoa acha na planilha dela.
    linha: numeroDaLinhaNoArquivo(grade, i),
    nome: valor(celulas, mapa.nome),
    cpf: valor(celulas, mapa.cpf),
    email: valor(celulas, mapa.email),
    telefone: valor(celulas, mapa.telefone),
    nascimento: valor(celulas, mapa.nascimento),
    cidade: valor(celulas, mapa.cidade),
    uf: valor(celulas, mapa.uf),
  }));
}
