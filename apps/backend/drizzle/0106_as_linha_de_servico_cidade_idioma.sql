-- A&S, ONDA C: a LINHA DE SERVIÇO vira catálogo do diretor, a CIDADE do IBGE entra ao lado da UF, e
-- o IDIOMA passa a carregar o NÍVEL, numa COLUNA NOVA.
--
-- O QUE ESTA MIGRATION FAZ, na ordem em que precisa acontecer:
--   1. cria `as_linhas_servico`, o catálogo, e SEMEIA as cinco linhas do diretor;
--   2. cria `as_cidades` (código do IBGE como chave) e semeia SÓ o município que o passo 4 precisa;
--   3. acrescenta `vagas.linha_servico_id`, `vagas.cidade_id` e `vagas.idiomas_exigidos`;
--   4. MIGRA as três vagas de produção, NOMINALMENTE, pelo id, com AFIRMAÇÃO DE CONTAGEM.
--
-- ┌─ O QUE ESTA MIGRATION **NÃO** FAZ, e cada ausência é um veto da auditoria acatado ─────────────┐
-- │ NÃO CONVERTE `vagas.idiomas` NO LUGAR. As migrations rodam TODAS no mesmo comando, e o código │
-- │ NO AR durante esse comando é o de ANTES, que lê `idiomas` como lista de textos. Um            │
-- │ `ALTER COLUMN ... TYPE jsonb` quebraria a tela no intervalo entre a migration e o deploy, que  │
-- │ é exatamente a janela em que ninguém está olhando. A coluna nova nasce AO LADO, a velha fica   │
-- │ intocada, e a troca de leitor acontece com o deploy, não com o `ALTER`.                        │
-- │                                                                                                │
-- │ NÃO INVENTA NÍVEL DE IDIOMA. As três vagas pedem "Inglês" sem nível, porque nível não existia. │
-- │ Qualquer valor aqui seria inventado, e nenhum é inócuo: um nível BAIXO afrouxa a exigência de  │
-- │ duas vagas ABERTAS e recebendo candidato; um ALTO elimina gente do processo, em silêncio. O    │
-- │ nível migrado é NULO, que quer dizer "vaga anterior à Onda C", e a tela escreve "nível não     │
-- │ informado" (§A.11).                                                                             │
-- │                                                                                                │
-- │ NÃO REMOVE, NÃO ESVAZIA E NÃO RENOMEIA `regiao_estado`. Ela é a UF, e governa a validação de   │
-- │ `vagas.regioes` (preenchida nas três vagas de produção): `validaRegioes` recusa região que não │
-- │ pertence à UF. A cidade entra AO LADO e é filtrada por ela.                                     │
-- │                                                                                                │
-- │ NÃO CARREGA OS 5.571 MUNICÍPIOS. Isso é script (`db/carga-cidades-ibge.ts`), com trava de base │
-- │ e afirmação de contagem. Uma base do IBGE versionada em SQL seria uma cópia congelada do dia   │
-- │ em que a migration foi escrita.                                                                 │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A MIGRAÇÃO DE DADO É NOMINAL, PELO ID, E AFIRMA A CONTAGEM ANTES DE ESCREVER ────────────────┐
-- │ São TRÊS linhas, todas em produção (homologação tem oito vagas e NENHUMA com estado ou idioma │
-- │ preenchido, medido nas duas bases antes de escrever isto). Um `UPDATE ... WHERE regiao_estado │
-- │ = 'SP'` funcionaria hoje e apanharia amanhã qualquer vaga nova de São Paulo; pelo id, o        │
-- │ alcance é exatamente o que foi conferido, e em qualquer outra base o passo é um no-op.         │
-- │                                                                                                │
-- │ A AFIRMAÇÃO É O QUE SEPARA "no-op" de "errou o alvo": o bloco confere QUANTAS linhas casaram   │
-- │ e ABORTA se casar um número que não seja 0 (outra base) ou 3 (produção). Sem ela, um id        │
-- │ digitado errado seria um UPDATE de zero linhas, silencioso e verde.                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada aqui carrega dado pessoal. Catálogo de processo, base pública do IBGE e exigência de
-- vaga. Nenhum CPF, nenhum candidato, nenhuma URL externa.

-- ── 1. O CATÁLOGO DA LINHA DE SERVIÇO ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "as_linhas_servico" (
	"id" serial PRIMARY KEY NOT NULL,
	-- A IDENTIDADE, e ela é IMUTÁVEL: derivada do rótulo na criação e nunca reescrita. Renomear a
	-- linha mexe no `rotulo`, nunca aqui (mesma decisão do catálogo de etapas, 0100).
	"codigo" varchar(40) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	-- EXCLUSÃO LÓGICA. Pela FK RESTRICT lá embaixo, linha já usada por uma vaga não pode ser
	-- apagada, nunca mais, e inativar é o que sobra: some do seletor da abertura e continua
	-- respondendo "de que linha era aquela vaga".
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as_linhas_servico_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint

-- AS CINCO DO DIRETOR, na ordem em que ele as ditou. `ON CONFLICT DO NOTHING` para a migration ser
-- re-executável sobre uma base que já as tenha (o clone de homologação é feito da produção).
INSERT INTO "as_linhas_servico" ("codigo", "rotulo", "ordem")
VALUES
	('PONTUAIS_ESTRATEGICAS', 'Pontuais & Estratégicas', 1),
	('RPO_BPO',               'RPO & BPO',               2),
	('ALTO_VOLUME',           'Alto Volume',             3),
	('SOUFAST',               'SouFast',                 4),
	('ONESHOT',               'OneShot',                 5)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- ── 2. OS MUNICÍPIOS ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "as_cidades" (
	-- O CÓDIGO DO IBGE, de 7 dígitos, como CHAVE. Não é serial: o número vem da fonte oficial e é a
	-- identidade. Nome de município se repete entre estados (há CINCO "Bom Jesus": PB, PI, RN, RS e
	-- SC, contados na base carregada), e casar por
	-- nome é como a lista velha de região erraria.
	"id" integer PRIMARY KEY NOT NULL,
	"nome" varchar(120) NOT NULL,
	"uf" varchar(2) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- A ÚNICA PERGUNTA QUE A TELA FAZ é "as cidades deste estado, em ordem alfabética".
CREATE INDEX IF NOT EXISTS "as_cidades_uf_nome_idx" ON "as_cidades" ("uf", "nome");--> statement-breakpoint

-- SÓ O MUNICÍPIO QUE O PASSO 4 PRECISA. O resto vem pelo script da carga, com trava de base.
INSERT INTO "as_cidades" ("id", "nome", "uf")
VALUES (3550308, 'São Paulo', 'SP')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

-- ── 3. AS TRÊS COLUNAS NOVAS DA VAGA ────────────────────────────────────────────────────────────
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "linha_servico_id" integer;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cidade_id" integer;--> statement-breakpoint
-- A COLUNA NOVA DO IDIOMA, AO LADO DA VELHA (ver o cabeçalho). `idiomas` continua existindo, com o
-- mesmo tipo e o mesmo conteúdo, e ninguém a escreve mais.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "idiomas_exigidos" jsonb;--> statement-breakpoint

ALTER TABLE "vagas" ADD CONSTRAINT "vagas_linha_servico_id_as_linhas_servico_id_fk" FOREIGN KEY ("linha_servico_id") REFERENCES "public"."as_linhas_servico"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cidade_id_as_cidades_id_fk" FOREIGN KEY ("cidade_id") REFERENCES "public"."as_cidades"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ── 4. AS TRÊS LINHAS DE PRODUÇÃO, NOMINALMENTE E COM CONTAGEM AFIRMADA ─────────────────────────
-- As três têm `regiao_estado = 'SP'` e `regioes = {São Paulo capital}`, conferido na base antes de
-- escrever isto: a cidade que preserva o que estava declarado é São Paulo capital (IBGE 3550308).
-- A UF NÃO É TOCADA: ela continua sendo 'SP', e a cidade entra ao lado.
--
-- A LINHA DE SERVIÇO FICA NULA DE PROPÓSITO, e não é esquecimento: carimbar uma das cinco nas vagas
-- antigas seria inventar uma classificação que ninguém escolheu, num dado que o diretor vai usar
-- para medir a operação. Nulo é honesto, a régua dos obrigatórios cobra na PUBLICAÇÃO (não na
-- leitura, então nada retroage) e a tela mostra "não informado" (§A.11).
--
-- O NÍVEL DO IDIOMA MIGRADO É NULO, pela mesma razão, e esta é a linha que a auditoria vetou ver
-- preenchida com um palpite.
DO $$
DECLARE
	alvos uuid[] := ARRAY[
		'8249c09b-b022-4a5d-8576-8795070baad5',
		'2c1dd5ca-dc83-4cdf-88b7-41f6bd6ea605',
		'd2a91352-552c-48db-9ce9-ed71ca2473c5'
	]::uuid[];
	casaram int;
BEGIN
	SELECT count(*) INTO casaram FROM "vagas" WHERE "id" = ANY(alvos);

	-- A AFIRMAÇÃO. Zero é a base que não é a produção (homologação, um clone novo, o CI), e três é a
	-- produção conferida. QUALQUER outro número quer dizer que o alvo mudou embaixo desta migration,
	-- e nesse caso ela ABORTA em vez de migrar pela metade.
	IF casaram NOT IN (0, 3) THEN
		RAISE EXCEPTION 'Onda C: esperava 0 ou 3 vagas alvo, encontrei %. A migration NAO foi aplicada.', casaram;
	END IF;

	IF casaram = 3 THEN
		UPDATE "vagas"
		   SET "cidade_id" = 3550308,
		       -- VAGA SEM IDIOMA CONTINUA SEM IDIOMA: `NULL` e `[]` são estados diferentes (nunca
		       -- respondeu x respondeu "nenhum"), e a coluna nova preserva a distinção da velha.
		       "idiomas_exigidos" = CASE
		         WHEN "idiomas" IS NULL THEN NULL
		         ELSE (
		           SELECT coalesce(
		                    jsonb_agg(jsonb_build_object('idioma', i, 'nivel', NULL)),
		                    '[]'::jsonb
		                  )
		             FROM unnest("idiomas") AS i
		         )
		       END
		 WHERE "id" = ANY(alvos);
	END IF;
END $$;
