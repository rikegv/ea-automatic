import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: as Linhas De Serviço de Atração e Seleção.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (a classificação de serviço exigida para publicar a
 * vaga) e a trava que nasce disso, a última linha ativa que não sai de circulação.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA dos catálogos, que está em `manter-um-catalogo-do-sistema`.
 *   . REORDENAR E EXCLUIR, que têm peça própria em `reordenar-e-apagar-um-item-de-catalogo`.
 *   . A ABERTURA DA VAGA, que é onde a linha é escolhida, e é tela de outra frente.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-linhas-de-servico",
  titulo: "O Catálogo De Linhas De Serviço",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/linhas-servico"],
  menus: ["as-linhas-servico"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de linhas de serviço governa: a classificação que toda vaga precisa ter para ser publicada, e por que a última linha ativa não pode sair de circulação.",
  termos: [
    "linha de servico",
    "linha de negocio",
    "classificacao da vaga",
    "criar linha de servico",
    "linha de servico nao aparece na abertura da vaga",
    "nao consigo desativar a linha de servico",
    "tipo de servico da vaga",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Linhas De Serviço pelo Menu Gerencial e leia a lista pela coluna Linha De Serviço.",
      detalhe:
        "A coluna Ordem é a sequência em que as linhas aparecem no seletor da abertura da vaga. O registro interno é a identidade e não muda quando o nome muda.",
      controles: ["Linha De Serviço", "Registro Interno", "Ordem", "Status"],
    },
    {
      gesto: "Para acrescentar uma linha, digite o nome no campo do topo e clique em Acrescentar linha.",
      detalhe: "Ela nasce ativa e no fim da lista, e passa a ser oferecida na abertura da vaga.",
      controles: ["Nome da linha de serviço nova *", "Acrescentar linha"],
    },
    {
      gesto: "Para corrigir o nome, clique em Renomear na linha e salve em Salvar nome.",
      detalhe:
        "O nome corrigido aparece também nas vagas que já apontavam para esta linha, porque o registro guardado na vaga é o mesmo.",
      controles: ["Renomear", "Novo nome da linha *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [],
  regras: [
    "A linha de serviço é obrigatória na vaga: é ela que classifica o serviço, e sem nenhuma linha ativa nenhuma vaga é publicada.",
    "Por isso a última linha ativa não pode ser desativada nem apagada. Para tirar esta de circulação, crie ou reative outra antes.",
    "Linha já usada por alguma vaga não é apagada. O sistema a desativa: ela some do seletor da abertura e continua respondendo pelas vagas antigas.",
    "Renomear corrige o nome em todas as vagas de uma vez, e não muda nenhuma delas de lugar.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "reordenar-e-apagar-um-item-de-catalogo",
    "o-catalogo-de-segmentos",
    "abrir-uma-vaga-nova",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/linhas-servico/page.tsx",
    "apps/backend/src/as/linhas-servico/linhas-servico.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
