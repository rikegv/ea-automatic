CREATE TABLE "assinante_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" varchar(40),
	"nome" varchar(200) NOT NULL,
	"email" varchar(180) NOT NULL,
	"cpf" varchar(11) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinante_empresa" ADD CONSTRAINT "assinante_empresa_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_cliente" ON "assinante_empresa" USING btree ("cod_cliente") WHERE "assinante_empresa"."cod_cliente" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assinante_empresa_padrao" ON "assinante_empresa" USING btree ("cod_cliente") WHERE "assinante_empresa"."cod_cliente" is null;