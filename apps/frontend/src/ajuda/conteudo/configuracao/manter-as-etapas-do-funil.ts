import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: criar, renomear, inativar, reativar e excluir uma etapa do funil de
 * candidatos, e o que cada um desses gestos alcança nas telas que mostram o funil.
 *
 * O FATO CENTRAL, e é ele que responde a maior parte das dúvidas: RENOMEAR NÃO MOVE NINGUÉM. O
 * registro interno da etapa é a identidade, e ele continua o mesmo quando o nome muda, então toda
 * candidatura que estava naquela etapa continua nela, com o nome novo.
 *
 * NENHUM NOME DE ETAPA É CITADO, e a ausência é deliberada: a lista é cadastrada, e ela pode ser
 * diferente de um ambiente para o outro. Artigo que cita o nome de uma etapa como se fosse fixo
 * ensina um vocabulário que a primeira renomeação desmente, sem nada falhar.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . REORDENAR, que tem peça própria em `reordenar-as-etapas-do-funil`.
 *   . MOVER O CANDIDATO de uma etapa para outra, que é a operação do dia a dia e é de outra frente.
 *   . A MECÂNICA GERAL dos catálogos e a errata sobre apagar, que estão nas peças transversais.
 */
export const artigo: Artigo = {
  slug: "manter-as-etapas-do-funil",
  titulo: "Manter As Etapas Do Funil",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/etapas"],
  menus: ["as-etapas"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "catalogo-as",
  resumo:
    "Como criar, renomear, inativar, reativar e excluir uma etapa do funil, e por que renomear uma etapa muda o vocabulário de todas as telas sem mover nenhum candidato.",
  termos: [
    "etapa do funil",
    "criar etapa",
    "renomear etapa",
    "mudar nome da etapa",
    "tirar etapa do funil",
    "apagar etapa",
    "etapa sumiu",
    "etapa nova nao aparece",
    "fases do processo seletivo",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Etapas Do Funil pelo Menu Gerencial.",
      detalhe:
        "A lista traz também as etapas fora de circulação, porque é aqui que elas voltam. A coluna Registro Interno é a identidade que o sistema usa por baixo do nome.",
      controles: ["Ordem", "Etapa", "Registro Interno", "Status"],
    },
    {
      gesto: "Para criar, digite o nome da etapa no campo do topo e clique em Acrescentar etapa.",
      detalhe:
        "Ela nasce ativa e no fim do funil, e não desativa nenhuma outra. O lugar dela na sequência se acerta depois, pelas setas.",
      controles: ["Nome da etapa nova *", "Acrescentar etapa"],
    },
    {
      gesto: "Para renomear, clique em Renomear na linha, ajuste o nome e clique em Salvar nome.",
      detalhe:
        "É a mesma etapa com o nome corrigido: ninguém é movido, e o histórico inteiro de quem passou por ela passa a mostrar o nome novo.",
      controles: ["Renomear", "Novo nome da etapa *", "Salvar nome", "Cancelar"],
    },
    {
      gesto: "Para tirar uma etapa de circulação, clique em Inativar e confirme.",
      detalhe:
        "A etapa deixa de ser oferecida para onde mover candidato e continua resolvendo o nome de quem passou por ela. Nada é apagado.",
      controles: ["Inativar", "Inativar Etapa Do Funil", "Ativa", "Inativa"],
    },
    {
      gesto: "Para trazer de volta, clique em Reativar na linha da etapa.",
      detalhe: "Ela volta com o mesmo registro interno, então o histórico continua apontando para ela.",
      controles: ["Reativar"],
    },
    {
      gesto: "Para apagar de vez, clique em Excluir e confirme.",
      detalhe:
        "O sistema só apaga quando ninguém nunca passou pela etapa, que é o caso do erro de digitação recém-criado. Havendo histórico, ele desativa em vez de apagar, e diz isso.",
      controles: ["Excluir", "Excluir Etapa Do Funil"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Cliquei em Excluir e a etapa foi desativada em vez de apagada.",
      acao: "É o comportamento correto: alguém já passou por ela, e apagar deixaria esse histórico sem nome. Ela sai de circulação e continua identificando o passado.",
    },
    {
      sintoma: "O sistema diz que há candidaturas nesta etapa.",
      acao: "Etapa com gente dentro não sai de circulação nem é apagada. Mova essas pessoas para outra etapa e tente de novo. O sistema diz quantas são.",
    },
    {
      sintoma: "O sistema recusa porque esta é a etapa em que toda candidatura nasce.",
      acao: "Marque outra etapa como início do funil antes. Sem uma etapa de início, nenhum candidato novo consegue ser cadastrado.",
    },
    {
      sintoma: "O sistema recusa porque esta é a última etapa ativa.",
      acao: "Funil sem etapa não é funil. Crie ou reative outra antes de tirar esta de circulação.",
    },
    {
      sintoma: "Renomeei a etapa e quero saber se alguém foi movido.",
      acao: "Ninguém foi. O registro interno não muda no renomear, então cada candidatura continua exatamente onde estava, com o nome novo na tela.",
    },
  ],
  regras: [
    "Renomear não move ninguém de etapa, e é a mesma etapa em todo o histórico: o registro interno continua o mesmo, e o nome novo passa a valer em todas as telas que mostram o funil.",
    "A lista de etapas é a que estiver cadastrada nesta tela, e ela pode ser diferente de um ambiente para o outro. É daqui que sai o vocabulário do funil inteiro.",
    "Etapa com candidatura viva dentro não é inativada nem apagada. O sistema recusa e diz quantas pessoas precisam ser movidas antes.",
    "A etapa marcada como início do funil e a última etapa ativa não saem de circulação por nenhum dos dois caminhos.",
  ],
  relacionados: [
    "reordenar-as-etapas-do-funil",
    "manter-um-catalogo-do-sistema",
    "reordenar-e-apagar-um-item-de-catalogo",
    "mover-o-candidato-de-etapa",
    "ler-a-central-de-candidatos",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/etapas/page.tsx",
    "apps/backend/src/as/etapas/etapas-funil.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
