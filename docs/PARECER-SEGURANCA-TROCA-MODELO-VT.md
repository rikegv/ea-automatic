# Parecer De Segurança: Trocar O Balde Novo Pelo Modelo Do VT

**Veredito: A TROCA É APROVADA NA INFRAESTRUTURA E VETADA NA FORMA DE ESCRITA.** Adotar o projeto
próprio, a identidade de runtime e o IAM self service do modelo do VT é recomendado e fecha dois itens
que hoje dependem de terceiro. Copiar o caminho do byte do VT, ou seja o arquivo passando dentro da
função, é **VETADO** para arquivo: ele reabre as exigências 2 e 3, e esbarra em dois limites técnicos
que não foram medidos e que têm parede real no 4G. A recomendação é um modelo único, na seção 5.

**Achado novo, independente da pergunta, e é de veto:** o balde do VT, que está em produção, grava o
**nome completo e o CPF do candidato dentro do NOME do objeto**
(`/home/henrique/vt-online-soulan/functions/main.py:204-206` e `:214-216`). O nome do objeto vai para o
registro de acesso do Google. O próprio Portal já proibiu isso por escrito
(`apps/backend/src/domain/portal-credencial.ts:119-120`, "NUNCA o id: o nome do objeto vai para o log
do Google"). Então não são os 30 dias que estão fora da régua no VT, é o conteúdo do nome. Ver seção 4.

**Quem auditou:** agente `seguranca`, sem poder de escrita (§A.39). **Régua:** §A.6, §A.11, §A.24,
§A.38, e o parecer anterior, `docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md`. **Método:** adversarial,
com arquivo e linha. **Data:** 18/09/2026. **Gravado pelo coordenador**, que é quem tem escrita, com os
quatro achados de maior consequência reconferidos por ele (seção 8).

---

## 0. O Que Foi Medido, E O Que Não Deu Para Medir

| medida | resultado |
|---|---|
| memória e tempo limite da função do VT | 512 MB, 60 s, região us-central1 (`functions/main.py:315-319`) |
| teto de corpo declarado no código da função | **não existe**. O corpo é lido como JSON (`functions/main.py:327`) |
| papel da identidade que escreve no balde do VT | `roles/storage.objectAdmin` (`README.md`, passo 3c) |
| identidade que LÊ o balde do VT a partir do EA | a credencial **unificada** de Drive e Vertex (`apps/ai-service/app/gcs.py:7-11` e `:40-43`) |
| onde o leitor do VT está montado | na instância da **operação** (`apps/ai-service/app/main.py:16` e `:24`) |
| o leitor do VT escreve em disco | **sim**, staging (`gcs.py:26` e `:79`). O leitor do Portal deliberadamente não importa staging (`portal_bucket.py:13-16`) |
| proteção contra sobrescrita na função do VT | **nenhuma**. `upload_from_string` sem `if_generation_match` (`functions/main.py:293`), com nome determinístico |
| nome do objeto no VT | nome em maiúsculas mais CPF (`functions/main.py:204-206`, `:214-216`) |
| algoritmo do bilhete | VT é assimétrico Ed25519 (`vt-link-token.ts:38-39`, `:115`); Portal é **simétrico**, segredo compartilhado (`portal-sessao.guard.ts:58`) |
| configuração viva do VT no EA | `VT_COLETA_GCS_BUCKET` preenchida no ambiente do backend |
| teto de corpo da plataforma, ciclo de vida real e IAM real do balde do VT | **NÃO MEDIDO**. Não há `gcloud` nesta máquina, e o número não está escrito em nenhum arquivo. Ver seção 3 |

---

## 1. As Dez Exigências, O Que A Troca Fecha, Mantém E Reabre

Leitura da troca no pior caso, que é o de copiar o modelo do VT ao pé da letra. Onde a cópia literal
quebra, fica dito o que a versão corrigida precisa ter.

| # | exigência | efeito da troca | evidência |
|---|---|---|---|
| 1 | conta dedicada de escrita, chave nunca no leitor | **MELHORA DE VERDADE, com ressalva de escopo** | `functions/main.py:288-294`, ADC; contra `README.md` passo 3c, `objectAdmin` |
| 2 | não sobrescrita, tipo e faixa de tamanho assinados | **REABRE** | `functions/main.py:293` não tem `if_generation_match`; hoje isso vive na assinatura, `portal-credencial.ts:186-197` |
| 3 | quantidade, ritmo e teto de extrações | **REABRE**, se a função virar a porta de entrada | `README.md`, "Sem chamada ao EA em runtime"; a contagem vive em `portal-credencial.service.ts:198-231` |
| 4 | leitor em usuário próprio, com limites | **MANTÉM se não copiarmos o leitor do VT. REABRE se copiarmos** | `gcs.py:7-11`, `main.py:24` |
| 5 | processo filho com morte dura | **MANTÉM**, desde que a IA continue na nossa VM | seção 2 |
| 6 | checagem de conteúdo ativo | **MANTÉM**, e ganha um lugar novo a decidir | seção 2 |
| 7 | entrada separada do prontuário, recusado apagado | **MANTÉM o isolamento e FECHA a metade que estava aberta** | ver abaixo |
| 8 | teste executado de que a credencial não lê e não lista | **CONTINUA ABERTA, mas deixa de depender de terceiro** | ver abaixo |
| 9 | pedido ao Fernando | **ENCOLHE quase a zero, e um item PIORA** | ver abaixo |
| 10 | tipo de conteúdo corrigido depois da leitura | **MANTÉM, e simplifica** | `portal-armazenamento.service.ts:169-200` deixa de ser necessário |

### A Exigência 1: A Melhora É Real, E Ela Não É A Que Parece

Sim, é melhora de verdade, e não maquiagem. No modelo do VT a chave privada de escrita **deixa de
existir como arquivo** em qualquer lugar: a função escreve pela identidade de runtime, por credencial
padrão do ambiente. Some do cofre do backend, some do canal de entrega, some a rotação, e some a
pergunta "quem mais lê o cofre". Isso resolve, de uma vez, a classe inteira de vazamento de chave em
repouso.

**Mas a melhora não é onde a carta imagina, e o escopo piora.** No desenho atual a credencial que
autoriza escrita é descartável: vale **um objeto, dez minutos, sem leitura e sem listagem**, com tipo e
faixa de tamanho dentro da assinatura (`portal-credencial.ts:102-104` e `:186-197`; o tempo de vida é
dez minutos, `portal-credencial.ts:45`). No modelo do VT a autorização vira uma **identidade permanente
com alcance de balde**, e, copiada ao pé da letra, com `objectAdmin`, ou seja **lê, lista, sobrescreve
e apaga tudo**. O raio de dano sai de "um objeto por dez minutos" e vai para "o balde inteiro enquanto
a função estiver comprometida".

**Condição inegociável da troca:** a identidade de runtime é `roles/storage.objectCreator`, nunca
`objectAdmin`. O VT hoje está em `objectAdmin`, e isso é um segundo achado contra o VT, não um
argumento a favor da cópia.

### A Exigência 4: Mantém, E O Perigo É De Vocabulário

A troca é **neutra** na exigência 4, com uma condição: "adotar o modelo do VT" tem de significar **só a
metade da ESCRITA**. A metade da LEITURA do VT é exatamente o que a exigência 4 proíbe, e está medido:
o leitor do VT usa a credencial unificada de Drive e Vertex (`gcs.py:7-11`), roda dentro da instância da
operação (`main.py:24`) e **grava em disco na staging** (`gcs.py:79`).

É o mesmo formato de dano do veto V3: o isolamento do VT é propriedade de **escopo de token** em um
objeto de cliente (`gcs.py:29`, somente leitura), não propriedade da **identidade**. A mesma conta,
carregada em outro lugar com escopo cheio, escreve. O leitor do Portal já nasceu certo, com credencial
dedicada e sem import de staging (`portal_bucket.py:13-16` e `:44-46`), e é ele que fica. Se alguém
reusar `gcs.py` para o Portal "porque é o mesmo padrão", a exigência 4 cai inteira e em silêncio.

**Correção de documentação que fica mais urgente com esta troca:** `portal_bucket.py:10-11` ainda
afirma que o leitor usa a credencial unificada. O código não usa. Com o modelo do VT ao lado, esse
comentário vira instrução para a próxima pessoa fazer exatamente a coisa errada.

### A Exigência 7: A Troca Fecha A Metade Que Estava Aberta, E Esse É O Maior Prêmio

O isolamento se mantém, e só se mantém, com **balde NOVO**, como a proposta já diz. Reusar o balde do VT
daria à leitura do Portal acesso aos formulários de VT, que trazem nome e CPF, inclusive no nome do
objeto. Seria violação direta, e não há o que discutir.

O ganho é a outra metade. Hoje a exigência 7 está **parcial** porque ninguém pode apagar o recusado:
`portal-armazenamento.service.ts:216-223` só registra e devolve falso, e a permissão dependia de
concessão de terceiro. Com o balde em **projeto nosso**, concedemos nós mesmos uma identidade pequena,
separada, só de apagar naquele prefixo. **A exigência 7 passa de bloqueada por dependência externa para
item nosso, executável.** Este é, isolado, o melhor argumento a favor da troca.

### A Exigência 8: Deixa De Ser Refém

O veto V2 dizia que a prova não podia ser executada porque nem o balde nem a conta existiam. Com o balde
em projeto nosso, **criamos o balde e a conta hoje** e executamos a prova: tentar leitura e tentar
listagem com a identidade de escrita e registrar as duas recusas. O V2 continua de pé, porque ele exige
evidência e não intenção, mas o prazo dele deixa de depender de agenda alheia.

### A Exigência 9: O Pedido Some Quase Todo, E Um Item PIORA

Somem os itens 1, 3 e 4 da carta, que viram autoconcessão nossa. O CORS some **ou muda de dono**,
conforme a seção 5.

**O que piora, e ninguém olhou:** o item 6, antivírus. Hoje a carta pede para o balde novo entrar na
varredura que o Fernando já faz. Um balde em projeto nosso **sai do perímetro dele por construção**.
Trocar quatro pedidos por "perdemos a varredura de antivírus sobre arquivo enviado da internet por gente
de fora" não é economia, é troca ruim, e tem de ser dita ao diretor com essas palavras. A pergunta ao
Fernando continua existindo, só muda de forma: ele varre balde em projeto nosso, ou precisamos de
varredura própria.

### As Exigências 2 E 3: É Aqui Que A Cópia Literal Quebra

**Exigência 2.** As três travas (tipo, faixa de tamanho, proibição de sobrescrever) vivem **dentro da
assinatura V4** hoje, e a graça é que omitir qualquer uma faz o Google recusar, sem depender da boa fé
de quem chama (`portal-credencial.ts:186-197`, provado em `gcs-assinatura-v4.spec.ts:47-99`). Sem URL
assinada não há assinatura para carregá-las, e elas viram condição dentro da função, que é bem mais
fraco. Medido: a função do VT **não tem nem a condição**. `functions/main.py:293` sobe sem
`if_generation_match`, e o nome do objeto é determinístico, então **um segundo envio sobrescreve o
primeiro em silêncio**, hoje, em produção. É apagamento de prova, o mesmo padrão de dano da §A.33.

**Exigência 3.** É o custo estrutural e o menos visível. Quantidade, soma, ritmo e teto de extração são
contados **no momento da emissão**, dentro de transação (`portal-credencial.service.ts:198-231`). Isso
só funciona porque o navegador precisa **pedir a nós** antes de escrever. No modelo do VT o navegador
fala direto com a função, e a função **não fala com o EA** (é premissa declarada do VT, e é o que mantém
o EA fechado). Contagem exige estado, e verificação offline não conta nada. Então, na cópia literal, a
exigência 3 degrada de **imposta** para **declarada**, e o único teto que sobrevive é o que estiver
escrito dentro do bilhete.

**Além disso, o bilhete não serve como está.** O VT verifica offline porque o token é assimétrico
Ed25519 (`vt-link-token.ts:38-39`). A sessão do Portal é **simétrica**, com segredo compartilhado
(`portal-sessao.guard.ts:58`). Para a função verificar, ou ela recebe um segredo que também **cunha**
bilhete, o que é entregar a chave do portão a um processo fora do nosso perímetro, ou o bilhete do
Portal migra para Ed25519. Só a segunda é aceitável.

---

## 2. O Byte Passando Por Um Processo Nosso: Conflita Com O Envio Único?

**Não conflita com a decisão (c), e conflita com uma frase da carta.** A decisão do diretor foi entre
L-A (envio duplo) e L-B (envio único), e o critério era **quantos destinos o aparelho alimenta**. No
modelo do VT o aparelho continua enviando **uma vez, para um destino**. A função é um salto, não uma
segunda cópia saída do celular. A decisão (c) permanece cumprida.

O que deixa de ser verdade é a frase de `docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md:21-22`, "o arquivo não
passa pelo nosso servidor em nenhum momento". Passa por um processo nosso, dentro do Google. E o
critério geral que o próprio desenho fixou (`DESENHO-PORTAL-SEGURANCA.md`, seção 1, "proteção de arquivo
sai do nosso lado só na medida em que o byte não passa por nós") cobra o preço: com o relé, o teto de
tamanho, o tempo limite e a recusa de conteúdo hostil voltam a ser nossos **também no relé**, e não só
no leitor.

### Onde A IA Deve Ler: Na Nossa VM, No Leitor Isolado. Não Na Função.

Recomendação firme, e por quatro motivos, o primeiro deles medido:

1. **A função não tem nenhum dos limites que o `devops` construiu.** Medido: o decorador da função
   configura **memória e tempo, e mais nada** (`functions/main.py:315-319`). Não há usuário próprio, não
   há cgroup, não há faixa de rede negada, não há sistema de arquivos somente leitura. Comparado com a
   unidade `ea-portal-leitor.system.service:16-18` e `:44-60`, que traz usuário próprio,
   `ProtectSystem=strict`, `/home` inacessível e conjunto de capacidades vazio, a função é o ambiente
   **menos** contido dos dois.
2. **O processo que abre arquivo hostil seguraria a identidade de escrita do balde.** Hoje quem abre o
   arquivo não pode escrever no balde, e quem pode escrever não abre arquivo. Colocar a extração dentro
   da função funde os dois papéis no mesmo processo. É exatamente a separação que a exigência 1 existe
   para criar.
3. **A régua documental é nossa e muda toda semana.** Extração na função põe a régua num repositório
   fora do monorepo, fora do gate da §A.7 e fora da suíte de testes.
4. **Seria um terceiro lugar guardando PII**, sem nada que o justifique.

**Consequência de desenho, e ela é simples:** se houver função, ela é **relé burro**. Zero análise de
conteúdo, zero geração de PDF, zero leitura de página. Confere o bilhete, confere tipo e tamanho,
escreve sem sobrescrever, responde. As exigências 5, 6 e 10 ficam onde estão hoje, no leitor isolado,
que é onde foram auditadas.

---

## 3. O Limite De Corpo: O Modelo Exige URL Assinada De Qualquer Jeito

**O que foi medido:** 512 MB de memória, 60 s de tempo limite (`functions/main.py:315-319`), corpo
aceito só como JSON (`functions/main.py:327`), nenhum teto de corpo escrito no código.

**O que muda, e é ordem de grandeza.** O VT manda campos de formulário e a função gera um PDF de dezenas
de KB, que ela ainda devolve em base64 na resposta (`functions/main.py:388`). O Portal mandaria o
arquivo. Pelo teto vigente do Portal, 10 MB por arquivo (`portal-credencial.ts:33`), com JSON o arquivo
vira base64 e ganha cerca de 33 por cento, então um envio de 10 MB chega como cerca de 13,4 MB de texto,
e a função segura ao mesmo tempo a cadeia crua e os bytes decodificados. Uma requisição isolada cabe em
512 MB; várias ao mesmo tempo na mesma instância, não necessariamente. Seria preciso trocar JSON por
multipart, subir a memória e limitar a concorrência a uma requisição por instância. **Nada disso existe
no código do VT.**

**A parede que não se contorna com configuração é o TEMPO.** O limite de 60 s começa a contar quando a
requisição chega, e inclui o tempo de subida do aparelho. Um celular em 4G com uplink modesto leva mais
de um minuto para empurrar 10 MB, e o envio morre por tempo depois de o candidato esperar o minuto
inteiro. A escrita direta no armazenamento não tem essa parede: o carregamento para o Google não está
preso ao tempo de execução de função nenhuma.

**Não medido, e fica dito o que falta:** o teto de corpo da plataforma, tanto da função quanto do
encaminhamento do Hosting, não está escrito em nenhum arquivo do projeto do VT, e não há `gcloud` nesta
máquina para consultar a conta. Para medir: subir a função com o corpo em multipart, enviar um corpo de
10 MB pelo caminho real, e ler o código de recusa e o cabeçalho de limite que a plataforma devolver.
Antes disso ninguém pode prometer ao diretor que o celular consegue enviar arquivo por essa porta.

**Com todas as letras:** **para arquivo, o relé não serve, e a URL assinada volta.** Metade da economia
da carta evapora, porque URL assinada exige CORS no balde e uma identidade que assine, que são
justamente os itens 2 e 3 do pedido. **O que NÃO evapora, e é a economia que interessa, é a dependência
do Fernando:** com o balde em projeto nosso, o CORS e a identidade são nossos, configurados por nós, sem
carta. A economia real da troca nunca foi "sumir com a URL assinada", foi "sumir com a fila de espera".

---

## 4. Os 30 Dias: O Precedente Enfraquece O Veto E Abre Um Segundo Problema

Honestidade nos dois sentidos, como o diretor pediu.

**O precedente enfraquece o V1 em uma coisa, e essa parte é retirada.** Trinta dias com dado pessoal
dentro de um balde do Google já é prática da casa, aprovada pelo diretor e registrada no DIARIO como
infra de projeto próprio. Não dá para apresentar os 30 dias do Portal como invenção sem precedente,
porque não são. A parte do V1 que dizia "isto é inédito e por isso não passa" cai.

**O precedente não conserta nada, e abre um segundo problema, que é maior que o prazo.** Medido: o balde
do VT guarda, **no nome do objeto**, nome completo e CPF (`functions/main.py:204-206` e `:214-216`).
Nome de objeto aparece em listagem, em registro de acesso e em registro de auditoria, e é justamente por
isso que o Portal proibiu: `portal-credencial.ts:119-120` diz, por escrito, "o nome do objeto vai para o
log do Google", e `portal-credencial.ts:178-181` monta o nome a partir de identificador opaco com pepper
mais um sorteio, citando que já se viu CPF em nome de arquivo do Pandapé. **O Portal aprendeu a lição
que o VT está violando em produção.** Isso não é retenção longa demais, é PII no lugar errado, e vale
independentemente do prazo.

Some-se: o balde do VT não tem expurgo no fechamento, a identidade que escreve é `objectAdmin`, a que lê
é a unificada de Drive e Vertex, e o escritor sobrescreve sem trava. Não é um balde fora da régua contra
outro dentro: **são dois fora, e o do VT está pior, com o agravante de estar vivo.**

**A posição sobre o V1, reformulada, e ela fica mais fácil de cumprir, não mais difícil.** Deixa de
exigir a troca do número 30 pelo número 48. Passa a exigir três coisas:

1. **Expurgo ativo na confirmação.** É o que a §A.6 pede de fato, e a troca é o que finalmente o torna
   possível, porque a permissão de apagar passa a ser nossa. Ciclo de vida é rede de proteção, não
   política de retenção.
2. **O prazo do ciclo de vida é rede de proteção declarada**, registrada como exceção explícita pelo
   diretor no documento de desenho, com o motivo, e não implícita num número dentro de uma carta. O
   registro de memória do projeto sobre o prazo da staging mostra por que 48 h crus como rede de
   proteção têm efeito colateral conhecido: régua que fecha depois disso perde o prontuário em silêncio.
   Com o expurgo na confirmação existindo, a rede só alcança objeto abandonado, e um prazo maior deixa
   de ser retenção de dado útil.
3. **O mesmo tratamento se aplica ao balde do VT**, e isto é **item novo, separado desta frente**, com
   prioridade acima do prazo: tirar nome e CPF do nome do objeto, rebaixar o escritor para criador de
   objeto, trocar a leitura para conta dedicada, e ligar sobrescrita proibida. Enquanto isso não
   acontecer, o VT não serve de precedente para nada, ele é uma pendência.

---

## 5. O Veredito Da Troca, Lado A Lado

| ponto que interessa | balde novo do zero, URL assinada pelo EA | modelo do VT copiado ao pé da letra |
|---|---|---|
| superfície na internet | armazenamento do Google, mais duas rotas do EA atrás da barreira | hospedagem e função no Google, mais as rotas do EA se as cotas continuarem nossas |
| onde mora a chave de escrita | arquivo no cofre do backend: rotacionável, entregável, vazável | não existe como arquivo. Identidade de runtime, sem chave |
| alcance de quem escreve | um objeto, dez minutos, sem ler e sem listar (`portal-credencial.ts:102-104`, `:186-197`) | o balde inteiro, permanente. Literal do VT: lê, lista, sobrescreve e apaga |
| quem lê | conta dedicada, leitor isolado (`portal_bucket.py`) | copiado do VT: a credencial unificada, na instância da operação |
| o que o Fernando faz | criar o balde, CORS, duas contas, entregar duas chaves por canal seguro, antivírus | quase nada, **mas o antivírus dele deixa de alcançar o balde** |
| arquivo de 10 MB pelo celular | nativo, sem parede de tempo | parede de 60 s e teto de corpo não medido |
| exigência 2 | imposta pela assinatura, provada em teste | não imposta. Hoje o VT nem tenta |
| exigência 3 | imposta em transação | degrada para declarada |
| exigência 7, apagar o recusado | aberta, depende de concessão externa | **fecha**, vira self service |
| exigência 8, executar a prova | aberta, depende do balde existir | **executável esta semana** |
| se falhar | chave de escrita vaza: escreve em balde que ninguém publica. URL vaza: um objeto, dez minutos | função comprometida: o balde inteiro, mais o byte de todo mundo passando dentro dela |

### A Recomendação, E É UM Modelo Só

**Recomendado o HÍBRIDO, que não é meio termo e sim um desenho único: a INFRAESTRUTURA do VT com a
ESCRITA do Portal.**

- **Balde novo, em projeto nosso.** Nunca o balde do VT. Isto traz o ganho principal: IAM self service,
  exigência 7 fechada, exigência 8 executável, carta ao Fernando reduzida a uma pergunta.
- **A chave de escrita deixa de existir como arquivo**, que é a melhora real do VT. A assinatura V4
  passa a ser emitida **pela identidade de runtime**, por assinatura remota de blob, e não por chave
  privada guardada no backend do EA.
- **O arquivo NÃO entra na função.** O navegador recebe a URL assinada e escreve direto no
  armazenamento. Some a parede de 60 s, some o teto de corpo, e as exigências 2 e 10 continuam impostas
  pela assinatura, do jeito que já estão testadas.
- **O EA continua decidindo.** O navegador pede a nós, o EA aplica as travas de quantidade, soma, ritmo
  e extração exatamente como hoje (`portal-credencial.service.ts:198-231`), escolhe o nome opaco do
  objeto, o tipo e a faixa de tamanho, e emite um bilhete de uso único. A função só **converte bilhete
  válido em URL assinada**. A exigência 3 fica intacta, e o único item que sai do EA é a chave privada,
  que é o que se quis tirar de lá.
- **O bilhete migra para Ed25519**, como o do VT já é, para que nenhum processo fora da nossa VM segure
  um segredo capaz de cunhar bilhete.
- **A leitura continua nossa e isolada**: `portal_bucket.py` mais a unidade `ea-portal`, com conta
  dedicada de leitura. Nada de reusar `gcs.py`.

**Se o diretor preferir o relé puro mesmo assim**, o parecer é **VETADO para arquivo**, pelos motivos da
seção 3, e no máximo aceitável para arquivo pequeno, com um caminho de URL assinada como alternativa
acima de um limiar. Dois caminhos para o mesmo arquivo é duas superfícies para auditar, e não é
recomendado.

### As Sete Condições Da Troca, Todas Verificáveis

| # | condição | por quê |
|---|---|---|
| VS1 | escritor é criador de objeto, nunca administrador de objeto | o VT está em administrador hoje |
| VS2 | nome do objeto sem nome e sem CPF, opaco com pepper | `functions/main.py:204-206` contra `portal-credencial.ts:119-120` |
| VS3 | leitor dedicado, sem papel em Drive nem em Vertex. Não reusar `gcs.py` | `gcs.py:7-11` |
| VS4 | balde novo, jamais o do VT | a leitura do Portal enxergaria os formulários de VT |
| VS5 | escrita proibida de sobrescrever, imposta na assinatura | `functions/main.py:293` sobrescreve hoje |
| VS6 | antivírus: perguntar explicitamente quem varre balde em projeto nosso | a troca tira o balde do perímetro do Fernando |
| VS7 | se existir função, ela é relé burro, sem abrir o arquivo | `functions/main.py:315-319`, a função não tem nenhum limite do `devops` |

---

## 6. O Que Continua Valendo Do Parecer Anterior

A troca **não derruba** nenhum dos três vetos, e mexe em dois:

- **V1**, reformulado na seção 4: deixa de ser sobre o número e passa a ser sobre expurgo na confirmação
  mais exceção registrada. E ganha um item irmão, o balde do VT.
- **V2**, exigência 8: continua de pé, porque exige evidência, mas deixa de depender de terceiro.
- **V3**, `apps/ai-service/app/main.py:28`, roteador do portal montado também na instância da operação:
  **intocado pela troca, e a troca o torna mais urgente**, porque o modelo do VT põe ao lado um leitor
  que já vive exatamente nessa instância com a credencial unificada (`main.py:24`). A guarda que recusa
  servir o caminho do leitor quando o mesmo processo tem banco ou Drive configurados continua sendo
  condição de subida.

**Reauditar quando:** o modelo for escolhido e as sete condições estiverem escritas no desenho. O veto
cai contra evidência, nunca contra declaração.

---

## 7. Os Dois Itens Que Este Parecer Cria, E Que Não São Desta Frente

1. **Balde do VT fora da régua**, em produção: PII no nome do objeto, escritor com poder de
   administrador, leitor com a credencial unificada, sobrescrita sem trava, sem expurgo na confirmação.
   É frente própria, e a primeira alínea é a mais grave.
2. **Antivírus de balde em projeto nosso**: quem varre, e se ninguém varre, o que fazemos. Vale para o
   Portal e vale para o VT.

---

## 8. A Consolidação Do Coordenador: O Que Ele Reconferiu Com As Próprias Mãos

§A.39 passo 4: consolidar é conferir, não carimbar. Os quatro achados de maior consequência foram
reabertos pelo coordenador, no arquivo, depois do parecer:

| achado | conferido |
|---|---|
| **PII no nome do objeto do VT**, em produção | **CONFIRMADO.** `/home/henrique/vt-online-soulan/functions/main.py:204-206` monta o nome do objeto como o nome em maiúsculas, um espaço e o CPF de 11 dígitos sem máscara, e `:214-216` faz o irmão em JSON com o mesmo nome |
| **sobrescrita sem trava** na função do VT | **CONFIRMADO.** `functions/main.py:293` sobe o conteúdo sem `if_generation_match`, sobre nome determinístico |
| **escritor com poder de administrador** | **CONFIRMADO.** `/home/henrique/vt-online-soulan/README.md:85` e `:133` concedem `roles/storage.objectAdmin` à identidade de runtime |
| **limites da função**, 512 MB e 60 s | **CONFIRMADO.** `functions/main.py:315-319`, e o corpo é lido como JSON em `:327` |

**Nada foi construído nesta frente.** O parecer é avaliação, como o diretor pediu.
