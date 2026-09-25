# DESENHO: ONDAS B A E DA CENTRAL DE VAGAS

Desenho do `arquiteto` (leitura, sem escrita, §A.39), consolidado e **conferido** pelo coordenador
(§A.39 passo 4). Nada foi construído: este documento existe para o diretor decidir antes da primeira
linha de código.

Convenções: **[R]** recomendação. **[P]** pergunta para o diretor. **[M]** medido contra o código ou
o banco.

**Conferência do coordenador (10/09/2026), item a item, contra a produção:**

| afirmação do desenho | conferido | resultado |
|---|---|---|
| 3 vagas no banco, nenhuma CANCELADA | `select status, count(*) from vagas` | `ABERTA` 2, `ENTREGUE` 1, `CANCELADA` **0** |
| o enum tem 6 valores, `VAGA_BANCO` incluído | `enum_range(NULL::vaga_status)` | 6, com `VAGA_BANCO` |
| 4 escritores da tabela, e só | `grep insert(vagas)/update(vagas)` | 1 insert, 3 updates, todos em `vagas.service.ts` |
| `DEFAULT 'ABERTA'` na coluna | `tables.ts:2261` | confirmado |
| a tela oferece `ENTREGUE`, o backend recusa | `as-vaga-acoes.ts:243` x `domain/vaga.ts:227` | **confirmado, defeito vivo** |
| zero SLA em toda a base | `information_schema.columns ilike '%sla%'` | **0** |
| `projetos_alto_volume` com 19 linhas | `select count(*)` | **19** |
| `motivos_declinio` com 26 linhas | `select count(*)` | **26** |
| não existe histórico de status da vaga | tabelas com "vaga" no nome | 5 tabelas, **nenhuma de eventos** |

**Correção que o coordenador deve a si mesmo:** ele levou ao diretor "11 referências a status
terminais em `vagas.service.ts`". O número veio de um `grep` que contou **comentário**. Em código
executável são **2 linhas** (`:1001` e `:1251`), com 5 literais. O erro fazia a onda B parecer mais
barata do que ela é, e o custo real não está nesse arquivo: está nos 12 pontos de leitura do item 2.4.

---

## 1. CORREÇÕES AO LEVANTAMENTO INICIAL

**1.1. `CANCELADA` é um status ÓRFÃO DE ESCRITA. [M]**
Nenhum dos quatro escritores grava `CANCELADA`, e o banco confirma zero linhas. Ao mesmo tempo, ela
já tem **semântica de leitura em 4 lugares**, um deles escrito em antecipação explícita:

> `apps/frontend/src/lib/as-vagas-ocupacao.ts:51-53`: *"CANCELADA entra na lista porque ela É um
> encerramento, mesmo que hoje nenhuma rota escreva esse status: quando a ação de cancelar existir, os
> dois contadores já vão congelar sozinhos, sem ninguém ter de lembrar de voltar aqui."*

Consequência: **a rota de cancelar não inventa um estado, ela liga um estado que já tem comportamento
definido.** Isso barateia a leitura e **aumenta a exigência** sobre a escrita (item 3.5).

**1.2. A colisão de nome da onda C é maior do que "dois conceitos". [M]**
`projetos_alto_volume` tem **19 linhas reais** em produção (`BIENAL DOS LIVROS`, `KOP FARIA LIMA`,
`Temporada De Setembro 2026`), cada uma amarrada a um `cod_cliente`, com período, grupos de entrada e
cotas por cargo, consumida pelo menu Gerencial. E `admissao_projeto.admissao_id` é **UNIQUE**: o
modelo já decidiu que uma admissão pertence a UM projeto. Tratamento no item 4.2.

**1.3. `regioes` e `idiomas` já existem, e no formato que muda o tamanho da onda C. [M]**
`tables.ts:2387-2390` e `:2411-2412`: `text[]` com um `varchar` de escape ao lado, alimentado pelo
sentinela `OPCAO_OUTROS`. As regiões são validadas contra `REGIOES_POR_UF`, **373 linhas escritas em
código** (`shared-types:1270`). Nenhuma das duas listas é gerenciável: **as duas violam o princípio
que o diretor fixou**, e é isso que transforma a onda C de "acrescentar campo" em duas frentes de
catálogo.

**1.4. DEFEITO VIVO EM PRODUÇÃO: a tela oferece um status que o backend recusa. [M]**
`VAGA_STATUS_PUBLICACAO` (`as-vaga-acoes.ts:243`) é derivada por **exclusão**: tudo menos `RASCUNHO`,
`FECHADA` e `CANCELADA`. Sobram `ABERTA` e **`ENTREGUE`**, e as duas são desenhadas no seletor
(`page.tsx:3026`). O backend aceita **só `RASCUNHO` e `ABERTA`** (`domain/vaga.ts:227` e o `@IsIn` de
`vagas.dto.ts:136`).

Quem escolher "Entregue" e publicar leva 400. É um botão que só sabe falhar. Nasceu da direção da
régua: a lista da tela é uma **proibição** (exclui três), a do backend é uma **permissão** (admite
dois), e o próprio comentário de `domain/vaga.ts:213-215` já tinha avisado que *"proibição esquece a
terceira folha"*. O teste da tela afirma que `FECHADA`, `CANCELADA` e `RASCUNHO` estão fora e **não
diz nada sobre `ENTREGUE`** (`as-vaga-acoes.spec.ts:163-179`).

Cai dentro da onda B e é corrigido de graça por ela (item 2.4, ponto 6). Se a onda B demorar, vale um
conserto de uma linha, e ele toca código validado (§A.26: pergunta antes).

---

## 2. O MAPA DO STATUS

### 2.1. Quem escreve o status hoje: QUATRO escritores, com prova de completude

| # | escritor | arquivo:linha | o que grava |
|---|---|---|---|
| 1 | `create` (abrir vaga) | `vagas.service.ts:574`, valor por `:558` | `RASCUNHO` ou `ABERTA`, nunca outro |
| 2 | `atualizar` (continuar e publicar) | `vagas.service.ts:702`, valor por `:648` | `RASCUNHO` ou `ABERTA`, nunca outro |
| 3 | `fechar` | `vagas.service.ts:1223`, valor por `:1251` | `ENTREGUE` se `finalizadas > 0`, senão `FECHADA` |
| 4 | **o `DEFAULT 'ABERTA'` da coluna** | `tables.ts:2261` | `ABERTA` em qualquer INSERT que omita o campo |

**Prova de que a lista é completa [M]:** `update(vagas)` devolve 3 ocorrências (702, 1039, 1223), e a
de `:1039` é `editarPosicoes`, que não toca status (conferido linha a linha). `insert(vagas)` devolve
1. SQL cru sobre `vagas` em todo `apps/backend/src`: **zero**. Nenhum dos 7 `carga-*.ts` menciona a
tabela. Os escritores 1 e 2 passam obrigatoriamente por `travaStatusDaTrilha` (`:791`), que é
permissão explícita e lança para qualquer outro valor.

**O escritor 4 é o silencioso, e precisa morrer na onda B. [R]** É o mesmo defeito que a migration
das etapas tratou de propósito (`drizzle/0100:117-120`): *"um default no banco seria um SEGUNDO dono
da mesma decisão, capaz de apontar para uma etapa que o diretor inativou, em silêncio."*

### 2.2. Status por status

**`RASCUNHO`: ESTRUTURAL.** Desliga a régua dos obrigatórios (`:930`); é a única porta da edição
(`:642`); afrouxa a validação do CPF do substituído (`:884`); é o único com lápis na tela
(`page.tsx:2754`) e sem cadeado nem posições. Inativar ou apagar **quebra o produto**: não existiria
vaga salva pela metade.

**`ABERTA`: ESTRUTURAL, e de maior alcance.** Default do nascimento (`:558`); única porta do
fechamento (`:1203`); é o que autoriza editar posições (`:1001`); é o **único destino oferecido na
alocação de candidato** (`as/candidatos/page.tsx:399`). Inativar: **nenhuma vaga fecha mais**.

**`ENTREGUE`: ESTRUTURAL.** Escrito por derivação, nunca por escolha (`:1251`). Congela a origem da
contagem (`as-vagas-ocupacao.ts:87`), para de receber candidato (`domain/candidatura.ts:586`, em 4
pontos transacionais), congela o contador de dias (`page.tsx:462`). Inativar é **perigoso de um jeito
específico**: o `fechar` grava o código sem consultar catálogo, então inativar produz vaga viva
apontando para status fora de circulação, que é a **etapa fantasma** que o diretor mandou barrar em
10/09 (`etapas-funil.service.ts:310-316`).

**`FECHADA`: ESTRUTURAL.** Mesmo escritor (quando `finalizadas === 0`), mesmas leituras de `ENTREGUE`.

**`CANCELADA`: ESTRUTURAL NA LEITURA, ÓRFÃ NA ESCRITA.** `desfechoDaVaga` tem ramo próprio e **ele
vence tudo** (`as-vaga-trilha.ts:152-154`). Tem card de KPI desenhado (`page.tsx:2251`). E nenhum
escritor. É a onda B.

**`VAGA_BANCO`: DORMENTE.** Fora de `VAGA_STATUS`, vivo no enum, traduzido na entrada por
`statusVivoDaVaga` (`domain/vaga.ts:172`), zero linhas. Com catálogo ele deixa de ser um `if` e vira
uma linha inativa que se explica sozinha.

**`ANALISE` (novo): PODE nascer LIVRE, e é o único da lista que pode.** Três perguntas decidem:
- **[P1] vem ANTES ou DEPOIS de "Aberta"?** Antes (aguardando aprovação da abertura) o torna
  alcançável pela trilha, e aí ele encosta em `VAGA_STATUS_DA_TRILHA`, na régua dos obrigatórios e na
  pergunta "já recebe candidato": vira **estrutural**, e o custo triplica. Depois, é livre de verdade.
- **[P2] recebe candidato?** Hoje, por omissão, receberia: `vagaRecebeCandidato` é uma **negação** de
  três códigos, então **todo status novo nasce recebendo candidato, em silêncio**. É fail-open.
- **[P3] conta como "aberta" no contador de dias, e depois no SLA?** `diasEmAberto` só para em status
  encerrado, então Análise continuaria contando. Na onda D esse número vira cobrança.

### 2.3. Livre contra estrutural

| status | classificação | renomear | reordenar | inativar | apagar |
|---|---|---|---|---|---|
| Rascunho | ESTRUTURAL | seguro | seguro | **proibir** | **proibir** |
| Aberta | ESTRUTURAL | seguro | seguro | **proibir** | **proibir** |
| Entregue | ESTRUTURAL | seguro | seguro | **proibir** | **proibir** |
| Fechada | ESTRUTURAL | seguro | seguro | **proibir** | **proibir** |
| Cancelada | ESTRUTURAL | seguro | seguro | **proibir** | **proibir** |
| Vaga Banco | dormente | seguro | seguro | é o estado dela | bloqueado por FK se houver linha |
| Análise e futuros | LIVRE | seguro | seguro | com trava de "sem vaga dentro" | 3 camadas, molde das etapas |

"Renomear é seguro para todos" **só vale se o código for imutável**, como nas etapas. Hoje não é
seguro para nenhum, porque o rótulo é derivado do código por um `Record` fixo (`shared-types:978`).
Esse é o primeiro ganho concreto do catálogo.

### 2.4. O que quebra se o status virar dado de tabela: doze pontos

Os três primeiros **não quebram com erro de compilação**: passam a errar em silêncio.

1. `VagaStatus` deixa de ser union e vira `string` (`shared-types:975`), pelo caminho que
   `CandidaturaEtapa` já percorreu. **O TypeScript para de recusar `"ABERTAA"`.** As três coisas que
   substituem a garantia (validação em runtime, FK no banco, fallback no rótulo e no tom) precisam
   existir todas.
2. `VAGA_STATUS_LABEL` e `TOM_STATUS_VAGA` (`as-candidatos-visual.ts:80`) deixam de ser `Record`
   exaustivo. Viram consulta com fallback, no molde de `rotuloDaEtapa`/`tomDaEtapa`. **Sem fallback a
   pill sai vazia.**
3. **`VAGA_STATUS.indexOf(v.status)` como chave de ordenação** (`page.tsx:1983`) passa a ordenar
   errado sem falhar. É literalmente o defeito que as etapas documentaram (`as-etapas.ts:51-53`).
4. Os **seis cards de KPI escritos um a um** (`page.tsx:2231-2258`) precisam vir do catálogo. **O
   molde está 30 linhas abaixo**: a faixa de etapas já é `map` com `auto-fit minmax(88px)`, provada no
   browser com sete cards. Isso responde "e se ele criar nove status".
5. Opções do filtro (`page.tsx:2093`) e o estado `cardAtivo` (`page.tsx:814`).
6. `VAGA_STATUS_PUBLICACAO` vira flag do catálogo. **É aqui que o defeito do item 1.4 morre de graça.**
7. `VAGA_STATUS_ENCERRADOS` e `vagaEncerrada` viram o flag `encerra`. São lidos por `preenchidas`,
   `origemContagem`, `processoDaVaga`, `desfechoDaVaga`, `diasEmAberto` e o painel: **um flag errado
   muda o número do cilindro e o do contador de dias ao mesmo tempo.**
8. `STATUS_QUE_NAO_RECEBEM` vira flag, com **4 chamadas dentro de transação com `SELECT FOR UPDATE`**
   (`candidatos.service.ts:413, 801, 1243, 1505`). O catálogo tem de ser lido **antes de abrir a
   transação**, servido de cache, pela razão já escrita no `fechar` (`vagas.service.ts:1185-1187`).
   **Este é o ponto que um despacho fatiado erraria.**
9. O `@IsIn` do DTO sai do decorator e vira checagem assíncrona no service, como nas etapas.
10. Banco: `vaga_status` vira `varchar(40)` com **FK RESTRICT**, e o **`DEFAULT 'ABERTA'` sai**. O
    `DROP TYPE` sem `CASCADE`, como na 0100.
11. Cinco arquivos de teste iteram a constante e passam a iterar um catálogo fingido.
12. **Não existe histórico de status da vaga** (confirmado no banco). Ver 2.6.

**Tamanho honesto [M]:** a frente das etapas custou **4.273 linhas em 20 arquivos**. O status da vaga
tem **mais** lógica estrutural do que as etapas tinham (elas tinham zero). **A onda B não é pequena.**

### 2.5. A PERGUNTA QUE DECIDE O DESENHO, e a resposta

> Dá para ter um catálogo gerenciável em que ALGUNS valores são protegidos e outros são livres? Ou
> vira um catálogo que mente?

**Dá, e não mente, com UMA condição: a proteção não pode ser uma caixinha "não mexa". Tem de ser um
PAPEL declarado, e o código tem de parar de escrever códigos e passar a PERGUNTAR ao catálogo qual é
o código de cada papel. [R]**

Com uma coluna `protegido` genérica, o código continua com seis literais espalhados e **ninguém que
olhe a tabela sabe qual linha é a que o `fechar` grava quando a contagem é zero**. Com `papel`, a
tabela documenta a dependência.

**Tabela proposta, `as_vaga_status`** (molde: `as_etapas_funil`, `drizzle/0100`):

| coluna | origem | observação |
|---|---|---|
| `codigo` varchar(40) unique | derivado do rótulo por `codigoDoRotulo` | **imutável**, é o que fica gravado na vaga |
| `rotulo`, `ordem`, `tom`, `ativo` | idêntico às etapas | `tom` reusa a paleta fechada `ETAPA_TONS` e o CHECK do banco |
| `papel` varchar(20) | **novo** | `LIVRE` / `RASCUNHO` / `ABERTURA` / `ENTREGA` / `FECHAMENTO` / `CANCELAMENTO` |
| `encerra`, `recebe_candidato`, `da_trilha`, `movivel_manualmente` | **novo** | um comportamento por coluna |

**As travas que fazem o catálogo não mentir**, no banco e no service:
1. **Índice parcial ÚNICO por papel diferente de LIVRE.** É a técnica que o `inicial` das etapas já
   usa (`0100:81`). `papel` é a generalização de `inicial` para cinco papéis, com a mesma ferramenta.
2. **CHECK: `papel = 'LIVRE'` implica `encerra = false`.** É a linha mais importante do desenho. **O
   diretor não pode criar um status que encerra a vaga**, porque encerrar não é rótulo, é gesto com
   trava. Sem esse CHECK, o catálogo abriria uma terceira porta para o estado terminal sem trava
   nenhuma, que é o buraco que a auditoria de 08/09 fechou.
3. **Linha de papel diferente de LIVRE não é inativável, não é apagável e não muda de papel.**
4. **Sempre existe uma linha de cada papel.** `codigoDoPapel(papel)` lança se faltar, no molde de
   `etapaInicial()`.
5. **Apagar tem as três camadas do `remover` das etapas**, com a camada 2 alimentada pela trilha.

**Direção dos defaults [R]:** `encerra` false, `recebe_candidato` true, `da_trilha` false,
`movivel_manualmente` true. O status que o diretor criar nasce **vivo, recebendo gente, movível à mão
e incapaz de encerrar nada**. É o comportamento de "Análise" sem configurar coisa nenhuma, e é
fail-closed onde importa.

**O que o diretor GANHA:** renomear "Entregue" para "Finalizada Com Êxito" sem migration e sem tocar
em vaga gravada; criar "Análise", "Stand By", "Aguardando Cliente", quantos quiser, livres e movíveis
à mão; cor e ordem dos KPIs sem publicação; e "Vaga Banco" deixa de ser um `if`.

**O que ele NÃO ganha, e precisa saber ANTES:** não apaga os cinco de sistema; não cria status que
encerra vaga; não faz status livre virar destino automático do fechamento; e renomear "Aberta" não
muda o fato de que ela continua sendo a única de onde se fecha.

**Os dois caminhos alternativos, com o custo:**
- **Caminho B (cerca de 1/4): "Análise" entra como valor novo do enum, e o catálogo governa só
  rótulo, cor e ordem.** Uma migration, nenhum `VagaStatus = string`, nenhuma FK. **Recomendo
  contra**: viola o princípio que ele fixou, e o status seguinte volta a exigir migration. Mas é
  honesto se o objetivo for entregar "Análise" rápido.
- **Caminho C: duas listas separadas.** `vagas.status` fica com os cinco estruturais, e a vaga ganha
  uma "etapa da vaga" 100% livre, sem lógica amarrada. Zero risco sobre o validado. **Recomendo
  contra por uma razão de tela**: seriam **duas pills de estado na mesma linha**. Registro porque, se
  o "Análise" for um estágio interno paralelo ao status, este caminho é o certo, e é a **[P1]** que
  decide.

**Recomendação: o caminho principal (catálogo com papel), na sequência do item 2.7.**

### 2.6. A peça que ninguém pediu e que muda o custo: a TRILHA DO STATUS [R]

O diretor disse "ele MOVE o status manualmente". **Hoje não existe histórico de status da vaga**
(confirmado: as tabelas com "vaga" são `vagas`, `vaga_beneficio`, `vaga_meta_reducoes`,
`dados_vaga_folha`, `projeto_vaga_cargo`). No dia em que o status for movível à mão, "quem moveu e
quando" vira pergunta sem resposta.

Três razões para ela existir na onda B:
1. **É o hábito do módulo:** `vaga_meta_reducoes` para a redução de meta, `fechamento_forcado_*` para
   o forçamento, `as_candidatura_etapas` para o funil. Movimento manual sem autor seria a exceção.
2. **É ela que faz a camada 2 do apagar funcionar.** Sem histórico, um status por onde vagas passaram
   e de onde já saíram fica apagável, e apagar apagaria o fato de que passaram.
3. §A.3 regra 8 (log de passagem) é a mesma família.

Formato: `as_vaga_status_eventos` (`vaga_id`, `de`, `para`, `por_id`, `em`, `observacao`), escrita
**na mesma transação** que muda o status: *"rastro que pode FALTAR quando a escrita deu certo não é
rastro"* (`vagas.service.ts:1030-1035`).

**[P4] A trilha aparece na ficha da vaga, ou basta existir para auditoria?** Muda uma tela, não o
modelo.

### 2.7. A sequência recomendada DENTRO da onda B [R]

**B1: CANCELAR VAGA** (não depende do catálogo). Grava `CANCELADA`, que já existe no enum e já tem
semântica de leitura. Entrega valor sozinha e custa cerca de um quarto de B2.
**B2: STATUS GERENCIÁVEL mais "Análise"**, no molde das etapas.

Por que nessa ordem: B1 é onde está a dor operacional e é a parte barata. B1 **não fica mais caro**
por vir primeiro: escreve um literal, e em B2 esse literal vira `codigoDoPapel("CANCELAMENTO")`, uma
linha, num arquivo que B2 já reescreve inteiro. O risco de acrescentar um quinto escritor é contido
porque ele nasce **no mesmo arquivo e no mesmo formato de transação** do `fechar`.

---

## 3. O DESENHO DO CANCELAR VAGA

### 3.1. A rota

`POST /as/vagas/:id/cancelar`, corpo `{ motivo, observacao?, dataCancelamento, forcar? }`. Rota
própria, não o `PATCH` da trilha, pelo argumento que já separou o `fechar`: aqui não se edita a vaga,
registra-se como o processo terminou.

**SEM `@Roles` no handler, e a ausência é regra, não esquecimento.** É o argumento literal do `fechar`
(`vagas.controller.ts:98-104`): **todo consultor cancela uma vaga vazia**; o que é de Master é
**cancelar com candidato em processo**. Um `@Roles` no handler barraria o cancelamento normal do
COMUM, que é regressão silenciosa. **A autoridade mora no service**, em `travaCandidatosEmProcesso`,
no formato de `travaPosicoesOficiais` (`:1294`).

Este é o primeiro ponto que o `seguranca` vai atacar, e a defesa tem de estar no código: **o service
recalcula o papel quando `forcar: true` chega e devolve 403 ao COMUM**. O `podeForcar` da tela é
conveniência para o botão não aparecer, nunca a trava.

### 3.2. A transação

Mesmo desenho do `fechar`: transação, **`SELECT FOR UPDATE` na linha da vaga**, e só então contar e
gravar. A razão é medível: o **mesmo recurso** é disputado por `mudarSituacaoOcupandoPosicao`
(`candidatos.service.ts:1464`), que trava a mesma linha. Sem o lock, um consultor finaliza a última
posição no instante em que outro cancela, e o cancelamento decide sobre fotografia velha.

### 3.3. A trava, e a exceção do Master

**Reuso, não construção nova:** a régua de quem está pendente é `pendentesDeTratamento`
(`domain/candidatura.ts:829`), a mesma da trava 5 do fechamento; o corpo da recusa é
`AsVagaFechamentoBloqueado`; o modal é o `CandidatosPendentesModal`, que já desenha a lista.

**O contrato JÁ PREVÊ a exceção e nunca teve consumidor.** O campo `needsConfirmation: false` do
fechamento existe justamente para dizer que lá **não** há "confirmar mesmo assim"
(`shared-types:2564-2567`). O cancelamento é o primeiro caso em que ele vale `true`, e o tom é o
amarelo de atenção, não o vermelho.

**[P5] "Candidato em processo" é quem está PENDENTE DE TRATAMENTO ou quem está VIVO?** Não é a mesma
pergunta. `ALOCADO` e `APROVADO` estão **vivos** e estão **tratados**. Ou seja: pela régua do
fechamento, **uma vaga com 3 pessoas alocadas cancela sem nenhuma trava**. E cancelar apaga a entrega
da leitura, porque `CANCELADA` **vence tudo** em `desfechoDaVaga`. Leitura do arquiteto, que o
coordenador subscreve: **as duas coisas travam, com pesos diferentes**. Pendentes de tratamento:
trava com aceite de Master. Alocados e aprovados: trava também, porque cancelar vaga que já entregou
gente é reescrever um fato. É decisão do diretor (§A.27).

### 3.4. "Desvincular todos antes": não construir nada [R]

O mecanismo existe inteiro: `registrarSaida` com motivo obrigatório nos dois lados, e as ações em
massa no painel da vaga. O que falta é o **caminho**: hoje o modal de pendentes **lista e não leva**.
A entrega é o botão que fecha o modal de recusa e abre o painel já na aba certa, com a seleção pronta.
Construir um "desvincular em massa" novo seria criar uma segunda porta para o mesmo gesto, com a régua
do motivo obrigatório escrita duas vezes.

### 3.5. O RASTRO, e o impacto cruzado que importa [M]

O `cancelar` **precisa gravar mais do que o status**, e isso é consequência medida de duas leituras
que já existem:

1. **`origemContagem` (`as-vagas-ocupacao.ts:101-105`) devolve `"ausente"` quando a vaga está
   encerrada e o carimbo é nulo.** Sem carimbar `vagas_fechadas` e `vagas_fechadas_banco`, **o
   cilindro da vaga cancelada mostra zero**, e quem foi entregue de fato some da tela.
2. **`diasEmAberto` (`page.tsx:462-466`) devolve `null` para vaga encerrada sem `data_fechamento`**, e
   a célula escreve "não informado". **Toda vaga cancelada ficaria com o contador em branco para
   sempre**, e na onda D essa coluna vira o SLA.

O `UPDATE` é **um só**, com `status`, `data_fechamento`, os dois carimbos de contagem lidos sob o
lock, `cancelada_por_id`, `cancelada_em`, `cancelamento_motivo`, `cancelamento_observacao`, e, quando
forçado, `cancelamento_forcado_por_id/em/pendentes`. **Não existe vaga cancelada sem trilha.**

**[P6] A vaga cancelada mostra quantas posições chegou a entregar, ou o cancelamento zera tudo?**
Recomendação: mostrar, porque o dado é verdadeiro e o `desfechoDaVaga` já diz separadamente que ela
foi cancelada.

### 3.6. Os motivos gerenciáveis: molde `motivos_declinio`, não molde `etapas` [R]

Tabela `motivos_cancelamento_vaga` (`id`, `nome` unique, `ativo`), CRUD no formato de
`admin/motivos-declinio/`. **Motivo não tem ordem, cor, "inicial" nem histórico que precise resolver
rótulo**, porque o **nome** fica gravado na vaga, e não o id: é o que a vaga já faz com
`motivos_contratacao` (`tables.ts:2345-2350`). Usar o molde das etapas seria pagar 545 linhas de
service por uma lista de nomes. Referência de porte: `motivos_declinio` tem **26 linhas** [M], o que
aciona a busca do `Select` (§A.35, busca a partir de 8 opções).

### 3.7. Regras de UI que a entrega nasce respeitando

- **§A.41**: o modal de cancelamento é de preenchimento, então "Voltar" e "Cancelar a vaga", e **não
  fecha ao clicar fora**. Cuidado com a ambiguidade do verbo: um botão "Cancelar" no rodapé ao lado da
  ação "cancelar a vaga" é confusão garantida. **[R]** confirmação diz "Cancelar a vaga", desistência
  diz "Voltar".
- **§A.35**: seletor de motivo é o `Select` do design system, com busca.
- **§A.12 e §A.37**: se o motivo virar coluna, nasce com filtro e ordenação. **[P7]** vira coluna?

### 3.8. O que o `seguranca` vai perguntar, respondido de antemão (§A.38)

1. **"A rota de cancelar é uma segunda porta para o estado encerrado. Quais travas do `fechar` ela
   pula?"** Pula a trava 6 (posições oficiais) inteira, por decisão do diretor, e afrouxa a trava 5 de
   dura para "com aceite de Master". As duas ausências são deliberadas, e a compensação é a trilha.
2. **"Onde está a autoridade da exceção?"** No service, não no handler. 403 para COMUM com `forcar`.
3. **§A.6**: o corpo da recusa carrega `candidatoNome`, que **não é novo**: é o mesmo contrato já em
   produção no fechamento e já auditado. Nenhum CPF, nenhum contato, nenhum id de pessoa a mais.
4. **"Quem mais escreve `vagas.status`?"** Item 2.1, com prova.

---

## 4. A AVALIAÇÃO DA ORDEM

**Veredito: B, C, D, E está CERTA, e não se recomenda reordenar as ondas.** Recomenda-se **mover dois
itens da D para a C** e **partir a C em duas**. Procurou-se inversão de dependência e encontrou-se
uma só, e ela aponta na mesma direção da ordem do diretor.

### 4.1. Por que B primeiro está certo

1. **B muda a FORMA de um valor que tudo lê**, inclusive o KPI, o sort e o filtro **da mesma tabela
   que a D quer redesenhar**. Fazer a geometria e os KPIs da D primeiro é refazê-los na B.
2. **O SLA da D é definido sobre "aberta até fechar", e "encerrada" é o que a B transforma em flag.**
   Construir o SLA sobre a lista literal que a B vai apagar é construir sobre o que está sendo demolido.
3. **O cancelamento (B1) escreve `data_fechamento` e os carimbos, que são insumo do SLA (D).** Na
   ordem inversa, toda vaga cancelada leria "não informado" no SLA até alguém reparar.

### 4.2. Onda C: a colisão de nome, e como não confundir os dois [R]

| | "Projeto da vaga" (onda C) | `projetos_alto_volume` (existe) |
|---|---|---|
| o que é | **linha de serviço comercial** da A&S | **operação sazonal nomeada** de um cliente |
| valores | 5 fixos: Pontuais & Estratégicas, RPO & BPO, Alto Volume, SouFast, OneShot | 19 linhas reais |
| tem período, cota, grupo | não | sim |
| pendura em | **vaga** | **admissão** (unique por admissão) |
| quem usa | A&S, na abertura | Gerencial, no painel de Alto Volume |

- **catálogo SEPARADO, sem FK para `projetos_alto_volume`.** Um `vagas.projeto_id` seria lido pela
  próxima pessoa como FK para a tabela que já existe.
- **o nome DA COLUNA não pode ser `projeto`.** Nome de coluna é decisão da fábrica: **[R]**
  `vagas.linha_servico`, tabela `as_linhas_de_servico`, com comentário registrando que o rótulo da
  tela diz outra coisa e por quê.
- **o RÓTULO DA TELA é do diretor (§A.14/§A.31). [P8] Proposta: renomear para "Linha De Serviço" ou
  "Modalidade", porque "Projeto" já é um menu do sistema com outro significado e 19 registros vivos.**
  Se ele mantiver "Projeto", o desenho funciona igual, só fica mais fácil confundir na conversa.
- registrar a ponte futura: no dia em que uma vaga "Alto Volume" precisar apontar **qual** projeto,
  isso é um segundo campo e uma frente própria.

### 4.3. O que vale JUNTAR: o achado mais caro da avaliação [M]

**Três das quatro ondas mexem na largura da MESMA tabela, e a D promete "resolver de vez" no meio do
caminho.** Estado medido em 10/09 (`page.tsx:2483-2489`): a 1600px com o menu aberto, a tabela está
**no piso do conteúdo**, 1223px contra 1254px úteis, **31px de folga**.

- **C acrescenta**: se "projeto" virar coluna, a tabela volta imediatamente para a rolagem horizontal.
- **D remove**: tirar Cargo libera cerca de **114px** (medido: 114,2px), e a engrenagem devolve boa
  parte dos **94px** que o botão de texto custou (a célula passou de 148px para 242px).
- **E acrescenta**: comercial e segmento, mais duas.

**Rodando C antes de D**, a tabela passa o intervalo entre as ondas em rolagem horizontal, e o diretor
vai reportar como regressão. **Rodando D antes de C**, a largura é "resolvida de vez" e consumida na
onda seguinte.

**[R] Nenhuma das duas:**
1. **decidir AGORA o CONJUNTO FINAL de colunas** das ondas C, D e E juntas (§A.30 é a pergunta ao
   diretor, §A.37 é a obrigação de a coluna nova nascer com filtro e ordenação);
2. **mover "tirar a coluna Cargo" e "resolver a largura" da D para o FIM da última onda que acrescenta
   coluna**, e medir **uma vez só**, numa sessão de browser, com uma screenshot (§A.13/§A.20).

É a §A.40 aplicada: medir a mesma tabela em três ondas custa três rodadas seriais pela mesma pergunta.

**Atalho que dissolve o conflito: [P9] "Projeto da vaga" vira COLUNA na tabela, ou fica só na ficha e
no formulário?** Não virando coluna, a colisão C/D desaparece inteira.

### 4.4. O que vale SEPARAR: a onda C tem metade barata e metade cara [R]

| item | custo | por quê |
|---|---|---|
| **idioma com nível** | **barato** | muda a forma de `idiomas text[]` para estruturado. **3 vagas no banco** [M]. Nenhum catálogo novo. |
| **projeto da vaga** | **médio** | catálogo novo (molde `motivos_declinio`), coluna, uma linha em `VAGA_OBRIGATORIOS`, talvez coluna com filtro e ordenação. |
| **cidades por estado (IBGE)** | **caro, é outra frente** | 5.570 municípios. Não cabem em `shared-types` (`REGIOES_POR_UF` já são 373 linhas no bundle que TODA tela carrega). Exige tabela, endpoint, filtro por endpoint (§A.37), e decidir o destino das 373 linhas atuais. |

**[R] partir em C1 (idioma e projeto) e C2 (cidades IBGE).**

**A janela de tempo é argumento independente e forte [M]:** o banco tem **3 vagas**, e as 3 usam
`idiomas` e `regioes`. A base histórica (2.363 vagas) **ainda não foi importada**. É o mesmo argumento
que renomeou `posicoes` para `posicoes_oficiais` em 25/08 (`tables.ts:2275-2277`). **Toda mudança de
FORMA de coluna da vaga custa 3 linhas hoje e 2.363 depois.**

**[P10] A importação da base histórica está prevista para quando? Se vier antes das ondas C ou E, a
conta inverte e as mudanças de forma passam a ser as mais urgentes de todas.**

### 4.5. A única dependência encontrada: o SLA depende da C [M]

**Não existe NADA de SLA no sistema:** zero colunas com `sla` no nome, em toda a base. O item mais
caro da onda D não é caro por código: é caro porque **ninguém definiu o que é o SLA**.

**[P11] A meta de SLA é um número fixo para todo mundo, ou varia por cliente, por natureza, ou por
LINHA DE SERVIÇO?** Os nomes da lista da onda C sugerem a resposta: **"SouFast" não pode ter o mesmo
SLA de "Alto Volume"**. Variando por linha de serviço, **a coluna de SLA da onda D depende do catálogo
da onda C**. É a única inversão possível encontrada, e ela **confirma** a ordem do diretor.

Se o alvo for por linha de serviço, ele mora **no catálogo da C** (uma coluna `sla_dias` na linha), e
a onda D só lê. **[P12] O selo de atenção "a 2 ou 3 dias" é antes do vencimento ou de atraso?** A
frase admite as duas leituras.

### 4.6. O que já existe, e portanto encolhe cada onda

- **B encolhe na leitura**: `CANCELADA` já tem os 4 pontos prontos, e o `needsConfirmation: true` já
  existe no contrato, com o padrão de modal de exceção de Master já construído duas vezes. **B não
  encolhe na escrita**: catálogo, trilha, motivos e RBAC são novos.
- **D encolhe muito nos KPIs de posições**: **nenhum trabalho de backend**. `finalizadasOficial`,
  `finalizadasBanco`, `posicoesOficiais` e `posicoesBanco` já chegam na tela. A faixa de KPIs já sabe
  se comportar com N cards.
- **D encolhe na engrenagem**: troca de ícone, e **devolve** largura.
- **E encolhe, mas não pelo motivo esperado [M].** Comercial e segmento **não existem**: zero colunas
  na base, nada em `clientes`, e `usuarios.papelAs` só conhece `CONSULTOR` e `RECRUITER`. E encolhe
  porque os dois provavelmente estão **na entidade errada**: "segmento da empresa" é atributo **do
  cliente**, e replicá-lo em cada vaga cria duas versões do mesmo fato. **[R]** os dois moram em
  `clientes`, e a vaga **lê por join**, como já faz com `clienteNome`. **[P13] Comercial e segmento
  são do CLIENTE (e a vaga herda) ou da VAGA (e variam entre duas vagas do mesmo cliente)? Muda o
  tamanho da onda E por um fator de dois ou três.**
- **ARMADILHA NA E [M]:** morando em `clientes`, a onda E **trabalha a tela de Clientes**, e isso
  aciona a **§A.36**, que manda corrigir o `<select>` nativo do Tipo De Marcação. Medido: a tela tem
  **quatro** `<select>` nativos (linhas 384, 408, 451, 511), não um.

### 4.7. Resumo

| onda | veredito | ajuste recomendado |
|---|---|---|
| **B** | **certa, e primeiro** | partir em **B1 cancelar** e **B2 status gerenciável** |
| **C** | **certa, depois da B** | partir em **C1 idioma e projeto** e **C2 cidades IBGE**; absorver a geometria da D |
| **D** | **certa, depois da C** | **SLA depende do [P11]**; os itens de tabela sobem para a C |
| **E** | **por último, mas não é neutra** | é o **terceiro** toque na largura, e aciona a §A.36 |

**Não se inventou reordenação.** A sequência do diretor está certa e é sustentada por três
dependências técnicas independentes. O que muda é o **recorte dentro das ondas**, por uma razão só:
não medir a mesma tabela três vezes, e não deixar a onda cara segurar a barata.

---

## 5. AS PERGUNTAS PARA O DIRETOR

**P1, P5 e P11 travam a construção** das partes que tocam. As demais não travam.

| # | pergunta | trava o quê |
|---|---|---|
| **P1** | "Análise" vem **antes** de "Aberta" (aguardando aprovação) ou **depois**? | **a onda B2 inteira**: antes = estrutural, custo triplica |
| P2 | Vaga em Análise **recebe candidato**? | o default do flag |
| P3 | Vaga em Análise conta no contador de dias e no SLA? | a onda D |
| P4 | A trilha do status aparece na ficha, ou só existe para auditoria? | uma tela da B2 |
| **P5** | "Candidato em processo" no cancelamento = **pendente de tratamento** ou **vivo** (inclui alocado e aprovado)? | **a trava da B1** |
| P6 | A vaga cancelada mostra quantas posições chegou a entregar? | o carimbo da B1 |
| P7 | O motivo do cancelamento vira **coluna** da tabela? | §A.37 (filtro e ordenação junto) |
| P8 | Renomear o rótulo "Projeto da vaga" para "Linha De Serviço"? | só o rótulo |
| **P9** | "Projeto da vaga" vira **coluna** na tabela? | **decide se C e D colidem na largura** |
| P10 | Quando entra a importação da base histórica (2.363 vagas)? | inverte a urgência das mudanças de forma |
| **P11** | A meta de SLA é fixa, por cliente, por natureza, ou por linha de serviço? | **o SLA da onda D, e pode amarrá-lo à C** |
| P12 | O selo é 2 ou 3 dias **antes de vencer** ou **de atraso**? | a regra do selo |
| P13 | Comercial e segmento são do **cliente** ou da **vaga**? | dobra ou triplica a onda E |
| P14 | **Conjunto FINAL de colunas** da tabela, considerando C, D e E de uma vez (§A.30) | permite medir a largura uma vez só |

---

## 6. PRÓXIMOS PASSOS

1. **Feito:** levar ao diretor o mapa (item 2) e a avaliação (item 4.7), com as perguntas do item 5.
   Ele foi explícito: **não construir o status até ver o mapa**.
2. **Antes do primeiro despacho**, passar este mapa pelo `seguranca` (§A.40 regra 1), com foco na
   **segunda porta para o estado encerrado** (3.8) e na **direção fail-open de `vagaRecebeCandidato`**
   (2.2). Os dois são acháveis sem uma linha de código existir.
3. Despachar o `tester` **junto com a construção**, não depois (§A.40 regra 2), com dois requisitos
   que já dá para escrever: "a tela nunca oferece um status que o backend recusa" (item 1.4) e "vaga
   cancelada mostra contagem e dias, nunca 'não informado'" (item 3.5).
4. O conserto do item 1.4 não precisa esperar a onda B, mas toca código validado: §A.26, pergunta
   antes.
