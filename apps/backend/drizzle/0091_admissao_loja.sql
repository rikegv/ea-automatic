-- LOJA DA ADMISSÃO (cenário 1, docs/DESENHO-LOJAS-UNIDADES.md, etapa 3).
--
-- Onde a pessoa trabalha, quando o cliente tem lojas cadastradas. NULLABLE porque a maioria dos
-- clientes não tem loja nenhuma, e para eles a admissão continua no nome do cliente, como sempre.
--
-- ADITIVA E REVERSÍVEL: uma coluna nulável, sem default e sem backfill. Nenhuma admissão existente
-- muda de estado, nenhuma consulta atual muda de resultado e nenhuma régua passa a cobrar nada (a
-- cobrança é a etapa 5, e só é ligada depois da carga).
--
-- ON DELETE SET NULL, não CASCADE: apagar uma loja jamais pode levar a admissão junto. Na prática o
-- catálogo INATIVA em vez de apagar, então este caminho é a última rede.
ALTER TABLE "admissoes" ADD COLUMN IF NOT EXISTS "loja_id" uuid;--> statement-breakpoint

ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_loja_id_cliente_lojas_id_fk"
  FOREIGN KEY ("loja_id") REFERENCES "public"."cliente_lojas"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Índice para o agrupamento por loja (Alto Volume, etapa 4) e para os filtros por loja das telas.
CREATE INDEX IF NOT EXISTS "idx_admissoes_loja" ON "admissoes" ("loja_id");
