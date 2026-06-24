# infra (EA AUTOMATIC)

Stack local isolada do CentraAtend. Postgres 16 (pgvector/pg16) + Redis 7, ambos em `127.0.0.1`.

| Recurso   | EA AUTOMATIC          | CentraAtend (NÃO TOCAR) |
| --------- | --------------------- | ----------------------- |
| Postgres  | `ea-db` @ 5433        | `infra-db-1` @ 5432     |
| Redis     | `ea-redis` @ 6380     | `infra-redis-1` @ 6379  |
| Volume PG | `ea-dbdata`           | `infra_dbdata`          |
| Volume RD | `ea-redisdata`        | `infra_redisdata`       |
| Rede      | `ea-automatic`        | `centraatend`           |

## Subir / descer

```bash
cp infra/.env.example infra/.env   # ajuste o POSTGRES_PASSWORD
pnpm infra:up                      # docker compose up -d
pnpm infra:down
```

Segredos vêm de `infra/.env` (fail-fast: o compose recusa subir sem `POSTGRES_*`).
