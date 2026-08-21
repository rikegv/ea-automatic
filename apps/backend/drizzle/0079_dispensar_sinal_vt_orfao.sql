-- DISPENSAR O SINAL do VT órfão: o alerta some e NÃO volta.
--
-- O PROBLEMA: o sinal aponta formulários que não casaram com admissão nenhuma, e alguns deles não
-- serão tratados (arquivo de teste, pessoa que nunca foi cadastrada, envio duplicado). Sem uma forma
-- de dispensar, o alerta apita para sempre, e um painel que apita para sempre é um painel que o time
-- aprende a ignorar, inclusive quando ele aponta algo de verdade.
--
-- DISPENSAR NÃO É TRATAR, e nada aqui toca o arquivo. O objeto continua no bucket, o formulário
-- continua sem dono e a linha do ledger continua existindo com o status que tinha. O que muda é
-- exclusivamente a VISIBILIDADE do alerta. Quem quiser tratar de verdade usa o casamento manual, que
-- é outro botão, com outro efeito.
--
-- POR QUE A MARCA É PERSISTENTE E FICA AQUI: a varredura roda em ciclo e reavalia os mesmos
-- registros. Uma dispensa guardada em memória, em sessão ou na tela reapareceria no ciclo seguinte,
-- e aí não teria resolvido nada. Guardada na própria linha do ledger, ela vale para sempre e para
-- todo mundo, que é o que "resolver" quer dizer.
--
-- QUEM DISPENSOU fica registrado: é decisão por conta e risco de alguém, e o mínimo é saber de quem.
-- ON DELETE SET NULL para desligar o usuário não apagar o registro da decisão dele.
ALTER TABLE "vt_coleta" ADD COLUMN "sinal_dispensado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vt_coleta" ADD COLUMN "sinal_dispensado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "vt_coleta" ADD CONSTRAINT "vt_coleta_sinal_dispensado_por_id_usuarios_id_fk" FOREIGN KEY ("sinal_dispensado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;