CREATE TABLE "vt_coleta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"md5" text NOT NULL,
	"origem" text NOT NULL,
	"admissao_id" uuid,
	"status" text NOT NULL,
	"vt_na_regua" boolean,
	"arquivado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_vt_coleta_md5_origem" UNIQUE("md5","origem")
);
--> statement-breakpoint
CREATE TABLE "vt_coleta_scheduler_estado" (
	"chave" varchar(20) PRIMARY KEY DEFAULT 'vt-coleta' NOT NULL,
	"ligado" boolean DEFAULT true NOT NULL,
	"ultimo_ciclo_em" timestamp with time zone,
	"ultimo_ciclo_ok_em" timestamp with time zone,
	"ultimo_ciclo_varridas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_novos" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_sem_admissao" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_falhas" integer DEFAULT 0 NOT NULL,
	"ultimo_ciclo_abortado" boolean DEFAULT false NOT NULL,
	"ultimo_ciclo_nota" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vt_coleta" ADD CONSTRAINT "vt_coleta_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE set null ON UPDATE no action;
