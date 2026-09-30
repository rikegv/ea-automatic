/**
 * ─ ROTEIRO: "Enviar O Candidato Para A Admissão". TRÊS imagens, TRÊS estados ──────────────────
 *
 * ┌─ POR QUE TUDO AQUI É RECORTADO ───────────────────────────────────────────────────────────────┐
 * │ A aba "Ver Candidatos" monta a barra do recorte, e o campo de busca dela carrega este `title`:   │
 * │ "A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." │
 * │ O gate audita `title` e a recusa por LISTA VAZIA casa `\bnenhum(a|as|os)?\b\s+\p{L}+`, então      │
 * │ "nenhum endereço" acende a recusa em qualquer imagem que contenha aquela barra, com a fila cheia │
 * │ ou vazia. É falso positivo de uma frase de AJUDA do produto, e o recorte tira a barra do quadro. │
 * │                                                                                                 │
 * │ OS RECORTES FORAM ESCOLHIDOS PARA CONTINUAR ENSINANDO: a tabela tem a largura inteira do painel  │
 * │ e a janela tem a janela inteira, então cabe o alvo MAIS o rótulo dele.                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NENHUM ALVO CARREGA NOME DE PESSOA, E O CPF NÃO APARECE EM IMAGEM NENHUMA ──────────────────┐
 * │ O ícone da linha é apontado pelo `title` (rótulo genérico), e não pelo nome acessível, que é o   │
 * │ `aria-label` com o nome de quem está naquela linha. E o passo 1 do artigo (conferir o CPF no     │
 * │ cadastro) fica SEM IMAGEM de propósito: a ficha do candidato é a única superfície do módulo que  │
 * │ mostra CPF, e §A.6 não admite esse campo num PNG versionado, nem mascarado.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { Alvo, GestoDePreparo, Roteiro } from "../tipos";

const A_TABELA_DO_PAINEL: Alvo = {
  seletor: '[role="dialog"][aria-label="Painel da vaga"] div.ea-scroll.overflow-x-auto',
  texto: "a tabela de quem está na vaga",
};

const A_JANELA_DE_DECISAO: Alvo = {
  // O `aria-label` do `Modal` é estável e NÃO carrega nome de pessoa; o `<h2>` desta janela é o NOME
  // do candidato, então casar por ele amarraria o recorte a um registro do arnês.
  seletor: '[role="dialog"][aria-label="Mover a candidatura"] > div',
  texto: "a janela de decisão",
};

/**
 * O ícone da linha, apontado pelo rótulo GENÉRICO (`title`).
 *
 * O ARTIGO CHAMA ESTE BOTÃO DE OUTRO NOME em outros passos ("Encerrar ou enviar para a admissão"), e
 * esse rótulo NÃO existe na tela de hoje: ele é o ramo falso de um ternário cujas duas réguas são a
 * mesma função (`podeMoverNoFunil` e `podeDecidir` devolvem `candidaturaViva`), e o botão só é
 * desenhado quando a segunda é verdadeira. A divergência está reportada ao coordenador.
 */
const ICONE_DE_DECISAO =
  '[role="dialog"][aria-label="Painel da vaga"] button[title="Mover de etapa"]';

const ATE_A_LINHA_QUE_DECIDE: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    // §A.6: a coluna Consultor Responsável escreve nome de usuário REAL, e o gate procura os 42
    // nomes da denylist em cada imagem. Só a vaga do arnês na tela tira o dado do quadro.
    valor: "SIM-AS-2026-0601",
  },
  {
    acao: "clicar",
    alvo: {
      papel: "button",
      nome: /Abrir a gestão da vaga SIM-AS-2026-0601/,
      texto: "o botão da coluna Ações",
    },
  },
  {
    acao: "clicar",
    alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a aba da lista completa" },
  },
  /*
   * ESPERA. Até a lista chegar do backend a tela escreve "Carregando quem está nesta vaga.", que a
   * recusa por LISTA VAZIA casa. `rolarAte` é o único gesto de espera do vocabulário (600ms cada) e
   * é inócuo sobre um alvo que já está à vista.
   */
  ...Array.from(
    { length: 3 },
    (): GestoDePreparo => ({
      acao: "rolarAte",
      alvo: { papel: "button", nome: /^Ver Candidatos\s*\d*$/, texto: "a barra das abas" },
    }),
  ),
  {
    /*
     * O FILTRO FAZ A TABELA CABER NA VIEWPORT (1600x1000): com as doze candidaturas do arnês ela
     * passa de 1700px de altura e o motor recusa o recorte com "ALVO FORA DA VIEWPORT". "ZU" é um
     * FRAGMENTO, e não um nome: casa SIMULADO ZULU e nenhum outro do arnês, e não está no prefixo
     * "SIMULADO", comum a todos. Ele já entregou posição, que é o caso deste artigo.
     */
    acao: "digitar",
    alvo: {
      seletor: 'input[aria-label="Buscar candidato por nome nesta vaga"]',
      texto: "a busca da vaga",
    },
    valor: "ZU",
  },
];

const ABRIR_A_DECISAO: GestoDePreparo = {
  acao: "clicar",
  alvo: { seletor: ICONE_DE_DECISAO, texto: "a seta da linha" },
};

export const roteiro: Roteiro = {
  slug: "enviar-o-candidato-para-a-admissao",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_LINHA_QUE_DECIDE,
  capturas: [
    {
      arquivo: "01-secao-enviar-para-a-admissao.png",
      legenda: "Passo 3: a seção Enviar Para A Admissão, em seção própria, separada da saída da vaga.",
      preparo: [ABRIR_A_DECISAO],
      recorte: A_JANELA_DE_DECISAO,
      alvos: [
        /*
         * ─ AQUI HAVIA UM SEGUNDO ALVO, NO TÍTULO DA SEÇÃO, E ELE FOI REMOVIDO DEPOIS DE OLHAR O PNG ─
         *
         * O título é um `<h3>` de bloco, então a elipse dele ocupa a largura INTEIRA da janela e
         * encosta na elipse do botão logo abaixo. O motor recusou "acima" por colisão, devolveu o
         * rótulo para a direita (porque `lado` é SUGESTÃO) e ele saiu FORA do recorte: a imagem ficou
         * com um círculo gigante sem legenda nenhuma, passando em todos os gates. O botão sozinho
         * ensina o passo, e a seção está dita na legenda. (§A.13, medido, não deduzido.)
         */
        {
          /*
           * O BOTÃO DE SAÍDA junta o rótulo com a frase de apoio no nome acessível, então a expressão
           * casa só o começo. E `.first()` resolve aqui o botão da SEÇÃO, e não o de confirmar do
           * rodapé da caixa de motivo: aquele só nasce depois deste clique, e tem o mesmo nome.
           */
          papel: "button",
          nome: /^Enviar para admissão/,
          texto: "1. Abre o campo de motivo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-aviso-do-link-e-motivo.png",
      legenda: "Passos 4 e 5: o aviso do link do portal e o campo de motivo, que é obrigatório.",
      preparo: [
        ABRIR_A_DECISAO,
        {
          acao: "clicar",
          alvo: { papel: "button", nome: /^Enviar para admissão/, texto: "o desfecho com êxito" },
        },
      ],
      recorte: A_JANELA_DE_DECISAO,
      alvos: [
        {
          /*
           * O AVISO É UM `<p>` SEM PAPEL ACESSÍVEL (`AvisoDoEnvioDoLink`), então o seletor é a saída
           * de emergência usada pelo motivo certo. Ele é escopado à CAIXA DE MOTIVO (`div.mt-3
           * .rounded-xl.p-4`), e não só ao `div.mb-3`: a primeira redação usava só este último, e
           * havia OUTRO `div.mb-3` antes dele na janela, então `.first()` resolveu o elemento errado
           * e a elipse saiu desenhada no rodapé, longe do aviso. Nada falhou, e só olhar o PNG pegou
           * (§A.13).
           *
           * §A.6: o endereço que ele mostra vem MASCARADO do backend, e é isso que torna a imagem
           * publicável. Nenhum e-mail inteiro entra no quadro.
           */
          seletor:
            '[role="dialog"][aria-label="Mover a candidatura"] div.mt-3.rounded-xl.p-4 > div.mb-3 > p',
          texto: "2. Para onde o link vai",
          lado: "acima",
        },
        {
          /*
           * O CAMPO DE MOTIVO DO ENVIO É UM `<textarea>` (texto livre, e não o seletor do catálogo,
           * que só existe no descarte). `textarea` não tem papel no vocabulário de `Alvo`, então o
           * seletor casa o `aria-label`, que é o rótulo acessível.
           */
          seletor:
            '[role="dialog"][aria-label="Mover a candidatura"] textarea[aria-label="Motivo da saída"]',
          texto: "3. O que a admissão vai ler",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-pill-enviado-para-admissao.png",
      legenda: "Passo 7: a pill Enviado Para Admissão na coluna Situação da lista.",
      preparo: [
        {
          /*
           * TROCA O RECORTE DA LISTA para deixar à vista quem JÁ FOI ENVIADO, que é o estado que este
           * passo ensina. "PA" é um fragmento que casa SIMULADO PAPA e nenhum outro do arnês.
           */
          acao: "digitar",
          alvo: {
            seletor: 'input[aria-label="Buscar candidato por nome nesta vaga"]',
            texto: "a busca da vaga",
          },
          valor: "PA",
        },
      ],
      recorte: A_TABELA_DO_PAINEL,
      alvos: [
        {
          /*
           * `cell` É O PAPEL DA CÉLULA da tabela, e o nome dela aqui é o rótulo da pill. Ele não
           * carrega nome de pessoa, então o alvo não amarra o print a um registro.
           */
          papel: "cell",
          nome: /^Enviado Para Admissão$/,
          texto: "4. A pill da coluna Situação",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
