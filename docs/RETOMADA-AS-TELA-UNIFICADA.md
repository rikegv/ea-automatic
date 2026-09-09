# RETOMADA: tela unificada de vagas (A&S)

Documento de continuidade, escrito em 08/09/2026 quando o diretor avisou que ia perder conexão.
Quem retomar esta frente, em qualquer sessão, lê este arquivo primeiro.

---

## O QUE SOBREVIVE E O QUE NÃO SOBREVIVE

**SOBREVIVE, sem nenhuma ação:**
- Tudo que está gravado em disco no working tree (a frente inteira, ~46 arquivos).
- A **homologação 3120** e a **produção 3010**: rodam como serviços `systemd --user`
  (`ea-homolog-backend`, `ea-homolog-frontend`, `ea-backend`, `ea-frontend`, `ea-proxy`), com
  `Restart=always`. Queda de sessão não os alcança.
- O banco (`ea-db`), com as migrations **0095, 0096 e 0097 já aplicadas na homologação**.
- A **salvaguarda** descrita abaixo.

**NÃO SOBREVIVE:**
- **Os agentes em execução.** Eles rodam dentro da sessão. Se a sessão cair, eles param onde
  estiverem, e o que já tiverem escrito em disco fica, possivelmente pela metade. **Esse é o único
  risco real**, e é por isso que a salvaguarda foi tirada ANTES de eles terminarem.

## A SALVAGUARDA

Pasta: `/home/henrique/ea-as-vagas-salvaguarda-FINAL-20260908-2108` (a mais recente; as anteriores ficam como histórico)

Fora do repositório, para sobreviver a qualquer coisa que aconteça com ele:

- `frente-as-vagas.patch` : o diff de tudo que é rastreado
- `novos/` : os 22 arquivos novos, inteiros (o patch não os carrega)
- `alterados/` : os 24 arquivos alterados, inteiros, para conferir sem depender do patch
- `COMMIT-BASE.txt` : o commit sobre o qual o patch aplica

Se o working tree se perder ou ficar inconsistente:
`git checkout <commit-base> -- .` e então `git apply frente-as-vagas.patch`, mais a cópia de `novos/`.

## ONDE A FRENTE ESTÁ

**Construído e verde:** etapas 0 a 6. Vocabulário (`ALOCADO`, `ENVIADO_PARA_ADMISSAO`), régua de
posição como fonte única, contagem separada por lado, log do aceite, cilindro derivado, painel
unificado, ações do modal, fechamento derivado e forçado.

**No ar na 3120 e VALIDADO pelo diretor:** o cilindro (etapa 3) e o painel de leitura (etapa 4).

**Construído e NÃO publicado:** etapas 5 e 6, mais tudo que veio depois delas.

**Gate na última medição:** backend 165 arquivos / 1948 testes, frontend 29 / 251, typecheck limpo
nos três pacotes, `eslint src` limpo no backend e com os 3 erros pré-existentes no frontend
(`nova/page.tsx:395`, `vt/page.tsx:245`, `Combobox.tsx:247`).

## OS DOIS AGENTES FECHARAM. O ESTADO ABAIXO É O FINAL DA NOITE DE 08/09

**Os doze itens do veto e do `tester` estão FEITOS.** Os dois agentes voltaram antes de a sessão cair.

**Backend, seis itens fechados**, com mutação provando cada um (9, 4, 2, 2, 3, 1 e 6 vermelhos ao
desligar cada correção):
1. **O BLOQUEANTE fechado, e a porta tinha TRÊS folhas.** A régua foi escrita como PERMISSÃO de dois
   valores (`VAGA_STATUS_DA_TRILHA = ["RASCUNHO","ABERTA"]`), não como proibição de dois, então
   `ENTREGUE` entrou sozinho. Proibição esquece a terceira folha; permissão não tem como.
   **A prova que fecha o veto:** só duas linhas escrevem `vagas.status`, e uma delas passou a ficar
   atrás da guarda. **`fechar()` voltou a ser a ÚNICA porta para o estado terminal**, que era a
   condição sem a qual a dispensa do `@Roles` era falsa.
2. `moverEtapa` passou a `!candidaturaViva`.
3. `aprovar` ganhou guarda, **e o mecanismo que eu mandei usar NÃO resolvia**: `candidaturaViva` é
   verdadeiro para `ALOCADO`, então a flag sozinha não impediria aprovar um alocado, que era o dano
   principal. Nasceu a **trava 7** (desfazer entrega é recusado), incondicional de propósito.
4. O aceite passou a sair na resposta do histórico, com autor e instante.
5. Teste da ausência de `@Roles` em `fechar`, pela técnica de `lojas-escrita-aberta.spec.ts`.
6. O `@IsIn` derivado **e** o roteamento trocado de nome de situação para `consomePosicao`: derivar
   sozinho só moveria o perigo de lugar.

**Frontend, seis itens fechados:** o parser do 409 por `motivo`, o gesto de forçar do Master, a
trilha do forçado visível, o aceite no histórico, o seletor sem os status terminais, e a régua do
funil virada.

## O QUE FALTA, EM ORDEM

1. **`seguranca` REAUDITA e levanta (ou mantém) o veto.** §A.38: vetado não sobe. **Este é o próximo
   passo, e nada sobe antes dele.**
2. **Subir na 3120**, com as migrations **0098** no mesmo passo do restart do backend (a 0095, 0096 e
   0097 já estão aplicadas lá). Sem a 0098, a Central de Vagas inteira cai em 500.
3. **Consertar a worktree da homologação:** o agente de frontend copiou o `shared-types` para lá sem
   o backend, então `apps/backend` de `/home/henrique/apps/ea-homolog` **não typecheca** (2 erros, de
   campo que o backend antigo não produz). O serviço em execução NÃO foi afetado. Sincronizar o
   backend resolve os dois.
4. **Chamar o diretor** para validar o fluxo inteiro na 3120.

## DEPENDÊNCIA DE RELEASE, MEDIDA DOS DOIS LADOS

O frontend já oferece o movimento de funil para `APROVADO`, `ALOCADO` e `ENVIADO_PARA_ADMISSAO`. Sem
o flip do backend, **4 testes ficam vermelhos** e os cliques falhariam dizendo à pessoa que ela "já
foi encerrada". **Os dois lados sobem juntos ou nenhum sobe.**

## O QUE OS AGENTES PROPUSERAM E NÃO CONSTRUÍRAM

- **`registrarSaida` com `ENVIADO_PARA_ADMISSAO` tem o MESMO buraco do item 3 e ficou aberto:** mandar
  um `DESCARTADO` para a esteira ressuscita a linha morta e pula a ciência de reentrada. É uma linha,
  mas é caminho já validado e fora dos seis itens. A trava 7 **não** cobre, porque os dois lados
  finalizam posição.
- A prova visual do forçamento foi feita **interceptando a resposta no browser**, com o corpo exato
  que o backend monta. Prova a tela contra o contrato, **não ponta a ponta**. A ponta a ponta é o
  passo 2 acima.

## O QUE ESTAVA RODANDO (histórico, já concluído)

Dois agentes, em paralelo, fechando o **VETO da auditoria de segurança** e as lacunas do `tester`:

**Agente `backend`, seis itens:**
1. **O BLOQUEANTE:** `create` e `atualizar` aceitam status terminal (`ENTREGUE`/`FECHADA`/`CANCELADA`),
   então um rascunho é publicado direto como FECHADA, pulando a trava 5, a trava 6, o papel de Master
   e a trilha. Passam a aceitar só `RASCUNHO` e `ABERTA`.
2. `moverEtapa` (`candidatos.service.ts:462`) recusa tudo que não é `ATIVO`, e a frase "já foi
   encerrada" **já mente para o APROVADO em produção hoje**. Vira `!candidaturaViva`.
3. `aprovar` (`candidatos.service.ts:532`) não confere situação nenhuma: aprovar um `ALOCADO` grava
   por cima da entrega e esvazia a posição. Recebe a guarda que `finalizarPosicao` já tem.
4. O log do aceite é grava-e-esquece: `listarHistoricoEtapas` lê os campos do banco e os descarta.
5. Teste da ausência de `@Roles` em `fechar`, pela técnica de `lojas-escrita-aberta.spec.ts`; e o
   caso de forçar com entrega só no banco.
6. O `@IsIn` de `candidatos.dto.ts:245` é a sexta cópia da régua, com a fonte (`SITUACOES_DE_SAIDA`)
   morta: passa a derivar da constante.

**Agente `frontend`, seis itens:**
1. Tratar o 409 `FecharVagaRecusa` casando por `motivo`, nunca por texto.
2. **O forçar do Master, que hoje NÃO EXISTE NA TELA** (`grep` por `forcar` no frontend: zero).
3. Mostrar a trilha do forçado (`fechamentoForcado`, hoje lido por ninguém).
4. Mostrar o aceite no histórico: **o modal promete que ele fica lá, e não fica**.
5. Tirar `FECHADA` e `CANCELADA` do seletor de status (a porta que originou o veto).
6. Virar `as-vaga-acoes.spec.ts:113`, que cimentou a régua ERRADA como se fosse requisito.

**Se a sessão caiu no meio:** confira `git status` e o gate. Se algum arquivo ficou pela metade,
restaure aquele arquivo específico da salvaguarda e redespache o item.

## AS TRÊS CONDIÇÕES DE SUBIDA (medidas, não opinião)

1. **A migration 0098 e o restart do backend andam JUNTOS.** A listagem faz join com
   `fechamento_forcado_por_id`; sem a migration, **toda a Central de Vagas cai em 500**, não só o
   forçamento.
2. **O build antigo não sobrevive ao rename de `CONTRATADO`.** Não há rollback só do serviço.
3. **Conferir o log do boot depois do restart**, pela condição que a auditoria pôs na rodada anterior.

## DECISÕES DO DIRETOR JÁ TOMADAS (não redecidir)

- `ALOCADO` preenche a posição e **continua no funil**; `ENVIADO_PARA_ADMISSAO` é o passo seguinte.
- A vaga só fecha pelas posições **OFICIAIS**; banco não conta; **Master pode FORÇAR**.
- Alocar em banco com oficiais abertas **avisa e não bloqueia**, e o aceite deixa log.
- Vaga **viva** lê a derivada; vaga **encerrada** mantém o congelado.
- O card **Desfecho** fica; as duas abas de candidatos ficam.
- O botão passou a ser **"Enviar para admissão"**.
- A rolagem de 176px da tabela fica **para o fim**.
- O gêmeo do expurgo de CPF é **OST própria** (`docs/PENDENCIA-EXPURGO-CPF-SUBSTITUICAO.md`).

## PENDENTE DO DIRETOR

- Publicar vaga já **Fechada** ou **Cancelada** é fluxo legítimo? (está sendo consertado como se não fosse)
- O **CPF do substituído** viaja na listagem inteira de vagas, sem paginação, para todo mundo com o menu.
- A frase que explica a vaga histórica com número congelado e nenhum candidato.
- Aposentar o ícone de funil, filtros nas tabelas do painel, card "Alocados" próprio.
- Desfazer a finalização (`ALOCADO` de volta para `APROVADO`), que não existe.

## O AMBIENTE, DETALHES QUE CUSTAM TEMPO SE REDESCOBERTOS

- **A conta do harness NÃO abre vaga** (400, "sem papel de A&S"). Para cadastrar, é a conta do diretor.
- **Dois modais renascem e bloqueiam o Playwright.** Use `el.style.display = "none"` nos `fixed` com
  `z-index >= 40`. **Nunca `el.remove()`**: corrompe a árvore do React e a foto sai errada.
- **Nunca rodar `next dev`/`next build` em `apps/frontend`**: destrói o `.next` de produção.
- Buildar a homologação **sempre** com `BACKEND_ORIGIN=http://127.0.0.1:3111`.
- Medir largura de tabela contra o **contêiner**, não contra a janela.
- A 3120 é **compartilhada** (§A.32): outra sessão pode criar vaga ali.
