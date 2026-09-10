-- A&S, AS ETAPAS DO FUNIL DEIXAM DE SER UM ENUM DO POSTGRES E VIRAM CATÁLOGO GERENCIÁVEL.
--
-- O QUE ESTA MIGRATION FAZ, na ordem em que precisa acontecer:
--   1. cria `as_etapas_funil`, o catálogo (código, rótulo, ordem, tom, inicial, ativa);
--   2. SEMEIA a partir do PRÓPRIO ENUM (não de uma lista digitada aqui, ver o bloco abaixo);
--   3. converte as três colunas de enum para `varchar(40)`;
--   4. cria as três chaves estrangeiras, com RESTRICT;
--   5. dropa o tipo `candidatura_etapa`, SEM `CASCADE`.
--
-- ┌─ A SEMENTE VEM DO BANCO, E É ISSO QUE TORNA LINHA ÓRFÃ IMPOSSÍVEL ────────────────────────────┐
-- │ A forma óbvia seria um `INSERT ... VALUES` com as cinco etapas de hoje escritas à mão. Ela     │
-- │ funciona enquanto a lista digitada aqui for IGUAL à lista do enum, e falha em silêncio no dia  │
-- │ em que não for: uma etapa que exista no enum e não na lista deixaria as linhas que apontam     │
-- │ para ela sem destino, e o `ADD CONSTRAINT` do passo 4 derrubaria a migration inteira (ou, pior,│
-- │ passaria, se a etapa não tivesse ninguém, e voltaria a morder quando alguém consultasse).      │
-- │                                                                                                │
-- │ AQUI A SEMENTE É `SELECT ... FROM unnest(enum_range(NULL::candidatura_etapa))`: ela nasce da    │
-- │ MESMA fonte que as colunas usam. Uma coluna de enum só pode conter rótulos do próprio enum,     │
-- │ então semear a partir do enum cobre, por construção, 100% dos valores existentes nas linhas.    │
-- │ O mapa literal logo abaixo serve SÓ para o que é cosmético (rótulo, ordem, tom, inicial), e     │
-- │ todo campo tem `coalesce` de fallback: um valor de enum que não esteja no mapa entra com o      │
-- │ código como rótulo, no fim da fila, tom neutro. Feio, nunca ausente.                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ `DROP TYPE` SEM `CASCADE`, E A PALAVRA A MAIS SERIA PERDA DE HISTÓRICO ──────────────────────┐
-- │ Sem `CASCADE` o Postgres RECUSA o drop se alguma coluna ainda usar o tipo, e a transação       │
-- │ inteira reverte: um passo pulado vira erro alto e visível. Com `CASCADE` ele DROPA A COLUNA em │
-- │ silêncio, e a coluna aqui é `as_candidatura_etapas.etapa_para`, que é o histórico de por onde  │
-- │ cada pessoa passou. O modo de falha seguro é a migration não subir.                            │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ TUDO NUM ARQUIVO SÓ, E ISSO É EXIGÊNCIA, NÃO ESTILO ─────────────────────────────────────────┐
-- │ Medido na 0095 contra um clone real: o migrador do drizzle envolve TODAS as migrations         │
-- │ pendentes numa transação só (`drizzle-orm/pg-core/dialect.js`, método `migrate`), e fronteira  │
-- │ de arquivo NÃO é fronteira de commit. Partir isto em dois arquivos não daria isolamento        │
-- │ nenhum, e ainda deixaria um estado intermediário sem FK caso alguém rodasse só o primeiro.     │
-- │                                                                                                │
-- │ A ARMADILHA DO `ADD VALUE` (0059, 0086, 0094, 0095) NÃO ALCANÇA ESTE ARQUIVO: aqui nenhum      │
-- │ valor de enum é criado. O caminho é o oposto, o de SAIR do enum.                                │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ §A.6 (LGPD): O QUE A FK RESTRICT SIGNIFICA PARA SEMPRE, e é preciso estar escrito ───────────┐
-- │ O expurgo por retenção (`retencao-candidatos.service.ts`) ANONIMIZA A PESSOA e PRESERVA a      │
-- │ candidatura e o histórico dela para sempre: quem foi expurgado vira "Candidato Expurgado" e as │
-- │ linhas de processo continuam existindo, sem dado pessoal nenhum.                                │
-- │                                                                                                │
-- │ A CONSEQUÊNCIA, que é DESENHO e não defeito: uma etapa por onde ALGUÉM JÁ PASSOU nunca mais    │
-- │ poderá ser APAGADA de verdade, só INATIVADA. Não existe momento futuro em que aquelas linhas   │
-- │ de histórico sumam sozinhas e liberem o `DELETE`. Isto está certo assim, é LGPD-limpo (o       │
-- │ catálogo não guarda dado pessoal nenhum: código, rótulo, ordem, cor e dois booleanos) e É O    │
-- │ QUE A FRASE DE RECUSA DA TELA TEM DE DIZER, senão vira chamado de "o botão apagar não funciona".│
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘

-- ── 1. O CATÁLOGO ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "as_etapas_funil" (
	"id" serial PRIMARY KEY NOT NULL,
	-- A IDENTIDADE, e ela é IMUTÁVEL: é este valor que fica gravado na candidatura e em cada evento
	-- do histórico. Renomear a etapa mexe no `rotulo`, nunca aqui (mesma decisão do catálogo do
	-- iFractal, `ifractal-status.service.ts`).
	"codigo" varchar(40) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	-- A COR, da paleta FECHADA do design system (`ETAPA_TONS` no shared-types). O CHECK aqui é a
	-- terceira das três listas que precisam concordar (banco, serviço e tela), e é a única que
	-- continua valendo quando alguém escreve por SQL cru.
	"tom" varchar(4) DEFAULT 'nt' NOT NULL,
	"inicial" boolean DEFAULT false NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as_etapas_funil_codigo_unique" UNIQUE("codigo"),
	CONSTRAINT "as_etapas_funil_tom_check" CHECK ("tom" IN ('nt','in','wn','or','ok'))
);
--> statement-breakpoint

-- UMA E SÓ UMA ETAPA INICIAL, garantido pelo banco. O índice é PARCIAL (`WHERE inicial`), então ele
-- não diz nada sobre as etapas que não são iniciais: só impede a SEGUNDA marcada. Sem isto, a
-- pergunta "onde a candidatura nasce?" passaria a depender de qual linha o Postgres devolvesse
-- primeiro, que é exatamente o defeito que o `conclui` do iFractal resolve na aplicação e este
-- resolve no banco.
CREATE UNIQUE INDEX IF NOT EXISTS "as_etapas_funil_inicial_unica" ON "as_etapas_funil" ("inicial") WHERE "inicial";--> statement-breakpoint

-- ── 2. A SEMENTE, VINDA DO PRÓPRIO ENUM ─────────────────────────────────────────────────────────
INSERT INTO "as_etapas_funil" ("codigo", "rotulo", "ordem", "tom", "inicial")
SELECT e."codigo",
       coalesce(m."rotulo", e."codigo"),
       coalesce(m."ordem", (100 + e."pos")::int),
       coalesce(m."tom", 'nt'),
       coalesce(m."inicial", false)
  FROM (
        SELECT v::text AS "codigo",
               row_number() OVER () AS "pos"
          FROM unnest(enum_range(NULL::candidatura_etapa)) AS v
       ) e
  LEFT JOIN (
        VALUES
          ('CAPTACAO',          'Captação',           1, 'nt', true),
          ('TRIAGEM',           'Triagem',            2, 'in', false),
          ('ENTREVISTA_SOULAN', 'Entrevista Soulan',  3, 'wn', false),
          ('ENTREVISTA_CLIENTE','Entrevista Cliente', 4, 'or', false),
          ('APROVACAO',         'Aprovação',          5, 'ok', false)
       ) AS m("codigo", "rotulo", "ordem", "tom", "inicial") ON m."codigo" = e."codigo"
 ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- REDE DE SEGURANÇA DA ETAPA INICIAL: se o mapa acima não casar com nenhum valor do enum (um banco
-- em que 'CAPTACAO' não exista), a primeira da fila vira a inicial. Uma candidatura tem de nascer
-- em algum lugar, e "em lugar nenhum" seria erro na criação do primeiro candidato, longe daqui.
UPDATE "as_etapas_funil"
   SET "inicial" = true
 WHERE "id" = (SELECT "id" FROM "as_etapas_funil" ORDER BY "ordem", "id" LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM "as_etapas_funil" WHERE "inicial");--> statement-breakpoint

-- ── 3. AS TRÊS COLUNAS SAEM DO ENUM ─────────────────────────────────────────────────────────────
-- O `DROP DEFAULT` VEM ANTES do `ALTER ... TYPE`, e a ordem não é negociável: o default é um literal
-- TIPADO com o enum, e o Postgres recusa converter a coluna com ele no lugar.
--
-- E NÃO ENTRA DEFAULT NOVO. Quem decide onde a candidatura nasce passa a ser UMA fonte só, a linha
-- marcada `inicial` no catálogo, lida pelo service e passada explicitamente no INSERT. Um default no
-- banco seria um SEGUNDO dono da mesma decisão, capaz de apontar para uma etapa que o diretor
-- inativou, em silêncio.
ALTER TABLE "as_candidaturas" ALTER COLUMN "etapa" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "as_candidaturas" ALTER COLUMN "etapa" SET DATA TYPE varchar(40) USING "etapa"::text;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ALTER COLUMN "etapa_de" SET DATA TYPE varchar(40) USING "etapa_de"::text;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ALTER COLUMN "etapa_para" SET DATA TYPE varchar(40) USING "etapa_para"::text;--> statement-breakpoint

-- ── 4. AS CHAVES ESTRANGEIRAS, COM RESTRICT ─────────────────────────────────────────────────────
-- RESTRICT é o que transforma "linha órfã é improvável" em "linha órfã é impossível". A checagem na
-- aplicação continua existindo, e continua sendo a que dá a MENSAGEM boa (com a contagem de quanta
-- gente está na etapa); esta é a que vale mesmo quando ninguém passa pela aplicação.
ALTER TABLE "as_candidaturas" ADD CONSTRAINT "as_candidaturas_etapa_as_etapas_funil_codigo_fk" FOREIGN KEY ("etapa") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_etapa_de_as_etapas_funil_codigo_fk" FOREIGN KEY ("etapa_de") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_etapa_para_as_etapas_funil_codigo_fk" FOREIGN KEY ("etapa_para") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ── 5. O TIPO ANTIGO SAI. SEM `CASCADE` (ver o cabeçalho). ──────────────────────────────────────
DROP TYPE "public"."candidatura_etapa";
