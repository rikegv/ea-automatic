import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a administração do iFractal.
 *
 * Reúne os artigos da tela que configura o tipo de marcação por cliente e a lista de status. Ela é
 * vizinha da aba iFractal da Esteira e NÃO é a mesma coisa: aqui se configura o cliente, lá se
 * preenche a credencial da pessoa. Confundir as duas é o erro comum, e é por isso que a família diz
 * isso uma vez, em vez de cada artigo repetir.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "ifractal",
  rotulo: "iFractal",
  preRequisitos: [
    "Ter o menu do iFractal liberado para o seu usuário.",
    "O cliente já precisa existir no cadastro: esta tela configura o cliente, ela não cria cliente.",
  ],
  seDerErrado: [
    {
      sintoma: "A alteração não foi gravada.",
      acao: "Recarregue e confira qual valor está valendo antes de repetir, para não gravar duas vezes por cima.",
    },
    {
      sintoma: "A lista abriu vazia e você esperava clientes nela.",
      acao: "É filtro. Limpe os filtros de cliente, de situação e de tipo, e recomece marcando um por vez.",
    },
    {
      sintoma: "Você procura o cadastro do tipo de marcação e não acha o catálogo dele.",
      acao: "Hoje o tipo de marcação é escolhido por cliente, nesta tela e na ficha do cliente, e não tem catálogo próprio. Não é menu escondido: ele ainda não existe.",
    },
  ],
};
