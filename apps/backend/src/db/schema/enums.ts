import { pgEnum } from "drizzle-orm/pg-core";

/** RBAC (CLAUDE.md §A.3): Comum (consultor) · Master · Super Admin. */
export const papelEnum = pgEnum("papel", ["COMUM", "MASTER", "SUPER_ADMIN"]);

/** Farol global da admissão (§A.3). EM_ADMISSAO (inicial) · BANCO_AGUARDAR (Aud=ok & Exame=apto &
 * sem data_admissao; unifica o antigo BANCO_PAUSADA) · ADMISSAO_CONCLUIDA (etapas + contrato
 * assinado) · DECLINOU · RESCISAO. */
export const farolGlobalEnum = pgEnum("farol_global", [
  "EM_ADMISSAO",
  "BANCO_AGUARDAR",
  "ADMISSAO_CONCLUIDA",
  "DECLINOU",
  "RESCISAO",
]);

/** Frentes paralelas e independentes (§A.3 / F12). */
export const frenteTipoEnum = pgEnum("frente_tipo", ["AUDITORIA", "EXAME", "CADASTRO_CONTRATO"]);

/** Exigência de um documento na régua (cliente + cargo). */
export const exigenciaEnum = pgEnum("exigencia_documento", [
  "OBRIGATORIO",
  "NAO_OBRIGATORIO",
  "FACULTATIVO",
]);

/** Estado de um documento exigido na admissão — SÓ status, nunca o arquivo (§A.3 regra 7). */
export const estadoDocumentoEnum = pgEnum("estado_documento", [
  "PENDENTE",
  "ENTREGUE",
  "INCONFORME",
]);

/** Sinalizador de preenchimento da admissão (§A.3 / F5). Marca, nunca bloqueia (regra 5). */
export const sinalizadorEnum = pgEnum("sinalizador_preenchimento", [
  "PENDENTE",
  "PARCIAL",
  "OK",
  "INCONFORMIDADE",
  "COMPETENCIAS",
]);

/**
 * Tipo de não conformidade (Fase 2C — tela de Não Conformidades). Três gatilhos:
 * NC1 = Auditoria concluída com obrigatórios pendentes; NC2 = Exame "apto" sem ASO (aceite do
 * consultor é o gatilho); NC3 = Cadastro incompleto (flags manuais — kit/assinatura/realizado).
 */
export const ncTipoEnum = pgEnum("nc_tipo", ["NC1", "NC2", "NC3"]);

/** Estado de resolução da NC. O registro PERMANECE no histórico mesmo após resolvida. */
export const ncStatusEnum = pgEnum("nc_status", ["ABERTA", "RESOLVIDA"]);

/**
 * Via 2 — liberação por determinação da diretoria. NENHUMA = NC comum (penaliza o consultor);
 * PENDENTE = consultor flagou e aguarda supervisão; APROVADA = exceção reconhecida (não penaliza);
 * REPROVADA = volta a ser NC comum (Via 1).
 */
export const ncLiberacaoEnum = pgEnum("nc_liberacao", [
  "NENHUMA",
  "PENDENTE",
  "APROVADA",
  "REPROVADA",
]);
