/**
 * ─ ROTEIRO: "Revisar Uma Vaga Pendente De Revisão". DUAS imagens, DOIS estados de tela ──────────
 *
 * ┌─ A FILA ESTAVA VAZIA, E ERA ISSO QUE IMPEDIA O PRINT. FOI RESOLVIDO COM DADO ────────────────┐
 * │ Esta fila lê UMA coisa só: vaga com o status do papel REVISAO (`vagas.service`,                │
 * │ `pendentesDeRevisao`). Medido na homologação em 30/09/2026, o arnês de A&S tinha três vagas    │
 * │ (ABERTA, CANCELADA e RASCUNHO) e NENHUMA pendente, então a tela abria com "Nenhuma vaga         │
 * │ esperando revisão" e o motor recusava, com razão: print de fila vazia parece pronto, que é pior │
 * │ do que print faltando.                                                                         │
 * │                                                                                                │
 * │ CUIDADO COM O HOMÔNIMO, porque ele já custou uma rodada: a tabela de CONFLITOS DA INGESTÃO      │
 * │ (`as_ingestao_conflitos`) tinha uma linha semeada, e ela alimenta OUTRA tela. Conflito de       │
 * │ ingestão não é vaga pendente de revisão, e povoar um não povoa o outro.                         │
 * │                                                                                                │
 * │ O QUE DESTRAVOU foi a vaga `SIM-AS-2026-0604` ("Vaga Simulada Aguardando Revisão"), semeada com │
 * │ `cod_cliente` NULO **de propósito**: é a ausência do cliente que desenha a etiqueta Sem Cliente, │
 * │ que é exatamente a pendência que este artigo ensina a resolver. Fila com uma linha, e ela é a   │
 * │ linha certa.                                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NESTA TELA NÃO HÁ PESSOA NENHUMA, E ISSO MUDA O QUE PODE VIRAR IMAGEM ──────────────────────┐
 * │ A linha inteira é dado de PROCESSO: código da vaga, nome de divulgação, cargo, cliente, cidade, │
 * │ posições, quantidade de candidatos e data de entrada. Nenhuma coluna mostra gente, então o      │
 * │ recorte aqui é de enquadramento, não de §A.6. O gate continua rodando sobre o que está no       │
 * │ quadro, e continua sendo ele quem manda.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TABELA É MAIS LARGA QUE A TELA, E ISSO PARTIU A PRIMEIRA IMAGEM EM DUAS ─────────────────┐
 * │ A tabela tem largura mínima de 1380 e a área útil da captura tem ~1285: ela SEMPRE rola na     │
 * │ horizontal, que é a régua da casa (rolar, nunca espremer). O efeito no motor é traiçoeiro e    │
 * │ foi medido olhando o PNG (§A.13): as caixas dos alvos são medidas UMA A UMA, e resolver um alvo │
 * │ da ponta direita ROLA a tabela, invalidando as caixas já medidas. O desenho sai com as elipses  │
 * │ deslocadas ~95 pixels para a direita, cada uma em cima da coluna vizinha, e NADA falha.        │
 * │                                                                                                │
 * │ A REGRA PRÁTICA QUE FICA: todos os alvos de uma imagem precisam viver na MESMA faixa horizontal │
 * │ da tabela. Por isso a fila virou DUAS imagens: a primeira olha a esquerda (busca e etiqueta),   │
 * │ com os nomes de coluna inteiros; a segunda rola até a ponta direita e olha o botão de revisar.  │
 * │ Na segunda, a coluna do código aparece cortada: é a rolagem horizontal fazendo o que ela existe │
 * │ para fazer, e não coluna esmagada (§A.20).                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ABA "Liberadas Recentemente" NÃO APARECE em imagem nenhuma, e a ausência é do ambiente: ela só é
 * desenhada para MASTER, e a conta de captura é COMUM. O artigo daquela aba é outro, e continua sem
 * imagem enquanto o diretor não decidir o papel da conta.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo: é o `<main>` da casca do sistema. */
const PAGINA = "main";
/** A busca do topo, pelo `aria-label`: campo de texto sem rótulo visível ao lado. */
const BUSCA = 'input[aria-label="Buscar na fila de revisão"]';
/**
 * A ETIQUETA "Sem Cliente" É UM `span`, não um controle, então não tem papel acessível e só é
 * alcançável por seletor. `.pill.dg` é o tom de recusa do design system, e nesta tela ele existe uma
 * vez só: a coluna Cliente desenha `ok` quando o cliente está vinculado e `dg` quando falta.
 */
const ETIQUETA_SEM_CLIENTE = "span.pill.dg";

const ABRIR_O_FORMULARIO: GestoDePreparo[] = [
  { acao: "clicar", alvo: { papel: "button", nome: "Revisar vaga", texto: "" } },
  /*
   * O SEGUNDO GESTO É ESPERA, NÃO ROLAGEM. A tela não abre o formulário com o dado que a lista já
   * tinha: ela busca a vaga inteira primeiro, e enquanto a resposta não chega mostra "Abrindo a
   * vaga…". O motor espera 600ms por gesto de preparo, então um gesto inócuo a mais compra a espera
   * de que a busca precisa.
   */
  { acao: "rolarAte", alvo: { seletor: 'div[role="dialog"]', texto: "" } },
];

export const roteiro: Roteiro = {
  slug: "revisar-uma-vaga-pendente-de-revisao",
  url: "/as/vagas-pendentes-revisao",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-fila-de-revisao.png",
      legenda:
        "Passos 2 a 4: a fila, com a busca do topo e a etiqueta Sem Cliente na coluna do cliente.",
      /*
       * Sem preparo, e sem NENHUM alvo na ponta direita da tabela: é isso que mantém a tabela na
       * posição em que ela chega, com os nomes das colunas inteiros. Ver o bloco do cabeçalho.
       */
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        /*
         * À ESQUERDA, e não abaixo: abaixo da busca é o CABEÇALHO da tabela, e o rótulo cobria os
         * nomes de duas colunas (§A.20). À esquerda existe o vão entre o contador da fila e o campo.
         * Medido olhando o PNG (§A.13).
         */
        { seletor: BUSCA, texto: "1. Ache a vaga na fila", lado: "esquerda" },
        {
          seletor: ETIQUETA_SEM_CLIENTE,
          texto: "2. A pendência que trava",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-botao-revisar.png",
      legenda: "Passo 5: o botão que abre o formulário, na ponta direita da linha.",
      /*
       * A ROLAGEM É O PREPARO. Ela leva a tabela até a ponta direita ANTES de qualquer medição, que
       * é o que impede o deslocamento descrito no cabeçalho. A coluna do código fica cortada à
       * esquerda: é a rolagem horizontal da tabela, e é o comportamento que o sistema prescreve.
       */
      preparo: [
        { acao: "rolarAte", alvo: { papel: "button", nome: "Revisar vaga", texto: "" } },
      ],
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Revisar vaga",
          texto: "3. Abre o formulário",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-saidas-da-revisao.png",
      legenda:
        "Passos 6 e 7: o rodapé do formulário, com liberar a vaga ou guardar o que já foi preenchido.",
      preparo: ABRIR_O_FORMULARIO,
      /*
       * SEM `recorte`, pela regra que a Central De Candidatos registra no cabeçalho dela: quem decide
       * onde o rótulo cabe mede contra a VIEWPORT, nunca contra a caixa recortada, então recortar o
       * painel de uma janela empurra a legenda para fora da imagem. Imagem de janela não leva
       * recorte. Aqui ele também não faria falta por §A.6: não há pessoa nesta tela.
       */
      alvos: [
        {
          /*
           * A EXPRESSÃO É OBRIGATÓRIA: enquanto falta campo obrigatório, o botão se chama "Liberar
           * vaga (2 pendentes)", com o NÚMERO dentro do nome acessível. Um nome exato só resolveria
           * no dia em que a vaga estivesse completa, que é justamente o dia em que ela não está mais
           * na fila.
           */
          papel: "button",
          nome: /^Liberar vaga/,
          texto: "4. Só libera sem pendência",
          forma: "elipse",
          lado: "acima",
        },
        {
          papel: "button",
          nome: "Salvar sem liberar",
          texto: "5. Guarda e mantém na fila",
          lado: "acima",
        },
      ],
    },
  ],
};
