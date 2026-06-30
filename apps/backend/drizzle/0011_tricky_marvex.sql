CREATE TYPE "public"."origem" AS ENUM('MANUAL', 'PANDAPE');--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "origem" "origem" DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "integracao_pandape" ADD CONSTRAINT "uq_integracao_pandape_precollab" UNIQUE("id_precollaborator");