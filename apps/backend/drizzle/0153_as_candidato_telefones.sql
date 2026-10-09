-- TELEFONE MULTIPLO NO CANDIDATO DE A&S (08/10/2026, OST import de curriculo por IA).
--
-- PARA QUE: o import por curriculo pode trazer VARIOS telefones por candidato (decisao do diretor), e
-- o modelo so tinha `telefone varchar(40)`, um escalar. Esta coluna guarda a LISTA, e o `telefone`
-- escalar continua sendo o PRIMEIRO dela (espelho): `telefone = telefones[0]`. Assim todo consumidor
-- ja validado (ficha, Gerenciador, ponte da admissao, exportacoes) segue lendo um escalar, sem mudar.
--
-- ┌─ `text[]` NOT NULL DEFAULT '{}', E POR QUE O DEFAULT E OBRIGATORIO ────────────────────────────┐
-- │ A unica porta de insert do dominio (`CandidatosService.criar`) passa a listar a coluna, mas as │
-- │ duas ingestoes cruas (`as/ingestao-pandape` e `as/digai`, raw SQL) NAO a listam. Sem DEFAULT, o │
-- │ primeiro candidato que o Pandape/Digai criasse quebraria a ingestao por NOT NULL sem default.   │
-- │ Com '{}', a linha nasce com a lista vazia e nada quebra. (Essas ingestoes ainda gravam so o     │
-- │ `telefone` escalar: alinhar a lista delas e proposta registrada, fora do escopo desta OST.)     │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- BACKFILL: toda linha que ja tem `telefone` recebe `telefones = ARRAY[telefone]`, para o espelho
-- `telefone = telefones[0]` valer tambem no passado. Linha sem telefone (ou com string vazia) fica
-- com '{}'. Idempotente: so toca quem ainda esta com a lista vazia.
--
-- ADITIVA (sec. A.27): `ADD COLUMN IF NOT EXISTS`, nada e apagado nem renomeado. Sec. A.6: a coluna
-- e dado pessoal, nulada pelo expurgo de retencao junto com `telefone`.
ALTER TABLE "as_candidatos" ADD COLUMN IF NOT EXISTS "telefones" text[] NOT NULL DEFAULT '{}';

UPDATE "as_candidatos"
   SET "telefones" = ARRAY["telefone"]
 WHERE "telefone" IS NOT NULL
   AND "telefone" <> ''
   AND "telefones" = '{}';
