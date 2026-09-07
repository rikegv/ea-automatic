# DESENHO: TELA UNIFICADA DE VAGAS (A&S)

> Escrito pelo **arquiteto** (§A.39), a partir do briefing do coordenador e do
> `docs/MAPA-ALCANCE-TELA-UNIFICADA-VAGAS.md`. É **PLANO, não código**: o arquiteto não tem poder de
> escrita em código por desenho. §A.11 (travessão proibido) e §A.24 (title case em título e tag)
> valendo no documento e em tudo que ele propõe para a tela.
>
> O que o diretor JÁ decidiu não é redecidido aqui. O que este documento faz é dizer **COMO**, apontar
> onde a decisão encosta em código validado (§A.26) e devolver, no fim, as perguntas que sobraram, com
> recomendação e com marca de quem BLOQUEIA.

---

## 0. O QUE FOI CONFERIDO, E O QUE NÃO FOI

**Conferido lendo o código**, com arquivo e linha citados ao longo do documento:
`domain/candidatura.ts`, `domain/vaga.ts`, `as/candidatos/candidatos.service.ts` e `.controller.ts` e
`.dto.ts`, `as/vagas/vagas.service.ts` e `.controller.ts` e `.dto.ts`, `db/schema/tables.ts`,
`domain/menus.ts`, `auth/menu-areas.service.ts`, `auth/guards/menu.guard.ts`,
`packages/shared-types/src/index.ts`, a página `as/vagas/page.tsx`, a página `as/candidatos/page.tsx`,
os três modais de `components/as/vagas/` e os sete de `components/as/candidatos/`.

**Conferido contra os DOIS bancos**, com `docker exec ea-db psql`:

| | `ea_automatic` (produção) | `ea_automatic_homolog` |
|---|---|---|
| vagas | 3 (1 ABERTA, 1 ENTREGUE, 1 RASCUNHO) | 4 (2 ABERTA, 1 ENTREGUE, 1 FECHADA) |
| `as_candidatos` | **0** | 2 |
| `as_candidaturas` | **0** | 2 (1 ATIVO, 1 DESISTIU) |

**Medido no Postgres, não deduzido:** a armadilha do enum (seção 2.3) foi reproduzida em um banco de
rascunho no próprio `ea-db` (PostgreSQL **16.14**), e o erro exato está transcrito lá.

**Conferido no índice real do banco:** `uq_as_candidaturas_viva` tem os três valores **compilados
dentro do predicado** (`pg_indexes`), e não uma referência ao domínio. Transcrito na seção 2.2.

**NÃO conferido, e é honesto dizer:**
- A base histórica da **onda 3** (as ~2.363 vagas) **não foi importada** em nenhum dos dois bancos. O
  que este desenho diz sobre ela é raciocínio sobre a forma dela, não medição.
- **Não abri browser.** Nenhuma afirmação visual aqui vale como prova §A.13; a validação visual é do
  coordenador (§A.39, passo 6).
- Não medi desempenho. Os volumes de hoje (3 e 4 vagas) não dizem nada sobre 2.363, e a seção 3.2
  registra onde isso importa.

---

## 1. QUATRO CORREÇÕES AO MAPA DE ALCANCE

O mapa está certo no essencial e foi um bom ponto de partida. Quatro pontos merecem correção ou
aprofundamento, e três deles **mudam o desenho**, então não são preciosismo.

### 1.1. `ENTREGUE` não é escrito ao preencher a primeira posição. Ele é escrito ao FECHAR

O mapa diz, no ponto 3: *"`fechar()` marca `ENTREGUE` assim que uma posição é preenchida. Ou seja:
preencher a primeira posição hoje fecha a vaga para novas alocações."*

Isso não descreve o código de hoje. O ÚNICO lugar do backend que escreve `vagas.status = 'ENTREGUE'` é
`vagas.service.ts:806`, dentro de `fechar()`, e `fechar()` só é alcançável pelo `POST /as/vagas/:id/fechar`
(`vagas.controller.ts:75`), que é o clique deliberado em "Fechar vaga". **Não existe hoje a operação
"preencher uma posição"**, então ela não pode marcar nada. Conferi por varredura: nenhuma outra escrita
de `'ENTREGUE'` no módulo de A&S.

**O que É verdade, e é pior:** o formulário de fechamento **pré-preenche a contagem com a meta cheia**
(`as/vagas/page.tsx:1216`, `vagasFechadas: String(v.posicoesOficiais)`), então quase todo fechamento
sai com número maior que zero e vira `ENTREGUE`. E `ENTREGUE` está em `STATUS_QUE_NAO_RECEBEM`
(`domain/candidatura.ts:213`), lido na alocação (`candidatos.service.ts:360`) e na troca de vaga
(`candidatos.service.ts:589`). O resultado operacional é o que o diretor viu, mas a causa é outra: a
vaga foi **fechada por gente**, com um número digitado que ninguém conferiu contra a realidade.

**Por que a correção muda o desenho:** se a causa fosse "a primeira posição fecha a vaga", a solução
seria tirar `ENTREGUE` da lista. Sendo a causa "fechar é o único jeito de dizer que uma posição foi
preenchida", a solução é **dar um jeito próprio de dizer isso** (finalizar posição), e aí `ENTREGUE`
pode **continuar** na lista, porque ele volta a significar só o que diz: processo terminado. Ver seção 4.

### 1.2. O usuário sem `as-candidatos` não recebe lista vazia. Ele recebe um 403 barulhento

O mapa diz, no ponto 5: *"um usuário com `as-vagas` e SEM `as-candidatos` abre o modal e recebe a lista
vazia, sem erro visível"*.

O `MenuGuard` é global e resolve por operação: `menuDaOperacao("CandidatosController", "painelVaga")`
devolve `as-candidatos` (reivindicação `CandidatosController.*`, `domain/menus.ts:686-693`), e o guard
lança `ForbiddenException` com a frase *"Acesso negado: esta operação exige o menu "as-candidatos", que
não está liberado para o seu usuário."* (`auth/guards/menu.guard.ts:85-90`). O `apiFetch` transforma
isso em `ApiError` com a mensagem do backend, e o `CandidatosDaVagaModal` a exibe literalmente pelo
`mensagemDoErro` (`lib/as-candidatos.ts:401`, que devolve `err.message` de propósito).

Ou seja: **não é silêncio, é uma mensagem de permissão de OUTRO menu aparecendo dentro da Central de
Vagas**, para alguém que tem a Central de Vagas liberada. É um defeito real e é pior de explicar do que
uma lista vazia, mas o conserto é diferente, e é por isso que a distinção importa (seção 6).

Dois detalhes que o mapa não alcançou, e que também mudam o conserto:
- **MASTER passa sem a marcação**, desde que a área bata (`menu.guard.ts:83`: *"MASTER manda na área
  inteira"*). Então o problema é **exclusivo do COMUM**.
- **A área é o teto e vem da TABELA** (`menu-areas.service.ts:112-121`), não do código. Se o menu
  `as-candidatos` for marcado fora de AS pelo diretor, nem o MASTER de A&S passa.

### 1.3. O conjunto "quem consome posição" está escrito TRÊS vezes, e duas delas em SQL cru

O mapa cita `consomePosicao` como a base da ocupação. É verdade na leitura, mas **não é a única cópia**:

| onde | forma | linha |
|---|---|---|
| `consomePosicao` | TypeScript, régua do domínio | `domain/candidatura.ts:132` |
| a contagem da trava 4 | `inArray(situacao, ["APROVADO","CONTRATADO"])` | `candidatos.service.ts:781` |
| a contagem da troca de vaga | `inArray(situacao, ["APROVADO","CONTRATADO"])` | `candidatos.service.ts:633` |

E o conjunto VIVO tem uma quarta cópia, também crua: `in ('ATIVO','APROVADO','CONTRATADO')` dentro do
`candidaturasAtivas` da busca (`candidatos.service.ts:277`).

**Hoje elas concordam por coincidência, não por construção.** No dia em que `ALOCADO` entrar em
`consomePosicao` e ninguém lembrar dessas três linhas, a LEITURA da tela dirá "5 ocupadas" e a TRAVA
dirá "3 ocupadas", e a vaga aceitará duas aprovações a mais do que deveria, em silêncio. Este é o risco
mais caro do plano inteiro, e ele **não está no mapa**. Tratamento na seção 2.2, item 9.

### 1.4. `excessoDePosicoes` não perde a razão de existir. Ele muda de dono

O mapa diz que `excessoDePosicoes` *"perde a razão de existir na forma atual"*. Metade certo. Ele é
chamado em **dois** lugares, e só um deles é o fechamento:

- `fechar()` (`vagas.service.ts:782`), que compara o número **digitado** com a meta. Este morre, porque
  o número digitado morre.
- `editarPosicoes()` (`vagas.service.ts:716`), que confere se **baixar a meta** a deixaria abaixo do que
  já foi contado. Este **não morre**: ele muda de insumo. Em vez de comparar a meta nova com
  `vagas_fechadas`, passa a comparar com a **contagem derivada** de posições finalizadas. A pergunta
  ("dá para reduzir a meta para 2 se 3 posições já foram entregues?") continua existindo e continua
  precisando de resposta, senão o cilindro passa a desenhar 3 de 2.

---

## 2. MODELO DE DADOS: COMO "ALOCADO" ENTRA

### 2.1. As três formas possíveis, e a escolha

**Opção C, tabela de posição (`vaga_posicoes`, uma linha por posição).** Descartada. A vaga não tem
posições identificáveis: ela tem um CONTADOR (`posicoes_oficiais`, `tables.ts:2290`). Uma tabela
exigiria materializar N linhas na publicação e **re-materializá-las toda vez que `editarPosicoes`
mudasse a meta**, que é editável enquanto a vaga está ABERTA (`vagas.service.ts:707`). Isso é
exatamente o segundo número armazenado que o módulo recusou desde o primeiro dia, com o agravante de
que agora ele teria linhas próprias para dessincronizar. Só valeria a pena se posições tivessem
atributos individuais (turno, loja, salário), e não têm.

**Opção B, coluna própria (`posicao_finalizada_em` + `posicao_finalizada_por_id`).** Tem uma vantagem
real e ela é grande: **não toca no vocabulário de situação**, então `uq_as_candidaturas_viva`,
`SITUACOES_TRATADAS`, `kpiDaCandidatura`, `tomDaSituacao` e a trava de `moverEtapa` ficam todos
intocados, e "o candidato continua no funil" sai de graça. O que a derruba é o **fail-closed ao
contrário**: uma coluna nova é **invisível** para as réguas existentes. Nada obrigaria
`vagaPodeEncerrar` a considerá-la; nenhum teste quebraria; nenhum `switch` ficaria incompleto. A régua
mais cara do módulo passaria a depender de alguém lembrar.

**Opção A, valor novo no enum `candidatura_situacao`: ESCOLHIDA.** Três razões, nesta ordem:

1. **É a palavra que o diretor usou** ("marcado como ALOCADO") e o lugar onde qualquer pessoa vai
   procurar por ela: junto de ATIVO, APROVADO, DESCARTADO, DESISTIU, CONTRATADO.
2. **O código foi escrito esperando exatamente isto.** `domain/candidatura.ts:230-232` diz, textual:
   *"No dia em que uma situação nova entrar, as duas perguntas terão de ser respondidas separadamente
   para ela."* E `candidaturaTratada` foi escrita como pertencimento a uma lista, e não como
   `s !== "ATIVO"`, justamente para que a situação nova **nasça PENDENTE** e a vaga **não feche** até
   alguém decidir o que ela significa (`candidatura.ts:244-247`). O fail-closed é uma rede que já está
   armada; a opção B passaria por baixo dela.
3. **O compilador e os testes viram lista de tarefas.** `CANDIDATURA_SITUACAO_LABEL` é
   `Record<CandidaturaSituacao, string>` (`shared-types:2035`): valor novo sem rótulo **não compila**.
   E `lib/as-candidatos.spec.ts:103` já itera `CANDIDATURA_SITUACOES` inteiro contra
   `kpiDaCandidatura`, então o teste passa a exercitar `ALOCADO` sozinho, sem ninguém escrever caso novo.

**O preço da opção A, dito na cara:** a situação deixa de ser `APROVADO`, então a trava
"só `ATIVO` se move de etapa" (`candidatos.service.ts:451`) alcança o alocado. Ver pergunta **P3**.

### 2.2. O RASTRO, ponto a ponto (o item 2 do mapa, respondido inteiro)

Cada linha abaixo é uma decisão obrigatória. Nenhuma pode ficar em "a gente vê depois".

**1. `consomePosicao` (`domain/candidatura.ts:132`): MUDA.**
Proposta: parar de listar situações soltas e escrever a régua em duas perguntas separadas, porque elas
**são** duas perguntas:
- `finalizaPosicao(s)`: a posição foi **entregue**? `ALOCADO` e `CONTRATADO`.
- `consomePosicao(s)`: a posição está **tomada**? `APROVADO` mais tudo que finaliza.

A separação não é enfeite: é ela que faz o **cilindro** (entregue) e a **trava 1** (tomada) lerem
números diferentes **da mesma fonte única**, sem inventar contador nenhum. Ver seção 5.1.

**2. `ehSaidaSemExito` (`shared-types:2057`): NÃO MUDA, e isso é a decisão, não a omissão.**
`ALOCADO` não é saída sem êxito. Como `candidaturaViva` é o **complemento exato** dela
(`shared-types:2062`) e `SITUACOES_VIVAS` é derivada por filtro (`candidatura.ts:297`), **`ALOCADO`
nasce VIVA sozinho, sem uma linha de código**. É o fail-closed documentado funcionando na direção certa:
a situação nova nasce **protegida** pela trava de duplicata. É também o motivo de o item 7 ser
obrigatório.

**3. `SITUACOES_DE_SAIDA` (`candidatura.ts:111`): NÃO MUDA.**
Finalizar posição **não é uma saída**: o candidato continua no funil, e é isso que o diretor pediu.
Consequência prática já conferida: `RegistrarSaidaDto` valida
`@IsIn(["DESCARTADO","DESISTIU","CONTRATADO"])` (`candidatos.dto.ts:244`), então **`ALOCADO` não tem
como entrar pela rota de saída**, nem por corpo montado fora da tela. Ele precisa de rota própria
(seção 3.2).

**4. `SITUACOES_TRATADAS` (`candidatura.ts:234`) e `candidaturaTratada`: MUDAM, e é obrigatório.**
`ALOCADO` é tratado: recebeu decisão, e a mais definitiva de todas. Sem esta linha, cada pessoa alocada
vira "pendente de tratamento" e **a vaga não fecha nunca**. Vale registrar que essa falha seria
**barulhenta e imediata** (a trava 5 devolve a lista de pendentes e o modal abre), o que é exatamente o
comportamento que o fail-closed prometeu.

**5. `pendentesDeTratamento` (`candidatura.ts:261`) e `vagaPodeEncerrar` (`candidatura.ts:274`): NÃO
mudam.** Derivam do item 4.

**6. `travaCandidatosPendentes` (`vagas.service.ts:840`): NÃO muda.** Chama `pendentesDeTratamento`, que
já terá a resposta certa. Continua sendo a **trava 5**, e continua sendo a **primeira** do fechamento
(seção 5.5).

**7. O ÍNDICE PARCIAL `uq_as_candidaturas_viva`: MUDA, e é o ponto mais perigoso do plano.**
Predicado real do banco de produção, lido de `pg_indexes` e não do schema:

```
CREATE UNIQUE INDEX uq_as_candidaturas_viva ON public.as_candidaturas
  USING btree (candidato_id, vaga_id)
  WHERE (situacao = ANY (ARRAY['ATIVO'::candidatura_situacao,
                               'APROVADO'::candidatura_situacao,
                               'CONTRATADO'::candidatura_situacao]))
```

Os três valores estão **compilados dentro do índice**. `SITUACOES_VIVAS` alimenta o schema drizzle
(`tables.ts:2694`), mas o índice **já existente no banco** não se atualiza por isso: ele foi criado uma
vez, pela migration `0085`, e é DDL.

**O modo de falha, se ninguém recriar:** a pessoa vira `ALOCADO`, sai da cobertura do índice, e o banco
passa a aceitar uma segunda linha VIVA daquele par pessoa/vaga. O `decidirAlocacao` do service ainda
barraria pela consulta (`candidatura.ts:339`, porque `candidaturaViva("ALOCADO")` é verdadeiro), mas o
service **perde a corrida entre dois cliques**, que é literalmente a única razão de o índice existir
(`tables.ts:2679-2690`). A contagem de posições passaria a mentir, em silêncio, no exato número que a
vaga usa para decidir se cabe mais alguém.

**A migration precisa: `DROP INDEX` e `CREATE UNIQUE INDEX` com os QUATRO valores.**

**8. `movimentoPermitido` e a trava "só ATIVO se move" (`candidatos.service.ts:451`): DECISÃO
PENDENTE.** Ver **P3**. Recomendação: **manter como está**.

**9. AS TRÊS CÓPIAS EM SQL CRU: MUDAM, e são o achado da seção 1.3.**
`candidatos.service.ts:781` e `:633` precisam contar `ALOCADO` junto, e `:277` precisa incluir
`ALOCADO` no `candidaturasAtivas`. **A correção certa não é acrescentar a string nos três lugares**, é
fazer os três lerem a constante do domínio (`SITUACOES_VIVAS` já é exportada; o conjunto de
`consomePosicao` precisa virar constante exportada também, do mesmo jeito). Acrescentar a string à mão
resolve hoje e recria o defeito na próxima situação.

**10. `mudarSituacaoOcupandoPosicao` (`candidatos.service.ts:746`): MUDA a assinatura.**
Hoje é `Extract<CandidaturaSituacao, "APROVADO" | "CONTRATADO">`. Precisa aceitar `ALOCADO`. E, mais
importante: **a finalização de posição TEM de passar por este método**, e não por um caminho novo. É
aqui que mora a **trava 4** (transação, `SELECT ... FOR UPDATE` na linha da vaga, conta depois, decide),
descrita em 30 linhas de comentário em `candidatos.service.ts:494-519`. Um caminho novo que grave
`ALOCADO` fora daqui reabre a corrida entre dois consultores. O comentário do próprio método já avisa:
*"duplicar a sequência lock/conta/decide garantiria que uma das duas cópias perderia a trava"*
(`:741-744`).

**11. `CANDIDATURA_SITUACAO_LABEL` (`shared-types:2035`): MUDA.** `ALOCADO: "Alocado"` (§A.24).
Não compila sem, o que é a rede funcionando.

**12. `tomDaSituacao` (`lib/as-candidatos-visual.ts:24`): MUDA, e o silêncio aqui é traiçoeiro.**
A função termina em `return "wn"` (amarelo, "trabalho em andamento"), então `ALOCADO` **pintaria de
amarelo sem ninguém perceber**, dizendo na tela que uma posição entregue ainda está em andamento.
Precisa de ramo próprio. Recomendação: **`"ok"` (check verde)**, que é o tom de êxito do sistema e o
mesmo de `APROVADO` e `CONTRATADO`.

**13. `kpiDaCandidatura` (`lib/as-candidatos.ts:293`): MUDA, e o silêncio aqui é pior que o do item 12.**
A função trata os desfechos primeiro e depois cai nas cinco etapas. `ALOCADO` **escaparia pelos
desfechos** e seria classificado pela ETAPA, entrando num card de funil VIVO na Central de Candidatos.
O KPI passaria a contar gente entregue como gente em seleção. Precisa de ramo explícito.

**Se `ALOCADO` ganha CARD PRÓPRIO na Central de Candidatos, isso é decisão do diretor (§A.31), não da
fábrica.** Ver **P6**. Recomendação sem card novo por enquanto: cair em `"aprovados"`, que é o card de
"já passou", e propor o card no relatório de entrega.

**14. `AsVagaFechamentoBloqueado` e o `CandidatosPendentesModal`: NÃO mudam**, dado o item 4.

**15. `admissao_id` em `as_candidaturas` (`tables.ts:2668`): NÃO é escrita agora, e continua dormente.**
Ela existe para a ponte futura com a esteira. Registro aqui porque ela é o que dá sentido à distinção
entre `ALOCADO` e `CONTRATADO` (ver **P2**).

### 2.3. A MIGRATION PRECISA SER DOIS ARQUIVOS, e isto foi medido

`ALTER TYPE ... ADD VALUE` acrescenta o valor, mas o Postgres **recusa usá-lo na mesma transação**. O
migrador do drizzle roda cada arquivo de migration dentro de uma transação, então **o `ADD VALUE` e o
`CREATE INDEX ... WHERE ... 'ALOCADO'` não cabem no mesmo arquivo**.

Reproduzido no próprio `ea-db` (PostgreSQL 16.14), com o mesmo formato do índice real:

```
BEGIN;
ALTER TYPE sit ADD VALUE IF NOT EXISTS 'ALOCADO';
DROP INDEX uq;
CREATE UNIQUE INDEX uq ON t (a,b) WHERE situacao IN ('ATIVO','APROVADO','CONTRATADO','ALOCADO');
-->  ERROR:  unsafe use of new value "ALOCADO" of enum type sit
     HINT:   New enum values must be committed before they can be used.
```

**Não é novidade na casa, é o terceiro caso.** As migrations `0059`, `0086` e `0094` já documentam a
mesma armadilha; a `0086` inclusive resolve exatamente assim, empurrando o uso do valor novo para fora
da migration (`drizzle/0086_frente_ifractal.sql:7-11`).

**Forma proposta:**

| arquivo | o que faz | por que sozinho |
|---|---|---|
| `00NN_as_situacao_alocado.sql` | só `ALTER TYPE "public"."candidatura_situacao" ADD VALUE 'ALOCADO';` | o valor precisa **commitar** antes de ser usado |
| `00NN+1_as_indice_vivo_com_alocado.sql` | `DROP INDEX` + `CREATE UNIQUE INDEX` com os quatro valores, mais as colunas do fechamento forçado (seção 5.4) | roda depois do commit anterior |

Detalhes que o `backend` precisa acertar e que custam caro se passarem batido:
- **Posição do valor no enum.** Sem `BEFORE`/`AFTER`, o valor entra no fim. Isso importa porque
  `as/candidatos/page.tsx:340` ordena por `CANDIDATURA_SITUACOES.indexOf(...)`. A ordem do
  `shared-types` e a do enum do Postgres **não precisam** coincidir (nada ordena por enum no SQL, o
  `orderBy` do módulo é por data), mas manter as duas iguais evita a próxima pergunta. Sugestão:
  `ADD VALUE 'ALOCADO' AFTER 'APROVADO'`, que é a ordem da vida da candidatura.
- **`IF NOT EXISTS`** no `ADD VALUE`, como a `0028`, a `0030` e a `0066` já fazem: a migration precisa
  ser re-executável sem explodir.
- **`DROP INDEX` e não `DROP CONSTRAINT`**: é índice, não constraint (conferido no `pg_indexes`).
- **Risco de dado: praticamente nulo.** Produção tem **zero** candidaturas e homologação tem **duas**,
  nenhuma delas `ALOCADO`. O `CREATE UNIQUE INDEX` não tem como falhar por duplicata preexistente.
  Este é o melhor momento possível para mexer nisso, e vale registrar: **depois da importação da onda 3
  o custo seria outro.**

### 2.4. O QUE FICA DORMENTE (o padrão da casa, e ele já foi usado três vezes aqui)

**Nada é apagado.** O padrão está escrito na `0094`: *"os valores que saem da lista OFERECIDA ficam
DORMENTES no banco, do mesmo jeito que a coluna `vagas.centro_custo` já ficou"*.

| item | estado | quem para de escrever | quem ainda lê |
|---|---|---|---|
| `vagas.vagas_fechadas` | **dormente para escrita** | `fechar()` deixa de gravar o número digitado | leitura de LEGADO, seção 5.3 |
| `vagas.vagas_fechadas_banco` | idem | idem | idem |
| `FecharVagaDto.vagasFechadas` / `.vagasFechadasBanco` | **saem do DTO** | a tela deixa de mandar | ninguém |
| `vagasFechadasExcedemPosicoes` (`domain/vaga.ts:83`) | **fica**, muda de insumo | | `excessoDePosicoes` |
| `excessoDePosicoes` (`domain/vaga.ts:131`) | **fica**, muda de dono | `fechar()` deixa de chamar | `editarPosicoes` (seção 1.4) |
| valor `VAGA_BANCO` do enum | continua dormente | já ninguém | `statusVivoDaVaga` traduz |

**Uma recomendação forte sobre o DTO:** tirar os dois campos do `FecharVagaDto` é melhor do que
deixá-los aceitos e ignorados. Campo aceito e ignorado é o que faz alguém montar corpo com ele seis
meses depois e jurar que gravou.

---

## 3. REUSO SEM DUPLICAR LÓGICA

### 3.1. O modal é, em grande parte, CASCA sobre coisa pronta

O mapa acertou em cheio aqui, e o levantamento confirma com uma precisão que vale explicitar: **os
componentes do modal já existem como componentes**, com `token` por propriedade, e não como pedaços
soldados dentro da página da Central de Candidatos.

| o que o modal precisa fazer | o que já existe | é reuso ou é novo |
|---|---|---|
| listar quem está na vaga | `GET /as/candidatos/vaga/:id`, `painelVaga` (`candidatos.service.ts:992`) | **reuso puro** |
| ocupação da vaga | `ocupacaoDaVaga` (`candidatura.ts:164`), já servida no mesmo payload | **reuso puro** |
| alocar existente | `AlocarCandidatoModal.tsx` + `POST /as/candidatos/:id/candidaturas` | **reuso do componente** |
| ciência de reentrada | `ConfirmarReentradaModal.tsx` + o 409 estruturado | **reuso do componente** |
| cadastrar candidato novo | `NovoCandidatoModal.tsx` (2 passos, passo 2 pulável) | **reuso do componente** |
| mover etapa | `MoverCandidaturaModal.tsx` + `PATCH .../etapa` | **reuso do componente** |
| desfechos (descartar, desistiu, contratado) | mesmo modal acima + `POST .../saida` | **reuso do componente** |
| ficha da pessoa | `FichaCandidatoModal.tsx` + `GET /as/candidatos/:id` | **reuso do componente** |
| registrar contato | `RegistrarContatoModal.tsx` | **reuso do componente** |
| trocar vaga (Master) | `TrocarVagaModal.tsx` + `PATCH .../vaga` | **reuso do componente** |
| descritivo da vaga | `VagaResumoModal.tsx` | **reuso, sem ida ao servidor** |
| pesquisar candidato | `POST /as/candidatos/buscar` (com `vagaId` ou `semCandidatura`) | **reuso puro** |
| desvincular | **não existe** | ver 3.2 e **P4** |
| finalizar posição | **não existe** | ver 3.2 |
| trilha da vaga | **não existe** como leitura | ver seção 4 |

**Consequência de desenho, e ela deve estar escrita na OST do `frontend`:** o modal unificado é um
**contêiner de abas** que **compõe** esses componentes, e **não** uma tela que reimplementa o que eles
fazem. Se a implementação começar a copiar o corpo de um deles "porque aqui é um pouco diferente", é
sinal de parar: `VagaResumoModal.tsx:22-27` já registra o preço de clonar (*"criaria uma segunda versão
do descritivo, que envelheceria no primeiro campo novo"*).

**O empilhamento de modais já está resolvido e não precisa de invenção:** `VagaResumoModal.tsx:22-26`
documenta que o `Modal` do sistema é `z-[55]` fixo e que dois irmãos empilham por ordem de DOM. O modal
unificado renderiza os filhos DENTRO dele, e nada de `z-[56]` novo.

### 3.2. O QUE É ROTA NOVA DE VERDADE (a lista é curta, e isso é bom sinal)

**Rota nova 1: FINALIZAR POSIÇÃO.**
`POST /as/candidatos/candidaturas/:id/finalizar-posicao`, no `CandidatosController`, junto das outras
rotas de candidatura de caminho fixo (antes do `:id`, como manda o comentário de ordem em
`candidatos.controller.ts:34-36`).
- **Por que rota própria, e não `registrarSaida` com `situacao: "ALOCADO"`:** porque `ALOCADO` não é
  saída (item 3 da seção 2.2), e o `RegistrarSaidaDto` exige `motivo` obrigatório com `MinLength(2)`
  (`candidatos.dto.ts:258-261`), o que faria toda finalização pedir uma justificativa que não existe.
- **Por dentro, chama `mudarSituacaoOcupandoPosicao`** (item 10 da seção 2.2). Nada de caminho novo.
- **Desfazer:** ver **P5**.

**Rota nova 2: DESVINCULAR.** Ver **P4**: pode não ser rota nenhuma.

**Ampliação de rota existente 1: `POST /as/vagas/:id/fechar`.** Ganha `forcar?: boolean` no DTO, perde
os dois contadores digitados (seção 2.4) e ganha a trava 6 (seção 5.2).

**Ampliação de rota existente 2: `GET /as/vagas`.** A listagem precisa passar a trazer a ocupação
derivada por vaga, senão o cilindro continua lendo `vagas_fechadas` (`as/vagas/page.tsx:220`).

Sobre esta segunda, três coisas importam:
- **UMA consulta agregada, nunca uma por linha.** Um `select vaga_id, situacao, count(*) ... group by`
  sobre `as_candidaturas`, montado em `Map` no Node, no mesmo padrão de `beneficiosPorVaga`
  (`vagas.service.ts:1021`), que já existe justamente para não fazer N+1. O índice
  `idx_as_candidaturas_vaga_situacao` (`tables.ts:2702`) serve essa consulta.
- **`vagas.service.list()` não filtra e não pagina** (`vagas.service.ts:92-113`): traz a tabela inteira
  e a tela filtra em memória (`as/vagas/page.tsx:1341`). Com 3 vagas isso é irrelevante; com as 2.363
  da onda 3 é uma conversa que alguém vai ter. **Não é escopo desta frente**, e registro só para não
  parecer que passou batido.
- **O campo novo no `VagaListItem` é do COORDENADOR** (§A.39, dono único do `shared-types`). O
  `backend` consome, não escreve.

**Rota nova 3: nenhuma para a trilha.** A trilha é derivada do que a listagem já traz (seção 4).

### 3.3. O QUE NÃO PODE SER REESCRITO, EM NENHUMA HIPÓTESE

Escrito como lista porque é isto que o `seguranca` e o `tester` vão conferir:

1. **A régua de ocupação.** Só `ocupacaoDaVaga`. A tela **não** conta candidaturas por conta própria.
2. **As travas 1 a 5.** Elas moram onde moram. O modal **chama**, não reimplementa. Em especial: o modal
   **não** decide se cabe mais um; ele manda e trata o 409.
3. **A régua de quem está vivo.** `candidaturaViva` / `ehSaidaSemExito`, sempre do `shared-types`.
4. **As mensagens de erro.** Vêm do backend, sempre (`lib/as-candidatos.ts:395-402`).
5. **A minimização do §A.6.** Ver seção 6.

---

## 4. A TRILHA DA VAGA: DE ONDE CADA ESTADO É LIDO

### 4.1. São DOIS eixos, e confundi-los é o que produziu o bug 11

O diretor descreveu quatro coisas: *processo seletivo concluído*, *vaga aberta*, *entregue ao ADM*,
*fechada*, mais *"vaga que não vai ao ADM finaliza na A&S"*. Elas não são quatro estados de uma fila:
são **dois eixos independentes**.

**Eixo 1, o PROCESSO SELETIVO (derivado, some sozinho quando a realidade muda):**

| estado | como é LIDO | armazenado? |
|---|---|---|
| Vaga Aberta | `status = 'ABERTA'` **e** `finalizadas < posicoesOficiais` | o status sim, a comparação não |
| Processo Seletivo Concluído | `status = 'ABERTA'` **e** `finalizadas >= posicoesOficiais` | **não**, é derivado |

**Este é o estado que hoje não existe e que resolve o bug 11.** A vaga que entregou todas as posições e
ainda não foi fechada **continua ABERTA** (recebe candidato, aceita correção, a meta ainda é editável) e
**mostra** que o processo acabou. Antes, o único jeito de dizer "acabou" era fechar, e fechar bloqueia.

**Eixo 2, o DESFECHO (marcado à mão, uma vez, no fechamento):**

| estado | como é LIDO | armazenado? |
|---|---|---|
| Entregue Ao ADM | `status IN ('ENTREGUE','FECHADA')` **e** `enviar_para_admissao = true` | **sim**, `vagas.enviar_para_admissao` |
| Finalizada Na A&S | encerrada **e** `enviar_para_admissao = false` | **sim**, a mesma coluna |
| Fechada Sem Entrega | `status = 'FECHADA'` (zero finalizadas) | o status |
| Cancelada | `status = 'CANCELADA'` | o status |

**A coluna já existe e já guarda exatamente isto:** `vagas.enviar_para_admissao`, NOT NULL DEFAULT
false (`tables.ts:2455`), descrita como *"a INTENÇÃO declarada no fechamento, quando o consultor escolhe
finalizar e enviar para admissão"*. **Nada precisa nascer** para distinguir "entregue ao ADM" de
"finaliza na A&S". O que precisa é a tela **ler** e **mostrar** o que já está gravado, coisa que hoje ela
só faz no bloco de fechamento do "Ver Vaga".

**A ressalva honesta, e ela precisa estar na tela:** hoje isso é **uma declaração, não um fato
verificado**. A ponte com a esteira não existe (`as_candidaturas.admissao_id` está dormente,
`tables.ts:2668`), então o EA **não sabe** se a admissão nasceu. O rótulo deve dizer o que é
("Enviada Para Admissão" como intenção registrada), e não fingir confirmação. No dia da ponte, o estado
passa a ser derivável de verdade, e aí ele **melhora sem quebrar**.

### 4.2. O QUE ACONTECE COM `vagas.status`

**Nada muda no vocabulário.** Nenhum status novo, nenhum status removido. O que muda é **QUANDO**
`ENTREGUE` é escrito.

| status | hoje | depois |
|---|---|---|
| RASCUNHO | trilha incompleta | igual |
| ABERTA | vaga viva | **igual, e agora ela ABRANGE o processo concluído e não fechado** |
| ENTREGUE | escrito no `fechar()` com contador digitado > 0 | escrito no `fechar()` com **finalizadas derivadas > 0** |
| FECHADA | fechada com contador zero | fechada com **finalizadas derivadas = 0** |
| CANCELADA | intocada | igual |

A linha que muda é `vagas.service.ts:806`, e ela muda de insumo, não de forma: sai
`(dto.vagasFechadas ?? 0) + (dto.vagasFechadasBanco ?? 0) > 0`, entra a contagem derivada.

### 4.3. `STATUS_QUE_NAO_RECEBEM`: A LISTA NÃO MUDA, E ESSE É O PONTO

O mapa propõe mexer em `STATUS_QUE_NAO_RECEBEM` (`candidatura.ts:213`). **Recomendo NÃO mexer**, e a
razão está na correção 1.1: o defeito nunca foi a lista, foi **fechar ser o único jeito de dizer que uma
posição foi preenchida**. Com "finalizar posição" existindo, `ENTREGUE` volta a significar só
"processo terminado", e a justificativa escrita em `candidatura.ts:205-207` volta a valer inteira:
*"ela é o fechamento BEM-SUCEDIDO... Deixá-la de fora pareceria generoso e permitiria alocar candidato
num processo terminado."*

**Tirar `ENTREGUE` da lista seria trocar um defeito visível por um invisível:** vaga entregue e
encerrada voltaria a receber candidato, e ninguém descobriria até a contagem de um processo passado
mudar sozinha.

**`STATUS_ENCERRADOS` (`as/vagas/page.tsx:330`): NÃO muda.** Ela congela o contador "Dias Em Aberto"
(`page.tsx:350-352`), e a régua continua exata: a vaga com processo concluído e **não fechada** segue
ABERTA, e **deve** continuar contando dias, porque ela ainda não terminou.

**Os SEIS CARDS DE KPI: NÃO mudam.** A conta é feita pelo catálogo `VAGA_STATUS`
(`page.tsx:1421-1427`), sem lista à mão, e a soma dos cinco estados fecha com o Total. Como nenhum
status nasce nem morre, **a soma continua fechando**.

**Se o diretor quiser um KPI de "Processo Seletivo Concluído", isso é card NOVO e é decisão dele
(§A.31).** Ver **P7**. E há um cuidado técnico: esse card **não** é um status, então ele **quebraria** a
propriedade "a soma dos cards de status fecha com o total" se entrasse na mesma linha sem aviso. Ele
precisaria ser um card de recorte, como o "Com Pendências Obrigatórias" da §A.12, e não um sexto status.

---

## 5. FECHAMENTO DERIVADO E FORÇADO DO MASTER

### 5.1. QUEM CALCULA: uma fonte, dois números, e eles não podem discordar

A fonte única é a lista de situações das candidaturas da vaga. Dela saem, na mesma função pura:

| número | régua | para que serve |
|---|---|---|
| `finalizadas` | `ALOCADO` + `CONTRATADO` | **enche o cilindro**; é o "preenchidas" do diretor; é o **gate do fechamento** |
| `ocupadas` | `APROVADO` + `finalizadas` | **trava 1** (cabe mais um?) |
| `emSelecao` | `ATIVO` | o funil vivo |
| `fora` | `DESCARTADO` + `DESISTIU` | nunca soma nem subtrai |

**Por que dois números não é o defeito que o módulo recusou:** o defeito é **guardar** um número que
duplica outro. Aqui os dois são **derivados da mesma leitura, na mesma função, no mesmo instante**, e é
impossível eles discordarem: `finalizadas <= ocupadas` por construção. Guardar qualquer um dos dois é
que seria o defeito, e nenhum é guardado.

**Por que `ocupadas` continua existindo, em vez de "posição só conta quando finalizada":** sem ele, a
trava 1 morre e uma vaga de 10 aceitaria 40 aprovações, cada uma delas dizendo à pessoa "você está
dentro". `APROVADO` é compromisso assumido com alguém; ele **reserva** a posição mesmo antes de a
entrega ser formalizada. Ver **P1**, que é onde este ponto pode ser derrubado pelo diretor.

**Onde a régua mora:** `ocupacaoDaVaga` (`domain/candidatura.ts:164`) ganha o campo `finalizadas` e as
duas perguntas separadas do item 1 da seção 2.2. **Função pura, testável sem banco**, como tudo em
`domain/`.

**Onde ela é servida:** `painelVaga` (`candidatos.service.ts:992`) já devolve o objeto inteiro, e ganha
o campo de graça. `GET /as/vagas` passa a trazer o mesmo objeto por vaga (seção 3.2).

### 5.2. ONDE A TRAVA MORA (a trava 6, nova)

Em `vagas.service.fechar()` (`vagas.service.ts:763`), **depois** da trava 5 e **no lugar** da trava dos
contadores digitados.

```
fechar(id, dto, user):
  1. a vaga existe e está ABERTA                        (já existe, :764-768)
  2. TRAVA 5: todo candidato tratado                    (já existe, :772)
  3. TRAVA 6: finalizadas >= posicoesOficiais           (NOVA)
       não bate  e  não veio `forcar`      -> 409 estruturado, com o que falta
       não bate  e  veio `forcar`  e COMUM -> 403
       não bate  e  veio `forcar`  e MASTER/SUPER_ADMIN -> passa, e GRAVA A TRILHA
  4. grava status ENTREGUE / FECHADA a partir das FINALIZADAS derivadas
```

**Duas exigências de implementação que não são detalhe:**

**(a) `fechar()` precisa virar TRANSAÇÃO com `SELECT ... FOR UPDATE` na linha da vaga.** Hoje ele não é
transacional: lê a vaga (`:764`), confere (`:766`), conta (`:772`) e grava (`:788`), tudo solto. Enquanto
o número vinha digitado isso não tinha corrida a perder. Passando a **decidir a partir de uma contagem
de candidaturas**, ele tem: um consultor finaliza a última posição no exato instante em que outro
fecha, e o fechamento decide sobre uma fotografia antiga. É o mesmo defeito descrito em
`candidatos.service.ts:500-503` (*"uma consulta solta antes do insert não resolve: ela responde sobre o
passado"*), e o remédio é o mesmo e já está escrito na casa: **travar a linha da vaga, depois contar**.
A vaga é o recurso disputado nos dois casos, então o lock é o mesmo e eles se enxergam.

**(b) A autorização do `forcar` NÃO pode ser `@Roles` no handler.** Todo consultor precisa poder fechar
uma vaga completa; só o **forçar** é de Master. Então `@Roles("MASTER","SUPER_ADMIN")` na rota
**barraria o fechamento normal do COMUM**, que é regressão silenciosa.

**O padrão certo já existe na casa, e é idêntico em forma:** `esteira.service.ts:1138-1155`, a liberação
de Apto sem ASO. Ali o service recebe o `user`, e:
- **COMUM** recebe trava dura, com `needsConfirmation: false`, e **sem** opção de forçar;
- **MASTER / SUPER_ADMIN** recebem `needsConfirmation: true` e, confirmando, a exceção é
  **registrada em nome deles**.

É exatamente a forma pedida aqui. O `fechar()` passa a receber `user: AuthUser` (que já traz `papel`,
`auth.types.ts`), como o `create` já recebe `user.id` (`vagas.controller.ts:41`).

**A tela esconder o botão é conveniência; o guard é a autoridade.** Mesma frase que
`candidatos.controller.ts:103-105` já usa.

### 5.3. `vagas_fechadas`, `vagas_fechadas_banco` E `excessoDePosicoes`

**As colunas ficam, dormentes para escrita** (seção 2.4). Mas há um caso que o mapa não cobre e que
**aparece na primeira tela que o diretor abrir**, então precisa de decisão:

**As vagas encerradas ANTES da virada não têm candidatura nenhuma.** Conferido em homologação: a vaga
FECHADA tem `vagas_fechadas = 2` e **zero** candidaturas; a ENTREGUE tem `vagas_fechadas = 1`,
`vagas_fechadas_banco = 1` e **zero** candidaturas. Trocar o cilindro pela derivada pura faz essas
linhas exibirem **0 de 2** e **0 de 3**. E a onda 3, quando entrar, traz ~2.363 vagas históricas que
**nunca** terão candidatura: elas todas mostrariam zero.

**Recomendação (é a pergunta P8, mas com uma recomendação forte):** a derivada é a fonte única para
**tudo que o sistema DECIDE** (trava 1, trava 6, gate do fechamento, status, KPI). Para o que o sistema
**MOSTRA**, a função `preenchidas` (`as/vagas/page.tsx:219`) prefere a derivada e **só cai** no carimbo
histórico quando a vaga está **encerrada** e tem **zero candidaturas**, ou seja, quando ela é
comprovadamente anterior à alocação. Isso não é uma segunda fonte da verdade: é a leitura de um dado
histórico onde a fonte viva **não existe**, e é o que evita apagar da tela a história de duas mil vagas.

O comentário que já está em `page.tsx:200-217` **antecipou exatamente esta virada** e escreveu a ordem
de preferência ("ocupação real primeiro, contagem de fechamento depois"). O que este desenho acrescenta
é o recorte que torna a segunda leitura inequívoca: **só para encerrada e sem candidatura**.

**`excessoDePosicoes` fica e muda de dono** (seção 1.4): sai do `fechar()`, continua no
`editarPosicoes()`, comparando a meta nova com as **finalizadas derivadas**. A frase de erro
(`vagas.service.ts:738`) precisa mudar junto, porque hoje ela fala de "vagas fechadas", que vai deixar
de ser um conceito da tela.

### 5.4. A TRILHA DO FECHAMENTO FORÇADO

**Três colunas em `vagas`**, escritas só no forçado:

| coluna | tipo | o que guarda |
|---|---|---|
| `fechamento_forcado_por_id` | `uuid`, FK `usuarios`, `ON DELETE SET NULL` | quem forçou |
| `fechamento_forcado_em` | `timestamptz` | quando |
| `fechamento_forcado_faltavam` | `integer` | quantas posições faltavam **no instante do forçamento** |

**Por que colunas e não tabela de evento:** o forçamento acontece **no máximo uma vez por vaga** (a vaga
só fecha uma vez, `vagas.service.ts:766`). Uma tabela teria no máximo uma linha por vaga, com uma FK
para chegar nela, e o dado do fechamento (`data_fechamento`, `salario_fechamento`,
`enviar_para_admissao`) já mora na própria vaga. O `passagem_aceites`, que seria o candidato natural a
reuso, **não serve**: ele tem FK NOT NULL para `admissoes` e `frentes_admissao`, e vaga não é admissão.

**Por que `faltavam` é gravado, e não recalculado depois:** porque ele é a **razão da exceção**, e ela é
verdadeira **naquele instante**. Recalculado seis meses depois, o número muda (alguém pode ter sido
descartado, a meta pode ter mudado) e a trilha passa a contar uma história diferente da que aconteceu.
Este é o único caso do desenho inteiro em que **guardar** um número derivado é o certo, e a distinção é
clara: aqui ele é um **carimbo histórico de um fato**, não um contador vivo.

**Onde a trilha aparece:** no bloco de trilha do modal unificado e no "Ver Vaga", com uma frase que diz
quem, quando e quantas faltavam. Sem travessão (§A.11).

**§A.6:** nome de usuário interno, data e um número. Nenhum dado de candidato. O consultor forçado
**não** é nomeado, e nem precisa: quem faltou é derivável a qualquer momento.

### 5.5. INTERAÇÃO COM A TRAVA 5 (`travaCandidatosPendentes`)

**A ordem é: trava 5 primeiro, trava 6 depois.** E ela é a mesma que `vagas.service.ts:756-761` já
justifica: *"A 5 vem primeiro porque ela fala do PROCESSO (tem gente pendurada no funil), enquanto a
outra fala dos NÚMEROS."*

**As duas não são a mesma pergunta, e é importante que ninguém as funda:**
- **Trava 5:** *sobrou alguém sem decisão?* Bloqueio **duro**, `needsConfirmation: false`. **Não tem
  forçar**, nem para Master, e isso **não muda**: a vaga não pode fechar deixando alguém que foi
  entrevistado sem nunca saber o resultado. Master forçar aqui seria autorizar o silêncio com uma pessoa.
- **Trava 6:** *a vaga entregou o que prometeu?* Bloqueio **com aceite de Master**. Aqui forçar faz
  sentido: o cliente desistiu de duas das cinco posições, e a vaga precisa encerrar mesmo assim.

**A interação prática é boa:** limpar a trava 5 (tratando cada pendente) **não** ajuda a passar na trava
6, porque descartar quem sobrou não finaliza posição nenhuma. E passar na 6 não dispensa a 5. Elas são
independentes, e o consultor as encontra na ordem em que consegue resolvê-las.

**Um efeito colateral que precisa ser desenhado, não descoberto:** o `CandidatosPendentesModal`
(`components/as/vagas/CandidatosPendentesModal.tsx`) nasce do 409 da trava 5 e oferece quatro ações
(`Acao = "APROVAR" | "CONTRATADO" | "DESCARTADO" | "DESISTIU"`, linha 51). Com "finalizar posição"
existindo, **tratar alguém ali pode ser justamente finalizar a posição dele**. Se a ação nova não for
oferecida nesse modal, o consultor sai dele, vai ao modal unificado, finaliza, e volta. **Recomendação:
oferecer a ação também ali**, na mesma OST, porque a alternativa é entregar um caminho que obriga a
sair da tela no meio da tarefa. Registro como proposta (§A.31), não como escopo assumido: ver **P9**.

---

## 6. RBAC E §A.6

### 6.1. O modal lê a controller de outro menu (ponto 5 do mapa, refinado pela correção 1.2)

**O problema, com a forma exata:** um **COMUM** com `as-vagas` e sem `as-candidatos` abre o modal
unificado e recebe **403 com a mensagem de outro menu**. MASTER na área AS passa. SUPER_ADMIN passa.
Hoje ninguém vê porque só o SUPER_ADMIN tem os menus (§A.23).

**E o modal unificado PIORA o problema**, porque ele não faz uma chamada, faz muitas: painel da vaga,
busca, alocação, mover etapa, saída, ficha, contato. **Toda** a operação central da tela nova depende de
uma controller que o menu da tela **não** reivindica.

**As quatro saídas possíveis, e o que cada uma custa:**

| # | saída | custo |
|---|---|---|
| A | `as-vagas` reivindica também `CandidatosController.*` | **quebra a segmentação**: quem tem só a Central de Candidatos perde nada, mas quem tem só a Central de Vagas ganha a base inteira de dado pessoal pela URL da API. É conceder acesso por efeito colateral, e a §A.23 nasceu de um caso assim |
| B | duplicar as leituras dentro do `VagasController` | duas superfícies para o mesmo dado, cada uma com a sua §A.6 para manter. É o erro que `candidatos.controller.ts:25-27` já recusou por escrito |
| C | reivindicar **operação a operação**, e não a controller inteira | o `menuDaOperacao` já resolve por `Controller.handler`, então dá para `as-vagas` reivindicar só o `painelVaga`. Mas hoje `as-candidatos` reivindica `CandidatosController.*`, e **duas reivindicações da mesma operação** é ambiguidade que o `menuDaOperacao` não foi feito para arbitrar. Precisaria de investigação própria |
| D | **exigir os DOIS menus** para quem usa o modal unificado, e dizer isso | nada de código no backend. É decisão do diretor sobre quem enxerga o quê (§A.23), que é exatamente de quem essa decisão é |

**RECOMENDAÇÃO: D, com uma peça de código pequena e honesta.** A tela unificada de vagas **é** uma tela
das duas centrais: ela gerencia candidatos. Que ela exija os dois menus não é limitação, é a descrição
do que ela faz. O que **não** pode acontecer é o usuário descobrir isso por uma mensagem de erro de
permissão no meio de um modal.

**A peça de código:** o modal, ao montar, sabe se o usuário tem o menu `as-candidatos` (o
`/auth/me` já devolve os menus do usuário, é o que desenha a barra lateral) e, **não tendo**, mostra um
aviso curto e claro no lugar da aba, dizendo que a gestão de candidatos exige a liberação do menu
Central De Candidatos, e que o pedido é ao administrador. **Isso é aviso, não permissão**: quem garante
continua sendo o `MenuGuard`, exatamente onde ele está.

**Por que NÃO alargar a área da controller:** é a mesma decisão que `vagas.service.ts:203-211` já tomou
e escreveu, para o mesmo tipo de problema (os seletores que vieram do `/catalogos`): *"alargar a área
de uma controller da Admissão para resolver um seletor de A&S é mexer no teto de acesso de outra frente
(§A.26)"*. O caso aqui é o inverso em direção e idêntico em natureza.

**Este ponto é alvo direto do `seguranca` (§A.38), e o veredito dele deve ser explícito sobre a saída
escolhida.**

### 6.2. §A.6: o CPF (ponto 6 do mapa)

**A regra, e ela não afrouxa em nada:** o modal unificado **nunca** traz CPF para a lista. Nem para
enriquecer coluna, nem para "facilitar a busca", nem para deduplicar visualmente.

O que sustenta isso hoje, e continua sustentando:
- `painelVaga` **não seleciona** CPF, mesmo tendo a tabela no join, e diz isso por escrito
  (`candidatos.service.ts:1029-1031`).
- `buscar` devolve `temCpf`, um booleano (`candidatos.service.ts:272`), e a justificativa está em
  `candidatos.service.ts:194-203`.
- `travaCandidatosPendentes` também não seleciona CPF (`vagas.service.ts:837`).
- A ficha é o **único** lugar em que o número sai (`candidatos.service.ts:296`), uma pessoa por vez e
  por clique deliberado.
- O `CandidatosDaVagaModal.tsx:18-22` documenta a escolha e **por quê**: hidratar a lista com fichas
  traria o CPF da vaga inteira para o navegador.

**As quatro tentações que o modal unificado cria, e que precisam ser barradas na revisão:**
1. **"Coluna CPF na lista de candidatos da vaga"**, para conferir duplicata de relance. **Não.** O
   `temCpf` responde a pergunta legítima; o número não é preciso para nenhuma decisão daquela lista.
2. **"Pré-carregar as fichas das N pessoas"**, para o clique abrir instantâneo. **Não.** Desfaz a
   minimização inteira em uma linha.
3. **"Buscar por CPF parcial"** dentro do modal. **Não.** É vazamento por sondagem, e já está recusado
   em `candidatos.service.ts:200-203`.
4. **CPF na URL do modal** (`?candidato=...&cpf=...`), para o modal ser linkável. **Não.** Query string
   aparece em log de proxy, em histórico e no `Referer` (`lib/as-candidatos.ts:3-8`). O modal pode ser
   linkável **pelo id**, nunca pelo CPF.

**O cadastro de candidato novo DENTRO do modal** usa `NovoCandidatoModal`, que já faz o dedup por CPF
pelo caminho certo: o número viaja no **corpo** do `POST /as/candidatos`, e o 409 devolve **id e nome**
de quem já existe, **nunca o número** (`candidatos.service.ts:1093-1103`). **Reusar o componente é o que
mantém a régua**; reescrever o formulário dentro do modal é como ela se perde.

**Um item novo para o `seguranca` olhar:** `as_candidatos.anonimizado_em` (`tables.ts:2586`) é o
expurgo por retenção. Uma pessoa **anonimizada** pode continuar aparecendo na lista da vaga, porque a
linha não é apagada de propósito. O modal precisa lidar com isso sem parecer defeito. Ver **P10**.

---

## 7. ORDEM DE CONSTRUÇÃO

Sete etapas. **Cada uma é entregável e validável sozinha na 3120** (§A.32), e cada uma diz o que
destrava. A ordem não é negociável em um ponto: **a 1 vem antes de tudo**, porque ela é o vocabulário.

### Etapa 0. VOCABULÁRIO no `shared-types` (**coordenador**, §A.39)

Dono único do arquivo compartilhado. Entra: `ALOCADO` em `CANDIDATURA_SITUACOES`, o rótulo em
`CANDIDATURA_SITUACAO_LABEL`, o campo `finalizadas` em `AsOcupacaoVaga`, o campo de ocupação em
`VagaListItem` e os campos da trilha do forçado.
**Destrava:** as etapas 1 e 2 podem ser construídas em paralelo, cada uma na sua camada.
**Validação:** typecheck verde nos três pacotes. Não tem tela.

### Etapa 1. A RÉGUA E A MIGRATION (**backend**)

`domain/candidatura.ts` (as duas perguntas separadas, `SITUACOES_TRATADAS`), as **duas** migrations
(seção 2.3), a recriação do índice, as **três** cópias em SQL cru (seção 1.3, item 9), a assinatura de
`mudarSituacaoOcupandoPosicao`, e `ocupacaoDaVaga` com `finalizadas`.
**Não tem tela e não muda comportamento nenhum**: nada escreve `ALOCADO` ainda.
**Destrava:** tudo.
**Validação:** testes de domínio verdes, `pnpm migrate` aplicado nos dois bancos, e o predicado do
índice conferido de novo por `pg_indexes` (a prova é o `SELECT`, não a intenção da migration).
**`seguranca` entra aqui (1ª de 2, §A.38):** a régua de duplicata é a que protege a contagem.

### Etapa 2. FINALIZAR POSIÇÃO, backend (**backend**)

A rota nova (seção 3.2), a ocupação derivada no `GET /as/vagas`, e o `painelVaga` já servindo
`finalizadas`.
**Destrava:** o cilindro derivado e o gate do fechamento.
**Validação:** por chamada direta (curl com sessão) e pelo cilindro da etapa 3.

### Etapa 3. O CILINDRO PASSA A LER A DERIVADA (**frontend**)

Só `preenchidas` (`as/vagas/page.tsx:219`) e o `contado` das duas chamadas (`:1872`, `:1878`), com o
recorte de legado da seção 5.3.
**Entrega pequena e altamente visível**, e é a primeira coisa que o diretor consegue julgar na tela.
**Destrava:** a confiança no número, que é pré-requisito para o gate do fechamento fazer sentido.
**Validação:** §A.13 e §A.20 (a coluna Posições já tem 14% de largura e dois cilindros; medir).

### Etapa 4. O MODAL UNIFICADO, casca e leitura (**frontend**)

O modal premium sobre o "Ver Vaga", com a trilha (seção 4), as abas "Ver Candidatos" e "Ver Candidatos
Alocados", e **só leitura** mais os componentes já prontos de mover, ficha e contato.
**Sem ação nova nenhuma.** É o maior pedaço visual e o mais fácil de validar isolado.
**Destrava:** o lugar onde as ações da etapa 5 vão morar.
**Validação:** §A.13, §A.12, §A.20, §A.24, §A.29 e §A.35 (nenhum `<select>` cru).

### Etapa 5. AS AÇÕES NO MODAL (**frontend**)

Finalizar posição, alocar existente, cadastrar novo, desvincular (conforme **P4**), pesquisar.
**Destrava:** a operação de verdade.
**Validação:** §A.13, com um caso ponta a ponta na 3120.

### Etapa 6. O FECHAMENTO DERIVADO E FORÇADO (**backend** e depois **frontend**)

A trava 6, o `fechar()` transacional com `FOR UPDATE`, o `forcar` de Master com trilha, o `FecharVagaDto`
sem os contadores, o `excessoDePosicoes` mudando de insumo no `editarPosicoes`, e o formulário de
fechamento perdendo os dois campos digitados.
**É a etapa que MAIS alcança código validado (§A.26)**, e por isso vem por último: quando ela entrar,
tudo o que ela depende já está no ar e validado.
**Validação:** §A.13, mais os três caminhos (fecha completa, é barrada incompleta, Master força).

### Etapa 7. AUDITORIA (§A.38, §A.39 passo 5)

**`seguranca` (2ª de 2, e é a que veta):** o alcance é CPF, dado pessoal e RBAC, então o gatilho é
temático e obrigatório. Alvos nomeados: a seção 6.1 (a saída escolhida para o modal que lê outra
controller), a seção 6.2 inteira (as quatro tentações), o `forcar` (autorização por papel dentro do
service, e não por `@Roles` na rota), e a trilha do forçado (§A.6: sem PII).
**`tester` independente, que não escreveu o código:** a régua de §A.38 é que teste do autor pega
regressão bem e mal-entendido de requisito mal. Gaps que ele deve procurar de propósito:
- as **três cópias em SQL cru** contam `ALOCADO`? (o teste de domínio passa sem que elas contem)
- o índice parcial **do banco** cobre `ALOCADO`? (o teste de unidade não olha o banco)
- `kpiDaCandidatura` e `tomDaSituacao` têm ramo próprio, ou caíram no fallback?
- a **trava 5 continua sem forçar** depois de a trava 6 ganhar o `forcar`?
- **vaga encerrada antes da virada** ainda mostra a contagem histórica?
- duas finalizações simultâneas na última posição: a segunda é recusada?

**O `devops` não entra nesta frente.** Não há Docker, CI, gate nem serviço novo. **O `ia` também não.**
Registro porque a §A.38 exige dizer quem **não** trabalhou, e por quê.

---

## 8. PERGUNTAS EM ABERTO, COM RECOMENDAÇÃO

> Nenhuma pergunta sem opinião. As marcadas **BLOQUEIA** não têm resposta segura por dedução, e
> construir sem elas é apostar.

### P1. **BLOQUEIA.** O CONTADOR DE BANCO participa do fechamento?

`ocupacaoDaVaga` só conhece `posicoesOficiais` (`candidatura.ts:164`). A vaga tem **duas** metas:
`posicoes_oficiais` e `posicoes_banco` (`tables.ts:2290-2292`), e o banco **não tem derivada nenhuma
hoje**. A decisão do diretor diz *"a vaga só FECHA quando TODAS as posições forem finalizadas"*, e
"todas" precisa de um recorte.

**Isto não é hipótese:** homologação tem uma vaga real com **5 posições oficiais e 20 de banco**. Se o
banco contar, ela precisa de **25 finalizações** para fechar.

**Recomendação:** o gate do fechamento e o cilindro oficial olham **só o lado OFICIAL**. O banco é
**reserva**, não entrega, e exigir que a reserva seja preenchida para fechar inverteria o significado
dele. O cilindro de banco continua desenhado (é informação), lendo o carimbo histórico pela régua da
seção 5.3, e ganha derivada própria só no dia em que o diretor pedir a finalização com lado.
**Se o diretor disser que o banco participa**, a forma é uma coluna `posicao_lado` em `as_candidaturas`
(`OFICIAL` / `BANCO`), preenchida na finalização, e `ocupacaoDaVaga` passa a devolver os dois lados.
É construível, mas é escopo maior e muda a rota da etapa 2.

### P2. **BLOQUEIA.** `ALOCADO` e `CONTRATADO` significam a mesma coisa?

Hoje `CONTRATADO` é uma **saída** (`SITUACOES_DE_SAIDA`, `candidatura.ts:111`) que **consome posição**, e
o comentário chama isso de *"a saída diferente das outras"*. `ALOCADO` chega dizendo exatamente
"posição entregue com o candidato X". **São dois nomes para o mesmo fato**, e vocabulário duplicado é
como uma tela começa a contar duas vezes.

**Recomendação, e ela usa uma peça que já existe:**
- **`ALOCADO`** = a posição foi entregue **na A&S**. O candidato continua no funil, a vaga conta
  preenchida. É o estado que a operação de A&S produz.
- **`CONTRATADO`** = virou **admissão de verdade**, na esteira. É o estado que a ponte futura vai
  escrever, e `as_candidaturas.admissao_id` já existe dormente para isso (`tables.ts:2668`).

Assim `finalizaPosicao` cobre os dois, o número não muda, e `CONTRATADO` deixa de ser oferecido como
ação manual quando a ponte existir. **Enquanto a ponte não existe**, os dois continuam oferecidos, e a
tela precisa dizer a diferença em uma frase, senão o consultor escolhe no chute.
**Alternativa que eu não recomendo:** aposentar `ALOCADO` e usar `CONTRATADO` para tudo. Ela evita o
valor novo inteiro, mas conflita com o pedido explícito ("marcado como ALOCADO") e com "continua no
funil", já que `CONTRATADO` é saída.

### P3. O candidato ALOCADO ainda pode ser MOVIDO de etapa?

`moverEtapa` recusa qualquer situação que não seja `ATIVO` (`candidatos.service.ts:451`), e essa trava é
descrita como *"a que protege a contagem de posições da vaga"* (`:438-440`). "Continua no funil" pode
significar duas coisas: **(a)** continua visível e não some da lista, ou **(b)** continua movível entre
etapas.

**Recomendação: (a), e manter a trava como está.** Mover de etapa alguém cuja posição já foi entregue
não descreve nada que aconteça na vida real, e afrouxar a trava mexe na única coisa que hoje garante que
liberar o funil (decisão de 27/08) não desfaz aprovação nenhuma. Nenhuma linha de `moverEtapa` muda.

### P4. DESVINCULAR: o que ela é, exatamente?

O diretor pediu "desvincular" entre as ações do modal. Existem **três** coisas diferentes que podem ser
chamadas assim, e elas não são intercambiáveis:

| leitura | o que faz | já existe? |
|---|---|---|
| **apagar a candidatura** | some do banco | **não**, e eu **desaconselho**: leva junto o histórico de etapas e de contato, e é irreversível |
| **encerrar a candidatura** | vira `DESCARTADO` ou `DESISTIU`, com motivo | **sim**: `POST .../saida` |
| **desfazer a finalização** | volta de `ALOCADO` para `APROVADO`, liberando a posição | **não**, ver **P5** |

**Recomendação: "desvincular" é a segunda**, e **não é rota nova**: é o `registrarSaida` que já existe,
com um rótulo que o consultor entenda. Se for a primeira, é decisão de destruição de histórico e precisa
do diretor por escrito.

### P5. Dá para DESFAZER uma finalização de posição?

Vai acontecer: alguém finaliza a posição com a pessoa errada, ou a pessoa desiste depois de entregue.
Sem desfazer, a posição fica presa e o único caminho é aumentar a meta, que é mentira gravada.

**Recomendação: sim, e pelo caminho mais barato.** `ALOCADO` volta para `APROVADO` pela mesma rota de
finalização, com um `desfazer: true`, passando pela **mesma** `mudarSituacaoOcupandoPosicao` (que já
recusa mudar para a situação em que já se está, `:757`). O evento entra no histórico como qualquer outro
desfecho, então **quem desfez e quando** fica gravado sem tabela nova. **Quem pode desfazer** é
pergunta do diretor: recomendo **qualquer consultor**, porque corrigir o próprio erro na hora é melhor
do que esperar um Master, e a trilha registra.

### P6. `ALOCADO` ganha CARD PRÓPRIO na Central de Candidatos?

`kpiDaCandidatura` precisa de ramo (seção 2.2, item 13). A pergunta é se ele cai em `"aprovados"` ou se
nasce um card "Alocados".
**Recomendação: PROPOR o card e não construir** (§A.31). Enquanto o diretor não decide, cai em
`"aprovados"`, que é semanticamente o mais próximo. **Cuidado técnico:** a Central de Candidatos tem a
mesma propriedade de "a soma dos cards fecha com o total", então um card novo é mudança de layout, não
uma linha.

### P7. A trilha ganha um KPI "Processo Seletivo Concluído" na Central de Vagas?

**Recomendação: PROPOR e não construir** (§A.31). E, se o diretor quiser, ele **não** é o sexto status:
é um card de recorte, como o "Com Pendências Obrigatórias" da §A.12, senão quebra a soma dos seis cards
(`as/vagas/page.tsx:1409-1418`).

### P8. A leitura de LEGADO do cilindro é aceitável?

Seção 5.3. **Recomendação: sim, com o recorte estreito** (encerrada **e** sem candidatura nenhuma). O
custo de não ter: as ~2.363 vagas da onda 3 e as duas de homologação mostram zero preenchidas para
sempre. O custo de ter: uma linha de fallback documentada. **Se o diretor preferir a pureza absoluta**
("uma fonte só, sem exceção"), o desenho funciona igual, e a consequência precisa estar dita antes, não
descoberta na tela.

### P9. A ação "finalizar posição" aparece também no `CandidatosPendentesModal`?

Seção 5.5. **Recomendação: sim, na mesma OST.** Sem ela, o modal da trava 5 oferece quatro caminhos e
esconde justamente o quinto, que costuma ser o certo, e o consultor precisa sair da tela no meio da
tarefa. **É acréscimo, então é proposta, não escopo assumido.**

### P10. O que o modal mostra de uma pessoa ANONIMIZADA?

`as_candidatos.anonimizado_em` (`tables.ts:2586`) marca quem teve os identificadores diretos expurgados
por retenção; a linha **fica**, de propósito, para o histórico da vaga não sumir. Uma pessoa assim pode
aparecer na lista de candidatos da vaga.
**Recomendação:** a lista continua mostrando o nome (que não é expurgado) e a ficha, ao ser aberta,
exibe o estado com uma frase, em vez de campos vazios que parecem defeito. **Não constrói nada novo:**
`AsCandidatoFicha` já devolve `anonimizadoEm` (`shared-types`), e é só a tela ler. Registro porque isso
é §A.6 e o `seguranca` vai perguntar.

---

## RESUMO EM UMA PÁGINA

- **`ALOCADO` entra como valor do enum `candidatura_situacao`**, e não como coluna nem como tabela,
  porque as réguas do módulo já foram escritas fail-closed esperando exatamente isso.
- **A migration são DOIS arquivos**, medido no Postgres 16.14: `ADD VALUE` commita, e só depois o índice
  parcial `uq_as_candidaturas_viva` é recriado com os quatro valores. **Esquecer o índice é o erro mais
  caro do plano**, e ele não faz barulho nenhum quando acontece.
- **O conjunto "quem consome posição" está escrito quatro vezes**, três delas em SQL cru dentro do
  service. Elas precisam passar a ler a constante do domínio, e não ganhar mais uma string.
- **O modal é casca sobre coisa pronta.** Duas rotas novas de verdade (finalizar posição e o `forcar`
  do fechamento), mais a ocupação derivada na listagem de vagas. Todo o resto já existe como componente.
- **`ENTREGUE` não sai de `STATUS_QUE_NAO_RECEBEM`.** O bug 11 é consertado pela existência do
  "finalizar posição", não por afrouxar a lista.
- **"Entregue Ao ADM" e "Finaliza Na A&S" já estão gravados**, em `vagas.enviar_para_admissao`. Falta a
  tela ler.
- **O fechamento vira transacional com `FOR UPDATE`**, senão a decisão passa a ser tomada sobre uma
  fotografia antiga, que é o defeito que a trava 4 do módulo existe para impedir.
- **O `forcar` é autorizado dentro do service, por papel**, e não por `@Roles` na rota, senão o
  fechamento normal do consultor COMUM quebra em silêncio. O padrão já existe em
  `esteira.service.ts:1138`.
- **Duas perguntas BLOQUEIAM:** o lado de banco no fechamento (**P1**) e a distinção entre `ALOCADO` e
  `CONTRATADO` (**P2**).
