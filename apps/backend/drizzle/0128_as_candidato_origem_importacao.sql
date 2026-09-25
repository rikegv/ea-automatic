-- A&S, CENTRAL DE CANDIDATOS: a origem IMPORTACAO chega ao banco.
--
-- A importação por planilha (de/para de colunas por IA) carimba os candidatos criados por ela com
-- `origem = 'IMPORTACAO'`, no mesmo espírito de PANDAPE e DIGAI: a plataforma diz de onde a pessoa
-- veio, e o cadastro manual não oferece este valor.
--
-- ADD VALUE, E SÓ ELE, NESTE ARQUIVO. A armadilha conhecida da casa (0059, 0086, 0094, 0095): o
-- migrador do drizzle percorre TODAS as migrations pendentes numa transação só, e valor criado por
-- `ALTER TYPE ... ADD VALUE` não pode ser USADO na mesma transação em que nasceu. Aqui nada usa
-- 'IMPORTACAO' em SQL (nenhum índice, nenhum predicado, nenhuma escrita): quem o usa é o app, em
-- runtime, noutra transação. Por isso o `ADD VALUE` fica sozinho e é seguro.
--
-- `IF NOT EXISTS` porque migration da casa é re-executável (0028, 0030, 0066, 0095 já fazem assim).

ALTER TYPE "public"."as_candidato_origem" ADD VALUE IF NOT EXISTS 'IMPORTACAO';
