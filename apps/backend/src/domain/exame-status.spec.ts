import { describe, expect, it } from "vitest";
import { instanteFinalDoExame, statusAutomaticoExame, ultimoHorario } from "./exame-status";

/**
 * Regras do verificador de hora em hora (OST Onda 2, item 3), com o relógio controlado pelo teste.
 * A frente EXAME tinha um "Agendado" só para dois mundos opostos: quem tem exame amanhã e quem fez o
 * exame semana passada sem mandar o ASO. Estes casos travam a distinção.
 */

const EXAME = "2026-08-10";

describe("statusAutomaticoExame", () => {
  it("exame no futuro, sem previsão adiante: nada muda (segue Agendado)", () => {
    const r = statusAutomaticoExame(
      { data: EXAME, horarios: ["09:00"], previsaoAso: EXAME, asoAnexado: false },
      new Date("2026-08-09T12:00:00"),
    );
    expect(r).toBeUndefined();
  });

  it("previsão do ASO DEPOIS da data do exame: Aguardando Liberação Do ASO", () => {
    const r = statusAutomaticoExame(
      { data: EXAME, horarios: ["09:00"], previsaoAso: "2026-08-14", asoAnexado: false },
      new Date("2026-08-09T12:00:00"),
    );
    expect(r).toBe("AGUARDANDO_ASO");
  });

  it("data e hora do exame JÁ PASSARAM e não há ASO: ASO Pendente", () => {
    const r = statusAutomaticoExame(
      { data: EXAME, horarios: ["09:00"], previsaoAso: EXAME, asoAnexado: false },
      new Date("2026-08-10T09:01:00"),
    );
    expect(r).toBe("ASO_PENDENTE");
  });

  it("o ATRASO vence a previsão: exame passado com previsão futura ainda é ASO Pendente", () => {
    // A previsão é uma promessa; o exame que já terminou sem ASO é um fato.
    const r = statusAutomaticoExame(
      { data: EXAME, horarios: ["09:00"], previsaoAso: "2026-08-20", asoAnexado: false },
      new Date("2026-08-11T08:00:00"),
    );
    expect(r).toBe("ASO_PENDENTE");
  });

  it("ASO ANEXADO tira a admissão do verificador (o caminho dali é o APTO, pela IA)", () => {
    const r = statusAutomaticoExame(
      { data: EXAME, horarios: ["09:00"], previsaoAso: "2026-08-20", asoAnexado: true },
      new Date("2026-08-30T08:00:00"),
    );
    expect(r).toBeUndefined();
  });

  it("sem data do exame não há o que decidir", () => {
    expect(
      statusAutomaticoExame({ data: null, asoAnexado: false }, new Date("2026-08-30T08:00:00")),
    ).toBeUndefined();
  });

  describe("REGRA DO ATRASO com MÚLTIPLOS ENDEREÇOS (item 5): vale o ÚLTIMO horário do dia", () => {
    const TRES = ["09:00", "14:30", "17:00"];

    it("depois do primeiro horário, mas antes do último, NÃO é atraso", () => {
      // É o caso que o primeiro horário marcaria errado: o candidato ainda está no roteiro.
      const r = statusAutomaticoExame(
        { data: EXAME, horarios: TRES, previsaoAso: EXAME, asoAnexado: false },
        new Date("2026-08-10T15:00:00"),
      );
      expect(r).toBeUndefined();
    });

    it("depois do ÚLTIMO horário, é atraso", () => {
      const r = statusAutomaticoExame(
        { data: EXAME, horarios: TRES, previsaoAso: EXAME, asoAnexado: false },
        new Date("2026-08-10T17:01:00"),
      );
      expect(r).toBe("ASO_PENDENTE");
    });

    it("a ordem em que os endereços chegam não importa", () => {
      const r = statusAutomaticoExame(
        { data: EXAME, horarios: ["17:00", "09:00", "14:30"], previsaoAso: EXAME, asoAnexado: false },
        new Date("2026-08-10T15:00:00"),
      );
      expect(r).toBeUndefined();
    });
  });

  it("sem horário nenhum, o corte é o fim do dia (não declara atrasado quem tem exame hoje)", () => {
    const meioDia = new Date("2026-08-10T12:00:00");
    expect(
      statusAutomaticoExame({ data: EXAME, previsaoAso: EXAME, asoAnexado: false }, meioDia),
    ).toBeUndefined();
    expect(
      statusAutomaticoExame(
        { data: EXAME, previsaoAso: EXAME, asoAnexado: false },
        new Date("2026-08-11T00:01:00"),
      ),
    ).toBe("ASO_PENDENTE");
  });
});

describe("ultimoHorario e instanteFinalDoExame", () => {
  it("devolve o maior horário e ignora lixo", () => {
    expect(ultimoHorario(["09:00", null, "14:30", undefined, "abc"])).toBe("14:30");
    expect(ultimoHorario([])).toBeUndefined();
    expect(ultimoHorario(undefined)).toBeUndefined();
  });

  it("data inválida não vira instante", () => {
    expect(instanteFinalDoExame("10/08/2026", ["09:00"])).toBeUndefined();
  });

  it("sem horário, o instante final é o fim do dia", () => {
    expect(instanteFinalDoExame(EXAME)).toBe(new Date(`${EXAME}T23:59:00`).getTime());
  });
});
