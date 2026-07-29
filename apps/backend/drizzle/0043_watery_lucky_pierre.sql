ALTER TYPE "public"."clicksign_status" ADD VALUE 'EXPIRADO';--> statement-breakpoint
CREATE TABLE "clicksign_scheduler_estado" (
	"chave" varchar(20) PRIMARY KEY DEFAULT 'clicksign' NOT NULL,
	"ligado" boolean DEFAULT true NOT NULL,
	"ultimo_ciclo_em" timestamp with time zone,
	"ultimo_ciclo_ok_em" timestamp with time zone,
	"ultimo_ciclo_varridas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_assinados" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_expirados" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_falhas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_nota" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "clicksign_enviado_em" timestamp with time zone;