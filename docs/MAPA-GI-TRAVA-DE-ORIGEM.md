# Mapa de alcance: a TRAVA DE ORIGEM, o furo do botao manual e o apiSinc permanente (06/10/2026)

Investigacao do coordenador ANTES do primeiro despacho (§A.27 / §A.39 passo 1 / §A.40 regra 1).
Medido contra a producao do EA nesta data.

## 1. O CARIMBO DE ORIGEM: existe, e binario, e tem UM escritor so

| medicao | resultado |
|---|---|
| coluna | `admissoes.origem`, tipo `origemEnum`, **NOT NULL**, **default `MANUAL`** (`db/schema/tables.ts:896`) |
| valores que o enum admite | **exatamente dois: `MANUAL` e `PANDAPE`** (medido no banco, nao no codigo) |
| quem escreve a coluna | **TRES pontos**, todos em `admissoes/admissoes.service.ts`: `:658` (`opts?.origem ?? "MANUAL"`), `:854` (`"PANDAPE"` literal, `criarPreAdmissao` do webhook) e `:948` (`input.origem ?? "MANUAL"`, a ponte do funil de A&S) |
| todo o resto | cai no **default `MANUAL`** (cadastro manual, wizard, A&S, cargas) |

**Falso alarme que eu levantei e descartei:** `pandape/pandape-entrada.service.ts:131` tambem escreve
`origem: "MANUAL"`, mas na tabela **`pandape_entrada`**, com outro enum
(`pandapeEntradaOrigemEnum`). Nao e a origem da admissao. Nao confundir.

### A PREMISSA DO DIRETOR ESTA CORRETA, e a constituicao a sustenta

Ele afirmou que a admissao do webhook **ja e enviada ao G.I por outro caminho**, e que mandar de novo
duplicaria. **Confirmado por dois lados:**
- **Medido:** nenhum arquivo em `pandape/` ou `as/` alcanca `EnviarParaGiService` ou
  `criarFuncionarioSelecao`. O EA nao envia ao GI pelo caminho do Pandape.
- **Na constituicao:** a §A.5 descreve o **webhook G.Infor** como intocavel e diz que o
  **envio Pandape para o G.I e unico e irreversivel**, que e exatamente a razao do alerta de dupla
  correcao. O envio existe **fora do EA**.

## 2. A DECISAO DE DESENHO: ALLOWLIST, nao denylist. E isso contraria a letra do pedido

O diretor escreveu "se e PANDAPE, NAO envia". Escrito assim, ao pe da letra, a trava e uma
**denylist** (`origem !== "PANDAPE"`), e uma denylist **autoriza por omissao todo valor futuro**.

Hoje o enum tem dois valores, entao as duas formas dao o mesmo resultado. **Amanha nao.** O Digai e
uma segunda ATS, com ingestao ja construida e inerte, e a §A.47 existe justamente porque uma ATS nao
pode virar gatilho de admissao. Se um dia nascer `origem = "DIGAI"`, a denylist **autoriza o envio
sozinha**, sem ninguem decidir, e a pessoa pode ir duas vezes para a folha.

**Entao a trava e uma ALLOWLIST de origens autorizadas a enviar**, hoje `MANUAL`, derivada de um
simbolo unico e nao de literal espalhado. Origem nova nasce **bloqueada** e exige decisao do diretor
para entrar. E a mesma licao do `FAROIS_VIVOS` e do `Record` fechado: **fail-closed por construcao,
nao por lembranca**. O resultado operacional e identico ao que ele pediu; o que muda e quem paga a
conta do proximo valor.

## 3. A CONSEQUENCIA QUE O NUMERO REVELA, e ela precisa chegar ao diretor

| origem | total | **VIVAS** |
|---|---|---|
| `MANUAL` | 2388 | **1** |
| `PANDAPE` | 664 | **70** |

**70 das 71 admissoes vivas sao PANDAPE.** E as **tres** que passam as guardas do passo 6 (Allan,
Sonia e Stefany) sao **todas PANDAPE**, medido antes. Logo, com a trava de origem:

- o gatilho automatico **nao envia NENHUMA** das tres;
- o automatico fica **praticamente dormente** sobre a base viva de hoje, e passa a valer quando o
  fluxo novo (atracao e selecao, cadastro manual) carregar volume;
- **a admissao de teste do diretor sera `MANUAL`** (ele cria na plataforma), entao **ela envia**, que
  e exatamente o que o teste dele precisa.

Isso nao e defeito: e a trava funcionando. Mas muda a expectativa de "ligar o motor e ver sair".

## 4. O FURO DO BOTAO MANUAL (item 4 do diretor)

Medido: `enviarManual` (`gi/enviar-para-gi.service.ts:244`) vai direto a `enviarComGuardas`
**sem** `admissaoOperavel`. Quem ganhou a guarda de farol foi so o automatico. O `seguranca` levantou
isso e eu registrei como "ato humano deliberado"; **o diretor decidiu o contrario: declinado e
rescindido nao saem por caminho nenhum, nem por SUPER_ADMIN**. A guarda sobe para dentro de
`enviarComGuardas`, que e o ponto por onde os dois gatilhos passam, e aí nenhum caminho futuro a
contorna.

**Consequencia operacional, e e intencional:** quem quiser enviar um declinado **muda o farol antes**.
O desfecho da recusa precisa dizer isso, senao vira "o botao nao funciona".

## 5. O `apiSinc` PERMANENTE (item 3): o fundamento do diretor e OPERACIONAL e o `seguranca` nao o tinha

O `seguranca` **vetou** `true` permanente por retencao (a pre-admissao com PII e salario ficaria
**indefinidamente** no fornecedor, sem relogio e sem DELETE ao nosso alcance) e por um risco da
familia §A.33 (o EA carimba `gi_enviado_em`, devolve `GI_JA_ENVIADO` para sempre, e a pessoa **nunca
entra na folha**).

**O fundamento novo do diretor:** com `false`, quando a auditoria fecha **fora do horario de
trabalho** (noite, fim de semana), o registro **some antes de alguem ver**, e o time **perde a
admissao**. Nao e capricho: e perda de admissao real, e a necessidade e **permanente**, nao de janela.

**Os dois lados sao reais e se opoem**, e a decisao e do diretor com o risco na mao. O que a fabrica
entrega e o **mecanismo**, nao o valor: o campo entra **pelo montador, dentro da allowlist fechada**
(nunca injetado depois, como o experimento fez de proposito e declarou), lido de **variavel de
ambiente**. Assim o valor e uma decisao reversivel em uma linha de `.env`, e nao um commit.

## 6. QUEM MAIS LE OU ESCREVE O QUE VAI SER MEXIDO (§A.40 regra 3)

| ponto | quem le/escreve | risco |
|---|---|---|
| `admissoes.origem` | escrito so por `pandape-sync:571`; lido por telas de badge de origem | a trava passa a LER; nao escreve |
| `enviarComGuardas` | os dois gatilhos | ganha a guarda de farol: alcanca o botao manual, que e caminho validado (§A.26) |
| `montarFuncionarioSelecao` | o montador do payload, compartilhado com o Portal | ganha UM campo; allowlist fechada |
| `GI_DISPARO_ARMADO` | ja **ARMADA** em producao | nao mexer |
| publicacao | a sessao do Portal publica primeiro (combinado) | o commit do GI sai DEPOIS |

---

# CORRECOES DA AUDITORIA (06/10/2026), reverificadas por mim

O `seguranca` auditou este mapa ANTES da construcao. Veredito: **desenho da trava APROVADO**, **texto
do mapa VETADO** em duas afirmacoes, **item do botao manual VETADO como eu especifiquei**, e **veto do
`apiSinc` LEVANTADO** com duas condicoes. Tudo abaixo eu reverifiquei.

## D1. "UM escritor so" ESTAVA ERRADO: sao TRES, e eu apontei um CHAMADOR

`pandape-sync.service.ts:571` **nao escreve** a coluna: ele passa `opts.origem` e cai no `:658`. Os
escritores sao `admissoes.service.ts:658`, `:854` e `:948`. Isso nao derruba a trava, mas o mapa e de
onde o `backend` constroi, e "um escritor so" e exatamente a frase que faz alguem concluir que o lado
da leitura esta coberto.

## D2. O FURO DE VERDADE: a ponte do funil escreve `MANUAL` para gente do Pandape

`registrarSaida` chama `criarPreAdmissaoDoFunil` **sem passar `origem`**
(`as/candidatos/candidatos.service.ts:1970-1983`, conferido linha por linha), entao cai no default
**`MANUAL`**. Logo um candidato cuja candidatura em A&S e `PANDAPE`, enviado para admissao por aquele
botao, nasce com `admissoes.origem = MANUAL` e **a allowlist AUTORIZA o envio ao GI**.

**E isso provavelmente esta CERTO**, e e por isso que nao se "conserta": para quem veio pelo funil, o
**botao da esteira E o gesto de enviar** (§A.47), entao o Pandape nunca praticou a acao dele, e a
pessoa precisa ir. **A frase que faltava no mapa, e sem ela alguem desliga o funil inteiro da folha:**

> **`admissoes.origem` marca por onde a ADMISSAO entrou no EA, nao se a PESSOA passou pelo Pandape.**

Medido: **6 CPFs** ja tem as duas origens na base. E a mitigacao do unique parcial e fragil: o
`uq_admissao_cpf_vaga_viva` so reaproveita a admissao viva **quando `id_vacancy` nao e nulo**, entao
vaga criada dentro de A&S, sem `idVacancy`, cria admissao `MANUAL` nova para quem ja esta vivo como
`PANDAPE`.

## D3. A PREMISSA tem UM FIO SOLTO, e a minha segunda prova era fraca

Eu escrevi "confirmado por dois lados" e o segundo lado era uma **citacao da constituicao**, que
descreve o desenho e **nao mede nada**. O `seguranca` rejeitou, e com razao. A prova boa e medida e
esta no `DIARIO.md:17465`: o webhook do **G.Infor** (`gi-mms.gi.app.br/WebhookPandaFsSolucoes/`) esta
cadastrado **no mesmo painel do Pandape** em que esta o "Ea Automatic". Dois assinantes no mesmo
painel e prova real de que o Pandape alimenta a folha por fora do EA.

**O que ninguem mediu:** **em qual EVENTO o webhook do G.Infor esta inscrito.** Se nao for o mesmo do
nosso, existe um subconjunto de `PANDAPE` que o G.Infor **nunca recebeu**, e a trava passa a
bloquea-lo **para sempre**. E a distincao da §A.47 (etapa nao e acao) virada contra a trava. **Custo de
fechar: uma pergunta ao Andre ou um print do painel.**

## D4. O BOTAO MANUAL: `admissaoOperavel` era AMPLIACAO, e pior, viraria DEFEITO

`admissaoOperavel` e `ehFarolVivo && !pausadaEm`, e `ehFarolVivo` admite so `EM_ADMISSAO` e
`BANCO_AGUARDAR`. Usa-la no manual bloquearia tambem:

| farol bloqueado a mais | quantos | por que importa |
|---|---|---|
| **`ADMISSAO_CONCLUIDA`** | **1550 MANUAL + 452 PANDAPE** | e **exatamente quem TEM de estar na folha**. Flag manual e pegajosa: marcada antes do envio, **nenhum gatilho envia mais, para sempre** |
| **pausada** | 0 vivas hoje | a decisao sobre pausa e sobre **processo automatico**; ninguem decidiu sobre o **ato humano de MASTER** |

**A regua que o diretor decidiu e "nao ENCERRADA"** (`DECLINOU`/`RESCISAO` fora), nao "operavel".
Despachei a correcao ao `backend` no meio da construcao: predicado **proprio** no `domain/admissao.ts`,
aplicado em `enviarComGuardas`; o **automatico nao muda** e segue mais restrito, de proposito.

**E a FONTE DO DADO, que o meu briefing nao especificou:** `enviarComGuardas` nao tem farol nem pausa
no escopo, e o `GiLeitorService` **nao le nenhum dos dois** nem a `origem`. A leitura entra no leitor,
por colunas nomeadas (`farol_global`, `pausada_em`, `origem`), **linha ausente = RECUSA**, e e a
**autoritativa**.

## D5. O BLOQUEIO POR ORIGEM PRECISA DE DESFECHO PROPRIO

Se a trava reusar um codigo existente, ninguem distingue "declinado" de "bloqueado por origem", e a
tela que mostraria isso nao existe. **`GI_ORIGEM_NAO_AUTORIZADA`** e obrigatorio, com frase de log fixa
e PII-free, para o bloqueio ser **contavel**.

**E o sinal que avisaria se a premissa furar**, barato: nos primeiros bloqueios, ler de volta no GI
pelo CPF (GET e permitido) e confirmar que a pessoa **ja esta la**. Bloqueado que nao existe no GI =
premissa furada naquele caso, descoberto em minutos em vez de em folha atrasada.
