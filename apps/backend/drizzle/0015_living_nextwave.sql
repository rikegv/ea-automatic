CREATE TYPE "public"."tipo_servico" AS ENUM('TEMPORARIO', 'TERCEIRO', 'ESTAGIO', 'INTERNO', 'FOPAG');--> statement-breakpoint
CREATE TABLE "cliente_vinculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" varchar(40) NOT NULL,
	"empresa_codigo" varchar(10) NOT NULL,
	"tipo_servico" "tipo_servico" NOT NULL,
	"filial" varchar(20),
	"is_fopag" boolean DEFAULT false NOT NULL,
	"entidade_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cliente_vinculo" UNIQUE("cod_cliente","empresa_codigo","filial")
);
--> statement-breakpoint
CREATE TABLE "entidade_filiais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entidade_id" uuid NOT NULL,
	"filial" varchar(20) NOT NULL,
	"cnpj" varchar(18),
	"nome_filial" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_entidade_filial" UNIQUE("entidade_id","filial")
);
--> statement-breakpoint
CREATE TABLE "entidades_soulan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"cnpj_raiz" varchar(8),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "cliente_vinculo_id" uuid;--> statement-breakpoint
ALTER TABLE "cliente_vinculos" ADD CONSTRAINT "cliente_vinculos_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_vinculos" ADD CONSTRAINT "cliente_vinculos_entidade_id_entidades_soulan_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades_soulan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entidade_filiais" ADD CONSTRAINT "entidade_filiais_entidade_id_entidades_soulan_id_fk" FOREIGN KEY ("entidade_id") REFERENCES "public"."entidades_soulan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cliente_vinculos_cliente" ON "cliente_vinculos" USING btree ("cod_cliente");--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_cliente_vinculo_id_cliente_vinculos_id_fk" FOREIGN KEY ("cliente_vinculo_id") REFERENCES "public"."cliente_vinculos"("id") ON DELETE set null ON UPDATE no action;