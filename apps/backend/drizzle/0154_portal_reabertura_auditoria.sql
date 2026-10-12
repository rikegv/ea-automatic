-- Portal, sincronizacao Auditoria -> Portal (item 1): a reabertura disparada pela aba Auditoria.
--
-- Quando o consultor REABRE a pendencia de um documento na Esteira (o descarte, porque a IA aprovou
-- errado), o Portal precisa destravar tambem, senao a casa do candidato fica em "Documento recebido"
-- e ele nao reenvia. Essa reabertura move o MESMO marco de `portal_pendencias_no_time`, com um tipo
-- PROPRIO: `REABERTURA_AUDITORIA`. Ela NAO e o `SOLICITACAO_REENVIO` (botao do time, pendencia ja
-- caida na fila) nem o `DESTRAVAMENTO_MASTER` (excecao do Master que o A.9 conta como regua
-- desmentida). Ver `domain/portal-tentativas.ts`.
--
-- `liberado_tipo` e varchar(24) + CHECK (NAO e enum do Postgres), entao basta recriar o CHECK para
-- aceitar o novo valor, numa transacao so. Additivo e reaplicavel (`DROP ... IF EXISTS`). Sec. A.6:
-- valor de vocabulario fechado, nada de PII.

ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "ck_portal_pendencias_no_time_liberado_tipo";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_liberado_tipo" CHECK ("liberado_tipo" IS NULL OR "liberado_tipo" IN ('SOLICITACAO_REENVIO','DESTRAVAMENTO_MASTER','REABERTURA_AUDITORIA'));
