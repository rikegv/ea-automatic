CREATE TYPE "public"."nc_liberacao" AS ENUM('NENHUMA', 'PENDENTE', 'APROVADA', 'REPROVADA');--> statement-breakpoint
CREATE TYPE "public"."nc_status" AS ENUM('ABERTA', 'RESOLVIDA');--> statement-breakpoint
CREATE TYPE "public"."nc_tipo" AS ENUM('NC1', 'NC2', 'NC3');--> statement-breakpoint
CREATE TABLE "nao_conformidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo" "nc_tipo" NOT NULL,
	"consultor_id" uuid,
	"status" "nc_status" DEFAULT 'ABERTA' NOT NULL,
	"detalhe" text,
	"aceite_termo" text,
	"flag_sem_kit" boolean DEFAULT false NOT NULL,
	"flag_sem_assinatura" boolean DEFAULT false NOT NULL,
	"flag_cadastro_nao_marcado" boolean DEFAULT false NOT NULL,
	"liberacao_status" "nc_liberacao" DEFAULT 'NENHUMA' NOT NULL,
	"liberacao_motivo" text,
	"liberacao_solicitante_id" uuid,
	"liberacao_aprovador_id" uuid,
	"liberacao_decidido_em" timestamp with time zone,
	"resolvido_por" uuid,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nao_conformidades_admissao_id_tipo_unique" UNIQUE("admissao_id","tipo")
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "consultor_id" uuid;--> statement-breakpoint
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_consultor_id_usuarios_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_liberacao_solicitante_id_usuarios_id_fk" FOREIGN KEY ("liberacao_solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_liberacao_aprovador_id_usuarios_id_fk" FOREIGN KEY ("liberacao_aprovador_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nao_conformidades" ADD CONSTRAINT "nao_conformidades_resolvido_por_usuarios_id_fk" FOREIGN KEY ("resolvido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_consultor_id_usuarios_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;