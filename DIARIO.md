# DIARIO — EA AUTOMATIC

Registro cronológico das decisões e evidências da construção. Cada entrada explica **o que** foi
feito e **por quê** (rastreabilidade para o diretor e para as próximas sessões).

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
