CREATE TYPE "public"."origem_sala_espera" AS ENUM('CLIENTE', 'SELECAO');--> statement-breakpoint
CREATE TABLE "sala_espera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"cod_cliente" varchar(40) NOT NULL,
	"cargo_id" uuid NOT NULL,
	"telefone" varchar(30),
	"data_recebimento" date NOT NULL,
	"origem" "origem_sala_espera" NOT NULL,
	"status_id" uuid NOT NULL,
	"admissao_id" uuid,
	"vinculado_em" timestamp with time zone,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sala_espera_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(160) NOT NULL,
	"encerra" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sala_espera_status_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
ALTER TABLE "sala_espera" ADD CONSTRAINT "sala_espera_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_espera" ADD CONSTRAINT "sala_espera_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_espera" ADD CONSTRAINT "sala_espera_status_id_sala_espera_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."sala_espera_status"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_espera" ADD CONSTRAINT "sala_espera_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sala_espera" ADD CONSTRAINT "sala_espera_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;