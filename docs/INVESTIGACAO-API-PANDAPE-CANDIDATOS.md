# A&S Central de Candidatos: o que a API do Pandapé entrega de candidato

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-24 · **Tipo:** investigação (§A.27)
**Regra desta OST:** nada construído. Este documento é levantamento para o diretor validar.
**Ambiente:** nenhum. §A.11 (sem travessão), §A.24 (title case em título e etiqueta).

---

## 0. Como esta investigação foi feita, e o que ela NÃO fez

**Nenhuma requisição ao Pandapé foi disparada nesta sessão.** Nem à API, nem ao swagger público.
A ordem foi "não se conectar", houve dúvida sobre se o swagger cabia nessa proibição, e a §A.14 manda
parar na dúvida em vez de decidir sozinho. As lacunas que isso deixa estão nomeadas na §7.

O que sustenta o relatório é material que já existe no repositório, produzido em **quatro
investigações anteriores feitas COM credencial real e ao vivo**, mais o cliente de produção da API:

| Fonte | Data | O que provou |
|---|---|---|
| `docs/RELATORIO-INVESTIGACAO-API-PANDAPE.md` | 30/06/2026 | Os 60 endpoints da v1, catalogados um a um |
| `docs/RELATORIO-INVESTIGACAO-API-PANDAPE-V2-V3.md` | 01/07/2026 | Os 68 da v2 e os 4 da v3, e a descoberta do `GET /v2/matches` |
| `docs/INVESTIGACAO-REQUESTSTATUS-FILTROS-PANDAPE-V2.md` | 01/07/2026 | Varredura de TODOS os filtros de listagem da v2, ao vivo |
| `docs/INVESTIGACAO-VAGA-REQUISICAO-PANDAPE.md` | 02/07/2026 | Nível vaga e requisição, e o perfil rico do candidato |
| `apps/backend/src/pandape/pandape-api.service.ts` | vivo | Os campos reais, batidos contra a API de produção |

Isso é **mais forte** que a documentação pública: são respostas reais da conta da Soulan, com HTTP
anotado. O que falta é só o inventário campo a campo de um endpoint (§7.1).

---

## 1. Resposta curta às cinco perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Que dados de candidato a API entrega? | **Muitos, e em três níveis.** Identificação e contato completos (com CPF), etapa no processo, e um perfil com experiências, formação, idiomas e pretensão salarial. Detalhe na §3 |
| 2 | Como é a autenticação, e o Rike precisa providenciar credencial? | **OAuth2 client_credentials.** A credencial JÁ EXISTE e JÁ ESTÁ configurada. **O Rike não precisa providenciar nada técnico.** Precisa destravar uma coisa política, §6 |
| 3 | Dá para puxar candidato ligado a uma vaga, ou só solto? | **Só ligado a vaga, e isso é uma boa notícia.** Candidato solto não existe na API. A unidade é a inscrição do candidato NUMA vaga. §4 |
| 4 | Quais os limites? | Sem listagem global, sem "mudanças desde", paginação obrigatória, e um teto de requisições **compartilhado com a folha de pagamento**. §5 |
| 5 | Qual o caminho técnico da ponte? | Varredura periódica por vaga, escopada pelas vagas abertas, reusando a fila e o cliente OAuth que já existem. §8 |

---

## 2. Autenticação: já resolvida

| Item | Valor |
|---|---|
| Modelo | **OAuth2 `client_credentials`** (IdentityServer) |
| Endpoint de token | `POST https://login.pandape.com.br/connect/token` |
| Escopo | `PandapeApi` |
| Validade do token | 3600s (1h), renovado sozinho |
| Credencial | `PANDAPE_CLIENT_ID` + `PANDAPE_CLIENT_SECRET`, **já no `.env` do backend** |

**Não existe "PANDAPE_API_TOKEN".** Esse nome circulou como pendência do diretor por um tempo e era
erro de documentação, corrigido na §A.9 do CLAUDE.md.

O cliente HTTP já está escrito, em produção, e resolve o token sozinho: emite, cacheia, renova 60s
antes de expirar, e compartilha uma única emissão em voo para não abrir corrida. Sem credencial ele
**nasce inerte**, não toca a rede e não quebra nada. Isso significa que a Central de Candidatos
**não começa do zero na parte de conexão**.

**§A.6, já implementado:** `client_secret` e `access_token` nunca são logados nem persistidos.

---

## 3. O que a API entrega de candidato

A API tem **três objetos diferentes** para a mesma pessoa, com riqueza crescente. Entender isso é o
que evita construir a Central de Candidatos consultando o endpoint pobre.

### 3.1 O objeto MATCH (a inscrição do candidato numa vaga) é o principal

Um **match** é "esta pessoa se inscreveu nesta vaga". É a unidade que a API oferece, e é ela que
carrega os dados do candidato.

**Nível 1, a LISTA.** `GET /v2/matches?IdVacancy={id}&IdVacancyFolder={id}&Page={n}&PageSize={n}`

Confirmado ao vivo em 01/07/2026: HTTP 200, **253 candidatos numa única vaga**. Cada item traz:

| Campo | O que é | Serve para |
|---|---|---|
| `idMatch` | Id da inscrição | Chave de idempotência da ponte |
| `idCandidate` | Id da PESSOA | Reconhecer a mesma pessoa em vagas diferentes |
| `idVacancy` | Id da vaga | Ligação com a Central de Vagas |
| **`idVacancyFolder`** | **Etapa atual no funil** | O status do candidato no processo |
| **`cpf`** | CPF | Chave de identidade do EA (§A.3). **PII** |
| `name`, `surname` | Nome e sobrenome | Identificação. **PII** |
| `email`, `phone` | Contato | Histórico de contato. **PII** |
| `birthDate` | Nascimento | **PII** |
| `cep`, `address` | Endereço | **PII** |
| **`modifyDate`, `insertDate`** | Carimbos de tempo | **A única forma de fazer delta**, §5.3 |
| `hasBeenSentToERP` | Já foi para o ERP | Sinal de que virou admissão |
| `requests[]`, `job` | Requisição e cargo | Contexto |

**Este endpoint sozinho já sustenta uma Central de Candidatos.** Ele entrega identificação completa,
contato, CPF e etapa, paginado e filtrável por vaga e por etapa.

**Nível 2, o PERFIL COMPLETO.** `GET /v2/matches/{idMatch}`

A investigação de 02/07/2026 registrou este endpoint como **"riquíssimo, perfil completo do
candidato"**, contendo:

- **experiências profissionais**
- **formação / escolaridade**
- **idiomas**
- **skills**
- **pretensão salarial** (`SalaryMin` / `SalaryMax`)
- **disponibilidade**
- `Requests[]` (as requisições em que a pessoa está)
- CPF

É aqui que mora o "currículo" que a Central de Candidatos quer mostrar. **Ressalva honesta:** o
inventário campo a campo deste endpoint **não foi levantado** (§7.1). Sabe-se QUE os blocos existem,
não se sabe o nome exato de cada campo nem o formato de cada lista.

**Nível 3, o subconjunto v1.** `GET /v1/Match/Get?idMatch={id}`

O que o EA já consome hoje. Mais pobre: `cpf`, `name`, `surname`, `email`, `phone`, `birthDate`,
`idSex`, `cep`, `address`. Serve à admissão, **não serve à Central de Candidatos**.

### 3.2 O objeto PRE-COLLABORATOR só existe depois da admissão

`GET /vN/precollaborators/{id}` só responde por quem **já foi enviado para admissão** no Pandapé.
Traz `name`, `surname`, `email`, `admissionDate`, `vacancyJob`, `currentFolderName`, e os
**documentos**. A v3 é a única que entrega os documentos **agrupados por tipo** (`forms[]`), que é o
que alimenta a auditoria da esteira.

**Para a Central de Candidatos ele chega tarde demais:** o funil de A&S acontece todo ANTES disso.
Ele é o objeto da Admissão, não o da Seleção.

### 3.3 O que NÃO existe

| O que se esperaria | Existe? |
|---|---|
| Uma "ficha do candidato" independente de vaga (`GET /v2/candidates/{id}`) | **Não.** O módulo `Candidate` da v2 tem UM endpoint, e é **`POST` de criação**. Não há leitura |
| Listagem global de candidatos | **Não.** §4 |
| Campo explícito de ORIGEM (portal, indicação, busca ativa, importado) | **Não confirmado em nenhum campo levantado.** Lacuna, §7.2 |
| Currículo como ARQUIVO (o PDF que o candidato subiu) | **Não confirmado.** Lacuna, §7.3. Documentos só aparecem no pré-colaborador, e são documentos de admissão, não currículo |
| Histórico de contato com o candidato (ligações, mensagens) | **Não.** Nenhum endpoint do catálogo faz isso. Se a Central de Candidatos quiser histórico de contato, ele **nasce no EA** |

---

## 4. Candidato ligado à vaga, ou solto? Só ligado, e isso ajuda

**Não existe candidato solto na API.** Provado ao vivo:

| Chamada | HTTP |
|---|:---:|
| `GET /v2/matches` (sem nenhum parâmetro) | **400** |
| `GET /v2/matches?IdVacancy=847` (sem paginação) | **400** |
| `GET /v2/matches?IdVacancy=847&Page=1&PageSize=1` | **200** |

A listagem é **sempre por vaga**. Não há como perguntar "me dê todos os candidatos da conta".

**Por que isso é uma boa notícia, e não um problema:** a Central de Candidatos que o Rike descreveu
é exatamente um funil **por vaga**, com alocação de candidato em vaga. O modelo da API já é o modelo
do negócio. Se a API entregasse candidato solto, o EA teria de inventar a ligação; entregando por
vaga, ela vem pronta.

**E a mesma pessoa em várias vagas?** `idCandidate` é o id da PESSOA e repete entre matches. Então
"João está em 3 processos" é uma pergunta respondível, agrupando por `idCandidate`. O EA agrupa por
CPF, que é a chave dele, e chega no mesmo lugar.

---

## 5. Os limites, e o mais sério deles

### 5.1 O teto de requisições é compartilhado com a folha de pagamento

**1.000 requisições a cada 5 minutos, e o teto é da CONTA, não do EA.** O mesmo teto serve o webhook
do G.Infor que alimenta a folha de pagamento. Estourar o teto do lado do EA **atrasa a folha**.

Isto está registrado na §A.5 do CLAUDE.md como **requisito de segurança**, não como recomendação. É
a restrição que mais amarra o desenho da ponte.

### 5.2 O fan-out, com números

Não existe "me dê os candidatos novos". Existe "me dê os candidatos DESTA vaga". Então descobrir
candidato novo é varrer vaga por vaga.

| Universo | Quantidade | Fonte |
|---|---:|---|
| Vagas no histórico da conta Pandapé | **6.822** | `GET /v2/vacancies`, live 01/07 |
| Vagas ativas / publicadas (`VacancyStatus=2`) | **907** | live 01/07 |
| Vagas ABERTAS na base da Soulan (Central de Vagas) | **198** | base importada, `vaga_status` |

Uma varredura ingênua das 907 ativas custa, por ciclo, cerca de **1.800 chamadas** (uma de etapas
mais ao menos uma página de matches por vaga). Isso é **quase o dobro do teto de 5 minutos**, sozinho,
sem contar a admissão. Inviável de 5 em 5 minutos, viável uma vez por dia.

**O caminho que resolve:** varrer só as vagas que o EA tem ABERTAS na Central de Vagas, não as 907 do
Pandapé. São **198**, cerca de **400 chamadas por ciclo**, que cabem com folga confortável sob o teto.
Isso depende de uma peça que hoje não existe, e é o achado da §7.4.

### 5.3 Não existe "mudanças desde" em lugar nenhum

Testadas ao vivo **catorze variantes** de filtro temporal (`ModifiedSince`, `modifiedSince`, `since`,
`updatedAfter`, `InsertDateFrom`, `ModifyDateFrom`, `CreationDateFrom`, em `matches` e em `requests`).
**Todas retornaram HTTP 200 e ignoraram o filtro**: a contagem ficou idêntica ao baseline.

Consequência: o delta é **sempre no cliente**. O EA puxa a página e compara `modifyDate` com o que
guardou do ciclo anterior. Funciona, mas significa **baixar para depois descartar**.

### 5.4 Os outros limites

| Limite | Detalhe |
|---|---|
| Paginação obrigatória | `Page` e `PageSize` são opcionais no swagger e **obrigatórios na prática** (400 sem eles) |
| Etapas de nome livre | As pastas do funil são nomeadas por vaga. A vaga 847 tinha `Lead`, `Inscritos`, `Pré-selecionado`, `Finalistas`, `Contratados`, `Descartados`. **Não há id canônico de "contratado"**, exige de/para |
| Sem filtro por status de requisição | Nenhuma listagem aceita `RequestStatus`. E `RequestStatus` é o ciclo da REQUISIÇÃO, não do candidato: provado ao vivo uma requisição `Approved` com **zero** contratados |
| A requisição está ociosa nesta conta | 13 requisições no total, todas com 0 candidatos e **`idVacancyAssociated = null`**. A conta opera em recrutamento direto. **Não construir nada em cima de Requisição** |
| Cliente não volta da vaga | A vaga não expõe `idClient` nem CNPJ, em nenhuma versão. Mesma lacuna já conhecida da admissão |
| Sem catálogo de webhooks na API | `GET /v3/webhooks` e `/v1/Webhook/List` → 404. Webhook se configura no painel do Pandapé, não por API |
| `Match` não leva ao `PreCollaborator` | O match não expõe `idPreCollaborator`. Relevante para a admissão; **irrelevante para a Central de Candidatos**, que vive antes disso |

---

## 6. O que o Rike precisa destravar

**Nada técnico. Uma coisa política e duas de negócio.**

| # | O que | Por quê |
|---|---|---|
| 1 | **Aval do time de Operações do Pandapé** para usar `GET /v2/matches` em produção | Pedido do próprio Pandapé, registrado em 01/07/2026: qualquer endpoint novo deve ser alinhado com eles antes de ir a produção. `GET /v2/matches` **nunca foi usado** pelo EA, então é endpoint novo. É o mesmo caminho que destravou o webhook com o André |
| 2 | **De/para das etapas do funil** | As pastas têm nome livre por vaga. Alguém da operação precisa dizer quais nomes a Soulan usa e o que cada um significa no funil do EA |
| 3 | **Autorização para um spike de leitura** (opcional, mas recomendado) | Fecha as três lacunas da §7 em uma sessão. Só leitura, sem gravar nada no Pandapé, sem persistir PII |

**Credencial: não é pendência.** Já está configurada e funcionando.

---

## 7. As lacunas, nomeadas

### 7.1 O inventário de campos do perfil completo

Sabe-se que `GET /v2/matches/{idMatch}` traz experiências, formação, idiomas, skills e pretensão
salarial. **Não se sabe o nome exato de cada campo nem o formato de cada lista.** Sem isso, o desenho
da tela de ficha do candidato fica com "aqui vai a formação" em vez do campo real.

**Como fecha:** uma leitura do swagger v2 público (28 KB do v3, 261 KB do v2), sem credencial e sem
dado real, ou uma chamada autorizada com um `idMatch` real.

### 7.2 O campo de ORIGEM do candidato

O Rike pediu "origem" explicitamente. **Nenhum campo de origem apareceu nos levantamentos.** É
plausível que exista no perfil completo (§7.1) e tenha passado batido, porque as investigações
anteriores miravam descoberta e vaga, não perfil.

**Se não existir na API, a origem nasce no EA**, e isso é aceitável: o EA já sabe distinguir "veio do
Pandapé" de "foi cadastrado à mão" pelo próprio caminho de entrada.

### 7.3 O currículo como arquivo

Não há evidência de endpoint que devolva o **PDF do currículo**. Os documentos que a API entrega são
os do **pré-colaborador**, que são documentos de admissão (RG, CPF, comprovante), não currículo.

Se o time precisa do currículo em arquivo dentro do EA, isto é uma pergunta para o Pandapé, não uma
resposta que a investigação tenha.

### 7.4 A ponte vaga do EA ↔ vaga do Pandapé NÃO EXISTE

**Este é o achado mais importante para a construção, e ele não estava mapeado.**

A Central de Vagas guarda `vagas.codigo`, descrito no schema como "o número do Pandapé, ou a família
`SL...`". Mas os códigos reais da base são **522020, 700123, 800321, SL0042**, e os identificadores
de vaga do Pandapé observados ao vivo são **847, 850, 61814**. São numerações diferentes, de ordens de
grandeza diferentes. O documento de importação da base **não menciona o Pandapé uma única vez**.

Ou seja: **hoje o EA não sabe qual vaga da Central de Vagas corresponde a qual vaga do Pandapé.**

Consequência direta e cara: sem essa ponte, a varredura **não pode ser escopada pelas 198 vagas
abertas do EA** e cai de volta nas 907 do Pandapé, que é o cenário que não cabe no teto (§5.2).

**Três saídas possíveis, para o Rike escolher:**

| Opção | O que é | Custo |
|---|---|---|
| **a** | Guardar o `idVacancy` do Pandapé na vaga do EA, preenchido **na abertura** da vaga | Uma coluna nova e um campo na trilha. Só vale para vaga nova, não resolve as 2.363 importadas |
| **b** | Casar por **cargo mais cliente mais data**, heurística | Barato e **inventa dado**. Não recomendo, é o erro que a §A.9 proíbe |
| **c** | Varrer as 907 ativas do Pandapé **uma vez por dia**, fora do horário de pico da folha | Não exige ponte nenhuma. Perde tempo real, ganha simplicidade |

**Recomendo a mais c no começo e a mais a em seguida:** começar por c destrava a frente sem depender
de nada, e a partir do dia em que a vaga nova nascer com o `idVacancy` do Pandapé, a varredura vai
ficando mais barata sozinha, vaga por vaga.

---

## 8. O caminho técnico da ponte (desenho, nada construído)

### 8.1 O que já existe e será reusado, sem reescrever

| Peça | Onde | Estado |
|---|---|---|
| Cliente OAuth com cache e renovação de token | `pandape-api.service.ts` | Pronto, em produção |
| Inércia sem credencial (nasce desligado) | idem | Pronto |
| Fila BullMQ com limitador sob o teto e backoff | `pandape-queue.service.ts` | Pronto |
| Estado de scheduler por ciclo | `pandape_scheduler_estado` | Pronto, mesmo padrão |
| Trilha de idempotência por id externo | `integracao_pandape` | Padrão a copiar |

**A ponte de candidatos não inaugura infraestrutura.** Ela acrescenta um método de leitura e um
serviço de varredura em cima do que já roda.

### 8.2 O desenho, em cinco passos

```
1. TICK        cron dispara o ciclo (frequência a decidir, §5.2)
2. ESCOPO      resolve QUAIS vagas varrer nesse ciclo
                 hoje: as ativas do Pandapé (VacancyStatus=2)
                 depois: só as ABERTAS da Central de Vagas com idVacancy conhecido
3. ETAPAS      GET /v2/vacancy-folders?idVacancy=  → nomes das pastas do funil
                 resolvidos pelo de/para de etapa (§6, item 2)
4. CANDIDATOS  GET /v2/matches?IdVacancy=&Page=&PageSize=  → páginas
                 delta no cliente: descarta quem tem modifyDate <= último ciclo daquela vaga
5. ENFILEIRA   cada match novo ou alterado vira um job
                 o worker grava candidato + vínculo com a vaga, idempotente por idMatch
```

### 8.3 As cinco regras que a ponte nasce obedecendo

1. **Idempotente por `idMatch`.** Rodar o ciclo duas vezes sobre a mesma vaga não duplica candidato.
   Mesma garantia que `integracao_pandape` já dá para a admissão.
2. **Inerte sem credencial.** Sem `PANDAPE_CLIENT_ID`, o serviço existe e não toca a rede.
3. **Cota própria abaixo do teto.** O limitador da fila reserva uma fatia, e a folha continua
   passando na frente. Estourar o teto é incidente de segurança, não lentidão.
4. **§A.6 desde a primeira linha.** CPF nunca em log, nunca na URL, nunca em mensagem de erro.
   O log registra `idMatch` e `idVacancy`, que são identificadores técnicos, não pessoas.
5. **Nunca inventa cliente nem cargo.** Candidato de vaga não resolvida entra marcado para
   vínculo manual, exatamente como a vaga sem cliente faz hoje. É a mesma regra da §A.9.

### 8.4 O que a ponte NÃO faz, de propósito

- **Não escreve no Pandapé.** A v2 permite criar candidato e mover etapa. Fora de escopo: a
  movimentação de etapa continua sendo clique humano no Pandapé, como já é na admissão.
- **Não substitui o webhook da admissão.** São coisas diferentes: o webhook entrega quem já foi
  enviado para admissão, a ponte de candidatos varre quem ainda está em seleção. Convivem.
- **Não puxa documento.** Documento é assunto da esteira admissional, e já tem dono.

---

## 9. Veredito

**Dá para puxar candidato do Pandapé por API, e o ganho operacional é real.** O endpoint existe,
está provado ao vivo com 253 candidatos numa vaga, entrega CPF, contato e etapa, e a credencial já
está configurada.

**As três coisas que decidem o tamanho do ganho, e nenhuma delas é código:**

1. O aval do Pandapé Operações (§6.1).
2. O de/para das etapas do funil (§6.2).
3. A ponte vaga do EA ↔ vaga do Pandapé (§7.4), que **não existe e ninguém tinha notado**.

Sem a 3, a frente ainda anda, com varredura diária em vez de tempo real. Com a 3, vira quase
instantânea e custa um quinto das requisições.

---

*Documento de investigação para validação do diretor. Nenhuma requisição disparada nesta sessão,
nenhuma credencial usada, nenhum dado pessoal acessado. Nenhuma linha de código alterada.*
