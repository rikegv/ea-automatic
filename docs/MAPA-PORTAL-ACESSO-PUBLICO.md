# Mapa de alcance: acesso público do Portal do Candidato

Medido em 29/09/2026 a partir da VM do EA. Nada aqui é dedução: cada linha tem o comando que a
produziu. §A.6: o token do link viaja no fragmento (`#l=`) e nunca chega ao servidor.

## 1. O endereço que o diretor quer NÃO é servido pelo box novo

| medida | resultado |
|---|---|
| `dig soulan.com.br` | `187.102.148.222` (saída pública do escritório) |
| `curl -I https://soulan.com.br/` | `200`, `Server: Apache/2.4.58`, headers `X-WP-CF-Super-Cache` (WordPress institucional) |
| `curl -I https://soulan.com.br/clientesportal/` | **404** |
| `curl https://soulan.com.br/webpanda/webpanda.php` | `405` (webhook vivo do Pandapé) |
| box NOVO `192.168.1.234` | Apache **2.4.66**, porta 443 **fechada**, sem TLS |
| box ANTIGO `10.18.117.63` | Apache **2.4.58** (bate com o público), serve o webpanda |

**Conclusão:** `soulan.com.br` é atendido pelo box ANTIGO, que hospeda o site institucional
WordPress. O `/var/www/html/clientesportal/index.php` "Teste" está no box NOVO, que **não recebe
tráfego público nenhum**. Um vhost perfeito no box novo nunca seria alcançado por
`soulan.com.br/clientesportal`.

## 2. O box novo NÃO consegue receber o vhost de proxy sem o Fernando

Shell real obtido em `192.168.1.234` (`uid=1008(henrique) gid=33(www-data)`, hostname `portalcliente`):

- `sudo -n true` → **negado** (sem sudo).
- `/etc/apache2/sites-available` → **escrita negada**.
- Módulos habilitados: apenas básicos + `php8.5`. **`proxy`, `proxy_http`, `rewrite`, `ssl` e
  `headers` estão em `mods-available` e NÃO habilitados.**
- `apache2.conf`: `<Directory /var/www/> AllowOverride None`. **`.htaccess` é ignorado**, então a
  saída sem root (`RewriteRule [P]`) também está fechada.
- `certbot` **ausente**.
- Único vhost: `000-default.conf`, `*:80`, sem TLS.

**Conclusão:** aplicar o vhost de proxy reverso exige root. A fábrica não tem e não se autoconcede
(§A.0).

## 3. O SUBCAMINHO `/clientesportal` quebra o Portal, mesmo com proxy perfeito

`apps/frontend/next.config.mjs` **não tem `basePath`**. A página `/portal` da homologação emite
todos os assets em caminho **absoluto a partir da raiz**:

```
/_next/static/chunks/app/portal/page-*.js
/_next/static/css/*.css
/_next/image?url=%2Fportal%2Flogo-soulan-novo.webp
/favicon.ico  /icon.png  /apple-icon.png
```

Servido em `https://soulan.com.br/clientesportal`, o navegador pede
`https://soulan.com.br/_next/static/...`, que é a **raiz do WordPress** no box antigo: 404. O
candidato receberia a página sem CSS e sem JavaScript.

**Consequência de desenho:** o Portal precisa de **hostname próprio** (subdomínio), como o VT já
tem (`vt.soulanrh.com.br`). Pôr `basePath` no Next seria mudança de build que alcança o EA inteiro,
incluindo produção (§A.26/§A.27): descartada.

## 4. O que a rede já permite

- O box novo **alcança** `192.168.1.22:3120` (homologação) e `192.168.1.22:3010` (produção).
- PHP 8.5 no box com `curl` e `allow_url_fopen` habilitados.
- Escrita provada em `/var/www/html/clientesportal/`.

## 5. Régua de segurança que o vhost tem de cumprir (§A.6)

Fail-closed: nega tudo, libera só a allowlist do Portal.

Permitido: `/portal` e `/portal/*`; `/_next/static/*`; `/_next/image`; `/favicon.ico`, `/icon.png`,
`/apple-icon.png`; e as rotas de API do Portal: `identificar`, `recuperacao`, `credencial`,
`confirmar`, `termo`, `dados-gi`, `documentos`, `vt-link`.

Negado explicitamente, com 403: `/api/auth/*` e todo o resto do EA (Gerenciador, Esteira, admin).

O token vive no fragmento e **não chega ao servidor**: não entra em `access.log`. Qualquer regra
que mova o token para query string ou para `Location` é violação de §A.6.

## 6. Quem termina o TLS público, medido

| medida | resultado |
|---|---|
| `192.168.1.174:443` (box ANTIGO pela LAN) | **ABERTA** |
| `curl --resolve soulan.com.br:443:192.168.1.174` | **200** com o certificado correto |
| emissor do certificado | **Let's Encrypt**, `CN=soulan.com.br`, validade 01/08 a 30/10/2026 |
| SAN do certificado | só `DNS:soulan.com.br` (subdomínio novo precisa de certificado novo) |
| `webpanda.php` (produção viva, box antigo) | já chama `http://192.168.1.22:3010` pela LAN |
| NS de `soulan.com.br` | `a.sec.dns.br` / `c.sec.dns.br` (zona no **Registro.br**) |
| `portal.` / `clientes.` / `candidato.soulan.com.br` | **não existem** hoje |

**Conclusão que muda o pedido ao Fernando:** o box que recebe o tráfego público, termina o TLS e já
tem certbot funcionando é o **ANTIGO** (`192.168.1.174`), o mesmo que já alcança a VM do EA pela LAN
todo dia, em produção, pelo webhook do Pandapé. O vhost do Portal pertence a ele.

Como o NAT já entrega `187.102.148.222:443` nesse box, e o Apache separa os sites por **SNI**, um
subdomínio novo apontado para o mesmo IP público **não exige mudança de NAT, nem porta nova, nem
regra de firewall**. O pedido ao Fernando encolhe para: **registro DNS + vhost + certificado**.

## 7. Auditoria do agente `seguranca` sobre este mapa (29/09/2026): 3 vetos

Auditoria adversarial ANTES da construção (§A.40). Os achados abaixo foram reconferidos por medida
independente do coordenador.

- **VETO 1, allowlist incompleta.** Faltavam as três rotas de `acesso-email`
  (`solicitar`, `confirmar`, `identidade`), sem as quais a tela "Não Consigo Entrar" morre em 403;
  e faltava o estático cru `/portal/sol.svg`. Conferido: `/_next/image?url=%2Fportal%2Fsol.svg`
  responde **400** e `/portal/sol.svg` responde **200 image/svg+xml**, porque o Next recusa otimizar
  SVG. Os padrões da seção 5 também estavam sem prefixo e sem âncora, e assim `portal` arrastaria
  `/api/portal/links`, que **emite link de acesso ao prontuário de um candidato**.
- **VETO 2, sem limite de ritmo por IP.** O throttler global é por `req.ip` e o backend escuta em
  loopback, então todo mundo é o mesmo IP: um laço contra `acesso-email/solicitar` consome a cota e
  devolve 429 aos consultores internos. Fica como decisão do diretor (ver pulso).
- **VETO 3, o alvo não pode ser a homologação.** Conferido pelo coordenador: `as_candidatos` na
  homologação tem **410 linhas de PII real** (nome, e-mail de gmail/hotmail/outlook, telefone), com
  `anonimizado_em` nulo em 410 de 410; a mesma tabela em **produção tem 0 linhas**. O `.env` da
  homologação afirma ser clone anonimizado, e **a afirmação é falsa**. O Portal lê e escreve nessa
  tabela por rota `@Public()`. **O alvo do vhost passa a ser produção (`192.168.1.22:3010`).**

**APROVADO:** o token no fragmento. Emissão (`base#t=`), leitura só de `window.location.hash`,
limpeza por `history.replaceState`, e envio no **corpo** do POST. O 301 de `:80` para `:443` usa
`%{REQUEST_URI}`, que não carrega fragmento, e o navegador reanexa sozinho. Nada do token chega ao
`access.log` (§A.6).

**Item de configuração que a allowlist não resolve:** `ALLOWED_ORIGINS` do backend precisa receber o
host público, senão o `OriginGuard` devolve `403 Origin não permitida` nas rotas anônimas do Portal.
