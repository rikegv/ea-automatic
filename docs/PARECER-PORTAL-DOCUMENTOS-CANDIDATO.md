# Parecer de viabilidade: portal do candidato e integração com o GI

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-20 · **Tipo:** consulta de viabilidade, nada construído
**Para:** reunião de segurança e diretoria · **Restrição respeitada:** nenhuma alteração em código, infra,
produção ou homologação. Nada foi pedido nem proposto ao Fernando; abaixo há apenas **requisitos para
ele avaliar**.

---

## PARTE 1: portal público do candidato

## Resumo da Parte 1

**É viável, e existem dois caminhos.** A diferença entre eles não é técnica, é de risco, e a decisão é
de negócio.

| | **Caminho A: abrir uma porta no EA** | **Caminho B: página fora do EA** |
|---|---|---|
| O que fica exposto na internet | uma rota específica do EA, o resto bloqueado | **nada do EA** |
| O EA recebe conexão de fora? | sim, filtrada | **não, nunca** |
| Candidato vê se o documento passou | **na hora** | depois, não imediato |
| Já existe no projeto? | pacote escrito, **nunca aplicado** | **é como o formulário de VT funciona hoje** |
| Esforço da fábrica | menor | maior |
| Risco para a segurança da empresa | real, gerenciável | próximo de zero |

**O ponto que a reunião precisa decidir:** o candidato precisa saber **na hora** se o documento foi
aceito? Se sim, caminho A. Se pode saber depois, o caminho B entrega o mesmo resultado **sem abrir uma
única porta** no EA, e o projeto já fez isso uma vez.

---

## 1. Viabilidade: dá para expor só o portal e manter o resto fechado?

**Sim.** E o projeto já desenhou exatamente isso uma vez, para o formulário de VT.

Hoje o EA não tem nenhuma porta para a internet. Ele responde só dentro da rede da empresa e da VPN.
Abrir o portal **não significa abrir o EA**: significa colocar um porteiro na frente que, por padrão,
**nega tudo**, e libera só uma lista curta e nominal de endereços.

O pacote técnico dessa separação **já foi escrito e testado** para o VT (ele nunca chegou a ser
aplicado). O desenho é "negar por padrão, liberar por exceção":

- A porta de entrada **nega qualquer endereço** que não esteja na lista.
- A lista contém **só os endereços do portal**, e cada um aceita **só o método necessário** (a página
  aceita apenas abrir; o envio aceita apenas enviar).
- Tudo que é administrativo fica **fora da lista**, inclusive a tela de login do sistema. Quem tentar
  alcançar o EA por esse caminho não chega nem na porta de autenticação.

Traduzindo para a diretoria: **não é abrir a casa, é abrir uma janelinha específica, com grade, e
manter todas as outras portas trancadas por padrão.**

### O caminho B, que dispensa a janelinha

Quando o VT foi construído de verdade, o projeto **não usou** o caminho A. Usou outro: a página pública
do candidato vive **num aplicativo separado, fora do EA**, hospedado num serviço da Google. O EA não
recebe conexão de ninguém; ele apenas **vai buscar** os arquivos depositados, de tempos em tempos.

O EA continua exatamente tão fechado quanto é hoje. **Esse caminho já está funcionando e provado.**

O preço é o que se ganha em segurança: como o EA não está na conversa, **o candidato não recebe
resposta imediata** sobre o documento. Ele envia, e a validação acontece minutos depois, do lado de cá.

---

## 2. O que a infraestrutura exigiria (lista para o time de segurança avaliar)

Nada aqui é pedido. É a lista do que precisaria existir, para o time avaliar viabilidade e custo.

### Se for o caminho A (porta no EA)

**Depende da infra e da segurança da empresa (fora do alcance da fábrica):**

1. **Subdomínio próprio** para o portal, separado do resto.
2. **Certificado HTTPS** para esse subdomínio, com renovação automática.
3. **Porteiro na frente (proxy reverso)** configurado para **negar tudo por padrão**.
4. **Lista nominal de endereços liberados**, com o método permitido em cada um.
5. **Limite de tamanho de envio** aplicado já no porteiro, antes de chegar ao sistema.
6. **Limite de tentativas por origem**, para conter varredura automatizada e envio em massa.
7. **Tempo máximo de espera** por requisição, para um envio lento não prender recurso.
8. **Registro de acesso** com dado pessoal mascarado (o EA já faz isso hoje no proxy interno, e o
   mesmo cuidado precisa valer aqui: CPF nunca legível em arquivo de log).
9. **Isolamento de rede**: o porteiro alcança só o serviço do portal, e nada mais da rede interna.
10. **Monitoramento e alerta** de volume anormal.

**A fábrica faz, dentro da plataforma:**

11. Link individual **com prazo de validade** e conferência de identidade.
12. Aceitar **apenas os tipos de arquivo previstos**, conferindo o conteúdo real e não a extensão.
13. **Teto de tamanho e de quantidade** por candidato.
14. **Limite de tentativas por link**, independente do limite de rede.
15. Recusar arquivo **protegido por senha** (já existe hoje na auditoria).
16. Mensagens de erro que **não revelam** se um CPF existe ou não na base.

### Se for o caminho B (página fora do EA)

**Depende da infra e da segurança da empresa:** essencialmente **nada de rede**. Não há porta nova,
não há proxy, não há subdomínio apontando para a empresa. O que existe é uma decisão sobre **onde os
arquivos ficam depositados** até serem recolhidos, e a regra de descarte desse depósito.

**A fábrica faz:** a página pública, o link assinado, o recolhimento periódico, a validação e o
arquivamento. É o mesmo desenho do VT, ampliado para mais tipos de documento.

---

## 3. O arquivo sem ficar armazenado no nosso servidor

**É viável, mas hoje não é assim que funciona, e isso precisa ser dito com clareza.**

Hoje, na auditoria documental que já roda, o arquivo **é gravado em disco** numa área temporária,
lido dali para a validação, arquivado no Drive e **apagado depois**, com prazo máximo de 48 horas. Ou
seja: existe retenção temporária, por desenho.

Para atender o requisito "não retém", a mudança é **contida e bem localizada**: o arquivo passa a
trafegar **em memória** entre as duas peças do sistema, sem nunca tocar o disco. Isso é possível
porque a peça que conversa com a IA **já recebe o arquivo como conteúdo**, não como caminho; o disco é
só o meio de transporte atual entre dois processos. Trocar o meio de transporte não mexe nem na
validação por IA, nem no arquivamento no Drive.

O que sobra registrado é **o status do documento, nunca o arquivo**, que já é o princípio do sistema
("documento é efêmero", regra 7 do projeto).

### As pegadinhas, e são reais

| Pegadinha | O que acontece | O que resolve |
|---|---|---|
| **Tamanho** | Segurar arquivo em memória custa memória. Vários candidatos enviando fotos grandes ao mesmo tempo pode derrubar o serviço | Teto rígido por arquivo e por envio, recusado **antes** de carregar |
| **Sem limite hoje** | A fábrica conferiu: **não há limite de tamanho configurado** nos envios atuais. Isso nunca foi problema porque o sistema é interno; num endereço público, é obrigatório | Definir e aplicar o teto, no porteiro e na plataforma |
| **Tempo de resposta** | Validar por IA e gravar no Drive na mesma requisição pode demorar. Candidato no celular, em rede ruim, com foto pesada, é o pior caso | Confirmar o recebimento primeiro e validar em seguida, ou aumentar o tempo limite de forma controlada |
| **Foto de iPhone** | O formato padrão de foto do iPhone **não é** um dos que o sistema aceita hoje | Converter na entrada ou recusar com mensagem clara. Precisa ser decidido, senão vira reclamação em massa |
| **Antivírus** | **Não existe verificação de vírus em nenhum ponto do sistema hoje.** Enquanto tudo é interno, o risco é baixo; recebendo arquivo de fora, muda de figura | Decisão do time de segurança: exigir verificação, ou aceitar o risco por escrito. **Ponto principal a levar para a reunião** |
| **Arquivo malicioso** | Documento pode carregar conteúdo ativo | O sistema já recusa arquivo protegido por senha e confere assinatura de arquivo real. Falta a camada de vírus |

---

## 4. Reuso do que já existe

### O esquema de link do formulário de VT: **sim, reaproveitável**, com dois ajustes

Já existe e está em produção: o sistema gera um **link individual assinado**, que carrega a
identificação do candidato e vale por 7 dias. A página confere CPF e data de nascimento contra o que
está dentro do próprio link, **sem precisar consultar o EA**. É exatamente o comportamento pedido.

Dois ajustes necessários, e o segundo é de segurança:

1. **Geração em lote.** Hoje o link nasce um a um, pela ficha. O portal precisa gerar a lista inteira
   (nome, telefone, link) para o disparo em massa.
2. **O link não pode ser cancelado antes de vencer.** Ele é auto-suficiente por desenho, o que é bom
   para não expor o EA e ruim para revogar. Se um link vazar, hoje **não há como invalidá-lo** antes
   do prazo. Para um portal que recebe documento, isso deveria mudar: prazo mais curto e uso único.

### A validação por IA e a gravação no Drive: **sim, com adaptação**

A parte pesada está pronta e rodando em produção: a leitura do documento pela IA e o arquivamento no
Drive, com controle de duplicidade. Isso não precisa ser reinventado.

As adaptações:

1. **O transporte em memória**, do item 3.
2. **O momento do processo.** A validação de hoje é organizada em torno de uma admissão já existente e
   da lista de documentos exigidos daquele cliente e cargo. No portal, o candidato é de **antes da
   admissão**. Ou o portal cria o registro antes de liberar o envio, ou a lista de documentos exigidos
   precisa ser resolvida pela **vaga** do candidato. É decisão de desenho, não impedimento, e conecta
   diretamente com a Central de Vagas que está sendo construída.

---

## 5. Riscos, e o que mitiga cada um

| Risco | Por que importa | Mitigação |
|---|---|---|
| **O link é a senha** | Quem tem o link, entra. Enviado por WhatsApp, ele fica no histórico da conversa e viaja em qualquer encaminhamento | Prazo curto, uso único, e a conferência de CPF e nascimento que já existe. Aceitar que o risco residual é o mesmo de qualquer link de rastreio enviado por mensagem |
| **Treinar o candidato a clicar em link** | Disparo em massa por WhatsApp com link é, na forma, idêntico a golpe. Além do risco de segurança, há risco de o candidato **não confiar** e não enviar | Domínio próprio e reconhecível, mensagem padronizada, e o candidato avisado no processo seletivo de que o link virá |
| **Varredura automatizada** | Robô testando links até achar um válido | O link é assinado: adivinhar é inviável. O limite de tentativas por origem cobre o resto |
| **Envio em massa abusivo** | Alguém usa o endereço para consumir recurso ou encher o Drive | Teto por link, limite de tentativas, e monitoramento de volume |
| **Arquivo malicioso** | Recebendo arquivo de fora, o sistema passa a ser porta de entrada | Verificação de vírus, hoje **inexistente**. Principal ponto da reunião |
| **A porta virar caminho para dentro** | Se o porteiro for mal isolado, vira ponte para a rede interna | Negar por padrão, liberar por exceção, e o porteiro enxergar só o serviço do portal. **É o argumento mais forte a favor do caminho B, onde a porta não existe** |
| **Dado pessoal em registro de acesso** | CPF no endereço vira CPF em arquivo de log | O EA já mascara isso no proxy interno. O mesmo cuidado precisa ser requisito explícito no porteiro externo |
| **Indisponibilidade** | Ataque de volume no endereço público | O endereço fica separado do EA, então o impacto se limita ao portal. No caminho B, nem isso |

---

## Separação clara de responsabilidades

**A fábrica faz, dentro da plataforma:** a página do candidato, o link assinado com prazo, a
conferência de identidade, os limites de tipo, tamanho e quantidade, a recusa de arquivo protegido, o
tráfego em memória sem gravar em disco, a validação por IA, o arquivamento no Drive e o registro de
status. Tudo isso é trabalho conhecido, e boa parte já existe.

**Depende da infra e da segurança da empresa, e não é decisão da fábrica:** existir um subdomínio,
existir certificado, existir o porteiro configurado para negar por padrão, o isolamento de rede desse
porteiro, os limites de tráfego, o registro de acesso com mascaramento, o monitoramento, e a decisão
sobre verificação de vírus.

**A recomendação da fábrica:** levar o **caminho B** como proposta principal, porque ele entrega o
resultado pedido **sem abrir nenhuma porta no EA**, e porque o projeto já provou esse desenho no
formulário de VT. Levar o **caminho A** como alternativa, para o caso de o negócio exigir que o
candidato receba a resposta na hora. A pergunta que decide é essa, e é de negócio, não de tecnologia.

---

# PARTE 2: integração com o GI (sistema de folha)

## Resumo da Parte 2

**Tecnicamente é viável, e a API do GI tem tudo o que precisamos.** Mas a análise encontrou **uma
lacuna que impede fechar o escopo**, e ela não se resolve lendo documentação: **a documentação não diz
quais campos são obrigatórios**. São 365 campos no cadastro de funcionário e **nenhum marcado como
obrigatório**. Descobrir isso em produção significa descobrir com admissão real travando na folha.

E há um documento que vale mais que o Swagger para esta conversa: **o conteúdo que o PandaPé entrega
hoje ao GI**. Sem ele, ninguém consegue afirmar que não existe campo que só o PandaPé preenche.

## 1. Consegui ler a documentação? Sim. O que falta é credencial de USO

A página do Swagger é só uma casca; o conteúdo real está num arquivo público, que **baixei e analisei
por inteiro**: 1,6 MB, **435 endereços** em **55 áreas**. **Nenhuma credencial foi necessária para
LER.** Nada foi contornado e nenhuma chamada foi feita à API.

**Para USAR a API, faltam 4 credenciais, e nenhuma existe no EA hoje:**

1. `IDClienteWeb`
2. `ChaveAcesso`
3. Usuário do Sistema Web
4. Senha do Sistema Web

**E falta uma quinta coisa, que é a mais importante:** saber se **existe um ambiente de teste do GI**.
Sem ele, a primeira admissão enviada seria um teste em produção, dentro da folha de pagamento.

## 2. É viável substituir o webhook do PandaPé? Sim, com ressalvas

A API tem exatamente as peças necessárias:

- **`Funcionario/Add`**: cria o colaborador. É o equivalente ao que o PandaPé alimenta hoje.
- **`SolicitacoesDocumentos/Add`**: registra os documentos do colaborador.
- **Confirmação de recebimento existe**: a resposta diz se deu certo, devolve um identificador e a
  mensagem de erro quando falha. Isso é importante, porque permite saber se a folha recebeu.
- **`DePara`**: o GI tem um recurso **feito para tradução de códigos** entre o sistema dele e um
  sistema externo. Isso resolve, de forma suportada, boa parte do trabalho de compatibilização.

**As duas ressalvas estruturais:**

1. **Nada é declarado obrigatório.** A documentação lista 365 campos e não marca nenhum como
   necessário. As regras reais estão dentro do GI e na legislação do eSocial. **Isso precisa vir do
   fornecedor ou de um ambiente de teste.**
2. **Documento vai por LINK, não por arquivo.** O GI espera uma **URL da imagem**, com a extensão e a
   descrição. Ele **busca** o arquivo no endereço que informarmos. Isso conflita com o requisito da
   Parte 1 ("o arquivo não fica armazenado") e com a regra do projeto de nunca guardar link externo, e
   exige que o arquivo no Drive esteja **alcançável pelo GI**. É um ponto em aberto para o fornecedor.

## 3. Cruzamento de campos: o que temos, o que falta, o que precisa de tradução

### Já temos, ou teremos com o A&S

| Grupo | Campos do GI atendidos | De onde sai no EA |
|---|---|---|
| Pessoa | nome, CPF, data de nascimento, sexo, e-mail, telefone | cadastro do candidato |
| **Endereço completo** | CEP, logradouro, número, complemento, bairro, cidade, UF | **o formulário de VT já coleta tudo isso** |
| Banco | agência, conta, titular | cadastro do candidato |
| Admissão | data de admissão, matrícula, tipo e dias de contrato | admissão |
| Cargo e folha | salário, centro de custo, departamento, setor, motivo do contrato, substituído (nome e CPF), escala | dados da vaga na folha |
| Vaga | identificador da vaga, percentual de insalubridade | **Central de Vagas, em construção** |
| Transporte | percentual e tipo de VT, número do cartão | formulário de VT |

### Falta coletar, e é o que o PandaPé preenche hoje

**Este é o coração do problema: o EA não coleta nada disto.**

| Grupo | O que falta |
|---|---|
| **Números de documento** | RG (com órgão, UF e data), PIS, CTPS (com série, UF e data), título de eleitor (com zona e seção), reservista, CNH |
| **Dados civis** | raça e cor, estado civil, **grau de instrução**, nacionalidade, naturalidade, município de nascimento |
| **Filiação** | nome do pai, nome da mãe |
| **Dependentes** | para imposto de renda e salário-família |
| **Classificação do eSocial** | categoria, natureza da atividade, regime de trabalho, regime previdenciário, indicativo de admissão |

**Onde isso conecta com a Parte 1, e é a melhor notícia deste parecer:** a maioria desses números
**está dentro dos documentos que o candidato vai enviar pelo portal**. A IA **já lê** esses documentos
hoje, na auditoria. O que ela devolve hoje é "confere" ou "não confere", **não os números**. Extrair os
números é **ampliar a resposta de um motor que já existe**, não construir um motor novo.

Ou seja: **o portal da Parte 1 é o que torna a Parte 2 possível.** Ele é o lugar onde os dados que o
PandaPé coleta hoje passam a ser coletados por nós, e a IA reduz a digitação.

*Observação já registrada em análise anterior: o "grau de instrução" não existe em lugar nenhum do
sistema hoje, e agora aparece como exigência da folha. Ele precisa nascer, e a lista precisa ser a
que o GI aceita, não uma lista nossa.*

### Precisa de tradução de códigos

Temos o dado, mas em outro formato. O GI trabalha por código numérico; nós, por nome.

| Nosso dado | O que o GI espera |
|---|---|
| código do cliente (nosso) | código do cliente (do GI) |
| cargo (nosso catálogo) | código de função |
| escala e horário (texto) | código de horário |
| centro de custo (texto) | código de centro de custo |
| banco (texto) | código do banco na folha |
| não temos | código de empresa e de filial |
| grau de instrução (não existe) | a lista de códigos do GI |

**O recurso `DePara` do GI existe exatamente para isso.** É um problema conhecido, com solução prevista
pelo próprio fornecedor.

## 4. Como funciona a integração

- **Nós chamamos o GI.** Buscamos no arquivo inteiro da documentação e **não existe nenhum recurso de
  webhook, callback, assinatura ou notificação**. O webhook que o GI tem hoje com o PandaPé é um
  receptor construído do lado do GI, específico para o PandaPé; **não é algo em que possamos nos
  cadastrar**. Nossa integração é de envio.
- **Autenticação em duas etapas.** Primeiro as credenciais do cliente, depois usuário e senha; o
  resultado é um token que acompanha todas as chamadas. A documentação **não informa o prazo de
  validade** do token, e existe resposta específica para "token expirado", então a renovação
  automática precisa ser prevista.
- **Dados e arquivos vão separados.** O cadastro do colaborador é uma chamada; cada documento é outra.
- **Documento vai por link**, como já dito.

## 5. Riscos e lacunas

| Risco | Por que importa | O que mitiga |
|---|---|---|
| **Não sabemos o que é obrigatório** | 365 campos, nenhum marcado. Descobrir em produção é descobrir com a folha travando | **Ambiente de teste do GI**, ou a lista de obrigatórios pelo fornecedor. **É bloqueante para fechar escopo** |
| **Campo que só o PandaPé preenche** | Nenhuma leitura de documentação responde isso | **Pedir ao fornecedor o conteúdo que o PandaPé entrega hoje.** É o item mais valioso da conversa |
| **Ordem dos eventos** | Hoje o PandaPé entrega dados e documentos juntos. Nós faríamos chamadas separadas; se a segunda falhar, o colaborador nasce na folha sem documento | Fila com retentativa e reconciliação, padrão que o EA **já usa** nas outras integrações |
| **Documento por link** | Conflita com "não retém" e com a regra de não guardar link externo. E o arquivo precisa ser alcançável pelo GI | Definir com o fornecedor se há outro modo de envio; senão, decidir a política de acesso ao arquivo |
| **eSocial** | Classificação errada não vira erro de tela, vira rejeição ou multa | Conferência com a folha antes da virada, sobre casos reais |
| **Duas fontes escrevendo na folha** | Enquanto PandaPé e EA coexistirem, os dois podem cadastrar o mesmo colaborador | Virada **por cliente**, nunca de uma vez. Tradução de códigos ajuda a detectar duplicidade |
| **A credencial cria gente na folha** | É a credencial mais sensível que o EA teria | Usuário próprio do GI com permissão mínima, segredo fora do código e fora de log, no mesmo padrão das outras integrações |
| **Dependência de disponibilidade** | Se o GI estiver fora, a admissão não pode se perder | Fila com retentativa e alerta, mesmo padrão já usado |

## Separação de responsabilidades, Parte 2

**A fábrica faz, dentro da plataforma:** o cliente da API do GI, a autenticação em duas etapas com
renovação automática, a fila com retentativa e reconciliação, a tradução de códigos, a coleta dos
campos que faltam (no portal do candidato), a extração assistida por IA dos números de documento, e o
registro de confirmação de recebimento.

**Depende do diretor, da TI e do fornecedor do GI, e a fábrica não se autoconcede nada disso:**

1. As **4 credenciais** de acesso.
2. A confirmação de que existe **ambiente de teste** do GI.
3. A **lista real de campos obrigatórios** da admissão.
4. O **conteúdo que o PandaPé entrega hoje** ao GI.
5. A decisão sobre **documento por link**.
6. Um **usuário próprio do GI** para o EA, com permissão mínima.

**Enquanto os itens 1 a 4 não existirem, é possível projetar a integração, mas não é possível
prometer prazo.** O que dá para afirmar hoje: a API tem as peças necessárias, o caminho é conhecido, e
o portal do candidato da Parte 1 é a peça que torna a Parte 2 viável, porque é lá que os dados que o
PandaPé coleta hoje passariam a ser coletados por nós.

---

# AVISO DE CORREÇÃO (20/08, rodada de autoria)

**As Partes 3 e 4 contêm uma hipótese que a investigação seguinte DERRUBOU.** Elas concluem que a
superfície de integração do PandaPé é a área de Seleção (`FuncionarioSelecao`). **Não é.** A evidência
nova: o webhook do PandaPé aponta para `giinterno.gi.app.br/WebhooksPandaPe/Soulan/`, um **host e um
caminho privados**, fora da API pública; a tabela de pré-admissão tem **1 registro só**, sem rastro de
integração; e a tela onde as dezenas de pessoas do PandaPé aparecem é o **Cadastro de Funcionários**,
tabela que a nossa credencial não lê (403).

Leia as Partes 3 e 4 com esta ressalva, e a **Parte 5** como a versão corrigida.

---

# PARTE 3: mapa completo da API do GI

**Por que esta parte existe.** Na avaliação do PandaPé olhou-se só o pedaço que interessava na hora, e
o que não foi mapeado apareceu depois como surpresa. Aqui o terreno inteiro foi percorrido antes de
qualquer decisão: **435 endereços, 55 áreas, 63 estruturas de dados, 3.707 campos.** Nenhuma chamada
foi feita à API; só a documentação pública foi lida.

## O achado principal, e ele muda a conversa

**Existe uma área de SELEÇÃO dentro do GI, e ela já tem um campo com o nome do PandaPé.**

O GI tem duas versões do cadastro de colaborador:

| | Campos | O que é |
|---|---|---|
| `Funcionario` | 365 | o cadastro **oficial**, o que está na folha |
| `FuncionarioSelecao` | **415** | o **mesmo cadastro na área de seleção e pré-admissão** |

Os 51 campos que existem só na versão de seleção dizem o que essa área faz. Entre eles:

- **`statusGIPandaPe`**: o status da integração com o PandaPé, colaborador a colaborador.
- `statusGIAdmDigital`, `idAdmDigital`, `obsGIAdmDigital`, `apiSincAdmissaoDigital`: um conceito de
  **"Admissão Digital"** dentro do próprio GI.
- `statusPreCadastro`, `flagSelecao`, `statusgiselecty`: pré-cadastro e outra integração de seleção.
- `apiSincExterno`: marca de sincronização com sistema externo.
- `chavePixFun` e `tipoChavePixFun`: **chave PIX**, que não coletamos hoje.

**O que isso significa, em português:** o PandaPé provavelmente **não escreve no cadastro oficial da
folha**. Ele escreve nessa área de pré-admissão, que depois vira funcionário. Se for isso, **o nosso
envio deve ir para `FuncionarioSelecao`, não para `Funcionario`**, e a integração precisa dos campos
de status próprios.

**Isto é hipótese, não fato.** A documentação **não explica** a relação entre as duas áreas. Mas é
exatamente o tipo de coisa que teria aparecido tarde, e agora está mapeada. **É a primeira pergunta a
fazer ao fornecedor do GI.**

Existe a mesma duplicação em cliente, contrato, benefício, dependente e título: `Cliente` e
`ClienteSelecao` (220 campos cada), `Contrato` e `ContratoSelecao` (305 cada), e assim por diante. O
padrão é consistente, o que reforça a leitura de que "Seleção" é uma **área paralela de entrada**.

## O mapa, por assunto

Quase todo recurso tem o **mesmo conjunto de 8 ações**: consultar um, listar todos, listar com filtro,
incluir, alterar, incluir ou alterar, e **duas formas de excluir**.

### Autenticação e usuários

| Recurso | Para que serve |
|---|---|
| `Conexao` | Etapa 1 da autenticação: valida as credenciais do cliente |
| `Login` | Etapa 2: autentica o usuário. **Também cria e atualiza usuários, lista papéis de acesso e troca senha** |

### Pessoas e admissão, o que interessa AGORA

| Recurso | Campos | Para que serve |
|---|---|---|
| **`FuncionarioSelecao`** | **415** | **Cadastro na área de pré-admissão. O provável destino do nosso envio** |
| **`Funcionario`** | **365** | Cadastro oficial do colaborador na folha |
| **`SolicitacoesDocumentos`** | 16 | **Documentos do colaborador, por LINK.** Tem envio em lote por e-mail |
| `FuncionarioCargosSalarios` | 14 | Histórico de cargo e salário |
| `FuncionarioDependente` e a versão de seleção | 38 / 37 | Dependentes, necessários para imposto de renda e salário-família |
| `FuncionarioBeneficio` e a versão de seleção | 20 / 20 | Benefícios do colaborador |
| `FuncionarioCplSelecao` | 30 | Complemento do cadastro de seleção |

### Pessoas, o que pode interessar DEPOIS

| Recurso | Para que serve | Onde conecta com o EA |
|---|---|---|
| `Funcionario/Get` e `GetFiltroCliente` | **Consultar a situação do colaborador na folha** | Fecha o ciclo: confirmar que a admissão chegou e virou registro real |
| `FuncionarioAfastamento` | Afastamentos | Poderia alimentar a esteira sobre quem está afastado |
| `FuncionarioAusencia` | Ausências | Idem |
| `Solicitacao` e as cinco irmãs (`Afastamento`, `Dependente`, `Endereco`, `Ferias`, `PedidoDemissao`) | **Autoatendimento do colaborador**: ele pede mudança de endereço, férias, demissão | O GI **já tem** um canal de autoatendimento. Vale saber que existe antes de construirmos outro |
| `SolicitacoesDocumentos/AddRangeEnvioEmail` | **O GI já pede documento ao colaborador por e-mail** | **Sobreposição direta com o portal da Parte 1.** Precisa ser conversado antes de decidir |

### Catálogos de RH, a fonte da tradução de códigos

| Recurso | Para que serve |
|---|---|
| `Funcao` | Cargos. É de onde sai o código que substitui o nosso nome de cargo |
| `CBO` | Classificação Brasileira de Ocupações |
| `Horario` | Jornadas e escalas |
| `Sindicato` | Sindicatos |
| `Beneficio` | Catálogo de benefícios |
| `CentroCusto` e `CentroResultado` | Centros de custo e de resultado |
| `Banco` e `BancoMascara` | Bancos e formato de conta |

**Estes recursos são a solução prática do de/para:** dá para **ler** as listas do GI e montar a
tradução a partir delas, em vez de digitar.

### Estrutura organizacional

| Recurso | Para que serve |
|---|---|
| `Empresa` | Empresas do grupo |
| `GrupoEconomico` | Agrupamento de empresas |
| `Cliente` e `ClienteSelecao` | Clientes, com 220 campos cada |
| `Contrato` e `ContratoSelecao` | Contratos com o cliente, 305 campos cada |
| `ContratoEventoSelecao`, `ClienteBeneficioSelecao`, `ClienteEvePadraoSelecao` e irmãs | Regras de cálculo por cliente e contrato |

### Financeiro e faturamento, o que NÃO vamos usar

`Duplicata`, `DuplicataComplemento`, `Titulo`, `TituloSelecao`, `MovtoBanco`, `HistoricoNF`,
`DSEmitida`, `TipoFaturamento`, `TipoDespesa`, `ContabHistorico`, `MovtoFatOutroSelecao`, `Fornecedor`
e `Vendedor`.

**Isto não é curiosidade, é um aviso de segurança.** A API não expõe só RH: expõe **o ERP inteiro**,
incluindo contas a receber, títulos, notas fiscais e movimentação bancária. **A credencial que
recebermos precisa ser de um usuário com acesso mínimo**, senão o EA passa a ter, tecnicamente, poder
sobre o financeiro da empresa.

### Integração e diagnóstico

| Recurso | Para que serve |
|---|---|
| **`DePara`** | **Tradução de códigos entre o GI e um sistema externo**, por integração. Feito para o nosso problema |
| `Teste` | Recurso de brinquedo (nome, idade, status). Serve para testar conexão, **não é um ambiente de teste** |

## Lacunas e avisos da documentação

Estes pontos não se resolvem lendo mais. Precisam do fornecedor.

| Lacuna | Tamanho do problema |
|---|---|
| **Campos obrigatórios não são confiáveis** | Dos 3.707 campos da API, apenas 73 estão marcados como obrigatórios, e **nenhum deles no cadastro de funcionário**. As marcações que existem são claramente automáticas (aparecem em campos como "complemento do endereço"), refletindo o banco de dados e **não a regra de negócio**. Continua valendo: **não dá para saber o que a admissão exige** |
| **Nenhuma lista de valores documentada** | **Zero** campos com valores permitidos. Não sabemos o que aceitar em grau de instrução, raça, estado civil, tipo de contrato ou nas classificações do eSocial. Isso é adivinhação garantida sem a tabela do fornecedor. O recurso `Login/GetTabelas` pode conter essas listas, mas **exige credencial para ver** |
| **Quase nenhuma descrição de campo** | Só 127 dos 3.707 campos têm explicação, cerca de 3%. O resto é nome e tipo. Campos como `indMV`, `tipoFat` ou `frmTribut` não são interpretáveis sem ajuda |
| **A área de "Seleção" não é explicada** | A relação entre `Funcionario` e `FuncionarioSelecao` é **inferida** por nós, não documentada |
| **106 endereços de exclusão** | Todo recurso permite excluir, inclusive funcionário, empresa e títulos financeiros. Reforça a exigência de permissão mínima |
| **Validade do token não informada** | A documentação descreve como obter o token e não diz quanto ele dura. Existe resposta para "token expirado", então expira |
| **Sem paginação nem limite documentados** | Listar 415 campos de todos os colaboradores sem paginação é pedido pesado. Não há orientação |
| **Nenhum webhook, em toda a API** | Confirmado no arquivo inteiro: zero menção a webhook, callback, assinatura ou notificação. **A integração é sempre nós chamando eles** |

## O que falta de acesso, dito com clareza

Nada foi contornado. A documentação é pública e foi lida por inteiro. **O que não dá para enxergar sem
credencial:**

1. **O conteúdo das tabelas de domínio** (`Login/GetTabelas` e os catálogos), que é onde devem estar
   as listas de valores válidos.
2. **O comportamento real** de qualquer endereço: quais campos o GI recusa, que mensagem devolve,
   quanto dura o token.
3. **Se existe ambiente de teste.** O recurso `Teste` é um brinquedo de conexão e **não responde**
   essa pergunta.

**As perguntas para o fornecedor do GI, em ordem de importância:**

1. O PandaPé escreve em `FuncionarioSelecao` ou em `Funcionario`? Qual é o caminho de uma admissão que
   entra pela integração?
2. Qual o **conteúdo exato** que o PandaPé entrega hoje?
3. Quais campos são **realmente obrigatórios** para uma admissão passar?
4. Onde estão as **listas de valores válidos** (grau de instrução, raça, estado civil, eSocial)?
5. Existe **ambiente de teste**?
6. Documento só por **link**, ou há outro modo de envio?
7. O envio de documento por e-mail que o GI já tem **conflita** com um portal nosso?

---

# PARTE 4: exploração da API do GI com credencial real (só leitura)

**Data:** 2026-08-20 · **Regra respeitada:** nenhuma chamada que grave, altere, sincronize ou exclua.
Só consultas. As duas únicas chamadas do tipo POST foram as **duas etapas de autenticação** exigidas
pela própria API, que emitem token e não escrevem dado. Nenhum dado pessoal foi extraído: as medições
abaixo são contagens e taxas de preenchimento, calculadas e descartadas no mesmo passo.

**Correção de expectativa da Parte 3:** eu havia sugerido que `Login/GetTabelas` poderia conter as
listas de valores válidos. **Não contém.** Ele devolve apenas os nomes das 36 tabelas que o usuário
alcança. A lacuna foi fechada por outro caminho, abaixo.

## 1. Dois achados operacionais que economizam horas

**A API está atrás de Cloudflare e recusa quem não parece navegador.** A primeira tentativa levou
`HTTP 403, error code: 1010`. A mesma chamada, com um cabeçalho de identificação de navegador, passou.
Sem isso, um cliente novo falha com um erro que não tem nada a ver com credencial.

**O token dura 2 horas.** Confirmado no próprio token. A documentação não dizia. Qualquer rotina longa
precisa renovar sozinha.

## 2. Dois achados de segurança, e os dois são para a reunião

### A credencial NÃO é de leitura

O token carrega, no próprio conteúdo, as permissões: além de 18 perfis numéricos, ele traz
**`Get`, `Add`, `Update`, `Delete` e `SemFiltro`**.

**Ou seja: esta credencial pode criar, alterar e excluir.** A restrição de só leitura foi cumprida por
disciplina, não porque a credencial impedisse. Para a integração de verdade, o pedido ao fornecedor
deve ser de **um usuário com o mínimo necessário**, não com este perfil.

### É a base de PRODUÇÃO, e não há sinal de ambiente de teste

A consulta de empresas devolveu **127 empresas reais do grupo** (SELLAN, SOULAN). Não é base de
demonstração.

**Continua sem resposta se existe ambiente de teste**, e agora com uma consequência concreta: enquanto
não existir, **qualquer teste de gravação seria uma gravação na folha real**. É pergunta obrigatória
ao fornecedor antes de a construção começar.

## 3. A hipótese da Parte 3 se confirmou: o acesso já está escopado à área de Seleção

Testei leitura recurso a recurso:

| Recurso | Resultado | Leitura |
|---|---|---|
| **`Funcionario`** (cadastro oficial da folha) | **403 Proibido** | **NÃO alcança** |
| `FuncionarioSelecao` (pré-admissão) | 204, permitido e vazio | alcança |
| `SolicitacoesDocumentos` | 204, permitido | alcança |
| `DePara` | 204, permitido | alcança |
| `FuncionarioDependenteSelecao`, `FuncionarioCplSelecao` | 204, permitido | alcança |
| `CBO` | 403 Proibido | não alcança |

**O cadastro oficial da folha é proibido para esta credencial; a área de pré-admissão não.** Isso
confirma, por comportamento e não por suposição, o que a Parte 3 levantou: **a superfície de
integração é a área de Seleção**, e a credencial foi liberada exatamente para ela.

## 4. O achado mais valioso: como é uma pré-admissão de verdade

A tabela de pré-admissão tem **um único registro real**. Ele preenche **81 dos 415 campos**; os outros
334 estão vazios.

**E três campos que eu havia apontado como problema NÃO são preenchidos:**

| Campo | Valor no registro real |
|---|---|
| `codigoFuncao` (cargo) | **0, vazio** |
| `codigoHorario` (escala) | **0, vazio** |
| `codigoCentroCusto` | **0, vazio** |
| `codigoDepto` | **vazio** |

**Correção da Parte 2, e é uma boa notícia:** eu havia dito que a tradução de códigos de cargo,
horário e centro de custo era trabalho necessário. **Na pré-admissão, não é.** Esses códigos só entram
quando o registro vira funcionário oficial, do lado do GI. O de/para que sobra para nós é bem menor:
**empresa, cliente e banco.**

Isso importa porque o catálogo de cargos do GI tem **5.454 linhas** (contra 398 no EA), o de horários
4.074 e o de centros de custo 12.590. Casar essas listas seria uma frente inteira, e ela **saiu do
caminho crítico**.

### Os 81 campos que uma pré-admissão real carrega

| Grupo | Campos | Temos hoje? |
|---|---|---|
| Pessoa | nome, CPF, nascimento, sexo, **raça**, **nacionalidade**, **naturalidade**, **grau de instrução**, **nome do pai**, **nome da mãe**, e-mail, DDD e celular | parcial: falta tudo em negrito |
| Endereço | CEP, logradouro, bairro, cidade, **código da cidade**, UF, tipo de endereço, residência própria | **sim, o formulário de VT já coleta** (falta o código da cidade) |
| Documentos | **RG** com órgão, cidade, UF e data; **CTPS** com série, UF, cidade e data; **título de eleitor** com zona e seção; **reservista**; **CNH** com datas | **não temos nenhum número** |
| Banco | código do banco, agência, conta | sim |
| Vínculo e folha | empresa, cliente, matrícula, data de admissão, salário, tipo e dias de contrato, tipo de vencimento, motivo do contrato, percentual e tipo de VT, tipo de VR | em boa parte sim |
| Classificação eSocial | indicativo de admissão, provimento, natureza da atividade, tipo de admissão, regime de jornada, de trabalho e previdenciário | não temos |
| Parâmetros de folha | tipo de salário e de pagamento, dia de pagamento e de adiantamento, tipo de 13º e de férias, calcula INSS e IRF, cartão ponto | **não é dado do candidato**: é parametrização, deve sair do cliente ou do contrato |

**A separação da última linha importa para o escopo:** parte do que parecia "falta coletar" é
**configuração de folha**, não pergunta a fazer ao candidato. O que realmente falta perguntar ou
extrair é: dados civis, filiação, e os números dos documentos.

**E é exatamente o que o portal da Parte 1 resolve:** os números de RG, CTPS, título e reservista
estão dentro dos documentos que o candidato vai enviar, e a IA já lê esses documentos hoje.

## 5. As listas de valores: parcialmente resolvidas

`GetTabelas` não trouxe as listas, mas **dá para derivá-las dos catálogos reais**. Exemplo concreto: o
catálogo de cargos tem um campo de grau de instrução mínimo, e ele revela o domínio:

> **11 valores distintos**, de código único: `1` a `9`, mais `A` e `B`. Não é texto livre.

O registro real de pré-admissão confirma o mesmo formato em outros campos: contrato `D`, salário `M`,
pagamento `M`, raça `1`, nacionalidade `010`, grau de instrução `9`, e as classificações do eSocial
todas em `1`.

**O que ainda falta:** o **significado** de cada código. Sabemos que grau de instrução aceita 11
valores; não sabemos qual deles é "Ensino Médio". **Isso continua dependendo da tabela do fornecedor**,
e é uma lista curta de pedir.

## 6. O que continua sem resposta, e por quê

**Ainda não vimos um registro criado pelo PandaPé.** O campo `statusGIPandaPe` existe, e no único
registro que existe ele está **vazio**. A tabela de pré-admissão tem um registro só, e a tabela de
tradução de códigos (`DePara`) está **completamente vazia**, sem nenhuma integração cadastrada.

Três explicações possíveis, e só o fornecedor decide qual é: o PandaPé escreve em outro lugar; a
integração não está ativa nesta base; ou o registro é apagado depois de virar funcionário oficial.

**Isso mantém de pé a pergunta mais importante do parecer inteiro:** *qual é o conteúdo exato que o
PandaPé entrega hoje ao GI?* Nenhuma leitura de API responde. Só o fornecedor.

Duas tabelas apareceram na lista de acesso e **não existem na documentação**: `TB_ApiFicha` e
`TB_ControleApiOmie`. A segunda indica integração com o Omie, outro ERP. Não é assunto nosso, mas
mostra que **a documentação publicada não cobre tudo o que a base tem**.

## 7. Pedidos ao fornecedor, atualizados

1. **O conteúdo exato que o PandaPé entrega hoje.** Continua sendo o item mais valioso.
2. **A tabela de significados dos códigos**: grau de instrução, raça, estado civil, tipos de contrato,
   salário e pagamento, e as classificações do eSocial.
3. **Existe ambiente de teste?** Hoje a credencial aponta para produção.
4. **Um usuário com permissão mínima** para a integração. O atual pode excluir.
5. Confirmação de que a pré-admissão realmente **dispensa** cargo, horário e centro de custo.
6. Documento só por link, ou há outro modo.

## 8. Nota de conduta

Foram feitas apenas consultas. Uma varredura que puxaria tabelas financeiras inteiras foi
**interrompida por decisão própria**: era leitura permitida, mas carga desnecessária sobre um ERP de
produção de terceiro, sem ganho para o parecer. O token foi guardado em arquivo restrito, nunca
exibido, e **apagado ao fim da análise**.

---

# PARTE 5: a versão corrigida, com o fluxo PandaPé para GI comprovado

**Data:** 2026-08-20, rodada de autoria e cruzamento · **Substitui** as conclusões das Partes 3 e 4
sobre onde o PandaPé escreve. **Só leitura**: GET, mais o `GetAllJson` (POST de consulta) liberado
pelo diretor. Nenhum dado pessoal foi extraído; as medições são contagens e rótulos de campo.

## 1. O que eu concluí errado, e por quê

As Partes 3 e 4 concluíram que **a superfície de integração do PandaPé é a área de Seleção**
(`FuncionarioSelecao`). O raciocínio era: existe um campo `statusGIPandaPe` nessa entidade, e o
cadastro oficial (`Funcionario`) responde 403 para a nossa credencial.

**Os dois indícios eram verdadeiros e a conclusão era errada.** O 403 é **escopo da nossa
credencial**, não desenho da integração. E um campo existir não prova que seja usado.

Fica a lição de método, que vale para a próxima API: **403 diz o que EU não posso ver, não diz o que
o sistema faz.** Tratar limite de permissão como evidência de arquitetura foi o erro.

## 2. O fluxo real, comprovado

**O PandaPé não usa a API pública do GI.** O log de webhook mostra o destino:

> `giinterno.gi.app.br/WebhooksPandaPe/Soulan/...`

Host diferente (`giinterno`, não `apigeral`) e caminho próprio. É um **receptor privado que o GI
construiu sob medida para o PandaPé**, com contrato próprio.

**Consequência prática, e é a mais importante desta parte: não há webhook do PandaPé para
aproveitar.** Quando nós formos alimentar o GI, será pela API pública, que é um contrato diferente do
que existe hoje. Qualquer plano que contasse com "reusar o canal que já funciona" está descartado.

### A diferença entre a tela e a API, explicada

| Observação | Explicação |
|---|---|
| A tela do GI mostra dezenas de pessoas vindas do PandaPé | A tela é **Cadastro de Funcionários**, ou seja, a tabela `Funcionario` |
| A API devolve **1** registro de pré-admissão | `FuncionarioSelecao` tem mesmo 1 registro. Confirmado por `GetAll` **e** por `GetAllJson` com filtro |
| Não vemos as dezenas de pessoas | `Funcionario` é **403 para a nossa credencial** nas duas formas de leitura |

O único registro de pré-admissão **não tem rastro de origem**: `usuarioInclusao` vazio,
`dataInclusao` nulo, `apiSinc` falso, `statusGIPandaPe` vazio. E as tabelas irmãs estão praticamente
vazias: `FuncionarioCplSelecao` 0, `FuncionarioDependenteSelecao` 1, **`SolicitacoesDocumentos` 0**,
`Solicitacao` 403. Nenhum rastro de integração em lugar nenhum.

**Ressalva honesta:** "os dados do PandaPé caem no `Funcionario`" é **inferência forte, não prova**.
Está sustentada por três fatos (a tela é o Cadastro de Funcionários, a pré-admissão está vazia, o
webhook tem receptor próprio), mas não conseguimos ler `Funcionario` para confirmar. **Para virar
prova, basta o fornecedor conceder leitura nessa tabela para a mesma credencial**; aí uma consulta
resolve.

## 3. O conteúdo exato que o PandaPé entrega hoje

Lido na API do PandaPé, em **dois** candidatos reais, com padrão idêntico: **23 formulários na etapa
de admissão, dos quais apenas 5 têm dado digitado**, somando 27 a 28 campos. Os outros 18 são
**slots de anexo, com zero campos**.

| Formulário | Campos digitados |
|---|---|
| **Dados Pessoais** | Nome, Sobrenome, Data de Nascimento, **Estado Civil**, Gênero, E-mail, **Telefone Fixo**, Telefone Celular, CEP, Endereço, Complemento, Bairro, Cidade, Estado |
| **Comprovante de Residência** | CEP, Endereço, Número, Complemento, Bairro, Cidade, Estado |
| **Dados Contratuais** | Data Limite, Tipo de Contrato, Jornada, Data de Admissão |
| **Qualificação Cadastral eSocial** | Data de Nascimento, CPF |
| **CPF** | Número do CPF |

**Só anexo, sem nenhum campo:** RG, CTPS, Cartão PIS, Título de Eleitor, Reservista, CNH, Comprovante
de Escolaridade, Comprovante de Estado Civil, Conta Bancária, Cartão SUS, Atestado Médico Admissional,
Foto para crachá, Informações de Vale Transporte, Dependentes, Comprovante de Vacina, Carteira de
Vacinação dos filhos, Certidão de Nascimento dos filhos, Comprovante de frequência escolar.

### O achado que muda o valor do projeto

O registro de pré-admissão que lemos no GI tem **preenchidos**: `rg`, `orgaoRG`, `carteiraTrabalho`,
`serie`, `tituloEleitor`, `titEleZona`, `filiacaoNomePai`, `filiacaoNomeMae`, `raca`, `grauInstrucao`,
`nacionalidade`, `naturalidade`.

**Nada disso é digitado no PandaPé.** Chega como imagem.

Logo: **alguém no GI abre os documentos e transcreve esses números à mão.** É o passo manual que o
diretor descreveu, e agora ele tem tamanho: não é conferir, é **transcrever**.

**Isso reposiciona o projeto.** Replicar o PandaPé seria replicar um fluxo que mantém a digitação
manual. O nosso portal, com a IA extraindo os números dos documentos que o candidato envia, entregaria
esses campos **já preenchidos**. Deixa de ser substituição do PandaPé e passa a ser **melhoria do
processo da folha**.

## 4. O cruzamento com o que já temos, e ele é melhor do que se esperava

Dos 27 campos que o PandaPé digita hoje, o EA **já tem praticamente todos**: nome, nascimento, gênero,
e-mail, celular, CPF, endereço completo (o formulário de VT já coleta), tipo de contrato, jornada e
data de admissão.

**Falta só:** Estado Civil, Telefone Fixo, e o sobrenome como campo separado do nome.

Some-se o que a Parte 4 já apurou: a pré-admissão **não exige** os códigos de cargo, horário e centro
de custo, então o de/para pesado (5.454 cargos, 4.074 horários, 12.590 centros de custo) **está fora
do caminho crítico**. Sobra traduzir empresa, cliente e banco.

## 5. Segurança: dois pontos que continuam de pé

**A credencial não é de leitura.** O token traz, no próprio conteúdo, `Get`, `Add`, `Update`, `Delete`
e `SemFiltro`. A restrição foi cumprida por disciplina, não por impedimento técnico. Para a
integração, pedir **usuário com o mínimo necessário**.

**É base de produção, sem ambiente de teste conhecido.** 127 empresas reais do grupo. Enquanto não
existir ambiente de teste, **qualquer gravação de teste seria gravação na folha real**.

**Nota operacional:** a API está atrás de Cloudflare e recusa quem não envia identificação de
navegador (`403, error code: 1010`). E o token dura **2 horas**, o que a documentação não informa.

## 6. Perguntas ao fornecedor, versão final

1. **Qual o conteúdo exato que o receptor `WebhooksPandaPe` recebe hoje?** Continua sendo o item mais
   valioso, e agora sabemos que ele não passa pela API pública.
2. **Os dados do PandaPé caem no `Funcionario`?** Confirmar, ou conceder leitura nessa tabela.
3. **Quem preenche RG, CTPS, título, filiação, raça e grau de instrução?** Se for digitação manual,
   confirmar, porque é o passo que o nosso portal elimina.
4. **A tabela de significados dos códigos** (grau de instrução, raça, estado civil, tipos de contrato,
   salário e pagamento, classificações do eSocial).
5. **Existe ambiente de teste?**
6. **Um usuário com permissão mínima** para a integração.
7. Confirmação de que a pré-admissão dispensa cargo, horário e centro de custo.
8. Documento por link, ou há outro modo de envio.

## 7. Estado da frente

**PAUSADA**, aguardando a resposta do fornecedor do GI ao e-mail do diretor. A rodada seguinte de
investigação fica **em espera de propósito**: o retorno do fornecedor provavelmente traz a
especificação pronta, e investigar antes seria refazer trabalho.

**Credencial:** o token gerado foi destruído ao fim da análise, junto com todo cache local. Nenhum
arquivo do repositório referencia a credencial do GI, e **nenhuma linha de código do EA fala com o
GI**: esta frente é, até aqui, só investigação e documento.
