import { describe, expect, it, vi } from "vitest";
import { AgendaEntrevistasService } from "./agenda-entrevistas.service";

/**
 * ─ A AGENDA DE ENTREVISTAS: agrupamento no fuso da operação, filtro por CONSULTOR, e o rastreio ──
 *
 * O que estas réguas provam, e que um teste de rota não pegaria:
 *  1. O DIA e o MÊS são contados no fuso `America/Sao_Paulo`, não em UTC: um instante gravado em UTC
 *     que no fuso ainda é do mês/dia pedido tem de cair no balde certo (a borda da meia-noite).
 *  2. A agenda é do CONSULTOR escolhido (`consultor_id`), e a contagem de PESSOAS soma as linhas.
 *  3. O DIA agrupa por instante exato, formata o horário no fuso, e carrega o RASTREIO (quem
 *     atribuiu) e a vaga, com o vazio virando string vazia (a tela mostra "não informado", nunca
 *     travessão).
 *
 * O DB é dublado: um builder encadeável que resolve para as linhas configuradas, tanto no `.where()`
 * (o mês termina ali) quanto no `.orderBy()` (o dia termina ali).
 */
function makeService(rows: Record<string, unknown>[]) {
  const builder: Record<string, unknown> = {};
  builder.from = () => builder;
  builder.innerJoin = () => builder;
  builder.leftJoin = () => builder;
  builder.where = () => builder;
  builder.orderBy = () => Promise.resolve(rows);
  builder.then = (r: (v: unknown) => unknown) => Promise.resolve(rows).then(r);
  const db = { select: vi.fn(() => builder) };
  return new AgendaEntrevistasService(db as never);
}

describe("agendaDoMes: dias e contagem de pessoas no fuso da operação", () => {
  it("soma as pessoas por dia e conta o dia no fuso (America/Sao_Paulo), não em UTC", async () => {
    const service = makeService([
      { agendadaEm: new Date("2026-10-01T18:00:00.000Z") }, // SP 15:00, 01/10
      { agendadaEm: new Date("2026-10-01T20:00:00.000Z") }, // SP 17:00, 01/10 (mesmo dia)
      { agendadaEm: new Date("2026-10-31T02:00:00.000Z") }, // SP 23:00, 30/10 (dia ANTERIOR ao UTC)
      { agendadaEm: new Date("2026-11-01T02:00:00.000Z") }, // SP 23:00, 31/10 (ainda OUTUBRO no fuso)
    ]);

    const dias = await service.agendaDoMes("consultor-1", 2026, 10);

    expect(dias).toEqual([
      { data: "2026-10-01", pessoas: 2 },
      { data: "2026-10-30", pessoas: 1 },
      { data: "2026-10-31", pessoas: 1 },
    ]);
  });

  it("descarta na borda o instante que, no fuso, cai FORA do mês pedido", async () => {
    const service = makeService([
      { agendadaEm: new Date("2026-10-01T02:00:00.000Z") }, // SP 30/09 23:00 -> setembro, fora
      { agendadaEm: new Date("2026-10-15T12:00:00.000Z") }, // SP 15/10 09:00 -> dentro
    ]);

    const dias = await service.agendaDoMes("consultor-1", 2026, 10);

    expect(dias).toEqual([{ data: "2026-10-15", pessoas: 1 }]);
  });
});

describe("diaDoConsultor: horários, pessoas, rastreio e vaga", () => {
  it("agrupa por instante, formata o horário no fuso e lista as pessoas com a vaga de cada uma", async () => {
    const service = makeService([
      {
        agendadaEm: new Date("2026-10-20T13:00:00.000Z"), // SP 10:00
        atribuidoEm: new Date("2026-10-18T12:00:00.000Z"),
        atribuidoPorNome: "Quem Agendou",
        candidaturaId: "cand-a",
        candidatoId: "pessoa-a",
        candidatoNome: "Candidato A",
        vagaId: "vaga-1",
        vagaNome: "Operador De Caixa",
        vagaCodigo: "PS-1",
      },
      {
        agendadaEm: new Date("2026-10-20T13:00:00.000Z"), // SP 10:00, MESMO horário
        atribuidoEm: new Date("2026-10-18T12:00:00.000Z"),
        atribuidoPorNome: "Quem Agendou",
        candidaturaId: "cand-b",
        candidatoId: "pessoa-b",
        candidatoNome: "Candidato B",
        vagaId: "vaga-2",
        vagaNome: "Repositor",
        vagaCodigo: "PS-2",
      },
      {
        agendadaEm: new Date("2026-10-20T17:30:00.000Z"), // SP 14:30
        atribuidoEm: new Date("2026-10-19T12:00:00.000Z"),
        atribuidoPorNome: null, // autor removido: o rastreio perde o nome, a linha fica
        candidaturaId: "cand-c",
        candidatoId: "pessoa-c",
        candidatoNome: "Candidato C",
        vagaId: "vaga-3",
        vagaNome: null, // vaga sem nome ainda: vira string vazia, nunca travessão
        vagaCodigo: null,
      },
    ]);

    const horarios = await service.diaDoConsultor("consultor-1", "2026-10-20");

    expect(horarios).toHaveLength(2);
    expect(horarios[0]!.hora).toBe("10:00");
    expect(horarios[0]!.pessoas).toHaveLength(2);
    expect(horarios[0]!.pessoas.map((p) => p.candidatoNome)).toEqual(["Candidato A", "Candidato B"]);
    expect(horarios[0]!.pessoas[0]!.atribuidoPorNome).toBe("Quem Agendou");
    expect(horarios[0]!.pessoas[0]!.vagaNome).toBe("Operador De Caixa");

    expect(horarios[1]!.hora).toBe("14:30");
    expect(horarios[1]!.pessoas).toHaveLength(1);
    expect(horarios[1]!.pessoas[0]!.atribuidoPorNome).toBeNull();
    // vaga sem nome/código: string vazia (a tela resolve para "não informado").
    expect(horarios[1]!.pessoas[0]!.vagaNome).toBe("");
    expect(horarios[1]!.pessoas[0]!.vagaCodigo).toBe("");
    // o candidatoId viaja para o atalho "abrir o candidato".
    expect(horarios[1]!.pessoas[0]!.candidatoId).toBe("pessoa-c");
  });
});
