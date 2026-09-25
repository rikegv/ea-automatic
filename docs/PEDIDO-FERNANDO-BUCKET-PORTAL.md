# Pedido Ao Fernando: A Única Pergunta Que Sobrou Do Portal Do Candidato

**Para o Rike enviar.** O texto abaixo da linha é o pedido; o que vem antes é contexto para você, não
para mandar.

---

## Contexto Para O Rike, Não Enviar

**Esta carta encolheu de sete pedidos para uma pergunta**, por decisão do diretor em 18/09/2026, depois
do parecer `docs/PARECER-SEGURANCA-TROCA-MODELO-VT.md`.

**O que saiu, e por quê.** A versão anterior pedia ao Fernando: criar o balde, configurar o CORS, criar
duas contas de serviço e entregar duas chaves por canal seguro. Nada disso é mais dele. O Portal passa a
usar a **infraestrutura do modelo do VT**, que já roda: balde em **projeto nosso**, IAM concedido por
nós, e a chave de escrita que **deixa de existir como arquivo**, porque quem assina passa a ser uma
identidade de runtime. O que era fila de espera virou autoconcessão.

**O que ficou, e é honesto dizer que PIOROU.** Um balde em projeto nosso **sai do perímetro de varredura
do Fernando por construção**. Antes o pedido era "inclua o balde novo na varredura que você já faz".
Agora a pergunta é outra e é mais séria: quem varre um balde que nem está no perímetro dele. Trocar
quatro pedidos por "perdemos o antivírus sobre arquivo que vem da internet, enviado por gente de fora"
seria troca ruim, e por isso esta pergunta sobreviveu sozinha.

**O que NÃO está aqui, de propósito:** a pergunta sobre envio duplo, decidida do nosso lado (o envio é
único e a IA lê em memória), e as três perguntas do arquivo recusado depois de gravado, que deixaram de
ser dele quando o balde passou a ser nosso: quem apaga passamos a ser nós, com identidade própria, e o
expurgo ativo acontece na confirmação.

**A versão anterior, completa, está no histórico desta frente** e pode ser retomada se o diretor voltar
atrás no modelo: ela vive nos documentos de desenho do Portal, que descrevem os sete itens um a um.

---

Fernando, boa tarde.

Mudei o desenho do Portal do Candidato justamente para não te dar trabalho: o balde de entrada vai ficar
num projeto nosso do Google, com as permissões concedidas por nós, então **não preciso que você crie
nada nem me entregue chave nenhuma**. O que eu ia te pedir em quatro itens virou zero.

Sobrou uma pergunta só, e ela é a que eu não consigo responder sozinho.

**Antivírus em balde que está num projeto nosso.**

O contexto em duas linhas: o candidato vai enviar documento pelo celular, direto da internet, e o
arquivo cai num balde de armazenamento do Google antes de qualquer conferência nossa. É arquivo de
origem externa, mandado por gente de fora, e é exatamente o tipo de coisa que a sua varredura existe
para pegar.

Como o balde fica num projeto nosso, e não no perímetro que você administra, eu preciso saber:

1. **A sua varredura alcança um balde em projeto nosso?** Se alcançar, me diz o que preciso liberar do
   meu lado para que ela chegue lá.
2. **Se não alcançar, o que você recomenda?** Prefiro seguir o padrão da empresa a inventar um do meu
   lado. Se a resposta for que a varredura tem de ser nossa, também está bem, eu só preciso saber disso
   agora, e não depois de o primeiro arquivo chegar.

Nenhuma máquina nossa baixa esse arquivo para disco. A leitura é em memória, num serviço isolado, e o
arquivo só é promovido para o prontuário depois de conferido. A pergunta é só sobre a varredura.

Sem pressa, e me fala se algo aqui conflita com a política da empresa que eu adapto do meu lado.
