CREATE TYPE "public"."tipo_integracao" AS ENUM('ONLINE', 'PRESENCIAL');--> statement-breakpoint
ALTER TYPE "public"."frente_tipo" ADD VALUE 'INTEGRACAO';--> statement-breakpoint
CREATE TABLE "integracao_agendamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"data" date,
	"horario" varchar(5),
	"tipo" "tipo_integracao",
	"consultor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integracao_agendamento_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
ALTER TABLE "integracao_agendamento" ADD CONSTRAINT "integracao_agendamento_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao_agendamento" ADD CONSTRAINT "integracao_agendamento_consultor_id_usuarios_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;