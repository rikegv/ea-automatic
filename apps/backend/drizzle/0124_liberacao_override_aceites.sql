-- LIBERACAO_OVERRIDE_ACEITES: rastro do override dos obrigatórios-para-liberar (item 6, diretor).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116, 0119..0123: o `drizzle-kit` não gera comentário nem
-- `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ O QUE ELA GUARDA, E O QUE ELA NÃO GUARDA ═══════════════════════════════════════════════════
--
-- A liberação admissional passou a exigir 6 campos próprios (Cargo, Sexo, Tipo de contrato, Data de
-- admissão, Pacote de benefícios, Escala). Comum não libera com faltante; só MASTER/SUPER_ADMIN, e
-- só com aceite explícito. Cada aceite deixa uma linha aqui: quem, quando, e QUAIS campos faltavam.
--
-- §A.6 — MOLDE do `passagem_aceites`/`dupla_correcao_aceites`, NUNCA do `candidato_alteracoes_log`:
-- `campos_faltantes` são RÓTULOS legíveis ("Sexo, Escala"), nunca CPF, nome ou valor. Nenhuma PII.
-- `autor_id` é NOT NULL: override sem autor humano não existe (é sempre um Master/Super que aceitou).
CREATE TABLE IF NOT EXISTS "liberacao_override_aceites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admissao_id" uuid NOT NULL,
  "autor_id" uuid NOT NULL,
  "papel_autor" varchar(20) NOT NULL,
  "campos_faltantes" text NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "liberacao_override_aceites" ADD CONSTRAINT "liberacao_override_aceites_admissao_id_admissoes_id_fk"
    FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "liberacao_override_aceites" ADD CONSTRAINT "liberacao_override_aceites_autor_id_usuarios_id_fk"
    FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_liberacao_override_aceites_admissao" ON "liberacao_override_aceites" USING btree ("admissao_id");
