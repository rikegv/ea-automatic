# Mapa de alcance: paginacao no servidor na Central de Candidatos e na aba Ver Candidatos (Vagas)

Frente aprovada pelo diretor (07/10/2026): nunca trazer 83 mil candidatos ao navegador. Paginacao no
servidor nas duas telas, hook compartilhado, carga em segundo plano abandonada, KPIs uma vez por filtro.
Investigacao do arquiteto (read-only) consolidada pelo coordenador. §A.26/§A.27/§A.38.

## 0. As duas telas NAO usam o mesmo endpoint

| | Central de Candidatos | Ver Candidatos (Vagas) |
|---|---|---|
| Arquivo | `app/(app)/as/candidatos/page.tsx` | `components/as/vagas/VagaPainelModal.tsx` (componente local `TabelaCandidaturas`) |
| Endpoint | `POST /as/candidatos/buscar` -> `AsCandidatosPagina` | `GET /as/candidatos/vaga/:vagaId` (`painelVaga`) -> todas as candidaturas da vaga |
| Unidade da linha | PESSOA (projecao minima, SEM PII) | CANDIDATURA (`AsCandidaturaItem` inteiro, PII de UMA vaga autorizada §A.6) |
| Gargalo cliente | carga de fundo (~167 req, 500/pag) acumula ~83k, `visiveis.map` sem virtualizacao | carga local: `JANELA_INICIAL=80`/`JANELA_PASSO=200`, setTimeout, `ord.itens.slice(0, janela)`; `painelDaVaga` ja baixa TODAS (ate 2.509 medidas no ec2ea83) |
| Selecao em massa | nao tem | `selecionados`, "selecionar todos" sobre o conjunto inteiro, `AcoesEmMassaDaVaga` |

O hook compartilhado e GENERICO sobre fetcher, tipo da linha e tipo do KPI. A selecao em massa e concern
OPCIONAL/composavel que so Vagas liga. Nenhuma tela herda peculiaridade da outra.

## 1. Contrato do DTO

### 1.1 Ordenacao (hoje so client-side)
Acrescentar a `BuscarCandidatosDto` e ao espelho `lib/as-candidatos.ts`:
`ordenarPor?: 'candidato'|'vaga'|'cliente'|'cargo'|'etapa'|'situacao'|'ultimoContato'|'criadoEm'` e
`direcao?: 'asc'|'desc'`. `@IsIn` aceitavel (vocabulario FECHADO de colunas). Default ausente => `criadoEm desc`.
Desempate `id desc` SEMPRE anexado. etapa ordena por `as_etapas_funil.ordem`; situacao por
`array_position(CANDIDATURA_SITUACOES, situacao)` (catalogo, nunca alfabetico). Nulos ao FIM nas duas direcoes.

### 1.2 Unidade de paginacao da Central de Candidatos: OPCAO A (decidida pelo coordenador)
`buscar` pagina PESSOAS. Ordenar por coluna de candidatura via valor representativo por pessoa (subconsulta
correlacionada: menor `as_etapas_funil.ordem` entre vivas, `max(ultimoContatoEm)`, etc.). Preserva o contrato
aninhado, `semCandidatura`, "Sem Vaga", card=filtro, escopo e §A.6. So ACRESCENTA ordenacao. (Opcao B, join
linha=candidatura, foi descartada por blast radius.)

### 1.3 KPIs uma vez por filtro
Manter `kpis` DENTRO da resposta do `buscar`, so quando `offset === 0`. Garante por construcao que o filtro do
KPI (`filtros`, base) e o da lista compartilham a mesma expressao (card=filtro nao regride). `offset===0` <=>
filtro mudou. `total` segue via `count(*) over()` em toda pagina (barato); so o group-by pesado e pulado.
`const kpis = (dto.semCandidatura || offset > 0) ? undefined : await this.kpisDaBusca(...)`.

## 2. Hook compartilhado
`usePaginacaoServidor<TLinha,TFiltro,TKpis>`: estado `itens` (SO a pagina atual, nunca acumula), `pagina`,
`total`, `kpis` (cacheado, troca so quando filtro muda), `filtro`, `ordenarPor`/`direcao`; acoes `irParaPagina`,
`proxima`/`anterior`, `setFiltro` (reseta offset=0, refaz KPI), `setOrdenacao` (reseta pagina, NAO refaz KPI).
`useSelecaoServidor` (so Vagas liga): `selecionados: Set`, `todosDoFiltro: boolean`, `quantidadeSelecionada`
(= total do filtro quando todosDoFiltro), `selecionarTodosDoFiltro()` (liga o modo, NAO baixa linhas),
`resolverIds(): Promise<string[]>` (endpoint ids-only, sem PII, so quando a acao dispara).

## 3. Mapeamento das telas
### 3.1 Central de Candidatos (page.tsx)
Remover a carga de fundo inteira (CARGA_*, vistosRef, cargaTimer, baseCarga, useEffect de carga e de descarte,
indicador de progresso). `pessoas` = so a pagina atual. Escopo andamento/historico, cliente e etapa (hoje
client-side) viram predicados server-side no `TFiltro`. `cardAtivo` segue virando `filtroCardEtapa/Situacao`
(mesma regua). `useOrdenacao` client-side sai da lista; cabecalho chama `setOrdenacao`. `ColunaOrdenavel` fica.

### 3.2 Ver Candidatos (VagaPainelModal/TabelaCandidaturas)
Endpoint IRMAO paginado `POST /as/candidatos/vaga/:vagaId/candidaturas` {aba,busca,filtroSituacao,filtroEtapa,
ordenarPor,direcao,offset,limite} -> {itens,total,truncado,resumo?}. `resumo` (ocupacao/funil + contagem por aba)
uma vez por filtro. NAO tocar `painelVaga` (usado por `abrirAcao` e `CandidatosDaVagaModal`). Remover JANELA_*/
setTimeout/slice. Abas e `aplicarRecorte` viram `TFiltro` server-side.
INVARIANTE que nao regride (defeito pego em ec2ea83): "selecionar todos" e as contagens operam sobre o CONJUNTO
INTEIRO do filtro, nunca a pagina. Contagens vem do `resumo`; "selecionar todos" via `todosDoFiltro` + endpoint
ids-only `POST /as/candidatos/vaga/:vagaId/candidaturas/ids` -> `string[]` (UUID, sem PII).

### 3.3 DECIDIDO PELO DIRETOR (07/10): ACAO EM MASSA SEM TETO (opcao ii)
O diretor quer AGIR SOBRE TODOS OS CANDIDATOS DO FILTRO de uma vez, sem o teto de 200, ja nesta frente (para nao
refazer). TODAS as acoes em massa entram, sem excecao: mover etapa/funil, mudar situacao, descartar, vincular a
vaga, e o que mais houver. Desenho:
- MODO "APLICAR A TODOS DO FILTRO": a tela manda o FILTRO (nao a lista de ids) ao servidor; o servidor resolve o
  conjunto inteiro e age sobre ele. O modo "ids marcados" (subconjunto) continua existindo para selecao manual.
- SEM TETO para o modo-filtro: o `AS_MAXIMO_POR_LOTE=200`/`ArrayMaxSize(200)` NAO se aplica a ele. O teto continua
  valendo so para o modo ids-explicitos (lista no corpo), por protecao de payload.
- LOTE INTERNO NO SERVIDOR: o servidor processa em lotes internos (ex. 500 por transacao) para 2.509 nao derrubar
  o backend nem estourar uma transacao gigante. Para o usuario e UMA acao so. O teto de 200 existia por um motivo
  (payload/carga), entao o cuidado e processar em blocos, nao recusar.
- TRANSACIONAL COM RELATO DE FALHA PARCIAL: se falhar no meio, dizer quantos foram feitos e quantos nao, nunca
  deixar metade em silencio. (Lote por lote transacional; o retorno soma afetados e reporta o que faltou.)
- RBAC MANTIDO EM MASSA (§A.38): quem nao pode descartar nao descarta, mesmo no modo-filtro. A autorizacao e a
  MESMA da acao unitaria, aplicada ao conjunto. O `seguranca` valida isso e que o filtro nao vaza PII.
- SEM BLOQUEIO, SEM CONFIRMACAO DE SEGURANCA (decisao do diretor: "o time e responsavel, a ferramenta nao trava por
  medo de erro"). O controle e do time.

### 3.4 AVISO E ANIMACAO (o unico cuidado pedido, nao e bloqueio)
- Ao disparar uma acao em massa grande, AVISAR do tempo pelo volume. Texto §A.11 (sem travessao) e §A.24 (title
  case nos titulos/tags): ex. aviso "A Movimentacao De 2.509 Candidatos Pode Levar Alguns Instantes" (titulo/tag em
  title case); frase de apoio em escrita normal.
- ANIMACAO de carregamento enquanto processa (nao parece travado).
- Ao terminar, CONFIRMAR quantos foram afetados ("2.509 Candidatos Movidos").

### 3.5 Fora desta frente
`CandidatosDaVagaModal`/`painelVaga` (modal de visualizacao simples) ficam FORA (nao sao a aba Ver Candidatos).
Confirmar com o diretor se tambem incomodam.

## 4. Migration do indice (aditiva, idempotente)
`drizzle/0147_idx_as_candidaturas_kpi.sql`: `CREATE INDEX IF NOT EXISTS idx_as_candidaturas_situacao_etapa ON
as_candidaturas (situacao, etapa);` Serve os dois group-bys do `kpisDaBusca`. Conferir a marca-d'agua do `when`
acima da ultima aplicada em prod e homolog.

## 5. Arquivos, recorte nominal
- shared-types (DONO=COORDENADOR, serializar com a frente de pre-preenchimento): `packages/shared-types/src/index.ts`.
- backend: `candidatos.dto.ts` (ordenacao + novo DTO da vaga), `candidatos.service.ts` (buscar: ordenacao+gate KPI;
  novo metodo paginado da vaga + resumo; metodo ids-only; NAO tocar `painelVaga`), `candidatos.controller.ts`
  (rotas novas, RBAC igual ao painelVaga), `drizzle/0147_*.sql` + `_journal.json`. Specs a ATUALIZAR (nunca apagar):
  busca-kpis, busca-funil-paginacao, busca-funil-pedido-e-ordem, filtro-de-card, central-candidatos.kpi-da-base;
  novo spec de ordenacao por catalogo.
- frontend: `lib/as-candidatos.ts` (ordenacao + funcoes da vaga), NOVOS `lib/usePaginacaoServidor.ts` e
  `useSelecaoServidor.ts`, `as/candidatos/page.tsx`, `components/as/vagas/VagaPainelModal.tsx`,
  `AcoesEmMassaDaVaga.tsx` (conforme 3.3). Specs a ATUALIZAR (nunca apagar): `VagaPainelModal.janela-e-selecao`
  (SUBSTITUIR a assercao "so 80 / seleciona 150" por equivalente server-side), `VagaPainelModal.recorte-e-selecao`,
  `AcoesEmMassaDaVaga`, `CandidatosDisponiveisDaVaga`.
- NAO TOCAR: `semCandidatura:true` (3 modais de alocacao, default preservado), `painelVaga`/`CandidatosDaVagaModal`,
  Esteira, Gerenciador. Arquivos da pre-preenchimento (PropostaDeClienteDaPlanilha, as-planilha-*, depara-cliente,
  TrilhaDaVaga).

## 6. Riscos de regressao
1. card=filtro: KPIs sempre sobre `filtros` (base), nunca `filtrosLista`. Co-locar no `buscar` garante.
2. Escopo andamento/historico server-side: entra na lista E no filtro base dos KPIs, senao card discorda da tabela.
   A linha "sem funil" fica em andamento (equivalente server-side explicito).
3. `semCandidatura` intacto: ordenacao ausente preserva `criadoEm desc`, KPI segue undefined, modais sem PII nova.
4. Invariante "selecionar todos sobre o conjunto inteiro" (Vagas): `todosDoFiltro` + ids-only + resumo. Substituir
   (nao apagar) a assercao do spec.
5. Teto 200 x vaga grande (3.3): decisao do diretor.
6. Ordenacao por catalogo: etapa por `ordem`, situacao por `array_position`, nulos ao fim. Novo spec.
7. Paginacao estavel: desempate `id desc` sempre.
8. §A.38 seguranca antes do deploy: projecao de Candidatos sem CPF/PII, ids-only so UUID, nada pessoal na URL
   (tudo POST/corpo), autorizacao dos endpoints novos espelha `painelVaga`.

## 7. Ordem de construcao (§A.40, menos rodadas seriais)
- R0 (coordenador): fechar 1.2 (A, decidido) e 3.3 (diretor); escrever shared-types (serializar com pre-preenchimento).
- R1 (paralela): backend (ordenacao + gate KPI + indice + endpoints da vaga); tester JUNTO (specs que devem falhar:
  ordenacao por catalogo, KPI uma vez, selecionar-todos-do-filtro, card=filtro); frontend-hook (generico, contra o contrato).
- R2 (paralela): frontend-candidatos (page.tsx) e frontend-vagas (VagaPainelModal + AcoesEmMassa).
- R3 (serial): consolidar conferindo; seguranca (§A.38); suite completa 1x; prova visual §A.13/§A.20 nas duas telas
  na 3120 com volume real; publicar §A.49.
