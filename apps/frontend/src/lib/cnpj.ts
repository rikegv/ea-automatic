/**
 * Formatação e normalização de CNPJ para a UI.
 *
 * EXIBIÇÃO formatada (com ponto, barra e hífen) e BUSCA normalizada (só dígitos) são as duas metades
 * do mesmo seletor: a pessoa vê "12.345.678/0001-90" e acha digitando "12345678000190", sem precisar
 * da pontuação. Puro e sem dependência de browser, para ser reusado e testado fora do componente.
 */

/** Só os dígitos do CNPJ: alimenta a BUSCA (acha o CNPJ formatado digitando só números). */
export function cnpjDigitos(cnpj: string | null | undefined): string {
  return (cnpj ?? "").replace(/\D/g, "");
}

/**
 * CNPJ FORMATADO para EXIBIÇÃO: "12.345.678/0001-90". Sem CNPJ (ou com formato inesperado), devolve
 * "Não Cadastrado" (§A.24 title case, §A.11 sem travessão), nunca vazio.
 */
export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = cnpjDigitos(cnpj);
  if (d.length !== 14) return "Não Cadastrado";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
