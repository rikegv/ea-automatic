import { describe, expect, it } from "vitest";
import {
  FOLGA_MINIMA,
  JANELA_MS,
  RitmoClicksign,
  TETO_EA,
  TETO_REAL,
  ehRotaNotificacao,
  janelaDe,
} from "./clicksign-rate";

/**
 * O limitador existe por causa de 4.960 respostas 429 medidas em 25/08/2026, 99,8% delas em GET.
 * Estes testes travam as três decisões que fazem ele funcionar: contar REQUISIÇÃO (e não job),
 * obedecer os headers do provedor, e IGNORAR os headers do `notifications`, que tem balde próprio.
 */
describe("RitmoClicksign: conta requisição, não job", () => {
  it("libera até o teto do EA dentro da mesma janela", () => {
    const r = new RitmoClicksign();
    const t = 1_000_000_000_000; // início de uma janela qualquer
    for (let i = 0; i < TETO_EA; i++) expect(r.aguardar(t)).toBe(0);
  });

  it("passando do teto, manda esperar a VIRADA da janela, não um tempo fixo", () => {
    const r = new RitmoClicksign();
    const base = janelaDe(1_000_000_000_000) * JANELA_MS;
    const t = base + 3_000; // 3s dentro da janela
    for (let i = 0; i < TETO_EA; i++) r.aguardar(t);
    const espera = r.aguardar(t);
    expect(espera).toBeGreaterThan(0);
    // Restam ~7s até a virada, e não os 10s de uma janela inteira.
    expect(espera).toBeLessThanOrEqual(JANELA_MS - 3_000 + 1);
  });

  it("a janela seguinte zera a conta", () => {
    const r = new RitmoClicksign();
    const base = janelaDe(1_000_000_000_000) * JANELA_MS;
    for (let i = 0; i < TETO_EA; i++) r.aguardar(base);
    expect(r.aguardar(base)).toBeGreaterThan(0);
    expect(r.aguardar(base + JANELA_MS)).toBe(0);
  });

  it("o teto do EA é folgado em relação ao do provedor (não encosta no limite)", () => {
    expect(TETO_EA).toBeLessThan(TETO_REAL);
    expect(TETO_EA / TETO_REAL).toBeLessThanOrEqual(0.7);
  });
});

describe("RitmoClicksign: o servidor manda mais que a conta local", () => {
  it("folga baixa informada pelo servidor segura até o reset DELE", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    const resetSeg = Math.floor(agora / 1000) + 7;
    r.alimentar(agora, { remaining: "1", reset: String(resetSeg) }, false);
    const espera = r.aguardar(agora);
    expect(espera).toBeGreaterThan(6_000);
    expect(espera).toBeLessThanOrEqual(7_200);
  });

  it("folga confortável não segura nada", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    r.alimentar(agora, { remaining: String(FOLGA_MINIMA + 20), reset: "0" }, false);
    expect(r.aguardar(agora)).toBe(0);
  });

  it("header ausente ou inválido não quebra nem trava", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    r.alimentar(agora, { remaining: null, reset: null }, false);
    expect(r.aguardar(agora)).toBe(0);
  });
});

/**
 * A EXCEÇÃO QUE PRECISA EXISTIR. O `POST /notifications` tem balde próprio de 1 por janela de 60s
 * POR ENVELOPE, então responde `remaining: 0` SEMPRE. Obedecer esse header pararia o sistema inteiro
 * por um minuto a cada notificação: foi o erro cometido no primeiro reenvio manual, que levou 6
 * minutos para 7 contratos em vez de segundos.
 */
describe("RitmoClicksign: o balde do notifications não contamina o global", () => {
  it("remaining=0 vindo do notifications é DESCARTADO", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    const resetSeg = Math.floor(agora / 1000) + 55;
    r.alimentar(agora, { remaining: "0", reset: String(resetSeg) }, true);
    expect(r.aguardar(agora)).toBe(0);
  });

  it("o MESMO remaining=0 vindo de outra rota SEGURA", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    const resetSeg = Math.floor(agora / 1000) + 5;
    r.alimentar(agora, { remaining: "0", reset: String(resetSeg) }, false);
    expect(r.aguardar(agora)).toBeGreaterThan(0);
  });

  it("ehRotaNotificacao reconhece só a rota do passo 5", () => {
    expect(ehRotaNotificacao("/envelopes/abc/notifications")).toBe(true);
    expect(ehRotaNotificacao("/envelopes/abc")).toBe(false);
    expect(ehRotaNotificacao("/envelopes/abc/signers")).toBe(false);
    expect(ehRotaNotificacao("/envelopes/abc/documents")).toBe(false);
  });
});

describe("RitmoClicksign: 429 espera o reset do servidor, não um backoff cego", () => {
  it("usa o x-rate-limit-reset quando ele é futuro", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    const resetSeg = Math.floor(agora / 1000) + 4;
    const espera = r.esperaDo429(agora, String(resetSeg));
    expect(espera).toBeGreaterThan(3_000);
    expect(espera).toBeLessThanOrEqual(4_200);
    // E o limitador passa a segurar as demais chamadas até lá.
    expect(r.aguardar(agora)).toBeGreaterThan(0);
  });

  it("sem header utilizável, cai numa janela inteira em vez de adivinhar", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    expect(r.esperaDo429(agora, null)).toBe(JANELA_MS);
    expect(r.esperaDo429(agora, "lixo")).toBe(JANELA_MS);
  });

  it("reset no passado não devolve espera negativa", () => {
    const r = new RitmoClicksign();
    const agora = 1_000_000_000_000;
    const passado = Math.floor(agora / 1000) - 30;
    expect(r.esperaDo429(agora, String(passado))).toBe(JANELA_MS);
  });
});
