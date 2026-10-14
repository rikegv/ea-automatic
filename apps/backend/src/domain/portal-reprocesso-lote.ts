/**
 * A RÉGUA DO LOTE de reprocesso do Portal ao prontuário (frente Prontuário Drive, Desenho 1), PURA e
 * testável, numa cabeça só. O runner `db/rearquiva-portal.ts` importa as constantes e espelha esta
 * régua no SQL; esta função é a fonte da verdade do CRITÉRIO, e o teste prova as exclusões que, se
 * perdidas, quebram a meta:
 *  - perder a exclusão do FABRICIO re-subiria bytes que ele já subiu à mão (upload manual pode ter
 *    reencodado o arquivo → md5 diferente → DUPLICA, o oposto de "100% sem duplicar");
 *  - perder a exclusão dos ENCERRADOS criaria prontuário para quem declinou (§A.16: declínio não
 *    deixa nada ativo).
 */

/** Decisão do diretor: Fabricio foi resolvido à mão e fica FORA do lote. */
export const FABRICIO_FORA_DO_LOTE = "5eeb96cc-86f7-40f1-adbc-9be8da415a13";

/** Encerrados não têm prontuário ativo (§A.16): nunca entram no reprocesso. */
export const FAROIS_FORA_DO_LOTE: ReadonlyArray<"DECLINOU" | "RESCISAO"> = ["DECLINOU", "RESCISAO"];

export interface ObjetoCandidatoAoLote {
  admissaoId: string;
  /** `farol_global` da admissão. */
  farolGlobal: string;
  /** `confirmado_em` não-nulo: a chegada do arquivo foi provada pelo metadado do objeto. */
  confirmado: boolean;
  /** `reprovado_em` não-nulo: a IA recusou este documento. */
  reprovado: boolean;
}

/**
 * Este objeto confirmado do Portal entra no reprocesso ao prontuário? O SQL do runner espelha esta
 * ordem exata de recusas.
 */
export function entraNoLoteDeReprocesso(o: ObjetoCandidatoAoLote): boolean {
  if (!o.confirmado) return false; // chegada não provada
  if (o.reprovado) return false; // documento recusado pela IA
  if (o.admissaoId === FABRICIO_FORA_DO_LOTE) return false; // resolvido à mão
  if (FAROIS_FORA_DO_LOTE.includes(o.farolGlobal as "DECLINOU" | "RESCISAO")) return false; // §A.16
  return true;
}
