-- FUNDAÇÃO DA PLATAFORMA UNIFICADORA, PEÇAS 2 E 3: a reposição das 5 etapas do funil e o de/para das
-- etapas externas. Desenho em `docs/MAPA-ALCANCE-FUNDACAO-UNIFICADORA.md`, seções 2, 3, 8 e 9.
--
-- ┌─ AS DUAS PEÇAS ANDAM JUNTAS, E A ORDEM DENTRO DO ARQUIVO É OBRIGATÓRIA ────────────────────────┐
-- │ A semente do de/para aponta para CAPTACAO, TRIAGEM, ENTREVISTA_SOULAN e ENTREVISTA_CLIENTE, e  │
-- │ a FK é RESTRICT: num banco zerado, o de/para antes das etapas derrubaria a migration. Separar  │
-- │ as duas em arquivos distintos não protegeria nada (todas as pendentes rodam numa transação só) │
-- │ e só criaria a chance de alguém rodar a metade de baixo primeiro.                               │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada de pessoal entra aqui. Código de etapa, nome de pasta de vaga e dois booleanos.

-- ══ AS 5 ETAPAS DO FUNIL, REPOSTAS ═══════════════════════════════════════════════════════════
--
-- A base foi ZERADA por decisão do diretor em 17/09, e a semente da 0100 não volta sozinha: aquela
-- migration já consta como aplicada no `_journal.json`, e o runner não reexecuta migration aplicada.
-- A reposição precisa de migration NOVA, e ela precisa ser IDEMPOTENTE, porque roda em bancos que
-- ainda têm o catálogo inteiro (produção) e em bancos vazios (homologação zerada).
--
-- ┌─ AS TRÊS TRAVAS, exigidas pelo parecer de segurança, e cada uma protege um gesto do diretor ───┐
-- │ 1. `ON CONFLICT (codigo) DO NOTHING`, NUNCA `DO UPDATE`. O rótulo, a ordem e o tom são         │
-- │    EDITÁVEIS na tela do funil, e um `DO UPDATE` desfaria a edição dele a cada deploy, em        │
-- │    silêncio, devolvendo o catálogo ao que a fábrica achou em setembro.                          │
-- │ 2. NÃO REATIVA ETAPA INATIVADA. `ativa` nem aparece no INSERT, e o `DO NOTHING` garante que a   │
-- │    linha existente não é tocada: inativar é decisão de operação, e ressuscitar a etapa faria a  │
-- │    opção voltar ao seletor de quem move candidato.                                              │
-- │ 3. NÃO CRIA UM SEGUNDO `inicial`. Todas entram com `inicial = false` e a marcação é um UPDATE   │
-- │    CONDICIONADO a não haver nenhuma inicial. O índice parcial único                              │
-- │    `as_etapas_funil_inicial_unica` recusaria a segunda e derrubaria a migration inteira.        │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- A LISTA ABAIXO É A CÓPIA FIEL DE `ETAPAS_FUNIL_SEMENTE` (`@ea/shared-types`), que é a mesma da
-- 0100. Migration é SQL e não importa TypeScript, então a cópia é inevitável aqui; o que não se faz
-- é redigitar de memória, e o que mantém as duas honestas é o `DO NOTHING`, que nunca sobrescreve.
INSERT INTO "as_etapas_funil" ("codigo", "rotulo", "ordem", "tom", "inicial")
VALUES
  ('CAPTACAO',          'Captação',           1, 'nt', false),
  ('TRIAGEM',           'Triagem',            2, 'in', false),
  ('ENTREVISTA_SOULAN', 'Entrevista Soulan',  3, 'wn', false),
  ('ENTREVISTA_CLIENTE','Entrevista Cliente', 4, 'or', false),
  ('APROVACAO',         'Aprovação',          5, 'ok', false)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- A INICIAL É A CAPTAÇÃO, E SÓ SE NÃO HOUVER NENHUMA. Num banco em que o diretor já escolheu outra
-- etapa como inicial, esta linha não faz nada: a escolha dele é dado de operação, não de deploy.
-- O `ativa` no WHERE fecha o caso torto de uma Captação inativada ser promovida a porta de entrada
-- do funil, que deixaria a candidatura nascendo numa etapa que ninguém vê.
UPDATE "as_etapas_funil"
   SET "inicial" = true, "atualizado_em" = now()
 WHERE "codigo" = 'CAPTACAO'
   AND "ativa"
   AND NOT EXISTS (SELECT 1 FROM "as_etapas_funil" WHERE "inicial");--> statement-breakpoint

-- ══ O DE/PARA DA ETAPA EXTERNA ═══════════════════════════════════════════════════════════════
--
-- A CHAVE É O NOME NORMALIZADO (`normalizarChaveExterna`, em `domain/as-etapa-externa.ts`: sem
-- acento, sem o que está entre parênteses, minúsculas, pontuação virando espaço, espaços
-- colapsados), e nunca o nome cru. As pastas do Pandapé são TEXTO LIVRE e mudam de vaga para vaga,
-- com caixa irregular no meio da palavra e instrução entre parênteses: casar por texto cru faria o
-- de/para funcionar numa vaga e falhar na vaga do lado, em silêncio.
--
-- OS DOIS DESTINOS SÃO NULÁVEIS E UM CHECK OBRIGA PELO MENOS UM: nem toda etapa externa é um caneco
-- do funil. `Descartados` não muda a ETAPA da pessoa, muda o DESFECHO dela, e forçar uma etapa ali
-- escreveria no histórico um movimento que não aconteceu.
CREATE TABLE IF NOT EXISTS "as_depara_etapa_externa" (
	"id" serial PRIMARY KEY NOT NULL,
	"fonte" varchar(20) NOT NULL,
	"chave_externa" varchar(160) NOT NULL,
	"rotulo_externo" varchar(200) NOT NULL,
	"etapa_codigo" varchar(40),
	"situacao" varchar(40),
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_depara_etapa_externa_fonte_chave" UNIQUE("fonte","chave_externa"),
	CONSTRAINT "ck_as_depara_etapa_externa_fonte" CHECK ("fonte" IN ('PANDAPE','DIGAI')),
	-- A situação, quando preenchida, é do vocabulário de `CANDIDATURA_SITUACOES`.
	CONSTRAINT "ck_as_depara_etapa_externa_situacao" CHECK ("situacao" IS NULL OR "situacao" IN ('ATIVO','APROVADO','ALOCADO','DESCARTADO','DESISTIU','ENVIADO_PARA_ADMISSAO')),
	-- Um mapeamento que não diz nem etapa nem desfecho não é mapeamento.
	CONSTRAINT "ck_as_depara_etapa_externa_destino" CHECK ("etapa_codigo" IS NOT NULL OR "situacao" IS NOT NULL)
);--> statement-breakpoint
-- RESTRICT pela mesma razão das três colunas de `as_candidaturas`: apagar uma etapa do catálogo não
-- pode deixar um de/para apontando para um código que não existe mais, em silêncio.
ALTER TABLE "as_depara_etapa_externa" ADD CONSTRAINT "as_depara_etapa_externa_etapa_codigo_as_etapas_funil_codigo_fk" FOREIGN KEY ("etapa_codigo") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ┌─ A SEMENTE TEM QUATRO CASAMENTOS, E AS CINCO AUSÊNCIAS SÃO DELIBERADAS ────────────────────────┐
-- │ Os nomes são os REAIS, medidos na API do Pandapé numa vaga da conta                            │
-- │ (`docs/MAPA-COMPLETO-API-PANDAPE.md`, seção 3.3), e não supostos. `Lead` e `Inscritos` são duas │
-- │ pastas distintas que caem na MESMA etapa, e por isso são duas linhas: a chave é a pasta, não a  │
-- │ etapa.                                                                                          │
-- │                                                                                                 │
-- │ AS CINCO QUE FALTAM NÃO ESTÃO ESQUECIDAS, E NINGUÉM DEVE "CONSERTAR" ISTO DEPOIS:               │
-- │ `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)`, `Contratados`, `RETORNO VAGA STAND BY`,     │
-- │ `RETORNO NEGATIVO` e `Descartados` aguardam DECISÃO DO DIRETOR. As quatro últimas são           │
-- │ candidatas a DESFECHO (situação), não a etapa, e escolher por ele escreveria na trilha de       │
-- │ pessoas reais um movimento que ninguém decidiu. Sem linha, o resolvedor devolve NÃO MAPEADA e o │
-- │ chamador não faz nada: é fail-closed, e é o comportamento certo.                                 │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
INSERT INTO "as_depara_etapa_externa" ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo")
VALUES
  ('PANDAPE', 'lead',                             'Lead',                           'CAPTACAO'),
  ('PANDAPE', 'inscritos',                        'Inscritos',                      'CAPTACAO'),
  ('PANDAPE', 'triados',                          'triados',                        'TRIAGEM'),
  ('PANDAPE', 'entrevista soulan',                'ENTREVISTA SOULAN',              'ENTREVISTA_SOULAN'),
  ('PANDAPE', 'short list encaminhados cliente',  'SHORT LIST, ENCAMINHADOS CLIENTE','ENTREVISTA_CLIENTE')
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;
