# GI: a leitura COMPLETA da documentação, e o que ela corrige do que eu já havia afirmado

Terceira rodada da frente. As duas anteriores voltaram por leitura parcial, então aqui está primeiro
**o que foi lido e por qual caminho**, para a leitura ser conferível, e depois as respostas.

## O caminho percorrido, passo a passo

1. **Confirmei que existe UM único documento de spec, e qual é.** `GET /swagger/index.js` (o arquivo
   que a página do Swagger carrega de verdade) declara
   `urls: [{"url": "/openapi/v1.json", "name": "Api Geral v1"}]`. **Uma entrada, não há v2 nem segundo
   documento.** E confirmei o erro da primeira rodada na origem: `/swagger/swagger-initializer.js` é o
   arquivo de fábrica do Swagger UI e aponta para `https://petstore.swagger.io/v2/swagger.json`, que
   não tem nada a ver com o GI.
2. **Baixei o documento inteiro:** `GET /openapi/v1.json`, HTTP 200, **1.718.764 bytes**, OpenAPI
   3.1.1, **443 paths, 64 schemas, 3.724 propriedades somadas**.
3. **Varri os 64 schemas, não só o do envio**, procurando campo de banco por padrão de nome
   (`banc|bco`), sem supor a grafia.
4. **Verifiquei se o `Add` tem modelo ANINHADO**, que era a hipótese de onde o campo poderia morar.
5. **Mapeei os schemas de TODAS as 8 rotas de `FuncionarioSelecao`**, não só do `Add`.
6. **Extraí TODAS as `description` de TODOS os schemas**, e não só as do DTO do envio. Foi aqui que a
   leitura parcial anterior me traiu.
7. **Medi o catálogo `Banco/GetAll` na produção** (165 linhas, 45 campos cada) para responder o que a
   documentação não documenta.

## 1. O NOME DO BANCO: o caminho do `Add` está esgotado, e aqui está a prova

**A resposta é: não existe campo de nome de banco em nenhum lugar do caminho do `Add`.** Três provas
independentes, nesta ordem:

**(a) Varredura dos 64 schemas.** Todo campo com `banc` ou `bco` no nome, no documento inteiro:

| schema | campos de banco |
|---|---|
| `TB_Banco` | `codigoBanco`, `numeroBanco`, **`nomeBanco`**, `empresaBanco` |
| `TB_FuncionarioSelecaoAPI` (o DTO do envio) | `codigoBcoFolha`, `codigoBcoPagar`, `tipoMskBanco`, `codigoBcoReembolso`, `tipoMskBancoReembolso` |
| **`TB_Funcionario`** (a folha OFICIAL, 365 campos) | **exatamente os mesmos cinco do DTO do envio** |
| `TB_Empresa` | `nomeBancoFGTS`, `numeroBancoFGTS` |

O dado decisivo é a terceira linha: **a tabela oficial do funcionário tem os MESMOS cinco campos e
também não tem nome de banco.** Não é limitação da pré-admissão, é o modelo de dados do GI: o banco
do funcionário é **chave estrangeira** para `TB_Banco`, e o nome mora lá, uma vez, no catálogo.

**(b) O `Add` não tem modelo aninhado.** Conferi: `TB_FuncionarioSelecaoAPI` tem **zero** propriedades
com `$ref`, `object` ou `array`, e não tem `allOf`, `anyOf`, `additionalProperties` nem
`discriminator`. **As 415 propriedades são todas escalares.** Não há modelo filho onde o campo
pudesse estar escondido. O corpo é o mesmo DTO nos três content-types que o `Add` aceita
(`application/json`, `text/json`, `application/*+json`).

**(c) Nenhuma das 8 rotas de `FuncionarioSelecao` referencia outro modelo de dado.** Elas usam só
`TB_FuncionarioSelecaoAPI`, `MsgReturn`, `MsgReturn400`, `QueryModel`, `QueryWhere` e
`ProblemDetails`. Os três últimos são envelope de erro e de consulta, sem campo de negócio.

**O que o Gilberto provavelmente fez:** o nosso payload tinha `bancoNome`, nome inexistente. Ele
devolveu `nomeBanco`, que é o nome correto **do campo no catálogo `TB_Banco`**, onde o nome do banco
realmente vive. A correção dele está certa sobre a GRAFIA e errada sobre o DESTINO: aquele campo não
entra no envio da pré-admissão. **E medi que mandá-lo não quebra nem resolve nada**: a sonda enviou
`nomeBanco` junto e o GI o **ACEITOU em silêncio**, ou seja, ignora chave desconhecida, igual fez com
o `ufCTPS`.

## 2. O `codigoBcoFolha`: é a CONTA DA EMPRESA, e o 341 está no campo errado

O campo **não tem `description`** (conferi: nem ele, nem `codigoBcoPagar`, nem `codigoBcoReembolso`,
nem `tipoMskBanco`). Então respondi pela estrutura do catálogo que ele referencia e pelo dado real.

**`TB_Banco` não é um catálogo de bancos: é o catálogo das CONTAS BANCÁRIAS da empresa.** Os 45
campos incluem `nrAgencia`, `nrConta`, `chequeInicial`, `chequeFinal`, `contaContabil`,
`dataUltimoSaldo`, `valorSaldo`, `valorLimite`, `valorLimiteCaucao`, `cartaoSalario` e
`empresaBanco`. Banco genérico não tem saldo, cheque nem conta contábil. Medido na produção: das 165
linhas, **113 têm número de conta e 114 têm agência preenchidos**, e só 3 estão marcadas
`cartaoSalario`.

**E o achado que muda a conclusão da rodada anterior: o código FEBRABAN EXISTE no catálogo, em
`numeroBanco`.** Eu havia dito que o 341 simplesmente não existia. Preciso corrigir: ele não existe
como **`codigoBanco`** (a chave interna, que é o que o `codigoBcoFolha` referencia), mas existe como
**`numeroBanco`** (o código FEBRABAN) em **40 linhas diferentes**, uma por empresa e por finalidade:
"ITAU - SOULAN", "ITAU - SELLAN", "BANCO ITAÚ - ESTÁGIOS", "ITAU - CYLENE" e assim por diante.

Consequência prática, em duas partes:
- **O EA escreve hoje um `codigoBanco` que não existe.** Manda 341, e não há linha com
  `codigoBanco = 341` entre as 165. O GI não valida a chave estrangeira (aceitou), então grava uma
  referência pendurada.
- **O de/para "nome do banco para código" é AMBÍGUO por construção.** Um mesmo FEBRABAN 341 vira 40
  `codigoBanco` possíveis, e escolher depende da empresa e da finalidade da conta, que são informação
  que o EA não tem. **Isto não é conserto que a fábrica possa fazer sozinha**, e é a pergunta nº 1 para
  o Gilberto.

## 3. ESTADO CIVIL e GRAU DE INSTRUÇÃO: as duas listas, e eu estava errado ao dizer que não dava

Na rodada anterior eu afirmei que **"o código de estado civil não é derivável do contrato público"**.
**Estava errado, e o erro é exatamente o que esta OST cobra: eu lia apenas o schema do envio.**

As `description` não são 42, são **127, espalhadas por 11 schemas**. E `TB_Funcionario` tem **43**,
uma MAIS que o DTO do envio. Documentados **só** em `TB_Funcionario`: `grauInstrucao` e
`motivoContrato`.

**A troca está confirmada, e a lista boa está no schema irmão:**

| campo | no DTO do envio | em `TB_Funcionario` |
|---|---|---|
| `estadoCivil` | a lista de GRAU DE INSTRUÇÃO (errada) | **C Casado(a) · D Divorciado(a) · Q Desquitado(a) · S Solteiro(a) · V Viúvo(a) · U União Estável · O Outros** |
| `grauInstrucao` | nenhuma | **1 Analfabeto · 2 Até 5º Ano Incompleto · 3 5º Ano Completo · 4 6º ao 9º Ano Incompleto · 5 Fundamental Completo · 6 Ensino Médio Incompleto · 7 Ensino Médio Completo · 8 Superior Incompleto · 9 Superior Completo · A Pós-Graduação Completa · B Mestrado Completo · C Doutorado Completo · D Pós-Doutorado Completo** |

O `default` de cada um confirma a leitura por outro caminho: `estadoCivil` tem default **`S`**, que é
Solteiro na lista boa, e `grauInstrucao` tem default **`4`**, que é "6º ao 9º Ano Incompleto".

## 4. Os 9 CÓDIGOS CURTOS: todas as listas estão na documentação

| campo | máx | lista |
|---|---|---|
| `sexo` | 1 | F Feminino, M Masculino |
| `estadoCivil` | 1 | 7 valores (acima, via `TB_Funcionario`) |
| `raca` | 1 | 1 Branca, 2 Preta, 3 Amarela, 4 Parda, 5 Indígena |
| `grauInstrucao` | 1 | 13 valores (acima, via `TB_Funcionario`) |
| `naturalidade` | 2 | as 27 siglas de UF (é a UF, não a cidade) |
| `ufrg` | 2 | as 27 siglas de UF |
| `ufExpedicao` | 2 | as 27 siglas de UF |
| `ufResid` | 2 | as 27 siglas de UF |
| `nacionalidade` | 3 | **254 valores**, `010` Brasileiro, `020` Naturalizado |

**Os nove estão resolvidos pela documentação.** Nenhum depende do suporte, e nenhum dos endpoints de
catálogo que respondem 404 era necessário: a lista sempre esteve na `description`.

## 5. As outras divergências

- **O GI guarda o CPF como número de ponto flutuante.** Medido no registro criado: voltou
  `99999999999.0`. Então CPF que começa com zero não é recusado, é **corrompido em silêncio**, e um
  `Number()` cego do nosso lado repetiria o erro.
- **Data: mandamos `YYYY-MM-DD` e volta `YYYY-MM-DDT00:00:00`.** O GI parseia, não é defeito.
- **`tipoMskBanco`** (máx 1) referencia `TB_BancoMascara` (que tem `tipo`, `agencia`, `conta`,
  `descricao`): é a MÁSCARA de formato da agência e da conta, por banco. O EA não manda, e o default
  é vazio. Fica registrado porque agência e conta do funcionário saem sem máscara.
- **`TB_DePara` tem `description` no campo `sinc`:** `0 Sincronizado`, `1 Sincronizar com HK`,
  `2 Sincronizar com GI`, `3 Sincronizado com GI na Seleção`. É o vocabulário do sincronizador do GI,
  útil quando a frente da sincronização for trabalhada.
- **O `Nome` tem validador de negócio próprio**, não é `maxLength` genérico: "Nome Inválido para o
  e-Social! Ulrapassou o limite de 60 caracteres!" (o erro de digitação é deles).
- **Fora dos 43 campos, o GI preenche sozinho uma dúzia de campos de folha** no registro criado
  (`calculaINSS`, `calculaIRF`, `cartaoPonto`, `diaAdto` 20, `diaPgto` 30, `percentualVT` 6.0,
  `tipoAdmissao` D, `tipoContrato` I, `tipoSalario` M, `tipoPgto` M, `motivoContrato` 1,
  `indAdmissao` 1, `tpRegimeTrab` 1). Nenhum é obrigação nossa, mas explica por que o registro tem 75
  campos não-vazios e o EA só manda 42.

## 6. O que eu havia afirmado e agora corrijo

1. **"O código de estado civil não é derivável do contrato público."** Errado. Está em
   `TB_Funcionario`, e eu não havia lido as `description` dos outros schemas.
2. **"42 propriedades carregam a lista de valores válidos."** São **127**, em **11 schemas**.
3. **"O 341 não existe no catálogo do GI."** Impreciso. Não existe como `codigoBanco`, que é o que o
   campo referencia, mas existe como `numeroBanco` (FEBRABAN) em 40 linhas. O defeito é mais específico
   do que eu disse, e a ambiguidade das 40 linhas é o que impede a fábrica de consertar sozinha.
4. **"`nomeBanco` não existe no `FuncionarioSelecao`."** Isto se mantém, e agora com o caminho
   completo e com a prova mais forte: a folha OFICIAL (`TB_Funcionario`) também não tem o campo.

## 7. A varredura dos 443 paths, e o que ela fechou

Os 443 paths são **56 recursos**, quase todos com as mesmas 8 ações (`Add`, `Add_Update`, `Delete`,
`DeleteJson`, `Get`, `GetAll`, `GetAllJson`, `Update`). Inventário completo: `ApiFicha`, `Banco`,
`BancoMascara`, `Beneficio`, `CBO`, `CentroCusto`, `CentroResultado`, `Cliente`,
`ClienteBeneficioSelecao`, `ClienteEvePadraoSelecao`, `ClienteEveSujFer13oSelecao`,
`ClienteEveUtilizadoSelecao`, `ClienteSelecao`, `Conexao`, `ContabHistorico`, `Contrato`,
`ContratoEventoSelecao`, `ContratoSelecao`, `DSEmitida`, `DePara`, `Duplicata`,
`DuplicataComplemento`, `Empresa`, `Fornecedor`, `Funcao`, `Funcionario`, `FuncionarioAfastamento`,
`FuncionarioAusencia`, `FuncionarioBeneficio`, `FuncionarioBeneficioSelecao`,
`FuncionarioCargosSalarios`, `FuncionarioCplSelecao`, `FuncionarioDependente`,
`FuncionarioDependenteSelecao`, `FuncionarioEvePadraoSelecao`, `FuncionarioSelecao`,
`GrupoEconomico`, `HistoricoNF`, `Horario`, `Login`, `MovtoBanco`, `MovtoFatOutroSelecao`,
`Sindicato`, `Solicitacao`, `SolicitacaoAfastamento`, `SolicitacaoDependente`,
`SolicitacaoEndereco`, `SolicitacaoFerias`, `SolicitacaoPedidoDemissao`, `SolicitacoesDocumentos`,
`Teste`, `TipoDespesa`, `TipoFaturamento`, `Titulo`, `TituloSelecao`, `Vendedor`.

**O único candidato que sobrava para esconder o nome do banco era o `FuncionarioCplSelecao`**, o
COMPLEMENTO da pré-admissão. Abri: são 30 campos, e 20 deles se chamam `campoLivre_11` a
`campoLivre_30`, mais três de qualificação cadastral do eSocial e a chave. **Não há campo de banco, e
não há campo nomeado de nada**: são slots genéricos. O caminho está esgotado em todas as direções.

**E ele entrega de graça a explicação de por que empresa e filial são obrigatórios.** A chave do
complemento é `codigoEmpresa` + `codigoFilial` + `codigoFuncionario`, exatamente **os três únicos
campos não-anuláveis e sem default** do DTO do envio (o quarto é o `idRegistroWeb`, que é a chave da
fila web). Ou seja: **empresa, filial e funcionário são a CHAVE PRIMÁRIA do funcionário no GI**, não
um dado de classificação. É por isso que o Gilberto insiste neles, e é por isso que omiti-los produz um
registro com chave `(0, 0, 0)`. A medição do dia anterior mostrou que isso **não impede** a criação nem
muda o que grava, mas agora se sabe o que significa: o registro nasce com a chave zerada, e é o
sincronizador que depois resolve para onde ele vai.

## 8. A divergência que a leitura das listas tornou visível, e ela é de COLETA

Com as nove listas na mão, dá para dizer o que antes era suposição: **os cinco campos de código que o
Portal coleta como `tipo: "texto"` livre não vão chegar preenchidos ao GI, e um deles pede a coisa
errada ao candidato.**

Em `domain/dados-gi-campos.ts` os cinco são `tipo: "texto"`: `nacionalidade`, `naturalidade`,
`estadoCivil`, `raca`, `grauInstrucao`. Cruzando com as listas:

| campo | o Portal pede | o GI espera | o que acontece hoje |
|---|---|---|---|
| `naturalidade` | rótulo "Naturalidade", texto livre | **a sigla da UF**, 2 caracteres | o candidato digita a CIDADE, e cidade não cabe em 2. **O rótulo está errado**, deveria ser "UF de nascimento" e ser um seletor de UF |
| `nacionalidade` | texto livre | código de 3, `010` Brasileiro | "Brasileira" não cabe em 3 |
| `estadoCivil` | texto livre | 1 letra, C D Q S V U O | "Casado" não cabe em 1 |
| `raca` | texto livre | 1 dígito, 1 a 5 | "Parda" não cabe em 1 |
| `grauInstrucao` | texto livre | 1 caractere, 1 a 9 e A a D | "Ensino Médio Completo" não cabe em 1 |

Com o conserto desta rodada (código curto que não cabe vai NULO), **nenhum dos cinco derruba mais o
envio**, o que já é o ganho principal: hoje qualquer um deles levava 400 e a admissão inteira se
perdia. Mas eles vão **vazios**, e o GI aplica o default (`010` para nacionalidade, `S` para estado
civil, `4` para grau de instrução). **Trocar o texto livre por lista fechada é a continuação natural, e
agora ela não depende de ninguém: as cinco listas estão em
`docs/GI-CATALOGOS-DA-DESCRIPTION.md`.** Não construí porque não está no escopo desta OST (§A.31).

Há duas pontas soltas de coleta que não são de código e seguem valendo: **`reservistaCategoria`** é
coletada, gravada e **não existe no leitor nem no payload** (campo morto), e a **data da CTPS lida pela
IA** sai como `ctpsDataExpedicao` enquanto a allowlist só aceita `ctpsData`, então morre em silêncio.
