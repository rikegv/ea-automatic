import { describe, expect, it } from "vitest";
import { normalizarCodigoDeVaga } from "../../domain/as-depara-cliente-vaga";
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
 * ─ COBERTURA INDEPENDENTE (§A.38): O GATE F2 DO REPOSITÓRIO REAL, LIGADO AO CICLO ───────────────
 *
 * ESCRITA POR OUTRA CABEÇA, SEM LER A SUPOSIÇÃO DO AUTOR. O arquivo do autor
 * (`f2-gate-planilha.qa.spec.ts`) já prova o fail-open com espelho VAZIO (fail-open LIGADO) pela
 * porta real, e prova, com um `vagaEntra` FALSO keyado por status, que o encerramento vê o ATS
 * completo. O buraco que sobrava entre os dois é o caminho de PRODUÇÃO no estado mais perigoso:
 *
 *   ESPELHO POPULADO (fail-open DESLIGADO) + a porta REAL do repositório ligada ao ciclo, BARRANDO
 *   o que a planilha marca como FECHADO/CANCELADO e deixando o resto entrar, SEM que o conjunto de
 *   encerramento encolha.
 *
 * A RÉGUA É A OPÇÃO A (decisão do diretor, 07/10/2026): a vaga ENTRA por padrão, e só FECHADO ou
 * CANCELADO a exclui. Código ausente da planilha ENTRA, porque vaga real não pode se perder de
 * vista só porque o time ainda não lançou o código.
 *
 * A diferença importa porque o fail-open e o filtro ativo são DOIS ramos distintos de `vagaEntra`
 * (o `if (ativaLinhas[0]?.ativa !== true) return true` contra o lookup `codigo_externo in (...)`),
 * e a salvaguarda do `seguranca` (`ativos.push` ANTES do gate, em `ingestao-ciclo.ts`) tem de valer
 * nos dois. Um teste que só exercitasse o fail-open deixaria o ramo do filtro ATIVO sem a prova de
 * que ele também não encolhe `encerrarAusentes`.
 *
 * §A.6: dado sintético, zero id de pessoa, zero valor de planilha. §A.11: sem travessão.
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
 * Extrai os PARÂMETROS (strings) de uma query Drizzle, varrendo os `queryChunks` e ignorando os
 * `StringChunk` (o SQL literal). É o que separa a consulta de ATIVAÇÃO (só a FONTE) do lookup (FONTE
 * mais as chaves de vaga), do mesmo jeito que o Postgres enxergaria os binds.
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

/**
 * O REPOSITÓRIO REAL (`IngestaoRepositorio`) sobre um `db` falso que responde às DUAS consultas de
 * `vagaEntra` como o Postgres responderia: a de ativação (`exists`) pelo espelho ter algum status
 * não nulo, e o lookup filtrando as linhas pelas chaves da consulta (o `IN`).
 */
function repositorioComEspelho(
  linhas: { codigo_externo: string; status_planilha: string | null }[],
) {
  const ativa = linhas.some((l) => l.status_planilha !== null);
  const db = {
    execute: (query: unknown) => {
      const params = paramsDaQuery(query);
      const chavesDeVaga = params.filter((p) => p !== FONTE_DO_DEPARA_DE_CLIENTE);
      if (chavesDeVaga.length === 0) return Promise.resolve([{ ativa }]);
      const chaves = new Set(chavesDeVaga);
      return Promise.resolve(linhas.filter((l) => chaves.has(l.codigo_externo)));
    },
  };
  return new IngestaoRepositorio(db as never, null as never, null as never);
}

/** A chave da planilha é NUMÉRICA (idVacancy); `normalizarCodigoDeVaga` recusa não-número. */
const chave = (id: number) => normalizarCodigoDeVaga(id)!;

/**
 * Monta as deps do ciclo com a porta REAL do repositório (produção injeta exatamente isto), um banco
 * que anota o que foi espelhado e um `encerrarAusentes` que anota o conjunto recebido.
 */
function depsComRepositorioReal(
  vagasAtivasNoAts: { idVacancy: number; reference: string | null }[],
  linhasDoEspelho: { codigo_externo: string; status_planilha: string | null }[],
) {
  const repo = repositorioComEspelho(linhasDoEspelho);
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
    agora: () => new Date("2026-10-07T00:00:00.000Z"),
    dataDeCorte: new Date("2026-01-01T00:00:00.000Z"),
    salDaMarca: "sal-sintetico",
    cicloDeVida: {
      encerrarAusentes: (ids: number[]) => {
        encerrarRecebeu.push([...ids]);
        return Promise.resolve(0);
      },
    },
    // A PORTA REAL, não um dublê: é o `IngestaoRepositorio.vagaEntra` lendo o espelho.
    filtroDaPlanilha: { vagaEntra: (id, ref) => repo.vagaEntra(id, ref) },
  };
  return { deps: d, espelhadas, encerrarRecebeu };
}

describe("F2 (porta real + ciclo): espelho ATIVO filtra a ESCRITA, nunca o conjunto de encerramento", () => {
  /**
   * O CENÁRIO DE PRODUÇÃO COM O ESPELHO JÁ POPULADO. Cinco vagas ATS-ativas, o espelho diz:
   *   10 ABERTO    -> entra
   *   20 ENTREGUE  -> entra
   *   30 FECHADO   -> NÃO entra
   *   40 CANCELADO -> NÃO entra
   *   50 ausente do espelho (porém ATS-ativa) -> ENTRA, pela Opção A
   *
   * O que o teste trava de uma vez: (1) o gate pela porta REAL barra só as duas ENCERRADAS, e
   * (2) `encerrarAusentes` recebe AS CINCO. A 30 e a 40 foram barradas da ESCRITA, mas continuam
   * ATS-ativas: encerrá-las por causa da planilha acenderia o relógio de expurgo por base ilícita
   * (a trava do `seguranca`, `ativos.push` antes do gate).
   */
  it("com espelho POPULADO, só FECHADO/CANCELADO são barrados, e o encerramento vê o ATS completo", async () => {
    const vagas = [
      { idVacancy: 10, reference: null },
      { idVacancy: 20, reference: null },
      { idVacancy: 30, reference: null },
      { idVacancy: 40, reference: null },
      { idVacancy: 50, reference: null },
    ];
    const { deps, espelhadas, encerrarRecebeu } = depsComRepositorioReal(vagas, [
      { codigo_externo: chave(10), status_planilha: "ABERTO" },
      { codigo_externo: chave(20), status_planilha: "ENTREGUE" },
      { codigo_externo: chave(30), status_planilha: "FECHADO" },
      { codigo_externo: chave(40), status_planilha: "CANCELADO" },
      // 50 ausente de propósito: espelho ATIVO sem a linha dela, e pela Opção A ela ENTRA.
    ]);
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([10, 20, 50]);
    expect(resumo.vagasForaDaPlanilha).toBe(2);
    expect(encerrarRecebeu).toHaveLength(1);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
  });

  /**
   * O PIOR CASO DO RAMO DE FILTRO ATIVO: espelho POPULADO em que TODA vaga ATS-ativa está encerrada
   * na planilha (FECHADO ou CANCELADO). Nada é espelhado, mas `encerrarAusentes` ainda recebe o ATS
   * inteiro. Este é o espelho exato do caso "todas barradas" do autor, porém pela porta REAL e com o
   * espelho ATIVO (não pelo fail-open): é o ramo que, se encolhesse `ativos`, expurgaria em massa.
   */
  it("espelho ATIVO barrando TODAS não dispara expurgo: encerramento recebe o ATS inteiro", async () => {
    const vagas = [
      { idVacancy: 1, reference: null },
      { idVacancy: 2, reference: null },
      { idVacancy: 3, reference: null },
    ];
    const { deps, espelhadas, encerrarRecebeu } = depsComRepositorioReal(vagas, [
      { codigo_externo: chave(1), status_planilha: "FECHADO" },
      { codigo_externo: chave(2), status_planilha: "CANCELADA" },
      { codigo_externo: chave(3), status_planilha: "ENCERRADA" },
    ]);
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas).toEqual([]);
    expect(resumo.vagasForaDaPlanilha).toBe(3);
    expect(encerrarRecebeu).toHaveLength(1);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  /**
   * O CANÁRIO DA OPÇÃO A PELO CAMINHO REAL: espelho ATIVO, e a vaga cujo código o time AINDA NÃO
   * LANÇOU na planilha. Antes de 07/10/2026 ela era barrada e se perdia de vista; agora ela ENTRA.
   */
  it("espelho ATIVO: a vaga AUSENTE da planilha, e a de status nulo, ENTRAM (o fundamento da Opção A)", async () => {
    const vagas = [
      { idVacancy: 11, reference: null }, // ausente do espelho
      { idVacancy: 12, reference: null }, // presente, status NULO
      { idVacancy: 13, reference: null }, // FECHADO, a única que sai
    ];
    const { deps, espelhadas, encerrarRecebeu } = depsComRepositorioReal(vagas, [
      { codigo_externo: chave(12), status_planilha: null },
      { codigo_externo: chave(13), status_planilha: "FECHADO" },
    ]);
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([11, 12]);
    expect(resumo.vagasForaDaPlanilha).toBe(1);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([11, 12, 13]);
  });

  /**
   * O FAIL-OPEN, PELA PORTA REAL, LIGADO AO CICLO, PROVANDO QUE ELE NÃO ENCOLHE O ENCERRAMENTO.
   *
   * O requisito pede literalmente amarrar "fail-open não encolhe o conjunto de encerramento". O autor
   * já o amarra; aqui a prova é repetida de forma INDEPENDENTE com um espelho cuja única linha tem
   * `status_planilha` NULO (a janela logo após a 0144), para que o ramo `ativa=false` seja o
   * exercitado, e não o espelho literalmente vazio.
   */
  it("espelho com status NULO (0144) => fail-open deixa TODAS entrar, e o encerramento vê o ATS completo", async () => {
    const vagas = [
      { idVacancy: 7, reference: null },
      { idVacancy: 8, reference: null },
      { idVacancy: 9, reference: null },
    ];
    const { deps, espelhadas, encerrarRecebeu } = depsComRepositorioReal(vagas, [
      { codigo_externo: chave(7), status_planilha: null },
      { codigo_externo: chave(8), status_planilha: null },
    ]);
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([7, 8, 9]);
    // Fail-open: ninguém foi barrado, então o contador de "fora da planilha" nem é tocado.
    expect(resumo.vagasForaDaPlanilha).toBeUndefined();
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([7, 8, 9]);
  });
});
