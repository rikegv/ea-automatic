# Investigação: O Carimbo Compartilhado (Liberado Sem ASO herdando o "ok" do APTO)

> Complementa `docs/INVESTIGACAO-EXAME-LIBERAR-SEM-ASO.md`. §A.27: investigação, nada construído.
> Decisões já tomadas pelo diretor: D1 cirúrgica, D3 card mantido, D4 rótulo "Liberado Para Cadastro
> Sem ASO". **D2 mudou: o contrato TEM de sair.**

## 1. O que é "o carimbo", no código

O carimbo não é um pacote de vários efeitos. É **UMA COLUNA BOOLEANA**:

```
frentes_admissao.concluida   boolean
```

O `APTO` não "carrega um carimbo com várias coisas dentro". O que acontece é o contrário: **uma única
coluna é lida por todo mundo**, e cada leitor tira dela uma conclusão diferente. Quem grava é uma
linha só, em `mudarStatus`:

```ts
const concl = conclui(tipo, novo);            // EXAME conclui só em APTO
.set({ status: novo, concluida: concl, dataConclusao: concl ? agora : null, ... })
```

Os outros efeitos que a investigação anterior citou **não moram no carimbo**:
- a **NC-2** nasce de um `if` separado (`liberouAptoSemAso`), não do booleano;
- **sair da fila** é uma consulta que filtra `concluida = false`;
- **liberar o avanço** é a função pura `podeAbrirCadastro`, que lê o mesmo booleano.

## 2. Por que ele NÃO se separa: uma coluna, três perguntas

A mesma coluna `concluida` responde a três perguntas que, até hoje, sempre tiveram a mesma resposta:

| Pergunta | Quem lê |
|---|---|
| **1. O gate pode abrir?** (avanço, kit, assinatura) | `podeAbrirCadastro`, `kitLiberado`, fila do Ass.Click |
| **2. Saiu da fila de trabalho?** | fila da aba Exame, KPIs por status, card "Aptas" |
| **3. A frente terminou de verdade?** | fechamento pelo ASO, arquivamento no Drive, extração, farol |

**O pedido do diretor é: SIM para a 1, NÃO para a 2 e NÃO para a 3.** Como as três leem o MESMO BIT,
herdar o carimbo responde SIM às três de uma vez. **Não é um pacote que dá para desmembrar: é um bit
só.** Separar significa, necessariamente, ensinar alguém a olhar outra coisa além do bit. A escolha
real não é "separar ou não", é **QUEM aprende o status novo**: o lado do avanço (poucos leitores) ou
o lado da fila e do fechamento (muitos leitores).

## 3. O que quebra se o Liberado Sem ASO herdar o carimbo inteiro

Com `concluida = true` no status novo, **nove leitores passam a mentir**, e a maioria em silêncio:

| # | Onde | O que acontece |
|---|---|---|
| 1 | `esteira.service:324` (fila da aba) | **SAI da fila do Exame.** É exatamente o que o diretor não quer |
| 2 | `esteira.service:302` (`filtraStatusConclui`) | filtrar pelo status novo **não a revela**: a régua olha `STATUS_CONCLUI`, que é o APTO. A admissão fica invisível na aba, só achável pela busca por candidato |
| 3 | `esteira.service:575/593` (KPIs por status) | o card aprovado na D3 **marca sempre zero**: os KPIs contam `concluida = false` |
| 4 | `esteira.service:629` (card "Aptas") | conta `concluida = true` na aba: **a liberada seria contada como APTA**. Número falso no KPI entregue ontem (`18b747c`) |
| 5 | `esteira.service:2227` (`concluirExamePorAso`) | `if (frente.concluida) return undefined`. **O ASO chegando NÃO conclui o Exame.** Fica preso no status novo para sempre |
| 6 | `esteira.service:2186` (`exameConcluidoApto`) | exige `status = 'APTO'`. **O ASO não é arquivado no prontuário do Drive** |
| 7 | `admissoes.service:1973` (extração) | grava `frenteExameConcluidaEm` com data de conclusão que não aconteceu |
| 8 | `farol.ts:33` (`exameApto`) | passa a dizer que o exame está apto quando não está |
| 9 | `mudarStatus` (a gravação) | para carimbar, ou o catálogo marca `conclui = true` (e aí o front tira o card da D3, que filtra `!c.conclui`), ou abre-se exceção no serviço |

**Os itens 5 e 6 juntos são fatais.** O fechamento pelo ASO deixa de existir: a admissão nunca vira
APTO, nunca sai do status novo, e como a D1 cirúrgica exclui esse status da contagem de concluídas,
**ela nunca contaria como concluída, nem depois do ASO subir.** O caminho do carimbo não trava só a
fila: ele trava a admissão para sempre.

## 4. O caminho que de fato separa: o gate aprende o status

É o Caminho 1 do plano anterior. `EstadoFrente` passa a carregar o `status`, e o gate lê:

```ts
// EXAME libera o avanço quando está CONCLUÍDO (APTO) ou LIBERADO SEM ASO.
const exameLibera = exame?.concluida || exame?.status === "LIBERADO_SEM_ASO";
```

`concluida` continua `false`, então a frente **continua na fila do Exame**, o card da D3 conta, o card
"Aptas" não infla, o ASO fecha normalmente e o Drive arquiva. E como `kitLiberado` **reusa**
`podeAbrirCadastro`, o kit e a assinatura são liberados **de graça**, que é justamente o que a D2 nova
pede.

## 5. Os dois caminhos, lado a lado

| | **Caminho 1: o gate aprende** | **Caminho 2: carimbo compartilhado** |
|---|---|---|
| Arquivos tocados | 1 função pura + 11 leituras | 9 leitores + a gravação + o front |
| Fica na fila do Exame | **sim, por construção** | não, precisa de conserto |
| Card da D3 funciona | **sim, sem tocar em nada** | não, precisa de conserto |
| Card "Aptas" fica correto | **sim, sem tocar em nada** | não, infla |
| ASO fecha depois | **sim** (uma entrada na whitelist) | **NÃO. Trava permanente** |
| ASO arquivado no Drive | **sim** | não |
| Kit e assinatura liberados | sim (herdado do `kitLiberado`) | sim |
| Extração e farol honestos | **sim** | não |
| Modo de falha | recusa fechada (o gate barra) | **silencioso** (número errado, admissão presa) |

**O Caminho 2 toca MAIS código validado que o Caminho 1, e toca o mais recente:** o card "Total Já
Realizado" das cinco abas subiu ontem (`18b747c`).

## 6. "Mexer na Clicksign" no Caminho 1 é exatamente isto

O receio é legítimo, e o retrato exato desfaz o tamanho dele. O Caminho 1 toca **quatro leituras**
dentro da área do kit e da assinatura, todas de banco:

| Arquivo | O que muda |
|---|---|
| `kit.service.ts` (2 lugares) | o `select` das frentes passa a trazer `status` junto de `concluida` |
| `clicksign-sync.service.ts` (`carregarFrentes`) | o mesmo `select`, uma linha |
| `clicksign-gestao.service.ts` (`listarAptos`) | o `count(*) filter` ganha "ou o Exame está liberado" |

**Nenhuma linha do pipeline do envelope é tocada.** Ficam intactos: os cinco passos (criar, documento,
signatário, requisitos, ativar), a ordem `ativar → gravar → notificar`, o `POST /notifications`, o
balde de 1 por 60s por envelope, o teto de 50 por 10s, o cron tick, o download do assinado e o
arquivamento no Drive. O que muda é **quem entra na fila**, não **como o envelope é feito**.

No Caminho 2 esses quatro pontos não são tocados, é verdade. Em troca, os nove da seção 3 são, e dois
deles quebram o fluxo do ASO de forma permanente.

## 7. Confirmação: a admissão continua NÃO concluída

Vale nos dois caminhos, e é a D1 cirúrgica já aprovada: `admissaoConcluidaSql` passa a excluir quem
tem o Exame no status novo, e o carimbo do farol `ADMISSAO_CONCLUIDA` espera. O APTO de verdade
continua sendo o único que conta. Prova exigida antes e depois: **1749 e 1749**, porque nenhuma
admissão está no status novo no dia da subida.

**Uma precisão sobre os 3 casos que a investigação anterior levantou.** Eles não são o risco que
pareciam: os três são exames **CANCELADO** com farol **DECLINOU (2) e RESCISAO (1)**, todos já
assinados. São terminais, não processo vivo, e o Painel e o Alto Volume já os excluem pelo farol
(§A.16). O buraco na expressão é real e estrutural, mas **nunca mordeu num caso vivo**. *(Observação
fora de escopo, registrada e não tocada: no Gerenciador o KPI "Concluído" não filtra por farol, então
esses três contam lá. É comportamento anterior a esta frente, §A.31.)*

## 8. O fechamento pelo ASO, nos dois caminhos

**Caminho 1: funciona, com uma linha.** `STATUS_EXAME_APTO_POR_ASO` ganha o status novo, e daí em
diante o fluxo é o de sempre: a I.A valida o ASO, `concluirExamePorAso` vê `concluida = false` e o
status na whitelist, grava APTO com `concluida = true` e `data_conclusao`, registra o evento, a
admissão **sai da fila do Exame**, o ASO é arquivado no prontuário, e a D1 solta a contagem. Junto vai
a peça 5 do plano: recolocar o carimbo do farol quando o Exame fecha depois de Cadastro e Integração
já terem terminado, senão a admissão fica sem farol de conclusão, que é o defeito da Bienal (§A.27).

**Caminho 2: não funciona.** Trava nos itens 5 e 6 da seção 3. Só voltaria a fechar com um caminho
novo, escrito de propósito para desfazer o carimbo antes de refazê-lo, o que é mais código e mais
risco do que o Caminho 1 inteiro.

## 9. Recomendação

**Caminho 1: o gate aprende o status novo.** Toca menos código validado, o risco na Clicksign é de
quatro leituras de banco e zero linha do pipeline do envelope, e é o único dos dois em que o ASO
chegando fecha a admissão. O Caminho 2 economiza quatro leituras e paga com nove leitores mentindo,
dois deles prendendo a admissão para sempre.

A ideia por trás do carimbo compartilhado **está certa**, e é o que o Caminho 1 faz: **um lugar só
decide o que libera o avanço**, e todo mundo pergunta a ele. A diferença é que esse lugar é a função
pura `podeAbrirCadastro`, e não a coluna `concluida`. A coluna já tem dono e já responde outra
pergunta.

**O plano da investigação anterior não muda com a D2 nova.** O kit e a assinatura passam a ser
liberados **sem peça nova**, porque `kitLiberado` reusa o gate. O que entra é a quarta linha da tabela
da seção 6, a consulta do `listarAptos`, e a prova visual passa a incluir o contrato saindo com o
Exame ainda aberto.
