import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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
import { ACEITES_REGISTRAVEIS, SITUACOES_ENCERRADAS_SEM_EXITO } from "../../domain/candidatura";
import type { VagaIdiomaGravado } from "../../domain/vaga-idioma";
import {
  areaEnum,
  asCandidatoOrigemEnum,
  asContatoTipoEnum,
  candidaturaSituacaoEnum,
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
  papelAsEnum,
  vagaEscolaridadeEnum,
  vagaGeneroEnum,
  vagaModeloTrabalhoEnum,
  vagaTipoSubstituicaoEnum,
  vagaNaturezaEnum,
  vagaSazonalidadeEnum,
  vagaVinculoEnum,
  ncLiberacaoEnum,
  ncStatusEnum,
  ncTipoEnum,
  origemEnum,
  papelEnum,
  sentidoVtEnum,
  sexoEnum,
  sinalizadorEnum,
  tipoMarcacaoEnum,
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
  /**
   * PAPEL DE A&S (frente 1 da OST de 22/08): CONSULTOR ou RECRUITER, fixo por pessoa.
   *
   * COLUNA NOVA E NULÁVEL, e nada mais muda nesta tabela. Não entra no JWT, não entra em guard
   * nenhum e não tem relação com o `papel` do RBAC logo acima: quem administra o sistema continua
   * sendo decidido lá. Aqui é só o lado da vaga que a pessoa ocupa, e NULL é o estado normal de
   * quem não trabalha em A&S, que é a maioria de quem está em produção hoje.
   */
  papelAs: papelAsEnum("papel_as"),
  criadoEm,
  atualizadoEm,
});

/**
 * ÁREA DO USUÁRIO (segmentação do módulo de A&S). Um usuário pode ter MAIS DE UMA área.
 *
 * LISTA E NÃO COLUNA ÚNICA em `usuarios`, e isso é requisito do diretor, não zelo: hoje cada Master
 * é cadastrado com UMA área só, mas o modelo precisa suportar o HÍBRIDO (a pessoa que atende as duas
 * frentes) sem migração de dado depois. Coluna única exigiria refazer a tabela, os guards e a tela
 * no dia em que o primeiro híbrido aparecesse.
 *
 * ESPELHA `usuario_menus` DE PROPÓSITO: mesma forma (par usuário + valor, chave composta), mesma
 * forma de ler e de salvar. Quem já entende a permissão de menu entende esta tabela sem aprender
 * conceito novo.
 *
 * AUSÊNCIA DE LINHA É FAIL-CLOSED (decisão do diretor): usuário sem nenhuma área enxerga apenas o
 * Início. O oposto (sem área = vê tudo) seria fail-open, e o primeiro Master de A&S cadastrado sem
 * área veria o módulo de Admissão inteiro EM SILÊNCIO. Erro invisível é pior que erro visível, e a
 * §A.23 já fixou o princípio ("menu que não aparece não é bug, é o diretor não ter liberado").
 *
 * O SUPER_ADMIN NÃO DEPENDE DESTA TABELA: está acima da segmentação, como no bypass de menu. É o que
 * garante que nenhum erro de área seja irrecuperável, porque o diretor sempre entra e conserta.
 *
 * §A.6: id de usuário e um rótulo de área. Nenhuma PII.
 */
export const usuarioAreas = pgTable(
  "usuario_areas",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    area: areaEnum("area").notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.usuarioId, t.area] }),
  }),
);

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
  /**
   * ÁREAS que enxergam este menu. A TABELA É A FONTE DA VERDADE da autorização por área; o registro
   * em código (`domain/menus.ts`) diz apenas com que áreas o menu NASCE.
   *
   * POR QUE A FONTE MUDOU DE LUGAR: enquanto a área morava só em código, marcar um menu para as duas
   * áreas exigia a fábrica e uma subida de versão. O diretor precisa marcar sozinho (o caso real é o
   * dashboard de Alto Volume, que interessa aos dois times), e a tela dele escreve aqui.
   *
   * A REGRA QUE PROTEGE ISSO, e ela vive no convergedor do boot (`MenusCatalogoService`): esta coluna
   * é gravada SÓ NO INSERT e fica FORA do `set` do conflito, exatamente como o `codigo`. Rótulo,
   * rota, grupo e ordem são APRESENTAÇÃO e seguem convergindo do código a cada boot; ÁREA é
   * AUTORIZAÇÃO e nunca é sobrescrita, senão a próxima subida apagaria as marcações do diretor em
   * silêncio, que é a pior falha possível num controle de acesso.
   *
   * NOT NULL com backfill do carimbo de código na própria migration: no dia um a tabela repete
   * exatamente o que o código dizia, então a troca de fonte é uma identidade e ninguém perde acesso.
   *
   * Vetor de texto e não de enum por limitação do drizzle-kit com arrays de enum; os valores são
   * validados na escrita (`MenuAreasService`) e o conteúdo é sempre `ADM` e/ou `AS`.
   */
  areas: text("areas").array().notNull(),
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
  /**
   * TIPO DE MARCAÇÃO DE PONTO no iFractal (frente iFractal). Atributo do CLIENTE, herdado por toda
   * admissão dele: é o contrato com o cliente que define como aquele time bate ponto, não a pessoa.
   *
   * NOT NULL COM DEFAULT `APLICATIVO`, e não nullable como os demais campos de padrão do cliente.
   * A diferença é decisão do diretor: aqui não existe "cliente sem resposta", porque todo cliente
   * marca ponto de alguma forma. O aplicativo é o caso majoritário, então todos nascem nele e o time
   * ajusta a minoria. O default também poupa o backfill dos 228 clientes existentes.
   */
  tipoMarcacao: tipoMarcacaoEnum("tipo_marcacao").notNull().default("APLICATIVO"),
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
  banco: varchar("banco", { length: 120 }),
  // AGÊNCIA e CONTA digitadas pelo candidato, do MESMO formulário do Pandapé (melhorias EAC, item 8).
  //
  // MUDANÇA DELIBERADA DE POSTURA, e vale registrar porque o comentário anterior dizia o contrário.
  // Antes o extrator lia só o nome do banco e descartava estes dois "por construção", com o argumento
  // de que reter dado sensível sem uso não se justifica. O USO agora existe: a regra de auditoria
  // "Os dados bancários devem coincidir com os informados no cadastro" está cadastrada desde sempre e
  // era LETRA MORTA, porque a IA recebia só nome e CPF e não tinha contra o que comparar. Sem estas
  // duas colunas não há como terminar a regra, e o consultor continua abrindo o Pandapé para conferir
  // à mão o que já chegou no payload.
  //
  // TEXTO LIVRE, exatamente como o candidato digitou, e o rótulo do campo no Pandapé diz "(se
  // houver)": os dois são OPCIONAIS lá. Vazio é caso NORMAL (numa amostra de 5 candidatos, 3 tinham o
  // formulário bancário inteiro em branco), nunca divergência.
  //
  // §A.6: dado sensível, com minimização a valer. Nunca entra em log, em motivo de auditoria, em
  // export ou em qualquer superfície coletiva; só é exibido na ficha da própria admissão, para quem
  // já tem acesso a ela.
  agencia: varchar("agencia", { length: 20 }),
  conta: varchar("conta", { length: 30 }),
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
 * LOJAS E UNIDADES DE UM CLIENTE (cenário 1 do desenho `docs/DESENHO-LOJAS-UNIDADES.md`).
 *
 * O CASO REAL: existe cliente que é UM CNPJ e UM código, com VÁRIAS LOJAS. O sistema não deixa
 * cadastrar o mesmo cliente duas vezes (código e CNPJ são únicos, §A.3), então a operação passou a
 * escrever o nome de cada loja no campo CENTRO DE CUSTO. Seis clientes fizeram isso, somando 170
 * nomes distintos em texto livre, dos quais 11 são a mesma loja escrita de outro jeito.
 *
 * A LOJA NÃO TEM CNPJ, e é isso que a separa do cenário 2 (onde cada loja já é um cliente próprio).
 * Ela COMPARTILHA o CNPJ da mãe, e por isso não toca contrato, faturamento nem assinatura: o
 * pipeline da Clicksign resolve o assinante por `cod_cliente` e nunca por CNPJ (verificado).
 * Ela é NOME mais ENDEREÇO, para ANÁLISE, e não é dado contábil.
 *
 * POR QUE TABELA PRÓPRIA e não uma coluna em `dados_vaga_folha`: a loja é atributo do CLIENTE,
 * reutilizado por N admissões e N vagas, mantido como catálogo. Repetir o nome por admissão seria
 * recriar exatamente o texto livre que esta frente veio eliminar.
 *
 * INATIVAR É EXCLUSÃO LÓGICA, como nos demais catálogos: loja fechada sai das opções de escolha sem
 * apagar o histórico de quem foi admitido nela.
 *
 * §A.6: nome de loja e endereço de estabelecimento. Nenhum dado pessoal.
 */
/**
 * GRUPO DE CLIENTES (cenário 2, o caso Raia/CAGC). `docs/DESENHO-CENARIO-2-GRUPO.md`.
 *
 * O INVERSO do `cliente_lojas`. Lá a loja vive DENTRO de um cliente; aqui cada loja JÁ É um cliente
 * com CNPJ próprio, e o que falta é a camada por cima: um nome que diga que aqueles 53 códigos são o
 * mesmo CAGC Corifeu. A Raia tem 98 códigos na mesma razão social, e achar a farmácia certa hoje é
 * procurar entre 98 linhas iguais.
 *
 * O GRUPO É EIXO DE LEITURA, nunca meta nem projeto (decisão do diretor). Ele serve para filtrar,
 * agrupar e analisar: escolher "CAGC Corifeu" no painel e ver as 164 admissões sem se importar de
 * quantos CNPJs elas vieram.
 */
export const gruposCliente = pgTable(
  "grupos_cliente",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nome: varchar("nome", { length: 200 }).notNull(),
    /** Livre, para o time explicar o recorte administrativo que o grupo representa. */
    descricao: text("descricao"),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    /**
     * A MESMA NORMALIZAÇÃO do nome das lojas, e reusar aqui não é economia: é o que impede o grupo de
     * nascer com o defeito que ele veio consertar. Hoje o CAGC vive no apelido do cliente em NOVE
     * grafias, e `CAGC CORIFEU` convive com `CAGC CORIFEU ` (espaço à direita) como se fossem dois.
     * Caixa e espaço, sem remover acento, porque a extensão `unaccent` não está instalada.
     */
    uqNome: uniqueIndex("uq_grupo_cliente_nome").on(
      sql`upper(btrim(regexp_replace(${t.nome}, '\s+', ' ', 'g')))`,
    ),
  }),
);

/**
 * QUEM PERTENCE A QUAL GRUPO.
 *
 * A CHAVE PRIMÁRIA É O `cod_cliente` SOZINHO, e não o par `(grupo_id, cod_cliente)`. É isto que
 * transforma "uma loja em UM grupo só" (decisão do diretor) em regra do BANCO em vez de disciplina de
 * código: com o par como chave, nada impediria o mesmo CNPJ de existir em dois grupos, e a soma por
 * grupo passaria a contar a mesma farmácia duas vezes sem ninguém perceber. É o mesmo desenho do
 * unique de `admissao_projeto`, que garante uma admissão em um projeto só.
 *
 * Trocar de grupo é, por consequência, um UPSERT nessa chave: sai de um, entra no outro, e duplicar
 * não é um estado que o banco aceite representar.
 *
 * A CHAVE É O `cod_cliente` E NÃO O CNPJ, e isso foi medido: um CNPJ da Raia
 * (`61.585.865/0453-33`) está cadastrado em DOIS códigos de cliente diferentes.
 */
export const grupoClienteMembros = pgTable("grupo_cliente_membros", {
  codCliente: varchar("cod_cliente", { length: 40 })
    .primaryKey()
    .references(() => clientes.codCliente, { onDelete: "cascade" }),
  grupoId: uuid("grupo_id")
    .notNull()
    .references(() => gruposCliente.id, { onDelete: "cascade" }),
  criadoEm,
});

export const clienteLojas = pgTable(
  "cliente_lojas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    codCliente: varchar("cod_cliente", { length: 40 })
      .notNull()
      .references(() => clientes.codCliente, { onDelete: "cascade" }),
    nome: varchar("nome", { length: 200 }).notNull(),
    /**
     * Metade da definição de loja (nome mais endereço), mas NULLABLE: o endereço não existe em lugar
     * nenhum hoje e a migração do legado nasce só com os nomes. A tela cobra; a importação permite
     * vazio, para o time completar depois sem travar a carga.
     */
    endereco: text("endereco"),
    /** O código que o cliente usa internamente, quando existe. Serve de chave alternativa na importação. */
    codigoExterno: varchar("codigo_externo", { length: 60 }),
    ativo: boolean("ativo").notNull().default(true),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    /**
     * UNIQUE SOBRE O NOME NORMALIZADO, e não sobre o nome cru, porque o cru deixaria "Loja Centro" e
     * "LOJA CENTRO " conviverem como duas lojas. É exatamente a duplicata que o texto livre produziu
     * no centro de custo (435 valores que viram 424 só normalizando caixa e espaço), e o catálogo não
     * pode nascer com o mesmo defeito.
     *
     * A MESMA EXPRESSÃO é usada pelas duas importações para casar nome, então o que o banco considera
     * duplicado e o que a importação considera o mesmo nome são, por construção, a mesma coisa.
     *
     * CAIXA E ESPAÇO, SEM ACENTO REMOVIDO, e isso é escolha medida: as duplicatas reais do centro de
     * custo são de caixa e de espaço à direita, e tirar acento exigiria a extensão `unaccent`, que
     * NÃO está instalada no banco. Instalar extensão é mudança de escopo que ninguém pediu (§A.14) e
     * o ganho seria marginal. "Loja Sé" e "Loja Se" ficam como duas lojas, e a prévia da importação
     * mostra as duas para o time decidir.
     */
    uqNomePorCliente: uniqueIndex("uq_cliente_loja_nome").on(
      t.codCliente,
      sql`upper(btrim(regexp_replace(${t.nome}, '\\s+', ' ', 'g')))`,
    ),
    idxCliente: index("idx_cliente_lojas_cliente").on(t.codCliente),
  }),
);

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
    /**
     * LOJA / UNIDADE do cliente onde a pessoa trabalha (cenário 1, etapa 3). NULLABLE e
     * `ON DELETE SET NULL`, e as duas coisas são desenho:
     *
     * NULLABLE porque a maioria dos clientes NÃO tem lojas, e para eles a admissão fica no nome do
     * cliente, como sempre foi. Cobrar loja de quem não tem loja é o oposto do que a régua faz.
     *
     * `SET NULL` e não `CASCADE`: apagar uma loja não pode levar a admissão junto. Na prática o
     * catálogo INATIVA em vez de apagar, então este caminho é a última rede.
     *
     * MORA AQUI, e não em `dados_vaga_folha`: a loja é propriedade da ADMISSÃO, lida por Esteira,
     * Gerenciador, Alto Volume e liberação, telas que hoje não tocam a folha. Em `dados_vaga_folha`
     * ela custaria um join a mais em cada uma delas.
     *
     * INVARIANTE QUE O BANCO NÃO EXPRESSA: a loja tem de ser do MESMO cliente da admissão. Não há
     * como declarar isso numa chave estrangeira simples (seria preciso uma composta com
     * `cod_cliente`, que aqui é nulável), então quem garante é o serviço, num ponto só
     * (`validarLojaDoCliente`), atravessado por TODOS os caminhos de escrita.
     */
    lojaId: uuid("loja_id").references(() => clienteLojas.id, { onDelete: "set null" }),
    /**
     * O GRUPO DA ÉPOCA (cenário 2). CARIMBO, não derivação, e a diferença é o ponto inteiro da
     * decisão do diretor: derivar pelo cliente mostraria sempre o grupo de HOJE, então no dia em que
     * uma farmácia sai do CAGC Corifeu e vai para o Centro Oeste, as 122 admissões que aconteceram
     * sob Corifeu migrariam junto, em silêncio, e o relatório do trimestre passado passaria a dar
     * outro número. O carimbo congela o que aconteceu.
     *
     * CARIMBA O ID, e não o nome: renomear o grupo é a mesma entidade mudando de nome, e vale para
     * trás (decisão do diretor). `restrict` porque histórico não pode ficar sem nome; grupo não se
     * apaga, se inativa.
     *
     * NULÁVEL, e a ausência NÃO é pendência: a esmagadora maioria dos clientes não pertence a grupo
     * nenhum, e tratar isso como falta encheria a fila com milhares de casos que não são trabalho.
     */
    grupoClienteId: uuid("grupo_cliente_id").references(() => gruposCliente.id, {
      onDelete: "restrict",
    }),
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
    /**
     * DIVERGÊNCIA BANCÁRIA apontada pela IA (melhorias EAC, item 8): quais campos do cadastro não
     * conferiram com o comprovante. CSV de RÓTULOS ("agencia", "agencia,conta"), nulo quando não há.
     *
     * RÓTULO E NUNCA VALOR (§A.6). Guardar aqui o número do comprovante ou o número digitado seria
     * duplicar dado sensível para dizer uma coisa que o rótulo já diz. Quem precisa comparar os dois
     * lados abre a ficha, que mostra o digitado, e o comprovante, que está no Drive.
     *
     * NÃO É ESTADO DE DOCUMENTO e não entra em régua, farol, KPI nem fila. É aviso ao consultor: o
     * documento segue o veredito das regras e a régua fecha normalmente (§A.3 regra 5, o sinalizador
     * marca e nunca impede). Reescrito a cada auditoria do comprovante: some sozinho quando o dado é
     * corrigido e o documento reauditado.
     */
    divergenciaBancaria: text("divergencia_bancaria"),
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
    /**
     * Instante em que a SOLICITAÇÃO DE ASSINATURA saiu (passo 5 da v3, `POST .../notifications`).
     *
     * É DIFERENTE de `clicksignEnviadoEm`, e a distinção é justamente o bug que originou a coluna:
     * ativar o envelope não chama ninguém. Um contrato pode estar ATIVO (enviadoEm preenchido) e o
     * funcionário nunca ter sido notificado (este campo nulo), que foi o estado de 106 contratos em
     * 24/08/2026. Com os dois carimbos, "ativo e não notificado" vira uma consulta em vez de uma
     * leitura de log.
     *
     * NULO NÃO É ERRO por si só: é nulo em quem nunca teve envelope, nas admissões da carga (§A.16
     * regra 1, que nunca passaram pela Clicksign) e em quem foi notificado ANTES desta coluna
     * existir. O que se cobra é a interseção com `AGUARDANDO_ASSINATURA` + envelope presente.
     */
    clicksignNotificadoEm: timestamp("clicksign_notificado_em", { withTimezone: true }),
    /**
     * PANORAMA DE ASSINATURA (quem assinou, quem falta), alimentado pelo tick e LIDO pela tela.
     *
     * Antes a tela montava isso consultando a Clicksign ao vivo, 2 requisições por linha, 220 por
     * abertura. Guardar o painel troca "perguntar de novo o que já se sabia" por uma leitura de
     * banco, e o painel completo, que é o que o diretor usa, continua inteiro.
     *
     * §A.6: guarda SÓ o `AssinanteStatus` do domínio (nome, assinou, quando, ordem). O `/events` da
     * Clicksign devolve e-mail, CPF, IP e geolocalização, e nada disso é persistido.
     *
     * É CACHE: nulo é "ainda não varrido", não "sem assinantes", e o próximo ciclo do tick
     * reconstrói tudo. Por isso a tela mostra o instante da atualização em vez de fingir tempo real.
     */
    clicksignAssinantes: jsonb("clicksign_assinantes"),
    clicksignAssinantesEm: timestamp("clicksign_assinantes_em", { withTimezone: true }),
    /**
     * `modified` do envelope como a Clicksign devolve. Detector de mudança: igual ao do ciclo
     * anterior significa que ninguém assinou nada, e o `/events` pode ser poupado. Texto, para
     * comparar exatamente o que veio.
     */
    clicksignEnvelopeModified: varchar("clicksign_envelope_modified", { length: 40 }),
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
    // Link do ARQUIVO no Drive, gravado no arquivamento. É o que faz a tela de Benefícios abrir o
    // formulário direto, em vez de mandar alguém procurar no Drive (o diretor não achou a pasta).
    // §A.6 permite persistir referência do Drive, como já se faz com `contrato_assinado_drive_url`;
    // o que nunca entra em banco é URL externa de terceiro (Pandapé, download do Clicksign).
    // Nulo é estado real: arquivamento antigo, ou arquivo que já estava no destino e não subiu agora.
    driveUrl: text("drive_url"),
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    // SINAL DISPENSADO: o diretor viu o órfão e decidiu não tratar agora. O alerta some e NÃO volta.
    //
    // DISPENSAR NÃO É TRATAR, e a diferença importa: o arquivo continua no bucket, o formulário
    // continua sem dono, e o registro continua aqui. O que muda é só a visibilidade do alerta. Sem
    // esta marca o sinal reapareceria a cada ciclo e o diretor não teria como limpar a tela do que
    // ele já decidiu não fazer, que é o que transforma um painel de alerta em ruído ignorado.
    sinalDispensadoEm: timestamp("sinal_dispensado_em", { withTimezone: true }),
    sinalDispensadoPorId: uuid("sinal_dispensado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
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
// contrato, o consultor aceita explicitamente que corrigiu no SOUOperações E diretamente no G.I
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
// O candidato preenche o próprio vale-transporte pelo celular.
//
// VÁRIOS FORMULÁRIOS POR ADMISSÃO, um por ENVIO. Antes era um só (unique em `admissao_id`) e o
// reenvio SOBRESCREVIA o anterior. A vida real desmentiu a premissa: o funcionário muda de
// endereço, muda de linha, a passagem sobe, e cada uma dessas é uma DECLARAÇÃO NOVA dele, não uma
// correção da anterior. Apagar a antiga apagava a prova do que ele havia declarado quando assinou.
//
// O VIGENTE É O MAIS RECENTE (`criado_em` desc), e os anteriores ficam consultáveis, cada um com o
// seu PDF no Drive (`vt_coleta.drive_url`, que já era uma linha por arquivo). Quem lê "o formulário
// da pessoa" tem de pedir o mais recente EXPLICITAMENTE: sem `order by`, o Postgres devolve
// qualquer um, e o bug apareceria como um valor antigo ressurgindo sem explicação.
//
// §A.6: o endereço residencial é PII, gravado por necessidade real (o documento oficial de VT
// exige o endereço do beneficiário) e por minimização não guardamos nada além do necessário.
// A identificação (CPF + data de nascimento) é CREDENCIAL de acesso: nunca é logada e não é
// duplicada aqui: o vínculo é pela admissão, e o CPF já vive em `candidatos`.
export const formulariosVt = pgTable(
  "formularios_vt",
  {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
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
  // PDF DESTA VERSÃO no Drive. Cada envio gera o seu arquivo, e o histórico precisa abrir o
  // documento CERTO de cada linha, não o mais recente de todos.
  //
  // POR QUE A URL MORA AQUI e não é deduzida de `vt_coleta`: as duas tabelas só se relacionam por
  // admissão e horário, e casar versão com arquivo por proximidade de timestamp funcionaria até o
  // dia em que dois envios caíssem no mesmo ciclo. Guardar o link na própria versão torna a ligação
  // um fato, não uma inferência.
  //
  // NULO É ESTADO REAL: o formulário interno (`/vt`) gera o PDF sob demanda e não arquiva nada, e
  // todas as versões anteriores a esta coluna nasceram sem link.
  driveUrl: text("drive_url"),
  criadoEm,
  atualizadoEm,
  },
  (t) => ({
    // Busca do VIGENTE e do histórico da pessoa: sempre por admissão, sempre do mais novo para o
    // mais velho. Sem este índice, cada abertura da tela de Benefícios varreria a tabela inteira
    // por linha listada.
    idxAdmissaoRecente: index("idx_formularios_vt_admissao_recente").on(t.admissaoId, t.criadoEm),
  }),
);

// ── Solicitação de novo VT (o time pede, o funcionário responde) ────────────
// O time dispara um link para o funcionário preencher (ou refazer) o VT, e ESTA TABELA É O RASTRO
// de quem pediu. Sem ela não há como responder "quem mandou este link?", porque o gerador de link
// não gravava nada: o controller recebia o usuário e o descartava.
//
// POR QUE UMA TABELA E NÃO UMA COLUNA NA ADMISSÃO: a mesma pessoa é solicitada mais de uma vez ao
// longo do tempo (mudou de endereço em março, mudou de linha em agosto), e uma coluna guardaria só
// a última, apagando justamente a sequência que explica por que existem N versões do formulário.
//
// RESPONDIDA é derivada de um FATO, não de um clique: aponta para a VERSÃO do formulário que chegou
// depois do pedido. Um booleano "respondida" dependeria de alguém lembrar de marcar, e a primeira
// vez que ninguém marcasse a fila mentiria para sempre.
//
// §A.6: nada de CPF, nome ou o token do link aqui. O vínculo é pela admissão, e o link não é
// persistido nem logado (ele é credencial de acesso do candidato).
export const solicitacoesVt = pgTable(
  "solicitacoes_vt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    admissaoId: uuid("admissao_id")
      .notNull()
      .references(() => admissoes.id, { onDelete: "cascade" }),
    // Quem pediu. ON DELETE SET NULL: desligar o usuário não apaga o rastro do pedido dele.
    solicitadoPorId: uuid("solicitado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    solicitadoEm: timestamp("solicitado_em", { withTimezone: true }).notNull().defaultNow(),
    // Validade do link gerado, copiada do token. Serve para a tela dizer "expirou, peça de novo"
    // sem precisar abrir o token (que não é guardado).
    expiraEm: timestamp("expira_em", { withTimezone: true }),
    // A VERSÃO do formulário que respondeu a este pedido. Nulo = ainda não respondida.
    respondidaPorFormularioId: uuid("respondida_por_formulario_id").references(
      () => formulariosVt.id,
      { onDelete: "set null" },
    ),
    respondidaEm: timestamp("respondida_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // "Os pedidos desta pessoa, do mais novo para o mais velho", que é como a tela pergunta.
    idxAdmissao: index("idx_solicitacoes_vt_admissao").on(t.admissaoId, t.solicitadoEm),
  }),
);

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

/**
 * CREDENCIAL DO IFRACTAL POR ADMISSÃO (frente iFractal).
 *
 * TABELA PRÓPRIA, espelhando `exame_agendamento` e `integracao_agendamento`, e deliberadamente NÃO
 * colunas em `frentes_admissao`: aquela tabela é genérica e é lida por toda consulta de contagem do
 * sistema. Dado específico de uma frente mora na tabela da frente.
 *
 * §A.6, E A DECISÃO ESTÁ REGISTRADA. A `senha` fica em TEXTO, legível, por decisão consciente do
 * diretor: ela é DESCARTÁVEL, o iFractal a envia ao funcionário e força a troca no primeiro acesso,
 * então não é credencial durável e não há o que proteger a longo prazo. Hash não serviria (o time
 * precisa LER para repassar) e criptografia reversível traria chave, custódia e rotação para guardar
 * um dado que expira no primeiro login.
 *
 * O QUE CONTINUA VALENDO, mesmo assim, e não é negociável: a senha **NUNCA** entra em log, em
 * mensagem de erro ou em trilha de alteração. Ela aparece na tela de quem já tem acesso à admissão e
 * na coluna da extração, que nasce desmarcada.
 *
 * `tipo_marcacao` NÃO é copiado para cá: é HERDADO do cliente por leitura (`clientes.tipo_marcacao`).
 * Copiar criaria duas verdades, e mudar o tipo no cliente deixaria as admissões antigas mentindo.
 */
export const admissaoIfractal = pgTable("admissao_ifractal", {
  id: uuid("id").defaultRandom().primaryKey(),
  admissaoId: uuid("admissao_id")
    .notNull()
    .unique()
    .references(() => admissoes.id, { onDelete: "cascade" }),
  login: varchar("login", { length: 120 }),
  senha: varchar("senha", { length: 120 }),
  criadoEm,
  atualizadoEm,
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
    /**
     * META POR LOJA (docs/DESENHO-META-POR-LOJA.md). É o MESMO movimento do `grupo_id` acima, num
     * eixo diferente: nulo = a meta vale para o cargo no projeto inteiro; preenchido = é a cota
     * daquela loja.
     *
     * `CASCADE` e não `SET NULL`, ao contrário de `admissoes.loja_id`: uma linha de meta que perde a
     * loja não vira "meta geral", vira número somando no lugar errado. Apagar a loja apaga a cota
     * dela, e a meta do cargo (que é a soma) se ajusta sozinha.
     *
     * A INVARIANTE QUE O BANCO NÃO EXPRESSA (decisão 1 do diretor): para um mesmo cargo, ou existe a
     * linha geral OU existem linhas por loja, NUNCA as duas. Sem isso a meta do cargo somaria a linha
     * geral com as cotas e ficaria inflada, e o percentual de todos os quadros mentiria junto. É
     * `exigirDetalhamentoUnico` quem garante, num ponto só, com teste.
     */
    lojaId: uuid("loja_id").references(() => clienteLojas.id, { onDelete: "cascade" }),
    quantidade: integer("quantidade").notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Os QUATRO níveis possíveis, cada um com o seu unique parcial. Os dois primeiros já existiam; os
    // dois de loja seguem exatamente o mesmo molde.
    uqVagaDoProjeto: uniqueIndex("uq_projeto_vaga_cargo_projeto")
      .on(t.projetoId, t.cargoId)
      .where(sql`${t.grupoId} is null and ${t.lojaId} is null`),
    uqVagaDoGrupo: uniqueIndex("uq_projeto_vaga_cargo_grupo")
      .on(t.projetoId, t.cargoId, t.grupoId)
      .where(sql`${t.grupoId} is not null and ${t.lojaId} is null`),
    uqVagaDaLoja: uniqueIndex("uq_projeto_vaga_cargo_loja")
      .on(t.projetoId, t.cargoId, t.lojaId)
      .where(sql`${t.grupoId} is null and ${t.lojaId} is not null`),
    uqVagaDoGrupoLoja: uniqueIndex("uq_projeto_vaga_cargo_grupo_loja")
      .on(t.projetoId, t.cargoId, t.grupoId, t.lojaId)
      .where(sql`${t.grupoId} is not null and ${t.lojaId} is not null`),
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

// ── A&S / MOTIVO DE CANCELAMENTO DE VAGA (onda B1) ──────────────────────────
/**
 * POR QUE A VAGA FOI CANCELADA: catálogo mantido pelo diretor, molde `motivos_declinio`.
 *
 * MOLDE `motivos_declinio`, E NÃO O MOLDE DAS ETAPAS DO FUNIL. Motivo não tem ordem, não tem cor,
 * não tem "inicial" e não precisa resolver rótulo de histórico. O molde das etapas custaria um
 * service inteiro de catálogo ordenável para servir uma lista de nomes.
 *
 * É O NOME QUE FICA GRAVADO NA VAGA, e não o id, exatamente como a vaga já faz com
 * `motivos_contratacao`. Por isso não há FK e não há `restrict`: inativar um motivo em março não
 * trava a vaga cancelada em janeiro, e ela continua dizendo por que foi cancelada mesmo com o motivo
 * fora de circulação. Uma FK responderia "este motivo existe hoje"; o nome responde "foi este o
 * motivo naquele dia", que é a pergunta que a trilha existe para responder.
 *
 * SOFT-DELETE POR `ativo`, NUNCA exclusão física, pelo mesmo motivo dos demais catálogos: o motivo
 * sai das opções selecionáveis e o histórico segue legível.
 *
 * NASCE VAZIA (§A.31): lista de valor é do diretor, e semear "Cliente desistiu" seria a fábrica
 * decidindo por ele.
 */
export const motivosCancelamentoVaga = pgTable("motivos_cancelamento_vaga", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: varchar("nome", { length: 160 }).notNull().unique(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

/**
 * ─ O CATÁLOGO DE STATUS DA VAGA (onda B2, migration 0102) ───────────────────────────────────────
 *
 * DECLARADO ANTES DE `vagas` DE PROPÓSITO: é a coluna `vagas.status` que aponta para cá, e manter a
 * ordem de declaração evita depender da resolução preguiçosa da referência.
 *
 * `papel` É O QUE SEPARA A LINHA DO SISTEMA DA LINHA DO DIRETOR. Os cinco papéis de sistema
 * (RASCUNHO, ABERTURA, ENTREGA, FECHAMENTO, CANCELAMENTO) existem exatamente uma vez cada (índice
 * parcial único no banco) e são os alvos que o código procura quando precisa gravar status: o
 * fechamento pergunta pelo papel ENTREGA ou FECHAMENTO, o cancelamento pelo CANCELAMENTO, a trilha
 * de abertura pelo RASCUNHO ou ABERTURA. `LIVRE` é o que o diretor cria, e dele pode haver zero ou
 * muitos.
 *
 * OS CINCO CHECKS VIVEM NA MIGRATION 0102 e estão explicados lá, um a um. Os que mais importam de
 * saber lendo daqui: linha de papel NUNCA é inativável (`papel = 'LIVRE' OR ativo`), status que
 * ENCERRA nunca recebe candidato nem é destino de movimento manual, e status LIVRE nunca encerra.
 *
 * §A.6: código, rótulo, ordem, cor, papel e quatro booleanos. Nenhum dado pessoal.
 */
export const asVagaStatus = pgTable("as_vaga_status", {
  id: serial("id").primaryKey(),
  /** A identidade IMUTÁVEL: é ela que fica gravada na vaga e em cada evento da trilha. */
  codigo: varchar("codigo", { length: 40 }).notNull().unique(),
  rotulo: varchar("rotulo", { length: 120 }).notNull(),
  ordem: integer("ordem").notNull(),
  /** Da paleta FECHADA do design system (`ETAPA_TONS`). CHECK no banco, na migration. */
  tom: varchar("tom", { length: 4 }).notNull().default("nt"),
  ativo: boolean("ativo").notNull().default(true),
  /** `LIVRE` é a linha do diretor; os outros cinco são os alvos que o sistema procura. */
  papel: varchar("papel", { length: 20 }).notNull().default("LIVRE"),
  /** O processo desta vaga ACABOU? Congela contagem e para o contador de dias. */
  encerra: boolean("encerra").notNull().default(false),
  /** Ainda entra gente nova nesta vaga? */
  recebeCandidato: boolean("recebe_candidato").notNull().default(true),
  /** A trilha de abertura pode GRAVAR este status? Permissão, nunca proibição. */
  daTrilha: boolean("da_trilha").notNull().default(false),
  /** O diretor pode mover uma vaga PARA este status pela tela? */
  movivelManualmente: boolean("movivel_manualmente").notNull().default(false),
  criadoEm,
  atualizadoEm,
});

// ── A&S / CENTRAL DE VAGAS (onda 1) ─────────────────────────────────────────
/**
 * VAGA: a abertura, e a LINHA é a identidade (decisão do diretor, 21/08).
 *
 * A DECISÃO QUE GOVERNA ESTA TABELA: o EA gera `id` PRÓPRIO por vaga, e o `codigo` é ATRIBUTO DE
 * ORIGEM, pesquisável e REPETÍVEL, nunca chave. Na base real, o mesmo código aparece em várias
 * linhas (o campeão tem 356), e cada linha é uma ABERTURA daquela vaga recorrente. Fundir por código
 * apagaria o histórico de aberturas; por isso não há unique em `codigo`, e não deve haver.
 *
 * A AMARRAÇÃO É CÓDIGO -> CARGO, e vive na aplicação, não no banco: um código corresponde a UM único
 * cargo, então N linhas com o mesmo código e o mesmo cargo é CORRETO, e o mesmo código apontando para
 * cargos diferentes é preenchimento furado. A trava vale DO CADASTRO NOVO PARA FRENTE (a tela impede
 * criar/editar vaga com código já usado por outro cargo) e NÃO retroage na importação, que entra com
 * o cargo que veio e marca a linha para revisão. Um unique no banco impediria exatamente isso.
 *
 * ISOLAMENTO (mantido da Fatia 1): nenhuma FK para `admissoes`, nenhuma coluna nova em `admissoes`.
 * O módulo de A&S nasce paralelo, e é essa disciplina que deixou o Alto Volume nascer sem quebrar
 * Esteira, Gerenciador e Controle Gerencial.
 *
 * §A.6: vaga não tem dado pessoal. `aberto_por_id` é usuário interno do EA, não candidato.
 */
export const vagas = pgTable(
  "vagas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Código de ORIGEM da vaga (o número do Pandapé, ou a família `SL...`). REPETÍVEL de propósito.
     * Digitado à mão na vaga nova: o gerador automático foi descartado pelo diretor.
     *
     * NULÁVEL DESDE O RASCUNHO (OST de 25/08). A vaga salva pela metade pode ainda não ter número, e
     * gravar string vazia no lugar seria inventar um código que ninguém digitou: o mesmo motivo pelo
     * qual os textos opcionais desta tabela guardam NULL em vez de "". A régua dos obrigatórios
     * (`vagaPendencias`, no shared-types) é quem garante que a vaga PUBLICADA sempre tem um.
     */
    codigo: varchar("codigo", { length: 40 }),
    /**
     * Cargo do catálogo. O seletor SUGERE e não bloqueia (a lista inteira é alcançável).
     *
     * NULÁVEL DESDE O RASCUNHO (OST de 25/08), como o código e pelo mesmo motivo. Obrigatório ele
     * continua sendo: a régua (`vagaPendencias`) não deixa PUBLICAR sem cargo. O que mudou foi o
     * momento da cobrança, não a régua.
     */
    cargoId: uuid("cargo_id").references(() => cargos.id),
    /** O título como a vaga é divulgada, distinto do cargo técnico do catálogo. Nulável no rascunho. */
    nomeDivulgacao: varchar("nome_divulgacao", { length: 200 }),
    /**
     * NULÁVEL, e isso é decisão de desenho, não descuido: na base real só 31 de 164 clientes casaram
     * com o cadastro do EA (o CNPJ vem 100% vazio e a base usa nome comercial contra razão social).
     * Vaga sem cliente resolvido ENTRA, marcada para vínculo manual, em vez de travar a importação
     * ou de inventar um `cod_cliente`.
     */
    codCliente: varchar("cod_cliente", { length: 40 }).references(() => clientes.codCliente),
    /**
     * O `IdVacancy` DA VAGA NO PANDAPÉ (ponte puxada da onda 4, Central de Candidatos).
     *
     * ESTA COLUNA SÓ GUARDA. Não existe varredura, não existe chamada de API e nada a preenche
     * sozinho: quem digita é a trilha da vaga. Guardar o código agora é o que permite, no dia da
     * ponte, casar a vaga do EA com a do ATS sem ter de perguntar o número de novo.
     *
     * ÍNDICE COMUM, NÃO UNIQUE, pelo mesmo motivo de `codigo`: a base histórica (onda 3) ainda vai
     * entrar, e um unique aqui faria a importação inteira falhar em vez de marcar a linha para
     * revisão. §A.6: é código de vaga, não dado de pessoa.
     */
    idVacancyPandape: varchar("id_vacancy_pandape", { length: 40 }),
    /** Nulável no rascunho; obrigatória para publicar, pela régua do domínio. */
    natureza: vagaNaturezaEnum("natureza"),
    /** Nasce VAZIO: a coluna não existe na base e preencher seria adivinhar. */
    vinculo: vagaVinculoEnum("vinculo"),
    /**
     * O STATUS, AGORA UM CÓDIGO DO CATÁLOGO (`as_vaga_status`, migration 0102), e não mais um enum.
     *
     * SEM DEFAULT, e a ausência é a regra (mesma decisão de `as_candidaturas.etapa` na 0100): um
     * default seria um SEGUNDO dono da decisão de onde a vaga nasce, apontando para um código fixo
     * mesmo depois de o diretor renomear a linha, e faria nascer vaga PUBLICADA num INSERT que
     * esquecesse a coluna, pulando `travaStatusDaTrilha` inteira. Quem decide é o service, que
     * pergunta ao catálogo pelo PAPEL e passa o código explicitamente.
     *
     * FK RESTRICT: status inexistente é impossível, e um código por onde alguma vaga passou não pode
     * ser apagado do catálogo, só inativado.
     */
    status: varchar("status", { length: 40 })
      .notNull()
      .references(() => asVagaStatus.codigo, { onDelete: "restrict" }),
    sazonalidade: vagaSazonalidadeEnum("sazonalidade").notNull().default("OPERACAO_PADRAO"),
    /**
     * A LINHA DE SERVIÇO da vaga (Onda C), do catálogo `as_linhas_servico`.
     *
     * FK DE VERDADE, e não o nome copiado (que é o que `motivo` e `horario_escala` fazem, cada um
     * pela sua razão): aqui o catálogo é curto, fechado e do diretor, e renomear "SouFast" tem de
     * corrigir o nome em toda vaga que já aponta para a linha, não só nas próximas.
     *
     * `RESTRICT` NO DELETE é o par da exclusão lógica: linha de serviço já usada por uma vaga não
     * some do banco, só sai de circulação. Sem isso, apagar a linha apagaria a resposta de "de que
     * linha era aquela vaga", que é exatamente o que o campo existe para registrar.
     *
     * NULÁVEL NA COLUNA, OBRIGATÓRIA NA PUBLICAÇÃO. É a mesma decisão de `codigo` e `cargo_id`: o
     * rascunho grava o que houver, e quem cobra é a régua dos obrigatórios, na hora de publicar.
     */
    linhaServicoId: integer("linha_servico_id").references(() => asLinhasServico.id, {
      onDelete: "restrict",
    }),
    /**
     * A CIDADE da vaga (Onda C), pelo código do IBGE, SUBSTITUINDO a lista velha de região.
     *
     * O QUE ACONTECE COM `regiao_estado`, `regioes` e `regioes_outras`: as três COLUNAS FICAM (a
     * §A.14 não pediu remoção, e `DROP COLUMN` é destrutivo e irreversível), mas deixam de ser
     * DIGITADAS. A UF passa a ser DERIVADA da cidade escolhida, no service, então tudo que já lê
     * `regiao_estado` (listagem, filtro, exportação) continua lendo o mesmo dado, agora com uma
     * fonte só e sem a chance de a UF e a cidade discordarem.
     *
     * `RESTRICT`: a base do IBGE não é apagada por ninguém, e a trava documenta isso.
     */
    cidadeId: integer("cidade_id").references(() => asCidades.id, { onDelete: "restrict" }),
    /**
     * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08): a vaga deixa de ter UMA meta e passa a
     * ter DUAS, cada uma com a sua contagem própria. OFICIAIS são as contratações de verdade; BANCO é
     * o excedente aprovado que fica reservado (o caso Blue Skies: 10 oficiais e 10 de banco).
     *
     * POR QUE `posicoes` FOI RENOMEADA em vez de ganhar uma coluna nova ao lado: com dois contadores,
     * o nome `posicoes` deixa de responder a pergunta que ele parece responder ("posições do quê?"),
     * e é exatamente essa ambiguidade que produz contagem errada seis meses depois. O dado existente
     * MIGRA SEM MENTIR: as posições gravadas até hoje são contratações de verdade, porque o banco não
     * existia como contador, então `posicoes` vira `posicoes_oficiais` com o mesmo número, e o banco
     * nasce ZERO em todas elas, que é a verdade (nenhuma vaga antiga reservou excedente).
     *
     * O momento também pesou: a base histórica de vagas (onda 3, 2.363 linhas) AINDA NÃO FOI
     * IMPORTADA e a Central de Vagas só existe em homologação. Renomear agora custa 11 linhas de
     * homologação; renomear depois da importação custaria a base inteira.
     *
     * OFICIAIS é NULÁVEL no rascunho (a vaga salva pela metade pode não ter meta ainda) e mantém o
     * CHECK `> 0`, agora com o nome novo: NULL é ausência, e ausência não é zero.
     *
     * BANCO é NOT NULL DEFAULT 0, e a assimetria é deliberada: vaga sem banco não é vaga com banco
     * "não informado", é vaga com banco ZERO. Zero é resposta, não lacuna, e por isso o CHECK dele é
     * `>= 0` e não `> 0`.
     *
     * A OCUPAÇÃO CONTINUA SENDO OUTRA COISA: aqui mora a META. A contagem de preenchidas vive em
     * `vagas_fechadas` / `vagas_fechadas_banco`, mais abaixo.
     */
    posicoesOficiais: integer("posicoes_oficiais").default(1),
    posicoesBanco: integer("posicoes_banco").notNull().default(0),
    escolaridade: vagaEscolaridadeEnum("escolaridade"),
    /**
     * OS DOIS SALÁRIOS DO FORMULÁRIO (decisão do diretor, 21/08). O formulário de vaga tem "Salário
     * Abertura" (no bloco de abertura) e "Salário Fechamento" (no bloco de fechamento), e eles
     * DIVERGEM na vida real: a vaga abre num valor e fecha em outro, e essa diferença é o próprio
     * indicador de negociação da vaga. Guardar um campo só apagaria o dado que interessa.
     *
     * `numeric(12,2)`, o mesmo tipo do salário da admissão, e nuláveis: a vaga abre sem salário
     * definido, e o de fechamento só existe depois que ela fecha.
     */
    salarioAbertura: numeric("salario_abertura", { precision: 12, scale: 2 }),
    salarioFechamento: numeric("salario_fechamento", { precision: 12, scale: 2 }),
    /** Nulável no rascunho; obrigatória para publicar, pela régua do domínio. */
    dataAbertura: date("data_abertura"),
    /**
     * DATA LIMITE DE QUALQUER VAGA (correção do diretor, 21/08). Era amarrada à vaga SAZONAL por um
     * CHECK; a amarração foi retirada porque toda natureza de vaga pode ter prazo. Continua nulável:
     * vaga sem prazo é caso normal, e a de abertura é que segue obrigatória.
     */
    dataLimite: date("data_limite"),
    /** Quem abriu: usuário do EA, carimbado pelo backend a partir da sessão, nunca digitado. */
    abertoPorId: uuid("aberto_por_id").references(() => usuarios.id, { onDelete: "set null" }),

    // ── PASSO 1, identificação ────────────────────────────────────────────────────────────────
    /**
     * DORMENTE desde a OST de 22/08 (item 4): o diretor tirou o Centro de custo da abertura, então
     * a trilha não pergunta, o DTO não aceita e a listagem não devolve mais este campo.
     *
     * A COLUNA FICA, e isso é escolha: `DROP COLUMN` é destrutivo e irreversível, e o campo pode
     * voltar. Enquanto não voltar, ela só guarda o que as vagas antigas já tinham.
     */
    centroCusto: varchar("centro_custo", { length: 80 }),

    // ── PASSO 2, quem pediu ───────────────────────────────────────────────────────────────────
    solicitanteNome: varchar("solicitante_nome", { length: 200 }),
    solicitanteTelefone: varchar("solicitante_telefone", { length: 40 }),
    solicitanteEmail: varchar("solicitante_email", { length: 180 }),
    dataSolicitacao: date("data_solicitacao"),
    dataAlinhamento: date("data_alinhamento"),
    envioShortlist: date("envio_shortlist"),

    /**
     * OS DOIS LADOS DA VAGA (frente 2 da OST de 22/08). Um é carimbado pelo backend a partir do papel
     * de A&S de quem abriu, o outro é escolhido na trilha. Nunca os dois digitados, nunca os dois
     * automáticos: é sempre um automático e uma contraparte.
     *
     * `set null` nos dois: a vaga sobrevive à desativação da pessoa, sem apagar o resto do registro.
     */
    consultorId: uuid("consultor_id").references(() => usuarios.id, { onDelete: "set null" }),
    recruiterId: uuid("recruiter_id").references(() => usuarios.id, { onDelete: "set null" }),

    // ── PASSO 3, contratação ──────────────────────────────────────────────────────────────────
    /** Lista de dias (30 a 270) mais "Indeterminado". Texto porque é o mesmo formato de `dados_vaga_folha`. */
    tempoContrato: varchar("tempo_contrato", { length: 40 }),
    /**
     * NOME do motivo, escolhido do catálogo `motivos_contratacao`, e não FK: é exatamente o que a
     * admissão faz em `dados_vaga_folha.motivo`. Assim inativar um motivo no catálogo não trava a
     * vaga antiga nem exige `restrict`.
     */
    motivo: varchar("motivo", { length: 200 }),
    justificativaMotivo: text("justificativa_motivo"),
    tipoSubstituicao: vagaTipoSubstituicaoEnum("tipo_substituicao"),
    /** Nome de quem será substituído. Só é pedido quando o motivo da contratação é Substituição. */
    substituidoNome: varchar("substituido_nome", { length: 200 }),
    /**
     * CPF DE QUEM SERÁ SUBSTITUÍDO, e ele PERSISTE (decisão batida do diretor, 22/08).
     *
     * ISTO REVERTE O DESENHO ANTERIOR, que deixava o CPF fora da vaga com o argumento de que, sem
     * assinatura de contrato, não haveria gatilho de expurgo e o dado ficaria retido para sempre.
     * O diretor decidiu o contrário e pelo motivo certo: a retenção aqui é EXIGÊNCIA LEGAL e
     * continuada, não incidental. O time de cadastro do ADM precisa do número do substituído para
     * a folha e o eSocial, e perdê-lo em 48h quebraria o cadastro.
     *
     * NÃO CONFUNDIR COM `dados_vaga_folha.substituido_cpf`, da ADMISSÃO, que segue com o TTL de 48h
     * da regra 10 da §A.3, intacto: são tabelas diferentes, com gatilhos e finalidades diferentes.
     * Esta frente não encostou no `expurgo.service`.
     *
     * §A.6 continua valendo em tudo o mais: 11 dígitos sem máscara, nunca escrito em log, nunca
     * exportado, e a rota inteira do módulo é fechada pelo menu `as-vagas`.
     */
    substituidoCpf: varchar("substituido_cpf", { length: 11 }),

    // ── PASSO 4, condições ────────────────────────────────────────────────────────────────────
    localTrabalho: text("local_trabalho"),
    /**
     * REGIÃO DE ABORDAGEM, NÍVEL BRASIL (item 7 da OST de 22/08), em duas colunas encadeadas.
     *
     * A UF comanda: escolhido o estado, `regioes` só aceita região daquele estado (a régua é
     * `regiaoPertenceAUf`, no shared-types, conferida no service antes de gravar). Antes disto,
     * `regioes` era UMA caixa de texto livre, e "zona leste", "ZL" e "leste de SP" eram três dados
     * diferentes para a mesma coisa.
     *
     * ARRAY, e não string com vírgula, pelo mesmo motivo de `testes`: a seleção é múltipla e a
     * pergunta que interessa é "quais vagas abordam a Baixada Fluminense", que em array se responde
     * sem varrer texto.
     */
    regiaoEstado: varchar("regiao_estado", { length: 2 }),
    regioes: text("regioes").array(),
    /** O que a lista de regiões não cobriu, escrito à mão. Não entra em catálogo nenhum. */
    regioesOutras: varchar("regioes_outras", { length: 200 }),
    /**
     * HORÁRIO E ESCALA (item 5 da OST de 22/08): passou de caixa de texto a lista do cadastro que já
     * existe, o `escalas_catalogo` da Liberação, servido por `/catalogos/escalas` (só as ativas).
     *
     * CONTINUA `text` DE PROPÓSITO, e não vira FK: o catálogo está sujo (153 ativas, com duplicatas
     * de caixa e placeholders como "A DEFINIR"), e a limpeza dele é frente futura do diretor. Uma FK
     * agora amarraria a vaga a linhas que vão ser fundidas. Além disso a opção "Outra escala" grava
     * texto que NÃO entra no catálogo, por decisão do diretor, e texto livre não cabe em FK.
     */
    horarioEscala: text("horario_escala"),
    modeloTrabalho: vagaModeloTrabalhoEnum("modelo_trabalho"),
    detalheHibrido: varchar("detalhe_hibrido", { length: 200 }),
    /** Padrões que vêm do formulário de papel: confidencial nasce não, divulgar empresa nasce sim. */
    confidencial: boolean("confidencial").notNull().default(false),
    divulgarEmpresa: boolean("divulgar_empresa").notNull().default(true),

    // ── PASSO 5, requisitos ───────────────────────────────────────────────────────────────────
    faixaEtaria: varchar("faixa_etaria", { length: 80 }),
    genero: vagaGeneroEnum("genero").notNull().default("INDIFERENTE"),
    /**
     * ─ OS IDIOMAS, EM DUAS COLUNAS DURANTE A TRANSIÇÃO, E ISSO É DESENHO ────────────────────────
     *
     * `idiomas` (ESTA) É A LEGADA, `text[]`, SEM NÍVEL. Ela fica CONGELADA: nada a escreve mais, e
     * ela continua respondendo pelas vagas gravadas antes da Onda C, para o código que ainda lê
     * `string[]` não passar a ler `undefined` no instante em que a migration roda.
     *
     * ┌─ POR QUE NÃO FOI CONVERTIDA NO LUGAR, que era o desenho anterior (VETO da auditoria) ────┐
     * │ As migrations rodam TODAS no mesmo comando, e o código NO AR durante esse comando é o de  │
     * │ ANTES: ele lê `idiomas` como lista de textos. Converter a coluna para `jsonb` no lugar    │
     * │ quebraria a tela no intervalo entre a migration e o deploy, que é justamente a janela em  │
     * │ que ninguém está olhando.                                                                 │
     * │                                                                                           │
     * │ E A CONVERSÃO TERIA DE INVENTAR UM NÍVEL para as vagas que já pedem idioma. Nenhuma       │
     * │ escolha é correta: um nível baixo AFROUXA a exigência de uma vaga aberta e recebendo      │
     * │ candidato, e um nível alto ELIMINA gente do processo. Migration não decide isso. O nível  │
     * │ da linha legada fica AUSENTE, e a tela escreve "nível não informado" (§A.11).             │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    idiomas: text("idiomas").array(),
    /**
     * OS IDIOMAS EXIGIDOS, cada um COM O SEU NÍVEL (Onda C). É esta que a trilha escreve.
     *
     * ┌─ POR QUE `jsonb` E NÃO DUAS COLUNAS DE ARRAY ────────────────────────────────────────────┐
     * │ A forma óbvia seria `idiomas text[]` mais `niveis text[]` ao lado. Ela cria DUAS listas   │
     * │ que concordam pela ORDEM, e ordem é a coisa mais fácil de perder numa edição de tela:     │
     * │ basta alguém remover o segundo idioma e esquecer o segundo nível para a vaga passar a     │
     * │ exigir "Espanhol fluente" sem ninguém ter digitado isso. O par é INDIVISÍVEL, então ele é │
     * │ UM objeto, e não dois campos casados.                                                      │
     * │                                                                                            │
     * │ TABELA FILHA SERIA A OUTRA RESPOSTA CERTA, descartada pelo tamanho: de zero a três linhas │
     * │ por vaga, lidas SEMPRE junto da vaga e nunca sozinhas. Custaria um join em toda leitura   │
     * │ da Central de Vagas para guardar o que cabe na própria linha.                              │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * `nivel` É NULÁVEL NO TIPO GRAVADO, e só por causa das linhas migradas: toda escrita NOVA
     * passa pelo DTO, onde o nível é OBRIGATÓRIO por idioma marcado. Nulo aqui significa
     * exatamente "vaga anterior à Onda C", e não "alguém deixou em branco".
     */
    idiomasExigidos: jsonb("idiomas_exigidos").$type<VagaIdiomaGravado[]>(),
    idiomasOutros: varchar("idiomas_outros", { length: 160 }),
    /** SEGUE TEXTO ABERTO por decisão do diretor: é o campo mais colado na realidade de cada cliente. */
    cursosConhecimentos: text("cursos_conhecimentos"),
    /**
     * TESTES APLICADOS como ARRAY de texto, não como coluna por teste nem como string com vírgula:
     * a seleção é múltipla e a lista pode crescer, e array é o que permite perguntar "quais vagas
     * pedem Excel" sem varrer texto.
     */
    testes: text("testes").array(),
    testesOutro: varchar("testes_outro", { length: 160 }),
    experiencia: text("experiencia"),
    atribuicoes: text("atribuicoes"),
    perfilComportamental: text("perfil_comportamental"),
    ambiente: text("ambiente"),
    /** Lista fechada, seleção múltipla (item 6). "Outra" leva o texto para `etapas_ps_outra`. */
    etapasPs: text("etapas_ps").array(),
    etapasPsOutra: varchar("etapas_ps_outra", { length: 160 }),
    observacoes: text("observacoes"),

    // ── FECHAMENTO (frente 4): preenchido só na ação Fechar Vaga, nunca na abertura ───────────
    dataFechamento: date("data_fechamento"),
    /**
     * A CONTAGEM, um número para cada meta (par de `posicoes_oficiais` / `posicoes_banco`).
     *
     * `vagas_fechadas` NÃO FOI RENOMEADA de propósito, ao contrário de `posicoes`: ela sempre contou
     * contratação de verdade, então continua significando exatamente o que significava, e o número
     * novo entra ao lado com nome explícito. Renomear as duas pontas ao mesmo tempo trocaria o
     * vocabulário do fechamento inteiro sem nenhum ganho de clareza.
     *
     * A trava "não passa das posições" é do serviço, com mensagem de gente, e agora ela olha OS DOIS
     * LADOS separadamente (`excessoDePosicoes`, em `domain/vaga.ts`): estourar o banco não é
     * desculpa para estourar o oficial, e vice-versa.
     */
    vagasFechadas: integer("vagas_fechadas"),
    vagasFechadasBanco: integer("vagas_fechadas_banco"),
    dataPrevistaInicio: date("data_prevista_inicio"),
    /**
     * A INTENÇÃO declarada no fechamento, quando o consultor escolhe "finalizar e enviar para
     * admissão". Fica REGISTRADA e não liga nada: a ponte com a esteira é frente separada, a última
     * do planejamento. Guardar a intenção agora é o que permite, no dia da ponte, saber quais vagas
     * pediram passagem sem precisar perguntar de novo.
     */
    enviarParaAdmissao: boolean("enviar_para_admissao").notNull().default(false),

    /**
     * ─ A TRILHA DO FECHAMENTO FORÇADO, escrita SÓ quando um Master fecha com posição em aberto ──
     *
     * A RÉGUA DO DIRETOR: a vaga só fecha quando todas as posições OFICIAIS estão preenchidas
     * (`finalizadasOficial >= posicoes_oficiais`, contado nas candidaturas). O MASTER e o
     * SUPER_ADMIN podem passar por cima disso, porque acontece de o cliente desistir de duas das
     * cinco posições e a vaga precisar encerrar assim mesmo. O que não pode é a exceção não deixar
     * marca: quem forçou, quando, e o que ele estava vendo.
     *
     * TRÊS COLUNAS AQUI, E NÃO UMA TABELA DE EVENTO: o forçamento acontece NO MÁXIMO UMA VEZ por
     * vaga (a vaga só fecha uma vez), então a tabela teria no máximo uma linha por vaga e uma FK
     * para chegar nela. O resto do fechamento (`data_fechamento`, `salario_fechamento`) já mora
     * nesta linha. O `passagem_aceites`, que seria o candidato natural a reuso, não serve: ele tem
     * FK NOT NULL para `admissoes` e `frentes_admissao`, e vaga não é admissão.
     *
     * `faltavam` É CONGELADO, e este é o ÚNICO número derivado que este módulo GUARDA. Ele é a razão
     * da exceção, e é verdadeiro NAQUELE instante: a vaga segue viva, alguém pode ser descartado
     * depois e a meta pode mudar, então recalcular faria a trilha contar uma história diferente da
     * que aconteceu. É carimbo histórico de um fato, não contador vivo.
     *
     * §A.6: nome de usuário INTERNO (pelo id), data e um número. Nenhum dado de candidato. Quem
     * faltou é derivável a qualquer momento das candidaturas, e por isso não precisa ser guardado.
     */
    fechamentoForcadoPorId: uuid("fechamento_forcado_por_id").references(() => usuarios.id, {
      // SET NULL, e não RESTRICT: apagar um usuário não pode falhar por causa de uma trilha, e a
      // trilha não pode sumir junto com ele. Sem o autor, ela ainda diz QUANDO e QUANTAS faltavam.
      onDelete: "set null",
    }),
    fechamentoForcadoEm: timestamp("fechamento_forcado_em", { withTimezone: true }),
    fechamentoForcadoFaltavam: integer("fechamento_forcado_faltavam"),

    /**
     * ─ A TRILHA DO CANCELAMENTO (onda B1): a segunda porta para o estado terminal da vaga ───────
     *
     * CANCELAR NÃO É FECHAR, e é por isso que as colunas são outras. Fechar responde "a vaga
     * entregou o que prometeu?"; cancelar responde "por que este processo não vai mais acontecer?".
     * O status `CANCELADA` já existia no enum e já era LIDO em quatro pontos (o desfecho da vaga
     * vence tudo, os contadores congelam, o card de KPI); o que faltava era o ESCRITOR, e ele nasce
     * carimbando tudo isto na MESMA gravação que muda o status. Não existe vaga cancelada sem trilha.
     *
     * `cancelamento_motivo` GUARDA O NOME, e não o id do catálogo (`motivos_cancelamento_vaga`),
     * pela razão escrita naquela tabela: a vaga cancelada em janeiro continua dizendo por que foi
     * cancelada mesmo que o motivo saia de circulação em março. O service valida o nome contra o
     * catálogo ATIVO na hora de gravar, então texto livre não entra por aqui.
     *
     * ┌─ AS TRÊS COLUNAS DO FORÇADO, e por que o número se chama `seguravam` ──────────────────┐
     * │ O CANCELAMENTO É BARRADO quando ainda há candidatura que SEGURA o cancelamento (ATIVO   │
     * │ ou ALOCADO, régua do diretor em `seguraOCancelamento`). O MASTER passa por cima, porque │
     * │ acontece de o cliente cancelar a vaga com gente em processo dentro. A exceção deixa      │
     * │ marca: quem autorizou, quando, e QUANTOS processos ele atropelou naquele instante.       │
     * │                                                                                         │
     * │ O NÚMERO É CONGELADO E NÃO RECALCULADO, como o `fechamento_forcado_faltavam`: as         │
     * │ candidaturas que seguravam são ENCERRADAS pelo próprio cancelamento forçado (§A.6, para  │
     * │ o prazo de retenção poder correr), então recalcular daria ZERO para sempre e a trilha    │
     * │ contaria uma história diferente da que aconteceu.                                        │
     * └─────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * `ON DELETE SET NULL` NOS DOIS AUTORES, e NÃO existe check de "tudo ou nada" entre as colunas,
     * pela mesma razão da 0098: apagar um usuário não pode FALHAR por causa de uma vaga cancelada
     * meses antes, e a trilha não pode sumir junto com ele. Sem o autor, ela ainda diz quando, por
     * que e quantos processos foram atropelados.
     *
     * §A.6: um id de usuário INTERNO, duas datas, um número e dois textos de PROCESSO. Nenhum dado
     * de candidato, nenhum CPF, nenhum nome de pessoa, nenhuma URL.
     */
    canceladaPorId: uuid("cancelada_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    cancelamentoMotivo: varchar("cancelamento_motivo", { length: 160 }),
    cancelamentoObservacao: text("cancelamento_observacao"),
    cancelamentoForcadoPorId: uuid("cancelamento_forcado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    cancelamentoForcadoEm: timestamp("cancelamento_forcado_em", { withTimezone: true }),
    cancelamentoForcadoSeguravam: integer("cancelamento_forcado_seguravam"),

    /**
     * ─ O INSTANTE EM QUE A VAGA ENCERROU, CARIMBADO PELO SERVIDOR (migration 0103) ──────────────
     *
     * PARA QUE ELA EXISTE: é o RELÓGIO DA RETENÇÃO (§A.6). O expurgo de candidatos passa a tratar
     * "vivo em vaga ENCERRADA" como processo encerrado, para o prazo de 2 anos poder começar a
     * correr; sem uma data de referência, o prazo dessa pessoa contaria do `atualizado_em` da
     * candidatura, que NÃO é carimbado quando a vaga encerra (medido: a candidatura APROVADA ficou
     * 18 segundos ATRÁS do `cancelada_em` da vaga). Quem foi aprovado em 2024 numa vaga encerrada
     * hoje nasceria com o prazo JÁ VENCIDO e seria anonimizado na varredura seguinte, sem carência.
     *
     * ┌─ POR QUE NÃO `data_fechamento`, e é a razão inteira de a coluna existir ─────────────────┐
     * │ `data_fechamento` VEM DO CORPO (`dto.dataFechamento` / `dto.dataCancelamento`, os dois    │
     * │ `@IsISO8601()` sem piso), e isso é deliberado: ela é o fato COMERCIAL, que pode ser        │
     * │ anterior ao clique, e é o que o contador de dias em aberto lê. O que ela não pode ser é    │
     * │ relógio de expurgo: um COMUM cancelando uma vaga com data de 2019 faria todo mundo dentro  │
     * │ dela virar elegível na varredura seguinte, ou seja, um gatilho REMOTO de exclusão          │
     * │ irreversível de dado pessoal. Esta aqui é `new Date()` do servidor, como `cancelada_em`.   │
     * │                                                                                           │
     * │ `cancelada_em` também não bastava: ela só existe no CANCELAMENTO, e a vaga FECHADA e a     │
     * │ ENTREGUE encerram igual, sem carimbo de servidor nenhum.                                   │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * ESCRITA POR DUAS PORTAS, E SÓ POR ELAS: `vagas.service.fechar` e `vagas.service.cancelar`,
     * dentro do MESMO `update` que muda o status, então não existe vaga encerrada sem o instante.
     * `moverStatus` não alcança status que encerra (o service recusa e o CHECK
     * `as_vaga_status_encerra_nao_e_destino` da 0102 recusa de novo, no banco).
     *
     * NULA NA VAGA VIVA, e a leitura do expurgo é FAIL-CLOSED: vaga marcada como encerrada sem este
     * carimbo continua PROTEGENDO quem está dentro, em vez de liberar o prazo com data desconhecida.
     */
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),

    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // Busca por código é o caminho natural de quem trabalha com a base (o código é o que a operação
    // decora). ÍNDICE COMUM, NÃO UNIQUE, e a escolha é deliberada: a trava de duplicidade vive no
    // CADASTRO (`vagas.service`), porque a base histórica da onda 3 traz códigos repetidos e um
    // unique no banco faria a importação inteira falhar em vez de marcar a linha para revisão.
    idxCodigo: index("idx_vagas_codigo").on(t.codigo),
    idxCliente: index("idx_vagas_cod_cliente").on(t.codCliente),
    idxCargo: index("idx_vagas_cargo").on(t.cargoId),
    idxStatus: index("idx_vagas_status").on(t.status),
    idxAbertura: index("idx_vagas_data_abertura").on(t.dataAbertura),
    idxIdVacancyPandape: index("idx_vagas_id_vacancy_pandape").on(t.idVacancyPandape),
    // Meta zero ou negativa não é meta, é linha que deveria ter sido apagada (mesmo check de
    // `projeto_vaga_cargo`, e pelo mesmo motivo: a meta entra em divisão na tela). O CHECK antigo
    // `ck_vagas_posicoes` é o MESMO, renomeado junto com a coluna, para o nome do check não continuar
    // apontando para uma coluna que não existe mais.
    ckPosicoesOficiais: check("ck_vagas_posicoes_oficiais", sql`${t.posicoesOficiais} > 0`),
    // O BANCO ACEITA ZERO, e é a diferença que importa entre os dois checks: zero banco é o estado
    // normal da maioria das vagas, não uma linha defeituosa.
    ckPosicoesBanco: check("ck_vagas_posicoes_banco", sql`${t.posicoesBanco} >= 0`),
    /**
     * FORÇAR COM ZERO FALTANDO NÃO EXISTE: se não faltava nada, o fechamento passou pela régua
     * normal e não é exceção nenhuma. Zero gravado aqui seria uma trilha que descreve um fato que
     * não aconteceu.
     *
     * NÃO EXISTE CHECK DE "TUDO OU NADA" entre as três colunas, e a ausência é deliberada: o autor
     * vira NULL sozinho quando o usuário é apagado (`on delete set null`), e um check exigindo o
     * autor junto do carimbo faria o DELETE do usuário FALHAR por causa de uma vaga fechada meses
     * antes.
     */
    ckFechamentoForcadoFaltavam: check(
      "ck_vagas_fechamento_forcado_faltavam",
      sql`${t.fechamentoForcadoFaltavam} is null or ${t.fechamentoForcadoFaltavam} > 0`,
    ),
    /**
     * FORÇAR O CANCELAMENTO COM ZERO SEGURANDO NÃO EXISTE, e é o mesmo CHECK do forçamento do
     * fechamento, pela mesma razão: se ninguém segurava, o cancelamento passou pela régua NORMAL e
     * não é exceção nenhuma. Zero gravado aqui seria uma trilha descrevendo um fato que não
     * aconteceu, no campo que a auditoria lê para saber o tamanho da exceção autorizada.
     */
    ckCancelamentoForcadoSeguravam: check(
      "ck_vagas_cancelamento_forcado_seguravam",
      sql`${t.cancelamentoForcadoSeguravam} is null or ${t.cancelamentoForcadoSeguravam} > 0`,
    ),
    // A pergunta é sempre "quais vagas foram canceladas", nunca "todas as vagas": índice PARCIAL,
    // como o do forçamento do fechamento. É ele que faz a trilha ser consultável, e não só gravada.
    idxCanceladaEm: index("idx_vagas_cancelada_em")
      .on(t.canceladaEm)
      .where(sql`${t.canceladaEm} is not null`),
    // O MESMO DESENHO, e pela mesma razão: a coluna é nula na vaga viva (a maioria) e a pergunta que
    // a retenção faz é sempre sobre a vaga ENCERRADA.
    idxEncerradaEm: index("idx_vagas_encerrada_em")
      .on(t.encerradaEm)
      .where(sql`${t.encerradaEm} is not null`),
    // O CHECK `ck_vagas_limite_sazonal` (data limite obrigatória na vaga SAZONAL) foi REMOVIDO na
    // correção de 21/08: a amarração era engano, a data limite vale para qualquer natureza de vaga.
  }),
);

/**
 * BENEFÍCIOS DA VAGA (correção do diretor, 21/08): o formulário de abertura traz "Benefícios:
 * ( )VT ( )VA ( )VR ( )AM ...", e a vaga passa a SELECIONAR do catálogo que já existe
 * (`beneficios_catalogo`, a mesma fonte da tela de Benefícios) em vez de guardar texto livre.
 *
 * POR QUE UMA TABELA DE LIGAÇÃO, e não uma coluna de texto: foi exatamente a coluna de texto
 * (`dados_vaga_folha.beneficios`) que produziu 2.066 blobs que ninguém consegue filtrar nem contar.
 * O mesmo desenho de `admissao_beneficio`, pelo mesmo motivo.
 *
 * CASCADE na vaga (o vínculo não sobrevive à vaga) e RESTRICT no catálogo (apagar um benefício não
 * pode evaporar em silêncio o que já foi selecionado). §A.6: só vínculo, sem PII.
 */
export const vagaBeneficio = pgTable(
  "vaga_beneficio",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    vagaId: uuid("vaga_id")
      .notNull()
      .references(() => vagas.id, { onDelete: "cascade" }),
    beneficioId: uuid("beneficio_id")
      .notNull()
      .references(() => beneficiosCatalogo.id, { onDelete: "restrict" }),
    /**
     * VALOR do benefício nesta vaga (decisão do diretor, 22/08), no espelho exato de
     * `admissao_beneficio.valor`. NULÁVEL de propósito: benefício sem valor (Seguro de vida) é só
     * concedido ou não, e forçar zero ali seria inventar um número que ninguém informou.
     */
    valor: numeric("valor", { precision: 12, scale: 2 }),
    criadoEm,
  },
  (t) => ({
    uqVagaBeneficio: unique("uq_vaga_beneficio").on(t.vagaId, t.beneficioId),
    idxVaga: index("idx_vaga_beneficio_vaga").on(t.vagaId),
  }),
);

/**
 * ─ O RASTRO DA REDUÇÃO DE META DA VAGA (achado da auditoria de segurança, 09/09/2026) ───────────
 *
 * O QUE ELE FECHA. O gate de Master do fechamento era CONTORNÁVEL SEM TOCAR NO GATE. `fechar()`
 * recusa quando `posicoes_oficiais - entregues > 0` e só o MASTER força, deixando a trilha das
 * colunas `fechamento_forcado_*`. Só que a META é editável por uma ROTA IRMÃ
 * (`PATCH /as/vagas/:id/posicoes`), sem guard de papel: o COMUM baixava a meta até o número já
 * entregue, a subtração dava ZERO e a vaga fechava pela porta NORMAL, sem Master e com a trilha do
 * forçamento em branco. A trava de excesso não pegava porque ela só barra `entregues > meta`
 * (estritamente maior), e IGUALAR passa.
 *
 * A DECISÃO DO DIRETOR É RASTRO, E NÃO TRAVA, e a diferença é o desenho inteiro desta tabela: baixar
 * a meta CONTINUA sendo do consultor (a edição foi liberada a ele em 25/08), porque o cliente
 * desistir de duas das cinco posições acontece toda semana. O que muda é que o gesto para de ser
 * invisível. Controle por RESPONSABILIZAÇÃO, o mesmo padrão do aceite de dupla correção da INT-4.
 *
 * UMA TABELA, E NÃO COLUNAS NA VAGA COMO NO FORÇAMENTO: o forçamento acontece no máximo UMA VEZ (a
 * vaga só fecha uma vez) e coube em três colunas; a meta muda quantas vezes quiserem enquanto a vaga
 * está aberta, e guardar só a última faria quem baixou de 5 para 3 e depois de 3 para 1 aparecer
 * como quem baixou de 3 para 1. Trilha que apaga o próprio começo não é trilha.
 *
 * SÓ A REDUÇÃO ENTRA, e o CHECK garante isso no banco: aumentar a meta AFASTA o fechamento em vez de
 * aproximá-lo, não contorna gate nenhum, e registrá-lo encheria de ruído justamente o caso
 * inofensivo. OS DOIS LADOS VIAJAM NA MESMA LINHA porque o gesto é um só: a tela salva o par numa
 * requisição, e separar por lado inventaria dois eventos onde houve um.
 *
 * §A.6: id de vaga, id de usuário INTERNO, uma data e quatro números. Nenhum dado de candidato.
 */
export const vagaMetaReducoes = pgTable(
  "vaga_meta_reducoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** CASCADE: o rastro é DA vaga e não sobrevive a ela, mesma regra do `vaga_beneficio` acima. */
    vagaId: uuid("vaga_id")
      .notNull()
      .references(() => vagas.id, { onDelete: "cascade" }),
    /**
     * A META OFICIAL ANTES, e ela é a ÚNICA nulável das quatro. `vagas.posicoes_oficiais` é nulável
     * porque o RASCUNHO pode não ter meta ainda, e o rascunho passa por esta rota (só a vaga
     * ENCERRADA é recusada). Nulo aqui é "não havia meta oficial antes", que não é zero.
     */
    deOficiais: integer("de_oficiais"),
    paraOficiais: integer("para_oficiais").notNull(),
    /** O banco é NOT NULL na vaga e é NOT NULL aqui: banco vazio é ZERO, não "não informado". */
    deBanco: integer("de_banco").notNull(),
    paraBanco: integer("para_banco").notNull(),
    /**
     * SET NULL, e não RESTRICT, exatamente como o autor do fechamento forçado: apagar um usuário não
     * pode FALHAR por causa de uma redução de meses atrás, e o rastro não pode sumir junto com ele.
     * Sem o autor, ele ainda diz QUANDO e DE QUANTO PARA QUANTO. É por isso que não existe check de
     * "tudo ou nada" com esta coluna: ele faria o DELETE do usuário quebrar.
     */
    porId: uuid("por_id").references(() => usuarios.id, { onDelete: "set null" }),
    /**
     * UM TIMESTAMP SÓ. O `as_candidatura_etapas` tem dois porque lá a semente do backfill grava
     * passado no `ocorrido_em`; aqui não há backfill nem como haver (nenhuma redução anterior foi
     * registrada em lugar nenhum), então o instante do evento É o da inserção.
     */
    criadoEm,
  },
  (t) => ({
    /** (vaga, quando): é a consulta da listagem, que lê o rastro da página inteira de uma vez. */
    idxVaga: index("idx_vaga_meta_reducoes_vaga").on(t.vagaId, t.criadoEm),
    /**
     * LINHA QUE NÃO É REDUÇÃO NÃO EXISTE. Sem este check, um caminho futuro que gravasse toda edição
     * transformaria o rastro numa lista de "salvei o formulário", e a pergunta que ele responde
     * ("esta vaga fechou porque entregou, ou porque encolheram a meta?") ficaria enterrada no ruído.
     */
    ckHouveReducao: check(
      "ck_vaga_meta_reducoes_houve_reducao",
      sql`(${t.deOficiais} is not null and ${t.paraOficiais} < ${t.deOficiais}) or ${t.paraBanco} < ${t.deBanco}`,
    ),
    /**
     * AS MESMAS BORDAS DA VAGA, repetidas de propósito: a meta oficial é sempre maior que zero
     * (`ck_vagas_posicoes_oficiais`) e a de banco aceita zero (`ck_vagas_posicoes_banco`). Um rastro
     * que aceitasse números que a vaga recusa descreveria um estado que a vaga nunca teve.
     */
    ckNumeros: check(
      "ck_vaga_meta_reducoes_numeros",
      sql`(${t.deOficiais} is null or ${t.deOficiais} > 0) and ${t.paraOficiais} > 0 and ${t.deBanco} >= 0 and ${t.paraBanco} >= 0`,
    ),
  }),
);

/**
 * ─ A TRILHA DO MOVIMENTO MANUAL DE STATUS DA VAGA (onda B2, migration 0102) ────────────────────
 *
 * UMA LINHA POR MOVIMENTO, e não um par de colunas na vaga: a vaga pode ir e voltar de um status
 * quantas vezes o time quiser enquanto estiver aberta, e guardar só o último contaria uma história
 * falsa. É a mesma decisão, pela mesma razão, de `vaga_meta_reducoes` (0099).
 *
 * AS DUAS FKs PARA O CATÁLOGO SÃO `RESTRICT`, e não enfeite: são elas que fazem a camada 2 do apagar
 * enxergar que vagas JÁ PASSARAM por um status. Sem elas, apagar a linha do catálogo deixaria os
 * eventos apontando para um código que não existe mais, e a linha do tempo exibiria código cru.
 *
 * ELA REGISTRA SÓ O MOVIMENTO MANUAL (`PATCH /as/vagas/:id/status`). O fechamento e o cancelamento
 * têm trilha PRÓPRIA e mais rica, nas colunas da própria vaga (`fechamento_forcado_*`,
 * `cancelada_por_id`, `cancelamento_motivo`), e duplicá-los aqui criaria dois lugares para responder
 * a mesma pergunta.
 *
 * §A.6: um id de vaga, dois códigos de status, um id de usuário INTERNO, uma data e a observação
 * digitada por quem moveu. Nenhum dado de candidato.
 */
export const asVagaStatusEventos = pgTable(
  "as_vaga_status_eventos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** CASCADE: o rastro é DA vaga e não sobrevive a ela, mesma regra de `vaga_meta_reducoes`. */
    vagaId: uuid("vaga_id")
      .notNull()
      .references(() => vagas.id, { onDelete: "cascade" }),
    /** De onde a vaga saiu. NULÁVEL: existe movimento sem origem conhecida (carga, reprocesso). */
    de: varchar("de", { length: 40 }).references(() => asVagaStatus.codigo, {
      onDelete: "restrict",
    }),
    para: varchar("para", { length: 40 })
      .notNull()
      .references(() => asVagaStatus.codigo, { onDelete: "restrict" }),
    /**
     * SET NULL, e não RESTRICT, como o autor da redução de meta: apagar um usuário não pode FALHAR
     * por causa de um movimento de meses atrás, e o rastro não pode sumir junto com ele. Sem o
     * autor, ele ainda diz QUANDO e DE ONDE PARA ONDE.
     */
    porId: uuid("por_id").references(() => usuarios.id, { onDelete: "set null" }),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
    /** O que quem moveu escreveu. Texto livre, opcional, sem dado de candidato (§A.6). */
    observacao: text("observacao"),
  },
  (t) => ({
    /** (vaga, quando): a linha do tempo da vaga, da mais antiga para a mais recente. */
    idxVaga: index("idx_as_vaga_status_eventos_vaga").on(t.vagaId, t.em),
  }),
);

// ── CENTRAL DE CANDIDATOS (A&S, onda 1) ─────────────────────────────────────
//
// TRÊS TABELAS E UMA PONTE. A pessoa (`as_candidatos`), a ligação dela com uma vaga
// (`as_candidaturas`) e o histórico do que aconteceu naquela ligação (`as_contatos`). A ponte com a
// esteira (`admissao_id`) nasce nula e NÃO é usada nesta onda.
//
// §A.6, E ESTA É A DIFERENÇA QUE IMPORTA: `as_candidatos` é a PRIMEIRA tabela do sistema que guarda
// dado pessoal de quem AINDA NÃO É FUNCIONÁRIO. Em `candidatos` (Admissão) a pessoa já entrou num
// processo formal; aqui ela pode nunca passar da triagem, e mesmo assim o nome, o telefone e às
// vezes o CPF ficam gravados. Por isso: CPF opcional, retorno de lista sem identificador direto,
// busca por CPF só no CORPO da requisição e expurgo por retenção.

/**
 * A PESSOA do funil de seleção.
 *
 * A CHAVE É O `id`, NÃO O CPF, e isto é a diferença central em relação a `candidatos` (Admissão),
 * onde o CPF É a chave. O motivo é operacional: candidato de seleção muitas vezes ainda não deu o
 * CPF, e exigi-lo produziria uma de duas coisas ruins, o time inventando número para conseguir
 * salvar, ou a pessoa simplesmente não sendo cadastrada. O precedente já existe no próprio sistema:
 * a Sala de Espera nasceu assim, com `cpf` nulável.
 *
 * O DEDUP CONTINUA EXISTINDO, e é o UNIQUE PARCIAL (`where cpf is not null`) que o sustenta: dois
 * cadastros com o mesmo CPF são barrados pelo banco, e mil cadastros sem CPF convivem sem se
 * atrapalhar. Um unique comum trataria todos os NULL como colidentes em alguns bancos e, no
 * Postgres, permitiria o duplicado sem CPF, que é o comportamento que se quer, mas sem o dedup do
 * lado preenchido ficar explícito. O parcial diz exatamente a regra que se quer: quando há CPF, ele
 * é único. Mesmo tratamento para `id_candidate_pandape`, pela mesma razão.
 */
export const asCandidatos = pgTable(
  "as_candidatos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** O único obrigatório. Sem nome não há pessoa a acompanhar. */
    nome: varchar("nome", { length: 200 }).notNull(),
    /**
     * 11 dígitos, SEM máscara, e OPCIONAL. Validado pelo dígito verificador quando preenchido
     * (`isValidCpf`, do shared-types, o mesmo validador do resto do sistema, nunca um segundo).
     *
     * §A.6: nunca em log, nunca em mensagem de erro, nunca em URL nem em query string, e fora do
     * retorno de LISTA. Sai só na ficha de um candidato.
     */
    cpf: varchar("cpf", { length: 11 }),
    email: varchar("email", { length: 180 }),
    telefone: varchar("telefone", { length: 40 }),
    dataNascimento: date("data_nascimento"),
    cidade: varchar("cidade", { length: 120 }),
    uf: varchar("uf", { length: 2 }),
    origem: asCandidatoOrigemEnum("origem").notNull().default("MANUAL"),
    /**
     * O id da PESSOA no Pandapé, reservado para a onda 4. Nasce vazio e nada o preenche hoje: não há
     * varredura e não há chamada de API nesta onda. Unique parcial, como o CPF.
     */
    idCandidatePandape: varchar("id_candidate_pandape", { length: 40 }),
    /** Quem cadastrou, da SESSÃO e nunca do corpo: é trilha, não campo de formulário. */
    criadoPorId: uuid("criado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    /**
     * CARIMBO DO EXPURGO POR RETENÇÃO (decisão do diretor): candidato DESCARTADO tem os
     * identificadores diretos descartados 2 anos depois; candidato de BANCO não expira.
     *
     * A LINHA NÃO É APAGADA, e isso é deliberado: apagar levaria junto as candidaturas e o histórico
     * das vagas, e a contagem de posições de processos passados passaria a mentir. O que se descarta
     * é o que identifica a pessoa (CPF, e-mail, telefone, nascimento e o id do ATS), no mesmo
     * espírito do `ExpurgoService` da Admissão, que nula o CPF do substituído e preserva a linha.
     * Preenchido = já expurgado, e o varredor não volta nela.
     */
    anonimizadoEm: timestamp("anonimizado_em", { withTimezone: true }),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    // O DEDUP, e a razão de ele ser PARCIAL: quando há CPF, ele é único; sem CPF, ninguém colide.
    uqCpf: uniqueIndex("uq_as_candidatos_cpf")
      .on(t.cpf)
      .where(sql`${t.cpf} is not null`),
    uqPandape: uniqueIndex("uq_as_candidatos_id_candidate_pandape")
      .on(t.idCandidatePandape)
      .where(sql`${t.idCandidatePandape} is not null`),
    // Busca por nome é o caminho natural de quem trabalha na tela (buscar por CPF é a exceção).
    idxNome: index("idx_as_candidatos_nome").on(t.nome),
    idxOrigem: index("idx_as_candidatos_origem").on(t.origem),
  }),
);

/**
 * A LISTA DAS SITUAÇÕES QUE ENCERRAM SEM ÊXITO, em SQL, para o predicado do índice parcial de
 * `as_candidaturas`. O índice cobre as VIVAS, e ele as descreve PELO COMPLEMENTO.
 *
 * `sql.raw` PORQUE ISTO É UM PEDAÇO DE DDL, não um valor: parâmetro de bind (`$1`) não existe dentro
 * da definição de um índice. Os valores vêm de uma constante de código derivada do vocabulário, e
 * nunca de entrada de usuário, então não há concatenação de dado externo aqui.
 *
 * ┌─ POR QUE O COMPLEMENTO, e não a lista positiva das vivas ────────────────────────────────────┐
 * │ O predicado de um índice parcial guarda os valores COMPILADOS dentro dele, e `ALTER TYPE ...  │
 * │ ADD VALUE` não o atualiza. Com a lista POSITIVA, toda situação nova nascia FORA da cobertura, │
 * │ em silêncio, e o banco parava de barrar a segunda linha viva do par pessoa/vaga: exatamente o │
 * │ que ia acontecer com `ALOCADO`, medido em banco de rascunho antes da correção.                │
 * │                                                                                               │
 * │ COM O COMPLEMENTO, A DIREÇÃO SE INVERTE E VIRA FAIL-CLOSED, que é a mesma direção de          │
 * │ `SITUACOES_VIVAS` (o complemento exato de `ehSaidaSemExito`): situação nova nasce VIVA e,     │
 * │ portanto, JÁ COBERTA pela trava, sem migration nenhuma.                                       │
 * │                                                                                               │
 * │ E É O QUE TORNA A MIGRATION POSSÍVEL EM UMA TRANSAÇÃO SÓ (ver `0095_as_situacao_alocado.sql`, │
 * │ que mede isto): o predicado não cita nenhum valor RECÉM-CRIADO do enum, e o Postgres recusa    │
 * │ usar valor de enum na transação em que ele nasceu.                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
/**
 * ─ A LINHA DE SERVIÇO DA VAGA (Onda C). CATÁLOGO DO DIRETOR, no molde de `as_etapas_funil` ─────
 *
 * ┌─ ELA NÃO É `projetos_alto_volume`, E O NOME PRÓPRIO É O QUE IMPEDE A CONFUSÃO ───────────────┐
 * │ `projetos_alto_volume` guarda EVENTOS ("BIENAL DOS LIVROS", "BF"): campanhas com data, dentro│
 * │ da operação de alto volume. ESTA guarda a LINHA DE SERVIÇO (Pontuais & Estratégicas, RPO &   │
 * │ BPO, Alto Volume, SouFast, OneShot), que é outro eixo: uma vaga da linha "Alto Volume" pode  │
 * │ ou não pertencer a um evento de alto volume. Quem escrever `projeto` sem qualificar, daqui a │
 * │ seis meses, vai ler a tabela errada, e por isso tabela, tipo e rota nascem com nome próprio. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MOLDE É O DO CATÁLOGO DE ETAPAS, e a repetição é deliberada: o problema é o mesmo (uma lista
 * que é do diretor e não da fábrica) e a resposta já foi auditada uma vez. `codigo` IMUTÁVEL,
 * derivado do rótulo na criação, porque é ele que fica legível no histórico e em qualquer exportação
 * futura; `rotulo` editável, e renomear corrige o nome em toda vaga que já aponta para a linha;
 * `ordem` para o seletor sair na ordem que o diretor quer; `ativo` como EXCLUSÃO LÓGICA, que é o que
 * faz a vaga do ano passado continuar dizendo de que linha ela era depois de a linha sair de
 * circulação.
 *
 * A ORDEM NÃO É UNIQUE, pelo mesmo motivo das etapas: reordenar reescreve `ordem = 1..N` numa
 * transação e passa por estados transitórios com duplicata. O desempate da leitura é `(ordem, id)`.
 *
 * §A.6: código, rótulo, ordem e um booleano. Nenhum dado pessoal entra aqui.
 */
export const asLinhasServico = pgTable("as_linhas_servico", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull().unique(),
  rotulo: varchar("rotulo", { length: 120 }).notNull(),
  ordem: integer("ordem").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

/**
 * ─ OS MUNICÍPIOS DO IBGE (Onda C). BASE DE REFERÊNCIA, carregada uma vez ───────────────────────
 *
 * `id` É O CÓDIGO DO IBGE, de 7 dígitos, e ele é a CHAVE DE VERDADE, não um serial com o código ao
 * lado. Nome de município se repete entre estados (há CINCO "Bom Jesus", em PB, PI, RN, RS e SC,
 * então casar por nome é exatamente como a lista velha de região errava. O código é oficial, estável
 * e é o que qualquer integração futura (eSocial, folha, ATS) vai falar.
 *
 * A CARGA É UM SCRIPT QUE RODA UMA VEZ (`db/carga-cidades-ibge.ts`), e NUNCA uma chamada em tempo de
 * request: a abertura de vaga não pode depender de o IBGE estar no ar. São 5.571 linhas de dado
 * público, imutável na prática, e por isso não há tela de manutenção: a fonte é o IBGE, e recarregar
 * é rodar o script de novo (idempotente por `id`).
 *
 * O ÍNDICE É `(uf, nome)` porque a ÚNICA pergunta que a tela faz é "as cidades deste estado, em
 * ordem alfabética": o seletor encadeia UF -> cidade, como a lista de regiões já fazia.
 *
 * §A.6: nome de cidade, sigla de estado e um código público. Nenhum dado pessoal.
 */
export const asCidades = pgTable(
  "as_cidades",
  {
    /** Código do IBGE, de 7 dígitos. NÃO é serial: o número vem da fonte e é a identidade. */
    id: integer("id").primaryKey(),
    nome: varchar("nome", { length: 120 }).notNull(),
    uf: varchar("uf", { length: 2 }).notNull(),
    criadoEm,
    atualizadoEm,
  },
  (t) => [index("as_cidades_uf_nome_idx").on(t.uf, t.nome)],
);

/**
 * ─ O CATÁLOGO DAS ETAPAS DO FUNIL (A&S). A LISTA É DO DIRETOR, NÃO DO CÓDIGO ────────────────────
 *
 * ELA ERA UM ENUM DO POSTGRES (`candidatura_etapa`), e virou tabela na migration
 * `0100_as_etapas_funil`. O motivo é simples e não tem contorno: o diretor CADASTRA, RENOMEIA,
 * REORDENA e COLORE as etapas na tela do gerenciador, e enum não se edita por tela (o Postgres nem
 * oferece `ALTER TYPE ... DROP VALUE`). O precedente da casa é o `frenteStatusCatalogo` do iFractal,
 * logo acima, e a razão que valeu lá vale aqui: onde NÃO há regra amarrada ao valor, a lista pode
 * ser dado.
 *
 * ┌─ IDENTIDADE E NOME SÃO COISAS SEPARADAS, e é isso que impede o histórico de mentir ──────────┐
 * │ `codigo` é a IDENTIDADE e é IMUTÁVEL: é ele que fica gravado na candidatura e em cada evento  │
 * │ de `as_candidatura_etapas`. Não existe operação "trocar o código".                            │
 * │ `rotulo` é o NOME, editável à vontade, resolvido por join na leitura viva E no histórico.     │
 * │                                                                                               │
 * │ Renomear "Triagem" para "Triagem Inicial" faz o histórico inteiro daquela etapa passar a      │
 * │ dizer "Triagem Inicial", que é a leitura CERTA: é a mesma etapa, com o nome corrigido.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ORDEM NÃO É UNIQUE de propósito: reordenar reescreve `ordem = 1..N` de uma vez, e passa por
 * estados transitórios com duplicata que um unique não postergável recusaria. A autoridade é a
 * reescrita completa, e o desempate da leitura é `(ordem, id)`.
 *
 * `inicial` É EXCLUSIVO NO BANCO, por índice parcial único (`as_etapas_funil_inicial_unica`, criado
 * na migration e sem equivalente declarável aqui). Ele é o ÚNICO dono da pergunta "onde a
 * candidatura nasce?": o `DEFAULT 'CAPTACAO'` que a coluna `etapa` tinha foi removido na mesma
 * migration justamente para não haver um segundo.
 *
 * `ativa` É EXCLUSÃO LÓGICA, e ela não é preferência: pela FK RESTRICT das três colunas, uma etapa
 * por onde alguém já passou NÃO PODE ser apagada, nunca mais, e inativar é o que sobra. Some dos
 * seletores e dos filtros, continua resolvendo o rótulo do histórico de quem passou por ela.
 *
 * §A.6: código, rótulo, ordem, cor e dois booleanos. Nenhum dado pessoal entra aqui.
 */
export const asEtapasFunil = pgTable("as_etapas_funil", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull().unique(),
  rotulo: varchar("rotulo", { length: 120 }).notNull(),
  ordem: integer("ordem").notNull(),
  /** Da paleta FECHADA do design system (`ETAPA_TONS`). CHECK no banco, na migration. */
  tom: varchar("tom", { length: 4 }).notNull().default("nt"),
  inicial: boolean("inicial").notNull().default(false),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm,
  atualizadoEm,
});

const SITUACOES_ENCERRADAS_SQL = sql.raw(
  SITUACOES_ENCERRADAS_SEM_EXITO.map((s) => `'${s}'`).join(", "),
);

/**
 * OS ACEITES REGISTRÁVEIS, em SQL, DERIVADOS do domínio pelo mesmo caminho da linha acima: o CHECK
 * do banco e o valor que o service grava saem da MESMA lista. Digitá-la aqui criaria a segunda
 * lista, que concorda com a primeira por coincidência até a guarda seguinte nascer em uma só.
 */
const ACEITES_SQL = sql.raw(ACEITES_REGISTRAVEIS.map((a) => `'${a}'`).join(", "));

/**
 * A LIGAÇÃO candidato x vaga. Tabela PRÓPRIA, e não um `vaga_id` dentro do candidato, porque a MESMA
 * PESSOA PODE ESTAR EM VÁRIAS VAGAS ao mesmo tempo, que é o normal de quem trabalha com volume.
 *
 * UNIQUE PARCIAL `(candidato_id, vaga_id)` SOBRE AS SITUAÇÕES VIVAS: a mesma pessoa não tem duas
 * candidaturas VIVAS na MESMA vaga. Sem ele, um duplo clique cria duas linhas e a contagem de
 * posições ocupadas passa a mentir, que é exatamente o número que o resto do módulo usa para decidir
 * se ainda cabe alguém. PARCIAL, e não simples, porque candidatura ENCERRADA no passado não é
 * duplicata: é histórico, e a pessoa pode voltar quando a vaga reabrir.
 *
 * A OCUPAÇÃO NÃO MORA AQUI NEM EM LUGAR NENHUM: ela é DERIVADA contando as linhas com situação
 * APROVADO ou ENVIADO_PARA_ADMISSAO. É a mesma decisão que a vaga já tinha tomado com os contadores dela, e
 * pelo mesmo motivo: guardar um contador é ter dois números que discordam.
 */
export const asCandidaturas = pgTable(
  "as_candidaturas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidatoId: uuid("candidato_id")
      .notNull()
      .references(() => asCandidatos.id, { onDelete: "cascade" }),
    /**
     * RESTRICT na vaga, e CASCADE no candidato logo acima, e a assimetria é deliberada: apagar um
     * candidato leva junto as candidaturas dele (é a mesma pessoa saindo do sistema), mas apagar uma
     * vaga que tem gente dentro faria as candidaturas evaporarem em silêncio, junto com a contagem
     * de quem foi aprovado nela.
     */
    vagaId: uuid("vaga_id")
      .notNull()
      .references(() => vagas.id, { onDelete: "restrict" }),
    /**
     * ONDE A PESSOA ESTÁ NO FUNIL. `varchar` + FK para o catálogo, e SEM DEFAULT: quem decide o
     * nascimento é a linha marcada `inicial` em `as_etapas_funil`, lida pelo service e passada
     * explicitamente no INSERT. O `DEFAULT 'CAPTACAO'` daqui foi removido na migration 0100 porque
     * era um SEGUNDO dono da mesma decisão, capaz de apontar para uma etapa inativada em silêncio.
     */
    etapa: varchar("etapa", { length: 40 })
      .notNull()
      .references(() => asEtapasFunil.codigo, { onDelete: "restrict" }),
    situacao: candidaturaSituacaoEnum("situacao").notNull().default("ATIVO"),
    /** Por que saiu. Texto livre: o vocabulário de descarte é da operação e ainda está se formando. */
    motivoDescarte: text("motivo_descarte"),
    /** O id do match no Pandapé, reservado para a onda 4. Unique parcial, como o CPF do candidato. */
    idMatchPandape: varchar("id_match_pandape", { length: 40 }),
    alocadoEm: timestamp("alocado_em", { withTimezone: true }).defaultNow().notNull(),
    alocadoPorId: uuid("alocado_por_id").references(() => usuarios.id, { onDelete: "set null" }),
    /**
     * QUANDO FALAMOS COM ESTA PESSOA PELA ÚLTIMA VEZ, e é PERGUNTA DIFERENTE de `atualizado_em`.
     * `atualizado_em` responde "quando esta candidatura andou" (etapa, situação, saída); esta coluna
     * responde "quando houve contato". Juntar as duas num campo só perderia uma das respostas: uma
     * candidatura movida de etapa hoje, com a última ligação há duas semanas, tem de contar as duas
     * coisas, e é a segunda que diz se a pessoa está esfriando.
     *
     * CARIMBO DESNORMALIZADO, e a razão é a listagem: a alternativa seria um `max(ocorrido_em)` de
     * `as_contatos` por linha, e com 200 linhas na tela isso é uma consulta por linha. O carimbo mata
     * o N+1 e é o motivo de a coluna existir.
     *
     * NASCE NULA, e nula quer dizer "nunca houve contato registrado", que é diferente de zero. Ela é
     * escrita SÓ pelo registro de contato, na MESMA TRANSAÇÃO do insert em `as_contatos`, e SÓ PARA
     * FRENTE: contato retroativo (a ligação de ontem digitada hoje) não puxa o carimbo para trás.
     */
    ultimoContatoEm: timestamp("ultimo_contato_em", { withTimezone: true }),
    /**
     * A PONTE FUTURA COM A ESTEIRA. Nasce NULA e NÃO É USADA nesta onda: nenhuma admissão nasce
     * daqui, nenhuma frente é criada, nada é lido. A coluna existe agora para que, no dia da ponte,
     * a ligação já tenha onde morar. Sem FK de propósito enquanto ninguém a escreve, para a Central
     * de Candidatos não passar a depender do módulo da Admissão antes da hora.
     */
    admissaoId: uuid("admissao_id"),
    /**
     * DE QUAL LADO DA META ESTA POSIÇÃO FOI PREENCHIDA: `OFICIAL` ou `BANCO`.
     *
     * A VAGA SEMPRE TEVE DUAS METAS (`posicoes_oficiais` e `posicoes_banco`), e até a finalização de
     * posição existir ninguém precisava dizer de qual lado uma pessoa entrava: o único jeito de dizer
     * "preenchi" era o número DIGITADO no fechamento, que já vinha separado nos dois campos. Com a
     * finalização, a escolha volta a existir e passa a ser do consultor, uma pessoa por vez.
     *
     * NASCE NULA, E NULA É `OFICIAL` (`ladoDaCandidatura`, no domínio). Não é lacuna: toda
     * candidatura que existe hoje foi aprovada contra a meta OFICIAL, que era a única que a trava
     * conhecia. Coalescer é o que faz a régua nova descrever o que o banco já tem gravado, sem uma
     * carga que reescreva linha nenhuma.
     *
     * ESCRITA SÓ PELA FINALIZAÇÃO DE POSIÇÃO, e por mais nada. A aprovação não escreve (aprovar
     * reserva, não entrega) e o avanço para a esteira também não: quem foi alocado no banco e depois
     * avança MANTÉM o lado dele, senão a passagem para a admissão moveria a pessoa de lado em
     * silêncio e a trava passaria a medi-la contra o teto errado.
     *
     * TEXTO COM CHECK, e não enum novo do Postgres, de propósito: valor criado por `ALTER TYPE ...
     * ADD VALUE` não pode ser usado na mesma transação em que nasce (a armadilha medida na 0095), e
     * o migrador do drizzle roda TODAS as migrations pendentes numa transação só. Um enum aqui
     * amarraria a próxima migration que precisasse citar o valor.
     */
    posicaoLado: text("posicao_lado"),
    criadoEm,
    atualizadoEm,
  },
  (t) => ({
    /** O lado é um dos dois, ou ausente (que vale OFICIAL). Guarda de borda, no banco. */
    ckPosicaoLado: check(
      "ck_as_candidaturas_posicao_lado",
      sql`${t.posicaoLado} is null or ${t.posicaoLado} in ('OFICIAL', 'BANCO')`,
    ),
    /**
     * A TRAVA 3, no banco e não só na tela: duplo clique não vira duas linhas.
     *
     * UNIQUE PARCIAL, RESTRITO ÀS SITUAÇÕES VIVAS, e essa é a correção do ajuste do diretor. Antes
     * era um unique SIMPLES em (candidato, vaga), e ele não sabia distinguir "esta pessoa ESTÁ nesta
     * vaga" de "esta pessoa ESTEVE nesta vaga": quem foi descartado em março não voltava se a vaga
     * reabrisse em agosto. Com o predicado, N linhas ENCERRADAS (`DESCARTADO`, `DESISTIU`) convivem e
     * SÓ UMA VIVA existe por par pessoa/vaga. A duplicata acidental continua barrada pelo banco, que
     * é onde ela precisa ser barrada: a consulta do service perde a corrida entre dois cliques.
     *
     * O PREDICADO É DERIVADO DO DOMÍNIO, e não digitado aqui. Ele diz "viva" PELO COMPLEMENTO, isto
     * é, "tudo que não encerrou sem êxito", que é a mesma definição de `SITUACOES_VIVAS`: escrever a
     * lista à mão criaria a segunda lista que diverge da primeira no dia em que uma situação nova
     * entrar no vocabulário. O porquê do complemento em vez da lista positiva está no bloco de
     * `SITUACOES_ENCERRADAS_SQL`, acima, e ele é o mesmo motivo de fail-closed.
     *
     * UNIQUE PARCIAL NÃO É TÉCNICA NOVA NESTA TABELA: `uq_as_candidatos_cpf` e
     * `uq_as_candidaturas_id_match_pandape` logo abaixo já são assim.
     */
    uqCandidaturaViva: uniqueIndex("uq_as_candidaturas_viva")
      .on(t.candidatoId, t.vagaId)
      .where(sql`${t.situacao} not in (${SITUACOES_ENCERRADAS_SQL})`),
    uqMatchPandape: uniqueIndex("uq_as_candidaturas_id_match_pandape")
      .on(t.idMatchPandape)
      .where(sql`${t.idMatchPandape} is not null`),
    // A CONTAGEM DE OCUPAÇÃO é a consulta mais quente do módulo (ela roda dentro da transação de
    // toda aprovação, com a linha da vaga travada), então o índice é por (vaga, situação).
    idxVagaSituacao: index("idx_as_candidaturas_vaga_situacao").on(t.vagaId, t.situacao),
    idxCandidato: index("idx_as_candidaturas_candidato").on(t.candidatoId),
  }),
);

/**
 * O HISTÓRICO, pendurado na CANDIDATURA e não na pessoa, e isso é decisão de desenho.
 *
 * "Liguei e ele não atendeu" só faz sentido DENTRO de um processo: é sobre aquela vaga, naquela
 * etapa. Pendurado na pessoa, o histórico de três vagas simultâneas vira uma lista embaralhada em
 * que ninguém sabe de qual processo cada linha fala, e o dado perde justamente o que o tornava útil.
 *
 * §A.6: `resumo` é texto do PROCESSO, não da pessoa. Nada aqui é identificador direto.
 */
export const asContatos = pgTable(
  "as_contatos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidaturaId: uuid("candidatura_id")
      .notNull()
      .references(() => asCandidaturas.id, { onDelete: "cascade" }),
    tipo: asContatoTipoEnum("tipo").notNull(),
    resumo: text("resumo").notNull(),
    /**
     * QUANDO ACONTECEU, que é diferente de quando foi digitado (`criado_em`). Ligação de ontem
     * registrada hoje é o caso normal, e achatar as duas datas apagaria a ordem real dos fatos.
     */
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).defaultNow().notNull(),
    registradoPorId: uuid("registrado_por_id").references(() => usuarios.id, {
      onDelete: "set null",
    }),
    criadoEm,
  },
  (t) => ({
    idxCandidatura: index("idx_as_contatos_candidatura").on(t.candidaturaId),
  }),
);

/**
 * O HISTÓRICO DE ETAPAS DA CANDIDATURA (bug 1 da validação do diretor).
 *
 * POR QUE ELA EXISTE. `as_candidaturas.etapa` é UMA coluna que o `moverEtapa` SOBRESCREVE: por onde a
 * pessoa passou nunca ficou registrado, nem para quem está vivo nem para quem saiu. Esta tabela é o
 * que torna a peça P1 honesta: a etapa ATUAL sai da leitura viva do funil (deixa de ser mostrada e
 * deixa de casar no filtro quando a candidatura encerrou), e o CAMINHO fica guardado aqui.
 *
 * ┌─ TRÊS TIPOS DE EVENTO NUMA TABELA SÓ, e o tipo é DERIVADO, nunca guardado ──────────────────┐
 * │   ENTRADA    `etapaDe` nula e `situacao` nula. A candidatura nasceu naquela etapa.           │
 * │   MOVIMENTO  `etapaDe` preenchida, `situacao` nula. Andou de uma etapa para outra.           │
 * │   DESFECHO   `situacao` preenchida. Encerrou (ou foi aprovada) ESTANDO em `etapaPara`.       │
 * │                                                                                              │
 * │ Uma coluna `tipo` seria um TERCEIRO dado podendo discordar dos dois primeiros, e é a mesma    │
 * │ recusa que o módulo já faz ao nunca guardar contador de ocupação (`ocupacaoDaVaga` deriva).   │
 * │ A derivação mora em `domain/candidatura-historico.ts`.                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `etapaPara` É NOT NULL INCLUSIVE NO DESFECHO, e é ele que faz a frase "descartado na Triagem"
 * existir: o desfecho é gravado com a etapa em que a pessoa ESTAVA quando a decisão foi tomada.
 *
 * `motivo` REPETE o `motivoDescarte` da candidatura de propósito. A candidatura guarda o motivo do
 * desfecho ATUAL (um só, sobrescrito numa reentrada); o histórico guarda o motivo DAQUELE evento,
 * que continua verdadeiro depois. §A.6: texto do PROCESSO, mesma natureza do `motivoDescarte` que já
 * existe, e não identificador de pessoa.
 *
 * SET NULL NO AUTOR e CASCADE na candidatura: usuário removido não apaga o evento (o que aconteceu
 * continua tendo acontecido, perde-se só o nome de quem fez), mas o histórico não sobrevive à
 * candidatura, que é a mesma regra do `asContatos` logo acima.
 */
export const asCandidaturaEtapas = pgTable(
  "as_candidatura_etapas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    candidaturaId: uuid("candidatura_id")
      .notNull()
      .references(() => asCandidaturas.id, { onDelete: "cascade" }),
    /** Nula na ENTRADA (a candidatura nasceu ali) e no DESFECHO gravado sem movimento. */
    etapaDe: varchar("etapa_de", { length: 40 }).references(() => asEtapasFunil.codigo, {
      onDelete: "restrict",
    }),
    /** Onde a candidatura ficou, ou onde o desfecho aconteceu. Nunca nula. */
    etapaPara: varchar("etapa_para", { length: 40 })
      .notNull()
      .references(() => asEtapasFunil.codigo, { onDelete: "restrict" }),
    /** Preenchida SÓ no desfecho. É ela que distingue "andou" de "encerrou". */
    situacao: candidaturaSituacaoEnum("situacao"),
    /**
     * A TROCA DE VAGA (item 5 do diretor), o quarto tipo de evento. Preenchidas SÓ quando um Master
     * corrige a vaga da candidatura, mantendo a mesma linha e a mesma etapa.
     *
     * `vagaPara` PREENCHIDA É O QUE MARCA A TROCA, do mesmo jeito que `situacao` marca o desfecho: o
     * tipo continua derivado, nunca guardado.
     *
     * SET NULL nas duas: se a vaga sumir, o EVENTO continua existindo (a troca aconteceu) e perde só
     * o ponteiro. Perder o evento seria pior, e na prática a vaga com candidatura já é protegida
     * pelo RESTRICT em `asCandidaturas.vagaId`.
     */
    vagaDe: uuid("vaga_de").references(() => vagas.id, { onDelete: "set null" }),
    vagaPara: uuid("vaga_para").references(() => vagas.id, { onDelete: "set null" }),
    motivo: text("motivo"),
    porId: uuid("por_id").references(() => usuarios.id, { onDelete: "set null" }),
    /**
     * DE QUAL LADO DA META A POSIÇÃO FOI ENTREGUE NESTE EVENTO: `OFICIAL` ou `BANCO`.
     *
     * ESCRITA SÓ QUANDO O CONSULTOR ESCOLHEU O LADO (a finalização de posição), e nula em todo o
     * resto: entrada, movimento de etapa, troca de vaga e os desfechos que não escolhem lado. Ela é
     * um retrato do EVENTO, e não uma cópia da candidatura: a candidatura diz onde a pessoa está
     * hoje, esta diz o que foi decidido naquele instante, e é a segunda que o log de aceite precisa.
     */
    posicaoLado: text("posicao_lado"),
    /**
     * ─ O LOG DO ACEITE: qual guarda foi DESTRAVADA por decisão explícita (§A.3 regra 8, §A.6) ───
     *
     * O QUE ELA RESOLVE. O aviso do banco (alocar na reserva com posição oficial em aberto) é uma
     * guarda que o consultor pode atravessar confirmando. Até aqui a confirmação vinha no corpo,
     * era LIDA e era JOGADA FORA: a decisão mais cara de desfazer do módulo não deixava rastro
     * nenhum, e três meses depois ninguém saberia que alguém foi para a reserva com cinco vagas
     * oficiais abertas, nem quem decidiu isso.
     *
     * NULA É O NORMAL. Guarda nenhuma foi destravada, e é assim na esmagadora maioria dos eventos.
     * Preenchida quer dizer exatamente uma coisa: alguém confirmou e passou por cima de um aviso.
     *
     * POR QUE AQUI, E NÃO EM UMA TABELA NOVA. O evento que o aceite autorizou JÁ é gravado nesta
     * tabela, na MESMA transação da mudança de situação, e já carrega quem (`por_id`) e quando
     * (`ocorrido_em`). Uma tabela separada admitiria o estado impossível de existir o aceite sem o
     * evento (ou o inverso), e obrigaria a costurar as duas na leitura para responder a pergunta
     * mais simples que existe aqui: "o que foi decidido, por quem, e o que ele estava vendo".
     *
     * §A.6, E O RECORTE É FIRME: um nome de guarda, um lado e um número. Nenhum dado de candidato,
     * nenhum CPF, nenhum nome de pessoa, nenhuma URL. Quem é o autor sai do `por_id`, que é usuário
     * INTERNO, exatamente o mesmo recorte do aceite de dupla correção da INT-4.
     */
    aceite: text("aceite"),
    /**
     * O ESTADO NO INSTANTE DA DECISÃO, em um número: para o aviso do banco, QUANTAS POSIÇÕES
     * OFICIAIS ESTAVAM ABERTAS quando o consultor confirmou.
     *
     * SEM ELE O LOG NÃO SERVE PARA NADA. "Confirmou o aviso" não é auditável: confirmar com UMA
     * posição oficial aberta e confirmar com CINCO são decisões diferentes, e é o número que
     * distingue as duas. É a mesma razão de o próprio aviso levar o número para a tela, em vez de
     * perguntar "tem certeza?".
     */
    aceiteNumero: integer("aceite_numero"),
    /**
     * ─ O MARCADOR ESTRUTURAL DA SAÍDA POR CANCELAMENTO DE VAGA (reabertura) ────────────────────
     *
     * QUAL MOVIMENTO DA VAGA CAUSOU ESTA SAÍDA. Preenchida SÓ quando o cancelamento da vaga
     * encerrou a candidatura junto, e nula em todo o resto (entrada, movimento, troca de vaga e
     * toda saída registrada por gente).
     *
     * ┌─ POR QUE UM PONTEIRO, E NÃO O TEXTO DO MOTIVO ────────────────────────────────────────┐
     * │ Antes desta coluna, o único sinal de que a saída veio de um cancelamento era a frase    │
     * │ "Vaga cancelada: X" em `motivo`, e esse campo é DIGITÁVEL À MÃO por qualquer consultor  │
     * │ (o DTO da saída pede dois caracteres). Casar por texto na hora de reabrir ressuscitaria │
     * │ quem a SELEÇÃO descartou de propósito, e seria atalho para pular a ciência de reentrada.│
     * │                                                                                        │
     * │ E O TEXTO NÃO SEPARA DOIS CANCELAMENTOS DA MESMA VAGA: cancelar, reabrir sem trazer     │
     * │ ninguém, realocar a mesma pessoa e cancelar de novo deixa DUAS saídas com o MESMO texto,│
     * │ e reativar as duas violaria o unique parcial das vivas, derrubando a transação. Com o   │
     * │ id do evento, cada cancelamento tem o seu conjunto.                                     │
     * └────────────────────────────────────────────────────────────────────────────────────────┘
     */
    vagaStatusEventoId: uuid("vaga_status_evento_id").references(() => asVagaStatusEventos.id, {
      onDelete: "set null",
    }),
    /**
     * EM QUE SITUAÇÃO A PESSOA ESTAVA quando esta saída a encerrou, e é o que a reabertura precisa
     * para devolvê-la ao lugar de onde ela veio (`ATIVO` volta em seleção, `ALOCADO` volta alocado).
     *
     * ELA NÃO É DEDUZÍVEL DA LINHA, e a heurística óbvia é FALSA: existe candidatura `ATIVO` com
     * `posicao_lado` preenchido na base agora, porque o `reverterEnvioParaAdmissao` devolve a pessoa
     * para `ATIVO` sem limpar o lado, de propósito. Chutar por ali devolveria à vaga uma ENTREGA que
     * nunca houve.
     */
    situacaoOrigem: candidaturaSituacaoEnum("situacao_origem"),
    /**
     * DE QUE LADO ELA OCUPAVA POSIÇÃO, quando ocupava. NULA quer dizer "não ocupava posição
     * nenhuma", que é diferente de "ocupava a oficial": coalescer o nulo para OFICIAL na volta
     * encheria o cilindro oficial da vaga com quem estava só em seleção.
     */
    posicaoLadoOrigem: text("posicao_lado_origem"),
    /**
     * QUANDO ACONTECEU. Separado de `criadoEm` pela mesma razão do `asContatos`: são perguntas
     * diferentes, e a semente do backfill grava aqui o `alocado_em` da candidatura, que é passado.
     */
    ocorridoEm: timestamp("ocorrido_em", { withTimezone: true }).defaultNow().notNull(),
    criadoEm,
  },
  (t) => ({
    /** (candidatura, quando): é exatamente a consulta que a linha do tempo da ficha faz. */
    idxCandidatura: index("idx_as_candidatura_etapas_candidatura").on(t.candidaturaId, t.ocorridoEm),
    /** O lado é um dos dois, ou ausente. Mesma guarda de borda da coluna irmã na candidatura. */
    ckPosicaoLado: check(
      "ck_as_candidatura_etapas_posicao_lado",
      sql`${t.posicaoLado} is null or ${t.posicaoLado} in ('OFICIAL', 'BANCO')`,
    ),
    /**
     * O ACEITE É UM DOS NOMES CONHECIDOS, ou ausente. Lista fechada de propósito: log de auditoria
     * com valor livre vira texto que ninguém consegue consultar depois, e a pergunta "quantas vezes
     * a guarda do banco foi destravada" precisa de um `where` exato.
     *
     * `REENTRADA` JÁ ESTÁ PREVISTA E AINDA NÃO É ESCRITA: o outro aceite do módulo vive na `alocar`,
     * que é código validado e fora do recorte desta OST. O valor fica aqui para que ligar aquele
     * registro seja uma linha de service, e não uma migration na frente do diretor.
     */
    ckAceite: check(
      "ck_as_candidatura_etapas_aceite",
      sql`${t.aceite} is null or ${t.aceite} in (${ACEITES_SQL})`,
    ),
    /**
     * ÍNDICE PARCIAL SOBRE OS ACEITES, e é ele que faz o log ser CONSULTÁVEL como a §A.3 regra 8
     * exige, e não só gravado: a pergunta é sempre "onde houve aceite", nunca "todos os eventos".
     * Parcial porque a coluna é nula na esmagadora maioria das linhas, e um índice cheio de nulos
     * custaria escrita em todo movimento de etapa para responder sobre a minoria.
     */
    idxAceite: index("idx_as_candidatura_etapas_aceite")
      .on(t.aceite, t.ocorridoEm)
      .where(sql`${t.aceite} is not null`),
    /** O lado de ORIGEM é um dos dois, ou ausente. Mesma guarda de borda das colunas irmãs. */
    ckPosicaoLadoOrigem: check(
      "ck_as_candidatura_etapas_posicao_lado_origem",
      sql`${t.posicaoLadoOrigem} is null or ${t.posicaoLadoOrigem} in ('OFICIAL', 'BANCO')`,
    ),
    /**
     * ÍNDICE PARCIAL SOBRE O MARCADOR DO CANCELAMENTO, pela mesma razão do índice do aceite: a
     * pergunta é sempre "quem saiu NESTE cancelamento", nunca "todos os eventos", e a coluna é nula
     * na esmagadora maioria das linhas.
     */
    idxVagaStatusEvento: index("idx_as_candidatura_etapas_vaga_status_evento")
      .on(t.vagaStatusEventoId)
      .where(sql`${t.vagaStatusEventoId} is not null`),
  }),
);
