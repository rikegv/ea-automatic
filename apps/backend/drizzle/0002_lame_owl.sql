CREATE TABLE "frente_status_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"frente_id" uuid NOT NULL,
	"tipo" "frente_tipo" NOT NULL,
	"de_status" varchar(40),
	"para_status" varchar(40),
	"reversao" boolean DEFAULT false NOT NULL,
	"autor_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frente_status_eventos" ADD CONSTRAINT "frente_status_eventos_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frente_status_eventos" ADD CONSTRAINT "frente_status_eventos_frente_id_frentes_admissao_id_fk" FOREIGN KEY ("frente_id") REFERENCES "public"."frentes_admissao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frente_status_eventos" ADD CONSTRAINT "frente_status_eventos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;