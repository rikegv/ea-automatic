# MAPA DE ALCANCE, INTEGRACAO DIGAI

Levantado pelo coordenador antes do primeiro despacho (secao A.39 passo 1, secao A.40 regra 1).
Vai junto em TODO briefing. O agente nasce sem o contexto do coordenador: este documento e o
contexto.

## O QUE JA EXISTE, E MUDA O ESCOPO

Medido na varredura de 16/09/2026 (86/86 workspaces, 301 screenings, 13.248 registros unicos, 451
chamadas, zero falhas) e na leitura do codigo em 17/09.

| Item da OST | Estado real | Consequencia |
|---|---|---|
| Campo de ORIGEM | `as_candidatos.origem` JA EXISTE, enum `PANDAPE/MANUAL/INDICACAO/BANCO_TALENTOS`, com indice | E APPEND do valor `DIGAI` ao enum, nao campo novo |
| Etapas do funil | `as_etapas_funil` JA E CATALOGO do diretor (migration 0100), com codigo imutavel, rotulo editavel, ordem, tom, `inicial` unica e `ativa` | Etapa nova e LINHA no catalogo, nunca valor de enum |
| Reengajar | O link de triagem (`webAccessLink`/`whatsappAccessLink`) e FIXO POR VAGA | Reengajar e REENVIAR o link do NOSSO lado. NAO precisa escrever no Digai |
| Elo com a vaga | `partnerJobId` e `numerico[7]` em 12.686 de 13.248, mesmo formato de `vagas.id_vacancy_pandape` | HIPOTESE a PROVAR contra a base, nunca a assumir |
| Acoes em massa | `AcoesEmMassaDaVaga.tsx` + rotas `candidaturas/lote/*` ja existem e tem teste | REUSAR, nao criar segundo padrao |
| Grade de acesso | `/home/henrique/digai-investigacao/grade_digai.py`, Bearer GET-only, autoteste de 26 bloqueios e 11 leituras | O desenho da grade ja foi auditado. A grade de producao e a versao TypeScript dele |

## O QUE A VARREDURA JA DECIDIU, E NAO SE REABRE

- **`partnerUserId` e ZERO em 13.248 registros e em ZERO workspaces.** Nao ha marcador de origem no
  Digai. A origem e NOSSA: a plataforma sabe de onde puxou. Nao se pergunta ao Digai, nao se escreve
  la.
- **O CPF ATUALIZA NO MESMO REGISTRO.** `userId` e chave estavel, a reconsulta por `userId`
  funciona. Sem CPF = nao finalizou; com CPF = finalizou. 12% tem CPF (1.656 de 13.248).
- **A VERSAO E POR ROTA, E NAO POR INTEGRACAO.** *(Correcao medida em 29/09, ver a secao final:
  a redacao anterior dizia "usar a v2", sem ressalva, e ela quebra a rota do par.)* A LISTAGEM de
  resultados e **v2** (`/api/v2/public/screenings/{id}/results`), porque a v1 de listagem nao tem
  `cpf`, `partnerUserId`, `stages` nem `appliedAt`. **A leitura do PAR (screening + `userId`) e
  `v1`**: a v2 daquela rota devolve **404**, e o registro unico da v1 traz `cpf`, `stages`,
  `appliedAt` e `partnerUserId`, que era exatamente o que faltava na listagem.
- **Host: `api-screening.digai.ai`.** `api.hiring.digai.ai` da doc tem certificado invalido (cert
  `CN=digai.ai`, SAN `*.digai.ai`, wildcard cobre UM rotulo). Mesmos IPs, mesmo cert, mesmo
  balanceador. Desativar verificacao de TLS esta VETADO.
- **Paginacao por `page`**, confirmada em 44 screenings.
- **WEBHOOK CONFIRMADO PELO FORNECEDOR (Ivan, 29/09/2026), e ele MUDA O CAMINHO.** O evento e
  **`NEW_APPLICATION`**, disparado quando o candidato FINALIZA a triagem, documentado em
  `digai.readme.io/reference/new-application`. **O polling deixa de ser o caminho:** a ingestao passa
  a nascer por evento, no mesmo molde do Pandape (receptor fail-closed, enfileira, responde 202, o
  worker enriquece). *(Antes esta linha dizia "Webhook NAO confirmado. O caminho hoje e POLLING".)*
- **Endpoints por e-mail, telefone e partner-user-id estao BARRADOS** na grade: poriam PII na URL, e
  o 401 do Digai ECOA o path.

## O QUE DEPENDE DO DIRETOR, E BLOQUEIA SO A EXECUCAO

- ~~**O TOKEN BEARER FOI EXPURGADO** (`shred`, 16/09).~~ **O token VOLTOU em 29/09/2026**, entregue
  pelo diretor, e foi usado UMA VEZ, somente para leitura, na sondagem de contrato registrada na
  secao final. **Ele nao esta no `.env` de nenhum ambiente e foi expurgado (`shred`) ao fim da
  sessao**, entao a integracao segue FECHADA E INERTE (mesmo padrao do Pandape, secao A.5): sem
  `DIGAI_API_TOKEN` nada sai para a rede, sem `DIGAI_INGESTAO_ATIVA` nada e escrito. Ligar e decisao
  do diretor.
- ~~**Deduplicacao Digai x Pandape: SEGURADA por ordem do diretor.**~~ **DESTRAVADA em 29/09/2026.**
  O Ivan confirmou que o **`userId` e UNICO E PERMANENTE, o MESMO em todas as triagens**, entao ele
  E a chave da dedup, e ela se constroi. *(A pergunta que segurava o ponto era exatamente esta, e foi
  respondida.)*

## QUEM DEPENDE DO QUE VAI SER MEXIDO (a pergunta da secao A.27)

**`as_candidatos.origem`** (append do valor `DIGAI` ao enum):
- Le: a Central de Candidatos (`as/candidatos`), o filtro de origem da tela, o indice
  `idx_as_candidatos_origem`.
- **Enum do Postgres e APPEND-ONLY, e valor novo nao pode ser usado na transacao em que nasce.** A
  migration do valor e SEPARADA de qualquer migration que o utilize.
- Todo lugar que faz `switch` por origem ganha o caso novo. Quem varrer tem de PROVAR a lista
  completa, nao estimar.

**`as_etapas_funil`** (etapas de triagem novas):
- Le: o funil da vaga (`VagaPainelModal`), o seletor de etapa, o filtro, o historico
  (`as_candidatura_etapas`), a rota de lote `candidaturas/lote/etapa`.
- **`inicial` e UNICA por indice parcial.** Etapa nova NAO pode nascer marcada inicial sem
  desmarcar a atual, e isso muda onde TODA candidatura nova nasce, inclusive as do Pandape e as
  manuais. Mexer em `inicial` esta FORA desta frente.
- FK RESTRICT nas tres colunas: etapa por onde alguem passou nao se apaga, so se inativa.

**`as_candidaturas`** (candidatos do Digai entrando no funil):
- **UNIQUE PARCIAL `(candidato_id, vaga_id)` sobre as situacoes VIVAS.** Importacao que reprocessa
  o mesmo par bate no unique. A idempotencia tem de ser explicita, nao acidental.
- A OCUPACAO da vaga e DERIVADA contando `APROVADO` + `ENVIADO_PARA_ADMISSAO`. Candidato de triagem
  entrando com situacao errada MEXE NA CONTAGEM DE POSICOES da vaga, que e o numero que decide se
  ainda cabe alguem. **Candidato de triagem nasce em situacao que NAO consome posicao.**

**A tela da vaga (`VagaPainelModal`)**: e codigo JA VALIDADO pelo diretor. Vale a secao A.26: o que
for tocado nela se pergunta antes.

## O QUE PODE QUEBRAR DE LADO

1. **Contagem de posicoes da vaga**, se a situacao de nascimento consumir posicao (acima).
2. **Filtro de origem da Central de Candidatos**, se o valor novo do enum nao entrar no catalogo do
   filtro: a tela oferece e a consulta ignora, que e pior que filtro nenhum (secao A.28).
3. **O expurgo por retencao** (`retencao-candidatos.service.ts`): candidato do Digai e candidato de
   selecao que pode nunca virar funcionario. Ele entra na mesma regra de retencao, e isso precisa
   ser conferido, nao presumido.
4. **A migration de enum em transacao unica**, pelo motivo do Postgres acima.
5. **O teto de requisicao do Digai**, se a importacao varrer sem limitador.

## A REGRA QUE VALE PARA TUDO NESTA FRENTE

`docs/PROTOCOLO-LGPD-FABRICA.md`. Producao de terceiro, CPF real. Zero PII em log, em pulso e em
commit. A grade e obrigatoria e fail-closed. O reengajar, por reenviar link do nosso lado, NAO abre
caminho de escrita no Digai, e essa e a razao de ele ser o caminho escolhido (protocolo, secao 6,
regra zero).


---

## O QUE O FORNECEDOR CONFIRMOU EM 29/09/2026 (Ivan), E O QUE ISSO FECHA

| pergunta que estava aberta | resposta do fornecedor | efeito |
|---|---|---|
| Existe evento de "candidato finalizou"? | **SIM, `NEW_APPLICATION`**, documentado | o caminho deixa de ser polling e passa a ser webhook |
| O `userId` e o mesmo entre triagens? | **SIM, unico e permanente** | a dedup DESTRAVA, e a chave e ele |
| O que e o `partnerJobId`? | **o id da vaga de origem no Pandape** | o elo com a vaga deixa de ser hipotese e vira desenho |
| Da para saber a ORIGEM (planilha ou Pandape) pela API? | **NAO**, so na interface web | **o diretor decidiu que nao precisa**: a dedup por `userId` resolve, porque quem ja veio do Pandape nao duplica e quem so existe no Digai entra |
| Qual o teto de requisicao? | **120 por minuto** (a doc diz 500) | **adota-se o MENOR, 120**, e o limiter da fila trabalha a 90, 75% do teto |

**A PENDENCIA QUE SOBRA COM O FORNECEDOR, e nao e urgente:** o host `api.hiring.digai.ai` da
documentacao esta com **certificado invalido** (cert `CN=digai.ai`, SAN `*.digai.ai`, e wildcard
cobre UM rotulo). O host que se usa e `api-screening.digai.ai`. **Avisar o Ivan um dia.** Desativar
verificacao de TLS continua VETADO.

---

## A SONDAGEM DE CONTRATO DE 29/09/2026, E ELA DERRUBOU TRES PREMISSAS

Com o token na mao, o coordenador sondou a **producao do Digai**, somente leitura, pela grade real
(`digai-grade.ts`) e pelo cliente real (`digai.cliente.ts`). Nenhum dado pessoal foi lido para fora
da memoria do processo: a sonda imprime **estrutura** (nome de campo, tipo, contagem), nunca valor.

**A LICAO, e ela vale alem do Digai:** havia **174 testes verdes** sobre um contrato **errado**. Os
fakes foram escritos a partir da documentacao, e a documentacao nao bate com a producao. Teste verde
sobre fake inventado nao prova integracao nenhuma.

**1. O ENVELOPE.** Toda resposta tem a forma `{ message: [...], data: { value: <conteudo> } }`.
Nunca array no topo, e `data` e OBJETO, nunca array.

| rota | `data.value` |
|---|---|
| `GET /api/v1/public/screenings?page=1` | `{ page, total, screenings: [...] }`, **522 numa pagina** |
| `GET /api/v2/public/screenings/{id}/results?page=1` | `{ page, total, candidates: [...] }`, a lista chama-se **`candidates`** |
| `GET /api/v1/public/screenings/{id}/users/{userId}/results` | **UM registro plano** |

**2. A ROTA DO PAR E `v1`.** No MESMO par, a v2 devolveu **404** e a v1 devolveu **200**.

**3. O CAMPO `name` NAO EXISTE.** O registro traz **`firstname`** e **`lastname`**, separados.

**Os 41 campos do registro real:** `accessibilityDeclaration, accessibilityRequest, appliedAt,
approvalStatus, attempt, attemptFeedback, attemptId, averageRawScore, averageScore,
backgroundCheckHasRecords, backgroundCheckSeverity, comment, cpf, curriculumUrl, distanceKm,
dnaScore, dnaScoreRaw, documentRequestStatus, email, expectedAnswersMet, firstname, globalRank,
greenhouseApplicationId, hasApproved, justification, lastname, likelyReading, matchLevel, matchPct,
partnerJobId, partnerUserId, phoneNumber, proficiencyTest, profileAssessment, rating,
requirementDetails, requirementMet, reuseFrom, stages, summarizedAnalysis, userId`.

**`curriculumUrl` E NOVO NO MAPA E E PII PURA:** URL de curriculo, mesma regua da URL do Pandape
(secao A.6). Nao persiste, nao loga, nao entra na projecao. `justification` (1.556 caracteres),
`attemptFeedback` (771), `summarizedAnalysis`, `profileAssessment`, `stages` e `requirementDetails`
sao JULGAMENTO sobre a pessoa e seguem fora, pela decisao de minimizacao de 16/09.

**Presenca medida numa pagina de 58 registros de um screening real:**

| campo | presenca |
|---|---|
| `userId` | 58/58, 36 caracteres, todos no alfabeto fechado `[A-Za-z0-9._-]{1,64}` |
| `partnerJobId` | 58/58, e **todos numericos de 7 digitos**, o que confirma o Ivan |
| `appliedAt`, `email`, `phoneNumber`, `stages` | 58/58 |
| `cpf` | **4/58**, coerente com os 12% da varredura de 16/09 |
| `partnerUserId` | **0/58**, coerente com os 13.248 de 16/09 |
| `name` | **0/58**, porque o campo nao existe |
| `userId` distintos | 58/58 |

**4. OS PARAMETROS DE QUERY SAO IGNORADOS PELO FORNECEDOR.** `?userId=`, `?user_id=`, `?search=` e
`?partnerUserId=` devolveram os **mesmos 58 de 58**. **Nao existe filtro no servidor**, e nenhuma
peca pode depender de filtrar por la.

**5. Crescimento da base:** **522 screenings** hoje, contra **301** em 16/09.
