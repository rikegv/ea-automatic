import type { PandapeFormulario } from "./pandape-api.service";

/**
 * EXTRAÇÃO DO NOME DO BANCO do payload do Pandapé (OST do banco no modal do olho). Função PURA.
 *
 * ONDE O DADO VIVE, confirmado contra a API real em 29/07/2026: `GET /v3/precollaborators/{id}` →
 * `forms[]` → o formulário "Conta Bancária (anexo de comprovação de agencia e conta obrigatório)" →
 * `answers[]` → o item com `fieldName = "Nome do Banco"`. O campo é NATIVO do payload (não foi
 * preciso inventar nada), e vem preenchido nos candidatos verificados.
 *
 * O QUE ELE É, e o rótulo importa para ninguém se enganar: TEXTO LIVRE digitado pelo candidato. Nos
 * três casos reais conferidos veio "NUBANK", "BANCO DO BRASIL" e "Nu Pagamentos S.A. - Instituição de
 * Pagamento". Não é código Febraban nem lista fechada, então serve como INFORMAÇÃO ao consultor,
 * jamais como regra de negócio ou chave de comparação.
 *
 * AGÊNCIA E CONTA passaram a ser lidas (melhorias EAC, item 8). Antes eram descartadas de propósito,
 * com o argumento de que reter dado sensível sem uso não se justifica. O uso agora existe: a regra de
 * auditoria "Os dados bancários devem coincidir com os informados no cadastro" está cadastrada desde
 * sempre e era LETRA MORTA, porque a IA recebia só nome e CPF e não tinha contra o que comparar.
 *
 * OS DOIS SÃO OPCIONAIS no Pandapé, e o próprio rótulo do campo diz "(se houver)". Ausente é caso
 * NORMAL, não divergência: numa amostra de 5 candidatos reais, 3 tinham o formulário bancário inteiro
 * em branco. Quem chama trata `undefined` como "não informado" e nunca como erro.
 *
 * §A.6: esta função só LÊ e devolve. Nada aqui loga, e o valor nunca entra em motivo de auditoria,
 * export ou superfície coletiva.
 */

/** Rótulos exatos dos campos no formulário do Pandapé, conferidos ao vivo em 17/08/2026. */
export const CAMPO_NOME_BANCO = "Nome do Banco";
export const CAMPO_AGENCIA = "Agencia com dígito(se houver)";
export const CAMPO_CONTA = "Conta bancária com dígito(se houver)";

/** Reconhece o formulário de conta bancária pelo nome (que traz instruções junto do rótulo). */
function ehFormularioBancario(nome: string | undefined): boolean {
  return /conta\s+banc[áa]ria/i.test((nome ?? "").trim());
}

/**
 * O nome do banco, ou `undefined` quando o payload não traz. Aparar e limitar são de propósito: o
 * valor é digitado à mão e a coluna tem teto de 120.
 */
export function extrairNomeBanco(formularios: readonly PandapeFormulario[] | undefined): string | undefined {
  return lerCampo(formularios, CAMPO_NOME_BANCO, 120);
}

/** Dados bancários DIGITADOS pelo candidato. Cada peça é independente: uma pode vir e a outra não. */
export interface DadosBancariosDigitados {
  banco?: string;
  agencia?: string;
  conta?: string;
}

/**
 * Lê banco, agência e conta do formulário bancário. Devolve só o que veio preenchido.
 *
 * NÃO NORMALIZA (nem tira traço, nem completa zero à esquerda, nem valida dígito). O valor é o que a
 * pessoa digitou, e é assim que ele tem de chegar à conferência: normalizar aqui esconderia
 * exatamente o erro de digitação que a comparação com o comprovante existe para achar.
 */
export function extrairDadosBancarios(
  formularios: readonly PandapeFormulario[] | undefined,
): DadosBancariosDigitados {
  const banco = lerCampo(formularios, CAMPO_NOME_BANCO, 120);
  const agencia = lerCampo(formularios, CAMPO_AGENCIA, 20);
  const conta = lerCampo(formularios, CAMPO_CONTA, 30);
  return {
    ...(banco ? { banco } : {}),
    ...(agencia ? { agencia } : {}),
    ...(conta ? { conta } : {}),
  };
}

/**
 * Valor de UM campo do formulário bancário, aparado e limitado ao teto da coluna. `undefined` quando
 * o campo não veio ou veio vazio. A comparação do rótulo é insensível a caixa porque o rótulo é
 * mantido do lado do Pandapé e já mudou de grafia antes.
 */
function lerCampo(
  formularios: readonly PandapeFormulario[] | undefined,
  rotulo: string,
  teto: number,
): string | undefined {
  for (const form of formularios ?? []) {
    if (!ehFormularioBancario(form.name)) continue;
    for (const resposta of form.answers ?? []) {
      if ((resposta.fieldName ?? "").trim().toLowerCase() !== rotulo.toLowerCase()) continue;
      const valor = (resposta.answer ?? "").trim();
      if (valor) return valor.slice(0, teto);
    }
  }
  return undefined;
}
