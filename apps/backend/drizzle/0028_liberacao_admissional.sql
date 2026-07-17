-- Liberação Admissional (Parte 1): novo farol AGUARDANDO_LIBERACAO (pré-admissão do Pandapé, sem
-- cliente/cargo até a liberação manual) + cod_cliente/cargo_id NULÁVEIS (1ª vez que podem ser nulos).
ALTER TYPE "public"."farol_global" ADD VALUE IF NOT EXISTS 'AGUARDANDO_LIBERACAO';--> statement-breakpoint
ALTER TABLE "admissoes" ALTER COLUMN "cod_cliente" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "admissoes" ALTER COLUMN "cargo_id" DROP NOT NULL;
