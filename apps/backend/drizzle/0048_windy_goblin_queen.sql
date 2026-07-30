CREATE TABLE "exame_scheduler_estado" (
	"chave" varchar(20) PRIMARY KEY DEFAULT 'exame' NOT NULL,
	"ligado" boolean DEFAULT true NOT NULL,
	"ultimo_ciclo_em" timestamp with time zone,
	"ultimo_ciclo_ok_em" timestamp with time zone,
	"ultimo_ciclo_varridas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_aguardando" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_pendentes" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_falhas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_nota" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dados_vaga_folha" ADD COLUMN "setor" varchar(120);--> statement-breakpoint
-- Status novos da frente EXAME (OST Onda 2). Nenhum dos dois CONCLUI a frente: eles descrevem a
-- espera entre o exame e o ASO, que antes ficava escondida dentro de "Agendado". O APTO segue
-- intocado como o único concluinte (decisão do diretor). Ordem 5.1 e 5.2 em inteiro: entram ENTRE
-- Agendado (5) e Apto (6) reordenando o Apto/Cancelado para abrir espaço.
UPDATE "frente_status_catalogo" SET "ordem" = 8 WHERE "tipo" = 'EXAME' AND "codigo" = 'APTO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 9 WHERE "tipo" = 'EXAME' AND "codigo" = 'CANCELADO';--> statement-breakpoint
INSERT INTO "frente_status_catalogo" ("tipo","codigo","rotulo","ordem","conclui")
VALUES ('EXAME','AGUARDANDO_ASO','Aguardando Liberação Do ASO',6,false)
ON CONFLICT ("tipo","codigo") DO NOTHING;--> statement-breakpoint
INSERT INTO "frente_status_catalogo" ("tipo","codigo","rotulo","ordem","conclui")
VALUES ('EXAME','ASO_PENDENTE','ASO Pendente',7,false)
ON CONFLICT ("tipo","codigo") DO NOTHING;
