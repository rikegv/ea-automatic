# PROCEDIMENTO: subir a fundação da plataforma unificadora para PRODUÇÃO (migrations 0109 a 0112)

Escrito pelo agente `devops` em 18/09/2026, **depois do ensaio em clone**, que rodou verde. Este
documento é o passo a passo que o coordenador manda executar na rodada de aplicação. Nada aqui foi
executado contra produção: no ensaio, produção só foi LIDA e copiada (dump).

§A.11: sem travessão. §A.6: nenhuma senha, nenhuma URL de banco com credencial aparece neste arquivo.

---

## 0. O que já está pronto, e não se refaz

| Item | Estado |
|---|---|
| Dump de segurança de produção | **FEITO**, `/home/henrique/backup-fundacao-prod-20260918/ea_automatic_20260918.dump` (3,7 MB, pasta 700, arquivo 600) |
| Ensaio das 4 migrations em clone do dump | **FEITO e VERDE**, 109 para 113, zero divergência fora do A&S |
| Prova de que as guardas abortam de verdade | **FEITA**, com linha semeada a guarda disparou e a transação reverteu inteira para 109 |
| Clones de ensaio | **DERRUBADOS** (`ea_ensaio_0112`, `ea_ensaio_guarda`) |

**Se a aplicação acontecer em outro dia, tire um dump NOVO antes.** O dump acima vale para o estado
de 18/09/2026 às 12h08. Dump velho não é caminho de volta, é perda de dado.

---

## 1. A ORDEM, e por que ela é esta

**BUILD primeiro, MIGRATION depois, RESTART em seguida.** Nesta ordem, e não em outra.

1. **`pnpm --filter backend build`** (não toca o banco, pode rodar com o serviço no ar).
2. **`db:migrate`** contra produção.
3. **`systemctl --user restart ea-backend`**, imediatamente depois da migration.

**Por que o build vem antes da migration:** o build é a etapa demorada e é a que pode FALHAR. Buildar
depois da migration deixaria o banco já migrado e o código velho no ar por todo o tempo do build, que
é exatamente a janela que se quer encurtar. Compilando antes, a janela entre migrar e reiniciar cai
para segundos.

**Por que a migration vem antes do restart, e nunca depois:** a 0112 acrescenta `banco_talentos` e
cria três tabelas que o código NOVO lê. Subir o código novo antes do banco novo quebraria toda rota
de candidato do A&S de imediato, em cima de coluna inexistente.

**Qual é a janela, e o que ela alcança:** entre a migration e o restart, o código VELHO continua no
ar consultando duas colunas que a 0112 derruba (`as_candidatos.id_candidate_pandape` e
`as_candidaturas.id_match_pandape`). Nesse intervalo, rota do A&S que leia candidato ou candidatura
responde erro. **Não há indisponibilidade do resto do sistema**: admissional, esteira, gerenciador,
assinaturas e integrações não tocam nenhuma das tabelas alteradas.

**Na prática, a janela é inofensiva nesta subida específica:** o A&S de produção está VAZIO
(`as_candidatos` 0, `as_candidaturas` 0, `as_etapas_funil` 0, `vagas` 0), medido no ensaio. Ninguém
opera aquelas telas hoje. Ainda assim, faça os passos 2 e 3 colados, sem pausa entre eles.

**Não há janela de indisponibilidade a anunciar, e o frontend NÃO precisa subir junto**, desde que a
frente publicada seja só a fundação de banco mais o backend. Se a rodada levar tela nova, o frontend
entra depois do backend, com o mesmo cuidado de conferir o compilado.

---

## 2. Os passos, na ordem de execução

### 2.1 Dump do dia (se não for o mesmo dia do dump já tirado)

```bash
mkdir -p /home/henrique/backup-fundacao-prod-<AAAAMMDD> && chmod 700 /home/henrique/backup-fundacao-prod-<AAAAMMDD>
docker exec ea-db pg_dump -U ea -d ea_automatic -Fc --no-owner --no-privileges \
  > /home/henrique/backup-fundacao-prod-<AAAAMMDD>/ea_automatic_<AAAAMMDD>.dump
chmod 600 /home/henrique/backup-fundacao-prod-<AAAAMMDD>/ea_automatic_<AAAAMMDD>.dump
docker exec -i ea-db pg_restore -l < /home/henrique/backup-fundacao-prod-<AAAAMMDD>/ea_automatic_<AAAAMMDD>.dump | head -8
```

O `pg_restore -l` é a conferência: dump que não lista não restaura.

### 2.2 Linha de base, ANTES (guarde a saída)

```bash
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "
select 'migrations', count(*)::text from drizzle.__drizzle_migrations
union all select 'tabelas_base', count(*)::text from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'admissoes', count(*)::text from admissoes
union all select 'candidatos', count(*)::text from candidatos
union all select 'frentes_admissao', count(*)::text from frentes_admissao
union all select 'documentos_admissao', count(*)::text from documentos_admissao
union all select 'clientes', count(*)::text from clientes
union all select 'usuarios', count(*)::text from usuarios order by 1;"
```

Esperado antes: migrations **109**, tabelas base **76** (mais 1 view, o 77 do mapa), admissoes 2902,
candidatos 2857, frentes 8127, documentos 22598, clientes 250, usuarios 38.

### 2.3 Build do backend

```bash
cd /home/henrique/apps/ea-automatic && pnpm --filter backend build
```

### 2.4 Conferir o COMPILADO, não a fonte (o erro recorrente da casa)

O `db:migrate` roda por `tsx` sobre `src/`, então ele NÃO depende do `dist`. Quem depende do `dist` é
o serviço que vai subir. Conferir `src/` não prova nada sobre o que o `systemd` executa.

```bash
cd /home/henrique/apps/ea-automatic/apps/backend
# 1. o compilado tem o código novo? (hoje, ANTES do build, isto retorna VAZIO)
grep -rl "as_identidades_externas" dist | head
grep -rl "banco_talentos" dist | head
# 2. o compilado é mais novo que a fonte?
ls -l --time-style=+%F_%T dist/main.js
find src -name '*.ts' -newer dist/main.js | grep -v '\.spec\.ts$' | head
```

**Leitura do resultado:** o primeiro comando tem de listar arquivo. O `find` tem de sair **vazio**:
qualquer fonte não teste mais nova que `dist/main.js` significa build velho, e aí **pare e builde de
novo**. Medido em 18/09, antes do build: o `grep` no `dist` não achou nada, ou seja, o compilado em
produção hoje não tem uma linha da fundação.

### 2.5 Migration em produção

O `migrate.ts` faz `import "dotenv/config"`, e o dotenv **não sobrescreve variável já definida no
ambiente**. Provado no ensaio. Aqui a intenção é usar o `.env` de produção mesmo, então roda sem
variável nenhuma na linha:

```bash
cd /home/henrique/apps/ea-automatic && pnpm --filter backend db:migrate
```

Saída esperada: dois NOTICE inofensivos (`schema "drizzle" already exists`, `relation
"__drizzle_migrations" already exists`) e `[migrate] concluído.`

**As quatro migrations pendentes rodam em UMA transação só.** Medido: com uma guarda disparando, a
contagem voltou a 109, sem estado pela metade. Então **não existe "migrou metade"**: ou vai a 113, ou
continua 109 com a mensagem da guarda na tela.

### 2.6 Restart, colado na migration

```bash
systemctl --user restart ea-backend
sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3011/api/health   # esperado 200
systemctl --user status ea-backend --no-pager | head -5
```

### 2.7 Conferência DEPOIS

```bash
# a mesma linha de base do 2.2: esperado migrations 113, tabelas base 79, TODO O RESTO IDÊNTICO
# estrutura:
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "
select t, to_regclass('public.'||t) is not null from unnest(array['as_identidades_externas','as_depara_etapa_externa','as_retencao_eventos']) t;"
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "
select table_name||'.'||column_name from information_schema.columns
where table_schema='public' and column_name in ('id_candidate_pandape','id_match_pandape');"   -- esperado VAZIO
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "
select string_agg(e.enumlabel,',' order by e.enumsortorder) from pg_type t join pg_enum e on e.enumtypid=t.oid where t.typname='as_candidato_origem';"
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "
select count(*) as etapas, count(*) filter (where inicial) as iniciais from as_etapas_funil;"
docker exec ea-db psql -U ea -d ea_automatic -A -F'|' -t -c "select count(*) from as_depara_etapa_externa;"
```

Esperado: as três tabelas `t`; a lista de colunas VAZIA; enum `PANDAPE,DIGAI,MANUAL,INDICACAO`;
etapas `6|1`; de/para `10`.

Prova de leitura opcional, que não escreve nada:

```bash
cd /home/henrique/apps/ea-automatic/apps/backend && pnpm exec tsx src/db/prova-fundacao.ts
```

---

## 3. ROLLBACK

### 3.1 Se a MIGRATION falhar (guarda disparada ou erro de SQL)

**Não faça nada com o dump.** A transação única já reverteu tudo: o banco continua em 109, íntegro. O
serviço velho segue no ar e funcionando, porque as colunas não foram derrubadas. Leia a mensagem da
guarda, que diz quantas linhas e em qual tabela, e devolva ao coordenador. O `dist` novo buildado no
passo 2.3 fica no disco sem ter subido: **não reinicie o backend**, porque o código novo não roda no
banco velho.

### 3.2 Se a migration passar e o BACKEND não subir

Primeiro tente o caminho barato: `journalctl --user -u ea-backend -n 80 --no-pager`, corrigir e
rebuildar. O banco migrado não é o problema, o código é. Restaurar o banco aqui seria trocar um
defeito por um pior, porque derrubaria de volta as colunas que o código novo espera.

### 3.3 Rollback de verdade do BANCO, só se a migration corromper dado

Não existe migration de volta (`down`) para estas quatro. O caminho de volta é o dump, e ele é
**restauração completa do database**, não parcial. Toda escrita feita em produção depois do dump se
perde. Por isso: **pare o backend ANTES de restaurar**, e decida com o coordenador.

```bash
systemctl --user stop ea-backend
# 1. renomear o database atual em vez de apagar, para não perder a evidência
docker exec ea-db psql -U ea -d postgres -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='ea_automatic';"
docker exec ea-db psql -U ea -d postgres -c "ALTER DATABASE ea_automatic RENAME TO ea_automatic_quebrado_<AAAAMMDD>;"
# 2. recriar e restaurar do dump
docker exec ea-db psql -U ea -d postgres -c "CREATE DATABASE ea_automatic OWNER ea;"
docker exec -i ea-db pg_restore -U ea -d ea_automatic --no-owner --no-privileges \
  < /home/henrique/backup-fundacao-prod-<AAAAMMDD>/ea_automatic_<AAAAMMDD>.dump
# 3. conferir: tem de voltar a 109 e às contagens do passo 2.2
docker exec ea-db psql -U ea -d ea_automatic -tAc "select count(*) from drizzle.__drizzle_migrations;"
# 4. voltar o backend VELHO (o dist anterior), nunca o novo, e só então:
systemctl --user start ea-backend
```

**Renomear em vez de derrubar** é deliberado: o database quebrado vira evidência, e derrubá-lo
elimina a única cópia do estado que causou o problema. Ele é removido depois, com o coordenador.

---

## 4. Isolamento (§A.1), sempre

Tudo acima é `ea-db` (`127.0.0.1:5433`) e os serviços `ea-*` do usuário. **Nada toca** `infra-db-1`,
`infra-redis-1`, nem qualquer coisa do CentraAtend. Homologação (`ea_automatic_homolog`, já em 112) e
os serviços `ea-homolog-*` também não são tocados por este procedimento.

## 5. Depois de subir

§A.25: validação do diretor, commit com `git add` nominal, flag `.claude/state/READY_*` criada só
depois do gate verde e removida logo após o push, e registro no DIARIO.
