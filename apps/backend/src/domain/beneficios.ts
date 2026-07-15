/**
 * Parser puro do campo `beneficios` da vaga/folha (§A.3 / F1). O front envia os benefícios como
 * texto no formato "VR (Vale-Refeição): 500,00, AM (Assistência Médica): 300,00, VT (Vale-Transporte)".
 * Extrai o valor por benefício ESTÁVEL (chave "VR" / "AM") para virar padrão por cliente, pré-
 * preenchendo a próxima admissão (item 4). Sem dependência de DB — testável isoladamente.
 *
 * Regras:
 * - Os itens são separados por vírgula SEGUIDA de espaço (", "); a vírgula decimal de "500,00" não
 *   tem espaço depois, então não quebra o valor.
 * - Cada item tem o formato "NOME: valor" (split no primeiro ": "); itens sem ": " (benefício sem
 *   valor, ex.: "VT (Vale-Transporte)") são IGNORADOS.
 * - Só interessam os benefícios cujo NOME (trim, UPPERCASE) começa com "VR" ou "AM".
 */
export type BeneficioPadraoChave = "VR" | "AM";

export interface BeneficioPadraoParseado {
  beneficio: BeneficioPadraoChave;
  valor: string;
}

export function parseBeneficiosPadrao(
  beneficios: string | null | undefined,
): BeneficioPadraoParseado[] {
  if (!beneficios || typeof beneficios !== "string") return [];
  const itens = beneficios.split(/,\s+/);
  const out: BeneficioPadraoParseado[] = [];
  for (const item of itens) {
    const sep = item.indexOf(": ");
    if (sep === -1) continue; // benefício sem valor: ignora.
    const nome = item.slice(0, sep).trim().toUpperCase();
    const valor = item.slice(sep + 2).trim();
    if (!valor) continue;
    const chave: BeneficioPadraoChave | null = nome.startsWith("VR")
      ? "VR"
      : nome.startsWith("AM")
        ? "AM"
        : null;
    if (!chave) continue;
    out.push({ beneficio: chave, valor });
  }
  return out;
}
