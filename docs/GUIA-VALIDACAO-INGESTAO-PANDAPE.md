# Guia De Validação Faseado: A Ingestão Do Pandapé

Para o diretor validar na tela, em **homologação, porta 3120** (§A.32, ambiente único).
§A.11: sem travessão.

---

## ANTES DE COMEÇAR, três coisas que mudam o que você vai ver

**1. A ingestão NÃO tem tela própria, e isso é deliberado.** A OST não pediu tela, e a fábrica não
constrói o que não foi pedido (§A.31). O que você valida é o **efeito** dela nas telas que já
existem: a Central de Candidatos e a Central de Vagas enchendo sozinhas.

**2. A varredura NASCE INERTE.** Sem a variável `PANDAPE_VARREDURA_DATA_CORTE`, nada é lido e nada é
escrito. **A data não tem valor padrão de propósito:** um padrão começaria a colher dado de 137.654
pessoas na primeira subida. Qual data entra é **decisão sua**.

**3. A validação na 3120 usa PAYLOAD FABRICADO, e a razão é de LGPD.** O `seguranca` vetou rodar a
varredura real na homologação: o database `ea_automatic_homolog` é declarado, na própria unidade
systemd, como **"clone ANONIMIZADO"**. Escrever nome, CPF, e-mail e telefone de candidatos reais ali
torna essa frase falsa enquanto ela continua escrita, e quem confiar nela depois (ao tirar dump, ao
depurar, ao compartilhar tela) quebra em silêncio.

**O que muda para você, na prática: nada.** O payload é fabricado, mas ele atravessa **o caminho real
de escrita, inteiro**: o mesmo ciclo, o mesmo de/para, o mesmo repositório, as mesmas guardas. Você
vê a tela viva, a fila enchendo, a etapa traduzindo e o conflito indo para revisão. O que você não vê
é o nome de gente de verdade, que é justamente o que não é preciso ver para validar a tela.

Se você quiser ver dado REAL chegando do ATS, isso é validação de integração e não de tela, e o lugar
dela é produção, com a varredura ligada por janela curta, sob o seu olho. É a mesma régua que a INT-4
seguiu quando o sandbox não bastou.

---

## FASE 1: A INÉRCIA (prove que nada acontece)

**Por que começar provando que nada acontece:** é a garantia de que ligar a ponte é uma decisão sua,
e não um efeito colateral de a frente ter subido.

1. Abra a **Central de Candidatos** na 3120 e anote o total.
2. Abra a **Central de Vagas** e anote o total.
3. Espere. A cadência é de 30 minutos.
4. **O esperado: os dois números NÃO mudam.** Sem a data de corte, o worker nem sobe.

Se algum número mudar nesta fase, **pare e me chame**: é defeito.

---

## FASE 2: UMA VAGA (o caminho inteiro, num caso só)

A fábrica liga a varredura com um lote fabricado de **uma vaga e três candidatos**, um em cada etapa
mapeada.

**O que conferir na tela:**

| onde | o que tem de aparecer |
|---|---|
| Central de Vagas | **uma linha nova**, com o número do ATS preenchido, nascendo em **Pendente De Revisão**, com o selo **Não Revisada** |
| a mesma linha | **cliente VAZIO**, e isto é o certo, não defeito (veja a nota abaixo) |
| Central de Candidatos | **três pessoas novas**, cada uma na **etapa traduzida**, nunca todas na inicial |
| a ficha de qualquer uma | **origem Pandapé** |
| **Vagas Pendentes De Revisão** (menu novo) | a mesma linha, esperando alguém vincular o cliente |

**A nota do cliente vazio, e ela importa:** foi medido que o cliente da vaga **não tem caminho na API
do Pandapé**. A régua da casa é **adiar em vez de inventar** `cod_cliente` (§A.5), então a vaga entra
sem cliente e o vínculo é manual. Preencher sozinho seria pior: seria um palpite parecendo dado.

---

## FASE 3: A REPETIÇÃO (a prova que mais importa)

**Rode a mesma volta de novo, com o mesmo lote.**

| o que conferir | esperado |
|---|---|
| total de candidatos | **NÃO muda.** Ninguém duplica |
| total de vagas | **NÃO muda** |
| a etapa de cada um | continua onde estava |

**Por que esta fase é a mais importante:** a volta roda a cada 30 minutos, 48 vezes por dia. Se a
repetição escrevesse, duas coisas quebrariam de uma vez, e as duas em silêncio: a base encheria de
duplicatas, e **cada escrita empurraria o relógio de retenção da pessoa**, fazendo com que ninguém
que a ingestão tocasse jamais expirasse. Esse é o furo de LGPD que esta mesma frente fechou hoje, e
ele voltaria pela porta da ingestão.

---

## FASE 4: A ETAPA NÃO MAPEADA (o fail-closed)

A fábrica manda um candidato numa pasta **sem tradução**.

| o que conferir | esperado |
|---|---|
| Central de Candidatos | **a pessoa NÃO aparece.** Nada é escrito, nem o cadastro dela |
| o registro da volta | a chave da pasta fica registrada para você mapear |

**Por que ele não entra:** chutar a etapa inicial escreveria, no histórico de uma pessoa, um movimento
que ninguém fez, e contaminaria o funil inteiro sem ninguém descobrir. E cadastrar a pessoa para
segurar só a candidatura coletaria CPF, e-mail e telefone para uso nenhum.

**ISTO MUDOU COM AS SUAS DECISÕES, e o número de fora caiu.** Antes, das 25 chaves de etapa vivas no
Pandapé, 10 estavam mapeadas e **15 faltavam**, o que deixava 35% das inscrições de fora. Agora são
**23 chaves resolvidas**: as 10 antigas, mais `entrevista inteligente` (325 vagas), `pre selecionado`
(136 vagas) e as **11 marginais** que você fechou, todas ATIVAS.

**Duas ficaram INATIVAS de propósito, e a diferença importa:** `retorno negativo etapa soulan` (401
vagas) e `finalistas` (174 vagas). Linha inativa **não é linha ausente**: ela fica gravada como
decisão deliberada, e o resolvedor a trata como não mapeada, então **ninguém é escrito por ela**.
Ligar qualquer uma das duas é um `update` de uma linha, e o efeito de ligar a do retorno negativo é
grande: ela é a única que escreve `DESCARTADO`, o que carimba a pessoa e mexe no relógio de retenção.

A fase 4 continua valendo para a pasta que ninguém mapeou ainda, que é o que o fail-closed protege.

---

## FASE 5: O CICLO DE VIDA DA VAGA (o mais difícil de ver, e o mais caro se falhar)

A fábrica tira a vaga do lote de ativas, simulando o encerramento no Pandapé.

| o que conferir | esperado |
|---|---|
| Central de Vagas | a linha vai para **Fechada** |
| uma vaga que VOCÊ fechou à mão | **continua fechada.** A varredura não reabre o que gente fechou |
| a vaga volta ao lote de ativas | volta para **Aberta** |

**Por que isto existe:** a vaga espelhada que nunca encerrasse deixaria **toda pessoa viva dentro
dela protegida do expurgo para sempre**. Ninguém perceberia: nada falha, nenhuma tela acusa, e o
conjunto cresce a cada volta. Foi o achado mais caro da auditoria desta frente.

---

## FASE 6: A FILA DE REVISÃO (a tela nova, e a decisão 5)

O menu **Vagas Pendentes De Revisão** nasce só para o Super Admin (§A.23): quem mais enxerga é você
quem libera, na tela de permissão de menu.

| o que conferir | esperado |
|---|---|
| a fila | as vagas espelhadas, cada uma com a tag **Sem Cliente** |
| a vaga sem cliente | o botão de liberar **recusa**, e a tela diz que falta vincular o cliente |
| vincule o cliente e libere | a vaga sai da fila e vai para **Aberta**, uma de cada vez |
| a aba **Liberadas Recentemente** | a vaga aparece ali, com quem liberou |
| liberar em lote | **não existe**, e a ausência é deliberada |

**Por que não existe lote:** um cliente errado aplicado a 600 vagas atribuiria centenas de pessoas ao
controlador errado, de uma vez, sem ninguém olhar linha por linha. A auditoria vetou, e a liberação é
uma vaga por vez.

**A trava é do servidor, não da tela.** Sem cliente vinculado, a rota recusa mesmo que alguém chame
por fora. A tela só explica o motivo.

**A correção é de MASTER.** Liberou com o cliente errado, o Master conserta pela ação de correção, que
pode trocar o cliente e, se você quiser, devolver a vaga para a fila. Consultor não corrige.

---

## O QUE VOCÊ DECIDE DEPOIS DE VALIDAR

1. **A data de corte** (`PANDAPE_VARREDURA_DATA_CORTE`), que é o que liga a ponte de verdade.
2. ~~As 15 chaves de etapa sem de/para~~ **RESPONDIDO:** 11 marginais ativas, 2 inativas (o retorno
   negativo e as finalistas). Resta ligar as duas inativas, se e quando você quiser.
3. ~~Com que status a vaga espelhada nasce~~ **RESPONDIDO:** ela nasce em **Pendente De Revisão**, um
   status novo, e entra na fila da tela nova em vez de se misturar aos rascunhos de quem abre vaga
   aqui. Ligada a ponte, a Central de Vagas ganha cerca de 600 linhas de uma vez: nenhuma tela quebra,
   todas mudam de número, e as 600 ficam identificadas pelo selo.
4. **O intervalo**: 30 minutos é o mais agressivo ainda seguro, usa 20% da cota e aguenta 38% de
   crescimento da conta.
5. **Se a validação com dado real acontece em produção**, com janela curta e sob o seu olho.
