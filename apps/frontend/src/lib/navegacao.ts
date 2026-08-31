import type { IconName } from "@/components/ui/Icon";
import { podeAbrirAdministracao } from "@/lib/admin-menus";

/**
 * A NAVEGAÇÃO DO SISTEMA, EM UM LUGAR SÓ.
 *
 * ┌─ POR QUE ESTA LISTA SAIU DA BARRA LATERAL ──────────────────────────────────────────────────┐
 * │ A barra lateral e a TELA INICIAL mostram o mesmo conjunto de destinos, cada uma do seu jeito │
 * │ (linha na barra, card na home). Enquanto a lista morava dentro do `Sidebar.tsx`, a home só   │
 * │ poderia repeti-la, e duas cópias divergem no primeiro menu novo: a barra mostraria a Central │
 * │ De Candidatos e a home não, ou o contrário, sem ninguém perceber até alguém reclamar.        │
 * │                                                                                             │
 * │ É exatamente o problema que o `admin-menus.ts` já resolveu para a camada de administração,   │
 * │ e a solução aqui é a mesma: UMA lista, dois consumidores.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.23 CONTINUA VALENDO E NADA AQUI CONCEDE ACESSO. Quem decide o que cada pessoa enxerga é o
 * `codigo` do menu, conferido por `temMenu` (que vem do `/auth/me`). Este arquivo só diz QUAIS
 * destinos existem e em que ordem; a permissão continua sendo do diretor, na tela de liberação.
 */

export interface NavDef {
  href: string;
  icon: IconName;
  label: string;
  /** Código do menu (OST permissão de menu): a visibilidade segue `temMenu(codigo)`. */
  codigo: string;
  /**
   * Uma linha do que a tela faz, para o card da tela inicial. A barra lateral não usa (lá só cabe o
   * rótulo), mas mora aqui junto do destino: descrição em arquivo separado voltaria a ser a segunda
   * lista que este módulo existe para não ter.
   */
  descricao: string;
  /** Faixa vermelha premium (tela crítica / principal indicador). */
  critical?: boolean;
}

export const OPERACAO: NavDef[] = [
  {
    href: "/",
    icon: "home",
    label: "Início",
    codigo: "inicio",
    descricao: "Atalhos para as telas que você tem liberadas.",
  },
  // CONTROLE GERENCIAL (OST do dashboard executivo). Item NOVO: como todo menu novo, ele só aparece
  // para quem tem o código `diretoria`, e o código nasce concedido apenas ao SUPER_ADMIN (§A.23).
  // Quem libera para os demais é o diretor, na tela de permissão de menu. O código continua
  // `diretoria` mesmo com o rótulo novo: é a chave das liberações já concedidas.
  //
  // A "Análise Gerencial" (casca com dado mock) foi DELETADA nesta OST, por decisão do diretor.
  {
    href: "/diretoria",
    icon: "peak",
    label: "Controle Gerencial",
    codigo: "diretoria",
    descricao: "Indicadores da operação para a diretoria: volume, prazo e conclusão.",
  },
  // SALA DE ESPERA: entra AQUI, entre o Controle Gerencial e a Liberação, porque é isso que a
  // sequência do processo diz. Ela é o passo ANTERIOR à Liberação: o candidato que o cliente ou a
  // Seleção anunciou e que ainda nem se candidatou no Pandapé.
  //
  // Ícone `users` (fila de pessoas), e NÃO o relógio: o `clock` já é da Liberação, o item logo
  // abaixo, e dois vizinhos com o mesmo desenho se confundem na varredura da barra. Aqui o que
  // distingue é o sujeito (as pessoas que aguardam), não a espera, que os dois compartilham.
  {
    href: "/sala-espera",
    icon: "users",
    label: "Sala De Espera",
    codigo: "sala-espera",
    descricao: "Candidatos anunciados que ainda não entraram no processo seletivo.",
  },
  // 4º item, com destaque vermelho: é a tela crítica (pré-admissões aguardando liberação).
  {
    href: "/liberacao",
    icon: "clock",
    label: "Liberação Admissional",
    codigo: "liberacao",
    descricao: "Fila crítica: pré-admissões aguardando liberação para seguir.",
    critical: true,
  },
  {
    href: "/nova",
    icon: "plus",
    label: "Nova Admissão",
    codigo: "nova",
    descricao: "Cadastrar candidato em três etapas: cliente, vaga e dados pessoais.",
  },
  {
    href: "/esteira",
    icon: "layers",
    label: "Esteira Admissional",
    codigo: "esteira",
    descricao: "Faróis de auditoria, exame e cadastro: operação por frente.",
  },
  {
    href: "/nao-conformidades",
    icon: "alert",
    label: "Não Conformidades",
    codigo: "nao-conformidades",
    descricao: "Registro e tratativa das ocorrências abertas na esteira.",
  },
  {
    href: "/gerenciador",
    icon: "table",
    label: "Gerenciador",
    codigo: "gerenciador",
    descricao: "Todas as admissões em tabela, com filtros e busca global.",
  },
];

// Gerador de kit (motor de extração, OST): tela própria. Visibilidade agora pelo menu `gerador-kit`
// (OST permissão de menu), não mais só por `isAdmin`. Continua na navegação principal.
export const GERADOR_KIT: NavDef = {
  href: "/gerador-kit",
  icon: "pen",
  label: "Gerador De Kit",
  codigo: "gerador-kit",
  descricao: "Monta o kit admissional a partir do PDF-mãe, um por candidato.",
};

// Gerenciamento de assinatura (INT-4): fila dos envelopes da Clicksign e as ações de gestão
// (solicitar, cancelar, reenviar por correção). Visibilidade pelo menu `assinaturas`.
export const ASSINATURAS: NavDef = {
  href: "/assinaturas",
  icon: "doc",
  label: "Ass. Click",
  codigo: "assinaturas",
  descricao: "Gestão das assinaturas: enviadas, assinadas e canceladas.",
};

// BENEFÍCIOS (§A.17 etapa 4): a fila de quem tem benefício a cadastrar. Tela de gestão da operação,
// distinta do CATÁLOGO de benefícios, que vive no Menu Gerencial. Visibilidade pelo menu
// `beneficios-fila`, que nasce só para o SUPER_ADMIN (§A.23): não aparecer para os demais não é bug.
//
// Ícone `tag` (etiqueta do que a pessoa recebe), e não `users` nem `doc`, que já são de vizinhos na
// barra e se confundiriam na varredura.
export const BENEFICIOS: NavDef = {
  href: "/beneficios",
  icon: "tag",
  label: "Benefícios",
  codigo: "beneficios-fila",
  descricao: "Fila de quem tem pacote de benefício a cadastrar.",
};

// Assinante Da Empresa (INT-4) NÃO entra aqui: por decisão do diretor a tela vive SÓ no Menu
// Gerencial, como sempre foi. Quem tem o menu chega nela pelo card do Gerencial; a barra lateral não
// ganha item para essa rota.

// ATRAÇÃO E SELEÇÃO: grupo PRÓPRIO na barra, e não mais um item dentro de Operação. A barra passa a
// servir dois times, e o grupo é o que separa visualmente o módulo de Admissão do de A&S para quem
// um dia tiver as duas áreas. Visibilidade pelos menus `as-vagas` e `as-candidatos`, que nascem só
// para o SUPER_ADMIN (§A.23): não aparecer para os demais não é bug, é o diretor ainda não ter
// liberado.
export const SELECAO: NavDef[] = [
  {
    href: "/as/vagas",
    icon: "table",
    label: "Central De Vagas",
    codigo: "as-vagas",
    descricao: "Aberturas de vaga do processo seletivo, com código próprio.",
  },
  /**
   * CENTRAL DE CANDIDATOS: a entrada estava FALTANDO na barra (achado de 27/08).
   *
   * A tela existia, a rota existia e o menu `as-candidatos` já estava registrado no catálogo, mas
   * este array nunca ganhou a linha: o resultado é que a única forma de chegar na tela era colar a
   * URL. É o mesmo buraco do `clinicas` em 29/07 (§A.23), com a diferença de que lá faltava o
   * registro e aqui faltava o item de navegação.
   *
   * §A.23 CONTINUA VALENDO E NADA FOI CONCEDIDO A NINGUÉM: quem decide a visibilidade é o `codigo`,
   * e `as-candidatos` nasce só para o SUPER_ADMIN. Acrescentar a linha aqui não libera o menu para
   * usuário nenhum, só faz o item aparecer para quem JÁ tem permissão de ver a tela. Não aparecer
   * para os demais segue não sendo bug.
   *
   * ÍCONE `filter`, que é o FUNIL: é a tela do funil de seleção, a ponto de a própria página ter um
   * funil como marca d'água. `users` já é da Sala De Espera e `table` já é do Gerenciador e da
   * Central De Vagas, então nenhum dos dois distinguiria a linha na varredura da barra.
   */
  {
    href: "/as/candidatos",
    icon: "filter",
    label: "Central De Candidatos",
    codigo: "as-candidatos",
    descricao: "Funil da seleção: etapas, movimentação e trilha do candidato.",
  },
];

/**
 * MENU GERENCIAL. Não é um `NavDef` comum porque a visibilidade dele NÃO é `temMenu` de um código:
 * é `isAdmin` OU ter ao menos um menu que abre a camada `/admin` (ver `admin-menus.ts`). Quem
 * consumir esta constante precisa aplicar essa regra, e é o que `gruposDeNavegacao` faz.
 */
export const MENU_GERENCIAL = {
  href: "/admin",
  icon: "cog" as IconName,
  label: "Menu Gerencial",
  descricao: "Cadastros e catálogos: clientes, cargos, régua, usuários e permissões.",
};

export interface GrupoNav {
  titulo: string;
  itens: { href: string; icon: IconName; label: string; descricao: string }[];
}

/**
 * OS GRUPOS QUE ESTA PESSOA ENXERGA, já filtrados. É o que a TELA INICIAL consome para montar os
 * cards, e é a mesma régua que a barra lateral aplica item a item.
 *
 * `incluirInicio` existe por um motivo só: na própria tela inicial, um card "Início" seria um link
 * para a página em que a pessoa já está. A barra lateral, essa sim, continua mostrando o Início.
 */
export function gruposDeNavegacao(
  temMenu: (codigo: string) => boolean,
  isAdmin: boolean,
  { incluirInicio = true }: { incluirInicio?: boolean } = {},
): GrupoNav[] {
  const grupos: GrupoNav[] = [];

  const operacao = [...OPERACAO, GERADOR_KIT, ASSINATURAS, BENEFICIOS].filter(
    (n) => temMenu(n.codigo) && (incluirInicio || n.codigo !== "inicio"),
  );
  if (operacao.length) grupos.push({ titulo: "Operação", itens: operacao });

  // O grupo só existe para quem tem ao menos um menu dele, então nunca abre um cabeçalho órfão
  // sobre uma lista vazia para o time da Admissão.
  const selecao = SELECAO.filter((n) => temMenu(n.codigo));
  if (selecao.length) grupos.push({ titulo: "Atração e Seleção", itens: selecao });

  if (isAdmin || podeAbrirAdministracao(temMenu)) {
    grupos.push({ titulo: "Administração", itens: [MENU_GERENCIAL] });
  }

  return grupos;
}
