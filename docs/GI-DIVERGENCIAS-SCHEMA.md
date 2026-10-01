# GI: lista COMPLETA das divergências campo a campo (contrato x envio do EA)

Conferido em 01/10/2026 contra `https://apigeral.gi.app.br/openapi/v1.json`, schema
`TB_FuncionarioSelecaoAPI` (**415 propriedades, nenhuma `required`**). Gerado por varredura do
contrato, não a olho, e reconferido por um `tester` independente (§A.38).

**Os 43 campos que o EA envia existem TODOS no contrato.** Nenhum erro de NOME restou depois da
correção de 29/09, e **`nomeBanco` não é a exceção: ele não existe neste schema** (só em `TB_Banco`).
O que a releitura achou é divergência de **tipo, tamanho, valor e domínio**.

## A tabela

Legenda da coluna "divergência": **tamanho** = o GI recusa o envio inteiro com 400 acima do máximo;
**zero à esquerda** = o padrão do contrato proíbe; **código** = campo de tabela fechada, em que cortar
o texto inventaria um código.

| campo do EA | contrato do GI | valores válidos documentados no schema | divergência |
|---|---|---|---|
| `nome` | `null|string`, máx **60** | não documentado | **tamanho**: o EA manda cru, acima de 60 o GI recusa o envio inteiro |
| `cpf` | `null|number|string` `double` | não documentado | **zero à esquerda** proibido (aceita decimal); o EA manda string crua |
| `dataNascimento` | `null|string` `date-time` | não documentado | contrato pede `date-time`, o EA manda `YYYY-MM-DD`; na prática o GI parseia (medido 29/09) |
| `sexo` | `null|string`, máx **1** | F - Feminino
 · M - Masculino | nenhuma: `mapearSexo` já devolve M/F ou nulo |
| `email` | `null|string`, máx **50** | não documentado | **tamanho**: o EA manda cru, acima de 50 o GI recusa o envio inteiro |
| `smsdddCel` | `null|integer|string` `uint8` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `smsNroCel` | `null|number|string` `double` | não documentado | **zero à esquerda** proibido (aceita decimal); o EA manda string crua |
| `nacionalidade` | `null|string`, máx **3** | 010 - Brasileiro
 · 013 - Afeganistao
 · 017 - Albania, Republica Da
 … | **código**: o EA manda texto livre; acima de 3 derruba o envio, e cortar inventaria código |
| `naturalidade` | `null|string`, máx **2** | AC
 · AL
 · AM
 · AP
 · BA
 · CE
 · DF
 · ES
 · GO
 · MA
 · MG
 · MS
 … | **código**: o EA manda texto livre; acima de 2 derruba o envio, e cortar inventaria código |
| `filiacaoNomeMae` | `null|string`, máx **70** | não documentado | **tamanho**: o EA manda cru, acima de 70 o GI recusa o envio inteiro |
| `filiacaoNomePai` | `null|string`, máx **70** | não documentado | **tamanho**: o EA manda cru, acima de 70 o GI recusa o envio inteiro |
| `estadoCivil` | `null|string`, máx **1** | 1 - Analfabeto
 · 2 - Até 5º Ano Incompleto
 · 3 - 5º Ano Completo
 · … | **código**: o EA manda texto livre; acima de 1 derruba o envio, e cortar inventaria código |
| `raca` | `null|string`, máx **1** | 1 - Branca
 · 2 - Preta
 · 3 - Amarela
 · 4 - Parda
 · 5 - Indígena | **código**: o EA manda texto livre; acima de 1 derruba o envio, e cortar inventaria código |
| `grauInstrucao` | `null|string`, máx **1** | não documentado | **código**: o EA manda texto livre; acima de 1 derruba o envio, e cortar inventaria código |
| `rg` | `null|string`, máx **20** | não documentado | **tamanho**: o EA manda cru, acima de 20 o GI recusa o envio inteiro |
| `orgaoRG` | `null|string`, máx **15** | não documentado | **tamanho**: o EA manda cru, acima de 15 o GI recusa o envio inteiro |
| `ufrg` | `null|string`, máx **2** | AC
 · AL
 · AM
 · AP
 · BA
 · CE
 · DF
 · ES
 · GO
 · MA
 · MG
 · MS
 … | **código**: o EA manda texto livre; acima de 2 derruba o envio, e cortar inventaria código |
| `dtExpedicaoRG` | `null|string` `date-time` | não documentado | contrato pede `date-time`, o EA manda `YYYY-MM-DD`; na prática o GI parseia (medido 29/09) |
| `carteiraTrabalho` | `null|string`, máx **10** | não documentado | **tamanho**: o EA manda cru, acima de 10 o GI recusa o envio inteiro |
| `serie` | `null|string`, máx **7** | não documentado | **tamanho**: o EA manda cru, acima de 7 o GI recusa o envio inteiro |
| `ufExpedicao` | `null|string`, máx **2** | AC
 · AL
 · AM
 · AP
 · BA
 · CE
 · DF
 · ES
 · GO
 · MA
 · MG
 · MS
 … | **código**: o EA manda texto livre; acima de 2 derruba o envio, e cortar inventaria código |
| `dtExpedicaoCTPS` | `null|string` `date-time` | não documentado | contrato pede `date-time`, o EA manda `YYYY-MM-DD`; na prática o GI parseia (medido 29/09) |
| `pis` | `null|number|string` `double` | não documentado | **zero à esquerda** proibido (aceita decimal); o EA manda string crua |
| `tituloEleitor` | `null|string`, máx **40** | não documentado | **tamanho**: o EA manda cru, acima de 40 o GI recusa o envio inteiro |
| `titEleZona` | `null|integer|string` `int16` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `titEleSecao` | `null|integer|string` `int16` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `reservista` | `null|string`, máx **40** | não documentado | **tamanho**: o EA manda cru, acima de 40 o GI recusa o envio inteiro |
| `habilitacao` | `null|string`, máx **40** | não documentado | **tamanho**: o EA manda cru, acima de 40 o GI recusa o envio inteiro |
| `cnhDataEmissao` | `null|string` `date-time` | não documentado | contrato pede `date-time`, o EA manda `YYYY-MM-DD`; na prática o GI parseia (medido 29/09) |
| `dataVectoHabilitacao` | `null|string` `date-time` | não documentado | contrato pede `date-time`, o EA manda `YYYY-MM-DD`; na prática o GI parseia (medido 29/09) |
| `cepResid` | `null|string`, máx **9** | não documentado | **tamanho**: o EA manda cru, acima de 9 o GI recusa o envio inteiro |
| `enderecoResid` | `null|string`, máx **70** | não documentado | **tamanho**: o EA manda cru, acima de 70 o GI recusa o envio inteiro |
| `nroEndereco` | `integer|string` `int32` | não documentado | nenhuma: já é inteiro, e é o único numérico **não-anulável** do grupo |
| `cplEndereco` | `null|string`, máx **30** | não documentado | nenhuma: é o único campo de texto que o EA já corta (30) |
| `bairroResid` | `null|string`, máx **60** | não documentado | **tamanho**: o EA manda cru, acima de 60 o GI recusa o envio inteiro |
| `cidadeResid` | `null|string`, máx **60** | não documentado | **tamanho**: o EA manda cru, acima de 60 o GI recusa o envio inteiro |
| `ufResid` | `null|string`, máx **2** | AC
 · AL
 · AM
 · AP
 · BA
 · CE
 · DF
 · ES
 · GO
 · MA
 · MG
 · MS
 … | **código**: o EA manda texto livre; acima de 2 derruba o envio, e cortar inventaria código |
| `codigoCidadeResid` | `null|integer|string` `int32` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `codigoBcoFolha` | `null|integer|string` `int16` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `codigoBcoPagar` | `null|integer|string` `int16` | não documentado | **zero à esquerda** proibido (inteiro); o EA manda string crua |
| `agencia` | `null|string`, máx **10** | não documentado | **tamanho**: o EA manda cru, acima de 10 o GI recusa o envio inteiro |
| `contaCorrente` | `null|string`, máx **20** | não documentado | **tamanho**: o EA manda cru, acima de 20 o GI recusa o envio inteiro |

## O que a tabela resume, em número

- **27 campos emitidos têm `maxLength`.** Só `cplEndereco` é cortado. `sexo` é seguro por outro
  caminho. Sobram **25 sem proteção**, dos quais 17 foram provados estourando em teste.
- **10 campos emitidos têm padrão numérico**, que proíbe zero à esquerda. Sete são inteiros
  (`smsdddCel`, `titEleZona`, `titEleSecao`, `nroEndereco`, `codigoCidadeResid`, `codigoBcoFolha`,
  `codigoBcoPagar`) e três aceitam decimal (`cpf`, `smsNroCel`, `pis`). **CPF que começa com zero
  quebra o padrão**, e banco "001" também.
- **5 campos `date-time`** recebem `YYYY-MM-DD` das colunas `date` do Postgres.

## O achado que o Swagger escondia: 42 campos CARREGAM a lista de valores válidos

A aba SCHEMA tem `description` em **42 propriedades**, e é ali que vivem os domínios que a API nega
por endpoint (`Raca/GetAll`, `Nacionalidade/GetAll` e companhia dão 404). Ninguém havia lido isso.
Entre os que o EA envia: `raca` (1 Branca a 5 Indígena), `nacionalidade` (250 países, `010`
Brasileiro), `naturalidade` e as três UF (as 27 siglas), `sexo` (F/M).

**E um defeito na documentação do próprio GI:** a `description` de `estadoCivil` é a lista de **grau
de instrução** ("1 Analfabeto … B Mestrado"), e `grauInstrucao` **não tem description nenhuma**
(`default` 4). Os dois estão trocados na origem.

> **CORREÇÃO DE 01/10, pela leitura completa:** a frase que estava aqui, "o código de estado civil
> NÃO é derivável do contrato público", **estava errada**. As `description` são **127, em 11
> schemas**, não 42 em um só, e a lista boa está em **`TB_Funcionario`**. As nove listas dos códigos
> curtos estão em `docs/GI-LEITURA-COMPLETA-DA-DOC.md`.

