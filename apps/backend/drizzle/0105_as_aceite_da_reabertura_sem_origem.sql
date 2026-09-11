-- A&S, O ACEITE DA REABERTURA SEM ORIGEM: o caminho arriscado passa a ter nome próprio no log.
--
-- ┌─ POR QUE UM VALOR NOVO, E NÃO O `REENTRADA` QUE JÁ EXISTE ─────────────────────────────────┐
-- │ A reabertura da vaga cancelada tem DOIS caminhos, e eles não são a mesma decisão:            │
-- │                                                                                             │
-- │   COM_ORIGEM: o cancelamento CARIMBOU quem ele descartou (migration 0104), então reabrir é   │
-- │     desfazer o próprio gesto. O sistema SABE que aquela saída foi causada pelo cancelamento. │
-- │                                                                                             │
-- │   SEM_ORIGEM: cancelamento ANTERIOR ao carimbo. O sistema ADMITE que não sabe quem saiu por  │
-- │     causa dele, e o Master está REESCOLHENDO a pessoa, não desfazendo um gesto. É o mesmo    │
-- │     peso da ciência de reentrada, e por isso deixa aceite.                                   │
-- │                                                                                             │
-- │ CONFLATAR OS DOIS NO `REENTRADA` DEIXARIA A AUDITORIA SEM RESPOSTA para a única pergunta que │
-- │ importa aqui: "quantas vezes alguém foi trazido de volta pelo caminho em que o sistema não   │
-- │ sabia de onde ela vinha". Com um valor próprio, isso é um `where` exato no índice parcial que │
-- │ a 0097 já criou.                                                                             │
-- └─────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- O CHECK É RECONSTRUÍDO, e não há outro jeito: `ck_as_candidatura_etapas_aceite` ENUMERA os valores
-- aceitos (0097), então um valor novo gravado sem esta migration é recusado pelo banco. A lista aqui
-- é a mesma que `ACEITES_REGISTRAVEIS` monta em `domain/candidatura.ts`, que é de onde o schema do
-- drizzle a deriva (`ACEITES_SQL`): a lista tem UM dono, e este arquivo só a alcança no banco.
--
-- TEXTO COM CHECK, E NÃO ENUM DO POSTGRES, pela mesma razão medida na 0095/0096/0097: valor criado
-- por `ALTER TYPE ... ADD VALUE` não pode ser USADO na transação em que nasceu, e o migrador do
-- drizzle roda todas as pendentes dentro de uma transação só.
--
-- RISCO DE DADO: NULO. O CHECK só AMPLIA o conjunto aceito. Nenhuma linha existente é reescrita,
-- nenhuma passa a violar a restrição e nenhuma consulta muda de resposta.
--
-- RE-EXECUTÁVEL, como a casa exige: `DROP CONSTRAINT IF EXISTS` seguido de `ADD CONSTRAINT`, dentro
-- de um bloco `DO`, porque `ADD CONSTRAINT` não aceita `IF NOT EXISTS` por sintaxe.

DO $$
BEGIN
  ALTER TABLE "as_candidatura_etapas" DROP CONSTRAINT IF EXISTS "ck_as_candidatura_etapas_aceite";
  ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "ck_as_candidatura_etapas_aceite"
    CHECK ("aceite" is null or "aceite" in ('BANCO_COM_OFICIAIS_ABERTAS', 'REENTRADA', 'REABERTURA_SEM_ORIGEM'));
END $$;
