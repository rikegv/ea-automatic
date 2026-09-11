-- A&S, A REABERTURA DA VAGA CANCELADA: o cancelamento passa a gravar QUEM ele descartou.
--
-- ┌─ O PROBLEMA QUE ESTA MIGRATION RESOLVE, e ele é de IDENTIDADE, não de tela ────────────────┐
-- │ Hoje o único jeito de saber quem o cancelamento descartou é o TEXTO "Vaga cancelada: X" no  │
-- │ motivo da saída, e esse campo é DIGITÁVEL À MÃO por qualquer consultor (`RegistrarSaidaDto` │
-- │ pede só dois caracteres). Casar por texto ressuscitaria quem a SELEÇÃO descartou de          │
-- │ propósito, e viraria atalho para burlar a ciência de reentrada, que hoje exige aceite e      │
-- │ grava `ACEITE_REENTRADA`.                                                                    │
-- │                                                                                              │
-- │ E O TEXTO NEM SEQUER IDENTIFICA O CANCELAMENTO, quando há mais de um: cancelar, reabrir sem  │
-- │ trazer ninguém, realocar a mesma pessoa e cancelar de novo produz DUAS saídas com o MESMO    │
-- │ texto. Reativar as duas violaria o unique parcial das candidaturas vivas e derrubaria a      │
-- │ transação inteira. Com o id do EVENTO, cada cancelamento tem o seu conjunto, sem ambiguidade.│
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE A SITUAÇÃO E O LADO DE ORIGEM PRECISAM SER GRAVADOS, e não deduzidos ─────────────┐
-- │ A heurística "tem posição marcada, logo estava alocado" É FALSA, e isso foi MEDIDO, não      │
-- │ suposto: existe candidatura `ATIVO` com `posicao_lado = OFICIAL` na base agora, porque ela   │
-- │ foi alocada, enviada para a admissão, e o `reverterEnvioParaAdmissao` a devolveu para        │
-- │ `ATIVO` SEM limpar o lado (está escrito no comentário daquele método, e é deliberado: o lado │
-- │ que sobra é memória de onde a pessoa estava). Chutar por ali devolveria à vaga uma ENTREGA   │
-- │ que nunca houve, enchendo o cilindro com gente que estava só em seleção.                     │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: as três colunas são de PROCESSO. Um id de evento interno, uma situação do vocabulário do
-- sistema e um lado de posição. Nenhum dado de candidato, nenhum CPF, nenhuma URL.
--
-- RISCO DE DADO: NULO. Três colunas NOVAS, NULÁVEIS e SEM default, numa tabela de histórico.
-- Nenhuma linha existente é reescrita e nenhuma consulta existente muda de resposta: o CHECK aceita
-- NULL, que é o valor de todas as linhas de hoje.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` nas colunas e no índice, e blocos `DO` nas
-- constraints, que não aceitam `IF NOT EXISTS` por sintaxe.

ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "vaga_status_evento_id" uuid;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "situacao_origem" "candidatura_situacao";--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "posicao_lado_origem" text;--> statement-breakpoint

-- `ON DELETE SET NULL`, e a escolha é a mesma de `vaga_de`/`vaga_para` logo ao lado: se o evento da
-- vaga sumir, o EVENTO DA CANDIDATURA continua existindo (a saída aconteceu) e perde só o ponteiro.
-- Perder a linha do tempo da pessoa junto com um rastro da vaga seria pior, e na prática a vaga com
-- candidatura já é protegida pelo RESTRICT de `as_candidaturas.vaga_id`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_candidatura_etapas_vaga_status_evento_id_fk') THEN
    ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_vaga_status_evento_id_fk"
      FOREIGN KEY ("vaga_status_evento_id") REFERENCES "public"."as_vaga_status_eventos"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- O LADO É UM DOS DOIS, OU AUSENTE, e é a mesma guarda de borda das duas colunas irmãs
-- (`as_candidaturas.posicao_lado` e `as_candidatura_etapas.posicao_lado`). Ausente aqui quer dizer
-- "esta pessoa não ocupava posição nenhuma", que é diferente de "ocupava a oficial": coalescer o
-- nulo para OFICIAL na volta devolveria uma entrega inventada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_candidatura_etapas_posicao_lado_origem') THEN
    ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "ck_as_candidatura_etapas_posicao_lado_origem"
      CHECK ("posicao_lado_origem" is null or "posicao_lado_origem" in ('OFICIAL', 'BANCO'));
  END IF;
END $$;--> statement-breakpoint

-- ÍNDICE PARCIAL, pela mesma razão do índice do aceite logo acima: a pergunta é sempre "quem saiu
-- NESTE cancelamento", nunca "todos os eventos". A coluna é nula na esmagadora maioria das linhas
-- (todo movimento de etapa, toda entrada, toda saída manual), e um índice cheio de nulos custaria
-- escrita em cada uma delas para responder sobre a minoria.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_etapas_vaga_status_evento"
  ON "as_candidatura_etapas" ("vaga_status_evento_id")
  WHERE "vaga_status_evento_id" is not null;
