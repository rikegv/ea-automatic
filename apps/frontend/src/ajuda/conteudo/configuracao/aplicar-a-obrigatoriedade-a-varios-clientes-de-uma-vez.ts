import type { Artigo } from "../../tipos";

/**
 * A APLICAÇÃO EM MASSA da obrigatoriedade, na mesma tela do interruptor individual.
 *
 * O QUE ELA COBRE: reduzir a lista pela busca, selecionar os clientes filtrados, escolher o campo e
 * mandar desligar ou religar para todos de uma vez, lendo a confirmação que diz quantos são.
 *
 * O QUE ELA NÃO REEXPLICA: a mecânica de seleção múltipla (marcar, desmarcar, o que a seleção
 * significa quando a busca muda), que já está escrita uma vez na trilha de começar aqui e é
 * delegada por relacionados.
 *
 * O QUE ELA NÃO COBRE: o ajuste fino de um cliente só, que é a peça irmã, e o efeito de cada campo,
 * que está escrito lá.
 */
export const artigo: Artigo = {
  slug: "aplicar-a-obrigatoriedade-a-varios-clientes-de-uma-vez",
  titulo: "Aplicar A Obrigatoriedade A Vários Clientes De Uma Vez",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/pendencias-cliente"],
  menus: ["pendencias-cliente"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "cadastros-do-cliente",
  resumo:
    "Como desligar ou religar o mesmo campo obrigatório para dezenas de clientes de uma vez, usando a busca para montar a seleção e a confirmação para conferir o alcance antes de aplicar.",
  termos: [
    "aplicar em massa",
    "varios clientes",
    "desligar para todos",
    "religar para todos",
    "selecionar clientes",
    "obrigatoriedade em lote",
    "alterar em lote",
  ],
  preRequisitos: [
    "Saber qual campo vai ser alterado e para qual conjunto de clientes: a confirmação diz quantos são, mas não diz quais.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Obrigatoriedade Por Cliente e use a busca para reduzir a lista.",
      detalhe:
        "A busca procura por nome, operação e código ao mesmo tempo. Ela só reduz a lista: quem manda na alteração é a seleção.",
      controles: ["Obrigatoriedade Por Cliente", "Buscar por nome, operação ou código…"],
    },
    {
      gesto: "Selecione os clientes, um a um ou todos os filtrados de uma vez.",
      detalhe: "O contador ao lado diz quantos clientes estão selecionados no momento.",
      controles: ["Desmarcar os filtrados", "Limpar seleção"],
    },
    {
      gesto: "Na faixa que aparece abaixo, encontre o campo que você quer alterar.",
      detalhe:
        "Cada campo tem duas ações separadas, e não um alternar: em massa os selecionados podem estar em estados diferentes, então é preciso dizer para onde eles vão.",
      controles: ["desligar", "religar"],
    },
    {
      gesto: "Clique em desligar ou em religar e leia a confirmação.",
      detalhe:
        "A confirmação diz quantos clientes são alcançados e o que muda para eles antes de qualquer coisa ser gravada.",
    },
    {
      gesto: "Clique em Aplicar para confirmar.",
      detalhe: "O aviso no topo informa o campo alterado e a quantos clientes ele chegou.",
      controles: ["Aplicar", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Cliquei em desligar e nada mudou na lista.",
      acao: "O clique abre a confirmação, não aplica. Leia o que ela diz e clique em Aplicar.",
    },
    {
      sintoma: "A faixa de ação em massa não aparece.",
      acao: "Ela só existe quando há ao menos um cliente selecionado. Marque a caixa de um cliente, ou use o botão que seleciona todos os filtrados.",
    },
    {
      sintoma: "Apliquei e não sei em quais clientes a alteração entrou.",
      acao: "O aviso do topo diz a quantos clientes ela chegou. Para conferir cliente a cliente, abra a linha de cada um: ela mostra quantos itens estão desligados.",
    },
  ],
  regras: [
    "A busca só reduz a lista na tela: a alteração alcança exatamente quem está selecionado.",
    "Em massa não existe alternar, porque os selecionados podem estar em estados diferentes: escolhe-se desligar ou religar.",
    "A confirmação diz quantos clientes são alcançados antes de qualquer coisa ser gravada.",
    "O efeito por cliente é o mesmo da edição individual: religar volta a cobrar o campo, desligar dispensa.",
  ],
  relacionados: [
    "desligar-uma-pendencia-obrigatoria-de-um-cliente",
    "agir-em-varias-linhas-de-uma-vez",
    "buscar-dentro-da-tela",
    "entender-o-farol-e-as-pendencias-obrigatorias",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/pendencias-cliente/page.tsx",
    "apps/backend/src/admin/pendencias-cliente/pendencias-cliente.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
