-- META POR LOJA no Alto Volume (docs/DESENHO-META-POR-LOJA.md).
--
-- Até aqui a meta do projeto era por CARGO, com um segundo nível opcional por GRUPO de entrada. Agora
-- ela desce também para a LOJA: "Faria Lima 5 Auxiliar, Ibirapuera 3 Auxiliar" em vez de "8 Auxiliar
-- no projeto". É o que faz a coluna Faltam do quadro por loja significar falta contratar, em vez de
-- `total - na esteira`, que é quem saiu.
--
-- É O MESMO MOVIMENTO DO `grupo_id`, que já existia: coluna nulável mais unique parcial. Não é tabela
-- nova, de propósito: meta em duas tabelas obrigaria toda consulta a somar duas fontes, e no dia em
-- que discordassem o painel mostraria dois números sem dizer qual está certo.
--
-- ADITIVA E SEM BACKFILL (decisão do diretor): nenhum projeto existente ganha meta por loja. Todos
-- continuam com a meta por cargo que já tinham, e o quadro por loja segue sem coluna de meta neles.
ALTER TABLE "projeto_vaga_cargo" ADD COLUMN IF NOT EXISTS "loja_id" uuid;--> statement-breakpoint

-- CASCADE, e não SET NULL: linha de meta que perde a loja não vira "meta geral", vira número somando
-- no lugar errado. Apagar a loja apaga a cota dela.
ALTER TABLE "projeto_vaga_cargo" ADD CONSTRAINT "projeto_vaga_cargo_loja_id_cliente_lojas_id_fk"
  FOREIGN KEY ("loja_id") REFERENCES "public"."cliente_lojas"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Os DOIS uniques que já existiam ganham a loja no predicado: sem isso, a cota da loja colidiria com
-- a linha geral do mesmo cargo e o banco recusaria um cadastro legítimo.
DROP INDEX IF EXISTS "uq_projeto_vaga_cargo_projeto";--> statement-breakpoint
DROP INDEX IF EXISTS "uq_projeto_vaga_cargo_grupo";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_projeto_vaga_cargo_projeto"
  ON "projeto_vaga_cargo" ("projeto_id","cargo_id")
  WHERE "grupo_id" is null and "loja_id" is null;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_projeto_vaga_cargo_grupo"
  ON "projeto_vaga_cargo" ("projeto_id","cargo_id","grupo_id")
  WHERE "grupo_id" is not null and "loja_id" is null;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_projeto_vaga_cargo_loja"
  ON "projeto_vaga_cargo" ("projeto_id","cargo_id","loja_id")
  WHERE "grupo_id" is null and "loja_id" is not null;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_projeto_vaga_cargo_grupo_loja"
  ON "projeto_vaga_cargo" ("projeto_id","cargo_id","grupo_id","loja_id")
  WHERE "grupo_id" is not null and "loja_id" is not null;
