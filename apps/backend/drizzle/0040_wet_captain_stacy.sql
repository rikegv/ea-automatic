ALTER TABLE "beneficios_catalogo" ADD COLUMN "exige_valor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- BACKFILL (OST cadastro de benefícios por tela). A regra "quem exige valor" saiu do código
-- (`BENEFICIOS_COM_VALOR`, shared-types) e virou coluna. Para que NADA mude de comportamento no dia
-- da entrega, o backfill reproduz EXATAMENTE o casamento que a constante fazia: nome normalizado
-- (aparado, maiúsculas, sem acento) começando pela chave OU contendo o código entre parênteses.
-- É esse segundo caso que pega "Participação nos lucros (PLR)", que não começa com "PLR".
-- Sem `unaccent` (extensão não instalada): a normalização usa `translate`, como no código.
-- Idempotente: só toca linhas ainda em `false`.
WITH norm AS (
	SELECT
		"id",
		upper(translate(btrim("nome"),
			'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
			'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) AS "n"
	FROM "beneficios_catalogo"
)
UPDATE "beneficios_catalogo" AS b
SET "exige_valor" = true
FROM norm
WHERE norm."id" = b."id"
	AND b."exige_valor" = false
	AND (
		norm."n" LIKE 'VR%' OR norm."n" LIKE '%(VR)%'
		OR norm."n" LIKE 'VA%' OR norm."n" LIKE '%(VA)%'
		OR norm."n" LIKE 'AM%' OR norm."n" LIKE '%(AM)%'
		OR norm."n" LIKE 'CESTA BASICA%' OR norm."n" LIKE '%(CESTA BASICA)%'
		OR norm."n" LIKE 'PLR%' OR norm."n" LIKE '%(PLR)%'
		OR norm."n" LIKE 'AUXILIO CRECHE%' OR norm."n" LIKE '%(AUXILIO CRECHE)%'
	);
