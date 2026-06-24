#!/usr/bin/env bash
#
# EA AUTOMATIC — Gate de deploy/push (CLAUDE.md §A.7).
#
# Correção herdada do diagnóstico CentraAtend: lá o gate existia mas o hook PreToolUse
# NÃO estava registrado, então a trava não funcionava. No EA este script NASCE amarrado
# como hook PreToolUse em .claude/settings.json (matcher Bash).
#
# Comportamento: ao detectar um verbo de deploy/push, exige uma flag .claude/state/READY_*.
# Sem a flag, BLOQUEIA com exit 2 (o Claude Code trata exit 2 do PreToolUse como bloqueio
# e devolve o stderr ao modelo). Com a flag, libera (exit 0).
#
# Entrada: payload JSON do hook via stdin ({"tool_input":{"command":"..."}}).
# Uso manual/teste: echo '{"tool_input":{"command":"git push"}}' | scripts/gate-deploy.sh
#                   scripts/gate-deploy.sh git push      # (sem JSON, lê os argumentos)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$REPO_ROOT/.claude/state"

# 1) Lê o comando: do payload JSON do hook (stdin) ou dos argumentos (uso manual).
PAYLOAD=""
if [ ! -t 0 ]; then
  PAYLOAD="$(cat 2>/dev/null || true)"
fi

CMD="$(printf '%s' "$PAYLOAD" \
  | grep -oE '"command"[[:space:]]*:[[:space:]]*"([^"\\]|\\.)*"' \
  | head -n1 \
  | sed -E 's/^"command"[[:space:]]*:[[:space:]]*"//; s/"$//')"
if [ -z "$CMD" ]; then
  CMD="$*"
fi

# 2) Verbos guardados: git push, deploy, kubectl apply, docker push.
GUARDED='git[[:space:]]+push|(^|[[:space:]])deploy([[:space:]]|$)|kubectl[[:space:]]+apply|docker[[:space:]]+push'

if ! printf '%s' "$CMD" | grep -qE "$GUARDED"; then
  exit 0  # não é verbo guardado — libera
fi

# 3) Verbo guardado: exige flag READY_*.
shopt -s nullglob
flags=("$STATE_DIR"/READY_*)
shopt -u nullglob

if [ "${#flags[@]}" -gt 0 ]; then
  names=""
  for f in "${flags[@]}"; do names="$names ${f##*/}"; done
  echo "[gate-deploy] Flag READY presente (${names# }); liberando: ${CMD}" >&2
  exit 0
fi

cat >&2 <<EOF
⛔ [gate-deploy] BLOQUEADO — verbo de deploy/push sem flag de liberação.
   Comando .: ${CMD}
   Flag .....: nenhuma em .claude/state/READY_*
   Para liberar (deliberado, após validação visual do diretor + gate de qualidade):
       touch ${STATE_DIR#"$REPO_ROOT/"}/READY_<motivo>
   e remova a flag após concluir. Esta trava é a correção do diagnóstico CentraAtend (§A.7).
EOF
exit 2
