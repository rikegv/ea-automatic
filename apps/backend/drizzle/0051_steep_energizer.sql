CREATE TABLE "cliente_pendencia_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" varchar(40) NOT NULL,
	"chave" varchar(40) NOT NULL,
	"obrigatorio" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cliente_pendencia" UNIQUE("cod_cliente","chave")
);
--> statement-breakpoint
ALTER TABLE "cliente_pendencia_config" ADD CONSTRAINT "cliente_pendencia_config_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;