# O ARQUIVADOR DO PORTAL (Desenho 1): construção, as 6 condições e os vereditos

**Frente:** Prontuário Drive. **Estado:** CONSTRUÍDO E INERTE (sem o binding do diretor nada roda).
Nada publicado, nada em produção. **Régua:** §A.6, §A.14, §A.26, §A.38, §A.39, §A.49.

## O problema e o conserto (resumo)

Documento entregue pelo Portal vivia só no balde de entrada e nunca chegava ao prontuário do Drive:
o leitor lê o balde mas NÃO tem Drive (VS3), e o arquivador da esteira tem Drive mas lê só a staging
local. O conserto (Desenho 1, aprovado pelo diretor) é uma TERCEIRA instância magra do `ai-service`,
a conta "cega" `ea-portal-arquivador`, que lê o balde e copia os bytes para a árvore do prontuário,
sem interpretar, por compartilhamento de pasta (sem delegação domain-wide). Depende de um binding de
IAM que só o Rike roda (`docs/PLANO-ARQUIVADOR-PORTAL.md`).

## O que foi construído (inerte)

**ai-service (a instância arquivadora reusa o mesmo código, com papel próprio):**
- `app/config.py`: `PORTAL_PAPEL` + `is_arquivador`.
- `app/portal_papel.py`: a guarda V3 (duas dependências de papel).
- `app/routers/portal_arquivar.py`: `POST /portal/arquivar`, cego, lê o balde em memória e sobe ao
  Drive reusando `app.drive` (âncora, dedup md5, subpasta). Allowlist de um balde só. INERTE sem
  `PORTAL_PAPEL=ARQUIVADOR` (403) e sem `PORTAL_BUCKET` (503).
- `app/routers/portal.py`: 1 linha, a guarda V3 no `/portal/ler` (recusa na instância arquivadora).
- `app/schemas.py`: `PortalArquivarRequest` / `PortalObjetoIn`.
- `tests/test_portal_arquivar.py`: 11 testes.

**backend:**
- `src/portal/portal-arquivador.service.ts`: cliente da 3ª instância (`PORTAL_ARQUIVADOR_URL`/
  `TOKEN`), irmão do `PortalLeitorService`. INERTE sem as duas variáveis.
- `src/portal/portal-arquivamento.service.ts`: orquestrador. Resolve a pasta do prontuário IGUAL à
  esteira (`DrivePastaPaiService`, `montarNomePasta`, âncora, `resolveSubpasta`), monta os objetos
  confirmados e manda copiar. `armado()` = flag + cliente + balde. Self-heal de `drive_pasta_url`.
- `src/portal/portal-credencial.service.ts`: gatilho LIVE no ramo VALIDADO->ENTREGUE (dep
  `@Optional()`, chamada `?.`, best-effort, inerte sem armar).
- `src/portal/portal.module.ts`: providers novos + `DrivePastaPaiService`.
- `src/db/rearquiva-portal.ts`: runner retro, idempotente, dry por padrão, exclui Fabricio e
  encerrados.
- `src/portal/portal-arquivamento.service.spec.ts`: 12 testes.

## AS 6 CONDIÇÕES DO DESENHO 1 (como o código as cumpre)

1. **Arquivador CEGO, sem parser.** `portal_arquivar.py` não importa `gemini` nem `portal_extracao`,
   não chama o Vertex, não interpreta. Copia bytes. Travado em teste
   (`test_modulo_e_cego_nao_importa_gemini_nem_staging`).
2. **A chave não é legível pelo leitor, nem a do leitor pelo arquivador.** Variáveis próprias sem
   fallback (`PORTAL_ARQUIVADOR_URL`/`TOKEN`, credencial SA própria por caminho absoluto fora do
   repo). A chave de escrita do Drive nunca vive no processo que abre arquivo hostil.
3. **Guarda V3 (separação de papel).** `/portal/arquivar` só na instância ARQUIVADOR; `/portal/ler`
   recusado NELA, antes de baixar byte. `portal_papel.py`, testado nos dois sentidos.
4. **§A.6.** Nome de objeto, nome e CPF nunca logados; só contagens e ids de pasta. Binário só em
   memória, nunca disco/banco/log. Testado (`test_nao_loga_nome_de_objeto_nem_pessoa`).
5. **Drive só ADITIVO, árvore do prontuário só.** Reusa o contrato de `app/drive.py` (list/create/
   upload; nunca delete/update/move/rename/permissions). SA Editor só nas 13 pastas-pai, sem
   delegação. Allowlist de um balde só.
6. **Inerte sem binding.** 403/503 na rota sem papel/balde; cliente "não configurado" no backend;
   gatilho LIVE no-op sem `PORTAL_ARQUIVAMENTO_ARMADO=true`; runner recusa sem cliente. Nada toca
   produção sem (a)(b)(c)(d).

## RISCO ABERTO a confirmar com o diretor (§A.27)

A conta pura (sem delegação) só escreve em pasta de **Drive compartilhado**. Se a árvore do
prontuário for **Meu Drive** (hoje a operação escreve lá por delegação de `admin.soulan@`), a conta
pura é recusada com `storageQuotaExceeded`. Ver o box em `docs/PLANO-ARQUIVADOR-PORTAL.md`.

## ACRÉSCIMO: documento do Portal na tela de Auditoria (conta cega)

Decisão do diretor (o antigo "exibir cruza isolamento" virou "exibir PELA conta cega"). O time abre e
vê, na Auditoria, o documento anexado pelo candidato, lido pela MESMA conta cega. Construído INERTE:
- ai-service: `POST /portal/documento` (`routers/portal_arquivar.py`) devolve os bytes do objeto,
  cego, atrás da guarda de papel ARQUIVADOR; schema `PortalDocumentoRequest`.
- backend: `portal-documento-visualizacao.service.ts` (conta cega lista/baixa, exportado do
  PortalModule), `portal-arquivador.service.ts#baixarDocumento`, e o FALLBACK transparente em
  `reauditoria/documento-arquivo.service.ts` (`listarArquivos`/`abrirArquivo`): quando a staging não
  tem o arquivo e a conta cega está ligada, a MESMA tela de Auditoria serve o objeto do balde. **Zero
  mudança de frontend** (o modal de documentos já lista por índice e abre inline); por isso a prova
  §A.13 é em teste (`documento-arquivo.portal-view.spec.ts`), e produção acende com o binding.
- **Não exige papel novo:** a visualização só LÊ o balde, com o `storage.objectViewer` de (b). O VS3
  fica intacto: o backend da operação nunca recebe chave do balde, só PEDE bytes à instância cega.

## VEREDITO DA SEGURANÇA (§A.38, adversarial)

**Arquivador + reprocesso: APROVADO, ZERO VETOS.** O `seguranca` tentou provar violação das 6
condições e não conseguiu: inerte por construção, sem PII em log/erro/exceção, sem disco no caminho
do arquivador, Drive só aditivo, separação de papel travada em código e em teste. Rodou as suítes (11
ai-service + 12 backend verdes). As 5 ressalvas são de BINDING (etapa do diretor, §A.0), não vetos:
(1) credencial da instância por caminho ABSOLUTO; (2) a SA `ea-portal-arquivador` sem papel de
Vertex/`aiplatform` e o `.env` magro sem `DATABASE_URL`; (3) `DRIVE_DELEGATED_SUBJECT` ausente; (4)
nota menor de que a cegueira do arquivador vem da ESCOLHA de funções (reusa `app.drive`, que importa
a staging no topo), um grau mais fraca que a do leitor, aceitável; (5) o risco Shared Drive vs. Meu
Drive. (1)(2)(3)(5) já estão no `PLANO-ARQUIVADOR-PORTAL.md`.

**Acréscimo (visualização na Auditoria): APROVADO, ZERO VETOS.** O `seguranca` tentou provar violação
nos 5 pontos e não achou bloqueante: (1) VS3 intacto, a conta cega lê para exibir sem interpretar,
atrás das duas guardas (token + papel), e o backend da operação nunca recebe credencial do balde, só
pede bytes à instância cega; (2) §A.6, nenhum log/erro carrega objeto/PII, binário só em memória, e o
`nomeExibicao` vem do TIPO (não do nome do candidato); (3) inerte sem binding (403/503 na rota,
`disponivel()` falso → fallback no-op → "indisponível" de hoje, inclusive com a dep `@Optional()`
undefined); (4) teto de bytes + allowlist de um balde só; (5) só leitura, sem novo poder de escrita,
e o índice casa entre `listar`/`abrir` (ordem determinística, staging e Portal nunca se misturam).
2 recomendações não-veto: registrar no PLANO que a visualização não pede IAM novo (FEITO) e ciência
do custo de banda por clique (10 MB). **Não exige nada novo no binding.**

## ESTADO DOS TESTES (tester independente, §A.38)

**NENHUM defeito de código.** O `tester` (que não escreveu o código) revisou a cobertura contra o
requisito e escreveu 19 testes independentes (3 ai-service + 16 backend), todos verdes, cobrindo 7
gaps que o teste do autor não pegava: dedup md5 em lote, lote parcial (ai-service e propagado pelo
backend), subpasta por tipo, §A.6 no backend, `configurado()` real do cliente, e o de maior valor, o
gatilho LIVE só disparar em ENTREGUE (não em suspeito/INCONFORME/PENDENTE). Um gap remanescente (a
régua de exclusão do runner, Fabricio + encerrados, vivia inline sem teste) foi **FECHADO** extraindo
`domain/portal-reprocesso-lote.ts` (puro, 7 testes) e importando as constantes no runner.

**Totais verdes:** ai-service 16 (arquivador + visualização) + 14 (autor+tester) na suíte do portal;
backend: `portal-arquivamento` 12, `portal-arquivamento.tester` 12, `portal-gatilho-live.tester` 4,
`portal-reprocesso-lote` 7, `portal-documento-visualizacao` 6, `documento-arquivo.portal-view` 4,
reauditoria 49 (sem regressão), portal inteiro 1434 (1 red PRÉ-EXISTENTE de origin/main, não da
frente). typecheck 0, lint 0.
