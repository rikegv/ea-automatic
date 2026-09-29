import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o Gerenciador e a ficha da admissão.
 *
 * Reúne os quatro artigos N1 desta tela: achar a admissão, ler a ficha, editar os dados e entender o
 * farol com as pendências obrigatórias. Os quatro começam no MESMO lugar (a lista do Gerenciador) e
 * tropeçam nas MESMAS três coisas: o menu não liberado, a lista que abriu recortada e a resposta de
 * falha da consulta. É esse pedaço, e só ele, que mora aqui.
 *
 * ┌─ O QUE NÃO ENTRA NESTA FAMÍLIA, e o critério é duro ──────────────────────────────────────────┐
 * │ Erro que só acontece em UM dos quatro caminhos fica no artigo dele. O bloqueio da Liberação     │
 * │ Admissional, por exemplo, só aparece para quem SALVA uma edição, então ele é do artigo de       │
 * │ editar, não daqui. Subir para a família tudo o que parece comum é o jeito de a família passar a │
 * │ ensinar, a todos os quatro, o erro de um só.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A MENSAGEM DE FALHA É A QUE O CÓDIGO ESCREVE, letra por letra ("Falha ao carregar as admissões.",
 * `app/(app)/gerenciador/page.tsx`), e não uma paráfrase: é por ela que a pessoa procura.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "gerenciador",
  rotulo: "Gerenciador",
  preRequisitos: [
    "Ter o menu Gerenciador liberado para o seu usuário.",
    "A admissão já precisa existir no sistema. O Gerenciador mostra e corrige o que existe, ele não cria admissão.",
  ],
  seDerErrado: [
    {
      sintoma: "O Gerenciador não aparece no menu da lateral esquerda.",
      acao: "Quem libera menu por usuário é a diretoria. Peça a liberação do menu Gerenciador e confira depois, sem o menu a tela responde acesso negado mesmo com o endereço na mão.",
    },
    {
      sintoma: "A lista abriu vazia ou com muito menos gente do que você esperava.",
      acao: "A tela guarda o recorte enquanto você trabalha. Clique em Limpar filtro, ao lado da busca, e confira qual card do topo está selecionado: o card também é filtro.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar as admissões.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você digitou. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
