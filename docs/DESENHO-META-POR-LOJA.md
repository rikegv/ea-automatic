# Desenho: Meta Por Loja no Alto Volume

**Data:** 02/09/2026. **Estado:** DESENHO, nada construído. Aguarda aprovação do diretor.
**Origem:** pedido do diretor depois de a etapa 4 mostrar que o quadro por loja não tem meta, e que a
coluna "Faltam" ali não significa o que o nome diz.

---

## 1. O problema, dito com precisão

Hoje a meta do projeto vive em `projeto_vaga_cargo` e é **por cargo**: "este projeto tem 30 Auxiliar
de Loja e 10 Vendedor de Loja". Não existe meta por loja em lugar nenhum.

A consequência apareceu na validação da etapa 4. No quadro Lojas / Unidades:

- **Total** é o REALIZADO (tudo que o projeto tem naquela loja), não meta.
- **Faltam** é `total - na esteira`, ou seja **quem saiu da esteira**, e não quanto falta contratar.

O mesmo rótulo, "Faltam", significa `meta - vinculadas` no quadro de cargos e `total - na esteira` no
quadro de lojas. Duas colunas com o mesmo nome e contas diferentes, na mesma tela. Com meta por loja,
as duas passam a significar a mesma coisa: **falta contratar**.

---

## 2. O que já existe, e que este desenho reusa

### 2.1 A meta já tem DUAS camadas, e isso é o precedente

`projeto_vaga_cargo` não é só por cargo: ela já carrega um `grupo_id` **nulável**.

```
projeto_vaga_cargo
  projeto_id, cargo_id, grupo_id (NULÁVEL), quantidade
  unique (projeto, cargo)          quando grupo_id IS NULL
  unique (projeto, cargo, grupo)   quando grupo_id NOT NULL
  check  quantidade > 0
```

Ou seja: **a meta já sabe descer um nível** (do projeto para a turma de entrada), com uniques parciais
que separam os dois níveis. A meta por loja é exatamente o mesmo movimento, num eixo diferente.

### 2.2 O vínculo da pessoa ao projeto já existe, com duas portas

`admissao_projeto` liga a pessoa ao projeto, e é escrito por **dois caminhos**:

| Caminho | Origem | Onde acontece |
|---|---|---|
| Na liberação | `LIBERACAO` | o consultor escolhe projeto e grupo ao liberar (individual ou lote) |
| Depois do fato | `CORRECAO` | a ficha, pelo `alto-volume-vinculos.service` |

O caminho de correção já tem **cinco recusas**, e elas são o modelo do que a loja deve seguir:
projeto ativo, admissão do MESMO cliente do projeto, grupo pertence ao projeto, admissão não está em
outro projeto, e a quinta contra vínculo por cima. O comentário do código diz o porquê e vale igual
aqui: *"vínculo torto é pior que uma ação que para e explica, porque a partir dele a contagem do
projeto mente sem ninguém perceber"*.

### 2.3 A pessoa JÁ TEM loja

Desde a etapa 3, `admissoes.loja_id` existe e é preenchido na liberação, no wizard, no editar, no
olhinho e pela carga. **O vínculo ao projeto não precisa de campo de loja nenhum**: a loja vem junto
com a pessoa.

Isso é o que faz este desenho não criar um segundo fluxo, que era a preocupação do diretor.

---

## 3. O modelo de dados

**Uma coluna nulável na tabela que já existe.** Não é tabela nova.

```
projeto_vaga_cargo
  projeto_id, cargo_id, grupo_id (nulável), quantidade
+ loja_id  uuid NULL  FK -> cliente_lojas(id) ON DELETE CASCADE
```

Com os uniques parciais estendidos, no mesmo padrão dos que já existem:

```
unique (projeto, cargo)                quando grupo_id IS NULL     AND loja_id IS NULL
unique (projeto, cargo, loja)          quando grupo_id IS NULL     AND loja_id NOT NULL
unique (projeto, cargo, grupo)         quando grupo_id NOT NULL    AND loja_id IS NULL
unique (projeto, cargo, grupo, loja)   quando grupo_id NOT NULL    AND loja_id NOT NULL
```

**Por que aqui e não em tabela nova:** a meta é uma coisa só, com eixos opcionais. Uma tabela
`projeto_meta_loja` separada obrigaria toda consulta de meta a somar duas fontes, e no dia em que
elas discordassem o painel mostraria dois números sem dizer qual está certo. É exatamente a conta
paralela que a §A.27 proíbe.

**`ON DELETE CASCADE` na loja**, diferente do `SET NULL` de `admissoes.loja_id`: uma linha de meta sem
loja não é "meta geral", é lixo que passaria a somar no lugar errado. Apagar a loja apaga a meta dela.

---

## 4. A pergunta central: a soma das lojas bate com a meta do cargo?

Esta é a pergunta mais importante do desenho, e ela **já existe hoje sem estar resolvida**.

O código de `preenchimentoPorCargo` diz: *"As vagas somam por cargo IGNORANDO o grupo"*, ou seja, ele
faz `sum(quantidade)` de todas as linhas daquele cargo. Se um projeto tiver **uma linha de projeto**
(grupo nulo) **e** linhas por grupo para o mesmo cargo, os dois somam juntos e a meta do cargo fica
inflada. Nada no banco impede isso hoje; o que segura é a disciplina de quem cadastra.

Acrescentar loja pelo mesmo caminho **multiplicaria esse risco por três eixos**. Então o desenho
precisa escolher, e a escolha é a decisão 1 da seção 8.

**Recomendação: a meta por loja SUBSTITUI a meta daquele cargo, não soma com ela.**

A regra fica: *para cada cargo do projeto, ou existe uma linha geral (sem loja) ou existem linhas por
loja, nunca as duas.* A meta do cargo passa a ser **derivada**: quando há detalhamento por loja, a
meta do cargo é a **soma das lojas**, calculada, não digitada. Um número só, e ele fecha por
construção.

Isso é o que impede o painel de mostrar "30 Auxiliar no projeto" no quadro de cargos e "5 mais 3 mais
2 igual 10" no quadro de lojas, sem ninguém saber qual é a verdade.

**Como garantir:** um `check` não expressa isso (é entre linhas), então a trava é do serviço, num
ponto só, com teste. É a mesma forma da `validarLojaDoCliente`: a invariante que o banco não consegue
declarar vive numa função por onde todos os caminhos passam.

---

## 5. A tela de configuração do projeto

O projeto já tem tela no menu gerencial, com cadastro de grupos de entrada e de vagas por cargo. A
meta por loja entra **na mesma tela**, como um nível abaixo do cargo.

```
PROJETO: Temporada CRM 2026
├─ Auxiliar de Loja ......... 30 vagas       [detalhar por loja]
│    └─ (ao detalhar, a linha de 30 vira a soma das lojas abaixo)
│       KOP SP FARIA LIMA .......... 5
│       KOP SP SHOP IBIRAPUERA ..... 3
│       BC SP CONJUNTO NACIONAL .... 2
│       ....................... soma: 10   <- é ESTA a meta do cargo agora
└─ Vendedor de Loja ......... 10 vagas       [detalhar por loja]
```

**Comportamento:**

- O cargo nasce como hoje, com uma quantidade só e sem loja. Nada muda para quem não quer detalhar.
- **"Detalhar por loja"** abre a lista das lojas ATIVAS daquele cliente (a mesma rota `/lojas/ativas`
  que os seletores da etapa 3 já usam) e o consultor põe a quantidade em cada uma.
- Ao detalhar, a quantidade do cargo **deixa de ser digitável** e passa a mostrar a soma. É o que
  impede os dois números de divergirem: só um deles é editável por vez.
- **Desfazer o detalhamento** volta o cargo para a quantidade única, e o valor sugerido é a soma que
  estava lá.
- Loja com meta zero **não é linha**: some (o `check quantidade > 0` que já existe continua valendo).

---

## 6. Como o quadro por loja muda

| Coluna | Hoje | Com meta por loja |
|---|---|---|
| **Vagas** (meta) | não existe | **nova**: a meta daquela loja no projeto |
| **Total** | realizado: tudo que o projeto tem na loja | **igual**, continua realizado |
| **Na Esteira** | vinculados, sem terminais nem banco | **igual** |
| **Concluídas** | esteira concluída | **igual** |
| **Em Andamento** | andando | **igual** |
| **Pausadas** | com `pausada_em` | **igual** |
| **Faltam** | `total - na esteira` (quem saiu) | **`meta da loja - na esteira`** (falta contratar) |
| **Declínios** | cliente no período, por loja | **igual**, segue informação ao lado |

**A única conta que muda é a do Faltam**, e ela passa a ser a MESMA do quadro de cargos
(`meta - vinculadas`). Os dois quadros passam a falar a mesma língua, que é o que originou o pedido.

**A coluna que hoje se chama Faltam some ou vira outra coisa.** O número antigo (`total - na esteira`,
quem saiu) continua sendo informação legítima, mas com outro nome: **"Fora Da Esteira"**. Ver a
decisão 5.

**Loja sem meta no projeto:** aparece com meta vazia e Faltam vazio, nunca zero. Zero diria "não falta
ninguém", e a verdade é "ninguém definiu meta aqui". A mesma régua que a tela já usa quando cruza
cargo com loja e mostra "não informado" na coluna Vagas.

**A linha "Sem Loja"** também fica com meta vazia: não existe meta para "nenhuma loja".

---

## 7. O vínculo da pessoa, seguindo a mecânica que já existe

Este é o complemento pedido pelo diretor, e a resposta curta é: **a loja não vira campo do vínculo,
vira uma sexta recusa no vínculo que já existe.**

### 7.1 Nada de campo novo

`admissao_projeto` **não ganha coluna**. A pessoa já tem `admissoes.loja_id`. Vincular a pessoa ao
projeto continua sendo exatamente o que é hoje: escolher projeto e grupo. A loja vem com ela.

### 7.2 A sexta recusa

Junto das cinco que já existem (`exigirProjetoAtivo`, `exigirAdmissaoDoCliente`,
`exigirGrupoDoProjeto`, já está em outro projeto, vínculo por cima), entra:

> **A loja e o cargo desta pessoa têm meta neste projeto?**

Com três desfechos, e a decisão 3 escolhe entre eles:

| Situação | Proposta |
|---|---|
| A pessoa tem loja, e existe meta para (cargo + loja) | vincula, normal |
| A pessoa tem loja, e **não** existe meta para (cargo + loja) | **avisa e deixa passar**, com o aviso na tela |
| A pessoa **não tem loja**, e o projeto está detalhado por loja | **avisa e deixa passar** |
| O projeto **não** está detalhado por loja | nada muda, o vínculo é o de hoje |

**Recomendação: AVISAR, não bloquear.** O motivo é a régua 5 do domínio (não-bloqueio) e o caso real:
a pessoa é liberada e vinculada ao projeto antes de alguém decidir em qual loja ela vai ficar. Barrar
o vínculo criaria uma ordem obrigatória que a operação não tem. O aviso resolve: o vínculo acontece,
a pessoa aparece no projeto, e o quadro por loja mostra a inconsistência no lugar certo.

**Onde o aviso aparece:** no retorno da rota de vínculo (a tela já mostra o motivo das recusas em
lote, então mostrar avisos é o mesmo caminho) e como uma linha no quadro por loja, no formato "3
pessoas em lojas sem meta neste projeto".

### 7.3 Reuso, ponto a ponto

| Peça | Reusa |
|---|---|
| Vínculo na liberação (individual e lote) | intacto, nada muda |
| Vínculo pela ficha (`CORRECAO`) | ganha só a sexta checagem |
| Seletor de loja | o `SeletorLoja` da etapa 3, sem tocar |
| Lista de lojas ativas | a rota `/lojas/ativas`, sem tocar |
| Guarda de loja x cliente | `validarLojaDoCliente`, sem tocar |
| Meta | a tabela `projeto_vaga_cargo`, com uma coluna |

**Nenhuma lógica duplicada, nenhum segundo fluxo.**

---

## 8. Decisões em aberto, com recomendação

1. **A meta por loja substitui a meta do cargo, ou soma com ela?**
   **Recomendação: SUBSTITUI.** Detalhou por loja, a meta do cargo passa a ser a soma das lojas,
   calculada e não digitada. É o que impede dois números discordarem, e resolve de quebra o risco que
   já existe hoje entre a meta do projeto e a meta por grupo.

2. **Meta por loja convive com meta por GRUPO de entrada?**
   O modelo suporta os dois eixos ao mesmo tempo (loja mais grupo), mas cadastrar nos dois é onde a
   confusão nasce. **Recomendação: permitir UM detalhamento por cargo, loja OU grupo, não os dois.**
   Se um dia precisar dos dois, é decisão separada e com desenho próprio.

3. **Vincular pessoa cuja loja não tem meta: bloqueia, avisa ou ignora?**
   **Recomendação: AVISA e deixa passar** (ver 7.2). Bloquear impõe uma ordem que a operação não tem.

4. **O que acontece com os projetos que já existem?**
   Eles continuam **exatamente como estão**: meta por cargo, sem loja, e o quadro por loja sem a
   coluna de meta. A migration é aditiva e nula. **Recomendação: nenhum backfill.** Detalhar por loja
   é ação deliberada, projeto a projeto.

5. **A coluna "Faltam" atual do quadro de lojas: some ou vira "Fora Da Esteira"?**
   **Recomendação: vira "Fora Da Esteira"**, e "Faltam" passa a ser a conta nova. O número antigo é
   informação real (quantos saíram), só estava com o nome errado.

6. **Quem pode cadastrar meta por loja?**
   A tela de projeto já tem o acesso dela. **Recomendação: seguir o que a tela já usa**, sem controle
   novo (§A.23: menu é decisão do diretor, e este não é menu novo).

7. **A soma das metas por loja pode passar da meta do cargo?**
   Com a decisão 1, a pergunta desaparece: a meta do cargo É a soma. **Se o diretor escolher SOMAR em
   vez de SUBSTITUIR**, aí é preciso decidir se o excesso é erro barrado ou aviso, e recomendo barrar,
   porque meta inflada corrompe o percentual de todos os quadros.

---

## 9. Alcance da mudança (§A.27)

| Área | Impacto |
|---|---|
| Banco | 1 coluna nulável em `projeto_vaga_cargo`, 4 uniques parciais |
| `preenchimentoPorCargo` | passa a derivar a meta da soma quando há detalhamento |
| `quadroPorLoja` | ganha a coluna de meta e muda a conta do Faltam |
| `matrizCargoPorLoja` | ganha a meta na célula (hoje mostra "não informado") |
| Tela do projeto (gerencial) | o detalhamento por loja |
| Painel do Alto Volume | duas colunas mudam de conteúdo |
| Vínculo de pessoa | uma checagem a mais, sem campo novo |
| Liberação, wizard, editar, olhinho | **não tocam** |
| Clicksign, Pandapé, Drive, iFractal | **não tocam** |

**O ponto de maior risco é a meta derivada.** `preenchimentoPorCargo` alimenta o quadro de cargos, o
termômetro e o percentual do topo, e é código validado em produção. A mudança tem de preservar os
testes de identidade que já existem (somar a matriz por um eixo devolve o quadro daquele eixo) e
ganhar um teste novo: **meta do cargo é igual à soma das metas das lojas daquele cargo**.

---

## 10. O que este desenho NÃO propõe

- Meta por loja **e** por grupo ao mesmo tempo (decisão 2).
- Backfill de metas em projetos existentes.
- Campo de loja em `admissao_projeto`.
- Qualquer mudança na liberação, no wizard ou nas telas da esteira.
- Rateio automático da meta do cargo entre as lojas. Ratear é inventar número, e a §A.16 proíbe.
