-- O DE/PARA DAS ETAPAS EXTERNAS DO DIGAI. DUAS LINHAS, E MAIS NADA.
--
-- Desenho em `docs/MAPA-ALCANCE-INGESTAO-DIGAI.md`, secoes 4 e 8. Esta migration NAO cria tabela,
-- NAO cria tipo e NAO toca o catalogo de etapas:
--   . `as_identidades_externas` e `as_depara_etapa_externa` nasceram nas 0109 e 0110, e o CHECK de
--     fonte das duas JA aceita 'DIGAI';
--   . o valor 'DIGAI' de `as_candidato_origem` JA entrou pelo `CREATE TYPE` da 0112, entao um
--     `ALTER TYPE ... ADD VALUE` aqui seria ruido no `migrate` sobre um tipo que ja o tem;
--   . `as_etapas_funil` NAO e tocado: etapa de catalogo e decisao do diretor (secao A.31), e mexer
--     na coluna `inicial` (indice parcial UNICO) nao criaria uma segunda inicial, criaria uma
--     TROCA, mudando onde TODA candidatura nova nasce, inclusive as do Pandape e as manuais.
--
-- §A.6: nada de pessoal entra aqui. Duas chaves de etapa e um codigo de catalogo.

-- ┌─ POR QUE AS DUAS LINHAS APONTAM PARA `CAPTACAO`, E ISSO FOI MEDIDO NOS DOIS BANCOS ───────────┐
-- │ Em 29/09/2026, `ea_automatic` (producao, 118 migrations) e `ea_automatic_homolog` (132) TEM    │
-- │ CATALOGOS DIFERENTES:                                                                          │
-- │   . `CANDIDATURA` SO EXISTE NA HOMOLOGACAO. A FK desta tabela e RESTRICT, entao semear para    │
-- │     ela DERRUBARIA O `migrate` EM PRODUCAO, com o banco a meio caminho;                        │
-- │   . `TRIAGEM` existe nos dois e esta INATIVA na homologacao: a pessoa entraria numa etapa que  │
-- │     ninguem ve no seletor do funil, ou seja, entraria e sumiria.                                │
-- │                                                                                                 │
-- │ O UNICO CONJUNTO PRESENTE E ATIVO NOS DOIS e CAPTACAO, ENTREVISTA_SOULAN, ENTREVISTA_CLIENTE,  │
-- │ APROVACAO e STAND_BY. `CAPTACAO` e a escolha conservadora, e DUAS chaves externas apontando    │
-- │ para a MESMA etapa JA E O PADRAO DA CASA: `lead` e `inscritos` do Pandape fazem isso na 0110.  │
-- │                                                                                                 │
-- │ O ESTAGIO DA PESSOA CONTINUA DISTINGUIVEL pela CHAVE EXTERNA, que e estavel e distinta. O que  │
-- │ o diretor ainda decide e para qual etapa vai quem FINALIZOU a triagem; mudando a decisao, muda │
-- │ o `etapa_codigo` desta linha, e nada mais.                                                      │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ NENHUM ALVO PODE TER `entrega_ao_cliente` ───────────────────────────────────────────────────┐
-- │ `as/vagas/derivar-status-da-vaga.ts:118` MUDA O STATUS DA VAGA SOZINHO quando existe           │
-- │ candidatura VIVA numa etapa com aquela marca. A chegada em massa da triagem moveria o status   │
-- │ de vagas sem autor, com `por_id` nulo. Hoje so `ENTREVISTA_CLIENTE` tem a marca, e a marca e   │
-- │ EDITAVEL pelo diretor na tela do funil: a regra fica escrita por isso.                          │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- A CHAVE E O NOME JA NORMALIZADO (`normalizarChaveExterna`, em `domain/as-etapa-externa.ts`), e
-- nunca o rotulo cru: a consulta normaliza, e uma chave crua aqui nunca casaria com ela.
--
-- `DO NOTHING`, NUNCA `DO UPDATE`: o `etapa_codigo` e o `ativo` sao EDITAVEIS pelo diretor, e um
-- `DO UPDATE` desfaria a decisao dele a cada deploy, em silencio. Mesma trava da 0110.
-- ┌─ A SEMENTE E UM `INSERT ... VALUES`, E NAO UM `INSERT ... SELECT` ────────────────────────────┐
-- │ A auditoria sugeriu (como OPCIONAL) um `WHERE EXISTS` contra `as_etapas_funil`, para o caso   │
-- │ de o diretor ter apagado `CAPTACAO` do catalogo: a FK e RESTRICT, e sem a etapa a semente cai.│
-- │ FOI TENTADO E REVERTIDO, e o motivo vale ficar escrito, porque a proxima pessoa vai pensar o  │
-- │ mesmo: `fundacao.depara-etapa-externa.tester.spec.ts` LE a semente do disco com um parser de  │
-- │ `INSERT ... VALUES` e confere que o numero de INSERTs lidos bate com o numero de migrations    │
-- │ que semeiam esta tabela. Um `INSERT ... SELECT` conta como migration que semeia e NAO e lido   │
-- │ pelo parser, e o teste (codigo JA VALIDADO, de outra frente) fica vermelho.                    │
-- │                                                                                                │
-- │ O QUE SE PERDE E PEQUENO E BARULHENTO: sem a etapa no catalogo, o `migrate` cai ALTO, na hora, │
-- │ e nao em silencio. Trocar isso por quebrar a cobertura da fundacao nao compensa (secao A.26).  │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
INSERT INTO "as_depara_etapa_externa" ("fonte", "chave_externa", "rotulo_externo", "etapa_codigo")
VALUES
  ('DIGAI', 'triagem em andamento', 'Triagem Em Andamento', 'CAPTACAO'),
  ('DIGAI', 'triagem finalizada',   'Triagem Finalizada',   'CAPTACAO')
ON CONFLICT ("fonte", "chave_externa") DO NOTHING;
