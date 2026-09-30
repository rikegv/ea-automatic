/**
 * ─ ROTEIRO: "Mover O Candidato De Etapa". TRÊS imagens, DOIS estados ───────────────────────────
 *
 * ┌─ POR QUE TODA IMAGEM DESTE ROTEIRO É RECORTADA, E O RECORTE NÃO É ESTÉTICA ──────────────────┐
 * │ A aba "Ver Candidatos" monta a barra do recorte, e o campo de busca dela carrega este `title`:   │
 * │ "A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." │
 * │ O gate audita `title` (`ATRIBUTOS_LIDOS`, em `pii.ts`) e a recusa por LISTA VAZIA casa           │
 * │ `\bnenhum(a|as|os)?\b\s+\p{L}+`: "nenhum endereço" ACENDE a recusa em qualquer imagem que        │
 * │ contenha aquela barra, mesmo com a fila cheia (medido em 30/09/2026: a recusa veio dizendo "2    │
 * │ lista(s), 13 linha(s) de dado"). É falso positivo, e a causa é uma frase de AJUDA do produto.    │
 * │                                                                                                 │
 * │ ENTÃO O RECORTE TIRA A BARRA DO QUADRO, e ele foi escolhido para continuar ENSINANDO: a caixa da │
 * │ tabela tem a largura inteira do painel e treze linhas de altura, então cabe o alvo MAIS o rótulo │
 * │ dele, que é a lição de `entrar-no-sistema.roteiro.ts`. Recortar no contorno do elemento produz   │
 * │ imagem que passa em todos os gates e não ensina nada (tentado nesta frente, 2460x92, rótulos     │
 * │ inteiramente fora do quadro).                                                                   │
 * │                                                                                                 │
 * │ O QUE FICA SEM IMAGEM, E ESTÁ REPORTADO: a própria barra do recorte (passo 1, "Buscar Por Nome", │
 * │ "Situação" e "Etapa"). Ela é, literalmente, o elemento que o gate recusa.                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS ÍCONES DE AÇÃO SÃO APONTADOS POR `title`, E ISSO É §A.6 E NÃO ATALHO ────────────────────┐
 * │ O nome ACESSÍVEL de cada ícone da linha é o `aria-label`, que carrega o NOME DA PESSOA ("Mover   │
 * │ SIMULADO GOLF de etapa"). Alvo assim amarra o print a um registro do arnês e quebra no dia em    │
 * │ que a ordenação mudar. O `title` do mesmo botão é o rótulo GENÉRICO ("Mover de etapa"), que é o  │
 * │ que a tela mostra no mouse e o que o artigo ensina. Por isso o seletor, e ele é a exceção certa. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { Alvo, GestoDePreparo, Roteiro } from "../tipos";

/** A caixa da tabela do painel. Larga como o painel e alta como a fila: cabe alvo mais rótulo. */
const A_TABELA_DO_PAINEL: Alvo = {
  seletor: '[role="dialog"][aria-label="Painel da vaga"] div.ea-scroll.overflow-x-auto',
  texto: "a tabela de quem está na vaga",
};

/** Buscar a vaga do arnês, abrir a janela dela e parar na lista completa de quem está nela. */
const ATE_A_LISTA_DA_VAGA: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    /*
     * §A.6: a Central De Vagas escreve NOME DE USUÁRIO REAL na coluna Consultor Responsável, e o
     * gate procura os 42 nomes da denylist em cada imagem. Deixar na tela só a vaga do arnês tira o
     * dado do quadro sem recortar pixel nenhum, e torna o botão da linha ÚNICO.
     */
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
    /*
     * A contagem entra no nome acessível da aba SEM espaço ("Ver Candidatos12"), e só existe depois
     * que a lista chega do backend: `\s*\d*` cobre os dois momentos, e a âncora final separa esta
     * aba de "Ver Candidatos Alocados", que começa igual.
     */
    alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a aba da lista completa" },
  },
  /*
   * ESPERA. A lista chega do backend depois do clique, e até lá a tela escreve "Carregando quem está
   * nesta vaga.", que a recusa por LISTA VAZIA casa. `rolarAte` é o único gesto de espera do
   * vocabulário (600ms cada) e é inócuo sobre um alvo que já está à vista.
   */
  ...Array.from(
    { length: 3 },
    (): GestoDePreparo => ({
      acao: "rolarAte",
      alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a barra das abas" },
    }),
  ),
  /*
   * ─ O FILTRO QUE FAZ A TABELA CABER NA VIEWPORT, e ele é EXIGÊNCIA DO MOTOR ────────────────────
   *
   * A captura é de viewport (1600x1000) e o recorte precisa caber DENTRO dela: com as doze
   * candidaturas do arnês a tabela mede mais de 1700px de altura, e o motor recusou o recorte com
   * "ALVO FORA DA VIEWPORT depois da rolagem", que é a guarda certa (anotar fora da viewport
   * desenharia a seta no lugar errado).
   *
   * O TERMO É UM FRAGMENTO, E NÃO UM NOME: "IE" casa SIMULADO JULIET e SIMULADO SIERRA, e nenhum
   * outro do arnês (nem o prefixo "SIMULADO", que é comum a todos). Duas linhas, que é o que este
   * roteiro precisa: uma viva, com a seta de mover, e uma encerrada, que mostra o "Fora Do Funil".
   * Digitar o nome de alguém amarraria o print a UM registro; um fragmento amarra ao arnês.
   */
  {
    acao: "digitar",
    alvo: {
      seletor: 'input[aria-label="Buscar candidato por nome nesta vaga"]',
      texto: "a busca da vaga",
    },
    valor: "IE",
  },
];

/** Abrir a janela de decisão pela seta da linha. Ver o bloco sobre `title` no topo do arquivo. */
const ABRIR_A_JANELA_DE_MOVER: GestoDePreparo = {
  acao: "clicar",
  alvo: {
    seletor: '[role="dialog"][aria-label="Painel da vaga"] button[title="Mover de etapa"]',
    texto: "a seta da linha",
  },
};

export const roteiro: Roteiro = {
  slug: "mover-o-candidato-de-etapa",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_LISTA_DA_VAGA,
  capturas: [
    {
      arquivo: "01-icone-mover-de-etapa.png",
      legenda: "Passo 2: a seta da coluna de ações, que abre a janela de movimento.",
      recorte: A_TABELA_DO_PAINEL,
      alvos: [
        {
          seletor: '[role="dialog"][aria-label="Painel da vaga"] button[title="Mover de etapa"]',
          texto: "1. Abre o movimento",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-cards-de-etapa.png",
      legenda: "Passos 3 e 4: os cards da fileira do funil, cada um dizendo o que aquele clique faz.",
      preparo: [ABRIR_A_JANELA_DE_MOVER],
      /*
       * O RECORTE É A JANELA DE MOVER, apontada pelo `aria-label` do `Modal`, que é estável e NÃO
       * carrega nome de pessoa. O `<h2>` daquela janela é o NOME DO CANDIDATO, então casar por ele
       * amarraria o recorte a um registro do arnês.
       */
      recorte: {
        seletor: '[role="dialog"][aria-label="Mover a candidatura"] > div',
        texto: "a janela de mover",
      },
      alvos: [
        {
          papel: "heading",
          nome: /^Mover No Funil$/,
          texto: "2. A fileira do funil",
          /*
           * ACIMA, E NÃO À DIREITA, e o motivo foi VISTO no PNG (§A.13): o título da seção é um
           * `<h3>` de bloco, então a elipse ocupa a largura INTEIRA da janela e o rótulo à direita
           * cai FORA do recorte. A imagem saiu com um círculo sem legenda nenhuma, passando em todos
           * os gates. É a mesma lição de `entrar-no-sistema.roteiro.ts`, encontrada de novo.
           */
          lado: "acima",
        },
        {
          /*
           * O CARD É UM BOTÃO cujo nome acessível junta o rótulo da etapa com a frase de apoio
           * ("Captação Avançar para cá"). Casar pela FRASE, e não pelo nome da etapa, mantém o alvo
           * de pé quando a diretoria renomear ou reordenar as etapas do catálogo, que é justamente o
           * que este passo ensina que acontece.
           */
          papel: "button",
          nome: /Avançar para cá/,
          texto: "3. Cada card diz o que faz",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-coluna-etapa.png",
      legenda: "Passo 6: a coluna Etapa da lista, e o Fora Do Funil de quem já saiu do processo.",
      recorte: A_TABELA_DO_PAINEL,
      alvos: [
        {
          papel: "button",
          nome: /^Etapa$/,
          texto: "4. Onde a pessoa está",
          /*
           * DIREITA, e as outras foram medidas no PNG (§A.13): "acima" joga o rótulo para FORA do
           * recorte, porque a caixa começa na própria linha do cabeçalho, e a imagem saiu com só a
           * ponta da seta aparecendo; "abaixo" colide com a elipse da célula logo abaixo. À direita
           * sobra a coluna Situação, que é espaço de cabeçalho e não esconde dado de linha.
           */
          lado: "direita",
        },
        {
          /*
           * `cell` É O PAPEL DA CÉLULA da tabela, e o nome dela aqui é o rótulo da pill. Ele não
           * carrega nome de pessoa, então o alvo não amarra o print a um registro: qualquer linha
           * que já tenha saído do processo serve.
           */
          papel: "cell",
          nome: /^Fora Do Funil$/,
          texto: "5. Quem já saiu do processo",
          lado: "esquerda",
        },
      ],
    },
  ],
};
