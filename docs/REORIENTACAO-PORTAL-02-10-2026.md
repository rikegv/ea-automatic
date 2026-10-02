# Reorientação do Portal do Candidato, estado MEDIDO em 02/10/2026 (15h20)

Sessão reiniciada. Nada foi construído nem publicado nesta rodada. Toda linha abaixo foi medida
contra a máquina, não lembrada. §A.11 (sem travessão), §A.14 (só o Portal).

## 1. Fase 1 (app próprio): COMMITADA e NO AR

- `9b8c66b` está em `origin/main` (e em `origin/publicacao-20261002`). Único commit que toca
  `apps/portal-app`.
- Serviços vivos: `ea-portal-app` (produção, `127.0.0.1:3021`, `BACKEND_ORIGIN=3011`, desde 01/10
  20:56) e `ea-homolog-portal-app` (`0.0.0.0:3121`, backend `3111`, desde 01/10 16:23).
- Builds: homolog `.next` (BUILD_ID `pfYhbYTgxrCTk2SP5Hhuy`), produção `.next-prod`
  (`sND9_mW_0RROgxcG6mvPH`). Os dois contêm o mesmo chunk da entrada e-mail-first
  (`static/chunks/app/portal/page-37f2a3722d03cf3e.js`).
- **Risco de diretório único:** os dois serviços rodam do MESMO `WorkingDirectory`
  (`apps/portal-app`), separados só por `PORTAL_DIST_DIR`. Um `next build` sem a variável clobbera a
  homologação (mesma classe de `ea-next-dev-clobbers-prod-build`).
- Solto no working tree, do app próprio: `next.config.mjs` (`distDir` por variável), `tsconfig.json`
  e `.gitignore` (`.next-prod`). É o que FAZ os dois builds coexistirem, e não está commitado.

## 2. Fase 2 (endereço público): NO AR, apontando para HOMOLOGAÇÃO

| item | medição |
|---|---|
| DNS `clientesportalsoulan.com.br` | resolve `34.132.248.236`; NS = `ns-cloud-e[1-4].googledomains.com` (Cloud DNS, propagado) |
| HTTPS | `GET /portal` = 200 |
| certificado | Let's Encrypt, CN `clientesportalsoulan.com.br`, de 01/10 21:16 a 30/12 21:16 |
| VM GCP | no ar, up 18h49 (desde ~01/10 20:27); `caddy` active |
| Caddyfile | `reverse_proxy 127.0.0.1:3121`, redir `/` para `/portal`, **sem access log** (condição 3 do gate cumprida) |
| túnel SSH | `ea-portal-tunnel` active desde 01/10 20:41, `-R 127.0.0.1:3121:127.0.0.1:3121` |
| alvo | **HOMOLOGAÇÃO** (3121 -> backend 3111 -> banco `ea_automatic_homolog`) |
| fail-closed | `/portal` 200; `/api/auth/login`, `/gerenciador`, `/esteira`, `/admin`, `/api/portal/links/1` = **404** |
| rota do candidato ponta a ponta | `POST /api/portal/identificar` pelo HTTPS público = **400** (validação do CPF), ou seja, chega ao backend |

## 3. App próprio de produção: PRONTO, go-live NÃO aconteceu

`127.0.0.1:3021` responde `/portal` 200 e `POST /api/portal/identificar` 400 contra o backend de
produção. O go-live é uma linha: trocar o `-R` do túnel de 3121 para 3021. **Não depende do
SendGrid** (o caminho do LINK não usa correio); o SendGrid trava só a porta de e-mail (item 7).

Antes do cutover valem as 4 condições do `seguranca` registradas em
`docs/DESENHO-PORTAL-APP-PROPRIO-TUNEL.md` seção 12.

## 4. Porta 22 da VM: PENDENTE, e há ataque ativo

Medido no `sshd` da própria VM, últimas 24h, 1.645 linhas de log: **20+ IPs de fora**, o maior com
**350 tentativas** (`182.151.61.36`), e o escritório (`187.102.148.222`) com só 15. `iptables` da VM
é `ACCEPT` em tudo, e a service account da fábrica não lê firewall
(`insufficient authentication scopes`). Conclusão: **a porta 22 segue aberta para a internet**. É a
condição 4 do gate, e é ação do dono do projeto no console do GCP.

## 5. e 6. O bug V12 e a autenticidade são A MESMA frente, e o conserto JÁ ESTÁ ESCRITO

Correção de premissa: o conserto do VALIDADO -> ENTREGUE **não está por fazer**. Ele existe no
working tree, não commitado, acoplado à frente de autenticidade.

- Defeito no HEAD: `marcarEntregue` grava `AGUARDANDO_AUDITORIA`
  (`portal-credencial.service.ts:1378`), e no veredito VALIDADO o HEAD só grava `observacao`, nunca
  `estado`. `AGUARDANDO_AUDITORIA` é o que a tela chama "Em Análise"
  (`portal-documentos.service.ts:519`), e `ENTREGUE -> ACEITO` (`:515`) nunca era alcançado.
- Conserto no working tree: `portal-credencial.service.ts:1248-1265` chama `decidirDestino`
  (`domain/auditoria.ts:55`): VALIDADO não suspeito vira **ENTREGUE**; VALIDADO suspeito fica em
  `AGUARDANDO_AUDITORIA` com `conferir_autenticidade` e vai ao humano. As duas guardas de sempre
  continuam (nunca por cima de veredito humano nem de documento já resolvido).
- **Ele não funciona até a migration `0142_autenticidade_documento` ser aplicada**, porque o
  `update` escreve `conferir_autenticidade`. Medido: `0142` **não está aplicada em NENHUM dos dois
  bancos** (marca d'água de prod e de homolog = `1790646007719`, que é a `0141`), e as colunas não
  existem.
- `portal-gi-gravacao.service.ts` (o arquivo compartilhado com a sessão do GI) **NÃO está modificado
  no working tree**. O conserto do estado não encosta nele.
- O `campos: []` tem **DUAS fontes**, e só uma é nossa:
  1. `portal-credencial.service.ts:666-667`, a guarda `length > 0 || veredito`: o OR deixa passar
     "veredito presente, zero campo" e grava a linha vazia em `portal_conferencia`. **Ainda não
     consertado.**
  2. `portal-gi-gravacao.service.ts:76-79`, anulação **deliberada** após a confirmação do GI
     (ratificada no DIARIO:16717). Essa não é defeito e não se toca.
- Cobertura: `decidirDestino` tem testers puros, mas **nenhum teste cobre a porta do Portal**. O
  canário `auditoria-autenticidade.portas-entregue.tester.spec.ts:23-28` diz isso por escrito.

Escopo entendido, como o diretor mandou: aplicar VALIDADO -> ENTREGUE na confirmação (feito no
working tree, falta publicar e testar a porta) e corrigir o `campos: []` da guarda 1 (a fazer). Com
aviso à sessão do GI **se e quando** `portal-gi-gravacao.service.ts` precisar ser tocado, o que hoje
não é o caso.

## 7. Entrada por e-mail (desenho iii): TELA commitada e no ar, PORTA 404 em todo lugar

- Commitado em `9b8c66b`: `EntradaSemLink.tsx`, o spec, os 7 símbolos do `shared-types`.
- Solto (untracked), o backend inteiro: `portal-acesso-email.{controller,service,dto}.ts`,
  `domain/portal-acesso-email.ts`, 2 testers, e a migration `0134_portal_acesso_email.sql`.
- Medido: `POST /api/portal/acesso-email/solicitar` = **404** na produção (3021), na homologação e
  pelo HTTPS público. O release de produção (`~/apps/ea-release-portal`, HEAD `cd15c19`) **não tem**
  os arquivos do acesso-email.
- Banco: a homologação TEM `portal_acesso_codigos` e `portal_acesso_travas`; a **produção NÃO TEM**.
  A `0134` continua com `when = 1790646000719`, abaixo da marca d'água `1790646007719`, então o
  Drizzle a pula em silêncio nos dois bancos (memória `ea-drizzle-0134-abaixo-da-marca`).
- **Defeito do aviso de manutenção, medido:** o aviso calmo dispara em **503**
  (`portal-acesso-email.ts:128`). A porta responde **404**, que cai em `default -> "FALHA"`
  (`:130-131`), o aviso vermelho genérico. Quem tentar o e-mail hoje no endereço público não vê o
  aviso de manutenção, vê falha.
- Correio: `apps/backend/.env` **não tem nenhuma** variável de SendGrid, SMTP ou Gmail.

## 8. Commitado x solto (recorte do Portal)

**Commitado** (`9b8c66b` e anteriores): app próprio `apps/portal-app`, `EntradaSemLink`, a trava
`portal-app-sem-vazamento.tester.spec`, os 7 símbolos do acesso-email no `shared-types`.

**Solto, do Portal** (73 entradas no working tree inteiro, as de outras sessões não entram aqui):
- autenticidade + conserto do V12: `domain/auditoria.ts`, `auditoria/auditoria.service.ts`,
  `portal/portal-credencial.service.ts`, `reauditoria/validacao-humana.service.ts`,
  `db/schema/{tables,enums}.ts`, `ai-service/app/{gemini,schemas,routers/auditoria}.py`,
  `drizzle/0142_*.sql` + `meta/_journal.json`, 5 testers untracked, `shared-types` (+18 linhas,
  2 campos opcionais);
- acesso por e-mail: os 5 arquivos untracked acima + `0134_*.sql`;
- app próprio: `next.config.mjs`, `tsconfig.json`, `.gitignore`;
- painel/links/correio: `portal-painel.{controller,spec}.ts`, `portal.module.ts`,
  `portal-correio.service.ts`, `portal-leitor.service.ts`, `admin/portal-links/page.tsx`,
  `lib/portal-painel.ts(+spec)`, `domain/portal-{envio,evento}.ts`;
- compartilhado com a sessão do GI, **a NÃO tocar sem aviso**: `domain/portal-dados-gi.ts` e o
  `.montador.spec.ts` (já modificados, por ela).

## 9. Quem destrava o quê

**Depende do diretor:** a porta 22 no GCP; o go-live do túnel para produção (3021); o SendGrid (ou
a alternativa de `docs/CORREIO-DO-PORTAL-ALTERNATIVAS.md`) para a porta de e-mail; a ordem entre
publicar o conserto do V12 e as outras frentes, porque o restart do backend é compartilhado.

**A fábrica segue sozinha, quando mandado:** corrigir o `campos: []` da guarda 1; escrever o teste
da porta do Portal que hoje não existe; reemitir a `0134` acima da marca d'água; aplicar a `0142` e
publicar o conserto do V12; trocar o 404 por 503 na porta desligada para o aviso calmo aparecer.
