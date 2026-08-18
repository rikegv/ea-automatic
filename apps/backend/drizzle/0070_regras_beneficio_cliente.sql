CREATE TABLE "cliente_beneficio_regra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" text NOT NULL,
	"beneficio" varchar(10) NOT NULL,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cliente_beneficio_regra" ADD CONSTRAINT "cliente_beneficio_regra_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cliente_beneficio_regra" ON "cliente_beneficio_regra" USING btree ("cod_cliente","beneficio");