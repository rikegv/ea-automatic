import { describe, expect, it } from "vitest";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  CODIGO,
  bancoDaRevisao,
  catalogoDaRevisao,
  escritaDaVaga,
  lerEmitidoDaVaga,
} from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F4, A VARREDURA NÃO TOCA A VAGA RECUSADA ───────────────────
 *
 * ÂNGULO COMPLEMENTAR ao spec do autor (`vaga-recusada-intocavel.tester.spec.ts`): ele cobriu a
 * REABERTURA (vaga fechada que volta às ativas). Aqui cubro o outro caminho da MESMA guarda: a vaga
 * recusada que NÃO está fechada (segue em revisão) e que a planilha traz como ABERTA com campos do
 * ATS diferentes. A guarda mora ANTES do cálculo da reabertura E antes do update de campos, então
 * nem reabertura nem refresh de campo podem desfazer a recusa. Só o botão humano devolve.
 *
 * §A.6: dado sintético. §A.11: sem travessão.
 */

const ID_DA_VAGA = "00000000-0000-4000-8000-0000000000bb";

const criarRepositorio = (db: never, catalogo: never): IngestaoRepositorio =>
  new IngestaoRepositorio(db, catalogo, null as never);

/** Roda `escreverVaga` sobre uma vaga recusada que está EM REVISÃO (não encerrada) e viva no ATS. */
async function rodarVagaRecusadaEmRevisao(recusadaEm: string | null) {
  const cat = catalogoDaRevisao();
  const banco = bancoDaRevisao([
    {
      quando: /select[\s\S]*from\s+vagas\s+v\b/,
      devolve: [
        {
          id: ID_DA_VAGA,
          status: CODIGO.pendenteRevisao, // NÃO fechada: segue na fila de revisão
          da_varredura: true,
          encerrou: false, // NÃO é cenário de reabertura
          status_antes: null,
          recusada_em: recusadaEm,
          cod_cliente: null,
        },
      ],
    },
    { quando: /update\s+vagas\b/, devolve: [{ id: ID_DA_VAGA }] },
  ]);
  await criarRepositorio(banco.db, cat.servico as never).escrever(escritaDaVaga(null));
  return lerEmitidoDaVaga(banco.consultas);
}

describe("QA F4: a varredura diante de uma vaga RECUSADA e ainda em revisão", () => {
  it("NÃO emite update e NÃO grava evento, mesmo com a vaga viva e a planilha ABERTA", async () => {
    const e = await rodarVagaRecusadaEmRevisao("2026-10-06T12:00:00.000Z");

    expect(
      e.update,
      "a varredura reescreveria campos de uma vaga que o consultor recusou",
    ).toBeNull();
    const tocaRecusa = e.consultas.some((c) => /recusada_em/.test(c) && /update\s+vagas/.test(c));
    expect(tocaRecusa, "só o botão devolver pode escrever em recusada_em").toBe(false);
    const gravouEvento = e.consultas.some((c) => /insert\s+into\s+as_vaga_status_eventos/.test(c));
    expect(gravouEvento, "a varredura não pode gerar evento de status numa vaga recusada").toBe(false);
  });

  it("CONTROLE: a MESMA vaga, sem a marca de recusa, é escrita normalmente pela varredura", async () => {
    const e = await rodarVagaRecusadaEmRevisao(null);

    expect(
      e.update,
      "a vaga NÃO recusada em revisão tem de receber o refresh normal: a guarda não é bloqueio geral",
    ).not.toBeNull();
  });
});
