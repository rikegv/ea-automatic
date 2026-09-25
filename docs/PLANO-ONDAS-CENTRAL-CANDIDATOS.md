# Central de Candidatos: o plano de ondas e a ordem recomendada

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-25 · **Tipo:** plano para aprovação, nada construído
**Documentos pares:** `DESENHO-AS-CENTRAL-CANDIDATOS.md` (24/08) e `INVESTIGACAO-API-PANDAPE-CANDIDATOS.md`
**§A.11 observada:** nenhum travessão. **§A.6:** candidato é PII, tratado na seção 6.

---

## 0. Como ler este documento

Ele separa duas decisões que costumam se misturar:

- **A ordem TÉCNICA** é recomendação da fábrica, e sai da dependência de arquitetura: o que precisa
  existir antes do que. Está na seção 2.
- **A prioridade de NEGÓCIO** é sua: o que você precisa ver funcionando primeiro.

Onde as duas discordam, eu digo, em vez de escolher sozinho. Está na seção 5.

---

## 1. O que já existe, e é bastante

A junção deixou em produção a base que a Central de Candidatos precisa:

| Peça | Estado |
|---|---|
| Tabela `vagas`, com `posicoes_oficiais` e `posicoes_banco` | em produção, vazia |
| Central de Vagas, trilha de abertura, listagem | em produção |
| Menu do A&S, área `AS`, papel de A&S no usuário | em produção |
| Cliente OAuth do Pandapé, com cache e renovação | em produção, provado ao vivo |
| Fila BullMQ com limitador sob o teto e backoff | em produção |
| Padrão de idempotência por id externo | em produção (`integracao_pandape`) |

**A Central de Candidatos não inaugura infraestrutura.** Ela acrescenta duas tabelas e uma tela, e a
parte do Pandapé é um método de leitura em cima do que já roda.

---

## 2. A dependência técnica, que é o que manda na ordem

### 2.1 O grafo, em uma olhada

```
vagas (JÁ EXISTE)
  │
  ├──> as_candidatos ────┐
  │    (a pessoa, PII)   │
  │                      ├──> as_candidaturas ──┬──> funil de 5 etapas
  │                      │    (pessoa x vaga)   │
  └──────────────────────┘                      ├──> TRAVA por aprovação
                                                │    (precisa de posicoes_oficiais)
                                                │
                                                ├──> marcação OFICIAL / BANCO
                                                │    (destrava o contador do
                                                │     Banco de Talentos)
                                                │
                                                ├──> as_contatos (histórico)
                                                │
                                                └──> varredura do Pandapé
                                                     (precisa de onde escrever)

vagas.id_vacancy_pandape ──> escopo barato da varredura
  (independente de tudo acima)
```

### 2.2 As três leituras que decidem a ordem

**Leitura 1. `as_candidaturas` é o centro de gravidade.** Funil, trava, marcação de banco, histórico e
varredura do Pandapé dependem todos dela, e ela depende de `as_candidatos` mais `vagas`. Nada de valor
sai antes dela existir.

**Leitura 2. A marcação oficial/banco é uma coluna.** Ela é a peça que **destrava o contador do Banco
de Talentos**, a frente que você vem tocando há dias, e o custo dela é uma coluna em
`as_candidaturas` mais a tela. Ela é barata **porque** vem depois da fundação, não apesar disso.

**Leitura 3. A ponte de código não depende de candidato nenhum.** Guardar o `idVacancy` do Pandapé na
vaga do EA é uma coluna em `vagas` e um campo na trilha de abertura. **E o valor dela cresce com o
tempo:** toda vaga aberta a partir do dia em que a coluna existir já nasce com a ponte, e toda vaga
aberta antes disso nasce sem. É o mesmo tipo de argumento que a colisão de migration provou na
junção, com a diferença de que aqui dá para começar o relógio cedo e barato.

**É a única coisa que eu tiraria da onda do Pandapé e puxaria para a primeira.**

### 2.3 Cadastro manual x Pandapé: não é empate

Você perguntou se o manual é mais simples. É, e por uma margem grande:

| | Cadastro manual | Ponte do Pandapé |
|---|---|---|
| Depende de | as duas tabelas novas | as duas tabelas, a fila, o de/para de etapas, e o escopo da varredura |
| Sistema externo | não | sim, com teto de requisição **compartilhado com a folha de pagamento** |
| Se der errado | um modal não salva | **a folha de pagamento atrasa** (§A.5, requisito de segurança) |
| Dado que falta | nenhum | o de/para de etapas, que é insumo seu |
| Delta incremental | não se aplica | **não existe "mudanças desde" na API**, o delta é sempre no cliente |

**Por isso a recomendação isola o Pandapé numa onda própria, e a última.** Não porque valha menos:
porque ele carrega a única complexidade que pode machucar outra área da empresa, e ele precisa de um
lugar para escrever que só as ondas anteriores criam.

---

## 3. O plano de ondas

Cada onda deixa algo funcionando. Nenhuma é só preparação de terreno.

### Onda 1: a pessoa, a vaga e o funil

**O que constrói.** `as_candidatos` (a pessoa) e `as_candidaturas` (a inscrição numa vaga), a tela
`/as/candidatos` com o padrão único de tabela (§A.12/§A.20), o **cadastro manual** em modal de 2
passos com **dedup por CPF na entrada**, a **alocação** da pessoa numa vaga, o **funil de 5 etapas**
(Captação, Triagem, Entrevista Soulan, Entrevista Cliente opcional, Aprovado) com as saídas
Descartado, Desistiu e Contratado, e as **quatro travas**.

**A trava que exige atenção, e é a que costuma ser esquecida:** dois consultores aprovando o 10º e o
11º ao mesmo tempo, cada um contando 9 ocupadas. A checagem tem de acontecer **dentro da transação,
com a linha da vaga travada**, não numa consulta solta antes de gravar. Sem isso ela funciona em toda
demonstração e falha na primeira sexta-feira movimentada.

**Vai junto, e é o item puxado da onda do Pandapé:** a coluna `vagas.id_vacancy_pandape` mais o campo
na trilha de abertura. Só a coluna e o campo, nenhuma chamada de API.

**O que entrega.** O time passa a rodar a seleção inteira dentro do EA: cadastra, aloca, move de
etapa, aprova, e o sistema impede prometer a mesma posição duas vezes. **A planilha de seleção sai de
cena.**

**Tamanho.** É a maior das quatro, e não dá para partir sem entregar meia funcionalidade: uma base de
pessoas sem vaga é uma lista sem propósito, e um funil sem pessoas não tem o que mover.

---

### Onda 2: a marcação oficial e banco, que fecha o contador

**O que constrói.** A marcação **OFICIAL** ou **BANCO** na candidatura, a tela para marcar, e o
contador da vaga passando a **derivar das alocações reais** em vez de sair do número digitado no
fechamento.

**O que entrega.** O "6 de 10 Oficiais, 3 de 10 Banco" que hoje é digitado passa a ser **verdade
calculada**. E o **banco parado na seleção passa a ser contável**, que é exatamente o buraco que eu
reportei quando você fechou o desenho do Banco de Talentos: sem candidatura, o contador só enxergava
quem já tinha ido para o ADM.

**Por que ela é pequena.** Uma coluna, uma consulta de agregação e a tela. É pequena porque a onda 1
pagou a conta da fundação.

**Dependência para fora:** é esta onda que fecha a metade A&S do Banco de Talentos. A outra metade
(o flag, a trava do cadastro e a ponte com a admissão) é a frente do ADM, que ficou destravada pela
junção e tem plano próprio.

---

### Onda 3: o histórico de contato

**O que constrói.** `as_contatos` pendurado na **candidatura**, não na pessoa, mais o registro de
contato e a ficha da pessoa mostrando a união dos históricos agrupada por vaga.

**Por que pende da candidatura:** "liguei e ele não atendeu" só faz sentido dentro de um processo.
Pendurado na pessoa, o histórico de três vagas diferentes vira uma lista embaralhada onde ninguém
sabe de qual processo cada linha fala.

**O que entrega.** O consultor para de perder o fio: quem já foi contatado, quando, e o que a pessoa
respondeu. É a onda que transforma a tela de lista em ferramenta de trabalho.

**Nota de ordem:** esta é a onda mais fácil de adiar sem quebrar nada, e a mais fácil de antecipar
para dentro da onda 1 se você quiser. Ela não é pré-requisito de ninguém.

---

### Onda 4: o Pandapé

**O que constrói.** A varredura por vaga, a **Caixa De Entrada** para candidato de vaga que o EA não
reconhece, e o **de/para de etapas** do Pandapé para o funil de 5.

**Por que ela é a última, e isolada:**

1. Precisa de `as_candidatos` e `as_candidaturas` para ter onde escrever.
2. É a única peça que pode **machucar outra área**: o teto de 1.000 requisições a cada 5 minutos é da
   conta, compartilhado com o webhook que alimenta a folha de pagamento.
3. Depende de um insumo seu que ainda não existe, o de/para de etapas.
4. Carrega a limitação que mais custa desenho: **não existe "mudanças desde" na API**, testado ao
   vivo em catorze variantes. O delta é sempre no cliente, então o sistema baixa para depois
   descartar.

**A conta que decide o desenho da varredura:**

| Escopo | Vagas | Chamadas por ciclo | Cabe no teto? |
|---|---:|---:|---|
| Vagas ativas do Pandapé | 907 | cerca de 1.800 | **não**, é quase o dobro do teto sozinho |
| Vagas ABERTAS na Central de Vagas | 198 | cerca de 400 | **sim**, com folga |

Escopar pelas vagas do EA é o que torna a varredura viável de 5 em 5 minutos, e **é isso que a coluna
puxada para a onda 1 compra**. Enquanto a cobertura da ponte for baixa, a varredura roda **uma vez por
dia** sobre as ativas do Pandapé, que cabe. Conforme as vagas novas forem nascendo com o id, ela vai
ficando mais barata e mais frequente **sozinha, vaga por vaga**, sem nenhuma migração.

**O que entrega.** O candidato para de ser digitado: 253 pessoas de uma vaga entram sozinhas. É o
maior ganho operacional das quatro ondas.

**O que ela deliberadamente não faz:** não escreve no Pandapé (mover etapa segue clique humano lá,
como já é na admissão), não substitui o webhook da admissão, e não puxa documento.

---

## 4. A ordem recomendada, em uma linha

**1 (fundação, funil e travas, mais a coluna da ponte) → 2 (marcação de banco) → 3 (histórico) → 4 (Pandapé).**

| Onda | Entrega | Depende de | Risco |
|---|---|---|---|
| 1 | a seleção roda dentro do EA | nada, `vagas` já existe | médio, é a maior |
| 2 | o contador do banco vira verdade calculada | onda 1 | baixo |
| 3 | o histórico de contato | onda 1 | baixo |
| 4 | o candidato entra sozinho | ondas 1 e 2, mais insumo seu | **alto**, sistema externo com teto compartilhado |

---

## 5. Onde o técnico e o negócio podem discordar

Três tensões reais. Nenhuma eu resolvo sozinho.

### 5.1 O Pandapé é o maior ganho e é o último

**A tensão.** A onda 4 é a que mais alivia a operação, e a ordem técnica a coloca por último.

**Por que não dá para antecipar:** ela precisa de tabela onde escrever. Não é preferência, é
dependência. O máximo que se pode antecipar já está antecipado, que é a coluna da ponte na onda 1.

**Se a sua prioridade for essa**, o caminho é encurtar a onda 1 ao mínimo que a varredura precisa (as
duas tabelas e a alocação, deixando funil e travas para depois) e emendar o Pandapé. **Não recomendo:**
entra candidato automático numa tela sem funil e sem trava, e a primeira coisa que acontece é alguém
aprovar além das posições.

### 5.2 A onda 2 é pequena, mas só vale se a onda 1 for adotada

**A tensão.** O contador de banco vira verdade calculada, mas ele calcula em cima das alocações que o
time fizer. Se a onda 1 subir e o time continuar na planilha, o contador fica correto e vazio.

**Consequência prática:** entre a onda 1 e a onda 2 existe um período de **adoção**, não de código. Se
você quiser o contador cheio rápido, o que acelera não é construir mais, é o time começar a usar.

### 5.3 A onda 3 pode ir para dentro da 1

**A tensão.** O histórico é o que faz o consultor querer usar a tela. Deixá-lo para a terceira onda
pode ser deixar a adoção da onda 1 mais lenta, e a adoção é o que a seção 5.2 diz que importa.

**Minha leitura:** vale antecipar o histórico para dentro da onda 1 **se** você achar que sem ele o
time não larga a planilha. É a única das quatro que eu moveria por razão de negócio sem prejuízo
técnico, porque ela não é pré-requisito de ninguém.

---

## 6. §A.6: candidato é PII, e o desenho trata isso desde a primeira linha

`as_candidatos` é a **primeira tabela do sistema criada só para guardar dado pessoal de quem ainda não
é funcionário**: nome, CPF, telefone, e-mail e data de nascimento. Isso muda o cuidado.

| Regra | Como nasce |
|---|---|
| CPF nunca em log | vale para a tela e para a varredura. O log registra `idMatch` e `idVacancy`, que são identificadores técnicos, não pessoas |
| **CPF nunca na URL** | a busca por CPF não pode virar query string: URL vaza em log de proxy, em histórico de navegador e em referer |
| CPF opcional | candidato de seleção muitas vezes não deu CPF ainda. Unique **parcial**, só quando existe |
| Guard de área | o A&S reivindica a controller inteira, leitura incluída, como a Central de Vagas já faz |
| Minimização na varredura | puxar da API só os campos que a tela usa, não o perfil completo porque ele está disponível |

**Uma pergunta que o desenho não responde e eu levanto agora: por quanto tempo o candidato
DESCARTADO fica na base?** O sistema já tem precedente de retenção mínima com expurgo automático (o
CPF de substituição, §A.3 regra 10, 48h após a assinatura). Um candidato descartado há dois anos, com
CPF e telefone guardados, é dado pessoal sem finalidade ativa. **Não decido isso: é decisão sua, e
tem lado de negócio (o banco de talentos existe justamente para reaproveitar gente).**

---

## 7. As perguntas de vocabulário que seguem abertas

**Já fechadas por você:** captação vem antes da triagem, e a entrevista com o cliente é opcional.

**Abertas, e as duas são insumo seu:**

1. **O de/para das etapas do Pandapé para o funil de 5.** As pastas do Pandapé têm **nome livre por
   vaga**: a vaga de teste tinha `Lead`, `Inscritos`, `Pré-selecionado`, `Finalistas`, `Contratados`,
   `Descartados`. **Não existe id canônico de "contratado"**, então sem o de/para a varredura sabe
   quem é a pessoa e não sabe em que etapa ela está. **Trava a onda 4, e só ela.**
2. **O que conta como "resolver" o aviso de declínio.** Esta é da frente do Banco de Talentos, não do
   funil, e continua aberta. Sem ela, o aviso renasce a cada 20 minutos para sempre e a operação
   aprende a ignorá-lo, que é a morte de qualquer aviso.

**E seguem abertas, do plano do ADM:** a opção A na trava (tirar do seletor de status o poder de
desmarcar o `is_banco`, que mexe em código validado, §A.26) e se você quer ver a lista das 17
admissões de banco vivas antes de a trava subir.

---

## 8. O que eu preciso de você para começar

1. **Aprova a ordem 1, 2, 3, 4?**
2. **Quer o histórico de contato dentro da onda 1** (seção 5.3), para acelerar a adoção?
3. **A coluna da ponte na onda 1 está aprovada?** É barata e o valor dela cresce com o tempo.
4. **Retenção do candidato descartado** (seção 6): por quanto tempo?
5. **O de/para das etapas do Pandapé**, quando puder. Não trava as ondas 1 a 3.
