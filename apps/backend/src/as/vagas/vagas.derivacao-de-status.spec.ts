import { describe, expect, it, vi } from "vitest";
import { asCandidaturas, asVagaStatusEventos, vagas } from "../../db/schema";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { derivarStatusDaVaga } from "./derivar-status-da-vaga";

/**
 * ─ A DERIVAÇÃO, MEDIDA NA ROTINA QUE GRAVA (Frente B da Central de Vagas, ponto 2) ──────────────
 *
 * A DECISÃO já está provada na função pura (`domain/vaga-status-derivado.spec.ts`). O que se mede
 * AQUI é o que só a rotina faz e o que ela pode errar sozinha:
 *   1. TRAVA a linha da vaga ANTES de qualquer leitura de funil (ela disputa a mesma linha que
 *      `fechar`, `cancelar`, `moverStatus` e a aprovação);
 *   2. GRAVA o status e o EVENTO da trilha na MESMA transação;
 *   3. SAI EM SILÊNCIO, sem custo, quando não há o que fazer (papel fora de alcance, manual);
 *   4. não deixa nada de pessoa na trilha (§A.6).
 *
 * O FAKE É O DOS VIZINHOS, reduzido ao que esta rotina toca: a vaga com memória, a lista de
 * candidaturas e as escritas observadas.
 */

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function makeTx(cenario: {
  status?: string;
  statusManualEm?: Date | null;
  comCliente?: boolean;
  semVaga?: boolean;
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    status: cenario.status ?? "ABERTA",
    statusManualEm: cenario.statusManualEm ?? null,
  };
  const escritas: Escrita[] = [];
  const ordem: string[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = () => b;
    b.for = (modo: string) => {
      ordem.push(modo === "update" ? "trava-vaga" : `for-${modo}`);
      return Promise.resolve(cenario.semVaga ? [] : [{ ...vaga }]);
    };
    b.limit = () => {
      if (tabela === asCandidaturas) ordem.push("le-funil");
      return Promise.resolve(tabela === asCandidaturas && cenario.comCliente ? [{ id: "c-1" }] : []);
    };
    return b;
  });

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async () => {
        escritas.push({ tabela, valores });
        ordem.push("grava-vaga");
        Object.assign(vaga, valores);
      },
    }),
    values: async (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores });
      ordem.push("grava-evento");
    },
  });

  const tx = { select, update: vi.fn(registrar), insert: vi.fn(registrar) };
  return { tx, vaga, escritas, ordem };
}

/** A régua do catálogo fingido, que é a semente COM os flags da Frente B já aplicados. */
const reguaFingida = () => catalogoDeStatusFingido().regua();

const ENTREGA = new Set(["ENTREVISTA_CLIENTE"]);

const naVaga = (e: Escrita[]) => e.filter((x) => x.tabela === vagas);
const naTrilha = (e: Escrita[]) => e.filter((x) => x.tabela === asVagaStatusEventos);

describe("a rotina de derivação grava o que a regra decidiu", () => {
  it("com gente na Entrevista Cliente, a vaga ABERTA vira ENTREGUE e a trilha registra", async () => {
    const { tx, vaga, escritas } = makeTx({ status: "ABERTA", comCliente: true });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");

    expect(vaga.status).toBe("ENTREGUE");
    expect(naVaga(escritas)).toHaveLength(1);
    expect(naTrilha(escritas)[0].valores).toMatchObject({
      vagaId: "vaga-1",
      de: "ABERTA",
      para: "ENTREGUE",
      porId: "user-1",
    });
  });

  it("sem mais ninguém com o cliente, a vaga ENTREGUE volta a ser ABERTA", async () => {
    const { tx, vaga, escritas } = makeTx({ status: "ENTREGUE", comCliente: false });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");

    expect(vaga.status).toBe("ABERTA");
    expect(naTrilha(escritas)[0].valores).toMatchObject({ de: "ENTREGUE", para: "ABERTA" });
  });

  /**
   * A ORDEM É A REGRA INTEIRA, e é a mesma das quatro portas de vaga: TRAVA, depois lê, depois
   * decide e grava. Ler o funil antes do lock decidiria sobre uma fotografia velha, e é exatamente
   * a corrida com `cancelar`/`fechar` que este `FOR UPDATE` existe para fechar.
   */
  it("TRAVA a linha da vaga ANTES de ler o funil, e grava depois das duas", async () => {
    const { tx, ordem } = makeTx({ status: "ABERTA", comCliente: true });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");
    expect(ordem).toEqual(["trava-vaga", "le-funil", "grava-vaga", "grava-evento"]);
  });

  it("o status já correto NÃO gera escrita nenhuma", async () => {
    const { tx, escritas } = makeTx({ status: "ABERTA", comCliente: false });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");
    expect(escritas).toHaveLength(0);
  });
});

describe("a derivação respeita o que não é dela", () => {
  /**
   * O PEGAJOSO, MEDIDO NA ROTINA: com o carimbo preenchido ela sai ANTES de ler o funil, e isso
   * importa além da corretude, porque é o que a impede de cobrar um `exists` por gesto numa vaga
   * cujo status o time já decidiu à mão.
   */
  it("com `status_manual_em` preenchido, não lê o funil e não grava nada", async () => {
    const { tx, escritas, ordem } = makeTx({
      status: "ABERTA",
      statusManualEm: new Date("2026-09-20T10:00:00.000Z"),
      comCliente: true,
    });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");

    expect(escritas).toHaveLength(0);
    expect(ordem).toEqual(["trava-vaga"]);
  });

  it.each(["RASCUNHO", "FECHADA", "CANCELADA", "PENDENTE_REVISAO"])(
    "a vaga %s não é tocada, e o funil nem é lido",
    async (status) => {
      const { tx, escritas, ordem } = makeTx({ status, comCliente: true });

      await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");

      expect(escritas).toHaveLength(0);
      expect(ordem).toEqual(["trava-vaga"]);
    },
  );

  /**
   * CATÁLOGO SEM ETAPA DE ENTREGA: a rotina NÃO emite `in ()` (SQL inválido em parte dos dialetos,
   * verdade acidental em outros) e cai no lado fail-closed, que é ABERTA.
   */
  it("sem etapa de entrega configurada, não consulta o funil e mantém ABERTA", async () => {
    const { tx, vaga, escritas } = makeTx({ status: "ABERTA", comCliente: true });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), new Set(), "user-1");

    expect(vaga.status).toBe("ABERTA");
    expect(escritas).toHaveLength(0);
  });

  // VAGA SUMIDA NÃO É ERRO DESTA ROTINA: o fato principal (o candidato se moveu) já foi gravado, e
  // transformar o EFEITO em exceção faria um movimento legítimo falhar pelo estado da vaga.
  it("vaga inexistente termina em silêncio, sem lançar", async () => {
    const { tx, escritas } = makeTx({ semVaga: true });

    await expect(
      derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1"),
    ).resolves.toBeUndefined();
    expect(escritas).toHaveLength(0);
  });
});

describe("§A.6: a trilha da derivação não carrega pessoa", () => {
  it("o evento leva id de vaga, dois códigos, um id de usuário INTERNO e uma frase de processo", async () => {
    const { tx, escritas } = makeTx({ status: "ABERTA", comCliente: true });

    await derivarStatusDaVaga(tx as never, "vaga-1", await reguaFingida(), ENTREGA, "user-1");

    const evento = naTrilha(escritas)[0].valores;
    expect(Object.keys(evento).sort()).toEqual(["de", "observacao", "para", "porId", "vagaId"]);
    expect(String(evento.observacao)).not.toContain("—");
  });
});
