ALTER TABLE "admissoes" ADD COLUMN "pausada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "pausada_por" uuid;--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "pausa_motivo" text;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_pausada_por_usuarios_id_fk" FOREIGN KEY ("pausada_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;