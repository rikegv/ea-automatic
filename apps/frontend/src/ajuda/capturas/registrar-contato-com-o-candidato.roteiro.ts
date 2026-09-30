/**
 * ─ ROTEIRO: "Registrar Contato Com O Candidato". DUAS imagens ───────────────────────────────────
 *
 * ┌─ O ALVO DO ÍCONE É O `title`, E NÃO O NOME ACESSÍVEL DELE ──────────────────────────────────┐
 * │ O nome acessível do ícone de telefone é "Registrar contato com " mais o nome da pessoa daquela │
 * │ linha (§A.6, `AcaoIcone` em `as/candidatos/page.tsx`). Apontá-lo por papel e nome traria gente  │
 * │ para dentro deste arquivo e amarraria o print a UM registro do arnês: o localizador quebraria   │
 * │ na primeira mudança de dado, acusando "artigo velho" com o artigo certo. O `title` é texto      │
 * │ FIXO da tela, igual em toda linha, e o motor resolve pelo primeiro da página.                   │
 * │                                                                                                │
 * │ O MESMO SELETOR SERVE DE GESTO E DE ALVO: a primeira imagem o APONTA na linha, a segunda o      │
 * │ CLICA no preparo para abrir a janela. Uma fonte só para as duas coisas.                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NADA É REGISTRADO NA HOMOLOGAÇÃO POR ESTE ROTEIRO ─────────────────────────────────────────┐
 * │ A janela é fotografada com o resumo VAZIO, e o botão de salvar fica apagado justamente por      │
 * │ isso (ele exige duas letras). Preencher para fotografar gravaria um contato de verdade numa     │
 * │ candidatura de verdade a cada rodada de captura, e captura que muda o estado do sistema deixa    │
 * │ de ser repetível. O campo de data já nasce com a data de hoje, que é o que o passo 4 ensina.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A COLUNA "Último Contato" ENTRA NA PRIMEIRA IMAGEM de propósito: ela é o passo 7, é o efeito que o
 * artigo promete, e é a coluna que a operação mais confunde com "última movimentação".
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** A página sem a barra lateral e sem a barra do topo. */
const PAGINA = "main";
/** O ícone de telefone da coluna Ações, pelo rótulo FIXO do `title` (nunca pelo nome da pessoa). */
const ICONE_DE_CONTATO = 'button[title="Registrar contato"]';

const ABRIR_A_JANELA: GestoDePreparo = {
  acao: "clicar",
  alvo: { seletor: ICONE_DE_CONTATO, texto: "" },
};

export const roteiro: Roteiro = {
  slug: "registrar-contato-com-o-candidato",
  url: "/as/candidatos",
  arnes: "arnes-seed-as-manual",
  capturas: [
    {
      arquivo: "01-icone-na-linha.png",
      legenda: "Passos 2 e 7: o ícone de telefone na linha e a coluna do último contato.",
      // Sem preparo: a janela aberta cobriria o ícone que esta imagem existe para apontar.
      recorte: { seletor: PAGINA, texto: "" },
      alvos: [
        {
          seletor: ICONE_DE_CONTATO,
          texto: "1. Registrar contato",
          forma: "elipse",
          lado: "esquerda",
        },
        {
          papel: "button",
          nome: "Último Contato",
          texto: "2. A data anda só com contato",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "02-janela-do-contato.png",
      legenda: "Passos 3 a 6: a janela do contato, com o tipo, a data e o resumo.",
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
          papel: "combobox",
          nome: "Tipo de contato",
          texto: "3. Ligação, WhatsApp, e-mail",
          lado: "direita",
        },
        {
          papel: "textbox",
          nome: /O que aconteceu/,
          texto: "4. Resumo do processo",
          lado: "esquerda",
        },
        {
          /*
           * A ÂNCORA É O QUE SEPARA ESTE BOTÃO DOS DA LISTA. O nome casa por SUBSTRING, e cada linha
           * da tabela ATRÁS da janela tem um botão cujo nome acessível é "Registrar contato com "
           * mais o nome da pessoa (§A.6). Sem `^...$`, o motor resolvia no primeiro da página, que é
           * o da linha, e a seta era desenhada sobre a tela de trás. Medido olhando o PNG (§A.13).
           */
          papel: "button",
          nome: /^Registrar contato$/,
          texto: "5. Salva na candidatura",
          forma: "elipse",
          lado: "direita",
        },
      ],
    },
  ],
};
