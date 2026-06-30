-- Fase 4 complemento — farol global (renomeia valores, sem recriar o enum p/ preservar dados) + is_banco.
-- ATIVO → EM_ADMISSAO; BANCO_PAUSADA → BANCO_AGUARDAR (rename migra as linhas existentes);
-- adiciona ADMISSAO_CONCLUIDA; novo default EM_ADMISSAO; coluna admissoes.is_banco.
ALTER TYPE "public"."farol_global" RENAME VALUE 'ATIVO' TO 'EM_ADMISSAO';--> statement-breakpoint
ALTER TYPE "public"."farol_global" RENAME VALUE 'BANCO_PAUSADA' TO 'BANCO_AGUARDAR';--> statement-breakpoint
ALTER TYPE "public"."farol_global" ADD VALUE IF NOT EXISTS 'ADMISSAO_CONCLUIDA';--> statement-breakpoint
ALTER TABLE "admissoes" ALTER COLUMN "farol_global" SET DEFAULT 'EM_ADMISSAO';--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "is_banco" boolean DEFAULT false NOT NULL;
