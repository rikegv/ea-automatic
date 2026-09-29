/**
 * ROTEIRO DE CAPTURA: "Filtrar Uma Lista".
 *
 * ┌─ POR QUE A ÂNCORA É AS DICAS POR DOCUMENTO, E NÃO O GERENCIADOR ─────────────────────────────┐
 * │ O padrão de filtro é IDÊNTICO nas 10 telas, então a captura pode escolher a tela mais barata  │
 * │ de fotografar, e a mais barata é a que NÃO mostra pessoa: o catálogo de dicas tem nome de      │
 * │ documento, código e texto de orientação, e nada de candidato. Print sem recorte, sem arnês e   │
 * │ sem depender da conferência da base. É exatamente a vantagem de o artigo ser do PADRÃO.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ CADA IMAGEM REFAZ O CAMINHO INTEIRO, E A REDAÇÃO ANTERIOR DIZIA O CONTRÁRIO ────────────────┐
 * │ Estava escrito aqui que "o estado da tela não é rebobinado entre capturas do mesmo roteiro", e é │
 * │ o inverso: o motor RECARREGA a rota e reaplica o preparo do roteiro antes de cada imagem que      │
 * │ declara preparo. Com a redação velha, as imagens 3 e 4 abriam clicando direto no campo do filtro, │
 * │ contando com a janela aberta pela imagem 2, e falhavam como "a tela mudou" com a tela certa.      │
 * │                                                                                                  │
 * │ ENTÃO CADA IMAGEM DECLARA O CAMINHO DELA DESDE A LISTA: a 2 abre a janela; a 3 abre a janela e o  │
 * │ campo; a 4 abre a janela, marca uma opção e fecha o campo, porque com a lista de opções aberta o  │
 * │ rodapé fica coberto, e é o rodapé que ela fotografa. Marcar a opção também é o que deixa o        │
 * │ "Limpar filtros" ativo, que é justamente o controle que o passo ensina.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "filtrar-uma-lista",
  url: "/admin/dicas-documento",
  capturas: [
    {
      arquivo: "01-gatilho-do-filtro.png",
      legenda: "Passo 1: o ícone de funil que abre os filtros da tela.",
      alvos: [
        {
          papel: "button",
          nome: "Abrir filtros",
          texto: "1. Abra os filtros",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-janela-de-filtros.png",
      legenda: "Passo 2: a janela Filtros, com um campo por linha.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Abrir filtros", texto: "" } }],
      alvos: [
        {
          papel: "button",
          nome: "Situação da dica",
          texto: "2. Escolha o campo",
          lado: "direita",
        },
        {
          papel: "button",
          nome: "Tipo de documento",
          texto: "Um campo por linha",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "03-varias-opcoes-marcadas.png",
      legenda: "Passo 3: o campo aberto, com mais de um valor marcado.",
      /*
       * O SELETOR ABRE EM PORTAL, fora da janela, e o item marcado NÃO fecha a lista (é marca e
       * desmarca, não escolha única). Por isso dá para marcar e fotografar no mesmo estado.
       * A opção é alcançada pelo PAPEL da lista, e não pelo texto dela: o catálogo de situações é
       * vivo, e um roteiro que soubesse o nome da primeira opção quebraria na próxima situação nova.
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Abrir filtros", texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Situação da dica", texto: "" } },
        {
          acao: "clicar",
          alvo: { seletor: 'div[role="listbox"] button[role="option"]', texto: "" },
        },
      ],
      alvos: [
        {
          seletor: 'div[role="listbox"] button[role="option"]',
          texto: "3. Marque quantos quiser",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "04-limpar-filtros.png",
      legenda: "Passo 6: o atalho que zera todos os filtros da tela.",
      /* Abre a janela, marca uma opção (é ela que ativa o "Limpar filtros") e fecha o seletor pelo
         próprio gatilho: com a lista de opções aberta, o rodapé da janela fica coberto. */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Abrir filtros", texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Situação da dica", texto: "" } },
        {
          acao: "clicar",
          alvo: { seletor: 'div[role="listbox"] button[role="option"]', texto: "" },
        },
        { acao: "clicar", alvo: { papel: "button", nome: "Situação da dica", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Limpar filtros",
          texto: "6. Zere os filtros",
          lado: "acima",
        },
        { papel: "button", nome: "Fechar", texto: "5. Volte para a lista", lado: "acima" },
      ],
    },
  ],
};
