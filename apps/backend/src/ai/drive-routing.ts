/**
 * Roteamento do arquivamento no Drive (INT-2 / Fase 4). PURO e testável. Resolve:
 *  1. a pasta-PAI por `tipo_contrato` (e por `cod_cliente` quando o contrato é "Fopag");
 *  2. a subpasta (DriveSubpasta) por tipo de documento.
 *
 * Os IDs de pasta NÃO são segredo (são apenas identificadores do Drive), mas ficam configuráveis
 * por env (DRIVE_CONTRATO_*_FOLDER_ID / DRIVE_FOPAG_*_FOLDER_ID) com fallback ao mapa abaixo, para
 * o devops trocar a árvore sem deploy. Contrato não mapeado (ex.: 42/43, Fopag fora da lista) →
 * `null` → a Auditoria NÃO arquiva e mantém a staging viva até o TTL (§A.6).
 */
import type { DriveSubpasta } from "@ea/shared-types";

/** Remove acento e caixa para casar "Temporário" → "temporario" etc. */
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Pasta-pai por tipo de contrato (chave normalizada). Jovem Aprendiz compartilha a do Interno. */
const CONTRATO_FALLBACK: Record<string, string> = {
  temporario: "1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu",
  terceirizado: "19FNSX2fCObrH1uth7t0CesKSHcPzoRkz",
  estagio: "1UjcGJReRHBeiOMbaJ7c3bsgF4NWvxYQ0",
  interno: "1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y",
  "jovem aprendiz": "1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y",
};

/** Pasta-pai do contrato "Fopag", resolvida por cod_cliente (igualdade de string). */
const FOPAG_FALLBACK: Record<string, string> = {
  "16": "1WXvWoiOMbFFWhLlYMLpCHAh8vTAaYpxn",
  "19": "1wQXWDKnfZo6mdTelu1MQYFXstixqD6CZ",
  "27": "17R3Jrpf9vDnn6CwlkM-dlxnWt1dMCquB",
  "28": "1fuifnIMbwo6tmH8YEc6-0l52T-RAtqrS",
  "29": "1UIiR1XBw8yVzgckoZMaPlGHfTPzsVplB",
  "33": "1yJEoMG76rEsT-tbBcMYYrN8fozqfOYc-",
  "34": "1sOSCN9ev15clCwCK_X_GlhXF_IlGEEJe",
  "44": "1FILnKhlgdPfoz1M_lje_8Rw2w1foGMYi",
};

function envKeyContrato(key: string): string {
  return `DRIVE_CONTRATO_${key.replace(/ /g, "_").toUpperCase()}_FOLDER_ID`;
}
function envKeyFopag(cod: string): string {
  return `DRIVE_FOPAG_${cod}_FOLDER_ID`;
}

/**
 * Resolve o ID da pasta-pai do Drive. `null` quando não há mapeamento (não arquivar). Override por
 * env tem precedência sobre o mapa de fallback.
 */
export function resolvePastaPaiId(
  tipoContrato: string | null | undefined,
  codCliente: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const t = norm(tipoContrato ?? "");
  if (!t) return null;
  if (t === "fopag") {
    const cod = (codCliente ?? "").trim();
    return env[envKeyFopag(cod)] ?? FOPAG_FALLBACK[cod] ?? null;
  }
  return env[envKeyContrato(t)] ?? CONTRATO_FALLBACK[t] ?? null;
}

/** Benefício → BENEFICIOS; ASO → ASO; Termo de Banco → ADMISSAO; demais → DOCUMENTOS_PESSOAIS. */
const SUBPASTA_POR_CODIGO: Record<string, DriveSubpasta> = {
  ASO: "ASO",
  FORMULARIO_VT: "BENEFICIOS",
  CARTAO_TRANSPORTE: "BENEFICIOS",
  TERMO_BANCO: "ADMISSAO",
};

/** Subpasta de destino do documento (default DOCUMENTOS_PESSOAIS). Casa por código do tipo. */
export function resolveSubpasta(codigoTipo: string): DriveSubpasta {
  return SUBPASTA_POR_CODIGO[(codigoTipo ?? "").toUpperCase()] ?? "DOCUMENTOS_PESSOAIS";
}

/** Nome da pasta do prontuário: "{nome do candidato} — {nome da operação do cliente}". */
export function montarNomePasta(nomeCandidato: string, nomeOperacao: string | null): string {
  return `${nomeCandidato} — ${nomeOperacao ?? ""}`.trim();
}
