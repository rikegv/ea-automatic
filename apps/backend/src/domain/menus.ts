import type { Area } from "@ea/shared-types";

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

/**
 * GRUPOS DA BARRA LATERAL. `SELECAO` é o terceiro, e nasce com a Central de Vagas (A&S).
 *
 * GRUPO PRÓPRIO, e não um item a mais em "Operação", porque a barra passa a servir a DOIS times: o
 * grupo é o que separa visualmente o módulo de Admissão do de Atração e Seleção para quem, um dia,
 * tiver as duas áreas. E tem um efeito de segurança de graça: `MENUS_PADRAO_COMUM` filtra por
 * `grupo === "OPERACAO"`, então menu em grupo novo fica DUPLAMENTE fora de qualquer backfill futuro
 * (§A.23, a armadilha que concedeu menu a três usuários sem ninguém pedir).
 */
export type GrupoMenu = "OPERACAO" | "ADMIN" | "SELECAO";

/**
 * ÁREA DE NASCIMENTO de um menu que não declara `areas`.
 *
 * É TAMBÉM A DIREÇÃO SEGURA. Um menu de A&S criado sem declarar `areas` nasce em ADM e simplesmente
 * NÃO APARECE para o time de A&S: erro visível, que alguém reporta em cinco minutos. O default oposto
 * (nascer em "todas as áreas") faria o menu novo aparecer para quem não devia, EM SILÊNCIO, que é a
 * falha que ninguém percebe.
 */
export const AREA_PADRAO_DO_MENU: Area[] = ["ADM"];

export interface MenuDef {
  /** Slug estável, chave em `menus` e em `usuario_menus`. */
  codigo: string;
  rotulo: string;
  /** Rota da tela no frontend. */
  href: string;
  grupo: GrupoMenu;
  ordem: number;
  /**
   * ÁREAS COM QUE ESTE MENU NASCE. Não é a autorização vigente.
   *
   * A FONTE DA AUTORIZAÇÃO É A TABELA `menus.areas`, escrita pela tela do diretor e lida pelos guards
   * (ver `MenuAreasService`). Este campo é consumido UMA vez, no INSERT do convergedor de boot, e
   * nunca mais: a partir daí quem manda é o banco.
   *
   * Foi por isso que a fonte mudou de lugar: marcar um menu para as duas áreas (o caso real é o
   * dashboard de Alto Volume, que interessa aos dois times) não pode depender da fábrica e de uma
   * subida de versão.
   *
   * LISTA, não valor único, porque um menu pode servir às duas áreas. OMITIR equivale a `["ADM"]`
   * (ver `AREA_PADRAO_DO_MENU`). Menu de A&S DEVE declarar `["AS"]` para nascer só lá.
   */
  areas?: Area[];
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
  {
    codigo: "inicio",
    rotulo: "Início",
    href: "/",
    grupo: "OPERACAO",
    ordem: 0,
    operacoes: [],
    // O ÚNICO MENU DAS DUAS ÁREAS na fundação, e tem de ser: carimbado só como ADM, o Início sumiria
    // da barra do time de A&S mesmo depois de o diretor liberar os menus deles, porque a área é um
    // teto que se aplica DEPOIS da marcação. É a home; ela não pode pertencer a uma frente só.
    areas: ["ADM", "AS"],
  },
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
    // A LEITURA DOS NOMES é reivindicada (melhoria EAC, item 13). O painel em si é contagem e segue
    // aberto, mas `nomes` devolve NOME de pessoa: operação não reivindicada não passa pelo guard e
    // ficaria alcançável por qualquer autenticado pela URL. Quem tem o Controle Gerencial vê
    // (decisão do diretor, §A.23/§A.6).
    operacoes: ["GerencialController.nomes"],
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
      // Desconsiderar conclui a frente e fecha a admissão: é mutação de status, reivindicada junto.
      "EsteiraController.desconsiderarIntegracao",
      "EsteiraController.relatorioClinicaPreview",
      "EsteiraController.relatorioClinicaCsv",
      "EsteiraController.anexarAso",
      "EsteiraController.salvarAgendamento",
      "AuditoriaController.documento",
      "ReauditoriaController.reauditar",
      "ReauditoriaController.validarPorHumano",
      "ReauditoriaController.descartar",
      // UNIFORME editável no modal do olho (melhoria EAC, item 11b). Fica no menu da ESTEIRA porque é
      // lá que a edição vive, e sai de graça para o COMUM, que já tem este menu: corrigir tamanho é
      // trabalho de consultor, com a trilha registrando quem mudou.
      "AdmissoesController.atualizarUniforme",
      // IMPORTAÇÃO DE MATRÍCULAS (item 11d): o botão vive na frente de CADASTRO, então o menu que a
      // governa é este. A PRÉVIA também é reivindicada, e não só a gravação: ela lê a planilha e
      // devolve NOME de candidato, e operação não reivindicada fica aberta a qualquer autenticado
      // (§A.23/§A.6).
      "AdmissoesController.previaMatriculas",
      "AdmissoesController.aplicarMatriculas",
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
    //
    // A IMPORTAÇÃO DE MATRÍCULAS MUDOU DE MENU junto com o botão: ela vive na frente de Cadastro
    // (decisão do diretor), então as operações passaram para o menu `esteira`. Deixá-las aqui daria
    // 403 para quem tem a Esteira e não tem o Gerenciador, que é justamente o time de cadastro.
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
  {
    // BENEFÍCIOS (§A.17 etapa 4): a FILA de quem tem benefício a cadastrar, tela de gestão da
    // operação. Não confundir com o menu `beneficios` da ADMINISTRAÇÃO, que é o CATÁLOGO (criar e
    // renomear benefício); este é o trabalho por pessoa, e por isso vive em OPERAÇÃO.
    //
    // §A.23: NASCE SÓ PARA O SUPER_ADMIN. Quem libera para os demais é o diretor, na tela de
    // permissão de menu por usuário. Não aparecer para os outros usuários não é bug.
    //
    // A OPERAÇÃO é reivindicada de propósito: leitura não reivindicada fica ABERTA a qualquer
    // autenticado, e esta devolve nome de candidato com cliente e pacote de benefício.
    codigo: "beneficios-fila",
    rotulo: "Benefícios",
    href: "/beneficios",
    grupo: "OPERACAO",
    ordem: 10,
    // A LEITURA e as ESCRITAS da tela, todas reivindicadas: operação não reivindicada fica ABERTA a
    // qualquer autenticado, e aqui há escrita no cadastro do candidato (§A.23/§A.6).
    operacoes: [
      "BeneficiosFilaController.listar",
      "BeneficiosFilaController.avancar",
      "BeneficiosFilaController.editarPacote",
      // REGRAS DE BENEFÍCIO POR CLIENTE (onda 2), o modal "Principais Informações". Ficam no menu de
      // quem cadastra e consulta a regra, que é este time (decisão do diretor).
      //
      // A LEITURA entra junto da escrita, e não fica aberta: operação não reivindicada é alcançável
      // por qualquer autenticado, e esta devolve a política comercial do cliente. Consequência a
      // registrar: quem NÃO tem este menu não lê as regras, inclusive de outra tela que venha a
      // querer mostrá-las.
      "RegrasBeneficioController.listar",
      "RegrasBeneficioController.salvar",
    ],
  },
  // ── Administração ─────────────────────────────────────────────────────────
  {
    // ALTO VOLUME (frente dos projetos sazonais, onda 1). Menu do GERENCIAL, primeiro da lista por
    // decisão do diretor (o card abre no topo do Menu Gerencial e a tela tem volta para ele).
    //
    // §A.23: NASCE SÓ PARA O SUPER_ADMIN. Quem libera para os demais é o diretor, na tela de
    // permissão de menu. Não aparecer para os outros usuários não é bug.
    //
    // A LEITURA DO CADASTRO (`list`, `obter`) fica FORA das operações de propósito: na onda 2 o modal
    // da Liberação lista os projetos do cliente, e o consultor COMUM não tem este menu. Gatar essa
    // leitura faria o seletor tomar 403, que é exatamente o defeito que já derrubou o dropdown do
    // Gerador de Kit.
    //
    // AS LEITURAS DE VÍNCULO (onda 3) SÃO A EXCEÇÃO, e entram na lista: `listarVinculos` e
    // `listarOrfaos` devolvem NOME DE CANDIDATO, servem só à conferência do projeto e não são usadas
    // por tela nenhuma da operação. Aberto onde a operação precisa, fechado onde é PII sem uso
    // operacional (§A.6).
    codigo: "alto-volume",
    rotulo: "Alto Volume",
    href: "/admin/alto-volume",
    grupo: "ADMIN",
    ordem: 19,
    operacoes: [
      "AltoVolumeController.create",
      "AltoVolumeController.update",
      "AltoVolumeController.reativar",
      "AltoVolumeController.remove",
      "AltoVolumeController.criarGrupo",
      "AltoVolumeController.atualizarGrupo",
      "AltoVolumeController.removerGrupo",
      "AltoVolumeController.criarVaga",
      "AltoVolumeController.atualizarVaga",
      "AltoVolumeController.removerVaga",
      // `analisar` NÃO entra aqui, e a ausência é deliberada. A ANÁLISE deixou de ser tela do Menu
      // Gerencial e virou página filha do Controle Gerencial (decisão do diretor: dashboard mora no
      // painel), então quem tem o painel liberado tem de conseguir ler os números. Fica no mesmo
      // regime do próprio Controle Gerencial, que é `operacoes: []`: leitura agregada, aberta, com a
      // TELA gatada pelo menu `diretoria` no guard de rota. §A.6 conferido, o retorno é contagem,
      // código e rótulo de catálogo (cargo, cliente), sem CPF e sem nome de candidato. As leituras
      // que DEVOLVEM NOME (`listarVinculos`, `listarOrfaos`) seguem fechadas logo abaixo.
      "AltoVolumeController.listarVinculos",
      "AltoVolumeController.listarOrfaos",
      "AltoVolumeController.vincular",
      "AltoVolumeController.vincularEmLote",
      "AltoVolumeController.atualizarVinculo",
      "AltoVolumeController.desvincular",
    ],
  },
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
    // SALA DE ESPERA (pré-processo, antes da Liberação). Menu OPERACIONAL.
    // §A.23: menu novo nasce só para o SUPER_ADMIN; quem enxerga é o diretor que libera.
    codigo: "sala-espera",
    rotulo: "Sala De Espera",
    href: "/sala-espera",
    grupo: "OPERACAO",
    ordem: 5,
    // Só as mutações. As leituras (fila, catálogo de status ativos) ficam abertas, como na esteira:
    // são dado de trabalho, e a tela de status do Gerencial também as consome.
    operacoes: [
      "SalaEsperaController.criar",
      "SalaEsperaController.atualizar",
      // O vínculo é acionado da LIBERAÇÃO, não da Sala, mas é mutação DA SALA: reivindicado aqui.
      "SalaEsperaController.vincular",
    ],
  },
  {
    // CATÁLOGO DE STATUS DA SALA (Gerencial). Menu SEPARADO do operacional de propósito: manter a
    // lista de status é administração, operar a fila não, e o diretor libera os dois de forma
    // independente. §A.23: nasce só para o SUPER_ADMIN.
    codigo: "sala-espera-status",
    rotulo: "Status Da Sala De Espera",
    href: "/admin/sala-espera-status",
    grupo: "ADMIN",
    ordem: 26,
    operacoes: [
      "SalaEsperaController.criarStatus",
      "SalaEsperaController.atualizarStatus",
    ],
  },
  {
    // INTEGRAÇÃO OBRIGATÓRIA POR CLIENTE (onda 5 da frente Integração). Menu do GERENCIAL.
    // §A.23: nasce só para o SUPER_ADMIN.
    codigo: "integracao-clientes",
    rotulo: "Integração Por Cliente",
    href: "/admin/integracao-clientes",
    grupo: "ADMIN",
    ordem: 25,
    operacoes: ["IntegracaoClientesController.definir"],
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
    /**
     * MENU GERENCIAL DO IFRACTAL (frente iFractal). Gestão das admissões no sistema de ponto e o
     * gerenciamento da lista de status.
     *
     * §A.23: NASCE SÓ PARA O SUPER_ADMIN. O convergedor de boot REGISTRA o menu no catálogo, para
     * ele existir e ser selecionável, e para por aí. Quem enxerga é decisão do diretor, na tela de
     * liberação de menu por usuário. Não aparecer para os demais NÃO é defeito.
     */
    codigo: "ifractal",
    rotulo: "iFractal",
    href: "/ifractal",
    grupo: "ADMIN",
    ordem: 26,
    // A tela de gestão E o CRUD da lista de status vivem no mesmo controller, então uma entrada só.
    // A ABA da Esteira NÃO entra aqui: ela é servida pela rota genérica da Esteira e pertence ao
    // menu `esteira`, que o time do ADM já tem.
    operacoes: ["IfractalController.*"],
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
    // ÁREA POR MENU: a tela onde o diretor decide que áreas enxergam cada menu.
    //
    // EXCLUSIVA DO SUPER_ADMIN, e por um motivo mais forte que a régua de sempre: ela escreve a FONTE
    // DA AUTORIZAÇÃO POR ÁREA. Quem a alcança redefine o que cada time enxerga no sistema inteiro, sem
    // tocar em usuário nenhum. Por isso entra também em `MENUS_SOMENTE_SUPER_ADMIN`, que a tira até da
    // barra lateral dos demais, e não só das operações.
    //
    // `operacoes: []` pelo mesmo motivo de `usuarios` e `diagnostico`: a controller é `@Roles`
    // SUPER_ADMIN, então marcá-la para outra pessoa não concederia nada (fail-closed no RolesGuard).
    codigo: "menu-areas",
    rotulo: "Área Por Menu",
    href: "/admin/menu-areas",
    grupo: "ADMIN",
    ordem: 32,
    operacoes: [],
  },
  {
    codigo: "usuarios",
    rotulo: "Usuários",
    href: "/admin/usuarios",
    grupo: "ADMIN",
    ordem: 29,
    // A tela de USUÁRIOS (que é a própria tela de configuração de menus) é restrita ao SUPER_ADMIN
    // pelo `@Roles` da controller. Por isso NÃO é reivindicada por menu: marcar "usuarios" para um
    // COMUM não concederia gestão de usuários (fail-closed pelo RolesGuard), e delegar a configuração
    // de menus a um não-admin seria escalonamento de privilégio.
    //
    // A RESTRIÇÃO APERTOU na segmentação de área (decisão do diretor): era MASTER + SUPER_ADMIN, e
    // passou a SUPER_ADMIN só. O motivo é a porta dos fundos: esta é a tela onde as ÁREAS são
    // cadastradas, então um Master que a alcançasse poderia se conceder a área que quisesse e a
    // segmentação inteira viraria decorativa.
    operacoes: [],
  },
  // ── Atração e Seleção ─────────────────────────────────────────────────────
  {
    /**
     * CENTRAL DE VAGAS (A&S, onda 1). Primeiro menu do módulo de Atração e Seleção.
     *
     * NASCE EM `areas: ["AS"]` e isso é obrigatório: sem declarar, o default é ADM (ver
     * `AREA_PADRAO_DO_MENU`) e o menu simplesmente não apareceria para o time de A&S.
     *
     * QUEM ENXERGA É DECISÃO DO DIRETOR (§A.23). O convergedor do boot REGISTRA o menu no catálogo
     * (para ele existir e ser selecionável na tela de liberação) e para por aí; nenhuma concessão
     * acontece aqui. Não aparecer para os demais usuários não é bug.
     *
     * A CONTROLLER INTEIRA é reivindicada, LEITURA INCLUÍDA, diferente dos catálogos da Admissão. É
     * deliberado: enquanto o módulo é novo e liberado a ninguém, ele precisa ser invisível E inerte,
     * inclusive pela URL da API.
     */
    codigo: "as-vagas",
    rotulo: "Central De Vagas",
    href: "/as/vagas",
    grupo: "SELECAO",
    ordem: 40,
    areas: ["AS"],
    operacoes: ["VagasController.*"],
  },
];

/** Menus sempre visíveis, independentemente de configuração (a home nunca some). */
export const MENU_SEMPRE_VISIVEL = new Set<string>(["inicio"]);

/** Todos os códigos de menu. */
export const TODOS_CODIGOS_MENU = MENUS.map((m) => m.codigo);

// ── SEGMENTAÇÃO POR ÁREA ────────────────────────────────────────────────────
//
// A REGRA, em uma frase: o usuário enxerga um menu quando há INTERSEÇÃO entre as áreas dele e as do
// menu. O SUPER_ADMIN está acima disso e nunca é filtrado.
//
// A ÁREA NUNCA CONCEDE, SÓ LIMITA. Ela é um TETO aplicado por cima da permissão de menu que já
// existia: quem não tinha o menu continua sem ele, e quem tinha só o perde se estiver fora da área.
// É essa propriedade que tornou a virada segura, e é ela que precisa ser preservada em qualquer
// mudança futura aqui. No dia da virada, todo usuário é [ADM] e todo menu é [ADM]: interseção sempre
// não vazia, ninguém perde nada.

/**
 * Áreas com que um menu NASCE, aplicando o default de `AREA_PADRAO_DO_MENU`.
 *
 * NÃO É A AUTORIZAÇÃO VIGENTE. Quem responde "este menu é de que área HOJE" é o `MenuAreasService`,
 * que lê a tabela. Esta função é consumida no INSERT do convergedor e nos testes de nascimento.
 */
export function areasDeNascimento(menu: MenuDef): Area[] {
  return menu.areas && menu.areas.length > 0 ? menu.areas : AREA_PADRAO_DO_MENU;
}

/** Índice `codigo -> áreas de NASCIMENTO`, para o convergedor semear menu novo. */
export const AREAS_DE_NASCIMENTO: Map<string, Area[]> = new Map(
  MENUS.map((m) => [m.codigo, areasDeNascimento(m)]),
);

/**
 * Há interseção entre dois conjuntos de área? É a regra de visibilidade inteira, em uma linha.
 *
 * PURA DE PROPÓSITO: quem BUSCA as áreas (a tabela, via cache) fica no serviço, e a REGRA fica aqui,
 * testável sem banco. Conjunto vazio de qualquer lado devolve `false`, que é o fail-closed: usuário
 * sem área não vê nada, e menu sem área não é visto por ninguém.
 */
export function temIntersecao(a: Iterable<Area>, b: Iterable<Area>): boolean {
  const outro = new Set(b);
  for (const x of a) if (outro.has(x)) return true;
  return false;
}

/**
 * ÁREA DAS SUPERFÍCIES QUE SÓ O `@Roles` PROTEGE, e é a correção do buraco que o levantamento achou.
 *
 * O SISTEMA TEM DUAS AUTORIZAÇÕES INDEPENDENTES: o `MenuGuard`, por operação derivada do menu, e o
 * `RolesGuard`, por papel puro. Filtrar área só no primeiro deixaria 12 superfícies de fora, porque
 * elas são gatadas por `@Roles` e NENHUM menu as reivindica: as controllers inteiras de Usuários e
 * Diagnóstico, mais handlers soltos de admissão, não conformidade, cliente e catálogos.
 *
 * A CONSEQUÊNCIA, se ficassem de fora: um Master de A&S alcançaria a tela de Usuários pela API,
 * cadastraria a si mesmo na área ADM e a segmentação inteira viraria decorativa, no exato ponto em
 * que precisa ser dura.
 *
 * ESTE MAPA COBRE SÓ O QUE O MENU NÃO COBRE. Quando a operação é reivindicada por um menu, a área sai
 * do menu (fonte única). Este mapa é a segunda tentativa, por controller, e o default é ADM.
 */
export const AREA_POR_CONTROLLER: Map<string, Area[]> = new Map([
  // Controllers inteiras sob `@Roles`, que nenhum menu reivindica (`operacoes: []`).
  ["UsersController", ["ADM"] as Area[]],
  ["DiagnosticoController", ["ADM"] as Area[]],
  // Handlers soltos sob `@Roles` dentro de controllers cujo menu não os reivindica: trocarCliente,
  // corrigirCpf, recusar, reativarRecusada e deletar (admissões); decidirLiberacao (não
  // conformidades); removerVinculo (clientes); addMotivo/addBeneficio/addEscala (catálogos). Todos
  // pertencem à Admissão, então a marcação por controller já resolve os três casos.
  ["AdmissoesController", ["ADM"] as Area[]],
  ["NaoConformidadesController", ["ADM"] as Area[]],
  ["ClientesController", ["ADM"] as Area[]],
  ["CatalogosController", ["ADM"] as Area[]],
]);

/**
 * PADRÃO DO COMUM (decisão do diretor, 24/07/2026): o consultor COMUM enxerga TODO o grupo OPERAÇÃO
 * por padrão (os 8 menus, INCLUINDO o Gerador de kit), e a Administração fica como concessão pontual,
 * usuário a usuário. Isto INVERTE o grandfather original, que dava só "o que o papel já via" (Operação
 * MENOS o Gerador de kit): aquele recorte vinha INTERROMPENDO a operação (cliente e cargo sumindo na
 * Liberação, Gerador de kit indisponível). Administração NUNCA entra no padrão do COMUM.
 *
 * A SEGUNDA TRAVA DA §A.23 MORA AQUI: o filtro é "grupo OPERACAO **e** área de NASCIMENTO ADM".
 *
 * NASCIMENTO, e não a área vigente da tabela, de propósito: esta lista é uma constante de módulo,
 * consumida por scripts de carga que rodam fora do processo do backend. Amarrá-la ao nascimento a
 * torna estável e fail-closed: um menu que nasceu de A&S nunca entra no padrão do COMUM, mesmo que o
 * diretor depois o marque também como ADM. Conceder em massa é a operação que precisa ser conservadora.
 *
 * A primeira trava é os menus de A&S nascerem em GRUPO PRÓPRIO, nunca em OPERACAO. Esta é a de
 * reserva, e existe porque a primeira depende de disciplina humana: se um dia alguém criar um menu de
 * A&S no grupo OPERACAO por engano, o `backfill-menus-comum` continuará não o entregando a ninguém.
 * Uma trava sozinha protege enquanto todo mundo lembra; duas protegem por construção.
 *
 * É exatamente o incidente que originou a §A.23, com o alcance ampliado: lá um backfill concedeu dois
 * menus a três usuários como efeito colateral; aqui ele entregaria o módulo de A&S inteiro a TODO
 * consultor COMUM.
 */
export const MENUS_PADRAO_COMUM = MENUS.filter(
  (m) => m.grupo === "OPERACAO" && areasDeNascimento(m).includes("ADM"),
).map((m) => m.codigo);

/**
 * Códigos que um papel recebe por PADRÃO, pelo PAPEL apenas.
 *
 * NÃO RECORTA POR ÁREA, e a ausência é o ponto: a área vigente mora na TABELA, e esta é uma função
 * pura de módulo, que não alcança o banco. Quem aplica o teto de área é o `MenuAreasService`, sobre o
 * resultado desta função (ver `/auth/me` e a criação de usuário). Recortar aqui por um mapa de código
 * criaria a SEGUNDA FONTE de autorização que esta frente existiu para eliminar.
 *
 * O MASTER recebe todos os menus porque manda na área dele, e é o teto de área aplicado depois que
 * transforma "todos" em "todos os da minha área". O SUPER_ADMIN recebe tudo e não é recortado.
 */
export function codigosPadraoDoPapel(papel: string): string[] {
  if (papel === "SUPER_ADMIN") return TODOS_CODIGOS_MENU;
  // `filtrarMenusPorPapel` tira o que é exclusivo do SUPER_ADMIN (hoje, a tela de Usuários).
  const base = papel === "MASTER" ? TODOS_CODIGOS_MENU : MENUS_PADRAO_COMUM;
  return filtrarMenusPorPapel(base, papel);
}

/**
 * Menus que NÃO podem ser concedidos a um COMUM em hipótese alguma: as controllers de Diagnóstico e
 * Usuários são `@Roles` admin-only, então marcar para um COMUM só faria o menu APARECER e o backend
 * BARRAR os dados (tela vazia / erro confuso). São filtrados ao salvar a config de um COMUM
 * (`definirMenusDoUsuario`) e a tela de configuração os desabilita para COMUM. Já ficam fora do padrão
 * por construção (padrão = só Operação, e estes são Administração).
 */
export const MENUS_BLOQUEADOS_COMUM = new Set<string>(["diagnostico", "usuarios", "menu-areas"]);

/**
 * MENUS QUE SÓ O SUPER_ADMIN ENXERGA, e o "enxerga" é literal: o menu nem entra na lista que o
 * `/auth/me` devolve, então a barra lateral e o Menu Gerencial não desenham o card.
 *
 * POR QUE ISTO EXISTE (decisão do diretor). A tela de Usuários já era exclusiva do SUPER_ADMIN no
 * backend (`@Roles("SUPER_ADMIN")` na controller), mas continuava APARECENDO para o Master, que
 * abria e tomava 403 em tudo o que tentasse. Mostrar a porta e trancá-la é pior do que não mostrar
 * a porta: vira chamado, e ensina que o sistema está quebrado quando ele está apenas correto.
 *
 * NÃO SUBSTITUI A TRAVA DO BACKEND, e essa distinção é o ponto todo. O `@Roles` continua onde
 * estava e continua sendo a autoridade; isto é a camada de UX que para de oferecer o que o backend
 * não vai conceder. Esconder sem trancar seria segurança por obscuridade; trancar sem esconder é o
 * que estava incomodando. As duas coisas juntas é o certo.
 *
 * É CONJUNTO E NÃO FLAG NO `MenuDef` de propósito: o par com `MENUS_BLOQUEADOS_COMUM` deixa as duas
 * regras de visibilidade por papel lado a lado, no mesmo lugar onde já se procura por elas.
 */
export const MENUS_SOMENTE_SUPER_ADMIN = new Set<string>(["usuarios", "menu-areas"]);

/**
 * Remove do conjunto os menus restritos ao SUPER_ADMIN. Aplicado ao RESULTADO, e não à origem, para
 * valer igual nos três caminhos: o Master (que recebe todos os menus da área), o COMUM (que recebe
 * os marcados) e uma marcação antiga que porventura tenha gravado `usuarios` para alguém.
 */
export function filtrarMenusPorPapel(codigos: Iterable<string>, papel: string): string[] {
  if (papel === "SUPER_ADMIN") return [...codigos];
  return [...codigos].filter((c) => !MENUS_SOMENTE_SUPER_ADMIN.has(c));
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
