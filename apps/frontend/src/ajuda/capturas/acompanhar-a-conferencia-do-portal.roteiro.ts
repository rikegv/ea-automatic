/**
 * ROTEIRO DE CAPTURA: "Acompanhar A Conferência Do Portal".
 *
 * ┌─ AS IMAGENS DE LINHA SÃO RECORTADAS NA TABELA, E A PRIMEIRA NÃO PRECISA SER ────────────────┐
 * │ A imagem 1 ensina os CARDS do funil, que são cinco números e cinco rótulos: não há pessoa nela.  │
 * │ As duas seguintes ensinam a LINHA, e aí o recorte aperta a caixa na própria tabela, com o gate de │
 * │ dado pessoal rodando DENTRO dela, na ordem que o bloco do `recorte` exige.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TERCEIRA IMAGEM TROCA DE VISTA, E O ALVO DELA É O CABEÇALHO, NÃO A LINHA ────────────────┐
 * │ A fila de "Pedidos De Ajuda Para Entrar" é uma fila de incidente: ela é curta por natureza e     │
 * │ costuma estar VAZIA, que é o estado saudável. Apontar um botão de linha faria a imagem falhar    │
 * │ justamente quando o sistema está bem. O cabeçalho da tabela é desenhado com ou sem linha, então  │
 * │ ele é o alvo estável, e a aba com o seu contador é o que o passo ensina de verdade.              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ROTEIRO NÃO CLICA, DE PROPÓSITO ────────────────────────────────────────────────┐
 * │ Nada que EMITA link (revoga o anterior e derrubaria o acesso de alguém de verdade), nada que     │
 * │ BLOQUEIE (muda o estado de uma admissão real) e nada que abra a ficha do olho (que é leitura,    │
 * │ mas não acrescenta imagem que o artigo precise). Preparo de captura não altera a operação.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS CARDS SÃO BOTÕES cujo rótulo acessível junta o número e o texto ("1234 Encaminhados"), então os
 * alvos casam pelo trecho de TEXTO: fixar o número amarraria a imagem ao estado da base.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const TABELA = "table.ds-table";

export const roteiro: Roteiro = {
  slug: "acompanhar-a-conferencia-do-portal",
  url: "/admin/portal-links",
  capturas: [
    {
      arquivo: "01-funil-da-coleta.png",
      legenda: "Passo 1: os cinco cards do funil e as duas abas do painel.",
      alvos: [
        {
          papel: "button",
          nome: "Encaminhados",
          texto: "1. O conjunto inteiro",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Intervenção Humana",
          texto: "Quem depende do time",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Atualizar",
          texto: "O painel não se atualiza sozinho",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-linha-da-trilha.png",
      legenda: "Passo 3: a linha do candidato, com Progresso, Situação e o estado do Link.",
      recorte: { seletor: TABELA, texto: "" },
      /**
       * ESTADO DECLARADO EM DOIS NÍVEIS, e o primeiro é a condição de a tabela EXISTIR.
       *
       * Esta tela tem duas VISTAS ("Painel Do Portal" e "Pedidos De Ajuda Para Entrar"), e a tabela
       * do painel simplesmente não é montada na segunda. Uma imagem de linha sem declarar a vista
       * depende de nenhuma imagem anterior ter trocado de vista, e neste roteiro há justamente uma
       * que troca. Declarada, a ordem de execução deixa de importar.
       *
       * A ABA TAMBÉM ENTRA, pelo mesmo motivo: "Em Andamento" é o padrão, mas padrão não é
       * declaração, e quem lê o roteiro precisa saber QUAL fila a imagem mostra. Reclicar a aba já
       * ativa é no-op na tela, então declarar não custa nada e fecha o buraco.
       *
       * O QUE O PREPARO **NÃO** GARANTE: que a fila tenha gente. Quem recusa a tabela sem linha é o
       * detector de LISTA VAZIA, e `linhasEsperadas` fica AUSENTE de propósito: fila vazia de coleta
       * é falta de dado, e não o estado correto da tela. A única captura do sistema que
       * declara a exceção é a janela de primeiro envio, no roteiro irmão de emitir o link.
       */
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: "Painel Do Portal", texto: "" } },
        { acao: "clicar", alvo: { papel: "button", nome: "Em Andamento", texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Documento Atual", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Documento Atual",
          texto: "3. O que falta agora",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Progresso",
          texto: "Aceitos sobre obrigatórios",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Situação",
          texto: "4. As cinco etiquetas",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-pedidos-de-ajuda.png",
      legenda: "Passo 6: a fila de quem clicou Não consigo entrar, com as duas ações da linha.",
      preparo: [
        {
          acao: "clicar",
          alvo: { papel: "button", nome: "Pedidos De Ajuda Para Entrar", texto: "" },
        },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Pedidos De Ajuda Para Entrar",
          texto: "6. A fila de quem travou",
          forma: "elipse",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Pediu Em",
          texto: "Quando foi o último pedido",
          forma: "retangulo",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Vezes",
          texto: "Quantas vezes insistiu",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
  ],
};
