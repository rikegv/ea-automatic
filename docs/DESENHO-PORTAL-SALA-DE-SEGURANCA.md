# Sala De Segurança: desenho FECHADO do painel de monitoramento do Portal Do Candidato

**Tipo:** DESENHO FECHADO. Nenhuma linha de código de produção escrita, nenhum arquivo do app tocado,
nada commitado. Este documento é o que a fábrica vai construir quando for despachada, não o que ela
construiu.
**Autor:** agente `arquiteto` (leitura, sem poder de escrita, §A.39).
**Versão:** fechamento de 18/09/2026, **ajustado no mesmo dia** pelo modelo novo do Fernando (o arquivo
não toca o nosso servidor, a IA lê no upload), aprovado pelo diretor.
**Menu:** Sala De Segurança, dentro do Menu Gerencial (`/admin`), rota `/admin/sala-seguranca`.
**Par desta frente:** `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md` (agente `seguranca`), que traz o
modelo de ameaça, o cardápio de proteções e o catálogo de eventos. Este documento desenha o
PAINEL que lê esses eventos, **e o catálogo que vale é o dele**, inclusive nos ajustes que o modelo novo
exigir: aqui se aponta para a lista, não se copia número dela (5.4).
**Resumo do diretor:** `docs/DESENHO-PORTAL-SEGURANCA.md`.

---

## 0. O QUE MUDOU NESTE FECHAMENTO

Cinco coisas. A primeira muda a arquitetura da borda, e a quinta muda o que continua sendo nosso.

1. **Decisão 1, APROVADA em 18/09/2026: app externo, na BARREIRA do Fernando.** O desenho é link
   externo, depois servidor de barreira, depois a nossa plataforma. O candidato acessa o link, a
   documentação chega na barreira, e só de lá é encaminhada ao EA. **O EA nunca fica exposto direto na
   internet.** Isso não é uma variação de infraestrutura: **metade dos eventos que o painel prometeu
   mostrar passa a nascer fora do EA**, e a seção 1 inteira trata disso.
2. **Decisão 7, APROVADA: o antivírus é do Fernando**, na camada da barreira. Sai do escopo da fábrica.
   O painel continua tendo de mostrar detecção de malware, então passa a **depender do resultado da
   varredura dele**, que vira item de fronteira (seção 6).
3. **Uma decisão do arquiteto foi REVERTIDA:** a antiga seção 1.6 propunha filtro por CPF digitado,
   hasheado no servidor, mais o selo "Candidato Conhecido". O `seguranca` vetou, o diretor aprovou o
   veto. A seção 3.6 deste documento é a reescrita: **sem campo de CPF digitável, sem selo de
   existência**, e o caminho é o inverso, parte-se do candidato que o consultor já tem direito de ver e
   chega-se ao log dele.
4. **As demais decisões foram APROVADAS EM BLOCO**, nas recomendações do `arquiteto` e do `seguranca`.
   Onde o texto antigo dizia "recomendação", este diz **APROVADO, decidido em 18/09/2026**. A lista
   completa está na seção 9.
5. **Decisão 15, APROVADA: o arquivo NÃO vai para o nosso servidor, e a IA lê NO UPLOAD.** Modelo
   proposto pelo Fernando e aprovado pelo diretor. O candidato envia pelo Portal e o arquivo vai
   **direto para o armazenamento na nuvem do Google, por API**, e fica lá. **O antivírus e a checagem do
   arquivo são do Fernando e do Google, não da fábrica.** A **IA lê na hora, dentro do fluxo do envio**,
   extrai os dados e auto-preenche para o candidato validar: ela **não vai buscar o arquivo depois** no
   Google. **O que a fábrica protege:** o link (individual, com prazo, revogável), a identidade (CPF e
   nascimento), as tentativas (limite, bloqueio, registro), **a Sala De Segurança** e os logs sem PII.
   Sobram dois furos de construção, o **rate limit** (agravado pela barreira) e o **link revogável**;
   teto de tamanho e antivírus saem para o Fernando e o Google. A seção **1.6** trata da terceira zona
   que isso cria, e a **1.7** trata do que fica dependente de uma resposta que **não é minha**.

---

## 1. A BARREIRA, E O QUE ELA FAZ COM O PAINEL

### 1.1 O desenho, em uma linha

```
candidato (internet)  ->  BARREIRA (Fernando)  ->  EA (loopback, dentro da VPN)
        |
        |  o ARQUIVO, com a credencial de escrita que o EA emitiu
        v
ARMAZENAMENTO (nuvem do Google)
```

A barreira é o único ponto que fala com a internet no caminho dos **dados**. Ela vê a conexão crua, o IP
de verdade, o caminho pedido, o método, o tamanho do corpo, e (decisão 7) o resultado do antivírus. O EA
vê o que a barreira deixou passar, e só isso.

**E, pela decisão 15, o ARQUIVO tem caminho próprio: ele não termina em nós, termina na nuvem do
Google.** Isso cria uma **terceira zona** (seção 1.6), com uma lista própria de coisas que o painel não
enxerga. O desenho acima é deliberadamente ambíguo em um ponto, **por onde os bytes passam até o
armazenamento**, porque essa resposta é do `seguranca` e do diretor, não minha: a seção 1.7 mostra que o
painel funciona nas três leituras possíveis, e marca o que muda em cada uma.

### 1.2 O problema honesto: o painel prometeu mais do que o EA enxerga

O diretor pediu duas respostas: **"estamos sofrendo ataque agora?"** e **"de onde vêm os IPs?"**. Com a
barreira no meio, boa parte das duas respostas vive do lado do Fernando:

| O que acontece | Quem vê | O EA vê? |
|---|---|---|
| robô varrendo `/admin`, `/wp-login.php`, `/.env` | barreira (nega na allowlist) | **não**, nunca vira requisição nossa |
| volume bruto por IP, inclusive o que foi negado | barreira | **não** |
| arquivo com vírus barrado antes de entrar | barreira (decisão 7) | **não** |
| conexão lenta, corpo acima do teto da borda, tempo limite estourado | barreira | **não** |
| país e cidade de quem bateu na porta e não entrou | barreira | **não** |
| link aberto, identificação certa ou errada, sessão, recusa por regra nossa | EA | **sim** |
| pedido e emissão da **credencial de escrita** no armazenamento | EA | **sim**, em qualquer leitura |
| os **bytes do arquivo** subindo para a nuvem | armazenamento, e a barreira se o envio passar por ela | **não** |
| o **objeto gravado**: existe, que tamanho tem, quando chegou | armazenamento | **só por consulta de metadado** (1.6), nunca lendo o arquivo |
| veredito de **antivírus do armazenamento** | Google e Fernando (decisão 15) | **não** |
| acesso ao objeto **depois** de gravado, e o expurgo dele | armazenamento | **não** |
| detecção de conteúdo ativo em PDF, arquivo protegido, tipo pelo conteúdo | quem tocar nos bytes | **depende do caminho dos bytes** (1.7) |
| **resultado** da extração da IA e campo aplicado | EA | **sim** nas leituras 1 e 2, **de fora** na leitura 3 (1.7) |
| expurgo da staging | EA | **sim**, quando houver staging. **Não Aplicável** se nenhum byte tocar o nosso disco |

**A pior saída possível é o painel parecer completo e não ser.** Um card "Bloqueios" que só conta o que
o EA barrou, numa tela chamada Sala De Segurança, faz o diretor concluir que não há varredura acontecendo
justamente quando a barreira está apanhando o dia inteiro.

### 1.3 As três formas de a metade de lá chegar ao painel

| Opção | Como funciona | Latência | O que exige do Fernando | O que exige da fábrica | Risco |
|---|---|---|---|---|---|
| **P. A barreira EMPURRA** | a barreira faz `POST` num endpoint de ingestão do EA, em lote, autenticado por token e aceito só vindo do salto dela | segundos | emitir o evento no formato combinado (linha de log estruturada ou chamada direta) | um endpoint de ingestão, idempotente, com guard fail-closed | novo endpoint de escrita, mitigado por ser o mesmo canal que já traz o tráfego do candidato |
| **Q. O EA PUXA** | a barreira expõe um arquivo ou um endpoint de leitura, e um job do EA busca de minuto em minuto | 1 minuto | manter um arquivo ou endpoint consultável, com janela e ponteiro | um job de coleta, um parser, controle de posição | depende de o formato do log dele não mudar em silêncio; parser de log quebra calado |
| **R. Só a metade de cá, DECLARADA na tela** | o painel mostra o que o EA vê, e diz na tela, em letra grande, que a metade da borda não é visível | zero | nada | nada | o painel fica cego para varredura, volume e vírus, mas **não mente** |

**APROVADO: P, com R como estado obrigatório de nascimento.** Não é escolha entre as duas, é ordem:

- **A Sala De Segurança nasce em R.** Enquanto a barreira não emitir nada, o painel funciona com o que o
  EA vê e **declara a lacuna na tela**, pelo indicador de cobertura da seção 3.0. Nenhum card da metade
  de lá nasce zerado fingindo calmaria: nasce com o rótulo **"Não Visível Ao Painel"**, em cinza.
- **P é o alvo**, e o contrato está na seção 5.3. A escolha por P e não por Q tem três razões: um formato
  só (o mesmo objeto de evento das duas origens, na mesma tabela, na mesma trilha), painel ao vivo, e
  **nenhuma exposição nova**, porque a conexão barreira para EA já existe para levar o tráfego do
  candidato. Q continua registrada como alternativa se o Fernando preferir não emitir nada ativo, e
  nesse caso o custo passa a ser um parser, que é a peça que quebra em silêncio.
- **A escolha entre P e Q é do Fernando**, e é o item de fronteira 6.1. A fábrica constrói o lado de cá
  dos dois jeitos com o mesmo modelo de dados, porque a diferença é só quem inicia a conversa.

### 1.4 O IP de origem, agora, vem da barreira

O achado original desta frente continua valendo, e a barreira o torna mais agudo, não menos. Está medido
e escrito no próprio código, em `apps/backend/src/vt/vt.service.ts` (comentário da constante
`CPF_LIMITE`):

> o backend NÃO tem como saber o IP do candidato. O browser fala com o Next, que repassa por
> http-proxy SEM `xfwd`, então o backend vê sempre `127.0.0.1` no socket e o único `x-forwarded-for`
> que chega é o que o CLIENTE mandar (verificado empiricamente: cliente normal chega com XFF nulo;
> cliente que forja o header chega com o valor forjado intacto).

**APROVADO, decidido em 18/09/2026:** o IP real chega por **cabeçalho escrito pelo porteiro**, que agora
é a barreira, e **aceito só no salto confiável**. A barreira **sobrescreve** (nunca acrescenta) o
cabeçalho combinado; o EA aceita esse cabeçalho **somente** quando o salto anterior é o endereço
conhecido da barreira. Fora disso o IP é gravado como nulo e o evento é classificado como **Origem Não
Confiável**. O nome exato do cabeçalho é o item de fronteira 6.2.

**Pré-requisito nominal do Fernando.** Sem esse cabeçalho, as seções 3.3, 3.5 e metade da 3.7 não
existem de verdade. Não é item paralelo, é dependência.

### 1.5 O estado "Painel Cego", e o caso novo que a barreira cria

O painel sabe dizer quando está cego, e isso é funcionalidade, não ressalva de rodapé.

**Caso 1, o antigo: IP ausente.** Mais de 5% dos eventos da janela sem IP confiável (nulo ou loopback).

**Caso 2, o NOVO e o mais perigoso: tudo chegando com o IP da barreira.** Se o cabeçalho de IP real não
estiver configurado, ou parar de ser escrito, **todo o tráfego do mundo chega ao EA com um endereço só,
o da barreira**. Isso é, linha por linha, indistinguível de um enxame vindo de um IP único, que é
exatamente o padrão que a regra 3.7.3 existe para acusar. Um painel ingênuo acenderia **Sob Ataque** e
apontaria para a própria defesa.

As três travas, e elas são de código, não de disciplina:

1. **Registro de origens confiáveis.** Os endereços da barreira ficam num registro de configuração
   (`PORTAL_ORIGENS_CONFIAVEIS`), classificados como **Rede Da Barreira**. Um endereço desse registro
   **nunca** é alvo de padrão detectado, nunca entra no Ranking De IPs como visitante e nunca conta como
   IP único. Vale um teste do `tester`: "o IP da barreira não dispara nenhum dos oito padrões".
2. **Detecção da concentração suspeita.** Se mais de 5% dos eventos da janela vierem com IP igual ao de
   uma origem confiável e **sem** o cabeçalho de IP real, o painel entra em **Painel Cego**, com o motivo
   escrito: "o tráfego está chegando com o endereço da barreira, o cabeçalho de IP real não está sendo
   escrito". Não é alarme de ataque, é alarme de configuração, e o texto diz isso.
3. **Em Painel Cego, os critérios que dependem de IP ficam DESLIGADOS**, e a faixa diz quais. Continuam
   valendo os critérios que não dependem de IP: falhas contra a linha de base, regras por link e por
   candidato, uploads recusados, vírus. A faixa mostra, em letra menor: "avaliando só o que não depende
   de IP". Um painel que avalia metade e avisa que é metade vale mais que um painel que chuta a outra
   metade.

### 1.6 A terceira zona: o ARMAZENAMENTO, e o que ele leva embora do painel

O painel nasceu com duas zonas, **nós** e **a barreira**. Com a decisão 15 ele tem **três**, e a terceira
é a que guarda o arquivo.

| Zona | O que ela sabe | Como o painel sabe |
|---|---|---|
| **Plataforma** | o link, a identidade, a tentativa, a credencial de escrita emitida, a decisão da IA | direto, registrando |
| **Barreira** | a conexão crua, o IP real, o caminho negado, o volume bruto | pela ingestão da seção 5.3 |
| **Armazenamento** | o objeto: se chegou, que tamanho tem, quando, se foi varrido, quem o leu depois | **não vem sozinho**, seção 5.3.1 |

**O evento de upload MUDOU DE SIGNIFICADO, e isso é o ajuste mais importante desta revisão.** Antes,
"upload" queria dizer **arquivo recebido por nós**, e era um fato que nós mesmos presenciávamos. Agora
quer dizer **arquivo enviado ao armazenamento**, que é outro dado e tem três momentos distintos, cada um
podendo falhar sozinho:

1. **nós autorizamos** (a credencial de escrita foi emitida para aquele link e aquele documento);
2. **o arquivo chegou** (o objeto existe na nuvem, com tamanho e momento);
3. **o arquivo não chegou** (o envio falhou, ou a confirmação nunca veio dentro do prazo).

Um painel que continuasse com um evento só contaria o passo 1 e chamaria de upload, e então **credencial
emitida e arquivo nunca enviado apareceria como documento recebido**. Isso não é imprecisão de número, é
o painel afirmando que o candidato entregou o documento quando ele não entregou. Por isso os três
momentos são eventos separados (seção 5.4).

**A confirmação NÃO pode vir só da palavra do navegador.** No modelo de ameaça desta frente, o navegador
é justamente o lado não confiável: quem envia pode dizer "enviei" sem ter enviado, e o painel passaria a
ser preenchido pelo atacante. A confirmação boa é **consulta de metadado do objeto** (existe, tamanho,
momento, e o identificador do objeto), que é uma leitura **de metadado, não do arquivo**, e por isso
**não fere** a regra de o arquivo não tocar o nosso servidor. Qual das duas vale, e se o armazenamento
consegue nos notificar sozinho, é o item de fronteira 6.10.

**O que a terceira zona leva embora, e o painel tem de declarar em vez de fingir verde:**

- o **veredito de antivírus** (agora é do Google e do Fernando, não mais só da barreira);
- o **tamanho real** do que subiu, quando nenhum byte passa por nós (vem do metadado, se houver consulta);
- o **conteúdo** do arquivo: tipo pelo conteúdo, PDF com conteúdo ativo, arquivo protegido por senha;
- o **acesso posterior** ao objeto e o **expurgo** dele, que são LGPD e ficam fora da nossa medição
  (fronteira 6.12).

**O que a terceira zona ENTREGA de novo, e não existia quando o arquivo vinha para nós:** a credencial de
escrita passa a ser um **objeto de valor por si só**. Ela autoriza escrever no nosso armazenamento, tem
prazo, tem teto e é emitida por nós, a pedido de quem está do outro lado do link. Isso é medível de
verdade (postura 8.3 e 8.12) e cria um padrão de abuso novo (3.7.10) que o desenho anterior não tinha
como ter.

### 1.7 O que depende de POR ONDE OS BYTES PASSAM, e o painel não espera essa resposta

Há uma tensão conhecida entre "o arquivo não toca o nosso servidor" e "a IA lê na hora, no fluxo do
envio". **Essa decisão é do `seguranca` e do diretor, e não é tomada neste documento.** O que é meu é
garantir que **o painel não dependa dela para existir**. As três leituras possíveis:

- **Leitura 1, o navegador manda uma cópia ao nosso serviço de IA.** O arquivo vai ao armazenamento e um
  fluxo paralelo chega ao nosso `ai-service`.
- **Leitura 2, o nosso serviço lê do armazenamento no mesmo ciclo.** Os bytes não vêm do navegador, mas
  passam por nós por um instante, dentro do fluxo do envio.
- **Leitura 3, a extração acontece toda dentro do Google.** Nenhum byte é nosso em momento nenhum.

**Os eventos e os cards são os mesmos nas três.** O que muda é quantos deles saem de verde ou vermelho
para **cinza**. E o cinza aqui **não é resultado novo**: é o **"Não Medido Por Nós"** que a seção 3.8 já
tem, aplicado a um número que aquela leitura não produz.

| O que o painel quer medir | Leitura 1 | Leitura 2 | Leitura 3 |
|---|---|---|---|
| credencial de escrita emitida, prazo, teto, ritmo | **nosso** | **nosso** | **nosso** |
| recusa da nossa regra (link inválido, limite, ritmo, quantidade) | **nosso** | **nosso** | **nosso** |
| confirmação de chegada e tamanho do objeto | nosso, medido nos bytes | nosso, medido nos bytes | **metadado**, e "Não Medido Por Nós" sem a consulta da 5.3.1 |
| tipo pelo conteúdo, PDF com conteúdo ativo, arquivo protegido | **nosso** | **nosso** | **Não Medido Por Nós** |
| resultado da extração da IA, duração e confiança | **nosso** | **nosso** | **de fora**, e só se o Google nos contar (fronteira 6.11) |
| staging efêmera dentro do TTL de 48h (§A.6) | checagem viva | checagem de "nada sobreviveu ao ciclo" | **Não Aplicável** |
| antivírus | do Fernando e do Google nas três | idem | idem |

**A regra de projeto, em uma linha:** todo card, evento e padrão desenhado daqui para frente tem uma
definição que **sobrevive nas três leituras**, e onde o número só existe em uma delas, este documento diz
**qual** e o painel mostra **"Não Medido Por Nós"** nas outras, com o motivo escrito. O que o painel nunca
faz é escrever zero no lugar de "não sei".

**Consequência de construção, e ela é pequena de propósito:** a única coisa que a resposta muda no lado de
cá é **quantas checagens de postura nascem cinza** e se a checagem de staging existe ou é "Não Aplicável".
Nenhuma tabela, nenhum endpoint e nenhuma tela mudam de forma. É por isso que o painel pode ser construído
antes de a resposta vir.

---

## 2. A TABELA DE SOBREVIVÊNCIA: as 9 seções, uma a uma

O que é construível só com dado do EA, o que exige o dado da barreira, e o que muda de critério. Esta é
a tabela que responde "o que a barreira fez com o meu painel".

| # | Seção | Estado no fechamento | Depende do Fernando? | O que mudou |
|---|---|---|---|---|
| 3.0 | **Cobertura Do Painel** | **NOVA** | sim, para deixar de acusar lacuna | não existia. Nasce por causa da barreira, e agora tem **três** origens: ganha o **Armazenamento** (decisão 15) |
| 3.1 | **Faixa De Estado** | sobrevive, com critério ajustado | parcial | ganha o caso 2 de Painel Cego (1.5) e perde o critério de volume bruto por IP enquanto a barreira não reportar |
| 3.2 | **Cartões Do Período** | sobrevive, com a lista mexida | parcial | **cortado** o card "CPF Não Encontrado" (veto do `seguranca`), **acrescentado** "Detecções De Vírus" (decisão 7). Pela decisão 15, o card 5 **muda de significado** (passa a contar arquivo confirmado no armazenamento, não recebido por nós) e o card 6 passa a contar **só as nossas recusas** |
| 3.3 | **Origem Dos Acessos** | sobrevive | **sim, dependência dura** | sem o cabeçalho de IP real não há geografia nenhuma. A base offline é nossa e não depende dele |
| 3.4 | **Linha Do Tempo De Tentativas** | sobrevive intacta | não | ganha, quando a barreira reportar, uma terceira série: o que foi barrado antes de chegar |
| 3.5 | **Ranking De IPs** | sobrevive | **sim, dependência dura** | sem IP real vira uma linha só, a da barreira. Em Painel Cego a seção mostra o vazio explicado, não uma tabela mentirosa |
| 3.6 | **Tentativas Por Link E Por Candidato** | **reescrita** | não | era "Ranking De CPF Tentado" com busca por CPF digitado. O veto reverteu: agrupa por link e por candidato, sem campo de CPF, sem selo de existência |
| 3.7 | **Padrões Detectados** | sobrevive, com 3 regras mexidas | parcial | **cortada** a 6.2 "Varredura De CPF", **acrescentada** a "Varredura De Links", o vírus vem de fora, a 3.7.4 **troca de critério** (mede credencial e confirmação, não bytes) e **nasce** a 3.7.10, "Credencial De Escrita Em Volume Anormal" |
| 3.8 | **Postura De Segurança** | sobrevive, com estado novo | **sim, em 3 das 13 checagens** | nasce o resultado **"Não Medido Por Nós"**, cinza, que nunca conta como verde. Pela decisão 15 **saem** o antivírus e o teto de tamanho como medição nossa, e **entram** as duas checagens da credencial de escrita (8.3 e 8.12) e a 8.13 |
| 3.9 | **Trilha Completa** | sobrevive | não | ganha a coluna **Origem** (Plataforma, Barreira, **Armazenamento**), que nasce com filtro e ordenação (§A.37) |

**O que foi CORTADO neste fechamento**, com o motivo, e sem substituto disfarçado (§A.31):

1. **O card "CPF Não Encontrado".** O `seguranca` determinou que o motivo da falha de identificação é
   **sempre** `NAO_CASOU`, **nem dentro do nosso próprio banco** (evento L6). Um card que conta "CPF não
   encontrado" exige que o motivo real esteja gravado, e gravá-lo recria o oráculo da base de candidatos
   dentro de casa. O card não pode existir, e os cards vão de dez para nove.
2. **A regra 6.2, "Varredura De CPF".** Ela media "o mesmo IP tenta 15 CPFs distintos em 10 minutos".
   Com a proteção E3 do `seguranca` (o CPF digitado tem de casar com o CPF do link), **ninguém consegue
   tentar CPFs distintos**: o link fixa um candidato só. A regra mediria para sempre zero. No lugar
   entra a **Varredura De Links** (3.7), que é o ataque que sobrou de verdade.
3. **O filtro por CPF digitado e o selo "Candidato Conhecido"** (antiga 1.6). Vetado, ver 3.6.
4. **A checagem 8.4 "Antivírus Presente" como medição nossa.** Ela virava um probe no nosso scanner, e
   nós não temos mais scanner (decisão 7, agravada pela 15: o scanner é do Fernando e do Google). Vira
   "Antivírus Do Armazenamento Reportando", que é outra coisa: é a medição de que estão nos contando,
   não de que a varredura existe.
5. **A checagem 8.3 "Teto De Upload Aplicado" como medição nossa.** Com o arquivo indo direto para a
   nuvem, **não há interceptor nosso para sondar**: o teto de corpo é da borda e o teto do objeto é do
   armazenamento. O que sobra medível é o teto que **nós embutimos na credencial que emitimos**, e é isso
   que a nova 8.3 mede. Não é a mesma checagem com outro nome: a antiga media o nosso limite de
   recepção, a nova mede o poder que a nossa credencial concede.
6. **O card "Uploads" no sentido de "documentos recebidos por nós".** Não é corte de card, é corte de
   **significado**, e está separado aqui porque é o tipo de mudança que passa despercebida: o card
   continua na tela, com o mesmo lugar, medindo outra coisa (1.6). O rótulo muda junto, para ninguém ler
   o número velho no card novo.
7. **A contagem de MB no rodapé do card de arquivos, na leitura 3.** Sem bytes nossos e sem consulta de
   metadado, o total em MB não existe, e escrever zero ali seria mentira. Vira "Não Medido Por Nós" (1.7).

---

## 3. A ESTRUTURA DO PAINEL, seção por seção

A tela é uma página só, com rolagem, na ordem abaixo. Todo nome de seção, card e aba já vem em title
case (§A.24) e sem travessão (§A.11).

### 3.0 Cobertura Do Painel (seção NOVA, e agora com TRÊS zonas)

**Responde:** o que esta tela está enxergando, e o que ela não está.
**Visualização:** tira fina logo abaixo da faixa de estado, com um selo por origem. Cada selo tem o nome
da origem, a última notícia recebida dela, e a cor: verde reportando, amarelo atrasado, cinza silenciosa.
**Granularidade:** ao vivo, na mesma atualização de 60 segundos da faixa.
**Custo:** baixo. É uma consulta de "maior `ocorrido_em` por origem".

| Origem | O que ela traz | Quando está cinza |
|---|---|---|
| **Plataforma** | os eventos que o EA registra: link, identidade, sessão, credencial de escrita emitida, extração da IA | o portal ainda não existe, ou o registrador parou |
| **Barreira** | caminho negado, volume bruto por IP, corpo acima do teto, tempo limite | a barreira ainda não emite, que é o estado de nascimento |
| **Armazenamento** (nova, decisão 15) | a **confirmação** de que o objeto chegou, com tamanho e momento, a **falha de envio**, e o **veredito de antivírus** quando repassado | a consulta de metadado ainda não existe, ou o veredito não é repassado (fronteiras 6.10 e 6.11) |
| **Geografia** | país e cidade por base offline | a base ainda não foi carregada |

**A origem do vírus mudou de dono e a tela tem de dizer qual.** No fechamento anterior a detecção vinha
da barreira; pela decisão 15 ela pode vir da barreira, do armazenamento, ou de nenhum dos dois. O selo
mostra **quem reportou por último**, e não uma promessa genérica de que alguém varre.

**A regra de honestidade, e ela vale para a tela inteira:** toda seção que dependa de uma origem cinza
mostra, no lugar dos números, a frase **"Não Visível Ao Painel"** e o motivo em uma linha. Nunca zero,
nunca verde, nunca um gráfico vazio que se confunde com calmaria. Zero e "não sei" são coisas
diferentes, e o painel nunca escreve uma pela outra.

### 3.1 Faixa De Estado: "Estamos Sob Ataque Agora?"

**Responde:** o portal está sob ataque neste momento, sim ou não, e por quê.
**Visualização:** faixa larga no topo, cor cheia, uma palavra grande e uma frase de motivo com números.
Nunca um ícone sozinho.
**Granularidade:** janela deslizante de 15 minutos, recalculada a cada carga da tela e a cada 60 segundos.
**Custo:** baixo, se os agregados da seção 4 existirem. É uma consulta de contagem.

| Estado | Rótulo | Critério (qualquer um basta) | Origem do dado |
|---|---|---|---|
| Cinza | **Painel Cego** | mais de 5% dos eventos da janela sem IP confiável; OU a concentração no endereço da barreira descrita em 1.5 | Plataforma |
| Verde | **Operação Normal** | nenhum critério abaixo atingido, **e** nenhuma origem essencial cinza | Plataforma |
| Amarelo | **Atenção** | falhas de identificação nos últimos 15 min maiores ou iguais a **3x a linha de base** daquela faixa horária, com piso de **15**; OU um único IP com **20** falhas em 15 min; OU taxa de falha acima de **40%** com no mínimo 30 tentativas | Plataforma, o critério por IP exige a barreira |
| Vermelho | **Sob Ataque** | falhas maiores ou iguais a **10x a linha de base**, com piso de **50** em 15 min; OU **3 IPs distintos** com 20 falhas cada em 15 min; OU qualquer **Varredura De Links** ativa (regra 3.7.2); OU **500 requisições** de um mesmo IP em 5 min; OU **qualquer detecção de vírus** na janela | misto: o volume por IP vem da barreira, a detecção de vírus vem da barreira **ou do armazenamento** (decisão 15) |

**A detecção de vírus acende vermelho sozinha, e isso é deliberado.** Um único arquivo com praga não é
estatística, é evento. O `seguranca` classificou o cenário A6 com dano alto, e o diretor tirou o
antivírus do nosso escopo mas manteve a detecção no painel: a resposta certa a "apareceu malware" é a
faixa mudar de cor, não uma linha no fim de uma tabela. **Com a decisão 15 o critério não muda, muda de
quem ele depende:** enquanto nem a barreira nem o armazenamento reportarem varredura, este critério não
está desligado por opção, está **cego**, e a faixa diz isso com todas as letras em vez de ficar verde.

**A linha de base** é a mediana de falhas daquela mesma faixa de hora nos últimos 14 dias, recalculada
uma vez por dia. Nos primeiros 14 dias só os pisos absolutos valem, e a faixa diz isso em letra pequena
("linha de base ainda em formação, 6 de 14 dias"). Fingir uma base que não existe é como um painel novo
dá alarme falso na primeira semana.

**Em Painel Cego, os critérios marcados como dependentes de IP ficam desligados** e a faixa lista quais
(regra 3 da seção 1.5).

**Os números acima foram propostos pelo `arquiteto` e o `seguranca` os confere contra as regras de
defesa**, para painel e bloqueio não se contradizerem: o painel não pode acender vermelho depois de o
bloqueio já ter contido, nem deixar de acender porque o bloqueio corta antes do piso. Dois pontos de
casamento já conhecidos: o limite por CPF do portal passa a ser **5 tentativas por 15 min** (item E6 do
`seguranca`, e não os 10 do VT), então a regra 3.7.1 casa com 5, não com 10; e o limite por IP na borda
(item A-1, 60 requisições por minuto) precisa ser menor que o piso de 500 em 5 min da faixa vermelha,
senão a barreira corta antes de o painel ver.

### 3.2 Cartões Do Período

**Responde:** o tamanho do que aconteceu na janela escolhida.
**Visualização:** grade de cards com número grande, rótulo em title case e variação contra o período
anterior de mesmo tamanho (seta e percentual).
**Granularidade:** a janela do seletor do topo (Última Hora, Hoje, 7 Dias, 30 Dias, Personalizado).
**Custo:** baixo sobre agregado, alto se for consulta ao vivo na trilha bruta. Ver 4.5.

Dez cards, **todos clicáveis como filtro** em toggle (§A.12), afetando as seções 3.3 a 3.9:

| # | Card | O que conta | Origem |
|---|---|---|---|
| 1 | **Acessos** | aberturas da página do portal com link válido | Plataforma |
| 2 | **Identificações OK** | candidato identificado com sucesso | Plataforma |
| 3 | **Falhas De Identificação** | tentativa recusada, motivo sempre `NAO_CASOU` | Plataforma |
| 4 | **Bloqueios** | limite estourado, link suspenso, sessão recusada | Plataforma |
| 5 | **Arquivos Enviados** | arquivos **confirmados no armazenamento**, não recebidos por nós (1.6). Rodapé com o total em MB, **"Não Medido Por Nós" na leitura 3 sem consulta de metadado** (1.7) | Plataforma mais **Armazenamento** |
| 6 | **Envios Recusados** | recusas da **nossa** regra antes de autorizar: link inválido, limite, ritmo, quantidade acima da régua. Tipo pelo conteúdo, arquivo protegido e conteúdo ativo só entram nas leituras 1 e 2 (1.7) | Plataforma |
| 7 | **Links Recusados** | token expirado, revogado, assinatura inválida, malformado | Plataforma |
| 8 | **Detecções De Vírus** | arquivos barrados pelo antivírus **da barreira ou do armazenamento** (decisão 15) | **Barreira** ou **Armazenamento** |
| 9 | **IPs Únicos** | distintos na janela, fora as origens confiáveis | **Barreira** (o IP real) |
| 10 | **Países** | distintos na janela, com o principal citado no rodapé | **Barreira** mais base de geografia |

Dez cards quebram em duas fileiras de cinco, e nenhuma fica espremida (§A.20). **Os cards de origem
cinza mostram "Não Visível Ao Painel", nunca zero** (regra da 3.0).

**O card 5 mudou de significado, e o rótulo mudou junto.** "Uploads" virou **Arquivos Enviados** de
propósito: o número passou a medir confirmação no armazenamento, e manter o rótulo antigo faria o
operador ler o número velho no card novo (1.6). É a mesma casa na grade, com outro conteúdo.

**Propostas, não construídas, uma palavra do diretor resolve cada uma (§A.31).** O diretor aprovou **dez**
cards, então nenhuma destas entra sem aval, e elas são três, não uma lista:

| Proposta | O que contaria | Por que pode valer |
|---|---|---|
| **Caminhos Fora Da Allowlist** | o evento de origem recusada, da barreira | termômetro direto de robô varrendo o subdomínio (proposta que já vinha do fechamento anterior) |
| **Credenciais De Escrita Emitidas** | quantas autorizações de escrita foram concedidas na janela, com "quantas nunca viraram arquivo" no rodapé | é o número que o modelo novo criou: autorização concedida é poder concedido, e concedê-lo em volume é o abuso novo (3.7.10) |
| **Falhas De Envio Ao Armazenamento** | envios autorizados que falharam ou nunca confirmaram dentro do prazo | separa "o candidato não mandou" de "o candidato mandou e quebrou", que hoje seriam o mesmo silêncio |

**Se o diretor quiser manter exatamente dez cards**, a recomendação é a mais barata: nenhuma card nova, e
as duas últimas viram **números de rodapé do card 5**, que é onde elas já fazem sentido. Fica dito para a
escolha ser dele, não da fábrica.

### 3.3 Origem Dos Acessos

**Responde:** de onde vêm os IPs, geograficamente.
**Visualização:** duas peças lado a lado. À esquerda, **barras horizontais por país**, ordenadas por
volume, com a barra colorida em duas partes (sucesso e falha) para o país de risco saltar aos olhos sem
precisar de mapa. À direita, **tabela Cidade E Região**, no padrão §A.12, ordenável e filtrável.
**Granularidade:** a janela do seletor.
**Custo:** médio, e o custo está na resolução do IP para país, não no desenho.
**Dependência dura do Fernando:** sem o cabeçalho de IP real (1.4), esta seção inteira mostra
"Não Visível Ao Painel". Ela não degrada, ela desaparece com a explicação.

**APROVADO, decidido em 18/09/2026: base de geografia offline gratuita, nenhum IP sai da rede.** Uma
tabela no Postgres com faixas de IP, carregada de um CSV mensal de licença aberta com atribuição, e
consulta local por intervalo. Nenhuma credencial nova, nenhuma dependência externa em tempo de
requisição, nenhum IP de candidato entregue a operador não contratado (§A.6). A API externa de terceiro
está recusada, e a base com cadastro (que exigiria chave de licença do diretor) fica como evolução caso
ele queira cidade com mais precisão.

A classificação de rede vem junto e é de graça: faixas privadas (`10/8`, `172.16/12`, `192.168/16`),
loopback e a faixa da ZeroTier viram **Rede Interna**, e os endereços do registro de origens confiáveis
viram **Rede Da Barreira**. O painel nunca conta acesso interno nem a própria barreira como tentativa
externa. Foi exatamente essa confusão que o caso do webpanda registrou, quando o NAT fez o PHP do box do
Fernando aparecer como `192.168.1.174`.

Todo IP que a base não resolve aparece como **"não informado"** (§A.11), nunca chutado.

**Mapa mundi:** fora da primeira versão (decisão aprovada). A barra ordenada responde a mesma pergunta em
menos pixel e sem dependência nova.

### 3.4 Linha Do Tempo De Tentativas

**Responde:** quando aconteceu, e o que é normal.
**Visualização:** série temporal com duas linhas, Sucesso e Falha, mais uma **linha tracejada de base**
(a mediana histórica daquela faixa de hora) e um **marcador no pico** da janela, com hora e número
escritos. Quando a barreira estiver reportando, entra uma **terceira linha, Barrado Na Borda**, em traço
distinto, que é o volume que nunca chegou a nós.
**Granularidade:** automática pela janela. Última Hora: por minuto. Hoje e 7 Dias: por hora. 30 Dias e
acima: por dia.
**Custo:** baixo sobre a tabela de agregado por hora. O grão por minuto sai da trilha bruta, e por isso
só é oferecido na janela de uma hora, onde o volume é pequeno.

A linha de base é o que transforma o gráfico de decorativo em analítico: sem ela, um pico de 80
tentativas não diz nada; com ela, diz "80 contra uma base de 6".

### 3.5 Ranking De IPs

**Responde:** quais IPs acessam, e quem está insistindo.
**Visualização:** tabela no padrão §A.12, colunas: IP, País, Cidade, Rede, Primeira Vez, Última Vez,
Tentativas, Falhas, Taxa De Falha, Links Distintos Tentados, Uploads, Padrão Detectado, Ações.
**Granularidade:** a janela do seletor, com "Primeira Vez" olhando o histórico inteiro, que é o que
distingue visitante conhecido de IP que nasceu hoje.
**Custo:** baixo sobre o agregado por hora e IP.
**Dependência dura do Fernando:** sem IP real, a tabela teria uma linha só, a da barreira, o que é pior
que nada. Em Painel Cego a seção mostra o vazio explicado.

**A coluna "CPFs Distintos Tentados" foi trocada por "Links Distintos Tentados".** Com a proteção E3, o
CPF por link é fixo, então contar CPFs distintos por IP mediria zero para sempre; o que mede o
varredor de verdade é quantos links diferentes ele tocou.

**O que a linha abre:** clicar no IP abre o modal **Ficha Do IP** (não fecha ao clicar fora, §A.41, e
nasce com botão "Fechar", porque é modal de leitura) com: a série temporal daquele IP, os links que ele
tocou, as famílias de user-agent que usou, os eventos dele na janela e os padrões que disparou. É esse
modal que responde "esse IP está fazendo o quê", que é a pergunta que o ranking cria.

### 3.6 Tentativas Por Link E Por Candidato (seção REESCRITA pelo veto)

**Responde:** contra quem estão tentando, e quantas vezes.
**Visualização:** tabela no padrão §A.12, colunas: Candidato (nome curto, para quem já tem direito de
ver), Link (identificador curto do `jti`), Tentativas, Falhas, IPs Distintos, Primeira Vez, Última Vez,
Padrão Detectado, Ações.
**Granularidade:** a janela do seletor.
**Custo:** baixo.

**O que foi REVERTIDO, e por quê.** A versão anterior propunha um campo onde o operador digitava um CPF,
o servidor hasheava e devolvia o histórico, mais um selo "Candidato Conhecido" quando o CPF existia na
base. O `seguranca` vetou e o diretor aprovou o veto, com a razão certa: **um painel que responde
diferente para CPF que existe e CPF que não existe é o oráculo da base de candidatos**, fechado na rua
com 57 proteções e aberto por dentro com um campo de busca. Fechar na rua e abrir por dentro não fecha.

**O desenho que vale:**

- **Não existe campo de CPF digitável nesta tela.** Em lugar nenhum: nem filtro, nem busca, nem
  parâmetro de endpoint.
- **Não existe selo de existência.** Nada na tela distingue "CPF que está na base" de "CPF que não está",
  porque a tela nunca recebe um CPF para julgar.
- **O caminho é o INVERSO:** parte-se do candidato, que o consultor já tem direito de ver, e chega-se ao
  log dele. Na prática, dois caminhos, os dois partindo de quem já é visível:
  1. desta tela, a linha já é o candidato (ele veio do link, e o link é nosso, emitido por nós);
  2. da ficha do candidato, um botão **"Registro De Acesso"** que abre o log daquele candidato, usando a
     permissão que a ficha já exige. Quem não pode ver o candidato não chega ao log dele.
- **O agrupamento é por `jti` do link e por `candidato_hash`**, que vem do TOKEN, nunca do que foi
  digitado. **O CPF digitado pelo candidato não é gravado, nem hasheado, nem contado.** Ele é comparado
  em memória contra o CPF do link (proteção E3) e descartado. Isso é mais forte que a versão anterior:
  não é que o CPF esteja protegido na tabela, é que ele não entra na tabela.
- **A máscara é derivada NA EXIBIÇÃO**, a partir do candidato, nunca guardada no log (regra do
  `seguranca`). A tabela de eventos não tem coluna de CPF mascarado, e por isso a retenção não precisa
  apagar campo nenhum de PII: não há nenhum.
- **Nenhum nome de pessoa aparece em uma tela de IP.** O nome aparece na linha do candidato, que é
  informação que o Master já vê no Gerenciador, e nunca na Ficha Do IP, que continuaria sendo um
  diretório de pessoas por outro caminho.

### 3.7 Padrões Detectados

**Responde:** estamos sofrendo que tipo de abuso.
**Visualização:** lista de alertas, cada um um bloco com nome do padrão em title case, gravidade
(Crítico, Alto, Médio), a regra em português com o número que a disparou, o alvo (IP, link ou candidato),
a janela, e um botão que abre a trilha já filtrada naquele recorte.
**Granularidade:** janelas deslizantes próprias de cada regra, recalculado a cada minuto por um job,
nunca na hora de carregar a tela.
**Custo:** médio. É a parte com mais lógica do painel, e é a que mais vale.

| # | Padrão | Regra que dispara | Gravidade | Origem |
|---|---|---|---|---|
| 3.7.1 | **Força Bruta Por Link** | o mesmo `jti` acumula **5 falhas em 15 min** (casa com o limite E6 do portal) | Alto | Plataforma |
| 3.7.2 | **Varredura De Links** | o mesmo IP toca **10 links distintos em 10 min**, OU acumula **15 recusas de link em 10 min** | Crítico | Barreira (o IP) mais Plataforma |
| 3.7.3 | **Enxame De IPs** | **10 IPs distintos** contra o mesmo link em 30 min, OU **25 IPs nunca vistos** com falha em 10 min. **Origens confiáveis excluídas por construção** (1.5) | Crítico | Barreira |
| 3.7.4 | **Envio Em Massa** (critério NOVO) | o mesmo link acima de **25 arquivos confirmados**, ou o mesmo IP acima de **100 confirmações em 1h**. **O corte por MB sai do critério primário**, porque o volume em bytes deixou de ser nosso: ele entra como número secundário quando houver metadado (1.7) | Alto | Plataforma mais Armazenamento |
| 3.7.5 | **Horário Anômalo** | volume entre 00h e 05h maior ou igual a **3x a mediana** daquela faixa, com piso de 20 eventos | Médio | Plataforma |
| 3.7.6 | **Robô Por User-Agent** | família de user-agent de robô, ou vazia, ou a mesma família em **20 IPs distintos** na mesma hora | Médio | Barreira vê mais, Plataforma vê o que passou |
| 3.7.7 | **Link Expirado Reusado** | **5 recusas por token fora de validade** do mesmo IP em 1h (sinal de link vazado ou varredura de links) | Alto | Plataforma |
| 3.7.8 | **Origem Improvável** | identificação com sucesso a partir de país fora do Brasil | Médio, informativo | Barreira mais geografia |
| 3.7.9 | **Detecção De Vírus** | **qualquer** ocorrência de detecção na janela. Uma só basta | Crítico | **Barreira** ou **Armazenamento** |
| 3.7.10 | **Credencial De Escrita Em Volume Anormal** (padrão NOVO) | o mesmo link pede acima de **3x o número de documentos que a régua dele exige** em 1h, OU **10 credenciais em 10 min**, OU acumula **10 credenciais emitidas e nunca confirmadas** em 1h. O mesmo IP acima de **60 credenciais em 1h** conta como alvo separado | Alto | Plataforma (o IP exige a barreira) |

**A antiga 6.2 "Varredura De CPF" foi CORTADA** (ver seção 2): com o CPF do link fixo, ninguém tenta CPFs
distintos, e a regra mediria zero para sempre. A 3.7.2 é o ataque que sobrou, e ele é real: o varredor
que colhe links vazados em grupo de WhatsApp.

**Por que a 3.7.10 nasce, e por que ela não existia antes.** Quando o arquivo vinha para nós, pedir
demais era o mesmo que enviar demais, e a 3.7.4 cobria os dois. No modelo novo os dois se separam: pedir
uma credencial é barato, não custa banda nenhuma ao atacante, e **cada credencial é permissão de escrita
no nosso armazenamento**. Emitir muitas é entregar muitas chaves, e chave emitida e nunca usada é o
rastro típico de quem está colhendo, não enviando. **Este é o padrão de abuso que o modelo novo criou**, e
ele é medível por nós em qualquer uma das três leituras da 1.7, porque a emissão é sempre nossa.

**Uma ressalva honesta sobre os números da 3.7.10:** eles são propostos, não medidos. Régua documental
típica gira em torno de uma dúzia de documentos, e reenvio de foto tremida é normal, então o corte tem de
tolerar o candidato desastrado e pegar o varredor. Os valores acima são o ponto de partida, e o
`seguranca` os confere contra o limite de emissão que ele definir, pela mesma régua de casamento da 3.1:
o painel não pode acender depois de o limite já ter contido, nem deixar de acender porque o limite corta
antes do piso.

A 3.7.8 é informativa de propósito: candidato viajando existe, e bloquear por país é decisão da regra de
defesa, não do painel. O painel mostra; quem bloqueia é a barreira.

**Onde o padrão vive:** o resultado de cada avaliação é gravado numa tabela própria
(`portal_padroes_detectados`, seção 4.3), com janela, alvo, números e o momento. Isso dá três coisas de
graça: o alerta não some quando o operador atualiza a tela, a faixa de estado lê dali sem recalcular, e
passa a existir histórico de "quantos ataques tivemos no mês".

**Regra de honestidade dos padrões:** padrão cuja origem está cinza aparece na lista com o rótulo
**"Não Avaliado"**, e não some. Padrão que some é padrão que o operador supõe verde.

### 3.8 Postura De Segurança: o que a barreira tirou de nós, e o que o modelo novo devolveu

**Responde:** onde estão as vulnerabilidades.
**Visualização:** lista de checagens, cada uma com resultado, o que foi medido, **a evidência** e quando
foi medido.
**Granularidade:** cada checagem no seu ritmo, de minutos a diária, sempre com carimbo de hora.
**Custo:** médio a alto, e varia muito por item.

**O critério não mudou, e é único:** só entra o que é medido por uma checagem real, com evidência, e que
muda de estado sozinho quando o mundo muda. Declaração escrita à mão, lista de boas práticas e nota de 0
a 100 estão fora.

**O que a barreira mudou:** algumas checagens saíram da nossa mão. Com o EA atrás da barreira, a fábrica
**não tem como medir sozinha** o que acontece na camada do Fernando, e em vários casos nem alcança a
internet para provar de fora. Por isso nasce um resultado novo.

**O que a decisão 15 mudou, e é uma troca, não uma perda.** Saem da nossa medição o **antivírus** e o
**teto de tamanho do arquivo**, que agora são do Fernando e do Google. Entram três checagens que **antes
não existiam e agora são medíveis de verdade**, porque a credencial de escrita é emitida por nós: ela tem
**prazo curto**, tem **teto embutido** e **não pode listar nem sobrescrever**. A terceira (8.13) mede a
distância entre o que autorizamos e o que chegou, que é o buraco por onde o modelo novo falharia em
silêncio.

**Os cinco resultados possíveis, e o cinza é o que mantém a tela honesta:**

| Resultado | Cor | Significa |
|---|---|---|
| **OK** | verde | medido por nós, agora, e passou |
| **Alerta** | amarelo | medido por nós e o valor está fora do desejado |
| **Crítico** | vermelho | medido por nós e está errado |
| **Não Medido Por Nós** | **cinza** | está fora do nosso alcance. Quem mede é a camada da barreira. Mostra **quem mede**, **o que foi combinado** e **quando chegou a última notícia** |
| **Não Aplicável** | cinza claro | a checagem não faz sentido neste desenho (exemplo: staging, se o arquivo nunca tocar nosso disco) |

**"Não Medido Por Nós" NUNCA conta como verde, e a tela não tem um resumo de "tudo certo" que o ignore.**
Se houver contagem no topo da seção, ela é sempre em três números separados: quantas passaram, quantas
falharam, **quantas não são medidas por nós**. Somar cinza com verde é como um painel de segurança vira
enfeite.

| # | Checagem | Quem mede | Como é medida de verdade |
|---|---|---|---|
| 8.1 | **Certificado TLS Do Portal** | nós, **se** a VM tiver saída para a internet | conexão real ao domínio público, lê o certificado, mostra emissor e dias restantes. Alerta abaixo de 21 dias, Crítico abaixo de 7. **Sem saída para a internet, vira "Não Medido Por Nós", e quem mede é o Fernando** |
| 8.2 | **Rotas Administrativas Fechadas Na Barreira** | nós, **se** houver saída | probe ativo na URL pública em `/api/auth/login`, `/admin` e `/api/admissoes`, esperando recusa. Se responder, é **Crítico**: a allowlist furou. É o item de maior valor da lista, e **é o item de fronteira 6.6**, porque sem saída para a internet só o Fernando consegue provar |
| 8.3 | **Credencial De Escrita Com Prazo Curto E Teto** (substitui o antigo "Teto De Upload Aplicado") | **nós** | sobre as credenciais emitidas na janela: o **maior prazo** concedido, o percentual que saiu **sem teto de tamanho** e o percentual **sem teto de quantidade**. Qualquer credencial sem teto é **Crítico**; prazo acima do combinado é **Alerta**. Medível nas três leituras da 1.7, porque quem emite somos nós |
| 8.4 | **Antivírus Do Armazenamento Reportando** | **Fernando** e **Google** | nós **não temos antivírus** (decisões 7 e 15). O que medimos é se **alguém** está nos contando: qual origem reportou por último e há quanto tempo. Sem notícia há mais de X horas, **Alerta**, com o texto "o antivírus pode estar fora, ou pode só não estar reportando, e não sabemos a diferença". Nunca verde por suposição |
| 8.5 | **Links Vivos E Revogáveis** | nós | quantos links dentro da validade, quantos revogados. Depende da revogação (item E10) existir; enquanto não existir, **Crítico**, porque link vazado não tem botão que o mate |
| 8.6 | **Links Expirados Ainda Sendo Usados** | nós | contagem de L4 com motivo `EXPIRADO` nas últimas 24h. Diferente da 8.5: ali é postura, aqui é uso real |
| 8.7 | **Cabeçalhos De Segurança Do Portal** | **Fernando**, se aplicados na borda | requisição real ao domínio público conferindo HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy` e CSP. Aplicados na barreira, é dele: **"Não Medido Por Nós"** até haver saída para a internet ou atestação dele |
| 8.8 | **Expurgo De Retenção Em Dia** | nós | quando o job de TTL rodou, e quantas linhas apagou. LGPD medida, não declarada |
| 8.9 | **Staging Efêmera Dentro Do TTL** | nós, **se houver staging** | maior idade de arquivo na staging contra o teto de 48h (§A.6). **Depende da resposta da 1.7:** checagem viva na leitura 1, checagem de "nada sobreviveu ao ciclo" na leitura 2, **"Não Aplicável"** na leitura 3, quando nenhum byte toca o nosso disco |
| 8.10 | **Origem Do IP Confiável** | nós | percentual de eventos com IP nulo, loopback ou igual ao da barreira sem cabeçalho real. É a autoconferência da seção 1.5 |
| 8.11 | **Origens Reportando** (nova) | nós | há quanto tempo chegou o último evento de **cada uma das três origens**, agora incluindo o armazenamento. É a medição da própria cobertura (3.0), e é o que impede a lacuna de virar silêncio |
| 8.12 | **Credencial De Escrita Sem Listar E Sem Sobrescrever** (nova, decisão 15) | **nós** | **probe ativo**, semanal, com uma credencial de teste emitida pelo caminho real: tenta **listar** o armazenamento e tenta **sobrescrever** um objeto que já existe, esperando recusa nas duas. Se qualquer uma passar, é **Crítico**, porque um link vazado deixaria de ser "quem envia um arquivo" e passaria a ser "quem lê ou apaga os dos outros". É a checagem de maior valor que o modelo novo trouxe |
| 8.13 | **Envios Confirmados Contra Credenciais Emitidas** (nova, decisão 15) | **nós** | proporção, na janela, entre credenciais emitidas e arquivos confirmados. Queda brusca significa uma de duas coisas, e as duas importam: o envio quebrou, ou alguém está colhendo credencial sem enviar nada (3.7.10). **Sem a confirmação da 5.3.1 esta checagem é "Não Medido Por Nós"**, e não verde |

**Três das treze estão inteiras fora da nossa medição** (8.2 e 8.7 enquanto não houver saída para a
internet, e a 8.4), e a **8.9 depende da resposta sobre o caminho dos bytes** (1.7). A tela diz isso em
cada linha, com nome e data da última notícia. **A fábrica não pinta verde o que não mediu**, e a contagem
do topo continua em três números separados, com o cinza nunca somado ao verde.

**O que continua recusado por ser teatro:** nota de segurança de 0 a 100, lista de CVEs dentro do painel
(lugar disso é o gate do CI), "tentativas de SQL injection bloqueadas" (nada registra isso e não há WAF,
o número seria zero para sempre ou inventado), contas sem 2FA (o EA não oferece 2FA, então o card seria
verdadeiro e inútil), varredura de portas da VM (não é atribuição da fábrica e toca infra de terceiro),
e mapa mundi animado com linhas de ataque.

### 3.9 Trilha Completa

**Responde:** "registra tudo", literalmente, e permite achar a linha exata.
**Visualização:** tabela no padrão §A.12, paginada, com as colunas da seção 4.1.
**Granularidade:** evento a evento, com janela máxima obrigatória de **7 dias por consulta**.
**Custo:** baixo, desde que os índices da 4.2 existam e a janela seja obrigatória.

**Coluna nova: Origem** (Plataforma, Barreira, **Armazenamento**). Coluna nova numa tela nasce com filtro
multiselect e com ordenação, na mesma entrega (§A.37, §A.28, §A.29). O terceiro valor entra como opção do
filtro desde o primeiro dia, mesmo enquanto ninguém escrever com ele: sem a opção não dá para perguntar
"o que veio do armazenamento", que é metade da pergunta que a terceira zona criou (§A.37).

Vai no fim da página de propósito: é onde se confirma o que as seções de cima afirmaram, e não é por
onde se começa a olhar.

---

## 4. O MODELO DE DADOS

### 4.1 A tabela de eventos, que é o coração

`portal_eventos_seguranca`, no molde de trilha de `candidato_alteracoes_log`
(`apps/backend/src/db/schema/tables.ts:1672`), com uma diferença essencial: lá há uma exceção consciente
de PII, **aqui não há nenhuma**. A tabela é desenhada para não conter dado pessoal legível. **As duas
origens gravam na MESMA tabela**, com a coluna `origem` separando, porque é isso que permite uma linha do
tempo só e uma trilha só.

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | bigserial | volume alto; uuid custaria índice à toa |
| `ocorrido_em` | timestamptz | quando aconteceu, não quando chegou |
| `recebido_em` | timestamptz | só para evento vindo de fora (barreira ou armazenamento): mede o atraso da ingestão |
| `origem` | varchar(14) | **PLATAFORMA**, **BARREIRA** ou **ARMAZENAMENTO** (decisão 15) |
| `tipo` | varchar(40) | o catálogo do `seguranca` (5.4), **que é a fonte, e ele o ajusta em paralelo** |
| `resultado` | varchar(12) | OK, RECUSADO, BLOQUEIO |
| `motivo_codigo` | varchar(40) | código, nunca frase livre. Na falha de identificação é **sempre `NAO_CASOU`** |
| `ip` | inet null | NULO quando a origem não é confiável (1.4). Truncado aos 90 dias |
| `ip_confiavel` | boolean | veio do cabeçalho escrito pela barreira, no salto conhecido |
| `ip_hash` | char(64) | `sha256(sal_do_mes + ip)`. **O sal roda por mês** (decisão aprovada): dentro do mês correlaciona, passado o mês nem nós revertemos |
| `geo_pais` | char(2) null | resolvido na ESCRITA, não na leitura |
| `geo_cidade` | varchar(80) null | nulo quando a base não resolve |
| `rede` | varchar(12) | INTERNA, EXTERNA, BARREIRA, DESCONHECIDA |
| `candidato_hash` | char(64) null | `sha256(pepper + cpf)`, derivado do **token do link**, nunca do que o candidato digitou |
| `jti_link` | uuid null | identificador do link: amarra os eventos do mesmo link |
| `admissao_id` | uuid null | `on delete set null`, como na trilha existente |
| `rota` | varchar(80) | caminho normalizado, **sem query string** (query carrega PII) |
| `metodo` | varchar(6) | |
| `http_status` | smallint null | |
| `ua_familia` | varchar(30) | Chrome, Safari, Firefox, Robô, Desconhecido |
| `ua_robo` | boolean | |
| `ua_hash` | char(32) | agrupa user-agent idêntico sem guardar a string inteira |
| `bytes` | integer null | tamanho do objeto. Nas leituras 1 e 2 é medido por nós; na leitura 3 vem do **metadado** do armazenamento, e é **NULO** quando não houver consulta de metadado. Nulo aqui vira "Não Medido Por Nós" na tela, nunca zero |
| `documento_tipo` | varchar(40) null | **qual documento** a credencial autoriza, pelo código do catálogo `tipos_documento`. Código, nunca nome de arquivo |
| `objeto_ref` | varchar(80) null | referência **lógica** do objeto no armazenamento, para casar credencial com confirmação. **Proibido** guardar a URL, o token da credencial ou o nome original (§A.6, mesma régua das URLs do Pandapé e da Clicksign) |
| `credencial_prazo_s` | integer null | prazo concedido, em segundos. Alimenta a checagem 8.3 |
| `credencial_limite_bytes` | integer null | teto embutido na credencial. **Nulo é achado**, não ausência de dado: credencial sem teto é o Crítico da 8.3 |
| `extracao_campos_qtd` | smallint null | **quantos** campos a IA extraiu. Nunca quais, nunca os valores, que são PII |
| `extracao_confianca` | smallint null | confiança agregada, de 0 a 100, quando o motor devolver |
| `duracao_ms` | integer null | também mede a extração da IA e a espera pela confirmação do objeto |
| `correlacao_id` | uuid null | amarra os eventos de uma mesma sessão de candidato |
| `barreira_evento_id` | varchar(64) null | identificador do evento no lado do Fernando. **Unique quando não nulo**: é o que torna a ingestão idempotente |
| `detalhe` | jsonb null | só códigos e números. **Proibido** conter nome, CPF, data de nascimento, e-mail, telefone, nome de arquivo original, token, credencial de escrita, URL do armazenamento ou **qualquer valor extraído pela IA** |

**A extração da IA grava RESULTADO, nunca CONTEÚDO.** É a regra que o modelo novo torna urgente: a IA
passa a ler o documento no fluxo do envio, e o que ela lê é exatamente a PII mais sensível da frente, nome,
CPF, data de nascimento, endereço. O evento de extração guarda **se deu certo**, **quantos campos vieram**,
**a confiança** e **quanto demorou**, e nada mais. Um painel de segurança que guardasse os valores
extraídos seria o vazamento que ele existe para evitar, e por isso o teste do `tester` da 4.1 (escrito
antes do código, §A.40) cobre também este caminho, não só o do CPF digitado.

**Três consequências do veto, e elas simplificam a tabela:**
- **não existe coluna de CPF mascarado.** A máscara é derivada na exibição, a partir do candidato
  (regra do `seguranca`);
- **não existe hash do CPF digitado.** O `candidato_hash` vem do link, e o que o candidato digita é
  comparado em memória e descartado;
- **a retenção não precisa apagar nenhum campo de PII aos 90 dias**, porque não há nenhum. O que expira
  aos 90 dias é o IP completo, e só.

**A proibição do `detalhe` é regra de código, não de disciplina.** O serviço de escrita recebe um objeto
tipado e restrito, nunca um `Record<string, unknown>` livre, e o `tester` deve ter, escrito **antes do
código existir** (§A.40), o teste que prova que um CPF entregue ao registrador não aparece na linha
gravada. É a lição da §A.38: quem escreve a régua não é quem confere se ela fecha.

### 4.2 Índices

- `(ocorrido_em desc)`, para a trilha e a série.
- `(ip, ocorrido_em desc)`, para a Ficha Do IP e o ranking.
- `(jti_link, ocorrido_em desc)`, para a força bruta por link (3.7.1).
- `(candidato_hash, ocorrido_em desc)`, para o Registro De Acesso do candidato (3.6).
- `(tipo, resultado, ocorrido_em desc)`, para os cards.
- `(origem, ocorrido_em desc)`, para a cobertura (3.0) e o filtro da trilha.
- `(geo_pais, ocorrido_em desc)`, para a geografia.
- `(objeto_ref)` parcial, `where objeto_ref is not null`, para casar **credencial emitida** com
  **confirmação de chegada** e achar as que nunca viraram arquivo (3.7.10 e checagem 8.13).
- unique parcial em `barreira_evento_id` `where barreira_evento_id is not null`, para a idempotência.
- índice PARCIAL em `ocorrido_em` com `where resultado <> 'OK'`: é a consulta mais quente do painel e a
  mais barata de acelerar.

### 4.3 As tabelas de apoio

- **`portal_agregado_hora`**: grão `(hora, origem, tipo, resultado, geo_pais)` mais `qtd`. Alimenta
  cards, série e geografia. Chave única no grão, escrita por upsert.
- **`portal_agregado_hora_ip`**: grão `(hora, ip)` mais `qtd`, `falhas`, `links_distintos`, `uploads`,
  `bytes`. Alimenta o Ranking De IPs e a contagem de IPs únicos, que sai de CONTAR LINHAS, porque
  distinto não se soma entre buckets.
- **`portal_agregado_hora_link`**: grão `(hora, jti_link)` mais `qtd`, `falhas`, `ips_distintos`.
  Alimenta a seção 3.6 e a regra 3.7.1.
- **`portal_padroes_detectados`**: `id`, `padrao`, `gravidade`, `janela_inicio`, `janela_fim`,
  `alvo_tipo` (IP, LINK, CANDIDATO, GLOBAL), `alvo`, `numeros` (jsonb com as contagens que dispararam),
  `detectado_em`, `ativo`.
- **`portal_postura_checagens`**: `chave`, `titulo`, `resultado` (incluindo `NAO_MEDIDO_POR_NOS`),
  `quem_mede`, `evidencia` (texto curto), `medido_em`, `ultima_noticia_em`. Uma linha por checagem,
  sobrescrita a cada medição.
- **`portal_origens_ingestao`**: `origem`, `ultimo_evento_em`, `ultimo_recebimento_em`, `eventos_24h`,
  `estado`. É o que a seção 3.0 lê, e o que a checagem 8.11 mede. **Nasce com três linhas**, e a do
  **armazenamento** nasce cinza, como a da barreira: origem que não existe na tabela não tem como ser
  declarada ausente na tela, e o painel voltaria a ter lacuna silenciosa.
- **`ip_geo_blocos`**: faixa de IP, país, cidade. Tabela de carga, recriada pelo cron mensal.
- **`ip_sal_mes`**: o sal do mês corrente para o `ip_hash`, e o registro de que os sais anteriores foram
  descartados. Sal descartado é o que torna o hash irreversível **por nós também**.

### 4.4 Retenção, e o que expira vira o quê

**APROVADO, decidido em 18/09/2026: 90 dias completo, 12 meses truncado, 24 meses agregado, com o sal do
IP rodando por mês. A decisão 15 NÃO mexe nessa régua**, e nem precisaria: os campos que os eventos novos
trouxeram (`documento_tipo`, `objeto_ref`, prazos, tetos, contagem e confiança da extração) são **código e
número**, sem PII, então expiram junto com a linha e não exigem expurgo próprio. **O IP completo continua
sendo a única coisa que expira antes da linha.** O que a decisão 15 acrescenta é uma retenção que **não é
nossa**: a do arquivo dentro do armazenamento, que é o item de fronteira 6.12.

| Dado | Vive | O que acontece ao expirar |
|---|---|---|
| Evento com IP completo | **90 dias** | o IP é truncado (`/24` em IPv4, `/48` em IPv6). O `ip_hash` e o `ua_hash` permanecem |
| Evento já truncado | até **12 meses** | apagado de vez |
| Sal do mês | **o mês corrente mais os 2 anteriores** | descartado. Passado isso, nem nós revertemos o `ip_hash` |
| Agregado por hora | **24 meses** | apagado |
| Padrões detectados | **24 meses** | apagado. É o histórico de "quantos ataques tivemos" |
| Postura | última medição sempre; histórico **12 meses** | apagado |

**Nota de conciliação, para ninguém ser pego de surpresa:** o `seguranca` havia proposto 180 dias para o
evento de segurança. O diretor aprovou 90 dias com IP completo, que é **mais restritivo**, e 12 meses já
truncado, que preserva a capacidade de investigar padrão sem preservar a pessoa. As duas réguas não se
contradizem: a nossa é mais curta, e o IP cru de um incidente aberto, se for preciso, está no log da
barreira com a retenção do Fernando (item de fronteira 6.5).

O expurgo é um job diário, idempotente e transacional, no mesmo espírito do TTL da staging (§A.6) e da
rotina `aplicarRegrasImportacao` (§A.16): roda sozinho, não depende de ninguém lembrar, e a checagem 8.8
mostra quando ele rodou. **Retenção que ninguém mede é retenção que ninguém cumpre.**

### 4.5 Volume, e o que acontece quando a tabela tiver milhões de linhas

O tráfego legítimo é pequeno: entre 200 e 400 candidatos por mês, com uns 25 eventos cada, dá **cerca de
10 mil eventos por mês**. Isso não é problema para o Postgres nem daqui a cinco anos.

**O volume não vem do candidato, vem do mundo, e agora vem TAMBÉM da barreira.** Uma URL pública recebe
varredura automatizada constante, e é justamente essa varredura que a barreira vê e nos manda. **A
ingestão da barreira pode ser maior que todo o resto do painel somado.** É prudente projetar para pico de
1 a 2 milhões de linhas por mês.

Quatro decisões decorrem disso:

1. **O painel lê AGREGADO, não a tabela bruta.** Cards, série, geografia e rankings vêm de
   `portal_agregado_hora*`. Só a Trilha Completa e a Ficha Do IP leem o bruto, e as duas têm janela
   máxima obrigatória. Consulta ao vivo sobre milhões de linhas é o caminho conhecido para a tela ficar
   lenta primeiro e cair depois, justamente durante o ataque, que é quando ela mais importa.
2. **Escrita com coalescência.** Eventos idênticos (mesma origem, IP, tipo, motivo e rota) dentro do
   mesmo segundo viram um registro com contador, em vez de N linhas.
3. **Teto de escrita por IP.** Passado um limite por hora (proposta: 5.000 eventos de um mesmo IP),
   aquele IP passa a ser só contagem agregada e para de gravar linha bruta, com um evento único marcando
   a mudança. O painel continua sabendo o tamanho, sem guardar cada batida.
4. **Teto de ingestão da barreira.** A ingestão tem lote máximo, balde de throttler próprio (item A-2 do
   `seguranca`, separado do balde global) e, no estouro, grava agregado e descarta o bruto, registrando
   quantos descartou. **A barreira não pode derrubar o EA nos contando que estamos sendo atacados.**

**Particionamento por mês** da tabela bruta é a evolução natural, e recomendo **não** fazer na primeira
versão: só vale depois de o volume real ser conhecido, e o expurgo por data já resolve o crescimento
enquanto o volume for o estimado.

**A escrita nunca atrapalha o candidato.** O registrador é disparado e esquecido (fila BullMQ, que já
existe, ou chamada não aguardada com captura de erro): se o registro falhar, o candidato não vê nada e
não é impedido de enviar o documento. Um painel de monitoramento que derruba o que monitora é pior que
não ter painel.

---

## 5. OS CONTRATOS

### 5.1 Endpoints de leitura, `SalaSegurancaController`

Todos sob `/api/sala-seguranca`, todos apenas leitura, todos com o mesmo objeto de filtro na query
(janela, origem, tipo, resultado, motivo, país, rede, IP, link, candidato, rota, status, uaFamilia, robo,
padrão), cada parâmetro aceitando **lista** de valores, pelo mesmo `parseMulti` que a Esteira já usa.

| Operação | Devolve |
|---|---|
| `cobertura` | por origem: estado, última notícia, eventos nas últimas 24h. É a seção 3.0 |
| `estado` | o semáforo: estado, motivo em texto, os números que o dispararam, quais critérios estão desligados por cegueira, e se a base histórica já existe |
| `kpis` | os dez cards, cada um com valor **ou o marcador de não visível**, variação contra o período anterior, e a chave de filtro que ele ativa |
| `geografia` | lista por país (código, nome, total, falhas) e por cidade, já ordenadas |
| `serie` | pontos da série (instante, ok, falha, barrado), a granularidade aplicada, a linha de base por ponto e o pico marcado |
| `rankingIps` | linhas do Ranking De IPs, com paginação, **sem as origens confiáveis** |
| `tentativasPorLink` | linhas da seção 3.6, por link e por candidato. **Não aceita CPF como parâmetro, em nenhuma forma** |
| `fichaIp` | detalhe de um IP: série, links tocados, famílias de user-agent, padrões e últimos eventos. **Nunca nome de pessoa** |
| `registroDoCandidato` | o log de um candidato, por id de candidato, exigindo a mesma permissão da ficha. É o caminho inverso da 3.6 |
| `padroes` | os alertas ativos e os das últimas 24h, com gravidade, regra, alvo, números e os "Não Avaliado" |
| `postura` | as checagens da 3.8, com resultado (incluindo `NAO_MEDIDO_POR_NOS`), quem mede, evidência e carimbo |
| `trilha` | os eventos, paginados, janela máxima de 7 dias, com o total |
| `catalogos` | os valores possíveis de cada filtro (§A.37: catálogo vem de endpoint, nunca das linhas) |

**Nenhum endpoint devolve CPF, data de nascimento, e-mail, telefone, token ou URL externa.** Isso deve
ser provado por teste, não afirmado (§A.38).

### 5.2 Escrita interna, `PortalEventosService`

Não é endpoint: é serviço interno chamado pelas rotas do portal. `registrar(evento)`, onde `evento` é um
tipo FECHADO. O `candidato_hash` é derivado **do token**, dentro do serviço (o chamador nunca monta o
hash, senão o pepper vaza de contexto). O IP entra como o par (ip, confiável) já resolvido pelo extrator,
e a geografia é resolvida ali, na escrita. Retorno `void`; nunca lança para o chamador.

**O extrator de IP é uma peça só, em um arquivo só**, e é o único lugar do sistema que decide o que é IP
confiável e o que é origem confiável. Duas implementações desse extrator divergem no primeiro ajuste, e
uma delas vira o furo. Vale a linha fixa de briefing da §A.40: **quem mais escreve este dado?**, e a
resposta tem de ser provada por varredura, não suposta.

### 5.3 Ingestão da barreira, `BarreiraEventosController` (contrato NOVO)

O lado de cá da opção P (1.3). Existe, e nasce **inerte**, sem credencial configurada, no mesmo padrão
que o webhook do Pandapé já usa hoje (§A.5): sem token, a rota nasce fechada e responde 401.

| Item | Desenho |
|---|---|
| Rota | `POST /api/barreira/eventos` |
| Autenticação | header de token combinado (`BARREIRA_EVENTOS_TOKEN`), **fail-closed**: sem credencial, 401, sem hardcode. No molde do `PandapeWebhookGuard` |
| Origem | aceito **só** vindo do salto da barreira (registro de origens confiáveis). Duas travas, token e salto, porque uma só é uma linha de código |
| Corpo | lote de eventos, máximo N por chamada, cada um com `barreira_evento_id`, `ocorrido_em`, `tipo`, `resultado`, `motivo_codigo`, `ip`, `metodo`, `rota`, `http_status`, `bytes`, `ua` e, na detecção de vírus, a `assinatura` da praga |
| Idempotência | pelo `barreira_evento_id` unique. Reenviar o mesmo lote duas vezes não duplica nada, exatamente como a régua da `integracao_pandape` |
| Resposta | 202 rápido, enfileira, o worker processa. A barreira nunca fica esperando o nosso banco |
| Limite | balde de throttler próprio, separado do global (item A-2), com o comportamento de estouro da 4.5 |
| Proibições | o corpo **não pode** trazer CPF, nome, data de nascimento, query string, nome de arquivo original nem conteúdo. O receptor **descarta e registra** campo desconhecido, em vez de gravar. É item de fronteira 6.4 |

**Tipo que chega e o painel não conhece cai num balde "Não Classificado" VISÍVEL**, em vez de sumir.
Sumir em silêncio é como se descobre tarde que metade dos eventos não era contada.

### 5.3.1 A confirmação vinda do ARMAZENAMENTO (contrato NOVO, decisão 15)

A terceira zona também não chega sozinha. Aqui há **três caminhos possíveis**, e o primeiro está
**recusado por desenho**:

| Caminho | Como seria | Veredito |
|---|---|---|
| **A palavra do navegador** | o candidato, ao terminar, diz ao EA "enviei" | **RECUSADO.** No modelo de ameaça desta frente o navegador é o lado não confiável. O painel passaria a ser preenchido por quem ele monitora |
| **Consulta de metadado, por nós** | terminado o envio, o EA pergunta ao armazenamento se o objeto existe, que tamanho tem e quando chegou | **RECOMENDADO.** É leitura de **metadado, não do arquivo**, então não fere a decisão 15. Barata, síncrona no fim do fluxo, e com uma varredura de recuperação para o que ficou pendente |
| **Notificação do armazenamento** | a nuvem avisa o EA quando o objeto é gravado | **ALTERNATIVA**, e depende de o Fernando habilitar. Chega mais completa, e exige um receptor no mesmo molde da 5.3 |

**A recomendação é a consulta de metadado, com a notificação como evolução**, pela mesma razão que fez P
ganhar de Q na 1.3: um formato só e nenhuma exposição nova. A escolha é o item de fronteira 6.10.

**A falha tem de ser um evento, não um silêncio.** Credencial emitida que não vira objeto confirmado
dentro do prazo gera o evento de falha de envio, e é esse evento que separa "o candidato não mandou" de
"o candidato mandou e quebrou". Sem ele, os dois casos viram a mesma ausência de linha, e ausência de
linha é o que ninguém vê.

**Proibições, iguais às da 5.3:** o que entra aqui é **existência, tamanho, momento e a referência lógica
do objeto**. **Nunca** a URL, nunca a credencial, nunca o nome original do arquivo, nunca conteúdo
(§A.6).

### 5.4 O catálogo de eventos que VALE é o do `seguranca`, e o que esta revisão PROPÕE a ele

**A fonte é `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, seção 4**, do agente `seguranca`. Os tipos são
prefixados `PORTAL_`, e o dono da lista é ele. **Este documento deixou de copiar os números da lista de
propósito:** ele está ajustando o catálogo em paralelo, pelo mesmo modelo novo, e número copiado aqui
envelhece em silêncio e passa a mentir. A regra desta seção é **apontar, não duplicar**.

**O painel não inventa tipo:** tipo que o painel mostra e ninguém escreve é card zerado para sempre. Por
isso, o que este ajuste precisa **propõe ao dono do catálogo**, com nome e conteúdo, e a numeração sai da
versão dele.

**O que o modelo novo faz com os eventos que já existiam:**

- o evento de **upload recebido** deixa de significar "arquivo recebido por nós" e passa a significar
  **"arquivo enviado ao armazenamento"** (1.6). Como isso são três momentos que falham sozinhos, ele
  **se desdobra** nos três eventos propostos abaixo, em vez de continuar um só com o sentido trocado;
- os eventos de **antivírus** (detecção e indisponibilidade) deixam de ser da barreira em exclusivo:
  podem vir **da barreira ou do armazenamento**, e o painel registra **qual origem** reportou;
- o evento de **extração da IA** ganha peso: ele era um detalhe de fluxo e vira o evento que prova que a
  leitura no upload aconteceu, **com resultado, contagem e confiança, nunca com os valores** (4.1);
- o evento de **expurgo da staging** passa a depender da resposta da 1.7, e pode simplesmente **não
  existir** na leitura 3.

**Os quatro eventos PROPOSTOS, que o modelo novo exige e o catálogo ainda não tem:**

| Nome proposto | Quando nasce | O que carrega | O que NÃO carrega |
|---|---|---|---|
| `PORTAL_CREDENCIAL_ESCRITA_EMITIDA` | o EA autoriza um envio | quem pediu (link e `candidato_hash` do token), **para qual documento** (código do catálogo), **prazo** e **teto**, a referência lógica do objeto | a credencial, a URL, o nome do arquivo |
| `PORTAL_CREDENCIAL_ESCRITA_RECUSADA` | o pedido de autorização é negado | o motivo em código: link inválido, limite atingido, ritmo, quantidade acima da régua | qualquer texto livre |
| `PORTAL_ARQUIVO_CONFIRMADO` | o objeto existe no armazenamento | tamanho, momento e a referência lógica, mais **como foi confirmado** (metadado ou notificação) | conteúdo, URL, nome original |
| `PORTAL_ARQUIVO_FALHA_ENVIO` | o envio falhou, ou a confirmação não veio no prazo | código do erro e quanto tempo se esperou | mensagem crua do provedor, que costuma trazer caminho e identificador |

**Os três primeiros são da PLATAFORMA e existem em qualquer uma das três leituras da 1.7.** Só o
`PORTAL_ARQUIVO_CONFIRMADO` depende da fronteira 6.10 para existir, e enquanto ela estiver aberta o card
5 e a checagem 8.13 mostram **"Não Medido Por Nós"**, nunca zero.

**Uma observação para quem for consolidar:** o `seguranca` pode preferir um evento único de envio com um
campo de estágio, em vez de três tipos. Funciona igual para o painel, desde que **os três momentos sejam
distinguíveis por código**, porque é a distinção, e não a quantidade de tipos, que impede "credencial
emitida" de ser contada como "documento entregue". A decisão é dele.

### 5.5 O registro do menu

**APROVADO: a tela é de Master e Super Admin, e o menu nasce só para o Super Admin (§A.23).**

Em `apps/backend/src/domain/menus.ts`, no molde exato dos menus do Gerencial (Alto Volume, Clínicas,
Integração Por Cliente, iFractal):

```
codigo:     "sala-seguranca"
rotulo:     "Sala De Segurança"
href:       "/admin/sala-seguranca"
grupo:      "ADMIN"
ordem:      a definir, no bloco 30 a 33, ao lado do Diagnóstico
areas:      ["ADM"]
operacoes:  []
```

Caminho restrito, decidido: a controller nasce `@Roles(MASTER, SUPER_ADMIN)` e o menu entra em
`MENUS_BLOQUEADOS_COMUM`, no mesmo regime de `diagnostico`, `usuarios` e `entradas-pandape`.
`operacoes: []` porque marcar a controller para um COMUM não concederia acesso de todo modo (o
`RolesGuard` barra antes, fail-closed).

Vale a §A.23 inteira: a fábrica **REGISTRA** o menu no catálogo (o convergedor de boot,
`MenusCatalogoService`, faz isso sozinho) e **para por aí**. Nenhum seed rodado, nenhum backfill rodado,
ninguém ganha o menu. Não aparecer para os demais **não é bug**: é o diretor ainda não ter liberado.
Vale também o aviso operacional: a tela de Usuários salva por SUBSTITUIÇÃO, então quem estiver com ela
aberta quando o menu novo nascer, e salvar depois, remove o menu sem perceber.

A tela entra como **card no hub `/admin`** (`apps/frontend/src/app/(app)/admin/page.tsx`, array `CARDS`)
e no guard de rota (`apps/frontend/src/lib/menu-rotas.ts`). **Uma porta só:** card no hub, sem linha
avulsa na barra lateral, que é a decisão já registrada no `navegacao.ts` para as Entradas Do Pandapé.

### 5.6 Ponto de parada: `packages/shared-types`

O vocabulário compartilhado desta frente (tipos de evento, origens, resultados, nomes dos padrões,
formato das respostas) precisa ser visto pelo backend e pelo frontend. Esse arquivo é **arquivo único
com dono único, o coordenador** (§A.39), e tem dois defeitos conhecidos: `export *` para outro arquivo
quebra um dos dois lados (e a queda do backend só aparece no próximo restart), e constante nova só
existe como VALOR depois do build do pacote, o que faz o erro parecer bug de lógica.

**Nenhum agente de camada escreve nesse arquivo nesta frente.**

### 5.7 O que esta frente NÃO toca

Há outra fábrica no mesmo repositório, trabalhando na ingestão do A&S (`apps/backend/src/as/**`,
`apps/backend/src/pandape/**`). Este desenho **não propõe nenhuma alteração ali**. **Também não desenha o
`ai-service`:** a leitura da IA no upload é frente do modelo novo, e aqui só se registra o **resultado**
dela como evento (4.1 e 5.4). Os únicos vizinhos são
o portal do candidato, que ainda não existe, e o VT, que é precedente e só é tocado pela decisão da
seção 7, que volta como pergunta antes de qualquer edição.

---

## 6. OS ITENS DE FRONTEIRA, entre o Fernando e a fábrica

Nominais, para não sobrar buraco (cada um achando que o outro faz) nem trabalho feito duas vezes. Cada
item tem **um dono da definição** e **um dono da construção**, e eles nem sempre são o mesmo.

| # | Item de fronteira | O que precisa ser combinado | Quem define | Quem constrói de cada lado | Se ficar em aberto |
|---|---|---|---|---|---|
| 6.1 | **Como a metade de lá chega ao painel** | empurrar (P) ou puxar (Q), e a cadência | **Fernando**, com a recomendação P da fábrica (1.3) | ele emite, nós recebemos (5.3) | o painel nasce e fica em R para sempre, cego para varredura, volume e vírus |
| 6.2 | **O nome e o formato do cabeçalho de IP real** | o nome exato, a garantia de que é **sobrescrito** e nunca acrescentado, e o endereço da barreira para o registro de origens confiáveis | **os dois, em conjunto** | ele escreve no vhost, nós lemos no extrator (5.2) | Painel Cego permanente, e três seções do painel não existem (1.5) |
| 6.3 | **O resultado do antivírus chegando ao painel** | formato do evento de detecção e do de indisponibilidade, o que conta como "assinatura" da praga e **quem varre**, se a barreira, se o armazenamento, se os dois (decisão 15) | **Fernando**, com o Google | ele emite, nós contamos e acendemos vermelho (3.1, 3.7.9) | o card 8, a regra 3.7.9 e a checagem 8.4 ficam cinza, e malware barrado não aparece em lugar nenhum |
| 6.4 | **O log sem PII, dos DOIS lados** | o log da barreira sem query string (ou com mascaramento), e o nosso receptor descartando campo não previsto. §A.6 vale para os dois lados da fronteira | **os dois** | ele configura o formato de log, nós validamos e descartamos na ingestão | CPF em log de acesso do Apache, que é violação direta da §A.6, e ninguém percebe porque cada lado supõe o outro |
| 6.5 | **A retenção de cada lado** | quanto tempo o log dele guarda o IP cru, contra os 90 dias com IP completo do nosso lado | **os dois**, e o diretor decide se há divergência | cada um no seu | ou o IP cru vive para sempre do lado dele, ou o incidente aberto não tem onde ser investigado |
| 6.6 | **Quem prova que a allowlist está fechada** | a checagem 8.2, que exige bater na URL pública de fora. Se a VM não tiver saída para a internet, só ele consegue provar | **os dois** | nós fazemos o probe se houver saída; senão ele atesta com periodicidade combinada | a checagem de maior valor da postura fica cinza para sempre |
| 6.7 | **O que a barreira faz quando NÓS estamos fora** | se ela enfileira o evento e reentrega, ou se descarta | **Fernando** | ele | um restart do EA vira buraco no painel, e o buraco parece calmaria |
| 6.8 | **Quem barra o quê, para não medir duas vezes** | teto de ritmo e limite por IP existem nos dois lados, e o **teto de tamanho agora existe em três** (borda, armazenamento e o teto embutido na nossa credencial). Combinar os números, e combinar **qual deles conta** para o painel | **os dois** | cada um no seu | ou o número do painel dobra (dois lados contam o mesmo bloqueio), ou some (cada um supõe que o outro conta) |
| 6.9 | **O poder da credencial de escrita** (decisão 15) | prazo, teto de tamanho, teto de quantidade, e a garantia de que ela **não lista e não sobrescreve**. É o que a checagem 8.12 sonda | **os dois**: nós pedimos o poder mínimo, ele configura o papel no armazenamento | nós emitimos e medimos, ele configura o lado da nuvem | credencial ampla demais transforma link vazado em leitura dos documentos dos outros, que é dano maior que o upload indevido |
| 6.10 | **Como a confirmação de chegada do arquivo chega ao painel** | consulta de metadado feita por nós, ou notificação do armazenamento. **A palavra do navegador está recusada por desenho** (5.3.1) | **os dois**, com a recomendação de metadado da fábrica | nós consultamos, ou ele habilita a notificação | o card 5 e a checagem 8.13 ficam cinza, e "credencial emitida" nunca se distingue de "documento entregue" |
| 6.11 | **Quem varre o arquivo na nuvem, e como o veredito volta** | se a varredura é do armazenamento, do Fernando, ou dos dois, e por onde o resultado chega ao painel | **Fernando**, com o Google | ele reporta, nós contamos e acendemos vermelho | malware fica invisível no painel, e o vermelho da 3.1 nunca acende por esse motivo |
| 6.12 | **A retenção e o expurgo do arquivo no armazenamento** (LGPD) | quanto tempo o objeto vive na nuvem, quem apaga, e se há registro de acesso a ele depois de gravado | **Fernando**, e o **diretor** decide o prazo | ele configura, nós só declaramos na tela que não medimos | documento de candidato vivendo para sempre na nuvem, sem prazo e sem ninguém medindo, que é §A.6 aberta na zona que a fábrica não enxerga |

**Nenhum destes itens é construível sozinho pela fábrica.** Seguindo a régua da §A.5, o pedido ao
Fernando sai **de uma vez, inteiro**, e não por partes: metade das proteções obrigatórias é dele, e pedir
fatiado é garantir que sobe pela metade. **Com a decisão 15 são doze itens, não oito**, e os quatro novos
não são detalhe de infraestrutura: 6.9 e 6.12 são §A.6 direta, e 6.10 é a diferença entre o painel medir
entrega e medir promessa.

---

## 7. AS DEPENDÊNCIAS, E A ORDEM

1. **A barreira existir**, com o encaminhamento para o EA. É o pré-requisito de tudo, porque é o desenho
   do portal inteiro, não só do painel.
2. **O cabeçalho de IP real** (1.4, fronteira 6.2). Sem ele, três seções não existem e o painel nasce
   cego. É infra, é o Fernando, é pré-requisito, não paralelo.
3. **O catálogo de eventos do `seguranca`** (5.4), **na versão ajustada ao modelo novo**, com os quatro
   eventos propostos na 5.4 resolvidos por ele. A tabela e o registrador nascem sobre ele, então esta
   dependência é de ordem, não de gosto: registrador escrito sobre catálogo velho grava tipo que o
   painel não conhece.
4. **O portal do candidato existir**, ao menos a rota de identificação, para haver o que registrar.
5. **A ingestão da barreira** (5.3, fronteira 6.1), que destrava a metade de lá.
6. **A confirmação vinda do armazenamento** (5.3.1, fronteira 6.10), que destrava a terceira zona. Não
   bloqueia o painel: sem ela o card de arquivos e a checagem 8.13 nascem cinza, declarados.
7. **A base offline de geografia**, que não bloqueia nada: sem ela o país fica "não informado" e o resto
   funciona.

**Os dois furos de construção que sobraram do lado de cá**, e os dois são nossos, não do Fernando:

- **O rate limit**, agravado pela barreira. Com o tráfego chegando por um salto só, o limite por IP perde
  o alvo quando o cabeçalho de IP real não estiver escrito (1.5), e o modelo novo acrescenta um terceiro
  balde ao problema: além do balde global e do balde da ingestão, existe agora o **ritmo de emissão de
  credencial de escrita**, que é barato de pedir e caro de conceder (3.7.10). Os três baldes precisam
  ser distintos, senão a ingestão da barreira consome a cota do candidato.
- **O link revogável.** Continua sendo a checagem 8.5 e continua **Crítico** enquanto não existir: no
  modelo novo ela pesa mais, porque o link não é só a porta da identificação, é o que autoriza escrever
  na nuvem. **Link vazado sem botão que o mate é o pior estado desta frente**, e é o único dos dois furos
  que não depende de nenhuma resposta de fora para ser construído.

**APROVADO: começar a registrar os eventos já pelo VT**, antes de o portal existir. Custa pouco, é a
mesma espécie de superfície pública, e faz a linha de base da faixa de estado nascer pronta em vez de se
formar durante o primeiro risco real. **Duas ressalvas honestas:**
- **Isso encosta em código validado em produção, então volta como PERGUNTA ao diretor antes de tocar**
  (§A.26), com o mapa de alcance na mão. Aprovar o registro não é aprovar a edição sem mapa.
- **Enquanto o VT só for alcançável dentro da VPN**, os eventos que ele gera são de rede interna, e a
  linha de base que nasce daí é de tráfego interno, não de internet aberta. É base melhor que nenhuma,
  e a tela tem de dizer o que ela é, em vez de deixar supor.

**O paralelismo real:** modelo de dados e registrador (backend) em paralelo à tela (frontend), assim que
o contrato da 5.1 estiver fechado; a base de geografia e as checagens de postura são frentes
independentes entre si; e o `tester` escreve, **antes de o código existir** (§A.40), os testes de "o
registrador nunca grava CPF", "o endpoint nunca devolve CPF", "o IP da barreira não dispara padrão" e
"origem cinza mostra não visível, nunca zero".

**O mapa de alcance vai ao `seguranca` ANTES do primeiro despacho** (§A.40), não só no fim. A pergunta
fixa do briefing de backend, "quem mais escreve este dado?", vale aqui para o extrator de IP e para o
registrador de eventos.

---

## 8. O QUE FICA DE FORA DESTA PRIMEIRA VERSÃO

Proposto, não construído (§A.31). Cada item com o motivo:

1. **Bloqueio automático a partir do painel** (banir IP com um clique). O painel OBSERVA. Quem bloqueia é
   a barreira, e agora com mais razão: o bloqueio certo é do lado de fora. Botão de banir numa tela é
   também um botão de se autoderrubar.
2. **Alerta por e-mail ou WhatsApp** quando a faixa ficar vermelha. É desejável e é frente própria: exige
   decidir quem recebe, com que cadência e como não virar spam às 3h da manhã.
3. **Mapa mundi.** A barra por país responde a mesma pergunta.
4. **Exportar para Excel.** Fácil de fazer e perigoso de ter: exportação de trilha de segurança é dado
   saindo do sistema controlado. Se entrar, entra com registro de quem exportou.
5. **Enriquecimento por ASN e whois.** Útil para dizer "isso é uma nuvem, não uma pessoa", e exige outra
   base offline. Segunda onda.
6. **Particionamento da tabela por mês.** Só depois de conhecer o volume real.
7. **Monitoramento do EA INTERNO** (quem logou, de onde, quantas falhas de senha). O pedido foi o painel
   do LINK EXTERNO. Estender para a autenticação interna é frente inteira, com outro modelo de ameaça.
8. **Score de segurança, scanner de dependências, "injeções bloqueadas".** Teatro, motivo na 3.8.
9. **Retenção configurável pela tela.** Os prazos nascem em código, com os valores da 4.4. Prazo de LGPD
   editável por tela é prazo que muda sem registro.
10. **Monitorar o acesso ao objeto depois de gravado** (quem leu o documento na nuvem, e quando). É
    LGPD legítima e é a zona que não enxergamos: entra pela fronteira 6.12, com o Fernando, e não por uma
    tela que a fábrica construa agora.
11. **Espelhar no painel a configuração da barreira** (mostrar a allowlist, as regras de limite dele). É
    tentador e é armadilha: viraria uma cópia que envelhece sozinha e passa a mentir. O painel mostra o
    que a barreira **fez**, medido por evento, nunca o que ela **deveria** estar configurada para fazer.

---

## 9. AS DECISÕES, JÁ TOMADAS

Todas **APROVADAS, decididas em 18/09/2026**. Ficam registradas aqui para a construção não reabrir o que
já foi fechado.

| # | Decisão | O que ficou valendo |
|---|---|---|
| 1 | **Arquitetura** | app externo, na **barreira do Fernando**. Link externo, barreira, plataforma. O EA nunca exposto direto na internet |
| 2 | **IP real** | chega por **cabeçalho escrito pelo porteiro** e **aceito só no salto confiável**. Nunca o `x-forwarded-for` do cliente |
| 3 | **Geografia** | **base offline gratuita**, carregada por cron mensal. **Nenhum IP sai da rede**. API de terceiro recusada por §A.6 |
| 4 | **Retenção** | **90 dias completo, 12 meses truncado, 24 meses agregado**, com o **sal do IP rodando por mês** |
| 5 | **Quem enxerga** | a tela é de **Master e Super Admin**; o menu **nasce só para o Super Admin** (§A.23) |
| 6 | **Onde fica** | a Sala De Segurança fica no **Menu Gerencial** |
| 7 | **Antivírus** | é **do Fernando**, na camada da barreira. Sai do escopo da fábrica; o painel passa a depender do **resultado** dele (fronteira 6.3) |
| 8 | **Começar pelo VT** | **sim**, o registro começa pelo VT antes de o portal existir, **e volta como pergunta antes de tocar código validado** (§A.26) |
| 9 | **Busca por CPF no painel** | **REVERTIDA a proposta do arquiteto.** Sem campo de CPF digitável, sem selo de existência. Parte-se do candidato, chega-se ao log (3.6) |
| 10 | **Catálogo de eventos** | o que vale é o do `seguranca`, prefixado `PORTAL_`. Este documento **aponta** para a lista dele e **não copia número**, porque ela está sendo ajustada em paralelo (5.4) |
| 11 | **Cards** | dez, em duas fileiras de cinco. "CPF Não Encontrado" cortado pelo veto, "Detecções De Vírus" entrando pela decisão 7 |
| 12 | **Mapa mundi** | fora da primeira versão |
| 13 | **Filtros** | colunas 2 a 14 da 10.1 viram filtro **multiselect** (§A.28), as demais não |
| 14 | **Vocabulário compartilhado** | quem escreve `packages/shared-types` é o **coordenador**, dono único (§A.39) |
| 15 | **O arquivo e a IA** (modelo do Fernando, aprovado) | o arquivo **vai direto para o armazenamento na nuvem do Google** e fica lá; **a IA lê no upload**, na hora, e auto-preenche para o candidato validar, sem buscar o arquivo depois. **Antivírus e checagem do arquivo são do Fernando e do Google.** A fábrica protege o link, a identidade, as tentativas, a Sala De Segurança e os logs sem PII |

**Os pontos que continuam abertos**, e nenhum deles trava a construção do painel:

- **do Fernando:** como a metade da barreira chega ao painel (6.1), o nome do cabeçalho de IP real (6.2),
  o poder da credencial de escrita (6.9), como a confirmação de chegada chega (6.10), quem varre o
  arquivo na nuvem (6.11) e a retenção do objeto lá (6.12);
- **do `seguranca` e do diretor:** **por onde os bytes passam** para a IA ler no upload (1.7). **Este
  documento não decide isso, e o painel foi desenhado para não depender da resposta**: ela muda quantas
  checagens nascem cinza, e nada mais.

Enquanto não vierem, o painel nasce em R, declarando a lacuna nas três zonas.

**As propostas que esperam uma palavra do diretor:** os três cards da 3.2 ("Caminhos Fora Da Allowlist",
"Credenciais De Escrita Emitidas", "Falhas De Envio Ao Armazenamento"), com a recomendação de que os dois
últimos virem rodapé do card 5 se ele quiser manter exatamente dez. Nenhum é construído sem aval (§A.31).

---

## 10. FILTROS, ORDENAÇÃO E AS REGRAS DE TELA

### 10.1 A lista de colunas, e o que vira filtro

Decidido (§A.30, tela nova, a escolha foi do diretor). Todas as colunas da Trilha Completa:

| # | Coluna | Filtro? |
|---|---|---|
| 1 | Data E Hora | não, coberta pela janela do topo |
| 2 | **Origem** (Plataforma, Barreira, Armazenamento) | **sim** |
| 3 | Tipo De Evento | **sim** |
| 4 | Resultado (OK, Recusado, Bloqueio) | **sim** |
| 5 | Motivo | **sim** |
| 6 | IP | **sim** |
| 7 | País | **sim** |
| 8 | Cidade | **sim** |
| 9 | Rede (Interna, Externa, Barreira, Não Informada) | **sim** |
| 10 | Candidato | **sim**, escolhido de catálogo, **nunca por CPF digitado** (3.6) |
| 11 | Link | **sim**, pelo identificador curto do `jti` |
| 12 | Rota | **sim** |
| 13 | Status HTTP | **sim** |
| 14 | User-Agent | **sim**, pela FAMÍLIA (Chrome, Safari, Robô, Desconhecido), nunca pelo texto cru |
| 15 | Padrão Detectado | **sim** |
| 16 | Tamanho Do Arquivo | não, é leitura de linha. Célula vazia é **"não informado"** (§A.11), e na leitura 3 sem metadado é **"Não Medido Por Nós"**, que é outra coisa e tem de aparecer diferente |
| 17 | Duração | não |
| 18 | Detalhe (json) | não |
| 19 | **Documento** (código do tipo de documento que a credencial autorizou) | **sim**, coluna nova da decisão 15, nasce com filtro e ordenação na mesma entrega (§A.37) |

**Todo filtro é MULTISELECT** (§A.28), pelo `MultiSelect` do design system que já existe
(`apps/frontend/src/components/ui/MultiSelect.tsx`), com busca quando a lista é longa (§A.35). **Nenhum
`<select>` cru em lugar nenhum da tela.** **O catálogo de cada filtro vem de endpoint** (`catalogos`),
nunca das linhas carregadas (§A.37): filtro de país derivado da página encolhe assim que o primeiro país
é escolhido, e aí não há como somar o segundo sem limpar tudo.

### 10.2 O seletor de janela

Última Hora, Hoje, 7 Dias, 30 Dias, Personalizado, no topo, governando a tela inteira. O valor vai para a
URL, para o link ser compartilhável, no mesmo padrão de recorte do Controle Gerencial.

### 10.3 Ordenação

Toda tabela da tela (Origem Dos Acessos, Ranking De IPs, Tentativas Por Link E Por Candidato, Postura De
Segurança, Trilha Completa) nasce ordenável por clique no cabeçalho, pelo `useOrdenacao` e pelo
`ColunaOrdenavel` que já existem (§A.29). Nada de ordenação escrita à mão na tela.

### 10.4 As regras de tabela e de tela que esta frente obedece, sem exceção

§A.12 (máscara única, títulos centralizados, divisória sutil, ícone dinâmico por status, cards clicáveis
como filtro), §A.20 (larguras aproveitando o espaço, prova visual anti-esmagamento), §A.29 (ordenação
clicável), §A.28 e §A.37 (filtro multiselect; coluna nova, como a Origem, nasce com filtro e ordenação
na mesma entrega), §A.35 (`Select` e `MultiSelect` do design system, com busca), §A.41 (modal não fecha
ao clicar fora; os modais desta tela são de LEITURA, então nascem com botão "Fechar" no rodapé), §A.11
(nenhum travessão em nenhum texto; célula vazia é "não informado"), §A.24 (title case em título e tag).

A prova visual da §A.13 é obrigatória e fica com o coordenador.
