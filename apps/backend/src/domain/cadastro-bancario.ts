/**
 * CADASTRO BANCÁRIO PARA CONFERÊNCIA (melhorias EAC, item 8). Domínio PURO: sem banco, sem rede.
 *
 * POR QUE EXISTE. A régua de auditoria do comprovante bancário tem, cadastrada desde sempre, a regra
 * "Os dados bancários devem coincidir com os informados no cadastro". Ela era LETRA MORTA: a IA recebe
 * `{ nome, cpf }` e a lista de regras, e nada mais, então estava sendo instruída a comparar contra um
 * dado que nunca chegava até ela. Agência e conta chegam no payload do Pandapé desde sempre e eram
 * descartadas na entrada. Este módulo decide QUANDO enviar esse cadastro e O QUE enviar.
 *
 * DUAS TRAVAS, e as duas são de minimização (§A.6):
 *
 *  1. **Só para o tipo que precisa.** O cadastro bancário acompanha a auditoria do COMPROVANTE
 *     BANCÁRIO e de mais nenhum tipo. Mandar agência e conta junto de um RG ou de um comprovante de
 *     residência seria expor dado sensível a uma chamada que não tem o que fazer com ele.
 *  2. **Só o que existe.** Campo vazio não vira string vazia no prompt: ele simplesmente não vai. É o
 *     que impede a IA de ler "agência: " e concluir divergência, quando o certo é não ter opinião.
 *
 * AUSENTE NÃO É DIVERGÊNCIA, e este é o ponto que mais importa acertar. Os três campos são OPCIONAIS
 * no Pandapé (o rótulo lá diz "se houver") e ficam em branco com frequência: numa amostra de cinco
 * candidatos reais, três tinham o formulário bancário inteiro vazio. Documento sem cadastro para
 * comparar é auditado exatamente como era antes desta entrega.
 */

/** Código do tipo de documento que recebe o cadastro bancário. Único, de propósito. */
export const TIPO_COMPROVANTE_BANCARIO = "DADOS_BANCARIOS";

/** O que a IA recebe para conferir. Cada peça é opcional e só viaja quando preenchida. */
export interface CadastroBancario {
  banco?: string;
  agencia?: string;
  conta?: string;
}

/**
 * O cadastro bancário a enviar junto da auditoria deste tipo de documento, ou `undefined` quando não
 * há o que enviar (tipo diferente, ou candidato sem nenhum dado bancário digitado).
 *
 * `undefined` e objeto vazio são a MESMA coisa para quem chama, e devolver `undefined` nos dois casos
 * é deliberado: evita que o chamador monte um bloco de prompt vazio.
 */
export function cadastroBancarioParaAuditoria(
  tipoDocumentoCodigo: string,
  digitado: CadastroBancario,
): CadastroBancario | undefined {
  if ((tipoDocumentoCodigo ?? "").trim().toUpperCase() !== TIPO_COMPROVANTE_BANCARIO) {
    return undefined;
  }
  const cadastro: CadastroBancario = {
    ...(limpar(digitado.banco) ? { banco: limpar(digitado.banco)! } : {}),
    ...(limpar(digitado.agencia) ? { agencia: limpar(digitado.agencia)! } : {}),
    ...(limpar(digitado.conta) ? { conta: limpar(digitado.conta)! } : {}),
  };
  return Object.keys(cadastro).length > 0 ? cadastro : undefined;
}

/**
 * Apara as pontas e devolve `undefined` para o que ficou vazio.
 *
 * Apara SÓ as pontas, de propósito: o miolo do valor (traço, ponto, zero à esquerda) é exatamente o
 * que a comparação com o comprovante precisa enxergar. Normalizar aqui esconderia o erro de digitação
 * que esta frente existe para achar.
 */
function limpar(valor: string | undefined): string | undefined {
  const v = (valor ?? "").trim();
  return v || undefined;
}

/**
 * Rótulos dos campos em que a IA apontou divergência, filtrados para o que o EA reconhece.
 *
 * POR QUE FILTRAR. A lista vem de um modelo de linguagem, então pode trazer rótulo inventado, vazio ou
 * repetido. O que sai daqui alimenta aviso na tela, e aviso que diz "divergência em titular_conta_2"
 * não ajuda ninguém. Fora da lista conhecida é descartado em silêncio: a auditoria não pode falhar por
 * causa de um rótulo estranho.
 *
 * §A.6: são RÓTULOS, nunca valores. "agencia" pode ser guardado e exibido; o número, não.
 */
export const CAMPOS_BANCARIOS = ["banco", "agencia", "conta"] as const;
export type CampoBancario = (typeof CAMPOS_BANCARIOS)[number];

export function divergenciasReconhecidas(bruto: readonly string[] | undefined): CampoBancario[] {
  const validos = new Set<string>(CAMPOS_BANCARIOS);
  const vistos = new Set<CampoBancario>();
  for (const item of bruto ?? []) {
    const chave = (item ?? "").trim().toLowerCase();
    if (validos.has(chave)) vistos.add(chave as CampoBancario);
  }
  // Ordem estável (a do cadastro), porque a saída alimenta texto de tela e comparação em teste.
  return CAMPOS_BANCARIOS.filter((c) => vistos.has(c));
}

/**
 * Texto do aviso de divergência, para a tela. `null` quando não há divergência.
 *
 * §A.11: sem travessão. §A.6: diz QUAL campo diverge, nunca o valor de nenhum lado.
 */
export function avisoDivergenciaBancaria(campos: readonly CampoBancario[]): string | null {
  if (campos.length === 0) return null;
  const rotulos: Record<CampoBancario, string> = {
    banco: "banco",
    agencia: "agência",
    conta: "conta",
  };
  const lista = campos.map((c) => rotulos[c]);
  const alvo =
    lista.length === 1
      ? lista[0]
      : `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
  return (
    `Divergência bancária: ${alvo} do comprovante não confere com o que foi digitado no cadastro. ` +
    "Confira antes de seguir. O documento continua válido e nada foi bloqueado."
  );
}
