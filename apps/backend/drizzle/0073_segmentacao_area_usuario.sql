-- SEGMENTAÇÃO DE ÁREA POR USUÁRIO (fundação do módulo de A&S).
--
-- ATÔMICA DE PROPÓSITO: a criação do enum, da tabela e o BACKFILL vivem no MESMO arquivo, e o
-- migrator do drizzle executa cada arquivo dentro de UMA transação (pg-core `dialect.migrate`, via
-- `session.transaction`). Ou as três coisas acontecem, ou nenhuma acontece.
--
-- POR QUE ISSO IMPORTA: a partir desta migration os guards passam a filtrar por área. Se a tabela
-- nascesse vazia, TODO usuário do sistema cairia no fail-closed (sem área = só o Início) entre a
-- migration e o backfill, ou seja, o sistema inteiro ficaria mudo para todo mundo nessa janela.
-- Com o backfill aqui dentro, a janela não existe.
--
-- POR QUE O FILTRO É UMA IDENTIDADE NO DIA DA VIRADA: todo usuário existente entra em [ADM] e todo
-- menu existente é carimbado [ADM] em código (`domain/menus.ts`). Interseção de [ADM] com [ADM] é
-- sempre não vazia, então ninguém perde um único menu. A segmentação só passa a MORDER quando o
-- diretor cadastrar o primeiro usuário de A&S.
CREATE TYPE "public"."area_sistema" AS ENUM('ADM', 'AS');--> statement-breakpoint
CREATE TABLE "usuario_areas" (
	"usuario_id" uuid NOT NULL,
	"area" "area_sistema" NOT NULL,
	CONSTRAINT "usuario_areas_usuario_id_area_pk" PRIMARY KEY("usuario_id","area")
);
--> statement-breakpoint
ALTER TABLE "usuario_areas" ADD CONSTRAINT "usuario_areas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- BACKFILL: todo usuário que existe hoje passa a ser da área ADM.
--
-- INCLUSIVE OS INATIVOS, e isso não é descuido: um usuário desativado pode ser reativado pelo
-- diretor a qualquer momento, e reativar alguém que voltasse sem área nenhuma o devolveria a um
-- sistema mudo, sem ninguém entender por quê.
--
-- INCLUSIVE OS SUPER_ADMIN, embora eles não dependam de área (estão acima da segmentação): a linha
-- é inofensiva, e deixá-los de fora criaria a leitura falsa de que "sem área" é um estado normal.
--
-- `ON CONFLICT DO NOTHING` para a migration ser reexecutável sem estourar em base já semeada.
INSERT INTO "usuario_areas" ("usuario_id", "area")
SELECT "id", 'ADM'::"public"."area_sistema" FROM "usuarios"
ON CONFLICT DO NOTHING;
