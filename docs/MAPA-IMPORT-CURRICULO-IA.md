# MAPA — Import de currículo por IA na Central de Candidatos (PDF + Word)

> Descoberta (§A.39 passo 1 / §A.40 regra 1), feita ANTES de construir. Fatos medidos no código em
> 08/10/2026 por três agentes de mapeamento (frontend, backend, ai-service), consolidados pelo
> coordenador. As DECISÕES do diretor que destravam a construção estão no fim.

## Escopo pedido (COMANDO)
Importar candidato por **currículo PDF (.pdf) e Word (.docx)** na Central de Candidatos, ao lado do
import por planilha (sem tocar no fluxo de planilha). Lote (vários de uma vez). A IA extrai os campos
que o currículo tiver (nome, e-mail, telefone e os demais do catálogo de candidato). **Vários
telefones**: cadastrar todos. Campo ausente: deixa em branco, segue. Antes de cadastrar, passar pela
**mesma validação/de-para** da planilha. Reusar a **mesma linha de IA** (Vertex/Gemini) já no ar.

## Fluxo da planilha hoje (o que existe)
- **Frontend:** `apps/frontend/src/components/as/candidatos/ImportarCandidatosModal.tsx` — modal de 5
  passos: `cenário → upload → de-para → confirmar → resultado`. A de-para é **inline no modal** (linhas
  504-591), **não é componente reusável**.
- **Caminho da chamada:** Frontend → **Backend** → ai-service (server-to-server, não o front direto).
  - `POST /as/candidatos/importar/previa` e `/aplicar` (`candidatos.controller.ts:550-610`).
  - Backend parseia a planilha, manda **cabeçalho + amostra (≤15 linhas)** ao ai-service
    `POST /planilha/mapear-colunas-candidato` (`ai-client.service.ts:358`), header `X-Internal-Token`.
  - A IA devolve **ÍNDICES DE COLUNA** (qual coluna é nome/cpf/…), não valores. Backend aplica o mapa
    determinístico e persiste por `CandidatosService.criar` (dedup por CPF, link de vaga).
- **O papel da IA na planilha é MAPEAR COLUNA, não extrair valor.**

## A linha de IA que o comando manda reusar (ai-service)
- **Extração de VALOR a partir de PDF já existe e é reusável:** `auditar_documento` (`gemini.py:437`)
  manda PDF/imagem como `types.Part.from_bytes` ao **mesmo** Gemini multimodal (`gemini-2.5-flash`,
  projeto `ea-v2-automatic`), com schema dinâmico a partir do catálogo `CAMPOS_POR_TIPO`
  (`portal_extracao.py:63`) e a regra "nunca inventa, vazio é a resposta certa" já embutida
  (`_EXTRACAO_SYSTEM`). Normalização deixa campo não lido **em branco** (`lido=False`) — exatamente o
  comportamento pedido para campo ausente.
- **Credencial/serviço de prod: NENHUM novo.** Mesma service account `ea-v2-automatic`, mesmo Vertex,
  mesmo modelo. Extração de currículo PDF **não** pede credencial, projeto nem API nova. (Resposta
  direta ao "reportar antes se faltar credencial": não falta.)

## Reuso de verdade (zero mudança)
Transporte `AI_SERVICE_URL`/`X-Internal-Token`; staging efêmera em memória + `buffer.fill(0)` (§A.6);
teto de 10 MB do upload (`planilha/upload.ts`); `CandidatosService.criar`/`adicionarEmLote` (escrita +
dedup por CPF + link de vaga). O cenário SEM_VAGA/COM_VAGA e o passo de resultado também reaproveitam.

## Pontos que NÃO dão para reusar como estão (fatos, não opinião)
1. **A de-para da planilha é MAPEADOR DE COLUNA; currículo não tem coluna.** O endpoint de IA
   (`mapear-colunas-candidato`) e os DTOs (`MapaColunasCandidato`, `assinaturaCabecalho`) são
   tabulares. Para currículo é preciso **extração de VALOR** (campo → valor lido), não índice de
   coluna. Logo: novo endpoint no ai-service + novo método no `AiClientService` + um passo de
   **revisão de valor** (campo → valor editável) no mesmo modal. → **Decisão 1.**
2. **Telefone é ÚNICO em todas as camadas:** DB `as_candidatos.telefone varchar(40)`
   (`tables.ts:4217`), DTOs `@MaxLength(40)`, shared-types `telefone: string|null`, ficha e
   `NovoCandidatoModal` com um só campo. Não existe array nem tabela `as_candidato_telefones`.
   "Cadastrar todos os telefones" **toca o modelo de candidato já validado** (§A.26). → **Decisão 2.**
3. **DOCX não é lido por nada:** ai-service só aceita mime pdf/jpeg/png (`gemini.py:268-306`) e o Gemini
   não ingere `.docx` nativo; o `leitor.ts` do backend ainda **confundiria .docx (ZIP/PK) com xlsx**.
   Correção: adicionar `python-docx` ao ai-service (extrai o texto → manda como `Part.from_text`, mesmo
   structured output) e **desviar o upload de currículo do leitor de planilha**. É **pacote Python**, não
   credencial. Não trava, mas o `uv.lock` entra no commit.

## Catálogo de campos de candidato (default proposto, sem decisão nova)
O modelo real do candidato A&S é: `nome, cpf, email, telefone(s), dataNascimento, cidade, uf` (origem
IMPORTACAO). É esse o conjunto que a extração do currículo vai mirar ("os demais do catálogo" = cpf,
nascimento, cidade, uf). Não há catálogo maior escondido.

## Prova visual (§A.13) e §A.6 — como honro o "currículos reais"
A asserção de população do arnês de captura **recusa o lote** se achar linha não-sintética, e a régua
(§A.6/§A.43/§A.44/§A.46) proíbe pessoa real em print versionado. Então a **prova versionada** usa
**currículos sintéticos declarados** (CPF de família reservada com verificador válido, e-mail de
domínio de homolog, nomes fora do léxico real), montados com o que o comando pede exercitar: **PDF e
DOCX, um com dois telefones, um com campo faltando**. O diretor pode, além disso, jogar um currículo
real na 3120 e olhar ao vivo (homolog exercita o fluxo real); o que não entra em imagem versionada é
pessoa real. Isso cumpre o teste pedido sem violar a régua de PII.

## Plano de construção (após as decisões)
1. **ia:** router novo `curriculo` no ai-service (PDF direto; .docx via `python-docx`), reusando
   `auditar_documento`/`portal_extracao` com um tipo `CURRICULO`; structured output; sem PII em log.
2. **backend:** endpoints `previa`/`aplicar` de currículo (lote), desviando do `leitor.ts`; novo método
   `AiClientService.extrairCurriculo`; persistência pelo `CandidatosService.criar` existente;
   (se Decisão 2) migração de telefone múltiplo + DTOs.
3. **frontend:** branch de currículo no `ImportarCandidatosModal` com passo de revisão de valor
   (editável), reusando cenário/registro; (se Decisão 2) UI de N telefones.
4. **seguranca** (§A.38, obrigatório: toca CPF/dado pessoal) + **tester** independente.
5. Semear currículos sintéticos na 3120, capturar a de-para (§A.13), reportar ao diretor. Sem
   commit/publicação até a validação visual (§A.25).

---

## RESULTADO DA CONSTRUÇÃO (08/10/2026) — PRONTO, mas a prova na 3120 está BLOQUEADA

Construído distribuído (§A.39): coordenador escreveu o contrato compartilhado (`shared-types`) e
despachou ia + backend + frontend em paralelo; depois seguranca + tester (independentes, §A.38).

### O que foi entregue (tudo no working tree de `main`, NÃO commitado, §A.25)
- **ai-service:** `POST /curriculo/extrair` (router `app/routers/curriculo.py`, `app/curriculo.py`,
  `gemini.extrair_curriculo`, `schemas`, `main.py`). PDF direto no mesmo Gemini multimodal; `.docx`
  via `python-docx` (parágrafos + tabelas) → texto. `telefones` é ARRAY no schema. Campo não lido =
  vazio. Arquivo ruim = 200 com `erroLeitura` (não derruba o lote); quota/credencial = 429/503. Dep
  nova: `python-docx` (pyproject + uv.lock). Sem PII em log.
- **backend:** `POST /as/candidatos/importar-curriculo/previa` (lote, N arquivos, concorrência 4,
  teto 10MB por arquivo, allowlist pdf/docx, bypass do `leitor.ts` de planilha, `buffer.fill(0)`) e
  `/aplicar` (JSON, grava por `CandidatosService.criar`, dedup por CPF, link de vaga COM_VAGA).
  Migração `0153` (`telefones text[] not null default '{}'` + backfill `[telefone]`). `criar` deriva
  `telefone = telefones[0]`; `ficha` devolve `telefones`. Anonimização (`retencao`) limpa `telefones`
  nos dois caminhos de expurgo (+ guard simétrico, recomendação da auditoria). Novo
  `AiClientService.extrairCurriculo`.
- **frontend:** ramo de currículo no MESMO `ImportarCandidatosModal` (seletor "Origem Dos Dados";
  planilha intacta). Passo de **revisão de valor**: 1 linha por currículo, células editáveis, editor
  de N telefones, marca de confiança, aviso de `erroLeitura`. §A.11/A.35/A.41/A.24/A.12/A.20/A.29.
- **shared-types (coordenador):** `CandidatoCurriculo`, `ItemPreviaCurriculo`, `PreviaImportCurriculo`,
  `AplicarImportCurriculo`, `ResultadoImportCurriculo`, `CAMPOS_ESCALARES_CURRICULO`,
  `AsCandidatoFicha.telefones`.
- **cross-impact corrigido (coordenador):** o roteiro de captura `importar-candidatos-de-planilha`
  ganhou o clique "Planilha" antes de "Sem Vaga" (o seletor novo deixava o "Avançar" desabilitado).

### Auditorias (§A.38)
- **seguranca: APROVADO**, 7 pontos com evidência file:linha (sem PII em log, binário efêmero/zerado
  em todo caminho, teto+allowlist, RBAC pelo MenuGuard, anonimização limpa `telefones`, payload
  minimizado, X-Internal-Token). Uma recomendação não-bloqueante de endurecimento, JÁ APLICADA.
- **tester: coberto R1–R6**, fechou 2 gaps (lote > concorrência; INSERT grava telefone E a lista) e
  **pegou um build-breaker** (backticks num comentário SQL dentro de template literal, introduzido
  pela aplicação da recomendação da auditoria). **Corrigido**; specs afetados reverdes: 19/19.

### Gates (medidos)
- typecheck: shared-types + backend + frontend verdes (backend re-rodado após o conserto).
- ai-service: `pytest` 321 passed; `ruff` limpo nos arquivos da frente.
- backend afetados: `candidatos-import-curriculo` 10, `telefone-multiplo` 5, novo do tester 4 = 19/19.
- frontend: `ImportarCandidatosModal` 8/8.

### PROPOSTAS registradas (§A.31, NÃO construídas — decisão do diretor)
1. **ATS (DIGAI/Pandapé) gravam só o escalar `telefone` por SQL cru**, então candidato vindo da ATS
   nasce com `telefones=[]` (o espelho `telefone=telefones[0]` fica torto para esses). Alinhar mexe em
   repos de ingestão validados, asseridos por tester-fakes de segurança. Fora do escopo desta OST.
2. **O modal de edição de candidato edita só um telefone**; editar o telefone de um candidato vindo de
   currículo pode descolar `telefones[0]` do `telefone`. Tornar a edição multi-telefone é frente
   própria (DTO + tela). Fora do escopo.

### BLOQUEIO da prova visual (§A.13) na 3120 — precisa do diretor (§A.32/§A.42)
A homologação é ÚNICA (3120) e o worktree que a serve (`apps/ea-homolog`, branch `main-nova`) está
**ocupado por OUTRA sessão**: 518 arquivos não-commitados de uma frente em andamento, que tocam os
MESMOS arquivos desta (`candidatos.controller.ts`, `candidatos.service.ts`, `ai-client.service.ts`,
`as.module.ts`, `ai-service/app/main.py`). Subir esta frente lá por cima apagaria o trabalho da outra
sessão (§A.39 dono único). Além disso o `main-nova` está 66 commits atrás do `main`. §A.32 proíbe
subir ambiente separado sem avisar antes. Logo a prova depende de uma decisão de sequenciamento do
diretor (ver as opções no relatório).

### DECISÃO DO DIRETOR (08/10/2026): ESPERAR a 3120 liberar
Corrigida a premissa (a ea-homolog tem WIP vivo de VÁRIAS sessões, editado hoje 12:20: Alto Volume,
Vagas, DIGAI, Grupos de Cliente), o diretor optou por ESPERAR. A frente fica pronta e parada. NÃO
resetar a ea-homolog, NÃO fundir nos arquivos das outras sessões. Gatilho de retomada: **o diretor
avisar que a 3120 liberou**. Sem polling, sem auto-deploy.

### RUNBOOK (executar SÓ quando o diretor avisar que a 3120/ea-homolog liberou e estiver LIMPA)
1. `git -C /home/henrique/apps/ea-homolog status --porcelain` → tem de estar VAZIO. Se não estiver,
   PARAR e avisar (ainda tem sessão lá).
2. Atualizar a worktree para o código atual: `git -C apps/ea-homolog merge --ff-only main` (main-nova
   é ancestral de main; se não fizer ff, reportar em vez de forçar).
3. Trazer ESTA frente (hoje não-commitada no tree de `main`/ea-automatic) para a ea-homolog. Como
   estará commitada no main quando o diretor validar? NÃO: a validação vem ANTES do commit (§A.25).
   Então transferir as mudanças não-commitadas: aplicar o diff desta frente
   (`git -C apps/ea-automatic diff` dos arquivos da frente) na ea-homolog, OU copiar os arquivos da
   frente. Conferir que a ea-homolog ficou idêntica aos arquivos da frente.
4. ai-service homolog (porta 8001, código em `apps/ea-homolog/apps/ai-service`, venv própria):
   instalar `python-docx` na venv (`uv sync` no diretório, ou pip na `.venv`), restart
   `ea-homolog-ai-service`. Conferir `GET 127.0.0.1:8001/openapi.json` lista `/curriculo/extrair`.
5. Migração do banco de homolog (`ea_automatic_homolog`, container `ea-db` 5433): aplicar a `0153`
   (coluna `telefones text[]` + backfill) **MANUALMENTE, aditiva/idempotente, SEM registrar na
   tabela de controle do drizzle** (intel da sessão de Vagas, 08/10: registrar eleva a marca d'água
   e faz as migrations de outras frentes, com carimbo menor, serem puladas em silêncio; o homolog
   está ~11 atrás). Conferir a coluna existe.
6. Build + restart (README infra/homolog): `pnpm --filter @ea/shared-types build && pnpm --filter
   @ea/backend build`; `cd apps/frontend && BACKEND_ORIGIN=http://127.0.0.1:3111 pnpm build`; restart
   `ea-homolog-backend ea-homolog-frontend`. `BACKEND_ORIGIN` é obrigatório (senão aponta para prod).
7. Rodar a suíte cheia uma vez (§A.40 regra 4) antes da prova.
8. Prova (§A.13): login de teste na 3120, abrir Central de Candidatos → Importar → Origem "Currículo",
   subir os 4 currículos sintéticos (em
   `/tmp/claude-1001/.../scratchpad/curriculos/`: A.pdf 2 telefones, B.docx sem e-mail, C.pdf sem
   cidade, D.docx 2 telefones), aguardar a leitura da IA, screenshot da tela de REVISÃO mostrando os
   dados lidos (2 telefones num, campo em branco noutro). Prova = revisão ANTES de cadastrar (não
   precisa persistir; se persistir, apagar depois, §A.43). Sem pessoa real no print (§A.6/§A.46).
9. Entregar a prova ao diretor. Só após a validação visual dele: commit (recorte §A.14), push e
   publicação em produção pelo worktree limpo (§A.21/§A.25/§A.49).

### NOTAS OPERACIONAIS DA 3120 (intel das sessões vizinhas, 08/10 — confirmado por elas)
- **Homolog é COMPARTILHADA por desenho (§A.32):** não fica limpa, sessões convivem com o WIP de
  todas. O método é copiar SÓ os arquivos da própria frente, rebuildar e reiniciar, **serializando
  o restart** com quem estiver na janela (avisar ao tomar e ao devolver).
- **BOTH trees are shared piles:** `ea-automatic` (main) tem ~268 arquivos não-commitados de várias
  sessões; `ea-homolog` (main-nova, 66 atrás) idem. Por isso o commit desta frente é `git add`
  NOMINAL, arquivo por arquivo (§A.14), e a produção sobe do worktree limpo `ea-build` (§A.49).
- **Vagas liberou:** removeu o WIP dela da ea-homolog (restaurou `as.module.ts`, que era a colisão).
  Dono em aberto: o grosso de `as/vagas` + `components/as` + `Combobox` + `etapas-funil`. Coexistir.
- **BACKEND_ORIGIN obrigatório no build do frontend:** `BACKEND_ORIGIN=http://127.0.0.1:3111 pnpm
  build`. O Next assa o rewrite no BUILD; sem isso aponta para o backend de PRODUÇÃO (3011) e a 3120
  inteira dá 403 (de todas as frentes). Conferir: `grep -o "127.0.0.1:31[0-9][0-9]"
  apps/frontend/.next/routes-manifest.json` tem de mostrar 3111.
- **Playwright nesta VM:** só sobe pelo `chrome-headless-shell` com
  `LD_LIBRARY_PATH=/home/henrique/.ea-chrome-libs/ext/usr/lib/x86_64-linux-gnu` (12 libs já lá). O
  chrome completo não sobe, não há sudo. Arnês de exemplo em `~/ost-depara-cliente-prints/` e
  `~/ost-alto-volume-grupo-prints/`.
- **Login de teste / senha da homolog:** usuários da homolog têm a senha passada em `HML_SENHA` ao
  rodar `infra/homolog/clonar.sh` (ver `infra/homolog/senha-homolog.mjs`).
