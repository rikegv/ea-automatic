/**
 * DOMÍNIO PURO da IMPORTAÇÃO DE CLIENTES por planilha. Sem I/O, sem Nest, sem banco.
 *
 * É a régua, linha a linha, do cadastro em massa de clientes. Fica isolada aqui, testável sem banco,
 * pelo mesmo motivo de `lojas-planilha` e do leitor único: o que decide o que entra e o que é
 * recusado não pode depender de um mock de banco para ser conferido.
 *
 * O CONTRATO do cliente hoje (medido no schema): a chave `cod_cliente` (varchar 40) e a
 * `razao_social` (varchar 200) são OBRIGATÓRIAS; `cnpj` (varchar 18) e `nome_operacao` (varchar 200)
 * são OPCIONAIS. A régua abaixo reflete exatamente isso.
 *
 * NUNCA LANÇA por linha: toda linha problemática vira uma `LinhaRecusada` com motivo legível, e a
 * importação segue. O único erro que para tudo é a falta de coluna obrigatória no cabeçalho, e esse
 * é decidido pelo SERVICE (mapa com `null` em obrigatório = recusa do arquivo inteiro), não aqui.
 *
 * §A.6: aqui só transita código de cliente, razão social, CNPJ e nome de operação. Nada é logado.
 * §A.11: nenhum motivo de recusa usa travessão.
 */

import { cnpjValido } from "../../domain/cnpj";

/** Só o que esta importação precisa da grade do leitor único. */
export interface GradeParaImportacao {
  cabecalho: string[];
  linhas: string[][];
}

/** O de/para de colunas resolvido pelo cabeçalho. `null` = coluna não encontrada. */
export interface MapaColunasCliente {
  colCodigo: number | null;
  colCnpj: number | null;
  colRazao: number | null;
  colOperacao: number | null;
}

/** Uma linha que vai entrar no banco. `cnpj` e `nomeOperacao` são opcionais (coluna opcional). */
export interface LinhaCliente {
  linha: number;
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
}

/** Uma linha que não entra, com o motivo pronto para a tela. */
export interface LinhaRecusada {
  linha: number;
  codCliente: string | null;
  motivo: string;
}

export interface ResultadoImportacao {
  aEntrar: LinhaCliente[];
  recusadas: LinhaRecusada[];
  /** Códigos que foram recusados por já existir no banco (subconjunto das recusadas). */
  jaCadastrados: string[];
  resumo: { total: number; aEntrar: number; recusadas: number };
}

const LIMITE_CODIGO = 40;

/** Normaliza um rótulo de coluna: sem acento, minúsculo, sem pontuação, espaços colapsados. */
function normalizarRotulo(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Casa cada coluna obrigatória/opcional pelo NOME NORMALIZADO do cabeçalho.
 *
 * As variações aceitas cobrem o que o time escreve na prática. A primeira coluna que casa vence, para
 * uma planilha com "Código" e "Código do Cliente" lado a lado não ficar sem decisão.
 */
export function mapearColunas(cabecalho: string[]): MapaColunasCliente {
  const normalizados = cabecalho.map(normalizarRotulo);

  const achar = (variacoes: string[]): number | null => {
    for (let i = 0; i < normalizados.length; i += 1) {
      if (variacoes.includes(normalizados[i])) return i;
    }
    return null;
  };

  return {
    colCodigo: achar(["codigo", "codigo do cliente", "cod cliente", "cod do cliente", "codigo cliente"]),
    colCnpj: achar(["cnpj"]),
    colRazao: achar(["razao social", "razao", "razaosocial"]),
    colOperacao: achar(["nome operacao", "nome da operacao", "operacao", "nome de operacao"]),
  };
}

/** Pega o valor de uma coluna (por índice), já aparado. Coluna null ou célula ausente vira "". */
function celula(linha: string[], coluna: number | null): string {
  if (coluna === null) return "";
  return (linha[coluna] ?? "").trim();
}

/**
 * Avalia a planilha inteira contra a régua do cliente. TOLERANTE: toda linha problemática vira
 * recusa com motivo, nunca exceção.
 *
 * A ORDEM das regras é a que decide o motivo: a primeira que bate manda. Código vazio vem antes de
 * tudo porque sem ele nem dá para falar de duplicata; duplicata na planilha vem antes de "já
 * cadastrado" porque é problema do arquivo, não do banco.
 */
export function avaliarImportacao(
  grade: GradeParaImportacao,
  mapa: MapaColunasCliente,
  codigosExistentes: Set<string>,
  /** O número da linha no arquivo para o índice `i` (default: i + 2, cabeçalho na linha 1). */
  numeroDaLinha: (i: number) => number = (i) => i + 2,
): ResultadoImportacao {
  const aEntrar: LinhaCliente[] = [];
  const recusadas: LinhaRecusada[] = [];
  const jaCadastrados: string[] = [];
  const vistosNaPlanilha = new Set<string>();

  for (let i = 0; i < grade.linhas.length; i += 1) {
    const linhaArquivo = grade.linhas[i];
    const numero = numeroDaLinha(i);

    const codCliente = celula(linhaArquivo, mapa.colCodigo);
    const razaoSocial = celula(linhaArquivo, mapa.colRazao);
    const cnpj = celula(linhaArquivo, mapa.colCnpj);
    const nomeOperacao = celula(linhaArquivo, mapa.colOperacao);

    if (codCliente === "") {
      recusadas.push({ linha: numero, codCliente: null, motivo: "Código vazio" });
      continue;
    }
    if (codCliente.length > LIMITE_CODIGO) {
      recusadas.push({ linha: numero, codCliente, motivo: "Código inválido" });
      continue;
    }
    if (razaoSocial === "") {
      recusadas.push({ linha: numero, codCliente, motivo: "Razão social vazia" });
      continue;
    }
    if (cnpj !== "" && !cnpjValido(cnpj)) {
      recusadas.push({ linha: numero, codCliente, motivo: "CNPJ inválido" });
      continue;
    }
    if (vistosNaPlanilha.has(codCliente)) {
      recusadas.push({ linha: numero, codCliente, motivo: "Código repetido na planilha" });
      continue;
    }
    if (codigosExistentes.has(codCliente)) {
      vistosNaPlanilha.add(codCliente);
      jaCadastrados.push(codCliente);
      recusadas.push({ linha: numero, codCliente, motivo: "Código já cadastrado" });
      continue;
    }

    vistosNaPlanilha.add(codCliente);
    aEntrar.push({
      linha: numero,
      codCliente,
      cnpj: cnpj === "" ? null : cnpj,
      razaoSocial,
      nomeOperacao: nomeOperacao === "" ? null : nomeOperacao,
    });
  }

  return {
    aEntrar,
    recusadas,
    jaCadastrados,
    resumo: {
      total: grade.linhas.length,
      aEntrar: aEntrar.length,
      recusadas: recusadas.length,
    },
  };
}
