-- A&S, A TRILHA DO FECHAMENTO FORÇADO: a exceção do Master deixa de ser invisível.
--
-- POR QUE ESTAS COLUNAS EXISTEM. A vaga passou a fechar por CONTAGEM DE CANDIDATURAS, e não mais
-- pelo número digitado no formulário: ela só encerra quando todas as posições OFICIAIS estão
-- entregues. O MASTER (e o SUPER_ADMIN) podem passar por cima disso, porque acontece de o cliente
-- desistir de duas das cinco posições e a vaga precisar encerrar mesmo assim. O que não pode é a
-- exceção não deixar marca: sem estas colunas, uma vaga de 5 posições fechada com 2 entregues fica
-- indistinguível de uma que entregou as 5, e ninguém saberia quem autorizou nem o que ele via.
--
-- A RÉGUA É A §A.3 REGRA 8, a mesma do log de aceite da 0097: aceite explícito que destrava uma
-- guarda gera registro PERMANENTE e CONSULTÁVEL, com quem, quando e o estado no instante da decisão.
--
-- POR QUE COLUNAS, E NÃO UMA TABELA DE EVENTO. O forçamento acontece NO MÁXIMO UMA VEZ por vaga (a
-- vaga só fecha uma vez), então a tabela teria no máximo uma linha por vaga, com uma FK para chegar
-- nela, e o resto do fechamento (`data_fechamento`, `salario_fechamento`, `enviar_para_admissao`) já
-- mora nesta mesma linha. O `passagem_aceites`, que seria o candidato natural a reuso, NÃO serve:
-- ele tem FK NOT NULL para `admissoes` e `frentes_admissao`, e vaga não é admissão.
--
-- `faltavam` É CONGELADO E NÃO RECALCULADO, e este é o único número derivado que o módulo guarda.
-- Ele é a RAZÃO da exceção e é verdadeiro NAQUELE instante: a vaga continua viva, alguém pode ser
-- descartado depois, a meta pode mudar, e recalcular faria a trilha contar uma história diferente da
-- que aconteceu. Carimbo histórico de um fato, não contador vivo.
--
-- §A.6: um id de usuário INTERNO, uma data e um número. NENHUM dado de candidato, nenhum CPF,
-- nenhum nome de pessoa, nenhuma URL. Quem faltou é derivável das candidaturas a qualquer momento,
-- e por isso não se guarda.
--
-- `ON DELETE SET NULL` NO AUTOR, e a escolha tem consequência que o CHECK abaixo respeita: apagar um
-- usuário não pode FALHAR por causa de uma vaga fechada meses antes, e a trilha não pode sumir junto
-- com ele. Sem o autor, ela ainda diz quando e quantas faltavam. Por isso NÃO existe check de "tudo
-- ou nada" entre as três colunas: ele faria o DELETE do usuário quebrar.
--
-- RISCO DE DADO: NULO. Três colunas NOVAS, NULÁVEIS e SEM default. Nenhuma linha existente é
-- reescrita, nenhuma consulta existente muda de resposta, e o CHECK aceita NULL, que é o valor de
-- todas as linhas de hoje.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` nas colunas e no índice, e o bloco `DO` nas
-- constraints, que não aceitam `IF NOT EXISTS` por sintaxe.

ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "fechamento_forcado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "fechamento_forcado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "fechamento_forcado_faltavam" integer;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_fechamento_forcado_por_id_usuarios_id_fk') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "vagas_fechamento_forcado_por_id_usuarios_id_fk"
      FOREIGN KEY ("fechamento_forcado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

-- FORÇAR COM ZERO FALTANDO NÃO EXISTE: se não faltava nada, o fechamento passou pela régua normal e
-- não é exceção. Zero aqui seria uma trilha que descreve um fato que não aconteceu.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vagas_fechamento_forcado_faltavam') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_fechamento_forcado_faltavam"
      CHECK ("fechamento_forcado_faltavam" is null or "fechamento_forcado_faltavam" > 0);
  END IF;
END $$;--> statement-breakpoint

-- PARCIAL: a pergunta é sempre "quais vagas foram forçadas", nunca "todas as vagas". A coluna é nula
-- na esmagadora maioria das linhas, e um índice cheio de nulos custaria escrita em todo fechamento
-- para responder sobre a minoria. É ele que faz a trilha ser CONSULTÁVEL, e não só gravada.
CREATE INDEX IF NOT EXISTS "idx_vagas_fechamento_forcado"
  ON "vagas" ("fechamento_forcado_em")
  WHERE "fechamento_forcado_em" is not null;
