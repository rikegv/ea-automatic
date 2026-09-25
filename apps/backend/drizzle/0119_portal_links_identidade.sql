-- PORTAL DO CANDIDATO: A IDENTIDADE. A linha que torna o link REVOGÁVEL.
--
-- Desenho: `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, decisões 2 (prazo de 72 horas), 4
-- (revogação, que é o furo aberto do link do VT) e 5 (limite de tentativas com bloqueio
-- progressivo), mais os itens L1, L2, L7 e L8 do catálogo da seção 9.
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116. O `drizzle-kit` não gera comentário nem `IF NOT EXISTS`,
-- e regenerar este SQL apaga as duas coisas.
--
-- NUMERAÇÃO: esta é a 0119 porque a 0117 e a 0118 são de OUTRA sessão trabalhando no mesmo
-- repositório (ingestão do A&S). Renumerar migration alheia é o jeito mais rápido de duas frentes
-- se apagarem em silêncio.
--
-- MIGRATION NOVA, E NÃO UM APÊNDICE NA 0116, porque a 0116 já é de outra frente do Portal e
-- acrescentar tabela nela misturaria duas entregas num arquivo só. A 0116 cria o caminho do
-- ARQUIVO; esta cria a IDENTIDADE.
--
-- ┌─ §A.6 (LGPD): O QUE ESTA TABELA GUARDA, E O QUE ELA NÃO GUARDA ──────────────────────────────┐
-- │ NÃO guarda CPF, NÃO guarda nome, NÃO guarda data de nascimento e NÃO GUARDA O TOKEN. O token  │
-- │ é credencial, e credencial não é persistida nem logada, no mesmo regime da URL assinada do    │
-- │ armazenamento e da URL do Pandapé. Guarda o vínculo com a admissão, quem emitiu, quem revogou │
-- │ e os prazos, que são os dados técnicos sem os quais a revogação não existe.                   │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ══ POR QUE A LINHA, E NÃO SÓ O BILHETE ASSINADO ════════════════════════════════════════════════
--
-- O precedente contrário está em produção: `vt-coleta/vt-link-token.ts` emite um token
-- auto-suficiente, verificado OFFLINE pelo app externo, com sete dias de validade e SEM lista de
-- revogação. Vazou no WhatsApp, vale sete dias, e não há botão que o mate.
--
-- Bilhete assinado é IMUTÁVEL por definição, então o `exp` que viaja dentro dele não pode ser
-- encurtado depois de entregue. É a LINHA que é a autoridade do prazo: `expira_em` daqui é o que a
-- identificação confere, e `revogado_em` é o que a mata antes da hora. O `exp` do bilhete continua
-- existindo como teto barato, conferido antes de tocar o banco.
CREATE TABLE IF NOT EXISTS "portal_links" (
	-- O `id` É O `jti` DO BILHETE. A igualdade é deliberada: é ela que liga o token à linha
	-- revogável sem um segundo campo para manter em sincronia, e `portal_credenciais.jti_link` e
	-- `portal_eventos.jti_link` já falam nesta moeda.
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	-- Exigido pelo item L1 da trilha (`autor_id`): link emitido sem autor é rastro pela metade.
	"criado_por_id" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	-- Nulo é "vivo". Preenchido pela revogação manual (`REVOGADO_MANUAL`) ou pela emissão de um
	-- link novo para a mesma admissão (`SUBSTITUIDO`).
	"revogado_em" timestamp with time zone,
	"revogado_por_id" uuid,
	-- O FIM DO BLOQUEIO PROGRESSIVO (decisão 5). O balde de tentativas é do CPF e do link e passa
	-- sozinho; a suspensão é da LINHA e vale para QUALQUER CPF que tente por aquele link, que é o
	-- que barra quem varre datas trocando de CPF sem trocar de link.
	"suspenso_ate" timestamp with time zone,
	-- Revogação sem autor e sem data é rastro pela metade, e rastro pela metade não responde "quem
	-- revogou". Os dois andam juntos ou nenhum existe. Mesma régua da liberação da 0116.
	CONSTRAINT "ck_portal_links_revogacao" CHECK (("revogado_em" IS NULL AND "revogado_por_id" IS NULL) OR ("revogado_em" IS NOT NULL AND "revogado_por_id" IS NOT NULL))
);--> statement-breakpoint

ALTER TABLE "portal_links" DROP CONSTRAINT IF EXISTS "portal_links_admissao_id_admissoes_id_fk";--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" DROP CONSTRAINT IF EXISTS "portal_links_criado_por_id_usuarios_id_fk";--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_criado_por_id_usuarios_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_links" DROP CONSTRAINT IF EXISTS "portal_links_revogado_por_id_usuarios_id_fk";--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_revogado_por_id_usuarios_id_fk" FOREIGN KEY ("revogado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- A pergunta de TODA emissão ("quais links vivos esta admissão tem?", porque o novo revoga os
-- anteriores) e a da tela do time. Sem ele, emitir um link custaria uma varredura da tabela.
CREATE INDEX IF NOT EXISTS "idx_portal_links_admissao" ON "portal_links" USING btree ("admissao_id","criado_em");
