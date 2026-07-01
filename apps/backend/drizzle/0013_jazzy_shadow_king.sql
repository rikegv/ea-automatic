CREATE TABLE "candidato_alteracoes_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"campo" varchar(60) NOT NULL,
	"valor_anterior" text,
	"valor_novo" text,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "senha_temporaria" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "candidato_alteracoes_log" ADD CONSTRAINT "candidato_alteracoes_log_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidato_alteracoes_log" ADD CONSTRAINT "candidato_alteracoes_log_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_candidato_alteracoes_log_admissao" ON "candidato_alteracoes_log" USING btree ("admissao_id");