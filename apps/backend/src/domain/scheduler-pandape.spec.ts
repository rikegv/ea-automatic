import { describe, expect, it } from "vitest";
import {
  agregarCiclo,
  schedulerParado,
  SCHEDULER_LIMIAR_PARADO_MS,
  type EstadoScheduler,
} from "./scheduler-pandape";

const BASE: EstadoScheduler = {
  ligado: true,
  ultimoCicloEm: null,
  ultimoCicloOkEm: null,
  varridas: 0,
  novos: 0,
  falhas: 0,
  abortado: false,
  nota: null,
};

describe("schedulerParado", () => {
  const agora = Date.parse("2026-07-24T12:00:00.000Z");

  it("DESLIGADO nunca está parado (é decisão do diretor, não falha)", () => {
    expect(schedulerParado({ ...BASE, ligado: false, ultimoCicloOkEm: null }, agora)).toBe(false);
    // Mesmo com heartbeat velho: desligado não acende.
    const velho = new Date(agora - 10 * 3_600_000).toISOString();
    expect(schedulerParado({ ...BASE, ligado: false, ultimoCicloOkEm: velho }, agora)).toBe(false);
  });

  it("LIGADO e nunca concluiu um ciclo → parado", () => {
    expect(schedulerParado({ ...BASE, ligado: true, ultimoCicloOkEm: null }, agora)).toBe(true);
  });

  it("LIGADO com ciclo recente → não parado", () => {
    const recente = new Date(agora - 5 * 60 * 1000).toISOString(); // 5 min atrás
    expect(schedulerParado({ ...BASE, ligado: true, ultimoCicloOkEm: recente }, agora)).toBe(false);
  });

  it("LIGADO e sem ciclo há mais que o limiar → parado", () => {
    const velho = new Date(agora - SCHEDULER_LIMIAR_PARADO_MS - 60_000).toISOString();
    expect(schedulerParado({ ...BASE, ligado: true, ultimoCicloOkEm: velho }, agora)).toBe(true);
  });

  it("exatamente no limiar ainda não está parado (tolerância)", () => {
    const noLimiar = new Date(agora - SCHEDULER_LIMIAR_PARADO_MS).toISOString();
    expect(schedulerParado({ ...BASE, ligado: true, ultimoCicloOkEm: noLimiar }, agora)).toBe(false);
  });
});

describe("agregarCiclo", () => {
  it("soma varridas/novos/auditorias/falhas e ignora admissões inertes", () => {
    const agg = agregarCiclo([
      { tipos: [{ novos: 2, acao: "AUDITADO" }, { novos: 0, acao: "PULADO_SEM_BAIXAR" }] },
      { tipos: [{ novos: 1, acao: "AUDITADO" }, { novos: 0, acao: "FALHA" }] },
      { inerte: true, tipos: [] }, // não conta como varrida.
      { tipos: [] }, // varrida sem nada novo.
    ]);
    expect(agg.varridas).toBe(3);
    expect(agg.novos).toBe(3);
    expect(agg.auditorias).toBe(2);
    expect(agg.falhas).toBe(1);
  });

  it("ciclo vazio (nenhuma admissão) zera tudo", () => {
    expect(agregarCiclo([])).toEqual({ varridas: 0, novos: 0, auditorias: 0, falhas: 0 });
  });

  it("idempotência de custo: um ciclo em que tudo foi pulado NÃO conta auditoria", () => {
    const agg = agregarCiclo([
      { tipos: [{ novos: 0, acao: "PULADO_SEM_BAIXAR" }] },
      { tipos: [{ novos: 0, acao: "PULADO_NADA_NOVO" }] },
      { tipos: [{ novos: 0, acao: "PULADO_VALIDACAO_HUMANA" }] },
    ]);
    expect(agg.auditorias).toBe(0);
    expect(agg.novos).toBe(0);
    expect(agg.varridas).toBe(3);
  });
});
