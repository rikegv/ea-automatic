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
import { VINCULO_OPCOES } from "./vinculo-opcoes";

/** Só o que esta importação precisa da grade do leitor único. */
export interface GradeParaImportacao {
  cabecalho: string[];
  linhas: string[][];
}

/**
 * O de/para de colunas resolvido pelo cabeçalho. `null` = coluna não encontrada.
 *
 * `colContrato`/`colFilial` são OPCIONAIS no tipo (e não só no arquivo): planilhas antigas e os
 * testes que montam o mapa à mão continuam válidos sem as duas colunas, e `avaliarImportacao` lê
 * `?? null`. A coluna de contrato traz o tipo (Temporário/Terceiro/Estágio/Interno/FOPAG) e a de
 * filial o número (só Temporário/Terceiro variam o CNPJ por filial).
 */
export interface MapaColunasCliente {
  colCodigo: number | null;
  colCnpj: number | null;
  colRazao: number | null;
  colOperacao: number | null;
  colContrato?: number | null;
  colFilial?: number | null;
}

/**
 * Uma linha que vai entrar no banco. `cnpj` e `nomeOperacao` são opcionais (coluna opcional).
 *
 * O CONTRATO resolvido vive em `vinculoOpcaoId` (id do catálogo `VINCULO_OPCOES`, `null` = sem
 * contrato na linha). `contratoRotulo` é só para a tela mostrar o que foi entendido. `contrato` e
 * `filial` são o texto CRU da planilha, devolvidos para o confirmar reconstruir a grade e
 * re-resolver no servidor (não se confia no id resolvido do cliente).
 */
export interface LinhaCliente {
  linha: number;
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
  contrato: string | null;
  filial: string | null;
  vinculoOpcaoId: string | null;
  contratoRotulo: string | null;
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
    colContrato: achar(["contrato", "tipo de contrato", "tipo contrato", "vinculo", "tipo de servico"]),
    colFilial: achar(["filial", "filial do contrato", "cnpj filial"]),
  };
}

/** tipo_servico do vínculo -> rótulo curto para a tela (§A.24 title case, §A.11 sem travessão). */
const ROTULO_TIPO: Record<string, string> = {
  TEMPORARIO: "Temporário",
  TERCEIRO: "Terceirizado",
  ESTAGIO: "Estágio",
  INTERNO: "Interno",
  FOPAG: "Fopag",
};

/**
 * ─ RESOLVE O CONTRATO DA PLANILHA (tipo + filial) NUMA OPÇÃO DO CATÁLOGO ──────────────────────────
 *
 * Régua PURA, sem banco: o texto que o time escreve vira uma opção de `VINCULO_OPCOES` (o mesmo
 * catálogo do seletor da tela), que carrega empresa Soulan, filial e, por consequência, o CNPJ.
 *
 *  - contrato VAZIO: linha sem contrato, válida (o cliente entra sem vínculo). `{ opcaoId: null }`.
 *  - Temporário/Terceiro: o CNPJ muda por FILIAL, então a filial é obrigatória e precisa existir no
 *    catálogo (ex.: Terceiro filial 4 existe, filial 9 não).
 *  - Estágio e FOPAG: CNPJ fixo, filial ignorada.
 *  - Interno: ADM por padrão; NEAT quando o texto do contrato disser "neat" (decisão do diretor).
 *  - contrato desconhecido: erro legível, a linha é recusada (nunca lança).
 */
export function resolverVinculoDaPlanilha(
  contrato: string,
  filial: string,
): { opcaoId: string | null; rotulo: string | null; erro: string | null } {
  const bruto = (contrato ?? "").trim();
  if (bruto === "") return { opcaoId: null, rotulo: null, erro: null };
  const n = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const fil = (filial ?? "").trim();

  let tipo: string | null = null;
  if (n.includes("tempor")) tipo = "TEMPORARIO";
  else if (n.includes("terceir") || n === "terc") tipo = "TERCEIRO";
  else if (n.includes("estag")) tipo = "ESTAGIO";
  else if (n.includes("intern")) tipo = "INTERNO";
  else if (n.includes("fopag")) tipo = "FOPAG";
  if (tipo === null) return { opcaoId: null, rotulo: null, erro: "Contrato inválido" };

  let opcaoId: string | null = null;
  if (tipo === "TEMPORARIO" || tipo === "TERCEIRO") {
    if (fil === "") return { opcaoId: null, rotulo: null, erro: `Informe a filial do contrato ${ROTULO_TIPO[tipo]}` };
    opcaoId = `${tipo === "TEMPORARIO" ? "TEMP" : "TERC"}_F${fil}`;
  } else if (tipo === "ESTAGIO") {
    opcaoId = "ESTAGIO";
  } else if (tipo === "INTERNO") {
    opcaoId = n.includes("neat") ? "INTERNO_NEAT" : "INTERNO_ADM";
  } else {
    opcaoId = "FOPAG";
  }

  if (!VINCULO_OPCOES.some((o) => o.id === opcaoId)) {
    return { opcaoId: null, rotulo: null, erro: `Filial inválida para o contrato ${ROTULO_TIPO[tipo]}` };
  }

  // Rótulo curto e limpo para a tela, derivado de tipo + filial (não do label do catálogo, que leva
  // CNPJ e travessão). Interno distingue a entidade para o time conferir.
  let rotulo = ROTULO_TIPO[tipo];
  if (tipo === "TEMPORARIO" || tipo === "TERCEIRO") rotulo = `${ROTULO_TIPO[tipo]}, filial ${fil}`;
  else if (tipo === "INTERNO") rotulo = opcaoId === "INTERNO_NEAT" ? "Interno (NEAT)" : "Interno (ADM)";
  return { opcaoId, rotulo, erro: null };
}

/** tipo_servico de uma opção do catálogo (para a régua de duplicata por contrato). */
function tipoServicoDaOpcao(opcaoId: string | null): string | null {
  if (opcaoId === null) return null;
  return VINCULO_OPCOES.find((o) => o.id === opcaoId)?.tipoServico ?? null;
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
  /**
   * Contratos (tipo_servico) que cada cliente JÁ tem no banco. Default vazio: sem o mapa, nenhum
   * cliente "já tem" contrato, e a régua cai no comportamento antigo (código existente = recusa).
   * Com o mapa, código existente + contrato de OUTRO tipo deixa de ser recusa e passa a SOMAR o
   * contrato (coerente com o `create` do item "mesmo código, 2 contratos").
   */
  contratosExistentes: Map<string, Set<string>> = new Map(),
): ResultadoImportacao {
  const aEntrar: LinhaCliente[] = [];
  const recusadas: LinhaRecusada[] = [];
  const jaCadastrados: string[] = [];
  // Chave de duplicata na planilha = código + tipo de contrato. O mesmo código com DOIS contratos
  // diferentes é legítimo (soma os dois); o mesmo código com o MESMO contrato é repetição.
  const vistosNaPlanilha = new Set<string>();

  for (let i = 0; i < grade.linhas.length; i += 1) {
    const linhaArquivo = grade.linhas[i];
    const numero = numeroDaLinha(i);

    const codCliente = celula(linhaArquivo, mapa.colCodigo);
    const razaoSocial = celula(linhaArquivo, mapa.colRazao);
    const cnpj = celula(linhaArquivo, mapa.colCnpj);
    const nomeOperacao = celula(linhaArquivo, mapa.colOperacao);
    const contratoBruto = celula(linhaArquivo, mapa.colContrato ?? null);
    const filialBruta = celula(linhaArquivo, mapa.colFilial ?? null);

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

    // Contrato (opcional): resolve tipo + filial numa opção do catálogo. Texto inválido recusa a
    // linha, sem lançar.
    const vinc = resolverVinculoDaPlanilha(contratoBruto, filialBruta);
    if (vinc.erro) {
      recusadas.push({ linha: numero, codCliente, motivo: vinc.erro });
      continue;
    }
    const tipo = tipoServicoDaOpcao(vinc.opcaoId);
    const chaveDup = `${codCliente}|${tipo ?? ""}`;

    if (vistosNaPlanilha.has(chaveDup)) {
      recusadas.push({
        linha: numero,
        codCliente,
        motivo: tipo ? "Código e contrato repetidos na planilha" : "Código repetido na planilha",
      });
      continue;
    }

    if (codigosExistentes.has(codCliente)) {
      // Código já existe. Sem contrato, é duplicata pura: recusa como antes. Com contrato, só recusa
      // se o cliente JÁ tiver aquele tipo; se for de outro tipo, ENTRA para somar o contrato.
      if (tipo === null) {
        vistosNaPlanilha.add(chaveDup);
        jaCadastrados.push(codCliente);
        recusadas.push({ linha: numero, codCliente, motivo: "Código já cadastrado" });
        continue;
      }
      if ((contratosExistentes.get(codCliente) ?? new Set()).has(tipo)) {
        vistosNaPlanilha.add(chaveDup);
        recusadas.push({ linha: numero, codCliente, motivo: `Cliente já tem o contrato ${vinc.rotulo}` });
        continue;
      }
    }

    vistosNaPlanilha.add(chaveDup);
    aEntrar.push({
      linha: numero,
      codCliente,
      cnpj: cnpj === "" ? null : cnpj,
      razaoSocial,
      nomeOperacao: nomeOperacao === "" ? null : nomeOperacao,
      contrato: contratoBruto === "" ? null : contratoBruto,
      filial: filialBruta === "" ? null : filialBruta,
      vinculoOpcaoId: vinc.opcaoId,
      contratoRotulo: vinc.rotulo,
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
