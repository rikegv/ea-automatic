import type { Artigo } from "../../tipos";

/**
 * FICHA: o catálogo de Status Da Sala De Espera.
 *
 * NÃO COBRE a mecânica geral de catálogo, que mora no artigo modelo.
 *
 * COBRE A MARCA "ENCERRA A FILA", que é o motivo de a lista ser editável: o sistema NÃO deduz pelo
 * nome que um status encerra o atendimento. Quem cria um status de encerramento e esquece a marca
 * deixa o registro parado na fila ativa, e nada na tela da Sala acusa isso.
 *
 * ┌─ ESTA TELA FOGE DO MOLDE DA FAMÍLIA EM TRÊS PONTOS, E POR ISSO ELA TEM `seDerErrado` PRÓPRIO ─┐
 * │ 1. NÃO TEM os filtros Ativos, Inativos e Todos, nem campo de busca. A lista vem inteira.       │
 * │ 2. NÃO TEM os atalhos editar, inativar e reativar. O nome se edita direto na linha e salva ao  │
 * │    sair do campo, e tirar de circulação é a chave Ativo.                                       │
 * │ 3. A coluna Ordem é de LEITURA aqui: o status novo entra no fim e a ordem não se digita nesta  │
 * │    tela.                                                                                       │
 * │ A família manda trocar o filtro e procurar o inativar, então sem estes itens a ficha mandaria  │
 * │ a pessoa procurar controle que não existe.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-status-da-sala-de-espera",
  titulo: "O Catálogo De Status Da Sala De Espera",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/sala-espera-status"],
  menus: ["sala-espera-status"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O que a lista de status da Sala de Espera governa, e por que a marca Encerra A Fila é o que tira o registro da fila ativa.",
  termos: [
    "status da sala de espera",
    "fila de espera",
    "encerra a fila",
    "status terminal",
    "sumiu da fila",
    "continua na fila",
    "ordem dos status",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto:
        "Digite o nome do status novo, ligue a chave Encerra a fila quando ele for de encerramento, e clique em Adicionar.",
      detalhe:
        "O status novo entra no fim da lista. Ligue a chave só quando chegar naquele status significar que o atendimento acabou.",
      controles: ["Novo status", "Nome do status", "Encerra a fila", "Adicionar"],
    },
    {
      gesto: "Para renomear, clique no nome na própria linha, ajuste o texto e clique fora do campo.",
      detalhe: "Não há botão de salvar aqui: o nome é gravado quando você sai do campo.",
      controles: ["Status", "Ordem"],
    },
    {
      gesto:
        "Use a chave da coluna Encerra A Fila para mudar o efeito do status, e a chave da coluna Ativo para tirá-lo de circulação.",
      detalhe: "As duas chaves gravam na hora, sem confirmação.",
      controles: ["Encerra A Fila", "Ativo"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você procura os filtros de ativos e inativos, ou o campo de busca, e não acha.",
      acao: "Esta tela não tem filtro nem busca: ela mostra a lista inteira, ativos e inativos juntos. A coluna Ativo diz a situação de cada um.",
    },
    {
      sintoma: "Você procura os atalhos editar, inativar e reativar e não acha.",
      acao: "Aqui o nome se edita direto na linha, e tirar de circulação ou devolver é a chave da coluna Ativo. Não existe atalho de texto nesta tela.",
    },
    {
      sintoma: "Você mudou o nome e ele voltou ao que era.",
      acao: "O nome só é gravado quando você sai do campo, e nome em branco é descartado. Digite o texto e clique fora da caixa.",
    },
    {
      sintoma: "O registro continua na fila mesmo depois de receber um status de encerramento.",
      acao: "Aquele status está sem a marca Encerra A Fila. O sistema não deduz o encerramento pelo nome: ligue a chave na linha dele.",
    },
  ],
  regras: [
    "Status marcado como Encerra A Fila tira o registro da fila ativa da Sala de Espera. Sem a marca, o registro continua na fila, por mais conclusivo que o nome pareça.",
    "Mudar a marca de um status vale para a leitura da fila dali em diante: os registros que já o receberam passam a ser lidos pela regra nova.",
    "Status inativo deixa de ser oferecido na Sala de Espera, e os registros que já o usam continuam mostrando o nome dele.",
    "A ordem da coluna Ordem é a ordem em que os status aparecem na Sala de Espera, e o status novo entra no fim da lista.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "anunciar-um-candidato-na-sala-de-espera",
    "editar-um-registro-da-sala-de-espera",
    "mover-da-sala-de-espera-para-a-admissao",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/sala-espera-status/page.tsx"],
  revisadoEm: "2026-09-30",
};
