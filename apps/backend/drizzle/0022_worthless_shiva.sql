CREATE TABLE "motivos_declinio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(160) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motivos_declinio_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "motivo_declinio_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_motivo_declinio_id_motivos_declinio_id_fk" FOREIGN KEY ("motivo_declinio_id") REFERENCES "public"."motivos_declinio"("id") ON DELETE set null ON UPDATE no action;