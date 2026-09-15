-- FILA DE ENTRADAS DO PANDAPÉ (OST do diretor, 15/09/2026): o registro DURÁVEL de todo evento que o
-- ATS mandou, que hoje não existe em lugar nenhum.
--
-- ┌─ O QUE ESTA MIGRATION EXISTE PARA CONSERTAR, medido contra produção ───────────────────────────┐
-- │ Um evento chegou em 11/09 15:59:57, o EA respondeu 202 e o worker tentou 5 vezes em 10         │
-- │ SEGUNDOS, todas estourando porque o Pandapé ainda devolvia o CPF zerado (o evento sai na pasta │
-- │ "Convite de admissão enviado", ANTES de a pessoa preencher). Dias depois o dado ficou válido e  │
-- │ ninguém re-tentou. O único rastro era um job no Redis, podado por CONTAGEM, que ainda por cima  │
-- │ terminou na lista `completed`: não aparecia nem entre os falhados. O buraco não é a falha, é o  │
-- │ SILÊNCIO dela.                                                                                  │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ §A.6, E ESTA TABELA É A TENTAÇÃO PERFEITA ────────────────────────────────────────────────────┐
-- │ Ela existe para mostrar numa tela QUEM não virou admissão, e o caminho mais curto para a tela   │
-- │ ficar boa é guardar aqui o nome e o CPF. NÃO PODE. Aqui só entram IDENTIFICADORES DO ATS e      │
-- │ CLASSIFICAÇÃO. Não há coluna `payload`, `detalhe`, `observacao` nem `json`, e não pode passar a │
-- │ haver: guardar o payload "para depurar" é a mesma violação com outro nome, e é pior, porque      │
-- │ ninguém olha uma coluna de payload até ela vazar.                                                │
-- │                                                                                                 │
-- │ `motivo` É ENUM, e é isso que torna o vazamento IMPOSSÍVEL em vez de improvável: gravar          │
-- │ `err.message` resolveria a tela em uma linha e criaria um vazamento permanente, porque a         │
-- │ mensagem é escrita por quem lançou, hoje e daqui a um ano, inclusive por biblioteca de terceiro. │
-- │ O `detail` do erro 23505 do Postgres traz o CPF POR EXTENSO, e não é hipótese: o unique parcial  │
-- │ de produção é `uq_admissao_cpf_vaga_viva (candidato_cpf, id_vacancy)`. Um código de conjunto     │
-- │ fechado não tem como trazer o CPF, porque não vem de lá.                                         │
-- │                                                                                                 │
-- │ O NOME DO CANDIDATO, que a tela mostra, vive num CACHE EM MEMÓRIA do processo (TTL de minutos,   │
-- │ teto com evicção), resolvido no worker. Nunca aqui.                                              │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- UMA LINHA POR CANDIDATO (`id_precollaborator`), NÃO POR EVENTO, e a gravação é UPSERT
-- (`ON CONFLICT DO UPDATE`), nunca `INSERT` puro. Isto não é preferência: com `INSERT` puro sobre
-- coluna unique, o SEGUNDO evento do mesmo candidato (o Pandapé dispara a cada mudança de etapa)
-- estouraria 23505, a gravação falharia, e como "registro falhou = 503 e não enfileira", o webhook
-- passaria a devolver 503 PARA SEMPRE para aquele candidato: o registro que existe para não perder
-- evento viraria a causa da perda. UNIQUE e não índice comum porque fila de trabalho quer uma linha
-- por PESSOA pendente, não N linhas da mesma pessoa.
--
-- `tentativas` conta SÓ tentativa de transformar o evento em admissão; o evento de etapa carimba
-- `ultimo_evento_em` e não mexe no contador.
--
-- A IDEMPOTÊNCIA DA CRIAÇÃO DE ADMISSÃO NÃO MUDA DE LUGAR: continua no unique de
-- `integracao_pandape`. Esta tabela é registro de ENTRADA, não trava.
--
-- O UNIQUE em `id_precollaborator` é a prova de que a re-entrega ATUALIZA em vez de duplicar: o
-- webhook é at-least-once de propósito (o 503 pede reenvio). A dedup do `jobId cand-<id>` só vale
-- enquanto o job está em voo, e o unique de `integracao_pandape` só existe DEPOIS de a admissão
-- nascer: entre um e outro há uma janela sem proteção, que é exatamente a janela em que esta linha
-- vive.

CREATE TYPE "public"."pandape_entrada_desfecho" AS ENUM('RECEBIDO', 'ADMISSAO_CRIADA', 'PRE_ADMISSAO', 'ADOTADO', 'NO_OP', 'FALHOU', 'NAO_ENFILEIRADO', 'DESCARTADO_DUPLICADO', 'INERTE', 'ADIADO');--> statement-breakpoint
CREATE TYPE "public"."pandape_entrada_motivo" AS ENUM('CPF_INVALIDO', 'SEM_CPF_NA_ORIGEM', 'SEM_NOME', 'SEM_DE_PARA', 'QUOTA_429', 'TIMEOUT', 'API_FORA', 'DUPLICADO', 'OUTRO');--> statement-breakpoint
CREATE TYPE "public"."pandape_entrada_origem" AS ENUM('WEBHOOK', 'TICK', 'MANUAL');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pandape_entrada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"id_precollaborator" varchar(80) NOT NULL,
	"id_match" varchar(80),
	"id_vacancy" varchar(80),
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"origem" "pandape_entrada_origem" NOT NULL,
	"desfecho" "pandape_entrada_desfecho" DEFAULT 'RECEBIDO' NOT NULL,
	"motivo" "pandape_entrada_motivo",
	"tentativas" integer DEFAULT 0 NOT NULL,
	"ultima_tentativa_em" timestamp with time zone,
	"ultimo_evento_em" timestamp with time zone,
	"resolvido_em" timestamp with time zone,
	"admissao_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pandape_entrada_id_precollaborator_unique" UNIQUE("id_precollaborator")
);--> statement-breakpoint
-- `set null` e NÃO cascade: apagar uma admissão não pode apagar a memória do evento que a originou.
ALTER TABLE "pandape_entrada" ADD CONSTRAINT "pandape_entrada_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- A fila é lida por "quem ainda está pendente" (resolvido_em IS NULL), ordenada pela chegada.
CREATE INDEX IF NOT EXISTS "idx_pandape_entrada_pendentes" ON "pandape_entrada" USING btree ("resolvido_em","recebido_em");

