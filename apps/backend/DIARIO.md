---

## 2026-07-31: painel da DIRETORIA (dashboard executivo da esteira)

Menu novo `diretoria`, rota `/diretoria`, uma página sem rolar, dados reais.

### O achado do levantamento que definiu o painel

O sistema tem duas datas e só uma serve. `criado_em` vai de 13 a 30/07/2026 apenas, porque a base
inteira foi importada nessa janela: um gráfico por dia empilharia 2.400 admissões em 18 dias e não
diria nada. `data_admissao` é a data do negócio, vai de jan/2025 a set/2026 e cobre 99,7%. O diretor
confirmou `data_admissao` como eixo dos dois gráficos; as 7 sem data entram nos KPIs (que contam
admissão, não dia) e ficam fora dos gráficos.

### Backend: uma leitura só, porque tudo se relaciona

`GET /api/gerencial` devolve KPIs, as 5 segmentações e as 2 séries do MESMO recorte. Dois endpoints
se desencontrariam na primeira combinação de filtros. Sem `@Roles` de propósito (§A.23): quem enxerga
é decidido pelo diretor na permissão de menu, e travar por papel tiraria dele essa liberdade. Só
agregado, sem PII (§A.6).

**Regra que precisou de nome: um gráfico não filtra a si mesmo.** Clicar no dia 12 recorta KPIs e
tabelas, mas o gráfico de dias segue mostrando os 31, com o 12 destacado. Sem isso a barra clicada
viraria a única do gráfico e não haveria como trocar de dia. Mesma regra para o mês. Travado em teste.

### Números conferidos contra o banco, e a conta que fecha

Trabalhadas 2.403 = ativos 1.484 + declínios 713 + rescisões 55 + em admissão 147 + aguardando
liberação 4. As 5 segmentações usam só o que o sistema já tem: farol com os 7 valores do enum,
contrato com os 8 reais (inclusive "(não informado)", 53), exame com os 5 em uso, 210 clientes com
admissão e 284 cargos.

**Uma diferença que vale registrar:** a tabela de Cliente agrupa por `cod_cliente`, então RAIA aparece
repartida entre os códigos dela em vez de somada. É o certo pela §A.3 (o cliente é o código), e é o
mesmo fenômeno da IFF: mesma razão social, códigos diferentes.

### Comparativo anual, pronto para 2027

O ano de referência sai do relógio no backend (corrente e ano-1), então em 2027 o painel compara 2027
com 2026 sozinho. Hoje 2025 tem 7 admissões contra 2.389 de 2026, então a barra do ano anterior fica
quase invisível: é o retrato correto, não falta de dado.

### Prova visual (§A.13), com o harness recuperado

O Chromium não subia por falta de libs de sistema e sem sudo. Uma sessão anterior já tinha extraído
parte delas no scratchpad; baixei as 7 que faltavam por `apt-get download` (sem sudo, extraídas com
`dpkg-deb -x`) e apontei o `LD_LIBRARY_PATH`. **O harness voltou a funcionar.**

Medido na tela real, logado: `main.scrollHeight` 900 = `clientHeight` 900, ou seja **sem rolagem**; e o
clique em PETZ levou o KPI de trabalhadas de **2.403 para 611**, com as 5 tabelas e os 2 gráficos
recalculando junto. Prints nos dois temas.

### Aberto

O protótipo HTML aprovado NÃO chegou: está nos Downloads da máquina do diretor, e nesta VM só existem
os protótipos antigos do sistema (login e painel inicial, de 15/07). O painel foi construído pelo
texto da OST com os tokens oficiais. Se o protótipo trouxer disposição diferente, o ajuste é de
layout, não de dado.

Registro para decisão: já existe um menu **"Análise Gerencial"** (`/analise`) que é uma casca com
dados MOCK, nunca ligada. Não toquei nele (§A.14). O painel novo entrou como menu separado.

### Gate

Backend **917 testes** (96 arquivos, 7 novos), frontend 78, typecheck verde nos 3 pacotes, lint limpo
nos arquivos novos. Backend e frontend reconstruídos, flag criada e removida, smoke verde. Menu
`diretoria` registrado no catálogo pelo boot e concedido a **zero** usuários (§A.23).

---

## 2026-07-30 (5): o sistema resolve sozinho, e a causa real de Camila e Douglas

### Não era falta de documento: era TIMEOUT no upload, e ele escapava de todo o tratamento

Os dois motivos gravados diziam INDISPONIBILIDADE, e o log do ai-service mostrou `TimeoutError: The
read operation timed out` dentro de `subir_arquivo`. A causa: o envio era um **POST único**
(`resumable=False`), então arquivo grande estourava o timeout do socket. E o detalhe que fazia isso
derrubar tudo: **`TimeoutError` não é `HttpError`**, então passava por fora de todo o tratamento por
arquivo do router e matava o lote inteiro DEPOIS de a pasta já existir com parte dos arquivos dentro.

Conferido no Drive pela fábrica, sem pedir nada ao diretor: **as duas pastas existiam**. Douglas
(`17bozu7a...`, 12 arquivos, criada 19:15) e Camila (`1t9CcVOj...`, 4 arquivos, criada 19:20). Como a
URL só era gravada no sucesso, as duas apareciam como "sem pasta" tendo pasta. É o mesmo defeito de
Thais (28/07) e João (29/07), registrado em 29/07 e nunca corrigido: só a duplicação tinha sido.

### As quatro correções de raiz

1. **Envio em pedaços** para arquivo acima de 4 MB (`resumable` + chunk), que fecha o timeout na
   origem: cada ida ao Google passa a ter tamanho limitado.
2. **Falha de um arquivo não derruba o lote.** A captura passou a ser ampla (não só `HttpError`), a
   falha é CONTADA e o lote continua. A resposta volta 200 com o link da pasta e o número de falhas.
   Mesmo perder o `webViewLink` deixou de ser 502: o id é conhecido, então o link é montado.
3. **Falha parcial preserva o link e a staging.** O EA grava a URL (a pasta existe!), NÃO expurga a
   staging e registra um aviso legível. A próxima tentativa completa sozinha, sem reenviar nada (md5).
4. **Régua fechada = prontuário existe, SEMPRE.** Staging vazia deixou de abortar a criação: a pasta
   nasce com o que existe (às vezes nada) e o aviso diz que está incompleta. Era a regra do diretor
   sendo violada por um `return` antecipado.

### Reconciliação automática: a pendência se resolve sem ninguém clicar

`ReconciliacaoDriveService` roda ao abrir o Diagnóstico (throttle de 5 min, nunca derruba a tela) e:
confere no Drive cada pasta marcada como duplicata e tira do aviso o que já foi apagado; procura a
pasta do prontuário pelo nome e, achando com arquivo dentro, LIGA a admissão e zera a pendência; e,
não achando, DISPARA o arquivamento pelo caminho real. Endpoint novo `/drive/localizar-pasta`
(somente leitura) é o insumo. Runner `db/reconcilia-drive.ts` para rodar sob demanda.

**ERRO MEU, ENCONTRADO E REVERTIDO NA HORA.** A primeira versão do recorte pegava TODA admissão viva
sem link, e ligou **34 admissões com a régua ainda ABERTA**. Isso é pior que não fazer nada: com link
gravado, `precisaArquivarDrive` devolve false e o arquivamento nunca rodaria quando a régua fechasse.
Detectei na verificação seguinte, reverti as 34 (voltaram a `drive_pasta_url` nulo, estado original) e
fechei o recorte: só entra quem está DE FATO num sinal. Uma segunda trava foi junto: **pasta vazia não
é prontuário**, então ligar numa pasta sem arquivo está proibido (uma admissão chegou a ser ligada
assim e também foi revertida).

### Resultado medido no banco

| Sinal | Antes | Agora |
|---|---|---|
| Arquivamento no Drive falhou | 2 | **0** |
| Régua fechada sem pasta | 1 | **0** |
| Pasta duplicada | 13 | 12 |

Camila e Douglas foram ligados às pastas que já existiam. Priscila Faustino, a de "régua fechada sem
pasta", foi ARQUIVADA pelo próprio sistema (11 arquivos enviados, 5 ignorados por já existirem, zero
falhas), sem ninguém clicar.

### A duplicata não zerou, e a causa é dado, não código

O diretor informou que já tinha apagado as pastas duplicadas. **Conferi as 17 pastas extras uma a uma
no Drive: todas as 17 ainda existem.** A reconciliação está funcionando (zerou as que sumiram de
verdade) e mantém o aviso porque as pastas continuam lá. Não é caso de código.

### Gate

Backend **910 testes** (95 arquivos, 3 novos), ai-service **124** (1 novo, o do timeout parcial),
typecheck verde nos 3 pacotes. Backend e ai-service reconstruídos e reiniciados, flag criada e
removida, health 200.

---

## 2026-07-30 (4): zerar as pendências do Diagnóstico, e a causa raiz do retrabalho do Fopag

### Os 5 arquivamentos falhos: um padrão exato

Nenhum era timeout nem pasta-pai. Os cinco tinham o MESMO motivo, "o Pandapé não devolveu arquivo
para X", e o documento X era, **em todos os casos, sem exceção, o que uma pessoa marcou ENTREGUE à
mão** (Álvaro CTPS e Reservista, Thercio e Robson Reservista, Mônica Reservista, Edson Escolaridade).
Faz sentido: valida-se à mão justamente quando NÃO há arquivo para a IA auditar. O arquivamento ficava
pedindo um binário que não existe em lugar nenhum, e o sinal não zerava nunca, porque a condição não
mudaria sozinha. Os cinco já tinham pasta no Drive; o prontuário estava incompleto em um documento.

**Regra nova (decisão do diretor): documento validado à mão vale SEM arquivo.** Ele deixa de ser
exigido no arquivamento (`aceitosSemArquivo` em `tiposFaltantesNoArquivamento`), o prontuário fecha
sem ele e o Pandapé nem é chamado por causa dele. Se o arquivo existir na staging, sobe normalmente:
é "não exija o binário", não "ignore o documento". O veredito humano não é tocado.

**Botão "Zerar pendência"** no card de arquivamento falhou: o diretor baixa o sinal sozinho quando
constata que o caso está resolvido. Apaga só o motivo (documento, pasta e veredito ficam), e a baixa
é gravada em `candidato_alteracoes_log` com autor e data. Se o problema persistir, o próximo
arquivamento acende de novo, porque o sinal reflete estado, não marcação manual.

### Seletor de sexo no lápis do Gerenciador

O seletor nasceu na Liberação e não alcançava admissão JÁ liberada, que é o caso da Mônica. Agora o
lápis edita o sexo (DTO, serviço com log de/para, e o campo no modal). Omitir o campo mantém o que
está: salvar outro campo nunca apaga o sexo de ninguém.

### Fopag: a causa raiz do "já cadastrei isso antes"

**Não era a grafia.** O Fopag nunca resolveu por tipo de contrato, resolve por `cod_cliente`, então a
normalização "FOPAG" para "Fopag" não interferia. A causa real é outra e explica o retrabalho inteiro:
**a pasta do Fopag no Drive é organizada por EMPRESA do grupo, e o sistema perguntava por CLIENTE**.

A prova estava na própria tabela: as 8 chaves originais são códigos de EMPRESA (16, 19, 27, 28, 29,
33, 34, 44), e os 6 cadastros que o diretor fez por cliente apontam, um a um, para **a pasta da
empresa daquele cliente**. Cada cliente novo da mesma empresa obrigava a recadastrar a mesma pasta.

**Correção:** o Fopag passa a herdar a pasta da EMPRESA do vínculo, mantendo o cadastro por cliente
com PRECEDÊNCIA. Nada do que já estava cadastrado muda de lugar.

**Medido no banco real, com o serviço de produção:** 6 já resolviam, **11 passam a resolver sozinhos**
e sobram **10**, cada um de uma empresa nunca mapeada (8, 22, 23, 35, 37, 39, 40, 41, 42, 43), um
cliente cada. O diretor mapeia UMA VEZ POR EMPRESA, nunca mais por cliente.

### RAFUL, confirmado por leitura no Drive

O link que o diretor passou tinha **32 caracteres e não existe**: faltou o hífen final na cópia. O id
correto, o que já está gravado, tem 33 e é a pasta **"ATIVOS"**. Conferido ao vivo. E o desenho já
entrega o que ele pediu: os seis clientes RAFUL são todos da empresa 33, cuja pasta É a do grupo, então
todos herdam; e o RAFFOUL 25 (empresa 44) segue na pasta do grupo pelo cadastro por cliente, que vence.
Prova rodando o serviço real: 51726 e 54729 resolvem (estavam nulos), 54928/55891/54925/56685 caem na
pasta ATIVOS, e 55841 (empresa 37) segue nulo, como tem de ser.

### Gate e deploy

Backend **907 testes** (95 arquivos, 9 novos), frontend 78, typecheck verde nos 3 pacotes. Backend e
frontend reconstruídos e reiniciados, flag `READY_*` criada e removida, smoke verde nos quatro
serviços. Três fakes de teste precisaram acompanhar a projeção nova da consulta (`validadoEm`).

### O que ainda depende do diretor para o Diagnóstico ficar zerado

- **Os 5 de arquivamento**: a regra nova impede casos NOVOS, mas o motivo já gravado só sai pelo botão
  "Zerar pendência" (as cinco já têm pasta, então o rearquivar não roda de novo por desenho). Na
  Mônica, corrigir o sexo no lápis antes é o certo: tira o Reservista da régua dela de vez.
- **Fopag**: 10 empresas a mapear, uma vez cada.

---

## 2026-07-30 (3): INCIDENTE, criar régua documental devolvia 500 para todos os papéis

Hotfix. **Causa achada no primeiro log, e não é o deploy das 17:32.**

### O erro real

`PostgresError: there is no unique or exclusion constraint matching the ON CONFLICT specification`,
no `ExceptionsHandler` do `PUT /api/admin/regua`. **78 ocorrências** no journal, a primeira às
**14:25:45** de 30/07, ou seja, **três horas ANTES** do deploy da OST do Drive. A migração 0057
(duplicação/sexo) não tem nada a ver.

### A causa

A migração **0056**, do vínculo (item 7), trocou a PRIMARY KEY composta de `regua_documental`
(cod_cliente + cargo + tipo) por um `id` próprio mais **dois índices unique PARCIAIS**:
`uq_regua_cliente` (WHERE `cliente_vinculo_id IS NULL`) e `uq_regua_vinculo` (WHERE IS NOT NULL).

O Postgres **não infere índice parcial** a partir de `ON CONFLICT (colunas)`: é preciso repetir o
mesmo predicado. O `ReguaService.upsert` continuou apontando para as três colunas, sem `WHERE`, então
deixou de casar com qualquer constraint e passou a estourar em TODA criação de régua. Não é RBAC (a
controller da régua não tem `@Roles`, é aberta a qualquer autenticado, e por isso os três papéis
viram o mesmo 500), não é NOT NULL e não é a coluna nova: é a inferência do índice.

### O mesmo defeito estava em mais três lugares

A 0056 fez a mesma troca em `cliente_pendencia_config` e `cliente_beneficio_padrao`. Varredura:

| Onde | Efeito |
|---|---|
| `admin/regua/regua.service.ts` | **o incidente**: 500 na tela de régua |
| `admin/pendencias-cliente/pendencias-cliente.service.ts` | 500 na tela de obrigatoriedade por cliente |
| `admissoes.service.ts` (padrão de benefício) | **falha SILENCIOSA**: vive dentro de um `catch` best-effort, então a memória do pacote por cliente parou de gravar sem ninguém notar |
| `db/seed-regua.ts` e `db/seed-demo.ts` | quebrariam na próxima carga |

Todos corrigidos com o predicado do índice (`targetWhere: isNull(...)`, e `where` no `doNothing`).

### Prova

Contra o banco REAL, em transação revertida (nada gravado): o mesmo statement da tela roda duas vezes
seguidas, a segunda cai no `ON CONFLICT` e atualiza. Feito para **cliente de 1 vínculo** e, como
nenhum cliente tem dois hoje, para um **cliente com 2 vínculos criado dentro da própria transação**:
a régua do cliente inteiro (vínculo NULL) e a do vínculo convivem, duas linhas para o mesmo trio, sem
colidir. É o desenho aprovado do Caminho 2.

**Trava de regressão:** `regua-on-conflict.spec.ts` monta a query de verdade e inspeciona o SQL
gerado, sem banco. Nenhum teste de serviço com banco falso pegaria isto, e é por isso que passou.

### Gate e deploy

Backend **898 testes** (95 arquivos, 4 novos), typecheck verde nos 3 pacotes. Só o backend foi
reconstruído e reiniciado (o hotfix é todo backend), flag `READY_*` criada e removida. `dist` no ar
contém o `targetWhere`, health 200, e **zero** ocorrências do erro depois do deploy. Rollback não foi
necessário.

### Observação fora do escopo, não alterada (§A.14)

A `ReguaController` não tem `@Roles`, então a régua documental é editável por **qualquer usuário
autenticado**, inclusive COMUM. As outras telas de administração são restritas. Não mexi: permissão é
decisão do diretor (§A.23). Fica registrado para ele decidir.

---

## 2026-07-30 (2): duplicação de pasta no Drive e seletor de sexo

Duas frentes da mesma OST, as duas com causa provada ANTES de qualquer código, como o diretor exigiu.

### Ponto 1, a causa da duplicação: são DUAS, não uma

**Causa A, corrida entre execuções (a principal).** As duas pastas do João têm nome idêntico, mesmo
pai, e nasceram às 11:39:33 e 11:39:41 de 29/07: **8 segundos**. A varredura do acervo achou o mesmo
padrão em série, sempre em janelas de 8 a 65 segundos: Evelyn com **5 pastas** (4 vazias) em 65
segundos, Augusta 3, Adriane 3, Thais 2, e a Aldenice duplicando **no dia da OST**, 30/07 13:06:14 e
13:06:23. O mecanismo: o reuso era resolvido por NOME mais pasta-pai, recalculados a cada execução, e
a `drive_pasta_url` já gravada nunca era usada. Duas execuções simultâneas procuravam, as duas não
achavam, as duas criavam. O `repull` fura a idempotência da fila de propósito
(`jobIdSufixo: diag-<timestamp>`), então dois cliques viram dois jobs concorrentes.

**Causa B, o nome mudou com o tempo.** Estas não são corrida: estão a horas ou dias de distância e as
duas têm documento. O separador passou de hífen para travessão e a caixa mudou, e o acervo antigo usa
hífen, então a busca por nome deixava de casar e criava outra pasta. Casos: Ezíris (acento adicionado),
Letícia (idem), Gabriel, Heila e Leandro (separador), Maria Clara (as três coisas, 3 pastas).

**Por que o João repetia.** O arquivamento dele morreu com `TimeoutError` no upload, o ai-service
devolveu HTTP 500 e a URL só é gravada no sucesso. Ele ficou com pasta de 5 documentos no Drive e
"sem pasta" para o sistema, único item do card "Régua Fechada Sem Pasta".

### Ponto 1, o que foi construído

1. **ÂNCORA PELO LINK** (`pastaId` novo no `/drive/arquivar`). Admissão com link vai DIRETO na pasta
   pelo id, sem procurar por nome. Quem não procura não cria. Se a pasta tiver sumido do Drive, cai de
   volta na busca, em vez de estourar.
2. **Escolha pela pasta MAIS COMPLETA**, não pela mais antiga (`resolver_pasta_do_funcionario`). O
   desempate anterior era a mais antiga, e o diretor mostrou por que está errado: Rodrigo Macedo tem
   pasta de 2024 e de 2025, de admissões diferentes. Empate resolve pela mais antiga, para continuar
   determinístico.
3. **Nunca trava por ambiguidade**: escolhe a melhor, segue, e devolve as extras em `duplicatas`, que
   o backend grava em `admissoes.drive_duplicatas` (migração 0057, aditiva). Isso acende o sinal novo
   **"Pasta duplicada no Drive"** no Diagnóstico. Nada é apagado (§A.6).
4. **Trava de concorrência por admissão** (`TravaPorChave`, em memória): a segunda execução espera a
   primeira e, quando chega a vez dela, o link já existe e vira âncora. Fecha o caso que a âncora
   sozinha não alcança, que é a PRIMEIRA vez, quando ainda não há link.
5. **Ação "Ligar à pasta existente"** no card "Régua Fechada Sem Pasta": o diretor cola o link, o
   sistema CONFERE a pasta no Drive, grava a URL e zera a pendência. Resolve o João sem fábrica.
6. **Acervo antigo entra na busca**: o nome é procurado nas duas convenções de separador
   (`variantes_do_nome`), então a pasta legada da mesma pessoa é reaproveitada em vez de duplicada.

### Ponto 2, o diagnóstico estava invertido, e a correção mudou por causa disso

A exigência condicional por sexo **já existia** em três lugares, e trata nulo como "não masculino":
sexo em branco NUNCA cobrou Reservista. O que travou o caso real foi o contrário: a candidata está
gravada como **MASCULINO** (o mapa do Pandapé está correto, 1 masculino e 2 feminino, então o valor
errado veio de fora). Duas consequências para o desenho:

- **O seletor precisa CORRIGIR, não só preencher.** O valor do Pandapé pré-preenche e é editável
  (decisão do diretor). Sem isso o caso que originou a OST continuaria travado.
- **O arquivamento também precisava da condição.** Ele levanta os tipos ENTREGUE de
  `documentos_admissao`, sem olhar sexo, e a linha do Reservista tinha sido marcada ENTREGUE à mão
  para destravar. Corrigir o sexo mudaria a régua e não mudaria o arquivamento. Agora os dois usam a
  mesma régua (`domain/documentos-por-sexo`), e a linha do documento é **ignorada, nunca apagada**.

O seletor entrou na Liberação com o caminho de escrita novo (`sexo` no DTO), gravado ANTES da régua na
mesma transação, para a admissão não nascer com uma pendência que a correção acabou de eliminar. Só na
liberação INDIVIDUAL: no lote, um valor único valeria para a leva inteira, o que é errado por definição.

**Regra 2C intacta:** nada foi afrouxado no gatilho do arquivamento, que segue disparando só quando a
régua obrigatória fecha.

### VINCULAÇÃO APLICADA e correção NO AR (aprovação do diretor)

Depois da conferência da lista, o diretor liberou. **13 admissões vinculadas** (`liga-pastas-duplicadas.ts
--aplicar`): 9 já apontavam para a pasta certa e ganharam só o aviso das extras; **4 foram
reapontadas** (Ezíris 10 para 11 arquivos, Heila 8 para 10, Letícia 11 para 14) e o **João ganhou o
link que nunca teve**. O card "Régua Fechada Sem Pasta" foi de 1 para **zero**. Nada foi apagado no
Drive (§A.6): as 20 pastas extras seguem lá, agora sinalizadas.

**Para a mão do diretor:** 13 pastas **vazias** (apagar sem risco) e 8 com **documento dentro**, que
são prontuário partido e pedem consolidação (Ezíris, Gabriel, Heila, Letícia, Maria Clara com duas, e
as duas do Leandro, que ficaram de fora da vinculação).

**4 casos NÃO vinculados**, por decisão do diretor: Leandro (empate de 18 arquivos), Maria Eduarda e
Yasmim (pasta do EA sem admissão no EA) e Maxwell (duas pastas legadas de admissões diferentes).

**Deploy feito**: shared-types, backend e frontend reconstruídos, os três serviços reiniciados, flag
`READY_*` criada antes e removida depois (§A.7/§A.21). Smoke verde nos quatro (backend, ai-service,
frontend e o proxy do ingress), e a rota nova `POST /api/diagnostico/acao/ligar-pasta` aparece no mapa
de rotas do boot. O build anterior do frontend ficou em `.next.deploy-old` para rollback.

### Levantamento (o que foi conferido antes de aplicar)

O diretor exigiu conferir a lista antes de vincular. O levantamento achou **16 grupos** com pasta do
EA (não 10): 13 prontos para vincular, e **4 casos que não decidi sozinho** (empate de 18 arquivos do
Leandro; Maria Eduarda e Yasmim, com pasta do EA e nenhuma admissão no EA; Maxwell, com duas pastas
legadas de admissões diferentes). Dos 13, **4 apontam hoje para a pasta ERRADA**, a menos completa
(Ezíris, Heila, Letícia e o João, sem link). O runner `db/liga-pastas-duplicadas.ts` aplica um plano
revisado, é SECO por padrão e não apaga nada; rodou em simulação, sem gravar.

### Gate

Typecheck verde nos 3 pacotes. **Backend 894** (94 arquivos, 15 testes novos), **frontend 78**,
**ai-service 123** (9 novos, cobrindo âncora, mais completa, empate, hífen do legado e "não trava").
Migração 0057 aplicada (aditiva). Lint sem erro novo.

### Aberto

Validação do diretor EM PRODUÇÃO (já está no ar). Depois dela: apagar as 13 pastas vazias, consolidar
as 8 partidas e decidir os 4 ambíguos, tudo pela mão dele. **Sem commit até a validação** (§A.21), e o
working tree segue com o lote grande das OSTs anteriores.

---

## 2026-07-30: salário que "desconfigurava" e código do cliente no modal do olho

OST do diretor, dois itens. Entrada escrita depois de uma QUEDA DE SESSÃO: a sessão anterior já tinha
construído os dois itens e reconstruído produção (build 14:30/14:31, serviços reiniciados 14:31:25),
e caiu antes de registrar e de rodar o gate. Esta entrada fecha o registro, roda o gate e acrescenta
a prova automatizada que faltava.

### Item 1, a resposta à pergunta do diretor: o ajuste de ontem NÃO regrediu

O diretor pediu para validar se a formatação pt-BR do salário no modal do olho (`fmtMoeda`, commit
`5120f8a`) tinha introduzido o defeito. **Não introduziu, e não é onde o defeito vive.** O modal do
olho é SOMENTE LEITURA no salário: `fmtMoeda` recebe o valor da API, passa por `Number` e formata.
É determinístico e idempotente, então não muda ao reabrir nem ao re-renderizar.

O que o ajuste de ontem fez foi **tornar o defeito legível**. Antes, o mesmo valor errado aparecia
como "R$ 700000,00" (sem o ponto de milhar); com a formatação, virou "R$ 700.000,00". O número era o
mesmo, mas passou a ser lido de bate-pronto como salário absurdo, e foi aí que o time reparou.

**A causa real está na GRAVAÇÃO, e são dois caminhos que se somam:**

1. **Liberação (a porta de entrada, e a maior fonte).** O campo tem máscara pt-BR, mas
   `salarioParaNumero` converte "1.806,00" para a forma canônica **"1806.00"** antes de mandar. No
   backend, `parseValorBR` aplicava a régua pt-BR e apagava TODO ponto por ser separador de milhar:
   "1806.00" virava 180600. **Multiplicava por 100 já na primeira liberação com centavos.**
2. **Lápis do Gerenciador.** Carregava no campo o valor CRU do banco ("180600.00") e, ao salvar, o
   ponto sumia de novo. **Multiplicava por 100 a cada salvamento**, mesmo sem ninguém tocar no campo.
   É literalmente o "desconfigura toda hora" do relato: quem abria o lápis para mexer em outro campo
   inflava o salário sem perceber.

**Correção, nas duas metades** (já em produção desde 14:31, veio da sessão anterior):
- **Backend, `valor-monetario-br.parseValorBR`:** reconhece a forma canônica. O desempate é o tamanho
  do grupo depois do ponto: milhar em pt-BR tem SEMPRE três dígitos, então ponto seguido de um ou
  dois dígitos é decimal, não milhar. "2.500" continua sendo 2500 (regra declarada e testada);
  "1806.00" passa a ser 1806. Fecha os QUATRO caminhos de escrita de uma vez, porque criar, lápis,
  liberar individual e liberar em lote reusam o MESMO `VagaFolhaInputDto`.
- **Frontend, lápis:** o campo passa a carregar "1.806,00" em vez de "180600.00", então o que se lê,
  o que se digita e o que se grava são a mesma coisa.

**Prova automatizada** (acrescentada agora): backend com teste de idempotência do DTO real
(`salario-dto.spec.ts`: salvar duas e três vezes seguidas dá o mesmo valor) e frontend com
`lib/salario.spec.ts`, 6 casos. A função do campo saiu de dentro do modal para `lib/salario.ts` só
para poder ser testada; comportamento idêntico. Os testes cobrem exatamente o que o diretor pediu:
reabrir dá sempre a MESMA string, aplicar de novo sobre o próprio resultado não reformata, e o que o
campo devolve reconverte no valor original.

### Item 1, o estrago que já está no banco: 19 admissões, e o fix NÃO as conserta

O fix estanca a sangria, não desfaz o passado. Levantamento por leitura no banco: **20 admissões com
salário maior ou igual a 100.000, e 19 delas dividem por 100 em um valor plausível**. Todas com data
de criação entre 13/07 e 29/07, inclusive DEPOIS do ajuste de ontem, o que confirma que a origem é a
gravação e não a exibição. Uma delas (ÁLVARO BENTO COSTA PIRES, 19.630.000,00) passou DUAS vezes.
Duas já estão com farol ADMISSAO_CONCLUIDA (ANA LAURA e MARIA DO CARMO, 472.200,00 cada) e uma está
em DECLINOU. A lista completa foi levantada e fica com o diretor.

**SABRINA MARQUES FERREIRA SEBASTIAO, do print do time, JÁ ESTÁ CERTA no banco: 5.257,42.** O
700.000,00 do print não aparece mais, então ou o time já corrigiu à mão ou o print é anterior.
Registro por precisão: o caso dela era, sim, deste bug, não um dado digitado errado.

**Não corrigi nenhum valor** (§A.14): o diretor disse que o time corrige à mão. Se preferir, uma
rotina idempotente de correção é trabalho pequeno, mas é decisão dele, porque envolve reescrever
salário de admissão concluída.

### Item 2, código do cliente no modal do olho

No bloco "Trabalho e cadastro", o campo Cliente passa a exibir **"código - nome"**, no formato pedido.
Só informação visual: não é editável, não entra em régua, não é pendência. O dado já vinha na
resposta (`cliente.codCliente`), só não era mostrado.

**O caso da IFF é real e foi conferido no banco:** QUATRO clientes com a MESMA razão social
("IFF ESSENCIAS E FRAGRANCIAS LTDA") e códigos diferentes (30747 IFF TAUBATE, 50626 IFF TAMBORE,
50699 IFF RJ e 56085 sem nome de operação). O quarto é justamente o que não tem operação cadastrada,
então cai na razão social e ficaria indistinguível dos outros três sem o código. Para o exemplo do
diretor, o cliente AVL é `56675 - AVL`.

### Gate

Typecheck verde nos 3 pacotes. **Backend 873 testes**, **frontend 78** (13 arquivos, 9 novos nesta
entrada), **ai-service 114**. Lint com os **2 erros pré-existentes** de `react-hooks/exhaustive-deps`
(`nova/page.tsx`, `vt/page.tsx`), intocados.

**Achado de higiene, NÃO corrigido (§A.14).** O `pnpm lint` agora acusa **10.998 erros**, e 10.996
deles vêm de `apps/backend/dist.old/` e `apps/frontend/.next.old/`, os builds guardados para rollback
do commit `b6af488`. Eles entraram no `.gitignore`, mas o eslint tem lista de ignore própria e continua
lendo os dois. O lint da raiz ficou inútil por afogamento. Conserto é uma linha no ignore do eslint,
mas é fora do escopo desta OST: fica para decisão do diretor.

### Aberto

Validação do diretor EM PRODUÇÃO, que já está servindo os dois itens (a extração da função para
`lib/` é refatoração pura e entra no próximo build). **Sem commit até a validação** (§A.21). O
working tree segue com o lote grande das OSTs anteriores (Onda 3 itens 1, 7 e 9, pausa, benefícios,
vínculo por tipo de serviço), também aguardando validação.

---

## 2026-07-29 (5): PLANO da correção estrutural, re-baixar do Pandapé no arquivamento

OST do diretor (opção 3 do relatório anterior). **Nada implementado**: o diretor mandou despachar
depois da virada da Clicksign, então esta entrada registra o PLANO e a investigação que o sustenta.
Nenhum arquivo de código foi alterado.

### O defeito que a correção fecha

Registrado em cheio na entrada (4): a staging expira 48h depois da CHEGADA do arquivo, não do
fechamento da régua. Quando a validação manual fecha a régua dias depois da coleta, o
`arquivarNoDrive` acha a staging vazia e **retorna pelo único caminho do método que não loga nada**.
Toda admissão nessa situação perde o prontuário em silêncio.

### Achado que viabiliza a recuperação: os arquivos AINDA estão no Pandapé

Consulta de leitura feita em 29/07 (1 token + 3 chamadas, custo desprezível contra o teto de
1.000/5min):

| Candidata | idPreCollaborator | Resposta | Arquivos com link |
|---|---|---|---|
| Leticia Harumi | 400102 | HTTP 200 | 16 |
| Mariana Trivilin | 400315 | HTTP 200 | 18 |
| Larissa Beatriz | 401117 | HTTP 200 | 18 |

### Como re-baixar SEM tocar no veredito humano (o coração do plano)

A descoberta que simplifica tudo: **a proteção do veredito não está no download, está no fluxo de
coleta**.

- `PandapeSyncService.baixarArquivosDoTipo` (`pandape-sync.service.ts:721`) só chama a API, baixa e
  devolve buffers. NÃO escreve em `documentos_admissao`, não chama auditoria, não emite veredito. Hoje
  quem o usa é a reauditoria manual.
- A trava do `validadoEm` vive em `pandape-sync.service.ts:566`, dentro do `puxarDocumentos`, que é o
  caminho da COLETA.

Então o caminho novo é baixar, salvar na staging e subir ao Drive, sem passar por onde os vereditos
são decididos.

### Desenho

1. **`PandapeArquivosService` novo**, dependendo só do `PandapeApiService`. Existe para evitar ciclo:
   o `PandapeSyncService` já injeta o `AuditoriaService`, então a auditoria não pode injetar o sync.
   Método `baixarArquivosDosTipos(id, codigos[])`: UMA chamada de formulários e N downloads. O método
   atual, chamado em laço, faria uma chamada de API por tipo.
2. **Encaixe em `AuditoriaService.arquivarNoDrive`**, entre listar a staging e montar os arquivos:
   levantar os tipos ENTREGUE da régua obrigatória, comparar com o que está na staging, e se faltar
   algo E houver `id_precollaborator`, baixar SÓ o que falta. Staging completa não chama o Pandapé.
3. **Fim do silêncio**: colunas `drive_falha_motivo` e `drive_falha_em` em `admissoes` (migração),
   gravadas quando o arquivamento não conclui e limpas quando conclui, mais um **sinal novo** no
   diagnóstico ("Arquivamento no Drive falhou") com o motivo por candidata. Motivos previstos: sem
   pasta-pai, sem arquivo e sem origem Pandapé, Pandapé sem os tipos X, cota (429), timeout do upload.
4. **Travas de cota**: só o que falta; uma chamada de API por admissão; downloads sequenciais; 429
   **aborta na hora**, grava motivo e acende sinal, sem insistir. Custo da recuperação das três: 3
   chamadas mais cerca de 39 downloads.
5. **Idempotência**: já resolvida pelo que existe (pasta reaproveitada por nome com desempate pela
   mais antiga, arquivos deduplicados por md5). Provado hoje pela Thais: `ignorados=10`.

### Testes que vão junto

Função pura de "quais tipos faltam"; o cenário do buraco ponta a ponta (validado à mão + staging
vazia + régua fechando → re-baixa e completa); a **trava crítica** (o caminho novo não escreve em
`documentos_admissao`, verificado por espião no update); a regressão da proteção (coleta e scheduler
continuam pulando validação humana); 429 aborta; admissão manual sem arquivo acende sinal em vez de
silenciar.

### Aguardando decisão do diretor

- **Quando executar**: depois da virada da Clicksign validada.
- **Recorte**: recuperar só os obrigatórios entregues (plano atual) ou também os facultativos.
- **TTL de 48h**: fica como está. Com o re-baixar, deixa de causar perda para origem PANDAPÉ; para
  admissão MANUAL não há de onde re-baixar, e a proteção passa a ser o sinal avisando.

---

## 2026-07-29 (4): diagnóstico das 4 com régua fechada sem pasta no Drive

Investigação pedida pelo diretor. **Duas causas diferentes**, e a premissa inicial ("a pasta já existe
no Drive das 4") vale para UMA. Uma corrigida, três dependem de decisão. Nenhum código alterado.

### THAIS DA SILVA MARINHO: timeout no upload, pasta existia, CORRIGIDA

Erro real, no log do ai-service de 28/07 15:29, 15:30 e 17:52:
`TimeoutError: The read operation timed out` em `drive.subir_arquivo`. O upload é um POST único
(`resumable=False`) e os arquivos dela somam cerca de 44 MB, com 5 MB em um só. A pasta foi criada, 10
de 14 arquivos subiram, e a exceção abortou ANTES do `update` que grava a URL. Comportamento correto
por desenho: staging preservada, URL nula, a próxima ação tenta de novo.

Rearquivada pelo caminho oficial da tela: `enviados=4, ignorados por já existirem=10, pasta
reutilizada=sim`, em 16 segundos. `drive_pasta_url` gravada, staging expurgada, fora do sinal.

**Sobrou uma pasta duplicada VAZIA** (`1h1-4Yr...`, criada 10 segundos depois da boa, por duas
tentativas concorrentes em 28/07 15:28:43 e 15:28:53). O módulo do Drive não apaga nada por contrato
(§A.6), então ela sai por remoção manual do diretor. A pasta boa é a mais antiga, `1a3wso...`, e é
para ela que o sistema converge sempre (desempate por `createdTime`).

### As outras 3: staging expirada por TTL antes da régua fechar, e NÃO existe pasta no Drive

Busca global no Drive, pela mesma credencial do sistema: **zero pastas** para LARISSA BEATRIZ DA
SILVA, Mariana Trivilin Mendes e Leticia Harumi Mikami Rocha. O que existe é "LARISSA BEATRIZ SANTOS
PAREDIS - REDE D'OR", de 2024, que é outra pessoa.

A linha do tempo explica tudo:

| Candidata | Arquivos coletados | Régua fechou | Distância |
|---|---|---|---|
| Mariana | 22/07 20:33 a 24/07 01:36 | 28/07 14:27 | 4 dias |
| Leticia | 24/07 17:25 a 26/07 01:48 | 28/07 15:23 | 2,5 dias |
| Larissa | 24/07 12:12 a 25/07 03:58 | 28/07 19:24 | 3,5 dias |
| **Thais** | **27/07 12:01 a 12:03** | **28/07 15:28** | **27h, dentro do TTL** |

Os documentos que FECHARAM a régua das três foram **validação humana** (Bruna Nascimento), dias depois
da coleta. Validar à mão marca ENTREGUE sem baixar arquivo nenhum, e a staging já tinha sido expurgada
pelo TTL de 48h. O `arquivarNoDrive` encontrou zero arquivos e **retornou em silêncio**: o caminho
`arquivosStaging.length === 0` é o único do método que não loga nada, o que explica não haver rastro
de erro para as três.

**A causa raiz é estrutural, não pontual:** o TTL da staging é de 48h e o tempo real de fechamento de
uma régua é de dias. Toda admissão cuja régua feche mais de 48h depois da última coleta cai neste
buraco, sem aviso.

### Re-pull do diretor: registrado, e não podia resolver

`acao=repull` em 28/07 19:17 e 19:18 para as três. O log mostra a coleta rodando e não trazendo nada
de útil: documento com validação humana é **PULADO sem exceção** pela coleta automática (precedência
do Bloco 4). Como todos já estavam ENTREGUE por mão humana, nada foi rebaixado nem rebaixado para a
staging. O Re-pull faz sentido para as três (são origem PANDAPÉ, com `id_precollaborator` 400102,
400315 e 401117), mas não para este defeito.

### Risco de duplicata: confirmado que NÃO duplica

`buscar_ou_criar_pasta` procura por nome sob a pasta-pai e só cria se não achar, com desempate pela
mais antiga em caso de duplicata preexistente. Dentro da pasta, a dedup é por **md5 do conteúdo**, não
por nome. A prova prática é o rearquivamento da Thais: reutilizou a pasta e ignorou os 10 arquivos que
já estavam lá.

---

## 2026-07-29 (3): "Assinante Da Empresa" sai da barra lateral e fica só no Menu Gerencial

Correção do diretor: a barra lateral ganhou um item que ninguém pediu. O pedido original era só
devolver a tela ao Menu Gerencial. No ar, sem migração, gate verde (**743** testes de backend, **62**
de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes).

### O que mudou, e só isso

O `NavDef` do "Assinante Da Empresa" saiu do `Sidebar.tsx`, com um comentário no lugar dizendo por
que ele não volta. Um arquivo, duas edições.

O que **não** foi tocado, de propósito: o card no Menu Gerencial (é onde a tela deve viver), o grupo
do menu no registro do backend (mexer nele mudaria quem recebe o menu por padrão, e isso é decisão
do diretor, §A.23), a lista que dá acesso à camada `/admin` (sem ela quem tem só este menu não
conseguiria abrir a tela pelo Gerencial) e a validação de PDF do disparo, que o diretor confirmou
manter.

### Prova (§A.13, textual), sistema no ar

| O que | Resultado |
|---|---|
| Barra lateral, chunk servido pelo Next | **0** ocorrências de "Assinante Da Empresa" |
| Controle na mesma barra | "Ass. Click" continua lá, 1 ocorrência (a barra não foi esvaziada por engano) |
| Menu Gerencial, chunk servido | 1 card "Assinante Da Empresa", rota `/admin/assinante-empresa` |
| Leitura pela rota, COMUM real | HTTP 200 |
| Leitura pela rota, admin | HTTP 200 |
| Escrita (PUT do conjunto) | HTTP 200, base inalterada (só o padrão, como ficou na correção anterior) |
| Validação de PDF | intacta nos dois pontos do disparo, 15 testes verdes |

---

## 2026-07-29 (2): menu do assinante de volta ao Gerencial, salvamento que não apaga, e a trava do lote desfeita

Três correções pedidas pelo diretor. No ar, sem migração, gate verde (**743** testes de backend,
**62** de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes).

### 1. Por que o "Assinante Da Empresa" sumiu do Menu Gerencial: NÃO foi o bug da substituição

O diagnóstico apontava o salvamento por substituição. Os dados dizem outra coisa: os 5 COMUM ativos
**continuavam com o menu** (`assinante-empresa` em `usuario_menus`), e o diretor é SUPER_ADMIN, que
enxerga tudo por bypass (`todos: true` no `/auth/me`). Não houve remoção de permissão.

A causa real é de 28/07: quando o menu mudou do grupo ADMIN para OPERAÇÃO, o **card foi retirado do
grid do Menu Gerencial** e da lista que decide quem abre a camada `/admin`. A tela nunca deixou de
existir, mudou de porta.

**E havia um defeito pior escondido nisso:** a tela mora em `/admin/assinante-empresa`, e o layout de
`/admin` só deixa entrar quem tem algum menu administrativo. Nenhum dos 5 COMUM tem. Ou seja, eles
viam o item na barra lateral, clicavam e caíam em **"Acesso Restrito"**. A liberação de 28/07
funcionava na API e não funcionava na tela. A prova de ontem foi por rota, e não pegou isso.

Corrigido com **uma lista só** (`lib/admin-menus.ts`), que estava copiada na barra lateral e no
layout do admin. Duas cópias eram a própria causa de um menu entrar numa e não na outra. O card
voltou ao Menu Gerencial e o item continua na barra em Operação: dois caminhos, a mesma rota, o mesmo
filtro por menu.

### 2. A raiz: a tela de permissões deixou de apagar o que não veio na requisição

O bug do §A.23 é real e já mordeu duas vezes (o `assinaturas` sumiu de 4 dos 5 COMUM em 28/07). A
tela mandava a lista inteira e o backend apagava tudo antes de regravar: quem tinha a página aberta
quando um menu novo nascia REMOVIA esse menu ao salvar, sem ver.

A correção: a tela passa a declarar **o catálogo que ela exibiu** (`conhecidos`), e a remoção só
acontece dentro desse escopo. Menu que a tela não conhecia é **preservado**. A decisão mora em
`planejarSelecaoDeMenus` (função pura, testada sem banco); o `definirMenusDoUsuario` antigo continua
existindo para a CRIAÇÃO de usuário, onde substituir é o certo porque não há nada a preservar.

Salvar sem declarar o escopo agora leva **400 pedindo recarga**, uma frase só. Ruído visível é melhor
que remoção invisível. A resposta devolve `preservados`, para a preservação não ser silenciosa.

Prova ao vivo, simulando exatamente o incidente com a Beatriz (COMUM real):

| Passo | Resultado |
|---|---|
| Salvar como uma página velha (sem `assinante-empresa` na lista nem no escopo) | `{ok, total: 10, preservados: 1}` |
| Estado depois | os 10 menus intactos, **`assinante-empresa` continua lá** |
| Desmarcar de verdade (menu dentro do escopo) | removido, como sempre |
| Aba velha, sem `conhecidos` | 400 com a frase de recarga, **nada alterado** |

A prova de desmarcar rodou no usuário demo INATIVO e terminou com ele de volta a zero menu: nenhuma
permissão de gente real foi concedida ou tirada (§A.23).

### 3. Assinantes de teste do 631 removidos

Henrique, Edilaine e Sabrina saíram, pelo caminho oficial da tela (PUT do conjunto vazio). Sobra
**só o padrão** ("Representante Padrao Soulan"), que é quem o 631 passa a usar até o diretor
cadastrar os reais. Nada foi inventado.

### 4. Trava do disparo em lote desfeita

O `CLICKSIGN_LOTE_HABILITADO` e a recusa fail-closed saíram do backend, do frontend, do `.env`, do
`.env.example` e do documento da virada. O botão volta ao normal. O controle de quem dispara é o
MENU (§A.23), não uma trava de botão: quem não deve usar não recebe o menu de assinaturas.

Ficou no lugar a **validação de PDF** do disparo, que o diretor não mandou desfazer e que protege
candidato real de receber documento quebrado. O teste que sobrou trava justamente que lote e
individual têm a MESMA régua, sem trava a mais em nenhum dos dois.

### Prova textual (§A.13), sistema no ar

| O que | Resultado |
|---|---|
| Card no Menu Gerencial | "Assinante Da Empresa" e a rota no chunk servido pelo Next |
| COMUM na tela | `GET /admin/assinante-empresa` 200, e agora sem "Acesso Restrito" na camada |
| 631 | zero assinante, resolve pelo padrão |
| Disparo em lote | `POST /clicksign/disparar-lote` responde **201**, não mais 403 |
| Fila | volta a `{"itens": []}`, sem a flag de trava |

---

## 2026-07-29: virada da Clicksign preparada, homologação limpa e proteções para candidato real (INT-4)

Preparação da troca sandbox para produção. **Nada foi virado**: o token de produção é insumo do
diretor e chega amanhã. No ar, sem migração, gate verde (**739** testes de backend, **58** de
frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes).

Decisão registrada do diretor: o teste em produção será com **admissão REAL**, e o cancelamento, se
precisar, é feito **pelo portal da Clicksign**. Risco assumido.

### 1. Cadastro de grupos para o COMUM: confirmado ao vivo, estava completo

A liberação de 28/07 entrou de fato. Prova com a **Beatriz Martins** (COMUM real da base), token
emitido com o id e o papel dela, contra o backend de produção:

| Passo | Resultado |
|---|---|
| `/auth/me` traz o menu | `assinante-empresa` na lista |
| Listar (GET) | HTTP 200, padrão e exceções, CPF mascarado |
| Criar grupo com 2 pessoas (cliente 1001) | HTTP 200, as duas gravadas |
| Reordenar e adicionar a 3ª | ids preservados nos existentes, nova criada |
| Remover uma pessoa (PUT sem ela) | sobrou a certa |
| `DELETE /:id` real | HTTP 200 |
| Validação continua valendo | CPF inválido recusado com o nome de quem errou |
| Controle negativo, COMUM sem o menu | 403 nomeando `assinante-empresa` |

Nenhum 403 nas operações da Beatriz. O conjunto do 1001 foi criado só para a prova e **apagado ao
final**: a base voltou aos 4 assinantes que já existiam.

### 2. Resíduos de homologação removidos

- candidato `CANDIDATO TESTE CLICKSIGN` (CPF fake) e a admissão `4f06ec16`, com as 3 frentes, pelo
  `seed-candidato-teste.ts --remover`. Era o único registro com `clicksign_envelope_id` de sandbox;
- a pasta de staging da admissão de teste, **com o stub de 45 bytes** que quebrou a primeira prova;
- pasta órfã `ddc9edc8` (admissão inexistente) com outro stub, de 38 bytes;
- 19 artefatos de prova soltos na raiz da staging, de 29/06, incluindo um **JWT em `token.txt`**
  (§A.6, credencial não fica em disco) e 4 PDFs de teste.

Ficaram de propósito, para o diretor decidir: os 3 assinantes do cliente 631 (são pessoas reais e
removê-los deixaria o 631 dependendo só do conjunto padrão), o candidato órfão "Miguel Teste" (fora
do escopo desta OST) e o envelope de sandbox que continua `running` no portal da Clicksign, que é do
lado deles e sai por baixa manual.

### 3. Duas proteções novas, porque agora o signatário é candidato de verdade

**PDF validado antes de sair** (`domain/pdf-kit.ts`). A Clicksign aceita PDF quebrado sem devolver
erro: o envelope entra em `running`, o convite sai e a falha só aparece no visualizador do
signatário. Foi o que houve em 28/07 com o stub de 45 bytes. A régua olha cabeçalho, tamanho mínimo,
`%%EOF` e `startxref`, e roda em dois pontos: no disparo, que devolve o motivo na tela, e no worker,
como última porta antes de o arquivo virar documento. No worker **não lança**, porque arquivo
corrompido não melhora com backoff. A contagem de páginas é informativa e nunca reprova: PDF
comprimido não expõe `/Type /Page` em texto plano, e falso positivo aqui travaria kit legítimo.

**Freio do disparo em lote** (`CLICKSIGN_LOTE_HABILITADO`). **REVERTIDO em 29/07 (2): o diretor não
autorizou travar o botão; quem controla o uso é o menu, §A.23.** Fail-closed: só o valor `true` habilita.
O **disparo individual nunca é afetado**, é o caminho da virada. A trava mora no service, por onde os
dois caminhos passam, e a tela reflete o estado na mesma resposta da fila, então o botão já nasce
desabilitado com o aviso em vez de o consultor descobrir a trava depois de selecionar e clicar.

### 4. O que fica pronto para amanhã

`infra/VIRADA-CLICKSIGN-PRODUCAO.md`: o que trocar, onde colar, o comando de restart, como conferir
que não ficou inerte, como liberar o lote depois (sem build) e como voltar atrás.

Base conferida e apta: **0 em `AGUARDANDO_ASSINATURA`** e **0 kit anexado**, então nenhum envelope de
sandbox fica órfão na troca (o `clicksign_envelope_id` é específico do ambiente).

### Pendência de processo

A prova visual da tela (§A.13) **não foi feita**: o Chromium do harness não sobe nesta VM (faltam 12
bibliotecas de sistema e a instalação exige sudo). O que ficou provado é o comportamento, pelas rotas
reais: a fila devolve `loteHabilitado: false` e a rota do lote responde 403 mesmo chamada direto.
Falta o diretor abrir a tela de assinaturas, aba "Prontos Para Solicitar", e conferir o botão
desabilitado com o aviso.


---

## 2026-07-28 (13): "Assinante Da Empresa" liberado para o usuário COMUM (INT-4)

Decisão do diretor (§A.23: quem decide quem vê o menu é ele). No ar, sem migração, gate verde
(**719** testes de backend, **58** de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros
pré-existentes).

### O bloqueador de verdade não era o grupo do menu

Mover o menu de Administração para Operação, sozinho, **não liberaria nada**. A controller tinha
`@Roles("MASTER","SUPER_ADMIN")`, e o `RolesGuard` roda ANTES do `MenuGuard` (`app.module`, nessa
ordem). O COMUM veria o menu aparecer e tomaria 403 em toda operação, que é exatamente o defeito já
vivido no Gerador de Kit e que a OST mandou não repetir.

Então foram DUAS mudanças, e a segunda é a que importa:
1. o menu passou de `grupo: "ADMIN"` para `"OPERACAO"`, ordem 9;
2. o **`@Roles` saiu da controller**. Quem governa estas operações passa a ser só o menu, que é a
   régua já estabelecida no sistema ("a unidade de permissão é a OPERAÇÃO, não a controller").

A rota continua em `/admin/assinante-empresa`: não movi arquivo nem quebrei link, porque o que decide
onde o menu aparece e quem o recebe é o GRUPO, não o caminho.

Na tela: o item entrou na barra lateral em Operação e saiu do grid do Menu Gerencial, além de sair da
lista `ADMIN_MENUS` da sidebar (senão ele contaria como menu administrativo para decidir se o card
"Menu Gerencial" aparece).

### Concessão aos usuários (§A.23)

Como o menu virou Operação, ele entra no `MENUS_PADRAO_COMUM` por construção, o que resolve usuário
NOVO. Usuário existente já tem linhas em `usuario_menus` e não recebe nada sozinho, então concedi
explicitamente, que é a decisão do diretor:

| Usuário COMUM | Antes | Depois |
|---|---|---|
| Beatriz Martins | não tinha | **tem** |
| Bruna Nascimento | não tinha | **tem** |
| Gustavo Santos | não tinha | **tem** |
| Henrique teste | não tinha | **tem** |
| Sabrina Vieira | já tinha | mantido |

4 linhas inseridas, aditivo, nada removido.

### Prova com usuário COMUM REAL, não sintético

Token emitido com o id e o papel da **Beatriz Martins** (`beatriz.martins@soulan.com.br`), COMUM ativa
da base. Todas as operações da tela, ponta a ponta, **sem um único 403**:

| Passo | Resultado |
|---|---|
| Abrir a tela (GET) | HTTP 200 |
| O menu chega ao usuário | `assinante-empresa` na lista do `/auth/me` |
| Cadastrar grupo com 2 pessoas (cliente 1001) | as duas gravadas, posição 1 |
| Reordenar (Bruno para a posição 2) e adicionar uma 3ª pessoa | ids preservados nos existentes, nova criada |
| Remover uma pessoa do grupo | sobraram as duas certas |
| Remover o grupo inteiro | 0 pessoas |
| `DELETE /:id` | 404 (id inexistente), ou seja, **passou o guard** |

**Não virou porta aberta:** a validação continua valendo para o COMUM (CPF inválido recusado, com o
nome de quem errou). E o controle negativo confirma a régua: um COMUM **sem** o menu toma 403 tanto
no GET quanto no PUT, com a mensagem nomeando `assinante-empresa`.

Estado final conferido: nada da prova ficou para trás, só o padrão e o conjunto do 631 que já
existiam.

### Testes de regressão

Cinco novos, sendo o principal a leitura da metadata real do decorator: **a controller não pode voltar
a ter `@Roles`**. Se alguém reintroduzir, o teste quebra antes de o COMUM descobrir na prática.

---

## 2026-07-28 (12): TESTE REAL PONTA A PONTA da assinatura, CONCLUÍDO (INT-4)

Autorizado pelo diretor. Envelope real disparado, quatro assinaturas em sequência, contrato assinado
baixado e arquivado no prontuário do Drive. Gate verde (**714** testes de backend, **58** de
frontend). Sandbox.

### O que travou primeiro, e o que era

**Tentativa 1 (envelope `f3500f68`): documento não abria para assinatura.** O PDF anexado era um STUB
de 45 bytes que EU criei num script de prova de 19:45, quando stubei o download do kit no ai-service
por não ter os PDFs da folha. Tinha o cabeçalho `%PDF-1.4` e nada mais: sem `xref`, sem `%%EOF`, zero
objetos de página. O `file` chamava de PDF, o `pypdf` estourava `PdfStreamError`.

A investigação isolou as três perguntas:
1. o EA mandou íntegro? **Sim, e esse é o problema**: baixei da Clicksign o que ela guardou e era o
   mesmo MD5 do disco. O transporte estava certo; a fonte é que era lixo;
2. o upload engoliu erro? Não. Devolveu id de documento e os bytes bateram;
3. a API acusa? **Não.** O documento ficou `status: "running"`, sem nenhum campo de erro. A Clicksign
   aceita PDF estruturalmente inválido e só quebra no visualizador.

**O erro de processo foi meu:** registrei o stub como limitação da prova no DIARIO da entrega, mas não
o levantei de novo quando o diretor autorizou o teste real, e deixei a admissão "pronta para validar"
com aquele arquivo.

### BUG DE PRODUÇÃO encontrado no caminho: redisparo descartado em silêncio

Com o PDF real anexado, o disparo respondeu "ok" e **nenhum envelope nasceu**. Causa: o `jobId` da
fila era `env-<admissao>`, ESTÁVEL. Como o BullMQ retém o job concluído (`removeOnComplete: 1000`),
o segundo disparo da mesma admissão era descartado sem erro nenhum.

Não era problema do teste. Atingia **todo reenvio por correção, toda troca de kit e todo redisparo
depois de cancelamento**: a tela dizia "enfileirado", o envelope não nascia, ninguém sabia. Mesma
classe de mentira do cancelamento que dizia "cancelado" sem cancelar.

O próprio repositório já conhecia a armadilha: o `PandapeQueueService.enfileirarPullDocumentos`
documenta e resolve com sufixo no jobId. A fila da Clicksign ficara para trás.

**Correção:** jobId único por disparo; a proteção contra duplo clique saiu do jobId e passou para o
ESTADO (o `criarEnvelope` recusa criar um segundo envelope para admissão que já tem um aguardando); e
o `dispararLote` deixou de reportar "ok" quando a fila recusa. Dois testes de regressão travam isso,
convivendo com a regressão antiga do `:` no jobId.

### O teste

Documento: `teste_click.pdf` fornecido pelo diretor, VALIDADO antes de usar (816.296 bytes, PDF 1.7,
4 páginas, `xref` e `%%EOF`, abre no pypdf, texto real de REGISTRO DE EMPREGADO). Depois do upload,
conferi o que a Clicksign guardou: mesmo MD5, 4 páginas. É a conferência que faltou na primeira vez.

**A sequência, provada em três saltos:**

| Hora | Evento |
|---|---|
| 17:33:24 | envelope `55c2ac0b` criado e ativado, 4 signatários nos grupos 1 a 4 |
| 17:44:12 | `sign` CANDIDATO TESTE CLICKSIGN (grupo 1) |
| 17:46:50 | `sign` Henrique Vieira (grupo 2), **só depois do candidato** |
| ~17:50 | `sign` Edilaine Aparecida (grupo 3), **só depois do Henrique** |
| ~17:52 | `sign` Sabrina Ferreira (grupo 4), **só depois da Edilaine** |
| | `auto_close`, envelope `running -> closed` |
| 20:53:11 | ciclo do scheduler: varridas=1, **assinados=1**, falhas=0 |

**Resultado final, conferido item a item:**
- EA: `clicksign_status = ASSINADO`, `contrato_assinado_drive_url` preenchida;
- a pasta do Drive **existe de verdade**, validada pelo caminho real (`valido: true`);
- kit desanexado e o arquivo removido da staging (foi para o prontuário);
- o olho da tela passa a devolver 404, que é o comportamento desenhado;
- abas: "Prontos" 0, "Gestão Das Assinaturas" 0, **"Assinados" 1**.

### Percalço do meio do caminho (do diretor, resolvido por ele)

Às 17:41 o e-mail do candidato foi editado no painel da Clicksign para
`henrique.vieira.corporativo@soulan.com.br` e a notificação **falhou**
(`tracking_notification_error`). Às 17:43 foi corrigido para o gmail e a assinatura entrou. Fica o
registro de que a correção foi só na Clicksign: **no EA o cadastro do candidato de teste segue com o
e-mail antigo**, o que voltaria a falhar num novo disparo.

### Pendências deixadas

- O envelope quebrado `f3500f68` está `CANCELADO` no EA mas continua `running` na Clicksign: esta
  conta não aceita cancelamento programático de envelope ativo. A baixa dele é manual, no painel.
- Sobrou na staging o arquivo stub de 45 bytes (órfão, sem admissão apontando). O TTL de 48h o
  remove.
- A GERAÇÃO do kit pelo motor de extração continua não exercitada ponta a ponta: este teste usou um
  PDF do diretor, então provou a ASSINATURA, não o Gerador de Kit.

---

## 2026-07-28 (11): cadastro do assinante em GRUPO, não pessoa a pessoa (INT-4)

Só a tela e o caminho de escrita mudaram. O motor (schema, resolução tudo-ou-nada, mapeamento para o
grupo, paralelo e sequência) ficou intacto, como a OST determinou. No ar, sem migração, gate verde
(**711** testes de backend, **58** de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros
pré-existentes).

### O que estava ruim

O cadastro era por PESSOA: para montar um cliente com três representantes, o consultor abria o
formulário três vezes e digitava a ordem como um número solto em cada uma, sem nunca ver o conjunto.
A ordem, que é a informação mais importante do cadastro, era a menos visível.

### Um cadastro por escopo

A tela virou uma lista de GRUPOS, um por escopo (o padrão ou um cliente), com o botão **"Adicionar
Grupo De Assinatura"**. Cada linha mostra quantas pessoas o grupo tem e a ordem em texto, por exemplo
`1. Ana Paralela e Bruno Paralelo (juntos)  >  2. Carla Sequencia`, então dá para ler a sequência sem
abrir nada.

O editor abre o conjunto inteiro e AGRUPA VISUALMENTE POR POSIÇÃO: cada posição é um bloco, e o bloco
com mais de uma pessoa diz "assinam juntos (N pessoas)"; do segundo em diante, cada bloco diz "só
depois da posição anterior". Era isso que faltava para "mesma posição = juntos" ficar óbvio. Dentro
do bloco há "Adicionar pessoa nesta posição"; fora, "Adicionar pessoa em nova posição".

### Escrita: um endpoint só, substituição completa

`PUT /admin/assinante-empresa/conjunto` salva o escopo inteiro de uma vez, TRANSACIONAL: quem não vem
na lista é removido, quem vem com `id` é atualizado, quem vem sem `id` é criado. Ou entra tudo ou não
entra nada; um escopo salvo pela metade deixaria a ordem de assinatura inconsistente.

Os endpoints de criar e atualizar POR PESSOA saíram. Manter os dois caminhos criaria duas verdades
sobre como se escreve o conjunto, e cadastrar de um em um é justamente o que esta OST veio eliminar.
O `DELETE /:id` continua; remover um grupo inteiro pela tela é salvar o conjunto vazio.

**Validação com nome de quem errou.** Tudo é validado ANTES de tocar o banco, e a mensagem diz de
qual pessoa é o problema (`"Sem Cpf: CPF do representante inválido..."`). Sem isso, num conjunto de
três, o consultor receberia um erro genérico e não saberia qual linha corrigir.

**CPF em branco na edição mantém o gravado.** A tela nunca recebe o CPF completo de volta (§A.6, sai
mascarado), então exigir que o consultor redigitasse o CPF de todo mundo a cada reordenação seria
transformar uma decisão de privacidade em trabalho manual. Em pessoa NOVA o CPF segue obrigatório.

### Prova (sandbox, backend 19:41)

| O que | Resultado |
|---|---|
| Cadastrar 3 pessoas de uma vez (duas na posição 1, uma na 2) | as três gravadas numa chamada só |
| Reabrir e REORDENAR (Carla para a posição 1, Ana e Bruno para a 2), sem CPF | **ids preservados** e CPF mantido, ou seja, editou em vez de recriar |
| Salvar o conjunto sem a Carla | ela sai, os outros dois ficam |
| Devolver a Carla como pessoa nova no mesmo conjunto | volta para a posição 2 |
| Pessoa nova sem CPF | recusado, com o nome dela na mensagem |
| CPF com dígito errado | recusado, com o nome na mensagem |
| Mesma pessoa duas vezes no conjunto | "Ana Paralela está repetido neste conjunto" |
| Ordem 0 | recusado |

**Envelope montado contra a sandbox, sem ativar**, com o conjunto vindo da tela nova:

```
grupo 1 (sozinho):  Candidato Teste Clicksign
grupo 2 (PARALELO): Ana Paralela + Bruno Paralelo
grupo 3 (sozinho):  Carla Sequencia
```

Idêntico ao que já tinha sido provado antes da reformulação, que era o ponto: a tela mudou, o motor
não. O draft foi apagado (204) e nenhum envelope foi ativado.

---

## 2026-07-28 (10): múltiplos signatários da empresa com ordem por cliente (INT-4)

Construção aprovada a partir do levantamento. No ar, migração 0046 aplicada, gate verde (**711**
testes de backend, **58** de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros
pré-existentes). Nenhum envelope ativado.

### Schema

`assinante_empresa` passou a aceitar N linhas por escopo, com coluna `ordem` (default 1). O par
padrão x exceção por cliente ficou intacto: `cod_cliente` NULL é o padrão, preenchido é o conjunto do
cliente.

**Travas, já que os índices de "um só" caíram:**
- **Índice único por (escopo + CPF)**, em dois índices parciais (NULL não colide com NULL no
  Postgres, e é o NULL que marca o padrão). A mesma PESSOA não entra duas vezes no mesmo escopo. Não
  há unique sobre a ordem, de propósito: repetir ordem é o que faz assinarem em paralelo.
- **Check `ordem >= 1`**, espelhando a régua da própria API ("group deve ser maior que 0", conferido
  na sondagem).

### Resolução: tudo ou nada

`resolverAssinantes` devolve o CONJUNTO INTEIRO do cliente quando ele tem qualquer representante
próprio ativo; senão, o conjunto padrão inteiro. **Nunca mistura.** Um conjunto meio-cliente
meio-padrão deixaria a ordem de assinatura decidida por acidente de cadastro em vez de decisão de
quem cadastrou. Desativar todos os representantes de um cliente faz ele voltar ao padrão.

Ordena por `ordem` e desempata por nome, para o envelope sair sempre igual: sem isso a ordem dos
signatários dependeria da ordem que o banco devolvesse.

### Mapeamento para o envelope

Funcionário sempre no grupo 1. Representante de ordem N vai para o grupo **N+1** (`grupoDaOrdem`).
Mesma ordem cai no mesmo grupo, e é isso que produz o paralelo; ordens diferentes viram sequência, e
o seguinte só é notificado quando chega a vez dele.

**O grupo vai SEMPRE explícito.** A sondagem mostrou que omitir o campo joga o signatário para
`max+1`, não para 1 como a documentação diz. Um teste trava isso: todo signatário enviado precisa ter
`group` numérico.

### Cadastro

A tela de "Assinante Da Empresa" virou lista: cada escopo aceita vários representantes, com coluna de
ORDEM e campo explicando que mesma ordem assina em paralelo. O CRUD deixou de ser upsert por escopo e
passou a ser criar (`POST`), atualizar (`PUT /:id`) e remover. O escopo não muda na edição: para
mover, remove e cadastra de novo, o que evita um "editar" que silenciosamente troca o cliente.

**CPF continua OBRIGATÓRIO**, decisão do diretor. A API aceitaria signatário sem documentação (provado
na sondagem), então esta é régua nossa, mais dura que a dela, por força jurídica da assinatura.

### Prova (sandbox, backend 19:16)

**Validação:**
| Caso | Resultado |
|---|---|
| sem CPF | 400 no DTO |
| CPF com dígito errado | 400: "O CPF é obrigatório e precisa ter dígito verificador válido" |
| ordem 0 | 400: "ordem must not be less than 1" |
| mesma pessoa duas vezes no mesmo escopo | 400: "já está cadastrado neste escopo" |

**Cadastro do cliente 631:** Ana Paralela (ordem 1), Bruno Paralelo (ordem 1) e Carla Sequencia
(ordem 2), todos com CPF.

**Envelope montado contra a sandbox, sem ativar** (classes de produção, parando antes do
`ativarEnvelope`):

```
CLIENTE 631 (3 representantes)      CLIENTE 1001 (sem representante próprio)
  grupo 1: Candidato Teste            grupo 1: Candidato Teste
  grupo 2: Ana + Bruno  (PARALELO)    grupo 2: Representante Padrao Soulan
  grupo 3: Carla        (sequência)
```

Os dois envelopes ficaram em `draft` e foram apagados (204 nos dois). A resolução provou os dois
lados: cliente com representantes próprios usou o conjunto dele; cliente sem usou o padrão.

---

## 2026-07-28 (9): levantamento de múltiplos signatários por cliente + varredura de title case

Parte 1 é levantamento (nada construído). Parte 2 aplicada e no ar, gate verde (**704** testes de
backend, **58** de frontend, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes).

### PARTE 1, levantamento: múltiplos signatários da empresa com ordem por grupo

Sondagem na SANDBOX com envelope `draft`, nunca ativado, apagado ao final (DELETE 204, 404 depois).

**Vários signatários no mesmo envelope: suportado, sem limite prático.** Seis signatários foram
aceitos no mesmo envelope da sondagem. Cada `POST /envelopes/{id}/signers` devolve id próprio.

**A ordem é o campo `group`, e a empresa PODE ficar em grupos diferentes.** Testado ao vivo:

| Teste | Resultado |
|---|---|
| funcionário g1, representante A g2, representante B g3 | **aceito**, cada um no seu grupo |
| dois representantes no MESMO grupo 2 | **aceito** (assinam em paralelo, sem ordem entre si) |
| grupo 7 com lacuna (não existem 4, 5, 6) | **aceito**, a numeração não precisa ser contígua |
| grupo 0 | **recusado**: "group deve ser maior que 0" |
| omitir o campo `group` | **aceito, mas vira `max+1`** |

O último merece destaque: a documentação diz que o default é 1, e **não é**. Com signatários já nos
grupos 1 a 7, o que veio sem `group` foi para o **8**, ou seja, virou o último da fila. Isso não nos
afeta hoje porque o EA sempre manda `group` explícito (1 e 2), mas quem confiar no default coloca o
signatário no fim da ordem sem perceber.

**Papéis com mais de um representante: aceito.** Um `employee` e DOIS `employer` no mesmo documento
foram aceitos. O papel vive no requirement, então cada signatário tem o seu, e nada impede repetir
`employer`.

**Exigências por signatário:** `name` (nome e sobrenome, sem dígito, régua já conhecida) e `email`
são OBRIGATÓRIOS; sem e-mail a API responde "email não pode ficar em branco". **CPF é OPCIONAL**:
`has_documentation: false` foi aceito. Ou seja, a exigência de CPF que o EA aplica hoje no cadastro é
regra NOSSA, não da API. Vale decidir se ela continua valendo para todo representante.

**Recomendação de desenho (o diretor decide):**
- A tabela `assinante_empresa` deixa de ter um registro por escopo e passa a ter N, ganhando uma
  coluna de **ordem** (o `group`). O par (padrão x exceção por cliente) permanece exatamente como
  está: `cod_cliente` NULL é o padrão, preenchido é a exceção do cliente.
- Some o índice parcial "um padrão só" e "uma exceção por cliente", que passam a permitir várias
  linhas por escopo; a unicidade vira (escopo + ordem) ou nada, conforme o diretor aceitar ou não
  dois representantes na mesma ordem (a API aceita).
- **Regra de resolução preservada:** se o cliente tem QUALQUER representante próprio, usa-se o
  conjunto dele; senão o conjunto padrão. Misturar padrão com exceção seria imprevisível.
- **Mapeamento para o `group` da Clicksign:** funcionário sempre 1, e o representante de ordem N vai
  para o grupo N+1. Assim a ordem cadastrada na tela é a ordem real de assinatura, e o representante
  seguinte só é notificado quando o anterior assina.
- A tela ganha uma lista por escopo, com ordem, em vez de um formulário de registro único.

*Ponto que o diretor precisa decidir junto: dois representantes na MESMA ordem (assinam em paralelo)
ou ordem sempre única? A API aceita os dois; é decisão de processo.*

### PARTE 2, varredura de title case (§A.24)

**61 rótulos corrigidos**, mais 3 de KPI numa segunda passada. O que entrou, por categoria:

- **Menus (registro, sidebar e cards do Menu Gerencial):** Análise Gerencial, Nova Admissão, Esteira
  Admissional, Não Conformidades, Gerador De Kit, Motivos De Declínio, Tarifas De Transporte, Régua
  Documental, Regras Do Kit, Regras De Auditoria, Diagnóstico Do Sistema, Pastas Do Drive,
  **Assinante Da Empresa** (o que originou a OST).
- **Títulos de tela:** Acesso Restrito, Admissão Criada, Cadastro Em Etapas, Indicadores Da Operação,
  Processar Kit, Regras Do Gerador De Kit.
- **Títulos de modal e de bloco:** 22 no total, entre eles Confirmar Dupla Correção, Concluir Frente,
  Excluir Admissão, Inativar (Benefício, Cargo, Documento, Escala, Motivo, Régua Do Cliente, Tarifa),
  Resetar Senha, Scheduler Da Assinatura, Scheduler Da Coleta De VT, Resultado Do Disparo, Qual
  Admissão?, Pendências Obrigatórias, Volume De Admissões, Falhas Por Família.
- **TAGS de status (pills):** Análise Pendente, Análise Finalizada, Análise Em Andamento, Entrega
  Pendente, Aguardando Reenvio Dos Docs, A Agendar, A Cadastrar. Estas são **dado de catálogo**
  (`frente_status_catalogo`), então além do código foi preciso rodar o seed, que converge os rótulos;
  conferido no banco depois.
- **Tags de não conformidade:** Auditoria Sem Documentos, Exame Sem ASO, Cadastro Incompleto.
- **Rótulos de KPI:** Com Pendências Obrigatórias, Total Geral, Admissões Em Andamento.

**O que foi deixado de propósito em escrita normal**, porque a §A.24 exclui: texto de botão
("Salvar regra", "Trocar kit"), tooltip ("Abrir prontuário no Google Drive"), placeholder ("Buscar
cargo por nome"), `aria-label` e **rótulo de campo de formulário** ("Data de admissão", "Centro de
custo"). Rótulo de campo nomeia um input, não classifica nada, então não é tag. Uma varredura cega
por maiúscula teria capitalizado os 182 casos que o scan levantou e deixado o sistema estranho; a
lista aplicada foi explícita e conferida item a item.

### Prova

Menus lidos direto do banco depois do seed, todos em title case, incluindo "Assinante Da Empresa".
Catálogo de status idem. No bundle publicado, as formas antigas sumiram: buscando por "gerencial" em
minúscula, zero chunks; por "Gerencial", quatro. As suítes seguem verdes, inclusive a do frontend,
que exercita os rótulos de auditoria.

*Nota de processo: a suíte de testes do FRONTEND (58 testes) não estava sendo rodada nos gates
anteriores desta frente, só a do backend. Passou a entrar.*

---

## 2026-07-28 (8): coluna Ações do Ass. Click, botão-ícone e redistribuição das colunas

Ajuste visual, só frontend. No ar, gate verde (**704 testes**, typecheck dos 3 pacotes, lint com os
mesmos 2 erros pré-existentes).

### O que estava errado, medido

Os botões eram rotulados (`px-2.5`, texto 12.5px, ícone + palavra) numa coluna de 14%. A conta com a
tabela no `min-w-[1120px]`: a coluna útil tinha **123,8px** (201,6 menos os 32px de padding do `td` e
a borda de 1px) e o pior caso de botões somava **~360px na aba Prontos e ~375px na Gestão**. Ou seja,
transbordava quase 3x e os botões quebravam em duas ou três linhas, que é exatamente o que deixava a
linha desproporcional.

### O que foi feito

**Botão-ícone de 32px, que é o padrão que o sistema já usa em fila.** A coluna Ações da Esteira já
resolve ação de linha com `grid h-8 w-8 ... rounded-lg`, ícone e `title`. Adotei o MESMO desenho aqui,
em vez de inventar um botão pequeno novo (item 4 da OST). Um helper local (`AcaoIcone`) só evita
repetir as classes cinco vezes; visualmente é o botão que já existia.

Ícones distintos por ação, para nenhum par ficar ambíguo: olho (`eye`), enviar (`arr`, seta), trocar
kit (`layers`, pilha de documentos), reenviar (`refresh`), cancelar (`x`, com hover vermelho por ser
destrutivo) e o logo do Drive no contrato assinado. Todos com tooltip e `aria-label`.

**Redistribuição das colunas.** As de texto cederam para Ações, e as duas abas passaram a fechar
100%: a de Gestão somava **98%**, ou seja, tinha 2% de espaço morto (§A.20).

| Aba | Distribuição |
|---|---|
| Prontos Para Solicitar | checkbox 4%, Candidato 19%, Cliente 13%, Cargo 12%, Contrato 10%, Situação 24%, **Ações 18%** |
| Gestão Das Assinaturas e Assinados | Candidato 21%, Cliente 15%, Cargo 13%, Contrato 11%, Assinatura 12%, Prazo 10%, **Ações 18%** |

### Prova aritmética (§A.13: prova de layout é conta)

Base: tabela `min-w-[1120px]`, `td` com 16px de padding de cada lado e 1px de borda entre células, o
que deixa **168,6px úteis** na coluna de 18%. Botão de 32px, `gap-0.5` (2px).

| Aba | Pior caso | Soma dos botões | Útil | Folga |
|---|---|---|---|---|
| Prontos Para Solicitar | olho + enviar + trocar + cancelar (4) | 134px | 168,6px | **34,6px (21%)** |
| Gestão Das Assinaturas | olho + trocar + reenviar + cancelar (4) | 134px | 168,6px | **34,6px (21%)** |
| Assinados | trocar + cancelar + Drive (3) | 100px | 168,6px | **68,6px (41%)** |

O pior caso da Gestão é **quatro** botões, não três: uma linha AGUARDANDO_ASSINATURA com kit mostra
olho, trocar kit, reenviar e cancelar ao mesmo tempo. Dimensionei por esse caso, não pelos três que a
OST citou.

Conferido no bundle publicado: as classes do botão-ícone e a coluna de 18% estão no chunk servido.

---

## 2026-07-28 (7): ações da fila, gestão das assinaturas, troca de kit e title case (INT-4)

No ar, gate verde (**704 testes**, typecheck dos 3 pacotes, lint com os mesmos 2 erros
pré-existentes). Sem migração nesta OST. Nenhum envelope foi ativado.

### Regra nova §A.24, title case em títulos e tags

Gravada no CLAUDE.md: título de tela, card, modal, aba e rótulo de pill/badge usam a primeira letra
de cada palavra em maiúscula. Texto de apoio, mensagem e **texto de botão** seguem escrita normal,
porque botão é comando, não etiqueta. Aplicado no que esta OST tocou: abas ("Prontos Para Solicitar",
"Gestão Das Assinaturas"), títulos de modal ("Cancelar O Documento?", "Trocar O Kit?") e os rótulos
de status do Clicksign ("Sem Envelope", "Aguardando Assinatura").

### 1. Aba "Prontos Para Solicitar": ações individuais

A coluna Ações estava vazia. Ganhou **olho** (abre o kit anexado) e **Enviar** (dispara UM candidato,
sem marcar checkbox), convivendo com o disparo em massa. O envio individual **reusa o
`dispararLote` com um item só**, de propósito: duplicar a lógica criaria duas verdades sobre quem
pode ser disparado, e a régua de bloqueio tem de ser a mesma nas duas portas.

### 2. Aba "Gestão Das Assinaturas": ações por envelope

Olho, Cancelar e Trocar kit por linha.

**O kit deixou de ser apagado no disparo.** Na OST anterior o `kit_assinatura_path` era zerado quando
o envelope nascia. Isso impediria o olho de funcionar nesta aba, então o zeramento saiu de lá e foi
para o fechamento: o kit vive enquanto a assinatura não fecha e some quando o envelope fica
**ASSINADO**, porque a partir daí o documento está no PRONTUÁRIO do Drive e é lá que se consulta.
Sair da fila de disparo continua garantido pelo STATUS (AGUARDANDO não entra em "Prontos"), então
nada foi perdido com a mudança.

### 3 e 4. Cancelar e trocar kit, com detecção de fase

`faseEnvelope` deriva a fase de status + kit: `NAO_ENVIADO`, `ENVIADO`, `ASSINADO`, `ENCERRADO`.
Cancelar vale **inclusive no já assinado**, porque é o cancelamento na Clicksign que notifica o
funcionário. Trocar kit cancela nas duas frentes e DESANEXA o kit; o kit novo entra pelo Gerador de
Kit, botão "Enviar para assinatura".

*Interpretação que tomei e vale registrar: "trocar kit" não abre um seletor de kit nesta tela. O kit
novo vem do Gerador de Kit, como a OST diz ("precisa estar gerado lá"), e esta tela não conhece os
jobs do motor de extração, que são efêmeros e vivem no ai-service. Se a intenção era escolher o kit
aqui dentro, é outra construção.*

### 5. O aviso muda conforme a fase

Três textos distintos, e os testes travam que são realmente diferentes entre si: sem isso a detecção
de fase seria decorativa. Não enviado avisa que ninguém é notificado; enviado avisa que o funcionário
será notificado; assinado destaca que o envelope JÁ está assinado.

### BUG ENCONTRADO E CORRIGIDO NA PRÓPRIA PROVA

A primeira prova de cancelamento mostrou o EA respondendo `clicksign: "cancelado"` enquanto o
envelope continuava `draft` na Clicksign. Duas causas somadas:

1. `cancelarEnvelope` **engolia o erro internamente** (try/catch com log), então nunca rejeitava, e o
   `.then(ok, erro)` que eu tinha escrito resolvia SEMPRE no caminho de sucesso;
2. ele só tentava `PATCH status="canceled"`, que a API recusa em `draft`; o correto ali é `DELETE`.

Era exatamente o tipo de mentira que não pode ir para a tela: dizer ao consultor que o funcionário
foi notificado quando nada saiu. `cancelarEnvelope` passou a devolver **boolean**, escolher DELETE ou
PATCH conforme o estado atual e **conferir o resultado** em vez de acreditar no 2xx (a API responde
2xx sem mudar o estado). A tela informa "cancelado na Clicksign" ou "a Clicksign não aceitou o
cancelamento programático; o estado que vale é o do EA".

### Prova (sandbox, backend 17:44)

| O que | Resultado |
|---|---|
| Aba Prontos | fase `NAO_ENVIADO`, `temKit=true`, sem bloqueio |
| Olho | HTTP 200, `application/pdf`, arquivo começa em `%PDF-1.4` |
| Cancelar em `NAO_ENVIADO` | EA CANCELADO, `clicksign: "sem-envelope"` (não há o que notificar) |
| Cancelar em `ENVIADO`, envelope REAL na sandbox | EA CANCELADO, `clicksign: "cancelado"`, e o envelope **sumiu de fato** (404 na consulta) |
| Cancelar em `ASSINADO` | EA CANCELADO, `clicksign: "best-effort"`, reportado honestamente |
| Trocar kit | kit desanexado, admissão fora da fila, olho passa a devolver 404 explicativo |
| Kit some após assinado | o `arquivarAssinado` zera o caminho e remove o arquivo da staging |

**Formato das provas de fase, como combinado:** determinístico. O status do envelope foi posicionado
no banco para cada fase e o endpoint REAL foi executado. Para a fase `ENVIADO` usei um envelope de
verdade criado na sandbox, então o cancelamento nas duas frentes foi provado contra o provedor real,
não simulado. Nenhum envelope foi ativado, então nenhum e-mail saiu.

**O que NÃO foi provado ao vivo:** o envio individual e o disparo em massa com item apto, porque
ambos criam e ativam envelope de verdade, o que manda e-mail. Continuam dependendo do aval do
diretor. O candidato de teste ficou de volta na fila, apto e com kit anexado, para ele abrir a tela
com dado real.

---

## 2026-07-28 (6): fila de disparo em lote, fluxo do kit e ajustes (INT-4)

Fluxo definido pelo diretor, implementado ponta a ponta: cadastrado > gera kit > libera kit >
"Enviar para assinatura" > a admissão cai na fila JÁ COM O KIT ANEXADO > o consultor seleciona e
dispara em massa > acompanha em "Gestão das assinaturas". No ar, migração 0045 aplicada, gate verde
(**691 testes**, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes).

### 1. "Enviar para assinatura" no Gerador de Kit

Botão por funcionário, ao lado de Baixar. NÃO cria envelope e NÃO manda e-mail: baixa o kit
consolidado do ai-service e o materializa na staging DA ADMISSÃO, carimbando `kit_assinatura_path` e
`kit_assinatura_em`. É esse carimbo que põe a admissão na fila.

**Staging da admissão (TTL 48h), não o diretório de kits avulsos (TTL 2h).** A fila pode esperar o
consultor por mais de um dia; 2h transformaria a fila num lugar onde o kit some sozinho. Continua sem
binário no banco (regra 7): o que persiste é a referência.

**Identificação da admissão.** O motor do kit não conhece admissão, entrega `nome` +
`cpfMascarado` (o CPF cru não sai do ai-service, §A.6). O backend casa pelos 6 dígitos do meio do CPF
mascarado contra as admissões vivas sem envelope. Casamento ÚNICO segue direto; zero ou vários
devolvem 409 com as opções e a tela pergunta. Adivinhar aqui anexaria o contrato de uma pessoa na
admissão de outra.

### 2. Régua da fila corrigida: o caso da Amanda

A fila listava qualquer admissão com as 3 frentes concluídas, e por isso mostrava gente SEM KIT que o
consultor não tinha como disparar. Passou a exigir `kit_assinatura_path IS NOT NULL`. As 3 frentes
continuam exigidas, agora como defesa e não como régua de entrada.

**Bloqueio em vez de sumiço.** Quem tem impedimento ENTRA na fila com o motivo à vista e sem
checkbox. Sumir é pior: o consultor fica sem saber por que o candidato não chega. Três motivos, na
ordem em que se resolvem:
1. candidato sem e-mail (a assinatura é autenticada por e-mail);
2. kit expirado do TTL de 48h (pede novo envio pelo Gerador de Kit);
3. sem representante da empresa cadastrado.

São exatamente os três pontos em que o `criarEnvelope` desistiria silenciosamente lá no worker.
Trazê-los para a fila troca "o candidato sumiu" por "o candidato está aqui, e falta isto".

### 3. Modal de upload eliminado

A ação `solicitar` (que pedia o PDF-mãe) foi removida do backend e da tela. Pedia ao consultor um
arquivo que o sistema já tinha. O único fluxo que ainda sobe arquivo é o REENVIO POR CORREÇÃO, que
por natureza exige o PDF corrigido.

### 4. Disparo em massa

`POST /clicksign/disparar-lote` recebe os ids selecionados. Para cada um REVALIDA o bloqueio e
enfileira o `criar-envelope` com o kit já anexado. É o único caminho que cria envelope e manda
e-mail.

**Revalidação no disparo, não só na listagem:** entre carregar a tela e clicar podem ter passado
horas; o kit pode ter expirado, o e-mail pode ter sido apagado. Confiar na tela seria confiar num
retrato velho.

**Parcialidade no padrão da liberação em massa:** um item que falha não derruba os outros, e o
resultado volta por candidato, com o motivo. Quando o envelope nasce, `kit_assinatura_path` é zerado,
então a admissão sai da fila e não é disparada duas vezes.

### 5. Nomes e ordem

Aba "Em aberto" virou **"Gestão das assinaturas"**. Menu lateral virou **"Ass. Click"** (registro e
sidebar). Ordem das abas: Prontos para solicitar > Gestão das assinaturas > Assinados, que é a ordem
do fluxo real.

### 6. Dropdown de cliente

Era `<select>` nativo, que herda o tema do SO (fundo cinza opaco, letra branca no escuro) e não tem
busca. Trocado pelo `Select` do design system, que já traz o popover glass E o campo de busca
embutido. Não foi preciso componente novo: a busca já existia no DS e a tela é que estava fora do
padrão.

### Prova (sandbox, backend 15:36)

| O que | Resultado |
|---|---|
| Amanda e mais 8 (3 frentes, sem kit) | **saíram** da fila. "Prontos" foi de 8 para **0** |
| "Enviar para assinatura" (KitService real, casando por CPF mascarado) | anexou o kit e carimbou o banco; a admissão apareceu na fila **APTA**, com a data do anexo |
| Candidato sem e-mail | entra na fila **BLOQUEADO**, com o motivo, e sem checkbox |
| Disparo em lote de bloqueado + id fora da fila | `disparados: 0`, motivo POR CANDIDATO, e **nenhum job** enfileirado no Redis |
| Seleção em massa (2 aptos) montando envelope | 2 envelopes montados, cada um com **2 signatários e grupos certos**, ambos em `draft` |
| Resolução do assinante no lote | cliente 631 usou a **exceção** (Mariana Ribeiro Alves); cliente 1001 caiu no **padrão** (Representante Padrao Soulan) |

Os dois drafts foram apagados (204 nos dois) e o segundo candidato de teste foi removido. Nenhum
envelope foi ativado, então nenhum e-mail saiu.

**Limite honesto da prova.** Duas coisas foram stubadas, e vale saber quais:
1. o download dos bytes do kit no ai-service, porque não tenho os PDFs da folha para rodar o motor de
   extração aqui. Todo o resto do `enviarParaAssinatura` é código de produção (casamento, gate,
   staging, banco);
2. o `dispararLote` com item APTO não foi executado de verdade, porque ele enfileira o job que CRIA E
   ATIVA o envelope, o que manda e-mail. A montagem foi provada rodando as classes de produção na
   mesma ordem, parando antes do `ativarEnvelope`.

O candidato de teste ficou com o kit anexado e APTO na fila, de propósito, para o diretor ver a tela
com dado real. Disparar de verdade continua dependendo do aval dele.

---

## 2026-07-28 (5): assinante da empresa e envelope com DOIS signatários (INT-4)

Construção aprovada pelo diretor a partir do levantamento. No ar, migração 0044 aplicada, gate verde
(**681 testes**, typecheck dos 3 pacotes, lint com os mesmos 2 erros pré-existentes). Sandbox, sem
envelope ativado.

### 1. Cadastro do assinante da empresa (padrão + exceção por cliente)

Tabela `assinante_empresa` no modelo da pasta-pai do Drive: `cod_cliente` NULL é o PADRÃO,
preenchido é a EXCEÇÃO daquele cliente. Tela em Administração (`/admin/assinante-empresa`), menu novo
`assinante-empresa`, controller `@Roles` Master/Super Admin.

Dois índices parciais em vez de um unique comum, porque no Postgres NULLs não colidem entre si e é
justamente o NULL que marca o padrão: um índice garante UMA exceção por cliente, o outro garante UM
padrão só. Sem o segundo, dois "padrões" conviveriam e a resolução viraria sorteio.

A precedência (`exceção ativa do cliente > padrão ativo`) vive em `domain/assinante-empresa` como
função pura, testada sem banco. Exceção INATIVA volta ao padrão, que é o que se espera de quem
desliga uma exceção.

§A.6: o CPF do representante é PII, persistido por necessidade (a Clicksign exige documentação do
signatário) e no mesmo regime do CPF do candidato. A tela recebe o CPF **mascarado**
(`***.982.247-**`); o completo nunca sai do backend, então editar exige digitar de novo.

### 2. Envelope com os dois signatários

`criarEnvelope` passou a montar:

| | Papel | Grupo | Pode recusar |
|---|---|---|---|
| Funcionário | `employee` | 1 (assina primeiro) | sim |
| Empresa | `employer` | 2 (assina depois) | não |

O papel genérico `sign` saiu. Pelo `group`, o representante da empresa só é NOTIFICADO depois que o
funcionário assina, que era o ganho operacional buscado: quem assina dezenas de contratos não recebe
convite que ainda não pode atender.

**Quem assina é resolvido ANTES de tocar a Clicksign.** Sem representante cadastrado (nem padrão nem
exceção), o envelope não nasce e o log diz onde cadastrar. Se a resolução ficasse no meio da
montagem, um draft órfão com só o funcionário ficaria vivo lá, não assinável e sem cancelamento
programático (§A.5).

### 3. Achado da prova: a Clicksign tem régua de NOME, e o cadastro deixava passar

A primeira tentativa da prova ponta a ponta falhou com HTTP 400,
`name não está em um formato válido`, ao criar o signatário da empresa. Sondando a API:

| Nome | Resultado |
|---|---|
| `Representante Cliente 631` | RECUSADO (tem dígito) |
| `Joao Silva 2` | RECUSADO (tem dígito) |
| `Joao` | RECUSADO (uma palavra só) |
| `Representante Cliente` | ACEITO |

Ou seja, a Clicksign exige nome e sobrenome e não aceita dígito. O cadastro estava aceitando um nome
que a Clicksign recusaria, e o erro só apareceria no disparo do envelope, com o kit já gerado e o
consultor sem entender o motivo. Mesmo princípio do CPF obrigatório: `nomeSignatarioValido` passou a
barrar no cadastro, com mensagem explicando a régua.

### Prova (sandbox, backend 13:52)

**Cadastro pela rota da tela:**
- CPF com dígito verificador errado: **400**, recusado.
- Nome com dígito e nome de uma palavra só: **400**, recusados.
- Padrão gravado e exceção do cliente 631 gravada; a listagem devolve os dois com o padrão
  encabeçando e o **CPF mascarado**.

**Envelope montado contra a sandbox REAL, sem ativar** (rodando as classes de produção
`AssinanteEmpresaService` e `ClicksignApiService` na mesma ordem do `criarEnvelope`, parando antes do
`ativarEnvelope`, que é o que garante que nenhum e-mail sai):

| Caso | Resolveu | Signatários gravados na Clicksign |
|---|---|---|
| cliente 631 (tem exceção) | **EXCEÇÃO**, Mariana Ribeiro Alves | funcionário group=1 refusable=true; empresa group=2 refusable=false |
| cliente 1001 (sem exceção) | **PADRÃO**, Representante Padrao Soulan | idem |

Papéis gravados nos dois casos: `employee` e `employer`. Envelope permaneceu em `draft`, ou seja,
ninguém foi notificado. Os dois drafts foram apagados ao final (um DELETE tomou 500 da Clicksign e foi
repetido até 204; confirmado 404 depois).

*Nota de leitura da prova: a lista de requirements mostra 4 entradas por envelope, duas com papel e
duas vazias. É o esperado: cada signatário recebe o requirement de PAPEL (`agree` + role) e o de
AUTENTICAÇÃO (`provide_evidence` + email), e o segundo não tem role.*

### Não entrou

O disparo real com envelope ATIVADO. É o que falta para provar o fechamento com dois signatários e o
efeito do `group` na notificação, e depende do aval do diretor, agora com o candidato fake pronto.

---

## 2026-07-28 (4): regra de permissão de menu, candidato de teste e levantamento dos signatários

Três itens da OST. Os dois primeiros executados, o terceiro é levantamento (nada construído).

### 1. Permissão de menu é decisão do diretor (§A.23, regra nova)

Regra gravada no CLAUDE.md: nenhuma concessão de menu parte da fábrica, nem como efeito colateral de
script rodado para outro fim. Os dois scripts que concedem acesso (`seed-menus.ts` no passo do
grandfather e `backfill-menus-comum.ts`) ganharam aviso no topo dizendo que NÃO são rotina de deploy.
O que o deploy pode rodar é só o passo de CATÁLOGO do `seed-menus` (menu novo precisa existir na
tabela para aparecer na tela de configuração); distribuir aos usuários é passo separado.

**Ação executada (decisão do diretor): completar o COMUM para ver a Operação inteira.**

| Usuário | Antes (faltava) | Depois |
|---|---|---|
| Beatriz Martins | analise, assinaturas, nao-conformidades | Operação completa (9) |
| Bruna Nascimento | assinaturas | Operação completa (9) + 5 de Administração preservados |
| Gustavo Santos | assinaturas, nao-conformidades | Operação completa (9) |
| Sabrina Vieira | analise, assinaturas, nao-conformidades | Operação completa (9) + 3 de Administração preservados |
| Henrique teste | nada | já estava completa |

9 linhas inseridas, ADITIVO: nenhuma concessão de Administração foi removida.

**Achado no caminho, importante:** o menu `assinaturas` tinha SUMIDO de 4 dos 5 COMUM entre o deploy
(12:06) e agora. Não foi a remoção que fiz (aquela mirou 5 pares específicos e nenhum era
`assinaturas`). A causa é a tela de Usuários, que salva por SUBSTITUIÇÃO:
`menus.service.definirMenusDoUsuario` faz `DELETE` de todos os menus do usuário e regrava a lista
recebida. Quem estava com a tela aberta antes do menu novo existir e salvou depois, mandou a lista
antiga e apagou o menu novo sem perceber. Registrado na §A.23; a correção (a tela recarregar o
catálogo antes de salvar, ou salvar por diferença em vez de substituição) **não foi feita**, é
decisão do diretor.

### 2. Candidato de teste para provar o disparo sem atingir candidato real

`db/seed-candidato-teste.ts`, idempotente e reversível. Cria um candidato fake mais uma admissão com
as TRÊS frentes já concluídas, que é o gate F12, então ela nasce na aba "Prontos para solicitar".

- **CPF** `111.444.777-35`: fake com dígito verificador válido (precisa ser válido, o `cpf_valido` do
  sistema e a própria Clicksign recusam dígito inconsistente). É o CPF canônico de teste já usado nos
  testes deste repositório.
- **Nome** `CANDIDATO TESTE CLICKSIGN`, inconfundível em qualquer fila.
- **E-mail** `henrique.vieira+clicksign-teste@soulan.com.br` por padrão, sobrescrevível por argumento.
  Precisa de e-mail porque o requirement de autenticação da Clicksign é por e-mail.
- **Cliente 631 (SOULAN) e cargo do catálogo REAL**: não criamos cliente/cargo de teste para não
  sujar catálogo que a operação usa.

```
npx tsx src/db/seed-candidato-teste.ts                     # cria/atualiza
npx tsx src/db/seed-candidato-teste.ts outro@email.com     # com outro e-mail
npx tsx src/db/seed-candidato-teste.ts --remover           # apaga tudo do teste
```

Rodado: admissão `4f06ec16`, confirmada na aba "Prontos para solicitar" (aptos passou de 7 para 8).
Se já houver envelope em andamento, o script NÃO toca no estado da assinatura.

### 3. LEVANTAMENTO: múltiplos signatários na API v3 (nada construído)

Sondagem feita na SANDBOX com envelope `draft`, nunca ativado, **apagado ao final** (DELETE 204,
confirmado 404 depois). Nenhum e-mail saiu.

**Múltiplos signatários: suportado nativamente.** `POST /envelopes/{id}/signers` é chamado N vezes; o
envelope aceita quantos signatários quiser. Cada signatário devolve id próprio. Atributos confirmados
ao vivo: `name`, `email`, `birthday`, `phone_number`, `has_documentation`, `documentation`,
`refusable`, `group`, `location_required_enabled`, `communicate_events`, `signature_host`.

**Papel: é o `role` do REQUIREMENT, não do signatário.** O papel não vive no signatário; vive no
requirement que liga (documento + signatário). Testei 34 valores contra a API e **33 foram aceitos**,
entre eles o par exato do contrato de trabalho: **`employee`** e **`employer`**. Também aceitos:
`sign`, `approve`, `witness`, `party`, `intervening`, `contractor`, `contractee`,
`legal_representative`, `attorney`, `manager`, `administrator`, `guarantor`, `surety`, `debtor`,
`creditor`, `lessor`, `lessee`, `seller`, `buyer`, `issuer`, `receipt`, `endorser`, `endorsee`,
`transferor`, `transferee`, `joint_debtor`, `co_responsible`, `validator`, `accountant`, `grantor`,
`grantee`. Rejeitado: `ratifier`. Hoje o EA manda `role: "sign"` fixo para o único signatário.

**Ordem de assinatura: existe, é o campo `group` do signatário.** Documentado e confirmado ao vivo
(criei signatário com `group: 1` e outro com `group: 2`, ambos persistiram). Regra: signatários de
grupos superiores só assinam depois que TODOS do grupo anterior assinaram, e **só são notificados
quando o grupo deles fica ativo**. Default `1`; todo mundo no mesmo grupo significa ordem livre.

**Outros achados úteis do envelope** (atributos que ele já devolve por default e que o EA não usa):
`block_after_refusal: true`, `deadline_partial_signature_action: "closed"`, `rubric_enabled: true`,
`remind_interval: 3`. E `refusable` por signatário, que define se aquela pessoa pode recusar.

**O desenho do diretor é suportado pela API, sem adaptação.** Ele definiu: assinante padrão da
empresa (pessoa fixa) com exceção por cliente, no mesmo modelo da pasta-pai do Drive, e o funcionário
seguindo individual por admissão. A API atende direto: o EA resolve QUEM assina pela empresa antes de
montar o envelope e adiciona o segundo signatário com os dados dessa pessoa. Nada na Clicksign precisa
saber que existe "padrão" e "exceção", isso é resolução interna do EA.

**Recomendação de desenho (para o diretor fechar):**
- **Papéis:** `employee` para o funcionário e `employer` para a empresa, em vez do `sign` genérico de
  hoje. É semântica correta no documento assinado e não custa nada.
- **Ordem:** funcionário no `group: 1`, empresa no `group: 2`. Duas razões: a empresa assina por
  último confirmando o que o funcionário aceitou, e, pela regra de notificação, o representante da
  empresa **não recebe e-mail enquanto o funcionário não assinar**, o que evita encher a caixa de
  quem assina dezenas de contratos com convites que ainda não pode atender.
- **`refusable`:** manter `true` no funcionário (ele pode recusar, é direito dele) e `false` no
  representante da empresa (recusa da empresa é decisão que não se toma pelo botão da Clicksign).
- **CPF do representante:** a API aceita signatário SEM documentação (`has_documentation: false`,
  provado na sondagem). Vale decidir se o CPF do representante entra; entrando, a assinatura fica mais
  forte juridicamente, e §A.6 se aplica igual (nunca logar).

**O que a sondagem NÃO cobriu:** o comportamento do fechamento com 2 signatários (o `auto_close` só
fecha quando todos assinam) e o efeito real do `group` na notificação só se provam com um envelope
ATIVADO, e ativar dispara e-mail. Fica para quando o diretor autorizar o teste ponta a ponta com o
candidato fake, agora que ele existe.

### Aberto

Decisão do diretor sobre a tela de Usuários salvar por substituição (bug latente que apaga menu novo).
E o aval para disparar o primeiro envelope de verdade, agora com o candidato de teste pronto.

---

## 2026-07-28 (3): Clicksign, finalização SEQUÊNCIA 1 (scheduler interno, porta fechada, menu novo)

Entrega dos itens 1, 2 e 3 da OST de finalização, mais o tratamento de expiração. A SEQUÊNCIA 2
(fila de disparo e gatilho automático) **não foi iniciada**, como a OST manda: só depois de 1 a 3
provados. No ar, migração 0043 aplicada, gate verde (**661 testes**, typecheck dos 3 pacotes, lint
com os mesmos 2 erros pré-existentes de `react-hooks/exhaustive-deps`). Tudo em **sandbox**.

### 1. Scheduler interno: o tick deixou de depender de um cron que nunca existiu

`ClicksignSchedulerService` espelha o do Pandapé e o do VT: `setInterval` in-process que só ENFILEIRA
o `poll-tick`; o ciclo roda no worker BullMQ, sob o limiter. Estado na linha singleton
`clicksign_scheduler_estado`, com liga/desliga lido a cada ciclo, então o freio vale **sem deploy**.
Toggle e "rodar agora" na tela de diagnóstico, mais o card e a gaveta com as contagens do ciclo.

**Cadência: 5 minutos, não 1.** O desenho antigo (§A.5) pedia 1/min por causa da URL do assinado, que
expira em ~5 min. Só que essa URL é obtida e consumida DENTRO do mesmo ciclo (`arquivarAssinado` baixa
síncrono), então a cadência não corre atrás dela: ela só decide quanto tempo um contrato assinado leva
para aparecer no Drive. 5 min deixa folga enorme contra o teto da Clicksign e o custo do ciclo é 1
consulta por envelope ABERTO, não por admissão. Com a base atual (zero envelope) o ciclo é uma query
local e nada mais.

A rota `POST /internal/clicksign/tick` **continua existindo**, agora como disparo externo/manual em
vez de dependência. Ela passou a atravessar o scheduler, e não a fila direto, para respeitar o
liga/desliga: com o freio puxado, nem o disparo externo enfileira.

### 2. Expiração de envelope: a dívida de "AGUARDANDO para sempre" fechada

Status novo `EXPIRADO` no enum (banco + shared-types + pill vermelha) e coluna
`admissoes.clicksign_enviado_em`, o carimbo da ATIVAÇÃO. O tick marca EXPIRADO quando o envelope passa
dos 30 dias sem fechar nem ser cancelado, e o diagnóstico ganhou o sinal "Envelope de assinatura
expirado". O prazo é o **mesmo** que vai no `deadline_at` do envelope, amarrado de propósito: o EA não
pode expirar antes da Clicksign nem manter para sempre o que ela abandonou.

Duas decisões que os testes travam:
- **A ordem importa.** O prazo só é avaliado DEPOIS de `closed` e `canceled`. Um envelope assinado no
  último dia, cujo ciclo só rodou depois do vencimento, tem de ser ARQUIVADO, não expirado. Expirar
  primeiro perderia o contrato.
- **FAIL-SAFE sem carimbo.** Envelope sem `clicksign_enviado_em` NUNCA expira. Se a regra fosse a
  inversa, o primeiro ciclo expiraria em massa todo envelope anterior a esta entrega.

### 3. A porta sem placa fechada: POR MENU, não por bloqueio de rota

A OST deixou a escolha entre bloquear a rota e colocá-la sob permissão de menu. **Escolhi o menu**, e
o motivo é que o bloqueio de rota resolveria só metade: a tela `/kit` era o sintoma, o buraco de
verdade era a OPERAÇÃO `KitController.gerar`, que não era reivindicada por menu nenhum e por isso o
`MenuGuard` liberava para qualquer autenticado, com tela ou sem tela (bastava um POST). Bloquear a
rota no frontend deixaria o endpoint aberto.

Então `KitController.gerar` e `KitController.historico` passaram a pertencer ao menu novo, e
`/kit` foi mapeada para o MESMO menu no `ROTA_MENU`. Tela e operação com a mesma régua, pelo
mecanismo que o sistema já tem, **sem apagar a F9** (que o `reenviarCorrecao` ainda usa, §A.15).

`KitController.download` ficou FORA de propósito: o token de download é consumido também pelo reenvio
disparado do modal da Esteira, e reivindicá-lo quebraria quem tem "esteira" sem ter este menu.

### 4. Menu novo "Gerenciamento de assinatura"

Grupo Operação, ordem 8, visível ao COMUM. Três abas: **Em aberto** (aguardando, cancelado,
expirado), **Prontos para solicitar** (sem envelope e com as 3 frentes concluídas) e **Assinados**
(histórico). As três ações da OST: **solicitar** (sobe o PDF-mãe e reusa o `KitService.gerar`, que
aplica o gate F12), **cancelar** (best-effort no provedor, autoritativo no EA) e **reenviar por
correção** (com o aceite de dupla correção nas admissões do Pandapé). Reusa o enum e as pills que já
existiam.

A aba "Assinados" exige `clicksign_envelope_id` preenchido. Sem isso, as **1.486 admissões marcadas
ASSINADO pela carga** (§A.16 regra 1, que nunca passaram pela Clicksign) inundariam a tela: a aba
viraria a lista de admissões concluídas em vez do histórico de assinatura.

### Prova (ambiente real, backend 12:06)

- **Guard**: token sintético de COMUM (uuid que não existe na base, nenhum usuário real impersonado)
  toma **403** em `GET /clicksign/envelopes`, `POST /kit/:id/gerar` e `POST /clicksign/:id/cancelar`,
  com a mensagem nomeando o menu `assinaturas`. Controle: o mesmo token toma 403 em
  `POST /kit/processar` citando `gerador-kit`, ou seja, o Gerador de kit novo NÃO foi capturado.
- **Listagem**: as 3 abas respondem 200. `abertos`=0, `assinados`=0 e **`aptos`=7 admissões reais**
  com as três frentes concluídas, prontas para a primeira solicitação. Aba inválida cai em `abertos`.
- **Ações**: cancelar sem envelope devolve 404 explicativo; solicitar sem arquivo devolve 400.
- **Scheduler**: sobe no boot e registra o ciclo (ver abaixo).

### Efeito colateral corrigido no meio do caminho

O `backfill-menus-comum.ts` concede TODO o grupo Operação (é o padrão do COMUM da decisão de
24/07). Rodá-lo para conceder `assinaturas` acabou concedendo também `analise` e `nao-conformidades`
a 3 usuários que não tinham. Isso está FORA do escopo desta OST (§A.14), então as **5 linhas extras
foram removidas**: no fim, só `assinaturas` foi acrescentado aos 5 COMUM ativos. Fica registrado para
o diretor decidir, porque pela decisão de 24/07 esses 3 usuários DEVERIAM ver a Operação inteira, e
hoje não veem.

### Não entrou (SEQUÊNCIA 2, como a OST determinou)

Fila de disparo com lote e o gatilho automático kit→envelope. O gatilho continua dependendo da decisão
de desenho sobre o CPF: o motor agrupa por CPF internamente mas só expõe `nome` + `cpf_mascarado`
(`***.456.789-**`), então linkar kit a admissão pede escolha, não construção direta.

### Aberto

Validação do diretor na tela. E uma decisão que NÃO tomei sozinho: **disparar o primeiro envelope de
verdade**. Há 7 admissões aptas, mas solicitar assinatura manda e-mail real ao candidato real, mesmo
em sandbox. Precisa do aval do diretor e, de preferência, de um candidato de teste.

---

## 2026-07-28 (2): Clicksign (INT-4), retrato do estado REAL antes de finalizar o menu. Nada construído

Levantamento pedido pelo diretor (§A.14, só retrato). Reconfere e ATUALIZA o levantamento de
2026-07-24 (5), que segue válido no essencial. Aqui vale o que foi conferido contra o **bundle e o
processo VIVO**, contra o **banco** e contra o **Redis**, não contra os testes.

### 1. Código das 8 operações: NO AR, deployado hoje

Está em `apps/backend/dist/clicksign/` (rebuild de hoje, 11:14) e carregado no processo que subiu às
11:15. O log de boot do `ea-backend` mostra `ClicksignModule`, `ClicksignQueueModule`, as duas rotas
mapeadas (`POST /api/internal/clicksign/tick` e `POST /api/clicksign/:admissaoId/reenviar-correcao`),
`Fila clicksign-sync inicializada` e `Worker clicksign-sync inicializado`. Não ficou em branch nem em
árvore não deployada.

Prova adicional de que o bundle é o working tree e não o último commit: o código da PAUSA (OST de
27/07, ainda **não commitado**, `clicksign-sync.service.ts` marcado como M no git) está compilado
dentro do `dist` (a string "admissão PAUSADA (não é cancelamento, é adiamento)" aparece no JS
servido). O que está no ar é a versão mais nova, com os filtros de pausa nos dois caminhos: o
`criarEnvelope` não nasce envelope de admissão pausada, e o `processarTick` tira a pausada da lista de
alvos sem tocar no envelope.

As 8 operações continuam íntegras em `clicksign-api.service.ts`: criar envelope, anexar documento
(base64 inline), signatário (CPF pontuado, nunca logado), 2 requirements, ativar (running), consultar
status, obter URL do assinado, cancelar (draft por DELETE, running best-effort). Orquestração em
`clicksign-sync.service.ts`: `criarEnvelope`, `processarTick`, `arquivarAssinado`, `reenviarCorrecao`.
Testes: 30 verdes em 7 arquivos (contexto, não é a prova de deploy).

### 2. Tick: worker VIVO, agendamento INEXISTENTE. Não roda sozinho

O worker está de pé e o endpoint responde. Chamei o `POST /api/internal/clicksign/tick` com o
`X-Internal-Token` real: **202**, job enfileirado e processado. Ou seja, enfileira e processa quando
alguém chama.

**Ninguém chama.** Não há `crontab` do usuário, não há timer systemd, não há entrada em
`/etc/cron.d`. O `infra/install-clicksign-cron.sh` (cadência 1/min, 7h às 23h) existe e nunca foi
rodado. Diferente do Pandapé e do VT, que têm scheduler DENTRO do Nest (`PandapeSchedulerService`,
`VtColetaSchedulerService`, visíveis no boot), a Clicksign **não tem scheduler interno**: depende
100% do cron externo que nunca foi instalado.

Histórico completo da fila no Redis (`ea:bull:clicksign-sync`, db1), desde sempre: **5 jobs
concluídos, 0 falhos**. São 4 `poll-tick` (30/06 às 17:19, 17:20 e 17:58, mais o meu de hoje às
11:22) e 1 `criar-envelope` (30/06 às 15:57, da admissão `577a3019...`, que **não existe mais no
banco**, foi varrida pela carga). Em 28 dias o tick rodou 3 vezes, todas no dia do desenvolvimento.

### 3. Gatilho do primeiro envelope: existe, mas é uma porta sem placa

Só um caminho enfileira `criar-envelope`: `KitService.gerar`, chamado por `POST /kit/:admissaoId/gerar`
(a F9 antiga) e pelo `reenviarCorrecao`. O `/gerador-kit` novo (`processarMotor`) **não cria envelope
nenhum**: ele recebe N PDFs, devolve M kits por funcionário para download e nunca vê um `admissaoId`.

O detalhe que corrige o levantamento anterior: a tela `/kit` saiu do MENU, mas **não está bloqueada
por rota**. O guard do frontend (`app/(app)/layout.tsx` + `lib/menu-rotas.ts`) só barra rota que tenha
menu mapeado, e `/kit` não está no `ROTA_MENU`. A rota foi gerada no build de hoje e qualquer usuário
autenticado que digite `/kit` na barra de endereço chega à tela e consegue gerar o kit, o que dispara
o envelope. Então existe caminho vivo, só que **não descobrível**: ninguém acha pelo menu.

Para o gatilho automático por candidato (a evolução do §A.5), o bloqueio técnico é concreto: o motor
do kit agrupa por CPF internamente (`kit_motor.cpf_valido`, com dígito verificador), mas o que sobe
para o backend é `nome` + `cpf_mascarado` no formato `***.456.789-**`. O CPF cru **não sai do
ai-service** por decisão de §A.6. Linkar kit a admissão pede uma decisão de desenho, não é só ligar
fio.

### 4. Ambiente: SANDBOX, zero envelope real

`CLICKSIGN_API_BASE_URL=https://sandbox.clicksign.com/api/v3`, token sandbox presente (a integração
está ATIVA, não inerte). No banco hoje:

| clicksign_status | admissões | com envelope_id | com URL do Drive |
|---|---|---|---|
| ASSINADO | 1.486 | **0** | **0** |
| SEM_ENVELOPE | 890 | 0 | 0 |

**Envelopes reais: zero.** Os 1.486 ASSINADO são artefato da carga (§A.16 regra 1), não Clicksign.
O SEM_ENVELOPE subiu de 864 para 890 desde 24/07, pelas admissões novas.

### 5. Fila de disparo e menu de gerenciamento: NÃO EXISTEM, ponto de partida é zero

Nenhum dos dois foi construído. Não há menu de assinaturas em `domain/menus.ts` (os menus são início,
análise, liberação, nova, esteira, não conformidades, gerenciador, gerador de kit e os 10 de
administração). Não há tela, rota nem tabela de fila de disparo. O "Liberação Admissional" é outra
coisa: fila de pré-admissões do Pandapé, não tem relação com assinatura.

Hoje o disparo é imediato e individual: gerou o kit pela F9, o envelope é enfileirado na hora, sem
lote, sem revisão e sem liberação do consultor. O que EXISTE e pode ser reusado: a fila BullMQ com
limiter (18 req/10s) e backoff 5x, o gate F12 revalidado dentro do `criarEnvelope`, os 4 status do
enum e as pills prontas no frontend (`lib/clicksign.ts`).

### 6. Status na aba Cadastro do Farol: JÁ APARECE

Construído e no ar, nos dois lugares. Na linha da fila (`esteira/page.tsx` ~1366) a pill do status sai
só na aba Cadastro, com `SEM_ENVELOPE` oculto de propósito, mais o botão "Contrato no Drive" quando há
URL arquivada. No modal do olho (`AdmissaoDetalheModal.tsx` ~509) sai o bloco "Assinatura:" com a pill
e o botão de reenviar por correção, com o modal de aceite da dupla correção.

A regra de visibilidade da fila também está de pé (`esteira.service.ts` 183 a 197): na aba Cadastro a
admissão permanece na fila se `não concluída OR clicksign_status IN (AGUARDANDO_ASSINATURA,
CANCELADO)`, e só some em ASSINADO ou SEM_ENVELOPE. Nunca foi exercitada com dado real, porque nunca
houve envelope.

### 7. Caminho crítico para operar ponta a ponta

| # | Etapa | Estado | O que falta |
|---|---|---|---|
| 1 | Kit gerado | **PARCIAL** | O motor novo (`/gerador-kit`) gera kit mas não linka em admissão. A F9 antiga linka e dispara, porém só por URL digitada, fora do menu |
| 2 | Entra na fila de disparo | **FALTANDO** | Não existe fila de disparo. Hoje o envelope é enfileirado direto, sem etapa intermediária |
| 3 | Consultor libera o lote | **FALTANDO** | Não existe conceito de lote nem de liberação. Sem tela, sem rota, sem tabela |
| 4 | Envelope criado e ativado | **PRONTO** | As 5 chamadas estão prontas e provadas no sandbox em 30/06. Dependências por admissão: candidato COM E-MAIL (sem e-mail o `criarEnvelope` pula) e as 3 frentes concluídas |
| 5 | Tick verifica | **PARCIAL** | Código pronto e endpoint respondendo 202. Falta o agendamento: instalar o cron ou, melhor, dar à Clicksign um scheduler interno como o do Pandapé e o do VT |
| 6 | Assinado baixado e arquivado | **PRONTO, não exercitado** | Código completo (download síncrono da URL de ~5min, Drive subpasta ADMISSAO, grava URL, recomputa farol). Depende da pasta-pai mapeada por cliente e contrato, senão não arquiva e fica em AGUARDANDO |

Resumo honesto: **as pontas estão prontas e o meio não existe**. Criar envelope, verificar e arquivar
são código maduro; o que falta é tudo que fica ENTRE gerar o kit e criar o envelope (linkagem, fila,
liberação em lote) mais o agendamento do tick.

### Correções ao levantamento de 24/07

- **TTL do kit na staging é 2h, não 1h** (`staging-purge.service.ts`, `TTL_KIT_MS = 2 * 60 * 60 *
  1000`). O comentário do `kit.controller.ts` ainda diz 1h e está desatualizado. Importa porque o job
  `criar-envelope` lê o kit do disco: expurgado antes do worker, entra em backoff.
- **"Não há caminho vivo de tela"** era forte demais. A tela `/kit` está no ar e alcançável por URL,
  só não é descobrível pelo menu.
- Nesses 4 dias entrou a lógica de PAUSA nos dois caminhos da Clicksign, já no ar.

### Pendências que continuam de pé (do levantamento anterior)

Decidir sandbox x produção; e-mail do candidato; pasta-pai do Drive; validar cancelamento de running
em produção; **expiração de envelope (deadline 30 dias) sem tratamento**, se a Clicksign não devolver
closed nem canceled o registro fica AGUARDANDO para sempre; dívida da §A.15 (o `reenviarCorrecao`
depende do `kit.gerar` antigo).

### Nota de execução

Nada foi construído nem alterado (§A.14). O único efeito colateral do levantamento foi a chamada ao
tick, que executou uma varredura: com zero admissão em AGUARDANDO_ASSINATURA, foi no-op e não tocou a
rede da Clicksign.

---

## 2026-07-27 (7): Gerador de Kit, documento PADRÃO x INDIVIDUAL e agrupamento por CPF (o caso da Elaine)

Três ajustes numa OST, os dois primeiros levantados e aprovados antes de construir. **Construído e com
gate verde. NÃO deployado**: a migração ainda não rodou no banco e os serviços não foram reiniciados
(a trava do §A.7 barrou o verbo, como deve). Aguardando o aval do diretor para subir e validar em
produção.

### O que estava quebrado, com o endereço exato

**Problema 1, os manuais travavam.** `kit_motor._segmentar` mandava para "não reconhecidos" TODO bloco
sem nome de funcionário, sem exceção por tipo. Os itens "MANUAL" e "MANUAL DE PROCEDIMENTOS MARCAÇÕES
DE PONTO" são instrução geral, iguais para todos, e por isso não têm nome: caíam na fila de revisão,
não entravam no PDF de ninguém, e ainda contavam no denominador do painel. Todo funcionário nascia com
"Faltam 2" no mínimo.

**Problema 2, a Elaine partida em duas.** `_identificar` fazia o balde por NOME normalizado e só
desempatava por CPF **dentro** do balde. Como "ELAINE CRISTINA LOPES FERNANDES DA S" e
"... DA SILVA" normalizam para strings diferentes, caíam em baldes diferentes e **os CPFs delas nunca
chegavam a ser comparados**. Não era problema de limiar de similaridade, era **hierarquia de chave**:
mesmo CPF nos dois lados, a divisão era garantida por construção.

### Ajuste 1, a regra virou DADO

Coluna `padrao boolean not null default false` em `kit_regra_documento` (migração `0042`), no mesmo
espírito do `exigeValor` de benefícios. **Sem backfill por adivinhação**: decisão do diretor, marcar
por nome de título seria exatamente o vício que a OST elimina. O default `false` deixa todo documento
existente INDIVIDUAL, então nada muda de comportamento até alguém marcar na tela.

Toggle "Padrão / Individual" em `/admin/kit-regras`, ao lado do "Ativo" que já existia (a tela já é
Master/Super Admin). O motor lê a flag junto com o título (`kit_dict`), e a montagem seguiu a **opção
A** aprovada: o PADRÃO **entra no kit de cada funcionário do lote**, na posição de ordem dele, e sai no
PDF consolidado que vai para assinatura. Repetido no PDF-mãe (uma cópia por pessoa), é deduplicado por
título e entra uma vez só em cada kit.

O denominador do painel **não precisou mudar**: com o PADRÃO presente nos documentos de cada pessoa, o
`faltando` já o conta corretamente. A Elaine fica 10/10 com o manual dentro. O painel só ganhou a tag
"Padrão" na lista expandida, para o consultor saber o que é instrução geral.

### Ajuste 2, o CPF virou chave primária

`_identificar` foi invertido. Agora, em ordem:
1. **Grupo por CPF válido, ignorando o nome.** As duas metades da Elaine viram uma pessoa.
2. **Nome exibido = a grafia mais completa** do grupo (a mais longa, empate pela primeira ocorrência).
   O painel mostra "... DA SILVA", não o truncado.
3. **Bloco sem CPF anexa por nome**, com regra determinística de truncamento de token: mesma contagem
   de tokens, todos os anteriores idênticos, último token do menor é prefixo **próprio** do maior.
   Casou com mais de um grupo, **não funde**: entrada própria com tarja de revisão.
4. **Guarda absoluta: dois CPFs válidos distintos NUNCA se fundem.**

**CPF válido ficou mais duro:** era só `len(digitos) == 11`, agora confere o **dígito verificador** e
rejeita sequências repetidas. O CPF vem de OCR, e um dígito trocado viraria chave de fusão errada.
Reprovado, o bloco não perde o documento: cai no casamento por nome.

**Sem Jaro-Winkler e sem difflib, de propósito.** O modo de falha real é truncamento, que a regra de
prefixo modela sem ambiguidade e é auditável ("por que fundiu?" tem resposta exata). Limiar numérico
resolveria erro de DIGITAÇÃO, que é outro problema, e é justamente onde nasce o falso-positivo.

### Ajuste 3, o Reimportar (a fragilidade espelho)

`kit_job` casava o funcionário por nome normalizado **exato** contra o alvo do painel. Depois do
Ajuste 2 isso viraria bug novo: a pessoa cujo nome canônico virou a grafia completa seria **recusada
com 409** ao reimportar um PDF que traz o nome truncado. Agora `_casar_alvo` usa a mesma hierarquia,
CPF primeiro e nome depois, com a mesma regra de truncamento.

O CPF comparado é o **mascarado** (os 6 dígitos do meio). Basta para distinguir dentro de um lote de
algumas dezenas e preserva a propriedade §A.6 de o resultado do job nunca guardar o CPF inteiro. Quem
tem CPF **diferente** do alvo fica fora do casamento por nome: CPF distinto é outra pessoa, e nome
parecido não reabre essa porta.

### Prova (textual, sem prints, por instrução da OST)

| Caso | Teste | Resultado |
|---|---|---|
| PADRÃO não trava e entra no kit de todos | `test_ajuste1_padrao_nao_trava_e_entra_no_kit_de_todos` | 0 não reconhecidos; manual (2 páginas) no kit dos 2 funcionários |
| INDIVIDUAL continua exigindo nome | `test_ajuste1_individual_continua_exigindo_nome` | o INDIVIDUAL sem nome vai para revisão, o PADRÃO sem nome não |
| PADRÃO repetido não duplica | `test_ajuste1_padrao_repetido_no_lote_entra_uma_vez_por_kit` | 1 manual por kit |
| Sem marcação, nada muda | `test_ajuste1_sem_marcacao_nada_muda` | comportamento anterior intacto |
| **Elaine** | `test_ajuste2_elaine_duas_grafias_mesmo_cpf_viram_uma_pessoa` | 1 funcionário, nome completo, 3 documentos consolidados |
| **Não funde quem é diferente** | `test_ajuste2_cpfs_distintos_nunca_fundem_mesmo_com_nome_truncado` | "MARIA SOUZA LIM" e "MARIA SOUZA LIMA" com CPFs distintos seguem 2 pessoas |
| Ambíguo não funde em silêncio | `test_ajuste2_sem_cpf_ambiguo_vira_entrada_propria_com_tarja` | 3 entradas, a órfã com `REVISAO_NOME_AMBIGUO` |
| Truncado sem CPF anexa ao dono | `test_ajuste2_sem_cpf_com_nome_truncado_anexa_ao_dono` | 1 funcionário, 2 documentos |
| "JUNIOR" não é truncamento | `test_ajuste2_token_sobrando_nao_anexa` | 2 pessoas |
| CPF com dígito errado não vira chave | `test_ajuste2_cpf_com_digito_errado_cai_no_nome_e_nao_funde_errado` | exibe o CPF válido, não o corrompido |
| **Reimportar com nome truncado** | `test_ajuste3_reimportar_casa_por_cpf_com_nome_truncado` | 200, documento anexado (antes seria 409) |
| Reimportar com CPF de outro | `test_ajuste3_reimportar_cpf_diferente_continua_recusado` | 409 |

### Gate

ai-service **111 testes** verdes (20 no motor, 11 novos nos três ajustes), `ruff check` limpo nos
arquivos tocados. Backend **633 testes** (73 arquivos), com 5 novos em `kit-regras.service.spec.ts`.
Frontend 58, shared-types 5. Typecheck verde nos 3 pacotes. Lint com os mesmos **2 erros
pré-existentes** de `react-hooks/exhaustive-deps` (`nova/page.tsx` e `vt/page.tsx`), confirmados
intocados por esta OST: reproduzem com as minhas mudanças fora do caminho.

### Aberto

1. **Migração `0042` não aplicada** e serviços não reiniciados. Sem ela, a tela de kit-regras quebra
   (a consulta lê `padrao`), então a subida é atômica: migrar, reconstruir, reiniciar.
2. **Marcação dos manuais**: depois de subir, o diretor marca "Padrão" nos dois manuais na tela. É o
   backfill que ele escolheu fazer à mão.
3. Validação em produção e, só depois, commit e push (§A.21).

---

## 2026-07-27 (6): "Admissão Pausada" virou VALOR do seletor de status, botões removidos

Correção do diretor sobre o desenho anterior. **No ar, aguardando validação em produção.**

### Onde o seletor vive (uma vez só, as duas telas)
`Campo "Status (farol)"` no **`EditAdmissaoModal`** (o lápis), alimentado por `FAROL_SELECT_OPTIONS`
(`lib/farol.ts`). É o MESMO componente aberto pela Esteira e pelo Gerenciador, e a MESMA lista
alimenta o filtro de Status do Gerenciador. Acrescentar a opção num lugar só cobriu tudo.

### O PONTO TÉCNICO: como o seletor mostra "Pausada" sem o farol mentir

Os dois requisitos pareciam brigar: o diretor quer VER e SELECIONAR "Pausada" no seletor de status, e
a decisão anterior (flag paralela) existia para o farol não mentir ao retomar. Reconciliação:

**O seletor é APRESENTAÇÃO. O banco continua com a flag.** Duas funções puras resolvem:
- **Exibir** é derivado: `valorSeletorFarol(farolGlobal, pausadaEm)` devolve `PAUSADA` quando a flag
  está de pé, senão o farol real. `PAUSADA` é **pseudo-valor de tela**, não entra no enum
  `farol_global`.
- **Gravar** é traduzido: escolher "Pausada" chama a rota `pausar` **já construída e provada** (a
  mecânica não mudou, só o gatilho), e o `PATCH /admissoes` do mesmo salvar envia o **farol REAL**,
  não `PAUSADA`. Escolher qualquer outro status estando pausada chama `retomar`.

Por que isso preserva o que a flag garantia: o farol nunca recebe "PAUSADA", logo nunca precisa
entrar em `FAROL_MANUAL`, logo **a derivação nunca congela**. Se Auditoria e Exame fecharem durante a
pausa, o farol vira `BANCO_AGUARDAR` por baixo normalmente; o seletor segue exibindo "Pausada" e, ao
retomar, mostra `BANCO_AGUARDAR` sem nada a restaurar. Travado em teste (`lib/farol.spec.ts`).

**Motivo da pausa:** campo que aparece quando "Pausada" é o status escolhido, **exatamente o padrão
do "Motivo do declínio"** que já existia dois campos abaixo, no mesmo modal. Opcional, texto livre.

### O que foi REMOVIDO
O ícone de pausar e o de retomar da coluna Ações da Esteira, o modal de pausa e os handlers. Nada de
botão na ficha (não chegou a existir). **Isso também fecha o transbordo da §A.20**: a coluna Ações
voltou a **3 ícones = 100px numa trilha de 120px, com 20px de folga** (era 134px em 120px).

### PROVA (ao vivo, produção, pelo fluxo do seletor)

Bundle servido: `Admissão Pausada` e `Motivo da pausa` presentes; `Pausar admissão`/`Retomar admissão`
com **zero** ocorrência. *(Busca sem depender do acento, a lição do erro anterior.)*

Selecionando "Admissão Pausada" no seletor, que dispara `PATCH /admissoes` (farol real) + `pausar`:

| Prova | Resultado |
|---|---|
| Flag gravada | `pausadaEm 2026-07-27T16:33:32Z` |
| **Farol por baixo** | **`EM_ADMISSAO`, intacto** (não recebeu "PAUSADA") |
| Seletor exibe | **Admissão Pausada** |
| Fila da Auditoria | saiu (total 49 → **48**) |
| Card "Pausadas" | 0 → **1**, e ela aparece no filtro |
| Tag na coluna Status | presente, com o status da frente **preservado** (`ANALISE_PENDENTE`) |
| Filtro "Pausada" do Gerenciador | devolveu **1 item**, o certo, todos com `pausadaEm` |
| Scheduler do Pandapé / coleta de VT | **0** alvos (pularam) |
| Gate do kit | 409 "Admissão pausada: retome a admissão para gerar o kit." |
| **Auditar durante a pausa** | **HTTP 201**, e a pausa e o farol seguiram de pé depois |

Retomando pelo seletor: frentes **idênticas** (`ANALISE_PENDENTE` / `A_AGENDAR`), de volta à fila,
KPIs em 49/0. Trilha do modal do olho com quem e quando, incluindo o motivo:
`pausa: Admissão pausada -> Admissão retomada | Marcelo`.

*(O resíduo da auditoria de prova, uma observação num documento real, foi apagado de volta a null,
como na rodada anterior.)*

### Gate
Backend **628 testes** (+3 do filtro traduzido), frontend **58** (+8 do seletor). Typecheck verde nos
3 pacotes. Lint com os **mesmos 2 erros pré-existentes**. Backend e frontend reconstruídos e no ar.

### Aberto, e é honesto repetir
Segue **sem screenshot**: o Playwright não está instalado e os binários do Chromium não sobem por
falta de `libatk-1.0.so.0` (precisa de root). A prova de layout acima é **aritmética do fonte**, não
tela conferida. A validação visual é do diretor. **Sem commit até ela** (§A.21).

---

## 2026-07-27 (5): INVESTIGAÇÃO, por que a pausa "não aparece". NÃO era falta de deploy

O diretor validou em produção e não encontrou como pausar. Investigação antes de corrigir (§A.14).
**A hipótese da OST está descartada: houve deploy e a migração está aplicada.** O problema é de
ENTREGA VISUAL, e é meu.

### 1) O que está REALMENTE em produção (a hipótese do não-deploy, descartada)

| Verificação | Resultado |
|---|---|
| Migração `0041` (pausada_em/por/motivo) | **aplicada**: as colunas existem e foram lidas/escritas ao vivo |
| Backend com as rotas | **no ar**: `pausar`/`retomar` responderam 200 e os 409 das travas, em produção |
| Backend reiniciado | 15:53:42, depois do último `nest build` |
| `.next/BUILD_ID` | `ezA7KVOCPzFtmxx2b0dZt`, gerado 15:49:27 |
| Fonte da Esteira | modificado 15:44:57, **antes** do build |
| Frontend reiniciado | 15:49:43, **depois** do build |
| Código da pausa no bundle servido | **está lá**: `Pausada`, `Pausadas`, `Pausar admiss\xe3o`, `Retomar admiss\xe3o` |

*Nota de método:* minha primeira varredura do bundle não achou os botões e quase me fez concluir
"não deployado". Era artefato do próprio grep: o minificador escapa o acento, então `Pausar admissão`
vira `Pausar admiss\xe3o` e a busca literal falhava. Buscar sem depender do acento mostrou tudo.

### 2) A CAUSA REAL, três achados que se somam

**(a) O único jeito de pausar é um ícone de 32px, sem rótulo, na coluna Ações da Esteira.** Não há
botão na FICHA (o modal do olho) e não há NADA no GERENCIADOR, que são justamente os dois lugares
onde o diretor procurou. Conferido por varredura: `gerenciador/page.tsx` tem **zero** ocorrência de
pausar/retomar, e o `AdmissaoDetalheModal` tem **uma**, que é comentário.

**(b) O ícone transborda a coluna. Violação da §A.20, cometida por mim.** `COL.acoes` é fixa em
**120px** e eu acrescentei um 4º botão sem remedir:

| Linha | Ícones | Largura necessária | Trilha | Resultado |
|---|---|---|---|---|
| Antes da OST | 3 (Drive, olho, lápis) | 100px | 120px | cabia |
| Depois | 4 (+ pausa) | **134px** | 120px | **transborda 14px** |
| Depois, com Drive e contrato | 5 | **168px** | 120px | **transborda 48px** |

(32px por botão, `gap-0.5` = 2px, direto do fonte.)

**(c) A tag "Pausada" só existe quando algo está pausado.** Ela é condicional a `item.pausadaEm`, e
como o botão estava inalcançável, nunca houve o que exibir. Do lado de quem valida, "não aparece como
tag" e "não existe" são a mesma coisa. Some-se que a pausa **não** é opção do seletor de status da
frente (por desenho: o seletor lista status de FRENTE, e a pausa é da ADMISSÃO), então também não
aparecia ali.

### 3) A FALHA DE PROCESSO, que é a lição de verdade

A §A.13 exige abrir a tela e conferir a screenshot antes de reportar entrega visual. **Eu não fiz
isso.** Reportei "no ar" com base em: testes verdes, `HTTP 200` na rota da página e provas de API
contra o banco. Nada disso olha a tela. As provas do Bloco 6 eram todas de backend, e por isso
passaram verdes enquanto a interface estava inalcançável. O gate anterior era de teste, não de
produção, exatamente como o diretor escreveu.

**E preciso reportar um limite, não contorná-lo em silêncio:** não consigo tirar a screenshot nesta
sessão. O harness existe (`~/.ea-harness`) e os binários do Chromium estão em `~/.cache/ms-playwright`,
mas o pacote npm do Playwright não está instalado e os dois binários não sobem por falta de
biblioteca de sistema (`libatk-1.0.so.0`), o que exige instalação com root. Vou corrigir o layout com
medida do fonte (aritmética determinística, acima) e **a conferência visual final depende do diretor
ou de destravarem o harness**. Não vou reportar "conferido na tela" sem ter conferido.

### 4) Correção proposta (aguardando o aval, §A.14)

1. **Botão com RÓTULO na ficha (modal do olho)**, que é onde o diretor procurou. Ganho extra: o modal
   é o MESMO componente usado pela Esteira e pelo Gerenciador (`AdmissaoDetalheModal`), então um
   botão ali resolve as duas telas de uma vez. Hoje o modal não recebe callback de recarga, então
   preciso acrescentar um (`onChanged`) para a lista atrás dele atualizar.
2. **Remedir `COL.acoes`** para caber o 4º ícone com folga, conferindo as três abas (§A.20).
3. **Tag "Pausada"**: já implementada nas duas telas; só ficará visível quando existir admissão
   pausada, o que passa a ser possível assim que (1) entrar.

Confirmar comigo se quer o botão **também** na linha do Gerenciador, ou se a ficha basta.

---

## 2026-07-27 (4): ADMISSÃO PAUSADA construída (flag paralela), 6 automáticos respeitando a pausa

Construção sobre o levantamento aprovado. **No ar, aguardando validação em produção.**

### O desenho, em uma frase
`pausada_em` / `pausada_por` / `pausa_motivo` na admissão. O farol **não** foi tocado e continua
derivando por baixo da pausa, então **retomar é limpar a flag**: nada precisa ser restaurado porque
nada foi alterado. Só `EM_ADMISSAO` pausa (decisão do diretor).

### A dívida do Bloco 2, fechada
`FAROIS_VIVOS` estava **copiado em 3 arquivos**. Agora existe uma vez, em `domain/admissao`, ao lado
de `admissaoOperavel(farol, pausadaEm)` (predicado puro) e de `admissaoOperavelSql()`/`naoPausada()`
(a contraparte Drizzle, em `db/admissao-filtros`). O objetivo é que o próximo automático nasça
respeitando a pausa porque esse é o caminho mais curto, não porque alguém lembrou.

### PROVA (ao vivo, produção, rotas reais)

Alvo: uma admissão `EM_ADMISSAO` com Auditoria em `ANALISE_PENDENTE` e Exame em `A_AGENDAR`.

**Sai da fila e das contagens, mas continua localizável:**

| | Antes | Pausada | Retomada |
|---|---|---|---|
| Na fila padrão da Auditoria | sim | **não** | sim |
| KPI "Total na fila" | 49 | **48** | 49 |
| KPI "Pausadas" | 0 | **1** | 0 |
| KPI "Com pendências obrigatórias" | 47 | **46** | 47 |
| No card/filtro "Pausadas" | não | **sim** | não |
| Na busca por nome do candidato | sim | **sim** | sim |

**Os automáticos, lista de alvos com e sem o filtro (a query real de cada um):**

| Automático | Alvo incluído COM o filtro novo | Incluído SEM o filtro (antigo) |
|---|---|---|
| Scheduler do Pandapé | **0** (90 alvos) | 1 (91 alvos) |
| Coleta de VT | **0** | 1 |
| Tick do Clicksign | **0** (0 alvos) | 1 (1 alvo) |
| Lista de Não Conformidades | **0** (52 itens) | 1 (53 itens) |

**Gate do kit:** `POST /kit/:id/gerar` na admissão pausada devolveu
`409 "Admissão pausada: retome a admissão para gerar o kit."`, e o corte acontece **antes** de salvar
o PDF-mãe na staging (a pausa não deixa resíduo para expurgar).

**Clicksign, como a prova foi feita:** não existe envelope `AGUARDANDO_ASSINATURA` na base (1.486
`ASSINADO` + 887 `SEM_ENVELOPE`). Em vez de forçar um envelope real no sandbox, montei o cenário
**dentro de uma transação revertida**: dei à admissão pausada um envelope em andamento, rodei a query
EXATA de `processarTick` com e sem o filtro, conferi que o envelope **continua lá, intacto**
(`AGUARDANDO_ASSINATURA`, mesmo id) e dei `ROLLBACK`. Nada persistiu, conferido depois. Mesma técnica
para a NC simulada. É o formato determinístico que a OST autorizou, e ele prova o que interessa:
**pular não é cancelar**, e o alvo é escolhido por `clicksign_status`, não por cursor, então ao
retomar o envelope volta à lista exatamente onde estava.

**A AUDITORIA continua, que é o ponto:** com a admissão pausada, `POST /esteira/auditoria/:id/documento`
rodou normalmente (**HTTP 201**, a IA devolveu veredito no RG). Depois disso, a pausa seguia de pé, o
farol seguia `EM_ADMISSAO` (derivando por baixo, sem congelar) e as duas frentes seguiam intactas.

**Retomar não recomeçou nada.** Frentes idênticas ao snapshot de antes da pausa (`ANALISE_PENDENTE` /
`A_AGENDAR`), farol idêntico, KPIs de volta a 49/0/47, scheduler voltando a incluir a admissão.

**As travas:** `ADMISSAO_CONCLUIDA` → 409, `DECLINOU` → 409, pausar a já pausada → 409 (não
sobrescreve a pausa nem o autor). Não havia `BANCO_AGUARDAR` na base para testar ao vivo; está coberto
por teste automatizado.

**Trilha no modal do olho**, com quem e quando, na mesma lista `alteracoes` que já existia:
`pausa: Admissão pausada` e `motivoPausa: Cliente suspendeu a contratação até o próximo mês`, autor
Marcelo, e a retomada como `pausa: Admissão pausada -> Admissão retomada`.

### RESÍDUO DA PROVA, limpo e registrado
Auditar um documento durante a pausa era a prova central, e ela **escreveu num documento real**: o RG
daquela candidata ganhou a observação "Documento ilegível ou em branco." (o arquivo enviado foi um PNG
1x1 gerado para o teste). O `estado` **não** mudou (era `PENDENTE`, seguiu `PENDENTE`) e nenhum
arquivo foi coletado. **Apaguei a observação de volta para null**, que era o estado anterior. Registro
porque foi escrita em dado de produção para viabilizar a prova.

### Decisões e um ponto que devolvo ao diretor
- **Gerenciador:** a pausada sai das **contagens** (KPI de pendências e "em andamento"), mas **fica na
  lista**. O Gerenciador é a visão geral consultável (§A.19), e é ali que a pausada continua achável.
- **Não Conformidades:** a **fila** exclui a pausada, como pedido. **O contador penalizante por
  consultor ficou INTOCADO**, e isso foi julgamento meu: suspender a fila é recorte de trabalho, mas
  apagar penalização seria reescrever um fato que já aconteceu. Se a intenção era zerar também o
  contador, é uma linha, me diga.
- **Runners de manutenção:** `varredura-documentos` PULA pausada (ela puxa documento do Pandapé, que é
  coleta); `recalcula-sinalizador-vivas` NÃO pula (o sinalizador é campo derivado, e congelá-lo só
  criaria divergência para consertar no retomar).

### Gate
Backend **625 testes** verdes (+28 nesta OST: 8 do predicado único, 15 de pausar/retomar, 3 do
Clicksign, 1 do gate do kit, 1 do menu). Frontend **50**. Typecheck verde nos 3 pacotes. Lint com os
**mesmos 2 erros pré-existentes** de `react-hooks/exhaustive-deps`, intocados. Backend e frontend
reconstruídos e no ar; `db:seed:menus` convergido (11 usuários configurados preservados).

### Aberto
Validação do diretor **em produção** (prova textual, sem prints): botões de pausar/retomar na Esteira,
tag "Pausada" na coluna Status (Esteira e Gerenciador), card "Pausadas" clicável e o modal do olho.
**Sem commit até a validação** (§A.21).

---

## 2026-07-27 (3): LEVANTAMENTO, status PAUSADA no farol admissional (BLOCO 1, nada construído)

Pedido do diretor: pausar uma admissão por questão interna do cliente, sem declinar e sem deixá-la
rodando. Auditoria continua, Clicksign congela, sai da fila mas segue localizável, retomar volta de
onde parou. **§A.14: só o BLOCO 1. Nenhuma linha de código foi tocada.**

### 1) Como o estado é modelado hoje: são TRÊS eixos independentes, não um

| Eixo | Onde | O que guarda |
|---|---|---|
| **Farol global** | `admissoes.farol_global` (enum, 7 valores) | Estado de CICLO DE VIDA da admissão |
| **Estado das frentes** | `frentes_admissao.status` + `.concluida` (3 linhas por admissão) | Onde cada frente REALMENTE está |
| **Sinalizador** | `admissoes.sinalizador_preenchimento` | DERIVADO da régua de pendências |

Os 7 faróis: `EM_ADMISSAO`, `BANCO_AGUARDAR`, `ADMISSAO_CONCLUIDA`, `DECLINOU`, `RESCISAO`,
`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`.

**O ponto que decide a recomendação:** o farol tem uma parte AUTOMÁTICA. `recomputeFarolGlobal` roda
depois de qualquer evento de frente, de auditoria e de edição, e `deriveFarolGlobal` **sobrescreve** o
farol, exceto os que estão em `FAROL_MANUAL` (hoje `DECLINOU`, `RESCISAO`, `ADMISSAO_CONCLUIDA`,
`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`).

### RECOMENDAÇÃO: flag paralela, não valor de farol. E a razão é a AUDITORIA

A intuição do diretor está certa, e o motivo concreto é mais forte do que o "não sobrescrever as
frentes": **as frentes não correm risco em nenhuma das duas opções** (elas vivem em tabela própria,
o farol não as toca). O risco real é outro, e vem justamente do requisito de manter a auditoria viva:

- Auditar um documento chama `recomputeFarolGlobal` no fim (`auditoria.service.ts:579`).
- Se `PAUSADA` fosse um valor de farol, ele teria de entrar em `FAROL_MANUAL` para não ser apagado
  pela primeira auditoria feita durante a pausa.
- Só que entrar em `FAROL_MANUAL` **congela a derivação**: a admissão que completasse Auditoria e
  Exame durante a pausa **não viraria `BANCO_AGUARDAR`**. Ao retomar, o farol estaria mentindo, e
  seria preciso recalcular na mão. Isso é exatamente "não volta de onde parou".

Além disso, um valor de farol **apaga** o farol anterior (era `EM_ADMISSAO` ou `BANCO_AGUARDAR`?) e
mistura dois eixos: o Gerenciador tem filtro por farol, e "Pausada" viraria alternativa excludente de
"Em Admissão", quando na verdade convivem.

**Desenho recomendado:** `admissoes.pausada_em` (timestamptz, null = não pausada), `pausada_por`
(uuid, FK usuários), e `pausa_motivo` (text, se o diretor quiser, ver bloco 3). O farol continua
derivando normalmente por baixo da pausa, então retomar é **não fazer nada**: o estado já está certo.

### 2) Os processos automáticos, um a um. TRÊS já filtrariam, TRÊS não

Varri todos os que tocam admissão. O que importa é que cada um filtra de um jeito diferente, e isso
muda o trabalho por processo.

| Processo | Como seleciona hoje | Filtraria uma pausada? |
|---|---|---|
| **Scheduler do Pandapé** (12 min) | `farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')` (`admissoesVivasPandape`) | **Não.** Precisa de `AND pausada_em IS NULL` |
| **Coleta de VT** | `inArray(farolGlobal, FAROIS_VIVOS)` em 2 pontos (`vt-coleta.service.ts:351` e `:446`) | **Não.** Mesmos 2 pontos |
| **Coleta de documento** (pull Pandapé) | Não seleciona sozinha: é chamada pelo scheduler e pela Liberação | **Herda** do scheduler. Sem trabalho próprio |
| **Tick do Clicksign** | `clicksign_status = 'AGUARDANDO_ASSINATURA' AND envelope_id IS NOT NULL`. **Nenhum filtro de farol** | **Não.** É o caso mais crítico |
| **Fila de disparo de assinatura** | `KitService.gerar` enfileira `criar-envelope`; gate é só `kitLiberado(frentes)`. **Nenhum filtro de farol** | **Não** |
| **Gate do kit (F12)** | `kitLiberado(frentes)`, só as 3 frentes | **Não** |
| **Esteira (filas e KPIs)** | `notInArray(farol, [DECLINOU, RESCISAO, AGUARDANDO_LIBERACAO, LIBERACAO_RECUSADA])` | **Não.** Precisa excluir pausada |
| **Gerenciador (KPI de pendências)** | mesma exclusão por farol (`admissoes.service.ts:1046`) | **Não** |
| **Auditoria / reauditoria** | **Nenhum acoplamento a farol** (só `recomputeFarolGlobal` no fim) | Continua funcionando **sem tocar em nada**. É o que o diretor quer |

**A observação importante sobre o custo:** com o desenho de FLAG, são **6 pontos de filtro** a
acrescentar. Com o desenho de FAROL, o scheduler do Pandapé e a coleta de VT sairiam de graça (são
whitelists de `EM_ADMISSAO`/`BANCO_AGUARDAR`), mas o **tick do Clicksign, a fila de disparo e o gate do
kit continuariam precisando de ajuste do mesmo jeito**, porque **nenhum dos três olha o farol**. Ou
seja, a economia do farol é de 2 pontos, e o preço é o farol mentiroso descrito acima. Não compensa.

**`FAROIS_VIVOS` está duplicado em 3 arquivos** (`vt-coleta.service`, `varredura-documentos`,
`recalcula-sinalizador-vivas`), cada um com sua cópia local. Se a pausa entrar como flag, o certo é
criar **um helper único** (`ehAdmissaoOperavel(farol, pausadaEm)`) e usá-lo nos 6 pontos, senão o
próximo processo automático nasce sem respeitar a pausa. Registro como parte do desenho, não como
refatoração à parte.

### 3) Auditoria fora da pausa NÃO conflita com "sai da fila". Já existe precedente exato

O conflito é aparente, e o sistema já resolveu esse mesmo problema antes: **a admissão CONCLUÍDA some
da fila da Esteira e volta a aparecer quando você busca pelo candidato ou marca o status de conclusão
no filtro** (`esteira.service.ts:164-186`). O mecanismo é literalmente `if (!buscandoCandidato &&
!filtraStatusConclui)`.

**Recomendo reusar isso, sem inventar nada:** a pausada é excluída da fila padrão e das contagens,
mas **reaparece** quando (a) você busca por nome/CPF/cliente, ou (b) marca o filtro "Pausada". Da
lista, o consultor abre a admissão e audita normalmente, porque a auditoria não olha fila nem farol.

Somando um **card/KPI "Pausadas" clicável como filtro** (§A.12 já exige que os cards sejam filtros),
a admissão pausada fica a um clique de distância. Não vira fantasma.

### O que eu preciso que o diretor decida antes do BLOCO 2

1. **Motivo da pausa: campo obrigatório, opcional ou não existe?** Recomendo **opcional, texto livre**,
   exibido na ficha, no mesmo espírito da observação da Liberação. Obrigatório atrapalharia a pausa
   rápida; ausente perde o "por quê" que é justamente o valor do registro.
2. **Pausar exige que a admissão esteja VIVA?** Recomendo **sim**: só `EM_ADMISSAO`/`BANCO_AGUARDAR`.
   Pausar uma concluída ou uma declinada não significa nada, e barrar isso evita estado sem sentido.
3. **A pausa aparece no Gerenciador como coluna, ou só como pill ao lado do farol?** Recomendo **pill
   ao lado do farol** (o farol continua dizendo o ciclo de vida, a pill diz "pausada"), sem coluna
   nova, para não mexer na máscara única de tabela (§A.12) sem necessidade.
4. **Admissão pausada continua contando nas Não Conformidades?** Não estava no escopo do pedido e não
   assumi resposta. Se a pausa é "não vai ser tocada agora", há argumento para suspender a contagem de
   tempo parado, mas isso é decisão sua, não minha.

### Sobre o BLOCO 4 (a prova), um aviso adiantado

A prova pedida inclui "provar que o Clicksign volta a verificar o envelope ao retomar". O ambiente
Clicksign é **sandbox** e, conforme já registrado, envelope em `running` não tem cancelamento
programático nesta conta. A prova de que o tick **pula** e **volta a verificar** eu consigo fazer de
forma determinística (o tick é um método que lista alvos, dá para provar a lista com e sem pausa, mais
o teste automatizado). A prova de ponta a ponta com assinatura real depende de um envelope vivo no
sandbox. Aviso agora para combinarmos o formato da prova antes, e não depois.

**Status: BLOCO 1 entregue, aguardando as 4 decisões acima para seguir ao BLOCO 2.**

---

## 2026-07-27 (2): tela `/admin/beneficios` construída, a exigência de valor saiu do código

Aprovação do diretor sobre o levantamento abaixo. Entregue: CRUD de benefícios por tela, no padrão de
Escalas, mais a coluna `exige_valor` que é o ponto da OST. **No ar, aguardando validação em produção.**

### O que mudou de arquitetura, em uma frase
A régua "este benefício precisa de quanto?" deixou de ser a constante `BENEFICIOS_COM_VALOR`
(shared-types, casando por TEXTO DO NOME) e passou a ser a coluna `beneficios_catalogo.exige_valor`,
mantida pela tela. A constante continua existindo, rebaixada a **fallback** dos nomes legados (o texto
achatado das 2.188 admissões importadas, que não tem linha no catálogo).

### Backfill: 6 marcados, 10 linhas e 195 alocações preservadas
Migration `0040_wet_captain_stacy.sql`: `ADD COLUMN` mais um UPDATE que reproduz **exatamente** o
casamento da constante (prefixo OU código entre parênteses, com `translate` no lugar do `unaccent`,
que não está instalado). Resultado conferido no banco: `VR`, `VA`, `AM`, `Cesta básica`, `PLR` e
`Auxílio creche` em `true`; `VT`, `Assistência Odontológica`, `Seguro de vida` e `Refeição no local`
em `false`. Nenhuma linha perdida, nenhuma alocação tocada. **Nada mudou de comportamento na entrega**,
que era o requisito.

### PROVA (ao vivo, rota real, backend de produção)
Cadastrei dois benefícios pela API do cadastro: **"Auxílio home office" com exige valor LIGADO** e
**"Vale Cultura" com exige valor DESLIGADO**. Os dois nomes foram escolhidos a dedo:

| Benefício | Coluna | O que a régua ANTIGA (por nome) faria | O que aconteceu |
|---|---|---|---|
| Auxílio home office | exige | **não exigiria** (nome não casa com chave nenhuma) | **exigiu** |
| Vale Cultura | não exige | **exigiria** (casa com o prefixo "VA" do Vale-Alimentação) | **não exigiu** |
| VT (Vale-Transporte) | não exige | não exigiria | não exigiu |

Uma única chamada ao wizard com os três **sem valor** devolveu:
`400 {"message":"Informe o valor de: Auxílio home office."}` — citando **só** o que a coluna marca. As
duas direções provadas de uma vez, e a validação roda antes da transação, então a chamada rejeitada
não cria nada.

**Renomear não muda mais a exigência**, provado nos dois sentidos:
- "Auxílio home office" → "Ticket refeição especial" (nome que a régua antiga não reconhece):
  **continuou exigindo**, `400 "Informe o valor de: Ticket refeição especial."`
- "VR (Vale-Refeição)" → "Ticket de refeicao" (idem): **continuou exigindo**. Rename desfeito em
  seguida, VR de volta ao nome original.

**Achado do próprio teste, e a melhor ilustração de por que a régua por nome tinha de sair:** o
casamento era por PREFIXO, então **"Vale Refeição" (o VR por extenso) batia na chave "VA"** do
Vale-Alimentação, e "Amparo funeral" bateria em "AM". A régua antiga acertava e errava por acidente.
Está travado em teste (`admissoes.exige-valor-catalogo.spec.ts`).

**Limpeza:** os dois benefícios de teste foram removidos do catálogo (zero alocações, conferido antes
de apagar). O catálogo voltou aos 10 originais, 195 alocações intactas.

### Os 6 nas três telas de admissão
`/catalogos/beneficios` passou a devolver `exigeValor` junto, conferido na rota real: os 6 com "exige
valor" e os 4 sem. Wizard, Liberação (individual e lote) e modal do Gerenciador leem essa coluna por
`criarPrecisaValor` (`lib/beneficios`), com fallback por nome para o legado achatado, que não tem linha
no catálogo e não podia virar "não exige valor" por omissão. As três telas respondem 200 no build de
produção servido.

### ERRO MEU NO MEIO DO CAMINHO, corrigido e registrado
Ao montar a prova, mandei a chamada para `PATCH /admissoes/:id` (edição do Gerenciador) em vez do
wizard. Duas consequências:

1. **Não houve 400, e isso está certo:** `editar` **não trava** por valor de benefício em falta, por
   decisão registrada na própria OST de ajustes ("o salvar grava o que está preenchido; o valor que
   falta segue como pendência, sem bloquear"). Errei a porta, o comportamento estava correto.
2. **Mutei uma admissão real** (Luciana Mendes Estander): o pacote dela foi substituído pelos meus
   três benefícios de teste. **Restaurado.** A trilha `candidato_alteracoes_log` guardava o estado
   anterior em texto legível, e devolvi exatamente aquilo: `VR (Vale-Refeição): 44,00, VT
   (Vale-Transporte)`, conferido byte a byte contra o log, total de alocações de volta a 195. Os dois
   eventos (minha alteração e a restauração) **ficaram no log**, sem apagar nada: trilha é trilha.

Registro porque foi manuseio de dado de produção que não estava no escopo, e a lição é a que já vale
para o resto: prova ao vivo em rota que **muta** só depois de confirmar QUAL rota valida o quê.

### Decisões do diretor respeitadas
- **Sem "valor sugerido" no catálogo.** O valor continua por pessoa (`admissao_beneficio.valor`), e a
  sugestão segue vindo da memória por cliente+cargo. Segunda fonte da verdade para o mesmo número era
  exatamente o defeito que o `exige_valor` veio consertar.
- **Desconto do VT fora desta entrega.** Segue como observação em texto livre. Um exemplo só não
  justifica estrutura.
- **Menu junto dos cadastros**, ordem 23, logo depois de Escalas. As ordens seguintes foram
  deslocadas em 1 (motivos de declínio 24 … pastas do Drive 31); o `db:seed:menus` convergiu e os 11
  usuários já configurados foram preservados.
- **RBAC por operação, sem `@Roles`:** GET aberto a autenticado (a Liberação do perfil COMUM depende
  disso), escritas governadas pelo menu `beneficios` (grupo ADMIN, fora do padrão do COMUM). Travado
  em `rbac-catalogos.spec.ts`, no mesmo teste que protege contra a regressão que derrubou a Liberação.
- **Inativar é exclusão lógica**, com 409 mandando reativar no nome repetido. A FK de
  `admissao_beneficio` é `RESTRICT`, então alocação nenhuma evapora.

### Nota de comportamento (não é bug, mas o diretor precisa saber)
Ligar "exige valor" num benefício **não invalida retroativamente** quem já o alocou sem valor. A
validação roda na gravação da admissão, então a cobrança aparece na próxima vez que aquela admissão
for salva pelo wizard ou pela Liberação. Não achei certo decidir sozinho por uma varredura retroativa.

### Seed
`seed-catalogos` carrega `exigeValor` na base curada e **continua com `onConflictDoNothing`**, de
propósito: rodar o seed de novo não pode desfazer o que o diretor configurar na tela. Conferido, o
re-run manteve os 6 marcados.

### Gate
Backend **597 testes** verdes (+11 nesta OST: 12 do service do catálogo, 7 da inversão da régua) e
frontend **50** (+9 do `lib/beneficios`). Typecheck verde nos 3 pacotes. Lint com os **mesmos 2 erros
pré-existentes** de `react-hooks/exhaustive-deps` (`nova/page.tsx`, `vt/page.tsx`), intocados. Backend
e frontend reconstruídos e no ar.

### Aberto
Validação do diretor **em produção** (prova textual, sem prints, por instrução da OST): `/admin/beneficios`
e o campo de valor nas três telas de admissão. **Sem commit até a validação** (§A.21).

---

## 2026-07-27: LEVANTAMENTO, cadastro de benefícios por tela (§A.14, só levantar, nada construído)

Pedido do diretor: gerir o catálogo de BENEFÍCIOS pela tela, no mesmo padrão de cargos, escalas, régua
e pastas do Drive. Levantamento primeiro, construção depois. **Nada foi criado, alterado ou removido.**

### 1) "Benefício" hoje são DUAS coisas diferentes, com o mesmo nome

Não é a mesma entidade nos dois lugares, e isso importa para não misturar escopo:

| Onde | O que é | Tabela / origem |
|---|---|---|
| Modal de Liberação, wizard, modal do lápis | **Pacote de benefícios da admissão**: VR, VT, VA com valor. Catálogo real, com vínculo por linha | `beneficios_catalogo` + `admissao_beneficio` |
| Subpasta BENEFICIOS do Drive | **Destino de arquivo**, não benefício. É uma das 4 subpastas do prontuário, para onde vão `FORMULARIO_VT` e `CARTAO_TRANSPORTE` | `DRIVE_SUBPASTA` (shared-types) + `drive-routing.ts` |

A subpasta do Drive é constante de código, roteamento de documento, e **não tem relação nenhuma** com
o catálogo. Mexer no catálogo não a toca, e vice-versa.

### 2) SIM, existe catálogo, e ele já é tabela (não é enum nem constante)

`beneficios_catalogo` (migration `0004`), com **10 benefícios ativos**, todos vindos do
`db/seed-catalogos.ts` (base curada, `onConflictDoNothing` por nome). Nenhum benefício foi criado fora
do seed até hoje.

| Benefício | Alocações | Com valor |
|---|---|---|
| VT (Vale-Transporte) | 85 | 0 |
| VR (Vale-Refeição) | 80 | 80 |
| Refeição no local | 7 | 0 |
| AM (Assistência Médica) | 5 | 5 |
| VA (Vale-Alimentação) | 5 | 5 |
| Assistência Odontológica | 4 | 0 |
| Seguro de vida | 3 | 0 |
| Participação nos lucros (PLR) | 1 | 1 |
| Cesta básica | 0 | 0 |
| Auxílio creche | 0 | 0 |

Total: **190 alocações em 87 admissões**, das 2.368 da base (o resto é carga histórica, que guarda o
blob de texto em `dados_vaga_folha.beneficios`, 2.188 linhas, não migrado por decisão do diretor).

### 3) Os benefícios NÃO têm estruturas diferentes entre si. A estrutura é uma só

Isto foi o principal achado do levantamento, e é o que justifica a tela.

O catálogo tem **três campos, só**: `id`, `nome` (unique, 160), `ativo`. Não existe campo de valor, de
tipo, de percentual, de desconto. O valor **não é do benefício, é da alocação**: mora em
`admissao_beneficio.valor` (`numeric(12,2)`, nullable), por admissão. VR não tem "um valor de VR", tem
um valor por pessoa.

**O percentual de desconto do VT não existe como campo em lugar nenhum.** O caso real "VT possui 6% de
desconto" é digitado como **texto livre** no campo Observação da Liberação
(`admissoes.observacao_liberacao`, 500 chars). Não é estrutura, é recado.

**O que É diferente entre benefícios, e onde está hoje: quem exige valor.** VR, VA, AM, Cesta básica,
PLR e Auxílio creche exigem valor; VT, Refeição no local, Seguro de vida e Odonto não. Essa regra está
**HARDCODED em código**, na constante `BENEFICIOS_COM_VALOR` de `packages/shared-types/src/index.ts`,
casada por prefixo do nome ou pelo código entre parênteses (`beneficioExigeValor`).

**Consequência direta, e é o furo real:** o catálogo já é editável por API (`POST /catalogos/beneficios`),
mas a regra de valor não é. Se o diretor cadastrar "Auxílio home office" hoje, ele nasce **sem exigir
valor** e não há tela, campo ou rota que mude isso: só alterando o código-fonte e redeployando. Pior,
a regra casa por **texto do nome**: renomear "VR (Vale-Refeição)" para "Vale Refeição" faz o benefício
**parar de exigir valor** silenciosamente, sem erro nenhum. O nome do benefício é, hoje, regra de
negócio disfarçada.

### 4) Quem consome o catálogo: só as três telas de admissão. Kit, régua e Drive NÃO consomem

Varredura completa em `apps/backend/src` e `apps/frontend/src`:

- **Consome** (`GET /catalogos/beneficios`, só os ativos): wizard `/nova`, tela `/liberacao` (individual
  e lote) e o modal de edição do Gerenciador (`EditAdmissaoModal`).
- **Consome o vínculo** (`admissao_beneficio`): ficha da admissão, rótulo do pacote (`rotularPacote`),
  a memória de pacote por cliente+cargo (`pacotePadraoClienteCargo`, derivada da última admissão do par),
  a validação de valor obrigatório (`validarValoresDoPacote`) e a régua de pendências
  (`domain/admissao.ts`, campo "Benefícios" via flag `temBeneficioEstruturado`).
- **NÃO consome, zero referência**: Gerador de kit, régua documental, auditoria de IA, arquivamento no
  Drive, coleta de VT. Grep limpo em `src/kit`, `src/regua`, `src/ai`, `src/vt-coleta`.

Ou seja: o raio de impacto de uma tela de benefícios é **estritamente o cadastro da admissão**. Não
toca kit, não toca IA, não toca Drive.

### 5) O padrão de CRUD já existe e está maduro: ESCALAS é a referência exata

Escalas é o gêmeo do caso, mesma tabela de três campos (`id`, `nome`, `ativo`), mesma história (nascia
só pelo caminho lateral do `addCatalogo` até ganhar tela). O padrão completo:

- **Backend**: módulo próprio em `src/admin/<catalogo>/` com controller + service + dto + spec.
  Controller em `admin/<catalogo>`, **RBAC por operação**: `GET` liberado a qualquer autenticado (ler é
  trabalho, a Liberação do perfil Comum depende disso), e `POST` / `PATCH` / `PATCH :id/reativar` /
  `DELETE` restritos. **`DELETE` é exclusão lógica** (`ativo=false`), nunca física, nunca cascata.
  Colisão de nome devolve 409 com mensagem que manda reativar, em vez de deixar adivinhando.
- **Menu**: entrada em `domain/menus.ts` (código, rótulo, href, grupo `ADMIN`, ordem, lista de operações
  gated) mais o prefixo em `frontend/src/lib/menu-rotas.ts`. Hoje a faixa ADMIN vai de 20 a 30, com 24 já
  ocupada por Tarifas e 25 pela Régua.
- **Tela**: `app/(app)/admin/<catalogo>/page.tsx`, formulário no topo que serve para criar e editar,
  filtro por status com contador, busca em tempo real, tabela ordenável (§A.12) e inativação por
  `ConfirmDialog`.
- **Seed**: `db/seed-catalogos.ts`, idempotente, continua sendo a base inicial.

### RECOMENDAÇÃO (não construída, aguardando o diretor)

**Tela `/admin/beneficios`**, clone do padrão de Escalas, com **uma diferença que é o ponto todo**:

1. **CRUD padrão**: criar, renomear, inativar, reativar. `GET` aberto a autenticado, escrita restrita a
   MASTER / SUPER_ADMIN, exclusão lógica preservando as 190 alocações existentes (a FK já é `RESTRICT`
   de propósito).
2. **Coluna nova `exige_valor` (boolean) em `beneficios_catalogo`**, com checkbox na tela. É o que tira a
   regra de negócio do código e a põe no cadastro. Migration com backfill: marca `true` exatamente nos 6
   que a constante hoje considera, então **nada muda de comportamento no dia da entrega**. Depois disso,
   `beneficioExigeValor` (que casa por texto do nome) deixa de ser a fonte da verdade e passa a ser só
   fallback do legado, e renomear um benefício vira operação segura.
3. **Campo de valor sugerido: NÃO recomendo**, e registro o motivo. O valor é por pessoa
   (`admissao_beneficio.valor`), e a sugestão já existe e funciona melhor: a memória de pacote por
   cliente + cargo, derivada da última admissão do par. Um valor no catálogo criaria segunda fonte da
   verdade para o mesmo número, que é exatamente o defeito do `cliente_beneficio_padrao` (2 linhas,
   valor com lixo, já registrado como contra-exemplo no código).
4. **Percentual de desconto do VT: NÃO recomendo agora.** Hoje é observação em texto livre e não existe
   estrutura nenhuma. Estruturar isso é outra frente (muda a Liberação, a ficha e provavelmente o
   formulário de VT), e o diretor pediu o CADASTRO, não a modelagem do desconto. Fica registrado como
   pergunta em aberto, não como escopo assumido.
5. **Menu**: ordem 24, junto do bloco de catálogos de admissão, empurrando Tarifas e as seguintes. Ou
   ordem 31, no fim, se o diretor preferir não reordenar. **Decisão dele.**

### Perguntas ao diretor antes de construir (§A.14)

1. Entra a coluna `exige_valor` no cadastro, ou o catálogo fica só nome + ativo e a regra segue no código?
2. Posição no menu de Administração: ordem 24 (reordenando Tarifas para 25 e as demais) ou no fim?
3. O percentual de desconto do VT fica como está (observação livre) nesta entrega? Confirmar.

**Nenhuma linha de código foi tocada nesta OST.** Só leitura de código e consulta ao banco (contagens,
sem PII, §A.6).

---

## 2026-07-24 (9): Pandapé, três candidatas que não entraram, DUAS causas distintas

Três candidatas (Roxany Silva, Thais Vieira Freitas, Thainá Cardoso Aguiar) não vieram para a esteira e
não constavam em nenhum sinal do Diagnóstico. Investigação (só diagnóstico, §A.14, sem PII em log). As
três NÃO existem no EA (varredura dos 2.316 candidatos, zero registro, em nenhum estado). Problema na
ENTRADA. O pipeline em si está saudável e sem perda interna: 76 eventos enfileirados, 74 registros
criados, **0 "Sync adiada"** em todo o journal (01/07 a hoje), **0 jobs falhados**, 0 rejeições. Tudo que
o EA RECEBEU, processou. Mas há DUAS causas diferentes, não uma:

**CASO 1, Roxany, janela de go-live (CORRETO, não é bug).** O primeiro evento que o EA recebeu do Pandapé
foi **21/07 08h43:22 (Brasília)** / 11:43:22 UTC (idPreCollaborator 399774). A Roxany foi movida para
"contratados" às **21/07 08h26 (Brasília)**, 17 minutos ANTES de a escuta existir. Evento anterior ao
sistema, mesma natureza dos 29 declínios sem CPF do go-live: segue pelo caminho MANUAL, não exige código.

**CASO 2, Thainá, evento PERDIDO em downtime do ingress durante deploy (FALHA REAL de robustez).** Ela foi
movida em **22/07 15h52 (Brasília)**, com a escuta já ativa. Mas há um **buraco de ~2h nos eventos
recebidos em 22/07**: último antes = 15h38:30, próximo depois = 17h37:44. A tarde foi de deploys em série,
e o `ea-frontend` (que é o INGRESS do webhook: a ponte posta em `0.0.0.0:3010`) ficou repetidamente fora
do ar, ~67s por reinício. Reinícios do `ea-frontend` (Brasília):

| Fora do ar | Voltou | Duração |
|---|---|---|
| **15h52:53** | **15h54:00** | ~67s |
| 16h02:59 | 16h04:07 | ~68s |
| 16h16:10 | 16h17:19 | ~69s |
| 16h32:17 | 16h33:24 | ~67s |
| 16h48:58 | 16h50:00 | ~62s |
| 17h07:46 | 17h08:52 | ~66s |

A movimentação da Thainá (15h52) cai EXATAMENTE no primeiro reinício (15h52:53 a 15h54:00). O POST da
ponte chegou com o `:3010` reiniciando, falhou, e como não há vestígio nenhum dela no EA (0 defer, 0
falha, 0 rejeição), o evento se perdeu na porta e a ponte aparentemente NÃO reentregou.

**CASO 3, Thais:** horário de movimentação ainda desconhecido (vive no Pandapé). Cruzar quando o diretor
trouxer (go-live? outro downtime?).

**O que só o Pandapé/Fernando fecham:** se a `webpanda.php` tentou reentregar após o `:3010` voltar (log
do Fernando) e o horário exato do disparo no Pandapé. O EA não vê um evento que nunca recebeu.

**Ações decididas:** (a) recuperar a Thainá por re-sync alvo (`/internal/pandape/tick` com o
IdPreCollaborator dela, quando o diretor trouxer do Pandapé), sem inventar registro; (b) LACUNA B,
retry com backoff na `webpanda.php` (pedido técnico ao Fernando escrito), o conserto durável; (c) higiene
de deploy do nosso lado (desacoplar o ingress do webhook do `ea-frontend`), avaliação de custo em aberto.
A LACUNA A (persistir os "Sync adiada" no Diagnóstico) segue aprovada e é outra classe de falha.

**FECHAMENTO, CASO 2 confirmado e Thainá recuperada.** O diretor trouxe a prova do Pandapé: o envio
para a `webpanda.php` em **22/07 15:53:15** retornou **503 `ea_unreachable`**, exatamente dentro da
janela de reinício do `ea-frontend` (15:52:53 a 15:54:00). A ponte TENTOU entregar, o EA estava fora do
ar, e não reentregou. Diagnóstico confirmado literalmente. **Recuperação por alvo (IdPreCollaborator
400846):** leitura pura confirmou 400846 = "Thaina Aguiar"; reproduzi o evento (`POST
/api/webhooks/pandape`, idempotente). Antes: 0 registros. Depois: **1 candidato, 1 admissão,
AGUARDANDO_LIBERACAO** (pré-admissão, origem PANDAPE, sinal PENDENTE), **sem duplicata** (1 candidato /
1 admissão / 1 integracao_pandape), 0 documentos e 0 frentes (correto para pré-admissão: nascem após a
Liberação). Ela está agora na fila de **Liberação Admissional**, aguardando cliente+cargo, como as
demais do Pandapé de 22/07 (vaga não mapeada no de/para). **Conserto durável do CASO 2 em preparação:**
Caddy como ingress estável no :3010 roteando `/api/webhooks/pandape` direto ao backend (opção A aprovada,
fase 1); preparação pronta em `~/ea-proxy`, janela de troca aguardando horário do diretor.

---

## 2026-07-24 (8): Gerador de kit, trava por papel removida (menu governa) + mapa das travas sobreviventes

O COMUM tinha o menu Gerador de kit na sidebar, mas a tela mostrava "Acesso restrito, exclusivo de
Master / Super Admin", checagem de PAPEL sobrevivente do modelo antigo. Gate verde (typecheck back+front,
13 testes de menu, lint). Sem travessão.

**1. Ponto exato.** `app/(app)/gerador-kit/page.tsx`: bloco `if (!isAdmin) return <Acesso restrito>`
(linhas ~245-255), mais um `if (!token || !isAdmin) return` no efeito de retenção (131) e o
destructuring de `isAdmin` (95).

**2. Trava removida.** Tirei o bloco, o `isAdmin` do efeito e do destructuring. Quem governa a tela é o
menu `gerador-kit`: o `(app)/layout` já bloqueia quem não tem o menu, e o backend gate as operações pelo
mesmo menu. `KitController` não tem `@Roles`.

**3. Backend junto, DEFEITO em outra camada achado e corrigido.** As 5 operações da tela (`processar`,
`statusProcessar`, `downloadFuncionario`, `reimportar`, `downloadZip`) já eram gated pelo menu
gerador-kit, sem `@Roles`. MAS a tela também monta o dropdown com `GET /admin/kit-tipos`
(`KitTiposController.list`), que estava gated pelo menu `kit-regras` (coringa `KitTiposController.*`): um
COMUM com gerador-kit mas sem kit-regras tomaria 403 no dropdown. Corrigido: o coringa virou lista
explícita das ESCRITAS (`criar`/`atualizar`/`remover`), então a LEITURA de tipos fica ABERTA (leitura de
catálogo, "ler é trabalho"); as escritas seguem gated por kit-regras.

**4. Varredura das travas por papel sobreviventes (mapa completo).** A ÚNICA trava errada era a do
gerador-kit. As demais são o modelo NOVO (guard por menu) ou ações admin INTENCIONAIS que espelham um
`@Roles` do backend:
- `(app)/layout` e `admin/layout` e o card "Menu Gerencial" da Sidebar: guard por MENU (admin bypass OU
  tem o menu), correto, MANTER.
- Liberação, botões Recusar/Reativar `disabled={!isAdmin}`: intencional, `recusar`/`reativarRecusada` são
  `@Roles` admin. MANTER.
- Não conformidades, decidir liberação por `isAdmin`: intencional, `decidirLiberacao` é `@Roles` admin.
  MANTER.
- Nova admissão, "+ criar catálogo" por `isAdmin`: intencional, os POST de catálogo são `@Roles` admin.
  MANTER.
- Gerenciador, botão Deletar por `isAdmin`: intencional, `deletar` é `@Roles` admin. MANTER.
- `DiagnosticoAlerta` só para admin: intencional (Diagnóstico é admin-only). MANTER.
- Backend `@Roles`: `users` e `diagnostico` (classe, admin-only DE PROPÓSITO, anti-escalonamento), e
  métodos `recusar`/`reativarRecusada`/`deletar`/`decidirLiberacao`/criar-catálogo. Nenhum bloqueia
  operação de tela de Operação por engano. Fora o kit-tipos (corrigido), não há trava de papel
  sobrevivente barrando o COMUM.

**5. Prova ponta a ponta (token de COMUM real mintado com o segredo do backend).**
- Bundle servido: o chunk do gerador-kit tem 0 "Acesso restrito" / "exclusivo de Master".
- COMUM COM o menu (`b3adf0ef`): `GET /admin/kit-tipos` -> 200; `status`/`funcionario`/`zip` de job
  inexistente -> 404 (passou o menu, não 403). Nenhuma operação da tela dá 403.
- Controle negativo, COMUM SEM o menu (`c76014df`, zero menus): a operação do kit -> 403 (o gate é real
  e por menu), e o dropdown `GET /admin/kit-tipos` -> 200 (leitura aberta, como projetado).

Deploy: backend (build+restart) e frontend (stop/backup/build/start), health OK, `/login` e
`/gerador-kit` 200, novos BUILD_ID. O diretor valida em produção com um COMUM real.

---

## 2026-07-24 (7): VT no Firebase com coleta pelo Drive, BLOCO 0 (levantamento) + BLOCO 2 (recomendações)

OST do diretor (sessão própria, paralela à da Clicksign). Manobra estratégica: o Fernando negou expor
o formulário de VT do EA para a internet, então o candidato passa a preencher num app FIREBASE (fora
da VM, fora do alcance da negativa), o Firebase gera o PDF e deposita numa pasta coletiva do Drive, e o
EA LÊ essa pasta com a credencial que já tem (admin.soulan@). O EA não precisa ficar exposto para ler
uma pasta. Esta OST ACRESCENTA um caminho, não substitui o interno. §A.11 (sem travessão) respeitada.

**TRAVA ABSOLUTA respeitada:** nada da estrutura de VT interna que já existe foi tocado (a tela `/vt`,
os 2 PDFs, o tipo `FORMULARIO_VT` no catálogo, a régua). Fica intacta e dormindo; quando o Fernando
liberar o caminho interno, é só ligar. Este registro é só levantamento e recomendações, ZERO código.

### BLOCO 0, levantamento (campo a campo)

**1. O que o formulário de VT do EA coleta hoje** (`apps/frontend/src/app/vt/page.tsx`, rota pública fora
do grupo `(app)`, DTOs em `apps/backend/src/vt/vt.dto.ts`). O Firebase precisa coletar o MESMO conjunto:
- **Identificação** (gate de token de 30 min): `cpf` (11 dígitos) + `dataNascimento` (ISO). O backend
  casa isso contra `candidatos` + a admissão viva mais recente (exclui DECLINOU/RESCISAO) e devolve
  `{ token, nome }`. CPF/nascimento tratados como credencial, nunca logados.
- **Endereço:** `cep` (8 díg, autopreenche via ViaCEP no `GET /vt/cep/:cep`), `logradouro`, `numero`,
  `complemento` (opcional), `bairro`, `cidade` (dropdown de cidades da tabela de tarifas + "Outra"),
  `uf` (2 letras).
- **Opção pelo VT:** `optante` (boolean). Se não optante, sem conduções.
- **Conduções** (só optante), por sentido IDA e VOLTA, N por sentido (máx 40): `cidade`,
  `tipoTransporte` (sugerido da tabela de tarifas ou texto livre em "Outra"), `cartao`
  (`BILHETE_UNICO`/`CARTAO_TOP`/`OUTRO`), `cartaoOutro` (só quando OUTRO), `valor` (0 = gratuidade).
- **Totais:** `totalIda`, `totalVolta`, `totalDia`, recalculados NO SERVIDOR (o cliente não é confiado).
- **Ciência:** 3 avisos sequenciais (assinatura digital, veracidade, uso do VT); `cienteEm` gravado.
- Payload de `POST /vt/formulario`: `{ optante, cep, logradouro, numero, complemento, bairro, cidade,
  uf, conducoes:[{ sentido, cidade, tipoTransporte, cartao, cartaoOutro?, valor }] }`. Totais NÃO vão
  no payload. Persistência em `formularios_vt` (1 por admissão, reenvio sobrescreve) +
  `formulario_vt_conducoes`.

**2. Como o PDF do VT é gerado hoje** (`apps/ai-service/app/vt_pdf.py`, biblioteca **reportlab**, o PDF é
DESENHADO de dados estruturados). São **2 PDFs**, despachados por `tipo`: **OPTANTE** (`gerar_optante`) e
**NAO_OPTANTE** (`gerar_nao_optante`). Logo Soulan embutida de `app/assets/logo-soulan.png` (52mm, paleta
AZUL `#4A7FA5` / VERDE `#9FC53D`). Optante: cabeçalho + "DADOS PESSOAIS" (nome, CPF, nascimento,
cidade/UF, endereço) + "DESCRITIVO DO ITINERÁRIO IDA/VOLTA" (meio de transporte, cartão/tipo, valor
unitário, total) + faixa verde "TOTAL A SER UTILIZADO NO DIA" + "COMPROMISSO DO COLABORADOR" (autoriza
desconto de até 6% do salário) + bloco de assinatura. Não optante: "DECLARAÇÃO DE NÃO OPÇÃO" com 3
parágrafos + assinatura. Nada gravado em disco, os bytes só trafegam. **O Firebase precisa produzir um
PDF equivalente** (mesmos campos, mesmo logo, mesmos 2 tipos), para o documento servir.

**3. Estado do `FORMULARIO_VT`:** tipo REGISTRADO no catálogo (`tipos_documento`), roteado para a subpasta
**BENEFICIOS** do Drive (`drive-routing.ts`, `SUBPASTA_POR_CODIGO`), mas **DORMENTE**: após o seed
`seed-regua-padrao.ts` (que faz `delete from regua_documental` e recria só com os 7 códigos padrão, sem
VT), o tipo fica com **0 réguas / 0 documentos**. Também está EXCLUÍDO DE PROPÓSITO do de/para do Pandapé
(`resolver-tipo-documento.ts`, "Informações de Vale Transporte" em `EXCLUIDOS_DE_PROPOSITO`, "sem destino
de propósito"). Consistente com a §A.17 (etapa 3, ligar VT ao kit/auditoria, ainda "a fazer").

### BLOCO 2, recomendações (como o EA identifica e casa o arquivo)

- **Padrão exato do nome do arquivo (contrato Firebase -> EA):** `NOME COMPLETO EM MAIUSCULAS CPF.pdf`,
  com o **CPF em 11 dígitos SEM máscara** ao final, ex.: `MARIA DA SILVA 11122233344.pdf`. Extração no EA:
  regex de um grupo de 11 dígitos consecutivos no final do nome (`(\d{11})(?!\d)`). Sem travessão no nome
  (§A.11). Exceção deliberada à §A.6 declarada pelo diretor: a pasta é interna e o nome ajuda o time
  humano a achar o prontuário.
- **Casamento:** CPF extraído contra as admissões **VIVAS** (EM_ADMISSAO / BANCO_AGUARDAR, exclui
  DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA), coerente com o `identificar` da `/vt` e com a régua unificada
  (§A.19). 
- **Casos de borda (nenhum quebra a varredura nem some em silêncio), via um livro-razão `vt_coleta`
  chaveado por md5 (unique), com status:**
  - **CPF não casa com nenhuma admissão viva** -> status `SEM_ADMISSAO`, acende sinal no Diagnóstico
    (BLOCO 5), e **continua sendo reavaliado** nos ciclos seguintes (candidato preencheu antes da
    admissão existir), sem re-arquivar. Só vira `CASADO` quando a admissão aparecer.
  - **CPF casa com mais de uma** -> `MULTIPLO`, acende sinal, exige desambiguação humana (o botão manual
    na ficha da admissão resolve, o consultor clica na admissão certa).
  - **Nome fora do padrão (sem 11 dígitos)** -> `NOME_FORA_PADRAO`, acende sinal, não casa.
  - **Não é PDF** -> a varredura filtra `mimeType='application/pdf'`; não-PDF é contado no ciclo
    (`ignorados`), nunca some calado.
- **Idempotência:** pelo **md5 do conteúdo**, o mesmo princípio de dedup que o Drive já usa
  (`md5_do_conteudo`/`md5_existentes` no `ai-service`). Md5 já `CASADO` no livro-razão é pulado; md5
  `SEM_ADMISSAO` é rebarateado (só rematch, sem re-arquivar). Dupla proteção com o dedup do próprio
  arquivamento na BENEFICIOS.

### Recomendações que EXTRAPOLAM o BLOCO 2 e precisam de decisão/insumo do diretor

- **PONTO CRÍTICO, "zerar a pendência de VT" (BLOCO 4) x TRAVA da régua.** Hoje `FORMULARIO_VT` está em
  0 réguas, então **não existe pendência de VT para zerar** (a régua está dormente e a TRAVA proíbe
  mexer nela). Recomendação: a coleta grava/atualiza um `documentos_admissao` de tipo `FORMULARIO_VT` como
  **ENTREGUE** para a admissão casada (registro de recebimento + arquivamento), de forma **ADITIVA, sem
  tocar a régua**. Isso registra o recebido hoje; vira "pendência zerada" de fato só quando a etapa 3 da
  §A.17 puser o VT na régua (fora desta OST). Reportado para o diretor confirmar que o recebimento
  aditivo, sem régua, é o comportamento desejado agora.
- **Arquivo permanece na pasta coletiva (não é movido).** O módulo de Drive é ADITIVO/somente-leitura por
  contrato (`drive.py`, sem `delete`/`update`/mover, vetado pela §A.6). Logo o PDF é **COPIADO** para a
  BENEFICIOS do prontuário e **permanece** na pasta coletiva, que vira a fonte/trilha de origem; o
  livro-razão md5 evita reprocessar. Decisão declarada.
- **Insumos do diretor/Fernando para o lado Firebase (BLOCO 1):** (a) projeto Firebase + hosting no
  padrão CentraFin/AudiPonto; (b) credencial de ESCRITA no Drive para o lado Firebase (service account
  dedicada com acesso só à pasta coletiva, o admin.soulan@ vive na VM e não deve ir para uma Cloud
  Function); (c) o **ID da pasta coletiva** do Drive. Sem esses três, o app Firebase não deposita.

### Plano de construção (ordem)

1. **Lado VM, coleta (nesta sessão, autocontido):** módulo `vt-coleta` no backend, scheduler in-process
   (`setInterval` -> BullMQ, no padrão provado do `pandape-scheduler`), livro-razão `vt_coleta` (md5
   unique + status), nova função read-only de LISTAGEM de PDFs numa pasta do Drive no `ai-service`
   (`files().list` com `mimeType='application/pdf'`, hoje inexistente), casamento por CPF, arquivamento
   na BENEFICIOS reusando `arquivarDrive` (md5 + reuso de pasta por nome), botão manual na ficha
   (mesmo caminho de processamento), sinais e card de último ciclo no Diagnóstico.
2. **Lado Firebase (BLOCO 1), quando os 3 insumos chegarem:** app do formulário fora da VM, gera o PDF
   equivalente e deposita na pasta coletiva com o nome padrão. Link disparado manualmente pelo consultor.

### DECISÃO DO DIRETOR (resposta ao ponto crítico) + verificação em código

**Decisão do Rike:** o VT é UM DOCUMENTO COMO QUALQUER OUTRO. Entra na RÉGUA DOCUMENTAL DO CLIENTE, e é na
régua que se define, cliente a cliente, se é obrigatório ou não. O que ele NÃO faz: travar fluxo
operacional. Consequências: (1) `FORMULARIO_VT` deixa de ser dormente, passa a poder ser incluído na régua
pelos caminhos que já existem (tela de Régua Documental por cliente/cargo); NÃO configurar régua de cliente
nenhum por conta própria (quem define é o time, na tela); esta OST só torna o tipo utilizável. (2) O PDF do
Firebase é registrado como documento RECEBIDO e dá baixa na linha da régua ONDE O VT EXISTIR; onde o cliente
não exigir VT, o PDF é apenas registrado e arquivado, sem criar pendência. (3) NÃO passa pela IA (mantido).
(4) O VT na régua NÃO pode travar conclusão nem o gate do kit; se a régua travasse por obrigatório pendente,
REPORTAR antes de aplicar. A TRAVA original segue: nada da estrutura de VT interna (`/vt`, PDF, fluxo
interno) muda; só o tipo deixa de ser dormente no catálogo de régua.

**Verificação em código (2 varreduras read-only), o ponto 4 NÃO dispara "reportar antes":**
- **`FORMULARIO_VT` JÁ é selecionável na tela de Régua** hoje. `admin/regua/page.tsx` lista TODOS os
  `tipos_documento` **ativos** (`tiposAtivos = tipos.filter(t => t.ativo)`), sem allowlist; `CODIGOS_REGUA_PADRAO`
  é só conveniência (botão "aplicar padrão"), não filtro. Única condição: a linha do catálogo estar
  `ativo=true`. Se estiver, nada a fazer para a seleção; se inativa, um clique reativa. **Tornar utilizável =
  garantir ativo.**
- **Nada trava (hard-block).** O gate do kit (`domain/frentes.ts kitLiberado`) checa SÓ os 3 `concluida`,
  nunca a régua. `ADMISSAO_CONCLUIDA` é flag manual pegajosa, sem pré-condição de documento. Avanço de frente
  com obrigatório pendente é liberado via **aceite** (regra 8, `esteira.service mudarStatus`), nunca barrado.
  VT obrigatório-e-ausente é **sinal suave**: conta no progresso/NC-1 e **adia o fechamento AUTOMÁTICO** da
  Auditoria (`progresso.completa`), mas o consultor conclui via aceite e kit/conclusão seguem alcançáveis.
  **Requisito "não travar" satisfeito por construção.**
- **Dar baixa reusa `ValidacaoHumanaService`/`AuditoriaService.aplicarPosVeredito`**: faz upsert do
  `documentos_admissao` para ENTREGUE (CRIA a linha se a admissão for anterior à edição da régua, via
  LEFT JOIN a régua atual já mostra o pendente), recalcula sinalizador + completude + auto-close da Auditoria.
  Enum de estado: `PENDENTE / ENTREGUE / INCONFORME / AGUARDANDO_AUDITORIA`.
- **Detalhe LGPD (§A.6) do livro-razão:** a extração do CPF do nome do arquivo fica no `ai-service`; o nome
  cru NÃO cruza para o backend nem é logado. O livro-razão `vt_coleta` persiste só `md5`, `drive_file_id`,
  `admissao_id` e status, SEM nome/CPF. O card de "não casou" no Diagnóstico mostra o `drive_file_id` (o
  admin abre no Drive para ver o nome). Passa pela Segurança antes do merge.

### CONSTRUÇÃO DO LADO VM concluída (gate verde), lado Firebase e ligação aguardam insumos

**ai-service (leitura da pasta, read-only, contrato §A.6):** duas ops read-only novas em `drive.py`,
`listar_arquivos_da_pasta` (files().list, filtra por mimeType no backend) e `baixar_para_staging`
(files().get_media -> staging), mais `extrair_cpf_do_nome` (regex 11 dígitos, pega o último) e o writer
`escrever_staging`. Endpoints `POST /drive/coleta-vt/listar` e `POST /drive/coleta-vt/baixar` (guard de
internal token, honram DRIVE_MOCK). O nome cru do arquivo NÃO sai do ai-service: só o CPF extraído cruza.
Testes: **86 passam** (9 novos).

**backend, módulo `vt-coleta` (motor da coleta):** scheduler in-process no padrão do Pandapé
(`setInterval` 15 min -> BullMQ `vt-coleta-scan`, `db:1`, prefixo `ea:bull`), worker, livro-razão
`vt_coleta` (md5 UNIQUE, driveFileId, admissaoId, status CASADO/SEM_ADMISSAO/MULTIPLO/NOME_FORA_PADRAO/
NAO_PDF/ERRO, vtNaRegua, arquivadoEm; SEM nome/CPF, §A.6) + singleton `vt_coleta_scheduler_estado`.
Casamento por CPF contra admissões VIVAS; arquivamento na subpasta BENEFICIOS reusando `arquivarDrive`
(dedup md5 + reuso de pasta por nome); "dar baixa" reusa a validação humana (upsert ENTREGUE +
`aplicarPosVeredito`) SÓ quando o VT está na régua do par, senão arquiva sem criar documento. Botão manual
`POST /vt-coleta/admissao/:id/buscar` (202, enfileira). Sinal `drive-vt-sem-casar` (só driveFileId +
rótulo) e card de último ciclo no Diagnóstico, com toggle e rodar-agora. Migração `0038_oval_valkyrie.sql`
gerada, NÃO aplicada. Inerte enquanto `VT_COLETA_PASTA_ID` vazio.

**Gerador de link Ed25519 (token confirmado pelo diretor):** `vt-link-token.ts` (Node `crypto`, alg
EdDSA, JWS compacto) + `VtLinkService` + endpoint `POST /vt-coleta/admissao/:id/gerar-link` ->
`{ link, expiraEm }` (503 sem chave, 422 sem CPF/nascimento). Claims: sub=admissaoId, nome, cpf,
`nascHash=sha256(cpf|dataNascimento)`, iat, exp (TTL 7 dias, env), jti. Chave PRIVADA só no EA
(`VT_LINK_PRIVATE_KEY` no `.env`, **staged sem restart**); pública entregue ao diretor para o app Firebase.
Script `scripts/gen-vt-link-keys.ts` (stdout only). Testes do token: round-trip, expiração, adulteração.

**frontend:** ficha (`AdmissaoDetalheModal`) com "Gerar link do VT" (mostra link + copiar + expira em) e
"Buscar formulário de VT" (202); Diagnóstico com o KPI de VT não casado e o card de último ciclo do
scheduler de VT + controles. Sem travessão, "não informado" para vazio (§A.11).

**Gate consolidado verde:** backend typecheck limpo + **567 testes**; frontend typecheck limpo; ai-service
**86 testes**. Nada commitado, nada deployado, migração não aplicada, serviços não reiniciados.

**Verificação da pasta coletiva (leitura pura, testada ao vivo com a admin.soulan@):** a pasta
`FORMULARIO_VT_ADMISSÃO` (id `1vBoY...FzaC`) está no **My Drive do Rike** (`driveId=None`,
owner `henrique.vieira@`), NÃO num Drive Compartilhado. A admin.soulan@ LÊ e LISTA (0 itens), mas a SA
pura do Firebase teria cota ZERO ali e o upload falharia. **Reportado, PARADO antes de ligar:** mover a
pasta para um Drive Compartilhado, dar escrita à SA do Firebase e leitura à admin.soulan@, e então ligar o
`VT_COLETA_PASTA_ID` com o id final.

**App Firebase (BLOCO 1) CONSTRUÍDO** em `/home/henrique/vt-online-soulan/` (FORA do repo da VM), Cloud
Functions Python (2a geração) + Hosting. Formulário mobile replicando os campos do `/vt` (CEP via ViaCEP
direto do browser, optante, conduções IDA/VOLTA, sugestão de tarifa por snapshot bundle das 18 tarifas,
3 avisos), PDF replicando `vt_pdf.py` (OPTANTE/NAO_OPTANTE, logo Soulan, mesmas seções). Verificação do
token OFFLINE (EdDSA, chave pública embutida, no servidor e no browser), 2a camada CPF + hash da data,
upload ao Drive por ADC da SA de runtime (sem chave JSON), nome `NOME MAIÚSCULAS CPF.pdf`,
`supportsAllDrives`. **Interop provado:** um token real assinado pelo EA verifica em Python (PyJWT/
cryptography) e no verificador JS, 7 testes verdes. Dois valores de deploy pendentes do diretor: e-mail
da SA de runtime e `VT_COLLECTIVE_FOLDER_ID`.

**PIVÔ (decisão do diretor): ponte via GCS, não Drive coletivo.** Prova de escrita real: SA pura tem
`storageQuota.limit=0` e NÃO grava arquivo no Drive nem em pasta que ela mesma possui (403 "Service
Accounts do not have storage quota"); só CRIA pasta (0 bytes). A pasta-evidência que a SA "possuía" era
resquício pré-delegação (só pastas, zero arquivos). Criar Drive Compartilhado o Rike não pode, e delegar
a admin.soulan@ no Firebase está vetado. Saída escolhida: o Firebase grava os PDFs num **bucket GCS do
próprio projeto `vt-online-soulan`** (a SA tem storage nativo lá, sem cota-zero), e o **EA LÊ do bucket**
(grant cross-project `roles/storage.objectViewer` à `ea-automatic-sa`) e copia para a subpasta BENEFICIOS
do prontuário via delegação (que funciona). O prontuário segue em Drive; muda só o depósito coletivo, de
pasta Drive para bucket GCS. Motor da coleta e arquivamento INALTERADOS (troca só a fonte no ai-service).

**Infra que o diretor provê:** (1) criar um bucket GCS em `vt-online-soulan` (uniform access, privado);
(2) dar `roles/storage.objectAdmin` no bucket à SA de runtime da function (dedicada `vt-drive-writer` ou a
default das Functions); (3) dar `roles/storage.objectViewer` no bucket à `ea-automatic-sa@ea-v2-automatic`
(cross-project, para o EA listar+baixar); (4) me passar o nome do bucket + o e-mail da SA de runtime.
Nada de chave JSON: a function grava como sua SA de runtime; o EA lê com a credencial que já tem.

**Pivô GCS CONSTRUÍDO e verde (3 frentes):** ai-service `app/gcs.py` (leitura read-only via
`google-cloud-storage`, md5 do `md5_hash` nativo em hex, sem delegação) + endpoints repontados
`POST /coleta-vt/listar {bucket}` e `POST /coleta-vt/baixar {bucket,id}` (id = nome do objeto,
transitório, não persistido nem logado), **96 testes**. Backend: `listarColetaVt(bucket)`/
`baixarColetaVt(bucket,id)`, env `VT_COLETA_GCS_BUCKET` (inerte se vazio), livro-razão agora com coluna
`origem` e UNIQUE composto **(md5, origem)** para não colidir com uma fonte Drive futura, `driveFileId`
removido (nome do objeto é PII, não gravado), sinal do Diagnóstico mostra `md5Prefixo` (12 chars, sem
PII), **567 testes**. Frontend: `driveFileId` -> `md5Prefixo` na tela de Diagnóstico, typecheck limpo.
App Firebase (`~/vt-online-soulan/`): upload trocado de Drive para GCS (`VT_COLLECTIVE_BUCKET`, grava
como a SA de runtime no bucket do próprio projeto), deps de Drive removidas, **10 testes** (interop do
token + nome do objeto). Motor da coleta, arquivamento na BENEFICIOS, scheduler, botão manual e gerador
de link Ed25519 inalterados.

**COORDENAÇÃO DE DEPLOY (3 frentes na VM: Caddy 19h30 + pasta-pai + este pivô):** NÃO publicar durante a
janela do Caddy; o pivô entra só por deploy coordenado. Migração regenerada `0038_vt_coleta_gcs.sql`;
ATENÇÃO: ao regenerar, o drizzle-kit varreu a tabela `drive_pasta_pai` (WIP não commitado da frente
pasta-pai) para dentro do snapshot; o agente a REMOVEU do meu SQL e snapshot para a migração conter só
`vt_coleta` + `vt_coleta_scheduler_estado`. Isso significa que os snapshots do drizzle das duas frentes
precisam ser RECONCILIADOS no merge/deploy coordenado (não aplicar migração isolada sem conferir o
snapshot combinado). Sem commit/push até gate verde + validação do diretor em produção (§A.21).

**Pendências para a ativação plena (todas do diretor/infra, o código está pronto e verde):** (1) mover a
pasta para Drive Compartilhado + permissões (SA escritora, admin.soulan@ leitora); (2) criar a SA e me
passar o e-mail + o ID da pasta; (3) deploy do Firebase e deploy coordenado do EA (migração `0038` +
build/restart) para validação do diretor em produção. Sem commit/push até gate verde + validação (§A.21).
Prova ponta a ponta (BLOCO 6) fica para quando a pasta, a SA e o Firebase estiverem no ar; até lá, prova
textual = gate verde (backend 567, ai-service 86, front typecheck) + testes das bordas (0/1/N match,
idempotência md5, não-PDF, sem CPF, inerte sem pasta) + interop do token + a verificação read-only da
pasta ao vivo.

---

## 2026-07-24 (6): padrão do COMUM invertido para toda a Operação + backfill (Opção B)

Decisão do diretor: o COMUM enxerga TUDO que é Operação por padrão, e a Administração vira concessão
pontual. Inverte o grandfather original (que dava só "o que já via", sem o Gerador de kit), que vinha
interrompendo a operação. Gate verde (typecheck back+front, 69 testes, lint dos tocados). Sem travessão.

**1. Novo padrão (código).** `domain/menus.ts`: `MENUS_COMUM_HOJE` (Operação menos gerador-kit) virou
`MENUS_PADRAO_COMUM` = TODO o grupo Operação (8 menus, incluindo Gerador de kit); `codigosGrandfather`
virou `codigosPadraoDoPapel`. Admin segue com todos (bypass). Atualizados os usos (seed-menus.ts) e o
spec (`menus.spec.ts`, 11 testes verdes).

**2. Backfill idempotente e ADITIVO.** Novo runner `db/backfill-menus-comum.ts`: concede os 8 menus de
Operação a todo COMUM ATIVO, com `onConflictDoNothing` (rodar 2x não duplica) e SÓ INSERT (nunca
remove). Preserva a Administração concedida pontualmente. **Antes/depois (2 COMUM ativos):**
- `b3adf0ef`: já tinha gerador-kit e o resto; faltava `nao-conformidades` -> adicionado. Admin extra
  (`escalas, motivos-declinio, regras, tarifas`) preservado.
- `f103fde6`: idem; faltava `nao-conformidades` -> adicionado. Admin extra (`cargos, escalas, regras,
  regua`) preservado.
- Ambos agora com os 8 de Operação. Nada removido.
- **3º COMUM (`c76014df`) está INATIVO** (soft-delete, não loga), então o backfill o pulou de
  propósito (só toca ativos). Reportado ao diretor: se quiser esse usuário de volta, é reativar, e aí
  ele precisa dos menus (a reativação não semeia sozinha; a semeadura de padrão é só na criação).

**Padrão também na CRIAÇÃO (para não recriar o buraco).** `users.controller.criar` passou a semear o
padrão do papel no usuário novo (`codigosPadraoDoPapel(papel)`), então consultor novo nasce com os 8
de Operação em vez de nascer vazio (que era "o caso mais grave"). Registrado como parte da decisão.

**3. Administração fora do padrão.** O padrão é só Operação; nenhum menu ADMIN entra por padrão nem no
backfill.

**4. Diagnóstico e Usuários bloqueados para COMUM.** São `@Roles` admin-only, então marcar para um
COMUM só mostraria o menu e o backend barraria os dados. Defesa em profundidade: `MENUS_BLOQUEADOS_COMUM`
(domain), o `definirMenusDoUsuario` FILTRA esses dois quando o alvo não é admin (recebe o papel), e a
tela de configuração (`ConfigMenusModal`) desabilita as duas caixas para COMUM ("somente
administração").

**5. Verificação de cobertura (o ponto crítico).** Auditei as 8 telas de Operação (chamada por chamada
-> Controller.handler -> menu). **gerador-kit: as 5 operações da tela (`processar`, `statusProcessar`,
`downloadFuncionario`, `reimportar`, `downloadZip`) caem TODAS no menu gerador-kit** (provado por
`menuDaOperacao`). As leituras de cliente/cargo (o que derrubou a Liberação) estão ABERTAS, correto.
Com o padrão novo, as 8 telas funcionam para o COMUM. **Dois defeitos LATENTES achados, REPORTADOS, NÃO
corrigidos (fora do escopo aprovado, decisão do diretor):**
- **A)** a Esteira abre o `EditAdmissaoModal` (lápis de toda linha) que salva via
  `AdmissoesController.editar`, gated só pelo menu `gerenciador`. Com o padrão novo o COMUM tem
  `gerenciador`, então funciona; só morderia se um admin tirasse `gerenciador` de um COMUM mantendo
  `esteira`. Mesma classe do incidente da Liberação.
- **B)** o menu `esteira` declara `AuditoriaController.documento`, mas o handler real chama-se
  `auditar`; a string nunca casa, então a auditoria de documento fica ABERTA a qualquer autenticado
  (deveria ser gated por esteira). É um erro de registro (um caractere), a mutação está sem gate.

**Deploy:** backend (build + restart) e frontend (stop/backup/build/start), health OK, `/login` 200,
novos BUILD_ID. O diretor valida em produção com um COMUM real.

---

## 2026-07-24 (5): levantamento do estado da integração Clicksign (INT-4), só retrato, sem implementar

Levantamento pedido pelo diretor antes de ativar a frente de assinatura. Nada alterado.

**1. Implementado x desenho.** O cliente da API (`clicksign-api.service.ts`) tem as 8 operações
JSON:API v3 PRONTAS e conferidas no sandbox (30/06): criar envelope, anexar documento (base64 inline),
signatário (CPF mascarado), 2 requirements (agree/sign + provide_evidence/email), ativar (running),
consultar status, obter URL do assinado, cancelar (draft=DELETE, running=best-effort). A orquestração
(`clicksign-sync.service.ts`) também está PRONTA em código: `criarEnvelope` (grava
AGUARDANDO_ASSINATURA, revalida gate F9), `processarTick` (varre AGUARDANDO, closed->arquiva,
canceled->CANCELADO), `arquivarAssinado` (baixa síncrono a URL S3 de ~5min, arquiva no Drive subpasta
ADMISSAO, grava contratoAssinadoDriveUrl + ASSINADO, recomputa farol, expurga staging) e
`reenviarCorrecao` (cancela best-effort, gate de dupla correção p/ Pandapé, regenera kit). Worker
BullMQ (consumidor) sobe no boot do backend. Módulo carregado no `app.module`. Inerte sem token.

**2. Ambiente: SANDBOX.** `CLICKSIGN_API_BASE_URL=https://sandbox.clicksign.com/api/v3`, token
sandbox configurado. Para produção: trocar base URL + token de produção e revalidar shapes/limites
(prod 50 req/10s vs sandbox 20; o limiter está em 18/10s, conservador) e o caso do cancelamento de
running (no sandbox não há cancelamento programático).

**3. Nunca rodou com envelope real nesta base.** `clicksign_envelope_id` preenchido: **0**. Contrato
arquivado (`contrato_assinado_drive_url`): **0**. Os **1.486 ASSINADO** são artefato da CARGA (§A.16
regra 1, concluídas entram ASSINADO), não Clicksign real. SEM_ENVELOPE: 864. O sandbox foi provado no
desenvolvimento, mas nada persistiu aqui.

**4. Job de verificação: worker vivo, gatilho do tick NÃO instalado.** O worker BullMQ roda dentro do
`ea-backend` (systemd) e conecta no `ea-redis` (6380, healthy), no padrão dos outros (não é processo
solto). MAS o `poll-tick` só é enfileirado pelo `POST /internal/clicksign/tick`, que depende de um
CRON externo. Esse cron **NÃO está instalado** (sem crontab, sem timer systemd);
`infra/install-clicksign-cron.sh` (cadência 1/min, 7h-23h) existe e nunca foi rodado. Ou seja: a
arquitetura está certa, mas na prática **o tick nunca dispara**, então nada é verificado/arquivado.

**5. Gatilho: NÃO é automático no fim das 3 frentes.** O envelope só nasce via `KitService.gerar`
(que enfileira `criar-envelope`), chamado por: (a) `/kit/:admissaoId/gerar`, a tela F9 ANTIGA, tirada
do menu (§A.15); (b) `reenviarCorrecao`. O gate F9 (`kitLiberado`, 3 frentes) é revalidado por DEFESA
dentro do `criarEnvelope`, mas não é o gatilho. O `/gerador-kit` novo (`processarMotor`) NÃO cria
envelope (o envelope por candidato é a evolução FUTURA junto do INT-4, §A.5). Então hoje **não há
caminho vivo de tela para criar o primeiro envelope**. Regra da fila do Cadastro
(`esteira.service.ts` ~168-183, os números do diretor deslocaram): na aba CADASTRO_CONTRATO a
admissão fica na fila se `nao_concluida OR clicksign_status IN (AGUARDANDO_ASSINATURA, CANCELADO)`;
mesmo com Cadastro concluído, "Aguardando assinatura"/"Cancelado" seguem visíveis, e só somem em
ASSINADO/SEM_ENVELOPE. Depende de `concluida` + `clicksign_status`, nunca do código do status.

**6. Falta para operar ponta a ponta (ordem de dependência):** (i) decidir sandbox x produção e, se
prod, base URL + token novos; (ii) **instalar o cron do tick** (sem ele nada é verificado); (iii)
definir o GATILHO do primeiro envelope (a evolução §A.5: envelope automático por candidato no
`/gerador-kit` com o gate F12, ou restaurar uma ação manual de gerar), hoje o maior buraco funcional;
(iv) candidato com e-mail (o `criarEnvelope` pula sem e-mail, por causa do requirement de e-mail);
(v) pasta-pai do Drive mapeada por cliente/contrato (`resolvePastaPaiId`), senão não arquiva; (vi)
validar cancelamento de running em produção; (vii) rodar um envelope real fim-a-fim e validação do
diretor.

**7. Riscos e dívidas:** rate limit tratado (limiter 18/10s + backoff 5x, concorrência 1); URL de
download expira ~5min, tratada por download SÍNCRONO no mesmo ciclo, nunca persistida/logada (§A.6);
se o download falha, o status fica AGUARDANDO e o PRÓXIMO tick retenta, MAS sem o cron não há próximo
tick (fica preso); **expiração de envelope (deadline 30 dias) não tem tratamento explícito**, se a
Clicksign não devolver closed/canceled o tick só ignora (fica AGUARDANDO para sempre); cancelamento de
running é best-effort (EA é autoritativo com CANCELADO + trilha de dupla correção); o reenvio depende
do `KitService.gerar` antigo (dívida §A.15, remover a F9 quebraria o reenvio); staging TTL 1h, se o
kit for expurgado antes do worker o job entra em backoff e o consultor regenera. Drive é REAL
(`DRIVE_MOCK=false`, `ea-ai-service` ativo em :8000).

---

## 2026-07-24 (4): bug do /vt (redirecionava para o login do EA), corrigido e provado

**Sintoma:** candidato preenchia CPF + data de nascimento no /vt, clicava em Entrar e caía no LOGIN
DO EA em vez de ver o formulário (ou a mensagem de erro).

**Causa raiz (front, `lib/api.ts`, regressão do refresh de sessão):** o `fetchComRenovacao` tratava
QUALQUER 401 fora de `/auth/` como sessão do EA expirada. `ehRotaDeSessao` só excluía `/auth/`, então
o 401 do `/vt/identificar` (que é o "Dados não encontrados", `UnauthorizedException`) disparava
`renovarSessao()` (`/auth/refresh`); o candidato não tem cookie de refresh do EA, o refresh falha,
`sessaoExpirou()` roda e o gancho `aoExpirar` (`auth-context.tsx`) faz `location.assign("/login")`. A
mensagem que a própria tela do VT já tinha nunca aparecia. Regressão: o refresh de sessão entrou no
lote `2bd12f4` e passou a interceptar o 401 do /vt; antes o 401 virava erro na tela (o próprio
comentário do arquivo descreve o mundo anterior). **O MenuGuard NÃO era o culpado** (isenta `@Public`,
inclusive VT) e o backend do /vt está correto (`@Public` + `VtSessaoGuard`).

**Varredura de outras rotas públicas com sessão própria:** a ÚNICA rota do browser pública com sessão
própria é `/vt/*`. As demais `@Public` são server-to-server (crons `/internal/*`, webhook Pandapé) ou
já isentas (`/auth/*`, `/health`). **O `/kit` NÃO sofre o problema:** todas as rotas `/kit` exigem o
JWT do EA (o consultor logado gera o kit), então um 401 lá é sessão do EA de verdade e o refresh é o
certo; o token de download do kit falha com **404** (`NotFoundException`), não 401, logo nunca entra
no ciclo. Fix escopado só ao /vt.

**Correção (aprovada, cirúrgica, só front):** novo predicado `ehFluxoPublicoComSessaoPropria(path)` =
`path.startsWith("/vt/")`, somado à guarda do 401: `if (res.status !== 401 || ehRotaDeSessao(path) ||
ehFluxoPublicoComSessaoPropria(path)) return res;`. Assim o 401 do /vt vira `ApiError` e a tela mostra
a mensagem, sem `renovarSessao` nem `sessaoExpirou`. Mudança puramente aditiva: rotas do sistema
seguem no ciclo de refresh como antes.

**Prova:**
- Bundle servido (chunk da lógica de sessão): `...startsWith("/auth/")||e.startsWith("/vt/"))return l;
  let a=await d();...`, ou seja o /vt sai antes de chamar renovar (`d`) e expirar (`f`); para as demais
  rotas segue chamando os dois (refresh do EA intacto).
- Ao vivo: `/vt/identificar` com candidato válido responde **201** (token, formulário abre); com dado
  inválido responde **401** (agora exibido como "Dados não encontrados" na própria tela, sem redirect).
- Typecheck e lint verdes. Deploy do frontend, `/login` e `/vt` -> 200, novo `BUILD_ID`. Sem travessão.

---

## 2026-07-24 (3): logo novo recebido com FUNDO EMBUTIDO, PARADO, aguardando reexport transparente

Rike mandou um logo com contorno melhorado (`/home/henrique/logo-atualizado.png`, md5 `461ca022…`).
Antes de aplicar, verifiquei os pixels (trava desta frente) e **PAREI**, sem aplicar, sem recortar,
sem sobrescrever. O `logo-ea.png` atual segue intacto no ar.

**Retrato do arquivo recebido:** PNG **1254x1254**, **RGB SEM canal alpha** (channels=3). Fundo
**branco sólido embutido** (~254,254,254), ~81% da imagem, zero transparência. Marca ~18%, bbox
1054x820, cor média **RGB (103,142,198)** = símbolo **azul/ciano** sobre o branco.

**Comparação com o atual** (`logo-ea.png` 1024x1024 RGBA, 79% transparente, marca branca): o novo tem
resolução maior e contorno melhor, mas **perdeu a transparência e trouxe fundo branco chapado**. Para
o nosso uso (sidebar/login/troca de senha em glass ESCURO) ele apareceria como retângulo branco, e a
sombra CSS (`.logo-ea-mist`) é feita para logo transparente. **Veredito: pior como asset**, então
parei em vez de trocar (trava: "se for pior, PARAR e reportar").

**Decisão do Rike (perguntei):** quando reexportar, a marca deve ser **BRANCA** (como hoje), para
manter o contraste no escuro e a sombra CSS como está.

**O que destrava (insumo do Rike, §A.0):** reexportar o desenho novo com **fundo TRANSPARENTE** (PNG
com alpha de verdade, ou SVG/vetor) e a **marca branca**. Assim que chegar, aplico em sidebar, login,
troca de senha e regenero o favicon a partir dele, tudo sem recorte. Nada mais a fazer do meu lado
até o arquivo transparente chegar.

---

## 2026-07-24 (2): OST dois ajustes de front, cabeçalho opaco e logo, deployado e provado

Frontend só. Gate verde (typecheck, lint dos arquivos tocados). Rebuild interno (stop, backup,
build, start), `/login` e `/trocar-senha` -> 200, novo `BUILD_ID`. Sem travessão (§A.11).

### Bloco 1, cabeçalho de tabela congelado ficou OPACO (modo escuro)
**Causa exata.** Os dois cabeçalhos congelados (`.list-head` das tabelas em grid e `.ds-table thead th`
das tabelas de admin) usavam `background: color-mix(in srgb, var(--surface-2) 94%, var(--bg))`. No
escuro `--surface-2` é `rgba(255,255,255,0.08)`, então o mix resultava em alpha ~0.135 (o cabeçalho
ficava ~86% transparente) e as linhas passavam legíveis por baixo ao rolar. No claro `--surface-2` é
0.93, então lá já estava ~93% opaco (ok).

**Correção (opacidade, não redesenho).** Novo token sólido `--table-head-bg`, tema-aware:
`#f6f9fc` no claro e `#1a2331` no escuro (leve lift sobre o `--bg` para ler como barra). Os dois
cabeçalhos passaram a usar `var(--table-head-bg)`. Hairline inferior, blur e divisórias de coluna
mantidos. Não mexi em `--surface-2` (usado por outros elementos que devem seguir translúcidos).
**Aplica em TODAS as tabelas com cabeçalho congelado:** grid (`.list-head`) na Esteira, Gerenciador e
Não-conformidades; admin (`.ds-table`) em Régua, Regras, Motivos de declínio, Escalas, Clientes,
Usuários, Tarifas, Cargos e na Liberação. Claro conferido: cabeçalho quase branco opaco, texto
`--faint` legível, sem estourar contraste.

**Prova no bundle servido:** o CSS servido traz `--table-head-bg:#1a2331` e `#f6f9fc`, os dois
cabeçalhos usam `var(--table-head-bg)`, e o antigo `color-mix(...surface-2 94%...)` sumiu (0
ocorrências).

### Bloco 2, logo e sombra
**Achado importante, verifiquei os pixels do arquivo antes de mexer.** O `public/logo-ea.png` (usado
no login e na sidebar) **já é PNG RGBA 1024x1024 com fundo TRANSPARENTE**: cantos com alpha 0, 79%
dos pixels transparentes, e as bordas anti-serrilhadas têm cor média **(204,206,207), cinza claro**
(só 5% de pixels escuros), ou seja **não há fundo azul/escuro embutido nem franja escura de recorte**.
É o arquivo bom da OST do login, não a versão achatada/recortada que o Rike citou como erro passado.
Por isso **NÃO reprocessei a imagem** (reprocessar seria exatamente o "recorte sobre a versão
achatada" que o Rike proibiu, e degradaria um asset que está limpo). Resolução/formato adotados
(declarados): **PNG, 1024x1024, RGBA com alpha, transparente**, nítido em alta densidade.
*Se o Rike tiver um ORIGINAL de maior fidelidade (SVG/vetor), é insumo dele (§A.0): mando trocar na
hora. O arquivo atual, porém, já está transparente e íntegro.*

**Sombra fortalecida (era o que estava fraco).** A classe `.logo-ea-mist` (halo esfumaçado atrás do
logo, em uso no `LogoEA` da sidebar, `LogoEA.tsx`) estava tímida: escuro só `rgba(255,255,255,0.10)` e
`blur(3.5px)`. Reforcei, tema-aware e mais esfumaçada: `blur(6px)`; no claro a fumaça escura passou de
0.62 para **0.85** no centro com mais espalhamento; no escuro o glow passou de 0.10 para **0.24**. Fica
um halo forte e difuso, sem borda dura. Na tela de troca de senha a sombra do logo vem por
`drop-shadow` (mesmo espírito do login).

**Prova no bundle servido:** o CSS traz `.logo-ea-mist{...rgba(30,38,52,.85)...;filter:blur(6px)...}`
e o override escuro `...hsla(0,0%,100%,.24)...` (o minificador reescreveu o rgba branco como hsla).

### Bloco 3, logo trocado onde faltava, e varredura completa
**Inventário de TODOS os pontos que renderizam logo no sistema:**
| Ponto | Logo | Estado |
|---|---|---|
| Sidebar | `LogoEA` -> `/logo-ea.png` (novo) | já era o novo |
| Login | `<img>` `/logo-ea.png` (novo) | já era o novo |
| **Troca de senha / primeiro acesso** (`/trocar-senha`) | era `Brand` (marca ANTIGA em CSS, quadro "EA") | **TROCADO para `/logo-ea.png`** com sombra por drop-shadow |
| Formulário VT público (`/vt`) | `/logo-soulan.png` | **logo da SOULAN**, de propósito (peça pública da marca Soulan), NÃO é o logo do app EA, mantido |
| PDF do VT (ai-service `vt_pdf.py`) | `logo-soulan.png` | **logo da SOULAN** em documento oficial, mantido |
| Favicon / ícone de aba | nenhum (`metadata` só tem título/descrição) | não existe logo hoje, navegador usa o default |
| Páginas de erro / not-found | não existem no projeto | nada a trocar |
| E-mails | não há envio de e-mail no sistema | nada a trocar |
| PDF do Kit | não embute logo | nada a trocar |

**O único ponto com logo ANTIGO era a troca de senha (o caso que o Rike achou), agora corrigido.**

**Órfão reportado, NÃO removido (§A.14):** o componente `Brand` (`components/ui/Brand.tsx`) e as
classes CSS `.brand-mark`/`.brand-name` no `globals.css` ficaram sem uso (só a troca de senha os
usava). Não excluí porque apagar componente + CSS compartilhado passa de "trocar o logo"; fica para o
Rike decidir (é uma linha, se ele quiser).

**Prova no bundle servido:** o chunk de `/trocar-senha` referencia `/logo-ea.png` e **não** tem mais
`brand-mark`.

**Pergunta em aberto para o Rike:** hoje não há **favicon** (a aba do navegador usa o ícone padrão).
Se quiser o logo EA como favicon, é um item novo (§A.14): faço quando ele pedir.

### Follow-up (mesmo dia), Rike aprovou remover o Brand órfão e criar o favicon
**1. Brand removido.** Confirmei por grep que nada mais usava `Brand`, `.brand-mark` nem `.brand-name`
(só a própria definição). Apaguei o componente `components/ui/Brand.tsx` e as três regras CSS no
`globals.css` (`.brand-mark`, `.brand-name`, `.brand-name span`). Prova no bundle: `brand-mark` = 0
ocorrências no CSS servido. Typecheck e lint verdes.

**2. Favicon criado a partir do `logo-ea.png` (1024x1024 íntegro).** Sem ImageMagick/Pillow/sharp na
VM, gerei com um encoder PNG/ICO em Python puro (stdlib zlib). Recortei o **símbolo** (a fita EA, não
o lockup com texto, que seria ilegível a 16px) pela bbox medida no `LogoEA.tsx`, centralizei num
quadrado com padding sobre um **fundo navy sólido `#0b1b30`** (o símbolo é branco, RGB médio ~232, e
num favicon transparente sumiria em aba clara: fundo é do ÍCONE, não embutido no logo). **Tamanhos
gerados e declarados:**
- `favicon.ico`: **16x16, 32x32, 48x48** (PNG embutido no container ICO).
- `icon.png`: **512x512** (alta densidade / PWA).
- `apple-icon.png`: **180x180** (apple-touch-icon).

Arquivos em `apps/frontend/src/app/` (convenção do App Router: o Next injeta os `<link>` sozinho).
Prova no bundle servido: o `<head>` traz `rel="icon" href="/favicon.ico"`, `rel="icon"
href="/icon.png" sizes="512x512"` e `rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180"`;
`/favicon.ico` responde 200 (image/x-icon, 3343 B), `/icon.png` e `/apple-icon.png` 200 (image/png).

**3. Logo em vetor/SVG:** o Rike vai verificar se tem o original. Por ora fica o PNG, que já está
transparente e íntegro. Nada a fazer do meu lado até ele trazer o vetor.

Deploy do frontend (stop, backup, build, start), `/login` 200, novo `BUILD_ID`. Sem travessão.

---

## 2026-07-24: OST modal do olho e tolerância no campo de VR, aguardando validação em produção

Duas frentes independentes, escopo fechado (§A.14). Gate verde (typecheck back+front, lint dos
arquivos tocados, 57 testes de DTO incluindo 14 novos). Rike valida na tela em produção.

### CORREÇÃO (mesmo dia), a lista não sumiu na primeira validação: causa raiz e re-deploy
Rike validou em produção e a lista de documentos continuava no modal do olho (nas 3 abas da Esteira
e no eye do Gerenciador). Investiguei ANTES de mexer, como pedido, e achei duas coisas:

1. **Causa raiz: o bundle servido estava velho.** O `.next` em produção era o build das 02:12 (deploy
   anterior, commit `b631fc7`), ANTERIOR à minha edição das 10:13. O serviço `ea-frontend` (systemd
   --user, `next start`) servia o build antigo, então a remoção no fonte nunca chegou à tela. Não era
   bug de código: era build não reconstruído. O modal do olho é UM componente só (`AdmissaoDetalheModal`),
   usado pelo eye das 3 abas da Esteira, pelo eye do Gerenciador e pelo de Não-conformidades. Não há
   segundo componente nem segundo bloco de documentos DENTRO dele (confirmado: zero renderização de
   documento no fonte).

2. **Achado colateral (fora do escopo desta OST, NÃO tocado, §A.14):** existe OUTRO bloco "Documentos
   pendentes" no `EditAdmissaoModal`, o modal de EDITAR (lápis) do Gerenciador, não no modal do olho.
   É outra superfície, aberta por outro botão. A OST fala do "modal do olho"; o de editar não foi
   pedido. Reportado ao Rike para decidir se remove lá também. Não removi por conta própria.

**Re-deploy interno (§A.0), sem git push (gate não envolvido).** Backend: build + restart do
`ea-backend` (para a tolerância do VR). Frontend: parei o `ea-frontend`, fiz backup do build das
02:12 (`.next` -> `.next.bak`, rollback se o build falhasse), rebuild do fonte, subi de novo. Sem
janela de 500 (regra da memória: não buildar com o serviço no ar). Health: backend
`/api/health` ok, frontend `/login` -> 200, ambos `active`. Novo `BUILD_ID` das 10:32.

**Prova no bundle SERVIDO (acentos são escapados no minificado, então usei marcadores ASCII e prova
estrutural por chunk):** o modal do olho compila no chunk `800-...js` (é onde vive o marcador único
dele, "Trilha de passagem"); esse chunk tem `Documentos pendentes` = **0** ocorrências, ou seja a
lista saiu do olho. A string "Documentos pendentes" que sobra vive no chunk `866-...js` (que tem
"Trilha de passagem" = 0), isto é, é o `EditAdmissaoModal`, não o olho. No fonte, só o
`EditAdmissaoModal` ainda contém "Documentos pendentes"; o `AdmissaoDetalheModal` tem zero. **Removido
nos QUATRO lugares do modal do olho** (Esteira Auditoria, Esteira Exame, Esteira Cadastro, Gerenciador),
porque os quatro são o MESMO componente. A "Observação da liberação" e os demais blocos seguem. A API
(`GET /esteira/admissao/:id`) e o `AuditoriaDocsModal` não foram tocados. Comentários órfãos que
citavam a lista removida foram limpos.

### CORREÇÃO parte 2, Rike pediu remover a lista TAMBÉM do modal de editar (EditAdmissaoModal)
Decisão do Rike após o achado colateral acima. Removida a mesma renderização "Documentos pendentes"
do `EditAdmissaoModal` (modal do lápis do Gerenciador): só a renderização (bloco JSX + o campo de
tipo `documentosPendentes`, que ficou órfão e ninguém mais lia). Mantidos todos os demais blocos do
editar (dados cadastrais, cliente, cargo, salário, benefícios, frentes, etc.). API e
`AuditoriaDocsModal` intocados. `camposFiltro` (prop) continua em uso amplo, não virou órfão.
Redeploy do frontend (stop, backup, build, start), `/login` -> 200, novo `BUILD_ID`.

**Prova no bundle servido:** `Documentos pendentes` agora dá **0 ocorrências em TODO o `.next`**
(saiu do olho E do editar; no fonte não existe mais em lugar nenhum). O editar segue inteiro
(marcadores ASCII "Centro de custo" e "Tipo de contrato" presentes), o olho segue inteiro
("Trilha de passagem" presente) e a Auditoria segue completa ("Auditoria documental" presente).

### Varredura pedida pelo Rike, onde mais o sistema renderiza lista de documentos da admissão
Fora do modal de Auditoria (`AuditoriaDocsModal`, onde a gestão documental deve viver), **não sobra
nenhuma outra lista de STATUS por documento de uma admissão real**. As três superfícies que mostravam
`estado` (pendente/entregue/inconforme) por documento eram: modal do olho, modal de editar (ambos
agora limpos) e a Auditoria (mantida). Outras listas "de documento" existem, mas são de OUTRA natureza
(não são o status da régua da admissão), então ficam **reportadas, não removidas** (Rike decide):
- **Wizard `/nova`:** PRÉVIA da régua do par cliente+cargo (tipos de documento + rótulo de exigência
  Obrigatório/Facultativo), antes de a admissão existir. Mostra `exigencia`, não `estado`.
- **Gerador de Kit (`/gerador-kit`):** documentos encontrados no PDF-mãe por funcionário, para montar o
  kit (F9). Domínio de montagem de kit, não status de auditoria.
- **Admin Régua (`/admin/regua`):** CRUD da régua (quais documentos são exigidos por cliente+cargo).
- **Admin Kit-regras (`/admin/kit-regras`):** contagem de documentos de uma regra de kit.
- Não confundir: `docsPendentes` na Esteira é um NÚMERO (badge, §A.22), não uma lista; e
  `/admin/diagnostico` lista `estado` de DEPENDÊNCIAS do sistema, não de documentos.

Aguardando Rike revalidar os dois modais no bundle novo.

### Bloco 1, remoção da lista de documentos do modal do olho
**O que era.** O modal do olho (`AdmissaoDetalheModal`, ficha só-leitura) tinha um "Bloco 5,
Documentos pendentes": lista dos documentos não-entregues mais o contador "X de Y documentos já
concluídos" que fora acrescentado depois. Era duplicação da gestão documental, que vive toda no
modal de Auditar (veredito, motivo, botões Auditar/Reauditar/Validar/Visualizar/Descartar), e foi
justamente essa lista que criou a falsa impressão de bug ao exibir linhas seguidas de estado
pendente sem denominador claro.

**O que foi feito.** Removida por completo a renderização dessa lista e do contador no modal do
olho: o JSX do Bloco 5, as variáveis `docsPendentes`/`docsTotal`/`docsConcluidos` e os helpers que
só serviam a ela (`docTone`, `docRotulo`, `EXIG_ROTULO`), mais a interface `DocDetalhe` e o campo
`documentos` do tipo espelho (que ninguém mais lê no componente) e o import agora órfão `cn`.
**Mantidos** intocados: a "Observação da liberação" (bloco âmbar no topo, é recado do consultor, não
documento) e todos os demais blocos (dados pessoais, trabalho/cadastro, exame, status das frentes,
trilha de passagem, histórico).

**Cuidado crítico respeitado: a API NÃO foi tocada.** O endpoint `GET /esteira/admissao/:id`
(`esteira.service.detalhe`) serve os DOIS modais e continua devolvendo `documentos[]` igual, porque
o modal de Auditar depende dele. Removeu-se SÓ a renderização no olho. Prova textual: `git diff`
não toca `esteira.service.ts`/`esteira.controller.ts` nem `AuditoriaDocsModal.tsx`; o typecheck do
front passa, o que confirma que o Auditar (que lê o mesmo endpoint e tem seu próprio mapa de
documentos) segue completo. O Rike prova o Auditar abrindo-o em produção.

**Código órfão reportado e removido junto** (nada morto deixado para trás): os três helpers, as três
variáveis do contador, a interface `DocDetalhe`, o campo `documentos` do tipo local e o import `cn`
eram usados EXCLUSIVAMENTE pela lista removida (confirmado por grep antes de apagar). `EXIG_ROTULO`
e equivalentes existem de forma independente e duplicada no `AuditoriaDocsModal`, então o Auditar não
foi afetado. Nenhum órfão no backend: os dois modais leem o mesmo endpoint, não há query separada.

### Bloco 2, tolerância pt-BR no campo de valor do benefício (VR/VA)
**O que era.** No mesmo modal de Liberação, o salário já aceitava o pt-BR do consultor ("R$ 2.500,00")
por máscara no front (`maskMoedaBR`) mais normalização robusta no back (`valor-monetario-br.ts`),
enquanto o valor do benefício (VR, VA e afins) era MAIS ESTRITO: sem máscara, e o `@Transform` do
backend só removia milhar e trocava vírgula por ponto, SEM tirar "R$"/espaço, então "R$ 44,00" virava
`NaN` e caía em 400 sem o consultor entender por quê.

**O que foi feito (reuso, sem reimplementar).**
- **Front:** aplicada a máscara existente `maskMoedaBR` aos inputs de valor de benefício nos DOIS
  modais da Liberação, individual e lote (`liberacao/page.tsx`). É a mesma peça já usada no salário do
  próprio arquivo.
- **Back:** o `@Transform` de `BeneficioAlocadoDto.valor` passou a reusar `parseValorBR` (de
  `valor-monetario-br.ts`, o MESMO parser do salário): tolera "R$", espaço (inclusive não-quebrável),
  ponto de milhar e vírgula decimal; vazio vira `undefined` (opcional, não bloqueia); inválido volta
  como texto cru e o `@IsNumber` barra com 400 claro ("Valor do benefício inválido. Use o formato
  500,00."). Zero segue válido.

**Nota de escopo (§A.14).** `BeneficioAlocadoDto` é compartilhado por Liberar (individual), Liberar
(lote), Create e Update. Não há como deixar o backend tolerante "só na Liberação" sem duplicar o DTO,
o que seria pior. A mudança só torna a validação MAIS tolerante (nunca muda o resultado de um valor
válido) e cobre exatamente os dois modais que a OST pede, endurecendo de quebra o ponto único de
validação daquele campo. Não introduz travessão (§A.11).

### Bloco 3, prova
- **Bloco 1:** provado textualmente que a lista/contador saíram do olho, que a "Observação da
  liberação" continua (linhas 304-310 do modal) e que a API e o modal de Auditar não foram tocados
  (diff limpo + typecheck verde). Validação visual do olho e do Auditar: com o Rike, em produção.
- **Bloco 2:** novo teste de DTO real (`beneficio-valor-dto.spec.ts`, 14 casos, roda o transform +
  validate como o ValidationPipe global). Prova os formatos da OST chegando iguais ao VR:
  `44` -> 44, `44,00` -> 44, `R$ 44,00` -> 44 (mais `2.500,00`, `2 500,00`, `0`, number direto), vazio
  opcional, e inválido (`abc`, `R$ dez`, `1,2,3`, `-44`, `44,reais`) virando 400 com mensagem clara.
  O DTO é o mesmo do individual e do lote, então a prova vale para os dois.

### Varredura de campos monetários (Bloco 2, reportar sem alterar)
Além do valor de benefício (agora corrigido nos dois modais da Liberação), a varredura achou outros
pontos de entrada de moeda SEM o tratamento pt-BR completo (máscara no front + parser robusto no
back). NÃO alterados, por estarem fora do escopo desta OST (§A.14), ficam registrados para decisão do
diretor:
- **Salário no wizard `/nova` e no Gerenciador (`EditAdmissaoModal`):** back forte (mesmo DTO robusto
  do salário), mas front SEM máscara (envia texto cru). Funciona, porém menos amigável que na
  Liberação.
- **Valor de benefício no wizard `/nova` e no Gerenciador:** mesmo `BeneficioAlocadoDto`, então já
  herdaram a tolerância do back desta OST; o front desses dois continua SEM máscara.
- **Valor da tarifa de transporte (`/admin/tarifas`) e valor da passagem/VT (formulário `/vt`):**
  transform mais fraco no back (só troca vírgula por ponto, não remove milhar nem "R$"/espaço), então
  "1.500,00" quebra; front sem máscara.
- **Valor do exame (`AgendamentoExameModal`):** mesmo padrão antigo do benefício (remove milhar e
  vírgula, mas não "R$"/espaço); front sem máscara.

Recomendação (não executada): unificar esses pontos no par `maskMoedaBR` + `parseValorBR` numa OST
própria fecharia o desalinhamento de vez. Aguarda decisão do diretor.

### Observação de higiene (fora do escopo, não tocado)
O `pnpm lint` da raiz acusa 2 erros PRÉ-EXISTENTES em arquivos que esta OST não toca
(`nova/page.tsx:299` e `vt/page.tsx:245`): um `eslint-disable` de `react-hooks/exhaustive-deps`, regra
que a config atual do eslint não carrega. Confirmado que existem no HEAD e não têm relação com esta
entrega. Os arquivos alterados por mim passam no lint. Deixado como está (§A.14); registrado para o
diretor decidir se vira OST de config.

---

## 2026-07-22 (noite, 2): OST B2, unificação de rótulo e três regras sobrepostas, aguardando validação

Fecha os itens que a OST B1 deixou em aberto. **Lote continua não rodado.**

### Bloco 1, "Parcial" unificado em todos os lugares
**Causa.** A Esteira já lia "Parcial", o Gerenciador ainda lia "Inconformidade" para o MESMO estado de
fundo. Pior: lá o mapa de rótulos alimentava também as opções do filtro multi-select, então trocar o
texto criaria três opções "Parcial" idênticas no dropdown, com efeitos diferentes.

**Decisão.** No Gerenciador, PARCIAL, PENDENTE e INCONFORMIDADE passam a ler **"Parcial"**, no mesmo
tom âmbar. O filtro deixou de ser derivado do mapa de rótulos e passou a ter uma lista própria de
**três opções** (Completo, Parcial, Competências); a opção "Parcial" carrega os três valores do enum e
é **expandida na hora de consultar** (`valoresDoFiltroSinal`), porque é assim que o backend filtra
(`inArray` sobre `sinalizador_preenchimento`). Filtro segue funcionando, sem opção repetida.

**Varredura das demais telas:** só existem TRÊS mapas de rótulo de sinalizador no sistema. Esteira
(feito na B1), Gerenciador (feito agora) e a ficha da admissão. O enum do domínio não foi tocado.

**CORREÇÃO DE UMA IMPRECISÃO MINHA, que virou premissa desta OST.** No relatório da B1 eu disse que a
ficha da admissão usava o termo "com significado próprio". Conferido no código: a ficha
(`AdmissaoDetalheModal`) renderiza o MESMO campo `sinalizador`, não um estado de documento. O que é
verdade é outra coisa, mais estreita: o VALOR do enum `INCONFORMIDADE` é atribuído quando existe
documento INCONFORME (é o `recalcularSinalizador` que o define, e ele domina os demais), então na
ficha, que é tela de detalhe, o termo ainda informa algo acionável que "Parcial" esconderia. Como a
OST excluiu a ficha explicitamente, **ela não foi alterada**. Se o diretor quiser unificar lá também,
é uma linha.

### Bloco 2, o que serve como comprovante de conta bancária
A régua não dizia O QUE é aceito, e a reprovação saía inconsistente. Lista do diretor gravada como
regra, no padrão do PIS: **foto do cartão, print da tela do banco, comprovante de transferência entre
contas, carta de abertura de conta e extrato bancário**, com a instrução explícita de NÃO reprovar por
"tipo de documento incorreto" quando for um desses e os dados estiverem legíveis.

### Bloco 3, CPF aceita CTPS digital
A CTPS digital traz os dados do candidato e o número identificador dela É o CPF. A regra do CPF passa
a listar: comprovante de inscrição no CPF, CNH, RG que traga o CPF e **CTPS digital**.

### Bloco 4, foto unificada
**Qual conjunto prevaleceu e por quê: o do `FOTO_3X4`.** Ele já descrevia uma foto USÁVEL (recente,
fundo claro, rosto descoberto e face inteira visível, imagem nítida sem filtros ou recortes),
enquanto o `FOTO_CRACHA` tinha só a regra geral e aprovava qualquer imagem legível. Adotar o conjunto
mais fraco baixaria o critério das duas; adotar o mais forte iguala por cima. As regras agora vivem
numa constante compartilhada (`REGRAS_FOTO`), então os dois tipos são julgados pelo mesmo texto, e uma
regra a mais fecha a sobreposição: uma foto serve no lugar da outra, sem reprovar por tipo.

**O ajuste de exibição da OST A continua intacto**: o slot "Foto 3x4", quando vazio, segue exibindo a
foto de crachá recebida (`domain/documentos-equivalentes`). Mexemos em REGRA, não em exibição.

**Fundir os dois TIPOS num só: NÃO foi feito, como manda a OST.** Fica reportado com o que a fusão
custaria: `FOTO_CRACHA` é destino do de/para do Pandapé (o formulário "Foto do rosto para crachá"
mapeia para ele, `resolver-tipo-documento`), tem documentos já gravados em produção e é tipo ativo do
catálogo. Fundir exigiria migrar os documentos existentes, reapontar o de/para e a equivalência de
exibição. Com as regras unificadas, o ganho da fusão passa a ser só de catálogo. Decisão do diretor.

### Bloco 5, prova na Silvia (antes → depois, reauditoria pela rota real)
| Documento | Antes | Depois | Leitura |
|---|---|---|---|
| Comprovante de Conta Bancária | PENDENTE, "nome do titular não visível e rasuras" | **INCONFORME** | "Nome do titular da conta não visível e nome do banco não identificado." É o **motivo REAL**, exatamente o que o diretor confirmou. **Não é mais "tipo incorreto"**: a lista do Bloco 2 tirou o tipo da discussão e sobrou o defeito de verdade |
| CPF | ENTREGUE | **ENTREGUE** | segue válido, agora citando a regra de aceitação ("RG aceito como comprovante de CPF") |
| Foto para Crachá | ENTREGUE | **PENDENTE** | ver abaixo |

**A foto ANDOU PARA TRÁS, e é consequência direta do Bloco 4.** Ela estava ENTREGUE porque o
`FOTO_CRACHA` só tinha a regra geral ("legível, sem rasuras"). Com o critério do `FOTO_3X4` valendo
para os dois, a IA passou a cobrar identidade do titular e **data de captura**, e devolveu PENDENTE:
"Não foi possível verificar a identidade do titular e a data de captura da foto."

Isto expõe um problema da REGRA, não da unificação: **"a foto deve ser recente (até 6 meses)" não é
verificável a partir de uma imagem** (não há data no arquivo), então ela empurra qualquer foto para
PENDENTE. A regra é antiga, do seed original, e o efeito só apareceu agora porque antes ela não valia
para a foto de crachá. Duas saídas, decisão do diretor: afrouxar a regra para os dois tipos (tirar a
exigência de data, que a IA não tem como conferir), ou manter e tratar foto por **validação humana**,
que é exatamente o botão entregue na OST B1. **Não decidi por conta própria** (§A.14).

**Por que parei nos três documentos:** são os afetados pelas regras desta OST. Reauditar os demais
(RG, CTPS, PIS, certidão, SUS, escolaridade, título, residência) gastaria chamada de IA sem regra nova
para testar, e o caso da foto mostra que reauditar não é neutro: pode mexer em veredito que estava bom.

### Gate
Backend **357 testes** verdes + typecheck dos 3 pacotes. Regras aplicadas no banco pelo
`db:seed:regras` (idempotente) e gravadas no seed: **7 novas** nesta OST. Frontend reconstruído e no
ar. Lint com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO (sem prints, por instrução da OST): Gerenciador (coluna e filtro de
Pendências) e Esteira. Duas decisões pendentes: a regra de data da foto (Bloco 5) e a eventual fusão
dos dois tipos de foto (Bloco 4). **Sem commit até a validação** (§A.21).
