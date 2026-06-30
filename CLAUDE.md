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
- Entrada **por verificação periódica (pull agendado)** — *modelo adotado na Fase 5, em
  substituição ao webhook/ingress originalmente previsto* (decisão do diretor + admin de infra:
  elimina a exposição pública do servidor). Um **job agendado por cron na VM** dispara
  `POST /internal/pandape/tick` (protegido por `X-Internal-Token`) **a cada 5 min, das 7h às 23h,
  todos os dias** (`*/5 7-23 * * *`; fora da janela não executa). O tick consulta a API buscando
  candidatos com mudanças desde a última verificação (novos envios para admissão e mudanças de
  etapa em processos já conhecidos) e enfileira o processamento. Com o `IdPreCollaborator`, chama
  `GET /v3/precollaborators/{id}` e puxa dados + links de documento. **Autenticação por
  `PANDAPE_API_TOKEN`** (Bearer, via env; sem token a integração fica **pronta porém inerte**, sem
  hardcode). *(O webhook G.Infor permanece intocável; o pivot para cron-pull dispensa o ingress
  público da TI — antes pendência §A.9 da Fase 5.)*
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
  mapeia para `cod_cliente`+`cargo`; quando não resolve, a criação é **adiada** (o tick reabre)
  em vez de inventar `cod_cliente` — depende do **de/para Pandapé→catálogo** (insumo do diretor,
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
→ kit pronto dispara envelope (API 3.0). Acompanhamento por **webhook (push obrigatório — não há
polling em documentos)**. No `document_closed`, o payload traz `downloads.original_file_url`, que
**expira em ~5 min**: baixar imediatamente no handler e arquivar no Drive. Dependência externa com
custo, já em uso hoje.
- **Reenvio por correção:** cancelar o envelope errado (assinado vira "cancelado" no histórico),
  corrigir no EA, regerar kit, novo envelope. Drive mantém versão (cancelado + válido).
- **Alerta de dupla correção (bloqueio ativo com aceite):** pendência bloqueante exigindo aceite
  explícito do consultor de que corrigiu no **EA Automatic** e **diretamente no G.I** (não no
  Pandapé — envio Pandapé→G.I é único/irreversível). Aceite registra autor, data e termo de
  ciência (trilha de auditoria). Controle por responsabilização, não verificação técnica.

---

## A.6 — Segurança obrigatória (LGPD)

A frente de Segurança audita, com poder de veto, em todo PR que toca estes domínios:
- **Staging efêmera:** fora do banco, expurgo no fechamento, TTL 48h.
- **URLs do Pandapé:** só em memória; nunca em banco, nunca em log.
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
- **Fase 5 — Integração Pandapé:** job agendado (cron-pull), cliente da API, criação automática
  idempotente, sincronização de etapa, pull de documentos para a F2, badge de origem.
  *Modelo cron-pull em vez de webhook → **dispensa o ingress da TI**. Depende de:
  `PANDAPE_API_TOKEN` (diretor) e do de/para Pandapé→catálogo (cliente/cargo/tipos de documento).*
- **Fase 6 — Dashboards/BI.** *Depende de: definição dos dashboards.*

Fases 0–3 são o núcleo, construível imediatamente. Insumos das fases 4–6 são reunidos pelo
diretor em paralelo à construção do núcleo.

---

## A.9 — Pendências do diretor (destravar/decidir, não bloqueiam o núcleo)

- Regras de auditoria documental (critério de aprovação da IA na F2) — pendência mais pesada.
- Service account no projeto Google Cloud `ea-v2-automatic` (já existe) + habilitar APIs
  (Vertex AI API, Drive API) + definir árvore de pastas do Drive. *Necessário só na Fase 4.*
- ~~Ingress público do webhook (TI).~~ **Dispensado na Fase 5** — o modelo passou a cron-pull
  (verificação periódica), sem exposição pública.
- **`PANDAPE_API_TOKEN`** (diretor solicita ao suporte Pandapé) + **de/para Pandapé→catálogo**
  (cliente/cargo via `IdVacancy` e tipos de documento). Sem o token a Fase 5 fica pronta porém
  inerte; sem o de/para, admissões com vaga não-mapeada são adiadas (não inventam `cod_cliente`).
  *Necessário só na Fase 5 (ativação).*
- Base oficial de clientes (código + CNPJ + razão social) — sobe no formato atual.
- Definição dos dashboards.
- Acessos: GitHub (repo criado), VM, Pandapé, Clicksign. Credencial de IA é a service account
  Google acima — **não há token Anthropic no EA**.

## A.10 — Registro de ideia futura (fora do escopo atual)

**Ponte EA ↔ CentraAtend (comunicar candidato por WhatsApp).** Botão "comunicar candidato" no EA
que delega o envio ao CentraAtend (que já é a plataforma de WhatsApp). Fase futura — acionar
quando o núcleo do EA (Fases 0–3) e o CentraAtend estiverem maduros. Requer o CentraAtend expor
um serviço de envio consumível + template HSM aprovado pela Meta. O coordenador deve lembrar o
diretor no gatilho natural.
