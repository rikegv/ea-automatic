/**
 * EXIGÊNCIA DE DOCUMENTO CONDICIONADA AO SEXO (OST do seletor de sexo). Domínio PURO.
 *
 * A régua padrão marca a Carteira de Reservista como OBRIGATÓRIO para todo mundo, e a exigência real
 * é condicional: só o sexo MASCULINO precisa dela. Sexo ausente NÃO cobra, para não inventar
 * pendência a partir de dado que ninguém informou.
 *
 * POR QUE ISTO VIROU UM MÓDULO. A regra já existia em três lugares (completude por admissão, consulta
 * em lote e a consulta do Diagnóstico) e faltava no quarto, que é o ARQUIVAMENTO. Foi exatamente o
 * buraco do caso real: a admissão estava gravada com o sexo ERRADO (masculino para uma mulher), o
 * Reservista virou obrigatório, alguém validou o documento à mão para destravar, e o arquivamento,
 * que olha os documentos ENTREGUE sem nenhuma condição de sexo, seguiu exigindo o arquivo e travando
 * o prontuário. Corrigir o sexo na tela só resolve se TODOS os pontos usarem a mesma régua, e agora
 * ela tem um lugar só.
 *
 * A linha do documento NUNCA é apagada (decisão do diretor): ela é IGNORADA no cálculo e no
 * arquivamento, e o histórico do documento fica intacto.
 */

/** Código do tipo de documento cuja exigência depende do sexo. */
export const RESERVISTA_COD = "RESERVISTA";

/** O sexo informado cobra Reservista? Só MASCULINO cobra; nulo e feminino não. */
export function exigeReservista(sexo: string | null | undefined): boolean {
  return sexo === "MASCULINO";
}

/**
 * Um tipo de documento é exigível desta admissão, dado o sexo do candidato? Vale para qualquer
 * código: só o Reservista é condicional hoje, os demais passam sempre.
 */
export function documentoSeAplica(codigoTipo: string, sexo: string | null | undefined): boolean {
  return codigoTipo !== RESERVISTA_COD || exigeReservista(sexo);
}

/** Remove da lista os documentos que não se aplicam ao sexo do candidato. */
export function filtrarPorSexo(codigos: string[], sexo: string | null | undefined): string[] {
  return codigos.filter((c) => documentoSeAplica(c, sexo));
}
