import { isValidCpf, normalizeCpf } from "@ea/shared-types";

/**
 * EXTRAÇÃO DO CPF DO FORMULÁRIO do processo admissional do Pandapé. Função PURA.
 *
 * POR QUE ELA EXISTE, com o caso que a originou (Carlos Eduardo, idPreCollaborator 406998, 06/08/2026):
 * o candidato preencheu o CPF errado no CADASTRO dele, o time corrigiu no FORMULÁRIO do processo
 * admissional, e os dois campos não conversam. O `Match.cpf` (que o sync lê) continuou 00000000000, o
 * job falhou cinco vezes com "CPF inválido" e o candidato nunca entrou na esteira, embora o CPF certo
 * estivesse no payload o tempo todo. Não há como corrigir onde ele preencheu errado, então o EA passa
 * a ter para onde olhar quando o cadastro vem inválido.
 *
 * ONDE O DADO VIVE, confirmado contra a API real em 06/08/2026: `GET /v1/PreCollaborator/Get` →
 * `answers[]` → o item com `fieldName = "Número do CPF"`. É uma lista PLANA na raiz do
 * pré-colaborador, diferente do `forms[].answers[]` da v3 que o `extrair-banco` percorre.
 *
 * O QUE ELA É: um FALLBACK, nunca a fonte primária. Quem manda segue sendo o cadastro do candidato
 * (via Match); este valor só é consultado quando aquele não fecha o dígito. E só é aceito se ELE
 * fechar o dígito: texto digitado à mão não vira chave de identidade sem prova.
 *
 * §A.6: o CPF é chave técnica e NUNCA é logado. Esta função não loga nada, por construção, e devolve
 * o valor normalizado para quem chama gravar, jamais para imprimir.
 */

/** Rótulo exato do campo no formulário do Pandapé. */
export const CAMPO_NUMERO_CPF = "Número do CPF";

/** O formato de cada item de `answers[]` na v1, verificado ao vivo. */
interface RespostaPreCollaborator {
  answer?: unknown;
  fieldName?: unknown;
}

/** Comparação de rótulo tolerante a caixa e a espaço sobrando, igual à do `extrair-banco`. */
function ehCampoDoCpf(fieldName: unknown): boolean {
  return (
    typeof fieldName === "string" &&
    fieldName.trim().toLowerCase() === CAMPO_NUMERO_CPF.toLowerCase()
  );
}

/**
 * O CPF do formulário NORMALIZADO (11 dígitos, sem máscara), ou `undefined` quando o payload não traz
 * ou traz algo que não é CPF válido.
 *
 * O tipo de entrada é `unknown[]` porque é o que a interface do pré-colaborador declara: a v1 devolve
 * respostas de formulário livre, então cada item é estreitado aqui em vez de confiar num contrato que
 * a API não garante. Item fora do formato é ignorado, nunca derruba o sync.
 */
export function extrairCpfDoFormulario(answers: readonly unknown[] | undefined): string | undefined {
  for (const item of answers ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const resposta = item as RespostaPreCollaborator;
    if (!ehCampoDoCpf(resposta.fieldName)) continue;
    if (typeof resposta.answer !== "string") continue;

    // Tira a máscara ANTES de validar: o candidato digita "332.xxx.xxx-06" tanto quanto "332xxxxxx06".
    const cpf = normalizeCpf(resposta.answer);
    // Só passa quem fecha o dígito. Inválido aqui é o mesmo que ausente: quem chama mantém o caminho
    // de recusa que já existia, sem poluir a base com um CPF inventado.
    if (isValidCpf(cpf)) return cpf;
  }
  return undefined;
}
