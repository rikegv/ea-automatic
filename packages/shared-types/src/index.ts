/**
 * @ea/shared-types — contratos de domínio compartilhados entre backend, frontend e ai-service.
 * Fase 0: vocabulário do domínio (CLAUDE.md §A.3) + utilitários puros. Sem dependências de runtime.
 */

// ── Papéis de acesso (RBAC) ────────────────────────────────────────────────
export const PAPEL = ["COMUM", "MASTER", "SUPER_ADMIN"] as const;
export type Papel = (typeof PAPEL)[number];

// ── Farol global da admissão ───────────────────────────────────────────────
export const FAROL_GLOBAL = ["ATIVO", "DECLINOU", "RESCISAO", "BANCO_PAUSADA"] as const;
export type FarolGlobal = (typeof FAROL_GLOBAL)[number];

// ── Frentes paralelas e independentes (F12 / §A.3) ─────────────────────────
export const FRENTE = ["AUDITORIA", "EXAME", "CADASTRO_CONTRATO"] as const;
export type Frente = (typeof FRENTE)[number];

// ── Status por frente (dados reais — §A.3) ─────────────────────────────────
export const STATUS_AUDITORIA = [
  "ANALISE_OK",
  "ANALISE_PENDENTE",
  "AGUARDA_REENVIO",
  "DECLINOU",
] as const;
export type StatusAuditoria = (typeof STATUS_AUDITORIA)[number];

export const STATUS_EXAME = ["A_AGENDAR", "AGENDADO", "APTO", "CANCELADO"] as const;
export type StatusExame = (typeof STATUS_EXAME)[number];

export const STATUS_CADASTRO_CONTRATO = [
  "A_CADASTRAR",
  "CADASTRADO",
  "ENVIAR",
  "ENVIADO",
  "INTEGRACAO",
] as const;
export type StatusCadastroContrato = (typeof STATUS_CADASTRO_CONTRATO)[number];

// ── Exigência documental na régua (cliente + cargo) ────────────────────────
export const EXIGENCIA_DOCUMENTO = ["OBRIGATORIO", "NAO_OBRIGATORIO", "FACULTATIVO"] as const;
export type ExigenciaDocumento = (typeof EXIGENCIA_DOCUMENTO)[number];

// ── Não conformidades (Fase 2C) ────────────────────────────────────────────
export const NC_TIPO = ["NC1", "NC2", "NC3"] as const;
export type NcTipo = (typeof NC_TIPO)[number];

export const NC_STATUS = ["ABERTA", "RESOLVIDA"] as const;
export type NcStatus = (typeof NC_STATUS)[number];

export const NC_LIBERACAO = ["NENHUMA", "PENDENTE", "APROVADA", "REPROVADA"] as const;
export type NcLiberacao = (typeof NC_LIBERACAO)[number];

/** Rótulos curtos dos gatilhos de NC (consumidos pela tela e pelos filtros). */
export const NC_TIPO_ROTULO: Record<NcTipo, string> = {
  NC1: "Auditoria sem documentos",
  NC2: "Exame sem ASO",
  NC3: "Cadastro incompleto",
};

/** Termo de ciência fixo do aceite "apto sem ASO" (gatilho da NC2). */
export const TERMO_APTO_SEM_ASO =
  "Estou ciente que estou marcando este candidato como apto sem o ASO anexado.";

/**
 * Valida um CPF brasileiro pelos dígitos verificadores (F3 — CPF é a chave de identidade).
 * Aceita com ou sem máscara. Rejeita sequências repetidas (ex.: 000.000.000-00).
 */
export function isValidCpf(input: string): boolean {
  const cpf = (input ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split("").map(Number);
  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += digits[i] * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

/** Normaliza um CPF para 11 dígitos sem máscara (uso como chave técnica). */
export function normalizeCpf(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}
