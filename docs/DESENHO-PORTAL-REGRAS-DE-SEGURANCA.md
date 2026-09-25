# Regras De Segurança Do Portal Do Candidato

**Frente:** Portal do candidato, link externo para envio de documentos, extração por IA e alimentação do G.I
**Autoria:** agente `seguranca` (audita e veta, sem poder de escrita, §A.39)
**Natureza:** DESENHO. Nenhum arquivo do app foi tocado, nada foi commitado, nada foi construído.
**Base medida:** código em produção do VT, da auditoria documental, do throttler e do proxy do Next, lidos em 18/09/2026.
**Versão:** 3, de 18/09/2026. Ajusta a versão 2 (barreira do Fernando) ao **modelo novo proposto pelo Fernando e aprovado pelo diretor**: o arquivo vai direto do navegador do candidato para a nuvem do Google, e a IA lê no momento do upload.
**Régua:** §A.6 (LGPD), §A.38 (auditoria adversarial antes do deploy), §A.11 (sem travessão), §A.24 (title case).

---

## 0. A Leitura Em Uma Página

O modelo novo, nas palavras do diretor, é: **o candidato sobe, a IA lê na hora e auto-preenche, o
arquivo vai para o Google.** O arquivo **não é guardado no nosso servidor**, e com isso saem do escopo
da fábrica a guarda do arquivo, o antivírus do arquivo e a retenção do arquivo. Isso é real e é
bastante: a seção 3 reclassifica a Camada U item por item, e a maior parte dela sai mesmo.

**O que esta versão existe para dizer, e é o item mais importante do documento:** a frase "o arquivo
não toca o nosso servidor" e a frase "a IA lê na hora, no fluxo do upload" podem ser as duas
verdadeiras ao mesmo tempo, **ou não**, dependendo de por onde os bytes passam. **Armazenar e
processar são coisas diferentes.** A seção 1 abre as três leituras possíveis, diz o que cada uma tira
e o que cada uma deixa, e recomenda uma para o diretor levar ao Fernando.

**O critério geral, que vale para qualquer resposta que o Fernando der, e que substitui qualquer
suposição futura:**

> **Proteção de arquivo só sai do nosso lado na medida em que o BYTE NÃO PASSA POR NÓS.**
> Guardar em outro lugar tira a guarda, a retenção e o antivírus. **Não tira o teto de tamanho nem o
> endurecimento do leitor**, se for o nosso processo que abre o arquivo.

**O que o modelo novo APAGA de verdade:** staging local, expurgo do arquivo, TTL de 48h do binário,
nome de arquivo original em disco, memória versus disco, antivírus nosso, varredura antes do Drive.

**O que o modelo novo CRIA, e não existia no cardápio da versão 2** (seção 4, Camada G): **quem
autoriza a escrita no armazenamento do Google**. O navegador do candidato só escreve lá se alguém lhe
der uma credencial, e **quem emite é o EA**. Uma credencial de escrita mal emitida é **permissão de
escrita aberta no nosso armazenamento**, que é uma responsabilidade nova, mais perigosa que as que
saíram, e **é aqui que o teto de tamanho volta, embutido na própria assinatura, mesmo na leitura L-C.**

**O que continua verdadeiro, medido no código, e continua sendo furo de construção:**

1. **O balde do rate limit é único e global para todo o sistema.** `app.module.ts:43` declara
   `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])` e o `ThrottlerGuard` é global (`:77`).
   A barreira **agrava** isto (seção 7).
2. **O link de hoje não é revogável.** `apps/backend/src/vt-coleta/vt-link-token.ts`: token
   auto-suficiente, verificado offline, `VT_LINK_TTL_DIAS_PADRAO = 7` (linha 30), sem lista de
   revogação. Vazou no WhatsApp, vale sete dias e não há botão que o mate.
3. **Não existe teto de tamanho de upload em lugar nenhum.** Os oito `FileInterceptor`/
   `FilesInterceptor` do projeto são declarados sem a opção `limits`. **Este item SÓ SAI da lista na
   medida da seção 1**: nas leituras L-A e L-B ele continua igual de necessário, e na L-C ele muda de
   lugar, não desaparece.

---

## 1. A Tensão Que O Modelo Embute, E As Três Leituras

Esta seção não contraria a decisão. Ela diz o que falta combinar para a decisão ser implementável sem
buraco, e a pergunta é uma só, feita nestes termos:

> **O byte do arquivo passa, em algum momento, por um processo NOSSO?**

As três respostas possíveis são compatíveis com as frases do diretor, e **mudam o cardápio**.

### L-A: Envio Duplo. O Navegador Manda Para O Google E Manda Uma Cópia Para O Nosso Leitor

O navegador envia o arquivo ao armazenamento do Google **e** envia o mesmo arquivo ao nosso serviço de
IA, que lê **em memória**, extrai os campos, devolve a sugestão e **descarta**. Nada é gravado do nosso
lado.

| O que acontece | Consequência |
|---|---|
| **O arquivo NÃO é armazenado por nós** | saem: guarda, retenção, staging, expurgo, TTL, nome em disco, antivírus nosso |
| **O byte PASSA por nós** | **o teto de tamanho NÃO sai. Ele fica exatamente igual de necessário**, porque é o que impede que um envio de 2 GB derrube o serviço que lê |
| **O nosso processo ABRE o arquivo** | o risco muda de natureza: deixa de ser "malware armazenado" e passa a ser **exploração do leitor**, o analisador de PDF ou de imagem processando bytes hostis. Ver seção 4.6 |
| Cumpre "a IA lê na hora"? | **sim, ao pé da letra.** É a leitura que mais se aproxima da descrição do diretor |
| Cumpre "o arquivo não toca o nosso servidor"? | **sim quanto a ARMAZENAR, não quanto a PROCESSAR** |

**Variante L-A', que precisa ser dita porque é a que a implementação tende a virar sozinha:** o
navegador manda **uma vez só, para nós**, e nós repassamos ao Google. Funciona, é mais simples para o
candidato, e **é a leitura em que o byte mais passa por nós**: aí o nosso serviço também vira o
escritor no armazenamento, e some o ganho de "o arquivo não toca o nosso servidor". Só vale se o
diretor concluir que o envio duplo custa caro demais para o candidato no 4G, que é o custo real da
L-A: o celular sobe o mesmo arquivo duas vezes, e as duas subidas podem falhar em momentos diferentes
(seção 4.3, o caminho de volta).

### L-B: O Navegador Manda Só Para O Google, E Nós Lemos De Lá No Mesmo Ciclo

O navegador escreve no armazenamento e avisa o EA; o EA baixa o objeto **imediatamente**, lê em
memória, extrai e descarta a cópia.

| O que acontece | Consequência |
|---|---|
| **O arquivo NÃO é armazenado por nós** | saem os mesmos itens da L-A |
| **O byte PASSA por nós** | **o teto de tamanho continua**, pelo mesmo motivo, e o endurecimento do leitor também |
| Cumpre "a IA lê na hora"? | **funcionalmente sim** (mesmo ciclo, o candidato vê a sugestão na hora), **mas contraria a frase literal "a IA não busca o arquivo depois no Google"**, porque é exatamente isso que ela faz, só que em segundos |
| Ganho próprio | **um envio só** do celular, e o EA lê de dentro da rede do Google, que é rápido e barato |
| Custo próprio | a leitura exige **credencial de LEITURA** do nosso lado, além da de escrita do candidato, e a régua do "quem enxerga" fica mais larga |

### L-C: Tudo Acontece Dentro Do Google. O Arquivo Nunca Passa Por Nós

O navegador escreve no armazenamento e a extração roda **lá dentro** (função no Google, serviço de
documento do Google), devolvendo ao EA **apenas os campos extraídos**, texto estruturado, nunca o
binário.

| O que acontece | Consequência |
|---|---|
| **O byte nunca passa por nós** | **aqui sim as proteções de arquivo saem de verdade**: teto de tamanho do nosso processo, endurecimento do leitor, formato por conteúdo, PDF com senha, PDF ativo, dimensão de imagem. Nada disso é nosso, porque nada nosso abre o arquivo |
| Cumpre as duas frases do diretor? | **é a única que cumpre as duas inteiras** |
| O que NÃO sai, mesmo aqui | **a credencial de escrita** (seção 4.1), **a confirmação de chegada** (4.3), **quem enxerga o armazenamento** (4.4), **a sugestão nunca ser dado final** (4.5), **o teto de tamanho embutido na assinatura** (4.1), e todos os itens de link, identidade, tentativa e log |
| Custo próprio | **a IA deixa de viver no Portal**, o que contraria a frase "a IA vive no Portal, não no Drive", e a extração passa a depender de um componente que não é nosso, com prompt, versão e qualidade fora do nosso controle. Toda mudança de régua documental vira pedido ao Fernando |

### A Recomendação

**L-A, com o envio duplo, e com a consequência declarada em voz alta: o teto de tamanho CONTINUA
nosso, e o leitor é endurecido (seção 4.6).**

Três motivos, na ordem:

1. **É a única que cumpre as duas frases funcionais do diretor sem reinterpretação**: a IA lê na hora,
   no fluxo do upload, vive no Portal, e não busca nada no Google depois. A L-B entrega a mesma
   experiência mas desmente a frase; a L-C entrega a frase mas tira a IA do Portal.
2. **A régua documental é nossa e muda toda semana.** Quem decide se um comprovante de residência
   serve é o EA, com o catálogo `tipos_documento` vivo (§A.3). Na L-C essa decisão migra para um
   componente do Fernando, e cada ajuste de régua vira um chamado de infraestrutura.
3. **O que a L-C economizaria já é barato.** Endurecer o leitor (limite de tamanho, de páginas, de
   dimensão, tempo máximo, recusar senha e conteúdo ativo) custa em torno de 2 dias e reusa código que
   já existe em produção (`conteudo-documento.ts`, `mime-documento.ts`, `contrato-assinado.ts`). Não
   vale trocar isso por dependência externa na parte mais viva do produto.

**O que se pede ao Fernando, em uma linha:** confirmar se o desenho dele é o **envio duplo** (o
navegador manda para o Google e para o nosso leitor) ou se ele imaginava a extração **dentro** do
Google. As duas são construíveis; o que não pode é a fábrica **supor** uma e o Fernando **supor**
outra, porque o item que cai no vão é justamente o teto de tamanho.

**E o critério que vale para qualquer resposta, inclusive uma quarta que ninguém previu:** proteção de
arquivo sai do nosso lado **só na medida em que o byte não passa por nós**.

---

## 2. A Barreira Continua De Pé, E Agora Ela Conduz Menos

A decisão 1 da versão 2 continua valendo: **o EA nunca fica exposto direto na internet.** O backend
segue em `127.0.0.1:3011` (`main.ts:43`), e o candidato alcança o portal por um **servidor de
barreira** do Fernando, que é um **relé**.

**O que muda com o modelo novo:** a barreira deixa de conduzir o **arquivo** e passa a conduzir só
**requisição de aplicação** (identificação, sessão, pedido de credencial de escrita, confirmação,
sugestão da IA). Na leitura L-A ela conduz também a **cópia para o leitor**, o que mantém um corpo
grande atravessando a borda; nas L-B e L-C ela não conduz binário nenhum.

| Consequência | Efeito |
|---|---|
| **O antivírus da barreira perde o objeto** | ele varria o arquivo de passagem. Sem passagem de arquivo (L-B, L-C), não há o que varrer na borda: a varredura migra para o **lado Google**, depois da gravação, e isso é diferente (seção 6.4) |
| **O teto de corpo da borda** | continua em L-A (protege o leitor), some em L-B e L-C, onde o corpo é pequeno |
| **O limite por IP** | **intacto e mais importante**, porque continua sendo o único ponto do caminho que vê o IP do candidato |
| **A allowlist de caminhos** | **intacta**, e ganha um caminho novo, o de emitir credencial de escrita, que é o mais sensível de todos |
| **A rota inalcançável fora da barreira** | **intacta**, e muda de motivo: já não sustenta o antivírus, passa a sustentar **quem consegue pedir credencial de escrita** |

**Resumo:** a barreira continua resolvendo **camada de rede e de borda**, e continua não resolvendo
**camada de aplicação**, que é onde mora quase todo o cardápio restante.

---

## 3. A Camada U Reclassificada, Item Por Item

Legenda: **SAI (Fernando/Google)**, **CONTINUA NOSSO**, **DEPENDE DA LEITURA**.

| # | Proteção | Classificação | Por quê |
|---|---|---|---|
| U1 | **Teto de 10 MB por arquivo** | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO**, inteiro. É o que impede que um envio de 2 GB derrube o serviço que lê. **L-C: muda de lugar, não some**, vira `x-goog-content-length-range` na credencial de escrita (seção 4.1) |
| U2 | **Teto de quantidade: 25 arquivos por link, 60 MB somados** | **CONTINUA NOSSO**, nas três | só o EA sabe quantos arquivos aquele candidato já mandou, e agora é ele quem **emite uma credencial por arquivo**: contar é de graça, basta não emitir a 26ª |
| U3 | **Teto de ritmo: 1 por vez, 10 por minuto por link** | **CONTINUA NOSSO** (por link) mais **Fernando** (por IP) | vira teto de **emissão de credencial**, que é onde o ritmo passa a ser observável |
| U4 | **Tipo decidido pelo CONTEÚDO** (`extensaoPorMagicBytes`, `classificarConteudo`) | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO**, e fica mais importante, porque é a primeira coisa que o leitor faz antes de abrir. **L-C: sai do processo**, mas **não some**: vira restrição de `Content-Type` na credencial, que é fraca (o cliente declara), então em L-C isto passa a ser verificação **do lado Google**, depois da gravação |
| U5 | **HEIC do iPhone: converter para JPEG** | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO.** **L-C:** ou o Google converte, ou o HEIC fica armazenado como está e quem abrir depois que se vire, o que é pior para a operação |
| U6 | **Recusar arquivo protegido por senha** | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO**, e fica **mais importante**: PDF cifrado é o que o leitor não abre e o que antivírus nenhum varre. **L-C:** o arquivo é gravado cifrado e ninguém percebe, até o RH tentar abrir |
| U7 | **Recusar PDF com conteúdo ativo** (`/JavaScript`, `/OpenAction`, `/Launch`, `/EmbeddedFile`) | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO.** É política, não assinatura. **L-C:** vira política de quem varre o bucket (seção 6.4). Documento de identidade não tem motivo para ter JavaScript, em leitura nenhuma |
| U8 | **Não aceitar compactado** (zip, rar, 7z, gz) | **CONTINUA NOSSO**, nas três | é a allowlist de tipo, e em L-C ela vira restrição na credencial mais varredura depois. Compactado com senha é o par clássico do U6 |
| U9 | **Antivírus do arquivo** | **SAI (Fernando/Google)**, nas três, **e muda de momento** | deixa de ser "varre antes de passar" e vira **"varre depois de gravado"**, que é diferente e cria o item de fronteira F5 novo: o que se faz com arquivo reprovado que **já está lá** |
| U10 | **Limite de dimensão de imagem** (recusar acima de 50 megapixels) | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO**, e sobe de RECOMENDADO para **OBRIGATÓRIO**, porque agora é o nosso leitor que descomprime. **L-C: sai** |
| U11 | **Arquivo em MEMÓRIA, nunca em disco** | **DEPENDE DA LEITURA** | **L-A e L-B: CONTINUA NOSSO e fica trivial**, porque já não existe motivo nenhum para gravar. **L-C: SAI**, não há arquivo nosso |
| U12 | **Staging com TTL de 48h** (`StagingPurgeService`) | **SAI**, nas três | não existe staging local no modelo novo. O `StagingPurgeService` continua servindo a auditoria de hoje, que é outra frente, e o portal não o usa |
| U13 | **Nome original DESCARTADO**, renomeado | **CONTINUA NOSSO**, nas três, **e muda de natureza** | deixa de ser higiene de disco e vira **regra de emissão**: o nome do objeto no armazenamento é **escolhido por nós** e vai dentro da credencial (seção 4.1). O candidato nunca escolhe onde grava |
| U14 | **Tempo limite de requisição e conexões simultâneas** | **Fernando**, nas três | é a borda quem enxerga a conexão lenta |
| U15 | **O que a IA extrai é SUGESTÃO, nunca dado final** | **CONTINUA NOSSO, e fica MAIS importante** | passa a ser **a única coisa que olha o conteúdo do nosso lado**. Ver seção 4.5 |

**Leitura rápida:** na L-C saem 7 itens da Camada U; na L-A e na L-B saem 3 (U9, U12, e o U11 vira
trivial). A diferença entre as duas colunas é exatamente a diferença entre **armazenar** e
**processar**.

---

## 4. Camada G: O Que NASCE Com Este Modelo

Esta é a seção onde um desenho ruim deixa buraco, porque o modelo novo **parece** ter só removido
coisa. Nada do que está aqui existia no cardápio de 57 itens da versão 2.

### 4.1 G1, A Credencial De Escrita No Google (O Item Mais Perigoso Do Documento)

O navegador do candidato só escreve no armazenamento se alguém lhe der **uma URL assinada ou uma
sessão de upload**. **Quem emite é o EA.** Isto substitui as proteções que saíram e é mais delicado do
que elas: **uma credencial de escrita sem restrição é permissão de escrita aberta no nosso
armazenamento**, entregue pela nossa própria rota, para quem estiver com um link.

Regras, todas OBRIGATÓRIAS, nas três leituras:

| Regra | Por quê |
|---|---|
| **Objeto único, nome escolhido por NÓS** | `{admissaoIdOpaco}/{codigoTipo}__{uuid}.{ext}`. O candidato nunca informa caminho nem nome. Nome vindo do cliente é travessia de caminho e é sobrescrita de objeto alheio |
| **Um arquivo por credencial** | credencial reutilizável vira canal de upload ilimitado. Quer mandar o segundo documento, pede a segunda credencial, e aí o U2 e o U3 contam |
| **Prazo curtíssimo, na ordem de minutos** | ela é emitida para ser usada em seguida. Prazo de horas é link de escrita circulando |
| **Método de escrita apenas** | nada de `GET`, nada de `LIST`, nada de `DELETE` |
| **Sem sobrescrita** | a credencial não pode gravar por cima de objeto existente, nem do próprio candidato. Sobrescrita apaga prova |
| **TETO DE TAMANHO EMBUTIDO NA ASSINATURA** | é aqui que o U1 volta **mesmo na L-C**. O armazenamento do Google aceita faixa de tamanho assinada; sem ela, a credencial escreve 50 GB e a conta é nossa |
| **TIPO EMBUTIDO NA ASSINATURA** | `Content-Type` fixado na assinatura. É fraco (o cliente declara), então **não substitui o U4**, mas barra o caso preguiçoso |
| **Emitida SÓ depois da identificação** | link válido mais CPF e nascimento conferidos mais sessão do portal viva. Rota de emissão alcançável sem identificação é o furo mais caro que este modelo pode ter |
| **Registrada** | evento próprio no log (L21), com `jti`, tipo de documento e tamanho máximo concedido, nunca o nome do objeto completo se ele carregar identificador reversível |

### 4.2 G2, A Credencial Não Pode LER Nem LISTAR

Explicitado à parte porque é o erro mais comum na configuração: uma credencial concedida no nível do
bucket, em vez do objeto, **permite enumerar e baixar o documento de todos os outros candidatos**. O
teste é direto e precisa ser feito, não suposto: com a credencial emitida para o candidato A, tentar
listar o bucket e tentar baixar um objeto do candidato B. As duas tentativas têm de falhar.

### 4.3 G3, O Caminho De Volta: Como O EA Sabe Que O Arquivo Chegou

**Se o candidato avisa "subi" e o EA acredita, o EA mente.** Um cliente hostil (ou um 4G que caiu no
meio) produz uma admissão com documento marcado como entregue e objeto nenhum no armazenamento, e
ninguém descobre até a assinatura do contrato. Isto é a versão silenciosa do dano da §A.33.

**A confirmação tem de ser do lado do servidor, e há duas formas aceitáveis:**

1. **O EA confere o objeto**, por metadado: existe, tem o nome que nós escolhemos, tem tamanho maior
   que zero e tipo coerente. É uma chamada barata, feita no mesmo ciclo, e **não é baixar o arquivo**,
   então não contamina a leitura L-C.
2. **O armazenamento avisa o EA** (notificação de objeto criado), e o EA concilia com a credencial que
   emitiu. Mais robusto, depende de configuração do Fernando.

**A regra, em qualquer das duas:** o documento só vai a `ENTREGUE` depois da confirmação do lado do
servidor. Credencial emitida e não confirmada expira e o documento continua pendente. Na leitura L-A
existe um caso a mais, e ele precisa estar no desenho: **a IA leu e o upload para o Google falhou.** Aí
existe sugestão preenchida e arquivo nenhum guardado, o que é pior do que não ter lido, porque a tela
diz que deu certo. A sugestão só se aplica depois do G3.

### 4.4 G4, Onde O Arquivo Cai, E Quem Enxerga

Perguntas fechadas, que precisam de resposta antes de construir:

- **É o mesmo armazenamento que a operação usa** (o prontuário do Drive de hoje, §A.5) **ou é uma área
  de entrada separada?** A recomendação é **área de entrada separada**, e o arquivo só vai ao
  prontuário depois de validado, pelo mesmo caminho de hoje. Misturar entrada externa com prontuário
  significa que um documento não conferido aparece na pasta do funcionário.
- **Quem enxerga a área de entrada?** Consultor não navega em bucket. O acesso ao objeto é sempre
  mediado pelo EA, com RBAC, e nunca por link de armazenamento circulando.
- **A URL do objeto é referência do Drive ou URL externa?** Referência de Drive pode ser persistida
  (§A.5). **URL assinada, temporária ou de terceiro, não é persistida nem logada**, em lugar nenhum.
- **Retenção lá dentro:** por quanto tempo o objeto fica na área de entrada, e quem apaga. É §A.6 num
  armazenamento que não é o nosso banco, e sem prazo declarado ele é infinito por omissão.

### 4.5 G5, A Sugestão Da IA Nunca É Dado Final (O U15, Promovido)

Continua nosso e **fica mais importante do que era**, porque no modelo novo a extração passa a ser **a
única coisa que olha o conteúdo do nosso lado**. As regras:

- Todo campo auto-preenchido nasce marcado como **sugestão**, com origem registrada.
- **Nenhum campo vindo da IA escreve direto em dado autoritativo.** CPF, nome, data de nascimento e
  vínculo com a admissão vêm do link e da base, nunca do documento lido.
- **Quem confirma é humano**, e a confirmação é o que grava (evento L16, com autor).
- **O texto extraído não vai para log** (§A.6), nem em amostra, nem em mensagem de erro.
- Divergência entre o que a IA leu e o que a base diz é **sinalização**, nunca correção automática.

### 4.6 G6, O Risco Do LEITOR (Só Nas Leituras L-A E L-B)

Quando o byte passa por nós, o risco deixa de ser malware armazenado e passa a ser **o analisador**:
biblioteca de PDF ou de imagem processando bytes construídos para quebrá-la. Antivírus não cobre isso,
e ele nem está mais no caminho. O que se faz:

| Proteção | Regra |
|---|---|
| **Limite de tamanho** | o U1, inteiro, aplicado antes de o leitor abrir qualquer coisa |
| **Limite de páginas** | teto declarado por documento, para não abrir PDF de 30.000 páginas |
| **Limite de dimensão** | o U10, promovido a OBRIGATÓRIO: bomba de descompressão de imagem é geometria, não praga |
| **Tempo máximo de processamento** | o leitor tem prazo. Estourou, aborta e recusa, sem travar o processo |
| **Processo isolado, e ele não é o processo do EA** | a extração roda no `ai-service`, separada, sem credencial de banco, sem rota interna, e uma queda dela não derruba a operação |
| **Recusar arquivo com senha** | o U6, e aqui ele também protege o leitor de ficar tentando abrir |
| **Recusar conteúdo ativo** | o U7, decisão de política |
| **Sem rede de saída a partir do leitor** | o processo que abre arquivo de origem externa não precisa alcançar a internet, nem o banco, nem o Redis |

---

## 5. O Modelo De Ameaça, Ajustado Ao Modelo Novo

| # | Quem | Onde morre agora |
|---|---|---|
| A1 | **Curioso com o link de outra pessoa** | **no EA**, e só por E3, E6, E9, E10. Continua o caso mais provável de todos |
| A2 | **Ex-funcionário que já sabe nome e CPF** | **no EA** (E6, E7) |
| A3 | **Robô de varredura** | **na barreira** (I1, I2) |
| A4 | **Força bruta de data de nascimento** | **nos dois**: por IP na barreira, por CPF e por link no EA |
| A5 | **Enumerador de CPF** | **no EA, inteiramente.** A barreira encaminha a resposta e o cronômetro intactos |
| A6 | **Quem sobe malware** | **muda de lugar:** deixa de ser barrado antes e passa a ser **detectado depois, já gravado** (seção 6.4). Nas L-A e L-B, o alvo também muda: não é mais o nosso disco, é o nosso **leitor** (G6) |
| A7 | **Negação de serviço por volume** | **na barreira** na rede, **no EA** na aplicação (seção 7). Nas L-A e L-B o corpo grande volta a atravessar a borda |
| A8 | **Enchedor de armazenamento** | **no EA** (U2, U3, G1), e agora tem **custo em nuvem**, não só espaço |
| **A14** | **Quem obtém uma credencial de escrita e a usa fora do portal** | **NOVO, criado por este modelo.** Morre nas restrições do G1 (objeto único, prazo curto, tamanho e tipo assinados, sem sobrescrita) e no G2. Sem elas, é escrita aberta no nosso armazenamento |
| **A15** | **Quem usa a credencial para LER ou LISTAR o que já está lá** | **NOVO.** Morre no G2, e só nele. É o vazamento em massa deste modelo |
| **A16** | **Quem declara upload que não aconteceu** | **NOVO.** Morre no G3. Sem ele, o EA acredita no cliente |
| **A17** | **Quem manda arquivo hostil para quebrar o LEITOR** | **NOVO nas L-A e L-B.** Morre no G6 |
| A9 | **Pivotar para dentro da rede** | **na barreira** (I5), e agora também no isolamento do leitor (G6) |
| A11 | **O candidato de má-fé** (documento de outra pessoa, sobe o que quiser) | **no EA** (I6, G5). Nenhuma barreira e nenhuma nuvem veem isso |
| A12 | **Phishing imitando o portal** | **em nenhum dos dois.** É comunicação (E16, F8) |
| A13 | **Quem alcança o EA sem passar pela barreira** | **MANTIDO e mudou de motivo:** já não é o antivírus que depende disso, é **quem consegue pedir credencial de escrita**. Ver V9 |

**O ativo mais valioso continua não sendo o arquivo: é a base de candidatos.** Portal que responde
diferente para CPF que existe e CPF que não existe vira oráculo consultável do Grupo Soulan inteiro, e
nem a barreira nem a nuvem mudam uma vírgula disso.

---

## 6. A Divisão Fernando E Google x Fábrica, Refeita

Nenhum buraco (cada um achando que o outro faz) e nenhum trabalho feito duas vezes sem que a
duplicidade seja proposital.

### 6.1 Lista Do Fernando E Do Google, Nominal

| # | Item | O que exatamente é dele |
|---|---|---|
| T1 | HTTPS e redirecionamento | terminar o TLS na barreira, certificado com renovação automática |
| T2 | HSTS | cabeçalho na borda, 6 meses |
| I1 | Nega tudo por padrão | `Require all denied` na raiz mais allowlist nominal por caminho e por método |
| I2 | `/api/auth/*` inalcançável | fora da allowlist, sem exceção |
| I3 | Nome externo próprio | DNS e vhost separados do institucional |
| I5 | Isolamento de rede | a barreira alcança **só** a rota do portal, e nada de banco, Redis ou VM |
| U14 | Tempo limite e conexões simultâneas | em torno de 30 s por requisição, teto de conexões por IP |
| A-1 | Rate limit por IP real | 60 requisições por minuto por IP, e teto próprio para a rota de emissão de credencial |
| A-3 (borda) | Cabeçalho de IP real | reescrever com `set`, nunca `append`, acompanhado do segredo combinado |
| T10 (borda) | Log de acesso sem PII | sem query string, ou com mascaramento. Retenção declarada |
| **U9** | **Antivírus do arquivo** | **dele, e agora do lado do armazenamento**, não da passagem. Varredura do bucket, cadência, assinatura atualizada |
| **N1** | **Criar e configurar o armazenamento** | bucket, região, versionamento, acesso público bloqueado, quem tem papel de leitura |
| **N2** | **Política de retenção no armazenamento** | por quanto tempo o objeto fica na área de entrada, e a regra de expurgo |
| **N3** | **A checagem dos computadores que baixam depois** | declarada pelo diretor como dele. A fábrica não a assume nem a substitui |
| A-4 | Captcha, se um dia entrar | decisão na borda. Hoje: não entra |

### 6.2 Lista Da Fábrica, Nominal

**Camada E (link e identidade), inteira:** E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E13, E14,
E15, E16. (E12, uso único, recusado pelo diretor.) **Nada aqui foi tocado pelo modelo novo.**

**Camada T:** T3, T5, T6, T9, T11, T12.

**Camada U, o que sobrou:** U2, U3 (por link), U8, U13 (como regra de nomeação do objeto), U15.
Mais, **nas leituras L-A e L-B**: U1, U4, U5, U6, U7, U10, U11.

**Camada A:** A-2, A-3 (lado aplicação), A-5 (lado aplicação), A-6.

**Camada I:** I4, I6, I7.

**Camada G, nova e inteira:** G1, G2, G3, G4 (o lado EA), G5, e G6 nas L-A e L-B.

**Mais a Camada L inteira** (seção 9), insumo da Sala De Segurança.

### 6.3 Itens De Fronteira, Revisados

| # | Fronteira | O combinado que precisa existir |
|---|---|---|
| **F1** | **O cabeçalho de IP real** | nome do cabeçalho, segredo que prova que veio da barreira, e o EA só o aceita no salto confiável. Sem o segredo, qualquer um forja o IP (medido: `vt.service.ts` documenta que o valor forjado chega intacto) |
| **F2** | **Teto de tamanho** | **muda de forma.** Em L-A e L-B: borda mais aplicação, mesmo número, duplicidade proposital. **Em L-C: some da borda e reaparece DENTRO da assinatura da credencial (G1).** Em nenhuma leitura ele simplesmente desaparece, e é este o item que mais corre risco de cair no vão |
| **F3** | **Teto de ritmo** | a borda limita por IP, o EA limita por `jti` e por emissão de credencial. Limite de borda mais apertado que o da aplicação faz o candidato legítimo bater na borda e nunca ver a mensagem boa |
| **F4** | **Log sem PII nos dois lados** | a barreira declara o que grava e por quanto tempo; o EA grava a Camada L. Número do que a barreira barrou exige coletor combinado, que não existe |
| **F5** | **Arquivo REPROVADO na varredura DEPOIS de gravado** | **item novo, e é diferente de barrar antes.** Quatro perguntas fechadas: (1) quem varre o bucket e com que cadência? (2) o arquivo infectado é **apagado, movido para quarentena ou só marcado**? (3) **quem avisa o EA**, e por qual caminho, para que o documento volte a PENDENTE e o RH saiba? (4) se ninguém avisar, o EA continua com o documento marcado como entregue, apontando para um objeto que foi removido, **e ninguém percebe**. Hoje não há combinado nenhum |
| **F6** | **Cabeçalhos de segurança** | **um emissor só por cabeçalho.** Borda e app emitindo CSP diferentes: um sobrescreve o outro. Duplicar aqui faz mal |
| **F7** | **A allowlist de caminhos** | a lista nominal das rotas do portal é da fábrica, o Fernando aplica. **Ganha a rota de emissão de credencial, que é a mais sensível.** Rota nova não avisada quebra em produção, em silêncio. **A LISTA ESTÁ FECHADA ABAIXO, na seção F7.1.** |

### F7.1. A lista nominal das rotas do Portal, fechada

Levantada do **boot real do backend**, não do código, em 21/09/2026. É esta lista que vai ao
Fernando quando a barreira do Portal for montada.

**ENTRAM na allowlist (são do CANDIDATO, `@Public()` com guard próprio):**

| método | caminho | o que é |
|---|---|---|
| `POST` | `/api/portal/identificar` | o candidato confirma CPF e nascimento e abre a sessão |
| `POST` | `/api/portal/recuperacao` | a válvula de quem não consegue entrar |
| `GET` | `/api/portal/documentos` | a trilha dele |
| `POST` | `/api/portal/credencial` | **a mais sensível**: emite a credencial de escrita no armazenamento |
| `POST` | `/api/portal/confirmar` | o candidato confirma que o arquivo chegou |
| `GET` | `/api/portal/vt-link` | **acrescentada em 21/09**: a ponte para o formulário de vale-transporte |

**FICAM DE FORA, sem exceção (são do TIME, exigem sessão autenticada do EA):**

| método | caminho |
|---|---|
| `POST` | `/api/portal/links/:admissaoId` |
| `POST` | `/api/portal/links/:jti/revogar` |
| `POST` | `/api/portal/links/:jti/bloquear` |
| `POST` | `/api/portal/links/:jti/desbloquear` |

**A ALLOWLIST É POR CAMINHO NOMINAL, NUNCA POR PREFIXO, e é por isso que esta tabela tem duas
metades.** Um `portal/*` largo arrastaria junto as quatro de baixo, e a primeira delas **fabrica
credencial de acesso ao prontuário de um candidato**. O modelo por caminho é o que já foi provado
no vhost da `/vt` (§A.17); escrever por prefixo abre a porta **em silêncio**, que é pior do que
esquecer uma rota, porque esquecer quebra e aparece.

**O `/api/auth/*` continua inalcançável**, sem exceção (item I2).

**Quem acrescentar rota nova ao Portal acrescenta a linha aqui no mesmo commit.** Rota nova não
avisada quebra em produção sem erro visível: a barreira nega, o candidato vê uma tela que não
carrega, e nada no EA registra o motivo.

| **F8** | **O nome externo e a comunicação** | o nome publicado, o comunicado ao candidato e o exibido na tela são o mesmo. Contra A12, nome divergente é o próprio phishing |
| **F9** | **Link revogado e expirado na borda** | link morto devolve a **mesma** página para revogado, expirado e inexistente. Página de erro do servidor dele distinguindo os casos recria o oráculo |
| **F10** | **A rota do portal é inalcançável fora da barreira** | **mudou de motivo, não de importância.** Já não sustenta o antivírus; sustenta **quem consegue pedir credencial de escrita** |
| **F11** | **Quem cria e configura o armazenamento** | **novo.** Bucket, acesso público bloqueado, papéis, versionamento, e **quem tem a chave que assina as credenciais**. Se a chave de assinatura for ampla demais, o G1 inteiro é teatro |
| **F12** | **A retenção do objeto na área de entrada** | **novo.** Prazo declarado, quem apaga, e o que o EA faz quando o objeto some antes do prontuário ser montado |
| **F13** | **A confirmação de chegada** | **novo.** Metadado consultado pelo EA ou notificação do armazenamento. Se for notificação, é configuração dele; se for consulta, é credencial de leitura nossa, restrita ao objeto |

### 6.4 O Antivírus Mudou De MOMENTO, E Isso Não É Detalhe

Na versão 2, o antivírus varria **antes** de o arquivo passar: reprovado, o arquivo não entrava e o
candidato via um erro na hora. No modelo novo, o arquivo **é gravado primeiro** e varrido depois.

**As consequências, que precisam estar no combinado F5:**

1. **O candidato não fica sabendo.** Ele terminou, viu a sugestão da IA, fechou o navegador. A
   reprovação acontece depois, sem plateia.
2. **O documento fica marcado como entregue** enquanto o objeto é apagado ou posto em quarentena, a
   menos que alguém avise o EA.
3. **A janela entre gravar e varrer existe**, e nela o objeto está no armazenamento, alcançável por
   quem tiver papel de leitura lá dentro.

Nada disso desqualifica a decisão. **Significa que o item "antivírus" não é mais uma caixa marcada em
outra lista: ele é uma fronteira com um caminho de volta que precisa ser construído**, e o caminho de
volta é nosso.

---

## 7. Os Furos De Construção Que Restam

**Dois, e meio.** Os dois primeiros são incondicionais.

### 7.1 O Balde Global Do Throttler (Agravado Pela Barreira)

**Medido:** `app.module.ts:43` declara `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])`, o
`ThrottlerGuard` é global (`:77`), e o tracker padrão é `req.ip`. O browser fala com o Next, que
repassa em loopback (`next.config.mjs`), e o backend escuta em `127.0.0.1` (`main.ts:43`). **Todo
mundo já é `127.0.0.1` hoje**, e o próprio código documenta isso (`vt.controller.ts:34`,
`vt.service.ts:39`).

Com a barreira, **todo o tráfego do portal chega ao EA a partir de UM endereço**, e candidatos,
atacante e operação interna dividem o mesmo balde de 120 por minuto. Um atacante que sustente esse
volume faz o EA devolver 429 **na cara dos consultores**, sem nunca autenticar.

**O modelo novo não alivia isso, e num ponto piora:** a rota de **emissão de credencial** é barata de
chamar e cara de ignorar, e ela é a mais atraente de todas para automatizar.

**Fechar exige o A-2:** balde separado para as rotas do portal, tracker por `jti`, balde global
inalcançável de fora. Em torno de 1 dia. **É veto de saída.**

### 7.2 O Link Não Revogável

`vt-coleta/vt-link-token.ts`: token auto-suficiente, verificado offline, `VT_LINK_TTL_DIAS_PADRAO = 7`
(linha 30), sem lista de revogação. Nenhuma barreira e nenhuma nuvem matam link vazado. **No modelo
novo fica pior**, porque o link agora é a porta para **pedir credencial de escrita no nosso
armazenamento**. Fechar exige o E10 e o E11: lista de `jti` revogados, conferida a cada identificação,
mais revogação automática ao emitir link novo. Em torno de 1 dia.

### 7.3 O Teto De Tamanho: Sai Só Na Medida Da Seção 1

**Isto não desaparece, e é dito aqui exatamente para não sumir na reorganização.**

- **Leitura L-A ou L-B: o furo CONTINUA, igual.** Nenhum dos oito `FileInterceptor`/`FilesInterceptor`
  do projeto declara `limits`, e o serviço que lê o arquivo é nosso. **São três furos, não dois.**
- **Leitura L-C: o furo MUDA DE LUGAR**, para dentro da assinatura da credencial (G1, faixa de tamanho
  assinada). Continua obrigatório, deixa de ser multer.

**Em nenhuma das três leituras o teto simplesmente sai.**

---

## 8. Os Vetos, Revisados

Vetado significa: chegando assim ao deploy, o parecer é **VETADO**, com estas evidências.

| # | Veto | Situação no modelo novo | Evidência medida |
|---|---|---|---|
| V1 | **Portal no ar dividindo o balde global do throttler com o sistema interno** | **AGRAVADO, mantido.** Seção 7.1 | `app.module.ts:43` e `:77`, `next.config.mjs`, `main.ts:43` |
| **V2** | **Upload sem teto de tamanho** | **MUDOU DE FORMA, não saiu.** Passa a ser: **em L-A e L-B**, rota de upload do portal sem `limits.fileSize` é veto, igual à versão 2. **Em L-C**, credencial de escrita emitida **sem faixa de tamanho assinada** é veto, pelo mesmo motivo e com dano maior (a conta da nuvem é nossa) | nenhum dos oito `FileInterceptor`/`FilesInterceptor` declara `limits` |
| V3 | **Link não revogável em portal que recebe arquivo** | **MANTIDO, e reforçado:** o link agora é a porta para pedir credencial de escrita | `vt-link-token.ts:30`, verificação offline sem consulta de revogação |
| V4 | **CPF em URL, query, path ou log** | **MANTIDO e reforçado:** a URL atravessa o log da barreira, e agora também **o nome do objeto no armazenamento**. Nome de objeto com CPF é CPF em log de terceiro | §A.6, direto |
| V5 | **Replicar no portal o claim `cpf` em claro do token do VT** | **MANTIDO** | `ClaimsTokenVt` carrega `cpf` e `nome` (`vt-link-token.ts:56-57`) |
| ~~V6~~ | ~~Aceitar upload sem antivírus~~ | **RETIRADO da lista da fábrica**, confirmado. É do Fernando e do Google. **Substituído pelo V11**, que cobre o buraco que a mudança de momento criou | seção 6.4 |
| V7 | **Mensagem que distingue CPF inexistente de data errada, na tela OU no log** | **MANTIDO** | `VtService.identificar` resolve certo na tela; o log ainda não existe e pode nascer errado |
| V8 | **EA confiando em `X-Forwarded-For` do cliente para decisão de limite** | **MANTIDO** | `vt.service.ts:39`, teste empírico documentado no código |
| **V9** | **Rota do portal alcançável por qualquer caminho que não seja a barreira** | **MANTIDO, com OUTRO motivo.** Já não é o antivírus assumido que cai: é que **a rota de emissão de credencial de escrita fica alcançável por dentro**, e quem a alcançar escreve no nosso armazenamento sem passar por limite de IP nenhum. Mais perigoso do que era | a arquitetura depende disso e hoje não há verificação que o prove |
| **V10** | **NOVO. Credencial de escrita sem restrição de objeto, de método, de tamanho, de tipo e de prazo, ou emitida antes da identificação** | **NOVO, criado por este modelo.** Credencial ampla é permissão de escrita aberta no nosso armazenamento, entregue pela nossa própria rota. Inclui: credencial que permite **listar, ler ou sobrescrever** (G2) | não há código ainda. Nasce vetado por omissão se qualquer uma das restrições do G1 faltar |
| **V11** | **NOVO. Documento marcado como ENTREGUE sem confirmação do lado do servidor de que o objeto existe** | **NOVO.** Acreditar no "subi" do cliente produz admissão com documento entregue e arquivo nenhum, descoberta só na assinatura. É a versão silenciosa do dano da §A.33 | G3 |
| **V12** | **NOVO. Valor extraído pela IA gravando direto em dado autoritativo, sem confirmação humana** | **NOVO em forma de veto** (era o U15, RECOMENDADO forte). Sobe porque a extração virou a única coisa que olha o conteúdo do nosso lado | G5 |
| **V13** | **NOVO, só nas leituras L-A e L-B. Leitor de arquivo sem limite de tamanho, de páginas, de dimensão e de tempo, ou rodando dentro do processo do EA** | **NOVO.** Com o antivírus fora do caminho e o byte passando por nós, o leitor é o alvo. Um PDF malformado que derruba o parser derruba o serviço | G6 |

---

## 9. Os Eventos Que Precisam Ser Registrados

Insumo direto da Sala De Segurança (`docs/DESENHO-PORTAL-SALA-DE-SEGURANCA.md`). **Hoje não existe
nenhuma tabela de log de acesso ou de tentativa no EA**: a única trilha com valores é a
`candidato_alteracoes_log` (`db/schema/tables.ts:1672`), que é de edição, não de acesso.

### Como Registrar IP E CPF Sem Violar A §A.6

- **CPF: nunca cru, em campo nenhum.** `candidato_hash` = `sha256(pepper + cpf)`, truncado em 32 hex,
  padrão que a `VtService.chaveCpf` já usa. Para exibir ao humano, CPF mascarado, derivado na hora a
  partir do candidato, nunca do log.
- **IP completo existe em um lugar só**, a tabela de evento de segurança, com leitura restrita a
  Master e Super Admin, **truncado aos 90 dias**. Todo o resto usa `ip_hash` com **sal mensal**.
- **Retenção:** 90 dias com IP completo, truncado até 12 meses, agregado por hora até 24 meses.
- **Nunca, em campo nenhum:** CPF cru, data de nascimento, nome, e-mail, telefone, nome de arquivo
  original, conteúdo do arquivo, token, `Authorization`, **URL assinada do armazenamento** (§A.6),
  texto extraído pela IA.

### A Lista Nominal

Campos comuns: `id`, `tipo`, `ocorrido_em`, `jti_link`, `candidato_hash`, `ip` ou `ip_hash`, `ua_hash`,
`resultado` (`OK` ou `RECUSADO`), `motivo_codigo` (enum curto, nunca texto livre).

| # | Evento | Quando dispara | Campos próprios | O que NUNCA entra |
|---|---|---|---|---|
| L1 | `PORTAL_LINK_EMITIDO` | consultor gera o link | `autor_id`, `exp` | CPF, nome, o token |
| L2 | `PORTAL_LINK_REVOGADO` | revogação manual ou automática | `autor_id`, `motivo_codigo` | CPF |
| L3 | `PORTAL_LINK_ABERTO` | a página carrega com token válido | nenhum | o token |
| L4 | `PORTAL_LINK_RECUSADO` | expirado, revogado, assinatura inválida | `motivo_codigo` | o token |
| L5 | `PORTAL_IDENTIFICACAO_OK` | CPF e nascimento casaram | `tentativa_n` | CPF, data |
| L6 | `PORTAL_IDENTIFICACAO_FALHA` | não casaram | `motivo_codigo` **SEMPRE `NAO_CASOU`** | **o motivo real.** Separar "CPF inexistente" de "data errada" recria o oráculo A5 dentro do nosso banco |
| L7 | `PORTAL_IDENTIFICACAO_BLOQUEADA` | o limite do E6 estourou | `janela`, `ate` | CPF |
| L8 | `PORTAL_LINK_SUSPENSO` | terceiro estouro | `ate` | CPF |
| L9 | `PORTAL_SESSAO_EMITIDA` | token de sessão criado | `exp` | o token |
| L10 | `PORTAL_SESSAO_RECUSADA` | guard barrou | `motivo_codigo` | o token |
| **L21** | **`PORTAL_CREDENCIAL_EMITIDA`** | **NOVO.** O EA assinou uma credencial de escrita (G1) | `codigo_tipo_documento`, `bytes_max`, `tipo_permitido`, `exp` | **a credencial**, a URL assinada, o caminho completo do objeto |
| **L22** | **`PORTAL_CREDENCIAL_RECUSADA`** | **NOVO.** Pedido negado por quantidade (U2), ritmo (U3), identificação ausente ou tipo fora da régua | `motivo_codigo` | nada |
| **L23** | **`PORTAL_OBJETO_CONFIRMADO`** | **NOVO.** A confirmação do lado do servidor passou (G3) | `codigo_tipo_documento`, `bytes`, `formato` | nome original, URL |
| **L24** | **`PORTAL_OBJETO_NAO_CONFIRMADO`** | **NOVO.** Credencial expirou sem objeto, ou metadado divergiu | `motivo_codigo` | nada |
| L12 | `PORTAL_UPLOAD_RECUSADO` | arquivo barrado **pelo EA** (só em L-A e L-B) | `motivo_codigo`: `TAMANHO`, `FORMATO`, `HEIC`, `PROTEGIDO_SENHA`, `CONTEUDO_ATIVO`, `DIMENSAO`, `PAGINAS`, `TEMPO` | nome original, conteúdo |
| L13 | `PORTAL_ANTIVIRUS_DETECCAO` | **a varredura do bucket acusou.** Só existe se a fronteira F5 for combinada | `assinatura`, `bytes`, `acao` (`APAGADO`, `QUARENTENA`, `MARCADO`) | conteúdo, nome original |
| L14 | `PORTAL_ANTIVIRUS_INDISPONIVEL` | scanner fora do ar. Idem F5 | nenhum | nada |
| L15 | `PORTAL_EXTRACAO_IA` | a IA terminou de ler um documento | `codigo_tipo_documento`, `resultado`, `campos_extraidos_n` | **os valores extraídos** |
| L16 | `PORTAL_CAMPO_APLICADO` | campo sugerido confirmado por humano | `campo`, `autor_id`, `origem` | o valor (vai para a `candidato_alteracoes_log`) |
| L17 | `PORTAL_LIMITE_ATINGIDO` | o balde do link ou o da rota estourou | `regra`, `janela` | nada |
| L18 | `PORTAL_RECUPERACAO_SOLICITADA` | o candidato clicou em "Não Consigo Entrar" | nenhum | o que ele digitou |
| ~~L19~~ | ~~`PORTAL_STAGING_EXPURGADA`~~ | **SAI.** Não existe staging local no modelo novo | | |
| L20 | `PORTAL_ORIGEM_RECUSADA` | a barreira negou caminho fora da allowlist. **É do Fernando**, depende do coletor da F4 | caminho, método | corpo, query |

**Três cuidados que a Sala De Segurança herda, todos já aprovados pelo diretor:**
- **Sem busca por CPF digitado no painel.** Parte-se do candidato que o consultor já tem direito de
  ver, e chega-se ao log.
- **A tela é de Master e Super Admin**, com `RolesGuard`, e menu novo nasce só para o Super Admin (§A.23).
- **A geografia usa base offline**, sem consulta a serviço de terceiro com IP de candidato.

---

## 10. As Decisões, Consolidadas

| # | Decisão | O que ficou |
|---|---|---|
| 1 | **Arquitetura de rede** | **BARREIRA DO FERNANDO.** O EA nunca exposto direto na internet. Mantida |
| **1b** | **Arquitetura do ARQUIVO** | **NOVA, aprovada pelo diretor:** o arquivo vai do navegador do candidato **direto para a nuvem do Google**, e não é armazenado por nós. A IA lê **no upload** e auto-preenche |
| **1c** | **Por onde passa o byte** | **EM ABERTO, e é a pergunta da seção 1.** Recomendação da auditoria: **L-A, envio duplo**, com o teto de tamanho e o endurecimento do leitor declarados como nossos |
| 2 | **Prazo do link** | **72 horas** |
| 3 | **Uso único** | **NÃO.** Quebra o candidato real |
| 4 | **Revogação de link** | **SIM** (E10, E11). Continua furo aberto |
| 5 | **Limite de tentativas** | **5 por 15 minutos**, bloqueio progressivo e válvula de recuperação |
| 6 | **Busca por CPF digitado no painel de segurança** | **NÃO EXISTE** |
| 7 | **Antivírus** | **DO FERNANDO E DO GOOGLE**, e **mudou de momento**: varre depois de gravado. Exige a fronteira F5 |
| **7b** | **Guarda, retenção e teto do ARQUIVO** | **saem da fábrica**, com a ressalva do critério da seção 0 |
| 8 | **HEIC do iPhone** | **CONVERTER**, nas leituras L-A e L-B. Em L-C, é pergunta ao Fernando |
| 9 | **Arquivo do upload** | **não existe arquivo nosso.** Em L-A e L-B, existe **byte em memória**, nunca em disco |
| 10 | **Segredo do portal** | **PRÓPRIO** (`PORTAL_SESSION_SECRET`), separado do `JWT_ACCESS_SECRET` |
| 11 | **Captcha** | **NÃO AGORA** |
| 12 | **IP real** | **pelo cabeçalho do porteiro, no salto confiável** (F1) |
| 13 | **Geografia** | **base offline** |
| 14 | **Retenção do log de segurança** | **90 dias** com IP completo, **12 meses** truncado, **24 meses** o agregado, com sal mensal |
| 15 | **Começar a registrar já pelo VT** | **SIM**, com a ressalva §A.26: o VT é código validado, então isto volta como pergunta antes de tocar |
| 16 | **Quem enxerga a Sala De Segurança** | **Master e Super Admin** |
| 17 | **Pedido ao Fernando** | **o pacote de borda inteiro de uma vez**, mais os itens novos N1, N2, N3 e as fronteiras F5, F11, F12, F13 |

---

## 11. Resumo De Custo

**O que saiu:** antivírus nosso (2 dias, 1 contêiner, em torno de 1 GB de RAM), staging e expurgo do
portal (1 dia), memória versus disco (1 dia), e, **só na leitura L-C**, o tratamento de conteúdo
(U4, U5, U6, U7, U10, em torno de 4 dias).

**O que entrou:** a Camada G. G1 mais G2 (emissão restrita da credencial, com todas as travas e o teste
de enumeração) em torno de **2 dias**; G3 (confirmação do lado do servidor) em torno de **1 dia**; G5
(sugestão nunca final) **1 dia**; G6 (endurecimento do leitor, só em L-A e L-B) em torno de **2 dias**.

**Saldo, na recomendação L-A:** em torno de **11 a 13 dias de fábrica** para o obrigatório, número
próximo ao da versão 2. **O modelo novo não é mais barato de construir: ele é mais seguro em custódia
de arquivo e mais exigente em controle de acesso ao armazenamento.** Em L-C o saldo cai para em torno
de 8 dias, ao custo de a extração deixar de ser nossa.

**Os dois itens mais caros de recusar continuam sendo o V1** (balde global, 1 dia para fechar, e
aberto entrega a operação interna a qualquer um com um laço de repetição) **e o V10** (credencial
ampla, que é escrita aberta no nosso armazenamento entregue pela nossa própria rota).

**Ponto de parada (§A.39):** se a construção precisar de tipo novo em
`packages/shared-types/src/index.ts`, **quem escreve é o coordenador**. E há **outra fábrica neste
repositório**: outra sessão trabalha na ingestão do A&S (`apps/backend/src/as/**`,
`apps/backend/src/pandape/**`). O portal **não toca nada lá**; se encostar, é parada e decisão do
coordenador.
