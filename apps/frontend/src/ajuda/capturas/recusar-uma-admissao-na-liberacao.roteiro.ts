/**
 * ROTEIRO DE CAPTURA: "Recusar Uma Admissão Na Liberação".
 *
 * ┌─ NADA É RECUSADO POR ESTE ROTEIRO, E ISSO É DESENHO ─────────────────────────────────────────┐
 * │ O preparo ABRE a janela e ROLA até o rodapé, e para aí. Clicar no "Recusar" tiraria uma pessoa    │
 * │ de verdade da fila da homologação a cada rodada do detector de artigo velho, e detector que muda  │
 * │ o estado do ambiente que ele audita deixa de ser detector.                                       │
 * │                                                                                                │
 * │ A imagem da aba de recusadas não precisa disso: a homologação já tem pré-admissões recusadas      │
 * │ (medido em 28/09/2026: 7 linhas), então a lista está povoada sem ninguém recusar nada agora.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TELA MOSTRA GENTE NAS DUAS IMAGENS, ENTÃO AS DUAS SÃO RECORTADAS ─────────────────────────┐
 * │ A janela traz nome e CPF no alto; a aba de recusadas é uma tabela de nomes, CPFs e telefones. A  │
 * │ imagem 1 recorta o PAINEL do diálogo e a 2 recorta o CARTÃO DA TABELA, e o gate audita dentro da │
 * │ caixa (§A.6).                                                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BUSCA POR `999000` É O QUE DEIXA A ABA RECUSADAS SÓ COM A LINHA SINTÉTICA ───────────────┐
 * │ A aba Recusadas imprime a coluna "Recusado por", e quem recusou as recusas REAIS da homologação  │
 * │ foi o TIME: o print acusava `NOME_DE_USUARIO: usuario 04 homolog` (mais variações), e o achado    │
 * │ era VERDADEIRO. O diretor liberou o dado do CANDIDATO, não o do colega, então a denylist de       │
 * │ equipe fica de pé e o conserto é de RECORTE mais PREPARO, nunca de gate.                          │
 * │                                                                                                │
 * │ O arnês já plantou a linha que falta: uma pré-admissão recusada pela PRÓPRIA conta de captura     │
 * │ (CPF da família 999, autoria "Manual Do Sistema"), declarada em `tools/ajuda/allowlist-arnes.json`.│
 * │ A busca do topo casa CPF por pedaço, então digitar `999000` deixa a aba com essa linha e só ela,  │
 * │ e a coluna "Recusado por" passa a imprimir a conta sintética.                                     │
 * │                                                                                                │
 * │ A BUSCA VIVE NO PREPARO DA **IMAGEM**, NÃO DO ROTEIRO, e isso é desenho: a imagem 1 abre a janela │
 * │ de liberação a partir da fila de AGUARDANDO, que é outra lista. Filtrando o roteiro inteiro, o    │
 * │ filtro chegaria àquela fila também e o preparo da imagem 1 falharia por lista vazia.              │
 * │                                                                                                │
 * │ ELA NÃO MUDA O TEXTO DO ARTIGO (§A.43): o campo de busca mora FORA do cartão recortado, então não │
 * │ aparece no print, e digitar na busca é artefato de captura, não passo do manual.                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O "Recusar" É ALCANÇADO POR PAPEL MAIS NOME, e ele é único na tela. O "Cancelar" é escopado ao
 * diálogo pelo mesmo motivo dos seletores do roteiro irmão: nome curto casa em mais de um lugar.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { GestoDePreparo, Roteiro } from "../tipos";

/**
 * ─ O PRIMEIRO GESTO É UMA ESPERA, E ELA NÃO É SUPERSTIÇÃO ──────────────────────────────────────
 *
 * A casca autenticada renderiza "Carregando…" enquanto a sessão é resolvida (`app/(app)/layout.tsx`),
 * e nesse instante NENHUM campo da tela existe ainda. O motor espera 1200ms depois do `networkidle`;
 * quando a resolução passa disso, o primeiro gesto falha como "a tela mudou", que é a mensagem do
 * detector de artigo velho, e manda procurar defeito num roteiro que está certo.
 *
 * `main` existe nos DOIS estados (ele é quem escreve o "Carregando…"), então rolar até ele é a espera
 * mais barata que não pode falhar por ausência: ela vale os 600ms que o motor dá a cada gesto.
 * Medido em 28/09/2026, com dois roteiros deste lote falhando exatamente aí.
 */
const ESPERAR_A_CASCA: GestoDePreparo = { acao: "rolarAte", alvo: { seletor: "main", texto: "" } };

const CARTAO_DA_FILA = ".glass:has(table.ds-table)";
/** A busca do topo da Liberação, casada pelo rótulo acessível (o `type="search"` não é um textbox). */
const BUSCA = 'input[aria-label="Buscar por nome ou CPF"]';
const PAINEL_DO_DIALOGO = 'div[role="dialog"] .panel';

export const roteiro: Roteiro = {
  slug: "recusar-uma-admissao-na-liberacao",
  url: "/liberacao",
  preparo: [ESPERAR_A_CASCA],
  capturas: [
    {
      arquivo: "01-botao-recusar.png",
      legenda: "Passo 3: o rodapé da janela, com o Recusar separado do Liberar.",
      recorte: { seletor: PAINEL_DO_DIALOGO, texto: "" },
      preparo: [
        { acao: "clicar", alvo: { papel: "button", nome: /Liberar Admissão/, texto: "" } },
        { acao: "rolarAte", alvo: { papel: "button", nome: "Recusar", texto: "" } },
      ],
      alvos: [
        {
          papel: "button",
          nome: "Recusar",
          texto: "Tira a pessoa da fila",
          lado: "acima",
        },
        {
          seletor: `${PAINEL_DO_DIALOGO} button:text-is("Cancelar")`,
          texto: "Sai sem fazer nada",
          lado: "acima",
        },
      ],
    },
    {
      arquivo: "02-aba-recusadas.png",
      legenda: "Passo 5: a aba Admissões Recusadas, com quem recusou e quando.",
      recorte: { seletor: CARTAO_DA_FILA, texto: "" },
      preparo: [
        { acao: "abrirAba", alvo: { papel: "button", nome: /Admissões Recusadas/, texto: "" } },
        { acao: "digitar", alvo: { seletor: BUSCA, texto: "" }, valor: "999000" },
      ],
      alvos: [
        {
          seletor: 'th:has-text("Recusado por")',
          texto: "Quem recusou e quando",
          /**
           * ABAIXO, E O LADO FOI MEDIDO NOS TRÊS: com a busca do preparo a aba fica com UMA linha, e
           * o rótulo passa a disputar espaço com ela. ACIMA sai do recorte (o cabeçalho é o topo do
           * cartão) e o rótulo some, que é o pior dos três. DIREITA tapa o cabeçalho "Recusado em"
           * inteiro, e o outro rótulo já tapa o valor daquela coluna, então a coluna some das duas
           * pontas. ABAIXO deixa as duas colunas legíveis e cobre só o valor da célula, que é a
           * conta sintética de captura. *(Medido nos três prints, 28/09/2026.)*
           */
          lado: "abaixo",
        },
        {
          papel: "button",
          nome: "Ver",
          texto: "Abre o histórico e o Reativar",
          lado: "esquerda",
        },
      ],
    },
  ],
};
