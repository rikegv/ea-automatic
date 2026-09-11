-- A&S, O STATUS DA VAGA DEIXA DE SER UM ENUM DO POSTGRES E VIRA CATÁLOGO GERENCIÁVEL POR PAPEL.
--
-- O QUE ESTA MIGRATION FAZ, na ordem em que precisa acontecer:
--   1. cria `as_vaga_status`, o catálogo (código, rótulo, ordem, tom, ativo, papel e quatro flags);
--   2. SEMEIA a partir do PRÓPRIO ENUM (não de uma lista digitada aqui, ver o bloco abaixo);
--   3. cria `as_vaga_status_eventos`, a trilha do movimento manual de status;
--   4. converte `vagas.status` de enum para `varchar(40)`, TIRANDO o default;
--   5. cria as chaves estrangeiras, com RESTRICT;
--   6. dropa o tipo `vaga_status`, SEM `CASCADE`.
--
-- É O MESMO CAMINHO DA 0100 (as etapas do funil), e a repetição é deliberada: o problema é o mesmo
-- (uma lista do diretor presa num tipo do Postgres) e a resposta que já foi auditada e aprovada é a
-- que se aplica de novo. O que MUDA aqui é o PAPEL, e é ele que ocupa a maior parte deste cabeçalho.
--
-- ┌─ A SEMENTE VEM DO BANCO, E É ISSO QUE TORNA LINHA ÓRFÃ IMPOSSÍVEL ────────────────────────────┐
-- │ A forma óbvia seria um `INSERT ... VALUES` com os cinco status de hoje escritos à mão. Ela     │
-- │ funciona enquanto a lista digitada aqui for IGUAL à lista do enum, e falha em silêncio no dia  │
-- │ em que não for. E aqui ela JÁ NÃO É: o enum tem SEIS valores, porque `VAGA_BANCO` continua lá  │
-- │ (dormente desde 07/09; `ALTER TYPE ... DROP VALUE` não existe no Postgres). Uma lista digitada │
-- │ o esqueceria, e o `ADD CONSTRAINT` do passo 5 derrubaria a migration (ou passaria, por não     │
-- │ haver linha usando o valor hoje, e voltaria a morder no dia em que uma aparecesse).            │
-- │                                                                                                │
-- │ AQUI A SEMENTE É `SELECT ... FROM unnest(enum_range(NULL::vaga_status))`: ela nasce da MESMA    │
-- │ fonte que a coluna usa. Uma coluna de enum só pode conter rótulos do próprio enum, então semear │
-- │ a partir do enum cobre, por construção, 100% dos valores existentes nas linhas.                 │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ O QUE O `LEFT JOIN` SEM PAR PRODUZ, e por que aqui ele NÃO pode ser "feio, nunca ausente" ────┐
-- │ Na 0100 o mapa literal era SÓ cosmético (rótulo, ordem, tom), então o fallback podia ser feio e │
-- │ pronto. AQUI OS CAMPOS SÃO COMPORTAMENTO: `encerra` congela a vaga, `recebe_candidato` é trava  │
-- │ de alocação, `da_trilha` é permissão de escrita e `movivel_manualmente` é destino de clique.    │
-- │ Um fallback errado não seria feio, seria uma REGRA inventada.                                   │
-- │                                                                                                │
-- │ ENTÃO O FALLBACK É "O COMPORTAMENTO DE HOJE, EXATAMENTE": papel LIVRE, `encerra` false,         │
-- │ `recebe_candidato` TRUE, `da_trilha` false, `movivel_manualmente` false e `ativo` FALSE.        │
-- │ Aplicado ao único caso real (`VAGA_BANCO`), isso reproduz linha a linha o que o código faz hoje:│
-- │ `vagaRecebeCandidato('VAGA_BANCO')` devolve true (o valor NÃO está em `STATUS_QUE_NAO_RECEBEM`),│
-- │ a trilha de abertura não o escreve (`VAGA_STATUS_DA_TRILHA` não o contém) e ninguém o oferece   │
-- │ na tela. `ativo = false` é o que mantém essa última parte verdadeira: ele existe para a FK e    │
-- │ para o rótulo do histórico, e não aparece em seletor nenhum. Migração de FORMA, não de          │
-- │ comportamento.                                                                                  │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE `papel`, E NÃO UMA COLUNA "PROTEGIDO" ────────────────────────────────────────────────┐
-- │ O código do status é escrito pelo sistema em pontos que NÃO podem errar: o fechamento grava o   │
-- │ do papel ENTREGA ou o do FECHAMENTO, o cancelamento grava o do CANCELAMENTO, a trilha de        │
-- │ abertura grava o do RASCUNHO ou o da ABERTURA. Com uma coluna "protegido" genérica, o código    │
-- │ continuaria com seis literais espalhados e ninguém que olhasse a tabela saberia QUAL linha é a  │
-- │ que o fechamento usa. Com `papel`, a própria tabela documenta a dependência, e o diretor pode   │
-- │ renomear "Entregue" para o que quiser sem que o `fechar` perca o alvo.                          │
-- │                                                                                                │
-- │ A FK PEGA O CÓDIGO INEXISTENTE. ELA NÃO PEGA O CÓDIGO EXISTENTE E ERRADO, que é onde mora o     │
-- │ dano: gravar o código do CANCELAMENTO onde ia o do FECHAMENTO é FK válida, desfecho falso e     │
-- │ permanente, carimbado junto de `vagas_fechadas` e `data_fechamento`.                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ OS CINCO CHECKS, e cada um fecha uma porta diferente ─────────────────────────────────────────┐
-- │ 1. `papel <> 'LIVRE' OR encerra = false`  O DIRETOR NÃO CRIA STATUS QUE ENCERRA VAGA. Encerrar  │
-- │    tem DUAS portas com régua (fechar e cancelar), e um status novo marcado `encerra` seria uma  │
-- │    TERCEIRA, sem trava de candidato tratado, sem gate de Master, sem carimbo de contagem e sem  │
-- │    data de fechamento. As linhas que encerram são as de PAPEL, e elas já existem.               │
-- │ 2. `encerra = false OR recebe_candidato = false`  TERMINAL NÃO RECEBE GENTE. Os dois flags      │
-- │    coincidem hoje nos mesmos três códigos, e essa coincidência é armadilha: são perguntas       │
-- │    diferentes (um status pausado é `recebe_candidato = false` E `encerra = false`). O que NÃO   │
-- │    pode existir é o contrário, o terminal que segue recebendo alocação.                         │
-- │ 3. `encerra = false OR movivel_manualmente = false`  A TERCEIRA PORTA TERMINAL FECHADA NO       │
-- │    BANCO, e não só no service. `podeSerDestinoManual` já recusa o destino que encerra, mas ela  │
-- │    é código de aplicação; este check vale também para quem escrever por SQL cru, e vale no dia  │
-- │    em que alguém "simplificar" a função.                                                        │
-- │ 4. `papel = 'LIVRE' OR ativo`  LINHA DE SISTEMA NUNCA É INATIVÁVEL. Inativar a linha do papel   │
-- │    ABERTURA significa, na prática, "nenhuma vaga fecha nem cancela mais" (as duas portas exigem │
-- │    a vaga em abertura) e "nenhuma vaga nova é publicada". Vaga viva apontando para um status    │
-- │    que sumiu do seletor é o STATUS FANTASMA, o mesmo defeito que o diretor mandou barrar nas    │
-- │    etapas em 10/09. Como efeito de graça, este check garante que SEMPRE existe status ativo:    │
-- │    os cinco de papel não podem ser desligados, então a lista nunca fica vazia.                  │
-- │ 5. `papel IN (...)`  DOMÍNIO ENUMERADO, no molde do `tom` da 0100. A coluna é `varchar` para    │
-- │    não repetir o problema que esta migration resolve, e o check é o que impede papel digitado   │
-- │    errado. É a terceira das três listas que precisam concordar (banco, serviço e tela).         │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ O ÍNDICE PARCIAL ÚNICO POR PAPEL, no molde do `inicial` da 0100 ──────────────────────────────┐
-- │ EXATAMENTE UM DE CADA PAPEL DE SISTEMA. `LIVRE` fica de fora do índice de propósito: dele pode  │
-- │ haver zero ou muitos, e é justamente ele que o diretor cria. Sem esta garantia,                 │
-- │ `codigoDoPapel('ENTREGA')` teria de ESCOLHER entre duas linhas, e escolher é o que ele não pode │
-- │ fazer: a resposta passaria a depender de qual linha o Postgres devolvesse primeiro.             │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ O `DEFAULT 'ABERTA'` SAI, E NÃO ENTRA OUTRO (precedente literal: 0100, passo 3) ──────────────┐
-- │ "Um default no banco seria um SEGUNDO dono da mesma decisão, capaz de apontar para uma etapa    │
-- │ que o diretor inativou, em silêncio." Vale igual aqui, e pior: o default apontaria para o       │
-- │ código `ABERTA` mesmo depois de o diretor ter renomeado a linha, e faria nascer vaga PUBLICADA  │
-- │ num INSERT que esqueceu a coluna, pulando `travaStatusDaTrilha` inteira. Quem decide onde a     │
-- │ vaga nasce passa a ser UMA fonte só: o service, que pergunta ao catálogo pelo PAPEL e passa o   │
-- │ código explicitamente. O `DROP DEFAULT` vem ANTES do `ALTER ... TYPE` porque o default é um     │
-- │ literal TIPADO com o enum, e o Postgres recusa converter a coluna com ele no lugar.             │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ `DROP TYPE` SEM `CASCADE`, E A PALAVRA A MAIS SERIA PERDA DE COLUNA ─────────────────────────┐
-- │ Sem `CASCADE` o Postgres RECUSA o drop se alguma coluna ainda usar o tipo, e a transação        │
-- │ inteira reverte: um passo pulado vira erro alto e visível. Com `CASCADE` ele DROPA A COLUNA em  │
-- │ silêncio. Hoje a única coluna do tipo é `vagas.status`, e "hoje" é exatamente a suposição que   │
-- │ não se deve escrever numa migration.                                                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A TRILHA, E POR QUE AS FKs DELA SÃO RESTRICT TAMBÉM ──────────────────────────────────────────┐
-- │ `as_vaga_status_eventos` guarda o movimento MANUAL de status (de, para, quem, quando, e uma     │
-- │ observação). Sem as FKs de `de` e `para` para o catálogo, a camada 2 do apagar não enxergaria   │
-- │ que vagas JÁ PASSARAM por um status: o `DELETE` de uma linha do catálogo levaria junto o        │
-- │ significado de todo evento que a citava, e a linha do tempo passaria a exibir código cru.       │
-- │ Com elas, um status por onde alguém passou é INATIVÁVEL, nunca apagável, e é o banco que        │
-- │ garante, mesmo por SQL cru.                                                                     │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: o catálogo guarda código, rótulo, ordem, cor, papel e quatro booleanos. A trilha guarda um id
-- de vaga, dois códigos de status, um id de usuário INTERNO, uma data e um texto de observação
-- digitado por quem move. NENHUM dado de candidato, nenhum CPF, nenhuma URL.
--
-- RISCO DE DADO: as tabelas são NOVAS e vazias, e a conversão de `vagas.status` preserva o texto de
-- toda linha (`USING status::text`). Nenhuma vaga muda de status, nenhuma consulta existente muda de
-- resposta.
--
-- RE-EXECUTÁVEL onde a sintaxe permite: `IF NOT EXISTS` em tabelas e índices, blocos `DO` nas
-- constraints. O `ALTER ... TYPE` e o `DROP TYPE` são idempotentes por consequência: rodar de novo
-- encontra a coluna já convertida e o tipo já ausente, e é por isso que o `DROP TYPE` leva
-- `IF EXISTS`.

-- ── 1. O CATÁLOGO ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "as_vaga_status" (
	"id" serial PRIMARY KEY NOT NULL,
	-- A IDENTIDADE, e ela é IMUTÁVEL: é este valor que fica gravado na vaga e em cada evento da
	-- trilha. Renomear o status mexe no `rotulo`, nunca aqui (mesma decisão do catálogo de etapas e
	-- do catálogo do iFractal).
	"codigo" varchar(40) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	-- A COR, da paleta FECHADA do design system (`ETAPA_TONS` no shared-types).
	"tom" varchar(4) DEFAULT 'nt' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	-- O PAPEL que o SISTEMA exerce sobre esta linha. `LIVRE` é a linha do diretor.
	"papel" varchar(20) DEFAULT 'LIVRE' NOT NULL,
	-- OS QUATRO FLAGS SÃO COMPORTAMENTOS, e cada um responde uma pergunta DIFERENTE (ver o cabeçalho
	-- e o comentário de `VagaStatusItem` no shared-types).
	"encerra" boolean DEFAULT false NOT NULL,
	"recebe_candidato" boolean DEFAULT true NOT NULL,
	"da_trilha" boolean DEFAULT false NOT NULL,
	"movivel_manualmente" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as_vaga_status_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "as_vaga_status_tom_check" CHECK ("tom" IN ('nt','in','wn','or','dg','ok')),
	-- CHECK 5: o domínio dos papéis, enumerado.
	CONSTRAINT "as_vaga_status_papel_check" CHECK ("papel" IN ('LIVRE','RASCUNHO','ABERTURA','ENTREGA','FECHAMENTO','CANCELAMENTO')),
	-- CHECK 1: o diretor não cria status que ENCERRA vaga.
	CONSTRAINT "as_vaga_status_livre_nao_encerra" CHECK ("papel" <> 'LIVRE' OR "encerra" = false),
	-- CHECK 2: terminal não recebe gente.
	CONSTRAINT "as_vaga_status_encerra_nao_recebe" CHECK ("encerra" = false OR "recebe_candidato" = false),
	-- CHECK 3: a terceira porta terminal, fechada no BANCO e não só no service.
	CONSTRAINT "as_vaga_status_encerra_nao_e_destino" CHECK ("encerra" = false OR "movivel_manualmente" = false),
	-- CHECK 4: linha de sistema nunca é inativável (e por tabela, nunca falta status ativo).
	CONSTRAINT "as_vaga_status_sistema_sempre_ativo" CHECK ("papel" = 'LIVRE' OR "ativo")
);
--> statement-breakpoint

-- EXATAMENTE UM DE CADA PAPEL DE SISTEMA, garantido pelo banco. PARCIAL (`WHERE papel <> 'LIVRE'`),
-- então ele não diz nada sobre os status do diretor: só impede o SEGUNDO de um papel de sistema.
CREATE UNIQUE INDEX IF NOT EXISTS "as_vaga_status_papel_unico" ON "as_vaga_status" ("papel") WHERE "papel" <> 'LIVRE';--> statement-breakpoint

-- A ORDEM DA TELA. Índice comum, e não único: dois status com a mesma ordem é feio, não é erro, e o
-- desempate por `id` já mora na consulta.
CREATE INDEX IF NOT EXISTS "idx_as_vaga_status_ordem" ON "as_vaga_status" ("ordem");--> statement-breakpoint

-- ── 2. A SEMENTE, VINDA DO PRÓPRIO ENUM ─────────────────────────────────────────────────────────
-- O mapa literal abaixo é `VAGA_STATUS_SEMENTE` (shared-types), e ele descreve o comportamento de
-- HOJE, sem inventar nada. `movivel_manualmente` é falso nos quatro que encerram ou abrem processo,
-- com UMA exceção pensada: `ABERTA` é true porque, sem ela, uma vaga movida para um status do
-- diretor ficaria IMPOSSÍVEL de fechar e de cancelar (as duas portas exigem o papel ABERTURA) e
-- viraria zumbi permanente segurando candidatura viva. O caminho de volta tem de existir.
INSERT INTO "as_vaga_status" ("codigo", "rotulo", "ordem", "tom", "ativo", "papel", "encerra", "recebe_candidato", "da_trilha", "movivel_manualmente")
SELECT e."codigo",
       coalesce(m."rotulo", e."codigo"),
       coalesce(m."ordem", (100 + e."pos")::int),
       coalesce(m."tom", 'nt'),
       -- SEM PAR NO MAPA ENTRA INATIVO: existe para a FK e para o rótulo do histórico, e não aparece
       -- em seletor nenhum. É o caso do `VAGA_BANCO`, dormente desde 07/09.
       coalesce(m."ativo", false),
       coalesce(m."papel", 'LIVRE'),
       coalesce(m."encerra", false),
       -- TRUE no fallback porque é o que o código faz hoje: `STATUS_QUE_NAO_RECEBEM` enumera três
       -- códigos, e o que não está nela RECEBE. Migração de forma, não de comportamento.
       coalesce(m."recebe_candidato", true),
       coalesce(m."da_trilha", false),
       coalesce(m."movivel_manualmente", false)
  FROM (
        SELECT v::text AS "codigo",
               row_number() OVER () AS "pos"
          FROM unnest(enum_range(NULL::vaga_status)) AS v
       ) e
  LEFT JOIN (
        VALUES
          ('RASCUNHO',  'Rascunho',  1, 'nt', true, 'RASCUNHO',     false, true,  true,  false),
          ('ABERTA',    'Aberta',    2, 'wn', true, 'ABERTURA',     false, true,  true,  true ),
          ('ENTREGUE',  'Entregue',  3, 'ok', true, 'ENTREGA',      true,  false, false, false),
          ('FECHADA',   'Fechada',   4, 'nt', true, 'FECHAMENTO',   true,  false, false, false),
          ('CANCELADA', 'Cancelada', 5, 'dg', true, 'CANCELAMENTO', true,  false, false, false),
          -- O DORMENTE ENTRA COM NOME DE GENTE E LUGAR DE GENTE. Sem esta linha ele cai no fallback
          -- e nasce com o CÓDIGO CRU como rótulo ("VAGA_BANCO") e ordem 106, e é assim que ele
          -- apareceria na tela de configuração do diretor, contra a §A.24. O par no mapa dá NOME e
          -- LUGAR; ele continua `ativo = false`, ou seja, fora de todo seletor.
          ('VAGA_BANCO', 'Vaga Banco', 6, 'nt', false, 'LIVRE', false, true,  false, false)
       ) AS m("codigo", "rotulo", "ordem", "tom", "ativo", "papel", "encerra", "recebe_candidato", "da_trilha", "movivel_manualmente") ON m."codigo" = e."codigo"
 ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- REDE DE SEGURANÇA DOS PAPÉIS: se algum papel de sistema não tiver casado (um banco em que o código
-- 'ABERTA' não exista), a migration PARA AQUI, alto e visível, em vez de deixar o sistema subir com
-- `codigoDoPapel('ABERTURA')` lançando na primeira vaga que alguém tentar publicar. Cinco papéis,
-- cinco linhas, nem uma a menos.
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(p, ', ') INTO faltando
    FROM unnest(ARRAY['RASCUNHO','ABERTURA','ENTREGA','FECHAMENTO','CANCELAMENTO']) AS p
   WHERE NOT EXISTS (SELECT 1 FROM "as_vaga_status" WHERE "papel" = p);
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'as_vaga_status: papel de sistema sem linha (%). A semente nao casou com o enum vaga_status.', faltando;
  END IF;
END $$;--> statement-breakpoint

-- ── 3. A TRILHA DO MOVIMENTO MANUAL DE STATUS ───────────────────────────────────────────────────
-- CASCADE NA VAGA e SET NULL NO AUTOR, pela mesma razão já escrita na 0099: o rastro é DA vaga e não
-- sobrevive a ela, mas sobrevive ao autor (apagar um usuário não pode FALHAR por causa de um
-- movimento de meses atrás, e a trilha não pode sumir junto com ele).
CREATE TABLE IF NOT EXISTS "as_vaga_status_eventos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  -- NULÁVEL: o `de` é de onde a vaga saiu, e existe movimento sem origem conhecida (uma carga, um
  -- reprocessamento). Nulo aqui é "não se sabe de onde", que não é o mesmo que um código.
  "de" varchar(40),
  "para" varchar(40) NOT NULL,
  "por_id" uuid,
  "em" timestamp with time zone DEFAULT now() NOT NULL,
  "observacao" text
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_vaga_status_eventos_vaga_id_vagas_id_fk') THEN
    ALTER TABLE "as_vaga_status_eventos" ADD CONSTRAINT "as_vaga_status_eventos_vaga_id_vagas_id_fk"
      FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_vaga_status_eventos_por_id_usuarios_id_fk') THEN
    ALTER TABLE "as_vaga_status_eventos" ADD CONSTRAINT "as_vaga_status_eventos_por_id_usuarios_id_fk"
      FOREIGN KEY ("por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- (vaga, quando): é a consulta da linha do tempo da vaga, da mais antiga para a mais recente.
CREATE INDEX IF NOT EXISTS "idx_as_vaga_status_eventos_vaga" ON "as_vaga_status_eventos" ("vaga_id", "em");--> statement-breakpoint

-- ── 4. A COLUNA DA VAGA SAI DO ENUM, E O DEFAULT SAI JUNTO ──────────────────────────────────────
ALTER TABLE "vagas" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "vagas" ALTER COLUMN "status" SET DATA TYPE varchar(40) USING "status"::text;--> statement-breakpoint

-- ── 5. AS CHAVES ESTRANGEIRAS, COM RESTRICT ─────────────────────────────────────────────────────
-- RESTRICT é o que transforma "linha órfã é improvável" em "linha órfã é impossível". A checagem na
-- aplicação continua existindo, e continua sendo a que dá a MENSAGEM boa (com a contagem de quantas
-- vagas estão no status); esta é a que vale mesmo quando ninguém passa pela aplicação.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vagas_status_as_vaga_status_codigo_fk') THEN
    ALTER TABLE "vagas" ADD CONSTRAINT "vagas_status_as_vaga_status_codigo_fk"
      FOREIGN KEY ("status") REFERENCES "public"."as_vaga_status"("codigo") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_vaga_status_eventos_de_as_vaga_status_codigo_fk') THEN
    ALTER TABLE "as_vaga_status_eventos" ADD CONSTRAINT "as_vaga_status_eventos_de_as_vaga_status_codigo_fk"
      FOREIGN KEY ("de") REFERENCES "public"."as_vaga_status"("codigo") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_vaga_status_eventos_para_as_vaga_status_codigo_fk') THEN
    ALTER TABLE "as_vaga_status_eventos" ADD CONSTRAINT "as_vaga_status_eventos_para_as_vaga_status_codigo_fk"
      FOREIGN KEY ("para") REFERENCES "public"."as_vaga_status"("codigo") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- ── 6. O TIPO ANTIGO SAI. SEM `CASCADE` (ver o cabeçalho). ──────────────────────────────────────
DROP TYPE IF EXISTS "public"."vaga_status";
