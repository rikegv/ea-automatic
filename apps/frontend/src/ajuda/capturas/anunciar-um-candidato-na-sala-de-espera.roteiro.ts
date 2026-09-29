/**
 * ROTEIRO DE CAPTURA: "Anunciar Um Candidato Na Sala De Espera".
 *
 * ┌─ A SALA DE ESPERA ESTÁ NA LISTA DAS TELAS QUE **NÃO PODEM** VIRAR IMAGEM INTEIRA ───────────┐
 * │ A lista mora no bloco do `recorte`, em `tipos.ts`, e a Sala está nela por um motivo direto: a    │
 * │ tabela mostra nome, telefone e a origem de gente que ainda nem é admissão. As DUAS imagens deste │
 * │ roteiro são recortadas, e o gate de dado pessoal roda DENTRO da caixa, nunca antes dela.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM 1 RECORTA A BARRA, E NÃO A TABELA, E A ESCOLHA É DELIBERADA ──────────────────────┐
 * │ O passo 1 ensina onde se abre o cadastro, e o botão "Novo Registro" mora na barra de cima, junto │
 * │ da busca e da contagem. Recortar a barra entrega a seta com o contexto que o passo precisa e     │
 * │ deixa de fora, inteiramente, a lista de pessoas: é a caixa mais apertada que ainda ensina.       │
 * │                                                                                                 │
 * │ O recorte casa a barra pelo CAMPO DE BUSCA que vive dentro dela (`:has`), e não por classe de    │
 * │ layout: some o campo, o motor falha em voz alta, que é o comportamento de um detector.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A JANELA DO CADASTRO NASCE VAZIA, e por isso ela é a imagem mais limpa das duas: o preparo abre o
 * "Novo Registro" e nada de pessoa nenhuma entra naquele PNG, só os rótulos dos campos.
 *
 * O BOTÃO "Salvar" NASCE APAGADO (faltam os cinco obrigatórios) e mesmo assim é encontrável: alvo
 * desabilitado continua existindo na árvore acessível, e é justamente esse o estado que o passo 7
 * ensina a ler.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';
/** A barra do topo, casada pelo campo de busca que vive dentro dela. Sem gente no recorte. */
const BARRA = 'div.glass:has(input[aria-label="Buscar na Sala de Espera"])';

export const roteiro: Roteiro = {
  slug: "anunciar-um-candidato-na-sala-de-espera",
  url: "/sala-espera",
  capturas: [
    {
      arquivo: "01-fila-aguardando.png",
      legenda: "Passo 1: a barra da Sala De Espera, com a contagem e o botão Novo Registro.",
      recorte: { seletor: BARRA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Novo Registro",
          texto: "2. Abre o cadastro",
          forma: "elipse",
          lado: "esquerda",
        },
        {
          seletor: 'input[aria-label="Buscar na Sala de Espera"]',
          texto: "Ache quem já está na fila",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-janela-do-registro.png",
      legenda: "Passo 3: a janela Novo Registro, com os campos obrigatórios e os opcionais.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Novo Registro", texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "textbox",
          nome: "Nome",
          texto: "3. O nome ocupa a linha",
          forma: "retangulo",
          lado: "direita",
        },
        {
          papel: "textbox",
          nome: "CPF do candidato",
          texto: "4. Opcional, e vale preencher",
          forma: "retangulo",
          lado: "esquerda",
        },
        {
          papel: "button",
          nome: "Salvar",
          texto: "7. Acende com os cinco obrigatórios",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
