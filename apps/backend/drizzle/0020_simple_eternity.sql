CREATE TYPE "public"."sexo" AS ENUM('MASCULINO', 'FEMININO');--> statement-breakpoint
ALTER TABLE "candidatos" ADD COLUMN "sexo" "sexo";