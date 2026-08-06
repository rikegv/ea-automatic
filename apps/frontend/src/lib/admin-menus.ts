/**
 * MENUS QUE DÃO ACESSO À CAMADA DE ADMINISTRAÇÃO (as telas sob `/admin`).
 *
 * FONTE ÚNICA. Esta lista estava COPIADA em dois lugares, a barra lateral (para decidir se o card
 * "Menu Gerencial" aparece) e o layout de `/admin` (para decidir quem pode abrir a camada). Duas
 * cópias significam que um menu pode entrar numa e não na outra, e o sintoma é o pior possível: o
 * sistema mostra a porta e depois responde "Acesso Restrito". Com uma lista só, isso não acontece.
 *
 * NÃO é o mesmo conceito do GRUPO do menu no backend (`domain/menus.ts`). `assinante-empresa` mora no
 * grupo OPERAÇÃO, porque quem cadastra os grupos de assinatura é o COMUM, mas a TELA dele vive sob
 * `/admin`, então ele precisa estar aqui. Grupo diz onde o item aparece na barra; esta lista diz
 * quem consegue entrar na camada.
 */
export const ADMIN_MENUS = [
  "clientes",
  "cargos",
  "escalas",
  "clinicas",
  "integracao-clientes",
  "sala-espera-status",
  "pendencias-cliente",
  "motivos-declinio",
  "tarifas",
  "regua",
  "kit-regras",
  "regras",
  "usuarios",
  "assinante-empresa",
] as const;

/** Tem ao menos um menu que abre a camada de administração? */
export function podeAbrirAdministracao(temMenu: (codigo: string) => boolean): boolean {
  return ADMIN_MENUS.some((c) => temMenu(c));
}
