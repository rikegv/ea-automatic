import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: os Segmentos de Atração e Seleção.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (o ramo do cliente, herdado pela vaga), os dois
 * homônimos com que ele é confundido, e o efeito de renomear e de inativar nas telas que o leem.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA de criar, renomear, inativar e reativar, que é a mesma de todos os catálogos e já
 *     está em `manter-um-catalogo-do-sistema`. Repeti-la aqui criaria duas versões do mesmo gesto,
 *     que divergem no primeiro ajuste.
 *   . REORDENAR E EXCLUIR, que esta tela tem e o artigo modelo não: o assunto tem peça própria,
 *     `reordenar-e-apagar-um-item-de-catalogo`, e é para lá que a ficha aponta.
 *   . O CADASTRO DO CLIENTE, que é onde o segmento é escolhido, e é tela de outra frente.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-segmentos",
  titulo: "O Catálogo De Segmentos",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/segmentos"],
  menus: ["as-segmentos"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de segmentos governa: o ramo do cliente, herdado pela vaga, e o que muda nas outras telas quando alguém renomeia ou tira um segmento de circulação.",
  termos: [
    "segmento",
    "ramo do cliente",
    "area de atuacao do cliente",
    "segmento da vaga",
    "sem segmento",
    "criar segmento",
    "segmento sumiu do seletor",
    "segmento nao aparece no cadastro do cliente",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Segmentos pelo Menu Gerencial e leia a lista pela coluna Segmento.",
      detalhe:
        "A coluna Registro Interno mostra a identidade que o sistema usa por baixo, e ela não muda quando o nome muda. A coluna Ordem é a sequência em que os segmentos aparecem no seletor do cadastro de cliente.",
      controles: ["Segmento", "Registro Interno", "Ordem", "Status"],
    },
    {
      gesto: "Para acrescentar um segmento, digite o nome no campo do topo e clique em Acrescentar segmento.",
      detalhe: "Ele nasce ativo e no fim da lista, e passa a ser oferecido no cadastro de cliente.",
      controles: ["Nome do segmento novo *", "Acrescentar segmento"],
    },
    {
      gesto: "Para corrigir o nome, clique em Renomear na linha e salve em Salvar nome.",
      detalhe:
        "O registro interno continua o mesmo, então o nome corrigido aparece também nos clientes e nas vagas que já apontavam para este segmento.",
      controles: ["Renomear", "Novo nome do segmento *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor de segmento do cadastro de cliente abre vazio.",
      acao: "Nenhum segmento está ativo. O cadastro de cliente continua salvando, porque o segmento é opcional, mas ninguém tem o que escolher até o primeiro ser criado aqui.",
    },
    {
      sintoma: "Mexi no segmento e o que a pessoa enxerga no sistema não mudou.",
      acao: "Não é este catálogo. Aqui é o ramo do cliente, que classifica. Quem decide o que cada usuário enxerga é a área e a liberação de menu, em outra tela.",
    },
    {
      sintoma: "O sistema diz que o segmento já ocupa o registro interno que este nome geraria.",
      acao: "O registro interno ignora acentos e maiúsculas, então dois nomes muito parecidos geram o mesmo. Diferencie o nome novo do que já existe.",
    },
  ],
  regras: [
    "O segmento é o ramo do cliente, escolhido no cadastro dele, e a vaga daquele cliente o herda. A vaga pode ter um segmento próprio, e nesse caso é o dela que vale.",
    "Renomear corrige o nome de uma vez em todos os clientes e em todas as vagas, porque o que fica guardado é o registro interno e não o texto.",
    "Segmento fora de circulação não é oferecido nos cadastros novos e continua classificando quem já o usava. Escolher um segmento desativado é recusado.",
    "A ordem desta lista é a ordem do seletor, e o filtro de segmento da Central De Vagas oferece também a opção de quem está sem segmento.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "reordenar-e-apagar-um-item-de-catalogo",
    "o-catalogo-de-comerciais",
    "o-catalogo-de-linhas-de-servico",
    "classificar-o-cliente-por-segmento-e-comercial",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/segmentos/page.tsx",
    "apps/backend/src/as/segmentos/segmentos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
