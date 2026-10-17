-- OST Central de Solicitações (§A.6, LGPD).
-- ADITIVA e IDEMPOTENTE: cria só os dois enums e as três tabelas da frente (solicitacoes,
-- solicitacao_mensagens, notificacoes), com IF NOT EXISTS/guards; não altera nada existente.
-- A IMAGEM do print NUNCA entra no banco: só a REFERÊNCIA do Drive (imagem_drive_url/_file_id).
-- Gerada por drizzle-kit e reduzida à mão ao escopo desta OST (o delta trazia DDL de outras
-- frentes por causa de snapshot defasado no repo; aquelas tabelas já vêm das migrations 0162/0163).
-- NÃO rodar db:migrate contra banco real por esta sessão.
DO $$ BEGIN
 CREATE TYPE "public"."solicitacao_status" AS ENUM('NOVO', 'EM_DUVIDA', 'APROVADO', 'REPROVADO', 'EM_ANDAMENTO', 'CONCLUIDO');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."solicitacao_tipo" AS ENUM('FUNCIONALIDADE', 'BUG');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solicitacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "solicitacao_tipo" NOT NULL,
	"menu_codigo" varchar(60) NOT NULL,
	"menu_rotulo" varchar(120) NOT NULL,
	"submenu" varchar(120) NOT NULL,
	"descricao" text NOT NULL,
	"imagem_drive_url" text,
	"imagem_drive_file_id" text,
	"solicitante_id" uuid NOT NULL,
	"status" "solicitacao_status" DEFAULT 'NOVO' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitacoes_solicitante_id_usuarios_id_fk" FOREIGN KEY ("solicitante_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "solicitacao_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"solicitacao_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"corpo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solicitacao_mensagens_solicitacao_id_solicitacoes_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "solicitacao_mensagens_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"corpo" text NOT NULL,
	"rota" text,
	"solicitacao_id" uuid,
	"ciente_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "notificacoes_solicitacao_id_solicitacoes_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacoes"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_solicitacao_mensagens_solicitacao_criado" ON "solicitacao_mensagens" USING btree ("solicitacao_id","criado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notificacoes_usuario_ciente" ON "notificacoes" USING btree ("usuario_id","ciente_em");
