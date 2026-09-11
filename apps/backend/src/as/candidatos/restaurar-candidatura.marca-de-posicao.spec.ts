import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { POSICAO_LADOS } from "@ea/shared-types";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { restaurarCandidatura } from "./restaurar-candidatura";

/**
 * ─ A MARCA DE POSIÇÃO NA VOLTA: QUEM VOLTA EM SELEÇÃO NÃO OCUPA NADA ──────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita pelo `tester` junto com a construção (§A.40 regra 2).
 *
 * ┌─ O DEFEITO QUE ESTE ARQUIVO FECHA, e ele é do tipo que não falha nunca ─────────────────────┐
 * │ `restaurarCandidatura` escrevia `posicaoLado` SÓ quando a volta era `ALOCADO`, e deixava a    │
 * │ coluna INTACTA quando a volta era `ATIVO`. Intacta quer dizer com o lado que a pessoa tinha   │
 * │ ANTES de sair: quem estava no BANCO volta EM SELEÇÃO carregando `posicaoLado = "BANCO"`.      │
 * │                                                                                              │
 * │ POR QUE ISSO É CARO: a ocupação é DERIVADA da situação, então a marca pendurada não conta     │
 * │ posição HOJE, e é exatamente por isso que ninguém percebe. Ela conta no dia seguinte: o       │
 * │ caminho travado lê `posicao?.lado ?? ladoDaCandidatura(c.posicaoLado)`, então o próximo       │
 * │ avanço dessa pessoa (aprovar, enviar para a esteira) sai do lado BANCO sem ninguém ter        │
 * │ escolhido banco nenhum, e é medido contra a meta de banco. A vaga entrega no lado errado, e   │
 * │ a decisão que levou a isso foi tomada por uma coluna que sobrou de um processo encerrado.     │
 * │                                                                                              │
 * │ NÃO ESCREVER NÃO É NEUTRO. O comentário antigo dizia que "não escrever é a única resposta     │
 * │ que não inventa nem destrói", e isso está certo sobre a MEMÓRIA e errado sobre o ESTADO: a    │
 * │ memória de onde a pessoa esteve vive no EVENTO da saída (`posicao_lado_origem`), que não é    │
 * │ tocado aqui. A coluna da candidatura é estado vivo, e estado vivo herdado é o defeito.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ UMA CORREÇÃO DO MEU PRÓPRIO COMENTÁRIO, medida na onda seguinte ───────────────────────────
 * Estava escrito aqui que `undefined` de chave ausente "passa por `toBeNull()`". ESTÁ ERRADO, e eu
 * mesmo tinha a medição na mão: ao rodar esta suíte contra o módulo de antes, a falha saiu como
 * `expected undefined to be null`, ou seja, o `toBeNull()` PEGA. Deixar a frase errada aqui seria
 * ensinar uma régua falsa a quem ler depois, que é a mesma falha que este arquivo documenta.
 *
 * O `"posicaoLado" in set` CONTINUA VALENDO, por outro motivo: ele separa "a chave não foi escrita"
 * de "a chave foi escrita como nula", que são dois BUGS DIFERENTES com a mesma aparência, e faz a
 * mensagem de falha dizer qual dos dois é.
 *
 * §A.6: ids internos, um lado do vocabulário e uma frase de processo. Nada de pessoa.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * O EXECUTOR FINGIDO. Ele é mínimo de propósito: este módulo faz exatamente duas escritas (o
 * `update` da candidatura e o `insert` do evento), e um dublê maior só esconderia qual das duas o
 * teste está afirmando.
 */
function txFingido(opcoes: { afetou?: boolean } = {}) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const tx = {
    /*
     * O `set` REGISTRA E SEGUE: é ele que carrega a régua que este arquivo afirma, e o encadeamento
     * do drizzle (`set(...).where(...).returning()`) precisa continuar existindo depois dele.
     */
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        return {
          where: () => ({
            returning: async () => (opcoes.afetou === false ? [] : [{ id: "cand-1" }]),
          }),
        };
      },
    })),
    insert: vi.fn((tabela: unknown) => ({
      values: async (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
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

describe("a volta EM SELEÇÃO limpa a marca de posição", () => {
  /**
   * O LAÇO PERCORRE OS DOIS LADOS, derivados do vocabulário e nunca digitados: o dia em que existir
   * um terceiro lado, ele entra nesta cobertura sozinho, que é o oposto do que aconteceu com o
   * `BANCO` quando ele foi criado.
   */
  for (const lado of POSICAO_LADOS) {
    it(`quem saiu do lado ${lado} e volta EM SELEÇÃO tem a marca gravada como NULA`, async () => {
      const { tx, updates } = txFingido();

      await restaurarCandidatura(
        tx as never,
        alvo({ situacao: "ATIVO", posicaoLadoOrigem: lado }),
        TRILHA,
      );

      const set = doSet(updates);
      // A CHAVE PRECISA EXISTIR: omiti-la deixa a coluna com o lado antigo no banco, e é isso que o
      // código de antes fazia. `undefined` de chave ausente enganaria um `toBeNull()` sozinho.
      expect("posicaoLado" in set).toBe(true);
      expect(set.posicaoLado).toBeNull();
    });
  }

  it("quem já não tinha lado nenhum continua sem lado, sem inventar OFICIAL", async () => {
    const { tx, updates } = txFingido();

    await restaurarCandidatura(
      tx as never,
      alvo({ situacao: "ATIVO", posicaoLadoOrigem: null }),
      TRILHA,
    );

    expect(doSet(updates).posicaoLado).toBeNull();
  });
});

describe("a volta ALOCADO mantém o lado de origem", () => {
  /**
   * O CONTRAPESO, e sem ele a correção vira estrago: quem volta ALOCADO OCUPA posição, e ocupar sem
   * lado seria dobrado em OFICIAL pelo domínio (`ladoDaCandidatura` dobra o nulo). Uma vaga que
   * cancelou com gente no BANCO veria a reserva inteira voltar contra a meta OFICIAL.
   */
  for (const lado of POSICAO_LADOS) {
    it(`quem volta ALOCADO do lado ${lado} volta para o MESMO lado`, async () => {
      const { tx, updates } = txFingido();

      await restaurarCandidatura(
        tx as never,
        alvo({ situacao: "ALOCADO", posicaoLadoOrigem: lado }),
        TRILHA,
      );

      expect(doSet(updates).posicaoLado).toBe(lado);
    });
  }

  /**
   * ALOCADO SEM ORIGEM GRAVADA continua nulo, e NÃO vira `OFICIAL` por conveniência. O `?? "OFICIAL"`
   * que o comentário do módulo proíbe em letras maiúsculas é o que transformaria "não sei de onde
   * ela veio" em "ela veio da meta oficial", que é um fato inventado sobre a entrega de uma vaga.
   */
  it("ALOCADO sem origem gravada volta com a marca nula, nunca com OFICIAL de consolo", async () => {
    const { tx, updates } = txFingido();

    await restaurarCandidatura(
      tx as never,
      alvo({ situacao: "ALOCADO", posicaoLadoOrigem: null }),
      TRILHA,
    );

    expect(doSet(updates).posicaoLado).toBeNull();
  });
});

describe("o resto da volta não muda por causa da marca", () => {
  /**
   * A GUARDA DE "QUEM ESTÁ VIVO NÃO VOLTA" continua sendo a primeira coisa que acontece. Ela vem
   * ANTES de qualquer escrita, e é isso que impede um APROVADO de virar ATIVO (apagando uma
   * aprovação de verdade e devolvendo a posição dele ao cilindro).
   */
  it("recusa restaurar quem está VIVO, e não escreve nada antes de recusar", async () => {
    const { tx, updates, inserts } = txFingido();

    await expect(
      restaurarCandidatura(tx as never, alvo({ situacaoAtual: "APROVADO" }), TRILHA),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  /** O motivo do descarte some na volta, senão a pessoa fica viva explicando um desfecho vencido. */
  it("o motivo do descarte vai a nulo na mesma gravação", async () => {
    const { tx, updates } = txFingido();

    await restaurarCandidatura(tx as never, alvo({ situacao: "ATIVO" }), TRILHA);

    expect(doSet(updates).motivoDescarte).toBeNull();
  });

  /**
   * O EVENTO DA VOLTA GRAVA `situacao` NULA, e esta é a parte que não se pode trocar: o tipo do
   * evento é derivado de `situacao` preenchida, então gravar `ATIVO` faria a linha do tempo mostrar
   * a VOLTA como mais um encerramento, logo depois do encerramento de verdade.
   */
  it("o evento da volta não é um desfecho: situação nula e etapa de destino", async () => {
    const { tx, inserts } = txFingido();

    await restaurarCandidatura(
      tx as never,
      alvo({ situacao: "ATIVO", etapaDestino: "CAPTACAO" as never }),
      TRILHA,
    );

    const evento = inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};
    expect(evento.situacao).toBeNull();
    expect(evento.etapaDe).toBeNull();
    expect(evento.etapaPara).toBe("CAPTACAO");
  });

  /**
   * NENHUMA LINHA AFETADA É RECUSA, e não no-op: alguém mexeu na candidatura entre a leitura e a
   * escrita. No-op devolveria sucesso com a pessoa ainda descartada, e a tela diria que ela voltou.
   */
  it("recusa quando o update não alcança linha nenhuma", async () => {
    const { tx } = txFingido({ afetou: false });

    await expect(
      restaurarCandidatura(tx as never, alvo({ situacao: "ATIVO" }), TRILHA),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
