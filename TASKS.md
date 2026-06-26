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
### Régua documental ⏸️ (OST-EA-FASE-1B-REGUA · branch `feat/fase-1b-regua`, aguardando validação visual)
- [x] Loader `seed-regua.ts` (script `db:seed:regua`): garante 21 tipos (8 novos), upsert cargos, UPSERT régua por (cliente+cargo+tipo) — idempotente comprovado (2ª run 0 inseridos)
- [x] Cargos reais: 167 distintos carregados (170 total c/ demo), sem duplicar seed-demo
- [x] Régua: 3.654 registros / 174 pares (3.674/176 total c/ demo); preview F1 verificado com par real
- [x] lint/typecheck/test verdes (38)
- [ ] **Validação visual do diretor** (wizard mostrando checklist real) — PARADA atual
- [ ] Auditoria tester+segurança → `READY_fase-1b-regua` → merge
- [ ] **GAP p/ diretor:** 294 registros pulados — 4 clientes reais ausentes da base (53721 NSK, 56924 RAIA CORIFEU, 57252 RAIA FREI CANECA, 54981 ALCOOL FERREIRA) + `solicitar`/GARRETT (lixo). Acrescentar clientes e re-rodar `db:seed:regua` (idempotente)
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
### Fase 2C — Operação dos faróis + Não Conformidades (branch `feat/fase-2c-esteira`)
- [x] Núcleo da esteira (F8): faróis em abas, gate contínuo do Cadastro, reversão com aceite, ASO (aprovado pelo diretor)
- [x] 8 ajustes da esteira: (1) sumir ao concluir + acessível na busca; (2) aceite "apto sem ASO" → NC-2; (3) busca por candidato (nome/CPF); (4) modal de ficha somente leitura; (5) KPI como filtro; (6) "Total na fila"; (7) laranja "aguardando reenvio"; (8) `Select` estilizado
- [x] Tela de Não Conformidades (menu Operação): 2 vias (penaliza/liberação diretoria), 3 gatilhos (NC-1/NC-2/NC-3), contador por consultor, histórico mantido ao resolver
- [x] `admissoes.consultor_id` + migration `0003` (`nao_conformidades` + enums) aplicada no ea-db
- [x] Ajustes finais: (1) coluna/campo "Data de admissão" nas abas + NC + modal; (2) escolha Via 1/Via 2 integrada no modal de aceite (motivo obrigatório na Via 2, botão travado sem ele) + gate de aceite na auditoria incompleta; (3) data de admissão no modal de ficha
- [x] lint/typecheck/test verdes (38); nest+next build OK; smoke E2E dos gatilhos + Via 2 + expurgo
- [x] **Validação visual do diretor** (esteira ajustada + tela de NC + 3 ajustes finais) — APROVADA
- [x] Auditoria tester (PASS) + segurança (APROVADO) → flag `READY_fase-2c-esteira` → merge na main → push
- [ ] **Follow-ups 2C (fase futura):** NC-3 vira detecção automática quando kit (F9)/assinatura (INT-4) existirem; reabrir NC-1/NC-2 ao re-disparar (hoje idempotente por admissão+tipo não reabre); endpoint/UI de leitura da trilha `frente_status_eventos`; testes de integração das rotas de esteira/NC (testcontainers)

### Fase 2B e pendências
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
