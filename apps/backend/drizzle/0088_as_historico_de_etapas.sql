-- O HISTORICO DE ETAPAS DA CANDIDATURA (A&S, bug 1 da validacao do diretor).
--
-- O PROBLEMA QUE ESTA TABELA RESOLVE. `as_candidaturas` tem UMA coluna `etapa`, e o `moverEtapa` a
-- SOBRESCREVE. Por onde a pessoa passou nunca foi gravado em lugar nenhum: nem para quem esta vivo,
-- nem para quem foi descartado. A unica tabela de historico do modulo e `as_contatos`, que responde
-- outra pergunta ("falamos com esta pessoa quando"), nao esta.
--
-- POR QUE ISSO VIROU BLOQUEIO AGORA: a decisao do diretor e que o descartado SAIA da leitura viva do
-- funil (a etapa dele deixa de ser mostrada e deixa de casar no filtro). Tirar a etapa da tela sem
-- ter onde guardar por onde ele passou seria trocar um dado errado por dado nenhum. A tabela e o que
-- torna a peca P1 honesta: a etapa ATUAL sai da contagem, o CAMINHO fica registrado.
--
-- ── O MODELO, e ele guarda TRES tipos de evento numa tabela so ────────────────────────────────
--
--   ENTRADA    `etapa_de` NULA e `situacao` NULA. A candidatura nasceu naquela etapa.
--   MOVIMENTO  `etapa_de` preenchida, `situacao` NULA. Andou de uma etapa para outra.
--   DESFECHO   `situacao` preenchida. Encerrou (ou foi aprovada) ESTANDO em `etapa_para`.
--
-- O TIPO NAO E UMA COLUNA, E ISSO E DELIBERADO. Ele e DERIVADO destes dois campos
-- (`domain/candidatura-historico.ts`, funcao `tipoDoEvento`). Guardar o tipo criaria um terceiro
-- numero que pode discordar dos dois primeiros, que e exatamente o defeito que o modulo inteiro
-- evita ao nunca guardar contador de ocupacao (`ocupacaoDaVaga` deriva, nao le contador salvo).
--
-- `etapa_para` E NOT NULL INCLUSIVE NO DESFECHO, e e ele que faz a frase "descartado na Triagem"
-- existir: o desfecho e gravado com a etapa em que a pessoa ESTAVA quando a decisao foi tomada.
--
-- `motivo` REPETE O `motivo_descarte` DA CANDIDATURA DE PROPOSITO. Nao e desnormalizacao preguicosa:
-- a candidatura guarda o motivo do desfecho ATUAL (um so, sobrescrito na reentrada), e o historico
-- guarda o motivo DAQUELE evento, que continua verdadeiro depois. §A.6: e texto do PROCESSO, mesma
-- natureza do `motivo_descarte` que ja existe, nao e identificador de pessoa.
--
-- ── O BACKFILL: UMA ENTRADA POR CANDIDATURA, E SO A VERDADE ───────────────────────────────────
--
-- Decisao do diretor: semear UMA linha por candidatura existente, com a ETAPA ATUAL e o carimbo de
-- `alocado_em`, e NADA MAIS. NAO se fabrica passagem intermediaria: ninguem sabe se a pessoa que
-- esta hoje em Aprovacao passou por Triagem, e inventar o caminho encheria a ficha de historia que
-- nunca aconteceu. A semente e ENTRADA (`etapa_de` nula), que e a unica afirmacao segura: "nesta
-- data esta candidatura estava nesta etapa".
--
-- A SEMENTE NAO GRAVA DESFECHO, nem para quem ja esta descartado. O desfecho passado nao tem data
-- propria confiavel (`atualizado_em` se move com qualquer edicao) nem autor registrado, entao
-- grava-lo seria carimbar um evento com data e autor inventados. Quem ja esta encerrado hoje mostra
-- a entrada e o desfecho aparece pelo estado atual da candidatura, que a ficha ja tem.
--
-- IDEMPOTENTE: o `not exists` faz a semente rodar duas vezes sem duplicar.

CREATE TABLE IF NOT EXISTS "as_candidatura_etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidatura_id" uuid NOT NULL,
	"etapa_de" "candidatura_etapa",
	"etapa_para" "candidatura_etapa" NOT NULL,
	"situacao" "candidatura_situacao",
	"motivo" text,
	"por_id" uuid,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- CASCADE no candidatura_id: o historico e da candidatura, e nao sobrevive a ela. Mesma regra do
-- `as_contatos`, que ja pende da candidatura com CASCADE.
ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_candidatura_id_as_candidaturas_id_fk" FOREIGN KEY ("candidatura_id") REFERENCES "public"."as_candidaturas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- SET NULL no autor: usuario desativado e removido nao apaga o evento. O que aconteceu continua
-- tendo acontecido; o que se perde e so o nome de quem fez, e perder o evento seria pior.
ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_por_id_usuarios_id_fk" FOREIGN KEY ("por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- O INDICE E (candidatura, ocorrido_em): a ficha le a linha do tempo de UMA candidatura em ordem, e
-- e essa exatamente a consulta que a P3 faz.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_etapas_candidatura" ON "as_candidatura_etapas" USING btree ("candidatura_id","ocorrido_em");--> statement-breakpoint

INSERT INTO "as_candidatura_etapas" ("candidatura_id", "etapa_de", "etapa_para", "situacao", "motivo", "por_id", "ocorrido_em")
SELECT c."id", NULL, c."etapa", NULL, NULL, c."alocado_por_id", c."alocado_em"
  FROM "as_candidaturas" c
 WHERE NOT EXISTS (
   SELECT 1 FROM "as_candidatura_etapas" h WHERE h."candidatura_id" = c."id"
 );
