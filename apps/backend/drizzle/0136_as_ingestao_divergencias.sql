-- A FILA DE DIVERGENCIAS DA INGESTAO (OST de precedencia, 30/09/2026).
--
-- ┌─ O DEFEITO QUE ESTA TABELA EXISTE PARA MATAR, medido e provado em 30/09/2026 ────────────────┐
-- │ O `update` da candidatura da varredura do Pandape era                                        │
-- │   `set etapa = ..., situacao = ..., motivo_descarte = ...`                                   │
-- │   `where id = ... and (atuais) is distinct from (novos)`                                     │
-- │ e aquele `is distinct from` NAO ERA PROTECAO, ERA O GATILHO: ele existia so para nao empurrar │
-- │ `atualizado_em` numa reentrega identica, e comparava VALOR com VALOR, nunca AUTOR com AUTOR.  │
-- │ Nao ha coluna de autor nem carimbo de procedencia em `as_candidaturas` (14 colunas, nenhuma). │
-- │ O time avancava a pessoa tres etapas, ninguem tocava no ATS, e em ate 30 minutos ela VOLTAVA, │
-- │ em loop, em 24 das 27 pastas mapeadas no de/para.                                            │
-- │                                                                                              │
-- │ E ERA SILENCIOSO: a ingestao nao escreve em `as_candidatura_etapas` (ela esta fora da lista   │
-- │ fail-closed de tabelas do adaptador), entao o evento humano continuava na trilha dizendo "foi │
-- │ para Entrevista Cliente" enquanto a coluna dizia CAPTACAO, e NENHUMA TELA comparava as duas.  │
-- │ Quem operou concluia que o proprio clique nao funcionou.                                     │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- A REGUA, decidida pelo diretor: O EA VENCE, SEMPRE. O valor do ATS nao e aplicado sobre trabalho
-- humano, e a diferenca vira UMA LINHA AQUI, para o time olhar e decidir. O motivo de o EA vencer no
-- empate nao e hierarquia, e CUSTO ASSIMETRICO DO ERRO: se o EA vence errado, o time perde uma
-- informacao e resolve num clique; se o ATS vence errado, o trabalho do time e apagado em silencio e
-- ninguem descobre. Abster-se e o comportamento seguro, mesma logica da §A.33.
--
-- MOLDE `as_ingestao_conflitos` (migration 0109), que e o padrao da casa para "o ciclo nao decide
-- sozinho, vira linha de revisao": id, o alvo, o `resolvido_em` nulavel e os dois carimbos.
--
-- ┌─ §A.6: POR QUE `valor_ea` E `valor_ats` PODEM FICAR EM CLARO ────────────────────────────────┐
-- │ A lista de campos cobertos e FECHADA pelo CHECK abaixo, e os SETE sao codigo, rotulo de vaga  │
-- │ ou numero: codigo de etapa, codigo de situacao, codigo da vaga, nome de divulgacao da vaga,   │
-- │ id de cidade, numero de posicoes e codigo da vaga do candidato. NAO HA nome, CPF, e-mail,     │
-- │ telefone nem nascimento, e e isso que torna a tela util (o time compara os dois lados sem     │
-- │ abrir a ficha).                                                                              │
-- │                                                                                              │
-- │ A varredura TAMBEM reescreve os campos PESSOAIS de `as_candidatos`, e eles NAO entram nesta   │
-- │ tabela: nao estao na ordem do diretor (§A.14/§A.31), e guardar o valor deles aqui criaria PII │
-- │ numa superficie nova, fora do alcance de `aplicarRetencao`. Fica como PROPOSTA, e o CHECK e o │
-- │ que impede a proxima frente de acrescenta-los sem ninguem ler este paragrafo.                 │
-- │                                                                                              │
-- │ O ALVO E POR ID, e o nome da pessoa nunca e copiado para ca: a tela o le por JOIN em          │
-- │ `as_candidatos`, entao o expurgo que anonimiza a ficha ja apaga o nome que a fila mostra, sem │
-- │ precisar voltar a esta tabela.                                                               │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ `motivo_descarte` NAO ESTA NO CHECK, E A AUSENCIA E UM VETO (`seguranca`, 30/09/2026) ───────┐
-- │ A PRIMEIRA VERSAO DESTE ARQUIVO O INCLUIA, com a justificativa de que ele era "nome do         │
-- │ catalogo interno, nao texto de pessoa". AQUELA FRASE ESTAVA ERRADA, e a casa ja havia medido o │
-- │ contrario em dois lugares:                                                                     │
-- │   . `candidatos.dto.ts` registra que o campo tem DUAS NATUREZAS: so no `DESCARTADO` ele e nome │
-- │     do catalogo `motivos_descarte` (0129); no `ENVIADO_PARA_ADMISSAO` ele continua PROSA, com  │
-- │     teto de 500 caracteres;                                                                    │
-- │   . `retencao-candidatos.service.ts` faz `set motivo_descarte = null` no expurgo, na MESMA CTE │
-- │     que substitui o resumo de contato, com a narrativa "texto livre pelo mesmo motivo e com a  │
-- │     mesma exposicao". A casa JA classificou aquele campo como DADO PESSOAL.                     │
-- │                                                                                              │
-- │ E ESTA TABELA SERIA SUPERFICIE FORA DO ALCANCE DO EXPURGO. Ele ANONIMIZA a pessoa sem DELETAR │
-- │ a candidatura, entao o `on delete cascade` daqui NUNCA dispararia: o EA nularia a frase na     │
-- │ candidatura e a manteria, em claro e para sempre, na linha de fila. O argumento "o nome vem    │
-- │ por JOIN, o expurgo alcanca" nao cobre este caso, porque aqui seria COPIA, nao JOIN.           │
-- │                                                                                              │
-- │ A TRAVA DO CAMPO CONTINUA INTEIRA: o ATS nunca o escreve em candidatura existente              │
-- │ (`CAMPOS_PROTEGIDOS_DA_CANDIDATURA`, em `domain/as-precedencia-ingestao.ts`). O que saiu foi a │
-- │ LINHA DE FILA, ou seja a divergencia dele e SILENCIOSA: o EA vence e ninguem e avisado. Para o │
-- │ valor voltar a tela, a coluna precisa primeiro entrar na rotina de expurgo, e isso e decisao   │
-- │ do diretor (§A.31).                                                                            │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- RISCO DE DADO: NULO. Uma tabela NOVA, dois indices unicos NOVOS e dois indices comuns NOVOS.
-- NENHUMA coluna existente e alterada, NENHUMA linha e reescrita e NENHUMA consulta existente muda
-- de resposta. `as_candidaturas` tem ZERO linha hoje e a varredura esta inerte, entao esta tabela
-- nasce vazia e so ganha volume quando o FILTRO DE ENTRADA for ligado.
--
-- RE-EXECUTAVEL, como a casa exige: `IF NOT EXISTS` na tabela e nos indices, e `ADD CONSTRAINT`
-- dentro de bloco `DO $$` com `duplicate_object` (a sintaxe de constraint nao aceita IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "as_ingestao_divergencias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- CANDIDATURA ou VAGA. E o que a tela usa para saber onde a diferenca mora e qual caminho humano
  -- aplica o valor do ATS quando o time escolhe adotar.
  "escopo" varchar(20) NOT NULL,
  "campo" varchar(40) NOT NULL,
  -- O ALVO. `cascade` nos dois, e a direcao e deliberada: divergencia e uma PERGUNTA SOBRE o alvo, e
  -- sem o alvo ela nao tem resposta possivel nem caminho humano de adocao. `restrict` aqui travaria a
  -- exclusao da vaga (que e operacao real, e cujo `cascade` ja leva a matricula da varredura junto) e
  -- deixaria linha de fila que ninguem consegue resolver nem fechar.
  "candidatura_id" uuid REFERENCES "as_candidaturas"("id") ON DELETE CASCADE,
  "vaga_id" uuid REFERENCES "vagas"("id") ON DELETE CASCADE,
  "valor_ea" text,
  "valor_ats" text,
  -- QUANTAS VOLTAS JA TROUXERAM A MESMA DIVERGENCIA. Ver o bloco da idempotencia, abaixo.
  "ocorrencias" integer DEFAULT 1 NOT NULL,
  "primeira_em" timestamp with time zone DEFAULT now() NOT NULL,
  "ultima_em" timestamp with time zone DEFAULT now() NOT NULL,
  -- Nulo e "ainda na fila". Preenchido quando um humano decidiu.
  "resolvido_em" timestamp with time zone,
  "resolvido_por_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
  "decisao" varchar(20),
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ┌─ O VOCABULARIO E FECHADO NO BANCO, E NAO SO NO TYPESCRIPT ───────────────────────────────────┐
-- │ As tres listas vivem em `packages/shared-types` (`ESCOPOS_DE_DIVERGENCIA`,                    │
-- │ `CAMPOS_DE_DIVERGENCIA`, `DECISOES_DE_DIVERGENCIA`) e sao repetidas aqui de proposito, pelo   │
-- │ mesmo argumento de `ck_as_ingestao_conflitos_fonte`: o CHECK e a ultima fechadura para quem    │
-- │ escrever por fora da aplicacao, e o campo e o que governa a §A.6 desta tabela. Campo novo      │
-- │ exige vir AQUI, que e o ponto em que alguem le por que a lista e fechada.                     │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_escopo') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_escopo"
      CHECK ("escopo" IN ('CANDIDATURA', 'VAGA'));
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_campo') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_campo"
      -- SETE VALORES, e `motivo_descarte` NAO esta entre eles: ver o bloco do veto no cabecalho.
      CHECK ("campo" IN (
        'etapa', 'situacao',
        'vaga_codigo', 'vaga_nome_divulgacao', 'vaga_cidade', 'vaga_posicoes_oficiais',
        'vaga_do_candidato'
      ));
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_decisao') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_decisao"
      CHECK ("decisao" IS NULL OR "decisao" IN ('MANTIDO_EA', 'ADOTADO_ATS'));
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ┌─ RESOLVIDO E DECIDIDO SAO A MESMA COISA, E O BANCO EXIGE OS DOIS JUNTOS ─────────────────────┐
-- │ Linha fechada sem decisao nao diz NADA (o time olhou e o que concluiu?), e decisao gravada    │
-- │ com `resolvido_em` nulo sai da fila pela tela e continua dentro do indice de idempotencia, o  │
-- │ que faria a proxima volta INCREMENTAR uma linha que alguem ja resolveu. Os dois estados        │
-- │ intermediarios sao bugs, e nenhum deles e alcancavel com este CHECK de pe.                    │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_resolucao') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_resolucao"
      CHECK (("resolvido_em" IS NULL) = ("decisao" IS NULL));
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ┌─ O ALVO EXISTE, E O ESCOPO DIZ QUAL DELES ───────────────────────────────────────────────────┐
-- │ Escopo CANDIDATURA guarda as DUAS colunas (a candidatura e a vaga dela), e escopo VAGA guarda │
-- │ SO a vaga. Isso nao e arrumacao: e o que faz os indices de idempotencia logo abaixo nao terem │
-- │ NULO em coluna de chave. Em Postgres, NULO nao e igual a NULO num indice unico, entao uma      │
-- │ chave com nulo NUNCA colide, e a reincidencia criaria linha nova em toda volta, que e          │
-- │ exatamente o defeito que a idempotencia existe para matar.                                    │
-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_alvo') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_alvo"
      CHECK (
        ("escopo" = 'CANDIDATURA' AND "candidatura_id" IS NOT NULL AND "vaga_id" IS NOT NULL)
        OR
        ("escopo" = 'VAGA' AND "candidatura_id" IS NULL AND "vaga_id" IS NOT NULL)
      );
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_as_ingestao_divergencias_ocorrencias') THEN
    ALTER TABLE "as_ingestao_divergencias"
      ADD CONSTRAINT "ck_as_ingestao_divergencias_ocorrencias"
      CHECK ("ocorrencias" > 0);
  END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

-- ┌─ A IDEMPOTENCIA, E SEM ELA A FILA DEIXA DE SER FILA ────────────────────────────────────────┐
-- │ A varredura roda de 30 em 30 minutos, ou seja ATE 48 VOLTAS POR DIA. Sem unique, a MESMA      │
-- │ divergencia (a mesma pessoa, a mesma etapa, o mesmo par de valores) viraria 48 linhas por dia │
-- │ e a tela de trabalho viraria log: ninguem resolve uma fila que cresce sozinha.                │
-- │                                                                                              │
-- │ A REINCIDENCIA INCREMENTA `ocorrencias` E ATUALIZA `ultima_em`, e o `ON CONFLICT` do servico  │
-- │ se apoia NESTES indices. Eles sao PARCIAIS em `resolvido_em IS NULL` de proposito: resolvida a │
-- │ linha, ela SAI do indice, e uma divergencia que volte a acontecer depois abre linha NOVA, que  │
-- │ e o certo (e um fato novo, posterior a decisao, e o historico da decisao antiga fica intacto). │
-- │                                                                                              │
-- │ SAO DOIS INDICES E NAO UM, e a razao e o NULO: escopo VAGA nao tem candidatura, e um indice    │
-- │ unico sobre a coluna nulavel nunca colidiria (ver o CHECK do alvo, acima). Cada indice cobre   │
-- │ a populacao em que TODAS as suas colunas de chave sao NOT NULL, garantido pelo mesmo CHECK.    │
-- └─────────────────────────────────────────────────────────────────────────────────────────────┘
CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_ingestao_divergencias_candidatura_aberta"
  ON "as_ingestao_divergencias" ("escopo", "candidatura_id", "vaga_id", "campo")
  WHERE "resolvido_em" IS NULL AND "candidatura_id" IS NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_as_ingestao_divergencias_vaga_aberta"
  ON "as_ingestao_divergencias" ("escopo", "vaga_id", "campo")
  WHERE "resolvido_em" IS NULL AND "candidatura_id" IS NULL;--> statement-breakpoint

-- O RECORTE DE LEITURA DA TELA e sempre "as abertas, da mais recente para a mais antiga", e os
-- filtros da fila sao por escopo e por campo. Indice comum: a tabela nasce vazia e nao ha nulo a
-- evitar nas duas colunas.
CREATE INDEX IF NOT EXISTS "idx_as_ingestao_divergencias_fila"
  ON "as_ingestao_divergencias" ("resolvido_em", "ultima_em");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_as_ingestao_divergencias_alvo"
  ON "as_ingestao_divergencias" ("candidatura_id", "vaga_id");
