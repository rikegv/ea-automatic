# Desenho: Lojas e Unidades, do A&S ao ADM

**Data:** 01/09/2026. **Estado:** DESENHO, nada construído. Aguarda aprovação do diretor.
**Origem:** frente aberta pelo diretor, que muda a decisão de 25/08/2026 de usar o centro de custo
como aproximação de loja, e ampliada pelo requisito de que a loja **nasce no A&S** e **viaja** para o
ADM junto com a admissão.

---

## Decisões já tomadas pelo diretor (01/09/2026)

1. **O cenário 1 (lojas dentro do CNPJ, caso CRM) é construído primeiro.** As admissões estão vivas e
   é a frente que dá mais trabalho. O cenário 2 (CAGC) vem depois.
2. **O nome do cenário 2 é CAGC**, não KGC.
3. **A importação B alcança o HISTÓRICO** (admissões concluídas), com interruptor na tela para
   escolher entre vivas ou vivas mais concluídas. Não falseia status, só enriquece a análise (§A.16).
4. **O aviso de pendência em massa está aceito.** Cadastrar a primeira loja de um cliente torna
   pendentes, na hora, as admissões vivas dele sem loja. O time operacional trata.
5. **A loja nasce no A&S, na abertura da vaga, e viaja para o ADM.** No cenário 1 o A&S escolhe a
   loja dentro do cliente; no cenário 2 escolhe o grupo e depois a loja. A admissão chega ao ADM já
   com a loja preenchida, e o editar e o olhinho do ADM continuam existindo para corrigir.

Nenhuma linha de código foi escrita. §A.31: o que aparece aqui como sugestão é proposta, não
construção.

---

## AVISO QUE MUDA A ORDEM: a ponte A&S para ADM não existe hoje

Antes de desenhar a viagem da loja, é preciso dizer o que a verificação mostrou, porque o pedido parte
de uma premissa que a base não sustenta ainda.

**Medido na produção em 01/09/2026:**

| Verificação | Resultado |
|---|---|
| Vagas na Central de Vagas (produção) | **0** |
| Candidaturas na Central de Candidatos (produção) | **0** |
| `as_candidaturas.admissao_id` preenchidos | **0** |
| Código que **escreve** `as_candidaturas.admissao_id` | **nenhum** |
| Código do ADM que **lê** `as_candidaturas` | **nenhum** |
| Admissões criadas a partir de uma candidatura | **nenhuma** |

O próprio schema declara isso, e não é descuido: a coluna `admissao_id` está comentada como *"A PONTE
FUTURA COM A ESTEIRA. Nasce NULA e NÃO É USADA nesta onda: nenhuma admissão nasce daqui, nenhuma
frente é criada, nada é lido."* A Central de Vagas existe em homologação e a base histórica de 2.363
vagas ainda não foi importada.

**Hoje as admissões nascem por dois caminhos, e nenhum deles passa pelo A&S:** o webhook do Pandapé,
que cria a admissão e a joga na Liberação Admissional, e o wizard manual do ADM.

**O que isso significa para este desenho, sem drama e sem mudar o que o diretor quer:**

- O **campo de loja na abertura da vaga** pode e deve ser construído. Ele é o lugar certo, e é onde o
  centro de custo ficou dormente em 22/08.
- A **viagem** da loja para o ADM só entrega valor no dia em que a ponte existir. Enquanto ela não
  existe, a loja escolhida no A&S fica guardada na vaga e não alcança admissão nenhuma.
- Portanto o **ADM continua sendo o caminho autoritativo** de vinculação (liberação, wizard, editar,
  olhinho e as duas importações), e a escolha do A&S vira **pré-preenchimento** no dia da ponte.
- **A chave da viagem já existe nos dois lados e ninguém a usa:** `vagas.id_vacancy_pandape` e
  `admissoes.id_vacancy`. Do lado do ADM ela já está populada em **394 admissões**. É por ali que a
  loja viaja quando a ponte for construída, e a seção 3.4 desenha exatamente isso.

**Recomendação de sequenciamento:** construir o lado ADM primeiro (que é onde estão as 85 admissões
vivas e as 844 do histórico dos clientes multi loja) e o campo do A&S junto, mas com a expectativa
correta de que a viagem só liga quando a ponte ligar. Isso está refletido na ordem da seção 7.

---

## 1. O terreno de hoje, medido

Números tirados da produção em 01/09/2026, não estimados.

| Fato | Número |
|---|---|
| Clientes cadastrados | 247 |
| Registros de dados de folha (`dados_vaga_folha`) | 2.780 |
| Com centro de custo preenchido | **1.358** |
| Valores distintos de centro de custo | 435 |
| Valores distintos após normalizar caixa e espaço | 424 |
| **Admissões VIVAS no sistema inteiro** | **85** |
| Admissões com `id_vacancy` (a chave da futura ponte) | 394 |

*Correção de um número do pedido original: são **1.358** admissões com centro de custo preenchido,
não 2.100. O 2.100 é próximo do total de admissões, e a maioria delas não tem o campo.*

**Os clientes que hoje usam o centro de custo como loja**, que é a prática que esta frente substitui:

| Código | Cliente | Valores distintos | Admissões totais | **Vivas** | Com centro de custo |
|---|---|---|---|---|---|
| 56566 | DIA BRASIL | 60 | 97 | 0 | 82 |
| 56842 | NIBS / **CRM** | 46 | 200 | **12** | 144 |
| 56002 | HOSPITAL ALEMÃO OSWALDO CRUZ | 27 | 188 | **4** | 181 |
| 51726 | PROPARTS | 15 | 26 | 0 | 23 |
| 55880 | GARRETT MOTION | 14 | 107 | **1** | 73 |
| 66 | MEIWA | 8 | 226 | 0 | 33 |
| | **Total** | **170** | **844** | **17** | **536** |

Com a decisão 3 do diretor, a importação B alcança as 844, e não só as 17. É o que faz o Alto Volume
por loja somar de verdade em vez de mostrar 17 linhas e um monte de "sem loja".

**O grupo do cenário 2 também já existe na base, informal e sujo:**

| Fato da RAIA DROGASIL S/A | Número |
|---|---|
| Códigos de cliente | **98** |
| CNPJs distintos | **96** |
| Rótulos distintos em `nome_operacao` | 21 |

`CAGC CORIFEU` (36 códigos) e `RAIA CAGC CORIFEU` (17) são quase certamente o mesmo grupo, separados
só por prefixo e espaço à direita. Depois vêm `RAIA CAGC FREI CANECA` (11), `RAIA CAGC RIB. PRETO` (7)
e `RAIA CAGC CENTRO OESTE` (6). **E a Raia não é sozinha:** BUNGE (10 códigos, 8 CNPJs), SONOVA (7 e
3), WURTH (7 e 7), PROPARTS (5 e 5), IFF (5 e 4), DANISCO (4), PUMA (4), CNA (3), TENDA (3 e 1).

### O que já existe e NÃO se confunde com loja

- **`cliente_vinculos`** (240 linhas) diz qual **empresa do Grupo Soulan** contrata, por tipo de
  serviço e filial. É o nosso lado do contrato, não a unidade do cliente. Eixos diferentes.
- **`nome_operacao`** é o apelido do cliente na operação. Na Raia virou depósito informal do CAGC, e
  por isso serve de semente do de/para, mas não de modelo.
- **`vagas.centro_custo`** está **dormente** desde a OST de 22/08: o diretor tirou o campo da
  abertura, o DTO passou a **recusar** o campo (com `forbidNonWhitelisted`, corpo antigo é rejeitado
  em vez de gravar em silêncio) e a listagem não o devolve. **A coluna ficou de propósito**, porque
  `DROP COLUMN` é destrutivo. É exatamente o buraco que a loja vem ocupar, no lugar certo.

### O que já existe e SERVE de base pronta

- **`admissoes/matriculas-import.ts`**, a importação de matrículas **por CPF**. Lê **XLSX e CSV**
  decidindo pelos **magic bytes** e não pela extensão, tolera separador vírgula ou ponto e vírgula,
  com ou sem cabeçalho, e CPF com ou sem pontuação. `ExcelJS` e `csv-parse` já são dependências:
  **as importações desta frente não precisam de nenhuma biblioteca nova**.
- **O par prévia e aplicar**: `POST /admissoes/matriculas/previa` lê e diz o que vai acontecer sem
  gravar, e `PATCH /admissoes/matriculas` grava. O comentário do código diz o porquê, e vale igual
  aqui: *"importação que grava direto é importação que ninguém confere, e o estrago aparece depois"*.

---

## 2. O fluxo completo, ponta a ponta

O caminho que a loja percorre, do A&S ao ADM, com o estado de cada trecho.

```
  A&S, Central de Vagas                      ADM, Esteira
  ─────────────────────                      ────────────
  Abertura da vaga
    escolhe o CLIENTE                        (cenário 1: o CNPJ mãe)
    escolhe o GRUPO ────────┐                (cenário 2: filtra os CNPJs)
    escolhe a LOJA ─────────┤
                            │
                       vagas.loja_id
                            │
                            │  a VIAGEM (depende da ponte, seção 3.4)
                            ▼
                     admissoes.loja_id ◄──── liberação do ADM (seletor)
                            │           ◄──── wizard do ADM (seletor)
                            │           ◄──── editar e olhinho (correção)
                            │           ◄──── importação B (lote, CPF para loja)
                            ▼
                     régua de pendências, Gerenciador, Alto Volume
```

| Trecho | Estado hoje | O que este desenho propõe |
|---|---|---|
| Catálogo de lojas por cliente | não existe | tabela `cliente_lojas` mais tela no menu gerencial |
| Importação das lojas | não existe | importação A |
| Loja na abertura da vaga (A&S) | não existe (centro de custo dormente) | coluna `vagas.loja_id` mais seletor |
| Viagem A&S para ADM | **a ponte não existe** | desenhada na 3.4, liga quando a ponte ligar |
| Loja na liberação e no wizard (ADM) | não existe | seletor condicional |
| Correção (editar e olhinho) | não existe | campo editável |
| Vinculação em massa | não existe | importação B |
| Cobrança de loja | não existe | chave `LOJA` na régua |
| Alto Volume por loja | agrupa por centro de custo | troca a chave de agrupamento |

---

## 3. Cenário 1: lojas dentro de um CNPJ único (caso CRM)

Um cliente, um CNPJ, um código, e várias lojas reais. A loja **não tem CNPJ próprio**, compartilha o
da mãe. Ela é **nome mais endereço**, para análise. Não é dado contábil nem de faturamento.

### 3.1 Modelo de dados

```
cliente_lojas
  id             uuid    PK
  cod_cliente    varchar FK -> clientes.cod_cliente (on delete cascade)
  nome           varchar NOT NULL          -- "Loja Morumbi"
  endereco       text                      -- nome + endereço é a definição da loja
  codigo_externo varchar NULL              -- opcional, o código que o cliente usa lá dentro
  ativo          boolean NOT NULL default true
  criado_em / atualizado_em
  UNIQUE (cod_cliente, nome_normalizado)   -- índice funcional, ver nota
```

Duas colunas de vínculo, uma de cada lado da ponte:

```
admissoes.loja_id   uuid NULL  FK -> cliente_lojas.id (on delete set null)
vagas.loja_id       uuid NULL  FK -> cliente_lojas.id (on delete set null)
```

**Decisões dentro do modelo, cada uma com o porquê:**

1. **A loja mora em tabela própria, não em `dados_vaga_folha`.** Ela é atributo do **cliente**,
   reutilizado por N admissões e N vagas, e é catálogo mantido na tela do cliente. Repetir o nome por
   admissão recriaria o texto livre que esta frente veio eliminar.
2. **O vínculo da admissão mora em `admissoes`, não em `dados_vaga_folha`.** A loja é onde a pessoa
   trabalha, propriedade da admissão, lida por Esteira, Gerenciador, Alto Volume e liberação. Em
   `dados_vaga_folha` exigiria um `join` a mais em toda consulta que hoje não toca a folha.
3. **`vagas.loja_id` é coluna nova e NÃO reusa `vagas.centro_custo`.** A dormente fica dormente. São
   tipos diferentes (uma é texto livre, a outra é chave estrangeira) e reaproveitar a coluna antiga
   misturaria o histórico das vagas velhas com o catálogo novo. O comentário da dormente já diz que a
   coluna fica só guardando o que as vagas antigas tinham.
4. **`ativo` em vez de deletar.** Loja fechada some da lista de escolha sem apagar o histórico de quem
   foi admitido nela. Mesmo padrão do catálogo de tipos de documento (§A.3).

*Nota sobre a unique: comparar nome cru deixaria passar "Loja Centro" e "LOJA CENTRO ". A recomendação
é unique sobre o nome normalizado (maiúsculas, espaços colapsados, acentos removidos), como índice
funcional. É essa mesma normalização que as duas importações usam para casar nomes.*

### 3.2 O lado A&S: a loja na abertura da vaga

**Onde entra.** No **passo 1 da trilha de abertura**, o de identificação, que é exatamente onde o
centro de custo morava antes de sair em 22/08. O campo novo fica logo abaixo do cliente, porque
depende dele.

**Comportamento, e é o mesmo do ADM de propósito:**

- Escolhido o cliente, se ele **tem** lojas ativas, o seletor de loja aparece com a lista daquele
  cliente.
- Se **não tem**, o seletor nem aparece. Vaga de cliente sem lojas não pergunta nada.
- Trocar o cliente **limpa** a loja escolhida. Uma loja do CRM não pode sobreviver a uma troca para o
  DIA, e deixar o campo preenchido depois da troca é como se grava vínculo errado sem ninguém ver.

**A loja NÃO entra na régua de obrigatórios da vaga**, e isso é recomendação, não omissão. A régua de
publicação (`vagaPendencias`, no shared-types) governa o que trava a publicação da vaga, e o cliente
da vaga é **nulável por desenho**: na base real só 31 de 164 clientes casaram com o cadastro do EA.
Exigir loja para publicar travaria vaga cujo cliente nem foi resolvido ainda. A cobrança de loja é do
**ADM**, na admissão, onde o cliente já é obrigatório. **Pergunta em aberto 7** deixa isso explícito
para o diretor confirmar.

**O que muda no DTO:** o `AtualizarVagaDto` passa a aceitar `lojaId` opcional, validado contra as
lojas **daquele** cliente no serviço, nunca só pelo formato. Enviar a loja de outro cliente é
recusado. O `centroCusto` continua recusado como está hoje.

### 3.3 O lado ADM: liberação, wizard, correção

| Ponto | Comportamento |
|---|---|
| **Liberação (individual)** | Escolhido o cliente, se ele tem lojas ativas aparece o seletor. Se a admissão já vier com loja pela viagem, o campo chega **preenchido** e editável. |
| **Liberação em massa** | O lote já escolhe um cliente só, então o seletor entra ao lado, valendo para o lote inteiro. **Pergunta em aberto 8.** |
| **Wizard (Nova admissão)** | Mesmo comportamento da liberação. |
| **Editar (Gerenciador)** | Campo de loja editável. É o caminho de correção de admissão que veio sem loja ou com a loja errada. |
| **Olhinho (ficha)** | Mostra a loja e permite vincular quando está vazia. Correção individual. |
| **Importação B** | Correção em lote. Ver 3.6. |

**O editar e o olhinho continuam sendo a autoridade final**, mesmo depois de a ponte existir. A loja
que veio do A&S é um preenchimento, não um cadeado: o A&S abre a vaga semanas antes, e a pessoa pode
acabar alocada em outra loja. Quem corrige é o ADM, e a correção **nunca volta para a vaga**, porque
a vaga registra o que foi pedido e a admissão registra o que aconteceu.

### 3.4 A VIAGEM: como a loja passa do A&S para o ADM

**Depende da ponte A&S para ADM, que não existe (ver o aviso no topo).** O que segue é o desenho de
como a loja viaja **no dia em que a ponte for construída**, e a boa notícia é que ela não pede nada
além do que a ponte já vai precisar.

**Os dois caminhos possíveis, e a recomendação:**

**Caminho 1, o direto: a candidatura vira admissão.** É a ponte declarada no schema
(`as_candidaturas.admissao_id`). No dia em que uma candidatura aprovada gerar a admissão, o serviço
que a cria já tem a candidatura na mão, e a candidatura aponta para a vaga. Então:

```
as_candidaturas.vaga_id  ->  vagas.loja_id  ->  admissoes.loja_id
```

A loja é copiada **no momento da criação**, junto com o cliente e o cargo que virão pelo mesmo
caminho. Uma linha a mais no mesmo `insert`. **É o caminho recomendado.**

**Caminho 2, o de reconciliação: casar pelo id da vaga do Pandapé.** Enquanto a admissão nascer pelo
webhook do Pandapé e não pela candidatura, a ligação possível é:

```
admissoes.id_vacancy  ==  vagas.id_vacancy_pandape   ->  vagas.loja_id
```

As duas colunas **já existem**, e do lado do ADM `id_vacancy` já está populada em **394 admissões**.
Nenhuma das duas é usada para ligar nada hoje. Este caminho serve como **preenchimento na liberação**:
quando o consultor abre a Liberação Admissional, se a vaga correspondente existir na Central de Vagas
e tiver loja, o seletor já vem sugerido com ela.

**Três regras da viagem, valendo para os dois caminhos:**

1. **A loja só viaja se o cliente bater.** Se a admissão está no cliente X e a loja da vaga pertence
   ao cliente Y, a loja **não** é copiada. É a mesma trava da importação B, pelo mesmo motivo.
2. **A viagem PREENCHE, nunca sobrescreve.** Se a admissão já tem loja, a da vaga é ignorada. Quem
   chegou depois não apaga decisão de quem já estava lá.
3. **A viagem é registrada na trilha**, como a Sala de Espera já faz quando sugere o cliente
   (`"(sugerido pela Sala de Espera)"`). A loja preenchida por viagem aparece como sugerida, para o
   consultor saber que aquilo veio do A&S e não da mão dele.

### 3.5 Importação A: subir as lojas de um cliente por planilha

**O cliente é escolhido NA TELA, não vem na planilha.** A importação acontece dentro da tela daquele
cliente, e o `cod_cliente` vem do contexto. É deliberado: uma coluna de código de cliente na planilha
é uma chance a mais de criar as lojas do CRM dentro do DIA por causa de um número digitado errado, e
esse erro é silencioso.

**Formato:** XLSX ou CSV, decidido pelos magic bytes, como a importação de matrículas já faz.

| Coluna | Obrigatória | Observação |
|---|---|---|
| `NOME` | **sim** | Aceita também `LOJA` e `UNIDADE`. |
| `ENDERECO` | não | Aceita `ENDEREÇO`. Metade da definição de loja, mas não trava a carga. |
| `CODIGO` | não | O código que o cliente usa internamente, se houver. |

**Cabeçalho é obrigatório aqui, e é diferença consciente em relação à de matrículas.** Lá a regra
dispensa cabeçalho porque a célula com 11 dígitos se identifica sozinha como CPF. Aqui nome e endereço
são os dois texto livre, e sem cabeçalho não há como saber qual é qual. O reconhecimento é tolerante
(sem acento, qualquer caixa, qualquer ordem de colunas), e se o cabeçalho não for reconhecido a
importação **para com mensagem clara** em vez de adivinhar que a primeira coluna é o nome.

| Situação da linha | Desfecho |
|---|---|
| Nome vazio | **Rejeitada**, com o número da linha. |
| Nome novo | Vai criar. |
| Nome que já existe naquele cliente (normalizado) | **Não duplica.** Marcada como "já existe". Se a planilha trouxer endereço e a loja atual estiver sem, preenche o vazio e **nunca sobrescreve**. **Pergunta em aberto 5.** |
| Nome repetido dentro da própria planilha | Cria **uma vez**, e a prévia mostra quantas linhas colapsaram. |
| Loja existente inativa | Marcada como "existe, inativa". Reativar é ação explícita, não efeito da importação. |

**Prévia obrigatória**, com três listas (vai criar, já existe, rejeitada), e gravação **transacional**:
ou entra tudo, ou não entra nada.

### 3.6 Importação B: vincular CPF para loja em massa

É a que exige mais cuidado, porque escreve em admissão. O desenho **copia a forma da importação de
matrículas**, que já está validada em produção, inclusive nas recusas.

**O cliente também é escolhido na tela**, e aqui ele tem segunda função: define contra qual catálogo
de lojas os nomes da planilha são conferidos.

| Coluna | Obrigatória | Observação |
|---|---|---|
| `CPF` | **sim** | Com ou sem pontuação. A célula com 11 dígitos é o CPF, mesma regra da de matrículas. |
| `LOJA` | **sim** | O **nome** da loja. Se o valor bater com o `codigo_externo` de uma loja daquele cliente, também casa. |

**Nome e não código, com os dois aceitos.** O time tem o nome na mão, e o código externo é opcional e
pode nem existir naquele cliente.

**O interruptor de alcance (decisão 3 do diretor):** a tela oferece **vivas** ou **vivas mais
concluídas**. O padrão é vivas, e alcançar o histórico é escolha explícita de quem sobe a planilha,
para ninguém tocar 844 admissões por engano.

| Situação do CPF | Desfecho |
|---|---|
| Uma admissão no alcance escolhido, no cliente escolhido | **Casa.** Caso normal. |
| **Mais de uma admissão no alcance** | **NÃO adivinha.** Vai para "não casou" com o motivo, e o vínculo é feito pela ficha. Chutar qual recebe a loja é o pior desfecho de uma importação em massa. |
| Nenhuma admissão | Não casa, motivo "CPF sem admissão no alcance escolhido". |
| Admissão de **outro cliente** | Não casa, com o motivo. É a trava que impede a planilha do CRM de escrever no DIA. |
| Admissão já com loja | Casa, e a prévia mostra **loja atual** e **loja nova** lado a lado. **Pergunta em aberto 6.** |

*Medido hoje: **zero CPFs** têm mais de uma admissão viva ao mesmo tempo. Com o alcance histórico
ligado o caso passa a ser comum (o mesmo CPF pode ter várias admissões concluídas, §A.3 regra 6), e é
por isso que a recusa de adivinhar importa mais ainda depois da decisão 3.*

**Pré-admissão `AGUARDANDO_LIBERACAO` fica de fora**, porque ainda não tem cliente definido e não há
catálogo contra o qual conferir o nome da loja. Ela ganha a loja na liberação, que é onde o cliente é
escolhido.

**Se a loja da planilha não existir no cadastro daquele cliente: a linha NÃO casa, e o sistema NÃO
cria a loja.** Deixar a importação B criar catálogo por efeito colateral é exatamente como o centro de
custo virou 435 valores com 11 duplicatas só de digitação. Criar loja é trabalho da importação A. O
que a prévia faz é **agrupar os nomes não encontrados** e mostrar "estes 4 nomes não existem no
catálogo deste cliente", para o time levar a lista à importação A. **Pergunta em aberto 4** decide se
pode haver um atalho explícito.

**Prévia obrigatória** com as três listas (vai vincular, não casou, lojas não encontradas), gravação
**transacional**, e **recálculo do sinalizador** em cada admissão viva tocada, como a de matrículas
faz. Sem o recálculo a pendência de loja continuaria acesa numa admissão que acabou de ganhar loja, e
a coluna do Gerenciador mentiria. *Admissão concluída não é recalculada (§A.16): ela ganha o vínculo
de análise e nada mais.*

**§A.6, obrigatório e não recomendação:**

- O arquivo sobe no **corpo** do POST, nunca em query string. **CPF nunca entra em URL.**
- **Nenhum CPF em log**, nem na prévia, nem na gravação, nem em erro. O log registra contagens.
- O buffer vive **em memória** e é descartado ao fim da requisição. Não vai para staging nem Drive.
- A prévia devolve **nome do candidato** para a tela, porque é o que permite conferir que a loja vai
  para a pessoa certa. Isso é tela, não log, e é o mesmo tratamento da prévia de matrículas.
- A ação entra na **trilha de auditoria** com autor, instante, alcance escolhido e contagens, sem PII.

### 3.7 A regra dura: loja obrigatória quando o cliente tem lojas

**Como a régua funciona hoje.** A fonte única é `pendenciasObrigatorias` (`domain/admissao.ts`), e
todo item passa por um gargalo chamado `cobra`, que consulta `exigido(chave, config)` antes de somar a
pendência. As chaves vivem em `domain/pendencia-config.ts` e a obrigatoriedade por cliente vive em
`cliente_pendencia_config`, onde **ausência de linha significa obrigatório** e só `obrigatorio = false`
desliga. O `sinalizador_preenchimento` deriva daí, então coluna, KPI, radar, modal e sinalizador
concordam por construção.

**A loja é diferente dos onze itens de hoje.** Os existentes são ligados ou desligados por decisão do
diretor. A loja é cobrada por um **fato do cadastro**: o cliente tem lojas ou não tem. Já existe
precedente exato na régua, o par data de admissão e Termo de Banco, onde `isBanco` escolhe qual dos
dois é cobrado. A recomendação é a mesma forma:

```
cobra("LOJA", clienteTemLojasAtivas && !presente(i.lojaId))
```

- **Cliente sem lojas nunca é cobrado.** Nenhum dos 247 clientes muda de estado até alguém cadastrar a
  primeira loja daquele cliente.
- **A chave `LOJA` entra em `CHAVES_PENDENCIA`** e aparece na tela de obrigatoriedade, então o diretor
  pode desligá-la para um cliente que tenha lojas mas não queira a cobrança. O padrão é obrigatório.
- **§A.16 vale igual:** concluída, declinada ou rescindida não é recalculada e não entra em fila.

**A cobrança em bloco é o comportamento aceito (decisão 4):** cadastrar a primeira loja de um cliente
torna pendentes, no mesmo instante, todas as vivas dele sem loja. No CRM são 12 linhas hoje. A ordem
da seção 7 põe essa chave por último de propósito, para que quando ela acender o caminho de resolver
em lote já exista.

### 3.8 Clicksign: não é tocada, e isto foi verificado

**Confirmado no código, não suposto.** O assinante da empresa é resolvido por `cod_cliente` e
`cliente_vinculo_id` (`assinante-empresa.service.ts`), e **o CNPJ do cliente não entra em nenhum ponto
do pipeline de assinatura**. A busca por `cnpj` em `domain/clicksign-assinantes.ts` e em
`clicksign/*.ts` não retorna nada.

Como a loja do cenário 1 **não tem CNPJ** e não muda o `cod_cliente` da admissão, o envelope, os
signatários, os cinco passos, o balde de rate limit e o arquivamento continuam exatamente como estão.
**O cenário 1 não toca a Clicksign.**

### 3.9 O que muda no Alto Volume

Hoje o quadro "Lojas / Unidades" agrupa por `dados_vaga_folha.centro_custo`, e o próprio código
carrega o bilhete explicando que foi decisão consciente de 25/08. Esta frente é a decisão que muda
aquilo.

A troca é de **uma linha de agrupamento**: `group by centro_custo` vira `group by loja_id`, com o nome
vindo de `cliente_lojas.nome`. Tudo o mais fica igual, e isso importa: o quadro tem uma invariante
declarada de **zero conta paralela**, em que cada balde é a mesma expressão do quadro de Cargos,
importada e não copiada, e a soma das lojas fecha com o total da esteira. Trocar só a chave **preserva
a invariante**. Qualquer contagem nova recriaria o risco que a §A.27 existe para evitar.

Ganho concreto: hoje "Loja Centro" e "LOJA CENTRO " são duas linhas. Com catálogo, uma. E com a
decisão 3 (importação B alcançando o histórico), o quadro passa a somar as 844 e não as 17.

---

## 4. Cenário 2: grupo de CNPJs por nome (caso Raia, CAGC Corifeu)

> **SUPERADO POR `DESENHO-CENARIO-2-GRUPO.md` (02/09/2026).** O desenho completo do cenário 2 vive
> lá, com os números medidos na produção de hoje. **Esta seção ficou desatualizada em UM ponto que
> muda o modelo:** aqui a recomendação era **derivar** o grupo pelo join a partir do cliente, e o
> diretor decidiu **CARIMBAR** o grupo na admissão, para que uma loja que troque de grupo não leve a
> história junto. Vale o carimbo. O resto desta seção segue de pé como registro do raciocínio.

*Construção posterior, por decisão do diretor. Desenhado para não se perder.*

O inverso do cenário 1. Cada loja **já é um cliente separado**, com CNPJ próprio e código próprio. O
que falta é a camada de organização por cima: um nome que diga que aqueles 53 códigos são o mesmo
CAGC Corifeu.

### 4.1 Modelo de dados

```
grupos_cliente
  id          uuid    PK
  nome        varchar NOT NULL UNIQUE   -- "CAGC Corifeu"
  descricao   text NULL
  ativo       boolean NOT NULL default true
  criado_em / atualizado_em

grupo_cliente_membros
  grupo_id    uuid FK -> grupos_cliente.id (on delete cascade)
  cod_cliente varchar FK -> clientes.cod_cliente (on delete cascade)
  PRIMARY KEY (grupo_id, cod_cliente)
```

1. **Tabela de ligação, e não uma coluna `grupo_id` em `clientes`.** Uma coluna resolveria o caso de
   hoje. A ligação custa o mesmo e não fecha a porta para um código pertencer a dois recortes.
   **Pergunta em aberto 10.**
2. **Nada é criado nem alterado em `clientes`.** O grupo é leitura por cima do que existe. Nenhum CNPJ
   novo, nenhum código novo, nenhum cadastro tocado.
3. **Nem a vaga nem a admissão ganham coluna de grupo.** Ver 4.2, que é o ponto central deste cenário.

### 4.2 A escolha em dois passos, e por que ela não pede coluna nova

**No cenário 2, a "loja" É o cliente.** Cada farmácia tem CNPJ próprio e já é um `cod_cliente`
cadastrado. Então escolher grupo e depois loja é, na prática, **escolher o cliente em dois passos**:

```
passo 1: grupo  = CAGC Corifeu        -> filtra os 53 códigos daquele grupo
passo 2: loja   = a farmácia          -> ESTE é o cod_cliente da vaga/admissão
```

**O que isso significa, e é a melhor notícia deste cenário:**

- **Nenhuma coluna nova** em `vagas` nem em `admissoes`. O `cod_cliente` que já existe passa a ser
  escolhido por um seletor de dois níveis em vez de uma lista de 98 linhas.
- **O CNPJ "viaja" porque sempre viajou.** Ele está no cadastro do cliente, e a admissão aponta para o
  cliente. Escolhida a farmácia certa, o CNPJ certo já está lá, sem nada novo ser gravado.
- **O grupo é derivado, não copiado.** Quem quiser saber o grupo de uma admissão faz o join
  `admissao -> cod_cliente -> grupo_cliente_membros -> grupos_cliente`. Gravar o grupo na admissão
  criaria uma segunda verdade que envelhece no dia em que um código mudar de grupo.
- **O ganho de usabilidade é o produto principal**, tanto no A&S quanto no ADM: hoje escolher a
  farmácia certa da Raia é achar uma linha entre 98 com a mesma razão social.

**A trilha registra os três**, e isso atende o pedido de "grupo mais loja mais CNPJ registrados": o
grupo e o CNPJ são derivados do `cod_cliente` na hora de exibir, sem duplicar dado. **Pergunta em
aberto 9** confirma se derivar basta ou se o diretor quer o carimbo histórico do grupo na admissão.

### 4.3 Onde aparece

**No fluxo operacional, o grupo só muda COMO se escolhe o cliente**, nunca o que se grava. Fora isso
ele é camada de análise: **menu gerencial** (cadastro do grupo e vínculo dos códigos), **Alto Volume**
(agrupar por CAGC, e as 98 linhas da Raia viram 21 ou menos) e **filtros** multiselect, para "me
mostra tudo do Corifeu" sem selecionar 53 clientes na mão.

**Semente do de/para:** os 21 rótulos de `nome_operacao` da Raia, normalizados, com revisão humana.
`CAGC CORIFEU` e `RAIA CAGC CORIFEU` provavelmente fundem em um. A mesma importação A pode servir de
molde para uma importação de membros do grupo (planilha de `cod_cliente`), se o diretor quiser.

### 4.4 Os dois cenários convivem

```
grupo (CAGC Corifeu)
  └── cliente 56329 (CNPJ próprio)  ← a "loja" do cenário 2
        └── cliente_lojas? só se ESTE cliente também tiver lojas internas
  └── cliente 56330 (CNPJ próprio)
```

Um cliente pode estar num grupo, ter lojas internas, as duas coisas ou nenhuma. O CRM usa o cenário 1,
a Raia usa o cenário 2, e nada obriga um cliente a escolher.

---

## 5. O centro de custo: recomendação

**Manter o centro de custo, separado da loja, e parar de usá-lo como loja.**

O diretor está certo no diagnóstico: a loja é nome mais endereço para análise, e o centro de custo era
a gíria antiga. Mas eliminar o campo seria errado por três motivos medidos:

1. **1.358 registros o têm preenchido**, e nem todos são nome de loja. GARRETT e MEIWA podem estar
   usando o campo com o sentido contábil real.
2. **Ele é pendência obrigatória configurável hoje** (`CENTRO_CUSTO`), e cliente que não usa já pode
   desligar. A máquina para conviver com os dois existe e está validada.
3. **Ele é campo de folha**, irmão de departamento e setor, que o diretor já decidiu serem **três
   coisas distintas e não sinônimos**. Fundir loja com centro de custo repetiria o erro que aquela
   decisão desfez.

**Caminho recomendado, por cliente e não global:** nos seis clientes que usavam o centro de custo como
loja, cadastrar as lojas, vincular e **desligar a pendência `CENTRO_CUSTO`** na tela de obrigatoriedade
que já existe. Nos demais, nada muda.

**Do lado do A&S, o centro de custo continua dormente e não volta.** A loja ocupa o lugar dele na
trilha de abertura, e a coluna antiga segue guardando o que as vagas antigas tinham.

O que **não** se recomenda: apagar a coluna, ou renomear a coluna para loja. A primeira perde
histórico, a segunda quebra a distinção que a operação usa.

---

## 6. A migração do legado

**Princípio, §A.16: histórico não se reescreve.** Vincular loja a uma admissão concluída não falseia
status nenhum, só enriquece a dimensão de análise, e o diretor já decidiu que a importação B alcança
esse histórico (decisão 3).

**A migração tem ferramenta:** ela é a **importação A** mais a **importação B**, operadas pelo time.

1. **Extrair a semente.** Para cada um dos seis clientes, a lista de valores distintos de centro de
   custo (60, 46, 27, 15, 14 e 8) vira uma planilha. De/para com origem no dado real.
2. **Revisão humana na planilha, antes de subir.** O time funde as variações de digitação, corrige
   nomes e acrescenta o **endereço**, que não existe em lugar nenhum hoje e é metade da definição de
   loja. Este passo não é opcional.
3. **Importação A** cria o catálogo daquele cliente.
4. **Importação B**, com o alcance histórico ligado, vincula as admissões.
5. **O que não casar fica sem loja**, visível e corrigível pelo olhinho. **Nunca adivinhado.**

**O texto antigo permanece.** `centro_custo` mantém o valor histórico e ninguém o apaga.

---

## 7. Ordem de construção

| # | Entrega | Lado | Por que nesta posição |
|---|---|---|---|
| 1 | Tabela `cliente_lojas` e o **catálogo manual** na tela do cliente | ADM | Não depende de nada e entrega sozinha. Fundação de todo o resto. |
| 2 | **Importação A** (prévia e aplicar) | ADM | Enche o catálogo dos seis clientes sem ninguém digitar 170 lojas. Tudo o mais depende de catálogo cheio. |
| 3 | Coluna `admissoes.loja_id` e o **vínculo nas telas**: seletor na liberação e no wizard, campo no editar e no olhinho | ADM | A partir daqui já dá para vincular na mão, e o fluxo novo nasce certo. |
| 4 | **Importação B** (prévia, alcance, aplicar) | ADM | Só faz sentido com catálogo cheio (2) e coluna existindo (3). |
| 5 | **A regra dura da pendência `LOJA`** | ADM | **Por último no ADM, de propósito.** Ligar a cobrança antes do caminho de massa acende dezenas de pendências sem o time ter como apagá-las rápido. |
| 6 | Coluna `vagas.loja_id` e o **seletor na abertura da vaga** | A&S | Independente do ADM. Pode entrar em paralelo a partir do item 1, porque só depende do catálogo. |
| 7 | **A viagem** (preenchimento na liberação pelo `id_vacancy`, e a cópia na criação quando a ponte existir) | ponte | Depende de 3 e 6, e o caminho completo depende da ponte A&S para ADM, que é outra frente. |
| 8 | **Alto Volume**: trocar o `group by` | ADM | Depois do de/para, ou o painel fica meio vazio no meio do caminho. |
| 9 | **Cenário 2 inteiro** (grupos, seletor de dois passos, análise por CAGC) | ambos | Decisão do diretor: depois do cenário 1. |

Os itens 1 a 3 e o 6 são independentes o bastante para serem validados um a um.

---

## 8. Alcance da mudança (§A.27)

| Área | Cenário 1 | Cenário 2 |
|---|---|---|
| Banco | 1 tabela nova, 2 colunas novas (`admissoes`, `vagas`) | 2 tabelas novas, **nenhuma coluna nova** |
| Régua de pendências do ADM | **chave nova `LOJA`**, cobrança condicional | não toca |
| Régua de publicação da vaga (A&S) | **não toca** (recomendação da 3.2) | não toca |
| Sinalizador, KPI, radar, modal | derivam da régua, mudam por consequência | não toca |
| Abertura de vaga (A&S) | campo novo no passo 1 | seletor de cliente em dois passos |
| Liberação, wizard, editar, olhinho | campo novo | seletor de cliente em dois passos |
| Importações | 2 telas novas, 4 rotas novas, **nenhuma biblioteca nova** | opcional, importação de membros |
| Alto Volume | troca a chave de agrupamento | agrupamento novo por grupo |
| Menu gerencial | tela do cliente ganha catálogo e importações | tela nova de grupos |
| **Clicksign** | **não toca, verificado** | **não toca** |
| Pandapé, Drive, iFractal, VT, Benefícios | não tocam | não tocam |

**Os três pontos de maior risco:**

1. **A chave `LOJA` na régua**, que alcança sinalizador, KPI do Gerenciador, radar e modal, todos
   validados em produção. É onde a §A.26 se aplica com força, e por isso a recomendação usa o gargalo
   `cobra` e o precedente do `isBanco` em vez de inventar caminho novo.
2. **A importação B escrevendo em lote**, agora também no histórico. A defesa é a prévia obrigatória,
   o interruptor de alcance com padrão conservador, a transação, a recusa de adivinhar CPF ambíguo e a
   trava de cliente cruzado.
3. **O DTO da vaga**, que usa `forbidNonWhitelisted`. Acrescentar `lojaId` é seguro, mas mexer ali
   alcança a trilha de abertura inteira, que é código validado.

---

## 9. Perguntas em aberto, com recomendação

**Sobre a ponte e a viagem:**

1. **A viagem entra agora ou espera a ponte?** A ponte A&S para ADM não existe, a Central de Vagas
   está vazia em produção e nenhuma admissão nasce de candidatura.
   **Recomendação: construir o campo no A&S agora (item 6) e a viagem por `id_vacancy` como
   preenchimento na liberação (item 7), deixando a cópia na criação para o dia da ponte.** Assim o
   dado começa a ser coletado no lugar certo e nada fica esperando outra frente.
2. **Quando a ponte existir, a loja da vaga pode sobrescrever a loja da admissão?**
   **Recomendação: não. Preenche o vazio e nunca sobrescreve**, porque a vaga registra o que foi
   pedido e a admissão registra o que aconteceu.

**Sobre as importações:**

3. **Quem pode importar?** Escrever em lote em admissão é poder considerável.
   **Recomendação: Master e Super Admin.** Menu novo nasce só para o Super Admin (§A.23), e a
   liberação de quem enxerga é do diretor.
4. **A prévia da importação B pode oferecer "criar as lojas que faltam"?**
   **Recomendação: um botão explícito que leva a lista para a importação A, nunca criação automática.**
5. **Importação A com nome que já existe: preencher endereço vazio, ou nunca tocar?**
   **Recomendação: preencher só o que está vazio, nunca sobrescrever.**
6. **Importação B em admissão que já tem loja: sobrescrever?**
   **Recomendação: permitir, mostrando "vai trocar" na prévia**, já que a importação é o caminho de
   correção em massa. Nunca em silêncio.
7. **Teto de linhas por arquivo?** **Recomendação: 2.000**, que cobre o maior caso real com folga.

**Sobre as telas e as réguas:**

8. **A loja é obrigatória para PUBLICAR a vaga no A&S?**
   **Recomendação: não.** O cliente da vaga é nulável por desenho (só 31 de 164 casaram na base real),
   então exigir loja travaria vaga cujo cliente nem foi resolvido. A cobrança fica no ADM.
9. **Liberação em massa: uma loja para o lote, ou loja por linha?**
   **Recomendação: uma para o lote**, que cobre o caso real de contratar um time inteiro para a mesma
   loja, com a correção individual pelo olhinho.
10. **Endereço da loja é obrigatório no cadastro manual?**
    **Recomendação: obrigatório na tela, permitido vazio na importação**, para o time completar depois.
11. **A loja aparece em quais telas como coluna e como filtro?** §A.30: a lista é apresentada e o
    diretor escolhe. **Candidatas: Gerenciador, Esteira, Alto Volume e a listagem da Central de Vagas.**

**Sobre o cenário 2:**

12. **O grupo é derivado do cliente, ou carimbado na admissão?**
    **Recomendação: derivado**, para não criar segunda verdade. Carimbar só se o diretor quiser
    preservar o grupo histórico mesmo que o código mude de grupo depois.
13. **Um código de cliente pode estar em dois grupos?** Se a resposta for um não definitivo, o modelo
    simplifica para uma coluna em `clientes`. **Recomendação: manter a tabela de ligação**, que custa o
    mesmo e não fecha a porta.

---

## 10. O que este desenho NÃO propõe

Registrado de propósito, para não virar escopo por omissão (§A.31):

- **Não constrói a ponte A&S para ADM.** Ela é outra frente, e este desenho só diz por onde a loja
  passa quando ela existir.
- Nenhuma meta por loja. `projeto_vaga_cargo` é por cargo, e inventar rateio por loja seria a conta
  paralela que a §A.16 proíbe.
- Nenhuma mudança em CNPJ, faturamento, contrato, assinante ou entidade Soulan.
- Nenhuma hierarquia de loja dentro de loja, nem grupo dentro de grupo.
- Nenhuma criação automática de loja pela importação B, nem pela viagem.
- Nenhuma volta do centro de custo à abertura da vaga.
- Nenhuma importação automática de lojas do Pandapé. O de/para vaga para cliente é manual por design
  (decisão fechada), e não há motivo para supor que a loja venha de lá.
- Nenhum agrupamento automático por semelhança de nome. A semente vem do dado, a decisão é humana.

---

## 11. Etapa 2: plano da importação de lojas com IA (investigação, 01/09/2026)

*Investigado a pedido do diretor ANTES de construir, por ser uso NOVO da IA.*

### O que o `ai-service` é hoje

FastAPI em `apps/ai-service`, autenticado por `X-Internal-Token`, falando com **Vertex AI / Gemini**
(`gemini-2.5-flash`) por service account. Tem quatro routers (`auditoria`, `kit`, `drive`, `vt`), e o
padrão de todos é o mesmo: recebe do backend, chama o Gemini com saída estruturada, devolve um schema
fechado. O `auditoria.py` já traduz **família de erro do Vertex para HTTP** (QUOTA vira 429 e o
documento volta para a fila; CREDENCIAL vira 503), e isso se reusa inteiro.

**O que ele NÃO tem:** qualquer leitura de planilha. Ele lê PDF e imagem, por mime. Planilha é
formato novo para ele.

### A decisão central: a IA lê o CABEÇALHO, não a planilha inteira

**O backend faz o parse; a IA faz o entendimento.** A planilha é lida no backend com **ExcelJS e
csv-parse**, que já são dependências e já resolvem XLSX, CSV, separador e magic bytes
(`matriculas-import.ts`). Para a IA vai só uma **amostra**: a linha de cabeçalho mais cerca de 15
linhas de exemplo, como matriz de texto, em JSON inline.

Por que assim, e não mandar o arquivo:

1. **A tarefa da IA é mapear coluna, não ler 2.000 linhas.** O que varia entre planilhas é o nome e a
   ordem das colunas ("UNIDADE", "PDV", "FILIAL", "Loja/Endereço" numa coluna só). Quinze linhas
   bastam para decidir isso, e as outras 1.985 não acrescentam informação.
2. **Custo e latência.** Uma chamada por importação, com poucas centenas de tokens, em vez de um
   arquivo inteiro.
3. **A importação fica DETERMINÍSTICA.** O mapeamento sai da IA uma vez; a aplicação às 2.000 linhas é
   código, não modelo. Duas importações do mesmo arquivo dão o mesmo resultado.
4. **§A.6:** nome de loja e endereço não são PII, mas mandar o arquivo inteiro para fora do backend
   sem necessidade é exposição sem ganho. A amostra é o mínimo necessário.
5. **Não passa pela staging**, então não herda o TTL de 48h nem o expurgo. O buffer vive na requisição.

### O contrato novo

**No `ai-service`,** um router `planilha.py` espelhando `auditoria.py`:

```
POST /planilha/mapear-colunas          (X-Internal-Token)
  entrada: { cabecalho: string[], amostra: string[][] }
  saida:   { colunaNome: int|null, colunaEndereco: int|null, colunaCodigo: int|null,
             confianca: "ALTA"|"MEDIA"|"BAIXA", observacao: string }
```

Índices de coluna, não nomes: o nome pode vir vazio, repetido ou com acento, e o índice é o que o
backend usa para aplicar. Saída estruturada com schema fechado, como os demais.

**No backend,** duas rotas, o mesmo par prévia e aplicar do precedente de matrículas:

```
POST /admin/clientes/:codCliente/lojas/importar/previa    (multipart, arquivo no CORPO)
  -> faz o parse, chama a IA com a amostra, aplica o mapeamento a todas as linhas,
     devolve { mapeamento, colunasDisponiveis, criar[], jaExiste[], rejeitadas[], total }
  -> aceita `mapeamento` opcional no corpo: vindo preenchido, PULA a IA (é o caminho da correção)

POST /admin/clientes/:codCliente/lojas/importar/aplicar   (JSON com as linhas já validadas)
  -> grava em transação
```

### O modal, e o ponto que o diretor pediu

O modal mostra **o que a IA entendeu**: "coluna 2 = Nome da loja, coluna 5 = Endereço, coluna 1 =
Código", com a prévia. Cada mapeamento é um **seletor editável** com todas as colunas do arquivo, então
o consultor **corrige** em vez de só aceitar ou rejeitar. Corrigiu, a prévia é recalculada na hora
(segunda chamada da rota de prévia, agora com `mapeamento` explícito e **sem IA**).

### A IA NUNCA é caminho único

Se o Vertex estiver fora, com quota estourada ou devolver `BAIXA` confiança, **a importação continua
funcionando**: o modal abre com o mapeamento vazio e o consultor escolhe as colunas na mão. A IA
acelera, não habilita. Sem isso, uma quota estourada viraria "não dá para cadastrar loja hoje".

### Regras da gravação (decisões já fechadas)

Nome vazio é rejeitado com o número da linha; nome repetido na planilha colapsa em um, com a contagem
visível; nome que já existe **não duplica**; endereço **preenche só o vazio e nunca sobrescreve** (Q5);
endereço vazio é permitido na importação (Q10); teto de **2.000 linhas** (Q7); gravação transacional.
A comparação de nome usa `nomeLojaNormalizado`, a MESMA do índice único do banco.

### O que falta o diretor decidir nesta etapa

- **Q14 (nova):** a prévia devolve as linhas já normalizadas e o aplicar manda essas linhas de volta,
  ou o arquivo é reenviado no aplicar? **Recomendação: devolver e reenviar as linhas**, porque é o que
  garante que o que foi gravado é exatamente o que a pessoa viu na tela.
- **Q15 (nova):** o mapeamento aceito para um cliente deve ser LEMBRADO para a próxima importação
  daquele cliente? **Recomendação: não nesta etapa.** É otimização, e a IA já resolve em uma chamada.
