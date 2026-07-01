# Relatório Técnico — Investigação da API do Pandapé

### Descoberta de candidatos: viabilidade de *polling* vs. necessidade de *webhook*

**Projeto:** EA AUTOMATIC — Esteira Admissional (Grupo Soulan)
**Integração:** INT-1 (Pandapé / ATS)
**Data dos testes:** 30 de junho de 2026
**Autor técnico:** Fábrica EA AUTOMATIC (coordenação de engenharia)
**Destino:** Time de Infraestrutura — subsídio à decisão sobre exposição de *webhook*
**Classificação:** Interno — sem dados pessoais de candidato (apenas estrutura técnica)

---

## 1. Sumário executivo

A Fase 5 do EA AUTOMATIC integra o sistema ao Pandapé (ATS) para receber, de forma automática, os
candidatos enviados para admissão. O desenho aprovado adotou o modelo **cron-pull** (verificação
periódica), justamente para **evitar a exposição pública de um endpoint** (*webhook*) na VM.

A investigação técnica documentada neste relatório testou/catalogou a **totalidade da superfície da
API v1 do Pandapé — 60 endpoints** — para responder a uma única pergunta objetiva:

> **Existe algum endpoint que permita descobrir, por consulta periódica, quais são os
> pré-colaboradores novos (ou que mudaram de etapa) desde a última verificação?**

**Conclusão:** **Não.** A API v1 do Pandapé **não expõe nenhum endpoint de listagem, busca ou
"mudanças desde"** para pré-colaboradores. O recurso `PreCollaborator` possui **um único endpoint —
`GET /v1/PreCollaborator/Get`, que exige o `idPreCollaborator` como entrada**. Sem uma forma de
enumerar ou receber esse identificador, a consulta periódica é logicamente incapaz de descobrir um
candidato novo: só é possível consultar quem já se conhece.

Por consequência, **o único mecanismo tecnicamente viável para a descoberta de candidatos novos é o
recebimento por *push* (webhook)** — em que o Pandapé entrega o `idPreCollaborator` ao ser criado.
Esta é a base técnica para reavaliar, com a Infraestrutura, a exposição controlada de um endpoint de
recebimento.

---

## 2. Escopo, ambiente e metodologia

### 2.1 Ambiente de teste

| Item | Valor |
|---|---|
| Data da execução | **2026-06-30** |
| API base | `https://api.pandape.com.br` (produção) |
| Autorização OAuth | `https://login.pandape.com.br/connect/token` (IdentityServer) |
| Especificação de referência | `https://api.pandape.com.br/swagger/v1/swagger.json` (OpenAPI 3.0.1, título *"Pandapé API v1"*) |
| Autenticação | **OAuth2 `client_credentials`** com **credencial real** (`PANDAPE_CLIENT_ID` + `PANDAPE_CLIENT_SECRET`) fornecida pelo Pandapé |
| Escopo do token | `PandapeApi` |
| Resultado da autenticação | **Sucesso** — `Bearer` emitido, `expires_in = 3600s` (1h) |

> **Nota de segurança (LGPD §A.6):** nenhum segredo (`client_secret`), token de acesso, URL de
> documento ou dado pessoal de candidato (CPF, nome, etc.) foi persistido ou registrado em log
> durante a investigação. Este relatório contém **apenas a estrutura técnica** dos endpoints.

### 2.2 Método

1. **Autenticação viva** contra o IdentityServer do Pandapé com a credencial real (confirmação de
   que o *tenant* e o escopo `PandapeApi` respondem).
2. **Enumeração completa da superfície da API** a partir da especificação OpenAPI oficial exposta
   pela própria API autenticada — **60 endpoints**, agrupados por módulo.
3. **Prova viva (live-probe) de um subconjunto representativo de leitura** com o token real, para
   confirmar formato de resposta, contratos de dados e comportamento (ex.: quais campos existem, se
   há paginação, se listas retornam vazias).
4. **Análise de cobertura de *discovery*:** verificação, endpoint a endpoint, da existência (ou
   ausência) de qualquer operação de **listagem / busca / delta temporal** capaz de revelar
   pré-colaboradores novos.

### 2.3 Legenda de evidência (aplicada a cada endpoint)

| Marcador | Significado |
|---|---|
| 🟢 **Live-probe** | Endpoint **efetivamente invocado** com a credencial real; resultado/observação registrada. |
| 📋 **Catalogado** | Existência e contrato **confirmados pela especificação OpenAPI autenticada**; não invocado individualmente (evita efeitos colaterais em endpoints de escrita — `Create`/`Update`/`Delete` — e chamadas desnecessárias). |

> **Transparência metodológica:** os endpoints de escrita não foram disparados ao vivo por serem
> operações mutáveis sobre a conta real de produção do Pandapé. A conclusão central deste relatório
> **não depende** de invocá-los: ela se prova pela **ausência** de qualquer endpoint de descoberta em
> toda a superfície catalogada.

---

## 3. Panorama da superfície da API

A API v1 do Pandapé expõe **60 endpoints** distribuídos em **14 módulos**:

| Módulo | Endpoints | Papel na API |
|---|---:|---|
| Dictionary | 24 | Tabelas de domínio (idiomas, escolaridade, localidades, tipos de contrato, etc.) |
| Client | 5 | Cadastro de clientes (empresas) |
| Datasource | 5 | Fontes de dados/listas personalizadas |
| Match | 5 | Inscrição de um candidato numa vaga (fonte do **CPF**) |
| Request | 5 | Requisições de cliente para sedes |
| Headquarter | 4 | Sedes |
| RequestMatch | 4 | Finalistas de uma requisição |
| CustomField | 2 | Campos personalizados |
| CompanyUser | 1 | Usuários da empresa |
| **PreCollaborator** | **1** | **Pré-colaborador (candidato enviado para admissão)** |
| RequestFolder | 1 | Etapas de uma requisição |
| RequestUser | 1 | Usuários de uma requisição |
| Vacancy | 1 | Vagas |
| VacancyFolder | 1 | Etapas de uma vaga |
| **Total** | **60** | |

O ponto crítico já é visível aqui: o recurso central para a admissão — **PreCollaborator** — tem
**exatamente 1 endpoint**, e ele é *get-by-id*.

---

## 4. Catálogo completo dos 60 endpoints (por módulo)

> Coluna **O que foi testado / verificado** descreve a checagem feita; **Resultado** classifica em
> *Funcionou* / *Não existe (relevante ao discovery)* / *Limitação*; **Evidência** traz o marcador e,
> quando houve live-probe, a observação (código HTTP / comportamento).

### 4.1 PreCollaborator — o recurso central da admissão

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 1 | `GET /v1/PreCollaborator/Get?idPreCollaborator={id}` | Obter os dados de um pré-colaborador por id; confirmar que traz dados + `documents[]`; testar se há como **descobrir** ids novos | **Funcionou como get-by-id** — retorna `idMatch, idVacancy, name, surname, email, admissionDate, vacancyJob, currentFolderName, documents[]`. **Não traz CPF** (CPF vem de `Match/Get`). **Exige `idPreCollaborator` de entrada; não enumera.** | 🟢 Live-probe — probe com `id=1` retornou **HTTP 404** (id inexistente; sem id de teste válido disponível). Contrato confirmado via swagger. |

**Observação decisiva:** este é o **único** endpoint do módulo. Não há `PreCollaborator/List`,
`PreCollaborator/Search`, nem qualquer variação com filtro por data/etapa. **Sem o `id` em mãos, não
há como chegar a um pré-colaborador.**

### 4.2 Match (inscrição candidato↔vaga — fonte do CPF)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 2 | `GET /v1/Match/Get?idMatch={id}` | Confirmar que é a fonte de **CPF**/telefone/nascimento/endereço | Funciona como *get-by-id*; **traz CPF** (o pull precisa encadear `PreCollaborator → Match`). Exige `idMatch`. | 📋 Catalogado — contrato confirmado no swagger; sem `idMatch` real de teste para invocação viva. |
| 3 | `GET /v1/Match/ListQuestionnaires?idMatch={id}` | Verificar se lista algo enumerável | Lista **questionários de um match já conhecido** — exige `idMatch`. Não ajuda no discovery. | 📋 Catalogado |
| 4 | `POST /v1/Match/Create` | Criar inscrição (escrita) | Fora do fluxo de leitura; não enumera candidatos. | 📋 Catalogado (não invocado — escrita) |
| 5 | `POST /v1/Match/UpdateFolder` | Mover etapa (escrita) | Escrita; irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 6 | `POST /v1/Match/UploadPhoto` | Enviar foto (escrita) | Escrita; irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |

**Não há `Match/List`.** Também não é possível enumerar inscrições para, a partir delas, chegar a
pré-colaboradores.

### 4.3 RequestMatch (finalistas de uma requisição)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 7 | `GET /v1/RequestMatch/Get?idRequestMatch={id}` | *Get-by-id* de finalista | Exige id; não enumera. | 📋 Catalogado |
| 8 | `GET /v1/RequestMatch/ListEvaluations?idRequestMatch={id}` | Lista **avaliações de um finalista já conhecido** | Exige `idRequestMatch`; não enumera finalistas. | 📋 Catalogado |
| 9 | `POST /v1/RequestMatch/Create` | Criar finalista (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 10 | `POST /v1/RequestMatch/UpdateFolder` | Mover finalista de etapa (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |

**Não há `RequestMatch/List`** (listagem geral de finalistas). Toda leitura parte de um id já
conhecido.

### 4.4 Vacancy / VacancyFolder (vagas)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 11 | `GET /v1/Vacancy/List?vacancyStatus=&isInternalRecruitment=` | Listar vagas; verificar se a vaga **carrega cliente** e se leva a candidatos | **Funcionou** — retorna `idVacancy, job (cargo), city, description, status, tags[]`. **A vaga NÃO traz cliente/CNPJ e não lista candidatos/pré-colaboradores.** Não há `Vacancy/Get` por id. | 🟢 Live-probe — **HTTP 200**, lista de vagas retornada. |
| 12 | `GET /v1/VacancyFolder/List?idVacancy={id}` | Listar **etapas** de uma vaga | Retorna etapas (folders) da vaga; **não lista candidatos** dentro delas. | 📋 Catalogado |

**`Vacancy/List` é a única listagem "aberta" (sem id obrigatório) útil, mas ela para na vaga** — não
há caminho exposto vaga → pré-colaboradores.

### 4.5 Request / RequestFolder / RequestUser (requisições)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 13 | `GET /v1/Request/List?idVacancy={id}` | Listar requisições de uma vaga | **Exige `idVacancy`**; nos casos testados **retornou vazio**. Não revela candidatos. | 🟢 Live-probe — **HTTP 200**, corpo **vazio**. |
| 14 | `GET /v1/Request/Get?idRequest={id}` | Detalhe de uma requisição | *Get-by-id*; não enumera. | 📋 Catalogado |
| 15 | `POST /v1/Request/Create` | Criar requisição (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 16 | `POST /v1/Request/Update` | Editar requisição (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 17 | `POST /v1/Request/Delete` | Excluir requisição (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 18 | `GET /v1/RequestFolder/List?idRequest={id}` | Etapas de uma requisição | Exige `idRequest`; não enumera candidatos. | 📋 Catalogado |
| 19 | `GET /v1/RequestUser/List?idRequest={id}` | Usuários de uma requisição | Exige `idRequest`; lista usuários, não candidatos. | 📋 Catalogado |

### 4.6 Client (clientes)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 20 | `GET /v1/Client/List` | Listar clientes; obter **CNPJ** para o de/para `cif ↔ cliente.cnpj` do EA | **Funcionou** — retorna `idClient, name, businessName, cif (=CNPJ, 14 díg), address, contact`. Útil para o de/para, **mas não liga a candidatos**. | 🟢 Live-probe — **HTTP 200**, lista de clientes retornada. |
| 21 | `GET /v1/Client/Get?idClient={id}` | Detalhe de um cliente | *Get-by-id*; contrato confirmado. | 📋 Catalogado |
| 22 | `POST /v1/Client/Create` | Criar cliente (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 23 | `POST /v1/Client/Update` | Editar cliente (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 24 | `POST /v1/Client/Delete` | Excluir cliente (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |

### 4.7 Headquarter (sedes)

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 25 | `GET /v1/Headquarter/List?idClient={id}` | Listar sedes de um cliente; verificar ligação vaga→cliente | Nos casos testados **retornou vazio**; não revela candidatos. | 🟢 Live-probe — **HTTP 200**, corpo **vazio**. |
| 26 | `GET /v1/Headquarter/Get?idHeadQuarter={id}` | Detalhe de sede | *Get-by-id*. | 📋 Catalogado |
| 27 | `POST /v1/Headquarter/Create` | Criar sede (escrita) | Irrelevante ao discovery. | 📋 Catalogado (não invocado — escrita) |
| 28 | `GET /v1/Headquarter/UpdateClient?idHeadQuarter={id}&idClient={id}` | Trocar cliente de uma sede | Operação de modificação; irrelevante ao discovery. | 📋 Catalogado |

### 4.8 CompanyUser / CustomField

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 29 | `GET /v1/CompanyUser/List?Page=&PageSize=&Role=` | Listar usuários da empresa (é **paginado**) | Lista **usuários internos**, não candidatos. Confirma que a API sabe paginar — mas não oferece paginação de pré-colaboradores. | 📋 Catalogado |
| 30 | `GET /v1/CustomField/List` | Campos personalizados das requisições | Metadados de formulário; irrelevante ao discovery. | 📋 Catalogado |
| 31 | `GET /v1/CustomField/ListDictionaryValues/{id}` | Valores de um dicionário de campo | Metadados; irrelevante ao discovery. | 📋 Catalogado |

### 4.9 Datasource

| # | Método / Endpoint | O que foi testado / verificado | Resultado | Evidência |
|---:|---|---|---|---|
| 32 | `GET /v1/Datasource/List` | Listar datasources | Listas auxiliares; não candidatos. | 📋 Catalogado |
| 33 | `GET /v1/Datasource/ListItems?idDatasource={id}` | Itens de um datasource | Itens auxiliares; irrelevante ao discovery. | 📋 Catalogado |
| 34 | `POST /v1/Datasource/Create` | Criar datasource (escrita) | Irrelevante. | 📋 Catalogado (não invocado — escrita) |
| 35 | `POST /v1/Datasource/AddItems` | Adicionar itens (escrita) | Irrelevante. | 📋 Catalogado (não invocado — escrita) |
| 36 | `POST /v1/Datasource/DeleteItems` | Remover itens (escrita) | Irrelevante. | 📋 Catalogado (não invocado — escrita) |

### 4.10 Dictionary (24 endpoints — tabelas de domínio)

Todos são **tabelas de referência estáticas** (sem qualquer relação com candidatos). Verificado que
**nenhum** oferece listagem/delta de pré-colaboradores. Catalogados em bloco:

| # | Endpoint (`GET /v1/Dictionary/...`) | Conteúdo |
|---:|---|---|
| 37 | `Category1` | Áreas de cargo |
| 38 | `Category2?idCategory1={id}` | Especializações de área |
| 39 | `Children` | Opções sobre filhos |
| 40 | `ContractWorkType` | Tipos de contrato |
| 41 | `Deficiency1` | Tipos de deficiência |
| 42 | `Deficiency2?idDeficiency1={id}` | Graus de deficiência |
| 43 | `Language` | Idiomas |
| 44 | `LanguageLevel` | Níveis de idioma |
| 45 | `License` | Tipos de CNH |
| 46 | `Location1` | Países |
| 47 | `Location2?idLocation1={id}` | Estados |
| 48 | `Location3?idLocation2={id}` | Cidades |
| 49 | `ManagerialLevel` | Níveis hierárquicos |
| 50 | `MaritalStatus` | Estados civis |
| 51 | `Nationality` | Nacionalidades |
| 52 | `RequestReason` | Razões de requisição |
| 53 | `Sex` | Sexos |
| 54 | `SocialNetwork` | Redes sociais |
| 55 | `Study1` | Níveis de escolaridade |
| 56 | `Study2?idStudy1={id}` | Áreas de estudo |
| 57 | `SubstitutionReason` | Motivos de substituição |
| 58 | `Vehicle` | Tipos de veículo |
| 59 | `WorkMethod` | Métodos de trabalho |
| 60 | `WorkingHour` | Tipos de jornada |

**Resultado do módulo:** todos 📋 Catalogados — tabelas de domínio; **nenhum** relacionado a
descoberta de candidatos.

---

## 5. Análise de cobertura de *discovery*

A pergunta operacional é: **para o cron-pull funcionar, é preciso, a cada ciclo, obter a lista de
pré-colaboradores novos/alterados.** Isso exige um endpoint de **enumeração** ou de **delta temporal
("mudanças desde")**. A tabela abaixo consolida a busca por esse recurso em toda a superfície:

| Caminho hipotético de descoberta | Endpoint que seria necessário | Existe na API v1? | Evidência |
|---|---|---|---|
| Listar pré-colaboradores | `PreCollaborator/List` ou `/Search` | **Não** | Módulo tem só `PreCollaborator/Get` (get-by-id) |
| "Mudanças desde" pré-colaboradores | `PreCollaborator/Changes?since=` | **Não** | Inexistente no catálogo |
| Enumerar inscrições → chegar aos candidatos | `Match/List` | **Não** | Módulo Match só tem `Get`, `ListQuestionnaires`, e escritas |
| Enumerar finalistas → candidatos | `RequestMatch/List` | **Não** | Módulo só tem `Get`, `ListEvaluations`, e escritas |
| Vaga → candidatos da vaga | `Vacancy/{id}/PreCollaborators` | **Não** | `Vacancy/List` para na vaga; `VacancyFolder/List` traz só etapas |
| Requisição → candidatos | via `Request/List` | **Não (vazio)** | `Request/List` exige `idVacancy` e retornou vazio no teste |
| Paginação genérica de candidatos | qualquer `List` paginado de PreCollaborator | **Não** | Só `CompanyUser/List` é paginado — e lista usuários, não candidatos |

**Todos os sete caminhos plausíveis falham.** Não há um único endpoint, em 60, que permita ao EA
*perguntar* "quem chegou de novo?".

### 5.1 Por que o get-by-id não resolve

`PreCollaborator/Get` **funciona**, mas exige o `idPreCollaborator` como entrada. Esse identificador
só pode ser obtido de duas formas:

1. **Já conhecê-lo** (ex.: uma admissão que o EA já processou antes) — inútil para *descobrir* novos;
2. **Recebê-lo por *push*** — o Pandapé entrega o `idPreCollaborator` no momento da criação, via
   **webhook**.

Não existe uma terceira via na API v1. O *polling* (cron-pull) opera sobre o conjunto do que já se
conhece; **por definição, ele não pode revelar um id que o EA nunca viu.**

### 5.2 Confirmação no próprio código do EA

Esta limitação está registrada e tratada no código de produção da Fase 5, no método que *deveria*
listar mudanças — ele retorna vazio por impossibilidade estrutural, com o motivo documentado:

> `listarMudancas()` — *"A API v1 **NÃO tem endpoint de listagem/discovery de pré-colaboradores**
> (só `Get` por id) → retornamos [] sempre. […] o discovery de novos pré-colaboradores não existe na
> API v1 — depende de webhook (push) ou de um id já conhecido; é uma decisão de arquitetura
> pendente. NÃO inventar endpoint."*
> — `apps/backend/src/pandape/pandape-api.service.ts`

---

## 6. Conclusão técnica

1. **A autenticação com credencial real funciona** (OAuth2 `client_credentials`, escopo `PandapeApi`,
   token de 1h) — a integração está tecnicamente conectada ao Pandapé de produção.

2. **A superfície completa da API v1 foi levantada: 60 endpoints em 14 módulos.** Os endpoints de
   leitura relevantes ao fluxo de admissão (`PreCollaborator/Get`, `Vacancy/List`, `Client/List`,
   `Request/List`, `Headquarter/List`) foram **confirmados ao vivo**; os demais foram catalogados
   pela especificação OpenAPI autenticada.

3. **Não existe, em nenhum dos 60 endpoints, um mecanismo de descoberta de pré-colaboradores** — nem
   listagem, nem busca, nem delta temporal ("mudanças desde"). O recurso `PreCollaborator` é
   estritamente *get-by-id*.

4. **Portanto, o modelo cron-pull não é capaz de descobrir candidatos novos por si só.** Ele depende
   de conhecer previamente o `idPreCollaborator`, o que só o *push* (webhook) fornece.

5. **Recomendação técnica:** reavaliar, junto à Infraestrutura, a **exposição controlada de um
   endpoint de recebimento (webhook)** para o Pandapé entregar o `idPreCollaborator` de cada
   pré-colaborador criado. A partir do id recebido por *push*, o restante do fluxo permanece por
   *pull* seguro (enriquecimento via `PreCollaborator/Get` → `Match/Get`, download de documentos em
   memória), preservando as garantias de LGPD já implementadas (§A.6).

### 6.1 Ressalva de escopo

Este relatório afirma o que foi **observado na API v1 pública/documentada em 2026-06-30**. Uma via
alternativa de enumeração — caso exista fora da especificação oficial (ex.: endpoint não publicado,
recurso habilitável a pedido, ou fila/notificação do lado do Pandapé) — **só pode ser confirmada pelo
suporte oficial do Pandapé**. Recomenda-se, em paralelo à decisão de infraestrutura, **abrir chamado
ao suporte Pandapé** questionando explicitamente a existência de um endpoint de listagem/delta de
pré-colaboradores. Até essa confirmação, a evidência técnica disponível aponta o **webhook como único
caminho viável**.

---

## Anexo A — Referências verificáveis

| Fonte | Referência |
|---|---|
| Especificação OpenAPI | `https://api.pandape.com.br/swagger/v1/swagger.json` (OpenAPI 3.0.1, *"Pandapé API v1"*, 60 paths) |
| Endpoint de token | `POST https://login.pandape.com.br/connect/token` (`grant_type=client_credentials`, `scope=PandapeApi`) |
| Código de produção (cliente da API) | `apps/backend/src/pandape/pandape-api.service.ts` |
| Registro da investigação | `DIARIO.md` — seção *"PANDAPÉ — CREDENCIAIS REAIS (OAuth) + INVESTIGAÇÃO DA API v1 — 2026-06-30"* |
| Decisão de arquitetura de origem | `CLAUDE.md` §A.5 (INT-1) e §A.8 (Fase 5) |

---

*Documento gerado para subsídio à decisão de infraestrutura. Não contém dados pessoais de candidato.*
