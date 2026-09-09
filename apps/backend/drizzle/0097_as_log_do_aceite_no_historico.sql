-- A&S, O LOG DO ACEITE: o aviso que o consultor destravou deixa de ser jogado fora.
--
-- POR QUE ESTAS COLUNAS EXISTEM. O aviso do banco (alocar na reserva enquanto sobra posição
-- OFICIAL) AVISA e NÃO BLOQUEIA: o consultor confirma e passa. A confirmação vinha no corpo da
-- requisição, era LIDA para decidir e era DESCARTADA. A decisão mais cara de desfazer do módulo não
-- deixava rastro nenhum, e daqui a três meses ninguém saberia que alguém foi para a reserva com
-- cinco posições oficiais abertas, nem quem decidiu isso, nem o que ele estava vendo.
--
-- A RÉGUA É A §A.3 REGRA 8: aceite explícito que destrava uma guarda gera log PERMANENTE e
-- CONSULTÁVEL, com quem, quando e o estado no instante da decisão. Aqui o estado é quantas posições
-- oficiais estavam abertas quando o consultor confirmou.
--
-- POR QUE NESTA TABELA, E NÃO EM UMA NOVA. O evento que o aceite autorizou JÁ é gravado em
-- `as_candidatura_etapas`, na MESMA transação da mudança de situação, e já carrega quem (`por_id`) e
-- quando (`ocorrido_em`). O que faltava era o QUALIFICADOR da decisão, não o registro dela. Uma
-- tabela separada admitiria o estado impossível de existir o aceite sem o evento (ou o inverso).
--
-- §A.6, E O RECORTE É FIRME: um nome de guarda, um lado e um número. NENHUM dado de candidato,
-- nenhum CPF, nenhum nome de pessoa, nenhuma URL. O autor sai do `por_id`, que é usuário INTERNO, o
-- mesmo recorte do aceite de dupla correção da INT-4.
--
-- RISCO DE DADO: NULO. Três colunas NOVAS, NULÁVEIS e SEM default. Nenhuma linha existente é
-- reescrita e nenhuma consulta existente muda de resposta: quem não seleciona as colunas não as vê.
--
-- TEXTO COM CHECK, E NÃO ENUM NOVO DO POSTGRES, pelo mesmo motivo medido na 0095 e repetido na
-- 0096: valor criado por `ALTER TYPE ... ADD VALUE` não pode ser USADO na transação em que nasceu, e
-- o migrador do drizzle roda todas as migrations pendentes dentro de uma transação só.
--
-- `REENTRADA` ESTÁ NA LISTA E AINDA NÃO É ESCRITA POR NINGUÉM. O outro aceite do módulo (voltar
-- alguém a uma vaga em que já esteve) vive na `alocar`, que é código validado e ficou fora do
-- recorte desta OST. O valor fica previsto aqui para que ligar aquele registro seja uma linha de
-- service, e não uma migration nova na frente do diretor.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` nas colunas e no índice, e o `DO` nos checks,
-- que não aceitam `IF NOT EXISTS` por sintaxe.

ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "posicao_lado" text;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "aceite" text;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "aceite_numero" integer;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_candidatura_etapas_posicao_lado') THEN
    ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "ck_as_candidatura_etapas_posicao_lado"
      CHECK ("posicao_lado" is null or "posicao_lado" in ('OFICIAL', 'BANCO'));
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_candidatura_etapas_aceite') THEN
    ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "ck_as_candidatura_etapas_aceite"
      CHECK ("aceite" is null or "aceite" in ('BANCO_COM_OFICIAIS_ABERTAS', 'REENTRADA'));
  END IF;
END $$;--> statement-breakpoint

-- PARCIAL: a pergunta é sempre "onde houve aceite", nunca "todos os eventos". A coluna é nula na
-- esmagadora maioria das linhas, e um índice cheio de nulos custaria escrita em todo movimento de
-- etapa para responder sobre a minoria. É ele que faz o log ser CONSULTÁVEL, e não só gravado.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_etapas_aceite"
  ON "as_candidatura_etapas" ("aceite", "ocorrido_em")
  WHERE "aceite" is not null;
