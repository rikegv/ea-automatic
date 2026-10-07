# Mapa de alcance: fechar os 6 testes do dedup, e a cota de pagina do Digai

Medido em 02/10/2026 contra a producao e contra os logs do `ea-backend`. Investigacao do
coordenador ANTES do despacho (§A.39 passo 1, §A.40 regra 1). Nada construido aqui.

## PARTE 1: os 6 testes vermelhos do dedup por e-mail

`npx vitest run src/as/digai/digai-dedup-email.backend.spec.ts
src/as/digai/digai-dedup-email-fail-closed.tester.spec.ts` devolve **6 vermelhos de 29**.
Medido: **5 deles sao UM defeito, e o 6o e uma DISCORDANCIA REAL** entre o codigo e o teste.

### Defeito A (5 testes): o banco fingido esta DEFASADO da projecao

`candidatoPorEmail` (`digai-repositorio.ts:173`) evoluiu na emenda E-7 e hoje projeta **tres
coisas**:

```sql
select id,
       count(*) over () as total,
       (${doc}::text is null or cpf is null or cpf = ${doc}) as passa_guarda
  from as_candidatos
 where lower(btrim(email)) = ${limpo} and anonimizado_em is null
 limit 2
```

O codigo le `primeira.total` e `primeira.passa_guarda`. **Os bancos fingidos dos dois specs
devolvem `[{ id: "bbbb" }]`**, sem `total` e sem `passa_guarda`. Entao `inteiroDoBanco(undefined)`
cai no ramo da ambiguidade e o metodo devolve `{ ambiguo: true }` onde o teste espera
`{ id: "bbbb" }`.

**O codigo esta certo e o fingido esta velho.** O conserto e no FINGIDO, nao na regra: ele passa a
devolver `[{ id: "bbbb", total: 1, passa_guarda: true }]`, e os casos de ambiguidade passam a
devolver `total: 2`. **NAO relaxar a regra para o fingido passar**: a abstencao por ambiguidade e
guarda da auditoria e fundir pessoa errada e irreversivel.

Os 5: `digai-dedup-email.backend.spec.ts` ("CPF invalido no registro nao vira filtro", "uma linha
so continua devolvendo a ficha") e `digai-dedup-email-fail-closed.tester.spec.ts` ("e-mail VALIDO
consulta `as_candidatos`", "o espaco em volta e a caixa nao decidem"), mais o de baixo.

### Defeito B (1 teste): a assercao de §A.6 virou ESTREITA DEMAIS

`digai-dedup-email.backend.spec.ts:84` exige que o SQL comece com
`select id from as_candidatos`. Com a emenda E-7 ele comeca com
`select id, count(*) over () as total, (...) as passa_guarda from as_candidatos`, entao **a
assercao reprova o proprio desenho que a auditoria pediu**.

**O que ela EXISTE para proteger continua valido e tem de continuar travado:** o `cpf` da outra
pessoa **nao e trazido como coluna** para a memoria do processo; ele e comparado DENTRO do SQL e o
que sai e um booleano. **Reescrever a assercao para medir isso**, e nao a forma literal do
`select`: a projecao traz `id`, um total e um booleano, e **nao** traz `cpf` como coluna de
retorno. Afrouxar para "contem select id" nao serve, porque deixaria passar `select id, cpf`.

### Defeito C (o 6o teste): DISCORDANCIA REAL, e e decisao, nao conserto

`digai-dedup-email.backend.spec.ts:286` ("a ambiguidade NAO e engolida: vira conflito ancorado na
ficha do CPF") espera `registrarConflito` chamado **1** vez. O codigo chama **0**.

**Nao e esquecimento: o codigo recusa de proposito, com razao escrita**
(`digai-importacao.service.ts`, bloco acima da linha 507): `as_ingestao_conflitos` tem
`UNIQUE (fonte, identificador)`, **nao tem coluna de motivo**, e `registrarConflito` grava com
`on conflict do nothing`. Gravar a ambiguidade **gasta a chave daquele `userId`**, e um conflito
identidade-contra-documento REAL do mesmo `userId`, no ciclo seguinte, seria engolido em silencio.

**DECISAO DO COORDENADOR, e ela vai ao diretor no pulso:** a ambiguidade **PASSA a registrar o
conflito**, com o `userId` puro, como o teste exige. Razoes:
1. e a guarda que a auditoria exigiu e que o diretor reafirmou nesta OST, nas palavras dele:
   "e-mail ambiguo vira conflito";
2. sem coluna de motivo, a linha de conflito significa apenas **"um humano olhe este `userId`"**.
   Se a ambiguidade ja pos o `userId` na fila de revisao, o conflito posterior do MESMO `userId`
   nao precisa de uma segunda linha para que alguem olhe;
3. o preco (perder a distincao de motivo entre dois conflitos do mesmo `userId`) e **menor** que o
   preco de a ambiguidade ficar so em log, que e ninguem olhar.

**O que NAO se faz:** sufixar o identificador (`${userId}:email-ambiguo`) para nao gastar a chave.
Foi considerado e recusado nesta rodada porque muda o formato do identificador, que e consumido
pela fila de revisao, e isso e alcance fora desta OST (§A.14).

**O comentario do codigo tem de ser REESCRITO**, nao apagado: ele passa a registrar a troca de
decisao e o preco assumido, para a proxima sessao nao reverter por achar que foi descuido.

## PARTE 2: a cota de pagina do Digai. O TETO NAO E A CAUSA

**Medido nos logs de hoje: 33 screenings distintos foram CORTADOS.** Amostra, com o orcamento
concedido, o que foi lido e o total do screening:

| screening | orcamento | lidos | total |
|---|---|---|---|
| 311374f4 | 7 paginas | **105** | **615** |
| 106212a8 | 5 paginas | 165 | 433 |
| 1d90ca61 | 3 paginas | 192 | 264 |
| 3ba475a9 | 3 paginas | 21 | 207 |
| 174fd306 | 2 paginas | 2 | 101 |
| 40f820ce | 2 paginas | 10 | 105 |

**A CAUSA, e ela derruba a premissa do orcamento:** a necessidade e calculada como
`ceil(total x 1,1 / DIGAI_TAMANHO_DA_PAGINA)` com `DIGAI_TAMANHO_DA_PAGINA = 100`
(`domain/digai.ts:1362`). Isso **assume pagina CHEIA**. Para o 311374f4 da 7 paginas, e 7 x 100 =
700 cobriria os 615. **O fornecedor nao entrega 100 por pagina:** aquele screening leu 105 em 7
paginas, ou seja **15 por pagina**. A medicao por screening nos logs de hoje mostra tamanho medio
de pagina de **5, 9, 13, 18, 21, 30, 38, 69, 87, 100**, espalhado.

**Entao subir `DIGAI_TETO_PAGINAS_POR_SCREENING` (hoje 20) sozinho nao resolve**, porque o que
corta e a COTA derivada do teto de requisicoes, e a cota e calculada em paginas supondo 100 por
pagina. O numero errado e a PREMISSA, nao o teto.

**O que o backend precisa decidir e medir:**
1. a necessidade passa a ser calculada contra o tamanho de pagina **OBSERVADO** do fornecedor, e
   nao contra a constante 100 (o `total` fresco da pagina 1 ja chega; o tamanho real da pagina
   tambem, porque e o `lidos` da propria pagina);
2. `DIGAI_TETO_REQ_POR_CICLO = 8.000` com cadencia de **15 min** e teto do fornecedor de
   **120 req/min**: 15 min dao no maximo **1.800** requisicoes. **Confirmar se o balde aguenta** o
   novo orcamento ou se o ciclo passa a transbordar para o seguinte. Se a conta nao fechar, DIZER,
   e nao esconder subindo a constante.
3. ha um ajuste **NAO COMMITADO** no working tree em `digai-varredura.service.ts` que troca
   `acumulados = pagina * lidos` por `(pagina - 1) * DIGAI_TAMANHO_DA_PAGINA + lidos` e acrescenta
   `sobrouGente`: ele conserta o AVISO FALSO de CORTADO, nao a perda. Reaproveitar, nao refazer.

## Alcance: quem mais encosta no que vai ser mexido

| arquivo | quem mais le |
|---|---|
| `as/digai/digai-repositorio.ts` | so a ingestao do Digai |
| `as/digai/digai-importacao.service.ts` | so a varredura e o controller do Digai |
| `domain/digai.ts` | varredura, importacao, scheduler, fila |
| `as/digai/digai-varredura.service.ts` | o scheduler do Digai |

**NAO SE TOCA, e isto e firme:**
- o dedup do **Pandape** (`as/ingestao-pandape/ingestao-ciclo.ts`, `resolverPessoa`): outra frente,
  **em producao e viva** (religada 02:58, 16.473 pessoas hoje);
- `uq_as_candidatos_cpf`;
- `as/candidatos/*` (Central de Candidatos, frente do coordenador nesta mesma OST);
- qualquer arquivo de Portal, GI ou autenticidade de documento: **ha outras sessoes no ar**.

**O PORTAO DE ESCRITA FICA FECHADO.** `DIGAI_INGESTAO_ATIVA` continua **ausente** do `.env` de
producao. Esta OST fecha o dedup e a cota; **ligar a escrita e ordem do diretor, depois**.

## §A.38: quem audita

Dedup funde pessoa, e fusao e irreversivel: o `seguranca` audita **este mapa antes** e **o codigo
depois**, com poder de veto. CPF e e-mail sao dado pessoal (§A.6).

---

# EMENDA, apos o VETO da auditoria (02/10/2026, 17h40)

## E-1. A PARTE 2 DESTE MAPA ESTAVA ERRADA, e o alarme era FALSO

Eu concluí que o fornecedor entregava de 5 a 100 por pagina e que a premissa de pagina cheia
subprovisionava o orcamento. **Errado.** O `lidos` que aparece no log de CORTADO **nao e o que foi
lido**: e o `acumulados` calculado pela formula defeituosa `pagina * lidos`, em que `lidos` e o
tamanho da **ULTIMA pagina**, a parcial.

Conferido por mim, 6 de 6, exato no digito, supondo pagina cheia de 100:

| screening | total | orcamento | ultima pagina = total-(p-1)x100 | pagina x ultima | o log diz | paginas x 100 >= total |
|---|---|---|---|---|---|---|
| 311374f4 | 615 | 7 | 15 | 105 | 105 | sim |
| 106212a8 | 433 | 5 | 33 | 165 | 165 | sim |
| 1d90ca61 | 264 | 3 | 64 | 192 | 192 | sim |
| 3ba475a9 | 207 | 3 | 7 | 21 | 21 | sim |
| 174fd306 | 101 | 2 | 1 | 2 | 2 | sim |
| 40f820ce | 105 | 2 | 5 | 10 | 10 | sim |

**A pagina do fornecedor E 100. Os 33 screenings "CORTADOS" foram lidos POR INTEIRO. Ninguem se
perdeu.** O "tamanho de pagina observado de 5, 9, 13, 18, 21, 30, 38, 69, 87, 100" que eu escrevi
era a lista de tamanhos de **ultima pagina**, nao de pagina.

**As instrucoes 1 e 2 da Parte 2 ficam VETADAS**, e a razao e que elas fabricariam a perda que o
alarme falso anunciou: 615/15 daria 41 paginas onde 7 bastam, e com o teto real de ~1.800
requisicoes por janela de 15 min o ciclo transbordaria e a LISTAGEM passaria a ser cortada por
falta de orcamento. **Nao se sobe teto nesta OST.** Sobra a instrucao 3: reaproveitar o ajuste do
working tree, que conserta o aviso falso e e conservador por construcao.

## E-2. `as_ingestao_conflitos` NAO TEM LEITOR, e a minha justificativa 2 estava otimista

Eu escrevi que "a ambiguidade ja pos o `userId` na fila de revisao". **Nao existe fila.** Conferido:
so ha `insert` (`digai-repositorio.ts`, `ingestao-repositorio.ts`) e o `delete` do expurgo. Nenhuma
tela, nenhum servico de leitura. A irma `as_ingestao_divergencias` tem servico e tela; esta nao.

**A decisao C continua valendo**, porque linha em tabela e melhor que linha em log, que rotaciona.
Mas o beneficio e **durabilidade do registro**, nao alguem olhando, e e isso que vai ao diretor.

## E-3. O PRECO DA DECISAO C e MAIOR do que eu assumi

A tabela **tem** `resolvido_em`, e o `unique (fonte, identificador)` **nao e parcial** em
`resolvido_em is null` (a irma 0136 fez o contrario, de proposito). Entao a linha da ambiguidade
continua ocupando a chave **depois de resolvida**, e nao so ate alguem olhar. Quando a tela de
revisao desta tabela existir, o unique precisa virar parcial na mesma frente, senao a tela nasce
com o furo. **Frente propria, com migration.**

## E-4. ACHADOS QUE EU PROPONHO E NAO CONSTRUO (§A.31)

1. **A guarda do degrau 3 e adiada um ciclo, nao eliminada.** `atualizarCandidato` nao roda no ramo
   do e-mail, mas no ciclo seguinte a identidade anexada faz o registro casar pelo degrau 1, e ali
   `cpf = coalesce(cpf, novo)` **preenche** o nulo da ficha escolhida pelo e-mail. **Pergunta para o
   diretor: a ingestao do Digai pode preencher `cpf` nulo em ficha que o e-mail escolheu? Exposicao
   medida: 117 casos** em que so o e-mail casa e o CPF nem existe na base. Nesta OST a guarda vira
   TESTE e o comentario e corrigido; o comportamento nao muda.
2. **Item sem `userId` valido e descartado sem contador nem log** (`digai-importacao.service.ts`).
   Hoje nao ha sintoma; se o contrato do fornecedor mudar, a perda nao aparece em lugar nenhum.
3. **`trim()` do JS e `btrim` do Postgres nao sao equivalentes** (o primeiro remove espaco Unicode,
   o segundo nao). A assimetria erra para o lado da ABSTENCAO, entao a direcao e segura, mas este
   mapa afirmava equivalencia exata e ela nao existe.
