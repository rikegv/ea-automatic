CREATE TABLE "pandape_scheduler_estado" (
	"chave" varchar(20) PRIMARY KEY DEFAULT 'pandape' NOT NULL,
	"ligado" boolean DEFAULT true NOT NULL,
	"ultimo_ciclo_em" timestamp with time zone,
	"ultimo_ciclo_ok_em" timestamp with time zone,
	"ultimo_ciclo_varridas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_novos" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_falhas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_abortado" boolean DEFAULT false NOT NULL,
	"ultimo_ciclo_nota" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
