-- A&S, O CATÁLOGO DE MOTIVOS DE REENVIO DE SHORTLIST (Central de Vagas, decisão 6 do diretor).
--
-- O PONTO DE PARTIDA: `as_shortlists.motivo_reenvio` nasceu TEXTO LIVRE de 500 caracteres, com o
-- mesmo defeito que o motivo de descarte já pagou na 0129: o mesmo fato escrito de cinco jeitos, e
-- um campo que deveria responder "por que a lista foi refeita" respondendo "quem digitou".
--
-- MOLDE `motivos_descarte` (migration 0129), LINHA A LINHA: cinco colunas, unique no nome,
-- soft-delete por `ativo`, índice `(ativo, nome)` para o recorte único de leitura, semente com
-- `ON CONFLICT DO NOTHING`.
--
-- ┌─ A DIFERENÇA PARA A 0129, E ELA É DELIBERADA: AQUI FICA GRAVADA A **FK**, NÃO O NOME ────────┐
-- │ Na 0129 o que fica na candidatura é o NOME, porque o descarte é DESFECHO DE PESSOA e a       │
-- │ pergunta da trilha é "foi este o motivo NAQUELE DIA", mesmo que o catálogo mude depois.      │
-- │                                                                                              │
-- │ AQUI A PERGUNTA É OUTRA: o motivo do reenvio é fato de PROCESSO de uma vaga, lido em          │
-- │ relatório agregado ("quantos reenvios por mudança de perfil?"), e essa pergunta só tem        │
-- │ resposta exata com um id. O `restrict` completa: o motivo usado por uma shortlist não é       │
-- │ apagável, só INATIVÁVEL, então a linha nunca fica órfã e a leitura nunca perde a resposta.    │
-- │                                                                                              │
-- │ E RENOMEAR PASSA A REESCREVER A LEITURA HISTÓRICA, que é o preço do id e está aceito: a tela  │
-- │ de administração corrige grafia, e trocar o SIGNIFICADO continua sendo inativar um e criar    │
-- │ outro, exatamente como na 0129.                                                               │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A COLUNA VELHA É DERRUBADA, E NÃO HÁ DADO A MIGRAR. MEDIDO NOS DOIS BANCOS, EM 26/09/2026 ─┐
-- │ PRODUÇÃO (`ea_automatic`): 118 migrations aplicadas, e `to_regclass('public.as_shortlists')` │
-- │ volta NULO. A tabela ainda não existe lá, então não há linha nem texto a preservar.          │
-- │                                                                                              │
-- │ HOMOLOGAÇÃO (`ea_automatic_homolog`): 131 migrations aplicadas, a tabela EXISTE e tem UMA     │
-- │ linha. `count(motivo_reenvio)` nela é ZERO: a única shortlist gravada é um primeiro envio, e  │
-- │ primeiro envio tem o motivo PROIBIDO pelo CHECK. Nenhum texto foi escrito em lugar nenhum.    │
-- │                                                                                              │
-- │ ENTÃO NÃO EXISTE BACKFILL POSSÍVEL NEM NECESSÁRIO. Um `ALTER ... USING` sobre catálogo        │
-- │ inventado seria a fábrica criando vocabulário do diretor a partir de texto que ninguém        │
-- │ escreveu (§A.31). E o `DROP COLUMN IF EXISTS` abaixo é o que faz os dois bancos convergirem   │
-- │ pelo mesmo caminho, mesmo partindo de pontos diferentes.                                      │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nomes de motivo, um flag e uma FK. Nenhum dado pessoal, nenhum CPF, nenhuma URL. E há um
-- GANHO de minimização aqui: sai do banco o último campo de TEXTO LIVRE que a shortlist guardava, e
-- que o `seguranca` havia registrado como resíduo fora do alcance da varredura de retenção (a
-- shortlist pendura na VAGA, e a varredura é chaveada por candidato). Sem texto livre, sem resíduo.

CREATE TABLE IF NOT EXISTS "motivos_reenvio_shortlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nome" varchar(160) NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- UNIQUE NO NOME: é ele que faz o service devolver 409 com FRASE em vez de deixar o driver estourar
-- 500, e é ele que faz o `ON CONFLICT` da semente funcionar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motivos_reenvio_shortlist_nome_unique') THEN
    ALTER TABLE "motivos_reenvio_shortlist" ADD CONSTRAINT "motivos_reenvio_shortlist_nome_unique" UNIQUE ("nome");
  END IF;
END $$;--> statement-breakpoint

-- O RECORTE ÚNICO DE LEITURA: "os ativos, em ordem de nome", que enche o seletor do reenvio E é a
-- mesma consulta com que o service RECUSA motivo fora de circulação. Duas consultas divergiriam, e a
-- tela passaria a oferecer o que a rota recusa.
CREATE INDEX IF NOT EXISTS "idx_motivos_reenvio_shortlist_ativo"
  ON "motivos_reenvio_shortlist" ("ativo", "nome");--> statement-breakpoint

-- A SEMENTE É VOCABULÁRIO DE OPERAÇÃO, E O DIRETOR EDITA PELA TELA. São os motivos que a própria
-- OST nomeia ao descrever o gesto ("o cliente pediu outros perfis", "o cliente recusou os nomes") e
-- os que a operação de A&S já usa em prosa hoje. `ON CONFLICT DO NOTHING`, e o `DO NOTHING` é
-- deliberado em vez de um `DO UPDATE SET ativo = true`: reexecutar a migration não pode RESSUSCITAR
-- um motivo que o diretor tenha inativado pela tela depois. A semente planta, não governa.
INSERT INTO "motivos_reenvio_shortlist" ("nome")
VALUES
  ('Cliente Recusou Os Candidatos'),
  ('Cliente Pediu Outro Perfil'),
  ('Cliente Pediu Mais Nomes'),
  ('Candidato Desistiu'),
  ('Candidato Sem Retorno'),
  ('Correção Da Lista Enviada'),
  ('Ampliação Do Número De Posições')
ON CONFLICT ("nome") DO NOTHING;--> statement-breakpoint

-- ─ A SHORTLIST PASSA A APONTAR PARA O CATÁLOGO ────────────────────────────────────────────────
--
-- A ORDEM IMPORTA: o CHECK antigo fala da coluna antiga, então ele cai ANTES dela. Derrubar a
-- coluna com o CHECK de pé é erro de dependência, e reescrever o CHECK antes de a coluna nova
-- existir é o mesmo erro do outro lado.
ALTER TABLE "as_shortlists" DROP CONSTRAINT IF EXISTS "ck_as_shortlists_motivo_reenvio";--> statement-breakpoint

ALTER TABLE "as_shortlists" DROP COLUMN IF EXISTS "motivo_reenvio";--> statement-breakpoint

ALTER TABLE "as_shortlists" ADD COLUMN IF NOT EXISTS "motivo_reenvio_id" uuid;--> statement-breakpoint

-- RESTRICT, e não `set null`: com `set null` o diretor apagaria um motivo e um REENVIO passaria a
-- não ter motivo nenhum, violando o próprio CHECK abaixo em silêncio, numa linha que já estava
-- gravada. O catálogo não é apagável de qualquer forma (a administração INATIVA, nunca exclui), e
-- esta é a segunda camada, para quem escrever por fora da aplicação.
DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "as_shortlists_motivo_reenvio_id_fk"
    FOREIGN KEY ("motivo_reenvio_id") REFERENCES "public"."motivos_reenvio_shortlist"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- O MESMO CHECK DE SEMPRE, agora sobre a FK: primeiro envio SEM motivo (não há o que justificar, e
-- aceitar um ali criaria justificativa sem pergunta), reenvio COM motivo. No banco, e não só no DTO,
-- porque é a trilha do porquê de uma lista ter sido refeita.
DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "ck_as_shortlists_motivo_reenvio"
    CHECK (("numero" = 1 AND "motivo_reenvio_id" IS NULL) OR ("numero" > 1 AND "motivo_reenvio_id" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- A pergunta agregada que o id existe para responder: "quantos reenvios por este motivo?".
CREATE INDEX IF NOT EXISTS "idx_as_shortlists_motivo_reenvio"
  ON "as_shortlists" ("motivo_reenvio_id");
