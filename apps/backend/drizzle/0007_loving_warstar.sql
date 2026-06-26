CREATE TABLE "passagem_aceites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	"tipo" "frente_tipo" NOT NULL,
	"de_status" varchar(40),
	"para_status" varchar(40),
	"campos_pendentes" text,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passagem_aceites" ADD CONSTRAINT "passagem_aceites_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passagem_aceites" ADD CONSTRAINT "passagem_aceites_frente_id_frentes_admissao_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_admissao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passagem_aceites" ADD CONSTRAINT "passagem_aceites_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;