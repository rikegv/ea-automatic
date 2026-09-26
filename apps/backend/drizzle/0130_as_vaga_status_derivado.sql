-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 0130 — O STATUS DA VAGA PASSA A DERIVAR DO FUNIL, E A ENTREGA DEIXA DE SER UM FIM
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ┌─ O CONCEITO DO DIRETOR, EM DUAS LINHAS, PORQUE É ELE QUE EXPLICA CADA `ALTER` ABAIXO ─────────┐
-- │ A VAGA TEM QUATRO ESTADOS: Aberta, Entregue, Fechada, Cancelada. TODO O RESTO (Divulgação,    │
-- │ Triagem, Captação, Entrevista Soulan, Shortlist, Entrevista Cliente, Admissão) é movimentação │
-- │ do CANDIDATO, não da vaga. O estado da VAGA DERIVA de onde os candidatos estão, SEM EXIGIR    │
-- │ ORDEM (o candidato pode pular etapas), e o time TAMBÉM move a vaga à mão.                     │
-- └───────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ A MUDANÇA MAIS CARA DESTA MIGRATION ESTÁ NO PASSO 1, E ELA NÃO É O `UPDATE` ─────────────────┐
-- │ `ENTREGUE` DEIXA DE ENCERRAR. Até aqui ela era um DESFECHO: `fechar` a gravava quando a vaga  │
-- │ tinha entregue alguém, e `encerra = true` a tornava terminal. No conceito novo ela é um       │
-- │ ESTADO VIVO ("entregue ao cliente, ainda NÃO finalizada"), e o desfecho de quem terminou      │
-- │ passa a ser SEMPRE `FECHADA`, pela porta `fechar`, que é quem confere candidato tratado e     │
-- │ posição preenchida.                                                                            │
-- │                                                                                                │
-- │ CONSEQUÊNCIA QUE ESTA MIGRATION TEM DE CARREGAR: o expurgo por retenção (§A.6) POUPAVA quem   │
-- │ estava em vaga de papel `ENTREGA` (é quem foi contratado, e o CPF dele continua na admissão,  │
-- │ com retenção própria). Sem `ENTREGUE` terminal, aquela exceção passa a alcançar ninguém, e    │
-- │ quem foi entregue numa vaga que agora sai `FECHADA` perderia a proteção. A cláusula do        │
-- │ expurgo foi reescrita para o CARIMBO DE ENTREGA (`vagas_fechadas`), que é PROVADAMENTE o      │
-- │ mesmo conjunto: `fechar` gravava `ENTREGUE` exatamente quando `ocupacao.finalizadas > 0`, e   │
-- │ no MESMO `update` carimbava `vagas_fechadas`/`vagas_fechadas_banco` com essa contagem.        │
-- │ Ver `retencao-candidatos.service.ts`.                                                          │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.6: nada aqui guarda dado de pessoa. São flags de catálogo, dois carimbos de autoria INTERNA
-- (id de usuário) e um código de etapa. Nenhum CPF, nenhum nome, nenhuma URL.
--
-- RE-EXECUTÁVEL: `IF NOT EXISTS` nas colunas, `DO` nas constraints, e os dois `UPDATE` são
-- idempotentes por construção (escrevem o mesmo valor de novo).

-- ── 1. A ENTREGA DEIXA DE ENCERRAR ──────────────────────────────────────────────────────────────
--
-- PELO PAPEL, E NUNCA PELO CÓDIGO: o rótulo e o código são do diretor desde a 0102, e `ENTREGUE`
-- pode ter sido recadastrado. O papel `ENTREGA` é de sistema, é único por índice parcial, e é ele
-- que `codigoDoPapel("ENTREGA")` resolve.
--
-- OS TRÊS FLAGS NO MESMO `UPDATE`, e isso é obrigatório e não estilo: o CHECK
-- `as_vaga_status_encerra_nao_recebe` (`encerra = false OR recebe_candidato = false`) e o
-- `as_vaga_status_encerra_nao_e_destino` (`encerra = false OR movivel_manualmente = false`) são
-- avaliados sobre a LINHA INTEIRA depois do update. Em dois `UPDATE` separados, o primeiro deles
-- falharia.
--
-- `movivel_manualmente = true` É O QUE ABRE `ABERTA <-> ENTREGUE` no "mover status": a régua é
-- `podeSerDestinoManual = ativo AND movivel_manualmente AND NOT encerra`, nas três camadas
-- (vocabulário, service e o CHECK acima). `FECHADA` e `CANCELADA` continuam FORA do mover status,
-- com as portas próprias que conferem motivo, candidato tratado e posição preenchida.
UPDATE "as_vaga_status"
   SET "encerra" = false,
       "recebe_candidato" = true,
       "movivel_manualmente" = true,
       "atualizado_em" = now()
 WHERE "papel" = 'ENTREGA';--> statement-breakpoint

-- ── 2. QUAL ETAPA DO FUNIL SIGNIFICA "ESTÁ COM O CLIENTE" ───────────────────────────────────────
--
-- ┌─ POR QUE UM FLAG NO CATÁLOGO, E NÃO `etapa = 'ENTREVISTA_CLIENTE'` NO CÓDIGO ─────────────────┐
-- │ A LISTA DE ETAPAS É DO DIRETOR (`as_etapas_funil`, 0100): ele cadastra, renomeia, reordena e  │
-- │ inativa pela tela. Um `if` comparando com o código `ENTREVISTA_CLIENTE` seria código fingindo │
-- │ saber uma lista que o usuário edita, e é exatamente o hardcode que o catálogo de status da    │
-- │ vaga passou a 0102 inteira eliminando. O flag é a MESMA forma dos quatro flags de             │
-- │ `as_vaga_status`: o comportamento é do sistema, a linha é do diretor.                          │
-- │                                                                                                │
-- │ NASCE `false` EM TUDO e é ligado em UMA linha, o que torna a derivação fail-closed: catálogo   │
-- │ sem nenhuma etapa marcada deriva SEMPRE `ABERTA`, que é o estado que não afirma entrega        │
-- │ nenhuma. O erro cai para o lado de não declarar entregue o que não foi.                        │
-- │                                                                                                │
-- │ NÃO HÁ TELA PARA ELE NESTA FRENTE, e a ausência é §A.14/§A.31: a OST pediu a derivação, não   │
-- │ um campo novo no gerenciador de etapas. Propor é uma linha no relatório; construir sem pedido │
-- │ é o que a §A.31 recusa.                                                                        │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "as_etapas_funil" ADD COLUMN IF NOT EXISTS "entrega_ao_cliente" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- A SEMENTE, e ela é UMA linha: `ENTREVISTA_CLIENTE` é a etapa em que o candidato está COM O
-- CLIENTE. `WHERE codigo = ...` e não `WHERE rotulo = ...`: o código é a identidade IMUTÁVEL da
-- etapa (a 0100 diz isso), o rótulo é editável.
UPDATE "as_etapas_funil" SET "entrega_ao_cliente" = true WHERE "codigo" = 'ENTREVISTA_CLIENTE';--> statement-breakpoint

-- ── 2b. PARA ONDE VAI QUEM ESTAVA NA VAGA QUE FOI CANCELADA ─────────────────────────────────────
--
-- ┌─ O QUE MUDA NA OPERAÇÃO (decisão do diretor, Frente B, ponto 3) ──────────────────────────────┐
-- │ CANCELAR VAGA COM CANDIDATO DENTRO PASSA A SER PERMITIDO, e ninguém é DESCARTADO por isso:    │
-- │ quem estava vivo vai para o STAND BY e CONTINUA VIVO, ligado à vaga cancelada, para a pessoa  │
-- │ não sumir e poder ser transferida ou realocada depois.                                         │
-- │                                                                                                │
-- │ `STAND_BY` É ETAPA DO FUNIL (0111), E NÃO SITUAÇÃO, e confundir as duas é o erro que apaga    │
-- │ gente: a SITUAÇÃO diz se o processo segue vivo, a ETAPA diz onde a pessoa está. Ela não muda  │
-- │ de situação, ela muda de lugar.                                                                │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- O FLAG EM VEZ DO LITERAL, pelo mesmo argumento do `entrega_ao_cliente` acima, e a própria 0111 já
-- tinha escrito a regra: "nenhuma linha de TypeScript precisa saber que `STAND_BY` existe para o
-- funil funcionar, porque quem lê as etapas lê a TABELA".
ALTER TABLE "as_etapas_funil" ADD COLUMN IF NOT EXISTS "destino_do_cancelamento" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "as_etapas_funil" SET "destino_do_cancelamento" = true WHERE "codigo" = 'STAND_BY';--> statement-breakpoint

-- NO MÁXIMO UM DESTINO, garantido pelo banco, no MOLDE do `as_etapas_funil_inicial_unica`: "para
-- onde vai quem estava na vaga cancelada" é uma pergunta com UMA resposta, e duas linhas marcadas
-- fariam a rotina ESCOLHER, que é o que ela não pode fazer. PARCIAL, então ele não diz nada sobre
-- as etapas não marcadas, que são todas as outras.
CREATE UNIQUE INDEX IF NOT EXISTS "as_etapas_funil_destino_cancelamento_unico"
  ON "as_etapas_funil" ("destino_do_cancelamento") WHERE "destino_do_cancelamento";--> statement-breakpoint

-- ── 3. O MOVIMENTO MANUAL GRUDA ─────────────────────────────────────────────────────────────────
--
-- ┌─ O PADRÃO É O DO `farol_global` DA ADMISSÃO (§A.3), E ELE FOI LIDO ANTES DE SER COPIADO ──────┐
-- │ Lá, `FAROL_MANUAL` é um CONJUNTO DE ESTADOS que a automação nunca reescreve, e isso basta     │
-- │ porque nenhum estado manual é alcançável pela derivação. AQUI NÃO BASTA: `ABERTA` e           │
-- │ `ENTREGUE` são alcançáveis pelos DOIS caminhos, então o estado sozinho não diz quem o         │
-- │ escreveu. O que gruda é o CARIMBO, não o valor.                                                │
-- │                                                                                                │
-- │ A MESMA LIÇÃO JÁ ESTÁ ESCRITA NO `deriveFarolGlobal`: a correção do bug de 13/08/2026 NÃO foi │
-- │ pôr `BANCO_AGUARDAR` na lista dos manuais (isso congelaria a derivação para quem chega nele   │
-- │ automaticamente); foi ler a FLAG que registra a decisão explícita do usuário. É isto.          │
-- │                                                                                                │
-- │ QUEM ESCREVE: só `moverStatus`. QUEM LIMPA: as portas que gravam status por régua própria     │
-- │ (publicar, liberar, corrigir cliente, fechar, cancelar, reabrir), porque depois delas o status │
-- │ vigente NÃO foi posto à mão. A invariante é "carimbo preenchido <=> o status atual veio do     │
-- │ gesto manual", e é ela que a derivação lê.                                                      │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- `ON DELETE SET NULL` NO AUTOR, e sem check de "tudo ou nada" entre as duas colunas: é o mesmo
-- desenho dos carimbos de cancelamento (0098/0113). Apagar um usuário não pode FALHAR por causa de
-- uma vaga que ele moveu meses antes, e o carimbo não pode sumir junto com ele: sem o autor, o
-- `status_manual_em` ainda responde "este status foi posto à mão", que é o que a derivação pergunta.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "status_manual_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "status_manual_por_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "vagas_status_manual_por_id_usuarios_id_fk"
    FOREIGN KEY ("status_manual_por_id") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- A pergunta é sempre "quais vagas estão com o status travado à mão", nunca "todas as vagas":
-- índice PARCIAL, como o `idx_vagas_cancelada_em` e o `idx_vagas_encerrada_em`.
CREATE INDEX IF NOT EXISTS "idx_vagas_status_manual_em" ON "vagas" ("status_manual_em") WHERE "status_manual_em" IS NOT NULL;--> statement-breakpoint

-- ── 4. EM QUE ETAPA A VAGA ESTAVA QUANDO FOI CANCELADA ──────────────────────────────────────────
--
-- ┌─ A DEFINIÇÃO, E ELA PRECISA SER DEFENSÁVEL PORQUE VIRA RELATÓRIO ─────────────────────────────┐
-- │ "A ETAPA DA VAGA" NÃO EXISTE COMO DADO: a etapa é da CANDIDATURA, e uma vaga tem várias ao    │
-- │ mesmo tempo, em etapas diferentes. A escolha é: A ETAPA MAIS AVANÇADA (maior `ordem` no        │
-- │ catálogo) ENTRE AS CANDIDATURAS VIVAS NO INSTANTE DO CANCELAMENTO.                             │
-- │                                                                                                │
-- │ POR QUE A MAIS AVANÇADA, e não a mais comum nem a da primeira linha: a pergunta que o          │
-- │ relatório faz é "até onde este processo tinha chegado antes de morrer", e quem responde isso  │
-- │ é quem foi mais longe. Uma vaga com 30 na Captação e 1 na Entrevista Cliente chegou À          │
-- │ ENTREVISTA CLIENTE; dizer "Captação" porque ela é a maioria contaria o oposto do que se       │
-- │ perguntou. É a MESMA régua de ordenação que as travas de fechamento e cancelamento já usam    │
-- │ para listar pendentes ("do fim do funil para o começo", `posicaoNoFunil`).                     │
-- │                                                                                                │
-- │ VIVAS, e não todas: quem já tinha sido descartado saiu antes e não descreve onde a vaga        │
-- │ estava. Sem ninguém vivo, a coluna fica NULA, e nulo aqui quer dizer uma coisa só: a vaga foi  │
-- │ cancelada sem ninguém dentro. Inventar 'CAPTACAO' nesse caso seria afirmar um fato que não     │
-- │ aconteceu.                                                                                      │
-- │                                                                                                │
-- │ A ETAPA TAMBÉM ENTRA NA NARRATIVA DO EVENTO DE TRILHA, e a redundância é deliberada: a         │
-- │ REABERTURA limpa os carimbos de cancelamento da linha da vaga (eles descrevem o estado ATUAL,  │
-- │ e vaga reaberta não está cancelada), então sem a cópia na trilha a reabertura apagaria a       │
-- │ única resposta. É a mesma razão pela qual `cancelamento_motivo` já viaja nos dois lugares.     │
-- └────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- FK `RESTRICT` para o catálogo, como `as_candidaturas.etapa` e as duas pontas de
-- `as_candidatura_etapas`: etapa por onde uma vaga cancelada passou é INATIVÁVEL, nunca apagável,
-- e é o banco que garante, mesmo por SQL cru. Sem ela, apagar uma linha do catálogo faria o
-- relatório de cancelamentos exibir código órfão.
ALTER TABLE "vagas" ADD COLUMN IF NOT EXISTS "cancelamento_etapa" varchar(40);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vagas" ADD CONSTRAINT "vagas_cancelamento_etapa_as_etapas_funil_codigo_fk"
    FOREIGN KEY ("cancelamento_etapa") REFERENCES "public"."as_etapas_funil"("codigo") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
