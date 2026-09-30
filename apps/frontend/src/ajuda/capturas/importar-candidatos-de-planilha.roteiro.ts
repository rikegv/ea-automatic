/**
 * ─ ROTEIRO: "Importar Candidatos De Planilha". TRÊS imagens, os DOIS primeiros passos da janela ──
 *
 * ┌─ POR QUE ESTE ROTEIRO PARA NO PASSO DA PLANILHA, E NÃO SOBE ARQUIVO NENHUM ──────────────────┐
 * │ O contrato prevê `subirArquivo`, e o artigo registrava a possibilidade de ilustrar a prévia com │
 * │ uma planilha sintética. DOIS impedimentos, medidos, e cada um sozinho já basta:                 │
 * │                                                                                                │
 * │ 1. A PLANILHA TERIA DE TER NOME DE GENTE. O de, para desta importação é de PESSOA (Nome, CPF,   │
 * │    E-mail, Telefone, Nascimento), e a amostra do passo Confirmação imprime as linhas lidas na    │
 * │    tela. Um arquivo sintético com nomes inventados vira, no print, uma lista de pessoas          │
 * │    indistinguível de real para quem lê o manual. A planilha de lojas que o roteiro irmão sobe    │
 * │    não tem esse problema porque loja não é gente.                                               │
 * │ 2. A LEITURA NÃO CHEGA A RENDERIZAR NO TEMPO DO GESTO. O de, para depende do backend mais da     │
 * │    leitura por I.A., e o roteiro "importar-uma-planilha" já mediu isso na homologação: os prints │
 * │    da prévia nunca foram alcançados dentro dos 6s que o `subirArquivo` espera.                   │
 * │                                                                                                │
 * │ OS PASSOS DE, PARA, CONFIRMAÇÃO E RESULTADO FICAM SEM IMAGEM, e continuam ensinados em texto.    │
 * │ Print de prévia vazia pareceria pronto, que é pior do que print faltando.                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TRILHO DOS CINCO PASSOS APARECE NAS DUAS IMAGENS DA JANELA, no alto: é ele que responde "em qual
 * passo eu estou", que é metade do que o artigo ensina sobre esta tela.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo. */
const PAGINA = "main";

const ABRIR_A_JANELA: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: "Importar Candidatos", texto: "" },
};

export const roteiro: Roteiro = {
  slug: "importar-candidatos-de-planilha",
  url: "/as/candidatos",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-botao-importar.png",
      legenda: "Passo 2: o botão de importar, no topo da Central.",
      // Sem preparo: a janela aberta cobriria o botão que esta imagem aponta.
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Importar Candidatos",
          texto: "1. Abra a importação",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-passo-cenario.png",
      legenda: "Passo 3: a primeira pergunta da janela, importar só para a base ou já com vaga.",
      preparo: [ABRIR_A_JANELA],
      /*
       * ─ SEM `recorte`: A IMAGEM É A VIEWPORT INTEIRA, E ISSO CONSERTA UM DEFEITO MEDIDO ─────────
       *
       * Recortando o PAINEL da janela, os rótulos vermelhos saem FORA da imagem e a elipse fica sem
       * legenda. A causa está no motor e é estrutural: quem decide onde o rótulo cabe (`dentro`, em
       * `anotar.ts`) mede contra a VIEWPORT, nunca contra a caixa recortada, então um painel estreito
       * empurra toda legenda para fora do quadro. Foi exatamente o que aconteceu na primeira rodada:
       * a imagem passou em todos os gates e mostrava três elipses mudas (§A.13).
       *
       * E AQUI A TELA INTEIRA PODE VIRAR IMAGEM, o que nem sempre é verdade: a lista que aparece
       * borrada atrás da janela é o arnês sintético inteiro, nome por nome declarado na allowlist do
       * manual. O gate audita o texto do que está no quadro, e continua auditando.
       */
      alvos: [
        /*
         * A ÂNCORA NO COMEÇO DO NOME NÃO É CAPRICHO: a Central tem um CARD chamado "Sem Vaga", e o
         * nome acessível dele começa pelo NÚMERO ("3 Sem Vaga"), porque o botão é o cartão inteiro.
         * Sem a âncora, o localizador resolvia no card da página, ATRÁS da janela, e o clique do
         * preparo morria em "o diálogo intercepta o ponteiro" (medido em 30/09/2026). Pior: como
         * alvo, ele não morreria, desenharia a seta sobre o cartão errado.
         */
        { papel: "button", nome: /^Sem Vaga/, texto: "2. Só para a base", lado: "abaixo" },
        { papel: "button", nome: /^Com Vaga/, texto: "3. Já vinculando à vaga", lado: "abaixo" },
        { papel: "button", nome: "Avançar", texto: "4. Segue para a planilha", lado: "direita" },
      ],
    },
    {
      arquivo: "03-passo-planilha.png",
      legenda: "Passo 4: o campo em que a planilha é anexada, e os formatos aceitos.",
      /*
       * O CENÁRIO É ESCOLHIDO ANTES DE AVANÇAR, e isso não é gesto a mais: a janela nasce sem
       * cenário nenhum marcado, e o "Avançar" nasce DESABILITADO (`podeAvancarCenario`, em
       * `ImportarCandidatosModal.tsx`). Medido em 30/09/2026: sem este clique, o preparo morre em
       * "element is not enabled". "Sem Vaga" é o caminho escolhido porque ele não exige escolher
       * uma vaga logo abaixo, que seria um terceiro gesto para chegar à mesma tela.
       */
      preparo: [
        ABRIR_A_JANELA,
        { acao: "clicar", alvo: { papel: "button", nome: /^Sem Vaga/, texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Avançar", texto: "" } },
      ],
      /*
       * ─ SEM `recorte`: A IMAGEM É A VIEWPORT INTEIRA, E ISSO CONSERTA UM DEFEITO MEDIDO ─────────
       *
       * Recortando o PAINEL da janela, os rótulos vermelhos saem FORA da imagem e a elipse fica sem
       * legenda. A causa está no motor e é estrutural: quem decide onde o rótulo cabe (`dentro`, em
       * `anotar.ts`) mede contra a VIEWPORT, nunca contra a caixa recortada, então um painel estreito
       * empurra toda legenda para fora do quadro. Foi exatamente o que aconteceu na primeira rodada:
       * a imagem passou em todos os gates e mostrava três elipses mudas (§A.13).
       *
       * E AQUI A TELA INTEIRA PODE VIRAR IMAGEM, o que nem sempre é verdade: a lista que aparece
       * borrada atrás da janela é o arnês sintético inteiro, nome por nome declarado na allowlist do
       * manual. O gate audita o texto do que está no quadro, e continua auditando.
       */
      alvos: [
        {
          /*
           * O CAMPO DE ARQUIVO NÃO TEM PAPEL ACESSÍVEL que o localizador alcance (`input[type=file]`
           * não é `textbox`), então o alvo é o `aria-label` dele por seletor. É a saída de emergência
           * usada pelo motivo certo, e o `aria-label` é texto fixo da tela.
           */
          seletor: 'input[aria-label="Planilha de candidatos"]',
          texto: "5. Anexe a planilha",
          lado: "direita",
        },
        { papel: "button", nome: "Cancelar", texto: "6. Sai sem importar nada", lado: "esquerda" },
      ],
    },
  ],
};
