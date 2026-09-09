-- A&S, O RASTRO DA REDUÇÃO DE META: baixar a meta deixa de ser um gesto silencioso.
--
-- O ACHADO QUE OBRIGOU ESTA TABELA (auditoria de segurança, 09/09/2026). O gate de Master do
-- fechamento era CONTORNÁVEL SEM TOCAR NO GATE. `fechar()` recusa quando
-- `faltam = posicoes_oficiais - entregues > 0`, e só MASTER força, com trilha nas colunas
-- `fechamento_forcado_*` da 0098. Mas a META é editável por uma ROTA IRMÃ
-- (`PATCH /as/vagas/:id/posicoes`), que não tem guard de papel: o consultor COMUM baixava a meta até
-- o número já entregue, a subtração dava ZERO, e a vaga fechava pela porta NORMAL. Sem Master, sem
-- forçar, e com as três colunas da trilha do forçamento em BRANCO. A trava de excesso não pegava
-- porque ela só barra `entregues > meta` (estritamente maior), então IGUALAR passa.
--
-- A DECISÃO DO DIRETOR É RASTRO, E NÃO TRAVA. Baixar a meta CONTINUA sendo do consultor: a edição
-- foi liberada a ele em 25/08 e continua fazendo sentido operacional (o cliente desiste de duas das
-- cinco posições, e isso acontece toda semana). Nenhum `@Roles` novo nasce daqui. O que muda é que o
-- gesto deixa de ser invisível: fica registrado, com quem e quando, e a tela avisa ANTES de
-- confirmar. É controle por RESPONSABILIZAÇÃO, o mesmo padrão do aceite de dupla correção da INT-4
-- (§A.5) e da regra 8 da §A.3.
--
-- ┌─ POR QUE UMA TABELA, E NÃO COLUNAS NA VAGA COMO O FORÇAMENTO DA 0098 ──────────────────────┐
-- │ O FORÇAMENTO ACONTECE NO MÁXIMO UMA VEZ (a vaga só fecha uma vez), e por isso coube em três │
-- │ colunas. A META MUDA QUANTAS VEZES QUISEREM enquanto a vaga está aberta, e guardar só a      │
-- │ última contaria uma história FALSA: quem baixou de 5 para 3 e depois de 3 para 1 apareceria  │
-- │ como quem baixou de 3 para 1, e as quatro posições que sumiram viravam duas. Trilha que      │
-- │ apaga o próprio começo não é trilha. UMA LINHA POR REDUÇÃO.                                 │
-- └─────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- SÓ A REDUÇÃO É REGISTRADA, e o CHECK abaixo é quem garante isso no banco. AUMENTAR a meta não
-- contorna gate nenhum: ele AFASTA o fechamento em vez de aproximá-lo, e registrar aumento encheria
-- a trilha de ruído justamente no caso inofensivo, deixando a pergunta que ela existe para responder
-- ("esta vaga fechou porque entregou, ou porque encolheram a meta?") mais difícil, não mais fácil.
--
-- OS DOIS LADOS NA MESMA LINHA porque o GESTO É UM SÓ: a tela salva o par de contadores numa
-- requisição, e separar por lado inventaria dois eventos onde houve um. Redução de QUALQUER um dos
-- dois lados gera a linha, e a linha carrega os quatro números. Quem baixou só o banco fica com
-- `de_oficiais = para_oficiais`, e é assim que se lê "esta redução não mexeu no oficial".
--
-- `de_oficiais` É NULÁVEL, e o resto não é. A meta oficial da vaga (`vagas.posicoes_oficiais`) é
-- nulável porque o RASCUNHO pode não ter meta ainda, e o rascunho passa por esta rota (só a vaga
-- ENCERRADA é recusada). Nulo aqui quer dizer "não havia meta oficial antes", que é diferente de
-- zero; a leitura mostra os dois lados iguais, porque o lado oficial não foi reduzido. O banco
-- (`posicoes_banco`) é NOT NULL na vaga e é NOT NULL aqui, pela mesma razão: banco vazio é ZERO, e
-- não "não informado".
--
-- CASCADE NA VAGA e SET NULL NO AUTOR, e as duas escolhas têm motivo diferente. O rastro não
-- sobrevive à vaga (é rastro DELA, como o `vaga_beneficio`), mas sobrevive ao AUTOR: apagar um
-- usuário não pode FALHAR por causa de uma redução de meses atrás, e a trilha não pode sumir junto
-- com ele. Sem o autor, ela ainda diz QUANDO e DE QUANTO PARA QUANTO. É por isso que NÃO existe
-- check de "tudo ou nada" envolvendo `por_id`: ele faria o DELETE do usuário quebrar, exatamente
-- como a 0098 explica.
--
-- UM TIMESTAMP SÓ, e a 0097 tem dois pela razão que aqui não existe: lá o `ocorrido_em` foi separado
-- do `criado_em` porque a semente do backfill gravava passado. Aqui não há backfill nem existe como
-- haver: nenhuma redução antiga foi registrada em lugar nenhum, e as que aconteceram até hoje são
-- irrecuperáveis. O instante do evento É o instante da inserção.
--
-- §A.6: um id de vaga, um id de usuário INTERNO, uma data e quatro números. NENHUM dado de
-- candidato, nenhum CPF, nenhum nome de pessoa, nenhuma URL.
--
-- RISCO DE DADO: NULO. Tabela NOVA e vazia. Nenhuma linha existente é reescrita, nenhuma consulta
-- existente muda de resposta, e a vaga de hoje nasce com a lista vazia, que é o caso comum.
--
-- RE-EXECUTÁVEL, como a casa exige: `IF NOT EXISTS` na tabela e nos índices, e blocos `DO` nas
-- constraints, que não aceitam `IF NOT EXISTS` por sintaxe.

CREATE TABLE IF NOT EXISTS "vaga_meta_reducoes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "vaga_id" uuid NOT NULL,
  "de_oficiais" integer,
  "para_oficiais" integer NOT NULL,
  "de_banco" integer NOT NULL,
  "para_banco" integer NOT NULL,
  "por_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaga_meta_reducoes_vaga_id_vagas_id_fk') THEN
    ALTER TABLE "vaga_meta_reducoes" ADD CONSTRAINT "vaga_meta_reducoes_vaga_id_vagas_id_fk"
      FOREIGN KEY ("vaga_id") REFERENCES "public"."vagas"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaga_meta_reducoes_por_id_usuarios_id_fk') THEN
    ALTER TABLE "vaga_meta_reducoes" ADD CONSTRAINT "vaga_meta_reducoes_por_id_usuarios_id_fk"
      FOREIGN KEY ("por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- LINHA QUE NÃO É REDUÇÃO NÃO EXISTE, e o banco é quem garante: sem este check, um caminho futuro
-- que gravasse toda edição transformaria a trilha numa lista de "salvei o formulário", e a pergunta
-- que ela responde ficaria enterrada no ruído. Um dos dois lados TEM de ter descido.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vaga_meta_reducoes_houve_reducao') THEN
    ALTER TABLE "vaga_meta_reducoes" ADD CONSTRAINT "ck_vaga_meta_reducoes_houve_reducao"
      CHECK (
        ("de_oficiais" is not null and "para_oficiais" < "de_oficiais")
        or "para_banco" < "de_banco"
      );
  END IF;
END $$;--> statement-breakpoint

-- AS MESMAS BORDAS DA VAGA, repetidas aqui de propósito: a meta oficial é sempre maior que zero
-- (`ck_vagas_posicoes_oficiais`) e a de banco aceita zero (`ck_vagas_posicoes_banco`). Um rastro que
-- aceitasse números que a vaga recusa descreveria um estado que a vaga nunca teve.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vaga_meta_reducoes_numeros') THEN
    ALTER TABLE "vaga_meta_reducoes" ADD CONSTRAINT "ck_vaga_meta_reducoes_numeros"
      CHECK (
        ("de_oficiais" is null or "de_oficiais" > 0)
        and "para_oficiais" > 0
        and "de_banco" >= 0
        and "para_banco" >= 0
      );
  END IF;
END $$;--> statement-breakpoint

-- (vaga, quando): é EXATAMENTE a consulta da listagem, que lê o rastro de todas as vagas da página
-- de uma vez e monta cada lista da mais ANTIGA para a mais RECENTE. Índice comum e não parcial, ao
-- contrário do índice do forçamento: lá a coluna é nula em quase toda linha da tabela `vagas`, aqui
-- a tabela INTEIRA é só rastro, e não há nulo a evitar.
CREATE INDEX IF NOT EXISTS "idx_vaga_meta_reducoes_vaga"
  ON "vaga_meta_reducoes" ("vaga_id", "criado_em");
