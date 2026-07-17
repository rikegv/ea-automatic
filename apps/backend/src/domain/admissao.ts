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
 * Calcula o sinalizador de preenchimento (F5). Função PURA, sem bloqueio (regra 5).
 *
 * RÉGUA UNIFICADA (§A.17 etapa 4, ajuste do diretor): o sinalizador DERIVA de
 * `pendenciasObrigatorias`. Antes existiam duas definições de "completo" que nunca concordaram: o
 * sinalizador olhava 7 campos e a pendência olhava 8, e nenhum dos dois olhava os mesmos. O
 * resultado era a coluna do Gerenciador dizer "Completo" enquanto o modal da MESMA admissão listava
 * "Pacote de benefícios" como pendente. Agora coluna, KPI, radar, sinalizador e modal concordam por
 * construção: OK <=> zero pendência obrigatória.
 *
 * - identidade (nome+cpf) + cliente + cargo ausentes → "PENDENTE" (não dá nem para avaliar o resto);
 * - identidade + cliente + cargo presentes e ZERO pendência obrigatória → "OK";
 * - identidade + cliente + cargo presentes, mas com pendência → "PARCIAL".
 */
export function calcSinalizadorPreenchimento(i: SinalizadorInput & PendenciasInput): Sinalizador {
  const identidade = presente(i.candidato?.nome) && presente(i.candidato?.cpf);
  const clienteCargo = presente(i.codCliente) && presente(i.cargoId);
  if (!identidade || !clienteCargo) return "PENDENTE";
  return pendenciasObrigatorias(i).length === 0 ? "OK" : "PARCIAL";
}

/**
 * O farol é de admissão VIVA (em processo)? Só estas seguem a régua unificada.
 *
 * Recorte do diretor: admissão FINALIZADA (concluída) ou encerrada (declínio/rescisão) NÃO é
 * recalculada, fica com o status que tem. Isso preserva o histórico da carga (1.432 concluídas +
 * 724 declínios) e mantém os cards da base histórica exatamente onde estão.
 */
export function ehFarolVivo(farol?: string | null): boolean {
  return farol === "EM_ADMISSAO" || farol === "BANCO_AGUARDAR";
}

/** Entrada do cálculo de pendências obrigatórias (S2/S3 — ajustes-2B-2C). */
export interface PendenciasInput {
  codCliente?: string | null;
  cargoId?: string | null;
  dataAdmissao?: string | null;
  /** Tipo de contrato (CLT, etc.). Faz parte da régua por decisão do diretor. */
  tipoContrato?: string | null;
  vagaFolha?: {
    salario?: string | number | null;
    beneficios?: string | null;
    escala?: string | null;
    centroCusto?: string | null;
    gestorBp?: string | null;
  } | null;
  /** Admissão de banco (§A.3 / Fase 4 complemento): troca "Data de admissão" por "Termo de Banco". */
  isBanco?: boolean | null;
  /** Termo de Banco já ENTREGUE? (só relevante quando isBanco). */
  termoBancoEntregue?: boolean | null;
  /**
   * A admissão tem pelo menos um benefício ESTRUTURADO alocado (§A.17 etapa 4)?
   *
   * Existe porque o pacote passou a ter DUAS representações: admissão nova grava em
   * `admissao_beneficio` (estruturado) e NÃO escreve a string; as 2.066 importadas continuam só
   * com o blob em `dados_vaga_folha.beneficios`, que não é migrado. Sem este campo, toda admissão
   * nova nasceria com "Pacote de benefícios" pendente para sempre, contaminando o sinalizador e o
   * log de passagem (S3).
   */
  temBeneficioEstruturado?: boolean | null;
}

/** Rótulo da pendência de formalização do banco (documento, não campo de folha). */
export const PENDENCIA_TERMO_BANCO = "Termo de Banco";

/**
 * Campos obrigatórios vazios da admissão (badge "Pendências Obrigatórias" — S2; e gatilho do log de
 * passagem, S3). Conjunto fixo: Cliente, Cargo, Salário, Tipo de contrato, Data de admissão,
 * Pacote de benefícios, Escala, Centro de custo, Gestor / BP. Função PURA. Cliente/Cargo são sempre exigidos na criação,
 * mas constam por completude. Centro de custo e Gestor / BP seguem o mesmo padrão não-bloqueante
 * (§A.3 regra 5): sinalizam, nunca impedem.
 *
 * Admissão de banco (§A.3 / Fase 4 complemento): a ausência de `dataAdmissao` é ESPERADA (não é
 * pendência); no lugar, o "Termo de Banco" é exigido até estar ENTREGUE.
 */
export function pendenciasObrigatorias(i: PendenciasInput): string[] {
  const pend: string[] = [];
  if (!presente(i.codCliente)) pend.push("Cliente");
  if (!presente(i.cargoId)) pend.push("Cargo");
  if (!presente(i.vagaFolha?.salario)) pend.push("Salário");
  if (!presente(i.tipoContrato)) pend.push("Tipo de contrato");
  if (i.isBanco) {
    if (!i.termoBancoEntregue) pend.push(PENDENCIA_TERMO_BANCO);
  } else if (!presente(i.dataAdmissao)) {
    pend.push("Data de admissão");
  }
  // O pacote conta como preenchido por QUALQUER uma das duas representações: o estruturado
  // (admissão nova) ou o blob legado (admissão importada). Ver `temBeneficioEstruturado`.
  if (!i.temBeneficioEstruturado && !presente(i.vagaFolha?.beneficios)) {
    pend.push("Pacote de benefícios");
  }
  if (!presente(i.vagaFolha?.escala)) pend.push("Escala");
  if (!presente(i.vagaFolha?.centroCusto)) pend.push("Centro de custo");
  if (!presente(i.vagaFolha?.gestorBp)) pend.push("Gestor / BP");
  return pend;
}

/** Estados de farol decididos MANUALMENTE pelo consultor — a automação não os sobrescreve. */
const FAROL_MANUAL: ReadonlySet<FarolGlobal> = new Set<FarolGlobal>([
  "DECLINOU",
  "RESCISAO",
  "ADMISSAO_CONCLUIDA",
  // Pré-admissão (Liberação Admissional): sem isto, qualquer recompute (editar/frente/auditoria)
  // derivaria EM_ADMISSAO e ARRANCARIA a admissão da sala de espera antes de ter cliente/cargo.
  "AGUARDANDO_LIBERACAO",
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
