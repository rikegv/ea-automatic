/**
 * REGRAS DE BENEFÍCIO POR CLIENTE (onda 2 dos Benefícios): as chaves aceitas em
 * `cliente_beneficio_regra.beneficio`.
 *
 * AS QUATRO SIGLAS PRECISAM SER AS MESMAS da fila (`BeneficiosFilaService.PRINCIPAIS`), senão a tela
 * mostra grupo de regra para uma sigla que não tem coluna, ou o contrário. NÃO unifiquei as duas
 * declarações de propósito (§A.26): aquela constante é código já validado, usado na listagem e na
 * ordenação da fila, e mexer nela para uma frente de leitura não paga o risco. O acordo entre as
 * duas é garantido por TESTE (`regras-beneficio.spec.ts`), que quebra se uma mudar sem a outra.
 *
 * As duas chaves a mais não são benefício do catálogo, são recorte de tela:
 *   OUTROS = a regra do que não está entre os quatro principais.
 *   GERAL  = a nota do cliente inteiro, que não pertence a nenhum benefício específico.
 */
export const PRINCIPAIS_BENEFICIO = ["VT", "VR", "VA", "AM"] as const;

export const CHAVES_REGRA_BENEFICIO = [...PRINCIPAIS_BENEFICIO, "OUTROS", "GERAL"] as const;

export type ChaveRegraBeneficio = (typeof CHAVES_REGRA_BENEFICIO)[number];

/** Rótulos de exibição, para quem monta a resposta não inventar o seu. */
export const ROTULO_REGRA_BENEFICIO: Record<ChaveRegraBeneficio, string> = {
  VT: "VT (Vale-Transporte)",
  VR: "VR (Vale-Refeição)",
  VA: "VA (Vale-Alimentação)",
  AM: "AM (Assistência Médica)",
  OUTROS: "Outros Benefícios",
  GERAL: "Observação Geral Do Cliente",
};

export function ehChaveRegraBeneficio(v: string): v is ChaveRegraBeneficio {
  return (CHAVES_REGRA_BENEFICIO as readonly string[]).includes(v);
}
