# Plano de Spike — Viabilidade do cron-pull via API **v2** do Pandapé

### Prova de conceito para decidir: substituir o webhook pela descoberta de candidatos por *pull* (v2 `Match`)?

**Projeto:** EA AUTOMATIC — Esteira Admissional (Grupo Soulan)
**Integração:** INT-1 (Pandapé / ATS) — Fase 5
**Tipo:** Spike de viabilidade (investigação com dado real) — **NÃO é implementação de produção**
**Autor técnico:** Fábrica EA AUTOMATIC (coordenação de engenharia)
**Destino:** Fernando (Infra) + Diretoria — subsídio à decisão de arquitetura
**Documentos par:** `docs/RELATORIO-INVESTIGACAO-API-PANDAPE.md` (v1) · `…-V2-V3.md` (v2/v3)

---

## 1. Objetivo e enquadramento

A investigação da API v2 (2026-07-01) mostrou que existe um **caminho de *pull* para descobrir
candidatos** que a v1 não tinha (`GET /v2/matches?IdVacancy&IdVacancyFolder&Page&PageSize`, HTTP 200
ao vivo). Isso **reabre** a decisão cron-pull × webhook — mas **não a resolve**, por causa de quatro
lacunas. Este spike existe para **responder essas quatro perguntas com dado real e medido**, e só
então permitir uma decisão go/no-go informada.

> **Regra de ouro do spike:** ao final, cada uma das 4 perguntas tem uma resposta **SIM/NÃO/PARCIAL
> lastreada em número**, e um **veredito de viabilidade** (§7). Se qualquer pergunta bloqueante falhar,
> o webhook permanece — sem "achismo".

**O que este spike decide:** se o *pull* via v2 é **tecnicamente capaz** de substituir o webhook para a
descoberta de candidatos + acesso a documentos, dentro do orçamento de rate limit, de forma
sustentável. **O que ele NÃO decide:** a escolha final de arquitetura (é do diretor) nem entra em
produção (§9).

---

## 2. Princípios e guardrails (inegociáveis)

- **Nada de produção.** Sem instalar cron, sem novo schema, sem migration, sem alterar o
  `pandape-sync`. Todo código do spike vive em `scripts/spike-pandape/` (ou fora do repo), é
  **descartável** e **não é mergeado** no fluxo da Fase 5.
- **LGPD (§A.6) — mais rígido que o normal por ser exploratório:**
  - URLs de documento e dados pessoais **só em memória**; **nunca** persistir/logar `cpf`, nome,
    e-mail, telefone, endereço ou URL de documento.
  - Onde o spike precisar guardar estado entre execuções (ex.: Q2), persistir **apenas identificadores
    técnicos não-pessoais** (`idMatch`, `idVacancyFolder`, `modifyDate`) — e, se precisar comparar
    identidade, usar **hash** do CPF, nunca o CPF em claro.
  - Artefatos do spike (logs, snapshots) têm **TTL de 48h** e são expurgados ao fim (mesmo padrão da
    staging efêmera, §A.6).
- **Rate limit é sagrado.** O spike **compartilha o teto de 1.000 req/5min com o webhook do G.Infor
  que alimenta a folha**. Todo experimento roda com **limiter próprio conservador (≤ 100 req/5min
  durante o spike)** e **fora do horário de pico** combinado com a Infra, para **zero risco ao G.I**.
- **Somente leitura.** O spike só chama endpoints **GET**. Nenhum `POST/PUT/PATCH/DELETE` na conta
  real do Pandapé.
- **Reprodutível.** Cada medição registra data/hora, endpoint, status HTTP e o número medido — para o
  relatório final ser auditável por Fernando.

---

## 3. Insumos necessários antes de começar (destravar)

| # | Insumo | De quem | Bloqueia qual pergunta |
|---|---|---|---|
| I1 | **1–3 `idPreCollaborator` reais** do ambiente (candidatos que já viraram pré-colaboradores) | Diretor / RH | Q1 (referência para validar a ligação) |
| I2 | Confirmação do **valor do enum `VacancyStatus`** para "vaga ativa/aberta" | Swagger v2 / Pandapé | Q3 |
| I3 | Janela combinada para rodar probes ao vivo **sem risco ao G.I** (horário de baixa) | Fernando (Infra) | Q3 (medição de fan-out) |
| I4 | Canal com o **time de Operações do Pandapé** para as 4 perguntas de alinhamento (relatório v2/v3 §7) | Diretor | Q1, Q4 (fallback se a via técnica falhar) |

> I1 já estava pendente desde a investigação da v1 (não havia `idPreCollaborator` de teste; `id=1`→404).
> Sem I1, Q1 roda em modo degradado (só hipóteses estruturais, sem validação ponta-a-ponta).

---

## 4. Os quatro experimentos

Cada experimento é auto-contido: **pergunta → hipóteses → método (chamadas concretas) → o que medir →
critério de decisão (número) → risco**.

---

### Q1 — Existe ligação `Match → idPreCollaborator` (para chegar aos documentos)?

**Por que importa:** o `MatchResponse` da v2 **não traz `idPreCollaborator`**, e os `Documents[]`
(insumo da auditoria F2) **só existem** em `GET /vN/precollaborators/{id}`. Sem essa ligação, o pull
via `Match` descobre o candidato mas **não alcança os documentos** → não substitui o webhook para o
fluxo documental.

**Hipóteses a testar (em ordem de custo):**
- **H1 — Identidade direta:** `idPreCollaborator == idMatch`? Método: com um par conhecido (via I1),
  ler `GET /v2/precollaborators/{idMatch}` e comparar identidade (hash de CPF em memória) com o match.
- **H2 — Identidade por candidato:** `idPreCollaborator == idCandidate`? Mesmo método com `idCandidate`.
- **H3 — Campo oculto no match individual:** o `GET /v2/matches/{idMatch}` (registro cheio) traz algum
  campo **não documentado no schema** apontando ao pré-colaborador (`idPreCollaborator`,
  `preCollaboratorId`, dentro de `requests[]`, etc.)? Método: inspecionar **todas as chaves do JSON
  real** (não só o schema), sem exibir valores de PII.
- **H4 — Via requisição/finalista:** `requests[]` do match ou `RequestMatch` encadeia ao
  pré-colaborador? Método: seguir `GET /v2/request-matches?idMatch=` e inspecionar as chaves.
- **H5 — Reverso conhecido:** partindo de um `idPreCollaborator` real (I1), ler seu `idMatch` (o
  `PreCollaboratorModel` **tem** `IdMatch`) e **derivar a função inversa** observando a relação
  numérica/estrutural entre os ids em **≥ 3 pares distintos**.

**O que medir:** para cada hipótese, em **≥ 3 candidatos distintos** que estejam na etapa de admissão:
a ligação retorna **o mesmo candidato** (confirmado por hash de CPF) de forma **determinística e
reprodutível**?

**Critério de decisão:**
- **SIM (verde):** existe uma regra determinística que, dado um match na etapa de admissão, chega ao
  `idPreCollaborator` correto em **3/3** casos testados.
- **PARCIAL (amarelo):** funciona só para um subtipo, ou depende de campo instável → escalar a I4
  (Pandapé Ops) para confirmar contrato oficial.
- **NÃO (vermelho — bloqueante):** nenhuma via técnica liga match→pré-colaborador **e** o Pandapé Ops
  não oferece contrato → **o pull via v2 não substitui o webhook para documentos**. (Fallback possível:
  descobrir o candidato por pull e **ainda assim** receber o `idPreCollaborator` por um webhook enxuto —
  desenho híbrido a registrar.)

**Risco/LGPD:** leitura de registros reais com CPF → hash em memória, nada persistido em claro.

---

### Q2 — O *delta* por `modifyDate` no cliente é confiável (não perde candidato entre ticks)?

**Por que importa:** não há filtro "changes-since" no servidor (§ relatório v2/v3). Se dependermos de
`modifyDate` para puxar só o que mudou, um carimbo que **não avança** quando o candidato entra na etapa
de admissão faria o EA **perder** esse candidato silenciosamente.

**Insight de desenho a validar:** a **correção não precisa vir do `modifyDate`**. A primitiva robusta é
**"quem está AGORA na pasta de admissão"** (`matches?IdVacancyFolder=<admissão>`) **+ dedupe idempotente**
por id contra o que o EA já processou (o EA já é idempotente por `IdPreCollaborator`, §A.5). Nesse
desenho, `modifyDate` é só **otimização** (reduzir páginas), não correção. O spike mede **as duas
abordagens** e compara.

**Método:**
1. Escolher uma amostra de **N vagas ativas** com movimento (via Q3).
2. **T0:** snapshot da pasta de admissão de cada vaga — persistir **apenas** o conjunto de `idMatch` +
   o `max(modifyDate)` observado (sem PII).
3. Ao longo de uma **janela de observação (ex.: 48–72h)**, re-snapshot em intervalos e registrar:
   - (a) todo `idMatch` **novo** na pasta de admissão (verdade-base: diff de pertencimento);
   - (b) todo `idMatch` que a estratégia **"delta por `modifyDate > último max`"** teria capturado.
4. Medir a diferença **(a) − (b)** = **candidatos que o delta por `modifyDate` perderia**.
5. Auxiliar: confirmar **fuso/precisão** do `modifyDate` (comparar com o horário real de uma
   movimentação conhecida) e se **entrar na pasta** de fato altera o `modifyDate`.

**O que medir:** nº de candidatos perdidos pelo delta-`modifyDate` vs. o diff-de-pertencimento, na
janela; fuso do carimbo; latência entre movimentação e aparição.

**Critério de decisão:**
- **Desenho robusto (verde):** o **diff-de-pertencimento + dedupe** captura **100%** dos novos
  (esperado por construção) → adotamos essa primitiva; `modifyDate` só otimiza. **Perda = 0.**
- **Delta-`modifyDate` confiável (verde+):** além do acima, o delta-`modifyDate` **também** captura
  100% (perda 0) → podemos otimizar sem risco.
- **Delta-`modifyDate` frágil (amarelo):** delta perde > 0 candidatos → **proibir** depender só de
  `modifyDate`; usar sempre o diff-de-pertencimento (custa mais requisições → alimenta Q3).

**Risco/LGPD:** snapshots só com `idMatch`/timestamp; TTL 48h.

---

### Q3 — Qual o fan-out **real** e cabe em 1.000 req/5min compartilhado com a folha?

**Por que importa:** 6.821 é o **total histórico**. O que importa é o nº de **vagas ativas** e quantas
requisições um ciclo de descoberta custa — sem roubar orçamento do webhook do G.Infor (folha).

**Método:**
1. **Contar vagas ativas de verdade:** `GET /v2/vacancies?VacancyStatus=<ativa>&Page=1&PageSize=1` →
   ler `totalItems` (usar o enum de I2). Repetir por cada status relevante para entender o universo.
2. **Medir a distribuição** de candidatos na **pasta de admissão** por vaga ativa, numa amostra: para
   K vagas ativas, `vacancy-folders` (achar a pasta de admissão, Q4) + `matches?IdVacancyFolder=…&PageSize=50`
   → nº de páginas por vaga (esperado: a maioria com 0–1).
3. **Medir latência real** por chamada (p50/p95) para saber se um ciclo cabe na janela do cron.
4. **Ler os headers de rate limit** na resposta (ex.: `X-RateLimit-Remaining`/`Retry-After`, se
   existirem) para saber como o teto compartilhado é reportado.
5. **Modelar o custo por tick** (fórmula abaixo) com os números reais e comparar ao **orçamento seguro**.

**Fórmula de custo por ciclo:**
```
custo_tick ≈ ceil(A_ativas / PageSize_vagas)          # listar vagas ativas (paginado)
           + A_ativas × 1                               # 1 página de matches na pasta de admissão (caso típico)
           + A_ativas × f_refresh_folders               # vacancy-folders (CACHEÁVEL → f≈0 após warmup)
           + Σ páginas_extras (vagas com muitos admitidos)
```
Onde **A_ativas** = vagas ativas medidas no passo 1; `PageSize_vagas` ex.: 50.

**Orçamento seguro:** reservar **≥ 80% do teto para o G.I** → **EA ≤ 200 req/5min**.

**O que medir:** `A_ativas`; páginas/vaga (p95); latência (p50/p95); presença de headers de rate limit;
`custo_tick` calculado.

**Critério de decisão:**
- **Cabe folgado (verde):** `custo_tick ≤ 200 req` por ciclo de 5 min **e** o ciclo termina dentro da
  janela → viável na cadência atual (`*/5`).
- **Cabe com sharding (amarelo):** `custo_tick` entre 200 e ~1.000 → viável **apenas** com
  **particionamento temporal** (varrer 1/K das vagas por tick), aumentando a **latência de detecção**
  para K×5 min. Documentar o trade-off.
- **Não cabe (vermelho):** mesmo com sharding razoável, o custo ameaça o orçamento do G.I → pull via v2
  **não é viável** como descoberta primária; webhook permanece.

**Risco/LGPD:** contagens agregadas e ids técnicos; nenhuma PII. Rodar na janela de I3.

---

### Q4 — Como resolver o **de/para da etapa de admissão** por cliente, sustentável e não-frágil?

**Por que importa:** as pastas de etapa têm **nome livre por vaga** (vaga 847: `Lead`, `Inscritos`,
`Pré-selecionado`, `Finalistas`, **`Contratados`**, `Descartados`). Escolher "qual pasta é a de
admissão" na mão, vaga a vaga, é insustentável para milhares de vagas.

**Hipóteses a testar:**
- **H1 — Nome canônico consistente:** a pasta de admissão quase sempre se chama "Contratados"
  (ou poucos sinônimos)? Método: amostrar folders de **50–100 vagas ativas**, tabular a **frequência
  dos nomes** e medir a cobertura de um **dicionário de sinônimos** curado
  (`Contratados`/`Admitido`/`Contratado`/…).
- **H2 — Heurística por `Sort`:** o `VacancyFolderModel` traz `Sort` (em 847: `Contratados`=9999,
  `Descartados`=10000). Há um padrão estável (ex.: a pasta de contratação é o maior `Sort` que **não**
  é "descartados")? Método: verificar a estabilidade do padrão de `Sort` na amostra.
- **H3 — Campo de tipo/sistema oculto:** o JSON real de `vacancy-folders` traz algum campo
  **não documentado** (`type`, `isSystem`, `stage`, `isHired`) que identifique a pasta canonicamente?
  Método: inspecionar as chaves cruas da resposta.
- **H4 — Sinal do próprio pré-colaborador:** o `PreCollaboratorModel` tem `CurrentFolderName` — usar
  como oráculo para **rotular** qual nome de pasta corresponde à admissão, aprendendo o de/para a partir
  de pré-colaboradores reais (I1).
- **H5 — Contrato oficial:** o Pandapé Ops (I4) expõe um conceito canônico de "pasta de contratado".

**O que medir:** cobertura (%) de cada regra na amostra; nº de vagas que **nenhuma** regra classifica
(exigiriam revisão manual).

**Critério de decisão:**
- **Sustentável (verde):** uma regra combinada (dicionário de sinônimos + heurística de `Sort` +
  campo oculto, se houver) classifica corretamente **≥ 98%** das vagas ativas amostradas, com
  **fallback "sinalizar para revisão"** (não silencioso) para o resto → é automatizável.
- **Sustentável com curadoria leve (amarelo):** 90–98% → viável com uma **tela de de/para** de baixa
  frequência (a operação confirma exceções), não vaga-a-vaga.
- **Frágil (vermelho):** < 90% sem padrão estável → identificação de admissão não é confiável por
  pull → enfraquece a proposta (webhook entrega o pré-colaborador já "na admissão", sem esse problema).

**Risco/LGPD:** nomes de etapa são metadados de configuração, não PII.

---

## 5. Sequenciamento e dependências

```
I1,I2,I3,I4 (destravar)
    │
    ├─► Q1  (ligação match→precollaborator)   ◄── MAIOR RISCO: rodar PRIMEIRO
    │        │  se vermelho → pull não cobre documentos (fallback híbrido ou webhook)
    │
    ├─► Q4  (de/para da etapa)  ── alimenta ──►  Q2 e Q3 (ambos precisam saber "qual é a pasta de admissão")
    │
    ├─► Q3  (fan-out real)  ── alimenta ──►  Q2 (amostra de vagas ativas)
    │
    └─► Q2  (confiabilidade do delta)  ── janela de observação 48–72h (o mais longo)
```

- **Q1 primeiro** (maior risco; se bloquear, muda tudo).
- **Q4 antes de Q2/Q3** (ambos dependem de saber qual pasta mirar).
- **Q2 é o de maior duração** (precisa de janela de observação) → iniciar cedo, em paralelo.

---

## 6. Entregável do spike

Um **memorando de decisão** (`docs/RESULTADO-SPIKE-PANDAPE-V2.md`, a criar ao fim), contendo:
1. Resposta **SIM/NÃO/PARCIAL + número** para Q1–Q4.
2. Preenchimento da **rubrica go/no-go** (§7).
3. Recomendação de arquitetura: **(a)** pull-only via v2; **(b)** híbrido (pull descobre + webhook
   enxuto entrega o `idPreCollaborator`); ou **(c)** manter webhook. Com o porquê, lastreado nos dados.
4. Se houver "amarelos", o **desenho de mitigação** (sharding, tela de de/para, etc.) e seu custo.
5. Anexo de evidências (status HTTP, contagens, sem PII).

---

## 7. Rubrica de decisão go/no-go

| Pergunta | Verde (viável) | Amarelo (viável com mitigação) | Vermelho (bloqueia pull) |
|---|---|---|---|
| **Q1 — ligação p/ documentos** | regra determinística 3/3 | só via Pandapé Ops / subtipo | sem via → **híbrido ou webhook** |
| **Q2 — não perder candidato** | diff-de-pertencimento perda 0 | precisa evitar delta-`modifyDate` | pertencimento instável |
| **Q3 — fan-out no orçamento** | `custo_tick ≤ 200 req/5min` | cabe só com sharding (latência ↑) | ameaça o G.I mesmo com sharding |
| **Q4 — de/para da etapa** | regra automática ≥ 98% | 90–98% + curadoria leve | < 90%, sem padrão |

**Leitura:** **todos verdes → recomendar pull-only.** **Q1 vermelho, resto verde → recomendar híbrido**
(pull para descoberta + webhook mínimo só para o `idPreCollaborator`). **Qualquer outro vermelho →
manter webhook**. Amarelos são aceitáveis se o custo de mitigação for aprovado pelo diretor.

---

## 8. Estimativa de esforço (indicativa)

| Item | Esforço | Observação |
|---|---|---|
| Preparo do harness de spike (cliente OAuth read-only + limiter conservador) | ~0,5 dia | reusa o `PandapeApiService` já existente, em modo leitura |
| Q1 (ligação) | ~0,5 dia | depende de I1 |
| Q3 (fan-out) + Q4 (de/para) | ~1 dia | medições + amostragem, na janela de I3 |
| Q2 (delta) | **48–72h de janela** + ~0,5 dia de análise | tempo de calendário, não de trabalho ativo |
| Memorando de decisão | ~0,5 dia | consolida tudo |
| **Total** | **~3 dias úteis de trabalho, ~1 semana de calendário** | Q2 domina o calendário |

---

## 9. O que este spike explicitamente **NÃO** faz

- **Não** implementa o cron-pull v2 em produção, **não** instala cron, **não** cria schema/migration.
- **Não** altera o `pandape-sync` nem o fluxo atual da Fase 5 (que segue inerte até o diretor decidir).
- **Não** toma a decisão de arquitetura — apenas a **instrumenta** com dados.
- **Não** aciona endpoints de escrita na conta real do Pandapé.
- **Não** ativa nada em produção sem o **alinhamento prévio com o time de Operações do Pandapé**
  (relatório v2/v3, §7).

---

*Plano de spike para aprovação. Nenhuma linha de produção será tocada na sua execução. Todos os
experimentos são somente-leitura, com guardrails de LGPD reforçados e orçamento de rate limit
conservador para zero risco ao webhook da folha (G.I).*
