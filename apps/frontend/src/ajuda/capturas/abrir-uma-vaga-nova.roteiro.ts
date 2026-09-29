/**
 * ROTEIRO DE CAPTURA: "Abrir Uma Vaga Nova". QUATRO imagens, TRÊS estados de tela.
 *
 * ┌─ É O ROTEIRO QUE EXERCITA O `preparo` POR IMAGEM, E ELE NASCEU DESTE CASO ───────────────────┐
 * │ Um passo a passo de formulário ATRAVESSA estados por definição: a lista ANTES da janela, a      │
 * │ janela no PRIMEIRO passo, o rodapé no ÚLTIMO. Com preparo só no roteiro, este artigo exigiria   │
 * │ três roteiros, e roteiro e artigo deixariam de envelhecer juntos.                               │
 * │                                                                                                │
 * │ A SEMÂNTICA QUE ESTE ARQUIVO ASSUME, e ela está escrita no `tipos.ts`: cada imagem parte do     │
 * │ estado do ROTEIRO, e só então aplica o preparo dela. Por isso a segunda e a terceira repetem o  │
 * │ clique que abre a janela, em vez de a terceira se apoiar no que a segunda deixou aberto: imagem │
 * │ que depende da anterior deixa de poder ser capturada sozinha, e a primeira que precisar de um    │
 * │ ajuste derruba as seguintes.                                                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ROTEIRO NÃO TEM PREPARO NENHUM, E ISSO É DE PROPÓSITO ────────────────────────────────────┐
 * │ O preparo do roteiro vale para TODAS as imagens, e a primeira delas é justamente a lista SEM a  │
 * │ janela aberta. Abrir a janela ali cobriria o botão que a imagem existe para apontar.            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a janela nasce VAZIA, então este roteiro não pede arnês. O seletor de cliente fica FECHADO na
 * captura, mostrando só o texto de apoio: aberto, ele listaria a carteira inteira, que é dado de
 * empresa e não precisa entrar em imagem nenhuma para ensinar onde se escolhe o cliente.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. A execução está vetada até o gate de dado pessoal estar
 * pronto e travado em teste.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * O gesto que abre a janela, reusado pelas três imagens que precisam dela.
 *
 * O ALVO É O BOTÃO DA LISTA, e o nome dele é "Abrir vaga", em escrita de comando. O botão de publicar,
 * lá dentro, é "Abrir Vaga", que é o MESMO nome acessível para efeito de localizador: a comparação por
 * papel e nome não distingue caixa. É por isso que a quarta imagem aponta o botão de publicar por
 * seletor dentro da janela, e não pelo nome.
 */
const ABRIR_A_JANELA: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: "Abrir vaga", texto: "Abrir vaga" },
};

/** Avançar até o último dos cinco passos, onde o botão de publicar aparece. */
const IR_AO_ULTIMO_PASSO: GestoDePreparo[] = [
  ABRIR_A_JANELA,
  ...Array.from(
    { length: 4 },
    (): GestoDePreparo => ({
      acao: "clicar",
      alvo: { papel: "button", nome: "Continuar", texto: "Continuar" },
    }),
  ),
];

export const roteiro: Roteiro = {
  slug: "abrir-uma-vaga-nova",
  url: "/as/vagas",
  capturas: [
    {
      arquivo: "01-botao-abrir-vaga.png",
      legenda: "Passo 2: o botão de abrir vaga, ao lado da busca e dos filtros.",
      // Sem preparo: esta é a lista como ela está quando a pessoa chega.
      alvos: [{ papel: "button", nome: "Abrir vaga", texto: "1. Abra a vaga", forma: "elipse" }],
    },
    {
      arquivo: "02-passo-a-vaga.png",
      legenda: "Passo 3: o primeiro passo da janela, com cliente, código e posições.",
      preparo: [ABRIR_A_JANELA],
      alvos: [
        {
          papel: "combobox",
          nome: "Cliente da vaga",
          texto: "2. Escolha o cliente",
          lado: "direita",
        },
        {
          papel: "textbox",
          nome: /Código da vaga/,
          texto: "3. Número do processo",
          lado: "direita",
        },
        {
          /*
           * ─ `spinbutton`, E NÃO `textbox`: É CAMPO NUMÉRICO ──────────────────────────────────────
           *
           * O campo é `<input type="number">` (`TrilhaDaVaga.tsx`, "Nº de posições oficiais"), e o
           * papel acessível de um campo numérico é `spinbutton`. `textbox` cobre o campo de texto e
           * NÃO casa com ele, então o alvo nunca resolvia.
           *
           * ┌─ POR QUE ISTO SÓ APARECEU AGORA, e o que ensina sobre ler falha de gate ────────────┐
           * │ Este roteiro morria ANTES, na imagem 01, recusado pelo gate por um falso positivo de  │
           * │ CPF (o hash de um arquivo de build). Consertado o falso positivo, a execução avançou e │
           * │ encontrou este defeito, que estava aqui desde que o roteiro foi escrito.              │
           * │ FALHA DE GATE ESCONDE O QUE VEM DEPOIS DELA: um roteiro "com um problema" podia ter    │
           * │ dois, e a contagem de roteiros quebrados só é confiável depois que o gate para de dar  │
           * │ falso positivo.                                                                       │
           * └───────────────────────────────────────────────────────────────────────────────────────┘
           *
           * A TELA NÃO MUDOU e nada do produto foi tocado: quem estava errado era o roteiro.
           */
          papel: "spinbutton",
          nome: /Nº de posições oficiais/,
          texto: "4. Quantas posições",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "03-passos-da-trilha.png",
      legenda: "Passo 5: o botão que leva ao passo seguinte, no rodapé da janela.",
      preparo: [ABRIR_A_JANELA],
      alvos: [
        { papel: "button", nome: "Continuar", texto: "5. Vai ao passo seguinte", lado: "acima" },
        {
          papel: "button",
          nome: "Salvar Rascunho",
          texto: "6. Guarda sem publicar",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "04-botao-publicar.png",
      legenda: "Passo 6: o rodapé da janela no último passo, com guardar rascunho e publicar.",
      preparo: IR_AO_ULTIMO_PASSO,
      alvos: [
        {
          /*
           * ─ NÃO TROQUE ESTE SELETOR POR PAPEL E NOME. LEIA ANTES DE "MELHORAR" ──────────────────
           *
           * A régua da casa é preferir papel mais nome, e ela está certa. ESTE alvo é a exceção, e a
           * exceção tem causa medida: o botão de publicar, DENTRO da janela, se chama "Abrir Vaga", e
           * o botão da lista, ATRÁS da janela, se chama "Abrir vaga". Para o localizador os dois são
           * o MESMO nome, porque a comparação por papel e nome não distingue caixa, e o motor resolve
           * com o primeiro da página (`localizar` usa `.first()`), que é o da lista.
           *
           * ┌─ E É POR ISSO QUE ISTO É PIOR QUE UM ERRO COMUM: NÃO DÁ FALHA ─────────────────────┐
           * │ Os dois botões estão dentro da área capturada, então nada é recusado: a seta sai     │
           * │ desenhada sobre o botão ERRADO, atrás da janela, e a imagem entra no repositório     │
           * │ ensinando o caminho errado com a autoridade da casa. Alvo que não resolve o motor    │
           * │ acusa e derruba a captura; alvo que resolve no elemento errado ninguém acusa.        │
           * └─────────────────────────────────────────────────────────────────────────────────────┘
           *
           * O seletor prende a busca ao que está DENTRO do diálogo, e ali existe UM só botão de
           * envio (conferido: `type="submit"` aparece uma única vez em `TrilhaDaVaga.tsx`). Se algum
           * dia nascer um segundo botão de envio na janela, este alvo ganha precisão, e não volta
           * para o nome.
           */
          seletor: '[role="dialog"] button[type="submit"]',
          texto: "7. Publica a vaga",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
