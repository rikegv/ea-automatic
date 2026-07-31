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
 * Quais benefícios exigem valor. FALLBACK por nome, mantido no shared-types e usado só quando a
 * linha do catálogo não é conhecida (benefício vindo do texto achatado das admissões importadas).
 * A régua de verdade é a coluna `exige_valor` do cadastro: use `criarPrecisaValor` abaixo.
 */
export { beneficioExigeValor as precisaValorBeneficio } from "@ea/shared-types";
import { beneficioExigeValor } from "@ea/shared-types";

/** Uma linha do catálogo como o `/catalogos/beneficios` devolve (só os ATIVOS). */
export interface CatalogoBeneficio {
  id: string;
  nome: string;
  exigeValor: boolean;
}

/**
 * A régua de "precisa de valor?" a partir do CATÁLOGO (OST cadastro de benefícios por tela).
 *
 * Antes as telas deduziam a exigência do TEXTO DO NOME (`precisaValorBeneficio`), o que fazia
 * benefício novo nascer sem exigir valor e renomear mudar a exigência em silêncio. Agora quem manda
 * é a coluna `exige_valor`, a MESMA que o backend valida em `validarValoresDoPacote`, então as duas
 * pontas não têm como divergir.
 *
 * Nome fora do catálogo (legado achatado, ou benefício inativado depois de alocado) cai no fallback
 * por nome, em vez de virar "não exige valor" por omissão.
 */
export function criarPrecisaValor(
  catalogo: { nome: string; exigeValor?: boolean }[] | null | undefined,
): (nome: string) => boolean {
  const porNome = new Map((catalogo ?? []).map((b) => [b.nome, b.exigeValor]));
  return (nome: string) => {
    const doCatalogo = porNome.get(nome);
    return doCatalogo === undefined ? beneficioExigeValor(nome) : doCatalogo === true;
  };
}

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
  /** Régua de "precisa de valor?". Passe a do CATÁLOGO (`criarPrecisaValor`); o default é o fallback. */
  precisaValor: (nome: string) => boolean = beneficioExigeValor,
): boolean {
  if (!padrao || padrao.length === 0) return false;
  const atual = new Map(
    selecionados.map((nome) => [
      nome,
      precisaValor(nome) ? normalizarValor(valores[nome] ?? "") : "",
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
 * Usada pelo wizard e pelo modal para bloquear o avanço com mensagem clara. O backend revalida pela
 * MESMA régua, que agora é a coluna `exige_valor` do cadastro.
 */
export function beneficiosSemValor(
  selecionados: string[],
  valores: Record<string, string>,
  /** Régua de "precisa de valor?". Passe a do CATÁLOGO (`criarPrecisaValor`); o default é o fallback. */
  precisaValor: (nome: string) => boolean = beneficioExigeValor,
): string[] {
  return selecionados.filter((nome) => precisaValor(nome) && !(valores[nome] ?? "").trim());
}
