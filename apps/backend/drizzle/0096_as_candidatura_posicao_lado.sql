-- A&S, O LADO DA POSIÇÃO: de qual meta da vaga cada finalização saiu.
--
-- POR QUE ESTA COLUNA EXISTE. A vaga sempre teve DUAS metas, `posicoes_oficiais` (a contratação de
-- verdade) e `posicoes_banco` (o excedente aprovado que fica de reserva). Enquanto o único jeito de
-- dizer "preenchi uma posição" era o número DIGITADO no fechamento, a separação vinha de graça: o
-- formulário tinha um campo para cada lado. Com a FINALIZAÇÃO DE POSIÇÃO (uma pessoa, um clique), a
-- escolha volta a existir e passa a ser do consultor, e ela precisa de onde morar. Adivinhar por
-- ordem de chegada (as primeiras são oficiais, o resto é banco) apagaria a intenção no gesto que a
-- cria, e é justamente essa intenção que o aviso de banco existe para confirmar.
--
-- QUEM LÊ, e ela não nasce dormente: é o TETO da trava de ocupação. Uma pessoa alocada no BANCO que
-- depois avança para a esteira admissional é medida contra o teto do lado DELA (oficiais + banco);
-- sem a coluna, ela seria medida contra a meta oficial já cheia e o avanço seria recusado, numa vaga
-- que tem reserva de sobra.
--
-- RISCO DE DADO: NULO, e isto foi conferido nos dois bancos, não deduzido. Coluna NOVA, NULÁVEL e
-- SEM default: nenhuma linha é reescrita, nenhuma consulta existente muda de resposta. `NULL` vale
-- `OFICIAL` na leitura (`ladoDaCandidatura`, no domínio), que é exatamente o que toda candidatura de
-- hoje já é: todas foram aprovadas contra a meta oficial, a única que a trava conhecia.
--
-- TEXTO COM CHECK, E NÃO UM ENUM NOVO DO POSTGRES, de propósito. A 0095 mediu a armadilha: valor
-- criado por `ALTER TYPE ... ADD VALUE` não pode ser USADO na transação em que nasceu, e o migrador
-- do drizzle roda TODAS as migrations pendentes DENTRO de uma transação só. Um enum aqui amarraria a
-- primeira migration futura que precisasse citar um valor dele. O CHECK dá a mesma garantia sem a
-- amarra.
--
-- ESTA MIGRATION RODA NA MESMA LEVA DA 0095, e não depende dela: não cita nenhum valor do enum
-- `candidatura_situacao`, nem novo nem antigo, então não há o que commitar antes.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` na coluna e o `DO` no check, que não aceita
-- `IF NOT EXISTS` por sintaxe.

ALTER TABLE "as_candidaturas" ADD COLUMN IF NOT EXISTS "posicao_lado" text;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_candidaturas_posicao_lado') THEN
    ALTER TABLE "as_candidaturas" ADD CONSTRAINT "ck_as_candidaturas_posicao_lado"
      CHECK ("posicao_lado" is null or "posicao_lado" in ('OFICIAL', 'BANCO'));
  END IF;
END $$;
