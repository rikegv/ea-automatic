-- STATUS "LIBERADO PARA CADASTRO SEM ASO" na frente EXAME.
--
-- REGRA NOVA DE OPERAÇÃO (decisão do diretor): o cliente precisa da pessoa trabalhando ANTES de o
-- ASO ficar pronto. O status destrava o avanço da admissão (Cadastro, Integração, kit e assinatura)
-- SEM concluir a frente EXAME: ela CONTINUA na fila do Exame até o ASO subir.
--
-- `conclui = false`, e esta é a linha mais importante do arquivo. O bit `frentes_admissao.concluida`
-- responde a TRÊS perguntas de uma vez (o gate pode abrir? saiu da fila? a frente terminou?), e o
-- pedido é SIM só para a primeira. Marcar `conclui = true` aqui tiraria a admissão da fila, inflaria
-- o card "Aptas" e, pior, impediria o ASO de concluir a frente depois (`concluirExamePorAso` ignora
-- frente já concluída), prendendo a admissão para sempre. Quem aprende o status novo é o GATE
-- (`podeAbrirCadastro`), não o carimbo.
--
-- SEM MUDANÇA DE SCHEMA: `frentes_admissao.status` é varchar com catálogo, então acrescentar um
-- status é um INSERT. Nenhum enum é tocado, nenhuma coluna é criada.
--
-- ORDEM 8, entre ASO_PENDENTE (7) e APTO: o status é o último degrau ANTES do apto, e o Apto e o
-- Cancelado descem uma casa para abrir espaço. É o mesmo molde da 0048, que acrescentou os dois
-- status de espera do ASO.
UPDATE "frente_status_catalogo" SET "ordem" = 9 WHERE "tipo" = 'EXAME' AND "codigo" = 'APTO';--> statement-breakpoint
UPDATE "frente_status_catalogo" SET "ordem" = 10 WHERE "tipo" = 'EXAME' AND "codigo" = 'CANCELADO';--> statement-breakpoint
INSERT INTO "frente_status_catalogo" ("tipo","codigo","rotulo","ordem","conclui")
VALUES ('EXAME','LIBERADO_SEM_ASO','Liberado Para Cadastro Sem ASO',8,false)
ON CONFLICT ("tipo","codigo") DO NOTHING;
