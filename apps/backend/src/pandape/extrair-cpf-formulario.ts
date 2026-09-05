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
 * POR QUE ELA OLHA MAIS DE UM RÓTULO (caso Zelda, idPreCollaborator 421114, 05/09/2026): o formulário
 * do Pandapé traz DOIS campos de CPF do titular, "CPF" e "Número do CPF", e o candidato pode errar um
 * e acertar o outro. Na Zelda os dois diferiam em um único dígito, na sétima posição: o "CPF" fechava
 * o dígito verificador e o "Número do CPF" não. A versão anterior comparava o rótulo por igualdade
 * exata com "Número do CPF", achava o inválido, ignorava o válido e o job morria com "CPF inválido".
 * E o Pandapé NÃO permite editar o preenchimento do candidato, então não havia conserto na origem: a
 * única saída é o EA aprender a achar o CPF válido onde ele estiver.
 *
 * ONDE O DADO VIVE, confirmado contra a API real: `GET /v1/PreCollaborator/Get` → `answers[]`, lista
 * PLANA na raiz do pré-colaborador (diferente do `forms[].answers[]` da v3 que o `extrair-banco`
 * percorre), com itens `{ fieldName, answer }`.
 *
 * O QUE ELA É: um FALLBACK, nunca a fonte primária. Quem manda segue sendo o cadastro do candidato
 * (via Match); estes valores só são consultados quando aquele não fecha o dígito. E só são aceitos se
 * ELES fecharem: texto digitado à mão não vira chave de identidade sem prova.
 *
 * §A.6: o CPF é chave técnica e NUNCA é logado. Esta função não loga nada, por construção, e devolve
 * o valor normalizado para quem chama gravar, jamais para imprimir.
 */

/** Rótulo histórico do campo, mantido exportado porque a suite e a documentação o referenciam. */
export const CAMPO_NUMERO_CPF = "Número do CPF";

/**
 * PALAVRAS QUE MUDAM O DONO DO CPF. Achou uma delas no rótulo, o campo é recusado na hora, sem nem
 * olhar o valor: o CPF do dependente, do cônjuge ou do responsável NÃO é a chave de identidade da
 * admissão, e gravá-lo seria criar a admissão na pessoa errada. Recusa vem antes de qualquer aceite.
 */
const QUALIFICADORES_DE_TERCEIRO = new Set([
  "dependente",
  "dependentes",
  "conjuge",
  "esposa",
  "esposo",
  "companheiro",
  "companheira",
  "responsavel",
  "pai",
  "mae",
  "filho",
  "filha",
  "avo",
  "avos",
  "tutor",
  "curador",
  "procurador",
  "emergencia",
  "contato",
  "testemunha",
  "socio",
  "empresa",
  "avalista",
  "beneficiario",
]);

/**
 * PALAVRAS PERMITIDAS em um rótulo de CPF DO TITULAR. A régua é de allowlist, não de blocklist: o
 * rótulo só é aceito quando TODAS as suas palavras estão aqui. Rótulo com palavra desconhecida é
 * recusado por padrão, então um campo novo que o Pandapé invente ("CPF do avalista", digamos) não
 * entra sozinho, mesmo que a palavra não esteja na lista de qualificadores acima.
 */
const PALAVRAS_DO_TITULAR = new Set([
  "cpf",
  "numero",
  "numeros",
  "num",
  "n",
  "no",
  "nr",
  "do",
  "da",
  "de",
  "o",
  "a",
  "seu",
  "sua",
  "informe",
  "titular",
  "candidato",
  "colaborador",
  "funcionario",
  "empregado",
]);

/** O formato de cada item de `answers[]` na v1, verificado ao vivo. */
interface RespostaPreCollaborator {
  answer?: unknown;
  fieldName?: unknown;
}

/**
 * Rótulo em palavras comparáveis: sem acento, sem caixa, sem pontuação e sem espaço sobrando. O
 * "Nº do CPF" e o "numero do cpf  " têm de chegar iguais aqui, senão a régua vira sorte de digitação.
 */
function palavrasDoRotulo(fieldName: unknown): string[] {
  if (typeof fieldName !== "string") return [];
  return fieldName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * O rótulo FALA de CPF, de quem quer que seja? É a peneira larga, usada pelo Diagnóstico para mostrar
 * ao operador TODOS os campos de CPF do formulário, inclusive os que o EA recusa de propósito. Sem
 * ela a tela mostraria só o que o EA aceita, e a pergunta "por que não puxa" continuaria sem resposta.
 */
export function rotuloFalaDeCpf(fieldName: unknown): boolean {
  return palavrasDoRotulo(fieldName).includes("cpf");
}

/**
 * O rótulo é de CPF DO TITULAR? Precisa das três coisas: falar de CPF, não citar terceiro, e não ter
 * nenhuma palavra fora da allowlist.
 */
export function ehCampoDeCpfDoTitular(fieldName: unknown): boolean {
  const palavras = palavrasDoRotulo(fieldName);
  if (!palavras.includes("cpf")) return false;
  if (palavras.some((p) => QUALIFICADORES_DE_TERCEIRO.has(p))) return false;
  return palavras.every((p) => PALAVRAS_DO_TITULAR.has(p));
}

/**
 * O CPF do formulário NORMALIZADO (11 dígitos, sem máscara), ou `undefined` quando o payload não traz
 * nenhum campo de CPF do titular que feche o dígito verificador.
 *
 * Varre `answers[]` NA ORDEM em que a API devolve e fica com o PRIMEIRO que fecha o dígito. Campo
 * inválido é tratado como ausente: não interrompe a varredura e não polui a base com CPF inventado.
 *
 * O tipo de entrada é `unknown[]` porque é o que a interface do pré-colaborador declara: a v1 devolve
 * respostas de formulário livre, então cada item é estreitado aqui em vez de confiar num contrato que
 * a API não garante. Item fora do formato é ignorado, nunca derruba o sync.
 */
export function extrairCpfDoFormulario(answers: readonly unknown[] | undefined): string | undefined {
  for (const item of answers ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const resposta = item as RespostaPreCollaborator;
    if (!ehCampoDeCpfDoTitular(resposta.fieldName)) continue;
    if (typeof resposta.answer !== "string") continue;

    // Tira a máscara ANTES de validar: o candidato digita "332.xxx.xxx-06" tanto quanto "332xxxxxx06".
    const cpf = normalizeCpf(resposta.answer);
    // Só passa quem fecha o dígito. Inválido aqui é o mesmo que ausente: quem chama mantém o caminho
    // de recusa que já existia, sem poluir a base com um CPF inventado.
    if (isValidCpf(cpf)) return cpf;
  }
  return undefined;
}
