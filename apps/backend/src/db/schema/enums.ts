import { pgEnum } from "drizzle-orm/pg-core";

/** RBAC (CLAUDE.md §A.3): Comum (consultor) · Master · Super Admin. */
export const papelEnum = pgEnum("papel", ["COMUM", "MASTER", "SUPER_ADMIN"]);

/** Farol global da admissão (§A.3). */
export const farolGlobalEnum = pgEnum("farol_global", [
  "ATIVO",
  "DECLINOU",
  "RESCISAO",
  "BANCO_PAUSADA",
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
