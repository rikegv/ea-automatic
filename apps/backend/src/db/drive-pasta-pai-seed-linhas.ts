import { CONTRATO_FALLBACK, FOPAG_FALLBACK } from "../ai/drive-routing";

/**
 * Lógica PURA (testável, sem banco) do seed de `drive_pasta_pai`. Monta as linhas a importar a
 * partir do fallback em código (`drive-routing`) e dos overrides do `.env`
 * (`DRIVE_FOPAG_*_FOLDER_ID` / `DRIVE_CONTRATO_*_FOLDER_ID`). Precedência: os overrides do `.env` vêm
 * PRIMEIRO, então no conflito de par (escopo + chave) o valor do `.env` fica (espelha env > fallback).
 * §A.6: `folderId` é identificador do Drive, não é PII.
 */

export type EscopoSeed = "CONTRATO" | "FOPAG";

export interface LinhaSeed {
  escopo: EscopoSeed;
  chave: string;
  folderId: string;
  rotulo: string;
  origem: "env" | "fallback";
}

/** Rótulo amigável, sem travessão (§A.11). "16" (FOPAG) -> "Fopag cliente 16". */
export function rotuloPastaPai(escopo: EscopoSeed, chave: string): string {
  if (escopo === "FOPAG") return `Fopag cliente ${chave}`;
  const titulo = chave
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return `Contrato ${titulo}`;
}

/** Varre o env por overrides de pasta-pai e devolve as linhas correspondentes. */
export function overridesDoEnv(env: NodeJS.ProcessEnv): LinhaSeed[] {
  const linhas: LinhaSeed[] = [];
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue;
    const fopag = k.match(/^DRIVE_FOPAG_(.+)_FOLDER_ID$/);
    if (fopag) {
      const chave = fopag[1].trim();
      linhas.push({ escopo: "FOPAG", chave, folderId: v.trim(), rotulo: rotuloPastaPai("FOPAG", chave), origem: "env" });
      continue;
    }
    const contrato = k.match(/^DRIVE_CONTRATO_(.+)_FOLDER_ID$/);
    if (contrato) {
      // Chave normalizada do runtime: minúscula, "_" volta a espaço (JOVEM_APRENDIZ -> "jovem aprendiz").
      const chave = contrato[1].toLowerCase().replace(/_/g, " ").trim();
      linhas.push({ escopo: "CONTRATO", chave, folderId: v.trim(), rotulo: rotuloPastaPai("CONTRATO", chave), origem: "env" });
    }
  }
  return linhas;
}

/** Linhas do fallback em código (5 contratos + 8 Fopag = 13). */
export function linhasDoFallback(): LinhaSeed[] {
  return [
    ...Object.entries(CONTRATO_FALLBACK).map(([chave, folderId]) => ({
      escopo: "CONTRATO" as const,
      chave,
      folderId,
      rotulo: rotuloPastaPai("CONTRATO", chave),
      origem: "fallback" as const,
    })),
    ...Object.entries(FOPAG_FALLBACK).map(([chave, folderId]) => ({
      escopo: "FOPAG" as const,
      chave,
      folderId,
      rotulo: rotuloPastaPai("FOPAG", chave),
      origem: "fallback" as const,
    })),
  ];
}

/** Overrides do `.env` PRIMEIRO (precedência) e depois o fallback em código. */
export function montarLinhasSeed(env: NodeJS.ProcessEnv): LinhaSeed[] {
  return [...overridesDoEnv(env), ...linhasDoFallback()];
}
