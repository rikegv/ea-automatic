-- OS TRÊS ESTÁGIOS da tela de Benefícios (§A.17 etapa 4).
--
-- `IF NOT EXISTS` de propósito: o Postgres recusa USAR um valor de enum na mesma transação que o
-- criou, e o migrador roda as migrations pendentes juntas. Com o guarda, esta migration pode ser
-- aplicada antes (fora do lote) e reexecutada sem quebrar, o que deixa a migration seguinte, que
-- migra as linhas, encontrar os valores já commitados.
ALTER TYPE "public"."status_cadastro_beneficio" ADD VALUE IF NOT EXISTS 'AGUARDANDO_CALCULO';--> statement-breakpoint
ALTER TYPE "public"."status_cadastro_beneficio" ADD VALUE IF NOT EXISTS 'BENEFICIO_CALCULADO';--> statement-breakpoint
ALTER TYPE "public"."status_cadastro_beneficio" ADD VALUE IF NOT EXISTS 'FINALIZADO';
