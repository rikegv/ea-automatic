-- DE/PARA DE CLIENTE DA VAGA (planilha viva do time) + A PROPOSTA INERTE NA VAGA.
--
-- Desenho em `scratchpad/MAPA-FRENTE-DEPARA-CLIENTE.md`, com a EMENDA do coordenador depois do veto
-- da auditoria, que é o desenho que vale.
--
-- ┌─ A COISA MAIS IMPORTANTE DESTE ARQUIVO É O QUE ELE **NÃO** FAZ ────────────────────────────────┐
-- │ ELE NÃO ENCOSTA EM `vagas.cod_cliente`. Nenhuma coluna aqui alimenta aquela, nenhum trigger,   │
-- │ nenhum default, nenhum backfill. A auditoria do mapa VETOU o desenho que escrevia a coluna, e   │
-- │ a medição que sustenta o veto é esta: `candidatos.service.ts` lê `vagas.cod_cliente` com        │
-- │ `innerJoin` e SEM FILTRO DE STATUS, e o valor desce para `cod_cliente` da pré-admissão          │
-- │ (`ingestao-ponte-admissao.ts`). De lá ele decide a RÉGUA DOCUMENTAL `(cod_cliente + cargo)` e o │
-- │ NOME DA PASTA do prontuário no Drive. Cliente errado é CONTROLADOR errado para os dados         │
-- │ daquela pessoa (§A.6), e arquivamento no Drive não se desfaz (§A.33).                            │
-- │                                                                                                │
-- │ Então a planilha produz PROPOSTA, e proposta NÃO DECIDE NADA: quem escreve `cod_cliente`        │
-- │ continua sendo o caminho humano que já tem trilha, a liberação da vaga, com autor e data.       │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada de pessoal entra aqui. Código de vaga de terceiro, razão social de empresa, código de
-- cliente do catálogo, id de usuário interno e dois carimbos. Nenhum CPF, nenhum salário, nenhum
-- nome de candidato, nenhuma URL. As outras 61 colunas da planilha NÃO são copiadas para cá, e isso
-- é requisito e não economia: cópia de dado pessoal fora do alcance do expurgo é o defeito.

-- ══ 1. O CATÁLOGO DO DE/PARA ═══════════════════════════════════════════════════════════════════
--
-- UMA LINHA POR CÓDIGO DA PLANILHA. A planilha tem 3.532 linhas úteis para cerca de 470 vagas
-- (medido): a linha de lá é por CANDIDATO, e o código repete. Quem desdobra isso em uma linha por
-- código, detectando contradição em vez de deixar a última vencer, é `montarMapaDePara`
-- (`domain/as-depara-cliente-vaga.ts`), e é por isso que o unique abaixo pode existir.
--
-- ┌─ `cod_cliente` NÃO TEM FK, E A AUSÊNCIA É DELIBERADA (bloqueio 5 da auditoria) ───────────────┐
-- │ `vagas.cod_cliente` TEM FK para `clientes` (0082). Um código que a curadoria conheceu e o      │
-- │ catálogo não tem MAIS (cliente inativado, código recadastrado) derrubaria a sincronização da   │
-- │ planilha, e uma FK `restrict` aqui ainda transformaria "apagar um cliente" em erro de banco     │
-- │ num catálogo de tradução. O fail-closed desta frente é NULO MAIS CONTAGEM, nunca exceção.       │
-- │                                                                                                │
-- │ O QUE PROTEGE NO LUGAR DA FK, e protege em dois lugares: a sincronização confere o código       │
-- │ contra `clientes` ANTES de gravar, e a resolução confere DE NOVO na leitura (`left join         │
-- │ clientes`), então código órfão degrada para proposta SÓ COM NOME. E se alguém confirmar na tela │
-- │ um código que o catálogo não tem, quem recusa é a FK de `vagas.cod_cliente`, na cara de quem    │
-- │ clicou, que é o lugar certo para recusar.                                                       │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS "as_depara_cliente_vaga" (
	"id" serial PRIMARY KEY NOT NULL,
	-- A PROCEDÊNCIA da tradução, em lista fechada. Hoje há uma fonte só, e a coluna existe pela
	-- mesma razão da `fonte` do de/para de etapa: a segunda fonte não deve virar uma segunda tabela.
	"fonte" varchar(20) NOT NULL,
	-- O "Código da vaga" da planilha, JÁ NORMALIZADO (só dígitos, sem o espaço à frente que foi
	-- medido em `' 1587726'`). O que não é chave não chega aqui: `SL...` é código INTERNO do EA e é
	-- recusado com motivo próprio, e texto livre é recusado como malformado. Quem decide é
	-- `classificarCodigoDaPlanilha`, com teste puro.
	"codigo_externo" varchar(40) NOT NULL,
	-- O nome do cliente COMO A PLANILHA O ESCREVE. É ele que faz a pessoa reconhecer a linha, e é a
	-- parte caríssima do trabalho: descobrir QUAL cliente é. 59 dos 95 nomes medidos não existem no
	-- catálogo da Admissão (as 11 variantes de Gerdau, nenhuma cadastrada).
	"nome_cliente" varchar(200) NOT NULL,
	-- O código do catálogo. NULO é o estado normal de 59 dos 95 nomes, e não é lacuna de ninguém.
	"cod_cliente" varchar(40),
	-- O GRAU do palpite da curadoria (EXATO, PREFIXO, AMBIGUO, SEM_PALPITE), para quem confere 95
	-- linhas saber onde olhar com cuidado. Exato é conferência de um segundo; prefixo é onde o erro
	-- humano de confirmação vai acontecer.
	"casamento" varchar(20),
	-- ┌─ PROPOSTA NÃO CONFIRMADA NÃO RESOLVE NADA, e é por isso que a confirmação tem AUTOR E DATA ─┐
	-- │ Um booleano `confirmado` responderia "foi confirmado?" e não responderia "por quem", que é   │
	-- │ a única pergunta que importa no dia em que uma linha estiver errada. Molde do `adotarAts`:   │
	-- │ autor da SESSÃO, nunca do corpo.                                                             │
	-- │                                                                                              │
	-- │ CARIMBO NULO É O NASCIMENTO DE TODA LINHA: a fábrica PROPÕE (§A.31) e o time CONFIRMA. Sem   │
	-- │ carimbo, a resolução entrega o NOME e NÃO entrega o código, mesmo havendo palpite gravado.   │
	-- └──────────────────────────────────────────────────────────────────────────────────────────────┘
	"confirmado_em" timestamp with time zone,
	"confirmado_por_id" uuid,
	-- DESLIGAR É O GESTO DO DIRETOR para dizer "pare de confiar nesta tradução", e ele precisa
	-- existir sem apagar a linha: apagada, a próxima sincronização a recria com o palpite da
	-- fábrica, e a decisão de desligar seria desfeita de 30 em 30 minutos. Lido com `ativo = true`
	-- em DUAS fechaduras, como o de/para de etapa.
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_as_depara_cliente_vaga_fonte_codigo" UNIQUE("fonte","codigo_externo"),
	CONSTRAINT "ck_as_depara_cliente_vaga_fonte" CHECK ("fonte" IN ('PLANILHA_A_S')),
	CONSTRAINT "ck_as_depara_cliente_vaga_casamento" CHECK ("casamento" IS NULL OR "casamento" IN ('EXATO','PREFIXO','AMBIGUO','SEM_PALPITE')),
	-- CONFIRMAR SEM CÓDIGO NÃO É CONFIRMAR NADA: a confirmação é sobre o vínculo, e um carimbo sem
	-- vínculo faria a leitura entregar "confirmado" com código nulo, que é indistinguível de
	-- palpite nenhum e some da tela como se tivesse sido resolvido.
	CONSTRAINT "ck_as_depara_cliente_vaga_confirmacao" CHECK (
		("confirmado_em" IS NULL AND "confirmado_por_id" IS NULL)
		OR ("confirmado_em" IS NOT NULL AND "cod_cliente" IS NOT NULL)
	)
);--> statement-breakpoint
-- `set null` NO AUTOR: a linha de tradução sobrevive à desativação de quem a confirmou, e o que se
-- perde é só o nome de quem foi, nunca o vínculo. Mesma escolha de `vagas.consultor_id`.
ALTER TABLE "as_depara_cliente_vaga" ADD CONSTRAINT "as_depara_cliente_vaga_confirmado_por_id_usuarios_id_fk" FOREIGN KEY ("confirmado_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- A PERGUNTA DA TELA DE CURADORIA é "o que falta confirmar", e ela varre por confirmação ausente.
CREATE INDEX IF NOT EXISTS "idx_as_depara_cliente_vaga_pendentes" ON "as_depara_cliente_vaga" ("confirmado_em") WHERE "ativo";--> statement-breakpoint

-- ══ 2. A PROPOSTA, NA VAGA, EM COLUNA PRÓPRIA E INERTE ═════════════════════════════════════════
--
-- ┌─ POR QUE A PROPOSTA MORA NA VAGA, E NÃO É LIDA DE JUNÇÃO NA HORA DA TELA ─────────────────────┐
-- │ Porque a planilha é VIVA e o de/para é editado: a proposta que a tela mostra tem de ser a que  │
-- │ a ingestão resolveu, com a PROCEDÊNCIA daquele casamento, e não uma recalculada no instante do │
-- │ clique. Recalcular faria a tela e a trilha discordarem sobre o que foi proposto, que é          │
-- │ exatamente a pergunta do item 8 ("esse cliente foi escolhido ou foi aceito?").                  │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ ELAS SÃO ESCRITAS POR UM CAMINHO SÓ, E ESSE CAMINHO NÃO ALCANÇA `cod_cliente` ───────────────┐
-- │ O único escritor é `as/ingestao-pandape/ingestao-depara-cliente.service.ts`, que faz um         │
-- │ `update` CONDICIONAL destas três colunas e de NENHUMA outra. Em particular ele NÃO toca         │
-- │ `atualizado_em` da vaga: aquele carimbo é o RELÓGIO DO EXPURGO de quem está dentro da vaga, e   │
-- │ empurrá-lo 48 vezes por dia renovaria a retenção de todo mundo sem nada ficar vermelho.         │
-- │                                                                                                │
-- │ E ELAS FICAM FORA DE `camposDaTrilha` (`as/vagas/vagas.service.ts`). A regra da casa lá é "o     │
-- │ corpo é completo, campo ausente é campo LIMPO": a coluna que entrasse naquele mapeamento seria  │
-- │ APAGADA por qualquer salvamento da trilha, em silêncio. Há teste de fonte afirmando isso.       │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cliente_proposto" varchar(40);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cliente_proposto_nome" varchar(200);--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cliente_proposto_origem" varchar(30);--> statement-breakpoint
-- O ESTADO, e ele é o que responde a pergunta do item 8 DEPOIS que a vaga sai da fila: "este cliente
-- foi ESCOLHIDO ou foi ACEITO da planilha?". Sem ele, a resposta viveria só no texto da trilha, e no
-- dia em que uma linha da planilha estiver errada a pergunta que importa é QUANTAS vagas herdaram o
-- mesmo erro, que é uma contagem, não uma leitura de texto.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cliente_proposto_estado" varchar(20);--> statement-breakpoint
-- SEM FK PARA `clientes`, pela MESMA razão da coluna do catálogo acima, e aqui ela é mais forte: a
-- vaga é inserida de 30 em 30 minutos pela varredura, e um código que o catálogo perdeu derrubaria
-- o insert da vaga, de volta após volta. A frente de PREENCHIMENTO viraria perda de INGESTÃO, que é
-- muito pior do que não propor. O valor é inerte: se o catálogo não o tem, a tela não mostra nome
-- de cliente nenhum, e confirmar cai na FK de `vagas.cod_cliente`, que é quem deve recusar.
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_cliente_proposto_origem" CHECK ("cliente_proposto_origem" IS NULL OR "cliente_proposto_origem" IN ('PLANILHA_ID_VAGA','PLANILHA_REQUISICAO'));--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_cliente_proposto_estado" CHECK ("cliente_proposto_estado" IS NULL OR "cliente_proposto_estado" IN ('PROPOSTO','CONFIRMADO'));--> statement-breakpoint
-- PROPOSTA É SEMPRE UM NOME, E PODE NÃO TER CÓDIGO. O inverso é impossível: código sem nome seria um
-- vínculo sugerido sem a informação que faz a pessoa reconhecer a linha, e é o estado em que alguém
-- confirma em lote sem conferir. A ORIGEM e o ESTADO acompanham a proposta, senão as perguntas "por
-- qual chave isto casou?" e "alguém conferiu?" ficam sem resposta justamente quando ela estiver
-- errada. §A.6: a proposta NUNCA entra em log, e o resumo do ciclo conta sem nomear.
ALTER TABLE "vagas" ADD CONSTRAINT "ck_vagas_cliente_proposto_coerente" CHECK (
	("cliente_proposto_nome" IS NULL AND "cliente_proposto" IS NULL AND "cliente_proposto_origem" IS NULL AND "cliente_proposto_estado" IS NULL)
	OR ("cliente_proposto_nome" IS NOT NULL AND "cliente_proposto_origem" IS NOT NULL AND "cliente_proposto_estado" IS NOT NULL)
);
