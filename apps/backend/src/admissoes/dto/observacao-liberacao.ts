/**
 * Teto de caracteres da OBSERVAÇÃO LIVRE DA LIBERAÇÃO (OST caixa alta + observações, Bloco 2).
 *
 * 500 caracteres: cabe o recado real do consultor ("VT possui 6% de desconto", condição de escala,
 * combinado com o cliente) sem virar campo de texto longo dentro de um modal de liberação. Vive num
 * arquivo próprio porque os DOIS DTOs (individual e lote) usam o MESMO teto, e o front espelha o
 * mesmo número no `maxLength` do textarea: um lugar só para mudar.
 */
export const OBSERVACAO_LIBERACAO_MAX = 500;
