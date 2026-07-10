CREATE TABLE "cliente_beneficio_padrao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" text NOT NULL,
	"beneficio" varchar(10) NOT NULL,
	"valor" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cliente_beneficio_padrao" UNIQUE("cod_cliente","beneficio")
);
--> statement-breakpoint
ALTER TABLE "cliente_beneficio_padrao" ADD CONSTRAINT "cliente_beneficio_padrao_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;