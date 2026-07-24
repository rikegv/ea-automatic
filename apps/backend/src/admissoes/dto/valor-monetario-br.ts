/**
 * Normalização de VALOR MONETÁRIO em pt-BR (OST salário aceitando formato brasileiro).
 *
 * O salário era o único campo numérico que chegava SEM validação de formato à coluna `numeric`:
 * qualquer valor não-numérico estourava `22P02 invalid input syntax`, que não é HttpException e caía
 * no fallback genérico "Erro ao liberar". Como o salário é o MESMO para as N do lote, um valor mal
 * formatado derrubava TODAS de uma vez. A correção é no campo, não na disciplina do consultor.
 *
 * REGRA pt-BR (declarada): **PONTO é separador de milhar, VÍRGULA é o decimal**. O ponto é removido
 * SEMPRE (milhar), a vírgula vira o ponto decimal. Isso resolve o caso ambíguo "2.500": no padrão
 * brasileiro é **2500** (dois mil e quinhentos), NÃO 2,5. Aceita ainda "R$" e espaços (inclusive o
 * não-quebrável), que o consultor digita naturalmente.
 *
 * §A.6: função pura, sem PII. Opera só sobre o texto do valor.
 */

/**
 * Extrai o número de uma entrada em pt-BR. Devolve `null` quando não sobra número válido (texto puro,
 * letras no meio, mais de uma vírgula). Aceita number (passa direto) e string.
 *
 * Exemplos (todos os obrigatórios da OST):
 *   2500        -> 2500
 *   2500,00     -> 2500
 *   2.500,00    -> 2500
 *   R$ 2.500,00 -> 2500
 *   2 500,00    -> 2500   (com espaço)
 *   2.500       -> 2500   (ambíguo: ponto é milhar no padrão BR, não 2,5)
 */
export function parseValorBR(entrada: unknown): number | null {
  if (entrada === undefined || entrada === null) return null;
  if (typeof entrada === "number") return Number.isFinite(entrada) ? entrada : null;
  let s = String(entrada).trim();
  if (s === "") return null;
  // Remove "R$" e todo espaço (comum, tab, não-quebrável).
  s = s.replace(/r\$/gi, "").replace(/\s/g, "");
  if (s === "") return null;
  // Depois disso, só dígitos, ponto, vírgula e um sinal opcional são aceitos: letra/lixo => inválido.
  if (!/^-?[\d.,]+$/.test(s)) return null;
  // pt-BR: ponto = milhar (some), vírgula = decimal (vira ponto). Só a primeira vírgula vira ponto;
  // se sobrar outra vírgula, a regex final barra (mais de um decimal é inválido).
  s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza o salário para a forma canônica que o Postgres `numeric` aceita ("2500.00"), para o DTO.
 * Contrato pensado para casar com `@IsOptional` + `@Matches(/^\d+(\.\d{1,2})?$/)`:
 *  - vazio / ausente  -> `undefined` (campo opcional; vira pendência na esteira, não bloqueia);
 *  - válido           -> string com 2 casas ("2500.00"), que passa no `@Matches`;
 *  - inválido / negativo -> devolve o texto CRU, que NÃO casa no `@Matches` e vira 400 com mensagem
 *    clara (nunca deixa estourar no banco virando "Erro ao liberar").
 */
export function normalizarSalarioParaDto(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const bruto = String(value).trim();
  if (bruto === "") return undefined;
  const n = parseValorBR(bruto);
  if (n === null || n < 0) return bruto; // deixa o @Matches barrar com mensagem de gente.
  return n.toFixed(2);
}
