import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  estadoDocumentoEnum,
  exigenciaEnum,
  farolGlobalEnum,
  frenteTipoEnum,
  ncLiberacaoEnum,
  ncStatusEnum,
  ncTipoEnum,
  papelEnum,
  sinalizadorEnum,
} from "./enums";

const criadoEm = timestamp("criado_em", { withTimezone: true }).defaultNow().notNull();
const atualizadoEm = timestamp("atualizado_em", { withTimezone: true }).defaultNow().notNull();

// ── Usuário (RBAC) ──────────────────────────────────────────────────────────
export const usuarios = pgTable("usuarios", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull(),
  email: varchar("email", { length: 180 }).notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  papel: papelEnum("papel").notNull().default("COMUM"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── Cliente (chave de negócio: cod_cliente) ─────────────────────────────────
export const clientes = pgTable("clientes", {
  codCliente: varchar("cod_cliente", { length: 40 }).primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }),
  razaoSocial: varchar("razao_social", { length: 200 }).notNull(),
  nomeOperacao: varchar("nome_operacao", { length: 200 }),
  // ── Carga 1B (§A.3): atributos de cliente que pré-preenchem o wizard (F1). Nullable: não
  // bloqueiam e mantêm os clientes demo/seed válidos. beneficiosPadrao pode ser longo (~466 chars).
  empresaGrupo: text("empresa_grupo"),
  regiao: text("regiao"),
  descricaoRegiao: text("descricao_regiao"),
  beneficiosPadrao: text("beneficios_padrao"),
  escalaPadrao: text("escala_padrao"),
  enderecoPadrao: text("endereco_padrao"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── Cargo (catálogo próprio) ────────────────────────────────────────────────
export const cargos = pgTable("cargos", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── TipoDocumento (21 tipos) ────────────────────────────────────────────────
export const tiposDocumento = pgTable("tipos_documento", {
  id: uuid("id").defaultRandom().primaryKey(),
  codigo: varchar("codigo", { length: 60 }).notNull().unique(),
  nome: varchar("nome", { length: 200 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
});

// ── ReguaDocumental: (cod_cliente + cargo) → exigência por tipo de documento ─
export const reguaDocumental = pgTable(
  "regua_documental",
  {
    codCliente: varchar("cod_cliente", { length: 40 })
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id, { onDelete: "cascade" }),
    tipoDocumentoId: uuid("tipo_documento_id")
      .notNull()
      .references(() => tiposDocumento.id, { onDelete: "cascade" }),
    exigencia: exigenciaEnum("exigencia").notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    pk: primaryKey({ columns: [t.codCliente, t.cargoId, t.tipoDocumentoId] }),
  }),
);

// ── Candidato (chave: cpf; pode ter N admissões) ────────────────────────────
export const candidatos = pgTable("candidatos", {
  cpf: varchar("cpf", { length: 11 }).primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  email: varchar("email", { length: 180 }),
  telefone: varchar("telefone", { length: 30 }),
  // Data de nascimento (ajustes-2B-2C/W7): aviso de menor de idade no wizard.
  dataNascimento: date("data_nascimento"),
  criadoEm,
  atualizadoEm,
});

// ── Catálogos abertos (admin adiciona pelo gerenciador) — wizard W2/W3/W4 ─────
// Motivo de contratação (W2), Benefício (W3), Escala (W4). Seedados a partir dos valores reais dos
// clientes; o consultor escolhe, só Master/Super Admin acrescenta.
export const motivosContratacao = pgTable("motivos_contratacao", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
});
export const beneficiosCatalogo = pgTable("beneficios_catalogo", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
});
export const escalasCatalogo = pgTable("escalas_catalogo", {
  id: uuid("id").defaultRandom().primaryKey(),
  // texto livre (descrições de escala chegam a ~120+ chars nos clientes reais).
  nome: text("nome").notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
});

// ── Admissão (entidade central: Candidato + Cliente + Cargo) ────────────────
export const admissoes = pgTable("admissoes", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidatoCpf: varchar("candidato_cpf", { length: 11 })
    .notNull()
    .references(() => candidatos.cpf),
  codCliente: varchar("cod_cliente", { length: 40 })
    .notNull()
    .references(() => clientes.codCliente),
  cargoId: uuid("cargo_id")
    .notNull()
    .references(() => cargos.id),
  // Consultor que GEROU a admissão (Fase 2C): associado às não conformidades que ela vier a gerar
  // (Via 1 — penaliza o consultor). Nullable: admissões anteriores à 2C não têm autor registrado.
  consultorId: uuid("consultor_id").references(() => usuarios.id),
  tipoContrato: varchar("tipo_contrato", { length: 60 }),
  matricula: varchar("matricula", { length: 60 }),
  dataAdmissao: date("data_admissao"),
  farolGlobal: farolGlobalEnum("farol_global").notNull().default("EM_ADMISSAO"),
  // Admissão de "banco" (§A.3 / Fase 4 complemento): contratação aprovada que aguarda vaga/data.
  // Quando true, a ausência de data_admissao NÃO é pendência (é esperado) e o "Termo de Banco"
  // passa a ser a pendência obrigatória de formalização.
  isBanco: boolean("is_banco").notNull().default(false),
  sinalizadorPreenchimento: sinalizadorEnum("sinalizador_preenchimento")
    .notNull()
    .default("PENDENTE"),
  // URL da pasta do Drive criada ao fechar a régua obrigatória (Fase 4 / INT-2). É REFERÊNCIA
  // (link da pasta do prontuário), não dado pessoal nem URL do Pandapé — pode persistir (§A.6).
  drivePastaUrl: text("drive_pasta_url"),
  // URL do prontuário no Drive gravada ao arquivar o ASO logo após a auditoria VALIDADO (Fase 4
  // ajustes finais — o ASO não espera o fechamento da régua). Referência (link da pasta), não PII.
  driveAsoUrl: text("drive_aso_url"),
  criadoEm,
  atualizadoEm,
});

// ── DadosVagaFolha (anexo 1:1 da Admissão) ──────────────────────────────────
export const dadosVagaFolha = pgTable("dados_vaga_folha", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  salario: numeric("salario", { precision: 12, scale: 2 }),
  beneficios: text("beneficios"),
  // texto livre (escala do catálogo pode ser uma descrição longa — W4).
  escala: text("escala"),
  centroCusto: varchar("centro_custo", { length: 80 }),
  departamento: varchar("departamento", { length: 120 }),
  gestorBp: varchar("gestor_bp", { length: 160 }),
  motivo: varchar("motivo", { length: 200 }),
  tempoContrato: varchar("tempo_contrato", { length: 80 }),
  // Endereço é campo de folha (decisão de diretor — §A.3): pré-preenchido pelo enderecoPadrao do
  // cliente no wizard, mas editável por admissão. Nullable: não bloqueia.
  endereco: text("endereco"),
  // Substituição (W2): quando motivo = "Substituição", nome + CPF da pessoa substituída. O CPF é
  // dado pessoal com retenção mínima (LGPD): expurgado por job ao passar `substituicaoExpurgarEm`
  // (TTL 48h após a assinatura — mesmo padrão da staging efêmera §A.6).
  substituidoNome: varchar("substituido_nome", { length: 200 }),
  substituidoCpf: varchar("substituido_cpf", { length: 11 }),
  substituicaoExpurgarEm: timestamp("substituicao_expurgar_em", { withTimezone: true }),
});

// ── DocumentoAdmissão (estado por documento exigido — SÓ status) ────────────
export const documentosAdmissao = pgTable(
  "documentos_admissao",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    tipoDocumentoId: uuid("tipo_documento_id")
      .notNull()
      .references(() => tiposDocumento.id),
    estado: estadoDocumentoEnum("estado").notNull().default("PENDENTE"),
    observacao: text("observacao"),
    atualizadoEm,
  },
  (t) => ({
    uniqDocPorAdmissao: unique().on(t.admissaoId, t.tipoDocumentoId),
  }),
);

// ── FrenteAdmissão (cada frente é entidade própria, com datas independentes) ─
export const frentesAdmissao = pgTable(
  "frentes_admissao",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    tipo: frenteTipoEnum("tipo").notNull(),
    // status é varchar + catálogo (frente_status_catalogo) porque cada frente tem um
    // conjunto próprio de status (§A.3); a integridade vem do catálogo/aplicação.
    status: varchar("status", { length: 40 }).notNull(),
    responsavelId: uuid("responsavel_id").references(() => usuarios.id),
    dataInicio: timestamp("data_inicio", { withTimezone: true }),
    dataConclusao: timestamp("data_conclusao", { withTimezone: true }),
    concluida: boolean("concluida").notNull().default(false),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uniqFrentePorAdmissao: unique().on(t.admissaoId, t.tipo),
  }),
);

// ── Catálogo de status por frente (seed) — alimenta os seletores da esteira ──
export const frenteStatusCatalogo = pgTable(
  "frente_status_catalogo",
  {
    id: serial("id").primaryKey(),
    tipo: frenteTipoEnum("tipo").notNull(),
    codigo: varchar("codigo", { length: 40 }).notNull(),
    rotulo: varchar("rotulo", { length: 120 }).notNull(),
    ordem: integer("ordem").notNull(),
    conclui: boolean("conclui").notNull().default(false),
  },
  (t) => ({
    uniqStatusPorFrente: unique().on(t.tipo, t.codigo),
  }),
);

// ── FrenteStatusEventos: trilha de mudanças de status da esteira (F8 / §A.3) ──
// Auditoria aditiva de cada transição de status de frente, incluindo reversões (recuo de etapa)
// que reabrem pendência num candidato já em cadastro. `autorId` nullable: transições do sistema
// (ex.: nascimento lazy) podem não ter autor. Sem CPF nem URL — apenas estado (§A.6).
export const frenteStatusEventos = pgTable("frente_status_eventos", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  frenteId: uuid("frente_id")
    .notNull()
    .references(() => frentesAdmissao.id, { onDelete: "cascade" }),
  tipo: frenteTipoEnum("tipo").notNull(),
  deStatus: varchar("de_status", { length: 40 }),
  paraStatus: varchar("para_status", { length: 40 }),
  reversao: boolean("reversao").notNull().default(false),
  autorId: uuid("autor_id").references(() => usuarios.id),
  criadoEm,
});

// ── NãoConformidade: desvio de processo numa admissão (Fase 2C) ─────────────
// Modelo de duas vias: Via 1 (NC comum, penaliza o consultor que gerou a admissão) e Via 2
// (liberação por determinação da diretoria — aprovada pela supervisão, não penaliza). Três
// gatilhos (tipo): NC1 auditoria sem docs, NC2 exame sem ASO (com aceite), NC3 cadastro incompleto
// (flags manuais). Sem CPF/URL — referencia a admissão por id (§A.6). Resolver fecha mas o
// registro PERMANECE (histórico por consultor).
export const naoConformidades = pgTable(
  "nao_conformidades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    tipo: ncTipoEnum("tipo").notNull(),
    // Consultor responsável (autor da admissão). Nullable: admissões antigas sem consultor.
    consultorId: uuid("consultor_id").references(() => usuarios.id),
    status: ncStatusEnum("status").notNull().default("ABERTA"),
    detalhe: text("detalhe"),
    // NC2 — termo de ciência do aceite "apto sem ASO" (autor = consultorId, data = criadoEm).
    aceiteTermo: text("aceite_termo"),
    // NC3 — flags manuais (kit/assinatura ainda não existem: F9/INT-4 são fases futuras).
    flagSemKit: boolean("flag_sem_kit").notNull().default(false),
    flagSemAssinatura: boolean("flag_sem_assinatura").notNull().default(false),
    flagCadastroNaoMarcado: boolean("flag_cadastro_nao_marcado").notNull().default(false),
    // Via 2 — liberação por determinação da diretoria.
    liberacaoStatus: ncLiberacaoEnum("liberacao_status").notNull().default("NENHUMA"),
    liberacaoMotivo: text("liberacao_motivo"),
    liberacaoSolicitanteId: uuid("liberacao_solicitante_id").references(() => usuarios.id),
    liberacaoAprovadorId: uuid("liberacao_aprovador_id").references(() => usuarios.id),
    liberacaoDecididoEm: timestamp("liberacao_decidido_em", { withTimezone: true }),
    // Resolução (Via 1) — fecha a NC mantendo o histórico.
    resolvidoPor: uuid("resolvido_por").references(() => usuarios.id),
    resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Uma NC por (admissão + tipo): idempotente para os gatilhos automáticos (NC1/NC2).
    uniqNcPorAdmissao: unique().on(t.admissaoId, t.tipo),
  }),
);

// ── PassagemAceite: trilha de aceite por passagem (S3 — ajustes-2B-2C) ───────
// Registro PERMANENTE de cada avanço de frente (concluir Auditoria/Exame) feito com campos
// obrigatórios pendentes, sob aceite explícito do consultor. Trilha de passagem (regra 8), NÃO
// penalização — a penalização é decidida na tela de Não Conformidades. Sem CPF (§A.6).
export const passagemAceites = pgTable("passagem_aceites", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  frenteId: uuid("frente_id")
    .notNull()
    .references(() => frentesAdmissao.id, { onDelete: "cascade" }),
  tipo: frenteTipoEnum("tipo").notNull(),
  deStatus: varchar("de_status", { length: 40 }),
  paraStatus: varchar("para_status", { length: 40 }),
  // Campos obrigatórios que estavam vazios no momento do avanço (rótulos legíveis, sem dado pessoal).
  camposPendentes: text("campos_pendentes"),
  autorId: uuid("autor_id").references(() => usuarios.id),
  criadoEm,
});

// ── RegraAuditoria: critério configurável de aprovação da IA por tipo de doc (Fase 4 / INT-3) ─
// O admin (Master/Super Admin) descreve, em texto, o que torna um documento válido. A régua
// (regua_documental) diz QUAIS documentos são exigidos; estas regras dizem SE cada um está válido.
// O `descricao_regra` é o critério em linguagem natural enviado ao motor de IA — nunca contém PII
// (§A.6). Uma regra com tipo "DOCUMENTOS EM GERAL" é seedada para todos os tipos (baseline).
export const regrasAuditoria = pgTable("regras_auditoria", {
  id: uuid("id").defaultRandom().primaryKey(),
  tipoDocumentoId: uuid("tipo_documento_id")
    .notNull()
    .references(() => tiposDocumento.id, { onDelete: "cascade" }),
  descricaoRegra: text("descricao_regra").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── IntegraçãoPandapé (anexo opcional — só quando a admissão veio do Pandapé) ─
export const integracaoPandape = pgTable("integracao_pandape", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  idPrecollaborator: varchar("id_precollaborator", { length: 80 }),
  idMatch: varchar("id_match", { length: 80 }),
  idVacancy: varchar("id_vacancy", { length: 80 }),
  etapa: varchar("etapa", { length: 120 }),
  criadoEm,
  atualizadoEm,
});
