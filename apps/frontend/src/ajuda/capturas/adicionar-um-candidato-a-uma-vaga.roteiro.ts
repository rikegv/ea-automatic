/**
 * ─ ROTEIRO: "Adicionar Um Candidato A Uma Vaga". DUAS imagens ───────────────────────────────────
 *
 * A JANELA É FOTOGRAFADA COM OS DOIS SELETORES FECHADOS, e isso é decisão de §A.6, não de estética:
 * aberto, o seletor de candidato lista NOME, CIDADE e a marca de quem não tem CPF, pessoa a pessoa.
 * Fechado, ele mostra o texto de apoio e a contagem de quantas estão disponíveis, que é exatamente o
 * que o artigo ensina no passo 2. O mesmo vale para o seletor de vaga.
 *
 * ┌─ A CONFIRMAÇÃO DE REENTRADA FICA SEM IMAGEM, E O MOTIVO É QUE ELA É UM EFEITO ───────────────┐
 * │ "Reentrada Em Vaga Encerrada" só aparece DEPOIS de escolher uma pessoa, escolher a vaga em que  │
 * │ ela já teve processo e clicar em alocar, ou seja, depois de EXECUTAR uma alocação de verdade na │
 * │ homologação. Captura que muda o estado do sistema é captura que não é repetível: a segunda      │
 * │ rodada encontraria a candidatura já criada e a janela não abriria mais. O passo 5 continua       │
 * │ ensinado em texto, com os rótulos do bloco em `controles`.                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM ALVO É BOTÃO DE LINHA: o gesto desta peça nasce no topo da tela, e a "Trazer De Volta" do
 * passo 6 é a ação da linha de quem saiu, cujo nome acessível carrega o nome da pessoa (§A.6). Ela é
 * ensinada em texto e tem artigo próprio.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo. */
const PAGINA = "main";
/** O painel da janela. Aqui ele é só o alvo do gesto de espera, e não a caixa do recorte. */
const PAINEL = 'div[role="dialog"] .panel';
/** O CORPO da janela: os dois campos, sem o cabeçalho e sem o rodapé. Ver o bloco da imagem 02. */
const CORPO = 'div[role="dialog"] .ea-scroll';

const ABRIR_A_JANELA: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: "Adicionar à vaga", texto: "" },
};

export const roteiro: Roteiro = {
  slug: "adicionar-um-candidato-a-uma-vaga",
  url: "/as/candidatos",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-botao-adicionar-a-vaga.png",
      legenda: "Passo 1: o botão de adicionar à vaga, no topo da Central.",
      // Sem preparo: a janela aberta cobriria o botão que esta imagem aponta.
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Adicionar à vaga",
          texto: "1. Abra a janela",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-janela-de-alocacao.png",
      legenda: "Passo 2: o corpo da janela, com o campo em que se escolhe a pessoa.",
      /*
       * O SEGUNDO GESTO É ESPERA, E NÃO ROLAGEM. A janela busca a lista de quem está disponível
       * assim que abre, e enquanto a resposta não chega ela escreve "Carregando os candidatos
       * disponíveis." na tela. O detector de lista vazia acusa esse texto e recusa a captura, com
       * razão: o print sairia com a janela em branco. O motor espera 600ms por gesto de preparo,
       * então um gesto inócuo a mais compra a espera de que a busca precisa. Medido em 30/09/2026:
       * com um gesto só, a recusa era "LISTA_VAZIA, com o estado Carregando escrito na tela".
       */
      preparo: [
        ABRIR_A_JANELA,
        { acao: "rolarAte", alvo: { seletor: PAINEL, texto: "" } },
      ],
      /*
       * ─ O RECORTE É O CORPO DA JANELA, E CADA PALAVRA DESTE BLOCO CUSTOU UMA RODADA ────────────
       *
       * ┌─ SEM RECORTE, A CAPTURA É RECUSADA, E A RECUSA É DE UM DETECTOR QUE SE ENGANA ────────┐
       * │ O detector de LISTA VAZIA procura a palavra "nenhum" seguida de outra palavra, e quem a │
       * │ escreve aqui é o TEXTO DE APOIO do cabeçalho da própria janela ("o CPF não é exigido em │
       * │ ponto nenhum deste caminho"). A tela está cheia (medido: 1 lista, 10 linhas), e mesmo   │
       * │ assim a captura é recusada, porque o vazio ESCRITO vence a contagem de propósito.       │
       * │                                                                                         │
       * │ É RECUSA A MAIS, e o contrato a prefere: print a menos se refaz, print mudo no manual   │
       * │ ensina errado. O conserto certo é o RECORTE, primeira saída da régua, e não declarar    │
       * │ `linhasEsperadas`, que existe para o artigo que ENSINA o vazio, nunca para destravar.   │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * ┌─ E O RECORTE PEQUENO SÓ CABE **UM** RÓTULO, QUE É POR QUE ESTA IMAGEM TEM UM ALVO SÓ ──┐
       * │ O corpo tem 570 pixels de largura e os dois campos ocupam a largura inteira dele, então │
       * │ rótulo "à direita" nasce fora do quadro (quem decide onde ele cabe mede contra a         │
       * │ VIEWPORT, não contra o recorte). Sobra "abaixo". E "abaixo" do campo do candidato é       │
       * │ exatamente onde está a marcação do campo da vaga: marcando os dois, o motor desvia o     │
       * │ primeiro rótulo para CIMA, que no alto do recorte sai CORTADO. Medido olhando o PNG      │
       * │ (§A.13), nas duas tentativas.                                                           │
       * │ O campo da vaga continua ensinado em texto, no passo 3.                                 │
       * └─────────────────────────────────────────────────────────────────────────────────────────┘
       */
      recorte: { seletor: CORPO, texto: "" },
      alvos: [
        { papel: "combobox", nome: "Candidato", texto: "2. Escolha pelo nome", lado: "abaixo" },
      ],
    },
  ],
};
