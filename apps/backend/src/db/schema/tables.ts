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
  criadoEm,
  atualizadoEm,
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
  tipoContrato: varchar("tipo_contrato", { length: 60 }),
  matricula: varchar("matricula", { length: 60 }),
  dataAdmissao: date("data_admissao"),
  farolGlobal: farolGlobalEnum("farol_global").notNull().default("ATIVO"),
  sinalizadorPreenchimento: sinalizadorEnum("sinalizador_preenchimento")
    .notNull()
    .default("PENDENTE"),
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
  escala: varchar("escala", { length: 80 }),
  centroCusto: varchar("centro_custo", { length: 80 }),
  departamento: varchar("departamento", { length: 120 }),
  gestorBp: varchar("gestor_bp", { length: 160 }),
  motivo: varchar("motivo", { length: 200 }),
  tempoContrato: varchar("tempo_contrato", { length: 80 }),
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
