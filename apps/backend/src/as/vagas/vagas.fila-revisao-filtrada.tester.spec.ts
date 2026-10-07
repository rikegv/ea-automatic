import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ F3: A FILA DE REVISÃO FILTRADA (planilha, OPÇÃO A) E A ABA RECUSADAS, ZERO DELEÇÃO ──────────
 *
 * COBERTURA do filtro de leitura (F3) e da exclusão da recusa (F4), com banco fingido. A régua é a
 * MESMA do gate de entrada (`vagaDaPlanilhaSai`): a vaga APARECE por padrão, e só sai quando o
 * espelho a traz como FECHADO ou CANCELADO. Código ausente da planilha, status nulo e status
 * desconhecido APARECEM, porque o risco a evitar é perder vaga real de vista. Vaga MANUAL (sem id do
 * Pandapé) sempre aparece; vaga RECUSADA some da fila. Nada é apagado: as vagas continuam no banco,
 * só somem da tela.
 *
 * §A.6: dado sintético. §A.11: sem travessão.
 */

const AGORA = new Date("2026-10-06T12:00:00.000Z");
const dialeto = new PgDialect();

function linhaDeVaga(
  id: string,
  status: string,
  idVacancyPandape: string | null,
  codigo: string | null,
) {
  return {
    v: {
      id,
      codigo,
      nomeDivulgacao: `Vaga ${id}`,
      status,
      idVacancyPandape,
      posicoesOficiais: 1,
      posicoesBanco: 0,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: AGORA,
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
  };
}

/**
 * O banco: `select ... from vagas` devolve as linhas; `execute` responde por SENTIDO do SQL
 * compilado (status da planilha, planilha ativa, recusadas, proposta de cliente).
 */
function bancoFingido(opcoes: {
  linhas: ReturnType<typeof linhaDeVaga>[];
  planilhaAtiva: boolean;
  statusPorCodigo: Record<string, string | null>;
  recusadas: string[];
}) {
  const resolverLeitura = (tabela: unknown) => (tabela === vagas ? opcoes.linhas : []);
  const construtor = () => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => resolverLeitura(tabela);
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(resultado());
    b.groupBy = () => Promise.resolve(resultado());
    b.limit = () => Promise.resolve(resultado());
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return b;
  };
  const db = {
    select: () => construtor(),
    selectDistinct: () => construtor(),
    execute: (q: unknown) => {
      const sql = dialeto.sqlToQuery(q as never).sql.toLowerCase();
      if (/exists\s*\([\s\S]*status_planilha is not null/.test(sql)) {
        return Promise.resolve([{ ativa: opcoes.planilhaAtiva }]);
      }
      if (/select\s+codigo_externo,\s+status_planilha/.test(sql)) {
        return Promise.resolve(
          Object.entries(opcoes.statusPorCodigo).map(([codigo_externo, status_planilha]) => ({
            codigo_externo,
            status_planilha,
          })),
        );
      }
      if (/recusada_em is not null and id in/.test(sql)) {
        return Promise.resolve(opcoes.recusadas.map((id) => ({ id })));
      }
      return Promise.resolve([]);
    },
  };
  return db;
}

function servicoCom(opcoes: Parameters<typeof bancoFingido>[0]) {
  return new VagasService(
    bancoFingido(opcoes) as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido([{ codigo: "PENDENTE_REVISAO", papel: "REVISAO" }] as never) as never,
  );
}

describe("pendentesDeRevisao: filtro de planilha (F3) e exclusão da recusa (F4)", () => {
  it("planilha ATIVA: só FECHADO e CANCELADO somem; ABERTO, ENTREGUE, AUSENTE, NULO, OUTRO e MANUAL aparecem", async () => {
    const linhas = [
      linhaDeVaga("aberta", "PENDENTE_REVISAO", "100", "R100"),
      linhaDeVaga("fechada", "PENDENTE_REVISAO", "200", "R200"),
      linhaDeVaga("entregue", "PENDENTE_REVISAO", "300", "R300"),
      linhaDeVaga("cancelada", "PENDENTE_REVISAO", "400", "R400"),
      // AUSENTE da planilha: o time ainda não lançou o código. Pela Opção A, APARECE.
      linhaDeVaga("ausente", "PENDENTE_REVISAO", "500", "R500"),
      // Presente no espelho, mas com status NULO. Também APARECE.
      linhaDeVaga("nula", "PENDENTE_REVISAO", "600", "R600"),
      // Status desconhecido (OUTRO): ninguém afirmou encerramento, então APARECE.
      linhaDeVaga("outro", "PENDENTE_REVISAO", "700", "R700"),
      linhaDeVaga("manual", "PENDENTE_REVISAO", null, "SL-1"),
    ];
    const service = servicoCom({
      linhas,
      planilhaAtiva: true,
      statusPorCodigo: {
        "100": "ABERTO",
        "200": "FECHADO",
        "300": "ENTREGUE",
        "400": "CANCELADO",
        // 500 ausente de propósito
        "600": null,
        "700": "OUTRO",
      },
      recusadas: [],
    });

    const fila = await service.pendentesDeRevisao();

    expect(fila.map((v) => v.id).sort()).toEqual([
      "aberta",
      "ausente",
      "entregue",
      "manual",
      "nula",
      "outro",
    ]);
  });

  it("planilha INATIVA (espelho vazio): nada é filtrado, a fila mostra todas as de revisão", async () => {
    const linhas = [
      linhaDeVaga("a", "PENDENTE_REVISAO", "100", "R100"),
      linhaDeVaga("b", "PENDENTE_REVISAO", "200", "R200"),
    ];
    const service = servicoCom({
      linhas,
      planilhaAtiva: false,
      statusPorCodigo: {},
      recusadas: [],
    });

    const fila = await service.pendentesDeRevisao();

    expect(fila.map((v) => v.id).sort()).toEqual(["a", "b"]);
  });

  it("a vaga RECUSADA some da fila, mesmo estando ABERTO na planilha (F4)", async () => {
    const linhas = [
      linhaDeVaga("viva", "PENDENTE_REVISAO", "100", "R100"),
      linhaDeVaga("recusada", "PENDENTE_REVISAO", "200", "R200"),
    ];
    const service = servicoCom({
      linhas,
      planilhaAtiva: true,
      statusPorCodigo: { "100": "ABERTO", "200": "ABERTO" },
      recusadas: ["recusada"],
    });

    const fila = await service.pendentesDeRevisao();

    expect(fila.map((v) => v.id)).toEqual(["viva"]);
  });
});
