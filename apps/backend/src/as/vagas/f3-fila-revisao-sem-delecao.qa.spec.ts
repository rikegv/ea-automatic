import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F3, A FILA DE REVISÃO É LEITURA, ZERO DELEÇÃO ───────────────
 *
 * O autor provou QUEM aparece na fila. Esta suíte prova a outra metade do requisito: consultar a
 * fila NÃO APAGA NADA. As vagas somem da TELA (filtro em memória), nunca do BANCO. Capturo todo SQL
 * compilado e falho se qualquer `delete` aparecer; e dou um `db.delete` que explode se chamado, para
 * provar que nenhum caminho de código tenta deletar ao montar a fila ou a aba recusadas.
 *
 * §A.6: dado sintético. §A.11: sem travessão.
 */

const AGORA = new Date("2026-10-06T12:00:00.000Z");
const dialeto = new PgDialect();

function linhaDeVaga(id: string, idVacancyPandape: string | null, codigo: string | null) {
  return {
    v: {
      id,
      codigo,
      nomeDivulgacao: `Vaga ${id}`,
      status: "PENDENTE_REVISAO",
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
 * Banco fingido que CAPTURA todo SQL compilado via `execute`, e explode em qualquer `db.delete`.
 * `select ... from vagas` sempre devolve a MESMA lista (fonte imutável): se a fila deletasse, a
 * deleção teria de passar por `execute` (raw sql) ou pelo builder `delete`, e os dois são vigiados.
 */
function bancoFingido(opcoes: {
  linhas: ReturnType<typeof linhaDeVaga>[];
  planilhaAtiva: boolean;
  statusPorCodigo: Record<string, string | null>;
  recusadas: string[];
  sqlCapturado: string[];
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
  return {
    select: () => construtor(),
    selectDistinct: () => construtor(),
    delete: () => {
      throw new Error("a fila/aba recusadas NÃO pode deletar vaga (chamou db.delete)");
    },
    execute: (q: unknown) => {
      const sql = dialeto.sqlToQuery(q as never).sql.toLowerCase();
      opcoes.sqlCapturado.push(sql);
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
      // infoDeRecusa (aba recusadas): junta nome do autor.
      if (/recusada_em, u\.nome|recusada_por_nome/.test(sql)) {
        return Promise.resolve(
          opcoes.recusadas.map((id) => ({ id, recusada_em: AGORA, recusada_por_nome: "Autor Sintetico" })),
        );
      }
      return Promise.resolve([]);
    },
  };
}

function servicoCom(opcoes: Omit<Parameters<typeof bancoFingido>[0], "sqlCapturado">) {
  const sqlCapturado: string[] = [];
  const db = bancoFingido({ ...opcoes, sqlCapturado });
  const service = new VagasService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido([{ codigo: "PENDENTE_REVISAO", papel: "REVISAO" }] as never) as never,
  );
  return { service, sqlCapturado };
}

describe("QA F3: a fila de revisão filtra sem deletar", () => {
  it("mostra Pandapé ABERTO/ENTREGUE + MANUAL (id_vacancy nulo); recusada e FECHADO somem", async () => {
    const { service, sqlCapturado } = servicoCom({
      linhas: [
        linhaDeVaga("aberta", "100", "100"),
        linhaDeVaga("entregue", "110", "110"),
        linhaDeVaga("fechada", "200", "200"),
        linhaDeVaga("recusada", "300", "300"),
        linhaDeVaga("manual", null, "SL-9"),
      ],
      planilhaAtiva: true,
      statusPorCodigo: { "100": "ABERTO", "110": "ENTREGUE", "200": "FECHADO", "300": "ABERTO" },
      recusadas: ["recusada"],
    });

    const fila = await service.pendentesDeRevisao();

    expect(fila.map((v) => v.id).sort()).toEqual(["aberta", "entregue", "manual"]);
    // NENHUM delete compilado ao montar a fila.
    expect(sqlCapturado.some((s) => /delete\s+from/.test(s))).toBe(false);
  });

  it("a mesma fonte de vagas é lida sem mutação: consultar a fila e a aba recusadas não emite delete", async () => {
    const linhas = [
      linhaDeVaga("viva", "100", "100"),
      linhaDeVaga("recusada", "200", "200"),
    ];
    const { service, sqlCapturado } = servicoCom({
      linhas,
      planilhaAtiva: true,
      statusPorCodigo: { "100": "ABERTO", "200": "ABERTO" },
      recusadas: ["recusada"],
    });

    const antes = linhas.length;
    const fila = await service.pendentesDeRevisao();
    const recusadas = await service.recusadas();
    const depois = linhas.length;

    // A recusada saiu da fila e entrou na aba, sem nada ser apagado da fonte.
    expect(fila.map((v) => v.id)).toEqual(["viva"]);
    expect(recusadas.map((v) => v.id)).toEqual(["recusada"]);
    expect(depois).toBe(antes);
    expect(sqlCapturado.some((s) => /delete\s+from/.test(s))).toBe(false);
  });

  it("planilha INATIVA: a F3 não filtra por planilha (não esvazia a fila por espelho vazio)", async () => {
    const { service } = servicoCom({
      linhas: [linhaDeVaga("a", "100", "100"), linhaDeVaga("b", "200", "200")],
      planilhaAtiva: false,
      statusPorCodigo: {},
      recusadas: [],
    });

    const fila = await service.pendentesDeRevisao();
    expect(fila.map((v) => v.id).sort()).toEqual(["a", "b"]);
  });
});
