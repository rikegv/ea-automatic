# Mapa de alcance: o 429 da Central de Candidatos

Medido em 02/10/2026 contra o codigo e o banco de producao. Investigacao do coordenador antes
de qualquer despacho (§A.39 passo 1, §A.40 regra 1).

## A CAUSA, e ela e exata

A tela faz **UMA CHAMADA POR VAGA** para montar as colunas de funil.

`apps/frontend/src/app/(app)/as/candidatos/page.tsx:207`
```ts
const paineis = await comTeto(listaVagas, 6, (v) => painelDaVaga(v.id, token));
```

| conta | valor |
|---|---|
| chamadas fixas (`/as/vagas` + `buscar`) | 2 |
| chamadas de painel, uma por vaga | **481** (vagas em producao hoje) |
| **total por carregamento** | **483** |
| teto do throttler (`app.module.ts:45`) | **120 por 60s** |

Da requisicao 121 em diante a resposta e **429 ThrottlerException**. E o `carregar` esta num
`useCallback` cujas dependencias incluem `busca`, `cpfBusca`, `fOrigem` e `fVaga`
(`page.tsx:214`), com `setTimeout` de 300ms: **cada mexida em filtro refaz as 483**.

**O volume novo nao mudou o padrao da tela, mudou a conta.** O padrao de uma chamada por vaga
e antigo; com poucas vagas ele passava sob o teto. As 59.961 pessoas vieram junto com as vagas
espelhadas do Pandape, e foi o numero de VAGAS, nao de pessoas, que estourou o teto.

## POR QUE O DEFEITO 2 E O MESMO DEFEITO, e nao outro

Quando o lote de paineis estoura em 429, o `catch` de `page.tsx:209` pega, mostra o erro e
**`setCandidaturas` nunca roda**. O estado de candidaturas fica VAZIO. E a montagem da linha,
em `page.tsx:251`, para quem nao tem candidatura no estado carregado, e:

```ts
return fVaga ? [] : [{ chave: p.id, pessoa: p, candidatura: null, vaga: null }];
```

Candidatura nula pinta **"Vaga Nao Alocada"** nas tres colunas de vaga
(`page.tsx:792,799,806,831`). Logo, com o 429, **TODA PESSOA** aparece como "Vaga Nao Alocada",
tenha vaga ou nao.

**A ficha nao estoura porque ela e outra rota.** `GET /as/candidatos/:id` (`ficha`,
`candidatos.controller.ts:521`) devolve a pessoa **com as candidaturas dela**, em uma chamada.
Por isso a ficha mostra a etapa certa enquanto a lista jura que nao ha vaga. **A ficha esta
certa; a lista esta cega.**

## AS DUAS CANDIDATAS, medidas

**"DEBORA LUCIA DE OLIVEIRA" NAO EXISTE na base.** Nenhuma linha com esse nome. As parecidas,
todas de origem PANDAPE e criadas em 01/10, e **todas COM candidatura**:

| nome | situacao | etapa | vaga | cliente | status da vaga |
|---|---|---|---|---|---|
| Debora Campos De Oliveira | ATIVO | CAPTACAO | 3572904 | SEM CLIENTE | PENDENTE_REVISAO |
| Debora Da Silva Oliveira | ATIVO | CAPTACAO | 3763601 | SEM CLIENTE | PENDENTE_REVISAO |
| Debora Luciano De Oliveira Silva (com CPF) | ATIVO | CAPTACAO | 3716137 | SEM CLIENTE | PENDENTE_REVISAO |
| **Debora Luciano De Oliveira Silva (SEM CPF)** | ATIVO | CAPTACAO | **3716137** | SEM CLIENTE | PENDENTE_REVISAO |
| Debora Oliveira | ATIVO | CAPTACAO | 3435230 | SEM CLIENTE | PENDENTE_REVISAO |
| Debora Oliveira | ATIVO | CAPTACAO | 3579940 | SEM CLIENTE | PENDENTE_REVISAO |

**NAO E DEFEITO DA TELA, e sim o 429:** elas TEM vaga e TEM etapa, e a lista nao as mostra
porque o estado de candidaturas ficou vazio. A ficha mostra "Em Captacao" porque a etapa e
CAPTACAO de verdade.

**E HA UM SEGUNDO ACHADO, que e defeito de verdade e nao e de tela:** "Debora Luciano De
Oliveira Silva" esta **DUAS VEZES na MESMA vaga 3716137**, uma com CPF e outra sem. O dedup da
ingestao casa por identidade e usa o CPF como desempate; sem CPF nao ha como casar, e a mesma
pessoa entrou duas vezes. Isso e da ingestao, nao da Central.

**"GIZELE ALVES" EXISTE, com CPF, origem PANDAPE, criada em 01/10, e tem ZERO candidatura.**

```
c537d484-df8a-46e4-802d-8d3860dac276 | Gizele Alves | 43711583822 | PANDAPE | 01/10/26
```

**Ela e a UNICA pessoa, em 59.961, sem nenhuma candidatura** (medido: `count = 1`). E ela **nao
tem** admissao na esteira. A busca do backend e `from as_candidatos` **sem join** com
candidatura (`candidatos.service.ts:700`), entao ela **e** encontravel por nome: ela aparece com
"Vaga Nao Alocada" legitimamente, porque de fato nao esta em vaga nenhuma. O que o diretor viu
como "nao aparece nada" e o 429 derrubando a tela inteira, ou a pagina de 200 em que ela nao
cai (a base tem 59.961 e a pagina padrao e 200).

## O CONSERTO, e a restricao de §A.6 que molda a solucao

**NAO vale hidratar a lista com fichas.** O proprio arquivo diz por que
(`apps/frontend/src/lib/as-candidatos.ts:10-17`): a lista devolve `temCpf`, um BOOLEANO, e nunca
o numero; quem mostra CPF e a FICHA, uma pessoa por vez e por clique. Puxar a ficha de todo
mundo traria **o CPF da base inteira para o navegador** e desfaria a minimizacao em uma linha.
O painel por vaga foi escolhido justamente porque e a unica fonte de funil **sem CPF**.

**O conserto certo, entao:** a rota que a tela JA chama, `POST /as/candidatos/buscar`, passa a
devolver, junto de cada pessoa da pagina, **as candidaturas dela sem CPF** (etapa, situacao,
vaga, cliente, cargo). Uma chamada, paginada no servidor, com a mesma minimizacao de hoje. O
laco de 481 painoes sai da tela.

| | hoje | depois |
|---|---|---|
| chamadas por carregamento | **483** | **2** |
| chamadas por mexida de filtro | 483 | 2 |
| CPF no navegador | nao (ja e `temCpf`) | nao (igual) |
| fonte do funil | 481 painoes de vaga | a mesma consulta, no servidor |

**O painel da vaga NAO sai do backend:** `GET /as/candidatos/vaga/:id` continua servindo a tela
da vaga, que e outra. O que sai e o USO dele como fonte de lista.

## Quem mais escreve e quem mais le (§A.40 regra 3)

- **`POST /as/candidatos/buscar`** e lido so pela Central de Candidatos
  (`lib/as-candidatos.ts`, `buscarCandidatos`). Mudanca ADITIVA no retorno nao alcanca outra tela.
- **`GET /as/candidatos/vaga/:id`** e lido pela Central de Candidatos (o laco que sai) **e** pela
  tela da vaga. Nao e tocado.
- **`AsCandidatosPagina`** e **`AsCandidaturaItem`** vivem em `packages/shared-types/src/index.ts`,
  arquivo de **dono unico, o coordenador** (§A.39). Os agentes NAO escrevem nele.
- O throttler (`app.module.ts:45`) **nao e afrouxado**. Ele esta certo; a tela e que pedia 483.

## §A.38: esta frente toca dado pessoal, logo a auditoria e obrigatoria

A mudanca mexe no que a LISTA devolve sobre pessoas, e a regra de minimizacao desta tela e
escrita e deliberada. O `seguranca` audita o mapa antes e o codigo depois, com poder de veto.

---

# EMENDA, apos o VETO da auditoria do mapa (02/10/2026)

## E-1. CORRECAO DE UM ERRO MEU: a busca tem CINCO leitores, nao um

O mapa afirmava que `POST /as/candidatos/buscar` "e lido so pela Central de Candidatos" e que
"mudanca ADITIVA no retorno nao alcanca outra tela". **Falso, e eu conferi.** Os leitores:

| # | arquivo | como chama |
|---|---|---|
| 1 | `app/(app)/as/candidatos/page.tsx:191` | a Central de Candidatos |
| 2 | `components/as/candidatos/AlocarCandidatoModal.tsx:117` | `semCandidatura: true` |
| 3 | `components/as/vagas/CandidatosDisponiveisDaVaga.tsx:161` | `semCandidatura: true`, **Central de Vagas** |
| 4 | `components/as/vagas/AdicionarCandidatosEmLoteModal.tsx:84` | `semCandidatura: true`, **Central de Vagas** |
| 5 | `components/as/candidatos/NovoCandidatoModal.tsx:228` | dedup por CPF |

Produtor de `AsCandidatoListItem`: **um so**, `candidatos.service.ts:729`.

## E-2. O VETO: projecao MINIMA, e nao `AsCandidaturaItem` inteiro

Eu havia escrito o contrato reusando `AsCandidaturaItem`, com o argumento de que ele nao tem CPF.
**Nao tem CPF, e ainda assim era errado.** Ele carrega dois campos de dado pessoal cuja
autorizacao §A.6 esta concedida **sobre a premissa de que esta rota nao o usa**, e a premissa esta
escrita no proprio tipo (`shared-types/src/index.ts`, bloco de `pretensaoSalarial`):

> "ESTE TIPO SERVE TRES SUPERFICIES, e nenhuma delas e uma varredura da base: a FICHA de UMA
> pessoa, as candidaturas de UMA vaga e a lista de transferiveis de UMA vaga. A busca da Central
> de Candidatos NAO usa este tipo."

| campo | o que e | preenchido hoje |
|---|---|---|
| `motivoDescarte` | texto livre do consultor sobre a recusa | **2.336** de 73.000 |
| `pretensaoSalarial` | dado financeiro | 0 hoje, enche a partir de agora |

**E o dano nao ficaria nesta tela, por causa do E-1:** tres dos cinco leitores chamam com
`semCandidatura: true` para OFERECER pessoas para alocacao. Medido em producao, **1.645
candidaturas desceriam para eles, 100% com `motivoDescarte` preenchido**, porque `DESCARTADO`
sempre grava motivo. O modal de alocar viraria vitrine do motivo da recusa e da pretensao salarial
de quem ele oferece, **sem nenhuma coluna mostrar nada disso**. O precedente tem nome: o
`substituidoCpf`, retirado da lista de vagas em 22/09 por descer cru por meses.

**O contrato corrigido, que eu ja escrevi como dono unico (§A.39):** tipo novo
`AsCandidaturaNaLista`, lista FECHADA de oito campos, que sao os que a tela de fato le:
`id`, `candidatoId`, `vagaId`, `vagaCodigo`, `vagaNome`, `etapa`, `situacao`, `ultimoContatoEm`.

`vagaCodigo` e `vagaNome` entram por um motivo medido: sem eles a coluna de vaga passaria a
depender de a vaga estar na lista de `/as/vagas`, **que e filtrada por status**. Vaga encerrada ou
em `PENDENTE_REVISAO` pintaria "nao informado" numa linha que TEM vaga, trocando o 429 por uma
cegueira mais discreta. **Todas** as vagas das candidatas que o diretor procurou estao em
`PENDENTE_REVISAO`.

## E-3. O volume de dado pessoal CAI 367 vezes, e isso e argumento a favor

Medido pela auditoria e conferido:

| | hoje (481 paineis) | depois (1 pagina) |
|---|---|---|
| linhas de candidatura no navegador | **73.000** | **199** |
| nomes de pessoa (`candidatoNome`) | **59.960**, a base alocada inteira | **0** novos |
| `motivoDescarte` em texto livre | **2.336** | **0** (fora da projecao) |

Hoje um carregamento despeja o nome de TODA a base alocada no navegador de qualquer um com o
menu, para preencher colunas de 200 linhas. **O conserto e, por si, a maior reducao de dado
pessoal ja feita nesta tela.**

## E-4. O throttler nao e afrouxado, e ha um motivo novo para isso

Confirmado: nada no conserto exige mexer em `app.module.ts:45`. E a auditoria trouxe um fato que
reforca: **o balde e UNICO para o sistema inteiro.** O `ThrottlerGuard` conta por `req.ip`, o
backend escuta em loopback e todos chegam pelo proxy como o mesmo endereco. Ou seja, **UM**
consultor abrindo a Central de Candidatos consome 483 dos 120 do balde de **todo mundo**, e nega
servico ao sistema inteiro por um minuto. Afrouxar o teto espalharia o dano em vez de corrigi-lo.

## E-5. RBAC: nao fica mais perigosa

Busca e painel moram na MESMA controller, sem `@Roles` de classe nem de metodo, e as duas sao
reivindicadas pelo MESMO menu, por coringa (`domain/menus.ts:982`, `"CandidatosController.*"`).
**Nao existe papel que veja a busca e nao veja o painel.**

## E-6. A ARMADILHA DE PAGINACAO, que a auditoria achou e que e risco de DADO

A busca calcula `total` com `count(*) over ()` e corta com `.limit(limite)` sobre **linhas de
candidato**. Se o funil for resolvido com **join** na consulta principal, `total` passa a contar
candidaturas e o `limite` passa a cortar candidaturas: com o maximo medido de **118** candidaturas
numa pessoa, uma pagina de 200 poderia entregar **duas pessoas**, e o `truncado` mentiria na
direcao contraria a que a Frente D consertou.

**REGRA OBRIGATORIA: o funil vem em SEGUNDA consulta, por `candidato_id in (ids da pagina)`,
NUNCA por join na consulta paginada.**

## E-7. Falta trava de forma da resposta, e foi essa ausencia que deixou o `substituidoCpf` passar

As specs da busca nao tem nenhuma assercao de FORMA da resposta (nenhum `Object.keys`, nenhum
`not.toHaveProperty`). A projecao minima sobe **com** assercao de lista fechada de campos.

## E-8. OS 826 DUPLICADOS: frente propria, NAO esta

A auditoria mediu o que eu tinha achado como caso isolado, e ele e 826 vezes maior:

| medida | valor |
|---|---|
| grupos (mesma vaga + mesmo nome) com mais de uma linha | **910** |
| destes, o padrao "um com CPF, outro sem" | **826** |
| todos com `candidato_id` distintos | 910 de 910 |
| grupos em que as duas linhas ja ocupam posicao da vaga | **1** |
| pessoas sem CPF na base | **4.103** de 59.961 (6,8%), **100% origem PANDAPE** |
| CPFs repetidos | **0** |

**O julgamento, e ele e de §A.6 por um angulo que nao e vazamento:** existem 826 segundos
dossies da mesma pessoa, sem CPF, nao ligados ao primeiro. O expurgo nao tem furo (a retencao e
por linha de `as_candidatos`). O que falha e o **direito do titular**: um pedido de acesso ou de
exclusao chega pelo **CPF**, que e a chave de identidade do sistema (§A.1), e acha **uma** das
duas linhas. A outra sobrevive invisivel ao pedido.

E a integridade operacional cresce sozinha: uma vaga de 10 pode ser entregue por duas linhas da
mesma pessoa, e o unique parcial `uq_as_candidaturas_viva` **nao pega**, porque os `candidato_id`
sao diferentes. Hoje ha 1 grupo nessa situacao.

**E da INGESTAO, nao da Central**, e o conserto mexe em dedup de identidade e merge de registro,
que e ESCRITA em `as_candidatos`. Misturar isso com um conserto de leitura de 429 e o retrabalho
que a §A.27 existe para evitar. **Vai ao diretor como frente propria.**
