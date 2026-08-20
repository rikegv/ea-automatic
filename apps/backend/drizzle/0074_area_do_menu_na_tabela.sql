-- ÁREA DO MENU PASSA A MORAR NA TABELA (fonte da autorização sai do código e vem para o banco).
--
-- POR QUE: enquanto a área ficava só em `domain/menus.ts`, marcar um menu para as duas áreas exigia a
-- fábrica e uma subida de versão. O diretor precisa marcar sozinho, pela tela dele. A partir daqui a
-- TABELA MANDA e o código diz apenas com que áreas o menu NASCE.
--
-- ATÔMICA E EM TRÊS TEMPOS, porque a coluna é NOT NULL numa tabela que já tem 29 linhas: adiciona
-- NULA, faz o BACKFILL com o carimbo que o código dizia até agora, e só então aperta o NOT NULL.
-- Adicionar NOT NULL de uma vez estouraria nas linhas existentes. O migrator do drizzle roda o
-- arquivo inteiro em UMA transação, então ou os três passos acontecem, ou nenhum.
--
-- O BACKFILL É O QUE TORNA A TROCA DE FONTE UMA IDENTIDADE: a tabela nasce repetindo exatamente o que
-- o código já dizia, então no dia da virada nenhum usuário perde nem ganha um único menu. Depois
-- disso, quem manda é a tela do diretor.
ALTER TABLE "menus" ADD COLUMN "areas" text[];--> statement-breakpoint
-- Todo menu existente é da Admissão, que é o carimbo padrão do registro (`AREA_PADRAO_DO_MENU`).
UPDATE "menus" SET "areas" = ARRAY['ADM'] WHERE "areas" IS NULL;--> statement-breakpoint
-- O ÚNICO que declara diferente hoje: o Início é das duas áreas. Carimbado só como ADM, ele sumiria
-- da barra do time de A&S e essas pessoas encarariam um sistema sem nenhum item de menu.
UPDATE "menus" SET "areas" = ARRAY['ADM','AS'] WHERE "codigo" = 'inicio';--> statement-breakpoint
-- Rede de segurança para base recém-criada, em que o UPDATE acima não pegou linha nenhuma: sem isto,
-- o NOT NULL abaixo falharia se alguma linha tivesse escapado.
UPDATE "menus" SET "areas" = ARRAY['ADM'] WHERE "areas" IS NULL;--> statement-breakpoint
ALTER TABLE "menus" ALTER COLUMN "areas" SET NOT NULL;--> statement-breakpoint
-- Área vazia é um menu que ninguém enxerga, ou seja, uma tela morta que continua ocupando espaço na
-- configuração. A tela já recusa salvar assim; o banco recusa também, porque regra de acesso que vive
-- só na aplicação é regra que um script contorna sem querer.
ALTER TABLE "menus" ADD CONSTRAINT "ck_menus_areas_nao_vazio" CHECK (array_length("areas", 1) >= 1);
