-- ADMISSAO_DADOS_GI: as marcas de ENVIO ao G.I (Portal→GI, peça 3 / idempotência).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0125: `drizzle-kit` não gera comentário nem `IF NOT EXISTS`.
--
-- Duas colunas de IDEMPOTÊNCIA do envio da pré-admissão (FuncionarioSelecao). A presença de
-- `gi_enviado_em` é o sinal "já enviado": o gatilho manual não recria na retentativa. O
-- `gi_funcionario_selecao_id` guarda o id que o GI devolve (quando devolve), como âncora de
-- rastreio. NÃO é PII: é a chave do registro no GI, não um dado da pessoa (§A.6).
ALTER TABLE "admissao_dados_gi" ADD COLUMN IF NOT EXISTS "gi_enviado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admissao_dados_gi" ADD COLUMN IF NOT EXISTS "gi_funcionario_selecao_id" varchar(60);
