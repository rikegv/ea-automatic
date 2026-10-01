# Medição: o volume real com o recorte "só vagas ABERTAS", nas duas fontes

Medido ao vivo em 01/10/2026, somente leitura. Nada foi ligado, nada foi escrito, nenhum build e
nenhum restart. Pandapé: 113 requisições de um teto de 120 (o balde é compartilhado com o webhook que
alimenta a folha). Digai: 441 de um teto de 450. Zero resposta 429 em qualquer das duas.

Executado por dois agentes `backend` em paralelo, um por fonte, e consolidado conferindo (§A.39 passo
4). As correções de premissa abaixo foram achadas na consolidação, não repassadas.

---

## O NÚMERO QUE O DIRETOR PEDIU, em uma linha

**A fila de trabalho manual é de 470 vagas, não 432 e não 644.** Somar as duas fontes conta dobrado,
porque elas convergem para a mesma linha de vaga.

| | vagas |
|---|---|
| Pandapé, abertas (`VacancyStatus=2`) | **470** (censo) |
| Digai, PUBLISHED com elo de vaga | **174** (censo) |
| interseção, a MESMA vaga nas duas | **158** |
| só no Digai, vaga NÃO ativa no ATS | **16** |
| **união** | **486** |
| soma ingênua, que seria errada | 644 |

**Com o recorte do diretor aplicado às duas fontes, o denominador é 470**, porque os 158 do Digai já
estão dentro das 470. Os **16** são a decisão que falta (ver "Decisões").

---

## PANDAPÉ

### O filtro de abertas JÁ EXISTE E JÁ ESTÁ APLICADO

Esta é a primeira correção de premissa. A varredura pede `VacancyStatus=2` hoje
(`as/ingestao-pandape/ingestao-ciclo.ts:190` e `pandape/pandape-api.service.ts:415`). O campo é
`status`, **numérico**, e vem no corpo da vaga.

| status | vagas | % |
|---|---|---|
| 1 | 26 | 0,4% |
| **2, aberta/publicada** | **470** | **6,8%** |
| 3 | 6.389 | 92,8% |
| 7 | 0 | 0 |
| total | **6.885** | 100% |

Censo inteiro, por dois métodos que bateram exatamente: contagem item a item de 7 páginas, e
`totalItems` por filtro de status. **O recorte deixa 6.415 vagas de fora, 93% da base.**

*Ressalva honesta: o rótulo de `1` e `3` é INFERIDO, não medido. `3` tem `lastDeactivatedDate` e é
93% da base, então é encerrada; `1` tem volume de rascunho. Se o diretor for decidir sobre as 6.415,
vale confirmar com o suporte, porque "encerrada" e "arquivada" têm consequência diferente.*

Números anteriores corrigidos: o total era 6.822 (hoje 6.885) e as ativas eram "907" numa medição e
"471" noutra. **O 907 está defasado; o 471 estava certo e hoje são 470.**

### A JANELA DE 90 DIAS NÃO FILTRA NADA dentro das abertas

**68 de 68** vagas abertas da amostra têm inscrição nos últimos 90 dias. O número anterior de "432
vagas na janela" vinha de amostra de 12; com 68, nenhuma vaga aberta fica fora. **O corte útil é
"vaga aberta", e ele já é o corte da varredura.** A janela de tempo é redundante.

`/v2/matches` também **não aceita filtro de data**: `InsertDateFrom` devolveu os mesmos itens que a
chamada sem filtro, medido na mesma vaga.

### INSCRIÇÕES, e a ressalva que precisa ser resolvida antes de contratar

| medida | valor | natureza |
|---|---|---|
| inscrições nas 470 abertas | **~154.600** (IC95% 80.700 a 228.600) | ESTIMADO, amostra sistemática de 68 |
| inscrições na janela de 90 dias | **~75.500** (72.700 a 78.200) | ESTIMADO |
| maior vaga da amostra | 5.451 | MEDIDO |
| vagas com mais de 200 inscrições | ~200 das 470 (43% da amostra) | ESTIMADO |

**É INSCRIÇÃO, não PESSOA ÚNICA.** A mesma pessoa inscrita em quatro vagas conta quatro vezes. Se o
"50.700" anterior era de pessoas únicas, os dois números convivem e a taxa de repetição é ~3x.
**Resolver isso exige uma varredura de deduplicação por `idCandidate`**, que é trabalho de fila e não
de medição ao vivo. É a dúvida mais cara do relatório.

### O CLIENTE NÃO EXISTE NA VAGA: 470 de 470 cairiam em adiamento

Este é o achado mais duro, e é **medido**, não estimado.

| o que foi medido | resultado |
|---|---|
| `idCompany` e `idCompanyExternal` nas 470 | preenchidos, **1 único valor distinto cada** |
| campo de cliente, CNPJ ou razão social | **não existe** nos 23 campos de `/v2/vacancies` nem nos 8 de `/v1/Vacancy/List` |
| CNPJ no texto da `description` das 470 | **0** |
| `reference` casando `cod_cliente` do catálogo | **0 de 470** (é número de requisição, 7 dígitos, 442 distintos) |
| `tags` | só 38 das 470 têm, e são competência e cargo, não cliente |
| título da vaga (`job`) carrega cliente? | **não**, é cargo puro, conferido na consolidação |
| `GET /v2/vacancies/{id}` | **400, a rota não existe** |

A conta do Pandapé é **uma empresa só** (a própria Soulan), e o cliente final não é modelado na vaga.
Existe `GET /v1/Client/List` com 2.536 clientes e campo `cif` (o CNPJ, que casaria com
`clientes.cnpj`), mas **nada na vaga aponta para `idClient`**.

**Consequência:** não existe subconjunto que resolva sozinho, e o de/para Pandapé→catálogo (§A.9) não
é um complemento, é a **única** ponte possível.

### RITMO de vagas novas, que é o regime permanente

Vagas abertas por mês de publicação: abril 12, maio 22, junho 36, julho 81, agosto 128,
**setembro 158**. **O ritmo quase quintuplicou de abril a setembro.** É isso, e não o acervo, que
dimensiona a equipe no longo prazo: ~158 por mês são ~8 por dia útil.

---

## DIGAI

### Cinco status, não dois, e 537 screenings, não 277

| status | MEDIDO | anterior |
|---|---|---|
| PAUSED | **204** | 97 |
| PUBLISHED | **187** | 161 |
| QUEUED | **110** | não existia |
| CLOSED | **34** | não existia |
| DRAFT | **2** | não existia |
| **total** | **537** | 277 |

**O filtro de status NÃO está aplicado hoje** na varredura do Digai: ela lista tudo. Aplicar o
recorte do diretor nessa fonte é **código novo**, pequeno, não configuração. É a assimetria entre as
duas fontes.

### CANDIDATOS, e só 16% entram

| recorte | número | natureza |
|---|---|---|
| candidatos nas 187 PUBLISHED | **17.127** | MEDIDO |
| candidatos nas 204 PAUSED | ≈9.888 | ESTIMADO, amostra de 55 |
| **que a ingestão ADMITE (têm CPF)** | **≈2.828 (16,5%)** | ESTIMADO sobre censo parcial |

A régua `INGERIR_SOMENTE_QUEM_FINALIZOU` (`domain/digai.ts:338`) só admite quem tem CPF, e quem não
entra **não vira pessoa, não vira candidatura e não vira vaga**. Então **o volume de dado pessoal do
Digai é ~2,8 mil, não 17 mil.**

Duas taxas independentes sustentam a estimativa: **censo** de 142 screenings pequenas deu 15,0%, e
amostra de página sorteada nas 45 grandes deu 17,0%.

**A página 1 mente para cima:** a lista vem ordenada por `globalRank`, e a taxa de CPF cai dentro da
própria página 1 (20 de 50 nos primeiros contra 12 de 50 nos últimos). Medir pela página 1 teria
inflado o número. O agente sorteou página, e foi o que salvou a medição.

Formato do CPF: **1.262 de 1.262 com 11 dígitos sem máscara, e zero com dígito verificador
inválido.** Nenhum valor foi impresso nem gravado.

### `partnerJobId` é campo do CANDIDATO, não da screening

Correção de premissa minha: eu havia dito o contrário no briefing. A screening tem 17 campos e não o
inclui; o candidato tem. O código está certo: `ResultadoDigai` (`domain/digai.ts:78`) o lê do registro
do candidato.

| | número |
|---|---|
| screenings PUBLISHED varridas | 186 de 187 (1 timeout) |
| com `partnerJobId` | **174** |
| `partnerJobId` distintos | **174**, relação 1:1, zero compartilhamento |
| **com candidatos e SEM elo, vaga ADIADA** | **4** |
| candidatos presos nessas 4 | **368** |
| com zero candidatos | 8 |

### Teto de página: `limit`, máximo 100, e os outros nomes são ignorados em SILÊNCIO

`limit=500` devolve **400** com "limit must not be greater than 100". Já `pageSize`, `perPage`,
`per_page`, `size` e `take` com 500 devolvem **100 itens e HTTP 200**. Quem escrever paginação com
`pageSize` vai achar que aumentou a página e não aumentou nada.

### A v1 é projeção reduzida; a produção usa a v2, e não há defeito

`/api/v1/.../results` devolve **20 campos e NÃO tem `cpf`**. `/api/v2/.../results` devolve **41 campos
e tem**. O código produtivo usa a v2 (`digai-importacao.service.ts:209`).

**Isto quase virou um achado de defeito grave por erro meu de briefing:** eu passei a v1 ao agente, e
a primeira medição concluiu que o CPF não existia em lote. Se a ingestão tivesse sido escrita contra a
v1, ela leria a lista, não acharia CPF em ninguém e **escreveria ZERO para sempre, sem erro no log.**
Não é o caso. Mas a lição fica: **a v1 e a v2 da mesma rota têm populações de campo diferentes.**

---

## O TRABALHO MANUAL, COM O RECORTE

### O que é fila de verdade

| trabalho | volume | natureza |
|---|---|---|
| **vincular CLIENTE** | **470 vagas** | MEDIDO. Nenhuma resolve sozinha |
| **resolver CARGO** | **377 das 470 vagas**, em **311 nomes distintos** | MEDIDO com a normalização do próprio código |
| vagas adiadas no Digai por falta de elo | 4 vagas, 368 candidatos | MEDIDO |
| fila de divergências | 0 hoje, cresce com o uso | 7 campos, frente publicada em 30/09 |

O cargo é a segunda fila, e ela **não estava na conta de ninguém**. A medição usou a mesma régua do
código (`cargoPorTexto`: minúscula, acento removido, só cargo `ativo`): das 470 vagas abertas, apenas
**93 casam** com o catálogo de 380 cargos ativos. As outras **377** exigem cadastrar ou mapear o
cargo.

### O que NÃO é fila, e por que

- **Os candidatos chegam JÁ VINCULADOS à vaga.** Confirmado no código: o `partnerJobId` é a chave de
  conflito que resolve a vaga (`espelhoDaVagaDigai`, `domain/digai.ts:487`), e os dois espelhos
  convergem para a mesma linha. **O time não vincula um a um.** O entendimento do diretor está certo.
- **Os sem CPF não são trabalho, são volume que fica FORA.** Não viram pessoa, candidatura nem vaga.
- **As 6.415 vagas fechadas do Pandapé e as 350 screenings não publicadas do Digai** não entram.

### ESTIMATIVA DE TEMPO

O clique é rápido; **o custo é SABER**. O catálogo tem **251 clientes** (250 com CNPJ), então
vincular é escolher um de 251 numa lista com busca. O que demora é descobrir a que cliente a
requisição pertence, porque **a vaga não diz**.

| cenário | por vaga | 470 vagas |
|---|---|---|
| a pessoa sabe de cabeça | 30s | **~4h** |
| precisa conferir em outro sistema | 2 min | **~16h** |
| precisa perguntar a quem abriu | 5 min | **~39h** |

Somando o cargo (311 nomes novos, ~2 min cada, e é trabalho de catálogo que **não se repete**):
**~10h**.

**Mutirão inicial: de 14h a 49h, ou seja UMA pessoa por 2 a 7 dias úteis.** Depois dele, o regime
permanente é o ritmo de vagas novas: **~8 por dia útil**, de 4 a 40 minutos por dia.

**A ressalva que muda a conta:** se o de/para Pandapé→catálogo for construído sobre a `reference` (o
número da requisição), e se esse número for rastreável a cliente em algum sistema interno, **o mutirão
de 470 cai para perto de zero e vira automático.** Essa é a pergunta a fazer a quem abre as
requisições, e ela vale mais que qualquer das horas acima.

---

## AS DUAS RESPOSTAS DIRETAS

**Dá para aplicar o filtro de abertas nas duas fontes?** Sim, nas duas. Mas a situação é assimétrica:
no **Pandapé já está aplicado** (`VacancyStatus=2`, e a API aceita o filtro); no **Digai não existe
filtro nenhum hoje**, e aplicá-lo é código novo, pequeno.

**O que acontece com a vaga que entra fechada hoje e o cliente reabre amanhã?** Ela **entra sozinha na
próxima varredura**. `descobrirVagasAtivas` (`ingestao-ciclo.ts:183`) **relista** as ativas a cada
ciclo e, no fim, **encerra o espelho das que saíram da lista**. Reabriu, volta à lista, volta ao
espelho. No Digai o cursor **não pula nada por desenho** (é medição, não filtro), então o mesmo vale.

---

## DECISÕES QUE A MEDIÇÃO ABRIU

1. **As 16 vagas que estão PUBLISHED no Digai mas cujo pareado no Pandapé NÃO está ativo.** Qual
   status governa? Medido na amostra de PAUSED: 13 de 44 apontavam para fora das ativas, então o
   fenômeno não é raro.
2. **As 204 PAUSED do Digai** ("o cliente reabre com um clique"): entram agora ou voltam quando
   reabrirem? Se ficarem de fora, voltam sozinhas quando o status mudar, pelo mesmo mecanismo da
   resposta acima.
3. **A deduplicação por pessoa**, para saber se ~154,6 mil inscrições são 154,6 mil pessoas ou ~50
   mil. É a dúvida mais cara, e muda o volume de dado pessoal por um fator de 3.
4. **A semântica dos status 1 e 3 do Pandapé**, com o suporte, antes de decidir sobre as 6.415 de
   fora.
5. **O censo das PAUSED do Digai** custa 204 requisições e não cabia no teto. Autorizar?
