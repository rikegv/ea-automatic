-- STATUS "EXAME SOLICITADO" na frente EXAME (decisão do diretor, 15/10/2026, OST das ondas).
--
-- Status marcado À MÃO pelo time: registra que o exame já foi solicitado mas ainda não tem
-- agendamento confirmado. Fica entre "A Agendar" e "Agendado".
--
-- `conclui = false`: não tira a admissão da fila, não infla o card "Aptas" e não abre o gate do
-- Cadastro. Quem conclui a frente continua sendo só o APTO. O status também NÃO entra na lista de
-- status governados pelo scheduler de exame (STATUS_GOVERNADOS), então a marcação manual nunca é
-- sobrescrita automaticamente. É um rótulo passivo, igual ao que A_AGENDAR já é.
--
-- SEM MUDANÇA DE SCHEMA: `frentes_admissao.status` é varchar com catálogo, então acrescentar um
-- status é um INSERT. Nenhum enum de banco é tocado, nenhuma coluna é criada. É o mesmo molde das
-- migrations 0048 e 0087, que acrescentaram os status de espera do ASO e o "Liberado Sem ASO".
--
-- ORDEM 5, entre A_AGENDAR (4) e AGENDADO (5): o status é o degrau logo após "A Agendar". Agendado
-- e tudo o que vem depois descem uma casa para abrir espaço, preservando a ordem operacional (que é
-- também a régua de reversão em ORDEM_STATUS).
UPDATE "frente_status_catalogo" SET "ordem" = 11 WHERE "tipo" = 'EXAME' AND "codigo" = 'CANCELADO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 10 WHERE "tipo" = 'EXAME' AND "codigo" = 'APTO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 9 WHERE "tipo" = 'EXAME' AND "codigo" = 'LIBERADO_SEM_ASO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 8 WHERE "tipo" = 'EXAME' AND "codigo" = 'ASO_PENDENTE';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 7 WHERE "tipo" = 'EXAME' AND "codigo" = 'AGUARDANDO_ASO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 6 WHERE "tipo" = 'EXAME' AND "codigo" = 'AGENDADO';--> statement-breakpoint
INSERT INTO "frente_status_catalogo" ("tipo","codigo","rotulo","ordem","conclui")
VALUES ('EXAME','EXAME_SOLICITADO','Exame Solicitado',5,false)
ON CONFLICT ("tipo","codigo") DO NOTHING;
