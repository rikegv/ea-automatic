/**
 * Regras puras da criação de Admissão (CLAUDE.md §A.3 / F5 / F6). Sem dependência de DB —
 * testáveis isoladamente. Complementam `frentes.ts` (nascimento paralelo e gate do Cadastro).
 */
import type { FrenteTipo } from "./frentes";

/** Sinalizador de preenchimento que esta camada calcula (§A.3 / F5). INCONFORMIDADE e
 * COMPETENCIAS pertencem à auditoria documental (F2), fora do wizard — não saem daqui. */
export type Sinalizador = "PENDENTE" | "PARCIAL" | "OK";

/**
 * Status inicial de cada frente ao nascer (regra 1). AUDITORIA e EXAME nascem com a admissão;
 * CADASTRO_CONTRATO **não nasce** (regra 3, gate) — o valor consta apenas como referência do
 * status de abertura quando, mais tarde, o gate o liberar.
 */
export const STATUS_INICIAL_FRENTE: Record<FrenteTipo, string> = {
  AUDITORIA: "ANALISE_PENDENTE",
  EXAME: "A_AGENDAR",
  CADASTRO_CONTRATO: "A_CADASTRAR",
};

/** Entrada do cálculo do sinalizador — espelha os campos-núcleo do wizard (F6). */
export interface SinalizadorInput {
  candidato?: { nome?: string | null; cpf?: string | null };
  codCliente?: string | null;
  cargoId?: string | null;
  dataAdmissao?: string | null;
  tipoContrato?: string | null;
  vagaFolha?: { salario?: string | number | null } | null;
}

const presente = (v: unknown): boolean =>
  v !== undefined && v !== null && String(v).trim() !== "";

/**
 * Calcula o sinalizador de preenchimento (F5). Função PURA, defensável e sem bloqueio (regra 5):
 *
 * Campos-núcleo: candidato.nome, candidato.cpf, codCliente, cargoId, dataAdmissao,
 * vagaFolha.salario, tipoContrato.
 *
 * - todos os campos-núcleo presentes → "OK";
 * - identidade (nome+cpf) + cliente + cargo presentes, mas faltam campos-núcleo → "PARCIAL";
 * - só identidade (ou menos) → "PENDENTE".
 */
export function calcSinalizadorPreenchimento(i: SinalizadorInput): Sinalizador {
  const identidade = presente(i.candidato?.nome) && presente(i.candidato?.cpf);
  const clienteCargo = presente(i.codCliente) && presente(i.cargoId);
  const demaisNucleo =
    presente(i.dataAdmissao) && presente(i.vagaFolha?.salario) && presente(i.tipoContrato);

  if (identidade && clienteCargo && demaisNucleo) return "OK";
  if (identidade && clienteCargo) return "PARCIAL";
  return "PENDENTE";
}
