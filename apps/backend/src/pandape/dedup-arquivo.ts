import { createHash } from "node:crypto";

/**
 * DEDUP POR ARQUIVO (OST dedup + carga retroativa, Bloco 1) — regras PURAS, sem banco nem rede.
 *
 * Antes desta peça a dedup era por (admissão + tipo): impedia duplicar o TIPO, mas não sabia QUAIS
 * arquivos já tinham vindo. Consequência: um scheduler re-baixaria e re-auditaria todo o acervo a
 * cada ciclo. A marca por arquivo é o **SHA-256 do conteúdo** (ver `documento_arquivos_coletados`).
 *
 * §A.6: nada aqui toca nome de arquivo ou URL do Pandapé. O digest é irreversível e não é PII.
 */

/** Estado de documento que força nova tentativa de coleta/auditoria, independente de marca. */
const ESTADOS_SEMPRE_REPROCESSA = new Set(["INCONFORME", "AGUARDANDO_AUDITORIA"]);

/** O que fazer com um TIPO de documento antes de gastar download. */
export type AcaoColeta = "PULAR_SEM_BAIXAR" | "BAIXAR";

export interface ContextoColeta {
  /** Estado atual em `documentos_admissao` (undefined = nunca houve registro para o tipo). */
  estadoAtual?: string;
  /** Quantas marcas de arquivo já existem para (admissão + tipo). */
  hashesConhecidos: number;
  /** Quantos anexos o Pandapé oferece hoje para este tipo (já aplicado o teto do conjunto). */
  arquivosNoPandape: number;
  /** REPROCESSO explícito da varredura: derruba a trava por tipo (ENTREGUE), nunca a idempotência. */
  reprocessar: boolean;
}

/**
 * Decide se o tipo precisa ser baixado. A ordem das regras é o contrato:
 *
 *  1. INCONFORME / AGUARDANDO_AUDITORIA sempre baixam: documento reprovado pode ser reenviado, e
 *     auditoria que não completou tem de ser retentada (a coleta fica gravada, §A.6/desacoplamento).
 *  2. **Acervo idêntico ao já marcado** (mesma quantidade, com pelo menos uma marca) → PULA SEM
 *     BAIXAR. É esta regra que torna o ciclo repetido barato e que dá idempotência ao REPROCESSO:
 *     rodar a varredura duas vezes não baixa nem re-audita o que já está íntegro.
 *  3. REPROCESSO → baixa (é o caminho do passivo: o que está gravado veio do fluxo antigo).
 *  4. Tipo já ENTREGUE → pula, EXCETO quando o acervo do Pandapé cresceu além das marcas: aí chegou
 *     arquivo novo e o conjunto precisa ser rebaixado para receber novo veredito.
 *  5. Caso restante (PENDENTE, ou tipo inédito) → baixa.
 *
 * DOIS LIMITES CONHECIDOS, declarados de propósito, ambos por não podermos persistir nada derivado
 * da URL (§A.6):
 *  - a regra 2 compara QUANTIDADE: arquivo trocado por outro mantendo o total não é percebido sem
 *    baixar;
 *  - um tipo ENTREGUE SEM nenhuma marca (registro do fluxo antigo) segue sendo pulado no pull normal,
 *    porque sem marca não há como saber se o que está no Pandapé é novo. Quem quebra esse empate é a
 *    VARREDURA (reprocessar), que baixa, audita e deixa as marcas gravadas — a partir daí a chegada
 *    de arquivo novo passa a ser detectada por quantidade.
 */
export function decidirColeta(ctx: ContextoColeta): AcaoColeta {
  if (ctx.estadoAtual && ESTADOS_SEMPRE_REPROCESSA.has(ctx.estadoAtual)) return "BAIXAR";
  if (ctx.hashesConhecidos > 0 && ctx.hashesConhecidos === ctx.arquivosNoPandape) {
    return "PULAR_SEM_BAIXAR";
  }
  if (ctx.reprocessar) return "BAIXAR";
  if (ctx.estadoAtual === "ENTREGUE") {
    const podeTerArquivoNovo = ctx.hashesConhecidos > 0 && ctx.arquivosNoPandape > ctx.hashesConhecidos;
    if (!podeTerArquivoNovo) return "PULAR_SEM_BAIXAR";
  }
  return "BAIXAR";
}

export interface ContextoAuditoria {
  /** Arquivos com hash INÉDITO nesta admissão, baixados agora. */
  novos: number;
  /** Marcas que já existiam para (admissão + tipo) ANTES deste ciclo. */
  hashesConhecidosAntes: number;
  /** Estado atual em `documentos_admissao`. */
  estadoAtual?: string;
}

/**
 * Baixados os arquivos, o conjunto precisa de novo veredito?
 *
 *  - **Arquivo novo** → sim. O veredito é do CONJUNTO (auditoria por conjunto): entrando arquivo
 *    novo, o conjunto mudou e o veredito anterior não vale mais.
 *  - **Nenhuma marca anterior** → sim. Ou é coleta inédita, ou é registro do fluxo ANTIGO (mime
 *    quebrado, veredito por arquivo isolado): é exatamente o passivo que o REPROCESSO existe para
 *    corrigir.
 *  - **AGUARDANDO_AUDITORIA** → sim: a coleta está gravada, mas a IA nunca concluiu.
 *  - Caso restante (todas as marcas conhecidas, nada novo) → não. É a idempotência.
 */
export function precisaAuditarConjunto(ctx: ContextoAuditoria): boolean {
  if (ctx.novos > 0) return true;
  if (ctx.hashesConhecidosAntes === 0) return true;
  return ctx.estadoAtual === "AGUARDANDO_AUDITORIA";
}

/**
 * Marca de arquivo: SHA-256 do conteúdo, hex minúsculo. Escolhido em vez de MD5 por ser resistente a
 * colisão (uma colisão aqui faria um documento legítimo ser descartado como "já coletado") e por já
 * existir no `node:crypto`, sem dependência nova. Não é PII: não reverte para o arquivo nem para a
 * pessoa (§A.6).
 */
export function hashArquivo(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
