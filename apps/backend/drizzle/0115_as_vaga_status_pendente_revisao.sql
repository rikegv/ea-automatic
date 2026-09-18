-- O PAPEL `REVISAO` E O STATUS `PENDENTE_REVISAO`: a fila da vaga que o espelho do Pandapé trouxe
-- sem cliente, e que ninguém do EA ainda olhou.
--
-- ┌─ POR QUE UMA MIGRATION PRÓPRIA, E NÃO UM PEDAÇO DA 0114 ───────────────────────────────────────┐
-- │ A 0114 é o de/para das ETAPAS, outro assunto. Ela ainda não consta como aplicada em lugar       │
-- │ nenhum, e mesmo assim não vira casa de carona: quem lê o histórico do banco precisa achar "o    │
-- │ dia em que o papel REVISAO nasceu" por um arquivo só, e quem precisar reverter uma das duas     │
-- │ frentes não pode ser obrigado a reverter a outra junto.                                         │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ POR QUE UM PAPEL NOVO, E NÃO UM DOS SEIS QUE JÁ EXISTIAM ─────────────────────────────────────┐
-- │ Os dois atalhos foram medidos e os dois quebram (o raciocínio inteiro está em                   │
-- │ `packages/shared-types/src/index.ts`, no comentário de `VAGA_STATUS_PAPEIS`):                    │
-- │   1. REUSAR `RASCUNHO`: o banco RECUSA. O índice parcial `as_vaga_status_papel_unico` admite    │
-- │      UMA linha por papel de sistema, e o RASCUNHO já tem dono: o INSERT morre aqui;              │
-- │   2. USAR `LIVRE`: o banco aceita, e é por isso que é o atalho perigoso. A guarda do            │
-- │      `moverStatus` pergunta o PAPEL da origem, e com `LIVRE` ela não dispara: a vaga sem        │
-- │      cliente vira ABERTA por uma rota HTTP, pulando a fila inteira, sem nada falhar.             │
-- │ O papel próprio é também o que dá IDENTIDADE à linha: a fila pergunta ao catálogo qual é o      │
-- │ status da revisão, e essa pergunta só tem resposta porque o índice único garante uma linha só.  │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ OS DOIS FLAGS QUE NÃO SÃO ESCOLHA DE GOSTO ───────────────────────────────────────────────────┐
-- │ `recebe_candidato = true`: é nesta vaga que TODA inscrição lida pela varredura entra. Com o     │
-- │   flag falso a ingestão para de pendurar candidatura e ninguém vê, porque a vaga continua lá.   │
-- │ `encerra = false`: a vaga precisa continuar VIVA até alguém revisar. O risco conhecido deste    │
-- │   flag (gente protegida do expurgo enquanto a vaga não encerra) já está fechado pelo            │
-- │   `encerrarAusentes`, que alcança por `s.encerra = false`, uma PROPRIEDADE, e não por uma lista │
-- │   de códigos: status novo entra no alcance sozinho, sem ninguém lembrar dele.                    │
-- │ `da_trilha = false`: a trilha de abertura humana não publica DENTRO da fila do espelho.          │
-- │ `movivel_manualmente = false`: nenhuma vaga cai nesta fila por um clique. Quem a põe aqui é a    │
-- │   varredura, e quem a tira é a liberação, que confere o cliente.                                 │
-- └─────────────────────────────────────────────────────────────────────────────────────────────────┘
--
-- §A.24: o rótulo é "Pendente De Revisão", title case, porque ele vira pill de status na tela.
-- §A.11: sem travessão em nenhum texto que chega ao usuário.
-- §A.6: aqui só entram código, rótulo, ordem, cor, papel e quatro booleanos. Nenhum dado de pessoa.
--
-- RE-EXECUTÁVEL: o CHECK é recriado dentro de um bloco `DO` e o INSERT tem
-- `ON CONFLICT ("codigo") DO NOTHING`. Rodar duas vezes deixa o banco no mesmo estado.

-- ── 1. O DOMÍNIO DOS PAPÉIS GANHA `REVISAO` ─────────────────────────────────────────────────────
-- O CHECK é DERRUBADO E RECRIADO, e não "alterado": Postgres não altera a expressão de um CHECK.
-- O `NOT VALID` NÃO ENTRA aqui de propósito: a tabela tem meia dúzia de linhas e todas satisfazem a
-- expressão nova, então a validação imediata é barata e é ela que garante que nenhuma linha antiga
-- escapou com um papel fora do domínio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'as_vaga_status_papel_check') THEN
    ALTER TABLE "as_vaga_status" DROP CONSTRAINT "as_vaga_status_papel_check";
  END IF;
  ALTER TABLE "as_vaga_status" ADD CONSTRAINT "as_vaga_status_papel_check"
    CHECK ("papel" IN ('LIVRE','RASCUNHO','REVISAO','ABERTURA','ENTREGA','FECHAMENTO','CANCELAMENTO'));
END $$;--> statement-breakpoint

-- ── 2. A LINHA DA FILA ──────────────────────────────────────────────────────────────────────────
-- A ORDEM 6 põe a fila logo depois dos cinco status que já existiam, e antes do dormente
-- `VAGA_BANCO` (ordem 6 também, e o desempate por `id` já mora na consulta: o índice de ordem é
-- comum, nunca único, porque ordem repetida é feio e não é erro).
-- O TOM `dg` é o vermelho da paleta fechada do design system: a fila é alerta, não informação.
INSERT INTO "as_vaga_status" (
  "codigo", "rotulo", "ordem", "tom", "ativo", "papel",
  "encerra", "recebe_candidato", "da_trilha", "movivel_manualmente"
)
VALUES (
  'PENDENTE_REVISAO', 'Pendente De Revisão', 6, 'dg', true, 'REVISAO',
  false, true, false, false
)
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

-- ── 3. A REDE DE SEGURANÇA, no molde da 0102 ────────────────────────────────────────────────────
-- Sem esta linha o sistema subiria e só quebraria na PRIMEIRA vaga espelhada: `codigoDoPapel`
-- ('REVISAO') lança, a varredura conta o erro e segue, e o espelho para de nascer em silêncio.
-- Aqui a falha é alta, visível e no deploy, que é onde ela custa menos.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "as_vaga_status" WHERE "papel" = 'REVISAO') THEN
    RAISE EXCEPTION 'as_vaga_status: o papel REVISAO ficou sem linha. A fila de revisao da vaga espelhada nao tem onde nascer.';
  END IF;
END $$;
