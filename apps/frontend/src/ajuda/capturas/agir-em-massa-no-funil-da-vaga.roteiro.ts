/**
 * ─ ROTEIRO: "Agir Em Massa No Funil Da Vaga". TRÊS imagens, TRÊS estados ──────────────────────
 *
 * ┌─ O QUE FICA SEM IMAGEM, E POR QUÊ. LEIA ANTES DE "COMPLETAR" ESTE ROTEIRO ───────────────────┐
 * │ 1. A BARRA DA SELEÇÃO (passos 2 e 3). Ela é uma faixa de ~50px colada acima da tabela, e vive   │
 * │    na MESMA aba que a barra do recorte, cujo campo de busca carrega este `title`: "A busca       │
 * │    procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." O     │
 * │    gate audita `title` e a recusa por LISTA VAZIA casa `\bnenhum(a|as|os)?\b\s+\p{L}+`, então    │
 * │    "nenhum endereço" recusa qualquer imagem que contenha aquela barra, com a fila cheia ou       │
 * │    vazia. Recortar SÓ a faixa passaria no gate e produziria a imagem inútil que esta frente já   │
 * │    mediu uma vez: 2460x92, elipses cortadas ao meio e rótulos inteiramente fora do quadro.       │
 * │ 2. O RESULTADO DO LOTE (passo 8, "O Que Ficou De Fora"). Ele só existe DEPOIS de um lote ser     │
 * │    APLICADO, e aplicar um lote no arnês move gente de etapa de verdade, quebrando o estado de    │
 * │    que os outros roteiros deste módulo dependem. Print não vale efeito colateral em base.        │
 * │                                                                                                 │
 * │ OS DOIS ESTÃO REPORTADOS ao coordenador. O que sobra são as TRÊS JANELAS do lote, que recortam   │
 * │ bem: elas são a parte que a pessoa lê antes de confirmar, que é onde o erro em massa se evita.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NENHUM ALVO CARREGA NOME DE PESSOA ─────────────────────────────────────────────────────────┐
 * │ A caixa de marcação da LINHA tem o nome de quem está nela no `aria-label`; a do CABEÇALHO não    │
 * │ tem, e é ela que o preparo usa. Os alvos são títulos de seção e controles de janela.             │
 * │ Nomes SIMULADO aparecem na lista "Quem Está Na Seleção", e podem: são do arnês declarado.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * A CAIXA DE MARCAÇÃO DO CABEÇALHO, apontada por seletor porque `checkbox` não está no vocabulário
 * de `Alvo`. Ela marca todas as linhas à vista que ainda aceitam decisão, e o nome acessível dela é
 * genérico: nenhuma pessoa entra no localizador.
 */
const MARCAR_TODOS: GestoDePreparo = {
  acao: "clicar",
  alvo: {
    seletor:
      '[role="dialog"][aria-label="Painel da vaga"] input[aria-label="Selecionar todos os candidatos à vista que aceitam decisão"]',
    texto: "a caixa do cabeçalho",
  },
};

const ATE_A_SELECAO: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    // §A.6: a coluna Consultor Responsável escreve nome de usuário REAL, e o gate procura os 42
    // nomes da denylist em cada imagem. Só a vaga do arnês na tela tira o dado do quadro.
    valor: "SIM-AS-2026-0601",
  },
  {
    acao: "clicar",
    alvo: {
      papel: "button",
      nome: /Abrir a gestão da vaga SIM-AS-2026-0601/,
      texto: "o botão da coluna Ações",
    },
  },
  {
    acao: "clicar",
    alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a aba da lista completa" },
  },
  /*
   * ESPERA. Até a lista chegar do backend a tela escreve "Carregando quem está nesta vaga.", que a
   * recusa por LISTA VAZIA casa. `rolarAte` é o único gesto de espera do vocabulário (600ms cada) e
   * é inócuo sobre um alvo que já está à vista.
   */
  ...Array.from(
    { length: 3 },
    (): GestoDePreparo => ({
      acao: "rolarAte",
      alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a barra das abas" },
    }),
  ),
  {
    /*
     * O RECORTE DA LISTA EXISTE PARA A SELEÇÃO TER TAMANHO. "E" é um FRAGMENTO que casa sete nomes do
     * arnês e NÃO está no prefixo "SIMULADO", comum a todos: sobram cinco que ainda aceitam decisão,
     * que é uma seleção de verdade em vez de uma pessoa só. Nenhum nome é digitado, então o print não
     * fica amarrado a um registro.
     */
    acao: "digitar",
    alvo: {
      seletor: 'input[aria-label="Buscar candidato por nome nesta vaga"]',
      texto: "a busca da vaga",
    },
    valor: "E",
  },
  MARCAR_TODOS,
];

export const roteiro: Roteiro = {
  slug: "agir-em-massa-no-funil-da-vaga",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_SELECAO,
  capturas: [
    {
      arquivo: "01-mover-no-funil-em-massa.png",
      legenda: "Passo 4: a janela de mover em massa, com a etapa de destino escolhida uma vez para o lote.",
      preparo: [
        {
          // O número da seleção entra no rótulo do botão, então a expressão casa a FORMA, não o
          // número. Ancorada, porque "Mover no funil" também é o texto de outros lugares da tela.
          acao: "clicar",
          alvo: { papel: "button", nome: /^Mover no funil \(\d+\)$/, texto: "o gesto da barra" },
        },
      ],
      /*
       * ─ O RECORTE ANCORA NO QUE A JANELA FAZ, NÃO NO NOME DELA ────────────────────────────────
       *
       * ┌─ ESTE ALVO JÁ ERA O TÍTULO, E O TÍTULO MUDOU ──────────────────────────────────────────┐
       * │ Ele casava `[aria-label="Mover No Funil Em Massa"]`, porque o `ModalDeLote` passa o       │
       * │ título como `ariaLabel`. Em 30/09/2026 aquele título virou "Mover Etapa Em Massa", numa   │
       * │ frente vizinha, e o seletor passaria a achar ZERO.                                        │
       * │                                                                                            │
       * │ É A TERCEIRA VEZ NO MESMO DIA que um alvo preso a texto de tela quebra: antes foram o tipo │
       * │ do campo de senha e a rota de exemplo de dois testes. A conclusão já é régua: **alvo preso │
       * │ à REDAÇÃO quebra quando alguém melhora a redação**, e melhorar a redação é trabalho normal.│
       * └──────────────────────────────────────────────────────────────────────────────────────────┘
       *
       * A ÂNCORA NOVA É O SELETOR DE ETAPA DE DESTINO, que é o que esta janela É: a única do lote
       * que escolhe etapa. Ele sobrevive à troca do título, e sobrevive NOS DOIS SENTIDOS, que é o
       * que importa hoje: o renomeio já está no código e ainda NÃO está no ar na homologação, então
       * um alvo casado com o nome novo falharia contra o build servido, e um casado com o nome velho
       * falharia assim que ele subir. Este casa com os dois.
       *
       * NÃO TROQUEI por um `aria-label` parcial em "Em Massa": ele casaria também o desvincular e o
       * finalizar, e um dia escolheria a janela errada em silêncio, que é pior do que falhar.
       */
      recorte: {
        seletor: '[role="dialog"]:has([aria-label="Etapa de destino"]) > div',
        texto: "a janela de mover em massa",
      },
      alvos: [
        {
          /*
           * É `button`, e não `combobox`: o campo é o `Select` do design system (§A.35), cujo gatilho
           * é um `<button>` com `aria-haspopup="listbox"` e `aria-label`, sem `role` explícito. O
           * `Combobox`, que é outro componente da casa, esse sim declara `role="combobox"`.
           */
          papel: "button",
          nome: /^Etapa de destino$/,
          texto: "1. Uma etapa para o lote todo",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-motivo-da-saida-em-massa.png",
      legenda: "Passo 6: a janela de desvincular em massa, com o desfecho e o motivo, que vale para a seleção inteira.",
      preparo: [
        {
          acao: "clicar",
          alvo: {
            papel: "button",
            nome: /^Desvincular da vaga \(\d+\)$/,
            texto: "o gesto da barra",
          },
        },
      ],
      recorte: {
        seletor: '[role="dialog"][aria-label="Desvincular Em Massa"] > div',
        texto: "a janela de desvincular em massa",
      },
      alvos: [
        {
          /*
           * ANCORADO NO INÍCIO: o botão junta o rótulo com a frase de apoio no nome acessível, e sem
           * a âncora "Descartado Pela Seleção" também casaria o card de indicador da Central De
           * Vagas, lá atrás. `lado` é sugestão, e "abaixo" é onde há espaço nesta janela.
           */
          papel: "button",
          nome: /^Descartado Pela Seleção/,
          texto: "1. Decisão da seleção",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /^Desistiu Do Processo/,
          texto: "2. Decisão do candidato",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-quem-esta-na-selecao.png",
      legenda: "Passo 7: a lista Quem Está Na Seleção, a última tela antes de gravar.",
      preparo: [
        {
          acao: "clicar",
          alvo: {
            papel: "button",
            nome: /^Desvincular da vaga \(\d+\)$/,
            texto: "o gesto da barra",
          },
        },
      ],
      recorte: {
        seletor: '[role="dialog"][aria-label="Desvincular Em Massa"] > div',
        texto: "a janela de desvincular em massa",
      },
      /*
       * UM ALVO SÓ, E ISSO É DELIBERADO: o miolo desta janela ROLA, e o resolvedor rola até cada
       * alvo antes de medir a caixa dele. Com dois alvos distantes, o segundo empurraria o primeiro
       * para fora da área visível DEPOIS de ele já ter sido medido, e a seta do primeiro sairia
       * desenhada no lugar errado, sem nada falhar.
       */
      alvos: [
        {
          papel: "heading",
          nome: /^Quem Está Na Seleção$/,
          texto: "3. Confira antes de confirmar",
          /*
           * ACIMA, e não à direita: o título de seção é um `<h3>` de bloco, então a elipse ocupa a
           * largura INTEIRA da janela e o rótulo à direita cai fora do recorte. Medido nesta frente,
           * olhando o PNG (§A.13).
           */
          lado: "acima",
        },
      ],
    },
  ],
};
