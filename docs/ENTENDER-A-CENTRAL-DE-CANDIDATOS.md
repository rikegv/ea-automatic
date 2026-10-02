# A Central de Candidatos, explicada

Escrito para o diretor, em linguagem direta. Tudo aqui foi medido na producao em 02/10/2026.

## O ponto de partida: cada linha e uma CANDIDATURA, nao uma pessoa

Esta e a chave para entender tudo o resto. A tela nao lista pessoas, lista **pessoa dentro de
uma vaga**. Quem esta em duas vagas aparece em **duas linhas**. Quem esta na base e nao entrou
em vaga nenhuma aparece em **uma linha, sem vaga**.

## De onde vem cada coluna

| coluna | de onde vem | o que significa |
|---|---|---|
| Candidato, cidade, UF | o cadastro da pessoa | quem ela e |
| Origem | como ela entrou | PANDAPE (o motor trouxe) ou MANUAL (alguem cadastrou) |
| Tem CPF | o cadastro | um **sim ou nao**, nunca o numero. O numero so aparece na ficha, uma pessoa por vez, por clique |
| Vaga, Cliente, Cargo | a candidatura | em qual vaga ela esta |
| Etapa | a candidatura | onde ela esta no funil: Em Captacao, Em Triagem, Em Selecao, e assim por diante |
| Situacao | a candidatura | Ativo, Aprovado, Alocado, Descartado, Enviado Para Admissao |

**Por que o CPF e um sim ou nao:** se a lista trouxesse o numero, uma tela de 200 linhas
despejaria 200 CPFs no navegador de qualquer pessoa com acesso ao menu, para preencher uma
coluna que ninguem le. A ficha pede o numero de UMA pessoa, por clique deliberado. E a mesma
regra que vale para o resto do sistema.

## O que significa "Vaga Nao Alocada"

**Duas coisas MUITO diferentes, e e exatamente aqui que a tela estava enganando.**

**1. O significado legitimo:** a pessoa esta na base e **nao entrou em vaga nenhuma**. Isso e
estado normal, nao cadastro pela metade. Nao ha nada a preencher: o que falta e ela entrar numa
vaga. Hoje, em 59.961 pessoas, existe **UMA** nessa situacao.

**2. O que estava acontecendo de verdade, e era defeito:** a tela nao conseguia carregar o funil,
e **pintava "Vaga Nao Alocada" para todo mundo**, com vaga ou sem.

Era isso que o diretor estava vendo. Nao era a tela dizendo que a pessoa nao tem vaga; era a tela
**sem a informacao** e chutando o rotulo errado.

## Por que a ficha mostrava coisa diferente da lista

Porque **a lista e a ficha buscavam a informacao em lugares diferentes**, e so um dos dois estava
funcionando.

- **A ficha** pede, numa unica chamada, a pessoa **com as candidaturas dela**. Uma chamada, sempre
  funciona. Por isso ela mostrava "Em Captacao" corretamente.
- **A lista** montava a mesma informacao pedindo o **painel de cada vaga, uma por uma**. Com 481
  vagas, isso eram **483 chamadas** a cada carregamento, contra um limite de **120 por minuto**. Da
  121 em diante o sistema recusava, e e dai que vinha o "Too Many Requests".

E quando as chamadas eram recusadas, a lista ficava **sem nenhuma candidatura**, e toda pessoa
caia no rotulo de quem nao tem vaga.

**A ficha estava certa. A lista estava cega.** Os dois problemas que pareciam separados eram UM.

**E piorava a cada filtro:** mexer na busca, no filtro de origem ou no de vaga refazia as 483
chamadas. O limite nem e so da tela: ele e **do sistema inteiro**, contado por endereco, e todos
chegam pelo mesmo proxy. Ou seja, **uma pessoa** abrindo a Central consumia o limite de **todo
mundo** por um minuto.

## Os dois casos que o diretor levantou

**"DEBORA LUCIA DE OLIVEIRA" nao existe na base.** Nenhuma linha com esse nome. As parecidas
existem (Debora Campos De Oliveira, Debora Da Silva Oliveira, Debora Luciano De Oliveira Silva,
Debora Oliveira), **todas com vaga e todas na etapa Em Captacao**, em vagas que ainda estao na
fila de revisao, sem cliente definido.

**Ou seja: elas TEM vaga e TEM etapa.** A lista dizia o contrario por causa do defeito acima, e a
ficha dizia a verdade. **Nao era defeito de regra, era o carregamento.**

**"GIZELE ALVES" existe**, com CPF, veio do Pandape em 01/10, e **nao tem nenhuma candidatura**.
Ela e a **unica pessoa, em 59.961, nessa situacao**. Ela aparece na busca por nome, com "Vaga Nao
Alocada" **legitimamente**, porque de fato nao esta em vaga nenhuma. O que fazia parecer que ela
"nao aparecia nada" foi o erro derrubando a tela inteira, ou ela nao cair na pagina padrao de 200
(a base tem quase 60 mil, e a lista mostra 200 por vez, avisando que ha mais atras do corte).

**A diferenca entre as duas, em uma linha:** as Deboras **tem vaga e a tela nao mostrava**; a
Gizele **nao tem vaga, e a tela estava certa sobre ela**.

## O que muda quando o time trabalha

| o que o time faz | o que muda na tela |
|---|---|
| a vaga espelhada do Pandape e **revisada e liberada** | ela ganha cliente e cargo, e as colunas Cliente e Cargo param de ficar vazias nas linhas daquela vaga |
| o candidato **avanca de etapa** | a coluna Etapa muda (Em Captacao, Em Triagem, Em Selecao) |
| o candidato e **aprovado** ou **alocado** | a Situacao muda, e a pessoa passa a **ocupar posicao** da vaga |
| o candidato e **descartado** | a Situacao vira Descartado, com o motivo guardado na ficha |
| o candidato e **enviado para admissao** | a Situacao vira Enviado Para Admissao, e **nasce a admissao na esteira**. E o unico gatilho que manda alguem para a admissao, junto com o webhook |
| alguem **registra contato** | a ultima coluna de contato anda, e o historico fica na ficha |

## Uma coisa que a medicao achou e que NAO e da tela

**Existem 826 pessoas duplicadas na base**, no mesmo padrao: a mesma pessoa, na mesma vaga, uma
vez **com CPF** e uma vez **sem CPF**. Sao 4.103 pessoas sem CPF no total (6,8% da base), **todas
vindas do Pandape**.

Por que acontece: a juncao de registros usa o CPF como desempate. Sem CPF, nao ha como saber que
e a mesma pessoa, e ela entra duas vezes.

Por que importa, e nao e so estetica: um pedido de acesso ou de exclusao de dados chega pelo
**CPF**, acha **uma** das duas linhas, e a outra sobrevive invisivel ao pedido. E uma vaga de 10
posicoes pode ser entregue por duas linhas da mesma pessoa sem o sistema perceber (hoje ha 1 caso
assim).

**Isso e da ingestao, nao da Central de Candidatos**, e o conserto mexe em juncao de identidade.
**E frente propria, e esta registrada esperando decisao do diretor.**
