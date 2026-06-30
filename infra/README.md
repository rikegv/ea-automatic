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

## Cron Pandapé (Fase 5)

A integração Pandapé (INT-1, §A.5) é um **job agendado via cron** — não webhook.
Uma entrada de crontab dispara, a cada 5 min, o *tick* que processa a fila de
admissões vindas do Pandapé.

- **O que faz:** `POST http://127.0.0.1:${BACKEND_PORT:-3011}/internal/pandape/tick`
  com o header `X-Internal-Token` (mesmo segredo `INTERNAL_TOKEN` usado entre
  backend e ai-service).
- **Janela:** `*/5 7-23 * * *` — a cada 5 minutos, das **07h às 23h**, todos os dias.
- **Segredo fora do crontab:** a linha de cron carrega `infra/.env` em runtime e
  lê `INTERNAL_TOKEN` de lá; o token nunca é gravado no crontab (`crontab -l` não
  o expõe).

### Instalar

```bash
bash infra/install-pandape-cron.sh
```

O script é **idempotente** (remove a linha antiga pelo marcador `# ea-pandape-tick`
antes de adicionar a nova) e instala no crontab do usuário corrente. Exige
`INTERNAL_TOKEN` em `infra/.env` (ou exportado). Ao final imprime a linha gerada e
manda verificar com `crontab -l`.

> A instalação é uma **ação deliberada na VM** — o script não é executado pelo
> processo de build/CI.

### Inércia sem token

O endpoint `/internal/pandape/tick` é criado pelo backend (outro módulo). Sem
`PANDAPE_API_TOKEN` (em `apps/backend/.env`), o tick **responde mas não puxa nada**
do Pandapé: integração **pronta porém INERTE**. É INÉRCIA, não mock — paridade
conceitual com o fail-fast anti-mock (commit 82c986e), porém sem quebrar o boot.
