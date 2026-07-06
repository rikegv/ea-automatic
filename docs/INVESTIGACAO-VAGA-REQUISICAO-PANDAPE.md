# Investigação — Nível **VAGA e REQUISIÇÃO** na API do Pandapé (v1 · v2 · v3)

**Projeto:** EA AUTOMATIC — módulo futuro de **Abertura e Fechamento de Vaga** (alimentado pelo Pandapé)
**Data:** 2026-07-02 · **Ambiente:** **produção**, OAuth2 `client_credentials`, **credencial real** (`PANDAPE_CLIENT_ID/SECRET`)
**Escopo:** webhook de abertura de vaga · campos de vaga/requisição (3 versões) · nº e preenchimento de posições · chain candidato→vaga→requisição · id estável
**Método:** swagger público v1/v2/v3 (**CATALOGADO**) cruzado com **testes ao vivo** (**LIVE**), HTTP de cada chamada.
**Segurança desta investigação:** só **GET** (read-only, nada mutado); **PII redigida** (CPF/nome/e-mail/telefone/endereço/URL de documento nunca aparecem — só estrutura, contagens e dados de negócio); ~40 chamadas, muito abaixo do teto de 1.000/5min (§A.5). Token/secret nunca logados.

> ⚠️ **Correção metodológica relevante (evita repetir erro):** a **v2 usa REST em _lowercase_** (`/v2/vacancies`, `/v2/requests`, `/v2/clients/requests`), **não** o padrão PascalCase da v1 (`/v1/Vacancy/List`). Testar `/v2/Vacancy/List` retorna `400 UnsupportedApiVersion` e induz à conclusão errada de que "v2 não existe". A v2 existe e é a **superfície mais rica** (swagger de 261 KB).

---

## Resumo executivo — as 5 respostas

| # | Pergunta | Resposta curta | Evidência |
|---|---|---|---|
| 1 | **Webhook/evento de abertura de vaga**? | **NÃO DETERMINÁVEL pela API** — não há catálogo de webhooks em nenhuma versão. Precisa confirmação do suporte (André). | `GET /v3/webhooks`→404, `/v1/Webhook/List`→404; **nenhum path de webhook** nos 3 swaggers. |
| 2 | Vaga/requisição traz cliente, salário, benefícios, contrato, escala, modelo de trabalho, motivo, requisitos, datas, solicitante, responsável? | **Quase tudo SIM — exceto o CLIENTE.** A **v2 `vacancies` (detalhe)** e a **`Request/Get`** cobrem salário, benefícios, contrato, escala, modelo de trabalho, faixa etária, formação, idiomas, motivo/substituição, datas, solicitante e responsável. **Cliente/CNPJ: NÃO** em nenhuma versão. | tabela §Q2 |
| 3 | Nº de posições e **preenchidas × abertas** / **listar candidatos por posição**? | **Nº de posições: SIM** (`numberVacancies`/`vacanciesCount`). **Contagens de preenchimento: SIM, mas só agregadas.** **Listar os candidatos de uma requisição/posição específica: NÃO** (não há endpoint request→candidatos; só candidato→requisições). | §Q3 |
| 4 | Chain **candidato → vaga/requisição**? | **SIM, confiável e documentado.** `IdPreCollaborator → precollaborator.IdVacancy` (vaga) e `→ IdMatch → match.Requests[].IdRequest` (requisição). | §Q4 |
| 5 | **Id estável e único** ao longo do tempo (mesmo reabrindo a vaga)? | **SIM.** `IdVacancy` e `IdRequest` são únicos e nunca reusados; reabrir = **novo id** (nunca colide). Há ainda `Reference` (nº humano) e `ExternalCode` (de/para). | §Q5 |

### 🔴 Achado crítico (o "não repetir o erro do cliente")
**O cliente (nome/CNPJ) NÃO é recuperável a partir da vaga nem da requisição, em nenhuma versão da API.** Confirmado em v1, v2 e v3, inclusive no namespace `/v2/clients/requests/{id}` (que devolve o **mesmo** modelo de requisição, **sem** `idClient`). O cliente só existe na **hierarquia de criação** `Client → Headquarter(sede) → Request` — legível de cima para baixo (`Headquarter/List` traz `idClient`; `Client/Get` traz CNPJ), mas **não** de volta a partir de uma vaga/requisição/candidato já existentes. É exatamente a mesma lacuna do nível candidato. **Qualquer módulo de vaga do EA precisará resolver o de/para cliente por FORA da API** (insumo do diretor / tela de fechamento de vaga), como já previsto em §A.9.

---

## Correção do mapa de versões (LIVE)

| Recurso | v1 (PascalCase) | v2 (REST lowercase) | v3 (REST lowercase) |
|---|---|---|---|
| Vaga | `GET /v1/Vacancy/List` ✅ (sem get-by-id) | `GET /v2/vacancies` ✅ (lista) · `/v2/vacancies/{id}` (detalhe, ver nota) | **não existe** (`/v3/vacancies`→400) |
| Requisição | `GET /v1/Request/List?idVacancy=` · `GET /v1/Request/Get?idRequest=` ✅ | `GET /v2/requests` · `GET /v2/requests/{idRequest}` ✅ · `/v2/clients/requests` | `GET /v3/requests?Page&PageSize` ✅ · `PATCH/PUT /v3/requests/{id}` (sem GET-by-id) |
| Candidato | `GET /v1/PreCollaborator/Get` · `GET /v1/Match/Get` | `GET /v2/precollaborators/{id}` · `GET /v2/matches/{idMatch}` (riquíssimo) | `GET /v3/precollaborators/{id}` |
| Cand.↔Requisição | `GET /v1/RequestMatch/Get` (por idRequestMatch) | `GET /v2/request-matches?idMatch=` | — |
| Cliente/Sede | `Client/List/Get` · `Headquarter/List/Get` | `/v2/clients` · `/v2/clients/headquarters` | — |

---

## Q1 — Webhook / evento de **abertura de vaga**

**Não há como responder pela API — e não há catálogo de webhooks exposto.** Evidência LIVE:
- `GET /v3/webhooks` → **HTTP 404**; `GET /v1/Webhook/List` → **HTTP 404**.
- **Nenhum path de webhook/subscription** aparece nos swaggers v1, v2 ou v3.

A configuração de webhooks do Pandapé (inclusive o "Candidato enviado para admissão" que já usamos) é feita **no painel/admin do Pandapé**, não via API. Portanto:
- **Existe momento de "abertura" modelável?** Sim — a requisição tem `ApprovedDate`/`CreationDate` e a vaga tem `PublishedDate`. Se o Pandapé oferecer um evento de webhook para "requisição aprovada" ou "vaga publicada", ele **poderia** disparar nesses instantes.
- **Ação:** confirmar com o suporte oficial (André) **se existe um evento de webhook de abertura de vaga/requisição** subscrevível (nome + payload), do mesmo modo que o evento de candidato foi confirmado. Enquanto não confirmado, **assumir que não existe** e alimentar a abertura de vaga por **pull** (`/v2/vacancies` ou `/v3/requests`, paginado) ou por ação manual.

---

## Q2 — Campos da vaga/requisição (LIVE vs CATALOGADO)

Legenda: **L** = confirmado ao vivo (HTTP 200 com o campo); **C** = catalogado no swagger, não confirmado ao vivo (ver notas).

| Campo pedido | Disponível? | Onde (endpoint/campo) | LIVE/CAT |
|---|---|---|---|
| **Cliente (nome/CNPJ)** | **❌ NÃO** | Ausente na vaga, na requisição e em `/v2/clients/requests/{id}`. Só via `Headquarter.idClient`→`Client/Get.CIF`, **sem link de volta**. | L (ausência confirmada) |
| **Nº de posições** | ✅ SIM | `numberVacancies` (vaga v1/v2) · `vacanciesCount` (v3 requests) · `NumberVacancies` (Request/Get) | **L** |
| **Salário** | ✅ SIM | Vaga v2: `SalaryMin`/`SalaryMax`/`HideSalary` · Requisição: `Salary{minimum,maximum}` (LIVE: `{0,0}` na amostra) | Req **L** · Vaga **C** |
| **Benefícios** | ✅ SIM | Vaga v2: `Benefits[]` (array) · Requisição: `Benefits` (string) | Req **L** (null na amostra) · Vaga **C** |
| **Tipo de contratação** | ✅ SIM | `IdContractWorkType` (vaga v2, **LIVE=2**) → `Dictionary/contract-worktype`. Valores: 2=Efetivo–CLT, 4=Estágio, 6=Temporário, 15=Trainee, 16=Autônomo, 17=Prestador (PJ), 18=Cooperado, 19=Jovem Aprendiz, 9=Outros | **L** |
| **Horário/escala** | ✅ SIM | `IdWorkingHours` (vaga v2, **LIVE=1**) → `Dictionary/working-hour` · `WorkingHours` (Request, string) | **L** |
| **Modelo de trabalho** (presencial/home/híbrido) | ✅ SIM | `IdWorkMethod` (vaga v2, **LIVE=1**) → `Dictionary/work-method`: **1=Presencial, 2=Home Office, 3=Híbrido**. *(Não é campo da Requisição — só da vaga v2.)* | **L** |
| **Motivo da contratação** | ✅ SIM (requisição) | `Reason` (Request/Get, **LIVE="Aumento de quadro"**) → `Dictionary/request-reason` | **L** |
| **Substituição (nome)** | ⚠️ Parcial | `SubstitutedPersonName` (Request, **só o NOME**, null na amostra) → `Dictionary/substitution-reason` | **L** |
| **Substituição (CPF do substituído)** | **❌ NÃO** | Nenhum campo de CPF do substituído na API. | L (ausência) |
| **Requisitos: faixa etária** | ✅ SIM (vaga v2) | `AgeMin`/`AgeMax` | **C** |
| **Requisitos: formação** | ✅ SIM (vaga v2) | `Studies[]` (`IdStudy1/2`) · `IdStudy1Min` · `IdExperienceRange` | **C** |
| **Requisitos: idiomas** | ✅ SIM (vaga v2) | `Languages[]` (`IdLanguage`,`IdLanguageLevel`) | **C** |
| **Requisitos (texto livre)** | ✅ SIM | `Profile` · `Description` · `Skills[]`/`SkillsIA[]` (vaga v2) · `Specialization`/`Area` (Request) | Req **L** |
| **Centro de custo** | ⚠️ Só via CustomFields | Não é campo nativo. `Request.DepartmentName` (null na amostra) e `Request.CustomFields[]` (vazio na amostra) poderiam carregá-lo se configurado. | L (ausência na amostra) |
| **Data de início esperada** | ✅ SIM | `Request.StartDate` (LIVE: `0001-01-01` = não preenchida) · Vaga v2 `ContractDate` | **L** |
| **Datas de alinhamento / prazo de shortlist** | ❌ NÃO (nomeadas) | Só `InsertDate`, `ApprovedDate`, `CompleteDate`, `ClosedDate` (Request). Sem "prazo de shortlist" nem "data de alinhamento" dedicados. | L |
| **Solicitante / contato focal** | ✅ SIM | `Request.CompanyUserInsertName` (**LIVE: quem abriu**) · `Request.Leads[]` (`Name`,`Phone`) | **L** |
| **Comercial/consultor responsável** | ✅ SIM | `Request.CompanyUserAssignedName` (atribuído) · `GET /v1/RequestUser/List?idRequest=` (`IdUser`,`Role`) · vaga v2 `IdCompanyUserInsert`/`IdCompanyUserManagers` | **L** (parcial) |
| **Código externo (de/para)** | ✅ SIM | `Request.ExternalCode` (null na amostra) · `Reference` (vaga e requisição) | **L** |
| **Cargo** | ✅ SIM | `Job` (vaga) · `RequestTitle`/`Name` (requisição) · categorização `IdCategory1/2` (vaga v2) | **L** |

> **Nota sobre o get-by-id da vaga v2 (`GET /v2/vacancies/{id}`):** ao vivo retornou **HTTP 400** (ProblemDetails) para `idVacancy=847` — o parâmetro do swagger chama-se `idRequest` e a semântica não ficou clara (pode ser endpoint de prefill de edição, exigir estado/posse específicos, ou esperar um id de requisição). Por isso os campos ricos exclusivos do detalhe (salário/idade/idiomas/formação/benefícios array) estão marcados **C** (catalogados no swagger, não confirmados live). **A LISTA `/v2/vacancies` já entrega ao vivo** `idWorkMethod`, `idContractWorkType`, `idWorkingHours`, `reference`, `numberVacancies`, `status`. Recomendo um follow-up curto para destravar o get-by-id da vaga (confirmar a semântica do parâmetro com o suporte).

---

## Q3 — Nº de posições, preenchidas × abertas, e **listar candidatos por posição**

- **Nº de posições: SIM, LIVE.** `numberVacancies` (vaga) e `vacanciesCount` (v3 requests). LIVE: várias requisições com 1, uma com 3, uma com 10.
- **Preenchidas × abertas: SIM, mas só agregado.** A Requisição expõe `ContractedCandidatesCount`, `FinalistCandidatesCount`, `DiscardedCandidatesCount`, `CandidatesTotal` (Request/Get) e `sentCandidatesCount`/`contractedCandidatesCount` (v3 list). São **contadores**, não listas.
- **Listar OS candidatos vinculados a uma requisição/posição específica: ❌ NÃO.** Não existe endpoint `request → candidatos`. Todos os endpoints de match são chaveados pelo **candidato**: `GET /v2/request-matches?idMatch=` (precisa do idMatch), `GET /v1/RequestMatch/Get?idRequestMatch=`, `match.Requests[]`. Ou seja, dá para ir **candidato → requisições**, mas **não** enumerar **requisição → candidatos**.
- **Realidade da conta (LIVE, crítico):** o módulo de Requisição **está praticamente ocioso** nesta conta — `GET /v3/requests` retornou **13 requisições no total**, **todas** com `idVacancyAssociated = null`, `sentCandidatesCount = 0` e `contractedCandidatesCount = 0` (algumas intituladas "teste"). O recrutamento real roda por **Vaga (6.824) + PreCollaborator**, não por Requisição. Portanto, hoje, as contagens de preenchimento por requisição **não refletem** o preenchimento real das vagas.

---

## Q4 — Chain **candidato → vaga → requisição** (cada passo com o campo de ligação)

Ponto de partida: `IdPreCollaborator` (já conhecido pelo webhook existente).

1. `GET /v1/PreCollaborator/Get?idPreCollaborator={id}` (ou `/v2|v3/precollaborators/{id}`) → devolve **`IdVacancy`** (vaga), **`IdMatch`** e **`VacancyReference`**.
   - **Candidato → VAGA:** direto por `IdVacancy` (e `VacancyReference`).
2. `GET /v1/Match/Get?idMatch={IdMatch}` (ou `/v2/matches/{idMatch}`) → devolve **`Requests[]`** = `{ IdRequest, IdRequestMatch, IdRequestFolder, RequestStatus, Job }` **e** `IdVacancy`.
   - **Candidato → REQUISIÇÃO:** pela lista `Requests[].IdRequest` do match. (Alternativa v2: `GET /v2/request-matches?idMatch=` → `IdRequest`.)
3. `GET /v1/Request/Get?idRequest={IdRequest}` → detalhe da requisição, incluindo **`IdVacancyAssociated`** (fecha o triângulo requisição↔vaga).

**Status de confirmação:** as **assinaturas de cada endpoint estão confirmadas LIVE** (shapes reais), e o encadeamento está **provado pelo schema** (os campos de ligação existem). **A travessia ponta-a-ponta com um id real NÃO foi executada ao vivo** porque **não há endpoint de discovery/listagem de candidatos** (`/v3/precollaborators` lista → 404; não há `Match/List`) — o único modo de obter um `IdPreCollaborator` real é o **webhook**. Recomendo validar a travessia no **smoke do webhook** (quando o Fernando ligar a estrutura), usando um `IdPreCollaborator` real.

---

## Q5 — Identificador estável e único

- **`IdVacancy`** (vaga) e **`IdRequest`** (requisição) são inteiros **únicos e nunca reusados** (autoincremento; LIVE: `IdRequest=583552`, `IdVacancy=847`). **Reabrir a mesma posição gera um NOVO id** — nunca colide com o anterior. Isso satisfaz o critério de "nunca se repete".
- **`Reference`**: número humano por registro (LIVE: requisição `reference="2933623"`; vaga `reference="847"`). Também único por instância; útil para exibição/rastreio.
- **`ExternalCode`** (requisição): campo livre para **de/para** com sistemas externos (null na amostra) — candidato natural para casar com a requisição no EA.
- **Consequência de design:** se o objetivo é reconhecer "a mesma posição reaberta", a API **não** oferece um id que persista entre reaberturas (cada reabertura é um id novo) — isso teria de ser inferido pelo EA (ex.: cargo+cliente+sede), não pela API.

---

## Achados adicionais relevantes (não perguntados, documentados por precaução)

- **Dicionários de/para (v1 `/v1/Dictionary/*`, v2 `/v2/dictionaries/*`)** — enums prontos e úteis para o módulo de vaga: `contract-worktype`, `work-method`, `working-hour`, `request-reason`, `substitution-reason`, `managerial-level`, `experience-range`, `language`/`language-level`, `study1/2`, `sex`, `nationality`, `license`, `vehicle`. LIVE: todos HTTP 200 (formato `{text, value}`).
- **`GET /v2/matches/{idMatch}` é riquíssimo** — perfil completo do candidato: experiências, formação, idiomas, skills, pretensão salarial (`SalaryMin/Max`), disponibilidade, e **`Requests[]`**. Traz CPF (§A.6). Útil para pré-preencher a admissão, mas **sem `idClient`**.
- **`/v2/vacancies/templates`** — existem **modelos de vaga** (templates) reutilizáveis; pode acelerar a "abertura de vaga".
- **`/v2/killer-questions/{idVacancy}`** — perguntas eliminatórias por vaga.
- **`POST /v2/candidates`, `POST /v2/matches`, `POST /v2/clients/headquarters/{id}/requests`, `PATCH /v2/requests/{id}/assign-vacancy`** — a v2 permite **criar/atualizar** (fora do escopo read-only desta investigação; relevante se o EA quiser *empurrar* dados ao Pandapé no futuro).
- **`CustomFields[]` na requisição** e **`CustomField/List` / `/v2/custom-fields`** — campos configuráveis por conta; onde "centro de custo"/"cliente" **poderiam** ser capturados se o Grupo configurar no Pandapé (na amostra vieram vazios). Vale investigar com a A&S se há custom fields em uso.
- **Hierarquia de cliente (v2):** `/v2/clients`, `/v2/clients/{id}`, `/v2/clients/headquarters`, `/v2/clients/headquarters/{id}` — o cliente e suas sedes são plenamente legíveis **por id**; o que falta é o **link reverso** vaga/requisição→sede/cliente.

---

## Mapa de endpoints testados ao vivo (HTTP)

| Chamada (GET, sem PII) | HTTP | Nota |
|---|---|---|
| `POST /connect/token` | **200** | OAuth2 client_credentials, scope `PandapeApi`, Bearer 3600s |
| `/v1/Vacancy/List` | **200** | 6.835 vagas; sem cliente/salário/contrato (só city/job/status/tags/numberVacancies) |
| `/v1/Client/List` | **200** | 2.535 clientes; `cif`=CNPJ, `businessName`, `contact` |
| `/v1/Request/Get?idRequest=583552` | **200** | RequestDetail rico; `reference=2933623`; `salary{min,max}`; `reason`; `address{}`; muitos nulls |
| `/v1/Request/List` (sem idVacancy) | **400** | exige `idVacancy` |
| `/v1/Vacancy/Get?idVacancy=61814` | **404** | v1 **não tem** get-by-id de vaga |
| `/v1/Match/List?idVacancy=61814` | **404** | não existe |
| `/v1/Headquarter/List` | **200** | 481 sedes; cada uma com `idClient` (ponte para o cliente) |
| `/v1/Dictionary/{ContractWorkType,WorkMethod,RequestReason,SubstitutionReason,WorkingHour}` | **200** | enums `{text,value}` |
| `/v2/Vacancy/List` · `/v2/Request/List` (PascalCase) | **400** | `UnsupportedApiVersion` — **casing errado** (v2 é lowercase) |
| `/v2/vacancies?Page=1&PageSize=3` | **200** | 6.824 vagas; item traz `idWorkMethod`,`idContractWorkType`,`idWorkingHours`,`reference` |
| `/v2/vacancies/847` (get-by-id) | **400** | ProblemDetails; semântica do parâmetro `idRequest` a confirmar (campos ricos ficam CATALOGADO) |
| `/v2/clients/requests?idVacancy=847` | **200** | **0 itens** — vaga sem requisição/cliente vinculado |
| `/v2/requests?Page=1&PageSize=1` | **200** | wrapper diferente do v3 (não aprofundado) |
| `/v3/requests?Page=1&PageSize=3` | **200** | **13 requisições no total**, todas `idVacancyAssociated=null`, 0 candidatos |
| `/v3/requests/583552` (get-by-id) | **400** | `UnsupportedApiVersion` — v3 só tem coleção + `PATCH/PUT` |
| `/v3/vacancies` · `/v3/precollaborators` (lista) | **400 / 404** | v3 não tem vaga; não tem lista de pré-colaboradores |
| `/v3/webhooks` · `/v1/Webhook/List` | **404 / 404** | sem catálogo de webhooks |
| `swagger/v1|v2|v3/swagger.json` | **200** | públicos (144 KB / 261 KB / 28 KB) — fonte CATALOGADO |

---

## Recomendações para o módulo de Abertura/Fechamento de Vaga (EA)

1. **Fonte primária = v2 `/v2/vacancies`** (lista paginada, rica, LIVE). Complementar com o **detalhe** assim que o get-by-id da vaga v2 for destravado (confirmar param com o suporte).
2. **Cliente é insumo externo, sempre.** Planejar o de/para cliente↔vaga **no EA** (tela de fechamento de vaga / mapeamento do diretor), pois a API **não** liga vaga/requisição→cliente. Não inventar `cod_cliente` (§A.9, mesma regra do candidato).
3. **Webhook de abertura:** confirmar com o André se há evento subscrevível; se não, alimentar por **pull** de `/v2/vacancies` (ou `/v3/requests`). O padrão cron-pull/webhook já existente no EA se aplica.
4. **Requisição hoje é ociosa** nesta conta — não depender dela para preenchimento×abertura. Se a A&S passar a usar Requisição, reavaliar (`Request/Get` é rico).
5. **Chain candidato→vaga→requisição** já é viável e deve ser validada no **smoke do webhook** com um `IdPreCollaborator` real.
6. **Aproveitar dicionários e templates** da v2 para pré-preencher o wizard e reduzir digitação da A&S (objetivo declarado da OST).

---

*Documento para validação do diretor. Sem PII. Não gerar PDF até validação (conforme solicitado).*
