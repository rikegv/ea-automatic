# Desenho: o GATILHO DA AUDITORIA passa a enviar de verdade (05/10/2026)

Decisao do diretor, nesta OST: **o caminho principal e AUTOMATICO, no fechamento da auditoria /
entrega do candidato**. O clique manual de Master fica como alternativa. Mapa de alcance do
coordenador ANTES de despachar (§A.27 / §A.39 passo 1 / §A.40 regra 1).

## 0. DUAS DECISOES DO DIRETOR, REGISTRADAS COMO RESOLVIDAS. Nao reabrir.

1. **IDEMPOTENCIA: a trava e do GI, por CPF, e nao a nossa marca.** A fabrica so nao a enxerga porque
   le a fachada (a pre-admissao via API) e nao o quintal (a folha, que responde **403**). Mesmo que
   `gi_enviado_em` desapareca com o expurgo em 30 dias, o GI recusa o CPF duplicado. **Nao mexer no
   expurgo, nao construir idempotencia nova.** Auditoria futura que levantar isso tem a resposta aqui.
2. **ENVIAR MAGRO NAO E PROBLEMA.** Se o documento e obrigatorio, a **auditoria nao libera** a
   admissao sem ele; se nao e obrigatorio para aquele cliente, sai sem e esta certo. E o RG agora e
   **auditado no Portal do Candidato**. A regua documental por cliente **ja resolve**. **Nao criar
   regua de documento nova para o GI.**

## 1. A MEDICAO QUE DECIDE O RECORTE, e ela desarma o receio

Rodei `montarContratacaoGi` + `recusaDaContratacaoGi` do **dist servido** sobre **as 3052 admissoes
da base**, com os 127 pares do `.env` de producao.

| | |
|---|---|
| admissoes na base | **3052** |
| passariam as guardas do passo 6 | **3** (todas `EM_ADMISSAO`) |
| concluidas / declinios / rescisoes que passariam | **ZERO** |
| alcancadas pelo runner em lote (`drive_pasta_url` nulo) | **1** |
| linhas em `admissao_dados_gi` em producao | **0** |

**O que segura o historico e `GI_SALARIO_SEM_UNIDADE`:** a carga nunca declarou `salario_unidade`
(coluna da 0140), entao as 2000 concluidas, os 903 declinios e as 55 rescisoes **recusam por salario**,
nao por farol. **Isso e carga-portante e frageis:** no dia em que alguem fizer backfill de
`salario_unidade` no historico, a exposicao salta de 3 para milhares. Fica registrado como risco, nao
como bloqueio.

## 2. O PROBLEMA REAL DE DESENHO: `aplicarPosVeredito` tem OITO chamadores, dois automaticos

O gatilho vive em `auditoria.service.ts:688`, dentro de `if (progresso.completa)`. Quem chama o metodo
que o contem: veredito da IA, validacao humana, descarte de documento, coleta de VT (scheduler), tela
de Diagnostico, **reconciliacao do Drive** (timer de 10 min, mais disparo sob demanda pela tela, piso
de 5 min, usuario `sistema@ea.local` papel **SUPER_ADMIN**) e o runner **`db/rearquiva-drive.ts`**, que
**laca sobre TODA admissao** com `drive_pasta_url` nulo (**2558 hoje**).

**A regua `progresso.completa` e um ESTADO, nao um EVENTO.** Uma vez completa, ela e verdadeira para
sempre. Se o envio disparar no ESTADO, qualquer um dos oito chamadores re-disparando sobre uma admissao
ja completa manda a pessoa de novo, e o runner em lote manda **todas as completas de uma vez**.

## 3. A DECISAO DE DESENHO: o gatilho e a TRANSICAO, nao o estado

**O envio dispara quando a regua FECHA NESTA CHAMADA**, ou seja, quando ela estava incompleta antes e
ficou completa agora. E essa a leitura fiel do que o diretor pediu: "a auditoria realizada no momento
da entrega do candidato". O momento e um **evento**.

Consequencias, e sao as que importam:
- o runner em lote sobre admissao **ja completa** nao dispara nada, porque nao houve transicao;
- o timer de 10 min nao dispara nada pelo mesmo motivo;
- o fechamento real da auditoria de um candidato **dispara**, que e o pedido;
- o clique manual de Master continua existindo como alternativa, inalterado.

**Como a transicao e detectada, e aqui esta a chave da implementacao.** Eu procurei um sinal que ja
existisse e **ACHEI O PONTO, mas ele NAO serve como esta**:

`aplicarPosVeredito` chama `autoConcluirAuditoria` dentro do `if (progresso.completa)`
(`auditoria.service.ts:665`) e recebe `auditoriaAuto`. **Esse objeto NAO distingue transicao de
estado**, porque `autoConcluirAuditoria` tem um early-return idempotente
(`auditoria.service.ts:1063-1066`, comentario "Ja concluida -> nada a fazer (idempotente)") que
devolve **a mesma forma** `{ status, gateAberto }` de quando a frente acabou de fechar.

**Logo o conserto e cirurgico e mora exatamente ali:** `autoConcluirAuditoria` passa a reportar se
**transicionou de fato** (o ramo do early-return reporta `false`; o ramo que grava reporta `true`), e
o gatilho do GI so dispara quando esse sinal for `true`. **Nao precisa de coluna nova no banco**: a
informacao existe dentro da chamada, so nao e devolvida.

## 3.1 A PROVA DE QUE O GATE DE TRANSICAO IMPORTA, no caso concreto das tres

Medido no banco de producao em 05/10/2026, para as **tres** que passam as guardas:

| candidata | obrigatorios pendentes | frente AUDITORIA | concluida | com gate de ESTADO | com gate de TRANSICAO |
|---|---|---|---|---|---|
| Allan Douglas Giovanini | 3 de 15 | `ANALISE_PENDENTE` | nao | nao envia ainda | nao envia ainda |
| **Sonia Regina Wingeter** | 4 de 11, nenhum obrigatorio | **`ANALISE_OK`** | **SIM** | **ENVIA NA HORA** | **NAO envia** |
| Stefany Gabriele Strobi Alves | 0 de 1 | `ANALISE_PENDENTE` | nao | nao envia ainda | nao envia ainda |

**A Sonia e o caso que decide o desenho.** A frente dela **ja esta concluida**. Com o gate de ESTADO,
o proximo `aplicarPosVeredito` que passar por ela (o timer de 10 min, a tela de Diagnostico, o runner)
manda a pessoa para a folha **sem que nada tenha acontecido na vida real**. Com o gate de TRANSICAO,
ela nao e enviada, porque nao houve fechamento nesta chamada.

**CONSEQUENCIA PARA O ARMAMENTO:** armar com o gate de transicao tem **efeito imediato zero sobre
estas tres**. O primeiro envio real acontece quando uma auditoria fechar de verdade.

## 3.2 ERRO MEU, DERRUBADO PELA AUDITORIA: o gate de transicao NAO basta sozinho

Eu escrevi, na secao 3, que "o runner em lote sobre admissao **ja completa** nao dispara nada, porque
nao houve transicao". **E FALSO, e o `seguranca` provou com medicao.** Eu confundi **regua ja
completa** com **frente ja concluida**, e sao coisas diferentes.

**O caso real:** existem admissoes com a **regua obrigatoria COMPLETA** e a frente AUDITORIA
**`concluida = false`**. Nelas, o runner chama o pos-veredito, `progresso.completa` e `true`,
`autoConcluirAuditoria` encontra `concluida = false` e **ESCREVE**. Isso **E** a transicao pela minha
propria definicao, e o envio dispara.

| medicao | resultado |
|---|---|
| pela regua REAL (`regua-completude.service`), auditoria do `seguranca` | **2** linhas: 1 `DECLINOU` + 1 `RESCISAO` |
| pelo meu criterio mais frouxo (todos os documentos ENTREGUE), conferido por mim | **3** linhas: 2 `DECLINOU` + 1 `RESCISAO` |
| com `drive_pasta_url` nulo, logo DENTRO das candidatas do runner | **todas** |

O runner `db/rearquiva-drive.ts:62` seleciona por `isNull(drivePastaUrl)` **sem filtro de farol**, e
`autoConcluirAuditoria` **nao tem guarda de farol nenhuma**. O timer de 10 min nao as alcanca (ele
filtra farol vivo), **o runner alcanca**. O que as segura hoje e uma coluna de salario vazia.

**LOGO A EXCLUSAO POR FAROL DEIXA DE SER PROPOSTA E PASSA A SER CONDICAO.** A secao 5 dizia
"proponho, nao construo"; o `seguranca` **exige**, e eu concordo: sem ela, dois passos que ja existem
(declarar a unidade do salario no Gerenciador, que `admissoes.service.ts:3634` permite de proposito
**inclusive para declinada**, e rodar o runner) mandam um declinado para a folha de um terceiro, em
silencio. Familia da §A.33.

**A lista e DERIVADA de `FAROIS_VIVOS`**, nunca literal nova, porque a base tem dois farois que nem
eu nem a minha proposta tinhamos considerado: `AGUARDANDO_LIBERACAO` (7) e `LIBERACAO_RECUSADA` (16).

## 3.3 A DETECCAO TEM DE SER ATOMICA, nao ler-antes

O `seguranca` tambem derrubou o **como**. Ler `concluida` antes e escrever depois nao serve: a leitura
em `autoConcluirAuditoria:1042` acontece **fora** da transacao, sem `FOR UPDATE`, e o unique
`(admissao_id, tipo)` nao protege a coluna. O sinal correto e o **`rowCount` de um UPDATE
CONDICIONAL** (`SET concluida = true WHERE id = ? AND concluida = false`) **dentro** da transacao:
`rowCount === 1` e a transicao, atomica e exatamente-uma-vez.

**E a transicao REPETIDA e real, nao teorica:** medido, **11** frentes tiveram dois eventos
`AUDITORIA -> ANALISE_OK` sem reversao, com intervalos de 3 minutos a 27 dias (o caminho
`recuarAuditoria`: fecha, recua, fecha de novo). Zero pares em menos de 5s, entao corrida nao aparece
nos dados, mas esta estruturalmente desprotegida. O UPDATE condicional resolve as duas.

## 3.4 O OUTRO LADO DO MESMO FURO, achado pelo `tester`: o gate de transicao SUB-dispara

O gate de transicao **sobre-disparava** (declinio, secao 3.2) e **SUB-dispara** tambem. E decisao do
diretor, nao da fabrica.

**O caminho:** o **aceite da Esteira** (regra 8 do §A.3) permite **concluir a Auditoria com N
documentos obrigatorios pendentes**, mediante aceite explicito e log permanente
(`esteira.service.ts:1174-1181`, `reason: "auditoriaIncompleta"`). Nesse caminho a frente vai a
`concluida = true` **com a regua INCOMPLETA**.

**A consequencia, e ela e silenciosa:** quando os documentos chegam depois e a regua fecha de
verdade, o pos-veredito encontra a frente **ja concluida**. Zero transicao, **zero envio, nunca**. A
pessoa cuja auditoria foi entregue com aceite (que e justamente o caso de pressa) **jamais e enviada
automaticamente**, e ninguem e avisado. So o clique manual salva.

**Medido por mim em producao (criterio frouxo: qualquer documento nao ENTREGUE, logo o numero real de
"obrigatorio pendente" e MENOR ou igual):**

| | |
|---|---|
| admissoes **VIVAS** com AUDITORIA `concluida = true` e documento nao entregue | **26** |
| idem na base inteira | **418** |

**A ESCOLHA E DO DIRETOR, e sao duas:**
1. **Aceitar** que o aceite da Esteira desliga o automatico naquela admissao, e ela sai pelo **botao
   manual**. Custo zero de construcao; custo operacional de alguem lembrar.
2. **Mudar o gate para a transicao da REGUA** em vez da transicao da frente. Isso exige **persistir o
   estado anterior da regua**, ou seja **coluna nova**, e e frente propria.

**Nao travei nenhuma das duas em teste**, de proposito, para nao congelar em codigo uma escolha que
nao foi feita.

## 4. O QUE NAO MUDA, e e deliberado

- As **seis** recusas do passo 6 continuam inteiras (`GI_SEM_EMPRESA_FILIAL`,
  `GI_PAR_EMPRESA_FILIAL_DESCONHECIDO`, `GI_SALARIO_INVALIDO`, `GI_SALARIO_SEM_UNIDADE`,
  `GI_SALARIO_HORISTA_SEM_JORNADA`, `GI_CLIENTE_NAO_RESOLVIDO`).
- A idempotencia `jaEnviado` continua como esta (decisao 0.1).
- A flag `GI_DISPARO_ARMADO` continua sendo a chave: com ela desligada, o automatico **monta e para**.
- O envio **nunca derruba a auditoria**: falha de envio e ERRO no log, sem PII, e o pos-veredito segue.
  Auditoria nao pode quebrar por causa do GI.

## 5. PROPOSTA que NAO estou construindo sem aval (§A.31)

**Excluir por farol** (`DECLINOU`, `RESCISAO`, `ADMISSAO_CONCLUIDA`) antes de enviar. Hoje e
redundante, porque **zero** desses passa as guardas (secao 1), e a §A.16 ja manda declinio nunca entrar
em fila operacional. Seria cinto e suspensorio contra o backfill de `salario_unidade` da secao 1.
**Proponho, nao construo.**

## 6. QUEM MAIS ESCREVE/LE O QUE VAI SER MEXIDO (§A.40 regra 3)

| ponto | quem le/escreve | risco |
|---|---|---|
| `EnviarParaGiService.enviar` | so `auditoria.service.ts:688` | e a porta que vai deixar de ser stub |
| `executarGatilhoGi` (funcao pura) | so o servico acima | hoje retorna sempre nao-enviado |
| `aplicarPosVeredito` | **oito** chamadores (secao 2) | e por isso que o gate e transicao |
| `admissao_dados_gi.gi_enviado_em` | `jaEnviado`, `marcarEnviado`, o expurgo | nao mexer (decisao 0.1) |
| `GI_DISPARO_ARMADO` | `enviarManual` e, agora, o automatico | armar e o ultimo passo |
