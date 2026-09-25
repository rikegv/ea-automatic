import { portalLinks } from "../db/schema";

/**
 * AS COLUNAS QUE DECIDEM SE O LINK ESTÁ VIVO, EM UM LUGAR SÓ.
 *
 * ┌─ O FURO QUE ISTO FECHA, e ele é silencioso por construção ──────────────────────────────────┐
 * │ `estadoDaLinha` (`domain/portal-identidade.ts`) recebe a linha com TODOS os campos           │
 * │ OPCIONAIS, e compara com `!= null` de propósito: uma projeção que não peça `suspenso_ate`    │
 * │ devolve `undefined`, e a comparação estrita transformaria coluna ausente em portal fechado.  │
 * │ O preço dessa escolha é o inverso: COLUNA NÃO PROJETADA VIRA "SEM RESTRIÇÃO". Quem            │
 * │ acrescentar uma restrição nova (foi o caso do bloqueio manual) e esquecer UMA das projeções  │
 * │ deixa aquela porta ABERTA, e nada falha: o teste passa, o build passa, e a sessão viva        │
 * │ continua escrevendo com o link bloqueado.                                                     │
 * │                                                                                               │
 * │ Por isso a projeção é UMA constante, espalhada nas cinco leituras (identificação, emissão de │
 * │ credencial, confirmação do envio, leitura das pendências e o painel). A sexta porta, quando  │
 * │ nascer, nasce certa sem ninguém lembrar.                                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Quem precisa de mais (o `id`, o `admissao_id`, o `criado_em`) acrescenta NA CHAMADA, espalhando
 * esta constante primeiro. O que não se faz é remover um destes campos de uma leitura de estado.
 *
 * ┌─ O QUE NÃO ENTRA AQUI, E POR QUÊ (carimbo do envio, migration 0122) ────────────────────────┐
 * │ `enviado_em`, `envio_canal`, `envio_origem` e `enviado_por_id` FICARAM DE FORA de propósito. │
 * │ A régua desta constante não é "toda coluna nova de `portal_links`": é "toda coluna que       │
 * │ DECIDE se o link está vivo", ou seja, que entra na precedência REVOGADO > BLOQUEADO >        │
 * │ SUSPENSO > VENCIDO > VIVO de `estadoDaLinha`. Envio não fecha porta nenhuma: um link enviado │
 * │ e um link não enviado abrem exatamente igual, e link não enviado não é link morto (é o caso  │
 * │ de TODO link emitido antes desta frente, entregue à mão pelo consultor).                     │
 * │                                                                                               │
 * │ E O CUSTO DE ERRAR É ASSIMÉTRICO NOS DOIS SENTIDOS, que é o que torna a decisão firme:       │
 * │ esquecer uma restrição aqui deixa uma porta ABERTA em silêncio (o furo que esta constante    │
 * │ existe para fechar); mas pôr aqui algo que NÃO é restrição DILUI a afirmação que ela faz, e  │
 * │ a próxima pessoa passa a ler esta lista como "campos do link", não como "o que fecha a       │
 * │ porta". Aí a ausência de uma restrição de verdade deixa de saltar aos olhos.                 │
 * │                                                                                               │
 * │ Quem precisa do carimbo do envio (o Gerenciador do Portal, o serviço de envio) o pede NA     │
 * │ CHAMADA, como já se faz com o `id` e o `admissao_id`.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const COLUNAS_DO_LINK = {
  expiraEm: portalLinks.expiraEm,
  revogadoEm: portalLinks.revogadoEm,
  suspensoAte: portalLinks.suspensoAte,
  bloqueadoEm: portalLinks.bloqueadoEm,
} as const;
