CREATE TYPE "public"."periodicidade_beneficio" AS ENUM('CADA_5_DIAS', 'CADA_15_DIAS', 'MENSAL');--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "periodicidade_beneficio" "periodicidade_beneficio";--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "dia_pagamento_beneficio" smallint;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "dias_primeiro_credito" smallint;