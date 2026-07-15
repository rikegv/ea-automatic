/**
 * Converte um query param multi-valor (Bloco B) em array. Os filtros multi-select do front enviam
 * os valores separados por vírgula (ex.: `farol=DECLINOU,EM_ADMISSAO`). Retorna `undefined` quando
 * vazio/ausente, para o service tratar como "sem filtro". Cada filtro é OU (inArray) no service.
 */
export function parseMulti(v?: string): string[] | undefined {
  if (!v) return undefined;
  const arr = v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : undefined;
}
