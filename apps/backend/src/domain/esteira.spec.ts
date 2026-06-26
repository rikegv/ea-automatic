import { describe, expect, it } from "vitest";
import type { EstadoFrente } from "./frentes";
import { podeAbrirCadastro } from "./frentes";
import {
  conclui,
  isReversao,
  isStatusValido,
  ORDEM_STATUS,
  reversaoDerrubaCadastro,
  STATUS_CONCLUI,
} from "./esteira";

describe("conclui() / isStatusValido() (§A.3 status por frente)", () => {
  it("conclui marca só o status terminal de cada frente", () => {
    expect(conclui("AUDITORIA", "ANALISE_OK")).toBe(true);
    expect(conclui("AUDITORIA", "ANALISE_PENDENTE")).toBe(false);
    expect(conclui("EXAME", "APTO")).toBe(true);
    expect(conclui("EXAME", "AGENDADO")).toBe(false);
    expect(conclui("CADASTRO_CONTRATO", "INTEGRACAO")).toBe(true);
    expect(conclui("CADASTRO_CONTRATO", "ENVIADO")).toBe(false);
  });

  it("STATUS_CONCLUI casa com o catálogo seedado", () => {
    expect(STATUS_CONCLUI).toEqual({
      AUDITORIA: "ANALISE_OK",
      EXAME: "APTO",
      CADASTRO_CONTRATO: "INTEGRACAO",
    });
  });

  it("isStatusValido reconhece só os status da própria frente", () => {
    expect(isStatusValido("AUDITORIA", "ANALISE_OK")).toBe(true);
    expect(isStatusValido("AUDITORIA", "DECLINOU")).toBe(true);
    // status válido, mas de outra frente:
    expect(isStatusValido("AUDITORIA", "APTO")).toBe(false);
    expect(isStatusValido("EXAME", "INTEGRACAO")).toBe(false);
    expect(isStatusValido("CADASTRO_CONTRATO", "FOO")).toBe(false);
  });

  it("ORDEM_STATUS cobre todos os status de cada frente (progressão)", () => {
    expect(ORDEM_STATUS.AUDITORIA).toEqual([
      "ANALISE_PENDENTE",
      "AGUARDA_REENVIO",
      "ANALISE_OK",
      "DECLINOU",
    ]);
    expect(ORDEM_STATUS.EXAME).toEqual(["A_AGENDAR", "AGENDADO", "APTO", "CANCELADO"]);
    expect(ORDEM_STATUS.CADASTRO_CONTRATO).toEqual([
      "A_CADASTRAR",
      "CADASTRADO",
      "ENVIAR",
      "ENVIADO",
      "INTEGRACAO",
    ]);
  });
});

describe("isReversao() — recuo de etapa (F8)", () => {
  it("detecta voltar etapa na progressão", () => {
    expect(isReversao("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE")).toBe(true);
    expect(isReversao("EXAME", "APTO", "A_AGENDAR")).toBe(true);
    expect(isReversao("CADASTRO_CONTRATO", "ENVIADO", "CADASTRADO")).toBe(true);
  });

  it("avançar ou repetir não é reversão", () => {
    expect(isReversao("AUDITORIA", "ANALISE_PENDENTE", "ANALISE_OK")).toBe(false);
    expect(isReversao("EXAME", "A_AGENDAR", "AGENDADO")).toBe(false);
    expect(isReversao("EXAME", "APTO", "APTO")).toBe(false);
  });

  it("status fora do catálogo nunca é reversão", () => {
    expect(isReversao("AUDITORIA", "FOO", "ANALISE_OK")).toBe(false);
    expect(isReversao("AUDITORIA", "ANALISE_OK", "BAR")).toBe(false);
  });
});

describe("GATE CONTÍNUO do Cadastro (§A.3 regra 3) — sequência operacional", () => {
  // Modela o estado das duas frentes concluintes ao longo das mudanças de status.
  const gate = (auditoriaStatus: string, exameStatus: string): boolean => {
    const frentes: EstadoFrente[] = [
      { tipo: "AUDITORIA", concluida: conclui("AUDITORIA", auditoriaStatus) },
      { tipo: "EXAME", concluida: conclui("EXAME", exameStatus) },
    ];
    return podeAbrirCadastro(frentes);
  };

  it("sobe AUDITORIA→ok e EXAME→apto ⇒ abre; reverte AUDITORIA ⇒ recua; reabre ao voltar a ok", () => {
    // partida: nada concluído
    expect(gate("ANALISE_PENDENTE", "A_AGENDAR")).toBe(false);
    // AUDITORIA conclui, EXAME ainda não → independência (regra 2), não abre
    expect(gate("ANALISE_OK", "AGENDADO")).toBe(false);
    // EXAME conclui também → gate abre
    expect(gate("ANALISE_OK", "APTO")).toBe(true);
    // REVERSÃO: AUDITORIA recua para pendente → gate RECUA
    expect(gate("ANALISE_PENDENTE", "APTO")).toBe(false);
    // volta AUDITORIA para ok → gate REABRE (continuidade)
    expect(gate("ANALISE_OK", "APTO")).toBe(true);
  });
});

describe("reversaoDerrubaCadastro() — alerta de reabrir pendência", () => {
  it("true quando uma concluinte cai do terminal com o cadastro aberto", () => {
    // gate estava aberto (AUDITORIA ok + EXAME apto) e AUDITORIA recua
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", true)).toBe(true);
    expect(reversaoDerrubaCadastro("EXAME", "APTO", "AGENDADO", true)).toBe(true);
  });

  it("false quando o gate nem estava aberto", () => {
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", false)).toBe(
      false,
    );
  });

  it("false quando a frente não saiu do status terminal (não recua o gate)", () => {
    // de não conclui → não havia conclusão para derrubar
    expect(reversaoDerrubaCadastro("AUDITORIA", "AGUARDA_REENVIO", "ANALISE_PENDENTE", true)).toBe(
      false,
    );
    // para ainda conclui → continua concluída
    expect(reversaoDerrubaCadastro("EXAME", "APTO", "APTO", true)).toBe(false);
  });

  it("CADASTRO_CONTRATO nunca derruba o próprio gate", () => {
    expect(reversaoDerrubaCadastro("CADASTRO_CONTRATO", "INTEGRACAO", "ENVIADO", true)).toBe(false);
  });
});
