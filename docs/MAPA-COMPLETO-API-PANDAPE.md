# Mapa Completo Da API Do Pandape

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Tipo:** mapeamento (§A.27), nada construído
Extraído das especificações OFICIAIS, baixadas em 17/09/2026 de `api.pandape.com.br`.
§A.11 (sem travessão), §A.24 (title case em título e etiqueta).

**Este é o mapeamento COMPLETO, sem recorte por finalidade.** As varreduras anteriores olharam só o
que interessava à Admissão. Aqui está a API inteira, recurso por recurso.

## 1. O Tamanho Real

| Spec | Paths | Operações |
|---|---:|---:|
| **v1** | 60 | 60 |
| **v2** | 68 | 86 |
| **v3** | 6 | 7 |
| **TOTAL** | **134** | **153** |

As duas specs de `pandape.infojobs.com.br` (`HubApi` e `ExternalRequestApi`) **exigem login** e
NÃO entraram neste mapa. Elas são a única superfície ainda inexplorada.

## 2. O Que Interessa À Plataforma Unificadora

### 2.1 WEBHOOK: a resposta é NÃO, e agora é definitiva

Busca de texto completo nas TRÊS specs por `webhook`, `callback`, `notification`, `subscription`,
`hook`, `push`, `trigger`, `evento`, `gatilho`, `disparo` e `assinatura`: **ZERO ocorrências**. Nem em
path, nem em descrição, nem em schema, nem em tag.

**A API do Pandapé não documenta webhook nenhum**, nem sequer o de admissão que o EA já usa há meses e
que comprovadamente funciona. **O webhook vive no PAINEL, não na API**, e a lista de eventos não é
publicada. A pergunta "existe evento de movimentação de funil?" **não tem resposta na documentação**,
e a lacuna é deles.

### 2.2 MAS O FUNIL É LEGÍVEL, E ISSO MUDA O DESENHO

Sem webhook de funil, a movimentação continua alcançável **por leitura**, e os endpoints existem:

| Endpoint | O que dá |
|---|---|
| `GET /v2/vacancy-folders?idVacancy=` | **As ETAPAS de uma vaga**, que é o funil dela |
| `GET /v2/matches?IdVacancy=&IdVacancyFolder=&Page=&PageSize=` | **As inscrições, FILTRÁVEIS POR ETAPA** |
| `GET /v2/matches/{idMatch}` | O detalhe de uma inscrição |
| `GET /v2/request-matches?idMatch=` | O finalista, quando a vaga virou requisição |

**`IdVacancyFolder` como filtro é o achado.** Dá para perguntar "quem está NESTA etapa desta vaga",
que é exatamente o dado do funil. A movimentação se detecta comparando ciclos, do nosso lado.

**O que continua faltando, e é o que encarece:** **nenhum dos dois aceita filtro temporal.** Os
parâmetros de `/v2/matches` são `IdVacancy`, `IdVacancyFolder`, `Page` e `PageSize`, e os de
`/v2/vacancies` são `VacancyStatus`, `VacancyType`, `IdVacancy`, `Page` e `PageSize`. **Confirma por
leitura da spec o que as catorze variantes testadas ao vivo já haviam mostrado: não existe "mudou
desde".** O delta é sempre no cliente.

### 2.3 O ACHADO QUE NINGUÉM ESPERAVA: a API ESCREVE no funil

> `PATCH /v2/matches/{idMatch}/update`
> **"Move uma inscrição (Match) de etapa (VacancyFolder) em uma vaga (Vacancy)"**

> `PATCH /v2/request-matches/{idRequestMatch}`
> **"Move um finalista (RequestMatch) de etapa (RequestFolder) em uma requisição"**

> `POST /v2/matches`
> **"Criar uma nova inscrição (Match) em uma vaga"**

**Isto alcança a ressalva do item 5 da decisão do diretor.** Ele decidiu que, quando o consultor
escolhe a FONTE numa divergência, a plataforma **avisa que ele precisa ir ao Pandapé ajustar à mão**.
A API permitiria **fazer o ajuste por nós**, e fechar a divergência sozinha.

**A fábrica NÃO propõe construir isso agora, e o motivo está escrito na regra:** o protocolo LGPD,
seção 6, tem a **regra zero** (se dá para não escrever, não escreve), e escrita em produção de
terceiro exige endpoint único, confirmação, rastro, idempotência e limite de vazão. A decisão do
diretor foi o caminho manual, que é o mais seguro.

**Fica REGISTRADO como possibilidade, para decisão futura**, e é informação que ele não tinha quando
decidiu: o "vá lá e ajuste" é hoje uma escolha, não uma limitação técnica.

### 2.4 Outros recursos úteis ao desenho, que a varredura antiga não destacou

| Recurso | Para quê |
|---|---|
| `GET /v2/vacancies` (`VacancyStatus`, `VacancyType`) | Listar vagas e **escopar a varredura pelas ativas** |
| `GET /v2/vacancies/{idRequest}` | Resolver vaga a partir da requisição |
| `Dictionary` (24 na v1, **30 na v2**) | Os catálogos, e é a maior família da API. Insumo do de/para |
| `GET /v2/clients/requests?idVacancy=` | Ligação requisição x vaga, útil ao de/para de cliente |
| `KillerQuestion` (3, só na v2) | Perguntas eliminatórias, que são dado de triagem |
| `GET /v2/matches/{idMatch}/questionnaires` | Respostas do candidato, dado de triagem |
| `GET /v3/interviews/{idAction}/analysis-data` | Análise de entrevista. **Não existia na varredura de 01/07** |

### 2.5 A API CRESCEU desde a última varredura

A v3 tinha **4 paths** em 01/07/2026 e tem **6** hoje. Nenhuma varredura é definitiva, e o mapa tem
data por isso.

### 2.6 O QUE AINDA NÃO FOI LIDO, e é onde a resposta do webhook pode estar

O host `pandape.infojobs.com.br` carrega **duas specs que nenhuma investigação anterior conhecia**:
`HubApi` e `ExternalRequestApi`. As duas **exigem login** e devolvem a página de autenticação.
`HubApi` é nome sugestivo de central de eventos.

**Passo a passo para o diretor:**
1. Entrar logado em `pandape.infojobs.com.br`.
2. Abrir `pandape.infojobs.com.br/swagger`.
3. No seletor de especificação do alto da página, escolher `HubApi` e depois `ExternalRequestApi`.
4. Salvar os dois `swagger.json` (ou tirar foto da lista de endpoints) e entregar à fábrica.

**Em paralelo, o caminho de dois minutos:** abrir a tela de cadastro de webhook no painel e
**fotografar o dropdown de eventos**. O registro do go-live diz que o de admissão é "o ÚNICO cujo
payload traz `IdPreCollaborator`", frase que só faz sentido se houver mais itens na lista.

## 3. Leitura AUTENTICADA, 17/09/2026: A Resposta Definitiva Do Webhook

Com a credencial nova (OAuth2 client_credentials), token obtido e válido por 3600s, grade GET-only,
TLS verificado, alfabeto de id fechado. **Credencial e token EXPURGADOS (`shred`) ao fim**, e a pasta
removida. Zero PII impressa.

### 3.1 As duas specs protegidas NÃO abrem por OAuth

`HubApi` e `ExternalRequestApi` vivem em `pandape.infojobs.com.br` e **exigem SESSÃO DE NAVEGADOR**,
não Bearer. Com e sem token, as duas devolvem **HTTP 404 com a página "Erro, Pandapé"**, que menciona
login. A credencial da API não alcança esse host, e isso não é permissão faltando: é outra porta.

Os nomes que o carregador declara são **"Hub Api"** e **"External Request Api"**.

### 3.2 NÃO EXISTE ROTA DE WEBHOOK NA API. Provado ao vivo, com token válido

Dez caminhos plausíveis, **todos HTTP 404**, com credencial boa na mão:

| Caminho | Resultado |
|---|---|
| `/v1/Webhook/List`, `/v1/Webhook` | 404 |
| `/v2/webhooks`, `/v3/webhooks` | 404 |
| `/v1/Notification/List`, `/v2/notifications` | 404 |
| `/v2/subscriptions`, `/v3/subscriptions` | 404 |
| `/v2/events`, `/v3/events` | 404 |

**404 com token VÁLIDO é ausência de rota, não falta de permissão** (recurso existente e não liberado
responde 403, e o discriminador é o mesmo usado na leitura do GI). Somado às ZERO ocorrências de
`webhook` nas três specs, a conclusão fecha: **o webhook do Pandapé não tem nenhuma superfície de API.
Ele é só painel.**

### 3.3 O FUNIL RESPONDE, E ESTE É O ACHADO DE MAIOR VALOR

`GET /v2/vacancy-folders?idVacancy=` respondeu **HTTP 200** numa vaga real da conta, devolvendo as
**etapas de verdade que o time usa no Pandapé hoje**:

> `Lead` · `Inscritos` · `triados` · `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` ·
> `ENTREVISTA SOULAN` · `SHORT LIST, ENCAMINHADOS CLIENTE` · `Contratados` · `RETORNO VAGA STAND BY` ·
> `RETORNO NEGATIVO` · `Descartados`

**São DEZ etapas, e elas são de TEXTO LIVRE, por vaga.** Isso confirma o alerta antigo ("etapas de
nome livre, não há id canônico de contratado") com dado fresco, e acrescenta o que faltava: **o funil
do Pandapé é LEGÍVEL hoje, sem webhook nenhum.**

**E o de/para com o EA é viável, porque há sobreposição evidente:** `ENTREVISTA SOULAN` bate com
`ENTREVISTA_SOULAN`; `SHORT LIST, ENCAMINHADOS CLIENTE` conversa com `ENTREVISTA_CLIENTE`; `triados`
com `TRIAGEM`; `Lead` e `Inscritos` com `CAPTACAO`. **O de/para é trabalho do diretor**, porque os
nomes são livres e mudam por vaga, mas ele tem forma.

**Consequência para a cadência:** a movimentação de funil do Pandapé é alcançável **por leitura
periódica**, comparando ciclos do nosso lado. Não é o tempo real do webhook, e é muito melhor do que
"não há entrada nenhuma", que era o estado anterior do desenho.

### 3.4 O que resta, e é pouco

Só as duas specs protegidas. **Passo a passo para o diretor:** entrar logado em
`pandape.infojobs.com.br`, abrir `/swagger`, escolher `Hub Api` e depois `External Request Api` no
seletor do topo, e salvar os dois `swagger.json` (ou fotografar a lista de endpoints). Em paralelo,
continua valendo fotografar o dropdown de eventos na tela de cadastro de webhook do painel.

---

## Especificação V1: 60 paths, 60 operações

### Client (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/Client/Create` | Cria um novo cliente (Client). |
| POST | `/v1/Client/Delete` | Excluir um cliente (Client). |
| GET | `/v1/Client/Get` | Obtém os dados de um cliente (Client). |
| GET | `/v1/Client/List` | Obtém uma lista de clientes (Clients) associados a uma empresa (Company). |
| POST | `/v1/Client/Update` | Modifica um cliente (Client). |

### CompanyUser (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/CompanyUser/List` | Obtém uma lista de usuários (CompanyUser) ativos associados a uma empresa (Company). |

### CustomField (2)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/CustomField/List` | Obtém uma lista de campos personalizados (CustomFieldModel) disponíveis para as requisições (Request). |
| GET | `/v1/CustomField/ListDictionaryValues/{id}` | Obtém uma lista de valores de um dicionário (DictionaryValue). |

### Datasource (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/Datasource/AddItems` | Adiciona itens (DatasourceItem) a um datasource (Datasource). |
| POST | `/v1/Datasource/Create` | Cria um novo datasource (Datasource) |
| POST | `/v1/Datasource/DeleteItems` | Deleta itens (DatasourceItem) associados a um datasource (Datasource) |
| GET | `/v1/Datasource/List` | Obtém uma lista de datasources (Datasource). |
| GET | `/v1/Datasource/ListItems` | Obtém uma lista de itens (DatasourceItem) associados a um datasource (Datasource). |

### Dictionary (24)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/Dictionary/Category1` | Obtém uma lista das áreas de um cargo (Category1). |
| GET | `/v1/Dictionary/Category2` | Obtém uma lista das especializações das áreas de um cargo (Category2). |
| GET | `/v1/Dictionary/Children` | Obtém uma lista de opções sobre filhos (Children). |
| GET | `/v1/Dictionary/ContractWorkType` | Obtém uma lista dos tipos de contrato (ContractWorkType). |
| GET | `/v1/Dictionary/Deficiency1` | Obtém uma lista dos tipos de deficiência (Deficiency1). |
| GET | `/v1/Dictionary/Deficiency2` | Obtém uma lista dos graus de deficiência (Deficiency2). |
| GET | `/v1/Dictionary/Language` | Obtém uma lista de idiomas (Language). |
| GET | `/v1/Dictionary/LanguageLevel` | Obtém uma lista de níveis de idioma (LanguageLevel). |
| GET | `/v1/Dictionary/License` | Obtém uma lista de tipos de carteira de motorista (License). |
| GET | `/v1/Dictionary/Location1` | Obtém uma lista de países (Location1). |
| GET | `/v1/Dictionary/Location2` | Obtém uma lista de estados (Location2). |
| GET | `/v1/Dictionary/Location3` | Obtém uma lista de cidades (Location3). |
| GET | `/v1/Dictionary/ManagerialLevel` | Obtém uma lista dos níveis hierárquicos de um cargo (ManagerialLevel). |
| GET | `/v1/Dictionary/MaritalStatus` | Obtém uma lista dos estados civis (MaritalStatus). |
| GET | `/v1/Dictionary/Nationality` | Obtém uma lista de nacionalidades (Nationality). |
| GET | `/v1/Dictionary/RequestReason` | Obtém uma lista de razões (RequestReason). |
| GET | `/v1/Dictionary/Sex` | Obtém uma lista dos sexos (Sex). |
| GET | `/v1/Dictionary/SocialNetwork` | Obtém uma lista das redes sociais (SocialNetwork). |
| GET | `/v1/Dictionary/Study1` | Obtém uma lista dos níveis de escolaridade (Study1). |
| GET | `/v1/Dictionary/Study2` | Obtém uma lista das áreas de estudo (Study2). |
| GET | `/v1/Dictionary/SubstitutionReason` | Obtém uma lista de motivos de substituição (SubstitutionReason). |
| GET | `/v1/Dictionary/Vehicle` | Obtém uma lista dos tipos de veículo (Vehicle). |
| GET | `/v1/Dictionary/WorkMethod` | Obtém uma lista dos métodos de trabalho (WorkMethod). |
| GET | `/v1/Dictionary/WorkingHour` | Obtém uma lista dos tipos de jornada de trabalho (WorkingHour). |

### Headquarter (4)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/Headquarter/Create` | Cria uma nova Sede (HeadQuarter) |
| GET | `/v1/Headquarter/Get` | Obtém os dados da Sede. |
| GET | `/v1/Headquarter/List` | Obtém uma lista de sedes (HeadQuarter) associados a uma empresa (Company). |
| GET | `/v1/Headquarter/UpdateClient` | Modifica o cliente (Client) de uma Sede (HeadQuarter) |

### Match (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/Match/Create` | Criar uma nova inscrição (Match) em uma vaga (Vacancy). |
| GET | `/v1/Match/Get` | Obtém as informações relacionadas à inscrição de um candidato em uma oferta (Match). |
| GET | `/v1/Match/ListQuestionnaires` | Obtém uma lista de questionários (Questionnaire) e respostas de uma inscrição (Match). |
| POST | `/v1/Match/UpdateFolder` | Move uma inscrição (Match) de etapa (VacancyFolder) em uma vaga (Vacancy). |
| POST | `/v1/Match/UploadPhoto` | Atualiza a foto do candidato da inscrição (Match) na vaga (Vacancy). |

### PreCollaborator (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/PreCollaborator/Get` | Obtém as informações relacionadas à um pré-colaborador (PreCollaborator). |

### Request (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/Request/Create` | Crie uma requisição de cliente (Request) para uma sede (HeadQuarter). |
| POST | `/v1/Request/Delete` | Excluir uma requisição de cliente (Request) para uma sede (HeadQuarter). |
| GET | `/v1/Request/Get` | Obtém os detalhes de uma requisição de cliente (RequestDetail). |
| GET | `/v1/Request/List` | Obtém uma lista de requisições de cliente (Requests) associadas a uma vaga (Vacancy). |
| POST | `/v1/Request/Update` | Edita uma requisição de cliente (Request) para uma sede (HeadQuarter). |

### RequestFolder (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/RequestFolder/List` | Obtém uma lista das etapas (RequestFolders) de uma requisição (Request). |

### RequestMatch (4)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v1/RequestMatch/Create` | Crie um novo finalista (RequestMatch) para uma requisição (Request). |
| GET | `/v1/RequestMatch/Get` | Obtém os detalhes de um finalista (RequestMatch). |
| GET | `/v1/RequestMatch/ListEvaluations` | Obtém uma lista das avaliações (Evaluations) de um finalista (RequestMatch). |
| POST | `/v1/RequestMatch/UpdateFolder` | Move um finalista (RequestMatch) de etapa (RequestFolder) em uma requisição (Request). |

### RequestUser (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/RequestUser/List` | Obtém uma lista dos usuários (User) associados a uma requisição (Request). |

### Vacancy (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/Vacancy/List` | Obtém uma lista das vagas (Vacancies). |

### VacancyFolder (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v1/VacancyFolder/List` | Obtém uma lista das etapas (VacancyFolders) de uma vaga (Vacancy). |

---

## Especificação V2: 68 paths, 86 operações

### Candidate (1)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v2/candidates` | Cria um novo candidato (Candidate) na Base Própria. |

### Client (5)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/clients` | Obtém uma lista de clientes (Clients) associados a uma empresa (Company). |
| POST | `/v2/clients` | Cria um novo cliente (Client). |
| DELETE | `/v2/clients` | Excluir um cliente (Client). |
| GET | `/v2/clients/{idClient}` | Obtém os dados de um cliente (Client). |
| PUT | `/v2/clients/{idClient}` | Modifica um cliente (Client). |

### ClientHeadquarter (4)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/clients/headquarters` | Obtém uma lista das Sedes (HeadQuarter) ativas associadas a uma empresa (Company). |
| POST | `/v2/clients/headquarters` | Cria uma nova Sede (HeadQuarter) |
| GET | `/v2/clients/headquarters/{idHeadquarter}` | Obtém os dados da Sede. |
| PATCH | `/v2/clients/headquarters/{idHeadquarter}` | Modifica o cliente (Client) de uma Sede (HeadQuarter) |

### ClientRequest (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v2/clients/headquarters/{idHeadquarter}/requests` | Crie uma requisição de cliente (Request) para uma sede (HeadQuarter). |
| PUT | `/v2/clients/headquarters/{idHeadquarter}/requests/{idRequest}` | Edita uma requisição de cliente (Request) para uma sede (HeadQuarter). |
| DELETE | `/v2/clients/headquarters/{idHeadquarter}/requests/{idRequest}` | Excluir uma requisição de cliente (Request) para uma sede (HeadQuarter). |
| GET | `/v2/clients/requests` | Obtém uma lista de requisições de cliente (Requests) associadas a uma vaga (Vacancy). |
| GET | `/v2/clients/requests/{idRequest}` | Obtém os detalhes de uma requisição de cliente (RequestDetail). |

### CompanyUser (3)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v2/company/users` | Cria um novo usuário (CompanyUser) |
| GET | `/v2/company/users` | Obtém uma lista de usuários (CompanyUser) ativos associados a uma empresa (Company). |
| GET | `/v2/company/users/{idCompanyUser}` | Obtém dados do usuário (CompanyUser) ativo associado a uma empresa (Company). |

### CustomField (2)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/custom-fields` | Obtém uma lista de campos personalizados (CustomFieldModel) disponíveis para as requisições (Request). |
| GET | `/v2/custom-fields/dictionary-values/{idDictionary}` | Obtém uma lista de valores de um dicionário (DictionaryValue). |

### Datasource (6)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/data-sources` | Obtém uma lista de datasources (Datasource). |
| POST | `/v2/data-sources` | Cria um novo datasource (Datasource) |
| GET | `/v2/data-sources/items` | Obtém uma lista de itens (DatasourceItem) associados a um datasource (Datasource). |
| GET | `/v2/data-sources/items/{idDatasourceItem}` | Recupera um item de datasource pelo seu identificador. |
| POST | `/v2/data-sources/{idDatasource}/items` | Adiciona itens (DatasourceItem) a um datasource (Datasource). |
| DELETE | `/v2/data-sources/{idDatasource}/items` | Deleta itens (DatasourceItem) associados a um datasource (Datasource) |

### Dictionary (30)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/dictionaries/category1` | Obtém uma lista das áreas de um cargo (Category1). |
| GET | `/v2/dictionaries/category2` | Obtém uma lista das especializações das áreas de um cargo (Category2). |
| GET | `/v2/dictionaries/children` | Obtém uma lista de opções sobre filhos (Children). |
| GET | `/v2/dictionaries/contract-worktype` | Obtém uma lista dos tipos de contrato (ContractWorkType). |
| GET | `/v2/dictionaries/deficiency1` | Obtém uma lista dos tipos de deficiência (Deficiency1). |
| GET | `/v2/dictionaries/deficiency2` | Obtém uma lista dos graus de deficiência (Deficiency2). |
| GET | `/v2/dictionaries/experience-range` | Obtém uma lista de faixas de experiência. |
| GET | `/v2/dictionaries/gender-identity` | Obtém uma lista de identidades de gênero (GenderIdentity). |
| GET | `/v2/dictionaries/language` | Obtém uma lista de idiomas (Language). |
| GET | `/v2/dictionaries/language-level` | Obtém uma lista de níveis de idioma (LanguageLevel). |
| GET | `/v2/dictionaries/license` | Obtém uma lista de tipos de carteira de motorista (License). |
| GET | `/v2/dictionaries/location1` | Obtém uma lista de países (Location1). |
| GET | `/v2/dictionaries/location2` | Obtém uma lista de estados (Location2). |
| GET | `/v2/dictionaries/location3` | Obtém uma lista de cidades (Location3). |
| GET | `/v2/dictionaries/managerial-level` | Obtém uma lista dos níveis hierárquicos de um cargo (ManagerialLevel). |
| GET | `/v2/dictionaries/marital-status` | Obtém uma lista dos estados civis (MaritalStatus). |
| GET | `/v2/dictionaries/nationality` | Obtém uma lista de nacionalidades (Nationality). |
| GET | `/v2/dictionaries/postal-codes` | sem descrição |
| GET | `/v2/dictionaries/publishers` | Obtém uma lista de publishers. |
| GET | `/v2/dictionaries/race` | Obtém uma lista de cor/raça (Race). |
| GET | `/v2/dictionaries/request-reason` | Obtém uma lista de razões (RequestReason). |
| GET | `/v2/dictionaries/sex` | Obtém uma lista dos sexos (Sex). |
| GET | `/v2/dictionaries/sexual-orientation` | Obtém uma lista de orientações sexuais (SexualOrientation). |
| GET | `/v2/dictionaries/social-network` | Obtém uma lista das redes sociais (SocialNetwork). |
| GET | `/v2/dictionaries/study1` | Obtém uma lista dos níveis de escolaridade (Study1). |
| GET | `/v2/dictionaries/study2` | Obtém uma lista das áreas de estudo (Study2). |
| GET | `/v2/dictionaries/substitution-reason` | Obtém uma lista de motivos de substituição (SubstitutionReason). |
| GET | `/v2/dictionaries/vehicle` | Obtém uma lista dos tipos de veículo (Vehicle). |
| GET | `/v2/dictionaries/work-method` | Obtém uma lista dos métodos de trabalho (WorkMethod). |
| GET | `/v2/dictionaries/working-hour` | Obtém uma lista dos tipos de jornada de trabalho (WorkingHour). |

### KillerQuestion (3)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/killer-questions/{idVacancy}` | Obtém uma lista de questões eliminatórias (KillerQuestion). |
| POST | `/v2/killer-questions/{idVacancy}` | Adiciona questões eliminatórias (KillerQuestion) em uma vaga (Vacancy). |
| DELETE | `/v2/killer-questions/{idVacancy}` | Exclui questões eliminatórias (KillerQuestion) de uma vaga (Vacancy). |

### Match (5)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/matches` | Obtém uma lista das inscrições (Match) de uma vaga (Vacancy). |
| POST | `/v2/matches` | Criar uma nova inscrição (Match) em uma vaga (Vacancy). |
| GET | `/v2/matches/{idMatch}` | Obtém as informações relacionadas à inscrição de um candidato (Match) em uma oferta (Vacancy). |
| GET | `/v2/matches/{idMatch}/questionnaires` | Obtém uma lista de questionários (Questionnaire) e respostas de uma inscrição (Match). |
| PATCH | `/v2/matches/{idMatch}/update` | Move uma inscrição (Match) de etapa (VacancyFolder) em uma vaga (Vacancy) ou atualiza a foto do candidato da i |

### PreCollaborator (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/precollaborators/{idPreCollaborator}` | Obtém as informações relacionadas à um pré-colaborador (PreCollaborator). |

### Request (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v2/requests` | Cria uma requisição própria (Request). |
| GET | `/v2/requests` | Obtém uma lista de requisições próprias (Request). |
| GET | `/v2/requests/{idRequest}` | Obtém os detalhes de uma requisição própria (Request). |
| PATCH | `/v2/requests/{idRequest}` | Modifica uma requisição própria (Request). |
| PATCH | `/v2/requests/{idRequest}/assign-vacancy` | sem descrição |

### RequestFolder (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/request-folders/{idRequest}` | Obtém uma lista das etapas (RequestFolders) de uma requisição (Request). |

### RequestMatch (5)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v2/request-matches` | Crie um novo finalista (RequestMatch) para uma requisição (Request). |
| GET | `/v2/request-matches` | Obtém uma lista de finalistas (RequestMatch) associados a uma inscrição (Match). |
| PATCH | `/v2/request-matches/{idRequestMatch}` | Move um finalista (RequestMatch) de etapa (RequestFolder) em uma requisição (Request). |
| GET | `/v2/request-matches/{idRequestMatch}` | Obtém os detalhes de um finalista (RequestMatch). |
| GET | `/v2/request-matches/{idRequestMatch}/evaluations` | Obtém uma lista das avaliações (Evaluations) de um finalista (RequestMatch). |

### RequestUser (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/requests/{idRequest}/users` | Obtém uma lista dos usuários (User) associados a uma requisição (Request). |

### Vacancy (8)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/vacancies` | Obtém uma lista das vagas (Vacancy). |
| POST | `/v2/vacancies` | Crie uma vaga (Vacancy). |
| GET | `/v2/vacancies/templates` | Obtém uma lista de modelo de vagas (VacancyTemplate) |
| GET | `/v2/vacancies/templates/{idVacancyTemplate}` | Obtém o modelo de vaga (VacancyTemplate) |
| PUT | `/v2/vacancies/updatevacancyusers` | Atualiza os usuários responsáveis por uma vaga (Vacancy). |
| GET | `/v2/vacancies/{idRequest}` | Obtém o modelo de criação de uma vaga (Vacancy) a partir de uma requisição (Request). |
| PUT | `/v2/vacancies/{idVacancy}` | Atualiza a vaga (Vacancy). |
| PATCH | `/v2/vacancies/{idVacancy}` | Altera o status de uma vaga. |

### VacancyFolder (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v2/vacancy-folders` | Obtém uma lista das etapas (VacancyFolders) de uma vaga (Vacancy). |

---

## Especificação V3: 6 paths, 7 operações

### CompanyUser (1)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v3/company/users` | Cria um novo usuário (CompanyUser). |

### InterviewAnalysis (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v3/interviews/{idAction}/analysis-data` | sem descrição |

### PreCollaborator (1)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v3/precollaborators/{idPreCollaborator}` | Obtém as informações relacionadas à um pré-colaborador (PreCollaborator). |

### Request (3)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/v3/requests` | sem descrição |
| PATCH | `/v3/requests/{idRequest}` | Modifica parcialmente os dados de uma requisição própria (Request). |
| PUT | `/v3/requests/{idRequest}` | Modifica apenas o status de uma requisição própria (Request). |

### Vacancy (1)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/v3/vacancies` | sem descrição |

