-- FUNDAÇÃO DA PLATAFORMA UNIFICADORA, PEÇA 1: A TABELA DE IDENTIDADES EXTERNAS (uma pessoa, N
-- identidades de fonte externa). Desenho em `docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seções 8 e 9.
-- As peças 2 (reposição das 5 etapas do funil) e 3 (o de/para das etapas externas) vêm na 0110.
--
-- ┌─ §A.6 (LGPD): O QUE ESTA MIGRATION CRIA E O QUE ELA NUNCA PODE VIRAR ──────────────────────────┐
-- │ `as_identidades_externas` guarda IDENTIFICADOR DE TERCEIRO, que o protocolo LGPD da fábrica    │
-- │ classifica como dado pessoal. Ela tem SEIS colunas mais o id, e a tentação permanente é a      │
-- │ sétima: guardar o nome, o e-mail ou "o payload, para depurar". Não pode. A tabela existe para  │
-- │ LIGAR uma pessoa a um id de fora, e um espelho da fonte seria um segundo cadastro de pessoas,  │
-- │ com retenção própria, fora do alcance do expurgo que já existe.                                 │
-- │                                                                                                 │
-- │ O EXPURGO JÁ ALCANÇA ESTA TABELA no mesmo commit em que ela nasce (exigência D1 do parecer de  │
-- │ segurança): `retencao-candidatos.service.ts` apaga as linhas de identidade na MESMA instrução   │
-- │ que anonimiza a pessoa. O identificador externo nasce dentro do expurgo, nunca depois dele.     │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE ESTA MIGRATION É SÓ A TABELA, e a reposição das etapas mais o de/para vêm na 0110 ────┐
-- │ As três peças nasceram no mesmo pedido e caberiam num arquivo só (todas as migrations          │
-- │ pendentes rodam numa transação só, então fronteira de arquivo não é fronteira de commit). O    │
-- │ que separou foi a LEITURA: a cobertura desta tabela lê do disco TODA migration que a MENCIONA  │
-- │ e afirma sobre as restrições encontradas ali, e num arquivo único o `unique (fonte,            │
-- │ chave_externa)` do de/para era lido como se fosse uma restrição DESTA tabela.                  │
-- │                                                                                                │
-- │ ISSO NÃO É CAPRICHO DE TESTE, É A PROPRIEDADE MAIS CARA DA FRENTE: a asserção que o falso      │
-- │ positivo derrubava é justamente a de que NENHUM unique daqui limita a PESSOA. Um arquivo por   │
-- │ assunto mantém a afirmação legível para quem lê o SQL e para quem o mede.                       │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘

-- ══ IDENTIDADES EXTERNAS ════════════════════════════════════════════════════════════════════════
--
-- O UNIQUE É (fonte, identificador) E É A REGRA DA ORIGEM: um `IdPreCollaborator` tem um dono só no
-- Pandapé, logo não pode apontar para duas pessoas aqui.
--
-- NÃO EXISTE `unique (candidato_id, fonte)`, e a ausência é o desenho, não esquecimento: duas linhas
-- da MESMA fonte para a MESMA pessoa são exatamente o material que a deduplicação futura vai
-- resolver. Proibi-las apagaria a razão da tabela, e o erro só apareceria no dia em que a ingestão
-- estourasse chave duplicada em produção.
--
-- O `default now()` DE `coletado_em` É PISO PARA ESCRITA MANUAL, e não o valor esperado: o ingestor
-- preenche o instante da coleta EXPLICITAMENTE. Deixar o default responder por uma carga faria a
-- linha jurar que o dado foi coletado no dia em que a carga rodou, e a data existe justamente para
-- responder a essa pergunta a um titular.
--
-- O `ON DELETE CASCADE` NÃO É REDE DE PROTEÇÃO DO EXPURGO (achado P5 do parecer): o expurgo
-- ANONIMIZA e PRESERVA a linha do candidato, então o cascade NUNCA dispara por aquele caminho. Ele
-- cobre o `delete` de verdade de um candidato, em que a identidade sobreviveria à pessoa.
CREATE TABLE IF NOT EXISTS "as_identidades_externas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidato_id" uuid NOT NULL,
	"fonte" varchar(20) NOT NULL,
	"identificador" varchar(120) NOT NULL,
	"coletado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_identidades_externas_fonte_identificador" UNIQUE("fonte","identificador"),
	-- LISTA FECHADA, e é ela que separa "origem" de "texto livre": sem o CHECK, `PANDAPE`,
	-- `pandape` e `Pandapé` viram três origens do mesmo sistema, cada uma com o unique dela.
	CONSTRAINT "ck_as_identidades_externas_fonte" CHECK ("fonte" IN ('PANDAPE','DIGAI'))
);--> statement-breakpoint
ALTER TABLE "as_identidades_externas" ADD CONSTRAINT "as_identidades_externas_candidato_id_as_candidatos_id_fk" FOREIGN KEY ("candidato_id") REFERENCES "public"."as_candidatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A pergunta do dia a dia é "onde mais esta pessoa aparece", e ela varre por candidato.
CREATE INDEX IF NOT EXISTS "idx_as_identidades_externas_candidato" ON "as_identidades_externas" USING btree ("candidato_id");
