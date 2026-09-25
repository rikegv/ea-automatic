-- ADMISSAO_DADOS_GI + PORTAL_DADOS_GI_ACEITES: os dados DA PESSOA para o G.I (Portal→GI, peça 2).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116, 0119..0124: o `drizzle-kit` não gera comentário nem
-- `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ admissao_dados_gi ═════════════════════════════════════════════════════════════════════════
--
-- Uma linha por admissão (unique), com os campos do GI que o EA ainda não tem (RG, CTPS, PIS,
-- título, reservista, CNH, endereço, filiação, estado civil, raça, grau de instrução,
-- nacionalidade, naturalidade). NÃO duplica `candidatos` (nome, cpf, nascimento, sexo, banco,
-- agência, conta).
--
-- §A.6 — MUDANÇA DE POLÍTICA CONSCIENTE: o Portal hoje "só conta, não guarda". Esta tabela GUARDA o
-- dado validado pelo candidato, porque ele precisa sobreviver do "confirmou" até o "time envia ao
-- GI". É PII sensível: só na FICHA (nunca em superfície coletiva), nunca em log/trilha (o evento
-- carrega só a contagem), e com EXPURGO (`expurgar_em`, sweep in-process). `jti_link` é o
-- ancoradouro do CANDIDATO (uuid, id da linha de `portal_links`), NÃO um FK de `usuarios`: o
-- candidato não é usuário do sistema.
CREATE TABLE IF NOT EXISTS "admissao_dados_gi" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admissao_id" uuid NOT NULL,
  "nacionalidade" varchar(120),
  "naturalidade" varchar(120),
  "filiacao_nome_mae" varchar(200),
  "filiacao_nome_pai" varchar(200),
  "estado_civil" varchar(60),
  "raca" varchar(60),
  "grau_instrucao" varchar(80),
  "rg_numero" varchar(30),
  "rg_orgao_emissor" varchar(40),
  "rg_uf" varchar(2),
  "rg_data_emissao" date,
  "ctps_numero" varchar(30),
  "ctps_serie" varchar(20),
  "ctps_uf" varchar(2),
  "ctps_data" date,
  "pis" varchar(20),
  "titulo_numero" varchar(20),
  "titulo_zona" varchar(10),
  "titulo_secao" varchar(10),
  "reservista_numero" varchar(30),
  "reservista_categoria" varchar(40),
  "cnh_numero" varchar(30),
  "cnh_data_emissao" date,
  "cnh_data_validade" date,
  "end_cep" varchar(8),
  "end_logradouro" varchar(200),
  "end_numero" varchar(20),
  "end_complemento" varchar(100),
  "end_bairro" varchar(120),
  "end_cidade" varchar(120),
  "end_uf" varchar(2),
  "confirmado_em" timestamp with time zone,
  "jti_link" uuid,
  "expurgar_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "admissao_dados_gi_admissao_id_unique" UNIQUE("admissao_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "admissao_dados_gi" ADD CONSTRAINT "admissao_dados_gi_admissao_id_admissoes_id_fk"
    FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_admissao_dados_gi_expurgo" ON "admissao_dados_gi" USING btree ("expurgar_em");--> statement-breakpoint
-- ══ portal_dados_gi_aceites ═══════════════════════════════════════════════════════════════════
--
-- Rastro PII-free do aceite: QUAIS campos (RÓTULOS), QUANDO, ancorado em ADMISSÃO + `jti_link`.
-- Molde de `passagem_aceites`/`liberacao_override_aceites`. NUNCA o valor, NUNCA CPF/nome/token.
-- `jti_link` (não `autor_id`): o autor do aceite é o CANDIDATO, que não é usuário do sistema.
CREATE TABLE IF NOT EXISTS "portal_dados_gi_aceites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admissao_id" uuid NOT NULL,
  "jti_link" uuid NOT NULL,
  "campos_confirmados" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_dados_gi_aceites" ADD CONSTRAINT "portal_dados_gi_aceites_admissao_id_admissoes_id_fk"
    FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_dados_gi_aceites_admissao" ON "portal_dados_gi_aceites" USING btree ("admissao_id");
