/**
 * ROTEIRO DE CAPTURA: "Auditar Os Documentos Da Admissão".
 *
 * ┌─ A BUSCA POR `999000` É A MEDIDA DE PRIVACIDADE DESTE ROTEIRO ───────────────────────────────┐
 * │ As duas primeiras imagens são da FILA, com linha de pessoa. Os candidatos do arnês têm CPF da    │
 * │ família 999 e a busca do topo casa CPF por pedaço, então digitar `999000` deixa a fila inteira   │
 * │ sintética e o print sai sem recorte. Mesmo mecanismo do roteiro do prontuário no Drive. O gate   │
 * │ de dado pessoal continua sendo a garantia; a busca é o que torna a captura possível.            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A ABA **NÃO** É CLICADA NO PREPARO ────────────────────────────────────────────────┐
 * │ AUDITORIA é a primeira aba e a tela abre nela. Clicar por clicar acrescentaria um passo que pode │
 * │ falhar sem dar informação nenhuma, e a seta da imagem 1 aponta a aba de qualquer forma.         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A JANELA DA AUDITORIA FICOU **SEM** IMAGEM, E A CAUSA FOI MEDIDA, NÃO SUPOSTA ─────────────┐
 * │ O passo 6 do artigo (a barra de progresso da régua) e os passos 7 a 9 (a linha de um documento)   │
 * │ acontecem DENTRO da janela que o botão Auditar abre, e havia uma terceira captura para ela. Ela   │
 * │ foi retirada depois de `pnpm ajuda:conferir` rodar contra a homologação três vezes, e o que se     │
 * │ mediu foi isto:                                                                                  │
 * │                                                                                                  │
 * │   1. as imagens 1 e 2 passam, então a fila povoa e o botão Auditar existe;                        │
 * │   2. o alvo da BARRA DE PROGRESSO resolve, então a janela abre de verdade;                        │
 * │   3. NENHUM alvo de linha de documento resolve (nem o botão de envio, nem o de visualizar), e a   │
 * │      captura é recusada por LISTA VAZIA, com "Carregando documentos" ainda escrito na tela.       │
 * │                                                                                                  │
 * │ Ou seja: a lista de documentos daquela admissão não chega a carregar no tempo da captura. Isso é   │
 * │ ARNÊS E AMBIENTE, não roteiro: o alvo que falha não é um alvo que a tela perdeu, e declarar        │
 * │ `PODE_SER_VAZIA` seria mentir, porque o artigo NÃO ensina o estado vazio.                         │
 * │                                                                                                  │
 * │ Então o passo 6 fica escrito e sem print, como os passos 7 a 9. Os rótulos dos controles da janela │
 * │ seguem declarados no artigo (a busca e o índice "Nesta Tela" os acham), e a captura da janela       │
 * │ entra quando o arnês entregar uma admissão com régua carregada.                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE A FILA PRECISA TER: uma admissão em andamento na Auditoria. Sem linha nenhuma o botão Auditar
 * não existe, o alvo não resolve e o motor FALHA em vez de gravar imagem sem seta, que é o
 * comportamento certo: alvo que não resolve é o detector de artigo velho.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

/** O botão que abre a janela da auditoria. O aviso do mouse é fixo e sem nome de pessoa (§A.6). */
const BOTAO_AUDITAR = 'button[title="Auditar documentos com IA"]';

export const roteiro: Roteiro = {
  slug: "auditar-os-documentos-da-admissao",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    {
      acao: "digitar",
      alvo: { seletor: 'input[aria-label="Buscar por nome, CPF ou cliente"]', texto: "" },
      valor: "999000",
    },
  ],
  capturas: [
    {
      arquivo: "01-aba-auditoria.png",
      legenda: "Passo 1: a Esteira Admissional aberta na aba Auditoria, com as cinco abas no topo.",
      alvos: [
        {
          papel: "link",
          nome: /Esteira Admissional/i,
          texto: "1. Entre pela esteira",
          lado: "direita",
        },
        { papel: "button", nome: "AUDITORIA", texto: "2. A fila da auditoria", lado: "abaixo" },
        {
          papel: "textbox",
          nome: /Buscar por nome, CPF ou cliente/i,
          texto: "3. Ache a pessoa",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-botao-auditar.png",
      legenda: "Passo 5: o botão Auditar na coluna de avanço da linha.",
      alvos: [
        {
          seletor: BOTAO_AUDITAR,
          texto: "5. Abra os documentos",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
