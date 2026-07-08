/**
 * Lógica pura do Gerador de Kit (F9), extraída da página para ser testável sem DOM.
 * O kit é chaveado por `admissaoId` real (POST /kit/:admissaoId/gerar), então a geração só
 * habilita quando há uma admissão SELECIONADA da lista (não basta digitar o nome livre).
 */

/** Subconjunto da admissão necessário aqui, sem CPF nem PII (§A.6). */
export interface AdmissaoSelecionavel {
  admissaoId: string;
  candidatoNome: string;
}

/** Normaliza nome para comparação: sem acento, minúsculas, espaços colapsados. */
export function normalizeNome(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Habilitação do botão "Gerar kit": exige admissão selecionada (com id), arquivo escolhido e
 * nenhuma geração em andamento. Função pura para teste: a ordem de seleção não importa.
 */
export function podeGerar(
  selecionada: AdmissaoSelecionavel | null,
  file: File | null,
  gerando: boolean,
): boolean {
  return Boolean(selecionada?.admissaoId) && Boolean(file) && !gerando;
}

/**
 * Auto-seleção para reduzir fricção: se o texto digitado bate EXATAMENTE (sem acento/caixa) com
 * um único resultado, retorna-o; ou, se houver apenas um resultado, retorna-o. Caso contrário null
 * (o usuário escolhe na lista). Nunca inventa admissão: sempre devolve um item real da busca.
 */
export function autoMatch<T extends AdmissaoSelecionavel>(results: T[], typed: string): T | null {
  const alvo = normalizeNome(typed);
  if (!alvo || results.length === 0) return null;
  const exatas = results.filter((r) => normalizeNome(r.candidatoNome) === alvo);
  if (exatas.length === 1) return exatas[0];
  if (results.length === 1) return results[0];
  return null;
}
