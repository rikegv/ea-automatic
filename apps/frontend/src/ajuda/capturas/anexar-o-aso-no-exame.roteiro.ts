/**
 * ROTEIRO DE CAPTURA: "Anexar O ASO Na Aba Exame".
 *
 * Mora ao lado do artigo e é versionado junto, porque roteiro e artigo envelhecem juntos: o passo que
 * deixou de existir na tela é o mesmo passo que sai do texto. Quem escreveu os passos escreveu isto.
 *
 * ┌─ AS SEIS CAPTURAS CABEM EM UM ESTADO SÓ, E FOI ASSIM QUE ELAS FORAM DESENHADAS ──────────────┐
 * │ `Roteiro` tem UM `preparo` para todas as `capturas`, então cada imagem precisa existir na mesma │
 * │ tela preparada. Aqui isso saiu de graça: com a aba Exame aberta e a fila povoada, a linha SEM   │
 * │ atestado e a linha COM atestado validado convivem, e é por isso que o controle de anexo aparece │
 * │ duas vezes, com localizadores diferentes, em vez de exigir dois estados.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A FILA PRECISA TER, E É O QUE O ARNÊS ENTREGA ────────────────────────────────────────┐
 * │ Tela vazia não ensina nada. Esta captura exige, na aba Exame: uma linha de exame a agendar, uma │
 * │ com atestado ANEXADO e ainda sem veredito, e uma com atestado VALIDADO. Sem a terceira, as      │
 * │ imagens 4 e 5 não têm o que apontar, e o motor FALHA em vez de gravar imagem sem seta, que é o  │
 * │ comportamento certo: alvo que não resolve é o detector de artigo velho.                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o dado da fila é sintético, do arnês, e o print é do CONTROLE. O nome acessível do seletor de
 * status carrega o nome da pessoa da linha, então o localizador casa só o começo dele: nenhum nome
 * entra neste arquivo, nem aqui nem na etiqueta vermelha.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor, e a execução
 * está vetada até o gate de dado pessoal estar pronto e travado em teste.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "anexar-o-aso-no-exame",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    {
      acao: "clicar",
      alvo: { papel: "button", nome: "EXAME", texto: "Aba Exame" },
    },
  ],
  capturas: [
    {
      arquivo: "01-esteira-abas.png",
      legenda: "Passo 1: a Esteira Admissional aberta, com as cinco abas no topo.",
      alvos: [
        {
          papel: "link",
          nome: /Esteira Admissional/i,
          texto: "1. Entre pela esteira",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "02-aba-exame.png",
      legenda: "Passo 2: a aba Exame selecionada e a fila do exame na tela.",
      alvos: [
        { papel: "button", nome: "EXAME", texto: "2. Abra a aba Exame", lado: "abaixo" },
        {
          papel: "textbox",
          nome: /Buscar por nome, CPF ou cliente/i,
          texto: "3. Ache a pessoa",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-botao-aso.png",
      legenda: "Passo 4: o botão ASO na coluna de avanço da linha.",
      alvos: [
        // O controle de anexo é um rótulo com o campo de arquivo escondido: não tem papel acessível,
        // e o título é o texto que a própria tela mostra ao passar o mouse. É a linha AINDA SEM
        // atestado, que é a que o passo ensina.
        {
          seletor: 'label[title^="Anexar ASO"]',
          texto: "4. Anexe o atestado",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "04-veredito-do-aso.png",
      legenda: "Passo 5: o botão mostrando o veredito da leitura, em verde, amarelo ou vermelho.",
      alvos: [
        // A linha que JÁ tem atestado: o título muda de "Anexar ASO" para "ASO anexado", e é essa
        // troca que distingue os dois estados sem precisar de um segundo preparo.
        {
          seletor: 'label[title^="ASO anexado"]',
          texto: "5. Leia o veredito",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "05-ver-o-aso.png",
      legenda: "Passo 6: o botão de visualizar o atestado anexado.",
      alvos: [
        {
          papel: "button",
          nome: "Visualizar o ASO anexado",
          texto: "6. Abra o atestado",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "06-status-apto.png",
      legenda: "Passo 7: o seletor de status da frente, na linha da pessoa.",
      alvos: [
        {
          papel: "button",
          nome: /^Mudar status de/,
          texto: "7. Marque como apto",
          lado: "abaixo",
        },
      ],
    },
  ],
};
