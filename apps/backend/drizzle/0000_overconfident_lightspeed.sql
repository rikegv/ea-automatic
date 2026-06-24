CREATE TYPE "public"."estado_documento" AS ENUM('PENDENTE', 'ENTREGUE', 'INCONFORME');--> statement-breakpoint
CREATE TYPE "public"."exigencia_documento" AS ENUM('OBRIGATORIO', 'NAO_OBRIGATORIO', 'FACULTATIVO');--> statement-breakpoint
CREATE TYPE "public"."farol_global" AS ENUM('ATIVO', 'DECLINOU', 'RESCISAO', 'BANCO_PAUSADA');--> statement-breakpoint
CREATE TYPE "public"."frente_tipo" AS ENUM('AUDITORIA', 'EXAME', 'CADASTRO_CONTRATO');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('COMUM', 'MASTER', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."sinalizador_preenchimento" AS ENUM('PENDENTE', 'PARCIAL', 'OK', 'INCONFORMIDADE', 'COMPETENCIAS');--> statement-breakpoint
CREATE TABLE "admissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidato_cpf" varchar(11) NOT NULL,
	"cod_cliente" varchar(40) NOT NULL,
	"cargo_id" uuid NOT NULL,
	"tipo_contrato" varchar(60),
	"matricula" varchar(60),
	"data_admissao" date,
	"farol_global" "farol_global" DEFAULT 'ATIVO' NOT NULL,
	"sinalizador_preenchimento" "sinalizador_preenchimento" DEFAULT 'PENDENTE' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidatos" (
	"cpf" varchar(11) PRIMARY KEY NOT NULL,
	"nome" varchar(200) NOT NULL,
	"email" varchar(180),
	"telefone" varchar(30),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cargos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(160) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cargos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"cod_cliente" varchar(40) PRIMARY KEY NOT NULL,
	"cnpj" varchar(18),
	"razao_social" varchar(200) NOT NULL,
	"nome_operacao" varchar(200),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dados_vaga_folha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"salario" numeric(12, 2),
	"beneficios" text,
	"escala" varchar(80),
	"centro_custo" varchar(80),
	"departamento" varchar(120),
	"gestor_bp" varchar(160),
	"motivo" varchar(200),
	"tempo_contrato" varchar(80),
	CONSTRAINT "dados_vaga_folha_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
CREATE TABLE "documentos_admissao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"estado" "estado_documento" DEFAULT 'PENDENTE' NOT NULL,
	"observacao" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_admissao_admissao_id_tipo_documento_id_unique" UNIQUE("admissao_id","tipo_documento_id")
);
--> statement-breakpoint
CREATE TABLE "frente_status_catalogo" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "frente_tipo" NOT NULL,
	"codigo" varchar(40) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	"conclui" boolean DEFAULT false NOT NULL,
	CONSTRAINT "frente_status_catalogo_tipo_codigo_unique" UNIQUE("tipo","codigo")
);
--> statement-breakpoint
CREATE TABLE "frentes_admissao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo" "frente_tipo" NOT NULL,
	"status" varchar(40) NOT NULL,
	"responsavel_id" uuid,
	"data_inicio" timestamp with time zone,
	"data_conclusao" timestamp with time zone,
	"concluida" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frentes_admissao_admissao_id_tipo_unique" UNIQUE("admissao_id","tipo")
);
--> statement-breakpoint
CREATE TABLE "integracao_pandape" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"id_precollaborator" varchar(80),
	"id_match" varchar(80),
	"id_vacancy" varchar(80),
	"etapa" varchar(120),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integracao_pandape_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
CREATE TABLE "regua_documental" (
	"cod_cliente" varchar(40) NOT NULL,
	"cargo_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"exigencia" "exigencia_documento" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regua_documental_cod_cliente_cargo_id_tipo_documento_id_pk" PRIMARY KEY("cod_cliente","cargo_id","tipo_documento_id")
);
--> statement-breakpoint
CREATE TABLE "tipos_documento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(60) NOT NULL,
	"nome" varchar(200) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tipos_documento_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(160) NOT NULL,
	"email" varchar(180) NOT NULL,
	"senha_hash" text NOT NULL,
	"papel" "papel" DEFAULT 'COMUM' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_candidato_cpf_candidatos_cpf_fk" FOREIGN KEY ("candidato_cpf") REFERENCES "public"."candidatos"("cpf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD CONSTRAINT "dados_vaga_folha_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_admissao" ADD CONSTRAINT "documentos_admissao_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_admissao" ADD CONSTRAINT "documentos_admissao_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frentes_admissao" ADD CONSTRAINT "frentes_admissao_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frentes_admissao" ADD CONSTRAINT "frentes_admissao_responsavel_id_usuarios_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao_pandape" ADD CONSTRAINT "integracao_pandape_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD CONSTRAINT "regua_documental_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD CONSTRAINT "regua_documental_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regua_documental" ADD CONSTRAINT "regua_documental_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE cascade ON UPDATE no action;