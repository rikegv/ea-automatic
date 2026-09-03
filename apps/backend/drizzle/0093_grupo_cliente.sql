-- GRUPO DE CLIENTES (cenário 2, caso Raia/CAGC). Ver docs/DESENHO-CENARIO-2-GRUPO.md.
--
-- O inverso do cenário 1: lá a loja vive DENTRO de um cliente, aqui cada loja JÁ É um cliente com
-- CNPJ próprio e o que falta é a camada por cima. A Raia tem 98 códigos na mesma razão social, e o
-- agrupamento administrativo (o CAGC) vive hoje escrito à mão no apelido, em nove grafias.
--
-- ADITIVA: nenhuma linha existente muda. As duas tabelas nascem vazias e a coluna de carimbo nasce
-- nula em todas as admissões.
CREATE TABLE IF NOT EXISTS "grupos_cliente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" varchar(200) NOT NULL,
  "descricao" text,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- A MESMA NORMALIZAÇÃO do nome das lojas: caixa alta, pontas cortadas, espaços colapsados. É o que
-- impede o grupo de nascer com o defeito que veio consertar, o `CAGC CORIFEU` convivendo com o
-- `CAGC CORIFEU ` de espaço à direita. Sem remover acento: `unaccent` não está instalada.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_grupo_cliente_nome"
  ON "grupos_cliente" (upper(btrim(regexp_replace("nome", '\s+', ' ', 'g'))));--> statement-breakpoint

-- A CHAVE PRIMÁRIA É O `cod_cliente` SOZINHO. É isto, e não o código, que garante "uma loja em UM
-- grupo só": com a chave no par (grupo, cliente), o mesmo CNPJ poderia estar em dois grupos e a soma
-- por grupo contaria a mesma farmácia duas vezes. Trocar de grupo vira um upsert nesta chave.
CREATE TABLE IF NOT EXISTS "grupo_cliente_membros" (
  "cod_cliente" varchar(40) PRIMARY KEY NOT NULL,
  "grupo_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "grupo_cliente_membros" ADD CONSTRAINT "grupo_cliente_membros_cod_cliente_clientes_cod_cliente_fk"
  FOREIGN KEY ("cod_cliente") REFERENCES "public"."clientes"("cod_cliente")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "grupo_cliente_membros" ADD CONSTRAINT "grupo_cliente_membros_grupo_id_grupos_cliente_id_fk"
  FOREIGN KEY ("grupo_id") REFERENCES "public"."grupos_cliente"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- O CARIMBO. `restrict` e não `set null`: apagar um grupo não pode deixar o histórico sem nome. Na
-- prática grupo não se apaga, se inativa, e o restrict é a rede embaixo disso.
ALTER TABLE "admissoes" ADD COLUMN IF NOT EXISTS "grupo_cliente_id" uuid;--> statement-breakpoint

ALTER TABLE "admissoes" ADD CONSTRAINT "admissoes_grupo_cliente_id_grupos_cliente_id_fk"
  FOREIGN KEY ("grupo_cliente_id") REFERENCES "public"."grupos_cliente"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- O índice serve ao filtro por grupo (etapa 4) e ao backfill (etapa 3). Parcial, porque a esmagadora
-- maioria das admissões não tem grupo e indexar nulo é peso sem uso.
CREATE INDEX IF NOT EXISTS "idx_admissoes_grupo_cliente"
  ON "admissoes" ("grupo_cliente_id") WHERE "grupo_cliente_id" IS NOT NULL;
