ALTER TABLE "admissoes" ALTER COLUMN "status_cadastro_beneficio" SET DEFAULT 'AGUARDANDO_CALCULO';--> statement-breakpoint
-- MIGRAÇÃO DAS LINHAS (§A.17 etapa 4): tudo que existe hoje passa a AGUARDANDO_CALCULO, o primeiro
-- estágio da fila. As 2.577 admissões estavam todas em PENDENTE, que era só o default herdado e que
-- nenhuma tela lia. Vai numa migration SEPARADA da que criou os valores porque o Postgres recusa usar
-- um valor de enum recém-criado na mesma transação que o criou.
UPDATE "admissoes"
   SET "status_cadastro_beneficio" = 'AGUARDANDO_CALCULO'
 WHERE "status_cadastro_beneficio" IN ('PENDENTE', 'CADASTRADO');
