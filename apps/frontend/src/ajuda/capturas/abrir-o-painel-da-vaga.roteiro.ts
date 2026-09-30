/**
 * ─ ROTEIRO: "Abrir O Painel Da Vaga". QUATRO imagens, DOIS estados de tela ─────────────────────
 *
 * ┌─ O PAINEL DA VAGA NÃO TEM ENDEREÇO PRÓPRIO, E ISSO GOVERNA O ARQUIVO INTEIRO ────────────────┐
 * │ Ele é uma JANELA aberta a partir da lista, não uma rota: a `url` deste roteiro é `/as/vagas`,   │
 * │ como a do artigo, e quem abre o painel é o `preparo`. Três das quatro imagens repetem o mesmo   │
 * │ clique em vez de se apoiarem no que a anterior deixou aberto, porque imagem que depende do      │
 * │ estado da anterior deixa de poder ser recapturada sozinha, e a primeira que precisar de ajuste  │
 * │ derruba as seguintes.                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BUSCA DO PREPARO É MEDIDA DE §A.6, E TAMBÉM DE PRECISÃO ──────────────────────────────────┐
 * │ A Central De Vagas tem a coluna "Consultor Responsável", que escreve NOME DE USUÁRIO REAL da    │
 * │ homologação, e o gate procura os 42 nomes da denylist em cada imagem. Deixar na tela só a vaga  │
 * │ do arnês (código `SIM-AS-2026-0601`, cujo consultor é a conta de captura) tira o dado do quadro │
 * │ SEM recortar pixel nenhum, e de quebra faz o botão da linha ser único: o alvo deixa de depender │
 * │ da ordem em que a lista veio.                                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA IMAGEM É RECORTADA. A lição de 30/09 (ver `entrar-no-sistema.roteiro.ts`) é que a caixa
 * precisa caber o alvo MAIS o rótulo dele, e o painel já ocupa quase toda a viewport: recortá-lo no
 * contorno jogaria para fora justamente as etiquetas vermelhas que explicam as setas.
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** Só a vaga do arnês na lista. Uma linha, nunca zero, e nenhum nome de pessoa real no quadro. */
const SO_A_VAGA_DO_ARNES: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    valor: "SIM-AS-2026-0601",
  },
];

/**
 * O CLIQUE QUE ABRE A JANELA, reusado pelas três imagens que precisam dela.
 *
 * O nome acessível do botão é `aria-label`, e ele carrega o CÓDIGO da vaga (`rotuloDaVaga` devolve
 * `v.codigo`). É dado de PROCESSO, nunca de pessoa: a régua de não amarrar o alvo a um nome vale
 * para nome de gente, e aqui o código é o que torna o alvo exato.
 */
const ABRIR_O_PAINEL: GestoDePreparo = {
  acao: "clicar",
  alvo: {
    papel: "button",
    nome: /Abrir a gestão da vaga SIM-AS-2026-0601/,
    texto: "o botão da coluna Ações",
  },
};

export const roteiro: Roteiro = {
  slug: "abrir-o-painel-da-vaga",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: SO_A_VAGA_DO_ARNES,
  capturas: [
    {
      arquivo: "01-botao-da-coluna-acoes.png",
      legenda: "Passo 1: o botão da coluna Ações, o único da linha, que abre o painel da vaga.",
      alvos: [
        {
          papel: "button",
          nome: /Abrir a gestão da vaga SIM-AS-2026-0601/,
          texto: "1. Abra o painel da vaga",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-topo-e-trilha.png",
      legenda:
        "Passos 2 e 3: o topo do painel, com o status da vaga, e a trilha com os dois eixos lado a lado.",
      preparo: [ABRIR_O_PAINEL],
      alvos: [
        {
          /*
           * `^...$` ANCORA O NOME INTEIRO, e não é zelo: `nome` em TEXTO casa por SUBSTRING no
           * localizador acessível, e com `.first()` vence o primeiro da página. Medido nesta frente:
           * "Posições" pegou o card "Posições Abertas" da faixa de indicadores e a seta saiu no
           * elemento errado, sem nada falhar (o alvo resolveu, o gate passou). Expressão ancorada
           * elimina a classe toda do problema.
           */
          papel: "button",
          nome: /^Mover status$/,
          texto: "2. Muda o status da vaga",
          forma: "elipse",
          lado: "direita",
        },
        {
          /*
           * O TÍTULO DE CADA EIXO DA TRILHA É UM `<span>` (`LadoTrilha`), e não um cabeçalho: ele
           * não tem papel acessível nenhum, então o seletor é a saída de emergência usada pelo
           * motivo certo. `:text-is` casa o texto INTEIRO, o que separa "Desfecho" (o título do
           * eixo) de "Desfechos" (a faixa de indicadores, atrás da janela).
           */
          seletor: 'span:text-is("Processo Seletivo")',
          texto: "3. Em que pé está o trabalho",
          /*
           * ACIMA, E NÃO À DIREITA, e o motivo foi VISTO no PNG (§A.13): à direita do título fica a
           * pill do estado ("Vaga Aberta"), que é justamente o que este passo manda ler, e a
           * etiqueta vermelha a cobria por inteiro. A imagem passava em todos os gates e escondia o
           * dado que ela existe para mostrar.
           */
          lado: "acima",
        },
        {
          seletor: 'span:text-is("Desfecho")',
          texto: "4. Como a vaga terminou",
          // Mesma medida do alvo anterior: à direita ficava por cima da pill "Ainda Não Encerrada".
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "03-abas-do-painel.png",
      legenda: "Passo 5: as quatro abas do painel, na barra do meio, com a contagem de cada uma.",
      preparo: [ABRIR_O_PAINEL],
      alvos: [
        { papel: "button", nome: /^A Vaga$/, texto: "5. A ficha da vaga", lado: "abaixo" },
        {
          /*
           * A CONTAGEM ENTRA NO NOME ACESSÍVEL DA ABA, E **SEM ESPAÇO ANTES DELA**. O rótulo e o
           * número são irmãos no JSX sem nada entre os dois, então o nome acessível sai "Ver
           * Candidatos12", não "Ver Candidatos 12": `/^Ver Candidatos \d+$/` não achou nada, e a
           * conferência acusou alvo perdido. O `\s*` cobre os dois casos.
           *
           * E O `\d*` É **ZERO OU MAIS**, DE PROPÓSITO: a contagem só existe depois que a lista da
           * vaga chega do backend, e até lá a aba se chama só "Ver Candidatos". Com `\d+` a captura
           * virava corrida contra a rede e falhava com "alvo não encontrado", que é a mensagem do
           * detector de artigo velho apontando para um artigo certo. A âncora final continua
           * separando esta aba de "Ver Candidatos Alocados", que começa igual.
           */
          papel: "button",
          nome: /^Ver Candidatos\s*\d*$/,
          texto: "6. Quem está no processo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /^Candidatos Disponíveis$/,
          texto: "7. Quem ainda pode entrar",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "04-rodape-fechar.png",
      legenda: "Passo 8: o botão Fechar, no rodapé do painel.",
      preparo: [ABRIR_O_PAINEL],
      alvos: [
        {
          /*
           * `^Fechar$` E NÃO "Fechar": a barra das abas oferece a ação de ENCERRAR a vaga, cujo nome
           * acessível começa pela mesma palavra. Com casamento por substring, o rótulo do rodapé
           * sairia desenhado sobre o botão que fecha a VAGA, que é o oposto do que este passo ensina.
           */
          papel: "button",
          nome: /^Fechar$/,
          texto: "8. Fecha o painel",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
