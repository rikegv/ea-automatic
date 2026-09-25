# Plano de adoção do visual do protótipo do Designer no Portal do Candidato

Documento de ARQUITETURA. É PLANO, não construção. Nenhuma linha de código de produção sai
daqui: o diretor aprova por partes antes de qualquer implementação (§A.0, §A.31). Autor: agente
`arquiteto` (read-only, §A.39). Data: 2026-09-24.

Regra de escrita: §A.11 (travessão proibido). §A.24 (Title Case em título e tag). §A.14/§A.31
(só o que a OST pede). Fronteira firme desta frente: NÃO tocar `as/` nem a ingestão. Também NÃO
tocar o backend do Portal, o `ai-service`, o gerenciador do RH (`/admin/portal-links`,
`portal-painel`, `portal-envio-link`, `EnvioDoLink`) nem o contrato `shared-types` por conta
própria (o contrato é do coordenador, §A.39).

---

## 0. O que este plano é, em uma frase

Trocar a PELE do Portal do Candidato pela pele do protótipo do Designer (fonte Montserrat, paleta
Soulan, animação da auditoria, layout de trilha, campos de conferência), mantendo intacto o MOTOR
que a fábrica construiu e o diretor validou: a máquina de estado da trilha, o modelo de sessão
PII-free, a auditoria síncrona, o teto de tentativas, a ponte do VT, a régua por (cliente+cargo) e
todas as guardas de segurança da §A.6.

O protótipo é uma casca visual com dados de exemplo (`mock.ts`) e chamadas marcadas `TODO`. O
motor é a lógica real, já ligada ao backend, já auditada (vetos V5, V7, V12, F9 no contrato). O
trabalho é casar a casca no motor, e onde os dois divergem, o MOTOR VENCE, porque ele é o que já
foi validado e auditado. O protótipo empresta o visual, nunca o comportamento.

---

## 1. Quadro ADOTA / RELIGA / ADAPTA / ENCAIXA / RISCOS

| Eixo | O que entra | Observação |
|---|---|---|
| **ADOTA** (pega do protótipo como está, ou quase) | Paleta Soulan + tokens `portal-*` (preset Tailwind), fonte Montserrat local, animação da auditoria (`Analise.tsx`, órbitas/lupa/scan, só CSS), layout de campos de conferência (`Documento.tsx CampoLido`/`GradeCampos`), prévia do documento, cabeçalho/rodapé (`PortalHeader`), botões/tags/notas/cards (`ui.tsx`), os textos aprovados ("Necessário"/"Opcional", "Confira", passos do "Como Funciona") | É pele e microcopy. Zero lógica de negócio. A animação vira COSMÉTICA (ver Decisão 3) |
| **RELIGA** (troca o `TODO`/mock pela chamada real que JÁ existe) | `obterCandidato`/`listarDocumentos` para `GET /portal/documentos` (uma chamada, traz tudo); envio de arquivo para o fluxo de 3 passos real (credencial, PUT direto no armazenamento, `POST /portal/confirmar`); `confirmarDados` para `POST /portal/dados-gi`; termo para `POST /portal/termo`; pular para o estado de VISITA local (o motor não persiste pulado) | O protótipo supõe upload multipart e polling. O motor NÃO tem essas rotas. A religação segue o motor |
| **ADAPTA** (existe nos dois, mas de forma diferente, e o motor manda) | Roteamento (Decisão 1), sessão (Decisão 2, aval `seguranca`), síncrono vs polling (Decisão 3), contrato de estados/campos (tabelas 5.2 e 5.3), cabeçalho sem nome completo (só primeiro nome, veto V5) | Cada um tem seção própria abaixo |
| **ENCAIXA** (o motor tem, o protótipo não previu, e precisa de casa no visual novo) | Teto de 3 + Master destrava (estado NO_TIME "Com O Consultor"); ponte do VT (casa vira botão, não upload); reabertura de documento aceito; telas de erro de acesso ("Abra O Link De Novo", "Link Inválido", bloqueio por rate-limit); dedup + "Você Já Confirmou"; passo FINAL (campos sem documento: raça, grau, estado civil); régua reservista vinda do backend; TTL/expurgo da conferência (backend, invisível na tela) | Lista item a item na seção 6 |
| **RISCOS** | Colisão da rota `/portal` (código validado, §A.26); merge do Tailwind (preset + fonte); `lucide-react` é dependência nova; Montserrat local; nome completo é PII que a tela não pode receber; o Sol tem duas APIs diferentes; a suíte de testes do portal (dezenas de specs) precisa continuar verde | Seção 7 |

---

## 2. Decisão 1: roteamento (multi-página do protótipo vs página única do motor)

**O que cada lado é.** O protótipo é MULTI-PÁGINA roteada: route groups `(publico)` e
`(autenticado)`, e páginas `/portal/boas-vindas`, `/portal/o-que-separar`, `/portal/como-funciona`,
`/portal/documentos/[docId]`, `/portal/documentos/[docId]/analisando`, `.../conferir`,
`.../ajuste`, `/portal/concluido`. Navegação por `useRouter().push`. O motor é PÁGINA ÚNICA
(`apps/frontend/src/app/portal/page.tsx`, 2325 linhas) com máquina de estado interna: telas
`BOAS_VINDAS` -> `REUNIR` -> `COMO_FUNCIONA` -> `TRILHA`, e dentro da trilha um estado `Envio`
(`parado`/`analisando`/`aceito`/`conferir`/`ajustar`/`noTime`/`erro`) que decide o que a casa
mostra. A navegação entre documentos é `indice` + `historico` (pilha de visita), nunca URL.

**Decisão proposta: MANTER PÁGINA ÚNICA e só REPAGINAR.** Adotar o visual das telas do protótipo
DENTRO da máquina de estado que já existe, não trocar a máquina por rotas.

**Por que, e é decisão pesada de arquitetura:**

1. **A URL do protótipo carrega `docId` e estados de documento (`/documentos/rg/conferir`).** Isso
   é exatamente o que o motor recusa por segurança: o contrato NÃO expõe id de admissão nem id de
   tipo de documento, e a tela pede credencial pelo CÓDIGO do tipo, com a admissão saindo da
   sessão (nota §A.6 no topo do bloco do contrato em `shared-types`). Colocar o código do documento
   na URL reabre a superfície que o desenho fechou: URL vaza em histórico, em captura de tela, em
   link recompartilhado. A página única mantém tudo em estado de memória, que morre com a aba.

2. **O deep-link do protótipo é incompatível com o modelo PII-free.** No motor, a ÚNICA entrada é
   `/portal#t=<linkToken>` no fragmento (some da barra no primeiro render). Uma rota
   `/portal/documentos/rg/conferir` acessada direto não tem fragmento, não tem sessão, e cairia
   sempre em "Abra O Link De Novo". Deep-link para uma casa específica não é um recurso que o
   modelo de segurança permita, então o valor que as rotas trariam (link direto para um passo) não
   se realiza aqui.

3. **A retomada já está resolvida na página única, e ela é sutil.** O motor trata: refresh (relê
   fragmento ou `sessionStorage`), 401 da sessão de 30 minutos no meio de um envio (reabre
   identificação sem perder progresso), volta da aba após o VT (`visibilitychange` religa a
   trilha), lista de documentos vazia (pré-admissão sem cargo). Reconstruir isso sobre rotas
   multiplicaria os pontos onde a sessão pode faltar (um por página), quando hoje há um só.

4. **O botão Voltar do navegador.** Na página única, Voltar do navegador sai do portal (uma
   entrada de histórico), e a navegação entre documentos é o botão "Voltar para o documento
   anterior" (pilha `historico`), que é navegação de VISITA, não de avanço. No protótipo, Voltar do
   navegador voltaria uma rota, misturando "sair" com "documento anterior", e o histórico encheria
   de estados de documento que não deviam nem existir na barra.

**Consequência prática:** as páginas do protótipo (`boas-vindas`, `como-funciona`, `analisando`,
`conferir`, `ajuste`, `concluido`) viram BLOCOS DE RENDER dentro da página única, endereçados pelo
estado (`tela` e `envio.fase`), não por rota. Os componentes visuais do protótipo (`Card`,
`CabecalhoDocumento`, `CampoLido`, `PalcoAnalise`, `SolMensagem`, `Nota`, `Tag`) são reaproveitados;
o roteamento e os route groups `(publico)`/`(autenticado)` são DESCARTADOS. A pasta
`app/portal/(autenticado)/` do protótipo não é copiada.

**Alternativa, se o diretor preferir rotas:** só seria viável reescrevendo o modelo de sessão para
cookie + middleware (Decisão 2, caminho A), o que reabre o veto V5. Fica registrado que as duas
decisões estão amarradas: rotas exigem cookie, e cookie exige aval do `seguranca`.

---

## 3. Decisão 2: sessão (cookie + server components do protótipo vs PII-free fragment do motor)

**Esta é a adaptação mais pesada e a que exige aval do `seguranca` antes de qualquer código
(§A.38).**

**O que o protótipo assume.** `FormAcesso` faz `POST /api/auth/candidato` e espera um COOKIE de
sessão. O layout `(autenticado)/layout.tsx` é um SERVER COMPONENT `async` que chama
`obterCandidato()` (fetch com `credentials: "include"`) e um `middleware.ts` protege o grupo lendo
o cookie. Ou seja: sessão em cookie, verificação no servidor, dados buscados no servidor.

**O que o motor faz, por decisão de segurança já validada (veto V5, PII-free).** A entrada é o
`linkToken` no FRAGMENTO da URL (`#t=`), que NUNCA vai ao servidor (não entra em requisição, log
de proxy ou `Referer`). A identificação é `POST /portal/identificar` com CPF + data de nascimento,
que devolve uma sessão de 30 minutos (bilhete assinado, sem CPF, sem nome). Link e sessão vivem no
`sessionStorage` da aba (morrem ao fechar), NUNCA em cookie e NUNCA em `localStorage`. Não há
server component: a página é `"use client"` inteira, e todo dado vem por `apiFetch` autenticado com
o token da sessão.

**Por que o cookie do protótipo é incompatível com o modelo validado:**

- **Cookie viaja sozinho em toda requisição de mesma origem**, inclusive nas chamadas do EA
  operador que compartilham o domínio. O modelo de token explícito no cabeçalho é o que mantém a
  sessão do candidato isolada e curta de propósito (30 minutos, porque é credencial de escrita no
  armazenamento).
- **Server component que faz fetch com a sessão do candidato** moveria a credencial para o servidor
  de render do Next, criando um segundo lugar onde a sessão existe. O motor mantém a sessão só no
  cliente, na aba.
- **O `middleware.ts` protegendo `(autenticado)`** pressupõe a sessão legível pelo servidor (cookie),
  que é o que o veto V5 evita.

**Decisão proposta: PRESERVAR o modelo do motor. As telas do protótipo que o layout `(autenticado)`
serviria passam a ser blocos CLIENT da página única.** Não há layout server, não há middleware, não
há cookie. O "provedor de sessão" já existe e é o próprio estado da página única (`sessao`,
`linkToken`, `trilha`), que relê o token do `sessionStorage` e busca a trilha pela API existente
(`GET /portal/documentos`). O cabeçalho do protótipo (`PortalHeader`) é renderizado como componente
client, alimentado por `trilha.primeiroNome` + `trilha.cargo` + `trilha.cliente`, NÃO por um
`obterCandidato()` server.

**Ponto de PII que o `seguranca` precisa validar (e é achado do arquiteto):** o `PortalHeader` do
protótipo mostra `candidato.nome` (nome COMPLETO), `candidato.iniciais` e `candidato.vaga`. O
contrato do motor NÃO tem nome completo (só `primeiroNome`), por veto V5. Adotar o cabeçalho exige
REDUZIR: mostrar só o primeiro nome, e derivar iniciais do primeiro nome (ou remover o avatar de
iniciais). Trazer o nome completo de volta ao contrato para alimentar o cabeçalho seria reintroduzir
PII que o desenho removeu. O cabeçalho é ADOTADO no visual, ADAPTADO no dado.

**Marcação obrigatória:** esta decisão (manter PII-free, recusar cookie/server/middleware, reduzir o
cabeçalho a primeiro nome) PRECISA DE AVAL DO `seguranca` ANTES DE CONSTRUIR (§A.38). O gatilho é o
tema: sessão, autenticação, CPF e dado pessoal. A saída do `seguranca` é APROVADO ou VETADO com
arquivo:linha. Sem ela, a fase 2 não começa.

---

## 4. Decisão 3: auditoria síncrona (motor) vs polling de 5 etapas (protótipo)

**O que o protótipo faz.** A rota `/documentos/[docId]/analisando` roda `useStatusAnalise`, um hook
que hoje é MOCK (avança uma etapa a cada 1,5s por `setInterval`) e que o README manda trocar por
POLLING real (`GET /api/portal/documentos/:id/analise` a cada 1,5s, ou SSE), com `etapa` 0 a 5 e
`resultado` `processando`/`concluido`/`ajuste`. As 5 etapas ("Recebendo o arquivo", "Verificando
nitidez", "Lendo os dados", "Validando autenticidade", "Conferindo com o cadastro") são progresso
REAL por etapa.

**O que o motor decidiu, e é validado (bugs 4/5/6).** A auditoria é SÍNCRONA: o `POST
/portal/confirmar` já devolve o veredito, a sugestão de campos e as tentativas na MESMA resposta. O
polling foi rejeitado de propósito ("polling é errado, persistir e devolver pela trilha"): o estado
não é reconstruído por consulta repetida, é lido de `passo.conferencia`, que o servidor persiste. NÃO
existe endpoint `/analise` (no protótipo, `consultarAnalise` lança "Implementar").

**Decisão proposta: ADOTAR a animação `Analise.tsx` como COSMÉTICA sobre a chamada síncrona.** A
animação (órbitas, lupa, scan, tudo CSS) roda ENQUANTO o request de `POST /portal/confirmar` está em
voo (fase `analisando` do estado `Envio` que já existe). Quando a resposta chega, a tela roteia pelo
VEREDITO devolvido: aceito com campos vai para `conferir`, reprovado vai para `ajustar`, teto batido
vai para `noTime`. O `PalcoAnalise` do protótipo (a animação bonita) substitui o `Recado` "Estou
analisando o seu documento" atual, sem mudar nada no motor.

**O que NÃO se faz, e é o limite firme:**

- **NÃO criar progresso real por etapa.** As 5 etapas do protótipo (`EtapasAnalise`) implicam o
  ai-service reportar em qual etapa está, o que exige o endpoint de polling que o motor rejeitou.
  Mostrar as 5 etapas com um cronômetro fake (como o mock faz) é MENTIR sobre o progresso: a
  resposta síncrona chega quando chega, e a barra de 5 etapas prometeria uma granularidade que não
  existe. Ou a barra vira indeterminada (animação sem porcentagem real), ou as 5 etapas viram
  decoração sem `aria-valuenow` mentindo. Proposta: usar o `PalcoAnalise` (a órbita, sem barra de
  porcentagem) e, se o diretor quiser as 5 etapas listadas, elas aparecem como texto ilustrativo do
  QUE está sendo conferido, sem barra de progresso numérica e sem `aria-live` afirmando etapa atual.
- **NÃO criar o endpoint `/analise`.** Isso é backend, é o polling rejeitado, e está fora do escopo
  desta frente (só pele).

**Detalhe de tempo que o diretor decide:** a auditoria síncrona pode levar alguns segundos (Gemini).
A animação cobre esse tempo. Se em algum caso a resposta for quase instantânea, a animação precisa de
um piso de exibição (ex.: 800ms) para não "piscar". Isso é ajuste fino de UX, não de motor, e o
coordenador resolve na prova visual.

---

## 5. Tabelas de mapeamento (contrato)

O contrato é do COORDENADOR (§A.39). O arquiteto PROPÕE o mapeamento; NÃO edita `shared-types`. As
tabelas abaixo são a proposta de como o vocabulário do protótipo se traduz para o vocabulário do
motor. Onde há GAP, está sinalizado.

### 5.1. Tabela de rotas: página do protótipo, o que a alimenta no motor

| Página/rota do protótipo | Vira, na página única | Alimentado por (motor real) |
|---|---|---|
| `(publico)/page.tsx` (acesso CPF + nascimento) | Bloco de identificação (`!sessao`) | `POST /portal/identificar` -> `SessaoDoCandidato`. CPF e data só no corpo, saem do estado ao emitir sessão |
| `RodapeAcesso` "Não consigo entrar" | Válvula de recuperação, já existe | `POST /portal/recuperacao` (nunca confirma se o link existe, veto oráculo) |
| `(autenticado)/boas-vindas` | Tela `BOAS_VINDAS` | `trilha.termoAceito` (pula se já aceito) + `POST /portal/termo` no "Começar" |
| `boas-vindas/TermoPrivacidade` | Modal do termo | `POST /portal/termo` grava o aceite pela admissão da SESSÃO (LGPD) |
| `(autenticado)/o-que-separar` | Tela `REUNIR` (lista de documentos da régua) | `trilha.passos[]` (nome + exigência). Lista vazia é estado real |
| `(autenticado)/como-funciona` | Tela `COMO_FUNCIONA` | Estático (3 passos), textos do protótipo aprovados |
| `documentos/[docId]` (envio) | Bloco `CasaAtual`, fase `parado`/`podeEnviar` | Fluxo de 3 passos: `POST /portal/credencial` -> `PUT` direto no armazenamento -> `POST /portal/confirmar` |
| `documentos/[docId]/analisando` | Fase `envio = analisando` (animação cosmética) | Nenhum endpoint novo: é o tempo do `POST /portal/confirmar` em voo (Decisão 3) |
| `documentos/[docId]/conferir` | Fase `envio = conferir` | `RespostaConfirmacao.sugestao` (`SugestaoExtraida`), gravação por `POST /portal/dados-gi` |
| `documentos/[docId]/ajuste` | Fase `envio = ajustar` | `veredito` reprovado + `tentativas`, mensagem PRONTA do servidor (nunca reescrita) |
| `concluido` | Bloco `Conclusao` (placar) | `resumoFinal(passos, visita)` puro, mais o passo FINAL antes (campos sem documento) |
| (não existe no protótipo) | Bloco de VT (casa vira botão) | `GET /portal/vt-link` -> abre form externo. Baixa pela varredura da coleta |
| (não existe no protótipo) | Telas de erro de acesso | `semFragmento`, `erroFatal` (LINK_MORTO), `bloqueado` (rate-limit) |
| `api.ts consultarAnalise` (polling) | DESCARTADO | Não há rota; a auditoria é síncrona |
| `api.ts enviarArquivo` (multipart) | DESCARTADO | O real é credencial + PUT direto + confirmar, não multipart ao backend |

### 5.2. Tabela de estados: `StatusDocumento` do protótipo vs estado do motor

O motor tem DOIS níveis: `EstadoPassoPortal` (6 valores, do servidor, em `shared-types`) e
`EstadoDaCasa` (8 valores, da tela, em `lib/portal-trilha.ts`, = os 6 + `ATUAL` + `PULADO`). O
protótipo tem `StatusDocumento` (6 valores). Mapeamento:

| `StatusDocumento` (protótipo) | Estado do motor | Rótulo/pintura do motor (já validado) |
|---|---|---|
| `confirmado` / `entregue` | `ACEITO` (`EstadoPassoPortal`) | Verde, "Enviado", check |
| `agora` | `ATUAL` (`EstadoDaCasa`, é posição, não do servidor) | Azul, "Agora" |
| `ajuste` | `AJUSTAR` | Âmbar, "Precisa De Ajuste" |
| `a-enviar` | `PENDENTE` | Cinza, "A Enviar" |
| `pulado` | `PULADO` (`EstadoDaCasa`, memória de visita, não persiste) | Âmbar, "Pulado" |
| (sem equivalente) | `EM_ANALISE` | Azul claro, "Em Análise" (envio em aberto, IA ainda não devolveu) |
| (sem equivalente) | `AGUARDANDO_VALIDACAO` | VERMELHO, "Aguardando Sua Validação" (IA leu, falta o candidato confirmar) |
| (sem equivalente) | `NO_TIME` | Roxo, "Com O Consultor" (teto de 3 batido) |

**GAP a favor do motor:** o protótipo tem 6 status; o motor tem 8 estados de casa. Os três que o
protótipo não previu (`EM_ANALISE`, `AGUARDANDO_VALIDACAO`, `NO_TIME`) são exatamente os que a
auditoria prévia do motor apontou como necessários para a casa não prometer envio onde a rota recusa
(nota longa em `ESTADOS_PASSO_PORTAL`). A pele nova PRECISA de cor e rótulo para os 8, não para os 6.
O motor já tem o dicionário `PINTURA` com os 8. A pele do Designer cobre 5; os outros 3 herdam a
paleta Soulan pelo mesmo critério (verde=ok, âmbar=atenção, vermelho=ação do candidato, roxo=time).

### 5.3. Tabela de campos: `EstadoCampo` do protótipo vs `CampoExtraidoPortal` do motor

| `EstadoCampo` (protótipo) | Sinal no motor (`CampoExtraidoPortal`) | Tratamento na tela (hoje, `CamposGi.tsx`) |
|---|---|---|
| `lido` (leu com segurança) | `lido: true`, `confianca` acima do piso | Preenchido, realce cinza-confirmável, ajuda "Confira se está exatamente como no documento" |
| `nao-lido` (não conseguiu ler) | `lido: false`, `valor` vazio | Vazio, borda âmbar (atenção), ajuda "Não consegui ler. Digite você mesmo" |
| `aguardando` (ainda não enviado) | (não existe campo antes do envio) | No motor, campos só chegam DEPOIS do envio; o estado "aguardando" do protótipo (grade cinza na tela de envio) é decorativo e some |
| `confira` (leu, MAS baixa confiança) | **GAP: não existe hoje** | Ver abaixo |

**O GAP do `confira`, e é a única divergência de dado real, não só de nome.** O protótipo tem um
TERCEIRO estado de campo lido: `confira`, para "leu, mas com baixa confiança, peça conferência com
destaque coral". O motor tem `confianca` (número) e `lido` (booleano), e o comentário do contrato diz
que `confianca` "só decide o realce, nunca bloqueia a edição". Hoje o `CamposGi.tsx` NÃO usa o número:
só distingue `lido` true/false (`atencao = !c.lido`). Então "confira" hoje não existe como tier
visual.

Três caminhos, o diretor escolhe (item da lista final):

- **(a) Ignorar o `confira`.** Todo campo lido é tratado igual (cinza-confirmável), e não lido é
  âmbar. É o comportamento atual do motor, zero mudança de contrato. Mais simples, mas perde o realce
  coral do protótipo para campos duvidosos.
- **(b) Derivar `confira` de um limiar de `confianca` NA TELA.** A tela lê `confianca` (que já vem no
  contrato) e, abaixo de um limiar (ex.: 0,85), pinta o campo em coral com "Confira" mesmo com
  `lido: true`. NÃO muda contrato nem backend, só usa um campo que já chega e hoje é ignorado. O
  limiar é decisão de produto. Risco: o limiar na tela é uma segunda verdade sobre "o que é
  confiável"; o motor diz que confiança não bloqueia, e um limiar de tela não bloqueia (o campo segue
  editável), então é aceitável, mas o número do limiar precisa de dono.
- **(c) O backend passa a marcar `confira` explicitamente.** Mudança de contrato e de motor, fora do
  escopo desta frente (pele). Só se o diretor quiser o realce coral como comportamento de motor.

Proposta do arquiteto: **(b)**, porque usa dado que já existe, não toca o motor, e entrega o realce
coral do Designer. O `seguranca` deve confirmar que exibir "baixa confiança" não vaza nada sobre o
documento (não vaza: é sinal de leitura, não PII).

---

## 6. O que o motor tem e o protótipo não previu: onde cada um encaixa no visual novo

| Recurso do motor (validado) | Onde vive hoje | Onde encaixa no visual novo |
|---|---|---|
| **Teto de 3 tentativas + Master destrava (NO_TIME "Com O Consultor")** | `podeEnviar`, `PINTURA.NO_TIME`, `tentativas.noTime`, `BotaoFalarComRh` | Casa roxa no tabuleiro; no lugar do bloco de envio, um `Nota`/`Card` roxo com a mensagem do servidor e o botão de WhatsApp. O protótipo tem a Tag "Tentativa X de 3" e uma `Nota` sobre a 3a tentativa, mas NÃO tem o estado terminal. A pele nova precisa desse bloco |
| **Ponte do VT (casa é botão, não upload)** | `ehCasaDoVt`, `abrirFormularioVt`, `GET /portal/vt-link` | Na casa do VT, o bloco de envio (arrastar/câmera/arquivo) some e vira UM botão "Abrir o formulário de vale-transporte". Instrução própria ("preenche em outra página, volta sozinho"). O protótipo trata `vt` como upload normal (mock), o que está errado para o motor. O `seguranca` já auditou que o link do VT nasce e morre na função, nunca em estado |
| **Reabertura de documento aceito / substituir** | Estados do backend, `portal-reabertura-documento`, `portal-arquivo-unico-substituicao` | Casa `ACEITO` mostra "já enviado e aceito", e a navegação por clique no tabuleiro (visita) permite reabrir para ver. A pele nova precisa do recado verde de aceito e do caminho de visita (o protótipo não tem clique-na-casa) |
| **Telas de erro de acesso** | `semFragmento` ("Abra O Link De Novo"), `erroFatal` ("Link Inválido"), `bloqueado` (rate-limit, mensagem do servidor) | Três telas de casca centralizada, com ícone e texto. O protótipo só tem o formulário de acesso feliz. A pele nova precisa vestir as três (Montserrat + tokens), mantendo a distinção entre "sem fragmento" (instrução) e "link morto" (erro) |
| **Dedup + "Você Já Confirmou"** | `separarCampos`, `camposVistos`, `dadosGiConfirmados` | Na conferência por documento, o bloco verde "Você Já Confirmou" (nome, nascimento confirmados antes). O protótipo `FormConferencia` re-pergunta tudo. A pele nova reusa o `CampoLido` visual mas mantém a lógica de dedup do `ConferenciaDocumento` |
| **Passo FINAL (campos sem documento)** | `PassoFinal`, `CAMPOS_SEM_DOCUMENTO` (raça, grau, estado civil, nacionalidade, naturalidade) | Uma tela antes da conclusão, com os campos que não saem de documento (seletores do design claro, §A.35). O protótipo não tem esse passo. A pele nova precisa vesti-lo com o `SelectPortal` já existente |
| **Régua por (cliente+cargo), incl. reservista** | `trilha.passos` vem de `documentos_admissao`, não da régua crua | A lista de documentos é 100 por cento do servidor. O protótipo hardcoda 10 documentos no mock (incluindo reservista e VT). Na religação, a lista some do código e vem de `GET /portal/documentos`. Reservista aparece se e só se a régua daquela admissão o exigir |
| **Data BR display-only + canonização ISO no submit** | `portal-data-br.ts`, `dataParaExibicao`/`dataParaCanonico` | Ver seção 5.5 abaixo |
| **AGUARDANDO_VALIDACAO (vermelho)** | `PINTURA.AGUARDANDO_VALIDACAO` | Ver seção 5.5 abaixo |
| **Expurgo/TTL 48h da conferência** | Backend (`portal_conferencia`, veto V12 revertido com TTL) | Invisível na tela. Só entra como nota: a pele nova não deve assumir que a sugestão persiste para sempre. Se o candidato volta depois de 48h, `conferencia` pode vir nula, e a tela cai no aceito sem campos. Já tratado no motor |

### 6.1 (era 5.5). Os 2 ajustes de motor JÁ VALIDADOS, no vocabulário visual novo

**(a) Data em dd/mm/aaaa DISPLAY-ONLY com canonização ISO no submit.** Hoje, em `CamposGi.tsx` +
`lib/portal-data-br.ts`: o campo de data EXIBE em BR (`dataParaExibicao`, ISO vira DD/MM/AAAA), e no
submit reenvia o ORIGINAL cru (byte a byte) se não foi editado, ou o CANÔNICO ISO (`dataParaCanonico`)
se foi editado. O G.I nunca vê BR. No visual novo, isso mapeia para o `CampoLido`/`FormConferencia` do
protótipo assim: o `CampoLido` do Designer é um `<input type="text">` controlado; a máscara e a
canonização são a MESMA lógica de `ConferenciaDocumento` (que já faz o round-trip). O que muda é só a
CASCA do input (borda, cor, ícone "Lido"/"Confira"). A regra de "não editado reenvia o original, ISO
no submit" fica intacta, porque é lógica do motor, não da pele. O `arquiteto` sinaliza: NÃO deixar o
protótipo reintroduzir `defaultValue`/`value=campo.valor` cru (como o `CampoLido` do protótipo faz),
porque isso perderia o round-trip BR/ISO.

**(b) Estado `AGUARDANDO_VALIDACAO` (vermelho, "Aguardando Sua Validação").** É a casa em que a IA já
leu, os campos estão prontos, o veredito não reprovou, MAS o candidato ainda não confirmou. Cor
vermelha de propósito ("o que falta é ele"). Mapeia para o vocabulário do protótipo como um status de
documento NOVO no tabuleiro/trilha lateral: o protótipo tem `confirmado/agora/ajuste/a-enviar/pulado`,
e este é um sexto que o protótipo não previu. Na pele nova, ele usa o coral/vermelho da paleta Soulan
(`soulan-coral` ou `portal-at-*`), com o rótulo "Aguardando Sua Validação" (§A.24 Title Case). É o par
visual do `envio.fase === "conferir"`: quando a casa está aguardando validação, a tela mostra a
conferência.

---

## 7. Tailwind, fontes, ícones: merge e colisões

**Preset Tailwind.** O protótipo traz `tailwind/soulan-preset.ts` com namespaces `soulan.*` e
`portal.*`, mais `borderRadius` (card/card-sm/btn), `boxShadow` (card/btn/chip/doc/bottom-bar),
`keyframes` e `animation` da animação da auditoria. A config da fábrica
(`apps/frontend/tailwind.config.ts`) usa cores por CSS var (`bg`, `surface`, `border`, `text`,
`accent`, `ok`, `warn`, `danger`), fontes `sans` (Inter) e `display` (Manrope), `darkMode` por
seletor, e keyframes `orb-pulse`/`float`/`fade-in-up`.

**Análise de colisão (feita, arquivo por arquivo):**

- **Cores:** SEM colisão. Namespaces disjuntos (`soulan-*`/`portal-*` vs `bg`/`surface`/`border`/...).
  Adicionar via `presets: [soulan]` é aditivo em `theme.extend`.
- **Fontes:** SEM colisão de chave (`montserrat` novo vs `sans`/`display` existentes). Mas ATENÇÃO: o
  `/portal` atual usa `font-display` (que é Manrope). Ao adotar o protótipo, o portal passa a
  `font-montserrat`. Precisa carregar a variável `--font-montserrat` via um `app/portal/layout.tsx`
  novo (localFont, como o protótipo faz). O layout raiz da fábrica carrega Inter+Manrope; o portal
  ganha um layout próprio que ADICIONA Montserrat só na subárvore `/portal`.
- **`borderRadius`:** a fábrica só estende `glass`; o preset adiciona `card`/`card-sm`/`btn`. SEM
  colisão.
- **`boxShadow`:** a fábrica não estende (usa default); o preset adiciona os seus. SEM colisão.
- **`keyframes`/`animation`:** a fábrica tem `orb-pulse`/`float`/`fade-in-up`; o preset tem
  `orbit`/`scan`/`wander`/`ring`/`pop`/`shimmer`/`bob`/`rise`/`fade-in`. Nomes DISJUNTOS (atenção a
  `fade-in` do preset vs `fade-in-up` da fábrica: são nomes diferentes, sem colisão). SEM colisão.
- **`darkMode`:** o portal é TEMA CLARO FIXO (o motor já força `colorScheme: light` e cores
  literais). O preset não define `darkMode` e não usa `dark:`. SEM risco de o portal escurecer. A
  regra crítica que a pele nova PRECISA manter: nada de `var(--...)` do design system dentro do
  `/portal` (elas invertem por tema). Os tokens `portal-*` do preset são hex literais claros, então
  são seguros; o motor já opera assim.

**Decisão proposta:** adicionar o preset via `presets: [soulanPreset]` na config existente, sem
tocar nas cores/fontes atuais da fábrica. O `content` já cobre `./src/**`. Baixo risco, aditivo.

**`lucide-react` é dependência NOVA (confirmado: não está no `package.json`).** O protótipo usa
lucide pesadamente (`Analise`, `Documento`, `ui`, `Fluxo`, `PortalHeader`). O motor NÃO usa lucide:
tem ícones próprios em `IconesPortal.tsx` (SVG à mão). Duas opções (item da lista final):

- **(a) Instalar `lucide-react`** (`pnpm --filter frontend add lucide-react`). Traz os ícones do
  protótipo sem reescrever. Custo: uma dependência nova no bundle (lucide é tree-shakeable, o custo
  real é pequeno se importado por ícone). O `devops`/`seguranca` confirmam a origem do pacote.
- **(b) Portar os ícones usados para `IconesPortal.tsx`** (SVG à mão, como o motor já faz). Zero
  dependência nova. Custo: trabalho de portar N ícones e manter o traço igual ao do Designer.

Proposta do arquiteto: **(a)** para a fase 1 (velocidade e fidelidade visual), com a ressalva de que
a animação `Analise.tsx` usa vários ícones lucide e reescrevê-los à mão seria caro. Se o diretor
preferir zero dependência nova, cai em (b) e a fase 1 fica mais longa.

**Fontes Montserrat locais.** O protótipo traz os `.woff2` (400/500/600/700, licença OFL) e carrega
via `next/font/local`. Copiar para `apps/frontend/src/app/portal/fonts/` e criar
`app/portal/layout.tsx`. Build on-premise não depende de internet (é o motivo do local). Baixo risco.

**O componente `Sol` tem DUAS APIs.** O motor tem `Sol` com `pose` (acena/explica/aponta/caminha/
comemora) e `tamanho`. O protótipo tem `SolAvatar` + `SolMensagem`. São o mesmo personagem com
contratos diferentes. A pele nova precisa reconciliar: manter o `Sol` do motor (que a máquina de
estado já usa) e adotar o `SolMensagem` do protótipo como um WRAPPER visual (balão de fala) em volta
do `Sol` existente. NÃO trocar o `Sol` do motor pelo do protótipo sem conferir todas as poses usadas
na página única.

---

## 8. Riscos (consolidado)

1. **Colisão da rota `/portal`: é código VALIDADO (§A.26).** A `app/portal/page.tsx` atual tem 2325
   linhas de comportamento auditado (sessão, retomada, 401, volta da aba, VT, teto, erros). Repaginar
   é reescrever a CAMADA DE APRESENTAÇÃO dessa página sem tocar a máquina de estado. CADA
   comportamento validado (identificação, termo, envio 3-passos, conferência, dedup, pular, voltar,
   VT, NO_TIME, erros de acesso, retomada) precisa ser REVERIFICADO na pele nova (prova visual +
   suíte). Antes de mexer, §A.26 manda perguntar, porque o alcance encosta em código aprovado. A
   suíte do portal (dezenas de specs em `portal-*.spec.ts`, front e back) é a rede: qualquer religação
   que quebre a lógica quebra teste antes de produção. Os specs de front que tocam a página
   (`portal-trilha.*`, `CamposGi.data-br.*`, `portal-data-br.*`) precisam continuar verdes.
2. **Merge do Tailwind.** Coberto na seção 7. Risco baixo e aditivo, mas a fonte Montserrat exige o
   layout novo do portal, e é fácil esquecer a variável `--font-montserrat` (a tela renderiza com
   fallback e "parece" certa em dev, §A.13 pega na prova visual).
3. **`lucide-react` dependência nova.** Seção 7. Precisa de `pnpm add` e aval de origem.
4. **Montserrat local.** Arquivos `.woff2` no repo, layout próprio. Risco baixo.
5. **Nome completo é PII (veto V5).** O cabeçalho do protótipo mostra nome completo, iniciais e vaga.
   O motor só tem primeiro nome. Adotar sem reduzir REINTRODUZ PII. É o achado que o `seguranca`
   precisa confirmar (seção 3).
6. **O gerenciador do RH e o backend NÃO PODEM SER TOCADOS.** `/admin/portal-links`, `portal-painel`,
   `portal-envio-link`, `EnvioDoLink` são a outra ponta (RH), e todo o backend (`portal-*.service`,
   controllers, `ai-service`) é intocado. Esta frente é SÓ a pele do candidato. Fronteira firme:
   nada de `as/` nem ingestão.
7. **`next dev` clobbera o build de produção.** Nota de memória do projeto: nunca rodar `next
   dev`/`next build` em `apps/frontend` com o serviço de produção no ar (clobbera o `.next`). A
   validação visual é na 3120 (§A.32), com build servido, nunca `next dev` sobre a produção.
8. **O modelo de sessão PII-free NÃO pode virar cookie por conveniência das rotas.** Se a fase 1
   introduzir rotas "só para ver as telas", cria-se a tentação de cookie na fase 2. A Decisão 1
   (página única) evita isso na raiz.

---

## 9. Tamanho, em FASES (o diretor aprova por partes)

Cada fase tem gate verde (typecheck, lint, testes, §A.21) e prova visual na 3120 (§A.13/§A.32) antes
de seguir. A ordem é de MENOR risco (pele sobre dado de leitura) para MAIOR risco (religação de
escrita e encaixes sensíveis).

**Fase 0 (preparação de casca, sem tocar a página atual).** Trazer o preset Tailwind, as fontes
Montserrat, o layout `app/portal/layout.tsx`, decidir `lucide-react` (instalar ou portar), e portar
os componentes visuais do protótipo (`ui.tsx`, `Documento.tsx CampoLido`, `Analise.tsx`,
`PortalHeader`, `SolMensagem`) para `components/portal/`, ADAPTADOS ao tema claro fixo e sem lógica de
negócio. Nada da página `page.tsx` muda ainda. Gate: build verde, e uma página de amostra (fora da
rota real, ou storybook manual) mostrando os componentes com dado fixo. Prova visual: os componentes
renderizam com Montserrat e paleta Soulan.

**Fase 1 (repaginar as telas de LEITURA, com dados reais já disponíveis).** Trocar a casca das telas
`BOAS_VINDAS`, `REUNIR`, `COMO_FUNCIONA`, do TABULEIRO e da CONCLUSÃO pela pele do protótipo, lendo os
dados que a `GET /portal/documentos` JÁ traz. Sem mexer no envio nem na conferência (ainda a casca
antiga). Inclui as 8 cores de estado da casa (não só as 5 do protótipo). Gate: suíte de front verde,
`portal-trilha.*` intactos. Prova visual: as telas de leitura na 3120, mobile (390px) e desktop, sem
esmagamento (§A.20), com o tabuleiro e a Sol andando. AVAL DO `seguranca` sobre o cabeçalho reduzido a
primeiro nome (Decisão 2) ANTES de subir.

**Fase 2 (religar os envios e a conferência).** Repaginar `CasaAtual` (envio: arrastar/câmera/arquivo,
animação cosmética de auditoria), `ConferenciaDocumento` (com dedup e "Você Já Confirmou" mantidos) e
`PassoFinal`, ligados ao fluxo real de 3 passos (credencial, PUT, confirmar) e a `POST /portal/dados-gi`
e `POST /portal/termo`. Mantidos: data BR display-only + ISO no submit (6.1.a), round-trip do campo não
editado, `AGUARDANDO_VALIDACAO` vermelho (6.1.b), a decisão do `confira` (5.3, escolha do diretor).
Auditoria síncrona com a animação por cima (Decisão 3), NUNCA polling. Gate: suíte inteira verde
(`CamposGi.data-br.*`, `portal-data-br.*`, specs de back de conferência). AVAL DO `seguranca` de novo,
porque toca a gravação de dado pessoal (dados-gi) e a sessão. `tester` independente entra JUNTO com a
construção (§A.40), escrevendo o teste que deve falhar enquanto o front constrói. Prova visual: envio,
animação, conferência, passo final, na 3120.

**Fase 3 (encaixar o que o protótipo não previu).** Vestir com a pele nova: casa do VT (botão, não
upload), estado NO_TIME "Com O Consultor" + WhatsApp, as três telas de erro de acesso ("Abra O Link De
Novo", "Link Inválido", bloqueio), reabertura/visita de documento aceito. Gate: specs de VT
(`portal-vt-link`, `portal-so-uma-porta-do-vt`), teto (`portal-teto-*`), e de erro de acesso verdes.
AVAL DO `seguranca` sobre a ponte do VT (o link nasce e morre na função, §A.6) e sobre as telas de erro
(não virar oráculo de enumeração). Prova visual: cada encaixe na 3120.

**Nota de sequência:** as fases 1 a 3 tocam a MESMA página `page.tsx` (código validado, §A.26), então
convivem no mesmo ambiente único da 3120 (§A.32). O coordenador é o dono do arquivo `page.tsx` durante
a frente; front constrói a pele, `seguranca` e `tester` auditam por fase.

---

## 10. Lista NUMERADA do que o diretor decide

1. **Roteamento (Decisão 1):** confirmar MANTER PÁGINA ÚNICA e só repaginar (proposta do arquiteto),
   ou exigir rotas multi-página (que reabrem a Decisão 2 para cookie e o veto V5).
2. **Sessão (Decisão 2):** confirmar PRESERVAR o modelo PII-free (sem cookie, sem server component,
   sem middleware, cabeçalho reduzido a primeiro nome). Esta decisão vai ao `seguranca` para aval
   ANTES de construir a fase 1 (§A.38), independentemente da resposta do diretor.
3. **Síncrono vs polling (Decisão 3):** confirmar a animação `Analise.tsx` como COSMÉTICA sobre a
   chamada síncrona, SEM barra de progresso numérica por etapa e SEM endpoint `/analise`.
4. **O `confira` (5.3):** escolher (a) ignorar, (b) derivar de limiar de `confianca` na tela
   (proposta), ou (c) marcar no backend (fora do escopo desta frente).
5. **`lucide-react` (seção 7):** instalar a dependência nova (proposta), ou portar os ícones à mão
   para `IconesPortal.tsx` (zero dependência, fase 1 mais longa).
6. **Cabeçalho (seção 3/5):** confirmar mostrar SÓ o primeiro nome e cargo/cliente, sem nome completo,
   sem avatar de iniciais completas (ou aprovar iniciais derivadas do primeiro nome).
7. **Escopo das fases (seção 9):** aprovar a divisão em Fase 0 a 3 e a validação por partes na 3120,
   ou pedir outro recorte.

---

## Anexo. Arquivos lidos para montar este plano

Protótipo (em
`/tmp/claude-1001/-home-henrique-apps-ea-automatic/cc36c170-e51e-454e-a8c1-62479e333c89/scratchpad/proto/portal-candidato/`):
`README.md`, `src/lib/portal/{types,api,mock}.ts`, `src/components/portal/{ui,Analise,Documento,Fluxo,PortalHeader}.tsx`,
`tailwind/soulan-preset.ts`, `src/app/portal/{layout.tsx,(autenticado)/layout.tsx}`.

Motor (em `/home/henrique/apps/ea-automatic/`):
`apps/frontend/src/app/portal/page.tsx`, `apps/frontend/src/lib/portal-trilha.ts`,
`apps/frontend/src/components/portal/CamposGi.tsx`, `packages/shared-types/src/index.ts` (bloco do
Portal do Candidato e da Identidade), `apps/frontend/tailwind.config.ts`, `apps/frontend/src/app/layout.tsx`,
controllers do candidato (`portal.controller`, `portal-documentos.controller`, `portal-dados-gi.controller`,
`portal-termo.controller`, `portal-vt.controller`), `apps/frontend/next.config.mjs`.
