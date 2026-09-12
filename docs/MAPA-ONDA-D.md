# MAPA DE ALCANCE: ONDA D DA CENTRAL DE VAGAS

Levantado pelo coordenador (§A.39 passo 1, §A.40 regra 1: o mapa é auditado ANTES do primeiro
despacho). **[M]** = medido contra o código ou o banco. **[P]** = pergunta ao diretor.

Base da medição: produção `ea_automatic` e homologação `ea_automatic_homolog`, 12/09/2026.

---

## 0. O QUE A ONDA D PEDE

| # | item | origem |
|---|---|---|
| 1 | o botão da linha vira **engrenagem + "Gestão Da Vaga"** | já mapeado |
| 2 | **tirar a coluna CARGO** da tabela | já mapeado |
| 3 | KPIs de posições | **JÁ FEITO**, não refazer |
| 4 | largura | conferir, não construir |
| 5 | **cliente OBRIGATÓRIO** na abertura | ajuste novo |
| 6 | **nome do cliente sem o código**, em todo lugar da A&S | ajuste novo |
| 7 | **previsão de entrega OBRIGATÓRIA** na abertura | ajuste novo |

---

## 1. ITEM 1: A ENGRENAGEM. Uma linha, alcance zero.

`as/vagas/page.tsx:3389` desenha `<Icon name="eye" />` + `Gestão Vaga`. O catálogo de ícones já tem
**`cog`** (`ui/Icon.tsx`), então é troca de nome, não ícone novo. **[M]**

**O rótulo passa a "Gestão Da Vaga"** e não "Gestão da Vaga": §A.24 manda title case em rótulo curto
que classifica (o próprio exemplo da regra é "Gestão Das Assinaturas"), e o rótulo de hoje já está em
title case ("Gestão Vaga"). Botão que é AÇÃO fica em minúscula; este é etiqueta de porta, não comando.

**Alcance:** o `aria-label` e o `title` já dizem "Abrir a gestão da vaga" e não mudam. Nenhum teste
casa pelo texto do botão? **A CONFERIR pelo `tester`**: o leitor de linhas dele já ficou cego uma vez
por renomeação de rótulo (registro de 11/09).

## 2. ITEM 2: TIRAR A COLUNA CARGO. Alcance maior do que a célula.

A coluna aparece em **seis** pontos do mesmo arquivo, e três deles NÃO são a tabela: **[M]**

| ponto | linha | o que é | sai? |
|---|---|---|---|
| `<ColunaOrdenavel chave="cargo">` | 3150 | o cabeçalho | **sai** |
| `<td>{v.cargoNome}</td>` | 3257 | a célula | **sai** |
| `colunasOrdenaveis` `{ chave: "cargo" }` | 2511 | a régua de ordenação (§A.29) | **sai junto** |
| `colSpan={11}` | 3232 e 3237 | as duas linhas de estado vazio | **vira 10** |
| filtro "Cargo Da Vaga" (`fCargos`) | 2643 | multiselect (§A.28/§A.37) | **[P] fica?** |
| busca global | 2209 | procura em `cargoNome` | **[P] fica?** |

**O `colSpan` é a armadilha silenciosa:** 11 colunas viram 10, e esquecer isso não quebra nada
visível até a tabela ficar vazia, que é justamente quando ninguém olha.

**[P1] O filtro e a busca por cargo ficam?** O pedido foi tirar a COLUNA. Tirar o filtro junto é
decisão diferente: hoje "quem são as vagas de Operador de Caixa" é uma pergunta respondível na tela e
deixaria de ser. **Recomendação: manter o filtro e a busca, tirar só a coluna.** A §A.30 diz que nem
toda coluna vira filtro; não diz que filtro precisa de coluna.

## 3. ITEM 4: A LARGURA. Conferir, e a conta já é conhecida.

O piso declarado é `min-w-[1225px]` (`page.tsx:3138`), medido na onda B3 com as ações fora da linha.
Tirando Cargo, o conteúdo mínimo CAI, então a rolagem não piora por construção. **Mas o piso vira
herança de novo**, que é exatamente o que as três remedições anteriores corrigiram (1430 -> 1243 ->
1233 -> 1225). **A prova visual remede o piso** (§A.13/§A.20), não o presume.

## 4. ITEM 5 e 7: OS DOIS OBRIGATÓRIOS. A régua é UMA e é declarativa.

`VAGA_OBRIGATORIOS` (`shared-types:1136`) é a fonte única: a tela desenha o asterisco a partir dela,
lista as pendências a partir dela, e o servidor recusa a publicação pela MESMA lista
(`vagas.service.travaObrigatorios:1168`). **[M]**

> ### CORREÇÃO DO COORDENADOR, imposta pelo veto da auditoria (achado F1)
>
> **Eu escrevi "acrescentar obrigatório é acrescentar UMA entrada". ERRADO: são TRÊS edições**, e a
> terceira é a que trava tudo. A TELA não passa o formulário inteiro para a régua: ela monta um
> objeto com **lista branca de campos** (`page.tsx:1442`). Como `vagaPendencias` indexa por TEXTO
> (`shared-types:1192`, `(v as Record<string, unknown>)[p.campo]`) e todo campo do contrato é
> opcional, **campo não passado chega `undefined`, é lido como vazio, e a pendência fica listada para
> sempre**. O `enviar()` barra em `page.tsx:1500` antes de qualquer chamada: o efeito seria
> **NENHUMA vaga publicando pela tela, nunca**, com o **typecheck VERDE**.
>
> É o mesmo modo de falha que a Onda C já tinha documentado (`onda-c.contrato-de-dados.tester.spec.ts:214`)
> e que eu repeti. As três edições são: a entrada em `VAGA_OBRIGATORIOS`, o campo em
> `VagaCamposObrigatorios`, e **a linha no objeto de `page.tsx:1442`**.

`packages/shared-types/src/index.ts` é **arquivo de dono único, o coordenador** (§A.39), e é ele quem
escreve as duas entradas. Nota do §A.31 da memória: **const nova no shared-types exige `pnpm build` do
pacote**, senão chega `undefined` com typecheck verde.

**As duas entradas, já decididas:**

```
{ campo: "codCliente",  rotulo: "Cliente",              artigo: "o", passo: 0, passoRotulo: "A Vaga",     ancora: "vaga-cliente" }
{ campo: "dataLimite",  rotulo: "Previsão de entrega",  artigo: "a", passo: 1, passoRotulo: "Quem Pediu", ancora: "vaga-previsao-entrega" }
```

E os dois campos entram em `VagaCamposObrigatorios`. O `vazio()` da régua já cobre `null`,
`undefined` e string em branco: nenhum dos dois tem o caso do zero legítimo que obrigou
`posicoesOficiais` a ter régua própria.

**O CAMPO `vaga-cliente` NÃO TEM ÂNCORA HOJE.** O `CampoSelect rotulo="Cliente"` (`page.tsx:3497`)
não recebe `id` nem `obrigatorio`, porque nasceu nulável de propósito. Sem o `id`, o item da lista de
pendências **é clicável e não leva a lugar nenhum**. O mesmo vale para "Previsão de entrega"
(`page.tsx:3734`). Os dois ganham `id` e `obrigatorio`.

### 4.1. RETROATIVIDADE: ZERO, e isso foi MEDIDO, não suposto. **[M]**

| base | vagas | sem cliente | sem previsão | rascunhos |
|---|---|---|---|---|
| produção | 3 | **0** | 2 | 0 |
| homologação | 1 | 0 | 0 | 0 |

E a régua **só é cobrada no publicar**: `travaObrigatorios` devolve cedo no papel RASCUNHO, e a vaga
já publicada **não volta para a trilha de abertura** (`vagas.service.ts:791`, `ConflictException`).
As 2 vagas de produção sem previsão **não são alcançadas por caminho nenhum**: não há como reeditá-las.

O `fechar`, o `cancelar`, o `mover status`, o `reabrir` e o `editarPosicoes` **não chamam a régua**.

### 4.2. O QUE MUDA NO CLONAR, e é efeito desejado

Clonar sem manter o código **já zera** `dataLimite` (`page.tsx:1317`) e **mantém** `codCliente`
(`:1296`). Com os obrigatórios, o clone nasce rascunho pedindo a previsão de novo, que é o certo:
prazo de vaga velha não é prazo de vaga nova.

## 5. ITEM 6: O NOME DO CLIENTE SEM O CÓDIGO. **AQUI ESTÁ O BLOQUEIO.**

### 5.1. A metade fácil: a tabela e o modal JÁ ESTÃO CERTOS. **[M]**

`vagas.service.ts:336` resolve `clienteNome` como `nomeOperacao ?? razaoSocial`, **sem código**, e é
esse campo que a coluna Cliente (`page.tsx:3256`), o modal (`:4611`) e a Central De Candidatos
(`as/candidatos/page.tsx:395`) desenham. Nada a fazer nos três.

**O código aparece em UM lugar só:** `vagas.service.ts:644`, o `rotulo` do endpoint `opcoes`,
`` `${c.codCliente} - ${c.nomeOperacao ?? c.razaoSocial}` ``. Ele alimenta **dois** consumidores, e os
dois são a mesma linha do frontend (`page.tsx:2137`, `optClientes`): **o seletor da abertura E o
filtro Cliente da tabela**. Trocar a linha do backend corrige os dois de uma vez, com consistência
por construção. **Nenhuma outra tela lê `opcoes.clientes`.** **[M]**

### 5.2. O BLOQUEIO: 141 dos 249 clientes ficam INDISTINGUÍVEIS. **[M]**

Medido em produção: **27 nomes de operação são compartilhados por mais de um `cod_cliente`, cobrindo
141 dos 249 clientes (57%)**. O caso extremo não é de cauda:

| nome de operação | quantos códigos |
|---|---|
| RAIA CAGC CORIFEU | **53** |
| RAIA CAGC FREI CANECA | 11 |
| RAIA CAGC RIB. PRETO | 7 |
| SONOVA | 7 |
| BUNGE | 7 |
| RAIA CAGC CENTRO OESTE | 6 |

E eles **não se distinguem por mais nada legível**: nas 52 linhas de RAIA CAGC CORIFEU, `razao_social`
é a mesma ("RAIA DROGASIL S/A"), `empresa_grupo` está vazio, `descricao_regiao` está vazio.

> ### DUAS CORREÇÕES DO COORDENADOR, as duas medidas pela auditoria
>
> **1. A população certa é 232, não 249.** O `opcoes()` filtra `ativo = true` (`vagas.service.ts:559`),
> então os 17 inativos nunca chegam ao seletor. Sobre os ativos: **27 nomes repetidos cobrindo 138
> clientes (59%)**, maior grupo com **52**.
>
> **2. "O único campo que difere, além do código, é o CNPJ" é FALSO.** Sete grupos, **16 clientes
> ativos**, repetem **o nome E o CNPJ**: `SONOVA` 92.792.530/0001-38 (4 códigos), `SONOVA`
> .../0102-81 (2), `DANISCO -IFF` (2), `BUNGE` (2), `TENDA` (2), `NSK` (2), `RAIA RIB. PRETO` (2).
> **Cinco desses pares são `X` contra `X-TEMP.`**, a operação de temporários do mesmo CNPJ, e neles
> **o `cod_cliente` é o único dado que os separa no sistema inteiro**, que é exatamente o token que o
> item 6 remove. Logo o desempate da saída B **precisa conter o código**, não só o CNPJ.

**A consequência é dura, e é nova porque o ajuste 5 chega junto:** o campo passa a ser OBRIGATÓRIO no
mesmo movimento em que o seletor deixa de saber distinguir 53 opções idênticas. O consultor é
obrigado a escolher, e a tela não lhe dá como escolher certo. Cliente errado na vaga vira cliente
errado na admissão, que é a chave do de/para, da régua documental e da folha.

**[P2] Como a A&S distingue duas operações de mesmo nome?** Três saídas, e nenhuma é minha de decidir:

- **A. Só o nome, como pedido.** 53 linhas iguais no seletor de Raia Corifeu. Não recomendo.
- **B. Nome, e o desempate só onde ele é necessário.** O rótulo é o nome puro para os 108 clientes de
  nome único, e ganha uma segunda linha discreta (cidade/CNPJ/código) **apenas nos 141 duplicados**.
  A A&S continua escolhendo pelo NOME; o desempate aparece só quando o nome não basta.
- **C. Nome, e a operação duplicada some do seletor da A&S**, resolvida por um agrupamento de cliente
  (a `grupo_cliente_membros` já existe). É a saída certa a prazo e é **outra frente inteira**, fora
  desta onda.

**A parte que NÃO depende da resposta é construível já:** tirar o código do rótulo é a mesma linha em
qualquer das três, e o que varia é só o que entra no lugar dele para os duplicados.

### 5.3. DECISÃO DO DIRETOR (12/09): saída B, e o desempate na forma que a medição exige

O rótulo é o **NOME PURO**. Nome único (94 clientes) mostra só o nome. Nome repetido ganha uma
**segunda linha discreta** com o **CNPJ**; nome **e** CNPJ repetidos (os 15) trazem o **`cod_cliente`**.
A duplicidade é decidida sobre a lista inteira, não sobre a página à vista.

**A ressalva que o diretor precisa saber:** ele disse "a A&S não conhece o código, só o nome", e nos
15 clientes dos pares `X`/`X-TEMP.` **não existe outro desempate no sistema**. O código aparece ali
como último recurso, em segunda linha, e nunca como prefixo do nome.

### 5.4. O QUE A AUDITORIA ENCURTOU, e é a favor do sistema

Eu escrevi que cliente errado na vaga "vira cliente errado na admissão, na régua documental e na
folha". **Ainda não é verdade:** não existe ponte vaga->admissão em código (`grep -rn "AdmissoesService"
apps/backend/src/as` devolve vazio), e `vagas.cod_cliente` é lido só dentro do módulo A&S. É risco
FUTURO, sobre uma base que estará contaminada quando a ponte nascer.

**O que É dano hoje, e é §A.6:** escolher a filial errada dispara `escolherCliente`
(`page.tsx:1402-1413`), que pré-preenche e persiste na vaga **o nome, o telefone e o e-mail do
contato de outra unidade**. Dado pessoal de contato migrando de contexto, em silêncio. Tornar o
cliente obrigatório força esse clique; tirar o código sem desempate tira a informação que evita o erro.

## 6. O QUE ESTA ONDA **NÃO** TOCA (§A.14/§A.31)

Nenhum menu, nenhuma permissão, nenhuma outra tabela do sistema, nenhum KPI (o item 3 está feito),
nenhum endpoint novo, nenhuma migration. O agrupamento de cliente do [P2] item C **não é construído**.

## 7. §A.6: O QUE A AUDITORIA PRECISA OLHAR

A onda **não** toca CPF, auth, RBAC nem credencial por tema. Ela toca o **caminho de publicação da
vaga**, e esse caminho é vizinho da validação do CPF do substituído (`vagas.service.ts:884`, afrouxada
no rascunho). O pedido ao `seguranca` é: provar que acrescentar dois obrigatórios à régua declarativa
**não altera** a ordem nem a condição daquela validação, e que o rótulo do cliente não passa a
carregar dado que não carregava.


---

## 8. O QUE A REAUDITORIA DO CÓDIGO CORRIGIU (12/09, veredito APROVADO)

**8.1. São 16 clientes, não 15.** O `SONOVA` tem DOIS grupos de nome+CNPJ repetidos, e um deles tem
**quatro** membros (`51525`, `51525-TEMP.`, `53558`, `56828`). A régua medida contra a produção, pelo
próprio código: **94** opções mostram só o nome, **122** ganham o CNPJ de apoio, **16** ganham o
`cod_cliente`.

**8.2. O `reabrir` NÃO é bypass da régua, e o furo que eu apontei não existe.** Eu escrevi (e a
primeira auditoria concordou) que o `reabrir` publicaria vaga sem passar pelos obrigatórios. **Errado,
e a própria auditoria derrubou o próprio parecer:** o `reabrir` exige papel CANCELAMENTO na origem, e o
`cancelar` exige papel ABERTURA, logo **rascunho nunca é cancelado e portanto nunca é reaberto**. O
`moverStatus` também recusa origem RASCUNHO, com mensagem própria. **Nenhuma porta publica vaga que não
passou pela régua.** O que as duas fazem é não REVALIDAR vaga já publicada, que é outra coisa.

**8.3. A invariante `ABERTA => obrigatórios preenchidos` já está violada AGORA**, por dado histórico:
**2 das 3 vagas de produção estão ABERTA com `data_limite` nulo**, e não há caminho de conserto (o
`atualizar` recusa vaga publicada). **Não vira risco operacional, e isso foi medido, não suposto:**
`slaDaVaga` trata o nulo na primeira linha (estado `SEM_PREVISAO`, "não informado", `dias: null`),
`SEM_PREVISAO` é opção do filtro, a ordenação joga vazio por último, e **nenhum KPI agrega SLA**.

**8.4. Exposição do risco de LGPD: ZERO hoje.** Produção e homologação têm **0 rascunhos** e **0**
`vagas.substituido_cpf` preenchidos. O risco (rascunho recusado vivendo mais tempo com CPF sem TTL)
passa a existir quando a operação viva começar a acumular rascunho, que é o que a §A.18 item 2 provoca.
`vagas.substituido_cpf` **não tem TTL**, por decisão do diretor de 22/08, e é tabela DIFERENTE de
`dados_vaga_folha.substituido_cpf`, que tem o expurgo de 48h da regra 10.

**8.5. Três defeitos achados pela reauditoria e CONSERTADOS pelo coordenador antes da entrega:**
a lista de clientes saía ordenada por `razao_social` enquanto mostrava `nome_operacao` (232 opções em
ordem aleatória para o olho); e **dois comentários que eu mesmo escrevi errado** no `shared-types` (o
`Invalid Date` que a régua leria como preenchido, e a promessa de que o SLA "deixa de dizer não
informado", que não vale para as 2 vagas já publicadas).

**8.6. Registrado, não construído:** nenhum teste tranca a FORMA do payload do `opcoes()` (a
`razaoSocial` já está no `select` e um `...c` futuro a vazaria sem quebrar teste); o `hint` também
aparece no gatilho depois da escolha, então "o código nunca aparece" tem a exceção dos 16, em dois
lugares; e a FK de `cod_cliente` não confere `ativo` (inalcançável pela tela, que filtra).
