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
  // RÉGUA UNIFICADA (§A.17 etapa 4): "completo" passou a ser "zero pendência obrigatória", então o
  // caso OK precisa dos MESMOS 8 campos que a pendência cobra, não só dos 7 antigos. Era esta a
  // divergência que fazia a coluna dizer "Completo" e o modal listar pendência na mesma admissão.
  const completo = {
    candidato: { nome: "Maria Souza", cpf: "39053344705" },
    codCliente: "1001",
    cargoId: "11111111-1111-1111-1111-111111111111",
    dataAdmissao: "2026-07-01",
    tipoContrato: "CLT",
    vagaFolha: {
      salario: "1800.00",
      beneficios: "VT (Vale-Transporte)",
      escala: "5x2",
      centroCusto: "CC1",
      gestorBp: "Ana",
    },
  };

  it("retorna OK sem nenhuma pendência obrigatória", () => {
    expect(calcSinalizadorPreenchimento(completo)).toBe("OK");
  });

  it("régua unificada: sinalizador e pendências NUNCA se contradizem", () => {
    // O bug: núcleo cheio, mas SEM pacote de benefícios -> antes dava OK ("Completo" na coluna)
    // enquanto o modal listava "Pacote de benefícios". Agora os dois concordam.
    const semBeneficio = {
      ...completo,
      vagaFolha: { ...completo.vagaFolha, beneficios: null },
    };
    expect(pendenciasObrigatorias(semBeneficio)).toContain("Pacote de benefícios");
    expect(calcSinalizadorPreenchimento(semBeneficio)).toBe("PARCIAL");

    // Idem para centro de custo e gestor/BP, que também só existiam na régua da pendência.
    const semCentro = { ...completo, vagaFolha: { ...completo.vagaFolha, centroCusto: null } };
    expect(pendenciasObrigatorias(semCentro)).toContain("Centro de custo");
    expect(calcSinalizadorPreenchimento(semCentro)).toBe("PARCIAL");

    // E o inverso: zero pendência <=> OK.
    expect(pendenciasObrigatorias(completo)).toEqual([]);
    expect(calcSinalizadorPreenchimento(completo)).toBe("OK");
  });

  it("tipo de contrato voltou para a régua: sem ele, sinalizador e pendência concordam", () => {
    const semContrato = { ...completo, tipoContrato: "" };
    expect(pendenciasObrigatorias(semContrato)).toContain("Tipo de contrato");
    expect(calcSinalizadorPreenchimento(semContrato)).toBe("PARCIAL");
  });

  it("pacote ESTRUTURADO conta como benefício preenchido (admissão nova, sem string)", () => {
    const estruturado = {
      ...completo,
      vagaFolha: { ...completo.vagaFolha, beneficios: null },
      temBeneficioEstruturado: true,
    };
    expect(pendenciasObrigatorias(estruturado)).toEqual([]);
    expect(calcSinalizadorPreenchimento(estruturado)).toBe("OK");
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
        tipoContrato: "",
        vagaFolha: { salario: "", beneficios: "", escala: "", centroCusto: "", gestorBp: "" },
      }),
    ).toEqual([
      "Salário",
      // Tipo de contrato voltou para a régua (decisão do diretor). Como o sinalizador DERIVA
      // daqui, ele volta a ser cobrado na coluna, no KPI e no radar de uma vez só.
      "Tipo de contrato",
      "Data de admissão",
      "Pacote de benefícios",
      "Escala",
      "Centro de custo",
      "Gestor / BP",
    ]);
  });

  it("Centro de custo e Gestor / BP vazios geram pendência (item 4, não-bloqueante)", () => {
    expect(
      pendenciasObrigatorias({
        codCliente: "1001",
        cargoId: "x",
        dataAdmissao: "2026-07-01",
        tipoContrato: "CLT",
        vagaFolha: {
          salario: "1800",
          beneficios: "VR",
          escala: "6x1",
          centroCusto: "",
          gestorBp: "",
        },
      }),
    ).toEqual(["Centro de custo", "Gestor / BP"]);
  });

  it("sem pendências quando tudo preenchido", () => {
    expect(
      pendenciasObrigatorias({
        codCliente: "1001",
        cargoId: "x",
        dataAdmissao: "2026-07-01",
        tipoContrato: "CLT",
        vagaFolha: {
          salario: "1800",
          beneficios: "VR",
          escala: "6x1",
          centroCusto: "CC01",
          gestorBp: "Fulano",
        },
      }),
    ).toEqual([]);
  });

  it("admissão de banco: sem data não é pendência; exige Termo de Banco até entregue", () => {
    const base = {
      codCliente: "1001",
      cargoId: "x",
      dataAdmissao: "",
      tipoContrato: "CLT",
      vagaFolha: {
        salario: "1800",
        beneficios: "VR",
        escala: "6x1",
        centroCusto: "CC01",
        gestorBp: "Fulano",
      },
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
