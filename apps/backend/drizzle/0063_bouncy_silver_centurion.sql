CREATE TYPE "public"."origem_vinculo_projeto" AS ENUM('LIBERACAO', 'CORRECAO');--> statement-breakpoint
CREATE TABLE "admissao_projeto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"projeto_id" uuid NOT NULL,
	"grupo_id" uuid,
	"origem" "origem_vinculo_projeto" NOT NULL,
	"vinculado_por_id" uuid,
	"vinculado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissao_projeto_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
CREATE TABLE "projeto_grupo_entrada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"rotulo" varchar(80) NOT NULL,
	"data_entrada" date NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_projeto_grupo_entrada_data" UNIQUE("projeto_id","data_entrada")
);
--> statement-breakpoint
CREATE TABLE "projeto_vaga_cargo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projeto_id" uuid NOT NULL,
	"cargo_id" uuid NOT NULL,
	"grupo_id" uuid,
	"quantidade" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_projeto_vaga_cargo_quantidade" CHECK ("projeto_vaga_cargo"."quantidade" > 0)
);
--> statement-breakpoint
CREATE TABLE "projetos_alto_volume" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cod_cliente" varchar(40) NOT NULL,
	"nome" varchar(160) NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_projeto_alto_volume_cliente_nome" UNIQUE("cod_cliente","nome"),
	CONSTRAINT "ck_projeto_alto_volume_periodo" CHECK ("projetos_alto_volume"."data_fim" >= "projetos_alto_volume"."data_inicio")
);
--> statement-breakpoint
ALTER TABLE "admissao_projeto" ADD CONSTRAINT "admissao_projeto_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissao_projeto" ADD CONSTRAINT "admissao_projeto_projeto_id_projetos_alto_volume_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos_alto_volume"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissao_projeto" ADD CONSTRAINT "admissao_projeto_grupo_id_projeto_grupo_entrada_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."projeto_grupo_entrada"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admissao_projeto" ADD CONSTRAINT "admissao_projeto_vinculado_por_id_usuarios_id_fk" FOREIGN KEY ("vinculado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_grupo_entrada" ADD CONSTRAINT "projeto_grupo_entrada_projeto_id_projetos_alto_volume_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos_alto_volume"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_vaga_cargo" ADD CONSTRAINT "projeto_vaga_cargo_projeto_id_projetos_alto_volume_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."projetos_alto_volume"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_vaga_cargo" ADD CONSTRAINT "projeto_vaga_cargo_cargo_id_cargos_id_fk" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_vaga_cargo" ADD CONSTRAINT "projeto_vaga_cargo_grupo_id_projeto_grupo_entrada_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "public"."projeto_grupo_entrada"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos_alto_volume" ADD CONSTRAINT "projetos_alto_volume_cod_cliente_clientes_cod_cliente_fk" FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projetos_alto_volume" ADD CONSTRAINT "projetos_alto_volume_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admissao_projeto_projeto" ON "admissao_projeto" USING btree ("projeto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projeto_vaga_cargo_projeto" ON "projeto_vaga_cargo" USING btree ("projeto_id","cargo_id") WHERE "projeto_vaga_cargo"."grupo_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_projeto_vaga_cargo_grupo" ON "projeto_vaga_cargo" USING btree ("projeto_id","cargo_id","grupo_id") WHERE "projeto_vaga_cargo"."grupo_id" is not null;