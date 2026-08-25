ALTER TYPE "public"."vaga_status" ADD VALUE 'RASCUNHO' BEFORE 'ABERTA';--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "codigo" DROP NOT NULL;