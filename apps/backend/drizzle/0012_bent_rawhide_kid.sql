CREATE TYPE "public"."clicksign_status" AS ENUM('SEM_ENVELOPE', 'AGUARDANDO_ASSINATURA', 'ASSINADO', 'CANCELADO');--> statement-breakpoint
CREATE TABLE "dupla_correcao_aceites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"termo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "clicksign_envelope_id" varchar(80);--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "clicksign_status" "clicksign_status" DEFAULT 'SEM_ENVELOPE' NOT NULL;--> statement-breakpoint
ALTER TABLE "admissoes" ADD COLUMN "contrato_assinado_drive_url" text;--> statement-breakpoint
ALTER TABLE "dupla_correcao_aceites" ADD CONSTRAINT "dupla_correcao_aceites_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dupla_correcao_aceites" ADD CONSTRAINT "dupla_correcao_aceites_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dupla_correcao_aceites_admissao" ON "dupla_correcao_aceites" USING btree ("admissao_id");