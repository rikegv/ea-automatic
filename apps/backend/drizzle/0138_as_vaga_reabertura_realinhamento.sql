-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0138: A REABERTURA DA VAGA ENTREGUE, E O REALINHAMENTO DE PERFIL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ┌─ O QUE O DIRETOR PEDIU, EM DUAS FRASES, PORQUE É ELAS QUE EXPLICAM CADA `ALTER` ABAIXO ───────┐
-- │ 1. REABERTURA: a vaga estava ENTREGUE, o cliente reprovou, o processo REABRE e a SLA volta a   │
-- │    contar A PARTIR DA REABERTURA. A vaga volta para ABERTA com os candidatos em TRIAGEM,       │
-- │    porque se o cliente reprovou o time precisa fazer nova triagem.                             │
-- │ 2. REALINHAMENTO: o cliente definiu um perfil e depois pede um NOVO alinhamento dele. É campo  │
-- │    que o TIME PREENCHE A MÃO; o sistema nunca o carimba.                                       │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE A SLA VIRA UM PRAZO NOVO, E NÃO UMA CONTAGEM ZERADA ─────────────────────────────────┐
-- │ A SLA desta casa é uma contagem REGRESSIVA até a Previsão De Entrega (`vagas.data_limite`      │
-- │ menos hoje, em `as-vaga-sla.ts`). Em contagem regressiva NÃO EXISTE "zerar": o que existe é um │
-- │ PRAZO NOVO. Foi a decisão do diretor, e ela é a única que cabe na régua que já está no ar e    │
-- │ testada, sem inventar uma segunda régua de SLA ao lado da primeira.                            │
-- │                                                                                                │
-- │ ENTÃO A REABERTURA PEDE UMA PREVISÃO DE ENTREGA NOVA, e o prazo que ela substitui é GUARDADO   │
-- │ em `data_limite_anterior`. Sem essa cópia, a vaga reaberta apareceria com um prazo novo e       │
-- │ ninguém saberia que houve um primeiro, que é a diferença entre um ATRASO e uma RENEGOCIAÇÃO.   │
-- │                                                                                                │
-- │ O DEFEITO QUE ISSO CORRIGE JÁ EXISTE HOJE: reabrir DESCONGELA a SLA e ela volta a correr       │
-- │ contra o `data_limite` ANTIGO, que quase sempre já passou. A vaga reaberta nasce               │
-- │ "Prazo Vencido", sem ninguém ter atrasado nada.                                                │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada aqui guarda dado de pessoa. São quatro datas, um id de usuário INTERNO e um flag de
-- catálogo. Nenhum CPF, nenhum nome, nenhuma URL.
--
-- RE-EXECUTÁVEL: `IF NOT EXISTS` nas colunas e nos índices, `DO` na constraint, e o `UPDATE` da
-- semente é idempotente por construção (escreve o mesmo valor de novo).

-- ── 1. O REALINHAMENTO DE PERFIL, PREENCHIDO À MÃO ──────────────────────────────────────────────
--
-- ┌─ COLUNA NOVA, E NÃO UM RECARIMBO DE `data_alinhamento` ────────────────────────────────────────┐
-- │ Sobrescrever `data_alinhamento` apagaria PARA SEMPRE a data do alinhamento ORIGINAL, que é o    │
-- │ marco de quando o perfil foi combinado. E o pedido é COMPARATIVO ("o cliente definiu um perfil  │
-- │ E DEPOIS pediu outro"), então a pergunta que a tela vai fazer é "quanto tempo depois", e ela    │
-- │ precisa das DUAS pontas. Guardar as duas é aditivo; sobrescrever destrói, e não tem volta.      │
-- │                                                                                                │
-- │ ENTRA PELO MESMO CAMINHO DA IRMÃ (`camposDaTrilha`, que serve a criação E a edição), porque é   │
-- │ literalmente o mesmo tipo de campo: o time digita, o sistema só grava.                          │
-- │                                                                                                │
-- │ SEM ÍNDICE, de propósito: ninguém pergunta "quais vagas realinharam", e a coluna é nula na      │
-- │ esmagadora maioria das linhas.                                                                  │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "data_realinhamento" date;--> statement-breakpoint

-- ── 2. OS CARIMBOS DA REABERTURA ────────────────────────────────────────────────────────────────
--
-- `data_reabertura` É CARIMBO DE SISTEMA, e não campo de formulário: quem reabre é a porta
-- `reabrir`, então a data é o dia em que ela rodou. O que VEM do formulário é a Previsão De Entrega
-- nova, que é fato COMERCIAL negociado com o cliente, do mesmo tipo do `data_fechamento`.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "data_reabertura" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "data_limite_anterior" date;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "reabertura_por_id" uuid;--> statement-breakpoint

-- `ON DELETE SET NULL` NO AUTOR, e sem check de "tudo ou nada" entre as duas colunas: é o MESMO
-- desenho do `status_manual_por_id` (0130) e dos carimbos de cancelamento (0098/0113). Apagar um
-- usuário não pode FALHAR por causa de uma vaga que ele reabriu meses antes, e o carimbo não pode
-- sumir junto com ele: sem o autor, o `data_reabertura` ainda responde "esta vaga foi reaberta em
-- tal dia", que é a pergunta do relatório. QUEM reabriu continua respondido pela trilha
-- (`as_vaga_status_eventos.por_id`), que a reabertura já grava.
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "vagas_reabertura_por_id_usuarios_id_fk"
    FOREIGN KEY ("reabertura_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- A pergunta é sempre "quais vagas foram reabertas", nunca "todas as vagas": índice PARCIAL, no
-- molde do `idx_vagas_cancelada_em`, do `idx_vagas_encerrada_em` e do `idx_vagas_status_manual_em`.
-- A coluna é nula na esmagadora maioria das linhas.
CREATE INDEX IF NOT EXISTS "idx_vagas_data_reabertura" ON "vagas" ("data_reabertura") WHERE "data_reabertura" IS NOT NULL;--> statement-breakpoint

-- ── 3. PARA QUAL ETAPA VOLTA QUEM ESTAVA COM O CLIENTE ──────────────────────────────────────────
--
-- ┌─ UM FLAG NO CATÁLOGO, E NÃO `etapa = 'TRIAGEM'` NO CÓDIGO ─────────────────────────────────────┐
-- │ A LISTA DE ETAPAS É DO DIRETOR (`as_etapas_funil`, 0100): ele cadastra, renomeia, reordena e    │
-- │ inativa pela tela. Um `if` comparando com o código `TRIAGEM` seria código fingindo saber uma    │
-- │ lista que o usuário edita, e é exatamente o hardcode que a 0102 e a 0130 passaram inteiras      │
-- │ eliminando. É a MESMA forma do `entrega_ao_cliente` e do `destino_do_cancelamento` (0130): o    │
-- │ COMPORTAMENTO é do sistema, a LINHA é do diretor.                                               │
-- │                                                                                                │
-- │ E NÃO SERVE O FLAG `inicial` QUE JÁ EXISTE: medido no catálogo de produção, a etapa inicial é    │
-- │ `CAPTACAO`, não `TRIAGEM`. Reusá-lo devolveria todo mundo para a Captação, que é um passo antes  │
-- │ do que o diretor pediu ("o time precisa fazer nova TRIAGEM").                                    │
-- │                                                                                                 │
-- │ FAIL-CLOSED DO OUTRO LADO DO `destino_do_cancelamento`, E A ASSIMETRIA É DELIBERADA: lá, sem     │
-- │ destino configurado NINGUÉM SE MOVE e o cancelamento acontece de todo jeito, porque bloquear o   │
-- │ cancelamento por causa de catálogo desfaria uma decisão do diretor. AQUI mover é a operação      │
-- │ INTEIRA: é saindo da etapa de entrega que a vaga volta a ser ABERTA pela derivação. Sem destino, │
-- │ a reabertura seria uma vaga que continua ENTREGUE afirmando ter reaberto, então ela RECUSA.      │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "as_etapas_funil" ADD COLUMN IF NOT EXISTS "destino_da_reabertura" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- A SEMENTE, e ela é UMA linha. `WHERE codigo = ...` e não `WHERE rotulo = ...`: o código é a
-- identidade IMUTÁVEL da etapa (a 0100 diz isso), o rótulo é editável.
UPDATE "as_etapas_funil" SET "destino_da_reabertura" = true WHERE "codigo" = 'TRIAGEM';--> statement-breakpoint

-- NO MÁXIMO UM DESTINO, garantido pelo banco, no MOLDE do `as_etapas_funil_destino_cancelamento_unico`
-- e do `as_etapas_funil_inicial_unica`: "para onde volta quem estava com o cliente" é uma pergunta com
-- UMA resposta, e duas linhas marcadas fariam a rotina ESCOLHER, que é o que ela não pode fazer.
-- PARCIAL, então ele não diz nada sobre as etapas não marcadas, que são todas as outras.
CREATE UNIQUE INDEX IF NOT EXISTS "as_etapas_funil_destino_reabertura_unico"
  ON "as_etapas_funil" ("destino_da_reabertura") WHERE "destino_da_reabertura";
