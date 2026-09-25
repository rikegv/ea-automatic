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
  // O INVERSO do caso `assinante-empresa` do comentário acima: a TELA do iFractal vive FORA de
  // `/admin` (é gestão, não catálogo), mas o CARD dela mora no hub. Quem tiver só este menu precisa
  // conseguir abrir a camada para chegar ao card, senão o menu ficaria liberado e inalcançável.
  "ifractal",
  // O GERENCIADOR DO PORTAL CONTINUA AQUI, e agora pelo motivo PURO: a TELA vive sob
  // `/admin/portal-links`, então quem tiver só este menu precisa conseguir abrir a camada, senão o
  // menu ficaria liberado e inalcançável (o layout de `/admin` responderia "Acesso Restrito").
  //
  // O que mudou foi o CAMINHO até ela: o card do hub saiu e o item passou a viver na BARRA
  // LATERAL, abaixo da Liberação Admissional (`lib/navegacao.ts`). A entrada aqui NÃO era sobre o
  // card, é sobre a CAMADA, e por isso a mudança de lugar não a dispensa. Tirá-la faria a barra
  // mostrar o item e a tela responder "Acesso Restrito", que é o pior sintoma possível e é
  // exatamente o que este arquivo existe para não acontecer.
  //
  // EFEITO COLATERAL CONHECIDO, e ele é aceitável: quem tiver SÓ este menu continua enxergando o
  // card "Menu Gerencial", que agora abriria um hub sem nenhum card para essa pessoa. Resolver
  // isso exigiria tirar a tela de baixo de `/admin`, o que muda a URL e está fora do que foi
  // pedido (§A.14). Fica registrado para o diretor decidir.
  "portal-links",
  "regua",
  "kit-regras",
  "regras",
  "dicas-documento",
  "usuarios",
  "menu-areas",
  "assinante-empresa",
] as const;

/** Tem ao menos um menu que abre a camada de administração? */
export function podeAbrirAdministracao(temMenu: (codigo: string) => boolean): boolean {
  return ADMIN_MENUS.some((c) => temMenu(c));
}
