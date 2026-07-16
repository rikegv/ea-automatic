-- Reorganização da frente Cadastro/Contrato (decisão do diretor).
--
-- "Enviar"/"Enviado"/"Integração" eram resíduo da esteira manual antiga: o estado do contrato hoje
-- vive em `admissoes.clicksign_status` (INT-4), não na frente. A coluna Cadastro fica só com
-- "A cadastrar" e "Cadastrado" (concluinte).
--
-- Escrita à mão de propósito: é migração de DADO (catálogo + frentes), e `frentes_admissao.status`
-- é varchar com catálogo na aplicação, não enum — o drizzle-kit generate não produziria nada.
--
-- IDEMPOTENTE: toda etapa é condicional ao estado de origem. Rodar 2x não muda nada.
-- §A.6: opera só por código de status; nenhum CPF/PII envolvido.

-- 1) O CADASTRADO intermediário (conclui=false) sai ANTES do rename, senão o UPDATE do passo 3
--    colidiria com o unique (tipo, codigo). Só remove se ninguém o estiver usando: se algum dia
--    tiver dado, a migration falha alto em vez de apagar estado real em silêncio.
DELETE FROM frente_status_catalogo c
 WHERE c.tipo = 'CADASTRO_CONTRATO'
   AND c.codigo = 'CADASTRADO'
   AND c.conclui = false
   AND NOT EXISTS (
     SELECT 1 FROM frentes_admissao f
      WHERE f.tipo = 'CADASTRO_CONTRATO' AND f.status = 'CADASTRADO'
   );
--> statement-breakpoint

-- 2) As 1.432 frentes concluídas migram INTEGRACAO -> CADASTRADO. `concluida` NÃO é tocada: elas já
--    são true e continuam true, então o gate F12 (kit/Clicksign) segue enxergando-as concluídas.
UPDATE frentes_admissao
   SET status = 'CADASTRADO', atualizado_em = now()
 WHERE tipo = 'CADASTRO_CONTRATO' AND status = 'INTEGRACAO';
--> statement-breakpoint

-- 3) O concluinte assume o nome e o rótulo. `conclui` permanece true: é a chave que sustenta
--    STATUS_CONCLUI, kitLiberado() e o disparo do envelope.
UPDATE frente_status_catalogo
   SET codigo = 'CADASTRADO', rotulo = 'Cadastrado'
 WHERE tipo = 'CADASTRO_CONTRATO' AND codigo = 'INTEGRACAO';
--> statement-breakpoint

-- 4) Enviar/Enviado saem. Mesma proteção do passo 1: só se não houver admissão neles.
DELETE FROM frente_status_catalogo c
 WHERE c.tipo = 'CADASTRO_CONTRATO'
   AND c.codigo IN ('ENVIAR', 'ENVIADO')
   AND NOT EXISTS (
     SELECT 1 FROM frentes_admissao f
      WHERE f.tipo = 'CADASTRO_CONTRATO' AND f.status = c.codigo
   );
--> statement-breakpoint

-- 5) Normaliza a `ordem` do concluinte: o catálogo migrado fica IDÊNTICO ao que o seed gera num
--    banco novo (A_CADASTRAR=8, CADASTRADO=9). Sem isto o CADASTRADO herdaria a ordem 12 do
--    ex-INTEGRACAO e produção divergiria de um banco recém-semeado. Passo SEPARADO do rename de
--    propósito: assim também corrige um banco onde o rename já rodou (idempotência real, não
--    aparente).
UPDATE frente_status_catalogo
   SET ordem = 9
 WHERE tipo = 'CADASTRO_CONTRATO' AND codigo = 'CADASTRADO' AND ordem <> 9;
