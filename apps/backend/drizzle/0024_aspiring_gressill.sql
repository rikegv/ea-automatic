CREATE TYPE "public"."cartao_vt" AS ENUM('BILHETE_UNICO', 'CARTAO_TOP', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."sentido_vt" AS ENUM('IDA', 'VOLTA');--> statement-breakpoint
CREATE TABLE "formulario_vt_conducoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formulario_id" uuid NOT NULL,
	"sentido" "sentido_vt" NOT NULL,
	"ordem" integer NOT NULL,
	"cidade" varchar(120) NOT NULL,
	"tipo_transporte" varchar(120) NOT NULL,
	"cartao" "cartao_vt" NOT NULL,
	"cartao_outro" varchar(60),
	"valor" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formularios_vt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"optante" boolean NOT NULL,
	"cep" varchar(8) NOT NULL,
	"logradouro" varchar(200) NOT NULL,
	"numero" varchar(20) NOT NULL,
	"complemento" varchar(100),
	"bairro" varchar(120) NOT NULL,
	"cidade" varchar(120) NOT NULL,
	"uf" varchar(2) NOT NULL,
	"total_ida" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_volta" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_dia" numeric(10, 2) DEFAULT '0' NOT NULL,
	"ciente_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formularios_vt_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
ALTER TABLE "formulario_vt_conducoes" ADD CONSTRAINT "formulario_vt_conducoes_formulario_id_formularios_vt_id_fk" FOREIGN KEY ("formulario_id") REFERENCES "public"."formularios_vt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formularios_vt" ADD CONSTRAINT "formularios_vt_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_conducao_formulario" ON "formulario_vt_conducoes" USING btree ("formulario_id");