CREATE TYPE "public"."fornecedor_exame" AS ENUM('MEDICAL', 'LIMER');--> statement-breakpoint
CREATE TABLE "exame_agendamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"data" date,
	"horario" varchar(5),
	"nome_clinica" varchar(200),
	"local" text,
	"fornecedor" "fornecedor_exame",
	"reagendamentos" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exame_agendamento_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "aso_validado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "exame_agendamento" ADD CONSTRAINT "exame_agendamento_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;