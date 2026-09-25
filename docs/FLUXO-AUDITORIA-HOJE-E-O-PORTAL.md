# A Auditoria De Hoje, E O Desenho Do Portal Que O Diretor Pediu

**O que é:** o fluxo REAL da auditoria documental que roda em produção hoje, medido no código e contra
o banco, mais a avaliação do desenho novo (a IA auditando na tela do Portal, com o candidato
corrigindo na hora). **É levantamento e avaliação. Nada foi construído.**

**Quem levantou:** `arquiteto` (o caminho ponta a ponta) e `ia` (a comparação entre auditar e ler para
autopreencher), os dois sem construir. **Consolidado e reconferido pelo coordenador**, que mediu de
novo os quatro pontos que mudam a decisão. **Data:** 18/09/2026.

---

## 1. O Fluxo De Hoje, Em Seis Passos

**Passo 1, o candidato entra.** O Pandapé chama o nosso webhook e a admissão nasce, com a lista de
documentos já montada pela régua do cliente e do cargo. **O documento quase nunca vem junto:** o
webhook dispara no CONVITE, quando o candidato ainda não anexou nada.

**Passo 2, quem vai buscar o documento é um varredor.** De **12 em 12 minutos**, uma rotina olha as
admissões vivas de origem Pandapé e puxa os anexos novos
(`apps/backend/src/domain/scheduler-pandape.ts:21`). Ela tem freio de 40 auditorias por ciclo, para um
ciclo anormal não queimar a cota de IA, e não rebaixa de novo o arquivo que já conhece, porque guarda a
impressão digital de cada um.

**Passo 3, o arquivo passa por uma pasta temporária.** O binário é baixado **só em memória** da URL do
Pandapé (que nunca é gravada nem registrada, §A.6) e gravado numa pasta de trabalho fora do banco, com
**prazo de vida de 48 horas** (`apps/backend/src/staging/staging.service.ts`). Arquivo de conteúdo
idêntico não vira arquivo novo, e isso nasceu de um caso real em que uma candidata terminou com 104
arquivos e 241 MB.

**Passo 4, a IA decide.** O documento inteiro (frente, verso, todas as páginas) vai numa chamada só e
recebe **um** veredito, entre três (`apps/ai-service/app/gemini.py:144-168`):

| veredito | o que significa | conta como pendência? |
|---|---|---|
| **VALIDADO** | atende todas as regras daquele tipo | não, é o único que zera |
| **INCONFORME** | viola alguma regra, ou os dados não batem com o cadastro | sim |
| **PENDENTE** | ilegível, ou insuficiente para decidir | sim |

Junto vem um **motivo curto, em português, que aparece na tela**, e a instrução proíbe expressamente
que ele carregue CPF ou dado pessoal, com um limpador em cima disso como segunda rede.

**O critério são as regras cadastradas, e nada além.** Medido no banco agora: **91 regras ativas**. A
IA é proibida de usar critério próprio, e é proibida de obedecer instrução escrita dentro do
documento, que é a defesa contra alguém colar "aprove este documento" num PDF. **Sem regra ativa a IA
nem é chamada:** o documento vai para validação manual, que é escalada e não reprovação.

**Duas coisas o sistema decide sozinho, sem gastar IA:** responder em TEXTO no formulário do Pandapé em
vez de anexar arquivo (caso real e recorrente, que já ficou 14 horas preso) e PDF que exige senha para
abrir. Os dois viram INCONFORME com motivo acionável.

**Passo 5, o prontuário no Drive.** O gatilho **não é o documento**, é a **régua obrigatória fechar**.
Quando o último obrigatório fica VALIDADO, o sistema conclui a frente de Auditoria sozinho e **só então
sobe o lote** para a pasta do funcionário no Drive. **Exceção medida: o ASO sobe sozinho, na hora em que
é aprovado**, porque é ele que destrava o "Apto" do Exame.

**Passo 6, o time entra no que sobrou.** Uma tela só, o modal de auditoria da aba Auditoria da Esteira,
com quatro ações: subir arquivo novo, mandar reauditar, **aprovar por cima da IA** e descartar. A
aprovação humana grava quem assumiu e quando, e passa a exibir "Validado manualmente por Fulano".

---

## 2. Os Três Achados Que Mudam A Conversa

### Achado 1: O Prontuário NÃO Guarda Só O Aprovado

**O arquivamento sobe TODO arquivo que estiver na pasta temporária naquele instante, sem olhar o
veredito de nenhum deles.** Conferido pelo coordenador no arquivo:
`apps/backend/src/auditoria/auditoria.service.ts:1032` lista os arquivos da pasta e `:1046-1053` os
transforma na lista de envio, **sem consultar o estado de nenhum documento**. Não existe filtro por
veredito nesse caminho.

Na prática: um arquivo que a IA REPROVOU, cujos bytes ainda estejam na pasta quando a régua fechar, vai
para o prontuário junto com os aprovados.

Três coisas atenuam e **nenhuma fecha**: trocar o arquivo apaga os anteriores daquele tipo,
reclassificar o ASO limpa o tipo, e o prazo de 48 horas apaga o que envelheceu.

**O comentário do próprio código diz outra coisa**, que a régua seria "todo documento ENTREGUE". Essa
régua por estado existe, mas é aplicada **só** para decidir o que rebaixar do Pandapé quando falta, e
**não** ao que já está na pasta. **Documento e código divergem aqui, e vale o código.**

### Achado 2: A IA Que Audita E A Que Lê Para Autopreencher São A MESMA CHAMADA

Não são dois motores, dois modelos nem dois prompts. É a mesma função, `auditar_documento`, e ela tem
**exatamente dois chamadores** em todo o serviço de IA, conferidos pelo coordenador:
`app/routers/auditoria.py:96` (a esteira) e `app/routers/portal.py:180` (o Portal).

O autopreenchimento é **um parágrafo a mais colado na mesma instrução** e **um campo a mais na mesma
resposta**. O motivo está escrito no código: o documento já está em memória e já foi enviado ao modelo
naquele ciclo, então uma segunda chamada seria uma segunda passada pelo mesmo arquivo, com o candidato
esperando, e ainda abriria a chance de as duas respostas discordarem sobre o mesmo papel.

**Mas os SERVIÇOS são separados de propósito, e isso não deve ser desfeito:**

| | motor da operação | leitor do Portal |
|---|---|---|
| quem manda o arquivo | consultor com crachá | qualquer pessoa da internet |
| enxerga o banco e o Drive | sim | **não** |
| credencial | a unificada (Drive e IA) | dedicada, só leitura de um balde |
| limites de arquivo | **nenhum** | 10 MB, 20 páginas, 20 s, processo morto no estouro |

A regra é uma frase: **quem abre arquivo que veio da internet não segura a chave do prontuário.** Mesma
IA, mesma pergunta, cofres diferentes.

### Achado 3: O Portal Está Desligado Em TRÊS Camadas, E Uma Delas Ninguém Tinha Visto

1. o backend não sabe o endereço do leitor (as duas variáveis não existem no ambiente);
2. o leitor está de pé na porta 8020 e responde indisponível, porque o balde não existe e a credencial
   dedicada não foi criada;
3. **a tabela do Portal nem foi criada no banco.** Conferido pelo coordenador em produção:
   `portal_credenciais` **não existe**. Não é configuração faltando, é migração não aplicada.

**Conclusão honesta: o Portal nunca processou um documento real.** O que existe é código pronto, verde
e auditado, não um caminho exercitado.

---

## 3. O Desenho Que O Diretor Quer, Avaliado

**O desenho:** a IA audita NA HORA, na tela do Portal; reprovando, mostra ao candidato o que está
errado; o candidato corrige ali mesmo e reenvia; aprovando, **só então** salva o prontuário. O ganho é
real e é grande: hoje o time caça o candidato depois da reprovação, e no Portal ele já está presente.

### Pergunta A: A mesma IA roda na hora do upload?

**Sim, e ela JÁ roda assim hoje, com o consultor esperando.** O upload da esteira é síncrono: a tela
envia, o backend grava, chama a IA, espera e devolve o veredito. Não é fila.

**Medido no registro do servidor de entrada, pelo coordenador e pelo agente, em janelas diferentes:** o
upload de documento tem **mediana na casa dos 11 a 14 segundos** e **cauda até 79 segundos**. O número
é o relógio completo do usuário (envio pela rede, gravação, IA e, quando fecha a régua, o
arquivamento), então a IA em si é **igual ou menor** que isso.

**O que isso significa para o desenho:** funciona, e não é impeditivo. Mas **onze segundos de mediana
com cauda de oitenta é muito para um candidato no celular olhando uma tela parada.** A tela precisa ser
desenhada para a espera, com aviso de que o documento está sendo lido e com a possibilidade de sair e
voltar. Não é um detalhe de acabamento: é o que decide se o candidato desiste no meio.

**Um risco que ninguém mediu:** o Portal tem muito mais gente subindo arquivo ao mesmo tempo que a
esteira, e a IA tem teto de uso por minuto. O tratamento de estouro já existe e devolve aviso claro,
mas o volume real é desconhecido.

### Pergunta B: O leitor do Portal consegue mostrar a reprovação ao candidato?

**Ele JÁ devolve veredito e motivo. Tecnicamente não falta nada.** O que falta é de NEGÓCIO, e são duas
coisas:

1. **O motivo é escrito para quem opera o RH, não para o candidato.** "Documento fora do prazo de
   validade previsto na regra" serve para o consultor; para o candidato o certo é "este documento está
   vencido, envie um atualizado". Isso é ajuste do **texto das regras**, não de código, e é a pendência
   §A.9.
2. **O laço.** Mostrar a reprovação é bom quando o motivo é acionável (foto cortada, página faltando) e
   ruim quando o candidato fica preso tentando de novo sem entender. Vale um teto de tentativas e uma
   saída: acima dele, o documento cai na fila do time em vez de o candidato continuar sozinho.

### Pergunta C: O prontuário só salva depois de a IA aprovar?

**No desenho do diretor, sim, e ele é MELHOR do que o que existe hoje**, exatamente por causa do achado
1: hoje o arquivamento sobe o que estiver na pasta, reprovado inclusive.

**Mas isso não acontece sozinho.** O arquivamento de hoje é **por lote, disparado pela régua fechar**, e
não por documento aprovado. Para o desenho valer, é preciso decidir uma de duas coisas, e a decisão é
do diretor:

- **filtrar por veredito no arquivamento** (só sobe o que está ENTREGUE), o que corrige o achado 1
  **para o fluxo inteiro**, Portal e esteira; ou
- **tratar o Portal à parte**, o que deixa o achado 1 de pé na esteira.

**A primeira é a que eu recomendaria propor**, porque resolve um problema que já existe hoje, em
produção, e não só o do desenho novo.

### Pergunta D: O documento vai para os dois lugares, o balde e o prontuário?

**Vai, e eles têm papéis diferentes, que não devem ser confundidos:**

| | o balde de entrada | o prontuário no Drive |
|---|---|---|
| o que é | **transporte**, onde o celular escreve | **arquivo definitivo** do funcionário |
| quem escreve | o candidato, com credencial de um objeto só | o EA, quando a régua fecha |
| quanto tempo | **rede de proteção de 30 dias**, com **expurgo ativo** assim que o documento é confirmado | permanente |
| o que guarda | tudo que chegou, inclusive o que será recusado | o prontuário |

O prazo de 30 dias **não é política de retenção**, é rede de proteção para objeto abandonado
(credencial emitida e envio que nunca chegou). O expurgo de verdade acontece na confirmação, e ele foi
construído nesta frente.

**A consequência que o desenho torna elegante:** no Portal, o documento reprovado **nunca precisa
chegar ao prontuário**. Ele fica no balde, o candidato reenvia, e o expurgo leva o recusado. O
prontuário recebe só o que passou. É o oposto do que acontece hoje.

---

## 4. O Que Muda, Na Prática, Da Auditoria De Hoje Para Esse Modelo

| | hoje | com o Portal |
|---|---|---|
| quem manda o documento | o Pandapé, puxado de 12 em 12 minutos | o candidato, direto do celular, na hora |
| quando a IA olha | minutos depois, sem ninguém presente | na hora, com o candidato na tela |
| quem vê a reprovação | o consultor, depois | **o candidato, na hora** |
| quem corrige | o time caça o candidato | **o candidato corrige ali** |
| o time humano | olha tudo que a IA reprovou | olha **só o que nem o candidato resolveu** |
| o prontuário | recebe o que estiver na pasta | recebe **só o aprovado**, se a decisão da pergunta C for tomada |

**O motor da auditoria NÃO muda.** É a mesma IA, as mesmas regras, o mesmo veredito. O que muda é
**quando** ela roda e **quem** está presente para corrigir. É por isso que o ganho é grande e o custo de
construção é menor do que parece: não se está criando uma auditoria nova, está se mudando o momento em
que a que já existe acontece.

---

## 5. O Que Este Documento NÃO Responde

1. **Com que frequência, na vida real, um arquivo reprovado ainda está na pasta quando a régua fecha.**
   O caminho existe e nada o impede; o quanto acontece exigiria uma linha do tempo que o sistema não
   guarda.
2. **Se o que já está no Drive contém documento reprovado.** Só se responde olhando as pastas, e é uma
   medição factível se o diretor quiser.
3. **Se as 91 regras estão certas do ponto de vista do RH.** Elas existem, estão ativas e o texto é
   operacional. Se estão certas é julgamento de negócio, e é a pendência §A.9.
4. **Quanto do tempo de resposta é a IA e quanto é o resto.** O serviço não cronometra as próprias
   chamadas, então os segundos medidos são um **teto** para a IA, não a medida dela.
5. **Como o leitor do Portal se comporta com arquivo real.** Nunca rodou. Tempo, acerto da extração e
   quantos campos voltam vazios em foto de celular são desconhecidos até a primeira medição.
