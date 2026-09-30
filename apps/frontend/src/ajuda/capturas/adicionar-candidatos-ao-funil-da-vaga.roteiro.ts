/**
 * ─ ROTEIRO: "Adicionar Candidatos Ao Funil Da Vaga". DUAS imagens, DOIS estados ────────────────
 *
 * ┌─ POR QUE AS DUAS IMAGENS SAEM DA ABA "Candidatos Disponíveis", E NÃO DA "Ver Candidatos" ─────┐
 * │ NÃO É PREFERÊNCIA DE ENQUADRAMENTO: É O ÚNICO CAMINHO QUE PASSA NO GATE SEM AFROUXAR NADA.      │
 * │                                                                                                 │
 * │ A aba "Ver Candidatos" monta a barra do recorte, e o campo de busca dela carrega este `title`:   │
 * │ "A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em NENHUM ENDEREÇO." │
 * │ O gate audita `title` (`ATRIBUTOS_LIDOS`, em `pii.ts`) e a recusa por LISTA VAZIA casa           │
 * │ `\bnenhum(a|as|os)?\b\s+\p{L}+`: "nenhum endereço" ACENDE a recusa em TODA imagem daquela aba,   │
 * │ mesmo com a lista cheia. MEDIDO em 30/09/2026: a recusa veio dizendo "2 lista(s), 13 linha(s) de │
 * │ dado", ou seja, o próprio achado registra que a fila estava povoada. É falso positivo, e a causa │
 * │ é uma frase de AJUDA do produto, não um estado de tela.                                         │
 * │                                                                                                 │
 * │ O QUE FOI TENTADO E DESCARTADO, na ordem: (1) esperar mais, e não era tempo; (2) `recorte` na    │
 * │ faixa dos botões, que PASSOU no gate e produziu uma imagem INÚTIL, de 2460x92, com as duas       │
 * │ elipses cortadas ao meio e os dois rótulos inteiramente fora do quadro (a mesma lição de         │
 * │ `entrar-no-sistema.roteiro.ts`, encontrada de novo). Afrouxar o gate estava fora de questão, e   │
 * │ declarar `linhasEsperadas: "PODE_SER_VAZIA"` também: a lista NÃO é vazia, e aquela declaração    │
 * │ existe para o artigo que ENSINA o vazio.                                                        │
 * │                                                                                                 │
 * │ A ABA "Candidatos Disponíveis" NÃO MONTA aquela barra (é componente próprio), então ela não tem  │
 * │ a frase, dispensa recorte e entrega a viewport inteira de quadro. Ela também oferece o MESMO     │
 * │ botão "Adicionar vários ao funil", que é o passo 4 do artigo.                                    │
 * │                                                                                                 │
 * │ O QUE FICA SEM IMAGEM, E ESTÁ REPORTADO: o botão "Adicionar à vaga" (passo 2), que só existe na  │
 * │ aba "Ver Candidatos". Ele volta a ser fotografável no dia em que aquele `title` deixar de casar  │
 * │ com a régua do vazio, e isso é decisão de quem é dono do gate, não deste roteiro.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NENHUM ALVO É UMA LINHA DE PESSOA. Todo botão de linha desta tela carrega o NOME no `aria-label`, e
 * alvo assim amarra o print a um registro. Os alvos aqui são cabeçalho de coluna, botão de barra e
 * controle de janela, que não mudam quando a lista muda.
 *
 * §A.11: nenhum rótulo com travessão.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/** O nome acessível da aba da lista completa. Aqui ele serve só de âncora para ESPERAR. */
const ABA_VER_CANDIDATOS = /^Ver Candidatos\s*\d*$/;

/** Buscar a vaga do arnês, abrir a janela dela e parar na aba de quem ainda pode entrar. */
const ATE_A_ABA_DOS_DISPONIVEIS: GestoDePreparo[] = [
  {
    acao: "digitar",
    alvo: { seletor: 'input[aria-label="Buscar em qualquer coluna da tabela"]', texto: "a busca" },
    /*
     * §A.6, E NÃO ENQUADRAMENTO: a Central De Vagas escreve NOME DE USUÁRIO REAL na coluna Consultor
     * Responsável, e o gate procura os 42 nomes da denylist dentro de cada imagem. Deixar na tela só
     * a vaga do arnês (cujo consultor é a conta de captura) tira o dado do quadro sem recortar pixel
     * nenhum, e ainda torna o botão da linha ÚNICO: o alvo deixa de depender da ordem da lista.
     */
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
    alvo: { papel: "button", nome: /^Candidatos Disponíveis$/, texto: "a aba dos disponíveis" },
  },
  /*
   * ─ OS GESTOS DE ESPERA, E ELES NÃO SÃO SUPERSTIÇÃO ────────────────────────────────────────────
   *
   * A lista chega do backend DEPOIS do clique na aba, e até lá a tela escreve "Carregando quem está
   * disponível.". A recusa por LISTA VAZIA casa `\bcarregando\b` e barra a imagem: não é fila vazia,
   * é foto tirada cedo demais.
   *
   * `rolarAte` É O ÚNICO GESTO DE ESPERA QUE O VOCABULÁRIO TEM (cada gesto do preparo custa 600ms), e
   * ele é INÓCUO sobre um alvo que já está à vista: rolar até onde já se está não muda nada na tela.
   * Pedir um gesto "esperar" ao coordenador seria o certo se isto virasse padrão; para um roteiro, o
   * reuso resolve sem tocar no contrato compartilhado.
   */
  ...Array.from(
    { length: 3 },
    (): GestoDePreparo => ({
      acao: "rolarAte",
      alvo: { papel: "button", nome: ABA_VER_CANDIDATOS, texto: "a barra das abas" },
    }),
  ),
];

export const roteiro: Roteiro = {
  slug: "adicionar-candidatos-ao-funil-da-vaga",
  url: "/as/vagas",
  arnes: "arnes-seed-as-manual",
  preparo: ATE_A_ABA_DOS_DISPONIVEIS,
  capturas: [
    {
      arquivo: "01-candidatos-disponiveis.png",
      legenda:
        "Passos 4, 7 e 8: a aba Candidatos Disponíveis, com a coluna Vaga Atual, o botão de vincular e o caminho do lote.",
      alvos: [
        {
          // O cabeçalho de coluna é um `<button>` de verdade dentro do `<th>` (`ColunaOrdenavel`,
          // §A.29), então papel mais nome resolve sem seletor. `^...$` porque `nome` em TEXTO casa
          // por SUBSTRING no localizador acessível, e com `.first()` vence o primeiro da página.
          papel: "button",
          nome: /^Vaga Atual$/,
          texto: "1. Separa as duas populações",
          lado: "acima",
        },
        {
          papel: "button",
          nome: /^Vincular$/,
          texto: "2. Traz quem não está em vaga",
          forma: "elipse",
          lado: "esquerda",
        },
        {
          papel: "button",
          nome: /^Adicionar vários ao funil$/,
          texto: "3. Várias pessoas de uma vez",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-adicionar-varios-ao-funil.png",
      legenda: "Passo 5: a janela do lote, com a busca, a marcação em massa e o botão que aplica.",
      preparo: [
        {
          acao: "clicar",
          alvo: {
            papel: "button",
            nome: /^Adicionar vários ao funil$/,
            texto: "o botão do lote",
          },
        },
      ],
      alvos: [
        {
          /*
           * O SELETOR É ESCOPADO À JANELA DO LOTE, e isso é obrigatório: existem DOIS campos com o
           * mesmo `aria-label` na página (o da aba, atrás, e o da janela), e `.first()` pegaria o de
           * trás, desenhando a seta sobre um campo que este passo não ensina, sem nada falhar.
           *
           * E É SELETOR, E NÃO PAPEL, porque o campo é `input type="search"`, cujo papel acessível é
           * `searchbox`, que não está no vocabulário de `Alvo` (`textbox` não casa com ele).
           */
          seletor:
            '[role="dialog"]:has(h2:text-is("Adicionar Candidatos À Vaga")) input[aria-label="Procurar candidato pelo nome"]',
          texto: "4. Procure pelo nome",
          lado: "acima",
        },
        {
          /*
           * "Selecionar todos os visíveis" é o texto de um `<label>` com caixa de marcação dentro, e
           * `checkbox` não está no vocabulário de `Alvo`. O seletor casa o rótulo, que é o que a
           * pessoa lê e clica.
           */
          seletor: 'label:has-text("Selecionar todos os visíveis")',
          texto: "5. Marca só quem está à vista",
          lado: "abaixo",
        },
        {
          /*
           * O NÚMERO DA SELEÇÃO ENTRA NO RÓTULO ("Adicionar ao funil (0)"), então o nome inteiro muda
           * a cada clique: a expressão casa a FORMA, não o número. Ancorada de propósito, porque a
           * confirmação que abre depois tem um botão chamado só "Adicionar ao funil".
           */
          papel: "button",
          nome: /^Adicionar ao funil \(\d+\)$/,
          texto: "6. Aplica o lote",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
  ],
};
