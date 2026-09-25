# Junção das branches: a prova A/B, antes x depois

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-25 · **Tipo:** prova da junção. **Produção ainda NÃO tocada.**
**Método aprovado pelo diretor:** A/B sobre dados congelados. O código de ANTES e o de DEPOIS rodam
sobre **o mesmo clone da produção, parado**, então qualquer diferença só pode ter vindo da junção.
**§A.11 observada:** nenhum travessão neste documento.

---

## 0. O veredito

**Os 2.822 indicadores batem EXATAMENTE. Zero diferença.**

Nos indicadores lidos direto do banco há **uma única diferença**, e é a que tinha de existir: a linha
do menu Central De Vagas passando a existir no catálogo (30 menus viram 31). É registro, não é
concessão: **nenhum usuário recebeu o menu** (§A.23).

---

## 1. O ambiente da prova

| Peça | O que é |
|---|---|
| Dados | `ea_juncao_prova`, clone da produção tirado às **19:03Z**. 2.726 admissões, 82 migrations |
| Código ANTES | worktree `ea-antes`, commit `c5661b7`, o que está em produção hoje. Porta 3210 |
| Código DEPOIS | worktree `ea-juncao`, commit `7093199`, já juntado. Porta 3211 |
| Credenciais externas | **todas vazias** (Clicksign, Pandapé, GCS), URLs externas apontando para porta onde nada escuta |
| Produção | **não foi tocada em nenhum momento** |

Os dois códigos foram medidos sobre **o mesmo estado do clone**, então a única variável entre as duas
coletas é o próprio código.

---

## 2. O controle, e o defeito de método que ele pegou

Antes de comparar códigos diferentes, rodei a MESMA coleta duas vezes no MESMO código e no MESMO
banco. Tinha de dar idêntico. **Não deu:**

```
gerencial.segmentos.exame[3].total = 28  ->  29
gerencial.segmentos.exame[5].total = 9   ->  8
```

**Causa:** o agendador de exames (`exame-scheduler.service`) **escreve sozinho**, movendo status de
frente conforme o tempo passa. A base "congelada" não estava congelada: o próprio sistema sob teste a
alterava enquanto eu media.

**Correção:** desliguei os quatro agendadores no clone (exame, Clicksign, Pandapé, VT), pelo
liga/desliga que eles já têm no banco. Repetido o controle, as duas coletas ficaram **idênticas**, e
só então a comparação A/B foi feita. O controle foi repetido também na coleta final, e deu estável.

**Sem esse controle, dois números teriam dançado na comparação e eu teria parado a junção por um
motivo que não é a junção.**

---

## 3. Um erro meu que o próprio método pegou

Na primeira coleta, as quatro abas da Esteira responderam **HTTP 400 nos dois lados**: eu havia
escrito a rota em maiúsculas (`/esteira/AUDITORIA`) e ela é minúscula (`/esteira/auditoria`).

Os dois lados batendo em 400 teria passado por "bate", **provando nada sobre a Esteira**, que é
justamente a superfície mais importante. Corrigi as rotas e refiz as duas coletas. O total de
indicadores subiu de 1.847 para **2.822**, e a diferença são exatamente os KPIs das quatro abas, que
agora estão medidos de verdade.

---

## 4. A tabela, antes x depois

### 4.1 Gerenciador, o primeiro da lista

| Indicador | ANTES | DEPOIS | Bate? |
|---|---:|---:|:---:|
| `kpis.total` | 2717 | 2717 | sim |
| `kpis.concluidos` | 1746 | 1746 | sim |
| `kpis.emAndamento` | 103 | 103 | sim |
| `kpis.declinados` | 876 | 876 | sim |
| `kpis.comPendencias` | 279 | 279 | sim |
| `totalPages` | 136 | 136 | sim |

### 4.2 Controle Gerencial

| Indicador | ANTES | DEPOIS | Bate? |
|---|---:|---:|:---:|
| `kpis.trabalhadas` | 2726 | 2726 | sim |
| `kpis.ativos` | 1735 | 1735 | sim |
| `kpis.emAdmissao` | 105 | 105 | sim |
| `kpis.declinios` | 846 | 846 | sim |
| `kpis.aguardandoLiberacao` | 3 | 3 | sim |

### 4.3 Esteira, as quatro abas

| Aba | Indicador | ANTES | DEPOIS | Bate? |
|---|---|---:|---:|:---:|
| auditoria | total | 29 | 29 | sim |
| auditoria | comPendencias | 22 | 22 | sim |
| auditoria | pausadas | 1 | 1 | sim |
| exame | total | 70 | 70 | sim |
| exame | comPendencias | 51 | 51 | sim |
| exame | pausadas | 1 | 1 | sim |
| cadastro | total | 16 | 16 | sim |
| cadastro | comPendencias | 5 | 5 | sim |
| cadastro | pausadas | 1 | 1 | sim |
| integracao | total | 31 | 31 | sim |
| integracao | comPendencias | 11 | 11 | sim |
| integracao | pausadas | 0 | 0 | sim |

### 4.4 Assinaturas, Benefícios e as demais filas

| Indicador | ANTES | DEPOIS | Bate? |
|---|---:|---:|:---:|
| `assinaturas.itens[]` | 55 | 55 | sim |
| `beneficios.kpis.total` | 1752 | 1752 | sim |
| `beneficios.kpis.aguardando` | 29 | 29 | sim |
| `beneficios.kpis.calculados` | 1723 | 1723 | sim |
| `liberacao.count` | 3 | 3 | sim |
| `nao-conformidades.items[]` | 82 | 82 | sim |

---

### 4.5 O total

| | |
|---|---:|
| Indicadores de API comparados | **2.822** |
| Iguais | **2.822** |
| Diferentes | **0** |

A tabela acima é uma amostra legível. A comparação foi feita sobre **todos** os 2.822, item a item,
incluindo cada linha de cada lista (cada envelope de assinatura, cada segmento do painel, cada
contador por status). Os arquivos completos das duas coletas estão guardados.

---

## 5. O que a junção MUDA no banco, e é só isto

| Mudança | O que é |
|---|---|
| Tabela `vagas` e `vaga_beneficio` criadas | **vazias**, 0 linhas |
| Coluna `usuarios.papel_as` criada | **nula em todos**, 0 usuários preenchidos |
| Linha do menu `as-vagas` no catálogo | grupo `SELECAO`, área `AS`, ativa |

E o que **não** mudou, conferido:

| Verificação | Resultado |
|---|---|
| Usuários que receberam o menu Central De Vagas | **0** |
| Áreas de usuário | inalteradas: 22 no ADM, 1 no A&S (usuário de teste) |
| Qualquer contagem de tabela existente | inalterada |

O log do boot do código novo diz exatamente isso:
`Catálogo de menus convergido: 31 registrados, 1 novo(s): as-vagas`. **Registrar não é liberar.**

---

## 6. A migration consolidada reproduz o schema, coluna a coluna

A junção substituiu as 7 migrations de A&S por uma consolidada (`0082_as_central_de_vagas.sql`).
Para provar que ela faz o mesmo, comparei o schema resultante no clone contra o schema do banco de
homologação, que foi construído pelas 7 originais:

```
clone:   68 colunas
homolog: 68 colunas
IDENTICO
```

---

## 7. Estado da entrega

| Etapa | Estado |
|---|---|
| Fotografia da produção viva (PULSO 7) | **feita**, 106 indicadores, 18:47Z |
| Contadores commitados | **feito** |
| Merge e renumeração | **feito**, commit `7093199` |
| Typecheck backend e frontend | **verde** |
| Testes do backend | **verde, 140 arquivos, 1.555 testes** |
| Prova A/B sobre dados congelados | **verde, 2.822 de 2.822** |
| Schema da migration consolidada | **idêntico** |
| **Aplicar em produção** | **NÃO FEITO.** Aguarda o diretor |
