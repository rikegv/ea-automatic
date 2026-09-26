/**
 * ─ A MARCAÇÃO POR CAMPO DA TRILHA DA VAGA (frente F, ponto 16) ─────────────────────────────────
 *
 * ┌─ O QUE FALTAVA NA REVISÃO DE VAGA, e o que NÃO faltava ─────────────────────────────────────┐
 * │ A lista de pendências no topo JÁ EXISTE, clicável, e salta para o campo. O que não existia é │
 * │ a marcação NO PRÓPRIO CAMPO: quem rolava a trilha via 38 campos iguais e tinha de voltar ao  │
 * │ topo para lembrar quais dos onze obrigatórios ainda estavam vazios.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A RÉGUA É UMA SÓ, E É ESTE O PONTO INTEIRO DO ARQUIVO ────────────────────────────────────┐
 * │ A marcação NÃO recalcula "este campo está vazio?". Ela recebe a MESMA lista que a lista do  │
 * │ topo desenha (`pendenciasComLinhaDeServico`, sobre o formulário em memória) e só pergunta se │
 * │ a âncora daquele campo está nela. Uma segunda régua divergiria no primeiro campo com         │
 * │ condição própria (o `posicoesOficiais`, que trata zero como vazio) e a tela passaria a dizer  │
 * │ duas coisas diferentes sobre o mesmo campo, na mesma tela, que é o defeito que a casa já     │
 * │ pagou na coluna de pendências do Gerenciador.                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O UNIVERSO DOS OBRIGATÓRIOS TAMBÉM VEM DA FONTE ÚNICA (`VAGA_OBRIGATORIOS` mais a linha de
 * serviço, exatamente a composição que a régua usa). Sem ele, um campo marcado `obrigatorio` no JSX
 * e AUSENTE da régua nasceria "Preenchido" para sempre, porque nunca apareceria na lista de
 * pendências: seria um campo verde que o servidor recusa. Fora do universo, a função não marca nada.
 *
 * Funções PURAS, sem React e sem rede, no padrão do `lib/` da casa (`as-vaga-marcacao.spec.ts`).
 *
 * §A.6: entram âncoras de campo e nomes de campo. Nenhum dado pessoal atravessa este módulo.
 */

import { VAGA_OBRIGATORIOS, type VagaPendencia } from "@ea/shared-types";
import { PENDENCIA_LINHA_SERVICO } from "@/lib/as-linhas-servico";

/** O estado de um campo obrigatório na tela. `null` é campo que a régua não cobra. */
export type MarcacaoCampo = "pendente" | "preenchido" | null;

/**
 * AS ÂNCORAS QUE A RÉGUA COBRA, montadas da MESMA composição de `pendenciasComLinhaDeServico`: a
 * lista do shared-types mais a linha de serviço, e esta última só enquanto ela ainda não subiu para
 * lá (a composição é idempotente, então o dia em que subir não duplica nada aqui também).
 */
export function ancorasObrigatorias(): Set<string> {
  const ancoras = new Set(VAGA_OBRIGATORIOS.map((p) => p.ancora));
  ancoras.add(PENDENCIA_LINHA_SERVICO.ancora);
  return ancoras;
}

/**
 * A MARCAÇÃO DE UM CAMPO, a partir da âncora dele e da lista de pendências JÁ CALCULADA.
 *
 * PENDENTE quando a âncora está na lista; PREENCHIDO quando ela é da régua e não está na lista;
 * nada quando o campo não é cobrado (o `id` sem obrigatório, ou um campo que a régua não conhece).
 *
 * `ancora` AUSENTE devolve `null` em vez de "preenchido": campo sem âncora é campo que a lista do
 * topo não consegue apontar, e marcá-lo de verde afirmaria algo que ninguém verificou.
 */
export function marcacaoDoCampo(
  ancora: string | undefined,
  pendentes: readonly VagaPendencia[],
  universo: ReadonlySet<string> = ancorasObrigatorias(),
): MarcacaoCampo {
  if (!ancora || !universo.has(ancora)) return null;
  return pendentes.some((p) => p.ancora === ancora) ? "pendente" : "preenchido";
}
