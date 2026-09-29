-- O CURSOR DA VARREDURA DO DIGAI (polling, 29/09/2026).
--
-- Tres colunas tecnicas e ZERO PII: um screening nao e de ninguem e o total e contagem, entao nada
-- aqui entra no expurgo (§A.6). Guarda, por screening, o `updatedAt` que a LISTAGEM do fornecedor
-- devolveu e o `total` de candidatos visto no ultimo ciclo.
--
-- ELE NAO PULA NADA HOJE, e isso e deliberado: nao esta provado que o `updatedAt` do SCREENING se
-- mexe quando um CANDIDATO finaliza a triagem. Pular o screening "sem mudanca" deixaria de fora
-- exatamente quem acabou de finalizar, para sempre e sem nada falhar. Gravar e a MEDICAO que
-- destrava a otimizacao; pular sem prova perde gente em silencio.
create table if not exists as_digai_screening_cursor (
  screening_id text primary key,
  updated_at_externo text,
  total_visto integer not null default 0,
  visto_em timestamptz not null default now()
);
