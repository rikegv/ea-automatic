#!/usr/bin/env bash
#
# EA AUTOMATIC — publica uma nova versão na VM: pull + build + restart dos serviços systemd.
#
# NÃO envolve deploy remoto nem push: só atualiza o código local e reinicia os processos host
# gerenciados por systemd de usuário (ver infra/systemd/). A infra (ea-db/ea-redis) não é tocada.
#
# Uso:  bash scripts/deploy-local.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

echo "==> [1/5] git pull (fast-forward)"
git pull --ff-only

echo "==> [2/5] instalar dependências (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> [3/5] build (shared-types -> backend -> frontend, ordem topológica)"
pnpm -r --if-present build

echo "==> [4/5] reiniciar serviços"
systemctl --user restart ea-backend.service ea-frontend.service

echo "==> [5/5] health check"
sleep 3
ok=1
if curl -fsS --max-time 8 http://127.0.0.1:3011/api/health >/dev/null; then
  echo "    backend  OK (127.0.0.1:3011/api/health)"
else
  echo "    backend  FALHOU"; ok=0
fi
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3010/login || echo 000)"
if [ "$code" = "200" ]; then
  echo "    frontend OK (3010/login -> 200)"
else
  echo "    frontend FALHOU (3010/login -> $code)"; ok=0
fi

[ "$ok" = "1" ] && echo "==> Concluído: sistema no ar." || { echo "==> ATENÇÃO: verifique os logs (journalctl --user -u ea-backend -u ea-frontend)"; exit 1; }
