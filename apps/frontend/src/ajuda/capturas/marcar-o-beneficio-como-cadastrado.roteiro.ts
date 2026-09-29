/**
 * ROTEIRO DE CAPTURA: "Marcar O Benefício Como Cadastrado".
 *
 * ┌─ O ALVO DO ESTÁGIO É O RÓTULO DA AÇÃO, E ELE MUDA COM O ESTADO DA LINHA ────────────────────┐
 * │ O botão da coluna Ações é um vai e volta: na fila ele diz "Marcar como calculado", em            │
 * │ Finalizados ele diz "Reverter para Benefício Não Calculado, trazendo de volta para a fila". As    │
 * │ duas imagens que o usam precisam da aba Fila De Trabalho, onde o rótulo é o primeiro.             │
 * │                                                                                                  │
 * │ A ABA É DECLARADA NO PREPARO, E NÃO HERDADA DO PADRÃO, e a correção veio de um achado da          │
 * │ cobertura independente: ela era a aba padrão, então a imagem funcionava por sorte de estado. O    │
 * │ dia em que qualquer coisa trocasse a aba antes dela, o sintoma seria ALVO NÃO ENCONTRADO num      │
 * │ roteiro que ninguém tinha mexido, que é o pior lugar para um erro aparecer.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CAIXA DE SELEÇÃO NÃO TEM PAPEL NA LISTA DE `Alvo`, ENTÃO ELA ENTRA POR SELETOR ──────────┐
 * │ `checkbox` não está entre os papéis do vocabulário, e a saída é o `seletor` pelo `aria-label`,   │
 * │ que é o rótulo acessível e não uma classe: ele sobrevive a troca de estilo e falha em voz alta   │
 * │ no dia em que o rótulo mudar. É a mesma escolha do `spinbutton` antes de ele existir no tipo.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUMA IMAGEM É RECORTADA: a tabela desta tela tem 1780px de largura mínima e não cabe nos
 * 1600x1000 da captura, o que `pnpm ajuda:conferir` recusa com "ALVO FORA DA VIEWPORT depois da
 * rolagem" (medido). Benefícios não está na lista das telas que não podem virar imagem inteira
 * (bloco do `recorte`, em `tipos.ts`), então a tela cheia é o enquadramento possível aqui, com o gate
 * de dado pessoal como barreira.
 *
 * A FAIXA DA AÇÃO EM MASSA SÓ NASCE COM ALGUÉM MARCADO, então a terceira imagem marca a página
 * inteira no preparo. O rótulo do botão CARREGA A CONTAGEM ("Marcar Calculado De Todos (12)"), e por
 * isso o alvo é por expressão: fixar o número quebraria o roteiro a cada mudança da fila.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const MARCAR_TODOS = 'input[aria-label="Selecionar todas as admissões desta página"]';
/**
 * A CAIXA DA PRIMEIRA LINHA, e ela existe porque a do CABEÇALHO não serviu de gesto.
 *
 * Clicar a do cabeçalho marca as 50 linhas da página de uma vez, e `pnpm ajuda:conferir` recusou com
 * "locator.click: Timeout 8000ms exceeded" logo depois de "performing click action" (medido): o
 * clique dispara a remontagem da tabela inteira e o elemento se desfaz debaixo dele. Uma linha só
 * remonta uma linha só, e é o suficiente para a faixa da ação em massa nascer, que é o que o passo
 * ensina. A SETA continua apontando a caixa do CABEÇALHO, porque é dela que o passo fala.
 */
const MARCAR_UMA = "tbody input[type=\"checkbox\"]";

export const roteiro: Roteiro = {
  slug: "marcar-o-beneficio-como-cadastrado",
  url: "/beneficios",
  capturas: [
    {
      arquivo: "01-fila-e-indicadores.png",
      legenda: "Passo 1: os três indicadores do topo e a aba Fila De Trabalho.",
      alvos: [
        {
          papel: "button",
          nome: "Não Calculados",
          texto: "1. O que falta fazer",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Fila De Trabalho",
          texto: "A aba é o próprio estágio",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-acao-da-linha.png",
      legenda: "Passo 3: o botão que marca o benefício como calculado, na coluna Ações.",
      /**
       * AQUI A ABA NÃO É CONTEXTO, É A CONDIÇÃO DE O ALVO EXISTIR. O botão "Marcar como calculado"
       * só é desenhado em linha no estágio AGUARDANDO_CALCULO, ou seja, só na aba Fila De Trabalho:
       * em Finalizados o MESMO botão se chama "Reverter para Benefício Não Calculado...". Sem esta
       * declaração, a imagem dependia de a aba padrão não ter sido trocada antes dela, e o sintoma
       * de um dia ela ser seria ALVO NÃO ENCONTRADO num roteiro que ninguém mexeu.
       *
       * O QUE O PREPARO **NÃO** GARANTE: que a fila tenha gente (nenhum arnês povoa Benefícios).
       * Quem pega isso é o detector de LISTA VAZIA, e `linhasEsperadas` fica ausente de propósito:
       * fila vazia aqui é falta de dado, e não o estado correto da tela.
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Fila De Trabalho", texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Status", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Status",
          texto: "2. O estágio da pessoa",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Marcar como calculado",
          texto: "3. Fecha a pendência",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "03-acao-em-lote.png",
      legenda: "Passo 4: a faixa da ação em massa, com a contagem do que foi marcado.",
      preparo: [{ acao: "clicar", alvo: { seletor: MARCAR_UMA, texto: "" } }],
      alvos: [
        {
          seletor: MARCAR_TODOS,
          texto: "4. Marca só esta página",
          forma: "elipse",
          lado: "direita",
        },
        {
          papel: "button",
          nome: /^Marcar Calculado De Todos/,
          texto: "5. Age no que foi marcado",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
  ],
};
