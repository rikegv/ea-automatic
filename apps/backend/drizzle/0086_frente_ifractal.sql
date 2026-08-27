-- FRENTE IFRACTAL (5ª frente da Esteira) + tipo de marcação do cliente.
--
-- NUMERAÇÃO 0086, e não 0083, DE PROPÓSITO: as migrations 0083 a 0085 estão sendo escritas pela
-- frente de A&S na worktree de homologação e ainda não subiram. Pular a faixa evita colisão de
-- arquivo quando as duas linhas se encontrarem.
--
-- A ARMADILHA DO POSTGRES, que a 0059 já tinha enfrentado ao acrescentar a INTEGRACAO:
-- `ALTER TYPE ... ADD VALUE` acrescenta o valor, mas ele NÃO PODE SER USADO na mesma transação em
-- que foi criado. Por isso esta migration só declara o valor e cria a estrutura; as linhas de
-- `frente_status_catalogo` com tipo = 'IFRACTAL' são gravadas DEPOIS, fora daqui, pelo convergedor
-- de boot (`IfractalStatusService`). Inserir aqui erraria com "unsafe use of new value of enum type".

CREATE TYPE "public"."tipo_marcacao" AS ENUM('CARTAO', 'BIOMETRIA', 'RECONHECIMENTO_FACIAL', 'APLICATIVO');--> statement-breakpoint

-- NOT NULL COM DEFAULT: todo cliente marca ponto de alguma forma, então não existe "sem resposta".
-- O default preenche os clientes já cadastrados na própria migration, sem backfill à parte.
ALTER TABLE "clientes" ADD COLUMN "tipo_marcacao" "tipo_marcacao" DEFAULT 'APLICATIVO' NOT NULL;--> statement-breakpoint

ALTER TYPE "public"."frente_tipo" ADD VALUE 'IFRACTAL';--> statement-breakpoint

-- Credencial do iFractal por admissão. Espelha `exame_agendamento` e `integracao_agendamento`:
-- uma linha por admissão, criada quando o consultor preenche.
CREATE TABLE "admissao_ifractal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"login" varchar(120),
	"senha" varchar(120),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admissao_ifractal_admissao_id_unique" UNIQUE("admissao_id")
);
--> statement-breakpoint
ALTER TABLE "admissao_ifractal" ADD CONSTRAINT "admissao_ifractal_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;
