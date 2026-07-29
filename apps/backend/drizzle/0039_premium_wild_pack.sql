CREATE TABLE "drive_pasta_pai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"escopo" varchar(20) NOT NULL,
	"chave" varchar(60) NOT NULL,
	"folder_id" varchar(120) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_drive_pasta_pai_escopo_chave" UNIQUE("escopo","chave")
);
