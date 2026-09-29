/**
 * ROTEIRO DE CAPTURA: "Importar Uma Planilha".
 *
 * ┌─ O LIMITE QUE PARAVA ESTE ROTEIRO EM DUAS IMAGENS FOI REMOVIDO ──────────────────────────────┐
 * │ O ciclo da importação (entendimento das colunas, prévia, gravação) só existe DEPOIS de um        │
 * │ arquivo subir, e o preparo sabia clicar, digitar, trocar de aba e rolar: não sabia escolher      │
 * │ arquivo. O `devops` implementou o gesto `subirArquivo`, então os três passos que ficavam sem      │
 * │ imagem passaram a ter a sua.                                                                    │
 * │                                                                                                │
 * │ O ARQUIVO É SINTÉTICO E VERSIONADO em `capturas/arquivos/`, e o motor RECUSA qualquer caminho    │
 * │ fora dali (§A.6): o que sobe aparece na tela, e a tela vira PNG que o git guarda para sempre.    │
 * │ A planilha só tem nome de loja, endereço e código, nunca nome de pessoa.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A IMPORTAÇÃO DE LOJAS VIVE DENTRO DA FICHA DO CLIENTE, então a primeira imagem já precisa de
 * preparo: sem abrir a ficha, o atalho não está na tela. A ficha do cliente não mostra pessoa (é
 * código, razão social, CNPJ e operação), e por isso esta é a importação escolhida entre as seis.
 *
 * O PREPARO É ACUMULATIVO E RECONSTRUÍDO por imagem (ver `Captura.preparo`), então cada uma declara o
 * caminho inteiro até o estado dela: abrir a ficha, abrir a janela, subir o arquivo. Repetir custa
 * alguns segundos e faz cada imagem ser capturável sozinha, que é o que impede um ajuste numa delas
 * de derrubar as seguintes.
 */
import type { Roteiro } from "../tipos";

const PAINEL = 'div[role="dialog"] .panel';
const CAMPO_DO_ARQUIVO = 'input[aria-label="Planilha de lojas"]';

/** O caminho até a janela de importação. Repetido por imagem porque o preparo é reconstruído. */
const ABRIR_A_JANELA: Roteiro["preparo"] = [
  { acao: "clicar", alvo: { papel: "button", nome: "Ver ficha", texto: "" } },
  { acao: "clicar", alvo: { papel: "button", nome: "Importar Planilha", texto: "" } },
];

/**
 * A SUBIDA DO ARQUIVO SINTÉTICO. Só nome de loja, endereço e código: nome de pessoa, mesmo inventado,
 * é indistinguível de real para quem lê o print, e o gate recusaria (§A.6).
 */
const SUBIR_A_PLANILHA: Roteiro["preparo"] = [
  ...ABRIR_A_JANELA,
  {
    acao: "subirArquivo",
    alvo: { seletor: CAMPO_DO_ARQUIVO, texto: "" },
    valor: "lojas-de-exemplo.csv",
  },
];

/**
 * ─ ESTE ROTEIRO CONTINUA SEM GRAVAR, E OS QUATRO MOTIVOS ESTÃO MEDIDOS (28/09/2026) ──────────────
 *
 * Nada aqui é suposição: cada linha saiu de `pnpm ajuda:conferir --slug=importar-uma-planilha`.
 *
 * 1. PRINT 01, "LISTA VAZIA" COM 227 LINHAS NA TELA. A contagem de 227 é a TABELA DE CLIENTES, que
 *    está cheia. Quem dispara a recusa é OUTRA lista da mesma página: o catálogo "Lojas E Unidades"
 *    dentro da ficha, que escreve em palavras "nenhuma loja ativa, a admissão fica só no nome do
 *    cliente" (`components/admin/LojasDoCliente.tsx`) quando o cliente não tem loja. O detector não
 *    está errado: ele recusa o VAZIO ESCRITO independentemente da contagem, de propósito. O preparo
 *    abre a ficha do PRIMEIRO cliente da lista, e ele não tem loja nenhuma.
 *
 * 2. E BUSCAR UM CLIENTE COM LOJAS TROCA A RECUSA, NÃO A RESOLVE. Só UM cliente da homologação tem
 *    catálogo de lojas povoado, e as 15 lojas dele têm ENDEREÇO: com a ficha dele aberta, o gate de
 *    dado pessoal reprova com 12 achados (10 CEP e 2 nomes de rua). A recusa é LEGÍTIMA (§A.6), e a
 *    saída pela dispensa está FECHADA por decisão do `seguranca`, que já deixou
 *    `clinicas_catalogo.endereco` fora do vocabulário dispensável com o mesmo argumento. O arnês
 *    também não pode criar loja sintética: `cliente_lojas` é um dos dez pares que o gate consome
 *    como vocabulário, e arnês que escreve ali passa a escolher o que o gate dispensa.
 *
 * 3. PRINTS 02 A 05: FALSO POSITIVO DO GATE NA PRÓPRIA PROSA DA JANELA. O texto de apoio do modal
 *    diz "A leitura entende quais colunas são o nome, o endereço e o código, e você confere e
 *    corrige antes de gravar", e a regra ENDERECO casa a palavra "endereço" e leva o resto da frase
 *    como se fosse um valor, que passa no `exigeNumeroOuVirgula` por causa das vírgulas. O achado
 *    literal é `ENDERECO: e o código, e você confere e corrige antes de gravar. Nada é gravado sem o
 *    seu aceite.` Não é dado de ninguém: é `ImportarLojasModal.tsx:219`. O conserto desenhado para
 *    isso é `MASCARAS_DA_INTERFACE` (`tools/ajuda/src/allowlist.ts`), e ele não foi feito nesta
 *    sessão porque `pii.ts` e aquele arquivo são código validado e coberto por teste (§A.26).
 *
 * 4. E AINDA HÁ UM QUARTO, que só apareceu depois de contornar o terceiro: com os prints 02 em
 *    diante alcançados, o alvo `combobox "Coluna de Nome Da Loja"` NÃO existe na tela. A prévia da
 *    importação depende do backend mais da leitura por I.A., e ela não chega a renderizar na
 *    homologação dentro dos 6s que o gesto `subirArquivo` espera. Os prints 03, 04 e 05 nunca foram
 *    provados.
 */
export const roteiro: Roteiro = {
  slug: "importar-uma-planilha",
  url: "/admin/clientes",
  capturas: [
    {
      arquivo: "01-abrir-a-importacao.png",
      legenda: "Passo 1: o atalho que abre a importação por planilha.",
      preparo: [{ acao: "clicar", alvo: { papel: "button", nome: "Ver ficha", texto: "" } }],
      alvos: [
        {
          papel: "button",
          nome: "Importar Planilha",
          texto: "1. Abra a importação",
          forma: "elipse",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "02-escolher-o-arquivo.png",
      legenda: "Passo 2: a janela de importação, com o campo do arquivo.",
      preparo: ABRIR_A_JANELA,
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          seletor: CAMPO_DO_ARQUIVO,
          texto: "2. Escolha o arquivo",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "03-o-que-a-leitura-entendeu.png",
      legenda: "Passo 3: as colunas que a leitura reconheceu, cada uma editável.",
      preparo: SUBIR_A_PLANILHA,
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "combobox",
          nome: "Coluna de Nome Da Loja",
          texto: "3. Corrija se errou",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "04-previa-do-que-vai-ser-criado.png",
      legenda: "Passo 4: a prévia, linha a linha, do que vai ser criado.",
      preparo: SUBIR_A_PLANILHA,
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          seletor: `${PAINEL} table.ds-table`,
          texto: "4. Confira a prévia",
          forma: "retangulo",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "05-gravar-a-importacao.png",
      legenda: "Passo 5: o botão que grava exatamente as linhas da prévia.",
      preparo: SUBIR_A_PLANILHA,
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          // O rótulo do botão CARREGA A CONTAGEM ("Importar 8 Lojas"), então o alvo é por expressão:
          // fixar o número faria o roteiro quebrar ao mudar uma linha da planilha sintética.
          papel: "button",
          nome: /^Importar \d+ Loja/,
          texto: "5. Grave a importação",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
  ],
};
