import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA "esteira": o bloco comum dos artigos das cinco abas do Farol Admissional.
 *
 * ┌─ O CRITÉRIO DO QUE ENTRA AQUI, E ELE É ESTREITO DE PROPÓSITO ────────────────────────────────┐
 * │ Entra só o que é da TELA, e não da FRENTE: chegar na Esteira (o menu, a admissão já liberada) e │
 * │ os tropeços que a tabela dá em QUALQUER aba (fila recortada por filtro, coluna fora da área      │
 * │ visível, filtro de status zerado na troca de aba, admissão pausada que sai da fila).             │
 * │                                                                                                  │
 * │ NÃO entra nada que só valha em uma aba. "O documento voltou Inconforme" é da Auditoria, "o        │
 * │ Cadastro está Aguardando" é do Cadastro, "a senha não salvou" é do iFractal: cada um desses mora │
 * │ no artigo dele. Subir um item de aba única para a família faria os cinco artigos herdarem um erro │
 * │ que quatro deles não podem nem produzir, e o leitor passaria a desconfiar do bloco inteiro.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO CINCO ARTIGOS HOJE (Auditoria, Exame, Cadastro, Integração e iFractal) e serão mais quando os
 * N2 entrarem, então cada linha escrita aqui é uma linha que deixa de ser copiada, e divergir, cinco
 * vezes ou mais. §A.11: nenhum travessão. §A.6: nenhum dado de pessoa.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "esteira",
  rotulo: "Esteira Admissional",
  preRequisitos: [
    "Ter o menu Esteira Admissional liberado para o seu usuário.",
    "A admissão já precisa existir na esteira, com cliente e cargo definidos: sem os dois ela fica aguardando liberação e não entra em fila nenhuma.",
    "Saber que cada aba é uma fila independente: a pessoa aparece em uma, em várias ou em nenhuma, conforme a etapa em que ela está.",
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa não aparece na fila da aba.",
      acao: "Limpe a busca do topo e os filtros. Cada aba mostra só quem está naquela etapa, e quem já concluiu sai da fila: para rever essas, filtre pelo status de conclusão ou clique no card de realizado. Quem declinou ou teve rescisão não aparece em aba nenhuma, só no Gerenciador.",
    },
    {
      sintoma: "A lista diz nenhum candidato nesta frente com os filtros atuais.",
      acao: "É filtro, não falta de trabalho. Clique em Limpar filtro, ao lado da busca, e recomece marcando um campo por vez.",
    },
    {
      sintoma: "Faltam colunas do lado direito da tabela.",
      acao: "A tabela rola na horizontal em vez de espremer as colunas. Arraste a barra de rolagem de baixo da lista: a coluna Ações fica fixa à direita enquanto você rola.",
    },
    {
      sintoma: "Troquei de aba e o filtro de status ficou em branco.",
      acao: "É de propósito. Cada frente tem a lista de status dela, então a troca de aba zera esse filtro para não carregar um status que a nova aba não conhece.",
    },
    {
      sintoma: "A linha mostra a etiqueta Pausada, ou a pessoa sumiu depois que alguém pausou.",
      acao: "Admissão pausada sai da fila normal de todas as abas. Clique no card Pausadas para ver só elas. Retomar devolve a admissão à fila de onde ela parou, sem perder nada.",
    },
    {
      sintoma: "O sistema avisa que a admissão está sem cliente ou cargo, aguardando liberação.",
      acao: "A régua de documentos resolve por cliente mais cargo, então sem os dois não há checklist a montar. Preencha os dois no lápis da linha e a admissão volta a andar.",
    },
  ],
};
