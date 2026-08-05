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
    // CONTROLE GERENCIAL (OST do dashboard executivo, ajustes do diretor). Menu NOVO: nasce só para o
    // SUPER_ADMIN e o diretor libera quem enxerga (§A.23). O CÓDIGO segue `diretoria` de propósito,
    // mesmo com o rótulo novo: o código é a chave em `usuario_menus`, e trocá-lo apagaria as
    // liberações já feitas pelo diretor. Rótulo é tela; código é chave.
    //
    // A tela "Análise Gerencial" (menu `analise`, mock sem dado real) foi DELETADA nesta OST por
    // decisão do diretor, junto com a rota `/analise`.
    codigo: "diretoria",
    rotulo: "Controle Gerencial",
    href: "/diretoria",
    grupo: "OPERACAO",
    ordem: 1,
    // Leitura agregada, sem operação própria de escrita.
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
    rotulo: "Nova Admissão",
    href: "/nova",
    grupo: "OPERACAO",
    ordem: 3,
    operacoes: ["AdmissoesController.create"],
  },
  {
    codigo: "esteira",
    rotulo: "Esteira Admissional",
    href: "/esteira",
    grupo: "OPERACAO",
    ordem: 4,
    // Só MUTAÇÕES da esteira. As leituras (fila, detalhe, progresso, agendamento, arquivos) ficam
    // abertas (dado de trabalho, consultado por outras telas também).
    operacoes: [
      "EsteiraController.declinar",
      // PAUSA (OST admissão pausada): operacional, no MESMO menu do declínio. "Qualquer consultor
      // pausa e retoma" (decisão do diretor) sai de graça daqui, porque `esteira` está no padrão
      // do COMUM (todo o grupo Operação).
      "EsteiraController.pausar",
      "EsteiraController.retomar",
      "EsteiraController.mudarStatus",
      // Agendamento em massa: move as frentes para AGENDADO, então é mutação de status e se
      // reivindica junto do `mudarStatus`. Sai de graça para o COMUM, que já tem o menu `esteira`.
      "EsteiraController.agendarIntegracaoEmLote",
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
    rotulo: "Não Conformidades",
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
    rotulo: "Gerador De Kit",
    href: "/gerador-kit",
    grupo: "OPERACAO",
    ordem: 7,
    operacoes: [
      "KitController.processar",
      "KitController.statusProcessar",
      "KitController.downloadFuncionario",
      "KitController.reimportar",
      "KitController.downloadZip",
      // "Enviar para assinatura": anexa o kit à admissão e a põe na fila. NÃO dispara envelope, então
      // pertence ao menu de quem GERA o kit, não ao de quem dispara.
      "KitController.enviarAssinatura",
    ],
  },
  {
    codigo: "assinaturas",
    rotulo: "Ass. Click",
    href: "/assinaturas",
    grupo: "OPERACAO",
    ordem: 8,
    // As 4 operações da tela (INT-4) MAIS as duas da F9 antiga.
    //
    // POR QUE `KitController.gerar` ENTRA AQUI: era a operação que criava envelope para QUALQUER
    // autenticado. A tela `/kit` saiu do menu (§A.15) mas a rota continuou alcançável por URL, e o
    // handler não era reivindicado por menu nenhum, então o `MenuGuard` deixava passar. Trazê-lo para
    // este menu fecha a porta pelo mecanismo que o sistema já tem, sem apagar a F9 (que o
    // `reenviarCorrecao` ainda usa, §A.15). `historico` acompanha porque é a leitura da mesma tela.
    //
    // `KitController.download` fica FORA de propósito: o token de download é consumido também pelo
    // reenvio disparado da Esteira, e reivindicá-lo quebraria quem tem "esteira" sem ter este menu.
    operacoes: [
      "ClicksignController.listar",
      // Leitura de quem já assinou e quem está devendo. REIVINDICADA de propósito: operação não
      // reivindicada fica ABERTA a qualquer autenticado, e esta expõe os nomes dos assinantes de um
      // contrato. Mesmo menu da lista, porque é a mesma tela.
      "ClicksignController.assinantes",
      "ClicksignController.dispararLote",
      "ClicksignController.disparar",
      "ClicksignController.trocarKit",
      "ClicksignController.verKit",
      "ClicksignController.cancelar",
      "ClicksignController.reenviarCorrecao",
      "KitController.gerar",
      "KitController.historico",
    ],
  },
  {
    codigo: "assinante-empresa",
    rotulo: "Assinante Da Empresa",
    // A rota continua sob `/admin/` (não movemos arquivo nem quebramos link); o que mudou é o GRUPO,
    // que é o que decide onde o menu aparece e quem o recebe por padrão.
    href: "/admin/assinante-empresa",
    grupo: "OPERACAO",
    ordem: 9,
    // Quem assina o contrato PELA EMPRESA (INT-4): conjunto padrão + conjunto por cliente, com ordem.
    //
    // SAIU DE ADMINISTRAÇÃO por decisão do diretor: o COMUM passa a cadastrar os grupos de assinatura.
    // Junto com isso, o `@Roles` admin foi REMOVIDO da controller. Sem essa remoção o menu apareceria
    // e as operações tomariam 403, porque o `RolesGuard` roda ANTES do `MenuGuard` (foi exatamente o
    // que aconteceu com o Gerador de Kit). Agora quem governa estas operações é só o menu.
    operacoes: ["AssinanteEmpresaController.*"],
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
    // CADASTRO DE CLÍNICAS (OST Onda 2, item 4): menu do GERENCIAL, no molde de Escalas. Guarda só o
    // nome; o agendamento do exame passa a selecionar desta lista.
    codigo: "clinicas",
    rotulo: "Clínicas",
    href: "/admin/clinicas",
    grupo: "ADMIN",
    ordem: 23,
    operacoes: [
      "ClinicasController.create",
      "ClinicasController.update",
      "ClinicasController.reativar",
      "ClinicasController.remove",
    ],
  },
  {
    // OBRIGATORIEDADE DE PENDÊNCIAS POR CLIENTE (OST da tela de obrigatoriedade). Menu do GERENCIAL.
    // Nasce só para o SUPER_ADMIN: quem libera para os demais é o diretor (§A.23).
    codigo: "pendencias-cliente",
    rotulo: "Obrigatoriedade Por Cliente",
    href: "/admin/pendencias-cliente",
    grupo: "ADMIN",
    ordem: 24,
    operacoes: [
      "PendenciasClienteController.atualizar",
      "PendenciasClienteController.aplicarEmMassa",
    ],
  },
  {
    codigo: "beneficios",
    rotulo: "Benefícios",
    href: "/admin/beneficios",
    grupo: "ADMIN",
    // Fica junto dos demais cadastros de admissão (clientes, cargos, escalas), decisão do diretor.
    // GET de LISTA fica FORA (catálogo, leitura aberta): a Liberação, o wizard e o modal do
    // Gerenciador leem `/catalogos/beneficios` e o perfil COMUM depende disso.
    ordem: 23,
    operacoes: [
      "BeneficiosController.create",
      "BeneficiosController.update",
      "BeneficiosController.reativar",
      "BeneficiosController.remove",
    ],
  },
  {
    codigo: "motivos-declinio",
    rotulo: "Motivos De Declínio",
    href: "/admin/motivos-declinio",
    grupo: "ADMIN",
    ordem: 24,
    // GET de lista aqui é a tela admin (a leitura aberta é `/catalogos/motivos-declinio`).
    operacoes: ["MotivosDeclinioController.*"],
  },
  {
    codigo: "tarifas",
    rotulo: "Tarifas De Transporte",
    href: "/admin/tarifas",
    grupo: "ADMIN",
    ordem: 25,
    operacoes: ["TarifasController.*"],
  },
  {
    codigo: "regua",
    rotulo: "Régua Documental",
    href: "/admin/regua",
    grupo: "ADMIN",
    ordem: 26,
    // A tela da Régua também administra o catálogo de TIPOS DE DOCUMENTO.
    operacoes: ["ReguaController.*", "TiposDocumentoController.*"],
  },
  {
    codigo: "kit-regras",
    rotulo: "Regras Do Kit",
    href: "/admin/kit-regras",
    grupo: "ADMIN",
    ordem: 27,
    // GET de lista dos TIPOS de kit (`KitTiposController.list`) fica ABERTA (leitura de catálogo, §
    // "ler é trabalho"): o Gerador de kit (menu `gerador-kit`, operação do COMUM) monta o seletor a
    // partir dela. Sem isto, o COMUM com `gerador-kit` mas sem `kit-regras` tomaria 403 no dropdown.
    // Só as ESCRITAS de tipos e TODA a controller de regras (tela admin dedicada) seguem gated.
    operacoes: [
      "KitRegrasController.*",
      "KitTiposController.criar",
      "KitTiposController.atualizar",
      "KitTiposController.remover",
    ],
  },
  {
    codigo: "regras",
    rotulo: "Regras De Auditoria",
    href: "/admin/regras",
    grupo: "ADMIN",
    ordem: 28,
    operacoes: ["RegrasController.*"],
  },
  {
    codigo: "diagnostico",
    rotulo: "Diagnóstico Do Sistema",
    href: "/admin/diagnostico",
    grupo: "ADMIN",
    ordem: 30,
    // Igual a "usuarios": a controller é @Roles admin-only (a tela mostra dado de sistema e dispara
    // reprocessamento). Fica no catálogo para a regra de liberação por perfil, mas não é reivindicada
    // por menu (marcar para COMUM não concede acesso, fail-closed pelo RolesGuard).
    operacoes: [],
  },
  {
    codigo: "pastas-drive",
    rotulo: "Pastas Do Drive",
    href: "/admin/pastas-drive",
    grupo: "ADMIN",
    ordem: 31,
    operacoes: ["PastasDriveController.*"],
  },
  {
    codigo: "usuarios",
    rotulo: "Usuários",
    href: "/admin/usuarios",
    grupo: "ADMIN",
    ordem: 29,
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
 * PADRÃO DO COMUM (decisão do diretor, 24/07/2026): o consultor COMUM enxerga TODO o grupo OPERAÇÃO
 * por padrão (os 8 menus, INCLUINDO o Gerador de kit), e a Administração fica como concessão pontual,
 * usuário a usuário. Isto INVERTE o grandfather original, que dava só "o que o papel já via" (Operação
 * MENOS o Gerador de kit): aquele recorte vinha INTERROMPENDO a operação (cliente e cargo sumindo na
 * Liberação, Gerador de kit indisponível). Administração NUNCA entra no padrão do COMUM.
 */
export const MENUS_PADRAO_COMUM = MENUS.filter((m) => m.grupo === "OPERACAO").map((m) => m.codigo);

/** Códigos que um papel recebe por PADRÃO. Admin recebe todos (tem bypass no guard; é por coerência). */
export function codigosPadraoDoPapel(papel: string): string[] {
  if (papel === "MASTER" || papel === "SUPER_ADMIN") return TODOS_CODIGOS_MENU;
  return MENUS_PADRAO_COMUM;
}

/**
 * Menus que NÃO podem ser concedidos a um COMUM em hipótese alguma: as controllers de Diagnóstico e
 * Usuários são `@Roles` admin-only, então marcar para um COMUM só faria o menu APARECER e o backend
 * BARRAR os dados (tela vazia / erro confuso). São filtrados ao salvar a config de um COMUM
 * (`definirMenusDoUsuario`) e a tela de configuração os desabilita para COMUM. Já ficam fora do padrão
 * por construção (padrão = só Operação, e estes são Administração).
 */
export const MENUS_BLOQUEADOS_COMUM = new Set<string>(["diagnostico", "usuarios"]);

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

/**
 * PLANO DE SALVAMENTO DA TELA DE PERMISSÃO (correção do salvamento por SUBSTITUIÇÃO).
 *
 * O DEFEITO QUE ISTO ELIMINA: a tela salvava mandando a lista inteira, e o backend apagava tudo e
 * regravava. Quem abria a tela, ganhava um menu novo enquanto ela estava aberta e depois salvava,
 * REMOVIA o menu novo sem perceber, porque a página mandou a lista antiga. Já mordeu duas vezes: o
 * menu `assinaturas` sumiu de 4 dos 5 COMUM em 28/07, e o `assinante-empresa` sumiu depois.
 *
 * A CORREÇÃO: a tela passa a dizer também QUAIS MENUS ELA CONHECIA (`conhecidos`, o catálogo que ela
 * exibiu). O backend só mexe dentro desse escopo. Menu que a tela não conhecia (porque nasceu depois
 * que ela carregou) é PRESERVADO em vez de apagado.
 *
 * Função pura de propósito: a regra é testável sem banco, e o service fica só com o I/O.
 *
 * @param atuais      o que o usuário tem hoje
 * @param selecionados o que veio marcado da tela (já filtrado por papel/validade pelo chamador)
 * @param conhecidos  o catálogo que a tela exibiu, o escopo do que ela pode remover
 */
export function planejarSelecaoDeMenus(input: {
  atuais: Iterable<string>;
  selecionados: Iterable<string>;
  conhecidos: Iterable<string>;
}): { inserir: string[]; remover: string[]; preservados: string[] } {
  const atuais = new Set(input.atuais);
  const selecionados = new Set(input.selecionados);
  const escopo = new Set(input.conhecidos);

  // Só sai o que a tela CONHECIA e não veio marcado. O resto do que o usuário tem fica de pé.
  const remover = [...atuais].filter((c) => escopo.has(c) && !selecionados.has(c));
  // Entra o que veio marcado e ainda não existe. Marcado fora do escopo entra assim mesmo: pedido
  // explícito de quem salvou, e ignorá-lo seria outra forma de mentir sobre o que a tela fez.
  const inserir = [...selecionados].filter((c) => !atuais.has(c));
  const preservados = [...atuais].filter((c) => !escopo.has(c) && !selecionados.has(c));

  return { inserir, remover, preservados };
}
