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

## Fase 1A — Núcleo (estrutura) ⏸️ aguardando validação visual + auditoria
- [x] Auth/RBAC (JWT HS256 + refresh cookie, argon2, guards globais) — 3 papéis
- [x] Schema Drizzle + migration aplicada no ea-db (12 entidades §A.3)
- [x] Seed: admin (via env) + 21 TipoDocumento + status por frente
- [x] Admin de cadastros: CRUD clientes/cargos/régua (telas vazias, restritas)
- [x] Gate do Cadastro modelado (função pura + teste)
- [ ] Validação visual do diretor (login + admin) — PARADO aqui
- [ ] Auditoria tester + segurança → flag READY_fase-1a → merge

## Fase 1B — Carga de dados (OST separada)
- [ ] Carga das bases (clientes: código + CNPJ + razão social — insumo §A.9), cargos, régua

## Fase 2 — Cadastro e Gerenciador
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
