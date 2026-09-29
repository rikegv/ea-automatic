/**
 * ROTEIRO DE CAPTURA: "Liberar Em Lote".
 *
 * ┌─ NADA É LIBERADO AQUI: o preparo MARCA e ABRE, e para ──────────────────────────────────────┐
 * │ O relatório do fim do lote ficou sem print de propósito. Fotografá-lo exigiria LIBERAR de       │
 * │ verdade um punhado de pré-admissões da homologação a cada rodada do detector de artigo velho, e  │
 * │ a fila que os outros dois roteiros desta tela fotografam iria esvaziando até a captura ser        │
 * │ recusada por lista vazia. O passo do relatório é ensinado por texto.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM 1 RECORTA O `main`, E ESSA É A EXCEÇÃO DESTE ROTEIRO ──────────────────────────────┐
 * │ Ela precisa mostrar DUAS coisas distantes: a caixa de marcar, dentro da tabela, e a barra de     │
 * │ seleção, que nasce ACIMA dela. As duas não têm um ancestral comum menor que a área de conteúdo,  │
 * │ então o recorte é o `main`, que já exclui a barra lateral do app e tem altura de viewport por     │
 * │ construção (`max-h-screen`, `AppShell`). Continua sendo recorte auditado: o gate roda dentro da   │
 * │ caixa, e a régua de §A.6 desta tela é a mesma dos roteiros irmãos.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A SELEÇÃO É PELA CAIXA DO CABEÇALHO, e não pela caixa de uma pessoa ────────────────────────┐
 * │ A caixa de cada linha tem rótulo acessível "Selecionar" mais o NOME de quem está ali, então um    │
 * │ roteiro que a usasse traria nome de gente para dentro do código e quebraria na próxima vez que a  │
 * │ fila mudasse. A caixa do cabeçalho tem rótulo fixo e marca só as linhas visíveis, que é o próprio │
 * │ comportamento que o artigo ensina no passo 1.                                                  │
 * │                                                                                                │
 * │ Ela é alcançada por SELETOR porque `checkbox` não é um dos papéis do vocabulário de alvo.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * ─ O PRIMEIRO GESTO É UMA ESPERA, E ELA NÃO É SUPERSTIÇÃO ──────────────────────────────────────
 *
 * A casca autenticada renderiza "Carregando…" enquanto a sessão é resolvida (`app/(app)/layout.tsx`),
 * e nesse instante NENHUM campo da tela existe ainda. O motor espera 1200ms depois do `networkidle`;
 * quando a resolução passa disso, o primeiro gesto falha como "a tela mudou", que é a mensagem do
 * detector de artigo velho, e manda procurar defeito num roteiro que está certo.
 *
 * `main` existe nos DOIS estados (ele é quem escreve o "Carregando…"), então rolar até ele é a espera
 * mais barata que não pode falhar por ausência: ela vale os 600ms que o motor dá a cada gesto.
 * Medido em 28/09/2026, com dois roteiros deste lote falhando exatamente aí.
 */
const ESPERAR_A_CASCA: GestoDePreparo = { acao: "rolarAte", alvo: { seletor: "main", texto: "" } };

const PAINEL_DO_DIALOGO = 'div[role="dialog"] .panel';
const CAIXA_DO_CABECALHO = 'input[aria-label="Selecionar todas as visíveis"]';
const MARCAR_AS_VISIVEIS: GestoDePreparo = {
  acao: "clicar",
  alvo: { seletor: CAIXA_DO_CABECALHO, texto: "" },
};
/** O seletor de dentro do modal do lote, escopado ao diálogo (o cabeçalho da tabela também tem
    botão com esse nome, por causa da ordenação clicável). */
const campoDoLote = (rotulo: string) => `${PAINEL_DO_DIALOGO} button[aria-label="${rotulo}"]`;

export const roteiro: Roteiro = {
  slug: "liberar-em-lote",
  url: "/liberacao",
  preparo: [ESPERAR_A_CASCA],
  capturas: [
    {
      arquivo: "01-selecao-em-massa.png",
      legenda: "Passo 1: as linhas marcadas e a barra de seleção que aparece acima da lista.",
      recorte: { seletor: "main", texto: "" },
      preparo: [MARCAR_AS_VISIVEIS],
      alvos: [
        {
          seletor: CAIXA_DO_CABECALHO,
          texto: "1. Marque as linhas",
          lado: "direita",
        },
        {
          papel: "button",
          nome: /Liberar selecionadas/,
          texto: "2. Abra o lote",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-janela-do-lote.png",
      legenda: "Passo 5: a janela do lote, com cliente e cargo valendo para todas.",
      recorte: { seletor: PAINEL_DO_DIALOGO, texto: "" },
      preparo: [
        MARCAR_AS_VISIVEIS,
        { acao: "clicar", alvo: { papel: "button", nome: /Liberar selecionadas/, texto: "" } },
      ],
      alvos: [
        {
          seletor: campoDoLote("Cliente do lote"),
          texto: "Vale para todas",
          lado: "direita",
        },
        {
          seletor: campoDoLote("Cargo do lote"),
          texto: "Um cargo só para o lote",
          lado: "direita",
        },
      ],
    },
  ],
};
