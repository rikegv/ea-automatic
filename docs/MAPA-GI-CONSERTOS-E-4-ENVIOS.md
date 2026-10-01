# Mapa de alcance: os 3 consertos, o `codigoBcoFolha` e os 4 envios mistos

Investigação do coordenador ANTES de despachar (§A.27/§A.39 passo 1). Duas das quatro decisões do
diretor mudam de tamanho quando o alcance é medido, e é melhor ele saber antes de a fábrica construir.

## Decisão 2 (lista fechada) encolheu de CINCO campos para DOIS

Eu havia listado cinco campos de texto livre. **Três já são lista fechada na tela do candidato**, com
os códigos do GI, em `apps/frontend/src/lib/portal-dados-gi.ts`:

| campo | na tela do candidato HOJE | o que falta |
|---|---|---|
| `raca` | `tipo: "select"`, 6 opções com os códigos | **nada** |
| `grauInstrucao` | `tipo: "select"`, 13 opções com os códigos | **nada** |
| `estadoCivil` | `tipo: "select"`, 7 opções com os códigos | **nada** |
| `nacionalidade` | `tipo: "texto"`, ajuda "Por exemplo: Brasileira." | lista fechada, 254 valores, default `010` |
| `naturalidade` | `tipo: "texto"`, ajuda "A cidade e o estado onde você nasceu." | **seletor de UF**, e o texto de ajuda está ERRADO |

O `tipo: "texto"` que eu vi em `domain/dados-gi-campos.ts` **não é o controle da tela**: é só a
validação de formato na gravação (`"texto" | "data" | "uf"`). Confundi os dois, e é essa a origem do
"cinco".

**O achado que importa: a ajuda de `naturalidade` pede a coisa errada ao candidato.** O GI quer a
**sigla da UF**, 2 caracteres, e a tela pede "a cidade e o estado onde você nasceu". O comentário do
próprio arquivo registra a dúvida ("naturalidade pode ser código de município ou texto, ainda em
confirmação"). **A leitura completa da documentação resolveu**: a `description` do campo lista as 27
siglas de UF. Então o conserto é seletor de UF e rótulo "UF De Nascimento" (§A.24).

**Isto toca a tela do CANDIDATO, que é código validado e em produção.** Entra com prova visual
obrigatória (§A.13), e a prova é minha, não do agente.

## Decisão 1 (normalização numérica): o pedido, ao pé da letra, CORROMPERIA o CPF

A OST autoriza a normalização para "impedir o CPF com zero à esquerda de ser corrompido". Medindo o
contrato e a produção, a régua tem de ser diferente em dois grupos, e não um só:

- **Os campos de padrão INTEIRO** (`smsdddCel`, `titEleZona`, `titEleSecao`, `codigoCidadeResid`):
  tirar o zero à esquerda é seguro, porque `"0012"` e `"12"` são o MESMO inteiro. Aqui a normalização
  é um ganho puro, e conserta de passagem o defeito do DDD: telefone gravado com o zero de operadora
  (`011…`) hoje produz DDD `01`, que viola o padrão **e** está semanticamente errado.
- **`cpf` e `pis`** (padrão que aceita decimal): **tirar o zero à esquerda APAGA um dígito do
  documento.** `"09988877766"` viraria `"9988877766"`, que é outro número. A régua da normalização
  aqui é o oposto: **preservar todos os dígitos**.

E a razão pela qual nenhuma das duas resolve o problema por inteiro, medida na produção: **o GI guarda
o CPF como número de ponto flutuante** (o registro criado voltou `99999999999.0`). O zero à esquerda
se perde no ARMAZENAMENTO do fornecedor, não no nosso envio. O mais provável é que a tela do GI
reponha o zero ao formatar os 11 dígitos, e é exatamente isso que os 4 envios vão medir, com um CPF
iniciado em zero.

**Consequência para a régua do `tester`:** dois dos quatro testes que sobraram codificam o requisito
errado. O que exige `"09988877766"` sair como `"9988877766"` pede a corrupção, e o do código de banco
`001` fica sem objeto, porque o campo sai do envio (decisão 4).

## Decisão 4: tirar o `codigoBcoFolha` deixa o BANCO do funcionário sem campo nenhum

O diretor resolveu a dúvida: o `341` é a conta pagadora do contas a pagar, quem cadastra é o time de
folha, e o EA não deve mandar. Então saem do envio `codigoBcoFolha` e `codigoBcoPagar`, e com eles o
de/para de banco (`DeParaGi.codigoBanco`, `GI_DEPARA_BANCOS`), que existia só para alimentá-los.

**Registro de precisão, porque o diretor disse "o que a gente manda é o banco do funcionário pelos
campos próprios dele":** os campos próprios do funcionário que sobram no contrato são **`agencia` e
`contaCorrente`**, e eles continuam sendo enviados. **A INSTITUIÇÃO bancária do funcionário não tem
campo nenhum** no DTO da pré-admissão, e não é esquecimento do EA: a folha OFICIAL (`TB_Funcionario`,
365 campos) também não tem. O único caminho do GI para o banco é a chave estrangeira para `TB_Banco`,
que é o catálogo de contas da empresa, justamente o que sai do envio. Então, depois deste conserto, o
GI recebe agência e conta **sem o banco**, e quem informa o banco é o time de folha, na tela.

## Decisão 3 (idempotência): o alcance é pequeno e está todo em um arquivo

`gi-leitor.service.marcarEnviado` é um `UPDATE ... WHERE admissao_id = ?` que **não cria a linha**, e
`jaEnviado` devolve `false` quando a linha não existe. Com a linha ausente, o `UPDATE` afeta zero
linhas **sem erro**, e a segunda tentativa cria um segundo registro no GI. O conserto é um upsert.
Quem consome: só `enviar-para-gi.service.ts`.

## Quem depende do que vai ser mexido

- `montarFuncionarioSelecao` e a interface `FuncionarioSelecao` (`domain/portal-dados-gi.ts`): lidos
  por `gi/enviar-para-gi.service.ts` e tipados em `gi/gi-api.service.ts`. Nada mais.
- `GiDeParaService` (`gi/gi-depara.service.ts`) e seu spec: só o `codigoBanco` sai; o `codigoCidade`
  fica.
- `CAMPOS_SEM_DOCUMENTO` (`frontend/src/lib/portal-dados-gi.ts`): consumido pela tela `/portal`.
- `gi-leitor.service.ts`: só `enviar-para-gi.service.ts`.
- Testes no caminho: `portal-dados-gi.montador.spec.ts`,
  `portal-dados-gi.contrato-schema.tester.spec.ts`, `portal/portal-dados-gi.contrato.tester.spec.ts`,
  `gi/*.spec.ts`, `frontend/src/lib/portal-dados-gi.spec.ts` (se existir).
