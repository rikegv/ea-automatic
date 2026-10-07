-- PRE-PREENCHIMENTO DA VAGA EM REVISAO A PARTIR DA PLANILHA VIVA (07/10/2026).
--
-- Ver o briefing e os comentarios do schema (db/schema/tables.ts) e do dominio
-- (domain/as-planilha-prepreenchimento.ts). Duas metades, e elas sao independentes:
--
--  1. O ESPELHO (as_depara_cliente_vaga) ganha os CINCO valores agregados POR CODIGO que a
--     sincronizacao da planilha calcula. Eles nascem nulos e a sincronizacao os preenche; nulo
--     significa ABSTENCAO, sempre, e por campo (o mesmo codigo com dois tipos de vaga abstem o
--     TIPO e nao a celula).
--
--  2. A VAGA (vagas) ganha a PROCEDENCIA por campo. Valor unico 'PLANILHA', vocabulario FECHADO
--     por CHECK, nulo quando aquele campo nao veio da planilha. Ela responde a UMA pergunta:
--     "este valor foi digitado por alguem ou foi copiado da planilha?". No dia em que uma linha da
--     planilha estiver errada, o que importa e QUANTAS vagas herdaram o mesmo erro, e isso e uma
--     CONTAGEM, nao leitura de texto de observacao. Mesmo molde de cliente_proposto_estado.
--
-- ESTA MIGRATION NAO MENCIONA 'REPOSICAO_TEMPORARIA', e a omissao e obrigatoria: aquele valor foi
-- acrescentado ao enum vaga_natureza pela 0145, e o Postgres recusa USAR na mesma transacao um
-- valor acrescentado nela. Por isso natureza_planilha no espelho e varchar(40) e nao o enum: o
-- espelho guarda o TOKEN, o enum mora so em vagas.natureza, e quem fecha o vocabulario e o dominio
-- puro (nao existe cast de texto para enum em lugar nenhum desta frente).
--
-- NENHUMA COLUNA DE CELULA DE ATENDIMENTO E CRIADA EM vagas, e isso foi medido: a celula JA TEM
-- coluna, vagas.linha_servico_id (obrigatorio 8 da regua, rotulo "Celula de atendimento", FK para
-- as_linhas_servico, 7 preenchidas na fila). Criar uma segunda duplicaria o obrigatorio em dois
-- lugares e quebraria a regua.
--
-- ADITIVA E IDEMPOTENTE: so ADD COLUMN IF NOT EXISTS e CHECK em DO-block guardado. Nada e apagado,
-- nada e renomeado, nenhum default e escrito em linha existente (Sec. A.27).
--
-- Sec. A.6: nenhuma das dez colunas e dado pessoal. Tipo de vaga, celula de atendimento e cargo sao
-- classificacao de processo; as duas datas sao prazo; a procedencia e um rotulo de vocabulario
-- fechado. Nenhuma identifica ninguem, e nenhuma guarda texto livre da planilha (o cargo entra como
-- UUID do catalogo do EA, nunca como o texto digitado na celula).

-- ─ 1. O ESPELHO: os valores agregados por codigo ────────────────────────────────────────────────
ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "natureza_planilha" varchar(40);--> statement-breakpoint
ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "linha_servico_id_planilha" integer;--> statement-breakpoint
ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "cargo_id_planilha" uuid;--> statement-breakpoint
ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "data_abertura_planilha" date;--> statement-breakpoint
ALTER TABLE "as_depara_cliente_vaga" ADD COLUMN IF NOT EXISTS "data_limite_planilha" date;--> statement-breakpoint

-- ─ 2. A VAGA: a procedencia POR CAMPO ───────────────────────────────────────────────────────────
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "natureza_origem" varchar(20);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "linha_servico_origem" varchar(20);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cargo_origem" varchar(20);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "data_abertura_origem" varchar(20);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "data_limite_origem" varchar(20);--> statement-breakpoint

-- CINCO CHECKS SEPARADOS, UM POR CAMPO, E NUNCA UM CHECK UNICO ENTRE ELES.
--
-- Amarrar os cinco num CHECK de coerencia (o molde do ck_vagas_cliente_proposto_coerente, que exige
-- nome+origem+estado juntos) faria a procedencia de UM campo passar a EXIGIR a do outro: a vaga que
-- recebeu so a celula da planilha ficaria invalida por nao ter recebido o tipo, e a escrita falharia
-- de 30 em 30 minutos, engolida pelo catch que protege a ingestao. A abstencao e POR CAMPO, e os
-- CHECKS tambem.
--
-- E NAO EXISTE CHECK DE COERENCIA DENTRO DE UM CAMPO ("origem preenchida exige valor preenchido"),
-- tambem de proposito: ele transformaria o gesto legitimo de uma PESSOA limpar o campo na tela em
-- violacao de restricao, barrando a edicao humana por causa de um carimbo de procedencia. O humano
-- ganha do carimbo, sempre.
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_natureza_origem"
    CHECK ("natureza_origem" IS NULL OR "natureza_origem" IN ('PLANILHA'));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_linha_servico_origem"
    CHECK ("linha_servico_origem" IS NULL OR "linha_servico_origem" IN ('PLANILHA'));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_cargo_origem"
    CHECK ("cargo_origem" IS NULL OR "cargo_origem" IN ('PLANILHA'));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_data_abertura_origem"
    CHECK ("data_abertura_origem" IS NULL OR "data_abertura_origem" IN ('PLANILHA'));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_data_limite_origem"
    CHECK ("data_limite_origem" IS NULL OR "data_limite_origem" IN ('PLANILHA'));
EXCEPTION WHEN duplicate_object THEN null; END $$;
