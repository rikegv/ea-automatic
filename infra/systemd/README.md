# EA AUTOMATIC — serviços systemd (usuário)

Mantêm o **backend** e o **frontend** no ar com **reinício automático** (queda **e** boot da VM).
A infra de dados (`ea-db`/`ea-redis`) continua no `infra/docker-compose.yml` — aqui ficam só os apps.

## Por que systemd de usuário (e não docker-compose para os apps)

- Os apps rodam como **processos host** por arquitetura: proxy same-origin do Next para a API em
  `127.0.0.1:3011`, banco em porta publicada do host (`127.0.0.1:5433`), sem Dockerfiles.
- Nesta VM **não há sudo**, o que descarta systemd de sistema — mas o **linger** habilita sem sudo,
  dando start no boot + restart em queda.
- Containerizar exigiria reescrever a rede e arriscaria módulos nativos (ex.: `argon2`). systemd de
  usuário roda **exatamente** os mesmos processos, sem esse risco.

## Serviços

| Serviço | Processo | Bind |
|---|---|---|
| `ea-backend.service` | `node dist/main.js` | `127.0.0.1:3011` (loopback — não exposto) |
| `ea-frontend.service` | `next start -p 3010` | `0.0.0.0:3010` (alcançável pela VPN em `http://10.18.117.235:3010`) |

Ambos com `Restart=always` + `WantedBy=default.target` + **linger** → sobrevivem a queda e a reboot.

## Instalação (idempotente)

Pré-requisito: os apps já **buildados** (`pnpm build` na raiz, ou `scripts/deploy-local.sh`).

```bash
bash infra/systemd/install.sh
```

O `install.sh` é **portátil**: reescreve o caminho do repositório e do node (nvm) para o ambiente
atual antes de instalar em `~/.config/systemd/user/`. Após um upgrade de node/nvm, **reexecute-o**
para reapontar o caminho do binário.

## Operação

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"      # necessário em sessões não-login/SSH

systemctl --user status ea-backend ea-frontend   # estado
systemctl --user restart ea-backend ea-frontend  # reiniciar
systemctl --user stop ea-frontend                # parar
journalctl --user -u ea-backend -f               # logs ao vivo
```

## Publicar nova versão do código

Use o script na raiz (pull + build + restart + health):

```bash
bash scripts/deploy-local.sh
```

## Notas

- Os units versionados carregam os caminhos do ambiente de referência (esta VM); o `install.sh` os
  ajusta na instalação. O que roda de fato vive em `~/.config/systemd/user/` (fora do repo).
- O backend lê `apps/backend/.env` (via `WorkingDirectory`). O `.env` **não é versionado** (segredos).
- CORS/OriginGuard: `ALLOWED_ORIGINS` no `.env` controla quais origens fazem login (hoje inclui
  `http://10.18.117.235:3010`, sem wildcard).
