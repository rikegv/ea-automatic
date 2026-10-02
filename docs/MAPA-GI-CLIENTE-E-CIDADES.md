# Mapa: o cliente final e as quatro cidades que faltaram

Investigação do coordenador ANTES de despachar (§A.27/§A.39 passo 1), medida em 02/10/2026 contra o
contrato do GI e a produção do EA.

## 1. O CLIENTE FINAL: o diretor está certo, e o de/para é DIRETO. Medido.

Ele disse que o código do cliente já está cadastrado na plataforma e é **o mesmo do GI**. Confirmei:

- `clientes.cod_cliente` é **numérico em 244 dos 251** clientes;
- cruzando com os `codigoCliente` reais do GI (7.525 distintos, lidos pelo catálogo de centro de
  custo): **243 dos 244 CASAM**, ou seja, **99%**;
- o único que não casa é `26360` (RAIA DROGASIL), e **provavelmente é falso negativo da minha
  amostra**, não divergência: a minha lista do GI vem só de clientes que têm centro de custo
  cadastrado, então cliente sem centro de custo não apareceria.

**Conclusão: `codigoCliente` = `clientes.cod_cliente`, sem tabela de de/para, sem pergunta ao
fornecedor.** É o campo `codigoCliente` do DTO (`int32`, default `0`), e ele é **distinto** de
`codigoEmpresa`/`codigoFilial`, que são a empresa do Grupo Soulan e já vão.

**Fail-closed:** cliente com `cod_cliente` não numérico (7 deles) **recusa**, nunca manda `0`, pelo
mesmo motivo de sempre: `0` não é "vazio", é referência a cliente inexistente.

## 2. AS QUATRO CIDADES: o mapeamento está resolvido pelos VIZINHOS do contrato

O contrato não tem `description` nesses campos, então confirmei pela posição, que no schema do GI
segue a ordem do formulário. **Isso importa porque a frente já pagou uma colisão de nome** (o
`tipoContrato` do GI que não é o nosso), e trocar cidade do RG por cidade da CTPS seria o mesmo erro:

| campo do GI | máx | vizinhos no schema | logo é |
|---|---|---|---|
| `cidadeRG` | 30 | entre `orgaoRG` e `ufrg` | a cidade do **RG** |
| `cidadeExpedicao` | 30 | entre `ufExpedicao` (que é a UF da CTPS) e `dataNascimento` | a cidade da **CTPS** |
| `cidadeNascimento` | 30 | ao lado de `dataNascimento` e `sexo` | a cidade de **nascimento** |
| `codMunicipioNascto` | `int` | longe dos outros três | o **código IBGE** do município de nascimento |

E fica o registro de que **`naturalidade` (máx 2) continua sendo a UF**, não a cidade: são campos
diferentes, e é por isso que a tela do candidato pede "UF De Nascimento".

## 3. DE ONDE VEM CADA UMA: o dado ESTÁ nos documentos, a IA é que não pede

Levantei `ai-service/app/portal_extracao.py`. Hoje a extração pede, por documento:

- **RG**: número, órgão emissor, UF, data de emissão, nome, nascimento, mãe, pai. **Não pede cidade,
  nem a de emissão nem a naturalidade**, e o RG brasileiro traz as duas.
- **CTPS**: número, série, UF, data de expedição, PIS, nome, nascimento. **Não pede a cidade de
  expedição**, e a CTPS traz.
- **Certidão de nascimento/casamento**: hoje só estado civil e nome. **É a fonte mais confiável da
  cidade de nascimento.**

**Então a resposta à pergunta do diretor é a terceira opção dele, não a primeira nem a segunda:** não
é campo novo na tela e **não é dado que a IA lê e a gente descarta**. É dado que **está no documento e
a IA não é perguntada**. O caminho é acrescentar o campo à extração, à allowlist, à coluna e ao
payload, nessa ordem.

*(O precedente que o diretor citou, a data da CTPS, era diferente: ali a IA EMITIA `ctpsDataExpedicao`
e a allowlist só aceitava `ctpsData`, então a chave morria fora da lista. Aqui a IA nem emite.)*

**O `codMunicipioNascto` é o único que NÃO sai de documento:** é código IBGE, e precisa do mesmo
de/para que `codigoCidadeResid` já usa (`GI_DEPARA_CIDADES`, hoje **vazio**, então aquele campo
também sai nulo). Um de/para serve os dois.

## 4. Alcance

- `ai-service/app/portal_extracao.py`: três campos novos em três tipos de documento.
- `domain/dados-gi-campos.ts`: a allowlist, que é o que impede a chave de morrer em silêncio.
- `db/schema/tables.ts` + migration: quatro colunas novas em `admissao_dados_gi`.
- `domain/portal-dados-gi.ts`: a allowlist de pessoa, o montador e o corte em 30.
- `gi/gi-leitor.service.ts`: a leitura nominal.
- **Frontend: provavelmente NADA.** Campo vindo de documento aparece na conferência por construção;
  quem precisa de tela é só o que NÃO sai de documento. A confirmar antes de concluir.
