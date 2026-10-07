# Mapa de alcance: o dedup do Digai, e quais chaves servem

Medido em 02/10/2026 contra a producao. Investigacao do coordenador antes do despacho
(§A.39 passo 1, §A.40 regra 1). **Falso positivo e PIOR que duplicata**, e e esse o criterio que
ordena tudo abaixo: fundir duas pessoas diferentes e irreversivel.

## O dedup de hoje, nas duas ingestoes

| ingestao | chave primaria | desempate | usa e-mail? |
|---|---|---|---|
| **Digai** (`digai-repositorio.ts`) | `userId` do Digai (`as_identidades_externas`) | **CPF** (`candidatoPorDocumento`) | **nao**, so GRAVA |
| **Pandape** (`ingestao-ciclo.ts`, `resolverPessoa`) | identidade externa do Pandape | **CPF** | **nao** |

Nenhuma das duas casa por e-mail, telefone ou nome. O Digai **nao tem nenhuma** identidade
gravada ainda (`origem = DIGAI` em `as_candidatos`: **zero**), entao hoje a unica chave viva dele
seria o CPF.

## O problema, medido na API inteira (27.898 pessoas, 732 requisicoes, zero sinal de cota)

| | pessoas |
|---|---|
| total no Digai | **27.898** |
| com CPF valido | 4.577 |
| **sem CPF** | **23.321 (84%)** |
| **ja estao na plataforma** | **22.981 (82%)** |
| casa por CPF (o dedup PEGA) | 3.924 |
| **casa so por e-mail (o dedup NAO pega)** | **19.031** |
| casa so por nome + vaga | 26 |
| novos de verdade | 4.917 |

**Ligar com a regua nova hoje criaria 18.722 fichas duplicadas** de gente que ja esta la.

## AS CHAVES, com o risco de falso positivo MEDIDO

A pergunta de cada linha: *quando esta chave casa duas fichas, elas sao a MESMA pessoa?*

**Nota de metodo que invalidou meu primeiro teste:** `uq_as_candidatos_cpf` e UNIQUE, entao duas
fichas **nunca** tem o mesmo CPF. "CPF igual" e impossivel por construcao, e usar isso como prova
de acerto nao mede nada. O teste que vale e o **inverso**: quando a chave casa e os dois lados tem
CPF, os CPFs **diferentes** provam que sao pessoas DIFERENTES.

### E-MAIL: o mais seguro que existe nesta base

| medicao | resultado |
|---|---|
| preenchimento na plataforma | **76.291 de 76.291 (100%)** |
| preenchimento no Digai | **27.898 de 27.898 (100%)** |
| e-mails que aparecem em mais de uma ficha | **ZERO** |
| e-mails que casam 2 CPFs distintos | **ZERO** |
| e-mails com 2 nomes distintos | **ZERO** |

**Zero colisao em 76 mil fichas.** E nao e efeito de dedup: nenhuma das duas ingestoes casa por
e-mail, e **nao ha indice unico** em `as_candidatos.email` (so em `cpf`, parcial). O zero vem da
BASE: o Pandape garante e-mail unico por candidato, e a populacao do Digai e 82% a mesma.

**CORRECAO DE UMA MEMORIA MINHA:** eu tinha registrado "e-mail nao e chave de identidade, 6
e-mails com 12 CPFs em producao". Aquilo e da tabela **`candidatos` (a esteira)**, nao de
`as_candidatos` (A&S). Medido agora: esteira tem 6, A&S tem **zero**. A ressalva segue valendo
como principio (e-mail e desempate, nao chave primaria), mas o numero nao se aplica aqui.

### TELEFONE SOZINHO: PERIGOSO, nao usar

| medicao | resultado |
|---|---|
| pares que casam por telefone | **15.786** |
| destes, com CPF nos dois (logo, PESSOAS DIFERENTES) | **13.498** |
| destes, com **nome tambem diferente** | **13.480** |

**85% dos casamentos por telefone sao claramente pessoas diferentes.** Telefone e compartilhado:
familia, telefone do recrutador, numero padrao digitado. **Chave proibida sozinha.**

### NOME SOZINHO: PERIGOSO, nao usar

2.627 nomes casam 2 ou mais CPFs distintos, alcancando **7.428 pessoas**. Homonimo e comum.

### NOME + VAGA: insuficiente sozinho, e a prova esta nos duplicados que ja existem

Dos **1.334** pares "mesmo nome na mesma vaga" que a base ja tem:

| | pares | o que sao |
|---|---|---|
| os DOIS tem CPF, e sao diferentes | **245** | **HOMONIMOS, pessoas diferentes** |
| so UM tem CPF | **1.085** | provavel duplicata da mesma pessoa |
| nenhum tem CPF | 4 | indecidivel |

Fundir por nome + vaga juntaria **245 pessoas diferentes**. **Chave proibida sozinha.**

### NOME + VAGA + TELEFONE: forte, e e a combinacao que serve

Dentro daquele mesmo conjunto:

| | pares |
|---|---|
| provavel duplicata e o telefone CASA | **1.023** |
| pessoas diferentes e o telefone CASA (erro) | **14** |

**Precisao de 98,6%** (1.023 acertos contra 14 erros). O telefone, que sozinho erra 85%, dentro
deste recorte estreito acerta quase tudo. **Mas os 14 erros sao fusao irreversivel**, entao esta
chave **nao pode fundir sozinha**: ela serve para SINALIZAR, nao para decidir.

### DATA DE NASCIMENTO: nao ajuda aqui

Preenchida em 76.291 fichas, mas igual em apenas **14** dos 1.334 pares duplicados. O Pandape
praticamente nao a traz preenchida de forma util para este cruzamento.

## O QUE EU PROPONHO CONSTRUIR

1. **E-MAIL como desempate secundario**, no MESMO molde do CPF (`candidatoPorDocumento`): depois
   da identidade externa, antes de criar ficha nova. Zero colisao medida, 100% de preenchimento
   dos dois lados. **Derruba as duplicatas de 18.722 para ~26.**
2. **Fail-closed igual ao do CPF:** e-mail vazio, malformado ou de ficha ja anonimizada **nao
   desempata**. O precedente esta escrito no proprio `candidatoPorDocumento` (documento invalido
   nao casa, ficha anonimizada nao e alvo).
3. **NADA de telefone, nome ou nome+vaga como chave de FUSAO.** Os tres tem falso positivo medido
   e fusao nao se desfaz.
4. **NOME + VAGA + TELEFONE vira SINAL, nao fusao:** quando os tres batem e o e-mail nao, grava
   **conflito** em `as_ingestao_conflitos` (tabela que ja existe e que o Digai ja usa) para
   revisao humana. Assim os 1.023 aparecem para alguem decidir, e os 14 nao viram dano.

## AS 1.334 DUPLICATAS QUE JA EXISTEM: frente propria, e NAO se resolve com a chave nova

**O e-mail NAO funde nenhuma delas:** medido, o e-mail e igual em **ZERO** dos 1.334 pares. Faz
sentido, porque cada registro do Pandape traz e-mail proprio e unico; a duplicata entrou com
e-mail diferente.

Entao a chave nova **previne** duplicata nova e **nao conserta** a antiga. Consertar exige:
- separar os **245 homonimos** (que NAO podem ser fundidos) dos **1.085** prováveis duplicados;
- decidir o que fazer com os 1.085, onde um lado nao tem CPF;
- fusao de ficha e **irreversivel**, entao isso pede revisao humana, nao rotina automatica.

**E frente propria, com decisao do diretor.** Nao entra nesta.

## Alcance do que vai ser mexido

| arquivo | o que muda |
|---|---|
| `as/digai/digai-repositorio.ts` | metodo novo de busca por e-mail, no molde de `candidatoPorDocumento` |
| `as/digai/digai-importacao.service.ts` | a ordem do desempate: identidade, CPF, **e-mail**, senao cria |
| `domain/digai.ts` | a regua de "este e-mail serve para desempatar?" (dominio puro, testavel) |

**NAO se toca:** o dedup do Pandape (`ingestao-ciclo.ts`), que e outra frente e esta em producao
hoje; `uq_as_candidatos_cpf`; e nada de `as/ingestao-pandape/`.

**§A.38:** fundir pessoa errada e irreversivel, entao o `seguranca` audita o mapa antes e o codigo
depois, com poder de veto.

---

# EMENDA, apos o VETO da auditoria e os GAPS do tester (02/10/2026)

Os dois agentes trabalharam em paralelo e **convergiram em tres pontos** sem se falarem. Onde eles
convergiram, eu adotei.

## E-1. CORRECAO DE METODO: tres das minhas medicoes do e-mail eram TAUTOLOGIA

O mapa trazia tres linhas como se fossem evidencias independentes:
"zero e-mails repetidos", "zero casam 2 CPFs", "zero casam 2 nomes". **As duas ultimas sao
consequencia aritmetica da primeira**: se nenhum e-mail repete, nenhum pode abranger 2 CPFs nem 2
nomes. Era **uma** medicao apresentada como tres, e isso triplica a confianca aparente de um fato
unico. E a MESMA armadilha que eu peguei no `uq_as_candidatos_cpf`, voltando por outra porta no
mesmo documento.

**O zero continua de pe**, confirmado pela auditoria em medicao independente (76.322 fichas, com
`lower`, com `btrim`, sem placeholder, sem dominio fabricado em massa, gmail 59.106 / hotmail 9.785
/ outlook 2.164). O que muda e **o fundamento**, no item seguinte.

## E-2. O FUNDAMENTO "o Pandape garante e-mail unico" esta FALSIFICADO

Eu escrevi que o zero vinha da fonte, porque o Pandape garantiria e-mail unico por candidato.
**Nao se pode confiar nessa fonte**, e a prova esta na mesma tabela:

| `data_nascimento` | fichas |
|---|---|
| **1990-01-01** | **5.118** |
| 1900-01-01 | 43 |

O campo esta **100% preenchido** e **6,7% dele e default fabricado**. A carga do Pandape propaga
valor-lixo em massa num campo de identidade, entao "a fonte garante" nao vale como argumento.

**O zero do e-mail se sustenta na MEDICAO DIRETA, nunca na confianca na fonte.** E uma consequencia
pratica: se um dia alguem usar nascimento como sinal, **5.118 pessoas casam entre si** pelo default.

E uma correcao secundaria: eu escrevi que o nascimento "praticamente nao vem preenchido". **Vem
100% preenchido.** A conclusao (nao serve) estava certa pela razao errada.

## E-3. NORMALIZACAO FIXADA em `lower(btrim())`, e so isso

A base tem **zero** maiusculas e **zero** espacos de borda, apesar de nenhum codigo nosso
normalizar: a normalizacao acontece **na fonte**. Consequencia que o mapa nao registrava: **o Digai
pode entregar sem normalizar**, e `Joao@Gmail.com` nao casaria, virando duplicata (direcao segura,
mas derrota o proposito). Por isso `lower(btrim())` dos dois lados.

**NAO adotar normalizacao agressiva** (ponto do gmail, `+alias`): ela acharia 26 duplicatas a mais,
mas equivalencia de ponto e regra especifica do Gmail e tirar `+alias` em dominio que o trata
literalmente **funde pessoas diferentes** num provedor nao medido.

## E-4. GUARDA NOVA, obrigatoria: CPF presente nos DOIS lados e DIFERENTE nao funde

O meu proprio argumento central (247 pares com CPFs diferentes provam pessoas diferentes) **se
aplica inteiro ao e-mail**, e o mapa nao o aplicava. Caso: registro com CPF que **nao casa ficha
nenhuma**, e-mail que casa a ficha B, cuja ficha tem **outro** CPF.

**Exposicao medida: 653 pessoas** (4.577 com CPF valido, menos 3.924 que casam por CPF) chegam ao
degrau do e-mail com um CPF na mao que nao casa nada.

**Regra:** o e-mail so desempata quando o CPF do registro e nulo, OU o da ficha e nulo, OU os dois
sao iguais.

## E-5. NA COLISAO, ABSTER, e eu estava errado

Eu havia especificado "o CPF vence, escreve, e registra o conflito". **Os dois agentes apontaram o
mesmo**, e eu adoto o deles: na colisao CPF aponta para A e e-mail para B, o certo e **nao escolher,
nao escrever, registrar o conflito e devolver nulo**. E o que o ramo vizinho ja faz para identidade
contra documento, e e coerente com a ordem do diretor (**falso positivo e pior que duplicata**).

## E-6. O `coalesce` DE HOJE SOBRESCREVE identidade, e isso envenena a chave nova

`as/digai/digai-repositorio.ts`, em `atualizarCandidato`:

```sql
cpf   = coalesce(${doc}, cpf),
email = coalesce(${correio}, email),
```

`coalesce` com valor novo **nao nulo** devolve o NOVO: isso **substitui**, nao preenche vazio. Com
a chave nova, uma passada pode gravar o e-mail de B na ficha de A; na passada seguinte, duas fichas
compartilham aquele e-mail e a busca escolhe uma delas **de forma nao determinista**.

**Precisao que a auditoria nao fez e eu fiz:** no Pandape o `update` e ainda mais agressivo (grava
direto, sem `coalesce`), e **la esta certo**, porque o casamento e por identidade externa estavel e
o registro E a mesma pessoa. O risco e **especifico da chave nova**, em que o casamento pode apontar
para outra pessoa.

**Regra:** `atualizarCandidato` nao pode trocar `cpf` nem `email` de um valor nao nulo ja existente
por um valor **diferente**. Preencher vazio, sim; trocar identidade, nao.

## E-7. MAIS DE UMA FICHA CASANDO O E-MAIL: abster, nao `limit 1`

Nao ha indice unico em `as_candidatos.email`, e o molde `candidatoPorDocumento` usa `limit 1` **sem
`order by`** (sobrevive porque o CPF e unico). Para o e-mail isso escolheria ficha arbitraria.

**Regra:** a consulta devolvendo mais de uma linha e **abstencao com conflito**, nunca escolha. E
mais seguro que ordenar, porque ordem deterministica **escolhe**, e aqui escolher e o risco.

## E-8. O SINAL de nome+vaga+telefone SAI DESTA FRENTE

`as_ingestao_conflitos` tem `UNIQUE (fonte, identificador)`, **sem coluna de motivo**, 12 linhas
hoje, e `registrarConflito` usa `identificador = userId` com `on conflict do nothing`.

Logo, gravar um sinal para um `userId` **suprime em silencio** o conflito real de identidade do
mesmo `userId`: **o conflito mais grave e o que desaparece**, porque chega depois. E derramar ~1.023
sinais numa tabela de 12 linhas afoga a fila de revisao que ja existe.

**Decisao minha:** o sinal **nao entra nesta frente**. Ele exige coluna de motivo dentro do indice
unico, o que e migration, e isso e frente propria com decisao do diretor. Esta frente constroi
**so a chave de e-mail, com as guardas**. (§A.31: propoe, nao constroi.)

## E-9. O ALCANCE REAL DA CHAVE HOJE E QUASE ZERO, e isto e decisao do diretor

Achado do `tester`, e e o mais consequente de todos: `INGERIR_SOMENTE_QUEM_FINALIZOU = true`, e quem
responde por "finalizou" e **o CPF**. Logo **os 84% sem CPF nao chegam ao degrau do e-mail**: eles
sao barrados antes, na primeira linha da importacao.

**As 18.722 duplicatas evitadas so se materializam quando a regua nova abrir.** Com a regua de hoje,
o e-mail alcanca apenas quem TEM CPF valido e nao casou por ele: **653 pessoas no maximo**.

**As duas mudancas sao acopladas, e a ordem importa:** construir a chave de e-mail **primeiro** e
abrir a regua **depois** e a ordem segura. O contrario cria as 18.722.

## E-10. Impacto de construcao que o mapa nao previa

A implementacao de referencia do `tester` quebrou **8 testes alheios**, porque os dubles de
repositorio existentes nao tem o metodo novo. Os dois a atualizar:
`digai.contrato-real.tester.spec.ts:275` e `digai-ingestao.backend.spec.ts:51`.

## E-11. §A.6, confirmado pela auditoria

Nenhuma mudanca de retencao e a minimizacao segue inteira: o e-mail **ja** e coletado e ja esta na
coluna; le-lo para casar e a mesma finalidade. **Limite a respeitar:** a guarda de zero PII em log
(`as/digai/digai.zero-pii.tester.spec.ts`) so pega `logger.x(... email ...)` literal, entao e-mail
lavado por funcao auxiliar **atravessa**. O e-mail **nao entra** em mensagem de conflito:
`as_ingestao_conflitos.identificador` continua recebendo **so o `userId`**.

## E-12. A MEDICAO QUE A AUDITORIA EXIGIU (V4), e ela valida a chave E a guarda

### Duplicata de e-mail DENTRO do Digai: ZERO

Varridas **27.927 pessoas** (`userId` unicos), 733 requisicoes, zero sinal de cota:

| | valor |
|---|---|
| e-mails usados por mais de um `userId` | **0** |
| pessoas alcancadas por e-mail repetido | **0** |
| pior caso (um e-mail para N pessoas) | **0** |

Entao o e-mail e unico **dos dois lados**: zero colisao na plataforma (76.322 fichas) e zero no
Digai (27.927 pessoas). A preocupacao da auditoria era legitima e **o numero nao a confirma**.

### A PROVA DE CONCORDANCIA: quando CPF e e-mail apontam, eles concordam?

Esta e a medicao que o mapa nao tinha e que decide tudo. Dos **4.587** registros do Digai com CPF
valido:

| | pessoas | % |
|---|---|---|
| CPF e e-mail **casam os dois** | 3.723 | |
| **CONCORDAM (mesma ficha)** | **3.602** | **96,8%** |
| **COLIDEM (fichas diferentes)** | **121** | **3,2%** |
| so o CPF casa | 205 | |
| so o e-mail casa (o CPF nem existe na base) | 117 | |
| nada casa (pessoa nova) | 542 | |

**Os dois lados desta tabela importam, e em direcoes opostas:**

1. **96,8% de concordancia** e a prova de que o e-mail identifica a mesma pessoa que o CPF. Nenhuma
   outra chave medida chega perto: telefone erra 85%, nome+vaga tem 247 homonimos.
2. **121 colisoes REAIS** sao a prova de que a guarda da E-4 e a abstencao da E-5 **nao sao
   teoricas**. Sem elas, esses 121 seriam fusao de pessoas diferentes, irreversivel. **E exatamente
   o que o diretor proibiu.**
3. Os **117 que so casam por e-mail** sao o ganho liquido que so a chave nova traz: gente cujo CPF
   nem existe na base e que seria duplicada sem ela.

**Conclusao:** a chave e boa e a guarda e obrigatoria. Uma sem a outra nao serve.

### Expurgo dos dados da medicao

Os arquivos com nome, CPF, e-mail e telefone de 27.927 pessoas viveram so no scratchpad da sessao,
com permissao 600, e foram **apagados ao fim da medicao**, junto da copia dentro do container e do
indice temporario criado em `as_candidatos` para a consulta. §A.6: nenhum deles vira insumo
permanente, e nenhum numero deste documento identifica ninguem.
