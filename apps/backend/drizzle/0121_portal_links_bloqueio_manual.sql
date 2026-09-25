-- PORTAL DO CANDIDATO: O BLOQUEIO MANUAL DO LINK, REVERSÍVEL (gerenciador do Portal, 2a rodada).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116, da 0119 e da 0120: o `drizzle-kit` não gera comentário
-- nem `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ POR QUE UMA COLUNA NOVA, E NÃO REUSAR `revogado_em` ════════════════════════════════════════
--
-- `revogado_em` é TERMINAL: ele nasce da emissão de um link novo (que mata os anteriores) e da
-- revogação manual, e desfazê-lo ressuscitaria um link que alguém matou de propósito. O pedido do
-- diretor é outro: FECHAR A PORTA AGORA E REABRIR DEPOIS, sem trocar a URL que o candidato já tem
-- no WhatsApp. Com uma coluna só, "desbloquear" seria emitir link novo, que é exatamente o que o
-- pedido existe para evitar.
--
-- E `suspenso_ate` também não serve: aquilo é do SISTEMA (o bloqueio progressivo por tentativa
-- errada) e passa sozinho quando a data chega. Bloqueio manual não tem data de fim: ele acaba
-- quando uma pessoa decide que acabou.
--
-- ══ A PRECEDÊNCIA (`domain/portal-identidade.ts`) ══════════════════════════════════════════════
--
-- REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO. Desbloquear ZERA SÓ ESTAS DUAS COLUNAS: link
-- revogado continua revogado e link vencido continua vencido depois de desbloqueado, porque o
-- desbloqueio não toca `revogado_em` nem `expira_em`.
--
-- §A.6: as duas colunas são CARIMBO e AUTOR (usuário do EA). Nenhum dado do candidato, nenhum IP,
-- nenhum motivo em texto livre. O "por quê" vive na trilha (`portal_eventos`), por código fechado.
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "bloqueado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portal_links" ADD COLUMN IF NOT EXISTS "bloqueado_por_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_bloqueado_por_id_usuarios_id_fk"
    FOREIGN KEY ("bloqueado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
