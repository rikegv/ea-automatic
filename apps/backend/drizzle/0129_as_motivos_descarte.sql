-- A&S, O CATÁLOGO DE MOTIVOS DE DESCARTE (Central de Vagas, Frente A, ponto 7).
--
-- O PONTO DE PARTIDA, medido antes de escrever a primeira linha: `as_candidaturas.motivo_descarte`
-- é TEXTO LIVRE desde que nasceu, e o próprio schema dizia por quê ("o vocabulário de descarte é da
-- operação e ainda está se formando"). Ele se formou. O efeito do texto livre é o de sempre: o mesmo
-- desfecho escrito de cinco jeitos, e um campo que deveria responder "por que esta pessoa saiu"
-- respondendo "quem digitou".
--
-- ┌─ ESTES SÃO MOTIVOS, E NÃO SITUAÇÕES NOVAS (decisão do diretor) ────────────────────────────┐
-- │ O enum `candidatura_situacao` NÃO É TOCADO por esta migration. Nenhum `ADD VALUE`, nenhum   │
-- │ valor novo. Transformar "reprovado" ou "stand by" em SITUAÇÃO mexeria na régua de posição e │
-- │ de ocupação (quem consome posição, quem a libera, quem segura o cancelamento da vaga), que  │
-- │ é código validado e nada tem a ver com o vocabulário do desfecho.                           │
-- └────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- MOLDE `motivos_cancelamento_vaga` (migration 0101), LINHA A LINHA: cinco colunas, unique no nome,
-- soft-delete por `ativo`, índice `(ativo, nome)` para o recorte único de leitura. O que fica gravado
-- na candidatura é o NOME, e NÃO uma FK, exatamente como a vaga já faz com o motivo de cancelamento e
-- com o motivo de contratação: inativar um motivo em março não trava a candidatura descartada em
-- janeiro, e ela continua dizendo por que a pessoa saiu mesmo com o motivo fora de circulação.
--
-- ┌─ A TABELA NASCE SEMEADA, e a diferença para a irmã 0101 é o DIRETOR, não a régua ──────────┐
-- │ A 0101 nasceu VAZIA porque a lista de valor ainda era do diretor e semeá-la seria a fábrica │
-- │ decidindo por ele (§A.31). Aqui ele DITOU as seis linhas, e semear o que ele ditou é o      │
-- │ oposto disso. Sem a semente, a validação da escrita recusaria TODO descarte no primeiro     │
-- │ minuto, porque o catálogo ativo estaria vazio.                                              │
-- │                                                                                             │
-- │ TITLE CASE (§A.24): são etiquetas de um seletor, não frase. "Stand By" repete a grafia que  │
-- │ `as_etapas_funil` já usa para a etapa de mesmo nome (migration 0111), para as duas telas não │
-- │ escreverem a mesma palavra de dois jeitos.                                                   │
-- └────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- RISCO DE DADO: NULO. Uma tabela NOVA, um índice NOVO e seis INSERTs nela. NENHUMA coluna existente
-- é alterada, NENHUMA linha de `as_candidaturas` é reescrita e NENHUMA consulta existente muda de
-- resposta. O texto livre que já está gravado em `motivo_descarte` fica exatamente como está: a
-- validação nova vale para ESCRITA NOVA, e a leitura do histórico não confere nada contra o catálogo.
-- Um backfill aqui reescreveria o passado que a coluna existe para guardar.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` na tabela e no índice, bloco `DO` na constraint
-- (que não aceita `IF NOT EXISTS` por sintaxe) e `ON CONFLICT DO NOTHING` na semente, para que rodar
-- duas vezes não duplique nem ressuscite um motivo que o diretor tenha inativado depois.
--
-- §A.6: nomes de motivo e um flag. Nenhum dado pessoal, nenhum CPF, nenhuma URL.

CREATE TABLE IF NOT EXISTS "motivos_descarte" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" varchar(160) NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- UNIQUE NO NOME, e ele é a razão de o service devolver 409 em vez de deixar o driver estourar 500.
-- Como é o NOME que fica gravado na candidatura, dois motivos homônimos tornariam a trilha ambígua na
-- LEITURA, e não só no cadastro. É também o que faz o `ON CONFLICT` da semente funcionar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motivos_descarte_nome_unique') THEN
    ALTER TABLE "motivos_descarte" ADD CONSTRAINT "motivos_descarte_nome_unique" UNIQUE ("nome");
  END IF;
END $$;--> statement-breakpoint

-- O CATÁLOGO É LIDO SEMPRE PELO MESMO RECORTE ("os ativos, em ordem de nome"), tanto para encher o
-- seletor da tela quanto para o `registrarSaida` VALIDAR o nome que chegou no corpo. Índice comum: a
-- tabela é pequena e `ativo` não tem nulo a evitar.
CREATE INDEX IF NOT EXISTS "idx_motivos_descarte_ativo"
  ON "motivos_descarte" ("ativo", "nome");--> statement-breakpoint

-- AS SEIS LINHAS QUE O DIRETOR DITOU. `ON CONFLICT ("nome") DO NOTHING`, e o `DO NOTHING` é
-- deliberado em vez de um `DO UPDATE SET ativo = true`: reexecutar a migration não pode RESSUSCITAR
-- um motivo que o diretor tenha inativado pela tela depois. A semente planta, não governa.
INSERT INTO "motivos_descarte" ("nome")
VALUES
  ('Reprovado'),
  ('Faltante'),
  ('Desistente'),
  ('Sem Interesse'),
  ('Sem Perfil'),
  ('Stand By')
ON CONFLICT ("nome") DO NOTHING;
