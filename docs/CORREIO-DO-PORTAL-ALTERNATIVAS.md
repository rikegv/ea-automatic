# CORREIO DO PORTAL: alternativas sem depender do Workspace (levantamento, 29/09/2026)

Pedido do diretor: ele **não** é admin do Google Workspace (a delegação do `gmail.send` depende do
Fernando), mas **é** admin do Google Cloud. Este documento levanta as alternativas. **Nada foi
construído.**

O e-mail carrega o **código de verificação** e o **link do Portal**: transacional, volume baixo, um
por tentativa de acesso.

---

## 0. DECISÃO DO DIRETOR, registrada (29/09/2026)

**Ele ACEITOU o fluxo que a auditoria propôs.** O candidato prova a posse da caixa com o código,
informa CPF e data de nascimento, e o sistema **envia o link do Portal para aquela mesma caixa**, em
vez de abrir o Portal direto. Ele entra pelo link, com CPF e nascimento, que é a porta de sempre.

**O desenho vetado NÃO volta.** O que a auditoria derrubou foi abrir o Portal achando a admissão por
**busca do CPF digitado**: como candidato sem CPF tem o campo nulo, e nulo não discorda de nada, a
trava de divergência era vazia justamente na população desta frente, e quem tivesse a caixa de um
candidato abriria o prontuário de um terceiro. Somado a isso, medido em produção: **6 e-mails
compartilhados por 12 CPFs, 5 deles com dois nomes diferentes**. Nenhuma implementação futura pode
reintroduzir esse caminho.

Consequência para este documento: **sem correio não há frente nenhuma**, porque tanto o código quanto
o link viajam por e-mail.

---

## 1. O QUE FOI MEDIDO, e é o que decide o resto

Tudo abaixo foi medido ao vivo (DNS público e conectividade da VM), não suposto.

### 1.1 Os dois domínios são de mundos diferentes

| domínio | MX (quem recebe) | SPF | DMARC |
|---|---|---|---|
| **soulan.com.br** | **Google Workspace** (`aspmx.l.google.com`) | `include:_spf.rdstation.com.br include:sendgrid.net include:_spf.google.com ~all` | **p=quarantine** |
| **soulanrh.com.br** | **Microsoft 365** (`mail.protection.outlook.com`) | `include:spf.protection.outlook.com -all` | p=none |

O `soulanrh.com.br`, que é o domínio público do Portal e do VT, **não é Google coisa nenhuma**. Mandar
e-mail como `@soulanrh.com.br` por qualquer provedor de fora exige mexer no DNS dele, e o SPF é `-all`
(falha dura). **A recomendação é enviar como `@soulan.com.br`**, onde já existe estrutura pronta.

O `p=quarantine` do `soulan.com.br` é o dado mais importante do item 6: **e-mail que não alinhe SPF ou
DKIM com o domínio é retido ou vai para spam**, por política publicada pela própria empresa.

### 1.2 O ACHADO PRINCIPAL: o SendGrid JÁ ESTÁ AUTENTICADO no soulan.com.br

```
s1._domainkey.soulan.com.br  ->  s1.domainkey.u14395425.wl176.sendgrid.net
s2._domainkey.soulan.com.br  ->  s2.domainkey.u14395425.wl176.sendgrid.net
SPF do soulan.com.br         ->  include:sendgrid.net
```

Existe uma conta SendGrid (id `u14395425`) com o domínio da empresa **já autenticado**, DKIM e SPF
publicados. Alguém dentro da Soulan já fez esse trabalho, provavelmente junto do RD Station (que
também aparece no SPF).

**Por que isso importa mais do que o preço:** a parte cara de qualquer provedor novo é **publicar DNS**,
e é justamente ela que depende de terceiro. No SendGrid ela **já está feita**.

**A ressalva que não pode passar batido:** essa autenticação pertence **àquela conta**. Uma conta
SendGrid **nova** não herda nada e precisaria de DNS novo. O valor está em conseguir uma chave **da
conta que existe**, não em abrir outra.

### 1.3 O DNS mora no Registro.br, e é o gargalo comum a quase tudo

Os dois domínios são servidos pelos nameservers do Registro.br (`a/b/c.sec.dns.br`). Quem tiver o
login do Registro.br publica registro; quem não tiver, pede. Na frente do VT, mexer em DNS foi tarefa
do Fernando. **Toda opção que exija DNS novo volta a depender de terceiro**, que é exatamente o que o
diretor quer evitar.

### 1.4 A rede da VM não bloqueia nada

Testado da VM: `smtp.gmail.com:587` e `:465`, `smtp.sendgrid.net:587`,
`email-smtp.us-east-1.amazonaws.com:587`, `api.resend.com:443`, `api.sendgrid.com:443` e
`oauth2.googleapis.com:443` estão **todos abertos**. Nenhuma opção morre por firewall.

---

## 2. AS OPÇÕES, uma a uma

### OPÇÃO A, Gmail com SENHA DE APP da conta do próprio diretor

Enviar por `smtp.gmail.com:587` autenticando com a conta `@soulan.com.br` dele e uma **senha de app**
(gerada na página de segurança da conta Google dele, exige verificação em duas etapas ligada).

| | |
|---|---|
| **DNS novo** | **nenhum** |
| **Entregabilidade** | **a melhor possível.** Sai pelos servidores do Google, o SPF (`include:_spf.google.com`) e o DKIM (`google._domainkey`) já estão publicados, e o DMARC `p=quarantine` **passa** |
| **Custo** | **zero** |
| **Limite** | cerca de 2.000 mensagens por dia |
| **Diretor faz** | tenta gerar a senha de app na conta dele e entrega à fábrica |
| **Fábrica faz** | troca o transporte do correio de API do Gmail para SMTP autenticado |
| **Terceiro** | **nenhum, SE** o Workspace permitir senha de app. O admin pode ter desligado |
| **Funciona hoje?** | **provavelmente sim, e descobre em dois minutos**: ou a opção aparece na conta dele, ou não aparece |

**O ponto fraco, dito com clareza:** o remetente é a **caixa pessoal dele**, e a senha de app é uma
credencial pessoal morando no servidor. Serve para destravar agora; não é o desenho final.

### OPÇÃO B, Gmail por OAuth de APP INTERNO no Google Cloud (onde ele é admin)

Em vez da delegação de domínio (que é do Workspace), criar no projeto `ea-v2-automatic` um **cliente
OAuth de aplicativo interno** e o diretor **consentir uma vez** com a conta dele. Isso devolve um
token de atualização que o servidor usa para enviar como aquela caixa.

| | |
|---|---|
| **DNS novo** | nenhum |
| **Entregabilidade** | **idêntica à opção A**: é o mesmo Google enviando |
| **Custo** | zero |
| **Diretor faz** | cria o cliente OAuth no Cloud Console (ele é admin lá) e clica no consentimento uma vez |
| **Fábrica faz** | troca o fluxo de JWT de conta de serviço para token de atualização |
| **Terceiro** | **nenhum, SE** o Workspace confiar em apps internos do próprio domínio, que é o padrão comum. Se o tenant bloquear apps não configurados, volta ao admin |
| **Funciona hoje?** | provável, e também descobrível na hora: o consentimento ou passa ou é barrado |

É a **opção A sem a credencial pessoal**. Mais limpa, um pouco mais de trabalho.

### OPÇÃO C, SendGrid pela conta que JÁ EXISTE

| | |
|---|---|
| **DNS novo** | **nenhum**, desde que a chave venha da conta `u14395425` (item 1.2) |
| **Entregabilidade** | **boa e já alinhada**: DKIM assina como `soulan.com.br`, então o DMARC `p=quarantine` passa |
| **Custo** | o plano gratuito acabou em **maio de 2025**; hoje é teste de 60 dias e depois a partir de **US$ 19,95/mês**. **Mas a conta já existe e presumivelmente já é paga por alguém** |
| **Diretor faz** | **descobrir quem é o dono da conta** (marketing, ou quem cuida do RD Station) e pedir uma chave de API só de envio |
| **Fábrica faz** | troca o transporte para a API do SendGrid |
| **Terceiro** | o dono interno da conta. **Não é o Fernando**, e não é DNS |
| **Funciona hoje?** | sim, no minuto em que a chave aparecer |

**É a melhor opção definitiva:** única com domínio corporativo autenticado, remetente institucional e
nenhuma dependência de DNS.

### OPÇÃO D, Resend

| | |
|---|---|
| **Custo** | **gratuito e permanente**: 3.000 por mês, teto de 100 por dia, um domínio, sem cartão |
| **DNS novo** | **SIM, obrigatório.** Sem domínio verificado o Resend só envia de `onboarding@resend.dev` e **só para a caixa do dono da conta**: não serve para candidato nenhum |
| **Entregabilidade** | ótima **depois** do DNS; **impossível** antes |
| **Diretor faz** | cria a conta sozinho, em minutos |
| **Terceiro** | **quem publica DNS** |
| **Funciona hoje?** | só para teste interno |

### OPÇÃO E, Brevo

| | |
|---|---|
| **Custo** | **gratuito e permanente**: **300 por dia**, sem cartão. O mais generoso dos gratuitos |
| **Sem DNS?** | envia, sim: basta verificar o **endereço remetente** por link no e-mail. **Mas** sem domínio autenticado o Brevo **reescreve o remetente para `@brevosend.com`** |
| **Entregabilidade** | é o problema. Com a reescrita, **o candidato recebe de um domínio desconhecido**, o que para um pedido de documento é a cara de um golpe. Com DNS, boa |
| **Terceiro** | **quem publica DNS**, para valer a pena |
| **Funciona hoje?** | tecnicamente sim, com remetente `@brevosend.com`. **Não recomendado assim** |

### OPÇÃO F, Mailgun

| | |
|---|---|
| **Custo** | gratuito e permanente, **100 por dia**; pagos a partir de US$ 15/mês |
| **DNS novo** | **SIM**, autenticação de domínio é o caminho normal |
| **Entregabilidade** | boa com DNS |
| **Terceiro** | **quem publica DNS** |
| **Funciona hoje?** | não, sem o DNS |

Equivale ao Resend com teto menor. Não acrescenta nada que o Resend já não ofereça.

### OPÇÃO G, Amazon SES

| | |
|---|---|
| **Custo** | o mais barato em escala, US$ 0,10 por mil; 3.000 grátis por mês no primeiro ano |
| **Sem DNS?** | dá para verificar **um endereço**, clicando num link. Mas **a caixa de areia só entrega para endereços verificados**: para falar com candidato precisa de **acesso de produção** (formulário, cerca de 24h) |
| **Entregabilidade** | **o pior caso sem DNS.** SPF e DKIM não alinham com `soulan.com.br`, e o DMARC é `p=quarantine`: o código tende a ser **retido ou jogado em spam**. Falha silenciosa no pior lugar |
| **Terceiro** | a AWS (aprovação) e o DNS |
| **Funciona hoje?** | não |

### OPÇÃO H, SMTP do Microsoft 365 (soulanrh.com.br)

Depende de habilitar autenticação SMTP na caixa, ato de **admin do tenant Microsoft**. Mesma
dependência que se quer evitar, em outro fornecedor. **Não recomendada.**

### OPÇÃO I, um serviço de envio "do Google Cloud"

**Não existe.** O Google Cloud **não tem serviço de envio de e-mail próprio**, e a recomendação oficial
dele é usar terceiros (SendGrid, Mailgun, Mailjet), inclusive para quem saiu da API de Mail legada do
App Engine. Ser admin do Cloud **não destrava envio por si só**: o que o Cloud dá é onde criar o
**cliente OAuth** da opção B.

### OPÇÃO J, SMTP próprio (servidor de e-mail na VM)

Tecnicamente possível, **na prática a pior de todas**. Exige IP reverso, aquecimento de reputação, SPF,
DKIM e DMARC publicados, e mesmo assim provedores grandes tratam IP residencial ou de nuvem com
desconfiança. Para um código de acesso, entregar "quase sempre" é não entregar. **Descartada.**

---

## 3. ENTREGABILIDADE: a regra única que organiza o item 6

**Para o candidato receber um e-mail que pareça da empresa, o provedor precisa assinar como o domínio
da empresa. Isso é DNS.** Só há três jeitos de escapar disso:

1. **enviar pelo próprio Google** (opções A e B), porque o DNS do Google **já está publicado**;
2. **usar um provedor já autenticado** (opção C, SendGrid), porque o DNS dele **já está publicado**;
3. **aceitar sair com o domínio do provedor** (opção E sem DNS), que para pedido de documento é
   inaceitável.

Todo o resto (Resend, Mailgun, SES, e o próprio Brevo bem feito) **passa pelo DNS, logo pelo Fernando
ou por quem tem o login do Registro.br**.

| opção | precisa de DNS novo? | DMARC `p=quarantine` passa? | depende do Fernando? |
|---|---|---|---|
| A, Gmail senha de app | não | **sim** | **não** |
| B, OAuth interno | não | **sim** | **não** |
| C, SendGrid existente | não | **sim** | **não** (depende do dono interno da conta) |
| D, Resend | **sim** | só com DNS | **sim** |
| E, Brevo | sem DNS reescreve o remetente | não, sai como `@brevosend.com` | **sim**, para ficar bom |
| F, Mailgun | **sim** | só com DNS | **sim** |
| G, SES | recomendado | **não**, tende a spam | **sim** |
| H, Microsoft 365 | não | sim | **sim** (admin do tenant) |
| J, SMTP próprio | **sim**, e mais | improvável | **sim** |

---

## 4. RESPOSTA DIRETA ÀS SEIS PERGUNTAS

1. **Serviço de envio no Google Cloud?** Não existe nativo. O que o acesso de admin ao Cloud destrava
   é a **opção B** (cliente OAuth interno), e essa dispensa o Workspace.
2. **SendGrid?** Funciona, e é a melhor opção definitiva, porque **o domínio já está autenticado nele**.
   O gratuito acabou; o caminho é a conta que já existe. Ele consegue sozinho **se achar o dono interno**.
3. **Outras?** Brevo é o gratuito mais generoso (300/dia) mas reescreve o remetente sem DNS; Resend e
   Mailgun exigem DNS; SES é a mais barata e a de pior entregabilidade sem DNS; SMTP próprio, descartada.
4. **Quem depende de quem:** ver a tabela de cada opção e a do item 3.
5. **Alguma funciona HOJE, sem contratar e sem esperar ninguém?** **Sim: a opção A**, e em segundo lugar
   a **B**. Nenhuma custa dinheiro, nenhuma mexe em DNS, e as duas se provam em minutos.
6. **Entregabilidade:** item 3. A regra curta é que **só as opções A, B e C entregam como a empresa sem
   tocar em DNS**.

## 5. A RECOMENDAÇÃO DA FÁBRICA

**Duas camadas, e elas não competem.**

- **AGORA, para destravar a validação:** **opção A** (senha de app na conta dele), ou **B** se ele
  preferir já sem credencial pessoal. Custo zero, sem DNS, sem terceiro, entregabilidade alinhada.
- **DEPOIS, como desenho definitivo:** **opção C**, a chave da conta SendGrid que já existe, com
  remetente institucional do tipo `admissao@soulan.com.br`.

**O que a fábrica NÃO recomenda:** domínio paralelo só para usar o Resend de graça, e Brevo saindo como
`@brevosend.com`. Nos dois casos o candidato receberia um pedido de documento de um domínio que não é o
da empresa, que é exatamente a cara de um golpe. E SES sem DNS, porque o `p=quarantine` do domínio joga
o código no spam.

**Observação de higiene, não é bloqueio:** o `soulan.com.br` tem um segundo texto no DNS com um
`v=spf1 ... locaweb ...` grudado no fim de umas verificações do Google. Como ele **não começa** com
`v=spf1`, nenhum validador o lê como SPF, então hoje **não atrapalha**. Vale limpar quando alguém mexer
nesse DNS.
