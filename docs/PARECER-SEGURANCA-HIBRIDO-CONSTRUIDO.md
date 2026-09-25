# Parecer De Segurança: O Híbrido CONSTRUÍDO, Terceira Rodada

**VEREDITO NA EMISSÃO: VETADO. VEREDITO FINAL, APÓS A CORREÇÃO: APROVADO (seção 10).** O veto é estreito e cai com DOIS itens, ambos no mesmo arquivo. O
resto da frente passa: as seis condições estão cumpridas, o guard reescrito resistiu a todos os
ataques tentados, e a exigência 3 não degradou (medido, não declarado).

> **ESTADO ATUAL: ver a seção 10.** Os dois itens foram corrigidos na mesma rodada, com teste, e o
> coordenador conferiu. O corpo do parecer é mantido como emitido, porque o registro do que foi
> achado vale mais do que um documento reescrito.

| # | o que derruba o veto | onde |
|---|---|---|
| **V6** | **O EA aceita a URL que o emissor devolve SEM conferir nada**, e não exige transporte seguro para falar com ele. Conferir esquema, domínio, balde e nome do objeto na URL devolvida, recusar na divergência, e recusar endereço de emissor que não seja seguro. Com teste que prove a recusa de uma URL de outro domínio | `portal-emissor.service.ts:141-162` e `:66-68` |
| **V7** | **Emissor fora do ar queima cota do candidato sem deixar UM evento na trilha.** Registrar o evento de emissor indisponível antes de lançar a recusa, com o tipo novo no vocabulário fechado | `portal-credencial.service.ts:261-266` e `domain/portal-evento.ts:25-52` |

**Quem auditou:** agente `seguranca`, sem poder de escrita (§A.39). **Método:** adversarial, por
varredura e por execução, com arquivo e linha. **Régua:** §A.6, §A.11, §A.24, §A.33, §A.38, as seis
condições B1 a B6 e os vetos V1, V2, V3. **Data:** 18/09/2026. **Gravado pelo coordenador.**
**Gate conferido pelo próprio auditor, não aceito de terceiro:** a suíte do Portal, **195 testes em 15
arquivos, todos verdes**.

---

## 1. As Seis Condições, Uma A Uma

| # | condição | veredito | evidência |
|---|---|---|---|
| **B1** | o EA escolhe método, objeto e cabeçalhos, nada remontado nem completado em silêncio | **PARCIAL** | a IDA está cumprida e bem cumprida: `portal-armazenamento.service.ts:117-125` passa os cabeçalhos prontos de `domain/portal-credencial.ts:188-197`, sem acrescentar, remover nem reordenar, e eles viajam dentro do bilhete assinado (`portal-bilhete.ts:222-233`). A VOLTA é que não fecha: `portal-emissor.service.ts:147-154` confere os cabeçalhos devolvidos e **não confere a URL**, que é o campo que decide para onde os bytes vão. Ver a seção 5 |
| **B2** | identidade que assina é criadora de objeto e nada mais | **CUMPRIDA NO CÓDIGO** | destino separado por rota (`portal-emissor.service.ts:112`), o EA nunca pede leitura nem listagem por essa porta, e o método é fixo (`portal-armazenamento.service.ts:121`). A concessão de IAM é do diretor e não se prova por código. **V6 anula o efeito prático desta condição**, ver a seção 5 |
| **B3** | a remoção mora em identidade separada | **CUMPRIDA, com uma ressalva de texto** | o destino de remoção é próprio (`portal-armazenamento.service.ts:216-224`), e o destino entra na assinatura, então bilhete de escrita não apaga. A ressalva está na seção 6.2 |
| **B4** | bilhete de troca próprio, de um objeto só, com prazo absoluto igual ao da credencial | **CUMPRIDA** | `portal-bilhete.ts:63` tira o teto do limite do domínio, e `:228-229` CORTA tanto o prazo pedido quanto o absoluto nesse teto, dentro do código que cunha. Não é combinado com quem chama, é imposto. O bilhete de troca não lê nem menciona a chave da sessão, provado por varredura de fonte no teste do `tester` |
| **B5** | Ed25519 no guard, com algoritmo fixado | **CUMPRIDA** | `portal-sessao.guard.ts:111` recusa antes da conta da assinatura, `:73` recusa chave que não seja Ed25519, `:84` fecha sem chave. Oito caminhos de ataque tentados, nenhum abriu, ver a seção 2 |
| **B6** | o expurgo nunca assume que o objeto existe e nunca derruba o caminho | **CUMPRIDA** | `domain/portal-caminho-arquivo.ts:99-115`: só tenta apagar quando há metadado, a exceção morre ali (`:104-108`), a falha vira evento e o caminho segue. `portal-armazenamento.service.ts:212-235` nunca lança. Convive com o documento voltando a pendente por fora, e isso está escrito e testado |

---

## 2. O Guard Reescrito: Oito Ataques, Oito Recusas

Este era o ponto de maior risco da rodada, porque é autenticação, trocou de algoritmo e saiu do
serviço de token do framework. O auditor não se contentou com o teste do `tester`: rodou as primitivas
do Node contra as mesmas condições, para saber se a recusa vem do código ou da sorte da biblioteca.

| ataque | resultado | onde a porta fecha |
|---|---|---|
| bilhete simétrico forjado com a **chave pública como segredo**, cabeçalho declarando Ed25519 | **RECUSADO**. Medido: a verificação devolve falso, não lança | `:114` sobre chave Ed25519, e a conta simétrica não casa |
| algoritmo **ausente** no cabeçalho | **RECUSADO** | `:111`, antes de qualquer conta |
| algoritmo **trocado** | **RECUSADO** | `:111` |
| **tipo trocado** (um token de acesso do sistema) | **RECUSADO duas vezes**, pelo algoritmo em `:111` e pelo tipo em `:118` | |
| chave configurada que **não é Ed25519** | **RECUSADO** | `:73`, e medido: mesmo sem esse teste de tipo a verificação devolve falso, então `:73` é profundidade e não a única tranca |
| chave **ausente** | **RECUSADO**, rota fechada | `:80-84` |
| chave **ilegível** | **RECUSADO**, e não derruba o boot | `:69-76` |
| **token sem assinatura**, assinatura vazia, zerada, truncada ou ilegível | **RECUSADO** em todos | `:104` e `:114` |
| **queda para o segredo do sistema** | **NÃO EXISTE.** O guard não lê o segredo do sistema, não instancia o serviço de token e não tem ramo alternativo | arquivo inteiro |

**Fail-closed em todos os caminhos, confirmado.** E o que era bom não se perdeu: o bilhete continua
sem CPF e sem nome (`:39-48`), e a mensagem de recusa é única, sem dizer se o token expirou, foi
forjado ou é de outro tipo (`:95-98`).

**Uma observação para a frente de identidade, que não é desta entrega e não é veto:** o guard confere
que a expiração existe e está no futuro (`:121`), e **não impõe teto de duração**. Hoje não há emissor,
então não há dano. No dia em que ele nascer, um prazo de trinta dias passa por aqui sem que nada
falhe. O teto pertence a quem cunha, mas o guard é o único verificador, e a lição do B4 é exatamente
essa: teto que mora só em quem chama não é teto.

---

## 3. §A.6 No Caminho Novo: Provado Por Varredura

**Não persiste.** A tabela da cota tem objeto, tipo de conteúdo, bytes concedidos e expiração, e
**nenhuma** coluna de URL, bilhete ou token. A URL sai de `portal-credencial.service.ts:272-281` direto
para o navegador e não toca o banco em campo nenhum.

**Não loga.** As nove chamadas de log do módulo em produção, conferidas uma a uma:
`portal-emissor.service.ts:120` só destino e código de status; `:126` só o nome da classe do erro,
nunca a mensagem, que é onde a URL costuma vir; `:152` diz que a régua divergiu, sem nome e sem valor
de cabeçalho. `portal-armazenamento.service.ts:227` loga **só o prefixo** do objeto, que é o hash com
pepper da admissão (`portal-objeto.ts:25-27`), não um identificador reversível.
`portal-credencial.service.ts:578` loga formato e bytes, nada mais.

**O bilhete não carrega dado pessoal**, e isso é estrutural e não declarado: a lista de claims é
fechada em `portal-bilhete.ts:124-135` e o teste reprova claim novo que não passe por ela. Dos dez
claims, o único derivado de pessoa é o nome do objeto, que já nasce opaco. O bilhete também não é
persistido nem logado: é cunhado dentro da troca, viaja no corpo e morre no escopo da função.

**A trilha.** O campo de caminho saiu da allowlist, como pedido, e o evento de falha do expurgo carrega
só o código do tipo de documento e o motivo (`domain/portal-caminho-arquivo.ts:110-113`).

---

## 4. A Exigência 3 Não Degradou

**Confirmado por leitura direta, e a linha de base está travada por impressão digital.**
`portal-credencial.service.ts:198-231` está intocado: a trava de aviso, a leitura do consumo dentro da
trava, a régua pura e a inserção da linha continuam na mesma transação e na mesma ordem. A conversa com
o emissor está **fora** da transação (`:261`), depois do commit, que é onde ela tem de estar.

**Nada no caminho novo contorna a contagem**, e a prova é de varredura: a tabela continua com **um
único escritor** em todo o backend, e nem o cliente do emissor nem o serviço de armazenamento tocam
banco. As duas provas de corrida e de durabilidade continuam verdes **sem uma linha editada**, com o
hash conferido em teste, que é uma trava melhor do que a que o próprio auditor tinha pedido.

---

## 5. O Veto: O EA Confia Em Tudo O Que O Emissor Devolve

Duas rodadas olharam para o bilhete e para a chave. Esta olhou para a **volta**, e é lá que está o furo.

**O que o código faz.** `portal-emissor.service.ts:141-162` recebe o corpo do emissor, confere que a
URL não é vazia, confere os cabeçalhos devolvidos contra os pedidos, e **devolve a URL como veio**.
Varredura no módulo inteiro: **zero** verificações de domínio, de esquema e do nome do balde na URL.

**O ataque, e ele é curto.** O emissor é a peça exposta à internet, e o próprio desenho já sabia disso
(risco R2). Emissor comprometido, ou resposta adulterada em trânsito, devolve o endereço de um terceiro
com exatamente os mesmos cabeçalhos que pedimos. O EA aceita, o navegador do candidato envia **os
documentos de identidade dele para o terceiro**, a consulta de metadado depois diz que o objeto não
chegou, o documento continua pendente e o candidato **envia de novo**. Do ponto de vista do sistema,
nada falhou. É a forma exata do dano da §A.33: irreversível e silencioso.

**Por que isto não é preciosismo, e anula justamente a B2.** A condição B2 existe para que um emissor
comprometido, sendo só criador de objeto, **não consiga obter documento nenhum**: ele pode escrever no
balde e não pode ler. Redirecionar o envio é a única rota que lhe devolve os bytes do candidato, e ela
estava aberta. A linha de IAM que o parecer do mapa chamou de "um objeto de dez minutos contra o balde
inteiro" era contornada por um campo de texto numa resposta.

**E havia um segundo caminho para o mesmo dano, mais barato.** `portal-emissor.service.ts:66-68`
aceitava o endereço do emissor com qualquer esquema. Apontado para um esquema sem transporte seguro, o
bilhete, que é credencial, viajaria em claro e a resposta poderia ser trocada por quem estivesse no
caminho.

---

## 6. Os Três Pontos Que O `backend` Levantou

### 6.1 O Risco R3 Do Desenho Está Errado, E Ele Acertou Em Não Implementá-lo

**Concordo, e o comportamento atual é o certo.** Gravar a cota dentro da transação e assinar depois é a
escolha correta, e o argumento mais forte não é o que ele deu.

- **Chamada de rede dentro da trava é inaceitável.** Ela serializaria todos os pedidos daquele link
  atrás de um tempo limite de segundos, segurando uma trava do banco pela latência de um terceiro. Isso
  não degrada só a exigência 3, cria uma negação de serviço contra o próprio candidato.
- **Desfazer a linha na falha é pior do que perder a cota, por dois motivos.** O primeiro o `tester` já
  achou: emissor instável vira cota infinita. O segundo ninguém escreveu, e é de LGPD: se o emissor
  **assinou** e a resposta se perdeu no caminho de volta, o rollback deixaria uma URL viva para um
  objeto do qual o EA não guardou registro nenhum. Objeto no balde sem linha no banco é objeto que
  **ninguém consegue expurgar**, porque o caminho de volta do objeto para a admissão é justamente essa
  linha. Trocaríamos uma unidade de cota por um documento órfão.

**O mal certo é o atual: consumir cota e não entregar URL.** Uma indisponibilidade curta custa
tentativa, não o link.

**Mas a aceitação vem com a condição V7.** A falha do emissor lançava a recusa **antes** de qualquer
registro na trilha. Resultado: cota debitada, candidato barrado mais tarde por quantidade, e a Sala De
Segurança sem **um único evento** explicando por quê. Aceitar um dano é razoável; aceitar um dano
invisível não é.

**Correção de texto devida:** o R3 do desenho descrevia comportamento que não é o construído e que não
deve ser construído. Já foi emendado no documento.

### 6.2 O Evento Do Expurgo Sem O Prefixo: ESCOLHA CERTA

**Confirmo, e a ordem era do próprio auditor.** Num arquivo cuja razão de existir é manter o nome do
objeto fora da trilha, um campo de caminho é um convite, e a allowlist é a única coisa que separa a
trilha de virar depósito de PII. O prefixo continua indo para o log da aplicação, que é onde ele serve
para a varredura manual e onde não contamina a trilha consultável.

**Uma ressalva do mesmo arquivo.** O comentário de `portal-bilhete.ts:16-18` afirmava que quem roubar a
chave do bilhete consegue pedir ao emissor UMA escrita. **Não era o construído:** a mesma chave cunha
os quatro destinos, inclusive o de remoção. A separação de identidades vive no emissor, e a separação
de **credencial** não existe. O dano marginal é pequeno, porque quem tem a chave já está dentro do EA,
mas o comentário é a instrução que a próxima pessoa segue. **Corrigir o texto é obrigatório; uma
segunda chave para os destinos de curadoria fica PROPOSTA (§A.31), para quando o emissor for
construído, e não é condição de subida.**

### 6.3 O Prazo Absoluto Recalculado Do Relógio: ACEITÁVEL, E Corrigido Porque Era Barato

**Não é veto.** O teto está imposto onde tem de estar, no código que cunha (`portal-bilhete.ts:229`),
então nenhum bilhete pode carregar prazo maior que o do domínio, venha o que vier de quem chama. O
desvio residual era a duração da transação: milissegundos, alguns segundos sob disputa da trava. Não
afeta cota (já debitada), não produz segundo objeto (o nome é o mesmo e a trava de geração está dentro
da assinatura) e não engana o candidato.

**Ainda assim corrigido na mesma rodada, porque o valor exato estava ao alcance da mão:** a expiração
já gravada na linha estava no escopo, a três caracteres da chamada. Um prazo recalculado num lugar e
gravado em outro é a semente de divergência que a §A.27 existe para pegar.

---

## 7. O Que Ninguém Procurou, E O Auditor Foi Procurar

1. **A conferência de objeto divergente virou tautologia, e ninguém percebeu.**
   `domain/portal-chegada.ts:70-72` recusa quando o objeto do metadado difere do da credencial, e essa
   trava é descrita como o pior desfecho possível. Só que `portal-armazenamento.service.ts:156-161`
   passou a montar o metadado **com o nosso próprio objeto**: o campo deixou de vir da resposta e
   passou a vir de nós, então a comparação **nunca poderia falhar**. Sem isso, um emissor que responda
   sobre outro objeto confirma chegada que não houve, e o documento fica apontando para o vazio, que é
   a forma §A.33 do problema. **O contrato passou a exigir o eco do objeto consultado**, e a correção
   entrou nesta rodada.
2. **O corpo da resposta do emissor não tem teto de bytes.** A leitura do corpo não tem limite e não
   confere o tipo do conteúdo. O tempo limite continua armado durante a leitura, então o dano é
   limitado pelo relógio e não pelo tamanho. Esgotamento de memória de baixa gravidade.
   **Recomendação.**
3. **A comparação de cabeçalhos era feita contra o mapa pré-normalização.** O que viajou assinado é o
   normalizado, que baixa o nome para minúsculas e colapsa espaço. Hoje é inócuo, porque o domínio já
   emite tudo em minúsculas. No dia em que um cabeçalho nascer com maiúscula, a conferência reprovaria
   o emissor honesto. Falha fechada, então não era veto. **Corrigido nesta rodada.**
4. **O restante do tratamento de erro está bom, e isso merece ser dito.** Erro de status, falha de
   rede, corpo ilegível, corpo sem URL, marca de sucesso ausente e tempo limite terminam todos em nulo,
   e nulo significa recusa em todos os chamadores. Abster-se é o comportamento seguro, e ele é o padrão
   do arquivo inteiro, não a exceção.

---

## 8. Os Vetos Antigos: O Que Cai, O Que Fica, O Que Muda

| veto | estado | por quê |
|---|---|---|
| **V1**, expurgo ativo e o ciclo de vida como exceção registrada | **CAI NA PARTE DE CÓDIGO.** Fica condicionado à concessão de IAM | `portal-armazenamento.service.ts:212-235` apaga de verdade, pelo destino de curadoria, e a falha vira evento sem derrubar o caminho. O que falta não é código: é a permissão de remoção concedida à identidade de curadoria e o ciclo de vida configurado no balde, e nenhum dos dois se prova por código |
| **V2**, exigência 8, provar que quem assina não lê e não lista | **CONTINUA DE PÉ, e MUDA de natureza** | deixa de ser prova sobre uma conta de chave e passa a ser prova sobre a identidade de runtime do assinador. Continua sendo o item que impede a subida, e continua executável só contra o balde real |
| **V3**, roteador do leitor montado também na instância da operação | **CONTINUA, intocado** | conferido hoje: `apps/ai-service/app/main.py:28` segue montando o roteador do Portal na instância da operação. Condição de subida |
| **veto de saída do balde global de ritmo** | **CONTINUA** | `portal.controller.ts:18-24`, declarado pelos próprios autores e não tocado nesta frente |

---

## 9. O Que Reabre Este Parecer

O veto cai contra **evidência**, nunca contra declaração: a correção do V6 com o teste da recusa de URL
de outro domínio, e o evento do V7 aparecendo na trilha. Nenhum dos dois depende do balde, do emissor
ou da nuvem.

E fica dito, para não se vender melhora que não existe: mesmo com os dois corrigidos, o híbrido
continua **construído e verde, não provado**. As três provas que interessam (o Google aceita a
assinatura, a segunda escrita é recusada, a conta que assina não lê nem lista) só existem contra o
balde real, e a exigência 8 continua sendo o que impede a subida.

---

## 10. O Estado Depois Da Correção: O VETO CAIU

**VEREDITO FINAL: APROVADO.** O próprio auditor levantou o veto, contra evidência, depois de medir com
as mãos dele: 15 arquivos, **210 testes verdes**, typecheck com saída zero.

**V6, a URL: CAIU.** `urlDeEscritaConfere` (`portal-emissor.service.ts:96-116`) foi atacada com quinze
endereços hostis e nenhum passou: credencial escondida no nome do host, sósia por sufixo, o nosso nome
de objeto escondido num parâmetro de consulta, balde alheio no mesmo armazenamento, outro objeto no
nosso balde, esquema inseguro, travessia codificada, travessia crua e endereço sem esquema. **A
igualdade, em vez de "contém", é o que derruba o caso do parâmetro de consulta**, que é justamente o
que uma régua fraca deixaria entrar. A conferência entra depois dos cabeçalhos, com log mudo
(`:247-252`), e o cabeçalho passou a ser comparado contra o que **de fato foi assinado** (`:236-238`),
que era a recomendação 7.3.

**V7, a cota invisível: CAIU.** `PORTAL_EMISSOR_INDISPONIVEL` está no vocabulário fechado e entre os
tipos recusados (`domain/portal-evento.ts:48` e `:72`), e é registrado **antes** da recusa
(`portal-credencial.service.ts:279-284`), sem PII. O motivo do objeto órfão ficou escrito no ponto, que
é onde a próxima pessoa vai ler.

**A exceção de loopback do endereço do emissor: MANTIDA, e endossada pelo auditor.** Transporte seguro
é obrigatório, com exceção estreita para loopback literal, que é a mesma régua do navegador para
contexto seguro: ali o bilhete não sai da máquina. A fronteira foi testada e segura o que tem de
segurar, inclusive os domínios que só PARECEM loopback, e endereço inválido vira inerte em vez de
aberto. Exigir TLS até no servidor falso da suíte compraria zero segurança e custaria atrito.

**As três não bloqueantes, conferidas:** o prazo absoluto vem do instante **gravado** na linha, com o
relógio só como retaguarda e o teto de quem cunha intacto por trás; o comentário do bilhete passou a
dizer a verdade sobre a chave única que cunha os quatro destinos; e o **eco do objeto virou contrato**,
recusado quando ausente e usado na montagem do metadado, então a trava de objeto divergente deixou de
ser tautologia.

**A ressalva honesta que o `backend` fez e o auditor endossou:** o eco fecha o emissor distraído e a
resposta trocada, **não** o emissor comprometido, que pode ecoar o nome certo e mentir no tamanho e no
tipo. Quem limita esse caso é a condição B2, que é IAM e é do diretor, e é por isso que a exigência 8
continua sendo o que impede a subida.

### O Que Permanece Como Condição De Subida

Nenhuma é de código, e nenhuma é derrubável por teste na nossa máquina.

1. **V2, exigência 8:** provar, contra o balde real, que a identidade que assina **não lê e não lista**.
2. **V3:** `apps/ai-service/app/main.py:28` continua montando o roteador do leitor na instância da
   operação. Conferido, intocado.
3. **Veto de saída do balde global de ritmo:** `portal.controller.ts:18-24`.
4. **IAM concedido de fato, e separado:** assinador criador de objeto e nada mais (B2); curadoria com
   consulta, cópia e remoção, só neste balde (B3). Sem a segunda, o expurgo ativo não apaga e o V1 só
   está cumprido em código.
5. **Ciclo de vida de 30 dias** configurado no balde, como rede de proteção registrada.
6. **VS6, o antivírus:** pergunta ao Fernando, nunca feita.

**Proposto e NÃO construído (§A.31), para quando o emissor existir:** segunda chave para os destinos de
curadoria, já que hoje uma única chave cunha os quatro; e teto de bytes na leitura do corpo da resposta
do emissor, hoje limitado só pelo relógio.
