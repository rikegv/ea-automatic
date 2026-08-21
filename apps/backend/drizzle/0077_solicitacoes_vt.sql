-- RASTRO DE QUEM PEDIU O VT. O time dispara um link para o funcionário preencher (ou refazer) o
-- formulário, e esta tabela responde "quem mandou este link, e quando?".
--
-- POR QUE ELA PRECISA EXISTIR: o gerador de link não gravava NADA. O controller recebia o usuário
-- autenticado e o descartava (`_user`, sem uso). Não havia como derivar o rastro de nenhum dado
-- existente, então sem tabela não há rastreabilidade, ponto.
--
-- POR QUE TABELA E NÃO COLUNA NA ADMISSÃO: a mesma pessoa é solicitada mais de uma vez ao longo do
-- tempo (mudou de endereço em março, mudou de linha em agosto). Uma coluna guardaria só a última e
-- apagaria justamente a sequência que explica por que existem N versões do formulário.
--
-- "RESPONDIDA" APONTA PARA UM FATO, não para um clique: guarda a VERSÃO do formulário que chegou
-- depois do pedido. Um booleano dependeria de alguém lembrar de marcar, e a primeira vez que
-- ninguém marcasse a fila passaria a mentir para sempre.
--
-- §A.6: nem CPF, nem nome, nem o TOKEN do link entram aqui. O vínculo é pela admissão, e o link é
-- credencial de acesso do candidato: não é persistido nem logado.
CREATE TABLE "solicitacoes_vt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"solicitado_por_id" uuid,
	"solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone,
	"respondida_por_formulario_id" uuid,
	"respondida_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solicitacoes_vt" ADD CONSTRAINT "solicitacoes_vt_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_vt" ADD CONSTRAINT "solicitacoes_vt_solicitado_por_id_usuarios_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_vt" ADD CONSTRAINT "solicitacoes_vt_respondida_por_formulario_id_formularios_vt_id_fk" FOREIGN KEY ("respondida_por_formulario_id") REFERENCES "public"."formularios_vt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_solicitacoes_vt_admissao" ON "solicitacoes_vt" USING btree ("admissao_id","solicitado_em");