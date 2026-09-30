/**
 * ─ ROTEIRO: "Cadastrar Um Candidato Novo". TRÊS imagens, DOIS estados de tela ───────────────────
 *
 * ┌─ A JANELA É FOTOGRAFADA VAZIA, E ISSO NÃO É PREGUIÇA DE PREPARO ────────────────────────────┐
 * │ Este é um FORMULÁRIO DE PESSOA: nome, CPF, telefone, e-mail, nascimento, cidade. Digitar       │
 * │ qualquer coisa nesses campos para depois fotografar é criar dado de pessoa DENTRO de um PNG    │
 * │ versionado, e o motor executa `digitar` sem guarda nenhuma contra campo sensível. A janela      │
 * │ VAZIA ensina exatamente o que o artigo precisa mostrar: onde cada campo fica, qual é o único    │
 * │ obrigatório e quais são as três saídas do rodapé.                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O SEGUNDO PASSO DA JANELA ("A Vaga") FICA SEM IMAGEM, E A CAUSA É ESTRUTURAL ───────────────┐
 * │ O botão "Avançar" só habilita com o nome preenchido (três letras, `podeAvancar` em             │
 * │ `NovoCandidatoModal.tsx`), então chegar ao segundo passo exige DIGITAR UM NOME DE PESSOA. É     │
 * │ precisamente o gesto proibido acima, e não existe caminho alternativo: a etapa e a observação   │
 * │ inicial são ensinadas em texto. Registrado aqui, e não contornado.                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS TRÊS IMAGENS PARTEM DO ESTADO DO ROTEIRO, e por isso a segunda e a terceira REPETEM o clique
 * que abre a janela em vez de a terceira se apoiar no que a segunda deixou aberto. Imagem que
 * depende da anterior deixa de poder ser capturada sozinha, e um ajuste na primeira derruba as
 * seguintes.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo. */
const PAGINA = "main";

const ABRIR_A_JANELA: GestoDePreparo = {
  acao: "clicar",
  alvo: { papel: "button", nome: "Novo candidato", texto: "" },
};

export const roteiro: Roteiro = {
  slug: "cadastrar-um-candidato-novo",
  url: "/as/candidatos",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-botao-novo-candidato.png",
      legenda: "Passo 1: o botão de cadastrar, no topo da Central, à direita da busca.",
      // Sem preparo: a janela aberta cobriria justamente o botão que esta imagem existe para apontar.
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Novo candidato",
          texto: "1. Abra o cadastro",
          forma: "elipse",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-passo-a-pessoa.png",
      legenda: "Passos 2, 3, 5 e 6: o primeiro passo da janela, com os campos da pessoa.",
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
        {
          // A expressão, e não o nome exato: o rótulo carrega o asterisco e o "(obrigatório)" que a
          // tela escreve só para leitor de tela.
          papel: "textbox",
          nome: /Nome completo/,
          texto: "2. O único campo cobrado",
          lado: "direita",
        },
        { papel: "textbox", nome: "CPF", texto: "3. Opcional, e conferido", lado: "esquerda" },
        { papel: "combobox", nome: "Origem", texto: "4. De onde a pessoa veio", lado: "direita" },
      ],
    },
    {
      arquivo: "03-saidas-da-janela.png",
      legenda: "Passos 7 e 8: o rodapé da janela, com guardar só na base ou seguir para a vaga.",
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
        {
          papel: "button",
          nome: "Salvar sem vaga",
          texto: "5. Guarda só na base",
          lado: "acima",
        },
        { papel: "button", nome: "Avançar", texto: "6. Vai escolher a vaga", lado: "direita" },
      ],
    },
  ],
};
