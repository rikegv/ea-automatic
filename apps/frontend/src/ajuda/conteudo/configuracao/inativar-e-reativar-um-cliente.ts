import type { Artigo } from "../../tipos";

/**
 * INATIVAR E REATIVAR O CLIENTE, com ênfase no que some e no que fica.
 *
 * O QUE ELA COBRE: o atalho de inativar na linha, o aviso que lista as admissões em andamento antes
 * de confirmar, onde o cliente inativado passa a aparecer e como trazê-lo de volta.
 *
 * O QUE ELA NÃO REPETE: a mecânica genérica de catálogo (por que inativar em vez de apagar, como o
 * item some das listas de opção) já está escrita uma vez, no artigo de catálogo, e repeti-la aqui
 * criaria duas explicações capazes de divergir. Este artigo escreve só o que é próprio do cliente:
 * o aviso das admissões em andamento e o que continua preservado.
 */
export const artigo: Artigo = {
  slug: "inativar-e-reativar-um-cliente",
  titulo: "Inativar E Reativar Um Cliente",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clientes"],
  menus: ["clientes"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "cadastros-do-cliente",
  resumo:
    "Como tirar um cliente de circulação sem perder nada: o que ele deixa de aparecer, o que continua preservado e como reativá-lo.",
  termos: [
    "inativar cliente",
    "reativar cliente",
    "desativar cliente",
    "excluir cliente",
    "apagar cliente",
    "cliente encerrado",
    "cliente sumiu da lista",
    "contrato encerrado",
  ],
  preRequisitos: [
    "Saber que o contrato com aquele cliente acabou: inativar tira o cliente das escolhas do dia a dia.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Clientes e localize o cliente pela busca ou pelos filtros de situação.",
      controles: ["Clientes", "ativos", "inativos", "todos"],
    },
    {
      gesto: "Clique em inativar, na ponta direita da linha.",
      controles: ["inativar"],
    },
    {
      gesto: "Leia o aviso antes de confirmar.",
      detalhe:
        "O aviso lista as admissões em andamento daquele cliente. Elas não param nem são apagadas: o aviso existe para você saber o que continua rodando.",
    },
    {
      gesto: "Confirme a inativação.",
      detalhe:
        "O cliente passa a aparecer com a situação Inativo e some das telas que oferecem cliente para escolher.",
      controles: ["Status", "Ativo", "Inativo"],
    },
    {
      gesto: "Para trazê-lo de volta, troque o filtro para inativos e clique em reativar na linha.",
      detalhe: "Ele volta às escolhas exatamente como estava, com tudo o que tinha cadastrado.",
      controles: ["inativos", "reativar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O cliente sumiu da lista depois que eu inativei.",
      acao: "O filtro padrão da tela mostra só os ativos. Troque para inativos ou para todos e ele reaparece.",
    },
    {
      sintoma: "O aviso mostrou admissões em andamento e eu não sei se posso seguir.",
      acao: "Pode: o aviso é informativo e não bloqueia. As admissões continuam do jeito que estão, e o histórico é preservado.",
    },
    {
      sintoma: "Preciso apagar o cliente de vez.",
      acao: "Não existe exclusão, e é de propósito: apagar levaria embora as admissões, a régua e os vínculos daquele cliente. Inativar é o caminho.",
    },
    {
      sintoma: "O cliente inativado não aparece na tela de integração por cliente.",
      acao: "Aquela tela lista só clientes ativos, porque não há admissão nova para cliente encerrado. Reative o cliente para configurá-lo.",
    },
  ],
  regras: [
    "Inativar não apaga nada: admissões, régua documental, lojas e vínculos continuam como estão.",
    "O cliente inativado deixa de ser oferecido nas telas que escolhem cliente.",
    "As admissões em andamento seguem o curso normal mesmo com o cliente inativado.",
    "Reativar devolve o cliente às escolhas com tudo o que ele já tinha cadastrado.",
  ],
  relacionados: [
    "cadastrar-um-cliente-novo",
    "manter-um-catalogo-do-sistema",
    "definir-quem-exige-integracao",
    "inativar-a-regua-de-um-cliente",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/clientes/page.tsx",
    "apps/backend/src/admin/clientes/clientes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
