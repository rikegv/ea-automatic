# Central de Vagas: consolidacao das vagas gemeas

Executado em 07/10/2026, contra o banco de PRODUCAO. Operacao irreversivel, com backup previo.
Autorizacao do diretor na OST "CONSOLIDAR AS GEMEAS. SOBREVIVE A COMPLETA, A VAZIA SOME".

Backup: `/home/henrique/ea-backups/vagas-consolidacao-20261007-184048.sql.gz` (6,3 MB, `gzip -t`
OK). Guardado FORA do repositorio porque contem PII e `.backups/` NAO estava gitignored (§A.6).

---

## 1. O universo real: 16 grupos de mesmo codigo, em TRES classes

O pedido falava de 9 pares. Varrendo por `codigo`, como o diretor mandou, aparecem 16 grupos, e
so uma das classes e de gemeas:

| classe | grupos | vagas | assinatura | veredito |
|---|---|---|---|---|
| A, legitima grande | 1 (`332225`) | 30 | todas com numero, numeros distintos | nao tocar |
| B, legitima par | 6 | 12 | ambas com numero PROPRIO e diferente | nao tocar |
| C, gemeas | 9 | 18 | uma com numero, uma sem | o alvo |

A classe B (2655079, 2703912, 3119663, 3403161, 3430550, 3576100) seria destruida por uma leitura
mecanica da regra. Cada linha tem `id_vacancy_pandape` proprio (2655079 = 3281893 e 3498372), ou
seja o Pandape afirma que sao duas vagas distintas, e o overlap de pessoas NAO e 100% (3119663
tem 0 e 149 candidaturas, interseccao vazia). Aplicar a consolidacao nelas apagaria vaga real com
149, 221 e 1.667 candidaturas.

## 2. A premissa do pedido estava errada em dois pontos

**"A vaga vazia, com os candidatos ja na completa, apaga de vez."** Nenhuma das duas estava
vazia. Em 6 dos 9 pares AS DUAS tinham candidaturas, e em 3 pares (3772362, 3773807, 3778954)
quem tinha o CLIENTE era o lado com MENOS candidatos.

**"Sobrevive a completa, que herda o numero."** O overlap direcional inverte a direcao:

| codigo | pessoas no lado com numero | no lado sem numero | so no lado SEM numero | so no lado COM numero |
|---|---|---|---|---|
| 2161521 | 7 | 6 | 0 | 1 |
| 3589738 | 70 | 69 | 0 | 1 |
| 3703768 | 298 | 278 | 0 | 20 |
| 3772362 | 31 | 21 | 0 | 10 |
| 3773807 | 321 | 241 | 0 | **80** |
| 3778954 | 124 | 89 | 0 | **35** |
| 3781368 | 1 | 0 | 0 | 1 |

O lado SEM numero e **subconjunto estrito** nos nove. Logo apagar ele nao perde ninguem, e
apagar o lado COM numero perderia 80 pessoas so no 3773807. Quem sobrevive tem de ser o lado com
numero, absorvendo o que o outro tiver, e nao o contrario.

## 3. O que foi feito: 4 pares, dedup sem absorcao

Consolidados: **3589738, 3772362, 3773807, 3778954**.

| codigo | antes | depois | duplicatas removidas |
|---|---|---|---|
| 3589738 | 2 vagas, 70 + 69 cands | 1 vaga com numero, 70 cands / 70 pessoas | 69 |
| 3772362 | 2 vagas, 31 + 21 | 1 vaga com numero, 31 / 31 | 21 |
| 3773807 | 2 vagas, 321 + 241 | 1 vaga com numero, 321 / 321 | 241 |
| 3778954 | 2 vagas, 124 + 89 | 1 vaga com numero, 124 / 124 | 89 |

**Invariante do diretor, cumprida e medida:** 852 pessoas distintas nos 9 codigos antes, **852
depois**. Candidaturas nos 9 codigos: 1.556 para 1.136, **menos 420**, que e exatamente o numero
de duplicatas. `candidaturas = pessoas` nas quatro sobreviventes, ou seja zero duplicata residual.

Na fila de revisao, vagas sem numero cairam de **5 para 1**.

A base inteira moveu mais do que isso porque a varredura escrevia em paralelo: nos 20 minutos da
operacao ela criou 2 vagas, 11 candidatos e 16 candidaturas. Por isso a base fechou em -2 vagas e
-407 candidaturas, e nao -4 e -420. A medida controlada do efeito e o censo dos 9 codigos.

### Nao foi absorvido NENHUM campo, e o motivo e medicao

A regra pedia absorver cliente, cargo, salario e datas. Medida a procedencia (`*_origem`), a
absorcao nao tinha o que ganhar de legitimo:

- 3589738 e 3772362: a sobrevivente **ja tinha** natureza, linha de servico e datas, todas
  marcadas `PLANILHA`. A doadora **nao tinha procedencia em nada**.
- 3778954: a sobrevivente tem datas `PLANILHA` de maio; a doadora tem julho a outubro **sem
  procedencia**. A regra "nunca sobrescrever nao-nulo" manteria maio de qualquer jeito.
- 3773807: unico caso com bloco de dado na doadora, e e exatamente o bloco sem procedencia.

E o cliente foi **vetado pelo `seguranca`** com a medicao que fecha o caso: os tres valores
(51936, 56842, 56196) sao **3 das unicas 4 linhas de toda a producao** com `cod_cliente`
preenchido e **zero trilha** (sem evento de status, sem correcao de cliente). Nasceram no mesmo
minuto em que as gemeas nasceram: a procedencia daquele cliente e o proprio defeito. Como
`cod_cliente` NAO tem coluna de procedencia, copiar faria a proxima liberacao gravar
`Procedencia do cliente: ESCOLHIDO` na trilha permanente, afirmando escolha humana que nunca
houve. Os valores estao preservados no backup e aqui, entao a decisao do diretor segue executavel.

### A reconciliacao nao se perdeu

As 2 divergencias presas na doadora do 3589738 eram de escopo CANDIDATURA e morreriam por
cascade. Foram **reapontadas** para a candidatura da mesma pessoa na sobrevivente e carimbadas
`ADOTADO_ATS` (a sobrevivente ja estava em TRIAGEM, que era o valor que o ATS reportava),
preservando as 146 ocorrencias de cada uma na fila de reconciliacao.

## 4. O que ficou de fora, e por que

| codigo | motivo |
|---|---|
| 2161521, 3703768, 3784372 | decisao do diretor na OST |
| **3781129, 3781368** | **VETO do `seguranca`** |

O veto: as **duas metades** de cada um foram liberadas pela mesma pessoa **hoje, 18:21 a 18:23**,
com autor e trilha. No 3781368 os dois clientes sao **ambos confirmados por humano** e **se
contradizem** (57492 na sobrevivente, 56868 na outra), 45 segundos de distancia. Nao e palpite
contra confirmado: sao duas decisoes humanas incompativeis, e apagar uma delas sem perguntar qual
vale e decisao de gente. E o mesmo critério pelo qual o diretor tirou o 2161521 do lote.

## 5. Guarda de concorrencia: a operacao foi segura POR CONSTRUCAO

A consultora estava liberando essa mesma fila durante a operacao (eventos de 17:45 a 18:29, uma
vaga a cada 1 a 3 minutos). A transacao trava as duas linhas (`for update`) e **pula o par**, sem
abortar os outros, se qualquer lado tiver ganhado evento humano, saido do papel REVISAO, ficado
recusado, ou se a invariante de gente deixar de valer. Nenhum par foi pulado, porque os 4 tinham
zero evento humano nos dois lados, mas a seguranca nao dependeu disso: dependeu da guarda.

## 6. A causa raiz: o que ela era, e o que FALTA

**A premissa de que "o cano ja esta tapado" estava errada.** A varredura casava a vaga existente
**so** por `id_vacancy_pandape` (`ingestao-repositorio.ts`, a busca por volta da linha 784). Nao
havia nenhuma adocao por codigo. Vaga com codigo X e numero nulo, mais varredura vendo o numero Y
com codigo X, dava gemea nova.

**Construido nesta frente:** `adotarVagaSemIdentidade`. Nao achando pelo numero, procura vaga de
mesmo codigo com numero NULO, nao recusada, e adota (grava so o numero) **quando houver
exatamente UMA** candidata. Com zero, duas ou mais, abstem-se e segue criando.

**NAO ESTA EM PRODUCAO.** Medido no `dist` servido: zero ocorrencia. O codigo esta no working
tree, nao commitado. O risco pratico hoje e baixo: as 5 vagas sem numero que restam tem o codigo
ja reivindicado por uma vaga com numero, entao a varredura casa pelo numero e nao chega no caminho
de criar. Gemea nova so nasce se uma carga criar vaga sem numero de novo.

### Duas decisoes tecnicas que a auditoria levantou

**1. Adotar vaga que uma PESSOA ja liberou: decidido NAO.** O `seguranca` e o `tester` chegaram a
isso de forma independente, e com o mesmo fundamento. A adocao grava, junto, a matricula da
varredura com `ultimo_insert_date` e `encerrada_pela_varredura_em` nulos, e a partir dali a vaga
que alguem liberou passa a ser alcancavel pelo refresh do ATS, pelo encerramento automatico e pela
reabertura. E troca de regime sem autor e sem trilha. Decisao: exigir papel REVISAO (pela regua,
nunca por literal). **4 dos 9 pares** tinham o lado sem numero ABERTA, entao o caso e real.

**2. Indice unique parcial em `id_vacancy_pandape`: PROPOSTO, nao construido.** O `tester`
provou que a adocao e um compare-and-swap correto (nao ha escrita dupla), mas que na corrida a
volta PERDEDORA cai no caminho de criar e faz a gemea, e o indice atual nao e unique. Hoje o que
segura e so o `concurrency: 1` da fila, que e propriedade da fila e nao da regra. Medido: **540
vagas com numero e 540 numeros distintos, zero duplicata**, entao o indice unique parcial e
possivel agora e tornaria a gemea impossivel no banco.

**Por que nao foi construido:** `id_vacancy_pandape` tambem e DIGITADO por gente na trilha da
vaga. Um indice unique transformaria o erro de digitacao de um numero repetido em erro de banco
numa tela validada, o que e §A.26 (mexeu em codigo validado, pergunta antes). O conserto completo
precisa do indice **mais** tratamento amigavel da violacao nos dois caminhos. Decisao do diretor.

## 7. Correcoes de premissa registradas

1. `cod_cliente` **nao tem** coluna de procedencia (`cod_cliente_origem` e `cargo_id_origem` nao
   existem). As colunas reais sao `cargo_origem`, `natureza_origem`, `data_abertura_origem`,
   `data_limite_origem`, `linha_servico_origem`, `cliente_proposto_origem`.
2. O "Posicao 1 / Candidato 18" (`3481741`) **nao e gemea**: e vaga unica, COM numero (3597104).
   O que falta nela e cliente. Na fila de revisao, **459 de 463 vagas estao sem cliente** e so 5
   estavam sem numero: o "sem identificacao" e, na esmagadora maioria, falta de cliente.
3. O endurecimento da varredura **nao estava construido** quando a OST afirmou que estava.
