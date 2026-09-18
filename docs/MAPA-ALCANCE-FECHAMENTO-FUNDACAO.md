# Mapa De Alcance: O Fechamento Da Fundação

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Tipo:** mapa de alcance (§A.27, §A.39 passo 1)
**Auditado pelo `seguranca` ANTES do primeiro despacho (§A.40 regra 1). Segunda versão, depois
da decisão do diretor pela OPÇÃO 2 (separar o campo).**
§A.11 (sem travessão), §A.24 (title case).

## 0. O QUE MUDOU DESDE A PRIMEIRA VERSÃO DESTE MAPA

A primeira versão supunha pôr cadeado no campo `origem` como ele é. O diretor escolheu a
**opção 2: SEPARAR**. Isso troca uma frente pequena por uma maior, e o `seguranca` vetou a versão
anterior em três itens, todos absorvidos aqui.

## 1. A SEPARAÇÃO: `origem` vira SÓ o sistema, e a retenção vira campo próprio

**Hoje um campo responde três perguntas**, e é essa mistura que concede vida eterna a dado pessoal
por acidente:

| Valor de hoje | Que pergunta responde | Para onde vai |
|---|---|---|
| `PANDAPE` | de qual SISTEMA veio | fica em `origem` |
| `MANUAL` | COMO entrou | fica em `origem` |
| `INDICACAO` | por qual CANAL chegou | fica em `origem` |
| `BANCO_TALENTOS` | **quanto tempo se guarda** | **SAI. Vira campo próprio de retenção** |

**`origem` passa a ser:** `PANDAPE`, `DIGAI`, `MANUAL`, `INDICACAO`. O `DIGAI` entra porque a
decisão 0.7.1 define origem como "de qual sistema a plataforma puxou", e o Digai é o segundo
sistema. **A plataforma preenche sozinha** quando puxa por API; o valor digitado na tela vale só
para o cadastro manual.

**A retenção vira `as_candidatos.banco_talentos`**, booleano, `NOT NULL DEFAULT false`. É o campo
que isenta do expurgo, e é o único que ganha cadeado.

**A JANELA ESTÁ ABERTA E É AGORA**, e a régua correta NÃO é "a tabela está vazia". Esta é a
**correção do `seguranca`, conferida pelo coordenador**, e ela derruba a primeira redação:

A instância `ea-db` tem **CINCO bancos**, não dois, e **QUATRO deles têm `as_candidatos`**:

| Banco | Linhas | Com `BANCO_TALENTOS` | Com identificador externo |
|---|---|---|---|
| `ea_automatic` (produção) | 0 | 0 | 0 |
| `ea_automatic_homolog` | 0 | 0 | 0 |
| `ea_ensaio_migrations` | **3** | 0 | 0 |
| `ea_homolog_clone_etapa1` | **2** | 0 | 0 |

**Logo a guarda da migration é POR VALOR, nunca por vazio.** Abortar porque existe linha reprovaria
a migration em dois bancos legítimos. O que ela prova antes de recriar o tipo é que **nenhuma linha
tem `origem = 'BANCO_TALENTOS'`**, que é o único valor que o cast novo não conseguiria converter.
Medido agora: zero nos quatro.

**O Postgres não apaga valor de enum** (`ALTER TYPE ... DROP VALUE` não existe), então o tipo é
recriado. **A coluna tem `DEFAULT 'MANUAL'`, e com o default posto o `ALTER COLUMN ... SET DATA
TYPE` FALHA.** A ordem, que não é negociável: `DROP DEFAULT`, renomear o tipo velho, criar o novo,
`ALTER COLUMN ... USING origem::text::as_candidato_origem`, `SET DEFAULT`, `DROP TYPE` velho. O
índice `idx_as_candidatos_origem` é reconstruído sozinho. **Só `as_candidatos.origem` usa o tipo**,
conferido no catálogo.

## 2. O CADEADO: só SUPER_ADMIN marca ou desmarca a retenção, com trilha

**A guarda é POR CAMPO, no serviço, e vale na EDIÇÃO E NA CRIAÇÃO.** Fechar só a edição deixa o
buraco que o `seguranca` achou e o coordenador confirmou: a tela de cadastrar oferece o campo, e a
rota `POST /as/candidatos` (`candidatos.controller.ts:50`) não tem `@Roles`. Quem quisesse
imortalizar alguém cadastraria de novo.

**A forma da guarda é a que o `seguranca` exigiu, e não é "comparar e recusar":** quando o autor
não é SUPER_ADMIN, o campo **simplesmente não entra no objeto gravado**. Isso mata de uma vez três
contornos que ele enumerou:
- **`null` contra `undefined`:** `@IsOptional()` deixa `null` passar, e uma guarda escrita como
  `!== undefined` recusaria um salvamento que não muda nada.
- **O valor igual:** reenviar o mesmo valor não é mudança e não pode ser recusado, senão todo
  salvamento de formulário do consultor COMUM quebra.
- **A leitura e a escrita não são atômicas.** Um COMUM com o formulário desatualizado mandaria o
  valor velho e **desfaria em silêncio** a decisão de um SUPER_ADMIN, devolvendo ao expurgo
  irreversível alguém que fora tornado permanente. Campo fora do `set` não tem esse caminho.

**A recusa explícita, com trilha, fica só para a tentativa de MUDANÇA REAL**, apurada contra o
valor que está no banco.

**NA CRIAÇÃO, "fora do `set`" DEGENERA EM IGNORAR EM SILÊNCIO, e o `seguranca` vetou isso.** Não há
valor anterior para comparar, então:
- **a criação passa a ser TRANSACIONAL** (hoje não é; só `alocar` é, `:505`), porque a linha de
  `RECUSADO` precisa do `candidato_id`, que só existe depois do insert. Criação sem a trilha da
  tentativa é o modo de falha da §A.33 aplicado aqui;
- **a tela NÃO oferece o controle a quem não é SUPER_ADMIN.** Recusa silenciosa é pior que erro:
  quem marcou a caixa e viu a ficha nascer desmarcada conclui que o sistema perdeu o clique e tenta
  de novo;
- a trilha distingue **"recusado e a pessoa foi criada mesmo assim"** de "recusado e nada
  aconteceu", pela coluna de ação.

**O ÚNICO ESCRITOR DA COLUNA É UM MÉTODO PRÓPRIO** (`aplicarRetencao(candidatoId, valor, autor)`), e
o `insert` de `criar` **nunca lista o campo**. É o que impede a segunda porta: a **ingestão futura**
(onda 4) vai inserir candidato **sem usuário autor**, e nasce proibida de escrever a retenção. Isso
entra no briefing agora, não depois.

**A rota de editar PRECISA passar a receber o autor.** `candidatos.controller.ts:281` não recebe
`@CurrentUser()`, ao contrário de `criar` (`:51`) e `alocar` (`:293`). Sem ele não há papel para
conferir nem autor para registrar. A assinatura muda, e é mudança obrigatória.

## 3. A TRILHA, na forma que o `seguranca` aprovou

Tabela própria, no molde de `as_vaga_status_eventos` e `passagem_aceites`, com três desvios que ele
exigiu e que não são detalhe:

- **FK do candidato SEM `ON DELETE CASCADE`.** O cascade daquele molde existe porque o rastro é DA
  vaga. Este é rastro de decisão sobre dado pessoal e tem de sobreviver à linha: `restrict`.
- **NÃO existe campo de observação livre.** É onde o dado pessoal aparece, porque quem opera
  escreve o nome da pessoa na justificativa. Sem o campo, não há onde escrever.
- **`resultado` é coluna da MESMA tabela** (`APLICADO` ou `RECUSADO`), nunca uma segunda tabela,
  para "tudo que aconteceu com a retenção desta pessoa" ser uma leitura só.
- **COLUNA DE AÇÃO OBRIGATÓRIA** (`MARCAR` ou `DESMARCAR`), e o `seguranca` vetou a versão sem ela.
  Só com `resultado`, a trilha não distingue quem tornou alguém permanente de **quem devolveu
  alguém ao expurgo**, que é a ação destrutiva e irreversível. É a pergunta de auditoria mais
  importante da tabela.
- **O carimbo de tempo é NOMEADO**, não implícito: o que não está escrito não é construído.
- **`autor_id` é FK `restrict`, NÃO `set null`.** `set null` contradiz a permanência do "quem":
  apagado o usuário, a trilha responde "alguém". Ninguém apaga usuário no meio de um insert, então
  `restrict` não derruba escrita nenhuma. *(Correção sobre a primeira redação deste mapa.)*
- **A mudança e a linha da trilha vão na MESMA TRANSAÇÃO.** Marca sem trilha é a §A.33 aqui.
- **A tentativa RECUSADA gera linha.** A pergunta de auditoria não é só "quem tornou permanente",
  é "quem tentou": tentativa repetida pelo mesmo autor é o sinal de uso indevido, e sem isto ela
  não deixa vestígio, porque o protocolo proíbe PII no log de acesso.
- **NÃO reusar `candidato_alteracoes_log`** (`tables.ts:1671`): ela guarda `valor_anterior` e
  `valor_novo` como TEXTO LIVRE e está amarrada a `admissao_id`. Pendurar um rastro limpo dentro de
  uma tabela desenhada para aceitar valor pessoal é andar para trás.
- **A trilha NÃO entra na lista de nulagem do expurgo:** ela não tem PII, e o id técnico continua
  válido depois da anonimização.

## 4. APAGAR AS DUAS GAVETAS VELHAS, com guarda dentro da migration

`as_candidatos.id_candidate_pandape` e `as_candidaturas.id_match_pandape`. Medido agora: **zero
valores preenchidos nos dois bancos**.

**A contagem de ontem não protege a execução de amanhã.** A guarda vai DENTRO da migration: um
bloco que **levanta exceção** se existir qualquer linha com a coluna não nula, antes de cada
`DROP COLUMN`. Zero valores, passa; um valor que apareceu no meio, **aborta** em vez de apagar.

**`pg_dump` das duas colunas como backup está VETADO:** é exportar identificador pessoal para
arquivo (protocolo LGPD, seção 5). Com zero linhas não há o que salvar, e é por isso que a guarda
de contagem é a forma certa.

**A guarda é escrita à mão, e o `drizzle-kit` a apaga ao regenerar o SQL.** O arquivo precisa ser
marcado como editado à mão, e qualquer regeneração conferida.

**Ordem obrigatória:** o código para de escrever primeiro, a migration derruba a coluna depois.

**A prova de regressão morre junto com a coluna, e isso é o que o `seguranca` vetou.** A enumeração
D1 prova hoje que aqueles nomes são nulados. Apagadas as colunas, a asserção some e nada impede que
a próxima fonte nasça como `id_candidate_digai` numa coluna de `as_candidatos`. **A D1 passa a ser ESTRUTURAL, E POR ALLOWLIST INVERTIDA**, que é a forma que o `seguranca`
exigiu depois de reprovar a que existe.

Hoje a varredura classifica coluna por **regex de nome**
(`nome|cpf|email|telefone|...|pandape|digai|...`), e isso é lista de pistas por substring, que o
próprio protocolo reprova (seção 1.1, item 3). Uma coluna nascida amanhã como `id_precollaborator`,
`codigo_externo`, `matricula`, `login_ats` ou `id_gi` **não casa com pista nenhuma e nasce verde**,
retida para sempre.

**A forma que vale é a inversa:** a D1 enumera **TODAS as colunas PERMITIDAS** de `as_candidatos` e
`as_candidaturas` (a allowlist das que sabidamente não identificam) e afirma que o conjunto de
colunas do schema **menos** essa lista é **vazio**. Coluna nova, com QUALQUER nome, nasce
**vermelha** e obriga quem a criou a classificá-la: ou entra na allowlist, ou entra na enumeração
do expurgo. A régua de nome continua como reforço, nunca como critério.

**Correção de redação que ele exigiu:** a frase "a identidade externa passa a ter UM dono só" vale
**dentro do módulo A&S**. Fora dele sobrevivem `integracao_pandape` (`tables.ts:1356`) e
`pandape_entrada` (`tables.ts:1418`), que guardam identificador de pessoa e **não são alcançados
pelo expurgo de A&S**. É buraco de outro módulo, anterior a esta frente, e fica registrado.

## 5. O QUE ESTA FRENTE ALCANÇA NA TELA, e portanto exige prova visual (§A.13)

Diferente da frente anterior, **esta mexe no frontend**, porque `origem` é exibida e editada:

| Arquivo | O que muda |
|---|---|
| `NovoCandidatoModal.tsx:397` | o seletor de Origem perde Banco De Talentos e ganha Digai. Ganha o controle de retenção, **só para SUPER_ADMIN** |
| `FichaCandidatoModal.tsx:231` | a pill de origem passa a ter o vocabulário novo, e a ficha passa a mostrar a retenção |
| `AdicionarCandidatosEmLoteModal.tsx:226` | usa o mesmo rótulo, acompanha |
| `lib/as-candidatos.ts:60` | o filtro por origem acompanha o vocabulário novo |
| `packages/shared-types/src/index.ts:2537` | `AS_CANDIDATO_ORIGEM` e o mapa de rótulos. **ARQUIVO DO COORDENADOR (§A.39): JÁ ESCRITO E JÁ CONSTRUÍDO**, com o valor conferido no pacote |

**A COLUNA NOVA NASCE COM FILTRO JUNTO (§A.37)**, multiselect pelo componente compartilhado (§A.28)
e ordenável (§A.29), porque ela aparece em tela. Não é item de fase 2.

**ARMADILHA DE BUILD, registrada porque já mordeu esta casa:** `AS_CANDIDATO_ORIGEM` é **valor**
consumido por `@IsIn` no DTO. Sem `pnpm build` do `packages/shared-types`, o backend valida contra a
lista VELHA (aceita `BANCO_TALENTOS`, recusa `DIGAI`) com o typecheck verde. O coordenador já
construiu o pacote e conferiu os três valores no `dist`.

## 6. QUEM MAIS ESCREVE ESTES DADOS (§A.40 regra 3)

Levantado por varredura, não por memória:

| Dado | Escritores | Cobertura |
|---|---|---|
| `as_candidatos.origem` | `candidatos.service.ts:209` (criar) e `:253` (editar) | os dois, pelo vocabulário novo |
| a retenção (hoje o valor `BANCO_TALENTOS`) | os mesmos dois | os dois ganham o cadeado |
| `id_candidate_pandape` | `candidatos.service.ts:210` e o expurgo, que o nula | as duas some com a coluna |
| `id_match_pandape` | `candidatos.service.ts:518` e o expurgo | idem |
| quem LÊ a retenção | `retencao-candidatos.service.ts:193` (`origem <> 'BANCO_TALENTOS'`) | passa a ler o campo novo. **É a linha mais perigosa da frente** |

**A linha do expurgo é a mais perigosa, e reconhecer o risco não trava nada.** A régua canônica,
exigida pelo `seguranca` e escrita aqui para ser copiada: **`and c.banco_talentos = false`**, nunca
a forma verdadeira por presença. Os três erros possíveis e o que cada um causa:

| Erro | Consequência |
|---|---|
| `and c.banco_talentos` (sinal invertido) | anonimiza **exatamente e somente os protegidos**. Irreversível, e um teste de "o expurgo funciona" fica VERDE, porque alguém foi expurgado |
| `and c.banco_talentos is not null` | a coluna é `NOT NULL`, então é sempre verdadeiro: **a proteção some inteira** e nada falha |
| cláusula ausente | idem, e hoje a ausência é acusada pelo contrato; depois da troca, só é acusada se o contrato for reescrito |

**`retencao-lgpd.tester-fake.ts` PRECISA ser reescrito no MESMO commit** (`:298` e `:334` cobram o
texto `c.origem <> 'banco_talentos'`). Trocar a produção sem trocar o contrato faz o acusador
apontar uma regressão que não existe, e o time aprende a ignorar justamente o que protege a linha
mais perigosa da frente.

## 7. O QUE ESTA FRENTE NÃO TOCA

Nenhuma rota nova, nenhuma ingestão, nenhuma chamada a terceiro, nenhuma deduplicação. O item 4 da
OST (adotar 120 requisições por minuto) **já está registrado** na seção 0.7 do
`PLATAFORMA-UNIFICADORA-DECISOES.md` e não tem código nesta frente, porque não há cliente do Digai
construído.

## 8. O QUE FICA PENDENTE, e é decisão do diretor

- **P1:** pessoa sem candidatura nenhuma nunca é varrida pelo expurgo, então o dado dela fica
  retido para sempre mesmo sem a marca de retenção. Não é criado por esta frente, e ela não o fecha.
- **P6:** `editar` grava CPF, e-mail, telefone e nascimento **sem conferir se a pessoa já foi
  anonimizada**, então o dado apagado volta. O `seguranca` registra que, depois desta frente, o
  mesmo método terá guarda e trilha para um campo de catálogo e **nenhuma guarda para CPF**. A
  correção custa **uma cláusula** no `where`. Fica proposto, não construído (§A.31).
