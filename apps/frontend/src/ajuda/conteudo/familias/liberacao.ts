import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "liberacao": o bloco comum dos artigos da Liberação Admissional.
 *
 * ┌─ O QUE A TELA É, E POR QUE O PRÉ-REQUISITO É ESSE ───────────────────────────────────────────┐
 * │ A Liberação é a SALA DE ESPERA da esteira: pré-admissões que já chegaram (hoje, pelo Pandapé)  │
 * │ e ainda não têm cliente e cargo. Enquanto elas não têm o par, não há régua documental a montar, │
 * │ então elas não entram em fila nenhuma da Esteira. Os três artigos desta família começam no MESMO │
 * │ lugar (a fila da aba Aguardando) e tropeçam nas mesmas coisas: o menu não liberado, a pessoa que │
 * │ não está mais na fila e a janela intermediária da Sala de Espera.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO ENTRA AQUI o que é de um caminho só: os seis campos que travam o botão Liberar são do artigo
 * de liberar, a recusa restrita a Master é do artigo de recusar, e as travas de duplicata e de CPF
 * inválido que tiram gente do lote são do artigo do lote.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa, só rótulos de tela.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "liberacao",
  rotulo: "Liberação Admissional",
  preRequisitos: [
    "Ter o menu Liberação Admissional liberado para o seu usuário.",
    "A pré-admissão já precisa ter chegado. Esta tela mostra quem entrou e ainda está sem cliente e cargo: ela não cria candidato, quem cria do zero é a Nova Admissão.",
  ],
  seDerErrado: [
    {
      sintoma: "Liberação Admissional não aparece no menu da lateral esquerda.",
      acao: "Quem libera menu por usuário é a diretoria. Peça a liberação do menu Liberação Admissional.",
    },
    {
      sintoma: "A pessoa não está na fila da aba Aguardando.",
      acao: "Limpe a busca do topo, que filtra por nome e por CPF ao mesmo tempo. Continuando sem aparecer, ela já saiu da fila: quem foi liberado está na Esteira e no Gerenciador, e quem foi recusado está na aba Admissões Recusadas.",
    },
    {
      sintoma: "A tela mostra Erro ao carregar a fila de liberação.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "Faltam colunas do lado direito da tabela.",
      acao: "A tabela rola na horizontal em vez de espremer as colunas. Arraste a barra de rolagem de baixo da lista até a coluna Ação.",
    },
    {
      sintoma: "Cliquei na pessoa e apareceu antes a janela Vincular À Sala De Espera.",
      acao: "É um passo intermediário, não um erro: o sistema achou registros parecidos na Sala de Espera. Escolha o registro certo e clique em Vincular para trazer cliente e cargo já preenchidos, ou clique em Seguir sem vincular. Nos dois casos a liberação abre em seguida.",
    },
    {
      sintoma: "A janela não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
