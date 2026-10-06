# Diagnóstico da Central de Candidatos (06/10/2026)

Só medição (§A.14), contra a produção (`ea_automatic`) e o código servido. Nada construído.
Pedido do diretor: entender o comportamento antes de qualquer construção.

## Números da base (medidos agora)

| | |
|---|---|
| candidatos de A&S | **81.024** |
| candidatos com candidatura | 81.024 (todos) |
| candidaturas | 107.468 |
| candidaturas com `vaga_id` | **107.468 (100%)** |
| candidaturas por etapa | CAPTACAO 101.897 (95%), TRIAGEM 4.907, APROVACAO 394, resto < 200 |
| candidaturas por situação | ATIVO 103.511 (96%), DESCARTADO 3.563, ENVIADO_PARA_ADMISSAO 394 |
| candidatos cuja vaga tem CLIENTE | **4.789 (6%)** |
| candidatos cuja vaga tem CARGO | **24.148 (30%)** |
| candidatos em vaga LIBERADA (aparece em `/as/vagas`) | 4.918 (6%) |

## 1. Por que só ~201 aparecem

**É o tamanho da PÁGINA, não um filtro.** O `buscar` tem `BUSCA_LIMITE_PADRAO = 200`
(`candidatos.dto.ts:210`), aplicado em `candidatos.service.ts:568`. A tela abre mandando corpo VAZIO
(`page.tsx:208`, sem `limite`/`offset`), então o backend devolve as **200** primeiras (ordenadas por
`criadoEm desc`) de 81.024, mais o `total` real e `truncado=true`. **Não há filtro de negócio nenhum**
(sem cláusula por status, origem, etapa ou vaga liberada quando o corpo vem vazio,
`candidatos.service.ts:571,701`). O "201" é 200 + provável off-by-one de exibição. **A tela NÃO
pagina nem carrega mais:** mostra o lote de 200 e orienta a refinar a busca (`as-candidatos.ts:109`).

Medido na produção: `POST /as/candidatos/buscar` foi chamado 62 vezes hoje, **todas 200, zero 429**.

## 2. "Cliente/cargo não informado", "Captação", "Em Seleção"

**Etapa e situação são REAIS, não default.** CAPTACAO (95%) e ATIVO (96%, rotulado "Em Seleção") são o
estado de verdade: a varredura do Pandapé despeja o candidato na etapa inicial do funil. Não há
fallback "Captação"/"Em Seleção" escrito na tela (confirmado: zero literal desses na página; o
`DEFAULT 'CAPTACAO'` da coluna foi removido na migration 0100). A etapa vem de `as_candidaturas.etapa`
e a situação de `as_candidaturas.situacao` (default de coluna `ATIVO`), pela segunda consulta do
`buscar` (`funilDaPagina`, `candidatos.service.ts:3696`).

**Cliente e cargo: é DADO FALTANDO na maioria, E uma regressão de leitura que eu causei hoje.**
- **O `buscar` NÃO envia cliente nem cargo** (`AsCandidatoListItem` não tem esses campos,
  `shared-types:3081`). A tela os resolve CRUZANDO a `vagaId` de cada candidatura contra o mapa de
  `GET /as/vagas` (`page.tsx:350,911-924`): `l.vaga?.clienteNome ?? "não informado"`.
- **Dado faltando (a maior parte):** a vaga de 94% dos candidatos é um espelho do Pandapé em
  PENDENTE_REVISAO, que **não tem cliente** (o cliente só é definido quando alguém revisa e libera a
  vaga). Então "cliente não informado" é REAL para eles. Os **3 candidatos medidos** (Samara, Daniela,
  Bianca, as 3 mais recentes da página 1) têm vaga em REVISAO com `cod_cliente` NULO e `cargo_id` NULO:
  o dado não existe na origem.
- **Regressão de leitura (minha, hoje):** como cliente/cargo vêm do mapa de `/as/vagas`, e a frente da
  Central de Vagas (que subi hoje 15:31) fez `/as/vagas` devolver **só vagas liberadas**, as vagas em
  revisão sumiram desse mapa. Resultado: os candidatos cuja vaga em revisão **TEM cargo** (medido: 44
  dos 200 da página 1, ~19 mil na base) passaram a mostrar "cargo não informado", quando antes
  mostravam o cargo. **A vaga ainda está lá, só não está mais no mapa que a tela consulta.** Isso é o
  efeito cruzado que a §A.27 existe para pegar; passou porque o alcance medido da Central de Vagas não
  incluiu este leitor do `/as/vagas`.

## 3. Por que não aparece QUAL vaga

**O dado da vaga EXISTE e o `buscar` o ENVIA.** 100% das candidaturas têm `vaga_id`, e o `funilDaPagina`
projeta `vagaCodigo` e `vagaNome` por candidatura (`candidatos.service.ts:3704`, join com `vagas` SEM
filtro de status, de propósito). A tela renderiza a vaga por linha:
`l.candidatura.vagaNome ?? l.candidatura.vagaCodigo` (`page.tsx:904`). O 429 que quebrava essa segunda
consulta está resolvido (zero 429 hoje), então o funil chega. **Pela medição, a coluna da vaga DEVE
aparecer** (os 3 candidatos têm vagaNome: "Atendente de Farmácia, Praia Grande", etc.).

Ponto a confirmar com o diretor: o "tem 1 candidatura sem dizer qual" era o SINTOMA DO 429 antigo (o
funil não chegava, sobrava só a contagem `candidaturasAtivas`). Com o 429 resolvido, a vaga passa a
aparecer por linha. **Se o diretor ainda vê "tem 1 candidatura" sem a vaga, dizer EM QUE tela/modal**
(pode ser a ficha, ou uma aba que ainda lê a contagem e não o funil), para medir aquele ponto
específico.

## 4. O 429 volta com uso real?

**Não.** A frente do commit `a151931` trocou o laço de "uma chamada por vaga" (2 + 481 = 483 por carga)
por **2 consultas fixas** (a paginada com `count(*) over ()` + o `funilDaPagina` por `candidato_id in
(ids)`). Medido hoje: 62 `buscar` e 47 `/as/vagas`, 100% status 200, zero 429. A tela faz **2 chamadas
de dado** para montar a lista, mais os catálogos (status e etapas), uma vez por sessão.

## O plano proposto (para o diretor validar, NÃO construído)

**A. Consertar a regressão de leitura (cliente/cargo), e é a raiz certa, não um remendo.**
Hoje a tela depende de `/as/vagas` para cliente/cargo, o que a deixa frágil (e foi o que quebrou). O
certo é o `buscar` trazer cliente e cargo na própria projeção do funil: o `funilDaPagina` já faz
`innerJoin` com `vagas`; basta somar o join `vagas -> clientes` e `vagas -> cargos` e projetar
`clienteNome`/`cargoNome` em `AsCandidaturaNaLista`. Aí a tela lê tudo de UMA fonte (o funil),
independente de `/as/vagas`. Isso conserta a regressão E a fragilidade de origem.
- Efeito: os ~19 mil candidatos cuja vaga em revisão tem cargo voltam a mostrar o cargo; o cliente
  aparece sempre que a vaga o tiver.
- **O que NÃO conserta (e é esperado):** 94% dos candidatos continuam sem cliente, porque a vaga deles
  (espelho Pandapé em revisão) **genuinamente não tem cliente** até ser revisada. Isso é dado faltando
  na origem, não bug. O cliente nasce quando o time libera a vaga.

**B. Ver todos os 81 mil sem travar: paginação no servidor + carga incremental em segundo plano.**
A paginação já existe no backend (`offset`/`limite`, `total`, `truncado`; teto 500/página). Proposta:
1. Carregar a página 1 (200 ou 500) na abertura, como hoje, com a informação completa (depois do A).
2. **Pré-buscar as páginas seguintes em segundo plano**, com ritmo controlado (ex. 1 página a cada 1,5s),
   anexando ao cache do cliente, até cobrir os 81 mil. A tabela filtra/ordena/busca sobre o que já
   carregou, e um indicador mostra "carregados X de 81.024".
3. A busca por nome/CPF continua indo ao servidor (já filtra lá), para achar quem ainda não carregou.
- **Conta do teto a medir antes de construir:** 81.024 / 500 = ~162 páginas. O teto é **120 req/min
  GLOBAL e compartilhado** (a Central de Vagas e o `pendencias-portal` já consomem). A 1 página/1,5s
  são 40/min, folgado, e a carga completa leva ~4 min. Precisa de limitador no cliente e de parar/retomar
  quando a aba perde foco, senão vira a fonte do próximo 429.
- Alternativa, se o diretor quiser a base inteira "de uma vez disponível": um endpoint de stream próprio
  (cursor, página grande, sem o funil por linha e sim em lote), fora do balde de 120/min. Mais trabalho;
  decidir no plano.

**Recorte do que é o quê:**
- **Bug a corrigir:** cliente/cargo dependerem de `/as/vagas` (regressão que eu causei hoje) -> mover
  para a projeção do `buscar`.
- **Dado faltando (origem):** cliente ausente em 94% porque a vaga não foi revisada -> não é bug, nasce
  com a liberação da vaga.
- **Falta construir:** a carga incremental em segundo plano para ver os 81 mil (hoje para em 200).
- **Já certo:** etapa/situação reais, vaga no dado e na projeção, 429 resolvido.
