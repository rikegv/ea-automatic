-- LOJAS E UNIDADES DE UM CLIENTE (cenário 1, docs/DESENHO-LOJAS-UNIDADES.md, etapa 1).
--
-- Cliente que é UM CNPJ e UM código com VÁRIAS lojas. A loja NÃO tem CNPJ (compartilha o da mãe),
-- é nome mais endereço, e serve à análise. Substitui a prática de escrever o nome da loja no campo
-- centro de custo, que produziu 435 valores em texto livre.
--
-- ADITIVA E REVERSÍVEL: cria uma tabela nova e não toca em nenhuma existente. Nenhuma admissão,
-- nenhum cliente e nenhuma vaga muda de comportamento por causa desta migration.
CREATE TABLE IF NOT EXISTS "cliente_lojas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cod_cliente" varchar(40) NOT NULL,
  "nome" varchar(200) NOT NULL,
  "endereco" text,
  "codigo_externo" varchar(60),
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "cliente_lojas" ADD CONSTRAINT "cliente_lojas_cod_cliente_clientes_cod_cliente_fk"
  FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- UNIQUE SOBRE O NOME NORMALIZADO (caixa e espaço), não sobre o nome cru: é o que impede o catálogo
-- de nascer com "Loja Centro" e "LOJA CENTRO " como duas lojas, que é exatamente a duplicata que o
-- texto livre do centro de custo produziu. A MESMA expressão é usada pelas importações para casar
-- nome, então banco e importação concordam por construção.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cliente_loja_nome" ON "cliente_lojas"
  ("cod_cliente", upper(btrim(regexp_replace("nome", '\s+', ' ', 'g'))));--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_cliente_lojas_cliente" ON "cliente_lojas" ("cod_cliente");
