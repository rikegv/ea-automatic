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
 * ─ F4: A VAGA RECUSADA É INTOCÁVEL PELA VARREDURA (decisão 6 do diretor, §A.38) ────────────────
 *
 * PROVA da trava mais fácil de violar desta frente: a vaga que o consultor RECUSOU
 * (`vagas.recusada_em` não nula) não pode ser recriada, reaberta nem tirada da recusa pela
 * varredura, MESMO que a planilha a traga como ABERTA (o gate de entrada a deixou passar até o
 * repositório). Só o botão "devolver" (humano) tira da recusa.
 *
 * O cenário mais perigoso é a REABERTURA: a vaga que a varredura fechou volta às ativas do ATS e,
 * sem a guarda, seria republicada no status anterior, desfazendo a recusa de 30 em 30 minutos, sem
 * autor e sem trilha. A guarda mora em `escreverVaga`, ANTES do cálculo da reabertura.
 *
 * §A.6: dado sintético. §A.11: sem travessão.
 */

const criarRepositorio = (db: never, catalogo: never): IngestaoRepositorio =>
  new IngestaoRepositorio(db, catalogo, null as never);

const ID_DA_VAGA = "00000000-0000-4000-8000-0000000000aa";

/**
 * Roda `escreverVaga` com a vaga já ENCERRADA PELA VARREDURA e de volta às ativas, variando só a
 * marca de recusa. É o cenário de reabertura do `rodarReabertura`, mas com `recusada_em` na linha.
 */
async function rodarVoltaDaVaga(recusadaEm: string | null) {
  const cat = catalogoDaRevisao();
  const banco = bancoDaRevisao([
    {
      quando: /select[\s\S]*from\s+vagas\s+v\b/,
      devolve: [
        {
          id: ID_DA_VAGA,
          status: CODIGO.fechamento,
          da_varredura: true,
          encerrou: true,
          status_antes: CODIGO.pendenteRevisao,
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

describe("a varredura diante de uma vaga RECUSADA", () => {
  it("NÃO reabre, NÃO muda status e NÃO toca a marca de recusa (vaga recusada e encerrada volta às ativas)", async () => {
    const e = await rodarVoltaDaVaga("2026-10-06T12:00:00.000Z");

    expect(
      e.update,
      "a varredura emitiu `update vagas` sobre uma vaga recusada: ela reabriria/reescreveria a vaga que o consultor recusou",
    ).toBeNull();
    const tocaRecusa = e.consultas.some((c) => /recusada_em/.test(c) && /update\s+vagas/.test(c));
    expect(tocaRecusa, "a varredura escreveu em `recusada_em`: só o botão devolver pode").toBe(false);
    const gravouEvento = e.consultas.some((c) => /insert\s+into\s+as_vaga_status_eventos/.test(c));
    expect(gravouEvento, "a varredura gravou evento de reabertura numa vaga recusada").toBe(false);
  });

  it("REABRE normalmente quando a vaga NÃO está recusada (a guarda não é um bloqueio geral)", async () => {
    const e = await rodarVoltaDaVaga(null);

    expect(
      e.update,
      "a vaga NÃO recusada que voltou às ativas tem de reabrir: a guarda da recusa não pode travar a reabertura legítima",
    ).not.toBeNull();
  });
});
