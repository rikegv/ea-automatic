# O que falta para subir e LIGAR os motores, item por item, com o motivo

Medido em 01/10/2026, contra a produção e o código. Nada aqui é estimativa de quem construiu: cada
linha tem a medição ao lado.

---

## A RESPOSTA CURTA

**Subir a frente do de/para é seguro e pode ser hoje.** Ela nasce inerte e não muda comportamento
nenhum até a variável da planilha existir.

**LIGAR os dois motores NÃO depende da frente do de/para.** Depende de duas decisões suas que ainda
não foram tomadas, e de uma construção que não foi feita. O de/para só muda **quanto trabalho manual
sobra depois** que eles ligarem.

**E o mutirão NÃO impede ligar.** Ele corre depois, e corre melhor com o motor ligado, porque a fila
de revisão é justamente onde o trabalho aparece.

---

## 1. O QUE DESTA FRENTE ESTÁ PRONTO

| peça | estado |
|---|---|
| leitura da planilha viva do Drive | **pronta**, 3.532 linhas lidas ao vivo, versão atual provada |
| tabela de de/para com as duas chaves | **pronta**, migration `0139` |
| proposta na vaga, em coluna própria e inerte | **pronta** |
| curadoria dos 95 nomes | **pronta** |
| tela de revisão com os três casos | **pronta e validada na 3120** |
| sincronização sob demanda | **pronta** (`POST /as/depara-cliente/sincronizar`) |
| gate | typecheck limpo, 79 testes independentes, suíte do backend com 7.933 testes, 62 no `ai-service`, 27 no frontend |

**Nada desta frente está pela metade.** O que falta dela é só **configuração em produção**, abaixo.

---

## 2. O QUE DEPENDE DE DECISÃO SUA, e por quê

### 2.1. A DATA DE CORTE DO PANDAPÉ. **É este o item que impede ligar o Pandapé.**

A varredura **nasce INERTE sem `PANDAPE_VARREDURA_DATA_CORTE`**, e isso é desenho, não esquecimento:
sem a data, **nada é lido**, nem o intervalo roda. A medição está no código: "a data de corte é o que
separa só os novos das inscrições vivas do passivo".

**Por que a fábrica não escolhe por você:** essa data decide **quantas pessoas entram no sistema**.
Medi hoje: **~154.600 inscrições** nas 470 vagas abertas, e **~75.500** na janela de 90 dias. Um
padrão qualquer colheria dado pessoal de dezenas de milhares de pessoas, e isso é decisão de quem
responde pelo tratamento, não de quem constrói.

**Está em produção agora:** `AUSENTE`. Motor **parado**.

### 2.2. O TOKEN DO DIGAI EM PRODUÇÃO. **É este o item que impede ligar o Digai.**

São **três portões**, e os três estão fechados:

| variável | em produção | o que ela destranca |
|---|---|---|
| `DIGAI_API_TOKEN` | **AUSENTE** | sem ela **nada SAI para a rede**: o cliente nasce mudo |
| `DIGAI_INGESTAO_ATIVA` | **AUSENTE** | sem ela **nada é ESCRITO no banco**, mesmo com credencial e leitura boa |
| `DIGAI_POLLING_ATIVO` | **AUSENTE** | sem ela o agendador **não dispara** |

Os dois últimos são portões separados de propósito: "uma integração que começa a escrever no dia em
que o token chega não foi LIGADA, foi SURPREENDIDA". O token está guardado na VM, fora do repositório.

### 2.3. O FILTRO DE "SÓ VAGAS ABERTAS" NO DIGAI. **Isto é CONSTRUÇÃO, não configuração.**

Você decidiu que só entram vagas abertas. **No Pandapé isso já está aplicado** (a varredura pede
`VacancyStatus=2`, e 6.415 das 6.885 vagas ficam de fora). **No Digai NÃO existe filtro nenhum**: a
varredura lista as 537 screenings, de todos os cinco status.

Ligar o Digai hoje, sem construir o filtro, traria **PAUSED (204), QUEUED (110), CLOSED (34) e DRAFT
(2)** junto com as 187 publicadas. É uma mudança pequena, mas **não está feita**, e eu não a construí
porque não estava na OST.

---

## 3. O QUE DEPENDE DE CONSTRUÇÃO QUE NÃO FOI FEITA

| item | tamanho | por que importa |
|---|---|---|
| **filtro de status no Digai** | pequeno | ver 2.3. Sem ele, o recorte que você decidiu não vale nessa fonte |
| **cron da sincronização da planilha** | pequeno | a decisão 1 pede de hora em hora; hoje é sob demanda |
| **o de/para de CARGO** | frente própria | **377 das 470 vagas** não resolvem o cargo. Você já decidiu que é frente separada |

---

## 4. O MUTIRÃO: não impede ligar, e é por isso

| das 470 vagas abertas | |
|---|---|
| nascem com **código** de cliente proposto | **158** |
| nascem com **nome** proposto, sem código | **154** |
| nascem **sem nada** | **158** |

**Nenhuma dessas três situações impede o motor de rodar.** A vaga entra, cai na fila de revisão e
espera alguém. É exatamente o comportamento de hoje, com a diferença de que agora **312 delas chegam
com a resposta na tela**.

**O risco de ligar antes do mutirão é de FILA, não de dado:** a fila de revisão cresce, e quem olha
precisa dar conta. O risco de NÃO ligar é não ter vaga viva nenhuma, que era o combinado.

---

## 5. A RETENÇÃO DE 6 MESES: liga sozinha, e a boa notícia é medida

**Ela JÁ ESTÁ RODANDO em produção**, de hora em hora, sem variável de ambiente, desde que o backend
sobe. Não há portão. Hoje ela não anonimiza ninguém porque `as_candidatos` tem **zero linhas**.

**A pergunta que importa, e eu medi a resposta:** quando a ingestão trouxer histórico, o candidato
descartado há oito meses na origem seria anonimizado na hora seguinte?

**NÃO.** O expurgo compara `greatest(criado_em, atualizado_em)` **do EA**, e a ingestão **não retroage
a data**: `criado_em` tem padrão `now()` e o repositório do Digai nunca o atribui. **O relógio começa
na INGESTÃO.** Então tudo que entrar hoje fica protegido por seis meses, independente da idade na
origem.

**O que continua valendo como irreversível:** passados seis meses sem candidatura viva, a
anonimização acontece **sozinha e não se desfaz**. Candidatura viva em vaga não encerrada protege.

---

## 6. O QUE EU SEI E VOCÊ TALVEZ NÃO

### 6.1. O de/para por NOME é ambíguo para 16 dos 95 nomes, e a sua informação nova agrava isso

Você disse que **cada variante é um código** e que há **dois códigos para o mesmo nome, diferenciados
pelo CNPJ**. Medi o efeito:

| | nomes |
|---|---|
| casam com **um código só** | **20** |
| casam com **MAIS DE UM** (ambíguo) | **16** |
| **não existem** no catálogo | **59** |

O pior caso é **"Sonova", com SETE códigos**. Depois, "Pro-Música" com seis e "Ultracargo" com quatro.

**O sistema JÁ FAZ A COISA CERTA, e isso não foi sorte:** diante de ambiguidade ele **se abstém**,
nunca escolhe um. A vaga cai no caso "só nome", a tela diz quem é o cliente e a pessoa escolhe. Foi
exigência da auditoria, travada em teste, com o mutante "escolhe o primeiro" morto.

**E o CNPJ não resolve, porque ele não existe:** medi no XML bruto da planilha que **26.230 das 26.231
células da coluna CNPJ estão vazias**. Só o cabeçalho tem conteúdo. O catálogo do EA tem CNPJ; a
planilha não.

**Três caminhos, e eu recomendo o primeiro** (§A.31: proponho, não construo):

1. **A tela mostrar os códigos candidatos.** Hoje, no ambíguo, a pessoa escolhe entre 251. Mostrando
   os 2 a 7 candidatos daquele nome, ela escolhe entre poucos. É pequeno e resolve 16 nomes.
2. **O time preencher a coluna CNPJ na planilha.** Resolve de vez e não é construção, é pedido ao
   time. Enquanto a coluna estiver vazia, nenhum desenho desambigua.
3. **A fábrica aprender com a confirmação.** **NÃO recomendo**: aprender por nome é exatamente o que
   a ambiguidade proíbe, e gravaria para sempre a escolha de uma vaga em todas as outras do mesmo nome.

### 6.2. Das 181 divergências, 46 NÃO são anomalia

Eu havia dito 135. Medindo melhor: das 312 vagas que resolvem, **181** estão fechadas ou canceladas na
planilha e ativas no Pandapé. Mas **46 delas casaram pela cadeia de reabertura**, ou seja a linha da
planilha fala da vaga ANTERIOR, que fechou mesmo. **Não há divergência nenhuma nessas 46.**

**A anomalia real é 135**, as que divergem no próprio id da vaga.

### 6.3. O `ai-service` de produção roda do repositório de trabalho

Diferente dos outros serviços, ele não tem release próprio: `WorkingDirectory` aponta para o repositório.
A rota nova **já está no disco dele** e passa a existir no próximo restart, sem cópia.
