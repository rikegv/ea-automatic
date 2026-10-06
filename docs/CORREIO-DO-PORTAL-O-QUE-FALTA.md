# O CORREIO DO PORTAL: o que a fábrica resolveu e o que falta (medido em 29/09/2026)

O diretor pediu que a fábrica resolvesse o correio junto, e dissesse claro o que dependesse dele.
Isto é a resposta, com medição, não com suposição.

## 1. O que JÁ ESTÁ PRONTO, e não precisa de ninguém

**O código do correio existe, completo, e nunca foi ligado.**
`apps/backend/src/portal/portal-correio.service.ts` envia por **Gmail REST API** com conta de serviço
e delegação de domínio: monta e assina o JWT RSA à mão (`node:crypto`), troca por token em
`oauth2.googleapis.com/token`, cacheia o token com 60s de folga, monta o MIME
`multipart/alternative` (texto + HTML), barra header injection (`semQuebraDeLinha`), aplica RFC 2047
no assunto e **nunca loga destinatário, URL, token nem corpo** (§A.6). Toda falha devolve `false`,
nunca lança.

**A conta de serviço existe e a chave privada está na máquina.** Medido:
`apps/ai-service/credentials.json`, projeto **`ea-v2-automatic`**, identidade
**`ea-automatic-sa@ea-v2-automatic.iam.gserviceaccount.com`**, `client_id`
**`116735761528318719537`**, com `private_key` presente. É a mesma conta que o `ai-service` já usa.

Portanto as duas variáveis que a fábrica consegue preencher sozinha, ela consegue:
`PORTAL_CORREIO_SA_EMAIL` e `PORTAL_CORREIO_PRIVATE_KEY`.

## 2. O que FALTA, e por que a fábrica não faz

**MEDIDO AO VIVO, não deduzido.** A fábrica montou o JWT com o escopo `gmail.send` e pediu o token
ao Google, em nome de uma caixa do domínio. A resposta:

```
HTTP 401
erro:      unauthorized_client
descricao: Client is unauthorized to retrieve access tokens using this method,
           or client not authorized for any of the scopes requested.
```

Isto é a delegação de domínio **não concedida**. Nenhum e-mail sai enquanto for assim, e não há
contorno por código: a autorização mora no Admin do Workspace, que a fábrica não acessa e não se
autoconcede (§A.0).

### FALTA 1, um ato de administrador do Google Workspace

No Admin console, com conta de administrador do domínio:

> **Segurança** -> **Controle de acesso e de dados** -> **Controles de API** ->
> **Delegação em todo o domínio** -> **Adicionar novo**

| campo | valor |
|---|---|
| **ID do cliente** | `116735761528318719537` |
| **Escopos OAuth** | `https://www.googleapis.com/auth/gmail.send` |

É um escopo só, e é só de ENVIO: não dá leitura de caixa nenhuma.

### FALTA 2, uma decisão de negócio: qual caixa assina o e-mail

`PORTAL_CORREIO_REMETENTE` é a **caixa real do domínio** em nome de quem a conta de serviço envia, e
é o remetente que o candidato vê. Precisa existir de verdade no Workspace. Sugestão da fábrica, a
confirmar: uma caixa de processo, do tipo `admissao@soulanrh.com.br`, em vez da caixa pessoal de
alguém, para o candidato responder a um lugar que o time lê.

## 3. Como a fábrica PROVA que ligou, no minuto seguinte

Com os dois itens acima resolvidos, a fábrica:
1. preenche as três variáveis no `.env` da homologação (a chave privada nunca é versionada, §A.6);
2. roda de novo a mesma medição de token, e ela tem de sair `HTTP 200 / token recebido: SIM`;
3. dispara um e-mail de verdade para um endereço que o diretor indicar e mostra o recebido.

Enquanto os dois itens faltarem, o comportamento é **fail-closed por desenho**: `configurado()` diz
não, o envio recusa com `CANAL_INDISPONIVEL` e, o que importa mais, **o link não é emitido**. Emitir
sem entregar deixaria credencial viva que ninguém recebeu.

## 4. Consequência para a frente do acesso por e-mail

O código de verificação viaja pelo correio, então **o fluxo por e-mail só funciona de ponta a ponta
depois da FALTA 1 e da FALTA 2**. A fábrica constrói tudo agora, com o canal inerte, e a validação em
tela cobre o fluxo inteiro; o passo do envio real fica provado no dia em que a delegação existir.
Nenhum contorno de teste grava código em log ou o mostra na tela: isso seria justamente o vazamento
que a §A.6 proíbe.
