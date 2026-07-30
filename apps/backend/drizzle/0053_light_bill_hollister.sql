-- FORNECEDOR VIRA CAMPO DA CLÍNICA (OST do fornecedor por clínica).
--
-- Os dados reais mostraram que a relação é um-para-um: cada clínica sempre aparece com o MESMO
-- fornecedor, e as menores são credenciadas da rede MEDICAL. O fornecedor é atributo da CLÍNICA, não
-- do agendamento, então ele passa para a clínica e é DERIVADO por endereço.

-- 1) O pai sai do ENUM para texto. O `USING` é obrigatório: o Postgres não converte enum para varchar
--    automaticamente. Os 54 valores existentes são preservados como texto.
ALTER TABLE "exame_agendamento"
  ALTER COLUMN "fornecedor" TYPE varchar(60) USING "fornecedor"::text;--> statement-breakpoint

-- 2) As colunas novas: na clínica (cadastrável) e no endereço (copiada da clínica no agendamento).
ALTER TABLE "clinicas_catalogo" ADD COLUMN "fornecedor" varchar(60);--> statement-breakpoint
ALTER TABLE "exame_agendamento_endereco" ADD COLUMN "fornecedor" varchar(60);--> statement-breakpoint

-- 3) BACKFILL DAS CLÍNICAS: cada clínica recebe o fornecedor que os agendamentos dela mostram. Onde
--    houver mais de um (não há hoje), vence o mais frequente. É o que dá às 8 clínicas existentes o
--    fornecedor correto sem ninguém digitar nada.
UPDATE "clinicas_catalogo" c SET "fornecedor" = f."fornecedor"
FROM (
  SELECT e."clinica_id" AS clinica_id, a."fornecedor" AS fornecedor,
         row_number() OVER (PARTITION BY e."clinica_id" ORDER BY count(*) DESC) AS rn
  FROM "exame_agendamento_endereco" e
  JOIN "exame_agendamento" a ON a."id" = e."agendamento_id"
  WHERE e."clinica_id" IS NOT NULL AND a."fornecedor" IS NOT NULL
  GROUP BY e."clinica_id", a."fornecedor"
) f
WHERE f.clinica_id = c."id" AND f.rn = 1 AND c."fornecedor" IS NULL;--> statement-breakpoint

-- 4) BACKFILL DOS ENDEREÇOS: cada endereço já existente herda o fornecedor do seu agendamento, que é
--    o que ele de fato teve. Sem isto, os 54 agendamentos migrados ficariam sem fornecedor na tela.
UPDATE "exame_agendamento_endereco" e SET "fornecedor" = a."fornecedor"
FROM "exame_agendamento" a
WHERE a."id" = e."agendamento_id" AND e."fornecedor" IS NULL;--> statement-breakpoint

-- 5) O TIPO enum some: nenhuma coluna o usa mais, e mantê-lo só deixaria um tipo órfão no banco.
DROP TYPE IF EXISTS "public"."fornecedor_exame";
