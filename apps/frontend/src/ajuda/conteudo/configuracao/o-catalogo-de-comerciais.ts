import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: os Comerciais de Atração e Seleção.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (quem responde pelo cliente, herdado pela vaga), o
 * recorte de dado que ele adota de propósito (guarda o NOME e mais nada) e por que quem sai do time
 * é inativado em vez de apagado.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA dos catálogos, que está em `manter-um-catalogo-do-sistema`.
 *   . REORDENAR E EXCLUIR, que têm peça própria em `reordenar-e-apagar-um-item-de-catalogo`.
 *
 * NENHUM NOME DE PESSOA APARECE NESTE TEXTO, e a ausência é deliberada: a ficha descreve o CAMPO,
 * nunca o conteúdo dele. O que está gravado no catálogo é dado de quem trabalha aqui, e manual vai
 * para o repositório.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-comerciais",
  titulo: "O Catálogo De Comerciais",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/comerciais"],
  menus: ["as-comerciais"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de comerciais governa: quem responde pelo cliente, herdado pela vaga, e por que quem sai do time é inativado em vez de apagado.",
  termos: [
    "comercial",
    "quem atende o cliente",
    "carteira de clientes",
    "responsavel comercial",
    "cadastrar comercial",
    "tirar comercial que saiu",
    "sem comercial",
    "comercial nao aparece no cadastro do cliente",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Comerciais pelo Menu Gerencial e leia a lista pela coluna Comercial.",
      detalhe:
        "A coluna Ordem é a sequência em que os nomes aparecem no seletor do cadastro de cliente. A coluna Status diz quem ainda recebe cadastros novos.",
      controles: ["Comercial", "Ordem", "Status"],
    },
    {
      gesto: "Para acrescentar quem entrou no time, digite o nome no campo do topo e clique em Acrescentar comercial.",
      detalhe:
        "Guarda-se apenas o nome. Não há campo de e-mail, telefone ou documento, e é assim de propósito.",
      controles: ["Nome de quem entra no comercial *", "Acrescentar comercial"],
    },
    {
      gesto: "Para corrigir uma grafia, clique em Corrigir o nome na linha e salve em Salvar nome.",
      detalhe:
        "A correção vale de uma vez para todos os clientes e vagas que já apontavam para esta pessoa.",
      controles: ["Corrigir o nome", "Nome corrigido *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Preciso guardar o e-mail ou o telefone de quem é do comercial.",
      acao: "Não há onde, e é uma decisão do sistema: este catálogo guarda só o nome. Contato de pessoa não é dado que um catálogo de classificação precise carregar.",
    },
    {
      sintoma: "Alguém saiu do time e eu quero apagar o nome da lista.",
      acao: "O caminho é inativar. Apagar reescreveria o passado: os clientes e as vagas que aquela pessoa atendia deixariam de dizer de quem eram.",
    },
  ],
  regras: [
    "O catálogo guarda apenas o nome da pessoa. Nenhum outro dado dela entra aqui.",
    "O comercial é escolhido no cadastro do cliente, e a vaga daquele cliente o herda. A vaga pode ter um comercial próprio, e nesse caso é o dela que vale.",
    "Quem sai do time é inativado, nunca apagado: quem já respondia por um cliente continua identificando aquele atendimento no histórico.",
    "Comercial fora de circulação não recebe cadastros novos, e escolhê-lo é recusado. A recusa não repete o nome de quem foi desativado.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "reordenar-e-apagar-um-item-de-catalogo",
    "o-catalogo-de-segmentos",
    "classificar-o-cliente-por-segmento-e-comercial",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/comerciais/page.tsx",
    "apps/backend/src/as/comerciais/comerciais.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
