# MAPA DE ALCANCE: releitura do schema do GI + teste comparativo com/sem empresa

Investigação do coordenador ANTES de qualquer construção (§A.27/§A.39 passo 1), para a OST
"RELER O SWAGGER INTEIRO + TESTE COM E SEM EMPRESA".

Fonte do contrato: `https://apigeral.gi.app.br/openapi/v1.json`, baixado em 01/10/2026
(OpenAPI 3.1.1, 443 rotas, 64 schemas). O schema do envio é `TB_FuncionarioSelecaoAPI`,
**415 propriedades, nenhuma `required`**.

## 1. O `nomeBanco` NÃO EXISTE no envio, e isto contraria o suporte

Varredura dos 64 schemas: `nomeBanco` existe **só** em `TB_Banco` (o catálogo de bancos, 45 campos)
e `nomeBancoFGTS` em `TB_Empresa`. Em `TB_FuncionarioSelecaoAPI` **não há nenhuma propriedade com
"banco" no nome além de `tipoMskBanco` e `tipoMskBancoReembolso`**; o banco da pessoa entra por
CÓDIGO (`codigoBcoFolha`, `codigoBcoPagar`, int16).

Consequência: devolver o campo como `nomeBanco` acrescentaria ao envio uma chave que o contrato não
tem. O `Add` ignora chave desconhecida em silêncio (foi o que aconteceu com `ufCTPS`), então o
efeito prático seria zero, e a remoção do `bancoNome` continua correta.

## 2. Os ÚNICOS quatro campos não-anuláveis e sem default

Dos 415, 52 são não-anuláveis, e **só quatro não têm default**: `codigoEmpresa` (int16),
`codigoFilial` (int16), `codigoFuncionario` (int16) e `idRegistroWeb`. Todos os outros 411 são
anuláveis ou têm default. Isso é coerente com o que o suporte afirmou sobre empresa e filial serem
obrigatórios, e é coerente TAMBÉM com o que o diretor observou: omitir um `short` não-anulável em
.NET não derruba o request, cai no `default(short)` = **0**. O registro nasce com empresa 0 e filial
0, ou seja, órfão. "A integração não ocorre" e "o registro apareceu" podem ser as duas faces disso.
É exatamente a hipótese que o teste comparativo mede.

## 3. As divergências de TIPO e TAMANHO que ninguém tinha visto (41 dos 43 campos)

Os 43 nomes que o EA envia existem todos no contrato (os 4 de nome errado foram corrigidos em
29/09). O que sobrou é outra classe de divergência, **não de nome**:

- **24 campos de texto com `maxLength` que o EA NÃO corta.** Só `cplEndereco` é cortado (30). Os
  outros saem inteiros: `nome` 60, `email` 50, `filiacaoNomeMae`/`filiacaoNomePai` 70,
  `enderecoResid` 70, `bairroResid`/`cidadeResid` 60, `rg` 20, `orgaoRG` 15, `contaCorrente` 20,
  `tituloEleitor`/`reservista`/`habilitacao` 40, `carteiraTrabalho` 10, `serie` 7, `agencia` 10,
  `cepResid` 9, e os de código curto `sexo`/`estadoCivil`/`raca`/`grauInstrucao` 1,
  `naturalidade`/`ufrg`/`ufExpedicao`/`ufResid` 2, `nacionalidade` 3. O GI **valida tamanho e
  recusa o envio inteiro com 400** (medido em 29/09: `"Naturalidade": ["Máximo 2 caracteres"]`).
- **9 campos numéricos com `pattern` `^-?(?:0|[1-9]\d*)$`, que PROÍBE zero à esquerda:** `cpf`
  (double), `pis` (double), `smsdddCel` (uint8), `smsNroCel` (double), `titEleZona`/`titEleSecao`
  (int16), `codigoCidadeResid` (int32), `codigoBcoFolha`/`codigoBcoPagar` (int16). O EA manda
  string crua. **CPF que começa com zero quebra o padrão**, e banco "001" (Banco do Brasil) também.
- **6 campos `date-time`** recebendo `YYYY-MM-DD` das colunas `date` do Postgres. O nascimento
  entrou no teste de 29/09, então na prática o GI parseia; fica registrado, não como defeito.

**Nada disso é escopo desta OST para CONSTRUIR (§A.31).** É a lista pedida no item 2, e a correção
é proposta ao diretor.

## 4. Quem depende do que seria mexido

- `montarFuncionarioSelecao` e a interface `FuncionarioSelecao` (`domain/portal-dados-gi.ts`) são
  lidos por `gi/enviar-para-gi.service.ts` e tipados em `gi/gi-api.service.ts`. Nada mais consome.
- Testes no caminho: `domain/portal-dados-gi.montador.spec.ts`,
  `portal/portal-dados-gi.contrato.tester.spec.ts`, `gi/enviar-para-gi.service.spec.ts`,
  `gi/gi-api.service.spec.ts`.
- O disparo real continua travado por `GI_DISPARO_ARMADO`, desligada.

**Decisão de recorte:** o teste comparativo é MEDIÇÃO e roda por arnês fora do repositório
(`~/gi-investigacao`), no molde do `gi-disparar-maria.ts`. O código de produto NÃO é alterado para
medir, então nenhum arquivo validado é tocado antes de o diretor decidir (§A.26).

---

# As correções que a auditoria e o teste fizeram NESTE mapa

O mapa acima é a investigação do coordenador. O `tester` e o `seguranca` o reconferiram contra o
contrato e **acharam erro meu em oito pontos**. Ficam registrados aqui porque a primeira redação
circulou e porque um normalizador escrito a partir dela sairia errado.

## O que estava errado na minha contagem

1. **"24 campos de texto não cortados" está errado: são 27 emitidos com `maxLength`.** Descontando
   `cplEndereco` (já cortado) e `sexo` (seguro por `mapearSexo`), o risco real é de **25**, e o teste
   provou **17** estourando.
2. **"6 campos `date-time`" está errado: o montador emite 5** (`dataNascimento`, `dtExpedicaoRG`,
   `dtExpedicaoCTPS`, `cnhDataEmissao`, `dataVectoHabilitacao`).
3. **O padrão numérico não é um, são dois.** `cpf`, `smsNroCel` e `pis` usam
   `^-?(?:0|[1-9]\d*)(?:\.\d+)?$`, que **aceita parte decimal**; os outros sete usam a variante
   inteira. Quem escrever o normalizador lendo só a primeira redação rejeitaria valor que o GI aceita.
4. **`nroEndereco` é o único numérico NÃO-anulável do grupo.** Um normalizador genérico que mande
   tudo para `null` quando vazio **quebraria** este campo.

## O que eu não tinha visto, e muda o que se pode deduzir

5. **A aba SCHEMA documenta os domínios em 42 `description`.** Era o que o Swagger escondia, e é a
   fonte dos valores válidos que a API nega por endpoint (`Raca/GetAll` e companhia dão 404).
6. **`estadoCivil` e `grauInstrucao` estão TROCADOS na documentação do GI**: a `description` de
   `estadoCivil` é a lista de grau de instrução, e `grauInstrucao` não tem nenhuma. O código de
   estado civil **não é derivável** do contrato público.
7. **`smsdddCel` é `uint8` e o DDD sai errado quando o telefone traz o zero de operadora:** `011…`
   vira DDD `01`. Viola o padrão **e** está semanticamente errado. O conserto é descartar o zero
   inicial antes de separar, não só normalizar.
8. **Os cinco campos de código (`nacionalidade`, `naturalidade`, `estadoCivil`, `raca`,
   `grauInstrucao`) não têm de/para nenhum.** São coletados como `tipo: "texto"` livre
   (`dados-gi-campos.ts`) e o GI quer código de tabela fechada. **Nulo trava o dano mas não entrega a
   funcionalidade:** sem catálogo, esses cinco campos nunca chegam preenchidos.

## Os achados de segurança que mudaram o plano, não só o texto

- **A1.** O molde que eu ia copiar (`gi-disparar-maria.ts:18`) tem um **UUID pendurado**: aquela
  admissão não existe mais na homologação. Copiar o molde era repetir o gesto que a trava teme.
- **A2.** **A idempotência do EA não funciona neste caminho.** `marcarEnviado`
  (`gi-leitor.service.ts:104`) é um `UPDATE` que **não cria a linha**, e `admissao_dados_gi` está
  vazia, então `jaEnviado` sempre devolve `false` e o `UPDATE` afeta zero linhas sem erro. Rodar o
  envio manual duas vezes criaria **dois** registros na produção do fornecedor.
- **A3.** **O 200 do `Add` é `MsgReturn {sucess, idRetorno, mensage, campoErro, obs}`, e o cliente do
  EA lê `value`/`id`, que não existem** (`gi-api.service.ts:225`). Dois efeitos: um
  `200 {sucess:false}` é reportado como `GI_ENVIADO` e carimba idempotência (família da §A.33), e o
  `idRetorno` **nunca é capturado**, então `gi_funcionario_selecao_id` nasce sempre nulo e não há
  chave para localizar nem para pedir a remoção do registro.
- **A6.** **Não existe recurso `Filial` na API** (443 rotas varridas): `codigoFilial` é campo de
  `TB_Empresa`, então os dois códigos saem de uma leitura só.
- **A8.** **Não existe faixa de CPF reservada para teste no Brasil.** Os `999000001xx` da
  homologação têm **verificador válido** e podem pertencer a alguém vivo. Por isso os dois envios
  usam CPF de **dígito repetido**, que a Receita nunca emitiu.
- **`Cliente/GetAll` ficou VETADO:** `TB_Cliente` traz **`webSenha` e `tokenAPIGI`** de terceiros
  (§A.46). `Empresa/GetAll` passou com projeção obrigatória, porque `TB_Empresa` carrega CPF de cinco
  pessoas físicas e **`senhaSMTP`**, e o endpoint **não aceita `$select`**: o recorte é todo nosso.
