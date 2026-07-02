#!/usr/bin/env bash
# install-pandape-cron.sh — EA AUTOMATIC / INT-1 Pandapé (Fase 5).
#
# ┌───────────────────────────────────────────────────────────────────────────┐
# │ DEPRECADO (OST-EA-WEBHOOK-PANDAPE) — NÃO INSTALAR.                          │
# │                                                                            │
# │ A DESCOBERTA de novos candidatos passou a ser via WEBHOOK RECEPTOR         │
# │ (POST /api/webhooks/pandape), que substitui o cron-pull de descoberta.     │
# │ A API v1 do Pandapé não tem endpoint de descoberta, então `listarMudancas`│
# │ já é inerte (retorna []) — este cron não descobriria nada.                 │
# │                                                                            │
# │ O endpoint /internal/pandape/tick e o código do worker PERMANECEM no lugar,│
# │ inertes, úteis só para um eventual RE-SYNC pontual de ids já conhecidos.   │
# │ Este script fica versionado apenas como referência histórica.              │
# └───────────────────────────────────────────────────────────────────────────┘
#
# Instala (idempotente) UMA entrada de crontab para o usuário corrente que
# dispara o tick da integração Pandapé a cada 5 min, das 07h às 23h, todos os
# dias. O modelo é JOB AGENDADO (cron), não webhook (§A.5/§A.8).
#
# Janela exata:  */5 7-23 * * *
# Endpoint:      POST http://127.0.0.1:${BACKEND_PORT}/internal/pandape/tick
#                (criado por outro agente — aqui é referência por CONTRATO)
#
# SEGREDOS: o X-Internal-Token NUNCA é gravado no crontab. A linha de cron
# carrega infra/.env em tempo de execução e lê INTERNAL_TOKEN de lá. Assim o
# `crontab -l` não expõe o token.
#
# Sem PANDAPE_API_TOKEN (apps/backend/.env), o endpoint responde mas não puxa
# nada do Pandapé — integração PRONTA porém INERTE (§A.5; ver infra/README.md).
#
# Uso:   bash infra/install-pandape-cron.sh
set -euo pipefail

# ---- Resolve caminhos (independente do diretório de chamada) ----------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# Marcador para idempotência (não muda — é a chave de remoção da linha antiga).
MARKER="# ea-pandape-tick"

# ---- Carrega/valida insumos -------------------------------------------------
# Prioriza variáveis já exportadas no ambiente; senão, lê de infra/.env.
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

if [[ -z "${INTERNAL_TOKEN:-}" ]]; then
  echo "ERRO: INTERNAL_TOKEN não definido." >&2
  echo "      Defina-o em ${ENV_FILE} ou exporte antes de rodar este script." >&2
  exit 1
fi

BACKEND_PORT="${BACKEND_PORT:-3011}"

# ---- Monta a linha de cron --------------------------------------------------
# O comando carrega infra/.env em runtime (mantém o token FORA do crontab),
# então chama o endpoint interno. `-f` faz o curl falhar em HTTP >= 400 (o
# cron registra a falha); saída descartada para não gerar e-mails de cron.
CRON_CMD="set -a; . '${ENV_FILE}'; set +a; curl -fsS -X POST -H \"X-Internal-Token: \$INTERNAL_TOKEN\" http://127.0.0.1:\${BACKEND_PORT:-3011}/internal/pandape/tick >/dev/null 2>&1"
CRON_LINE="*/5 7-23 * * * ${CRON_CMD} ${MARKER}"

# ---- Instala de forma idempotente ------------------------------------------
# Remove qualquer linha antiga com o mesmo marcador antes de (re)adicionar.
CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "${CURRENT}" | grep -vF "${MARKER}" || true)"

{
  # Preserva o crontab existente (sem a nossa linha antiga) e acrescenta a nova.
  printf '%s\n' "${CLEANED}" | sed '/^$/d'
  printf '%s\n' "${CRON_LINE}"
} | crontab -

echo "OK: entrada de cron instalada para o usuário '$(id -un)'."
echo
echo "Linha gerada (token NÃO aparece — é lido de ${ENV_FILE} em runtime):"
echo "  ${CRON_LINE}"
echo
echo "Verifique com:"
echo "  crontab -l"
echo
echo "Para remover:"
echo "  crontab -l | grep -vF '${MARKER}' | crontab -"
