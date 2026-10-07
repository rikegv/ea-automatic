import { describe, expect, it } from "vitest";
import { descobrirVagasAtivas, novoResumo } from "./ingestao-ciclo";
import type {
  DependenciasDaVarredura,
  Escrita,
  PortaBanco,
  ResultadoDaEscrita,
} from "./ingestao-portas";

/**
 * ─ F2: O GATE DE ENTRADA PELA PLANILHA, E A TRAVA DO `seguranca` SOBRE O CONJUNTO ATS-ATIVO ────
 *
 * Duas afirmações, e a segunda é a que o `seguranca` vetou perder:
 *   1. a varredura só ESPELHA/CRIA a vaga que a planilha deixa entrar (ABERTO/ENTREGUE);
 *   2. o conjunto `ativos[]` que alimenta `encerrarAusentes` continua COMPLETO (todas as ATS-ativas),
 *      JAMAIS encolhido pela planilha. Encolher acenderia o relógio de expurgo por base ilícita.
 *
 * §A.6: dado sintético, nenhum id de pessoa. §A.11: sem travessão.
 */

/** Um `escrever` que anota quais vagas foram espelhadas e devolve um id derivado do idVacancy. */
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

function deps(
  vagas: { idVacancy: number; reference: string | null }[],
  entram: Set<number>,
): {
  deps: DependenciasDaVarredura;
  espelhadas: number[];
  encerrarRecebeu: number[][];
} {
  const { banco, espelhadas } = bancoQueAnota();
  const encerrarRecebeu: number[][] = [];
  const d: DependenciasDaVarredura = {
    http: {
      requisitar: () =>
        Promise.resolve({ data: vagas.map((v) => ({ idVacancy: v.idVacancy, reference: v.reference })) }),
    },
    banco,
    fila: { enfileirar: () => Promise.resolve() },
    log: { info: () => undefined, erro: () => undefined },
    agora: () => new Date("2026-10-06T00:00:00.000Z"),
    dataDeCorte: new Date("2026-01-01T00:00:00.000Z"),
    salDaMarca: "sal-sintetico",
    cicloDeVida: {
      encerrarAusentes: (ids: number[]) => {
        encerrarRecebeu.push(ids);
        return Promise.resolve(0);
      },
    },
    filtroDaPlanilha: {
      vagaEntra: (idVacancy: number) => Promise.resolve(entram.has(idVacancy)),
    },
  };
  return { deps: d, espelhadas, encerrarRecebeu };
}

describe("o gate de entrada pela planilha (F2)", () => {
  it("espelha SÓ a vaga que a planilha deixa entrar, mas `ativos` leva TODAS (trava do seguranca)", async () => {
    const vagas = [
      { idVacancy: 100, reference: "R100" }, // na planilha, entra
      { idVacancy: 200, reference: "R200" }, // fora da planilha, NÃO entra
    ];
    const { deps: d, espelhadas, encerrarRecebeu } = deps(vagas, new Set([100]));
    const resumo = novoResumo();

    const r = await descobrirVagasAtivas(d, resumo);

    // 1. SÓ a 100 foi espelhada, e só ela volta na lista das varridas por página.
    expect(espelhadas).toEqual([100]);
    expect(r.map((v) => v.idVacancy)).toEqual([100]);
    expect(resumo.vagasForaDaPlanilha).toBe(1);

    // 2. A TRAVA: `encerrarAusentes` recebeu AS DUAS, porque o encerramento deriva de ausência no
    //    ATS, nunca de "não está na planilha". Encolher aqui acenderia o expurgo por base ilícita.
    expect(encerrarRecebeu).toHaveLength(1);
    expect([...encerrarRecebeu[0]].sort((a, b) => a - b)).toEqual([100, 200]);
  });

  it("SEM filtro (planilha não configurada), toda vaga ATS-ativa entra, como antes da frente", async () => {
    const vagas = [
      { idVacancy: 100, reference: "R100" },
      { idVacancy: 200, reference: "R200" },
    ];
    const { deps: d, espelhadas, encerrarRecebeu } = deps(vagas, new Set());
    // Remove o filtro: o estado de quem roda sem o espelho da planilha.
    d.filtroDaPlanilha = undefined;
    const resumo = novoResumo();

    const r = await descobrirVagasAtivas(d, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([100, 200]);
    expect(r.map((v) => v.idVacancy).sort((a, b) => a - b)).toEqual([100, 200]);
    expect(resumo.vagasForaDaPlanilha).toBeUndefined();
    expect([...encerrarRecebeu[0]].sort((a, b) => a - b)).toEqual([100, 200]);
  });
});
