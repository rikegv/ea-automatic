CREATE TABLE "kit_tipo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kit_tipo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "kit_regra_documento" DROP CONSTRAINT "kit_regra_documento_titulo_unique";--> statement-breakpoint
ALTER TABLE "kit_regra_documento" ADD COLUMN "kit_tipo_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "kit_regra_documento" ADD CONSTRAINT "kit_regra_documento_kit_tipo_id_kit_tipo_id_fk" FOREIGN KEY ("kit_tipo_id") REFERENCES "public"."kit_tipo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kit_regra_documento" ADD CONSTRAINT "uq_kit_documento_titulo" UNIQUE("kit_tipo_id","titulo");