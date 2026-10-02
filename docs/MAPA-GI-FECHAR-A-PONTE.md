# Mapa de alcance: fechar a ponte do GI (6 itens da OST, 02/10/2026)

Investigacao do coordenador ANTES do primeiro despacho (§A.27/§A.39 passo 1/§A.40 regra 1).
Tudo medido nesta data contra a producao do EA, a producao do GI (GET-only pela grade) e os dois bancos.

## 0. O ACHADO QUE MUDA O ITEM 2, e e por isso que ele vem primeiro

**UM de/para alimenta DOIS campos de ESPACOS DE CODIGO possivelmente DIFERENTES.**
`montarFuncionarioSelecao` (`domain/portal-dados-gi.ts:1341,1374`) chama o MESMO `depara.codigoCidade`
para:

| campo do GI | o que e | espaco do codigo | provado? |
|---|---|---|---|
| `codMunicipioNascto` | municipio de NASCIMENTO | **IBGE 7 digitos** | forte: e o padrao eSocial, e o GI guardou `3509502` (Campinas) no registro 27 |
| `codigoCidadeResid` | cidade de RESIDENCIA | **DESCONHECIDO** | **NAO**. Pode ser FK do catalogo interno do GI |

**O `7107` do `.env.example` e de fixture, nao de medicao.** Rastreado: aparece so no exemplo e em
3 specs, nunca numa leitura da producao do GI. Sao Paulo no IBGE e `3550308`, nao `7107`: se `7107`
veio de algum lugar real, o espaco NAO e IBGE.

**As duas fontes que resolveriam estao VAZIAS hoje, e foi medido:**
- `DePara/GetAll` do GI: HTTP 200, **0 itens**. O de/para do proprio fornecedor esta vazio.
- `FuncionarioSelecao/GetAll`: HTTP 200, **0 registros**. O GI consome a fila em menos de 10 min
  (medido na rodada 4: 2 as 13:38, 0 as 13:48), entao nao ha registro real de onde ler o par
  (cidade texto -> codigo).

**CONSEQUENCIA:** encher o mapa unico com IBGE faz `codMunicipioNascto` sair CERTO e
`codigoCidadeResid` sair com um codigo de OUTRO espaco, apontando para a cidade errada na folha, em
silencio. Isso e exatamente o que o cabecalho do `GiDeParaService` proibe: **"NUNCA SE INVENTA
CODIGO"**. Hoje os dois saem NULOS, que e fail-closed e nao mente.

## 1. Quem depende do que vai ser mexido

| ponto | quem le | risco |
|---|---|---|
| `GI_DEPARA_CIDADES` | `GiDeParaService.codigoCidade`, consumido por `codMunicipioNascto` E `codigoCidadeResid` | item 0 |
| `GI_PARES_EMPRESA_FILIAL` | `parEmpresaFilialConhecido`, guarda dura do passo 6 | **fail-closed hoje: lista vazia RECUSA todo envio**. Encher ABRE a guarda |
| `GI_DISPARO_ARMADO` | `enviarManual` passo 5 | ligar troca "monta e para" por POST real na folha |
| sufixo na saida | `codigoClienteGiDoCodigoDoEa` + 3a consulta do `gi-leitor` | so os 7 `cod_cliente` com sufixo passam por ali; os 244 numericos nem chegam |

## 2. O QUE A PRODUCAO NAO TEM, e trava o item 5

**ZERO variaveis `GI_` no `.env` de producao** (medido: `grep -cE "^GI" = 0`). Nao ha
`GI_ID_CLIENTE_WEB`, `GI_CHAVE_ACESSO`, `GI_LOGIN` nem `GI_SENHA`. Logo:
- hoje `enviarManual` devolve `GI_NAO_CONFIGURADO` e nao chega nem no passo 5;
- **armar a flag sozinho nao liga nada**: sem credencial a rota segue inerte;
- ligar de verdade exige INSTALAR credencial de producao no `.env`, que e acao de infra sobre
  credencial (§A.6, e a memoria de nao expurgar/mover credencial sozinho).

## 3. O QUE O PRIMEIRO ENVIO REAL CARREGARIA, medido

`lerPessoa` usa **leftJoin** em `admissao_dados_gi` (`gi-leitor.service.ts:105`), e producao tem
**ZERO linhas** naquela tabela. Entao um envio real hoje sai com o que vem de `candidatos` e da
contratacao, e com **RG, CTPS, filiacao, titulo, reservista, CNH, endereco e as 3 cidades NULOS**.
Nao e recusa: as guardas do passo 6 olham contratacao, nao documento de pessoa. O envio PASSA e
grava uma pre-admissao magra na folha.

## 4. Recorte nominal (§A.14). So estes arquivos, e nenhum outro

Do GI, soltos no working tree e a publicar: `domain/portal-dados-gi.ts`,
`domain/portal-dados-gi.montador.spec.ts`, `gi/gi-leitor.service.ts`,
`gi/gi-leitor-idempotencia.tester.spec.ts`.
**FORA, de outras sessoes e NAO tocados:** `portal-gi-gravacao.service.ts` (o veto V12 saiu para a
sessao do Portal por decisao do diretor), `portal-envio.ts`, `portal-evento.ts`,
`db/schema/enums.ts`, `db/schema/tables.ts` (hunks da frente de autenticidade, migration 0142),
e tudo de `as/digai`, `portal-acesso-email*` e `auditoria*`.
**Slot de migration: esta frente NAO cria migration.** A 0141 ja esta aplicada nos dois bancos; a
0142 e da outra sessao.
