CREATE TABLE IF NOT EXISTS "grupo_cliente_cargo_meta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grupo_id" uuid NOT NULL,
	"cargo_id" uuid NOT NULL,
	"meta" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupo_cliente_cargo_meta_grupo_id_grupos_cliente_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_cliente"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "grupo_cliente_cargo_meta_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_grupo_cliente_cargo_meta" ON "grupo_cliente_cargo_meta" ("grupo_id","cargo_id");
