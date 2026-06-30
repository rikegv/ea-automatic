#!/usr/bin/env bash
# install-clicksign-cron.sh — EA AUTOMATIC / INT-4 Clicksign (Fase Clicksign).
#
# Instala (idempotente) UMA entrada de crontab para o usuário corrente que
# dispara o tick da integração Clicksign a cada 1 min, das 07h às 23h, todos os
# dias. O modelo é JOB AGENDADO (cron-pull), igual à Fase 5 (§A.5/§A.7).
#
# Janela exata:  */1 7-23 * * *
# Endpoint:      POST http://127.0.0.1:${BACKEND_PORT}/internal/clicksign/tick
#                (criado por outro agente — aqui é referência por CONTRATO)
#
# SEGREDOS: o X-Internal-Token NUNCA é gravado no crontab. A linha de cron
# carrega infra/.env em tempo de execução e lê INTERNAL_TOKEN de lá. Assim o
# `crontab -l` não expõe o token.
#
# Sem CLICKSIGN_API_TOKEN (apps/backend/.env), o endpoint responde mas não
# envia/baixa nada da Clicksign — integração PRONTA porém INERTE (§A.5; ver
# infra/README.md).
#
# Uso:   bash infra/install-clicksign-cron.sh
set -euo pipefail

# ---- Resolve caminhos (independente do diretório de chamada) ----------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

# Marcador para idempotência (não muda — é a chave de remoção da linha antiga).
MARKER="# ea-clicksign-tick"

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
CRON_CMD="set -a; . '${ENV_FILE}'; set +a; curl -fsS -X POST -H \"X-Internal-Token: \$INTERNAL_TOKEN\" http://127.0.0.1:\${BACKEND_PORT:-3011}/internal/clicksign/tick >/dev/null 2>&1"
CRON_LINE="*/1 7-23 * * * ${CRON_CMD} ${MARKER}"

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
