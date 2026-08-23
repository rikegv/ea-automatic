CREATE TABLE "vaga_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaga_id" uuid NOT NULL,
	"beneficio_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_vaga_beneficio" UNIQUE("vaga_id","beneficio_id")
);
--> statement-breakpoint
ALTER TABLE "vagas" DROP CONSTRAINT "ck_vagas_limite_sazonal";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "salario_abertura" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "salario_fechamento" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vaga_beneficio" ADD CONSTRAINT "vaga_beneficio_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga_beneficio" ADD CONSTRAINT "vaga_beneficio_beneficio_id_beneficios_catalogo_id_fk" FOREIGN KEY ("beneficio_id") REFERENCES "public"."beneficios_catalogo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vaga_beneficio_vaga" ON "vaga_beneficio" USING btree ("vaga_id");