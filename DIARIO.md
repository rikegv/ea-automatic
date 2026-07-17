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
