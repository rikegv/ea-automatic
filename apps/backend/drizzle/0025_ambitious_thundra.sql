CREATE TYPE "public"."status_cadastro_beneficio" AS ENUM('PENDENTE', 'CADASTRADO');--> statement-breakpoint
CREATE TABLE "admissao_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"beneficio_id" uuid NOT NULL,
	"valor" numeric(12, 2),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_admissao_beneficio" UNIQUE("admissao_id","beneficio_id")
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "status_cadastro_beneficio" "status_cadastro_beneficio" DEFAULT 'PENDENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "admissao_beneficio" ADD CONSTRAINT "admissao_beneficio_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissao_beneficio" ADD CONSTRAINT "admissao_beneficio_beneficio_id_beneficios_catalogo_id_fk" FOREIGN KEY ("beneficio_id") REFERENCES "public"."beneficios_catalogo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admissao_beneficio_admissao" ON "admissao_beneficio" USING btree ("admissao_id");