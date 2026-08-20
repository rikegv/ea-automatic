#!/usr/bin/env bash
# ============================================================================
# CLONE ANONIMIZADO DE PRODUÇÃO PARA HOMOLOGAÇÃO
#
# Recria `ea_automatic_homolog` a partir de `ea_automatic`, anonimiza (§A.6) e desliga os
# agendadores. Idempotente: rodar de novo joga fora a homologação e refaz do zero.
#
# A PRODUÇÃO É TOCADA EM MODO LEITURA E SÓ ISSO: um `pg_dump`. Nenhuma escrita, nenhum lock de
# escrita, nenhum restart. O backend de produção segue no ar durante o clone.
#
#   HML_SENHA=<senha> ./clonar.sh
#
# §A.6: nenhuma credencial vive neste arquivo. O usuário do banco sai de infra/.env (gitignorado) e a
# senha de homologação vem de HML_SENHA. O que vai para o git não carrega segredo.
# ============================================================================
set -euo pipefail

if [[ -z "${HML_SENHA:-}" ]]; then
  echo "RECUSADO: defina HML_SENHA (senha única dos usuários de homologação)." >&2; exit 1
fi

PROD_DB="ea_automatic"
HML_DB="ea_automatic_homolog"
CONTAINER="ea-db"
PGUSER="$(grep -E "^POSTGRES_USER=" "$(dirname "${BASH_SOURCE[0]}")/../.env" | cut -d= -f2)"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$HML_DB" == "$PROD_DB" ]]; then
  echo "RECUSADO: destino igual à produção." >&2; exit 1
fi

echo "==> 1/5 conferindo produção intacta antes de começar"
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PROD_DB" -t -A \
  -c "SELECT 'producao ok: ' || count(*) || ' admissoes' FROM admissoes;"

echo "==> 2/5 recriando $HML_DB (derruba conexões abertas antes)"
docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$HML_DB';" >/dev/null
docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $HML_DB;"
docker exec "$CONTAINER" psql -U "$PGUSER" -d postgres -c "CREATE DATABASE $HML_DB OWNER $PGUSER;"

echo "==> 3/5 copiando estrutura e dados (pg_dump, leitura pura da produção)"
# Tudo DENTRO do container: o dump com PII nunca toca o disco do host nem transita pela rede.
docker exec "$CONTAINER" bash -c \
  "pg_dump -U $PGUSER -d $PROD_DB --no-owner --no-privileges | psql -q -U $PGUSER -d $HML_DB" \
  > /dev/null

echo "==> 4/5 anonimizando (§A.6) e desligando agendadores"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$HML_DB" < "$AQUI/anonimizar.sql"

echo "==> 5/5 senha única de homologação para todos os usuários"
# Argon2 é módulo nativo e vive no workspace do backend; por isso o hash sai de lá.
node "$AQUI/senha-homolog.mjs"

echo
echo "==> pronto. Conferência final:"
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$HML_DB" -c "
  SELECT (SELECT count(*) FROM admissoes)  AS admissoes,
         (SELECT count(*) FROM candidatos) AS candidatos,
         (SELECT count(*) FROM usuarios)   AS usuarios,
         (SELECT count(*) FROM clientes)   AS clientes;"
docker exec "$CONTAINER" psql -U "$PGUSER" -d "$PROD_DB" -t -A \
  -c "SELECT 'producao intacta: ' || count(*) || ' admissoes' FROM admissoes;"
