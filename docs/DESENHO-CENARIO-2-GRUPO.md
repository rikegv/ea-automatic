# Desenho: cenário 2, grupo de CNPJs por nome (CAGC)

> **Status: DESENHO, aguardando aprovação do diretor. Nada construído.**
> O cenário 1 (lojas dentro de um CNPJ) está **fechado e em produção** desde `ff46b3e`.
> Este documento substitui a seção 4 de `DESENHO-LOJAS-UNIDADES.md` no ponto do carimbo:
> lá a recomendação era **derivar** o grupo; o diretor decidiu **carimbar**, e é o carimbo que vale.

---

## 1. O problema, medido na produção de hoje

A Raia Drogasil tem **98 códigos de cliente** com a **mesma razão social**, cada farmácia com CNPJ
próprio. Achar a loja certa é procurar entre 98 linhas iguais. O agrupamento administrativo que a
operação já usa, o **CAGC**, existe hoje **escrito à mão** no apelido do cliente, com variação de
digitação:

| Apelido em `nome_operacao` | Códigos | CNPJs | Admissões |
|---|---:|---:|---:|
| `CAGC CORIFEU ` (com espaço à direita) | 33 | 33 | 122 |
| `RAIA CAGC CORIFEU` | 17 | 16 | 29 |
| `RAIA CAGC FREI CANECA` | 11 | 11 | 24 |
| `RAIA CAGC RIB. PRETO` | 7 | 6 | 10 |
| `RAIA CAGC CENTRO OESTE` | 6 | 6 | 17 |
| `RAIA CAGC BH` | 3 | 3 | 3 |
| `CAGC CORIFEU` (sem o espaço) | 3 | 3 | 13 |
| `RAIA CAGC CAMPINAS` | 1 | 1 | 1 |
| `CAGC CAMP. ` | 1 | 1 | 1 |
| **Total** | **82** | | **220** |

Três coisas saltam dessa tabela, e cada uma vira uma decisão de desenho:

1. **`CAGC CORIFEU `, `CAGC CORIFEU` e `RAIA CAGC CORIFEU` são quase certamente o MESMO grupo**,
   separados por um prefixo e por um espaço à direita: **53 códigos e 164 admissões**. Fundir é o
   ganho principal da migração, e é exatamente o tipo de fusão que ninguém deve fazer no automático.
2. **Os 82 códigos com CAGC são TODOS da Raia.** O CAGC não é um conceito de outros clientes, é a
   regional dela. O modelo não pode assumir isso para sempre (Bunge, Sonova e Würth também têm vários
   códigos na mesma razão social), mas a migração pode.
3. **16 códigos da Raia NÃO têm CAGC no apelido** (`RAIA`, `RAIA OLIMPIA`, `RAIA - BADY BASSITT`, um
   deles com o apelido vazio). São o **ponto cego de qualquer semeadura automática**: não há de onde
   adivinhar o grupo deles, e a proposta é não tentar.

Um detalhe pequeno com consequência de modelo: **um CNPJ da Raia aparece em dois códigos de cliente
diferentes** (`61.585.865/0453-33`). Quem for a chave do vínculo tem de ser o **`cod_cliente`**, nunca
o CNPJ.

---

## 2. Decisões já tomadas pelo diretor (respeitadas em todo o documento)

1. **O nome é CAGC**, não KGC.
2. **O grupo é CARIMBADO na admissão.** A admissão guarda o grupo **da época**, não o atual. Se a loja
   mudar de grupo depois, as admissões antigas continuam no grupo em que aconteceram.
3. **Uma loja/CNPJ pertence a UM grupo só.** Sai de um, vai para o outro; nunca fica nos dois.
4. **No cenário 2 a loja É o cliente.** Cada farmácia já é um `cod_cliente` com CNPJ próprio. O grupo
   é uma camada de organização **por cima de clientes que já existem**: não cria loja nova, não cria
   CNPJ novo, não mexe em `clientes`.

---

## 3. Modelo

```
grupos_cliente
  id           uuid      pk
  nome         varchar   not null          -- "CAGC Corifeu"
  descricao    varchar   null              -- livre, para o time explicar o recorte
  ativo        boolean   not null default true
  criado_em / atualizado_em

  unique index uq_grupo_cliente_nome
    on (upper(btrim(regexp_replace(nome, '\s+', ' ', 'g'))))

grupo_cliente_membros
  cod_cliente  varchar   PRIMARY KEY   fk -> clientes(cod_cliente) on delete cascade
  grupo_id     uuid      not null      fk -> grupos_cliente(id)    on delete cascade
  criado_em

admissoes
  + grupo_cliente_id  uuid null  fk -> grupos_cliente(id) on delete restrict
```

### Por que assim, e não de outro jeito

**A chave de `grupo_cliente_membros` é o `cod_cliente` sozinho, e não o par `(grupo_id, cod_cliente)`.**
É isto que faz a decisão 3 virar **regra do banco** em vez de disciplina de código: com o par como
chave, nada impediria o mesmo CNPJ de existir em dois grupos, e a soma por grupo passaria a contar a
mesma farmácia duas vezes sem ninguém perceber. Com o `cod_cliente` como chave, o banco recusa. É o
mesmo desenho do `admissao_projeto`, onde o unique em `admissao_id` é o que garante uma admissão em um
projeto só, e que já provou o valor dele no Alto Volume.

**A normalização do nome do grupo é a MESMA do cenário 1** (`upper`, corta as pontas, colapsa espaços
repetidos, e **não** remove acento, porque a extensão `unaccent` não está instalada). Reusar em vez de
inventar outra evita o problema que este documento está resolvendo: `CAGC CORIFEU` e `CAGC CORIFEU `
convivendo como se fossem dois.

**Tabela de ligação, e não uma coluna `grupo_id` em `clientes`.** Uma coluna resolveria o caso de hoje,
mas mistura duas coisas com ciclos de vida diferentes: cliente é cadastro do negócio, membro de grupo é
organização interna que muda por decisão administrativa. Separado, mexer no agrupamento nunca toca a
tabela de clientes, que é lida por praticamente toda a operação.

**`on delete cascade` nos membros, `on delete restrict` no carimbo.** Tirar o grupo tem de tirar os
membros junto (senão sobram linhas apontando para nada), mas **não pode apagar o histórico**: uma
admissão carimbada segura o grupo. Na prática, grupo não se apaga, se **inativa** (`ativo = false`),
igual a cliente e a loja. O `restrict` é a rede embaixo: se alguém tentar apagar de verdade um grupo
que carimbou admissão, o banco recusa em vez de deixar a história sem nome.

### Onde o carimbo mora, e por que não é derivado

`admissoes.grupo_cliente_id`, **nulável**, porque a maioria esmagadora dos clientes não pertence a
grupo nenhum e isso é o normal, não uma pendência.

O desenho anterior recomendava **derivar** o grupo pelo join `admissão -> cod_cliente -> membros`, e o
diretor decidiu o contrário. **A decisão dele está certa e o motivo é o seguinte:** derivar significa
que o grupo mostrado é sempre o de HOJE. No dia em que uma farmácia sai do CAGC Corifeu e vai para o
CAGC Centro Oeste, **toda a história dela migra junto**, em silêncio: as 122 admissões que aconteceram
sob Corifeu passam a aparecer como Centro Oeste, e um relatório do trimestre passado passa a dar outro
número que o do mês passado. O carimbo congela o que aconteceu.

O carimbo é do **id**, e não do nome. Renomear o grupo (corrigir a grafia, por exemplo) é a mesma
entidade mudando de nome, e faz sentido que a história acompanhe. Ver a **pergunta 2**.

---

## 4. Cadastro do grupo: onde e como

### Onde: tela própria no Menu Gerencial

**Recomendação: uma tela `admin/grupos-cliente`, no Menu Gerencial.** Não é a ficha do cliente.

O motivo é o tamanho: montar o CAGC Corifeu é vincular **53 códigos**. Fazer isso abrindo a ficha de
cada cliente e escolhendo o grupo é 53 idas e voltas para uma tarefa que é, na cabeça de quem faz,
uma só: "estes aqui são o Corifeu". A tela do grupo é o lugar onde a lista inteira está à vista.

**A tela, em uma frase:** lista de grupos com o número de membros; abrir um grupo mostra os clientes
dele e um seletor para acrescentar mais.

- **Lista de grupos** (tabela no padrão §A.12, ordenável §A.29, recolhível): nome, quantos CNPJs,
  quantas admissões carimbadas, ativo. Criar, renomear, inativar e reativar, como o catálogo de lojas.
- **Membros do grupo**: tabela com código, razão social, CNPJ e apelido de cada cliente, com **busca
  por nome** e **seleção múltipla** para tirar vários de uma vez. É o mesmo pacote de usabilidade que
  acabou de subir no Alto Volume, e a régua de reuso vale: nada de componente novo.
- **Acrescentar membros**: seletor de clientes do **design system, com busca** (§A.35) e **múltipla
  seleção** (§A.28), porque acrescentar 53 de uma vez é o caso de uso, não a exceção.
- **Menu novo nasce só para o SUPER_ADMIN** (§A.23). A fábrica registra o menu no catálogo e para por
  aí; quem enxerga é decisão do diretor, na tela de liberação.

**Na ficha do cliente**, a proposta é apenas **mostrar** o grupo, em leitura, na expansão que já
existe. É barato, é onde a pergunta "de que grupo é esta farmácia?" nasce, e não cria um segundo lugar
de edição que possa divergir do primeiro. Ver a **pergunta 1**.

### Como: o CNPJ que já está em outro grupo TROCA, não duplica

A gravação é um **upsert com a chave `cod_cliente`**: `insert ... on conflict (cod_cliente) do update
set grupo_id = ...`. O banco não tem como criar a segunda linha, então "duplicar" não é um estado
possível, é um erro impossível.

Na tela, isso **não pode acontecer em silêncio**. Ao acrescentar um cliente que já é de outro grupo, a
prévia mostra, antes de gravar, uma linha por cliente dizendo o que vai acontecer:

```
  56842  DROGARIA X            entra no grupo
  57110  DROGARIA Y            SAI de "CAGC Frei Caneca" e entra em "CAGC Corifeu"
```

E a confirmação diz o número dos dois lados ("3 entram, 2 mudam de grupo"), no mesmo formato das
confirmações em massa do Alto Volume. **As admissões antigas não se mexem**: quem já estava carimbado
com Frei Caneca continua Frei Caneca. É para isso que o carimbo existe, e é o comportamento que a
tela deve dizer em texto, porque é contraintuitivo.

---

## 5. Quando a admissão ganha o carimbo

**Regra única: o carimbo é derivado do `cod_cliente` no momento em que a admissão é GRAVADA, e nunca
mais é recalculado sozinho.**

Onde isso acontece:

| Momento | O que faz |
|---|---|
| **Nova Admissão (wizard)** | ao criar, lê o grupo do cliente escolhido e grava em `grupo_cliente_id` |
| **Liberação (individual e em lote)** | idem, no mesmo insert que já cria a admissão |
| **Entrada pelo Pandapé** | idem, quando o de/para resolve o `cod_cliente` |
| **Editar a admissão, TROCANDO o cliente** | **recarimba**, porque o cliente antigo pode ser de outro grupo e manter o carimbo velho seria pior que não ter carimbo |
| **Cliente muda de grupo** | **não mexe em admissão nenhuma**. É o coração da decisão 2. |
| **Cliente sem grupo** | grava `null`, e isso não é pendência |

O ponto delicado é o **quarto**: trocar o cliente da admissão é a única situação em que o carimbo
precisa ser reescrito, e é fácil esquecer. A recomendação é que a derivação viva em **uma função só**
(`grupoDoCliente(cod_cliente)`), chamada nos quatro pontos de escrita, com teste garantindo que trocar
o cliente troca o carimbo. Espalhar a regra por quatro serviços é como o elo pós-ASO quebrou (§A.26).

**Backfill das admissões que já existem:** ver a **pergunta 4**.

---

## 6. Como o Alto Volume e os quadros usam o grupo

O grupo entra como **mais um eixo de leitura**, exatamente como a loja entrou no cenário 1. O que muda
é só o `group by` e o filtro; nenhuma conta é recalculada de outro jeito.

- **Filtro por grupo**, multiselect (§A.28), no **Gerenciador** e no **Controle Gerencial**. É o que
  responde "me mostre a Raia Corifeu inteira" sem procurar entre 98 códigos.
- **Coluna Grupo** nas tabelas onde o cliente já aparece, alimentada pelo **carimbo** da admissão (não
  pelo grupo atual do cliente), senão a coluna diria uma coisa e o histórico outra.
- **Quadro por grupo** no painel do Alto Volume, no mesmo formato do quadro por loja: um grupo por
  linha, com na esteira, concluídas, em andamento e declínios.

**O que este desenho NÃO propõe:** transformar o projeto de Alto Volume em projeto de grupo. Hoje
`projetos_alto_volume.cod_cliente` amarra o projeto a **um** cliente, e um projeto que valesse para os
53 CNPJs do Corifeu mudaria a chave do projeto, o seletor, a lista de órfãos e a meta por loja de uma
vez. É uma frente inteira, e o pedido de hoje ("ver e analisar por grupo") é atendido por filtro e
agrupamento. Ver a **pergunta 5**.

---

## 7. A migração do legado

**Runner com prévia obrigatória, no molde do `carga-lojas-cpf.ts` que já rodou em produção.** Prévia
por padrão, escrita só com `APLICAR=1`, resoluções do diretor passadas explicitamente.

### O que o runner propõe sozinho

1. Lê os clientes cujo `nome_operacao` contém `CAGC`.
2. **Normaliza**: caixa alta, corta as pontas, colapsa espaços repetidos e **remove o prefixo `RAIA `**,
   que é a razão social repetida dentro do apelido.
3. Agrupa pelo resultado. Com a base de hoje, isso propõe:

| Grupo proposto | Vem de | Códigos | Admissões |
|---|---|---:|---:|
| **CAGC Corifeu** | `CAGC CORIFEU `, `CAGC CORIFEU`, `RAIA CAGC CORIFEU` | **53** | **164** |
| CAGC Frei Caneca | `RAIA CAGC FREI CANECA` | 11 | 24 |
| CAGC Rib. Preto | `RAIA CAGC RIB. PRETO` | 7 | 10 |
| CAGC Centro Oeste | `RAIA CAGC CENTRO OESTE` | 6 | 17 |
| CAGC BH | `RAIA CAGC BH` | 3 | 3 |
| CAGC Campinas **(?)** | `RAIA CAGC CAMPINAS` (1) e `CAGC CAMP. ` (1) | 2 | 2 |

### O que o runner NÃO decide

- **A fusão das variações é PROPOSTA, não aplicada.** A prévia mostra as três grafias do Corifeu lado a
  lado, com os números, e o diretor confirma. É a mesma régua da carga de lojas, onde as 8 ambíguas
  foram confirmadas uma a uma antes de gravar.
- **`CAGC CAMP. ` é a única duvidosa de verdade.** "CAMP." tanto pode ser Campinas quanto Campo Grande,
  e são 1 código e 1 admissão. Entra na prévia como pergunta, nunca fundida no chute.
- **Os 16 códigos da Raia sem CAGC no apelido ficam SEM GRUPO**, de propósito. Não há de onde deduzir,
  e inventar aqui é criar um dado errado que ninguém vai auditar depois. Eles aparecem numa lista
  "clientes sem grupo" na tela, para o diretor arrastar para o grupo certo quando souber.
- **O `nome_operacao` NÃO é limpo pela migração.** O apelido continua exatamente como está; o grupo
  passa a ser a verdade estruturada ao lado dele. Ver a **pergunta 9**.

### O carimbo do legado

Depois de criados os grupos e os membros, o runner carimba as admissões existentes derivando do
`cod_cliente` **de hoje**, porque não existe fonte melhor: ninguém guardou o grupo da época, essa é
justamente a lacuna que o carimbo passa a fechar daqui para frente. **Isso precisa estar escrito no
código e no DIARIO**: o carimbo do legado é a melhor aproximação disponível, e não um fato histórico.

---

## 8. Alcance (§A.27): o que este cenário toca

| Toca | Não toca |
|---|---|
| `admissoes` ganha uma coluna nulável (2.790 linhas hoje, migração trivial) | Clicksign, Pandapé, iFractal |
| Duas tabelas novas, ninguém depende delas ainda | `clientes`: nenhuma coluna, nenhum dado |
| Quatro pontos de escrita da admissão passam a chamar `grupoDoCliente()` | `nome_operacao`, que segue como está |
| Gerenciador e Controle Gerencial ganham filtro e coluna | A régua de pendências obrigatórias: grupo **não** é obrigatório |
| Menu novo, só para o SUPER_ADMIN até o diretor liberar | O cenário 1: `cliente_lojas` e `admissoes.loja_id` seguem intocados |

**Os dois cenários convivem sem se encostar.** No cenário 1 a loja vive **dentro** de um cliente
(`cliente_lojas.cod_cliente`); no cenário 2 a loja **é** o cliente e o grupo está **acima** dele. Uma
admissão pode ter os dois campos preenchidos, e eles respondem perguntas diferentes: `loja_id` diz em
qual unidade da mesma empresa a pessoa trabalha, `grupo_cliente_id` diz em qual regional administrativa
aquele CNPJ estava.

---

## 9. Perguntas em aberto, com recomendação

**1. O grupo aparece na ficha do cliente?**
*Recomendação: sim, em leitura, na expansão que já existe, com um link para a tela do grupo.* Edição só
na tela do grupo, para não existirem dois lugares que possam divergir.

**2. Renomear um grupo muda o que as admissões antigas mostram?**
*Recomendação: sim.* O carimbo é do id, então renomear é a mesma entidade mudando de nome, e corrigir
`CAGC CORIFEU` para `CAGC Corifeu` deve valer para trás. Para dizer outra coisa (reaproveitar um grupo
com outro significado), o caminho é **criar um grupo novo**, e a tela deve dizer isso.

**3. Grupo inativado: some de onde?**
*Recomendação: some dos seletores e dos filtros novos, mas continua aparecendo no histórico já
carimbado.* Mesma regra da loja inativa do cenário 1.

**4. O backfill carimba TODAS as admissões, ou só as dos clientes com grupo?**
*Recomendação: só as dos clientes que tiverem grupo no fim da migração* (as 220 do CAGC, mais o que o
diretor acrescentar à mão). As outras 2.570 ficam nulas, que é o valor certo: elas não pertencem a
grupo nenhum.

**5. Projeto de Alto Volume por grupo?**
*Recomendação: NÃO agora.* Filtro e agrupamento resolvem o pedido. Projeto por grupo muda a chave do
projeto e alcança meta, órfãos e seletor de uma vez; se o diretor quiser, vira frente própria, com
desenho próprio.

**6. A Nova Admissão ganha um passo "escolher o grupo"?**
*Recomendação: não um passo novo, e sim um filtro dentro do seletor de cliente que já existe.* Escolher
o grupo estreita a lista de 98 para 53, e quem não usa grupo não vê diferença nenhuma.

**7. Um cliente pode ficar sem grupo?**
*Recomendação: sim, e é o caso da esmagadora maioria.* Grupo não entra na régua de pendências
obrigatórias, e ausência de grupo nunca vira sinalizador.

**8. O CNPJ repetido em dois códigos (`61.585.865/0453-33`) é problema?**
*Recomendação: não, e o modelo já resolve.* A chave do vínculo é o `cod_cliente`, então os dois códigos
podem estar em grupos diferentes se a operação quiser, e nenhuma soma duplica.

**9. Limpar o `nome_operacao` depois que o grupo existir?**
*Recomendação: não junto desta frente.* É mexer em campo que várias telas exibem, para ganho estético.
Se o diretor quiser, entra depois, com a lista na mão e aval explícito (§A.14).

**10. Outros clientes com muitos códigos (Bunge 10, Sonova 7, Würth 7) entram agora?**
*Recomendação: o modelo já serve para todos, mas a MIGRAÇÃO automática cobre só o CAGC*, que é o único
com o agrupamento escrito no apelido. Para os demais, o diretor monta o grupo na tela quando quiser.

**11. Quem enxerga a tela de grupos?**
*Recomendação: nasce só para o SUPER_ADMIN* (§A.23), e o diretor libera pela tela de permissões.

---

## 10. Se aprovado, a ordem de construção

1. **Etapa 1, cadastro**: as duas tabelas, a tela do grupo no Menu Gerencial, o vínculo com troca
   avisada e a leitura na ficha do cliente. *Sem carimbo ainda: nada quebra.*
2. **Etapa 2, migração**: o runner com prévia, a fusão das variações confirmada pelo diretor, e a lista
   dos sem grupo.
3. **Etapa 3, carimbo**: a coluna em `admissoes`, a função única de derivação nos quatro pontos de
   escrita, e o backfill.
4. **Etapa 4, leitura**: filtro multiselect e coluna Grupo no Gerenciador e no Controle Gerencial, e o
   quadro por grupo no Alto Volume.

Cada etapa é validada pelo diretor antes da seguinte, e nada sobe sem a prova visual (§A.13).
