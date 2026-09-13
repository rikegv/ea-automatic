-- A&S, ONDA E: o SEGMENTO (o ramo do cliente) e o COMERCIAL (a pessoa) viram catálogos do diretor,
-- entram no cadastro do CLIENTE e ganham, na VAGA, a coluna que SOBREPÕE o que ela herdaria.
--
-- O QUE ESTA MIGRATION FAZ, e é só isto:
--   1. cria `as_segmentos` e `as_comerciais`, os dois no molde exato de `as_linhas_servico` (0106);
--   2. acrescenta `clientes.segmento_id` e `clientes.comercial_id`, NULÁVEIS, com FK RESTRICT;
--   3. acrescenta `vagas.segmento_id` e `vagas.comercial_id`, NULÁVEIS, com FK RESTRICT.
--
-- ┌─ O QUE ELA **NÃO** FAZ, e cada ausência é deliberada ──────────────────────────────────────────┐
-- │ NÃO SEMEIA NENHUMA LINHA. A 0106 semeou as cinco linhas de serviço porque o diretor as ditou;  │
-- │ aqui não existe lista ditada. "Varejo, Saúde, Indústria" são EXEMPLOS do enunciado, e semear    │
-- │ exemplo é inventar catálogo (§A.31). As duas tabelas nascem VAZIAS e o diretor as preenche pelo │
-- │ gerenciador, que é justamente a tela que esta onda entrega.                                     │
-- │                                                                                                 │
-- │ NÃO MIGRA DADO NENHUM, porque não há de onde: medido no schema inteiro antes de escrever isto,  │
-- │ NÃO EXISTE nenhuma coluna nem tabela de segmento ou comercial no banco (zero colunas com        │
-- │ 'segmento', 'comercial' ou 'ramo'; `clientes` tem 17 colunas e nenhuma delas). São campos        │
-- │ novos, e todos os 249 clientes e todas as vagas nascem com NULO nos quatro.                     │
-- │                                                                                                 │
-- │ NÃO TORNA NADA OBRIGATÓRIO. Cliente sem segmento e sem comercial continua salvando, em todos os │
-- │ caminhos de escrita, e vaga sem os dois continua abrindo e publicando: eles NÃO entram na régua │
-- │ dos obrigatórios da publicação. O diretor vai preencher os 249 aos poucos, e um NOT NULL (ou um │
-- │ DEFAULT apontando para uma linha inventada) travaria a operação enquanto ele preenche.          │
-- │                                                                                                 │
-- │ NÃO CRIA ÍNDICE nas quatro colunas. `clientes` tem 249 linhas e `vagas` está na casa das        │
-- │ dezenas: a varredura sequencial é mais barata que o índice, e índice que ninguém usa é peso em  │
-- │ toda escrita. Quando a base de vagas da onda 3 (2.363 linhas) entrar, a pergunta se refaz com   │
-- │ o número na mão.                                                                                │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE `ON DELETE RESTRICT` NOS QUATRO, e por que o banco precisa dizer isso sozinho ────────┐
-- │ O catálogo tem EXCLUSÃO LÓGICA (`ativo`), e não tem rota de apagar. O `restrict` é a trava que  │
-- │ vale para quem NÃO passa pela aplicação: um `DELETE` no psql, um script futuro, uma carga. Sem  │
-- │ ele, apagar um segmento apagaria a resposta de "de que ramo era aquele cliente" e deixaria      │
-- │ ponteiro pendurado. É a mesma trava, com a mesma razão, de                                      │
-- │ `vagas_linha_servico_id_as_linhas_servico_id_fk` (0106).                                        │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- A HERANÇA VIVA MORA NA LEITURA, NÃO AQUI. `vagas.segmento_id` NULO significa HERDAR do cliente, e
-- quem resolve é o `coalesce(vaga.x, cliente.x)` do `VagasService`. Por isso a migration não copia
-- valor do cliente para a vaga: a cópia seria o retrato congelado que o diretor decidiu NÃO ter.
--
-- §A.6: `as_comerciais.rotulo` é NOME DE PESSOA, e é o único dado pessoal desta migration. A tabela
-- guarda o nome e mais nada (sem e-mail, sem telefone, sem CPF): minimização. Nenhum CPF, nenhum
-- candidato, nenhuma URL externa passa por aqui.

-- ── 1. OS DOIS CATÁLOGOS ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "as_segmentos" (
	"id" serial PRIMARY KEY NOT NULL,
	-- A IDENTIDADE, IMUTÁVEL: derivada do rótulo na criação e nunca reescrita. Renomear o segmento
	-- mexe no `rotulo`, nunca aqui, e é isso que faz o cliente renomeado continuar sendo o mesmo.
	"codigo" varchar(40) NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	-- EXCLUSÃO LÓGICA. Pela FK RESTRICT abaixo, segmento já usado não pode ser apagado, nunca mais.
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "as_segmentos_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint

-- `rotulo` AQUI É NOME DE PESSOA (§A.6): a tabela guarda o nome e mais nada. Quem sai da empresa é
-- INATIVADO, nunca apagado, para o cliente e a vaga antiga continuarem dizendo de quem eram.
--
-- ┌─ ELA NÃO TEM `codigo`, E ESSA É A ÚNICA DIFERENÇA DE FORMA PARA `as_segmentos` ───────────────┐
-- │ Nos catálogos irmãos o `codigo` é derivado do rótulo e IMUTÁVEL para sempre, e o renomear não │
-- │ o toca. Para um nome de pessoa isso gravaria `ANA_PAULA_RODRIGUES` numa coluna que nenhuma    │
-- │ tela corrige: nome MUDA (casamento, retificação, nome social), a LGPD dá direito à correção,  │
-- │ e o renomear consertaria o rótulo deixando o nome ANTIGO vivo no código, que sai no JSON. A   │
-- │ identidade aqui é o `id` serial, sem semântica, como em `as_cidades`.                         │
-- │                                                                                               │
-- │ E NÃO HÁ UNIQUE POR NOME: duas "Ana Silva" existem, e a recusa da segunda teria de dizer com  │
-- │ QUEM colidiu, revelando o nome de uma ex-funcionária inativada a quem só tentou cadastrar      │
-- │ alguém. Homônimo é caso válido; quem desempata é o `id`.                                       │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS "as_comerciais" (
	"id" serial PRIMARY KEY NOT NULL,
	"rotulo" varchar(120) NOT NULL,
	"ordem" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ── 2. AS DUAS COLUNAS DO CLIENTE ───────────────────────────────────────────────────────────────
-- NULÁVEIS e SEM DEFAULT: cliente sem segmento e sem comercial é o estado normal no começo (os 249
-- entram todos assim), e um default apontaria para uma linha que não existe em tabela recém-criada.
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "segmento_id" integer;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "comercial_id" integer;--> statement-breakpoint

ALTER TABLE "clientes" ADD CONSTRAINT "clientes_segmento_id_as_segmentos_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."as_segmentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_comercial_id_as_comerciais_id_fk" FOREIGN KEY ("comercial_id") REFERENCES "public"."as_comerciais"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- ── 3. AS DUAS COLUNAS DA VAGA (a SOBREPOSIÇÃO) ─────────────────────────────────────────────────
-- NULO AQUI NÃO É "SEM VALOR": é HERDAR DO CLIENTE. Preenchido é SOBREPOR, só nesta vaga. Toda vaga
-- existente nasce NULA, ou seja, herdando, que é exatamente o comportamento que o diretor pediu.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "segmento_id" integer;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "comercial_id" integer;--> statement-breakpoint

ALTER TABLE "vagas" ADD CONSTRAINT "vagas_segmento_id_as_segmentos_id_fk" FOREIGN KEY ("segmento_id") REFERENCES "public"."as_segmentos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vagas" ADD CONSTRAINT "vagas_comercial_id_as_comerciais_id_fk" FOREIGN KEY ("comercial_id") REFERENCES "public"."as_comerciais"("id") ON DELETE restrict ON UPDATE no action;
