import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  cartaoVtEnum,
  clicksignStatusEnum,
  estadoDocumentoEnum,
  exigenciaEnum,
  farolGlobalEnum,
  frenteTipoEnum,
  origemSalaEsperaEnum,
  origemVinculoProjetoEnum,
  periodicidadeBeneficioEnum,
  tipoIntegracaoEnum,
  ncLiberacaoEnum,
  ncStatusEnum,
  ncTipoEnum,
  origemEnum,
  papelEnum,
  sentidoVtEnum,
  sexoEnum,
  sinalizadorEnum,
  statusCadastroBeneficioEnum,
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

// ── Menus + permissão de menu por usuário (OST permissão de menu) ───────────
// Catálogo de MENUS em TABELA, no mesmo padrão de `frente_status_catalogo`: seed por
// `onConflictDoUpdate` a partir do registro em código (`domain/menus.ts`), então a TELA de
// configuração e o `/auth/me` leem daqui (fonte de verdade), e um menu novo aparece na configuração
// só rodando o seed, sem deploy da tela. A chave é o `codigo` (slug estável); rótulo, rota, grupo e
// ordem convergem no seed.
export const menus = pgTable("menus", {
  codigo: varchar("codigo", { length: 60 }).primaryKey(),
  rotulo: varchar("rotulo", { length: 120 }).notNull(),
  href: varchar("href", { length: 120 }).notNull(),
  grupo: varchar("grupo", { length: 20 }).notNull(), // OPERACAO | ADMIN
  ordem: integer("ordem").notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

// Associação USUÁRIO x MENU. A ausência de linha para um par (usuário, menu) significa "sem esse
// menu". MASTER e SUPER_ADMIN NÃO dependem desta tabela: o guard os libera sempre (evita alguém se
// trancar fora). §A.6: só ids e código de menu, nada de PII.
export const usuarioMenus = pgTable(
  "usuario_menus",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    menuCodigo: varchar("menu_codigo", { length: 60 })
      .notNull()
      .references(() => menus.codigo, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.usuarioId, t.menuCodigo] }),
  }),
);

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
  // ── Camada de pagamento do benefício (§A.17 etapa 4). Moram AQUI, e não em
  // `cliente_pendencia_config`, porque aquela tabela é chave e valor BOOLEANO (só diz se algo é
  // obrigatório) e estes são valores tipados. São atributos de valor único do cliente, exatamente o
  // perfil dos `*_padrao` logo acima.
  //
  // NASCEM NULAS, SEM DEFAULT, de propósito: cliente sem regra cadastrada não deve fingir que tem
  // uma. A tela mostra "não informado" e não calcula nada para ele.
  /** Só informativa: a tela exibe o rótulo e NÃO calcula nada a partir dela (decisão do diretor). */
  periodicidadeBeneficio: periodicidadeBeneficioEnum("periodicidade_beneficio"),
  /** Dia âncora do pagamento recorrente (1 a 31). Cadastro, sem cálculo derivado. */
  diaPagamentoBeneficio: smallint("dia_pagamento_beneficio"),
  /**
   * Dias CORRIDOS da admissão até o primeiro crédito, contando o próprio dia da admissão. É o ÚNICO
   * campo desta camada que entra em cálculo: a data do 1º crédito é `data_admissao + (dias - 1)`,
   * com piso em zero, então 0 e 1 caem na própria data de admissão.
   */
  diasPrimeiroCredito: smallint("dias_primeiro_credito"),
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
    /** Vínculo (item 7): NULL = padrão do cliente todo; preenchido = padrão daquele contrato. */
    clienteVinculoId: uuid("cliente_vinculo_id").references(() => clienteVinculos.id, {
      onDelete: "cascade",
    }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uq: uniqueIndex("uq_cliente_beneficio_padrao")
      .on(t.codCliente, t.beneficio)
      .where(sql`${t.clienteVinculoId} is null`),
    uqVinculo: uniqueIndex("uq_vinculo_beneficio_padrao")
      .on(t.clienteVinculoId, t.beneficio)
      .where(sql`${t.clienteVinculoId} is not null`),
  }),
);

// ── ClienteBeneficioRegra: as REGRAS de benefício do cliente (onda 2) ───────
// A regra escrita que o time de benefícios precisa ter à mão ao lançar: "VT sem desconto em folha",
// "VR descontado 10%", "AM sem coparticipação". É do CLIENTE, então vale igual para todas as pessoas
// dele; a tela lê pelo `cod_cliente` da linha e nunca pela admissão.
//
// TABELA PRÓPRIA, e não coluna em `clientes` como a camada de pagamento: aquela são três valores de
// valor ÚNICO por cliente, e esta é 1 para N (um cliente, uma regra por benefício). O desenho é o do
// `cliente_beneficio_padrao` logo acima, com a mesma chave estável por SIGLA.
//
// `beneficio` guarda a sigla ("VT", "VR", "VA", "AM"), mais "OUTROS" para o que não é dos quatro
// principais e "GERAL" para a nota do cliente inteiro. Texto LIVRE (decisão do diretor): lista
// fechada engessaria a primeira exceção que aparecesse.
//
// §A.6: política comercial do cliente, sem PII e sem CPF. Nada aqui entra em farol, contagem ou KPI.
export const clienteBeneficioRegra = pgTable(
  "cliente_beneficio_regra",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: text("cod_cliente")
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    beneficio: varchar("beneficio", { length: 10 }).notNull(),
    texto: text("texto").notNull(),
    criadoEm,
    atualizadoEm,
  },
  // Uma regra por (cliente + benefício): a gravação é um upsert por esta chave, então salvar duas
  // vezes corrige em vez de duplicar.
  (t) => ({
    uq: uniqueIndex("uq_cliente_beneficio_regra").on(t.codCliente, t.beneficio),
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

// ── Motivo de declínio (catálogo próprio, mesmo padrão de Cargo) ─────────────
// Motivo pelo qual uma admissão declinou (25 canônicos aprovados na Fase 1). Soft-delete por `ativo`.
export const motivosDeclinio = pgTable("motivos_declinio", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

// ── Tarifa de transporte (catálogo próprio, fundação do VT Online §A.17) ─────
// Tarifa vigente por (cidade + tipo de transporte), mantida internamente. O formulário de VT
// (OST seguinte) lê daqui para SUGERIR o valor ao candidato, que confirma ou ajusta.
// `valor` é numeric(10,2): gratuidade é 0.00 (valor real, não ausência de tarifa).
// Soft-delete por `ativo`, mesmo padrão de Cargo e Motivo de declínio.
export const tarifasTransporte = pgTable(
  "tarifas_transporte",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cidade: varchar("cidade", { length: 120 }).notNull(),
    tipoTransporte: varchar("tipo_transporte", { length: 120 }).notNull(),
    valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
    observacao: varchar("observacao", { length: 240 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Chave de negócio: uma tarifa por cidade + transporte. O service antecipa a colisão com 409.
    uqCidadeTransporte: unique("uq_tarifa_cidade_transporte").on(t.cidade, t.tipoTransporte),
  }),
);

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
    id: uuid("id").defaultRandom().notNull(),
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
    /**
     * VÍNCULO (OST Onda 3, item 7, Caminho 2). NULL = régua do CLIENTE INTEIRO, que é como as 3.586
     * linhas existentes ficam e por que nenhum dos 233 clientes de um vínculo só muda de
     * comportamento. Preenchido = régua daquele vínculo (cliente + tipo de contrato), com
     * PRECEDÊNCIA sobre a do cliente.
     *
     * A precedência é o que permite ao cliente de dois contratos ter checklists diferentes sem
     * duplicar o cadastro do cliente, que era o custo do caminho descartado (trocar a PK).
     */
    clienteVinculoId: uuid("cliente_vinculo_id").references(() => clienteVinculos.id, {
      onDelete: "cascade",
    }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // A PK composta (cod_cliente + cargo + tipo_documento) deu lugar a um id próprio: com o vínculo
    // no jogo, o MESMO par cliente/cargo/documento existe duas vezes (uma por contrato), e a chave
    // antiga proibia exatamente isso. A unicidade real virou os dois índices parciais abaixo.
    pk: primaryKey({ columns: [t.id] }),
    uqCliente: uniqueIndex("uq_regua_cliente")
      .on(t.codCliente, t.cargoId, t.tipoDocumentoId)
      .where(sql`${t.clienteVinculoId} is null`),
    uqVinculo: uniqueIndex("uq_regua_vinculo")
      .on(t.clienteVinculoId, t.cargoId, t.tipoDocumentoId)
      .where(sql`${t.clienteVinculoId} is not null`),
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
  // NOME DO BANCO informado pelo candidato no formulário do Pandapé (OST do banco no modal do olho).
  // É TEXTO LIVRE digitado por ele ("NUBANK", "BANCO DO BRASIL", "Nu Pagamentos S.A."), não um código
  // normalizado: entra como INFORMAÇÃO A MAIS na ficha, nunca como regra de negócio.
  //
  // §A.6: guarda SÓ o nome da instituição. Agência e conta vêm no mesmo formulário do Pandapé e são
  // deliberadamente NÃO persistidas: quem valida esses dados é a auditoria do comprovante pela IA,
  // que continua exatamente como está, e retê-los aqui seria dado sensível sem uso.
  banco: varchar("banco", { length: 120 }),
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
// `exigeValor` é a regra "este benefício precisa de quanto?" trazida do CÓDIGO para o CADASTRO (OST
// cadastro de benefícios por tela). Antes ela vivia na constante `BENEFICIOS_COM_VALOR` do
// shared-types e casava por TEXTO DO NOME, com dois defeitos: benefício novo nascia sem exigir valor
// e não havia como mudar isso sem deploy, e RENOMEAR um benefício alterava a exigência em silêncio.
// Agora a coluna é a fonte da verdade; `beneficioExigeValor` fica só como fallback do nome legado.
export const beneficiosCatalogo = pgTable("beneficios_catalogo", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  exigeValor: boolean("exige_valor").notNull().default(false),
  criadoEm,
});
/**
 * CATÁLOGO DE CLÍNICAS (OST Onda 2, item 4). Guarda SÓ O NOME, por decisão do diretor: nada de
 * endereço, telefone ou contato. O agendamento do exame passa a SELECIONAR daqui em vez de digitar
 * texto livre, que é o que fazia a mesma clínica aparecer escrita de cinco formas diferentes.
 *
 * Mesmo ciclo de vida dos outros catálogos: inativar é EXCLUSÃO LÓGICA (`ativo=false`), nunca física
 * e nunca em cascata, para o agendamento que já aponta para a clínica continuar legível.
 *
 * §A.6: nome de clínica é dado de fornecedor, não de pessoa.
 */
export const clinicasCatalogo = pgTable("clinicas_catalogo", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull().unique(),
  /**
   * FORNECEDOR da clínica (OST do fornecedor por clínica). Os dados reais mostraram que a relação é
   * um-para-um: cada clínica sempre aparece com o MESMO fornecedor, e as menores são credenciadas da
   * rede MEDICAL. Então o fornecedor é atributo da CLÍNICA, não do agendamento, e o agendamento
   * deixou de perguntar: ele deriva daqui.
   *
   * Coluna de TEXTO, não enum: o enum `fornecedor_exame` era rígido por definição, e o ponto desta
   * OST é justamente poder cadastrar fornecedor novo sem migração.
   */
  fornecedor: varchar("fornecedor", { length: 60 }),
  /**
   * ENDEREÇO da clínica (OST melhorias EAC, item 6): quando o agendamento do exame subir, puxa este
   * endereço automaticamente em vez de o consultor redigitar. NULLABLE de propósito: as clínicas já
   * cadastradas não têm endereço e não podem virar inválidas por causa de uma coluna nova; o campo é
   * preenchido conforme cada clínica é editada. §A.6: dado de fornecedor, não de pessoa.
   */
  endereco: varchar("endereco", { length: 200 }),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
});

/**
 * OBRIGATORIEDADE DE PENDÊNCIA POR CLIENTE (OST da tela de gestão de obrigatoriedade).
 *
 * Guarda o que está DESLIGADO, não o que está ligado, e essa escolha é o coração do desenho:
 * **ausência de linha significa OBRIGATÓRIO**. Cliente que o diretor nunca configurou se comporta
 * exatamente como antes da tela existir, e nenhuma admissão muda sozinha.
 *
 * `chave` é CANÔNICA (`CENTRO_CUSTO`, `GESTOR_BP`), nunca o rótulo de tela: rótulo já mudou uma vez
 * no sistema, e config amarrada a texto de tela vira lixo silencioso na primeira renomeação.
 *
 * §A.6: código de cliente e chave de item. Nenhum dado pessoal.
 */
export const clientePendenciaConfig = pgTable(
  "cliente_pendencia_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: varchar("cod_cliente", { length: 40 })
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    chave: varchar("chave", { length: 40 }).notNull(),
    obrigatorio: boolean("obrigatorio").notNull().default(true),
    /** Vínculo (item 7): NULL = vale para o cliente todo; preenchido = só daquele contrato. */
    clienteVinculoId: uuid("cliente_vinculo_id").references(() => clienteVinculos.id, {
      onDelete: "cascade",
    }),
    atualizadoEm,
  },
  (t) => ({
    // Mesmo desenho da régua: uma linha por (cliente + chave) no nível do cliente, e uma por
    // (vínculo + chave) no nível do contrato. O `unique` simples não expressa isso, então virou
    // dois índices parciais.
    uniqClienteChave: uniqueIndex("uq_cliente_pendencia")
      .on(t.codCliente, t.chave)
      .where(sql`${t.clienteVinculoId} is null`),
    uniqVinculoChave: uniqueIndex("uq_vinculo_pendencia")
      .on(t.clienteVinculoId, t.chave)
      .where(sql`${t.clienteVinculoId} is not null`),
  }),
);

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
    // `padrao` separa o documento de INSTRUÇÃO GERAL (o mesmo manual para todo mundo, sem nome de
    // funcionário na página) do documento INDIVIDUAL da pessoa. Mesmo espírito do `exigeValor` de
    // benefícios: a regra vira CADASTRO, não fica presa ao texto do título nem ao código. O motor
    // não cobra nome de um PADRÃO e o replica no kit de cada funcionário do lote. Nasce `false`,
    // então todo documento já existente continua INDIVIDUAL e nada muda de comportamento.
    padrao: boolean("padrao").notNull().default(false),
    criadoEm,
    atualizadoEm,
  },
  // O título é único DENTRO de um kit (o mesmo documento base repete entre kits diferentes).
  (t) => ({
    uqKitTitulo: unique("uq_kit_documento_titulo").on(t.kitTipoId, t.titulo),
  }),
);

// ── Admissão (entidade central: Candidato + Cliente + Cargo) ────────────────
export const admissoes = pgTable(
  "admissoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidatoCpf: varchar("candidato_cpf", { length: 11 })
      .notNull()
      .references(() => candidatos.cpf),
    // NULÁVEIS a partir da Liberação Admissional (Parte 1): a pré-admissão do Pandapé
    // (farol AGUARDANDO_LIBERACAO) chega SEM cliente/cargo, atribuídos só na liberação. Fora desse
    // estado seguem sempre preenchidos — os innerJoin da esteira/Gerenciador já descartam o nulo, e o
    // farol AGUARDANDO_LIBERACAO é excluído de todas as filas/KPIs.
    codCliente: varchar("cod_cliente", { length: 40 }).references(() => clientes.codCliente),
    cargoId: uuid("cargo_id").references(() => cargos.id),
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
    // ── PAUSA (OST admissão pausada) ────────────────────────────────────────
    // FLAG PARALELA, deliberadamente NÃO um valor de `farol_global`. O motivo é a auditoria, que
    // CONTINUA durante a pausa: auditar chama `recomputeFarolGlobal`, então "Pausada" como farol
    // teria de entrar em FAROL_MANUAL para não ser apagado, e entrar em FAROL_MANUAL congelaria a
    // derivação (a admissão que fechasse Auditoria+Exame pausada não viraria BANCO_AGUARDAR). O
    // farol MENTIRIA ao retomar. Com a flag, o farol deriva por baixo e retomar é só limpar a flag:
    // o estado já está certo, nada recomeça.
    // `pausada_em` null = NÃO pausada. É a única fonte da verdade da pausa.
    pausadaEm: timestamp("pausada_em", { withTimezone: true }),
    pausadaPor: uuid("pausada_por").references(() => usuarios.id, { onDelete: "set null" }),
    // Motivo OPCIONAL (decisão do diretor): pausa rápida não pode depender de digitar justificativa.
    // Quando preenchido, vai para a trilha do modal do olho junto do evento.
    pausaMotivo: text("pausa_motivo"),
    sinalizadorPreenchimento: sinalizadorEnum("sinalizador_preenchimento")
      .notNull()
      .default("PENDENTE"),
    /**
     * Status do cadastro do pacote de benefícios (§A.17 etapa 4). POR CANDIDATO, não por benefício:
     * a pergunta da operação é "os benefícios desta pessoa já foram calculados?", e o pacote inteiro
     * caminha junto.
     *
     * TRÊS ESTÁGIOS (decisão do diretor): AGUARDANDO_CALCULO -> BENEFICIO_CALCULADO -> FINALIZADO.
     * Toda admissão nasce no primeiro, e é isso que o default diz. FINALIZADO tira a pessoa da fila
     * de trabalho e a manda para a aba de Finalizados: a aba É o status, sem marcação extra.
     *
     * `PENDENTE` e `CADASTRADO` são os valores antigos, órfãos depois da migração das linhas. Ficam
     * no enum porque Postgres não remove valor sem recriar o tipo, e fora da `SEQUENCIA_BENEFICIO`
     * porque ninguém deve voltar a usá-los.
     *
     * SÓ A TELA DE BENEFÍCIOS LÊ ESTE CAMPO. Ele não entra em régua de conclusão, farol, gate nem
     * KPI de nenhuma outra tela, e é isso que torna a expansão dos valores segura (§A.27).
     */
    statusCadastroBeneficio: statusCadastroBeneficioEnum("status_cadastro_beneficio")
      .notNull()
      .default("AGUARDANDO_CALCULO"),
    /**
     * ENTRADA NA FILA DE BENEFÍCIOS: carimbo do instante em que o Cadastro concluiu (§A.17 etapa 4).
     * Nulo = nunca entrou; a tela lê exatamente `IS NOT NULL`.
     *
     * É COLUNA, e NÃO uma frente em `frentes_admissao` (decisão do diretor sobre o desenho de menor
     * impacto, §A.27). A frente daria o mesmo comportamento e custaria alcance: valor novo no enum
     * `frente_tipo`, na união `FrenteTipo` e nos três mapas totais que ela indexa, mais linhas no
     * catálogo de status e uma linha a mais em `frentes_admissao` para cada admissão. Aquela tabela é
     * lida por TODA consulta de contagem do sistema, e hoje elas só não erram porque todas filtram
     * por tipo: bastaria uma futura esquecer o filtro para a conta quebrar em silêncio. Foi
     * exatamente esse tipo de dependência escondida que quebrou a contagem da Bienal.
     *
     * ESTA COLUNA NÃO PARTICIPA DE NADA: não entra em régua de conclusão, farol, gate nem KPI.
     * Ninguém além da tela de Benefícios a lê, e é isso que a torna segura.
     *
     * NÃO RETROATIVA por construção, como a Integração: o carimbo acontece no INSTANTE da transição,
     * então as admissões que já estavam CADASTRADO nunca passam pelo gatilho e não entram na fila.
     */
    beneficiosEntrouEm: timestamp("beneficios_entrou_em", { withTimezone: true }),
    // Origem da admissão (Fase 5 / INT-1): MANUAL (wizard F6) ou PANDAPE (sync). Default MANUAL —
    // admissões anteriores e as criadas pelo wizard permanecem MANUAL sem alteração de chamada.
    origem: origemEnum("origem").notNull().default("MANUAL"),
    // URL da pasta do Drive criada ao fechar a régua obrigatória (Fase 4 / INT-2). É REFERÊNCIA
    // (link da pasta do prontuário), não dado pessoal nem URL do Pandapé — pode persistir (§A.6).
    drivePastaUrl: text("drive_pasta_url"),
    // URL do prontuário no Drive gravada ao arquivar o ASO logo após a auditoria VALIDADO (Fase 4
    // ajustes finais — o ASO não espera o fechamento da régua). Referência (link da pasta), não PII.
    driveAsoUrl: text("drive_aso_url"),
    // FIM DO SILÊNCIO DO ARQUIVAMENTO (OST re-baixar do Pandapé). Até aqui, arquivamento que não
    // concluía deixava `drive_pasta_url` nula e mais nada: nem quem olhava o banco, nem a tela de
    // diagnóstico, sabiam POR QUE o prontuário não existia (sem pasta-pai? staging expirada? o
    // Google recusou?). Agora todo desfecho que não conclui grava o motivo REAL aqui, e conclusão
    // bem-sucedida LIMPA os dois campos. Alimenta o sinal "Arquivamento No Drive Falhou".
    // §A.6: texto de motivo e código de tipo de documento, nunca nome, CPF, arquivo ou URL externa.
    driveFalhaMotivo: text("drive_falha_motivo"),
    driveFalhaEm: timestamp("drive_falha_em", { withTimezone: true }),
    // PASTAS DUPLICADAS do prontuário (OST da duplicação). Ids das OUTRAS pastas com o mesmo nome
    // encontradas no Drive, separados por vírgula. O arquivamento escolhe a mais completa, NUNCA
    // trava por ambiguidade, e deixa aqui o que sobrou para o diretor consolidar e apagar à mão
    // (§A.6: o módulo do Drive não apaga nada). Alimenta o sinal "Pasta Duplicada No Drive".
    // Id de pasta é referência, não PII.
    driveDuplicatas: text("drive_duplicatas"),
    // DUPLICATAS BAIXADAS PELO DIRETOR. Ids que ele decidiu tirar do sinal SEM apagar a pasta no
    // Drive: ele assume a remoção manual daqui pra frente e não quer o aviso aceso no meio tempo.
    // Sem esta memória, o aviso voltaria sozinho no primeiro rearquivamento ou na reconciliação, que
    // reconferem o Drive, acham as mesmas pastas e regravam `drive_duplicatas`, desfazendo a decisão.
    // Id de pasta APAGADA sai desta lista na reconciliação (a decisão morre junto com a pasta, e uma
    // duplicata NOVA volta a acender normalmente). Quem baixou e quando ficam em
    // `candidato_alteracoes_log`, a trilha permanente. §A.6: só id de pasta, nunca PII.
    driveDuplicatasBaixadas: text("drive_duplicatas_baixadas"),
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
    /**
     * TROCA DE CLIENTE/CARGO (OST da correção do cliente errado). Carimbo do momento em que o Master
     * trocou o par, e quem trocou. **Nulo = nada a revisar**, que é o estado normal de toda admissão.
     *
     * Por que um carimbo e não um booleano: o aviso vermelho do modal precisa dizer QUANDO aconteceu,
     * e o "Revisado" apenas limpa o carimbo. O que aconteceu não se perde, fica no histórico
     * (`candidato_alteracoes_log`), que é a trilha permanente; isto aqui é só o sinal de "ainda não
     * revisado".
     */
    trocaClienteEm: timestamp("troca_cliente_em", { withTimezone: true }),
    trocaClientePor: uuid("troca_cliente_por").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    // Instante em que o envelope foi ATIVADO na Clicksign (draft -> running). É a base do prazo: o
    // EA manda `deadline_at` = envio + 30 dias, e o tick usa este carimbo para marcar EXPIRADO quando
    // o envelope passa do prazo sem fechar nem ser cancelado. Nulo em quem nunca teve envelope (e nas
    // 1.486 admissões ASSINADO vindas da carga, §A.16 regra 1, que nunca passaram pela Clicksign).
    clicksignEnviadoEm: timestamp("clicksign_enviado_em", { withTimezone: true }),
    // KIT PRONTO PARA ASSINATURA (fila de disparo em lote). O consultor clica "Enviar para
    // assinatura" no Gerador de Kit e o kit daquele funcionário é materializado na staging DA
    // ADMISSÃO; aqui fica a REFERÊNCIA (caminho no disco efêmero) e o instante do envio.
    //
    // Por que não guardar o binário: regra 7 / §A.6, documento é efêmero e nunca vai ao banco. O
    // caminho da staging não contém PII (uuid + código de tipo), é o mesmo tipo de referência que o
    // job `criar-envelope` já carregava no payload.
    //
    // CONSEQUÊNCIA A CONHECER: a staging da admissão tem TTL de 48h (StagingPurgeService). Kit que
    // ficar na fila mais que isso é expurgado, e a linha aparece BLOQUEADA na fila pedindo novo
    // envio pelo Gerador de Kit. Os dois campos são zerados quando o envelope nasce.
    kitAssinaturaPath: text("kit_assinatura_path"),
    kitAssinaturaEm: timestamp("kit_assinatura_em", { withTimezone: true }),
    // Motivo do declínio (Fase 2). FK NULLABLE para o catálogo `motivos_declinio`; só faz sentido
    // quando o farol é de declínio. ON DELETE SET NULL: inativar/remover um motivo não apaga a admissão.
    motivoDeclinioId: uuid("motivo_declinio_id").references(() => motivosDeclinio.id, {
      onDelete: "set null",
    }),
    // Id da vaga do Pandapé DESNORMALIZADO na admissão (dedup, também vive em integracao_pandape).
    // Presente só nas admissões vindas do Pandapé; nulo nas manuais e nas históricas. É a chave da
    // trava anti-duplicata por (CPF + vaga viva) e do unique parcial abaixo.
    idVacancy: varchar("id_vacancy", { length: 80 }),
    // Marcador de POSSÍVEL DUPLICATA (dedup, caso ambíguo): a pré-admissão nasceu com sinais que não
    // permitem decidir com segurança se é a mesma pessoa/processo (ex.: já há admissão viva do CPF sem
    // idVacancy comparável). NÃO bloqueia — só sinaliza na tela de Liberação para o consultor decidir.
    possivelDuplicata: boolean("possivel_duplicata").notNull().default(false),
    // Recusa da liberação (Parte 2): quem recusou + quando (SEM motivo, decisão do diretor). Estado
    // atual da recusa, para a tela ler numa linha só; a trilha permanente vive no
    // candidato_alteracoes_log. Limpos ao reativar. Nulos fora do farol LIBERACAO_RECUSADA.
    recusadoPorId: uuid("recusado_por_id").references(() => usuarios.id),
    recusadoEm: timestamp("recusado_em", { withTimezone: true }),
    // OBSERVAÇÃO LIVRE DA LIBERAÇÃO (OST caixa alta + observações). Texto que o consultor deixa no
    // modal de liberação (individual ou em massa) para quem tocar a admissão adiante, quando a
    // informação não cabe em nenhum campo estruturado (caso real: "VT possui 6% de desconto").
    //
    // NÃO CONFUNDIR com `documentos_admissao.observacao`, que é o MOTIVO do veredito da auditoria por
    // documento. São campos de tabelas diferentes, com donos e ciclos de vida diferentes: aquele é
    // escrito pela IA/validação humana a cada veredito, este é escrito UMA vez, pelo consultor, no
    // ato da liberação. O nome desambigua na leitura (`observacaoLiberacao` vs `observacao`).
    //
    // OPCIONAL: não bloqueia a liberação e NÃO entra na régua de pendências obrigatórias (§A.19).
    // Teto de 500 caracteres, validado no DTO e no textarea; a coluna é `text` para não travar o
    // limite no schema caso o diretor queira mais espaço depois.
    //
    // §A.6: texto livre digitado pelo consultor PODE conter dado pessoal, então vale a mesma regra
    // do detalhe da esteira: exibido na leitura da ficha, NUNCA logado no servidor.
    observacaoLiberacao: text("observacao_liberacao"),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Defesa em profundidade contra CORRIDA (dois webhooks do mesmo par no mesmo instante): impede, no
    // banco, DUAS admissões VIVAS para o mesmo (candidato_cpf + id_vacancy). Parcial:
    //  - só quando id_vacancy IS NOT NULL → NUNCA bloqueia admissão manual do wizard (sem vaga);
    //  - só entre faróis VIVOS → uma admissão nova é permitida quando a anterior do par já é TERMINAL
    //    (§A.16, processo novo do zero) e não barra 2 admissões da mesma pessoa em vagas diferentes.
    uqCpfVagaViva: uniqueIndex("uq_admissao_cpf_vaga_viva")
      .on(t.candidatoCpf, t.idVacancy)
      .where(
        sql`${t.idVacancy} is not null and ${t.farolGlobal} in ('EM_ADMISSAO','BANCO_AGUARDAR','AGUARDANDO_LIBERACAO')`,
      ),
  }),
);

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
  // SETOR (OST Onda 2): campo PRÓPRIO, decisão do diretor de que são TRÊS coisas distintas que a
  // operação usa junto (Setor, Departamento e Centro de Custo), não sinônimos. É pendência
  // OBRIGATÓRIA e tem memória por (cliente + cargo). Nasce nullable porque as 2.188 admissões que já
  // existem não têm o dado; a cobrança vale para admissão VIVA, pela régua de pendências (§A.16
  // preserva o histórico).
  setor: varchar("setor", { length: 120 }),
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
  // ── UNIFORME (OST Onda 3, item 1) ─────────────────────────────────────────
  // NULL = ninguém respondeu, e é essa ausência que vira PENDÊNCIA OBRIGATÓRIA (chave UNIFORME).
  // `false` é resposta válida e fecha a pendência: cobra-se a RESPOSTA, não o uniforme. Nasce
  // nullable porque as 2.188 admissões existentes não têm o dado, e §A.16 preserva o histórico.
  possuiUniforme: boolean("possui_uniforme"),
  // Tamanhos: catálogo FECHADO validado por `@ea/shared-types` (nada digitável). Só fazem sentido
  // quando `possui_uniforme = true`; a limpeza ao responder "não" é do serviço, não do banco.
  uniformeCamiseta: varchar("uniforme_camiseta", { length: 4 }),
  uniformeCalca: varchar("uniforme_calca", { length: 4 }),
  uniformeBota: varchar("uniforme_bota", { length: 4 }),
  // ── EPI (OST Onda 3, item 1) ──────────────────────────────────────────────
  // NÃO é pendência obrigatória (decisão do diretor): não trava liberação nenhuma. Serve ao AVISO
  // do modal do olho, que diz ao consultor que aquela admissão tem EPI a validar.
  possuiEpi: boolean("possui_epi"),
  // Itens canônicos (CAPACETE, LUVA, OCULOS, OUTROS) separados por vírgula. Texto, e não tabela
  // própria, porque é um conjunto pequeno e fechado sem atributo por item; "OUTROS" é o único que
  // carrega dado extra, e ele tem coluna própria.
  epiItens: text("epi_itens"),
  epiOutros: varchar("epi_outros", { length: 200 }),
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
  // Nome da clínica em TEXTO. Mantido para não perder o histórico dos agendamentos que existem, e
  // porque a clínica inativada no catálogo continua legível aqui (OST Onda 2, item 4).
  nomeClinica: varchar("nome_clinica", { length: 200 }),
  // Clínica ESCOLHIDA no catálogo. `set null` na exclusão: o agendamento sobrevive à remoção da
  // clínica, com o nome em texto acima preservando o que foi escolhido na época.
  clinicaId: uuid("clinica_id").references(() => clinicasCatalogo.id, { onDelete: "set null" }),
  local: text("local"),
  /**
   * HISTÓRICO. Saiu do enum `fornecedor_exame` para texto (OST do fornecedor por clínica) e deixou de
   * ser escrito: o fornecedor agora é POR ENDEREÇO, derivado da clínica de cada um. A coluna fica com
   * o valor do agendamento de antes da migração.
   */
  fornecedor: varchar("fornecedor", { length: 60 }),
  // Valor do exame (o exame é tratado no agendamento — decisão do diretor). numeric(10,2); nulo até
  // o time preencher. Não é PII (logística/custo do exame).
  valor: numeric("valor", { precision: 10, scale: 2 }),
  // Previsão de quando o ASO fica pronto, informada pela clínica (só existe depois do agendamento).
  previsaoAso: date("previsao_aso"),
  reagendamentos: integer("reagendamentos").notNull().default(0),
  criadoEm,
  atualizadoEm,
});

// ── DocumentoAdmissão (estado por documento exigido — SÓ status) ────────────
/**
 * ENDEREÇOS DO AGENDAMENTO DO EXAME (OST Onda 2, multi-endereço).
 *
 * POR QUE UMA TABELA FILHA. O agendamento nasceu com UM endereço e UM horário na própria linha, e a
 * realidade tem candidato que faz o exame em três lugares no mesmo dia. Guardar o segundo e o
 * terceiro exigiria colunas repetidas (`local2`, `horario2`), que é o desenho que nunca acaba.
 *
 * O QUE É A FONTE DA VERDADE: esta tabela. As colunas `clinica_id`, `nome_clinica`, `local` e
 * `horario` do PAI continuam existindo, com o valor histórico do agendamento de antes da migração,
 * mas NÃO são mais escritas. Ler daqui é o contrato; o pai guarda o que é do agendamento inteiro
 * (data, fornecedor, valor, previsão do ASO).
 *
 * A DATA é ÚNICA e vive no PAI, de propósito (decisão do diretor): o dia é um só, o que varia é onde
 * e a que horas. A tela pré-preenche a mesma data nos demais endereços e deixa editável, mas o que
 * persiste é uma data por agendamento.
 *
 * §A.6: clínica, endereço e horário são logística do exame, não dado pessoal.
 */
export const exameAgendamentoEndereco = pgTable(
  "exame_agendamento_endereco",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agendamentoId: uuid("agendamento_id")
      .notNull()
      .references(() => exameAgendamento.id, { onDelete: "cascade" }),
    /** Ordem de exibição e de execução no dia (1 = primeiro endereço). */
    ordem: integer("ordem").notNull().default(1),
    /** Clínica ESCOLHIDA no catálogo. `set null` preserva o agendamento se a clínica for removida. */
    clinicaId: uuid("clinica_id").references(() => clinicasCatalogo.id, { onDelete: "set null" }),
    /** Nome da clínica no momento do agendamento: mantém legível mesmo se ela for inativada. */
    nomeClinica: varchar("nome_clinica", { length: 200 }),
    /** O endereço em si (texto), como o consultor recebeu da clínica. */
    local: text("local"),
    /** Horário PRÓPRIO deste endereço, "HH:MM". É o que a regra do atraso compara. */
    horario: varchar("horario", { length: 5 }),
    /**
     * Fornecedor DESTE endereço, copiado da clínica no momento do agendamento. Denormalizado pelo
     * mesmo motivo do `nome_clinica`: se a clínica mudar de fornecedor depois, o agendamento antigo
     * continua dizendo com quem foi feito.
     */
    fornecedor: varchar("fornecedor", { length: 60 }),
    criadoEm,
  },
  (t) => ({ uniqOrdem: unique("uq_agendamento_endereco_ordem").on(t.agendamentoId, t.ordem) }),
);

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
    // VALIDAÇÃO HUMANA (OST B1, Blocos 3 e 4). Era a marcação que FALTAVA: até aqui todo write neste
    // estado passava pela IA, e a trava "a carga não reverte veredito humano" estava escrita mas era
    // inócua, porque não havia como saber o que foi decidido por gente. Preenchido = um consultor
    // assumiu o documento como válido, e isso tem PRECEDÊNCIA sobre a IA:
    //  - a coleta automática e o LOTE PULAM o documento, sem exceção e sem confirmação possível;
    //  - a reauditoria manual só passa por cima com aceite explícito de quem clicou.
    // O nome do validador é EXIBIDO na tela junto do documento (não fica só na trilha).
    // ON DELETE SET NULL: desativar um usuário não apaga o fato de que houve validação humana.
    validadoPorId: uuid("validado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    validadoEm: timestamp("validado_em", { withTimezone: true }),
    atualizadoEm,
  },
  (t) => ({
    uniqDocPorAdmissao: unique().on(t.admissaoId, t.tipoDocumentoId),
  }),
);

// ── DocumentoArquivoColetado (marca de ARQUIVO já coletado — dedup por arquivo) ─────────────
// Pré-requisito do scheduler (OST dedup por arquivo): a dedup por (admissão + tipo) impede duplicar
// o TIPO, mas não sabe QUAIS arquivos já vieram — sem isto, cada ciclo re-baixaria e re-auditaria
// tudo. A marca é o **SHA-256 do CONTEÚDO** do arquivo (hex, 64 chars).
//
// §A.6 — o que esta tabela deliberadamente NÃO guarda: **nome de arquivo** (já foi visto CPF em nome
// de arquivo do Pandapé) e **URL do Pandapé** (pública e sem expiração). Um digest SHA-256 é
// irreversível e não identifica pessoa: é só a impressão digital do byte-a-byte, que responde "este
// arquivo exato eu já coletei?". `tamanhoBytes` é metadado técnico, não PII.
//
// A marca é POR (admissão + tipo + arquivo): o veredito é do conjunto de um tipo, e o mesmo arquivo
// pode servir a dois tipos (ver a chave única abaixo).
//
// Semântica: a marca só é gravada DEPOIS de a auditoria do conjunto concluir. Por isso "tem marca"
// equivale a "passou pelo fluxo ATUAL de coleta+auditoria", e a ausência de marca é o que faz o
// REPROCESSO da varredura re-auditar o que foi gravado pelo fluxo antigo. Falha na IA deixa o
// documento em AGUARDANDO_AUDITORIA e SEM marca, então o próximo ciclo tenta de novo.
export const documentoArquivosColetados = pgTable(
  "documento_arquivos_coletados",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    tipoDocumentoId: uuid("tipo_documento_id")
      .notNull()
      .references(() => tiposDocumento.id),
    /** SHA-256 do buffer, em hex minúsculo (64 chars). NUNCA nome de arquivo nem URL (§A.6). */
    hashConteudo: varchar("hash_conteudo", { length: 64 }).notNull(),
    tamanhoBytes: integer("tamanho_bytes").notNull(),
    criadoEm,
  },
  (t) => ({
    // Escopo da unicidade: (admissão + TIPO + arquivo). O tipo entra na chave porque o veredito é
    // POR TIPO (auditoria por conjunto) e o MESMO arquivo pode servir legitimamente a dois tipos —
    // o candidato manda um PDF único de RG+CPF nos dois formulários, e isso foi observado no acervo
    // real. Com a chave só em (admissão + arquivo), o segundo tipo ficava SEM marca nenhuma e voltava
    // a ser re-auditado em todo ciclo, matando a idempotência que esta tabela existe para dar.
    uqArquivoPorTipo: unique("uq_arquivo_coletado_admissao_tipo_hash").on(
      t.admissaoId,
      t.tipoDocumentoId,
      t.hashConteudo,
    ),
    idxAdmissaoTipo: index("idx_arquivo_coletado_admissao_tipo").on(t.admissaoId, t.tipoDocumentoId),
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

// ── PandapeSchedulerEstado (scheduler de re-consulta do Pandapé, OST scheduler) ──────────────
// Linha ÚNICA (PK fixa 'pandape') com o estado do scheduler que re-consulta as admissões vivas de
// origem Pandapé em cadência fixa (fecha o buraco: documento anexado APÓS a liberação não entra
// sozinho, porque o Pandapé só avisa mudança de etapa, nunca envio de documento).
//
// Guarda o LIGA/DESLIGA (Bloco 5, controlável sem deploy pela tela de diagnóstico), o heartbeat do
// "vivo" (`ultimo_ciclo_ok_em`, base do sinal SCHEDULER PARADO) e o resultado do último ciclo (Bloco
// 4: varridas/novos/falhas). §A.6: só contagens e instantes, jamais CPF/nome de arquivo/URL.
export const pandapeSchedulerEstado = pgTable("pandape_scheduler_estado", {
  // Singleton: uma linha só, chave fixa. Nunca cresce.
  chave: varchar("chave", { length: 20 }).primaryKey().default("pandape"),
  // LIGA/DESLIGA (Bloco 5). Lido a cada ciclo, então o toggle vale sem restart/deploy.
  ligado: boolean("ligado").notNull().default(true),
  // Início do último ciclo (rodou, independente de sucesso).
  ultimoCicloEm: timestamp("ultimo_ciclo_em", { withTimezone: true }),
  // Heartbeat: último ciclo BEM-SUCEDIDO. Base do sinal "scheduler parado" (só quando ligado).
  ultimoCicloOkEm: timestamp("ultimo_ciclo_ok_em", { withTimezone: true }),
  // Resultado do último ciclo (Bloco 4).
  ultimoCicloVarridas: integer("ultimo_ciclo_varridas").notNull().default(0),
  ultimoCicloNovos: integer("ultimo_ciclo_novos").notNull().default(0),
  ultimoCicloFalhas: integer("ultimo_ciclo_falhas").notNull().default(0),
  // Ciclo interrompido pelo teto de segurança de IA (Bloco 3).
  ultimoCicloAbortado: boolean("ultimo_ciclo_abortado").notNull().default(false),
  // Nota curta e sem PII do último ciclo (ex.: "inerte", "teto de IA atingido").
  ultimoCicloNota: text("ultimo_ciclo_nota"),
  atualizadoEm,
});

// ── VtColeta: ledger da coleta automática de formulário de VT (§A.17 etapa 3 / INT-2) ────────
// LEDGER da varredura da pasta coletiva do Drive onde um app externo (Firebase) deposita os PDFs de
// Vale-Transporte. Cada arquivo é casado com uma admissão viva pelo CPF do nome do arquivo, arquivado
// na subpasta BENEFICIOS do prontuário e (quando o VT está na régua) dá baixa no FORMULARIO_VT.
//
// §A.6 (MINIMIZAÇÃO): NÃO guarda nome, CPF nem o NOME DO OBJETO no bucket (que contém NOME+CPF do
// candidato). Só o `md5` do arquivo (dedup + idempotência: um arquivo já CASADO nunca é reprocessado),
// a `origem` da fonte (ex.: "GCS") e o vínculo com a admissão. A chave de idempotência é o par
// (md5, origem): assim uma fonte futura (Drive) nunca colide com a fonte GCS no mesmo digest.
export const vtColeta = pgTable(
  "vt_coleta",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Digest hex do arquivo. Parte da chave de idempotência da varredura (par com `origem`).
    md5: text("md5").notNull(),
    // Fonte do arquivo (ex.: "GCS"). Compõe a chave única com o md5 para isolar fontes distintas.
    origem: text("origem").notNull(),
    // Admissão casada. ON DELETE SET NULL: apagar a admissão não apaga o registro da coleta.
    admissaoId: uuid("admissao_id").references(() => admissoes.id, { onDelete: "set null" }),
    // Estado do casamento. Texto (não enum novo) para manter esta frente isolada no schema; os valores
    // vivem em `domain/scheduler-vt-coleta` (CASADO | SEM_ADMISSAO | MULTIPLO | NOME_FORA_PADRAO |
    // NAO_PDF | ERRO).
    status: text("status").notNull(),
    // O FORMULARIO_VT estava na régua da admissão casada? (true = deu baixa; false = só arquivou;
    // null = não casou). Registro do porquê a baixa aconteceu ou não.
    vtNaRegua: boolean("vt_na_regua"),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uqMd5Origem: unique("uq_vt_coleta_md5_origem").on(t.md5, t.origem),
  }),
);

// ── VtColetaSchedulerEstado (scheduler da coleta de VT) ──────────────────────────────────────
// Espelha `pandape_scheduler_estado`: linha ÚNICA (PK fixa 'vt-coleta') com o liga/desliga, o
// heartbeat do "vivo" (`ultimo_ciclo_ok_em`) e o resultado do último ciclo. §A.6: só contagens e
// instantes, jamais CPF/nome de arquivo/URL.
export const vtColetaSchedulerEstado = pgTable("vt_coleta_scheduler_estado", {
  chave: varchar("chave", { length: 20 }).primaryKey().default("vt-coleta"),
  ligado: boolean("ligado").notNull().default(true),
  ultimoCicloEm: timestamp("ultimo_ciclo_em", { withTimezone: true }),
  ultimoCicloOkEm: timestamp("ultimo_ciclo_ok_em", { withTimezone: true }),
  ultimoCicloVarridas: integer("ultimo_ciclo_varridas").notNull().default(0),
  ultimoCicloNovos: integer("ultimo_ciclo_novos").notNull().default(0),
  // Arquivos varridos que não casaram (sem admissão viva, múltiplo ou nome fora do padrão).
  ultimoCicloSemAdmissao: integer("ultimo_ciclo_sem_admissao").notNull().default(0),
  ultimoCicloFalhas: integer("ultimo_ciclo_falhas").notNull().default(0),
  ultimoCicloAbortado: boolean("ultimo_ciclo_abortado").notNull().default(false),
  ultimoCicloNota: text("ultimo_ciclo_nota"),
  atualizadoEm,
});

// ── AssinanteEmpresa: quem assina o contrato PELA EMPRESA (INT-4) ────────────────────────────
// Um contrato de trabalho tem DOIS assinantes: o funcionário (individual, vem do candidato) e a
// EMPRESA (institucional). Mesmo modelo da pasta-pai do Drive: um PADRÃO e EXCEÇÕES por cliente.
//
//  - `cod_cliente` NULL  → é o PADRÃO, vale para todo cliente que não tenha exceção própria.
//  - `cod_cliente` preenchido → exceção daquele cliente, tem precedência sobre o padrão.
//
// §A.6: `cpf` é PII e é persistido POR NECESSIDADE (a Clicksign exige documentação do signatário
// para a assinatura ter valor jurídico), no mesmo regime do CPF do candidato: chave técnica, nunca
// em log. `email` idem, é o canal de autenticação do requirement.
export const assinanteEmpresa = pgTable(
  "assinante_empresa",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // NULL = padrão. ON DELETE CASCADE: apagar o cliente apaga a exceção dele (nunca sobra órfã).
    codCliente: varchar("cod_cliente", { length: 40 }).references(() => clientes.codCliente, {
      onDelete: "cascade",
    }),
    nome: varchar("nome", { length: 200 }).notNull(),
    email: varchar("email", { length: 180 }).notNull(),
    // 11 dígitos crus, como `candidatos.cpf`. Formatado só na hora de falar com a Clicksign.
    // OBRIGATÓRIO por decisão do diretor: a API da Clicksign aceita signatário sem documentação,
    // mas assinatura com CPF é mais forte juridicamente, então a régua daqui é mais dura que a dela.
    cpf: varchar("cpf", { length: 11 }).notNull(),
    // ORDEM de assinatura dentro do escopo. Vira o `group` do signatário na Clicksign (grupo =
    // ordem + 1, porque o grupo 1 é sempre o funcionário).
    //
    // MESMA ORDEM = ASSINAM EM PARALELO; ordens diferentes = sequência, o seguinte só assina (e só é
    // notificado) depois que o anterior assinou. Repetir ordem é LEGÍTIMO, então não há unique sobre
    // ela.
    ordem: integer("ordem").notNull().default(1),
    ativo: boolean("ativo").notNull().default(true),
    /**
     * VÍNCULO (item 7): TERCEIRO nível de escopo, acima do cliente. Precedência final:
     * vínculo (cliente + contrato) > cliente > padrão. Quem assina pelo contrato Temporário pode
     * não ser quem assina pelo Terceirizado do MESMO cliente, e antes disso não havia como dizer.
     */
    clienteVinculoId: uuid("cliente_vinculo_id").references(() => clienteVinculos.id, {
      onDelete: "cascade",
    }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // A TRAVA que resta, agora que o escopo aceita N representantes: a MESMA PESSOA não entra duas
    // vezes no mesmo escopo. Dois índices parciais porque, no Postgres, NULLs não colidem entre si e
    // é o NULL que marca o padrão.
    uqCpfCliente: uniqueIndex("uq_assinante_empresa_cpf_cliente")
      .on(t.codCliente, t.cpf)
      .where(sql`${t.codCliente} is not null and ${t.clienteVinculoId} is null`),
    uqCpfVinculo: uniqueIndex("uq_assinante_empresa_cpf_vinculo")
      .on(t.clienteVinculoId, t.cpf)
      .where(sql`${t.clienteVinculoId} is not null`),
    uqCpfPadrao: uniqueIndex("uq_assinante_empresa_cpf_padrao")
      .on(t.cpf)
      .where(sql`${t.codCliente} is null`),
    // Espelha a régua da própria API ("group deve ser maior que 0", conferido na sondagem).
    ckOrdem: check("ck_assinante_empresa_ordem", sql`${t.ordem} >= 1`),
  }),
);

// ── ClicksignSchedulerEstado (scheduler do tick da assinatura, INT-4) ────────────────────────
// Espelha `pandape_scheduler_estado` e `vt_coleta_scheduler_estado`: linha ÚNICA (PK fixa
// 'clicksign') com o liga/desliga, o heartbeat do "vivo" (`ultimo_ciclo_ok_em`) e o resultado do
// último ciclo.
//
// POR QUE ESTA TABELA EXISTE: o tick da Clicksign dependia de um CRON externo
// (`infra/install-clicksign-cron.sh`) que NUNCA foi instalado, então em 28 dias o tick rodou 3 vezes,
// todas manuais. Trazer o agendamento para dentro do Nest (mesmo padrão dos outros dois) elimina a
// dependência de infra e dá ao diretor o freio sem deploy. §A.6: só contagens e instantes, jamais
// CPF nem URL de documento.
export const clicksignSchedulerEstado = pgTable("clicksign_scheduler_estado", {
  chave: varchar("chave", { length: 20 }).primaryKey().default("clicksign"),
  ligado: boolean("ligado").notNull().default(true),
  ultimoCicloEm: timestamp("ultimo_ciclo_em", { withTimezone: true }),
  ultimoCicloOkEm: timestamp("ultimo_ciclo_ok_em", { withTimezone: true }),
  // Envelopes consultados no último ciclo.
  ultimoCicloVarridas: integer("ultimo_ciclo_varridas").notNull().default(0),
  // Envelopes que FECHARAM neste ciclo (assinado baixado e arquivado no Drive).
  ultimoCicloAssinados: integer("ultimo_ciclo_assinados").notNull().default(0),
  // Envelopes marcados EXPIRADO neste ciclo (passaram do prazo sem fechar).
  ultimoCicloExpirados: integer("ultimo_ciclo_expirados").notNull().default(0),
  ultimoCicloFalhas: integer("ultimo_ciclo_falhas").notNull().default(0),
  ultimoCicloNota: text("ultimo_ciclo_nota"),
  atualizadoEm,
});

/**
 * Estado do SCHEDULER DO EXAME (OST Onda 2), no mesmo molde dos outros três (Pandapé, VT, Clicksign).
 * Uma linha só (`chave`), para a tela de Diagnóstico mostrar se o verificador está vivo e o que ele
 * fez no último ciclo. §A.6: só contagens, nenhum id de pessoa.
 */
export const exameSchedulerEstado = pgTable("exame_scheduler_estado", {
  chave: varchar("chave", { length: 20 }).primaryKey().default("exame"),
  ligado: boolean("ligado").notNull().default(true),
  ultimoCicloEm: timestamp("ultimo_ciclo_em", { withTimezone: true }),
  ultimoCicloOkEm: timestamp("ultimo_ciclo_ok_em", { withTimezone: true }),
  /** Frentes de EXAME avaliadas no último ciclo. */
  ultimoCicloVarridas: integer("ultimo_ciclo_varridas").notNull().default(0),
  /** Passaram a AGUARDANDO_ASO neste ciclo (previsão do ASO depois da data do exame). */
  ultimoCicloAguardando: integer("ultimo_ciclo_aguardando").notNull().default(0),
  /** Passaram a ASO_PENDENTE neste ciclo (exame já passou e nada anexado). */
  ultimoCicloPendentes: integer("ultimo_ciclo_pendentes").notNull().default(0),
  ultimoCicloFalhas: integer("ultimo_ciclo_falhas").notNull().default(0),
  ultimoCicloNota: text("ultimo_ciclo_nota"),
  atualizadoEm,
});

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
    // CHAVE DO CAMINHO 2 (OST Onda 3, item 7): UM vínculo por (cliente + tipo de contrato). É o que
    // torna a resolução determinística: a admissão sabe o tipo, e o tipo aponta para exatamente um
    // vínculo. Sem esta unique, dois vínculos do mesmo tipo tornariam a escolha ambígua e o sistema
    // pegaria "o primeiro", que é como se escolhe a régua errada sem ninguém perceber.
    uqTipo: unique("uq_cliente_vinculo_tipo").on(t.codCliente, t.tipoServico),
    idxCliente: index("idx_cliente_vinculos_cliente").on(t.codCliente),
  }),
);

// ── Formulário de VT (self-service do candidato, §A.17 etapa 2) ─────────────
// O candidato preenche o próprio vale-transporte pelo celular. UM formulário por admissão
// (unique em `admissao_id`): reenvio sobrescreve o anterior, o kit compõe um documento só.
//
// §A.6: o endereço residencial é PII, gravado por necessidade real (o documento oficial de VT
// exige o endereço do beneficiário) e por minimização não guardamos nada além do necessário.
// A identificação (CPF + data de nascimento) é CREDENCIAL de acesso: nunca é logada e não é
// duplicada aqui: o vínculo é pela admissão, e o CPF já vive em `candidatos`.
export const formulariosVt = pgTable("formularios_vt", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  // OPTANTE preenche itinerários; NÃO-OPTANTE gera o documento de recusa (nenhuma condução).
  optante: boolean("optante").notNull(),
  cep: varchar("cep", { length: 8 }).notNull(),
  logradouro: varchar("logradouro", { length: 200 }).notNull(),
  numero: varchar("numero", { length: 20 }).notNull(),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 120 }).notNull(),
  cidade: varchar("cidade", { length: 120 }).notNull(),
  uf: varchar("uf", { length: 2 }).notNull(),
  // Totais do dia gravados como SNAPSHOT do envio: a tarifa pode ser reajustada depois, mas o
  // documento assinado tem de continuar batendo com o que o candidato declarou.
  totalIda: numeric("total_ida", { precision: 10, scale: 2 }).notNull().default("0"),
  totalVolta: numeric("total_volta", { precision: 10, scale: 2 }).notNull().default("0"),
  totalDia: numeric("total_dia", { precision: 10, scale: 2 }).notNull().default("0"),
  // Aceite dos 3 avisos ("Estou ciente das informações passadas"): trilha de responsabilização,
  // no mesmo espírito do aceite de dupla correção (§A.6).
  cienteEm: timestamp("ciente_em", { withTimezone: true }).notNull(),
  criadoEm,
  atualizadoEm,
});

// Uma linha por condução declarada (ex.: ônibus + metrô na ida = 2 linhas com sentido IDA).
// `valor` é SNAPSHOT: a tarifa vem sugerida de `tarifas_transporte`, mas o candidato pode ajustar,
// e é o valor declarado que vai ao documento assinado.
export const formularioVtConducoes = pgTable(
  "formulario_vt_conducoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formularioId: uuid("formulario_id")
      .notNull()
      .references(() => formulariosVt.id, { onDelete: "cascade" }),
    sentido: sentidoVtEnum("sentido").notNull(),
    ordem: integer("ordem").notNull(),
    cidade: varchar("cidade", { length: 120 }).notNull(),
    tipoTransporte: varchar("tipo_transporte", { length: 120 }).notNull(),
    cartao: cartaoVtEnum("cartao").notNull(),
    // Só preenchido quando `cartao` = OUTRO (o candidato nomeia o cartão).
    cartaoOutro: varchar("cartao_outro", { length: 60 }),
    valor: numeric("valor", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => ({
    idxFormulario: index("idx_conducao_formulario").on(t.formularioId),
  }),
);

// ── DrivePastaPai: pasta-pai do Drive por (escopo + chave), fora do .env (INT-2) ─────────────
// Tira o roteamento da pasta-pai do arquivamento do .env e do fallback em código, colocando-o numa
// TABELA administrável pela tela (Master/Super Admin). Duas dimensões, no mesmo espírito de
// `drive-routing`:
//  - escopo CONTRATO: `chave` é o tipo de contrato NORMALIZADO (ex.: "temporario", "jovem aprendiz").
//  - escopo FOPAG: `chave` é o `cod_cliente` (o contrato Fopag resolve a pasta por cliente).
// `folderId` é o id da pasta do Drive: identificador, não segredo nem PII (§A.6), pode persistir.
// `rotulo` é texto amigável para a tela (ex.: "Fopag cliente 16", "Contrato Temporario"), sem
// travessão (§A.11). A resolução em runtime lê daqui primeiro; o fallback em código segue como rede
// de segurança durante a transição. Soft-delete por `ativo`.
export const drivePastaPai = pgTable(
  "drive_pasta_pai",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    escopo: varchar("escopo", { length: 20 }).notNull(), // CONTRATO | FOPAG
    chave: varchar("chave", { length: 60 }).notNull(),
    folderId: varchar("folder_id", { length: 120 }).notNull(),
    rotulo: varchar("rotulo", { length: 120 }).notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Chave de negócio: uma pasta-pai por (escopo + chave). O upsert do service converge por ela.
    uqEscopoChave: unique("uq_drive_pasta_pai_escopo_chave").on(t.escopo, t.chave),
  }),
);

// ── AdmissaoBeneficio: pacote de benefícios ESTRUTURADO (§A.17 etapa 4) ─────
// Uma linha por benefício alocado à admissão. Substitui, para admissões NOVAS, a string achatada
// de `dados_vaga_folha.beneficios` (ex.: "VR (Vale-Refeição): 500,00, VT (Vale-Transporte)").
//
// A string legada NÃO é migrada e NÃO é apagada (decisão do diretor): os 2.066 blobs importados
// continuam em `dados_vaga_folha.beneficios`, consultáveis como hoje. Ou seja, por um tempo as duas
// representações convivem: admissão nova lê daqui, admissão antiga lê da string.
//
// `valor` é NULLABLE de propósito: nem todo benefício tem valor (ex.: "Seguro de vida" é só
// concedido/não concedido, enquanto VR e VA têm valor). Sem PII (§A.6): só vínculo e valor.
export const admissaoBeneficio = pgTable(
  "admissao_beneficio",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    // RESTRICT, não CASCADE: apagar um benefício do catálogo não pode evaporar silenciosamente o
    // que já foi alocado a uma pessoa. O catálogo é soft-delete (`ativo`) e não tem rota de DELETE,
    // então na prática isto nunca bloqueia nada: é rede de proteção do histórico.
    beneficioId: uuid("beneficio_id")
      .notNull()
      .references(() => beneficiosCatalogo.id, { onDelete: "restrict" }),
    valor: numeric("valor", { precision: 12, scale: 2 }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Um registro por benefício alocado: o mesmo benefício não entra duas vezes na mesma admissão.
    uqAdmissaoBeneficio: unique("uq_admissao_beneficio").on(t.admissaoId, t.beneficioId),
    // A leitura natural é "os benefícios desta admissão" (ficha, tela de Benefícios, memória
    // cliente+cargo da Parte C).
    idxAdmissao: index("idx_admissao_beneficio_admissao").on(t.admissaoId),
  }),
);

/**
 * AGENDAMENTO DA INTEGRAÇÃO (última etapa da esteira, decisão do diretor).
 *
 * Espelha o `exame_agendamento`: uma linha por admissão, criada quando o consultor agenda. O
 * CONSULTOR responsável é escolhido numa lista de COMUM e MASTER (super admin fora), e por isso é
 * uma referência a `usuarios`, e não o autor automático da última mudança de status.
 *
 * `set null` no consultor: o agendamento sobrevive à desativação do usuário, sem apagar a data.
 * §A.6: sem PII, só data, horário, modalidade e o id de quem conduz.
 */
export const integracaoAgendamento = pgTable("integracao_agendamento", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  data: date("data"),
  horario: varchar("horario", { length: 5 }), // "HH:MM"
  tipo: tipoIntegracaoEnum("tipo"),
  /**
   * Link da reunião, quando a integração é ONLINE (Meet, Teams, Zoom). OPCIONAL por decisão do
   * diretor: o agendamento salva sem ele, e a sala pode ser criada depois. Presencial não usa.
   */
  link: text("link"),
  consultorId: uuid("consultor_id").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ── SALA DE ESPERA (pré-processo, ANTES da Liberação Admissional) ───────────

/**
 * CATÁLOGO DE STATUS DA SALA DE ESPERA, editável pelo Gerencial (molde de `motivos_declinio`).
 *
 * `encerra` é o campo que sustenta a regra da fila: status marcado como terminal TIRA o registro da
 * lista ativa. Ele existe porque a lista é EDITÁVEL: o sistema não pode deduzir pelo nome que
 * "Declinou" encerra e "Aguardando retorno" não, e um status novo criado pelo diretor precisa dizer
 * de que lado está. Sem esta marca, criar status viraria criar bug.
 */
export const salaEsperaStatus = pgTable("sala_espera_status", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  /** Terminal: some da fila ativa (Declinou, Desistiu e o que o diretor marcar). */
  encerra: boolean("encerra").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  criadoEm,
  atualizadoEm,
});

/**
 * SALA DE ESPERA: o candidato que o cliente ou a Seleção anunciou, ANTES de ele se candidatar no
 * Pandapé. É PRÉ-PROCESSO, não admissão.
 *
 * NÃO TEM CPF, e é por isso que esta tabela existe separada de `admissoes`: lá o `candidato_cpf` é
 * NOT NULL e referencia `candidatos`, cuja chave primária é o próprio CPF. Um registro sem CPF não
 * cabe naquele modelo, e forçá-lo exigiria identidade provisória, que é remédio para histórico
 * importado, não para uma frente nova.
 *
 * Como consequência, a Sala é INVISÍVEL para tudo que já existe: Esteira, Gerenciador, KPIs e
 * diagnóstico leem `admissoes` e não precisam saber que ela existe.
 *
 * `admissaoId` nasce NULL e só é preenchido no MATCH MANUAL da Liberação (onda 3): quando o operador
 * associa o pré-cadastro à admissão que chegou do Pandapé, o ponteiro é gravado e o registro sai da
 * fila. `set null` na exclusão para o histórico da Sala sobreviver.
 */
export const salaEspera = pgTable("sala_espera", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  codCliente: varchar("cod_cliente", { length: 40 })
    .notNull()
    .references(() => clientes.codCliente),
  cargoId: uuid("cargo_id")
    .notNull()
    .references(() => cargos.id),
  telefone: varchar("telefone", { length: 30 }),
  /**
   * CPF, nascimento e e-mail: TODOS OPCIONAIS (decisão do diretor). O candidato ainda não se
   * candidatou, então quase nunca se sabe o CPF na hora do registro; quando se sabe, ele torna o
   * MATCH da onda 3 confiável, porque casa por identidade em vez de nome.
   *
   * O CPF fica em coluna PRÓPRIA e NÃO cria linha em `candidatos`: aqui ele é um dado de apoio ao
   * match, não a chave de identidade de um candidato do sistema. Guardado sem máscara, como no resto
   * do sistema, e nunca vai para log (§A.6).
   */
  cpf: varchar("cpf", { length: 11 }),
  dataNascimento: date("data_nascimento"),
  email: varchar("email", { length: 180 }),
  /** Quando o pedido chegou por e-mail. É a data do NEGÓCIO aqui, não a de cadastro no sistema. */
  dataRecebimento: date("data_recebimento").notNull(),
  origem: origemSalaEsperaEnum("origem").notNull(),
  statusId: uuid("status_id")
    .notNull()
    .references(() => salaEsperaStatus.id),
  /** Preenchido no match manual da Liberação (onda 3). NULL enquanto o registro está em aberto. */
  admissaoId: uuid("admissao_id").references(() => admissoes.id, { onDelete: "set null" }),
  vinculadoEm: timestamp("vinculado_em", { withTimezone: true }),
  criadoPorId: uuid("criado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
  criadoEm,
  atualizadoEm,
});

// ── ALTO VOLUME (projetos sazonais de tiro curto) ───────────────────────────
//
// O CASO REAL: um cliente abre uma operação de 30 dias com muitas vagas por cargo (Companhia das
// Letras, Atendente 20, Caixa 15), em grupos que entram em datas diferentes. A esteira sabe conduzir
// cada admissão, mas ninguém consegue responder "quantas das 20 de Atendente já fecharam, e dá tempo
// até a data de entrada do grupo 2?". Estas quatro tabelas são a estrutura dessa pergunta.
//
// O QUE ELAS **NÃO** FAZEM, e é deliberado: nenhuma coluna nova em `admissoes`, nenhum ALTER em
// tabela existente. A ligação mora numa tabela de vínculo própria (`admissao_projeto`), então a
// Esteira, o Gerenciador e o Controle Gerencial seguem lendo exatamente o que liam. O Alto Volume é
// CONSULTA PARALELA por construção (§A.26): quem quiser o recorte de projeto faz o join; quem não
// quiser nem sabe que ele existe.

/**
 * PROJETO de alto volume: um cliente, um período, um nome.
 *
 * `data_inicio` e `data_fim` são OBRIGATÓRIAS de propósito, e essa é a única obrigatoriedade dura
 * daqui. Elas não são enfeite de cadastro: o termômetro de dias restantes e a SUGESTÃO de projeto na
 * liberação (cliente + data de admissão dentro do período) são calculados a partir delas. Projeto
 * sem período seria um projeto que não sabe quando acaba, e o Alto Volume existe justamente porque
 * a data acaba.
 *
 * INATIVAR é exclusão lógica (`ativo=false`), mesmo padrão de todo catálogo do sistema: o projeto
 * encerrado sai das opções da liberação e continua consultável com o histórico inteiro de vínculos.
 */
export const projetosAltoVolume = pgTable(
  "projetos_alto_volume",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: varchar("cod_cliente", { length: 40 })
      .notNull()
      .references(() => clientes.codCliente),
    nome: varchar("nome", { length: 160 }).notNull(),
    dataInicio: date("data_inicio").notNull(),
    dataFim: date("data_fim").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    criadoPorId: uuid("criado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // O MESMO cliente pode ter VÁRIOS projetos ao mesmo tempo (requisito do diretor), então o unique
    // é do par, nunca do cliente: o que não pode é o mesmo cliente ter dois projetos de mesmo nome,
    // porque aí o seletor da liberação mostraria duas linhas idênticas.
    uqProjetoPorCliente: unique("uq_projeto_alto_volume_cliente_nome").on(t.codCliente, t.nome),
    // Período invertido é erro de digitação, e o banco recusa. Sem isto, "termina antes de começar"
    // produziria termômetro negativo e sugestão que nunca casa, sem ninguém entender por quê.
    ckPeriodo: check("ck_projeto_alto_volume_periodo", sql`${t.dataFim} >= ${t.dataInicio}`),
  }),
);

/**
 * GRUPO DE ENTRADA: as várias datas em que as pessoas de um mesmo projeto começam.
 *
 * Um projeto de 30 dias raramente admite todo mundo no mesmo dia; ele entra em levas ("Grupo 1" em
 * 15/09, "Grupo 2" em 22/09). O grupo é a unidade do ALERTA: passada a data de entrada, quantas
 * daquela leva não concluíram o processo a tempo.
 *
 * Projeto SEM nenhum grupo é válido e é o estado inicial de todo projeto recém-criado: as vagas
 * ficam na cota do projeto inteiro (ver `projeto_vaga_cargo.grupo_id`) e o alerta por grupo
 * simplesmente não tem o que mostrar. Grupos entram depois, conforme o projeto anda.
 */
export const projetoGrupoEntrada = pgTable(
  "projeto_grupo_entrada",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projetosAltoVolume.id, { onDelete: "cascade" }),
    /** Rótulo humano da leva: "Grupo 1", "Turma De 15/09". É o que aparece no alerta e no seletor. */
    rotulo: varchar("rotulo", { length: 80 }).notNull(),
    dataEntrada: date("data_entrada").notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Duas levas no MESMO dia do MESMO projeto são a mesma leva escrita duas vezes: o alerta
    // dobraria e as vagas por grupo se dividiriam entre duas linhas que ninguém sabe distinguir.
    uqGrupoPorData: unique("uq_projeto_grupo_entrada_data").on(t.projetoId, t.dataEntrada),
  }),
);

/**
 * VAGAS POR CARGO: a meta contra a qual o preenchimento é medido (Atendente 20, Caixa 15).
 *
 * `grupo_id` NULO é a COTA DO PROJETO INTEIRO; preenchido é a cota daquele grupo de entrada. Os dois
 * modos convivem na mesma tabela de propósito, porque é assim que o projeto anda na vida real: nasce
 * com "20 Atendentes" e só depois se descobre que são 12 no grupo 1 e 8 no grupo 2. Fosse tabela
 * separada, acrescentar grupo a um projeto já cadastrado exigiria migrar linha de um lugar para o
 * outro. É o mesmo desenho que `regua_documental` usa em `cliente_vinculo_id` (nulo = vale para o
 * cliente todo).
 *
 * O unique cobre os dois modos porque o Postgres trata NULL como distinto em UNIQUE: por isso são
 * DOIS índices parciais, e não um só. Sem o parcial de `grupo_id IS NULL`, o mesmo cargo poderia ser
 * cadastrado duas vezes na cota do projeto e a meta dobraria em silêncio.
 */
export const projetoVagaCargo = pgTable(
  "projeto_vaga_cargo",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projetosAltoVolume.id, { onDelete: "cascade" }),
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id),
    grupoId: uuid("grupo_id").references(() => projetoGrupoEntrada.id, { onDelete: "cascade" }),
    quantidade: integer("quantidade").notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    uqVagaDoProjeto: uniqueIndex("uq_projeto_vaga_cargo_projeto")
      .on(t.projetoId, t.cargoId)
      .where(sql`${t.grupoId} is null`),
    uqVagaDoGrupo: uniqueIndex("uq_projeto_vaga_cargo_grupo")
      .on(t.projetoId, t.cargoId, t.grupoId)
      .where(sql`${t.grupoId} is not null`),
    // Vaga zero ou negativa não é meta, é linha que deveria ter sido apagada. Barrado no banco
    // porque a meta alimenta divisão (o percentual do cilindro) e zero ali vira NaN na tela.
    ckQuantidade: check("ck_projeto_vaga_cargo_quantidade", sql`${t.quantidade} > 0`),
  }),
);

/**
 * O VÍNCULO admissão -> projeto. É ele, e só ele, que decide quem conta no projeto.
 *
 * A REGRA DO DIRETOR, gravada como chave: cliente + data de admissão + período apenas SUGEREM o
 * projeto ao consultor; quem CONTA é o flag marcado com o projeto escolhido, que é exatamente a
 * existência desta linha. Sem isso, o projeto pegaria toda admissão do mesmo cliente no mesmo
 * período, inclusive as que nada têm a ver com ele.
 *
 * `admissao_id` é UNIQUE: uma admissão pertence a UM projeto só (decisão do diretor). O unique é a
 * regra, não uma otimização, e é por isso que ela mora no banco e não na aplicação.
 *
 * `grupo_id` é opcional porque o grupo é um refinamento: dá para vincular ao projeto sem dizer a
 * leva, e a admissão conta no preenchimento total mesmo assim. Só o alerta por data de entrada
 * precisa do grupo.
 *
 * §A.6: a tabela referencia admissão, projeto e usuário por id. Nenhum CPF, nenhum nome, nenhuma URL.
 */
export const admissaoProjeto = pgTable(
  "admissao_projeto",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .unique()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    projetoId: uuid("projeto_id")
      .notNull()
      .references(() => projetosAltoVolume.id, { onDelete: "cascade" }),
    grupoId: uuid("grupo_id").references(() => projetoGrupoEntrada.id, { onDelete: "set null" }),
    /** LIBERACAO (o flag, caminho normal) ou CORRECAO (conserto posterior). Ver o enum. */
    origem: origemVinculoProjetoEnum("origem").notNull(),
    vinculadoPorId: uuid("vinculado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    vinculadoEm: timestamp("vinculado_em", { withTimezone: true }).defaultNow().notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // O painel do projeto varre por projeto o tempo todo (preenchimento, comparativo, alerta), e sem
    // este índice cada carga seria um seq scan na tabela de vínculos inteira.
    idxPorProjeto: index("idx_admissao_projeto_projeto").on(t.projetoId),
  }),
);
