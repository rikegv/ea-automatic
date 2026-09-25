# Soul Talent: o fluxo padrão do candidato

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-24 · **Tipo:** desenho de fluxo (§A.27)
**Base:** `docs/DESENHO-AS-CENTRAL-CANDIDATOS.md`, com as três decisões do diretor aplicadas.
**Estado:** desenho. Nada construído, nada commitado. §A.11 (sem travessão), §A.24 (title case).

---

## 0. As três decisões que este documento executa

| # | Decisão do diretor | Onde aparece |
|---|---|---|
| 1 | **A trava é por APROVAÇÃO**, não por entrada no funil | §3 |
| 2 | **O fluxo é da plataforma, fixo e próprio.** As etapas do Pandapé não se aplicam | §2 e §4 |
| 3 | **Captação antes de Triagem**, e **Entrevista Cliente é opcional** | §1 e §2.3 |

---

## 1. O fluxo padrão, final

```
                    ┌──────────────────────────────────────────────┐
                    │              F L U X O   Ú N I C O           │
                    └──────────────────────────────────────────────┘

   1              2                3                  4                 5
┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌───────────────┐  ┌────────────┐
│ CAPTAÇÃO │─▶│ TRIAGEM  │─▶│   ENTREVISTA  │─▶│   ENTREVISTA  │─▶│ APROVAÇÃO  │
│          │  │          │  │     SOULAN    │  │    CLIENTE    │  │            │
└──────────┘  └──────────┘  └───────────────┘  └───────────────┘  └────────────┘
                                     │            (OPCIONAL)             ▲
                                     │                                   │
                                     └───────────────────────────────────┘
                                        o pulo legítimo, quando o cliente
                                            não faz essa etapa

        ▼             ▼              ▼                 ▼                 ▼
   ┌─────────────────────────────────────────────────────────────────────────┐
   │   SAÍDAS, alcançáveis de QUALQUER etapa                                 │
   │   DESCARTADO   ·   DESISTIU   ·   CONTRATADO (só a partir de Aprovação) │
   └─────────────────────────────────────────────────────────────────────────┘

                          ╔═══════════════════════════════╗
                          ║  A TRAVA AGE AQUI, E SÓ AQUI  ║
                          ║   entrar em APROVAÇÃO exige   ║
                          ║      posição livre na vaga    ║
                          ╚═══════════════════════════════╝
```

### As cinco etapas

| # | Etapa | O que significa | Quem age |
|:-:|---|---|---|
| 1 | **Captação** | A pessoa entrou no processo. Ninguém olhou ainda | Sistema, ou quem cadastrou |
| 2 | **Triagem** | Currículo analisado, o perfil bate com a vaga | Soulan |
| 3 | **Entrevista Soulan** | Entrevistada pelo time da Soulan | Soulan |
| 4 | **Entrevista Cliente** | Encaminhada e entrevistada pelo cliente. **Opcional** | Cliente |
| 5 | **Aprovação** | Aprovada e reservada numa posição da vaga | Soulan, ou cliente |

### As três saídas

| Saída | Quando | Exige |
|---|---|---|
| **Descartado** | O time ou o cliente recusou | Motivo, do catálogo |
| **Desistiu** | A pessoa saiu por conta própria | Nada, mas aceita observação |
| **Contratado** | Virou admissão de fato | Só a partir de Aprovação, e só no dia da ponte com a esteira |

**Uma pessoa está sempre em exatamente um desses oito lugares por vaga.** Não há estado
intermediário, não há etapa personalizada, e não há etapa que exista em uma vaga e não em outra.

---

## 2. Por que o fluxo é fixo, e o que isso proíbe

### 2.1 A regra

> **A etapa de um candidato no Soul Talent é SEMPRE uma das cinco acima.**
> Nenhum nome de etapa vindo de fora entra na plataforma como etapa.

Isso vale para o Pandapé de hoje e para qualquer fonte futura. O que muda entre as fontes é **por
onde a pessoa entra**, nunca **quais etapas existem**.

### 2.2 O que a regra proíbe, na prática

| Proibido | Por quê |
|---|---|
| Guardar `Finalistas`, `Lead` ou `Pré-selecionado` como etapa | São nomes livres de outra ferramenta. Aceitá-los significa ter tantos funis quanto vagas, e nenhum relatório fecha |
| Etapa configurável por cliente ou por vaga | O relatório de funil precisa comparar vaga com vaga. Etapa customizável mata a comparação no dia em que o segundo cliente pedir a dele |
| Uma etapa "Outros" ou "Personalizada" | É a porta dos fundos da customização, e ela sempre é usada |

### 2.3 Entrevista Cliente: existe, e não trava

A etapa **está no fluxo de todas as vagas**, e a transição **Entrevista Soulan direto para
Aprovação é um caminho legítimo**, não uma exceção nem um erro a justificar.

**Sem flag na vaga, de propósito.** Considerei marcar cada vaga com "esta vaga tem entrevista com
cliente, sim ou não". Descartei por dois motivos:

1. Seria um campo novo na vaga, que é código validado em 23/08 (§A.26), para resolver algo que a
   transição legítima já resolve sem tocar em nada.
2. **A vida real é mais bagunçada que a flag.** O cliente que "não entrevista" entrevista os dois
   finalistas quando fica na dúvida. Uma flag por vaga obrigaria a mentir num dos dois casos.

**Como isso aparece na tela:** a coluna Entrevista Cliente do funil existe sempre e mostra zero nas
vagas em que ninguém passou por ela. Zero é informação, não é sujeira.

---

## 3. A trava de aprovação, definitiva

### 3.1 A régua, como invariante

```
POSIÇÕES     = vagas.posicoes                            (a meta, digitada na abertura)
OCUPADAS     = candidaturas da vaga em APROVAÇÃO ou CONTRATADO
LIVRES       = POSIÇÕES menos OCUPADAS

EM SELEÇÃO   = Captação + Triagem + Entrevista Soulan + Entrevista Cliente
               NÃO consomem posição. Podem ser 5 ou 500

FORA DA CONTA = DESCARTADO e DESISTIU. Nunca somam, nunca subtraem

TRAVA         mover para APROVAÇÃO exige LIVRES maior que zero
```

**A ocupação é sempre derivada, nunca armazenada.** Guardar um contador significa ter dois números
que discordam no primeiro dia em que alguém desfizer uma aprovação.

### 3.2 Onde a trava age, e onde não age

| Movimento | Trava? |
|---|---|
| Entrar no funil, em qualquer etapa | **Não.** 40 candidatos numa vaga de 10 é o normal |
| Avançar entre Captação, Triagem e as duas entrevistas | **Não** |
| **Mover para APROVAÇÃO** | **SIM. É o único ponto** |
| Descartar, ou registrar desistência | Não |
| Voltar uma etapa (sair de Aprovação) | Não. Libera a posição |

### 3.3 As quatro recusas, com a frase que o operador lê

| # | Situação | Mensagem |
|:-:|---|---|
| 1 | Aprovar sem posição livre | "Esta vaga tem 10 posições e as 10 já estão preenchidas. Reprove alguém ou aumente as posições da vaga." |
| 2 | Alocar em vaga que não está aberta | "Esta vaga está FECHADA e não recebe candidato novo." |
| 3 | Duplicar a pessoa na mesma vaga | "Esta pessoa já está nesta vaga." |
| 4 | Dois consultores aprovando ao mesmo tempo | Sem mensagem própria: um passa, o outro recebe a nº 1 |

### 3.4 A recusa nº 4 é a que exige cuidado de engenharia

Dois consultores aprovando o 10º e o 11º no mesmo instante, cada um contando 9 ocupadas, e a vaga
fecha com 11 aprovados. Uma consulta de contagem **antes** do insert não impede isso: entre contar e
gravar cabe a outra transação.

**A checagem precisa acontecer dentro da transação, com a linha da vaga travada** (`SELECT ... FOR
UPDATE` na vaga, depois contar, depois gravar). Sem isso a trava funciona em toda demonstração e
falha na primeira sexta-feira movimentada, que é quando ninguém está olhando.

### 3.5 Quando a vaga encolhe

Vaga de 10 que vira 8 depois de 9 aprovações: **o sistema não desaprova ninguém.** Passa a mostrar a
vaga como excedida (9 de 8) e deixa a correção para gente. Desfazer aprovação em silêncio seria o
sistema decidindo quem perde o emprego.

---

## 4. Como o candidato do Pandapé entra no fluxo padrão

### 4.1 A recomendação: todo mundo entra em CAPTAÇÃO

**Puxado do Pandapé, o candidato entra sempre na etapa 1**, independentemente de onde estava lá.
É a única leitura que entrega "padronização total, sem mistura": a plataforma nunca lê a etapa da
outra ferramenta para decidir nada.

### 4.2 O que se faz com o nome da pasta do Pandapé

Jogar a informação fora custa caro: numa vaga com 253 inscritos, trazer todo mundo para Captação sem
nenhum contexto obriga o time a triar do zero gente que o cliente já entrevistou.

**A saída é separar etapa de contexto:**

```
   ETAPA          =  Captação            ← decidida pelo Soul Talent, é o que vale
   CONTEXTO       =  "No Pandapé: Finalistas"  ← só aparece no card, não decide nada
```

O nome da pasta vira **uma etiqueta de contexto no card do candidato**, cinza, visivelmente
diferente da etapa. O consultor bate o olho, entende que aquela pessoa já andou, e avança em um
clique **por decisão dele**, não por importação automática.

**Isso não é mistura de fluxo.** O nome de fora nunca é etapa, nunca entra em contagem, nunca entra
em relatório e nunca é condição de nada. É a mesma natureza do "veio do Pandapé" que a admissão já
mostra como badge de origem.

### 4.3 A alternativa que NÃO recomendo, e o motivo

Um de/para que traduzisse `Finalistas` para `Entrevista Cliente` na entrada. Parece prático e
reintroduz exatamente o que a decisão nº 2 eliminou: o vocabulário do Pandapé passa a decidir onde a
pessoa está no Soul Talent, e cada vaga com pasta nomeada diferente vira um caso.

**Se o diretor preferir esse caminho**, ele é implementável e eu construo. Só não é o que a decisão
de padronização pede.

### 4.4 O caminho manual, para comparação

Cadastro à mão entra em **Captação** também, por padrão, com a possibilidade de escolher outra etapa
no ato do cadastro (a pessoa que já foi entrevistada ontem e está sendo cadastrada hoje).

**As duas portas levam ao mesmo lugar**, que é o ponto do fluxo padrão.

---

## 5. Quais movimentos são legais

Um fluxo só é padrão de verdade quando as transições são explícitas. Estas são:

| De | Para | Permitido | Registra |
|---|---|:---:|---|
| Qualquer etapa | A etapa seguinte | Sim | quem, quando |
| Entrevista Soulan | **Aprovação** (pulo da etapa opcional) | **Sim, é legítimo** | quem, quando |
| Qualquer etapa | Uma etapa anterior | Sim | quem, quando, **e o motivo** |
| Qualquer etapa | Descartado | Sim | quem, quando, motivo do catálogo |
| Qualquer etapa | Desistiu | Sim | quem, quando |
| Descartado ou Desistiu | De volta ao funil | Sim, **reativação** | quem, quando, motivo |
| Aprovação | Contratado | Sim, **só na ponte com a esteira** (frente futura) | a própria admissão |
| Captação | Aprovação, direto | **Não.** Passa por Triagem | |

**Voltar etapa é permitido de propósito.** O cliente pede outro perfil, o candidato some e reaparece,
a entrevista é remarcada. Proibir voltar não faz o processo andar para frente, faz o time abrir uma
candidatura nova para a mesma pessoa e a contagem passa a mentir.

**Reativar descartado é permitido pelo mesmo motivo.** O candidato reprovado que o cliente resgata
duas semanas depois é caso comum, e a alternativa seria cadastrar a pessoa de novo, criando duplicata.

**Toda transição vira linha de trilha.** Quem moveu, quando, de onde para onde. É o mesmo padrão do
`frente_status_eventos` que a esteira já usa.

---

## 6. A vaga fecha com gente no funil. E aí?

Situação certa de acontecer: a vaga fecha com 3 aprovados e ainda tem 12 pessoas em Triagem.

**O sistema não descarta ninguém sozinho.** As candidaturas ativas continuam existindo, marcadas
como "vaga encerrada", e a tela oferece duas ações em lote para gente decidir:

| Ação | O que faz |
|---|---|
| **Descartar em lote** | Todos saem com o mesmo motivo, em um clique |
| **Mover para outra vaga** | Aproveita o trabalho de triagem numa vaga parecida |

Descartar automaticamente pareceria limpeza e apagaria, sem aviso, o trabalho de triagem de 12
pessoas. Deixar sem tratamento nenhum entulharia a tela para sempre. As duas ações resolvem, e a
decisão continua sendo de quem conduz o processo.

---

## 7. O que muda no documento anterior

Este fluxo **substitui a §3 do `DESENHO-AS-CENTRAL-CANDIDATOS.md`**. O resto daquele documento
(as três tabelas, as telas, a ficha, a caixa de entrada, o §A.6) permanece válido, com dois ajustes:

| Onde | Ajuste |
|---|---|
| `as_candidaturas.etapa` | O enum é fixo: `CAPTACAO`, `TRIAGEM`, `ENTREVISTA_SOULAN`, `ENTREVISTA_CLIENTE`, `APROVACAO` |
| `as_candidaturas` | Ganha `contexto_origem` (varchar, nulo), o nome da pasta do Pandapé como etiqueta. **Nunca lido por régua nenhuma** |

As perguntas Q1 e Q2 daquele documento **estão respondidas** e saem do backlog.

---

## 8. O que ainda não é este documento

| Item | Fica para |
|---|---|
| A ponte código da vaga do EA com a vaga do Pandapé | Passo seguinte, depois do ok deste fluxo |
| A leitura autorizada da API para fechar as 3 lacunas | Passo seguinte |
| A sugestão do nº de vagas fechadas no Fechar Vaga | Último passo da frente, e depende de `as_candidaturas` existir. Impacto já investigado em documento próprio |
| A ponte com a esteira admissional (Aprovação vira Contratado) | Frente separada, a última do planejamento |

---

## 9. O que preciso de você

**Uma confirmação e uma escolha:**

1. **Confirmar o fluxo das cinco etapas na ordem acima**, com a Entrevista Cliente opcional e sem
   flag na vaga (§2.3).
2. **Escolher a entrada do Pandapé:** todos em Captação com etiqueta de contexto (§4.2, recomendo)
   ou de/para de entrada (§4.3).

Confirmado isso, o fluxo está fechado e a frente pode ser construída pelo caminho que não depende do
Pandapé (tabelas, tela, cadastro manual, alocação e trava), enquanto a ponte e a leitura da API
seguem em paralelo.

---

*Documento de desenho para validação do diretor. Nada construído, nada commitado.*
