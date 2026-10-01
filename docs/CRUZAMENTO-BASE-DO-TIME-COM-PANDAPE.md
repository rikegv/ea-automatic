# Cruzamento: a base de vagas do time contra o Pandapé, para matar o mutirão

Medido em 01/10/2026. Somente leitura, nada construído, nada ligado, nenhum build e nenhum restart.
A planilha **não** foi commitada e **não** entra no repositório (§A.6). Nenhum nome de consultor,
salário ou dado pessoal foi registrado aqui: o documento trabalha com contagens e com nomes de
empresa, que são dado operacional.

Leitura da planilha feita com leitor próprio de `xlsx` em biblioteca padrão (`zipfile` + XML), porque
a VM não tem `openpyxl` nem `pandas` e **instalar dependência não é medição**.

---

## A RESPOSTA, em uma linha

**O "Código da vaga" da base É o id da vaga do Pandapé, e ele resolve o cliente de 312 das 470 vagas
abertas (66,4%). O mutirão de cliente cai de 470 para 158.**

E há uma segunda chave que ninguém tinha visto, o **número da requisição**, que sozinha acrescenta 49
vagas.

---

## 1. O código da base é o id da vaga? SIM, e há DUAS chaves

| chave | casam das 470 | acumulado |
|---|---|---|
| `Código da vaga` = `idVacancy` | **263 (56,0%)** | 263 |
| `Código da vaga` = `reference` (número da requisição) | **+49** | **312 (66,4%)** |
| não resolvem por nenhuma | | **158 (33,6%)** |

### Por que a segunda chave existe, e por que ela é SEGURA

A `reference` da vaga do Pandapé é o id de **outra** vaga: medi que **5.781 dos 5.914 valores de
`reference` são também `idVacancy` de alguma vaga**. É a cadeia de reabertura, a vaga nova apontando
para a anterior.

Isso levantou o risco óbvio: casar por `reference` poderia trazer o cliente **de outra vaga**. Testei,
e o teste é o que autoriza usar a chave: **nas 263 vagas que casam pelas DUAS chaves, o cliente é o
mesmo em 263 de 263, zero divergência.** A cadeia de reabertura pertence ao mesmo cliente, que é o
esperado, e agora é medido.

**Qualidade da chave:** nenhum código da base aponta para mais de um cliente. **Zero ambiguidade** nas
312. O de/para é determinístico, não heurístico.

### Estrutura da base, conferida

3.531 linhas com cliente; 2.663 com código, **861 códigos numéricos distintos** depois de normalizar
(o espaço à frente, como `' 1587726'`, foi tratado). Formatos: 379 de 6 dígitos, 2.097 de 7, 40 de 8,
mais 147 não numéricos (`SL00000049`, "Vaga interna", "-"), que não casam com nada e nem deveriam.

## 2. Quantas saem do mutirão: 312 de 470

**Todas as 312 têm cliente preenchido na base.** Nenhuma resolve pela metade.

**Mas elas não resolvem SOZINHAS, e é aqui que o desenho decide.** Os nomes da base não são os códigos
do catálogo:

| | número |
|---|---|
| nomes de cliente distintos usados pelas 312 | **95** |
| que casam EXATO com o catálogo de 251 clientes | **20** |
| que casam por prefixo (tirando `(filial)` e `- cidade`) | **27** |
| **que exigem mapeamento humano** | **~68 a 75** |

**Esta é a boa notícia escondida no número ruim: mapear 95 nomes UMA VEZ destrava 312 vagas**, e o
mapa serve para sempre, inclusive para as vagas futuras daqueles clientes. É trabalho de curadoria de
uma tarde, não de mutirão por vaga.

## 3. Por que 158 não casam: são RECENTES

| mês de publicação no Pandapé | vagas sem resolver |
|---|---|
| 2026-09 | **77** |
| 2026-08 | 30 |
| 2026-07 | 34 |
| anteriores a julho | 17 |

**141 das 158 (89%) foram publicadas nos últimos três meses.** A base **atrasa** em relação ao
Pandapé: o time registra depois. Não é vaga de natureza diferente, e as explicações alternativas foram
testadas e descartadas:

- **todas as 158 têm `reference`** (não é código ausente na origem);
- **nenhuma é recrutamento interno** (158 de 158 `isInternalRecruitment=False`);
- **só 5 têm empresa oculta**;
- estão espalhadas por **73 cidades**, sem concentração que sugira uma célula específica fora do
  processo.

**Consequência prática: a taxa de 66,4% é PISO, não teto.** Conforme o time registra o mês corrente, a
cobertura sobe sozinha. E um de/para que leia a base periodicamente colhe isso sem retrabalho.

### Um achado lateral que vale para a operação

Das 263 que casam pelo id, o status **na base** é: Fechada 80, Aberta 70, Entregue 58, Cancelada 55.
Ou seja, **135 vagas estão fechadas ou canceladas na planilha e ABERTAS no Pandapé.** Para o de/para
isso é irrelevante (o cliente continua certo), mas é divergência real entre os dois registros, e quem
olhar os dois vai achar que um está errado. **Não é escopo desta medição; fica registrado.**

## 4. O CNPJ não serve de chave: a coluna está VAZIA

O diretor levantou a coluna AT (CNPJ) como chave possivelmente melhor que o nome. **Ela não tem
dado.** Medido no XML bruto da planilha, não pelo leitor: **26.230 das 26.231 células da coluna são
auto-fechadas, isto é, vazias. Só o cabeçalho tem conteúdo.**

Conferi no XML de propósito, porque "zero" produzido por leitor próprio seria suspeito de ser defeito
do leitor. Não é: o dado não existe no arquivo.

**Então o cliente só pode ser resolvido pelo NOME**, e é por isso que o mapa de 95 nomes é o centro do
desenho, e não um detalhe.

## 5. O CARGO: a base ajuda pouco, e o cargo passa a ser a fila MAIOR

| fonte do nome do cargo, nas 312 | resolve no catálogo de 380 cargos ativos |
|---|---|
| título da vaga do Pandapé | 67 |
| coluna da base | 62 |
| **qualquer uma das duas** | **90** |
| **segue manual** | **222** |

A base acrescenta **23** resoluções. Medido com a régua do próprio código (`cargoPorTexto`: minúscula,
acento removido, só cargo `ativo`).

Projetando para as 470: ~116 resolvem o cargo e **~354 não**. **Depois do cruzamento, o cargo (354)
passa a ser uma fila maior que o cliente (158).** Isso inverte a prioridade que a medição anterior
sugeria.

---

## O MUTIRÃO, DEPOIS DO CRUZAMENTO

| trabalho | antes | depois | natureza |
|---|---|---|---|
| vincular CLIENTE por vaga | 470 | **158** | cai 66% |
| mapear NOME de cliente para código | não existia | **95 nomes, uma vez** | curadoria reutilizável |
| cadastrar ou mapear CARGO | 377 | **~354** | quase não muda |

**Estimativa de tempo:**

| item | conta | horas |
|---|---|---|
| 95 nomes de cliente para código | 1 a 2 min cada | **2h a 3h** |
| 158 vagas sem cliente | 2 a 5 min cada | **5h a 13h** |
| ~354 cargos | trabalho de catálogo, ~2 min por nome distinto | **~10h** |
| **total** | | **17h a 26h** |

**Uma pessoa, 2 a 3 dias úteis**, contra os 2 a 7 dias da estimativa anterior. E a parte que some de
vez é a pior: a de descobrir o cliente vaga por vaga sem ter onde olhar.

---

## O DESENHO PARA AUTOMATIZAR

Três caminhos, e a recomendação é o segundo.

**(a) Carga única.** Importar os 861 códigos uma vez para uma tabela de de/para. Barato e imediato,
mas **envelhece**: as 141 vagas recentes que faltam hoje continuariam faltando amanhã, e o problema
volta todo mês.

**(b) IMPORTAÇÃO RECORRENTE da base, com mapa de cliente curado. RECOMENDADO.** Três peças:
1. uma tabela de de/para `codigo_externo -> cod_cliente`, alimentada pela planilha, com as **duas**
   chaves (`idVacancy` e `reference`);
2. uma tela de administração que **importa a planilha** e mostra o que casou, o que não casou e o que
   ficou ambíguo (hoje ambíguo é zero, e a tela existe para o dia em que não for);
3. o **mapa de 95 nomes** para `cod_cliente`, curado uma vez pelo time e mantido na mesma tela.

A ingestão então consulta o de/para antes de adiar a criação: casou, nasce com cliente; não casou,
cai na fila de revisão como hoje. **Nada muda no caminho de quem não casa**, o que mantem a regra de
nunca inventar `cod_cliente` (§A.5).

Vantagem decisiva: **o time não muda o jeito de trabalhar.** A base é o registro que ele já mantém, e
a importação recorrente colhe o atraso sem pedir nada a ninguém.

**(c) O destino, depois.** O time passa a preencher o cliente **no próprio EA**, na tela de liberação
de vaga que já existe, e a planilha deixa de ser a fonte. É para onde isto deve caminhar, mas fazer
agora joga fora o acervo de 861 códigos e exige mudança de hábito antes de o sistema ter ganhado a
confiança do time.

**Custo do (b):** uma frente média. Uma migration com a tabela de de/para e o mapa de nomes, o
importador da planilha, uma tela de administração com as três listas, e o ponto de consulta na
ingestão. Não estimo em dias sem o diretor decidir se quer a tela de importação ou se prefere que a
fábrica rode a carga a cada vez.

---

## O QUE A BASE NÃO RESOLVE, e continua manual

1. **As 158 vagas recentes**, até o time registrá-las. Encolhe sozinho com a importação recorrente.
2. **O cargo**, que a base quase não ajuda: ~354 cadastros de catálogo.
3. **O mapa dos 95 nomes**, que é humano por natureza: só quem opera sabe que "Gerdau (Cumbica)" e
   "Gerdau (Araçariguama)" são o mesmo código ou dois.
4. **As 220 linhas de vaga Aberta ou Entregue que não têm código nenhum** na base: não há por onde
   casá-las, em nenhum desenho.
5. **A divergência de status** entre a planilha e o Pandapé (135 casos), que não afeta o de/para mas
   confunde quem consulta os dois.

---

## Decisões para o diretor

1. **Aprova o desenho (b)**, importação recorrente com mapa de nomes curado?
2. **Quem cura os 95 nomes?** É a única parte que a fábrica não pode fazer sozinha, porque depende de
   saber que apelido corresponde a que código.
3. **A tela de importação é da fábrica ou a carga é rodada pela fábrica a cada vez?** Muda o tamanho
   da frente.
4. **A divergência de status planilha x Pandapé (135 vagas)** vale uma frente própria, ou fica
   registrada?
5. **O cargo virou a fila maior (354 contra 158).** Quer atacá-lo junto, ou primeiro o cliente?
