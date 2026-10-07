-- F2/pre-preenchimento (07/10/2026): o valor novo do enum `vaga_natureza`.
--
-- ESTE ARQUIVO TEM UMA INSTRUCAO SO, E A SOLIDAO E O PONTO. O Postgres RECUSA usar, na mesma
-- transacao, um valor acrescentado por `ALTER TYPE ... ADD VALUE`, e o drizzle roda cada arquivo de
-- migration dentro de uma transacao. Logo qualquer INSERT, UPDATE, CHECK ou DEFAULT que mencione
-- 'REPOSICAO_TEMPORARIA' tem de viver em OUTRO arquivo (a 0146 em diante), nunca aqui.
--
-- POR QUE O VALOR EXISTE: a planilha "Geral 2026" escreve "Reposicao Temporaria" na coluna J (Tipo
-- de Vaga), 2 ocorrencias medidas, e o pre-preenchimento COPIA o que a planilha diz. O diretor
-- decidiu criar o par em vez de achatar no `REPOSICAO` generico, porque achatar perde a
-- classificacao que uma pessoa ja fez na fonte. Simetrico ao `REPOSICAO_EFETIVA` que ja existia.
--
-- ADD VALUE ACRESCENTA NO FIM e nunca reordena, entao a ordem aqui e a do BANCO; a ordem de
-- EXIBICAO mora em `VAGA_NATUREZA` (`packages/shared-types`). `IF NOT EXISTS` para a migration ser
-- reaplicavel sem erro. Sec. A.6: valor de vocabulario fechado, nada de dado pessoal.

ALTER TYPE "public"."vaga_natureza" ADD VALUE IF NOT EXISTS 'REPOSICAO_TEMPORARIA';
