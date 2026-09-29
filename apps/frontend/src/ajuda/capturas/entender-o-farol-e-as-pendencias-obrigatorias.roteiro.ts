/**
 * ROTEIRO DE CAPTURA: "Entender O Farol E As Pendências Obrigatórias".
 *
 * ┌─ O QUE A LISTA PRECISA TER, E É O QUE O ARNÊS ENTREGA ───────────────────────────────────────┐
 * │ Duas linhas em estados OPOSTOS, ao mesmo tempo: uma COM pendência obrigatória (que lê Parcial) e │
 * │ uma SEM (que lê Completo). Sem as duas, a primeira imagem ensina metade da leitura, e a segunda   │
 * │ (a janela do que falta) não tem o que abrir. As duas convivem no mesmo estado de tela, então o    │
 * │ roteiro não precisa de dois preparos diferentes para elas.                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ETIQUETA É CASADA PELO `title` FIXO, E A LINHA PELO ESTADO DELA ──────────────────────────┐
 * │ O nome acessível da etiqueta de pendências é o RÓTULO dela ("Parcial", "Completo", "Declínio"),  │
 * │ que muda de linha para linha: um localizador por nome pegaria qualquer linha, inclusive a         │
 * │ completa, e a janela abriria sem nada para listar, que é o oposto do que a imagem ensina. Então o │
 * │ clique é escopado à linha do arnês que TEM pendência, pelo nome sintético dela (declarado na      │
 * │ allowlist, não é dado de pessoa), e o botão é achado pelo `title`, que é fixo.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * AS TRÊS IMAGENS RECORTAM, e o gate de dado pessoal roda dentro da caixa: a tabela na primeira, o
 * painel da janela nas outras duas. A lista, antes disso, já foi reduzida às linhas sintéticas pela
 * busca do preparo. Duas barreiras para o mesmo risco, como nos roteiros irmãos desta família.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

const BUSCA = 'input[aria-label="Buscar por nome, CPF ou cliente"]';
const PAINEL = 'div[role="dialog"] .panel';
const TABELA = ".list";
/** A etiqueta de pendências da linha do arnês que tem campo obrigatório em branco. */
const BADGE_COM_PENDENCIA =
  '.row:has-text("SIMULADO BRAVO") button[title="Ver pendências obrigatórias"]';
/** O olho da MESMA linha: a ficha fotografada é a que tem pendência para o bloco mostrar a lista. */
const OLHO_COM_PENDENCIA = '.row:has-text("SIMULADO BRAVO") button[title="Ver ficha"]';
const bloco = (titulo: string) => `${PAINEL} section:has-text("${titulo}")`;

export const roteiro: Roteiro = {
  slug: "entender-o-farol-e-as-pendencias-obrigatorias",
  url: "/gerenciador",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" },
    { acao: "rolarAte", alvo: { papel: "button", nome: "Candidato", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-status-e-pendencias.png",
      legenda: "Passo 1: as colunas Status e Pendências Obrig. na linha da lista.",
      recorte: { seletor: TABELA, texto: "" },
      alvos: [
        {
          papel: "button",
          nome: "Status",
          texto: "1. Em que ponto a admissão está",
          lado: "abaixo",
        },
        {
          seletor: BADGE_COM_PENDENCIA,
          texto: "4. Falta informação obrigatória",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "02-modal-de-pendencias.png",
      legenda: "Passo 5: a janela que lista os campos obrigatórios em branco.",
      preparo: [{ acao: "clicar", alvo: { seletor: BADGE_COM_PENDENCIA, texto: "" } }],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          papel: "heading",
          nome: "Pendências obrigatórias",
          texto: "5. O que falta nesta admissão",
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Preencher pendências",
          texto: "Preencha direto daqui",
          forma: "elipse",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "03-farol-na-ficha.png",
      legenda: "Passo 8: o bloco Status das frentes, com o farol e o resumo de pendências.",
      preparo: [
        { acao: "clicar", alvo: { seletor: OLHO_COM_PENDENCIA, texto: "" } },
        { acao: "rolarAte", alvo: { seletor: bloco("Status das frentes"), texto: "" } },
      ],
      recorte: { seletor: PAINEL, texto: "" },
      alvos: [
        {
          seletor: bloco("Status das frentes"),
          texto: "8. O mesmo resumo na ficha",
          forma: "retangulo",
          lado: "direita",
        },
      ],
    },
  ],
};
