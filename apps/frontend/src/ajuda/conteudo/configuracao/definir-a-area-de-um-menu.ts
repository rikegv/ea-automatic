import type { Artigo } from "../../tipos";

/**
 * ÁREA POR MENU: o teto que decide quais times enxergam cada tela do sistema.
 *
 * ┌─ A PRÉVIA DE IMPACTO É PASSO, NÃO ARTIGO SEPARADO, E O MOTIVO ESTÁ NA TELA ──────────────────┐
 * │ Conferido no código antes de escrever: enquanto não existir uma prévia calculada PARA A         │
 * │ MARCAÇÃO ATUAL, o botão da direita é Conferir impacto, e o de salvar nem aparece. Qualquer      │
 * │ mudança nas caixas descarta a prévia e o botão volta a ser o de conferir. Ou seja, a conferência │
 * │ não é uma tela opcional que mereceria peça própria: ela é o passo obrigatório do meio.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a prévia lista NOME e PAPEL de quem perde o acesso. O artigo descreve a LISTA, e em nenhum
 * lugar copia uma pessoa vista em tela, fixture ou base.
 *
 * PAPEL, conferido no backend: a classe inteira de
 * `apps/backend/src/admin/menu-areas/menu-areas.controller.ts` é `@Roles("SUPER_ADMIN")`, e o menu
 * também está na lista dos que só o Super Admin enxerga (`domain/menus.ts`). É exclusiva, e a
 * exclusividade aqui é mais dura que o normal: esta tela escreve a fonte da autorização por área.
 */
export const artigo: Artigo = {
  slug: "definir-a-area-de-um-menu",
  titulo: "Definir A Área De Um Menu",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/menu-areas"],
  menus: ["menu-areas"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "acesso-e-usuarios",
  resumo:
    "Como decidir quais áreas enxergam cada menu do sistema, e por que o sistema só deixa salvar depois de mostrar quem perde o acesso com a mudança.",
  termos: [
    "area por menu",
    "area do menu",
    "quem ve esse menu",
    "menu de outra area",
    "segmentacao de area",
    "admissao e selecao",
    "tirar menu de uma area",
    "impacto da mudanca",
  ],
  preRequisitos: [
    "Ter a decisão de quais áreas devem enxergar aquele menu: a mudança vale na hora, para todo mundo.",
  ],
  passos: [
    {
      gesto: "Abra Área Por Menu, na Administração.",
      controles: ["Área Por Menu"],
    },
    {
      gesto: "Ache o menu na tabela.",
      detalhe:
        "As colunas são Menu, Rota, Grupo e Áreas. A coluna Áreas mostra as áreas vigentes daquele menu, ou a etiqueta Todas As Áreas quando ele atende a todas.",
      controles: ["Menu", "Rota", "Grupo", "Áreas", "Todas As Áreas"],
    },
    {
      gesto: "Clique em Alterar áreas deste menu, no fim da linha.",
      controles: ["Alterar áreas deste menu"],
    },
    {
      gesto: "Marque as áreas que devem enxergar o menu.",
      detalhe:
        "Quem estiver em alguma das áreas marcadas enxerga o menu. Fora delas, ele deixa de existir, mesmo para quem já o tinha liberado no cadastro de usuários.",
    },
    {
      gesto: "Clique em Conferir impacto.",
      detalhe:
        "É o passo obrigatório: enquanto a prévia não for calculada para a marcação que está na tela, o botão de salvar nem aparece.",
      controles: ["Conferir impacto"],
    },
    {
      gesto: "Leia o bloco Impacto Da Mudança antes de decidir.",
      detalhe:
        "Ele lista, com nome e papel, cada pessoa que deixa de ver o menu, e diz quantas passam a vê-lo. Se aparecer alguém que não deveria perder, ajuste a marcação em vez de salvar.",
      controles: ["Impacto Da Mudança"],
    },
    {
      gesto: "Clique em Salvar áreas.",
      detalhe: "A mudança vale na hora, sem ninguém precisar sair e entrar de novo.",
      controles: ["Salvar áreas"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de salvar não aparece.",
      acao: "A prévia ainda não foi calculada para esta marcação. Clique em Conferir impacto, leia quem perde o acesso e só então salve.",
    },
    {
      sintoma: "Você conferiu o impacto, mudou uma caixa e o botão voltou a ser o de conferir.",
      acao: "É proposital: a prévia vale para a marcação que foi conferida. Mudou a marcação, confira de novo.",
    },
    {
      sintoma: "O sistema recusa deixar o menu sem nenhuma área.",
      acao: "Um menu precisa de pelo menos uma área. Sem área, ele deixaria de existir para todo mundo. Para tirar um menu de circulação, o caminho é a liberação por usuário.",
    },
    {
      sintoma: "O sistema recusa restringir o menu Início.",
      acao: "O Início atende todas as áreas e não pode ser restrito: sem ele, uma área inteira ficaria sem nenhum item na barra lateral.",
    },
    {
      sintoma: "Alguém perdeu um menu logo depois da mudança.",
      acao: "É o efeito anunciado na prévia: a área é o teto e vem antes da liberação individual. Para devolver, marque de novo a área daquele menu ou ajuste a área da pessoa no cadastro de usuários.",
    },
  ],
  regras: [
    "A área do menu é o teto: fora dela, ninguém alcança a tela, nem com o menu liberado no cadastro.",
    "Não se salva sem conferir o impacto, e a prévia vale só para a marcação conferida.",
    "Todo menu tem pelo menos uma área.",
    "O menu Início não aceita restrição de área.",
    "A mudança vale na hora, para todos os usuários.",
  ],
  relacionados: [
    "liberar-os-menus-de-um-usuario",
    "cadastrar-um-usuario",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/menu-areas/page.tsx",
    "apps/backend/src/admin/menu-areas/menu-areas.controller.ts",
    "apps/backend/src/auth/menu-areas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
