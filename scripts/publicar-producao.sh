#!/usr/bin/env bash
#
# EA AUTOMATIC - Publicacao em producao a partir de origin/main (CLAUDE.md A.49).
#
# POR QUE ESTE SCRIPT EXISTE. Producao roda de um worktree servido (ea-release-portal) que varias
# sessoes compartilham e sujam com trabalho nao-commitado. Buildar DALI arrastaria o solto de outra
# frente para producao, e toda publicacao virava negociacao entre sessoes. Este script quebra essa
# dependencia: ele builda SO do que esta COMMITADO no origin/main (o que ja foi validado, A.21/A.25),
# de um worktree PRISTINO e descartavel, e troca os ARTEFATOS na producao. O fonte sujo do worktree
# servido NUNCA e lido nem apagado: o deploy nao depende do estado do tree de ninguem.
#
# AS CINCO GARANTIAS (A.49):
#  1. Build so do commitado: worktree pristino em origin/main; aborta se estiver sujo (ignora .env).
#  2. Frentes independentes: tudo que esta no origin/main sobe; o nao-commitado fica no tree de cada
#     sessao, intocado, e simplesmente nao e publicado.
#  3. Nao arrasta nem apaga o solto das sessoes: so os diretorios de ARTEFATO sao trocados.
#  4. Seguro: segredos (.env) copiados em runtime, gitignored, nunca commitados nem logados (A.6).
#  5. Restart unico e serializado por lock, carregando tudo que esta pronto de uma vez; com backup
#     e rollback automatico se o health reprovar.
#
# Uso: scripts/publicar-producao.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="/home/henrique/apps/ea-build"          # worktree pristino, descartavel, NUNCA editado por sessao
SERVED="/home/henrique/apps/ea-release-portal" # worktree servido pela producao (so artefato e trocado)
LOCK="/home/henrique/apps/.ea-deploy.lock"
TS="$(date +%Y%m%d-%H%M%S)"
ARTEFATOS=(apps/backend/dist apps/frontend/.next packages/shared-types/dist)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Lock: um deploy por vez. Dois deploys concorrentes se pisariam no swap e no restart.
exec 9>"$LOCK"
flock -n 9 || { echo "Outro deploy em curso (lock $LOCK). Abortando."; exit 1; }

echo "==> [1/8] fetch origin/main (a fonte da verdade do que sobe)"
git -C "$REPO" fetch origin --quiet
TGT="$(git -C "$REPO" rev-parse origin/main)"
echo "    alvo: $TGT"

echo "==> [2/8] worktree PRISTINO em $BUILD (origin/main, nunca o tree de sessao)"
if git -C "$REPO" worktree list --porcelain | grep -qx "worktree $BUILD"; then
  git -C "$BUILD" fetch origin --quiet
  git -C "$BUILD" checkout --detach "$TGT" --quiet
  git -C "$BUILD" reset --hard "$TGT" --quiet
  git -C "$BUILD" clean -fd --quiet   # remove nao-rastreado; PRESERVA node_modules/dist/.next/.env (gitignored)
else
  git -C "$REPO" worktree add --detach "$BUILD" "$TGT"
fi
# GARANTIA 1: build so do commitado. .env sao gitignored e nao contam como sujeira.
dirty="$(git -C "$BUILD" status --porcelain | grep -vE '/\.env' || true)"
[ -z "$dirty" ] || { echo "Worktree de build SUJO, abortando:"; echo "$dirty"; exit 1; }

echo "==> [3/8] env de build (A.6): nada a copiar no modelo de troca-de-artefato"
# O frontend builda com apps/frontend/.env.production, que e RASTREADO (vem no checkout, so
# NEXT_PUBLIC_WHATSAPP_RH, valor publico) e por isso ja esta no worktree de build pelo proprio
# `reset --hard`. O backend NAO le .env no build (nest build = tsc); o segredo de RUNTIME (o
# apps/backend/.env de 164 KB, gitignored) VIVE no worktree servido e e consumido la pelo
# ConfigModule, entao a troca de artefato nao precisa dele e nao o move. Nenhum segredo e copiado,
# commitado nem logado.

echo "==> [4/8] deps (frozen) + build topologico (shared-types -> backend -> frontend)"
( cd "$BUILD" \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @ea/shared-types build \
  && pnpm --filter backend build \
  && pnpm --filter @ea/frontend build )

echo "==> [5/8] backup dos artefatos servidos (rollback) ($TS)"
echo "    commit servido antes: $(git -C "$SERVED" rev-parse --short HEAD 2>/dev/null || echo '?'); artefatos em *.bak-$TS"
for d in "${ARTEFATOS[@]}"; do
  if [ -e "$SERVED/$d" ]; then rm -rf "$SERVED/$d.bak-$TS"; cp -a "$SERVED/$d" "$SERVED/$d.bak-$TS"; fi
done

echo "==> [6/8] troca dos artefatos (GARANTIA 3: so build-output; o fonte de $SERVED nao e tocado)"
for d in "${ARTEFATOS[@]}"; do
  rm -rf "$SERVED/$d.new"
  cp -a "$BUILD/$d" "$SERVED/$d.new"
  rm -rf "$SERVED/$d"
  mv "$SERVED/$d.new" "$SERVED/$d"
done

echo "==> [7/8] restart unico + health (GARANTIA 5)"
systemctl --user restart ea-backend.service ea-frontend.service

# HEALTH COM LACO DE RETRY, NAO UM CURL UNICO APOS SLEEP FIXO. O ea-backend leva ~4s do restart ate
# escutar na 3011; o sleep 4 + curl unico corria JUNTO com o boot, pegava "connection refused" e o
# script REVERTIA um deploy BOM (falso negativo medido em 06/10/2026). O laco ESPERA o servico subir
# de verdade: tenta a cada 2s ate um teto generoso e so reprova se estourar o tempo. So entao o
# ROLLBACK volta a significar "deploy ruim de verdade", e nao "o curl chegou antes do boot".
espera_health() {
  local nome="$1" url="$2" esperado="$3" limite="${4:-60}"
  local inicio code
  inicio="$(date +%s)"
  while :; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
    [ "$code" = "$esperado" ] && { echo "    $nome OK ($code em $(( $(date +%s) - inicio ))s)"; return 0; }
    if [ "$(( $(date +%s) - inicio ))" -ge "$limite" ]; then
      echo "    $nome FALHOU: ultimo codigo '$code' apos ${limite}s de espera"
      return 1
    fi
    sleep 2
  done
}
ok=1
espera_health "backend 3011/api/health" "http://127.0.0.1:3011/api/health" "200" 60 || ok=0
# So checa o frontend depois do backend de pe: a tela depende do backend para servir de verdade.
[ "$ok" = "1" ] && { espera_health "frontend 3010/login" "http://127.0.0.1:3010/login" "200" 60 || ok=0; }

echo "==> [8/8] resultado"
if [ "$ok" = "1" ]; then
  echo "PUBLICADO: producao servindo $TGT. Backup em $SERVED/*.bak-$TS."
else
  echo "FALHA de health: ROLLBACK automatico para *.bak-$TS"
  for d in "${ARTEFATOS[@]}"; do
    if [ -e "$SERVED/$d.bak-$TS" ]; then rm -rf "$SERVED/$d"; mv "$SERVED/$d.bak-$TS" "$SERVED/$d"; fi
  done
  systemctl --user restart ea-backend.service ea-frontend.service
  echo "ROLLBACK aplicado. Verifique: journalctl --user -u ea-backend -u ea-frontend"
  exit 1
fi
