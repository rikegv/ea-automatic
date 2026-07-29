import { describe, expect, it } from "vitest";
import { DrivePastaPaiService, extrairFolderId } from "./drive-pasta-pai.service";
import { montarLinhasSeed } from "../db/drive-pasta-pai-seed-linhas";

/**
 * Fake mínimo do Drizzle para a leitura da tabela: `select().from().where().limit()` resolve para
 * `rows`. Só o caminho que o service exercita (nada de banco real).
 */
function fakeDb(rows: Array<{ folderId: string }>) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    }),
  } as never;
}

describe("DrivePastaPaiService.resolver — precedência tabela > código", () => {
  it("quando a TABELA tem a pasta, usa o valor da tabela (não o fallback)", async () => {
    const svc = new DrivePastaPaiService(fakeDb([{ folderId: "PASTA_DA_TABELA" }]));
    // Fallback de "Temporário" seria 1TE3...; a tabela tem precedência.
    expect(await svc.resolver("Temporário", "16")).toBe("PASTA_DA_TABELA");
    expect(await svc.resolver("Fopag", "44")).toBe("PASTA_DA_TABELA");
  });

  it("quando a TABELA não tem, cai no fallback em código (rede de segurança)", async () => {
    const svc = new DrivePastaPaiService(fakeDb([]));
    expect(await svc.resolver("Temporário", "16")).toBe("1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu");
    expect(await svc.resolver("Jovem Aprendiz", "16")).toBe("1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y");
    expect(await svc.resolver("Fopag", "44")).toBe("1FILnKhlgdPfoz1M_lje_8Rw2w1foGMYi");
  });

  it("contrato não mapeado e Fopag de cliente sem pasta → null (não arquivar)", async () => {
    const svc = new DrivePastaPaiService(fakeDb([]));
    expect(await svc.resolver("42", "16")).toBeNull();
    expect(await svc.resolver("Fopag", "99")).toBeNull();
    expect(await svc.resolver(null, "16")).toBeNull();
    expect(await svc.resolver("", "16")).toBeNull();
  });

  it("fopagTemPastaPai: true pela tabela, senão pelo fallback", async () => {
    expect(await new DrivePastaPaiService(fakeDb([{ folderId: "X" }])).fopagTemPastaPai("99")).toBe(true);
    expect(await new DrivePastaPaiService(fakeDb([])).fopagTemPastaPai("16")).toBe(true);
    expect(await new DrivePastaPaiService(fakeDb([])).fopagTemPastaPai("99")).toBe(false);
  });
});

describe("extrairFolderId — URL do Drive, id cru e lixo", () => {
  it("extrai o id de uma URL .../folders/<id>", () => {
    expect(extrairFolderId("https://drive.google.com/drive/folders/1WXvWoiOMbFFWhLlYMLpCHAh8vTAaYpxn")).toBe(
      "1WXvWoiOMbFFWhLlYMLpCHAh8vTAaYpxn",
    );
    expect(
      extrairFolderId("https://drive.google.com/drive/folders/1AbC_dEf-123?usp=sharing"),
    ).toBe("1AbC_dEf-123");
  });

  it("aceita um id cru válido", () => {
    expect(extrairFolderId("1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu")).toBe("1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu");
  });

  it("rejeita lixo (texto curto, vazio, nulo)", () => {
    expect(extrairFolderId("nada")).toBeNull();
    expect(extrairFolderId("")).toBeNull();
    expect(extrairFolderId(null)).toBeNull();
    expect(extrairFolderId(undefined)).toBeNull();
    expect(extrairFolderId("https://exemplo.com/pasta/abc")).toBeNull();
  });
});

describe("seed drive_pasta_pai — importa os 14 mapeamentos sem perder nenhum", () => {
  it("13 do fallback (5 contratos + 8 Fopag) + 1 override do .env (54792) = 14 pares distintos", () => {
    const linhas = montarLinhasSeed({ DRIVE_FOPAG_54792_FOLDER_ID: "XID54792" });
    const pares = new Set(linhas.map((l) => `${l.escopo}:${l.chave}`));
    expect(pares.size).toBe(14);
    // Todos os contratos do fallback.
    for (const t of ["temporario", "terceirizado", "estagio", "interno", "jovem aprendiz"]) {
      expect(pares.has(`CONTRATO:${t}`)).toBe(true);
    }
    // Todos os Fopag do fallback + o override 54792.
    for (const c of ["16", "19", "27", "28", "29", "33", "34", "44", "54792"]) {
      expect(pares.has(`FOPAG:${c}`)).toBe(true);
    }
  });

  it("override do .env vem PRIMEIRO (precedência env > fallback no par repetido)", () => {
    const linhas = montarLinhasSeed({ DRIVE_FOPAG_16_FOLDER_ID: "ENV16" });
    const primeiro16 = linhas.find((l) => l.escopo === "FOPAG" && l.chave === "16");
    expect(primeiro16?.origem).toBe("env");
    expect(primeiro16?.folderId).toBe("ENV16");
    // Não cria par novo: 16 já existia no fallback → segue 13 distintos.
    expect(new Set(linhas.map((l) => `${l.escopo}:${l.chave}`)).size).toBe(13);
  });

  it("normaliza a chave de contrato vinda do .env (JOVEM_APRENDIZ → 'jovem aprendiz')", () => {
    const linhas = montarLinhasSeed({ DRIVE_CONTRATO_JOVEM_APRENDIZ_FOLDER_ID: "ENVJA" });
    const ja = linhas.find((l) => l.escopo === "CONTRATO" && l.origem === "env");
    expect(ja?.chave).toBe("jovem aprendiz");
    expect(ja?.folderId).toBe("ENVJA");
  });
});
