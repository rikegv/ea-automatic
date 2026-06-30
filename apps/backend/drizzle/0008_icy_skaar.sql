CREATE TABLE "regras_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"descricao_regra" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "drive_pasta_url" text;--> statement-breakpoint
ALTER TABLE "regras_auditoria" ADD CONSTRAINT "regras_auditoria_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE cascade ON UPDATE no action;