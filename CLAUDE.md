# CLAUDE.md — EA AUTOMATIC

> Constituição do projeto. A **Parte A** (este documento) descreve o domínio, a stack e as
> regras específicas do EA AUTOMATIC. A **Parte B** (a definição dos 8 agentes, a Lei da
> decisão e o gate de deploy) é herdada do CentraAtend e vive em `.claude/agents/` +
> `.claude/settings.json`. O coordenador lê este arquivo a cada sessão antes de despachar tarefas.

---

## A.0 — Princípio de operação

- **Delegação à fábrica.** O diretor (Rike) não executa atividades delegáveis. Tudo que a
  fábrica pode fazer sozinha — repositório, estrutura, agentes, infraestrutura, código, testes,
  deploy interno — a fábrica faz. A ação do diretor restringe-se a: **destravar** (acessos e
  insumos que só ele detém), **decidir** (o que foge deste documento) e **validar** (aprovação
  visual das entregas). A fábrica nunca se autoconcede acesso.
- **Autonomia do coordenador.** Durante a construção, o coordenador tem autonomia total **dentro
  do escopo deste documento**. Resolve correções, problemas técnicos e decisões de implementação
  no loop, articulando os agentes. **Escala ao diretor em um único caso: quando a demanda foge
  deste documento** (exemplo: alterar uma regra da IA de validação).
- **Validação visual obrigatória.** Funcionalidade com interface para antes de despachar para
  segurança/tester; teste verde de agente não substitui a aprovação visual do diretor.

---

## A.1 — O que é o EA AUTOMATIC

Sistema de gestão da esteira admissional do Grupo Soulan. Conduz o onboarding de novos
colaboradores, do recebimento do candidato à finalização da admissão. Substitui a planilha
Google compartilhada usada hoje, trazendo controle de acesso por papel, sinalização estruturada
de pendências, auditoria documental assistida por IA e trilha confiável de status por frente.

**Usuários.** Consultores operam as etapas em paralelo (papel Comum); administração e diretoria
consomem dashboards e administram cadastros (papel Master/Super Admin).

**Restrições firmes.**
- Roda **on-premise**, na mesma VM do CentraAtend, com **namespace próprio** (portas, containers
  e volume distintos — não colidir com `infra-db-1`, volume `dbdata`, porta 3000).
- Construído via **Claude Code** (fábrica de 8 agentes). A IDE Antigravity é só editor/visual.
- Documentos auditados **não persistem no banco** — vão ao Drive e são descartados.
- **CPF** é a chave única de identidade do candidato.
- Integrações externas (Pandapé, Drive, Clicksign) são **módulos desacoplados**, nunca
  dependência de núcleo.

---

## A.2 — Stack (espelha o CentraAtend onde importa)

- **Monorepo pnpm** (Node 20). Apps: `backend` (NestJS 10 + TypeScript), `frontend`
  (Next.js 14 App Router + React 18), `ai-service` (Python 3.12 + FastAPI, gerido por uv).
  Pacote `shared-types`. O `ai-service` consome **Vertex AI / Gemini (Google)** via SDK do
  Google Cloud, autenticado por **service account** (não usa Claude API).
- **Banco:** PostgreSQL 16 em Docker (bind loopback), **Drizzle ORM** + drizzle-kit para
  migrations. **Redis 7** para fila (BullMQ) e rate-limit. Imagem pgvector mantida por paridade;
  embeddings **não** usados na fase inicial.
- **Auth:** reaproveitada do CentraAtend — JWT HS256 + refresh token em cookie, argon2,
  `JwtAuthGuard` global + `RolesGuard` (RBAC), OriginGuard, throttler.
- **Estilização:** **Tailwind CSS** (divergência consciente do CentraAtend; escolha de
  build-time, sem impacto na operação).
- **Serving/deploy:** Docker Compose (infra + apps), `restart: unless-stopped`, healthchecks,
  proxy same-origin via `rewrites()` do Next. Exposição via servidor-ponte da TI + ZeroTier.

---

## A.3 — Modelo de domínio

**O EA não modela Vaga.** Quando o candidato chega, a vaga já virou o **cargo** dele.

Entidades centrais:
- **Cliente** — chave `cod_cliente` (sempre o cliente). Atributos fixos: `cnpj`, `razao_social`,
  `nome_operacao`, `empresa_grupo` (empresa do Grupo Soulan a que pertence), `regiao` e
  `descricao_regiao`. Atributos de **padrão sugerido** (pré-preenchem o wizard; o consultor edita,
  **não são rígidos**): `beneficios_padrao`, `escala_padrao`, `endereco_padrao`. O De/Para
  apelido↔razão social resolve-se pelo código. *(Expansão autorizada pelo diretor na Fase 1B.)*
- **Cargo** — catálogo próprio; normalização contínua dentro do sistema.
- **TipoDocumento** — 21 tipos (da base de documentos).
- **ReguaDocumental** — chave `(cod_cliente + cargo)` → por tipo de documento: obrigatório /
  não obrigatório / facultativo. Coração da auditoria e do checklist de pendências.
- **Candidato** — chave `cpf`. Pode ter N admissões.
- **Admissão** — entidade central. Liga Candidato + Cliente + Cargo. `tipo_contrato`, `matricula`,
  datas, `farol_global`, `is_banco`, `sinalizador_preenchimento`.
  - **`farol_global`** (Fase 4 complemento): `EM_ADMISSAO` (inicial) · `BANCO_AGUARDAR` · `ADMISSAO_CONCLUIDA`
    · `DECLINOU` · `RESCISAO`. **Automático** (derivado, não sobrescreve os manuais): `BANCO_AGUARDAR`
    quando Auditoria=ANALISE_OK **e** Exame=APTO **e** `data_admissao` ausente; ao preencher a data,
    volta a `EM_ADMISSAO`. **Manuais** (pegajosos): `DECLINOU`, `RESCISAO` e `ADMISSAO_CONCLUIDA`
    (todas as etapas + contrato assinado — flag manual até a INT-4). *(Antes: ATIVO→EM_ADMISSAO;
    BANCO_PAUSADA→BANCO_AGUARDAR.)*
  - **`is_banco`** (boolean): admissão de banco — a ausência de `data_admissao` NÃO é pendência (é
    esperada); no lugar, o **Termo de Banco** (TipoDocumento próprio, arquivado na subpasta ADMISSÃO
    do Drive) é a pendência obrigatória de formalização.
  - **Automação da Auditoria (regra 2/complemento):** quando todos os obrigatórios da régua ficam
    VALIDADO (régua completa), a frente AUDITORIA vai a `ANALISE_OK` **automaticamente** (sem clique),
    abrindo o gate do Cadastro (regra 3) e reavaliando o farol. Consistente com a regra 9 (a IA não
    avança com pendências obrigatórias — régua completa = zero pendências).
- **DadosVagaFolha** (anexo) — salário, benefícios, escala, `endereco`, centro de custo,
  departamento, gestor BP, motivo, tempo de contrato. Benefícios/escala/endereço pré-preenchem a
  partir dos `*_padrao` do cliente (F1), editáveis. *(`endereco` adicionado na Fase 1B.)*
- **DocumentoAdmissão** — estado por documento exigido (pendente/entregue/inconforme). **Só
  status, nunca o arquivo.**
- **FrenteAdmissão** — cada frente (AUDITORIA, EXAME, CADASTRO-CONTRATO) como entidade própria,
  com status, responsável e datas independentes.
- **Usuário** — RBAC (Comum / Master / Super Admin).
- **IntegraçãoPandapé** (anexo opcional) — `id_precollaborator`, `id_match`, `id_vacancy`,
  etapa atual. Presente só quando a admissão entrou via Pandapé.

**Status por frente (dados reais):**
- Auditoria: análise ok · análise pendente · aguard. reenvio dos docs · declinou
- Exame: a agendar · agendado · apto · cancelado
- Cadastro/Contrato: a cadastrar · cadastrado · enviar · enviado · integração

**Regras de domínio:**
1. Nascimento paralelo: ao criar a Admissão, nascem AUDITORIA e EXAME simultaneamente.
2. Independência das frentes: concluir uma não altera a outra.
3. Gate do Cadastro: CADASTRO-CONTRATO só abre com AUDITORIA **e** EXAME concluídas.
4. A régua resolve por (cliente+cargo): muda o cargo, muda o checklist.
5. Não-bloqueio: Admissão é criável com obrigatórios vazios; o sinalizador marca, nunca impede.
6. Reaproveitamento por CPF: CPF existente oferece reaproveitar dados, preservando histórico.
7. Documento é efêmero: guarda-se o status; o binário transita e é descartado.
8. **Log de aceite por passagem (trilha, não penalização).** Todo avanço de frente na Esteira
   (Auditoria→Exame, Exame→Cadastro) com campos obrigatórios pendentes exige **aceite explícito** do
   consultor e gera um **log permanente e consultável** (quem, quando, quais campos pendentes). É
   trilha de passagem — distinta do log de não conformidade (§A.6); a penalização é decidida na tela
   de Não Conformidades, não aqui. *(Ajustes-2B-2C, S3.)*
9. **Gate da IA (Fase 4/F2) é mais rígido que o humano.** Quando o motor de IA entrar, ele **não
   avança de fase** se houver pendências obrigatórias — o gate humano admite o avanço com aceite
   (regra 8), o gate da IA não. *(Regra futura — implementar na Fase 4.)*
10. **TTL do CPF de substituição (LGPD).** Quando o motivo de contratação é "Substituição", o CPF da
    pessoa substituída é retido por no máximo **48h após a assinatura do contrato** e então
    **expurgado automaticamente** (mesmo padrão da staging efêmera, §A.6) — retenção mínima
    necessária para o cadastro na folha/eSocial. *(Ajustes-2B-2C, W2.)*

**Princípio da Independência Operacional com Integridade de Processo.** Cada frente opera
autônoma no seu menu (fila, status, responsáveis próprios), mas todas compartilham a mesma
Admissão. Independência na operação; integridade no fluxo, garantida pelo gate do Cadastro.

---

## A.4 — Catálogo funcional (F1–F12)

- **F1** Autopreenchimento por cliente (origem híbrida; cadastro próprio é o caminho primário).
- **F2** Auditoria documental com IA + Drive. Entrada por upload manual ou pull Pandapé.
  **Auditoria incremental** por documento; frente fecha por **completude da régua obrigatória**;
  arquivamento no Drive disparado pela completude. **Staging efêmera** (expurgo no fechamento,
  TTL 48h). Prontuário no Drive: nome do funcionário + cliente; descarte local.
- **F3** Validador de CPF.
- **F4** Pendências sem travamento.
- **F5** Sinalizadores (ok/inconformidade/parcial/competências) + modal só de pendências.
- **F6** Wizard em etapas: cliente → cargo/vaga (salário, benefícios, alçada) → candidato.
- **F7** Filtros dinâmicos em tempo real.
- **F8** Menu Esteira: faróis em abas independentes (Auditoria, Exame com upload de ASO,
  Cadastro/Contrato). Edição de status e avanço por aba, só com os seletores do status atual.
- **F9** Gerador de kit + assinatura. Desmembra PDF-mãe por candidato; kit pronto dispara a
  assinatura (INT-4); assinado retorna ao Drive. Kit só nasce após as três frentes (gate F12).
  - **Evolução prevista (junto com a INT-4, não antes):** ao subir o PDF-mãe, o sistema
    **identifica automaticamente todos os candidatos presentes** no PDF, separa **um kit por
    candidato**, **linka cada kit à admissão correspondente** no banco e **dispara o envelope de
    assinatura na Clicksign para cada candidato**. A seleção manual de candidato (comportamento
    atual da Fase 4) é **substituída pela identificação automática**. Implementar **junto com a
    INT-4 (Clicksign)**, não antes.
- **F10** Gerenciador (tabela): editar/salvar/deletar, filtros avançados, pesquisa global.
- **F11** Duplicado por CPF com reaproveitamento.
- **F12** Frentes paralelas e independentes (ver regras de domínio).

**Menus:** Dashboard · Nova Admissão (F6) · Esteira/Faróis (F8) · Gerenciador (F10) ·
Administração de Cadastros (clientes, cargos, régua — restrito à administração).

---

## A.5 — Integrações

**INT-1 Pandapé (ATS).**
- Entrada **por webhook** — **modelo vigente** (decisão do diretor, commit `4f8e69e`, 02/07/2026).
  O Pandapé emite o evento "Candidato enviado para admissão" (payload traz `IdPreCollaborator`,
  confirmado pelo suporte); um **servidor intermediário na VPN (box do Fernando)** recebe e repassa
  o `POST /api/webhooks/pandape` ao EA. O handler valida origem (`PandapeWebhookGuard`: header
  `x-pandape-webhook-token` **ou** allowlist de IP via `X-Forwarded-For`; **fail-closed** → 401 sem
  credencial), extrai o id, **enfileira** na fila BullMQ e responde rápido (202); o worker faz o
  enriquecimento. Com o `IdPreCollaborator`, chama `GET .../precollaborators/{id}` e puxa dados +
  links de documento. **Auth de origem por `PANDAPE_WEBHOOK_TOKEN`/`PANDAPE_WEBHOOK_IPS`; auth da
  API Pandapé por `PANDAPE_API_TOKEN`** (Bearer, via env). Sem credencial a rota nasce **fechada/
  inerte**, sem hardcode. *(O webhook G.Infor permanece intocável.)*
- **Cron-pull de descoberta — DEPRECADO.** O desenho anterior (commit `3f95921`, 30/06/2026) previa
  ingestão por verificação periódica (`POST /internal/pandape/tick`, `*/5 7-23 * * *`, protegido por
  `X-Internal-Token`). Foi **substituído pelo webhook**: a **API v1 do Pandapé não tem endpoint de
  listagem/descoberta de pré-colaboradores** (confirmado pelo suporte), então `listarMudancas()`
  retorna `[]` e o cron não descobre nada sozinho. A rota `/internal/pandape/tick` e o worker
  **permanecem no lugar, inertes**, úteis apenas para re-sync pontual de um id **já conhecido**
  (mudança de etapa); `infra/install-pandape-cron.sh` está marcado como DEPRECADO (não instalar).
- **Idempotência:** `integracao_pandape` registra o `IdPreCollaborator` (índice unique) de cada
  processado. Novo → cria Candidato+Admissão+Frentes (AUDITORIA+EXAME, regra 1)+Documentos pela
  régua; conhecido com etapa diferente → atualiza só a etapa; conhecido mesma etapa → no-op.
  Rodar o job 2× sobre o mesmo payload não duplica nada.
- Saída **manual**: não há endpoint de movimentação de etapa. "Admissão finalizada" é clicada
  pelo consultor no Pandapé. Sem RPA.
- **Rate limit 1.000 req/5min compartilhado** → fila **BullMQ** (Redis `ea-redis`, db/prefix
  isolados) com worker rate-limited (folga sob o teto) + backoff exponencial — requisito de
  segurança (excesso do EA pode atrasar o webhook G.Infor que alimenta a folha).
- Links de documento são **URLs públicas que não expiram** → baixar (só em memória), auditar
  (alimenta a F2 via staging efêmera), arquivar, descartar; **nunca persistir nem logar a URL**
  (LGPD §A.6).
- **Cliente/Cargo:** quando o endpoint da vaga (`IdVacancy`) retorna cliente (nome/CNPJ) e cargo,
  mapeia para `cod_cliente`+`cargo`; quando não resolve, a criação é **adiada**
  em vez de inventar `cod_cliente` — reprocessável quando o webhook reentregar / o dado chegar,
  depende do **de/para Pandapé→catálogo** (insumo do diretor,
  §A.9, par com as regras de auditoria e o mapa de tipos de documento).

**INT-2 Google Drive.** Service account com delegation (padrão CentraAtend). Prontuário nomeado
nome do funcionário + cliente, documentos renomeados; arquivos descartados após salvar.
Pendências: provisionar service account, definir árvore de pastas.

**INT-3 Motor de IA.** No `ai-service` (FastAPI), isolado, consumindo **Vertex AI / Gemini
(Google)** via SDK do Google Cloud. Autenticação por **service account** no projeto Google Cloud
**`ea-v2-automatic`** (org soulan.com.br), que já existe. A mesma service account (ou irmã no
mesmo projeto) serve Drive (INT-2) e Vertex AI (INT-3) — credencial Google unificada, escopos
distintos. Usos: auditoria documental incremental (F2) e geração de kit (F9). **Régua** = quais
documentos são exigidos; **regras de auditoria** (pendência a fornecer pelo diretor) = se cada
documento está válido.

**INT-4 Clicksign (assinatura).** Pipeline a partir do PDF-mãe: upload → desmembra (F9) → vincula
→ **kit pronto (gate F12: as 3 frentes concluídas) dispara o envelope** (API v3, JSON:API; auth por
header `Authorization: <CLICKSIGN_API_TOKEN>`). Criação do envelope: `POST /envelopes` (draft) →
`POST .../documents` (PDF base64 inline) → `POST .../signers` (nome completo + e-mail + **CPF
mascarado** `000.000.000-00`, dígito validado) → `POST .../requirements` (agree/sign + provide_evidence/
email) → `PATCH .../{id}` status `running`. O `clicksign_envelope_id` é gravado na admissão.
- Acompanhamento por **verificação periódica (cron-pull)** — *modelo adotado em substituição ao
  webhook originalmente previsto, mesma decisão da Fase 5 (Pandapé): sem exposição pública.* Job
  por cron na VM dispara `POST /internal/clicksign/tick` (guard `X-Internal-Token`) **a cada 1 min,
  das 7h às 23h** (`*/1 7-23 * * *`). O tick consulta os envelopes `AGUARDANDO_ASSINATURA`
  (`GET /envelopes/{id}`); cadência minuto-a-minuto pela janela curta da URL do arquivo. Fila
  **BullMQ** (`ea-redis`, isolada) com limiter sob o teto **sandbox 20 req/10s / prod 50 req/10s** +
  backoff.
- No envelope `closed`: a URL do PDF assinado vem em `GET /envelopes/{id}/documents` →
  `data[].links.files.original` (S3 presigned, **expira ~5 min**) → baixar **síncrono no mesmo ciclo**
  e arquivar na subpasta **ADMISSÃO** do Drive (mesma régua de pastas da Fase 4); grava
  `contrato_assinado_drive_url` e marca `clicksign_status = ASSINADO`. A URL da Clicksign **nunca é
  persistida nem logada** (§A.6). Dependência externa com custo, já em uso hoje.
- Indicador de status do envelope (`AGUARDANDO_ASSINATURA`/`ASSINADO`/`CANCELADO`) na ficha e na aba
  Cadastro da Esteira; **"Aguardando assinatura" permanece visível na fila** (trabalho em andamento,
  embora a frente Cadastro já esteja em INTEGRAÇÃO). Link do contrato assinado reusa o logo do Drive.
- **Reenvio por correção:** cancelar o envelope errado, corrigir no EA, regerar kit (F9), novo
  envelope. *Nota de sandbox: envelope em `running` não tem cancelamento programático nesta conta
  (DELETE só em `draft`); o cancelamento é **best-effort** e o estado autoritativo é o EA
  (`clicksign_status = CANCELADO`) + a trilha de dupla correção — coerente com "responsabilização,
  não verificação técnica".* Drive mantém versão (cancelado + válido).
- **Alerta de dupla correção (bloqueio ativo com aceite):** pendência bloqueante exigindo aceite
  explícito do consultor de que corrigiu no **EA Automatic** e **diretamente no G.I** (não no
  Pandapé — envio Pandapé→G.I é único/irreversível). Aceite registra autor, data e termo de
  ciência (trilha de auditoria). Controle por responsabilização, não verificação técnica.

---

## A.6 — Segurança obrigatória (LGPD)

A frente de Segurança audita, com poder de veto, em todo PR que toca estes domínios:
- **Staging efêmera:** fora do banco, expurgo no fechamento, TTL 48h.
- **URLs externas (Pandapé; download do assinado da Clicksign):** só em memória; nunca em banco,
  nunca em log. (Persistir só referências do Drive, ex.: `contrato_assinado_drive_url`.)
- **CPF/dados pessoais:** CPF é chave técnica, não aparece em log; minimização.
- **Aceite de dupla correção:** log de auditoria sensível, permanente e consultável.
- **Auth/RBAC:** consultor não acessa rotas de administração; toda rota sensível com guard.

---

## A.7 — Gate de deploy (correção herdada do diagnóstico CentraAtend)

No CentraAtend o `gate-deploy.sh` existia mas o hook `PreToolUse` **não estava registrado** — a
trava não funcionava. **No EA o hook nasce amarrado no `settings.json` desde o commit zero**,
cobrindo `git push`, `deploy`, `kubectl apply`, `docker push`. Sem flag `READY_*` em
`.claude/state/`, o verbo é bloqueado (exit 2). **Teste obrigatório da Fase 0:** push sem flag
tem de ser bloqueado de fato. Disciplina de worktree: poda após merge, nada sobrevive 48h.

---

## A.8 — Roadmap (resumo executável)

- **Fase 0 — Fundação:** repo, fábrica com gate ativo, infra Docker com namespace próprio,
  Parte A do CLAUDE.md. *Sem dependência externa.*
- **Fase 1 — Núcleo de dados e acesso:** Auth/RBAC, schema, admin de cadastros, carga das bases.
- **Fase 2 — Cadastro e Gerenciador:** wizard (F6), F1, F3, F4, F5, F11, F10, F7.
- **Fase 3 — Esteira e Frentes Paralelas:** faróis em abas (F8), F12, avanço por aba, ASO.
- **Fase 4 — Motor de IA e Arquivamento:** auditoria incremental, staging, Drive, kit (F9).
  *Depende de: regras de auditoria, service account, árvore do Drive.*
- **Fase 5 — Integração Pandapé:** webhook receptor (`POST /api/webhooks/pandape`), cliente da API,
  criação automática idempotente, sincronização de etapa, pull de documentos para a F2, badge de origem.
  *Modelo **webhook** (vigente, commit `4f8e69e`, 02/07/2026) — cron-pull de descoberta DEPRECADO por
  limitação da API v1 (sem endpoint de listagem). Depende de: `PANDAPE_API_TOKEN` +
  `PANDAPE_WEBHOOK_TOKEN`/`PANDAPE_WEBHOOK_IPS` (diretor/Fernando), do ingress na VPN (box do Fernando)
  e do de/para Pandapé→catálogo (cliente/cargo/tipos de documento).*
- **Fase 6 — Dashboards/BI.** *Depende de: definição dos dashboards.*

Fases 0–3 são o núcleo, construível imediatamente. Insumos das fases 4–6 são reunidos pelo
diretor em paralelo à construção do núcleo.

---

## A.9 — Pendências do diretor (destravar/decidir, não bloqueiam o núcleo)

- Regras de auditoria documental (critério de aprovação da IA na F2) — pendência mais pesada.
- Service account no projeto Google Cloud `ea-v2-automatic` (já existe) + habilitar APIs
  (Vertex AI API, Drive API) + definir árvore de pastas do Drive. *Necessário só na Fase 4.*
- **Ingress do webhook na VPN (Fernando).** O modelo vigente é **webhook** (commit `4f8e69e`,
  02/07/2026): o box intermediário do Fernando (na VPN ZeroTier) repassa o POST do Pandapé ao EA.
  Não é exposição pública do EA — o backend permanece **loopback** (`127.0.0.1:3011`); o ingress é o
  proxy same-origin do Next (`0.0.0.0:3010`, rota `/api/webhooks/pandape`). *(A tentativa anterior de
  dispensar o ingress via cron-pull — commit `3f95921`, 30/06 — foi revertida: a API v1 não descobre
  pré-colaboradores.)*
- **`PANDAPE_API_TOKEN`** (diretor solicita ao suporte Pandapé) + **de/para Pandapé→catálogo**
  (cliente/cargo via `IdVacancy` e tipos de documento). Sem o token a Fase 5 fica pronta porém
  inerte; sem o de/para, admissões com vaga não-mapeada são adiadas (não inventam `cod_cliente`).
  *Necessário só na Fase 5 (ativação).*
- Base oficial de clientes (código + CNPJ + razão social) — sobe no formato atual.
- Definição dos dashboards.
- Acessos: GitHub (repo criado), VM, Pandapé, Clicksign. Credencial de IA é a service account
  Google acima — **não há token Anthropic no EA**.

## A.11 — Convenção de UI: travessão PROIBIDO (regra permanente)

O caractere **travessão "—" (em dash, U+2014) é PROIBIDO em todo o sistema**: em qualquer texto de
UI, mensagem, rótulo, placeholder, título, aviso, tooltip, célula de tabela e comentário que chegue
ao usuário. No lugar, usar **vírgula, ponto, dois-pontos ou reescrever a frase**. Marcador de célula
vazia usa **"não informado"**, nunca o glifo. A regra vale para **toda entrega futura**, não só a OST
que a originou: nenhum código novo introduz travessão em texto apresentável. *(Decisão do diretor.)*

## A.10 — Registro de ideia futura (fora do escopo atual)

**Ponte EA ↔ CentraAtend (comunicar candidato por WhatsApp).** Botão "comunicar candidato" no EA
que delega o envio ao CentraAtend (que já é a plataforma de WhatsApp). Fase futura — acionar
quando o núcleo do EA (Fases 0–3) e o CentraAtend estiverem maduros. Requer o CentraAtend expor
um serviço de envio consumível + template HSM aprovado pela Meta. O coordenador deve lembrar o
diretor no gatilho natural.
