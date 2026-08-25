-- CENTRAL DE VAGAS (A&S), migration CONSOLIDADA.
-- Consolida as 7 migrations que o modulo de A&S acumulou na branch de homologacao
-- (vagas_central_as, vaga_beneficio, papel_as, listas e regioes, rascunho, campos do
-- rascunho, posicoes oficiais e de banco). Elas NUNCA foram aplicadas em producao, entao
-- nao ha historico a preservar, e a numeracao original colidia de 0075 a 0081 com as da
-- main, que ja estao aplicadas e nao se mexe.

-- ===== origem: 0075_vagas_central_as.sql =====
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
--> statement-breakpoint
-- ===== origem: 0076_puzzling_blizzard.sql =====
CREATE TABLE "vaga_beneficio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vaga_id" uuid NOT NULL,
	"beneficio_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_vaga_beneficio" UNIQUE("vaga_id","beneficio_id")
);
--> statement-breakpoint
ALTER TABLE "vagas" DROP CONSTRAINT "ck_vagas_limite_sazonal";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "salario_abertura" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "salario_fechamento" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vaga_beneficio" ADD CONSTRAINT "vaga_beneficio_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaga_beneficio" ADD CONSTRAINT "vaga_beneficio_beneficio_id_beneficios_catalogo_id_fk" FOREIGN KEY ("beneficio_id") REFERENCES "public"."beneficios_catalogo"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vaga_beneficio_vaga" ON "vaga_beneficio" USING btree ("vaga_id");
--> statement-breakpoint
-- ===== origem: 0077_many_mikhail_rasputin.sql =====
CREATE TYPE "public"."papel_as" AS ENUM('CONSULTOR', 'RECRUITER');--> statement-breakpoint
CREATE TYPE "public"."vaga_genero" AS ENUM('INDIFERENTE', 'MASCULINO', 'FEMININO');--> statement-breakpoint
CREATE TYPE "public"."vaga_modelo_trabalho" AS ENUM('PRESENCIAL', 'HOME_OFFICE', 'HIBRIDO');--> statement-breakpoint
CREATE TYPE "public"."vaga_tipo_substituicao" AS ENUM('FERIAS', 'LICENCA_MATERNIDADE', 'AUXILIO_DOENCA', 'SUBSTITUICAO');--> statement-breakpoint
ALTER TYPE "public"."vaga_vinculo" ADD VALUE 'EFETIVO';--> statement-breakpoint
ALTER TYPE "public"."vaga_vinculo" ADD VALUE 'PJ';--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "papel_as" "papel_as";--> statement-breakpoint
ALTER TABLE "vaga_beneficio" ADD COLUMN "valor" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "centro_custo" varchar(80);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "solicitante_nome" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "solicitante_telefone" varchar(40);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "solicitante_email" varchar(180);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "data_solicitacao" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "data_alinhamento" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "envio_shortlist" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "consultor_id" uuid;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "recruiter_id" uuid;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "tempo_contrato" varchar(40);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "motivo" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "justificativa_motivo" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "tipo_substituicao" "vaga_tipo_substituicao";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "substituido_nome" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "local_trabalho" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "regioes" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "horario_escala" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "modelo_trabalho" "vaga_modelo_trabalho";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "detalhe_hibrido" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "confidencial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "divulgar_empresa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "faixa_etaria" varchar(80);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "genero" "vaga_genero" DEFAULT 'INDIFERENTE' NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "idiomas" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "cursos_conhecimentos" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "testes" text[];--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "testes_outro" varchar(160);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "experiencia" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "atribuicoes" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "perfil_comportamental" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "ambiente" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "etapas_ps" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "observacoes" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "data_fechamento" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "vagas_fechadas" integer;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "data_prevista_inicio" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "enviar_para_admissao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_consultor_id_usuarios_id_fk" FOREIGN KEY ("consultor_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_recruiter_id_usuarios_id_fk" FOREIGN KEY ("recruiter_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ===== origem: 0078_vagas_listas_e_regioes.sql =====
-- Central de Vagas (A&S), OST de 22/08: os campos de texto que viram LISTA, e a região nível Brasil.
--
-- OS TRÊS `USING` ABAIXO NÃO SÃO ENFEITE. O drizzle-kit gerou o ALTER sem eles, e assim a migration
-- NEM RODA: o Postgres não converte `text` em `text[]` por conta própria, e aborta com "column
-- cannot be cast automatically". Com o USING, cada texto que já estava gravado vira um array de UM
-- elemento, e nada do que os consultores digitaram até aqui se perde. NULL segue NULL, porque vazio
-- é ausência de resposta e não uma lista com um item vazio.
ALTER TABLE "vagas" ALTER COLUMN "regioes" SET DATA TYPE text[]
  USING (CASE WHEN "regioes" IS NULL OR btrim("regioes") = '' THEN NULL ELSE ARRAY["regioes"] END);--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "idiomas" SET DATA TYPE text[]
  USING (CASE WHEN "idiomas" IS NULL OR btrim("idiomas") = '' THEN NULL ELSE ARRAY["idiomas"] END);--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "etapas_ps" SET DATA TYPE text[]
  USING (CASE WHEN "etapas_ps" IS NULL OR btrim("etapas_ps") = '' THEN NULL ELSE ARRAY["etapas_ps"] END);--> statement-breakpoint
-- CPF do substituído: PERSISTE (decisão do diretor, 22/08). Difere do CPF de substituição da
-- ADMISSÃO (`dados_vaga_folha.substituido_cpf`), que mantém o expurgo de 48h da regra 10 da §A.3.
-- Aqui a retenção é exigência legal continuada, para o cadastro do ADM. Nunca em log, nunca em
-- exportação (§A.6). 11 dígitos, sem máscara.
ALTER TABLE "vagas" ADD COLUMN "substituido_cpf" varchar(11);--> statement-breakpoint
-- Região nível Brasil: a UF comanda quais regiões o array aceita (régua no shared-types).
ALTER TABLE "vagas" ADD COLUMN "regiao_estado" varchar(2);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "regioes_outras" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "idiomas_outros" varchar(160);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "etapas_ps_outra" varchar(160);

--> statement-breakpoint
-- ===== origem: 0079_vaga_rascunho.sql =====
ALTER TYPE "public"."vaga_status" ADD VALUE 'RASCUNHO' BEFORE 'ABERTA';--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "codigo" DROP NOT NULL;
--> statement-breakpoint
-- ===== origem: 0080_vaga_rascunho_campos.sql =====
ALTER TABLE "vagas" ALTER COLUMN "cargo_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "nome_divulgacao" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "natureza" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "posicoes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "data_abertura" DROP NOT NULL;
--> statement-breakpoint
-- ===== origem: 0081_vaga_posicoes_oficiais_e_banco.sql =====
ALTER TABLE "vagas" RENAME COLUMN "posicoes" TO "posicoes_oficiais";--> statement-breakpoint
ALTER TABLE "vagas" DROP CONSTRAINT "ck_vagas_posicoes";--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "posicoes_banco" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "vagas_fechadas_banco" integer;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_posicoes_oficiais" CHECK ("vagas"."posicoes_oficiais" > 0);--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_posicoes_banco" CHECK ("vagas"."posicoes_banco" >= 0);
