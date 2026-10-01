# GI: releitura do contrato, o `nomeBanco`, e o teste comparativo com/sem empresa

Frente do diretor, 01/10/2026, depois da resposta do Gilberto (suporte do GI). Produção do GI, sem
sandbox. Companheiros deste documento: `docs/MAPA-GI-RELEITURA-SCHEMA.md` (o mapa de alcance e as
correções de premissa) e `docs/GI-DIVERGENCIAS-SCHEMA.md` (a tabela campo a campo).

---

## 1. O `nomeBanco`: o Gilberto está errado, e medi antes de dizer isso

A OST mandou devolver o campo como `nomeBanco`. **`nomeBanco` NÃO EXISTE em
`TB_FuncionarioSelecaoAPI`.** Varri os 64 schemas do contrato: ele existe só em `TB_Banco` (o catálogo
de bancos) e `nomeBancoFGTS` em `TB_Empresa`. No DTO da pré-admissão não há nenhuma propriedade com
"banco" no nome além de `tipoMskBanco` e `tipoMskBancoReembolso`; o banco da pessoa entra só por
CÓDIGO (`codigoBcoFolha`, `codigoBcoPagar`, `int16`).

**A remoção do `bancoNome` em 29/09 estava certa, e devolvê-lo como `nomeBanco` não teria efeito**: o
`Add` ignora chave desconhecida em silêncio, foi o que aconteceu com o `ufCTPS`. Então não devolvi o
campo, e a sonda de validação carrega `nomeBanco` de propósito, para medir se o GI o recusa ou o
ignora.

**E há um erro de VALOR, mais grave que o de nome, que ninguém tinha visto.** O `codigoBcoFolha` que
o EA manda é **`341`, o código FEBRABAN do Itaú**, e o catálogo do GI é outro: `Banco/GetAll` devolve
**165 contas com códigos internos de 1 a 999, e o 341 NÃO ESTÁ entre eles**. Pior: as linhas são as
CONTAS DA PRÓPRIA EMPRESA ("CONTA SALÁRIO BRADESCO", "ITAU - SOULAN", "BRADESCO - NEAT"), não bancos
genéricos. Ou seja, o EA traduz o banco DO CANDIDATO para um código que o GI usa para dizer de QUE
CONTA a folha paga. **O de/para de banco está errado de desenho, não de digitação**, e isso é
pergunta para o Gilberto: `codigoBcoFolha` é a conta pagadora da empresa ou o banco do funcionário?

## 2. A releitura completa do SCHEMA

Contrato: `https://apigeral.gi.app.br/openapi/v1.json` (OpenAPI 3.1.1, **443 rotas**, 64 schemas).
Schema do envio: `TB_FuncionarioSelecaoAPI`, **415 propriedades, nenhuma `required`**.

**Os 43 nomes que o EA envia existem TODOS.** Nenhum erro de nome restou depois de 29/09. O que a
releitura achou é outra classe de divergência, e a tabela completa está em
`docs/GI-DIVERGENCIAS-SCHEMA.md`. Em número:

- **25 campos de texto sem corte**, contra o `maxLength` do contrato. Só `cplEndereco` é cortado, e
  `sexo` é seguro por outro caminho. O GI valida tamanho e **recusa o envio inteiro com 400** (medido
  em 29/09). Dezessete foram provados estourando em teste.
- **10 campos numéricos com padrão que PROÍBE zero à esquerda.** **CPF que começa com zero quebra o
  padrão**, e código de banco "001" também. São dois padrões, não um: `cpf`, `pis` e `smsNroCel`
  aceitam parte decimal, os outros sete não.
- **5 campos `date-time`** recebendo `YYYY-MM-DD` das colunas `date` do Postgres. O GI parseia; fica
  registrado, não como defeito.
- **5 campos de CÓDIGO sem de/para nenhum** (`nacionalidade`, `naturalidade`, `estadoCivil`, `raca`,
  `grauInstrucao`): o Portal coleta texto livre e o GI quer código de tabela fechada. Cortar
  inventaria código; nulo trava o dano mas não entrega a funcionalidade.

### O achado que o Swagger escondia: a lista de valores válidos está DENTRO do schema

**42 propriedades carregam `description` com o domínio inteiro.** É ali que vivem os catálogos que a
API nega por endpoint (`Raca/GetAll`, `Nacionalidade/GetAll`, `EstadoCivil/GetAll` e companhia dão
404). Ninguém havia lido. Entre os que o EA envia: `raca` (1 Branca a 5 Indígena), `nacionalidade`
(250 países, `010` Brasileiro), `naturalidade` e as três UF (as 27 siglas), `sexo` (F/M).

**E um defeito na documentação do próprio GI:** a `description` de `estadoCivil` é a lista de **grau
de instrução**, e `grauInstrucao` não tem nenhuma. Os dois estão trocados na origem.

> **CORRIGIDO NA RODADA DE 01/10 (leitura completa):** eu disse aqui que **"o código de estado civil
> não é derivável do contrato público"**. **Errado.** As `description` não são 42 e sim **127, em 11
> schemas**, e a lista boa de estado civil está em **`TB_Funcionario`** (C, D, Q, S, V, U, O), junto
> com a de grau de instrução. Eu só havia lido o schema do envio. Ver
> `docs/GI-LEITURA-COMPLETA-DA-DOC.md`, que também traz as listas dos nove códigos curtos.

## 3. Os códigos de empresa e filial: descobertos, 127 pares

Não existe recurso `Filial` na API (443 rotas varridas): `codigoFilial` é campo de `TB_Empresa`, e os
dois códigos saem de uma leitura só. `Empresa/GetAll` devolve **127 pares (empresa, filial) em 47
empresas**, e os primeiros são exatamente o `empresa_grupo` da §A.3:

| código | empresa |
|---|---|
| 1 | SOULAN CONSULTORIA E MAO DE OBRA TEMPORARIA (filiais 0 a 999, SELLAN entre elas) |
| 2 | SOULAN ADM E ASSESSORIA EM RH LTDA |
| 4 | SOULAN CENTRAL DE ESTAGIOS LTDA |
| 6 | NEAT SOLUCOES E TECNOLOGIA RH LTDA |
| 30 | SELLAN CONSULTORIA E TRABALHO TEMPORARIO |

**Isto é o insumo do de/para empresa que o EA não tinha.** A lista completa dos 127 pares ficou fora
do repositório, em `~/gi-investigacao/empresas-filiais.txt` (modo 600): são razões sociais de
clientes do fornecedor, e a §A.6 pede minimização.

`Cliente/GetAll` **não foi lido**: o `seguranca` vetou, porque `TB_Cliente` traz `webSenha` e
`tokenAPIGI` de terceiros (§A.46), e não acrescenta nada ao objetivo. `Empresa/GetAll` passou com
projeção obrigatória, porque `TB_Empresa` carrega CPF de cinco pessoas físicas e `senhaSMTP`, e o
endpoint não aceita `$select`.

## 4. O TESTE COMPARATIVO: a hipótese está FALSIFICADA, e o Gilberto está errado

Dois envios, um por vez, com confirmação digitada, payload **idêntico nos dois** exceto a variável.
Os dois criaram: `HTTP 200`, `sucess: true`, `"Cadastro Efetuado Com Sucesso!"`.

| | `idRegistroWeb` | `codigoEmpresa` | `codigoFilial` |
|---|---|---|---|
| **COM empresa** | 18 | 1 | 1 |
| **SEM empresa** | 19 | **0** | **0** |

Lidos de volta na janela antes da promoção e comparados **campo a campo por diferença, não a olho**:

> **Os dois registros diferem em CINCO campos: `codigoEmpresa`, `codigoFilial`, `cpf`, `nome` e
> `idRegistroWeb`.** Os três últimos são o que eu variei de propósito (um CPF e um nome por braço,
> mais o id que o GI gera). **Em tudo o mais os dois são IDÊNTICOS**, com 75 e 73 campos não-vazios.

**Conclusões, nos termos da contradição que o diretor levantou:**

1. **"Sem `codigoEmpresa` e `codigoFilial` a integração NÃO ocorre" está ERRADO.** O diretor estava
   certo: o envio sem eles foi aceito, criou registro e nasceu com `statusPreCadastro: 2`, igual ao
   outro. Era assim que o 17 havia aparecido na tela dele.
2. **A hipótese do registro órfão também está ERRADA, e ela era minha.** Sem empresa o registro
   nasce com `codigoEmpresa: 0` e `codigoFilial: 0`, mas **persiste exatamente os mesmos campos**.
   Empresa e filial **não são** a variável que explica o que grava.
3. **O RG GRAVOU.** E a CTPS, e o endereço inteiro, e a filiação, e a naturalidade, e o código da
   cidade, e a raça (`1`), e o grau de instrução (`7`, que **não** virou `4`). **Nos dois braços.**
   Os dois comportamentos que o Gilberto não explicou simplesmente não se reproduziram.

### Então por que não gravou em 29/09? Porque o EA não MANDOU, e isso é defeito nosso

Os valores que voltaram naquele dia nos campos "perdidos" são, um por um, **o `default` declarado no
contrato**: `carteiraTrabalho` `00000000`, `serie` `00000`, `cepResid` `00000-000`, `grauInstrucao`
`4`, `raca` vazio, RG, endereço, filiação e naturalidade vazios, `codigoCidadeResid` `0`.

**Isso é a assinatura de campo que chegou NULO ou AUSENTE, não de valor que o GI recebeu e
descartou.** É o mesmo mecanismo que o Gilberto descreveu para a nacionalidade (nulo vira `010`), que
também é o `default` declarado: a regra não é especial da nacionalidade, é o comportamento de todos os
415 campos. O GI guardou exatamente o que recebeu. O que faltou foi o EA ter mandado.

### O que a sonda mediu, em um único request que não criou nada

Contagem 0 antes, 0 depois: **o 400 não cria registro** (medido, não assumido).

- **O `maxLength` é validado de verdade e derruba o ENVIO INTEIRO: 18 campos reprovados de uma vez**
  (`Agencia`, `BairroResid`, `CarteiraTrabalho`, `CepResid`, `CidadeResid`, `ContaCorrente`, `Email`,
  `EnderecoResid`, `EstadoCivil`, `GrauInstrucao`, `Nacionalidade`, `Naturalidade`, `Nome`, `OrgaoRG`,
  `RG`, `Raca`, `Serie`, `UFResid`). **Então os 25 campos sem corte são risco real, não teórico**: o
  primeiro candidato com nome de 61 caracteres perde a admissão inteira, não o nome.
- **O `Nome` tem validador de negócio próprio**, não é `maxLength` genérico: "Nome Inválido para o
  e-Social! Ulrapassou o limite de 60 caracteres!" (o erro de digitação é deles).
- **O padrão de zero à esquerda NÃO é validado.** `pis` `01234567890`, `titEleZona` `0012`,
  `codigoBcoFolha` `001` e `smsdddCel` `011` foram todos ACEITOS. **Mas o risco não desapareceu, ele
  mudou de forma**, e isto eu medi no registro criado: o CPF voltou como **`99999999999.0`**, ou seja,
  **o GI guarda o CPF como número de ponto flutuante**. Um CPF que começa com zero não é recusado,
  **é silenciosamente corrompido**, que é pior que o 400.
- **Chave desconhecida é ignorada em silêncio: `nomeBanco` foi ACEITO.** Confirma que devolver o
  campo não teria efeito nenhum.
- **O GI não valida dígito verificador de CPF** (aceitou dígito repetido), e é por isso que os dois
  envios usaram CPF que a Receita nunca emitiu.

### O que o diretor precisa pedir ao GI

**Os dois registros de teste estão VIVOS na produção do GI: `idRegistroWeb` 18 e 19** (as chaves
também estão em `~/gi-investigacao/.ENVIO-COMPARATIVO-FEITO`, modo 600). Peça ao Gilberto para
removê-los. A fábrica não tentou `Delete`: o endpoint existe no contrato, mas disparar exclusão com
id numa produção de folha é trocar um risco por um pior.

## 5. O que o Gilberto esclareceu, registrado

- **ADD x ADD_UPDATE.** O `Add` inclui registro novo; o `Add_Update` corrige depois. Confirmado no
  contrato: o `Add_Update` tem um parâmetro de query `JsonWhere` que o `Add` não tem, e é isso que o
  suporte chamou de "com a inclusão do campo Add". Usamos o `Add`.
- **NACIONALIDADE nula virando `010` é REGRA DELES, não defeito.** Confirmado pelo contrato, de outro
  jeito: `010` é o `default` declarado da propriedade, e a `description` diz "010 - Brasileiro".
- **A CEGUEIRA PÓS-MATRÍCULA É REAL, e fica como limitação.** Confirmado: o registro sai da
  `tb_funcionarioselecao` e fica na `tb_funcionario` quando é importado. Medi o efeito hoje:
  `FuncionarioSelecao/GetAll` devolve **zero registros**, ou seja, Maria (16) e João (17) já foram
  promovidos e **não há mais o que reler**. A janela de verificação é entre o envio e a promoção, e só
  acaba se o GI liberar leitura na `tb_funcionario`.

---

## 6. O que a fábrica PROPÕE e NÃO construiu (§A.31)

Nada disto está no escopo da OST, e nada disto foi implementado. É lista de decisão.

1. **`gi-api.service.ts` acredita que 200 prova criação, e não prova.** O 200 do `Add` é
   `MsgReturn {sucess, idRetorno, mensage, campoErro, obs}`, e o cliente do EA lê `json.value ?? json.id`,
   **chaves que não existem no contrato**. Dois efeitos: um `200 {sucess:false}` é reportado como
   `GI_ENVIADO` e carimba idempotência (família da §A.33, nada falha do ponto de vista do sistema), e
   o `idRetorno` nunca é capturado, então `gi_funcionario_selecao_id` nasce sempre nulo e não existe
   chave para localizar nem para pedir remoção. **Este é o item mais urgente dos seis.**
2. **A idempotência do envio não funciona.** `marcarEnviado` é um `UPDATE` que não cria a linha, e
   `jaEnviado` sempre devolve `false` quando a linha não existe: dois cliques no botão criariam dois
   registros na folha do fornecedor.
3. **Cortar os 25 campos de texto no `maxLength`**, pelo precedente que o diretor já definiu para o
   `cplEndereco` ("perder o final é melhor que perder a admissão"). Hoje um nome de 61 caracteres
   derruba o envio inteiro.
4. **Os 9 campos de CÓDIGO curto não podem ser cortados**: devem ir NULOS quando não couberem, pelo
   precedente do `mapearSexo`. Cortar "Brasileira" em "Bra" inventaria um código.
5. **Falta de/para para cinco campos de código** (`nacionalidade`, `naturalidade`, `estadoCivil`,
   `raca`, `grauInstrucao`), hoje coletados como texto livre. **Quatro dos cinco catálogos estão no
   próprio contrato**, nas `description` que ninguém tinha lido; só o de estado civil não está, porque
   a documentação do GI o trocou com o de grau de instrução.
6. **O de/para de banco está errado de desenho, e a fábrica NÃO pode consertar sozinha.** O
   `codigoBcoFolha` referencia `TB_Banco.codigoBanco`, e **`TB_Banco` é o catálogo das CONTAS da
   empresa** (tem agência, conta, cheque, conta contábil e saldo; 113 das 165 linhas têm conta
   preenchida). O código FEBRABAN existe no catálogo, mas no campo **`numeroBanco`**, e o FEBRABAN 341
   aparece em **40 linhas diferentes**, uma por empresa e finalidade. Então mandar 341 grava uma chave
   pendurada, e resolver o nome do banco para UM código depende de informação que o EA não tem.
   *(Precisão acrescentada em 01/10: antes esta linha dizia que o 341 "não existe no catálogo", o que
   era impreciso.)*
7. **O DDD sai errado quando o telefone traz o zero de operadora:** `011…` vira DDD `01`.
8. **O CPF é guardado como número de ponto flutuante pelo GI** (medido: `99999999999.0`). Um CPF que
   começa com zero é corrompido em silêncio, e `Number()` cego no nosso lado repetiria o erro.

## 7. As três perguntas que sobraram para o Gilberto

1. **`codigoBcoFolha` é a CONTA PAGADORA da empresa ou o BANCO DO FUNCIONÁRIO?** O catálogo
   `Banco/GetAll` são as contas do grupo ("CONTA SALÁRIO BRADESCO", "ITAU - SOULAN"), e o EA manda o
   banco do candidato traduzido pelo código FEBRABAN, que não existe lá.
2. **Qual é a lista de códigos de ESTADO CIVIL?** Não é derivável do contrato: a `description` de
   `estadoCivil` traz, por engano, a lista de grau de instrução.
3. **O `nomeBanco` que ele indicou não existe no `TB_FuncionarioSelecaoAPI`.** Ele olhou o catálogo
   `TB_Banco`? Se o nome do banco do funcionário tiver de chegar ao GI, por qual campo?
