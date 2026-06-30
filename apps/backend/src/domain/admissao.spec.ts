import { describe, expect, it } from "vitest";
import {
  calcSinalizadorPreenchimento,
  deriveFarolGlobal,
  pendenciasObrigatorias,
  STATUS_INICIAL_FRENTE,
} from "./admissao";

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
    expect(calcSinalizadorPreenchimento({ ...completo, vagaFolha: { salario: "" } })).toBe(
      "PARCIAL",
    );
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

describe("pendenciasObrigatorias (S2/S3)", () => {
  it("lista os campos obrigatórios vazios", () => {
    expect(
      pendenciasObrigatorias({
        codCliente: "1001",
        cargoId: "x",
        dataAdmissao: "",
        vagaFolha: { salario: "", beneficios: "", escala: "" },
      }),
    ).toEqual(["Salário", "Data de admissão", "Pacote de benefícios", "Escala"]);
  });

  it("sem pendências quando tudo preenchido", () => {
    expect(
      pendenciasObrigatorias({
        codCliente: "1001",
        cargoId: "x",
        dataAdmissao: "2026-07-01",
        vagaFolha: { salario: "1800", beneficios: "VR", escala: "6x1" },
      }),
    ).toEqual([]);
  });

  it("admissão de banco: sem data não é pendência; exige Termo de Banco até entregue", () => {
    const base = {
      codCliente: "1001",
      cargoId: "x",
      dataAdmissao: "",
      vagaFolha: { salario: "1800", beneficios: "VR", escala: "6x1" },
      isBanco: true,
    };
    // sem termo → "Termo de Banco" no lugar de "Data de admissão"
    expect(pendenciasObrigatorias(base)).toEqual(["Termo de Banco"]);
    // termo entregue → sem pendências (data ausente é esperada)
    expect(pendenciasObrigatorias({ ...base, termoBancoEntregue: true })).toEqual([]);
  });
});

describe("deriveFarolGlobal (§A.3 / Fase 4 complemento)", () => {
  it("BANCO_AGUARDAR quando Auditoria=ok, Exame=apto e sem data de admissão", () => {
    expect(
      deriveFarolGlobal({
        atual: "EM_ADMISSAO",
        auditoriaConcluida: true,
        exameApto: true,
        temDataAdmissao: false,
      }),
    ).toBe("BANCO_AGUARDAR");
  });

  it("volta a EM_ADMISSAO quando a data de admissão é preenchida", () => {
    expect(
      deriveFarolGlobal({
        atual: "BANCO_AGUARDAR",
        auditoriaConcluida: true,
        exameApto: true,
        temDataAdmissao: true,
      }),
    ).toBe("EM_ADMISSAO");
  });

  it("EM_ADMISSAO enquanto as frentes não concluíram", () => {
    expect(
      deriveFarolGlobal({
        atual: "EM_ADMISSAO",
        auditoriaConcluida: true,
        exameApto: false,
        temDataAdmissao: false,
      }),
    ).toBe("EM_ADMISSAO");
  });

  it("não sobrescreve estados manuais (DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA)", () => {
    for (const atual of ["DECLINOU", "RESCISAO", "ADMISSAO_CONCLUIDA"] as const) {
      expect(
        deriveFarolGlobal({
          atual,
          auditoriaConcluida: true,
          exameApto: true,
          temDataAdmissao: false,
        }),
      ).toBe(atual);
    }
  });
});
