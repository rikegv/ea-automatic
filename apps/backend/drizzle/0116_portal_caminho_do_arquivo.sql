-- PORTAL DO CANDIDATO: O CAMINHO DO ARQUIVO. Desenho aprovado em
-- `docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md` (as dez exigências) e
-- `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md` (Camada G e os vetos V10, V11, V12).
--
-- ARQUIVO ESCRITO À MÃO, no molde da 0112. O `drizzle-kit` não gera comentário nem `IF NOT EXISTS`,
-- e regenerar este SQL apaga as duas coisas.
--
-- NUMERAÇÃO: esta migration é a 0116 e NÃO a 0115. A 0113, a 0114 e a 0115 são de OUTRA sessão
-- trabalhando no mesmo repositório (ingestão do A&S), e a 0115 ainda não tinha entrada no
-- `_journal.json` quando esta foi escrita. Pular o número é deliberado: renumerar migration alheia
-- é o jeito mais rápido de duas frentes se apagarem em silêncio.
--
-- ┌─ §A.6 (LGPD): O QUE ESTAS TRÊS TABELAS GUARDAM ────────────────────────────────────────────────┐
-- │ NENHUMA delas guarda CPF, nome, data de nascimento, nome de arquivo original, token ou URL     │
-- │ assinada. O CPF vira hash com pepper; o IP completo existe em UMA tabela só, truncado aos 90   │
-- │ dias; no resto ele é hash com SAL MENSAL, para que a trilha não vire tabela de correlação      │
-- │ permanente por endereço.                                                                       │
-- │ O caminho do objeto É guardado, porque sem ele não há como consultar o metadado e confirmar a  │
-- │ chegada (veto V11). Ele é opaco por construção: o primeiro segmento é hash com pepper do id da │
-- │ admissão, nunca o id, porque o nome do objeto atravessa o log do Google, que é um terceiro.    │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘

-- ══ 1. A CREDENCIAL EMITIDA ═════════════════════════════════════════════════════════════════════
--
-- A LINHA NASCE NA EMISSÃO, E ESSA ORDEM É A EXIGÊNCIA 2 DO DESENHO, que é impeditiva. É contando
-- linha EMITIDA que os tetos do diretor (25 arquivos e 60 MB somados por link) alcançam quem pede
-- credencial e nunca envia. Contando só o que chegou, pedir seria ilimitado, e cada credencial já
-- é, na prática, uma chamada gratuita ao motor de IA que atende a esteira de admissão.
--
-- `bytes_concedidos` é o tamanho DECLARADO pelo candidato, e ele é o mesmo valor que vai assinado no
-- `x-goog-content-length-range`. Declarar pouco e subir muito o Google recusa sozinho, então a conta
-- do link e a realidade do bucket são a mesma coisa.
CREATE TABLE IF NOT EXISTS "portal_credenciais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti_link" varchar(64) NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"objeto" text NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"bytes_concedidos" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"confirmado_em" timestamp with time zone,
	"bytes_confirmados" integer,
	"extracoes" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	-- DEFESA EM PROFUNDIDADE: o teto POR ARQUIVO (10 MB) impossível de GRAVAR, por qualquer caminho.
	-- A régua da aplicação já recusa antes, e mesmo assim esta linha existe: régua de aplicação se
	-- burla com um `insert` novo que alguém escreva daqui a um ano sem ler o serviço, e um `CHECK`
	-- não se burla.
	--
	-- OS TETOS AGREGADOS (25 arquivos e 60 MB SOMADOS por link) NÃO estão aqui, e a ausência é
	-- deliberada: `CHECK` não conta linhas. Expressá-los exigiria uma segunda tabela somando o que
	-- esta já sabe, ou seja, um segundo lugar para estar errado, com a divergência aparecendo só no
	-- dia em que o número estivesse errado. Quem os torna invioláveis é a trava
	-- `pg_advisory_xact_lock` por `jti_link`, tomada na mesma transação que grava
	-- (`portal-credencial.service.ts`): ela vive no SERVIDOR, então serializa duas INSTÂNCIAS do
	-- backend, e não só duas requisições do mesmo processo.
	CONSTRAINT "ck_portal_credenciais_bytes" CHECK ("bytes_concedidos" > 0 AND "bytes_concedidos" <= 10485760),
	CONSTRAINT "ck_portal_credenciais_extracoes" CHECK ("extracoes" >= 0)
);--> statement-breakpoint
ALTER TABLE "portal_credenciais" ADD CONSTRAINT "portal_credenciais_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_credenciais" ADD CONSTRAINT "portal_credenciais_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- O UNIQUE no objeto é a trava de NÃO SOBRESCRITA do nosso lado. A do lado do Google é o
-- `x-goog-if-generation-match: 0`, que vai DENTRO da assinatura. Esta garante que nem por engano
-- duas credenciais apontem para o mesmo destino, o que faria a confirmação de uma validar o arquivo
-- da outra, que é o dano silencioso da §A.33 em outra roupa.
ALTER TABLE "portal_credenciais" ADD CONSTRAINT "uq_portal_credenciais_objeto" UNIQUE("objeto");--> statement-breakpoint

-- O índice que a contagem da emissão usa em TODO pedido do candidato. Sem ele, o teto do diretor
-- custaria uma varredura da tabela por clique.
CREATE INDEX IF NOT EXISTS "idx_portal_credenciais_link" ON "portal_credenciais" USING btree ("jti_link","criado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_credenciais_admissao" ON "portal_credenciais" USING btree ("admissao_id");--> statement-breakpoint

-- ══ 2. A TRILHA ═════════════════════════════════════════════════════════════════════════════════
--
-- ESTA É A PRIMEIRA TABELA DE LOG DE ACESSO DO EA. Até aqui a única trilha com valores era a
-- `candidato_alteracoes_log`, que é de EDIÇÃO e guarda valores de propósito. Esta é o oposto: nasce
-- proibida de guardar valor, e a proibição está em código (`portal/portal-eventos.ts`), que ABORTA a
-- gravação quando uma chave proibida aparece no jsonb.
--
-- NÃO HÁ CHECK NO `tipo`, e a ausência é decisão: o catálogo `PORTAL_*` vive em código, e exigir
-- migration para acrescentar evento faria do log que existe para registrar incidente o item mais
-- caro de estender, justo no dia do incidente.
--
-- NÃO HÁ COLUNA DE TEXTO LIVRE, e a ausência é a defesa: é no campo de observação que o dado pessoal
-- reaparece, porque quem opera escreve o nome da pessoa ali. Sem o campo, não há onde escrever.
CREATE TABLE IF NOT EXISTS "portal_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(40) NOT NULL,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"jti_link" varchar(64),
	"candidato_hash" varchar(32),
	"ip_hash" varchar(32),
	"ua_hash" varchar(32),
	"resultado" varchar(10),
	"motivo_codigo" varchar(40),
	"dados" jsonb,
	CONSTRAINT "ck_portal_eventos_resultado" CHECK ("resultado" IS NULL OR "resultado" IN ('OK','RECUSADO'))
);--> statement-breakpoint

-- Os três eixos que a Sala De Segurança consulta, mais a data pura, que é por onde a rotina de
-- retenção varre a janela vencida sem ler a tabela inteira.
CREATE INDEX IF NOT EXISTS "idx_portal_eventos_tipo" ON "portal_eventos" USING btree ("tipo","ocorrido_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_eventos_link" ON "portal_eventos" USING btree ("jti_link","ocorrido_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_eventos_candidato" ON "portal_eventos" USING btree ("candidato_hash","ocorrido_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_eventos_ocorrido_em" ON "portal_eventos" USING btree ("ocorrido_em");--> statement-breakpoint

-- ══ 3. O ÚNICO LUGAR COM O IP COMPLETO ══════════════════════════════════════════════════════════
--
-- TABELA SEPARADA, E A SEPARAÇÃO É A PROTEÇÃO: a trilha principal serve a quem investiga um caso, e
-- o endereço completo fica atrás de leitura de Master e Super Admin. Aos 90 dias o valor é TRUNCADO
-- NO LUGAR (IPv4 perde o último octeto, IPv6 fica nos 48 bits de rede) e `truncado_em` é carimbado,
-- então a linha sobrevive para a estatística e deixa de identificar o assinante.
--
-- ON DELETE CASCADE contra o evento: endereço sem o fato que o produziu é dado pessoal órfão, que é
-- exatamente o que a retenção mínima proíbe guardar.
CREATE TABLE IF NOT EXISTS "portal_eventos_ip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evento_id" uuid NOT NULL,
	"ip" varchar(45) NOT NULL,
	"truncado_em" timestamp with time zone,
	"ocorrido_em" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "portal_eventos_ip" ADD CONSTRAINT "portal_eventos_ip_evento_id_portal_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."portal_eventos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_eventos_ip" ADD CONSTRAINT "uq_portal_eventos_ip_evento" UNIQUE("evento_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portal_eventos_ip_ocorrido_em" ON "portal_eventos_ip" USING btree ("ocorrido_em");
--> statement-breakpoint

-- ══ 4. O TETO DE TENTATIVAS DO CANDIDATO ════════════════════════════════════════════════════════
--
-- ESTAS DUAS COISAS ENTRAM NESTA MIGRATION, E NÃO NUMA NOVA, porque a 0116 ainda NÃO foi aplicada em
-- produção (conferido: `portal_credenciais` não existe no banco). Enquanto isso for verdade,
-- acrescentar aqui custa zero; depois de aplicada, seria migration nova.
--
-- O PORQUÊ DO NÚMERO 3 vive em `src/domain/portal-tentativas.ts`, junto da regra, e não aqui: duas
-- tentativas resolvem o caso comum (foto cortada, página faltando) e a terceira é a margem. Quem
-- erra três vezes na MESMA pendência tem problema de documento, não de foto, e a partir daí quem
-- resolve é o time.

-- A coluna que QUEIMA a tentativa. Nula é o normal: aprovado, sem veredito ou sem regra ativa.
-- Ela carimba REPROVAÇÃO, nunca envio: credencial não usada e envio que morreu na rede continuam
-- nulos de propósito, senão o teto puniria quem está com internet ruim em vez de quem mandou o
-- documento errado.
ALTER TABLE "portal_credenciais" ADD COLUMN IF NOT EXISTS "reprovado_em" timestamp with time zone;--> statement-breakpoint

-- O índice da contagem de tentativas, feita em TODO pedido de credencial do candidato.
CREATE INDEX IF NOT EXISTS "idx_portal_credenciais_pendencia" ON "portal_credenciais" USING btree ("admissao_id","tipo_documento_id");--> statement-breakpoint

-- A pendência que esgotou as tentativas e virou trabalho do time: QUANTAS tentativas houve e QUANDO
-- caiu. Tabela própria, e não coluna em `documentos_admissao`, porque aquela é lida pela Auditoria,
-- pelo Gerenciador, pela Esteira e por todos os KPIs de pendência (§A.26), e um contador do Portal
-- não pode mudar o alcance de código validado.
--
-- ELA NÃO CRIA FILA NOVA. O documento do Portal já chega como AGUARDANDO_AUDITORIA e já é trabalho
-- do time no modal da aba Auditoria da Esteira. Esta linha registra desde quando o candidato parou
-- de tentar sozinho.
CREATE TABLE IF NOT EXISTS "portal_pendencias_no_time" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admissao_id" uuid NOT NULL,
	"tipo_documento_id" uuid NOT NULL,
	"tentativas" integer NOT NULL,
	"caiu_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_portal_pendencias_no_time_tentativas" CHECK ("tentativas" > 0)
);--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "portal_pendencias_no_time_admissao_id_admissoes_id_fk" FOREIGN KEY ("admissao_id") REFERENCES "public"."admissoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "portal_pendencias_no_time_tipo_documento_id_tipos_documento_id_fk" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipos_documento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- UMA linha por pendência: a gravação da queda é idempotente por cima deste unique, então
-- reprovação repetida depois da queda não cria linha nova nem reescreve a data da queda.
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "uq_portal_pendencias_no_time" UNIQUE("admissao_id","tipo_documento_id");
--> statement-breakpoint

-- ══ 5. A VOLTA: O TIME SOLICITA O REENVIO, E O MASTER ZERA O TETO ═══════════════════════════════
--
-- ESTAS COLUNAS ENTRAM NA MESMA 0116, E NÃO NUMA MIGRATION NOVA, pelo mesmo motivo da seção 4: a
-- 0116 ainda NÃO foi aplicada em produção (`portal_credenciais` não existe no banco), então mudar a
-- forma agora custa zero. Todos os comandos abaixo são IDEMPOTENTES assim mesmo, para que um
-- ambiente que já tenha rodado a versão anterior deste arquivo chegue ao mesmo formato.
--
-- O MECANISMO É UM MARCO, NÃO UM APAGADOR. A contagem de reprovações continua inteira em
-- `portal_credenciais.reprovado_em`; o que muda é que ela passa a contar só o que veio DEPOIS de
-- `liberado_em`. Apagar tentativa destruiria trilha; mover o marco zera o teto sem perder histórico.
--
-- A DIFERENÇA ENTRE OS DOIS CAMINHOS VIVE NO DADO, e não só no comentário: `SOLICITACAO_REENVIO` é
-- o TIME pedindo o documento de novo, fluxo normal do consultor; `DESTRAVAMENTO_MASTER` é exceção de
-- Master, e ela admite que a régua pode estar errada (§A.9: as 91 regras ativas não foram validadas
-- pelo RH).

-- A linha pode existir só para carregar a liberação de uma pendência que NUNCA caiu (o Master zera
-- duas reprovações antes da terceira). Carimbar uma queda que não houve seria mentira em tabela.
ALTER TABLE "portal_pendencias_no_time" ALTER COLUMN "caiu_em" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ALTER COLUMN "caiu_em" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "portal_pendencias_no_time" ADD COLUMN IF NOT EXISTS "liberado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD COLUMN IF NOT EXISTS "liberado_por_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD COLUMN IF NOT EXISTS "liberado_tipo" varchar(24);--> statement-breakpoint

ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "portal_pendencias_no_time_liberado_por_id_usuarios_id_fk";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "portal_pendencias_no_time_liberado_por_id_usuarios_id_fk" FOREIGN KEY ("liberado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- `>= 0`: a linha que nasce só para registrar um destravamento preventivo não carrega queda nenhuma.
ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "ck_portal_pendencias_no_time_tentativas";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_tentativas" CHECK ("tentativas" >= 0);--> statement-breakpoint

-- Enum fechado. Texto livre aqui viraria observação, e observação é por onde o nome da pessoa volta
-- para a tabela (§A.6).
ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "ck_portal_pendencias_no_time_liberado_tipo";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_liberado_tipo" CHECK ("liberado_tipo" IS NULL OR "liberado_tipo" IN ('SOLICITACAO_REENVIO','DESTRAVAMENTO_MASTER'));--> statement-breakpoint

-- Reabertura sem autor e sem data é rastro pela metade, e rastro pela metade não responde "quem
-- destravou". Os três andam juntos ou nenhum existe.
ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "ck_portal_pendencias_no_time_liberacao";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_liberacao" CHECK (("liberado_em" IS NULL AND "liberado_por_id" IS NULL AND "liberado_tipo" IS NULL) OR ("liberado_em" IS NOT NULL AND "liberado_por_id" IS NOT NULL AND "liberado_tipo" IS NOT NULL));
--> statement-breakpoint

-- Quantas vezes o TIME já reabriu a pendência. Reabertura sem limite devolve, em parcelas, o teto que
-- o Master deveria decidir, e o destravamento do Master viraria decorativo. O destravamento do Master
-- NÃO incrementa esta coluna: é dela que sai, limpo, o número de vezes que a régua precisou ser
-- desmentida por um humano (§A.9).
ALTER TABLE "portal_pendencias_no_time" ADD COLUMN IF NOT EXISTS "reaberturas_time" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" DROP CONSTRAINT IF EXISTS "ck_portal_pendencias_no_time_reaberturas";--> statement-breakpoint
ALTER TABLE "portal_pendencias_no_time" ADD CONSTRAINT "ck_portal_pendencias_no_time_reaberturas" CHECK ("reaberturas_time" >= 0);
