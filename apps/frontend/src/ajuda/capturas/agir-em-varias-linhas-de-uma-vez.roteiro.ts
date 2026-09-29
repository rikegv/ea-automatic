/**
 * ROTEIRO DE CAPTURA: "Agir Em Várias Linhas De Uma Vez".
 *
 * ┌─ A CAPTURA PARA UM PASSO ANTES DE APLICAR, E ISSO É DESENHO ──────────────────────────────────┐
 * │ A última imagem é a JANELA DE CONFIRMAÇÃO aberta, e o roteiro NÃO clica em "Confirmar":         │
 * │ confirmar aqui alteraria de verdade a exigência de integração de um cliente da homologação, e    │
 * │ print de manual não é lugar de escrever no banco. A imagem que o passo precisa é a pergunta,     │
 * │ não a consequência dela.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BARRA DO LOTE SÓ EXISTE COM LINHA MARCADA, E CADA IMAGEM TEM DE MARCAR A DELA ────────────┐
 * │ O motor recarrega a rota e reaplica o preparo do roteiro antes de cada imagem que declara         │
 * │ preparo, então nenhuma imagem herda a seleção da anterior. A terceira abria clicando direto em     │
 * │ "Não exigir", contando com a linha marcada pela segunda, e falhava como "a tela mudou": o botão    │
 * │ não estava perdido, ele só não é desenhado com a lista sem seleção. Cada imagem marca a linha      │
 * │ dela antes de usar a barra.                                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A CAIXA DE MARCAR NÃO TEM PAPEL NA LISTA DE ALVOS ACEITOS (não existe `checkbox` em `Alvo.papel`),
 * então ela é alcançada por seletor pelo começo do rótulo acessível. O motor usa a PRIMEIRA
 * correspondência, que é a primeira linha da lista, e é isso que o passo quer mostrar.
 */
import type { Roteiro } from "../tipos";

const CAIXA = 'input[type="checkbox"][aria-label^="Selecionar"]';

export const roteiro: Roteiro = {
  slug: "agir-em-varias-linhas-de-uma-vez",
  url: "/admin/integracao-clientes",
  capturas: [
    {
      arquivo: "01-marcar-as-linhas.png",
      legenda: "Passo 2: a caixa de marcar na primeira coluna da linha.",
      alvos: [
        {
          seletor: CAIXA,
          texto: "2. Marque a linha",
          forma: "elipse",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "02-barra-do-lote.png",
      legenda: "Passo 3: a barra de ações do lote, com a contagem das linhas marcadas.",
      preparo: [{ acao: "clicar", alvo: { seletor: CAIXA, texto: "" } }],
      alvos: [
        {
          papel: "button",
          nome: /^Não exigir/,
          texto: "3. Confira a contagem",
          lado: "abaixo",
        },
        { papel: "button", nome: "Limpar seleção", texto: "Solta tudo", lado: "abaixo" },
      ],
    },
    {
      arquivo: "03-confirmar-o-lote.png",
      legenda: "Passo 4: a janela de confirmação, com a quantidade de linhas do lote.",
      preparo: [
        { acao: "clicar", alvo: { seletor: CAIXA, texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: /^Não exigir/, texto: "" } },
      ],
      alvos: [
        { papel: "button", nome: "Confirmar", texto: "4. Aplique no lote", lado: "acima" },
        { papel: "button", nome: "Cancelar", texto: "Sai sem aplicar", lado: "acima" },
      ],
    },
  ],
};
