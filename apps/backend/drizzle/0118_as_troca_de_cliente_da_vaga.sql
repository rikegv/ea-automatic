-- O RASTRO DA TROCA DE CLIENTE FEITA PELO MASTER NA CORREÇÃO DA LIBERAÇÃO (achado V1 do `seguranca`).
--
-- ┌─ O DEFEITO QUE ESTA TABELA FECHA ──────────────────────────────────────────────────────────────┐
-- │ `corrigirLiberacaoDaRevisao` gravava o `cod_cliente` novo na vaga e só escrevia trilha quando a │
-- │ vaga TAMBÉM voltava para a fila de revisão. Quem corrigia SÓ o cliente não deixava registro     │
-- │ nenhum: nem autor, nem data, nem valor anterior. E a trilha não ficava silenciosa, ficava       │
-- │ ERRADA: a liberação já gravou "Liberada da revisão com o cliente A", e essa continuava sendo a  │
-- │ única afirmação consultável depois de a vaga passar a ser do cliente B. Trocar o cliente de uma │
-- │ vaga redefine sob qual controlador ficam as candidaturas penduradas nela (§A.6).                │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE UMA TABELA, E NÃO UMA LINHA EM `as_vaga_status_eventos` ──────────────────────────────┐
-- │ Aquela tabela é a linha do tempo do MOVIMENTO DE STATUS, e esta correção não move status: um   │
-- │ evento "ABERTA para ABERTA" inventaria um passo que não aconteceu. E não é só desenho, MUDA A  │
-- │ RESPOSTA DE UM LEITOR: o apagar do catálogo (`vaga-status.service.remover`) conta eventos com  │
-- │ `de = codigo or para = codigo` para escolher entre APAGAR e INATIVAR uma linha do catálogo.    │
-- │ Vaga entra em status sem gerar evento (a trilha de abertura grava o status direto), então uma  │
-- │ correção de CADASTRO passaria a virar "há vagas que já passaram por ele" sem passagem nenhuma. │
-- │ O molde é o de `vaga_meta_reducoes` (0099): rastro de um gesto que a linha da vaga não conta.  │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- SEM FK PARA `clientes`, COMO NA 0117: `restrict` faria o rastro impedir a administração do
-- cadastro de clientes, e `set null`/`cascade` trocaria a memória da troca por um buraco silencioso.
-- Quem escreve confere o código contra o cadastro ANTES de gravar (`exigirClienteExistente`).
--
-- §A.6: um id de vaga, dois CÓDIGOS de cliente, um id de usuário INTERNO e uma data. Nenhum dado de
-- candidato, nenhum CPF, nenhuma URL, nenhum texto livre vindo de fora.
--
-- RISCO DE DADO: NULO. Tabela NOVA e vazia. Nenhuma linha existente é reescrita e nenhuma consulta
-- existente muda de resposta.
--
-- RE-EXECUTÁVEL: `IF NOT EXISTS` na tabela e no índice, e blocos `DO` nas constraints, que não
-- aceitam `IF NOT EXISTS` por sintaxe. Rodar duas vezes deixa o banco no mesmo estado.

CREATE TABLE IF NOT EXISTS "vaga_cliente_correcoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  "de_cod_cliente" varchar(40),
  "para_cod_cliente" varchar(40) NOT NULL,
  "por_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaga_cliente_correcoes_vaga_id_vagas_id_fk') THEN
    ALTER TABLE "vaga_cliente_correcoes" ADD CONSTRAINT "vaga_cliente_correcoes_vaga_id_vagas_id_fk"
      FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaga_cliente_correcoes_por_id_usuarios_id_fk') THEN
    ALTER TABLE "vaga_cliente_correcoes" ADD CONSTRAINT "vaga_cliente_correcoes_por_id_usuarios_id_fk"
      FOREIGN KEY ("por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- LINHA QUE NÃO É TROCA NÃO EXISTE. Sem este check, um caminho futuro que gravasse toda correção
-- transformaria o rastro numa lista de "salvei o formulário", e a pergunta que ele responde ficaria
-- enterrada no ruído. É o mesmo desenho de `ck_vaga_meta_reducoes_houve_reducao`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vaga_cliente_correcoes_houve_troca') THEN
    ALTER TABLE "vaga_cliente_correcoes" ADD CONSTRAINT "ck_vaga_cliente_correcoes_houve_troca"
      CHECK ("de_cod_cliente" is distinct from "para_cod_cliente");
  END IF;
END $$;--> statement-breakpoint

-- (vaga, quando): a leitura é sempre "a troca de cliente DESTA vaga, da mais antiga para a mais
-- recente". Índice comum e não parcial: a tabela INTEIRA é rastro, não há nulo a evitar.
CREATE INDEX IF NOT EXISTS "idx_vaga_cliente_correcoes_vaga"
  ON "vaga_cliente_correcoes" ("vaga_id", "criado_em");
