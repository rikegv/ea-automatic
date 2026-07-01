ALTER TABLE "candidato_alteracoes_log" DROP CONSTRAINT "candidato_alteracoes_log_admissao_id_admissoes_id_fk";
--> statement-breakpoint
ALTER TABLE "candidato_alteracoes_log" ALTER COLUMN "admissao_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidato_alteracoes_log" ADD CONSTRAINT "candidato_alteracoes_log_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE set null ON UPDATE no action;