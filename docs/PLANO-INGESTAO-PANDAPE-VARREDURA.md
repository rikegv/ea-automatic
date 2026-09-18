# Plano De Ingestão Do Pandapé Por Varredura

**Projeto:** EA AUTOMATIC · **Data:** 18/09/2026 · **Autor:** agente `arquiteto`
**Tipo:** investigação MEDIDA contra a API real + PLANO (§A.27, §A.39). **Nada foi construído.**
§A.11 (sem travessão), §A.24 (title case em título e etiqueta), §A.6 (zero dado pessoal aqui).

> **Protocolo de medição.** Cerca de **1.400 chamadas GET**, todas contra `api.pandape.com.br`, com a
> credencial OAuth2 que já vive em `apps/backend/.env`. **Nenhum POST, nenhum PATCH, nenhum PUT**: o
> `POST /v1/Match/UpdateFolder` e o `PATCH /v2/matches/{id}/update`, que ESCREVEM no funil do
> Pandapé, não foram tocados. Nenhum valor de campo pessoal foi impresso, gravado ou transportado:
> o que consta abaixo é contagem, presença e formato. Os arquivos temporários da medição foram
> expurgados ao fim.

---

## 1. O Número Que O Diretor Pediu, Primeiro

| Medida | Valor medido |
|---|---:|
| Vagas ATIVAS (`VacancyStatus=2`) | **621** às 13:28, **587** às 14:22 |
| Vagas no total da conta (todos os status) | **7.222** |
| Vagas ativas COM ao menos uma inscrição | **619** de 621 |
| **Inscrições vivas nas vagas ativas** | **137.654** |
| Maior vaga | **5.451** inscrições |
| Mediana por vaga | **85** inscrições |
| `PageSize` máximo aceito | **1.000** (2.000 devolve HTTP 400) |
| Páginas de um ciclo COMPLETO, `PageSize=1000` | **659** |
| Páginas de um ciclo COMPLETO, `PageSize=500` | **739** |
| Páginas de um ciclo COMPLETO, `PageSize=200` | **1.086** |
| **Custo total de um ciclo COMPLETO** | **660 requisições** (1 lista + 659 páginas), com `PageSize=1000` |
| **Custo total de um ciclo INCREMENTAL** | **622 requisições** (1 lista + 621 primeiras páginas) |
| Erros na varredura de 621 vagas | **0**, a 64 req/min sustentados |

**O CONJUNTO DE VAGAS ATIVAS É VIVO, e isso é medição, não ruído.** A mesma chamada devolveu 621 às
13:28 e 587 às 14:22 do mesmo dia. Toda conta abaixo usa **621**, que é o número maior e portanto o
conservador.

### 1.1 A Pergunta Que Decidia O Custo: SIM, A ETAPA VEM NO ITEM

`GET /v2/matches?IdVacancy=` devolve **`idVacancyFolder` dentro de cada inscrição**. Medido, não
suposto. Consequências diretas:

- o ciclo é **`1 + (1 por vaga)` mais paginação**, e NÃO `1 por (vaga x etapa)`;
- a alternativa por etapa custaria **621 x 11 = 6.831 requisições**, ou seja **10,4 vezes mais**;
- `GET /v2/vacancy-folders?idVacancy=` deixa de ser custo de ciclo e vira **tradução cacheável**:
  ele só é necessário para converter o `idVacancyFolder` (número) no NOME da pasta.

**ATENÇÃO, E ISTO É UM ACHADO QUE MUDA O DESENHO: o `idVacancyFolder` NÃO É COMPARTILHADO ENTRE
VAGAS.** Duas vagas quaisquer têm zero ids de pasta em comum (medido em amostra de 6 vagas, 0
sobreposição). Logo o `vacancy-folders` é **uma chamada por vaga, uma vez**, e o resultado é cache
de vida longa por `idVacancy`. São 621 chamadas de 0,38s no primeiro ciclo, e zero nos seguintes.

### 1.2 Latência Medida, Que É O Gargalo Real (E Não O Rate Limit)

| Chamada | Mediana | Máximo |
|---|---:|---:|
| `/v2/vacancies?PageSize=1000` (as 621 vagas de uma vez) | 2,15s | |
| `/v2/matches` `PageSize=200` | **1,45s** | 2,14s |
| `/v2/matches` `PageSize=500` | 2,37s | 2,92s |
| `/v2/matches` `PageSize=1000` | 3,44s | 8,00s |
| `/v2/vacancy-folders` | 0,38s | |

**`PageSize=200` é o melhor ponto, e o motivo é contraintuitivo.** Ele gasta mais requisições (1.086
contra 659) e mesmo assim termina ANTES: 1.086 x 1,45s = **26 min**, contra 659 x 3,44s = **38 min**
com `PageSize=1000`. Com concorrência 1, a vazão efetiva do `PageSize=200` é **~41 req/min**, que é
**20% do teto** de 200/min. O gargalo da varredura é a LATÊNCIA, não a cota.

---

## 2. A Divergência Do Rate Limit, Resolvida Com Evidência

**O 120 por minuto é do DIGAI, não do Pandapé.** Ele está escrito, com essas palavras, em
`docs/PLATAFORMA-UNIFICADORA-DECISOES.md` (linhas 401 e 464 a 482): a documentação do Digai diz 500
por minuto, o fornecedor disse 120, e o diretor adotou o menor. Nada ali fala do Pandapé.

**A API do Pandapé NÃO declara o teto dela.** Varredura dos cabeçalhos de resposta em
`/v2/vacancies`, `/v2/matches` e `/v2/vacancy-folders`: os únicos cabeçalhos devolvidos são
`Connection`, `Content-Type`, `Date`, `Request-Context`, `Strict-Transport-Security`,
`Transfer-Encoding`, `Vary` e `api-supported-versions`. **Zero `x-rate-limit`, zero
`x-ratelimit-remaining`, zero `retry-after`, zero `x-rate-limit-reset`.** A Clicksign diz o teto dela
em toda resposta; o Pandapé não diz em nenhuma.

**Portanto vale o teto documentado: 1.000 requisições por 5 minutos, compartilhado (§A.5), ou seja
200 por minuto.** O headroom que o código já pratica (800/5min, `pandape.queue.ts:107`, 160/min)
continua sendo a régua de operação. O número 120 **não entra** no dimensionamento do Pandapé.

**Prova de que o teto não foi tocado na medição:** 622 chamadas em 583 segundos (64 req/min
sustentados) e 621 chamadas em 531 segundos (70 req/min), **zero HTTP 429 e zero erro** nas duas.

---

## 3. O Desenho Do Ciclo De Varredura

### 3.1 O Que Se Lê, Em Que Ordem

1. **`GET /v2/vacancies?VacancyStatus=2&Page=1&PageSize=1000`**, UMA chamada, 2,15s. Devolve as ~600
   vagas ativas inteiras, sem paginação. É a fronteira do ciclo: **só vaga ativa é varrida**.
2. **Para cada vaga DESCONHECIDA**, `GET /v2/vacancy-folders?idVacancy=`, uma vez, e o par
   `idVacancyFolder` para nome é **cacheado**. Vaga já conhecida não paga esta chamada.
3. **Para cada vaga**, `GET /v2/matches?IdVacancy=&Page=N&PageSize=200`, parando cedo pela regra do
   item 5 abaixo.
4. **Nada mais.** `/v2/matches/{idMatch}` não é chamado: o item da lista já traz tudo o que a
   plataforma consome, e mais do que ela deve consumir (ver a seção 7).

### 3.2 A Forma: VARREDURA ROLANTE, Não Ciclo Em Rajada

**O ciclo não deve ser um job que dispara 660 requisições de uma vez.** Ele é uma fila que caminha:
um tick curto enfileira um lote de vagas, o worker avança no ritmo do limiter, e o "ciclo" é o tempo
que a roda leva para dar uma volta nas 621 vagas. Três razões medidas:

- a volta inteira leva **26 minutos** de relógio com concorrência 1, então rajada e cadência seriam a
  mesma coisa com nome diferente, e a rajada ainda por cima daria um pico;
- o pico é o que ameaça o webhook do G.Infor que alimenta a folha (§A.5), e a roda não tem pico;
- retomar de onde parou é trivial quando o estado é "qual foi a última vaga varrida".

### 3.3 O Balde Compartilhado, E Como A Varredura Não Sufoca Os Outros Dois

Três consumidores dividem o teto de 1.000/5min:

| Consumidor | Custo MEDIDO | Cadência |
|---|---:|---|
| Scheduler admissional (`scheduler-tick`) | **78 req** por ciclo (78 admissões vivas de origem Pandapé, medidas no banco de produção) | 12 min, ou **6,5 req/min** |
| Webhook + enriquecimento (`sync-candidate`, `pull-docs`) | picos pequenos, por evento | sob demanda |
| **Varredura nova** | 622 a 660 req por volta | rolante |

**O risco real, e ele é de desenho do BullMQ:** o limiter é **por fila**. Duas filas com limiter
próprio somam os dois tetos, e `800/5min` mais um limiter novo estouraria o teto de terceiro sem
nada falhar do nosso lado. O reparo é aritmético e cabe em duas linhas de configuração:

- **`pandape-sync` (a fila existente): baixar o limiter de `800/5min` para `500/5min`** (100/min). Ela
  usa 6,5 req/min hoje, então o corte não tira nada de ninguém, e continua tendo 15 vezes o consumo
  medido de folga para os picos do webhook.
- **`pandape-varredura` (fila nova, isolada, prefixo próprio): limiter `250/5min`** (50/min),
  concorrência 1.
- **Soma: 750/5min = 150 req/min**, abaixo do headroom de 800/5min que a casa já pratica e a 75% do
  teto de 1.000/5min. A varredura, medida, fica em ~41 req/min, ou seja **dentro do próprio limiter
  dela por latência, antes de o limiter precisar agir**.

### 3.4 O Intervalo, E Quanto A Conta Pode Crescer

Com orçamento de **50 req/min** para a varredura:

| Cenário | Custo | Tempo de uma volta | Intervalo recomendado |
|---|---:|---:|---|
| Volta COMPLETA (toda página de toda vaga) | 1.087 req | **26 min** | **30 min** |
| Volta INCREMENTAL (só a primeira página) | 622 req | **15 min** | **20 min** |

**O número mais agressivo que ainda é seguro: uma volta completa a cada 30 minutos.** O que o torna
seguro, item por item:

1. **41 req/min medidos contra 200 req/min de teto**: a varredura ocupa **20%** da cota, e o pior
   caso (o limiter em 50/min) ocupa 25%;
2. **nunca há duas voltas ao mesmo tempo**: a volta leva 26 min e o intervalo é 30, e a roda é
   sequencial por construção (concorrência 1);
3. **não há pico**: o consumo é plano, que é o que protege o webhook da folha;
4. **zero 429 medido** em 1.243 chamadas de varredura reais, a uma taxa 60% maior do que a de regime.

**Crescimento suportado.** Uma volta completa custa **1,75 páginas por vaga ativa** (1.087/621). Com
orçamento de 50 req/min e intervalo de 30 min, o teto é 1.500 requisições por volta:

- **aguenta até ~857 vagas ativas** no intervalo de 30 min, isto é, **+38%** sobre as 621 de hoje;
- **aguenta até ~1.714 vagas ativas** se o intervalo for para 60 min;
- se só a volta incremental rodar (1,0 página por vaga), **aguenta ~1.480 vagas** em 30 min.

**O gatilho de revisão é o número de VAGAS ATIVAS, não o de candidatos**, e isso é o que a medição
mostra: 137.654 inscrições custam o mesmo que 621, porque o preço é por página e a maioria das vagas
cabe em uma. Quem dobra o custo é abrir vaga, não receber currículo.

---

## 4. O Mapeamento Da Vaga Do Pandapé Para `vagas`

### 4.1 O Estado De Partida

`vagas` está **VAZIA em produção** (0 linhas, medido), e `id_vacancy_pandape` tem **0 linhas
preenchidas**. A ponte nasce em terreno limpo, sem passivo a reconciliar.

### 4.2 O De/Para De Campo

| Campo do EA | Origem no Pandapé | Estado medido |
|---|---|---|
| `id_vacancy_pandape` | `idVacancy` | a CHAVE da espelhagem. Índice comum, não unique |
| `codigo` | `reference` | **100% preenchido**, 558 valores distintos em 587 vagas, 7 dígitos em 557 delas |
| `nome_divulgacao` | `job` | 100% preenchido, 400 valores distintos |
| `cidade_id` | `city` | 98% preenchido, formato "Cidade - UF", 94 distintos, casar contra `as_cidades` |
| `posicoes_oficiais` | `numberVacancies` | 100% preenchido |
| `cargo_id` | `job`, via de/para | **PENDENTE (§A.9)**, nulável |
| `cod_cliente` | **não há fonte** | **PENDENTE (§A.9)**, nulável |

**O CLIENTE NÃO VEM DA API, E ISSO FOI MEDIDO, NÃO DEDUZIDO.** `GET /v2/clients/requests?idVacancy=`
respondeu **HTTP 200 com ZERO itens em 5 de 5 vagas ativas**. E `idCompanyExternal`, que parecia
promissor, tem **um único valor distinto nas 587 vagas**: ele é o id da Soulan, não o do cliente
final. **Não existe caminho de API para o cliente da vaga.** O de/para continua sendo insumo do
diretor.

### 4.3 O Que Acontece Com A Vaga Cujo Cliente Não Resolve

**A vaga ENTRA, com `cod_cliente` NULO, marcada para vínculo manual.** Isto não contradiz a régua de
"adiar em vez de inventar `cod_cliente`" (§A.5), **ela é a mesma régua em outra tabela**, e a
diferença é estrutural, não de opinião:

- na **Admissão**, `admissoes.cod_cliente` é **obrigatório**, então não há linha possível sem
  cliente, e adiar é o único caminho honesto;
- em **`vagas`**, `cod_cliente` e `cargo_id` são **NULÁVEIS DE PROPÓSITO**, e o comentário da coluna
  no schema diz por quê, com o número: só 31 de 164 clientes casaram com o cadastro do EA. A decisão
  registrada é "vaga sem cliente resolvido ENTRA, marcada para vínculo manual, em vez de travar a
  importação ou de inventar um `cod_cliente`".

**Inventar `cod_cliente` continua PROIBIDO.** O que muda é que, aqui, não inventar não custa adiar.

### 4.4 Com Que Status A Vaga Espelhada Nasce

`vagas.status` é NOT NULL, **sem default**, com FK RESTRICT para `as_vaga_status`. O catálogo de
produção tem seis linhas: `RASCUNHO` (papel RASCUNHO, `da_trilha`), `ABERTA` (papel ABERTURA,
`da_trilha`, `movivel_manualmente`), `ENTREGUE`, `FECHADA`, `CANCELADA` (as três `encerra`) e
`VAGA_BANCO` (LIVRE, inativa).

**A recomendação técnica é `RASCUNHO`**, e o argumento é de alcance, não de gosto:

- a vaga espelhada nasce **sem `cod_cliente`, sem `cargo_id` e sem linha de serviço**, ou seja
  reprovada pela régua `vagaPendencias` do próprio domínio. Nascer `ABERTA` a publicaria incompleta
  na Central de Vagas, e o número de vagas abertas da tela passaria a misturar o que o time abriu com
  o que o ATS espelhou;
- `RASCUNHO` tem `recebe_candidato = true`, então **a candidatura entra na vaga espelhada sem
  destravar nada**: o espelho funciona desde o primeiro ciclo;
- `RASCUNHO` tem `da_trilha = true`, então promover para `ABERTA` depois, quando o vínculo manual
  resolver o cliente, é um movimento que a trilha já aceita.

**A escolha entre `RASCUNHO` e `ABERTA` é do diretor** (item 1 da seção 9): ela decide o que a
Central de Vagas passa a contar no dia em que a ponte ligar.

**E fica o alerta de alcance (§A.27):** hoje `vagas` tem zero linhas, então a Central de Vagas está
vazia. Ligada a ponte, ela ganha ~600 linhas de uma vez, e toda contagem, KPI e filtro daquela tela
passa a enxergá-las. Nenhuma tela quebra, mas todas mudam de número.

---

## 5. O Mapeamento Do Candidato

### 5.1 A Chave, E Ela Não É O CPF

`GET /v2/matches` devolve **`idCandidate`** (a PESSOA) e **`idMatch`** (a INSCRIÇÃO da pessoa naquela
vaga). São coisas diferentes, e confundi-las duplica gente.

| Tabela | O que recebe | Chave de idempotência |
|---|---|---|
| `as_identidades_externas` | uma linha com `fonte='PANDAPE'`, `identificador = idCandidate`, `coletado_em` = instante REAL da coleta | `unique (fonte, identificador)`, que o banco já tem |
| `as_candidatos` | a pessoa, **projetada** (seção 7) | resolvida pela identidade acima; CPF é desempate secundário |
| `as_candidaturas` | a ligação pessoa x vaga espelhada | `uq_as_candidaturas_viva (candidato_id, vaga_id)` sobre as situações vivas |

**A ordem do dedup, e ela é fail-closed:**

1. **existe identidade `(PANDAPE, idCandidate)`?** Se sim, é esta pessoa. Fim.
2. **não existe, e veio CPF?** Procurar `as_candidatos.cpf` (unique parcial). Achou, **anexa a
   identidade nova à pessoa existente**; não achou, cria pessoa e identidade na mesma transação.
3. **não existe e não veio CPF?** Cria pessoa e identidade. **Nunca casar por nome**, e o veto já
   está registrado no schema: nome é chave fraca.
4. **conflito** (o `idCandidate` aponta para uma pessoa e o CPF para outra): **não fundir, não
   escolher**. Registrar para revisão humana. Fusão automática de duas pessoas é irreversível.

**O `idMatch` NÃO TEM ONDE MORAR, e recomendo que continue assim.** A coluna
`as_candidaturas.id_match_pandape` foi derrubada na migration 0112 de propósito. Guardá-lo em
`as_identidades_externas` com `fonte='PANDAPE'` seria um erro concreto e não teórico: o
`unique (fonte, identificador)` é global dentro da fonte, e os dois são numéricos (a ordem medida é
`idCandidate` na casa dos milhões e `idMatch` na das centenas de milhões), então um dia um id de
inscrição colide com um id de pessoa e o banco recusa uma escrita legítima, ou pior, a leitura casa a
pessoa errada. **A idempotência da candidatura é `(candidato_id, vaga_id)`**, que o banco já garante.

### 5.2 A Etapa, Traduzida Pelo De/Para Que Já Está Semeado

O caminho tem três saltos: `idVacancyFolder` (do item da inscrição) para **nome da pasta** (do
`vacancy-folders` cacheado) para **chave normalizada** (`normalizarChaveExterna`) para linha de
`as_depara_etapa_externa`. A tabela tem **10 linhas semeadas**, e o funil do EA tem **6 etapas**
(`CAPTACAO`, `TRIAGEM`, `ENTREVISTA_SOULAN`, `ENTREVISTA_CLIENTE`, `APROVACAO`, `STAND_BY`).

**E AQUI ESTÁ O ACHADO MAIS CARO DESTE PLANO, medido nas 621 vagas ativas:**

| Medida | Valor |
|---|---:|
| Nomes de pasta CRUS distintos | **38** |
| Chaves NORMALIZADAS distintas | **25** |
| Chaves cobertas pelo de/para semeado | **10** |
| **Chaves SEM de/para** | **15** |
| Pastas cobertas, por ocorrência | 4.929 de 5.992, **82,3%** |
| **Inscrições em pasta SEM de/para** (amostra de 40 vagas, 5.021 inscrições) | **35,0%** |

As quatro lacunas que importam:

| Chave sem de/para | Em quantas vagas | Peso na amostra de inscrições |
|---|---:|---:|
| `entrevista inteligente` | 325 | **29,5%** |
| `retorno negativo etapa soulan` | 401 | 0% na amostra |
| `pre selecionado` (singular) | 136 | **5,5%** |
| `finalistas` | 174 | 0,0% |

As outras onze (`triagem`, `triado`, `testes`, `enviados para cliente`, `entrevista`, `admissao`,
`etapa inteligente`, `entrevistas soulan`, `entrevista cliente`, `encaminhados cliente`,
`abordados`) aparecem em 1 ou 2 vagas cada.

**O que isso significa na prática:** o resolvedor é **fail-closed** (`NAO_MAPEADA` quando não há
linha), então **35% das inscrições entrariam sem etapa resolvida**. E `as_candidaturas.etapa` é NOT
NULL com FK RESTRICT. As duas saídas possíveis:

- **(a)** a candidatura nasce na etapa INICIAL (`CAPTACAO`, a linha marcada `inicial`) e fica marcada
  como "etapa externa não mapeada", visível para o diretor mapear depois; ou
- **(b)** a inscrição de pasta não mapeada **não é ingerida** neste ciclo, e entra assim que o de/para
  ganhar a linha.

**Recomendo (b), e é a direção fail-closed da casa.** A (a) escreve no histórico de uma pessoa um
movimento que ninguém fez, que é exatamente o que o comentário de `lerLinhaDePara` proíbe, e depois
não há como distinguir quem estava mesmo na Captação de quem foi parar lá por falta de tradução.
**A escolha é do diretor** (item 2 da seção 9), e o número que ela decide é 35% da entrada.

### 5.3 As Pastas Que Não São Etapa

Duas pastas semeadas não mexem na etapa, mexem no DESFECHO, e o de/para já sabe disso:
`Contratados` grava situação `ENVIADO_PARA_ADMISSAO` na etapa `APROVACAO`, e `Descartados` e
`RETORNO NEGATIVO` gravam `DESCARTADO` com motivos padrão distintos. Medido: **10% das inscrições da
amostra estão em pasta de descarte**, ou seja o ciclo importa histórico encerrado junto, o que é
correto e precisa estar declarado antes de alguém estranhar o número.

---

## 6. "Só Os Novos": Como O Ciclo Distingue Novo De Passivo Antigo

**A API não tem filtro temporal.** Confirmado na spec e medido: os parâmetros de `/v2/matches` são
`IdVacancy`, `IdVacancyFolder`, `Page` e `PageSize`, e nada mais. O delta é sempre do nosso lado.

**MAS A LISTA VEM ORDENADA POR `insertDate` DESCENDENTE, E ISSO FOI MEDIDO.** Na vaga de 5.451
inscrições: a página 1 é monotonicamente decrescente por `insertDate`, o primeiro item é de 2026-08
e o último da página é de 2026-05, e a última página (28 de 28) está inteira em 2026-02. A página 2
não repete um único `idMatch` da página 1 (sobreposição zero, medida).

**A regra do corte, então:**

1. o ciclo guarda, POR VAGA, o **maior `insertDate` já ingerido** (marca de água);
2. lê a página 1 e para de paginar **assim que o `insertDate` do item ficar menor ou igual à marca**;
3. em regime, isso é **1 página por vaga**, porque a mediana da vaga é 85 inscrições e a página é de
   200: a vaga mediana INTEIRA cabe na primeira página.

**E AQUI ESTÁ A RESSALVA QUE NÃO PODE SER ESQUECIDA, porque ela é a diferença entre duas perguntas
que parecem uma:**

- **"quem se inscreveu?"** é respondida pelo corte acima, barato, 622 requisições;
- **"quem MUDOU DE ETAPA?"** NÃO é. Mover alguém de pasta **não altera o `insertDate`**, e a lista
  **não vem ordenada por `modifyDate`** (medido: "sem ordem" na mesma página em que `insertDate` é
  perfeitamente decrescente). Para detectar movimentação é preciso **ler todas as páginas** e comparar
  com o estado anterior do nosso lado.

**A boa notícia é a aritmética:** a volta completa custa **660 requisições** e a incremental **622**.
São **38 requisições de diferença, 6%**. Não vale a pena manter dois modos: **a volta é sempre
COMPLETA**, e o "só os novos" vira uma otimização de ESCRITA, não de leitura. Isto é, lê-se tudo,
compara-se em memória e **só se escreve o que mudou**, que é exatamente o que a trava da seção 8 exige.

---

## 7. §A.6: O Payload É Muito Mais Pessoal Do Que A Plataforma Precisa

**Este é o achado de segurança do plano, e ele precisa passar pelo agente `seguranca` antes de uma
linha ser escrita.** `/v2/matches` não devolve um resumo: devolve o **currículo inteiro**, com 58
campos por inscrição. Presentes e preenchidos (verificado por presença e tamanho, nunca por valor):

`cpf` · `name` · `surname` · `email` · `phone` · `phone2` · `birthDate` · `cep` · `address` ·
`addressNumber` · `addressComplement` · `latitude` · `longitude` · `maritalStatus` · `children` ·
`nationality` · `summary` (474 caracteres de texto livre no item medido) · `experiences` (6 itens,
com empresa, cargo e salário) · `studies` · `languages` · `skills` · `salaryMin` · `salaryMax` ·
`licenses` · `vehicles` · `socialNetworks`.

**E QUATRO CAMPOS DE DADO PESSOAL SENSÍVEL (LGPD art. 11), que a plataforma NÃO deve tocar:**

`idRace` · `idSexualOrientation` · `idGenderIdentity` · `hasDeficiency` e `deficiencies`.

**A minimização tem de ser uma PROJEÇÃO EXPLÍCITA, e não "o que a gente não usa fica lá".** O gesto
natural de quem liga integração é salvar o objeto que veio, para não consultar de novo, e é assim que
orientação sexual de 137 mil pessoas entra numa base de recrutamento sem ninguém decidir isso. O
ingestor deve ler **apenas** estes campos e descartar o resto no mesmo escopo de memória:

| Campo lido | Destino |
|---|---|
| `idCandidate` | `as_identidades_externas.identificador` |
| `name` + `surname` | `as_candidatos.nome` |
| `cpf` | `as_candidatos.cpf`, chave técnica, nunca em log |
| `email`, `phone` | `as_candidatos.email`, `as_candidatos.telefone` |
| `birthDate` | `as_candidatos.data_nascimento` |
| `location3`, `location2` | `as_candidatos.cidade`, `as_candidatos.uf` |
| `idVacancy`, `idVacancyFolder` | resolução de vaga e etapa |
| `insertDate` | marca de água do corte, em memória |

**`summary`, `experiences` e `studies` ficam de fora**, e não só por minimização: eles são texto
livre, e o DIARIO de 18/09 já registra como TERCEIRO furo aberto que "texto livre sobrevive à
anonimização" (`as_contatos.resumo`, `as_candidaturas.motivo_descarte`). Despejar currículo em texto
livre dentro da base multiplicaria aquele furo por 137 mil.

**Mais três regras que já valem e que a ingestão herda:**

- **`as_candidatos.banco_talentos` é PROIBIDO ao ingestor.** O schema já diz: "a ingestão futura, que
  insere SEM usuário autor, nasce proibida de escrever aqui". O único escritor é
  `aplicarRetencao`, com cadeado de SUPER_ADMIN.
- **`as_depara_etapa_externa.rotulo_externo` e `motivo_padrao` são CONFIGURAÇÃO REVISADA.** O ciclo
  **não** pode criar linha de de/para sozinho copiando o nome que a API devolveu. As 15 chaves da
  seção 5.2 viram uma LISTA PARA O DIRETOR, nunca linhas automáticas.
- **Nada de PII em log.** O log do ciclo conta: vagas varridas, páginas lidas, pessoas criadas,
  candidaturas criadas, etapas não mapeadas. Nenhum id de candidato, nenhum CPF, nenhum nome.

---

## 8. A Trava Do DIARIO, E Ela É Obrigatória

O DIARIO de 18/09/2026, item 5 de "ABERTO", grava a exigência com estas palavras: *"o upsert de
reentrega que não muda nada NÃO escreve `as_candidatos.atualizado_em`, e o ingestor NÃO escreve
`criado_em` histórico. Sem isso, o furo 1 renasce pela porta do lado e o expurgo prematuro fica
possível."*

**Por que isso é sério, e é medido, não teórico.** O relógio do expurgo
(`retencao-candidatos.service.ts`) resolve a data de referência assim: quem tem candidatura conta do
`max(greatest(k.atualizado_em, ...))` das candidaturas; **quem não tem candidatura nenhuma cai no
`greatest(c.criado_em, c.atualizado_em)` do próprio candidato**. Logo:

- **escrever `criado_em` histórico** (a data em que a pessoa se inscreveu no Pandapé, que na amostra
  chega a 2026-02 e em vagas antigas é muito anterior) **faz a pessoa nascer com o prazo de 2 anos
  possivelmente JÁ VENCIDO**, e ela é anonimizada na varredura seguinte. Irreversível;
- **tocar `atualizado_em` em reentrega que não muda nada** faz o contrário, empurra o relógio para
  frente a cada ciclo e **a pessoa nunca expira**, que é o furo 1 reaberto pela porta do lado. Com
  uma volta a cada 30 minutos, isso são 48 renovações por dia por pessoa.

**Como o código garante, e não é disciplina de quem edita:**

1. **`criado_em` e `atualizado_em` NUNCA aparecem na lista de colunas do INSERT nem do UPDATE do
   ingestor.** As duas têm `default now()` e **não têm `$onUpdate`** (`db/schema/tables.ts:65-66`),
   então o Drizzle não as toca sozinho: basta não citá-las. O `insertDate` do Pandapé vai para a
   marca de água e para lugar nenhum mais.
2. **O upsert é CONDICIONAL, e a condição vive no SQL**, não em um `if` do TypeScript. O
   `on conflict do update` ganha um `where` que compara campo a campo, no formato
   `where (tabela.nome, tabela.email, ...) is distinct from (excluded.nome, excluded.email, ...)`.
   Reentrega idêntica vira **zero linhas afetadas**, e o gatilho de `atualizado_em`, se um dia
   existir, também não dispara. Um `if` em TypeScript resolveria o caso comum e perderia a corrida
   entre dois ciclos.
3. **`as_identidades_externas.coletado_em` é preenchido EXPLICITAMENTE** com o instante da coleta, e
   não pelo default. O schema já explica: deixar o default responder por uma carga faria a linha
   jurar que o dado foi coletado no dia em que a carga rodou.
4. **Um teste comportamental prova a trava, e ele é escrito ANTES do ingestor** (§A.40, o `tester`
   entra junto com a construção): ingerir o MESMO payload duas vezes, e assertar que
   `as_candidatos.atualizado_em` **não mudou** entre as duas, e que `criado_em` é posterior a
   `now() - 1 minuto`, nunca uma data do ATS.
5. **A mesma régua vale para um futuro "desalocar que apaga candidatura"**, e o DIARIO já avisa: ele
   moveria a pessoa para a queda das datas próprias, que pode já estar vencida.

---

## 9. Decisões Do Diretor, Separadas Das Decisões Técnicas

### 9.1 Do Diretor

1. **Com que status a vaga espelhada nasce**, `RASCUNHO` ou `ABERTA`. A recomendação técnica é
   `RASCUNHO` (seção 4.4); o que ele decide é o que a Central de Vagas passa a contar quando ~600
   linhas entrarem de uma vez.
2. **O que fazer com os 35% de inscrições em pasta sem de/para** (seção 5.2): não ingerir até a
   tradução existir, ou ingerir na etapa inicial com marca de "não mapeada".
3. **As 15 chaves de etapa sem de/para**, para mapear uma a uma. As quatro que decidem o volume são
   `entrevista inteligente` (325 vagas, 29,5% das inscrições), `retorno negativo etapa soulan` (401
   vagas), `pre selecionado` (136 vagas, 5,5%) e `finalistas` (174 vagas).
4. **O de/para de cliente e de cargo** (§A.9), que segue pendente e **não tem caminho de API**
   (medido na seção 4.2). Sem ele a vaga entra com `cod_cliente` nulo e vínculo manual.
5. **O intervalo**, entre os 30 minutos recomendados e um número mais folgado, sabendo que 30 usa 20%
   da cota e aguenta +38% de crescimento.
6. **Se a varredura escreve de volta no Pandapé**, que hoje é NÃO e deve continuar NÃO. O mapa de
   API registra que `PATCH /v2/matches/{id}/update` existe; esta frente é **GET apenas**.

### 9.2 Técnicas, Que A Fábrica Resolve

1. `PageSize=200`, medido como o mais rápido de relógio apesar de gastar mais requisições.
2. Fila BullMQ **isolada** (`pandape-varredura`, prefixo e db próprios), concorrência 1, limiter
   `250/5min`, e o rebaixamento de `pandape-sync` de `800/5min` para `500/5min`.
3. Varredura ROLANTE com estado de "última vaga varrida", em vez de rajada.
4. Cache de `vacancy-folders` por `idVacancy`, com invalidação só quando a vaga é vista pela primeira
   vez ou quando um `idVacancyFolder` desconhecido aparece.
5. Dedup por `(PANDAPE, idCandidate)`, CPF como desempate, **nome nunca**, conflito para revisão.
6. Idempotência da candidatura por `(candidato_id, vaga_id)`, sem ressuscitar `id_match_pandape`.
7. Projeção explícita dos 9 campos da seção 7, com os 4 campos sensíveis **nunca lidos**.
8. O upsert condicional da seção 8, com o teste que o prova.

---

## 10. O Que Este Plano NÃO Cobre, E Precisa De Outra Rodada

- **A tela.** Não há desenho de interface aqui: a frente é de ingestão. Quando houver tela, valem
  §A.12, §A.20, §A.29, §A.35 e a prova visual da §A.13.
- **A ponte com a Esteira.** `as_candidaturas.admissao_id` continua nula e sem FK. A pasta
  `Contratados` grava `ENVIADO_PARA_ADMISSAO` na candidatura e **não cria admissão**.
- **O Digai.** Segunda fonte de `FONTES_EXTERNAS`, com teto próprio (120/min) e desenho próprio.
- **A auditoria do `seguranca`.** A seção 7 é um achado, não um parecer. Pelas §A.38 e §A.40, este
  mapa passa pelo `seguranca` **antes do primeiro despacho de construção**, porque a frente toca CPF,
  dado pessoal e dado sensível.

---

# RESOLUÇÃO DOS VETOS DO `seguranca` (coordenador, §A.39 passo 4)

O `seguranca` auditou este plano ANTES de existir código e devolveu achado em nove dos dez pontos.
Conferi cada um. Nenhum foi carimbado. §A.11: sem travessão.

## O ACHADO 8, o mais caro, RESOLVIDO: quem encerra a vaga espelhada é a PRÓPRIA VARREDURA

**O achado procede e é estrutural.** A cláusula de proteção do expurgo
(`retencao-candidatos.service.ts:340`) é
`(s.encerra = false or s.papel = 'ENTREGA' or v.encerrada_em is null)`. Uma vaga espelhada que nunca
encerra tem `encerra = false` para sempre, então **toda pessoa viva dentro dela fica protegida do
expurgo para sempre**, sem nada falhar e sem tela nenhuma acusar. Com 137.654 inscrições, isso é o
furo 1 renascendo por uma terceira porta, sobre a população dominante.

**A RESOLUÇÃO: a varredura espelha o CICLO DE VIDA da vaga, não só o nascimento dela.**

A pergunta "quem encerra a vaga espelhada" tinha uma resposta que ninguém viu porque o plano só
olhou a criação: **o Pandapé encerra**. A varredura lê as vagas ATIVAS (`VacancyStatus=2`), e foi
medido que o conjunto é vivo (621 às 13:28, 587 às 14:22). A vaga que **sai** da lista de ativas
encerrou no ATS, e o espelho tem de acompanhar.

Medido no catálogo de produção (`as_vaga_status`):

| código | papel | encerra | recebe_candidato |
|---|---|---|---|
| RASCUNHO | RASCUNHO | false | true |
| ABERTA | ABERTURA | false | true |
| **FECHADA** | **FECHAMENTO** | **true** | false |
| ENTREGUE | ENTREGA | true | false |
| CANCELADA | CANCELAMENTO | true | false |

**A vaga espelhada que sai da lista de ativas vai para `FECHADA`, com `encerrada_em` carimbado pelo
relógio do SERVIDOR.** Isso destrava as três condições de uma vez: `encerra` vira true, o papel é
`FECHAMENTO` e **não** `ENTREGA` (então a exceção de quem foi contratado não se aplica), e
`encerrada_em` deixa de ser nulo.

**O que isso reusa, e é o motivo de eu preferir esta forma a qualquer régua nova:** o expurgo JÁ TEM
o ramo que trata exatamente este caso, com o relógio contado de `v.encerrada_em` em vez do
`k.atualizado_em` da candidatura, e com o `greatest` que impede que alguém nasça com o prazo já
vencido (`retencao-candidatos.service.ts:389-398`). Esse ramo foi escrito, auditado e testado na
frente anterior. A vaga espelhada passa a cair nele como qualquer outra vaga encerrada, em vez de
exigir um caminho paralelo.

**`encerrada_em` é carimbo de SERVIDOR, nunca data do Pandapé.** O arquivo do expurgo já recusou
`data_fechamento` como relógio pelo mesmo motivo: data vinda do corpo, sem piso, seria gatilho
remoto de exclusão irreversível.

**E a vaga que VOLTA a aparecer nas ativas** (o Pandapé reabre) volta a `ABERTA` com `encerrada_em`
nulo. Não é caso de borda: a medição viu o conjunto oscilar em uma hora.

## OS DEMAIS ACHADOS: TODOS ACEITOS, e viram requisito de construção

1. **A frase "os 4 campos sensíveis nunca lidos" é FALSA e sai do plano.** Eles são desserializados
   pelo cliente, e isso é tratamento. O descarte vale no método novo do `PandapeApiService`, cujo
   **tipo de retorno é a interface projetada**, montada **campo a campo por allowlist**, nunca por
   espalhamento com `delete`: espalhamento carrega campo novo que a API passe a devolver amanhã.
2. **O payload do job é `{ idVacancy, page }` e nada mais.** O achado é o mais fácil de virar
   incidente: `removeOnFail: 5000` deixa cinco mil payloads no Redis por tempo indeterminado, com
   `failedReason` e `stacktrace`, fora do alcance de um expurgo que só conhece Postgres e sem TTL.
   Página de inscrição nunca é enfileirada, nunca é `returnvalue`, e CPF nunca entra em `jobId`.
3. **`location3`/`location2` não estavam na lista de campos medidos.** Confirmar o nome real antes de
   gravar: errar e pegar `address` põe logradouro em `cidade`, que é coluna que o expurgo preserva
   de propósito.
4. **O conflito de dedup ganha tabela própria**, com `candidato_id`, `fonte` e `identificador`, e
   **sem o valor do CPF e sem o nome**, no molde de `as_retencao_eventos` (que não tem campo de
   observação livre, e a ausência é a defesa). E o erro do driver passa pelo funil `mensagemDoErro`,
   porque `detail` carrega o valor que violou a restrição.
5. **O ingestor escreve por repositório próprio, com `criado_por_id` NULO.** O "usuário de sistema"
   fica **VETADO**: seria buraco de RBAC e faria a trilha mentir. O `insert` é lista nominal de
   colunas, nunca espalhamento, que é o que mantém `banco_talentos` fora do alcance da ingestão.
6. **O ramo PRINCIPAL do relógio lê `as_candidaturas`, não `as_candidatos`**, e a seção 8 mirou a
   tabela errada. `as_candidaturas.atualizado_em` é escrito explicitamente em todo caminho de
   mutação da casa, então o "basta não citar" não vale ali: a escrita da candidatura é
   **condicional de verdade**, e 48 voltas por dia não podem empurrar o relógio de ninguém.
   **E entra a guarda `anonimizado_em is null` no UPDATE do ingestor**, com conferência de linhas
   afetadas, senão o desempate por CPF re-identifica de 30 em 30 minutos quem o expurgo acabou de
   anonimizar.
7. **`as_candidatos.origem` recebe `PANDAPE`.** Faltava na projeção, e sem isso 137 mil linhas jurariam
   ter sido cadastradas à mão.
9. **Sem de/para, NADA é escrito:** nem candidato, nem identidade externa, nem candidatura. Ingerir a
   pessoa e segurar só a candidatura coletaria dado de cerca de 48 mil pessoas para uso nenhum.
10. **GET apenas, travado por TESTE DE TEXTO** sobre o fonte do cliente, no molde que a casa já usa
    para blindar o SQL do expurgo. Revisão de PR não pega um helper `post()` acrescentado daqui a
    seis meses; teste pega.

## O QUE VAI PARA O DIRETOR, e não para a fábrica

As decisões da seção 9.1 seguem dele. A fábrica adota por ora, e é reversível: vaga espelhada nasce
**`RASCUNHO`**, e inscrição sem de/para **não é ingerida**. As 15 chaves de etapa faltantes são
insumo dele, e sem elas 35% das inscrições ficam de fora por desenho, não por defeito.
