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

/**
 * Tipo de serviço do vínculo cliente↔empresa Soulan (OST estrutural). Derivado do código "Empresa"
 * da base: 1,3=TEMPORARIO · 2=TERCEIRO · 4=ESTAGIO · 5,6=INTERNO · >6=FOPAG (documento usa o CNPJ do
 * próprio cliente). É a mesma taxonomia de `admissoes.tipo_contrato`.
 */
export const tipoServicoEnum = pgEnum("tipo_servico", [
  "TEMPORARIO",
  "TERCEIRO",
  "ESTAGIO",
  "INTERNO",
  "FOPAG",
]);

/** Origem da admissão (Fase 5 / INT-1): MANUAL (wizard F6) ou PANDAPE (sync via webhook/pull). */
export const origemEnum = pgEnum("origem", ["MANUAL", "PANDAPE"]);

/** Sexo do candidato. Usado pela régua padrão: Reservista só é obrigatório para MASCULINO. */
export const sexoEnum = pgEnum("sexo", ["MASCULINO", "FEMININO"]);

/** Fornecedor do exame admissional (seleção FIXA no modal de agendamento da aba EXAME). */
export const fornecedorExameEnum = pgEnum("fornecedor_exame", ["MEDICAL", "LIMER"]);

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
 * Status do envelope de assinatura na Clicksign (INT-4 / F9). SEM_ENVELOPE (inicial — kit ainda
 * não gerado) · AGUARDANDO_ASSINATURA (envelope disparado) · ASSINADO (document_closed) ·
 * CANCELADO (reenvio por correção — §A.5). Estado, nunca URL/PII (§A.6).
 */
export const clicksignStatusEnum = pgEnum("clicksign_status", [
  "SEM_ENVELOPE",
  "AGUARDANDO_ASSINATURA",
  "ASSINADO",
  "CANCELADO",
]);

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

/** Sentido do trajeto no formulário de VT (§A.17): ida e volta são descritos separadamente. */
export const sentidoVtEnum = pgEnum("sentido_vt", ["IDA", "VOLTA"]);

/**
 * Cartão de transporte usado em cada condução (§A.17). Lista fechada definida pelo diretor;
 * OUTRO abre campo de texto obrigatório (`cartaoOutro`) para o candidato nomear o cartão.
 */
export const cartaoVtEnum = pgEnum("cartao_vt", ["BILHETE_UNICO", "CARTAO_TOP", "OUTRO"]);

/**
 * Status de cadastro do pacote de benefícios do candidato (§A.17 etapa 4). É POR CANDIDATO/admissão,
 * não por benefício: a pergunta que a operação faz é "os benefícios desta pessoa já foram
 * cadastrados?", e não "o VR já foi?". Toda admissão nasce PENDENTE.
 */
export const statusCadastroBeneficioEnum = pgEnum("status_cadastro_beneficio", [
  "PENDENTE",
  "CADASTRADO",
]);
