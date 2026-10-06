-- PORTAL_ACESSO_CODIGOS + PORTAL_ACESSO_TRAVAS: a porta de e-mail do candidato.
--
-- Contrato NORMATIVO: `docs/CONTRATO-PORTAL-ACESSO-EMAIL.md` (v2), secao 4. A v1 foi VETADA.
-- ARQUIVO ESCRITO A MAO, no molde da 0119..0126: o `drizzle-kit` nao gera comentario nem
-- `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas (e arrastaria para dentro desta
-- migration o schema de outras sessoes em curso).
--
-- ══ O QUE ESTA PORTA E, E O QUE ELA NAO E ═══════════════════════════════════════════════════════
--
-- Ela NAO emite sessao e NAO abre o Portal. Ela prova a posse da CAIXA e, com isso, dispara o envio
-- do LINK para aquela mesma caixa. A chave de acesso continua sendo link + CPF + nascimento em
-- `POST portal/identificar`. Nenhuma coluna aqui concede acesso a nada.
--
-- ══ portal_acesso_codigos ══════════════════════════════════════════════════════════════════════
--
-- Uma linha por codigo emitido, e a linha NAO e apagada quando o codigo morre: `invalidado_em` e
-- `confirmado_em` sao carimbos. E isso que permite contar "quantos pedidos este endereco fez na
-- ultima hora" (3/hora e 10/dia) sem uma segunda tabela, e e isso que torna auditavel a regra de
-- que emitir um codigo novo INVALIDA o anterior.
--
-- O `id` E O BILHETE devolvido pela confirmacao: bilhete OPACO e REVOGAVEL, e nao um token
-- auto-suficiente (revogar um JWS exigiria uma lista de revogacao, que e justamente esta linha).
-- `gen_random_uuid()` usa gerador criptografico, entao sao 122 bits, e o valor so sai daqui DEPOIS
-- de o codigo certo ter sido digitado.
--
-- §A.6: NAO ha o codigo (so o HMAC-SHA256 dele, com segredo proprio que nao mora no banco), NAO ha
-- o e-mail (so o HMAC, que serve de balde e nunca de identidade), NAO ha CPF, nome nem nascimento.
-- O espaco do codigo e de UM MILHAO de valores, entao um `sha256` sem segredo seria o codigo em
-- claro com passos a mais: quem lesse um dump leria os codigos vivos.
--
-- FK `restrict`, NUNCA `cascade` (mesmo desvio que `as_retencao_eventos` documenta): apagar a
-- pessoa nao pode apagar o rastro das tentativas de acesso em nome dela.
CREATE TABLE IF NOT EXISTS "portal_acesso_codigos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "as_candidato_id" uuid NOT NULL,
  "email_hash" varchar(64) NOT NULL,
  "codigo_hash" varchar(64) NOT NULL,
  "expira_em" timestamp with time zone NOT NULL,
  "tentativas" integer DEFAULT 0 NOT NULL,
  "confirmado_em" timestamp with time zone,
  "invalidado_em" timestamp with time zone,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_acesso_codigos" ADD CONSTRAINT "portal_acesso_codigos_as_candidato_id_as_candidatos_id_fk"
    FOREIGN KEY ("as_candidato_id") REFERENCES "public"."as_candidatos"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_acesso_codigos_email" ON "portal_acesso_codigos" USING btree ("email_hash","criado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_acesso_codigos_candidato" ON "portal_acesso_codigos" USING btree ("as_candidato_id","criado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_acesso_codigos_expira" ON "portal_acesso_codigos" USING btree ("expira_em");--> statement-breakpoint
-- ══ portal_acesso_travas ═══════════════════════════════════════════════════════════════════════
--
-- A TRAVA E POR CANDIDATO DO FUNIL, E NAO POR CPF, e a razao e literal: o CPF pode ser justamente o
-- dado em disputa. Travar por CPF travaria a chave que ainda nao se sabe de quem e, e num caso
-- (`CPF_DE_OUTRO_CANDIDATO`) travaria a pessoa CERTA pelo gesto da errada.
--
-- `unique` no candidato: UMA trava por pessoa, e destravar move o carimbo da MESMA linha em vez de
-- empilhar. A insistencia mora em `tentativas`, que e o que a fila do time ordena.
--
-- ┌─ AS COLUNAS PROIBIDAS, NOMINALMENTE, E A AUSENCIA DELAS E A DEFESA (§A.6) ───────────────────┐
-- │ NAO existe `valor_informado`, `valor_esperado`, `campo_divergente`, `cpf`, `cpf_informado`,   │
-- │ `data_nascimento`, `nome`, `email`, `observacao`, `justificativa`, nem `jsonb` de payload.    │
-- │                                                                                               │
-- │ `observacao` E A MAIS PERIGOSA, e e por isso que ela e citada pelo nome: quem opera escreve o │
-- │ nome da pessoa no campo livre, e e assim que a PII volta para um rastro que nasceu limpo.      │
-- │ Sem o campo, nao ha onde escrever, e a regra deixa de depender de alguem se lembrar dela.      │
-- │                                                                                               │
-- │ `campo_divergente` NAO E DETALHE INOFENSIVO: grava-lo poria no banco, e depois na tela, a      │
-- │ resposta "o CPF esta errado e a data esta certa", que e o oraculo que a recusa neutra existe   │
-- │ para nao ser.                                                                                  │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- AS DUAS FKs SAO `restrict`: a pergunta "quem destravou esta pessoa" nao pode ser apagada pelo
-- gesto que apaga o candidato nem pelo que apaga o usuario. `set null` no autor faria a trilha
-- responder "alguem".
--
-- O CHECK DO MOTIVO acompanha `MOTIVOS_DA_TRAVA_DE_ACESSO` (`packages/shared-types`), a MESMA lista
-- que o schema Drizzle deriva. Codigo fora dela nao entra: e a recusa no banco que garante que a
-- fila do time nunca mostra um motivo sem rotulo.
CREATE TABLE IF NOT EXISTS "portal_acesso_travas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "as_candidato_id" uuid NOT NULL,
  "travado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "motivo_codigo" varchar(40) NOT NULL,
  "tentativas" integer DEFAULT 1 NOT NULL,
  "destravado_em" timestamp with time zone,
  "destravado_por_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_portal_acesso_travas_candidato" UNIQUE("as_candidato_id"),
  CONSTRAINT "ck_portal_acesso_travas_motivo" CHECK ("motivo_codigo" in ('DIVERGENCIA_CADASTRO', 'CPF_DE_OUTRO_CANDIDATO', 'EMAIL_AMBIGUO', 'TRAVA_ANTERIOR')),
  CONSTRAINT "ck_portal_acesso_travas_tentativas" CHECK ("tentativas" >= 0),
  -- DESTRAVE E TUDO OU NADA: carimbo sem autor responderia "destravou sozinho", e autor sem carimbo
  -- diria que alguem destravou sem dizer quando. A fila le `destravado_em` para saber se a linha
  -- ainda e trabalho; um dos dois nulo faria as duas leituras discordarem.
  CONSTRAINT "ck_portal_acesso_travas_destrave" CHECK (
    ("destravado_em" is null and "destravado_por_id" is null)
    or ("destravado_em" is not null and "destravado_por_id" is not null)
  )
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_acesso_travas" ADD CONSTRAINT "portal_acesso_travas_as_candidato_id_as_candidatos_id_fk"
    FOREIGN KEY ("as_candidato_id") REFERENCES "public"."as_candidatos"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "portal_acesso_travas" ADD CONSTRAINT "portal_acesso_travas_destravado_por_id_usuarios_id_fk"
    FOREIGN KEY ("destravado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_acesso_travas_abertas" ON "portal_acesso_travas" USING btree ("destravado_em","travado_em");
