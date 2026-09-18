# A Plataforma Unificadora: Digai E Pandapé Refletidos, Com Vida Própria

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Estado:** DESENHO, aguardando decisão do diretor
**Autor:** agente `arquiteto` (sem poder de escrita em código, §A.39)
**Natureza:** plano com OPÇÕES. Nada aqui foi construído. Cada peça tem 2 ou 3 escolhas reais, o custo
de cada uma e a recomendação do arquiteto com o motivo.

---

## 0. O Que Este Documento Assume, E Não Reabre

O conceito é do diretor e entra aqui como fato, não como hipótese:

1. O EA é o **unificador** e a **fonte da verdade** das vagas e dos candidatos que vêm do **Digai** e
   do **Pandapé**. Os dois, e tudo o que este documento desenha vale para os dois.
2. A plataforma **reflete** as fontes e tem **vida própria**: o diretor age nela e ela diverge.
3. A plataforma **não cria vaga** como regra. A vaga nasce na fonte e aparece aqui com os candidatos
   dela. A **exceção** é a vaga aberta manualmente (indicação de cliente que não está em fonte
   nenhuma), e um de/para liga as duas se ela aparecer na fonte depois.
4. **Quando diverge, a plataforma está certa.** O time não volta na ferramenta externa para
   atualizar, e os indicadores saem daqui.

Este documento segue a §A.31: propõe, não constrói, e não acrescenta o que não foi pedido. O ponto 5
da OST não foi despachado para o arquiteto e não aparece aqui.

---

## 1. O Chão Medido, Que Muda O Tamanho Do Trabalho

**A base de produção do A&S está praticamente vazia.** `vagas` 3 linhas, e **zero** com
`id_vacancy_pandape` preenchido. `as_candidatos` 3, `as_candidaturas` 3, `as_etapas_funil` 5.

Isso tem uma consequência de projeto que atravessa o documento inteiro: **toda mudança estrutural
custa hoje o preço de uma migration vazia.** Migrar `as_candidatos.id_candidate_pandape` para uma
tabela de identidades custa, agora, escrever a migration. Depois da primeira varredura do Pandapé,
custa a migration mais o backfill mais o risco de o backfill errar em dado de pessoa. É a diferença
entre uma tarde e uma frente.

**A estrutura "uma pessoa, N participações" JÁ EXISTE**, e é exatamente o ponto 1 da OST:

| Peça | Onde | O que já garante |
|---|---|---|
| `as_candidatos` | `db/schema/tables.ts:3088` | A PESSOA. Chave é o `id` (uuid), não o CPF. CPF é unique PARCIAL (`where cpf is not null`) |
| `as_candidaturas` | `db/schema/tables.ts:3373` | A LIGAÇÃO pessoa x vaga. UNIQUE PARCIAL sobre as situações VIVAS |
| `as_contatos` | mesma vizinhança | O histórico do contato |
| `as_candidatura_etapas` | `db/schema/tables.ts:3640` | A trilha do movimento, com `vagaDe`/`vagaPara`, `aceite` de lista fechada e índice parcial sobre o aceite |
| Ocupação da vaga | `packages/shared-types/src/index.ts:2770` | DERIVADA, nunca contador guardado. Quem consome posição se **pergunta a `consomePosicao`**, que é a fonte única. Este documento não repete a lista, de propósito |
| `trocarVaga` | `as/candidatos/candidatos.service.ts:792` | Migração de candidato entre vagas, quatro travas, `SELECT ... FOR UPDATE` no destino, e a etapa NÃO é reescrita |

**O que o Digai é** (varredura de 16/09/2026, 86/86 workspaces, 301 screenings, 13.248 registros,
451 chamadas, zero falhas, `DIARIO.md:15815`):

- `partnerUserId` é ZERO em 13.248 registros e em ZERO workspaces. **Não há marcador de origem.**
- `userId` é chave **estável**, e a reconsulta por ele funciona.
- **12.445 pessoas distintas em 13.248 registros: 803 registros são a mesma pessoa aparecendo mais de
  uma vez.** É a evidência direta do ponto 1, e ela vem do mundo real, não de suposição.
- Só **12% têm CPF** (1.656 de 13.248). Sem CPF quer dizer que não finalizou. **O CPF atualiza no
  MESMO registro**, não cria registro novo.
- `partnerJobId` é `numerico[7]` em 12.686 de 13.248 e tem o **mesmo formato** de
  `vagas.id_vacancy_pandape`. É **hipótese de casamento, não provada**, e hoje **inverificável**,
  porque o alvo está vazio em 3 de 3 vagas.
- `webAccessLink` e `whatsappAccessLink` são **fixos por vaga**.
- **A vaga do Digai não tem cliente nem posições.**

**O que o Pandapé é** (§A.5 INT-1, `docs/DESENHO-FILA-ENTRADAS-PANDAPE.md`, `apps/backend/src/pandape/`):

- O modelo vigente é **webhook**. O cron-pull de descoberta está DEPRECADO: a API v1 não tem
  endpoint de listagem.
- A idempotência é por `IdPreCollaborator`, índice unique.
- Quando a vaga não resolve para cliente/cargo, **a criação é ADIADA em vez de inventar vínculo**, e
  o evento é reprocessável.

**Esse último ponto é o precedente da casa, e é a resposta de várias peças deste desenho.** Adiar em
vez de inventar, com o evento guardado e reprocessável, já resolveu o mesmo problema uma vez. Onde
este documento puder responder com ele, responde com ele.

---

## 2. Ponto 1: Candidato Único, N Processos

### 2.1 O que existe hoje

A contagem **já está no backend e já chega à tela**. `AsCandidatoListItem.candidaturasAtivas`
(`packages/shared-types/src/index.ts`) é preenchida por uma subconsulta correlacionada em
`candidatos.service.ts:348`, que conta as candidaturas da pessoa cuja situação está em
`SITUACOES_VIVAS`. O índice `idx_as_candidaturas_candidato` cobre exatamente essa consulta, e a lista
é limitada a 200 linhas: **não há N+1 aqui e não haverá**, porque é uma subconsulta dentro da mesma
query, não uma chamada por linha.

A ficha do candidato (`AsCandidatoFicha.candidaturas`) já lista as candidaturas da pessoa, com vaga,
etapa e situação. **A tela é que ainda não diz nada disso na linha.**

### 2.2 O que falta, e são três números diferentes

| # | A pergunta | Onde ela aparece | Como se calcula |
|---|---|---|---|
| N1 | "Esta pessoa está em N processos" | Linha da **Central de Candidatos** | Já calculado (`candidaturasAtivas`). Falta a tag na linha |
| N2 | "Esta pessoa está em N processos" | Linha do **Funil Da Vaga** | Não existe. Um `join` com um agregado, nunca subconsulta por linha |
| N3 | "X dos Y candidatos desta vaga estão em outro processo também" | **Cabeçalho do Funil Da Vaga** | Um agregado só, na mesma chamada da vaga |

**N2 sem N+1, e é a única peça com risco real de virar N+1.** O funil de uma vaga lista as
candidaturas daquela vaga. A forma certa é um agregado agrupado, juntado uma vez:

> um `with` que agrupa `as_candidaturas` por `candidato_id` contando as vivas, juntado por
> `candidato_id` às linhas do funil. Um hash aggregate, uma passada. A forma errada, e é a que sai
> naturalmente de quem copia a linha do `candidaturasAtivas`, é a subconsulta correlacionada repetida
> por linha do funil: em vaga de alto volume com 400 currículos ela vira 400 varreduras.

**N3 é derivado de N2 e não precisa de consulta própria:** é a contagem das linhas do funil cujo N2 é
maior que 1. Calcular N3 numa segunda consulta cria a chance de os dois números não baterem na mesma
tela, que é o defeito que a §A.19 documenta a respeito da régua de pendências.

### 2.3 O que a §A.6 impõe aqui, e limita a tela

**A Central de Candidatos não devolve identificador direto no retorno de lista**, por decisão de
minimização já auditada. Portanto:

- **O indicador é CONTAGEM, nunca lista de pessoas.** "Está em 3 processos" é um número. "Está em
  Vaga A, Vaga B e Vaga C" é a **ficha**, que é uma pessoa por vez e um clique deliberado.
- A tag na linha do funil diz "Em Outros 2 Processos". Ela **não** diz quais, e o caminho para saber
  quais é abrir a ficha.

### 2.4 As opções

**Opção A, contar só as VIVAS (o que o código já faz).**
A tag mostra quantos processos a pessoa tem abertos agora.
*Custo:* zero no backend para N1, uma consulta agregada para N2/N3, mais a tag na tela.
*Risco:* quem foi descartado em cinco vagas e está vivo em uma aparece como "1 processo". Alguém pode
esperar ver o histórico ali.

**Opção B, contar TUDO (vivas mais encerradas).**
A tag vira "participou de N processos, no total".
*Custo:* o mesmo, é só trocar o predicado.
*Risco:* o número cresce para sempre e **perde o uso operacional**. "Está em 9 processos" deixa de
significar "esta pessoa está disputada agora" e passa a significar "esta pessoa é antiga na base".
Quem olha a tela quer a primeira coisa.

**Opção C, os dois números.** Tag com as vivas, e o total na ficha, onde já há espaço e já há a lista.
*Custo:* o de A mais uma linha no retorno da ficha.
*Risco:* nenhum relevante.

### 2.5 Recomendação

**Opção C.** A tag na linha conta as **vivas**, porque o valor operacional do indicador é "esta pessoa
está sendo disputada agora, cuidado ao aprovar", e esse é o número que responde. O total histórico vai
para a ficha, que é onde ele já é derivável da lista de candidaturas que ela devolve.

E uma régua para a implementação: **a lista das vivas se pergunta a `candidaturaViva`**, nunca se
digita. O comentário de `consomePosicao` no shared-types conta que essa régua já esteve escrita quatro
vezes e que as quatro concordavam por coincidência. Não abrir a quinta.

---

## 3. Ponto 2: Autocompletar CPF E Dados Entre Vagas

### 3.1 O nó, e ele é real

Se é o **mesmo** `as_candidatos.id`, os dados **já são os mesmos por construção**. Não há o que
completar: a pessoa é uma linha só, e as candidaturas dela apontam todas para ela. Uma oferta de
"completar o CPF da vaga B com o CPF da vaga A" não tem sentido nesse mundo, porque não existem "os
dados dela na vaga B".

A oferta só faz sentido quando existem **dois registros de pessoa** que a plataforma suspeita serem a
mesma. **Os dois mundos são reais, e eles respondem a perguntas diferentes.** Desenho os dois, porque
o diretor precisa escolher com os dois na mão.

### 3.2 Mundo A, UM registro: isto não é oferta, é ENRIQUECIMENTO

**É o mundo majoritário, e a medição diz por quê.** No Digai, 12.445 pessoas em 13.248 registros, e o
`userId` é estável, então ingerir com chave no `userId` produz **uma linha de pessoa e N candidaturas**
para os 803 casos repetidos. Mais: o CPF do Digai **atualiza no mesmo registro**, ou seja, a fonte já
trabalha assim. A pessoa entra sem CPF na triagem, finaliza semanas depois, e o CPF aparece no mesmo
`userId`.

Aqui não há pergunta a fazer ao consultor. Há uma régua a escrever, e ela tem **três casos**:

1. **Campo vazio na plataforma, preenchido na fonte:** a plataforma **preenche sozinha**. Nada se
   perde, ninguém decidiu nada em contrário, e exigir confirmação para preencher um campo vazio
   transformaria o caso mais comum do Digai (o CPF que chega depois) numa fila de cliques.
2. **Campo preenchido na plataforma, IGUAL ao da fonte:** nada acontece.
3. **Campo preenchido na plataforma, DIFERENTE na fonte:** **a plataforma vence e não é tocada.**
   Isso é uma **divergência do tipo D6** (§4) e vai para a fila de resolução. É aqui que o conceito
   do diretor manda: o time editou na plataforma, a fonte está velha.

**Rastro:** o preenchimento do caso 1 é escrita em dado pessoal feita pelo sistema, sem humano. Ele
precisa de trilha, e a trilha diz **quais campos** foram preenchidos e **de que fonte**, nunca o
valor. "CPF preenchido a partir do Digai em 17/09" é auditável; "CPF preenchido: 123..." é violação
da §A.6.

### 3.3 Mundo B, DOIS registros: aí sim há oferta

Dois registros da mesma pessoa nascem de três jeitos, e só de três:

- a pessoa veio do **Digai** e também do **Pandapé**, com identificadores externos diferentes (**e é
  exatamente a dedup que o diretor SEGUROU**, aguardando o Ivan confirmar a chave de casamento);
- a pessoa foi **cadastrada à mão** sem CPF e depois chegou pela fonte;
- a pessoa aparece **duas vezes na mesma fonte** com identificadores diferentes (e-mail novo, novo
  cadastro). No Digai isso é possível e não foi medido.

O que a plataforma pode oferecer:

- **O que dispara:** um candidato é gravado ou atualizado e a plataforma encontra **outro** registro
  com sinal forte de ser a mesma pessoa. Sinal forte, em ordem: **CPF igual** (mas esse caso o unique
  parcial já barra na criação, então ele só aparece quando o CPF chega **depois**), depois **e-mail
  igual**, depois **telefone igual**. Nome igual **não é sinal forte** e não entra: o próprio schema
  de `as_comerciais` documenta que duas "Ana Silva" existem no mundo real.
- **O que a oferta mostra:** "Encontramos um cadastro que pode ser a mesma pessoa", o que **cada um
  dos dois tem** (este tem CPF, aquele não; este está em 2 processos, aquele em 1) e **por qual sinal**
  a suspeita nasceu. §A.6: a tela da suspeita é uma tela de ficha, não de lista, então ela pode
  mostrar o dado, mas **o motivo nunca vai para log**.
- **No aceite:** a decisão é **fundir** ou **completar**, e não são a mesma coisa (ver as opções).
- **No recusar:** grava-se **"não são a mesma pessoa"** para aquele **par de ids**, e a suspeita
  **não volta a ser levantada para aquele par**. Sem isso, a oferta reaparece em todo salvamento, que
  é o apito infinito do ponto 6 chegando por outra porta.
- **O rastro:** quem decidiu, quando, qual par, qual sinal, e qual foi a decisão. Permanente e
  consultável, no mesmo espírito do aceite de dupla correção da §A.6.

### 3.4 As opções do mundo B

**Opção A, NÃO FAZER AGORA (só o mundo A).**
Ingestão por chave externa, enriquecimento de campo vazio, divergência quando conflita. Nenhuma
suspeita de duplicidade, nenhuma fusão.
*Custo:* o menor de todos, e resolve o caso majoritário medido.
*Risco:* Digai e Pandapé continuam produzindo duas pessoas para o mesmo humano, e a contagem do ponto
1 conta o mesmo humano duas vezes. **Mas é exatamente o estado em que o diretor já decidiu ficar até
o Ivan responder.**

**Opção B, SUGERIR sem FUNDIR.**
A plataforma levanta a suspeita, mostra os dois lados, e a ação disponível é **copiar campos vazios de
um para o outro** (o "completar" da OST), mais o **"não são a mesma pessoa"**. As duas linhas
continuam existindo, e as candidaturas não se movem.
*Custo:* médio. Uma tabela de suspeitas, uma tela pequena, e a régua de sinais.
*Risco:* o duplicado continua duplicado. O ponto 1 continua contando dois. É um paliativo honesto:
ele **não mente** dizendo que resolveu.

**Opção C, FUNDIR de verdade.**
Uma pessoa absorve a outra: as candidaturas, os contatos e as identidades externas são repontados, e
a linha absorvida vira um "apelido" que aponta para a sobrevivente.
*Custo:* o maior, e por um motivo concreto que a leitura do schema revela: **fundir pode violar o
unique parcial `uq_as_candidaturas_viva`.** Se as duas pessoas têm candidatura VIVA na MESMA vaga, a
fusão precisa decidir qual das duas sobrevive, e essa decisão tem consequência sobre posição ocupada
(`consomePosicao`) e sobre a trilha. É uma operação de Master, transacional, com `FOR UPDATE`, e ela
precisa de teste independente (§A.38).
*Risco:* fundir errado é **irreversível na prática**, e junta dado pessoal de duas pessoas diferentes.
É o pior erro possível neste módulo.

### 3.5 Recomendação

**Opção A agora, Opção B preparada, Opção C só depois do Ivan.**

O motivo é medido, não de gosto. O mundo A cobre o caso que a varredura provou existir (803 registros
repetidos, CPF que chega depois no mesmo `userId`), e cobre com uma régua determinística, sem tela e
sem clique. O mundo B só é grande quando Digai e Pandapé se cruzarem, e **cruzar é precisamente o que
está segurado por ordem do diretor**. Construir a fusão antes de saber a chave de casamento é
construir a operação mais perigosa do módulo contra uma suposição.

O que fica preparado: a tabela de **decisões sobre pares** ("não são a mesma pessoa") nasce junto com
a tabela de divergências do ponto 4, porque é o mesmo mecanismo de silêncio, e é ela que impede o
apito infinito quando a suspeita entrar.

**Achado colateral, e ele é de segurança.** `as_candidatos.origem` (enum `PANDAPE`/`MANUAL`/
`INDICACAO`/`BANCO_TALENTOS`) **decide retenção**: `retencao-candidatos.service.ts` protege
`BANCO_TALENTOS` do expurgo. E ele é **editável por formulário, sem papel exigido e sem trilha**
(`candidatos.service.ts:253`, o `origem: dto.origem ?? atual.origem` do `editar`). Com ingestão de
duas fontes, `origem` passa a ser escrito pelo sistema e continua editável por qualquer um: um
consultor pode, sem intenção, **tirar uma pessoa do expurgo para sempre** ou **jogar uma pessoa no
expurgo**. A proposta é separar as duas perguntas ("de onde a pessoa veio", que é imutável e do
sistema, e "está no banco de talentos", que é decisão com papel e trilha). **Isto é proposta, §A.31,
e é ponto de acionamento do agente `seguranca` (§A.38: dado pessoal e retenção LGPD).**

---

## 4. Ponto 3: Divergência, A Tag Na Linha, O Modal Pequeno E O Apito

### 4.1 O que é uma divergência, enumerada

Divergência é **a fonte dizer uma coisa e a plataforma dizer outra sobre a mesma entidade**. Ela não é
erro, não é falha e **nunca** é aplicada sozinha.

| Código | Tipo | O que aconteceu | Entidade |
|---|---|---|---|
| **D1** | **Vaga Diferente** | A fonte diz que a pessoa está na vaga Y, a plataforma tem a candidatura na vaga X | Candidatura |
| **D2** | **Etapa Diferente** | A fonte diz uma fase do funil, a plataforma tem outra | Candidatura |
| **D3** | **Situação Diferente** | A fonte diz reprovado ou desistente, a plataforma tem a pessoa viva (ou o contrário) | Candidatura |
| **D4** | **Pessoa Sumiu Da Fonte** | O registro deixou de ser retornado pela fonte | Candidato |
| **D5** | **Vaga Sumiu Da Fonte** | A vaga deixou de ser retornada pela fonte, ou foi encerrada lá e está aberta aqui | Vaga |
| **D6** | **Dado Pessoal Diferente** | CPF, e-mail ou telefone preenchido na plataforma e diferente na fonte | Candidato |
| **D7** | **Pessoa Nova Na Fonte** | A fonte trouxe alguém que a plataforma não tem | (ingestão) |
| **D8** | **Vaga Não Mapeada** | A vaga da fonte não resolve para nenhuma vaga da plataforma | (ingestão) |

**D7 e D8 estão na tabela mas NÃO são divergência, e a distinção é de propósito.** D7 é ingestão
normal: pessoa nova entra. D8 é o caso já resolvido pelo Pandapé, e a resposta é o precedente da casa:
**adiar em vez de inventar**, guardar o evento e reprocessar quando o de/para existir. Eles aparecem
aqui para que a enumeração fique fechada e ninguém os classifique como divergência por falta de lugar.

**O caso crítico da OST é o D1, e ele precisa de uma frase exata:** chega movimentação da fonte
dizendo vaga Y enquanto a plataforma tem vaga X. **A PESSOA não muda.** Ela continua sendo a mesma
linha de `as_candidatos`, e o CPF e o status que chegaram com o evento são enriquecimento normal
(§3.2). **O que diverge é o PROCESSO.** Tratar D1 como "duas pessoas" seria o erro mais caro
disponível aqui.

### 4.2 Onde a divergência é DETECTADA

**Num ponto só, e a exigência 1 da auditoria da Fila De Entradas já provou que isso importa.** Toda
porta que transforma um evento de fonte em dado da plataforma atravessa o mesmo comparador. O
`pandape-sync` aprendeu isso pelo caminho difícil: o desfecho escrito em cada `return` deixou três
saídas silenciosas, e a correção foi fazer o processamento **retornar** um tipo discriminado com um
único escritor persistindo. **O comparador de divergência nasce com essa forma**, não a descobre
depois.

O comparador recebe **o que a fonte disse** e **o que a plataforma tem**, e devolve uma lista fechada
de divergências. Ele é **função pura e testável sem banco**, e é o que o `tester` pode escrever
**antes do código existir** (§A.40, regra 2).

### 4.3 Onde a divergência é GUARDADA: e aqui há uma escolha de fundo

**Opção A, guardar SÓ a divergência.**
Uma linha nasce quando a fonte difere, e morre quando alguém resolve.
*Custo:* o menor. Uma tabela.
*Risco, e ele é grande:* **não há como detectar D4 e D5.** "Sumiu da fonte" é ausência, e ausência não
gera evento. Sem guardar quando cada entidade foi **vista pela última vez**, a plataforma não tem como
perceber que parou de ver. Some-se que não há como responder "o que a fonte diz hoje sobre esta
candidatura" para o que **não** diverge, que é a pergunta que o consultor faz na hora de resolver.

**Opção B, guardar o ESPELHO da fonte, e derivar a divergência.**
Uma linha por entidade externa vista, com o último estado que a fonte informou (vaga externa, etapa
externa, situação externa) e o carimbo `visto_em`. A divergência é **comparação**, feita na ingestão e
gravada ao lado.
*Custo:* uma tabela a mais e a disciplina de atualizar o espelho **sempre**, inclusive quando a
divergência está silenciada (ver ponto 6, é o que impede o silêncio de cegar a plataforma).
*Risco:* o espelho é dado da fonte guardado no banco, então a §A.6 entra com força: **identificadores
externos e classificação, jamais CPF, nome, e-mail, telefone ou payload.** É a mesma régua já escrita
para `pandape_entrada`, que **proíbe nominalmente** as colunas `payload`, `detalhe`, `observacao` e
`json`, e proíbe gravar `err.detail` porque o `detail` do 23505 do Postgres traz o CPF por extenso.

**Opção C, não guardar nada e recomparar sempre contra a API.**
*Custo:* zero de banco.
*Risco:* inviável. O Digai é **polling** e a varredura completa custou 451 chamadas; o Pandapé tem
**rate limit de 1.000 requisições por 5 minutos COMPARTILHADO** com o webhook do G.Infor que alimenta
a folha. Recomparar sob demanda põe a tela do consultor na frente da folha de pagamento.

### 4.4 Recomendação

**Opção B, o espelho.** É a única que responde D4 e D5, e é a única em que "voltou a concordar" se
detecta sozinho. O custo extra é uma tabela num módulo cuja base tem 3 linhas.

### 4.5 Como ela aparece, e o "apito" do diretor

Três superfícies, e a OST já nomeou as três:

- **Tag na linha.** "Divergente" na linha do candidato, do funil e da vaga. Segue a §A.12 (ícone
  dinâmico por status, e divergência é **exclamação amarela**, não X vermelho: nada está errado, algo
  precisa de decisão) e a §A.24 (Title Case na tag).
- **Modal pequeno**, aberto pela tag, mostrando **lado a lado**: "A plataforma diz" e "A fonte diz",
  com as ações do ponto 4. §A.41: é modal de preenchimento, **não fecha no clique fora**, e fecha por
  Cancelar ou por Salvar.
- **O apito.** Duas opções:
  - **Opção A, contador no menu lateral.** Um número ao lado do item, como fila de trabalho. Discreto,
    sempre visível, e é o padrão que o sistema já conhece.
  - **Opção B, tela própria** ("Divergências"), fila ordenada, no molde da Fila De Entradas do
    Pandapé.
  - **Recomendação: as duas, e nessa ordem.** O contador é o apito; a tela é onde se trabalha. Um
    contador que não leva a lugar nenhum vira ruído, e uma tela sem contador ninguém abre. **Menu novo
    nasce só para o SUPER_ADMIN (§A.23), e o registro no catálogo é automático, mas quem libera é o
    diretor.**

---

## 5. Ponto 4: Quem Vence, E A Tela De Resolução

### 5.1 A régua

**A plataforma vence por padrão**, e por padrão quer dizer uma coisa precisa: **a divergência NUNCA é
aplicada sozinha à plataforma.** Ela nasce, espera e é decidida por gente. O consultor decide caso a
caso, com viés declarado para a plataforma.

Isso tem um corolário que precisa ser dito, porque ele é contraintuitivo: **a plataforma vencer não
quer dizer que a fonte é ignorada.** O espelho continua sendo atualizado, o enriquecimento de campo
vazio continua acontecendo, e a pessoa nova da fonte continua entrando. O que a plataforma protege é o
**que alguém já decidiu aqui**.

### 5.2 A tela de resolução: o que o consultor vê e o que ele pode fazer

**O que ele vê:** o tipo da divergência em português, o que a plataforma diz, o que a fonte diz,
**quando a fonte disse** e **há quanto tempo** a divergência está aberta. Nada mais: é um modal de
decisão, não um relatório.

**As ações, e são três:**

| Ação | O que faz | O que fica de trilha |
|---|---|---|
| **Manter A Plataforma** | Nada muda no dado. A divergência é **resolvida** e **silenciada** (ponto 6) | Quem, quando, qual valor da fonte foi recusado |
| **Aceitar A Fonte** | Aplica a mudança **pelo mesmo serviço já validado** que um humano usaria | A trilha do próprio serviço (`as_candidatura_etapas`), mais a linha da decisão |
| **Decidir Depois** | Sai da fila padrão por um prazo, **sem** silenciar | Quem adiou, até quando |

**"Aceitar A Fonte" é o ponto de maior risco do documento inteiro, e a régua é dura: ele NÃO escreve
no banco direto.** Ele chama o mesmo caminho de serviço que o consultor chamaria. Para o D1, chama
`trocarVaga`. Isso não é elegância, é sobrevivência: `trocarVaga` tem **quatro travas**, faz
`SELECT ... FOR UPDATE` na vaga de destino, recusa candidatura encerrada, recusa duplicata viva na
vaga de destino e confere `cabeMaisUm` quando a candidatura consome posição. Uma resolução que
escrevesse `vaga_id` direto contornaria as quatro **em silêncio**, e a vaga passaria a aceitar mais
gente do que tem posição. É literalmente o defeito que o comentário de `registrarSaida` descreve como
"a trava não teria sido burlada, apenas não consultada".

**Consequência aceita, e ela precisa estar escrita:** se `trocarVaga` recusar (vaga de destino cheia,
encerrada, ou a pessoa já viva lá), **a resolução falha e a divergência continua aberta**, com o
motivo em português na tela. Isso é fail-closed, é o comportamento certo, e é melhor do que a
alternativa.

**Quem pode resolver:** `trocarVaga` hoje é **MASTER e SUPER_ADMIN**. Duas opções:
- **Opção A**, a resolução inteira é de Master, herdando a régua de quem já pode trocar vaga.
- **Opção B**, "Manter A Plataforma" é do consultor (não muda dado nenhum) e "Aceitar A Fonte" é de
  Master (muda).
**Recomendação: Opção B.** A fila só anda se quem opera puder dizer "está certo aqui", que é o caso
majoritário pelo próprio conceito do diretor; e o que **escreve** continua no papel que já escreve
hoje. Fazer tudo Master transforma a fila numa fila do Master.

### 5.3 O que acontece com a divergência depois de resolvida

Reusar o padrão da **Fila De Entradas do Pandapé**, que já resolveu isto uma vez, com auditoria:
`desfecho` de enum fechado, `motivo` de enum fechado com CHECK, e **retenção com prazo**, contado de
`resolvido_em` para o que foi resolvido e de "sem movimento" para o que nunca foi. A lição daquele
desenho vale inteira aqui: **cobrir só o resolvido cria passivo que ninguém revisita.**

---

## 6. Ponto 6: Migrar Entre Vagas Convivendo Com A Fonte, E O Apito Infinito

**Esta é a peça que mais importa, e a OST está certa em apontá-la como a que mais facilmente quebra.**

### 6.1 O cenário, passo a passo

1. A fonte diz: fulano está na vaga Y.
2. O diretor move fulano na plataforma para a vaga X (`trocarVaga`, que **preserva a etapa** de
   propósito, e grava `vagaDe`/`vagaPara` em `as_candidatura_etapas`).
3. **A fonte continua dizendo Y**, para sempre, porque ninguém volta lá para corrigir. É o motivo
   declarado do diretor para a plataforma vencer.
4. O próximo ciclo compara, vê Y contra X, e **apita de novo**. E no próximo. E no próximo.

**Sem uma resposta a isto, a fila de divergências enche de uma decisão já tomada e o time para de
olhar para ela.** Uma fila que apita sempre é uma fila desligada.

### 6.2 As opções

**Opção A, Silenciar Por TEMPO (snooze).**
A divergência resolvida some por N dias e volta.
*Custo:* trivial.
*Risco:* **é a opção errada e está aqui só para ser descartada explicitamente.** Ela garante o apito
infinito, apenas mais devagar. Quem resolveu 200 divergências em março recebe as mesmas 200 em abril.

**Opção B, Silenciar Por VALOR (decisão fixada).**
A decisão guarda **o que a fonte estava dizendo quando foi decidida**. A divergência só **reabre** se
a fonte passar a dizer algo **diferente** daquilo.
*Custo:* uma coluna na decisão (`valor_fonte_decidido`) e uma comparação a mais no comparador.
*O comportamento:* a fonte repete Y para sempre e fica **calada para sempre**. A fonte muda para Z, e
aí **apita legitimamente**, porque é informação nova que ninguém julgou.
*Risco:* é preciso definir o que é "o valor" de cada tipo (para D1 é a vaga externa, para D2 a etapa
externa, para D3 a situação externa, para D6 o campo e um resumo do valor, **jamais o valor em si**,
§A.6). É trabalho de desenho, não de risco.

**Opção C, VÍNCULO Aceito Com Desvio (de/para por candidatura).**
Mais forte que B para o caso D1: registra-se que **a candidatura da plataforma corresponde à
candidatura externa da vaga Y**, e a vaga externa deixa de ser comparada para aquela candidatura. É um
de/para no nível da candidatura, não da vaga.
*Custo:* o de B, mais a noção de "identidade externa da candidatura", que **já existe**:
`as_candidaturas.id_match_pandape`, unique parcial, hoje dormente.
*Ganho que B sozinha não dá:* com o vínculo, **a etapa e a situação continuam sincronizando** para
aquela pessoa. Com B sozinha, a plataforma silencia a vaga e continua comparando etapa e situação, mas
não tem onde registrar que "a candidatura externa Y **é** esta candidatura daqui", e a próxima
movimentação da fonte pode tentar criar uma candidatura nova na vaga Y.
*Risco:* mais estrutura, e a estrutura tem de ser feita direito para não virar duas verdades.

### 6.3 Recomendação

**Opção B como mecanismo universal, mais a Opção C especializada em D1.**

**B** é o mecanismo geral, e ele resolve D2, D3 e D6 com a mesma régua e o mesmo código. **C** é o que
falta para D1, e a razão é precisa: no D1 o que se decidiu não foi só "a fonte está errada", foi
**"esta candidatura daqui É aquela candidatura de lá, na vaga errada"**. Sem essa segunda frase, o
próximo evento da fonte para a candidatura externa Y não sabe onde pousar e **cria uma segunda
candidatura**, na vaga Y, que é o duplicado que a plataforma existe para não ter. O vínculo é o que
faz a movimentação seguinte cair na candidatura certa, na vaga certa da plataforma.

**As duas garantias que a implementação NÃO pode perder:**

1. **O espelho continua sendo atualizado enquanto a divergência está silenciada.** Silêncio é da
   **fila**, nunca da **leitura**. Se o espelho parar de ser escrito, D4 ("sumiu da fonte") deixa de
   ser detectável para exatamente as pessoas sobre as quais alguém já tomou uma decisão, que são as
   que mais importam. É o mesmo tipo de cegueira do incidente da §A.33: nada falha, e o sistema para
   de enxergar.
2. **A decisão é por (entidade, tipo, fonte), e não por linha de divergência.** Guardar a decisão na
   linha e apagar a linha ao resolver faz a decisão morrer junto, e o próximo ciclo cria uma linha
   nova sem memória nenhuma. **A memória tem de sobreviver à linha que a originou.**

---

## 7. Ponto 7: Vaga Manual E O De/Para

### 7.1 O que existe hoje

`vagas.id_vacancy_pandape` (`tables.ts:2408`), `varchar(40)`, com **índice comum, não unique**, e o
comentário do schema diz por quê: a base histórica ainda vai ser importada e pode repetir código até
alguém revisar. **Zero linhas preenchidas em produção.**

**Não existe marcador de origem na vaga.** Não há coluna dizendo se a vaga nasceu aqui ou lá.

### 7.2 As opções de marcação

**Opção A, DERIVAR a origem da presença do id externo.**
"Tem `id_vacancy_pandape`, veio do Pandapé; não tem, é manual."
*Custo:* zero.
*Risco:* **confunde duas coisas diferentes**, e o de/para do ponto 7 é exatamente o momento em que
elas se separam. Uma vaga que nasceu manual e **depois** foi ligada à fonte passa a ter o id, e a
derivação passa a dizer que ela nasceu na fonte. A informação de que aquela vaga foi aberta por
indicação de cliente, fora de qualquer ATS, **some**, e é uma informação de negócio.

**Opção B, coluna `origem` na vaga (enum `MANUAL`/`PANDAPE`/`DIGAI`).**
*Custo:* uma migration numa tabela de 3 linhas.
*Risco:* quebra quando a mesma vaga existe nas **duas** fontes. E ela vai existir: o `partnerJobId` do
Digai ter o mesmo formato de `id_vacancy_pandape` é hipótese justamente porque as duas ferramentas
podem estar olhando a mesma vaga.

**Opção C, `origem` IMUTÁVEL mais IDENTIDADES EXTERNAS separadas.**
`origem` responde **onde a vaga nasceu**, é escrita na criação e **nunca muda**. As identidades
externas respondem **onde ela também aparece**, são N, e nascem do de/para.
*Custo:* a coluna mais a estrutura do ponto 8, que já é recomendada lá.
*Risco:* nenhum específico. As duas perguntas passam a ter resposta própria.

### 7.3 Recomendação

**Opção C.** "Onde nasceu" e "onde também aparece" são perguntas diferentes, e o de/para é o evento
que prova isso: ele acrescenta um lugar onde a vaga aparece **sem** mudar onde ela nasceu.

### 7.4 O de/para, quando a vaga manual aparece na fonte

A ação é **"Vincular À Fonte"**, na ficha da vaga, e ela tem quatro exigências:

1. **Papel de Master**, com trilha. É a ação que faz a vaga passar a receber movimentação externa.
2. **O id externo não pode já estar vinculado a outra vaga.** Isso é `unique (fonte, id_externo)` no
   banco, e não uma consulta: a consulta produz a frase em português, o unique é quem garante, e é o
   padrão que o dedup de CPF deste mesmo módulo já usa em duas camadas.
3. **O que já chegou daquela vaga externa e ficou ADIADO é REPROCESSADO no vínculo.** Aqui o
   precedente do Pandapé é a resposta inteira: o evento de vaga não mapeada (**D8**) já é guardado e
   reprocessável, e vincular é justamente o momento em que ele passa a resolver. **Sem isso o de/para
   liga o futuro e perde o passado**, que é a metade que interessa quando a vaga já rodou duas semanas
   na fonte antes de alguém notar.
4. **O vínculo é desfazível**, com trilha, e desfazer **não apaga** o que já entrou. As candidaturas
   que chegaram continuam onde estão, porque elas são da plataforma agora.

**Uma alternativa que NÃO recomendo, e digo por quê:** casar automaticamente a vaga manual com a da
fonte por semelhança (cliente mais cargo mais data). Casar vaga errada **move candidato de verdade
para a vaga errada**, e isso chega ao cliente. O vínculo é ato deliberado de gente, sempre.

---

## 8. Ponto 8: Os Dois Juntos, E A Estrutura De Identidade Externa

### 8.1 O que existe hoje

| Coluna | Onde | Estado |
|---|---|---|
| `as_candidatos.id_candidate_pandape` | pessoa | unique parcial, "reservado para a onda 4", **nada a alimenta** |
| `as_candidaturas.id_match_pandape` | candidatura | unique parcial, **nada a alimenta** |
| `vagas.id_vacancy_pandape` | vaga | índice comum, **zero linhas preenchidas** |

**Três colunas, uma fonte, e todas dormentes.** E o Digai precisa de pelo menos duas mais (`userId` na
pessoa, `partnerJobId` ou o id do screening na vaga), e a candidatura do Digai é o par
(screening, userId), que **não cabe numa coluna** sem concatenar duas coisas num campo, que é
exatamente como se perde a capacidade de consultar.

### 8.2 As opções

**Opção A, uma COLUNA POR FONTE.**
*Custo:* uma migration por fonte nova, N índices unique parciais, e **toda consulta de ingestão
precisa saber em qual coluna procurar**. A busca "esta pessoa já existe?" vira um `or` sobre N colunas.
*Risco:* cresce mal e de um jeito específico: a chave composta do Digai (screening mais userId) não
tem coluna natural, e a saída fácil (concatenar num varchar) mata a consulta por screening.
*Quando ela é a escolha certa:* quando as fontes são duas e param de crescer, e as chaves são
escalares. Não é o nosso caso.

**Opção B, tabela de IDENTIDADES EXTERNAS.**
Uma tabela: **fonte** (catálogo fechado), **tipo de entidade** (CANDIDATO / CANDIDATURA / VAGA), **id
da entidade interna**, **chave externa**, `visto_em`, `vinculado_em`, `vinculado_por`.
Unique em (fonte, tipo, chave externa): **um id externo aponta para uma entidade só.**
Índice em (tipo, entidade interna): "quais identidades esta pessoa tem".
*Custo:* uma tabela, uma migration que **move as três colunas dormentes** para ela, e um join a mais na
ingestão. **A migration custa quase nada HOJE**, com 3 vagas, 3 pessoas e 3 candidaturas, e **zero**
valores preenchidos nas três colunas. Depois da primeira varredura ela custa backfill de dado pessoal.
*Ganho:* é **a mesma estrutura** que resolve o de/para do ponto 7, que resolve a chave composta do
Digai (a chave externa é texto, e o formato é da fonte) e que resolve a fusão do ponto 2 (fundir passa
a ser repontar identidades). Três problemas, uma tabela.
*Risco:* o join a mais na ingestão. Custo desprezível com o unique certo.

**Opção C, HÍBRIDA: manter as colunas e criar a tabela só para as fontes novas.**
*Custo:* aparentemente menor, porque não mexe no que existe.
*Risco:* **duas verdades sobre a mesma pergunta**, e é o pior desfecho possível. "Quem é esta pessoa
no ATS" passa a ter dois lugares, e o dia em que um for atualizado e o outro não é o dia em que a
ingestão cria a pessoa duplicada. O repositório já documentou esse tipo de defeito: a régua de quem
consome posição estava escrita quatro vezes e "as quatro concordavam por COINCIDÊNCIA, não por
construção".

### 8.3 Recomendação

**Opção B, e o momento é AGORA justamente porque as colunas estão dormentes.** Esta é a recomendação
com o argumento mais medido do documento: as três colunas têm **zero valores** em produção, então
migrar é escrever a migration e apagar as colunas. Cada dia depois da ingestão ligar, o mesmo trabalho
passa a carregar backfill de dado pessoal, e backfill de dado pessoal é onde os erros custam LGPD.

**E ela PREPARA a dedup Digai x Pandapé sem construí-la** (que é o que a OST pede, e o limite que o
diretor definiu): com a tabela, uma pessoa que tem identidade nas duas fontes é **uma linha de
`as_candidatos` com duas identidades**, e isso **não exige saber a chave de casamento**. Quando o Ivan
confirmar a chave, o que entra é a **régua de casamento**, não a estrutura. Se o Ivan disser que não há
chave, a estrutura continua correta e a pessoa continua com uma identidade por fonte.

**O que este desenho NÃO faz, de propósito:** não propõe nenhuma régua de casamento Digai x Pandapé,
não propõe fusão automática e não usa `partnerJobId` como chave. **`partnerJobId` é hipótese não
provada e hoje inverificável**, e usá-la como chave de casamento seria inventar vínculo, que é
exatamente o que a §A.5 recusou fazer com `cod_cliente`.

---

## 9. O Que Sobe Antes Do Quê

Sem prazos, que não são do arquiteto. Só a ordem que a dependência técnica impõe:

1. **Identidades externas** (ponto 8). Tudo o mais escreve nela, e ela é a única peça que **fica mais
   cara a cada dia** que a ingestão não liga.
2. **Espelho da fonte mais comparador** (ponto 3), com o comparador como **função pura**, que é o que
   permite o `tester` entrar **junto com a construção** e não depois (§A.40).
3. **A fila e a tela de resolução** (ponto 4), reusando a forma da Fila De Entradas.
4. **A memória da decisão** (ponto 6). **Ela não pode subir depois da fila**: uma fila sem memória de
   decisão apita infinito no primeiro ciclo e queima a confiança do time na tela.
5. **Origem da vaga e o Vincular À Fonte** (ponto 7).
6. **Os indicadores de N processos** (ponto 1). Independem de tudo acima e podem ir em paralelo.
7. **A oferta de duplicidade** (ponto 2, mundo B), **só depois do Ivan**.

**Paralelismo real:** o ponto 1 não depende de nada e pode ser despachado junto com o ponto 8. O
comparador (pura) pode ser testado antes de existir ingestão. O resto é serial pela dependência de
dados.

**Ponto de acionamento de segurança (§A.38), e são quatro:** a ingestão escreve **CPF e dado pessoal**
vindos de terceiro; o espelho guarda dado de fonte externa e é **onde o payload entra por descuido**
(a mesma proibição nominal de `pandape_entrada` vale aqui); a **retenção** muda de comportamento
quando `origem` passa a ser escrito pelo sistema (§3.5); e a **fusão** do ponto 2 junta dado pessoal de
duas pessoas. **O mapa deve passar pelo `seguranca` ANTES do primeiro despacho** (§A.40, regra 1), e
não só no fim.

---

## 10. Perguntas Que Só O Diretor Responde

1. **A tag "em N processos" conta as VIVAS ou o total histórico?** (Recomendação: vivas na linha,
   total na ficha.)
2. **A contagem por vaga fica no cabeçalho do funil, ou também vira KPI clicável como filtro** no
   padrão da §A.12? A OST não pediu KPI, e a §A.31 me impede de acrescentar.
3. **Quem resolve divergência: só Master, ou o consultor pode "Manter A Plataforma" e só o Master pode
   "Aceitar A Fonte"?** (Recomendação: o segundo.)
4. **"Decidir Depois" existe?** Ele é útil e é a porta natural do apito infinito voltar por outro
   caminho.
5. **Divergência de dado pessoal (D6) vai para a mesma fila das outras, ou para uma fila à parte?**
   Ela é a única que expõe dado pessoal no modal.
6. **Qual o prazo de retenção da divergência resolvida?** A Fila De Entradas usa 30 dias para as duas
   classes de linha. Manter 30 aqui?
7. **A divergência vira MENU próprio ou contador dentro de tela existente?** (Recomendação: contador
   mais tela. Menu novo nasce só para o SUPER_ADMIN, §A.23, e quem libera é você.)
8. **"Aceitar A Fonte" pode falhar** quando a vaga de destino está cheia ou encerrada. Confirma que o
   certo é **recusar e manter a divergência aberta**, em vez de forçar?
9. **Desfazer o vínculo de uma vaga manual com a fonte é permitido?** E o que acontece com o que já
   entrou por ele? (Recomendação: permitido, com trilha, e o que entrou fica.)
10. **`as_candidatos.origem` passa a ser imutável e escrita pelo sistema, com "banco de talentos"
    virando decisão própria, com papel e trilha?** Hoje um formulário sem papel decide retenção de
    dado pessoal. **É proposta, §A.31, e depende de você.**
11. **A dedup Digai x Pandapé continua segurada** até o Ivan responder? Este desenho assume que sim e
    só prepara a estrutura.
12. **Vaga manual pode existir sem cliente?** A vaga do Digai **não tem cliente**, então a vaga
    espelhada dele nasce sem. `vagas.cod_cliente` já é nulável, e a régua de publicação é quem cobra.

---

## 11. O Que Precisa De Reconexão Ao Digai Para Confirmar

O token foi expurgado. Cada reconexão abaixo responde **uma** pergunta, e o que ela desbloqueia está
dito. Nenhuma delas bloqueia o desenho; elas bloqueiam **a execução** de peças específicas.

| # | A pergunta | Como se responde | O que ela desbloqueia |
|---|---|---|---|
| R1 | **Existe webhook de "candidato finalizou"?** | Perguntar ao **Ivan**. A doc pública não lista os eventos e as páginas de detalhe dão 404. Por decisão do `seguranca`, **não** lemos os listeners: a listagem pode trazer segredo de assinatura de terceiro | Decide **polling contra webhook**. Com polling, a cadência do ciclo vira decisão de projeto e o rate limit entra na conta |
| R2 | **O mesmo humano aparece com DOIS `userId` no Digai?** | Comparar e-mail e telefone entre os 12.445 registros distintos da varredura, sem trazer o dado para fora | Dimensiona o **mundo B do ponto 2**. Se for ~zero, a Opção A basta e a fusão pode ficar guardada |
| R3 | **`partnerJobId` casa com `id_vacancy_pandape`?** | **Hoje é inverificável**: o alvo está vazio em 3 de 3 vagas. Só responde depois de a Central de Vagas ter vagas com o id do Pandapé preenchido, e aí é um `join` de uma linha | Decide se a vaga é **a mesma entidade** nas duas fontes ou duas vagas espelhadas. Muda a tela, não a estrutura (a Opção B do ponto 8 aguenta as duas) |
| R4 | **A reconsulta por `userId` continua respondendo depois de a pessoa finalizar?** | Já medido e **confirmado** (HTTP 200, mesmo candidato). Reconfirmar só se a API mudar | É o que faz o **enriquecimento de CPF** do ponto 2 funcionar. Já respondida, listada para não ser reaberta |
| R5 | **O screening tem estado de "encerrado" ou ele só some?** | Uma varredura curta comparando a lista de screenings de duas datas | Define a detecção de **D5 (vaga sumiu da fonte)**: se houver estado, é leitura; se não houver, é ausência, e aí **o `visto_em` do espelho é a única detecção possível**, o que reforça a Opção B do ponto 4 |
| R6 | **A situação do candidato no Digai é legível?** | Medido e **negativo**: `approvalStatus` e `hasApproved` são nulos em 100%, e `documentRequestStatus` é `NOT_REQUESTED` em 100%. Ninguém é aprovado formalmente por lá | **D3 (situação diferente) provavelmente NÃO existe para o Digai**, e existe só para o Pandapé. Confirmar com o Ivan antes de construir o tipo para os dois |

**A reportar ao Ivan, e não é pergunta:** o host `api.hiring.digai.ai` da documentação está com
**certificado quebrado** (`CN=digai.ai` com SAN `*.digai.ai`, e `api.hiring` são dois rótulos). O host
correto é `api-screening.digai.ai`. Desativar a verificação de TLS está **vetado** e a proibição já é
teste no código.

---

## 12. Ressalvas Do Arquiteto

1. **Não desenhei o ponto 5**, porque ele não foi despachado.
2. **Não uso `partnerJobId` como chave de casamento** em lugar nenhum. É hipótese não provada, e
   inventar vínculo é o que a §A.5 recusou fazer.
3. **Não reproduzo a lista de quem consome posição.** Pergunte a `consomePosicao`
   (`packages/shared-types/src/index.ts:2770`), que é a fonte única, pelo motivo que o comentário dela
   explica: a régua já esteve escrita quatro vezes.
4. **`shared-types` é arquivo único e tem dono único: o coordenador** (§A.39). Nada do vocabulário
   novo deste desenho deve ser escrito por um agente de camada.
5. **Nenhum número deste documento foi deduzido.** Os do Digai vêm da varredura de 16/09
   (`DIARIO.md:15815`), os da base vêm da medição do coordenador, e os do código vêm da leitura dos
   arquivos citados com linha.
