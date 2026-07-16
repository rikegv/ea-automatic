/**
 * Pacote de benefícios (§A.17 etapa 4) — helpers compartilhados pelo wizard (/nova) e pelo modal de
 * edição/pendências do Gerenciador. Vive aqui para as duas telas falarem a MESMA língua: mesma
 * regra de "quem tem valor", mesmo rótulo e mesma comparação com o padrão do cliente+cargo.
 */

export interface BeneficioPacote {
  nome: string;
  valor: number | null;
}

/**
 * Quais benefícios exigem valor: a regra vive no shared-types e é a MESMA que o backend valida.
 * Reexportado aqui para as telas importarem de um lugar só (VR, VA, AM, Cesta básica, PLR,
 * Auxílio creche; decisão do diretor).
 */
export { beneficioExigeValor as precisaValorBeneficio } from "@ea/shared-types";
import { beneficioExigeValor } from "@ea/shared-types";

/** "500" / "500.5" → "500,00" (como o consultor lê e digita). */
export function fmtValorBeneficio(valor: number): string {
  return valor.toFixed(2).replace(".", ",");
}

/**
 * Rótulo legível do pacote, COM os valores (ajuste do diretor: o consultor precisa ver o que está
 * herdando, não só os nomes). Ex.: "VA (Vale-Alimentação), VR (Vale-Refeição): 742,50".
 */
export function rotuloPacote(pacote: BeneficioPacote[]): string {
  return pacote
    .map((b) => (b.valor === null ? b.nome : `${b.nome}: ${fmtValorBeneficio(b.valor)}`))
    .join(", ");
}

/** Normaliza o texto de valor digitado ("1.500,00" → "1500.00") para comparar numericamente. */
function normalizarValor(v: string): string {
  return (v ?? "").trim().replace(/\./g, "").replace(",", ".");
}

/**
 * O pacote da tela FOGE do padrão do cliente+cargo? Compara os benefícios escolhidos E os valores.
 * Sem padrão (par inédito) não há do que fugir. Só avisa: nunca bloqueia (§A.3 regra 5).
 */
export function foraDoPadraoPacote(
  padrao: BeneficioPacote[] | null,
  selecionados: string[],
  valores: Record<string, string>,
): boolean {
  if (!padrao || padrao.length === 0) return false;
  const atual = new Map(
    selecionados.map((nome) => [
      nome,
      beneficioExigeValor(nome) ? normalizarValor(valores[nome] ?? "") : "",
    ]),
  );
  const esperado = new Map(padrao.map((b) => [b.nome, b.valor === null ? "" : String(b.valor)]));
  if (atual.size !== esperado.size) return true;
  for (const [nome, val] of esperado) {
    if (!atual.has(nome)) return true;
    const a = atual.get(nome) ?? "";
    // "500" e "500.00" são o mesmo valor: compara numericamente quando ambos são número.
    if (a !== val && !(a !== "" && val !== "" && Number(a) === Number(val))) return true;
  }
  return false;
}

/**
 * Benefícios selecionados que EXIGEM valor e estão sem valor (§A.17 etapa 4, decisão do diretor).
 * Usada pelo wizard e pelo modal para bloquear o avanço com mensagem clara. O backend revalida
 * pela mesma regra do shared-types.
 */
export function beneficiosSemValor(
  selecionados: string[],
  valores: Record<string, string>,
): string[] {
  return selecionados.filter(
    (nome) => beneficioExigeValor(nome) && !(valores[nome] ?? "").trim(),
  );
}
