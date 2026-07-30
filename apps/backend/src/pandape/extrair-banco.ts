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
 * §A.6, e este é o ponto sensível: o MESMO formulário traz agência e conta com dígito. Esta função lê
 * SÓ o nome do banco e ignora o resto por construção. A validação de agência, conta e titularidade
 * continua sendo da auditoria do comprovante pela IA, intocada (decisão do diretor: o banco no modal é
 * informação a mais, não substituição).
 */

/** Rótulo exato do campo no formulário do Pandapé. */
export const CAMPO_NOME_BANCO = "Nome do Banco";

/** Reconhece o formulário de conta bancária pelo nome (que traz instruções junto do rótulo). */
function ehFormularioBancario(nome: string | undefined): boolean {
  return /conta\s+banc[áa]ria/i.test((nome ?? "").trim());
}

/**
 * O nome do banco, ou `undefined` quando o payload não traz. Aparar e limitar são de propósito: o
 * valor é digitado à mão e a coluna tem teto de 120.
 */
export function extrairNomeBanco(formularios: readonly PandapeFormulario[] | undefined): string | undefined {
  for (const form of formularios ?? []) {
    if (!ehFormularioBancario(form.name)) continue;
    for (const resposta of form.answers ?? []) {
      if ((resposta.fieldName ?? "").trim().toLowerCase() !== CAMPO_NOME_BANCO.toLowerCase()) {
        continue;
      }
      const valor = (resposta.answer ?? "").trim();
      if (valor) return valor.slice(0, 120);
    }
  }
  return undefined;
}
