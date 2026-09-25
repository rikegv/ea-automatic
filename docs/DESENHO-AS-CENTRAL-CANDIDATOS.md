# A&S Central de Candidatos: o funil inteiro, da entrada à vaga

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-24 · **Tipo:** desenho de experiência e de dados (§A.27)
**Regra desta OST:** nada construído até o diretor lapidar. Este documento é o mapa.
**Documento par:** `docs/INVESTIGACAO-API-PANDAPE-CANDIDATOS.md` (o que a API entrega)
**Ambiente:** homologação, quando construir. §A.11 (sem travessão), §A.24 (title case em título e etiqueta).

---

## 0. O que governa este desenho

Cinco coisas já decididas em frentes anteriores, que este desenho obedece em vez de rediscutir:

| # | Decisão | De onde vem | Consequência aqui |
|---|---|---|---|
| 1 | A vaga é a fonte da verdade, e tem N posições | Arquitetura A&S, 18/08 | A ocupação da vaga é DERIVADA do candidato, nunca digitada |
| 2 | A&S nasce isolado, menu novo só para o SUPER_ADMIN | §A.23 | O menu `as-candidatos` nasce invisível, e o diretor libera quem vê |
| 3 | Nunca inventar cliente, cargo ou vaga | §A.9 | Candidato de vaga não resolvida ESPERA, não é chutado numa vaga |
| 4 | Candidato de seleção frequentemente não tem CPF | Precedente da Sala de Espera | O CPF é OPCIONAL na base de candidatos, §2.1 |
| 5 | A ponte com a esteira admissional é frente SEPARADA, a última | `vagas.enviar_para_admissao`, 22/08 | Este desenho para no candidato aprovado. Ele não cria admissão |

---

## 1. O rumo, em uma frase

Hoje o candidato só existe no EA **depois** que virou admissão. A Central de Candidatos traz o
funil inteiro para dentro: a pessoa entra quando é captada, caminha pelas etapas, é alocada numa vaga
e sai por cima (aprovada) ou por baixo (descartada). A vaga deixa de ser um número solto e passa a
saber quem está concorrendo a ela.

---

## 2. O modelo de dados: três tabelas, e o motivo de cada uma

### 2.1 `as_candidatos`, a PESSOA

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | PK. **A chave é o id, não o CPF** |
| `nome` | varchar(200) | obrigatório. **PII** |
| `cpf` | varchar(11) | **OPCIONAL**, 11 dígitos sem máscara. Unique PARCIAL (só quando existe). **PII** |
| `email`, `telefone` | varchar | contato. **PII** |
| `data_nascimento` | date | **PII** |
| `cidade`, `uf` | varchar | onde mora, para a região da vaga |
| `origem` | enum | `PANDAPE` · `MANUAL` · `INDICACAO` · `BANCO_TALENTOS` |
| `id_candidate_pandape` | varchar | id da PESSOA no Pandapé, quando veio de lá. Unique parcial |
| `criado_por_id`, `criado_em` | | trilha |

**Por que o CPF NÃO é a chave primária, ao contrário da tabela `candidatos` da Admissão.** Candidato
de seleção muitas vezes ainda não deu o CPF: ele mandou currículo, foi captado numa feira, veio por
indicação. Se o CPF fosse a chave, ou o time inventaria um número para conseguir cadastrar, ou a
pessoa não entraria. **Já enfrentamos isso uma vez**, e foi exatamente por isso que a Sala de Espera
nasceu como tabela separada com CPF opcional, em vez de forçar linha em `candidatos`.

**Quando o CPF aparece**, a pessoa passa a ser casável com `candidatos` da Admissão. Esse é o ponto
de encontro entre as duas frentes, e ele acontece naturalmente, sem migração.

### 2.2 `as_candidaturas`, a INSCRIÇÃO da pessoa NUMA vaga

Esta é a tabela central. É ela que responde "quem está concorrendo a quê".

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | PK |
| `candidato_id` | uuid | FK `as_candidatos` |
| `vaga_id` | uuid | FK `vagas` (a Central de Vagas que já existe) |
| `etapa` | enum | a etapa do funil, §3 |
| `situacao` | enum | `ATIVO` · `APROVADO` · `DESCARTADO` · `DESISTIU` |
| `motivo_descarte` | varchar | só quando descartado, do catálogo |
| `id_match_pandape` | varchar | id da inscrição no Pandapé. **Unique**, é a idempotência da ponte |
| `alocado_em`, `alocado_por_id` | | trilha de quem ligou a pessoa à vaga |
| `admissao_id` | uuid | nulo. Preenchido no dia da ponte com a esteira (frente futura) |

**Unique `(candidato_id, vaga_id)`:** a mesma pessoa não se candidata duas vezes à mesma vaga. Sem
isso, um duplo clique ou uma segunda varredura do Pandapé duplica a linha e a contagem de posições
passa a mentir.

**A mesma pessoa PODE estar em várias vagas ao mesmo tempo**, e isso é normal em A&S. É por isso que
a candidatura é tabela própria, e não um campo `vaga_id` dentro do candidato.

### 2.3 `as_contatos`, o HISTÓRICO

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | PK |
| `candidatura_id` | uuid | FK. **O contato pertence ao PROCESSO, não à pessoa solta** |
| `tipo` | enum | `LIGACAO` · `WHATSAPP` · `EMAIL` · `ENTREVISTA` · `OBSERVACAO` |
| `resumo` | text | o que aconteceu. Digitado por gente |
| `ocorrido_em` | timestamp | quando |
| `registrado_por_id` | uuid | quem registrou |

**Por que o contato pende da CANDIDATURA e não do candidato:** "liguei e ele não atendeu" só faz
sentido dentro de um processo. Pendurado na pessoa, o histórico de três vagas diferentes vira uma
lista embaralhada onde ninguém sabe de qual processo cada linha fala. A ficha da pessoa mostra a
união dos históricos, agrupada por vaga, então nada se perde e tudo fica legível.

---

## 3. O funil: cinco etapas e três saídas

### 3.1 A proposta

| Ordem | Etapa | O que significa |
|:---:|---|---|
| 1 | **Captação** | A pessoa entrou. Ninguém olhou ainda |
| 2 | **Triagem** | Currículo analisado, o perfil bate com a vaga |
| 3 | **Entrevista Soulan** | Entrevistada pelo time da Soulan |
| 4 | **Entrevista Cliente** | Encaminhada e entrevistada pelo cliente |
| 5 | **Aprovado** | O cliente aprovou. **Pronta para virar admissão** |

E três saídas, que podem acontecer em QUALQUER etapa:

| Saída | Quando |
|---|---|
| **Descartado** | O time ou o cliente recusou. Exige motivo, do catálogo |
| **Desistiu** | A pessoa saiu por conta própria |
| **Contratado** | Virou admissão de fato. Só no dia da ponte com a esteira |

### 3.2 Duas coisas para o Rike lapidar

**Q1. A ordem de Captação e Triagem.** Coloquei captação primeiro: primeiro a pessoa entra, depois
alguém olha. Se na operação da Soulan "triagem" é o filtro que acontece ANTES de a pessoa entrar na
base, a ordem inverte e o desenho muda. **Não decidi sozinho porque é vocabulário da operação.**

**Q2. Entrevista Cliente é sempre obrigatória?** Em vaga de alto volume o cliente costuma não
entrevistar um a um. Se for opcional, o candidato pula da Entrevista Soulan direto para Aprovado, e
isso precisa ser um caminho legítimo e não uma exceção.

### 3.3 O funil do EA é FIXO, o do Pandapé é livre

A investigação mostrou que as pastas de etapa do Pandapé têm **nome livre por vaga** (a vaga de teste
tinha `Lead`, `Inscritos`, `Pré-selecionado`, `Finalistas`, `Contratados`, `Descartados`).

**O EA não copia o nome da pasta.** Ele tem o funil fixo acima e um **de/para** que traduz a pasta do
Pandapé para a etapa do EA. Copiar o nome livre significaria ter tantos funis quanto vagas, e nenhum
relatório fecharia. O de/para é insumo do Rike (§8, item 2).

---

## 4. A alocação e a trava de posições: a decisão mais importante deste documento

### 4.1 A tensão, com números

O pedido foi: **"10 posições, não aloca o 11º"**. Existem duas leituras, e elas levam a sistemas
muito diferentes.

| Leitura | O que trava | O que acontece na prática |
|---|---|---|
| **A, literal** | Nenhum 11º candidato entra na vaga | Vaga de 10 posições aceita 10 candidatos **no total**. Como se contrata 10 pessoas entrevistando 10? Não se contrata. A operação varre a trava com vaga fantasma |
| **B, por aprovação** | Nenhum 11º candidato é **APROVADO** | Vaga de 10 posições aceita 40 candidatos no funil e trava a aprovação no 11º. É o que o negócio faz |

**Recomendo a leitura B**, e o motivo é aritmético: um funil de seleção precisa de mais gente na
entrada do que na saída. Travar a entrada em 10 significa que o time só pode olhar 10 pessoas para
escolher 10, ou seja, não pode escolher.

**A leitura B ainda entrega o que o pedido quer:** ninguém consegue prometer a mesma posição duas
vezes, que é o estrago real que a trava existe para impedir.

Isto também é coerente com a régua já escrita na arquitetura de 18/08, que decidiu que **candidato em
seleção não consome posição**, pelo mesmo motivo: se consumisse, passaria a existir gente ocupando
vaga sem estar na esteira, e a identidade de contagem do Alto Volume quebraria no primeiro dia.

### 4.2 A régua, escrita como invariante

```
POSIÇÕES        = vagas.posicoes                        (a meta, digitada na abertura)
OCUPADAS        = candidaturas da vaga com situacao APROVADO ou CONTRATADO
LIVRES          = POSIÇÕES menos OCUPADAS
EM SELEÇÃO      = candidaturas ATIVAS                    (não consomem posição)
FORA DA CONTA   = DESCARTADO e DESISTIU                  (nunca somam, nunca subtraem)

TRAVA           aprovar exige LIVRES > 0
```

**Ocupação é sempre derivada, nunca armazenada.** É a mesma decisão que a vaga já tomou no schema
("a ocupação é sempre DERIVADA, nunca armazenada"). Guardar um contador significa ter dois números
que discordam no dia em que alguém desfaz uma aprovação.

### 4.3 As quatro travas, e onde cada uma vive

| # | Trava | Mensagem para o operador |
|---|---|---|
| 1 | **Aprovar além das posições** | "Esta vaga tem 10 posições e as 10 já estão preenchidas. Reprove alguém ou aumente as posições da vaga." |
| 2 | **Alocar em vaga fechada** | "Esta vaga está FECHADA e não recebe candidato novo." Vale para `FECHADA`, `CANCELADA` e `ENTREGUE` |
| 3 | **Duplicar a candidatura** | "Esta pessoa já está nesta vaga." Garantida pelo unique, não só pela tela |
| 4 | **Corrida entre dois consultores** | Sem mensagem: os dois clicam, um passa e o outro recebe a trava 1 |

**A trava 4 é a que costuma ser esquecida e é a que mais dói.** Dois consultores aprovando o 10º e o
11º ao mesmo tempo, cada um contando 9 ocupadas, e a vaga fecha com 11. A checagem precisa acontecer
**dentro da transação, com a linha da vaga travada** (`SELECT ... FOR UPDATE` na vaga antes de contar
e gravar), não numa consulta solta antes do insert. Sem isso a trava funciona em toda demonstração e
falha na primeira sexta-feira movimentada.

### 4.4 O que acontece quando a vaga muda de tamanho

Vaga de 10 que vira 8 **depois** de 9 aprovações: o sistema **não desaprova ninguém**. Ele passa a
mostrar a vaga como excedida (9 de 8) e deixa a correção para gente. Desfazer aprovação em silêncio
seria o sistema decidindo quem perde o emprego.

---

## 5. Como o candidato entra: os dois caminhos

### 5.1 Caminho A, puxado do Pandapé

Detalhado na Entrega 1. Em resumo, e do ponto de vista desta tela:

```
varredura por vaga  →  cada match vira as_candidatos + as_candidaturas
                       idempotente por id_match_pandape
                       etapa resolvida pelo de/para de pasta
```

**O que fazer com candidato de vaga que o EA não reconhece.** A vaga do Pandapé pode não ter
correspondente na Central de Vagas (é a lacuna §7.4 da Entrega 1). Nesse caso o candidato **não é
descartado e não é chutado numa vaga qualquer**: ele cai numa **Caixa De Entrada**, com o
identificador da vaga do Pandapé visível, esperando alguém dizer a que vaga ele pertence.

É exatamente o padrão que a admissão já usa: pré-admissão sem cliente vai para a Liberação em vez de
inventar `cod_cliente`. Mesma regra, mesma tela mental, §A.9.

### 5.2 Caminho B, cadastrado à mão

Um botão **Novo Candidato** na tela, abrindo um modal curto. **Não é uma trilha de 5 passos:** são
cerca de 10 campos, e a trilha da vaga existe porque lá são quase 40. Aplicar o padrão de trilha aqui
seria seguir a forma e perder o motivo.

| Passo | Campos |
|---|---|
| **1 de 2, A Pessoa** | Nome (obrigatório) · CPF (opcional, com validação quando preenchido) · Telefone · E-mail · Data de nascimento · Cidade e UF · Origem |
| **2 de 2, A Vaga** | Vaga (seletor com busca, só ABERTAS) · Etapa em que entra (padrão: Captação) · Observação inicial |

**Dedup na entrada, e é obrigatório.** Ao digitar o CPF, ou ao sair do campo Nome, o sistema procura
quem já existe. Achando, ele **não bloqueia e não cria duplicata em silêncio**: mostra a pessoa e
oferece "alocar esta pessoa nesta vaga" em vez de "criar de novo". É o mesmo comportamento que o
wizard de admissão já tem no CPF duplicado (F11), e pelo mesmo motivo.

**O passo 2 é pulável.** Candidato pode entrar no banco de talentos sem vaga nenhuma. Uma pessoa sem
candidatura é uma pessoa na base, não um erro.

---

## 6. As telas

### 6.1 `/as/candidatos`, a Central

Padrão único de tabela (§A.12), larguras aproveitando o espaço e conferidas contra esmagamento
(§A.20), como a Central de Vagas fez.

**Colunas:** Candidato · Vaga · Cliente · Cargo · Etapa · Último Contato · Ações

**KPIs clicáveis como filtro** (toggle, igual às outras telas): Total · Em Captação · Em Triagem ·
Em Entrevista · Aprovados · Descartados.

**Filtros:** vaga, cliente, etapa, origem, consultor responsável. **Busca** por nome e por CPF.

**Ações, só ícone com rótulo por extenso** no `title` e no `aria-label`, como ficou na Central de
Vagas: ver ficha (olho) · mover de etapa · registrar contato.

**Duas abas**, porque são duas perguntas diferentes e uma tabela só responde mal as duas:

| Aba | Responde |
|---|---|
| **Candidatos** | "Onde está o fulano?" A lista acima, uma linha por candidatura |
| **Banco De Talentos** | "Quem eu tenho disponível?" Uma linha por PESSOA, sem vaga, para quem procura perfil |

### 6.2 O Funil Da Vaga, dentro da Central de Vagas

A tela `/as/vagas` ganha uma ação nova na linha: **ver candidatos**. Ela abre o funil daquela vaga.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Auxiliar de Serviços Gerais · IFF Esteio                           │
│  3 de 10 posições preenchidas · 7 livres · 24 em seleção            │
├──────────┬──────────┬─────────────┬──────────────┬──────────────────┤
│ Captação │ Triagem  │ Entrev.     │ Entrev.      │ Aprovado         │
│          │          │ Soulan      │ Cliente      │                  │
│    9     │    8     │      5      │      2       │      3           │
└──────────┴──────────┴─────────────┴──────────────┴──────────────────┘
        Descartados: 12    ·    Desistiram: 2
```

A linha de posições é o coração: **"3 de 10 preenchidas, 7 livres"** é a informação que hoje não
existe em lugar nenhum do sistema, e é ela que a trava da §4 protege.

### 6.3 A ficha do candidato (o olho)

Modal, quatro blocos:

| Bloco | Conteúdo |
|---|---|
| **Identificação** | Nome, contato, CPF, nascimento, cidade. **PII**, §7 |
| **Perfil** | Formação, experiências, idiomas, pretensão salarial. Vem do Pandapé quando a origem é Pandapé, vazio quando é manual |
| **Candidaturas** | Todas as vagas em que a pessoa está ou esteve, com etapa e situação. É aqui que se vê "ela está em 3 processos" |
| **Histórico De Contato** | Linha do tempo, agrupada por vaga, com o botão Registrar Contato |

**O bloco Perfil depende da lacuna §7.1 da Entrega 1.** Sabe-se que a API entrega formação,
experiência e idiomas; não se sabe o formato exato. **O desenho da tela fica pronto, o preenchimento
dos campos espera o spike.** Enquanto isso, origem manual não tem perfil e a tela já trata o vazio.

### 6.4 A Caixa De Entrada (só quando a ponte do Pandapé ligar)

Uma aba ou tela pequena: candidatos que chegaram do Pandapé com vaga não reconhecida. Uma linha por
pessoa, mostrando o identificador da vaga do Pandapé e o cargo, e uma ação: escolher a vaga do EA.
Zerada, a tela some do caminho de quem não precisa dela.

---

## 7. §A.6: candidato é PII, e mais exposta que a da admissão

Um ponto que merece atenção do Rike: a base de candidatos guarda dado pessoal de **gente que nunca
foi contratada e talvez nunca seja**. Isso é diferente da esteira, que trata de quem virou (ou está
virando) funcionário. Minimização pesa mais aqui.

| Regra | Como |
|---|---|
| **CPF nunca em log, nunca em URL** | As rotas usam o `id` do candidato, nunca o CPF no caminho. Mesma correção que a admissão já fez |
| **Rota inteira fechada pelo menu** | `as-candidatos` reivindica a controller inteira, **leitura incluída**, como `as-vagas` faz. Invisível E inerte para quem não tem o menu |
| **Menu nasce só para o SUPER_ADMIN** | §A.23. O diretor libera quem vê |
| **Exportação sem CPF por padrão** | Se houver exportação, o CPF só sai com escolha explícita e fica na trilha |
| **Aviso no campo de contato** | O resumo do contato é texto livre digitado por gente. Um aviso curto no campo pedindo para não escrever dado sensível (saúde, opinião, vida pessoal) custa nada e evita o pior |

**Uma pergunta de retenção que eu NÃO decido sozinho:** por quanto tempo o EA guarda um candidato
descartado que nunca virou funcionário? Manter para sempre é acúmulo de PII sem finalidade; apagar
cedo mata o banco de talentos, que é justamente o valor da tela. **Isso é decisão do diretor**, e o
desenho aceita qualquer prazo que ele escolher, inclusive "não expurga".

---

## 8. O que depende do Rike antes de construir

| # | Decisão | Bloqueia? |
|---|---|---|
| 1 | **A leitura da trava: A literal ou B por aprovação** (§4.1). Recomendo B | **Sim.** É o miolo da frente |
| 2 | **O de/para das etapas** do Pandapé para o funil do EA (§3.3) | Só o caminho Pandapé. O cadastro manual anda sem ele |
| 3 | **Q1, a ordem de Captação e Triagem** (§3.2) | Sim, é o vocabulário da tela |
| 4 | **Q2, Entrevista Cliente é obrigatória?** (§3.2) | Sim |
| 5 | **Catálogo de motivos de descarte** | Não. Nasce com uma lista curta e cresce |
| 6 | **Retenção do candidato descartado** (§7) | Não bloqueia construir, bloqueia ir para produção |
| 7 | **A ponte vaga do EA para vaga do Pandapé** (Entrega 1, §7.4) | Só o tempo real. Sem ela a varredura é diária |
| 8 | **Aval do Pandapé Operações** para `GET /v2/matches` (Entrega 1, §6) | Só a produção do caminho Pandapé |

**O que dá para construir sem NENHUMA das oito:** as três tabelas, a tela, o cadastro manual, a
alocação e a trava. O caminho Pandapé é a segunda onda, e depende de 2, 7 e 8.

---

## 9. Encaixe com a Central de Vagas, e o que isso alcança

| Ponto | O que muda | Risco |
|---|---|---|
| `vagas.posicoes` | Passa a ter significado operacional: é a meta contra a qual a ocupação é medida | Nenhum. Só leitura |
| Listagem de vagas | Ganha uma coluna com a ocupação ("3/10") | Baixo. Aditivo, mas mexe numa tela **validada em 23/08** |
| **Fechar Vaga** | Hoje o `vagasFechadas` é **digitado à mão**. Com o funil, ele pode ser **sugerido** pela contagem real de aprovados | **§A.26: alcança código validado.** Pergunta antes, não faço por conta própria |
| `enviar_para_admissao` | Já registra a intenção e não liga nada. A Central de Candidatos é quem vai alimentar essa ponte no dia dela | Nenhum agora |

**A ressalva do Fechar Vaga é deliberada.** Trocar um campo digitado por um número calculado parece
melhoria óbvia e é exatamente o tipo de mudança que a §A.27 nasceu para conter: ela alcança uma tela
que o diretor validou há um dia. Fica proposto, não fica feito.

---

## 10. O que este desenho NÃO faz, de propósito

- **Não cria admissão.** O candidato aprovado para na Central de Candidatos. A ponte com a esteira é
  a última frente do planejamento, e tem dona.
- **Não escreve no Pandapé.** Mover etapa lá continua sendo clique humano, como já é na admissão.
- **Não mexe no Alto Volume.** A contagem de projeto continua exatamente como está.
- **Não substitui a Liberação.** Ela continua sendo a porta da admissão. Um dia a vaga vai sugerir
  cliente e cargo para ela, e isso já está desenhado na arquitetura de 18/08. Não é esta OST.

---

*Documento de desenho para validação do diretor. Nada construído, nada commitado. Nenhum dado
pessoal acessado.*
