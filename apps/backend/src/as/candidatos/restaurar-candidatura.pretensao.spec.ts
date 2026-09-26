import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { asCandidaturas } from "../../db/schema";
import { gravarSaidaDaCandidatura } from "./encerrar-candidatura";
import { restaurarCandidatura } from "./restaurar-candidatura";

/**
 * ─ A VOLTA LIMPA A PRETENSÃO SALARIAL (veto do `seguranca` sobre a Frente E, §A.6) ──────────────
 *
 * ┌─ O ESTADO QUE ESTE ARQUIVO IMPEDE, e ele não falhava nunca ──────────────────────────────────┐
 * │ `gravarSaidaDaCandidatura` passou a escrever `motivo_descarte` E `pretensao_salarial` no      │
 * │ MESMO `set`. A porta da volta limpava só o primeiro, então a candidatura restaurada voltava   │
 * │ VIVA, sem motivo e COM o valor: quanto a pessoa pediu, órfão do motivo que autorizou pedir.   │
 * │                                                                                               │
 * │ É EXATAMENTE O PAR QUE A RÉGUA DA ESCRITA DEVOLVE 400 PARA IMPEDIR                            │
 * │ (`exigirPretensaoQuandoOMotivoPede`: motivo que não pede + valor presente = recusa), alcançado│
 * │ por outra porta. E ele quebra a invariante escrita no contrato compartilhado: "só a           │
 * │ candidatura DESCARTADA por um motivo marcado `pedePretensao` tem valor aqui".                  │
 * │                                                                                               │
 * │ A SUPERFÍCIE JÁ ESTAVA ABERTA: `AsCandidaturaItem` carrega o campo, e ele desce no painel da  │
 * │ vaga e na lista de transferíveis de QUALQUER outra vaga, que são leituras de candidatura      │
 * │ VIVA. O frontend ainda não o lê; a API já o entrega.                                           │
 * │                                                                                               │
 * │ O CAMINHO É ALCANÇÁVEL, e não hipótese: a reabertura SEM ORIGEM põe na lista do Master TODOS  │
 * │ os `DESCARTADO` da vaga, inclusive quem saiu pelo motivo que pede a pretensão.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O SEGUNDO BLOCO É O QUE IMPEDE A REINCIDÊNCIA, E ELE É O MAIS IMPORTANTE ───────────────────┐
 * │ O caso de cima afirma UM campo, e a próxima coluna que a SAÍDA passar a escrever repetirá o   │
 * │ defeito inteiro sem ficar vermelha. O segundo bloco não olha campo nenhum pelo nome: ele      │
 * │ EXECUTA as duas portas e exige que tudo o que a saída escreve na candidatura seja endereçado  │
 * │ pela volta. É a mesma régua da D1 estrutural do expurgo, aplicada à simetria saída/volta.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids internos, um valor monetário inventado e frases de processo. Nada de pessoa, e nada
 * logado.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** O executor fingido, no molde do `restaurar-candidatura.marca-de-posicao.spec`: duas escritas. */
function txFingido() {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const tx = {
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        return {
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          where: () => ({
            then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
            returning: async () => [{ id: "cand-1" }],
          }),
        };
      },
    })),
    insert: vi.fn(() => ({
      values: async (valores: Record<string, unknown>) => {
        inserts.push({ tabela: null, valores });
      },
    })),
  };

  return { tx, updates, inserts };
}

const TRILHA = {
  motivo: "Vaga reaberta: as candidaturas encerradas pelo cancelamento voltaram.",
  porId: "user-master",
  vagaStatusEventoId: "evt-1",
};

function alvo(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    situacaoAtual: "DESCARTADO" as const,
    etapaDestino: "TRIAGEM" as never,
    situacao: "ATIVO" as const,
    posicaoLadoOrigem: null,
    ...over,
  };
}

const doSet = (updates: Escrita[]) =>
  (updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {}) as Record<string, unknown>;

describe("1. a candidatura restaurada NÃO carrega a pretensão salarial", () => {
  it("a chave é escrita, e é escrita como NULA", async () => {
    const { tx, updates } = txFingido();

    await restaurarCandidatura(tx as never, alvo(), TRILHA);

    const set = doSet(updates);
    /*
     * A CHAVE PRECISA EXISTIR, e o teste separa os dois defeitos de propósito: chave AUSENTE deixa
     * o valor no banco (era o defeito), chave NULA o apaga. Os dois têm a mesma aparência num
     * `toBeNull()` sozinho, e mensagens de falha diferentes com esta separação.
     */
    expect("pretensaoSalarial" in set).toBe(true);
    expect(set.pretensaoSalarial).toBeNull();
  });

  /**
   * A LIMPEZA VALE PARA AS DUAS VOLTAS. Quem volta `ALOCADO` (a reabertura COM origem) também não
   * pode carregar o valor: a candidatura está viva, e a régua do contrato não distingue em qual
   * situação viva ela voltou.
   */
  it.each(["ATIVO", "ALOCADO"] as const)("vale para quem volta %s", async (situacao) => {
    const { tx, updates } = txFingido();

    await restaurarCandidatura(tx as never, alvo({ situacao }), TRILHA);

    expect(doSet(updates).pretensaoSalarial).toBeNull();
  });

  /**
   * NENHUM FATO SE PERDE, e este é o par obrigatório dos casos acima: uma limpeza que apagasse o
   * histórico junto seria pior do que o defeito. O EVENTO da volta é gravado, e o evento da SAÍDA
   * (que guarda o motivo daquele desfecho) não é tocado por esta função em momento nenhum.
   */
  it("a volta grava o evento do histórico e não reescreve evento nenhum", async () => {
    const { tx, updates, inserts } = txFingido();

    await restaurarCandidatura(tx as never, alvo(), TRILHA);

    expect(inserts).toHaveLength(1);
    expect(updates.filter((u) => u.tabela === asCandidaturas)).toHaveLength(1);
  });
});

describe("2. a simetria saída/volta, medida em vez de confiada", () => {
  /**
   * ─ O CASO QUE PEGA A **PRÓXIMA** COLUNA, E NÃO ESTA ───────────────────────────────────────────
   *
   * Ele executa as duas portas de verdade e compara os conjuntos de CHAVES escritas na candidatura.
   * Toda chave que a SAÍDA escreve tem de ser endereçada pela VOLTA, com o nome que tiver.
   *
   * `atualizado_em` FICA DE FORA, e é a única exceção: ele é carimbo de relógio, escrito pelas duas
   * por natureza, e não descreve desfecho nenhum.
   *
   * POR QUE ISSO É MAIS FORTE DO QUE LISTAR OS CAMPOS: o defeito que o `seguranca` achou nasceu
   * porque uma coluna NOVA entrou na saída e ninguém olhou a volta. Uma lista escrita à mão aqui
   * teria o mesmo problema: ela não conheceria a coluna de amanhã.
   */
  it("tudo o que a SAÍDA escreve na candidatura é endereçado pela VOLTA", async () => {
    const saida = txFingido();
    await gravarSaidaDaCandidatura(
      saida.tx as never,
      { id: "cand-1", etapa: "TRIAGEM" as never, situacao: "ATIVO", posicaoLado: "OFICIAL" },
      "DESCARTADO",
      "Motivo qualquer",
      "user-1",
      null,
      // COM a pretensão: é o corpo MÁXIMO que a saída escreve, e é ele que revela o conjunto
      // completo de chaves. Sem o valor, a chave nem apareceria no `set`.
      "2500.00",
    );

    const volta = txFingido();
    await restaurarCandidatura(volta.tx as never, alvo(), TRILHA);

    const chavesDaSaida = Object.keys(doSet(saida.updates)).filter((k) => k !== "atualizadoEm");
    const chavesDaVolta = new Set(Object.keys(doSet(volta.updates)));

    expect(chavesDaSaida.length, "a saída precisa escrever algo, senão o caso é vazio").toBeGreaterThan(0);
    expect(
      chavesDaSaida.filter((k) => !chavesDaVolta.has(k)),
      "a SAÍDA escreve um campo que a VOLTA não limpa: a candidatura volta VIVA carregando dado de um desfecho que não vale mais (§A.6)",
    ).toEqual([]);
  });
});
