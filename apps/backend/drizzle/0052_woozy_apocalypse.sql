CREATE TABLE "exame_agendamento_endereco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agendamento_id" uuid NOT NULL,
	"ordem" integer DEFAULT 1 NOT NULL,
	"clinica_id" uuid,
	"nome_clinica" varchar(200),
	"local" text,
	"horario" varchar(5),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_agendamento_endereco_ordem" UNIQUE("agendamento_id","ordem")
);
--> statement-breakpoint
ALTER TABLE "exame_agendamento_endereco" ADD CONSTRAINT "exame_agendamento_endereco_agendamento_id_exame_agendamento_id_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."exame_agendamento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exame_agendamento_endereco" ADD CONSTRAINT "exame_agendamento_endereco_clinica_id_clinicas_catalogo_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas_catalogo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- MIGRAÇÃO DOS AGENDAMENTOS EXISTENTES (OST Onda 2, multi-endereço): cada agendamento que já existe
-- vira a PRIMEIRA linha da tabela filha, com a clínica, o endereço e o horário que ele já tinha.
-- Sem isto, todo agendamento cadastrado até hoje apareceria sem endereço nenhum na tela nova.
-- Idempotente: só insere para agendamento que ainda não tem linha filha.
INSERT INTO "exame_agendamento_endereco"
  ("agendamento_id", "ordem", "clinica_id", "nome_clinica", "local", "horario")
SELECT a."id", 1, a."clinica_id", a."nome_clinica", a."local", a."horario"
FROM "exame_agendamento" a
WHERE NOT EXISTS (
  SELECT 1 FROM "exame_agendamento_endereco" e WHERE e."agendamento_id" = a."id"
);
