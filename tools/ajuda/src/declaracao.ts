/**
 * ─ ARNÊS NÃO DECLARADO É UM DIAGNÓSTICO PRÓPRIO, E NÃO "BASE SUJA" ─────────────────────────────
 *
 * O gate recusa allowlist vazia (fail-closed: é o dia em que o arnês falhou, e falhar aberto
 * justamente nesse dia é o pior momento possível). A consequência prática é que, SEM a declaração do
 * arnês, TODA linha da base é recusada e a contagem da conferência vira o total da tabela.
 *
 * Medido em 27/09/2026: sem declaração, 2.726 de 2.726 linhas "fora do padrão"; com uma declaração
 * mínima, 11 (2 candidatos e 9 usuários). O número honesto é 11, e um relatório que diga 2.726
 * manda a pessoa anonimizar uma base que já está quase toda anonimizada. Por isso a ausência da
 * declaração é dita com o nome dela, ANTES da conferência.
 */
import { FalhaDeMotor, lerDeclaracaoDoArnes } from "./ambiente";
import type { DeclaracaoDoArnes } from "./allowlist";

export function exigirDeclaracaoDoArnes(): DeclaracaoDoArnes {
  const declaracao = lerDeclaracaoDoArnes();
  const temConteudo =
    (declaracao.nomes?.length ?? 0) > 0 ||
    (declaracao.cpfs?.length ?? 0) > 0 ||
    (declaracao.emails?.length ?? 0) > 0;
  if (!temConteudo) {
    throw new FalhaDeMotor(
      `ARNÊS DO MANUAL NÃO DECLARADO (tools/ajuda/allowlist-arnes.json ausente ou vazio).\n` +
        `  O gate é fail-closed: sem a lista do que é sintético, ele recusa TUDO, e a conferência ` +
        `da base passa a acusar a tabela inteira em vez das linhas que realmente têm gente.\n` +
        `  Quem escreve esse arquivo é o arnês do manual (backend). Sem ele, nenhuma captura roda.`,
    );
  }
  return declaracao;
}
