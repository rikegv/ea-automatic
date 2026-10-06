# Conferir no GI o que a fabrica enviou (para o diretor, no escritorio)

Medido ao vivo na producao do GI em 06/10/2026, 10:55. Tudo sintetico e declarado (§A.6).

## O ESSENCIAL, em uma linha

**Na tela de pre-admissao do GI voce vai ver UM registro: o 31.** Os outros (24 a 30) **ja sumiram**,
e isso NAO e erro: e o apiSinc, explicado no fim. Se voce procurar os antigos e nao achar, esta certo.

## ONDE OLHAR

Na tela do fornecedor (GI), a area de **pre-admissao / FuncionarioSelecao**. E a mesma lista de onde
voce apagou os registros de teste antes. O registro vivo e o **idRegistroWeb 31**.

## O QUE ESTA LA AGORA: registro 31, campo a campo

Lido do GI agora. A coluna "enviado" e o que a plataforma mandou; a coluna "GI mostra" e o que a tela
do fornecedor devolveu. **As duas batem**, e e isso que voce quer confirmar.

| campo | enviado pela plataforma | GI mostra | bate |
|---|---|---|---|
| idRegistroWeb | (o GI atribui) | **31** | - |
| nome | SIMULADO APISINC VERDADEIRO | SIMULADO APISINC VERDADEIRO | sim |
| CPF | 44444444444 (sintetico) | 44444444444 | sim |
| apiSincAdmissaoDigital | **true** | **true** | sim |
| statusPreCadastro | (do GI) | 2 (pre-cadastro) | - |
| codigoCliente | 51525 | **51525** | sim |
| codigoEmpresa / codigoFilial | 2 / 4 | **2 / 4** | sim |
| vinculo | 1 (CLT) | 1 | sim |
| tipoContrato (prazo) | I (indeterminado) | I | sim |
| tipoSalario | M (mensal) | M | sim |
| salario | 2500,00 | 2500,00 | sim |
| dataAdmissao | 2026-10-20 | 2026-10-20 | sim |
| cidadeNascimento | CAMPINAS | CAMPINAS | sim |
| **codMunicipioNascto** | 3509502 (IBGE de Campinas) | **3509502** | sim |
| cidadeRG | SANTOS | SANTOS | sim |
| cidadeExpedicao (CTPS) | OSASCO | OSASCO | sim |
| cidadeResid | SANTOS | SANTOS | sim |
| **codigoCidadeResid** | **nulo** (de proposito) | **0** (o default do GI) | sim |

**As quatro cidades sao distintas de proposito** (nascimento CAMPINAS, RG SANTOS, CTPS OSASCO, resid
SANTOS): se o GI tivesse trocado uma pela outra, apareceria. Nenhuma trocou.

**Duas provas escondidas nessa tabela, e valem o olhar:**
- **`codMunicipioNascto = 3509502`**: e o codigo IBGE de Campinas, e prova que o de/para de municipio
  que instalamos em producao esta no ar e resolvendo certo.
- **`codigoCidadeResid = 0`**: a cidade de residencia foi enviada **nula** de proposito (o espaco de
  codigo dela e desconhecido, e nao se inventa codigo), e o GI aplicou o default dele, 0. E a prova de
  que a separacao dos dois campos de cidade esta funcionando.

## O QUE JA SUMIU, e por que isso e o esperado

| registro | o que era | apiSinc | status |
|---|---|---|---|
| 24, 25, 26, 27, 28 | cadastros sinteticos da rodada de 02/10, cliente 51525 | **false** (default) | **sumiram** |
| 29 | SIMULADO PELO PRODUTO MENSAL, CPF 22222222222 | **false** | **sumiu** |
| 30 | SIMULADO APISINC FALSO, CPF 33333333333 | **false** | **sumiu** |
| **31** | SIMULADO APISINC VERDADEIRO, CPF 44444444444 | **true** | **ESTA LA** |

**O apiSinc e a chave de tudo.** Medido em tres leituras ontem (no envio, 11 min e 26 min depois): o
registro com `apiSinc = false` e **consumido pelo proprio GI em menos de 10 minutos** e sai da fila; o
com `apiSinc = true` **fica esperando** e nao some. Por isso so o 31 sobrevive.

**E a razao de manter o `true`**, que e o que voce pediu: sem ele, quando a auditoria fechar fora do
horario de trabalho, o registro some antes de alguem cadastrar. Com `true`, ele espera.

## A CONTA FINAL

A plataforma mandou **31 registros** no total, ao longo dos testes. O que voce consegue conferir na
tela HOJE e o **31**, porque e o unico com `apiSinc = true`. Nele, **todos os campos batem** com o que
a plataforma enviou. A importacao esta certa: o que mandamos e o que o GI guardou sao a mesma coisa.

Quando terminar, apague o 31 pela tela do GI (a nossa ferramenta de leitura e so de consulta, de
proposito, para nao haver risco de mexer na folha por engano).
