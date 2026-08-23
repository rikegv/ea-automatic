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