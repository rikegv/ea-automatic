CREATE TABLE "clinicas_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinicas_catalogo_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "exame_agendamento" ADD COLUMN "clinica_id" uuid;--> statement-breakpoint
ALTER TABLE "exame_agendamento" ADD CONSTRAINT "exame_agendamento_clinica_id_clinicas_catalogo_id_fk" FOREIGN KEY ("clinica_id") REFERENCES "public"."clinicas_catalogo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- MIGRAÇÃO DOS AGENDAMENTOS EXISTENTES (OST Onda 2, item 4): cada nome de clínica já digitado vira
-- uma linha do catálogo, e o agendamento passa a apontar para ela. Sem isto, os agendamentos que já
-- existem ficariam com o seletor vazio e o consultor teria de reescolher um a um.
INSERT INTO "clinicas_catalogo" ("nome")
SELECT DISTINCT btrim("nome_clinica") FROM "exame_agendamento"
WHERE "nome_clinica" IS NOT NULL AND btrim("nome_clinica") <> ''
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint
UPDATE "exame_agendamento" a SET "clinica_id" = c."id"
FROM "clinicas_catalogo" c
WHERE a."clinica_id" IS NULL AND btrim(a."nome_clinica") = c."nome";
