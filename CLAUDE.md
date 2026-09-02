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
- **TipoDocumento** — **30 tipos** (da base de documentos). Catálogo **vivo**, com CRUD próprio na
  tela da Régua documental (criar/renomear/inativar/reativar, rota `admin/tipos-documento`), então
  este número **muda**: a fonte da verdade é a tabela `tipos_documento`, não este documento.
  *(Antes constava "21 tipos", defasado.)*
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
  links de documento. **Auth de origem** por `PANDAPE_WEBHOOK_TOKEN` (o `PANDAPE_WEBHOOK_IPS` fica
  vazio de propósito: o box está atrás de NAT e só enxerga IP interno, então o modelo é
  **token-only**). **Auth da API Pandapé** é **OAuth2 client_credentials**: `PANDAPE_CLIENT_ID` +
  `PANDAPE_CLIENT_SECRET` trocados por token em `PANDAPE_TOKEN_URL` (**não** existe
  `PANDAPE_API_TOKEN`; o nome antigo era erro de documentação). Sem credencial a rota nasce
  **fechada/inerte**, sem hardcode. *(O webhook G.Infor permanece intocável.)*
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
email) → `PATCH .../{id}` status `running` → **`POST .../{id}/notifications`**. O
`clicksign_envelope_id` é gravado na admissão.
- **O pipeline tem CINCO passos, não quatro. Ativar NÃO notifica.** O `PATCH status=running` só deixa
  o envelope pronto; quem dispara o e-mail que chama a pessoa para assinar é o
  `POST /envelopes/{id}/notifications`. Enquanto essa chamada faltou, o contrato ficava `running`,
  válido e parado, e o funcionário nunca era chamado: **106 contratos em 24/08/2026**, dos quais uma
  amostra de 24 mostrou 23 que ninguém sequer abriu. Medido contra a produção, não deduzido (envelope
  ativado havia 34s tinha zero notificação; a Clicksign devolveu `notified: true` só no passo 5).
  **A ORDEM É `ativar → gravar o envelope no banco → notificar`**: a guarda de "já tem envelope vivo"
  lê o banco, então notificar antes de gravar faria uma falha virar envelope duplicado na retentativa.
  Falha ao notificar **não derruba o job** (o envelope já existe; lançar não desfaz e arrisca duplicar):
  vira ERRO no log e fica visível no carimbo `clicksign_notificado_em`.
- **Rate limit, medido em produção (25/08/2026):** teto global **50 requisições por janela FIXA de 10s**
  (`x-rate-limit`, `x-rate-limit-remaining`, `x-rate-limit-reset` vêm em toda resposta). O
  `notifications` tem **balde próprio: 1 chamada por janela de 60s, POR ENVELOPE** (repetir o mesmo
  envelope dá 429; envelopes diferentes na mesma janela dão 201). Três consumidores dividem o balde
  global: a tela de gestão, o disparo e o tick do cron.
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
  Cadastro da Esteira. **Cadastro concluído SAI da fila da aba Cadastro, mesmo com a assinatura
  pendente** (decisão do diretor, 20/08/2026): a aba passa a ter UMA régua só, a mesma das outras
  três, concluiu e sai. *(Antes constava o contrário: "Aguardando assinatura" permanecia visível na
  fila. Aquela ressalva era da INT-4, de quando a assinatura não tinha tela própria; hoje tem, a
  **Gestão Das Assinaturas** do Ass.Click, e repetir a linha aqui só poluía a fila de quem faz
  cadastro com gente cujo cadastro já acabou.)* A admissão **não some do sistema**: segue no
  Ass.Click, no Gerenciador, na busca por candidato da própria aba e no filtro explícito pelo status
  de conclusão. O que muda é só a fila padrão. Link do contrato assinado reusa o logo do Drive.
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
  limitação da API v1 (sem endpoint de listagem).* **DESTRAVADA** (jul/2026): as credenciais estão
  configuradas e o suporte Pandapé (André) confirmou o disparo do webhook na mudança de etapa
  (payload com `IdPreCollaborator`). É o **item 2 da §A.18** (ligar o motor da esteira). *Dependência
  funcional remanescente: o de/para Pandapé→catálogo (cliente/cargo via `IdVacancy` e tipos de
  documento); sem ele a criação é adiada em vez de inventar `cod_cliente` (§A.5).*
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
- ~~**`PANDAPE_API_TOKEN`**~~ — **RESOLVIDO (jul/2026), não é mais pendência.** Duas correções aqui:
  (1) a credencial da API do Pandapé **não é** um `PANDAPE_API_TOKEN`: o cliente usa **OAuth2
  client_credentials** (`PANDAPE_CLIENT_ID` + `PANDAPE_CLIENT_SECRET`, token em `PANDAPE_TOKEN_URL`),
  e **ambos já estão configurados** no `.env` do backend; (2) a auth de origem do webhook
  (`PANDAPE_WEBHOOK_TOKEN`) **também já está configurada**, com o guard fail-closed ativo. O
  `PANDAPE_WEBHOOK_IPS` fica **vazio de propósito**: o box está atrás de **NAT** e o PHP só enxerga o
  IP interno, então allowlist de IP barraria o próprio Pandapé — o modelo adotado é **token-only**
  (decisão do diretor, ver `LEIA-ME-FERNANDO.md`). O suporte Pandapé (**André**) confirmou e
  destravou o disparo do webhook na mudança de etapa. **A Frente 2 está DESTRAVADA.**
- **De/para Pandapé→catálogo** (cliente/cargo via `IdVacancy` e tipos de documento) — **segue
  pendente**. Não trava a Frente 2: sem ele, admissão com vaga não-mapeada é **adiada** e
  reprocessável, nunca inventa `cod_cliente` (§A.5). *Necessário para a ativação plena.*
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

## A.12 — Padrão único de tabela (regra permanente)

O sistema tem **UMA ÚNICA máscara visual de tabela**. Toda tela com tabela (Farol, Gerenciador,
Clientes, Régua, Usuários e qualquer nova) segue este padrão, **sem precisar ser pedido**:
- **Colunas proporcionais e responsivas**: larguras equilibradas, sem apertar o conteúdo e sem
  overflow escondido. Colunas de status/pill recebem largura suficiente para o rótulo mais longo.
- **Títulos de coluna centralizados** no cabeçalho (thead / `.list-head`).
- **Divisória sutil e premium entre colunas**, com sombreamento leve no padrão do sistema
  (hairline `var(--border)` por sombra interna, sem alterar a largura das colunas).
- **Ícone dinâmico por status**: o ícone acompanha o estado real, nunca é fixo. Completo/ok =
  **check verde**; pendente = **exclamação amarela**; recusado/declinado = **X vermelho**.
- **Coluna de PENDÊNCIAS OBRIGATÓRIAS separada** (nunca embutida em Ações), com badge dinâmico
  que segue a regra do ícone acima.
- **KPI/card "Com pendências obrigatórias"** presente e **clicável como filtro** (toggle), igual
  aos demais cards da tela.

Referência visual: o Gerenciador (colunas Candidato · Cliente · Cargo · Contrato · Data adm. ·
Auditoria · Exame · Cadastro · Status · Pendências Obrig. · Ações). As três abas do Farol
(Auditoria, Exame, Cadastro) replicam a mesma identidade, adaptando as colunas de cada frente.
Vale a §A.11 (travessão proibido). *(Decisão do diretor.)*

## A.13 — Verificação visual obrigatória antes de reportar (regra permanente)

Nenhuma entrega que toque a interface é considerada concluída sem **prova visual**. Antes de
reportar qualquer entrega visual como "feita", a fábrica DEVE:
1. Abrir a página real no browser (localhost, build de produção servido, sessão autenticada).
2. Tirar **screenshot** de cada tela alterada e olhar o resultado renderizado, não só o código.
3. Confirmar no retorno que **nenhuma coluna está esmagada, sobreposta ou cortando conteúdo**
   (nomes/cargos não truncam de forma indevida; pills de status e badges de pendência ficam cada
   um na sua coluna; a tabela rola na horizontal em vez de espremer).
Teste verde de build/lint/typecheck NÃO substitui esse passo. Reportar "concluído" sem a
confirmação visual é falha de processo. O harness de screenshot (Playwright headless + login de
teste) é insumo da fábrica, mantido fora do repositório. *(Decisão do diretor, retrabalho visual.)*

## A.10 — Registro de ideia futura (fora do escopo atual)

**Ponte EA ↔ CentraAtend (comunicar candidato por WhatsApp).** Botão "comunicar candidato" no EA
que delega o envio ao CentraAtend (que já é a plataforma de WhatsApp). Fase futura — acionar
quando o núcleo do EA (Fases 0–3) e o CentraAtend estiverem maduros. Requer o CentraAtend expor
um serviço de envio consumível + template HSM aprovado pela Meta. O coordenador deve lembrar o
diretor no gatilho natural.

## A.14 — Escopo fechado: só o que a OST pede (regra permanente)

A fábrica **NÃO pode alterar, criar, modificar ou excluir absolutamente NADA** que não esteja
explicitamente listado no escopo da OST em curso (ou de qualquer OST futura). Isso inclui, sem
exceção: nomes de menu, rótulos, textos, posições de elementos, arquivos, rotas, componentes e o
comportamento de qualquer tela ou funcionalidade **não mencionada** na OST. **Na menor dúvida sobre
se algo está dentro do escopo, PARE IMEDIATAMENTE e pergunte ao diretor antes de agir**, mesmo que a
mudança pareça óbvia, pequena ou de bom senso. A fábrica não decide por conta própria o que "faria
sentido" mexer. Se a implementação do que foi pedido exigir tocar em algo fora da lista da OST, isso
também é motivo de parada e pergunta. *(Decisão do diretor, após violações: renomeação de menu
lateral sem pedido e texto movido para lugar errado. Não pode se repetir.)*

## A.15 — Pendência conhecida: F9 antiga acoplada ao INT-4 (não urgente)

A **F9 antiga** (gerador de kit manual, um kit por admissão a partir do PDF-mãe) foi **tirada do
menu** (a tela `/kit` não é mais acessível pela navegação; o Gerador de Kit atual vive em
`/gerador-kit`), mas o **código NÃO foi excluído** do repositório de propósito. Motivo: o fluxo de
**reenvio por correção do Clicksign (INT-4)** ainda depende dela, `reenviarCorrecao`
(`clicksign-sync.service.ts`) chama `KitService.gerar` (o método antigo) para regerar o kit e
disparar novo envelope (§A.5). Remover a F9 isolada **quebraria** o reenvio de correção do Clicksign
(build + fluxo operacional + testes).

**Ação futura (quando a frente do Clicksign/INT-4 for trabalhada):** primeiro **migrar o
`reenviarCorrecao` para não depender mais do `kit.gerar` antigo**, e só então **remover a F9 de vez**
(código, rotas `/kit/*/gerar` e `/kit/download/:token` e `/kit/historico`, `gemini.localizar_paginas_kit`,
schemas `KitRequest`/`KitResponse`, a tela `/kit` e `lib/kit.ts`). Não remover a F9 antes disso.
*(Registrado pelo diretor ao aprovar o Gerador de Kit novo.)*

## A.16 — Regras permanentes de importação da esteira (regra permanente)

Enquanto o diretor **importar** histórico de admissões (planilha / carga), toda importação da esteira
aplica estas duas regras **automaticamente, sem intervenção manual**. Valem para a carga atual e para
**toda importação futura**, até o diretor deixar de importar e passar a operar só pela frente viva.

- **Regra 1, admissão CONCLUÍDA** (origem ATIVO, farol `ADMISSAO_CONCLUIDA`): já aconteceu na vida
  real, então entra com **tudo concluído**. Auditoria `ANALISE_OK`, Exame `APTO` e Cadastro/Contrato
  `INTEGRACAO` (a frente de Cadastro é **criada** já concluída), todas `concluida=true`; **documentos
  `ENTREGUE`** (zero pendência obrigatória); **assinatura `ASSINADO`**; **sinalizador `OK`**. Data de
  conclusão das frentes = `coalesce(data_admissao, criado_em)`.
- **Regra 2, DECLÍNIO** (origem DECLINOU/RESCISAO/CANCELADA, farol `DECLINOU`/`RESCISAO`): **encerrado,
  nada ativo na esteira**. Frentes em estado de declínio (Auditoria `DECLINOU`, Exame `CANCELADO`),
  `concluida=false` (**não falsear êxito**); **não cria** frente de Cadastro; assinatura `SEM_ENVELOPE`;
  documentos **permanecem no estado real** (`PENDENTE`, histórico, nunca foram entregues). Quem declinou
  **não deixa nada ativo**; se voltar no futuro, é **processo novo do zero**.

**Declínio nunca entra em fila operacional nem conta como pendência em NENHUM card/KPI, em nenhuma
superfície.** Isso é garantido **em código** (não por manipulação de dados), pelo **filtro por farol**
(`DECLINOU`/`RESCISAO` excluídos): na Esteira em `esteira.service.listar` (itens das filas Auditoria/
Exame/Cadastro **e** todos os KPIs, inclusive "com pendências obrigatórias") e no Gerenciador em
`admissoes.service` (KPI/filtro "com pendências obrigatórias"). O declínio segue **visível só como
histórico consultável no Gerenciador** (farol `DECLINOU`, com as frentes em estado de declínio).

Na **coluna Pendências Obrigatórias** do Gerenciador, uma admissão com farol `DECLINOU`/`RESCISAO`
mostra a tag **"Declínio"** (derivada do farol, dado autoritativo), **nunca "Parcial" nem "Completo"**:
declínio está encerrado, não tem pendência de processo vivo. *(Bloco D.)*

**Onde vive a rotina:** `apps/backend/src/db/regras-esteira-import.ts` exporta
`aplicarRegrasImportacao(sql)`, idempotente e transacional, que aplica as duas regras por farol. Toda
rotina de carga (`carga-*.ts`) **chama essa função ao final**, após criar as admissões e definir o
farol, então a próxima importação **herda tudo automaticamente**. O runner `corrige-frente1.ts` só
re-aplica manualmente sobre uma base já importada. §A.6: a rotina opera só por farol/status, sem PII.
*(Decisão do diretor, OST regras permanentes de importação + correção da carga Frente 1.)*

## A.17 — Formulário de VT online (self-service mobile): EM CONSTRUÇÃO, por etapas

**Frente LIBERADA e em construção.** A tabela de preços (o insumo que bloqueava) **foi entregue e já
está no sistema**. Estado por etapa:

| Etapa | O que é | Estado |
|---|---|---|
| **1** | Tarifas de transporte (tabela + tela `/admin/tarifas`) | **em `main`/produção** (18 tarifas) |
| **2** | Formulário do candidato (`/vt`) + os 2 PDFs (optante / não-optante) | **em `main`/produção** |
| **3** | VT compõe o **Kit** (e auditoria) | **a fazer** |
| **4** | Tela de **Benefícios** | **em andamento** (parte 1 entregue: `admissao_beneficio`, `status_cadastro_beneficio`, memória cliente+cargo) |

**Acesso público:** pendência de **infraestrutura**, com o Fernando (**em andamento**). A tela `/vt`
está pronta e validada, mas hoje só é alcançável **dentro da VPN**; o candidato no 4G ainda não abre.
Pacote técnico pronto e testado (vhost `vt.soulanrh.com.br`, fail-closed, allowlist só dos caminhos
da `/vt`, `/api/auth/*` bloqueado, certbot). Falta o Fernando aplicar (DNS + vhost + certificado) e o
diretor validar da internet. *O código não depende disso: é infra.*

**Etapa 3 (a fazer):** o VT ainda **não** está ligado ao kit nem à auditoria. `tipos_documento` já tem
`FORMULARIO_VT` e `CARTAO_TRANSPORTE` cadastrados, porém **dormentes** (0 réguas, 0 documentos): o
catálogo já previa o documento e ninguém ligou os fios.

O texto abaixo é o escopo original da frente, mantido como referência do que foi pedido.

**Objetivo.** O candidato preenche o próprio vale-transporte pelo celular, e o formulário de VT é
anexado ao Kit Admissional para assinatura junto ao contrato.

**Escopo (do diretor).**
- **Mobile-first / responsivo.** O candidato entra digitando o **CPF**; o sistema carrega o nome
  completo automaticamente (o candidato já existe na base, chave CPF, §A.3).
- **Endereço por CEP** autocompletado via base dos Correios (parte confiável/fácil).
- **Conduções SEM cálculo automático de rota** (decisão do diretor: o pedaço difícil foi removido de
  propósito, sem dependência de API paga de rotas). O candidato preenche num formulário intuitivo:
  seleciona o **tipo de transporte** de uma lista e informa as conduções que usa. O sistema **sugere**
  a tarifa a partir de uma **tabela de preços interna vigente**, que o candidato confirma ou ajusta.
  O sistema soma ida + volta e o total.
- **Abrangência.** ~90% dos candidatos são de São Paulo capital e Grande SP. A tabela cobre Metrô SP,
  CPTM, ônibus municipal SP, EMTU (intermunicipal Grande SP) e Bilhete Único / integração. Tarifas
  públicas e estáveis, **cadastráveis e mantidas internamente** (provável catálogo próprio, padrão
  dos demais catálogos de admin).
- **Integração com o Kit.** Após o preenchimento, gera o formulário de VT e o **anexa automaticamente**
  ao Kit Admissional (F9 / INT-4) para assinatura junto ao contrato.
- **Regra de negócio.** O preenchimento do VT **NÃO é obrigatório** para o sistema gerar o Kit
  Admissional: o kit gera com ou sem VT.

**Insumo do diretor:** a **tabela de preços vigente** dos transportes (Metrô, CPTM, ônibus SP, EMTU,
Bilhete Único). **ENTREGUE e no sistema** (etapa 1), mantida pela tela `/admin/tarifas`.

**Complexidade:** média, bem definida. O ponto que seria difícil (cálculo automático de rota/tarifa)
foi deliberadamente cortado; o candidato preenche e a tabela só sugere valores.

**Status:** **em construção.** Etapas 1 e 2 em produção; etapa 4 em andamento (§A.18, item 1);
etapa 3 a fazer; acesso público em andamento com o Fernando.
*(Registro solicitado pelo diretor; atualizado para o estado real.)*

## A.18 — Ordem das próximas frentes (decisão do diretor)

Sequência **definida pelo diretor**. O coordenador segue esta ordem e não antecipa frente sem aval.

1. **Fechar a tela de Benefícios** (OST 2, **em andamento**). Consome a estrutura da etapa 4/parte 1:
   `admissao_beneficio` (pacote estruturado), `admissoes.status_cadastro_beneficio`
   (PENDENTE/CADASTRADO) e a memória de pacote por (cliente + cargo), derivada do último pacote.
2. **LIGAR O MOTOR DA ESTEIRA.** Fazer a esteira operar **ponta a ponta com admissões VIVAS de
   verdade**, não mais só dado histórico da carga. Hoje a base é quase toda finalizada (1.432
   concluídas + 724 declínios) e as filas vivem praticamente vazias; o motor é o que passa a
   alimentá-las. Inclui a **Frente 2** (admissões vivas entrando pelo **webhook do Pandapé**,
   **já destravada pelo André**) e o fluxo vivo rodando de verdade.
3. **Tela de Gestão de Pendências Obrigatórias** (§A.19). Depois do motor, de propósito: a fila só
   faz sentido quando existir admissão viva chegando para preencher.

## A.19 — Frente mapeada: Tela de Gestão de Pendências Obrigatórias

**Mapeada, a fazer DEPOIS de ligar o motor da esteira (§A.18, item 2).** Registrada aqui para o
coordenador acionar no gatilho certo.

**O que é.** Tela dedicada, **com entrada no menu lateral**: a **fila de trabalho** de quem preenche
informação obrigatória. Não é relatório, é lista de tarefa.

**Escopo (do diretor).**
- Lista as admissões **VIVAS** com **qualquer** campo obrigatório faltando: cliente, cargo, salário,
  data de admissão, tipo de contrato, centro de custo, gestor/BP, escala e pacote de benefícios.
- Cada linha mostra o **candidato** e **QUAIS campos faltam**. O time preenche **direto dali**.
- Ao **zerar** as pendências, a admissão **sai da fila** (a fila é o próprio estado, não uma marcação).
- **Ordenação por urgência:** proximidade da **data de admissão** (quem admite antes aparece antes).

**Reuso obrigatório: a régua unificada já existe, NÃO recalcular.** `pendenciasObrigatorias`
(`domain/admissao.ts`) é a fonte única, e o `sinalizador_preenchimento` **deriva** dela desde o
ajuste da etapa 4 (OK <=> zero pendência). Coluna do Gerenciador, KPI, radar, sinalizador e modal
já concordam por construção. Esta tela **consome** isso; qualquer régua nova recria exatamente a
divergência que aquele ajuste eliminou (a coluna dizia "Completo" enquanto o modal listava
pendência na MESMA admissão).

**Propósito distinto das telas que já existem** (não é sobreposição):
- **Gerenciador:** visão geral de todas as admissões, com filtro e busca.
- **Tela de Benefícios (OST 2):** gestão do benefício e do seu cadastro (PENDENTE/CADASTRADO).
- **Esta:** a **fila de resolução de pendência**, de qualquer campo obrigatório.

**Nota de recorte (§A.16 + ajuste da etapa 4):** a régua unificada vale para admissões **vivas**
(EM_ADMISSAO / BANCO_AGUARDAR). **Finalizadas** (ADMISSAO_CONCLUIDA) e **encerradas**
(DECLINOU / RESCISAO) **não são recalculadas** e **não entram nesta fila**: quem declinou não deixa
trabalho ativo, e o histórico da carga fica intacto.

**Status:** mapeada, aguardando o motor da esteira. *(Registro solicitado pelo diretor.)*

## A.20 — Largura de colunas e prova visual anti-esmagamento (regra permanente)

Em **toda tela com tabela**, a fábrica deve **sempre ajustar as larguras das colunas para aproveitar
ao máximo o espaço disponível**, e **sempre validar (§A.13)** que **nenhum nome de coluna, texto de
célula ou controle (seletor, botão) está sendo suprimido, cortado ou esmagado**. Complementa a §A.12
(máscara única de tabela) e a §A.13 (prova visual obrigatória): não basta a tabela existir, ela tem
de aproveitar o espaço sem vazios grandes de um lado e colunas espremidas do outro, e isso só é dado
como concluído com a screenshot conferida. *(Decisão do diretor, após colunas esmagadas na Esteira.)*

## A.21 — Rotina de commit e push (regra permanente)

**O gatilho é a validação do diretor na tela.** Validou, a fábrica está autorizada a **commitar E dar
push como rotina**, sem pedir aval a cada vez. Antes disso, nada sai.

Ordem obrigatória, sem atalho:
1. **Gate verde**: typecheck, lint e testes. Vermelho não passa, nem "só isso".
2. **Validação do diretor na tela** (§A.13/§A.0). Teste verde não substitui.
3. **Commit com recorte de escopo (§A.14)**: `git add` **nominal**, arquivo por arquivo, **nunca
   `git add .`**. O que não é da OST em curso fica solto no working tree.
4. **Push**.

**A trava da §A.7 continua valendo e NÃO é dispensada por esta seção.** O hook `PreToolUse`
(`scripts/gate-deploy.sh`) bloqueia o push sem flag `.claude/state/READY_*`. A rotina é: criar a flag
**depois** dos passos 1 e 2, dar o push, **remover a flag**. A flag é o registro deliberado de que o
gate e a validação aconteceram; ela nunca nasce antes deles nem sobrevive ao push. *(Decisão do
diretor: o push vira rotina; a trava permanece como mecanismo.)*

## A.22 — Regras de fluxo: estado atual (registro)

Fechamento de itens da **OST Regras de Fluxo**, para tirá-los do backlog e evitar retrabalho.

- **Tipo e tempo de contrato: IMPLEMENTADOS e funcionais.** São **dois campos distintos**, ambos em
  lista fixa, sem digitação livre (`apps/frontend/src/app/(app)/nova/page.tsx`):
  - **`tipoContrato`** (W5): Temporário · Terceirizado · Estágio · Interno · Fopag · Jovem Aprendiz.
  - **`tempoContrato`** (item 5 da OST Regras de Fluxo): **30/60/90/120/150/180/210/240/270** dias.

  *Nota de precisão: a lista 30…270 é o **tempo** de contrato, não o **tipo**. Os dois já estavam
  prontos; o registro aqui só corrige a confusão entre os campos.* **Saem do backlog.**
- **Escala vinculada (escala filtrada por cliente): CONGELADA** por decisão do diretor. Hoje o
  catálogo de escalas é aberto (`catalogos.listEscalas`, todas as escalas ativas), e o cliente só
  **pré-preenche** via `escala_padrao` (§A.3). Não implementar sem o diretor descongelar.
- **Pendente, único item remanescente: contador de documentos obrigatórios pendentes POR
  FUNCIONÁRIO.** Os **KPIs agregados de pendência já estão ativos** (Esteira e Gerenciador). O que
  falta é **só a exibição por linha**: o backend **já calcula e já envia** o número
  (`regua-completude.service.obrigatoriosPendentesCountMap` → campo `docsPendentes` nos itens da aba
  Auditoria), e o frontend **declara o campo mas nunca o renderiza**
  (`app/(app)/esteira/page.tsx`, o tipo tem `docsPendentes?: number` e nada consome). **A badge é a
  pendência, não o cálculo.** *(Registro solicitado pelo diretor.)*

## A.23 — Quem decide o que cada usuário enxerga é o diretor (regra permanente)

**A permissão de menu é decisão do diretor, nunca da fábrica.** Nenhuma concessão, remoção ou
alteração de menu de usuário acontece por iniciativa da fábrica, nem como efeito colateral de um
script rodado para outro fim. A fábrica só executa concessão de menu quando o diretor **pede aquela
concessão explicitamente**, e reporta antes/depois usuário a usuário.

**Vale inclusive para os scripts que existem.** `db/seed-menus.ts` (grandfather de quem nunca foi
configurado) e `db/backfill-menus-comum.ts` (concede TODO o grupo Operação ao COMUM) **não são
rotina de deploy**: rodá-los concede acesso, então só rodam sob pedido explícito do diretor.
Distribuir o menu novo aos usuários é passo separado, com decisão do diretor.

**MENU NOVO NASCE SÓ PARA O SUPER ADMIN (regra permanente).** Todo menu criado pela fábrica nasce
visível apenas para o SUPER_ADMIN. É o diretor quem libera quem usa e quem enxerga cada menu, pela
tela de liberação de menu-por-usuário feita para isso. A fábrica **registra** o menu no catálogo
(para ele existir e ser selecionável) e **para por aí**: nunca decide nem distribui quem vê o quê.
Menu novo que não aparece para os demais usuários **não é bug**, é o diretor ainda não ter liberado.

**O REGISTRO NO CATÁLOGO É AUTOMÁTICO, e isso não é concessão.** O registro dos menus vive em código
(`domain/menus`), mas a tela de liberação lista a TABELA `menus`. Enquanto a ponte entre os dois foi
um seed manual fora do deploy, menu novo subia funcionando e **invisível para liberar**: aconteceu com
o `clinicas` em 29/07/2026, que tinha rota, tela e CRUD no ar e não existia como opção na tela de
permissões. Agora `MenusCatalogoService` converge a tabela a partir do registro **a cada boot**, então
menu novo nasce listável pelo simples fato de existir em código. Ele **REGISTRA e nada mais**: o
grandfather (que concede) continua fora do deploy, dentro do `seed-menus.ts`, e só roda a pedido.

*(Decisão do diretor, após o backfill conceder `analise` e `nao-conformidades` a 3 usuários como
efeito colateral de conceder o menu de assinaturas.)*

**Nota operacional que a regra não cobre, e o diretor precisa saber:** a tela de Usuários salva por
SUBSTITUIÇÃO (`definirMenusDoUsuario` apaga todos os menus do usuário e regrava a lista enviada).
Quem abre a tela, o sistema ganha um menu novo enquanto ela está aberta, e depois salva, **remove o
menu novo sem perceber**, porque a página mandou a lista antiga. Foi o que aconteceu com o menu
`assinaturas` em 28/07/2026: sumiu de 4 dos 5 COMUM logo após o deploy.

## A.24 — Title case em títulos e tags (regra permanente)

Todo texto que seja **TÍTULO** ou **TAG** no sistema usa a **primeira letra de cada palavra em
maiúscula**. Vale para título de tela, título de card, título de modal, rótulo de aba, rótulo de
pill/badge de status e qualquer etiqueta curta que classifique algo.

Exemplos: "Aguardando Assinatura" (não "Aguardando assinatura"), "Prontos Para Solicitar", "Gestão
Das Assinaturas", "Sem Envelope".

**O que NÃO é título nem tag** segue a escrita normal, com maiúscula só na primeira palavra: frase de
apoio, texto de ajuda, mensagem de erro, descrição, corpo de modal, texto de botão que é uma AÇÃO
("Enviar para assinatura", "Trocar kit"). Botão é comando, não etiqueta.

Vale para toda entrega futura, não só para a OST que originou a regra. *(Decisão do diretor.)*

## A.25 — Validou, sobe e commita (regra permanente)

**Tudo que o diretor validar e estiver funcionando, a fábrica SOBE e COMMITA, e registra no DIARIO.**
Trabalho validado não fica parado só no working tree. A validação do diretor é o gatilho completo, não
só do commit: ela autoriza o ciclo inteiro, deploy, commit e registro.

A ordem, que absorve e não substitui a §A.21:
1. **Gate verde**: typecheck, lint e testes.
2. **Validação do diretor na tela** (§A.13/§A.0).
3. **Deploy**: build e restart do serviço que recebeu a mudança, com health conferido.
4. **Commit com recorte de escopo (§A.14)**: `git add` nominal, arquivo por arquivo, nunca `git add .`.
5. **Push**, com a flag `.claude/state/READY_*` criada depois dos passos 1 e 2 e removida logo após
   (a trava da §A.7 continua valendo e não é dispensada por esta seção).
6. **Registro no DIARIO** do que subiu.

**Por que a regra existe:** entrega validada e não commitada vira dívida invisível. O working tree
acumula frentes de sessões diferentes, ninguém sabe mais o que está no ar e o que é rascunho, e o
próximo deploy carrega junto trabalho que ninguém revisou. *(Decisão do diretor.)*

## A.26 — Mexeu em código validado, pergunta antes (regra permanente)

**Se a fábrica for tocar arquivo ou código JÁ VALIDADO, ou cujo alcance IMPACTE código já validado,
ela PERGUNTA ANTES de mexer.** Não basta o que ela vai alterar estar dentro da OST: se a alteração
alcança algo que já funciona e já foi aprovado, a pergunta vem primeiro.

O teste é de ALCANCE, não de intenção. Antes de editar, a fábrica verifica quem mais depende daquele
ponto (função compartilhada, serviço consumido por outra frente, tabela lida por outra tela, contrato
entre camadas) e, havendo código validado no caminho, pergunta antes de seguir.

**Motivo, com o caso que originou a regra:** há muitas frentes abertas ao mesmo tempo, e impacto
cruzado só aparece depois que já quebrou. Foi o que aconteceu na transição pós-ASO: a passagem para o
Cadastro parou de funcionar e ninguém viu, até uma admissão real travar na operação. Teste verde não
pega isso, porque o elo quebrado não tinha teste.

Complementa a §A.14 (escopo fechado, só o que a OST pede): a §A.14 trata do que NÃO está na OST, esta
trata do que ESTÁ na OST mas alcança o que já foi validado. Na menor dúvida, PARE e pergunte.
*(Decisão do diretor.)*

## A.27: Investigar a lógica e o impacto ANTES de implantar (regra permanente)

**Todo pedido do diretor, seja AJUSTE ou FUNCIONALIDADE NOVA, começa pela investigação do impacto, não
pela implementação.** Antes de construir qualquer coisa, a fábrica levanta:

- **Quem depende do que vai ser mexido:** que outras telas, frentes, contagens, consultas, filas ou
  rotinas leem aquele dado, aquela coluna, aquela expressão ou aquele serviço.
- **O que pode quebrar como efeito colateral**, mesmo que não pareça relacionado. O teste é de
  ALCANCE, não de tema: um dado escrito num lugar é lido em outros três.
- **Se muda o comportamento de algo já validado**, ainda que a mudança pareça interna.

**Havendo risco, o impacto é REPORTADO ao diretor ANTES de construir.** Não é pedir permissão para
trabalhar: é mostrar o que a mudança alcança, para o diretor decidir com o mapa na mão.

**O objetivo é EVITAR RETRABALHO.** Está se gastando tempo demais consertando o que não precisaria ter
sido mexido, ou o que foi mexido sem que ninguém olhasse o alcance. Corrigir depois custa mais do que
investigar antes, e custa na hora errada, com a operação parada e a diretoria olhando.

**O caso real que originou a regra (11/08/2026, 20:42).** Desmarcar a exigência de integração de UM
cliente quebrou a contagem de TRÊS telas ao mesmo tempo (Painel, Gerenciador e a análise do Alto
Volume), porque ninguém verificou que o carimbo do farol `ADMISSAO_CONCLUIDA` dependia da frente de
INTEGRAÇÃO nascer. Sem a frente, o farol nunca era escrito: as admissões terminavam a esteira presas em
EM_ADMISSAO, o Gerenciador as contava como concluídas pelas frentes, o Painel não as contava pelo farol,
e 56 admissões passaram a ser contadas duas vezes. A investigação do impacto levaria minutos; o conserto
levou uma frente inteira, com a diretoria olhando.

Complementa a §A.14 (escopo fechado) e a §A.26 (mexeu em código validado, pergunta antes): a §A.14 trata
do que NÃO está na OST, a §A.26 do que ESTÁ na OST e alcança código validado, e esta trata de **mapear o
alcance antes de escrever a primeira linha**, inclusive quando o pedido parece isolado. Vale para todo
ajuste e toda implantação daqui para frente. *(Decisão do diretor.)*

## A.28: Todo filtro é de MÚLTIPLA seleção (regra permanente)

**Todo filtro do sistema aceita VÁRIOS valores ao mesmo tempo**, nunca um só. Filtrar por dois ou três
clientes juntos, por duas etapas, por dois status, é o comportamento padrão e não um recurso especial.

- **Filtro NOVO já nasce múltiplo.** Não existe "começa simples e depois vira múltiplo": a régua de
  um valor só se espalha pela consulta, pelo estado da tela e pela URL, e desfazer isso depois custa
  mais do que nascer certo.
- **Filtro que JÁ EXISTE é convertido**, na ordem que o diretor aprovar. A conversão toca produção
  validada, então vale a §A.26: levanta-se a lista, mostra-se o alcance, e só então se mexe.
- **UM componente só, reusado.** Nada de um seletor múltiplo por tela. Onde já houver múltipla
  seleção funcionando, é nela que se padroniza; onde não houver, cria-se **uma** e todas passam a
  puxar dali. Duas implementações do mesmo filtro divergem no primeiro ajuste.
- **O backend acompanha.** Filtro múltiplo que a tela oferece e a consulta ignora é pior que filtro
  nenhum, porque mente. O parâmetro vira lista (o padrão `parseMulti` que a Esteira já usa) e a
  cláusula vira `IN`.

*(Decisão do diretor. Vale para toda entrega futura, não só para a OST que a originou.)*

## A.31: SÓ o que a OST pede, e o que falta se PROPÕE (regra permanente, reforço da §A.14)

**A fábrica constrói exatamente o que a OST pede, e nada além.** Não acrescenta KPI, card, coluna,
tela, filtro, campo ou recurso que o diretor não pediu, por mais sensato que pareça.

- **Achou que falta algo? PROPÕE e espera o aval.** A proposta é uma linha no relatório de entrega,
  não uma tela construída "para o diretor ver e decidir depois". Construir primeiro e perguntar
  depois transfere para ele o trabalho de desfazer.
- **Ler o CLAUDE.md ANTES de cada frente**, e seguir as regras que já estão escritas. Elas existem
  porque cada uma custou um retrabalho.
- **Cada sessão trabalha só na SUA frente**, sem decidir escopo por conta própria. Escopo é do
  diretor.

**Os dois casos que originaram o reforço**, ambos da frente do iFractal:
- o **menu gerencial** nasceu espelhando a tela da Esteira, listando admissões que ninguém pediu ali,
  e teve de ser refeito do zero;
- os **KPIs da Integração** ganharam cards que não estavam na OST, e a aba teve de ser reajustada.

**Por que a regra dói mais do que parece:** o que a fábrica acrescenta sozinha não é neutro. Ocupa
tela, entra na validação, vira dívida e, quando está errado, custa uma frente inteira para desfazer,
na hora errada. A §A.14 já dizia "só o que a OST pede"; esta repete porque a violação voltou por
outra porta, a de "melhorar" em vez de a de "renomear". *(Decisão do diretor.)*

## A.30: Quais colunas viram filtro é ESCOLHA DO DIRETOR (regra permanente)

**Ao criar uma tela com tabela, a fábrica TRAZ A LISTA das colunas e o diretor escolhe quais viram
filtro.** Não é espelho automático de todas as colunas, e não é escolha da fábrica: é uma pergunta
feita antes de construir, respondida caso a caso.

- **A fábrica pergunta ANTES**, com a lista das colunas na mão. Construir o filtro e depois descobrir
  quais sobram é retrabalho, que é o que a §A.27 existe para evitar.
- **Nem toda coluna vira filtro.** Campo de credencial (LOGIN, SENHA) não vira: ninguém procura uma
  pessoa filtrando por senha. Campo de identificação e de classificação (matrícula, cliente, nome,
  data, tipo, status) normalmente vira, e é por isso que a lista é oferecida, não adivinhada.
- **Todo filtro escolhido é MULTISELECT** (§A.28, mantida sem exceção), pelo mesmo componente
  compartilhado.
- **Coluna nova numa tela existente reabre a pergunta**, em uma linha: "esta vira filtro?".

**Por que a regra é esta e não o espelho automático:** filtro é como se acha a linha numa tabela de
milhares, então coluna de busca sem filtro custa caro na operação. Mas encher a barra de filtros que
ninguém usa custa também, em tela e em ruído, e a fábrica não tem como saber por qual campo o time
procura de verdade. Quem sabe é quem opera. *(Decisão do diretor, ajustando a primeira redação desta
regra, que dizia "espelho de todas as colunas".)*

**Escolha vigente da tela do iFractal:** viram filtro Matrícula, Cliente, Nome, Data De Admissão,
Tipo De Marcação e Status. NÃO viram Login e Senha.

## A.29: Toda tabela tem ordenação clicável no cabeçalho (regra permanente)

**Toda tabela do sistema ordena por clique no cabeçalho da coluna**: alfabética A a Z e Z a A, por
data, por número. Já era prática na Integração e na Gestão Das Assinaturas; passa a ser **regra**.

- **Reusar `useOrdenacao` e `ColunaOrdenavel`**, que já existem. Não criar componente novo, não
  escrever ordenação à mão na tela: um jeito só de ordenar no sistema inteiro.
- **Tabela nova nasce ordenável.** Entregar tabela sem ordenação é entrega incompleta, e não item de
  backlog.
- Complementa a §A.12 (máscara única de tabela) e a §A.20 (larguras e prova anti-esmagamento): a
  ordenação faz parte da mesma identidade, e a prova visual dela entra na mesma screenshot.

*(Decisão do diretor, após a Central de Vagas e a Central de Candidatos nascerem sem ordenação.)*

## A.32: AMBIENTE ÚNICO de homologação, e o diretor valida num lugar só (regra permanente)

**Todo trabalho em validação aparece no ambiente ÚNICO de homologação, a porta 3120
(`http://10.18.117.235:3120`).** Uma frente, uma sessão, um endereço. O diretor abre 3120 e enxerga
tudo o que está esperando o olho dele, sem escolher porta e sem escolher link.

- **A fábrica NÃO sobe ambiente separado** para mostrar uma frente. Nem "só para esta OST", nem "só
  para não misturar com a outra sessão", nem "só por hoje".
- **A fábrica NÃO manda o diretor para outra porta.** Mandar outro link é a forma que o erro toma na
  prática: ele chega numa tela que não tem a frente da outra sessão, conclui que sumiu, e a validação
  vira depuração de ambiente.
- **Se algum motivo técnico REALMENTE exigir outro ambiente, a fábrica AVISA E EXPLICA ANTES**, diz o
  que exige, por quanto tempo e o que fica onde. Nunca despacha o link e pronto. O aviso é obrigatório
  mesmo quando o outro ambiente parece óbvio para quem construiu.
- **Sessões simultâneas convivem no MESMO 3120.** Homologação é compartilhada por construção: é ela
  que faz o impacto cruzado entre frentes aparecer antes de a operação encontrá-lo, que é justamente o
  que a §A.26 e a §A.27 existem para pegar. Ambiente separado por sessão esconde a colisão até o merge.

**Produção continua sendo a 3010, e não é ambiente de validação.** A régua da §A.13 (prova visual) e
da §A.25 (validou, sobe e commita) não muda: a validação acontece na 3120, a publicação acontece
depois.

**O caso que originou a regra (27/08/2026):** uma frente foi publicada numa porta 3130 avulsa e o
diretor foi mandado para lá. A tela que ele abriu não continha o trabalho das outras sessões de A&S,
e o tempo da validação foi gasto entendendo qual endereço mostrava o quê, em vez de olhando a
entrega. *(Decisão do diretor.)*

## A.33: PROIBIDO arquivar contrato SEM ASSINATURA (regra permanente)

**O sistema NUNCA, sob NENHUMA circunstância, arquiva no Drive um contrato sem assinatura.** Não é
preferência de implementação, é regra: um documento sem assinatura arquivado como "Contrato Assinado"
é dano permanente e silencioso, porque do ponto de vista do sistema nada falhou.

- **Verificar ANTES de arquivar.** O binário prestes a subir é conferido: ele é o assinado de verdade
  (o `signed` da Clicksign, com o dicionário de assinatura digital) ou não é. Não sendo, o sistema
  **não arquiva, não marca ASSINADO, não apaga a cópia local do kit, não tira a admissão da fila** e
  **retenta no ciclo seguinte**. Abster-se é o comportamento seguro; arquivar errado é irreversível.
- **A guarda é explícita e mora no código**, não na disciplina de quem edita: `verificarContratoAssinado`
  (`domain/contrato-assinado.ts`), chamada em `arquivarAssinado` (`clicksign-sync.service.ts`) logo
  após o download e **antes de qualquer efeito**. Violada a guarda, o arquivamento é **bloqueado** e
  registrado como **ERRO** no log (sem PII, sem URL, §A.6). Nunca deixa passar.
- **O critério é ESTRUTURAL, medido contra a produção (01/09/2026):** o PDF assinado carrega
  `/ByteRange` e `/Name(Clicksign)`, que são a assinatura digital em si; o kit cru não carrega nenhum
  dos dois (3 de 3 envelopes reais, nas duas classes). Texto de página seria sinal frágil, porque há
  kit com página em imagem.
- **Travado em TESTE.** `contrato-assinado.spec.ts` (o critério) e o teste da regra dura em
  `clicksign-sync.tick.spec.ts` (o pipeline recusa o kit cru mesmo com download 200 e URL válida).
  Qualquer caminho futuro que volte a entregar o não-assinado ao arquivamento **quebra o teste antes
  de chegar em produção**. A regra é inviolável por código, não por lembrança.
- **A ausência do fallback não basta.** O `?? files.original` foi removido no commit `3e10ddd`, e
  ainda assim a guarda existe: fallback some numa refatoração, guarda com teste não.

**O caso que originou a regra (25 a 28/08/2026):** `obterUrlAssinado` caía em `files.original`, que é
o kit CRU. **Dez admissões** foram arquivadas sem assinatura, marcadas ASSINADO, tiveram o kit local
apagado e saíram da fila. Nove foram descobertas por varredura e recuperadas em 01/09; a décima caiu
na fresta entre a varredura e a subida da correção, e só apareceu porque se mediu de novo. Nenhum
alarme tocou em nenhuma delas. *(Decisão do diretor.)*

## A.34: SEMPRE dizer QUEM está trabalhando e em QUE (regra permanente)

**Todo pulso da fábrica declara, explicitamente, qual agente está executando e qual tarefa.** Sem
isso o diretor não tem como distinguir "a fábrica está produzindo" de "a fábrica parou", e foi
exatamente esse o problema: a tela dele mostrava parada enquanto o retorno dizia que a construção
seguia.

- **Formato obrigatório no pulso:** quem executa (o agente, ou o coordenador diretamente) e a tarefa
  em curso. Quando houver fila, dizer o que já terminou, o que está em execução e o que falta.
- **NUNCA afirmar que algo está "em andamento" quando o turno terminou.** Entre um turno e outro
  **nada roda sozinho**. "Vou seguir", "sigo com", "está rodando em segundo plano" só podem ser
  ditos quando existe, de fato, processo em segundo plano (comando em background ou agente
  despachado), e nesse caso o pulso diz **qual** e **como conferir**. Intenção não é execução, e
  descrever uma como a outra é relatório falso.
- **Trabalho terminado no turno se declara no passado**, com a prova. Trabalho que ainda não começou
  se declara como próximo passo, no futuro, sem fingir simultaneidade.
- **O gatilho do erro é conhecido: DUAS OSTs ao mesmo tempo.** Quando chega demanda nova no meio de
  uma frente, o coordenador se perde entre responder a nova e executar a antiga, e a antiga fica
  parada enquanto o texto sugere que anda. Nesse caso o pulso diz, na primeira linha, **qual das duas
  está sendo executada agora e qual está na fila**.

*(Decisão do diretor, após o retorno das 13 perguntas afirmar que a etapa 1 seguia em construção
enquanto a fábrica estava parada.)*

## A.35: TODO seletor usa o design system, e busca quando a lista é longa (regra permanente)

**Nenhuma caixa de seleção do sistema usa o `<select>` cru do navegador.** Todo seletor usa o
**`Select` do design system**, e ganha **campo de busca** quando a lista tem muitas opções.

- **O nativo está proibido.** O `<select>` do HTML abre o dropdown do SISTEMA OPERACIONAL, que não
  obedece ao tema do EA: no modo escuro vem cinza, no claro vem azul, e em qualquer um deles destoa
  de toda a tela ao redor. Não é preferência estética, é a única parte da interface que o sistema não
  controla.
- **A busca não é opcional em lista longa.** O `Select` já abre com campo de busca sozinho a partir de
  8 opções, e aceita `searchable` para forçar. Cliente com 60 lojas, catálogo de cargos, lista de
  clientes: sem busca, a pessoa rola até achar, e rolar até achar é o atrito que a tela existe para
  eliminar.
- **Vale para o que é NOVO e para o que for TOCADO.** Nenhuma entrega futura introduz `<select>` cru,
  e todo seletor nativo encontrado no caminho de uma OST é convertido junto, sem virar item de
  backlog.
- **Onde o nativo ainda é aceitável:** `<input type="date">` e afins, que são controles do navegador
  com comportamento próprio, e não listas de opção.

**Os dois casos que originaram a regra:** o seletor do iFractal nasceu nativo e precisou ser refeito,
e o **seletor de loja** (etapa 3 da frente de Lojas) repetiu o mesmo erro em 01/09/2026, com fundo
cinza e sem busca, mesmo com o `Select` do design system pronto e em uso em dezenas de telas. A
segunda vez é o que transforma um descuido em regra. *(Decisão do diretor.)*
