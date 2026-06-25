# TASKS — EA AUTOMATIC

Backlog vivo por fase (roadmap CLAUDE.md §A.8). Marque `[x]` ao concluir; mantenha o porquê no
DIARIO.md. O coordenador atualiza este arquivo a cada despacho.

## Fase 0 — Fundação ✅ (sem dependência externa)
- [x] Monorepo pnpm (apps/backend, apps/frontend, apps/ai-service, packages/shared-types)
- [x] Configs base (package.json, pnpm-workspace, tsconfig.base, eslint, prettier, editorconfig, nvmrc)
- [x] Fábrica de 8 agentes em `.claude/agents/`
- [x] Hook `PreToolUse` registrado em `.claude/settings.json` → `scripts/gate-deploy.sh` (§A.7)
- [x] `scripts/gate-deploy.sh` executável, bloqueando (exit 2) sem flag `READY_*`
- [x] Infra Docker isolada (`ea-db`/`ea-redis`, volumes/rede/portas próprios) com healthchecks
- [x] CI `.github/workflows/ci.yml` (lint · typecheck · test; permissões mínimas)
- [x] DIARIO.md e TASKS.md
- [x] DoD verificado (ver DIARIO.md)

## Fase 1A — Núcleo (estrutura) ✅ (fechada junto com a casca em READY_fase-2-casca)
- [x] Auth/RBAC (JWT HS256 + refresh cookie, argon2, guards globais) — 3 papéis
- [x] Schema Drizzle + migration aplicada no ea-db (12 entidades §A.3)
- [x] Seed: admin (via env) + 21 TipoDocumento + status por frente
- [x] Admin de cadastros: CRUD clientes/cargos/régua (telas vazias, restritas)
- [x] Gate do Cadastro modelado (função pura + teste)
- [x] Validação visual do diretor (login + admin)
- [x] Auditoria tester + segurança → merge (consolidado com a casca, ver READY_fase-2-casca)

## Design System + Fase 2 casca visual (OST-EA-DESIGN-SYSTEM) ✅ READY_fase-2-casca → merge + push
- [x] 3 arquivos de referência na raiz (DESIGN-SYSTEM.md, prototipo-claro/escuro.html)
- [x] Tokens dos 2 temas (claro padrão) + toggle escuro com persistência + script anti-flash
- [x] Componentes base (GlassCard, KpiCard, Button, Pill, NavItem, Icon, Brand, Aurora, ThemeToggle)
- [x] Shell glass (sidebar + aurora + rodapé usuário/Sair; Cadastros só Master/Super Admin)
- [x] Início: banner carrossel (mock) + 4 cards (sem KPIs)
- [x] Análise gerencial: 6 KPIs + gráfico de barras (mock)
- [x] Login reestilizado no novo DS (auth da 1A preservada)
- [x] Admin reskinado (CRUD da 1A preservado) + esteira (casca visual dos faróis)
- [x] lint/typecheck/test verdes; next build (13 rotas)
- [x] Remoto origin configurado (rikegv/ea-automatic)
- [x] Validação visual do diretor — APROVADA
- [x] Auditoria tester (PASS) + segurança (APROVADO) → flag READY_fase-2-casca → merge na main → push ao GitHub (SSH; main=8a3c26e confirmado no remoto)

## Fase 1B — Carga de dados (OST separada)
- [ ] Carga das bases (clientes: código + CNPJ + razão social — insumo §A.9), cargos, régua

## Fase 2 — Cadastro e Gerenciador
- [ ] **Follow-up da auditoria 1A/casca (resolver no início da fase):**
  - [ ] Guard `NODE_ENV !== "production"` no topo de `apps/backend/src/db/seed-demo.ts` (script dev-only; hoje loga senha dev e tem default `Demo!2026`) — segurança §A.6
  - [ ] Teste automatizado de RBAC: consultor COMUM → 403 nas rotas de administração (hoje só verificado por leitura dos guards) — tester
- [ ] Wizard (F6), F1 autopreenchimento, F3 validador CPF, F4 pendências, F5 sinalizadores
- [ ] F11 duplicado por CPF, F10 gerenciador, F7 filtros

## Fase 3 — Esteira e Frentes Paralelas
- [ ] Faróis em abas (F8), F12 frentes independentes, avanço por aba, upload de ASO

## Fase 4 — Motor de IA e Arquivamento  ⛔ (depende: regras de auditoria, service account, árvore Drive)
- [ ] Auditoria incremental (F2), staging efêmera (TTL 48h), Drive (INT-2), kit (F9)

## Fase 5 — Integração Pandapé  ⛔ (depende: ingress público — TI)
- [ ] Ingress, webhook próprio, pull, criação automática, sincronização (INT-1)

## Fase 6 — Dashboards/BI  ⛔ (depende: definição dos dashboards)
- [ ] Dashboards e BI

## Ideia futura (§A.10)
- [ ] Ponte EA ↔ CentraAtend (comunicar candidato por WhatsApp) — fora do escopo atual
