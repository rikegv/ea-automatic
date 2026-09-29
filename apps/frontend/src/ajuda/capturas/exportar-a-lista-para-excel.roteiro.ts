/**
 * ROTEIRO DE CAPTURA: "Exportar A Lista Para Excel".
 *
 * ┌─ DUAS PROTEÇÕES DIFERENTES, PORQUE SÃO DOIS PROBLEMAS DIFERENTES ────────────────────────────┐
 * │ A imagem 1 é da TELA, com a tabela atrás do botão: ali a proteção é a busca por `999000`, que   │
 * │ deixa na fila só as linhas sintéticas do arnês.                                                │
 * │ As imagens 2 e 3 são da JANELA, e ali a proteção é o RECORTE no painel: a janela de exportação   │
 * │ só contém nome de COLUNA, então recortada ela é a imagem mais limpa possível deste artigo, e o   │
 * │ gate passa a auditar só o que vira imagem.                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TERCEIRA IMAGEM ABRE A JANELA DE NOVO, PORQUE NADA É HERDADO ──────────────────────────────┐
 * │ Ela dizia, num comentário, que "a janela já está aberta desde a imagem anterior", e não está: o   │
 * │ motor recarrega a rota e reaplica o preparo do roteiro antes de cada imagem que declara preparo.   │
 * │ Com a janela fechada, rolar até "Voltar ao padrão" falhava como "a tela mudou", e o controle nunca │
 * │ tinha saído da tela, ele só vive dentro da janela. O preparo desta imagem abre a janela e só então │
 * │ rola até os grupos de coluna.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O RECORTE APONTA O PAINEL, E NÃO O `role="dialog"`: o papel de diálogo mora no véu que cobre a tela
 * inteira, então recortar por ele seria a tela inteira com outro nome. O painel de vidro é o retângulo
 * que a pessoa vê como janela.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';
const PAINEL = 'div[role="dialog"] .panel';

export const roteiro: Roteiro = {
  slug: "exportar-a-lista-para-excel",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [{ acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" }],
  capturas: [
    {
      arquivo: "01-botao-exportar.png",
      legenda: "Passo 2: o botão que abre a janela de exportação.",
      alvos: [
        {
          papel: "button",
          nome: "Exportar",
          texto: "2. Abra a exportação",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-janela-de-exportacao.png",
      legenda: "Passo 3: a janela de exportação, com a quantidade de linhas e as colunas.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Exportar", texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "heading",
          nome: "Exportar Relatório",
          texto: "3. Quantas linhas saem",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-escolher-as-colunas.png",
      legenda: "Passo 4: os grupos de coluna, com o contador de quantas estão marcadas.",
      recorte: { seletor: PAINEL, texto: "" },
      /* Abre a janela (ela não vem aberta da imagem anterior) e rola até os grupos de coluna. */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Exportar", texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Voltar ao padrão", texto: "" } },
      ],
      alvos: [
        { papel: "button", nome: "Marcar todas", texto: "4. Marque as colunas", lado: "abaixo" },
        { papel: "button", nome: "Voltar ao padrão", texto: "Volta à escolha padrão", lado: "abaixo" },
        { papel: "button", nome: /^Exportar Em Excel/, texto: "5. Baixe o arquivo", lado: "acima" },
      ],
    },
  ],
};
