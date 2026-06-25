# DIARIO — EA AUTOMATIC

Registro cronológico das decisões e evidências da construção. Cada entrada explica **o que** foi
feito e **por quê** (rastreabilidade para o diretor e para as próximas sessões).

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

### ⏸️ PARADA PARA VALIDAÇÃO VISUAL (§A.0)
Build concluído; servidores no ar. Aguardando **aprovação visual do diretor** (login, início,
análise, toggle claro/escuro, shell/aurora) ANTES de despachar tester/segurança. Gate fechado;
nenhuma flag `READY_*`. Próximos passos: (1) aprovação visual; (2) tester + segurança;
(3) gerar `READY_fase-2-casca`, registrar e merge na `main`; (4) **push ao GitHub**.

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
