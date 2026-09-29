/**
 * ROTEIRO DE CAPTURA: "Achar Uma Admissão No Gerenciador".
 *
 * ┌─ A BUSCA POR `999000` É A PROTEÇÃO, E ELA RODA ANTES DE TODA IMAGEM ─────────────────────────┐
 * │ O Gerenciador é uma tela de GENTE: a lista inteira é nome de pessoa. O preparo do roteiro deixa │
 * │ na lista apenas as quatro linhas sintéticas do arnês (os CPFs da família 999, declarados um a   │
 * │ um na allowlist), e o motor reaplica esse preparo antes de cada imagem. Sem ele, a primeira      │
 * │ página da lista é a base real.                                                                 │
 * │                                                                                                │
 * │ O `recorte` SOMA, NÃO SUBSTITUI: as três imagens recortam (a página sem a barra lateral, o      │
 * │ painel da janela de filtros, a tabela), e o gate de dado pessoal audita DENTRO da caixa. Duas   │
 * │ barreiras para o mesmo risco, porque a gravação de um PNG com nome de gente é irreversível.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O `rolarAte` DEPOIS DE DIGITAR, E ELE NÃO É ENFEITE ────────────────────────────────┐
 * │ A busca da tela é atrasada de propósito (ela espera você parar de digitar antes de consultar).  │
 * │ O motor espera 600ms por gesto de preparo, que é justo em cima do atraso: o segundo gesto compra │
 * │ mais uma espera, e é isso que garante que a imagem saia com a lista JÁ recortada, em vez de      │
 * │ pegar a página anterior no instante do recorte.                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `seletor` do olho é a saída de emergência, e aqui ela é OBRIGATÓRIA: o nome acessível daquele
 * botão é "Ver " mais o nome da pessoa da linha (§A.6), então o localizador por papel e nome traria o
 * nome de alguém para dentro deste arquivo. O `title` do botão é fixo e não carrega gente.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';
const PAINEL = 'div[role="dialog"] .panel';
/** A página sem a barra lateral e sem a barra do topo: é o `<main>` da casca do sistema. */
const PAGINA = "main";
/** O cartão da tabela (cabeçalho mais linhas), no padrão único de tabela do sistema. */
const TABELA = ".list";

export const roteiro: Roteiro = {
  slug: "achar-uma-admissao-no-gerenciador",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" },
    { acao: "rolarAte", alvo: { papel: "button", nome: "Candidato", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-lista-do-gerenciador.png",
      legenda: "Passo 1: o Gerenciador aberto, com a busca, os cinco cards e a lista.",
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          seletor: BUSCA,
          texto: "1. Busque por nome ou CPF",
          lado: "abaixo",
        },
        /*
         * O NOME ACESSÍVEL DO CARD CARREGA O NÚMERO DELE ("12 Com Pendências Obrigatórias"), porque o
         * botão é o cartão inteiro: valor e rótulo. Por isso o localizador é por EXPRESSÃO e casa só
         * o rótulo, que é a parte estável. Um nome exato quebraria a cada admissão nova.
         */
        {
          papel: "button",
          nome: /Com Pendências Obrigatórias/,
          texto: "2. Os cards também filtram",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Abrir filtros",
          texto: "3. Os filtros da tela",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-filtros-do-gerenciador.png",
      legenda: "Passo 4: a janela Filtros do Gerenciador, com os nove campos da tela.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Abrir filtros", texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      /*
       * OS NOMES AQUI SÃO OS ACESSÍVEIS DOS SELETORES, e eles NÃO são os rótulos que o artigo cita:
       * a tela escreve "Loja" acima do campo e o seletor se chama "Loja ou unidade" para quem usa
       * leitor de tela. O artigo ensina o rótulo, o roteiro precisa do nome acessível.
       */
      alvos: [
        { papel: "button", nome: "Cliente", texto: "4. Um campo por linha", lado: "direita" },
        {
          papel: "button",
          nome: "Loja ou unidade",
          texto: "Vários valores por campo",
          lado: "direita",
        },
        { papel: "button", nome: "Limpar filtros", texto: "Zere todos de uma vez", lado: "acima" },
      ],
    },
    {
      arquivo: "03-linha-da-lista.png",
      legenda: "Passo 5: uma linha da lista, com as colunas de etapa e o botão de abrir a ficha.",
      recorte: { seletor: TABELA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Candidato",
          texto: "5. Clique no título para ordenar",
          lado: "abaixo",
        },
        {
          seletor: `${TABELA} button[title="Ver ficha"]`,
          texto: "6. Abra a ficha",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
