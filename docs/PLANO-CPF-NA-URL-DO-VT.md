# Plano: Tirar O CPF Da URL Do Formulário De Vale-Transporte

> Achado da auditoria de segurança (21/09/2026), item A4 da frente dos achados menores. **Nada foi
> construído.** Este documento é o plano, e existe porque a correção alcança um app que vive fora do
> backend e que está **em produção com candidato real**.

---

## 0. A Correção De Premissa, E Ela Muda A Prioridade

O diretor autorizou o teste com CPF sintético registrando a dívida assim: *"quando o VT for pra
produção com candidato REAL, esse caminho vira risco de CPF REAL no log"*.

**Medido na produção em 21/09/2026: já é hoje.**

| medição | valor |
|---|---|
| formulários de VT preenchidos | **202** |
| admissões distintas | 163 |
| primeiro | 24/07/2026 |
| último | **21/09/2026, hoje** |
| julho / agosto / setembro | 1 / 74 / **127** |

O app não vai para produção: **ele está em produção há dois meses, com volume crescendo**. Cada um
desses 202 acessos passou o CPF real do candidato pela query string. Não é dívida futura, é
exposição corrente, e o ritmo quase dobrou de agosto para setembro.

Isso **não muda o que foi decidido** (o teste com sintético segue válido e já foi feito), mas muda
**quando** esta correção precisa acontecer.

## 1. O Que Exatamente Vaza, E Por Onde

`montarLinkVt` (`apps/backend/src/vt-coleta/vt-link.service.ts`) monta `${baseUrl}?t=${token}`.
O token é base64url de JSON e carrega **nome, CPF e data de nascimento**. Não é opaco: qualquer um
que veja a URL decodifica em um passo.

| caminho | alcance |
|---|---|
| **log do Firebase Hosting** | o mais concreto. Retenção do Google, fora do EA, fora da §A.6 |
| histórico do navegador | no público do VT, aparelho com frequência compartilhado |
| `Referer` de subrecurso same-origin | a própria página do VT recebe a URL inteira |

Cross-origin o `strict-origin-when-cross-origin` moderno corta a query, então esse último é o menor
dos três. **O log do Hosting é o que importa.**

**O Portal faz o oposto, e de propósito:** o link dele usa FRAGMENTO (`#t=`), porque o fragmento
**não é enviado ao servidor**. Por isso ele não cai em log de proxy, de barreira nem no `Referer`.

## 2. O Conserto, E Onde Ele Mora

Uma linha de cada lado:

- **EA:** `montarLinkVt` passa a montar `${baseUrl}#t=${token}`.
- **App:** `apps/vt-online/public/app.js` lê `location.hash` em vez de
  `new URLSearchParams(window.location.search)` (linhas 1071 e 1072).

O fragmento **não atrapalha o roteamento do Firebase Hosting**, porque nunca chega ao servidor.

**O app NÃO é um repositório à parte:** `~/vt-online-soulan` é um link simbólico para
`apps/vt-online`, dentro deste repositório. Conferido em 21/09: o `app.js` no disco é **idêntico**
ao que está no ar. Ou seja, mexer aqui é mexer no que vai ser publicado, e publicar exige subir o
app no Firebase, que é ação em produção pública, não na 3120.

## 3. A Transição, Que É A Parte Cara

Links já emitidos continuam válidos por um prazo inteiro. Então:

| passo | o quê | por quê |
|---|---|---|
| **1** | o app passa a ler **os DOIS** formatos (fragmento primeiro, query como reserva) | sozinho não quebra nada: todo link vivo continua funcionando |
| **2** | o EA passa a emitir **só** `#t=` | a partir daqui nenhum CPF novo entra em log |
| **3** | espera a janela vencer | é o tempo de vida do maior link ainda em circulação |
| **4** | o app **derruba** o ramo da query | sem isto o conserto fica pela metade para sempre |

**A janela encolheu muito nesta sessão, e é isso que torna o plano barato:** o prazo do caminho do
CANDIDATO caiu de 30 dias para **6 horas**. O caminho do CONSULTOR, que é o que está em uso hoje,
segue em **30 dias** (`VT_LINK_TTL_DIAS=30` no ambiente de produção).

Logo a janela do passo 3 é **30 dias**, ditada pelo caminho do consultor, não pelo do candidato.
**Encurtar o prazo do consultor antes de começar encurta a janela inteira**, e é decisão do diretor:
ele é longo porque o link vai por e-mail e a pessoa pode demorar a abrir.

## 4. O Que NÃO Resolve, E Precisa Ser Dito

**Trocar o formato não apaga o que já foi registrado.** Os 202 acessos já aconteceram, e o log do
Hosting é do Google. Tratar o passivo é outra conversa (retenção do projeto no Cloud Logging), e não
é código.

**O token continua carregando CPF.** O conserto tira o CPF da URL, não do token. O token precisa
identificar a pessoa para o app conferir offline, e esse é o desenho. O que muda é que ele deixa de
transitar por onde se registra.

## 5. O Que Este Plano Pede Ao Diretor

1. **Autorizar a subida do app do VT no Firebase**, que é produção pública e está fora da régua da
   3120 (§A.32). São três publicações, nos passos 1, 2 e 4.
2. **Decidir sobre o prazo de 30 dias do caminho do consultor**, porque é ele que dita a janela.
3. **Decidir sobre o passivo** dos 202 acessos já registrados, que é retenção e não código.

---

## 6. Estado em 22/09/2026: as três correções construídas

A OST dos três vazamentos de CPF foi executada. Resumo, para este plano deixar de ser só do
vazamento 3 e virar o registro dos três.

**Vazamento 1 (CPF do substituído na lista da Central de Vagas):** corrigido. A lista parou de
projetar `substituidoCpf`; o CPF desce por `GET /as/vagas/:id` (`VagaDetalhe`), uma vaga por vez,
quando o consultor a abre. O `substituidoNome` continua (é coluna visível, não era o alvo).

**Vazamento 2 (CPF no nome do objeto do bucket):** corrigido para os NOVOS. O app do VT nomeia o
objeto com UUID opaco e põe o `admissaoId` (não o CPF) no JSON; o EA casa por `admissaoId`, com
dual-read para os arquivos antigos até a fila drenar. **Decisão de segurança:** o handle é o
`admissaoId`, não CPF em claro no JSON, para não criar uma segunda cópia legível por máquina.

**Vazamento 3 (CPF na URL):** o backend emite `#t=` (fragmento); o app lê fragmento primeiro, query
como reserva por ~30 dias.

**A varredura dos 3 dublês** (a lição das 5 passadas) foi feita: os três passam a aplicar o que
escrevem, e a classe da auto-renovação NÃO estava escondida em nenhum (produção guarda as três
transições).

**Auditoria:** o `seguranca` liderou, provou os três vazamentos rodando o ataque, e reauditou
rodando o ataque de novo: **o CPF novo NÃO vaza** nos três. Código APROVADO.

## 7. As três decisões do diretor, TOMADAS (22/09/2026)

As três pendências deste plano foram decididas pelo diretor. Registradas aqui como fechadas, não
mais como abertas.

1. **Subir o app do VT no Firebase: AUTORIZADO.** É produção pública, e o diretor liberou a subida
   para valer os vazamentos 2 e 3. O código está pronto e provado; a 3120 não serve o Firebase,
   então a correção do bucket e do link **só passa a valer em produção** quando o app subir. São as
   três publicações que este plano previa (o app lê os dois formatos, o EA emite só `#t=`, o app
   derruba o ramo antigo no fim da janela).
2. **Prazo de 30 dias do link do consultor: MANTER os 30 dias.** O diretor decidiu não encurtar. Os
   links antigos (com `?t=`) **vencem sozinhos** dentro dos 30 dias; os novos já nascem sem CPF na
   URL. Ninguém perde acesso, e o vazamento para nos novos desde a subida. A janela do dual-read é,
   portanto, 30 dias, ditada por esse prazo.
3. **O passivo dos 202 CPFs já no log: NÃO MEXER.** Decisão do diretor, "o que passou passou". A
   correção vale só daqui para frente. Tratar o passivo seria retenção do projeto no Cloud Logging,
   não código, e o diretor optou por não tratar.
