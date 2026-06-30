/**
 * Regras puras da criação de Admissão (CLAUDE.md §A.3 / F5 / F6). Sem dependência de DB —
 * testáveis isoladamente. Complementam `frentes.ts` (nascimento paralelo e gate do Cadastro).
 */
import type { FarolGlobal } from "@ea/shared-types";
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

const presente = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";

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

/** Entrada do cálculo de pendências obrigatórias (S2/S3 — ajustes-2B-2C). */
export interface PendenciasInput {
  codCliente?: string | null;
  cargoId?: string | null;
  dataAdmissao?: string | null;
  vagaFolha?: {
    salario?: string | number | null;
    beneficios?: string | null;
    escala?: string | null;
  } | null;
  /** Admissão de banco (§A.3 / Fase 4 complemento): troca "Data de admissão" por "Termo de Banco". */
  isBanco?: boolean | null;
  /** Termo de Banco já ENTREGUE? (só relevante quando isBanco). */
  termoBancoEntregue?: boolean | null;
}

/** Rótulo da pendência de formalização do banco (documento, não campo de folha). */
export const PENDENCIA_TERMO_BANCO = "Termo de Banco";

/**
 * Campos obrigatórios vazios da admissão (badge "Pendências Obrigatórias" — S2; e gatilho do log de
 * passagem — S3). Conjunto fixo: Salário, Data de admissão, Pacote de benefícios, Cliente, Cargo,
 * Escala. Função PURA. Cliente/Cargo são sempre exigidos na criação, mas constam por completude.
 *
 * Admissão de banco (§A.3 / Fase 4 complemento): a ausência de `dataAdmissao` é ESPERADA (não é
 * pendência); no lugar, o "Termo de Banco" é exigido até estar ENTREGUE.
 */
export function pendenciasObrigatorias(i: PendenciasInput): string[] {
  const pend: string[] = [];
  if (!presente(i.codCliente)) pend.push("Cliente");
  if (!presente(i.cargoId)) pend.push("Cargo");
  if (!presente(i.vagaFolha?.salario)) pend.push("Salário");
  if (i.isBanco) {
    if (!i.termoBancoEntregue) pend.push(PENDENCIA_TERMO_BANCO);
  } else if (!presente(i.dataAdmissao)) {
    pend.push("Data de admissão");
  }
  if (!presente(i.vagaFolha?.beneficios)) pend.push("Pacote de benefícios");
  if (!presente(i.vagaFolha?.escala)) pend.push("Escala");
  return pend;
}

/** Estados de farol decididos MANUALMENTE pelo consultor — a automação não os sobrescreve. */
const FAROL_MANUAL: ReadonlySet<FarolGlobal> = new Set<FarolGlobal>([
  "DECLINOU",
  "RESCISAO",
  "ADMISSAO_CONCLUIDA",
]);

/** Entrada da derivação automática do farol global. */
export interface FarolInput {
  /** Farol atual (preserva os estados manuais e a escolha de ADMISSAO_CONCLUIDA). */
  atual: FarolGlobal;
  /** AUDITORIA concluída (status ANALISE_OK). */
  auditoriaConcluida: boolean;
  /** EXAME concluído (status APTO). */
  exameApto: boolean;
  /** A admissão já tem data de admissão definida? */
  temDataAdmissao: boolean;
}

/**
 * Deriva o farol global AUTOMÁTICO (§A.3 / Fase 4 complemento). Só alterna entre EM_ADMISSAO e
 * BANCO_AGUARDAR; estados manuais (DECLINOU, RESCISAO, ADMISSAO_CONCLUIDA) são "pegajosos" e nunca
 * sobrescritos pela automação. BANCO_AGUARDAR quando Auditoria=ok E Exame=apto E sem data de
 * admissão; ao preencher a data, volta a EM_ADMISSAO. Função PURA.
 */
export function deriveFarolGlobal(i: FarolInput): FarolGlobal {
  if (FAROL_MANUAL.has(i.atual)) return i.atual;
  if (i.auditoriaConcluida && i.exameApto && !i.temDataAdmissao) return "BANCO_AGUARDAR";
  return "EM_ADMISSAO";
}
