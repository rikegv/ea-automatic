import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "beneficios": o bloco comum dos artigos da tela de Benefícios (§A.17 etapa 4).
 *
 * ┌─ O CRITÉRIO DO QUE ENTRA AQUI ───────────────────────────────────────────────────────────────┐
 * │ Entra o que é da TELA: chegar nela (o menu liberado, o Cadastro concluído, que é o que forma a │
 * │ fila), a mensagem de falha da consulta, o recorte que faz a pessoa "sumir" e as duas regras de  │
 * │ convivência que valem em qualquer caminho (a seleção que vive por página, e a janela que não    │
 * │ fecha por clique fora).                                                                        │
 * │                                                                                                │
 * │ NÃO entra o que é de UM caminho só. "Falha ao salvar os benefícios." é de quem EDITA o pacote,  │
 * │ e "N já estava(m) em outro estágio" é de quem MARCA como calculado: cada um mora no artigo dele.│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS MENSAGENS SÃO AS QUE O CÓDIGO ESCREVE, letra por letra ("Falha ao carregar a fila de
 * benefícios.", "Nenhuma admissão na fila. Elas entram aqui quando o Cadastro conclui.", em
 * `app/(app)/beneficios/page.tsx`): é por elas que a pessoa procura.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa real.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "beneficios",
  rotulo: "Benefícios",
  preRequisitos: [
    "Ter o menu Benefícios liberado para o seu usuário.",
    "A admissão já precisa ter o Cadastro concluído. A fila de Benefícios é formada por quem fechou a frente de Cadastro e Contrato, então ninguém entra aqui antes disso.",
    "Saber que a tela trabalha por pessoa. O catálogo de benefícios, que cria e renomeia cada benefício, é outra tela, da administração.",
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Falha ao carregar a fila de benefícios.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se você continua com a sessão aberta e avise a administração.",
    },
    {
      sintoma: "A pessoa não aparece na lista.",
      acao: "Veja em qual aba você está: Fila De Trabalho mostra só quem aguarda cálculo, e quem já foi marcado como calculado vai para Finalizados. Depois limpe a busca e os filtros, pelo ícone de filtro ao lado do campo de busca.",
    },
    {
      sintoma: "A lista diz Nenhuma admissão para esta busca.",
      acao: "É recorte, não falta de trabalho. Apague o que está escrito na busca e limpe os filtros de Cliente, Com o benefício, Sem o benefício e Pacote, um por vez.",
    },
    {
      sintoma:
        "A lista diz Nenhuma admissão na fila. Elas entram aqui quando o Cadastro conclui.",
      acao: "Não há ninguém naquele estágio. A fila nasce da frente de Cadastro e Contrato: enquanto ela não fechar, a pessoa não chega aqui. Confira o Cadastro dela na Esteira.",
    },
    {
      sintoma: "Marquei gente numa página, troquei de página ou de filtro, e a seleção sumiu.",
      acao: "É de propósito. A seleção vive na página que está na tela, para uma ação em massa nunca alcançar quem você não está vendo. Marque de novo na página em que vai agir.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você digitou. Saia pelo Fechar, pelo Cancelar ou pela tecla Esc.",
    },
  ],
};
