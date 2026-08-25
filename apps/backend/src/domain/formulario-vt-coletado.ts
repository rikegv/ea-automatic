/**
 * INTERPRETAÇÃO DO JSON IRMÃO do formulário de VT (§A.17), vindo do app externo pelo bucket.
 *
 * POR QUE ISTO É UMA FUNÇÃO PURA, fora do serviço: o dado vem de FORA (outro deploy, outro time,
 * outra linguagem) e é a única coisa nesta frente que pode chegar torta. Regra de forma misturada
 * com escrita no banco vira regra que ninguém testa sem subir Postgres, e é justamente a que
 * precisa de teste.
 *
 * A POSTURA É "OU ENTRA INTEIRO, OU NÃO ENTRA". Campo obrigatório faltando devolve `null` e o PDF é
 * arquivado do mesmo jeito, sem linha estruturada. O contrário (gravar meia linha, com endereço
 * vazio e totais zerados) produziria exatamente a mentira que a tela de Benefícios existe para não
 * contar: "Ida R$ 0,00" lido como "o candidato não gasta nada", quando o certo é "ainda não sei".
 *
 * NÃO CONFIAR NO TOTAL QUE VEIO. Os totais são RECALCULADOS a partir das conduções quando há
 * conduções: o app externo pode evoluir e divergir, e o número que a tela soma tem de ser o mesmo
 * que as linhas mostram. O total do payload só é usado quando não há condução nenhuma (não-optante).
 */

/** Valores aceitos, iguais aos enums `sentido_vt` e `cartao_vt` do banco. */
const SENTIDOS = ["IDA", "VOLTA"] as const;
const CARTOES = ["BILHETE_UNICO", "CARTAO_TOP", "OUTRO"] as const;

export type SentidoVt = (typeof SENTIDOS)[number];
export type CartaoVt = (typeof CARTOES)[number];

export interface ConducaoColetada {
  sentido: SentidoVt;
  ordem: number;
  cidade: string;
  tipoTransporte: string;
  cartao: CartaoVt;
  cartaoOutro: string | null;
  valor: string;
}

export interface FormularioVtColetado {
  optante: boolean;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
  totalIda: string;
  totalVolta: string;
  totalDia: string;
  cienteEm: Date;
  conducoes: ConducaoColetada[];
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Dinheiro como string de 2 casas (o formato que a coluna `numeric` recebe sem perder centavo). */
function dinheiro(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999) return null;
  return n.toFixed(2);
}

function conducao(bruto: unknown, indice: number): ConducaoColetada | null {
  if (!bruto || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;

  const sentido = SENTIDOS.find((s) => s === c.sentido);
  const cartao = CARTOES.find((x) => x === c.cartao);
  const valor = dinheiro(c.valor);
  if (!sentido || !cartao || valor === null) return null;

  return {
    sentido,
    // A ordem manda a leitura da linha ("primeira condução, depois a segunda"). Se vier ausente ou
    // torta, o índice do array preserva a sequência em que o candidato preencheu.
    ordem: Number.isInteger(c.ordem) && (c.ordem as number) > 0 ? (c.ordem as number) : indice + 1,
    cidade: texto(c.cidade, 120) ?? "não informado",
    tipoTransporte: texto(c.tipoTransporte, 120) ?? "não informado",
    cartao,
    // Só faz sentido no cartão OUTRO; nos demais é ruído que apareceria na tela.
    cartaoOutro: cartao === "OUTRO" ? texto(c.cartaoOutro, 60) : null,
    valor,
  };
}

function somar(conducoes: ConducaoColetada[], sentido: SentidoVt): string {
  return conducoes
    .filter((c) => c.sentido === sentido)
    .reduce((total, c) => total + Number(c.valor), 0)
    .toFixed(2);
}

/**
 * Converte o JSON cru no que a tabela `formularios_vt` espera, ou `null` se o payload não serve.
 *
 * `cienteEm` é obrigatório de propósito: ele é a trilha do aceite dos avisos, no mesmo espírito do
 * aceite de dupla correção (§A.6). Formulário sem o carimbo do aceite não é formulário completo, e
 * inventar `now()` aqui seria forjar uma declaração que o candidato pode não ter dado.
 */
export function interpretarFormularioVt(bruto: unknown): FormularioVtColetado | null {
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;

  if (typeof d.optante !== "boolean") return null;

  const cep = (typeof d.cep === "string" ? d.cep : "").replace(/\D/g, "");
  const logradouro = texto(d.logradouro, 200);
  const numero = texto(d.numero, 20);
  const bairro = texto(d.bairro, 120);
  const cidade = texto(d.cidade, 120);
  const uf = texto(d.uf, 2);
  if (cep.length !== 8 || !logradouro || !numero || !bairro || !cidade || !uf) return null;

  const cienteEm = typeof d.cienteEm === "string" ? new Date(d.cienteEm) : null;
  if (!cienteEm || Number.isNaN(cienteEm.getTime())) return null;

  // Condução torta é DESCARTADA uma a uma, e não derruba o formulário: perder uma linha do
  // itinerário é menos grave que perder o endereço e o aceite inteiros.
  const conducoes = Array.isArray(d.conducoes)
    ? d.conducoes.map(conducao).filter((c): c is ConducaoColetada => c !== null)
    : [];

  const temConducoes = conducoes.length > 0;
  const totalIda = temConducoes ? somar(conducoes, "IDA") : (dinheiro(d.totalIda) ?? "0.00");
  const totalVolta = temConducoes ? somar(conducoes, "VOLTA") : (dinheiro(d.totalVolta) ?? "0.00");
  const totalDia = temConducoes
    ? (Number(totalIda) + Number(totalVolta)).toFixed(2)
    : (dinheiro(d.totalDia) ?? "0.00");

  return {
    optante: d.optante,
    cep,
    logradouro,
    numero,
    complemento: texto(d.complemento, 100),
    bairro,
    cidade,
    uf: uf.toUpperCase(),
    totalIda,
    totalVolta,
    totalDia,
    cienteEm,
    conducoes,
  };
}

/**
 * Resumo de UMA LINHA para a coluna VT da tela de Benefícios (§ Item 2 da OST).
 *
 * O CARTÃO É O PREDOMINANTE, não uma lista: a linha tem de caber em uma linha. Quando o candidato
 * usa mais de um cartão, o rótulo diz isso ("2 cartões") em vez de escolher um e esconder o outro,
 * que faria a tela afirmar algo falso sobre o vale que a pessoa recebe.
 */
export function rotuloCartao(conducoes: ConducaoColetada[]): string | null {
  const nomes = new Set(
    conducoes.map((c) => (c.cartao === "OUTRO" ? (c.cartaoOutro ?? "Outro") : ROTULO[c.cartao])),
  );
  if (nomes.size === 0) return null;
  if (nomes.size === 1) return [...nomes][0];
  return `${nomes.size} cartões`;
}

const ROTULO: Record<CartaoVt, string> = {
  BILHETE_UNICO: "Bilhete Único",
  CARTAO_TOP: "Cartão TOP",
  OUTRO: "Outro",
};
