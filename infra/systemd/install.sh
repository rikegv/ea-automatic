#!/usr/bin/env bash
#
# EA AUTOMATIC — instala/atualiza os serviços systemd de USUÁRIO (backend + frontend).
#
# Por que systemd de usuário (e não docker-compose para os apps): os apps rodam como processos
# host (proxy same-origin loopback, DB em porta publicada do host, sem Dockerfiles). Nesta VM não
# há sudo, mas o linger habilita sem sudo → os serviços sobem no boot e reiniciam em queda, sem
# containerizar (zero risco de módulo nativo, ex.: argon2). A infra (ea-db/ea-redis) continua no
# docker-compose (infra/docker-compose.yml).
#
# O script é PORTÁTIL: reescreve o caminho do repositório e do node (nvm) para o ambiente atual,
# então sobrevive a upgrade de node/nvm — basta reexecutar após trocar a versão do node.
#
# Uso:  bash infra/systemd/install.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO/infra/systemd"
DEST="$HOME/.config/systemd/user"

# node atual (resolve nvm etc.) e o diretório do binário.
NODE_BIN="$(readlink -f "$(command -v node)")"
NODE_DIR="$(dirname "$NODE_BIN")"

# Placeholders gravados nos units versionados (ambiente de referência).
REF_REPO="/home/henrique/apps/ea-automatic"
REF_NODE_DIR="/home/henrique/.nvm/versions/node/v20.20.2/bin"

echo "[install] repo    = $REPO"
echo "[install] node    = $NODE_BIN"
echo "[install] destino = $DEST"

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
mkdir -p "$DEST"

for svc in ea-backend.service ea-frontend.service; do
  sed -e "s#${REF_REPO}#${REPO}#g" \
      -e "s#${REF_NODE_DIR}#${NODE_DIR}#g" \
      "$SRC/$svc" > "$DEST/$svc"
  echo "[install] $svc -> $DEST/$svc"
done

# Linger: garante start no boot (e permanência após logout). Idempotente.
loginctl enable-linger "$(whoami)" 2>/dev/null || \
  echo "[install] aviso: não foi possível habilitar linger (start no boot pode exigir sessão ativa)"

systemctl --user daemon-reload
systemctl --user enable --now ea-backend.service ea-frontend.service

echo "[install] OK. Status:"
systemctl --user --no-pager status ea-backend.service ea-frontend.service | grep -E 'Active:|Loaded:' || true
