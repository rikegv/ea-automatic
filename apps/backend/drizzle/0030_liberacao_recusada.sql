-- Liberação Admissional Parte 2 (recusa): novo farol LIBERACAO_RECUSADA (terminal, reversível) +
-- recusado_por_id/recusado_em (quem recusou + quando, SEM motivo). Trilha permanente no candidato_alteracoes_log.
ALTER TYPE "public"."farol_global" ADD VALUE IF NOT EXISTS 'LIBERACAO_RECUSADA';--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "recusado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "recusado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_recusado_por_id_usuarios_id_fk" FOREIGN KEY ("recusado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;