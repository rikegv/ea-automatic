# A junção das branches: o que é, o que arrisca, e o que você decide

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-25 · **Tipo:** explicação para decisão, nada executado
**Regra desta OST:** só explicação. A junção NÃO foi feita e não será sem o seu aval.
**Documentos pares:** `docs/INVESTIGACAO-ADM-BANCO-DE-TALENTOS.md` e `docs/PLANO-ADM-BANCO-DE-TALENTOS.md`
**§A.11 observada:** nenhum travessão neste documento.

---

## 1. O que é a junção, na prática

### 1.1 A situação, sem jargão

O sistema tem hoje **duas cópias vivas do código**, e elas não se falam.

- Uma é a **produção**: tudo que a operação usa, a esteira, a Clicksign, o VT, o Gerenciador. Ela se
  chama `main`.
- A outra é a **homologação**: uma cópia que foi tirada da produção no dia **20/08** e onde o módulo
  de A&S foi construído do zero (Central de Vagas, a trilha de abertura, os contadores, o seletor
  novo). Ela se chama `homolog`.

Desde o dia 20/08 as duas andaram **para lados diferentes**. A produção ganhou 20 melhorias que a
homologação não tem. A homologação ganhou o A&S inteiro, que a produção não tem.

**Juntar é fazer as duas voltarem a ser uma só.** Enquanto elas forem duas, nada que precise do ADM e
do A&S ao mesmo tempo pode existir: nem o flag de banco, nem a trava do cadastro, nem a ponte da vaga
com a admissão. É por isso que a frente do Banco de Talentos parou aqui.

### 1.2 Merge ou rebase, e por que a escolha importa

São as duas formas de juntar, e a diferença é fácil de entender:

| | O que faz | Efeito |
|---|---|---|
| **Rebase** | pega os 5 commits do A&S e os **reescreve** um por um, como se tivessem sido feitos hoje sobre a produção atual | você resolve o mesmo conflito **5 vezes**, uma por commit, e a história do A&S é reescrita |
| **Merge** | junta os dois lados **de uma vez**, num ponto de encontro | você resolve o conflito **uma vez**, num lugar só, e as duas histórias ficam preservadas |

**Recomendo merge, e nesta ordem específica.** O rebase aqui seria pior por um motivo concreto: o
conflito principal são as migrations do banco (seção 2.2), e no rebase ele reapareceria a cada um dos
5 commits, com a chance de resolver diferente em cada passagem.

### 1.3 Como eu faria, passo a passo

**Passo 1. Trazer a produção para dentro da homologação, e não o contrário.**
A produção fica intocada. É a homologação que recebe as 20 melhorias e passa a rodar sobre a base
atual. **Se algo quebrar, quebra na homologação**, onde ninguém está trabalhando de verdade.

**Passo 2. Resolver os conflitos ali, com calma.** São poucos e conhecidos, estão na seção 2.2.

**Passo 3. Renumerar as migrations do A&S.** Explico na seção 2.2 o que é isso. É mecânico, mas é o
pedaço que exige mais cuidado.

**Passo 4. Reclonar o banco de homologação a partir da produção.** O banco de homologação de hoje
está numa mistura que não corresponde a nenhuma das duas cópias, então ele precisa nascer de novo,
limpo, e receber o A&S por cima na ordem certa.

**Passo 5. Provar na homologação.** Gate verde (typecheck, lint, os 1.507 testes) mais a conferência
de que os números não mudaram (seção 5). É aqui que a junção é aprovada ou reprovada, e não depois.

**Passo 6. Só então, a homologação entra na produção.** A produção aplica as migrations do A&S pela
primeira vez, e o sistema volta a ser um só.

**Passo 7. Você valida na tela da produção** (seção 5).

**O ponto que quero deixar claro:** do passo 1 ao 5, **a produção não é tocada uma única vez**. O
risco real só existe no passo 6, e ele chega ali já provado.

---

## 2. O risco

### 2.1 Quanto as duas já divergiram

Medido agora:

| | Commits que a outra não tem |
|---|---|
| `homolog` (A&S) | **5** |
| `main` (produção) | **20** |

Separadas em **20/08**. São **5 dias** e 20 commits de produção, ou seja, a produção anda a cerca de
**4 commits por dia** e a homologação está ficando para trás nesse ritmo.

### 2.2 Os conflitos conhecidos: são 7 arquivos, e só 2 são código de verdade

Levantei exatamente quais arquivos as **duas** cópias mexeram desde a separação. São sete:

| Arquivo | O que é | Dificuldade |
|---|---|---|
| `meta/0075_snapshot.json` a `0078_snapshot.json` | 4 arquivos que o banco gera sozinho | **não se resolve à mão**, se regenera |
| `meta/_journal.json` | o índice das migrations | idem, se regenera |
| `db/schema/tables.ts` | a planta do banco | **conflito real**, mas os dois lados acrescentaram tabelas em lugares diferentes |
| `shared-types/src/index.ts` | o vocabulário compartilhado | **conflito real**, e é o arquivo mais sensível do repositório |

Sobre o `shared-types`: ele é **arquivo único** por decisão antiga, e quebrá-lo em dois quebra o
backend ou o frontend, com o agravante de que a queda do backend só aparece no restart seguinte. A
produção mexeu nele **1 vez** desde a separação; o A&S mexeu bastante. É trabalhoso, mas é conflito de
texto, não de lógica.

Sobre o `tables.ts`: a produção mexeu nele **4 vezes** desde a separação.

**O conflito grande não é nenhum desses. É a numeração das migrations.**

Toda mudança no banco de dados recebe um número em sequência. As duas cópias, sem saber uma da outra,
**usaram os mesmos números para coisas completamente diferentes**:

| Número | Na produção | Na homologação |
|---|---|---|
| 0075 | URL do VT no Drive | tabela de vagas |
| 0076 | VT multiversão | benefício da vaga |
| 0077 | solicitações de VT | papel de A&S no usuário |
| 0078 | URL por versão do VT | listas e regiões da vaga |
| 0079 | dispensar sinal de VT órfão | rascunho de vaga |
| 0080 | carimbo da notificação Clicksign | campos do rascunho |
| **0081** | **panorama de assinatura** | **posições oficiais e de banco** |

**São sete colisões.** O sistema aplica as mudanças de banco pela ordem desses números, então dois
"0075" diferentes é uma sequência que não descreve banco nenhum. **Um "juntar" simples não resolve
isso**, ele produziria um índice com números repetidos.

A solução é **renumerar as sete do A&S** para 0082 em diante. As da produção **não se mexe**, porque
já foram aplicadas no banco real, e mexer nelas é que seria destrutivo.

### 2.3 O que acontece com o banco de produção no momento da junção

Fui conferir o que as sete migrations do A&S fazem, porque é isso que define o risco real:

- **Seis delas só criam coisa nova**: a tabela `vagas`, a `vaga_beneficio` e os tipos delas. Não
  encostam em nada que já existe.
- **Uma delas toca uma tabela existente**, e é uma linha só: `ALTER TABLE usuarios ADD COLUMN
  papel_as`, uma coluna **nova e opcional**. Os 19 usuários de produção ficam com ela vazia, e nada
  fora do A&S a lê.

**Isso é a melhor notícia deste documento.** O risco de banco da junção é baixo, e o desfazer é
simples: apagar as tabelas novas e a coluna nova. Nenhum dado da operação é alterado, movido ou
apagado.

O risco que sobra é o de **código**, não o de dados: o A&S entrando junto com a produção pode quebrar
algo por engano de junção. É exatamente para isso que os passos 1 a 5 existem.

### 2.4 O banco de homologação está num estado que precisa ser refeito

Ele tem **85** mudanças aplicadas contra **81** da produção, e contém as tabelas das duas linhas ao
mesmo tempo (as do VT, que vêm da produção, e a `vagas`, que vem do A&S). Ele foi clonado da produção
e recebeu o A&S por cima. **Nenhuma das duas cópias do código descreve fielmente esse banco.**

Não é um problema hoje, porque ele serve para você olhar tela. Vira problema no dia da junção, e por
isso o passo 4 existe.

---

## 3. A Central de Vagas em produção: o que acontece, e as suas opções

### 3.1 Primeiro, o fato

Conferi a produção agora:

| Pergunta | Resposta |
|---|---|
| Existe a tabela `vagas` em produção? | **não** |
| Existe o menu Central De Vagas em produção? | **não** |
| Quantos usuários têm a área de A&S? | **1**, e é `QA Area AS (temporario)`, usuário de teste |
| Quantos têm a área do ADM? | 22 |
| Usuários ativos, no total | 19 (3 Super Admin, 6 Master, 10 Comum) |

### 3.2 O que a junção faz, sozinha

Quando o sistema sobe, ele **registra automaticamente** no catálogo os menus que existem no código.
Então, no dia da junção, a linha "Central De Vagas" passa a existir na produção.

**Registrar não é liberar.** Pela regra que você mesmo fixou (§A.23), menu novo nasce visível **só
para o Super Admin**, e é você quem libera quem enxerga. Somando isso à área de A&S, que hoje só um
usuário de teste tem, o resultado concreto é:

- os **3 Super Admins** passam a ver "Central De Vagas" na barra lateral;
- os **outros 16 usuários** não veem absolutamente nada de diferente.

**Ou seja, a junção não expõe a Central de Vagas à operação.** Ela expõe aos 3 Super Admins, que é
exatamente o comportamento que a §A.23 desenhou para menu novo.

### 3.3 Se você quiser nem isso, as opções

| Opção | Como funciona | Avaliação |
|---|---|---|
| **A. Juntar com a Central de Vagas registrada** | o padrão descrito acima. Visível só para os 3 Super Admins | **recomendo.** Zero trabalho extra, e é a regra que já existe |
| **B. Juntar com a tela fora do ar** | tirar a entrada do menu do código no momento da junção e devolver depois | funciona, mas é um remendo que alguém precisa lembrar de desfazer |
| **C. Desligar pelo banco** | marcar o menu como inativo na tabela | **NÃO FUNCIONA.** Conferi: o sistema força "ativo" a cada vez que sobe, então a marcação seria desfeita no próximo restart, em silêncio |
| **D. Chave de liga e desliga por configuração** | uma variável de ambiente que apaga o módulo | não existe hoje, é construção nova |

A opção C merece destaque porque é a que parece mais óbvia e é a única que falha **sem avisar**.

---

## 4. A urgência real: o risco que eu previ já aconteceu

No pulso anterior eu disse que a produção "pode tomar o número 0081 amanhã". **Fui conferir agora: ela
já tomou.** A produção tem `0081_panorama_de_assinatura_no_ea` e a homologação tem
`0081_vaga_posicoes_oficiais_e_banco`. As duas foram criadas **hoje**.

### 4.1 O tamanho do problema, com honestidade

**Não é grave no sentido de perder trabalho.** Nenhuma linha de código se perde, nenhum dado se perde.
Renumerar migration é mecânico.

**É grave no sentido de custo crescente.** Cada colisão nova é mais um arquivo para renumerar, mais um
índice para reconstruir e mais uma chance de errar na hora de resolver. O ritmo medido:

| Medida | Valor |
|---|---|
| Dias desde a separação | **5** |
| Colisões de numeração acumuladas | **7** |
| Ritmo | cerca de **1,4 colisão por dia** |
| Commits de produção que a homologação não tem | **20**, ou 4 por dia |

### 4.2 Quando o adiamento vira dor de verdade

Na minha leitura, três marcos:

| Prazo | O que acontece |
|---|---|
| **Agora, mais 1 semana** | mais 7 colisões, cerca de 14 no total. Ainda administrável, meia frente de trabalho |
| **Mais 2 ou 3 semanas** | a homologação fica tão atrás que ela deixa de servir para validar qualquer coisa: você estaria aprovando telas sobre uma base que não é mais a produção |
| **O marco de verdade, e ele não é de calendário** | o dia em que a **importação da base histórica de vagas** (2.363 linhas) rodar na homologação. A partir dali a junção deixa de ser código e passa a ser dado, e renumerar migration com base carregada é outro problema |

**O terceiro é o que eu vigiaria.** Enquanto a tabela `vagas` tem 11 linhas de teste, a junção é
barata. Ela encarece muito no dia em que tiver 2.363 linhas de verdade.

---

## 5. Como você confere que a junção deu certo

### 5.1 O que a fábrica prova antes de você olhar

1. **Gate verde**: typecheck, lint e os 1.507 testes, na homologação já juntada.
2. **A prova de que os números não mudaram**, o método que já está registrado no DIARIO
   ("como se prova que um KPI não mudou"). Concretamente: anotar os números **antes** da junção,
   aplicar, anotar **depois**, e os dois conjuntos têm de bater exatamente. Os números que importam
   são as contagens do Controle Gerencial, os KPIs do Gerenciador e as filas das quatro abas da
   Esteira. Se um só número dançar, a junção não passa.
3. **Prova visual** (§A.13) das telas que a junção alcança.

### 5.2 O que você clica, na produção, depois

Sugiro esta ordem, do mais recente e mais frágil para o mais estável:

| # | Onde | O que confirmar |
|:---:|---|---|
| 1 | **Gestão Das Assinaturas** (Clicksign) | é o que acabou de subir e é o mais novo. As abas, a ordenação clicável, e um envelope que chame a pessoa de verdade |
| 2 | **Esteira**, as quatro abas | as filas com a mesma gente de antes, e um avanço de status funcionando ponta a ponta |
| 3 | **Gerenciador** | os KPIs com os mesmos números que você viu antes da junção |
| 4 | **Nova Admissão** | o wizard indo até o fim |
| 5 | **Benefícios** e **VT** | as duas frentes mais recentes depois da Clicksign |
| 6 | **Central De Vagas** | ela apareceu para você, e para mais ninguém |

O item 3 é o mais importante, e é o que eu olharia primeiro se algo cheirasse mal: número que muda
sozinho é o sintoma que mais custou caro neste projeto.

### 5.3 Se der errado

**Voltar atrás é viável, e é por causa da seção 2.3.** O desfazer tem duas partes:

- **O código**: desfazer a junção é uma operação padrão do repositório, e a produção volta ao que era.
- **O banco**: apagar as tabelas novas (`vagas`, `vaga_beneficio`) e a coluna nova
  (`usuarios.papel_as`). **Nenhum dado da operação é tocado**, porque as migrations do A&S só
  acrescentam.

O que **não** volta sozinho é o tempo: desfazer e refazer custa a frente inteira de novo. Por isso os
passos 1 a 5 existem, e por isso eu não pularia nenhum.

---

## 6. As perguntas: o que você já respondeu e o que ainda falta

**Você já respondeu, e está registrado:**

| Pergunta | Sua decisão |
|---|---|
| O flag de banco | **evoluir o `is_banco` que já existe**, não criar campo novo |
| O `VAGA_BANCO` | é a **natureza de vaga que já existe**, o banco parado na A&S. Sem conceito novo |
| A ponte | **ponte cara**: a admissão referencia a vaga, para o contador fechar de verdade |
| O aviso de declínio | **híbrido**, os dois lados enxergam, mais o painel de saldo por cliente para a A&S |

**Ainda em aberto, e são quatro:**

1. **A junção**, que é o assunto deste documento. Autoriza, e na ordem da seção 1.3?
2. **A trava e o seletor de status.** Hoje mudar o status para "Em Admissão" desmarca o banco como
   efeito colateral (a correção de 13/08). Com a trava no ar, isso vira uma porta lateral para
   destravar sem querer. Adoto a opção A (tirar esse poder do seletor)? Ela mexe em código validado,
   então é §A.26 e não sigo sem você.
3. **As 17 admissões de banco vivas** em produção. Quer ver a lista antes de a trava subir? Alguma
   delas é banco no sentido antigo do ADM, e não do banco de talentos?
4. **O que conta como "resolver"** o aviso de declínio, para ele não virar ruído que a operação
   aprende a ignorar.

E, fora do banco de talentos, seguem abertas as **três perguntas de 24/08** da Central de Candidatos
(a ordem de Captação e Triagem, se a Entrevista Cliente é obrigatória, e a leitura A ou B da trava de
posições). São elas que destravam a marcação por candidato e o contador completo.
