import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ AGENDAR ENTREVISTA EM MASSA (ITEM 4 do diretor) ─────────────────────────────────────────────
 *
 * O MESMO instante para vários, cada um NA SUA etapa atual. Como os demais lotes, ela chama a
 * `marcarEntrevista` individual N vezes, então herda as guardas dela; o que esta cobertura prova é o
 * COMPORTAMENTO DE LOTE:
 *   1. o MESMO `agendadaEm` chega a cada entrevista gravada (um agendamento único para o lote);
 *   2. a ETAPA de cada linha é a ATUAL daquela candidatura (a seleção mistura etapas);
 *   3. o AUTOR gravado é o da sessão (`porId`), nunca do corpo;
 *   4. quem NÃO está numa etapa de entrevista volta em `falhas`, SEM derrubar o lote (parcial).
 *
 * §A.6: a falha volta por id, com motivo de PROCESSO; nenhum dado pessoal.
 */

const PORID = "consultor-9";
const CONSULTOR = "consultor-lote";
const QUANDO = "2026-10-20T13:00:00.000Z";

/** Candidaturas servidas pelo fake, por id. TRIAGEM não tem entrevista no catálogo semente. */
const BASE = {
  "cand-soulan": { id: "cand-soulan", vagaId: "vaga-1", etapa: "ENTREVISTA_SOULAN", situacao: "ATIVO" },
  "cand-cliente": { id: "cand-cliente", vagaId: "vaga-1", etapa: "ENTREVISTA_CLIENTE", situacao: "ATIVO" },
  "cand-triagem": { id: "cand-triagem", vagaId: "vaga-1", etapa: "TRIAGEM", situacao: "ATIVO" },
} as const;

/** Extrai, do `where` renderizado, qual id de candidatura ele filtra. */
function idDoWhere(where: unknown): string | null {
  const { params } = new PgDialect().sqlToQuery(where as never);
  const ids = Object.keys(BASE);
  return (params.find((p): p is string => typeof p === "string" && ids.includes(p)) ?? null);
}

function makeDb() {
  const entrevistas: Record<string, unknown>[] = [];

  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    // `listarEntrevistas` lê de volta; o lote descarta o retorno, então uma lista vazia basta.
    b.orderBy = () => Promise.resolve([]);
    return b;
  });

  const insert = vi.fn(() => ({
    values: (valores: Record<string, unknown>) => {
      const registrar = () => {
        entrevistas.push({ ...valores });
      };
      return {
        onConflictDoUpdate: () => {
          registrar();
          return Promise.resolve(undefined);
        },
        then: (r: (v: unknown) => unknown) => {
          registrar();
          return Promise.resolve(undefined).then(r);
        },
      };
    },
  }));

  const findCandidatura = async (args: { where: unknown }) => {
    const id = idDoWhere(args.where);
    return id ? { ...(BASE as Record<string, Record<string, unknown>>)[id] } : undefined;
  };

  const db = {
    select,
    insert,
    query: {
      asCandidaturas: { findFirst: findCandidatura },
      vagas: { findFirst: async () => ({ id: "vaga-1", status: "ABERTA" }) },
    },
  };

  return {
    service: new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    entrevistas,
  };
}

describe("agendar entrevista em massa aplica o MESMO instante, cada um na sua etapa", () => {
  it("grava uma entrevista por candidatura, com o mesmo horário e o autor da sessão", async () => {
    const { service, entrevistas } = makeDb();

    const r = await service.agendarEntrevistaEmLote(
      { candidaturaIds: ["cand-soulan", "cand-cliente"], agendadaEm: QUANDO, consultorId: CONSULTOR },
      PORID,
    );

    expect(r.aplicadas).toBe(2);
    expect(r.falhas).toHaveLength(0);
    expect(entrevistas).toHaveLength(2);
    // o MESMO instante para todas, o CONSULTOR escolhido vale para o lote inteiro, e o autor (quem
    // atribuiu) é o da sessão, separado do consultor (complemento).
    for (const e of entrevistas) {
      expect((e.agendadaEm as Date).toISOString()).toBe(QUANDO);
      expect(e.consultorId).toBe(CONSULTOR);
      expect(e.agendadaPorId).toBe(PORID);
    }
    // cada uma na SUA etapa atual.
    expect(entrevistas.map((e) => e.etapa).sort()).toEqual(["ENTREVISTA_CLIENTE", "ENTREVISTA_SOULAN"]);
    expect(entrevistas.map((e) => e.candidaturaId).sort()).toEqual(["cand-cliente", "cand-soulan"]);
  });

  it("é LOTE PARCIAL: quem não está numa etapa de entrevista volta em falhas, sem derrubar o resto", async () => {
    const { service, entrevistas } = makeDb();

    const r = await service.agendarEntrevistaEmLote(
      { candidaturaIds: ["cand-soulan", "cand-triagem", "cand-cliente"], agendadaEm: QUANDO, consultorId: CONSULTOR },
      PORID,
    );

    // As duas de entrevista entram; a de triagem falha (a etapa não tem entrevista).
    expect(r.aplicadas).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].alvoId).toBe("cand-triagem");
    // A falha carrega motivo de PROCESSO, sem dado pessoal.
    expect(typeof r.falhas[0].motivo).toBe("string");
    expect(entrevistas.map((e) => e.candidaturaId).sort()).toEqual(["cand-cliente", "cand-soulan"]);
  });
});
