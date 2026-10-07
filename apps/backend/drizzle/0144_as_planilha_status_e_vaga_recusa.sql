-- F2/F3/F4 (06/10/2026). Ver o briefing e os comentarios do schema (db/schema/tables.ts).
--
-- F2: status da vaga na planilha viva, materializado no ESPELHO as_depara_cliente_vaga. Token canonico
--     (ABERTO/ENTREGUE/FECHADO/CANCELADO/OUTRO), nao o texto cru: Sec. A.6, status e ciclo de vida, nao
--     dado pessoal. So ABERTO/ENTREGUE entram no gate da varredura e no filtro da fila de revisao.
--
-- F4: marca de recusa da liberacao da vaga, espelhando a da admissao (admissoes.recusado_em). E MARCA,
--     nao status: a vaga segue em PENDENTE_REVISAO, e recusada_em e o que a tira da fila e a poe na aba
--     RECUSADAS. A varredura respeita a marca (guarda em ingestao-repositorio.escreverVaga, com teste).
--     A trilha RECUSOU/DEVOLVEU vive em vaga_recusa_eventos. Sem motivo (dispensado pelo diretor), logo
--     sem campo de texto livre por onde PII pudesse entrar (Sec. A.6).

ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "status_planilha" varchar(20);--> statement-breakpoint

ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "recusada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "recusada_por_id" uuid;--> statement-breakpoint
-- FK idempotente: ADD CONSTRAINT nao tem IF NOT EXISTS, e esta migration pode ser re-aplicada.
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "vagas_recusada_por_id_usuarios_id_fk"
    FOREIGN KEY ("recusada_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- INDICE PARCIAL: so as recusadas, que sao minoria. A fila exclui por esta coluna e a aba RECUSADAS varre por ela.
CREATE INDEX IF NOT EXISTS "idx_vagas_recusada_em" ON "vagas" ("recusada_em") WHERE "recusada_em" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vaga_recusa_eventos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL REFERENCES "vagas"("id") ON DELETE CASCADE,
  "acao" varchar(10) NOT NULL,
  "por_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_vaga_recusa_eventos_acao" CHECK ("acao" IN ('RECUSOU', 'DEVOLVEU'))
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_vaga_recusa_eventos_vaga" ON "vaga_recusa_eventos" ("vaga_id");
