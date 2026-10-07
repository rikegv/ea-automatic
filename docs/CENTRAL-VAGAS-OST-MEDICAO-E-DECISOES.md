# Central de Vagas, OST de 4 frentes: medição e decisões

> Documento de apoio ao pulso (§A.42). Registra o que foi MEDIDO em produção (banco
> `ea_automatic`) antes de qualquer construção ou escrita irreversível (§A.27, §A.40), o
> mapa de alcance do arquiteto, o veredito do seguranca, e a lista de decisões do diretor.
> Nada foi publicado, nada foi apagado. Data: 06/10/2026.

## Resumo em uma linha

A investigação de alcance (coordenador + arquiteto + seguranca) mostra que as premissas da
OST divergem do estado real medido: a frente 1 de dados **já está limpa** (0 a consolidar), e
a frente 3, ao pé da letra, apagaria **214 vagas e ~32 mil candidaturas** em produção, ligadas
a candidatos reais (CPF). Por isso o trabalho para em decisões do diretor antes de construir ou
apagar.

## Frente 1, publicar correção + limpar + desacoplar reference

**O código já está em `main`** (commits 698bb0a, 8278850, c8fc6eb). O desacople do reference já
está no código (`domain/vaga.ts:76` `codigoColideComVagaManual`; a liberação não zera mais o
`id_vacancy_pandape`, `vagas.service.ts`), e a varredura já casa por `id_vacancy_pandape`.

**A limpeza de dados já aconteceu.** Medido em produção:
- duplicatas por `id_vacancy_pandape`: **0**.
- candidaturas órfãs (vaga_id sem vaga): **0**.
- o runner `consolida-duplicatas-vaga-pandape.ts` em dry-run contra produção: **"pares 1:1
  encontrados: 0, nada a consolidar (no-op)"**.

Ou seja, as "23 duplicatas + ~5.026 candidaturas fantasmas" da OST **não existem mais para
apagar**: já foram consolidadas. Frente 1 vira **só publicar o código**, não apagar nada.

**Armadilha confirmada e evitada (§A.40):** `codigo=332225` são **31 vagas com 31
`id_vacancy_pandape` DISTINTOS**, isto é, 31 vagas REAIS diferentes que colidiram num mesmo
código de referência. Elas **não são duplicatas** e **não podem ser apagadas**. O desacople
(c8fc6eb) é justamente o que deixa cada uma ser liberada sozinha. Uma limpeza "por código
duplicado" teria destruído 31 processos reais.

**O que "publicar" custa de verdade:** a produção roda do worktree `ea-release-portal`
(`main-publicacao`), que está **9 commits atrás do `main`** e **sujo com trabalho de outras
sessões** (Central de Candidatos, `shared-types`, pastas de backup de 05 e 06/10). Publicar a
frente 1 significa avançar esse worktree compartilhado, arrastando os 9 commits e colidindo com
o que as outras sessões têm em voo. É exatamente por isso que a OST diz "só o Rike coordena" o
restart. **Publicar não é uma ação isolada desta sessão.**

## Frente 2, filtro de entrada pela planilha

Hoje o pipeline da planilha já existe e roda: o `ai-service` lê o Drive, o
`PlanilhaVivaService` peneira, o scheduler (de hora em hora) materializa em
`as_depara_cliente_vaga`, e a varredura (30 min) lê essa tabela **só para propor cliente**, não
para filtrar entrada. A coluna **Status da planilha já é lida e hoje é descartada**
(`domain/as-planilha-cliente-colunas.ts`), e a tabela espelho **não tem coluna de status**.

**Decisões de arquitetura (nenhuma é minha para tomar em silêncio, §A.27/§A.31):**

1. **Como consultar a planilha "a cada varredura".** Opção A (recomendada pelo arquiteto):
   persistir o status na tabela espelho e a varredura lê a tabela; frescor de até 1h (cadência
   do scheduler). Opção B: a varredura lê a planilha direto do Drive a cada volta de 30 min,
   atendendo "a cada varredura" ao pé da letra, mas acoplando a ingestão ao ai-service/Drive a
   cada ciclo. A OST diz "A CADA VARREDURA"; a opção A entrega "a cada ~1h". Preciso do aval de
   qual atende o que o diretor quis.

2. **O efeito colateral de retenção (LGPD, §A.6).** Restringir a entrada muda o
   `encerrarAusentes` (`ingestao-ciclo.ts:251`): a vaga que deixa de entrar pelo filtro sai da
   lista de "ativos" e seria **encerrada como ausente**, o que **liga o relógio de expurgo** de
   quem está dentro dela. Decidir: "fora da planilha" deve **encerrar o espelho** (expurga) ou
   **não tocar**? (Veredito do seguranca abaixo.)

## Frente 3, limpar o Liberar Vaga

**Escala medida em produção.** As 478 vagas `PENDENTE_REVISAO` carregam **94.511
candidaturas**. Cruzando com o espelho da planilha (`as_depara_cliente_vaga` ativo):

| Situação | Vagas | Candidaturas |
|---|---|---|
| FORA da planilha (apagaria) | **214** | **32.013** |
| DENTRO da planilha (fica) | 264 | 62.498 |

A frente 3 ao pé da letra apaga **214 vagas e ~32 mil candidaturas**, de forma irreversível, em
produção. E isso é o piso: o refino por status (apagar também as DENTRO da planilha que estejam
FECHADO/CANCELADO) só é computável depois de ler a planilha viva (trabalho da frente 2), e
aumenta o número. Cada candidatura liga a um candidato real (`as_candidatos`, CPF, nome,
e-mail, telefone). É deleção de dado pessoal em massa.

**Guardas obrigatórias (§A.27/§A.38):** runner one-time no molde do da frente 1 (dry-run
padrão, transacional, idempotente, §A.6), filtrar por **papel REVISAO** (nunca pelo literal
`PENDENTE_REVISAO` nem por "id setado", senão alcança vaga liberada que reteve o id ou vaga do
Digai), backup antes, contagem antes e depois, veredito do seguranca, e aval explícito do
diretor antes do `EXECUTAR=1`. Esta é uma escrita irreversível: não roda sem a decisão dele.

## Frente 4, botão "Recusar Liberação" + aba Recusadas

Construção nova, independente das frentes 2/3 no código. Duas decisões:

3. **Modelo de estado.** Papel de sistema novo `RECUSADA` (exige migration semeando
   `as_vaga_status`, mais 3 `Record` fechados de frontend que quebram o typecheck sem o braço
   novo, mais rebuild do `shared-types`), **ou** espelhar o padrão já existente da admissão
   (`LIBERACAO_RECUSADA` + `recusar`/`reativarRecusada`). O caminho da admissão é mais barato e
   já validado.

4. **Recusar para a re-entrada?** Hoje uma vaga que continua ABERTO na planilha **segue sendo
   espelhada e recebendo candidaturas**. Recusar só a tira da fila; não para a ingestão. Se o
   desejado é "parou de entrar", recusar precisa também suprimir a re-entrada (a frente 2 pular
   vaga de papel RECUSADA). Decidir.

**RBAC (a OST pede qualquer consultor):** recusar/devolver sem `@Roles`, diferente de
liberar/excluir que são MASTER/SUPER_ADMIN. A trava correta é a operação reivindicada pelo menu
`as-vagas-revisao`, e a transição só a partir do papel válido no service. Trilha em
`as_vaga_status_eventos` com `por_id` da sessão, nunca do corpo, sem PII. (Veredito do seguranca
abaixo.)

## Veredito do seguranca (§A.38)

Auditoria adversarial, medida contra produção. Veredito por frente:

| Frente | Veredito | Fundamento |
|---|---|---|
| F1 consolidação | **APROVADO** | Hoje é no-op (0 pares); imune à armadilha 332225, provado linha a linha. |
| F2 filtro de entrada | **VETADO** | Encolher a lista de "ativos" acende o relógio de expurgo por "não estar na planilha", não por fechar no ATS: base ilícita para retenção. |
| F3 deleção em massa | **VETADO** | A FK é RESTRICT, não cascade; a deleção orfana ~22,2 mil candidatos e **corta o elo de 6 admissões VIVAS** (§A.47). Não é exigida por LGPD. |
| F4 recusar sem @Roles | **APROVADO COM GUARDA** | Defensável por paridade com `liberar-revisao`, se `por_id` vier da sessão, a trilha não tiver PII, e a controller for reivindicada por menu. |

**Números medidos pelo seguranca:** 214 vagas fora da planilha = 32.013 candidaturas (ATIVO
30.923, DESCARTADO 945, ENVIADO_PARA_ADMISSAO 145). Candidaturas com `admissao_id`: **8**, das
quais **6 em admissão VIVA** (3 EM_ADMISSAO, 3 BANCO_AGUARDAR). Candidatos que ficariam órfãos:
**~22,2 mil** (base em movimento: 22.193 subiu para 22.251 durante a auditoria).

**O que o veto aponta como caminho seguro (a correção, §A.38):**
- **F2:** o filtro de planilha pode gatear **só a ESCRITA** (o que é espelhado/criado). O
  conjunto que alimenta `encerrarAusentes` tem de continuar sendo o conjunto ATS-ativo
  completo. Encerramento só pode derivar de ausência REAL no ATS, nunca de pertencimento a
  planilha. Assim a frente 2 atende o diretor (só vaga da planilha entra) sem o expurgo ilícito.
- **F3:** o sweep de retenção **já** expõe `PENDENTE_REVISAO` ao prazo de 6 meses sem destruir
  histórico; `REVISAO` não protege. A deleção não acrescenta minimização, só risco e destruição
  de trilha de 30.923 pessoas ativas. Recomendação do seguranca: deixar a retenção trabalhar.
  Se o diretor ainda quiser remover as 214 vagas-lixo, só sai do veto com TODAS as guardas:
  excluir do lote toda candidatura com `admissao_id` (zero severa de admissão viva), nunca
  apagar `as_candidatos`, transação por vaga, recontar a base a cada transação, §A.6 no log.
- **F4:** aprovado com as 3 guardas (por_id da sessão, controller reivindicada por menu, trilha
  sem texto livre/PII).

## As 6 decisões do diretor (DECIDIDAS em 06/10/2026)

1. **F1 / publicação:** publicar pelo caminho limpo (origin/main, não o tree sujo), só o
   commitado+validado. **Descoberta posterior: a F1 JÁ ESTÁ EM PRODUÇÃO** (no-op). A produção é
   servida pelos `dist` via `scripts/publicar-producao.sh` (§A.49), que troca só os artefatos,
   não o git HEAD; o HEAD "atrasado" do `ea-release-portal` enganava. O `dist` servido contém a
   F1 byte a byte igual ao build limpo, e também Clientes/Candidatos/Portal-SendGrid/GI (uma
   publicação de origin/main inteiro foi ao ar ~18:20 de 06/10). Pendência só de confirmação ao
   diretor: essas 4 frentes subiram juntas, duas marcadas "pendente de coordenação".
2. **F2, leitura da planilha:** ESPELHO (tabela `as_depara_cliente_vaga`, frescor ~1h), não o
   Drive ao vivo.
3. **F2, desenho seguro:** o filtro gateia SÓ A ENTRADA (escrita). O encerramento continua
   derivando de ausência real no ATS, nunca da planilha. (seguranca APROVOU: `ativos` não
   encolhe.)
4. **F3: NÃO APAGAR.** Tela limpa por filtro, zero deleção. O diretor só trabalha com as
   ABERTAS; as não-abertas somem da tela mas ficam no banco; a retenção de 6 meses cuida do
   velho. (seguranca VETOU a deleção: FK é RESTRICT, orfanaria ~22 mil candidatos e cortaria o
   elo de 6 admissões VIVAS, §A.47.)
5. **F4, modelo:** espelhar o `LIBERACAO_RECUSADA` da admissão, SEM papel novo. Implementado
   como marca persistente `vagas.recusada_em`/`recusada_por_id` + trilha `vaga_recusa_eventos`.
6. **F4, re-entrada:** a recusa é PERSISTENTE. A varredura respeita a marca: não recria, não
   reabre, mesmo com a vaga aberta na planilha. Só o "devolver" humano tira da recusa.

## Estado da construção e ponto de retomada (06/10/2026, sessão interrompida)

**Construído e verde (no branch de trabalho, DB de dev `ea_juncao_prova`), NÃO publicado:**
- Backend: `domain/as-planilha-status-vaga.ts` (régua pura ABERTO/ENTREGUE), gate F2 em
  `as/ingestao-pandape/ingestao-ciclo.ts`/`ingestao-repositorio.ts`/`ingestao-varredura.service.ts`/`ingestao-portas.ts`,
  `depara-cliente.service.ts` grava `status_planilha`, `vagas.service.ts` (fila filtrada,
  `recusadas()`, `recusarLiberacao`, `devolverRevisao`), `vagas.controller.ts` (3 endpoints),
  migration `drizzle/0144_as_planilha_status_e_vaga_recusa.sql` (when=1790646011719, acima do
  watermark anômalo do 0134). Endpoints: `GET /as/vagas/recusadas`,
  `POST /as/vagas/:id/recusar-liberacao`, `POST /as/vagas/:id/devolver-revisao`, todos sem
  @Roles (menu `as-vagas`).
- Frontend: `app/(app)/as/vagas-pendentes-revisao/page.tsx` (aba Recusadas, botões recusar/devolver),
  `lib/as-vagas-revisao.ts` (`carregarRecusadas`/`recusarLiberacao`/`devolverARevisao`).
- Gate: typecheck/lint/testes verdes; 1 falha PRÉ-EXISTENTE (`vagas.edicao-migracao.tester.spec`,
  watermark do 0134, provada não-regressão, fora do escopo).

**Auditorias (ambas concluídas):** `seguranca` APROVOU as 3 frentes SEM VETO. `tester` entregou
5 specs novos, **29 testes verdes** (55/55 convivendo com os specs do autor, tsc limpo), nenhum
bug no comportamento central. As DUAS auditorias apontam, de forma independente, o MESMO e ÚNICO
ajuste não-bloqueante abaixo.

**O ÚNICO ajuste pendente (assimetria F2/F3, confirmado por seguranca + tester):** o gate de
entrada F2 é injetado só pela flag `AS_PLANILHA_VIVA_FILE_ID` (`ingestao-varredura.service.ts:304`),
sem conferir se o espelho foi populado. Com a flag ligada e o espelho vazio/defasado (primeira
hora após ligar, falha do scheduler, ou sync sem casamento), `IngestaoRepositorio.vagaEntra`
(`ingestao-repositorio.ts:222`) devolve false para TODA vaga, parando a ingestão em silêncio.
SEM risco de LGPD/expurgo (`ativos` segue completo, nada é encerrado). Correção: replicar o guard
`ativa` da leitura (`vagas.service.ts:3690`, só filtra quando existe `status_planilha` não nula)
dentro de `vagaEntra`, para o gate ser fail-OPEN quando o espelho está vazio, igual à fila F3.
Em produção o espelho já está populado (905 linhas), então a janela NÃO ocorre hoje; é reforço.

**PONTO DE RETOMADA, em ordem:**
1. Fazer UMA rodada de backend para o ajuste da assimetria acima (guard `ativa` em `vagaEntra` +
   teste), e re-rodar o gate. Não há outros gaps do tester.
2. Publicar na homologação 3120 (sync por cópia + build com BACKEND_ORIGIN + DB
   `ea_automatic_homolog`), semear dado sintético (§A.43) para a fila e a aba Recusadas terem
   conteúdo, e fazer a PROVA VISUAL (§A.13): 3 abas, recusar/devolver, anti-esmagamento §A.20.
3. Validação visual do diretor na 3120.
4. Commit nominal (§A.14/§A.21) e publicação em produção via `scripts/publicar-producao.sh`
   (§A.49), restart coordenado pelo diretor. Coordenar a migration 0144 com a 0134 da sessão do
   Portal (que estava aplicando 0134 em produção).

**Artefatos desta sessão:** build limpo F1 em
`<scratchpad>/wt-f1-limpo` (worktree detached c28d8e0+F1, pode ser podado). Nada foi publicado,
nada apagado em produção; só leitura/medição.
