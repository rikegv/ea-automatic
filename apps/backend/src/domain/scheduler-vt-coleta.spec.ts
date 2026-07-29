import { describe, expect, it } from "vitest";
import {
  agregarCiclo,
  LIMIAR_PARADO_MS,
  schedulerParado,
  type EstadoScheduler,
  type ResumoItemColeta,
} from "./scheduler-vt-coleta";

function estado(over: Partial<EstadoScheduler> = {}): EstadoScheduler {
  return {
    ligado: true,
    ultimoCicloEm: null,
    ultimoCicloOkEm: null,
    varridas: 0,
    novos: 0,
    semAdmissao: 0,
    falhas: 0,
    abortado: false,
    nota: null,
    ...over,
  };
}

describe("schedulerParado (coleta de VT)", () => {
  const agora = Date.now();

  it("DESLIGADO nunca está parado (é decisão do diretor, não falha)", () => {
    expect(schedulerParado(estado({ ligado: false, ultimoCicloOkEm: null }), agora)).toBe(false);
  });

  it("LIGADO e nunca concluiu um ciclo: está parado", () => {
    expect(schedulerParado(estado({ ligado: true, ultimoCicloOkEm: null }), agora)).toBe(true);
  });

  it("LIGADO com ciclo recente: não está parado", () => {
    const recente = new Date(agora - 5 * 60_000).toISOString();
    expect(schedulerParado(estado({ ultimoCicloOkEm: recente }), agora)).toBe(false);
  });

  it("LIGADO sem ciclo há mais que o limiar: está parado", () => {
    const velho = new Date(agora - LIMIAR_PARADO_MS - 1_000).toISOString();
    expect(schedulerParado(estado({ ultimoCicloOkEm: velho }), agora)).toBe(true);
  });
});

describe("agregarCiclo (coleta de VT)", () => {
  const r = (over: Partial<ResumoItemColeta>): ResumoItemColeta => ({
    status: "CASADO",
    novo: false,
    ...over,
  });

  it("conta varridas, novos, semAdmissao, falhas e ignorados por status", () => {
    const resumos: ResumoItemColeta[] = [
      r({ status: "CASADO", novo: true, arquivado: true }), // novo
      r({ status: "CASADO", novo: false, jaProcessado: true }), // ignorado (idempotente)
      r({ status: "SEM_ADMISSAO" }), // semAdmissao
      r({ status: "MULTIPLO" }), // semAdmissao
      r({ status: "NOME_FORA_PADRAO" }), // semAdmissao
      r({ status: "NAO_PDF" }), // ignorado
      r({ status: "ERRO" }), // falha
    ];
    const agg = agregarCiclo(resumos);
    expect(agg.varridas).toBe(7);
    expect(agg.novos).toBe(1);
    expect(agg.semAdmissao).toBe(3);
    expect(agg.falhas).toBe(1);
    expect(agg.ignorados).toBe(2);
  });

  it("ciclo vazio zera tudo", () => {
    expect(agregarCiclo([])).toEqual({
      varridas: 0,
      novos: 0,
      semAdmissao: 0,
      falhas: 0,
      ignorados: 0,
    });
  });
});
