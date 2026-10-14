# Investigação: Alto Volume hoje, e o que muda para ver "por grupo"

> **Só investigação (§A.14). Nada construído, nada proposto como código.** Mapa do estado atual
> para o diretor desenhar a refatoração com o terreno na mão.
> Medido no código em 07/10/2026.

---

## Resumo em uma linha

O Alto Volume de hoje é **por PROJETO, e um projeto é de UM cliente só**. O conceito de **GRUPO de
CNPJs que o diretor quer já existe e já funciona** (cadastro dentro de Clientes, carimbo na admissão,
filtro no Painel e no Gerenciador). O que **falta** é exatamente trazer esse eixo de grupo para
**dentro da dash do Alto Volume**, e o ponto que dá o tamanho da obra é que a conta de "vagas
abertas" do Alto Volume nasce amarrada ao projeto, que é de um cliente só.

---

## 1. Onde vive o Alto Volume

É **no EA (este repositório)**, não no CentraAtend. São **duas telas diferentes** com o mesmo nome:

| Tela | Rota | Menu | O que é |
|---|---|---|---|
| **Cadastro** | `/admin/alto-volume` | Menu Gerencial (primeiro card de `/admin`) | CRUD do projeto: cria projeto, grupos de entrada, vagas por cargo, vincula admissões |
| **Dash** | `/diretoria/alto-volume` | **Controle Gerencial** (pílula "Alto Volume" ao lado de "Painel") | O painel de acompanhamento: é esta que o diretor chama de "por projeto com as lojas vinculadas" |

Arquivos:
- Dash: `apps/frontend/src/app/(app)/diretoria/alto-volume/page.tsx`
- Cadastro: `apps/frontend/src/app/(app)/admin/alto-volume/page.tsx`
- Backend: `apps/backend/src/admin/alto-volume/` (`alto-volume.service.ts`, `alto-volume-analise.service.ts`, `alto-volume-vinculos.service.ts`, `alto-volume.controller.ts`)

A dash puxa **tudo de um GET só**: `GET /admin/alto-volume/{projetoId}/analise`.

---

## 2. Como a dash é construída hoje, campo a campo

A dash mostra **um projeto por vez** (o usuário escolhe Cliente, depois Projeto, no topo). Não é uma
lista de projetos; é o raio-x de um projeto escolhido.

**Cartões KPI (os "baldes"):**
- Total De Vagas Do Projeto ← `totais.vagas`
- Total De Vagas Na Esteira ← `totais.vinculadas` (com "X ativos, Y em banco")
- Total De Admissões Concluídas ← `totais.concluidas`
- Total Em Andamento ← `totais.emAndamento`
- Total De Vagas Que Faltam ← `totais.faltam`
- Declínios ← `totais.declinios` / Em Banco ← `totais.emBanco`

**% Total Entregue** ← `vinculadas / vagas`. **Prazo Do Projeto** (termômetro) ← `termometro.*`
(dias úteis decorridos/restantes sobre o período `dataInicio..dataFim` do projeto).

**Preenchimento Por Cargo:** um cartão por cargo com 3 barras: "Total De Vagas Do Projeto"
(`linha.vagas`), "Total De Vagas Na Esteira" (`linha.vinculadas`), "Falta N Para Completar"
(`linha.faltam`).

**Tabela Por Cargo:** Cargo, Vagas, Na Esteira, Concluídas, Em Andamento, Faltam, Pausadas, Declínios.

**Tabela Lojas / Unidades:** uma linha por loja com meta, com um cilindro embaixo do nome comparando o
volume da loja. Colunas: Loja, Meta, Total De Vagas, Na Esteira, Concluídas, Em Andamento, Faltam,
Pausadas, Declínios, e "ver pessoas".

**Tabela Grupos De Entrada** (condicional): Grupo, Entrada, Vagas, No Grupo, Concluídas, Atrasadas.
**Atenção ao nome:** aqui "Grupo" é a **leva/turma por data de entrada**, NÃO o grupo de CNPJs.

### De onde vem cada número (as contas)

Tudo em `alto-volume-analise.service.ts`, sempre amarrado a **um `projetoId`**:
- **Meta / "vagas abertas"** = `sum(projeto_vaga_cargo.quantidade)`, agrupado por cargo (e por loja
  quando a vaga foi detalhada por loja). É a quantidade cadastrada no projeto.
- **Na esteira, concluídas, em andamento, pausadas, em banco** = contagens sobre
  `admissao_projeto ⋈ admissoes`, ou seja, **só as admissões VINCULADAS àquele projeto**, agrupadas
  por cargo e por loja (`admissoes.loja_id → cliente_lojas`).
- **Faltam** = `meta − na esteira`. **Declínios** = admissões do cliente no período com farol
  `DECLINOU/RESCISAO`.
- **Totais do projeto** = soma das linhas por cargo.

---

## 3. O que é "PROJETO" no modelo, e a hierarquia atual

Tabela `projetos_alto_volume` (`apps/backend/src/db/schema/tables.ts:2501`). Colunas que importam:
`id`, **`cod_cliente` (FK `clientes.cod_cliente`, NOT NULL)**, `nome`, `data_inicio`, `data_fim`,
`ativo`. Unique `(cod_cliente, nome)`. **Um projeto pertence a UM cliente, e o cliente não muda.**

Satélites do projeto:
- `projeto_grupo_entrada` (levas por data) → FK para o projeto.
- `projeto_vaga_cargo` (a meta: quantidade por cargo, opcional por loja/leva) → FK para o projeto, para
  `cargos`, e opcional para `cliente_lojas`.
- `admissao_projeto` (o vínculo admissão↔projeto, com unique em `admissao_id`: uma admissão em um
  projeto só) → FK para o projeto e para `admissoes`.

**Árvore de hoje:**

```
CLIENTE (cod_cliente, 1 CNPJ)
  └── PROJETO (de 1 cliente só)
        ├── GRUPO DE ENTRADA (leva por data)   ← "grupo" aqui = turma, NÃO é grupo de CNPJs
        ├── VAGA POR CARGO (a meta, opcional por loja)
        └── VÍNCULO → ADMISSÃO (1 admissão em 1 projeto)
                         └── loja_id → CLIENTE_LOJAS (unidade dentro do mesmo cliente)
```

LOJA (`cliente_lojas`) é **unidade dentro de um cliente** (cenário 1), não é o CNPJ. CNPJ é a coluna
`clientes.cnpj` (um por `cod_cliente`).

---

## 4. O conceito de "GRUPO" que o diretor quer JÁ EXISTE

**Sim, e é exatamente "vários CNPJs sob um nome" (cenário 2, ex.: CAGC Corifeu).** Não é o grupo de
entrada do Alto Volume (que é turma por data) e não é o campo `clientes.empresa_grupo` (que é só um
rótulo de texto livre que pré-preenche o wizard). É um cadastro próprio, com duas tabelas:

- `grupos_cliente` (`tables.ts:579`): `id`, `nome` ("CAGC Corifeu"), `descricao`, `ativo`. Nome único
  normalizado.
- `grupo_cliente_membros` (`tables.ts:618`): **`cod_cliente` é a PK sozinho** (FK `clientes`), mais
  `grupo_id` (FK `grupos_cliente`). A PK no `cod_cliente` é o que garante, no banco, "um CNPJ em um
  grupo só".
- `admissoes.grupo_cliente_id` (`tables.ts:806`): o **carimbo** do grupo da época na admissão.

Onde já está construído e funcionando (commits `7d49b5e`, `7302475`, `ad91721`):
- **Cadastro do grupo:** dentro da **tela de Clientes** (`admin/clientes/page.tsx`, componentes
  `GruposClienteLivreto.tsx` + `GrupoDoCliente.tsx`). Por decisão do diretor o grupo mora em Clientes,
  não em tela própria (o desenho em `docs/DESENHO-CENARIO-2-GRUPO.md` chegou a propor tela própria; o
  diretor preferiu dentro de Clientes).
- **Carimbo nas admissões:** função única `grupoDoCliente()` (`admissoes/grupo-da-admissao.ts`),
  chamada nos pontos de escrita; trocar o cliente da admissão recarimba.
- **Carga do legado:** `apps/backend/src/db/carga-grupos-cagc.ts` (migra o CAGC do apelido para o
  cadastro).
- **Leitura por grupo JÁ no ar em dois lugares:**
  - **Painel** (`/diretoria`): filtro "Grupo" multiselect, e na tabela unificada o grupo entra como
    **linha própria** (`GRUPO:<id>`) ao lado das linhas de cliente.
  - **Gerenciador** (`/gerenciador`): filtro "Grupo" multiselect (backend `admissoes-filtros.ts` já
    faz `where grupo_cliente_id IN (...)`).

> **Conclusão da pergunta 3:** o conceito NÃO precisa ser criado. Precisa ser **trazido para a dash do
> Alto Volume**, onde ainda não existe eixo nenhum de grupo.

> **Nota do desenho (§5 e pergunta 5 de `DESENHO-CENARIO-2-GRUPO.md`):** o próprio desenho já previa um
> "quadro por grupo no Alto Volume" como **etapa 4 (leitura)**, e recomendou fazer por **filtro e
> agrupamento**, NÃO transformando o projeto em projeto-de-grupo. O cabeçalho do desenho diz "nada
> construído", mas isso está **defasado**: as etapas de cadastro, carimbo, carga e a leitura no
> Painel/Gerenciador já subiram. O que sobrou do desenho é justamente a parte do Alto Volume.

---

## 5. A "lógica de demonstração do total de vagas abertas" que o diretor quer reusar

Ela vive **só na dash do Alto Volume** (`alto-volume-analise.service.ts`): meta = soma de
`projeto_vaga_cargo.quantidade`; "faltam" = meta − na esteira. O Painel e o Gerenciador agrupam
**admissões/farol** por cliente e por grupo, mas **não têm o conceito de meta/vagas-abertas**, que é
próprio do projeto. Então:

- O **eixo de grupo** é reusável e está provado (Painel/Gerenciador).
- A **lógica de vagas abertas** é reusável **enquanto houver projeto**, porque a meta nasce no projeto.

O encontro dos dois é o ponto da refatoração: **a meta é por PROJETO (um cliente), o grupo é um
conjunto de clientes.** Um grupo não tem meta própria hoje; a meta dele seria a soma das metas dos
projetos dos clientes do grupo.

---

## 6. O tamanho da refatoração (sem propor solução, só a dimensão)

Não é só a camada de exibição. O eixo de grupo e o cadastro já existem (barato), mas a dash do Alto
Volume é construída inteira em torno de **um `projetoId`**, e projeto é de um cliente só. Trazer
"por grupo" esbarra em **uma decisão de modelo que só o diretor fecha**: de onde vem a "meta / total de
vagas abertas" de um grupo.

As três peças, da mais barata à que dá o tamanho:

1. **Eixo de grupo (barato, já existe):** o cadastro de grupo, o carimbo na admissão e o filtro por
   grupo já estão prontos e provados no Painel e no Gerenciador. Reusar o mesmo seletor e o mesmo
   `where ... IN` é trabalho conhecido.

2. **As contagens por grupo (médio):** "na esteira, concluídas, em andamento, declínios" por grupo
   saem do carimbo `admissoes.grupo_cliente_id`, sem depender de projeto. É o mesmo tipo de conta do
   Painel, trazida para o formato da dash.

3. **A META por grupo (é aqui que mora o tamanho):** a "vaga aberta" só existe dentro de um projeto
   (`projeto_vaga_cargo`), e o projeto é de um cliente só. Para mostrar "total de vagas abertas do
   grupo" é preciso **decidir** o que é a meta de um grupo. As opções que o terreno permite (a
   escolher pelo diretor, não propostas aqui):
   - somar as metas dos **projetos** dos clientes do grupo (e então: e o cliente do grupo que não tem
     projeto? conta zero? fica fora?);
   - ou dar ao **grupo** uma meta própria (muda o lugar onde a meta é cadastrada);
   - ou separar as duas perguntas: "vagas abertas" segue por projeto, e a visão por grupo mostra só o
     que o carimbo responde (esteira/concluídas/andamento), sem meta.

   Qualquer caminho que mantenha a meta amarrada ao projeto atual **não** vira automaticamente "meta do
   grupo", porque hoje `projetos_alto_volume.cod_cliente` amarra o projeto a um CNPJ. Mudar isso (um
   projeto que vale para os N CNPJs do grupo) é o que o desenho chamou de "frente inteira": mexeria na
   chave do projeto, no seletor, na lista de órfãos e na meta por loja de uma vez.

**Dimensão, em uma frase:** se a decisão for "visão por grupo = agrupar o que o carimbo já responde +
filtrar", é obra **média**, sem tocar o modelo. Se a decisão for "o grupo tem meta de vagas abertas
igual a um projeto", aí entra modelo (de onde vem a meta do grupo), e é obra **grande**.

---

## Arquivos-chave para a frente

- Dash: `apps/frontend/src/app/(app)/diretoria/alto-volume/page.tsx`
- Conta: `apps/backend/src/admin/alto-volume/alto-volume-analise.service.ts`
- Grupo (cadastro/carimbo): `apps/backend/src/admin/grupos-cliente/`, `apps/backend/src/admissoes/grupo-da-admissao.ts`
- Grupo já lido: `apps/frontend/src/app/(app)/diretoria/page.tsx`, `apps/frontend/src/app/(app)/gerenciador/page.tsx`, `apps/backend/src/admissoes/admissoes-filtros.ts`
- Esquema: `apps/backend/src/db/schema/tables.ts` (`projetos_alto_volume` 2501, `grupos_cliente` 579, `grupo_cliente_membros` 618, `admissoes.grupo_cliente_id` 806)
- Desenho de origem do grupo: `docs/DESENHO-CENARIO-2-GRUPO.md` (seção 6 e pergunta 5)
