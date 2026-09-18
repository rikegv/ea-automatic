-- FECHAMENTO DA FUNDAÇÃO UNIFICADORA: A RETENÇÃO SAI DE DENTRO DA ORIGEM, E AS DUAS GAVETAS VELHAS
-- DE IDENTIFICADOR EXTERNO CAEM. Desenho em `docs/MAPA-ALCANCE-FECHAMENTO-FUNDACAO.md`, seções 1 a 4.
--
-- ARQUIVO ESCRITO À MÃO. O `drizzle-kit` NÃO gera guarda nenhuma, e regenerar este SQL APAGA as três
-- que estão aqui. Qualquer regeneração precisa ser conferida linha a linha antes de subir.
--
-- ┌─ §A.6 (LGPD): O QUE ESTA MIGRATION FAZ, E POR QUE CADA GUARDA EXISTE ──────────────────────────┐
-- │ 1. `BANCO_TALENTOS` deixa de ser valor de `as_candidato_origem`. Ele nunca respondeu "de onde  │
-- │    a pessoa veio": respondia "quanto tempo se guarda", e o expurgo por retenção lia aquele     │
-- │    valor para poupar a pessoa PARA SEMPRE. Escolher um item num seletor de origem concedia     │
-- │    vida eterna a dado pessoal, sem papel e sem rastro.                                          │
-- │ 2. A retenção vira `as_candidatos.banco_talentos`, booleano, com cadeado de SUPER_ADMIN no     │
-- │    serviço e trilha própria em `as_retencao_eventos`.                                           │
-- │ 3. `as_candidatos.id_candidate_pandape` e `as_candidaturas.id_match_pandape` caem: identidade  │
-- │    externa tem UM dono dentro do módulo A&S, `as_identidades_externas`, que já nasce dentro do │
-- │    expurgo. Uma segunda gaveta de identificador de terceiro ficava fora daquele alcance.        │
-- │                                                                                                │
-- │ `pg_dump` DAS DUAS COLUNAS COMO BACKUP ESTÁ VETADO pelo protocolo de LGPD (exportar            │
-- │ identificador pessoal para arquivo). Com zero valores não há o que salvar, e é por isso que a  │
-- │ forma certa de proteger a execução é a CONTAGEM abaixo, e não uma cópia.                        │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘

-- ══ 1. A GUARDA DO VOCABULÁRIO, E ELA É POR VALOR, NUNCA POR TABELA VAZIA ══════════════════════
--
-- A INSTÂNCIA TEM CINCO BANCOS, QUATRO COM `as_candidatos`, E DOIS DELES TÊM LINHA (medido:
-- `ea_ensaio_migrations` com 3, `ea_homolog_clone_etapa1` com 2). Abortar "porque existe linha"
-- reprovaria a migration em dois bancos legítimos e travaria o deploy por um motivo falso.
--
-- O QUE PRECISA SER VERDADE É OUTRA COISA, mais estreita e exatamente a que importa: nenhuma linha
-- carrega `origem = 'BANCO_TALENTOS'`, que é o ÚNICO valor que o cast para o tipo novo não
-- conseguiria converter. Medido agora: zero nos quatro bancos.
--
-- E A CONTAGEM DE ONTEM NÃO PROTEGE A EXECUÇÃO DE AMANHÃ: entre a medição e o deploy cabe uma
-- gravação. A guarda roda no mesmo instante da conversão, ABORTA antes de tocar em dado, e o
-- comportamento seguro é abster-se (§A.33 aplicado a dado pessoal), nunca chutar.
DO $$
DECLARE presos int;
BEGIN
	SELECT count(*) INTO presos FROM "as_candidatos" WHERE "origem"::text = 'BANCO_TALENTOS';
	IF presos > 0 THEN
		RAISE EXCEPTION 'as_candidatos: % linha(s) com origem BANCO_TALENTOS. A separacao precisa que a retencao seja migrada para a coluna banco_talentos ANTES de o valor sair do tipo. A migration NAO foi aplicada.', presos;
	END IF;
END $$;--> statement-breakpoint

-- ══ 2. O TIPO É RECRIADO, E A ORDEM DOS SEIS PASSOS NÃO É NEGOCIÁVEL ═══════════════════════════
--
-- O POSTGRES NÃO APAGA VALOR DE ENUM (`ALTER TYPE ... DROP VALUE` não existe), então tirar
-- `BANCO_TALENTOS` significa RECRIAR o tipo e reapontar a coluna.
--
-- O `DROP DEFAULT` VEM PRIMEIRO PORQUE SEM ELE O PASSO DA CONVERSÃO FALHA: com o default posto, o
-- `ALTER COLUMN ... SET DATA TYPE` tenta converter a expressão do default junto e recusa. O default
-- volta no passo 5, com o mesmo valor de sempre.
--
-- O ÍNDICE `idx_as_candidatos_origem` É RECONSTRUÍDO SOZINHO pelo `SET DATA TYPE`, e `origem` de
-- `as_candidatos` é a ÚNICA coluna que usa o tipo (conferido no catálogo), então não há segunda
-- tabela a reapontar.
ALTER TABLE "as_candidatos" ALTER COLUMN "origem" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "as_candidato_origem" RENAME TO "as_candidato_origem_velho";--> statement-breakpoint
CREATE TYPE "as_candidato_origem" AS ENUM('PANDAPE', 'DIGAI', 'MANUAL', 'INDICACAO');--> statement-breakpoint
ALTER TABLE "as_candidatos" ALTER COLUMN "origem" SET DATA TYPE "as_candidato_origem" USING "origem"::text::"as_candidato_origem";--> statement-breakpoint
ALTER TABLE "as_candidatos" ALTER COLUMN "origem" SET DEFAULT 'MANUAL';--> statement-breakpoint
DROP TYPE "as_candidato_origem_velho";--> statement-breakpoint

-- ══ 3. A RETENÇÃO VIRA CAMPO PRÓPRIO ═══════════════════════════════════════════════════════════
--
-- `NOT NULL DEFAULT false`, e as duas metades importam: anulável faria `null` virar um terceiro
-- estado sem dono, e um default verdadeiro isentaria do expurgo todo mundo que entrasse na base.
--
-- NÃO HÁ CARGA DE DADO AQUI, e a ausência é consequência da guarda do passo 1: se nenhuma linha
-- tinha `BANCO_TALENTOS`, não há retenção antiga a preservar. Um `UPDATE ... WHERE origem =
-- 'BANCO_TALENTOS'` seria código morto que só existiria para parecer cuidadoso.
ALTER TABLE "as_candidatos" ADD COLUMN "banco_talentos" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ══ 4. A TRILHA DA RETENÇÃO ════════════════════════════════════════════════════════════════════
--
-- UMA LINHA POR TENTATIVA de mexer na marca que concede vida eterna a dado pessoal, INCLUSIVE a
-- RECUSADA: a pergunta de auditoria não é só "quem conseguiu", é "quem tentou", e tentativa
-- repetida pelo mesmo autor é o sinal de uso indevido. Sem esta linha ela não deixaria vestígio
-- nenhum, porque o protocolo proíbe PII no log de acesso.
--
-- AS DUAS FKs SÃO `restrict`, E É O DESVIO MAIS IMPORTANTE EM RELAÇÃO AO MOLDE
-- (`as_vaga_status_eventos`, que usa cascade para a vaga e set null para o autor): o rastro de uma
-- decisão sobre dado pessoal tem de SOBREVIVER à linha do candidato e responder QUEM decidiu, com
-- nome. Com `set null`, apagado o usuário, a trilha responderia "alguém".
--
-- NÃO EXISTE COLUNA DE TEXTO LIVRE, e a ausência é a defesa: é no campo de justificativa que o dado
-- pessoal reaparece, porque quem opera escreve o nome da pessoa ali. Sem o campo, não há onde
-- escrever. §A.6: esta tabela guarda um id de candidato, dois booleanos, um id de usuário INTERNO e
-- uma data, e por isso ela NÃO entra na lista de nulagem do expurgo.
--
-- `acao` E `resultado` SÃO COLUNAS SEPARADAS. Só com `resultado`, a trilha não distinguiria quem
-- tornou alguém permanente de quem DEVOLVEU alguém ao expurgo, que é a ação irreversível.
CREATE TABLE IF NOT EXISTS "as_retencao_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidato_id" uuid NOT NULL,
	"acao" varchar(20) NOT NULL,
	"de" boolean NOT NULL,
	"para" boolean NOT NULL,
	"autor_id" uuid NOT NULL,
	"resultado" varchar(20) NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_as_retencao_eventos_acao" CHECK ("acao" IN ('MARCAR','DESMARCAR')),
	CONSTRAINT "ck_as_retencao_eventos_resultado" CHECK ("resultado" IN ('APLICADO','RECUSADO'))
);--> statement-breakpoint
ALTER TABLE "as_retencao_eventos" ADD CONSTRAINT "as_retencao_eventos_candidato_id_as_candidatos_id_fk" FOREIGN KEY ("candidato_id") REFERENCES "public"."as_candidatos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_retencao_eventos" ADD CONSTRAINT "as_retencao_eventos_autor_id_usuarios_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_as_retencao_eventos_candidato" ON "as_retencao_eventos" USING btree ("candidato_id","em");--> statement-breakpoint

-- ══ 5. AS DUAS GAVETAS VELHAS CAEM, CADA UMA COM A SUA GUARDA ══════════════════════════════════
--
-- MEDIDO AGORA: zero valores não nulos nos quatro bancos com a tabela. A guarda não existe por
-- causa do número de hoje, existe por causa da data: entre a medição e o deploy cabe a primeira
-- gravação de uma ingestão, e apagar UM identificador pessoal em silêncio é irreversível.
--
-- ZERO VALORES, PASSA. Um valor que apareceu no meio, ABORTA, e quem o gravou tem de decidir para
-- onde ele vai (`as_identidades_externas`) antes de a coluna sumir.
--
-- OS DOIS UNIQUES PARCIAIS (`uq_as_candidatos_id_candidate_pandape` e
-- `uq_as_candidaturas_id_match_pandape`) CAEM JUNTO COM AS COLUNAS, pelo próprio `DROP COLUMN`, e é
-- por isso que não há um `DROP INDEX` aqui: escrever os dois criaria a chance de eles divergirem do
-- nome real no dia em que alguém renomeasse um deles.
DO $$
DECLARE presos int;
BEGIN
	SELECT count(*) INTO presos FROM "as_candidatos" WHERE "id_candidate_pandape" IS NOT NULL;
	IF presos > 0 THEN
		RAISE EXCEPTION 'as_candidatos: % linha(s) com id_candidate_pandape preenchido. Migre para as_identidades_externas antes de derrubar a coluna. A migration NAO foi aplicada.', presos;
	END IF;

	SELECT count(*) INTO presos FROM "as_candidaturas" WHERE "id_match_pandape" IS NOT NULL;
	IF presos > 0 THEN
		RAISE EXCEPTION 'as_candidaturas: % linha(s) com id_match_pandape preenchido. Migre para as_identidades_externas antes de derrubar a coluna. A migration NAO foi aplicada.', presos;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "as_candidatos" DROP COLUMN IF EXISTS "id_candidate_pandape";--> statement-breakpoint
ALTER TABLE "as_candidaturas" DROP COLUMN IF EXISTS "id_match_pandape";
