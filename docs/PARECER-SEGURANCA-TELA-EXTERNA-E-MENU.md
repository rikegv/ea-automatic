# Parecer De Segurança: A Tela Fora Do EA, O Documento Único, O Menu E A Trava Do Master

**VEREDITO NA EMISSÃO: VETADO NO MAPA** (§A.38 e §A.40 regra 1, antes de o código existir). O veto é
de **premissa e de recorte**, não de direção: as quatro decisões do diretor são defensáveis.

> **ESTADO ATUAL:** os vetos V13, V14 e V15 foram **fechados na mesma rodada**, com teste, e o
> coordenador conferiu. O **V12 permanece**, porque ele não é defeito de código: é a decisão de
> arquitetura que só o diretor toma. Ver a seção 6.

| # | veto | onde |
|---|---|---|
| **V12** | **O ganho declarado da tela fora do EA depende de uma peça que NINGUÉM construiu.** Não existe emissor de bilhete, nem tabela de link, nem rota de identificação, nem a barreira | `portal/portal-sessao.guard.ts`, e as quatro tabelas do portal no schema, nenhuma delas de link |
| **V13** | **Menu novo em grupo `OPERACAO` com área ADM entra AUTOMATICAMENTE no padrão do COMUM**, e passa a ser concedido a todo usuário criado e a todo COMUM no próximo backfill. É concessão por efeito colateral, a forma exata do incidente que originou a §A.23 | `domain/menus.ts:1128-1130`, `users/users.controller.ts:106`, `db/backfill-menus-comum.ts:48` |
| **V14** | **A trava do Master no servidor NÃO existia**, e o código declarava por escrito o comportamento OPOSTO ao decidido: zerar valia antes da queda, de propósito | `portal/portal-pendencias.service.ts:109-124` |
| **V15** | **Furo já aberto, independente das quatro decisões:** `solicitarReenvio` era alcançável por **qualquer usuário autenticado, de qualquer área**, por não ter papel exigido nem menu reivindicado | `portal/portal-pendencias.controller.ts:43-50` |

**Quem auditou:** agente `seguranca`, sem escrita (§A.39). **Data:** 19/09/2026. **Gravado e
consolidado pelo coordenador.**

---

## 1. A Tela Fora Do EA Desloca A Superfície, Ela Não A Reduz Sozinha

**A comparação com o VT não se sustenta, e esta é a frase que decide.** O app do VT protege o EA por
uma razão que **não se repete aqui**: ele **nunca fala com o EA**. Ele posta para a função dele mesmo e
lê a tabela de tarifas de um arquivo estático. Quem atravessa a fronteira é o **EA**, e ele atravessa
**para fora e depois**, varrendo o balde. **A superfície de entrada do EA, no modelo do VT, é ZERO.**

O Portal é o oposto por desenho. Ele precisa de, no mínimo, quatro conversas **para dentro** do EA:
identificar a pessoa, listar as pendências, pedir credencial de escrita e confirmar a chegada.
**Nenhuma delas deixa de existir porque o HTML mudou de servidor.**

| o que muda | efeito real |
|---|---|
| o HTML sai do Next do EA | **ganho real:** o candidato deixa de precisar alcançar a porta que serve a operação inteira, e o EA deixa de servir página a quem vem da internet |
| as quatro rotas de API | **não mudam de lugar**, e continuam precisando da barreira |
| a origem das chamadas | **piora, e ninguém tinha levantado:** hoje é mesma origem pelo proxy do Next; de um domínio do Hosting vira chamada cruzada, e a primeira chamada, a de identificação, ainda não tem bilhete. Ou se abre CORS para o domínio do Hosting, **o que amplia superfície**, ou a identificação não funciona |
| onde o bilhete vive | passa a viver no navegador sob um domínio de terceiro, junto de um segundo deploy que **não passa pelo gate da §A.7** |

**E o ganho é condicional:** ele se realiza se a identidade nascer **fora** do EA (o candidato se
identifica no app externo e o EA só verifica). Se a identificação virar rota pública do EA, o EA volta
a expor um enumerador de CPF à internet, e ter mudado o HTML de servidor não terá comprado nada nesse
ponto.

**O precedente do VT que serve é o inverso do que parece:** o EA assina e o app externo **verifica**,
com a metade pública da chave embutida. **Mas o token do VT carrega CPF e nome**, e o bilhete do
Portal não carrega nenhum dos dois, por decisão testada. Copiar o modelo do VT nesse ponto seria pôr o
CPF de volta na mão do candidato.

---

## 2. O Que Não Pode Ir Para O Hosting

Tudo o que for publicado é **público por construção**. Não pode ir: qualquer chave privada ou segredo;
credencial de conta de serviço; **o catálogo de tipos e a régua por cliente**; **as 91 regras de
auditoria**, inteiras ou resumidas (regra é o critério, e critério na mão de quem envia é gabarito);
nome do balde, endereço do emissor, endereço interno ou porta de loopback; qualquer dado pessoal; e o
pepper do nome do objeto. **Pode ir** a metade pública da chave e as frases da lista fechada.

**Três regras que vieram disso e foram aplicadas na construção:** a lista de documentos vem de **rota**
calculada no servidor, nunca de arquivo estático; **zero dependência de terceiro** na página, porque
qualquer script externo lê o armazenamento onde o bilhete vive; e **o bilhete não vai na URL**, porque
o registro de acesso do Hosting guarda a URL pedida e isso não é configurável por nós.

**O que já estava bem fechado:** o motivo que chega ao candidato é allowlist de saída, com onze frases
nossas; o motivo cru da IA entra, é lido para escolher a categoria e **morre ali**. E o contador de
tentativas **não vira oráculo**, porque a admissão vem do bilhete e nunca do corpo: quem tem a sessão
só consulta o próprio caso.

---

## 3. Documento Único Fecha O Portal, E Mais Lugar Nenhum

**CONFIRMADO em parte, REFUTADA a generalização.** No Portal, um arquivo por documento elimina o
conjunto parcial. Mas **o caminho do CONSULTOR continua com um arquivo por requisição** (a tela o
convida a mandar a frente, levar a reprovação e mandar o verso depois) e **o do PANDAPÉ continua
trazendo vários anexos por tipo**.

**Logo, a guarda da rodada anterior PERMANECE necessária** (a tentativa velha só é apagada depois do
veredito e só quando ele é VALIDADO). Removê-la achando que o documento único a tornou redundante faria
a frente da carteira voltar a ser apagada pelo verso, sem nada falhar. Isso ficou **escrito no código**
e está fixado por teste independente.

**O buraco real que o documento único fechou, e que ninguém tinha visto:** nada impedia um SEGUNDO
arquivo do mesmo tipo no Portal. Como `documentos_admissao` tem **uma linha por (admissão, tipo)**, o
segundo envio reescrevia o estado do primeiro: mandada a frente e depois o verso, **o sistema ficava
com o verso** e a frente virava objeto órfão.

---

## 4. O Menu E A Área

**O estado que foi encontrado:** `situacao` e `solicitarReenvio` **abertas a qualquer autenticado**
(sem papel exigido e sem menu reivindicado), e `zerarTentativas` caindo na área padrão ADM por não ser
reivindicada.

**A decisão do diretor aperta, e nisso ela está certa.** Reivindicar pelo menu da Esteira fecha o V15:
o COMUM passa a precisar **ter** o menu, e a área da operação passa a sair da linha da tabela,
governada pela tela de liberação, em vez de um padrão escondido.

**As duas armadilhas, e a primeira era veto:**
1. **criar menu NOVO é conceder**, porque todo menu de `OPERACAO` com área ADM entra sozinho no padrão
   do COMUM. A saída correta foi **reivindicar o menu `esteira` que já existe**, sem menu novo, sem
   grupo novo e sem seed;
2. **reivindicar por um menu diferente daquele da tela onde o botão vive dá 403 ao time inteiro.** A
   casa já pagou isso duas vezes, e os dois precedentes estão escritos no próprio arquivo de menus.

---

## 5. A Trava Do Master

**Esconder na tela não é defesa, e aqui era literal:** a rota é chamável direto, e qualquer Master com
um cliente HTTP zerava tentativa na primeira reprovação.

A recusa do servidor precisa de cinco coisas, todas construídas: **código de motivo estável**, **a
contagem atual e o teto**, **o caminho alternativo**, **evento na trilha sem PII**, e **a contagem
EFETIVA**, a mesma que desconta o marco da última reabertura, para a tela não dizer um número e o
servidor recusar por outro.

**Consequência declarada, que é mudança de comportamento:** logo após uma reabertura do time, a
contagem efetiva volta a 2, então o Master **não** destrava naquele instante, só depois de mais uma
reprovação. É coerente com "só na terceira" e é diferente do que acontecia.

---

## 6. O Que Foi Fechado, E O Que Permanece

| veto | estado | evidência |
|---|---|---|
| **V13** | **FECHADO** | nenhum menu novo nasceu: a operação foi reivindicada pelo menu `esteira` já existente, com teste que afirma explicitamente que nenhum menu novo apareceu |
| **V14** | **FECHADO** | regra pura de recusa, sobre a contagem efetiva, com código de motivo, contagem, caminho alternativo e evento próprio na trilha. Comentário reescrito para dizer o que o código faz |
| **V15** | **FECHADO** | a rota deixou de ser alcançável por qualquer autenticado; passou a exigir o menu que o time já tem |
| **V12** | **PERMANECE, e é decisão do diretor** | não há teste possível: é arquitetura. A camada de identidade não existe, e é ela que decide se a superfície diminui ou aumenta |

**Gate conferido pelo coordenador:** suíte completa do backend com **300 arquivos e 4.286 testes**,
zero falha, typecheck limpo, e a prova visual da tela do candidato tirada em tamanho de celular.
