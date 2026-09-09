-- A&S, MODELO DE POSIÇÃO: o vocabulário da situação da candidatura chega ao banco.
--
-- TRÊS COISAS, EM UM ARQUIVO SÓ:
--   1. `CONTRATADO` passa a se chamar `ENVIADO_PARA_ADMISSAO`;
--   2. `ALOCADO` nasce, logo depois de `APROVADO`;
--   3. o índice parcial de duplicata é recriado, e passa a cobrir `ALOCADO`.
--
-- ┌─ POR QUE UM ARQUIVO SÓ, E NÃO DOIS: O QUE FOI MEDIDO AQUI DERRUBA A SUPOSIÇÃO ────────────────┐
-- │ A ARMADILHA CONHECIDA (0059, 0086, 0094): valor criado por `ALTER TYPE ... ADD VALUE` não     │
-- │ pode ser USADO na mesma transação em que nasceu. A saída que se supunha era "dois arquivos de │
-- │ migration", porque se acreditava que o drizzle envolve CADA ARQUIVO numa transação.           │
-- │                                                                                               │
-- │ ELE NÃO ENVOLVE. Lido no código do migrador (`drizzle-orm/pg-core/dialect.js`, método         │
-- │ `migrate`): o `session.transaction(...)` abre UMA transação e o laço `for await` percorre     │
-- │ TODAS as migrations pendentes DENTRO dela. Fronteira de arquivo não é fronteira de commit.    │
-- │ Reproduzido contra um CLONE REAL da homologação: com o `ADD VALUE` em um arquivo e o          │
-- │ `CREATE INDEX` citando 'ALOCADO' no arquivo seguinte, o migrador falhou com                   │
-- │ `unsafe use of new value "ALOCADO" of enum type candidatura_situacao`, e os DOIS reverteram.  │
-- │                                                                                               │
-- │ AS OUTRAS DUAS SAÍDAS TAMBÉM FORAM MEDIDAS, E AS DUAS FALHAM:                                 │
-- │   `WHERE situacao::text in (...)` devolve                                                     │
-- │     `functions in index predicate must be marked IMMUTABLE`. O cast de enum para texto é      │
-- │     STABLE, e não podia ser outra coisa: o rótulo de um enum pode ser renomeado, que é        │
-- │     exatamente o que o primeiro passo deste arquivo faz.                                      │
-- │   `DO $$ ... EXECUTE 'CREATE INDEX ...' $$` devolve o mesmo `unsafe use of new value`. SQL    │
-- │     dinâmico continua na mesma transação, e é a transação que o Postgres olha.                │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A SAÍDA QUE FUNCIONA: O PREDICADO PASSA A DIZER QUEM FICA DE FORA ───────────────────────────┐
-- │ O índice cobre as candidaturas VIVAS. Até aqui isso estava escrito como a LISTA POSITIVA das  │
-- │ vivas, e é justamente por isso que ele precisava de manutenção: valor novo do enum nascia     │
-- │ FORA da cobertura, em silêncio, e o banco deixava de barrar a segunda linha viva do par       │
-- │ pessoa/vaga.                                                                                  │
-- │                                                                                               │
-- │ AGORA ELE DIZ O COMPLEMENTO: tudo que NÃO encerrou sem êxito. `DESCARTADO` e `DESISTIU` são   │
-- │ valores ANTIGOS e já commitados, então o predicado não cita nenhum valor novo e cabe na mesma │
-- │ transação do `ADD VALUE`.                                                                     │
-- │                                                                                               │
-- │ E ISSO NÃO É UM TRUQUE PARA FUGIR DA TRANSAÇÃO: é a MESMA definição que o domínio já usa.     │
-- │ `SITUACOES_VIVAS` é literalmente o complemento de `ehSaidaSemExito`, e o comentário de lá diz │
-- │ por quê: a derivação é FAIL-CLOSED, situação nova nasce VIVA e portanto PROTEGIDA pela trava  │
-- │ de duplicata. A lista positiva no banco vinha contando a história ao contrário. Com o         │
-- │ complemento, o índice do banco passa a ser fail-closed também, e a próxima situação a entrar  │
-- │ no vocabulário fica coberta SEM migration nenhuma.                                            │
-- │                                                                                               │
-- │ O CONJUNTO COBERTO É EXATAMENTE O MESMO que a lista positiva de quatro valores descreveria:   │
-- │ ATIVO, APROVADO, ALOCADO e ENVIADO_PARA_ADMISSAO. `situacao` é NOT NULL, então não existe a   │
-- │ armadilha do `NOT IN` com nulo.                                                               │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- POR QUE O RENAME, e por que ele é seguro. A palavra "CONTRATADO" dava a entender uma admissão
-- CONCLUÍDA, e o que o valor descreve é o oposto: o candidato ALOCADO avançou para a esteira, a
-- admissão COMEÇOU e NÃO terminou. `RENAME VALUE` é seguro em transação, o DADO SEGUE o rename
-- (nenhuma linha é reescrita, é o mesmo OID com outro rótulo) e o predicado de índice seguiria
-- junto sozinho, porque ele guarda o OID e não o texto. Medido nas duas direções. O `DO` que o
-- envolve existe porque `RENAME VALUE` não aceita `IF EXISTS`, e migration da casa é
-- re-executável (a 0028, a 0030 e a 0066 já fazem isso com `IF NOT EXISTS`).
--
-- O `AFTER 'APROVADO'` NÃO É ENFEITE: é a ordem da vida da candidatura, e a mesma ordem de
-- `CANDIDATURA_SITUACOES` no `shared-types`, por onde a Central de Candidatos ordena (`indexOf`).
--
-- RISCO DE DADO: nulo, conferido nos dois bancos antes de escrever. Produção tem ZERO candidaturas
-- e homologação tem duas (uma ATIVO, uma DESISTIU), nenhuma em ALOCADO. O índice novo é MAIS FORTE
-- que o antigo (cobre um superconjunto das linhas), e é por isso que ele só pode nascer agora,
-- enquanto a base ainda é pequena.
--
-- ┌─ ORDEM DE OPERAÇÃO, e ela não é negociável, nos DOIS sentidos ────────────────────────────────┐
-- │ O CÓDIGO NOVO NÃO PODE SER SERVIDO ANTES DESTA MIGRATION: `SITUACOES_VIVAS` é derivada do     │
-- │ vocabulário e vai para dentro de consulta de verdade (`inArray`), então um backend com        │
-- │ 'ALOCADO' na lista, contra um banco sem o valor, manda ao Postgres um rótulo desconhecido.    │
-- │                                                                                               │
-- │ E O CÓDIGO ANTIGO NÃO SOBREVIVE A ELA: o rename apaga o rótulo 'CONTRATADO', que o build      │
-- │ anterior tem compilado dentro. Logo, esta migration e a subida do backend novo andam JUNTAS   │
-- │ no mesmo ambiente: aplicá-la sozinha derruba a A&S daquele ambiente até o backend novo subir. │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'candidatura_situacao' AND e.enumlabel = 'CONTRATADO') THEN
    ALTER TYPE "public"."candidatura_situacao" RENAME VALUE 'CONTRATADO' TO 'ENVIADO_PARA_ADMISSAO';
  END IF;
END $$;--> statement-breakpoint

ALTER TYPE "public"."candidatura_situacao" ADD VALUE IF NOT EXISTS 'ALOCADO' AFTER 'APROVADO';--> statement-breakpoint

DROP INDEX IF EXISTS "uq_as_candidaturas_viva";--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_candidaturas_viva" ON "as_candidaturas" USING btree ("candidato_id","vaga_id") WHERE "as_candidaturas"."situacao" not in ('DESCARTADO', 'DESISTIU');
