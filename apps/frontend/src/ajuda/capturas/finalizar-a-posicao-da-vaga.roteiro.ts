/**
 * ─ ROTEIRO: "Finalizar A Posição Da Vaga". TRÊS imagens, TRÊS estados ─────────────────────────
 *
 * ┌─ POR QUE TUDO AQUI É RECORTADO, E O RECORTE NÃO É ESTÉTICA ──────────────────────────────────┐
 * │ A aba "Ver Candidatos" monta a barra do recorte, e o campo de busca dela carrega este `title`:   │
 * │ "A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." │
 * │ O gate audita `title` e a recusa por LISTA VAZIA casa `\bnenhum(a|as|os)?\b\s+\p{L}+`: "nenhum   │
 * │ endereço" acende a recusa em qualquer imagem que contenha aquela barra, mesmo com a fila cheia.  │
 * │ É falso positivo, e a causa é uma frase de AJUDA do produto. O recorte tira a barra do quadro.   │
 * │                                                                                                 │
 * │ E O RECORTE FOI ESCOLHIDO PARA CONTINUAR ENSINANDO: a caixa da tabela tem a largura inteira do   │
 * │ painel, e a da janela tem a janela inteira, então cabe o alvo MAIS o rótulo dele (a lição de     │
 * │ `entrar-no-sistema.roteiro.ts`). Recortar no contorno do elemento passa no gate e não ensina.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ÍCONE DA LINHA É APONTADO POR `title`, E ISSO É §A.6 E NÃO ATALHO ────────────────────────┐
 * │ O nome ACESSÍVEL do ícone é o `aria-label`, que carrega o NOME DA PESSOA ("Finalizar a posição   │
 * │ da vaga com SIMULADO JULIET"). Alvo assim amarra o print a um registro e quebra quando a         │
 * │ ordenação mudar. O `title` é o rótulo GENÉRICO, que é o que a tela mostra no mouse e o que o     │
 * │ artigo ensina.                                                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { Alvo, GestoDePreparo, Roteiro } from "../tipos";

/** A caixa da tabela do painel. Larga como o painel: cabe alvo mais rótulo. */
const A_TABELA_DO_PAINEL: Alvo = {
  seletor: '[role="dialog"][aria-label="Painel da vaga"] div.ea-scroll.overflow-x-auto',
  texto: "a tabela de quem está na vaga",
};

const ATE_A_LISTA_DA_VAGA: GestoDePreparo[] = [
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
     * O FILTRO QUE FAZ A TABELA CABER NA VIEWPORT (1600x1000), exigência do motor: com as doze
     * candidaturas do arnês a tabela passa de 1700px de altura e o recorte é recusado com "ALVO FORA
     * DA VIEWPORT". "IE" é um FRAGMENTO, e não um nome: casa SIMULADO JULIET e SIMULADO SIERRA, e
     * nenhum outro do arnês (nem o prefixo "SIMULADO", comum a todos). Duas linhas, uma viva, que é
     * a que oferece o check de finalizar posição.
     */
    acao: "digitar",
    alvo: {
      seletor: 'input[aria-label="Buscar candidato por nome nesta vaga"]',
      texto: "a busca da vaga",
    },
    valor: "IE",
  },
];

const ABRIR_A_JANELA_DE_FINALIZAR: GestoDePreparo = {
  acao: "clicar",
  alvo: {
    seletor: '[role="dialog"][aria-label="Painel da vaga"] button[title="Finalizar posição"]',
    texto: "o check da linha",
  },
};

export const roteiro: Roteiro = {
  slug: "finalizar-a-posicao-da-vaga",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_LISTA_DA_VAGA,
  capturas: [
    {
      arquivo: "01-icone-finalizar-posicao.png",
      legenda: "Passo 1: o check da coluna de ações, que só aparece para quem ainda não entregou posição.",
      recorte: A_TABELA_DO_PAINEL,
      alvos: [
        {
          seletor: '[role="dialog"][aria-label="Painel da vaga"] button[title="Finalizar posição"]',
          texto: "1. Entrega a posição",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-de-qual-lado-da-meta.png",
      legenda: "Passos 2, 3 e 4: os dois lados da meta, a diferença entre os estados e o botão que aplica.",
      preparo: [ABRIR_A_JANELA_DE_FINALIZAR],
      /*
       * O RECORTE É A JANELA, apontada pelo `aria-label` do `Modal`: ele é estável e NÃO carrega nome
       * de pessoa, ao contrário do `<h2>` de outras janelas deste módulo.
       */
      recorte: {
        seletor: '[role="dialog"][aria-label="Finalizar a posição da vaga"] > div',
        texto: "a janela de finalizar posição",
      },
      alvos: [
        {
          /*
           * O NÚMERO DE POSIÇÕES ENTRA NO NOME ACESSÍVEL do cartão ("Posição Oficial 2 de 3 posições
           * preenchidas"), então a expressão casa só o começo: ela segue de pé quando a contagem
           * mudar, que é o que acontece a cada entrega.
           */
          papel: "button",
          nome: /^Posição Oficial/,
          texto: "1. Conta na meta oficial",
          lado: "acima",
        },
        {
          papel: "button",
          nome: /^Posição De Banco/,
          texto: "2. Conta no banco",
          lado: "acima",
        },
        {
          papel: "heading",
          nome: /^O Que Muda Para Esta Pessoa$/,
          texto: "3. Leia antes de confirmar",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-aba-alocados.png",
      legenda: "Passo 6: a aba Ver Candidatos Alocados, com a coluna Posição dizendo de que lado cada um entrou.",
      preparo: [
        {
          acao: "clicar",
          alvo: {
            papel: "button",
            nome: /^Ver Candidatos Alocados\s*\d*$/,
            texto: "a aba de quem entregou posição",
          },
        },
        /*
         * ESPERA, pelo mesmo motivo do preparo do roteiro: trocar de aba relê a lista, e a foto
         * tirada antes da resposta pega o "Carregando" que a recusa por LISTA VAZIA casa.
         */
        ...Array.from(
          { length: 3 },
          (): GestoDePreparo => ({
            acao: "rolarAte",
            alvo: {
              papel: "button",
              nome: /^Ver Candidatos Alocados\s*\d*$/,
              texto: "a barra das abas",
            },
          }),
        ),
      ],
      recorte: A_TABELA_DO_PAINEL,
      alvos: [
        {
          papel: "button",
          nome: /^Posição$/,
          texto: "4. De que lado cada um entrou",
          lado: "direita",
        },
      ],
    },
  ],
};
