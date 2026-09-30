import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: a fila de Não Conformidades.
 *
 * Reúne os cinco artigos desta tela: ler a fila, registrar a não conformidade de cadastro, aprovar
 * ou reprovar, resolver, e entender as duas vias. Os cinco começam no mesmo lugar e tropeçam nas
 * mesmas coisas: o menu não liberado, o papel que não julga, e a fila que parece vazia por causa do
 * filtro em vez de por falta de registro.
 *
 * ┌─ A DISTINÇÃO QUE ESTA FAMÍLIA EXISTE PARA NÃO DEIXAR DIVERGIR ───────────────────────────────┐
 * │ A tela tem DUAS mensagens de lista vazia, e elas dizem coisas opostas: uma é filtro, a outra é │
 * │ fila realmente vazia. Escrita cinco vezes, essa diferença vira cinco explicações, e quem lê a  │
 * │ errada conclui que não há trabalho quando há. Ela mora aqui uma vez.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As mensagens são as que o código escreve, letra por letra (`app/(app)/nao-conformidades/page.tsx`),
 * e não uma paráfrase: é por elas que a pessoa procura.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "nao-conformidades",
  rotulo: "Não Conformidades",
  preRequisitos: [
    "Ter o menu Não Conformidades liberado para o seu usuário.",
    "A não conformidade já precisa existir: ela nasce do aceite de avanço com pendências na Esteira, ou é registrada aqui como não conformidade de cadastro.",
    /*
     * ─ A FRASE ANTERIOR ERA FALSA, E O AUDITOR A PEGOU ANTES DE ELA CHEGAR AO LEITOR ─────────────
     *
     * Estava escrito "julgar uma não conformidade é ação de Master ou Super Admin, o consultor
     * enxerga a fila e não decide sobre ela". O código diz o contrário na maior parte: UMA rota é
     * restrita (a decisão sobre o pedido de liberação por diretoria, com papel declarado no
     * controlador); registrar, pedir a liberação e RESOLVER não têm restrição de papel nenhuma, e a
     * tela desenha o botão de resolver sem gate.
     *
     * POR QUE O ERRO ERA CARO, e não uma imprecisão: o bloco da família é somado ao pré-requisito de
     * TODOS os artigos desta tela, então a frase apareceria em cima dos artigos que ensinam o
     * consultor a fazer exatamente o que ela dizia que ele não faz, inclusive contradizendo, na
     * mesma página, o pré-requisito próprio de um deles. Quem lê e acredita não tenta, e escala para
     * a supervisão um trabalho que é dele.
     */
    "Aprovar ou reprovar o pedido de liberação por determinação da diretoria é ação de Master ou Super Admin. Ler a fila, registrar e resolver é de qualquer consultor com o menu liberado.",
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Falha ao carregar as não conformidades.",
      acao: "A consulta não voltou. Recarregue a página. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
    {
      sintoma: "A lista diz Nenhuma não conformidade com os filtros atuais.",
      acao: "É filtro, não é fila vazia. Limpe a busca do topo e as datas de Registrada de e Registrada até, e recomece marcando um campo por vez.",
    },
    {
      sintoma: "A lista diz Nenhuma não conformidade registrada.",
      acao: "Aí a fila está de fato vazia: nada foi registrado no recorte inteiro. É mensagem diferente da de filtro, e é essa a que diz que não há trabalho.",
    },
    {
      sintoma: "A tela mostra Falha na ação.",
      acao: "O aprovar, reprovar ou resolver não foi aplicado. Recarregue a fila para ver o estado real antes de repetir o clique, para não julgar duas vezes o mesmo registro.",
    },
    {
      sintoma: "A coluna de consultor mostra Sem consultor.",
      acao: "A não conformidade não tem responsável registrado. Não é erro de tela: é registro que nasceu sem autor identificado.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
