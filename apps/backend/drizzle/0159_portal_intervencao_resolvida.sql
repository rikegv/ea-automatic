-- Portal, AJUSTE 1: o marco "RESOLVIDO PELO TIME" da pendencia que caiu para a fila (card
-- "Intervencao Humana" do Gerenciador do Portal).
--
-- O card deriva de `portal_pendencias_no_time` com `caiu_em` nao nulo e `liberado_em` nulo. Uma
-- admissao ja tratada pelo time continuava no card porque nao havia um "resolvido" explicito:
-- `liberado_em` NAO serve para isto, ele e a REABERTURA (devolve a tentativa ao candidato e zera o
-- teto de reprovacoes do marco para a frente). "Resolvido" e o oposto: o time encerrou a intervencao
-- SEM devolver tentativa e SEM reabrir a porta do candidato. Por isso um marco NOVO, par carimbo +
-- autor, nunca `liberado_em`.
--
-- Aditivo e minimalista: dois ADD COLUMN (ambos nullable, NULO = ainda nao resolvido, que e o estado
-- normal) e dois ADD CONSTRAINT (a FK do autor e o CHECK de completude). Nao dropa nem altera nada
-- existente. O CHECK espelha o `ck_portal_pendencias_no_time_liberacao`: os dois campos andam juntos
-- ou nenhum existe, senao o rastro "quem resolveu" fica pela metade. Sec. A.6: carimbo e autor
-- interno (usuario do EA), nada de PII.

ALTER TABLE "portal_pendencias_no_time" ADD COLUMN "resolvido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD COLUMN "resolvido_por_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "portal_pendencias_no_time_resolvido_por_id_usuarios_id_fk" FOREIGN KEY ("resolvido_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_resolvido" CHECK (("resolvido_em" is null and "resolvido_por_id" is null) or ("resolvido_em" is not null and "resolvido_por_id" is not null));
