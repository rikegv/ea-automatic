-- CENTRAL DE CANDIDATOS (A&S, onda 1). Tres tabelas novas e UMA coluna na vaga.
--
-- §A.6: `as_candidatos` e a PRIMEIRA tabela do sistema que guarda dado pessoal de quem AINDA NAO E
-- FUNCIONARIO. Por isso o CPF e OPCIONAL (chave e o `id`, nao o CPF) e o dedup vem de um UNIQUE
-- PARCIAL: quando ha CPF ele e unico, sem CPF ninguem colide.

CREATE TYPE "public"."as_candidato_origem" AS ENUM('PANDAPE', 'MANUAL', 'INDICACAO', 'BANCO_TALENTOS');--> statement-breakpoint
CREATE TYPE "public"."candidatura_etapa" AS ENUM('CAPTACAO', 'TRIAGEM', 'ENTREVISTA_SOULAN', 'ENTREVISTA_CLIENTE', 'APROVACAO');--> statement-breakpoint
CREATE TYPE "public"."candidatura_situacao" AS ENUM('ATIVO', 'APROVADO', 'DESCARTADO', 'DESISTIU', 'CONTRATADO');--> statement-breakpoint
CREATE TYPE "public"."as_contato_tipo" AS ENUM('LIGACAO', 'WHATSAPP', 'EMAIL', 'ENTREVISTA', 'OBSERVACAO');--> statement-breakpoint

CREATE TABLE "as_candidatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"cpf" varchar(11),
	"email" varchar(180),
	"telefone" varchar(40),
	"data_nascimento" date,
	"cidade" varchar(120),
	"uf" varchar(2),
	"origem" "as_candidato_origem" DEFAULT 'MANUAL' NOT NULL,
	"id_candidate_pandape" varchar(40),
	"criado_por_id" uuid,
	"anonimizado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "as_candidatos" ADD CONSTRAINT "as_candidatos_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- O DEDUP: unique PARCIAL, e e ele que faz o dedup existir sem proibir candidato sem CPF.
CREATE UNIQUE INDEX "uq_as_candidatos_cpf" ON "as_candidatos" USING btree ("cpf") WHERE "as_candidatos"."cpf" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_as_candidatos_id_candidate_pandape" ON "as_candidatos" USING btree ("id_candidate_pandape") WHERE "as_candidatos"."id_candidate_pandape" is not null;--> statement-breakpoint
CREATE INDEX "idx_as_candidatos_nome" ON "as_candidatos" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "idx_as_candidatos_origem" ON "as_candidatos" USING btree ("origem");--> statement-breakpoint

CREATE TABLE "as_candidaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidato_id" uuid NOT NULL,
	"vaga_id" uuid NOT NULL,
	"etapa" "candidatura_etapa" DEFAULT 'CAPTACAO' NOT NULL,
	"situacao" "candidatura_situacao" DEFAULT 'ATIVO' NOT NULL,
	"motivo_descarte" text,
	"id_match_pandape" varchar(40),
	"alocado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"alocado_por_id" uuid,
	"admissao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_candidaturas_candidato_vaga" UNIQUE("candidato_id","vaga_id")
);
--> statement-breakpoint
ALTER TABLE "as_candidaturas" ADD CONSTRAINT "as_candidaturas_candidato_id_as_candidatos_id_fk" FOREIGN KEY ("candidato_id") REFERENCES "public"."as_candidatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_candidaturas" ADD CONSTRAINT "as_candidaturas_vaga_id_vagas_id_fk" FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_candidaturas" ADD CONSTRAINT "as_candidaturas_alocado_por_id_usuarios_id_fk" FOREIGN KEY ("alocado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_as_candidaturas_id_match_pandape" ON "as_candidaturas" USING btree ("id_match_pandape") WHERE "as_candidaturas"."id_match_pandape" is not null;--> statement-breakpoint
-- A contagem de ocupacao roda dentro da transacao de toda aprovacao, com a linha da vaga travada.
CREATE INDEX "idx_as_candidaturas_vaga_situacao" ON "as_candidaturas" USING btree ("vaga_id","situacao");--> statement-breakpoint
CREATE INDEX "idx_as_candidaturas_candidato" ON "as_candidaturas" USING btree ("candidato_id");--> statement-breakpoint

CREATE TABLE "as_contatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidatura_id" uuid NOT NULL,
	"tipo" "as_contato_tipo" NOT NULL,
	"resumo" text NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"registrado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "as_contatos" ADD CONSTRAINT "as_contatos_candidatura_id_as_candidaturas_id_fk" FOREIGN KEY ("candidatura_id") REFERENCES "public"."as_candidaturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_contatos" ADD CONSTRAINT "as_contatos_registrado_por_id_usuarios_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_as_contatos_candidatura" ON "as_contatos" USING btree ("candidatura_id");--> statement-breakpoint

-- A PONTE DO PANDAPE NA VAGA (puxada da onda 4). SO GUARDA o codigo: nenhuma varredura, nenhuma
-- chamada de API. Indice comum, nao unique, pelo mesmo motivo de `vagas.codigo` (a base historica da
-- onda 3 ainda vai entrar, e um unique faria a importacao falhar em vez de marcar a linha).
ALTER TABLE "vagas" ADD COLUMN "id_vacancy_pandape" varchar(40);--> statement-breakpoint
CREATE INDEX "idx_vagas_id_vacancy_pandape" ON "vagas" USING btree ("id_vacancy_pandape");
