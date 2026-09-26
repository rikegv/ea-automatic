-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0131 — FRENTE E DA CENTRAL DE VAGAS: ENTREVISTA, PRETENSÃO, SHORTLIST E REPROVAÇÃO PELO CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ┌─ OS CINCO PONTOS DO DIRETOR, E CADA `ALTER` ABAIXO É UM DELES ────────────────────────────────┐
-- │  8.  DATA E HORÁRIO DA ENTREVISTA, marcados pelo time, na etapa Soulan e TAMBÉM na Cliente.   │
-- │  9.  PRETENSÃO SALARIAL, pedida quando o MOTIVO do desfecho a pede (marca no CATÁLOGO).       │
-- │ 10/11. SHORTLIST: conjunto de candidatos, ENVIO ao cliente, REENVIO com motivo e data, e      │
-- │      aviso NÃO BLOQUEANTE quando a primeira tem menos de 3 candidatos.                        │
-- │ 12.  REPROVADO PELO CLIENTE volta para a ETAPA INICIAL, que vem do catálogo, nunca de literal.│
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A REGRA QUE GOVERNA ESTA MIGRATION INTEIRA: NENHUM LITERAL DE CATÁLOGO NO CÓDIGO ────────────┐
-- │ Três perguntas de COMPORTAMENTO viram FLAG em tabela que o diretor edita, e nenhuma delas     │
-- │ vira `if codigo === '...'` em TypeScript:                                                      │
-- │   . "nesta etapa se marca entrevista?"  -> `as_etapas_funil.tem_entrevista` (NOVA)            │
-- │   . "este motivo pede a pretensão?"     -> `motivos_descarte.pede_pretensao` (NOVA)           │
-- │   . "para onde volta o reprovado?"      -> `as_etapas_funil.inicial` (JÁ EXISTE, 0100)        │
-- │   . "quem está com o cliente?"          -> `as_etapas_funil.entrega_ao_cliente` (0130)        │
-- │ É a mesma decisão que a 0102 e a 0130 tomaram, pelo mesmo motivo: a LISTA é do diretor, o     │
-- │ COMPORTAMENTO é do sistema. Comparar por NOME quebraria em silêncio no dia em que ele         │
-- │ corrigisse a grafia de um motivo, e ninguém ficaria sabendo (o campo simplesmente pararia de  │
-- │ ser pedido).                                                                                   │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: a única coluna de DADO PESSOAL criada aqui é `as_candidaturas.pretensao_salarial`, que é
-- dado financeiro de pessoa. Ela nasce NULA em toda a base, é escrita por UMA porta só (o descarte
-- cujo motivo a pede), NUNCA entra em log, NÃO desce em listagem e É EXPURGADA pela varredura de
-- retenção junto com o `motivo_descarte` (ver `retencao-candidatos.service.ts`). Todo o resto desta
-- migration é flag de catálogo, id técnico, data e frase de processo.
--
-- RISCO DE DADO: NULO. Quatro colunas NOVAS (todas com default que descreve o que a base JÁ É),
-- três tabelas NOVAS e duas linhas de catálogo marcadas. NENHUMA coluna existente muda de tipo,
-- NENHUMA linha de `as_candidaturas`, `vagas` ou `as_candidatura_etapas` é reescrita, e NENHUMA
-- consulta existente muda de resposta.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` em coluna, tabela e índice, bloco `DO` nas
-- constraints (que não aceitam `IF NOT EXISTS` por sintaxe) e os `UPDATE` da semente são
-- idempotentes por construção (escrevem o mesmo valor de novo).

-- ── 8. EM QUAIS ETAPAS SE MARCA ENTREVISTA ──────────────────────────────────────────────────────
--
-- ┌─ ELE NÃO É ÚNICO, E É AÍ QUE ELE DIFERE DOS DOIS FLAGS DE ETAPA QUE JÁ EXISTEM ───────────────┐
-- │ `inicial` (0100) e `destino_do_cancelamento` (0130) têm índice parcial ÚNICO porque respondem │
-- │ perguntas de UMA resposta. Esta é pergunta de CONJUNTO, e a própria OST manda que seja: o     │
-- │ diretor pediu a entrevista da etapa Soulan e disse, na mesma frase, para considerar que PODE  │
-- │ HAVER ENTREVISTA TAMBÉM NA ETAPA CLIENTE. Um índice único tornaria impossível exatamente o    │
-- │ caso que a OST manda prever.                                                                   │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- NASCE `false` EM TUDO, e o agendamento é fail-closed sobre isso: catálogo sem etapa marcada não
-- aceita entrevista em lugar nenhum. O erro cai para o lado de não gravar sobre uma etapa que
-- ninguém declarou ter entrevista.
ALTER TABLE "as_etapas_funil" ADD COLUMN IF NOT EXISTS "tem_entrevista" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- A SEMENTE, e ela é DUAS linhas, não uma. `WHERE codigo IN (...)` e não `WHERE rotulo IN (...)`:
-- o código é a identidade IMUTÁVEL da etapa (a 0100 diz isso), o rótulo é editável pelo diretor.
UPDATE "as_etapas_funil"
   SET "tem_entrevista" = true, "atualizado_em" = now()
 WHERE "codigo" IN ('ENTREVISTA_SOULAN', 'ENTREVISTA_CLIENTE')
   AND "tem_entrevista" = false;--> statement-breakpoint

-- A ENTREVISTA MARCADA, UMA POR (CANDIDATURA, ETAPA).
--
-- ┌─ POR QUE UMA TABELA, E NÃO DUAS COLUNAS EM `as_candidaturas` ─────────────────────────────────┐
-- │ A coluna era o caminho simples, e ela quebra na primeira frase da OST: com um par de colunas, │
-- │ marcar a entrevista do CLIENTE sobrescreve a da SOULAN, e "que dia foi a entrevista interna   │
-- │ desta pessoa" deixa de ter resposta no instante em que o cliente marca a dele. Duas etapas com │
-- │ entrevista são duas LINHAS, não duas colunas, e a terceira etapa que o diretor marcar um dia  │
-- │ não custa migration nenhuma.                                                                   │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- `agendada_em` é `timestamptz` e não `date`: o pedido é DATA E HORÁRIO, e dois campos separados
-- criariam o estado impossível de ter hora sem dia.
--
-- REMARCAR É UPDATE DA MESMA LINHA. Não há histórico de remarcação, e a ausência é decisão (§A.31):
-- a OST pediu o campo para o time preencher, não a trilha de quantas vezes ele mudou.
CREATE TABLE IF NOT EXISTS "as_candidatura_entrevistas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "candidatura_id" uuid NOT NULL,
  "etapa" varchar(40) NOT NULL,
  "agendada_em" timestamp with time zone NOT NULL,
  "agendada_por_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- CASCADE NA CANDIDATURA, como `as_contatos` e `as_candidatura_etapas`: a marcação não sobrevive ao
-- processo a que ela pertence.
DO $$ BEGIN
  ALTER TABLE "as_candidatura_entrevistas" ADD CONSTRAINT "as_candidatura_entrevistas_candidatura_id_fk"
    FOREIGN KEY ("candidatura_id") REFERENCES "public"."as_candidaturas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- RESTRICT NA ETAPA, como `as_candidaturas.etapa` e as duas pontas de `as_candidatura_etapas`:
-- etapa em que alguém já foi entrevistado é INATIVÁVEL, nunca apagável, e é o banco que garante,
-- mesmo para quem escrever por SQL cru.
DO $$ BEGIN
  ALTER TABLE "as_candidatura_entrevistas" ADD CONSTRAINT "as_candidatura_entrevistas_etapa_fk"
    FOREIGN KEY ("etapa") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- SET NULL NO AUTOR: apagar um usuário não pode FALHAR por causa de uma entrevista que ele marcou
-- meses antes, e a marcação não some junto com ele. Mesmo desenho dos demais carimbos de autoria.
DO $$ BEGIN
  ALTER TABLE "as_candidatura_entrevistas" ADD CONSTRAINT "as_candidatura_entrevistas_agendada_por_id_fk"
    FOREIGN KEY ("agendada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- UMA MARCAÇÃO VIVA POR (CANDIDATURA, ETAPA): é a chave do conceito, e ela mora no BANCO e não só
-- no service. Dois cliques simultâneos no "marcar entrevista" passam juntos pela consulta do
-- service, e é este índice que derruba o segundo (o service captura e vira remarcação).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_candidatura_entrevistas_etapa"
  ON "as_candidatura_entrevistas" ("candidatura_id", "etapa");--> statement-breakpoint

-- "As entrevistas desta candidatura, em ordem de data": a leitura da ficha.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_entrevistas_candidatura"
  ON "as_candidatura_entrevistas" ("candidatura_id", "agendada_em");--> statement-breakpoint

-- "O que está marcado entre tal e tal dia", sobre a base inteira: a agenda da semana.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_entrevistas_agenda"
  ON "as_candidatura_entrevistas" ("agendada_em");--> statement-breakpoint

-- ── 9. A PRETENSÃO SALARIAL, E A MARCA QUE A PEDE ───────────────────────────────────────────────
--
-- ┌─ A LIGAÇÃO É POR MARCA NO CATÁLOGO, E NUNCA POR COMPARAÇÃO DE NOME ───────────────────────────┐
-- │ O catálogo `motivos_descarte` (0129) é GERENCIÁVEL: o diretor cria, RENOMEIA e inativa motivo │
-- │ pela tela. Um `motivo === 'Pretensão Salarial'` no service pararia de funcionar no dia em que │
-- │ ele corrigisse a grafia, SEM NADA FALHAR: o campo simplesmente deixaria de ser pedido, e o    │
-- │ dado deixaria de ser coletado em silêncio.                                                     │
-- │                                                                                                │
-- │ E O NOME NÃO SERVIRIA NEM HOJE: a semente da 0129 tem seis linhas (Reprovado, Faltante,       │
-- │ Desistente, Sem Interesse, Sem Perfil, Stand By) e NENHUMA delas é "pretensão salarial".      │
-- │ Comparar por nome exigiria INVENTAR um motivo, que é o que a OST proíbe e a §A.31 recusa.     │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- NENHUMA LINHA NASCE MARCADA, e a ausência de semente é deliberada (§A.31): decidir QUAL motivo
-- significa "pretensão salarial" é escolha de vocabulário, e vocabulário de desfecho é do diretor.
-- Enquanto nada estiver marcado, a régua é INERTE e nenhum desfecho pede valor nenhum, que é o lado
-- fail-closed: o sistema não coleta dado financeiro de pessoa que ninguém mandou coletar (§A.6).
ALTER TABLE "motivos_descarte" ADD COLUMN IF NOT EXISTS "pede_pretensao" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ┌─ A COLUNA É DA CANDIDATURA, E NÃO DO CANDIDATO ───────────────────────────────────────────────┐
-- │ A pretensão é de UM PROCESSO: a mesma pessoa pede um valor para a vaga de operador e outro    │
-- │ para a de supervisor, seis meses depois. Guardá-la na PESSOA faria a segunda apagar a         │
-- │ primeira, e o descarte de janeiro passaria a exibir o valor pedido em agosto. É a mesma razão │
-- │ pela qual `as_contatos` pendura na candidatura e não no candidato.                             │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- `numeric(12,2)`, o MESMO tipo de `vagas.salario_abertura` e do salário da admissão: o valor não
-- pode mudar de forma ao ser comparado com aquilo que ele existe para ser comparado.
ALTER TABLE "as_candidaturas" ADD COLUMN IF NOT EXISTS "pretensao_salarial" numeric(12, 2);--> statement-breakpoint

-- GUARDA DE BORDA NO BANCO, no molde dos CHECKs de `posicoes_*` da vaga: o DTO já recusa negativo, e
-- este é o que vale para quem escrever por fora da aplicação. ZERO É ACEITO de propósito (`>= 0`):
-- "não tenho pretensão definida" é resposta que a operação dá, e recusá-la faria o consultor
-- inventar um número, que é pior do que o zero.
DO $$ BEGIN
  ALTER TABLE "as_candidaturas" ADD CONSTRAINT "ck_as_candidaturas_pretensao_salarial"
    CHECK ("pretensao_salarial" IS NULL OR "pretensao_salarial" >= 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ── 10/11. A SHORTLIST ──────────────────────────────────────────────────────────────────────────
--
-- ┌─ O QUE EXISTIA ANTES, E POR QUE ELE NÃO ERA UMA SHORTLIST ────────────────────────────────────┐
-- │ `vagas.envio_shortlist` é UM campo `date`, digitado à mão no formulário de abertura. Ele diz  │
-- │ "alguma coisa foi enviada em tal dia" e mais nada: não sabe QUEM foi enviado, não sabe        │
-- │ QUANTOS eram, não sabe se houve REENVIO nem por quê. Era um carimbo sem fato por baixo.       │
-- │                                                                                                │
-- │ O CAMPO NÃO É DERRUBADO, E ISSO É DECISÃO, NÃO OMISSÃO (§A.26). Ele é lido pela tela da vaga  │
-- │ e pelo contrato `VagaListItem`, e carrega a data das vagas históricas, que nunca terão        │
-- │ shortlist. O que muda é QUEM O ESCREVE DAQUI PARA FRENTE: o envio de shortlist o carimba, na  │
-- │ MESMA transação. Os dois escritores são PROVADAMENTE DISJUNTOS, e a prova está no service:    │
-- │ a trilha só escreve em vaga de papel RASCUNHO/REVISAO, e o envio de shortlist só é aceito em  │
-- │ vaga de papel ABERTURA/ENTREGA (`papelDeVagaEmProcesso`). Não existe vaga nos dois ao mesmo   │
-- │ tempo, então não existe a colisão que a §A.40 manda procurar.                                  │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- A SHORTLIST NASCE ENVIADA: `enviada_em` é NOT NULL, e não há rascunho. Compor hoje e mandar
-- amanhã seria um segundo estado, com uma tela a mais e uma pergunta a mais, e ninguém pediu isso
-- (§A.31). O fato que a OST nomeia é o ENVIO, então é o envio que cria a linha.
CREATE TABLE IF NOT EXISTS "as_shortlists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  "numero" integer NOT NULL,
  "enviada_em" date NOT NULL,
  "enviada_por_id" uuid,
  "motivo_reenvio" text,
  "aviso_curta_aceito" boolean DEFAULT false NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- RESTRICT NA VAGA, como `as_candidaturas.vaga_id` e pela mesma razão: apagar uma vaga com
-- shortlist enviada faria a prova do envio evaporar em silêncio, junto com a trilha do que o
-- cliente viu.
DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "as_shortlists_vaga_id_fk"
    FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "as_shortlists_enviada_por_id_fk"
    FOREIGN KEY ("enviada_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- `numero` É A ORDEM DO ENVIO NAQUELA VAGA: 1 para a primeira, 2+ para cada reenvio. Ele não é
-- enfeite. É ELE que responde "esta é a PRIMEIRA shortlist?", que é a pergunta do aviso dos menos de
-- 3 candidatos, e é ele que ordena a leitura sem depender de duas linhas terem instantes diferentes.
--
-- O UNIQUE É A TRAVA DE CORRIDA: o número é atribuído por `max(numero) + 1` DENTRO da transação,
-- sob a linha da vaga travada com `FOR UPDATE`. Dois envios simultâneos que escapassem do lock
-- leriam o mesmo máximo, e é aqui que o segundo cai, em vez de a vaga ganhar dois "reenvio 2".
CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_shortlists_vaga_numero"
  ON "as_shortlists" ("vaga_id", "numero");--> statement-breakpoint

-- A pergunta é sempre "as shortlists DESTA VAGA, na ordem", nunca "todas as shortlists".
CREATE INDEX IF NOT EXISTS "idx_as_shortlists_vaga" ON "as_shortlists" ("vaga_id", "numero");--> statement-breakpoint

-- O MOTIVO ACOMPANHA O REENVIO, NOS DOIS SENTIDOS, e no BANCO e não só no DTO: reenviar é dizer que
-- a primeira lista não serviu, e uma shortlist 2 sem motivo é o mesmo buraco de trilha que o ajuste
-- 7 fechou na saída da candidatura. O primeiro envio PROÍBE o motivo: não há o que justificar, e
-- aceitar texto ali criaria uma justificativa sem pergunta.
DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "ck_as_shortlists_motivo_reenvio"
    CHECK (("numero" = 1 AND "motivo_reenvio" IS NULL) OR ("numero" > 1 AND "motivo_reenvio" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "as_shortlists" ADD CONSTRAINT "ck_as_shortlists_numero" CHECK ("numero" >= 1);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- QUEM ESTAVA NA LISTA. Aponta para a CANDIDATURA e nunca para o candidato: a shortlist é de uma
-- VAGA, e o que se envia é "estas pessoas, PARA ESTA VAGA". Apontar para a pessoa perderia a vaga e
-- deixaria a lista ambígua para quem está em três processos ao mesmo tempo.
--
-- O CONJUNTO É IMUTÁVEL DEPOIS DO ENVIO: não existe acrescentar nem tirar alguém de uma shortlist
-- já enviada. O que o cliente recebeu naquele dia é FATO, e fato não se edita. Mudou a lista, é
-- REENVIO, com motivo e data próprios.
CREATE TABLE IF NOT EXISTS "as_shortlist_itens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shortlist_id" uuid NOT NULL,
  "candidatura_id" uuid NOT NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "as_shortlist_itens" ADD CONSTRAINT "as_shortlist_itens_shortlist_id_fk"
    FOREIGN KEY ("shortlist_id") REFERENCES "public"."as_shortlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- CASCADE NA CANDIDATURA porque apagar um CANDIDATO leva as candidaturas dele (`as_candidatos`
-- cascateia), e um item órfão apontando para candidatura inexistente seria linha que nenhuma
-- leitura resolve.
DO $$ BEGIN
  ALTER TABLE "as_shortlist_itens" ADD CONSTRAINT "as_shortlist_itens_candidatura_id_fk"
    FOREIGN KEY ("candidatura_id") REFERENCES "public"."as_candidaturas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- A mesma pessoa não entra duas vezes na mesma lista, e é o banco que garante: duplo clique não
-- vira duas linhas, e um corpo com o id repetido não infla a contagem que o aviso dos 3 lê.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_shortlist_itens_candidatura"
  ON "as_shortlist_itens" ("shortlist_id", "candidatura_id");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_as_shortlist_itens_shortlist" ON "as_shortlist_itens" ("shortlist_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_as_shortlist_itens_candidatura" ON "as_shortlist_itens" ("candidatura_id");--> statement-breakpoint

-- ── 12. O MARCADOR DA REPROVAÇÃO PELO CLIENTE, NO HISTÓRICO ─────────────────────────────────────
--
-- ┌─ ELA NÃO É UMA COLUNA `tipo`, E A DISTINÇÃO É O QUE A TORNA LEGÍTIMA ─────────────────────────┐
-- │ O cabeçalho de `as_candidatura_etapas` diz que o TIPO do evento é DERIVADO e nunca guardado,  │
-- │ e isso CONTINUA valendo: a reprovação pelo cliente é um MOVIMENTO (`etapa_de` preenchida,     │
-- │ `situacao` nula), e `tipoDoEvento` a devolve como MOVIMENTO, sem valor novo no vocabulário.   │
-- │ Esta coluna QUALIFICA o movimento, exatamente como `posicao_lado` qualifica o desfecho e      │
-- │ `aceite` qualifica a guarda atravessada.                                                       │
-- │                                                                                                │
-- │ SEM ELA, A PERGUNTA SÓ SERIA RESPONDÍVEL LENDO TEXTO LIVRE: o `motivo` ao lado é digitado por │
-- │ gente e é NULADO pela varredura de retenção (§A.6), então "quantos o cliente reprovou nesta   │
-- │ vaga" viraria um `like` sobre frase que some com o tempo.                                      │
-- │                                                                                                │
-- │ E A ESTRUTURA NÃO IDENTIFICA O GESTO SOZINHA: um movimento MANUAL da Entrevista Cliente de    │
-- │ volta para a Captação grava exatamente as mesmas colunas, e é gesto DIFERENTE (o time         │
-- │ recuando alguém por decisão própria). Derivar por "veio da entrega e foi para a inicial"      │
-- │ contaria os dois como um só.                                                                   │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- `NOT NULL DEFAULT false`: a pergunta tem resposta para TODO evento, inclusive os que já existem
-- (nenhum foi reprovação pelo cliente, porque o gesto não existia). Nulo seria um terceiro estado
-- sem significado.
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "reprovado_pelo_cliente" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- ÍNDICE PARCIAL, no molde do `idx_as_candidatura_etapas_aceite` e pela mesma razão: a pergunta é
-- sempre "onde houve reprovação pelo cliente", nunca "todos os eventos", e a coluna é `false` na
-- esmagadora maioria das linhas. Um índice cheio custaria escrita em TODO movimento de etapa para
-- responder sobre a minoria.
CREATE INDEX IF NOT EXISTS "idx_as_candidatura_etapas_reprovado_cliente"
  ON "as_candidatura_etapas" ("ocorrido_em") WHERE "reprovado_pelo_cliente";
