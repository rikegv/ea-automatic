-- A TRANSFERENCIA DA VAGA DE UM CONSULTOR PARA OUTRO (item 5 da OST de 30/09/2026).
--
-- O QUE ELA GUARDA: quem transferiu, quando, e de qual consultor para qual. `vagas.consultor_id` e
-- UMA coluna, e a proxima escrita apaga a anterior: sem este rastro, a pergunta "quem tirou esta vaga
-- de mim?" nao tem resposta consultavel em lugar nenhum. `atualizado_em` nao resolve, e vale dizer
-- porque e a saida obvia: ele responde QUANDO a linha foi tocada, nunca QUEM tocou nem qual era o
-- valor antes, e a escrita seguinte o sobrescreve.
--
-- ┌─ TABELA PROPRIA, E NAO UMA LINHA EM `as_vaga_status_eventos` ─────────────────────────────────┐
-- │ E o MESMO argumento, medido, de `vaga_cliente_correcoes` (0118), e ele nao e de desenho: e de  │
-- │ LEITOR. Aquela tabela e a linha do tempo do MOVIMENTO DE STATUS, e transferir de consultor nao │
-- │ move status nenhum, entao a linha teria de ser gravada como "ABERTA para ABERTA", inventando um │
-- │ passo que nao aconteceu.                                                                      │
-- │                                                                                               │
-- │ E MAIS CONCRETO QUE O ARGUMENTO DE DESENHO, ELA MUDA A RESPOSTA DE UM LEITOR REAL: o apagar do │
-- │ catalogo (`vaga-status.service.remover`) conta eventos com `de = codigo or para = codigo` para │
-- │ escolher entre APAGAR de verdade e INATIVAR um status. Uma vaga entra em status sem gerar       │
-- │ evento (a trilha de abertura grava o status direto), entao uma transferencia gravada la         │
-- │ transformaria "zero trilha, apaga" em "ha vagas que ja passaram por ele, inativa", por causa de │
-- │ uma troca de responsavel que nao e passagem de status nenhuma.                                 │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- SET NULL NOS TRES IDS DE USUARIO, como em `vaga_cliente_correcoes` e em `as_vaga_status_eventos`:
-- apagar um usuario nao pode FALHAR por causa de uma transferencia de meses atras, e o rastro nao
-- pode sumir junto com ele. Sem os ids, ele ainda diz QUANDO houve transferencia naquela vaga.
--
-- `para_consultor_id` NAO E `not null` apesar de a operacao sempre ter destino, e isso e deliberado:
-- uma coluna `not null` com `on delete set null` e uma contradicao que faz a exclusao do usuario
-- FALHAR anos depois, que e exatamente o que este `set null` existe para impedir. Quem garante que a
-- operacao tem destino e o DTO, na entrada, e o CHECK abaixo, que recusa a linha que nao e troca.
--
-- §A.6: um id de vaga, tres ids de usuario INTERNO e uma data. Nenhum dado de candidato, nenhum CPF,
-- nenhum texto livre vindo de fora.
CREATE TABLE IF NOT EXISTS "vaga_consultor_transferencias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- CASCADE: o rastro e DA vaga e nao sobrevive a ela, mesma regra de `vaga_cliente_correcoes`.
  "vaga_id" uuid NOT NULL REFERENCES "vagas"("id") ON DELETE CASCADE,
  -- NULO e "nao havia consultor" (a vaga espelhada do Pandape nasce sem lado), nao um id perdido.
  "de_consultor_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "para_consultor_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  -- QUEM transferiu, da sessao. Autoria e trilha, nunca campo de formulario.
  "por_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  -- LINHA QUE NAO E TRANSFERENCIA NAO EXISTE, e quem garante e o banco, como em
  -- `ck_vaga_cliente_correcoes_houve_troca`. Sem o check, um caminho futuro que gravasse toda edicao
  -- da vaga transformaria o rastro numa lista de "salvei o formulario".
  CONSTRAINT "ck_vaga_consultor_transferencias_houve_troca"
    CHECK ("de_consultor_id" IS DISTINCT FROM "para_consultor_id")
);--> statement-breakpoint

-- (vaga, quando): a linha do tempo da vaga, da mais antiga para a mais recente.
CREATE INDEX IF NOT EXISTS "idx_vaga_consultor_transferencias_vaga"
  ON "vaga_consultor_transferencias" ("vaga_id", "criado_em");--> statement-breakpoint

-- (consultor de destino, quando): a carteira que uma pessoa RECEBEU. E a pergunta que a
-- transferencia cria ("o que passou a ser meu, e quando?"), e sem o indice ela varre a tabela.
CREATE INDEX IF NOT EXISTS "idx_vaga_consultor_transferencias_para"
  ON "vaga_consultor_transferencias" ("para_consultor_id", "criado_em");
