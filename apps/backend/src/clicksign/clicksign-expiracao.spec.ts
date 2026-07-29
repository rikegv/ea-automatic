import { describe, expect, it } from "vitest";
import {
  agregarCiclo,
  envelopeExpirado,
  schedulerParado,
  INTERVALO_MS,
  LIMIAR_PARADO_MS,
  PRAZO_ENVELOPE_MS,
  type EstadoScheduler,
} from "../domain/scheduler-clicksign";

const AGORA = Date.UTC(2026, 6, 28, 12, 0, 0);
const DIA = 24 * 60 * 60 * 1000;

function estado(over: Partial<EstadoScheduler> = {}): EstadoScheduler {
  return {
    ligado: true,
    ultimoCicloEm: null,
    ultimoCicloOkEm: null,
    varridas: 0,
    assinados: 0,
    expirados: 0,
    falhas: 0,
    nota: null,
    ...over,
  };
}

describe("scheduler-clicksign — prazo do envelope (INT-4)", () => {
  it("o prazo do EA é o MESMO que vai no deadline_at do envelope (30 dias)", () => {
    // Amarrado de propósito: o EA não pode expirar antes da Clicksign nem depois dela.
    expect(PRAZO_ENVELOPE_MS).toBe(30 * DIA);
  });

  it("dentro do prazo NÃO expira (inclusive no limite exato)", () => {
    expect(envelopeExpirado(new Date(AGORA - 29 * DIA), AGORA)).toBe(false);
    expect(envelopeExpirado(new Date(AGORA - PRAZO_ENVELOPE_MS), AGORA)).toBe(false);
  });

  it("passado o prazo, expira", () => {
    expect(envelopeExpirado(new Date(AGORA - 31 * DIA), AGORA)).toBe(true);
  });

  it("FAIL-SAFE: sem carimbo de envio NUNCA expira (envelope anterior a esta entrega)", () => {
    // Se a regra fosse a inversa, o primeiro ciclo expiraria em massa todo envelope antigo.
    expect(envelopeExpirado(null, AGORA)).toBe(false);
  });

  it("carimbo inválido também não expira (nunca expira por dado corrompido)", () => {
    expect(envelopeExpirado("data-que-nao-existe", AGORA)).toBe(false);
  });

  it("aceita ISO string além de Date (o que vem do banco em qualquer driver)", () => {
    expect(envelopeExpirado(new Date(AGORA - 31 * DIA).toISOString(), AGORA)).toBe(true);
  });
});

describe("scheduler-clicksign — sinal de scheduler parado", () => {
  it("LIGADO e sem nenhum ciclo bem-sucedido → PARADO", () => {
    expect(schedulerParado(estado(), AGORA)).toBe(true);
  });

  it("DESLIGADO nunca está parado (é decisão do diretor, não falha)", () => {
    expect(schedulerParado(estado({ ligado: false }), AGORA)).toBe(false);
  });

  it("ciclo recente → não está parado", () => {
    const ok = new Date(AGORA - INTERVALO_MS).toISOString();
    expect(schedulerParado(estado({ ultimoCicloOkEm: ok }), AGORA)).toBe(false);
  });

  it("sem ciclo além do limiar → parado", () => {
    const ok = new Date(AGORA - LIMIAR_PARADO_MS - 60_000).toISOString();
    expect(schedulerParado(estado({ ultimoCicloOkEm: ok }), AGORA)).toBe(true);
  });

  it("o limiar tolera cadências perdidas (não acende no primeiro atraso)", () => {
    expect(LIMIAR_PARADO_MS).toBeGreaterThan(INTERVALO_MS * 2);
  });
});

describe("scheduler-clicksign — agregação do ciclo", () => {
  it("conta varridas, assinados, expirados e falhas", () => {
    const ag = agregarCiclo([
      { assinado: true },
      { expirado: true },
      { falha: true },
      {},
      { assinado: true },
    ]);
    expect(ag).toEqual({ varridas: 5, assinados: 2, expirados: 1, falhas: 1 });
  });

  it("ciclo vazio agrega em zeros (base sem envelope aberto)", () => {
    expect(agregarCiclo([])).toEqual({ varridas: 0, assinados: 0, expirados: 0, falhas: 0 });
  });
});
