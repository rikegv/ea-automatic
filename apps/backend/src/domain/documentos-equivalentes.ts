/**
 * EQUIVALÊNCIA DE TIPO NO CHECKLIST (OST A / Bloco 3).
 *
 * DIAGNÓSTICO DA FALHA (foto do crachá da Silvia). A decisão original era: tipo PRÓPRIO
 * `FOTO_CRACHA`, guardado no MESMO lugar físico do `FOTO_3X4`. O ARMAZENAMENTO cumpriu a decisão
 * (`drive-routing` manda os dois para a subpasta DOCUMENTOS_PESSOAIS). Quem falhou foi a EXIBIÇÃO:
 * o checklist da aba Auditoria é montado a partir da RÉGUA (`regua_documental`), e `FOTO_CRACHA` não
 * está em régua nenhuma (0 pares). Resultado: a foto chegava, era auditada, gravava estado, e ficava
 * INVISÍVEL, enquanto a linha "Foto 3x4" aparecia como não recebida.
 *
 * A CORREÇÃO é de exibição, não de régua: a linha do slot passa a aceitar o documento de um tipo
 * equivalente. Não criamos linha nova na régua (isso mudaria a exigência, fora do escopo) e não
 * fundimos os tipos (o tipo próprio foi decisão do diretor).
 *
 * Função pura, sem I/O e sem PII (§A.6): opera só sobre códigos do catálogo.
 */

/** Slot exibido (código da régua) → códigos que PREENCHEM esse slot quando ele está vazio. */
export const EQUIVALENTES_POR_SLOT: Readonly<Record<string, readonly string[]>> = {
  // A foto para crachá É a foto do candidato: ocupa o mesmo lugar do "Foto 3x4" na tela.
  FOTO_3X4: ["FOTO_CRACHA"],
};

/** Códigos que podem preencher o slot deste código. Vazio quando o slot não tem equivalente. */
export function equivalentesDoSlot(codigoSlot: string): readonly string[] {
  return EQUIVALENTES_POR_SLOT[(codigoSlot ?? "").toUpperCase()] ?? [];
}
