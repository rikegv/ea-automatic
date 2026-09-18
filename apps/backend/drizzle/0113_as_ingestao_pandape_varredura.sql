-- A INGESTÃO DO PANDAPÉ POR VARREDURA: AS DUAS TABELAS DE APOIO.
--
-- Requisito medido em `docs/PLANO-INGESTAO-PANDAPE-VARREDURA.md` (621 vagas ativas, 137.654
-- inscrições vivas, volta a cada 30 minutos) mais a seção RESOLUÇÃO DOS VETOS, que prevalece.
--
-- ARQUIVO ESCRITO À MÃO, como a 0112: o `drizzle-kit` não gera os comentários nem as guardas, e
-- regenerar este SQL apagaria o `IF NOT EXISTS` que torna a subida repetível.
--
-- §A.6: NENHUMA DAS DUAS TABELAS GUARDA DADO PESSOAL. A primeira guarda id de vaga de terceiro e
-- uma data de inscrição; a segunda guarda dois ids técnicos. Não há CPF, nome, e-mail, telefone nem
-- campo de observação livre em lugar nenhum, e a ausência do campo livre é a defesa (o molde é o de
-- `as_retencao_eventos`).
--
-- NADA É ALTERADO EM TABELA EXISTENTE. A ingestão escreve em `as_candidatos`,
-- `as_identidades_externas`, `as_candidaturas` e `vagas` usando as colunas que já existem, e é isso
-- que mantém esta migration reversível por `DROP TABLE` sem tocar em dado de ninguém.

-- ══ 1. A MARCA DE ÁGUA DA VARREDURA ═══════════════════════════════════════════════════════════
--
-- O maior `insertDate` já ingerido POR VAGA. É REGISTRO, e não parada de leitura: mover alguém de
-- pasta NÃO altera o `insertDate` (medido), então parar de paginar na marca faria a varredura nunca
-- mais enxergar troca de etapa nem dado corrigido. Quem decide o que entra é a DATA DE CORTE, fixa.
--
-- `ultimo_insert_date` É TEXTO porque é o valor COMO O ATS o escreve. Convertê-lo para `timestamp`
-- obrigaria a escolher um fuso para uma data que às vezes vem sem ele, e a escolha erraria por horas
-- na borda do corte.
-- A LINHA TAMBEM E O REGISTRO DE PROPRIEDADE, e e por isso que ela guarda o `vaga_id`.
--
-- `vagas.id_vacancy_pandape` e coluna DIGITADA por gente na trilha da vaga (o schema diz isso, e o
-- indice dela NAO e unique). Uma propriedade lida pelo numero do ATS, portanto, nao separa NADA: a
-- vaga que um consultor cadastrou a mao com o numero dentro cairia no alcance da varredura, que
-- passaria a reabri-la, a reescrever o que ele digitou e a encerra-la com `encerrada_em` carimbado,
-- ligando relogio de exclusao irreversivel sobre gente de uma vaga que a varredura nao criou. A
-- propriedade e da LINHA, entao ela aponta para a linha.
--
-- `encerrada_pela_varredura_em` e o carimbo do encerramento AUTOMATICO, e ele existe para a
-- reabertura so desfazer o que a propria varredura fez: ela compara este instante com
-- `vagas.encerrada_em`, e so reabre quando os dois sao o MESMO. Fechamento feito por humano tem
-- outro instante, e fica onde esta.
CREATE TABLE IF NOT EXISTS "as_varredura_vagas" (
	"id_vacancy_pandape" varchar(40) PRIMARY KEY NOT NULL,
	"vaga_id" uuid NOT NULL,
	"ultimo_insert_date" varchar(40),
	"encerrada_pela_varredura_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_varredura_vagas_vaga" UNIQUE("vaga_id")
);
--> statement-breakpoint

-- `cascade` E NAO `restrict`, e a direcao e deliberada: a matricula NAO E DADO, e um registro de
-- propriedade sem a linha que ele possui nao quer dizer nada. Apagada a vaga, a varredura volta a
-- espelha-la do zero na proxima volta, que e o comportamento certo. `restrict` faria o oposto: a
-- matricula impediria o dono de apagar a propria vaga.
DO $$ BEGIN
	ALTER TABLE "as_varredura_vagas"
		ADD CONSTRAINT "as_varredura_vagas_vaga_id_vagas_id_fk"
		FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ══ 2. O CONFLITO DE IDENTIDADE, PARA REVISÃO HUMANA ══════════════════════════════════════════
--
-- Uma linha por caso em que o `idCandidate` do Pandapé aponta para uma pessoa e o CPF da MESMA
-- inscrição aponta para outra. O ciclo não escolhe e não funde: fusão automática de duas fichas é
-- IRREVERSÍVEL. E não escolher sem avisar perderia a inscrição a cada volta, em silêncio.
--
-- O `unique (fonte, identificador)` NÃO É ORGANIZAÇÃO, É CONTENÇÃO: a mesma inscrição volta a cada
-- 30 minutos, e sem ele um único caso irresolvido viraria 48 linhas por dia, para sempre.
--
-- A FK do candidato é `restrict`, como em `as_retencao_eventos` e pelo mesmo motivo: o rastro da
-- decisão sobrevive à linha.
CREATE TABLE IF NOT EXISTS "as_ingestao_conflitos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidato_id" uuid NOT NULL,
	"fonte" varchar(20) NOT NULL,
	"identificador" varchar(120) NOT NULL,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_ingestao_conflitos_fonte_identificador" UNIQUE("fonte","identificador"),
	-- A LISTA FECHADA DE FONTES É DERIVADA DE `domain/as-etapa-externa.ts`, e o CHECK aqui é o par
	-- dela, pelo mesmo argumento já escrito em `as_identidades_externas`: uma lista digitada no banco
	-- e outra no código concordam por coincidência, e param de concordar em silêncio.
	CONSTRAINT "ck_as_ingestao_conflitos_fonte" CHECK ("fonte" IN ('PANDAPE','DIGAI'))
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "as_ingestao_conflitos"
		ADD CONSTRAINT "as_ingestao_conflitos_candidato_id_as_candidatos_id_fk"
		FOREIGN KEY ("candidato_id") REFERENCES "public"."as_candidatos"("id")
		ON DELETE restrict ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_as_ingestao_conflitos_candidato" ON "as_ingestao_conflitos" USING btree ("candidato_id");
