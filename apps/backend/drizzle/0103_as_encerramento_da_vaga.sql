-- A&S, O INSTANTE EM QUE A VAGA ENCERROU passa a ser CARIMBADO PELO SERVIDOR.
--
-- O QUE ESTA MIGRATION FAZ:
--   1. cria `vagas.encerrada_em` (timestamptz, nula enquanto a vaga está viva);
--   2. faz o BACKFILL das vagas JÁ encerradas, por `coalesce(cancelada_em, atualizado_em)`;
--   3. cria o índice PARCIAL, porque a pergunta é sempre "quais vagas encerraram", nunca "todas".
--
-- ┌─ PARA QUE ELA EXISTE: O RELÓGIO DA RETENÇÃO (§A.6, LGPD) ──────────────────────────────────────┐
-- │ O expurgo de candidatos (`retencao-candidatos.service.ts`) passa a tratar "vivo em vaga         │
-- │ ENCERRADA" como processo encerrado, para o prazo de 2 anos poder começar a correr: sem isso, a  │
-- │ pessoa deixada APROVADA numa vaga cancelada nunca satisfazia a cláusula e o dado pessoal dela   │
-- │ ficava retido PARA SEMPRE. Só que, se o prazo dela contasse do `atualizado_em` da candidatura,  │
-- │ o efeito seria o OPOSTO do pretendido: quem foi aprovado em 2024 numa vaga encerrada hoje       │
-- │ nasceria com o prazo JÁ VENCIDO e seria anonimizado na varredura seguinte, sem carência         │
-- │ nenhuma. Encerrar a vaga NÃO carimba a candidatura de quem não segurava o encerramento (medido: │
-- │ na homologação a candidatura APROVADA ficou 18 segundos ATRÁS do `cancelada_em` da vaga).       │
-- │                                                                                                │
-- │ É POR ISSO QUE O RELÓGIO PRECISA DESTA COLUNA: para essa candidatura, a data de referência é o  │
-- │ ENCERRAMENTO DA VAGA, e não o movimento dela.                                                   │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE `data_fechamento` NÃO SERVE, e esta é a razão inteira de a coluna nascer ─────────────┐
-- │ `data_fechamento` VEM DO CORPO DA REQUISIÇÃO. No fechamento é `dto.dataFechamento`, no          │
-- │ cancelamento é `dto.dataCancelamento`, os dois `@IsISO8601()` SEM PISO, e isso é DELIBERADO: é  │
-- │ o fato COMERCIAL, que pode ser anterior ao clique (o cliente cancelou na semana passada e o     │
-- │ registro entra hoje). Ela é o que o contador de dias em aberto lê, e está certa como está.      │
-- │                                                                                                │
-- │ O QUE ELA NÃO PODE SER É RELÓGIO DE EXPURGO. Um COMUM que cancelasse uma vaga com data de 2019  │
-- │ faria TODO MUNDO dentro dela virar elegível na varredura seguinte: um gatilho REMOTO de         │
-- │ exclusão irreversível de dado pessoal, acionável pelo corpo de um POST. `encerrada_em` é do     │
-- │ SERVIDOR (`new Date()` na mesma gravação que muda o status), como `cancelada_em` já era, e por  │
-- │ isso ninguém a empurra para trás.                                                               │
-- │                                                                                                │
-- │ `cancelada_em` TAMBÉM NÃO BASTA: ela só existe no CANCELAMENTO. A vaga FECHADA e a ENTREGUE     │
-- │ encerram igual e não tinham carimbo de servidor nenhum, que é a metade que faltava.             │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- O BACKFILL USA `coalesce(cancelada_em, atualizado_em)`, e não `data_fechamento`, pelo mesmo motivo
-- acima: para a vaga cancelada existe carimbo de servidor de verdade, e para a fechada o
-- `atualizado_em` é a melhor aproximação DE SERVIDOR do instante do encerramento (a última escrita da
-- linha, e o fechamento é a última coisa que acontece com uma vaga). Aproximação de servidor erra por
-- minutos; o corpo da requisição erra por anos, e para o lado que apaga gente.
--
-- QUEM ESCREVE ESTA COLUNA: `vagas.service.fechar` e `vagas.service.cancelar`, e mais ninguém. São as
-- DUAS ÚNICAS portas para um status que encerra (`moverStatus` recusa destino que encerra, no service
-- e no CHECK `as_vaga_status_encerra_nao_e_destino` da 0102), e nas duas o carimbo entra no MESMO
-- `update` que muda o status: não existe vaga encerrada sem o instante do encerramento.
--
-- §A.6: um timestamp de PROCESSO. Nenhum dado pessoal, nenhum CPF, nenhuma URL.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "encerrada_em" timestamp with time zone;--> statement-breakpoint

UPDATE "vagas" v
   SET "encerrada_em" = coalesce(v."cancelada_em", v."atualizado_em")
  FROM "as_vaga_status" s
 WHERE s."codigo" = v."status"
   AND s."encerra"
   AND v."encerrada_em" IS NULL;--> statement-breakpoint

-- ÍNDICE PARCIAL, o mesmo desenho de `idx_vagas_cancelada_em`: a coluna é nula na vaga viva, que é a
-- maioria, e a pergunta que a retenção faz é sempre sobre a vaga ENCERRADA.
CREATE INDEX IF NOT EXISTS "idx_vagas_encerrada_em" ON "vagas" ("encerrada_em") WHERE "encerrada_em" IS NOT NULL;
