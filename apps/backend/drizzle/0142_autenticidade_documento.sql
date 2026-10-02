-- AUTENTICIDADE DE DOCUMENTO (§A.38, decisao do diretor) + a categoria da regra de auditoria.
--
-- O DEFEITO QUE ISTO FECHA: a IA valida DADO e REGRA, nao AUTENTICIDADE, e no caminho feliz nao ha
-- humano. Um documento FORJADO com os dados certos passava direto a ENTREGUE. A rede embaixo desse
-- caminho e `decidirDestino` (domain/auditoria.ts): um VALIDADO SUSPEITO nao e auto-aprovado, fica em
-- AGUARDANDO_AUDITORIA com a marca abaixo e vai para a conferencia HUMANA.
--
-- TRES acrescimos ADITIVOS, nenhum toca dado existente a nao ser pelo DEFAULT:
--   1. `documentos_admissao.conferir_autenticidade` (bool, default false): a marca "vai a conferencia
--      humana". Default false = todo documento ja existente segue o comportamento de hoje.
--   2. `documentos_admissao.autenticidade_motivo` (text, null): o CRITERIO visual ("selo oficial
--      ausente"), NUNCA o dado lido (§A.6). Null = sem suspeita.
--   3. `regras_auditoria.categoria` (enum CONFORMIDADE|AUTENTICIDADE, default CONFORMIDADE): o NOT NULL
--      DEFAULT faz o backfill das regras existentes como CONFORMIDADE (continuam dirigindo o status,
--      como sempre). AUTENTICIDADE sao SINAIS, ortogonais ao status; o conteudo delas e insumo do
--      diretor (§A.9), aqui so nasce a coluna que as classifica.
--
-- §A.6: as colunas de `documentos_admissao` sao STATUS e CRITERIO, nunca o arquivo nem o dado lido.
DO $$ BEGIN
  CREATE TYPE "categoria_regra_auditoria" AS ENUM('CONFORMIDADE', 'AUTENTICIDADE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "documentos_admissao" ADD COLUMN IF NOT EXISTS "conferir_autenticidade" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documentos_admissao" ADD COLUMN IF NOT EXISTS "autenticidade_motivo" text;--> statement-breakpoint
ALTER TABLE "regras_auditoria" ADD COLUMN IF NOT EXISTS "categoria" "categoria_regra_auditoria" DEFAULT 'CONFORMIDADE' NOT NULL;
