-- AS DUAS PONTAS PASSAM A CONCORDAR PELA COLUNA CRUA, E O ESPACO FICA PROIBIDO NO BANCO
-- (07/10/2026, decisao do diretor, conserto do defeito que a 0150 abriu).
--
-- A 0150 JA ESTA APLICADA EM PRODUCAO, e por isso este conserto e migration NOVA e nao edicao dela.
--
-- ┌─ O DEFEITO QUE A 0150 ABRIU, E ELE ERA PIOR QUE O PROBLEMA ORIGINAL ──────────────────────────┐
-- │ A 0150 indexou `btrim(id_vacancy_pandape)` para impedir que "123" e " 123" fossem vagas        │
-- │ diferentes. Mas TODAS as buscas comparam a coluna CRUA (`where id_vacancy_pandape = $1`), e    │
-- │ ensinar a normalizacao a elas mexeria no caminho quente e validado da varredura (sec. A.26).   │
-- │                                                                                               │
-- │ COM AS DUAS PONTAS DISCORDANDO, UMA LINHA GRAVADA COM ESPACO TRAVA A VAGA PARA SEMPRE, e sem  │
-- │ corrida nenhuma: a busca de entrada nao acha (comparacao crua), a adocao nao acha (a linha ja  │
-- │ tem identidade), a segunda chance nao acha, o insert e RECUSADO (o indice compara aparado e ve │
-- │ a colisao) e a releitura nao acha. NAO HA VENCEDORA A RELER: a vaga falha a cada 30 minutos,   │
-- │ para sempre, e as inscricoes dela nunca entram. O mesmo no `espelharVaga` do Digai.            │
-- │ Achado pelo agente `tester`; nao era alcancavel em producao (medido: ZERO linhas com espaco    │
-- │ nas bordas, ZERO com espaco interno, ZERO nao-numericas), e e por isso que se fecha ANTES: o   │
-- │ sintoma seria uma vaga sumindo em silencio, que ninguem descobre por sintoma.                  │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A SAIDA ESCOLHIDA: PROIBIR O ESPACO, EM VEZ DE RECONCILIAR DEPOIS ──────────────────────────┐
-- │ Com o espaco proibido na coluna, a coluna CRUA JA E a forma normalizada, e as buscas passam a  │
-- │ concordar com o indice POR CONSTRUCAO, sem nenhuma delas ser tocada. O ganho do `btrim` era    │
-- │ impedir que "123" e " 123" convivessem; o CHECK impede isso ANTES, no nascimento.              │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- NENHUM ESCRITOR LEGITIMO FALHA NO CHECK, conferido um por um antes de escrever esta migration:
--   `vagas.service.create` passa por `texto()`, que apara e manda branco para nulo;
--   a varredura (insert do espelho e `update` da adocao) grava `String(idVacancy)`, e `idVacancy` e
--     `number` no contrato do ciclo, logo nao tem espaco por construcao;
--   `espelhoDaVagaDigai` ja faz `.trim()` e valida contra alfabeto fechado antes de virar chave;
--   `consolida-duplicatas-vaga-pandape` reescreve um valor LIDO da propria tabela, ja conforme;
--   os `arnes-*` semeiam literal numerico ou nulo.
--
-- MEDIDO CONTRA UM POSTGRES DE VERDADE (banco de prova `ea_prova_0151`, descartavel, com a forma da
-- producao: 540 numeros distintos + 6 vagas sem numero):
--   numero duplicado RECUSADO (23505, restricao `uq_vagas_id_vacancy_pandape`);
--   varios NULOS convivem; duas linhas VAZIAS convivem (ficam fora do indice parcial);
--   borda com espaco RECUSADA pelo CHECK, nos dois lados;
--   numero novo aceito.
--
-- Sec. A.6: indice e CHECK sobre o identificador de uma VAGA no ATS, nenhum dado pessoal. O `DETAIL`
-- do erro do Postgres carrega o valor que violou, e e por isso que nenhuma camada repassa a mensagem
-- do banco ao usuario (ver `domain/vaga-numero-pandape-unico.ts`).

-- 1. SAI O INDICE DE EXPRESSAO DA 0150.
DROP INDEX IF EXISTS uq_vagas_id_vacancy_pandape;

-- 2. ENTRA O MESMO UNIQUE PARCIAL, AGORA SOBRE A COLUNA CRUA.
--
-- O PREDICADO MANTEM AS DUAS EXCLUSOES DA 0150, e cada uma por sua razao: NULO porque a vaga MANUAL
-- nao tem numero de ATS nenhum e esse e o estado normal dela (medido: 546 vagas, 540 com numero, 6
-- sem); VAZIO porque string vazia nao e nulo e entraria no indice como VALOR, e aí a segunda vaga
-- com o numero em branco receberia um erro de "numero duplicado" por NAO ter numero, que e a
-- mensagem mais confusa possivel. Fora do indice, o branco se comporta como ausencia, que e o que
-- ele e.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vagas_id_vacancy_pandape
  ON vagas (id_vacancy_pandape)
  WHERE id_vacancy_pandape IS NOT NULL AND id_vacancy_pandape <> '';

-- 3. O CHECK QUE SUSTENTA A CONCORDANCIA DAS DUAS PONTAS.
--
-- Sem ele, a coluna crua volta a admitir " 123" ao lado de "123", e a operacao passa a ter duas
-- linhas que ela le como a mesma vaga. Ele e a peca que faz a coluna crua SER a forma normalizada,
-- e e o que permite as buscas ficarem exatamente como estao.
--
-- `btrim` APARA SO O ESPACO, nao tabulacao nem quebra de linha (medido no banco de prova: TAB e
-- NEWLINE nas bordas PASSAM este CHECK). Com a chave crua isso NAO reabre o defeito de incoerencia,
-- porque indice e buscas comparam o mesmo valor; sobra como classe de DIGITACAO, irmã do zero a
-- esquerda, e esta registrada como proposta no reporte, nao decidida aqui.
--
-- Idempotente: `DROP ... IF EXISTS` seguido do `ADD` re-aplica sem erro em producao e na homologacao.
ALTER TABLE vagas DROP CONSTRAINT IF EXISTS ck_vagas_id_vacancy_pandape_sem_espaco;
ALTER TABLE vagas ADD CONSTRAINT ck_vagas_id_vacancy_pandape_sem_espaco
  CHECK (id_vacancy_pandape IS NULL OR id_vacancy_pandape = btrim(id_vacancy_pandape));
