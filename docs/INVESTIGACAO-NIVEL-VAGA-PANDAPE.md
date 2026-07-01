# Investigação — Nível **VAGA** na API do Pandapé (v1 · v2 · v3)

**Projeto:** EA AUTOMATIC — Fase 5 (INT-1 Pandapé)
**Data:** 2026-07-01 · **Ambiente:** produção, OAuth2 `client_credentials` com **credencial real**
**Escopo:** posições por vaga · preenchidas × abertas · listagem × get-by-id · vínculo com cliente
**Nota:** investigação **separada** da questão de discovery de candidatos (documentada à parte).
Sem PII neste documento — apenas estrutura técnica, contagens e títulos de cargo.

---

## Resumo — as 4 respostas

| # | Pergunta | Resposta | Em resumo |
|---|---|---|---|
| 1 | Vaga traz **nº de posições**? | **SIM** | Campo `numberVacancies` (v1 e v2). Live: vaga 850 "Vendedor Externo" → **5**. |
| 2 | Dá pra saber **preenchidas × abertas**? | **NÃO na prática** (só no modelo) | A API modela `contractedCandidatesCount` etc. — mas via **Requisição**, que está **vazia/não usada** nesta conta (13 requests, todos zerados e sem vínculo à vaga). |
| 3 | Vaga tem a limitação **get-by-id** (como candidato)? | **NÃO** | `GET /v1/Vacancy/List` e `GET /v2/vacancies` (paginado) são **listagem aberta**, sem precisar do id. **v3 não tem endpoint de vaga.** |
| 4 | Vaga expõe o **cliente** (nome/CNPJ)? | **NÃO** (v2/v3 não mudaram) | Vaga só traz `idCompany` (a **conta** recrutadora, =30 para todas), nunca `idClient`/CNPJ. Igual à v1. |

---

## Q1 — Quantidade de posições da vaga

**SIM, existe e é populado.** O campo chama-se **`numberVacancies`**.

| Versão | Onde | Confirmação |
|---|---|---|
| v1 | `VacancyModel.NumberVacancies` (retorno de `GET /v1/Vacancy/List`) | Presente no schema |
| v2 | `VacancyResponse.numberVacancies` (retorno de `GET /v2/vacancies`) | **Confirmado ao vivo** |
| v3 | — | **Sem módulo de vaga** (v3 não lista/retorna vaga) |

**Evidência ao vivo (v2, `GET /v2/vacancies?Page=1&PageSize=5`):**

| idVacancy | job | numberVacancies |
|---:|---|---:|
| 847 | VENDEDOR INTERNO | 1 |
| 848 | Executivo de Vendas | 1 |
| 849 | AUXILIAR DE SERVIÇOS GERAIS | 1 |
| **850** | **Vendedor Externo** | **5** |
| 851 | NUTRICIONISTA DE PRODUÇÃO | 1 |

→ É exatamente o "5 posições" do seu exemplo. O campo responde à pergunta.

---

## Q2 — Posições preenchidas × abertas

**A API modela isso, mas NÃO no objeto da vaga — e na prática os dados estão vazios nesta conta.**

**1) O objeto da vaga NÃO tem contador de preenchidas.** `VacancyResponse` traz só `numberVacancies`
(total) — não há `filled`/`hired`/`open` na vaga.

**2) Quem carrega as contagens é a REQUISIÇÃO (`Request`), em v1 e v2:**
- `RequestListItemModel` (de `GET /v2/requests`): `vacanciesCount`, **`contractedCandidatesCount`**, `sentCandidatesCount`.
- `RequestDetailModel` (de `GET /v2/requests/{id}`): `numberVacancies`, `finalistCandidatesCount`,
  **`contractedCandidatesCount`**, `discardedCandidatesCount`, `candidatesTotal`, `approvedDate`, `closedDate`.
- Em tese: **abertas = `numberVacancies` − `contractedCandidatesCount`**.

**3) MAS, ao vivo, a Requisição está essencialmente inutilizada nesta conta:**
- Existem **apenas 13 requisições** na conta inteira (`GET /v2/requests`).
- **Todas** têm `contractedCandidatesCount = 0`, `sentCandidatesCount = 0`, `finalistCandidatesCount = 0`.
- **Todas** têm **`idVacancyAssociated = null`** → não estão sequer ligadas a nenhuma vaga.
- As **6.822 vagas** não têm requisição associada (`GET /v2/requests?idVacancy=<n>` → 0 em toda a amostra de 40 vagas + as vagas 847/850).

> **Conclusão Q2:** o caminho oficial (contadores da Requisição) **existe no schema mas não tem dado**
> nesta conta — a conta opera em recrutamento **direto**, sem o workflow de requisição de cliente.
> Logo, **não há como obter "preenchidas × abertas" de forma confiável hoje**.
> **Alternativa derivável** (não é um contador pronto): contar candidatos na pasta **"Contratados"**
> via a listagem de matches (`/v2/matches?IdVacancyFolder=<contratados>`) — mas isso é o fan-out de
> candidato já discutido, e equivale "contratado" a *pertencer à pasta*, não a um contador de posição.

---

## Q3 — Listagem aberta × limitação get-by-id

**A vaga NÃO tem a limitação que o candidato tem.** Existe **listagem aberta**, sem precisar do id:

| Versão | Endpoint | Tipo | Ao vivo |
|---|---|---|---|
| v1 | `GET /v1/Vacancy/List?vacancyStatus=&isInternalRecruitment=` | Lista aberta (sem id) | — |
| v2 | `GET /v2/vacancies?VacancyStatus=&VacancyType=&IdVacancy=&Page=&PageSize=` | **Lista paginada aberta** | **HTTP 200, `totalItems = 6822`** |
| v3 | — | **Inexistente** (v3 não tem módulo Vacancy) | — |

Observações:
- Na v2 o `IdVacancy` é filtro **opcional** — dá para listar tudo (paginado) ou filtrar por id.
- Filtro de status disponível (`VacancyStatus`), útil para isolar **vagas ativas/publicadas**
  (enum: `1-PendingPublication, 2-Published, 3-Deactivated, 4-Deleted, 5-Requested, 6-Assigned, 7-Expired`).
- **v3 é um subconjunto mínimo e não expõe vaga** — para qualquer coisa de vaga, usar v1 ou v2.

---

## Q4 — Vínculo com o cliente (nome/CNPJ)

**NÃO. v2 e v3 NÃO mudaram o comportamento da v1 — a vaga continua sem expor o cliente.**

- A vaga (v2 `VacancyResponse`) traz `idCompany` e `idCompanyExternal` — que são a **conta
  recrutadora** (o próprio Grupo Soulan no Pandapé), **não o cliente/tomador**. Evidência: as 5 vagas
  distintas amostradas têm **todas `idCompany = 30`** e `idCompanyExternal = 100133` → é a conta, não
  varia por cliente.
- **Nenhum campo** `idClient` / `cif` / `cnpj` / `customer` na vaga (v1 nem v2). Confirmado ao vivo
  (`campos client-like: []`).
- O **registro de clientes existe e é rico** — `GET /v2/clients` retorna **2.535 clientes** com
  `idClient`, `businessName` e **`cif` (=CNPJ)**. Mas **não há join exposto vaga → cliente**.
- A ponte natural seria a **Requisição** (requisição pertence a sede/cliente), mas: (a) ela está
  vazia/não usada (Q2); (b) mesmo o `RequestDetailModel` **não traz campo de cliente** no retorno
  (`campos client-like no detalhe: NENHUM`); (c) as requisições têm `idVacancyAssociated = null`.

> **Conclusão Q4:** idêntico à v1 — para uma admissão vinda do Pandapé, **o cliente não sai resolvido
> da vaga**; permanece dependente de de/para por outra chave (ex.: CNPJ do `Client/List` ↔
> `cliente.cnpj` do EA), sem ligação direta vaga→cliente na API.

---

## Comparativo consolidado v1 / v2 / v3

| Capacidade (nível vaga) | v1 | v2 | v3 |
|---|:--:|:--:|:--:|
| Listagem aberta de vagas (sem id) | ✅ `Vacancy/List` | ✅ `GET /v2/vacancies` (paginado) | ❌ (sem módulo) |
| Nº de posições (`numberVacancies`) | ✅ | ✅ (live: 5) | ❌ |
| Contador de preenchidas na **vaga** | ❌ | ❌ | ❌ |
| Contadores na **Requisição** (`contractedCandidatesCount`…) | ✅ (schema) | ✅ (schema) | ❌ |
| Requisição **populada** na conta | ❌ (vazia) | ❌ (13, zeradas, sem vínculo) | ❌ |
| Cliente (idClient/CNPJ) na vaga | ❌ | ❌ (`idCompany` = conta, não cliente) | ❌ |
| Registro de clientes (`Client/List`, com CNPJ) | ✅ | ✅ (2.535 clientes) | ❌ |

---

## Anexo — Evidências ao vivo (2026-07-01, credencial real)

| Chamada | HTTP | Observação (sem PII) |
|---|---:|---|
| `GET /v2/vacancies?Page=1&PageSize=5` | 200 | `totalItems=6822`; `numberVacancies` real (vaga 850 = **5**); `idCompany=30` em todas; **0 campos client** |
| `GET /v2/requests` (sem filtro) | 200 | **13** requisições; todas `contractedCandidatesCount=0`, `sentCandidatesCount=0`, `idVacancyAssociated=null` |
| `GET /v2/requests/583552` | 200 | `numberVacancies=1`, todos os contadores `=0`; **0 campos client** |
| `GET /v2/requests?idVacancy=847` / `=850` | 200 | **0** requisições ligadas à vaga (idem em 40 vagas amostradas) |
| `GET /v2/clients/requests?idVacancy=847` / `=850` | 200 | **0** |
| `GET /v2/clients?Page=1&PageSize=1` | 200 | `totalItems=2535`; item traz `idClient`, `businessName`, **`cif`** |
| Enum `VacancyStatus` (swagger) | — | `1-PendingPublication … 2-Published … 7-Expired` |

**Specs:** `…/swagger/v1/swagger.json` · `…/swagger/v2/swagger.json` · `…/swagger/v3/swagger.json`.
**Fontes de schema:** `VacancyResponse`, `VacancyModel`, `RequestListItemModel`, `RequestDetailModel`.

---

*Resultado de investigação para validação. Nenhum código alterado; somente leitura. Sem PII.*
