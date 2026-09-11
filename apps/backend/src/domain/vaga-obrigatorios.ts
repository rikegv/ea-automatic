import {
  VAGA_OBRIGATORIOS,
  vagaPendencias,
  type VagaCamposObrigatorios,
  type VagaPendencia,
} from "@ea/shared-types";

/**
 * ─ A RÉGUA DOS OBRIGATÓRIOS DA VAGA, COM A LINHA DE SERVIÇO (Onda C) ───────────────────────────
 *
 * ┌─ POR QUE A LINHA NOVA ENTRA NA RÉGUA E NÃO NUM `if` DO SERVICE ───────────────────────────────┐
 * │ A régua é DECLARATIVA por desenho (`VAGA_OBRIGATORIOS`, no shared-types): a tela desenha o     │
 * │ asterisco a partir dela, lista as pendências a partir dela, e o servidor recusa a publicação a │
 * │ partir da MESMA lista. Um `if (!linhaServicoId) throw` no service seria a segunda régua, e as  │
 * │ duas divergiriam no primeiro ajuste, aparecendo como "a tela deixou publicar e o servidor      │
 * │ recusou", que é o pior dos dois mundos: o trabalho já feito e a mensagem chegando do lado      │
 * │ errado. Acrescentar um obrigatório continua sendo acrescentar UMA entrada numa lista.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, EM VEZ DE A ENTRADA IR DIRETO EM `VAGA_OBRIGATORIOS` ───────────┐
 * │ `packages/shared-types/src/index.ts` é ARQUIVO COMPARTILHADO, e nesta frente ele tem DONO      │
 * │ ÚNICO, o coordenador (§A.39: "dois agentes escrevendo o mesmo arquivo se sobrescrevem em       │
 * │ silêncio"). Então a entrada nasce AQUI, no backend, componível e testada, e a composição é     │
 * │ IDEMPOTENTE: no dia em que a linha entrar na lista do shared-types (para a tela desenhar o     │
 * │ asterisco a partir da mesma fonte), este arquivo NÃO passa a cobrar duas vezes, porque ele     │
 * │ confere se o campo já está lá antes de acrescentar. A migração daqui para lá é apagar este    │
 * │ arquivo e trocar a chamada de volta para `vagaPendencias`.                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * A ENTRADA DA LINHA DE SERVIÇO. `passo: 0` porque ela é perguntada na primeira tela da trilha, ao
 * lado de natureza e sazonalidade, que são as outras duas classificações da vaga. `ancora` é o id do
 * campo na tela, e é o que faz o item da lista de pendências ser CLICÁVEL.
 *
 * O ARTIGO É "a" para a frase sair em português: "falta a Linha de serviço".
 */
export const PENDENCIA_LINHA_SERVICO: VagaPendencia = {
  campo: "linhaServicoId",
  rotulo: "Linha de serviço",
  artigo: "a",
  passo: 0,
  passoRotulo: "A Vaga",
  ancora: "vaga-linha-servico",
};

/** O que a régua completa precisa ler: os campos de sempre mais a linha de serviço. */
export type VagaCamposObrigatoriosComLinha = VagaCamposObrigatorios & {
  linhaServicoId?: number | string | null;
};

/**
 * A RÉGUA INTEIRA, na ordem da trilha.
 *
 * A POSIÇÃO É LOGO DEPOIS DE `sazonalidade`, e não no fim: as pendências são lidas na ordem em que a
 * tela pergunta, e jogar a linha de serviço para depois de "Data de abertura" faria a lista saltar do
 * passo 2 de volta para o passo 1. Se um dia o shared-types passar a trazê-la, a posição de lá é que
 * vale, e esta função só devolve a lista dele.
 */
export function pendenciasDaVaga(v: VagaCamposObrigatoriosComLinha): VagaPendencia[] {
  const pendencias = vagaPendencias(v);

  // JÁ ESTÁ NA RÉGUA COMPARTILHADA? Então ela já cobrou (ou já deixou passar), e cobrar de novo aqui
  // listaria "falta a Linha de serviço" duas vezes na mesma mensagem.
  if (VAGA_OBRIGATORIOS.some((p) => p.campo === PENDENCIA_LINHA_SERVICO.campo)) return pendencias;

  const vazio =
    v.linhaServicoId === null ||
    v.linhaServicoId === undefined ||
    String(v.linhaServicoId).trim() === "";
  if (!vazio) return pendencias;

  // A INSERÇÃO É POSICIONAL, ancorada no campo que a precede na tela. Se `sazonalidade` não estiver
  // pendente (o caso comum: ela tem valor padrão), a linha entra logo depois do último item do passo
  // 0 que estiver na lista, e no limite no começo, que continua sendo a ordem da trilha.
  const depoisDe = pendencias.findIndex((p) => p.campo === "sazonalidade");
  const ultimoDoPasso0 = pendencias.reduce((i, p, idx) => (p.passo === 0 ? idx : i), -1);
  const alvo = (depoisDe >= 0 ? depoisDe : ultimoDoPasso0) + 1;
  return [...pendencias.slice(0, alvo), PENDENCIA_LINHA_SERVICO, ...pendencias.slice(alvo)];
}
