-- PORTAL_CONFERENCIA + PORTAL_TERMO_ACEITE: o resultado EFÊMERO da IA e a prova de consentimento.
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0119..0125: o `drizzle-kit` não gera comentário nem
-- `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ portal_conferencia ════════════════════════════════════════════════════════════════════════
--
-- Uma linha por (admissão + tipo): os campos que a IA leu (`campos`) + o veredito redigido
-- (`veredito`, lista fechada do EA, sem o motivo cru do modelo). É a cura da raiz dos bugs de tela
-- do Portal: o resultado da IA deixa de ser efêmero e a trilha passa a devolvê-lo para a tela
-- reidratar "conferir" / "ajustar" / "aceito".
--
-- §A.6 — REVERTE A CONSEQUÊNCIA do veto V12 (ratificado pelo diretor), NÃO o núcleo: isto é
-- SUGESTÃO, nunca dado autoritativo. É DISPLAY-ONLY (nunca entra em contagem de teto, gate de fase
-- ou caminho de gravação do GI). `campos` é PII do candidato: viaja só na trilha, NUNCA a log. TTL
-- 48h (`expurgar_em`, sweep in-process), mesmo princípio da staging efêmera. Na confirmação os
-- `campos` são anulados (`[]`) e `confirmado_em` é carimbado; `veredito` sobrevive.
CREATE TABLE IF NOT EXISTS "portal_conferencia" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admissao_id" uuid NOT NULL,
  "tipo_documento_id" uuid NOT NULL,
  "campos" jsonb NOT NULL,
  "veredito" jsonb,
  "confirmado_em" timestamp with time zone,
  "expurgar_em" timestamp with time zone NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_portal_conferencia_admissao_tipo" UNIQUE("admissao_id","tipo_documento_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_conferencia" ADD CONSTRAINT "portal_conferencia_admissao_id_admissoes_id_fk"
    FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_conferencia" ADD CONSTRAINT "portal_conferencia_tipo_documento_id_tipos_documento_id_fk"
    FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_conferencia_expurgo" ON "portal_conferencia" USING btree ("expurgar_em");--> statement-breakpoint
-- ══ portal_termo_aceite ═══════════════════════════════════════════════════════════════════════
--
-- Uma linha por admissão (unique): o candidato aceitou o termo de privacidade. A trilha devolve
-- `termoAceito` para a tela pular a tela do termo na volta (bug 1). SEM TTL, de propósito: prova de
-- consentimento LGPD não expurga. §A.6: PII-free, só admissão + carimbo + `jti_link` (ancoradouro
-- do CANDIDATO, que não é usuário). NUNCA CPF, nome ou valor.
CREATE TABLE IF NOT EXISTS "portal_termo_aceite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admissao_id" uuid NOT NULL,
  "aceito_em" timestamp with time zone NOT NULL,
  "jti_link" uuid,
  CONSTRAINT "portal_termo_aceite_admissao_id_unique" UNIQUE("admissao_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_termo_aceite" ADD CONSTRAINT "portal_termo_aceite_admissao_id_admissoes_id_fk"
    FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
