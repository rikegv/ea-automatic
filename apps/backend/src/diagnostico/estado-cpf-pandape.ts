import { isValidCpf, normalizeCpf } from "@ea/shared-types";
import {
  ehCampoDeCpfDoTitular,
  rotuloFalaDeCpf,
} from "../pandape/extrair-cpf-formulario";

/**
 * "O QUE O PANDAPÉ DEVOLVE AGORA" (bloco C). Módulo PURO: recebe o que a API já devolveu e monta o
 * retrato, sem chamar nada.
 *
 * POR QUE EXISTE (caso Zelda, 05/09/2026). O job falhava com "CPF inválido" e não havia como saber,
 * pela tela, QUAL cpf estava inválido nem se existia algum válido em outro campo. A resposta só
 * apareceu quando alguém consultou a API à mão: o cadastro vinha zerado, o campo "Número do CPF"
 * tinha um dígito errado, e o campo "CPF" trazia o certo, que o EA na época nem olhava. Isso tem de
 * estar na tela, senão toda ocorrência dessas custa uma investigação.
 *
 * §A.6: O NÚMERO NUNCA SAI DAQUI. Sai o RÓTULO do campo (que é nome de formulário, não dado pessoal),
 * se ele fecha o dígito, e se o EA olha para ele. É o suficiente para decidir, e não é identificável.
 * §A.11: sem travessão nos textos.
 */

/** O estado de UMA origem de CPF, do jeito que a tela mostra. */
export interface EstadoCampoCpf {
  /** De onde vem, em linguagem de operação. Ex.: `Cadastro do candidato (Match)`. */
  origem: string;
  /** `válido`, `inválido` ou `ausente`. Nunca o número. */
  estado: "válido" | "inválido" | "ausente";
  /** O EA consulta esta origem? Falso é informação, não defeito: é o CPF de terceiro sendo recusado. */
  lidoPeloEa: boolean;
  /** Por que o EA não olha, quando não olha. Ausente quando olha. */
  observacao?: string;
}

/** Sem número, sem exceção: só a classificação. */
function classificar(valor: unknown): EstadoCampoCpf["estado"] {
  if (typeof valor !== "string" || !valor.trim()) return "ausente";
  return isValidCpf(normalizeCpf(valor)) ? "válido" : "inválido";
}

/** O formato de `answers[]` na v1, o mesmo que o extrator estreita. */
interface RespostaPreCollaborator {
  answer?: unknown;
  fieldName?: unknown;
}

/**
 * O retrato completo das origens de CPF de um pré-colaborador, na ordem em que o EA as consulta:
 * primeiro o cadastro, depois os campos do formulário na ordem em que a API os devolve.
 *
 * Campos de CPF de TERCEIRO entram na lista com `lidoPeloEa: false` e a razão da recusa. Escondê-los
 * deixaria o operador achando que o formulário não tem aquele CPF, quando tem e é recusado de caso
 * pensado.
 */
export function estadoDosCamposDeCpf(
  pc: { cpf?: unknown; answers?: readonly unknown[] | undefined },
  match: { cpf?: unknown } | undefined,
): EstadoCampoCpf[] {
  const linhas: EstadoCampoCpf[] = [];

  if (typeof pc.cpf === "string" && pc.cpf.trim()) {
    linhas.push({
      origem: "Cadastro (pré-colaborador)",
      estado: classificar(pc.cpf),
      lidoPeloEa: true,
    });
  }
  linhas.push({
    origem: "Cadastro do candidato (Match)",
    estado: match ? classificar(match.cpf) : "ausente",
    lidoPeloEa: true,
    ...(match ? {} : { observacao: "O Pandapé não devolveu o Match desta pessoa." }),
  });

  for (const item of pc.answers ?? []) {
    if (typeof item !== "object" || item === null) continue;
    const resposta = item as RespostaPreCollaborator;
    if (!rotuloFalaDeCpf(resposta.fieldName)) continue;
    const titular = ehCampoDeCpfDoTitular(resposta.fieldName);
    linhas.push({
      origem: `Formulário, campo "${String(resposta.fieldName)}"`,
      estado: classificar(resposta.answer),
      lidoPeloEa: titular,
      ...(titular ? {} : { observacao: "o rótulo indica CPF de terceiro, ou é desconhecido" }),
    });
  }

  return linhas;
}

/** Uma linha de resumo para o topo do bloco, que é o que responde "puxa ou não puxa". */
export function resumoDosCamposDeCpf(linhas: EstadoCampoCpf[]): string {
  const aproveitavel = linhas.some((l) => l.lidoPeloEa && l.estado === "válido");
  return aproveitavel
    ? "Há CPF válido numa origem que o EA lê. Reprocessar deve puxar."
    : "Nenhuma origem lida pelo EA tem CPF que feche o dígito verificador. Reprocessar vai falhar até o dado mudar no Pandapé.";
}
