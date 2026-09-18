# A prova do bind de lista do `encerrarAusentes`, contra Postgres real

Resolução do veto do `seguranca`: `apps/backend/src/as/ingestao-pandape/ingestao-repositorio.ts`,
`encerrarAusentes`. Tudo o que está aqui foi EXECUTADO contra um Postgres de verdade, no database
descartável `ea_prova_bind` do container `ea-db`, criado para esta prova e derrubado ao final.
Nunca `ea_automatic`, nunca `ea_automatic_homolog`.

## 1. O defeito, reproduzido antes de ser corrigido

A forma original era `and v.id_vacancy_pandape <> all(${ativos}::text[])`, com `ativos` sendo um
array de JS. Rodando o método REAL (a classe `IngestaoRepositorio`, sobre drizzle e postgres-js):

```
[1 id]    FALHOU code=22P02 message=malformed array literal: "101"
[3 ids]   FALHOU code=42846 message=cannot cast type record to text[]
[621 ids] FALHOU code=42846 message=cannot cast type record to text[]
```

As duas primeiras linhas reproduzem exatamente o que o `seguranca` mediu. A terceira acrescenta a
cardinalidade de produção (621 vagas ativas), que também quebra.

### Por que quebra, medido na compilação e não deduzido

O drizzle NÃO liga um array de JS a um array de Postgres: ele ESPALHA o array em parâmetros soltos.
Compilada pelo `PgDialect` real, a forma quebrada vira:

```
1 id    ->  <> all(($2)::text[])            params: ["FECHADA","900000"]
3 ids   ->  <> all(($2, $3, $4)::text[])    params: ["FECHADA","900000","900001","900002"]
```

Com 1 id, o parêntese solto é um ESCALAR, e o cast dele para `text[]` é o `malformed array literal`.
Com 2 ou mais, o parêntese vira um CONSTRUTOR DE LINHA, e o cast dele é o `cannot cast type record
to text[]`. Os dois códigos de erro caem exatamente onde a compilação previa.

### A consequência, que é o motivo do veto

O chamador (`ingestao-ciclo.ts`, linhas 199 a 207) engole a exceção, soma `resumo.erros += 1` e loga
uma linha genérica. A vaga espelhada nunca encerraria, `encerrada_em` ficaria nulo para sempre, e a
cláusula `... or v.encerrada_em is null` do expurgo manteria toda pessoa viva dentro dela retida
indefinidamente, com CPF, e-mail, telefone e nascimento, sem nada falhar visivelmente.

## 2. A correção, e por que esta e não outra

```
const ativos = sql.join(idsAtivos.map((n) => sql`${String(n)}`), sql`, `);
...
and v.id_vacancy_pandape <> all(array[${ativos}]::text[])
```

Compila para `array[$1, $2, ..., $n]::text[]`: um construtor de ARRAY, com um parâmetro por id.

As alternativas, e por que foram recusadas:

- **Literal montado à mão (`'{101,102}'::text[]`).** Gasta um parâmetro só, o que é atraente, mas
  põe VALOR dentro do texto da instrução. Hoje a assinatura é `number[]` e o literal seria seguro;
  no dia em que ela mudar, passa a exigir escape de vírgula, aspas e chaves, e erra calado. Com
  `sql.join` nenhum valor entra no texto: não há escape a acertar e não há injeção possível por
  construção.
- **`inArray`/`notInArray` do drizzle.** Exigem um objeto de coluna do schema, e esta instrução é
  SQL cru, com CTE de duas escritas. Adaptá-la ao query builder trocaria uma correção de uma linha
  por uma reescrita da instrução central da frente.

A conta de escala está fechada: 621 vagas ativas em produção, logo 622 parâmetros com o código do
status, contra o teto de 65.535 do protocolo. A cardinalidade de produção está PROVADA, não deduzida.

## 3. A prova, nas três cardinalidades

O método REAL, rodado contra Postgres, com vagas espelhadas semeadas e matriculadas:

```
[1 id]    OK devolveu=2 vagas.encerrada_em=2 matriculas_carimbadas=2
[3 ids]   OK devolveu=2 vagas.encerrada_em=2 matriculas_carimbadas=2
[621 ids] OK devolveu=5 vagas.encerrada_em=5 matriculas_carimbadas=5
```

Cada linha confere três coisas, e não só a ausência de exceção: quantas o método diz ter encerrado,
quantas de fato receberam `encerrada_em`, e quantas matrículas receberam o carimbo
`encerrada_pela_varredura_em` da CTE `marcadas`. Os três números concordam nas três cardinalidades.

No caso de 621, foram semeadas 626 vagas, das quais 621 na lista de ativas: as 5 ausentes, e só
elas, encerraram.

## 4. A varredura das OUTRAS instruções da frente

Foram executadas contra Postgres **36 instruções distintas**, cobrindo os **23 pontos de
`db.execute` do repositório**, em **40 chamadas**, **sem nenhuma falha**. A instrumentação capturou
o SQL compilado de cada uma, então a contagem é do que chegou ao banco, não do que foi planejado.

Os 23 pontos, todos exercitados:

| ponto | cobertura |
|---|---|
| `identidadeExterna` | vazio e depois de escrito |
| `candidatoPorCpf` | CPF válido, CPF inválido, e depois de escrito |
| `candidatoPorNome` | vazio e depois de escrito |
| `vagaPorIdPandape` | vazio, e depois do encerramento |
| `vagaPorCodigo` | vazio |
| `deParaEtapa` | chave que casa e chave que não casa |
| `marcaDaVaga` | nula e depois de escrita |
| `escreverCandidato` insert | nascimento da pessoa |
| `escreverCandidato` update | mudou, idêntico, e ficha ANONIMIZADA (recusou) |
| `escreverCandidato` sondagem de anonimização | alcançada pelo zero linha |
| `escreverIdentidade` insert e leitura do existente | nascimento e reentrega |
| `escreverCandidatura` busca, insert, update | insert sem etapa, update só etapa, update etapa+situação+motivo, update idêntico, update sem campo |
| `escreverVaga` busca, insert vaga, insert matrícula, update | nascimento, mudança, reentrega idêntica, REABERTURA, e recusa da vaga digitada por gente |
| `escreverMarca` | marca que anda e marca igual |
| `escreverConflito` | nascimento e reentrega |
| `encerrarAusentes` | lista vazia, 1, 3 e 621 |
| `cidadePorTexto` | nome acentuado real contra `as_cidades` |

O ciclo de vida completo foi verificado ponta a ponta na mesma passada: a vaga nasce, é encerrada
pelo `encerrarAusentes` corrigido, e a REABERTURA a devolve para `ABERTA` com `encerrada_em` nulo.
Essa reabertura depende do carimbo que só existe porque o encerramento passou a executar, então ela
estava inalcançável antes desta correção.

As duas recusas declaradas também foram exercitadas de verdade, e recusaram:
`Cadastro anonimizado pela retenção: a ingestão não regrava dado pessoal.` e
`A vaga 777003 já existe no EA sem ser da varredura: conflito para revisão humana.`

### Nenhum outro ponto da frente tem o mesmo defeito

A varredura do repositório inteiro por `any(${...})`, `all(${...})` e casts de array encontrou
apenas mais um arquivo, `apps/backend/src/db/regras-esteira-vivas.ts`, com
`ANY(${cadastrar}::uuid[])`. **Ele NÃO é defeituoso, e a diferença é o CLIENTE**, não o texto: aquele
arquivo usa o `Sql` do postgres-js DIRETO, que liga arrays de JS nativamente. Medido no mesmo
database descartável, nas mesmas três cardinalidades:

```
postgres-js puro, 1 id(s):   OK
postgres-js puro, 3 id(s):   OK
postgres-js puro, 621 id(s): OK
```

É exatamente essa a armadilha que produziu o veto: **o mesmo texto é correto num cliente e
inexecutável no outro**, e nada na leitura do código distingue os dois.

## 5. A trava, para o defeito não voltar

`apps/backend/src/as/ingestao-pandape/ingestao-bind-array.backend.spec.ts`.

É teste **POR FORMA**, e isso está declarado no cabeçalho dele: não há banco na suíte da ingestão,
então ele não prova o efeito. O que ele faz é compilar a instrução com o `PgDialect` REAL do
drizzle, que é o que produz os `$1, $2, ...` entregues ao driver, e afirmar sobre o resultado.

A invariante foi MEDIDA, e a primeira redação do arquivo estava errada: ela afirmava que nenhum
parâmetro podia ser um array de JS, e essa afirmação **nunca fica vermelha**, porque o drizzle
espalha o array e é o espalhamento que causa o defeito. A invariante correta é a do construtor de
linha, descrita na seção 1.

**O teste foi provado vermelho.** A forma quebrada foi recolocada no repositório de propósito e duas
das quatro afirmações falharam; restaurada a correção, as quatro voltaram ao verde. Um teste que não
sabe ficar vermelho não é trava.

## 6. O achado estrutural, para o diretor decidir

**NÃO existe, no repositório, nenhum caminho de teste automatizado com Postgres de verdade.** A
afirmação é de varredura, e foi conferida: nenhum `testcontainers`, nenhum `pg-mem`, nenhum serviço
de banco no `ci.yml`, nenhum `setupFiles` do vitest, nenhum spec que abra conexão. Todos os
contratos medem SENTIDO contra um banco fingido.

**A primeira redação desta seção estava incompleta, e a correção importa.** Existe UM spec que
parece conectar, `apps/backend/src/admin/regua/regua-on-conflict.spec.ts`, e ele NÃO conecta: aponta
para `postgres://ninguem@127.0.0.1:1/nada` e usa `.toSQL()`, sem abrir conexão. É teste POR FORMA,
exatamente do mesmo gênero do que acabou de ser escrito aqui.

E a origem dele é o mesmo modo de falha: um `ON CONFLICT` que não inferia índice parcial, que
derrubou a tela da régua em produção e que nenhum banco fingido pegaria. **É o segundo incidente da
mesma família**: instrução que só o Postgres de verdade recusa, descoberta depois de subir. O teste
por forma é a saída que o repositório já vinha usando para essa classe de defeito, e ela funciona,
mas é um remendo, não uma resposta.

Foi por isso que 3.680 testes verdes conviveram com a instrução central da frente sendo incapaz de
executar. Não é falha do `tester`: o contrato dele mede o que se propõe a medir, e ele DECLAROU a
limitação. É lacuna de infraestrutura.

Registrado como achado, não como tarefa: §A.31, propõe e não constrói. Nenhuma infraestrutura de
teste nova foi criada nesta rodada.

## 7. Higiene da prova

O database `ea_prova_bind` foi criado a partir de um `pg_dump -s` (somente esquema, leitura) de
`ea_automatic`, mais a migration `0113` da frente, mais os catálogos não pessoais
(`as_vaga_status`, `as_cidades`, `as_etapas_funil`, `as_depara_etapa_externa`). **Nenhum dado
pessoal foi copiado.** Os candidatos da prova são sintéticos. O database foi **derrubado ao final**,
e os arquivos temporários da prova não foram deixados no repositório.

§A.6: a mensagem de erro do encerramento carrega só o número da vaga do ATS, sem PII. Isso foi
conferido e continua valendo após a correção.
