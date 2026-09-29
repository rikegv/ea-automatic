/**
 * ROTEIRO DE CAPTURA: "Filtrar Pelo Card De Indicador".
 *
 * ┌─ POR QUE A BUSCA ENTRA NO PREPARO DE UMA IMAGEM QUE É SOBRE OS CARDS ────────────────────────┐
 * │ Os cards não mostram pessoa, mas a imagem inteira mostra: a tabela do Gerenciador fica logo    │
 * │ abaixo deles, e a homologação carrega a base histórica, com gente de verdade. Recortar só a     │
 * │ faixa de cards resolveria a privacidade e mataria a aula, porque o que o passo 2 ensina é       │
 * │ justamente que a LISTA muda quando o card liga.                                                │
 * │                                                                                                │
 * │ A saída é digitar `999000` na busca ANTES de qualquer captura: os candidatos do arnês têm CPF   │
 * │ da família 999, e a busca por CPF casa por pedaço, então a fila fica com as linhas sintéticas.  │
 * │ O gate continua sendo a garantia, não a busca: se uma linha real escapar, ele recusa a imagem.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NOME ACESSÍVEL DO CARD É O NÚMERO MAIS O RÓTULO ("1.432 Admissões Concluídas"), porque o card é
 * um botão que embrulha os dois. Por isso o localizador casa por PEDAÇO do nome, e não por igualdade:
 * o número muda todo dia, o rótulo não.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';

export const roteiro: Roteiro = {
  slug: "filtrar-pelo-card-de-indicador",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [{ acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" }],
  capturas: [
    {
      arquivo: "01-faixa-de-cards.png",
      legenda: "Passo 1: a faixa de cards de indicador, no alto da tela.",
      alvos: [
        {
          papel: "button",
          nome: /Com Pendências Obrigatórias/,
          texto: "1. Cada card é um recorte",
          lado: "abaixo",
        },
        { papel: "button", nome: /Total Geral/, texto: "Todos são clicáveis", lado: "abaixo" },
      ],
    },
    {
      arquivo: "02-card-ligado.png",
      legenda: "Passo 2: o card escolhido destacado, com a lista já recortada por ele.",
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: /Com Pendências Obrigatórias/, texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: /Com Pendências Obrigatórias/,
          texto: "2. Ligado, e a lista obedece",
          lado: "abaixo",
        },
      ],
    },
  ],
};
