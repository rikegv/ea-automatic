/**
 * ROTEIRO DE CAPTURA: "Montar O Pacote De Benefícios".
 *
 * ┌─ SÓ A JANELA É RECORTADA, E A TABELA **NÃO PODE** SER: ELA NÃO CABE NA VIEWPORT ─────────────┐
 * │ Benefícios NÃO está na lista das telas que não podem virar imagem inteira (bloco do `recorte`,  │
 * │ em `tipos.ts`), então a imagem de tela cheia é permitida aqui, e o gate de dado pessoal continua │
 * │ sendo a barreira.                                                                              │
 * │                                                                                                 │
 * │ E A TENTATIVA DE RECORTAR A TABELA FOI MEDIDA E DESFEITA: `pnpm ajuda:conferir` recusou com      │
 * │ "ALVO FORA DA VIEWPORT depois da rolagem", porque esta tabela tem 1780px de largura mínima e não │
 * │ cabe nos 1600x1000 da captura. Recorte que não cabe não é enquadramento apertado, é print        │
 * │ nenhum. A JANELA do pacote, essa, cabe e é recortada.                                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS ALVOS DA LINHA SÃO POR RÓTULO ACESSÍVEL FIXO, E ISSO NÃO É DETALHE ─────────────────────┐
 * │ O lápis desta tela tem `aria-label` FIXO ("Editar os benefícios"), diferente do olho e da caixa │
 * │ de seleção, que carregam o nome da pessoa. Apontar o lápis, e não o olho, mantém este arquivo    │
 * │ sem nenhum nome dentro (§A.6) e ainda por cima é o gesto que o artigo ensina.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A JANELA DO PACOTE SÓ EXISTE DEPOIS DE UM CLIQUE, ENTÃO ELA TEM PREPARO PRÓPRIO ───────────┐
 * │ O preparo da terceira imagem abre o lápis da PRIMEIRA linha da fila. Some a fila, some o lápis e │
 * │ o motor FALHA em voz alta, que é o detector de artigo velho funcionando: fila vazia aqui         │
 * │ significa que ninguém concluiu o Cadastro na homologação, e não que o artigo está certo.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';
/** O lápis da linha. `aria-label` fixo, sem nome de pessoa (§A.6). */
const LAPIS = { papel: "button" as const, nome: "Editar os benefícios", texto: "" };

export const roteiro: Roteiro = {
  slug: "montar-o-pacote-de-beneficios",
  url: "/beneficios",
  capturas: [
    {
      arquivo: "01-fila-de-beneficios.png",
      legenda: "Passo 1: a fila de Benefícios, com as abas e os três indicadores do topo.",
      alvos: [
        {
          papel: "button",
          nome: "Fila De Trabalho",
          texto: "1. Quem ainda falta",
          forma: "elipse",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Finalizados",
          texto: "Quem já foi calculado",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-faixa-de-beneficios.png",
      legenda: "Passo 3: a faixa de siglas da linha e o lápis que abre o pacote.",
      /**
       * ESTADO DECLARADO, e antes ele era HERDADO: esta imagem depende de existir LINHA na fila, e
       * sem preparo próprio ela ficava com o estado que a imagem anterior deixou na tela, ou com a
       * aba padrão. Herdar estado é o defeito silencioso: o dia em que a imagem 1 ganhar um preparo,
       * esta muda de conteúdo sem nada falhar.
       *
       * A ABA É LOAD-BEARING, e não decoração: o lápis existe nas duas abas, mas a legenda promete a
       * FILA, e é ela que o passo ensina. Declarada, a imagem passa a ser a mesma em qualquer ordem
       * de execução.
       *
       * O QUE O PREPARO **NÃO** GARANTE, e vale escrito: que a fila tenha gente. Nenhum arnês povoa
       * Benefícios (ela exige Cadastro concluído, e o `arnes-seed-manual` cria admissão na
       * AUDITORIA), então quem garante isso é o detector de LISTA VAZIA, que recusa a captura em vez
       * de gravar uma tabela sem linha. `linhasEsperadas` fica AUSENTE de propósito: o lado estrito
       * é o certo aqui, porque fila vazia de Benefícios é falta de dado, nunca estado correto.
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Fila De Trabalho", texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "VT", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "VT",
          texto: "3. A faixa dos benefícios",
          forma: "retangulo",
          lado: "abaixo",
        },
        { ...LAPIS, texto: "4. Abra o pacote", forma: "elipse", lado: "acima" },
      ],
    },
    {
      arquivo: "03-janela-do-pacote.png",
      legenda: "Passo 5: a janela Editar Benefícios, com a lista do catálogo e os valores.",
      preparo: [{ acao: "clicar", alvo: LAPIS }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Salvar no cadastro",
          texto: "6. Grava no cadastro",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
