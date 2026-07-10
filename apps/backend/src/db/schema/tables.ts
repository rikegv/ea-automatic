import {
  boolean,
  date,
  index,
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
  clicksignStatusEnum,
  estadoDocumentoEnum,
  exigenciaEnum,
  farolGlobalEnum,
  fornecedorExameEnum,
  frenteTipoEnum,
  ncLiberacaoEnum,
  ncStatusEnum,
  ncTipoEnum,
  origemEnum,
  papelEnum,
  sexoEnum,
  sinalizadorEnum,
  tipoServicoEnum,
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
  // Senha temporária (OST-EA-GESTAO-USUARIOS): true logo após criação/reset pelo admin. Enquanto
  // true, o SenhaTemporariaGuard exige a troca no primeiro acesso antes de liberar as demais rotas.
  senhaTemporaria: boolean("senha_temporaria").notNull().default(false),
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

// ── ClienteBeneficioPadrao: valor padrão de VR/AM por cliente (item 4) ──────
// Ao criar uma admissão, o valor informado para VR (Vale-Refeição) e AM (Assistência Médica) vira
// PADRÃO do cliente (last write wins), pré-preenchendo a próxima admissão. `beneficio` é a chave
// ESTÁVEL ("VR"/"AM"), independente do rótulo completo. Sem PII — só valor monetário por cliente.
export const clienteBeneficioPadrao = pgTable(
  "cliente_beneficio_padrao",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: text("cod_cliente")
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    beneficio: varchar("beneficio", { length: 10 }).notNull(),
    valor: text("valor").notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uq: unique("uq_cliente_beneficio_padrao").on(t.codCliente, t.beneficio),
  }),
);

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
  // Sexo (régua padrão): condiciona a exigência da Carteira de Reservista (só MASCULINO). Nulo nos
  // candidatos criados antes do campo existir; nesses casos o Reservista não é cobrado.
  sexo: sexoEnum("sexo"),
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

// ── Gerador de Kit (OST): kits por tipo de vínculo + dicionário de títulos por kit ──
// Dois níveis: kit_tipo (KIT TEMPORÁRIO, KIT TERCEIRO, ...) e kit_regra_documento (os títulos de
// documento daquele kit, na ordem em que entram no kit consolidado do funcionário). O motor usa o
// dicionário do KIT selecionado no upload, o que elimina falsos "não reconhecidos" entre kits.
export const kitTipo = pgTable("kit_tipo", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 120 }).notNull().unique(),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

export const kitRegraDocumento = pgTable(
  "kit_regra_documento",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kitTipoId: uuid("kit_tipo_id")
      .notNull()
      .references(() => kitTipo.id, { onDelete: "cascade" }),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    ordem: integer("ordem").notNull().default(0),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  // O título é único DENTRO de um kit (o mesmo documento base repete entre kits diferentes).
  (t) => ({
    uqKitTitulo: unique("uq_kit_documento_titulo").on(t.kitTipoId, t.titulo),
  }),
);

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
  // Vínculo cliente↔(empresa Soulan, filial, tipo) escolhido para esta admissão (OST estrutural).
  // NULLABLE e ON DELETE SET NULL: não obrigatório; admissões existentes e o wizard atual seguem por
  // `tipo_contrato`. Quando preenchido, resolve a entidade/CNPJ e a pasta do Drive a partir do vínculo.
  clienteVinculoId: uuid("cliente_vinculo_id").references(() => clienteVinculos.id, {
    onDelete: "set null",
  }),
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
  // Origem da admissão (Fase 5 / INT-1): MANUAL (wizard F6) ou PANDAPE (sync). Default MANUAL —
  // admissões anteriores e as criadas pelo wizard permanecem MANUAL sem alteração de chamada.
  origem: origemEnum("origem").notNull().default("MANUAL"),
  // URL da pasta do Drive criada ao fechar a régua obrigatória (Fase 4 / INT-2). É REFERÊNCIA
  // (link da pasta do prontuário), não dado pessoal nem URL do Pandapé — pode persistir (§A.6).
  drivePastaUrl: text("drive_pasta_url"),
  // URL do prontuário no Drive gravada ao arquivar o ASO logo após a auditoria VALIDADO (Fase 4
  // ajustes finais — o ASO não espera o fechamento da régua). Referência (link da pasta), não PII.
  driveAsoUrl: text("drive_aso_url"),
  // ASO validado pelo consultor (aba EXAME): gate de APTO exige ASO anexado E validado. Um novo
  // upload de ASO zera este flag (precisa revalidar). Aditivo, default false (admissões existentes).
  asoValidado: boolean("aso_validado").notNull().default(false),
  // Assinatura na Clicksign (INT-4 / F9). `clicksignEnvelopeId` é o ID do envelope na API 3.0 —
  // referência técnica, não PII nem URL do Pandapé (§A.6). `clicksignStatus` espelha o ciclo do
  // envelope (SEM_ENVELOPE inicial). `contratoAssinadoDriveUrl` é o link do contrato assinado já
  // arquivado no Drive (referência, não binário — regra 7); o original da Clicksign expira em ~5min.
  clicksignEnvelopeId: varchar("clicksign_envelope_id", { length: 80 }),
  clicksignStatus: clicksignStatusEnum("clicksign_status").notNull().default("SEM_ENVELOPE"),
  contratoAssinadoDriveUrl: text("contrato_assinado_drive_url"),
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

// ── ExameAgendamento (1:1 da Admissão) — gestão do agendamento do exame (aba EXAME) ─────────
// O consultor lança os dados que a clínica/fornecedor respondeu por e-mail. `reagendamentos` conta
// quantas vezes foi reagendado (sub-status). `data` alimenta a coluna AGENDAMENTO do relatório da
// clínica. Aditivo/reversível. Sem PII (só logística do exame).
export const exameAgendamento = pgTable("exame_agendamento", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  data: date("data"),
  horario: varchar("horario", { length: 5 }), // "HH:MM"
  nomeClinica: varchar("nome_clinica", { length: 200 }),
  local: text("local"),
  fornecedor: fornecedorExameEnum("fornecedor"),
  reagendamentos: integer("reagendamentos").notNull().default(0),
  criadoEm,
  atualizadoEm,
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
export const integracaoPandape = pgTable(
  "integracao_pandape",
  {
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
  },
  // Unique no id_precollaborator: idempotência da sync Pandapé (uma admissão por pré-colaborador).
  // Postgres admite múltiplos NULL sob unique — admissões manuais (sem linha de integração) não
  // conflitam; idPrecollaborator permanece nullable.
  (t) => ({ uniqPrecollab: unique("uq_integracao_pandape_precollab").on(t.idPrecollaborator) }),
);

// ── DuplaCorrecaoAceites: trilha de aceite da dupla correção (INT-4 / §A.5 / §A.6) ───────────
// Log de auditoria SENSÍVEL, permanente e consultável (§A.6): no reenvio por correção de um
// contrato, o consultor aceita explicitamente que corrigiu no EA Automatic E diretamente no G.I
// (controle por responsabilização, não verificação técnica). Guarda autor, termo de ciência e
// data — sem CPF nem URL (§A.6). Aditivo: nunca atualizado, só inserido.
export const duplaCorrecaoAceites = pgTable(
  "dupla_correcao_aceites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id")
      .notNull()
      .references(() => usuarios.id),
    termo: text("termo").notNull(),
    criadoEm,
  },
  (t) => ({
    idxAdmissao: index("idx_dupla_correcao_aceites_admissao").on(t.admissaoId),
  }),
);

// ── CandidatoAlteracaoLog: trilha de edição de dados da admissão/vaga (OST-EA-GESTAO-USUARIOS) ──
// ATENÇÃO (§A.6): ao contrário das trilhas de frente (frente_status_eventos, passagem_aceites, que
// deliberadamente evitam PII e guardam só rótulos/estado), esta tabela guarda os VALORES ANTES/DEPOIS
// de campos editados — que PODEM ser dado pessoal/sensível (salário, benefícios, endereço). É uma
// EXCEÇÃO CONSCIENTE exigida pela OST (trilha de "quem mudou o quê" no candidato). Minimização:
// o CPF NUNCA é logado aqui (é campo imutável — identidade, §A.3 — jamais editado por `editar`).
// `autorId` nullable: ações do sistema (ex.: recompute de farol) não têm autor humano.
export const candidatoAlteracoesLog = pgTable(
  "candidato_alteracoes_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // ON DELETE SET NULL (governança): a trilha de edição SOBREVIVE se a admissão for excluída depois
    // (quem/quando/campo/valores permanecem para auditoria; perde-se só o vínculo com a admissão).
    admissaoId: uuid("admissao_id").references(() => admissoes.id, { onDelete: "set null" }),
    campo: varchar("campo", { length: 60 }).notNull(),
    valorAnterior: text("valor_anterior"),
    valorNovo: text("valor_novo"),
    autorId: uuid("autor_id").references(() => usuarios.id),
    criadoEm,
  },
  (t) => ({
    idxAdmissao: index("idx_candidato_alteracoes_log_admissao").on(t.admissaoId),
  }),
);

// ── Entidade do Grupo Soulan (empresa contratante) — OST estrutural ─────────
// Catálogo das empresas Soulan (ex.: SOULAN ADMINISTRAÇÃO, NEAT). Regra final do diretor: o match é
// SÓ pelo número da EMPRESA (ignora filial), então o CNPJ é FIXO por entidade e mora aqui (`cnpj`,
// completo). `cnpjRaiz` (8 díg) mantido por compat. CNPJ nulo = tipo cujo CNPJ o diretor ainda não
// forneceu (Temporário/Terceiro/Estágio) — não inventar.
export const entidadesSoulan = pgTable("entidades_soulan", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  cnpjRaiz: varchar("cnpj_raiz", { length: 8 }),
  cnpj: varchar("cnpj", { length: 18 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── CNPJ completo por filial da entidade Soulan (empresa + filial → CNPJ) ────
// DADO PENDENTE do diretor: aqui só a ESTRUTURA. `cnpj` fica nulo até a fonte autoritativa chegar
// (não inventar). FOPAG não usa esta tabela (documento = CNPJ do próprio cliente).
export const entidadeFiliais = pgTable(
  "entidade_filiais",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entidadeId: uuid("entidade_id")
      .notNull()
      .references(() => entidadesSoulan.id, { onDelete: "cascade" }),
    filial: varchar("filial", { length: 20 }).notNull(),
    cnpj: varchar("cnpj", { length: 18 }),
    nomeFilial: text("nome_filial"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({ uq: unique("uq_entidade_filial").on(t.entidadeId, t.filial) }),
);

// ── Vínculo cliente ↔ (empresa Soulan, filial, tipo de serviço) — 1:N ───────
// Um cliente pode ter vários vínculos (ex.: temporário E terceiro). `tipoServico` é derivado do
// código "Empresa" da base. `isFopag` (código > 6): documento usa o CNPJ do cliente; `entidadeId`
// fica NULL (não há entidade Soulan). Não-FOPAG resolve o CNPJ via `entidade_filiais` (pendente).
export const clienteVinculos = pgTable(
  "cliente_vinculos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: varchar("cod_cliente", { length: 40 })
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    empresaCodigo: varchar("empresa_codigo", { length: 10 }).notNull(),
    tipoServico: tipoServicoEnum("tipo_servico").notNull(),
    filial: varchar("filial", { length: 20 }),
    isFopag: boolean("is_fopag").notNull().default(false),
    entidadeId: uuid("entidade_id").references(() => entidadesSoulan.id, { onDelete: "set null" }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uq: unique("uq_cliente_vinculo").on(t.codCliente, t.empresaCodigo, t.filial),
    idxCliente: index("idx_cliente_vinculos_cliente").on(t.codCliente),
  }),
);
