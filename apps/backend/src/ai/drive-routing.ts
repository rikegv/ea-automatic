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
export const CONTRATO_FALLBACK: Record<string, string> = {
  temporario: "1TE3LbPuuaePx_-GR3WNF-c-tFvOWYnXu",
  terceirizado: "19FNSX2fCObrH1uth7t0CesKSHcPzoRkz",
  estagio: "1UjcGJReRHBeiOMbaJ7c3bsgF4NWvxYQ0",
  interno: "1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y",
  "jovem aprendiz": "1VoQA9HiLsXWdCH39BRJaGOfjd2R1uF1y",
};

/** Pasta-pai do contrato "Fopag", resolvida por cod_cliente (igualdade de string). */
export const FOPAG_FALLBACK: Record<string, string> = {
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
 * Um cod_cliente do contrato Fopag TEM pasta-pai mapeada? (fallback em código OU override por env).
 * Usado pela TELA DE DIAGNÓSTICO (Bloco 2): só o Fopag resolve por cliente, então só ele tem a lacuna
 * "cliente novo sem pasta", que derrubou o prontuário do Willden em silêncio.
 */
export function fopagTemPastaPai(codCliente: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const cod = (codCliente ?? "").trim();
  return Boolean(env[envKeyFopag(cod)] ?? FOPAG_FALLBACK[cod]);
}

/**
 * Resolve o ID da pasta-pai do Drive. `null` quando não há mapeamento (não arquivar). Override por
 * env tem precedência sobre o mapa de fallback.
 */
export function resolvePastaPaiId(
  tipoContrato: string | null | undefined,
  // Nulável: cod_cliente da admissão passou a poder ser nulo (Liberação Admissional). O corpo já
  // trata com `?? ""` (sem pasta-pai → não arquiva), então aceitar nulo é seguro e explícito.
  codCliente: string | null | undefined,
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

/**
 * Nome da pasta do prontuário: "{NOME DO CANDIDATO EM CAIXA ALTA} — {nome da operação}" (decisão do
 * diretor). Só o nome do candidato vira caixa alta; a operação fica como está.
 *
 * REAPROVEITAMENTO PRESERVADO. O nome é a CHAVE do reuso da pasta (`buscar_ou_criar_pasta` procura por
 * nome antes de criar), então mudar a caixa poderia deixar de reconhecer as pastas antigas e voltar a
 * DUPLICAR. Isso NÃO acontece porque a busca do Drive (`name = 'X'`) casa de forma INSENSÍVEL à caixa,
 * provado ao vivo na pasta real do Willden: consultar o nome antigo em MAIÚSCULO devolve a MESMA pasta.
 * Efeito prático: candidato que já tem pasta (caixa antiga) continua sendo reaproveitado, e só a pasta
 * NOVA nasce em caixa alta. Nada é renomeado retroativamente. O separador segue como estava (convenção
 * de nome de pasta já existente, fora do texto de UI da §A.11).
 */
export function montarNomePasta(nomeCandidato: string, nomeOperacao: string | null): string {
  return `${nomeCandidato.toUpperCase()} — ${nomeOperacao ?? ""}`.trim();
}

/**
 * Id da pasta a partir da URL gravada em `drive_pasta_url` (OST da duplicação). É o que transforma o
 * link já salvo em ÂNCORA: com o id em mãos, o arquivamento vai direto na pasta e não procura por
 * nome, então duas execuções simultâneas não conseguem mais criar duas pastas.
 *
 * Aceita a forma que o sistema grava (`/drive/folders/<id>`) e também um id cru colado à mão pelo
 * diretor na ação do Diagnóstico. Devolve `null` para qualquer coisa que não seja um id plausível,
 * porque um id inventado faria o arquivamento cair de volta na busca por nome, e é isso que se quer.
 */
export function idDaPastaUrl(url: string | null | undefined): string | null {
  const s = (url ?? "").trim();
  if (!s) return null;
  const doLink = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(s);
  if (doLink) return doLink[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** URL canônica da pasta do Drive a partir do id (referência, não PII). */
export function urlDaPasta(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
