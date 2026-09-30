import type { Artigo } from "../../tipos";

/**
 * ARTIGO TRANSVERSAL DOS CATÁLOGOS DE ATRAÇÃO E SELEÇÃO: reordenar e apagar.
 *
 * ┌─ ESTE ARTIGO É UMA ERRATA. NÃO O "CORRIJA" PARA CASAR COM O ARTIGO MODELO ────────────────────┐
 * │ O artigo modelo de catálogo (`manter-um-catalogo-do-sistema`) afirma, com todas as letras, que │
 * │ o botão de excluir NÃO EXISTE e que isso é de propósito. Aquilo está CERTO para o domínio dele, │
 * │ que é o catálogo da admissão, e ERRADO para os catálogos de Atração e Seleção: em Segmentos,    │
 * │ Linhas De Serviço, Comerciais, Etapas Do Funil e Status Da Vaga o Excluir EXISTE e funciona, e   │
 * │ nos quatro primeiros ainda há as setas de Subir e Descer, que o modelo também não tem.          │
 * │                                                                                                 │
 * │ Uma ficha que herdasse o modelo naquelas telas ensinaria o OPOSTO do que a tela faz, e é por    │
 * │ isso que existe este artigo e a família `catalogo-as` separada. O modelo NÃO deve ser alterado; │
 * │ a correção é esta peça. Quem vier depois e "harmonizar" os dois reintroduz o defeito.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE COBRE: as setas de ordem e o que a ordem muda a jusante; o Excluir e o que ele faz de
 * verdade; e sobretudo QUANDO apagar é aceitável contra quando inativar é o certo.
 *
 * O QUE ELE NÃO COBRE: criar, renomear, inativar e reativar, que são a mecânica comum e moram no
 * artigo modelo.
 *
 * §A.6: o catálogo de Comerciais guarda NOME DE PESSOA. Este texto descreve o campo e não reproduz
 * nome nenhum, nem como exemplo.
 */
export const artigo: Artigo = {
  slug: "reordenar-e-apagar-um-item-de-catalogo",
  titulo: "Reordenar E Apagar Um Item De Catálogo",
  modulo: "CONFIGURACAO",
  rotas: [
    "/admin/as/segmentos",
    "/admin/as/linhas-servico",
    "/admin/as/comerciais",
    "/admin/as/etapas",
  ],
  menus: ["as-segmentos", "as-linhas-servico", "as-comerciais", "as-etapas"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "catalogo-as",
  resumo:
    "Como mudar a ordem de um item nos catálogos de Atração e Seleção, e quando apagar é aceitável em vez de inativar.",
  termos: [
    "reordenar",
    "mudar a ordem",
    "subir",
    "descer",
    "excluir item",
    "apagar item",
    "setas desligadas",
    "excluir ou inativar",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Use as setas da linha para subir ou descer o item na lista.",
      detalhe:
        "A ordem daqui é a ordem em que o item aparece nos seletores, nos filtros e nos cards das telas que consomem o catálogo. O item novo nasce no fim.",
      controles: ["Ordem", "Subir na lista", "Descer na lista", "Subir no funil", "Descer no funil"],
    },
    {
      gesto:
        "Se as setas estiverem desligadas, clique no cabeçalho Ordem para voltar à ordem do catálogo.",
      detalhe:
        "Com a tabela ordenada por outra coluna, a linha de cima não é a anterior da lista, e a seta moveria o item para um lugar que você não está vendo.",
      controles: ["Ordem", "Status", "Ações"],
    },
    {
      gesto:
        "Para tirar um item de circulação, use Inativar. Use Excluir só no item que nunca foi usado.",
      detalhe:
        "O sistema confere antes: item sem uso nenhum é apagado; item já usado é apenas desativado, para o histórico não ficar sem nome. Havendo gente parada naquela etapa ou naquele status agora, a exclusão é recusada e o sistema diz quantas pessoas precisam ser movidas antes.",
      controles: [
        "Inativar",
        "Reativar",
        "Excluir",
        "Excluir Segmento",
        "Excluir Linha De Serviço",
        "Excluir Comercial",
        "Excluir Etapa Do Funil",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "As setas de subir e descer estão apagadas e não respondem ao clique.",
      acao: "A tabela está ordenada por outra coluna. Clique no cabeçalho Ordem para voltar à ordem do catálogo, e as setas voltam a funcionar.",
    },
    {
      sintoma: "Você clicou em Excluir e o item continuou na lista, marcado como inativo.",
      acao: "É o comportamento certo: alguém já usa aquele item, então apagar levaria o histórico junto. Ele sai das escolhas novas e continua identificando o passado.",
    },
    {
      sintoma: "O sistema recusou a exclusão e falou em pessoas a mover.",
      acao: "Há gente parada naquela etapa ou naquele status agora. Mova essas pessoas para outro lugar e tente de novo, ou apenas inative o item.",
    },
    {
      sintoma: "Você mudou a ordem e o seletor da outra tela continua na ordem antiga.",
      acao: "Recarregue a tela que mostra o seletor. As listas de opção são lidas na abertura da tela.",
    },
  ],
  regras: [
    "Nos catálogos de Atração e Seleção o Excluir existe de verdade, ao contrário dos catálogos da admissão, onde o único caminho é inativar.",
    "Apague só o item que nunca foi usado. Item já usado deve ser inativado: apagar levaria o histórico junto, e é por isso que o sistema converte a exclusão em desativação quando encontra uso.",
    "A ordem definida aqui é a ordem dos seletores, dos filtros e dos cards das telas que consomem o catálogo, e não muda nenhum registro já gravado.",
    "As setas só funcionam com a tabela na ordem do catálogo: ordenada por outra coluna, a reordenação fica desligada de propósito.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "mover-o-candidato-de-etapa",
    "mover-o-status-da-vaga",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/segmentos/page.tsx",
    "apps/frontend/src/app/(app)/admin/as/linhas-servico/page.tsx",
    "apps/frontend/src/app/(app)/admin/as/comerciais/page.tsx",
    "apps/frontend/src/app/(app)/admin/as/etapas/page.tsx",
  ],
  revisadoEm: "2026-09-30",
};
