import { describe, expect, it } from "vitest";
import { normalizarCodigoDeVaga } from "../../domain/as-depara-cliente-vaga";
import { vagaDaPlanilhaEntra } from "../../domain/as-planilha-status-vaga";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import { descobrirVagasAtivas, novoResumo } from "./ingestao-ciclo";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import type {
  DependenciasDaVarredura,
  Escrita,
  PortaBanco,
  ResultadoDaEscrita,
} from "./ingestao-portas";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F2, O GATE DE ENTRADA E A TRAVA DO EXPURGO ──────────────────
 *
 * DIFERENÇA DELIBERADA do spec do autor (`gate-da-planilha.tester.spec.ts`): ali o filtro era um
 * `Set<number>` pré-computado; aqui eu ligo a RÉGUA REAL do domínio (`vagaDaPlanilhaEntra`) à porta,
 * keyada pelo STATUS da planilha. Assim o teste exercita o REQUISITO ("FECHADO/CANCELADO/ausente não
 * entram; ABERTO/ENTREGUE entram") de ponta a ponta pela varredura, e não a suposição do autor.
 *
 * E provo a trava mais perigosa do `seguranca`: a vaga que SAIU da planilha mas CONTINUA ATIVA no
 * ATS (VacancyStatus=2) NÃO pode ser encerrada pelo filtro. `encerrarAusentes` tem de receber o
 * conjunto ATS COMPLETO, porque encerrar deriva de ausência no ATS, nunca de ausência na planilha.
 *
 * §A.6: dado sintético, zero id de pessoa. §A.11: sem travessão.
 */

/** Um `escrever` que anota quais idVacancy foram ESPELHADOS (a prova do que "entrou"). */
function bancoQueAnota(): { banco: PortaBanco; espelhadas: number[] } {
  const espelhadas: number[] = [];
  const naoUsado = () => {
    throw new Error("a descoberta não deveria chamar este método");
  };
  const banco: PortaBanco = {
    identidadeExterna: naoUsado as never,
    candidatoPorCpf: naoUsado as never,
    candidatoPorNome: naoUsado as never,
    vagaPorIdPandape: naoUsado as never,
    vagaPorCodigo: naoUsado as never,
    deParaEtapa: naoUsado as never,
    clientePorVaga: naoUsado as never,
    marcaDaVaga: naoUsado as never,
    escrever: (e: Escrita): Promise<ResultadoDaEscrita> => {
      const idVacancy = Number(e.valores.id_vacancy_pandape);
      espelhadas.push(idVacancy);
      return Promise.resolve({ linhasAfetadas: 1, id: `vaga-${idVacancy}`, divergencias: 0 });
    },
  };
  return { banco, espelhadas };
}

/**
 * Monta as deps da varredura com o GATE LIGADO À RÉGUA REAL: a porta `vagaEntra` consulta o status
 * da planilha daquela vaga (mapa por idVacancy) e devolve `vagaDaPlanilhaEntra(status)`. Status
 * ausente do mapa = vaga ausente do espelho = não entra, exatamente como o repositório de produção.
 */
function deps(
  vagasAtivasNoAts: { idVacancy: number; reference: string | null }[],
  statusDaPlanilhaPorVaga: Record<number, string | undefined>,
  comFiltro = true,
) {
  const { banco, espelhadas } = bancoQueAnota();
  const encerrarRecebeu: number[][] = [];
  const d: DependenciasDaVarredura = {
    http: {
      requisitar: () =>
        Promise.resolve({
          data: vagasAtivasNoAts.map((v) => ({ idVacancy: v.idVacancy, reference: v.reference })),
        }),
    },
    banco,
    fila: { enfileirar: () => Promise.resolve() },
    log: { info: () => undefined, erro: () => undefined },
    agora: () => new Date("2026-10-06T00:00:00.000Z"),
    dataDeCorte: new Date("2026-01-01T00:00:00.000Z"),
    salDaMarca: "sal-sintetico",
    cicloDeVida: {
      encerrarAusentes: (ids: number[]) => {
        encerrarRecebeu.push([...ids]);
        return Promise.resolve(0);
      },
    },
    filtroDaPlanilha: comFiltro
      ? {
          vagaEntra: (idVacancy: number) =>
            Promise.resolve(vagaDaPlanilhaEntra(statusDaPlanilhaPorVaga[idVacancy])),
        }
      : undefined,
  };
  return { deps: d, espelhadas, encerrarRecebeu };
}

describe("QA F2 (varredura): o gate de entrada pela régua real da planilha", () => {
  it("só ABERTO/ENTREGUE do espelho são espelhados; FECHADO, CANCELADO e AUSENTE NÃO entram", async () => {
    const vagas = [
      { idVacancy: 10, reference: "R10" }, // ABERTO -> entra
      { idVacancy: 20, reference: "R20" }, // ENTREGUE -> entra
      { idVacancy: 30, reference: "R30" }, // FECHADO -> não entra
      { idVacancy: 40, reference: "R40" }, // CANCELADO -> não entra
      { idVacancy: 50, reference: "R50" }, // ausente do espelho -> não entra
    ];
    const { deps: d, espelhadas } = deps(vagas, {
      10: "Aberto",
      20: "Entregue",
      30: "Fechado",
      40: "Cancelada",
      // 50 ausente de propósito
    });
    const resumo = novoResumo();

    const r = await descobrirVagasAtivas(d, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([10, 20]);
    expect(r.map((v) => v.idVacancy).sort((a, b) => a - b)).toEqual([10, 20]);
    expect(resumo.vagasForaDaPlanilha).toBe(3);
  });

  it("SEM filtro (planilha não configurada): fail-closed NÃO barra em massa, toda ATS-ativa entra", async () => {
    const vagas = [
      { idVacancy: 10, reference: "R10" },
      { idVacancy: 20, reference: "R20" },
      { idVacancy: 30, reference: "R30" },
    ];
    const { deps: d, espelhadas } = deps(vagas, {}, false);
    const resumo = novoResumo();

    const r = await descobrirVagasAtivas(d, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(r.map((v) => v.idVacancy).sort((a, b) => a - b)).toEqual([10, 20, 30]);
    expect(resumo.vagasForaDaPlanilha).toBeUndefined();
  });
});

describe("QA F2 (varredura): a TRAVA do seguranca sobre o conjunto de encerramento", () => {
  it("vaga que SAIU da planilha mas CONTINUA ATIVA no ATS NÃO é encerrada: encerrarAusentes recebe TODAS", async () => {
    const vagas = [
      { idVacancy: 10, reference: "R10" }, // ABERTO na planilha
      { idVacancy: 99, reference: "R99" }, // ATS-ativa, mas FORA da planilha agora
    ];
    const { deps: d, espelhadas, encerrarRecebeu } = deps(vagas, {
      10: "Aberto",
      // 99 fora da planilha: não é espelhada, MAS continua ATS-ativa
    });
    const resumo = novoResumo();

    await descobrirVagasAtivas(d, resumo);

    // A 99 NÃO foi espelhada (gate de escrita a barrou)...
    expect(espelhadas).toEqual([10]);
    // ...mas o conjunto que alimenta o encerramento tem AS DUAS: a 99 não pode ser encerrada só por
    // ter saído da planilha. Encerrar a 99 aqui acenderia o relógio de expurgo por base ilícita.
    expect(encerrarRecebeu).toHaveLength(1);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([10, 99]);
  });

  it("mesmo com TODAS as vagas barradas pela planilha, encerrarAusentes recebe o ATS completo (não dispara expurgo em massa)", async () => {
    const vagas = [
      { idVacancy: 1, reference: "R1" },
      { idVacancy: 2, reference: "R2" },
      { idVacancy: 3, reference: "R3" },
    ];
    // Todas FECHADAS/ausentes: nada entra, mas as três continuam ativas no ATS.
    const { deps: d, espelhadas, encerrarRecebeu } = deps(vagas, { 1: "Fechado", 2: "Cancelada" });
    const resumo = novoResumo();

    await descobrirVagasAtivas(d, resumo);

    expect(espelhadas).toEqual([]);
    expect(encerrarRecebeu).toHaveLength(1);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(resumo.vagasForaDaPlanilha).toBe(3);
  });
});

/**
 * COBERTURA DO ELO REAL: a porta `vagaEntra` do repositório lê `as_depara_cliente_vaga.status_planilha`
 * e decide pela MESMA régua. Prova que o gate consulta o STATUS (não só presença), a precedência
 * idVacancy > reference, e o FAIL-OPEN quando o espelho ainda não tem status populado.
 *
 * O FAKE MODELA AS DUAS CONSULTAS do método, como o Postgres responderia:
 *   1. `exists(status_planilha is not null)` (sinal de espelho ATIVO): essa consulta só carrega a
 *      FONTE, nenhuma chave de vaga, então devolvemos `[{ ativa }]`, com `ativa` derivado do espelho.
 *   2. o lookup `codigo_externo in (...)`: FILTRA as linhas pelas chaves da consulta, igual ao `IN`
 *      do banco (vaga ausente de um espelho ativo devolve zero linha, não a primeira linha à toa).
 * A distinção é por presença de chave de vaga nos parâmetros, não por ordem de chamada.
 */
function paramsDaQuery(query: unknown): string[] {
  const vals: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") {
      vals.push(node);
      return;
    }
    if (!node || typeof node !== "object") return;
    if ((node as { constructor?: { name?: string } }).constructor?.name === "StringChunk") return;
    if (Array.isArray(node)) {
      for (const c of node) walk(c);
      return;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (Array.isArray(chunks)) for (const c of chunks) walk(c);
  };
  walk(query);
  return vals;
}

function repositorioComEspelho(linhas: { codigo_externo: string; status_planilha: string | null }[]) {
  const ativa = linhas.some((l) => l.status_planilha !== null);
  const db = {
    execute: (query: unknown) => {
      const params = paramsDaQuery(query);
      const chavesDeVaga = params.filter((p) => p !== FONTE_DO_DEPARA_DE_CLIENTE);
      // Consulta de ativação: só a FONTE, nenhuma chave de vaga.
      if (chavesDeVaga.length === 0) return Promise.resolve([{ ativa }]);
      // Lookup: filtra pelas chaves, como o `IN` do Postgres.
      const chaves = new Set(chavesDeVaga);
      return Promise.resolve(linhas.filter((l) => chaves.has(l.codigo_externo)));
    },
  };
  return new IngestaoRepositorio(db as never, null as never, null as never);
}

describe("QA F2 (repositório real): vagaEntra lê o status_planilha do espelho", () => {
  // As chaves da planilha são NUMÉRICAS (idVacancy e reference), não rótulos tipo "R100":
  // `normalizarCodigoDeVaga` recusa não-número (MALFORMADO -> null).
  const chave = (id: number) => normalizarCodigoDeVaga(id)!;

  it("entra só quando o status gravado é ABERTO/ENTREGUE; não entra em FECHADO/CANCELADO", async () => {
    const repoAberto = repositorioComEspelho([{ codigo_externo: chave(100), status_planilha: "ABERTO" }]);
    const repoFechado = repositorioComEspelho([{ codigo_externo: chave(100), status_planilha: "FECHADO" }]);

    expect(await repoAberto.vagaEntra(100, null)).toBe(true);
    expect(await repoFechado.vagaEntra(100, null)).toBe(false);
  });

  it("AUSENTE de um espelho ATIVO (há status, mas não o desta vaga) NÃO entra", async () => {
    // Espelho populado (há status) mas sem a vaga 777: lookup devolve zero linha, não entra.
    const repo = repositorioComEspelho([{ codigo_externo: chave(100), status_planilha: "ABERTO" }]);
    expect(await repo.vagaEntra(777, null)).toBe(false);
  });

  it("ESPELHO INATIVO (nenhum status_planilha populado) => FAIL-OPEN, qualquer vaga entra", async () => {
    // Janela logo após a 0144 (coluna recém-criada, toda nula) ou falha do scheduler: o filtro ainda
    // não está ativo. Espelha o lado da LEITURA (F3), que também não filtra enquanto o espelho é vazio.
    const semStatus = repositorioComEspelho([
      { codigo_externo: chave(100), status_planilha: null },
      { codigo_externo: chave(200), status_planilha: null },
    ]);
    const vazio = repositorioComEspelho([]);
    expect(await semStatus.vagaEntra(100, null)).toBe(true);
    expect(await semStatus.vagaEntra(999, null)).toBe(true);
    expect(await vazio.vagaEntra(777, null)).toBe(true);
  });

  it("a CHAVE FORTE (idVacancy) decide quando existe, mesmo que a reference traga outro status", async () => {
    // id 100 diz FECHADO, reference 200 diz ABERTO: a id forte manda, não entra.
    const repo = repositorioComEspelho([
      { codigo_externo: chave(100), status_planilha: "FECHADO" },
      { codigo_externo: chave(200), status_planilha: "ABERTO" },
    ]);
    expect(await repo.vagaEntra(100, 200 as unknown as string)).toBe(false);
  });
});

/**
 * ─ GAP RESOLVIDO (tester, §A.38): A ASSIMETRIA F2 x F3 NO "ESPELHO VAZIO" FOI FECHADA ───────────
 *
 * O GAP era: a F3 (fila de revisão) já fazia fail-OPEN com espelho vazio
 * (`statusDaPlanilhaDasVagas` só filtra quando `exists(status_planilha is not null)`), mas a F2
 * (varredura) fazia fail-CLOSED, barrando TODA vaga enquanto o espelho não tinha status, e parando a
 * ingestão em silêncio. O diretor autorizou alinhar os dois lados.
 *
 * CONSERTO: `vagaEntra` passou a perguntar o MESMO `exists(status_planilha is not null)` ANTES do
 * lookup; espelho inativo => devolve TRUE (fail-open), exatamente como a F3. Este teste prova o elo
 * real pela varredura: espelho VAZIO agora deixa TODA vaga ATS-ativa entrar.
 *
 * A salvaguarda do `seguranca` segue intacta: `encerrarAusentes` recebe o ATS completo (prova abaixo).
 */
describe("GAP RESOLVIDO: F2 faz FAIL-OPEN quando o espelho está vazio, como a F3", () => {
  it("espelho VAZIO + gate injetado => TODA vaga ATS-ativa ENTRA (fail-open), e o encerramento vê o ATS completo", async () => {
    // Modela o gate de produção com o filtro injetado, lendo um espelho ainda sem status.
    const repoComEspelhoVazio = repositorioComEspelho([]);
    const vagas = [
      { idVacancy: 1, reference: null },
      { idVacancy: 2, reference: null },
      { idVacancy: 3, reference: null },
    ];
    const { banco, espelhadas } = bancoQueAnota();
    const encerrarRecebeu: number[][] = [];
    const d: DependenciasDaVarredura = {
      http: { requisitar: () => Promise.resolve({ data: vagas }) },
      banco,
      fila: { enfileirar: () => Promise.resolve() },
      log: { info: () => undefined, erro: () => undefined },
      agora: () => new Date("2026-10-06T00:00:00.000Z"),
      dataDeCorte: new Date("2026-01-01T00:00:00.000Z"),
      salDaMarca: "sal-sintetico",
      cicloDeVida: {
        encerrarAusentes: (ids: number[]) => {
          encerrarRecebeu.push([...ids]);
          return Promise.resolve(0);
        },
      },
      // A porta REAL do repositório, lendo o espelho vazio: é o que produção injeta.
      filtroDaPlanilha: { vagaEntra: (id, ref) => repoComEspelhoVazio.vagaEntra(id, ref) },
    };
    const resumo = novoResumo();

    await descobrirVagasAtivas(d, resumo);

    // AS TRÊS foram espelhadas: a ingestão NÃO para mais em silêncio enquanto o espelho não tem status.
    expect(espelhadas.sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(resumo.vagasForaDaPlanilha).toBeUndefined();
    // A salvaguarda que continua: o encerramento vê o ATS completo, sem expurgo por engano.
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});
