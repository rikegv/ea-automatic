import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "../candidatos/retencao-candidatos.service";
import { sqlDaVarredura } from "../candidatos/retencao-lgpd.tester-fake";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  MUTANTES_DO_CICLO_DE_VIDA,
  MUTANTES_DO_CONFLITO,
  MARCA_QUE_NAO_MATRICULA,
  SQL_EXPURGO_REFERENCIA,
  lerEmitido,
  rodarEncerramento,
  rodarMarca,
  rodarNascimento,
  rodarVagaDaVarredura,
  rodarVagaDeDonoHumano,
  rodarVagaFechadaPorHumano,
  violacoesDaMarca,
  violacoesDoEncerramento,
  violacoesDoExpurgoDoConflito,
  violacoesDoNascimento,
  violacoesNaVagaDaVarredura,
  violacoesNaVagaDeDonoHumano,
  violacoesNaVagaFechadaPorHumano,
  type Emitido,
} from "./ciclo-de-vida-da-vaga.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DO CICLO DE VIDA DA VAGA ESPELHADA (§A.38) ───────────────────────────
 *
 * ESCRITO PELO `tester`, QUE NÃO ESCREVEU O REPOSITÓRIO. Esta rodada existe porque a área que eu
 * DECLAREI não ter coberto foi a área em que o `seguranca` achou o defeito: cobertura declarada
 * como ausente não é cobertura, é uma nota de rodapé.
 *
 * ┌─ AS QUATRO PONTAS DA MESMA FRONTEIRA, e o defeito entrou por UMA delas ─────────────────────┐
 * │ Busca, reabertura, matrícula e encerramento têm de usar a MESMA pergunta: esta vaga é da     │
 * │ varredura? Três estavam certas e uma foi esquecida, e foi assim que a vaga digitada por      │
 * │ gente passou a ser reaberta, ter `encerrada_em` zerado e os campos sobrescritos pelo ATS.    │
 * │ Por isso o contrato cobra as quatro separadamente, e não "a fronteira" como uma coisa só.    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de dado pessoal. Aqui só há id de vaga, código de status e data.
 */

/** O repositório real. O catálogo é fingido, e as etapas não são consultadas por este caminho. */
const criar = (db: never, catalogo: never): IngestaoRepositorio =>
  new IngestaoRepositorio(db, catalogo, null as never);

async function sqlDoExpurgo(): Promise<string> {
  const { sql } = await sqlDaVarredura((db: never) => new RetencaoCandidatosService(db));
  return sql.toLowerCase();
}

function violacoesDoCenario(cenario: string, e: Emitido): string[] {
  if (cenario === "dono humano") return violacoesNaVagaDeDonoHumano(e);
  if (cenario === "da varredura") return violacoesNaVagaDaVarredura(e);
  if (cenario === "fechada por humano") return violacoesNaVagaFechadaPorHumano(e);
  if (cenario === "nascimento") return violacoesDoNascimento(e);
  return violacoesDaMarca(e);
}

// ── 1. OS CONTRATOS SE PROVAM ANTES DE ACUSAR ALGUÉM ───────────────────────────────────────────

describe("o contrato do ciclo de vida, exercitado contra mutantes", () => {
  it.each(MUTANTES_DO_CICLO_DE_VIDA)(
    "REPROVA o mutante $nome, pela regra certa",
    ({ emitido, regraEsperada, cenario, dano }) => {
      const violacoes = violacoesDoCenario(cenario, emitido);
      expect(
        violacoes.filter((x) => x.startsWith(`${regraEsperada}:`)),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  it("APROVA a marca de água que não matricula ninguém", () => {
    expect(violacoesDaMarca(MARCA_QUE_NAO_MATRICULA)).toEqual([]);
  });

  it("APROVA a reabertura de uma vaga que É da varredura", () => {
    const comFronteiraNoSql = lerEmitido([
      "update vagas set status = $1, encerrada_em = null where id = $2::uuid and exists (select 1 from as_varredura_vagas m where m.id_vacancy_pandape = vagas.id_vacancy_pandape) returning id",
    ]);
    expect(violacoesNaVagaDaVarredura(comFronteiraNoSql)).toEqual([]);
    expect(violacoesNaVagaDeDonoHumano(comFronteiraNoSql)).toEqual([]);
  });

  it("APROVA o nascimento que matricula junto", () => {
    expect(
      violacoesDoNascimento(
        lerEmitido([
          "insert into vagas (id_vacancy_pandape) values ($1) returning id",
          "insert into as_varredura_vagas (id_vacancy_pandape) values ($1) on conflict do nothing",
        ]),
      ),
    ).toEqual([]);
  });
});

describe("o contrato do expurgo do conflito, exercitado contra referência e mutantes", () => {
  it("APROVA um expurgo sabidamente correto", () => {
    expect(violacoesDoExpurgoDoConflito(SQL_EXPURGO_REFERENCIA)).toEqual([]);
  });

  it.each(MUTANTES_DO_CONFLITO)(
    "REPROVA o mutante $nome, pela regra certa",
    ({ sql, regraEsperada, dano }) => {
      expect(
        violacoesDoExpurgoDoConflito(sql).filter((x) => x.startsWith(`${regraEsperada}:`)),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );
});

// ── 2. O REPOSITÓRIO DE PRODUÇÃO ───────────────────────────────────────────────────────────────

describe("o ciclo de vida da vaga, no repositório de produção", () => {
  it("vaga que a varredura NÃO criou não é reaberta, e `encerrada_em` não é zerado", async () => {
    expect(violacoesNaVagaDeDonoHumano(await rodarVagaDeDonoHumano(criar))).toEqual([]);
  });

  it("vaga que a varredura criou CONTINUA sendo reaberta quando volta às ativas", async () => {
    expect(violacoesNaVagaDaVarredura(await rodarVagaDaVarredura(criar))).toEqual([]);
  });

  /**
   * A SÉTIMA PROPRIEDADE, que não estava na lista de seis e que eu travo por conta própria: ela vem
   * do desenho do `backend` e o dano é do mesmo tamanho. Reportada ao coordenador como acréscimo.
   */
  it("vaga do espelho que uma PESSOA fechou não é reaberta pela varredura", async () => {
    expect(violacoesNaVagaFechadaPorHumano(await rodarVagaFechadaPorHumano(criar))).toEqual([]);
  });

  it("a matrícula acontece no NASCIMENTO da vaga espelhada", async () => {
    expect(violacoesDoNascimento(await rodarNascimento(criar))).toEqual([]);
  });

  it("a marca de água NÃO matricula vaga nenhuma", async () => {
    expect(violacoesDaMarca(await rodarMarca(criar))).toEqual([]);
  });

  it("o encerramento mantém fronteira, guarda, relógio de servidor e papel FECHAMENTO", async () => {
    const r = await rodarEncerramento(criar, [9001, 9002]);
    expect(r.sql, "o encerramento não emitiu update em `vagas`").not.toBeNull();
    expect(violacoesDoEncerramento(r.sql as string, r.papeisPedidos)).toEqual([]);
    expect(r.devolvido).toBe(2);
  });

  it("lista de ativos VAZIA não encerra ninguém, e não emite consulta nenhuma", async () => {
    const r = await rodarEncerramento(criar, []);
    expect(r.devolvido).toBe(0);
    expect(r.consultas).toEqual([]);
  });

  /**
   * A PROVA DE QUE A GUARDA MORDE O CÓDIGO REAL, e não só os mutantes que eu escrevi: a instrução
   * DE PRODUÇÃO do encerramento é lida sem a fronteira e sem a guarda de vaga já encerrada.
   */
  it("apagar a fronteira DA INSTRUÇÃO REAL de encerramento fica vermelho", async () => {
    const r = await rodarEncerramento(criar, [9001]);
    const sem = (r.sql as string).replace(/and\s+exists\s*\(\s*select\s+1\s+from\s+as_varredura_vagas[\s\S]*?\)/i, "");
    expect(sem).not.toEqual(r.sql);
    expect(
      violacoesDoEncerramento(sem, r.papeisPedidos).filter((x) =>
        x.startsWith("ENCERRAMENTO_SEM_FRONTEIRA:"),
      ),
    ).not.toEqual([]);
  });
});

// ── 3. O ACHADO B, NO EXPURGO DE PRODUÇÃO ──────────────────────────────────────────────────────

describe("o expurgo de produção, medido contra o achado B", () => {
  it("apaga `as_ingestao_conflitos`, alcançando o alvo E quem já está anonimizado", async () => {
    expect(violacoesDoExpurgoDoConflito(await sqlDoExpurgo())).toEqual([]);
  });

  it("e NÃO apaga `as_varredura_vagas`, que não tem pessoa nenhuma dentro", async () => {
    const violacoes = violacoesDoExpurgoDoConflito(await sqlDoExpurgo());
    expect(violacoes.filter((x) => x.startsWith("VARREDURA_EXPURGADA_POR_SIMETRIA:"))).toEqual([]);
  });
});
