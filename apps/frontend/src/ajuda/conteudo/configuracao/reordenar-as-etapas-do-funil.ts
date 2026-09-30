import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: mudar a posição de uma etapa na sequência do funil, pelas setas de subir e
 * descer, e o que essa ordem governa nas telas que leem o funil.
 *
 * O FATO QUE EVITA O CHAMADO: a reordenação é enviada com a LISTA COMPLETA de etapas, inclusive as
 * que estão fora de circulação, e é recusada INTEIRA quando a lista não corresponde ao que está
 * cadastrado. Nada muda pela metade, e o caminho é recarregar a página.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . CRIAR, RENOMEAR, INATIVAR E EXCLUIR etapa, que estão em `manter-as-etapas-do-funil`.
 *   . MOVER O CANDIDATO de etapa, que é outra coisa: aqui se move a ETAPA, não a pessoa.
 */
export const artigo: Artigo = {
  slug: "reordenar-as-etapas-do-funil",
  titulo: "Reordenar As Etapas Do Funil",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/etapas"],
  menus: ["as-etapas"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "Como mudar a posição de uma etapa na sequência do funil, o que essa ordem muda nas telas que a consomem, e por que a reordenação é recusada inteira quando a tela está desatualizada.",
  termos: [
    "reordenar etapas",
    "mudar a ordem do funil",
    "subir etapa",
    "descer etapa",
    "ordem das etapas",
    "etapa no lugar errado",
    "setas de ordenar desligadas",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Confira se a tabela está na ordem do funil antes de mover.",
      detalhe:
        "Com a tabela ordenada por outra coluna, as setas ficam desligadas: a linha de cima não seria a etapa anterior, e a seta moveria a etapa para um lugar que ninguém está vendo. Clique no cabeçalho Ordem para voltar.",
      controles: ["Ordem"],
    },
    {
      gesto: "Clique na seta de subir ou na de descer, na linha da etapa que vai mudar de lugar.",
      detalhe:
        "A troca é com a vizinha, uma posição por clique. A primeira não sobe e a última não desce.",
      controles: ["Subir no funil", "Descer no funil"],
    },
    {
      gesto: "Confira a coluna Ordem depois de mover.",
      detalhe: "Ela mostra a numeração nova, que é a sequência que as outras telas passam a usar.",
      controles: ["Ordem", "Etapa"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "As setas de subir e descer estão apagadas e não respondem ao clique.",
      acao: "A tabela está ordenada por outra coluna. Clique no cabeçalho Ordem para voltar à ordem do funil, e as setas voltam a funcionar.",
    },
    {
      sintoma: "Movi uma etapa e quero saber se alguém mudou de etapa junto.",
      acao: "Ninguém mudou. A ordem é a sequência em que as etapas aparecem; quem está em uma etapa continua nela.",
    },
  ],
  regras: [
    "A ordem definida aqui é a ordem do funil em todas as telas que o mostram: os seletores de mover candidato, as colunas e as listas por etapa.",
    "Mover uma etapa não move nenhum candidato. A ordem é a sequência, não o conteúdo.",
    "A reordenação é enviada com a lista completa de etapas, inclusive as que estão fora de circulação. Se a sua tela estiver desatualizada, o sistema recusa a operação inteira e nada muda pela metade.",
    "Etapa nova nasce no fim do funil. Levá-la ao lugar certo é sempre um passo separado da criação.",
  ],
  relacionados: [
    "manter-as-etapas-do-funil",
    "reordenar-e-apagar-um-item-de-catalogo",
    "manter-um-catalogo-do-sistema",
    "ordenar-a-lista-pelo-cabecalho",
    "mover-o-candidato-de-etapa",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/etapas/page.tsx",
    "apps/frontend/src/lib/as-etapas.ts",
    "apps/backend/src/as/etapas/etapas-funil.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
