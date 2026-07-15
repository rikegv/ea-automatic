CREATE TABLE "tarifas_transporte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cidade" varchar(120) NOT NULL,
	"tipo_transporte" varchar(120) NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"observacao" varchar(240),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_tarifa_cidade_transporte" UNIQUE("cidade","tipo_transporte")
);
