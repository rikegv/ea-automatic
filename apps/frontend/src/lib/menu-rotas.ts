/**
 * Mapa ROTA -> CÓDIGO DE MENU (OST permissão de menu), consumido pelo guard de rota do frontend.
 *
 * Espelha o registro do backend (`domain/menus`) do lado da tela: dizer QUAL menu governa cada rota,
 * para o layout redirecionar quem digita a URL de uma tela não liberada. O backend continua sendo a
 * autoridade (barra as operações); isto é a camada de UX, para a pessoa não cair numa tela morta.
 *
 * Rotas sem menu (login, trocar-senha, /vt público) não entram aqui: não são governadas por menu.
 */
export const ROTA_MENU: { prefixo: string; codigo: string }[] = [
  // Mais específico primeiro (o guard casa por prefixo, primeira correspondência vence).
  { prefixo: "/admin/clientes", codigo: "clientes" },
  { prefixo: "/admin/cargos", codigo: "cargos" },
  { prefixo: "/admin/escalas", codigo: "escalas" },
  { prefixo: "/admin/motivos-declinio", codigo: "motivos-declinio" },
  { prefixo: "/admin/tarifas", codigo: "tarifas" },
  { prefixo: "/admin/regua", codigo: "regua" },
  { prefixo: "/admin/kit-regras", codigo: "kit-regras" },
  { prefixo: "/admin/regras", codigo: "regras" },
  { prefixo: "/admin/usuarios", codigo: "usuarios" },
  { prefixo: "/admin/diagnostico", codigo: "diagnostico" },
  { prefixo: "/liberacao", codigo: "liberacao" },
  { prefixo: "/nova", codigo: "nova" },
  { prefixo: "/esteira", codigo: "esteira" },
  { prefixo: "/nao-conformidades", codigo: "nao-conformidades" },
  { prefixo: "/gerenciador", codigo: "gerenciador" },
  { prefixo: "/gerador-kit", codigo: "gerador-kit" },
  { prefixo: "/analise", codigo: "analise" },
];

/**
 * Código do menu que governa uma rota, ou `null` quando a rota não é governada por menu (home `/`,
 * `/admin` raiz do menu gerencial, telas de sessão). Rota não governada nunca é bloqueada pelo guard.
 */
export function menuDaRota(pathname: string): string | null {
  for (const { prefixo, codigo } of ROTA_MENU) {
    if (pathname === prefixo || pathname.startsWith(`${prefixo}/`)) return codigo;
  }
  return null;
}
