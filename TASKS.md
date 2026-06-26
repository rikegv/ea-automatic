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
### Clientes ✅ (OST-EA-FASE-1B · READY_fase-1b-clientes → merge → push)
- [x] Expansão do Cliente: +6 colunas (empresa_grupo, regiao, descricao_regiao, beneficios/escala/endereco_padrao) + `endereco` na DadosVagaFolha — migration `0001_icy_hawkeye`
- [x] Carga idempotente de 114 clientes (CSV → seed-clientes.ts, upsert por cod_cliente), todos com cnpj+razão
- [x] Wizard F1 pré-preenche região/empresa (informativos) e folha (benefícios/escala/endereço, editáveis)
- [x] CLAUDE.md §A.3 atualizado com os novos campos
- [ ] **Régua real** por (cliente+cargo) — hoje só pares demo têm régua; clientes reais geram admissão com 0 documentos até carregar
- [ ] Carga de cargos reais (catálogo próprio — normalização contínua)
- [ ] Follow-up segurança: `seed-clientes.ts` logar `err.message` no catch; teste do mapeamento CSV quando houver infra de teste de DB

## Fase 2 — Cadastro e Gerenciador
### Fase 2A — Wizard de Nova Admissão ✅ (OST-EA-FASE-2A · READY_fase-2a-wizard → merge → push)
- [x] Follow-up casca: guard `NODE_ENV === "production"` em `seed-demo.ts` (§A.6)
- [x] Follow-up casca: teste automatizado de RBAC (COMUM→403) — `roles.guard.spec.ts` (6 casos)
- [x] Wizard F6 (3 etapas + stepper), F1 autopreenchimento (cliente), F3 validador CPF em tempo real
- [x] F4 não-bloqueio + F5 sinalizador (calcSinalizadorPreenchimento PENDENTE/PARCIAL/OK)
- [x] F11 duplicado por CPF com reaproveitamento (preserva histórico)
- [x] POST /admissoes transacional: nascem AUDITORIA+EXAME (F12), gate segura CADASTRO_CONTRATO, documentos da régua
- [x] Dados demo (2 clientes, 3 cargos, régua) no seed-demo dev-only
### Fase 2B/2C e pendências
- [ ] F10 gerenciador (tabela), F7 filtros dinâmicos (Fase 2B)
- [ ] **Follow-ups técnicos (fase futura):** e2e do `POST /admissoes` com testcontainers (400/idempotência/contagem frentes-docs); migrar CPF do path do `GET /admissoes/candidato/:cpf` para o corpo (POST) — higiene de log/proxy

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
