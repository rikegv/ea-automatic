# O QUE FALTA PARA LIGAR O PANDAPÉ E O DIGAI EM PRODUÇÃO

Medido em 30/09/2026. Cada linha diz **de quem é** e **se bloqueia**.

## ~~O PRÉ-REQUISITO COMUM~~ **RESOLVIDO em 30/09/2026, 15:17**

**PRODUÇÃO FOI PUBLICADA.** O release está em **`45b7878`** (era `2873bd1`), com backend e frontend
reconstruídos e os serviços reiniciados. Foi publicado por outra sessão, na mesma janela da frente do
Diagnóstico, carregando os três commits que faltavam.

**Conferido POR MIM, no artefato e não na palavra de ninguém:**

| o que | medido |
|---|---|
| A correção do `items` está no `dist` que roda | **sim**, 3 ocorrências em `dist/pandape/pandape-api.service.js` |
| A ponte para a admissão | **sim**, `dist/as/ingestao-pandape/ingestao-ponte-admissao.js` existe |
| O cargo resolvido pelo catálogo | **sim**, 2 ocorrências de `cargoPorTexto` no `dist` |
| A varredura continua **INERTE** | **sim**: linha 100 do `.env` do release comentada, e o boot loga "Varredura do Pandapé INERTE" |
| O Digai continua inerte | **sim**, log de boot: "ingestao INERTE" |
| Contagens de produção | admissoes 3008, candidatos 2961, usuario_menus 498, vagas 0, as_candidaturas 0, **135 migrations** |
| A tabela da fila NÃO está em produção | **certo**, 0: a `0136` não está commitada e não subiu |
| Saúde | os 4 serviços ativos, 3010 em 200 |

**A consequência que muda tudo: a partir de agora, ligar o FILTRO DE ENTRADA faz a varredura LER DE
VERDADE.** Antes ela leria zero em silêncio. O item 1 desta lista deixou de bloquear.

**O que sobrou para publicar é só a MINHA frente** (precedência, fila de divergências e a migration
`0136`), e ela depende da validação do diretor na 3120. Com o release já na `main`, a publicação dela
é: commitar, `merge --ff-only`, rebuildar, aplicar a `0136` e reiniciar.

---

## ~~O PRÉ-REQUISITO COMUM~~ (texto original, mantido como registro do que era)

**1. PUBLICAR PRODUÇÃO. Bloqueante, e é o item que muda tudo.** (fábrica)
O release no ar está em **`2873bd1`**. Ele **NÃO tem** três coisas desta semana:
- a correção do `items` (a v2 do Pandapé devolve `items`, não `data`): **sem ela a varredura lê ZERO**,
  em silêncio, escrevendo "0 vagas varridas" como se o ATS não tivesse nada;
- a **ponte para a admissão** (quem chega já contratado não nasceria com pré-admissão);
- o **cargo resolvido** pelo catálogo.

**Ligar o FILTRO DE ENTRADA com o release atual não faz nada.** Publicar é pré-requisito, não opção.
O código do **Digai já está** no release e no `dist`, então para ele este item é só sobre o resto.

## PANDAPÉ

| # | o que falta | de quem | bloqueia? |
|---|---|---|---|
| 2 | **Validar a fila de divergências** na 3120 e a frente ser commitada | diretor, depois fábrica | **sim** |
| 3 | **Descomentar `PANDAPE_VARREDURA_DATA_CORTE=2026-07-02`** e reiniciar o backend | fábrica, na sua ordem | **sim** |
| 4 | **Conceder o menu `divergencias-ingestao`** a quem vai trabalhar a fila. Ele nasce só para o SUPER_ADMIN (§A.23) | **só o diretor** | sim, na prática |
| 5 | **Aceitar o custo do vínculo manual:** ~432 vagas nascem em `PENDENTE_REVISAO` e são ligadas ao cliente **uma a uma**. O de/para de cliente é **impossível** pela API (medido em v1, v2 e v3) | diretor | não, é ciência |
| 6 | **Rotacionar o `AS_MARCA_SAL`** (custo ZERO agora: `as_varredura_vagas` está em 0; depois de ligar passa a custar) | diretor autoriza, fábrica faz | não |
| 7 | **Medir `nome_divulgacao` contra forma de nome de pessoa** (ressalva R1 do `seguranca`). Hoje não há o que medir: `vagas` tem 0 linhas | fábrica, na virada | não |

**Já resolvido e conferido:** credenciais OAuth preenchidas, `AS_MARCA_SAL` preenchido, as **25 linhas**
do de/para de etapa **todas ativas** (inclusive as duas que estavam inativas), a régua de precedência,
as travas de situação e de vaga liberada, a duplicata por transferência, a origem `PANDAPE` e a
retentativa da ponte.

## DIGAI

| # | o que falta | de quem | bloqueia? |
|---|---|---|---|
| 8 | **Pôr o `DIGAI_API_TOKEN` no `.env`** de produção (o token está no disco, em `~/digai-credencial/`, 67 bytes) | **só o diretor autoriza** | **sim** |
| 9 | **`DIGAI_INGESTAO_ATIVA=true`** (libera a escrita no banco) | diretor | **sim** |
| 10 | **`DIGAI_POLLING_ATIVO=true`** (libera a varredura em cadência) | diretor | sim, para o automático |
| 11 | **O filtro de status**, se quiser: excluir `CLOSED`, `QUEUED` e `DRAFT`. Poupa **144 dos 533** screenings por volta e tira 19 vagas mortas da fila. `QUEUED` e `DRAFT` são **112 screenings com ZERO candidato** que o motor varre hoje para não achar nada | diretor decide, fábrica constrói | não |

**Já resolvido:** as 2 linhas do de/para do Digai ativas, o polling dimensionado, o cursor de
screening, e a ponte **não é necessária** (o Digai não alcança `ENVIADO_PARA_ADMISSAO`, é filtrado no
nascimento de propósito).

## A ORDEM QUE EU RECOMENDO

1. Você valida a fila na 3120.
2. A fábrica commita e **publica produção** (item 1). Sem isto nada dos dois funciona.
3. Liga o **Digai** primeiro: ele é o de menor risco, porque não cria vaga nem pré-admissão, e dá
   para medir uma volta antes de ligar o outro.
4. Liga o **Pandapé** (item 3), com o `AS_MARCA_SAL` rotacionado antes.
5. Mede a primeira volta pelo log (`N vaga(s) varrida(s)`, `N divergencia(s)`, `N ponte(s)`) **antes**
   de considerar ligado. Volta que diz zero com o release certo é sinal, não silêncio.

---

## NA HORA DE PUBLICAR: as três medições que não podem ser confiadas ao fonte

O release vai ser **reconstruído inteiro a partir da `main`**, não fast-forward, porque há backend
novo. Isso traz de graça a reversão da senha do iFractal (commit `50e46ea`). Mas **conferir no fonte
não prova nada**: o que vai para o navegador é o chunk, e é nele que uma reversão volta sozinha.

**1. A senha do iFractal está mesmo VISÍVEL no que foi buildado** (receita da sessão que fez a
reversão, e o hash do arquivo muda a cada build, por isso o glob):

```
cd apps/frontend
grep -c 'type:"password"' '.next/static/chunks/app/(app)/esteira/page-'*.js   # tem de dar 0
grep -c 'Senha do iFractal' '.next/static/chunks/app/(app)/esteira/page-'*.js # tem de dar 1
```
Se o segundo der **0**, você pegou o chunk errado, não a prova.

**2. O `apps/frontend/.env.production` do release continua SYMLINK** para o do repositório de
trabalho. Ele não vem do git e some num checkout limpo, e perdê-lo **quebra o botão de WhatsApp do
Portal em silêncio**, porque o build passa igual. Conferir com `ls -la`, não com `git status`.

**3. O `ea-ai-service` roda do CHECKOUT, não do release**, e não se atualiza com commit: o processo
carrega o Python no boot. Conferir `git diff --stat <release-antigo>..HEAD -- apps/ai-service` e, se
mudou, reiniciar e provar pela API (`/openapi.json`, contando as rotas), nunca pelo `git log`.

**ROLLBACK RÁPIDO só do frontend**, deixado pela sessão da reversão:
`ea-release-portal/apps/frontend/.next.bak-30set-senha`. **Não apagar** antes de o diretor validar a
senha na tela: até lá é o único jeito barato de voltar o frontend sem desfazer o backend.

---

## A COTA DO PANDAPÉ NO DIA DA ATIVAÇÃO: medido, e a conta que parecia certa estava errada

O teto do Pandapé é **1.000 requisições por 5 minutos, COMPARTILHADO** com o webhook do G.Infor que
alimenta a folha (§A.5). Excesso do EA pode atrasar a folha, então o número importa.

**CORREÇÃO DE UMA PREMISSA MINHA, e ela era errada nos dois sentidos.** Eu havia estimado que a
varredura gastaria **660 requisições em rajada**, deixando ~340 de folga na janela. **Não é rajada.**
**Quem mediu foi o agente `seguranca`**, na segunda passada de uma auditoria pedida pela sessão do Diagnóstico, feita justamente porque eu passei o 660 e ela pediu o pior caso. A procedência importa e é mais forte que "outra sessão disse": é auditoria adversarial, do agente com poder de veto, sobre um número que ele foi CONFERIR em vez de aceitar. A varredura é **rolante** (um job por página, 250 jobs por janela, cerca de
26 minutos de ciclo dentro da cadência de 30), então o consumo dela é **~127 req/5min medido**, com
teto estrutural de **~265**. A conta do pior caso muda de "quase estourado" para folgado, e foi essa
medição que derrubou um freio que ia ser imposto sem precisar.

**A ARMADILHA DE UNIDADE, que vale para qualquer consumidor novo:** o cabeçalho da fila do Pandapé
apresenta "500 + 250 = 750/5min, 75% do teto" como se fosse conta de **requisição**, e os dois tetos
são de **JOB**. Um `sync-candidate` faz várias chamadas (`getPrecollaborator`, `getMatch`,
`getVacancy`, que por sua vez lista as vagas inteiras, e `getFormulariosDocumentos`), então **500 jobs
não são 500 requisições**. A conta só se sustenta porque o consumo real é muito menor que o teto.
**Ao dimensionar, use o número medido em REQUISIÇÃO, nunca o teto em JOB.**

**O pior caso somado, com a varredura LIGADA**, já contando o consumidor novo do Diagnóstico (busca
de nome no modal da fila degradada, com freio próprio fixo de 150 req/5min que **recusa** o excedente
em vez de enfileirar):

| consumidor | req/5min |
|---|---|
| varredura da ingestão (teto estrutural) | 265 |
| tick e demais caminhos | 33 |
| busca de nome do Diagnóstico (freio fixo) | 150 |
| **total** | **448, ou 45% do teto** |

Sobram **55% para o webhook da folha**. **O dia da ativação NÃO precisa mexer no freio do
Diagnóstico**, e isso é desenho: ele é fixo e não consulta o estado da varredura, justamente porque
freio condicionado ao estado da varredura é o freio que ninguém revê no dia em que ela liga.
