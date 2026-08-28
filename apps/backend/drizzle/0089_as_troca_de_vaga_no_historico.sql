-- O RASTRO DA TROCA DE VAGA (A&S, item 5 da validacao do diretor, opcao b).
--
-- O QUE A TROCA E, E POR QUE ELA PRECISA DE RASTRO PROPRIO. Quando o candidato foi alocado na vaga
-- ERRADA, o unico caminho era o "Trazer De Volta", que cria uma SEGUNDA candidatura e devolve a
-- pessoa para a Captacao. Isso esta certo para RECOMECO e errado para CORRECAO: o processo nao
-- recomecou, ele so estava anotado na vaga errada. A acao nova corrige a MESMA linha, mantendo a
-- etapa em que a pessoa ja estava.
--
-- E justamente por MANTER a linha e a etapa que o rastro e obrigatorio: sem ele, uma correcao feita
-- por um Master em dado VIVO nao deixaria marca nenhuma, e daqui a tres meses ninguem saberia que a
-- pessoa esteve em outra vaga. A troca e a unica operacao do modulo que muda a que VAGA a
-- candidatura pertence, o que reescreve a que contagem ela pertence.
--
-- ── POR QUE AS COLUNAS ENTRAM NA TABELA QUE JA EXISTE ─────────────────────────────────────────
--
-- `as_candidatura_etapas` ja e a linha do tempo da candidatura, lida em ordem na ficha. Uma tabela
-- separada de "trocas de vaga" obrigaria a ficha a ler duas fontes e a intercala-las por data para
-- montar UMA narrativa, e as duas divergiriam no primeiro ajuste de ordenacao. O evento de troca e
-- um evento da mesma historia, entao ele mora na mesma tabela.
--
-- O TIPO CONTINUA DERIVADO, nunca guardado: `vaga_para` preenchida e o que marca a troca, do mesmo
-- jeito que `situacao` preenchida marca o desfecho e `etapa_de` nula marca a entrada. Uma coluna
-- `tipo` seria um dado a mais capaz de discordar dos que o produzem.
--
-- `etapa_para` CONTINUA SENDO GRAVADA na troca, com a etapa ATUAL (que nao muda). Nao e redundancia:
-- e o que permite ler a linha do tempo inteira sem consultar a candidatura, e o que deixa explicito
-- que a troca NAO mexeu na etapa, que e a garantia central desta operacao.
--
-- ON DELETE SET NULL nas duas FKs: se um dia uma vaga for apagada, o EVENTO continua existindo (a
-- troca aconteceu), perdendo apenas o ponteiro. Perder o evento inteiro seria pior. Na pratica a
-- vaga com candidatura ja e protegida pelo RESTRICT em `as_candidaturas.vaga_id`.

ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "vaga_de" uuid;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD COLUMN IF NOT EXISTS "vaga_para" uuid;--> statement-breakpoint

ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_vaga_de_vagas_id_fk" FOREIGN KEY ("vaga_de") REFERENCES "public"."vagas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "as_candidatura_etapas" ADD CONSTRAINT "as_candidatura_etapas_vaga_para_vagas_id_fk" FOREIGN KEY ("vaga_para") REFERENCES "public"."vagas"("id") ON DELETE set null ON UPDATE no action;
