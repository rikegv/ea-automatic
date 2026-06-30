import { describe, expect, it } from "vitest";
import { montarNomePasta, resolvePastaPaiId, resolveSubpasta } from "./drive-routing";

describe("resolvePastaPaiId — por tipo de contrato (acento/caixa-insensível)", () => {
  it("resolve cada contrato fixo, tolerante a acento e caixa", () => {
    expect(resolvePastaPaiId("Temporário", "16", {})).toBe("1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu");
    expect(resolvePastaPaiId("temporario", "16", {})).toBe("1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu");
    expect(resolvePastaPaiId("TERCEIRIZADO", "16", {})).toBe("19FNSX2fCObrH1uth7t0CesKSHcPzoRkz");
    expect(resolvePastaPaiId("Estágio", "16", {})).toBe("1UjcGJReRHBeiOMbaJ7c3bsgF4NWvxYQ0");
  });

  it("Jovem Aprendiz compartilha a pasta do Interno", () => {
    const interno = resolvePastaPaiId("Interno", "16", {});
    expect(resolvePastaPaiId("Jovem Aprendiz", "16", {})).toBe(interno);
    expect(interno).toBe("1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y");
  });
});

describe("resolvePastaPaiId — Fopag resolve por cod_cliente", () => {
  it("usa o mapa por código quando o contrato é Fopag", () => {
    expect(resolvePastaPaiId("Fopag", "16", {})).toBe("1bt7fXm2BdKv8ium9k5J8In5u334r-YLY");
    expect(resolvePastaPaiId("fopag", "44", {})).toBe("1FILnKhlgdPfoz1M_lje_8Rw2w1foGMYi");
  });

  it("resolve TODOS os 8 cod_cliente de Fopag para pastas distintas e não nulas", () => {
    const codigos = ["16", "19", "27", "28", "29", "33", "34", "44"];
    const ids = codigos.map((c) => resolvePastaPaiId("Fopag", c, {}));
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(codigos.length);
  });

  it("Fopag com cliente não mapeado → null (não arquivar)", () => {
    expect(resolvePastaPaiId("Fopag", "99", {})).toBeNull();
  });
});

describe("resolvePastaPaiId — skip e overrides", () => {
  it("contrato não mapeado (42/43), vazio, nulo e indefinido → null", () => {
    expect(resolvePastaPaiId("42", "16", {})).toBeNull();
    expect(resolvePastaPaiId("43", "16", {})).toBeNull();
    expect(resolvePastaPaiId("", "16", {})).toBeNull();
    expect(resolvePastaPaiId(null, "16", {})).toBeNull();
    expect(resolvePastaPaiId(undefined, "16", {})).toBeNull();
  });

  it("env tem precedência sobre o fallback (contrato e fopag)", () => {
    expect(
      resolvePastaPaiId("Temporário", "16", { DRIVE_CONTRATO_TEMPORARIO_FOLDER_ID: "ENVID" }),
    ).toBe("ENVID");
    expect(resolvePastaPaiId("Fopag", "16", { DRIVE_FOPAG_16_FOLDER_ID: "ENVFOPAG" })).toBe(
      "ENVFOPAG",
    );
  });
});

describe("resolveSubpasta — roteamento por tipo de documento", () => {
  it("ASO → ASO; VT/transporte → BENEFICIOS; demais → DOCUMENTOS_PESSOAIS", () => {
    expect(resolveSubpasta("ASO")).toBe("ASO");
    expect(resolveSubpasta("FORMULARIO_VT")).toBe("BENEFICIOS");
    expect(resolveSubpasta("CARTAO_TRANSPORTE")).toBe("BENEFICIOS");
    expect(resolveSubpasta("RG")).toBe("DOCUMENTOS_PESSOAIS");
    expect(resolveSubpasta("CPF")).toBe("DOCUMENTOS_PESSOAIS");
    expect(resolveSubpasta("DESCONHECIDO")).toBe("DOCUMENTOS_PESSOAIS");
  });
});

describe("montarNomePasta", () => {
  it("formata '{candidato} — {operação}'", () => {
    expect(montarNomePasta("Maria Silva", "Loja Centro")).toBe("Maria Silva — Loja Centro");
  });

  it("tolera operação nula (sem quebrar o nome do prontuário)", () => {
    expect(montarNomePasta("Maria Silva", null)).toBe("Maria Silva —");
  });
});
