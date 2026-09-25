# Portal Do Candidato: O Modelo Híbrido

**Estado:** DESENHO. Nada construído nesta frente. O módulo do Portal inteiro segue em working tree,
não commitado.
**O que este documento fecha:** quem assina a URL V4 quando a chave privada sai do EA, e as seis
perguntas que o coordenador deixou abertas.
**Régua:** §A.6, §A.11, §A.14, §A.24, §A.31, §A.38, §A.39, mais as sete condições VS1 a VS7
(`docs/PARECER-SEGURANCA-TROCA-MODELO-VT.md`, seção 5) e os três vetos V1, V2, V3
(`docs/PARECER-SEGURANCA-PORTAL-CONSTRUIDO.md`, seção 5).
**Autoria:** agente `arquiteto`, sem poder de escrita (§A.39). Gravado pelo coordenador.
**Fronteira:** nada aqui toca `apps/backend/src/as/**` nem `apps/backend/src/pandape/**`.

---

## 1. A Pergunta Central: Quem Assina A URL V4

O EA roda na nossa VM e não tem identidade de runtime do Google. Toda URL V4 é uma conta de RSA sobre
uma string canônica, feita com a chave privada de uma conta de serviço. Tirar a chave do EA obriga a
mover **o ato de assinar**, não só o arquivo da chave.

Três caminhos foram avaliados.

| caminho | a chave some de verdade? | o que fica na nossa VM | alcance de quem roubar o que ficou |
|---|---|---|---|
| **A. Emissor no nosso projeto do Google** (recomendado) | **SIM**, a chave que assina URL deixa de existir como arquivo | uma chave Ed25519 que só **cunha bilhete** | pedir ao emissor UMA escrita, de um objeto, com tipo e faixa de tamanho que o **emissor** reimpõe |
| **B. Assinatura remota de blob pela API de credenciais do IAM** | **NÃO. Troca de chave, e para pior** | uma chave de conta de serviço, ou o segredo que assina a asserção da federação | assinar em nome da conta de escrita, mais cunhar token de acesso dela |
| **C. Manter a chave RSA no EA** (estado de hoje) | não | a chave que assina qualquer URL daquela conta | assinar qualquer método, qualquer objeto, qualquer cabeçalho, qualquer prazo, no balde inteiro |

### Por Que O B Não Elimina A Chave, E A Resposta É Honesta

A assinatura remota de blob não é anônima: para chamá-la o EA precisa provar ao Google **quem ele é**.
Sem identidade de runtime, sobram duas formas, e as duas deixam um segredo na VM.

1. **Chave de conta de serviço em arquivo.** É literalmente a mesma classe de segredo que se queria
   eliminar, agora com o papel de criador de token sobre a conta de escrita. Esse papel não concede
   apenas assinar: concede também **cunhar token de acesso** daquela conta. Quem roubar o arquivo passa
   a agir **como** a conta de escrita, e não só a assinar uma URL. É estritamente pior que hoje.
2. **Federação de identidade de carga de trabalho.** Parece sem chave, e não é: alguém tem de assinar a
   asserção que o EA apresenta ao Google, e esse alguém é o EA, com uma chave privada local ou um
   certificado local. O segredo muda de nome e de formato, não de lugar.

**Com todas as letras: o B não é elegível como forma de fazer a chave desaparecer.** Ele serve para não
guardar chave RSA dentro de um processo que já roda no Google, que não é o nosso caso.

### A Recomendação: O Caminho A, O Emissor

Um serviço pequeno **no nosso projeto do Google**, com identidade de runtime, que faz uma coisa só:
**converte bilhete válido em URL assinada**. Ele nunca recebe o arquivo (VS7, e o veto da seção 3 do
parecer da troca continua de pé: o byte não entra na função).

**O que o A muda de verdade, e é preciso ser exato para não vender melhora que não existe.** O EA
continua guardando **um** segredo, a chave Ed25519 do bilhete. O ganho não é "zero segredo", é
**rebaixamento de poder**:

| se vazar | hoje (chave RSA no EA) | com o emissor (chave do bilhete) |
|---|---|---|
| método | qualquer um, inclusive leitura e remoção | só o que o emissor aceita, e ele só assina escrita |
| objeto | qualquer caminho do balde | só um nome que casa com o formato opaco que o emissor exige |
| tamanho | qualquer um, inclusive 50 GB | teto reimposto pelo emissor, nunca acima de 10 MB |
| sobrescrita | permitida, basta omitir o cabeçalho | proibida, o emissor força a trava de geração |
| prazo | qualquer um, inclusive dias | teto reimposto pelo emissor, nunca acima de 10 minutos |
| desligar | rotacionar a chave no cofre e reimplantar | apagar a chave pública do emissor, e ele recusa tudo na hora seguinte |

**A linha que sustenta a tabela inteira: o emissor NÃO obedece ao bilhete, ele o CONFERE contra a
própria régua.** Tipo, teto de bytes, prazo, formato do nome do objeto e cabeçalhos obrigatórios são
**configuração do emissor**, e o bilhete só escolhe dentro do que já é permitido. Um emissor que assine
o que o bilhete mandar não rebaixa poder nenhum: apenas renomeia a chave, que é exatamente a crítica que
se faz ao caminho B.

---

## 2. As Peças, E Quem Guarda O Quê

| peça | onde roda | identidade | segredo que ela guarda |
|---|---|---|---|
| **EA backend** | nossa VM | nenhuma no Google | a chave **privada** Ed25519 do bilhete |
| **Emissor de escrita** (`ea-portal-assinador`) | nosso projeto do Google | conta de runtime própria | **nenhum**. Guarda a chave **pública** do bilhete |
| **Emissor de curadoria** (`ea-portal-curadoria`) | nosso projeto do Google | segunda conta de runtime | **nenhum**. Chave pública do bilhete |
| **Leitor isolado** (`ea-portal`) | nossa VM, unidade do `devops` | conta dedicada de leitura | **um arquivo de chave**, inevitável, ver abaixo |
| **Balde de entrada** | nosso projeto do Google | novo, jamais o do VT (VS4) | não aplicável |

**Duas contas de runtime e não uma, e o motivo é o da exigência 1.** O assinador precisa de criar
objeto e nada mais: ele não lê, não lista, não apaga. A curadoria precisa consultar metadado, corrigir
tipo de conteúdo e **apagar**, que é o conjunto que fecha a exigência 7. Juntar as duas numa conta só
faria a identidade que assina a credencial do candidato carregar, por tabela, o poder de apagar o balde.
*Variante aceitável se o diretor quiser menos infraestrutura: um serviço só, com uma conta que acumula
os dois conjuntos. O custo é exatamente esse, e fica dito.*

**A chave do LEITOR permanece um arquivo na VM, e isso é desenho, não esquecimento.** Ele precisa baixar
o objeto, e para baixar da nossa VM alguém tem de provar identidade ao Google: cai na mesma análise da
seção 1. O que se faz é limitar o dano: conta **dedicada**, papel de leitura **só neste balde**, sem
papel em Drive e sem papel em Vertex (VS3), arquivo em `/etc/ea-portal-leitor` com modo
`0640 root:ea-portal`, que é a correção (b) da seção 3 do parecer do Portal construído e precisa estar
feita **antes** de a chave chegar à máquina.

**O que some do EA:** as quatro variáveis de credencial do Google. O EA passa a não guardar **nenhuma**
chave do Google.

---

## 3. O Fluxo Ponta A Ponta, E Onde Cada Trava É Aplicada

```
NAVEGADOR            EA (nossa VM)          EMISSOR (nosso projeto)      BALDE            LEITOR (ea-portal)
   |                      |                          |                    |                     |
1  |--- pede credencial ->|                          |                    |                     |
2  |                  [TRAVAS]                       |                    |                     |
3  |                  [GRAVA A LINHA]                |                    |                     |
4  |                      |--- bilhete (60 s) ------>|                    |                     |
5  |                      |                     [REGUA PROPRIA]           |                     |
6  |                      |<-- URL assinada ---------|                    |                     |
7  |<-- URL + cabecalhos -|                          |                    |                     |
8  |------------------------- PUT do arquivo, uma vez so ---------------->|                     |
9  |--- avisa que subiu ->|                          |                    |                     |
10 |                      |--- bilhete metadado ---->|--- consulta ------>|                     |
11 |                  [CONFIRMA]                     |                    |                     |
12 |                  [marca AGUARDANDO_AUDITORIA]   |                    |                     |
13 |                      |------------------------- pede leitura ------------------------------>|
14 |                      |                          |                    |<-- baixa em memoria -|
15 |<-- campos, sugestao -|                          |                    |                     |
```

**Passo 1.** O navegador pede ao EA, com a sessão do candidato no cabeçalho. A admissão e o
identificador do link vêm do **token**, nunca do corpo (`portal.controller.ts:39-47`). Sem isso o
candidato trocaria de link a cada arquivo e a cota nunca se esgotaria.

**Passo 2, e é a exigência 3 inteira.** Continua **onde está hoje, sem uma linha de degradação**:
`portal-credencial.service.ts:198-231`, dentro da transação, com trava de aviso na chave do link, lendo
o consumo do banco dentro da trava e chamando a régua pura `emitirCredencialEscrita`
(`domain/portal-credencial.ts:141-169`). Tamanho, quantidade, soma, extrações e ritmo são decididos
**aqui**, antes de qualquer conversa com o Google. **O emissor não conta nada e não precisa contar**:
ele nunca é a porta de entrada, o navegador não fala com ele.

**Passo 3.** A linha de cota é gravada **dentro da mesma transação**. Ela é a cota; a URL é só
transporte. Nada disso muda.

**Passo 4.** O EA cunha o bilhete Ed25519, prazo de **60 segundos**, e chama o emissor. O bilhete
carrega: destino da rota, nome do objeto já escolhido por nós, tipo, bytes, prazo pedido, identificador
e expiração. **Não carrega dado pessoal**: o nome do objeto é opaco com pepper (`portal-objeto.ts`), e é
por isso que ele pode atravessar o registro de acesso de um terceiro.

**Passo 5, a segunda régua.** O emissor confere a assinatura do bilhete com a chave pública, e então
confere o **conteúdo** contra a própria configuração: tipo na lista, bytes dentro do teto, prazo dentro
do teto, nome do objeto casando com o formato opaco, balde igual ao configurado. Só então assina, e
**sempre** com os três cabeçalhos dentro da assinatura: tipo de conteúdo, faixa de tamanho e trava de
geração zero. Bilhete que pedir menos do que isso é recusado, não completado em silêncio.

**Passo 6 e 7.** A URL volta ao EA e do EA ao navegador. §A.6: ela **não é persistida e não é logada**,
nem no EA nem no emissor, e o emissor não registra corpo de requisição.

**Passo 8.** O navegador escreve direto no balde. Quem recusa tamanho, tipo e sobrescrita é o **Google**,
porque os três estão dentro da assinatura. Não há parede de 60 segundos e não há teto de corpo de
função: a parede que matava o candidato no 4G (seção 3 do parecer da troca) não existe neste caminho.

**Passo 9 a 11.** O navegador avisa, e **a palavra dele não vale nada**. O EA pede à **curadoria** o
metadado do objeto e decide com `confirmarChegadaObjeto` (`domain/portal-chegada.ts:63-84`): ausente,
divergente, tamanho ou formato. A independência continua cumprida, porque quem confirma **não é o
leitor**: é outro serviço, com outra identidade, que nunca abre o arquivo.

**Passo 12.** `marcarEntregue` escreve `AGUARDANDO_AUDITORIA`, nunca `ENTREGUE`
(`portal-credencial.service.ts:540-554`). Intocado.

**Passo 13 a 15.** O leitor isolado baixa **em memória**, sob orçamento de bytes, e devolve campos e
veredicto. Intocado.

---

## 4. Ponto 1: A Reprodução Do Bilhete

**O emissor é sem estado, verifica offline, e portanto o mesmo bilhete pode ser trocado por duas URLs.
Isto é ACEITÁVEL, e a razão não é conveniência.**

1. **As duas URLs apontam para o MESMO objeto.** O nome é escolhido pelo EA na emissão, com sorteio
   próprio, e viaja dentro do bilhete assinado. Reproduzir o bilhete não produz um segundo nome, nem um
   segundo lugar para escrever.
2. **A segunda escrita FALHA, e falha do lado do Google.** A trava de geração zero está dentro da
   assinatura: a primeira gravação cria a geração 1, a segunda é recusada. Isso não depende da nossa boa
   fé nem do emissor.
3. **A cota já foi consumida no passo 2.** Ela conta **credencial emitida**, não arquivo chegado, e
   conta no EA dentro de transação. Duas URLs para a mesma emissão não compram um byte de cota.
4. **O prazo é curto por construção.** O bilhete vale 60 segundos, porque a única viagem que ele faz é
   do EA ao emissor. A URL derivada tem o prazo limitado ao **menor** entre o pedido e o teto do emissor.

**O que sobra de risco, dito sem maquiagem:** quem interceptar um bilhete válido dentro dos 60 segundos
consegue uma URL para aquele objeto, e pode escrever lixo nele **antes** do candidato. O efeito é o
mesmo de interceptar a URL assinada de hoje, e termina em divergência de objeto ou de tamanho na
confirmação (passo 11), com o documento continuando pendente. **Não há perda de dado e não há
vazamento**: o bilhete não lê nada.

**A trava opcional, NÃO recomendada agora:** uso único no emissor, guardando o identificador por 60
segundos. Ela funciona e custa **estado** no emissor, ou seja, um banco pequeno, um segundo modo de
falha e a perda da propriedade que torna o emissor auditável numa sentença. Trocar um risco de 60
segundos, que já termina em recusa, por uma dependência permanente é mau negócio. **Fica proposto e não
construído (§A.31).**

---

## 5. Ponto 3: O Bilhete Em Ed25519, E Uma Correção De Premissa

**Correção, e ela muda o recorte da tarefa: há DOIS tokens, e a VS7 fala de um só.**

- **A sessão do candidato** (`portal-sessao.guard.ts`) é simétrica, com segredo compartilhado. Ela é
  emitida pelo EA e **verificada só pelo EA**. No modelo híbrido ela **nunca sai da nossa VM**: o
  navegador não fala com o emissor.
- **O bilhete de troca** é o token novo, que vai do EA ao emissor, e é **ele** que precisa ser Ed25519,
  exatamente pelo motivo escrito na VS7: o emissor roda fora da nossa VM e não pode segurar um segredo
  capaz de **cunhar** bilhete. Com chave pública ele só **verifica**.

**Então o que muda em `portal-sessao.guard.ts`: NADA, e mexer nele seria custo sem compra.** Tornar
assimétrico um token que só nós verificamos não fecha furo nenhum, e ainda acrescenta uma chave para
gerir. A VS7 fica **cumprida** pelo bilhete. *Se o diretor quiser a migração da sessão mesmo assim, por
uniformidade, o custo é trocar a verificação por Ed25519, criar uma chave nova e recusar explicitamente
algoritmo diferente. É meia hora, e não compra segurança enquanto o verificador for só nós.*

**O que dá para reusar de `vt-link-token.ts`, que é código validado e em produção:** a forma inteira do
token compacto, que já está provada ali: a codificação, o cabeçalho com o algoritmo, o carregador de
chave privada em base64 (`:86-91`), a assinatura e a verificação nativas (`:115` e `:140`), e a recusa
explícita de algoritmo inesperado (`:136`), que é a defesa contra confusão de algoritmo.

**Reusar COPIANDO a forma, não importando o arquivo, e isto é §A.26.** `vt-link-token.ts` é produção
validada do VT. Extrair dali um módulo compartilhado mexeria em código validado no meio de outra frente,
para economizar trinta linhas. **O bilhete nasce em arquivo próprio, `portal/portal-bilhete.ts`, com os
claims próprios dele.** A duplicação é deliberada e fica escrita no cabeçalho do arquivo novo.

**E uma diferença que não se copia:** o token do VT **carrega dado pessoal**, porque o app externo
precisa dele. O bilhete do Portal **não carrega nenhum**. O emissor não precisa saber de quem é o
arquivo, e não vai saber.

---

## 6. Ponto 4: O Expurgo Ativo Na Confirmação

**Quem apaga:** o serviço de **curadoria**, pela rota de remoção.
**Com qual identidade:** a conta de runtime `ea-portal-curadoria`, **sem chave**, com permissão de
apagar **só neste balde**. O EA não ganha permissão de apagar, ele ganha o direito de **pedir**, com
bilhete assinado e destino próprio. Bilhete de escrita não serve para apagar: o destino entra na
assinatura.
**Em que momento:** no mesmo ciclo, no ramo em que a chegada **não** se confirma e existe objeto
(`domain/portal-caminho-arquivo.ts:86-88`). Hoje essa porta já é chamada ali; o que muda é que ela passa
a apagar de verdade, em vez de `portal-armazenamento.service.ts:216-223` registrar e devolver falso.
**Se o apagar falhar:** **não derruba nada**. O caminho já decidiu o estado do documento antes, e a
falha vira evento de objeto não apagado, com **o prefixo do objeto**, nunca o envio exato (§A.6),
visível na Sala De Segurança. É o mesmo padrão da INT-4: falha ao notificar não desfaz o envelope, vira
ERRO no log. A rede de proteção de 30 dias pega o que ficou para trás.

**Os 30 dias passam a ser REDE DE PROTEÇÃO, e o V1 fica cumprido pela forma que o próprio parecer
pediu** (seção 4, três itens): o expurgo ativo existe, o ciclo de vida é **exceção registrada aqui**,
com o motivo, e não um número implícito dentro de uma carta. **O motivo, escrito:** com o expurgo na
confirmação funcionando, o ciclo de vida só alcança **objeto abandonado**, ou seja, credencial emitida e
envio que nunca chegou, ou envio cuja confirmação se perdeu. Prazo curto demais nessa rede tem efeito
colateral conhecido e medido na casa, o da staging que expira antes de a régua fechar e leva o
prontuário em silêncio.

**O que este desenho NÃO resolve, e o coordenador leva ao diretor em vez de a fábrica inventar
(§A.31):**

1. **O objeto que o LEITOR recusa** (`portal-credencial.service.ts:478-484`: senha, conteúdo ativo,
   páginas demais) hoje **não** é apagado. Apagá-lo agora criaria uma inconsistência real:
   `marcarEntregue` já rodou antes da leitura, então o documento ficaria `AGUARDANDO_AUDITORIA`
   apontando para um objeto que não existe mais, e o auditor abriria o vazio. Resolver exige **voltar o
   documento para PENDENTE**, e `documentos_admissao` é lido pela Auditoria, pelo Gerenciador, pela
   Esteira e pelos KPIs de pendência: é alcance de §A.26, e é decisão do diretor, não da fábrica.
   **Enquanto não for decidido, esse objeto fica para a rede de 30 dias.**
2. **O objeto do documento que foi auditado e arquivado** no prontuário do Drive. O expurgo natural dele
   é o arquivamento, que é da F2 e não desta frente. Também fica para a rede, e é o segundo motivo pelo
   qual a rede não pode ser curta.

---

## 7. Ponto 5: O Que Fica Inerte Sem Configuração

O padrão da casa é o do webhook do Pandapé: **sem credencial a rota nasce fechada, e o serviço sobe
assim mesmo**. O módulo do Portal já sobe inerte hoje, e continua subindo, com as portas trocadas.

| falta | o que acontece | onde |
|---|---|---|
| `PORTAL_GCS_BUCKET` | emissão e confirmação desligadas, rota responde indisponível | `portal-armazenamento.service.ts:70-77` |
| `PORTAL_EMISSOR_URL` ou a chave do bilhete | idem, e é a substituta direta da conta de escrita de hoje | serviço novo, mesma forma do carregador que devolve nulo |
| `PORTAL_LOG_PEPPER` | a emissão lança indisponível **antes** de qualquer chamada externa | `portal-credencial.service.ts:67-73` |
| `PORTAL_SESSION_PUBLIC_KEY` | o guard lança, sem queda para o segredo do sistema | `portal-sessao.guard.ts:67`. *O nome mudou na construção: com a migração para Ed25519 (condição B5), o guard passou a carregar uma CHAVE PÚBLICA, e não mais um segredo compartilhado* |
| `PORTAL_LEITOR_URL` ou `PORTAL_LEITOR_TOKEN` | documento confirmado, sugestão nula, candidato digita | `portal-leitor.service.ts:123-125` |
| `PORTAL_BUCKET` no leitor | o caminho de leitura responde indisponível | `routers/portal.py:81-85` |

**Três regras que a construção não pode afrouxar:**
1. **Nenhuma exceção no boot.** Carregar chave ausente devolve nulo, nunca lança, exatamente como
   `carregarChavePrivadaVt`.
2. **Sem hardcode e sem melhor esforço.** Não existe endereço de emissor padrão, não existe balde
   padrão. Emissor não configurado é recusa, não é tentativa.
3. **Inerte é ESTADO TESTADO, não intenção.** Entra teste que sobe o módulo com o ambiente vazio e
   afirma a recusa, junto do que já existe.

---

## 8. Ponto 6: As Variáveis De Ambiente

**ENTRAM, no backend:**

| variável | o que é |
|---|---|
| `PORTAL_EMISSOR_URL` | endereço do serviço de escrita e de curadoria no nosso projeto |
| `PORTAL_EMISSOR_BILHETE_PRIVATE_KEY` | chave privada Ed25519, PEM PKCS8 em base64, **mesmo formato de `VT_LINK_PRIVATE_KEY`** |
| `PORTAL_EMISSOR_KID` | identificador da chave, para rotação sem janela. Opcional, vazio significa chave única |
| `PORTAL_EMISSOR_TIMEOUT_MS` | tempo limite da chamada. Opcional, padrão curto |

**SAEM, do backend, e o desaparecimento delas é a entrega desta frente:**

- `PORTAL_GCS_ESCRITA_SA_EMAIL` e `PORTAL_GCS_ESCRITA_PRIVATE_KEY` (`portal-armazenamento.service.ts:57-58`)
- `PORTAL_GCS_LEITURA_SA_EMAIL` e `PORTAL_GCS_LEITURA_PRIVATE_KEY` (`:64-65`)
- `PORTAL_GCS_REGIAO` (`:52`), que passa a ser configuração do emissor, onde a região de fato importa

**MUDA DE SIGNIFICADO:**

- `PORTAL_GCS_BUCKET` deixa de ser "o balde para o qual assinamos" e passa a ser "o nome que mandamos ao
  leitor e o interruptor de inércia". **O balde autoritativo passa a ser o do emissor**, e apontar esta
  variável para outro lugar não faz o EA escrever em outro lugar: faz o emissor recusar. É rebaixamento
  de poder de uma variável de ambiente, e é bom que seja.

**NÃO MUDAM:** `PORTAL_LOG_PEPPER`, `PORTAL_LEITOR_URL`, `PORTAL_LEITOR_TOKEN`, `PORTAL_DIAS_IP_COMPLETO`,
e todas as do leitor.

**TROCA DE NOME E DE NATUREZA:** `PORTAL_SESSION_SECRET` vira `PORTAL_SESSION_PUBLIC_KEY`, por causa da
condição B5. Deixa de ser segredo compartilhado e passa a ser chave pública Ed25519. Quem configurar o
nome antigo não liga nada, e a rota continua fechada: é inércia, não regressão.

**Configuração do emissor, fora do repositório:** chave pública do bilhete (uma ou duas, para rotação),
nome do balde, região, teto de bytes, teto de prazo, lista de tipos aceitos e o padrão do nome do
objeto. **Tudo isso é régua do emissor, não do bilhete**, que é o que sustenta a seção 1.

---

## 9. As Sete Condições Da Troca, Onde Cada Uma É Cumprida

| # | condição | onde este desenho a cumpre |
|---|---|---|
| VS1 | escritor é criador de objeto, nunca administrador | conta de runtime do assinador só cria objeto. A curadoria é a **outra** conta |
| VS2 | nome do objeto opaco, com pepper | já cumprido, `portal-objeto.ts`, e o bilhete não carrega dado pessoal |
| VS3 | leitor dedicado, sem Drive e sem Vertex, não reusar `gcs.py` | mantido, `portal_bucket.py`, mais a correção do comentário (seção 11) |
| VS4 | balde novo, jamais o do VT | condição de criação, e o leitor já tem allowlist de um balde só (`routers/portal.py:88-93`) |
| VS5 | sobrescrita proibida dentro da assinatura | a trava de geração vem do domínio e é **reimposta** pelo emissor |
| VS6 | antivírus: perguntar quem varre balde em projeto nosso | **continua aberta**. Não é resolvível por desenho, é pergunta ao Fernando |
| VS7 | se existir função, é relé burro, sem abrir o arquivo | o emissor assina, confere metadado e apaga. **Nunca recebe nem abre o arquivo** |

---

## 10. Riscos, E O Que Cada Um Quebra

| # | risco | o que quebra | mitigação neste desenho |
|---|---|---|---|
| R1 | **Emissor que obedece ao bilhete em vez de conferir** | a chave só muda de nome, o caminho A vira o caminho B e o parecer se aplica inteiro | régua própria no emissor, e o teste dela é condição de subida |
| R2 | **O emissor fica de pé na internet** | ele é o que autoriza escrita no nosso balde; sem bilhete válido vira escrita aberta | fail-closed sem chave pública, bilhete obrigatório, destino dentro da assinatura, prazo de 60 s |
| R3 | **Terceira dependência externa no caminho do candidato** | emissor fora do ar significa nenhum envio, e o EA continua de pé mostrando erro | tempo limite curto e recusa clara. **CORRIGIDO na construção, e a correção é o oposto do que este risco dizia:** a linha de cota **É** gravada antes da chamada ao emissor, dentro da transação, e **não** é desfeita quando o emissor falha. Desfazer transformaria emissor instável em cota infinita, com dezenas de pedidos e nada consumido. O achado é do `tester` |
| R4 | **A prova em teste da exigência 2 sai do repositório** junto com `gcs-assinatura-v4.spec.ts` | perde-se a prova de que tipo, tamanho e não sobrescrita estão **dentro** da assinatura, que é o teste mais valioso do módulo | os três cabeçalhos continuam nascendo em `domain/portal-credencial.ts:186-197`, com o teste que já existe, mais um teste de contrato afirmando que o bilhete os carrega. **A prova de que o Google os impõe só existe contra o balde real** |
| R5 | **Antivírus, VS6** | arquivo enviado da internet por gente de fora deixa de ser varrido, e ninguém percebe | nenhuma. **É pergunta ao Fernando** |
| R6 | **V3 continua aberto**, roteador do leitor montado na instância da operação (`ai-service/app/main.py:28`) | uma variável no lugar errado desfaz a exigência 4 em silêncio, e o híbrido põe ao lado um modelo que normaliza isso | fora do escopo deste desenho, **é condição de subida e continua pendente** |
| R7 | **Balde global de ritmo**, `portal.controller.ts:18-24` | tudo chega da barreira como um IP só, então um limite por rota derruba o portal inteiro | fora do escopo deste desenho, **veto de saída que continua de pé** |
| R8 | **Rotação da chave do bilhete** | trocar a chave sem identificador derruba os envios entre o reimplante do emissor e o do EA | o emissor aceita **duas** chaves públicas, e o bilhete declara qual usou |

---

## 11. A Lista Ordenada De Mudanças

### 11.1 Backend, `apps/backend/src/`, na ordem de execução

| # | arquivo | ação |
|---|---|---|
| 1 | `portal/portal-bilhete.ts` | **NOVO**, puro. Cunha e confere o token Ed25519 do bilhete. Claims: destino, balde, objeto, tipo, bytes, prazo, identificador, emissão, expiração de 60 s, identificador de chave. **Zero dado pessoal.** Copia a forma de `vt-coleta/vt-link-token.ts` **sem importar nem alterar aquele arquivo** (§A.26) |
| 2 | `portal/portal-bilhete.spec.ts` | **NOVO**. Ida e volta, adulteração de cada claim, expirado, algoritmo trocado, e a afirmação de que nenhum claim é dado pessoal |
| 3 | `portal/portal-emissor.service.ts` | **NOVO**. Cliente do emissor. Inerte sem endereço ou sem chave, tempo limite próprio, **não loga bilhete, não loga URL, não loga nome de objeto** |
| 4 | `portal/portal-emissor.spec.ts` | **NOVO**. Inércia, tempo limite, erro do emissor vira recusa, e a prova de que URL e bilhete não aparecem em log |
| 5 | `portal/portal-armazenamento.service.ts` | **EDITA**. As quatro operações trocam de corpo e **mantêm a assinatura**: assinar escrita, consultar metadado e corrigir tipo passam pelo emissor; apagar objeto **passa a apagar de verdade**. Somem os carregadores de credencial (`:55-67`) |
| 6 | `portal/gcs-assinatura-v4.ts` e `gcs-assinatura-v4.spec.ts` | **REMOVE**. A assinatura V4 sai do EA junto com a chave. Remover, e não deixar morto: arquivo com carregador de chave privada parado no repositório é convite para alguém religá-lo. **Custo real, ver R4.** Barato agora porque nada disto está commitado |
| 7 | `portal/portal-credencial.service.ts` | **EDITA, pouco e de propósito**. Só o ponto de chamada de assinar escrita (`:257-263`) e a porta de apagar (`:569-571`), que passa a propagar o resultado. **O bloco `:198-231` NÃO é tocado**: a contagem em transação é o que a exigência 3 tem de mais caro |
| 8 | `domain/portal-caminho-arquivo.ts` | **EDITA**. Apagar objeto passa a devolver booleano e a falha vira evento próprio. A ressalva escrita em `:82-85`, de que ninguém tem permissão de apagar, deixa de valer e sai |
| 9 | `domain/portal-evento.ts` | **EDITA**. Registra o tipo novo no vocabulário fechado, e aproveita para remover o campo `caminho` da allowlist (`:128`), que a auditoria anterior pediu enquanto ninguém o usa |
| 10 | `portal/portal.module.ts` | **EDITA**. Provedor novo |
| 11 | `portal-corrida.spec.ts`, `portal-durabilidade.spec.ts`, `portal-leitor.spec.ts` | **CONFERE**. Devem continuar verdes **sem alteração**. Qualquer um deles precisar mudar é sinal de que a exigência 3 degradou, e é motivo de parar |

### 11.2 IA, `apps/ai-service/app/`

| # | arquivo | ação |
|---|---|---|
| 1 | `portal_bucket.py` | **EDITA SÓ DOCUMENTAÇÃO, e não é cosmético.** A linha `:10-11` afirma que o leitor usa a credencial unificada de Drive e Vertex: **o código não usa, e o comentário é a instrução que a próxima pessoa segue** para violar a VS3. A linha `:20` afirma que o nome do objeto carrega dado pessoal: **é falso**, o nome é opaco com pepper |
| 2 | o resto do leitor | **NENHUMA MUDANÇA.** O leitor não sabe que o emissor existe, não fala com ele, e continua lendo em memória com a conta dedicada. É a prova de que o híbrido é uma troca de **quem assina**, não de arquitetura de leitura |

### 11.3 Fora Do Repositório, No Nosso Projeto Do Google

| # | item | observação |
|---|---|---|
| 1 | **Balde de entrada novo**, acesso público bloqueado, acesso uniforme no nível do balde, registro de acesso ligado | VS4. Jamais o balde do VT |
| 2 | **CORS** liberado só para o domínio do portal, escrita e verificação prévia, com os três cabeçalhos assinados na lista | sem isso o envio quebra **em silêncio** no navegador |
| 3 | **Ciclo de vida de 30 dias** | rede de proteção, com o motivo registrado na seção 6 |
| 4 | **Conta `ea-portal-assinador`**: criar objeto no balde, mais permissão de assinar em nome de si mesma | não lê, não lista, não apaga |
| 5 | **Conta `ea-portal-curadoria`**: consultar, criar e apagar objeto **só neste balde** | é ela que fecha a exigência 7 |
| 6 | **Conta `ea-portal-leitor`**: leitura **só neste balde**, sem Drive e sem Vertex | a chave desta vai para `/etc/ea-portal-leitor`, `0640 root:ea-portal`, **antes** de a chave chegar |
| 7 | **Serviço do assinador**, rota de assinar escrita | régua própria, R1 |
| 8 | **Serviço da curadoria**, rotas de metadado, correção de tipo e remoção | nunca abre o arquivo, VS7 |
| 9 | **Repositório próprio do emissor**, com os testes da régua | não entra no monorepo, e isso é consequência assumida do R4 |
| 10 | **A prova da exigência 8** | tentar leitura e tentar listagem com a conta do assinador, registrar as duas recusas e anexar ao parecer. **É o que derruba o V2** |

---

## 12. O Que Dá Para Construir E PROVAR Agora, E O Que Só Fecha Com O Balde

### Provável hoje, sem balde, sem emissor e sem nuvem

| o que | como se prova |
|---|---|
| **O bilhete Ed25519** | teste de ida e volta, adulteração, expiração e algoritmo trocado. Prova completa, não depende de nada externo |
| **A chave RSA sumiu do EA** | varredura devolvendo **zero** ocorrência das quatro variáveis de credencial no repositório, e a assinatura RSA ausente do módulo. É medida, não declaração |
| **A contagem na emissão não degradou** | `portal-corrida.spec.ts` e `portal-durabilidade.spec.ts` verdes **sem edição** |
| **A inércia** | módulo sobe com ambiente vazio e as rotas recusam |
| **A forma do caminho com o expurgo** | teste do orquestrador com porta falsa: apaga no ramo certo, e a falha ao apagar vira evento sem derrubar o caminho |
| **O cliente do emissor** | contra um servidor falso local: tempo limite, erro, e a ausência de URL e bilhete no log |

### NÃO provável hoje, e ninguém deve prometer ao diretor

| o que | por quê |
|---|---|
| **Que o Google aceita a URL que o emissor assina** | assinatura V4 só se prova contra o armazenamento real. Enquanto não houver balde, tudo o que temos é uma string que **parece** certa |
| **Que a segunda escrita é recusada**, que é a trava do ponto 4 | mesma razão. O raciocínio é sólido e **não é medida** |
| **Que o teto de tamanho é imposto pelo Google** | o cabeçalho de faixa só é exercido em envio real |
| **Que a conta de escrita não lê e não lista** (exigência 8, veto V2) | exige balde e conta. **É o item que impede a subida, e continua impedindo** |
| **Que o candidato no 4G envia 10 MB** | exige CORS configurado e um aparelho de verdade |
| **Que a separação de papéis foi de fato concedida** | IAM não se prova por desenho |
| **Que alguém varre o balde por vírus** (VS6) | pergunta não feita |

**A frase honesta:** o híbrido é construível e testável agora **até a borda da nuvem**, e a borda é
exatamente onde moram as três provas que interessam. O que se entrega é **o caminho pronto e verde**,
não o caminho **provado**.

---

## 13. O Que Este Desenho NÃO Resolve, E Segue Pendente

1. **VS6, o antivírus.** Balde em projeto nosso sai do perímetro do Fernando. Pergunta, não desenho.
2. **V3**, roteador do leitor montado na instância da operação. Condição de subida.
3. **O balde global de ritmo**, `portal.controller.ts:18-24`. Veto de saída declarado pelos autores.
4. **O objeto recusado pelo LEITOR**, seção 6, item 1. Decisão do diretor, porque alcança
   `documentos_admissao`.
5. **O expurgo do objeto já arquivado no prontuário.** É da F2.
6. **O balde do VT fora da régua**, frente própria, com plano em `docs/PLANO-CORRECAO-BALDE-VT.md`.
