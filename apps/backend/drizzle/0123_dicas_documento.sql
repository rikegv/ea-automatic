-- DICAS DE DOCUMENTO: como o documento precisa estar para passar na auditoria, POR TIPO.
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0116, 0119, 0120, 0121 e 0122: o `drizzle-kit` não gera
-- comentário nem `IF NOT EXISTS`, e regenerar este SQL apaga as duas coisas.
--
-- ══ UMA DICA POR TIPO, E O `unique` É A REGRA DE NEGÓCIO ═══════════════════════════════════════
--
-- "Um tipo, uma dica" (diretor). O `unique` em `tipo_documento_id` é essa frase escrita no banco:
-- sem ele, duas linhas para o mesmo tipo fariam a tela do candidato mostrar a dica que o `order by`
-- resolvesse, e a tela de cadastro editar a outra. Com ele, o CRUD é um upsert honesto.
--
-- ══ POR QUE NÃO É UMA COLUNA EM `tipos_documento` ══════════════════════════════════════════════
--
-- `tipos_documento` é catálogo VIVO (§A.3), lido por todo o sistema (régua, esteira, auditoria,
-- kit, portal) e o que ele carrega hoje é identidade: código, nome e o `ativo`. A dica é CONTEÚDO
-- editorial, com autoria, data e um `ativo` PRÓPRIO, que muda numa cadência completamente diferente
-- da do catálogo. Numa tabela à parte, quem lê o catálogo não carrega texto que não pediu, e o
-- histórico de quem escreveu o quê não se mistura com o de quem criou o tipo.
--
-- ══ O QUE ACONTECE QUANDO O TIPO É INATIVADO ══════════════════════════════════════════════════
--
-- NADA, e é deliberado. `ON DELETE CASCADE` não é a pergunta relevante aqui, porque tipo NUNCA é
-- apagado nesta casa (a rota DELETE do catálogo só faz `ativo = false`, §A.6): a dica SOBREVIVE à
-- inativação, inteira, e volta a valer sozinha se o tipo for reativado. Perder o texto que alguém
-- escreveu porque um tipo saiu das opções por um mês seria destruir trabalho sem ninguém mandar.
-- O CASCADE está declarado mesmo assim, para o caso da exclusão física que a casa não faz: dica
-- órfã apontando para tipo inexistente seria lixo invisível.
--
-- QUEM DECIDE SE O CANDIDATO VÊ É A LEITURA, não a existência da linha: a trilha só projeta a dica
-- quando ela está ativa E o tipo está ativo (`portal-documentos.service.ts`). Tipo fora do catálogo
-- não fala com o candidato.
--
-- ┌─ §A.6, E AQUI O RISCO É O INVERSO DO USUAL ─────────────────────────────────────────────────┐
-- │ Esta tabela NÃO guarda dado de candidato: nem CPF, nem nome, nem endereço, nem id de         │
-- │ admissão. O que ela guarda é texto de CONFIGURAÇÃO escrito pelo diretor, e o cuidado é de    │
-- │ outra natureza: esse texto é renderizado na tela PÚBLICA do portal. Por isso ele tem TETO DE │
-- │ TAMANHO no banco (`varchar(1000)`, e não `text` sem limite) e é sanitizado na escrita        │
-- │ (`DicasDocumentoService`), para não virar canal de marcação nem de dado interno vazado numa  │
-- │ tela que qualquer candidato com um link abre.                                                │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS "dicas_documento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tipo_documento_id" uuid NOT NULL,
  "texto" varchar(1000) NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_por_id" uuid,
  "atualizado_por_id" uuid,
  "criado_em" timestamp with time zone DEFAULT now() NOT NULL,
  "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "dicas_documento_tipo_documento_id_unique" UNIQUE("tipo_documento_id")
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "dicas_documento" ADD CONSTRAINT "dicas_documento_tipo_documento_id_tipos_documento_id_fk"
    FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "dicas_documento" ADD CONSTRAINT "dicas_documento_criado_por_id_usuarios_id_fk"
    FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "dicas_documento" ADD CONSTRAINT "dicas_documento_atualizado_por_id_usuarios_id_fk"
    FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
