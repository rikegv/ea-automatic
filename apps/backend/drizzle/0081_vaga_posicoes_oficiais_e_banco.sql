ALTER TABLE "vagas" RENAME COLUMN "posicoes" TO "posicoes_oficiais";--> statement-breakpoint
ALTER TABLE "vagas" DROP CONSTRAINT "ck_vagas_posicoes";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "posicoes_banco" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "vagas_fechadas_banco" integer;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_posicoes_oficiais" CHECK ("vagas"."posicoes_oficiais" > 0);--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_posicoes_banco" CHECK ("vagas"."posicoes_banco" >= 0);