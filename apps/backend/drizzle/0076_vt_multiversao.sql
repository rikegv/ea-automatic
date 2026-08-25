-- O FORMULÁRIO DE VT PASSA A TER HISTÓRICO: várias versões por admissão, uma por envio.
--
-- O QUE MUDA NA PRÁTICA: até aqui `admissao_id` era UNIQUE, então o reenvio do funcionário
-- SOBRESCREVIA o formulário anterior. A vida real desmentiu a premissa: muda o endereço, muda a
-- linha, a passagem sobe, e cada uma dessas é uma DECLARAÇÃO NOVA da pessoa, não uma correção da
-- anterior. Apagar a antiga apagava a prova do que ela declarou quando assinou o contrato.
--
-- ADITIVA E SEM PERDA. Derrubar um UNIQUE nunca invalida linha existente: as que estão lá seguem
-- válidas e viram, cada uma, a única versão da sua admissão. Nada é reescrito, nada é apagado, e a
-- migração é reversível na prática (recriar o unique só falharia se já houvesse duas versões).
--
-- O ÍNDICE NÃO É ENFEITE. Com N versões por pessoa, toda leitura passa a pedir "a mais recente
-- desta admissão", e a tela de Benefícios faz isso para cada linha listada. Sem o índice por
-- (admissao_id, criado_em), cada abertura da tela varreria a tabela inteira por linha.
--
-- As CONDUÇÕES não precisam de nada: já são filhas de `formulario_id`, então cada versão já carrega
-- as suas naturalmente, e o histórico de itinerário vem de graça.
ALTER TABLE "formularios_vt" DROP CONSTRAINT "formularios_vt_admissao_id_unique";--> statement-breakpoint
CREATE INDEX "idx_formularios_vt_admissao_recente" ON "formularios_vt" USING btree ("admissao_id","criado_em");
