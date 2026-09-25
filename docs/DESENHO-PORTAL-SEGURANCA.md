# Portal Do Candidato: Desenho De Segurança, Versão 3

**Estado:** DESENHO. Nada construído, nada commitado, nenhum arquivo do app tocado.
**Arquitetura:** link externo, **barreira do Fernando**, EA. O arquivo do candidato vai **direto para a
nuvem do Google**, e a **IA lê no momento do upload** e auto-preenche. O EA nunca fica exposto direto na
internet e nunca guarda o arquivo.
**Régua:** §A.38 (o `seguranca` lidera), §A.39, §A.11, §A.24, §A.23, §A.31.

| Anexo | Autor | O que traz |
|---|---|---|
| `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md` | `seguranca` | as três leituras do modelo, a Camada U reclassificada, a **Camada G** que nasce, a divisão, 13 vetos |
| `docs/DESENHO-PORTAL-SALA-DE-SEGURANCA.md` | `arquiteto` | o painel, os eventos novos, a terceira zona de cobertura, a postura medível |
| `docs/DESENHO-PORTAL-CAMINHO-DO-ARQUIVO.md` | `arquiteto` + `ia`, auditado pelo `seguranca` | o caminho concreto do arquivo e da IA, o veredito vetado com concessão, as dez exigências |

---

## 0. Decisões Do Diretor, 18/09/2026: Tomadas E Fechadas

Este bloco fecha as decisões que este documento aguardava. O que está aqui **não se reabre**, e o
restante do documento deve ser lido com ele na frente.

| # | Decisão | Efeito |
|---|---|---|
| a | **Direção APROVADA**: envio único, gravar primeiro e ler depois, leitor separado | o caminho do arquivo sai de proposta e vira o desenho vigente |
| b | **As dez exigências AUTORIZADAS** como parte da construção | não são refinamento posterior, entram no escopo da frente |
| c | **ENVIO ÚNICO, não duplo** (a L-B), e a IA lê **em memória** | encerra a pergunta da seção 1, que **NÃO vai ao Fernando**. O `seguranca` reverteu a recomendação do envio duplo porque ela não comprava segurança: duplicar o byte duplica a superfície e não reduz risco nenhum |
| d | **As três perguntas do arquivo reprovado depois de gravado VÃO NA CARTA** ao Fernando | é infraestrutura dele, e por isso sai da lista de decisão da fábrica |
| e | **Os cards novos do painel ficam como proposta** | o diretor valida depois, e eles **não travam** a construção agora (§A.31) |

**O que a decisão (c) NÃO dispensa, e é o ponto que mais fácil se perde:** o **teto de tamanho**
continua sendo nosso. Ele não some com o envio único, ele **muda de lugar** e passa a viver **dentro
do que é assinado** na credencial de escrita, que é exatamente a exigência 2. A tabela de furos da
seção 5 já dizia isso, e continua valendo.

---

## 1. A Pergunta Que Decidia Metade Do Cardápio: DECIDIDA, É O Envio Único

**DECIDIDA pelo diretor em 18/09/2026, leitura L-B, e NÃO vai ao Fernando** (decisão (c) da seção 0).
O texto abaixo é mantido como registro de como a escolha foi feita, e não como pergunta aberta.

O modelo novo tira muita coisa do nosso escopo, e isso é real. Mas a frase "o arquivo não toca o nosso
servidor" e a frase "a IA lê na hora, no fluxo do upload" só são as duas verdadeiras dependendo de **por
onde os bytes passam**. A pergunta, nestes termos:

> **O byte do arquivo passa, em algum momento, por um processo nosso?**

| Leitura | Como é | O que muda |
|---|---|---|
| **L-A**, envio duplo | o navegador manda para o Google **e** manda uma cópia para o nosso leitor, que lê em memória e descarta | o arquivo não é **guardado** por nós, mas é **processado**. **O teto de tamanho continua nosso**, e o risco vira exploração do leitor |
| **L-B**, lemos de lá | o navegador manda só para o Google e nós baixamos no mesmo ciclo | mesma coisa da L-A quanto ao teto, e contraria a frase "a IA não busca depois no Google", ainda que em segundos |
| **L-C**, tudo no Google | a extração roda lá dentro e só os campos voltam | **aqui sim as proteções de arquivo saem de verdade**, e em troca a IA deixa de viver no Portal |

**Recomendação original da fábrica, SUPERADA pela decisão (c): L-A.** É a única que cumpre as duas frases funcionais sem reinterpretação, e
mantém no EA a régua documental, que muda toda semana e é nossa por desenho. Na L-C, cada ajuste de régua
vira chamado de infraestrutura. O que a L-C economizaria custa em torno de 2 dias e reusa código que já
está em produção.

**A recomendação foi REVERTIDA pelo `seguranca` e o diretor decidiu a L-B, envio único.** O envio
duplo mandaria o mesmo byte para dois destinos, e o segundo destino é um processo nosso: ele acrescenta
uma superfície de exploração e não retira nenhuma, porque o teto de tamanho continuaria nosso de todo
jeito. Pagar superfície sem comprar proteção é o contrário do que o desenho existe para fazer.

**O critério geral, que vale para qualquer resposta, inclusive uma quarta que ninguém previu:** proteção
de arquivo sai do nosso lado **só na medida em que o byte não passa por nós**. Armazenar e processar são
coisas diferentes.

**O que não pode acontecer:** a fábrica supor uma leitura e o Fernando supor outra. O item que cai no vão
é justamente o teto de tamanho.

---

## 2. O Que Saiu Do Escopo Da Fábrica, De Verdade

Com o arquivo no Google, **saem e não voltam**: o antivírus do nosso lado, a guarda do arquivo, a
retenção do binário, a staging local, o expurgo, o prazo de 48h do arquivo, o dilema memória contra
disco, e o nome do arquivo em disco. Sete itens da camada de upload saem inteiros na L-C, três saem em
qualquer leitura. A varredura do arquivo e a checagem das máquinas que baixam depois são do Fernando e do
Google.

---

## 3. O Que NASCEU Com O Modelo Novo, E É Onde Um Desenho Ruim Deixaria Buraco

Parece que só se removeu coisa. Não é. O `seguranca` abriu uma camada nova, a **Camada G**, com seis
itens, e o primeiro é o mais perigoso do documento inteiro:

1. **Quem autoriza a escrita no Google.** O navegador do candidato só escreve se alguém lhe der uma
   credencial, e **quem emite é o EA**. Uma credencial ampla é **permissão de escrita aberta no nosso
   armazenamento**. Ela tem de ser de objeto único, com nome escolhido por nós, prazo de minutos, só
   escrita, sem sobrescrita, **com tamanho e tipo embutidos na própria assinatura** (é assim que o teto
   de tamanho volta, mesmo na L-C), e emitida só depois da identificação.
2. **A credencial não pode ler nem listar.** Esse é o vazamento em massa deste modelo: uma chave que
   lista o armazenamento entrega os documentos de todo mundo.
3. **O caminho de volta.** O EA precisa **confirmar do lado do servidor** que o arquivo chegou. Se
   acreditar no "subi" do navegador, ele mente, e o documento fica marcado como entregue sem existir.
4. **Onde o arquivo cai**, em área de entrada separada do prontuário, com retenção declarada e regra de
   quem enxerga.
5. **O que a IA extrai é sugestão e nunca dado final.** Este item subiu de importância: virou a única
   coisa que olha o conteúdo do nosso lado.
6. **O risco do leitor**, nas leituras L-A e L-B: limite de tamanho, de páginas e de dimensão, tempo
   máximo de processamento, processo isolado, recusa de arquivo com senha e de conteúdo ativo.

**Precedente que já existe na casa, e vale citar ao Fernando:** o formulário de VT já faz um app externo
depositar PDFs num bucket do Google, e o EA varre esse bucket depois (`vt-coleta`, com o bucket em
configuração). É o parente mais próximo do que se vai construir, e a pergunta de como aquele app é
credenciado já tem resposta prática do nosso lado.

---

## 4. A Divisão Atualizada

**DO FERNANDO E DO GOOGLE:** a barreira, o antivírus e a varredura do arquivo, a checagem das máquinas
que baixam, o armazenamento em si e a sua configuração, o subdomínio, o certificado, o proxy fail-closed,
o isolamento de rede, o teto de corpo na borda, o tempo limite, o rate limit por IP real e o cabeçalho
com o IP real.

**DA FÁBRICA:** o link (individual, prazo de 72h, **revogável**), a identidade (CPF e nascimento, com o
CPF preso ao link), as tentativas (5 por 15 minutos, bloqueio progressivo, válvula de recuperação), **a
credencial de escrita e tudo da Camada G**, a sugestão da IA como sugestão, a **Sala De Segurança**, os
logs sem dado pessoal, e o balde de rate limit separado.

**DE FRONTEIRA, e agora são mais:** além das dez que já existiam, entram o **poder exato da credencial**,
**como a confirmação de chegada nos alcança**, **quem varre na nuvem e quando**, **a retenção e o acesso
ao objeto** na zona que não enxergamos, e a mais delicada: **o que acontece com o arquivo reprovado na
varredura depois de já estar gravado.** Barrar antes e reprovar depois são coisas diferentes, e o aviso
de volta ao EA não existe hoje.

---

## 5. Os Furos De Construção

| # | Furo | Dono | Estado |
|---|---|---|---|
| 1 | **Balde de rate limit único e global**, agravado pela barreira (tudo chega de um IP só) | fábrica | incondicional, 1 dia |
| 2 | **Link não revogável** | fábrica | incondicional, 1 dia |
| 3 | **Teto de tamanho** | depende da leitura | **não some em nenhuma delas**: na L-A e L-B continua igual, na L-C muda de lugar para dentro da assinatura da credencial |

O antivírus saiu da lista da fábrica. O teto de tamanho **mudou de forma, não de existência**, e está
registrado em seção própria nos dois anexos justamente para não sumir numa reorganização.

---

## 6. O Painel, Ajustado

O evento de upload deixou de significar "arquivo recebido por nós" e se desdobrou em três momentos:
**credencial emitida**, **arquivo confirmado**, **falha de envio**. Sem esse desdobramento, credencial
emitida seria contada como documento entregue, que é exatamente o número que o diretor usaria para
cobrar o time.

Nasceu um padrão de abuso que não existia: **credencial de escrita em volume anormal**. Pedir chave é
barato, e chave emitida e nunca usada é rastro de quem está colhendo. Saíram as checagens de antivírus e
de teto como medição nossa, e entraram três medíveis de verdade, incluindo uma que **prova por teste
ativo** que a credencial não lista e não sobrescreve.

A tela passa a declarar **três zonas de cobertura**: o que é nosso, o que é da barreira e o que é do
armazenamento. O que não enxergamos aparece cinza, como "Não Visível Ao Painel", nunca como zero e nunca
como verde. **Cards novos ficaram como proposta**, não construídos (§A.31).

---

## 7. Decisões Que Aguardavam O Diretor: TODAS FECHADAS

As três saíram da mesa em 18/09/2026, e o registro está na seção 0.

1. **A pergunta da seção 1 NÃO vai ao Fernando.** Decidida aqui: **envio único**, leitura L-B, IA lendo
   em memória. O teto de tamanho fica conosco, dentro da assinatura da credencial (exigência 2).
2. **As três perguntas do arquivo reprovado depois de gravado FORAM PARA A CARTA** do Fernando,
   `docs/PEDIDO-FERNANDO-BUCKET-PORTAL.md`, seções 5 e 6, porque é infraestrutura dele.
3. **Os cards novos do painel seguem como proposta**, e o diretor valida depois. Não travam a
   construção (§A.31).

**Nenhuma decisão do diretor está pendente nesta frente.** O que resta é execução, e o único bloqueio
real é o comando privilegiado, descrito em `docs/PORTAL-LEITOR-ISOLAMENTO-INFRA.md`, seção 5.

Tudo o mais segue como aprovado em 18/09/2026. Mantidos: o veto do CPF digitável no painel, a Sala De
Segurança no **Menu Gerencial** nascendo só para o Super Admin (§A.23), tela de Master e Super Admin, a
retenção 90 dias completo, 12 meses truncado e 24 meses agregado, e o IP completo só na tabela restrita,
truncado aos 90 dias, com hash de sal mensal em todo o resto.

**Fronteira com a outra fábrica respeitada:** nada de `apps/backend/src/as/**` nem
`apps/backend/src/pandape/**`. Os três arquivos desta frente são novos e têm nome próprio.
