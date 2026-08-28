import type { CandidaturaEtapa, CandidaturaSituacao } from "@ea/shared-types";

/**
 * A RÉGUA DO HISTÓRICO DE ETAPAS (A&S, bug 1 da validação do diretor).
 *
 * Funções PURAS, no mesmo espírito de `domain/candidatura.ts`: o service sabe falar com o banco, a
 * régua é destas linhas, e o teste afirma sobre elas sem HTTP e sem Postgres.
 *
 * ┌─ O QUE ESTE ARQUIVO EXISTE PARA GARANTIR ───────────────────────────────────────────────────┐
 * │ O TIPO DO EVENTO É DERIVADO, e nunca guardado. A tabela tem `etapaDe` e `situacao`, e o tipo │
 * │ sai da combinação dos dois. Uma coluna `tipo` seria um terceiro dado capaz de discordar dos  │
 * │ outros dois (uma linha marcada MOVIMENTO com `situacao` preenchida), e é a mesma recusa que o │
 * │ módulo já faz ao derivar a ocupação da vaga em vez de guardar um contador.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type TipoEventoHistorico = "ENTRADA" | "MOVIMENTO" | "TROCA_VAGA" | "DESFECHO";

/** A forma mínima que a derivação precisa. Genérica para o service passar as linhas dele inteiras. */
export interface EventoHistorico {
  etapaDe: CandidaturaEtapa | null;
  etapaPara: CandidaturaEtapa;
  situacao: CandidaturaSituacao | null;
  /** Preenchida só na TROCA DE VAGA. É `vagaPara` que marca o evento como troca. */
  vagaDe?: string | null;
  vagaPara?: string | null;
}

/**
 * QUE TIPO DE EVENTO É ESTE?
 *
 * A ORDEM DOS TESTES É A REGRA. `situacao` preenchida vence SEMPRE: um desfecho registrado junto com
 * um movimento (a pessoa foi movida e descartada no mesmo gesto) é, para quem lê a linha do tempo,
 * um desfecho. Testar `etapaDe` primeiro classificaria esse caso como movimento e a saída sumiria da
 * leitura, que é o defeito que esta função existe para não ter.
 */
export function tipoDoEvento(e: EventoHistorico): TipoEventoHistorico {
  if (e.situacao !== null) return "DESFECHO";
  /*
   * A TROCA VEM ANTES DA ENTRADA, e essa ordem é a regra. A troca NÃO MEXE NA ETAPA (é a garantia
   * central da operação), então ela grava `etapaDe` nula, exatamente como a entrada. Testar a
   * entrada primeiro classificaria toda troca de vaga como "nasceu aqui", e o rastro que o diretor
   * pediu apareceria na ficha como uma segunda entrada, dizendo o oposto do que aconteceu.
   */
  if (e.vagaPara != null) return "TROCA_VAGA";
  if (e.etapaDe === null) return "ENTRADA";
  return "MOVIMENTO";
}

/** O evento encerra o processo? Só o desfecho encerra; entrada e movimento acontecem dentro dele. */
export function eventoEncerra(e: EventoHistorico): boolean {
  return tipoDoEvento(e) === "DESFECHO";
}

/**
 * A LINHA DO TEMPO EM ORDEM CRONOLÓGICA, do mais antigo para o mais novo.
 *
 * DO ANTIGO PARA O NOVO de propósito, ao contrário do histórico de contato: contato se lê "o que
 * houve por último", e caminho se lê "por onde a pessoa passou", que é uma narrativa e só faz
 * sentido do começo. É a mesma leitura que a Esteira faz das frentes.
 *
 * ORDEM EXPLÍCITA, e não "a ordem que veio do banco": depender do `order by` da consulta faz a
 * resposta mudar quando alguém mexer nela, e esta função é usada pelo teste justamente para afirmar
 * a ordem.
 *
 * EMPATE DESEMPATA PELO TIPO, e o desfecho vai por último: alocar e descartar no mesmo segundo (o
 * carimbo tem resolução de milissegundo, e a semente do backfill usa o `alocado_em`) mostraria a
 * saída antes da entrada em metade dos casos, o que lê como se a pessoa tivesse saído antes de
 * entrar.
 */
/*
 * A TROCA PESA COMO MOVIMENTO no desempate: as duas acontecem DENTRO do processo, e nenhuma delas
 * pode aparecer antes da entrada nem depois do desfecho quando o carimbo empata.
 */
const PESO: Record<TipoEventoHistorico, number> = {
  ENTRADA: 0,
  MOVIMENTO: 1,
  TROCA_VAGA: 1,
  DESFECHO: 2,
};

export function ordenarLinhaDoTempo<T extends EventoHistorico & { ocorridoEm: Date | string }>(
  eventos: readonly T[],
): T[] {
  return [...eventos].sort((a, b) => {
    const d = instante(a.ocorridoEm) - instante(b.ocorridoEm);
    if (d !== 0) return d;
    return PESO[tipoDoEvento(a)] - PESO[tipoDoEvento(b)];
  });
}

function instante(v: Date | string): number {
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * AS ETAPAS POR ONDE ESTA CANDIDATURA PASSOU, sem repetir, na ordem em que aconteceram.
 *
 * É a resposta à pergunta do diretor ("por onde ele passou: triagem, entrevista cliente, testes"),
 * e ela sai do histórico, não da coluna `etapa` da candidatura, que guarda só o retrato final.
 *
 * O DESFECHO ENTRA COM A ETAPA EM QUE ACONTECEU, e é isso que faz "descartado na Triagem" ser
 * legível: a Triagem consta no caminho mesmo que a pessoa tenha sido descartada assim que chegou
 * nela.
 */
export function etapasPercorridas<T extends EventoHistorico & { ocorridoEm: Date | string }>(
  eventos: readonly T[],
): CandidaturaEtapa[] {
  const vistas: CandidaturaEtapa[] = [];
  for (const e of ordenarLinhaDoTempo(eventos)) {
    if (!vistas.includes(e.etapaPara)) vistas.push(e.etapaPara);
  }
  return vistas;
}
