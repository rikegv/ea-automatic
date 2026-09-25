# Parecer De Segurança: O Mapa Do Híbrido, Antes Do Primeiro Código

**Veredito: MAPA APROVADO COM SEIS CONDIÇÕES BLOQUEANTES.** A direção do híbrido é a certa e fecha
mais do que abre. O que não passa é despachar o `backend` com o mapa como está: ele descreve o DESTINO
e não descreve as travas que precisam viajar junto, e três delas, se nascerem erradas, degradam
exigência já fechada sem nada falhar. As seis condições estão na seção 6 e são a linha do briefing.

**Quem auditou:** agente `seguranca`, sem poder de escrita (§A.39). **Régua:** §A.6, §A.11, §A.24,
§A.38, §A.40 regra 1, e os dois pareceres anteriores. **Método:** adversarial, por varredura, com
arquivo e linha. **Auditado:** o MAPA, não o código, que ainda não existe. **Data:** 18/09/2026.
**Gravado pelo coordenador**, que é quem tem escrita, com a reconciliação da seção 7.

---

## 1. Quem Mais Escreve, Lê Ou Assina. A Lista, E A Prova De Que Ela É Completa

A pergunta obrigatória do briefing (§A.40), respondida por varredura, coisa por coisa.

### 1.1 O Objeto No Balde

| papel | quem | evidência |
|---|---|---|
| assina a credencial de escrita | `portal-armazenamento.service.ts:90-105` | único chamador da assinatura com escrita do candidato |
| assina a consulta de metadado | `portal-armazenamento.service.ts:118-133` | consulta, conta de LEITURA |
| assina a correção de tipo | `portal-armazenamento.service.ts:169-188` | cópia sobre si, conta de LEITURA |
| deveria apagar, e não apaga | `portal-armazenamento.service.ts:216-223` | só registra e devolve falso |
| implementa a assinatura | `gcs-assinatura-v4.ts:186-205` | um único ponto de assinatura |
| carrega a chave privada | `gcs-assinatura-v4.ts:51-60` | único importador |

**A lista é completa, e a prova é a varredura:** a função de assinar e a de carregar credencial
aparecem em **um** arquivo de produção fora do próprio módulo de assinatura, que é
`portal-armazenamento.service.ts`. As variáveis `PORTAL_GCS_*` aparecem em **dois** arquivos de
produção, e em **zero** arquivos do `ai-service`. Não há segunda porta que assine para este balde.

**Consequência para o mapa, e ela é boa:** tirar a chave privada do EA toca **três** pontos de chamada
e **um** ponto de implementação, todos no mesmo módulo. É a parte mais barata da mudança.

### 1.2 O Contador De Emissão

**Escritores de `portal_credenciais`, TODOS eles:** `portal-credencial.service.ts:218` (insere a linha,
dentro da trava), `:533` (carimba a confirmação) e `:585-586` (incrementa a extração).
**Leitores:** `:96` e `:104`, do mesmo arquivo.

**A prova de completude:** a tabela é referenciada por **dois** arquivos no repositório inteiro, o
serviço e o schema. Não existe runner, carga, script de manutenção nem outra frente escrevendo nela. A
trava de aviso sobre o identificador do link (`portal-credencial.service.ts:199`) serializa instâncias
do backend, não só requisições.

**Consequência para o mapa:** o contador está genuinamente fechado hoje, e o híbrido **não precisa
tocá-lo**, desde que a emissão do bilhete continue sendo o ato contado. Se o bilhete passar a ser
emitido em outro lugar, ou passar a valer mais de uma vez, a trava continua intacta e passa a contar a
coisa errada, que é pior do que não contar.

### 1.3 O Bilhete De Sessão

**Quem verifica:** `portal-sessao.guard.ts:58`, único ponto. **Quem emite: NINGUÉM.** A varredura da
função de assinar no backend devolve exatamente três chamadores: `auth/auth.service.ts:25` e `:38`
(acesso e renovação do sistema) e `vt/vt.service.ts:139` (sessão do VT). **Nenhum deles emite o bilhete
do Portal**, e o próprio guard diz por quê (`portal-sessao.guard.ts:20-23`): o emissor é a frente de
identidade, que é outra entrega.

**Este é o achado mais acionável do mapa, e ele é de oportunidade.** A migração para Ed25519 custa,
hoje, **um arquivo**: o guard. Não há emissor para migrar, não há bilhete em circulação, não há janela
de convivência, não há compatibilidade a manter. Feita depois que o emissor existir, ela vira migração
de credencial viva, com dois algoritmos aceitos ao mesmo tempo, que é o modo de falha que a pergunta do
briefing antecipou. **Migrar agora, antes do emissor.**

### 1.4 O Estado Do Documento

Aqui está a segunda porta, e ela é real. `documentos_admissao` tem **ONZE** pontos de escrita, dos quais
o Portal é **um**:

| escritor | linha | o que faz |
|---|---|---|
| Portal | `portal/portal-credencial.service.ts:553-566` | grava `AGUARDANDO_AUDITORIA`, **com guarda**: só sobre `PENDENTE` e só sem validador humano |
| Reauditoria, troca de arquivo | `reauditoria/documento-arquivo.service.ts:195-207` | grava `PENDENTE`, **SEM guarda de estado** |
| Esteira, veredito do ASO | `esteira/esteira.service.ts:2245-2258` | grava o estado do veredito, **SEM guarda de estado** |
| Auditoria, falha da IA | `auditoria/auditoria.service.ts:495` | grava o estado da falha |
| Auditoria, coleta | `auditoria/auditoria.service.ts:279` e `:360` | insere |
| Reauditoria | `reauditoria/reauditoria.service.ts:134` | limpa a marca humana |
| Validação humana | `reauditoria/validacao-humana.service.ts:63` | insere |
| Esteira | `esteira/esteira.service.ts:2208` | insere |
| Admissões | `admissoes/admissoes.service.ts:645` e `:1315` | insere pela régua |
| VT coleta | `vt-coleta/vt-coleta.service.ts:515` | insere |
| Runner de destrava | `db/destrava-aguardando-auditoria.ts:107-119` | move `AGUARDANDO_AUDITORIA` para `INCONFORME` |

**A prova de completude:** varredura de inserção, atualização e remoção sobre a tabela em todo
`apps/backend/src`, excluído o que é teste. Onze resultados, listados acima, sem exceção.

**Os dois que importam para o híbrido, e nenhum deles estava no mapa do coordenador:**

1. **`reauditoria/documento-arquivo.service.ts:195-207` devolve o documento a `PENDENTE` sem olhar o
   estado anterior.** Um documento que o candidato JÁ enviou pelo Portal, com cota consumida e objeto
   gravado, volta a `PENDENTE` e o objeto continua no balde. Hoje isso é só desperdício. **Com o expurgo
   ativo que o híbrido introduz, isso vira uma pergunta de ordem:** quem apaga aquele objeto, e o que
   acontece se o documento voltar a `PENDENTE` depois de o objeto ter sido apagado. A resposta segura é
   a única aceitável: o expurgo apaga por decisão do caminho do arquivo, e nenhum caminho pode assumir
   que o objeto ainda existe. Abster-se, nunca falhar alto em cima do candidato.
2. **`db/destrava-aguardando-auditoria.ts:107-119` age exatamente sobre o estado que o Portal escreve.**
   Ele só não alcança o documento do Portal por um detalhe: a ramificação de staging vazia, documentada
   em `db/destrava-aguardando-auditoria.ts:23-25`, não toca o documento quando não há bytes em staging,
   e o documento do Portal nunca passa pela staging do `ai-service`. **O isolamento existe, e ele é
   acidental.** Uma linha mudada naquele runner, para "sem bytes, marca inconforme por prudência",
   reprova em massa documento que o candidato enviou certo. Isto entra no briefing como restrição, e não
   como esperança.

### 1.5 O Pepper, Que Ninguém Listou E Tem Dois Consumidores

`PORTAL_LOG_PEPPER` é lido em **dois** lugares com finalidades diferentes: a trilha
(`portal-trilha.service.ts:44-51`, falha fechada sem ele) e **o nome do objeto**
(`portal-credencial.service.ts:67-68` e `:206`).

**O risco é de rotação.** Pepper de log se rotaciona por higiene; nome de objeto não pode mudar, ou o EA
perde o caminho de tudo que já está gravado. Hoje o mesmo valor serve aos dois, então rotacionar por um
motivo quebra o outro, **em silêncio**. Não é veto desta frente, é achado do mapa: quando a frente tocar
naming, separar em dois valores, ou registrar por escrito que o pepper não rotaciona.

---

## 2. O Que O Híbrido FECHA

- **Exigência 7, a metade aberta.** Balde em projeto nosso, permissão de remoção concedida por nós, e
  `portal-armazenamento.service.ts:216-223` deixa de ser um registro de lacuna e passa a apagar. É o
  maior prêmio da troca, e ele é real.
- **Exigência 8.** A prova deixa de depender de agenda alheia. Passa a ser executável na semana em que o
  balde existir.
- **Veto V1, na parte do expurgo.** Expurgo ativo na confirmação passa a existir, e a §A.6 é cumprida por
  ato e não por ciclo de vida.
- **A classe inteira de vazamento de chave em repouso.** A chave privada de escrita deixa de existir como
  arquivo: some do cofre, some da entrega, some a rotação.

## 3. O Que O Híbrido REABRE, E Ninguém Escreveu Ainda

### 3.1 A Exigência 2 Degrada Se A Função Montar A String

Hoje as três travas (tipo, faixa de tamanho, proibição de sobrescrever) são escolhidas em
`domain/portal-credencial.ts:186-197`, provadas em `gcs-assinatura-v4.spec.ts:47-99`, e o
`portal-armazenamento.service.ts:82-88` diz por escrito que não acrescenta, não remove e não reordena
nenhuma delas.

**Se a função montar a string canônica, ela escolhe os cabeçalhos, e uma função comprometida omite os
três.** A exigência 2 sai de imposta pela assinatura e vira confiada à função, que é o mesmo
rebaixamento que o parecer anterior vetou na cópia literal do VT. Não basta o mapa dizer "a assinatura
passa para a identidade de runtime": ele precisa dizer **quem monta os bytes**.

### 3.2 A Capacidade De ASSINAR Muda De Vizinhança, E Isso É Novo

Hoje a chave vive num processo **loopback** atrás da VPN. No híbrido, quem assina é uma identidade de
runtime de uma função **exposta à internet**. A capacidade de assinar não some, ela **muda de endereço,
para um endereço pior**.

**O que limita o dano é uma coisa só, e é verificável:** a identidade que assina só pode ser criadora de
objeto. Uma URL assinada é autorizada no momento do uso pelas permissões da própria identidade, então,
com criador de objeto e nada mais, uma função comprometida **não consegue** cunhar leitura, listagem ou
remoção, por mais que assine bytes arbitrários. Com administrador de objeto, ou com um papel de leitura
acrescentado depois "para a confirmação funcionar", ela passa a poder cunhar o balde inteiro. **É uma
linha de IAM separando um objeto de dez minutos do balde inteiro para sempre.**

### 3.3 A Remoção Não Pode Morar Na Mesma Identidade

O expurgo ativo é ganho, e ele introduz permissão de APAGAR onde não havia nenhuma. Se ela cair na
identidade que assina, a função comprometida passa a poder apagar prova, que é o padrão de dano da
§A.33. A remoção é identidade separada, nunca a mesma que assina a credencial do candidato.

---

## 4. As Duas Perguntas Diretas Do Briefing

### 4.1 Sobra Alguma Porta Aceitando O Bilhete Simétrico?

**Hoje, não, e é por isso que a migração é barata.** Verificado: `portal-sessao.guard.ts:58` é o único
verificador, e não existe emissor (seção 1.3). Não há bilhete simétrico em circulação para manter
compatível.

**Mas há um furo latente no guard, que a troca de algoritmo transforma em furo real, e ele precisa
entrar no briefing:** `portal-sessao.guard.ts:58` chama a verificação passando **só o segredo**, sem
allowlist de algoritmo. Enquanto a chave é um segredo simétrico isso é contido pela própria biblioteca.
**No dia em que o segundo argumento virar uma chave pública Ed25519, verificação sem algoritmo fixado é
confusão de algoritmo clássica.** A migração tem de trocar as duas coisas de uma vez: a chave e a
fixação explícita do algoritmo, com teste que rejeite um bilhete simétrico forjado e um bilhete com
algoritmo nenhum.

O que **fica** intocado e é bom: o guard é fail-closed sem segredo (`:46-50`), não cai para o segredo do
sistema, e o bilhete não carrega nome nem CPF (`:25-32`), ao contrário do do VT. Nada disso pode se
perder na migração.

### 4.2 O Emissor Sem Estado Permite Trocar O Mesmo Bilhete Por Duas URLs?

**Permite, e o dano real NÃO é sobrescrita.** Vale ser exato, porque a intuição erra aqui.

- **A sobrescrita continua barrada, e por dois mecanismos independentes.** O nome do objeto sai do
  bilhete, e ele contém um sorteio escolhido pelo EA (`portal-credencial.ts:178-181`), então duas URLs do
  mesmo bilhete apontam para o **mesmo** objeto. A trava de geração está **dentro** da assinatura, então
  o segundo envio bem-sucedido é recusado pelo Google. Some-se a restrição de unicidade do objeto no
  banco. Três camadas, e a primeira sozinha já basta.
- **A cota continua intacta.** Quantidade, soma, ritmo e extrações são contados na emissão do BILHETE,
  dentro da transação travada (`portal-credencial.service.ts:198-231`). Um bilhete trocado dez vezes por
  dez URLs consumiu **uma** unidade de cota e produz **um** objeto.
- **O dano real é de TEMPO, e é este que precisa de decisão.** Hoje a credencial vale dez minutos
  (`portal-credencial.ts:45`). Com o emissor sem estado, quem guardou o bilhete pode pedir uma URL NOVA
  depois de a primeira expirar, quantas vezes quiser, até o bilhete vencer. **O prazo efetivo da
  credencial deixa de ser o da URL e passa a ser o do bilhete.** Um bilhete de horas transforma uma
  credencial de dez minutos numa credencial de horas, sem que nada no código do Portal mude e sem que
  nada falhe.

**A régua que resolve, e ela é simples:** o bilhete de troca é **um objeto só**, ele carrega o prazo
final absoluto da credencial, e esse prazo é **o mesmo** dos dez minutos, não o da sessão do candidato.
Bilhete de troca e bilhete de sessão são coisas diferentes e não podem ser o mesmo objeto. Uso único de
verdade é impossível sem estado, e é honesto dizer isso ao diretor: **o que se compra é um teto de tempo
curto, não uso único.** Com dez minutos e cota já debitada, o resíduo é aceitável.

---

## 5. O Que Continua Valendo, E Não É Tocado Pelo Híbrido

- **Veto V3** (`apps/ai-service/app/main.py:28`, roteador do leitor montado também na instância da
  operação): intocado, e continua sendo condição de subida.
- **Veto V2**, exigência 8: continua de pé, e agora é executável.
- **A leitura continua nossa e isolada.** Nada de reusar `apps/ai-service/app/gcs.py`, que carrega a
  credencial unificada (`gcs.py:31-43`) e escreve em staging.

---

## 6. As Seis Condições Do Briefing Do `backend`

| # | condição | por que, com a linha |
|---|---|---|
| **B1** | **O EA monta a string canônica a assinar. A função assina os bytes que vierem DENTRO do bilhete assinado, e nunca monta nome de objeto, cabeçalho nem método.** | senão a exigência 2 sai de `domain/portal-credencial.ts:186-197` e vira confiança na função |
| **B2** | A identidade que assina é **criador de objeto e nada mais**. Nenhum papel de leitura, listagem ou remoção, nunca, nem "temporariamente para testar". | seção 3.2. É o que limita o dano de assinatura de bytes arbitrários |
| **B3** | **A remoção mora em identidade separada.** O expurgo ativo não pode ser alcançável pela identidade que assina. | seção 3.3, §A.33 |
| **B4** | **O bilhete de troca é objeto próprio, de um objeto só, com prazo absoluto igual ao da credencial de hoje.** Não reaproveitar o bilhete de sessão do candidato. | seção 4.2. Sem isso o prazo da credencial vira o da sessão |
| **B5** | **A migração para Ed25519 acontece AGORA, no guard, junto com a fixação explícita do algoritmo**, com teste que rejeite bilhete simétrico e bilhete sem algoritmo. | seção 1.3 e 4.1. Hoje custa um arquivo; depois do emissor, custa uma convivência |
| **B6** | **O expurgo nunca assume que o objeto existe, e nunca derruba o caminho ao falhar.** E o caminho do arquivo tem de conviver com o documento voltando a `PENDENTE` por fora. | `reauditoria/documento-arquivo.service.ts:195-207` escreve sem guarda de estado |

**Duas restrições que não são do `backend` e precisam estar ditas no mesmo despacho:**
`db/destrava-aguardando-auditoria.ts:107-119` só não alcança o documento do Portal pela ramificação de
staging vazia, e isso é acidental, não desenhado. E o `PORTAL_LOG_PEPPER` serve a duas coisas (seção
1.5): quem mexer em nome de objeto precisa saber que rotacioná-lo apaga o caminho do que já existe.

**Reauditar quando:** o código existir. O veto cai contra evidência, nunca contra declaração.

---

## 7. A Reconciliação Do Coordenador: Onde `arquiteto` E `seguranca` Divergiram

§A.39: o contrato compartilhado tem um dono só, e o dono é o coordenador. Os dois agentes trabalharam em
paralelo e divergiram em dois pontos. As decisões abaixo são as que foram para o briefing da construção.

**Divergência 1, quem monta os bytes da assinatura.** O `arquiteto` escreveu que o emissor deve ter
**régua própria** e conferir tipo, tamanho, prazo e formato do nome, senão ele "só renomeia a chave". O
`seguranca` escreveu, em B1, que **o EA monta a string canônica** e a função só assina o que veio dentro
do bilhete, senão a exigência 2 vira confiança na função.

**As duas estão certas e não se excluem, e a união é a régua adotada:** o EA **monta** a string canônica
e os três cabeçalhos, tudo dentro do bilhete assinado; o emissor **não monta nada** e **não obedece
cegamente**: ele confere o que veio contra a própria configuração (tipo na lista, bytes no teto, prazo no
teto, formato do nome, balde certo) e, passando, assina **exatamente aqueles bytes**. Quem escolhe é o
EA; quem pode recusar é o emissor; ninguém acrescenta. Uma implementação em que o emissor remonte a
string está VETADA por B1, e uma em que ele assine sem conferir está vetada pelo desenho do `arquiteto`.

**Divergência 2, migrar a sessão para Ed25519.** O `arquiteto` diz que **não muda nada** em
`portal-sessao.guard.ts`, porque a VS7 fala do token que SAI da nossa VM e a sessão não sai, e que migrar
custa uma chave a mais sem fechar furo. O `seguranca` diz, em B5, para **migrar agora**, porque hoje
custa um arquivo e depois custa uma convivência de dois algoritmos.

**Decisão do coordenador: migrar agora, e o motivo não é o algoritmo, é a janela.** O ponto que decide é
factual e foi medido pelos dois: **não existe emissor do bilhete de sessão hoje**, então não há nada em
circulação para manter compatível, e essa janela fecha no dia em que a frente de identidade nascer. O
`arquiteto` está certo em que a migração não compra segurança enquanto só nós verificamos; o `seguranca`
está certo em que ela fica cara depois. Migrar num momento em que o custo é um arquivo e o risco é zero é
a escolha barata. **O que era inegociável nos dois pareceres, e vai junto: fixar explicitamente o
algoritmo aceito**, que hoje não é fixado (`portal-sessao.guard.ts:58`) e que, com chave pública, é
confusão de algoritmo clássica. *A divergência fica registrada aqui para o diretor, que pode reverter.*
