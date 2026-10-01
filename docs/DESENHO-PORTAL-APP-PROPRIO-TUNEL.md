# Desenho: Portal do Candidato online por app próprio + túnel de saída

Caminho 3+4 aprovado pelo diretor. Este é o DESENHO para construir; nada foi construído. Medições de
30/09/2026, cada afirmação com arquivo:linha. §A.11 (sem travessão), §A.14 (só o que a OST pede),
§A.38 (segurança audita antes do deploy).

## 0. O resumo, em cinco linhas

1. O Portal vira um **app Next próprio**, só com as telas do candidato, servido numa porta própria da
   VM. Isso conserta **por construção** o vazamento do `/_next/static/*`: o build separado não contém
   nenhum chunk do EA, então não há o que vazar.
2. Um **túnel de saída (`cloudflared`)** roda dentro da VM, abre conexão **de dentro para fora** para
   a borda da Cloudflare, e recebe um endereço HTTPS público. Sem porta de entrada, sem NAT, sem DNS
   no Registro.br, sem o Fernando.
3. O túnel aponta **só** para uma barreira fail-closed do Portal (um Caddy dedicado), que serve a tela
   do candidato e **só** encaminha as 12 rotas `/api/portal/*`. O resto do EA (Gerenciador, Esteira,
   admin, `/api/auth/*`, `portal/links`) responde 403 e nunca é alcançável pelo endereço público. Essa
   barreira é a condição que o `seguranca` colocou: o túnel não replica allowlist sozinho.
4. O **arquivo** do documento continua indo do navegador **direto para o GCS**, sem passar pela VM
   nem pela Cloudflare.
5. O endereço pode nascer com um nome da Cloudflare e, depois, **trocar para `portal.soulan.com.br`
   apontando para o mesmo túnel, sem refazer nada** (seção 7).

## 1. O app próprio: o que vai para ele

O Portal já é visualmente isolado hoje: tem `layout.tsx`, `portal.module.css` e fontes Montserrat
próprios (`apps/frontend/src/app/portal/`). O que o prende ao EA é o **root layout**, que envolve tudo
com o `AuthProvider` (`apps/frontend/src/app/layout.tsx:36`), e é por isso que o `/portal` dispara
`/api/auth/refresh` sem precisar.

**Telas que vão para o app próprio (as únicas do candidato):**
- `/portal` (a trilha inteira do candidato: identificação, credencial, envio, termo, VT).

**Rotas de API que o app próprio precisa alcançar (as 12 @Public do Portal):**
- `POST /api/portal/identificar`, `POST /api/portal/recuperacao`, `POST /api/portal/credencial`,
  `POST /api/portal/confirmar`, `POST /api/portal/termo`, `POST /api/portal/dados-gi`
  (`portal.controller.ts`, `portal-termo.controller.ts`, `portal-dados-gi.controller.ts`);
- `GET /api/portal/documentos`, `GET /api/portal/vt-link`
  (`portal-documentos.controller.ts`, `portal-vt.controller.ts`);
- `POST /api/portal/acesso-email/{solicitar,confirmar,identidade}`
  (`portal-acesso-email.controller.ts`).

**O que NÃO vai (fica no EA da operação, atrás do Caddy, nunca no túnel):** `portal/links`
(emite link de acesso ao prontuário, controller de admin), `esteira/pendencias-portal`,
`esteira/portal-painel`, `esteira/portal-pedidos-ajuda`, e todo o resto do EA.

### Como o app próprio conversa com o backend: same-origin, sem CORS, mas COM allowlist de rota

O cliente HTTP do Portal usa base **relativa** `"/api"` (`apps/frontend/src/lib/api.ts:1`,
`BASE = "/api"`). O navegador fala só com o app do Portal; o app fala com o backend pela rede interna
da máquina (loopback). **Não há origem cruzada, então não há CORS, nem cookie cross-site, nem mudança
no backend.**

**A correção que a auditoria do `seguranca` obrigou (não é opcional, é fail-closed):** o backend do EA
na `127.0.0.1:3011` é o backend INTEIRO. As 12 rotas `@Public` do candidato moram no mesmo NestJS que
rotas autenticadas de alto poder: `POST portal/links/:admissaoId` **emite link de acesso ao prontuário
de um candidato** (`apps/backend/src/portal/portal-links.controller.ts:80`), além de `/api/auth/*`
(login, superfície de brute force) e `esteira/portal-*`. Um rewrite cru `"/api/:path*"` para a 3011
**reabriria o VETO 1** da auditoria anterior: qualquer um baterìa `/api/auth/login` ou
`/api/portal/links` pelo endereço público. O `cloudflared` **não é um vhost** e não replica a allowlist
de caminho por padrão.

Então o alvo do túnel **não pode ser a 3011 nem a 3010 crus**. Entre o túnel e o backend fica uma
**barreira fail-closed de caminho**, que é a mesma allowlist já auditada da seção 5 do
`docs/MAPA-PORTAL-ACESSO-PUBLICO.md`, transposta do vhost do Fernando para um proxy na própria VM.
Duas formas de materializá-la, a escolher na Fase 1:
- **(a) um Caddy dedicado do Portal** (reusa o padrão do `ea-proxy` que já existe): serve a página e o
  static do app próprio e **só encaminha as 12 rotas `/api/portal/*`** para a 3011; **403 fail-closed**
  para `/api/auth/*` e todo o resto. É a transposição direta do que a §A.6 já aprovou.
- **(b) rewrites nominais no Next do app próprio**: em vez do curinga `"/api/:path*"`, uma linha por
  rota do candidato (as 12), sem curinga, então `/api/auth/*` e `portal/links` **não têm rewrite** e
  morrem no próprio app (404). Mais simples, ao custo de manter a lista das 12 no `next.config`.

A recomendação é **(a)**, porque a allowlist fail-closed já foi auditada nessa forma e não depende de
lembrar de atualizar uma lista a cada rota nova. O `cloudflared` aponta para esse Caddy do Portal, não
para o EA.

### A prova de que o app próprio conserta o vazamento por construção

O problema medido: a allowlist do vhost público liberava `/_next/static/*`, e com isso o **bundle de
cliente inteiro do EA** ia para a internet, incluindo o texto de artigos de menu restrito, que vive em
chunk compartilhado (`static/chunks/3708-*.js`, medido em 30/09). A `/portal` precisa de nove chunks,
e o `3708` não é um deles, mas a allowlist por caminho não distingue: baixa-se a URL do chunk direto,
sem carregar tela.

Com app próprio, **o build do Portal é gerado sozinho, a partir só da rota `/portal`**. O
`.next/static` desse build **não contém** os chunks do Gerenciador, da Esteira, do admin nem da Central
De Ajuda, porque esse código não é importado por nenhuma tela do candidato. Não há allowlist para
manter: liberar `/_next/static/*` do app do Portal é seguro **porque o único static que existe ali é o
do Portal**. É o mesmo motivo pelo qual o VT no Firebase é seguro. Prova a construir na Fase 1: gerar o
build do app próprio e conferir, com o `app-build-manifest.json`, que os chunks do EA (`3708` e os de
`(app)/*`) **não existem** no `.next/static` dele.

### Como o build separado é montado (sem tocar o front da operação)

Duas formas, a decidir na Fase 1 (não muda o desenho para o diretor):
- **(a) segundo build do mesmo repo**, com uma config que inclui só a rota `/portal` (o Next permite
  gerar um app enxuto). Reusa o código atual sem duplicar; o risco é o tree-shaking deixar entrar um
  import compartilhado, e é isso que a prova acima pega.
- **(b) app Next separado** (pasta própria, como o VT tem `apps/vt-online/`), que importa só os
  componentes do Portal. Isolamento total, ao custo de mover arquivos.

A recomendação é começar por (a), medir o manifest, e só cair para (b) se algum import do EA vazar.

## 2. O túnel de saída (cloudflared)

- **Onde roda:** um serviço `cloudflared` na VM, no mesmo padrão dos outros serviços do EA
  (`systemd --user`, `Restart=always`, como o `ea-frontend.service`). Ele abre **conexão de saída**
  (443 para fora) para a borda da Cloudflare. Não escuta porta de entrada nenhuma; nada precisa ser
  aberto no escritório.
- **Para onde aponta:** ingress único, `hostname → http://127.0.0.1:<porta-do-Caddy-do-Portal>`, ou
  seja, para a **barreira fail-closed** da seção 1, nunca para o EA cru. O Caddy da operação
  (`ea-proxy`, `0.0.0.0:3010`) e o backend (`127.0.0.1:3011`) **não** estão no ingress do túnel, e o
  Caddy do Portal só encaminha as 12 rotas do candidato.
- **TLS:** termina na borda da Cloudflare (certificado dela, automático). Entre a borda e a VM, o
  tráfego volta cifrado dentro do próprio túnel. **HTTPS público sem certbot e sem o Fernando.**
- **Como se mantém vivo:** `Restart=always` no systemd reergue o `cloudflared` se ele morrer; o
  próprio agente reconecta sozinho à borda quando a rede oscila (é o comportamento nativo dele, com
  múltiplas conexões para pontos de presença diferentes).
- **Se cair:** o endereço público fica fora do ar (o candidato vê erro de conexão), mas **nada do EA
  fica exposto por causa disso** e a operação interna (3010) não é afetada, porque ela não passa pelo
  túnel. Reergueu o serviço, o endereço volta. Nenhum dado se perde: envio em curso falha e o candidato
  repete, exatamente como já acontece hoje se a rede dele cair.

## 3. O que fica exposto: só o Portal, e a prova

São **duas** camadas de exposição, e cada uma tem a sua prova:
- **A tela e o static:** o app próprio não contém os chunks do EA (seção 1), então liberar
  `/_next/static/*` dele não vaza nada. A barreira aqui é **a ausência do código**, não uma lista.
- **A API:** o Caddy do Portal (ou os rewrites nominais) é fail-closed e só encaminha as 12 rotas
  `/api/portal/*`. A barreira aqui é **a allowlist da seção 5 do MAPA**, agora vivendo na VM, não no
  vhost do Fernando.

**Prova obrigatória antes de subir (Fase 2), contra o hostname público de verdade, do jeito que o
VETO 1 foi provado (`curl`):**
- respondem: `/portal`, `/_next/static/*` do app do Portal, e as 12 rotas `/api/portal/*`;
- respondem **403/inalcançável**: `/api/auth/*`, `/api/portal/links/*`, `esteira/portal-*`,
  `esteira/pendencias-portal/*`, `/gerenciador`, `/esteira`, `/admin` e todo o resto do EA.

Sem essa prova por `curl`, o desenho não sobe. É a condição que o `seguranca` colocou: o que muda em
relação ao VT não é a PII na borda, é o risco de `/api/auth/*` e `portal/links` ficarem expostos se o
túnel apontar para o EA cru.

## 4. O arquivo: continua fora do túnel

Confirmado, com arquivo:linha:
- o navegador pede uma credencial (`POST /portal/credencial`), recebe uma **URL assinada do GCS** e
  faz o `PUT` do arquivo **direto** nessa URL (`apps/frontend/src/app/portal/page.tsx:851-865`, "o
  arquivo NÃO passa pelo EA: vai do navegador direto para o armazenamento");
- a URL é credencial de uso único, dez minutos, sem leitura e sem listagem, e §A.6 não a persiste nem
  loga (`apps/backend/src/portal/portal-credencial.service.ts:520-532`).

Logo o binário do documento vai do celular do candidato **direto para `storage.googleapis.com`**, sem
tocar a VM nem a borda da Cloudflare. O túnel carrega só as chamadas JSON de controle.

## 5. O que a borda da Cloudflare vê em texto claro

O TLS termina na borda, então a Cloudflare vê o corpo das chamadas `/api/portal/*`. O inventário
honesto, para o parecer espelhado do VT:
- **CPF** do candidato (`POST /identificar`, e no corpo de recuperação/acesso por e-mail);
- **e-mail** do candidato (acesso por e-mail);
- **os campos do GI** confirmados pelo candidato (`POST /dados-gi`): os dados pessoais e de admissão
  que ele confere;
- **a trilha de documentos** (`GET /documentos`): quais tipos ele deve, status de cada um (não o
  arquivo);
- o **termo** aceito e o **link do VT**.

O que a borda **não** vê: o **conteúdo dos documentos** (vai direto para o GCS, seção 4) e o **token da
sessão** (viaja no fragmento e/ou corpo, nunca em query string, `docs/MAPA-PORTAL-ACESSO-PUBLICO.md`
seção 7).

Isto é a mesma classe do VT, que já trafega dado de candidato por serviço de terceiro (Google). O
parecer do diretor é **espelhar** o critério já dado ao VT (`docs/PARECER-SEGURANCA-TROCA-MODELO-VT.md`);
o `seguranca` só levanta se achar diferença material. Ver seção 9.

## 6. As fases (entrega por partes, o diretor valida cada uma)

1. **App próprio, na homologação (3120).** Gerar o build separado do Portal, servir numa porta própria,
   provar pelo `app-build-manifest.json` que nenhum chunk do EA entrou. Validação do diretor: a tela do
   Portal abre igual à de hoje. **Sem túnel ainda, sem exposição.**
2. **Túnel na homologação.** `cloudflared` apontando para o Caddy do Portal da homologação. O diretor
   abre o endereço público **no 4G**, fora da VPN, e prova que a rota funciona ponta a ponta sem o
   Fernando. **Prova por `curl` obrigatória** de que o EA não vaza (seção 3): as 12 rotas do candidato
   respondem, `/api/auth/*` e `portal/links` respondem 403. **Não é candidato real: é a homologação.**
3. **App próprio em produção.** Publicar o build do Portal em produção (as tabelas e segredos do Portal
   já estão em produção desde 29/09; falta o código, `docs`/memória `ea-portal-nao-esta-em-producao`).
   Ligar as variáveis que faltam (`PORTAL_LINK_BASE_URL` com o endereço do túnel, o host em
   `ALLOWED_ORIGINS`, GCS/emissor/leitor/correio).
4. **Túnel em produção.** Trocar o alvo do túnel para o app do Portal de produção. Link real para
   candidato. Auditoria do `seguranca` (§A.38) antes desta fase.

Cada fase é validada pelo diretor antes da seguinte (§A.13). A publicação em produção respeita o
checkout compartilhado com outras sessões: **só o diretor coordena o restart** (§A.14).

## 7. Trocar o endereço depois, para portal.soulan.com.br, sem refazer nada: CONFIRMADO

Sim. No modelo de túnel, o **endereço público é configuração da borda da Cloudflare**, separada do que
roda na VM. O `cloudflared` na VM define só o ingress "hostname X → `127.0.0.1:porta`". Trocar o nome
público é:
- ou apontar o novo hostname para o **mesmo túnel** (uma linha no painel/DNS da Cloudflare), e o
  serviço na VM não muda;
- do lado do EA, trocar `PORTAL_LINK_BASE_URL` para o novo endereço (para o link novo já sair certo).

Nenhum rebuild do app, nenhuma mudança no `cloudflared` da VM, nenhum toque no arquivo do candidato.
Se um dia o Fernando entregar o DNS de `portal.soulan.com.br`, o caminho para casá-lo com o mesmo túnel
existe e é curto. Ressalva honesta: um nome próprio como `portal.soulan.com.br` na Cloudflare pede que
a **zona DNS desse nome** esteja na Cloudflare (o Fernando delegaria o subdomínio, um registro NS no
Registro.br), OU um domínio que o diretor coloque na Cloudflare. O que **não** muda em nenhum caso é o
que roda na VM.

## 8. O que depende de quem

| item | quem |
|---|---|
| conta na Cloudflare (Zero Trust / Tunnels) | **Rike** (ele provisiona; é grátis no nível necessário) |
| um domínio na Cloudflare, SE quiser nome estável/bonito já agora | **Rike** (domínio novo barato, ou nome `*.cfargotunnel`/subdomínio da Cloudflare para começar) |
| o token/credencial do túnel (do painel da Cloudflare) | **Rike** entrega; **fábrica** instala na VM (guardado 600, fora do repo, §A.6) |
| instalar e configurar o `cloudflared` na VM (serviço systemd, ingress só do Portal) | **fábrica** |
| gerar o build do app próprio e provar o não vazamento | **fábrica** |
| publicar o Portal em produção + variáveis que faltam | **fábrica**, restart coordenado pelo **Rike** |
| DNS/TLS/vhost no escritório | **NINGUÉM. O Fernando sai do caminho** |

O Rike é admin do Google Cloud, não do Workspace nem da rede. Nada aqui pede Workspace nem rede do
escritório: a conta Cloudflare é dele, pessoal ao projeto, e o resto roda na VM, que a fábrica opera.

## 9. Parecer de LGPD (espelhado do VT)

Por decisão do diretor, o critério é o mesmo já aprovado para o VT
(`docs/PARECER-SEGURANCA-TROCA-MODELO-VT.md`): candidato trafegando dado por serviço de terceiro é
aceito, com o arquivo protegido e o mínimo necessário na borda. O `seguranca` foi acionado para dizer
apenas se há **diferença material** entre o VT (TLS no Google) e o Portal (TLS na Cloudflare).

**Veredito do `seguranca` (30/09/2026): ESPELHADO / APROVADO no modelo de dados, com UMA diferença
material que é de configuração do túnel, não veto do modelo.**

- **Classe de risco: a mesma do VT, espelhada.** O VT já trafega PII de candidato em texto claro pela
  borda do Google e grava nome+CPF no nome do objeto
  (`PARECER-SEGURANCA-TROCA-MODELO-VT.md:9-14`); o argumento "Portal é pior por ser CPF+GI ao vivo vs.
  um PDF" não se sustenta, é a mesma natureza de dado na mesma condição. O Portal é até **menos**
  exposto: o binário não passa pela Cloudflare (seção 4).
- **CPF + campos do GI em texto claro na borda: aceitável sob o critério do VT.** O CPF viaja no
  **corpo** do POST (`portal.controller.ts:68`), não em query, então não cai no log de acesso da
  borda; o token no fragmento nunca chega a servidor. Espelhado. Ressalva: não ligar captura de corpo
  (WAF/payload log) na borda da Cloudflare.
- **A diferença material está na seção 1 e 3 deste desenho, e já foi incorporada:** o túnel senta na
  frente de um serviço, não replica a allowlist de caminho por padrão, e as rotas do candidato moram
  no mesmo backend que `/api/auth/*` e `portal/links`. **Condição de go-live:** o alvo do túnel é a
  barreira fail-closed (seção 1), provada por `curl` (seção 3), antes de subir. Sem isso, o que muda em
  relação ao VT não é a PII na borda, é `/api/auth/*` e `portal/links` expostos.
- **Nota de fornecedor, para o diretor, não reabre o modelo:** a única diferença de fundo é o
  terceiro. O VT roda sobre Google, já âncora da stack (Vertex, Drive, GCS); a Cloudflare é operador
  novo que passa a ver a conversa JSON em texto claro. Sob a lógica do próprio parecer do VT, a classe
  é a mesma e o `seguranca` espelha. A escolha Cloudflare vs. Google é decisão de fornecedor do
  diretor, fora do que a §A.6 enumera. Não é veto.

A auditoria do `seguranca` de §A.38 na Fase 4 (antes do go-live em produção) confere a prova por `curl`
como condição de subida.

## 10. Fechar a exposição de dado na borda (o diretor quer MELHOR que o VT)

O diretor rejeitou o único ponto fraco do plano B: não aceita a Cloudflare (nem terceiro novo) vendo
CPF e os campos do GI em texto claro. O parecer antes espelhava o VT (terceiro vê, aceito); agora o
critério subiu: nenhum terceiro NOVO lê o claro. Levantamento do `seguranca` (01/10/2026, §A.38),
reconferido pelo coordenador.

### O que a borda veria HOJE, sem conserto (campo a campo, medido)

Só o JSON de `/api/portal/*`, porque o arquivo não passa por ali (seção 4):
- identificação/recuperação/acesso-email: CPF, nascimento, nome, e-mail, telefone
  (`portal.dto.ts:100-114`, `portal-acesso-email.dto.ts`);
- `POST /dados-gi`: o registro pessoal INTEIRO, 37 campos (`portal-dados-gi.ts:108-148`): CPF, RG, CTPS,
  PIS, título, CNH, **banco/agência/conta**, nome da mãe e do pai, raça, estado civil, naturalidade,
  endereço completo.
- NÃO vê: o conteúdo dos documentos (vai direto pro GCS) nem o token de sessão (fragmento/corpo).

### As opções, com o veredito do `seguranca`

| # | opção | fecha o dado pro terceiro? | por quê |
|---|---|---|---|
| 1 | E2EE na aplicação (navegador cifra, só a VM decifra) | **NÃO (teatro)** | o JS que cifra é servido PELA MESMA borda; borda maliciosa troca o bundle e furta antes de cifrar. SRI não salva (a borda serve o HTML que declara os hashes). Fecha só contra borda passiva, não contra a ameaça declarada |
| 2 | Cloudflare Tunnel com TLS passthrough | **NÃO no padrão** | o ingress HTTP do cloudflared termina TLS na borda por desenho; passthrough real só via Spectrum (L4, Enterprise/pago), inviável pro Rike sozinho |
| 3 | **Tailscale Funnel** | **SIM, por construção** | o relay (DERP) encaminha o TLS por SNI em L4; quem termina é a própria VM, com cert Let's Encrypt do `*.ts.net`. A Tailscale não tem a chave privada, vê só ciphertext. Limites: portas 443/8443/10000, hostname `*.ts.net` (não domínio próprio) |
| 4 | ngrok endpoint TLS (BYO cert) | **parcial, só pago** | o modo `tls` não decifra, mas domínio reservado + endpoint estável são pagos; o grátis termina no ngrok (não fecha). Inferior à 3 |
| 5 | **Frente pública própria (VM no GCP + túnel WireGuard/Tailscale)** | **SIM** | o TLS termina num proxy fail-closed em máquina NOSSA, dentro do perímetro Google que a stack já usa (Vertex, Drive, e o GCS onde o binário do documento JÁ mora, `portal-credencial.service.ts:526-535`). Não adiciona terceiro novo |

### Por que a 3 e a 5 são "melhor que o VT", e não só igual

No VT, uma **Cloud Function gerenciada do Firebase executa código do Google que LÊ nome+CPF em texto
claro** (`PARECER-SEGURANCA-TROCA-MODELO-VT.md:9-14`). Na 3 e na 5, **só código nosso lê o claro**: o
Google (ou a Tailscale) hospeda/encaminha, mas não roda um serviço gerenciado que faz o parse do
payload. No eixo "de quem é o código que lê o claro", as duas são estritamente melhores que o VT.

### Recomendação: Opção 5 (primária), Opção 3 (alternativa leve)

**Opção 5** como desenho principal: VM pequena no GCP (o Rike é admin, projeto `ea-v2-automatic`)
terminando o TLS no nosso proxy fail-closed (a allowlist da seção 5 do MAPA, inteira), túnel
**WireGuard** (ou Tailscale) entre a VM do GCP e a VM do escritório, ambas nossas. Entrega **domínio
próprio** e **zero terceiro novo**. Condições obrigatórias:
- o túnel da ponta NÃO pode ser `cloudflared` em modo HTTP (reintroduz a borda vetada);
- a allowlist §A.6 vai inteira e fail-closed, com os consertos do VETO 1 (`MAPA` seções 5 e 7);
- o alvo é **produção** (`192.168.1.22:3010`), nunca a homologação (VETO 3, PII real);
- `ALLOWED_ORIGINS` recebe o host público, senão o OriginGuard devolve 403.

**Opção 3 (Tailscale Funnel)** é a alternativa legítima para subir rápido com o mínimo a construir,
tolerando o hostname `*.ts.net`. Fecha o dado por construção, sem VM extra. O trade-off é cosmético
(nome) e de portas, não de confidencialidade.

### A ressalva honesta (o DNS, e o limite do "sem terceiro")

"Zero terceiro em sentido absoluto" não existe sem o Fernando: tirar ele implica pôr o endpoint
público em infra de alguém. O melhor alcançável sem ele é **nenhum terceiro NOVO além da âncora que a
stack já confia (Google)**, e a 3 e a 5 entregam isso.

Um detalhe que decide o quão "sem Fernando" a 5 fica: para o cert e o domínio próprio, a 5 precisa de
um nome cuja **zona DNS o Rike controle**. A zona de `soulan.com.br` está no **Registro.br** (do
Fernando, `MAPA:86`), então `portal.soulan.com.br` ainda pediria um registro a ele. Para ficar
**100% sem o Fernando**, o Rike registra um domínio e põe a zona no **Google Cloud DNS** (ele é admin
do GCP, provisiona sozinho) ou usa a Cloudflare só como DNS. A Opção 3 não tem esse detalhe: o
`*.ts.net` já vem com cert, sem DNS nenhum a pedir.

## 11. Decisões do diretor (01/10/2026) e o nome real do Tailscale

- **Endereço escolhido: Opção (d) Tailscale Funnel.** O Fernando **saiu do caminho** por decisão do
  diretor: não é mais plano A nem B, não será acionado nesta frente.
- **`basePath` vem de variável de ambiente** (autorizado): trocar de endereço depois não exige refazer
  o build.
- **Opção (a) guardada:** se o nome `*.ts.net` incomodar, o diretor registra um domínio e troca para
  VM no GCP + domínio próprio, sem refazer o app (o endereço é config de borda).

### O nome REAL do Tailscale Funnel (o que o candidato veria)

O formato é **sempre** `<nome-da-maquina>.<nome-da-rede>.ts.net`: dois rótulos antes do `ts.net`.
- **`portalsoulan.ts.net` (um rótulo só) NÃO é possível.** O Tailscale não dá nome de rótulo único.
- **O nome da MÁQUINA é 100% nosso** (renomeia o nó no painel): ex. `portal`.
- **O nome da REDE (tailnet)** é renomeável UMA vez no painel para um nome **disponível**; sem renomear,
  a Tailscale gera um nome aleatório (algo como `tailXXXXXX.ts.net`).
- **O melhor nome limpo alcançável:** se `soulan` estiver livre como nome de rede, dá para chegar em
  **`portal.soulan.ts.net`**. É o mais perto de bonito sem domínio próprio. Não é `portalsoulan.ts.net`.
