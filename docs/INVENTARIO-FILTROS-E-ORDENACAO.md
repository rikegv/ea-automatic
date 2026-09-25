# Inventário: filtros múltiplos (§A.28) e ordenação em tabela (§A.29)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-26 · **Tipo:** levantamento para o diretor decidir a ordem
**Regra desta OST:** investigação. Nada alterado em produção. §A.11 observada: nenhum travessão.

---

## 0. Os números

| Métrica | Valor |
|---|---:|
| Telas com pelo menos um filtro | **24** |
| Total de filtros no sistema | **~93** |
| Filtros **já múltiplos** | **20** |
| Convertíveis **sem tocar no backend** | **~38** |
| Que **exigiriam backend** | **3** |
| Que **não devem** virar múltiplos | 6 |
| Total de tabelas | **35** |
| Tabelas **com** ordenação | **28** |
| Tabelas **sem** ordenação | **6**, mais uma parcial |
| Implementações distintas de seleção múltipla | **3** |

**A leitura de uma frase:** o sistema está mais perto do destino do que parecia. O grosso do trabalho
é conversão barata e local, e o risco está concentrado em duas telas.

---

## 1. O achado que muda o plano: existem TRÊS implementações de seleção múltipla

| # | Implementação | Onde | Situação |
|---|---|---|---|
| 1 | **`MultiSelect`** | `components/ui/MultiSelect.tsx` | 6 telas em produção. **Sem navegação por teclado**, chips abaixo do gatilho empurrando o layout, sem limpar, sem flip do popover |
| 2 | **`Combobox` modo múltiplo** | `components/ui/Combobox.tsx` | **O modo múltiplo existe e NUNCA foi usado.** Zero chamadas com `multiple` |
| 3 | **`Select` mais `Escolhidos`** | inline no Controle Gerencial | **Gambiarra local**: um seletor de valor único usado como adicionador, com os chips desenhados à parte |

A terceira é a que ninguém sabia que existia. O Controle Gerencial **já faz seleção múltipla**, com
código próprio, e o backend dele também não usa o `parseMulti` do resto do sistema: tem helpers
próprios, deliberadamente sem `inArray`, por causa de índice e cast no Postgres.

### O candidato a padrão único é o `Combobox`, e há uma tensão

| Critério | `MultiSelect` | `Combobox` |
|---|:---:|:---:|
| Teclado completo | não | **sim** |
| Chips dentro do gatilho | não | **sim** |
| Flip quando não cabe embaixo | não | **sim** |
| Botão de limpar | não | **sim** |
| Estado de erro | não | **sim** |
| `onAdd`, criar item da busca | **sim** | **não** |
| Telas em produção | 6 | 2 |

**As duas dívidas antes de declarar padrão único:**
1. O `Combobox` precisa ganhar o `onAdd`, senão a Administração, que usa esse recurso, não migra.
2. **O `Combobox` nasceu separado DE PROPÓSITO** para não mexer no `Select` de 19 telas (§A.26).
   Promovê-lo a padrão único **inverte aquela decisão**, e isso é chamada sua, não da fábrica.

**Recomendação:** conversão nova **nasce em `Combobox`**; o `MultiSelect` migra depois, tela a tela.
Nada de virada de chave única.

---

## 2. Onde é barato e visível (o backend não entra)

| Alvo | Tamanho | Por que compensa |
|---|---|---|
| **Esteira, aba Integração** | 4 seletores únicos | **A melhor relação esforço e impacto do sistema.** São filtros que já rodam no cliente, sobre a fila carregada |
| **7 telas de Administração** | o mesmo par "ativos / inativos / todos", 7 vezes | Um recorte só, repetido. Zero risco, nenhuma tem KPI dependente |
| **Central de Candidatos**, Cliente e Etapa | 2 seletores | Já rodam no cliente, saem de graça |
| **Admin, Régua** | 1 coluna | Falta só a coluna de exigência para completar a ordenação |

---

## 3. Onde há risco, mesmo sem tocar no backend

| Tela | Risco |
|---|---|
| **Controle Gerencial** | Alimenta **todos os KPIs da diretoria**, e tem três camadas acopladas: cards clicáveis, chips de filtro ativo e gráficos com a regra "nada filtra a si mesmo". O backend já aceita lista, então a troca é cosmética, mas **qualquer erro aparece direto para você** |
| **Esteira** | Os KPIs das 4 abas contam a FILA, não o recorte, **por decisão registrada em comentário no código (§A.27)**. Os filtros de coluna precisam CONTINUAR no cliente. Mover qualquer um para o backend faz os cards oscilarem |
| **Admin, Alto Volume, tabela de órfãs** | Único caso do sistema com **seleção em massa por caixa de marcação**. Reordenar precisa preservar o conjunto de linhas marcadas |

---

## 4. Os três filtros que exigiriam backend, e nenhum vale a pena agora

| Filtro | Onde | Avaliação |
|---|---|---|
| Benefícios, **Pacote** | whitelist de um valor no controller | **Só existem 2 valores possíveis.** Ganho quase nulo. Recomendo deixar fora |
| Candidatos, **Vaga** | `eq()` no service | Módulo **em obra agora**, risco de conflito |
| Candidatos, **Origem** | `eq()` no service | Idem |

---

## 5. As 6 tabelas sem ordenação

| # | Tabela | Colunas | Complicador |
|---|---|:---:|---|
| 1 | **Admin, Menu e Áreas** | 4 ordenáveis | **Nenhum. A peça mais fácil do sistema** |
| 2 | Admin, Alto Volume, **vínculos do projeto** | 4 | Nenhum, e pode passar de dezenas de linhas. **É aqui que ordenar vale a pena** |
| 3 | Admin, Alto Volume, **admissões órfãs** | 4 | **Seleção em massa por caixa de marcação**, precisa preservar o que está marcado |
| 4 | Admin, Alto Volume, **vagas por cargo** | 3 | Uma coluna é condicional, a composição muda em execução. A Esteira já resolve isso por aba |
| 5 | Admin, Alto Volume, **grupos do projeto** | 2 | Listas de 2 a 5 linhas. **Ganho real quase nulo** |
| 6 | Esteira, modal **Importar Matrículas** | 4 | Prévia efêmera de importação. **Recomendo não fazer** |

Mais uma **parcial**: Admin, Régua, onde só a coluna Documento ordena.

**As duas centrais de A&S saíram desta lista durante o próprio levantamento**, porque a ordenação
foi aplicada nelas em paralelo.

**Limite arquitetural, registrado no próprio código:** a ordenação é feita no cliente e só é honesta
em tabela que carrega o conjunto inteiro. **Nenhuma das 6 pendentes é paginada no servidor**, então
todas podem usar o hook direto. As duas paginadas do sistema (Gerenciador e Benefícios) já resolveram
mandando a ordenação para a API.

---

## 6. A ordem que eu proponho

| Onda | O quê | Risco | Por que aqui |
|:---:|---|:---:|---|
| **1** | As 6 tabelas sem ordenação, menos o modal de importação | baixo | Fecha a §A.29 quase inteira. A de órfãs por último, pela seleção em massa |
| **2** | Esteira, aba Integração: os 4 seletores | baixo | Melhor esforço e impacto do sistema, e é tela que a operação usa todo dia |
| **3** | As 7 telas de Administração, o par de pills | baixo | Um recorte repetido 7 vezes, sem KPI dependente |
| **4** | Dar `onAdd` ao `Combobox` | baixo | **Destrava** a migração da Administração e do `MultiSelect` |
| **5** | Migrar as 6 telas do `MultiSelect` para o `Combobox` | médio | Tela a tela, nunca de uma vez |
| **6** | **Controle Gerencial** | **alto** | Por último de propósito: é a tela da diretoria, e a gambiarra própria precisa sair junto |

Deixo **fora** do plano, por recomendação: o filtro Pacote de Benefícios (2 valores só), os seletores
de Cliente e Projeto do Alto Volume da diretoria (o painel é "um projeto de um cliente", somar dois
misturaria termômetro e cotas), os intervalos de data, e a ordenação do modal de importação.

---

## 7. O que eu preciso de você

1. **Aprova a ordem das 6 ondas?**
2. **O `Combobox` vira o padrão único?** Isso inverte a decisão que o criou separado (§A.26).
3. **Confirma as exclusões** da seção 6?
4. Telas sem filtro nenhum hoje (Central de Vagas, Gestão Das Assinaturas, Liberação, Sala de Espera)
   **ganham filtro novo?** Seria feature nova, não conversão, e sairia no cliente, de graça.
