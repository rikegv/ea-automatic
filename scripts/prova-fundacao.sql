-- PROVA DA PEÇA 1 e 2: estrutura e catálogo. Só leitura, mais um ensaio em transação DESFEITA.
-- §A.6: nenhum dado pessoal. Os valores de ensaio são inventados.
\set ON_ERROR_STOP off
\echo '── PECA 1: A TABELA DE IDENTIDADES ─────────────────────────────────────────'
select column_name as coluna, data_type as tipo, is_nullable as aceita_vazio
  from information_schema.columns
 where table_schema='public' and table_name='as_identidades_externas'
 order by ordinal_position;

\echo ''
\echo '── As travas declaradas no banco ───────────────────────────────────────────'
select conname as trava,
       case contype when 'u' then 'unico' when 'c' then 'lista fechada' when 'f' then 'vinculo' when 'p' then 'chave' end as tipo
  from pg_constraint where conrelid = 'as_identidades_externas'::regclass order by contype, conname;

\echo ''
\echo '── PECA 2: AS 5 ETAPAS DO FUNIL ────────────────────────────────────────────'
select ordem, codigo, rotulo, tom, inicial, ativa from as_etapas_funil order by ordem, id;
\echo '(a Captacao tem de ser a UNICA com inicial = t)'
select count(*) as quantas_iniciais from as_etapas_funil where inicial;

\echo ''
\echo '── PECA 3: O DE/PARA CADASTRADO ────────────────────────────────────────────'
select fonte, rotulo_externo as etapa_no_pandape, chave_externa as chave_normalizada,
       coalesce(etapa_codigo, 'não muda') as cai_na_etapa,
       coalesce(situacao, 'nenhum') as desfecho, ativo
  from as_depara_etapa_externa order by fonte, id;
