-- A&S, O CANCELAMENTO DA VAGA (onda B1): o status que já era lido passa a ser ESCRITO.
--
-- O PONTO DE PARTIDA, medido antes de escrever a primeira linha: `CANCELADA` já existe no enum
-- `vaga_status`, já tem ramo próprio na leitura (o desfecho da vaga, os contadores congelados, o
-- card de KPI) e NENHUM escritor. A rota de cancelar não inventa um estado: ela liga um estado que
-- já tem comportamento definido, e é por isso que a exigência recai toda sobre a ESCRITA.
--
-- ┌─ POR QUE O CANCELAMENTO PRECISA DE TRILHA PRÓPRIA, e não só do status ─────────────────────┐
-- │ CANCELAR É A SEGUNDA PORTA PARA O ESTADO TERMINAL da vaga. A primeira (`fechar`) tem duas   │
-- │ travas e uma trilha de exceção; esta pula a trava das posições oficiais inteira, por decisão │
-- │ do diretor, e afrouxa a de "todo candidato tratado" de dura para "com aceite de Master". As  │
-- │ duas ausências são deliberadas, e a COMPENSAÇÃO É ESTA TRILHA: quem cancelou, quando, por    │
-- │ qual motivo, e, quando houve exceção, quem autorizou e quantos processos ele atropelou.      │
-- └────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- O MOTIVO É CATÁLOGO, MAS O QUE FICA GRAVADO NA VAGA É O NOME, e não uma FK. É exatamente o que a
-- vaga já faz com `motivos_contratacao`: inativar um motivo em março não trava a vaga cancelada em
-- janeiro, não exige `restrict`, e a vaga continua dizendo por que foi cancelada mesmo com o motivo
-- fora de circulação. A FK diria "este motivo existe HOJE"; o nome diz "foi este o motivo NAQUELE
-- dia", que é a pergunta que a trilha responde.
--
-- MOLDE `motivos_declinio`, E NÃO O MOLDE DAS ETAPAS. Motivo não tem ordem, não tem cor, não tem
-- "inicial" e não precisa resolver rótulo de histórico. Usar o molde das etapas seria pagar um
-- service inteiro de catálogo ordenável por uma lista de nomes.
--
-- A TABELA NASCE VAZIA, DE PROPÓSITO (§A.31). Semear "Cliente desistiu", "Vaga congelada" e afins
-- seria a fábrica decidindo lista de valor que é do diretor. Ele cadastra pela tela do catálogo.
--
-- §A.6: um id de usuário INTERNO, duas datas, um número e dois textos de PROCESSO (motivo e
-- observação do cancelamento). NENHUM dado de candidato, nenhum CPF, nenhum nome de pessoa, nenhuma
-- URL. Quem estava dentro da vaga no instante do cancelamento é derivável das candidaturas, e por
-- isso não se guarda aqui.
--
-- RISCO DE DADO: NULO. Uma tabela NOVA e vazia, e sete colunas NOVAS, NULÁVEIS e SEM default.
-- Nenhuma linha existente é reescrita, nenhuma consulta existente muda de resposta, e o CHECK aceita
-- NULL, que é o valor de todas as linhas de hoje.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` na tabela, nas colunas e nos índices, e blocos
-- `DO` nas constraints, que não aceitam `IF NOT EXISTS` por sintaxe.

CREATE TABLE IF NOT EXISTS "motivos_cancelamento_vaga" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" varchar(160) NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- UNIQUE NO NOME, e ele é a razão de o service devolver 409 em vez de deixar o driver estourar 500:
-- o diretor renomeia para corrigir grafia e esbarra em duplicata. Como é o NOME que fica gravado na
-- vaga, dois motivos homônimos tornariam a trilha ambígua na leitura, e não só no cadastro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motivos_cancelamento_vaga_nome_unique') THEN
    ALTER TABLE "motivos_cancelamento_vaga" ADD CONSTRAINT "motivos_cancelamento_vaga_nome_unique" UNIQUE ("nome");
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelada_por_id" uuid;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_motivo" varchar(160);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_observacao" text;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_forcado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_forcado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_forcado_seguravam" integer;--> statement-breakpoint

-- `ON DELETE SET NULL` NOS DOIS AUTORES, pela MESMA razão da 0098: apagar um usuário não pode
-- FALHAR por causa de uma vaga cancelada meses antes, e a trilha não pode sumir junto com ele. Sem o
-- autor, ela ainda diz QUANDO, POR QUE e QUANTOS processos foram atropelados. É por isso que NÃO
-- existe check de "tudo ou nada" entre as colunas: ele faria o DELETE do usuário quebrar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_cancelada_por_id_usuarios_id_fk') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cancelada_por_id_usuarios_id_fk"
      FOREIGN KEY ("cancelada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_cancelamento_forcado_por_id_usuarios_id_fk') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cancelamento_forcado_por_id_usuarios_id_fk"
      FOREIGN KEY ("cancelamento_forcado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- FORÇAR COM ZERO SEGURANDO NÃO EXISTE, e é o mesmo CHECK do forçamento do fechamento
-- (`ck_vagas_fechamento_forcado_faltavam`), pela mesma razão: se ninguém segurava, o cancelamento
-- passou pela régua NORMAL e não é exceção nenhuma. Zero gravado aqui seria uma trilha descrevendo
-- um fato que não aconteceu, e é justamente o número que a auditoria vai ler para saber o tamanho da
-- exceção que o Master autorizou.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vagas_cancelamento_forcado_seguravam') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_cancelamento_forcado_seguravam"
      CHECK ("cancelamento_forcado_seguravam" is null or "cancelamento_forcado_seguravam" > 0);
  END IF;
END $$;--> statement-breakpoint

-- PARCIAL, como o índice do forçamento da 0098: a pergunta é sempre "quais vagas foram canceladas",
-- nunca "todas as vagas". A coluna é nula na esmagadora maioria das linhas, e um índice cheio de
-- nulos custaria escrita em toda vaga para responder sobre a minoria. É ele que faz a trilha ser
-- CONSULTÁVEL, e não só gravada.
CREATE INDEX IF NOT EXISTS "idx_vagas_cancelada_em"
  ON "vagas" ("cancelada_em")
  WHERE "cancelada_em" is not null;--> statement-breakpoint

-- O CATÁLOGO É LIDO SEMPRE PELO MESMO RECORTE ("os ativos, em ordem de nome"), tanto para encher o
-- seletor da tela quanto para o service VALIDAR o nome que chegou no corpo. Índice comum: a tabela é
-- pequena e a coluna `ativo` não tem nulo a evitar.
CREATE INDEX IF NOT EXISTS "idx_motivos_cancelamento_vaga_ativo"
  ON "motivos_cancelamento_vaga" ("ativo", "nome");
