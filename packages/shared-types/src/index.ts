/**
 * @ea/shared-types — contratos de domínio compartilhados entre backend, frontend e ai-service.
 * Fase 0: vocabulário do domínio (CLAUDE.md §A.3) + utilitários puros. Sem dependências de runtime.
 */

// ── Papéis de acesso (RBAC) ────────────────────────────────────────────────
export const PAPEL = ["COMUM", "MASTER", "SUPER_ADMIN"] as const;
export type Papel = (typeof PAPEL)[number];

// ── Gestão de usuários (OST-EA-GESTAO-USUARIOS — restrito Master/Super Admin) ───────────────
/** Item da listagem/administração de usuários. NUNCA carrega senhaHash (§A.6). */
export interface UsuarioListItem {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
}

/** Resposta da criação/reset de usuário: a senha temporária em claro só trafega UMA vez. */
export interface CriarUsuarioResposta {
  usuario: UsuarioListItem;
  senhaTemporaria: string;
}

/** Resposta do reset de senha (Master/Super Admin). */
export interface ResetSenhaResposta {
  senhaTemporaria: string;
}

/**
 * Código de erro estável no corpo do 403 quando o usuário ainda tem senha temporária. O frontend
 * detecta este código para redirecionar à tela de troca obrigatória no primeiro acesso.
 */
export const SENHA_TEMPORARIA_CODE = "SENHA_TEMPORARIA" as const;

// ── Farol global da admissão (§A.3) ────────────────────────────────────────
// EM_ADMISSAO: status inicial (era "ATIVO"). BANCO_AGUARDAR: Auditoria=ok & Exame=apto &
// data_admissao ausente (unifica o antigo "BANCO_PAUSADA"). ADMISSAO_CONCLUIDA: todas as etapas
// concluídas + contrato assinado (flag manual até a INT-4). DECLINOU/RESCISAO mantidos.
export const FAROL_GLOBAL = [
  "EM_ADMISSAO",
  "BANCO_AGUARDAR",
  "ADMISSAO_CONCLUIDA",
  "DECLINOU",
  "RESCISAO",
  // Pré-admissão do Pandapé aguardando cliente/cargo (Liberação Admissional). Estado manual: a
  // automação do farol NÃO o sobrescreve até a liberação atribuir cliente/cargo.
  "AGUARDANDO_LIBERACAO",
  // Pré-admissão RECUSADA na Liberação (Parte 2, só Master/Super Admin). Terminal: fora de fila/KPI,
  // como o declínio. Reversível (reativar → volta a AGUARDANDO_LIBERACAO).
  "LIBERACAO_RECUSADA",
] as const;
export type FarolGlobal = (typeof FAROL_GLOBAL)[number];

/** Rótulos de exibição do farol global (UI). */
export const FAROL_GLOBAL_LABEL: Record<FarolGlobal, string> = {
  EM_ADMISSAO: "Em Admissão",
  BANCO_AGUARDAR: "Banco-Aguardar",
  ADMISSAO_CONCLUIDA: "Admissão Concluída",
  DECLINOU: "Declinou",
  RESCISAO: "Rescisão",
  AGUARDANDO_LIBERACAO: "Aguardando Liberação",
  LIBERACAO_RECUSADA: "Liberação Recusada",
};

// ── Origem da admissão (Fase 5 / INT-1) ────────────────────────────────────
// MANUAL: criada pelo wizard (F6). PANDAPE: criada pela sync do ATS (webhook/pull). Alimenta o
// badge de origem no Gerenciador/Esteira do frontend.
export const ORIGEM = ["MANUAL", "PANDAPE"] as const;
export type Origem = (typeof ORIGEM)[number];

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

/**
 * Cadastro/Contrato tem DOIS status: "A cadastrar" e "Cadastrado" (concluinte).
 *
 * Reorganização (decisão do diretor): `ENVIAR`/`ENVIADO` e `INTEGRACAO` eram resíduo da esteira
 * manual antiga. `ENVIAR`/`ENVIADO` nunca tiveram uma admissão sequer e saíram, porque o estado do
 * contrato hoje vive em `admissoes.clicksign_status` (INT-4), não aqui. `INTEGRACAO` virou
 * `CADASTRADO` e **trouxe o `conclui: true` junto** (migration 0026).
 *
 * O `CADASTRADO` intermediário (não concluinte, também sem uso) foi REMOVIDO e cedeu o nome ao
 * concluinte: existe UM "Cadastrado" só, e ele conclui a frente. Dois status com o mesmo rótulo e
 * sentidos diferentes seria exatamente o que a reorganização veio eliminar.
 *
 * A ORDEM importa: `ORDEM_STATUS` (domain/esteira.ts) deriva daqui e define o que é reversão.
 */
export const STATUS_CADASTRO_CONTRATO = ["A_CADASTRAR", "CADASTRADO"] as const;
export type StatusCadastroContrato = (typeof STATUS_CADASTRO_CONTRATO)[number];

// ── Exigência documental na régua (cliente + cargo) ────────────────────────
export const EXIGENCIA_DOCUMENTO = ["OBRIGATORIO", "NAO_OBRIGATORIO", "FACULTATIVO"] as const;
export type ExigenciaDocumento = (typeof EXIGENCIA_DOCUMENTO)[number];

/**
 * DOCUMENTOS PADRÃO da régua documental (decisão do diretor). FONTE ÚNICA, consumida pelo botão
 * "Aplicar documentos padrão" da tela `/admin/regua`, pela aplicação em massa nos pares pendentes e
 * pelo `seed-regua-padrao.ts`. Vive aqui, e não no seed, justamente para que as três bocas não
 * possam discordar entre si.
 *
 * São `codigo` de `tipos_documento`, todos aplicados como **OBRIGATORIO**. Os demais tipos ativos do
 * catálogo ficam NAO_OBRIGATORIO, que já é o default da tela.
 *
 * O **ASO NÃO entra** (decisão do diretor): quem controla o exame é a frente EXAME (§A.16), e cobrá-lo
 * também na régua criaria exigência duplicada da mesma coisa.
 *
 * Nota herdada do seed: o RESERVISTA é OBRIGATORIO aqui, mas é **condicional na completude**, só conta
 * como pendência para candidato do sexo masculino (`regua-completude.service`).
 */
export const CODIGOS_REGUA_PADRAO = [
  "RG",
  "CPF",
  "CTPS",
  "COMPROVANTE_RESIDENCIA",
  "DADOS_BANCARIOS",
  "COMPROVANTE_ESCOLARIDADE",
  "RESERVISTA",
] as const;
export type CodigoReguaPadrao = (typeof CODIGOS_REGUA_PADRAO)[number];

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

// ── Clicksign — assinatura do contrato (INT-4 / F9) ────────────────────────
// SEM_ENVELOPE: kit ainda não gerado (inicial). AGUARDANDO_ASSINATURA: envelope disparado.
// ASSINADO: document_closed (contrato arquivado no Drive). CANCELADO: reenvio por correção (§A.5).
export const CLICKSIGN_STATUS = [
  "SEM_ENVELOPE",
  "AGUARDANDO_ASSINATURA",
  "ASSINADO",
  "CANCELADO",
] as const;
export type ClicksignStatus = (typeof CLICKSIGN_STATUS)[number];

/** Rótulos de exibição do status Clicksign (UI). */
export const CLICKSIGN_STATUS_LABEL: Record<ClicksignStatus, string> = {
  SEM_ENVELOPE: "Sem envelope",
  AGUARDANDO_ASSINATURA: "Aguardando assinatura",
  ASSINADO: "Assinado",
  CANCELADO: "Cancelado",
};

// ── Fase 4 — Auditoria documental por IA (F2 / INT-3) ──────────────────────
/** Veredito da IA sobre um documento. Mapeia para estado_documento no banco (ver abaixo). */
export const AUDITORIA_STATUS = ["VALIDADO", "INCONFORME", "PENDENTE"] as const;
export type AuditoriaStatus = (typeof AUDITORIA_STATUS)[number];

/** Estado IA → estado_documento persistido (§A.3 regra 7 — só status, nunca o arquivo). */
export const AUDITORIA_PARA_ESTADO: Record<
  AuditoriaStatus,
  "ENTREGUE" | "INCONFORME" | "PENDENTE"
> = {
  VALIDADO: "ENTREGUE",
  INCONFORME: "INCONFORME",
  PENDENTE: "PENDENTE",
};

/**
 * Resultado da auditoria de UM documento. `motivo` é o veredito textual da regra — NUNCA deve
 * conter PII extraída do documento (§A.6). É o shape devolvido pelo ai-service e repassado ao front.
 */
export interface ResultadoAuditoria {
  valido: boolean;
  status: AuditoriaStatus;
  motivo: string;
  camposConferidos: string[];
}

/** Regra de auditoria configurável pelo admin (Master/Super Admin) por tipo de documento. */
export interface RegraAuditoria {
  id: string;
  tipoDocumentoId: string;
  descricaoRegra: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

/** Progresso da régua obrigatória de uma admissão (barra "X de Y"). Sem PII — só rótulos. */
export interface ProgressoRegua {
  obrigatoriosTotal: number;
  obrigatoriosEntregues: number;
  faltantes: string[];
  completa: boolean;
}

/**
 * Subpastas criadas pelo EA dentro de "{nome} — {nome_operacao}" no Drive (INT-2). O roteamento
 * por tipo de documento é resolvido pelo backend; estes são os quatro destinos fixos.
 */
export const DRIVE_SUBPASTA = ["ASO", "ADMISSAO", "BENEFICIOS", "DOCUMENTOS_PESSOAIS"] as const;
export type DriveSubpasta = (typeof DRIVE_SUBPASTA)[number];

/** Resultado do arquivamento no Drive ao fechar a régua obrigatória. */
export interface ArquivamentoDrive {
  pastaUrl: string;
  arquivados: number;
}

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

/**
 * Benefícios que TÊM valor (§A.17 etapa 4). Vive aqui, e não em cada app, porque a regra é usada
 * pelos DOIS lados: o wizard/modal decide se mostra o campo e bloqueia sem valor, e o backend
 * valida o mesmo. Duas cópias = a divergência que a régua unificada acabou de eliminar.
 *
 * A lista é do diretor: VR, VA, AM, Cesta básica, PLR e Auxílio creche. Os demais do catálogo
 * (VT, Assistência Odontológica, Seguro de vida, Refeição no local) são só concedidos/não, sem valor.
 */
const BENEFICIOS_COM_VALOR = [
  "VR", // VR (Vale-Refeição)
  "VA", // VA (Vale-Alimentação)
  "AM", // AM (Assistência Médica)
  "CESTA BASICA",
  "PLR", // Participação nos lucros (PLR)
  "AUXILIO CRECHE",
] as const;

/** Maiúsculas e sem acento: o catálogo é editável e o nome chega com acento ("Auxílio creche"). */
function normalizarNomeBeneficio(nome: string): string {
  return (nome ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * O benefício exige valor? Casa por PREFIXO ("VR (Vale-Refeição)", "Cesta básica") ou pelo código
 * entre parênteses ("Participação nos lucros (PLR)").
 *
 * O código entre parênteses existe porque casar só por prefixo NÃO funciona: "Participação nos
 * lucros (PLR)" não começa com "PLR". Era o furo da regra antiga, que só olhava prefixo.
 */
export function beneficioExigeValor(nome: string): boolean {
  const n = normalizarNomeBeneficio(nome);
  return BENEFICIOS_COM_VALOR.some((chave) => n.startsWith(chave) || n.includes(`(${chave})`));
}
