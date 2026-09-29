/**
 * ROTEIRO DE CAPTURA: "Abrir E Fechar Uma Janela Do Sistema".
 *
 * ┌─ AS DUAS JANELAS DO SISTEMA, NA MESMA TELA E SEM PESSOA NENHUMA ─────────────────────────────┐
 * │ O catálogo de dicas oferece as duas famílias que o artigo precisa mostrar: a de PREENCHIMENTO    │
 * │ (com Cancelar e Salvar) e a de CONFIRMAÇÃO (com a pergunta e a ação). E não mostra gente, nem na  │
 * │ tela nem nas janelas: o texto da confirmação fala de um tipo de DOCUMENTO.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ROTEIRO ABRE A CONFIRMAÇÃO E **NÃO** CONFIRMA ────────────────────────────────────────────┐
 * │ Clicar em "Ocultar" tiraria de verdade uma dica do portal do candidato na homologação. A imagem   │
 * │ que o passo precisa é a PERGUNTA, e é aí que o roteiro para.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CADA IMAGEM COMEÇA DA TELA LIMPA, E ISSO CONSERTA UM PREPARO VELHO ─────────────────────────┐
 * │ A segunda captura abria clicando em "Cancelar", para fechar a janela deixada pela primeira. O    │
 * │ motor NÃO herda estado entre imagens: antes de cada imagem que declara preparo, ele recarrega a   │
 * │ rota e reaplica o preparo do roteiro. Então não havia janela nenhuma para cancelar, e o clique    │
 * │ falhava como "a tela mudou", quando a tela está certa e o roteiro estava velho. O preparo desta   │
 * │ imagem é só o atalho "ocultar" da linha, que é o que abre a confirmação a partir da lista.         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';

export const roteiro: Roteiro = {
  slug: "abrir-e-fechar-uma-janela-do-sistema",
  url: "/admin/dicas-documento",
  capturas: [
    {
      arquivo: "01-janela-de-preenchimento.png",
      legenda: "Passo 1: uma janela de preenchimento aberta, com Cancelar e Salvar no rodapé.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Nova dica", texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        { papel: "button", nome: "Salvar", texto: "Grava e fecha", lado: "acima" },
        { papel: "button", nome: "Cancelar", texto: "Sai sem gravar", lado: "acima" },
      ],
    },
    {
      arquivo: "02-janela-de-confirmacao.png",
      legenda:
        "Passo 6: uma janela de confirmação, com a ação à direita e a desistência à esquerda.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "ocultar", texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "heading",
          nome: "Ocultar A Dica?",
          texto: "6. Leia a pergunta",
          lado: "abaixo",
        },
        { papel: "button", nome: "Ocultar", texto: "Executa", lado: "acima" },
      ],
    },
  ],
};
