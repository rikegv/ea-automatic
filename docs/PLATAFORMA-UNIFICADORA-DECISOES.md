# Plataforma Unificadora: O Que O Diretor Decide

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Tipo:** consolidação (§A.39 passo 4)
**Estado: DESENHO FECHADO pelo diretor em 17/09/2026. Nada construído, nada commitado.**
**As decisões estão na seção 0. O que vem depois dela é o material que as sustenta.**
§A.11 (sem travessão), §A.24 (title case em título e etiqueta).

Este é o índice da frente e a lista fechada das decisões. Ele consolida três documentos e dois
pareceres, conferidos pelo coordenador contra o código e contra a produção.

| Documento | O que traz |
|---|---|
| `DESENHO-PLATAFORMA-UNIFICADORA.md` | O desenho dos pontos 1, 2, 3, 4, 6, 7, 8, com opções (`arquiteto`) |
| `DESENHO-SINCRONIZACAO-DIGAI-PANDAPE.md` | O ponto 5, a conta do polling, com números medidos (coordenador) |
| `PROTOCOLO-LGPD-FABRICA.md` | A regra permanente. **VETADA em 7 itens**, aguarda correção |
| `MAPA-ALCANCE-DIGAI.md` | O mapa de alcance. **VETADO em 5 itens**, aguarda correção |

---

## 0. AS DECISÕES DO DIRETOR, 17/09/2026. FECHADAS

Os oito pontos estão **APROVADOS**, com a ressalva do item 5 abaixo. O que segue não é opção: é
decisão tomada, e a fábrica constrói sobre ela sem reabrir.

| # | Decisão |
|---|---|
| **1** | **CADÊNCIA: webhook, não varredura.** O Pandapé já tem webhook configurado e em uso. Entra por evento, sem reler a base. ~~Para o Digai, perguntar ao Ivan se existe webhook~~ **RESPONDIDO em 17/09/2026: o webhook do Digai EXISTE (`NEW_APPLICATION`), e a varredura vira rede de segurança de baixa frequência. Ver a seção 0.7**, que traz o payload real, a forma de provar a origem e a conta refeita com o teto certo |
| **2** | **TABELA DE IDENTIDADES: AGORA.** A janela está vazia, o custo é zero, e esperar transforma migration em backfill de dado pessoal |
| **3** | **PRIVACIDADE (E18): ajustada.** O aceite do candidato é da FONTE, não nosso. Ver o parecer do `seguranca` na seção 0.1 |
| **4** | **FUSÃO E AUTOCOMPLETAR: preparada, não construída.** Fallback do diretor: se der problema, **mantém POR VAGA**, a atualização sobe só naquela vaga, sem juntar entre vagas. Segundo momento |
| **5** | **QUEM VENCE, com ressalva.** O consultor vê a divergência e escolhe qual prevalece. Escolhendo a FONTE, **a plataforma AVISA EXPLICITAMENTE que ele precisa ir à fonte fazer o ajuste** ("você escolheu o Digai, vá lá e ajuste"). O aviso é obrigatório, não é sugestão |
| **6** | **OS 8 PONTOS: APROVADOS**, com a ressalva do item 5 |

### 0.1 A RESSALVA TÉCNICA DA DECISÃO 1, que o diretor precisa conferir no painel

**O webhook do Pandapé que existe hoje NÃO serve para o funil, e isso é medido.** Ele entrega UM
evento: **"Candidato enviado para admissão"**, que é o **FIM** do funil. O A&S vive ANTES disso.

**O que falta saber:** se o Pandapé oferece um evento de **MOVIMENTAÇÃO DE FUNIL**. O catálogo de
webhooks **não responde por API** (`GET /v3/webhooks` e `/v1/Webhook/List` devolvem 404): ele se
configura **no painel do Pandapé**, ao qual o diretor tem acesso.

**Portanto a decisão 1 está certa na direção e pendente na confirmação.** Se o evento de funil
existir, ela se cumpre inteira e a divergência sobre cadência desaparece de fato. Se não existir, a
escolha volta para varredura diária ou esperar, e é decisão do diretor de novo.

**Registrado também:** usar `GET /v2/matches` em produção exige **aval do time de Operações do
Pandapé**, pedido por eles em 01/07/2026. É o mesmo caminho que destravou o webhook com o André.

### 0.2 O QUE A DECISÃO 1 RESOLVE

Com webhook, **não há varredura**, então a exigência E14 do `seguranca` ("nunca varredura completa") e
o tempo real que o diretor quer deixam de se opor. **A divergência entre o coordenador e o
`seguranca` some por construção**, não por arbitragem. É a melhor saída das três que estavam na mesa.

### 0.3 A DECISÃO 3 (privacidade): o `seguranca` RECUSOU o enquadramento, e aceitou a consequência prática

**Ele recusa que a Soulan seja operadora.** Controlador é quem decide finalidade e meios (art. 5, VI);
operador é quem trata **em nome do** controlador (art. 5, VII). **A conta do Pandapé e o workspace do
Digai são da Soulan**, que decide para quais vagas recrutar, o que coletar e por quanto tempo guardar.
Logo a Soulan é **controladora** e as ferramentas são **operadoras dela**, que é o inverso do
argumento.

**E ele acrescenta que, mesmo se o enquadramento se invertesse, não resolveria:** base legal é
vinculada à **finalidade específica**, e "acervo unificado permanente, fonte da verdade, cruzando duas
fontes" é finalidade **nova** diante de "me candidatei a uma vaga". Compatibilidade de finalidade é
análise, não herança automática.

**ONDE O DIRETOR ESTÁ CERTO, e o `seguranca` concede:** a fábrica **NÃO precisa construir tela de
aceite no EA**, nem aceite por clique, nem re-coleta de dado que a fonte já tem. Se a base legal for
legítimo interesse ou pré-contrato, o entregável é **transparência e registro**, não clique do
candidato. Esse trabalho sai do escopo.

**O E18 na redação nova:** base legal, finalidade e retenção do acervo unificado são decisão do
diretor **com o jurídico**, declaradas por escrito. E o `seguranca` aprova o ponto 2 quando o desenho
tiver, **em código**, quatro itens: **origem e data de coleta por registro**, **prazo de retenção com
expurgo automático**, **caminho de exclusão e correção que alcance o EA** (inclusive eco da exclusão
feita na fonte) e **rastro do atendimento do pedido do titular**. Sem os quatro, VETADO, independente
de como o jurídico qualifique controlador e operador.

**O achado que pesa mais, e é novo:** se a pessoa pedir exclusão ao Digai e o dado seguir vivo no EA,
**quem responde é a Soulan**, e o acervo unificado é o agravante, porque é o lugar onde o dado
sobrevive ao apagamento na origem. O desenho hoje não tem eco de exclusão.

**Do jurídico, não da fábrica:** a qualificação de controlador e operador, a escolha e o texto da base
legal, o contrato com Pandapé e Digai, e o texto do aviso de privacidade.

### 0.4 O ACEITE: resolvido pelo PORTAL DO CANDIDATO (decisão do diretor, 17/09/2026)

**NÃO se cria tela de aceite separada.** O aceite vem no **PORTAL DO CANDIDATO**, o mesmo link que o
candidato já vai acessar para subir os documentos. Ao acessar, ele dá o aceite ali: "eu aceito,
declaração de privacidade, estou de acordo".

Isto fecha o E18 pelo lado que faltava, e fecha bem: o `seguranca` já havia concedido que a fábrica
**não precisa construir tela de aceite no EA**, e a decisão do diretor vai além, colocando o aceite
**onde o candidato já vai estar**, sem inventar um passo novo para ele.

- **O TEXTO DO TERMO é do JURÍDICO.** A fábrica não redige declaração de privacidade. Ela recebe o
  texto pronto e o apresenta.
- **AS QUATRO EXIGÊNCIAS TÉCNICAS do E18 continuam valendo, e são da fábrica**, para a construção:
  1. **origem e data de coleta por registro**;
  2. **prazo de retenção com expurgo automático** (não existe "permanente" sem prazo);
  3. **caminho de exclusão e correção que alcance o EA**, incluindo eco da exclusão feita na fonte;
  4. **rastro do atendimento** do pedido do titular.
- **Elas ficam PARA A CONSTRUÇÃO**, não para agora: esta frente é desenho.

**DEPENDÊNCIA QUE ESTA DECISÃO CRIA, e ela é real:** o **Portal do Candidato AINDA NÃO EXISTE**. Ele é
um PARECER DE VIABILIDADE de 20/08/2026 (`docs/PARECER-PORTAL-DOCUMENTOS-CANDIDATO.md`), com **dois
caminhos em aberto** (abrir uma rota do EA para a internet, ou página fora do EA que nunca recebe
conexão) e **sem decisão do diretor**. Nada foi construído.

Consequência prática, dita agora para não virar surpresa: **o aceite só passa a ser coletado quando o
Portal existir.** Enquanto isso, quem entra pelo Digai e pelo Pandapé entra sem o aceite novo, e o
desenho precisa aguentar esse intervalo. Não é impedimento para esta frente, que é desenho, mas é a
ordem de construção: **Portal antes de o acervo unificado começar a crescer**, ou o intervalo cresce
junto.

**O que continua sendo do jurídico:** a base legal, a finalidade declarada do acervo unificado, o
prazo de retenção por finalidade, o texto do termo e o contrato com Pandapé e Digai.

### 0.5 O MAPEAMENTO DA DOCUMENTAÇÃO DO PANDAPÉ: a lista de eventos NÃO EXISTE no nosso acervo

O diretor pediu que a fábrica mapeasse a documentação da API do Pandapé em vez de ele olhar o painel.
**A fábrica mapeou, e o achado é que a documentação que teríamos de ler não está no repositório.**

Varridos: os 3 PDFs, 10 relatórios de investigação, o DIARIO, o CLAUDE.md e o módulo `pandape/`
inteiro.

- **Os PDFs são NOSSOS, não do Pandapé.** Os três têm `Producer: xhtml2pdf` e conteúdo idêntico aos
  `.md` de mesmo nome. São exportações dos nossos próprios relatórios. **Conferido pelo coordenador.**
- **Não há swagger, spec ou anexo do Pandapé** em `docs/` nem na raiz. **Conferido.**
- **Não há catálogo de webhooks por API:** `GET /v3/webhooks` e `GET /v1/Webhook/List` respondem 404,
  e **nenhum dos três swaggers tem path de webhook**, apesar de 60 mais 68 mais 4 endpoints
  catalogados um a um ao vivo.
- **Um único nome de evento existe em todo o acervo**, e ele veio de CONVERSA COM O SUPORTE, não de
  documentação: "Candidato enviado para admissão".

**ARMADILHA DE LEITURA, registrada para não enganar ninguém:** a §A.9 do CLAUDE.md diz que o suporte
"confirmou o disparo do webhook **na mudança de etapa**". Isso **NÃO** é evento genérico de funil: a
entrada na etapa de admissão É uma mudança de etapa. O registro do go-live é de um evento só.

**O Pandapé tem exatamente a mesma lacuna do Digai:** doc pública que não lista os eventos. A
diferença é que do Pandapé já arrancamos um nome do suporte, e do Digai nenhum.

**CONCLUSÃO PARA A CADÊNCIA: a decisão 1 fica PENDENTE de resposta externa.** A fábrica não tem como
responder por leitura, porque a fonte não existe do nosso lado. Há **dois caminhos, e o primeiro é de
dois minutos**:

1. **Abrir a tela de cadastro de webhook no painel do Pandapé e fotografar o dropdown de eventos.** O
   registro do go-live diz que o de admissão é "o ÚNICO cujo payload traz `IdPreCollaborator`", frase
   que só faz sentido **se houver mais itens na lista**. Isso pode responder tudo sem esperar suporte.
2. **Perguntar ao André**, pedindo a lista completa dos eventos disponíveis com nome exato e payload
   de cada um. O texto pronto está no relatório da investigação.

**Enquanto não houver resposta, a cadência do Pandapé permanece: varredura diária completa para
começar, ponte e 5 minutos como destino.**

### 0.6 A DOCUMENTAÇÃO OFICIAL FOI LIDA (17/09/2026): NÃO HÁ WEBHOOK NA API. Resposta definitiva

O diretor mandou os dois endereços da documentação. A fábrica leu **as especificações, não as
páginas**: as duas URLs são apenas carregadores de Swagger UI, sem conteúdo próprio.

**As cinco especificações que elas carregam:**

| Spec | Origem | Estado |
|---|---|---|
| `/swagger/v1/swagger.json` | `api.pandape.com.br` | Baixada, **60 paths** |
| `/swagger/v2/swagger.json` | `api.pandape.com.br` | Baixada, **68 paths** |
| `/swagger/v3/swagger.json` | `api.pandape.com.br` | Baixada, **6 paths** |
| `/swagger/HubApi/swagger.json` | `pandape.infojobs.com.br` | **Exige login.** Devolve HTML de autenticação |
| `/swagger/ExternalRequestApi/swagger.json` | `pandape.infojobs.com.br` | **Exige login.** Idem |

**O RESULTADO, e ele é conclusivo para as três specs públicas:** busca de texto completo por
`webhook`, `callback`, `notification`, `subscription`, `hook`, `push`, `trigger`, `evento`, `gatilho`,
`disparo` e `assinatura` nas três devolveu **ZERO ocorrências**. Não em path, não em descrição, não em
schema, não em tag.

**Conclusão: a API do Pandapé NÃO documenta webhook nenhum.** Nem o de admissão que já usamos, que
existe e funciona há meses. Isso confirma, por leitura direta da fonte oficial, o que já se suspeitava:
**o webhook do Pandapé vive no PAINEL, e não na API**, e a lista de eventos não é publicada.

**Portanto a pergunta "existe evento de movimentação de funil?" NÃO tem resposta na documentação**, e
não é lacuna da nossa varredura: é lacuna da documentação deles.

**O que sobrou de inexplorado, e é onde a resposta pode estar:**

1. **As duas specs do `pandape.infojobs.com.br`**, que exigem login. `HubApi` é nome sugestivo de
   central de eventos, e **nenhuma das quatro investigações anteriores as conhecia**: o acervo só tinha
   v1, v2 e v3. **Passo para o diretor:** entrar logado em `pandape.infojobs.com.br/swagger` e ver o
   que as duas oferecem, ou salvar os dois `swagger.json` e entregar à fábrica.
2. **O dropdown de eventos na tela de cadastro de webhook do painel.** Continua sendo o caminho de
   dois minutos.

**Achado lateral, registrado:** a **v3 tem 6 paths hoje**, e a varredura de 01/07/2026 catalogou
**4**. A API cresceu desde então. Os 6 atuais são `/v3/company/users`, `/v3/interviews/{idAction}
/analysis-data`, `/v3/precollaborators/{idPreCollaborator}`, `/v3/requests` e `/v3/requests/{idRequest}`
e `/v3/vacancies`.

---

## 1. AS TRÊS CORREÇÕES DE PREMISSA

O que a investigação descobriu que muda o enunciado. Está aqui em primeiro lugar porque decidir sem
isto é decidir sobre outro problema.

### 1.1 O Pandapé NÃO alimenta o A&S por caminho nenhum

A OST diz "já há maturidade com o Pandapé". **É verdade para a ADMISSÃO e falso para o A&S.**

Medido: o módulo Pandapé tem ZERO referências às tabelas da Central de Vagas e de Candidatos. As três
colunas de id externo (`as_candidatos.id_candidate_pandape`, `as_candidaturas.id_match_pandape`,
`vagas.id_vacancy_pandape`) têm **zero valores em produção**. Nenhuma tela do A&S menciona o Pandapé.

**E o webhook não resolve**, porque o evento que o Pandapé emite é "Candidato enviado para admissão",
que é o FIM do funil. O A&S vive antes disso, e para o funil não chega evento nenhum.

### 1.2 O ponto 2 são DUAS operações diferentes, e só uma é segura

O `arquiteto` e o `seguranca` chegaram a isto de forma independente, o que conta a favor.

O CPF mora na PESSOA, não na candidatura. Então:

- **ENRIQUECIMENTO**, o caso majoritário: é o MESMO registro de pessoa ganhando um campo que estava
  vazio. O Digai tem 12.445 pessoas em 13.248 registros, `userId` é chave estável e **o CPF atualiza
  no mesmo registro**. Aqui não há propagação nenhuma entre processos, e não há oferta a fazer: o
  campo vazio se preenche, o campo preenchido e diferente vira divergência.
- **FUSÃO DE IDENTIDADE**, o caso que a OST descreve: são DOIS registros de pessoa que a plataforma
  suspeita serem a mesma. **VETADO como redigido.**

**Por que a fusão foi vetada, e o argumento é forte:** a chave de casamento é obrigatoriamente FRACA
(nome, telefone, e-mail), porque se houvesse chave forte as duas linhas já estariam unidas. E a
confirmação humana não protege: diante de dois cadastros de mesmo nome, **o único dado que
distinguiria as duas pessoas é exatamente o dado que está sendo copiado**. O operador não valida, ele
carimba.

Há ainda um caminho de sondagem: o código fecha a busca parcial por CPF de propósito, dizendo que
"com poucas tentativas se confirma o número de alguém que se suspeita estar na base". O modal do
ponto 2, se exibir o CPF antes da decisão, **reabre essa porta pela tela**.

**O caminho aprovável:** oferta só sobre CHAVE FORTE (o `userId` do Digai, ou o id do Pandapé), sem
exibir nenhum dado do outro registro antes da decisão, com papel Master.

### 1.3 O polling de 5 minutos dá no Digai e não dá no Pandapé

| Fonte | 5 minutos | Conta |
|---|---|---|
| Digai | **Cabe, com folga** | Varredura completa custa 451 chamadas, orçamento do ciclo é 2.500. Usa 18% |
| Pandapé | **Não cabe** | Varrer as 907 ativas custa cerca de 1.800 por ciclo, quase o dobro do teto, que é **compartilhado com a folha de pagamento** |

---

## 2. AS DECISÕES ESTRUTURAIS, que mudam o banco

### D1. Identidade externa: tabela própria ou coluna por fonte?

**Recomendação: tabela própria, e decidir AGORA.** O argumento é de janela, não de elegância: as três
colunas que existem têm **zero valores**, então migrar hoje é só escrever a migration. Depois que a
ingestão ligar, o mesmo trabalho passa a carregar backfill de dado pessoal.

Coluna por fonte escala mal: cada fonte nova é uma migration em três tabelas.

**Exigência do `seguranca` que vem junto:** todo identificador externo novo **nasce dentro do
expurgo**, no mesmo commit, com teste que enumera a lista completa de colunas identificadoras.

### D2. Guardar o espelho da fonte, ou só a divergência?

**Recomendação do `arquiteto`: guardar o espelho**, com carimbo de visto por entidade. Sem ele,
"sumiu da fonte" é indetectável, porque **ausência não gera evento**.

**Ressalva do `seguranca`, e ela é dura:** o espelho é exatamente onde payload de terceiro entra por
descuido. Se ele existir, entra com allowlist de campos e proibição nominal das colunas, no molde que
a fila de entradas do Pandapé já usa, e **nunca guarda a resposta crua**.

### D3. A retenção deixa de depender de haver candidatura?

**O `seguranca` recusa destravar sem isto.** Hoje o expurgo só alcança quem tem candidatura. Com 3
candidatos na base isso é teórico; com a ingestão, **todo importado que não casar com vaga nenhuma
fica com nome, e-mail e telefone retidos para sempre**, e o de/para de vaga segue pendente.

### D4. O expurgo passa a alcançar a tabela de candidaturas?

**O `seguranca` também recusa destravar sem isto.** O expurgo toca UMA tabela. O
`id_match_pandape` vive na candidatura e **nada o nula**, então a anonimização de hoje já é
**reversível por uma chamada de API**. O conceito novo acrescenta a identidade do Digai pela mesma
porta.

### D5. `origem` continua sendo campo livre de formulário?

Hoje ele **decide retenção** (protege `BANCO_TALENTOS` do expurgo) e é editável sem papel e sem
trilha: a rota de edição do candidato **não tem `@Roles` nenhum**, conferido. Qualquer usuário com o
menu torna um registro permanente, em silêncio e sem autor registrado.

Proposta do `arquiteto`, não pedida na OST: tornar `origem` imutável, ou ao menos exigir papel e
trilha para o valor que concede imortalidade.

---

## 3. AS DECISÕES DE FLUXO

### D6. A entrada do Pandapé no A&S

| | Opção | Recomendação |
|---|---|---|
| **a** | Varredura diária completa das 907 ativas, fora do pico da folha | **Para COMEÇAR.** Não depende de ponte nenhuma |
| **b** | Ponte vaga↔vacancy e varredura das 198 abertas do EA a cada 5 min | **Como DESTINO.** Fica barato sozinho, vaga por vaga |
| c | Pedir ao Pandapé um webhook de movimentação de funil | **Perguntar ao suporte.** Se existir, é o mais barato de todos |

### D7. A cadência do Digai

**Recomendação: 5 minutos com varredura completa.** Usa 18% do orçamento. Se a reconexão descobrir
filtro de "mudou desde", o ciclo barateia depois sem mudar o desenho.

**Exigência do `seguranca`:** sem endpoint de delta, ele considera o intervalo curto VETADO, e a
pergunta correta passa a ser o webhook. **Esta é uma divergência aberta entre o parecer dele e a
minha conta**, e ela é sua para arbitrar: a conta diz que cabe no teto; ele diz que repetir a mesma
leitura de dado pessoal 288 vezes por dia é exposição sem função nova. **Os dois estão certos no que
medem.** A saída que concilia é a pergunta 4 da seção 5.

### D8. Quem resolve divergência

**Recomendação do `arquiteto`:** consultor decide "Manter A Plataforma" (não escreve nada), Master
decide "Aceitar A Fonte" (escreve). Tudo Master transforma a fila numa fila do Master.

### D9. O apito infinito, e como ele morre

O `arquiteto` descartou snooze por tempo, e o motivo é bom: **snooze garante o apito, só mais
devagar.** A saída é **silenciar POR VALOR**: a decisão guarda o que a fonte dizia, e só reabre se a
fonte MUDAR.

E "Aceitar A Fonte" **passa pelo serviço `trocarVaga`**, nunca escreve `vaga_id` direto: aquela
função tem quatro travas e `SELECT ... FOR UPDATE` no destino, e escrever direto as contornaria em
silêncio. Consequência aceita: aceitar a fonte **pode falhar**, e a divergência fica aberta.

---

## 4. O QUE JÁ ESTÁ PRONTO, e não se reconstrói

| Peça | Estado |
|---|---|
| "Uma pessoa, N participações" | **A estrutura já existe.** Pessoa, ligação e histórico em tabelas separadas |
| "Participa de N processos" | **Já é calculado e já chega na tela.** Falta exibir |
| Migrar candidato entre vagas | **Construído**, com quatro travas e lock no destino |
| Fila de entradas com estados, motivos fechados e tela | **Construída** para o Pandapé. É o padrão a copiar para a divergência |
| Reconciliação que se resolve sozinha | **Construída** no Drive. O princípio vale: o que o sistema pode conferir sozinho não espera clique |
| Componente de badge clicável que abre modal | **Existe** no design system |
| Fila com limitador sob o teto, backoff e inércia sem credencial | **Construída** para o Pandapé |

**O risco de N+1 não está na lista de candidatos**, que já resolve por subconsulta indexada. Está no
**funil da vaga**, onde copiar aquela subconsulta vira uma varredura por linha numa vaga de alto
volume.

---

## 5. O QUE SÓ O DIRETOR DESTRAVA

1. **O token do Digai**, expurgado em 16/09. Sem ele nada roda, e cada pergunta abaixo custa uma
   reconexão.
2. **Perguntas ao Ivan:** existe webhook de "candidato finalizou"? Qual o teto real de requisição?
   Existe filtro de "mudou desde"? E o host `api.hiring.digai.ai` da documentação está com
   certificado quebrado, vale reportar.
3. **Pergunta ao suporte do Pandapé:** existe webhook de movimentação de funil? (o catálogo de
   webhooks não responde por API, configura-se no painel).
4. **A pergunta que concilia D7:** se houver webhook nas duas fontes, o polling vira rede de
   segurança nos dois lados, e a divergência entre a minha conta e o parecer do `seguranca` deixa de
   existir. É o desenho mais barato e mais atual.
5. **O de/para vaga para catálogo**, que segue pendente desde a Fase 5 e agora bloqueia também o
   recorte da ingestão.
6. **Aviso de privacidade do acervo unificado**, que o `seguranca` põe como PRÉ-REQUISITO da fusão de
   identidade. É decisão sua com o jurídico, não da fábrica.
7. **Confirmar que a dedup Digai x Pandapé segue segurada** aguardando o Ivan. O desenho assume que
   sim e só prepara o ponto.

---

## 6. ESTADO DA FÁBRICA NESTA FRENTE

| Agente | O que fez | Veredito |
|---|---|---|
| coordenador | Mapa de alcance, ponto 5, consolidação conferida | Corrigiu uma recomendação própria após o levantamento do Pandapé |
| `arquiteto` | Desenho dos pontos 1, 2, 3, 4, 6, 7, 8 | Entregue, 713 linhas, com opções |
| `Explore` | Levantamento do que existe do Pandapé no A&S | Entregue. Corrigiu a premissa da OST |
| `seguranca` | Auditoria de LGPD do conceito | **VETOU** o ponto 2. **CONDICIONOU** os pontos 3, 4 e 5 a 18 exigências |
| `tester` | Não acionado nesta frente | Não há código a cobrir. Entra quando a construção for autorizada |

---

## 0.7 O RETORNO DO DIGAI (José e Ivan), 17/09/2026: a ingestão nasce com os fatos certos

O fornecedor respondeu, e a fábrica **leu a documentação oficial** em cima de cada resposta, em vez
de registrar a resposta e seguir. Duas das cinco afirmações precisaram de correção, e as duas
correções mudam o desenho.

### O que a resposta destrava, ponto a ponto

| # | O que veio do Digai | O que a documentação confirma | Estado |
|---|---|---|---|
| 1 | Existe webhook "candidato finalizou" (`NEW_APPLICATION`) | **CONFIRMADO.** Existem TRÊS eventos: `NEW_APPLICATION`, `APPROVAL` e `INCLUSION_REQUEST` | Destravado |
| 2 | `partnerJobId` é o id da vaga do Pandapé | **CONFIRMADO PELO FORNECEDOR, ausente da documentação.** E o payload do webhook **não o carrega** | **Corrigido, ver abaixo** |
| 3 | `userId` é único e permanente, o mesmo em todas as triagens | Coerente com a documentação, que trata `userId` como identidade do usuário | Destravado |
| 4 | A origem (planilha ou Pandapé) não está na API, só na web | Nenhum campo de origem aparece no payload nem nos resultados | **DESCARTADO pelo diretor: não precisamos. Ver 0.7.1** |
| 5 | Limite de 120 requisições por minuto | **A DOCUMENTAÇÃO DIZ 500.** Ver o conflito abaixo | **Conflito, adotado o menor** |

### CORREÇÃO 1, e ela muda o desenho da ingestão: o webhook NÃO traz a vaga

O payload do `NEW_APPLICATION`, como a documentação o descreve, é este e mais nada:

`id` · `userId` · `userEmail` · `screeningId` · `attemptId` · `applyAt` · `webhookId` ·
`eventType` · `partnerUserId` · `hasAllStatesCompleted` · `phoneNumber`

**Não há `partnerJobId`, não há `applicationId`, não há resultado da triagem.** Logo o webhook,
sozinho, diz QUEM terminou e QUAL triagem, e **não diz PARA QUAL VAGA**. A ligação candidato para
vaga exige uma **segunda chamada**, à API de screening ou de resultado, usando o `screeningId` ou o
`attemptId` que o evento entrega.

**Consequência prática:** o desenho da ingestão é de DOIS passos, não de um. Evento chega, entra na
fila; o worker busca o resto. É exatamente a forma que o webhook do Pandapé já tem (§A.5: o handler
extrai o id, enfileira e responde 202; o worker enriquece), então não há padrão novo a inventar.

### CORREÇÃO 2: o payload CARREGA DADO PESSOAL, e isso é regra, não observação

`userEmail` e `phoneNumber` vêm no corpo do evento. Pelo protocolo LGPD, seção 1, os dois são dado
sensível, e o corpo do webhook **nunca vai para log**, nem em erro, nem em depuração. O receptor
extrai os identificadores técnicos, enfileira e descarta o resto. É a mesma disciplina das URLs do
Pandapé (§A.6).

### COMO SE PROVA QUE A CHAMADA VEIO DO DIGAI, que era a pergunta que faltava

**NÃO existe assinatura HMAC**, e não existe header de assinatura. A documentação do evento e a
página geral de webhook não mencionam nenhum mecanismo de verificação de origem.

**O que existe, e resolve:** o cadastro do listener
(`POST https://api-screening.digai.ai/api/v1/public/notification/webhooks`) aceita **`authType`**
(`NONE`, `BASIC` ou `BEARER`) e **`token`**. Ou seja, **nós definimos a credencial** e o Digai a
devolve em toda chamada ao nosso endpoint.

**O modelo adotado é, portanto, o MESMO do Pandapé: token, fail-closed.** Um guard no molde do
`PandapeWebhookGuard`, que recusa com 401 quando o token não vem ou não confere, e a rota nasce
**inerte sem a credencial configurada**. `authType: NONE` está **proibido** neste projeto.

**PENDÊNCIA PARA O JOSÉ, e é curta:** em qual header exatamente o `token` chega com
`authType: BEARER` (presume-se `Authorization: Bearer <token>`, e presunção não vira guard), e se
existe algum mecanismo de assinatura não documentado. Enquanto não responder, o guard usa o
`Authorization`, e o teste dele é o que fixa a resposta.

### RETENTATIVA: três tentativas, então a IDEMPOTÊNCIA É NOSSA

A documentação diz que, em caso de falha, a plataforma **tenta entregar até três vezes**, com
intervalos progressivamente maiores. Não há garantia de entrega única, então o mesmo evento chega
duas vezes e **não pode criar dois candidatos**. O campo `id` do payload é o id do evento e serve
de chave de idempotência, no mesmo padrão do `IdPreCollaborator` do Pandapé (§A.5: índice unique
sobre o id processado, conhecido vira no-op).

### A DEDUPLICAÇÃO SAI DA GELADEIRA: `userId` é a chave forte que faltava

O parecer do `seguranca` **VETOU** a fusão de identidade por chave FRACA (nome, telefone, e-mail),
e o argumento continua de pé palavra por palavra. O que ele aprovou, na mesma auditoria, foi a
oferta **sobre CHAVE FORTE**. `userId` único e permanente **é** essa chave forte.

Então a deduplicação por `userId` **pode ser construída**, na ingestão, e a tabela
`as_identidades_externas` já está no ar esperando exatamente isto: ela guarda `(fonte, identificador)`
com unique, e **permite a mesma pessoa ter duas identidades da mesma fonte**, que é o caso que a
dedup resolve. O veto sobre chave fraca **continua valendo**: nada de casar por nome.

### A CONTA DA SINCRONIZAÇÃO, REFEITA COM 120 POR MINUTO

**O conflito primeiro, porque ele decide o número:** a documentação oficial (`restrictions`) diz
**500 requisições por minuto por chave**; o fornecedor disse **120**. **Adota-se 120**, que é o
menor, pela mesma direção fail-closed de sempre: estourar o teto de terceiro derruba a integração
inteira, e errar para baixo só custa tempo. **Pendência para o José:** qual dos dois vale para a
nossa chave, e se 120 é cota da conta ou limite do plano.

A varredura completa foi **MEDIDA** em 16/09/2026: 86 de 86 workspaces, 301 screenings, 13.248
registros, **451 chamadas, zero falhas**.

| | Com 500 por minuto (a conta antiga) | Com 120 por minuto (a conta certa) |
|---|---|---|
| Orçamento de um ciclo de 5 minutos | 2.500 chamadas | **600 chamadas** |
| Custo da varredura completa | 451 | 451 |
| Fatia do orçamento | 18%, com folga | **75%, sem folga nenhuma** |
| Tempo mínimo só para emitir as 451 | 54 segundos | **3 minutos e 46 segundos** |

**A leitura disto é dura e é a decisão:** com 120 por minuto, a varredura completa a cada 5 minutos
**deixa de ser viável**. Ela ocupa quase quatro dos cinco minutos só emitindo, e a primeira
retentativa com recuo exponencial estoura a janela. A opção 1a do desenho antigo, que era a
recomendada, **cai**.

**E ela não faz falta, porque o webhook existe.** O desenho novo:

- **O webhook é o caminho principal.** Evento por evento, custo praticamente zero, e mais atual do
  que qualquer varredura.
- **A varredura vira REDE DE SEGURANÇA, de baixa frequência.** Uma passada completa por dia, ou a
  cada poucas horas, custa 451 chamadas dentro de um orçamento diário de 172.800. É irrelevante, e
  pega o que o webhook porventura perder (as três tentativas dele podem se esgotar).
- **O limitador da fila trabalha abaixo do teto**, no padrão da casa: cerca de 100 por minuto, com
  recuo exponencial, deixando folga para o worker de enriquecimento que corre junto.

Isto **resolve a divergência aberta em D7** entre a conta do coordenador e o parecer do `seguranca`,
e resolve do jeito que a decisão 1 do diretor já apontava: **com webhook nos dois lados, a varredura
frequente perde a função**, e ler a mesma base de dado pessoal 288 vezes por dia deixa de ser
proposta de ninguém.

### ACHADO LATERAL, e ele vale para o E18: o Digai TEM endpoint de exclusão por LGPD

A documentação expõe `Solicitar remoção de dados do candidato (LGPD)` e
`Solicitar remoção de dados via Partner User ID (LGPD)`.

Isso **não fecha** a exigência E18 item 3, porque o que falta lá é o **eco na direção contrária**
(a pessoa pede exclusão ao Digai e o dado segue vivo no EA), e um endpoint nosso para lá não avisa
nada para cá. Mas ele resolve a **outra metade**: quando o pedido do titular chegar ao EA, existe
caminho programático para propagar a exclusão à fonte, em vez de e-mail e torcida. Registrado para
a frente que construir o atendimento ao titular.

### O QUE CONTINUA PENDENTE DO FORNECEDOR, lista fechada

1. **O header exato do token** do webhook com `authType: BEARER`, e se há assinatura não documentada.
2. **120 ou 500 por minuto**, qual vale para a nossa chave.
3. ~~A origem do candidato (planilha ou Pandapé) na API~~ **RETIRADO DA LISTA em 17/09/2026, por
   decisão do diretor. Não será pedido ao José. Ver 0.7.1.**
4. **`partnerJobId` na documentação.** Ele foi confirmado em conversa e não aparece em página
   nenhuma, nem no payload do webhook. Vale pedir em qual endpoint ele é devolvido, para a segunda
   chamada da ingestão não virar tentativa e erro.

*(Registrado pelo coordenador em 17/09/2026, lendo a documentação oficial contra cada resposta do
fornecedor. Duas das cinco afirmações não sobreviveram à leitura, e estão corrigidas acima.)*

### 0.7.1 CORREÇÃO DO DIRETOR: existem DUAS "origens", e só uma importa

Decisão de 17/09/2026. Ela **retira uma pendência do fornecedor** e simplifica o desenho da
ingestão, e o registro anterior misturava as duas coisas.

**ORIGEM 1, a que importa: DE QUAL SISTEMA A PLATAFORMA PUXOU.**
Puxou pela API do Pandapé, origem Pandapé. Puxou pela API do Digai, origem Digai. **A plataforma
sabe isso sozinha**, porque é ela quem faz a chamada: não pergunta a ninguém, não depende de campo
do fornecedor e não pode errar. É isso, e só isso, que se marca no registro do candidato.

**ORIGEM 2, a que o José disse não existir na API: DENTRO DO DIGAI, se a pessoa veio de planilha ou
do Pandapé. NÃO PRECISAMOS DELA, e a pendência sai da lista.**

**O argumento do diretor, que fecha:** a **deduplicação por `userId` já responde a pergunta que a
origem 2 responderia**. Quem está no Pandapé E no Digai chega pelos dois caminhos, e o `userId`
junta os dois numa pessoa só. Quem está só no Digai (o caso da planilha) chega só pelo Digai. A
distinção "dentro do Digai veio de planilha ou do Pandapé" é **redundante**: o que se queria saber
com ela era quem já está versus quem só está no Digai, e isso o `userId` entrega por construção.

**Consequência prática:** o item 4 do retorno do Digai **deixa de ser pendência do fornecedor**. O
diretor não vai pedir ao José para colocá-lo no roadmap. A "opção A" (trazer todos e deduplicar)
deixa de ser contorno de uma lacuna e passa a ser simplesmente **o desenho**.

### 0.7.2 O CHOQUE DE NOMES, que o coordenador precisa pôr na mesa antes de alguém construir

**Já existe um campo chamado `origem` no candidato, e ele NÃO é a origem 1.** É
`as_candidatos.origem`, com quatro valores: **Pandapé**, **Cadastro Manual**, **Indicação** e
**Banco De Talentos**.

Esses quatro valores respondem **três perguntas diferentes**, não uma:

| Valor | Que pergunta ele responde |
|---|---|
| `PANDAPE` | de qual SISTEMA veio. É a origem 1 |
| `MANUAL` | COMO entrou, alguém digitou na tela |
| `INDICACAO` | por qual CANAL de recrutamento chegou |
| `BANCO_TALENTOS` | **quanto tempo se guarda.** Não é origem de nada: é classe de RETENÇÃO, e é o valor que isenta a pessoa do expurgo para sempre |

**Por que isto não é preciosismo de nome:** é exatamente essa mistura que produz o problema que o
diretor mandou consertar. `BANCO_TALENTOS` concede vida eterna a dado pessoal **por ser um valor de
um campo de origem**, e por isso qualquer um que edite a ficha a concede sem querer e sem rastro.
Um campo que diz de onde a pessoa veio não deveria decidir por quanto tempo ela fica guardada.

**E acrescentar `DIGAI` a essa lista pioraria**, porque somaria um quinto valor a um campo que já
mistura três perguntas, deixando a origem 1 (a que o diretor acabou de definir) espalhada entre
`PANDAPE`, `DIGAI` e `MANUAL`, e a retenção continuaria escondida ali dentro.

**O que a fábrica NÃO fez, e é deliberado:** nada. Isto é registro, e a decisão é do diretor.
Está na lista do pulso como pergunta, com as duas saídas possíveis, porque escolher por ele aqui
mudaria o significado de um campo que já vive em produção.
