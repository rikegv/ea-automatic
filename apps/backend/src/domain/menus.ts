/**
 * REGISTRO DOS MENUS e o mapa OPERAÇÃO -> MENU (OST permissão de menu por usuário).
 *
 * DESENHO (recomendação da correção do incidente da Liberação, agora adotada): a unidade de
 * permissão é a OPERAÇÃO, não a controller nem a tela. Um MENU declara as operações que libera; o
 * guard central resolve, a cada requisição, qual menu governa a operação pedida e checa se o usuário
 * tem esse menu. NÃO há checagem por controller nem por tela espalhada pelo código.
 *
 * COMO A OPERAÇÃO É IDENTIFICADA: por `Controller.handler` (nome da classe + nome do método), que é
 * estável e não depende de parsear string de rota. Um handler = uma operação. Isto é derivado do
 * mesmo registro abaixo, então o guard e a tela de configuração nunca divergem.
 *
 * A RÉGUA JÁ ESTABELECIDA É PRESERVADA: LER catálogo é dado de TRABALHO e continua ABERTO a qualquer
 * autenticado (as GETs de lista de clientes/cargos/escalas e tudo em `/catalogos` NÃO são reivindicadas
 * por menu nenhum). Só operações de ESCRITA/mutação e as telas administrativas dedicadas são gated.
 * Esta OST NÃO reintroduz `@Roles` em classe: quem governa as operações gated passa a ser o menu, e
 * MASTER/SUPER_ADMIN têm bypass total no guard.
 *
 * MENU NOVO: some the registry + rode o seed (`db:seed:menus`). A tela de configuração lê a tabela
 * `menus`, então o menu novo aparece sem deploy da tela.
 */

export type GrupoMenu = "OPERACAO" | "ADMIN";

export interface MenuDef {
  /** Slug estável, chave em `menus` e em `usuario_menus`. */
  codigo: string;
  rotulo: string;
  /** Rota da tela no frontend. */
  href: string;
  grupo: GrupoMenu;
  ordem: number;
  /**
   * Operações que este menu libera, como `Controller.handler`. `Controller.*` reivindica TODOS os
   * handlers daquela controller. Vazio = menu só de navegação (sem operação de backend própria; as
   * telas assim compõem a partir de leituras abertas ou de operações de outros menus).
   */
  operacoes: string[];
}

/**
 * O REGISTRO. Ordem aqui é a ordem no menu lateral. `inicio` não tem operações e é sempre visível
 * (ver `MENU_SEMPRE_VISIVEL`), para ninguém ficar olhando uma barra vazia.
 */
export const MENUS: MenuDef[] = [
  // ── Operação ──────────────────────────────────────────────────────────────
  { codigo: "inicio", rotulo: "Início", href: "/", grupo: "OPERACAO", ordem: 0, operacoes: [] },
  {
    codigo: "analise",
    rotulo: "Análise gerencial",
    href: "/analise",
    grupo: "OPERACAO",
    ordem: 1,
    // Compõe a partir de leituras compartilhadas; sem operação própria de backend.
    operacoes: [],
  },
  {
    codigo: "liberacao",
    rotulo: "Liberação Admissional",
    href: "/liberacao",
    grupo: "OPERACAO",
    ordem: 2,
    // Só MUTAÇÕES. As leituras (fila, recusadas, contagem do badge) ficam abertas: são consultadas
    // por várias telas e pelo badge da sidebar de TODO usuário; gatá-las recriaria a fragilidade que
    // derrubou a Liberação. recusar/reativarRecusada seguem @Roles admin (ação restrita).
    operacoes: ["AdmissoesController.liberar", "AdmissoesController.liberarEmLote"],
  },
  {
    codigo: "nova",
    rotulo: "Nova admissão",
    href: "/nova",
    grupo: "OPERACAO",
    ordem: 3,
    operacoes: ["AdmissoesController.create"],
  },
  {
    codigo: "esteira",
    rotulo: "Esteira admissional",
    href: "/esteira",
    grupo: "OPERACAO",
    ordem: 4,
    // Só MUTAÇÕES da esteira. As leituras (fila, detalhe, progresso, agendamento, arquivos) ficam
    // abertas (dado de trabalho, consultado por outras telas também).
    operacoes: [
      "EsteiraController.declinar",
      "EsteiraController.mudarStatus",
      "EsteiraController.relatorioClinicaPreview",
      "EsteiraController.relatorioClinicaCsv",
      "EsteiraController.anexarAso",
      "EsteiraController.salvarAgendamento",
      "AuditoriaController.documento",
      "ReauditoriaController.reauditar",
      "ReauditoriaController.validarPorHumano",
      "ReauditoriaController.descartar",
    ],
  },
  {
    codigo: "nao-conformidades",
    rotulo: "Não conformidades",
    href: "/nao-conformidades",
    grupo: "OPERACAO",
    ordem: 5,
    // decidirLiberacao segue @Roles admin (decisão restrita); o menu governa as demais mutações.
    operacoes: [
      "NaoConformidadesController.registrarNc3",
      "NaoConformidadesController.resolver",
      "NaoConformidadesController.solicitarLiberacao",
    ],
  },
  {
    codigo: "gerenciador",
    rotulo: "Gerenciador",
    href: "/gerenciador",
    grupo: "OPERACAO",
    ordem: 6,
    // Só a MUTAÇÃO (editar). listar/obter ficam abertos (dado de trabalho, também usados por Análise);
    // deletar segue @Roles admin.
    operacoes: ["AdmissoesController.editar"],
  },
  {
    codigo: "gerador-kit",
    rotulo: "Gerador de kit",
    href: "/gerador-kit",
    grupo: "OPERACAO",
    ordem: 7,
    operacoes: [
      "KitController.processar",
      "KitController.statusProcessar",
      "KitController.downloadFuncionario",
      "KitController.reimportar",
      "KitController.downloadZip",
    ],
  },
  // ── Administração ─────────────────────────────────────────────────────────
  {
    codigo: "clientes",
    rotulo: "Clientes",
    href: "/admin/clientes",
    grupo: "ADMIN",
    ordem: 20,
    // GET de LISTA fica FORA (catálogo, leitura aberta). Só escrita e leituras de edição.
    operacoes: [
      "ClientesController.create",
      "ClientesController.update",
      "ClientesController.definirVinculo",
      "ClientesController.dependencias",
      "ClientesController.opcoesVinculo",
      "ClientesController.reativar",
      "ClientesController.remove",
    ],
  },
  {
    codigo: "cargos",
    rotulo: "Cargos",
    href: "/admin/cargos",
    grupo: "ADMIN",
    ordem: 21,
    operacoes: [
      "CargosController.create",
      "CargosController.update",
      "CargosController.reativar",
      "CargosController.remove",
    ],
  },
  {
    codigo: "escalas",
    rotulo: "Escalas",
    href: "/admin/escalas",
    grupo: "ADMIN",
    ordem: 22,
    operacoes: [
      "EscalasController.create",
      "EscalasController.update",
      "EscalasController.reativar",
      "EscalasController.remove",
    ],
  },
  {
    codigo: "motivos-declinio",
    rotulo: "Motivos de declínio",
    href: "/admin/motivos-declinio",
    grupo: "ADMIN",
    ordem: 23,
    // GET de lista aqui é a tela admin (a leitura aberta é `/catalogos/motivos-declinio`).
    operacoes: ["MotivosDeclinioController.*"],
  },
  {
    codigo: "tarifas",
    rotulo: "Tarifas de transporte",
    href: "/admin/tarifas",
    grupo: "ADMIN",
    ordem: 24,
    operacoes: ["TarifasController.*"],
  },
  {
    codigo: "regua",
    rotulo: "Régua documental",
    href: "/admin/regua",
    grupo: "ADMIN",
    ordem: 25,
    // A tela da Régua também administra o catálogo de TIPOS DE DOCUMENTO.
    operacoes: ["ReguaController.*", "TiposDocumentoController.*"],
  },
  {
    codigo: "kit-regras",
    rotulo: "Regras do kit",
    href: "/admin/kit-regras",
    grupo: "ADMIN",
    ordem: 26,
    operacoes: ["KitRegrasController.*", "KitTiposController.*"],
  },
  {
    codigo: "regras",
    rotulo: "Regras de auditoria",
    href: "/admin/regras",
    grupo: "ADMIN",
    ordem: 27,
    operacoes: ["RegrasController.*"],
  },
  {
    codigo: "diagnostico",
    rotulo: "Diagnóstico do sistema",
    href: "/admin/diagnostico",
    grupo: "ADMIN",
    ordem: 29,
    // Igual a "usuarios": a controller é @Roles admin-only (a tela mostra dado de sistema e dispara
    // reprocessamento). Fica no catálogo para a regra de liberação por perfil, mas não é reivindicada
    // por menu (marcar para COMUM não concede acesso, fail-closed pelo RolesGuard).
    operacoes: [],
  },
  {
    codigo: "usuarios",
    rotulo: "Usuários",
    href: "/admin/usuarios",
    grupo: "ADMIN",
    ordem: 28,
    // A tela de USUÁRIOS (que é a própria tela de configuração de menus) segue restrita a
    // MASTER/SUPER_ADMIN pelo `@Roles` da controller (Bloco 4). Por isso NÃO é reivindicada por menu:
    // marcar "usuarios" para um COMUM não concederia gestão de usuários (fail-closed pelo RolesGuard),
    // e delegar a configuração de menus a um não-admin seria escalonamento de privilégio.
    operacoes: [],
  },
];

/** Menus sempre visíveis, independentemente de configuração (a home nunca some). */
export const MENU_SEMPRE_VISIVEL = new Set<string>(["inicio"]);

/** Todos os códigos de menu. */
export const TODOS_CODIGOS_MENU = MENUS.map((m) => m.codigo);

/**
 * Menus que um usuário COMUM enxergava ANTES desta OST: o grupo OPERAÇÃO, menos o Gerador de kit
 * (que a sidebar já mostrava só para admin). É a base do GRANDFATHER da migração (Bloco 5): dar
 * "todos os menus" a um COMUM seria ESCALONAR privilégio (ele passaria a ver a Administração, que não
 * via). O grandfather tem de reproduzir EXATAMENTE o acesso de hoje, papel a papel.
 */
export const MENUS_COMUM_HOJE = MENUS.filter(
  (m) => m.grupo === "OPERACAO" && m.codigo !== "gerador-kit",
).map((m) => m.codigo);

/** Códigos que um papel enxergava ANTES desta OST (para o grandfather sem ruptura). */
export function codigosGrandfather(papel: string): string[] {
  if (papel === "MASTER" || papel === "SUPER_ADMIN") return TODOS_CODIGOS_MENU;
  return MENUS_COMUM_HOJE;
}

/**
 * Índice reverso `Controller.handler` -> menu, mais o conjunto de controllers com `*`. Construído uma
 * vez. O guard consulta isto por operação.
 */
interface IndiceOperacoes {
  /** `Controller.handler` exato -> código do menu. */
  porHandler: Map<string, string>;
  /** `Controller` (com `*`) -> código do menu. */
  porControllerCoringa: Map<string, string>;
}

function construirIndice(): IndiceOperacoes {
  const porHandler = new Map<string, string>();
  const porControllerCoringa = new Map<string, string>();
  for (const menu of MENUS) {
    for (const op of menu.operacoes) {
      if (op.endsWith(".*")) {
        porControllerCoringa.set(op.slice(0, -2), menu.codigo);
      } else {
        porHandler.set(op, menu.codigo);
      }
    }
  }
  return { porHandler, porControllerCoringa };
}

const INDICE = construirIndice();

/**
 * Qual menu governa a operação `Controller.handler`? `null` = operação ABERTA (não reivindicada por
 * menu nenhum): auth, leitura de catálogo, leituras compartilhadas, rotas públicas. É o mesmo default
 * do `@Roles`: sem reivindicação, qualquer autenticado passa.
 */
export function menuDaOperacao(controller: string, handler: string): string | null {
  const exato = INDICE.porHandler.get(`${controller}.${handler}`);
  if (exato) return exato;
  return INDICE.porControllerCoringa.get(controller) ?? null;
}
