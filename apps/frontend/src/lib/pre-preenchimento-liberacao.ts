/**
 * DE ONDE VÊM CLIENTE E CARGO quando o modal de liberação abre.
 *
 * Mora fora da tela porque é REGRA, não desenho: foi justamente aqui que o auto-preenchimento se
 * perdeu. O match partindo da Sala gravava o cliente na admissão e a tela abria vazia, porque a
 * abertura só olhava o vínculo feito na própria sessão. Regra sem teste vira bug silencioso.
 *
 * A ORDEM É A DA CONFIANÇA:
 *  1. o vínculo feito AGORA, nesta sessão (o operador acabou de escolher, e a escolha dele manda);
 *  2. o que a ADMISSÃO já trazia, que hoje só chega ali por sugestão da Sala de Espera;
 *  3. vazio, que é o caso normal de quem chega do Pandapé e nunca foi anunciado por ninguém.
 */
export function resolverPrePreenchimento(
  admissao: { codCliente: string | null; cargoId: string | null },
  vinculoDaSessao: { codCliente?: string; cargoId?: string } | undefined,
): { codCliente: string; cargoId: string } {
  return {
    codCliente: vinculoDaSessao?.codCliente ?? admissao.codCliente ?? "",
    cargoId: vinculoDaSessao?.cargoId ?? admissao.cargoId ?? "",
  };
}
