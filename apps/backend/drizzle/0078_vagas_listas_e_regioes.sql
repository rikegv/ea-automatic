-- Central de Vagas (A&S), OST de 22/08: os campos de texto que viram LISTA, e a região nível Brasil.
--
-- OS TRÊS `USING` ABAIXO NÃO SÃO ENFEITE. O drizzle-kit gerou o ALTER sem eles, e assim a migration
-- NEM RODA: o Postgres não converte `text` em `text[]` por conta própria, e aborta com "column
-- cannot be cast automatically". Com o USING, cada texto que já estava gravado vira um array de UM
-- elemento, e nada do que os consultores digitaram até aqui se perde. NULL segue NULL, porque vazio
-- é ausência de resposta e não uma lista com um item vazio.
ALTER TABLE "vagas" ALTER COLUMN "regioes" SET DATA TYPE text[]
  USING (CASE WHEN "regioes" IS NULL OR btrim("regioes") = '' THEN NULL ELSE ARRAY["regioes"] END);--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "idiomas" SET DATA TYPE text[]
  USING (CASE WHEN "idiomas" IS NULL OR btrim("idiomas") = '' THEN NULL ELSE ARRAY["idiomas"] END);--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "etapas_ps" SET DATA TYPE text[]
  USING (CASE WHEN "etapas_ps" IS NULL OR btrim("etapas_ps") = '' THEN NULL ELSE ARRAY["etapas_ps"] END);--> statement-breakpoint
-- CPF do substituído: PERSISTE (decisão do diretor, 22/08). Difere do CPF de substituição da
-- ADMISSÃO (`dados_vaga_folha.substituido_cpf`), que mantém o expurgo de 48h da regra 10 da §A.3.
-- Aqui a retenção é exigência legal continuada, para o cadastro do ADM. Nunca em log, nunca em
-- exportação (§A.6). 11 dígitos, sem máscara.
ALTER TABLE "vagas" ADD COLUMN "substituido_cpf" varchar(11);--> statement-breakpoint
-- Região nível Brasil: a UF comanda quais regiões o array aceita (régua no shared-types).
ALTER TABLE "vagas" ADD COLUMN "regiao_estado" varchar(2);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "regioes_outras" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "idiomas_outros" varchar(160);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN "etapas_ps_outra" varchar(160);
