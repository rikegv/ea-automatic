# Ambiente de HOMOLOGAÇÃO do EA AUTOMATIC

Construído em 20/08/2026 para a frente de A&S. **Zero Fernando:** tudo vive dentro da VM, em loopback
e no ZeroTier, no mesmo regime da produção. Não há DNS, vhost nem certificado para esta porta, e não
pode haver, porque isso encostaria na infraestrutura do Fernando.

## Os dois ambientes, lado a lado

| | Produção | Homologação |
|---|---|---|
| Código | `/home/henrique/apps/ea-automatic` (main) | `/home/henrique/apps/ea-homolog` (branch `homolog`) |
| Banco | `ea_automatic` | `ea_automatic_homolog` (clone ANONIMIZADO) |
| Container do banco | `ea-db` (5433) | **o mesmo** `ea-db` (5433), database diferente |
| Redis | `ea-redis` (6380) | `ea-redis-homolog` (6381) |
| Backend | `ea-backend`, 127.0.0.1:3011 | `ea-homolog-backend`, 127.0.0.1:3111 |
| Frontend | `ea-frontend` 127.0.0.1:3020 atrás do Caddy 0.0.0.0:3010 | `ea-homolog-frontend`, 0.0.0.0:3120 |
| Integrações | ligadas | **todas inertes** |

**Endereço da homologação:** `http://<ip-da-vm>:3120` (pelo ZeroTier).
**Senha de todos os usuários:** a que foi passada em `HML_SENHA` ao rodar o `clonar.sh`. Papel,

## As três camadas que impedem efeito colateral real

Nenhuma delas depende de disciplina humana.

1. **Banco:** `ligado = false` gravado nos quatro `*_scheduler_estado` pela anonimização.
2. **Credencial:** `CLICKSIGN_API_TOKEN`, `PANDAPE_CLIENT_ID/SECRET`, `VT_COLETA_GCS_BUCKET` e os ids
   de pasta do Drive ficam VAZIOS. O padrão do projeto é "sem credencial a rota nasce inerte" (§A.5).
3. **Rede:** `AI_SERVICE_URL`, `PANDAPE_API_BASE_URL`, `PANDAPE_TOKEN_URL`, `CLICKSIGN_API_BASE_URL` e
   `VT_LINK_BASE_URL` apontam para `127.0.0.1:9`, porta discard onde nada escuta.

**A camada 3 não é redundância, ela fechou um buraco real.** Variável VAZIA não desliga estes
clientes: o código tem default para o serviço REAL. `AI_SERVICE_URL` vazio cai em
`http://localhost:8000`, que é o ai-service **de produção**, rodando nesta mesma VM com a service
account real e permissão de escrita no Drive. E a reconciliação do Drive é o **único agendador sem
liga/desliga**: ela dispara sozinha 2 min após o boot e a cada 10 min. Sem a camada 3, a homologação
mandaria arquivo para o Drive de verdade.

## Rotina

```bash
# Recriar a homologação do zero, com dado fresco de produção (anonimizado):
HML_SENHA=<escolha> infra/homolog/clonar.sh

# Subir/derrubar o Redis de homologação:
docker compose -f infra/docker-compose.homolog.yml up -d
docker compose -f infra/docker-compose.homolog.yml down

# Serviços:
systemctl --user restart ea-homolog-backend ea-homolog-frontend
systemctl --user stop    ea-homolog-backend ea-homolog-frontend   # desligar a homologação

# Rebuild depois de mexer no código da worktree:
cd /home/henrique/apps/ea-homolog
pnpm --filter @ea/shared-types build && pnpm --filter @ea/backend build
cd apps/frontend && BACKEND_ORIGIN=http://127.0.0.1:3111 pnpm build
systemctl --user restart ea-homolog-backend ea-homolog-frontend
```

**`BACKEND_ORIGIN` no build do frontend não é opcional.** O rewrite `/api` do Next é resolvido em
BUILD TIME e gravado no `routes-manifest.json`. Esquecer a variável faz a homologação apontar para o
backend de PRODUÇÃO, e ela passa a ler e escrever na base real sem nenhum aviso.

## O que a anonimização faz (§A.6)

`anonimizar.sql`, com guard que recusa rodar fora de `ea_automatic_homolog`. Substitui CPF (por CPF
sintético VÁLIDO, com dígito verificador correto, para as telas se comportarem como em produção),
nome, e-mail, telefone, nascimento e dados bancários do candidato; a sala de espera; o CPF de
substituição; os signatários; o endereço residencial do formulário de VT; a trilha de alterações; o
texto livre digitado por humano; a matrícula da folha; e a identidade dos usuários internos.

**Preservado de propósito:** cliente, cargo, datas, status, farol, papel, área e marcação de menu. É
o que dá à homologação o mesmo comportamento da produção. O que se joga fora é a pessoa, não o
processo.

O script **falha e aborta** se sobrar PII: FK quebrada, nome real, CPF fora do mapa, e-mail real ou
agendador ligado derrubam a criação da homologação. Verificação, não confiança.

## Armadilha conhecida

As unidades `ea-harness-*` (portas 3098/3099) **NÃO são homologação**. Elas encaminham para o backend
de PRODUÇÃO (127.0.0.1:3011) e escrevem no banco de produção. São um visualizador de frontend para
tirar print (§A.13). Não confundir.
