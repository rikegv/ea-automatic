/**
 * Mapeamento PURO do veredito da IA (AuditoriaStatus) para o estado persistido do documento
 * (§A.3 regra 7 — só status, nunca o arquivo). Centraliza a tradução que o `AuditoriaService`
 * aplica ao gravar `documentos_admissao.estado`. Testável isoladamente.
 */
import { AUDITORIA_PARA_ESTADO, type AuditoriaStatus } from "@ea/shared-types";

export type EstadoDocumentoPersistido = "PENDENTE" | "ENTREGUE" | "INCONFORME";

/** Veredito da IA → estado_documento. VALIDADO→ENTREGUE, INCONFORME→INCONFORME, PENDENTE→PENDENTE. */
export function estadoDocumentoDeAuditoria(status: AuditoriaStatus): EstadoDocumentoPersistido {
  return AUDITORIA_PARA_ESTADO[status];
}

/** Trunca o motivo do veredito para caber em `observacao` (cap defensivo — sem PII, §A.6). */
export function limitarMotivo(motivo: string | null | undefined, max = 500): string {
  return (motivo ?? "").slice(0, max);
}
