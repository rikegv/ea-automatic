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
  // ALTO VOLUME (onda 1): sem esta linha o guard deixaria QUALQUER autenticado abrir a URL direto,
  // mesmo sem o menu liberado pelo diretor (§A.23). A escrita já está fechada pelo backend; isto
  // fecha a porta da tela.
  { prefixo: "/admin/alto-volume", codigo: "alto-volume" },
  { prefixo: "/admin/clientes", codigo: "clientes" },
  { prefixo: "/admin/cargos", codigo: "cargos" },
  { prefixo: "/admin/clinicas", codigo: "clinicas" },
  { prefixo: "/admin/sala-espera-status", codigo: "sala-espera-status" },
  { prefixo: "/sala-espera", codigo: "sala-espera" },
  { prefixo: "/admin/integracao-clientes", codigo: "integracao-clientes" },
  { prefixo: "/admin/pendencias-cliente", codigo: "pendencias-cliente" },
  { prefixo: "/admin/escalas", codigo: "escalas" },
  { prefixo: "/admin/beneficios", codigo: "beneficios" },
  { prefixo: "/admin/motivos-declinio", codigo: "motivos-declinio" },
  { prefixo: "/admin/tarifas", codigo: "tarifas" },
  { prefixo: "/admin/regua", codigo: "regua" },
  { prefixo: "/admin/kit-regras", codigo: "kit-regras" },
  { prefixo: "/admin/regras", codigo: "regras" },
  { prefixo: "/admin/usuarios", codigo: "usuarios" },
  { prefixo: "/admin/pastas-drive", codigo: "pastas-drive" },
  { prefixo: "/admin/assinante-empresa", codigo: "assinante-empresa" },
  { prefixo: "/admin/diagnostico", codigo: "diagnostico" },
  { prefixo: "/liberacao", codigo: "liberacao" },
  { prefixo: "/nova", codigo: "nova" },
  { prefixo: "/esteira", codigo: "esteira" },
  { prefixo: "/nao-conformidades", codigo: "nao-conformidades" },
  { prefixo: "/gerenciador", codigo: "gerenciador" },
  { prefixo: "/gerador-kit", codigo: "gerador-kit" },
  { prefixo: "/assinaturas", codigo: "assinaturas" },
  // A TELA F9 ANTIGA (§A.15). Saiu do menu mas continuava alcançável por URL, e como não estava
  // mapeada aqui o guard deixava passar qualquer autenticado, sendo que dela se dispara envelope
  // de assinatura. Passa a ser governada pelo mesmo menu que governa a operação no backend
  // (`KitController.gerar`), então tela e operação ficam com a MESMA régua.
  { prefixo: "/kit", codigo: "assinaturas" },
  // CONTROLE GERENCIAL: governado pelo menu `diretoria`, que nasce só para o SUPER_ADMIN (§A.23). Sem
  // esta linha o guard deixaria qualquer autenticado abrir a URL direto.
  { prefixo: "/diretoria", codigo: "diretoria" },
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
