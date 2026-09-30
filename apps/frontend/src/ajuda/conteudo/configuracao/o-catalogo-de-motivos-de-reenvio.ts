import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: os Motivos De Reenvio Da Shortlist.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (a lista exigida quando a lista de candidatos volta
 * ao cliente uma segunda vez) e a diferença de comportamento em relação aos dois motivos irmãos: o
 * reenvio guarda a LINHA do catálogo, então renomear aqui corrige também o que já foi registrado.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA dos catálogos, que está em `manter-um-catalogo-do-sistema`.
 *   . O ENVIO DA LISTA AO CLIENTE, que é de outra frente e tem peça própria.
 *   . REORDENAR E EXCLUIR: esta tela não tem nem um nem outro.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-motivos-de-reenvio",
  titulo: "O Catálogo De Motivos De Reenvio",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/motivos-reenvio"],
  menus: ["as-motivos-reenvio"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de motivos de reenvio governa: a lista exigida a partir do segundo envio da mesma lista de candidatos ao cliente, e por que renomear aqui corrige também os reenvios antigos.",
  termos: [
    "motivo de reenvio",
    "por que a lista voltou",
    "reenviar shortlist",
    "reenviar lista ao cliente",
    "criar motivo de reenvio",
    "motivo nao aparece no reenvio",
    "segundo envio da lista",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Motivos De Reenvio Da Shortlist pelo Menu Gerencial e leia a lista pela coluna Motivo.",
      detalhe: "A coluna Status diz quais motivos ainda são oferecidos no reenvio.",
      controles: ["Motivo", "Status"],
    },
    {
      gesto: "Para acrescentar um motivo, digite o nome no campo do topo e clique em Acrescentar motivo.",
      detalhe: "Ele nasce ativo e passa a aparecer no seletor do reenvio da lista ao cliente.",
      controles: ["Nome do motivo novo *", "Acrescentar motivo"],
    },
    {
      gesto: "Para corrigir uma grafia, clique em Renomear na linha e salve em Salvar nome.",
      detalhe:
        "Aqui a correção alcança também o passado: os reenvios já registrados passam a mostrar o nome novo.",
      controles: ["Renomear", "Novo nome do motivo *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Enviei a lista ao cliente e o sistema não pediu motivo nenhum.",
      acao: "O primeiro envio não pede. O motivo passa a ser exigido do segundo em diante, que é quando a pergunta faz sentido: por que a lista voltou.",
    },
    {
      sintoma: "O seletor do reenvio abre sem nenhuma opção.",
      acao: "Nenhum motivo está ativo aqui. Enquanto isso, nenhuma lista pode ser reenviada. Cadastre o primeiro nesta tela.",
    },
  ],
  regras: [
    "O motivo é exigido a partir do segundo envio da mesma lista ao cliente. O primeiro envio não pede motivo.",
    "Sem nenhum motivo ativo, nenhuma lista é reenviada, porque o motivo é conferido contra esta lista.",
    "O reenvio guarda a linha do catálogo, e não o texto: renomear aqui corrige o nome também nos reenvios que já foram registrados.",
    "O campo é uma lista, e não um texto livre, para o relatório de por que as listas voltam fechar, e para não haver onde digitar dado de pessoa.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-catalogo-de-motivos-de-cancelamento",
    "o-catalogo-de-motivos-de-descarte",
    "enviar-a-shortlist-ao-cliente",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/motivos-reenvio/page.tsx",
    "apps/backend/src/as/motivos-reenvio-shortlist/motivos-reenvio-shortlist.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
