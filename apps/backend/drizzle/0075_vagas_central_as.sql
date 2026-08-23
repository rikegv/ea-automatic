CREATE TYPE "public"."vaga_escolaridade" AS ENUM('FUNDAMENTAL_INCOMPLETO', 'FUNDAMENTAL_COMPLETO', 'MEDIO_INCOMPLETO', 'MEDIO_COMPLETO', 'TECNICO', 'SUPERIOR_INCOMPLETO', 'SUPERIOR_COMPLETO', 'POS_GRADUACAO');--> statement-breakpoint
CREATE TYPE "public"."vaga_natureza" AS ENUM('EFETIVA', 'TEMPORARIA', 'REPOSICAO_EFETIVA', 'TERCEIRA', 'ESTAGIO', 'VAGA_BANCO');--> statement-breakpoint
CREATE TYPE "public"."vaga_sazonalidade" AS ENUM('OPERACAO_PADRAO', 'SAZONAL');--> statement-breakpoint
CREATE TYPE "public"."vaga_status" AS ENUM('ABERTA', 'ENTREGUE', 'FECHADA', 'CANCELADA', 'VAGA_BANCO');--> statement-breakpoint
CREATE TYPE "public"."vaga_vinculo" AS ENUM('TEMPORARIO', 'TERCEIRIZADO', 'ESTAGIO', 'INTERNO', 'FOPAG', 'JOVEM_APRENDIZ');--> statement-breakpoint
CREATE TABLE "vagas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" varchar(40) NOT NULL,
	"cargo_id" uuid NOT NULL,
	"nome_divulgacao" varchar(200) NOT NULL,
	"cod_cliente" varchar(40),
	"natureza" "vaga_natureza" NOT NULL,
	"vinculo" "vaga_vinculo",
	"status" "vaga_status" DEFAULT 'ABERTA' NOT NULL,
	"sazonalidade" "vaga_sazonalidade" DEFAULT 'OPERACAO_PADRAO' NOT NULL,
	"posicoes" integer DEFAULT 1 NOT NULL,
	"escolaridade" "vaga_escolaridade",
	"data_abertura" date NOT NULL,
	"data_limite" date,
	"aberto_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_vagas_posicoes" CHECK ("vagas"."posicoes" > 0),
	CONSTRAINT "ck_vagas_limite_sazonal" CHECK ("vagas"."sazonalidade" <> 'SAZONAL' or "vagas"."data_limite" is not null)
);
--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_aberto_por_id_usuarios_id_fk" FOREIGN KEY ("aberto_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vagas_codigo" ON "vagas" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "idx_vagas_cod_cliente" ON "vagas" USING btree ("cod_cliente");--> statement-breakpoint
CREATE INDEX "idx_vagas_cargo" ON "vagas" USING btree ("cargo_id");--> statement-breakpoint
CREATE INDEX "idx_vagas_status" ON "vagas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vagas_data_abertura" ON "vagas" USING btree ("data_abertura");