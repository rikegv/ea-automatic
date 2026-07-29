# Virada da Clicksign: sandbox para produção (INT-4)

Procedimento operacional da troca de ambiente. Escrito em 29/07/2026, com a virada preparada e **não
executada**: falta só o token de produção, que o diretor entrega.

Decisão registrada do diretor: **o teste em produção será com admissão REAL**. Se precisar cancelar,
o cancelamento é feito **pelo portal da Clicksign**, não pelo EA. A plataforma inteira foi validada
assim, e o risco está assumido.

---

## 1. O que trocar, e onde

Arquivo único: **`apps/backend/.env`** na VM (git-ignored, nunca versionado, §A.6).

| Variável | Hoje | Produção |
|---|---|---|
| `CLICKSIGN_API_BASE_URL` | `https://sandbox.clicksign.com/api/v3` | `https://app.clicksign.com/api/v3` |
| `CLICKSIGN_API_TOKEN` | token de sandbox | token da conta de **produção** |

Sandbox e produção são **contas separadas**: o token de uma não funciona na outra. O token de
produção se gera em `app.clicksign.com`, em **Configurações**, aba **API**, botão **gerar access
token**, com uma descrição (sugestão: `EA AUTOMATIC, VM interna`).

Cuidado que o código já tem, e que muda o roteiro: se `CLICKSIGN_API_BASE_URL` sumir do arquivo, o
default embutido é **sandbox** (`clicksign-api.service.ts`). Nunca comentar a linha achando que "vai
para o padrão certo".

## 2. Comandos

```bash
# 1) editar o .env (as duas linhas da tabela acima)
nano /home/henrique/apps/ea-automatic/apps/backend/.env

# 2) reiniciar SÓ o backend (as variáveis são lidas uma vez, no boot)
systemctl --user restart ea-backend.service

# 3) health check
curl -fsS http://127.0.0.1:3011/api/health

# 4) CONFERIR QUE NÃO FICOU INERTE (o log só aparece se o token estiver ausente/vazio)
journalctl --user -u ea-backend --since "2 min ago" | grep -i "clicksign inerte" && \
  echo "ATENCAO: ficou INERTE, o token nao foi lido" || echo "OK: integracao ativa"
```

Não precisa de build nem de deploy: só o `.env` e o restart.

## 3. Antes de virar, conferir a base (regra permanente)

O `clicksign_envelope_id` é **específico do ambiente**. Envelope de sandbox não existe em produção,
então um registro em `AGUARDANDO_ASSINATURA` faria o tick consultar, a cada 5 minutos, um id que a
produção não conhece: 404, backoff, ruído no log.

**Regra: nunca virar o ambiente com envelope em `AGUARDANDO_ASSINATURA`.**

```bash
# ATENÇÃO ao formato: o psql roda DENTRO do container, então não use "$DATABASE_URL" (ele aponta
# para 127.0.0.1:5433, que é o mapeamento visto do HOST; dentro do container isso não resolve).
docker exec ea-db psql -U ea -d ea_automatic -c \
  "select clicksign_status, count(*), count(clicksign_envelope_id) as com_envelope from admissoes group by 1 order by 1;"

docker exec ea-db psql -U ea -d ea_automatic -c \
  "select count(*) as kits_anexados from admissoes where kit_assinatura_path is not null;"

# Fila do BullMQ (db 1 do ea-redis). Tem de estar zerada em todos os estados.
for st in wait active delayed failed; do
  echo -n "$st: "; docker exec ea-redis redis-cli -n 1 LLEN "bull:clicksign-sync:$st"
done
```

Esperado para virar: **zero** em `AGUARDANDO_ASSINATURA` e **zero** kit anexado (fila vazia).

**Conferido em 29/07/2026, imediatamente antes da entrega do token:** `SEM_ENVELOPE` 896 e `ASSINADO`
1.486, ambos com **zero** `clicksign_envelope_id`; nenhuma linha em `AGUARDANDO_ASSINATURA`,
`CANCELADO` ou `EXPIRADO`; **zero** kit anexado; fila do BullMQ sem nenhuma chave. Os 1.486
`ASSINADO` são a carga histórica (§A.16 regra 1), que nunca passou pela Clicksign, por isso não têm
envelope. Base limpa: **nenhum envelope de sandbox fica órfão na troca.**

## 4. Roteiro do teste em produção (admissão real)

1. Trocar o `.env`, reiniciar, confirmar que **não** logou "Clicksign inerte".
2. Escolher **uma** admissão real, com e-mail do candidato conferido e as três frentes concluídas.
3. Gerar e liberar o kit pelo Gerador de Kit, com "Enviar para assinatura". A admissão passa a
   aparecer na aba **Prontos Para Solicitar** da tela de Assinaturas.
4. Disparar **INDIVIDUALMENTE**, pelo botão da própria linha (`POST /clicksign/{id}/disparar`), e
   **não** pelo disparo em lote. Os dois caminhos existem, funcionam e usam a MESMA régua de
   validação; a escolha do individual é do teste, para o primeiro envelope de produção nascer um a
   um e sob observação.

   O lote **não está desabilitado por trava de botão**: quem controla o acesso é o MENU (§A.23).
   Quem não deve disparar simplesmente não recebe o menu de assinaturas. Não existe botão cinza
   dizendo "não pode": existe tela que a pessoa não enxerga.
5. Provar a ida: e-mail chegou, o documento **abre** no visualizador, o candidato assina, os
   assinantes da empresa assinam na ordem, o envelope fecha.
6. Provar a volta: em até 5 minutos o scheduler marca `ASSINADO`, baixa o PDF e arquiva na subpasta
   ADMISSÃO do Drive. **Abrir o arquivo no Drive**, não confiar só na pill da tela.
7. Cancelamento, se precisar: **pelo portal da Clicksign** (decisão do diretor). Nesta conta o
   cancelamento programático de envelope em `running` não é aceito, e o EA reporta isso honestamente
   em vez de fingir que cancelou.

## 5. Voltar atrás

Reverter é a mesma edição ao contrário (base de sandbox e token de sandbox) mais o restart. O EA
aponta para **um ambiente por vez**: não existe operar produção e sandbox ao mesmo tempo na mesma
instância, porque a base e o token são globais do processo.
