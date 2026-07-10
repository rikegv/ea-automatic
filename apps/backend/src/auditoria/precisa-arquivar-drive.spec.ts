import { describe, expect, it } from "vitest";
import { precisaArquivarDrive } from "./auditoria.service";

/**
 * BUG 1 (OST-1): o ícone do Drive do candidato caía em 404. Causa: `drive_pasta_url` guardava um
 * placeholder de MOCK (`.../folders/MOCK-<hash>`, gerado com DRIVE_MOCK=on) que aponta para pasta
 * inexistente; e o gate de arquivamento só regravava quando a URL era `null`, então o link mock nunca
 * era substituído mesmo com DRIVE_MOCK=off. O guard passa a tratar a URL de MOCK como "não arquivado".
 */
describe("precisaArquivarDrive — self-heal de link de Drive", () => {
  it("arquiva quando ainda não há link (null)", () => {
    expect(precisaArquivarDrive(null)).toBe(true);
  });

  it("re-arquiva quando o link é um placeholder de MOCK (evita o 404)", () => {
    expect(precisaArquivarDrive("https://drive.google.com/drive/folders/MOCK-c6eb6fac")).toBe(true);
  });

  it("NÃO re-arquiva um link real de pasta do Drive", () => {
    expect(
      precisaArquivarDrive(
        "https://drive.google.com/drive/folders/1Bkd_3XdNEISacPRJSRtHaTzSHV0dXf7d",
      ),
    ).toBe(false);
  });
});
