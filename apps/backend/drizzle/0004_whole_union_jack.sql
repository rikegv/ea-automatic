CREATE TABLE "beneficios_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(160) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beneficios_catalogo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "escalas_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "escalas_catalogo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "motivos_contratacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motivos_contratacao_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "candidatos" ADD COLUMN "data_nascimento" date;--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "substituido_nome" varchar(200);--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "substituido_cpf" varchar(11);--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "substituicao_expurgar_em" timestamp with time zone;