# OST Fase 1: app próprio do Portal (comum a todos os desenhos de endereço)

Aprovada pelo diretor. Esta fase **não expõe nada** e é a mesma para qualquer escolha de endereço
público (GCP+domínio, Tailscale, Firebase+Cloud Run). Por isso pode começar antes de fechar o endereço.
§A.11, §A.14 (só o que esta OST pede), §A.38.

## Objetivo

Gerar um **build Next separado, só com as telas do candidato**, servido numa porta própria da VM, que
conserta por construção o vazamento do `/_next/static/*` (hoje a allowlist publicaria o bundle inteiro
do EA, texto de artigos de menu restrito incluído). Sem isso, nenhum endereço público é seguro.

## Escopo (o que esta OST toca, nominal)

- **Build do app próprio:** gerar um artefato Next que contém **só** a rota `/portal` e o que ela
  importa, com `basePath = /portal` (para todo asset nascer sob `/portal/*`, condição de um proxy de
  prefixo único). Decidir na execução entre (a) segundo build do mesmo repo com entrada enxuta ou
  (b) app Next separado em pasta própria; começar por (a).
- **Serviço próprio:** um `systemd --user` novo (ex.: `ea-portal-app`), `next start` numa porta
  loopback própria, `Restart=always`, no padrão do `ea-frontend.service`.
- **API same-origin com allowlist nominal:** o app encaminha **só** as 12 rotas `/api/portal/*` ao
  backend `127.0.0.1:3011`; `/api/auth/*`, `/api/portal/links` e o resto não têm rewrite (morrem no
  app). (A barreira fail-closed definitiva, para o endereço público, entra na fase do endereço; aqui
  já nasce sem o curinga `/api/:path*`.)
- **Prova de não vazamento (§A.38, condição de aceite):** gerar o build e provar, pelo
  `app-build-manifest.json`, que os chunks do EA (`3708` e os de `(app)/*`) **não existem** no
  `.next/static` do app próprio.

## Fora de escopo (não tocar)

- O endereço público, o túnel, a VM do GCP, o Firebase, o DNS. São a fase seguinte.
- O frontend da operação (`ea-frontend`, porta 3020) e o Caddy `ea-proxy`. O app próprio é serviço
  novo, lado a lado, não substitui nada.
- Produção. A Fase 1 valida na homologação (3120), §A.32.

## Aceite (validação do diretor)

1. A tela `/portal` abre no app próprio igual à de hoje (prova visual, §A.13).
2. O `app-build-manifest.json` do app próprio não contém nenhum chunk do EA (prova de construção).
3. `/api/auth/*` e `/api/portal/links` não são alcançáveis pelo app próprio (404 no app).
4. Gate verde (typecheck, lint, testes) e o serviço de pé com health conferido.

## Quem faz

- `frontend`: o build separado, o `basePath`, os rewrites nominais, a prova do manifest.
- `devops`: o `systemd --user` do serviço novo, sem colidir com portas existentes (§A.1).
- `seguranca`: audita a prova de não vazamento antes do aceite (§A.38).
- coordenador: consolida, valida a tela (§A.13), reporta.

## Nota de coordenação (§A.14, múltiplas sessões)

Serviço e porta novos, build novo: não toca o que está no ar. Restart só do serviço novo. O checkout
de produção é compartilhado; nada desta fase sobe para produção. Só o diretor coordena qualquer
restart que alcance a 3010/3020.
