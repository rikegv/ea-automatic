/**
 * ─ ROTEIRO: "Registrar A Saída Do Candidato". DUAS imagens, DOIS estados ─────────────────────
 *
 * ┌─ POR QUE TUDO AQUI É RECORTADO ───────────────────────────────────────────────────────────────┐
 * │ A aba "Ver Candidatos" monta a barra do recorte, e o campo de busca dela carrega este `title`:   │
 * │ "A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." │
 * │ O gate audita `title` e a recusa por LISTA VAZIA casa `\bnenhum(a|as|os)?\b\s+\p{L}+`, então      │
 * │ "nenhum endereço" acende a recusa em qualquer imagem que contenha aquela barra, com a fila cheia │
 * │ ou vazia. É falso positivo de uma frase de AJUDA do produto, e o recorte tira a barra do quadro. │
 * │                                                                                                 │
 * │ E OS RECORTES FORAM ESCOLHIDOS PARA CONTINUAR ENSINANDO: a tabela tem a largura inteira do       │
 * │ painel e a janela tem a janela inteira, então cabe o alvo MAIS o rótulo dele.                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NENHUM ALVO CARREGA NOME DE PESSOA ─────────────────────────────────────────────────────────┐
 * │ O ícone da linha é apontado pelo `title` (rótulo genérico), e não pelo nome acessível, que é o    │
 * │ `aria-label` com o nome de quem está naquela linha. Os alvos da janela são títulos de seção e     │
 * │ botões de escolha, que não mudam de pessoa para pessoa.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { Alvo, GestoDePreparo, Roteiro } from "../tipos";

const A_JANELA_DE_DECISAO: Alvo = {
  /*
   * O `aria-label` do `Modal` é estável e NÃO carrega nome de pessoa. O `<h2>` desta janela é o NOME
   * do candidato, então casar por ele amarraria o recorte a um registro do arnês.
   */
  seletor: '[role="dialog"][aria-label="Mover a candidatura"] > div',
  texto: "a janela de decisão",
};

/**
 * ─ O ÍCONE DA LINHA, E UM ACHADO QUE O MOTOR DESENTERROU ──────────────────────────────────────
 *
 * ┌─ O RÓTULO "Encerrar ou enviar para a admissão" NÃO EXISTE NA TELA DE HOJE ──────────────────┐
 * │ O artigo (passo 1) manda clicar nele, e a primeira redação deste roteiro o procurou: o motor  │
 * │ falhou com ALVO NÃO ENCONTRADO, que é exatamente o detector de artigo velho fazendo o trabalho │
 * │ dele. A causa é de CÓDIGO, e está medida: o rótulo do ícone é                                  │
 * │ `podeMoverNoFunil(situacao) ? "Mover de etapa" : "Encerrar ou enviar para a admissão"`, e as   │
 * │ duas réguas são a MESMA função (`podeMoverNoFunil` e `podeDecidir` devolvem `candidaturaViva`, │
 * │ em `lib/as-vaga-acoes.ts`). Como o botão só é desenhado quando `podeDecidir` é verdadeiro, o   │
 * │ segundo ramo nunca é alcançado: quem já entregou posição continua vendo "Mover de etapa".      │
 * │                                                                                                │
 * │ O ROTEIRO APONTA O RÓTULO QUE A TELA REALMENTE MOSTRA, e a divergência está REPORTADA ao        │
 * │ coordenador: consertar o texto do artigo ou o rótulo do produto é decisão dele, não deste       │
 * │ arquivo (§A.14). Enquanto isso, o passo 1 fica SEM IMAGEM de propósito, porque uma imagem do    │
 * │ botão desmentiria a frase que ela ilustraria.                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E ELE É APONTADO PELO `title`, e não pelo nome acessível: o `aria-label` do mesmo botão carrega o
 * NOME DA PESSOA da linha, e alvo assim amarra o print a um registro do arnês.
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
     * O FILTRO FAZ DUAS COISAS. Primeira, faz a tabela CABER na viewport (1600x1000): com as doze
     * candidaturas do arnês ela passa de 1700px e o motor recusa o recorte com "ALVO FORA DA
     * VIEWPORT". Segunda, deixa à vista uma linha que JÁ ENTREGOU POSIÇÃO, que é a única que oferece
     * o ícone deste artigo (quem está em seleção recebe o rótulo "Mover de etapa" no mesmo botão).
     *
     * "ZU" É UM FRAGMENTO, e não um nome: casa SIMULADO ZULU e nenhum outro do arnês, e não está no
     * prefixo "SIMULADO", que é comum a todos.
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
  slug: "registrar-a-saida-do-candidato",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_LINHA_QUE_DECIDE,
  capturas: [
    {
      arquivo: "01-secao-desvincular.png",
      legenda: "Passo 2: a seção Desvincular Da Vaga, com os dois motivos de saída.",
      preparo: [ABRIR_A_DECISAO],
      recorte: A_JANELA_DE_DECISAO,
      alvos: [
        {
          papel: "heading",
          nome: /^Desvincular Da Vaga$/,
          texto: "2. A saída da vaga",
          /*
           * ACIMA, e não à direita: o título de seção é um `<h3>` de bloco, então a elipse ocupa a
           * largura INTEIRA da janela e o rótulo à direita cai fora do recorte (medido nesta frente,
           * no roteiro de mover de etapa, olhando o PNG).
           */
          lado: "acima",
        },
        {
          /*
           * O BOTÃO DE SAÍDA junta o rótulo com a frase de apoio no nome acessível, então a expressão
           * casa só o começo. Ancorada no início de propósito: sem isso, "Descartado Pela Seleção"
           * também casaria o card de indicador da Central De Vagas, atrás da janela.
           */
          papel: "button",
          nome: /^Descartado Pela Seleção/,
          texto: "3. Decisão da seleção",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: /^Desistiu Do Processo/,
          texto: "4. Decisão do candidato",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-campo-motivo.png",
      legenda: "Passo 3: o campo Motivo, que no descarte é um seletor alimentado pelo cadastro.",
      preparo: [
        ABRIR_A_DECISAO,
        {
          acao: "clicar",
          alvo: { papel: "button", nome: /^Descartado Pela Seleção/, texto: "o motivo da saída" },
        },
      ],
      recorte: A_JANELA_DE_DECISAO,
      alvos: [
        {
          /*
           * É `button`, E NÃO `combobox`: o campo é o `Select` do design system (§A.35, nenhum
           * `<select>` cru no sistema), e o gatilho dele é um `<button>` com `aria-haspopup="listbox"`
           * e `aria-label`, sem `role` explícito. O `Combobox`, que é outro componente da casa, esse
           * sim declara `role="combobox"`. Procurar o papel errado devolveu ALVO NÃO ENCONTRADO.
           */
          papel: "button",
          nome: /^Motivo do descarte$/,
          texto: "5. O motivo vem do cadastro",
          lado: "acima",
        },
      ],
    },
  ],
};
