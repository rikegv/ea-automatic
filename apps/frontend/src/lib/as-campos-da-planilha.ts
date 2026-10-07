import type { VagaCampoDaPlanilha } from "@ea/shared-types";

/**
 * ─ QUAIS CAMPOS DESTA VAGA VIERAM DA PLANILHA, E ESTÃO A CONFERIR ───────────────────────────────
 *
 * ┌─ O PROBLEMA QUE ISTO RESOLVE, e ele não é visual ────────────────────────────────────────────┐
 * │ O valor pré-preenchido pela planilha mora na MESMA coluna que uma pessoa teria digitado. Na   │
 * │ tela de liberação, então, "a planilha propôs" e "o time escolheu" ficam indistinguíveis: quem │
 * │ confere não sabe o que está conferindo, e carimba junto o que ninguém olhou.                   │
 * │                                                                                              │
 * │ A lista `camposVindosDaPlanilha` (contrato de `@ea/shared-types`) é o que fecha essa lacuna.  │
 * │ Ela DERIVA das colunas `vagas.*_origem` no servidor, e a edição humana do campo limpa a       │
 * │ origem dele, por campo: o campo que a pessoa trocou sai da lista na próxima leitura.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA FUNÇÃO NÃO ADIVINHA NADA. Em especial, ela NÃO infere procedência de "o campo veio vazio"
 * nem de estado de componente: o que a tela diz tem de ser o que o banco diz. Ausente ou nula, a
 * resposta é o conjunto VAZIO, e a tela fica exatamente como era antes desta frente.
 *
 * O FILTRO PELO VOCABULÁRIO FECHADO é deliberado: um valor desconhecido vindo do servidor (versão
 * mais nova do backend contra uma tela mais velha) é DESCARTADO em vez de virar marca sem rótulo.
 */

const VOCABULARIO: readonly VagaCampoDaPlanilha[] = [
  "natureza",
  "linhaServico",
  "cargo",
  "dataAbertura",
  "dataLimite",
];

const VAZIO: ReadonlySet<VagaCampoDaPlanilha> = new Set<VagaCampoDaPlanilha>();

/** O conjunto vazio compartilhado, para a tela não criar um `Set` novo a cada quadro. */
export const SEM_CAMPO_DA_PLANILHA = VAZIO;

export function camposDaPlanilha(
  vaga: { camposVindosDaPlanilha?: VagaCampoDaPlanilha[] | null } | null | undefined,
): ReadonlySet<VagaCampoDaPlanilha> {
  const lista = vaga?.camposVindosDaPlanilha;
  if (!Array.isArray(lista) || lista.length === 0) return VAZIO;
  const conhecidos = lista.filter((c): c is VagaCampoDaPlanilha =>
    (VOCABULARIO as readonly string[]).includes(c as string),
  );
  if (conhecidos.length === 0) return VAZIO;
  return new Set(conhecidos);
}
