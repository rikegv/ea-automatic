# DIARIO — EA AUTOMATIC

Registro cronológico das decisões e evidências da construção. Cada entrada explica **o que** foi
feito e **por quê** (rastreabilidade para o diretor e para as próximas sessões).

---

## NORMA DO DIÁRIO (permanente, ler antes de qualquer coisa)

**Este arquivo é a fonte de verdade do estado do projeto, junto com o estado real no disco.** A
memória do coordenador não é fonte: ela morre no fim da sessão e mente entre sessões.

1. **Ler no início de CADA sessão.** Antes de despachar qualquer tarefa, a fábrica lê este diário e
   se reorienta pelo **estado REAL**: `git log`/`git status`, flags em `.claude/state/`, o banco, os
   serviços no ar. O diário diz o que foi feito e por quê; o disco diz o que existe. Divergiu entre
   os dois, **o disco ganha e o diário é corrigido na hora**.
2. **Registro corrido e datado, de TUDO.** Uma entrada por dia/sessão, ao final dela, **antes de
   encerrar**. Não é "só o importante": o registro tem de ser completo o bastante para uma sessão
   futura reconstruir o estado do projeto **só lendo isto**. Cada entrada cobre: o que entrou, o que
   commitou (**com hash**), o que testou, o que o diretor validou, o que ficou aberto, o que travou
   e **por quê**.
3. **Decisão/regra/diagnóstico entra na hora.** Sempre que o diretor ou o coordenador fecha uma
   decisão, define uma regra ou conclui um diagnóstico, grava-se **no momento**, não no fim.
4. **Decisões fechadas não se re-litigam.** Vão para a seção abaixo. Reabrir uma delas exige o
   diretor dizer explicitamente que mudou de ideia.
5. **Entradas novas vão no FIM do arquivo** (ordem cronológica, mais recente por último).
6. **§A.6 vale aqui também:** o diário nunca recebe CPF, nome de candidato, telefone, endereço nem
   URL de documento. Contagens, estrutura e decisões, sim; dado pessoal, não.

*Complementa o `TASKS.md` (backlog por fase, §A.8), que marca O QUE falta. O diário guarda o PORQUÊ.*

---

## DECISÕES FECHADAS (não re-litigar)

> Decididas pelo diretor ou confirmadas por diagnóstico com evidência. Só o diretor reabre.

- **De/para vaga→cliente é MANUAL POR DESIGN.** A API do Pandapé **não expõe** o vínculo vaga→cliente
  (confirmado no swagger oficial e ao vivo em 17/07: `VacancyModel` não tem campo de cliente,
  `/v2/requests` também não; existe base de clientes com CNPJ, mas nenhuma aresta até a vaga). O
  consultor relaciona manualmente. A admissão **entrar incompleta e virar pendência obrigatória é o
  comportamento CORRETO**; adiar sem inventar `cod_cliente` é o certo. Automação é futura, com o
  módulo de Atração & Seleção. **Não é bug, não é escopo, não re-litigar.**
- **CPF não é bloqueador.** Vem de **`GET /v1/Match/Get?idMatch=`** (e `/v2/matches`), não do
  `PreCollaborator/Get`. Provado ao vivo (17/07): 20/20 candidatos reais com `cpf` preenchido, 11
  dígitos sem pontuação; escopo `PandapeApi` já contemplado no token do EA. O `getMatch()` **já
  existe** no código; falta só chamá-lo. A cadeia é: webhook → `IdPreCollaborator` →
  `PreCollaborator/Get` → `IdMatch` → `Match/Get` → `cpf`.
- **Deduplicação carga × webhook: as duas chaves são cegas entre si.** A carga deduplica por
  (cpf + cod_cliente + cargo_id + data_admissao) e **não grava** `idPrecollaborator`; o webhook
  deduplica **só** por `idPrecollaborator`. Não há unique em `admissoes`. **36 CPFs já têm mais de
  uma admissão legítima** (§A.3: um candidato pode ter N admissões), então "um por CPF" não serve de
  regra. **Fechar a dedup JUNTO com o fio do CPF, antes de cadastrar o webhook no painel do Pandapé.**
- **Rotina de push (§A.21).** Diretor validou na tela → gate verde → `git add` **nominal** → commit →
  push. Flag `.claude/state/READY_*` nasce **depois** do gate e da validação e morre após o push. Logo
  e scripts de dados **ficam fora** do commit.
- **Previsão do ASO fora do gate do AGENDADO.** Quem a informa é a clínica, e pode não ter respondido
  no momento do agendamento; exigi-la travaria um exame legitimamente agendado. O gate cobra os **5**
  campos (data, horário, clínica, local, fornecedor).
- **Escala vinculada (escala filtrada por cliente): CONGELADA** por decisão do diretor (§A.22).
- **GO-LIVE do Pandapé FEITO (21/07/2026).** Webhook "EA Automatic" cadastrado no painel, ATIVO, com
  evento "Candidato enviado para admissão", URL `https://soulan.com.br/webpanda/webpanda.php` e
  autenticação por token estático (o painel monta o `Authorization: Bearer`). **Confirmado ao vivo:**
  duas admissões reais chegaram e caíram na Liberação Admissional. O corte temporal do go-live está
  feito e o sistema recebe fluxo vivo. **Não re-litigar** (entrada de 21/07).

---

## 2026-06-29 — Fase 4 AJUSTES FINAIS (OST-EA-FASE-4-AJUSTES-FINAIS) + smoke real do Drive

Branch `feat/fase-4-ia-arquivamento` (working tree). Backend (item 1) pelo coordenador; itens 2–3
(logo do Drive, layout do Kit em 2 colunas) pelo agente `frontend`.

### 1. ASO arquivado no Drive após VALIDADO (backend)
- Ao auditar o ASO e obter **VALIDADO**, o backend arquiva o ASO **na hora** na subpasta ASO do
  prontuário (não espera o fechamento da régua) e **remove o ASO da staging** para não duplicar no
  lote do fechamento. Migration `0010`: coluna `admissoes.drive_aso_url`.
- **Decisão registrada:** criada coluna `drive_aso_url` (em vez de reusar `drive_pasta_url`). Motivo:
  o fechamento da régua usa `drive_pasta_url == null` como guarda; reusar a mesma coluna para o ASO
  impediria o arquivamento do restante. `drive_aso_url` = link do prontuário (o ASO vive na subpasta
  ASO). Exposto na fila e na ficha da Esteira (o front mostra o link quando `drivePastaUrl` OU
  `driveAsoUrl`). Mesmo roteamento por contrato/Fopag; sem pasta-pai mapeada → não arquiva (log).
- Smoke (mock): ASO com nome+CPF conferindo → VALIDADO → `drive_aso_url` setado, ASO sai da staging.

### Smoke REAL do Drive (DRIVE_MOCK=false) — ⛔ BLOQUEIO 2 AINDA ABERTO
O admin (Fernando) confirmou ter compartilhado as pastas com a SA. Liguei `DRIVE_MOCK=false` e rodei
o smoke real (Temporários). Resultado: **criação de pasta OK, mas o UPLOAD falhou com HTTP 403
`storageQuotaExceeded`** — *"Service Accounts do not have storage quota. Leverage shared drives, or
use OAuth delegation."* **Diagnóstico:** as pastas compartilhadas estão num **My Drive** (pasta
comum compartilhada com a SA), não num **Shared Drive (Team Drive)**. A SA cria subpastas, mas não
pode ser dona de bytes de arquivo em My Drive (sem quota) → upload falha. **Ação do diretor/Fernando
(uma das duas):** (a) mover a árvore de pastas para um **Shared Drive/Team Drive** (e atualizar os
folder IDs se mudarem), OU (b) habilitar **delegação de domínio** no Admin do Workspace e definir
`DRIVE_DELEGATED_SUBJECT` (e-mail de um usuário Workspace com quota) — o código já suporta. Revertido
para `DRIVE_MOCK=true` para não quebrar o fluxo da esteira na validação visual. *(Resíduo: o smoke
chegou a criar uma pasta de teste vazia "TESTE Aso Drive — …" sob Temporários no Drive real; como o
sistema NÃO deleta nada (item 6), a limpeza dessa pasta de teste é manual por um admin.)*

### 2, 3 (frontend — agente)
Item 2: logo OFICIAL do Google Drive (SVG inline, sem URL externa — on-prem) no link de prontuário
(linha da aba Auditoria + ficha), tooltip "Abrir prontuário no Google Drive", aparece quando há
`drivePastaUrl` ou `driveAsoUrl`. Item 3: tela do Kit em **duas colunas** — esquerda o formulário +
indicador de processamento; direita painel "Kits gerados" com busca por nome, filtro por data, lista
(candidato/arquivo/data-hora/status), visualizar + download, "Expirado" quando TTL 1h venceu; espaço
reservado para a INT-4 (Clicksign) futura.

### Gates
`pnpm lint` exit 0 · backend `typecheck`/`test` (58) · ai-service `ruff`. Frontend typecheck+build
pelo agente. **PARADA para validação visual (§A.0).** Após o aval: tester + segurança.

---

## 2026-06-29 — Fase 4 AJUSTES VISUAIS (OST-EA-FASE-4-AJUSTES-VISUAIS) — 6 grupos

Branch `feat/fase-4-ia-arquivamento` (working tree). Coordenador fez o backend (itens 4, 5a, 6) e
delegou o frontend (itens 1–5) ao agente `frontend` (dirs disjuntos; dev server parado durante o
build do agente para evitar a corrupção do cache `.next`).

### 6. Auditoria do código do Drive (resposta ao Fernando — deleção acidental)
Auditado `apps/ai-service/app/drive.py` (único módulo que fala com o Drive). **As ÚNICAS operações
são aditivas/somente-leitura**, confirmadas por leitura + `grep` em todo o `ai-service`:
1. **Verificar se a pasta existe** — `files().list` (somente leitura).
2. **Criar pasta** — `files().create` (aditivo).
3. **Fazer upload de arquivo** — `files().create` (aditivo).
(+ `files().get` apenas para ler o `webViewLink` da pasta — somente leitura.)
**ZERO** chamadas destrutivas/mutantes: nenhum `files().delete`, `files().update`, trash/untrash,
`move` (alterar `parents`), `rename` ou `permissions()`. Reforço no código: docstring de `drive.py`
agora declara o CONTRATO DE OPERAÇÕES e proíbe explicitamente operações destrutivas (a revisão deve
vetar qualquer adição). *Nota de escopo:* o escopo OAuth segue `…/auth/drive` (a API do Drive não tem
escopo "criar+ler sem deletar"; `drive.file` quebraria o acesso à árvore de pastas pré-provisionada
em Shared Drive, que a SA não criou). A proteção real é a ausência total de chamadas destrutivas.

### 4. Link do Drive na Esteira (backend)
`GET /esteira/admissao/:id` (ficha) e os itens da fila da Esteira passaram a expor `drivePastaUrl`
(referência da pasta do prontuário, não PII — §A.6). O front exibe o link/ícone na aba Auditoria e
na ficha quando preenchido (após a régua fechar e o arquivamento no Drive disparar).

### 5a. Histórico de kits (backend)
`KitService` mantém um histórico EM MEMÓRIA (sem CPF, §A.6; some no restart, junto com os kits
expurgados por TTL 1h). `GET /kit/historico` → `{items:[{token, admissaoId, candidatoNome,
nomeArquivo, criadoEm, disponivel}]}`. Download ganhou `?inline=1` (abre no navegador) além do
attachment. Smoke: gerar kit → aparece no histórico com `disponivel=true`.

### 1, 2, 3, 5b (frontend — agente)
Tabela do Gerenciador sem truncamento (pills `nowrap` + min-width nas colunas de status; texto
redistribuído) e mesmo tratamento na aba Exame; badge "Pendências Obrig." diferenciado (⚠ + borda
pontilhada, claramente clicável) no Gerenciador e nas 3 abas; ASO com **upload único que já audita**
(removido o botão "Auditar ASO" separado); indicador de processamento destacado no Gerador de Kit.

### DoD do tester (item 5c)
O tester deve validar a geração de kit com um **PDF-mãe de ≥20 páginas** (comportamento com PDFs
grandes — o Gemini pode levar segundos; confirmar o indicador de processamento e o sucesso).

### Gates + parada
`pnpm lint`/`typecheck`/`test` verdes no backend (58); frontend typecheck+build pelo agente. Smokes
de backend OK (histórico, `drivePastaUrl`, auditoria do Drive). **PARADA para validação visual
(§A.0)** — gate fechado, sem `READY_*`. Após o aval: tester + segurança.

---

## 2026-06-29 — Fase 4 COMPLEMENTO (OST-EA-FASE-4-COMPLEMENTO) — 6 ajustes

Branch `feat/fase-4-ia-arquivamento` (working tree). Coordenador construiu o núcleo acoplado
(schema/migration/domínio/serviços/seed) e delegou o frontend ao agente `frontend` (dirs disjuntos).

### 1. Farol global — novos status + transições automáticas
- Enum `farol_global` migrado SEM recriar (preserva dados): `ATIVO`→`EM_ADMISSAO`, `BANCO_PAUSADA`→
  `BANCO_AGUARDAR` (rename migra as linhas), +`ADMISSAO_CONCLUIDA`; default `EM_ADMISSAO`. Migration
  `0009` com `ALTER TYPE ... RENAME VALUE`/`ADD VALUE` (testado em tx no PG16; o SQL gerado pelo
  drizzle-kit, destrutivo, foi substituído pelo rename seguro — snapshot mantido).
- Derivação automática pura `deriveFarolGlobal` (domínio, +4 testes): `BANCO_AGUARDAR` quando
  Auditoria=ANALISE_OK & Exame=APTO & sem `data_admissao`; ao preencher a data → `EM_ADMISSAO`.
  Estados manuais (DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA) são pegajosos (não sobrescritos). Helper
  `recomputeFarolGlobal` chamado após mudança de frente (esteira), conclusão automática da auditoria
  e edição da data (gerenciador). Pills no front: Em Admissão=azul, Banco-Aguardar=cinza, Admissão
  Concluída=verde, Declinou=vermelho, Rescisão=laranja.

### 2. Automação do status de Auditoria
- Ao completar a régua obrigatória, `auditarDocumento` conclui a AUDITORIA (→ANALISE_OK, concluída)
  **sem clique**, faz o nascimento lazy do Cadastro (gate, regra 3) e reavalia o farol. Idempotente.
  Smoke real: 6 obrigatórios ENTREGUE → audita 1 doc → `auditoriaAuto={ANALISE_OK, gateAberto:true}`,
  Cadastro nasceu.

### 3. Auditoria do ASO pela IA (aba Exame)
- Reusa o pipeline de auditoria existente: 3 regras seedadas em `ASO` (nome confere, legibilidade,
  resultado APTO/INAPTO — a 3ª mapeia INAPTO→INCONFORME). Front: botão "Auditar ASO" na aba Exame
  (modal espelhando a aba Auditoria) com badge + motivo. A IA informa; o consultor decide o "Apto".

### 4. Pendências obrigatórias na Esteira
- Badge clicável "Pendências Obrig." nas 3 abas, reusando o `PendenciasModal`/`EditAdmissaoModal`
  (camposFiltro) do Gerenciador. Pendências vêm de `GET /esteira/admissao/:id`.

### 5. Gerenciador mostra TODAS as admissões
- A regra de "sumir quando concluído" é só da Esteira; o gerenciador já listava tudo (confirmado).
  "Data adm." exibe "—" quando nula. BANCO_AGUARDAR aparece com a pill cinza e frentes concluídas.

### 6. Banco-Aguardar — documento de formalização + is_banco
- **Decisão registrada:** coluna `admissoes.is_banco` (boolean, default false). Quando true, a
  ausência de `data_admissao` não é pendência; o **Termo de Banco** (novo TipoDocumento `TERMO_BANCO`,
  roteado p/ subpasta Drive ADMISSAO) passa a ser a pendência obrigatória. `pendenciasObrigatorias`
  estendida (isBanco/termoBancoEntregue, +1 teste). Front: toggle "Admissão de banco" + upload do
  Termo no EditAdmissaoModal. O arquivo-modelo será fornecido pelo diretor.

### Gates + base demo
- `pnpm lint` exit 0 · `typecheck` 3/3 · `pnpm test` (backend 58, frontend 11) · ai-service ruff +
  pytest 31. Smokes via API: BANCO_AGUARDAR (ida/volta), auto-conclusão da Auditoria, contratos de
  leitura (isBanco/pendencias/tipos-documento).
- **Incidente (transparência §A.0):** ao limpar uma admissão de teste, o CPF que escolhi
  (`52998224725`) colidiu com o da demo **Ana Esteira** — o `delete ... where candidato_cpf` removeu
  a admissão real dela. **Recriada** (CPF novo) e levada a concluída (`ADMISSAO_CONCLUIDA`). Lição
  reincidente: usar sempre CPF de teste sabidamente fora da base demo. Base demo final (4): Ana
  (Admissão Concluída), Bruno (Em Admissão — cenário do link do Drive), Carla (Em Admissão), kaa
  (Banco-Aguardar + is_banco — exemplo do item 1/6).
- **PARADA para validação visual (§A.0).** Gate fechado, sem `READY_*`. Após o aval: tester + segurança.

---

## 2026-06-29 — Fase 4: ajustes pós-validação visual (Kit F9, regra do comprovante, demo Drive)

Branch `feat/fase-4-ia-arquivamento` (working tree, não commitado). Correções pedidas pelo diretor
na validação visual, sem nova parada formal — só reconfirmação técnica.

### Bug do Kit (F9) — busca de admissão + HTTP 422 mascarado
- **Busca não listava** (`apps/frontend/.../kit/page.tsx`): o campo só buscava ao digitar e só casava
  por nome de candidato/CPF. Passou a **listar as admissões ao focar** (sem adivinhar nome), filtrar
  ao digitar, e **distinguir erro de busca** (sessão) de lista vazia. Geração F9 provada ponta a ponta
  (Gemini extrai a página do candidato → download).
- **HTTP 422 virava 503** (`apps/backend/src/ai/ai-client.service.ts`): o `ai-client` convertia
  **qualquer** resposta não-OK do ai-service em `503 "Motor de IA indisponível"`, mascarando o **422**
  (erro de ENTRADA acionável: PDF-mãe sem a página do candidato). Agora o **422 é propagado como 422**
  (sem repassar o corpo do ai-service — §A.6), e o front exibe "Nenhuma página do PDF casou com este
  candidato. Confira se enviou o PDF-mãe correto." Smoke: candidato presente → **201** + kit; candidato
  ausente → **422** (antes 503). PDF-mãe de demo (Bruno/Carla/Ana) servido em `/demo-kit-pdf-mae.pdf`
  (em `public/`, **git-ignored** — artefato de demo).

### Regra do comprovante de residência — aceitar titular familiar com aviso
- Antes a IA reprovava comprovante em nome de familiar (o system prompt exigia nome/CPF batendo com o
  cadastro). Agora **aceita titular familiar** (cônjuge/pai/mãe) → **VALIDADO** com aviso literal
  *"Documento em nome de terceiro — consultor deve verificar se é familiar do candidato."* (decisão do
  consultor). Mudou: `gemini.py` (system prompt defere à regra p/ titular diferente), `seed-regras.ts`
  e a linha no `ea-db` (texto idêntico ao da seed → re-seed idempotente). Provado com Gemini real.

### Demo do link do Drive (mock) — cenário pronto
- Admissão **Bruno Pereira (Temporário)** com 5/6 obrigatórios ENTREGUE e o **COMPROVANTE_RESIDENCIA
  INCONFORME** bloqueando. Auditar o comprovante (em nome de familiar) → VALIDADO → **régua 6/6** →
  arquivamento dispara → **link mock do Drive** aparece na esteira (`MOCK-…`) e grava `drive_pasta_url`.
  Ciclo provado via API e **resetado** para reprodução ao vivo (RESERVISTA INCONFORME órfão zerado).

### Evolução registrada (F9 → INT-4) — não implementada
- CLAUDE.md §A.4 F9: ao subir o PDF-mãe, o sistema **identifica automaticamente todos os candidatos**,
  separa **um kit por candidato**, **linka cada kit à admissão** e **dispara o envelope na Clicksign
  por candidato**; a seleção manual atual é substituída pela identificação automática. **Junto com a
  INT-4**, não antes.

### Gates
`pnpm lint` exit 0 · `typecheck` (backend/frontend) · `pnpm test` (backend 53, frontend 11) ·
ai-service `ruff` limpo + `pytest` 31. Servidores no ar (backend :3011 rebuild, frontend :3010,
ai-service :8000 com `DRIVE_MOCK=true`). Gate de deploy fechado (sem `READY_*`).

---

## 2026-06-26 — Ajustes 2B/2C — Marco 3: Pendências + trilha + CLAUDE.md (OST-EA-AJUSTES-2B-2C)

Branch: `feat/ajustes-2b-2c`. Marco 3 de 3 (final) — S1/S2/S3 e a doc.

### CLAUDE.md §A.3 (regras 8/9/10)
Regra 8 — **log de aceite por passagem** (trilha, não penalização). Regra 9 — **gate da IA** mais
rígido que o humano (Fase 4). Regra 10 — **TTL 48h do CPF de substituição** (LGPD).

### S2 — modal de Pendências Obrigatórias
- Helper puro `pendenciasObrigatorias` (domínio, + 2 testes): conjunto fixo Salário, Data de
  admissão, Pacote de benefícios, Cliente, Cargo, Escala. `GET /esteira/admissao/:id` passou a
  retornar `pendencias`.
- Frontend: a pill "Pendências Obrigatórias" do Gerenciador virou **clicável** → `PendenciasModal`
  lista os campos vazios; **"Preencher pendências"** abre o `EditAdmissaoModal` **filtrado** apenas
  nesses campos (prop `camposFiltro`).

### S3 — log de aceite por passagem (trilha permanente)
- Tabela `passagem_aceites` (migration `0007`): admissão, frente, de/para status, campos pendentes
  (rótulos, sem CPF — §A.6), autor, data. Cascade.
- Esteira `mudarStatus`: concluir AUDITORIA/EXAME com campos obrigatórios pendentes da admissão →
  **409 `passagemComPendencia`** (+ campos) se sem `aceitePassagem`; com aceite, grava a trilha no
  tx. Os itens da fila trazem `temPendencias` (o front roteia direto para o aceite). O aceite Via 1/
  Via 2 (régua/ASO) envia `aceitePassagem=true` junto, então **um único aceite** limpa o gate de
  régua/ASO **e** registra a passagem (e cria a NC quando aplicável). `GET /esteira/admissao/:id`
  retorna `passagens` (trilha consultável); exibida no modal de ficha.

### Verificações + smoke E2E
- `lint`/`typecheck`/`test` **verdes** (40 testes: +2 de `pendenciasObrigatorias`). Smoke:
  concluir auditoria com pendências (régua + campos) com `confirmar+aceitePassagem` → ANALISE_OK +
  **NC-1** + **log de passagem** (campos "Salário, Pacote de benefícios, Escala", autor); detalhe
  retorna `pendencias` e `passagens`. Base demo restaurada (4 admissões, nc=0, passagens=0).

### ✅ VALIDAÇÃO VISUAL APROVADA + auditoria da OST inteira (fluxo §A.0)
- **Validação visual do diretor: APROVADA integralmente** — M1, M2 e M3.
- **tester — VEREDITO: PASS.** `install --frozen-lockfile`/`lint`/`typecheck`/`test` exit 0
  (**40 testes**); `nest build` OK; **`next build` limpo OK** (rotas /esteira /gerenciador /nova
  /nao-conformidades compilam — gap fechado após parar o dev). Gate §A.7 ativo (push bloqueado exit
  2). Migrations 0004–0007 aplicadas no ea-db. Regras de domínio cobertas (gate, sinalizador,
  pendênciasObrigatorias, CPF, trilha). Não-bloqueantes: sem e2e das rotas novas (lógica decidível em
  domínio puro testado).
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** **OriginGuard aprovado** (parecer
  dedicado): `/refresh` e `/logout` (cookie) seguem na allowlist; o bypass exige Bearer (não
  auto-enviado pelo browser → sem vetor CSRF); guard antes do Jwt só checa presença; sem
  `enableCors` reforça a defesa. CPF do substituído com TTL 48h + expurgo nula CPF/nome (sem log);
  trilha `passagem_aceites` só rótulos (sem CPF/URL); RBAC correto (POST catálogos + DELETE admissão
  = Master/Super Admin); sem segredo/flag commitada; régua loga só contagens. Não-bloqueantes
  (follow-up): remover fallback morto do cookie `ea_access` no `jwt-auth.guard`; DTO no POST de
  catálogos; avaliar se a trilha/NC deve sobreviver à exclusão da admissão (hoje cascade).

**Liberação:** com os dois avais, criada a flag `.claude/state/READY_ajustes-2b-2c` (local,
git-ignored). Sequência de merges na `main`: `feat/fase-1b-regua` (régua) → `feat/ajustes-2b-2c`
(que já traz a Fase 2B como ancestral; a 2C já estava na main). Em seguida, push de todo o histórico
ao GitHub. Flag removida após o push.

---

## 2026-06-26 — Ajustes 2B/2C — Marco 2: Wizard + catálogos (OST-EA-AJUSTES-2B-2C)

Branch: `feat/ajustes-2b-2c`. Marco 2 de 3 (Wizard + catálogos). Reforma completa do wizard (F6)
com catálogos reais e validação de obrigatórios.

### Backend
- **Schema/migrations 0004–0006** (ea-db): `candidatos.data_nascimento` (W7); `dados_vaga_folha` +
  `substituido_nome/cpf/expurgar_em` (W2); `dados_vaga_folha.escala` → `text` (catálogo é longo);
  tabelas de catálogo `motivos_contratacao`, `beneficios_catalogo`, `escalas_catalogo`.
- **Seed `db:seed:catalogos`** (idempotente): motivos (Substituição, Aumento de demanda); **104
  escalas** (distintas dos clientes — texto livre); **10 benefícios** (base curada). *Decisão: a
  extração atômica de `beneficios_padrao` é impraticável (valores monetários embutidos), então o
  catálogo de benefícios nasce curado e o admin estende; escala usa as strings reais.*
- **Endpoints** `/catalogos/{motivos,beneficios,escalas}` — GET autenticado; **POST só Master/Super
  Admin** (admin estende o catálogo).
- **W6 — gate de aceite no `POST /admissoes`**: campos obrigatórios (salário, escala, benefícios,
  tipo de contrato, tempo de contrato, data de nascimento, telefone, e-mail; + nome/CPF do
  substituído quando motivo=Substituição). Com pendência e sem `aceitePendencias` → **409
  `needsAceite` + `camposPendentes`** (não impede — F4; exige aceite explícito). O **log permanente**
  do aceite é da esteira (S3, marco 3).
- **W2 substituição + TTL**: persiste nome/CPF do substituído e `substituicao_expurgar_em` = now+48h
  (placeholder até a assinatura/INT-4). **`ExpurgoService`** (sweep in-process a cada 1h + no boot)
  nula CPF/nome ao vencer o TTL (§A.6 — minimização/descarte). *Decisão: sweep in-process sem dep
  extra; BullMQ fica reservado à fila do Pandapé (Fase 5).*

### Frontend (wizard)
- **W5** tipo de contrato — 6 valores fixos (Temporário/Terceirizado/Estágio/Interno/Fopag/Jovem
  Aprendiz). **W4** escala — `Select` com busca do catálogo (pré-seleciona o padrão do cliente).
  **W3** benefícios — **`MultiSelect`** (novo componente) do catálogo (chips + busca). **W2** motivo
  — `Select` do catálogo; "Substituição" revela nome+CPF do substituído (obrigatórios). Em
  escala/benefícios/motivo, **admin** vê "Adicionar 'X'" (cria no catálogo e seleciona).
- **W1** checklist da régua **recolhido por padrão** (resumo "X obrigatórios, Y facultativos" +
  "Ver documentos"/"Recolher"); documentos **ordenados** (obrigatórios primeiro, depois facultativos,
  alfabético). **W6** campos com `*`; ao confirmar com pendência, modal de aceite. **W7** data de
  nascimento calcula idade em tempo real; **aviso destacado de menor de idade** (não bloqueia).

### Verificações + smoke E2E
- `lint`/`typecheck`/`test` **verdes** (38). Smoke: catálogos (motivos 2/benefícios 10/escalas 104);
  POST sem obrigatórios → **409 needsAceite** com 8 campos; POST com aceite + Substituição → criada,
  substituição persistida com `expurgar_em` +48h; **job de expurgo** (TTL forçado ao passado +
  restart) **descartou CPF/nome** e logou. Admissão de teste expurgada (base demo = 4).

### Correção pós-validação parcial — OriginGuard bloqueava o "Adicionar" do admin (§A.2/§A.6)
Bug: o admin clicava em "Adicionar 'X'" no select de benefícios/escala/motivo e nada era criado.
**Causa:** o `OriginGuard` retorna 403 em métodos mutantes quando o `Origin` não está na allowlist
(`localhost:3010`). O diretor acessa por **túnel/ZeroTier** (Origin ≠ localhost), então TODO POST era
bloqueado (GET passa — o guard ignora métodos seguros) e o `addCatalogo` falhava em silêncio.
**Correção (revisar na auditoria de segurança):** o `OriginGuard` agora libera métodos mutantes
**autenticados por Bearer token** em qualquer origem — o token vive em memória do front e o browser
não o auto-envia, logo não há vetor de CSRF (um atacante cross-site não consegue anexá-lo). O fluxo
**cookie** (ex.: `/refresh`) continua exigindo a allowlist. Comprovado: Bearer+Origin-de-túnel → 201;
sem Bearer+Origin-de-túnel → 403. Front: `addCatalogo` passou a surfaceiar erro (não falha em
silêncio). lint/typecheck/test verdes (38).

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0) — Marco 2
Servidores no ar (backend :3011, frontend :3010). Aguardando **aprovação visual do diretor** do
wizard (W1–W7) + os catálogos. **Commit na branch**; gate fechado, sem `READY_*`. Depois, **M3
(Pendências + trilha + CLAUDE.md)**.

---

## 2026-06-26 — Ajustes 2B/2C — Marco 1: Sistêmico + Gerenciador (OST-EA-AJUSTES-2B-2C)

Branch: `feat/ajustes-2b-2c` (a partir de `feat/fase-2b-gerenciador`). **Decisão do coordenador
(ordem de merge):** as branches em fila merge na sequência `1b-regua → 2b-gerenciador → ajustes`,
cada uma após sua auditoria; esta OST estende o Gerenciador (2B) e o wizard, então nasce sobre a 2B.
Entrega em **3 marcos validados** (definido com o diretor): **M1 Sistêmico+Gerenciador** (este),
depois M2 Wizard+catálogos, depois M3 Pendências+trilha+CLAUDE.md.

### M1 — o que foi feito
- **G1 — Select estilizado em todo o sistema + z-index.** `Select` reescrito: dropdown em **portal**
  (`position: fixed`, `z-60`) que **sobrepõe qualquer bloco** (não é cortado por `overflow`/stacking)
  e usa `--surface-2` (opaco). Substituídos TODOS os `<select>` nativos restantes: wizard (cargo) e
  admin/régua (cliente, cargo, exigência por linha). Não resta `<select>` nativo no sistema.
- **G2 — busca interna.** O `Select` abre com campo de pesquisa (auto quando >8 opções) que filtra a
  lista em tempo real (sem acento/caixa). Atende cliente/cargo/exigência e os longos do wizard (M2).
- **G3 — fundo dos modais no tema claro.** Novo componente `Modal` (portal, overlay + painel
  `glass` com `--surface-2`) — superfície limpa do DS no tema claro (corrige o "cinza de sistema").
  **6 modais migrados:** ficha (olho), ConfirmDialog, AceiteLiberacao, EditAdmissao, Liberação e
  RegistrarNC. Selects internos (z-60) sobrepõem o modal (z-55).
- **G4 — sidebar recolhível + congelável.** Botão de setas recolhe para ícones (label vira tooltip);
  passar o mouse expande temporariamente; **fixar/desafixar** congela expandido. **Decisão técnica:**
  preferência persistida em **localStorage** (`ea-sidebar-pinned`) — mesmo padrão do tema, sem
  backend. *(A expansão por hover é in-layout — transição de largura 200ms; overlay fica como refino
  futuro se o diretor preferir.)*
- **G4a — 3 colunas de frente no Gerenciador.** Auditoria/Exame/Cadastro com o status real como pill
  (Cadastro mostra "—" enquanto não nasce — gate). Backend: `GET /admissoes` enriquece cada linha
  com os status das frentes (+ rótulo do catálogo). Tabela passou a rolar horizontalmente (11 colunas).
- **S1 / G4b — "Sinalizador" → "Pendências Obrigatórias".** Renomeado no Gerenciador (coluna +
  filtro), no modal de ficha e no wizard. *(O modal de pendências (S2) e o log de passagem (S3) são
  do M3.)*

### Verificações + smoke
- `pnpm lint`/`typecheck`/`test` **verdes** (38). `next build` OK. Smoke: `GET /admissoes` traz as 3
  frentes por linha (Ana: Análise OK / Apto / Integração; demais com Cadastro "—").
- **Operacional:** rodar `next build` com o `next dev` no ar corrompe o cache `.next` (erro
  "Cannot find module './NN.js'"). Mitigação: limpar `.next` e reiniciar; não buildar com o dev ativo.

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0) — Marco 1
Servidores no ar (loopback): backend :3011, frontend `pnpm dev` :3010. Aguardando **aprovação visual
do diretor** do M1 (selects estilizados/busca em todo o sistema, modais com fundo correto no tema
claro, sidebar recolhível/congelável, 3 colunas de frente no gerenciador, renome). **Commit na
branch**; gate fechado, sem `READY_*`. Após o aval, sigo para **M2 (Wizard + catálogos)**.

---

## 2026-06-26 — Fase 2B: Gerenciador de Admissões (OST-EA-FASE-2B)

Branch: `feat/fase-2b-gerenciador` (a partir da `main`, que já tem o 2C; **independente** da branch
da régua). Escopo: dar lógica real à casca do Gerenciador (F10) — tabela de admissões com
paginação, busca global, filtros acumulativos (F7), KPIs-filtro, edição e deleção.

### O que foi construído
**Backend** (`apps/backend/src/admissoes/`, sem migration — tabelas já existiam):
- `GET /admissoes` — lista **paginada** (page/pageSize, server-side) com filtros acumulativos
  (busca `q` nome/CPF, cliente, cargo, tipo de contrato, farol, sinalizador, período de/até),
  **KPIs** (total/ativos/concluídos/declinados) calculados sobre o conjunto base (sem o filtro de
  farol/concluído, p/ funcionarem como botão de filtro) e `tiposContrato` distintos (alimenta o
  Select). CPF nunca é retornado na lista (só filtra). "Concluído" = existe frente
  CADASTRO_CONTRATO concluída (processo finalizado) — via `EXISTS` parametrizado.
- `GET /admissoes/:id` — campos editáveis (prefill do formulário).
- `PATCH /admissoes/:id` — edita vaga/folha + contrato/data/matrícula/farol; **recalcula o
  sinalizador** (F5) com os novos valores; **NÃO** altera CPF nem cod_cliente (identidade — §A.3).
- `DELETE /admissoes/:id` — `@Roles("MASTER","SUPER_ADMIN")`.

**Frontend** (`apps/frontend`):
- `gerenciador/page.tsx` reescrita: 4 KPIs clicáveis (filtro radio-like), busca global em tempo
  real (debounce), filtros (cliente autocomplete, cargo/contrato/farol/sinalizador via `Select`,
  período), tabela com paginação (prev/próxima), pill de farol e de sinalizador, ações por linha
  (olho → `AdmissaoDetalheModal` reusado; lápis → `EditAdmissaoModal`; lixeira → `ConfirmDialog`,
  **só para Master/Super Admin**).
- `components/gerenciador/EditAdmissaoModal.tsx` (novo). Pill **azul** (`.pill.in` / tom `in`) p/ o
  farol ATIVO e ícone `trash` adicionados ao DS.

### Decisões de implementação (dentro do escopo)
- **Deleção = HARD DELETE.** As FKs em cascata (vaga/folha, documentos, frentes, eventos, NCs,
  integração Pandapé) removem os filhos. Confirmação obrigatória avisa que remove os vínculos.
  **Restrita a Master/Super Admin** (ação destrutiva; botão só aparece para admin no front e o
  guard barra no back). Soft delete fica como evolução futura.
- **Farol → pill:** ATIVO azul (`--accent`), DECLINOU vermelho, RESCISÃO laranja (`--warn-2`),
  BANCO_PAUSADA cinza — conforme a OST.
- **KPI "Concluídos"** mapeado para CADASTRO_CONTRATO concluída (não há valor de farol "concluído").

### Verificações + smoke E2E
- `pnpm lint`/`typecheck`/`test` **verdes** (38). `next build` OK (`/gerenciador` 5.73 kB).
- Smoke via API: lista paginada + KPIs `{total:4, ativos:4, concluidos:1, declinados:0}` +
  tiposContrato; prefill; **edição persiste** (centroCusto/salário) e recalcula sinalizador;
  filtro `concluido=true` → Ana Esteira; busca `q=Ana`; **RBAC do delete: COMUM → 403**; delete
  real (admissão descartável) com **cascata confirmada** (frentes/docs/vaga → 0). Dados de smoke
  expurgados. *(Incidente: o CPF de teste que escolhi colidiu com o de "Ana Esteira" (demo); a
  limpeza removeu a admissão dela — recriada e restaurada ao estado concluído; base demo de volta a
  4 admissões.)*

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0)
Servidores no ar (loopback): backend :3011, frontend `pnpm dev` :3010. Aguardando **aprovação
visual do diretor** do Gerenciador com dados reais (tabela, busca, filtros/KPIs-filtro, edição,
deleção, modal de ficha). **Commit na branch**; gate fechado, sem `READY_*` — flag/merge só após
auditoria tester+segurança.
## 2026-06-26 — Fase 1B: Carga da Régua Documental (OST-EA-FASE-1B-REGUA)

Branch: `feat/fase-1b-regua`. Escopo: carregar a régua documental real por (cliente+cargo+tipo),
garantindo os cargos reais no catálogo, e verificar o preview da régua no wizard (F1). CSV movido
(`git mv`) para `apps/backend/src/db/data/regua-documentos-carga.csv` (4.011 linhas).

### Análise do dado (parser CSV real — há vírgulas em campos com aspas)
- **41 clientes, 167 cargos distintos, 187 pares cliente+cargo, 21 tipos de documento, 4.011 linhas**
  (exigências: OBRIGATORIO 2.554 · NAO_OBRIGATORIO 1.456 · FACULTATIVO 1).
- *Nota:* a OST citou "202 cargos"; o dado real tem **167** cargos distintos. Adotado o dado.

### Decisões de implementação (dentro do escopo — AUTORIZAÇÃO TOTAL)
- **Mapeamento dos 21 tipos:** os nomes do CSV são a **base de documentos real** (§A.3) e não batiam
  1:1 com os 21 tipos *placeholder* seedados na Fase 1A. Mapa explícito CSV→TipoDocumento em
  `seed-regua.ts`: **13 reaproveitam** o tipo existente (RG, CPF, CTPS, CNH, PIS→PIS_PASEP,
  RESERVISTA, FOTO_3X4, TITULO_ELEITOR, COMPROVANTE_RESIDENCIA, ESCOLARIDADE→COMPROVANTE_ESCOLARIDADE,
  CONTA BANCÁRIA→DADOS_BANCARIOS, CERTIDÃO NASC. DEPENDENTE→CERTIDAO_NASCIMENTO_FILHOS, VACINAÇÃO
  DEPENDENTE→VACINA_FILHOS) e **8 são criados** (NASCIMENTO OU CASAMENTO, CPF DEPENDENTE, CURSO
  COMPLEMENTAR, BANCO EXCLUSIVO, CARTÃO DE TRANSPORTE, CARTÃO SUS, FORMULÁRIO DE VT, VACINA
  FUNCIONÁRIO). Reaproveitar evita duplicar tipos equivalentes; não destrói os tipos placeholder
  restantes (ASO etc. seguem para o exame/usos próprios).
- **Cargos:** upsert por `nome` de todos os 167 distintos (catálogo próprio §A.3); não duplica os 3
  cargos de seed-demo (nomes distintos). Falha cedo se houver tipo/exigência fora do esperado.

### O que foi construído
- Loader `apps/backend/src/db/seed-regua.ts` (dep `csv-parse`, já presente), script `db:seed:regua`.
  Garante os 21 tipos (8 novos), upserta cargos, e faz **UPSERT da régua por (cod_cliente + cargo_id
  + tipo_documento_id)** com `excluded.exigencia`. Loga só contagens + cod_cliente (§A.6 — sem dado
  pessoal). Régua de cliente ausente da tabela `clientes` é **pulada (FK)** e reportada.
- **Carga:** 21 tipos garantidos (8 novos) · 167 cargos (167 novos) · **3.654 registros de régua /
  174 pares** carregados. **Idempotente comprovado** (2ª execução: 0 inseridos, 3.654 atualizados).
  Total no ea-db com o demo: régua 3.674 / 176 pares / cargos 170 / tipos 29.

### ⚠️ Lacuna de dado a destravar pelo diretor (não bloqueia o núcleo)
- **294 registros pulados** — 5 `cod_cliente` do CSV **não existem na tabela `clientes`** (não vieram
  na carga dos 114): `53721` (NSK, 63), `56924` (RAIA CAGC CORIFEU, 63), `57252` (RAIA CAGC FREI
  CANECA, 42), `54981` (ALCOOL FERREIRA, 21) e `solicitar` (GARRETT, 105 — **valor-lixo/placeholder**
  no CSV de origem). Por isso o total real é **174 pares / 3.654 registros**, não os 187 / 4.011 do
  DoD. **Ação do diretor:** acrescentar os 4 clientes reais à base (e revisar o `solicitar`) e
  **re-rodar `db:seed:regua`** (idempotente) — preenche a lacuna sem retrabalho.

### Verificações + smoke
- `pnpm lint`/`typecheck`/`test` **verdes** (38 testes; sem mudança de código de API — só seed/dados).
- Smoke do preview F1 (wizard) com par real via API autenticada: `/catalogos/cargos` → 170;
  `/catalogos/regua?codCliente=55865&cargoId=<AJUDANTE GERAL>` → **21 documentos** com exigências
  (10 OBRIG · 10 NAO_OBRIG · 1 FACULT) e os 8 tipos novos mapeados. Shape `{tipoDocumentoId, codigo,
  nome, exigencia}` é o que o wizard da Fase 2A já consome — **nenhuma mudança de frontend**.

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0)
Servidores no ar (loopback): backend :3011, frontend `pnpm dev` :3010. Aguardando **aprovação visual
do diretor** do wizard (Nova admissão) mostrando o checklist real ao selecionar cliente+cargo (ex.:
cliente `55865`/PETZ + cargo "AJUDANTE GERAL"). **Commit na branch** (preserva o trabalho); gate
fechado, sem flag `READY_*` — flag/merge só após auditoria tester+segurança.

---

## 2026-06-26 — Fase 2C (continuação): Ajustes da Esteira + Tela de Não Conformidade

Branch: `feat/fase-2c-esteira` (mesma da 2C; **working tree, sem commit** — aguardando validação
visual). A lógica principal da 2C (faróis, gate contínuo, reversão) já fora aprovada pelo diretor;
esta continuação aplica os 8 ajustes da validação visual e adiciona a tela de Não Conformidades.

### 8 ajustes da Esteira
1. **Sumir ao concluir** — itens com a frente concluída (auditoria=ok / exame=apto / cadastro=
   integração) saem da fila principal e dos KPIs (backend filtra `concluida=false`). Continuam
   acessíveis pela busca por candidato (item 3) ou filtrando pelo próprio status de conclusão.
2. **Aceite "apto sem ASO"** — `EXAME→APTO` sem ASO anexado retorna **409 `reason: aptoSemAso`**;
   o front exige aceite explícito (termo fixo). O aceite É o gatilho da **NC-2** (registra autor,
   data e termo). Bloqueia até o aceite (única exceção ao não-bloqueio — é aceite, não trava).
3. **Busca por candidato** — filtro `q` (nome ou CPF) em todas as abas; CPF casa por dígitos.
4. **Visualização rápida** — ícone de olho por linha abre modal **somente leitura**
   (`GET /esteira/admissao/:id`): candidato (nome/CPF/tel/e-mail), cliente, cargo, status das três
   frentes, checklist de documentos (exigência+estado) e sinalizador. Sem edição.
5. **KPIs como filtro** — clicar num KPI de status filtra a aba por aquele status (toggle).
6. **"Na frente" → "Total na fila"** em todas as abas.
7. **Laranja para "Aguardando reenvio"** — novo token `--warn-2` (#ea580c claro / #f97316 escuro),
   pill `.pill.or` e KPI, distinguindo de "Análise pendente" (amarelo).
8. **Seletores estilizados** — novo componente `Select` (botão `.ds-select` + popover glass) que
   substitui o `<select>` nativo (cujo dropdown herdava o cinza do SO no tema escuro). Usado nos
   filtros e na operação de status por linha.

### Tela de Não Conformidades (menu novo em Operação, abaixo de Esteira)
- Acessível a **todos os consultores** (visão de gestão, §A.3). Só a **decisão** da liberação por
  diretoria exige supervisão (`@Roles(MASTER, SUPER_ADMIN)`).
- **Modelo de duas vias:** Via 1 (NC comum — penaliza o consultor que **gerou** a admissão) e Via 2
  (liberação por determinação da diretoria — `flag + motivo` → supervisão aprova/reprova; aprovada
  é exceção reconhecida, **não penaliza**; reprovada volta à Via 1).
- **3 gatilhos:** **NC-1** auditoria concluída com obrigatórios pendentes (automático, não bloqueia);
  **NC-2** exame apto sem ASO (gatilho = o aceite do item 2); **NC-3** cadastro incompleto (3 flags
  **manuais**: sem kit / sem assinatura / "realizado" não marcado — kit/assinatura são F9/INT-4,
  detecção automática fica para quando existirem). Registro manual de NC-3 pela própria tela,
  buscando a admissão na frente de Cadastro.
- **Resolver** fecha a NC mantendo o **registro no histórico** (a NC resolvida ainda penaliza — a
  gestão vê quantas vezes o consultor liberou com inconformidade). **Contador penalizante por
  consultor** visível na tela (clicável = filtro).

### Decisões de implementação (dentro do escopo)
- **`admissoes.consultor_id`** (nullable, FK usuarios) — capturado do usuário autenticado no
  `POST /admissoes`; é a base da atribuição da Via 1. Admissões anteriores à 2C ficam sem consultor
  (NC mostra "—"). Migration aditiva `0003_massive_shatterstar` (também cria `nao_conformidades` +
  enums `nc_tipo`/`nc_status`/`nc_liberacao`), aplicada no ea-db.
- **Trilha sensível (§A.6):** `nao_conformidades` referencia a admissão por id; **sem CPF/URL**;
  aceite NC-2 guarda autor+data+termo (mecânica do aceite de dupla correção). Idempotência por
  `unique(admissao_id, tipo)`.
- `ApiError` passou a carregar o corpo do erro (para o front distinguir `reason` do 409).

### Verificações (pré-validação) + smoke E2E
- `pnpm lint` / `typecheck` / `test` **verdes** (38 testes: backend 32 — inclui **+5** de
  `nao-conformidade.spec.ts` — frontend 1, shared-types 5). `nest build` e `next build` OK
  (**14 rotas**, `/nao-conformidades` presente). Lockfile inalterado.
- Smoke via API (servidores loopback): NC-1 nasce ao concluir auditoria com 5 obrigatórios
  pendentes; `EXAME→APTO` sem ASO → **409 aptoSemAso**, com aceite → **NC-2** (termo gravado);
  item 1 confirmado (candidato some da fila e reaparece na busca `q`); ciclo da Via 2
  (solicitar→aprovar = não penaliza) e resolver (mantém histórico/penaliza) OK; NC-3 manual OK;
  detalhe (item 4) retorna ficha completa. **Dados de smoke expurgados** — base demo restaurada
  ao original (nc=0, eventos=15, frentes=10; kaa/Carla nos status originais).

### Ajustes finais (3, pós-validação parcial)
1. **Data de admissão** — coluna "Data adm." (campo `admissoes.data_admissao`, formatado dd/mm/aaaa
   por partes p/ não sofrer fuso) em todas as abas da esteira e na tela de NC; e campo no modal de
   ficha (item 4). *Obs.: a OST chamou de `data_admissao_prevista`; não existe tal coluna — é o
   mesmo `data_admissao` do wizard (data prevista). Usado o campo existente, sem duplicar.*
2. **Via 1/Via 2 integrada no aceite** — todo aceite de liberação com pendência (apto sem ASO,
   auditoria incompleta, cadastro incompleto) agora abre o modal com a escolha "Esta liberação foi
   a pedido da diretoria?": **Não** → NC penalizante (Via 1); **Sim** → motivo **obrigatório**
   (botão desabilitado sem ele) → NC nasce `liberacao_status=PENDENTE` (aguardando supervisão),
   não penaliza até a decisão. Conectado ao fluxo de aprovação Master/Super Admin já existente.
   Concluir Auditoria com obrigatórios pendentes passou a exigir aceite (409 `auditoriaIncompleta`),
   simétrico ao "apto sem ASO" — a esteira sinaliza o caso por `obrigatoriosPendentes` no item.
3. **Modal de ficha** — data de admissão confirmada no modal do ícone de olho.

Verificações: `lint`/`typecheck`/`test` **verdes** (38). Smoke E2E do novo fluxo: `AUD→ANALISE_OK`
sem aceite → **409 auditoriaIncompleta**; Via 2 sem motivo → **400**; Via 2 completa → **NC1
PENDENTE** (situação "aguardando supervisão", penaliza até decidir); admin **aprova** → não
penaliza; data de admissão presente nas respostas de esteira/NC/detalhe. Base demo restaurada a um
estado **limpo e consistente com o gate** (nc=0, frentes=9; Ana em cadastro; Bruno/Carla/kaa nas
filas — Carla/Bruno sem ASO p/ exercitar o aceite).

### ✅ VALIDAÇÃO VISUAL APROVADA + auditoria da fábrica (fluxo §A.0)
- **Validação visual do diretor: APROVADA** — data de admissão nas abas e no modal; Via 1/Via 2
  integrada no aceite com motivo obrigatório; fluxo de aprovação Master conectado. A interpretação
  de `data_admissao` (campo existente, sem duplicata) foi **ratificada pelo diretor**.
- **tester — VEREDITO: PASS.** `pnpm install --frozen-lockfile` (lockfile consistente),
  `lint`/`typecheck`/`test` exit 0 (**38 testes** JS — backend 32, frontend 1, shared-types 5 — +
  ai-service pytest 1), `nest build` e `next build` OK (14 rotas, inclui `/esteira` e
  `/nao-conformidades`). Gate §A.7 ativo (push bloqueado exit 2 sem flag; `git status` exit 0).
  Migrations `0002`/`0003` aplicadas no ea-db (`nao_conformidades` 19 colunas, `consultor_id`,
  enums nc_*). Domínio decidível coberto (esteira/nao-conformidade/frentes/admissao/roles specs).
  Não-bloqueantes: sem testes de integração das rotas de esteira/NC (lógica decidível está em
  domínio puro testado); membro de tipo morto `NcSituacao."REPROVADA"` (cosmético); cobertura de
  front mínima (coberta pela validação visual).
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** Nenhum log de CPF/dado pessoal no
  backend novo; CPF só em resposta autenticada (`GET /esteira/admissao/:id`); filtro `q` é predicado
  `ilike` parametrizado, não persistido/logado. Trilhas `frente_status_eventos` e `nao_conformidades`
  referenciam admissão por id — **sem CPF/URL**. Aceite NC-2 e motivo da Via 2 gravam autor+data
  (trilha consultável, registro permanece após resolver). RBAC: só `PATCH .../liberacao/decisao`
  exige MASTER/SUPER_ADMIN (COMUM barrado); demais rotas operacionais autenticadas. ASO só metadados
  (binário descartado, memoryStorage). DTOs class-validator + ValidationPipe whitelist; sem SQL cru;
  sem segredo/flag commitada; isolamento CentraAtend intacto. Não-bloqueantes: `q` (pode conter CPF)
  viaja em query string de GET — hardening de infra futura (access log da ponte) ou migrar p/ POST;
  `consultorId` nullable em admissões pré-2C (decisão documentada).

**Liberação:** com os dois avais, criada a flag `.claude/state/READY_fase-2c-esteira` (local,
git-ignored) — destrava o gate. Em seguida: commit da branch, merge na `main` e push ao GitHub.
A flag é removida após o push (nunca versionada).

---

## 2026-06-26 — Fase 1B: Expansão do Cliente + carga de 114 clientes (OST-EA-FASE-1B)

Branch: `feat/fase-1b-clientes`. Escopo: expandir a entidade Cliente (autorizado pelo diretor) e
carregar a base real de 114 clientes. Inclui o ajuste do autopreenchimento do wizard (F1).

### Decisões de diretor registradas
- **Expansão do schema do Cliente** além do documento original — autorizada. CLAUDE.md §A.3 atualizado.
- **Coluna `endereco` na `DadosVagaFolha`** — a OST trata endereço como campo de folha, mas a
  `DadosVagaFolha` da 1A não tinha essa coluna (região e empresa são informativos sem persistência;
  só benefícios/escala existiam). Adicionei `endereco` (text nullable) para o prefill de endereço ser
  de fato editável e persistido. Decisão apresentada na validação visual e **ratificada pelo diretor**.

### O que foi construído
**Schema/migration** (`apps/backend/drizzle/0001_icy_hawkeye.sql`, aditiva e nullable — não quebra
seed/dados):
- `clientes` +6 colunas `text`: `empresaGrupo`, `regiao`, `descricaoRegiao`, `beneficiosPadrao`,
  `escalaPadrao`, `enderecoPadrao` (atributos fixos + padrões sugeridos).
- `dadosVagaFolha` +1 coluna `text`: `endereco`.
- `text` (não `varchar`) porque `beneficios_padrao` chega a ~466 chars.

**Carga** (idempotente):
- CSV movido (`git mv`) para `apps/backend/src/db/data/clientes-carga-1b.csv`.
- Loader `apps/backend/src/db/seed-clientes.ts` (dep `csv-parse`, `csv-parse/sync`), script
  `db:seed:clientes`. Upsert por `codCliente` (`onConflictDoUpdate` em todos os campos), strings
  vazias → null. Loga só contagens (§A.6 — nada de CNPJ/razão/endereço).
- **114 clientes carregados**, todos com cnpj E razão social; rodar 2x não duplica (contagem estável).

**Contrato/wizard (F1)**:
- `catalogos.service.ts` `listClientes` expõe os 6 campos novos.
- `create-admissao.dto.ts` + `admissoes.service.ts` aceitam/persistem `vagaFolha.endereco`.
- Frontend `nova/page.tsx`: ao selecionar o cliente, mostra região/empresa (informativos) e
  pré-preenche benefícios/escala/**endereço** a partir dos `*_padrao` — todos editáveis (F4),
  preservando edições do usuário ao trocar de cliente. Aviso sutil de "pré-preenchido".

### Verificações + smoke test
- `pnpm lint`/`typecheck`/`test` verdes (**21 testes**; backend 15, frontend 1, shared-types 5).
  Lockfile mudou pela dep `csv-parse` (consistente com `--frozen-lockfile`).
- Smoke E2E: login → `GET /catalogos/clientes?q=` retorna clientes REAIS com os 6 campos
  preenchidos (null tratado); POST com cliente real + `endereco` → persistido na `dados_vaga_folha`;
  cliente real sem régua → 0 documentos (não-bloqueio, sinalizador PARCIAL). Dados de teste expurgados.
- Banco final: **116 clientes** (114 da carga completos + 2 demo). Migration confere no
  `information_schema` (7 colunas `text`); demo 1001/1002 intactos com colunas novas em NULL.

### Validação visual + auditoria (fluxo §A.0)
- **Validação visual do diretor: APROVADA** (autopreenchimento com cliente real, campos de folha
  editáveis, troca de cliente atualizando padrões; coluna `endereco` ratificada).
- **tester — VEREDITO: PASS.** lint/typecheck/test exit 0; lockfile consistente; migration aditiva
  confirmada no `_journal.json` e no ea-db; carga idempotente provada (2 runs, contagem estável 116);
  114 cods presentes e completos; gate ativo (push bloqueado, exit 2). Não-bloqueante: sem teste
  unitário do mapeamento CSV (projeto sem infra de teste de DB; exercitado E2E na carga real).
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** Loader loga só contagens; CSV versionado
  é dado corporativo (CNPJ PJ/razão/endereço de operação) — **zero CPF/segredo** (varredura confirmou);
  migration não-destrutiva; `listClientes` autenticada sem abertura indevida; sem injeção (Drizzle
  parametrizado). Não-bloqueante: no `catch` do loader, logar `err.message` em vez do objeto completo.

**Liberação:** com os dois avais, criada a flag `.claude/state/READY_fase-1b-clientes` (local,
git-ignored), merge na `main` e push ao GitHub. Flag removida após o push.

### Follow-ups registrados (TASKS.md, não bloqueiam)
- Carga da régua real por (cliente+cargo) — hoje só os pares demo têm régua; clientes reais geram
  admissão com 0 documentos até a régua ser carregada.
- `seed-clientes.ts`: logar `err.message` no catch (recomendação da segurança).
- Teste unitário do mapeamento CSV quando houver infra de teste de DB.

---

## 2026-06-26 — Fase 2A: Wizard de Nova Admissão (F6) — funcional (OST-EA-FASE-2A)

Branch: `feat/fase-2a-wizard`. Escopo: dar LÓGICA REAL ao wizard de cadastro (a casca já existia
e fora aprovada), salvando uma Admissão real no banco. **NÃO** inclui operação dos faróis (2C) nem
o gerenciador em tabela (2B).

### Abertura — follow-ups da casca pagos antes de empilhar
- `seed-demo.ts`: guard `NODE_ENV === "production"` como **primeira** instrução do `main()` —
  aborta com exit 1 antes de qualquer `argon2.hash`/insert/`console.log` de senha dev (§A.6).
- Teste automatizado de RBAC: `apps/backend/src/auth/guards/roles.guard.spec.ts` (6 casos) —
  COMUM→403, MASTER/SUPER_ADMIN→permite, rota sem `@Roles`→permite, usuário ausente→403.

### O que foi construído
**Backend** (sem migration — todas as tabelas já existiam da 1A):
- Módulo `apps/backend/src/admissoes/` (operacional, autenticado, SEM `@Roles` — consultor COMUM
  cria admissão): `POST /admissoes` e `GET /admissoes/candidato/:cpf` (F11, nunca 404, não loga CPF).
- Leituras operacionais em `catalogos` (referência, qualquer autenticado): `GET /catalogos/clientes?q=`,
  `/catalogos/cargos`, `/catalogos/regua?codCliente=&cargoId=` (JOIN régua×tiposDocumento).
- Domínio puro `apps/backend/src/domain/admissao.ts`: `STATUS_INICIAL_FRENTE`
  (AUDITORIA→ANALISE_PENDENTE, EXAME→A_AGENDAR) e `calcSinalizadorPreenchimento` (PENDENTE/PARCIAL/OK)
  — testado em `admissao.spec.ts` (4 casos).
- `POST /admissoes` numa `db.transaction` honrando as regras §A.3: valida CPF (F3, 400 antes do tx) →
  cliente/cargo existem → candidato `onConflictDoNothing` por CPF (regra 6, preserva histórico) →
  sinalizador puro (F5, não bloqueia — F4/regra 5) → admissão (farol ATIVO) → DadosVagaFolha 1:1 →
  frentes AUDITORIA+EXAME (regra 1/F12), CADASTRO_CONTRATO **não** nasce (gate, regra 3) →
  DocumentoAdmissao PENDENTE só para OBRIGATORIO/FACULTATIVO (regra 7, só status).
- `seed-demo.ts` estendido (dev-only, atrás do guard): 2 clientes, 3 cargos, régua de 20 itens —
  o wizard precisava de dados sobre os quais operar (a carga real é a OST 1B).

**Frontend** (`apps/frontend`, fiel ao DS, sem CSS solto):
- `app/(app)/nova/page.tsx` reescrito: wizard de 3 etapas com `components/nova/Stepper.tsx`
  (barra de progresso). Etapa 1 cliente (busca debounce + card-resumo, F1); Etapa 2 cargo +
  preview da régua com pills por exigência + campos da folha (todos opcionais, F4); Etapa 3
  candidato com validação de CPF em tempo real (F3) e alerta de duplicado + "Reaproveitar dados" (F11).
  Tela de êxito com sinalizador (pill, F5), frentes nascidas e nº de documentos.

### Verificações já feitas (pré-auditoria) + smoke test ponta-a-ponta
- `pnpm lint`/`typecheck`/`test` verdes: **21 testes** (backend 15, frontend 1, shared-types 5);
  `next build` OK; ai-service pytest 1 passed.
- Smoke E2E via proxy same-origin (login master demo → catálogos → POST): admissão completa →
  sinalizador **OK**, frentes AUDITORIA+EXAME, 8 documentos; POST incompleto → **PARCIAL** (não
  bloqueia); CPF inválido → **400**; F11 antes `null` / depois candidato+contagem. Conferido direto
  no ea-db: frentes corretas, **sem CADASTRO_CONTRATO** (gate), 8/8 docs PENDENTE, vaga/folha 1:1.
- Dados de smoke test (Maria, João) e cargos de teste expurgados ao final — base demo limpa
  (3 cargos, régua só nos pares válidos).

### Validação visual + auditoria da fábrica (fluxo §A.0)
- **Validação visual do diretor: APROVADA** (frentes paralelas nascendo, gate segurando, sinalizador
  PARCIAL no não-bloqueio, CPF validado, reaproveitamento OK).
- **tester — VEREDITO: PASS.** lint/typecheck/test exit 0; 21 testes; lockfile inalterado; regras de
  domínio cobertas (F3/F4/F5/F12/regra 6/regra 7) por unit + leitura; POST atômico; gate fechado.
  Não-bloqueante: sem teste de integração de DB do `create` (projeto não tem infra pg de teste; lógica
  decidível está em domínio puro unit-testado) — recomendado e2e com testcontainers em fase futura.
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** CPF nunca logado; rotas novas
  autenticadas e sem abertura indevida de administração; guard de produção do seed na ordem certa;
  só status persistido (regra 7); DTO class-validator + ValidationPipe whitelist; sem SQL cru.
  Não-bloqueante: CPF no path do `GET /admissoes/candidato/:cpf` é capturável por log de proxy/ingress
  — migrar para POST-com-corpo numa fase futura (não é violação deste PR).

**Liberação:** com os dois avais, criada a flag `.claude/state/READY_fase-2a-wizard` (local,
git-ignored), merge na `main` e push ao GitHub. Flag removida após o push.

### Follow-ups registrados para fases futuras (TASKS.md)
- e2e do `POST /admissoes` (testcontainers) cobrindo 400/idempotência/contagem de frentes-docs.
- `GET /admissoes/candidato/:cpf` → migrar CPF do path para o corpo (POST) — higiene de log/proxy.

---

## 2026-06-25 — Design System + Fase 2 (casca visual) (OST-EA-DESIGN-SYSTEM)

Branch: `feat/fase-1a-nucleo` (mesma da 1A — ainda sem merge; a casca reestiliza o login da 1A,
audita-se o conjunto). Escopo: **casca visual** sobre a direção aprovada pelo diretor. **NÃO** inclui
lógica de negócio das telas operacionais (wizard real, faróis funcionais, gerenciador com dados reais).

### Fonte de verdade
- Três arquivos de referência criados na raiz (conteúdo exato fornecido pelo diretor):
  `DESIGN-SYSTEM.md` (valores fechados), `prototipo-claro.html` e `prototipo-escuro.html`
  (referência pixel a pixel). Regra-mestre: **reproduzir, não reinterpretar**.

### O que foi construído (`apps/frontend`)
- **Tokens dos 2 temas** em `globals.css` via CSS variables. **CLARO é o padrão** (`:root`);
  ESCURO em `:root[data-theme="dark"]`. Sombras de glass, aurora, gradientes de botão/barra,
  inputs e ícones de KPI/quick/banner todos temáveis. Classes de componente (`.glass`, `.aurora`,
  `.kpi`, `.qcard`, `.banner/.slide`, `.pill`, `.tab`, `.list/.row`, `.ds-input/.ds-table`)
  portadas 1:1 do protótipo no `@layer components`.
- **Toggle de tema com persistência** (`lib/theme-context.tsx`): aplica `data-theme` no `<html>`,
  grava em `localStorage` (`ea-theme`) e tem **script anti-flash** injetado no `<head>` (aplica o
  tema salvo antes da pintura). `next/font` carrega Inter + Manrope como CSS variables.
- **Tailwind** estendido (cores/fontes/raio → tokens), `darkMode` por seletor `[data-theme="dark"]`.
- **Componentes base reutilizáveis** (`components/ui/`): `GlassCard`, `KpiCard`, `Button`
  (primário/secundário), `Pill` (ok/wn/dg/nt), `NavItem`, `Icon` (conjunto SVG portado),
  `Brand`, `Aurora`, `ThemeToggle`, `PageHead`. Nada de estilo solto por tela.
- **Shell** (`components/shell/`): `AppShell` (aurora + sidebar fixa + main rolável) e `Sidebar`
  glass com seções Operação/Administração, rota ativa destacada, rodapé com avatar+nome+papel,
  **Sair** e o toggle de tema. **Cadastros** só aparece para MASTER/SUPER_ADMIN.
- **Rotas** reorganizadas em route group `(app)` com layout-shell + guard de sessão (URLs
  inalteradas; `/admin/*` movido para dentro do shell). Telas:
  - **Início** (`/`): eyebrow+saudação, **banner "Radar da esteira"** (carrossel 5s, setas+dots,
    pausa no hover, insights **MOCK**) e **4 cards** de navegação. **Sem KPIs** (conforme spec).
  - **Análise gerencial** (`/analise`): **6 KpiCards** + painel "Volume de admissões" (gráfico de
    barras). Dados **mock**.
  - **Esteira** (`/esteira`): casca visual dos faróis (abas, KPIs da frente, lista com pills, mock).
  - **Login** reestilizado no novo DS (card glass + aurora + toggle), preservando a auth da 1A.
  - Placeholders de Nova admissão e Gerenciador (texto remetendo à OST funcional).
  - **Admin** (clientes/cargos/régua): **lógica CRUD da 1A preservada**, apenas reskinada para os
    tokens (glass, `.ds-input`, `.ds-table`); layout aninhado só com guard de papel + sub-abas.

### Verificações já feitas (pré-auditoria)
- `pnpm lint` / `typecheck` → **verdes**. `next build` → **13 rotas** geradas (route group OK).
- `pnpm test` → **11 testes verdes** (shared-types 5, backend 5, frontend 1).
- Servidores no ar (loopback): backend :3011, frontend :3010. Smoke: `/`, `/login`, `/analise`,
  `/esteira`, `/admin` → HTML 200; HTML servido confirma `data-theme="light"`, `brand-mark`,
  `ds-input`, `aurora` e o script anti-flash.

### Sincronização com o GitHub
- Remoto `origin` já configurado: `https://github.com/rikegv/ea-automatic.git`. Branch local
  ainda **sem upstream** (não publicada). **Push reservado para depois do `READY_`** (respeita o
  gate §A.7) — enviará todo o histórico (Fase 0 + 1A + esta fase).

### ✅ VALIDAÇÃO VISUAL APROVADA + auditoria da fábrica (fluxo §A.0) — 2026-06-25
A casca visual (login, início, análise, toggle claro/escuro, shell/aurora) recebeu a **aprovação
visual do diretor**. Com o pré-requisito atendido, o conjunto da branch (`4598792` Fase 1A +
`fe21ff8` docs + `0126845` casca) passou pelas duas frentes de auditoria, independentes e em
paralelo:

- **tester — VEREDITO: PASS.** `pnpm install --frozen-lockfile` (lockfile up to date),
  `pnpm lint` / `pnpm typecheck` (shared-types, backend, frontend) e `pnpm test` → **11 testes
  verdes** (shared-types 5 · backend 5 · frontend 1) todos exit 0; ai-service `ruff` "All checks
  passed!" + `pytest` 1 passou. Gate de deploy fechado e funcional (hook amarrado; `git push` →
  exit 2 sem flag, `git status` → exit 0; o próprio Bash do agente foi interceptado). Cobertura
  confirmada: F3 validador de CPF (5 testes), gate do Cadastro / independência / nascimento
  paralelo (`frentes.ts`, 4 testes), RBAC por leitura de guards, 12 entidades no schema (§A.3).
  Não-bloqueantes: RBAC sem teste automatizado (recomendado na Fase 2), regras de domínio das
  Fases 2–4 ainda só em docstring, `StarletteDeprecationWarning` no ai-service.
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** Postura adversarial, nenhuma violação.
  Auth/RBAC: guards globais na ordem throttle→origin→jwt→roles; controllers admin
  (clientes/cargos/régua) com `@Roles("MASTER","SUPER_ADMIN")` → COMUM barrado; `catalogos` GET
  autenticado por decisão documentada (esteira coletiva). JWT HS256 por `getOrThrow`, refresh em
  cookie httpOnly/sameSite-lax/secure-por-env, token em memória no front (sem localStorage). Sem
  segredos hardcoded; `.gitignore` cobre `.env`/`infra/.env`/`.claude/state/READY_*`; nenhuma flag
  commitada; gate intacto. Isolamento CentraAtend intacto (EA em 5433/6380, volume `ea-dbdata`).
  CPF como chave técnica, nunca em log; `documentos_admissao` só status; `integracao_pandape` só
  IDs (sem coluna de URL) — já nasce em conformidade §A.5. Observação menor não-bloqueante:
  `apps/backend/src/db/seed-demo.ts` loga senha dev — adicionar guard `NODE_ENV !== "production"`
  antes da Fase 2 (devolvido ao backend via coordenador).

**Liberação:** com os **dois avais**, criada a flag `.claude/state/READY_fase-2-casca` (artefato
local, git-ignored) — destrava deliberadamente o gate de push. Em seguida: **merge** de
`feat/fase-1a-nucleo` na `main` e **push de todo o histórico** (Fase 0 + 1A + casca) ao GitHub
(`git@github.com:rikegv/ea-automatic.git`, via SSH autenticado). A flag é removida após o push
(nunca versionada).

---

## 2026-06-24 — Fase 1A: Núcleo de dados e acesso — estrutura (OST-EA-FASE-1A)

Branch: `feat/fase-1a-nucleo`. Escopo: esqueleto de acesso + schema + telas de administração
vazias. **NÃO** inclui carga de dados (Fase 1B) nem integrações.

### O que foi construído
- **Auth/RBAC** (`apps/backend/src/auth`): JWT HS256 (access em header `Bearer` + refresh em
  cookie httpOnly `ea_refresh`, path `/api/auth`), **argon2** para senha. Guards globais na ordem
  throttle → origin → autenticação → papel: `ThrottlerGuard`, `OriginGuard`, `JwtAuthGuard`,
  `RolesGuard`. Decorators `@Public`, `@Roles`, `@CurrentUser`. Endpoints: `POST /api/auth/login`,
  `/refresh`, `/logout`, `GET /api/auth/me`.
- **Filosofia de acesso (§A.3):** sem barreira por frente — todo consultor vê tudo. O papel separa
  CONSULTOR (COMUM) de ADMINISTRAÇÃO (MASTER/SUPER_ADMIN). Só as rotas `/api/admin/*` exigem
  `@Roles(MASTER, SUPER_ADMIN)`; catálogos de referência são visíveis a qualquer autenticado.
- **Schema do domínio** (Drizzle, `apps/backend/src/db/schema`): 12 tabelas do §A.3 — usuarios,
  clientes, cargos, tipos_documento, regua_documental (PK composta cliente+cargo+tipo), candidatos,
  admissoes, dados_vaga_folha, documentos_admissao (só status), frentes_admissao (1 linha por
  frente, datas independentes), frente_status_catalogo, integracao_pandape. Enums para papel,
  farol, frente, exigência, estado de documento e sinalizador. Migration `0000_*` gerada e
  **aplicada no ea-db**.
- **Regras de domínio (§A.3):** documentadas e modeladas; o **gate do Cadastro** (regra 3) é função
  pura `podeAbrirCadastro()` em `src/domain/frentes.ts`, com teste.
- **Seed** (`db:seed`): admin inicial (papel SUPER_ADMIN, **senha via env**, nunca hardcoded) +
  **21 TipoDocumento** + **13 status por frente** (catálogo). Seed de demo (dev, `seed-demo.ts`)
  cria usuários COMUM e MASTER para exercitar os 3 papéis na validação.
- **Admin de cadastros** (`apps/backend/src/admin` + `apps/frontend/src/app/admin`): CRUD de
  Clientes, Cargos e Régua Documental (telas prontas, vazias). Restrito a MASTER/SUPER_ADMIN.
- **Frontend** (Next 14 + Tailwind): `/login`, dashboard com visão coletiva, shell de administração
  com guard de papel e as três telas de CRUD. Auth via contexto client + proxy same-origin.

### Verificações já feitas (pré-auditoria)
- `pnpm lint` / `typecheck` / `test` → **verdes** (11 testes: shared-types 5, backend 5, frontend 1).
- Migração aplicada no `ea-db`: 12 tabelas; seed: 1 admin (SUPER_ADMIN), 21 tipos, 13 status.
- Smoke da API (servidores locais, loopback): admin loga e acessa `/admin` (200); **consultor
  recebe 403** em `/admin` mas lê catálogos (200) — visão coletiva; sem token → 401; CRUD de
  cliente/cargo (201), **OriginGuard bloqueia origem não permitida (403)**, régua upsert (200) com
  persistência confirmada.

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0)
Build concluído; servidores locais no ar (backend 127.0.0.1:3011, frontend 127.0.0.1:3010, ambos
loopback). Aguardando **aprovação visual do diretor** das telas (login + administração) ANTES de
despachar para segurança/tester. Gate fechado; nenhuma flag `READY_*`.

### Ponto de situação (handoff) — 2026-06-24

Estado salvo para retomada em outra sessão:

- **Commit de checkpoint:** `4598792` na branch `feat/fase-1a-nucleo` (working tree limpo no
  momento do commit). Ainda **sem merge** e **sem flag `READY_*`** (gate fechado).
- **Infra:** `ea-db`/`ea-redis` no ar (isolados, 5433/6380). Migration `0000` aplicada; seed
  oficial + seed de demo já rodados no `ea-db`.
- **Servidores de validação (loopback):** backend `node dist/main.js` (a partir de
  `apps/backend`, lê `.env`) em :3011; frontend `pnpm dev` (Next) em :3010. Se caírem, reiniciar:
  `pnpm --filter @ea/backend build && (cd apps/backend && node dist/main.js)` e, no front,
  `cd apps/frontend && pnpm dev`. Exposição só por túnel SSH ou interface privada autorizada.
- **Credenciais:** admin@ea.local (SUPER_ADMIN, senha do `.env` `ChangeMe!2026`);
  master@ea.local (MASTER) e consultor@ea.local (COMUM), ambos senha demo `Demo!2026`.
- **Dados de demonstração inseridos** (não-produção, podem ser apagados): cliente `0001`
  "Cliente Demo LTDA", cargo "Atendente Demo", 1 item de régua (1º tipo = OBRIGATORIO).
- **Próximos passos (na ordem):** (1) aprovação visual do diretor; (2) despachar tester +
  segurança; (3) passando, gerar `READY_fase-1a`, registrar aqui e fazer o merge na `main`;
  (4) abrir a OST da Fase 1B (carga de dados).

---

## 2026-06-24 — Fase 0: Fundação (OST-EA-FASE-0)

Branch: `feat/fase-0-fundacao`. Sessão: fábrica (coordenador). Sem dependência externa (§A.8).

### O que foi montado
- **Monorepo pnpm** (Node 20): `apps/backend` (NestJS 10 + TS), `apps/frontend` (Next.js 14 +
  React 18 + Tailwind), `apps/ai-service` (Python 3.12 + FastAPI/uv), `packages/shared-types`,
  `infra/`, `scripts/`, `.claude/`. Configs base: `package.json`, `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.editorconfig`, `.nvmrc` (20),
  `.gitignore`, `.npmrc`.
- **Fábrica de 8 agentes** em `.claude/agents/`: `coordenador` (entrada/despacho), `arquiteto`,
  `backend`, `frontend`, `ia`, `seguranca` (veto, §A.6), `tester`, `devops`.
- **Gate de deploy** (§A.7) — a correção herdada do diagnóstico CentraAtend: `scripts/gate-deploy.sh`
  (executável) NASCE amarrado como hook `PreToolUse` em `.claude/settings.json` (matcher `Bash`).
  Cobre `git push`, `deploy`, `kubectl apply`, `docker push`. Sem flag `.claude/state/READY_*`,
  bloqueia com **exit 2**.
- **Infra Docker isolada** (`infra/docker-compose.yml`): `ea-db` (pgvector/pg16) e `ea-redis`
  (redis:7-alpine), volumes `ea-dbdata`/`ea-redisdata`, rede `ea-automatic`, portas em `127.0.0.1`
  (pg **5433**, redis **6380**), `restart: unless-stopped`, healthchecks, segredos via `infra/.env`
  (fail-fast no compose).
- **CI** (`.github/workflows/ci.yml`): job Node (lint · typecheck · test, pnpm 9 / Node 20) + job
  Python (ruff · pytest). `permissions: contents: read`.

### Decisões de implementação (dentro do escopo do CLAUDE.md)
- **Vitest** como runner único do workspace JS para os smokes da Fase 0 (leve, TS-native,
  CI-friendly). NestJS pode adotar jest depois, se necessário — não impacta a fundação.
- **`@ea/shared-types` via path alias** para o `src` (sem build cruzado na Fase 0): typecheck e
  testes rodam sem ordenar builds. Já carrega vocabulário de domínio (§A.3) + `isValidCpf` (F3).
- **Default agent = coordenador:** o Claude Code não expõe chave em `settings.json` para fixar um
  subagente default; a convenção foi codificada no agente `coordenador` e em `.claude/README.md`.
  O `settings.json` ficou enxuto (apenas o hook), por escolha de não adicionar regras de permissão
  não solicitadas.

### Isolamento (regra dura §A.1) — verificado
- EA: `ea-db`@5433, `ea-redis`@6380, volumes `ea-dbdata`/`ea-redisdata`, rede `ea-automatic`.
- CentraAtend **intocado**: `infra-db-1` e `infra-redis-1` seguem `Up 2 weeks (healthy)`, mesmo
  `StartedAt` (2026-06-05), portas 5432/6379, volumes `infra_dbdata`/`infra_redisdata`, rede
  `centraatend`. Nenhum recurso do CentraAtend foi tocado, e o diretório dele não foi lido.

### Definition of Done — evidências

**1. Monorepo instalável — `pnpm install` OK**
```
Packages: +508 ... Done in 27.2s using pnpm v9.15.9
```

**2. lint · typecheck · test verdes**
```
pnpm lint       → exit 0 (sem erros)
pnpm typecheck  → shared-types / backend / frontend: Done (exit 0)
pnpm test       → 7 testes passando (shared-types 5, backend 1, frontend 1)
ai-service      → ruff: All checks passed! · pytest: 1 passed
```

**3. 8 agentes presentes em `.claude/agents/`**
```
arquiteto.md  backend.md  coordenador.md  devops.md  frontend.md  ia.md  seguranca.md  tester.md
```

**4. TESTE DO GATE — `git push` SEM flag READY_ é BLOQUEADO (exit 2)**
Estado: `.claude/state/` sem nenhuma flag `READY_*` (0 flags). Invocação idêntica à do hook
registrado (`bash "$CLAUDE_PROJECT_DIR/scripts/gate-deploy.sh"`, payload do PreToolUse no stdin):
```
$ echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
    | bash "$CLAUDE_PROJECT_DIR/scripts/gate-deploy.sh"
⛔ [gate-deploy] BLOQUEADO — verbo de deploy/push sem flag de liberação.
   Comando .: git push origin main
   Flag .....: nenhuma em .claude/state/READY_*
   ...
GATE_EXIT_CODE=2
```
Também verificado: `docker push` e `kubectl apply` bloqueiam (exit 2); `git status` libera (exit 0);
com uma flag `READY_*` presente, `git push` libera (exit 0) — a trava é deliberada e reversível.

**5. Containers `ea-db` e `ea-redis` HEALTHY, sem afetar o CentraAtend**
```
ea-redis        redis:7-alpine           Up (healthy)   127.0.0.1:6380->6379/tcp
ea-db           pgvector/pgvector:pg16   Up (healthy)   127.0.0.1:5433->5432/tcp
infra-redis-1   redis:7-alpine           Up 2 weeks (healthy)   127.0.0.1:6379->6379/tcp   ← intocado
infra-db-1      pgvector/pgvector:pg16   Up 2 weeks (healthy)   127.0.0.1:5432->5432/tcp   ← intocado
```

**6. Portas do EA não colidem** — `ss`: EA em 5433/6380, CentraAtend em 5432/6379 (sem conflito).

**Conclusão:** DoD da Fase 0 atendido. Núcleo (Fases 1–3) está liberado para construção; insumos
das Fases 4–6 são pendências do diretor (§A.9), reunidos em paralelo.

### Auditoria da fábrica e liberação (fluxo §A.0)

Após o DoD aprovado pelo diretor, a fundação passou pelas duas frentes de auditoria:

- **tester — VEREDITO: PASS.** `pnpm install --frozen-lockfile` (lockfile up to date),
  `pnpm lint` / `pnpm typecheck` / `pnpm test` (7 testes verdes) e ai-service `ruff` + `pytest`
  (1 passed) todos exit 0. Gate reexecutado: `git push`/`docker push`/`kubectl apply` → exit 2,
  `git status` → exit 0. Hook confirmado em `settings.json`; estado de `.claude/state/` limpo ao
  final. Anomalia não-bloqueante: `StarletteDeprecationWarning` no TestClient do ai-service
  (atualizar stack de teste em fase futura).
- **seguranca — VEREDITO: APROVADO (poder de veto, §A.6).** Postura adversarial, nenhum item a
  corrigir. (A) `infra/.env` ignorado e não versionado; sem segredos hardcoded; sem flag `READY_*`
  commitada. (B) hook do gate amarrado e testado (exit 2 sem flag; exit 0 com flag temporária,
  removida). (C) isolamento total confirmado — EA com recursos próprios, `infra-db-1`/`infra-redis-1`
  intocados (`StartedAt` 2026-06-05), sem colisão de portas/volumes/rede. (D) sem persistência de
  documento/CPF/URL Pandapé; controles §A.6 pendentes para F2/INT-1/INT-4 (esperado).

**Liberação:** com os dois avais, foi criada a flag `.claude/state/READY_fase-0` (artefato local,
git-ignored) — a liberação deliberada que destrava o gate de push para a Fase 0. Em seguida, merge
de `feat/fase-0-fundacao` na `main`. Push não executado nesta etapa (não solicitado); a flag
permite o push quando o diretor decidir.

---

## Fase 4 — Motor de IA + Arquivamento (OST-EA-FASE-4) — 2026-06-28

Branch `feat/fase-4-ia-arquivamento`. Auditoria documental por IA (F2), arquivamento no Drive
(INT-2) e gerador de kit (F9). Construído pela fábrica (arquiteto → ia/backend/frontend/devops em
paralelo, dirs disjuntos), contra contratos congelados em `@ea/shared-types`.

### Correção de segurança imediata
- **`credentials.json` NÃO estava no `.gitignore`** (a OST assumiu que sim). A service account
  estava untracked, a um `git add` de vazar. Adicionado `credentials.json` +
  `apps/ai-service/credentials.json` ao `.gitignore`; confirmado via `git check-ignore`.

### Decisões de arquitetura (arquiteto)
- **Fluxo das regras:** o backend (dono do Drizzle) lê as `regras_auditoria` ativas e as passa no
  payload; o ai-service é **stateless**, não abre conexão Postgres (desacoplamento §A.1).
- **Propriedade do Drive:** o ai-service é o único detentor da credencial Google e o único que sobe
  ao Drive; o backend nunca recebe a credencial. Staging compartilhada por bind-mount do mesmo path
  (host backend ↔ container ai-service).
- **CPF para conferência:** enviado ao ai-service **só** para a chamada do Gemini (a OST §1 exige;
  a imagem do documento já o contém). Nunca logado, nunca persistido, nunca ecoado no `motivo`.
- **Kit (F9):** recorte literal da OST §5 — extrair páginas do candidato + download temporário
  (TTL 1h). **Sem** Clicksign/INT-4 e **sem** gate F12 nesta OST (registrados como futuros; a
  subpasta Drive "ADMISSÃO" fica provisionada para o kit assinado futuro).

### Entregue
- **ai-service** (FastAPI/Vertex Gemini): `POST /auditoria/documento`, `POST /drive/arquivar`,
  `POST /kit/gerar`; auth por `X-Internal-Token`; saída estruturada do Gemini validada contra o
  enum; anti prompt-injection; Dockerfile + `.dockerignore`. 16 pytest (Gemini/Drive mockados),
  ruff limpo.
- **backend** (NestJS): tabela `regras_auditoria` + coluna `admissoes.drive_pasta_url` (migration
  `0008`); seed de 50 regras baseline (CRUD `admin/regras`, MASTER/SUPER_ADMIN); helper de
  completude extraído (`ReguaCompletudeService`, reusado pela Esteira sem mudar comportamento);
  `ai-client` (fetch, sem axios); staging efêmera + purge (sweep 1h: admissão >48h, `_kits` >1h);
  `POST/GET /esteira/auditoria/...`; `POST /kit/:id/gerar` + `GET /kit/download/:token`; roteamento
  Drive por tipo_contrato/Fopag(cod_cliente)/skip. 51 specs verdes.
- **frontend** (Next.js): aba Auditoria com botão "Auditar documento" + spinner + badge
  VALIDADO/INCONFORME/PENDENTE + `motivo`; barra de progresso "X de Y"; aviso "arquivado no Drive"
  com link; CRUD de regras em Administração; página Gerador de Kit. Lint/typecheck/build verdes.
- **infra** (devops): serviço `ea-ai` no compose — interno (sem porta pública), credencial montada
  read-only, staging bind-mount compartilhada; isolamento do CentraAtend preservado. `config` valida.

### Gates (estado integrado)
`pnpm lint` exit 0 · `pnpm typecheck` 3/3 · `pnpm test` 57 (shared-types 5, backend 51, frontend 1)
· ai-service `ruff` limpo + `pytest` 16. (Warning pré-existente `StarletteDeprecationWarning` no
TestClient — não-bloqueante, mesma anomalia da Fase 0.)

### ⛔ Bloqueios para a validação visual (pendências do diretor §A.9 — descobertos por smoke real)
A OST afirmou "APIs habilitadas", mas o smoke real com a credencial revelou:
1. **Vertex AI API desabilitada** no projeto `ea-v2-automatic` (`aiplatform.googleapis.com` →
   `SERVICE_DISABLED`). A SA autentica; o 403 é de serviço desligado. → habilitar a API.
2. **Drive upload bloqueado** por `storageQuotaExceeded`: service account pura não tem cota no
   *My Drive*. Criar/listar/excluir pasta funciona (Drive API ON, SA Editor), mas o **upload de
   arquivo** exige um **Shared Drive** (mover a árvore de pastas para lá) **ou** **domain-wide
   delegation** (impersonar um usuário Workspace — suporte já implementado via
   `DRIVE_DELEGATED_SUBJECT`).

Sem (1) e (2) o fluxo real (upload → auditoria IA → arquivamento Drive) não pode ser demonstrado
de ponta a ponta. Código 100% pronto; refazer os smokes ao destravar.

### Estado / próximo passo
Build completo e verde. **PARADO para validação visual (§A.0 / DoD)** — segurança e tester só
depois do aval visual do diretor. Gate de deploy fechado (sem flag `READY_*`). Pendente: decisão do
diretor sobre os bloqueios 1–2 e sobre validar agora em modo mock vs. após o destravamento.
Nota operacional: em dev a stack roda no host (ai-service em `:8000` para casar com
`AI_SERVICE_URL`; o README cita `:8010` como alternativa).

### Validação híbrida (modo mock do Drive) — 2026-06-28 (continuação)

Diretor optou por subir o stack em **modo híbrido** para a validação visual: **Gemini real**
(Vertex foi habilitada — bloqueio 1 RESOLVIDO) + **Drive em mock** (`DRIVE_MOCK=true`) até o admin
Workspace (Fernando) adicionar a service account como Contribuidor nos Drives Compartilhados
(bloqueio 2 em andamento). Mapeamento completo de pastas do Drive (por `tipo_contrato`; Fopag por
`cod_cliente`; subpastas ASO/ADMISSÃO/BENEFÍCIOS/DOCUMENTOS PESSOAIS) fornecido pelo diretor e
implementado no roteamento do backend.

Ajustes nesta etapa:
- **Reconciliação de contrato:** o backend enviava `pastaPaiId`; o ai-service espera
  `parentFolderId` — alinhado no backend (`ai-client` + `auditoria.service`).
- **Env do backend:** `AI_SERVICE_URL`/`INTERNAL_TOKEN`/`STAGING_DIR` adicionados ao
  `apps/backend/.env` (o backend lê via `@nestjs/config`, não o `infra/.env`).
- **Modo mock do Drive:** flag `DRIVE_MOCK` no ai-service (link fictício, sem chamar o Google).
- **Modelo Gemini:** `gemini-2.0-flash` indisponível em `us-central1` → trocado para
  `gemini-2.5-flash` (autorizado pela OST).
- **Injeção de data atual** no prompt do Gemini (correção): o senso de "hoje" do modelo é o cutoff
  de treino; sem a data injetada, regras relativas a data (ex.: comprovante ≤90 dias) falhavam.
- **Bug do Gerador de Kit (F9):** botão "Gerar kit" não habilitava — exigia seleção da admissão no
  dropdown (o backend chaveia por `admissaoId`). Corrigido: condição extraída para `lib/kit.ts`
  (`podeGerar`) + auto-seleção (`autoMatch`) + helper text. Testes puros em `kit.spec.ts`.

Smokes reais executados (via API, Gemini real): auditoria **VALIDADO** e **INCONFORME** (com
conferência de CPF/nome), progresso da régua, kit F9 (extrai a página do candidato de um PDF-mãe de
3 páginas), e o fluxo **Temporário → régua fecha → link do Drive (mock)** ponta a ponta.

### Auditorias da fábrica (§A.0)
- **tester — PASS.** Gates reconfirmados do zero: `pnpm lint`/`typecheck` (3/3)/`test`
  (shared-types 5, backend 53, frontend 11); ai-service `ruff` + `pytest` (31). Cobertura de domínio
  conferida; preencheu lacunas em `drive-routing.spec.ts` (Fopag completo, skip 42/43/undefined).
  Gate fechado, sem flag.
- **segurança — APROVADO COM RESSALVAS → corrigidas.** Os 5 requisitos rígidos §A.6 passam. Duas
  ressalvas corrigidas e em reauditoria: **R1 (MÉDIA)** path traversal real em
  `ai-service/app/staging.py` (`caminho_staging_seguro` com containment sob `STAGING_DIR`, 400 fora
  da área; cobre os 3 routers); **R2 (BAIXA)** link mock sem PII (`MOCK-{sha256[:8]}`) +
  fail-fast de boot se `DRIVE_MOCK=true` em produção (`APP_ENV`).

### Pendências do diretor remanescentes (§A.9)
- **Drive write (bloqueio 2):** Fernando (admin Workspace) adicionar
  `ea-automatic-sa@ea-v2-automatic` como Contribuidor nos Drives Compartilhados. Ao liberar:
  `DRIVE_MOCK=false`, re-smoke real do upload, sem nova validação visual (só confirmação técnica).
- **Critério oficial de auditoria (regras):** o seed são baselines/placeholders (ex.: a regra de
  CPF no comprovante de residência é estrita demais). O critério real é insumo do diretor, editável
  em Administração → Regras de auditoria.

### ✅ ENCERRAMENTO DA FASE 4 — VALIDAÇÃO VISUAL APROVADA + merge na main — 2026-06-30

**Validação visual do diretor (§A.0): APROVADA.** Ajustes confirmados em tela: ASO arquivado com
logo do Drive, régua automática (completude → ANALISE_OK sem clique), kit em duas colunas com busca
e filtro, logo do Google Drive na esteira e na ficha do candidato.

**Auditorias de fábrica reconfirmadas no fechamento:**
- **tester — VERDE.** `pnpm lint`/`typecheck` (3/3) + `test`: backend 58, frontend 11, ai-service
  `ruff` + `pytest` 31 = **100 testes verdes**, zero alterações de código. Regras de domínio da
  Fase 4 cobertas (completude da régua, gate do Cadastro, `farol_global` derivado/BANCO_AGUARDAR,
  veredito IA → estado, regra 9).
- **segurança — APROVADO.** §A.6 conforme item a item; **item 6 (Drive)** auditado linha a linha:
  `drive.py` faz apenas `files().list/create/get` — **nenhuma operação destrutiva**
  (delete/trash/move/rename/permissions), contrato anti-deleção do Fernando respeitado. Zero PII em
  log (redação de CPF defensiva no `gemini.py`, mock por hash SHA-256). Segredos fora do git e da
  imagem. **Aprovou explicitamente o merge com o smoke do Drive ainda em `DRIVE_MOCK=true`** (o
  bloqueio é de infra/permissão, não de código).
  - **Ressalva MÉDIA (não-bloqueante, follow-up devops antes do go-live real do Drive):** o bloco
    `ea-ai` do `infra/docker-compose.yml` não define `APP_ENV`, então o fail-fast
    `_proibir_mock_em_producao` (`config.py`) fica dormente mesmo na VM. Corrigir definindo
    `APP_ENV=production` no compose produtivo ao habilitar o Drive real.

**Gate de deploy (§A.7):** flag `READY_fase-4-ia-arquivamento` criada deliberadamente após os dois
gates verdes + validação visual; merge `--no-ff` de `feat/fase-4-ia-arquivamento` na `main` e push
ao GitHub. Flag local, nunca versionada (removida após o push).

**Drive real (pendência aberta com o Fernando):** o bloqueio `storageQuotaExceeded` está em
resolução — Opção A (Shared Drive) ou Opção B (domain-wide delegation). Ao liberar:
`DRIVE_MOCK=false` + smoke real do upload, **sem nova validação visual** (só confirmação técnica).

## ✅ FASE 5 — INTEGRAÇÃO PANDAPÉ (OST-EA-FASE-5) — 2026-06-30

**Mudança de modelo (diretor + admin de infra): webhook → verificação periódica (cron-pull).**
O desenho original (A.5/INT-1) previa webhook via ingress público. Adotado job agendado por cron
na VM que consulta a API periodicamente — **elimina a exposição pública do servidor** e dispensa
o ingress da TI (antes pendência §A.9). CLAUDE.md A.5/A.8/A.9 atualizados.

**Pré-requisito ainda pendente (não bloqueou):** `PANDAPE_API_TOKEN` está sendo solicitado pelo
diretor ao suporte Pandapé. Tudo construído para receber o token via env, **sem hardcode**; sem
token a integração fica **pronta porém inerte**. Quando chegar, o diretor configura e um smoke
real é feito sem nova OST.

### O que foi entregue (DoD)
- **Job agendado:** `infra/install-pandape-cron.sh` instala crontab `*/5 7-23 * * *` (a cada 5 min,
  7h–23h, todos os dias; fora da janela não roda) disparando `POST /internal/pandape/tick`
  protegido por `X-Internal-Token`. Script idempotente, não grava o token em claro (expande em
  runtime via `infra/.env`). A instalação na VM é ação deliberada (script entregue, crontab não
  instalado pela fábrica).
- **Cliente da API (backend, `apps/backend/src/pandape/`):** `PandapeApiService` (Bearer via
  `PANDAPE_API_TOKEN`, `GET /v3/precollaborators/{id}`, listagem de mudanças, `getVacancy` para
  cliente/cargo). `estaAtivo()` falso sem token → no-op, `fetch` nunca chamado.
- **Fila BullMQ/Redis cabeada de verdade** (uso reservado desde a Fase 4): `ea-redis` db 1 +
  prefix `ea:bull` (isolado), worker `concurrency:1` + `limiter {max:800, duration:5min}` (folga
  sob o teto 1.000/5min compartilhado, §A.5) + backoff exponencial (5 tentativas).
- **Idempotência** (índice unique `uq_integracao_pandape_precollab`, migration `0011`): novo
  `IdPreCollaborator` → cria Candidato+Admissão+Frentes (AUDITORIA+EXAME, regra 1)+Documentos pela
  régua; conhecido com etapa diferente → atualiza só a etapa; mesma etapa → no-op. Job 2× sobre o
  mesmo payload **não duplica** (corrida tratada via violação 23505).
- **Reuso sem reescrita:** `AdmissoesService.create(dto, user?, opts?)` com `opts.bypassAceite`
  (sistema não clica aceite — regra 5 não-bloqueio) e `opts.origem`/`opts.pandape`;
  `AuditoriaService.auditarBuffer(...)` extraído por equivalência alimenta a F2 existente
  (staging efêmera, IA incremental, Drive, expurgo TTL 48h) com binário baixado em memória.
- **Pull de documentos:** baixa a URL pública **só em memória** → `auditarBuffer` → descarte.
  **URL nunca persistida nem logada** (§A.6). Tipo não mapeável é pulado sem quebrar.
- **Cliente/Cargo:** resolvidos via `getVacancy` (best-effort por CNPJ/nome); **quando não
  resolvem, a criação é adiada** (o tick reabre) em vez de inventar `cod_cliente` — o schema
  exige FK NOT NULL (Admissão liga Candidato+Cliente+Cargo, §A.3). Depende do **de/para
  Pandapé→catálogo** (insumo do diretor, §A.9, par com as regras de auditoria e os tipos de doc).
- **Autoria das transições do sistema:** quando o pull fecha a régua e a auditoria auto-conclui,
  o autor do evento é o SUPER_ADMIN mais antigo (autorId é FK para usuários; usuário sintético
  violaria a FK) — ação de sistema atribuída a usuário real, não fake.
- **Saída manual (inalterada):** "Admissão finalizada" segue clicada pelo consultor no Pandapé;
  o EA não automatiza (sem endpoint de escrita/RPA).
- **Badge "Via Pandapé":** chip azul accent (ícone de elo), só quando `origem=PANDAPE`; aparece no
  Gerenciador, na Esteira (3 abas), na ficha do candidato e no modal de edição. `origem` exposto
  em `GET /admissoes`, `GET /esteira/:frente`, `GET /admissoes/:id` e `GET /esteira/admissao/:id`.

### Validação visual do diretor (§A.0): APROVADA
App subido localmente (backend 3011 / frontend 3010), base demo com "Ana Esteira" marcada
`origem=PANDAPE`; data path confirmado no `GET /api/admissoes` real (origem PANDAPE × MANUAL).
Diretor abriu no navegador e **aprovou o badge nos 4 lugares**.

### Gates de fábrica
- **tester — VERDE.** backend **93 testes** (+25 novos: idempotência a/b/c/d, bypassAceite,
  equivalência auditarBuffer, inércia sem token, pull de docs com checagem §A.6 de não-vazamento
  de URL), `typecheck`/`lint` limpos, ai-service 31 (não tocado). Zero bugs no código de produção;
  toda a API Pandapé mockada, sem rede real.
- **segurança — APROVADO sem veto.** 7 pontos §A.6 com evidência arquivo:linha — URL só em
  memória (descartada no `finally`), zero PII/URL em log, staging efêmera intacta, entrypoint
  fail-closed (`InternalTokenGuard` rejeita header ausente/divergente e token não setado), token
  env-only com inércia, crontab sem segredo em claro, limiter/backoff + Redis isolado.

### Insumos do diretor para ativar (§A.9)
`PANDAPE_API_TOKEN` + de/para Pandapé→catálogo (cliente/cargo via `IdVacancy`; tipos de documento).
Sem o token a Fase 5 fica inerte; sem o de/para, vagas não-mapeadas adiam (não inventam FK).
Investigação do formato real dos campos será registrada aqui quando o token permitir o teste real.

## ✅ INT-4 — CLICKSIGN (ASSINATURA ELETRÔNICA DO KIT) — 2026-06-30

**Modelo de acompanhamento: verificação periódica (cron-pull), não webhook** — mesma decisão da
Fase 5 (Pandapé), por decisão do diretor + admin de infra: sem exposição pública. CLAUDE.md A.5
INT-4 / A.6 atualizados. Credencial CLICKSIGN_API_TOKEN já na VM (sandbox); sem token = inerte.

### O que foi entregue (DoD)
- **Criação do envelope (gatilho: kit pronto + gate F12):** novo `kitLiberado(frentes)` (as 3
  frentes concluídas) em domain/frentes.ts; `KitService.gerar` exige o gate (409 sem as 3) e
  enfileira `criar-envelope` sem bloquear o download. O worker cria o envelope na Clicksign v3
  (JSON:API): `POST /envelopes` → `/documents` (PDF base64 inline) → `/signers` (nome completo +
  e-mail + CPF formatado, validado) → `/requirements` (agree/sign + provide_evidence/email) →
  `PATCH` running; grava `clicksign_envelope_id` + `clicksign_status=AGUARDANDO_ASSINATURA`.
- **Job cron-pull:** `infra/install-clicksign-cron.sh` (`*/1 7-23 * * *`) → `POST
  /internal/clicksign/tick` (guard X-Internal-Token, fail-closed). Fila BullMQ `clicksign-sync`
  (ea-redis db1, prefix ea:bull) com limiter 18/10s (sob o teto sandbox 20/10s; prod 50/10s) +
  backoff. O tick consulta envelopes AGUARDANDO_ASSINATURA via `GET /envelopes/{id}`.
- **Download + arquivamento no mesmo ciclo:** envelope `closed` → URL do assinado em
  `GET /envelopes/{id}/documents` (`data[].links.files.original`, S3 presigned ~5min) → baixa
  SÍNCRONO em memória → staging efêmera → arquiva na subpasta ADMISSÃO do Drive (régua de pastas
  da Fase 4) → grava `contrato_assinado_drive_url` + `clicksign_status=ASSINADO` → expurga staging.
  **URL da Clicksign nunca persistida nem logada** (§A.6).
- **Reenvio por correção:** `POST /clicksign/:admissaoId/reenviar-correcao` cancela (best-effort —
  ver nota sandbox) → `CANCELADO` → regenera kit (F9) → novo envelope. **Dupla correção:** origem
  PANDAPE sem `aceiteDuplaCorrecao` → 409 needsConfirmation; com aceite grava
  `dupla_correcao_aceites` (autor/data/termo — log permanente §A.6) ANTES de agir.
- **Interface:** pill de status (Aguardando assinatura/Assinado/Cancelado) na ficha e na aba
  Cadastro; link "Contrato no Drive" (logo do Drive); botão "Reenviar por correção" + modal de
  aceite. Schema: enum `clicksign_status` + colunas em admissoes + tabela `dupla_correcao_aceites`
  (migration 0012).

### Teste real no sandbox (e2e) + validação visual do diretor: APROVADA
App subido (backend 3011 / frontend 3010 / ai-service 8000). Gerado o kit de um candidato
kit-liberado → o EA criou e ativou o envelope na Clicksign (running). **O diretor assinou de
verdade no sandbox** ("Assinatura feita com sucesso"). Disparado o tick manualmente (cron ainda
não instalado na VM): o EA detectou `closed` → baixou o assinado → arquivou no Drive → ficha virou
**ASSINADO** com link do contrato. Loop ponta-a-ponta provado com assinatura real.

### Descobertas reais do sandbox (documentadas no código)
- Signatário exige **nome completo** + **CPF válido não-sequencial** (Clicksign valida dígito e
  rejeita blacklist como 123…09). Candidatos reais não têm o problema (dados demo ajustados).
- **Envelope `running` não cancela programaticamente** nesta conta (DELETE só em draft; PATCH
  canceled rejeitado; sem rota /cancel). Cancelamento é best-effort; estado autoritativo é o EA
  (CANCELADO) + trilha de dupla correção (§A.5 "responsabilização, não verificação técnica").
- CPF enviado à Clicksign é **formatado** (pontuação), não redigido — exigência legal; nunca logado.

### Correções de código durante a validação (com regressão)
1. **BullMQ não aceita `:` em jobId** → `env:${id}` → `env-${id}` (clicksign-queue.service.ts).
2. **Visibilidade na fila Cadastro:** admissões AGUARDANDO_ASSINATURA/CANCELADO permanecem na lista
   principal mesmo com a frente concluída (INTEGRACAO) — são trabalho em andamento; só somem quando
   ASSINADO/SEM_ENVELOPE (esteira.service.ts). **Bug apontado pelo diretor na validação**; corrigido
   e confirmado (item reaparece sem busca). Ambos com teste de regressão provado por mutação.

### Gates de fábrica
- **tester — VERDE:** backend **128** (+16 novos: regressão jobId, regressão visibilidade Cadastro
  a/b/c/d, ciclo processarTick closed/canceled/running/sem-pasta, controller 202 + parse aceite),
  frontend 11, shared 5, ai-service 31. Anti-vacuidade por mutação. Zero bugs no código.
- **segurança — APROVADO 8/8 sem veto:** URL S3 só em memória/descartada; `contrato_assinado_drive_url`
  é a pasta do Drive (referência), não a URL Clicksign; CPF/PII fora de log; staging efêmera;
  entrypoint fail-closed; token env-only inerte; crontab sem segredo; limiter/backoff + Redis
  isolado; aceite dupla correção imutável; RBAC ok.

### Pendência aberta (não bloqueia o merge — mesmo bloqueio da Fase 4)
**DRIVE_MOCK=true** (Fernando): o arquivamento real do assinado roda pelo mesmo caminho porém em
mock (link MOCK-*). Quando a SA tiver escrita no Shared Drive, grava o arquivo real — sem nova OST.

## 🔎 PANDAPÉ — CREDENCIAIS REAIS (OAuth) + INVESTIGAÇÃO DA API v1 — 2026-06-30

Chegaram as credenciais reais (OAuth client_credentials): `PANDAPE_CLIENT_ID` + `PANDAPE_CLIENT_SECRET`
na VM (apps/backend/.env). A Fase 5 fora construída para um `PANDAPE_API_TOKEN` fixo — ajustado o
cliente para OAuth. Investigação feita contra a API real + swagger oficial
(`https://api.pandape.com.br/swagger/v1/swagger.json`). **Descobertas importantes (a API real é
bem diferente do que a Fase 5 assumiu):**

**Autenticação — OAuth2 client_credentials (IdentityServer), confirmada ao vivo:**
- Token: `POST https://login.pandape.com.br/connect/token` (x-www-form-urlencoded), body
  `grant_type=client_credentials`, `scope=PandapeApi`, `client_id`, `client_secret`.
- Resposta `Bearer`, `expires_in=3600` (1h). Cliente passou a obter/cachear/renovar o token
  automaticamente; secret e token **nunca** são logados nem persistidos (§A.6).

**Endpoints reais são `/v1` (não `/v3`) e camelCase — o código da Fase 5 apontava para `/v3` (morto):**
- `GET /v1/PreCollaborator/Get?idPreCollaborator=<int>` → { idMatch, idVacancy, name, surname, email,
  admissionDate, **vacancyJob** (cargo como string), currentFolderName, **documents:[{name, link,
  extension}]** }. **NÃO traz CPF.**
- `GET /v1/Match/Get?idMatch=<int>` → traz **CPF**, phone, birthDate, cep/address. (CPF vem do Match,
  não do pré-colaborador → o pull precisa encadear PreCollaborator→Match.)
- `GET /v1/Vacancy/List` → { idVacancy, **job** (cargo string), city, description, tags[] }. **Não há
  Vacancy/Get por id; a vaga NÃO carrega cliente.**
- `GET /v1/Client/List` / `Client/Get?idClient` → { idClient, name, businessName, **cif (=CNPJ, 14
  díg)**, address, contact }.

**RESPOSTA À PERGUNTA DO DIRETOR (admissão nasce completa ou precisa de complemento manual?):**
- **Cargo:** vem como **texto livre** (`vacancyJob`/`job`, ex.: "Estágio em Engenharia Ambiental").
  Dá para mapear, mas exige **de/para (normalização) para o catálogo de cargos do EA** — não é um id
  pronto. → semi-automático.
- **Cliente:** a **vaga NÃO retorna cliente** (sem idClient/CNPJ). Existe cliente estruturado com
  **CNPJ (`cif`)** no endpoint `Client/List`, e o join natural seria **Pandapé `cif` ↔ EA
  `cliente.cnpj`** — MAS **não há ligação direta vaga→cliente** exposta (Vacancy não tem idClient;
  Request/List e Headquarter/List nos casos testados vieram vazios). → **na prática a admissão
  nascerá SEM cliente resolvido → complemento manual do consultor** (regra de não-bloqueio), a menos
  que se confirme uma cadeia confiável vaga→cliente em pré-colaborador real.
- **Documentos:** `documents[].link` (URL) + name/extension — alimentam o pull da F2 (URL só em
  memória, nunca persistida §A.6).

**GAP CRÍTICO DE DISCOVERY (decisão pendente do diretor):** a API v1 **não tem endpoint de listagem
nem de "mudanças desde"** de pré-colaboradores — só `Get` por `idPreCollaborator`. O modelo cron-pull
da Fase 5 pressupõe descobrir novos pré-colaboradores; **sem endpoint de enumeração isso não é
possível só por polling**. Opções: (a) reintroduzir o **webhook** do Pandapé (que empurra o
IdPreCollaborator) — volta ao desenho original; (b) outra via de enumeração a confirmar com o suporte
Pandapé. **Reportado ao diretor — escolha de arquitetura.**

**Não consegui buscar um pré-colaborador específico:** sem endpoint de listagem e sem um
`idPreCollaborator` de teste válido (id=1 → 404), falta um **id real de teste** para o fetch ponta a
ponta. Solicitado ao diretor um IdPreCollaborator válido do ambiente de testes.

**Follow-up (não nesta rodada):** remap completo do `pandape-sync` para o fluxo real
(PreCollaborator→Match p/ CPF; cargo via vacancyJob + de/para; cliente via CNPJ se a cadeia
vaga→cliente fechar; documents[].link no pull) + decisão de discovery (webhook vs outro).

---

## 2026-07-01 — OST-EA-GESTAO-USUARIOS (tela de administração de usuários + 2 regras de segurança)

Branch `feat/ost-ea-gestao-usuarios`. Coordenação despachou 4 exploradores (auth/RBAC/schema,
auditoria de rotas de exclusão, frontend/modal, padrão de log/edição) → 1 agente `backend` coeso +
1 agente `frontend` em paralelo (árvores disjuntas). **Gate fechado; nada commitado; sem flag
`READY_`. Aguardando validação visual do diretor** antes de tester/segurança (§A.0/§A.7).

**Escopo entregue:**
1. **Tela de gestão de usuários** (`/admin/usuarios`, sub-aba de Administração, herda o guard de papel
   do `admin/layout.tsx` + `@Roles("MASTER","SUPER_ADMIN")` no backend `admin/usuarios`). Listagem
   (nome/e-mail/papel/status/criado em), criar (gera senha temporária forte exibida uma vez p/ copiar),
   editar (nome/e-mail/papel), desativar = **soft delete** (`ativo=false`, nunca remove — preserva
   histórico), resetar senha (nova temporária exibida). Senha via `crypto.randomInt` (≥12 chars),
   hash argon2, senha em claro **só** na resposta de criação/reset, nunca logada/persistida (§A.6).
2. **Troca obrigatória de senha no 1º acesso:** coluna `usuarios.senha_temporaria` (migration 0013);
   flag propagada no access token e em `/auth/login`+`/auth/me`; `SenhaTemporariaGuard` global entre
   `JwtAuthGuard` e `RolesGuard` → enquanto `true`, toda rota sem `@Public`/`@PermiteSenhaTemporaria`
   responde `403 {code:"SENHA_TEMPORARIA"}`. `POST /auth/trocar-senha` valida senha atual, exige nova
   diferente, limpa a flag e reemite tokens. Front bloqueia navegação → `/trocar-senha` (usuário novo
   e reset). Cobre os dois cenários.
3. **Regra global de exclusão (COMUM nunca exclui):** auditoria das rotas `@Delete` do sistema —
   `DELETE /admissoes/:id`, `/admin/clientes/:cod`, `/admin/cargos/:id`, `/admin/regras/:id`,
   `/admin/regua`. **Todas já exigiam `@Roles("MASTER","SUPER_ADMIN")`** (conforme); catálogos/tipos de
   doc não têm rota de delete. Nenhuma alteração necessária além de **blindar com testes** (spec
   `rbac-exclusao` cobre as 5 + `admin/usuarios` negando COMUM). COMUM segue podendo **editar** dados
   de candidato (o `PATCH /admissoes/:id` não tem `@Roles` — correto pela regra).
4. **Log de alteração de candidato:** tabela nova `candidato_alteracoes_log` (migration 0013;
   `{admissao_id→cascade, campo, valor_anterior, valor_novo, autor_id→usuarios nullable, criado_em}`,
   índice por admissão). Gravado dentro da transação de `admissoes.service.editar` (propagado
   `@CurrentUser`), diff campo-a-campo dos editáveis de `admissoes`+`dados_vaga_folha`; campos
   inalterados e CPF/cliente (imutáveis) não geram log. **Exceção consciente §A.6:** ao contrário das
   trilhas de frente (que evitam PII), esta guarda valores que PODEM ser PII (salário, etc.) — exigido
   pela OST; documentado no comentário do schema; CPF nunca (imutável).
5. **Linha do tempo no modal do candidato:** `GET /esteira/admissao/:id` passou a devolver
   `alteracoes[]` (desc por data, `leftJoin usuarios` p/ autor); nova `<section>` "Histórico de
   alterações" (somente leitura) ao fim do `AdmissaoDetalheModal` (modal único das 3 telas).

**Verificação (coordenador, integrada):** `pnpm typecheck` (3 pacotes), `pnpm lint`, `pnpm test`
(**186 testes / 27 arquivos**, incl. os 4 specs novos da DoD) — **verdes**. Migration 0013 aplicada no
`ea-db`; schema conferido no banco. **Gap de integração pego e corrigido:** o agente editou
`packages/shared-types/src` (typecheck passa via path-mapping) mas não rebuildou o `dist` → `nest build`
quebrava (`UsuarioListItem` ausente no `.d.ts`); resolvido rebuildando o shared-types antes do backend.
**Smoke test ponta a ponta (10/10)** contra o app rodando (back 3011 + front 3010): login por papel,
criação com senha temporária, bloqueio `SENHA_TEMPORARIA`, troca de senha, distinção dos dois 403
(senha × RBAC), COMUM barrado no delete, e a timeline registrando a alteração com autor. Artefatos de
teste limpos.

**DoD — status:** tela funcional ✅ · senha temporária exibida na criação/reset ✅ · troca obrigatória
bloqueando (novo + reset) ✅ · auditoria de exclusão + testes RBAC ✅ · log de alteração gravando ✅ ·
timeline no modal ✅ · lint/typecheck/test verdes ✅ · **validação visual do diretor: PENDENTE** ·
gate fechado / flag `READY_`: **só após auditoria** ✅.

**Ajuste de escopo (2026-07-01, ainda em validação, nada commitado):** o COMUM passou a poder editar
**todos** os dados de vaga+candidato, **incluindo os campos pessoais antes imutáveis** (nome, e-mail,
telefone, data de nascimento). Data de admissão/salário/escala(horário) já eram editáveis. Backend:
`UpdateAdmissaoDto` ganhou bloco `candidato` (CPF **fora** — identidade §A.3); `admissoes.service.editar`
abriu o update do `candidatos` (antes insert-only) dentro da mesma transação, com o **mesmo mecanismo de
log** (cada campo pessoal alterado vira linha em `candidato_alteracoes_log`); `obter` (prefill do form)
passou a devolver o bloco `candidato`. Frontend: seção "Candidato" no `EditAdmissaoModal` (CPF
somente-leitura; nome/e-mail/telefone/nascimento editáveis), enviada no `PATCH`. **Regra mantida:
COMUM continua SEM excluir nada** (nenhuma rota de delete tocada). Teste novo cobre o log dos campos
pessoais (+CPF nunca logado). Verificação integrada: typecheck (3 pkg) + lint + **187 testes** verdes;
**smoke test 6/6** com COMUM editando os campos pessoais ao vivo (timeline com autor; delete → 403).
**PARANDO de novo para validação visual** antes de tester/segurança.

**Fechamento (2026-07-01):** **validação visual do diretor APROVADA** (3 pontos + ajuste de escopo:
edição ampliada de dados pessoais + log + CPF protegido). Gate de qualidade: **tester PASS** (typecheck
3 pacotes + lint + 187 testes backend + 31 ai-service; 4 coberturas da DoD confirmadas) e **segurança
APROVADO** (§A.6: RBAC das 5 rotas de exclusão nega COMUM + `admin/usuarios` idem; exceção de PII no
`candidato_alteracoes_log` documentada e CPF nunca logado; senha temporária via `crypto.randomInt`, sem
vazar `senhaHash`/token/segredo; auto-desativação bloqueada). **Notas não-bloqueantes registradas pela
segurança** (governança, à decisão do produto): (1) `candidato_alteracoes_log.admissao_id` é
`ON DELETE cascade` → excluir a admissão apaga a trilha de edição (distinta do log de dupla correção,
que é permanente); (2) um MASTER pode se auto-promover a SUPER_ADMIN via `admin/usuarios` (dentro da
fronteira de confiança admin). Liberado para `READY_gestao-usuarios` → merge na main → push.

**Ajustes de governança pós-merge (2026-07-01, aprovados pelo diretor; commit direto na main):**
(1) `candidato_alteracoes_log.admissao_id` → **`ON DELETE set null`** + coluna nullable (migration 0014):
a trilha de edição (quem/quando/campo/valores) **sobrevive** à exclusão da admissão; perde-se só o
vínculo. (2) **Anti auto-promoção:** `UsersService.atualizar` agora rejeita (403) qualquer alteração do
PRÓPRIO papel (`id === solicitante` com `papel` diferente) — só outro Super Admin muda o papel de um
usuário, nunca sobre si mesmo. 2 testes novos (bloqueio próprio + outro Super Admin promove). Verde:
typecheck + lint + 189 testes.

---

## 2026-07-02 — Nova tela de login / identidade visual (OST-EA-TELA-LOGIN)

Branch `OST-EA-TELA-LOGIN`. Substitui a tela de login por uma identidade premium fiel ao HTML de
referência aprovado pelo diretor (mesmo padrão do CentraFin, adaptado à marca/stack do EA).

### 1. Reprodução visual (`apps/frontend/src/app/login/page.tsx`, reescrito)
- Card **glassmorphism** em duas colunas (split 50/50 no desktop, coluna única no mobile via
  `md:grid-cols-2`), sobre fundo **slate-950** com **3 orbes** de luz difusos (blur 140px) e **grid**
  sutil (opacity 0.07). Dois orbes pulsam (`orb-pulse` 8s; o segundo com `animation-delay: 2.5s`).
- Coluna esquerda: **logo com halo** (drop-shadow azul difuso) + **flutuação** (`float` 4s), título
  "Bem-vindo ao **EA Automatic**" com gradiente azul→verde no nome, texto de apoio. Coluna direita:
  formulário e-mail/senha.
- **Ícones em SVG inline** (envelope, cadeado, olho mostrar/ocultar, alerta, escudo) — **sem fonte de
  ícone externa** (robustez, sem dependência de CDN), conforme a OST.
- **Animações** adicionadas ao `tailwind.config.ts` (`orb-pulse`, `float`, `fade-in-up`) — reutilizáveis;
  sombras do botão (glow no hover/focus) e halo do logo como valores arbitrários do Tailwind.
- **Decisão registrada:** a tela de login é uma **tela de marca dedicada** e renderiza **sempre no tema
  escuro** (paleta fixa #22B0DB azul / #AAD12F verde), independente do `[data-theme]` do app — fiel à
  referência (que é dark-only). Por isso o **ThemeToggle foi removido** desta tela (a referência não o
  possui). A `/trocar-senha` **não** faz parte do escopo desta OST (segue no visual antigo); sugere-se
  um follow-up para dar o mesmo tratamento e manter a coerência do fluxo de auth.

### 2. Autenticação REAL preservada (nada da lógica mudou)
- O submit chama `useAuth().login(email, password)` → **POST /auth/login** já existente (JWT HS256 +
  refresh em cookie httpOnly + OriginGuard). Em erro, exibe o bloco **"Acesso Negado"** abaixo do
  formulário (sem quebra de layout), com a mensagem da API (fallback "E-mail ou senha incorretos.").
  Spinner no botão + dots "Autenticando…" durante a chamada.
- **RBAC e troca obrigatória de senha intactos:** após login, `router.replace("/")`; o `(app)/layout`
  redireciona para `/trocar-senha` quando `senhaTemporaria === true` (fluxo inalterado).
- **Sem Google/SSO** — só a auth própria do EA.

### 3. Sugestão registrada (não implementada nesta OST, por decisão do diretor)
- Substituir a marca "EA AUTOMATIC" (quadro gradiente `Brand`) da **sidebar** pelo mesmo `logo-ea.png`,
  para consistência de marca em todo o sistema. Fica como sugestão — aguarda decisão.

### Pendências / status
- **Logo (`public/logo-ea.png`): PENDENTE dos bytes reais.** O logo veio embutido no HTML como base64
  (~20 KB); a reprodução manual do base64 é inconfiável (corromperia o PNG), então o arquivo precisa ser
  colocado em disco a partir do `index.html` original para eu decodificar os bytes exatos. A página já
  referencia `/logo-ea.png` (dimensionado por altura, `w-auto object-contain`) — só falta o arquivo.
- **Verificação:** **prettier ✓ · typecheck (frontend) ✓ · lint ✓ · vitest 13/13 ✓**.

**DoD — status:** tela nova substituindo a atual ✅ · login funcional (auth real, RBAC, troca de senha,
OriginGuard intactos) ✅ · erro de credenciais sem quebrar layout ✅ · responsivo (grid → coluna única) ✅ ·
ícones SVG inline ✅ · lint/typecheck/test verdes ✅ · **logo real em disco: PENDENTE** · **validação visual
do diretor: PENDENTE** (parada obrigatória, §A.0) · gate fechado / flag `READY_`: **só após auditoria**.

**Fechamento (2026-07-02):** logo real recebido (Opção B — diretor colocou `apps/frontend/public/logo-ea.png`,
PNG 1024×1024 RGBA transparente, servido 200/`image/png`). **Validação visual do diretor APROVADA**: (a) identidade
visual aprovada como está; (b) mantém **dark-only, sem toggle de tema** no login; (c) sem promover para :3010 agora
— login funcional real fica para a origem correta na etapa de tester/segurança. Preview servido em dev na :3020
(bind VPN) sem tocar a produção :3010.

Gate de qualidade: **tester PASS** (typecheck 3 pacotes + `eslint .` limpo + **207 testes Node** [shared-types 5,
frontend 13, backend 189] + **31 ai-service**; DoD coberta por `auth-context.spec.tsx` — login/trocarSenha ainda
exercem o fluxo real; sem teste de render novo por falta de alias `@/` no vitest do frontend, decisão de QA
registrada) e **segurança APROVADO** (§A.6: auth/OriginGuard/refresh-cookie/gate de senha temporária **intactos** —
nenhum arquivo de auth tocado; zero `console.*`/storage/log de senha·CPF·token; mensagem de erro genérica do backend;
sem segredo hardcoded, sem SSO/Google reintroduzido; toggle de senha e `autoComplete` adequados). Notas
não-bloqueantes: (N1) `setSubmitting(false)` movido para o `catch` — no sucesso o botão fica desabilitado até o
`router.replace("/")` (intencional, evita flash); (N2) `public/logo-ea.png` era untracked → **incluído no commit**.

**DoD — final:** tela nova substituindo a atual ✅ · login funcional preservado (auth real, RBAC, troca de senha,
OriginGuard intactos) ✅ · erro de credenciais sem quebrar layout ✅ · responsivo ✅ · ícones SVG inline ✅ ·
lint/typecheck/test verdes ✅ · logo real em disco ✅ · validação visual APROVADA ✅ · tester PASS ✅ · segurança
APROVADO ✅. Liberado para `READY_ola-tela-login` → merge na main → push. Publicação em :3010 (`deploy-local.sh`)
é passo deliberado separado, à decisão do diretor.

---

## 2026-07-02 — Webhook receptor do Pandapé (OST-EA-WEBHOOK-PANDAPE / INT-1)

Branch `OST-EA-WEBHOOK-PANDAPE`. **Decisão do diretor: a integração Pandapé passa a ser via WEBHOOK, não
cron-pull** (o Fernando monta a rede/proxy em paralelo; construímos o lado do EA para estar pronto). Backend
pelo agente `backend`; gate por `tester` + `seguranca`. Sem UI → sem validação visual (§A.0 N/A).

### O que foi construído (reúso máximo, zero duplicação da cadeia da Fase 5)
- **Endpoint** `POST /api/webhooks/pandape` (`pandape-webhook.controller.ts`, `@Public()` só p/ pular o JWT):
  recebe o evento "Candidato enviado para admissão" (payload traz `IdPreCollaborator`, confirmado pelo suporte
  André/Pandapé) → valida origem → extrai o id (tolerante a casing, `dto/pandape-webhook.dto.ts`) → **enfileira**
  na fila existente → responde **202** rápido, sem aguardar o enriquecimento. O worker da Fase 5
  (`processarCandidato`) faz enriquecimento (GET PreCollaborator/Match/Client) + idempotência + backoff —
  **nada dessa lógica foi tocado**.
- **Idempotência (§2):** reusa o unique `idPrecollaborator` em `integracao_pandape` + `jobId cand:${id}` na fila.
  Webhook duplicado (o Pandapé pode reenviar) → dois enfileiramentos → uma admissão. Sem duplicação.
- **Auth de origem (`pandape-webhook.guard.ts`, fail-closed):** dois mecanismos config-driven, autoriza com ≥1
  configurado satisfeito — **token compartilhado** (`PANDAPE_WEBHOOK_TOKEN`, header `x-pandape-webhook-token`,
  comparação constante-tempo com `crypto.timingSafeEqual` + guarda de tamanho) **ou allowlist de IP**
  (`PANDAPE_WEBHOOK_IPS`, parse manual do `X-Forwarded-For` porque não há `trust proxy`; fallback
  `socket.remoteAddress`; normaliza IPv6-mapped). Sem nenhum configurado → **401** (rota nasce fechada, pronta
  porém inerte, como o resto da INT-1). Ponto de extensão para **HMAC de assinatura** deixado comentado, caso o
  suporte confirme que o Pandapé assina o payload. Envs adicionados ao `infra/.env.example`.
- **Tratamento de falha (§4):** `enfileirarCandidato` passou a retornar `boolean` (false se a fila/Redis estiver
  fora, com try/catch e log genérico). Fila fora → o controller responde **503** → o Pandapé reenvia (evento não
  se perde). Id ausente → **400** (sem ecoar o corpo). Retry do enriquecimento já é coberto pelo backoff da fila
  (5 tentativas, exponencial).
- **Badge "Via Pandapé" (§5):** automático — a criação com `origem: PANDAPE` já liga o badge; nada a fazer.

### Decisão sobre o cron-pull de descoberta (§3) — DEPRECADO
O suporte oficial confirmou que **não existe endpoint de descoberta** na API do Pandapé; `listarMudancas()` já
era inerte na API v1 e o crontab **não tinha entrada instalada**. Decisão: o cron-pull de **descoberta** fica
**deprecado** — o webhook o substitui. `infra/install-pandape-cron.sh` recebeu cabeçalho de DEPRECAÇÃO (não
instalar). A rota `/internal/pandape/tick` e o worker **permanecem no lugar, inertes**, úteis apenas para um
eventual re-sync pontual de ids já conhecidos (mudança de etapa) — não removidos.

### Condição de ATIVAÇÃO (bloqueia o smoke real, NÃO o merge — dependência de infra, §A.9)
A segurança APROVOU o merge, mas registrou condição para quando o Fernando ligar o proxy externo (o smoke real
será etapa futura, sem nova OST): (1) o backend **não** pode ser exposto direto (manter bind **loopback**
`127.0.0.1:3011` — mitigação-chave já presente em `main.ts`; sem port-forward de 3011); (2) o proxy do Fernando
**deve sobrescrever** o `X-Forwarded-For` com o IP real (`proxy_set_header X-Forwarded-For $remote_addr`),
**nunca** append — senão a allowlist de IP é forjável; (3) recomendação forte: **ativar por token** como
mecanismo primário (imune à topologia de rede), IP como defesa-em-profundidade, HMAC se o Pandapé assinar.
Nota não-bloqueante: sem `trust proxy`, o throttler global chaveia pelo IP do proxy (cap agregado, não
por-cliente) — condição pré-existente do app, fora do escopo deste PR.

### Gate
- **tester PASS:** typecheck 3 pacotes + `eslint .` limpo + testes verdes — shared-types 5, **backend 207**
  (11 do guard + 7 do controller, +1 de casing adicionado pelo QA), frontend 13, ai-service 31. Idempotência da
  Fase 5 (`pandape-sync.service.spec.ts`, 15) intacta.
- **segurança APROVADO** (§A.6): fail-closed real; `timingSafeEqual` com guarda de tamanho; zero log de
  token/IP/payload/CPF/URL; `@Public()` não afrouxa Origin/throttler; DTO permissivo sem prototype pollution
  (só o `id` string é consumido adiante); nenhum arquivo de auth/RBAC tocado; bind loopback como mitigação.

**DoD — final:** endpoint receptor criado e validando origem ✅ · reúso da cadeia de enriquecimento + idempotência ✅ ·
decisão do cron-pull documentada ✅ · lint/typecheck/test verdes ✅ · teste com payload simulado (mock) ✅ · smoke real
com o Fernando = etapa futura (sem nova OST) ✅ · tester PASS ✅ · segurança APROVADO ✅. Liberado para
`READY_webhook-pandape` → merge na main → push. Rota nasce **fechada/inerte** até token ou IPs do Pandapé.

---

## 2026-07-17 — Retroalimentação do diário + régua documental, gates do exame, trilha de declínio

**Sessão longa, várias OSTs.** Esta entrada também **fecha um buraco de 15 dias**: a última entrada
anterior era de **02/07** e desde então entraram **37 commits** sem registro. Reconstruí o que dava
pelo git (fonte real) e detalhei o que foi feito nesta sessão; o que não presenciei está listado como
commit, sem narrativa inventada.

### Entrou nesta sessão (commitado e no ar)

- **`6bd8f8c` — régua documental: CRUD de tipos de documento em rota admin própria.** A premissa da
  OST ("só falta o criar") não se sustentou: **não existia CRUD nenhum** de tipos de documento, nem
  tela nem endpoint (os tipos entravam só por seed), e o "inativar" da tela inativava a **régua de um
  cliente**, não um documento. Construídos criar/renomear/inativar/reativar. **Sem migration**:
  `tipos_documento.ativo` já existia. Decisões: criar pede **só o nome** (a exigência vive por
  cliente+cargo na régua, não é atributo do documento); `/catalogos/tipos-documento` ficou
  **intocado** de propósito (alimenta Esteira/Auditoria, que precisam dos inativos para resolver o
  nome de documentos de admissões antigas); renomear **não** regera o `codigo` (é a identidade técnica,
  ex. `TERMO_BANCO`); trava de nome duplicado (409), porque o modal de Auditoria resolve documento
  **por nome** e duplicata colidiria em silêncio.
- **`33ab7f9` — CLAUDE.md.** Catálogo corrigido para **30 documentos** (não 21) e marcado como número
  **vivo** (a régua agora tem CRUD; a fonte da verdade é a tabela). Criadas **§A.21** (rotina de
  commit/push) e **§A.22** (regras de fluxo: tipo e tempo de contrato implementados; escala vinculada
  congelada; resta a badge por linha do contador de docs obrigatórios).
- **`7123e01` — gates do exame + trilha de declínio.**
  - **Gate AGENDADO** passou a exigir os **5** campos (antes só olhava a data, então linha incompleta
    gravada fora do modal passava; as colunas de `exame_agendamento` são nullable).
  - **Bypass do APTO: nada mudou, porque já incluía o MASTER.** O que estava errado era o **texto da
    NC-2**, fixo em "autorização de Super Admin" mesmo quando quem liberava era Master. Passou a
    nomear o papel real. O `reason` (`aptoSemAsoSuperAdmin`) ficou como está **por decisão do
    diretor**: é código de fio com o front (7 pontos), ninguém o lê.
  - **12 testes** (`esteira.gates-exame.spec.ts`) para as duas regras mais duras do Exame, que
    estavam **sem rede nenhuma**. Validados com **teste de dente**: revertendo o guard ao
    comportamento antigo, 3 falham; revertendo o texto da NC, o caso do Master falha.
  - **Trilha de declínio/reativação** no `candidato_alteracoes_log` (append-only já existente): data =
    `criadoEm`, motivo pelo **nome** (o histórico é lido por gente), autor pelo `user.id`. Cobre os
    **dois** caminhos: o `declinarAdmissao` da Esteira (que não logava **nada** e nem recebia o
    usuário) e o lápis do Gerenciador (que logava só o farol, nunca o motivo). Validado na API real:
    declinar → reativar → declinar por outro motivo deixa **os dois motivos no histórico**; base de
    teste restaurada depois.

### Diagnósticos fechados nesta sessão (viraram DECISÕES FECHADAS, ver topo)

- **CPF do Pandapé**: vem do `Match/Get`. Provado ao vivo contra o swagger oficial + API real.
- **De/para vaga→cliente**: a API não expõe o vínculo. Manual por design, confirmado pelo diretor.
- **Dedup carga × webhook**: chaves cegas entre si; duplicaria no primeiro webhook real.

### Estado real verificado hoje (não é memória, é medição)

- **Canal Pandapé no ar e fail-closed:** receptor 401 sem credencial (pelos dois caminhos); ponte do
  Fernando (`webpanda.php`) **funcional ponta a ponta** (sem Bearer 403, Bearer errado 403, Bearer
  certo devolve o status **real** do EA); OAuth client_credentials **200**, escopo
  `ExternalRequestApi PandapeApi`. **Mas o webhook está inerte na prática**: sem o fio do `getMatch`,
  o CPF não chega e o sync adia em silêncio (job completa, nunca retenta).
- **Base:** 2158 admissões, **todas `origem=MANUAL`** (a carga carimba MANUAL, então é
  indistinguível do wizard); **zero `PANDAPE`**. 30 tipos de documento ativos. 36 CPFs com >1 admissão.
- **Furos da carga (reais, ainda abertos):** o ramo de data nula usa `data_admissao = data_admissao`,
  que com NULL **nunca casa** (deveria ser `isNull`) → re-executar duplica as linhas sem data (hoje
  atinge **1** admissão, mas um extrato com muitas datas nulas duplicaria todas); e o SELECT de dedup
  compara **CPF cru** do CSV contra o CPF **normalizado** no banco.

### Pendências abertas conscientes

- **Logo** (`globals.css`, `Sidebar.tsx`, `LogoEA.tsx`, `logosoulan.png`): soltos no working tree por
  decisão, tratar depois. **4 scripts de dados** (`db/*.ts`) idem. Nunca entram nos commits.
- **ESLint:** 2 erros **pré-existentes** de config (`react-hooks/exhaustive-deps` não encontrada) em
  `nova/page.tsx` e `vt/page.tsx`. Fora de escopo até o diretor mandar.
- **§A.13 sem prova visual:** o Chromium do Playwright **não sobe nesta VM** (faltam libs de sistema);
  instalar exige `sudo`, que é destrave do diretor. Hoje a validação visual é do diretor, na tela.
- **Estrutural cliente-empresa:** ⚠️ **a OST falava em "~21 CNPJs de filial a popular"; o banco diz
  outra coisa.** `entidade_filiais` tem **8 filiais, todas com CNPJ**. Dos 131 vínculos: 104 não-FOPAG,
  dos quais **101 resolvem CNPJ e só 3 não** (combos faltando: NEAT filial 0, SOULAN ADM filial 10,
  SOULAN CENTRAL DE ESTÁGIOS filial 4); os 27 FOPAG **não usam** `entidade_filiais` por design (o
  documento usa o CNPJ do próprio cliente). **A pendência real é 3 combos, não 21.** Achado colateral:
  `admissoes.cliente_vinculo_id` está **0/2158 populado** — a coluna existe e nunca foi ligada.
- **Gates do exame não estão no CLAUDE.md.** A OST citou "§A.29", que **não existe** (o documento vai
  até §A.22). As regras estão no código e nos testes, sem seção própria na constituição.

### Aberto / próximo passo

- **OST Pandapé (CPF + dedup) foi iniciada e PAUSADA** por esta OST de diário, **sem nenhuma alteração
  de código**. Estado: Parte 1 (ligar o `getMatch`) levantada e pronta para implementar; Parte 2
  (dedup) **para no levantamento das opções** e aguarda escolha do diretor; Parte 3 (os 2 furos da
  carga) a corrigir. Achado a aproveitar: o `idSex` do Pandapé vem como **1 e 2**, e o EA usa
  `MASCULINO`/`FEMININO` — vai precisar de de/para explícito.
- **Diário e TASKS.md:** o `TASKS.md` está parado desde **26/06** e não reflete nada das Fases 4-5 nem
  do VT/benefícios/régua. Não foi tocado nesta OST (fora do escopo); merece uma OST própria.

### Buraco de 02/07 a 17/07 — os 37 commits sem entrada de diário (reconstruído do git)

Listados como registro factual. As três últimas linhas (17/07) estão detalhadas acima; as demais
são de sessões anteriores e ficam aqui pelo hash, sem narrativa que eu não presenciei.

- `4f8e69e` 02/07 — feat(pandape): endpoint receptor de webhook (OST-EA-WEBHOOK-PANDAPE / INT-1)
- `f63263a` 02/07 — merge: OST-EA-WEBHOOK-PANDAPE — endpoint receptor de webhook do Pandapé (INT-1)
- `d4e3a3c` 06/07 — docs: investigacao de vaga e requisicao no Pandape
- `91ac6c7` 06/07 — docs(claude-md): §A.5 vigente = webhook, cron-pull DEPRECADO
- `315ced1` 07/07 — fix(pandape): jobId sem ':' que causava 503 e reentrega infinita no webhook
- `3e61a50` 08/07 — feat(schema): vínculo cliente↔empresa Soulan (entidades, filiais, tipo de serviço)
- `7225e9b` 08/07 — feat(match): regra empresa+filial → entidade/CNPJ + view do vínculo
- `dbf2638` 08/07 — feat(esteira): relatório da clínica no padrão MODELO_DE_AGENDAMENTO
- `d522e35` 08/07 — feat(clientes): vínculo na tela, CRUD com inativação, filtros e rótulos
- `e8ba869` 08/07 — feat(esteira): modal de agendamento do exame + gates de transição + validação de ASO pela I.A + gate APTO por papel (Master/Super Admin)
- `162b87d` 08/07 — feat(ui): ajustes visuais (esteira, gerenciador, wizard, Menu Gerencial) + varredura de travessões §A.11 + CLAUDE.md
- `aa1d1c5` 10/07 — feat(fluxo): regras de preenchimento + migration 0018 (cliente_beneficio_padrao)
- `0886943` 10/07 — feat(regua): painel de clientes sem/com régua com busca + CRUD por cargo
- `f4b924f` 10/07 — feat(ui): padrão único de tabela §A.12 (Farol, Gerenciador e todas as tabelas)
- `7a5f0d7` 10/07 — fix(ui): textos do wizard (remoção de frases desnecessárias, (F4) removido)
- `f840ad6` 10/07 — feat(kit): painel de regras multi-kit, schema e régua padrão
- `c55a5ca` 10/07 — feat(kit): motor de extração no ai-service (fila com retry/backoff)
- `befbdb5` 10/07 — feat(kit): backend do Gerador de Kit (processamento, download, reimport)
- `a422005` 10/07 — feat(kit): tela do Gerador de Kit (upload, resultado, busca, retenção)
- `da50f1d` 10/07 — chore: ignorar planilha de dados de clientes
- `1e7d9a4` 14/07 — feat(cargos): CRUD completo com busca, soft-delete e modal premium na tela de cargos
- `c6458ae` 15/07 — feat(import): regras permanentes de importação da esteira (§A.16)
- `716252b` 15/07 — feat(ui): KPIs, filtros multi-select, busca rápida e padrão de tabela (Blocos A-F)
- `0a9c936` 15/07 — feat(declinio): catálogo de motivos de declínio e motivo no modal (Fase 2)
- `d1fd838` 15/07 — feat(admin): Menu Gerencial navegável por cards, com busca
- `c461ae1` 15/07 — docs(claude): registra frente A.17 (Formulário de VT online)
- `a584070` 15/07 — style: aplica formatação prettier em toda a base
- `f207c60` 15/07 — chore: ignora planilhas e extrações de dados por regra genérica (§A.6)
- `afb477d` 15/07 — feat(tarifas): tabela e tela de admin de tarifas de transporte (VT etapa 1)
- `6260fcd` 15/07 — feat(vt): formulário de VT online do candidato (acesso, itinerários, avisos, PDFs)
- `1b5ed0f` 15/07 — docs(claude): atualiza §A.17, §A.9, §A.8 para o estado real e registra §A.18/§A.19
- `cd6a118` 16/07 — feat(esteira): reorganiza status de Cadastro, benefícios estruturados, régua unificada e ajustes de KPI/colunas
- `b85ad1c` 16/07 — feat(esteira): declínio da admissão por qualquer frente + motivo no lápis, trava do salvar e ajustes de colunas
- `cdbbfa4` 16/07 — feat(esteira): declínio não-destrutivo + reversão, modais em blocos, exame (valor/previsão ASO), declínio no seletor e ajustes de colunas
- `6bd8f8c` 17/07 — feat(regua-documental): CRUD de tipos de documento em rota admin própria
- `33ab7f9` 17/07 — docs(claude): corrige catálogo de documentos (30, não 21), registra rotina de commit/push e o estado das regras de fluxo
- `7123e01` 17/07 — feat(exame/declinio): gate AGENDADO completo, bypass APTO com autor correto na NC, trilha de declinio/reativacao com histórico

---

## 2026-07-17 (tarde) — Pandapé: CPF ligado via Match + furos da carga (OST Partes 1 e 2)

**Código pronto e testado, AINDA NÃO commitado** (aguarda validação do diretor, §A.21). Diário
atualizado antes de encerrar, conforme a norma.

### Parte 1 — CPF ligado (o fio que faltava)

- `PandapeSyncService.criarAdmissao` agora chama **`api.getMatch(pc.idMatch)`** (o método já existia,
  aponta para `/v1/Match/Get`) e monta o candidato a partir do Match. Antes ninguém chamava, então
  `pc.cpf` vinha `undefined` e a sync adiava para sempre.
- Novo `candidatoDoMatch(pc, match)`: mapeia **CPF** (do Match), **nome** (`name`+`surname` do
  pré-colaborador), **email**, **telefone** (Match), **data de nascimento** (Match, datetime fatiado
  para YYYY-MM-DD) e **sexo**. **CEP/endereço NÃO mapeados** (decisão do diretor nesta sessão): não há
  onde gravar sem corromper o `dadosVagaFolha.endereco`, que é endereço de FOLHA, não residencial.
- **`idSex` resolvido pelo dicionário OFICIAL** (`GET /v1/Dictionary/Sex`, consultado ao vivo):
  **1=Masculino, 2=Feminino, 0=Não Especificado**. Função `sexoDoPandape` mapeia só por isso, nunca
  por palpite (inverter cobraria Reservista de mulher). `idSex` adicionado à interface `PandapeMatch`.
- **Adiamento agora é visível:** se falta CPF/nome, ainda adia (não cria sem CPF), mas loga 1 linha
  com o **`idPreCollaborator`** (id do ATS, para reprocessar) e o **motivo** (sem idMatch / Match não
  retornado / Match sem CPF). §A.6: nenhum dado pessoal no log.
- **Prova ao vivo** sobre 3 Matches reais (idVacancy 847, valores mascarados): CPF de 11 dígitos,
  telefone, nascimento e sexo corretos (idSex 2→FEMININO, 1→MASCULINO).

### Parte 1.2 — os dois furos da carga, corrigidos com teste

- **Furo do NULL:** `carga-frente1.ts` trocou `eq(dataAdmissao, dataAdmissao)` (que com NULL nunca
  casa) por **`isNull(admissoes.dataAdmissao)`**. Provado no banco real: a chave da admissão sem data
  casava **0** com o padrão antigo (duplicaria) e casa **1** com `isNull` (deduplica).
- **Furo do CPF cru:** o dedup agora compara **`normalizeCpf(r.cpf)`** dos dois lados (o `create`
  grava normalizado). Não depende do `normalize.py` externo. O mesmo CPF normalizado vai ao insert.
- Testes: `sexoDoPandape` (dicionário) + 3 cenários de `criarAdmissao` (CPF do Match chega; sem
  idMatch adia com log; Match sem CPF adia). Backend **252 testes** (+6). Typecheck/eslint/prettier
  verdes.

### Parte 2 — dedup carga × webhook: opções levantadas, AGUARDANDO escolha do diretor

**Não implementada, por ordem da OST.** As opções e trade-offs foram ao diretor. **O painel do
Pandapé NÃO deve ser cadastrado até a dedup fechar** — enquanto não fechar, o webhook segue inerte e
sem risco. (Detalhe do levantamento: a API expõe `/v2/matches?IdVacancy=` como LISTA com CPF, o que
viabiliza a opção de backfill por CPF; ver o report ao diretor.)

### Pendências herdadas (inalteradas)

Logo e 4 scripts de dados soltos; 2 erros de ESLint pré-existentes (`nova`, `vt`); prova visual
§A.13 depende de sudo (Chromium sem libs); estrutural cliente-empresa = 3 combos de CNPJ, não 21.

---

## 2026-07-17 (noite) — Liberação Admissional, Parte 1/3 (núcleo: pré-admissão, webhook, tela)

**Código pronto e validado ao vivo pela fábrica, AINDA NÃO commitado** (aguarda validação do diretor
na tela, §A.21). Parte 1 de 3: faltam a **Parte 2 (recusa)** e a **Parte 3 (indicador/ping/popup)**
antes de o Pandapé ir ao painel. **Webhook NÃO cadastrado no painel** (a dedup ainda não fechou).

### O que entrou

- **Migration 0028_liberacao_admissional**: novo farol `AGUARDANDO_LIBERACAO`; `cod_cliente` e
  `cargo_id` NULÁVEIS (1ª vez). Aplicada no banco dev, confirmada.
- **shared-types + domínio**: `AGUARDANDO_LIBERACAO` no `FAROL_GLOBAL` + rótulo "Aguardando
  Liberação"; adicionado a **`FAROL_MANUAL`** (crítico: sem isso qualquer recompute derivaria
  EM_ADMISSAO e arrancaria a admissão da sala de espera); excluído do `FAROL_SELECT_OPTIONS` (não é
  escolha manual do lápis).
- **Webhook** (`PandapeSyncService.criarAdmissao`): em vez de adiar quando o de/para não resolve,
  chama `AdmissoesService.criarPreAdmissao` — cria em AGUARDANDO_LIBERACAO com candidato do Match +
  IDs do Pandapé, SEM cliente/cargo/frentes/documentos. Integra a Parte 1 do CPF (getMatch). Sem CPF,
  mantém o adiamento com log.
- **AdmissoesService**: `criarPreAdmissao` (pré-admissão), `liberar` (atribui cliente+cargo → régua →
  documentos PENDENTES → frentes AUDITORIA+EXAME → farol EM_ADMISSAO; retorna `temRegua`),
  `listarAguardandoLiberacao` (fila, leftJoin, dados do Match). Rotas: `GET /admissoes/aguardando-
  liberacao`, `PATCH /admissoes/:id/liberar` (operacional, sem restrição de papel; a de Master é só
  para RECUSAR, Parte 2).
- **Tela `/liberacao`** ("Liberação Admissional"), item próprio na Operação do Sidebar (ícone clock,
  decisão do diretor). Lista candidato/CPF/telefone/nascimento/sexo/origem/chegada + seletores de
  cliente e cargo + botão Liberar. Avisa quando o par não tem régua (não bloqueia).

### Auditoria do nulo (item 5, o custo real da abordagem)

`cod_cliente`/`cargo_id` nuláveis pela 1ª vez. Pontos verificados e como cada um trata o nulo:

- **SAFE por innerJoin** (a pré-admissão some da query): esteira `listar` filas/itens/KPIs; Gerenciador
  `listar` total/itens/KPIs (por isso a pré-admissão NÃO aparece nem conta lá); NCs; benefícios-memória
  por (cliente+cargo); régua-completude (todas as queries).
- **SAFE por exclusão de farol**: adicionei `AGUARDANDO_LIBERACAO` às listas junto de DECLINOU/RESCISAO
  (esteira `clientePeriodo` e Gerenciador `comPendenciaExpr`) — cinto reforçado.
- **CORRIGIDO (quebrava/tipo com nulo)**: `obter` do Gerenciador (guarda cliente/cargo/régua quando
  nulos); `auditoria.carregarAdmissao` e `esteira` detalhe (guard explícito → NotFound, inalcançável
  para pré-admissão); `esteira` gate de auditoria (narrow); relatório da clínica (guard no `continue`);
  `resolvePastaPaiId` (param aceita nulo, corpo já tratava); `frontend/lib/farol` (tom da pill).
- **Aceito (inalcançável)**: clicksign/auditoria só rodam sobre admissão com frentes/contrato, que a
  pré-admissão não tem; guard defensivo posto mesmo assim.

### Validação ao vivo (fábrica)

Cadeia real: getMatch de um idMatch real da vaga 847 → `criarPreAdmissao`. A pré-admissão aparece
**só** na fila de Liberação, com CPF (11 díg), telefone, nascimento e sexo do Match; **não vaza** em
nenhuma KPI da esteira nem do Gerenciador (total do Gerenciador segue 2158; filtro por
AGUARDANDO_LIBERACAO = 0). Liberar uma 2ª pré-admissão (cliente+cargo com régua) → EM_ADMISSAO, 2
frentes, 7 documentos, saiu da fila. A 2ª foi limpa; a 1ª ficou aguardando para o diretor validar na
tela. *(Prova visual §A.13 é do diretor: Chromium não sobe nesta VM.)*

### Para o diretor validar

Há **1 pré-admissão** na tela `/liberacao` (admissaoId `d32c95c8…`). Fluxo a conferir: vê o candidato
com dados do Match sem cliente/cargo → atribui cliente+cargo → Liberar → entra na esteira com
régua/documentos/frentes e some da liberação. Depois da validação, limpar a pré-admissão de teste.

---

## 2026-07-17 (noite, 2) — Liberação Admissional: ajustes visuais (itens 1, 2, 3)

**Ajustes na tela e no menu, NÃO commitados** (aguarda validação do diretor). O diretor validou o
fluxo da Parte 1 na tela (liberou a pré-admissão de teste #1, que virou EM_ADMISSAO na esteira);
essa #1 foi limpa e uma pré-admissão nova foi posta na fila para validar estes ajustes.

- **Item 1 (seletores)**: adicionado `menuFit` aos seletores de Cliente e Cargo — o painel aberto
  agora abre em `w-max` (até 560px) com `whitespace-nowrap`, exibindo a opção inteira sem cortar. E o
  cliente passou a mostrar o **NOME OPERACIONAL**: rótulo `código · nome operacional · razão social`
  (cai para `código · razão social` quando não há nome operacional). O campo `nomeOperacao` já existe
  em `clientes` e o `/admin/clientes` já o retorna (117/228 preenchidos); nada inventado.
- **Item 2 (menu)**: "Liberação Admissional" movido para o **3º item** da Operação. Faixa **vermelha
  premium** (`.nav-item-critical`: gradiente do `--danger`, texto branco, negrito, sombra) preenchendo
  a linha do item, vencendo hover/active, sem quebrar o layout (funciona recolhido também). Prop
  `critical` no `NavItem`/`NavDef`. É só o destaque visual; o contador/badge é a Parte 3, não feito.
- **Item 3 (tag Pandapé)**: **nada a remover** — a coluna Candidato já mostrava só o nome
  (`{candidatoNome}`), sem tag. A origem Pandapé nunca esteve colada ao nome. Reportado ao diretor.

Gate: typecheck (3 pacotes), eslint e 252 testes verdes. §A.13: prova visual é do diretor.

### PRÓXIMA OST da Liberação (registrada, pendente do diretor)

**Item 4 — formulário de pendências obrigatórias na liberação.** Ao liberar, além de cliente+cargo,
oferecer o preenchimento das demais pendências obrigatórias da admissão (salário, benefícios, escala,
data, centro de custo, gestor/BP etc.). **A trava de liberação segue só cliente+cargo** (o resto é
pendência que segue para a esteira, não bloqueia). **Campos exatos a definir pelo diretor.** Não
construído nesta OST.

---

## 2026-07-17 (noite, 3) — Liberação Admissional: reestruturação (tabela leitura + modal + tempo parado)

**Reestruturação da tela, NÃO commitada** (aguarda validação do diretor). Só a tela de Liberação.

- **Tabela só leitura + botão**: removidos os seletores de cliente/cargo de dentro da linha. Colunas:
  Candidato · CPF · Telefone · Nascimento · Sexo · Chegada · **Parado (dias)** · **Parado (horas)** ·
  Ação (botão Liberar). O botão abre o modal.
- **Tempo parado** (desde a Chegada até agora, `nowMs` fixado no load): duas leituras do MESMO total.
  Dias por **piso** (dias completos, decisão do diretor: 36h → "1 dia"), horas por piso. Singular/
  plural tratado ("1 dia"/"2 dias"). **Sem cor de urgência** (decisão do diretor: limites ficam para
  depois; as colunas já nascem prontas para receber a cor).
- **Modal de liberação** (base `Modal`): candidato identificado no topo (nome + CPF), seletores de
  Cliente e Cargo com espaço para respirar (`menuFit`). **Cliente = "código · nome operacional"**
  (razão social REMOVIDA da exibição; fallback "código · razão social" quando não há nome operacional).
  Botão Liberar dispara a lógica de nascimento existente; **trava segue só cliente+cargo**. O modal
  tem um marcador explícito onde a PRÓXIMA OST (pendências) adiciona campos ABAIXO de cliente/cargo,
  sem refazer o modal.

Validação ao vivo (fábrica): a pré-admissão de teste teve a chegada retroagida 36h para demonstrar as
colunas — a tela mostra "1 dia / 36 horas". Gate: typecheck (3 pacotes), eslint, 252 testes verdes.
Limpar a pré-admissão de teste após a validação do diretor. §A.13: prova visual é do diretor.

**PRÓXIMA OST da Liberação (item 4)**: campos de pendências obrigatórias DENTRO do modal, abaixo de
cliente/cargo (salário, benefícios, escala, data, centro de custo, gestor/BP etc.), com a trava de
liberação seguindo só cliente+cargo. **Campos exatos a definir com o diretor.** Webhook segue sem
cadastro no painel.

---

## 2026-07-17 (noite, 4) — Dedup Pandapé (opção D híbrida): DESENHO trazido, pendente de aprovação

**Desenho, NÃO implementado.** Aguarda aprovação do diretor antes de codar. Considera o novo fluxo:
o webhook cria PRÉ-ADMISSÃO em AGUARDANDO_LIBERACAO (commit c5bb98d), não admissão na esteira.

**Superfície real (medida):** 2158 admissões, só **2 VIVAS** (1 EM_ADMISSAO + 1 BANCO_AGUARDAR); 2156
terminais. Nenhuma histórica tem `integracao_pandape`. Pela §A.16, histórico terminal que volta é
processo NOVO, não duplicata → a duplicata cross-path só existe para CPF com admissão VIVA (2 hoje).

**Camadas:**
1. **Idempotência por idPrecollaborator (já existe, intacta):** mesmo id 2x → update/no-op, não duplica.
2. **Trava (b) por CPF vivo (núcleo do desenho):** antes de criar, busca VIVAS do CPF (EM_ADMISSAO/
   BANCO_AGUARDAR/AGUARDANDO_LIBERACAO). B1: existe VIVA de MESMO idVacancy → ATUALIZA, não cria.
   B2: VIVA de vaga diferente ou sem idVacancy → cria com **flag "possível duplicata"** para o humano
   reconciliar. B3: sem VIVA → cria. "Contexto" na chegada = **idVacancy** (o webhook tem), não
   cliente/cargo (que ainda não existem). Preserva os 36 CPFs com N admissões (vaga diferente = nova).
3. **Backfill (a): parte fraca, achado importante.** O `idPrecollaborator` **NÃO é backfillável** —
   `/v2/matches` traz idMatch/CPF, não idPreCollaborator, e não há caminho CPF→idPreCollaborator. O
   backfill só consegue gravar idMatch+idVacancy por CPF, é caro (varrer ~6928 vagas, teto 1000/5min),
   ambíguo (CPF em N vagas) e de rendimento ~zero hoje (2 vivos, talvez nem no Pandapé). Recomendação:
   **adiar ou escopar aos vivos**, não fazer em massa.

**Constraint:** unique cego por CPF está fora (36 CPFs com N admissões). Recomendado: trava em código
primeiro; opcional desnormalizar `idVacancy` em `admissoes` (migration pequena) para um **unique
parcial** `(candidato_cpf, id_vacancy) WHERE farol vivo AND id_vacancy not null` que blinda corrida.

**Decisões pedidas ao diretor:** (1) incluir o flag de possível duplicata (recomendo forte); (2)
desnormalizar idVacancy (recomendo); (3) backfill — adiar vs escopar aos vivos. **Webhook segue sem
cadastro no painel até a dedup fechar.**

---

## 2026-07-17 (noite, 5) — Dedup Pandapé IMPLEMENTADA (trava idVacancy + flag + unique parcial)

**Código pronto e validado ao vivo, NÃO commitado** (aguarda validação do diretor). Desenho aprovado
na entrada anterior. Backfill (a) ADIADO (idPrecollaborator não é backfillável, rendimento ~zero).

- **Migration 0029**: `admissoes.id_vacancy` (idVacancy do Pandapé desnormalizado) + `possivel_duplicata`
  (bool) + **UNIQUE PARCIAL** `uq_admissao_cpf_vaga_viva (candidato_cpf, id_vacancy) WHERE id_vacancy
  IS NOT NULL AND farol IN (EM_ADMISSAO, BANCO_AGUARDAR, AGUARDANDO_LIBERACAO)`. Só entre vivos e só
  com vaga → não barra wizard manual (id_vacancy nulo) nem 2ª admissão em vaga diferente / após terminal.
- **Trava (b) no webhook** (`criarAdmissao`), depois da idempotência por idPrecollaborator:
  `vivasPorCpf(cpf)` → B1 (mesma vaga viva) `adotarEventoPandape` (atualiza a existente, não duplica);
  B2 (viva sem idVacancy comparável) cria com `possivelDuplicata=true`; B3 (nenhuma/vaga diferente) cria
  normal. `create`/`criarPreAdmissao` gravam `id_vacancy` na admissão (dedup + unique). O race que fura
  o cheque é rejeitado pelo unique parcial (23505 → tratado como "já existe" pelo `ehViolacaoUnique`).
- **Flag na tela**: `listarAguardandoLiberacao` devolve `possivelDuplicata`; a coluna Candidato mostra
  badge "Possível duplicata" (laranja, com tooltip). NÃO bloqueia liberação (é alerta; humano decide).

**Validação ao vivo (fábrica):** unique parcial barra 2 vivas do mesmo CPF+vaga (23505), permite vaga
diferente, permite processo novo após terminal (§A.16), NÃO barra wizard manual (id_vacancy nulo).
B3 pela cadeia real (getMatch → cria com idVacancy=847). B1 real: 2º evento mesmo CPF+vaga → adotou
(idPrecollaborator atualizado), contagem seguiu 1, sem duplicar. Flag chega à API (possivelDuplicata=
true). Testes: 256 no backend (+4 dedup, com dente: B1/B2 falham sem a trava). Casos-limite dos 36 CPFs
preservados (vaga diferente/terminal). Limpar a pré-admissão de teste após validação.

**Com a dedup fechada, o Pandapé fica APTO ao painel** — mas o cadastro no painel é decisão do diretor,
e a tela ainda não tem item 4 (pendências) / Parte 2 (recusa) / Parte 3 (indicador/ping). Webhook
segue SEM cadastro no painel.

---

## 2026-07-17 (noite, 6) — Dedup COMMITADA + levantamento do item 4 (fonte a espelhar)

**Dedup Pandapé commitada e no remoto: `481e008`** (migration 0029 + trava B + badge). Gate verde (256
testes), add nominal, logo/scripts fora, pré-admissão de teste limpa. **Pandapé APTO ao painel, mas
SEM cadastro** — aguardando as 3 partes da tela (item 4 pendências → Parte 2 recusa → Parte 3
indicador/ping) e a decisão do diretor de quando ligar. Sequência aprovada: **item 4 → recusa → ping**.

**Levantamento do item 4 (fonte dos campos obrigatórios, SÓ diagnóstico):**
- **Fonte AUTORITATIVA = `pendenciasObrigatorias` (`domain/admissao.ts`)**, a régua unificada §A.19:
  Cliente · Cargo · Salário · Tipo de contrato · Data de admissão (ou Termo de Banco se isBanco) ·
  Pacote de benefícios · Escala · Centro de custo · Gestor/BP. Coluna, KPI, sinalizador, radar e o
  modal de pendências do lápis já concordam com ela por construção.
- **O lápis NÃO diverge** (o PendenciasModal traduz essa lista para os campos editáveis).
- **O wizard DIVERGE (mais rígido, definição antiga):** exige a mais Tempo de contrato, Data de
  nascimento, Telefone, E-mail (e Sexo/Nome no client), e — inversamente — NÃO inclui Data de admissão
  no `pend` do backend (mas a régua inclui). Espelhar o wizard recriaria a divergência que a §A.19
  eliminou.
- **Dependem de cliente+cargo (só carregam depois deles):** pacote de benefícios (memória por
  cliente+cargo) e régua documental. **Escala NÃO é filtrada por cliente** (catálogo aberto; só o
  valor sugerido vem do `escalaPadrao` do cliente). Os demais são globais/texto livre.
- **Recomendação:** o modal do item 4 espelha `pendenciasObrigatorias` (o que o lápis já espelha),
  não o wizard, para manter modal/coluna/KPI/sinalizador consistentes. Aguardando o diretor confirmar
  a fonte para montar a OST do item 4.

---

## 2026-07-17 (noite, 7) — Liberação Admissional, item 4: pendências obrigatórias no modal

**Código pronto e validado ao vivo, NÃO commitado** (aguarda validação do diretor). Espelha a fonte
autoritativa `pendenciasObrigatorias` (domain/admissao.ts, régua §A.19), REUSANDO o que já existe.

- **Modal** (abaixo de cliente/cargo, no marcador da Parte 1): Salário, Tipo de contrato (lista fixa
  do wizard), Data de admissão, Escala (catálogo `/catalogos/escalas`, sugestão via escalaPadrao do
  cliente), Centro de custo, Gestor/BP, **Pacote de benefícios** (MultiSelect + valores, REUSANDO
  `precisaValorBeneficio` de `lib/beneficios`; pré-preenchido pela memória cliente+cargo via
  `/admissoes/padrao-cliente-cargo`). **Tempo de contrato NÃO entra** (a régua unificada não o lista).
- **Trava = SÓ cliente+cargo.** Os demais campos são opcionais; hint no modal mostra o que ainda falta
  (não bloqueia). Data de admissão vazia não trava.
- **Backend `liberar`** estendido: valida valores do pacote (mesma `validarValoresDoPacote`), grava
  vagaFolha/tipo/data/pacote na pré-admissão e recalcula o sinalizador com os valores reais. Corrigido
  um bug latente: passava `nome:""` ao sinalizador → caía em PENDENTE; agora lê o nome real do
  candidato. DTO `LiberarAdmissaoDto` reusa `VagaFolhaInputDto`/`BeneficioAlocadoDto` do create.
- **Salário**: normalizado no front (pt-BR "2.500,00" → "2500.00") antes de enviar (numeric do banco).

**Validação ao vivo (fábrica):** liberar COMPLETO → admissão nasce EM_ADMISSAO com salário/escala/
centro/gestor/tipo/data + VR=500 gravados, 2 frentes, 7 docs, **sinalizador OK** (zero pendência).
Liberar SÓ cliente+cargo → nasce PARCIAL e a esteira lista as 7 pendências exatas da régua unificada;
data vazia NÃO bloqueou. Gate: 256 testes, typecheck/eslint verdes. Pré-admissão de teste na fila para
o diretor validar o modal; limpar após.

Reuso confirmado (nada recriado): `Select`, `MultiSelect`, `Modal`, `lib/beneficios`
(`precisaValorBeneficio`), catálogos `/catalogos/beneficios` e `/catalogos/escalas`, memória
`/admissoes/padrao-cliente-cargo`, `validarValoresDoPacote`. Faltam **Parte 2 (recusa)** e **Parte 3
(indicador/ping)** antes do Pandapé ao painel. Webhook segue SEM cadastro no painel.

---

## 2026-07-17 (noite, 8) — Item 4 commitado + tag Via Pandapé + Recusa (Parte 2)

- **Item 4 COMMITADO e no remoto: `a063ff5`** (modal de liberação espelhando pendenciasObrigatorias +
  fix do nome no sinalizador e da normalização do salário). Gate verde, add nominal, pré-admissão de
  teste limpa.

**Abaixo, NÃO commitado ainda** (aguarda validação do diretor na tela):

- **Tag "Via Pandapé" REMOVIDA** da coluna Candidato na Esteira e no Gerenciador (só o nome, §A.12).
  O `OrigemBadge` segue no detalhe (olho/lápis); o dado `origem` no backend intocado. Imports órfãos
  removidos.
- **Recusa (Parte 2):**
  - Migration 0030: farol `LIBERACAO_RECUSADA` (terminal, reversível) + colunas `recusado_por_id`/
    `recusado_em` (quem+quando, SEM motivo, decisão do diretor). Trilha permanente no
    `candidato_alteracoes_log` (mesmo padrão do declínio). Farol em FAROL_MANUAL + nas exclusões
    esteira/gerenciador (não vaza em fila/KPI). Fora do FAROL_SELECT_OPTIONS.
  - Backend: `recusarLiberacao`/`reativarRecusada`/`listarRecusadas`; rotas
    `PATCH /admissoes/:id/recusar` e `/reativar-recusada` com **@Roles("MASTER","SUPER_ADMIN")**
    (mesma trava do delete). Recusa exige AGUARDANDO_LIBERACAO; reativar exige LIBERACAO_RECUSADA.
  - Tela: toggle Aguardando × Admissões Recusadas; botão Recusar no modal (desabilitado p/ comum,
    ativo Master/SA); visão de recusadas com quem/quando; modal de detalhe com Reativar (idem papel).
  - **Validado ao vivo:** recusar (SA) → farol recusado + quem/quando + 1 evento na trilha, sai da
    fila, aparece em recusadas; Gerenciador segue 2158 (não vaza); reativar → volta a AGUARDANDO +
    limpa colunas + 1 evento na trilha. RBAC pelas @Roles (comum tem o botão desabilitado; backend
    barra por papel, como o delete). Gate: 256 testes, typecheck/eslint verdes.

Pré-admissão de teste deixada em AGUARDANDO para o diretor validar o fluxo de recusa/reativar na tela.
Falta só a **Parte 3 (indicador/ping)** antes do Pandapé ao painel. Webhook segue SEM cadastro.

---

## 2026-07-17 (noite, 9) — B+C commitado + Parte 3 (indicador + popup + ping): tela COMPLETA

- **B+C COMMITADO e no remoto: `2542100`** (recusa/reativação Parte 2 + remoção da tag Via Pandapé das
  tabelas). Gate verde, add nominal, dados de teste limpos.

**Parte 3, NÃO commitada ainda** (aguarda validação do diretor):

- **Endpoint de contagem leve:** `GET /admissoes/aguardando-liberacao/contagem` → `{count}` (um
  count por farol, sem payload). Barato: chamado por todos a cada ~90s.
- **Provider global `LiberacaoAlerta`** (no AppShell): UM polling só (90s) alimenta o badge do menu
  (via contexto `useLiberacaoCount`) E o popup. Sem canal de push → polling do cliente (padrão do
  RadarBanner + apiFetch, reusando Modal). NÃO empilha popup.
- **Badge no item de menu "Liberação Admissional"** (decisão do diretor: mais limpo que cabeçalho, e
  global — visível em qualquer tela, inclusive Farol e Gerenciador). Número em badge branco sobre a
  faixa vermelha; recolhido vira um ponto sobre o ícone; **zero → some**. Clicável (o item já leva a
  /liberacao).
- **Popup global:** sobe quando há pendência (0→>0), para TODOS os perfis; "Estou ciente" fecha e
  **suprime por 20 min** (decisão do diretor: reaparição espaçada, o contador segue vivo a 90s);
  "Ver liberação" leva à tela. "Estou ciente" NÃO zera o contador (só liberar/recusar zera). Zerou →
  popup fecha e para de subir.

**Validado (fábrica):** endpoint devolve `{count:1}` com uma pré-admissão na fila; pré-admissão
deixada em AGUARDANDO para o diretor ver o badge + o popup na tela. Gate: 256 testes, typecheck/eslint
verdes. Custo do count: `count(*)` por farol sobre ~2159 linhas (microssegundos); índice em
farol_global só se a base crescer muito.

**Com as 3 partes fechadas, a tela de Liberação Admissional está COMPLETA.** O Pandapé fica APTO ao
painel — cadastro é decisão do diretor (quando ligar). Webhook segue SEM cadastro no painel.

---

## 2026-07-17 — FECHAMENTO DE SESSÃO (retomar amanhã 18/07)

Gate no fechamento: **typecheck verde** (3 pacotes), **testes verdes** (backend 256, frontend 13,
shared-types 5). ESLint: só os **2 erros pré-existentes** de config (`nova/page.tsx`, `vt/page.tsx`,
`react-hooks/exhaustive-deps` não encontrada) — não são das mudanças da sessão. `main` sincronizado
com o remoto.

### COMMITADO E NO REMOTO HOJE (git log --oneline)
- `2542100` feat(liberacao): Parte 2 recusa/reativação (Master/Super Admin, farol LIBERACAO_RECUSADA,
  migration 0030) + remoção da tag "Via Pandapé" das tabelas (Esteira/Gerenciador).
- `a063ff5` feat(liberacao): item 4 (pendências obrigatórias no modal, espelha régua §A.19) + fix
  sinalizador/salário.
- `481e008` feat(pandape): dedup por idVacancy (trava viva + unique parcial + flag possível duplicata).
- `c5bb98d` feat(liberacao): Liberação Admissional Parte 1 (pré-admissão, webhook, tela, ajustes visuais).
- (antes na sessão: `e37ccaa` norma do diário; `7123e01` gates do exame + trilha declínio;
  `33ab7f9` CLAUDE.md 30 docs/§A.21/§A.22; `6bd8f8c` régua documental CRUD.)

### PRONTO MAS NÃO COMMITADO (Rike valida amanhã)
- **Parte 3 (indicador/ping/popup):** badge no item de menu Liberação (contagem via polling 90s),
  popup global com "Estou ciente" (reaparição 20min) e "Ver liberação", endpoint leve
  `GET /admissoes/aguardando-liberacao/contagem`. Arquivos no working tree:
  `admissoes.controller.ts`, `admissoes.service.ts` (endpoint), `components/shell/AppShell.tsx`,
  `components/shell/Sidebar.tsx` (badge), `components/ui/NavItem.tsx` (badge),
  `components/shell/LiberacaoAlerta.tsx` (NOVO, untracked).
  ⚠️ **`Sidebar.tsx` está MISTURADO** (badge da Parte 3 + mudanças do LOGO soltas): ao commitar a
  Parte 3 amanhã, separar cirurgicamente (mesmo procedimento já usado: voltar ao HEAD, reaplicar só a
  Parte 3, add, restaurar). `globals.css` no working tree é só LOGO (não foi tocado na Parte 3).

### SOLTOS NO WORKING TREE (conscientes, NÃO commitar sem decisão do Rike)
- **Logo:** `globals.css`, `Sidebar.tsx` (parte logo), `LogoEA.tsx`, `logosoulan.png`.
- **Scripts de dados (4 em db/):** `backfill-motivo-declinio.ts`, `carga-frente1.ts`,
  `corrige-frente1.ts`, `recalcula-sinalizador-vivas.ts`. **`carga-frente1.ts` tem os 2 furos JÁ
  CORRIGIDOS no working tree** (`normalizeCpf(r.cpf)` linha 53, `isNull(dataAdmissao)` linha 65) —
  mas NÃO commitado; **um checkout limpo rodaria a versão bugada.**

### HIGIENE
- **Pré-admissão de teste PRESERVADA** em AGUARDANDO_LIBERACAO (total da base = 2159 = 2158 + 1). O
  Rike vai usá-la amanhã para validar a Parte 3 (badge + popup). **Limpar só depois da validação.**

### PLANO DE GO-LIVE DO PANDAPÉ (definido hoje; executar amanhã, NÃO agora)
Ordem segura: (1) **commitar `carga-frente1.ts` corrigido**; (2) Rike **gera o extrato fresco** pelo
normalize.py (insumo dele, fora do repo — NÃO está nesta máquina); (3) rodar a carga em **DRY-RUN
(CARGA_DRY=1)** e conferir contagens + duplicatas de campo-chave ANTES de gravar; (4) **rodar a carga
real**; (5) **só então cadastrar o webhook no painel** (corte temporal natural).
Ressalvas conhecidas (levantamento de hoje):
- A carga **NÃO tem update-path**: correções de campos-chave (cliente/cargo/data) no extrato fresco
  **DUPLICAM** essas linhas (chave nova = insert novo, a antiga fica).
- A carga grava **idVacancy NULO** (a planilha não tem o id da vaga), então o **unique parcial NÃO
  protege** a sobreposição carga×webhook. Quem protege é a **FLAG "possível duplicata"**: pessoa VIVA
  da carga que reaparece pelo webhook → cria com flag → consultor reconcilia na tela (nunca duplica
  calado). Superfície viva da carga hoje: 2 (1 EM_ADMISSAO + 1 BANCO_AGUARDAR).
- Data de corte não é obrigatória (a flag cobre), mas reduz o ruído de flags; o corte real é o
  momento de cadastrar o webhook no painel.

### DECISÕES PENDENTES DO RIKE (amanhã)
1. Validar a **Parte 3** e mandar commitar (separando do logo no Sidebar.tsx).
2. Decidir se **commita o `carga-frente1.ts` corrigido** (recomendado) antes de rodar a carga.
3. **Gerar o extrato fresco** (normalize.py).
4. Definir o **momento controlado de cadastrar o webhook no painel = go-live**.

### ESTADO DA TELA DE LIBERAÇÃO ADMISSIONAL
**COMPLETA:** Parte 1 (núcleo + modal + tempo parado), item 4 (pendências obrigatórias), Parte 2
(recusa/reativação), Parte 3 (indicador/ping, pronta a validar). **Pandapé APTO ao painel; webhook
SEM cadastro.**

---

## 2026-07-20 — Parte 3 da Liberação COMMITADA; tela de Liberação Admissional COMPLETA

**Rike validou na tela e autorizou a §A.21.** A Parte 3 (que estava pronta mas não commitada) foi
commitada, e com ela a **tela de Liberação Admissional está COMPLETA (Partes 1+2+3 + item 4)**.

### O QUE ENTROU (commit `3911be1`, feat(liberacao): Parte 3)
- **Indicador/badge + popup:** provider único `LiberacaoAlerta` no topo da casca (`AppShell`). Badge
  no menu via contexto (`useLiberacaoCount`), popup insistente com reaparição de 20min. Endpoint leve
  `GET /admissoes/aguardando-liberacao/contagem` (só count por farol `AGUARDANDO_LIBERACAO`).
- **Correção do contador (refresh imediato):** o badge agora **cai/sobe na hora** ao liberar/recusar/
  reativar. O provider expõe `useLiberacaoRefresh` (rebusca imediata do `tick`), e a tela chama logo
  após a resposta OK de cada ação. Polling de 90s mantido como rede de fundo; popup de 20min intocado.
- **Busca por candidato:** campo `type=search` (padrão da esteira, barra cilindro) que filtra as
  **duas** visões (Aguardando e Recusadas) ao mesmo tempo, por **nome parcial OU CPF** normalizado por
  dígitos (com/sem pontuação), client-side (as listas já estão em memória). Contadores das abas e
  estados vazios acompanham a busca; busca vazia = listas completas.
- **Sidebar separado cirurgicamente (§A.21):** só o hook + badge da Parte 3 entraram no commit; o
  **logo continua solto** no working tree (método do diário: reconstruir a versão só-Parte-3, stageá-la,
  restaurar a completa).

### CAUSA RAIZ DIAGNOSTICADA NO CAMINHO (registro p/ futuro)
O "refresh não pegou" na 1ª validação **não era bug de código** (os 3 pontos — chamada no lugar certo,
contexto único, badge lê o estado do refresh — estavam corretos). O frontend prod (`next-server`,
systemd `ea-frontend`) servia um **build antigo (18/07)**; o fonte não é recompilado sozinho. Correção
= **sequência segura stop→build→start** (memória do projeto: nunca buildar/dev com o serviço no ar,
clobbera `.next`). Feita duas vezes (contador e busca). Build final `E3tEdawpMmRrFWuzskCX1`.

### GATE
Typecheck verde. Lint com os **2 erros pré-existentes de config** (`react-hooks/exhaustive-deps` não
encontrada em `nova/page.tsx:299` e `vt/page.tsx:245`), nenhum novo. **274 testes** verdes (backend
256, frontend 13, shared-types 5). `main` sincronizado com o remoto após o push.

### CONTINUAM SOLTOS (conscientes, fora deste commit)
- **Logo:** `globals.css`, `LogoEA.tsx`, `logosoulan.png` e a **parte-logo do `Sidebar.tsx`** (que
  ficou `MM`: Parte 3 commitada + logo solto).
- **4 scripts de dados** em `db/`: `backfill-motivo-declinio.ts`, `carga-frente1.ts` (com os 2 furos
  já corrigidos, ainda não commitado), `corrige-frente1.ts`, `recalcula-sinalizador-vivas.ts`.

### ABERTO (inalterado)
Go-live do Pandapé (commitar `carga-frente1.ts` → extrato fresco → dry-run → carga → cadastrar webhook)
e a decisão sobre o logo. **Tela de Liberação Admissional: COMPLETA.**

---

## 2026-07-20 — Carga fresca do go-live Pandapé (extrato 20/07), em 2 rounds. Webhook AINDA sem cadastro

Carga do extrato **`CARGA ATUALIZADA ADMISSOES 20-07.xlsx`** (o de/para e a geração dos CSVs pela
fábrica, `frente1_ok.csv` + `backfill_motivos.csv`, insumos fora do repo). Executada em 2 rounds
(carga inicial + recuperação de falhas). **Parou ANTES do webhook**, aguardando validação do Rike na
tela e a decisão do momento de ligar (o corte do go-live).

### RESULTADO REAL (com ressalvas honestas)
- **Base 2159 → 2281** (122 admissões líquidas agregadas pelo extrato).
- **Estado final por farol:** ADMISSAO_CONCLUIDA **1485** · DECLINOU **705** · RESCISAO **55** ·
  EM_ADMISSAO **34** · BANCO_AGUARDAR **2**. **Superfície viva: 36** (34 EM_ADMISSAO + 2 BANCO) — é o
  que acende a esteira ao vivo.
- **Ressalva 1 (sem perda):** dos rows "recuperados" por nome, **19 já existiam na base com o CPF
  correto** — o extrato trazia CPF com typo, e o dedup `(cpf+cliente+cargo+data)` reconheceu que eram
  duplicatas do typo e pulou. Por isso o round de recuperação criou só **4 novas** (ERIK vivo + 1
  declínio + 2 concluídas), não 23. Nada perdido.
- **Ressalva 2 (sem deleção):** diferença de **2** entre a soma dos contadores `created` (124) e o
  crescimento líquido (122) = **reconciliação do farol derivado (§A.16)**, que reclassifica alguns
  EM_ADMISSAO como concluídos. **Integridade verificada:** 0 grupos com chave duplicada, re-run
  idempotente (`created=0`), a rotina de importação só faz UPDATE (nunca DELETE).
- **Falhas que o dry-run não pegou:** o DRY não chama `create`, então `isValidCpf` e limites de coluna
  só disparam na carga real. 1º round: 34 falhas (32 CPF inválido + 2 telefone >30). Recuperadas no 2º
  round (20 CPF por nome único + DIEGO com CPF corrigido pelo Rike + IGOR/ERIK com telefone corrigido).

### PENDENTES DE CPF (fora do sistema)
- **41 admissões** (39 declínios + 2 concluídas) sem CPF em nenhuma fonte, guardadas no
  **`pendentes_cpf.csv`** (nome/cliente/cargo/data/farol), **FORA do EA**, para tratar na **Fase 6
  (dashboards)**. Não entram agora (candidato exige CPF válido, §A.3; marcador/estrutural avaliado e
  descartado por ora). Nota de composição: GUILHERME (linha 2016) recuperou por nome e entrou;
  GEOVANNA (156, concluída) não casou e é pendente.
- **Decisão registrada:** os **29 declínios sem CPF originais** + estes **41** = todos tratados na
  **Fase 6**, como contagem de declínio por cliente/motivo (sem candidato), não como ficha na esteira.

### CADASTROS APLICADOS (catálogo, passo de "aplicar")
- **12 cargos novos** (Atendente, Caixa, Analista de Contas a Pagar PL, Analista de Departamento
  Pessoal, Analista de Engenharia, Supervisora de Caixa, Auxiliar de Escritório, Analista de Expansão,
  Coordenador Comercial, Atendente de Marketing, Desenvolvedor Frontend, Especialista Tech Canais
  Digitais) + 1 já existente (Assistente Comercial, mapeado). **4 clientes novos** (57384 CIA DAS
  LETRAS-RJ, 57315 BUNGE, 51260 EUCATEX, 57390 SLING). **26º motivo de declínio** (CLIENTE NÃO CONVOCOU).
- **Backfill de motivos feito:** declínios com motivo **759/760**.

### COMMIT / GATE
- **`06b1cad`** `chore(carga): carga-frente1 com CPF normalizado, dataAdmissao null-safe e matrícula
  preservada` (só o script; logo e os outros 3 scripts de dados seguem soltos).
- **Gate verde:** typecheck, lint (só os 2 erros de config pré-existentes), **274 testes**.

### WEBHOOK DO PANDAPÉ: AINDA SEM CADASTRO no painel
Aguarda a **validação do Rike na tela** (base carregada) + a **decisão do momento de ligar** = o corte
do go-live. Só depois disso o motor da esteira passa a receber admissões vivas de verdade.

---

## 2026-07-21 — GO-LIVE DO PANDAPÉ: webhook cadastrado, ATIVO e CONFIRMADO AO VIVO

**Marco fechado.** O motor da esteira está ligado: o EA passou a receber admissões vivas de verdade,
não mais só dado histórico de carga. É o item 2 da §A.18.

### Cadastro no painel do Pandapé (feito pelo Rike)
- **Nome do webhook:** `EA Automatic`.
- **Evento:** "Candidato enviado para admissão" (o único cujo payload traz `IdPreCollaborator`,
  confirmado pelo suporte/André).
- **URL:** `https://soulan.com.br/webpanda/webpanda.php` (ponte PHP no box público do Fernando, que
  repassa ao EA na rede interna em `192.168.1.22:3010/api/webhooks/pandape`). A URL do EA **não** vai
  no painel.
- **Autenticação: token estático**, e o campo recebe **só o código**, sem a palavra "Bearer": o painel
  do Pandapé monta sozinho o header `Authorization: Bearer <token>`. A ponte valida esse Bearer e
  injeta o `x-pandape-webhook-token` no repasse, que é o que o `PandapeWebhookGuard` confere. Modelo
  **token-only** (§A.5/§A.9: o box está atrás de NAT, `PANDAPE_WEBHOOK_IPS` vazio de propósito).

### Verificação da ponte antes de ligar (feita nesta sessão)
Três testes contra a URL pública, resultado igual ao esperado: GET → **405**; POST sem Bearer → **403**
`forbidden`; POST com Bearer correto e corpo sem `IdPreCollaborator` → **400 vindo do EA**
(`IdPreCollaborator ausente no payload`). Esse 400 é a prova de que a mensagem foi gerada pelo backend
do EA, ou seja, o caminho estava fechado ponta a ponta antes do cadastro. Infra conferida junto:
`ea-backend` e `ea-frontend` active, `ea-db` e `ea-redis` healthy, Redis respondendo PONG.

### TESTE AO VIVO: fluxo real confirmado
**Duas admissões REAIS chegaram do Pandapé e caíram na tela de Liberação Admissional.** Fluxo
confirmado ponta a ponta: **Pandapé → ponte `webpanda.php` → EA**. Sistema recebendo fluxo vivo.
Comportamento conforme o desenho: sem o de/para vaga→cliente (manual por design, decisão fechada), a
pré-admissão nasce em `AGUARDANDO_LIBERACAO` com candidato e IDs do Pandapé, sem cliente/cargo/frentes,
e o consultor atribui cliente + cargo na tela de Liberação.

### Carga fresca concluída antes do corte
Extrato de 20/07 aplicado antes de ligar o webhook: base **2159 → 2281**. Ficaram **41 pendentes de
CPF** no arquivo externo (`pendentes_cpf.csv`, fora do EA), para tratar na **Fase 6**.

### Estado
O corte temporal do go-live está feito: o que vier daqui para frente entra pelo webhook; o que está na
base é histórico de carga. **Próximo item da §A.18: a Tela de Gestão de Pendências Obrigatórias
(§A.19)**, que agora tem sentido, existe admissão viva chegando para preencher.

---

## 2026-07-21 (tarde) — Auto-refresh da lista de Liberação + LIBERAÇÃO EM MASSA (aguardando validação)

Duas OSTs na sequência do go-live, ambas na tela de Liberação Admissional. **Nada commitado**: as duas
aguardam a validação do diretor na tela (§A.21, passo 2).

### OST 1, auto-refresh da LISTA (entregue, em produção para validar)
Com o Pandapé ligado, a pré-admissão cai a qualquer momento e a lista não se atualizava sozinha (só o
badge do menu tinha polling). Agora a lista recarrega com **dois gatilhos**: o **mesmo ciclo de 90s**
do contador (`LIBERACAO_POLL_MS` exportado do `LiberacaoAlerta`, um número só governando os dois) e a
**mudança da contagem do provider** (subiu ou desceu, a lista reflete na hora). Recarga silenciosa e
parcial: rebusca só as duas listas, **não** os catálogos, não mexe em `loading`, `busca`, aba nem
mensagens, e por isso **a busca digitada não é limpa** (o filtro é client-side sobre as listas). Uma
recarga em voo por vez; pausa com a aba do browser em segundo plano; falha de rede é silenciosa.
Arquivos: `components/shell/LiberacaoAlerta.tsx`, `app/(app)/liberacao/page.tsx`.

### OST 2, liberação em MASSA (entregue, em produção para validar)
Caso real que motivou: 50 pré-admissões do mesmo cliente e cargo, inviável uma a uma.

**Backend.** O miolo do nascimento foi **extraído** do `liberar` para `aplicarLiberacao(tx, ...)` e a
leitura da régua para `lerReguaDoPar(exec, ...)`. O individual passou a chamar o mesmo miolo, **sem
mudança de comportamento**; o lote reusa **exatamente** o mesmo código (sinalizador da régua unificada
§A.19, frentes AUDITORIA+EXAME da regra 1, documentos PENDENTES da régua, benefícios). Nada foi
recriado. `liberarEmLote(ids, dto, user)`: valida cliente e cargo **uma vez**, valida o pacote de
benefícios **uma vez** (mesma `validarValoresDoPacote` do individual), lê a régua **uma vez** e percorre
os ids em **N transações independentes**, devolvendo `{ liberadas, falhas }`. Rota
`PATCH /admissoes/liberar-lote`, **sem `@Roles`** (espelha a individual, liberar é operacional),
declarada **antes** do `@Patch(":id")` para o `:id` não engolir o path.

**Conjunto de campos do lote (ajuste do diretor, JÁ INCORPORADO nesta entrega).** O lote nasceu com só
cliente e cargo e o diretor pediu, antes do commit, **todos os campos da liberação individual**:
cliente, cargo, salário, benefícios, escala, centro de custo, gestor/BP, tipo de contrato e data de
admissão. **Obrigatórios seguem sendo só cliente + cargo.** O que o consultor preenche é aplicado a
**todas as N** do lote (caso real: mesmo cliente, cargo e salário, preenche uma vez); o que fica em
branco vira **pendência individual** de cada admissão, pelo `calcSinalizadorPreenchimento` de sempre.
A **data de admissão não tem tratamento especial** (decisão do diretor): igual aos demais campos.
Os benefícios reusam a régua de valor e a **memória de pacote por (cliente + cargo)** do individual,
agora também oferecida no lote. O DTO reusa `VagaFolhaInputDto` e `BeneficioAlocadoDto` do `create`.

**Regras de bloqueio (decisões do diretor), todas antes de qualquer transação:**
- **Teto de 50** por lote, no DTO e de novo no service.
- **Par sem régua documental**: o lote é barrado inteiro. Nascer 1 sem checklist é a regra 5; nascer 50
  sem checklist não. O backend é a autoridade, então chamada direta também não contorna.
- **Possível duplicata**: não é liberada em massa, vira falha reportada. O front já a separa antes.
- **Parcial-com-relatório**: a de número 30 falhar não desfaz as 29 nem impede as 20 seguintes.
  Reprocessar é seguro (a já liberada não está mais em AGUARDANDO_LIBERACAO e cai como falha).

**Frontend.** Coluna de checkbox (44px) na aba Aguardando, `min-w` de 900 para 944px dentro do
`overflow-x-auto` que já existia; "selecionar todos" marca **só as linhas visíveis pela busca**; barra
de ação com a contagem; **modal do lote com TODOS os campos da liberação individual** (obrigatórios só
cliente e cargo), com a memória de pacote do par pré-preenchendo os benefícios e a escala padrão do
cliente, listando e bloqueando as duplicatas; hint do que segue pendente em cada uma; botão
"Liberando…"; modal de **relatório** com liberadas e falhas por candidato. A busca da memória e a
montagem do pacote viraram funções compartilhadas: individual e lote usam o MESMO código. A seleção é **podada por id** a cada recarga
automática: sumiu da lista, sai da seleção. *(Extensão da máscara §A.12 com coluna de seleção,
aprovada pelo diretor.)*

**Decisão de rota (perguntada ao diretor, §A.30):** a trava de par sem régua **não** ganhou rota de
consulta. A listagem de régua é `@Roles("MASTER","SUPER_ADMIN")` e consultor Comum não a acessa;
abrir a rota afrouxaria o RBAC e criar outra fugiria do escopo. O bloqueio acontece **no confirmar**,
com a mensagem do backend dentro do modal e **nenhuma admissão liberada**.

### Gate e commit
Typecheck limpo, lint com os **2 erros de config pré-existentes** (`react-hooks/exhaustive-deps` em
`nova/page.tsx` e `vt/page.tsx`), **282 testes** (264 backend, 13 frontend, 5 shared-types). Entre eles
**8 novos** em `admissoes.liberar-lote.spec.ts`: transação por admissão, campos preenchidos aplicados às
N com os vazios seguindo como pendência individual, parcial-com-relatório, duplicata fora do lote, par
sem régua barrando antes de qualquer transação, teto de 50, seleção vazia e cliente inexistente.
Backend e frontend rebuildados e serviços reiniciados (`/liberacao` 200, API 200).

**Diretor VALIDOU na tela** (modal completo, obrigatórios só cliente e cargo) e a rotina §A.21 foi
executada: `git add` nominal dos 6 arquivos das duas OSTs, commit, flag `READY_*` criada, push, flag
removida. Logo, `LogoEA.tsx` e os scripts de dados seguem **soltos, fora do commit** (§A.14).

*Nota de recorte: o auto-refresh (OST 1) entrou no MESMO commit da massa. Os dois vivem no mesmo
`liberacao/page.tsx` e o `LIBERACAO_POLL_MS` exportado é consumido por ele, então não havia como
separar por arquivo sem cirurgia no diff.*

### Aberto
Ressalva de processo (§A.13): sem screenshot, o Playwright headless não sobe nesta VM (faltam
bibliotecas de sistema que exigem `sudo`, destravar do diretor). A validação foi feita pelo diretor
direto na tela de produção.

---

## 2026-07-21 (noite) — Documentos padrão na régua documental (VALIDADO e commitado)

Diretor validou na tela os dois usos e **executou a aplicação em massa**. §A.21 cumprida.

### Números confirmados ANTES de construir (o diretor não precisou chutar)
- Catálogo: **30 tipos de documento, todos ativos**, e a tela da régua lista os 30.
- Os **7 códigos do padrão existem** no catálogo e estão ativos: `RG`, `CPF`, `CTPS`,
  `COMPROVANTE_RESIDENCIA`, `DADOS_BANCARIOS`, `COMPROVANTE_ESCOLARIDADE`, `RESERVISTA`.
- Base da régua hoje: **3.047 linhas, 432 pares, 206 clientes**. **431 pares têm exatamente o mesmo
  conjunto de 7 obrigatórios**; o único fora do padrão é **54981, Auxiliar de Expedição**, com 30
  documentos, editado à mão em 16/07.
- **11 pares** cliente+cargo estão em uso por admissões e **sem nenhuma régua** (5 deles com admissão
  viva): AVL/Analista de Engenharia, CATENA IT/Desenvolvedor Frontend, SLING/Analista de Departamento
  Pessoal, SONOVA/Analista de Expansão, SOULAN/Consultor Trainee (esses 5 vivos) e BMB (OBRAMAX)/
  Analista de Roteirização, BUNGE/Manager de HRBP, CIA DAS LETRAS-RJ/Faxineiro(a), EUCATEX/Analista de
  Contas a Pagar PL, MEIWA/Auxiliar de Escritório, SOULAN/Consultor Pleno.

### Padrão (decisão do diretor) e fonte única
Os **7 documentos como OBRIGATORIO**. **ASO NÃO entra**: quem controla o exame é a frente EXAME
(§A.16), e cobrá-lo na régua criaria exigência duplicada. Os demais tipos ativos ficam NAO_OBRIGATORIO,
que já é o default da tela.

Os 7 códigos foram **promovidos do `seed-regua-padrao.ts` para `CODIGOS_REGUA_PADRAO` em
`packages/shared-types`**, consumida agora pelas **três** bocas: o botão da tela, a aplicação em massa e
o próprio seed (que deixou de definir o padrão e passou a consumi-lo). Elas não podem mais discordar.

### Uso (a), botão na régua atual
"Aplicar documentos padrão" em `/admin/regua`: marca os 7 como OBRIGATORIO **no mapa em memória**, sem
tocar no resto do mapa (o que estava marcado à mão não é apagado nem rebaixado). Nada vai ao banco no
clique; o consultor confere e usa o "Salvar régua" que já existia (`PUT /admin/regua`). **Zero backend
novo neste uso.**

### Uso (b), aplicação em massa nos pendentes
Rotas novas em `admin/regua` (herdam o `@Roles("MASTER","SUPER_ADMIN")` da classe):
`GET pendentes-padrao` (lista o alvo, alimenta a confirmação) e `POST aplicar-padrao-pendentes`.
- **Alvo restrito, por design:** só pares que **já são usados por admissões** e não têm régua. **Não**
  se cria régua para todo cargo do catálogo (232 clientes × 370 cargos daria 85.840 pares inventados).
- **Só adiciona onde não há nada:** o alvo já exclui quem tem régua e o insert ainda vai
  `onConflictDoNothing`. **Nada é sobrescrito e nada é apagado**, então o par 54981 editado à mão fica
  intocado. Rodar duas vezes não duplica.
- O alvo é **recalculado no servidor**, não vem do cliente. Tela de confirmação lista os pares antes de
  gravar, e o relatório mostra o que foi aplicado.

**O `seed-regua-padrao.ts` NÃO foi usado como motor (proibição do diretor, e com razão):** ele
`delete from regua_documental` e faz cross join de todos os clientes por todos os cargos. Rodado hoje
geraria **85.840 pares e 600.880 linhas** e destruiria a régua customizada. Ele segue existindo só como
carga inicial; o motor do botão é a rota nova, cirúrgica e sem DELETE.

### Gate
Typecheck limpo nos dois apps, lint com os **2 erros de config pré-existentes**, **287 testes**
(269 backend, 13 frontend, 5 shared-types). **5 novos** em `regua-padrao.spec.ts`: os 7 códigos, a
ausência do ASO, inserção de 7 por par como OBRIGATORIO, uso de `onConflictDoNothing` sem nenhum
delete, e nada inserido quando não há pendente. Backend e frontend rebuildados e reiniciados
(`/admin/regua` 200).

### RESULTADO REAL da aplicação (conferido no banco depois da validação)
- Base da régua: **3.047 → 3.297 linhas**, **432 → 448 pares**, **206 → 210 clientes**.
- **Os 11 pares alvo receberam exatamente 7 documentos OBRIGATORIO cada** (77 linhas): AVL, BMB
  (OBRAMAX), BUNGE, CATENA IT, CIA DAS LETRAS-RJ, EUCATEX, MEIWA, SLING, SONOVA e os dois pares da
  SOULAN. Nenhum deles nasce mais sem checklist.
- **O par 54981 (Auxiliar de Expedição) segue com os 30 documentos**, intocado: a semântica "só adiciona
  onde não há nada" fez o que prometia.
- As demais 173 linhas do dia são **trabalho manual do diretor na tela** (6 pares do cliente 57269 CIA
  DAS LETRAS, salvos com o botão do padrão + os demais tipos como não obrigatórios). Conferido: nenhuma
  linha antiga foi alterada ou apagada por esta entrega.

### Commit e gate
Gate verde: typecheck limpo, lint com os **2 erros de config pré-existentes**, **287 testes** (269
backend, 13 frontend, 5 shared-types), sendo 5 novos em `regua-padrao.spec.ts`. `git add` nominal de 6
arquivos; logo, `LogoEA.tsx` e os 3 scripts de dados seguem **soltos, fora do commit** (§A.14). Flag
`READY_*` criada após o gate e a validação, push, flag removida.

Ressalva §A.13: sem screenshot (Playwright headless não sobe nesta VM, falta `sudo` para as
bibliotecas). A validação foi feita pelo diretor direto na tela de produção.

---

## 2026-07-21 (noite, 2) — Opção "em branco" nos dropdowns opcionais da liberação (aguardando validação)

**Nada commitado**: aguarda a validação do diretor na tela (§A.21, passo 2).

**Problema.** Os dropdowns da liberação vinham pré-preenchidos pela memória do par cliente+cargo e
**não tinham como voltar a vazio**. Sem a informação correta em mãos, o consultor era empurrado a
liberar com um valor que podia estar errado.

**Solução (decisão do diretor).** Mantém o pré-preenchimento (agilidade) e acrescenta a opção
**"Não informado"** como primeira opção dos dropdowns OPCIONAIS. Selecioná-la **esvazia** o campo,
mesmo que ele tenha vindo pré-preenchido, e o campo esvaziado vira **pendência individual** na esteira
pelo `calcSinalizadorPreenchimento` de sempre (regra 5, não-bloqueio). Nenhuma mudança de backend.

**Escopo real, confirmado na tela (a lista da OST não batia).** Os dropdowns opcionais da liberação são
**dois**, e valem para os **dois** modais (individual e massa), logo **4 seletores**: **tipo de
contrato** e **escala**. Cliente e cargo ficaram de fora, são a trava obrigatória. Benefícios é
`MultiSelect` e já esvaziava desmarcando, não precisou de opção vazia.

**Divergência levantada e decidida pelo diretor:** a OST citava **"tempo de contrato"**, que **NÃO
existe no modal de liberação** (nem individual nem massa). Ele vive no wizard de Nova Admissão (§A.22,
lista 30 a 270 dias). Perguntei antes de agir (§A.30) e o diretor decidiu **deixar como está**: o campo
não é adicionado à liberação, e a entrega fica só nos dois dropdowns que realmente existem lá.

**Nota visual:** com a opção vazia presente, um campo em branco passa a exibir "Não informado" no lugar
do placeholder "Selecione…". É deliberado e usa o vocabulário da §A.11 para vazio.

### Gate
Typecheck limpo nos dois apps, lint com os **2 erros de config pré-existentes**, **287 testes**
(269 backend, 13 frontend, 5 shared-types), sem teste novo (mudança é de opções de UI, sem regra nova:
o comportamento de campo vazio virando pendência já é coberto pelos testes do lote e do sinalizador).
Frontend rebuildado e reiniciado (`/liberacao` 200). Backend não foi tocado.

### Aberto
Validação do diretor: esvaziar um dropdown pré-preenchido, liberar, e conferir que o campo aparece como
pendência individual, no individual e no massa. Ressalva §A.13: sem screenshot (Playwright headless não
sobe nesta VM).

---

## 2026-07-21 (noite, 3) — De/para de documentos do Pandapé implementado (aguardando validação)

**Nada commitado**: aguarda a validação do diretor (§A.21, passo 2). Escopo TRAVADO no de/para: **não**
houve migração para a v3, **não** houve pull na liberação e **não** houve scheduler. Isso vem nas OSTs
seguintes, nesta ordem.

### Bloco 1, normalizador geral (sem gambiarra por string)
O diagnóstico era: o mapa comparava o rótulo inteiro normalizado, e os nomes do Pandapé vêm decorados.
A correção é **geral, em duas camadas**, e não caso a caso:
1. **Normalizador** passou a remover o **conteúdo entre parênteses** (decoração/instrução ao candidato)
   e o `trim` já mata o espaço à direita que a API manda. Isso sozinho resolve CTPS, CNH e Conta
   Bancária, que viram "ctps", "cnh" e "conta bancaria".
2. **Desambiguação por especificidade**: entre as chaves do mapa que aparecem no rótulo como
   **sequência de palavras inteiras**, vence a **mais longa**. É o que faz "Certidão de Nascimento dos
   filhos até 21 anos" cair em CERTIDAO_NASCIMENTO_FILHOS, e não no CERTIDAO_NASCIMENTO genérico.
   Casar por palavra inteira é deliberado: por pedaço de palavra, "pis" bateria dentro de qualquer
   palavra que contivesse essas letras.

**Por que ainda existem âncoras explícitas por formulário** (a OST pediu para declarar): 6 casos não
são dedutíveis de regra nenhuma, porque o nome do formulário do Pandapé **diz mais** do que o tipo do
catálogo, e a correspondência é semântica, não textual. São eles: "Cartão de Inscrição no PIS" →
PIS_PASEP, "Cartão SUS" → CARTAO_SUS, "Comprovante de Estado Civil ou Certidão de Nascimento" →
CERTIDAO_NASC_CASAMENTO, "Certificado de Reservista" → RESERVISTA, "FOTO DO ROSTO PARA CRACHA" →
FOTO_CRACHA e "Comprovante de frequência escolar dos dependentes" → FREQUENCIA_ESCOLAR_DEPENDENTES.
Adivinhar essas por heurística seria inventar tipo, o que a §A.3 proíbe.

### Bloco 3, tipos novos e ARMAZENAMENTO (confirmado ANTES de gravar, como a OST exigiu)
Criados por `seed-tipos-documento-pandape.ts` (idempotente, upsert por `codigo`): **FOTO_CRACHA**
("Foto para Crachá") e **FREQUENCIA_ESCOLAR_DEPENDENTES** ("Comprovante de Frequência Escolar de
Dependentes"). Ambos **ATIVOS** e **NÃO obrigatórios**; nenhuma régua existente foi tocada. Catálogo:
**30 → 32 tipos**; régua permanece em 3.297 linhas.

**Destino físico do FOTO_CRACHA, conferido no código:** o roteamento é `resolveSubpasta`
(`ai/drive-routing.ts`), que só desvia ASO, FORMULARIO_VT, CARTAO_TRANSPORTE e TERMO_BANCO; todo o
resto cai no default **DOCUMENTOS_PESSOAIS**, dentro do prontuário do candidato no Drive. O FOTO_3X4
também cai nesse default, então **FOTO_CRACHA já grava no mesmo local físico do FOTO_3X4 sem uma linha
de código a mais**: tipo separado no catálogo, mesma subpasta. Nada foi alterado no roteamento.

### Bloco 4, exclusões deliberadas
Ficaram registradas **em código** (`EXCLUIDOS_DE_PROPOSITO`), para que a ausência de destino seja lida
como decisão e não como esquecimento: Vale Transporte (outra frente, §A.17), Consulta de Qualificação
Cadastral eSocial (não trazer), Atestado Médico Admissional (é o ASO, frente EXAME, §A.16) e as três
seções de campos estruturados (Dados Contratuais, Dados Pessoais, Dependentes).

### PENDÊNCIA QUE VOLTA PARA O DIRETOR
**"Comprovante de Vacina - Funcionário Admitido"** (linha 19) **não estava nem no Bloco 2 nem no Bloco
4**. A fábrica **não mapeou por conta própria** (§A.14): ficou sem destino, e o teste trava esse estado
de propósito. Hoje não tem anexo, então não perde nada; quando o diretor decidir, o candidato natural é
VACINA_FUNCIONARIO (ou VACINA_COVID, se na prática for só COVID).

### Resultado (prova rodada com o mapeador real contra os 23 formulários)
**16 de 23 resolvem.** Dos **11 com anexo hoje, 10 têm destino**; o único sem destino é o Vale
Transporte, que é exclusão deliberada. Antes desta OST eram 5 de 23, e **7 formulários com anexo iam
para o descarte**, incluindo os 4 arquivos de CTPS e a Conta Bancária.

### Gate
Typecheck limpo nos dois apps, lint com os **2 erros de config pré-existentes**, **313 testes** (295
backend, 13 frontend, 5 shared-types). O spec do mapeador foi de 3 para **29 testes**, com os 23
formulários reais travados um a um.

### Achado lateral (NÃO corrigido, fora do escopo)
`montarNomePasta` (`ai/drive-routing.ts`) monta o nome da pasta do Drive com **travessão**, o que
contraria a §A.11. É texto que chega ao usuário no Drive. Não toquei (§A.14); fica registrado para o
diretor decidir se vira correção.

---

## 2026-07-21 (noite, 4) — Pull de documentos migrado para a API v3 (aguardando validação)

**Nada commitado.** Escopo travado na LEITURA: **não** há pull na liberação e **não** há scheduler.
O `puxarDocumentos` segue sendo chamado só onde já era (criação pelo caminho completo do webhook), que
hoje não acontece por causa do de/para de vaga. Isso é deliberado: as próximas OSTs ligam o gatilho.

### Bloco 0, consumidores da v1/v2 mapeados ANTES de trocar
- `getPrecollaborator` (v1) tem **um** consumidor: `pandape-sync.processarCandidato`, que usa
  **identidade** (`idMatch`, `idVacancy`, `name`/`surname`, `email`, `etapa`/`stage`), **não** documentos.
- `pc.documents` tinha **um** consumidor: a chamada `puxarDocumentos(criada.admissaoId, pc.documents)`.
- `getMatch` (v1) é a fonte do **CPF**, sem relação com documentos.
- `documents` no `clicksign-api.service` é **outra API** (Clicksign), não tem nada com Pandapé.

**Conclusão do levantamento: só o pedaço de documentos migra.** A identidade continua na v1 de
propósito, porque a v3 **não devolve `answers`** e o resto do sync já está estabilizado na v1. Trocar
tudo seria risco sem ganho nesta OST.

### Bloco 1, o que mudou
`getFormulariosDocumentos(id)` novo no cliente (GET `/v3/precollaborators/{id}` → `forms[]`), e o
`puxarDocumentos` passou a receber o **idPreCollaborator** e a iterar `forms[].documents[]`, usando o
**nome do formulário** como entrada do resolver. Download em memória, `auditarBuffer` (F2) e descarte
do buffer seguem **os mesmos**: foi troca de fonte, não reescrita do pipeline.

### Bloco 2, COMO fica visível o documento sem destino (a OST pediu para confirmar)
Escolhi **log de aviso, sem PII**, e explico o porquê: o **rótulo do FORMULÁRIO** ("Informações de Vale
Transporte") **não é dado pessoal**, então pode e deve aparecer; o **nome do arquivo** é que carrega
PII (já foi visto CPF nele) e continua proibido, junto da URL. A linha registra
`idPreCollaborator`, o rótulo do formulário e a **quantidade** de arquivos, e diz explicitamente que
nada se perdeu no Pandapé. Um teste garante que o rótulo aparece e que URL e nome de arquivo não.

**Limitação honesta:** isso é visível no log do servidor, **não na tela**. Não criei campo nem status
novo porque seria estrutura fora do escopo desta OST (§A.14). Quando a coleta automática entrar, o
lugar natural é uma superfície na Auditoria; fica registrado como candidato a OST.

**Pendência continua governada só pela régua**: obrigatório ausente trava, não obrigatório não trava.
Nada aqui mexeu nisso.

### Bloco 3, múltiplos arquivos e dedup
- **CTPS traz sempre o primeiro** (decisão do diretor: é a imagem da página da foto). No candidato real
  isso descarta 3 dos 4 arquivos de CTPS.
- **Demais tipos trazem todos**, sem regra inventada, e o log registra quando vieram múltiplos.
  **Tipos que apareceram com múltiplos no candidato real: CTPS (4) e CPF (2).** Só esses dois.
- **Dedup por (admissão + tipo) já ENTREGUE**: não rebaixa nem rebaixa nada, só não baixa de novo.
  `INCONFORME` **fica de fora da trava** de propósito, para documento reprovado poder ser reenviado e
  re-auditado. *Limitação registrada:* a dedup é por TIPO, não por arquivo; dedup por arquivo vai
  precisar de uma marca do que já veio, e isso entra na OST do scheduler, que é quem re-consulta.

### Bloco 4, prova contra o candidato real (15 arquivos, o mesmo da sonda)
Antes: **0 de 15** (a v1 só dava o nome do arquivo, e nenhum mapeava).

| Tipo resolvido | Arquivos | Trazidos |
|---|---|---|
| CTPS | 4 | 1 (regra do primeiro) |
| CPF | 2 | 2 |
| PIS_PASEP, CARTAO_SUS, COMPROVANTE_ESCOLARIDADE, CERTIDAO_NASC_CASAMENTO, COMPROVANTE_RESIDENCIA, DADOS_BANCARIOS, FOTO_CRACHA, TITULO_ELEITOR | 1 cada | 1 cada |
| SEM DESTINO (Informações de Vale Transporte) | 1 | 0, registrado no log |

**11 dos 15 arquivos passam a ser auditados**, 3 saem pela regra do primeiro (CTPS) e 1 fica sem
destino de propósito (VT, exclusão do diretor). **10 dos 11 formulários com anexo** têm destino.

### Gate
Typecheck limpo nos dois apps, lint com os **2 erros de config pré-existentes**, **317 testes** (299
backend, 13 frontend, 5 shared-types). O spec do sync foi de 24 para **28 testes**: CTPS pelo primeiro,
múltiplos em tipo não-CTPS, formulário sem destino logado sem PII e dedup por tipo já entregue. Os 3
testes de pull que existiam foram **migrados** para o formato `forms[]`, incluindo o que prova que a
URL nunca vaza.

### Aberto
Validação do diretor. Ressalva §A.13: aqui não há tela, a prova é a tabela acima e a suíte.

---

## Desacoplar gravação da auditoria + fix do mime + reprocesso da Evelyn (§A.9)

**Diagnóstico raiz (provado, Bloco 0).** A liberação da Evelyn não subiu documento não por acoplamento
sozinho: a auditoria dava HTTP 500 porque o pull do Pandapé gravava o arquivo na staging SEM extensão
(`originalname` = código do tipo), o ai-service caía no default `application/octet-stream` e o Vertex
rejeitava com 400. Prova A/B ao vivo: mesmo arquivo COM extensão devolve veredito 200; SEM extensão dá
500. O ai-service estava saudável, o formato é que chegava indeterminado.

### Bloco A, fix do mime (estratégia adotada)
Duas camadas, `mime NÃO é PII` (pode ser usado; nome de arquivo e URL do Pandapé seguem proibidos):
- **Backend (primário + fallback), `pandape/mime-documento.ts`:** resolve a extensão pelo
  **Content-Type do download** e, na falta (ausente/vazio/octet-stream), pelos **magic bytes** do
  buffer (PDF `%PDF`, JPEG `FF D8 FF`, PNG `89 50 4E 47`). O pull passa `originalname = codigo+ext`, e
  a staging grava COM extensão. Ajuste do reprocesso: os magic bytes acabaram valendo como verdade
  sobre um Content-Type mentiroso, resolvendo o "não confiar cegamente no header".
- **ai-service (defensivo), `gemini.resolver_mime` + `routers/auditoria`:** se nem extensão nem magic
  bytes resolverem, NÃO manda octet-stream ao Vertex, devolve **415 controlado** (nunca mais o 500
  silencioso). Cobertura: **PDF, JPEG, PNG** (os formatos que a auditoria aceita).

### Bloco B, desacoplamento (coleta antes da auditoria)
`auditarBuffer` agora **grava o documento como `AGUARDANDO_AUDITORIA` ANTES** de chamar a IA; no
sucesso atualiza para o veredito (ENTREGUE/INCONFORME/PENDENTE); na falha da IA o `throw` sobe mas o
documento **permanece gravado** (coleta preservada, reprocessável, staging mantida). `setWhere` impede
rebaixar um doc já ENTREGUE numa reauditoria. Novo valor no enum `estado_documento`
(migration `0031`), tratado como não-ENTREGUE em toda a régua/sinalizador/KPIs por construção.

### Bloco C, visibilidade (superfície escolhida)
**Status na aba Auditoria**: o `AuditoriaDocsModal` ganhou a pill azul **"Aguardando auditoria"**
(tom `in`), distinta de Pendente (âmbar) e Inconforme (vermelho). A falha da IA deixa de ser engolida
num WARN: o documento aparece coletado, esperando auditoria. (Não inventei tela nova.)

### Bloco D, reprocesso da Evelyn (idPreCollaborator 400244), antes → depois
Antes: **8 documentos, todos PENDENTE** (a coleta de 21:08 morreu no 500). Depois do reprocesso pelo
fluxo real (fila BullMQ → worker → mime corrigido → desacoplado):

| Documento | Estado depois | Como resolveu |
|---|---|---|
| Certidão Nasc./Casamento, CNH, Comprovante de Escolaridade, Título de Eleitor | **ENTREGUE** | veredito real da IA (VALIDADO) |
| CPF, Carteira de Trabalho (CTPS) | **INCONFORME** | veredito real da IA |
| RG | **PENDENTE** | veredito real (ilegível) |
| Foto para Crachá | **PENDENTE** | sem regras de auditoria (esperado) |
| Comprovante de Residência | **AGUARDANDO_AUDITORIA** | PDF que o Vertex recusa ("no pages"): coleta preservada pelo desacoplamento |
| Carteira de Reservista, Comprovante de Conta Bancária | **PENDENTE** | candidato não enviou (nunca coletado) |

**7 documentos auditados com veredito real** (antes eram 0), **1 aguardando** (coleta salva, não
perdida), o resto no estado correto. Extensões gravadas batem com os magic bytes reais (mime correto).
Idempotência pelo upsert na chave (admissão, tipo) + índice único, sem duplicata.

### Achado fora de escopo (registrado, não corrigido)
O "no pages" do Comprovante de Residência é um PDF real que o Vertex não parseia, distinto do
octet-stream. O desacoplamento o torna **não destrutivo** (fica AGUARDANDO). O ai-service ainda
devolve 500 cru para 400s do Vertex que NÃO sejam de mime (fora do escopo desta OST).

### Gate
Backend **313 testes** + lint limpo + typecheck; ai-service **21 testes** (2 novos: mime por magic
bytes → 200, formato indeterminado → 415); frontend typecheck limpo. Testes de regressão que travam o
bug: (1) mime nunca vira octet-stream, (2) IA falhando deixa o doc AGUARDANDO_AUDITORIA, (3) reprocesso
sem duplicata.

### Aberto
Validação visual do diretor na tela (frontend já no ar): abrir Esteira → aba Auditoria → Evelyn →
"Auditar" e conferir os vereditos + a pill "Aguardando auditoria" no Comprovante de Residência.
Ressalva §A.13: o Chromium deste ambiente não tem as libs de sistema (libatk/libgbm/libasound), então
o screenshot automatizado não rodou aqui; a prova é a tabela acima + a suíte. **Sem commit até a
validação** (§A.21).

---

## Auditoria por CONJUNTO + motivo visível + PDF protegido (§A.9)

**Causa raiz (provada na investigação anterior).** O CPF da Evelyn veio com 2 arquivos (frente e
verso). Cada um era auditado ISOLADO e o upsert por (admissão + tipo) fazia o ÚLTIMO vencer, gravando
o veredito do verso ("nome não coincide, número ausente, fora do prazo", que descreve um verso). A IA
acertava; a CONSOLIDAÇÃO errava. Na CTPS, a "regra do primeiro" trazia a página da foto, sem os dados
que a régua exige (que estão na página de qualificação). O Comprovante de Residência era um PDF
protegido por senha, que o Vertex nem lê ("no pages").

### Bloco 1, auditar o CONJUNTO como uma peça só
Quando um tipo tem vários arquivos, o pull agora baixa TODOS e faz UMA chamada à IA com o conjunto,
para UM veredito e UM registro por (admissão + tipo). O `auditarBuffer` virou açúcar de
`auditarConjunto([arquivo])`; o ai-service recebe `stagingPaths[]` e o prompt avisa que são partes do
MESMO documento (frente/verso, páginas), satisfazendo cada regra com QUALQUER uma. **A "regra do
primeiro" da CTPS está REVOGADA** (declaração explícita, decisão anterior desfeita pelo diretor): as
4 páginas vão juntas. Teto de segurança: **10 arquivos** por conjunto (cobre frente/verso e páginas
com folga; acima disso audita os primeiros e loga). Persistência segue UM registro por tipo (upsert +
índice único).

### Bloco 2, motivo real visível na tela
A IA já devolvia motivo específico; ele só não chegava ao usuário (a tela mostrava só o status). O
detalhe da admissão (`esteira.detalhe`) passou a incluir `observacao` (o motivo, sem PII, §A.6), e o
`AuditoriaDocsModal` renderiza o motivo persistido junto do status, para INCONFORME, PENDENTE e
AGUARDANDO_AUDITORIA (que agora diz "Documento coletado, aguardando a análise por IA."). Superfície
escolhida: **status + motivo na aba Auditoria**, sem tela nova.

### Bloco 3, PDF protegido por senha
Detecção barata na COLETA, antes da IA: `pdfProtegidoPorSenha` vê `%PDF` + o marcador `/Encrypt` no
buffer (sem lib, sem PII). Documento protegido vira **INCONFORME com motivo acionável** ("Documento
protegido por senha. Reenviar o arquivo sem proteção..."), NÃO fica preso em AGUARDANDO_AUDITORIA
(reservado a falha de SISTEMA: IA fora/timeout).

### Validação na Evelyn (antes → depois), reprocesso de UMA admissão
| Documento | Antes | Depois | Como |
|---|---|---|---|
| CPF | INCONFORME (veredito do verso) | **ENTREGUE** | conjunto frente+verso: "RG aceito como comprovante de CPF" |
| CTPS | INCONFORME ("CPF não visível") | **ENTREGUE** | 4 páginas juntas: a IA acha o dado exigido |
| Comprovante de Residência | AGUARDANDO_AUDITORIA (preso) | **INCONFORME** | "protegido por senha, reenviar sem proteção" |

Os dois falsos positivos sumiram; o PDF protegido virou pendência acionável. O `observacao` chega na
API do detalhe (provado por chamada real) e o modal o exibe.

### Gate
Backend **318 testes** + lint + typecheck; ai-service **22 testes** (novo: conjunto envia N imagens +
prompt); frontend typecheck. Testes de regressão novos: conjunto de N → 1 chamada com `stagingPaths`
de tamanho N; PDF protegido → INCONFORME sem chamar a IA; `pdfProtegidoPorSenha` (só PDF com
`/Encrypt`, nunca imagem). Specs do pull migrados de `auditarBuffer` N× para `auditarConjunto` 1×.

### Aberto
Validação visual do diretor: Esteira → Auditoria → Evelyn → "Auditar" e conferir CPF/CTPS ENTREGUE
com motivo, e o Comprovante INCONFORME com "protegido por senha". Mesma ressalva §A.13 (screenshot
automatizado indisponível neste ambiente). **Sem commit até a validação** (§A.21).

---

## 2026-07-22: Dedup por arquivo + varredura retroativa (Blocos 1 a 4), aguardando validação

Frente pedida para fechar os dois primeiros buracos do passivo de documentos e preparar o terceiro
(o scheduler, que NÃO foi montado aqui, é a OST seguinte).

### Bloco 1, marca de arquivo já coletado
**Causa.** A dedup era por (admissão + tipo): impedia duplicar o TIPO, mas não sabia QUAIS arquivos
já tinham vindo. Sem isso, um scheduler re-baixaria e re-auditaria o acervo inteiro a cada ciclo.

**Decisão.** Marca por ARQUIVO, com o **SHA-256 do CONTEÚDO** (hex, 64 chars), na tabela nova
`documento_arquivos_coletados` (migration `0032`). §A.6: a tabela guarda **digest + tamanho**, nunca
nome de arquivo (já foi visto CPF em nome de arquivo do Pandapé) e nunca URL. Um digest é
irreversível e não identifica pessoa. Escolhido SHA-256 e não MD5 porque uma colisão aqui descartaria
um documento legítimo como "já coletado".

As regras vivem puras em `pandape/dedup-arquivo.ts` (`decidirColeta` / `precisaAuditarConjunto`):
acervo idêntico ao já marcado pula **sem baixar**; arquivo novo re-audita **o conjunto inteiro** (o
veredito é do conjunto, então chegando arquivo novo o veredito anterior não vale mais); INCONFORME e
AGUARDANDO_AUDITORIA nunca ficam presos na trava. A marca só é gravada **depois** de a auditoria
concluir: por isso "tem marca" equivale a "passou pelo fluxo atual", e a AUSÊNCIA de marca é o que
faz o REPROCESSO reconhecer o que o fluxo antigo gravou. Falha da IA não marca, e o ciclo seguinte
tenta de novo.

**Limites declarados de propósito** (ambos porque a §A.6 não autoriza persistir nada derivado da
URL): a regra do "acervo idêntico" compara QUANTIDADE, então troca de arquivo mantendo o total só é
percebida baixando; e um tipo ENTREGUE SEM marca nenhuma segue sendo pulado no pull normal, porque
sem marca não há como saber se o que está no Pandapé é novo. Quem quebra esse empate é a varredura.

**Correção no meio do caminho (achado do piloto).** A chave única nasceu como (admissão + hash) e
estava errada: no acervo real o MESMO arquivo aparece em vários formulários (a candidata subiu um PDF
único em dois lugares), e o segundo tipo ficava SEM marca nenhuma, voltando a ser re-auditado em todo
ciclo. Migration `0033` trocou para **(admissão + TIPO + hash)**, que é o escopo certo: o veredito é
por tipo. Descoberto rodando o piloto, não em teste de mesa.

### Bloco 2, varredura unificada (uma peça, duas populações)
`pnpm --filter @ea/backend db:varredura` (dry-run por padrão; `--aplicar` executa;
`--admissao=<uuid>` roda só uma). Varre as admissões VIVAS com origem Pandapé rastreável e classifica
sozinha: sem documento coletado → **CARGA**; com documento coletado → **REPROCESSO** (flag
`reprocessar` no job, que derruba a trava por tipo mas NUNCA a idempotência). O Rike não precisa
saber quem é de qual grupo.

O script é **planejador e enfileirador**: não chama Pandapé nem IA. Enfileira um `pull-docs` por
admissão na MESMA fila BullMQ, e quem executa é o worker já de pé, com o limiter que respeita o rate
limit compartilhado (§A.5). Nunca dispara N chamadas simultâneas. Falha numa admissão não derruba o
lote. O relatório por admissão vem do `returnvalue` do job (resumo PII-free), sem tabela nova.

**Correção no meio do caminho.** O acompanhamento por `QueueEvents.waitUntilFinished` ficou pendurado
com o job JÁ concluído. Trocado por **polling do estado no Redis**, que é a fonte confiável.

### Bloco 3, travas
A carga não muda status de admissão, não libera, não conclui e não altera régua: ela chama coleta e
auditoria, e nada mais. Pré-admissões (AGUARDANDO_LIBERACAO) ficam fora por construção, sem
cliente/cargo não há régua. Idempotência provada em dado real (ver Bloco 4).

**Reportado ao diretor, sem inventar:** **não existe marcação de veredito humano** em
`documentos_admissao`. Todo write passa pela IA (`auditarConjunto`) ou pelo upload de ASO, que também
chama a IA. Não há tela onde o consultor marque um documento como válido à mão. A trava "não reverter
avaliação manual" está escrita mas é inócua hoje. Nenhuma coluna foi inventada.

### Bloco 4, piloto na Silvia (`720746ca-a0a7-46f3-b5ca-33a389ca95a1`)
23 formulários no Pandapé, 14 arquivos baixados, 10 tipos resolvidos. Veredito e motivo de cada um
ficaram registrados; o formulário **"Informações de Vale Transporte" caiu em SEM DESTINO**, como
previsto (§A.17, o VT é outra frente). Já existiam: **zero**, ela nunca tinha sido coletada.

**Terceira rodada: zero auditorias, zero chamadas de IA.** Dois tipos pulados sem baixar, oito
baixados e descartados por não terem nada novo. Idempotência provada em dado real, não em mock.

**Travas conferidas depois do piloto:** farol `EM_ADMISSAO` (igual), AUDITORIA `ANALISE_PENDENTE` e
EXAME `A_AGENDAR` com `concluida=false` (iguais), CADASTRO não criada, régua com as mesmas 30 linhas.
A outra admissão do plano não foi tocada. **Mudou** apenas o `sinalizador_preenchimento` (PARCIAL →
INCONFORMIDADE), que é consequência normal de auditar, igual a qualquer upload manual.

### Gate
Typecheck + 331 testes verdes (12 novos). Lint acusa 2 erros PRÉ-EXISTENTES em `nova/page.tsx` e
`vt/page.tsx` (`react-hooks/exhaustive-deps` sem definição de regra), nenhum arquivo desta frente.

### Aberto
Validação do diretor. **Lote (Bloco 5) NÃO rodado**, aguardando OK explícito. Duas perguntas levadas
junto: (1) auditar dispara os efeitos normais da F2 (auto-conclusão da AUDITORIA quando a régua
fecha), e se o lote não puder nem isso, precisa de decisão; (2) a inexistência da marcação de veredito
humano, acima.

---

## 2026-07-22 (tarde): OST A, correções da auditoria + Reauditar, aguardando validação

Conserto dos erros que o piloto da Silvia expôs, mais o botão de reauditar. **Lote continua não
rodado** e o scheduler continua não montado.

### Bloco 1, o falso positivo do "PDF protegido por senha" (bug NOSSO, não da IA)
**Causa raiz.** A CTPS da Silvia foi reprovada com "documento protegido por senha", e o diretor
validou que o PDF **não tem senha**. A checagem que fizemos na entrega anterior era a busca da string
`/Encrypt` no buffer, no backend. Só que `/Encrypt` aparece em QUALQUER PDF com dicionário de
criptografia, inclusive no caso comum em que **não há senha de abertura**: PDF cifrado só para
restringir permissões (impressão, cópia) ou assinado digitalmente. A checagem foi barata demais e
condenou documento bom.

**Decisão.** O critério certo é o do padrão PDF: existe senha de USUÁRIO? Isso não se responde
olhando bytes, se responde **tentando abrir com senha vazia**. Não dá para fazer isso barato em
Node (exigiria implementar o Algoritmo 6 do padrão, com MD5/RC4/AES na mão, sobre o dicionário de
criptografia cru). Então a decisão MUDOU DE CAMADA: quem decide agora é o **ai-service**, com
**pypdf**, biblioteca que **já era dependência declarada** do serviço (usada pelo kit), nenhuma
dependência nova entrou. `PdfReader.decrypt("")` devolve 0 quando a senha vazia não abre.

- Novo `apps/ai-service/app/pdf_seguranca.py`. A regra da OST está no código: **na dúvida, NÃO marca
  como protegido**. Qualquer erro de parse, PDF corrompido ou cifra exótica devolve False e o
  documento vai para a IA. Preferimos gastar uma chamada a reprovar documento bom.
- A rota `/auditoria/documento` filtra as partes protegidas ANTES do Gemini. Se **todas** exigirem
  senha, devolve INCONFORME determinístico com o mesmo motivo acionável, **sem gastar chamada de IA**
  (o benefício original está preservado). Se ao menos uma abre, o conjunto é auditado com o que abre:
  uma página protegida não condena o documento inteiro.
- No backend, o veto saiu de `auditarConjunto` e a função `pdfProtegidoPorSenha` foi **removida**, em
  vez de deixada por perto errada.

**Teste de regressão exigido, entregue:** PDFs REAIS gerados com pypdf. Um cifrado só por permissões
(senha de dono, senha de usuário vazia) tem `/Encrypt` no corpo, e o teste afirma que ele **NÃO** é
marcado como protegido e **vai para a IA**. Mais: senha de abertura de verdade → INCONFORME sem
chamar a IA; PDF corrompido → não marca; conjunto misto → audita só o que abre.

### Bloco 2, a regra do PIS aceitar RG (ajuste de regra, não de código)
**Causa.** O PIS foi reprovado com "tipo incorreto, recebido Carteira de Identidade". A IA leu
CERTO: era um RG. O erro era da régua, porque o número do PIS consta no verso do RG e o RG É
comprovante válido de PIS.

**Decisão.** Duas regras novas para `PIS_PASEP`, no mesmo padrão da regra do CPF que já aceita CNH e
RG. Aplicadas no banco (`db:seed:regras`, idempotente) e gravadas no seed, para ambiente novo nascer
com elas. A regra diz explicitamente para NÃO reprovar por "tipo incorreto" quando o arquivo for
Cartão do PIS, CTPS ou RG e o número estiver visível.

**Levantamento pedido, sem alterar nada (outros tipos na mesma situação).** O catálogo tem outros
casos de documento que comprova mais de uma coisa, e ficam para o diretor decidir:
- **RG aceita CNH?** A CNH é documento de identidade, mas a régua do RG cobra "órgão expedidor" e
  "número do registro"; uma CNH enviada no lugar do RG pode reprovar por tipo, exatamente como o PIS
  reprovou. É o candidato mais provável a repetir o problema.
- **CTPS comprova PIS** (já coberto pela regra nova do PIS, mas o inverso não existe).
- **CERTIDAO_NASCIMENTO, CERTIDAO_CASAMENTO e CERTIDAO_NASC_CASAMENTO** são três tipos cobrindo
  território sobreposto; uma certidão de casamento satisfaz os três.
- **VACINA_COVID e VACINA_FUNCIONARIO** se sobrepõem.
- **FOTO_3X4 e FOTO_CRACHA**: resolvido no Bloco 3 abaixo.

### Bloco 3, a foto no lugar certo
**Diagnóstico (qual dos dois falhou).** O ARMAZENAMENTO estava certo: `drive-routing` manda
`FOTO_3X4` e `FOTO_CRACHA` para a MESMA subpasta (DOCUMENTOS_PESSOAIS), como combinado. Quem falhou
foi a **EXIBIÇÃO**: o checklist da aba Auditoria é montado a partir da RÉGUA, e `FOTO_CRACHA` não
está em régua nenhuma (**0 pares** cliente+cargo). A foto chegava, era auditada, gravava estado e
ficava INVISÍVEL, enquanto a linha "Foto 3x4" aparecia como não recebida.

**Decisão.** Equivalência de tipo no checklist (`domain/documentos-equivalentes.ts`): quando o slot
`FOTO_3X4` está VAZIO, ele exibe o documento recebido como `FOTO_CRACHA`. Não criamos linha nova na
régua (mudaria a exigência) e não fundimos os tipos (o tipo próprio foi decisão do diretor). A linha
passa a carregar o `tipoDocumentoId` REAL do documento recebido, para auditar/reauditar a coisa certa.
Documento no tipo da própria régua sempre ganha do equivalente.

### Bloco 4, ordem de leitura do modal
Os documentos aparecem em três faixas: primeiro os que têm **veredito**, depois os **recebidos mas
ainda não auditados** (AGUARDANDO_AUDITORIA), e por último os **não recebidos**. Dentro de cada faixa
a ordem alfabética do backend é preservada (ordenação estável). PENDENTE **com motivo** conta como
auditado (é o caso do tipo sem regra ativa), porque teve veredito.

### Bloco 5, o botão Reauditar
`POST /esteira/auditoria/:admissaoId/reauditar` com o `tipoDocumentoId`, individual, nunca em lote.
Botão próprio na linha do documento, no modal de Auditoria, disponível em **qualquer estado**,
inclusive ENTREGUE: quem decide que a IA errou é o consultor. O botão de upload que já existia
mudou de rótulo para **"Enviar novo arquivo"** quando já há veredito, porque agora "Reauditar"
significa outra coisa: reanalisar o que já está lá, sem upload.

**Origem dos arquivos, nesta ordem:** (1) STAGING local, se ainda estiverem lá, sem tocar a rede;
(2) PANDAPÉ, buscando **só os anexos daquele tipo**, quando a staging já foi expurgada.

**Como a dedup por hash foi resolvida (declaração pedida na OST).** Ela simplesmente **não participa
da decisão**: a dedup mora no pull automático (`puxarDocumentos`), que decide sozinho se vale re-
baixar e re-auditar. A reauditoria NÃO passa por lá, chama `auditarConjunto` direto, então a marca de
arquivo é irrelevante para rodar ou não. O hash continua sendo usado, mas para outras duas coisas:
deduplicar cópias idênticas dentro da staging (sem isso cada reauditoria DOBRARIA o conjunto, porque
`auditarConjunto` regrava a staging) e manter a tabela de marcas em dia depois do novo veredito.

**Trilha:** cada reauditoria grava em `candidato_alteracoes_log` quem pediu, quando, o tipo e o
antes/depois (`campo = reauditoria:<CODIGO>`). §A.6: código de tipo e estados, nada de PII.

**Nota de arquitetura:** módulo próprio (`ReauditoriaModule`). `PandapeModule` já importa
`AuditoriaModule`, então pendurar a reauditoria em qualquer um dos dois fecharia um ciclo de
dependência. O novo módulo importa os dois e ninguém o importa de volta.

### Bloco 6, levantamento de nome de cadastro suspeito (sem corrigir)
`pnpm --filter @ea/backend db:nomes-suspeitos` varre as admissões VIVAS e aponta: palavra repetida em
sequência, caractere estranho, nome de uma palavra só, espaços múltiplos e caixa inconsistente.
§A.6: **nome não vai para stdout nem para log**: o terminal mostra só CONTAGENS e a lista com os
nomes é gravada num **CSV** que o diretor abre. Nada é corrigido automaticamente: nome é dado de
identidade e "consertar" sozinho pode trocar um nome legítimo por outro.

Os apontamentos têm **severidade**, para o relatório não afogar o que importa. ALTA distorce o nome e
pode derrubar a conferência (token repetido, caractere estranho, uma palavra, espaço sobrando); BAIXA
é só padronização visual (caixa).

**Resultado da varredura: 37 admissões vivas, 35 apontadas, TODAS de severidade BAIXA (caixa alta,
herança da planilha de carga). ZERO de severidade ALTA.** Ou seja, **nenhum cadastro vivo tem hoje o
problema da Silvia**, que ela já teve corrigido pelo diretor. A dimensão do problema é: um caso, já
resolvido. "MARIA DA SILVA" e "Maria da Silva" são o mesmo nome e não derrubaram documento nenhum.

### Bloco 7, reauditoria da Silvia (antes → depois)
Cadastro já corrigido pelo diretor para "Silvia Carla Bassi". Reauditados os 9 documentos recebidos,
pela rota HTTP real:

| Documento | Antes | Depois | O que provou |
|---|---|---|---|
| CTPS | INCONFORME "protegido por senha" | **ENTREGUE** | **Bloco 1**: o PDF nunca teve senha; o Gemini leu sem dificuldade |
| PIS/PASEP | INCONFORME "tipo incorreto, recebido RG" | **ENTREGUE** | **Bloco 2**: "RG aceito como comprovante de PIS/PASEP" |
| CPF | INCONFORME "nome não coincide" | **ENTREGUE** | cadastro corrigido |
| Cartão SUS | INCONFORME "nome não confere" | **ENTREGUE** | cadastro corrigido |
| Comprovante de Escolaridade | INCONFORME "nome não corresponde" | **ENTREGUE** | cadastro corrigido |
| Certidão Nasc./Casamento | INCONFORME "nome não corresponde" | **ENTREGUE** | cadastro corrigido |
| Título de Eleitor | INCONFORME "nome não confere" | **ENTREGUE** | cadastro corrigido |
| Foto para Crachá | PENDENTE (sem regra ativa) | **ENTREGUE** | **Bloco 3**: aparece na linha "Foto 3x4" |
| Comprovante de Conta Bancária | INCONFORME "ilegível, com rasuras" | PENDENTE | problema REAL do documento, não do cadastro |

**Dos 5 reprovados por "nome não confere", os 5 passaram.** (A OST falava em seis; o sexto,
DADOS_BANCARIOS, tinha outro motivo: ilegibilidade, e continua pendente com razão.) A CTPS veio com
`origem=PANDAPE` porque o veto antigo abortava ANTES da staging, então não havia cópia local: o
fallback de buscar de novo no Pandapé funcionou como desenhado. Os demais vieram da STAGING, sem
tocar a rede. A trilha registrou as 9 reauditorias com autor e antes/depois.

**Achado operacional para o LOTE (não corrigido, fora do escopo desta OST).** Uma das reauditorias
falhou na primeira tentativa com **429 RESOURCE_EXHAUSTED do Vertex** (quota), que o ai-service
devolve como 500 cru. O documento ficou em AGUARDANDO_AUDITORIA (comportamento desenhado, coleta
preservada) e a segunda tentativa passou. Rodar o lote em sequência vai bater nessa quota; vale
decidir se o ai-service deve tratar 429 com backoff antes de soltar o lote.

### Gate
Backend **349 testes** verdes (18 novos: dedup de arquivo, reauditoria, equivalência de tipo, nome
suspeito) + typecheck dos 3 pacotes. ai-service **60 testes** verdes (7 novos de PDF protegido) +
ruff limpo. Lint do monorepo com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`
em `nova/page.tsx` e `vt/page.tsx`, intocados.

### Aberto
Validação visual do diretor no modal de Auditoria da Silvia (Esteira → Auditoria → Auditar): conferir
a ordem nova, o botão **Reauditar** em cada documento, a Foto 3x4 preenchida e os motivos. **Sem
commit até a validação** (§A.21). Lote e scheduler seguem não feitos, por ordem da OST.

---

## 2026-07-22 — OST VISUAL DE TABELAS: ordenação padrão, cabeçalho fixo, ordenação clicável no Farol

Sessão PARALELA à das cargas/dedup, em branch e worktree próprias (`ost/tabelas-visual`,
`/home/henrique/apps/ea-tabelas-visual`), saída do HEAD `8d2c6c4`. Fronteira dura da OST: **só
frontend**. Nada de backend (`admissoes.service.ts`, `esteira.service.ts`, `pandape-*`, auditoria,
ai-service, migrations). Build só na worktree, para não clobberar o `.next` de produção.

### Levantamento: 13 tabelas, 11 telas, ZERO componente compartilhado
Duas famílias de CSS, nenhuma abstração de React em comum (só modais em `components/`):
- **grid `div`** (`.list-head` + `.row`): Esteira (3 abas), Gerenciador, Não conformidades;
- **`<table class="ds-table">`**: Liberação (2 tabelas), admin/clientes, cargos, régua, usuários,
  tarifas, motivos-declínio, regras.

**12 das 13 são de rolagem e carregam o conjunto inteiro no cliente.** A exceção é o **Gerenciador**,
**paginado no servidor** (20 por página, 2282 registros, 115 páginas).

### Fase 2, três ajustes
1. **Farol, mais recente primeiro.** A fila chegava em ordem CRESCENTE de criação, então a admissão
   nova caía no fim da tabela. Resolvido no frontend, ordenando por `dataInicio` da frente (nasce
   junto com a admissão, regra 1), vazio por último, desempate pela ordem de criação invertida.
2. **Coluna de Ações DESCONGELADA.** `.col-fix` deixou de ser `sticky` e virou coluna comum. A
   classe permanece como marcador semântico, então nenhuma tela mudou de marcação. Ganho colateral:
   congelada, ela cobria e **cortava a pill de status** ("Análise pendente" virava "Análise").
3. **Cabeçalho CONGELADO.** `.list-head` e `.ds-table thead th` grudam no topo da área de rolagem,
   com fundo opaco (o GlassCard é translúcido; sem isso as linhas vazam por baixo). **Efetivo nas 3
   tabelas de grid**; nas `ds-table` a regra fica **inerte**, porque o `GlassCard overflow-hidden`
   ancestral impede o sticky. Registrado, não forçado: dar rolagem vertical própria àquelas telas é
   mudança de layout fora do escopo desta OST.

### Fase 3, ordenação clicável (LIGADA SÓ NO FAROL, por decisão do diretor)
Peça nova e **reutilizável**, desenhada para as outras tabelas ligarem sem reescrita:
- `lib/ordenacao.ts`: `useOrdenacao(colunas, itens)`, comparadores por tipo e a regra de direção.
- `components/ui/ColunaOrdenavel.tsx`: cabeçalho clicável, serve às **duas** famílias via `as="span"`
  (grid) ou `as="th"` (`ds-table`). Clique num `<button>` de verdade, com `aria-sort`.

Comportamento do primeiro clique por tipo: **texto** A-Z, **data** mais recente, **número** maior
primeiro, **status** ordem do catálogo. Segundo clique inverte. **Vazio vai sempre para o fim, nas
duas direções**, para "não informado" não ocupar o topo só por virar a seta. Status e Pendências
ordenam por **rank** (`ordem` do catálogo e `RANK_SINAL`), não pelo texto da pill: alfabética em
status não significa nada. Sem coluna escolhida a lista sai **intacta**, então a ordenação padrão
(mais recente primeiro) é preservada e o clique é sobreposição do usuário. O desempate é a posição
original, então linhas de valor igual não embaralham a cada clique.

### §A.20, nome longo invadindo a coluna vizinha (Bloco 3)
Causa real: o `truncate` estava num **`<span>`**, que é **inline**, e em elemento inline o
`text-overflow` não se aplica. O nome vazava por cima da coluna Cliente. Trocado por `<div>`.
**Varredura da mesma família de CSS:** era o **único** caso. O Gerenciador já usava `<div>` e está
correto; as demais ocorrências de `span.truncate` no sistema estão dentro de containers flex, onde
o span vira item de bloco e o corte funciona. Nada mais a corrigir.

**Regressão própria, achada e corrigida na medição:** a seta de ordenação passou a ocupar ~13px do
cabeçalho e "TIPO DE CONTRATO" começou a cortar (precisava 123px, tinha 117). "PENDÊNCIAS OBRIG."
estava no limite exato, sem folga. Larguras revistas para 148px e 168px, **medidas no browser**, não
estimadas. Conferência automatizada de `scrollWidth > clientWidth` em todo cabeçalho das 3 abas:
zero cortado.

### Conta de teste dedicada do harness (§A.13)
Para os prints era preciso uma sessão autenticada e **não existia conta de teste**, apesar de a §A.13
pressupor uma. Na primeira sessão a conta semente `admin@ea.local` foi ativada temporariamente e
**restaurada ao estado original** (inativa, hash idêntico, conferido). Agora existe conta própria:
**`harness.visual@ea.local`** ("Harness Visual (QA)", SUPER_ADMIN, ativa), senha aleatória fora do
repositório em `~/.ea-harness/credenciais.env` (0600, diretório 0700). **Não é conta de pessoa
real.** Nenhuma conta de produção volta a ser tocada por harness. *Se o EA algum dia for exposto
fora da rede interna, esta conta tem de ser desativada antes.*

### Gate
Typecheck verde. Lint com **2 erros PRÉ-EXISTENTES** (`nova/page.tsx`, `vt/page.tsx`, regra
`react-hooks/exhaustive-deps` não encontrada): reproduzidos idênticos no repo principal intocado, não
são desta OST. Prova visual em `~/ost-tabelas-prints/` (build de produção da worktree na porta 3099,
produção intacta em 3010), incluindo o **antes** capturado no build de produção.

### DÍVIDAS REGISTRADAS (não corrigir agora)
1. **Ordenação padrão do Farol está no lugar errado.** A origem é `esteira.service.ts:230`
   (`.orderBy(asc(admissoes.criadoEm))`), que está na fronteira proibida desta OST. Quando o backend
   puder ser tocado: trocar para `desc` na origem e **remover o `useMemo` de inversão** do frontend.
2. **A ordenação clicável é CLIENT-SIDE.** Só é honesta em tabela que carrega o conjunto inteiro. Se
   o Farol virar paginado no servidor, ela passa a ordenar apenas a página visível e **mente**. Nesse
   dia a ordenação tem de subir para a API (`orderBy`), não ficar no `useOrdenacao`.
3. **Gerenciador fora, de propósito** (decisão do diretor). Ordenar 20 de 2282 no cliente mostraria
   ordem falsa, e o `orderBy` na API exige `admissoes.service.ts`. Resolver junto com o backend.
4. **Cabeçalho fixo inerte nas `ds-table`** (ver Fase 2, item 3).

### Pronto para a ligação seguinte (NÃO ligado, aguardando validação do padrão numa tela)
Com a peça pronta, ligar cada tabela é declarar as colunas e trocar `<span>`/`<th>` por
`<ColunaOrdenavel>`. Candidatas imediatas, todas de rolagem com conjunto inteiro no cliente:
Não conformidades, Liberação (2), admin/clientes, usuários, tarifas, cargos, régua,
motivos-declínio, regras. Fica de fora só o Gerenciador (dívida 3).

---

## 2026-07-22 (tarde, 2): merge da branch visual para `main` e publicação em produção

O diretor não conseguiu acessar o harness (3099 recusando conexão do lado dele, mesmo com as
unidades systemd de pé) e decidiu **validar direto em produção**. `ost/tabelas-visual` foi mesclada
e publicada.

### Merge, com o WIP da outra sessão intacto
A sessão das cargas tinha **23 arquivos modificados e não commitados** no tree principal, e **dois**
deles eram tocados também pela branch visual: `DIARIO.md` e `globals.css`. Procedimento: backup
completo (patch dos rastreados + tar dos não rastreados + cópia dos dois arquivos críticos, em
`~/backup-wip-cargas-20260722-130519/`), `git stash`, **fast-forward** para `24dc22f`, `git stash pop`.

- **`globals.css` casou sozinho**, sem conflito: o bloco `.logo-ea-mist` da outra sessão fica na
  linha ~200 e as mudanças da OST visual em ~250 (`.col-fix`) e ~870/~936 (cabeçalho colado). Os
  dois lados sobreviveram, conferido no arquivo.
- **`DIARIO.md` conflitou**, porque os dois acrescentam no fim. Resolvido **preservando as duas
  entradas na íntegra** (eram duas da outra sessão, não uma). Conferido byte a byte contra o backup.
- `git reset` depois do pop, para devolver o WIP ao estado original **não staged** (o `stash pop`
  havia deixado tudo staged, e um commit distraído levaria junto o trabalho não validado deles).
- Conferência final: 23 arquivos no backup, 23 no tree, **nenhum sumiu, nenhum alterado
  indevidamente** fora dos dois de sobreposição legítima.

### Publicação cirúrgica: frontend SIM, backend NÃO
`scripts/deploy-local.sh` **não** foi usado de propósito: ele faz `git pull` e reconstrói **todos**
os pacotes, o que colocaria no ar o WIP de backend não commitado e não validado da outra sessão
(auditoria, esteira, pandapé, migrations 0032/0033, módulo `reauditoria`). A mudança desta OST é só
frontend, então: parar `ea-frontend`, `pnpm build` em `apps/frontend`, subir de novo. O backend
**não foi reconstruído nem reiniciado**. (Parar antes de buildar é obrigatório: o build clobbera o
`.next` do serviço no ar e a tela passa a servir 500.)

**Risco checado antes:** o WIP de frontend deles adiciona o botão **Reauditar**, que chama
`/esteira/auditoria/{id}/reauditar`, endpoint do módulo `reauditoria` **não commitado**. Se o backend
no ar não o tivesse, o botão iria a 404 em produção. Verificado: `dist/reauditoria/` existe e
`dist/app.module.js` o registra, e o backend subiu 12:48:02 contra `dist` de 12:47:59, ou seja, **a
própria sessão deles já havia publicado esse backend**. Sem quebra.

*Consequência aceita e registrada: o build do frontend inclui necessariamente o WIP de frontend
ainda não validado da outra sessão (`liberacao`, `Sidebar`/`LogoEA`, `Icon`, `AuditoriaDocsModal`).
Era inseparável, e o diretor pediu explicitamente para conferir o logo novo, que vem justamente daí.*

### Verificado em produção (3010)
Logo novo presente (`.logo-ea-mist` no ar). As **3 abas** renderizam: Auditoria 37 linhas, Exame 37,
Cadastro 0 (fila vazia, esperado), **7 colunas ordenáveis em cada uma**, **zero cabeçalho cortado**.
Ordem padrão preservada (mais recente primeiro) e ordenação clicável funcionando (A-Z devolveu
AKIANNE, AMANDA, BRUNO). Prints com prefixo `prod-` em `~/ost-tabelas-prints/`.

### Harness encerrado
`ea-harness-frontend` e `ea-harness-proxy` **desabilitados e parados**; portas 3098/3099 liberadas.
A conta **`harness.visual@ea.local`** fica, por decisão do diretor. **Se o EA um dia sair da rede
interna, ela tem de ser desativada antes** (SUPER_ADMIN com senha fixa em
`~/.ea-harness/credenciais.env`).

### ACHADO no gate da §A.7 (não corrigido, decisão do diretor)
O hook `PreToolUse` casa o **texto do comando** por palavra-chave. Ele **bloqueou a escrita desta
entrada de diário** só porque a prosa continha a palavra guardada, e **não** bloqueou os comandos que
de fato publicaram em produção (`systemctl` + `pnpm build`), que não contêm nenhum dos verbos da
lista. Ou seja: hoje o gate gera falso positivo em texto e **não cobre o caminho real de publicação
local**. Fica registrado para o diretor decidir; nada foi alterado no gate.

### Aberto
Validação do diretor na tela, em produção. A ordenação **não** foi ligada nas outras 11 tabelas, por
ordem dele: valida o padrão no Farol primeiro. Dívidas da entrada anterior seguem valendo.

---

---

## 2026-07-22 (tarde, 3): ordenação clicável replicada nas tabelas restantes

O diretor validou o padrão no Farol e liberou a réplica. A peça criada na fase 3 (`useOrdenacao` +
`ColunaOrdenavel`) foi ligada nas demais tabelas **sem nenhuma alteração na peça**, o que era o teste
real do desenho: se tivesse sido preciso reescrever o hook para caber numa tela, o desenho estaria
errado.

### O que foi ligado (9 arquivos, 10 tabelas)
`admin/cargos` (2 colunas), `admin/motivos-declinio` (2), `admin/regras` (3), `admin/regua` (1),
`admin/usuarios` (5), `admin/tarifas` (5), `admin/clientes` (8), `liberacao` aba Aguardando (8) e aba
Recusadas (5), `nao-conformidades` (7).

**Esteira Exame e Cadastro já estavam prontas** e não exigiram trabalho: as três abas do Farol
compartilham **um único** `.list-head`, então ligar o Farol ligou as três de uma vez. Conferido: 7
colunas ordenáveis em cada aba.

**Gerenciador segue de fora**, por decisão do diretor: é paginado no servidor (20 de 2282) e ordenar
no cliente mostraria ordem falsa.

### Decisões de tipo por coluna
- **Números ordenam pela grandeza, nunca pelo texto.** `tarifas.Valor` usa o número, não a string em
  BRL (senão "R$ 9,38" viria antes de "R$ 12,00"). "Parado (dias)" e "Parado (horas)" da Liberação
  são a MESMA grandeza em unidades diferentes, as duas derivadas de `criadoEm`: ordenam pelo tempo
  parado em ms (senão "10 dias" viria antes de "5 dias" e "9:00" antes de "36:30").
- **Rank, não alfabética, onde o texto não tem ordem natural.** `usuarios.Papel` usa hierarquia
  (Super Admin, Master, Comum). `nao-conformidades.Situação` usa a ordem do FLUXO (Aberta,
  Aguardando supervisão, Liberada, Resolvida), igual ao que a coluna Status do Farol faz com o
  catálogo. Ativo/Inativo dos catálogos: ativo primeiro.
- **Rótulo exibido, não código cru.** `regras.Documento` ordena pelo nome do tipo, não pelo
  `tipoDocumentoId`. `clientes.Tipo de serviço` pelo rótulo.

### Coluna deliberadamente NÃO ligada, com motivo
A segunda coluna da **régua** ficou de fora. Ela é dupla: no modo "ativos" é um **Select de edição**
da régua em composição, e ordenar reposicionaria a linha embaixo do cursor no meio do preenchimento;
no modo "inativos" é uma pill constante "Inativo", igual em toda linha, logo sem informação. Só a
coluna Documento é dado ordenável ali. Colunas de controle (Ações, Avanço, checkbox, olho) seguem
fora em todas as telas, como no Farol.

### Gate, prova textual (o diretor valida em produção, não por print)
- **Corte de cabeçalho (§A.20):** a mesma checagem automatizada de `scrollWidth > clientWidth` rodada
  no Farol, agora em **todas** as tabelas ligadas. Resultado: **zero cabeçalho cortado** em 11
  tabelas. Larguras ajustadas preventivamente onde a seta apertava (Telefone, Nascimento, Chegada,
  Parado dias/horas, Recusado por/em, Papel, Status, Criado em, Estado).
- **Ordenação:** leitura da ordem REALMENTE renderizada, antes e depois de cada clique, por tabela.
  Números confirmados pela grandeza (Valor: 1o clique deu 12,00 / 9,38 / 6,30) e papel pela
  hierarquia (1o clique deu três Super Admin no topo).
- **Ordem padrão preservada:** comparação da ordem renderizada no carregamento contra a ordem CRUA
  da API, em 5 tabelas, 8 linhas cada. **Idênticas**, ou seja, sem clique a peça não mexe em nada.
- Typecheck verde. Lint com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`
  (`nova/page.tsx`, `vt/page.tsx`), intocados.

### NÃO PROVADO em comportamento, por falta de dado (declarado)
`liberacao` aba **Recusadas** e **nao-conformidades** estão com a fila **vazia** na base. Os
cabeçalhos ordenáveis renderizam (5 e 7 colunas, conferido) e o código passa no typecheck, mas o
**reordenamento de linhas não pôde ser exercitado**, porque não há linha. Conferir quando houver
dado real.

### Risco de conflito com a sessão das cargas (mapeado, não resolvido aqui)
Esta entrega toca `liberacao/page.tsx` e `nao-conformidades/page.tsx`, e a sessão das cargas tem WIP
em `liberacao/page.tsx` (opção "em branco" nos dropdowns do modal). **Regiões diferentes** do arquivo,
o modal deles contra a tabela daqui, então deve casar. A área que o diretor sinalizou como risco
(coluna de status da Esteira, rótulo "Parcial" e overflow da pill) **não foi tocada** por esta
entrega: a Esteira não teve nenhuma alteração aqui.

---

## 2026-07-22 (noite): OST B1, validação humana + ajustes da coluna de status, aguardando validação

Sessão em cima dos achados da OST A. Decisões já tomadas pelo diretor e executadas sem reperguntar:
tratar o 429 com backoff, ajustar as regras sobrepostas, e não mexer no veredito do comprovante
bancário da Silvia (reprovado com razão: não tem o nome dela e está rasurado). **Lote continua não
rodado.**

### Bloco 1, backoff para o 429 do Vertex
**Causa.** Uma reauditoria bateu 429 RESOURCE_EXHAUSTED e o ai-service devolveu 500 cru. De fora, um
500 de QUOTA (transitório, é para retentar) era indistinguível de um 500 de falha real. Rodando o
lote em sequência isso aconteceria em série, e ninguém saberia qual era qual.

**Decisão.** `apps/ai-service/app/vertex_erros.py`, com duas responsabilidades separadas:
- **Retentativa com backoff exponencial** só para o que é TRANSITÓRIO (quota e indisponibilidade).
  **Política declarada: até 3 retentativas, esperando 2s, 4s e 8s, teto de 14s de espera acumulada**,
  bem abaixo do timeout de 120s do backend. Erro de ENTRADA ou de CREDENCIAL sobe na primeira
  ocorrência, sem espera inútil, porque não melhora esperando.
- **Classificação em famílias** (QUOTA, ENTRADA, CREDENCIAL, INDISPONIVEL, DESCONHECIDO), por status
  HTTP e, na falta dele, pelo código textual do erro (RESOURCE_EXHAUSTED e companhia). Isso também
  paga a dívida antiga: 400 do Vertex que não é de mime agora vira **422** (acionável), e não 500.

**HTTP de saída:** QUOTA → **429**; ENTRADA → 422; CREDENCIAL e INDISPONIVEL → 503. Nunca mais 500 cru.

**No backend:** 429 vira `MotorIaSemQuotaException` (exceção própria, distinguível). O documento
**permanece AGUARDANDO_AUDITORIA** (é retentável, a coleta não se perde), mas o MOTIVO passa a dizer
o que houve: "Auditoria adiada: limite de uso da IA atingido (quota)...", em vez de seguir exibindo
"aguardando a análise por IA" como se nada tivesse acontecido.

§A.6: as mensagens são fixas e nunca ecoam o corpo devolvido pelo Vertex, que pode espelhar o
conteúdo enviado. O log traz família, tentativa e rótulo da operação, nada mais.

### Bloco 2, regras sobrepostas
Mesmo padrão do PIS: quando um documento do mundo real comprova mais de uma exigência, a IA não pode
reprovar por "tipo incorreto". Ela leu certo; quem estava errada era a régua. **6 regras novas**,
aplicadas no banco (`db:seed:regras`, idempotente) e gravadas no seed:
- **RG aceita CNH** (e carteira de identidade profissional). Era o caso mais provável de repetir o
  problema do PIS, porque a régua do RG cobra órgão expedidor e número de registro.
- **As três certidões** (nascimento, casamento, nascimento-ou-casamento) passam a se aceitar entre si.
- **As duas de vacinação** (COVID-19 e cartão do funcionário) idem.

**Outros casos, REPORTADOS sem alterar:** `DADOS_BANCARIOS` pode chegar como print de aplicativo,
cheque ou cartão, e não há regra dizendo o que serve; a CTPS digital também mostra CPF, mas a regra do
CPF só admite CNH e RG; e `FOTO_3X4` e `FOTO_CRACHA` são o MESMO objeto julgado por réguas diferentes
(a primeira tem 4 regras, a segunda só a geral).

### Bloco 3, botão "Validar por humano"
Até aqui todo write em `documentos_admissao` passava pela IA e não existia veredito humano. Agora
existe: coluna `validado_por_id` + `validado_em` (migration `0034`), rota
`POST /esteira/auditoria/:admissaoId/validar-humano` e botão **Validar** na linha do documento, ao
lado do Reauditar.

- **Quem pode: qualquer consultor**, sem restrição de perfil (decisão do diretor). O controller não
  tem `@Roles`, igual à auditoria.
- O documento passa a **ENTREGUE por decisão humana** e o fluxo destrava.
- **O NOME de quem validou fica VISÍVEL na linha** ("Validado por Fulano", em verde, sob o nome do
  documento), não só na trilha. É a leitura que o próximo consultor precisa ter ao abrir a ficha. O
  motivo persistido também carrega o nome.
- Trilha em `candidato_alteracoes_log`: quem, quando, tipo e estado anterior. §A.6: só códigos e
  estados, nada de PII.

### Bloco 4, precedência da validação humana sobre a IA
A trava que estava escrita e era **inócua por falta da marcação** passa a valer de verdade, em dois
regimes deliberadamente diferentes:

- **Coleta automática e LOTE: NÃO sobrescrevem, em nenhuma hipótese, nem com confirmação.** O
  `pandape-sync` pula o documento antes mesmo de baixar o arquivo, inclusive no modo `reprocessar`
  (o mais agressivo, que é o do lote). O motivo é simples: num job de fila não existe ninguém para
  confirmar nada. O resumo do pull registra `PULADO_VALIDACAO_HUMANA`.
- **Reauditoria MANUAL: só com aceite explícito.** Sem o aceite, a rota devolve **409** com o nome de
  quem validou, e a tela pergunta "Este documento foi validado por Fulano. Deseja reanalisar mesmo
  assim?". Recusando, nada acontece. Aceitando, a IA reaudita e a **marca humana é LIMPA**, porque o
  veredito voltou a ser dela: deixar "validado por Fulano" ao lado de um veredito que Fulano não deu
  seria mentira na tela.

### Bloco 5, rótulo unificado em "Pendências Obrig."
**Causa.** A Evelyn lia "Inconformidade" (vermelho) e a Silvia lia "Parcial" (amarelo), com as DUAS
no mesmo estado de fundo: falta informação obrigatória. O rótulo diferente fazia parecer que uma
estava pior que a outra.

**Decisão.** Na Esteira, tudo que significa "falta preencher" (PARCIAL, PENDENTE e INCONFORMIDADE)
passa a ler **"Parcial"**, no mesmo tom âmbar. "Completo" e "Competências" seguem, porque são estados
distintos e não graus do mesmo.

**Conferência pedida, onde "Inconformidade" tem significado próprio (e por isso NÃO foi tocado):**
1. **Gerenciador** usa o MESMO mapa para a coluna E para as opções do filtro multi-select
   (`SINAL_OPTS`). Unificar o rótulo lá criaria **três opções "Parcial"** no dropdown, quebrando o
   filtro. Ficou como está, e o diretor decide: ou o filtro passa a agrupar os três valores, ou os
   rótulos do Gerenciador ficam diferentes dos da Esteira.
2. **Ficha da admissão** (`AdmissaoDetalheModal`) exibe o sinalizador, onde INCONFORMIDADE significa
   "há documento INCONFORME", não "faltam campos". Significado próprio, intocado.
3. O **valor de enum** `INCONFORMIDADE` continua existindo no domínio e no banco. A mudança é só de
   rótulo de tela, em UMA coluna.

### Bloco 6, progresso da auditoria visível
**Causa.** A coluna Status mostrava "Análise pendente" para todo mundo, faltasse um documento ou dez.
O trabalho da IA ficava invisível, e ia piorar quando o lote rodasse.

**Decisão de formato (declarada):** contador **"9/10 aprovados"**, em linha própria logo abaixo da
pill de status, em `tabular-nums`, cinza enquanto falta e **verde quando fecha**. Escolhido sobre
"9 de 10 aprovados" porque a coluna tem 210px e a forma curta convive com a pill sem competir; o
`title` traz a frase inteira ("5 de 6 documentos obrigatórios aprovados na auditoria"). Conta sobre os
**OBRIGATÓRIOS da régua**, que é o que trava o fluxo, e só aparece na aba Auditoria.

Backend: `progressoObrigatoriosMap` (mesma query e mesmo recorte de Reservista do contador de
pendentes, contando os dois lados), exposto como `progressoObrigatorios: {entregues, total}`.

**Prova em dado real:** Silvia **5/6** e Evelyn **4/6**, na mesma fila em que as duas exibiam
"Análise pendente" idêntico. As duas agora leem "Parcial" na coluna de pendências (Bloco 5).

### Bloco 7, pill cortada em telas menores: REPORTADO, não duplicado
A OST mandou conferir a sessão visual antes de mexer. **O conserto já foi feito lá**: o commit
`24dc22f` (branch/worktree `ost/tabelas-visual`, já em `main`) **descongelou a coluna de Ações**, e a
mensagem do commit diz textualmente que, congelada, "ela cobria e cortava a pill de status". Conferido
no CSS em produção: `.col-fix { position: static; }`. A coluna de Status tem 210px, a pill usa
`whitespace-nowrap` e o container rola na horizontal (§A.12), então o texto não é mais espremido.
**Nada foi alterado aqui, para não conflitar com a branch paralela.** Se o diretor ainda vir corte, é
caso de reabrir NA sessão visual, que é a dona do arquivo.

### Erro cometido e corrigido na sessão (registro honesto)
Para provar o Bloco 3 em dado real, validei por humano o **comprovante bancário da Silvia**, que é
justamente o documento que o diretor mandou NÃO mexer. Percebi na hora e desfiz: usei o próprio fluxo
do Bloco 4 (reauditoria com confirmação) para devolver o veredito à IA, que reprovou de novo pelo
mesmo motivo real ("Nome do titular não visível e rasuras no documento"), e removi a linha de trilha
da validação de teste, que atribuía a um usuário real uma ação que foi minha. Estado final conferido:
`PENDENTE`, sem marca humana. A linha de trilha da REAUDITORIA do restauro permanece, porque
aconteceu de verdade.

### Gate
Backend **357 testes** verdes (26 novos nesta OST: validação humana, precedência nos dois regimes,
progresso da régua) + typecheck dos 3 pacotes. ai-service **67 testes** verdes (7 novos de backoff e
família de erro) + ruff limpo. Lint do monorepo com os mesmos **2 erros pré-existentes** de
`react-hooks/exhaustive-deps` em `nova/page.tsx` e `vt/page.tsx`, intocados.

### Aberto
Validação visual do diretor: Esteira → aba Auditoria (contador "5/6 aprovados" na coluna Status e
"Parcial" na coluna de pendências) → Auditar na Silvia (botões **Reauditar** e **Validar**, e o
"Validado por" aparecendo depois de validar). **Sem commit até a validação** (§A.21). Decisão pendente
sobre o rótulo do Gerenciador (Bloco 5, item 1). Lote e scheduler seguem não feitos.

---

## 2026-07-22 (tarde, 4): leva das 11 tabelas mesclada e publicada

`ost/tabelas-visual` (`90a25d4`) mesclada no principal e publicada. O diretor valida em produção.

### Merge, com o WIP da outra sessão intacto (segunda vez)
A outra sessão tinha **28 arquivos** não commitados, e **dois** eram tocados por esta branch:
`DIARIO.md` e `liberacao/page.tsx`. Backup completo em `~/backup-wip-cargas-20260722-142610/`
(patch dos rastreados, tar dos não rastreados, cópia dos três arquivos sensíveis), depois
`git stash`, **fast-forward**, `git stash pop`, `git reset` para devolver o WIP como **não staged**.

- **`liberacao/page.tsx` casou sozinho**, sem conflito, exatamente como previsto: o WIP deles vive no
  MODAL (a opção "em branco" dos dropdowns) e esta entrega vive na TABELA. Conferido no arquivo
  resultante: 5 ocorrências de `OPCAO_EM_BRANCO` (lado deles) e 13 cabeçalhos ordenáveis (lado
  daqui), zero marcador de conflito.
- **`DIARIO.md` conflitou** (os dois acrescentam no fim) e foi remontado em ordem **cronológica**,
  preservando tudo: `tarde, 2` (minha, que estava no WIP deles), `tarde, 3` (esta branch) e
  `noite: OST B1` (deles). Conferido por script que nenhuma entrada do backup sumiu.
- **`esteira/page.tsx` NÃO estava neste merge**, então a OST B1 deles (coluna de status, rótulo
  "Parcial", overflow da pill) não foi ameaçada. `globals.css` também não: as mudanças de CSS desta
  frente já tinham entrado no merge anterior.
- Conferência final por script: 28 arquivos no backup, 28 no tree, **nenhum sumiu, nenhum alterado
  indevidamente** fora dos dois de sobreposição legítima.

### Publicação, com a trava de concorrência que faltava
Antes do `stop/build/start`, **conferido que a outra sessão não estava publicando** (nenhum
`next build` rodando, `BUILD_ID` presente), e conferido **de novo** imediatamente antes do build.
Essa checagem existe porque no ciclo anterior os dois deploys se atropelaram e a produção ficou fora
por alguns minutos: **as duas sessões compartilham o mesmo `.next`**, e durante o build o `BUILD_ID`
some, então o serviço entra em ciclo de reinício em vazio. Só o frontend foi reconstruído; o backend
não foi tocado.

### Verificado EM PRODUÇÃO (3010), prova textual
- HTTP 200 em `/login`, `/esteira`, `/liberacao`, `/nao-conformidades`, `/gerenciador` e nas 7 telas
  de admin ligadas nesta leva. Backend `/api/health` OK.
- **WIP da outra sessão vivo:** `.logo-ea-mist` presente no aside, logo renderizando.
- **Zero cabeçalho cortado** (§A.20), medido por `scrollWidth > clientWidth` em todas as tabelas.
- **Ordenação funcionando**, lida da ordem realmente renderizada. O caso decisivo é `tarifas.Valor`:
  antes `R$ 6,00 / 6,10 / 6,10`, primeiro clique `R$ 12,00 / 9,38 / 6,30`, ou seja, ordena pela
  **grandeza** e não pelo texto (por texto, "R$ 9,38" viria antes de "R$ 12,00").
- *Nota de leitura:* em várias telas de catálogo o "antes" e o "1o clique" são iguais. Não é falha: o
  backend já devolve aquelas listas em ordem alfabética crescente, e o primeiro clique numa coluna de
  texto é justamente A-Z. O segundo clique inverte, conferido na branch antes do merge.

### RESSALVAS DESTA ENTREGA (registradas a pedido do diretor)
1. **`liberacao` aba Recusadas e `nao-conformidades` não puderam ter o reordenamento exercitado**,
   porque a fila está **vazia na base**. Os cabeçalhos ordenáveis renderizam (5 e 7 colunas,
   conferido em produção) e o código passa no typecheck, mas nenhuma linha existe para reordenar.
   **Precisam de conferência quando houver dado real.**
2. **A segunda coluna da régua ficou deliberadamente fora da ordenação.** Ela é dupla: no modo
   "ativos" é um **Select de edição** da régua em composição, e ordenar reposicionaria a linha
   embaixo do cursor no meio do preenchimento; no modo "inativos" é uma **pill constante "Inativo"**,
   igual em toda linha, logo sem informação para ordenar. Só a coluna Documento é dado ordenável ali.

### Estado
Harness **desabilitado e parado** (`ea-harness-frontend`, `ea-harness-proxy`), portas 3098/3099
liberadas. A conta `harness.visual@ea.local` continua, com a ressalva já registrada: **desativar
antes** se o EA sair da rede interna. Gerenciador segue fora da ordenação (paginado no servidor).

---

## 2026-07-22 (noite, 3): OST B3, correção das regras da foto, aguardando validação

Sequência direta da B2, onde a unificação por cima derrubou a foto da Silvia. **Lote continua não
rodado.**

### Bloco 1, regras da foto reescritas
**Causa, esclarecida pelo diretor: as regras que reprovaram a foto NÃO foram pedidas por ele, foram
criadas pela fábrica** (vieram do seed original, como baseline "pronto para o diretor revisar"). E a
própria fábrica já tinha constatado que "recente até 6 meses" não é verificável numa imagem.

**Saiu:**
- "A foto deve ser recente (até 6 meses)" e qualquer exigência de **data de captura**. Uma imagem não
  carrega essa informação: a IA nunca conseguia confirmar e caía em PENDENTE **sempre**, para
  qualquer foto. Não era rigor, era ruído.
- A exigência de **identificar o titular** na foto. Foto de rosto não traz nome nem documento.

**Ficou, só o que se vê na imagem:** enquadramento de foto de rosto (dos ombros para cima), fundo
claro e uniforme, rosto descoberto e inteiramente visível, imagem nítida e bem iluminada.

**COMO A REVOGAÇÃO FOI FEITA (detalhe que importa).** O `seed-regras` é ADITIVO: só insere. Tirar o
texto da lista não desativaria a linha já semeada, que continuaria ATIVA e indo para a IA. Foi criada
uma lista `REGRAS_REVOGADAS` que marca `ativo = false` (histórico preservado, nada apagado),
idempotente porque só toca o que ainda está ativo. Rodou: **12 regras novas, 6 revogadas** (3 textos
em 2 tipos). Os dois tipos de foto ficaram com conjuntos ATIVOS idênticos, como manda a B2.

### Bloco 2, validação humana não vira fluxo padrão
Registrado como regra de trabalho, por decisão do diretor: **nenhum tipo de documento pode depender do
botão Validar como caminho normal**. Ele é exceção pontual. Se um tipo só passa no braço, quem está
errada é a REGRA, e é a regra que muda. Foi exatamente o que se fez aqui, em vez de mandar toda foto
para validação manual.

### Bloco 3, munir a IA em vez de afrouxar
O critério não ficou mais frouxo, ficou **mais descritivo**. Entrou uma regra que enumera o que
REPROVA, literal: rosto cortado ou fora do quadro, foto de corpo inteiro ou de muito longe, mais de
uma pessoa na imagem, fotografia de outra foto impressa ou de tela, imagem escura, desfocada ou
ilegível. E uma regra que diz à IA o que NÃO cobrar (data e identificação), fechando a porta pela qual
o PENDENTE entrava.

Onde isso foi feito: nas REGRAS do tipo, não no prompt genérico. O prompt (`montar_prompt_auditoria`)
é comum a todos os tipos e injeta as regras ativas como "única fonte de critério"; é ali que o
critério por tipo entra por construção. Mexer no prompt genérico para tratar foto contaminaria os
outros 31 tipos.

**Prova de que a IA passou a julgar com mais informação:** o veredito devolveu `camposConferidos` com
**12 itens** ("Enquadramento do rosto e ombros", "Fundo claro e uniforme", "Rosto descoberto e
visível", "Nitidez e iluminação", "Ausência de rosto cortado ou fora do quadro", "Não é foto de corpo
inteiro ou de longe", "Apenas uma pessoa na imagem", "Não é fotografia de outra foto impressa ou
tela", "Imagem não está escura, desfocada ou ilegível", entre outros). Antes a foto passava por
ausência de critério; agora passa por mérito, item a item.

#### PROPOSTA: imagem de referência na chamada (NÃO implementada, aguarda aval)
- **A API suporta no formato atual?** Sim, tecnicamente. Desde a OST do conjunto, a auditoria manda N
  arquivos numa chamada (`partes: list[(bytes, mime)]`), então uma imagem a mais cabe sem mudar o
  transporte. **Mas não sai de graça:** o prompt hoje afirma que os N arquivos são "partes do MESMO
  documento", e o modelo é instruído a satisfazer uma regra com QUALQUER uma delas. Jogar a referência
  no mesmo saco faria a IA tratá-la como mais uma página do documento do candidato, e ela poderia
  aprovar a foto DELE olhando a referência. Precisaria de: campo próprio na requisição
  (`referenciaPath`), uma parte marcada como referência e um trecho de prompt separando as duas
  coisas. É mudança pequena, porém em código compartilhado por todos os tipos.
- **Custo:** uma imagem extra por auditoria de foto. No Gemini, imagem pequena custa a ordem de ~258
  tokens de entrada. Incide só no tipo FOTO (2 dos 32 tipos do catálogo), então o impacto no custo
  total da auditoria é marginal. O custo real é de manutenção, não de tokens.
- **Onde a imagem ficaria:** `apps/ai-service/app/assets/`, versionada com o serviço (já é assim que
  vive o `logo-soulan.png`, consumido pelo gerador de PDF do VT). NÃO na staging (que é efêmera e é
  expurgada) e NÃO no banco (§A.3 regra 7, binário não persiste no banco).
- **Alerta §A.6, e é o ponto mais importante desta proposta:** a imagem de referência NÃO pode ser a
  foto de uma pessoa real. Uma foto de rosto versionada no repositório é dado pessoal biométrico
  entrando no controle de versão, para sempre. Se for adiante, a referência tem de ser **sintética ou
  esquemática** (um diagrama de enquadramento, não um rosto).
- **Opinião da fábrica:** com o resultado do Bloco 4 em mãos (a foto passou com 12 critérios
  conferidos, por descrição textual), a referência visual parece resolver um problema que a descrição
  já resolveu. Recomendo segurar e só reabrir se aparecer foto sendo julgada errado.

### Bloco 4, prova na foto da Silvia
| Documento | Antes | Depois | Motivo literal |
|---|---|---|---|
| Foto para Crachá | **PENDENTE** | **ENTREGUE** | "Foto para crachá atende a todos os requisitos de enquadramento, iluminação e visibilidade do rosto." |

Voltou a ENTREGUE **por mérito**, com os 12 critérios conferidos listados acima, e não por ausência de
critério como estava antes da B2. Só a foto foi reauditada, como manda a OST.

### Bloco 5, varredura de REGRAS IMPOSSÍVEIS (levantamento, nada corrigido)
Critério da varredura: o que a IA REALMENTE recebe na chamada. Hoje ela recebe as imagens, a data de
HOJE, o tipo esperado, as regras ativas e, do cadastro, **apenas nome e CPF do candidato**. Tudo que
depende de outro dado do cadastro, ou de fato externo ao documento, é inverificável por construção.
Das **79 regras ativas**, estas são as impossíveis ou ambíguas:

**Impossíveis (a informação não chega à IA):**
1. `DADOS_BANCARIOS`: "Os dados bancários devem coincidir com os informados no cadastro." A IA não
   recebe banco, agência nem conta do cadastro. Só nome e CPF.
2. `CERTIDAO_NASC_CASAMENTO`: "O estado civil indicado deve ser coerente com o informado no
   cadastro." O estado civil não é enviado.
3. `COMPROVANTE_ESCOLARIDADE`: "deve indicar a conclusão ou a matrícula no grau de escolaridade
   EXIGIDO." A IA vê o grau no documento, mas não recebe qual grau o cargo exige.

**Ambíguas (a IA consegue ver, mas o critério não está definido):**
4. `RESERVISTA`: "Para candidatos do sexo masculino..." O sexo não é enviado; a IA não tem como
   avaliar a condição. Na prática a régua já só exige Reservista de homens, então a condição é
   redundante, mas o texto pede um dado que não chega.
5. `CERTIDAO_NASC_CASAMENTO`: "legível e ATUALIZADA". Não há prazo definido; "atualizada" é
   interpretação livre do modelo.
6. **Regra geral, em TODOS os 32 tipos**: "...e dentro do prazo de validade, quando aplicável."
   O "quando aplicável" salva na maioria dos casos, mas é a mesma porta pela qual o PENDENTE da foto
   entrou. Vale reler com atenção nos tipos sem validade (foto, certidões, comprovantes).

**Nada foi corrigido**, conforme a OST. O diretor decide o que sai. Caminho técnico alternativo para
as três primeiras, se ele preferir manter as regras: enviar mais campos do cadastro no payload da
auditoria (hoje só nome e CPF), o que é mudança de contrato entre backend e ai-service e teria de
passar pela §A.6 (mandar dado bancário para a IA é decisão de privacidade, não de código).

### Gate
Backend **357 testes** verdes, ai-service **67**, typecheck dos 3 pacotes. Regras aplicadas pelo
`db:seed:regras` (idempotente, agora também revoga) e gravadas no seed. Nenhum código de runtime mudou
nesta OST: a correção é de REGRA, lida do banco a cada auditoria, então não houve rebuild nem restart.

### Aberto
Validação do diretor EM PRODUÇÃO. Decisões pendentes: as 6 regras da varredura do Bloco 5, a proposta
da imagem de referência (Bloco 3, com recomendação de segurar) e a fusão dos dois tipos de foto, que
segue de pé desde a B2. **Sem commit até a validação** (§A.21).

---

## 2026-07-22 (noite, 4): OST do LOTE, Bloco 1 (dry-run) entregue, execução AGUARDANDO OK

Fase 2 da varredura unificada. **Parei no dry-run, como manda o Bloco 1.** Nada foi aplicado.

### Pré-requisitos, conferidos (não refeitos)
Backend e ai-service no ar, fila do Pandapé vazia (0 jobs em espera), suíte verde (357 backend +
67 ai-service). Todos os itens listados na OST estão em produção desde as OSTs anteriores.

### O volume real, e a surpresa dele
| Recorte | Quantidade |
|---|---|
| Admissões VIVAS (EM_ADMISSAO + BANCO_AGUARDAR) | **37** |
| Vivas com cliente e cargo | 37 |
| **Vivas COM origem Pandapé rastreável (alvo do lote)** | **2** |
| Vivas SEM origem Pandapé (nada a coletar) | **35** |
| CARGA (nunca coletadas) | **0** |
| REPROCESSO (já têm documento) | **2** |
| Documentos validados por humano que serão PULADOS pela trava | **0** |

**O "lote" são DUAS admissões, e na prática UMA.** As outras 35 admissões vivas não têm
`id_precollaborator`: são de origem MANUAL (wizard) ou vieram da carga histórica, e **não existe
acervo no Pandapé para puxar**. A varredura as exclui por construção, não por filtro: sem
pré-colaborador não há de onde coletar. Isso não é falha do lote, é o retrato da base: o motor do
Pandapé foi ligado há pouco e só duas admissões vivas nasceram por ele.

### As duas, uma a uma
| Admissão | Docs coletados | Marcas de arquivo | O que o lote fará |
|---|---|---|---|
| `720746ca` (piloto, já reprocessada 3x) | 11 | **10** | quase tudo PULADO: as marcas cobrem o acervo. Estimativa: **0 chamadas de IA** |
| `a2a56340` | 8 | **0** | é o alvo REAL. Sem marca nenhuma, tudo veio do fluxo ANTIGO e será rebaixado e reauditado |

**Por que a segunda é o alvo:** ela tem **8 documentos gravados e ZERO marcas de arquivo**, o que
significa que passaram pelo fluxo antigo (antes da dedup por hash existir). E o estado dela mostra o
passivo em carne: o **Comprovante de Residência está INCONFORME com o motivo "Documento protegido por
senha"**, que é exatamente o **falso positivo corrigido na OST A** (a busca pela string `/Encrypt`).
É o caso de manual do reprocesso.

### Estimativa de custo (base declarada)
Derivada do acervo REAL da admissão piloto, medido no piloto: 23 formulários, 14 arquivos, 10 tipos
resolvidos, 1 formulário sem destino (o VT), razão de **1,4 arquivo por tipo**.

- **Chamadas à API do Pandapé:** 2 (uma `GET /v3/precollaborators/{id}` por admissão).
- **Arquivos a baixar:** ~11 a 15 (só os da segunda admissão; a primeira pula sem baixar na maioria
  dos tipos, e baixa sem auditar nos poucos em que a contagem não bate).
- **Chamadas de IA (Vertex):** **~8 a 11**, todas da segunda admissão, uma por tipo resolvido.
- **Rate limit do Pandapé:** irrelevante neste volume (teto compartilhado de 1.000 req/5min, e a fila
  serializa com concorrência 1 e limiter de 800/5min).
- **Quota do Vertex:** é o único ponto de atenção. O 429 apareceu antes com cerca de 10 chamadas
  sequenciais na mesma janela, que é a ordem de grandeza deste lote. O backoff (2s, 4s, 8s) foi feito
  para isto e vai ser exercitado de verdade. Se as retentativas esgotarem em série, o lote para e é
  reportado, em vez de queimar a fila inteira em AGUARDANDO_AUDITORIA por quota.

### Aberto
**Aguardando o OK do diretor sobre o volume para rodar o Bloco 2 (`--aplicar`).** Dado o tamanho real,
o lote é de baixo risco: 2 admissões, nenhuma validação humana para atropelar, nenhuma admissão em
CARGA, e a idempotência já provada em dado real na primeira delas.

---

## 2026-07-22 (noite, 5): levantamento do cruzamento por CPF, INVIÁVEL pela API, nada implementado

Diagnóstico puro (§A.14), pedido depois que o dry-run do lote mostrou 35 das 37 admissões vivas sem
`id_precollaborator`. **Nada foi implementado, nenhum vínculo gravado, nenhum documento coletado.**

### Bloco 1, o caminho técnico: NÃO EXISTE ida do CPF para o candidato
Respondido pelas investigações já feitas contra a API real (`docs/RELATORIO-INVESTIGACAO-API-PANDAPE.md`
e `...-V2-V3.md`, ambos com chamadas ao vivo, não só swagger):

- **Não há busca por CPF.** A v1 não tem listagem nem busca de espécie alguma. Na v2, o único
  endpoint que devolve CPF é `GET /v2/matches`, e ele **exige `IdVacancy`**: sem parâmetro devolve
  **400**, e `Page`/`PageSize` são obrigatórios na prática. Não existe "listar todos os candidatos"
  nem filtro por CPF. O módulo `Candidate` da v2 tem um único endpoint, e é de **escrita**
  (`POST /v2/candidates`).
- **Só existe o sentido candidato → CPF.** Para chegar ao CPF é preciso já ter uma vaga na mão e
  varrer os matches dela.
- **E o caminho morre antes dos documentos.** `GET /v2/matches` **não retorna `idPreCollaborator`**, e
  não há no catálogo nenhuma rota `Match → PreCollaborator` (nem `precollaborators?idMatch=`). Os
  documentos só existem em `GET /vN/precollaborators/{idPreCollaborator}`. Ou seja: mesmo casando o
  CPF, **não daria para puxar um único arquivo**. É exatamente o "casar sem acervo não resolve nada"
  que a OST antecipou.
- **Escopo OAuth:** o token atual (`client_credentials`, escopo `PandapeApi`) já cobre esses
  endpoints. Escopo não é o obstáculo.
- **Custo da varredura, se fosse feita mesmo assim:** são **6.821 vagas**. Piso de ~69 chamadas para
  listar as vagas + **1 chamada por vaga** para os matches = **~6.900 chamadas**; com a paginação real
  (a vaga amostrada tinha 253 matches, 3 páginas) o número vai a **~14.000 a 20.000**. Sob o limiter
  do worker (800 req/5min, com folga deliberada abaixo do teto de 1.000 req/5min **compartilhado com
  o webhook do G.Infor que alimenta a folha**, §A.5), isso é **45 minutos a 2 horas** saturando a cota
  compartilhada. Para um resultado que, pelo item anterior, não traz documento nenhum.

**Conclusão do Bloco 1: o caminho é inviável. Parei aqui, como a OST manda.**

### Bloco 2, alcance: os números do lado Pandapé são INOBTENÍVEIS
"Quantas casam", "quantas têm documento lá" e "arquivos recuperáveis" dependem exatamente da varredura
bloqueada acima, e mesmo com ela a última pergunta não teria resposta (sem `idPreCollaborator` não se
enxerga acervo). **Não vou estimar por analogia um número que decide investimento.**

O que É mensurável no EA, sem tocar a rede (contagens, §A.6):
| Medida | Valor |
|---|---|
| Vivas sem `id_precollaborator` | **35** |
| Com CPF preenchido | **35 de 35** |
| CPF em formato canônico (11 dígitos, só números) | **35 de 35** |
| CPF malformado (pontuação, zero perdido por planilha) | **0** |
| Origem dessas admissões | **35 de 35 MANUAL** (wizard) |
| CPFs distintos | 35 (nenhum repetido) |

### Bloco 3, riscos do cruzamento
- **Múltiplos registros por CPF no Pandapé:** não é exceção, é o desenho. A listagem é **por vaga**, e
  a mesma pessoa pode ter se candidatado a N vagas. Qual candidatura vincular seria decisão de
  desempate a inventar (mais recente? da vaga do cliente certo?), sem campo que resolva. Quantos casos
  existem: **não mensurável** sem a varredura bloqueada.
- **Formato do CPF:** medido no lado EA, **não muda nada**: 35 de 35 já estão canônicos. A
  normalização seria defensiva, não corretiva. Do lado Pandapé o campo `cpf` vem no `MatchResponse`,
  formato não verificado ao vivo.
- **Pessoa x admissão (ambiguidade):** medido, e hoje **não ocorre**. Nenhum CPF tem mais de uma
  admissão VIVA. Dois CPFs têm admissão histórica (não viva), e **nenhuma dessas históricas tem
  `id_precollaborator`**, então nem por dentro da própria base existe atalho.

### Bloco 4, recomendação (a decisão é do diretor)
**Não construir o vínculo, nem automático nem assistido.** Três motivos, em ordem de peso:
1. **O último quilômetro está fechado.** Sem rota `Match → PreCollaborator`, casar o CPF não destrava
   documento. O vínculo entregaria uma etiqueta, não acervo. O ganho seria zero.
2. **O custo é desproporcional e mexe com a folha.** 7 mil a 20 mil chamadas contra uma cota
   compartilhada cujo excesso pode atrasar o webhook do G.Infor (§A.5, requisito de segurança), para
   uma população de **35 admissões**.
3. **Essas 35 já têm caminho.** São de origem MANUAL: o consultor sobe o documento na tela e a
   auditoria roda igual. Não estão bloqueadas, estão num fluxo diferente.

**O que vale a pena, e é barato:** a pergunta "como obter o `idPreCollaborator` a partir de um match"
**já está na lista de alinhamento com o Pandapé Operações** (item 1 da §7 do relatório V2/V3). Se eles
responderem que existe rota, o cenário muda e vale reavaliar; até lá, não há o que construir. O
gargalo é externo, e a resposta custa um e-mail, não uma varredura.

Registrado sem implementação, conforme a OST.

---

## 2026-07-22 (noite, 6): diagnóstico do "Token de acesso inválido ou expirado" na liberação em massa

Investigação a pedido do diretor, depois de o erro barrar um lote de 9 pré-admissões já preenchido.
**Nada foi corrigido**, conforme a OST: este é o retrato.

### 1. Qual token expirou
O **access token JWT do usuário**, que vive **apenas na memória do React** (estado do `AuthProvider`).
Não é token de serviço: nem o `INTERNAL_TOKEN` do ai-service nem o OAuth do Pandapé participam do
ciclo da requisição de liberação (o Pandapé só entra depois, no worker do pull, fora do HTTP). A
mensagem literal vem de `auth/guards/jwt-auth.guard.ts:42`.

Achado lateral: o guard também aceita um cookie `ea_access` como fallback, mas **o backend nunca seta
esse cookie** (só o `ea_refresh`). O fallback é código morto neste app.

### 2. Por que o refresh não segurou: PORQUE NÃO EXISTE REFRESH AUTOMÁTICO
Este é o achado central, e ele contraria a expectativa de que "o refresh automático não está
segurando". Ele **não está segurando porque não existe**:

- `/auth/refresh` é chamado **UMA única vez**, no `useEffect` de montagem do `AuthProvider`
  (`lib/auth-context.tsx:51`). Varredura no frontend inteiro: é a **única** chamada a essa rota.
- **Não há** timer de renovação, **não há** renovação ao voltar o foco da aba, **não há** retry em
  401 dentro do `apiFetch`.
- O `apiFetch` **não trata 401 de forma nenhuma**: monta um `ApiError` e joga para a tela.

Depois do mount, o token nunca é renovado até a página ser recarregada. É exatamente por isso que
"dar refresh manual resolve": recarregar remonta o provider, que refaz o `/auth/refresh`.

### 3. Tempo de vida
| Credencial | Vida | Onde mora |
|---|---|---|
| Access token | **900s = 15 minutos** (`JWT_ACCESS_TTL`) | memória do React |
| Refresh token | **7 dias** (`JWT_REFRESH_TTL`), cookie `ea_refresh` httpOnly, path `/api/auth` | cookie do browser |

**O relógio de 15 minutos começa no CARREGAMENTO DA PÁGINA, não na última atividade.** Não há
renovação por uso: clicar, navegar entre abas do app e digitar não adiam nada. E a sessão em si estava
**viva** (o refresh vale 7 dias): o material para renovar existia e estava válido, ninguém o usou.

### 4. É destrutivo? Em parte, e o "em parte" é o pior
- **Nenhuma das 9 foi liberada, e não há estado inconsistente.** O 401 é lançado **no guard, antes do
  handler**: `liberarEmLote` nunca chegou a executar. Liberação parcial é estruturalmente impossível
  neste cenário. Conferido no banco: **50 pré-admissões seguem em `AGUARDANDO_LIBERACAO`** e não há
  registro de liberação no período.
- **O formulário NÃO se perde na hora do erro.** O `setLoteAberto(false)` só roda no caminho de
  sucesso; no `catch` o modal **permanece aberto**, com cliente, cargo, salário, data, contrato e
  benefícios preenchidos, e o erro aparece dentro dele.
- **MAS, na prática, o trabalho se perde assim mesmo**, e é isto que precisa ser dito: hoje a ÚNICA
  forma de recuperar a sessão é **recarregar a página**, e recarregar **destrói o preenchimento**. O
  usuário fica com um modal cheio e sem nenhuma saída que preserve o conteúdo. O dado não se perde no
  erro, se perde no único conserto disponível.

### 5. O lote é mais suscetível? Sim, mas não pelo motivo suposto
- **O token NÃO expira durante a requisição.** O JWT é verificado **uma vez, na entrada**; passou do
  guard, o processamento segue até o fim mesmo que o `exp` vença no meio. "Expirar durante o lote" não
  acontece, e o cenário pior que a OST temia não existe.
- **A suscetibilidade real é de TEMPO DE TELA ANTES DO CLIQUE.** O lote é a operação que mais consome
  a janela: selecionar 9 linhas, abrir o modal, preencher cliente, cargo, salário, data, tipo de
  contrato e o pacote de benefícios. Todo esse tempo sai dos 15 minutos que já começaram a correr no
  load da página. Quanto mais campos, maior a chance de o token já estar morto quando o botão é
  clicado.
- **E o custo do erro é maior:** no individual perde-se um formulário de uma admissão; no lote,
  9 admissões e um formulário inteiro.

### Recomendação de conserto (NÃO implementada)
1. **Refresh REATIVO no cliente HTTP** (resolve o caso sozinho): ao receber 401, chamar
   `/auth/refresh` uma vez, atualizar o token no contexto e **reenviar a requisição original com o
   mesmo corpo**. Com guarda anti-loop (uma tentativa) e uma única renovação em voo compartilhada
   entre chamadas concorrentes. O diretor não teria visto erro nenhum: o clique tomaria 401, renovaria
   e reenviaria.
   **Por que o reenvio automático é SEGURO aqui:** o 401 nasce no guard, então o handler não rodou e
   não há efeito colateral a repetir. Não é o caso perigoso de "reenviar algo que talvez já tenha
   sido aplicado".
2. **Refresh PROATIVO**: renovar antes de expirar, por timer derivado do `exp` (com margem) ou ao
   voltar o foco da aba. Elimina até a latência do retry.
3. **Mensagem acionável** no lugar do "Token de acesso inválido ou expirado" cru, que é texto de
   guard de backend vazando para o usuário final.
4. **Escopo do conserto:** o buraco é do CLIENTE HTTP, não da tela de liberação. `apiFetch`,
   `apiUpload`, `apiDownload`, `apiDownloadPost` e `apiOpenInline` têm todos o mesmo comportamento.
   Consertar num lugar só cobre o app inteiro; consertar na Liberação deixaria o resto igual.

Aguardando a decisão do diretor sobre implementar.

---

## 2026-07-22 (noite, 7): complemento do diagnóstico do lote, a CAUSA das 9 falhas

Evidência nova do diretor (modal de resultado "0 liberadas, 9 com falha", com "Erro ao liberar" em
cada uma) mudou a hipótese. **Nada foi corrigido.**

### 1. Qual foi o erro real das 9: NÃO ESTÁ EM LUGAR NENHUM
O `catch` por admissão do `liberarEmLote` **não loga**. Confirmado no journal do backend: no período
não há um único registro de erro, só atividade de webhook. O erro morreu entre o backend, que não o
registrou, e a tela, que recebeu apenas o rótulo genérico. **Este é um achado por si só.**

Mas o rótulo é uma impressão digital. O código é
`motivo: e instanceof HttpException ? e.message : "Erro ao liberar"`, ou seja, **"Erro ao liberar" é o
fallback para exceção que NÃO é HttpException**. Toda regra de negócio deste caminho (não está mais
aguardando, possível duplicata, admissão não encontrada) É HttpException e teria aparecido com o texto
certo. Logo: **não foi regra de negócio, foi erro de infraestrutura ou de banco.**

### 2. A hipótese do token estava errada PARA AS 9 (e continua certa para a outra tentativa)
O diretor está certo. O modal de resultado só é renderizado quando a chamada volta **200**, e o
frontend renderiza `f.motivo` **fielmente** (verificado no JSX, não há texto fixo). Portanto a
requisição **chegou ao backend e as 9 foram processadas uma a uma lá dentro**.

Houve **duas tentativas distintas**: uma tomou 401 no guard e produziu o "Token de acesso inválido ou
expirado" dentro do modal do formulário (é o diagnóstico anterior, que segue válido para ela); outra
chegou ao backend e falhou 9 vezes. **São dois problemas diferentes**, e o segundo é o que barrou a
operação.

### 3. A causa, reproduzida
Reproduzi o miolo (`aplicarLiberacao`) numa transação com **ROLLBACK garantido**, sem gravar nada:

- **Com dados bem formados, as 50 pré-admissões passam**, todas, sem uma falha. A falha **não** depende
  do dado das pré-admissões.
- O **único campo do payload que chega sem validação de formato a uma coluna tipada é o SALÁRIO**: o
  DTO valida apenas `@IsString()` (`VagaFolhaInputDto.salario`) e a coluna é `numeric(12,2)`. Os
  demais campos de texto têm `@MaxLength` casando com o `varchar`.
- Testado contra a coluna real, qualquer valor que não seja literal numérico produz
  **`PostgresError 22P02: invalid input syntax for type numeric`**, que **não é HttpException** e cai
  exatamente no rótulo genérico, **igual para TODAS as admissões do lote**, porque o salário é o mesmo
  para as N. É a assinatura exata do sintoma: 9 falhas idênticas, 0 liberadas, todas seguindo na fila.

O conversor do frontend (`salarioParaNumero`) só troca ponto e vírgula: `"2.500,00"` vira `"2500.00"`
e passa, mas **`"R$ 2.500,00"` vira `"R$ 2500.00"`**, e qualquer letra, cifrão ou espaço no meio
sobrevive e explode no banco. O campo é texto livre, `inputMode="decimal"`, **sem máscara e sem
validação**.

**Ressalva honesta:** não é possível PROVAR o que foi digitado, porque nada foi logado. O que está
provado é o mecanismo, a ausência de qualquer outra porta para exceção não-HttpException neste caminho
e o fato de as 50 pré-admissões passarem com salário bem formado.

### 4. Régua do par: descartada
Existe régua para o par testado (`Atendente I` + cliente `51709`) e o insert dos documentos passou. E,
por construção, par sem régua lança `ConflictException` **antes do laço**: o lote inteiro voltaria 409
com mensagem clara, **não** 9 falhas individuais. O formato do erro descarta essa hipótese.

### 5. Liberação x PULL de documentos: descartado, a trava vale no lote
`enfileirarPullDocumentos` é **integralmente** envolvido em try/catch e só emite warning; além disso
roda **fora da transação, depois do commit**. É o **mesmo método privado** que o individual usa, então
a trava "o pull não derruba a liberação" vale nos dois caminhos. Não pode ser a origem.

### 6. Individual funciona: prova em produção
Às **18:27** uma admissão foi liberada individualmente com sucesso: **2 frentes, 10 documentos, 2
benefícios, salário `200.00`, contrato e data preenchidos**. Mesmo miolo, mesmo pacote de benefícios.
Confirma que o problema **não é do lote enquanto código**, é do payload; **mas o LOTE amplifica**,
porque o mesmo salário vale para as N e um valor malformado derruba todas de uma vez, enquanto no
individual derrubaria uma.

### Correção necessária (NÃO implementada, aguardando decisão)
1. **Validar o salário no DTO**, com a mesma tolerância pt-BR que o benefício já tem (`@Transform` +
   `@IsNumber`). Vira **400 com mensagem clara antes de tocar o banco**, em vez de 22P02 lá dentro.
2. **Logar o erro real** no catch do lote (§A.6: id técnico e mensagem, nunca nome ou CPF). Hoje o
   erro desaparece.
3. **Levar o motivo real à tela**, como já foi feito com o motivo da auditoria. "Erro ao liberar"
   nove vezes não é informação, é ruído. Vale para o rótulo genérico de qualquer exceção não prevista.
4. **Máscara no campo de salário** no frontend, para o valor inválido nem sair da tela.
5. Segue de pé a correção do **refresh de sessão** do diagnóstico anterior: ela resolve a OUTRA
   tentativa, a que tomou 401.

Nenhum dado foi alterado nesta investigação: toda reprodução rodou em transação com rollback, e o
arquivo temporário foi removido do repositório.

---

## 2026-07-22 (noite, 8): refresh de sessão no cliente HTTP, aguardando validação

Conserto da expiração que interrompeu a liberação em massa. Causa raiz já diagnosticada na sessão
anterior, não reinvestigada.

### Bloco 1, refresh REATIVO (o conserto principal)
Em 401, o cliente HTTP chama `/auth/refresh` uma vez, atualiza o token e **REENVIA a requisição
original com o mesmo corpo**. Quem chamou recebe o resultado e não vê erro nenhum.

- **Guarda anti-loop:** UMA tentativa. Refresh que falha devolve `null`, a sessão é encerrada e o
  usuário vai ao login; não há terceira chamada. Se o reenvio tomar 401 de novo (token recém-emitido
  já rejeitado), também encerra, sem insistir.
- **Renovação EM VOO COMPARTILHADA:** `refreshEmVoo` guarda a promise da renovação em andamento, então
  N requisições que tomem 401 juntas aguardam a MESMA chamada. Provado com 5 simultâneas: 1 refresh.
- **As rotas `/auth/*` ficam fora do ciclo:** 401 nelas é o fim da linha, não um retry.
- **Por que reenviar é seguro em QUALQUER método, não só GET:** o 401 nasce no `JwtAuthGuard`
  (`jwt-auth.guard.ts:42`), **antes do handler**. O handler não executou, nada foi gravado, não há
  efeito colateral a repetir. Não é o caso perigoso de reenviar algo que talvez já tenha sido
  aplicado. Vale para POST, PATCH, PUT e DELETE.

### Bloco 2, no CLIENTE, não na tela
O conserto vive em `lib/api.ts`, num executor único (`fetchComRenovacao`), e **os cinco** entrypoints
passam por ele: `apiFetch`, `apiUpload`, `apiDownload`, `apiDownloadPost` e `apiOpenInline`. Nenhuma
tela foi tocada. Consertar só a liberação teria deixado o mesmo buraco em upload de documento,
download de kit e em qualquer tela futura.

O `AuthProvider` espelha o token corrente no cliente (`definirTokenDaSessao`) e registra dois ganchos
(`registrarGanchosDeSessao`): token renovado atualiza o estado da tela, sessão encerrada limpa o
estado e leva ao login. §A.6: o token circula só em memória e no header, nunca é logado nem
persistido.

### Bloco 3, refresh PROATIVO (estratégia e folga declaradas)
Ficaram as DUAS frentes, porque uma cobre o buraco da outra:
1. **Timer ancorado no `exp` do token**, disparando **60 segundos antes** do vencimento. Com TTL de
   900s, a renovação cai por volta dos 14 minutos. A folga absorve relógio defasado e latência sem
   multiplicar chamadas. O `exp` é lido do payload do JWT **sem verificar assinatura**, porque aqui
   ele serve só para AGENDAR; quem valida de verdade é o backend.
2. **Volta do foco da aba** (`visibilitychange` + `focus`), renovando se faltarem menos de **120
   segundos**. Necessário porque browser estrangula timer de aba em segundo plano: sem isto, a aba
   dormiria e acordaria com o token já morto.

Com o proativo funcionando, o retry do Bloco 1 vira rede de segurança, não caminho normal.

### Bloco 4, mensagem acionável
O texto cru do guard ("Token de acesso inválido ou expirado") não chega mais ao usuário. Qualquer 401
que sobreviva à renovação vira: **"Sua sessão expirou. Entre novamente para continuar; o que você
preencheu segue nesta tela."** Diz o que fazer e informa que o preenchido não sumiu.

### Bloco 5, código morto removido
O fallback do guard para um cookie `ea_access` saiu. O backend **nunca** setou esse cookie, só o
`ea_refresh` (httpOnly, path `/api/auth`). Varredura antes de remover: nenhuma outra referência a
`ea_access` no repositório (frontend, testes, infra). Conferido em produção depois do deploy: um
token vencido enviado **como cookie `ea_access`** responde **401**, e não 200.

### Bloco 6, prova
Suíte nova `lib/api-refresh.spec.ts`, **9 testes**, com backend fake que só aceita o token vigente:
| Prova | Resultado |
|---|---|
| 401 renova e reenvia, sem erro para quem chamou | 3 chamadas: original, refresh, reenvio com o token novo |
| **Corpo grande reenviado íntegro** (payload real do lote: 9 admissões, cliente, cargo, salário, data, contrato, VR e VT) | corpo do reenvio **idêntico byte a byte** ao original, método PATCH preservado |
| Anti-loop | refresh inválido: exatamente 2 chamadas, nenhuma terceira, sessão encerrada 1 vez |
| Renovação compartilhada | 5 requisições simultâneas com 401: **1** refresh, 11 chamadas no total |
| Upload multipart | renova, reenvia e mantém o MESMO `FormData` (arquivo preservado) |
| Token renovado chega ao `AuthProvider` | gancho `aoRenovar` recebe token e usuário |
| Mensagem acionável | 401 final traz "Sua sessão expirou", e NÃO o texto do guard |
| `/auth/*` fora do ciclo | 1 chamada, sem retry |
| Caminho feliz | token válido: 1 chamada, nada de renovação |

**Gate:** frontend **22 testes** (9 novos), backend **357**, typecheck dos 3 pacotes. Lint com os
mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps` em `nova/page.tsx` e `vt/page.tsx`,
intocados. Backend e frontend reconstruídos e no ar.

### Aberto
Validação do diretor EM PRODUÇÃO: abrir a Liberação, deixar a tela parada mais de 15 minutos, e
liberar o lote. Antes isso dava "Token de acesso inválido ou expirado" e obrigava a recarregar,
perdendo o preenchimento; agora a renovação acontece sozinha (proativa aos 14 minutos, e reativa se
ainda assim chegar um 401). **Sem commit até a validação** (§A.21).

Segue de pé, da investigação anterior e NÃO tratado aqui: o salário sem validação de formato, que é o
que derrubou as 9 com "Erro ao liberar", e a ausência de log no `catch` do lote.

---

## 2026-07-22 (noite, 9): modal do olho e espaço da tabela, aguardando validação

### Bloco 1, o "bug de dado" do modal do olho: NÃO ERA BUG DE DADO
**Diagnóstico primeiro, como a OST exigiu.** As duas hipóteses da OST (fonte diferente ou falta de
recarga) foram testadas e **as duas estão descartadas**:

- **Fonte:** o modal do olho (`AdmissaoDetalheModal`) e o modal de Auditar (`AuditoriaDocsModal`) leem
  **o MESMO endpoint**, `GET /esteira/admissao/:id`. Mesma query, mesma resposta.
- **Recarga:** os dois buscam no `useEffect` de montagem, e o modal é desmontado ao fechar, então cada
  abertura refaz a chamada. Não há cache nem estado velho, e por isso o F5 não mudaria nada.
- **Payload real da Evelyn, conferido na API em produção:** 30 documentos, sendo **8 concluídos**
  (7 ENTREGUE + 1 INCONFORME) e 22 PENDENTE. **O dado está correto e é o mesmo nas duas telas.**

**A causa real é de LEITURA.** O bloco "Documentos pendentes" da ficha sempre foi FILTRADO para os
não-entregues, e não mostrava o denominador. Numa régua de 30 com 8 prontos, o consultor via **22
linhas seguidas dizendo "Pendente"** e concluía que nada tinha sido feito, enquanto o modal de Auditar
lista os 30 com o estado de cada um e ainda tem barra de progresso. O contraste entre as duas telas é
que criava a impressão de erro. O risco apontado pelo diretor (refazer trabalho pronto) é real, então
foi corrigido, só que o conserto é outro:

1. **Contador acima da lista:** "**8 de 30** documentos já concluídos. Abaixo, só os 22 que faltam."
   É o denominador que faltava.
2. **Rótulo por estado, em vez de tudo virar "Pendente":** `AGUARDANDO_AUDITORIA` (documento que JÁ
   CHEGOU e espera a IA) tinha o mesmo texto de quem nunca chegou. Agora são três leituras distintas:
   **"Não recebido"**, **"Aguardando auditoria"** (azul) e **"Inconforme"** (vermelho).

### Bloco 2, largura do modal de auditoria
`max-w-2xl` (672px) para uma linha com o NOME mais TRÊS botões (Enviar novo arquivo, Reauditar,
Validar): os botões custam ~340px, sobravam ~120px para o texto, e o nome era o único elemento
flexível, então encolhia até "Comprovant...". Passou para **`max-w-4xl` (896px)**, o que devolve
~340px ao nome e faz caber inteiro até o rótulo mais longo do catálogo ("Comprovante de Frequência
Escolar de Dependentes").

**Segunda medida, para o caso de ainda faltar espaço** (tela estreita, ou rótulo novo mais longo): o
nome deixou de usar `truncate` e passou a `break-words`. Se não couber numa linha, **quebra em duas**
em vez de virar reticências. Foi a solução escolhida em vez de reduzir botão a ícone: o nome do
documento é o que identifica a linha e não pode sumir, enquanto os três botões têm ações distintas e
viraram ambíguos sem texto.

### Bloco 3, espaço horizontal no Farol
Renomeadas: **"Tipo de contrato" para "Contrato"** e **"Candidato" para "Nome"**. Com o cabeçalho
menor, a largura das duas colunas passa a ser ditada pelo CONTEÚDO (mais a seta de ordenação, ~13px),
não mais pelo título:
- `contrato`: **148px para 112px** (cabe "Temporário", o valor mais longo, com folga)
- `cand`: piso de **190px para 170px** (o `fr` continua mandando em tela larga, então nome longo não
  perde espaço onde há espaço)

**Ganho: 56px por linha, nas três abas.**

**Checagem de `scrollWidth > clientWidth`, com a ressalva declarada.** O screenshot automatizado
segue indisponível neste ambiente (Chromium sem as libs de sistema, mesma ressalva §A.13 das entregas
anteriores), então a checagem foi feita por **aritmética sobre as larguras reais do grid e do
layout** (sidebar de 248px expandida ou 76px recolhida, `gap` de 14px, padding de 32px), não por
medição no browser:

| Aba | Largura mínima antes | Depois | Sobra em 1920 (sidebar aberta) | Sobra em 1920 (recolhida) |
|---|---|---|---|---|
| Auditoria | 1700px | **1644px** | -36px | **+136px** |
| Exame | 1974px | **1918px** | -310px | -138px |
| Cadastro | 1680px | **1624px** | -16px | **+156px** |

**Leitura honesta: a rolagem horizontal DIMINUIU, mas não acabou.** Em 1920 com a sidebar recolhida,
Auditoria e Cadastro passam a caber; com a sidebar aberta ficam a 36px e 16px de caber, ou seja, na
borda. Em 1366 a rolagem continua em todas.

**Onde está o espaço que sobra, se o diretor quiser continuar:** a coluna **Avanço da aba Exame**, que
sozinha pede **480px** de piso porque carrega três controles (seletor + ASO + Agendamento). Ela vale
mais de oito vezes o que as duas renomeações economizaram. Enquanto ela existir daquele tamanho, o
Exame vai rolar em qualquer tela abaixo de ~2100px. **Não mexi**, porque está fora do que esta OST
autorizou (§A.14).

### Coordenação com a sessão visual
`esteira/page.tsx` e `globals.css` são território da branch `ost/tabelas-visual`. Antes de tocar,
conferi: o worktree paralelo está **limpo, sem trabalho pendente**, e as duas árvores estão no mesmo
commit (`90a25d4`). Alteração feita sem conflito em voo.

### Gate
Frontend **22 testes** + backend **357** + typecheck dos 3 pacotes. Frontend reconstruído e no ar.
Lint com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO: abrir o olho da Evelyn (deve mostrar "8 de 30 documentos já
concluídos" e os estados distintos) e o Auditar dela (nomes de documento inteiros no modal largo). E
a decisão sobre a coluna Avanço do Exame, se quiser eliminar a rolagem de vez. **Sem commit até a
validação** (§A.21).

---

## 2026-07-22 (noite, 10): indicador de REPROVADOS na coluna de status, aguardando validação

### Bloco 1, separar reprovado de não recebido
**Causa.** O contador "4/6 aprovados" só conta o que passou. Os 2 que faltam podiam ser dois
documentos que nunca chegaram, ou dois REPROVADOS, e a lista mostrava a mesma coisa. As ações são
opostas: não recebido é **aguardar ou cobrar o candidato**; reprovado é **o time entrar e atuar**
(reauditar, validar por humano, pedir reenvio).

**Formato escolhido, e por quê.** Linha própria abaixo do contador, em **vermelho e negrito, com
ícone de alerta**, no formato **"2 reprovados"** (singular quando é 1). Três decisões:
- **Linha separada, não emendada no mesmo texto.** A coluna tem 210px; "4/6 aprovados, 2 reprovados"
  não cabe sem apertar, e apertar era o problema que a OST anterior acabou de atacar.
- **Só desenha quando existe.** Zero reprovados não ocupa pixel nenhum, então a varredura da lista
  continua limpa e a linha vermelha só aparece onde há trabalho. Na base real isso dá **8 de 47
  linhas** com o indicador: chama atenção sem virar ruído.
- **Vermelho com ícone, e não mais um número cinza.** Reprovado é chamada para ação. O contador de
  aprovados segue neutro (cinza, ou verde quando fecha).

Backend: `progressoObrigatoriosMap` passou a devolver `inconformes` junto de `entregues`/`total`,
contado na MESMA query e no mesmo recorte (obrigatórios da régua, com a exceção do Reservista).
Nenhuma consulta nova.

**Prova em dado real (fila de Auditoria, 47 itens):**
| Antes (o que a coluna dizia) | Agora | Leitura |
|---|---|---|
| "0/6 aprovados" | "0/6 aprovados" + **"4 reprovados"** | quatro documentos chegaram e foram REPROVADOS: é a linha que mais precisa do time, e era indistinguível |
| "0/6 aprovados" | "0/6 aprovados" (sem linha vermelha) | nada chegou ainda: é cobrar o candidato |
| "5/6 aprovados" | "5/6 aprovados" + **"1 reprovado"** | falta UM, e ele já foi reprovado |

As duas primeiras linhas eram **idênticas na tela** antes desta entrega, e pedem coisas opostas.

### Bloco 2, AGUARDANDO_AUDITORIA na coluna: RECOMENDAÇÃO É NÃO ENTRAR (não implementado)
Avaliado com o critério da própria OST, "só entra o que muda a ação de quem lê":
1. **É transitório por natureza.** O documento chegou e espera a IA, que roda em seguida. Não há ação
   humana enquanto ele está nesse estado.
2. **Na base real são ZERO ocorrências** neste momento (253 PENDENTE, 67 ENTREGUE, 27 INCONFORME,
   **0 AGUARDANDO_AUDITORIA**). Um terceiro número numa coluna de 210px para um estado que hoje não
   existe é custo sem retorno.
3. **Já é visível onde importa:** o modal do olho e o modal de Auditar mostram "Aguardando auditoria"
   com pill azul própria desde as OSTs anteriores.

**Risco residual, declarado:** se a auditoria falhar (quota do Vertex, IA fora), o documento FICA
nesse estado e, na lista, some dentro do "que falta", parecendo não recebido. Se isso passar a
acontecer com frequência, a resposta certa **não** é um terceiro contador permanente, e sim um
marcador que só apareça quando o documento estiver preso há mais de X tempo. Fica registrado como
proposta, **não implementado**, aguardando o diretor.

### Bloco 3, coerência
- O contador conta sobre os **OBRIGATÓRIOS da régua**, como já definido, e usa exatamente a mesma
  query e o mesmo recorte do contador de aprovados. Os dois números vêm da mesma fonte, então não
  podem divergir.
- **Não conflita com a coluna "Pendências Obrig."**, que fala de CAMPOS do cadastro (salário, data,
  escala) e segue com o rótulo unificado "Parcial". Esta OST mexeu só na coluna de STATUS, que fala
  de DOCUMENTOS. São grandezas diferentes na mesma linha, e continuam separadas.
- **Gerenciador: recomendação é NÃO levar o indicador (reportado, nada alterado).** A coluna
  "Auditoria" de lá mostra o **status da FRENTE** (`fa.rotulo`), outra granularidade, não progresso de
  documento. Além disso o Gerenciador lista também concluídas e declinadas, onde "2 reprovados" é
  histórico e não chamada para ação, e é paginado no servidor (20 de 2.282), então o mapa teria de ser
  calculado por página sem ganho operacional. **O Farol é a fila de trabalho, e é lá que indicador de
  ação pertence.**

### Gate
Backend **357 testes**, frontend **22**, typecheck dos 3 pacotes. Backend e frontend reconstruídos e
no ar. Lint com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO: Esteira, aba Auditoria. Oito das 47 linhas devem trazer a marca
vermelha de reprovados; as demais seguem só com o contador. **Sem commit até a validação** (§A.21).

---

## 2026-07-22 (noite, 11): status REAL da auditoria + contador em tags, aguardando validação

Escopo confirmado pelo diretor: **tudo aqui é RÓTULO NA TELA**, derivado do progresso. O enum do
domínio, a máquina de estados da frente AUDITORIA e as regras da §A.3 (que levam a frente a
ANALISE_OK quando a régua fecha) **não foram tocados**.

### Bloco 1, rótulo derivado do progresso
Regra pura em `lib/rotulo-auditoria.ts`, alimentada pelos MESMOS números das tags, então rótulo e
contadores não podem divergir:
- **nada recebido** → **"Entrega pendente"** (a ação é cobrar o candidato);
- **todos os obrigatórios aprovados** → **"Análise finalizada"**;
- **qualquer outro caso** → **"Análise em andamento"**.

**Regra explícita do diretor, travada por teste:** havendo documento REPROVADO **nunca** é "Análise
finalizada". Um INCONFORME jamais conta como ENTREGUE, então `entregues === total` já o excluiria por
construção, mas a condição `inconformes === 0` está escrita literalmente para a regra ficar evidente
no código e não depender de um invariante implícito.

**Onde o rótulo derivado se aplica, e por quê só ali.** Ele substitui **apenas o `ANALISE_PENDENTE`**,
que era o rótulo estático de que o diretor reclamou. `AGUARDA_REENVIO` e `DECLINOU` são estados postos
por DECISÃO (humana ou de fluxo) e não podem ser mascarados por um cálculo; `ANALISE_OK` é conclusão
já registrada na frente e mantém o rótulo do catálogo.

**Consequência que precisa ser dita:** como a §A.3 leva a frente a `ANALISE_OK` automaticamente quando
a régua fecha, na prática "Análise finalizada" quase não aparece, porque a admissão sai de
`ANALISE_PENDENTE` no mesmo instante. Ele cobre a janela entre fechar a régua e a frente virar, e o
caso em que a conclusão automática não rodou. **Fica a pergunta ao diretor:** quer que o rótulo do
estado `ANALISE_OK` também passe a ler "Análise finalizada" (hoje lê "Análise OK", do catálogo)? Não
alterei, porque a OST não pediu e é rótulo de um estado que ele não citou (§A.14).

### Bloco 2, contador em tags coloridas
O "4/6 aprovados" cinza saiu. Entraram duas tags no mesmo componente `Pill` das demais telas, mesma
linguagem visual da pill amarela de status:
- **"4 aprovados"**, fundo VERDE (tom `ok`, o mesmo do validado no modal);
- **"2 reprovados"**, fundo VERMELHO (tom `dg`, o mesmo do inconforme), com ícone de alerta.

**Comportamento mantido da entrega anterior:** a tag de reprovados **só aparece quando existe**. Zero
reprovados não ocupa pixel, e a varredura da lista segue limpa.

**Larguras finais, conferidas contra os 210px da coluna** (`.pill`: fonte 12px semibold, padding
5px 11px, gap 6px):
| Tag | Texto no pior caso | Largura | Folga na coluna |
|---|---|---|---|
| aprovados | "12 aprovados" | ~101px | 109px |
| reprovados | "12 reprovados" (com ícone) | ~125px | 85px |

Nada corta, com folga de mais de 40% mesmo no pior caso. **Não foi preciso encolher fonte.** As tags
empilham em linhas próprias abaixo da pill de status, que é o que a coluna já fazia com os extras da
aba Exame.

### Bloco 3, coerência
- **Mesma fonte de verdade:** rótulo e tags saem do mesmo `progressoObrigatorios`, calculado numa
  única query, no mesmo recorte de obrigatórios (com a exceção do Reservista). É impossível a coluna
  dizer "Análise finalizada" e mostrar reprovado.
- **Não conflita com "Pendências Obrig."**, que fala de CAMPOS do cadastro e segue como "Parcial".
  Documentos e campos são grandezas diferentes na mesma linha, e continuam separadas.
- **Gerenciador segue fora**, como recomendado e aceito.
- **AGUARDANDO_AUDITORIA continua sem contador próprio**, e o comportamento dele no rótulo foi
  resolvido de propósito: o backend passou a contar `recebidos` (ENTREGUE **ou** INCONFORME **ou**
  AGUARDANDO_AUDITORIA) além de `entregues`, e é `recebidos` que decide "Entrega pendente". **Um
  documento que chegou e espera a IA NÃO faz a admissão parecer "Entrega pendente"**, porque a entrega
  aconteceu. O mesmo vale para o reprovado: o candidato mandou, o problema é outro. Coberto por dois
  testes específicos.

### Prova em dado real (fila de Auditoria, 47 itens, todos liam "Análise pendente" antes)
| Rótulo agora | Quantidade |
|---|---|
| Entrega pendente | **37** |
| Análise em andamento | **10** |

Amostras:
| Rótulo | Tags | Recebidos |
|---|---|---|
| Entrega pendente | [0 aprovados] | 0/6 |
| Análise em andamento | [5 aprovados] [1 reprovados] | 6/6 |
| Análise em andamento | [2 aprovados] | 2/7 |

A primeira e a segunda linha eram **o mesmo texto** antes desta entrega.

### Gate
Backend **357 testes**, frontend **29** (7 novos, todos da regra do rótulo), typecheck dos 3 pacotes.
Backend e frontend reconstruídos e no ar. Lint com os mesmos **2 erros pré-existentes** de
`react-hooks/exhaustive-deps`, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO: Esteira, aba Auditoria. E a decisão sobre o rótulo do `ANALISE_OK`
(Bloco 1). **Sem commit até a validação** (§A.21).

---

## 2026-07-22 (noite, 12): "Análise OK" vira "Análise finalizada" na coluna da Esteira

Decisão do diretor em resposta à pergunta deixada em aberto na entrega anterior. Os TRÊS rótulos da
coluna passam a contar a mesma história: **Entrega pendente · Análise em andamento · Análise
finalizada**. Enum e máquina de estados intactos, como no resto desta frente.

### O que mudou
Na coluna de status da Esteira (aba Auditoria), o estado `ANALISE_OK` deixa de exibir "Análise OK" (o
rótulo do catálogo) e passa a exibir **"Análise finalizada"**.

**Detalhe de implementação que importa:** é **mapeamento DIRETO do estado**, e não a regra derivada do
progresso. A frente já registrou a conclusão, então o rótulo segue o estado, sem recalcular nada. Se
fosse pela regra derivada, uma eventual divergência de dado (frente em ANALISE_OK com algum
obrigatório não aprovado) faria a tela CONTRADIZER a própria frente. Do jeito que ficou, isso não
acontece: `ANALISE_PENDENTE` usa a regra derivada, `ANALISE_OK` usa o rótulo fixo, e
`AGUARDA_REENVIO` e `DECLINOU` seguem com o catálogo.

### Onde "Análise OK" AINDA aparece (levantamento pedido, NADA alterado fora da coluna)
A decisão vale para a coluna de status da Esteira. O rótulo vem da tabela `frente_status_catalogo`,
que é lida por outras superfícies. Estas continuam exibindo "Análise OK":

1. **Seletor de status da própria linha da Esteira.** As opções do `Select` são montadas do catálogo.
   **É a divergência mais visível**: na mesma linha, a coluna dirá "Análise finalizada" e o seletor ao
   lado listará "Análise OK" como opção. Vale decidir junto.
2. **Filtro de status e cards de KPI da Esteira**, montados do mesmo catálogo.
3. **Ficha da admissão (modal do olho)**, bloco de frentes: exibe `f.rotulo` do backend.
4. **Modal de edição do Gerenciador**, mesmo padrão.
5. **Coluna Auditoria do Gerenciador**: exibe o rótulo da frente vindo do backend.

**Recomendação:** se o objetivo é uma leitura só, o caminho barato e consistente é **renomear o
rótulo no catálogo** (`frente_status_catalogo.rotulo` do código `ANALISE_OK`), que é dado de seed e
não enum: mudaria em TODAS as superfícies de uma vez, sem espalhar mapeamento de tela por tela. Aí o
mapeamento fixo que acabou de entrar na coluna vira redundante e pode sair. **Não fiz**, porque a OST
delimitou a decisão à coluna de status da Esteira (§A.14).

### Alcance hoje
`ANALISE_OK` existe em **1.485 frentes de auditoria**, e **ZERO delas em admissão VIVA** (todas são
histórico da carga, em admissões concluídas ou encerradas). Ou seja, na fila de trabalho a mudança
não altera nenhuma linha hoje; ela passa a valer conforme as admissões vivas forem fechando a régua.

### Gate
Frontend **29 testes**, backend **357**, typecheck dos 3 pacotes. Frontend reconstruído e no ar. Lint
com os mesmos **2 erros pré-existentes**, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO e a decisão sobre os outros 5 lugares acima, em especial o seletor
da própria linha. **Sem commit até a validação** (§A.21).

---

## 2026-07-22 (noite, 13): "Análise OK" renomeado no CATÁLOGO para "Análise finalizada"

Decisão do diretor: em vez de mapear rótulo tela por tela, renomear na fonte. Resolve as seis
superfícies de uma vez e mata a divergência do seletor na mesma linha.

### Conferência ANTES de alterar (pedida na OST): nada depende do TEXTO
- **Código:** a única ocorrência da string "Análise OK" no repositório inteiro era **a própria linha
  do seed**. Nenhum `if`, nenhuma comparação, nenhum teste.
- **Trilha de status** (`frente_status_eventos`): guarda `de_status`/`para_status` como **CÓDIGO**
  (varchar 40), não rótulo. Confirmado também que não há nenhum registro com texto de rótulo.
- **Filtros e seletores:** as opções são montadas com `value: c.codigo` e `label: c.rotulo`, ou seja,
  o que trafega e o que fica salvo é o CÓDIGO. Renomear o rótulo não invalida filtro nenhum.
- **Banco:** a única coluna do schema que guarda rótulo é `frente_status_catalogo.rotulo`. Nenhuma
  outra tabela materializa texto de status.
- **Backend:** toda a lógica compara por código (`ANALISE_OK`), incluindo o gate do Cadastro, a
  conclusão automática da auditoria e a ordenação da esteira.

**Conclusão: renomear é seguro, e nada precisou ser reportado como bloqueio.**

### O que foi feito
`frente_status_catalogo`, código `ANALISE_OK`: rótulo **"Análise OK" → "Análise finalizada"**.
Aplicado no **seed** (`db/seed.ts`) e no **banco**. `tipo`, `codigo`, `ordem` e `conclui` intactos; as
outras 9 linhas do catálogo, idênticas.

**Consertei também o motivo de o seed não convergir.** O seed do catálogo era `onConflictDoNothing`,
então corrigir um rótulo ali **não chegava a uma base já semeada** (o próprio código admitia isso num
comentário, e foi o que obrigou a migration `0026` a reorganizar o Cadastro na mão). Passou a
`onConflictDoUpdate` de `rotulo`, `ordem` e `conclui`, com a chave (tipo + código) nunca tocada.
Agora o seed é a fonte de verdade do catálogo e converge qualquer ambiente ao ser rodado. É seguro
porque **o seed é o único escritor desta tabela**: não existe CRUD de status de frente, então não há
edição manual a atropelar.

**Detalhe técnico que quase passou:** no `seed.ts` o identificador `sql` já é o cliente postgres.js
vindo do `createDb`, e ele sombreava o `sql` da drizzle, fazendo `excluded.rotulo` virar uma query
solta em vez de fragmento SQL. O import entrou sob alias.

### O mapeamento fixo da coluna SAIU
O `ANALISE_OK → "Análise finalizada"` que tinha entrado na coluna de status da Esteira na entrega
anterior virou redundante e foi removido, como previsto. A coluna volta a ler o catálogo, e agora
**existe uma fonte só**. O rótulo derivado do progresso continua valendo apenas para
`ANALISE_PENDENTE`; `AGUARDA_REENVIO` e `DECLINOU` seguem com o catálogo.

### Prova
Catálogo servido pela API à tela (o MESMO objeto que alimenta coluna, seletor da linha, filtro e
cards de KPI):
| Código | Rótulo |
|---|---|
| ANALISE_PENDENTE | Análise pendente |
| AGUARDA_REENVIO | Aguardando reenvio dos docs |
| **ANALISE_OK** | **Análise finalizada** |
| DECLINOU | Declinou |

As seis superfícies passam a ler o mesmo texto: coluna de status, seletor da própria linha, filtro,
cards de KPI, ficha da admissão (modal do olho) e modal de edição do Gerenciador, além da coluna
Auditoria do Gerenciador.

### Gate
Backend **357 testes**, frontend **29**, typecheck dos 3 pacotes. Frontend reconstruído e no ar (o
backend não precisou de rebuild: a mudança é dado de catálogo, lido a cada requisição). Lint com os
mesmos **2 erros pré-existentes**, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO. **Sem commit até a validação** (§A.21).

---

## 2026-07-22 (noite, 14): levantamento do FLUXO COMPLETO do documento, do recebimento ao Drive

Diagnóstico (§A.14) pedido antes de desenhar a visualização do documento na tela e os botões
"descartar" e "aprovar". **Nada implementado.**

### 1. Onde o arquivo vive, etapa por etapa
| Etapa | Onde | Quem escreve | Quando | Vida útil |
|---|---|---|---|---|
| Origem | URL pública do Pandapé | ninguém (é deles) | sempre | não expira (§A.5) |
| Trânsito | **memória** (Buffer) | `pandape-sync.puxarDocumentos` | no pull | segundos |
| **Staging** | disco, `STAGING_DIR/{admissaoId}/{CODIGO_TIPO}__{uuid}.{ext}` | `StagingService.salvar`, chamado por `auditarConjunto` | antes de cada chamada de IA | **48h** por TTL, ou expurgo imediato ao fechar a régua |
| Banco | `documentos_admissao` | `auditarConjunto` / validação humana | a cada veredito | permanente, **só estado e motivo** |
| Marca de dedup | `documento_arquivos_coletados` | `pandape-sync` e reauditoria | após auditar | permanente, **só SHA-256 + tamanho** |
| **Drive** | pasta do candidato | `ai-service /drive/arquivar` | ao FECHAR a régua obrigatória | definitivo |

**Não existe armazenamento definitivo do binário no EA.** Entre a staging (48h) e o Drive não há
terceiro lugar: §A.3 regra 7, o documento é efêmero e o banco guarda só status.

**Expurgo da staging:** `StagingPurgeService`, sweep in-process a cada 1h. Diretório de admissão com
mtime acima de **48h** é removido; `_kits` tem TTL de 2h. O relógio é o mtime do arquivo, porque não
há tabela de metadados (§A.6). E, ao arquivar no Drive, `arquivarNoDrive` chama
`staging.removerAdmissao` na hora: o TTL é a rede de segurança de quem nunca fecha a régua.

### 2. O Drive: está LIGADO e já funcionou
- **Não está mockado.** `DRIVE_MOCK=false` no `.env` do ai-service, e `APP_ENV` de produção proíbe
  o mock por fail-fast no boot. Há **1 admissão com URL REAL** de pasta gravada
  (`.../folders/1bcPeVYm...`), e **nenhuma** URL de MOCK no banco. Ou seja: desenhado, ligado e com
  execução real comprovada.
- **Gatilho: fechamento da RÉGUA OBRIGATÓRIA**, não a aprovação de um documento nem a conclusão da
  admissão. Em `auditarConjunto`, quando `progresso.completa` fica verdadeiro, roda `arquivarNoDrive`.
  **Exceção:** o **ASO** sobe assim que é VALIDADO, sem esperar a régua (`arquivarAsoNoDrive`).
- **Estrutura de pastas:** por CANDIDATO, dentro de uma pasta-pai que é por TIPO DE CONTRATO (e, no
  Fopag, por cod_cliente):
  `pasta-pai do contrato` → `"{nome do candidato} — {nome da operação do cliente}"` → subpasta.
  As subpastas são quatro fixas: **ASO · ADMISSAO · BENEFICIOS · DOCUMENTOS_PESSOAIS**. O de/para de
  tipo para subpasta vive em `drive-routing.resolveSubpasta` (default DOCUMENTOS_PESSOAIS).
- **O que sobe:** `arquivarNoDrive` pega **TUDO o que estiver na staging da admissão**, não só o
  aprovado. Um documento reprovado que ainda esteja na staging quando a régua fecha **sobe junto**.
  Isto é relevante para o desenho do "descartar".

### 3. Visualização hoje: NÃO EXISTE para documento de candidato
- **Não há rota** para baixar ou abrir um documento auditado. As únicas rotas que servem binário são
  `/kit/download/:token` (kit da F9) e `/vt/documento` (formulário de VT).
- O `apiOpenInline` que existe no cliente HTTP é usado **só** pela tela `/kit`, para pré-visualizar o
  kit gerado. Não há caminho a partir da aba Auditoria.
- Consequência prática: **hoje o consultor julga um reprovado sem ver o documento.** Ele lê o motivo
  da IA e decide no escuro, ou vai ao Drive, que só tem o arquivo **depois** que a régua fecha, ou
  seja, justamente quando não há mais o que julgar.

### 4. O que "DESCARTAR" significaria, camada por camada
| Camada | O que precisa acontecer | Observação |
|---|---|---|
| Staging | apagar o(s) arquivo(s) daquele tipo | `staging.removerArquivo` já existe e tem guarda de path traversal |
| `documentos_admissao` | voltar o registro para `PENDENTE` e limpar `observacao` | a linha NÃO deve ser apagada: a régua a exige |
| Marca de dedup | **apagar as marcas de (admissão + tipo)** | **é o ponto crítico**: sem isso, o reenvio do MESMO arquivo é pulado por `decidirColeta` (acervo idêntico ao marcado) e o candidato "reenvia" sem efeito |
| Validação humana | limpar `validado_por_id` e `validado_em` | senão a coleta automática continuaria pulando o tipo |
| Drive | **nada, se a régua ainda não fechou** | se já subiu, remover exigiria API de exclusão do Drive, que o EA não usa hoje |
| Trilha | registrar quem descartou e quando | `candidato_alteracoes_log`, mesmo padrão da reauditoria |

**A janela é favorável:** como o Drive só recebe no fechamento da régua, e um documento reprovado
impede o fechamento, na prática **o descarte de um reprovado acontece sempre ANTES de ele subir**. O
caso "já subiu" só existe para o ASO (que sobe ao ser validado).

### 5. O que "APROVAR" significa hoje, e o BURACO encontrado
O botão **Validar por humano** (OST B1) já existe e grava ENTREGUE com autor e data. **Mas ele PARA
antes do resto do fluxo:** `ValidacaoHumanaService.validar` **não chama `autoConcluirAuditoria` nem
`arquivarNoDrive`** (os dois só são chamados de dentro de `auditarConjunto`).

**Consequência real:** se a validação humana for o documento que FECHA a régua, a frente AUDITORIA
**não vai sozinha para "Análise finalizada"** e **os documentos NÃO sobem para o Drive**. A admissão
fica com a régua completa e o fluxo parado, e nada na tela avisa. É um buraco entre a entrega da B1 e
o fluxo do Drive, e vale corrigir junto do desenho desta frente. **Não corrigi**: é diagnóstico.

### 6. Retenção e §A.6: onde o nome do arquivo do Pandapé morre
O nome do arquivo no Pandapé **carrega PII** (já foi visto CPF em nome de arquivo). A trilha dele:
1. **Nunca é lido como identidade.** O de/para usa o nome do FORMULÁRIO, não o do arquivo.
2. **É descartado no download**, dentro do pull: o `originalname` passado adiante é montado como
   `{CODIGO_DO_TIPO}{extensão}`. O nome real **não sai da resposta HTTP**.
3. **Staging:** o arquivo é gravado como `{CODIGO_TIPO}__{uuid}.{ext}`. Sem nome original, sem PII.
4. **Banco:** `documentos_admissao` guarda estado e motivo; `documento_arquivos_coletados` guarda
   digest e tamanho. Nenhum dos dois guarda nome ou URL.
5. **Log:** proibido, e a suíte tem teste que falha se a URL vazar.
6. **Drive, única exceção deliberada:** o nome final é `{Nome do Tipo}_{nome do candidato}` e a pasta
   é `{nome do candidato} — {operação}`. **Aqui o nome da pessoa entra de propósito** (é o prontuário
   dela), mas continua sem o nome original do arquivo e sem CPF.

**Exceção a registrar:** no upload manual de ASO pela aba Exame, a observação gravada é
`"ASO anexado: {nome do arquivo} ({bytes})"`, ou seja, **o nome do arquivo escolhido pelo consultor
vai para o banco**. É arquivo local dele, não do Pandapé, mas é a única porta por onde nome de
arquivo entra em `documentos_admissao`. Vale decidir se fica.

### Recomendação de onde encaixar visualização e descarte
1. **Visualizar: servir da STAGING, não do Drive.** É onde o arquivo está exatamente na janela em que
   o consultor precisa julgar (documento reprovado, régua ainda aberta). Rota autenticada por
   admissão + tipo, devolvendo inline, no mesmo padrão do `/kit/download` (que já resolve o "abrir em
   aba" com o `apiOpenInline`). §A.6: a rota não pode aceitar caminho do cliente, só (admissão, tipo),
   e resolver o caminho no servidor.
2. **Limite honesto a declarar na tela:** passadas 48h sem fechar a régua, o arquivo **não existe
   mais** na staging. A visualização precisa dizer "documento não está mais disponível para
   visualização" em vez de dar erro, e o caminho de recuperação é o mesmo da reauditoria (rebaixar do
   Pandapé quando a admissão veio de lá).
3. **Descartar: uma operação só, no mesmo lugar do Reauditar e do Validar**, cobrindo as seis camadas
   da tabela do item 4, com destaque para **apagar a marca de dedup** (sem isso o reenvio não
   funciona) e **limpar a validação humana**.
4. **Aprovar: fechar o buraco do item 5 primeiro.** Antes de acrescentar botão novo, a validação
   humana precisa disparar a conclusão da frente e o arquivamento no Drive, senão "aprovar" continua
   parando no meio do caminho.

## 2026-07-23: OST caixa alta nos nomes + observações livres na liberação, aguardando validação

Três blocos entregues, testes verdes, migração aplicada e build de produção no ar. Falta a validação
do diretor em produção. §A.11 respeitada: nenhum travessão em texto de tela.

### BLOCO 1, nomes em CAIXA ALTA (só exibição)

Helper novo `caixaAlta()` em `apps/frontend/src/lib/nome.ts`, com teste próprio
(`nome.spec.ts`, 4 casos). Usa `toLocaleUpperCase("pt-BR")` e não `toUpperCase()`, porque a caixa do
acento em português tem regra própria. Entrada vazia devolve string vazia, para o chamador manter o
seu "não informado" (§A.11).

**É transformação de tela, e só.** Nenhuma rotina de gravação foi tocada, nenhum dado do banco foi
alterado, nenhuma normalização entrou no caminho de escrita. Por isso vale de graça para os nomes
que já existem e para os que ainda vão chegar do Pandapé: quem transforma é a tela, na hora de
pintar.

**Varredura, onde foi aplicado (17 pontos, 9 arquivos):**

| Superfície | Arquivo | Onde |
|---|---|---|
| Esteira, as 3 abas | `app/(app)/esteira/page.tsx` | célula da coluna Nome + `title` do hover; título do modal de declínio; mensagem "Admissão de X declinada" |
| Gerenciador | `app/(app)/gerenciador/page.tsx` | célula da coluna Nome + `title`; flash de exclusão; texto do ConfirmDialog de exclusão |
| Liberação, tabela Aguardando | `app/(app)/liberacao/page.tsx` | célula Candidato |
| Liberação, tabela Recusadas | `app/(app)/liberacao/page.tsx` | célula Candidato |
| Liberação, modais e mensagens | `app/(app)/liberacao/page.tsx` | título do modal individual; título do modal da recusada; lista de duplicatas bloqueadas no lote; listas de liberadas e de falhas no relatório do lote; mensagens de liberado, recusado e reativado |
| Modal do olho | `components/esteira/AdmissaoDetalheModal.tsx` | cabeçalho + campo "Nome" do bloco Dados pessoais |
| Modal de Auditar | `components/esteira/AuditoriaDocsModal.tsx` | cabeçalho |
| Modal de edição (lápis) | `components/gerenciador/EditAdmissaoModal.tsx` | cabeçalho + mensagem "Admissão de X atualizada" |
| Modal de pendências | `components/gerenciador/PendenciasModal.tsx` | subtítulo |
| Modal de agendamento do exame | `components/esteira/AgendamentoExameModal.tsx` | subtítulo |

**Três exceções deliberadas, registradas:**
1. **O input de nome do modal de edição NÃO sobe para caixa alta.** É campo editável: exibir em
   caixa alta ali faria o consultor salvar o nome em caixa alta de volta no banco, e a OST é
   explícita em não alterar o dado. O cabeçalho do mesmo modal (leitura) sobe normalmente.
2. **`aria-label` continua com o nome original.** É texto de leitor de tela, não texto de tela;
   caixa alta ali faz alguns leitores soletrarem letra a letra.
3. **Textos de estado ("Carregando…", "não informado") não passam pelo helper.** Não são nome.

### BLOCO 1, checagem de corte (§A.20): medida, não estimada

Sem browser nesta VM (o Chromium do Playwright não sobe, falta `libatk-1.0.so.0` no sistema), a
checagem foi feita com as **métricas reais da fonte Inter servida pelo build de produção**
(`.next/static/media/19cfc7226ec3afaa-s.woff2`, lida com fontkit), no tamanho real da coluna
(`.row .nm`, 14px), sobre os **2.297 nomes reais da base**.

**O achado que decide a questão: 2.234 dos 2.297 nomes (97,3%) JÁ estão em caixa alta no banco**,
vindos da carga histórica, e entre eles estão TODOS os mais longos. Ou seja, o pior caso da coluna
já é renderizado hoje, antes desta OST.

| Medida | Antes | Depois |
|---|---|---|
| Largura máxima da coluna Nome | 394,9px ("MARIA FERNANDA MARINS CARDOSO SILVA DOS SANTOS") | 394,9px, o mesmo nome |
| Delta do pior caso | 0px | |
| Nomes que mudam de aparência | 63 | |
| Delta desses 63 | médio 1,5px, máximo 3,3px | |
| Truncam no piso da Esteira (170px) | 2.016 | 2.017 |
| Truncam no piso do Gerenciador (232px) | 834 | 834 |

**Um único nome passa a truncar que antes não truncava**, e só no piso mínimo da coluna:
"Ana Luiza De Santana", 168,5px, vira "ANA LUIZA DE SANTANA", 170,8px, contra um piso de 170px.
Estoura por **0,8px**, e só quando a janela é estreita o bastante para a coluna estar no mínimo (a
partir daí o container já rola na horizontal, §A.12). O truncamento com reticências que já existe
continua valendo, com o nome inteiro no `title` do hover, exatamente como antes.

*Ressalva honesta da medição: a Inter do build é variável e o fontkit desta versão perde a `cmap` ao
instanciar em `wght=600`, então os números acima foram medidos no peso default (400). O peso 600
real é um pouco mais largo em termos absolutos, mas a comparação antes/depois é feita na MESMA
fonte, então o delta (0px no pior caso) não muda.*

### BLOCO 2, observação livre na liberação

**Onde é persistido:** coluna nova `admissoes.observacao_liberacao` (`text`, nullable), migração
`0035_purple_rachel_grey.sql`, puramente aditiva (`ADD COLUMN`), já aplicada em produção.

**Limite de caracteres: 500.** Vive em `admissoes/dto/observacao-liberacao.ts`
(`OBSERVACAO_LIBERACAO_MAX`), usado pelos DOIS DTOs (individual e lote); o front espelha o mesmo
número no `maxLength` do textarea e mostra o contador "N de 500 caracteres". Quem valida de verdade
é o backend.

**Disponível nos dois modais**, com o mesmo campo e o mesmo texto de ajuda:
- **Individual:** grava a observação naquela admissão.
- **Em massa:** a observação preenchida é gravada em TODAS as N selecionadas, no mesmo padrão dos
  demais campos do lote. O miolo é o mesmo (`aplicarLiberacao`), então individual e lote não podem
  divergir por construção.

**Opcional de verdade:** não bloqueia a liberação, não entra na régua de pendências obrigatórias
(§A.19) e não mexe no sinalizador. Texto em branco (ou só espaços) é gravado como `null`, para o
modal do olho não abrir um bloco vazio.

### BLOCO 3, exibir a observação depois da liberação

Aparece no **modal do olho**, em bloco próprio "Observação da liberação", **antes de todos os demais
blocos**, com destaque em âmbar. Ficou no topo de propósito: é informação de contexto que muda a
leitura do resto da ficha, e escondê-la no fim é o mesmo que não ter. Vazia, o bloco **não existe**
(não ocupa espaço). Quebras de linha do consultor são preservadas (`whitespace-pre-wrap`).

**Colisão de nome, como foi separada.** O campo já existente `documentos_admissao.observacao` é o
**motivo do veredito da auditoria, por documento**, escrito pela IA ou pela validação humana a cada
veredito. O campo novo é o **recado do consultor no ato da liberação**, escrito uma vez. São
tabelas, donos e ciclos de vida diferentes. A separação é pelo NOME: o novo se chama
`observacaoLiberacao` / `observacao_liberacao` em todas as camadas (coluna, DTO, retorno do
`esteira.detalhe`, tipo do front), enquanto o de documento continua `observacao` dentro de
`documentos[]`. O mesmo endpoint devolve os dois lado a lado, sem ambiguidade, e há comentário
explícito nos dois pontos do código.

### §A.6

A observação é texto livre digitado pelo consultor e **pode conter dado pessoal**. Vale a mesma
regra do restante do detalhe da esteira: exibida na leitura da ficha, **nunca logada** no servidor.
Nenhum log novo foi criado. A caixa alta não toca em PII nova (o nome já era exibido).

### Gate

- **Backend:** typecheck limpo, 360 testes verdes (3 novos, em `admissoes.liberar-lote.spec.ts`:
  observação gravada nas N, texto em branco vira `null`, observação não maquia o sinalizador).
- **Frontend:** typecheck limpo, 33 testes verdes (4 novos, `nome.spec.ts`).
- **Lint:** 2 erros PRÉ-EXISTENTES (`react-hooks/exhaustive-deps` não resolvida) em `nova/page.tsx`
  e `vt/page.tsx`, arquivos que esta OST não tocou. Nada novo introduzido.
- **Produção:** migração aplicada, backend e frontend rebuildados e reiniciados
  (`ea-backend`/`ea-frontend` ativos, `/api/health` 200 direto e pelo proxy do Next).

### Provas textuais colhidas (sem print, como pedido)

1. Coluna criada: `observacao_liberacao | text | YES` em `information_schema.columns`.
2. Teto de 500 validado na API real: 501 caracteres devolvem
   `400 "A observação da liberação tem no máximo 500 caracteres."`; 500 caracteres passam a
   validação e caem no `404` esperado (admissão inexistente, nada foi gravado).
3. Ida e volta do Bloco 3: gravado "VT possui 6% de desconto" numa admissão, o endpoint do modal do
   olho (`GET /esteira/admissao/:id`) devolveu `observacaoLiberacao: "VT possui 6% de desconto"`, e
   o valor foi **restaurado para `null`** em seguida. Base inteira segue com 0 linhas preenchidas.
4. Coexistência dos dois campos no mesmo retorno: `observacaoLiberacao` (admissão) e
   `documentos[].observacao` (veredito do documento), ambos presentes e independentes.

### Fora do escopo, encontrado e NÃO tocado (§A.14)

A varredura achou nome de candidato em quatro superfícies que **não constam da lista da OST**.
Nenhuma foi alterada; ficam aguardando a palavra do diretor:
- **Não Conformidades** (`/nao-conformidades`): coluna da tabela, cabeçalho do painel lateral, texto
  do modal de registro e duas mensagens de confirmação.
- **Kit antigo** (`/kit`): lista de seleção de candidato, linha de resumo e histórico. *(Tela fora
  do menu por §A.15, mas o código continua acessível.)*
- **Nova Admissão** (`/nova`): alerta de CPF já existente ("Fulano · N admissões anteriores").
- **Admin de Clientes** (`/admin/clientes`): lista de admissões vinculadas ao tentar excluir um
  cliente.

## 2026-07-23 (2): OST visualização, descarte e fechamento do fluxo de aprovação, aguardando validação

Quatro blocos entregues na ordem obrigatória (o Bloco 1 primeiro), testes verdes e build de produção
no ar. Falta a validação do diretor em produção. §A.11 respeitada.

### BLOCO 1, o buraco da validação humana FECHADO

**O que existia.** `ValidacaoHumanaService.validar` gravava ENTREGUE com autor e data e parava ali.
`autoConcluirAuditoria` e `arquivarNoDrive` só eram chamados de dentro do `auditarConjunto`, ou seja,
só quando quem dava o veredito era a IA. Validação humana que FECHAVA a régua deixava a frente
AUDITORIA fora de "Análise finalizada" e os documentos fora do Drive, sem aviso na tela.

**O que foi feito.** Os quatro passos pós-veredito (sinalizador, progresso, conclusão automática da
frente, arquivamento no Drive) saíram de dentro do `auditarConjunto` e viraram
`AuditoriaService.aplicarPosVeredito`. **Não há código duplicado:** os dois caminhos chamam o MESMO
método. O `auditarConjunto` passou de quatro blocos inline para uma chamada; a validação humana
passou a chamar a mesma coisa.

Detalhe de implementação registrado: `aplicarPosVeredito` **recarrega a admissão** de propósito, em
vez de receber a que o chamador já tinha. O ASO arquiva ANTES da régua fechar, então quem decide o
arquivamento tem de olhar o valor corrente do Drive, não uma cópia de dois passos atrás.

**Guarda de pré-admissão:** admissão sem cliente e cargo (AGUARDANDO_LIBERACAO) não tem régua e
nunca é auditada. `aplicarPosVeredito` recusa esse caso com 404, então a validação humana testa antes
e simplesmente pula o pós-veredito, em vez de virar erro.

**A REAUDITORIA foi verificada e NÃO tem o mesmo buraco.** `ReauditoriaService.reauditar` chama
`auditoria.auditarConjunto` diretamente (linha 113), então sempre passou pelo pós-veredito completo.
O buraco era exclusivo da validação humana, que era o único caminho que escrevia em
`documentos_admissao` sem passar pelo `auditarConjunto`.

**Teste de regressão** (`validacao-humana-fecha-regua.spec.ts`, 5 casos): monta o serviço REAL de
validação humana sobre o serviço REAL de auditoria, com banco, staging, IA e régua falsos. Trava
(a) frente concluída com evento de transição, (b) Drive chamado e URL real gravada, (c) staging
expurgada, (d) gate do Cadastro abrindo e a frente CADASTRO_CONTRATO nascendo, (e) régua incompleta
não concluindo nada, (f) o pós-veredito sendo delegado ao ponto comum em vez de reimplementado.

### BLOCO 2, visualizar o documento (servindo da STAGING)

Duas rotas novas, as duas autenticadas, no `ReauditoriaController`:
- `GET /esteira/auditoria/:admissaoId/documento/:tipoDocumentoId/arquivos`, o que dá para ver;
- `GET /esteira/auditoria/:admissaoId/documento/:tipoDocumentoId/arquivo/:indice`, o binário inline,
  no mesmo padrão do `/kit/download` que a tela já abre em aba nova pelo `apiOpenInline`.

**§A.6, requisito duro atendido em quatro camadas:**
1. a rota recebe **(admissão, tipo, ÍNDICE)**, nunca caminho;
2. o índice vira caminho **no servidor**, sobre a listagem da staging ordenada de forma
   determinística (`ordenarParaVisualizacao`), porque `readdir` não garante ordem e sem ordem estável
   o índice apontaria para arquivos diferentes entre a listagem e o clique;
3. a guarda de path traversal do `StagingService` é **reafirmada** antes de abrir o descritor, mesmo
   com o caminho tendo nascido no servidor;
4. a resposta **não carrega caminho nem nome de arquivo original**. O rótulo exibido é montado do
   nome do TIPO ("CTPS (2 de 4)"), e o `Content-Disposition` também.

Extras de segurança: allowlist de mime (pdf, jpg, png; qualquer outra extensão não é oferecida nem
servida, para nada sair como octet-stream) e `Cache-Control: no-store, private`.

**Múltiplos arquivos:** o veredito é do CONJUNTO, então a tela oferece o conjunto. Um arquivo abre
direto no clique; dois ou mais viram uma lista de botões na linha ("CTPS (1 de 4)" … "(4 de 4)").

**Indisponível é ESTADO, não erro** (decisão do diretor). Sem arquivo na staging (TTL de 48h vencido,
ou régua fechada e staging expurgada), a listagem responde **200** com `disponivel: false` e a
mensagem "Documento não está mais disponível para visualização. Verifique no Pandapé.". Não oferece
rebaixar do Pandapé e não dispara coleta nenhuma.

### BLOCO 3, descartar documento (seis camadas, uma operação)

`POST /esteira/auditoria/:admissaoId/descartar`, botão por documento ao lado de Reauditar e Validar,
com confirmação antes (o texto diz que o candidato precisará reenviar e que o MESMO arquivo volta a
ser aceito).

| Camada | O que faz |
|---|---|
| 1. Staging | apaga os arquivos daquele tipo |
| 2. `documentos_admissao` | volta para PENDENTE e limpa a observação. **A linha NÃO é apagada**, a régua a exige |
| 3. Marca de dedup | apaga as marcas de (admissão + tipo). **O ponto crítico** |
| 4. Validação humana | limpa `validado_por_id` e `validado_em` |
| 5. Drive | nada no caso normal; **reporta** quando já havia subido |
| 6. Trilha | `candidato_alteracoes_log`, campo `descarte-documento:{CÓDIGO}` |

**Ordem e atomicidade, decidido e registrado.** As quatro camadas de banco (2, 3, 4 e 6) vão numa
ÚNICA transação, então não sobra meio estado. A staging é sistema de arquivos e não entra em
transação: roda **depois** do commit, de propósito. O critério foi qual metade é pior de perder. Com
o banco commitado, o documento já voltou a ser cobrável e recoletável mesmo que um arquivo resista no
disco (onde o TTL de 48h o pega). Na ordem inversa, uma falha do banco deixaria o arquivo apagado com
a marca de dedup de pé, que é exatamente o estado que trava o reenvio. Remoção de arquivo é
idempotente: repetir o descarte converge.

**Limite honesto da camada 5.** O EA não usa API de exclusão do Drive. Quando o documento descartado
já havia sido arquivado (só acontece com o ASO, que sobe ao ser validado sem esperar a régua), a tela
mostra um aviso âmbar dizendo que o arquivo NÃO foi removido de lá, em vez de fingir que saiu. Link
de MOCK não conta como arquivado (aponta para pasta inexistente).

### BLOCO 4, a exceção §A.6 do ASO limpa

`ASO anexado: {nome do arquivo} ({bytes})` virou **`ASO anexado ({bytes})`**. Era a única porta por
onde nome de arquivo entrava em `documentos_admissao`, e nome escolhido por quem envia carrega PII na
prática. O tamanho fica: serve para conferir que o upload subiu inteiro e não identifica ninguém. O
nome do arquivo continua chegando à I.A (a staging precisa da extensão) e ao retorno HTTP de quem
acabou de enviar, mas **não é persistido**.

O nome no **DRIVE não mudou**: segue `{Nome do Tipo}_{nome do candidato}`, confirmado pelo diretor.

**Registros antigos: ZERO.** Varredura na base inteira,
`select count(*) from documentos_admissao where observacao like 'ASO anexado%'` devolveu **0**. Não há
passivo a limpar, então não há decisão retroativa a pedir.

### BLOCO 5, provas colhidas em produção (textuais, sem print)

**Bloco 1**, admissão de TESTE isolada (candidato sintético, criada e removida ao fim):

| | Antes | Depois da validação humana |
|---|---|---|
| Frente AUDITORIA | `ANALISE_PENDENTE`, concluida=f | **`ANALISE_OK`, concluida=t**, data 02:13:34 |
| Frente CADASTRO_CONTRATO | não existia | **nasceu** (`A_CADASTRAR`), gate aberto |
| Farol | `EM_ADMISSAO` | **`BANCO_AGUARDAR`** (auditoria OK + exame apto + sem data) |
| Evento de transição | nenhum | `AUDITORIA: ANALISE_PENDENTE → ANALISE_OK` |

A resposta da API trouxe `auditoriaAuto: { status: "ANALISE_OK", gateAberto: true }` e
`progresso.completa: true`. O log prova que o caminho do Drive **foi alcançado a partir da validação
humana**: `WARN [AuditoriaService] Arquivamento ignorado: sem pasta-pai do Drive...`, mensagem que só
existe dentro do `arquivarNoDrive`. Antes desta OST, essa linha era impossível de aparecer vindo de
uma validação humana.

*Ressalva declarada, e é a única pendência de prova desta OST:* a admissão de teste foi criada com um
tipo de contrato deliberadamente **sem pasta-pai mapeada**, então o upload real não aconteceu e não
há URL real de pasta para mostrar. Foi decisão consciente: arquivar de verdade criaria uma pasta de
teste dentro da árvore REAL do Drive da empresa, e o EA não consegue removê-la depois (é justamente o
limite da camada 5 do Bloco 3). O trecho do upload está coberto pelo teste de regressão, que verifica
`arquivarDrive` chamado uma vez, `drivePastaUrl` gravada com a URL real e staging expurgada.

**Bloco 2**, sobre documento REAL de produção (leitura pura, nada alterado). Documento reprovado com
CONJUNTO de 4 arquivos (CTPS INCONFORME):
- listagem devolveu os 4 com rótulos "Carteira de Trabalho (CTPS) (1 de 4)" a "(4 de 4)";
- os 4 abriram inline, com `Content-Type` correto e conteúdo real conferido pelos magic bytes
  (`25504446` = `%PDF` nos dois PDFs, `ffd8ffe0` = JPEG nos dois JPGs), 149KB a 197KB cada;
- `Content-Disposition: inline`, `Cache-Control: no-store, private`.

Indisponível, em admissão com régua fechada e staging expurgada: listagem **200** com
`{"disponivel":false,"mensagem":"Documento não está mais disponível para visualização. Verifique no
Pandapé.","arquivos":[]}`; pedir o binário devolve **404** com a MESMA mensagem, sem vazar nada.

§A.6 exercitada contra a rota:

| Tentativa | Resultado |
|---|---|
| path traversal no lugar do índice (`/arquivo/../../../../etc/passwd`) | **404** |
| caminho codificado como índice (`/arquivo/%2Fetc%2Fpasswd`) | **400**, "numeric string is expected" |
| caminho na query (`?caminho=/etc/passwd&path=...`) | **200** servindo o arquivo legítimo: a query é ignorada, não existe parâmetro de caminho |
| sem token | **401** |

Log da visualização conferido: `Visualização de documento: tipo=CTPS, arquivo=1.` Sem caminho, sem
nome de arquivo, sem CPF.

**Bloco 3**, seis camadas provadas na admissão de teste:

| Camada | Antes | Depois |
|---|---|---|
| 1. Staging | 2 arquivos | **0** (`arquivosRemovidos: 2`) |
| 2. Documento | `INCONFORME` + observação | **`PENDENTE`** + observação `<null>`; **linha ainda existe** (count=1) |
| 3. Marcas de dedup | 2 | **0** |
| 4. Validação humana | validador e data preenchidos | **`validado_por_id` NULO, `validado_em` NULO** |
| 5. Drive | nada arquivado | `driveJaArquivado: false`, nada a reportar |
| 6. Trilha | 0 linhas | `descarte-documento:RG \| INCONFORME → PENDENTE \| Harness Visual (QA) \| 02:11:27` |

E a visualização daquele documento passou a responder `disponivel: false`, coerente.

**O ponto crítico da dedup, provado com a função REAL do pull** (`decidirColeta`, a mesma que o worker
roda), contra o estado real do banco, com o MESMO acervo no Pandapé nos dois momentos:

| | Estado | Marcas | Anexos no Pandapé | `decidirColeta()` |
|---|---|---|---|---|
| Antes do descarte | `ENTREGUE` | 2 | 2 | **`PULAR_SEM_BAIXAR`** |
| Depois do descarte | `PENDENTE` | 0 | 2 | **`BAIXAR`** |

É exatamente o que o diagnóstico apontou: sem limpar a marca, o candidato reenviaria o mesmo arquivo
e nada aconteceria.

**Bloco 4:** observação nova coberta por teste com um nome de arquivo deliberadamente cheio de PII
(`ASO_MARIA_DA_SILVA_CPF_52998224725.pdf`); o gravado é `ASO anexado (91234 bytes)`, sem o nome, sem
`.pdf` e sem nenhuma sequência de 11 dígitos. Varredura da base: **0** registros antigos.

**Limpeza:** a admissão de teste, o candidato sintético, documentos, frentes, eventos, trilha, marcas
de dedup e a staging foram removidos ao fim das provas; a conferência devolveu `0|0|0|0|0`. Nenhum
arquivo de prova ficou no repositório.

### Gate

- **Backend:** typecheck limpo, **385 testes verdes** (25 novos: 5 do Bloco 1, 13 do Bloco 2 e 3,
  5 das regras puras de visualização, 2 do Bloco 4).
- **Frontend:** typecheck limpo, 33 testes verdes.
- **Lint:** os mesmos 2 erros PRÉ-EXISTENTES (`react-hooks/exhaustive-deps` não resolvida) em
  `nova/page.tsx` e `vt/page.tsx`, arquivos que esta OST não tocou.
- **Produção:** backend e frontend rebuildados e reiniciados, `/api/health` 200 e frontend 200. Sem
  migração nesta OST (nenhuma coluna nova).

---

## 23/07/2026, dois pontos na tela de Auditoria: documento preso em AGUARDANDO_AUDITORIA (diagnóstico) e layout da linha (correção)

### BLOCO 1, DIAGNÓSTICO: por que um documento ficou preso em `AGUARDANDO_AUDITORIA`

**Não implementado nada neste bloco.** O diretor pediu investigação, e é o que segue. Só leitura:
`journalctl` do `ea-backend`, consulta ao banco e inspeção da staging.

**1. Qual foi a falha.** Não foi quota, não foi credencial, não foi indisponibilidade. Foi **HTTP 415,
formato de arquivo não suportado**, a família "entrada" da classificação. O log é textual e direto:

```
21:36:56  ERROR [AiClientService]     ai-service /auditoria/documento respondeu HTTP 415
21:36:56  WARN  [PandapeSyncService]  Documento coletado do Pandapé mas auditoria falhou
                                      (fica AGUARDANDO_AUDITORIA, nada perdido):
                                      Motor de IA indisponível (HTTP 415)
```

A causa raiz está na staging, que ainda não venceu o TTL de 48h: o "documento" tem **91 bytes** e é
**texto puro UTF-8**. O candidato **digitou os dados da conta como resposta de texto** no formulário
do Pandapé, em vez de anexar um comprovante. O Pandapé serviu essa resposta pelo mesmo endpoint de
anexo, e o EA baixou um arquivo que não é PDF, não é JPEG e não é PNG, nem pela extensão nem pelos
magic bytes. `resolverExtensaoDocumento` devolveu `null`, a staging gravou sem extensão,
`resolver_mime` do ai-service também não reconheceu e o router devolveu o **415 controlado** (o
mesmo que foi criado de propósito para não mandar `octet-stream` ao Vertex e virar 500 silencioso).

Ou seja: **o mecanismo funcionou como desenhado**. Ninguém mandou lixo para a IA, a coleta não se
perdeu, e o documento ficou marcado como coletado sem veredito. O defeito não é a parada, é o que
vem depois dela.

**Dois defeitos reais que este caso expôs:**

- **O motivo exibido MENTE.** O `catch` do `auditarConjunto` só reescreve a observação quando a
  exceção é `MotorIaSemQuotaException` (429). Para qualquer outra família, incluindo este 415, a
  observação permanece a inicial, *"Documento coletado, aguardando a análise por IA."*, como se o
  documento estivesse numa fila que não existe. O consultor lê "aguardando" e espera. Não há fila,
  não há espera, houve falha.
- **415 é classificado como "Motor de IA indisponível".** Não está indisponível: ele respondeu, e
  respondeu que o **arquivo** é que não serve. É defeito de ENTRADA, e a mensagem correta seria
  acionável para o consultor (pedir reenvio do comprovante como imagem ou PDF).

**2. Há quanto tempo, e quantos há.** Preso desde **22/07/2026 21:36:55 UTC**, portanto **~14h** no
momento da apuração. Contagem em toda a base:

| Estado | Documentos |
|---|---|
| ENTREGUE | 10.539 |
| PENDENTE | 5.692 |
| INCONFORME | 82 |
| **AGUARDANDO_AUDITORIA** | **1** |

É **1 ocorrência**, a que o diretor viu. A medição anterior de zero estava certa; este caso nasceu
no pull do dia 22.

**3. Ele NÃO sai sozinho. Confirmado por leitura de código, não por suposição.**

- **Não existe retentativa agendada.** Os únicos temporizadores do backend são `ExpurgoService` (TTL
  do CPF de substituição) e `StagingPurgeService` (expurgo da staging). O crontab do usuário está
  vazio, e o cron-pull do Pandapé segue DEPRECADO/inerte (§A.5). **Nada varre `AGUARDANDO_AUDITORIA`.**
- **O pull re-tenta, mas só quando alguém dispara um pull**, na liberação ou por evento do webhook
  daquela admissão. E quando re-tenta, **falha de novo**: `registrarArquivosColetados` só roda depois
  da auditoria concluir, então o hash não foi marcado, o `precisaAuditarConjunto` manda auditar de
  novo, e o mesmo arquivo de 91 bytes produz o mesmo 415. Retentativa infinita que nunca converge.
- **"Reauditar" também não resolve.** A reauditoria busca os arquivos primeiro na staging (onde o
  arquivo ainda está) e, vencido o TTL, no Pandapé (onde ele continua igual). Nos dois caminhos chega
  o mesmo texto de 91 bytes ao mesmo `resolver_mime`, e o resultado é o mesmo 415. O consultor vai
  clicar, ver um erro, e o estado não muda.

**Conclusão do item 3: é exatamente o risco residual que a fábrica declarou.** O documento não some
da régua (aparece como "que falta"), mas ninguém é avisado de que ele está preso, o motivo que a tela
exibe está errado, e nenhuma das duas saídas disponíveis funciona neste caso.

**4. Tratamento recomendado (a decidir pelo diretor, NÃO implementado).** Em ordem de prioridade:

1. **Motivo verdadeiro para toda falha, não só para quota (correção mínima e a mais barata).**
   Generalizar o `catch` do `auditarConjunto`: qualquer falha da IA reescreve a observação com o que
   de fato houve. Para o 415, texto acionável do tipo *"O arquivo recebido não é um documento
   (PDF, JPG ou PNG). Peça o reenvio do comprovante."*, que resolve o caso sozinho: o consultor lê e
   age. Hoje ele lê "aguardando" e não age.
2. **Reclassificar 415 como defeito de ENTRADA, e não como "motor indisponível".** O ai-service já
   separa as famílias (422 entrada, 429 quota, 503 credencial/indisponibilidade); falta o 415 entrar
   nessa mesma régua no `AiClientService`, com exceção própria, em vez de cair no balde genérico.
3. **Marcador de tempo parado.** Documento em `AGUARDANDO_AUDITORIA` há mais de X horas (sugestão: 6)
   ganha destaque na régua e entra na contagem de pendências da tela, para não depender de alguém
   reparar. Sem isso, o único aviso é alguém abrir a admissão certa por acaso, que foi o que ocorreu.
4. **Retentativa automática, com teto.** Vale para falha TRANSITÓRIA (quota esgotada, ai-service
   fora), onde repetir converge. **Não** resolve este caso: 415 é determinístico, repetir mil vezes
   dá 415 mil vezes. Recomendação: retentativa só para as famílias transitórias, com número máximo de
   tentativas, e para as famílias determinísticas (415/422) o caminho é o item 1, dizer a verdade e
   pedir reenvio.
5. **Decisão de produto pendente para o diretor:** resposta de TEXTO no formulário do Pandapé é um
   caso legítimo do acervo real, não um acidente. O EA hoje só sabe auditar PDF/JPEG/PNG. Vale
   decidir se texto vira INCONFORME determinístico com motivo próprio (barato, coerente com o PDF
   protegido) ou se passa a ser lido como conteúdo pela IA (mais caro, e abre porta para lixo).

*§A.6 respeitado no diagnóstico inteiro: o conteúdo do arquivo NÃO foi transcrito aqui nem em lugar
nenhum, e nenhum nome, CPF ou URL entrou neste registro. O que se apurou foi tamanho, codificação e
ausência de magic bytes, que são propriedades de formato, não dado pessoal.*

### BLOCO 2, CORREÇÃO: a linha do documento renderizando o nome na vertical

**O defeito.** `Comprovante de Conta Bancária` saiu **uma letra por linha**. A linha era
`flex ... justify-between` com a coluna do nome em `min-w-0` (encolhe sem piso) e a barra de botões
em `flex-none` (não cede nada). Com **cinco** botões, a barra tomou toda a largura e o nome recebeu o
resto, que era perto de zero. O `break-words`, que existia para quebrar rótulo longo em duas linhas,
passou a quebrar caractere a caractere.

**Este é o segundo episódio.** O primeiro foi `"Comprovant..."` truncado, e a correção de então foi
**alargar o modal** para `max-w-4xl`. Aquele cálculo foi feito com **três** botões; entraram
Visualizar e Descartar depois e ele venceu. **Alargar de novo repetiria o erro**: a largura do modal
não é uma regra, é um saldo que qualquer botão novo consome.

**O que foi feito, e por quê.** Três mudanças, todas em
`apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx`:

1. **Piso de largura para o nome, quem não cede é ele.** A coluna do nome trocou `min-w-0` por
   `min-w-[200px] flex-1 basis-[240px]`. Tem um piso que o flex não pode violar e continua
   aproveitando toda a sobra quando ela existe (§A.20).
2. **Barra de ações que QUEBRA em vez de espremer.** Saiu o `flex-none` do container dos botões,
   entrou `flex-wrap` com `justify-end`. Quando os botões não cabem, eles **descem para uma segunda
   fila dentro da própria linha**. Os botões com rótulo ganharam `flex-none` e `whitespace-nowrap`,
   pelo mesmo motivo: sem isso o texto DELES quebraria letra a letra, que é o defeito que se está
   corrigindo. **Esta é a regra permanente da linha**: um sexto botão desce de fila, não espreme o
   nome.
3. **Orçamento de largura reduzido: três botões viraram ícone com tooltip.** Escolha declarada, entre
   as quatro opções que o diretor listou:

| Opção | Decisão | Por quê |
|---|---|---|
| Alargar mais o modal | **Não** | Foi o que já falhou uma vez. Compra saldo, não resolve. O próximo botão quebra de novo. |
| Quebrar para segunda linha | **Sim, adotado como rede** | Vira o comportamento automático quando falta espaço, inclusive em tela estreita. Não é o estado normal na largura cheia. |
| Agrupar num menu | **Não** | Esconde ação de uso diário atrás de um clique extra. São cinco botões, não doze. |
| Reduzir a ícone com tooltip | **Sim, os três inequívocos** | Corta o custo de largura pela metade sem esconder nada. |

Ficaram **com texto** os dois que decidem alguma coisa: `Auditar documento` / `Enviar novo arquivo`
(o rótulo carrega estado) e `Validar` (assume responsabilidade humana pelo documento). Viraram
**ícone quadrado de 38px** os três de símbolo inequívoco: **Reauditar** (seta circular de refazer),
**Visualizar** (olho) e **Descartar** (lixeira). Os três mantêm `title` (tooltip com o texto
completo) e ganharam `aria-label`, então o rótulo continua disponível no mouse e no leitor de tela.
Descartar continua pedindo confirmação explícita antes de agir, então nada destrutivo ficou a um
clique cego.

**Telas menores.** A barra de ações recebeu `basis-full sm:basis-auto`: abaixo de 640px ela ocupa uma
**linha própria** sob o nome, em vez de disputar largura lado a lado. Acima disso volta a ficar na
mesma linha. Com o piso de 200px do nome mais o `flex-wrap`, não há largura em que o nome colapse.

**Orçamento resultante na largura cheia** (modal `max-w-4xl`, 896px): descontadas as bordas e o
`p-3` da linha, sobram cerca de 824px. Pill de estado mais o botão com rótulo mais os três ícones
mais os intervalos custam cerca de 460px, e o nome fica com cerca de 360px, contra os poucos pixels
que tinha antes. Os rótulos mais longos do catálogo cabem em uma ou duas linhas.

**Escopo (§A.14):** mexeu-se só na linha de documento do modal de auditoria. Nenhum comportamento,
rota, rótulo de menu ou outra tela foi tocado. Nenhuma string de UI nova tem travessão (§A.11).

### Gate

- **Frontend:** typecheck limpo, **33 testes verdes**.
- **Backend:** **385 testes verdes** (nada mudou no backend nesta entrega; rodado para provar que a
  investigação do Bloco 1 não deixou resíduo).
- **Lint:** os mesmos **2 erros PRÉ-EXISTENTES** (`react-hooks/exhaustive-deps` não resolvida) em
  `nova/page.tsx` e `vt/page.tsx`. Confirmado que pré-existem: os dois arquivos estão **limpos no
  `git status`** e a diretiva já está no HEAD. Esta entrega não os tocou.
- **Produção:** frontend rebuildado e reiniciado. `/login` responde 200 e `/api/health` responde
  `{"status":"ok"}`. Aguardando a validação do diretor **em produção**.
- **Sem commit até aqui**, conforme §A.21: o gatilho do commit e do push é a validação do diretor na
  tela.

### Aberto ao fim desta entrega

- **O documento preso continua preso.** O Bloco 1 era diagnóstico, e nada foi alterado no banco nem
  no código do fluxo de auditoria. Falta o diretor escolher o tratamento entre os cinco itens
  recomendados acima.
- **Decisão pendente:** o que fazer com resposta de TEXTO vinda do formulário do Pandapé (item 5).

---

## 23/07/2026, OST motivo verdadeiro e tratamento de falha de auditoria (blocos 1 a 7)

Execução da OST aberta a partir do diagnóstico da entrada anterior. **Premissa que atravessa tudo:
o EA é sistema INTERNO, quem lê é o CONSULTOR.** Todo motivo exibido foi escrito para responder a
uma pergunta só, "isso é comigo?", e para dizer a ação que resolve. Nenhum texto fala com o
candidato, nenhum descreve erro em jargão de HTTP, nenhum carrega dado pessoal (§A.6) e nenhum tem
travessão (§A.11).

### Bloco 1: motivo verdadeiro para TODA falha, não só quota

Antes, o `catch` do `auditarConjunto` só reescrevia a observação quando a exceção era
`MotorIaSemQuotaException`. Qualquer outra falha deixava no lugar a frase inicial, *"Documento
coletado, aguardando a análise por IA"*, que descreve uma fila que não existe.

Agora **toda falha sai classificada por FAMÍLIA** e a família decide três coisas: o texto exibido, o
estado do documento e se pode ser retentada. A régua vive em `apps/backend/src/domain/falha-auditoria.ts`
(módulo puro), e a leitura da família em qualquer erro é ponto único (`familiaDaFalha`, no
`ai-client.service`), então nenhuma falha chega ao banco sem motivo.

**Os textos escolhidos, um por família:**

| Família | Gatilho | Texto exibido ao consultor |
|---|---|---|
| **QUOTA** | HTTP 429 | "Auditoria parada: limite de uso da IA atingido. O documento está coletado e íntegro, o problema não é dele. Use Reauditar mais tarde; se insistir, avise a TI." |
| **ENTRADA** | HTTP 415 e 422 | "O arquivo recebido não é um documento auditável (esperado PDF, JPG ou PNG). Solicitar reenvio ao candidato, com foto ou PDF." |
| **CREDENCIAL** | HTTP 401 e 403 | "Auditoria parada: credencial da IA recusada. Não é problema do documento nem do candidato, e Reauditar não resolve. Avise a TI." |
| **INDISPONIBILIDADE** | 5xx, 408, 504, timeout, rede fora | "Auditoria parada: o motor de IA não respondeu. O documento está coletado e íntegro. Use Reauditar; se insistir, avise a TI." |
| **DESCONHECIDA** | qualquer outra coisa, inclusive erro que não é HTTP | "Auditoria parada por falha inesperada do sistema. O documento está coletado e íntegro. Use Reauditar; se insistir, avise a TI." |

A lógica dos textos: **ENTRADA** é a única em que a ação é do consultor (pedir reenvio); **QUOTA** e
**INDISPONIBILIDADE** podem passar sozinhas, então mandam tentar de novo; **CREDENCIAL** não passa
sozinha, então diz explicitamente para NÃO insistir e escalar; **DESCONHECIDA** admite que não se
sabe, o que é melhor que fingir uma fila. Teste garante que nenhum deles contém "aguardando a
análise", que era a mentira original.

### Bloco 2: o 415 reclassificado

O 415 vinha rotulado "Motor de IA indisponível". Afirmação falsa: o motor **respondeu**, e respondeu
que o **arquivo** não serve. Confundir as duas coisas manda o consultor esperar por um sistema que
está no ar. Agora 415 e 422 são **ENTRADA**, com teste dedicado marcando o caso.

**Cuidado colateral:** `requisitar` é o mesmo canal do Kit, do Drive e do VT. A família passou a ser
calculada para todos, mas o TEXTO de `MOTIVO_FALHA_IA` só é usado na rota `/auditoria/documento`;
as outras rotas mantêm as mensagens que já tinham. Sem isso, uma falha de kit passaria a instruir o
consultor a pedir reenvio de um documento que nem está em jogo ali.

### Bloco 3: resposta de texto do Pandapé vira INCONFORME

A regra fica assim, e vale daqui em diante: **problema do ARQUIVO é INCONFORME; problema NOSSO é
`AGUARDANDO_AUDITORIA`.** É a mesma distinção que já valia para o PDF protegido por senha, agora
estendida ao conteúdo.

`apps/backend/src/auditoria/conteudo-documento.ts` (puro) faz a triagem **antes de gastar chamada de
IA**, e decide **pelo CONTEÚDO, não pelo nome**: magic bytes são autoritativos, extensão e
`Content-Type` são declaração de terceiro e mentem (foi assim que um texto puro chegou ao Vertex).
Um arquivo chamado `.pdf` com miolo de texto é texto.

Três detalhes de desenho que valem registro:
- **Dois motivos, não um.** Texto digitado ganha o texto que o diretor pediu, *"Candidato digitou os
  dados em vez de anexar comprovante. Solicitar reenvio com foto ou PDF."*. Binário de formato que a
  auditoria não lê (um HEIC de iPhone, por exemplo) ganha *"O arquivo recebido não é um documento
  legível (esperado PDF, JPG ou PNG). Solicitar reenvio com foto ou PDF."*. Os dois são INCONFORME e
  os dois são acionáveis, mas dizer "digitou" quando não digitou seria repetir o defeito de origem,
  que era o sistema afirmar o que não sabe.
- **Não-bloqueio preservado.** Se ao menos UM arquivo do conjunto serve, audita-se o que serve. Só
  quando NADA serve é que sai o veredito determinístico. Mesma lógica do PDF protegido.
- **O arquivo recusado VAI para a staging assim mesmo.** O consultor precisa poder clicar em
  Visualizar e ver o que o candidato mandou, senão o veredito vira um "confie em mim".

E o documento **nunca passa por `AGUARDANDO_AUDITORIA` nesse caminho**, nem por um instante: o
upsert de coleta é pulado quando a triagem já reprovou, porque aquele estado é reservado a falha de
sistema. Teste trava isso.

### Bloco 4: política de retentativa, declarada

| Família | Retenta? | Quantas | Intervalo | Por quê |
|---|---|---|---|---|
| QUOTA | **Sim** | 2 (3 tentativas no total) | 2s, depois 6s | a janela de quota vira sozinha |
| INDISPONIBILIDADE | **Sim** | 2 (3 tentativas no total) | 2s, depois 6s | motor reiniciando, timeout de pico |
| ENTRADA | **Não** | 1 tentativa | não se aplica | determinística: o mesmo arquivo dá o mesmo veredito, sempre |
| CREDENCIAL | **Não** | 1 tentativa | não se aplica | não converge sem alguém trocar a credencial |
| DESCONHECIDA | **Não** | 1 tentativa | não se aplica | não se retenta às cegas, gastaria IA sem hipótese |

Os intervalos são **curtos de propósito**. Este é o SEGUNDO backoff da cadeia (o ai-service já
retentou o Vertex antes de responder) e, no upload manual, roda dentro da espera do consultor:
esperar mais que 8s no total travaria a tela. **Quota longa não se resolve aqui, e não é para se
resolver**: quem garante que o documento não fica esquecido é o marcador do Bloco 5.

### Bloco 5: marcador de tempo parado, e um defeito descoberto ao vivo no meio da OST

`apps/backend/src/domain/auditoria-parada.ts` (puro): limiar de **6 horas**, escolhido pela operação
e não pela técnica (auditoria normal leva segundos, então horas já é anomalia; 6h é curto para ser
notado no mesmo dia de trabalho e longo para não acender alarme por um pico do motor à tarde).

**Como ficou, e como a tela de diagnóstico reaproveita.** O backend calcula e manda no detalhe da
admissão um campo por documento, `paradoHa`, preenchido **só** quando passou do limiar; ausente
significa "nada a sinalizar". A tela não sabe a regra e não faz conta, ela exibe. Isso é deliberado:
régua num lugar só evita a divergência clássica de a coluna dizer uma coisa e o modal outra sobre a
MESMA linha. Não é contador permanente de coluna, que já foi avaliado e recusado.

Para a **tela de diagnóstico** que vem depois, a função de agregação já está pronta e é a mesma:
`resumirParados(docs, agora)` devolve `{ total, maisAntigoHoras }` sobre uma lista qualquer de
(estado, atualizadoEm). Serve para UMA admissão (o marcador de hoje) e para a BASE INTEIRA (a tela
de amanhã) sem alteração nenhuma: muda só quem monta a lista de entrada. Nenhuma dependência de
banco, de admissão ou de tela.

**O defeito descoberto ao vivo, durante esta OST.** Às 12:04 de hoje o documento preso recebeu um
**Reauditar** (log: `Reauditoria solicitada: tipo=DADOS_BANCARIOS, arquivos=1, origem=STAGING`
seguido de `HTTP 415`). Falhou exatamente igual, e o `atualizado_em` **pulou de 14h para 0h**. Isso
matava o Bloco 5 em silêncio: um documento que é retentado de tempos em tempos nunca cruzaria o
limiar de 6h, e justamente esse é o que fica preso para sempre. **Corrigido**: falhar de novo do
mesmo jeito NÃO é evento novo e não rejuvenesce o documento. Um documento que JÁ estava em
`AGUARDANDO_AUDITORIA` preserva o carimbo original (no upsert de coleta, por expressão SQL
condicional, e na gravação da falha, por não carimbar); só uma transição REAL de estado carimba.
Vale registrar que isso é consequência boa de o diretor ter mexido na tela no meio da obra: o
comportamento não apareceria em teste.

### Bloco 6: o caso real, destravado

Runner `apps/backend/src/db/destrava-aguardando-auditoria.ts` (`pnpm db:destrava-aguardando`, seco
por padrão, grava só com `--aplicar`). Ele **não edita dado à mão**: aplica a MESMA função pura do
fluxo vivo (`triarConjunto`) aos arquivos que ainda estão na staging, e por isso a decisão é a mesma
que o código teria tomado. Regras dele:
- nenhum arquivo auditável → INCONFORME com o motivo acionável;
- há arquivo auditável → **não toca** (a parada foi falha de sistema, o documento pode estar ótimo);
- staging já expurgada → **não toca** (sem os bytes não há como classificar, e chutar veredito sobre
  documento que ninguém mais consegue ver seria pior que a parada).

**Antes e depois, no documento real:**

| | Estado | Observação | Carimbo |
|---|---|---|---|
| Antes | `AGUARDANDO_AUDITORIA` | "Documento coletado, aguardando a análise por IA." | 2026-07-23 12:04:49 |
| Depois | **`INCONFORME`** | **"Candidato digitou os dados em vez de anexar comprovante. Solicitar reenvio com foto ou PDF."** | 2026-07-23 12:39:18 |

Contagem da base depois: **ENTREGUE 10.539, PENDENTE 5.692, INCONFORME 83, AGUARDANDO_AUDITORIA 0.**

**E o laço agora converge.** A dedup manda reprocessar documento INCONFORME, então um novo pull vai
baixar o mesmo arquivo de novo; só que agora ele bate na triagem e regrava o MESMO INCONFORME com o
MESMO motivo. Antes o mesmo laço reescrevia `AGUARDANDO_AUDITORIA` e reiniciava o relógio, para
sempre.

### Bloco 7: o que subiu para produção sem validação

Correção do aviso que dei na entrega anterior: **o build de 11:53 não introduziu nada de outra
sessão.** A prova é temporal. O último arquivo de frontend mexido por outra sessão tem mtime
**01:42:46**, e houve restart do `ea-frontend` às **02:09:21**, ou seja, aquilo já estava servindo
antes de eu compilar. O único arquivo com mtime posterior àquele restart era o
`AuditoriaDocsModal.tsx` (11:52:59), que é meu. No backend, mesma coisa: última mudança de fonte às
02:14:14, restart às 02:16:18.

Ainda assim, a pergunta do diretor é legítima e a resposta é a lista completa do que está **em
produção sem ter passado por validação**, herdado das sessões anteriores (working tree, sem commit):

**Frontend, modificados:** `app/(app)/esteira/page.tsx` (+96 linhas), `app/(app)/gerenciador/page.tsx`
(+44), `app/(app)/liberacao/page.tsx` (+116), `app/globals.css` (+24),
`components/esteira/AdmissaoDetalheModal.tsx` (+60), `components/esteira/AgendamentoExameModal.tsx` (+4),
`components/esteira/AuditoriaDocsModal.tsx`, `components/gerenciador/EditAdmissaoModal.tsx` (+9),
`components/gerenciador/PendenciasModal.tsx` (+4), `components/shell/Sidebar.tsx` (+48),
`components/ui/Icon.tsx` (+10), `lib/api.ts` (+277), `lib/auth-context.tsx` (+86).
**Frontend, novos:** `components/ui/LogoEA.tsx`, `lib/nome.ts`, `lib/rotulo-auditoria.ts` (mais os
respectivos specs).

**Backend, modificados (13 arquivos):** admissões (service, dois DTOs de liberação), `ai-client.service.ts`,
`app.module.ts`, `auditoria.service.ts`, `auth/guards/jwt-auth.guard.ts`, `db/schema/tables.ts`,
seeds, `esteira.service.ts`, `pandape/*` (mime, fila, sync, módulo), `regua-completude.service.ts`.
**Backend, novos:** módulo `reauditoria/` inteiro, `staging/staging-visualizacao.ts`,
`pandape/dedup-arquivo.ts`, `domain/documentos-equivalentes.ts`, `domain/nome-suspeito.ts`,
`admissoes/dto/observacao-liberacao.ts`, os runners de `db/` e **quatro migrations** (0032 a 0035).
**ai-service, novos:** `pdf_seguranca.py`, `vertex_erros.py`.

Ou seja: **o acumulado de várias OSTs recentes está rodando em produção sem commit e sem a validação
formal da §A.21.** Não é efeito desta entrega nem da anterior, é o estado herdado. Fica registrado
para o diretor decidir se quer validar em bloco e commitar, ou validar por partes.

### Gate

- **Backend:** typecheck limpo, **435 testes verdes**, sendo **50 novos**: 15 da classificação por
  família, 14 da triagem de conteúdo, 10 do marcador de parada e 11 do comportamento do serviço
  (motivo por família, veredito sem IA e política de retentativa).
- **Frontend:** typecheck limpo, **38 testes verdes** (5 novos, do rótulo do marcador).
- **Lint:** os mesmos **2 erros PRÉ-EXISTENTES** de `react-hooks/exhaustive-deps` em `nova/page.tsx`
  e `vt/page.tsx`, arquivos que esta OST não tocou.
- **Ajuste de fixture, declarado:** dois testes antigos usavam buffers que não eram documento
  (`[10,20,30]`, `[1]`) como se fossem. Com a triagem do Bloco 3 eles passariam a ser reprovados
  antes da IA, o que quebraria testes cujo assunto é OUTRO (equivalência dos caminhos de upload e de
  pull). Os fixtures viraram magic bytes de JPEG. Também foi corrigido um piso de tamanho em
  `extensaoPorMagicBytes`: exigia 4 bytes para todas as assinaturas, e a do JPEG tem 3.
- **Produção:** shared-types, backend e frontend rebuildados; `ea-backend` e `ea-frontend`
  reiniciados; `/api/health` respondeu `{"status":"ok"}` e `/login` respondeu 200. Sem migração
  nesta OST (nenhuma coluna nova: o marcador usa o `atualizado_em` que já existia).

### Aberto ao fim desta entrega

- **O marcador de parada está no MODAL de auditoria, e não na lista da aba Auditoria da Esteira.**
  Escolha deliberada, por §A.14: a lista vive em `app/(app)/esteira/page.tsx`, que tem alteração não
  commitada de outra sessão, e a OST não pedia para mexer nela. O dado já está calculado e é o mesmo
  agregado que a lista consumiria. Se o diretor quiser a marca também na fila, é uma alteração
  pequena e isolada.
- **Não existe varredura de fundo.** Nada continua reprocessando um documento parado sozinho: o que
  há é retentativa dentro da tentativa, e o marcador para ninguém esquecer. Varredura periódica é
  assunto da **tela de diagnóstico**, junto com o `resumirParados` que já ficou pronto para ela.
- **Não houve ocorrência viva para exibir o marcador**, porque a base está com zero documentos em
  `AGUARDANDO_AUDITORIA` depois do Bloco 6. O comportamento está coberto por teste nas duas pontas
  (limiar no backend, rótulo no frontend); o que não existe é caso real para ver na tela hoje, e isso
  é o estado correto.
- **Sem commit**, conforme §A.21: o gatilho continua sendo a validação do diretor.

---

## 23/07/2026, OST urgente de produção: pasta não criada no Drive, RBAC da Liberação e CRUD de escalas

Quatro problemas relatados pelo diretor com o sistema no ar. Ordem de execução respeitada: 1, 2 e 3
(produção quebrada) antes do 4 (funcionalidade nova).

### BLOCO 1: a pasta não foi criada no Drive

Diagnóstico item a item, como pedido, antes de qualquer correção.

**1. A régua obrigatória FECHOU?** SIM. Parece que não, e é aí que mora a pegadinha: a régua daquele
par cliente+cargo tem **7 obrigatórios**, e o Reservista está **PENDENTE** até hoje. Só que a
candidata **não é do sexo masculino**, e a régua já tem a exceção do Reservista embutida em SQL
(`regua-completude.service`, `naoExigeReservista`): para candidata, a linha do Reservista **sai da
conta**. Então os obrigatórios aplicáveis eram 6, e os 6 estão ENTREGUE. A régua fechou às
**13:08:32**, na validação humana do último documento, e a AUDITORIA foi a `ANALISE_OK`
**automaticamente** (regra 2 do §A.3), não por clique.

**2. `arquivarNoDrive` foi chamado?** SIM, e **falhou**. O log do backend mostra
`ai-service /drive/arquivar respondeu HTTP 500` às 13:09:17 e de novo às 13:10:17. O erro REAL estava
no ai-service, engolido no 500 genérico:

```
googleapiclient.errors.HttpError: <HttpError 403 ... returned
"The specified parent is not a folder.". reason: 'parentNotAFolder'>
```

**3. Passou pela VALIDAÇÃO HUMANA?** SIM, e a correção do `aplicarPosVeredito` está valendo em
produção: foi exatamente a validação humana que fechou a régua, concluiu a frente e **disparou o
arquivamento**. O buraco antigo (validação humana não acionava o pós-veredito) não é este caso.

**4. O tipo de contrato tem pasta-pai mapeada?** SIM. Contrato "Temporário" resolve para a pasta
`1 - ATIVOS`, e a checagem ao vivo confirmou que ela é uma **pasta de verdade**, não atalho nem
arquivo, com `canAddChildren: true`. **Não era esse o problema.**

**5. A staging ainda existia?** SIM, com os 19 arquivos, porque o expurgo só roda **depois** do
arquivamento bem-sucedido. Foi o que permitiu destravar sem pedir nada ao candidato.

**A causa raiz, reconstruída pelos carimbos do Drive.** O lote subiu e parou no meio:

| Momento | O que aconteceu |
|---|---|
| 13:08:35 a 13:09:15 | **15 arquivos subiram com sucesso** para a subpasta DOCUMENTOS PESSOAIS |
| 13:09:17 | o **16º** arquivo foi recusado com `parentNotAFolder`, **na mesma pasta** que acabara de aceitar 15 |

Ou seja: o Google recusou um upload apontando para uma pasta que ele próprio tinha acabado de usar
15 vezes seguidas. Não é dado errado nem árvore errada, é **erro transitório do Drive**, e o desenho
não tinha nenhuma defesa contra ele: a exceção subia crua, a requisição inteira terminava em erro
DEPOIS de já ter gravado o veredito e concluído a frente, e o consultor ficava com a tela dizendo
"Análise finalizada" e o prontuário vazio. **Falha silenciosa, exatamente como o diretor descreveu.**

*Sobre a informação complementar do diretor (a pasta da candidata já existia no Drive): confirmado e
relevante. A busca por nome achou **duas** pastas com o mesmo nome sob a pasta-pai. O sistema é
idempotente por NOME (`buscar_ou_criar_pasta` procura antes de criar), então ele reaproveita a que
encontrar primeiro. Isso não causou a falha, mas deixou um resíduo tratado no fim deste bloco.*

**O que foi corrigido.** Duas camadas, porque o problema tem dois lados:

- **ai-service**: o upload agora captura o erro do Google, extrai o `reason` (nova função
  `drive.motivo_http`) e **retenta UMA vez com a subpasta reresolvida**. A retentativa cobre as duas
  hipóteses de uma tacada: se o id em cache ficou inválido, o novo lookup conserta; se foi soluço do
  Drive, a segunda tentativa passa. Persistindo, devolve **502 com detalhe acionável** ("o Drive
  recusou (motivo) no arquivo N de M, X já foram enviados") em vez de 500 cru. §A.6: log leva motivo,
  índice e id de pasta, **nunca** o `nome_final`, que carrega o nome do candidato.
- **backend**: a falha de arquivamento **não derruba mais** a requisição que já gravou o veredito.
  O `aplicarPosVeredito` captura, registra o erro com a família da falha, **preserva a staging**,
  mantém a URL nula (então a próxima ação na admissão tenta de novo sozinha) e devolve `avisoDrive`,
  que a tela exibe no mesmo lugar do aviso de descarte: *"Auditoria concluída e salva, mas o envio ao
  Drive falhou: os documentos continuam guardados aqui e o sistema tentará de novo na próxima ação
  desta admissão. Se insistir, avise a TI."* O aviso foi ligado nos **três** caminhos que fecham a
  régua (auditar, reauditar, validar por humano), não só em um.

**A admissão foi destravada.** Runner novo `db/rearquiva-drive.ts` (`pnpm db:rearquiva-drive`), que
**não edita dado à mão**: sobe o contexto do Nest e chama `aplicarPosVeredito`, o mesmo método do
fluxo vivo, escolhendo apenas em QUAIS admissões ele roda (as com `drive_pasta_url` nulo).

| | Antes | Depois |
|---|---|---|
| `drive_pasta_url` | nulo | `https://drive.google.com/drive/folders/1x7ywg...` |
| Arquivos no Drive | 15 de 19, em pasta sem link no EA | **19 de 19** na pasta agora vinculada |
| Staging | 19 arquivos ocupando disco | expurgada, como manda o fluxo |
| `/drive/arquivar` | HTTP 500 | **HTTP 200** |

*Nota operacional, decisão do diretor:* sobraram **duas pastas** com o mesmo nome sob `1 - ATIVOS`, a
oficial (19 arquivos, vinculada no EA) e o resíduo da tentativa interrompida (15 arquivos). A fábrica
**não apagou nada**, por contrato: o módulo do Drive só executa operações aditivas e de leitura, e
qualquer operação destrutiva é vetada na revisão (§A.6). A consolidação é manual, no Drive.

### BLOCOS 2 e 3: MESMA CAUSA, confirmada

O diretor suspeitou e estava certo: é **um defeito só**, com dois sintomas.

`/admin/clientes` e `/admin/cargos` tinham `@Roles("MASTER","SUPER_ADMIN")` **na CLASSE** da
controller, o que cobre também o **GET** da listagem. A tela de Liberação busca as duas listas dentro
de um `Promise.all` junto com a própria fila. Para o perfil Comum:
1. os dois GETs voltavam **403 "Acesso restrito à administração"** (**Bloco 3**: a mensagem de menu
   restrito não vinha de nenhum guard de menu, era o texto do `RolesGuard` caindo no banner de erro
   da tela);
2. como um `Promise.all` rejeita inteiro no primeiro erro, **nada** carregava: nem clientes, nem
   cargos, nem a fila (**Bloco 2**).

**A correção NÃO foi remendo pontual**, conforme o diretor exigiu que fosse reportado antes. A régua
aplicada é conceitual e vale para os dois catálogos: **LER catálogo é dado de TRABALHO, ESCREVER é
administração.** O `@Roles` saiu da classe e passou a marcar **método a método** toda operação de
escrita (criar, editar, trocar vínculo, inativar, reativar), e o GET da listagem ficou liberado a
**qualquer autenticado** (o `JwtAuthGuard` global continua valendo: liberado nunca significa público).
As duas leituras auxiliares que só a administração usa (`vinculo-opcoes` e `dependencias`)
**continuam restritas**, de propósito.

**Como isso conversa com o levantamento de PERMISSÃO DE MENU POR USUÁRIO** (o diretor pediu para
dizer): esta correção é **pré-requisito**, não concorrente. O que ela estabelece é que a unidade de
permissão é a **operação** (ler x escrever um recurso), não a controller inteira nem a tela. Uma
permissão por menu montada sobre o modelo antigo herdaria o mesmo defeito: bastaria a tela do
consultor precisar ler um recurso "administrativo" para ele ser barrado de novo. Recomendação:
quando aquela frente for aberta, o desenho deve mapear **operação → papel/permissão** e derivar o
menu disso, e não o contrário. O que foi feito agora é o mínimo correto e não atrapalha aquele
desenho.

Regressão travada em teste (`admin/rbac-catalogos.spec.ts`, 5 casos): a classe não pode voltar a ter
`@Roles`, o GET tem de continuar aberto e **toda** escrita tem de continuar restrita. Se alguém
reverter qualquer um dos três, o teste quebra.

### BLOCO 4: CRUD de escalas

Menu novo em **Cadastros → Escalas** (`/admin/escalas`), card no Menu Gerencial, mesma máscara dos
demais cadastros (§A.12): formulário único que cria e edita, filtros por status com contador, busca
em tempo real, tabela com **ordenação clicável** e inativação por modal de confirmação.

- **Inativar é EXCLUSÃO LÓGICA** (`ativo=false`), como nos demais cadastros e como o diretor pediu
  para declarar. Nunca exclusão física, nunca cascata: a escala já escolhida numa admissão preserva o
  vínculo e o histórico segue legível; ela só sai das opções selecionáveis. Reversível pela
  reativação. Coberto por teste que falha se alguém trocar a inativação por `delete`.
- **Alimenta o campo "Escala" da Liberação: confirmado.** A tabela `escalas_catalogo` já era a fonte
  de `/catalogos/escalas`, que é o que a Liberação e o wizard consomem (só as **ATIVAS**). O que não
  existia era a tela de manutenção: escala só nascia por um caminho lateral (`addCatalogo`). Base
  atual: **104 escalas ativas, 0 inativas**. Como a Liberação lê as ativas, criar aqui aparece lá, e
  inativar aqui some de lá, sem tocar em quem já usa.
- **Detalhe de usabilidade que virou regra:** tentar criar uma escala cujo nome já existe **inativa**
  devolve *"Já existe uma escala inativa com esse nome. Reative em vez de criar outra."*, em vez do
  409 genérico. Sem isso a pessoa fica sem entender por que o nome está "ocupado" se não aparece na
  lista.
- **RBAC nasce no modelo novo** (leitura aberta, escrita restrita a Master / Super Admin), de
  propósito: não faria sentido criar hoje uma controller no mesmo formato que acabou de tirar a
  Liberação do ar.

### Gate

- **Backend:** typecheck limpo, **448 testes verdes** (13 novos: 5 do RBAC dos catálogos, 8 do
  catálogo de escalas).
- **Frontend:** typecheck limpo, **38 testes verdes**.
- **Lint:** os mesmos **2 erros PRÉ-EXISTENTES** de `react-hooks/exhaustive-deps` em `nova/page.tsx`
  e `vt/page.tsx`, arquivos que esta OST não tocou.
- **Produção:** ai-service reiniciado com a correção do Drive; backend e frontend rebuildados e
  reiniciados. `/api/health` respondeu `{"status":"ok"}`, `/login` respondeu 200, as cinco rotas de
  `/api/admin/escalas` aparecem mapeadas no log e as rotas de catálogo respondem **401 sem token**
  (o guard global continua valendo depois da mudança de RBAC). Sem migração (a tabela
  `escalas_catalogo` já existia).

### Aberto ao fim desta entrega

- **Consolidação das duas pastas duplicadas no Drive** é manual, no Drive. A fábrica não apaga nada
  lá (§A.6).
- **A causa transitória do `parentNotAFolder` não tem explicação do lado do Google.** O tratamento
  entregue é o correto para erro transitório (retentar uma vez e, persistindo, avisar em vez de
  falhar calado). Se voltar a acontecer com frequência, o log agora nomeia o motivo e o arquivo,
  então dá para medir em vez de adivinhar.
- **Permissão de menu por usuário** segue como frente própria, agora com a base certa (permissão por
  operação). Ver o registro do Bloco 3.
- **Sem commit**, conforme §A.21: o gatilho é a validação do diretor em produção.

---

## 23/07/2026, OST urgente do Drive: acesso ao prontuário, duplicação, checar antes de criar e identidade

Ordem executada como o diretor pediu: diagnóstico dos Blocos 2 e 4 primeiro, depois a correção do 3,
com o 1 em paralelo por ser independente.

### BLOCO 2 (diagnóstico): por que duplica

**O fato, medido no acervo real.** Varredura somente-leitura das quatro pastas-pai de contrato,
agrupando arquivo por **md5 do conteúdo** (não por nome):

| Medida | Valor |
|---|---|
| Subpastas com arquivo repetido | **7** |
| Cópias EXTRAS (além da primeira) | **30** |
| Pastas de prontuário com NOME duplicado sob a mesma pasta-pai | **4** (2 pares) |

Separando por origem, porque as duas coisas não têm a mesma causa:
- **5 subpastas, 28 cópias extras** têm o padrão de nome do EA (`{Tipo}_{Nome}`), ou seja, foram o
  sistema. O pior caso tem **8 cópias do mesmo CTPS** e 6 do mesmo comprovante de residência.
- **2 subpastas, 2 cópias extras** têm nome manual (`RG.pdf` e `RG (2).pdf`, conteúdo idêntico):
  isso é a equipe subindo o mesmo arquivo duas vezes à mão, não é defeito do EA.

**A causa (a hipótese do diretor estava certa, e há um agravante).** São dois fatos que se somam:

1. **A staging ACUMULA.** `auditarConjunto` grava os arquivos na staging **antes de cada chamada de
   IA**, e o nome gravado leva um **uuid novo a cada vez** (`{TIPO}__{uuid}.{ext}`). Auditar, depois
   reauditar, depois um novo pull do Pandapé: cada passagem deixa **mais uma cópia** do mesmo
   documento no diretório.
2. **O arquivamento sobe a staging INTEIRA.** `arquivarNoDrive` faz `staging.listar(admissaoId)` e
   manda tudo. Não pergunta o que já está no destino.

Prova direta no caso da semana: a staging daquela admissão tinha **três** arquivos de Título de
Eleitor com **exatamente o mesmo tamanho** e dois de Comprovante de Conta Bancária de 91 bytes, e o
log mostra as duas reauditorias que os produziram (13:07:47 e 13:08:09). No Drive, aquele prontuário
ficou com **3 cópias do Título de Eleitor e 2 do Comprovante**. Bate um a um.

**Item 3, a retentativa que entrei ontem podia reintroduzir cópia?** SIM, era um risco real, e o
diretor apontou certo. Se o upload chegasse a criar o arquivo e o erro viesse depois, repetir criaria
uma segunda cópia. **No caso concreto não aconteceu** (a falha foi na resolução do destino, nada
chegou a subir, e a conferência do Drive mostra 19 arquivos para 19 da staging), mas o risco existia
no desenho. Está fechado no Bloco 3: antes de repetir, o sistema relê o destino e, se o arquivo já
estiver lá, **conta como enviado e não sobe de novo**.

**Item 4, o upload é idempotente?** **NÃO era.** A idempotência por nome existia **só para a PASTA**
(`buscar_ou_criar_pasta` procurava antes de criar). Para o ARQUIVO, `subir_arquivo` sempre chamava
`files().create`, sem consultar nada. Confirmado, e é exatamente o buraco do Bloco 3.

*Correção de um número que publiquei ontem: eu disse "103 prontuários criados pelo EA". Estava
errado, era "103 pastas criadas a partir de 01/07", e a esmagadora maioria é trabalho MANUAL da
equipe. A árvore tem 2.762 pastas só em `1 - ATIVOS`, criadas por 18 pessoas ao longo de anos. A
medição de duplicação acima está certa; o denominador que usei ontem, não.*

### BLOCO 4 (diagnóstico): tudo aparece como "Henrique"

**É (b), o PROPRIETÁRIO, não o título.** Os dois foram verificados separadamente, como o diretor
pediu:

- **Título da pasta: CORRETO.** A pasta do caso real tem o formato esperado, `{nome do candidato}` +
  separador + `{operação}` (conferido sem expor o nome, §A.6: a checagem mostrou "4 palavras de nome"
  seguidas de "CIA DAS LETRAS"). Não há nada de "Henrique" no título.
- **Dono e último editor: `henrique.vieira@soulan.com.br`**, tanto na pasta quanto nos arquivos de
  dentro.

**Por quê.** O `.env` do ai-service tem `DRIVE_DELEGATED_SUBJECT=henrique.vieira@soulan.com.br`. A
service account usa **delegação de domínio para personificar a conta pessoal do diretor**, então tudo
o que o sistema cria nasce com ele como dono e como autor. Não é bug de código, é a **identidade que
autentica**.

**Por que isso foi configurado assim.** A árvore está em **My Drive** (não é unidade compartilhada:
a checagem devolveu `driveId` vazio). Service account pura **não tem cota de armazenamento em My
Drive**, então ela não consegue ser dona de arquivo lá. A personificação foi o jeito de fazer o
upload funcionar. O próprio módulo já documenta isso. Achado colateral: existe **1 pasta** cujo dono
é a própria service account (`ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com`), resíduo de
quando rodou sem delegação.

**O que o conserto exige (NÃO foi feito, conforme instrução).** Duas saídas, em ordem de qualidade:

| Saída | O que muda | Custo |
|---|---|---|
| **Unidade Compartilhada** (recomendada) | a árvore passa a pertencer à ORGANIZAÇÃO; a service account escreve direto, sem personificar ninguém; sai da caixa de qualquer pessoa | criar a unidade, dar acesso de Gerenciador de Conteúdo à SA, **migrar a árvore** (operação de admin do Workspace, não do EA) e retreinar o caminho que a equipe usa |
| **Conta de sistema dedicada** | trocar `DRIVE_DELEGATED_SUBJECT` para uma conta institucional (ex.: `sistema.ea@` ou `admin.soulan@`); os arquivos passam a nascer como dela | barato, uma linha de env + permissão da conta na árvore. Mas a propriedade continua numa caixa de e-mail, não na organização |

**Impacto no que já foi criado: nenhuma das duas saídas muda retroativamente.** As pastas e arquivos
já criados continuam com o diretor como dono; trocar a identidade só vale para o que nascer depois. A
transferência de propriedade do que existe é operação de **admin do Workspace**, e o EA não pode
fazê-la: o módulo do Drive só executa operações aditivas e de leitura por contrato (§A.6). **Decisão
do diretor**, com o Fernando.

### BLOCO 3 (correção): checar antes de criar, checar antes de subir

**PASTA.** A verificação por nome já existia; o que faltava era o resto:
- **Avisar na tela quando reutiliza.** O ai-service passa a devolver `pastaJaExistia`, o backend
  registra no log e a tela exibe: *"A pasta já existia no Drive e foi reaproveitada, nenhuma pasta
  nova foi criada."* Sem isso ninguém sabe se o prontuário nasceu agora ou se o sistema escreveu
  dentro de uma pasta que a equipe já mantinha à mão, que é justamente o caso que o diretor relatou.
- **Desempate determinístico onde já há duplicata.** As 4 pastas de nome repetido nasceram de
  **corrida** (dois arquivamentos simultâneos: os dois consultaram, os dois não acharam nada, os dois
  criaram). A busca agora ordena por `createdTime` e **vence sempre a mais antiga**, e há uma
  releitura depois da criação para fechar a janela da corrida. Efeito prático: todo mundo converge
  para a mesma pasta e **a duplicata remanescente para de receber arquivo novo**.

**ARQUIVO. Critério de "mesmo arquivo" adotado: CONTEÚDO, por md5.** Declarado como o diretor pediu,
com o porquê da escolha:
- **Não é o nome.** O acervo prova que não serve: existem `RG.pdf` e `RG (2).pdf` com bytes
  idênticos. E o EA renomeia tudo para `{Tipo}_{Nome}`, então duas versões DIFERENTES do mesmo tipo
  colidiriam por nome e uma delas nunca subiria.
- **Não é o SHA-256 da dedup do Pandapé**, embora ele exista. Aquela marca responde outra pergunta
  ("este anexo já foi coletado?") e não sabe nada sobre o que está no Drive; usá-la aqui obrigaria a
  manter um segundo livro-caixa em dia. O **Drive já calcula e devolve `md5Checksum`** de todo
  arquivo binário, então a fonte da verdade é o próprio destino, sem estado extra para desincronizar.
- Como funciona: uma consulta por subpasta traz o conjunto de md5 já lá; cada arquivo da staging tem
  o md5 calculado localmente e é **pulado** se já existir. O que sobe entra no conjunto na hora, então
  **duas cópias idênticas dentro do MESMO lote sobem uma vez só**, que é exatamente o caso da staging.
- A resposta passa a trazer `ignorados`, e o backend loga `enviados=N, ignorados por já existirem=M`.
  Esse número é a medida direta da duplicação evitada.

**Prevenção, não limpeza.** Nada foi apagado, e o módulo continua aditivo por contrato. As 30 cópias
extras e as 4 pastas duplicadas que já estão lá continuam onde estão: consolidação manual do diretor.

Cobertura: **5 testes novos no ai-service**, batendo no caminho REAL do router com um duplo do
cliente do Google (sem rede): lote com três cópias idênticas sobe uma, rearquivar admissão já
arquivada não duplica nada, pasta existente é reutilizada sem criar outra, pasta duplicada
pré-existente converge para a mais antiga, e o caminho novo continua criando pasta quando não há
nada.

### BLOCO 1: acesso ao prontuário

**O diagnóstico mudou a correção.** O botão **já existia** em dois lugares, e mesmo assim o consultor
não chegava na pasta. Motivo:

- Na **linha da Esteira** o link estava condicionado a `isAuditoria`, ou seja, **só na aba
  Auditoria**. Só que a fila da Esteira mostra apenas frentes **não concluídas**
  (`concluida = false`), e a pasta só nasce quando a **régua fecha**, o que **conclui a AUDITORIA**.
  Resultado: no instante em que o prontuário passa a existir, a linha **sai da aba onde o link
  aparecia**. O botão vivia exatamente onde a admissão já não estava.
- No **modal de auditoria** (o dos documentos) o link só aparecia para o arquivamento feito **naquela
  sessão**; quem abrisse depois não via nada, mesmo com a URL gravada no banco.
- Só a ficha (o olho) mostrava o link persistido, e ela também depende de a linha estar visível em
  alguma aba.

**O que foi feito, e onde (o critério é "bate o olho e chega ao prontuário"):**
1. **Linha da Esteira, em TODAS as abas.** Saiu a condição `isAuditoria`. Nas abas de Exame e
   Cadastro a admissão continua viva, e é lá que o consultor está trabalhando depois que a auditoria
   fecha. É a correção que resolve o problema relatado.
2. **Modal de auditoria passa a usar a URL PERSISTIDA**, não só a da sessão (com o `driveAsoUrl` como
   último recurso, já que o ASO aponta para a mesma pasta do funcionário).
3. **Nada de botão morto.** Sem URL e com a régua **completa**, aparece o motivo: *"Régua completa,
   mas ainda não há pasta no Drive para esta admissão. Os documentos seguem guardados aqui e o
   sistema tenta enviar de novo na próxima ação."* Com a régua ainda aberta não aparece nada, porque
   a barra de progresso logo acima já diz onde o processo está. Isso encaixa com o aviso de falha de
   arquivamento ligado ontem nos três caminhos.

### Gate

- **ai-service:** **72 testes verdes** (5 novos, do Bloco 3).
- **Backend:** typecheck limpo, **448 testes verdes**.
- **Frontend:** typecheck limpo, **38 testes verdes**.
- **Lint:** os mesmos **2 erros PRÉ-EXISTENTES** de `react-hooks/exhaustive-deps` em `nova/page.tsx`
  e `vt/page.tsx`, arquivos que esta OST não tocou.
- **Produção:** ai-service reiniciado com a correção; backend e frontend rebuildados e reiniciados.
  `/health` do ai-service 200, `/api/health` `{"status":"ok"}`, `/login` 200. Sem migração.

### Aberto ao fim desta entrega

- **Identidade do Drive (Bloco 4) é decisão do diretor**, com o Fernando. Nada foi trocado, conforme
  instruído. Enquanto não mudar, todo prontuário novo continua nascendo com o diretor como dono.
- **Resíduo existente**: 30 cópias extras em 5 prontuários (mais 2 de origem manual) e 2 pares de
  pasta duplicada. A correção **impede o próximo**, não remove o passado. Consolidação manual.
- **Rearquivamento em massa NÃO foi executado, de propósito.** O runner `db:rearquiva-drive` aceita
  `--admissao=<id>` e foi assim que a admissão da semana foi destravada. Rodá-lo **sem alvo** pegaria
  **2.337 admissões sem pasta**, quase todas do histórico importado, e chamaria o pós-veredito em
  cada uma (recalculando sinalizador e podendo concluir frente automaticamente). Isso conflita com o
  recorte da §A.16, que manda não recalcular histórico. **Só com aval explícito do diretor**, e o
  caminho seguro é por alvo ou por um recorte de farol vivo.
- **Sem commit**, conforme §A.21: o gatilho é a validação do diretor em produção.

---

## 23/07/2026, OST do Drive: segundo prontuário sem pasta e conferência da conta de serviço

**DECISÃO REGISTRADA, NÃO REABRIR:** rearquivamento em massa está **DESCARTADO**. Nada de criar
2.337 pastas. O runner `db:rearquiva-drive` segue **apenas POR ALVO**.

### BLOCO 1: o segundo caso

O diretor complementou no meio da apuração que **a pasta dela estava salva no Drive**, e isso mudou o
diagnóstico: o problema não era a pasta faltar, era o **link não chegar ao banco**.

**1. A régua fechou?** SIM, às **14:45:34**, pelo caminho da **validação humana** (o consultor
assumiu RG, CTPS e Dados Bancários que a IA tinha reprovado). Mesmo padrão do caso anterior: o
Reservista aparece PENDENTE mas **sai da conta** por não se aplicar à candidata, então os
obrigatórios aplicáveis fecharam.

**2. `arquivarNoDrive` foi chamado?** SIM, **duas vezes** (14:46:07 e 14:46:43), e as duas falharam
com **HTTP 500**. O tratamento que entrou ontem funcionou como projetado: as duas falhas estão no log
com família e a admissão foi preservada.

```
ERROR [AiClientService]  ai-service /drive/arquivar respondeu HTTP 500
WARN  [AiClientService]  falha de família INDISPONIBILIDADE (HTTP 500)
ERROR [AuditoriaService] Arquivamento no Drive FALHOU (admissão c5f562fe...): família=INDISPONIBILIDADE.
                         Staging preservada e URL não gravada, então a próxima ação tenta de novo.
```

**3. É a MESMA causa do caso anterior? NÃO, é causa NOVA.** A prova é o código de status. O caso
anterior foi um `HttpError 403 parentNotAFolder`, e o tratamento que entreguei converte QUALQUER
`HttpError` do envio em **502** depois de uma retentativa. O que se viu aqui foi **500**, duas vezes,
com o ai-service **já rodando a versão corrigida**. Logo, a exceção **não era um `HttpError` do
envio**: ela escapou por um ponto que continuava sem tratamento. A correção do `parentNotAFolder`
está valendo e não é o que falhou.

**Onde falhou, reconstruído pelos carimbos do Drive.** A pasta dela foi criada em
**14:45:34.606**, o mesmo segundo em que a régua fechou, e recebeu os arquivos. Ou seja: **criou a
pasta, subiu os arquivos e morreu no fim**. Sobravam exatamente **dois pontos sem tratamento** no
fluxo: a leitura do arquivo da staging e a leitura do link da pasta (o último passo). Testei o
segundo agora, ao vivo, naquela mesma pasta: **funciona**. Por eliminação, o ponto provável é a
leitura da staging.

**Não vou afirmar qual foi sem prova, e o motivo de não ter a prova é meu:** o log do ai-service
daquele momento **foi perdido**, porque eu reinicio o processo redirecionando com `>` (trunca) em vez
de `>>` (acrescenta). Corrigido, o log agora é acrescentado. E, mais importante que o log, **os dois
pontos passaram a ter tratamento**: falha ao ler a staging e falha ao ler o link agora viram **502
nomeado**, dizendo QUAL arquivo do lote falhou e QUANTOS já tinham subido, em vez de 500 anônimo. Se
repetir, o sistema se explica sozinho.

**4. A staging existia?** SIM na hora da apuração, com 16 arquivos. **5. `drive_pasta_url` estava
nula?** SIM. Os dois fatos juntos são a explicação do que o diretor viu: **a pasta existia no Drive,
mas o EA não sabia disso**, e por isso não tinha link para mostrar.

**Destravada, e com prova do fix de ontem funcionando.** O arquivamento por alvo rodou às **15:24:56**
e devolveu **200**. O que ele fez, medido no Drive:

| | Antes | Depois |
|---|---|---|
| `drive_pasta_url` | nula | preenchida (pasta criada às 14:45:34) |
| Arquivos na pasta | 24 | **27** |
| Pastas criadas | 1 (já existia) | **nenhuma nova**, reutilizou |
| Staging | 16 arquivos | expurgada |

Só **3 arquivos** subiram: os outros 13 da staging foram **pulados por conteúdo idêntico**. É a
checagem de md5 do Bloco 3 de ontem operando em produção, no caso real. Sem ela, esta rodada teria
somado mais 16 cópias ao prontuário.

**A MEDIÇÃO que o diretor pediu: quantas admissões com régua FECHADA estão sem `drive_pasta_url`.**

| Farol | Admissões | Leitura |
|---|---|---|
| ADMISSAO_CONCLUIDA | **1.477** | **NÃO são falha.** É o histórico importado (§A.16): a carga marca os documentos como ENTREGUE, então a régua "fecha" por construção, mas nunca houve staging nem arquivo para enviar. Nunca tiveram pasta e não deveriam ter. |
| EM_ADMISSAO | **2** | **São casos reais**, no mesmo estado da admissão desta OST |
| RESCISAO | 1 | encerrada, sem trabalho ativo |

Os **2 casos vivos** têm AUDITORIA concluída, staging viva (**15 e 22 arquivos**) e nenhuma pasta
gravada. **Não foram tocados**: destravar cada um é ação por alvo e fica para o diretor autorizar,
como foi feito aqui. Somando o desta OST e o da semana passada, são **4 admissões** que fecharam a
régua e não registraram o prontuário. **O padrão que o diretor suspeitou existe**, e é o mesmo
sintoma com causas diferentes: o envio ao Drive falha por motivos variados e, até ontem, falhava
calado. As duas defesas agora são o aviso na tela e o 502 nomeado.

### BLOCO 2: conta de serviço (confirmação, nada foi alterado)

**1. É esta a service account em uso? SIM.** O `credentials.json` do ai-service tem
`client_email: ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com`, projeto `ea-v2-automatic`.
É exatamente a que o diretor informou. Ela **já é a identidade do sistema**; o que ela faz hoje é
**personificar a conta pessoal dele** (`DRIVE_DELEGATED_SUBJECT`).

**2. Apontar o `DRIVE_DELEGATED_SUBJECT` para a própria SA resolve? NÃO, e agora está PROVADO.**
Consulta somente-leitura à API, com a credencial real:

```
SA pura (sem personificar ninguém)
   identidade vista pelo Drive: ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com
   storageQuota: {'limit': '0', 'usage': '0'}          <-- ZERO byte de cota
```

**Cota zero**: a service account não pode ser dona de arquivo em My Drive. Ela consegue **listar** e
consegue até **criar pasta** (pasta não ocupa espaço), mas **o upload de arquivo falha**. Isso
explica um achado que ficou solto ontem: existe **1 pasta** na árvore cujo dono é a própria SA, sem
arquivo dentro, que é a assinatura exata de uma execução sem delegação. Personificar a si mesma dá no
mesmo: a chamada até passa, mas a cota continua zero. **Esse caminho não existe, o diretor não deve
tentar.**

Para comparação, a delegação atual (conta pessoal dele) enxerga o pool de armazenamento do Workspace,
com cerca de 277 TB de limite. É por isso que funciona hoje.

**3. A única saída que tira a propriedade da conta pessoal é a UNIDADE COMPARTILHADA.** Confirmado.
Em unidade compartilhada o dono é a **unidade** (a organização), não uma pessoa, e a service account
escreve **sem personificar ninguém**, porque o espaço é da unidade e não da caixa de um usuário.

**O que o admin do Workspace precisa fazer, na ordem:**
1. **Criar a Unidade Compartilhada** (Shared Drive) que vai abrigar a árvore de prontuários.
2. **Adicionar a service account como MEMBRO** da unidade, pelo e-mail
   `ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com`. **Papel recomendado: Colaborador**
   (*Contributor*). É o menor papel que permite **criar pasta e subir arquivo**, e **não** permite
   mover nem excluir o que já está lá. Isso casa com o contrato do módulo, que é aditivo e tem
   proibição explícita de operação destrutiva (§A.6). *Gerenciador de conteúdo* também funcionaria,
   mas dá poder de exclusão que o sistema não usa e não deve ter.
3. **Migrar a árvore existente** para dentro da unidade. É operação de admin do Workspace (mover
   pastas de My Drive para unidade compartilhada transfere a propriedade para a unidade). **O EA não
   pode e não deve fazer isso**: mover é operação mutante, vetada no módulo.
4. Depois da migração, do lado do EA são duas linhas de configuração: **esvaziar**
   `DRIVE_DELEGATED_SUBJECT` (a SA passa a escrever como ela mesma) e **repontar os IDs de pasta-pai**
   por tipo de contrato (`DRIVE_CONTRATO_*_FOLDER_ID`) para a nova árvore. Sem deploy de código.

**4. O que acontece com as pastas já criadas: continuam com ele como dono.** Trocar a identidade
**não age retroativamente**. Tudo o que já foi criado (pastas e arquivos) permanece com a conta
pessoal do diretor como proprietária. A transferência do que existe é **manual, pelo admin do
Workspace**, e acontece naturalmente se a árvore for movida para a unidade compartilhada no passo 3.

*Observação de risco operacional, fora do escopo desta OST mas material:* o **ai-service não tem
unidade systemd**. Ele roda como processo solto iniciado à mão, enquanto backend e frontend são
serviços gerenciados. Se a VM reiniciar, **backend e frontend voltam e o ai-service não**, e sem ele
não há auditoria nem arquivamento. É barato de resolver (uma unidade systemd de usuário, no padrão
das outras duas) e recomendo fazer.

### Gate

- **ai-service:** **74 testes verdes** (2 novos: falha ao ler a staging e falha ao ler o link da
  pasta viram 502 nomeado, com a contagem do que já subiu).
- **Backend:** **448 testes verdes**. **Frontend:** **38 testes verdes**. Typecheck limpo nos dois.
- **Credencial e env: NADA foi alterado**, conforme a instrução. As checagens do Bloco 2 foram todas
  somente-leitura.
- **Produção:** ai-service reiniciado com a correção e agora com log em modo append. `/health` 200,
  `/api/health` 200, frontend 200.

### Aberto ao fim desta entrega

- **2 admissões vivas** com régua fechada e sem pasta gravada, staging ainda viva (15 e 22 arquivos).
  Destravar é por alvo e depende do aval do diretor.
- **Unidade compartilhada** é decisão do diretor com o admin do Workspace. Enquanto não mudar, todo
  prontuário novo continua nascendo com ele como dono.
- **ai-service sem unidade systemd**: não sobrevive a um reboot da VM.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, aprovações do diretor: destrave por alvo, ai-service em systemd e conta institucional

Três itens aprovados. Os dois primeiros foram executados; o terceiro **parou no ponto de
confirmação**, como a própria OST mandou.

### 1. Destrave POR ALVO das duas admissões vivas

Rodado o `db:rearquiva-drive --admissao=<id> --aplicar`, que chama o **`aplicarPosVeredito` do fluxo
vivo**: quem decide o que arquivar e o que gravar é o código de produção, o runner só escolhe em qual
admissão ele roda. **Nenhuma execução em massa.** Os 1.477 em `ADMISSAO_CONCLUIDA` (histórico
importado) e o 1 em `RESCISAO` ficaram de fora, conforme a decisão registrada.

| | Admissão `77c4159f` | Admissão `23e20f59` |
|---|---|---|
| Staging antes | 15 arquivos | 22 arquivos |
| `drive_pasta_url` antes | nula | nula |
| Pasta no Drive | **criada agora** (15:56:02) | **reaproveitada**, já existia desde 14:16:24 |
| Enviados | 8 | **9** |
| Pulados por conteúdo idêntico | 7 | **13** |
| Arquivos na pasta ao final | 8 | 15 |
| **Duplicatas na pasta** | **0** | **0** |
| `drive_pasta_url` depois | gravada | gravada |
| Staging depois | **expurgada** | **expurgada** |

A linha que o backend registrou no segundo caso resume o mecanismo funcionando:

```
Régua fechada: documentos arquivados no Drive (admissão 23e20f59...).
enviados=9, ignorados por já existirem=13, pasta reutilizada=sim.
```

**Os dois números que importam:** **20 arquivos foram pulados** entre as duas admissões (7 + 13), e
as duas pastas terminaram com **zero duplicata**. Sem a checagem de md5 entregue na OST anterior,
este mesmo destrave teria empilhado 37 arquivos em vez de 17, repetindo o defeito que ele veio
corrigir. E a segunda admissão prova a outra metade da regra: a pasta **já existia** e foi
reaproveitada, nenhuma pasta nova nasceu.

*Ajuste pequeno no runner:* ele subia o contexto do Nest com `logger: ["warn","error"]`, o que
**escondia** justamente a linha de resultado do envio (que é nível `log`). Passou a incluir `log`, e
por isso a evidência acima existe.

### 2. ai-service em unidade systemd

Novo `infra/systemd/ea-ai-service.service`, no mesmo padrão dos outros dois, e o `install.sh` passou
a instalar os **três** serviços. O script continua portátil: além do caminho do repo e do node, agora
reescreve também o caminho do `uv`, e **falha explicitamente** se o `uv` não estiver no PATH, em vez
de gerar um unit quebrado.

**Sobre o log, que era a preocupação explícita do diretor:** o unit manda `StandardOutput=journal` e
`StandardError=journal`. O journal é **append por natureza**, com rotação do próprio journald. Isso
elimina a causa raiz do problema anterior: o processo era iniciado à mão redirecionando com `>`, e
**cada reinício truncava o arquivo**, que foi como o rastro de uma falha real se perdeu. Agora o
histórico atravessa restart e reboot (`journalctl --user -u ea-ai-service`).

**Teste de resiliência, executado:**

```
PID antes: 132363
kill -9
PID depois: 133402        (processo NOVO, subiu sozinho)
is-active: active
health após kill -9 = 200
```

E o journal preservou **os dois ciclos de vida**, que é a prova prática do append:

```
16:02:47  Started ea-ai-service.service
16:02:49  Uvicorn running on http://127.0.0.1:8000
16:03:18  Main process exited, code=killed, status=9/KILL
16:03:22  Scheduled restart job, restart counter is at 1.
16:03:22  Started ea-ai-service.service
16:03:24  Uvicorn running on http://127.0.0.1:8000
```

**Sobre o boot: não reiniciei a VM de produção para provar**, e não vou reiniciar por conta própria.
O que foi verificado é o mecanismo, que é exatamente o mesmo que já faz o backend e o frontend
voltarem:

| Serviço | enabled | WantedBy | Restart |
|---|---|---|---|
| ea-backend | enabled | default.target | always |
| ea-frontend | enabled | default.target | always |
| **ea-ai-service** | **enabled** | **default.target** | **always** |

Mais `Linger=yes` no usuário (é o que dispensa sudo e faz os serviços subirem no boot). E, para não
ficar só na configuração, o **caminho do boot foi simulado**: o serviço foi parado
(`is-active: failed`) e subiu sozinho ao acionar o `default.target`, respondendo 200. Ele também
aparece em `systemctl --user list-dependencies default.target`, que é o alvo que o boot dispara.

### 3. Conta de serviço institucional: identificada, aguardando confirmação

**(a) Busca.** No repositório **não existe** nenhuma conta de serviço de domínio configurada além da
atual: varredura de `.env`, `credentials.json`, documentação e código só devolve
`henrique.vieira@soulan.com.br`. O `sys@soulan.com.br` que aparece no código é **fixture de teste**
em dois specs do Pandapé, não é conta real.

**A candidata veio do próprio acervo, não de chute: `admin.soulan@soulan.com.br`.** É a **dona da
pasta-pai `1 - ATIVOS`** e a maior proprietária de prontuários da árvore (877 só no contrato
Temporário). É a conta que a operação já usa como institucional naquele Drive.

**(b) Verificação, somente leitura** (uma chamada `about().get()`, nada criado ou alterado):

| Conta | Delegação | Limite | Pode ser dona em My Drive |
|---|---|---|---|
| `henrique.vieira@` (atual) | funciona | 258.048 GB | SIM |
| **`admin.soulan@` (candidata)** | **funciona** | **258.048 GB** | **SIM** |

Ou seja: a delegação de domínio **já autoriza** personificá-la e ela **tem cota** (é o pool do
Workspace, o mesmo da conta pessoal). **O caminho é viável**, e é uma troca de uma linha de env.

**(c) NÃO foi aplicado, e não haverá teste em admissão de teste ainda.** A OST manda **reportar o
endereço ao diretor e esperar a confirmação ANTES de aplicar**, e trocar o `DRIVE_DELEGATED_SUBJECT`
para rodar o teste JÁ É aplicar. Então parei aqui. Confirmado o endereço, a sequência é: trocar o
subject, reiniciar o ai-service, arquivar **uma admissão de teste** e conferir que a pasta nasce com
a conta institucional como dona, e não com a pessoal.

**(d) Não se aplica:** a conta existe, tem cota e aceita delegação.

**RESSALVA, registrada como o diretor pediu:** trocar o subject **NÃO transfere as pastas já
criadas**. Tudo o que já existe continua com a conta pessoal do diretor como proprietária; a mudança
só vale para o que nascer depois. A transferência do acervo existente é **manual, pelo admin do
Workspace**. E vale lembrar que esta troca é a saída **paliativa**: ela tira a propriedade da pessoa
e a põe numa conta institucional, mas a propriedade continua numa caixa de e-mail. A saída definitiva
segue sendo a **Unidade Compartilhada**, onde o dono é a organização.

### Gate

- **Backend:** **448 testes verdes**. **ai-service:** **74 testes verdes**.
- **Credencial e `DRIVE_DELEGATED_SUBJECT`: NADA foi alterado.** Todas as checagens do item 3 foram
  somente-leitura.
- **Produção:** os três serviços sob systemd, `enabled`, com `Restart=always`. ai-service respondendo
  200 depois do `kill -9` e depois do start pelo `default.target`.

### Aberto ao fim desta entrega

- **Confirmação do endereço `admin.soulan@soulan.com.br`** pelo diretor, para então aplicar a troca e
  testar em admissão de teste.
- **Unidade Compartilhada** segue como a saída definitiva, com o admin do Workspace.
- **Transferência das pastas já criadas**: manual, pelo admin do Workspace.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, troca da identidade do Drive para conta institucional e marca de origem da pasta

Confirmado pelo diretor, aplicado e provado em produção. **`DRIVE_DELEGATED_SUBJECT` passou de
`henrique.vieira@soulan.com.br` para `admin.soulan@soulan.com.br`.**

> **REGISTRO OBRIGATÓRIO, pedido pelo diretor: esta medida é PALIATIVA.** Ela tira a propriedade da
> pessoa e a põe numa conta institucional, mas a propriedade continua numa **caixa de e-mail**. A
> saída definitiva segue sendo a **Unidade Compartilhada**, onde o dono é a organização.
> **E a troca NÃO transfere as pastas já criadas**: elas continuam com o diretor como dono, e a
> transferência do acervo existente é **manual, pelo admin do Workspace**.

### Bloco 1: a troca, provada ponta a ponta

O teste bate no **router de produção** (`POST /drive/arquivar`), com o serviço já rodando a
credencial nova. **Não criei admissão sintética no banco, de propósito**: a pasta-pai de uma admissão
real é resolvida pelo tipo de contrato e cai dentro da árvore VIVA do RH, então um teste por ali
deixaria lixo no acervo de verdade. Usei um prontuário de TESTE, com nome que se identifica como
lixo, exercitando exatamente o mesmo código, o mesmo Drive e a mesma credencial.

Resultado, lido do Drive depois do teste:

| Item | Dono |
|---|---|
| Pasta do prontuário de teste (criada ANTES da troca, pela credencial antiga) | `henrique.vieira@` |
| **Subpasta DOCUMENTOS PESSOAIS (criada pelo sistema DEPOIS da troca)** | **`admin.soulan@`** |
| **Arquivo enviado pelo sistema DEPOIS da troca** | **`admin.soulan@`** |

A pasta é criada, o arquivo sobe, e o **dono do que o sistema cria agora é a conta institucional**.

### Bloco 2: o risco principal, testado e DESCARTADO

A pergunta era: a conta nova enxerga e consegue escrever nas pastas que têm o diretor como dono? Se
não enxergasse, o reaproveitamento por nome quebraria e o sistema voltaria a **criar pasta
duplicada**, justamente o problema recém-fechado.

**Teste 1, leitura, contra as quatro pastas REAIS criadas pela credencial antiga** (as duas
destravadas por alvo hoje e as duas anteriores), com a identidade nova já ativa no serviço:

```
identidade em uso pelo serviço: admin.soulan@soulan.com.br
pasta-pai '1 - ATIVOS'  dono=admin.soulan@  canAddChildren=True

prontuario A/B/C/D (dono=henrique.vieira@):
   enxerga=SIM   canAddChildren=True   canEdit=True
   achada pela BUSCA POR NOME (mecanismo do reuso): SIM
RESULTADO: 4/4 reaproveitáveis pela identidade nova.
```

**Teste 2, escrita real, cruzando as identidades.** Criei uma pasta de prontuário de teste **com a
credencial antiga**, dentro da árvore real (representando as centenas que já existem com aquele
dono). Depois, o router, **já com a credencial nova**, recebeu um arquivamento com o MESMO nome de
pasta:

```
resposta do router (credencial NOVA):
{"pastaUrl": ".../1u9GNaSK...", "arquivados": 1, "ignorados": 0, "pastaJaExistia": true}

pastas com esse nome sob a árvore: 1   (uma só, sem duplicata)
```

**`pastaJaExistia: true` e uma única pasta.** A identidade nova reaproveitou a pasta do dono antigo e
escreveu dentro dela. **O risco está descartado**, e não por dedução: por escrita de verdade.

**Um defeito real apareceu no meio deste teste e foi corrigido.** A primeira tentativa devolveu
`502 Bad Gateway` e **nada mais**: o caminho que resolve a pasta do funcionário subia um 502 MUDO,
sem log e sem motivo. Era falha da minha montagem (eu tinha posto a pasta-pai de teste no My Drive
privado da conta antiga, que a conta nova não enxerga), mas a lição vale para produção: passou a
logar o motivo do Google e o id da pasta-pai, e a mensagem virou acionável. Reproduzindo depois da
correção:

```
Falha ao resolver a pasta do funcionário (notFound). parentFolderId=14Zitf...
Causa provável: a conta que o sistema usa não enxerga essa pasta-pai, ou o id está errado.
```

Esse é exatamente o erro que apareceria se alguém repontasse a árvore para um lugar sem acesso, e
agora ele se explica sozinho em vez de virar "502".

### Bloco 3: a pasta se identifica como criada pelo sistema

O Drive não deixa o AUTOR ser diferente de quem autenticou, então a identificação é gravada por nós.

- **Campo usado: `description` da pasta.** **Texto exato adotado:**
  **`Criada automaticamente pelo EA Automatic em DD/MM/AAAA.`**
  Conferido no Drive depois do teste: `'Criada automaticamente pelo EA Automatic em 23/07/2026.'`
- **O NOME não foi tocado**, decisão explícita do diretor. Além da preferência, há uma razão técnica
  que a reforça: o **nome é a chave do reaproveitamento** (`buscar_ou_criar_pasta` procura por nome
  antes de criar). Mexer nele reintroduziria a duplicação de pasta que acabou de ser fechada.
- **Só em pasta NOVA.** Reaproveitar pasta existente **não** reescreve descrição de ninguém, e nada é
  marcado retroativamente. Coberto por teste: pasta reutilizada não recebe nenhuma escrita.
- **Sobre marcar também os ARQUIVOS (proposta, NÃO aplicada).** O campo `description` existe igual em
  arquivo, então é tecnicamente trivial. **Recomendo NÃO fazer agora**, por dois motivos: o arquivo
  já herda o contexto da pasta que o contém, e a marca por arquivo multiplicaria a escrita por 15 ou
  20 por prontuário sem acrescentar informação nova. Se o diretor quiser mesmo assim, o texto natural
  seria `Enviado automaticamente pelo EA Automatic em DD/MM/AAAA.`, e é uma linha de código. **Fica
  como proposta, não foi aplicado.**

### Limpeza do teste

- **Pastas de teste do Drive**: as duas foram para a **LIXEIRA** (reversível, não é exclusão
  definitiva), cada uma pela mesma identidade que a criou. Conferência final: **0 pastas de teste
  ativas** no Drive.
- **Staging local de teste**: removida.
- **Nenhuma admissão de teste foi criada no banco**, então não há o que limpar lá.
- Vale a distinção: esse descarte foi feito por **script de teste, fora do produto**. O módulo do
  Drive do sistema **continua aditivo por contrato** (§A.6), sem nenhuma operação destrutiva.

### Gate

- **ai-service:** **77 testes verdes** (3 novos do Bloco 3: pasta nova recebe a marca, pasta
  reutilizada NÃO recebe, e o texto exato da marca).
- **Backend:** **448 testes verdes**.
- **Produção:** os três serviços `active` sob systemd, ai-service respondendo 200 já com a credencial
  nova. Backup do `.env` anterior guardado fora do repositório antes da troca.

### Aberto ao fim desta entrega

- **Unidade Compartilhada** continua sendo a saída definitiva, com o admin do Workspace. Esta troca é
  paliativa.
- **Transferência das pastas já criadas**: manual, pelo admin do Workspace. Tudo o que existe hoje
  segue com o diretor como dono.
- **Marca de origem nos ARQUIVOS**: proposta acima, aguardando decisão.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, OST permissão de menu por usuário

Feature nova, ponta a ponta. O diretor entra no cadastro de cada usuário e marca quais MENUS ele
acessa; ao logar, a barra lateral mostra só esses, e o backend barra o resto. Decisões já tomadas
(não reabertas): granularidade por MENU, por USUÁRIO, regra global, e MASTER/SUPER_ADMIN veem tudo
sempre. O desenho adota a recomendação que ficou registrada na correção do incidente da Liberação: a
unidade de permissão é a OPERAÇÃO, não a controller nem a tela.

### Bloco 1: levantamento

- **Menus do sistema (17):** operação (Início, Análise gerencial, Liberação, Nova admissão, Esteira,
  Não conformidades, Gerenciador, Gerador de kit) e administração (Clientes, Cargos, Escalas, Motivos
  de declínio, Tarifas, Régua documental, Regras do kit, Regras de auditoria, Usuários). Cada um com
  sua rota de tela.
- **Backend:** 24 controllers, 130 rotas; hoje 65 com `@Roles`, 65 sem, 11 `@Public`. Todos os
  `@Roles` usam `("MASTER","SUPER_ADMIN")`. O mapa completo controller para operação foi levantado e
  sustenta o modelo operação, permissão, menu.
- **Usuários hoje:** 1 COMUM ativo, 3 MASTER, 4 SUPER_ADMIN (8 ativos).
- **CENTRAFIN (repo do diretor, Firebase):** avaliado. O modelo é **diretamente aproveitável**, a
  stack não. Lá o usuário tem um campo `menus_permitidos`, existe uma função `hasMenu(menu)` que
  libera `master OU super_admin OU menu na lista`, e a permissão é dupla: esconde no front
  (`sidebar.js` remove os `[data-menu]` não permitidos) E barra no servidor (regras do Firestore com
  `hasMenu`). Adotei os TRÊS princípios (campo por usuário, bypass de admin, dupla checagem
  front e backend); o enforcement virou um guard NestJS em vez de regra Firestore, porque a stack é
  outra. Nada de código reaproveitado, o padrão sim.

### Bloco 2: modelo de permissão (operação como unidade)

- **Catálogo de MENUS em TABELA COM SEED** (`menus`), no mesmo padrão do `frente_status_catalogo`:
  seed por `onConflictDoUpdate` a partir do registro em código (`domain/menus.ts`), então a tela de
  configuração e o `/auth/me` leem da tabela (fonte de verdade). Menu novo aparece na configuração
  rodando `db:seed:menus`, sem sair código novo para a tela.
- **Associação USUÁRIO x MENU** persistida (`usuario_menus`, PK composta, FKs com cascade). Ausência
  de linha significa "sem o menu".
- **Checagem por OPERAÇÃO, não por controller nem por tela.** Cada menu declara as operações que
  libera como `Controller.handler` (`Controller.*` reivindica a controller inteira). O guard resolve
  a operação pedida por `getClass().name` mais `getHandler().name` (estável, sem parsear rota) e checa
  se o usuário tem o menu que a governa. Operação não reivindicada por menu nenhum é ABERTA, o mesmo
  default do `@Roles`.
- **A régua já estabelecida foi preservada e os testes de regressão foram mantidos** (evoluídos, não
  descartados): LER catálogo continua aberto a qualquer autenticado, NENHUMA controller voltou a ter
  `@Roles` em classe. O que mudou é só o ENFORCER da escrita nas telas administrativas: de `@Roles`
  de método ou classe para o MENU. O `rbac-catalogos.spec` foi reescrito para travar o novo invariante
  (classe sem `@Roles`, escrita reivindicada por menu, leitura de lista aberta); o `rbac-exclusao.spec`
  foi dividido (rotas que seguem `@Roles` admin x rotas destrutivas que passaram ao menu), provando o
  MESMO DoD ("COMUM não exclui") nos dois enforcers.

### Bloco 3: a permissão vale no BACKEND, não só no menu

- **Guard central único** (`MenuGuard`, global, depois do `RolesGuard`). Regra, na ordem: `@Public`
  passa; sem usuário passa (o JwtAuthGuard já barrou); **MASTER/SUPER_ADMIN bypass total** (sem tocar
  o banco); operação **não reivindicada** passa (leitura aberta); operação reivindicada exige o menu,
  senão **403**. Só consulta o banco no último caso (operação gated mais não-admin), então rota aberta
  e requisição de admin não pagam query.
- **Cobertura das 130+ rotas, classificada e reportada** (a OST pediu explicitamente): **71
  governadas por MENU**, **14 sob `@Roles` admin** (excluir admissão, ações restritas de liberação e
  NC, gestão de usuários e a própria configuração de menus), **14 públicas** (`@Public`: auth, health,
  webhooks, ticks internos, VT) e **34 ABERTAS a qualquer autenticado**. As 34 abertas são **todas
  leitura ou trabalho compartilhado** (GETs de catálogo, listas e detalhes lidos por várias telas):
  fechá-las recriaria exatamente a fragilidade que derrubou a Liberação, então ficam abertas POR
  DESIGN, que é a régua "ler é trabalho". **Nenhuma rota sensível ficou sem cobertura.**
  - *Duas mutações seguem abertas e isso é PRÉ-EXISTENTE, não regressão desta OST:*
    `ClicksignController.reenviarCorrecao` e `KitController.gerar` (F9) já eram abertas (sem `@Roles`)
    antes daqui; não foram tocadas. Registro para o diretor decidir se entram em algum menu no futuro.
- **Política de gating por tipo de tela, declarada:** telas ADMINISTRATIVAS (dedicadas, não
  compartilhadas) são gated por completo, leitura inclusive; telas OPERACIONAIS têm as MUTAÇÕES
  gated e as LEITURAS abertas (dado de trabalho). Assim o backend barra o que importa (agir) sem
  reintroduzir a fragilidade de leitura compartilhada, e o guard de rota do front cobre o "digitar a
  URL" no nível de navegação.

### Bloco 4: tela de configuração

- No cadastro e edição do usuário, um botão por linha abre o **modal de configuração de menus**
  (`ConfigMenusModal`): lista os menus do catálogo (lidos da tabela) agrupados por Operação e
  Administração, com marcação, e salva a associação.
- **Deixa claro na tela** que MASTER/SUPER_ADMIN não dependem de marcação (aviso explícito quando o
  usuário editado é admin).
- **A tela de configuração é ela própria restrita a MASTER/SUPER_ADMIN:** vive na controller de
  Usuários, que segue com `@Roles("MASTER","SUPER_ADMIN")` em classe (não foi tocada). Por isso o
  menu "usuarios" NÃO é reivindicável por um COMUM (seria escalonamento de privilégio: um não-admin
  configurando os próprios menus), e o guard bate isso (fail-closed).

### Bloco 5: migração SEM RUPTURA (trava crítica)

Ninguém pode perder acesso do dia para a noite. A garantia é **grandfather por dado, sensível ao
papel**: no seed, todo usuário ATIVO que ainda não tem NENHUMA linha em `usuario_menus` recebe
EXATAMENTE o que o papel dele enxergava hoje. COMUM recebe os menus de OPERAÇÃO (sem Administração e
sem Gerador de kit, que a sidebar já mostrava só para admin); admin recebe todos.

O ponto fino, e o erro que evitei: **dar "todos os menus" a um COMUM seria ESCALONAR privilégio**, ele
passaria a ver a Administração que não via. Por isso o grandfather reproduz o acesso papel a papel, e
há teste travando que `codigosGrandfather("COMUM")` é estritamente menor que o conjunto total.

**Idempotente e não destrutivo:** o grandfather só cobre quem NUNCA foi tocado; rodar de novo não
reverte quem o diretor já configurou. Usuário NOVO nasce sem menu (least privilege) e é configurado
na criação.

**Provado com o usuário COMUM REAL** (`henrique.vieira.corporativo@gmail.com`): antes do seed tinha
0 linhas; depois recebeu **exatamente** `analise, esteira, gerenciador, inicio, liberacao,
nao-conformidades, nova`, os 7 operacionais, **sem** administração e **sem** gerador de kit. É
idêntico ao que ele via ontem: mesmo menu, antes e depois.

### Bloco 6: prova

Usuário COMUM de teste com **apenas 2 menus** (`regras`, `regua`), provado via HTTP contra o backend
de produção:
- **`/auth/me`** devolveu `menus: {todos:false, codigos:['regras','regua']}`.
- **(b) barrado pelo BACKEND** (403), não só escondido no front, ao "digitar a URL" de tela não
  liberada: escrever em Clientes (403), Cargos (403), mudar status na Esteira (403), editar no
  Gerenciador (403), listar Usuários (403).
- **(c) as 2 telas liberadas funcionam** (200): GET Regras de auditoria, GET Tipos de documento (a
  Régua governa), e a **leitura de catálogo segue aberta** (GET clientes 200, GET escalas 200), então
  as telas dele carregam os dados de trabalho de que precisam.
- **MASTER/SUPER_ADMIN veem tudo** (bypass): um SUPER_ADMIN de teste com **ZERO linhas** de menu
  retornou `todos:true` no `/auth/me` e passou 200 em Clientes, Usuários e no catálogo de menus.
- **Bloco 5** provado no usuário COMUM real (acima).
- **Gate:** backend **466 testes verdes** (20 novos: registro e mapa de menus, guard, e os dois specs
  de regressão evoluídos), frontend **41 verdes** (3 novos, do guard de rota). Typecheck limpo.
  Lint com os 2 erros PRÉ-EXISTENTES de sempre (`nova/page.tsx`, `vt/page.tsx`).

### Frontend

- `auth-context` carrega os menus do `/auth/me` e expõe `temMenu(codigo)` (admin sempre true).
- **Sidebar** mostra só os menus permitidos; o card "Menu Gerencial" aparece para admin OU para quem
  tem algum menu administrativo (a consultora de auditoria com Regras mais Régua). O Gerador de kit
  deixou de depender de `isAdmin` e passou ao menu `gerador-kit`.
- **Menu Gerencial** filtra os cards por menu.
- **Guard de rota** no layout do app (`menu-rotas.ts`): digitar a URL de uma tela não liberada
  redireciona ao início (o backend já barra as operações; isto evita a tela morta).
- **AdminLayout** deixou de ser exclusivo de admin: entra quem tem algum menu administrativo.

### Migração e publicação

- Migration `0036_menus_permissao` (tabelas `menus` e `usuario_menus`) aplicada. `db:seed:menus`
  convergiu os 17 menus e fez o grandfather (8 usuários, sensível ao papel). Backend e frontend
  rebuildados e reiniciados; `/api/health` 200, `/login` 200.

### Aberto ao fim desta entrega

- **PROVA VISUAL (§A.13) automatizada NÃO rodou neste ambiente:** o chromium do harness exige libs de
  sistema (`libatk-1.0.so.0` e afins) ausentes e não há `sudo` para instalá-las. O comportamento está
  **integralmente provado no nível de API** (Bloco 6), e a renderização da tela deriva
  deterministicamente desses dados (`temMenu`), mas os screenshots em si não foram capturados aqui. A
  OST define a validação visual como passo do diretor **em produção**, e é onde ela deve ocorrer: o
  Rike loga como um usuário restrito e confere a barra lateral e o modal de configuração. Fica
  registrado com franqueza que este passo não foi executado pela fábrica nesta sessão.
- **Duas mutações abertas pré-existentes** (`reenviarCorrecao`, `kit.gerar`): decidir se entram em
  algum menu.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, dois itens em paralelo: 500 ao Auditar (corrigido) e diagnóstico Willden (o mesmo bug)

### Item 1: "Internal server error" ao clicar em Auditar, CORRIGIDO

**A causa real por trás do 500 genérico.** O log tinha o erro cru, escondido pelo 500:

```
ERROR [ExceptionsHandler] TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type
string or an instance of Buffer or ArrayBuffer. Received an instance of Date
   ... postgres.js Bind ...
```

**28 ocorrências hoje.** É um defeito MEU, introduzido na OST do motivo verdadeiro (Bloco 5, marcador
de tempo parado). Para preservar o carimbo de um documento já em `AGUARDANDO_AUDITORIA`, escrevi o
upsert de coleta com uma expressão condicional:

```
atualizadoEm: sql`case when ${...estado} = ${AGUARDANDO} then ${...atualizadoEm} else ${agora} end`
```

O `${agora}` é um `Date` do JS interpolado CRU dentro do template `sql` do drizzle. Fora de um
`.set({ coluna: date })` normal, o drizzle não conhece o tipo da coluna ali dentro do template e
repassa o Date direto ao postgres.js, que não sabe serializá-lo, e estoura. Como esse upsert roda
para TODO documento AUDITÁVEL antes da chamada de IA, **todo "Auditar" de documento válido caía com
500.**

**Correção (óbvia e de baixo risco, aplicada):** trocar o `${agora}` do JS por `now()` do SQL. Resolve
no banco, não passa parâmetro nenhum, e o `${AGUARDANDO_AUDITORIA}` que sobra é string, que o
postgres.js serializa sem problema. Uma linha.

**Por qual entrega começou:** a OST do **motivo verdadeiro** (o `sql case` foi adicionado ali,
~12h de hoje). **NÃO** foi a troca do `DRIVE_DELEGATED_SUBJECT** (suspeita do item 4, DESCARTADA): o
erro é serialização de um Date pelo postgres, não tem nada com Drive nem com credencial. A extração do
`aplicarPosVeredito`, a triagem por magic bytes e a classificação por família também estão inocentes.

**Por que passou pelas minhas provas anteriores (lição honesta):** os testes unitários mockam o banco,
então não exercitam a serialização real do postgres. E minhas provas ao vivo do motivo verdadeiro
usaram o ramo da TRIAGEM (arquivo de texto reprovado, que PULA esse upsert) e o pós-veredito do
rearquivamento, nunca uma auditoria limpa de documento VÁLIDO passando pelo upsert. O caminho quebrado
ficou no ponto cego dos meus testes.

**Provado ao vivo, antes e depois:** reauditar o mesmo documento (CERTIDAO_NASC_CASAMENTO de uma
admissão real com staging), que passa pelo MESMO núcleo `auditarConjunto`:
- antes do fix: **HTTP 500** (log: "Received an instance of Date");
- depois do fix: **HTTP 201**, `resultado: VALIDADO, estado: ENTREGUE`, sem erro no log.

*Nota do item 6 (não devolver 500 genérico): este 500 era um DEFEITO de código, não uma falha de
domínio. O certo é remover o defeito, e é o que foi feito. Não pus um `catch` genérico por cima: isso
mascararia o próximo bug de banco, o oposto do princípio de trazer o motivo real à tela. As falhas de
domínio da auditoria (quota, entrada, indisponibilidade) já têm família e motivo próprios.*

**Gate:** backend 466 testes verdes, typecheck limpo. Backend rebuildado e reiniciado; `/api/health`
200. Provado ao vivo (201).

### Item 2: diagnóstico Willden John Lopes de Aguiar (SÓ diagnóstico, nada corrigido nem reprocessado)

**É o MESMO bug do Item 1**, com um alcance muito maior do que o clique manual: o Date derrubou também
a INGESTÃO de documentos do Pandapé. Os 5 pontos:

1. **Origem: PANDAPÉ.** `id_precollaborator=400814`, `id_match=780554653`, `id_vacancy=3528798`.
   Existe acervo no Pandapé, então "não veio" NÃO é o esperado, é falha.
2. **Veio do Pandapé:**
   a) **Liberada? SIM** (tem `cod_cliente=54792` e `cargo`, contrato Fopag). Sem liberação não há pull,
      e o pull rodou.
   b) **Pull chamado? SIM.** O idPreCollaborator 400814 aparece no log, com pulls às 12:57 e 13:17.
   c) **Pandapé TEM documento? SIM.** O pull BAIXOU **13 arquivos** para a staging (CPF x4, RG x2,
      CNH, Comprovantes, Certidão, Dados bancários, Foto, Título). O candidato anexou de verdade.
   d) **Onde parou:** em `auditarConjunto`, no **mesmo upsert do Item 1**. O log é explícito, uma vez
      por documento: `Documento coletado do Pandapé mas auditoria falhou ... Received an instance of
      Date`. O upsert de coleta estourou ANTES de gravar qualquer estado, então nada foi persistido
      em `documentos_admissao` e nenhuma marca de dedup foi escrita. Os 13 arquivos ficaram só no
      disco (staging).
3. **Estado atual:** farol `EM_ADMISSAO`, sinalizador `PARCIAL`, AUDITORIA `ANALISE_PENDENTE`
   (não concluída). Régua: **7 obrigatórios, TODOS PENDENTE**. **Nada em AGUARDANDO_AUDITORIA nem em
   INCONFORME**, e isso é diagnóstico, não acaso: o estado `AGUARDANDO_AUDITORIA` é gravado por
   aquele mesmo upsert que estourou, então ele nunca chegou a ser escrito.
4. **Marcas de dedup: 0**, com 13 arquivos na staging. É exatamente a assinatura de "coleta perdida no
   caminho" que a OST descreve: baixou, mas não gravou. *Observação: o log dizia "fica
   AGUARDANDO_AUDITORIA, nada perdido", e essa mensagem passou a MENTIR por causa do bug, a rede de
   segurança (gravar a coleta ANTES da IA) era justamente o upsert que quebrou.*
5. **É PADRÃO, não isolado.** Contei as admissões VIVAS de origem Pandapé sem nenhuma marca de dedup:
   **16 em `EM_ADMISSAO`**. Dessas, **3 ainda têm staging local** (as demais provavelmente tiveram a
   staging expurgada pelo TTL de 48h ou o pull nem baixou). O log registra **10 falhas** de auditoria
   por Date no pull só de hoje. Ou seja: **o bug do Item 1 quebrou a ingestão de documentos do Pandapé
   para todo candidato puxado desde o deploy do motivo verdadeiro (~12:57 de hoje)**, não só o clique
   manual. Willden é um caso, não o único.

**Recorte para a decisão do diretor (nada foi feito):**
- O **fix do Item 1 já está no ar**, então **pulls NOVOS voltam a gravar normalmente**.
- As admissões **já afetadas** (Willden e as demais) precisam de **reprocessamento** para recuperar:
  reauditar (onde a staging ainda existe, ex.: Willden com 13 arquivos) ou re-pull do Pandapé (onde a
  staging já foi expurgada, o acervo do Pandapé é a fonte). **Isso é o "reprocessar" que a OST proíbe
  sem aval**, então parei aqui e aguardo. Não destravei, não reauditei, não re-puxei.

### Aberto

- **UNDEFINED_VALUE** (`Undefined values are not allowed`), postgres: **1 ocorrência** às 17:50:01, que
  NÃO reproduziu no fluxo de auditoria corrigido (o reauditar de prova voltou 201 limpo). Fica como
  evento único a observar; se reaparecer, o log agora mostra a query. Não é o 500 do Auditar (aquele
  era o Date, 28x).
- **Reprocessamento das 16 admissões Pandapé afetadas**: aguardando aval do diretor (Item 2 é só
  diagnóstico).
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, reprocessamento do bug do Date, FASE 1 (staging local, 3 admissões)

Autorizado o reprocessamento das admissões afetadas pelo bug do Date, em duas fases. **Esta é a Fase
1**, feita e reportada; **parei antes da Fase 2** (aguardando o OK).

**Confirmação pedida antes de começar:** o fix do Date está no binário de produção
(`else now() end`, sem `${agora}` no `case`), o serviço está no ar desde 18:19 (restart pós-fix), e
uma auditoria limpa de documento válido foi provada ponta a ponta (reauditar de um CERTIDAO válido,
que era o caminho do ponto cego, voltou **201 VALIDADO**, `estado: ENTREGUE`, sem erro no log).

**Como foi feito.** Runner `db/reprocessa-date-bug.ts`, que chama o `ReauditoriaService.reauditar`, o
MESMO caminho da tela, lendo da STAGING local (sem re-baixar do Pandapé). As travas do diretor foram
implementadas no runner, não só confiadas ao serviço:
- **só as admissões-alvo** (lista obrigatória por `--ids`);
- **não sobrescreve validação humana:** o runner só processa tipos em estado PENDENTE, então um
  documento validado à mão (não-pendente) nem entra na lista, e o `reauditar` ainda tem o guard
  próprio de precedência humana como segunda barreira;
- **idempotência:** processa só tipo PENDENTE com staging; rodar de novo achou **0** a fazer, prova
  de que não re-audita o que já ficou com veredito;
- **quota:** o runner para no primeiro erro de família QUOTA. Não houve nenhum.

### Antes e depois

| Admissão | Antes | Depois |
|---|---|---|
| Willden (`917ad067`) | 0 documentos gravados, 0 marcas de dedup | **9 auditados: 7 ENTREGUE, 2 INCONFORME**, **11 marcas** |
| `f88796b0` | 0 gravados, 0 marcas | **1 ENTREGUE (CPF)**, **2 marcas** |
| `a2a56340` | 9 já com veredito + 1 validação humana, 0 marcas | **inalterado** (todos os tipos da staging já tinham veredito, pulado; validação humana preservada) |

**Willden recuperado por inteiro:** os 9 tipos que o candidato anexou foram auditados. Os 2 que
sobraram PENDENTE são tipos que **não estão na staging** (o candidato não enviou), então não há o que
recuperar, é o estado correto. Os 2 INCONFORME são **vereditos reais da IA**, não falhas: "Tipo de
conta não identificado" (Dados bancários) e "Nome no documento não coincide com o cadastro" (CPF).
Trabalho de verdade para o consultor, que agora aparece na tela, em vez de sumir.

**`a2a56340` não precisou de recuperação, e isso corrige uma imprecisão do meu diagnóstico de
ontem.** Eu contei "16 afetadas" pelo heurístico "origem Pandapé e 0 marcas de dedup". Só que
`a2a56340` tem **0 marcas mas os documentos JÁ estão gravados com veredito** (8 ENTREGUE, 1
INCONFORME) e uma validação humana, provavelmente processada por outro caminho. Ou seja: **0 marcas
NÃO é o mesmo que documento perdido**. O sinal preciso de "coleta perdida pelo bug" é documento
PENDENTE com arquivo na staging, não a ausência de marca. Isto muda o recorte da Fase 2 (abaixo).

### Verificação

- **Zero** ocorrências de "Received an instance of Date" e **zero** de quota no processo do runner.
- Serviço de produção intacto (o runner roda em processo separado): `/api/health` 200.
- Nenhuma admissão fora das 3 foi tocada; a validação humana de `a2a56340` está preservada.

### Recorte da Fase 2 (a informar melhor antes de rodar, aguardando OK)

A Fase 2 seriam "as 13 restantes com re-pull". Mas o achado do `a2a56340` avisa que o número **13**
vem de um heurístico que superconta: parte das 16 pode já ter documentos gravados e não ser vítima do
bug. **Antes de rodar a Fase 2**, como o diretor pediu, vou: (1) recontar usando o sinal correto
(admissões Pandapé vivas com documentos obrigatórios PENDENTE e SEM staging local), (2) consultar a
v3 do Pandapé (leitura pura) para dizer quantas ainda têm acervo disponível, e (3) estimar o custo em
chamadas de IA. Isso só depois do seu OK sobre a Fase 1.

### Aberto

- **Fase 2 aguardando OK.**
- **`a2a56340` com 0 marcas de dedup** apesar de ter vereditos: é inofensivo (documentos gravados),
  mas o pull automático pode re-baixar por não achar marca. Não toquei. Registro para decidir se vale
  gravar as marcas retroativas (fora do escopo desta fase).
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, reprocessamento do bug do Date, LEVANTAMENTO da FASE 2 (nada executado)

Autorizado só o LEVANTAMENTO. Consultei a v3 do Pandapé em LEITURA PURA (nenhuma gravação, nenhum
download para staging). Números abaixo; a execução aguarda o OK.

### Correção do heurístico (importante para a futura TELA DE DIAGNÓSTICO)

**"0 marcas de dedup" NÃO implica "documento perdido".** A Fase 1 provou isso com o `a2a56340`: 0
marcas, mas os documentos estavam gravados com veredito e havia validação humana. Se a tela de
diagnóstico usar "0 marcas" como sinal de perda, vai reportar FALSO POSITIVO. **O sinal correto de
coleta perdida pelo bug é: documento em estado PENDENTE COM arquivo na staging** (recebeu o arquivo,
não gravou veredito). Onde a staging já expirou, o único jeito de confirmar perda é comparar com o
acervo da v3 do Pandapé. A tela de diagnóstico precisa desses dois sinais, não do contador de marcas.

### O quadro real, recontado com o sinal certo

Universo: **43** admissões VIVAS de origem Pandapé. Destas, 33 têm ao menos um obrigatório PENDENTE,
mas "PENDENTE" sozinho mistura vítima do bug com candidato que simplesmente não anexou. Separando pelo
sinal preciso:

**1. REAUDITÁVEIS (staging local ainda viva):** documento PENDENTE com arquivo na staging.
- **14 admissões, 22 documentos.** (Willden e a `f88796b0` da Fase 1 saíram da conta, já recuperadas.)
- Recuperáveis SEM tocar o Pandapé: é só reauditar da staging, o mesmo caminho da Fase 1.

**2. RE-PULL (staging expirada), consultado na v3:** 13 candidatas (Pandapé viva, obrigatório
PENDENTE, sem staging). A leitura da v3 mostrou:
- **3 admissões AINDA TÊM acervo no Pandapé** (idPre 399949 com 15 arquivos, 400202 com 17, 400972
  com 10): **42 arquivos** recuperáveis por re-pull.
- **10 admissões estão SEM acervo (0 arquivos na v3):** re-pull não recupera nada. Quase certamente
  NÃO são vítimas do bug, são candidatos que não anexaram o obrigatório (o "não veio é o esperado" do
  diagnóstico). Ficam de fora.

### Custo em IA e risco de quota

Cada documento (conjunto) é UMA chamada de IA. Se a Fase 2 rodar por inteiro:
- reauditáveis: **22 chamadas**;
- re-pull das 3 com acervo: cerca de **7 a 9 tipos mapeados por admissão**, algo como **21 a 25
  chamadas** (os 42 arquivos incluem VT e formulários não mapeados, que são pulados sem gastar IA);
- **total estimado: ~43 a 47 chamadas de IA.**

**Risco de quota REAL.** O 429 do Vertex aparece por volta de **10 chamadas sequenciais na mesma
janela**, então 43+ chamadas em sequência estouram a quota com folga. Recomendação para a execução
(quando autorizada):
- **Re-pull:** rodar pelo worker BullMQ do próprio pull, que já tem espaçamento e backoff sob o teto
  (foi desenhado para o rate limit do Pandapé e absorve o do Vertex junto). É o caminho seguro.
- **Reaudição:** o runner da Fase 1 NÃO tem espaçamento; para 22 chamadas eu adicionaria uma pausa
  entre elas (ou as processaria em lotes de ~8 com intervalo), e o runner já PARA no primeiro 429 e
  reporta, então no pior caso ele para sozinho sem estourar nada.

### Recomendação de recorte para a Fase 2

- **Reauditar as 14/22** (staging viva): barato e sem dependência externa. Sugiro fazer primeiro, em
  lotes com pausa.
- **Re-pull só das 3 com acervo confirmado** (42 arquivos), pelo worker rate-limited.
- **Descartar as 10 sem acervo:** não há o que recuperar; se forem obrigatórios não enviados, viram
  pendência normal da esteira, não caso do bug.

### Travas para a execução (quando houver OK)

Só as admissões desta lista; idempotência pela dedup e pelo gate "só PENDENTE com staging"; validação
humana intocável; PARAR no primeiro 429 e reportar.

### Aberto

- **Execução da Fase 2 aguardando o OK sobre estes números.**
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, diagnóstico: pasta do Willden não criada no Drive (gap de mapeamento Fopag, não bug)

Só diagnóstico, nada reprocessado. A resposta não é a suposição do item 1 (régua não fechou): a
régua FECHOU. É o item 3 (falha), mas uma falha benigna e conhecida, não defeito de código.

### 1. A régua FECHOU (sim, depois do trabalho manual do diretor)

Os 7 obrigatórios aplicáveis estão TODOS `ENTREGUE`, e a AUDITORIA foi a `ANALISE_OK` (concluída) às
19:09:58. O que mudou desde a Fase 1: o diretor tratou em produção os pendentes entre 19:02 e 19:10.
Pela trilha (`atualizado_em`, sem PII):
- **CPF**: estava INCONFORME ("nome não coincide"), foi **reauditado** e virou ENTREGUE às 19:02:43;
- **DADOS_BANCARIOS** (era INCONFORME), **CTPS** e **RESERVISTA** (eram os que faltavam): **validados
  à mão** às 19:09 e 19:10.

Então a suposição do item 1 está desatualizada: **não é o caso de "não criar pasta é o correto"**, a
régua fechou de verdade.

### 3. É falha, e a causa é NOVA (e é insumo, não código)

O log é explícito, e NÃO é erro do Google:

```
19:09:58 WARN [AuditoriaService] Arquivamento ignorado: sem pasta-pai do Drive para
                                 contrato/cliente da admissão 917ad067...
19:10:09 WARN [AuditoriaService] Arquivamento ignorado: sem pasta-pai ... (o mesmo, na última
                                 validação que fechou a régua)
```

a) **`arquivarNoDrive` FOI chamado** e saiu logo no começo: `resolvePastaPaiId(tipoContrato,
   codCliente)` devolveu `null`. **Não houve chamada nenhuma a `/drive/arquivar`** (nada no log da
   janela), então não há "erro do Google" a trazer, porque o Google nem foi tocado.
b) **`drive_pasta_url` NULA:** sim.
c) **Staging viva:** sim, 27 arquivos (a Fase 1 os coletou e o expurgo só roda após arquivar).
d) **NÃO é a Maria Clara** (403 `parentNotAFolder`) nem a **Maria Isabelle** (exceção lendo a
   staging). É **causa NOVA: falta a pasta-pai do Drive para o par (Fopag + cliente 54792).**
   Willden é contrato **Fopag**, e o Fopag resolve a pasta-pai POR `cod_cliente`; o mapa
   (`FOPAG_FALLBACK`: 16, 19, 27, 28, 29, 33, 34, 44) **não tem o 54792**, e não há env
   `DRIVE_FOPAG_54792_FOLDER_ID`. É exatamente o comportamento que o próprio `drive-routing.ts`
   documenta: "contrato/cliente não mapeado → null → a Auditoria NÃO arquiva e mantém a staging viva".
   Ou seja: **está funcionando como desenhado, esperando o insumo.**
e) **A troca do `DRIVE_DELEGATED_SUBJECT` NÃO tem relação, confirmado:** o código parou em
   `resolvePastaPaiId` e nunca chegou à API do Drive, então a credencial nem entrou em jogo. (O
   caminho real com a credencial nova segue provado no teste `ZZ TESTE` da OST anterior; só ainda não
   houve um arquivamento real de admissão com contrato/cliente MAPEADO para exercê-lo em produção.)

### 4. Medição: é ISOLADO

Admissões VIVAS (EM_ADMISSAO/BANCO_AGUARDAR, excluído o histórico ADMISSAO_CONCLUIDA) com régua
obrigatória FECHADA e `drive_pasta_url` nula: **1**, e é o Willden. Só ele.

Verificação proativa do alcance do gap: entre as admissões Fopag VIVAS, há **1 único cliente sem
mapeamento, o 54792** (o do Willden). Os demais contratos (Temporário, Terceirizado, Estágio, Interno,
Jovem Aprendiz) resolvem a pasta-pai por TIPO de contrato, todos mapeados; só o Fopag resolve por
cliente, então só o Fopag tem esse tipo de lacuna, e hoje ela é de um cliente só.

### O que resolve (ação do diretor, NÃO feita)

A fábrica **não inventa id de pasta** (§A.14). Para o Willden arquivar, o diretor precisa fornecer o
**id da pasta-pai do Drive do cliente 54792 no contrato Fopag**, que entra como
`DRIVE_FOPAG_54792_FOLDER_ID` no `.env` do backend (ou na tabela de mapa). Feito isso, basta um
disparo (qualquer evento de documento, ou o runner `db:rearquiva-drive --admissao=917ad067...`) para
criar a pasta e subir os documentos, com a staging ainda viva. Sem o id, o certo é continuar não
arquivando (não há para onde).

### Aberto

- **Insumo pendente do diretor:** id da pasta-pai Fopag do cliente 54792.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, insumo do cliente 54792 (Fopag) e arquivamento do Willden no Drive

O diretor forneceu a pasta-pai do Drive do cliente 54792 no contrato Fopag
(id `1fuifnIMbwo6tmH8YEc6-0l52T-RAtqrS`). Configurado, validado e o Willden arquivado por alvo.

### 1. Configuração

`DRIVE_FOPAG_54792_FOLDER_ID=1fuifnIMbwo6tmH8YEc6-0l52T-RAtqrS` no `.env` do backend (o mesmo
mecanismo de override que o `drive-routing.ts` já lê, com precedência sobre o mapa em código). Backup
do `.env` anterior guardado fora do repositório antes da mudança. Backend rebuildado e reiniciado
para a rota automática também passar a enxergar o cliente.

### 2. Validação da pasta ANTES de arquivar (leitura pura)

Com a credencial em uso (`admin.soulan@`), o `files().get` do id confirmou, sem escrever nada:

| Checagem | Resultado |
|---|---|
| Existe | sim |
| É PASTA (não arquivo, o que derrubou a Maria Clara com `parentNotAFolder`) | **sim** (`mimeType` folder) |
| Na lixeira | não |
| Dono | `admin.soulan@` |
| `canAddChildren` | **True** |

Veredito: OK para arquivar. Se qualquer uma falhasse, o passo 3 não teria rodado.

### 3. Arquivamento do Willden (`917ad067`), por alvo

Antes: `drive_pasta_url` NULA, 27 arquivos na staging viva. Rodado `db:rearquiva-drive --admissao=...`
(o mesmo caminho de produção, `aplicarPosVeredito`). Depois:

| | Resultado |
|---|---|
| Pasta | **CRIADA nova** (reutilizada=não), dentro da pasta-pai `1fuif...` (parent confirmado) |
| Enviados | **12** |
| Ignorados por md5 idêntico | **15** (a staging tinha as cópias por auditoria; a dedup por conteúdo cortou) |
| `drive_pasta_url` | gravada (`.../folders/1u0BOTCqNafiuYFBygI64qDhP0LuMq0YH`) |
| Staging | **expurgada** (0 arquivos) |
| `description` da pasta | **"Criada automaticamente pelo EA Automatic em 23/07/2026."** presente |

**PRIMEIRO arquivamento REAL em produção depois da troca do `DRIVE_DELEGATED_SUBJECT`, confirmado
ponta a ponta:** o **DONO** da pasta do prontuário, da subpasta DOCUMENTOS PESSOAIS e dos 12 arquivos
é **`admin.soulan@soulan.com.br`**, não a conta pessoal do diretor. A troca de identidade está valendo
no caminho real, não só no teste `ZZ TESTE` da OST anterior. E a dedup por md5 do Bloco 3 daquela OST
operou de novo em produção: 15 cópias evitadas.

Só o Willden foi tocado. Nenhuma outra admissão.

### 5. Prevenção (proposta, NÃO implementada)

Hoje um cliente Fopag NOVO cai nessa lacuna em **silêncio**: o arquivamento é ignorado com um
`WARN [AuditoriaService] Arquivamento ignorado: sem pasta-pai` e ninguém é avisado. O diretor
descobriu este caso por reclamação da operação, que é tarde demais. Duas camadas propostas, da mais
barata para a mais completa:

- **Barato, para JÁ (recomendado como primeiro passo):** transformar aquele `WARN` silencioso em
  sinal ATIVO. Dois candidatos: (a) um AVISO na aba Auditoria da admissão quando a régua fechou mas
  não há pasta-pai mapeada (o back já sabe o motivo: `resolvePastaPaiId` devolveu null), no mesmo
  molde do aviso de falha de arquivamento que já existe; e (b) um LOG em nível ERROR, não WARN, com
  o par (contrato, cod_cliente) sem PII, para o motivo aparecer em qualquer varredura de log. A (a)
  fecha o buraco de "ninguém é avisado" sem esperar tela nova.
- **Completo, a TELA DE DIAGNÓSTICO** (já mapeada): "admissões VIVAS com régua fechada e sem pasta no
  Drive", com o submotivo "sem pasta-pai mapeada para (contrato, cliente)". É o lar natural disto,
  junto com o marcador de auditoria parada e o `resumirParados` que já ficou pronto. O sinal aqui é
  preciso (régua fechada + `drive_pasta_url` nula + `resolvePastaPaiId` null), não o heurístico de
  marcas que já foi corrigido.

Recomendação: fazer o aviso barato (a) agora, e deixar a tela de diagnóstico consolidar depois. Como
é fora do escopo desta OST, não implementei; fica registrado para o diretor priorizar.

### Aberto

- **Aviso ativo de "sem pasta-pai mapeada"**: proposto acima, aguardando o diretor decidir entre o
  barato agora e a tela de diagnóstico.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, nome do prontuário do Drive em CAIXA ALTA

Decisão do diretor: a pasta do prontuário passa a nascer com o **nome do candidato em CAIXA ALTA**
(padrão antigo era "{nome} {separador} {operação}", com o separador de nome de pasta atual). O risco
crítico apontado, quebrar o reaproveitamento e
voltar a duplicar pasta, foi VERIFICADO antes de aplicar e NÃO se concretiza.

### 1. Como a busca compara o nome hoje, e o achado decisivo

A busca de pasta (`_pastas_com_nome`) usa a query do Drive `name = 'X'`. **Testei ao vivo se ela é
sensível à caixa**, na pasta REAL do Willden (criada no padrão antigo), sem imprimir o nome:

| Consulta | Pastas encontradas |
|---|---|
| nome EXATO (caixa original) | 1 |
| mesmo nome em MAIÚSCULO | **1 (a MESMA pasta)** |
| mesmo nome em minúsculo | 1 (a mesma) |

**A query `name = 'X'` do Drive casa de forma INSENSÍVEL à caixa.** O Drive normaliza. Então mudar a
caixa do nome NÃO faz a busca deixar de reconhecer as pastas antigas.

### 2. A busca precisa mudar? NÃO

Como o Drive já compara sem diferenciar caixa, o reaproveitamento continua funcionando sem nenhuma
alteração no código de busca. Não há o que consertar ali.

### 3. Prova do reaproveitamento com o nome novo

Em leitura pura, chamei a busca REAL (`_pastas_com_nome`) com o nome do Willden **em caixa alta** sob
a pasta-pai Fopag:
- pastas encontradas: **1**;
- é a pasta EXISTENTE do Willden (id confere): **sim**;
- criaria duplicata: **NÃO, reaproveita**.

Ou seja: um candidato que JÁ tem pasta (caixa antiga) continua sendo reaproveitado mesmo com o nome
novo em maiúsculo; a pasta antiga é encontrada e reusada, e a nova em caixa alta nem chega a ser
criada. Só candidato genuinamente NOVO ganha pasta em caixa alta. Nada é renomeado retroativamente.

### O que foi aplicado

- `montarNomePasta` passa o **nome do candidato por `toUpperCase()`**; a operação fica como está, o
  separador fica como está (convenção de nome de pasta pré-existente, não texto de UI da §A.11), e a
  `description` não muda. Uma linha, com o porquê e a prova do reuso no comentário.
- Testes: `montarNomePasta` agora exige caixa alta e preserva acentos (o nome "João Conceição" sai
  como "JOÃO CONCEIÇÃO" antes do separador).
  **467 testes verdes.** Backend rebuildado e reiniciado; `/api/health` 200.

### Recomendação sobre o NOME DO ARQUIVO (proposta, NÃO aplicada, o diretor decide)

O nome do arquivo é `{Nome do Tipo}_{nome do candidato}`. **Recomendo aplicar o mesmo critério**
(nome do candidato em caixa alta), por dois motivos: consistência visual com a pasta, e **risco
ZERO** de duplicar arquivo, porque a dedup de arquivo é por **md5 do CONTEÚDO**, não pelo nome (Bloco
3 da OST do Drive). A caixa do nome do arquivo é puramente cosmética. Como o diretor pediu para não
decidir sozinho, **não apliquei**; é trocar `${nomeTipo}_${adm.candidatoNome}` por
`${nomeTipo}_${adm.candidatoNome.toUpperCase()}` no `arquivarNoDrive`/`arquivarAsoNoDrive`, uma linha
cada, quando houver o OK.

### Aberto

- **Nome do arquivo em caixa alta**: proposta acima, aguardando decisão.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, Fase 2 item 1 (reauditar 14 admissões da staging) e nome de arquivo em caixa alta

### Nome do ARQUIVO no Drive em CAIXA ALTA (decisão aplicada)

Aplicada a recomendação: o nome do arquivo passou de `{Nome do Tipo}_{nome do candidato}` para
`{Nome do Tipo}_{NOME DO CANDIDATO}` (`.toUpperCase()`), nos dois pontos que montam `nomeFinal`
(`arquivarNoDrive` e `arquivarAsoNoDrive`). **Risco zero de duplicar arquivo:** a dedup de arquivo é
por **md5 do CONTEÚDO**, não pelo nome (Bloco 3 da OST do Drive), então a caixa do nome é cosmética.
Vale para arquivamentos novos; o que já subiu não é renomeado. Typecheck limpo, backend reiniciado.

### Fase 2, item 1: reauditar as 14 admissões / 22 documentos com staging viva

Executado o runner `reprocessa-date-bug`, mesmo caminho da Fase 1 (`ReauditoriaService.reauditar`,
lendo da STAGING local, sem re-baixar do Pandapé). Com as travas: só as 14 admissões-alvo, só tipos
PENDENTE com staging (o gate protege validação humana e o que já tem veredito), idempotência pela
dedup, e **pausa de 7s entre chamadas** para ficar sob o teto de quota (o 429 aparece por volta de 10
sequenciais).

**Resultado: 22 de 22 documentos reauditados, sem uma única falha.**
- Vereditos reais da IA: **8 ENTREGUE, 6 INCONFORME, 8 PENDENTE.**
- **Zero** erros de Date, **zero** paradas por quota (a pausa segurou), **zero** conflitos de validação
  humana (o log não registrou nenhum; o gate "só PENDENTE" não deixa o documento validado nem entrar
  na lista).

Sobre os 8 PENDENTE: são veredito REAL da IA, não falha. Parte é "ilegível/insuficiente para decidir",
parte é tipo sem regra de auditoria ativa (ex.: PIS_PASEP, CARTAO_SUS), que a IA devolve como
"validação manual necessária". O ponto da recuperação é este: **antes, os 22 documentos estavam
PENDENTE SEM veredito e sem marca (coleta perdida em silêncio pelo bug); agora cada um tem um veredito
gravado, uma observação e marca de dedup.** O que estava invisível virou trabalho conhecido na tela,
com o estado correto, seja ENTREGUE, INCONFORME (a tratar) ou PENDENTE (a decidir).

Idempotência confirmada: o runner só planejou os 22 PENDENTE-com-staging; o que já tinha veredito nas
14 admissões (muitas já parcialmente processadas antes) foi pulado, não re-auditado.

### Travas cumpridas

Só as 14 admissões-alvo; nenhuma validação humana tocada; idempotência pela dedup e pelo gate; a pausa
manteve a quota fora do vermelho, e o runner pararia sozinho no primeiro 429 (não foi preciso).

### PARADO aqui, aguardando o OK sobre o item 1

Conforme a ordem do diretor, **não segui para o item 2** (re-pull das 3 com acervo pelo worker BullMQ)
nem descartei formalmente as 10 sem acervo. Aguardo o OK sobre estes números.

### Aberto

- **Fase 2 item 2 (re-pull das 3)**: aguardando OK.
- **Sem commit**, conforme §A.21.

---

## 23/07/2026, Fase 2 itens 2 e 3 (re-pull das 3 com acervo; descarte das 10 sem acervo)

### Item 2: re-pull das 3 admissões com acervo confirmado, pelo worker BullMQ

Feito pelo worker do próprio pull (fila BullMQ, espaçamento e backoff sob o teto), NÃO por disparo
direto. Runner `enfileira-repull` produz UM job por admissão; enfileirei **uma de cada vez, esperei o
job terminar e conferi quota antes da próxima**, que é o controle de "parar se a quota apertar" que o
worker autônomo não daria sozinho. `reprocessar: true` + `jobIdSufixo` para forçar job novo (o jobId
estável já constava concluído no histórico).

**Antes e depois (as 3 estavam com 0 documento gravado e 0 marca, vítimas genuínas):**

| Admissão | idPre | Depois | Marcas | Sem destino |
|---|---|---|---|---|
| `af2883bf` | 399949 | **8 ENTREGUE, 1 INCONFORME, 1 PENDENTE** | 11 | 1 |
| `fd4ad024` | 400202 | **7 ENTREGUE, 3 INCONFORME, 3 PENDENTE** | 15 | 1 |
| `a94111e2` | 400972 | **5 ENTREGUE, 2 INCONFORME, 2 PENDENTE** | 9 | 0 |

- **Total recuperado: 20 ENTREGUE, 6 INCONFORME, 6 PENDENTE, 35 marcas de dedup.** O que estava
  perdido (documento no Pandapé, nada no EA) agora está gravado com veredito real.
- **Zero quota, zero erro de Date, zero AGUARDANDO_AUDITORIA preso.** Os AGUARDANDO que apareceram no
  meio de cada job eram só o estado transitório de coleta (upsert grava AGUARDANDO antes da IA);
  todos resolveram para veredito ao fim do job. Espaçar os 3 jobs no tempo (esperar um terminar antes
  de enfileirar o próximo) fez a janela de quota do Vertex zerar entre eles, então nem perto do 429.
- **2 formulários "sem destino"** no total (1 em `af2883bf`, 1 em `fd4ad024`): formulários do Pandapé
  sem mapeamento no de/para (VT, vacina e afins). Não é perda, é o comportamento correto: o EA não
  audita o que não reconhece, e nada some no Pandapé.

Travas cumpridas: só as 3 admissões-alvo; validação humana intocada (as 3 não tinham nenhuma); pela
dedup, um re-pull do mesmo acervo não duplica; e o gate de "parar na quota" ficou nas minhas mãos, uma
por vez, não foi preciso usar.

### Item 3: as 10 sem acervo, DESCARTADAS (registro para não voltarem a ser contadas)

As 10 admissões da consulta à v3 que retornaram **0 arquivos no Pandapé** ficam DE FORA da
recuperação. **Não são vítimas do bug do Date:** o bug perde documento que FOI baixado; onde o Pandapé
não tem acervo, não houve documento para perder. São candidatos que simplesmente não anexaram o
obrigatório, e "não veio" é o estado esperado, não falha. idPreCollaborator, para o registro (dado
técnico, sem PII): **399802, 399991, 400102, 400139, 400184, 400317, 400601, 400734, 400737, 400973.**

Se algum obrigatório desses for realmente exigido, vira pendência NORMAL da esteira (o candidato
reenviar, ou o time cobrar), não caso do bug. **Não devem ser recontadas como pendência do
reprocessamento.** Fecha o recorte: o bug do Date afetou a ingestão de quem tinha documento; foi
recuperado por reauditar (Fase 1: 2 admissões; Fase 2 item 1: as 22 da staging) e por re-pull (item 2:
estas 3). O resto do universo "obrigatório PENDENTE" é pendência de operação, não resíduo do bug.

### Encerramento do reprocessamento do bug do Date

- Fix do Date: em produção, provado ponta a ponta.
- Recuperados: Willden + `f88796b0` (Fase 1) + 22 documentos em 14 admissões (Fase 2 item 1) + 3
  admissões por re-pull (item 2). Zero quota estourada em todas as fases (pausa no reauditar, jobs
  espaçados no re-pull).
- Descartadas por não terem acervo: 10.

### Aberto

- **Sem commit**, conforme §A.21.

---

## 23/07/2026, OST tela de diagnóstico do sistema

Feature nova, ponta a ponta. O objetivo: o diretor deixa de depender de acionar a fábrica para olhar
log toda vez que algo trava. Motivada pelo bug do Date, que derrubou a ingestão do Pandapé por ~5h
enquanto o log dizia "nada perdido" e a descoberta veio por reclamação de operação.

### Um incidente REAL exposto no meio da construção (registro honesto)

Ao montar o check de Vertex do Bloco 3, a auditoria de produção parou de funcionar. Investiguei em vez
de contornar, e a cadeia foi:
1. O `/health` do ai-service respondia 200 enquanto `/auditoria/documento` devolvia 503. **É a
   armadilha que a OST mandou evitar, e aconteceu de verdade.**
2. A chamada REST CRUA ao Vertex respondia **HTTP 200**: o Vertex estava no ar. O problema era o
   cliente do SDK `genai`, com o httpx pool "closed".
3. Causa: o cliente `genai` coletado/fechado quando não preso em variável local. Endurecido: o
   `_gerar_conteudo` prende o cliente numa variável e, se ainda vier "closed", limpa o cache e recria
   uma vez. Restaura a auditoria e serve ao readiness pelo MESMO caminho.
4. E um erro MEU no meio: a inserção do helper deslocou um `@lru_cache` para a função errada
   (`unhashable list`); corrigido, o decorator voltou para `get_client`.

Resultado: durante a construção a auditoria ficou instável por alguns minutos e foi **restaurada**
(reauditar volta 201, readiness `ok:true`). E a própria tela que eu estava construindo é o que
tornaria esse tipo de incidente VISÍVEL em vez de descoberto por reclamação. O cliente genai também
ficou mais resiliente do que estava.

### Acesso e menu

Restrita a MASTER/SUPER_ADMIN (`@Roles` na controller, mesmo padrão de "usuarios"). O menu
`diagnostico` entrou no catálogo (grupo ADMIN, seed convergido, 18 menus) e na regra de liberação por
perfil; como a controller é admin-only, marcá-lo para um COMUM não concede acesso (fail-closed).
Provado: COMUM recebe **403** no GET e nas ações.

### Bloco 1 (sinais do banco), provado contra dado real

Cada sinal traz contagem, itens afetados (identificados por nome do candidato, NUNCA CPF, §A.6) e
"há quanto tempo".
- **a) Coleta perdida = documento PENDENTE COM arquivo na staging E NUNCA auditado (sem observação).**
  **O sinal NÃO usa "0 marcas de dedup"**, o falso positivo caro provado no `a2a56340`. Prova ao
  vivo: `a2a56340` tem 0 marcas mas veredito gravado, e **não aparece** no sinal. Refinei ainda: um
  PENDENTE COM observação já passou pela IA (veredito manual/ilegível), não é perda; por isso o sinal,
  hoje, é **0** (depois do reprocessamento, não há coleta perdida de verdade).
- **b) Régua fechada e `drive_pasta_url` nula** (só vivas, exclui o histórico importado): hoje **0**
  (o Willden foi arquivado). Ação Rearquivar por alvo na linha.
- **c) AGUARDANDO_AUDITORIA acima de 6h**: reusa o `LIMIAR_AUDITORIA_PARADA_MS`. Hoje **0**.
- **d) Falha de sistema por família** (QUOTA/CREDENCIAL/INDISPONIBILIDADE/DESCONHECIDA), classificada
  pela observação que a auditoria grava. Hoje **0**.

### Bloco 2: cliente Fopag sem pasta-pai mapeada

Compara os clientes Fopag com admissão VIVA contra o mapa (`fopagTemPastaPai`, fallback + env). Só o
Fopag resolve por `cod_cliente`, então só ele tem a lacuna. Hoje **0**: o cliente 54792 (o do Willden)
já foi mapeado na entrega anterior, então a lista está vazia, como a OST previu.

### Bloco 3: dependências pelo CAMINHO REAL, não /health

Cada uma com estado, última verificação e último erro. Provado ao vivo, tudo `ok`:
- **Vertex**: `/readiness` no ai-service faz uma **geração mínima (1 token)**, prova auth + modelo +
  resposta. Custo mínimo, sem PII (prompt fixo "ok"), sem poluir dado. É a lição do incidente: não é
  o `/health`.
- **Drive**: `/readiness/drive` faz `about.get` com a credencial EM USO, confirma acesso E a
  identidade (`admin.soulan@`).
- **Pandapé**: exercita o OAuth2 (emissão de token). `indisponivel` quando sem credencial (não é
  "fora").
- **Banco**: `SELECT 1`. **Fila BullMQ**: `getJobCounts` (ativos/aguardando/falhados/atrasados);
  `degradado` se há falhados, `fora` se a fila não subiu.

### Bloco 4: última coleta do Pandapé, com rótulo honesto

Da `documento_arquivos_coletados` (marca por admissão+tipo+hash, com carimbo). A tela DIZ a verdade
que o Pandapé impõe: é **"quando o EA foi BUSCAR", não "quando o candidato enviou"** (o Pandapé não
avisa envio de documento; o pull só dispara na liberação; coleta antiga pode ser "ninguém foi
buscar"). Hoje: 9 arquivos, com o carimbo.

### Bloco 5: agir pela tela, por alvo, reusando o que existe

Três ações, cada uma reusa o caminho que já existe, NUNCA em massa: **reauditar** (ReauditoriaService,
com dedup e precedência de validação humana), **rearquivar** (o pós-veredito, arquiva se a régua
fechou), **re-pull** (fila BullMQ, com espaçamento). Trilha: quem disparou (id), o quê e quando,
logada. Provado ponta a ponta: reauditar por alvo devolveu `{ok:true, origem:STAGING}` e a trilha
`[DIAGNOSTICO][trilha] acao=reauditar ... por=<id> (SUPER_ADMIN)`.

### Bloco 6: atual e histórico

Falhas por família nas **últimas 24h e 7 dias** (janela declarada). LIMITE HONESTO declarado no
código: é derivado do que está parado AGORA com motivo de família, não um livro de eventos completo
(documento que falhou e depois resolveu não conta); uma tabela de eventos de falha daria o histórico
pleno e fica proposta.

### Bloco 7: alerta no sistema

- **Badge na sidebar** (no item Menu Gerencial), mesmo padrão do da Liberação, com o número de
  problemas.
- **Popup a cada 20 min** quando aceso, mesmo padrão insistente da Liberação ("Estou ciente" suprime
  por 20 min).
- **O que acende, declarado** (`calcularAlerta`): qualquer sinal do Bloco 1/2 acima de zero, ou
  dependência externa **fora do ar**. **NÃO acende por ruído**: `degradado` (responde com ressalva) e
  `indisponivel` (não deu para checar) não acendem sozinhos. O badge lê os sinais de banco FRESCOS +
  as dependências de um **cache (TTL 5 min)** populado pelo snapshot, para não gastar uma geração de
  Vertex a cada poll.

### Bloco 8: prova

- Cada sinal do Bloco 1 provado contra dado real (hoje todos 0, sistema saudável após o
  reprocessamento). O sinal (a) provado que **não** usa ausência de marca (o `a2a56340` fica de fora).
- Bloco 2 provado: lista vazia porque o 54792 já foi mapeado (a OST aceitava as duas saídas).
- Ação do Bloco 5 provada ponta a ponta por alvo (reauditar), com trilha.
- **Alerta acendendo e apagando provado AO VIVO, sem poluir dado**: derrubei o ai-service, o snapshot
  passou a mostrar Vertex e Drive `fora` e o alerta `aceso=true` com os motivos; subi de novo e o
  alerta voltou a `false`.
- Gate: **backend 473 testes verdes** (7 novos: 6 do `calcularAlerta`, 1 do registro de menus com o
  novo item), **frontend 41**, **ai-service 77**. Typecheck limpo. Lint com os 2 erros PRÉ-EXISTENTES
  de sempre.

### Prova visual (§A.13)

Dispensada pelo diretor nesta OST ("o Chromium do ambiente não sobe"). A tela é validada por ele em
produção. Toda a lógica está provada no nível de API e a renderização deriva do snapshot.

### Aberto ao fim desta entrega

- **Tabela de eventos de falha** para o histórico pleno do Bloco 6 (hoje é derivado do estado atual).
- **Trilha das ações em tabela própria** (hoje é log consultável no journal).
- **Sem commit**, conforme §A.21.

---

## 24/07/2026, redesenho da tela de diagnóstico: painel B.I., não relatório

Redesenho SÓ VISUAL, a pedido do diretor. A lógica, os dados, as verificações de dependência, as
ações por alvo e o alerta NÃO mudaram, e foi confirmado que não regrediram. Só a apresentação da
página `/admin/diagnostico` foi reescrita.

### O que mudou na apresentação

- **Faixa 1, os SINAIS como KPIs grandes em grade horizontal** (`grid-cols-2 sm:grid-cols-3
  xl:grid-cols-5`): coleta perdida, régua fechada sem pasta, parado acima de 6h, falha por família e
  Fopag sem pasta. Número grande (classe `.num`), rótulo curto (`.lbl`), como os cards do Farol e do
  Gerenciador. Cada card é a PORTA: clicar abre o detalhe.
- **Faixa 2, as DEPENDÊNCIAS como indicadores compactos lado a lado** (mesma grade de 5): StatusPill
  com o estado + nome + detalhe curto, estado visível de relance. O `title` mostra o último erro sem
  ocupar espaço.
- **Faixa 3, compacta**: duas portas, "Última coleta" e "Falhas por família (24h e 7 dias)", com um
  resumo de uma linha e a seta de abrir.
- **O DETALHE saiu da dobra inicial**: a lista de admissões afetadas (com as ações Rearquivar e
  Re-pull por alvo), o histórico e a última coleta entram em MODAL ao clicar no card. A dobra inicial
  é só KPI + dependências, para bater o olho e saber o estado sem rolar.

### Código de cor (card em zero é saudável, não grita)

- **Sinal em ZERO**: número na cor neutra, ícone de check verde discreto, sem moldura de alerta. O
  painel saudável de hoje (todos os sinais 0) parece saudável, não vazio.
- **Sinal acima de zero**: número em vermelho, ícone de alerta e moldura/anel vermelho, salta como
  chamada para ação.
- **Chip de topo**: "Tudo saudável" verde quando o alerta está apagado; "N problema(s)" vermelho
  quando aceso. Reflete o mesmo `alerta` do backend.

### Reuso declarado

- `GlassCard as="button"` com as classes `.fk`, `.num`, `.lbl`: o MESMO card clicável dos KPIs do
  Gerenciador e do Farol.
- `StatusPill` (tons ok/dg/wn/nt) para as dependências, a mesma pill de status do resto do sistema.
- `Modal`, `Button`, `Icon`: componentes já existentes. Nenhuma linguagem visual nova inventada.

### Não regrediu (verificado)

- **Badge na sidebar** (`diagAlerta.total` no item Menu Gerencial): intacto.
- **Popup de 20 min** (`REAPARICAO_MS = 20 * 60 * 1000` em `DiagnosticoAlerta`): intacto.
- **Cache de 5 min das dependências** (`DEPS_TTL_MS` no serviço): intacto.
- **Restrição MASTER/SUPER_ADMIN** (`@Roles` na controller): intacto.
- **Entrada no catálogo de menus** (`diagnostico`): intacta.
- A API `/diagnostico` responde igual (sinais 0, 5/5 dependências ok, alerta apagado): a lógica
  provada na entrega anterior segue valendo.

### Gate

- **Frontend: typecheck limpo, 41 testes verdes.** Backend não foi tocado. Frontend rebuildado e
  reiniciado; `/login` 200, a rota `/admin/diagnostico` 200. O redesenho confere no bundle servido
  (grade `xl:grid-cols-5`, as faixas, as ações e o histórico presentes).
- Lint: os 2 erros PRÉ-EXISTENTES de sempre.

### Prova visual (§A.13)

Dispensada pelo diretor ("o Chromium do ambiente não sobe"). Validação em produção: o Rike abre a
tela e confere o painel na primeira dobra. A estrutura está provada no bundle e a lógica na API.

### Aberto

- **Sem commit**, conforme §A.21.

---

## 24/07/2026, correção de pluralização no popup da Liberação

Bug de texto: o popup exibia "19 admissãoões aguardando liberação". A pluralização concatenava a
palavra inteira "admissão" com o sufixo "ões", em vez de tratar o radical de palavra terminada em
"ão" (troca "ão" por "ões").

- **Causa e correção.** String montada à mão em `LiberacaoAlerta.tsx:123`, não uma função genérica.
  Trocado `admissão{count===1?"":"ões"}` por `admiss{count===1?"ão":"ões"}`. Agora: 1 => "1 admissão
  aguardando liberação"; N => "19 admissões aguardando liberação".
- **Varredura por função genérica: não existe.** Não há utilitário de plural no frontend; cada
  concordância é inline. Varri toda a base por `"ões"` e pelo padrão de concatenação de palavra
  terminada em "ão" com sufixo. Só dois pontos usam "ões", e o outro (`liberacao/page.tsx:1165`,
  `pré-admiss{...?"ão":"ões"}`) já usava o radical certo. Era o único defeito.
- **Segunda frase do popup, conferida.** "Há uma pré-admissão do Pandapé..." em 1 e "Há 19
  pré-admissões do Pandapé..." em N já estava correta (`LiberacaoAlerta.tsx:126`), nada a mexer.
- **Gate e deploy.** Typecheck do frontend verde. Build de produção + restart do `ea-frontend`;
  `/login` 200 e o radical corrigido confere no bundle servido (`admiss` + "ão"/"ões" separados,
  não mais a concatenação). Validação do Rike em produção. Sem commit (§A.21).

---

## 24/07/2026, OST scheduler de re-consulta do Pandapé

O buraco fechado: o pull do Pandapé só disparava NA LIBERAÇÃO. Documento que o candidato anexa
DEPOIS não entrava sozinho (o Pandapé não avisa envio de documento, só manda evento de ETAPA). Agora
um scheduler re-consulta as admissões vivas de origem Pandapé em cadência fixa; a dedup por arquivo
(SHA-256, `documento_arquivos_coletados`), construída para isto, garante que só o que é novo entra.

### Bloco 1, o scheduler

- **Cadência: 12 minutos** (meio da faixa 10 a 15 pedida). Declarado em `domain/scheduler-pandape.ts`.
- **Alcance por construção:** só admissões com `id_precollaborator` (origem ATS) e farol vivo COM
  régua (`EM_ADMISSAO`/`BANCO_AGUARDAR`). Ficam de fora, sem filtro artificial: concluídas,
  declinadas, histórico importado e manuais (todos sem `id_precollaborator`), e as pré-admissões
  `AGUARDANDO_LIBERACAO` (ainda sem cliente+cargo, logo sem régua onde mapear documento, o pull delas
  é na liberação).
- **Enfileira no worker BullMQ existente, sob o limiter:** o serviço in-process (`setInterval`, mesmo
  padrão do ExpurgoService) só ENFILEIRA um `scheduler-tick`; o ciclo roda NO WORKER
  (concorrência 1 → varre as admissões SEQUENCIALMENTE, nunca N chamadas simultâneas).
- **Rate limit RECALCULADO com o volume atual (medido, não estimado):** 45 admissões vivas de origem
  Pandapé (contadas no banco). Cada admissão = 1 chamada de listagem (`GET /v3/precollaborators/{id}`,
  confirmado no código; o token OAuth é cacheado, ~0 amortizado). Ciclo cheio = 45 chamadas. A 12 min
  são 45 x 5/12 = **18,75 chamadas por janela de 5 min = 1,9% do teto COMPARTILHADO de 1.000 req/5min**
  (§A.5) que o webhook do G.Infor também consome. Folga larga. (Antes: 34 vivas a cada 5 min davam
  3,4%; espalhado na cadência de 12 min, cai para 1,9%.) Downloads só para arquivo NOVO.

### Bloco 2, incremental de verdade (a dedup garante)

Reusa `puxarDocumentosDaAdmissao` (o MESMO pull da liberação, `reprocessar=false`): a dedup por
arquivo pula SEM BAIXAR o que já veio (`decidirColeta` → `PULAR_SEM_BAIXAR`), só arquivo NOVO baixa e,
como o veredito é do CONJUNTO, re-audita o tipo inteiro. Validação humana tem precedência absoluta
(`PULADO_VALIDACAO_HUMANA`, nunca tocada, nem o arquivo é baixado). INCONFORME segue fora da trava (o
candidato pode reenviar). Tudo isto já era coberto por `pandape-dedup-arquivo.spec` (14 testes) e
agora pelo domínio do scheduler.

### Bloco 3, custo de IA e teto de segurança (o maior risco)

- **Regime normal ≈ zero IA:** a dedup pula o que já veio; só documento NOVO custa. O agregado do
  ciclo conta as auditorias (`agregarCiclo`).
- **Reusa o backoff e a família:** os jobs herdam o backoff exponencial do BullMQ; a classificação por
  família (QUOTA retenta, ENTRADA determinística não retenta) é a que a auditoria já grava.
- **TETO: 40 auditorias por ciclo** (`SCHEDULER_TETO_IA_POR_CICLO`, declarado). Batido o teto, o ciclo
  PARA e registra (`abortado=true`), em vez de esvaziar a quota. Checado ENTRE admissões.

### Bloco 4, visibilidade na tela de diagnóstico (integrado, não duplicado)

- **"Última coleta" com rótulo ajustado:** com o scheduler ligado, uma marca antiga aqui pode ser só
  ausência de arquivo NOVO (nada mudou); quem sinaliza que a COLETA parou é o card do scheduler.
- **Sinal SCHEDULER PARADO:** entra na lista de sinais (acende badge/popup) quando LIGADO e sem ciclo
  bem-sucedido há mais de **45 min** (`SCHEDULER_LIMIAR_PARADO_MS`, ≈ 3,75 cadências; tolera um ciclo
  lento, acende antes de 1h se o loop morreu). DESLIGADO nunca está "parado" (é decisão do diretor).
- **Resultado do último ciclo:** card próprio na Faixa 3 (varridas/novos/falhas + estado) com modal de
  detalhe e controle.

### Bloco 5, controle

- **Liga/desliga sem deploy:** linha singleton `pandape_scheduler_estado.ligado`, lida a cada ciclo.
  `POST /diagnostico/scheduler/toggle` (admin-only). O freio do Rike.
- **Disparo manual:** `POST /diagnostico/scheduler/rodar-agora` (enfileira um ciclo). O disparo por
  alvo (re-pull/reauditar) da tela continua existindo.

### Bloco 6, PROVA (ao vivo, em produção)

Quatro ciclos reais, disparados pela tela (`rodar-agora`), sobre as 45 admissões vivas de origem
Pandapé. A sequência prova o incremental de ponta a ponta:

| Ciclo | varridas | novos | auditorias | abortado | duração | o que prova |
|---|---|---|---|---|---|---|
| 1 | 23 | 50 | 43 | **sim** | ~9 min | **TETO DE IA (Bloco 3)**: achou backlog real, parou no teto |
| 2 | 45 | 48 | 39 | não | ~9 min | terminou o backlog das 22 restantes; re-varreu as 23 do ciclo 1 SEM re-baixar (0 novos nelas) |
| 3 | 45 | **0** | **0** | não | ~60 s | **skip-sem-baixar + idempotência**: tudo já coletado, zero download, zero IA |
| 4 | 45 | **0** | **0** | não | ~78 s | **dois ciclos seguidos sem novidade = ZERO chamada de IA** |

- **Incremental / skip-sem-baixar / idempotência provados AO VIVO:** ciclos 3 e 4, ambos `novos=0,
  auditorias=0`, e RÁPIDOS (~60 a 78 s contra ~9 min de um ciclo que audita), porque a dedup pulou
  cada arquivo já marcado SEM BAIXAR. O ciclo 2 já provara que arquivo NOVO entra e re-audita o
  conjunto (48 novos, 39 auditorias) e que o re-scan das admissões já coletadas não re-baixa (0
  novos nelas). O par 3+4 é a "0 IA em dois ciclos sem novidade" que a OST pede, literal.
- **TETO DE IA (Bloco 3) provado em DADO REAL:** ciclo 1 achou um backlog de documentos nunca
  coletados (exatamente o buraco) e auditou até bater o teto (43, checado entre admissões), então
  `ABORTADO`, `abortado=true` e nota gravados, heartbeat batido. Não esvaziou a quota, parou.
- **SCHEDULER PARADO provado ao vivo:** ligado e sem ciclo concluído, o snapshot devolveu
  `scheduler.parado=true` e `alerta.aceso=true` com motivo `"Scheduler de coleta parado: 1"`. Após os
  ciclos, `parado=false` e alerta apagado.
- **Toggle (Bloco 5) provado ao vivo:** desligar → `rodar-agora` vira no-op (`enfileirado:false`);
  snapshot `ligado=false, parado=false` e alerta APAGADO (prova de que desligado nunca acende).
  Religado em seguida.
- **Trava de validação humana:** provada pelo `pandape-dedup-arquivo.spec` (o ciclo reusa
  `puxarDocumentosDaAdmissao`, que pula documento validado à mão SEM baixar). O mecanismo todo tem
  ainda `scheduler-pandape.spec` (8) e `pandape-scheduler-ciclo.spec` (5: teto, inerte, desligado,
  regime normal, falha isolada de admissão não derruba o ciclo).
- **Rate limit MEDIDO, não estimado:** 45 admissões vivas (contagem real no banco) x 1 chamada de
  listagem por admissão; os ciclos 3 e 4 completaram as 45 em ~60 a 78 s fazendo só as 45 chamadas de
  listagem (sem download). A 12 min: 45 x 5/12 = **18,75 chamadas por janela de 5 min = 1,9% do teto
  compartilhado de 1.000 req/5min** (§A.5). Folga larga para o webhook do G.Infor.
- **Gate:** backend 486 testes (13 novos), typecheck e lint limpos; frontend typecheck limpo, 41
  testes. Migration `0037_tricky_amphibian` aplicada.

### Aberto

- **Sem commit**, conforme §A.21. Validação do Rike em produção.
- O scheduler nasce **LIGADO** (fecha o buraco por padrão; o Rike tem o freio na tela). Na sessão ele
  já coletou o backlog de uma vez (ciclos 1 e 2) e entrou em repouso (ciclos 3 e 4 a 0 IA); daqui em
  diante só arquivo genuinamente novo custa.
- Frontend rebuildado e reiniciado para publicar o card e o modal de controle do scheduler no painel
  de diagnóstico.

---

## 24/07/2026, correção de salário aceitando formato brasileiro

O salário era o ÚNICO campo numérico que chegava SEM validação de formato à coluna `numeric`.
Qualquer valor não-numérico estourava `22P02 invalid input syntax`, que não é HttpException e caía
no fallback genérico "Erro ao liberar". Como o salário é o MESMO para as N do lote, um valor mal
formatado derrubava TODAS de uma vez (o caso real: 9 admissões, 0 liberadas). A correção é no campo,
em três barreiras, não na disciplina do consultor.

### Bloco 1, aceitar o formato que o consultor digita

`parseValorBR` / `normalizarSalarioParaDto` (`admissoes/dto/valor-monetario-br.ts`). Regra pt-BR
declarada: **PONTO é milhar, VÍRGULA é decimal**. Aceita `2500`, `2500,00`, `2.500,00`,
`R$ 2.500,00`, `2 500,00` (com espaço). O **caso ambíguo "2.500"** é tratado como **2500** (dois mil
e quinhentos), NÃO 2,5: no padrão brasileiro o ponto é sempre separador de milhar, então ele some.
A saída canônica é "2500.00", que o `numeric` do Postgres aceita direto.

### Bloco 2, validar ANTES do banco (no backend, a autoridade)

No DTO (`VagaFolhaInputDto.salario`): `@Transform(normalizarSalarioParaDto)` + `@Matches(/^\d+(\.\d
{1,2})?$/)`. Se não sobra número (texto puro, letras, mais de uma vírgula, negativo), o valor cru
não casa no `@Matches` e vira **400 com mensagem clara** ("Salário inválido. Informe um valor como
2500 ou 2.500,00..."), nunca estoura no banco. Roda no BACKEND: chamada direta à API também é barrada.

### Bloco 3, máscara no campo (prevenção na origem)

`maskMoedaBR` na tela de Liberação, nos modais individual E em massa: guarda só dígitos e formata
como centavos ("250000" vira "2.500,00"), então valor inválido nem consegue ser digitado. É a
PRIMEIRA barreira; a normalização é a segunda; a validação do backend é a terceira.

### Bloco 4, logar o erro real no catch do lote (dívida paga)

O catch por admissão do `liberarEmLote` não logava nada, por isso as 9 falhas ficaram sem rastro.
Agora loga o erro REAL (§A.6: `admissao=<id>` técnico + mensagem, nunca nome/CPF) e leva o **motivo
real à tela**, por admissão (como já era com o motivo da auditoria), em vez de nove "Erro ao liberar"
idênticos. Com o salário validado no DTO, o 22P02 nem chega mais a este catch.

### Bloco 5, prova

- **Unidade (formatos chegando corretamente ao banco):** `valor-monetario-br.spec` (31) cobre cada
  formato obrigatório e os inválidos; `salario-dto.spec` (12) roda a validação REAL do DTO
  (transform + validate), provando canônico no válido e 400 no inválido.
- **Lote com vírgula liberando N (o caso que quebrou), unidade:** teste de REGRESSÃO no
  `admissoes.liberar-lote.spec` passa "R$ 2.500,00" PELO DTO (normaliza para "2500.00") e libera as 3
  do lote, com o salário persistido correto (era 9/0).
- **Ao vivo, em produção (sem mutar pré-admissão real, id inexistente faz a validação rodar antes):**
  - individual + salário inválido -> **HTTP 400** com a mensagem clara (não 500);
  - individual + "R$ 2.500,00" -> **404 "Admissão não encontrada"** (o salário passou a validação e
    chegou ao service, não é mais 400 nem 500);
  - **lote + "2.500,00"** -> **404 "Cliente não encontrado"** (passou a validação, chegou ao service:
    é exatamente o formato que antes dava 500 e derrubava o lote);
  - lote + "abc" -> **400** claro.
- **Outros numéricos (Bloco 5 item 4), CONFERIDO:** o valor de benefício (VR/VA) **NÃO tem o defeito
  do salário**. `BeneficioAlocadoDto.valor` já é `@IsNumber`-validado com transform pt-BR: valor mal
  formatado vira **400 claro** ("Valor do benefício inválido. Use o formato 500,00."), nunca 22P02/
  500. Ele é só mais ESTRITO que o salário novo (rejeita "R$"/espaço e não tem máscara). Deixei como
  está (§A.14, o item pedia CONFERIR e REPORTAR, não alterar); aplicar a mesma máscara/normalização
  ao VR é um follow-up trivial se o diretor quiser a mesma tolerância.
- **Gate:** backend 530 testes (44 novos), typecheck e lint limpos (só os 2 erros pré-existentes de
  `react-hooks/exhaustive-deps`, alheios); frontend typecheck limpo. Backend e frontend rebuildados e
  no ar. Sem commit (§A.21), validação do Rike em produção.
