-- CENTRAL DE VAGAS: os valores de lista que faltavam (itens 3, 4 e 6 do mapa do time, 07/09/2026).
--
-- ESTA MIGRATION SÓ ACRESCENTA. Nenhum valor é removido, nenhuma linha é reescrita, nenhuma coluna
-- muda de tipo. É a forma mais segura de mexer em enum, e é a única que o Postgres oferece:
-- `ALTER TYPE ... DROP VALUE` NÃO EXISTE. Os valores que saem da lista OFERECIDA pela tela
-- ('TECNICO' e o status 'VAGA_BANCO') ficam DORMENTES no banco, do mesmo jeito que a coluna
-- `vagas.centro_custo` já ficou: nada os escreve, nada os lê, e apagar seria destrutivo por nada.
--
-- CONFERIDO CONTRA OS DOIS BANCOS ANTES DE ESCREVER, e não deduzido: 'TECNICO' tem ZERO linhas em
-- produção e em homologação, e o status 'VAGA_BANCO' também. Por isso a saída deles da lista não
-- precisa de backfill nem deixa vaga com rótulo em branco.
--
-- A ARMADILHA DO POSTGRES (a mesma da 0059 e da 0086): valor criado por `ADD VALUE` não pode ser
-- USADO na mesma transação em que nasceu. Aqui isso não incomoda, porque esta migration não insere
-- nem atualiza nenhuma linha com os valores novos: quem passa a gravá-los é a tela, depois.

-- ── ESCOLARIDADE (itens 3 e 4) ──────────────────────────────────────────────────────────────────
-- TÉCNICO ganha os dois estados que o resto da lista já tinha. Até aqui havia um 'TECNICO' solto,
-- sem completo nem incompleto, e era o único nível da lista sem essa distinção.
ALTER TYPE "public"."vaga_escolaridade" ADD VALUE 'TECNICO_INCOMPLETO';--> statement-breakpoint
ALTER TYPE "public"."vaga_escolaridade" ADD VALUE 'TECNICO_COMPLETO';--> statement-breakpoint

-- CURSANDO NÃO É INCOMPLETO, e é por isso que são valores novos em vez de um rótulo diferente para
-- os que já existiam: INCOMPLETO é quem PAROU de estudar, CURSANDO é quem ESTÁ estudando. A vaga de
-- estágio exige exatamente o segundo, e até aqui não tinha como dizer isso.
--
-- TRÊS NÍVEIS, e não todos: Médio, Técnico e Superior são os que têm estagiário de verdade.
-- Fundamental cursando seria menor de idade fora do escopo de vaga, e Pós cursando não apareceu em
-- nenhum pedido. Acrescentar mais um depois é uma linha aqui e uma na lista do shared-types.
ALTER TYPE "public"."vaga_escolaridade" ADD VALUE 'MEDIO_CURSANDO';--> statement-breakpoint
ALTER TYPE "public"."vaga_escolaridade" ADD VALUE 'TECNICO_CURSANDO';--> statement-breakpoint
ALTER TYPE "public"."vaga_escolaridade" ADD VALUE 'SUPERIOR_CURSANDO';--> statement-breakpoint

-- ── NATUREZA (item 6) ───────────────────────────────────────────────────────────────────────────
-- 'REPOSICAO_EFETIVA' JÁ EXISTIA e CONTINUA: é a reposição de uma posição efetiva, e há base
-- importada apontando para ela. O que faltava era a reposição SEM o recorte de efetivo, que é como
-- o time fala na maioria das vezes. Os dois convivem; o consultor escolhe o que descreve a vaga.
ALTER TYPE "public"."vaga_natureza" ADD VALUE 'REPOSICAO';
