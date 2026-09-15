# Fila De Entradas Do Pandapé: desenho revisado (pós-veto)

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-15 · **Estado:** desenho revisado, aguardando reauditoria
**Origem:** OST do diretor, 15/09/2026, após o caso Pamela Tauany (idPreCollaborator 423673).

---

## 1. O problema, medido contra produção

O webhook do Pandapé enfileira e esquece (`pandape-webhook.controller.ts:55`). O EA não guarda
registro nenhum de evento recebido. O único rastro é o job no Redis, podado por CONTAGEM
(`removeOnComplete: 1000` / `removeOnFail: 5000`).

Caso real: o evento da Pamela chegou em 11/09 15:59:57 (202). O worker rodou 5 tentativas em 10
SEGUNDOS, todas com "CPF inválido", porque o Pandapé ainda devolvia CPF zerado: o evento sai na pasta
"Convite de admissão enviado", ANTES de o candidato preencher. Dias depois o dado ficou válido e
ninguém re-tentou. O job terminou na lista `completed` com o erro gravado, então nem na lista de
falhados aparecia.

## 2. Decisões do diretor (15/09/2026)

- **Nome NA GRADE**, com cache em memória do processo, TTL de minutos, nunca em banco, nunca em log.
- **Retenção de 30 dias para AS DUAS CLASSES de linha**, uma regra só:
  - **resolvida** (`resolvido_em` preenchido): 30 dias contados de `resolvido_em`;
  - **NÃO resolvida** (`FALHOU`, `ADIADO`, `INERTE`, `NAO_ENFILEIRADO`, `DESCARTADO_DUPLICADO`,
    `RECEBIDO` preso): 30 dias **sem movimento**, contados de `ultima_tentativa_em`, ou de
    `recebido_em` quando nunca houve tentativa.

  A segunda classe entrou na reauditoria e é a que mais importa: os 30 dias originais só alcançavam
  quem ENTROU, e guardariam para sempre o identificador de quem **nunca virou colaborador**, que é o
  titular com o vínculo mais fraco. O expurgo nasce cobrindo as duas; subir cobrindo uma só cria
  passivo que ninguém revisita.
- Espaçamento da re-tentativa entra JUNTO com a fila.

## 3. A tabela `pandape_entrada`

**GRANULARIDADE: UMA LINHA POR CANDIDATO (`id_precollaborator`), NÃO POR EVENTO.** A redação anterior
("uma linha por evento recebido") era ambígua e gerou leituras opostas na auditoria e no contrato dos
testes. Fica decidido: `id_precollaborator` é **UNIQUE**, e a gravação é **UPSERT**
(`ON CONFLICT DO UPDATE`), nunca `INSERT` puro.

**Por que UPSERT e não INSERT com unique:** a decisão 2 da §4-D torna a gravação dependência dura do
webhook (registro falhou = 503). Com `INSERT` puro sobre coluna unique, o SEGUNDO evento do mesmo
candidato estouraria 23505, e o webhook devolveria 503 **para sempre** para aquele candidato: o
registro que existe para não perder evento viraria a causa da perda. Com upsert não há conflito a
estourar. **Por que UNIQUE e não índice comum:** a tela é fila de trabalho, e fila quer uma linha por
PESSOA pendente, não N linhas da mesma pessoa a cada mudança de etapa.

**A idempotência da criação de admissão NÃO se muda de lugar:** continua no unique de
`integracao_pandape` (`db/schema/tables.ts:1372`). Esta tabela é registro de entrada, não trava.

**O tratamento de falha da gravação NÃO loga payload nem `err.detail`** (exigência 12 vale aqui, e é o
ponto mais fácil de esquecer, porque é código de infraestrutura e não de domínio).

Colunas: `id`, `id_precollaborator` (**UNIQUE**, id do ATS, nullable só na linha do 400-sem-id),
`id_match`, `id_vacancy`, `recebido_em`, `origem` (WEBHOOK | TICK | MANUAL), `desfecho`, `motivo`,
`tentativas`, `ultima_tentativa_em`, **`ultimo_evento_em`**, `resolvido_em`, `admissao_id`
(FK nullable, **SEM unique**).

**`admissao_id` NÃO leva unique**, e isto não é precaução, é correção: dois `id_precollaborator`
diferentes podem legitimamente apontar para a MESMA admissão, que é o caminho B1 de adoção
(`pandape-sync.service.ts:383`, `adotarEventoPandape`, desfecho `ADOTADO`). Com unique ali, o
`DO UPDATE` do upsert estoura 23505 no lado da atualização e a decisão 2 vira 503 permanente. A tabela
vizinha põe unique em `admissao_id` (`db/schema/tables.ts:1359-1361`) e é de lá que o copiar-colar vem.

**O `SET` do `DO UPDATE` é lista EXPLÍCITA E FECHADA, e dela ficam de FORA `recebido_em`, `origem` e
`id_precollaborator`.** O upsert é o mecanismo que reescreve campo em silêncio: escrever
`SET origem = EXCLUDED.origem, recebido_em = EXCLUDED.recebido_em` é o gesto mais natural do mundo e
apagaria as duas informações de maior valor forense da linha, de onde o evento veio e quando chegou
pela PRIMEIRA vez. No caso Pamela, é o "11/09 15:59:57" inteiro da investigação.

**§A.6, o recorte:** só identificadores do ATS e classificação. NADA de CPF, nome, e-mail, telefone,
endereço ou payload. PROIBIDAS as colunas `payload`, `detalhe`, `observacao`, `json`.

### `desfecho` (enum fechado)
`RECEBIDO` · `ADMISSAO_CRIADA` · `PRE_ADMISSAO` · `ADOTADO` · `NO_OP` · `FALHOU` ·
`NAO_ENFILEIRADO` (exigência 2) · `DESCARTADO_DUPLICADO` (exigência 3).

### `motivo` (enum fechado, com CHECK)
`CPF_INVALIDO` · `SEM_CPF_NA_ORIGEM` · `SEM_NOME` · `SEM_DE_PARA` · `QUOTA_429` · `TIMEOUT` ·
`API_FORA` · `DUPLICADO` · `OUTRO`.

**PROIBIDO gravar** `err.message`, `err.detail`, `err.stack` ou `failedReason`. O vetor é concreto e
foi confirmado no banco de produção: o unique parcial `uq_admissao_cpf_vaga_viva` é
`(candidato_cpf, id_vacancy)`, e o `detail` do erro 23505 do Postgres traz o CPF por extenso. Quem
quiser o texto cru continua no Diagnóstico, onde ele morre com o job.

## 4. As oito exigências da auditoria, e como o desenho as atende

1. **Ponto único de convergência.** Toda porta que pode transformar um evento do ATS em admissão
   atravessa `processarCandidato`; as portas de `pull-docs` (re-pull do Diagnóstico, varredura) estão
   **fora do escopo desta tabela, por construção**, porque coleta documental não é evento de entrada.
   O desfecho NÃO é escrito nos pontos de enfileiramento. Sem isso o reprocesso manual da tela de
   Diagnóstico (`filas.service.ts:218`, `job.retry()`) deixaria a linha congelada, mentindo exatamente
   no caso que originou a OST. **Conferido pelo coordenador:** a porta existe e não estava no meu mapa.
2. **A linha nasce ANTES da fila**, no controller do webhook, com `desfecho=RECEBIDO`. O 503 de fila
   indisponível vira `NAO_ENFILEIRADO`; o 400 sem id vira linha sem `id_precollaborator` (contagem e
   instante, jamais o corpo); o 401 do guard entra só como contagem.
3. **`DESCARTADO_DUPLICADO`.** `enfileirarCandidato` usa `jobId: cand-{id}` estável e devolve `true`
   mesmo quando o BullMQ descarta o `add` por jobId ocupado. **Conferido pelo coordenador** em
   `pandape-queue.service.ts:130-136`. O método passa a distinguir "aceitou" de "já existia".
4. **`motivo` enum fechado com CHECK.** Ver §3.
5. **Retenção: 30 dias para AS DUAS classes de linha**, decisão do diretor. Resolvida conta de
   `resolvido_em`; não resolvida conta de `ultima_tentativa_em`, ou de `recebido_em` quando nunca houve
   tentativa. Ver §2. (A redação antiga, "30 dias após `resolvido_em`", cobria só quem ENTROU e está
   superada: ela guardaria para sempre o identificador de quem nunca virou colaborador.)
6. **Nome na grade com cache em memória**, decisão do diretor sobre a alternativa que a auditoria
   admitiu. TTL de minutos, nunca banco, nunca log, e a chamada passa pelo limiter da fila. Reusa a
   forma de `alvoDoJob` (`diagnostico.controller.ts:372-403`), que já devolve nome sem o número do CPF.
7. **O espaçamento vale SÓ para `sync-candidate`.** `pull-docs` fica como está (`attempts: 5`,
   backoff 2000): espaçar o pull empurra a coleta contra o TTL de 48h da staging e perde o prontuário
   em silêncio, o padrão do incidente da §A.33.
8. **Exigências 3 e o espaçamento sobem JUNTOS.** Intervalo maior aumenta a janela em que o jobId fica
   ocupado e uma re-entrega real do Pandapé é descartada calada.

## 4-B. As cinco exigências da REAUDITORIA (9 a 13)

**9. O desfecho é garantido pelo TIPO, não pela disciplina de quem edita.** `processarCandidato` passa
a RETORNAR `{ desfecho, motivo?, admissaoId? }`, com `criarAdmissao` devolvendo o mesmo tipo para cima,
e **um único escritor persiste**, em `processarJob` (`pandape-sync.service.ts:184-188`). Motivo, medido
no código: `processarCandidato` hoje é `Promise<void>` e tem **três saídas silenciosas** que terminam o
job em VERDE, sem exceção e sem desfecho (`:306` inerte, `:313-316` pré-colaborador não retornado,
`:320` conhecido), mais a de `criarAdmissao` (`:350-357`, adia com `logger.warn` quando falta CPF ou
nome, que é o caminho da Pamela em espírito). Escrever em cada `return` são seis ou sete sítios, e todo
`return` novo nasce esquecendo um: `criarAdmissao` já ganhou um quando a pré-admissão entrou (`:396`).
Com retorno discriminado, o compilador cobra em todo `return`.

**10. Dois valores a mais no enum `desfecho`:** `INERTE` (integração sem credencial) e `ADIADO` (o
evento não resolveu e vai re-tentar). Sem eles não há valor legal a gravar e o implementador cai em
`OUTRO`, ou pior, deixa `RECEBIDO` eterno.

**11. `FALHOU` só quando as tentativas ESGOTAM.** O evento `failed` do worker
(`pandape-sync.service.ts:157`) dispara a cada tentativa. Sem checar `attemptsMade >= opts.attempts`, a
linha vai a `FALHOU` na primeira e a fila mente ao contrário. Tentativa intermediária só incrementa
`tentativas` e carimba `ultima_tentativa_em`.

**12. Classificar por regex sobre `err.message` é permitido; PERSISTIR a entrada dessa regex é que é
proibido.** A distinção não é óbvia e é onde a §A.6 seria furada por bom senso. Some-se que
`pandape-sync.service.ts:158` loga `err.message` de toda falha: nenhuma exceção nova deste trabalho
pode carregar CPF, nome ou URL na mensagem.

**13. `origem` é do EVENTO, carimbada no nascimento, e é IMUTÁVEL.** Reprocesso pelo Diagnóstico NÃO
reescreve `origem` para `MANUAL`: incrementa `tentativas`. `MANUAL` fica para linha criada à mão. Sem
esta frase o histórico do caso Pamela se apagaria no primeiro reprocesso.

## 4-C. A régua do cache de nomes (oito pontos, exigidos na reauditoria)

1. **Teto explícito com evicção** (ordem de 500 entradas, LRU ou FIFO), ALÉM do TTL. O backend roda por
   semanas sob `systemd --user`: TTL sem teto é um cadastro de nomes vivo no processo, e não cumpre
   minimização.
2. **TTL verificado na LEITURA, e a entrada expirada é REMOVIDA**, não só ignorada. Constante nomeada.
3. **Proibida qualquer serialização.** Armadilha concreta: `processarJob` devolve valor e o BullMQ grava
   no `returnvalue`, **no Redis** (`pandape-sync.service.ts:176-177`). O nome nunca é retorno de job,
   nem entra em `job.data`, nem em `updateProgress`. Worker e HTTP são o MESMO processo (`:155`), então
   quem resolve escreve direto no cache e o controller lê de lá.
4. **Zero log.** O provider não tem logger que receba o nome; loga contagem e `idPrecollaborator`.
5. **Zero banco, por construção:** a tabela não tem coluna de nome e não pode ganhar uma.
6. **Limpeza no `onModuleDestroy`**, junto do `worker.close()`.
7. **A resolução roda NO WORKER**, sob o limiter de 800/300.000ms que já existe, e a grade lê SÓ o
   cache, exibindo "não informado" (§A.11) enquanto a entrada não chegou. O teto compartilhado com o
   webhook do G.Infor que alimenta a folha é requisito de segurança (§A.5), não performance.
8. **Travado em teste:** TTL remove do Map, evicção no teto, o Logger nunca recebe string contendo o
   nome, e o retorno de `processarJob` não contém nome.

## 4-D. Decisões do coordenador (dentro do escopo, §A.0)

- **Evento de etapa NÃO reabre linha resolvida**, e **NÃO incrementa `tentativas`**. Carimba
  `ultimo_evento_em`, coluna própria. Corrigido na reauditoria: `tentativas` conta tentativas de
  TRANSFORMAR o evento em admissão; somar a elas os eventos de etapa (que o Pandapé dispara a cada
  mudança) faria uma linha resolvida exibir `tentativas: 12` sem que se tivesse tentado nada doze
  vezes. A tela contaria uma história falsa, baixinho, que é o defeito descrito em
  `diagnostico/motivo-reprocesso.ts:4-10`.
- **Registro falhou: 503 e NÃO enfileira.** O Pandapé reenvia. Enfileirar com o registro quebrado
  recria o buraco atual sem ninguém saber.

## 5. RBAC (§A.23)

`@Roles("MASTER", "SUPER_ADMIN")` na classe do controller, padrão do Diagnóstico. Menu registrado em
`domain/menus` e nada mais, visível só para SUPER_ADMIN. NÃO rodar `seed-menus.ts` nem
`backfill-menus-comum.ts`. Toda ação de reprocesso registra trilha com autor e papel.

## 6. A tela

Régua da §A.19: zerou, sai da fila. Padrão único de tabela (§A.12), larguras sem esmagamento (§A.20),
ordenação clicável (§A.29), filtro multiselect em coluna nova (§A.28/§A.37), `Select` do design system
(§A.35), modal que não fecha ao clicar fora (§A.41), title case em título e tag (§A.24), travessão
proibido (§A.11).
