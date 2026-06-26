import { describe, expect, it } from "vitest";
import { calcSinalizadorPreenchimento, STATUS_INICIAL_FRENTE } from "./admissao";

describe("STATUS_INICIAL_FRENTE (§A.3 regra 1)", () => {
  it("AUDITORIA nasce em ANALISE_PENDENTE e EXAME em A_AGENDAR", () => {
    expect(STATUS_INICIAL_FRENTE.AUDITORIA).toBe("ANALISE_PENDENTE");
    expect(STATUS_INICIAL_FRENTE.EXAME).toBe("A_AGENDAR");
  });
});

describe("calcSinalizadorPreenchimento (§A.3 / F5)", () => {
  const completo = {
    candidato: { nome: "Maria Souza", cpf: "39053344705" },
    codCliente: "1001",
    cargoId: "11111111-1111-1111-1111-111111111111",
    dataAdmissao: "2026-07-01",
    tipoContrato: "CLT",
    vagaFolha: { salario: "1800.00" },
  };

  it("retorna OK com todos os campos-núcleo presentes", () => {
    expect(calcSinalizadorPreenchimento(completo)).toBe("OK");
  });

  it("retorna PARCIAL com identidade + cliente + cargo, faltando campos-núcleo", () => {
    expect(
      calcSinalizadorPreenchimento({
        candidato: { nome: "Maria Souza", cpf: "39053344705" },
        codCliente: "1001",
        cargoId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBe("PARCIAL");
    // salário ausente ainda é PARCIAL (não bloqueia — regra 5)
    expect(
      calcSinalizadorPreenchimento({ ...completo, vagaFolha: { salario: "" } }),
    ).toBe("PARCIAL");
  });

  it("retorna PENDENTE com só identidade (ou menos)", () => {
    expect(
      calcSinalizadorPreenchimento({ candidato: { nome: "Maria Souza", cpf: "39053344705" } }),
    ).toBe("PENDENTE");
    // identidade presente mas sem cliente/cargo → ainda PENDENTE
    expect(
      calcSinalizadorPreenchimento({
        candidato: { nome: "Maria Souza", cpf: "39053344705" },
        dataAdmissao: "2026-07-01",
        tipoContrato: "CLT",
        vagaFolha: { salario: "1800.00" },
      }),
    ).toBe("PENDENTE");
    expect(calcSinalizadorPreenchimento({})).toBe("PENDENTE");
  });
});
