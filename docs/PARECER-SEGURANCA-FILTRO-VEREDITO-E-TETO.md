# Parecer De Segurança: O Filtro "Só Sobe O ENTREGUE" E O Teto De Tentativas

**VEREDITO: VETADO NO MAPA** (§A.38 e §A.40 regra 1, antes de o código existir). O veto é de RECORTE,
não de direção: a decisão do diretor está certa e conserta um defeito real de produção. O que não passa
é construí-la com o mapa que o coordenador entregou, que descrevia **dois** escritores do prontuário.

**São QUATRO escritores e CINCO gatilhos, e DOIS dos quatro NÃO podem receber o filtro**, sob pena de
parar o arquivamento do contrato assinado e do formulário de VT.

**Quem auditou:** agente `seguranca`, sem escrita (§A.39). **Método:** adversarial, por varredura e por
medição contra o banco de produção. **Data:** 18/09/2026. **Gravado pelo coordenador**, que reconferiu
as quatro medições que decidem o recorte (seção 6).

---

## 1. Quem Escreve No Prontuário, E A Prova De Que A Lista É Completa

**A prova, em três passos:**
1. **Um único ponto no mundo cria arquivo no Drive:** `apps/ai-service/app/drive.py:453`. Os outros
   dois pontos de criação do arquivo criam PASTA, não arquivo.
2. Essa função tem **exatamente dois chamadores**, os dois dentro do mesmo tratador de
   `POST /drive/arquivar` (`app/routers/drive.py:215` e `:265`, o segundo é a retentativa do primeiro).
3. Essa rota tem **um único cliente** no EA: `ai/ai-client.service.ts:451-453`. Varredura no
   repositório inteiro não devolve nenhuma chamada solta, nem no frontend, nem em script.

Logo, a lista dos escritores é a lista dos chamadores daquele método, e ela é fechada.

| # | escritor | onde | o que sobe | tem linha em `documentos_admissao`? |
|---|---|---|---|---|
| 1 | **Lote do fechamento da régua** | `auditoria/auditoria.service.ts:1056` | tudo que estiver na pasta temporária | às vezes |
| 2 | **ASO sozinho** | `auditoria/auditoria.service.ts:831` | o ASO | sim |
| 3 | **Formulário de VT da coleta** | `vt-coleta/vt-coleta.service.ts:317` | o PDF do VT | **muitas vezes NÃO** |
| 4 | **Contrato assinado da Clicksign** | `clicksign/clicksign-sync.service.ts:598` | o PDF assinado | **NUNCA** |

**O terceiro e o quarto são o furo.** Se "fluxo inteiro" for lido como "põe o filtro no ponto único":
- **o contrato assinado para de ser arquivado, em 100% dos casos.** `CONTRATO_ASSINADO` não é tipo do
  catálogo, então nunca terá estado ENTREGUE. Derrubaria a INT-4 inteira, e seria a §A.33 pelo avesso:
  em vez de arquivar o que não devia, deixar de arquivar o que devia;
- **o VT coletado fora da régua para de ser arquivado**, desfazendo decisão do diretor escrita no
  próprio código ("fora da régua: apenas arquivado, sem criar pendência").

**O filtro pertence ao escritor 1, e só a ele.**

**Os cinco gatilhos do escritor 1**, todos herdando o filtro: o pós-veredito da IA; a validação humana;
a criação de prontuário sob demanda na tela de Diagnóstico; a **reconciliação automática do Drive**
(`diagnostico/reconciliacao-drive.service.ts:212` e `:239`); e o runner de carga do ASO. **O quarto
roda sozinho, sem operador**, então qualquer regressão chega à produção sem um clique humano no
caminho, e o teste tem de cobrir esse gatilho.

---

## 2. O Que Quebra Com O Filtro

### 2.1 O Filtro NÃO Fecha O Caso Mais Comum, E Isso Precisa Ser Dito

O estado vive em `documentos_admissao`, que é **por tipo**. A pasta temporária é **por arquivo**, e o
nome só carrega o código do tipo. **E ela guarda o histórico das tentativas do mesmo tipo:** cada
auditoria grava os arquivos daquela tentativa e **não apaga os anteriores**. A limpeza por tipo existe,
mas tem um único chamador automático, o reenvio do ASO, mais a ação manual de descartar.

Consequência: candidato manda a carteira, a IA reprova, ele manda de novo e a IA aprova. O tipo fica
ENTREGUE e **os bytes da tentativa reprovada continuam na pasta com o mesmo código**. Os dois passam
pelo filtro.

**O filtro fecha o caso do tipo reprovado que nunca foi reenviado, e NÃO fecha o caso do reprovado que
foi reenviado.** Fechar exige apagar as tentativas anteriores quando uma nova chega, o que tem efeito
colateral (o consultor perde a visualização das tentativas velhas) e é **decisão do diretor**.

### 2.2 O Prazo De 48 Horas Não É O Prazo Real Do Arquivo Reprovado

O expurgo olha a data do **diretório da admissão**, não a de cada arquivo. Todo arquivo novo reinicia o
relógio da admissão inteira. Numa admissão viva que recebe documento a cada poucas horas, o binário
reprovado **pode passar semanas** na pasta. O filtro não piora isso, mas desmente a frase
tranquilizadora, e a §A.6 diz TTL de 48 horas. **Pendência própria, proposta e não construída.**

### 2.3 Os Três Jeitos De Fechar Demais, Todos Medidos

Fechar demais também é dano, e é dano que aparece como prontuário incompleto meses depois.

| risco | medido | régua |
|---|---|---|
| juntar por tipo **ativo** | **214 documentos ENTREGUE pertencem a tipos INATIVOS** | a consulta **não** filtra por ativo |
| ler **veredito da IA** em vez do estado | **1.352 documentos estão ENTREGUE por validação HUMANA**, contra 14.382 pela IA | o filtro lê `estado = 'ENTREGUE'`, e nada mais |
| casar pelo código **cru** | hoje os 33 códigos são alfanuméricos e a sanitização é identidade, então nada quebra **agora** | casar sempre pelo código **sanitizado**, porque o CRUD de tipos é aberto ao administrador |

### 2.4 O ASO No APTO: Conflito Com Decisão Anterior Do Diretor, 4 Casos Reais

O escritor 2 sobe o ASO **pela condição do APTO, não pelo veredito**, e isso está escrito no código como
decisão do diretor (`esteira/esteira.service.ts:2332-2334`). **Medido: 4 admissões com EXAME em APTO
cujo ASO está INCONFORME**, contra 413 com o ASO ENTREGUE. Aplicar o filtro ali deixaria essas 4 sem
ASO no prontuário, o que é falha de conformidade trabalhista, não ganho de LGPD. **É conflito de
decisão, e a fábrica não o resolve sozinha (§A.14).**

### 2.5 O Aviso De Prontuário Incompleto Passa A Mentir, Se O Filtro Entrar No Lugar Errado

A marca de "pasta sem arquivo" é calculada **antes** do filtro. Existe o caso "a pasta tinha arquivos e
o filtro esvaziou": a pasta nasce vazia e o motivo **não** é gravado, que é exatamente o silêncio que a
OST do re-baixar existiu para matar. **A marca passa a ser derivada da lista FILTRADA.**

**Contraponto igualmente importante:** o que o filtro descartou **não** vira motivo de falha. Régua
fechada significa zero obrigatório pendente, o que sobrou é facultativo ou tentativa velha, e gravar
como falha acende o sinal do Diagnóstico à toa e treina o time a ignorar o sinal. É contagem de log,
com código de tipo e nada mais.

### 2.6 O Re-baixar Do Pandapé Continua Certo, E Já Obedecia À Regra Nova

Ele já seleciona **exatamente** os tipos com estado ENTREGUE, então nada nele precisa mudar. Ele **não
escreve** em `documentos_admissao`, e a trava é estrutural: o serviço não tem banco injetado, e há teste
com espião. **Essa trava permanece.** O filtro fica no consumidor da lista, jamais dentro do caminho de
re-baixa.

**Limite honesto:** o estado é do TIPO, não do binário. O arquivo re-baixado pode não ser o mesmo que a
IA aprovou, e o filtro não tem como notar. Não é regressão, é o teto do que "estado ENTREGUE" prova.

### 2.7 Um Ganho De Graça Que Ninguém Tinha Levantado

A pasta temporária também recebe o KIT e, transitoriamente, o CONTRATO. Nenhum dos dois é tipo do
catálogo, e o lote de hoje sobe **qualquer coisa** que esteja na pasta: numa admissão cujo prontuário
ainda não nasceu e cujo kit já foi gerado, o lote levaria o **kit CRU, sem assinatura**, para o
prontuário. É o mesmo dano da §A.33, por uma porta que a guarda da §A.33 não cobre. **O filtro fecha
essa porta como efeito colateral.**

---

## 3. O Lado LGPD

**A mudança MELHORA a §A.6, e de forma material.** Hoje um documento que o sistema REPROVOU vai para o
prontuário **permanente** do funcionário: guardar indefinidamente um documento pessoal que nunca foi
aceito é retenção sem finalidade. Com o filtro, o reprovado fica só no transitório, que já é fora do
banco e já tem prazo. **Nenhum repositório novo, nenhum dado pessoal em lugar novo.** E um pedido de
exclusão deixa de precisar caçar reprovados espalhados no definitivo.

**Duas ressalvas:** o prazo real do reprovado não é 48 horas (seção 2.2), e **o log do filtro não pode
virar vazamento**: registra-se contagem e código de tipo, nunca nome de arquivo, caminho, nome de
pessoa ou a observação da IA.

---

## 4. O Teto De Tentativas Do Portal

**Hoje não existe contador nenhum**: varredura nos 21 arquivos do módulo devolve só tetos de bytes, de
tempo e de emissão de credencial. É desenho novo, e é bom que a auditoria chegue antes.

### 4.1 Pode Ser Forjado? Depende De Duas Escolhas Fáceis De Errar

- **Onde mora:** linha durável em banco, remontada a cada pedido. Nada de claim no bilhete, cookie ou
  memória de processo. O padrão certo já existe no módulo e está explicado em comentário.
- **De que a chave é feita, e este é o furo mais provável:** se a chave for a credencial ou o
  identificador do link, **pedir um link novo zera o teto**. A chave é **(admissão, tipo de
  documento)**, e sobrevive a reemissão e a troca de aparelho.
- **A corrida:** dois envios simultâneos leem o mesmo número e os dois passam. O conserto já existe no
  repositório: ler DENTRO da transação que grava.
- **Quem incrementa:** o servidor, no mesmo ato do veredito, nunca a partir do que o cliente reporta.

### 4.2 Conta A Coisa Certa? Só Se Contar REPROVAÇÃO

**Consome tentativa:** veredito INCONFORME e veredito PENDENTE (ilegível), mais as duas reprovações
decididas sem IA (responder em texto no lugar do anexo, e PDF com senha).

**NÃO consome:** envio aprovado; **falha de infraestrutura** (leitor fora, tempo esgotado, cota da IA,
rede caída); e **recusa técnica** (acima de 10 MB, acima de 20 páginas, tipo não aceito). A auditoria
tem cauda medida de até 79 segundos e o Portal mata o processo aos 20: **um celular lento queimaria as
três tentativas sem a pessoa jamais ter recebido um veredito.** Uma foto grande derrubaria o candidato
em três toques.

### 4.3 O Registro Carrega Dado Pessoal, E O EA Já Tem Onde Pôr

"Quantas vezes esta pessoa falhou e quando desistiu" é dado comportamental de pessoa identificada. O
caminho fechado já existe: a trilha do Portal grava **só por allowlist** e **não existe gravação solta
no módulo**. O evento entra por ali, como tipo novo do catálogo. O contador guarda **número e carimbo
de tempo**, não o histórico dos arquivos.

### 4.4 O Teto Vira Porta Trancada? Vira, Em Três Cenários

1. **Teto global em vez de por pendência:** uma foto ruim de um documento tranca a pessoa nos outros
   oito. Tem de estar na chave, não só no texto.
2. **A regra é que está errada, e a pessoa paga.** As 91 regras ativas **não foram validadas pelo RH**
   (pendência §A.9). Uma regra errada reprova documento bom três vezes e o candidato conclui que o
   sistema não o quer. **Recomendação: destravamento humano**, um Master podendo zerar as tentativas
   daquela pendência, com trilha. *Proposto e NÃO construído (§A.31): é decisão do diretor.*
3. **Cair para a fila do time em silêncio** é abandono: a pessoa para de tentar e o time não sabe que
   herdou o caso. **A queda tem de ser visível ao time**, e a visibilidade que já existe (o documento
   continua reprovado e aparece no modal) é a que deve ser reusada.

**Uma separação que não pode ser fundida:** o teto de tentativas serve ao **candidato**, para tirá-lo
do laço; a cota de emissão serve ao **sistema**, contra abuso. Fundidos, um protege mal e o outro pune
errado.

---

## 5. As Cinco Condições Que Levantam O Veto

1. **O filtro mora em `arquivarNoDriveSemTrava` e em nenhum outro lugar.** Proibido no cliente de IA e
   proibido na rota do Drive: pararia o contrato assinado e o VT fora da régua.
2. **A régua literal:** o arquivo sobe quando o código sanitizado casa com um documento em estado
   ENTREGUE daquela admissão. **Sem** juntar por tipo ativo, **sem** ler veredito de IA, **sem** filtro
   por sexo.
3. **A marca de pasta sem arquivo passa a ser derivada da lista FILTRADA**, e o descartado vira
   contagem no log, nunca motivo de falha.
4. **O teste cobre o gatilho AUTOMÁTICO** (a reconciliação), não só o clique.
5. **Duas perguntas ao diretor, antes de construir** (§A.14 e §A.26): o ASO no APTO, e a criação de
   prontuário sob demanda na tela de Diagnóstico, que passa a criar pasta com menos arquivos.

E o que o filtro sozinho **não** resolve, para não ser vendido como resolvido: a tentativa reprovada
anterior do mesmo tipo continua subindo (seção 2.1).

---

## 6. A Consolidação Do Coordenador

§A.39 passo 4: consolidar é conferir. As quatro medições que decidem o recorte foram refeitas pelo
coordenador, direto no banco de produção, e **bateram exatamente**:

| medição | resultado |
|---|---|
| documentos ENTREGUE em tipos INATIVOS | **214** |
| documentos ENTREGUE por validação HUMANA | **1.352** (contra 14.382 pela IA) |
| admissões com EXAME em APTO e ASO INCONFORME | **4** (contra 413 com ASO ENTREGUE) |
| tipo de catálogo para o contrato assinado | **zero**, ele não existe no catálogo |

As correções de recorte foram repassadas ao `backend` **durante a construção**, e não depois, para o
furo não nascer.
