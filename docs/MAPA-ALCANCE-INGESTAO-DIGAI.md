# MAPA DE ALCANCE, CONSTRUCAO DA INGESTAO DIGAI (29/09/2026)

Levantado pelo coordenador ANTES do primeiro despacho (secao A.39 passo 1, secao A.40 regra 1).
Vai junto em TODO briefing. O agente nasce sem o contexto do coordenador: este documento e o
contexto. Complementa `docs/MAPA-ALCANCE-DIGAI.md` (que segue valendo) com o que MUDOU desde 17/09
e com a regua que a OST de hoje fixou.

## 1. A REGRA DA OST (decisao do diretor, 29/09/2026)

O Digai segue a **MESMA REGUA DO PANDAPE**: candidato e vaga do Digai nascem na **tela de Revisao
de Vaga** (`PENDENTE_REVISAO`), e o time completa e libera. O screening do Digai **nao tem cliente
nem posicoes**, entao o que vier de la nasce sem esses dados e cai em revisao. Isso NAO e excecao:
e exatamente o que `espelharVaga` (`ingestao-ciclo.ts:348`) ja faz para o Pandape, com
`cod_cliente` nulo e `status: PENDENTE_REVISAO`.

## 2. O QUE JA EXISTE E NAO SE REFAZ (medido no repositorio em 29/09)

| Peca | Estado medido | Consequencia |
|---|---|---|
| `AS_CANDIDATO_ORIGEM` com `DIGAI` | **JA EXISTE** em `shared-types/src/index.ts:2680` e no `pgEnum` (`db/schema/enums.ts:403`), e o rotulo `Digai` ja esta em `AS_CANDIDATO_ORIGEM_LABEL` | O item 3 da OST **esta pronto**. Nao criar migration de `ADD VALUE`: o valor entrou no `CREATE TYPE` da 0112 |
| `as_identidades_externas` | **pronta e vazia**, `CHECK fonte IN ('PANDAPE','DIGAI')` (0109) | A dedup por `userId` escreve aqui, fonte `DIGAI`. Zero coluna nova |
| `as_depara_etapa_externa` | **pronta**, mesmo CHECK de fonte (0110), FK RESTRICT para `as_etapas_funil` | O de/para do Digai e LINHA nesta tabela, fonte `DIGAI`. Nunca valor de enum |
| `as_ingestao_conflitos` | **pronta**, fonte generica com o mesmo CHECK (0113) | O conflito identidade-x-CPF do Digai reusa a tabela |
| Furo 1 de LGPD, "sem vaga nunca expira" | **FECHADO e PROVADO** pelo `seguranca`: o `exists` saiu, e o relogio e `coalesce(..., greatest(c.criado_em, c.atualizado_em))` (`retencao-candidatos.service.ts:416-425`), que **nao le `as_candidaturas`**, entao a porta do lado (max de conjunto vazio = NULL) esta fechada | nada a fazer |
| Furo 2 de LGPD, "a edicao traz de volta dado apagado" | **FECHADO nos tres escritores de hoje**, mas **NAO e propriedade do `editar`**: e a MESMA clausula repetida em cada escritor (`candidatos.service.ts:372,420,430` e `ingestao-repositorio.ts:239,257`). Nao ha guarda no schema, nem trigger, nem teste que enumere escritores | **A ingestao do Digai e o QUARTO escritor de `as_candidatos` e nasce SEM a clausula.** Repetir `and anonimizado_em is null` no `where` **e** tratar zero-linha como RECUSA |
| A grade de acesso auditada | `/home/henrique/digai-investigacao/grade_digai.py` (Bearer, GET-only, `_ID = [A-Za-z0-9._-]{1,64}`, 26 bloqueios, 11 leituras) | A grade de producao e a **traducao TypeScript** dela. Nenhuma regra nova se inventa |
| O contrato do `tester` | **99 testes ja escritos**, suspensos por sentinela, em `apps/backend/src/as/digai/` | E o contrato que a construcao satisfaz, palavra por palavra |

## 3. O CONTRATO ESCRITO ANTES DO CODIGO (secao A.40 regra 2)

`digai.tester-fake.ts` declara os caminhos das pecas, e sao esses os nomes a construir:

| Peca | Arquivo | O que ela e |
|---|---|---|
| `grade` | `as/digai/digai-grade.ts` | allowlist de metodo e rota, alfabeto fechado de id, anti-SSRF, anti-PII em path e query, `inspecionarFonte`, `autotesteDaGrade`, `DIGAI_BASE_URL` |
| `dominio` | `domain/digai.ts` | dominio PURO: `ETAPAS_DIGAI`, `etapaDoResultadoDigai`, `SITUACAO_NASCIMENTO_DIGAI`, `chaveDoRegistroDigai`, `planoDaImportacao`, `mascararParaLog`, `resumoSeguro`, `erroDoRegistro`, `resumoDaImportacao`, `CAMPOS_COLETADOS_DO_DIGAI` |
| `cliente` | `as/digai/digai.cliente.ts` | `DigaiCliente`, Bearer, v2, host constante, **inerte sem token** |
| `importacao` | `as/digai/digai-importacao.service.ts` | a ingestao idempotente |
| `dto` | `as/digai/digai.dto.ts` | corpos das rotas |
| `controller` | `as/digai/digai.controller.ts` | RBAC por `@Roles` |
| `reengajar` | `as/digai/digai-reengajar.service.ts` | **FORA DO ESCOPO DESTA OST** (secao A.31): a OST nao pede reengajar. Fica proposto, nao construido |

## 4. AS ETAPAS DO DIGAI, E POR QUE SAO DUAS (proposta de de/para, item 4 da OST)

O campo `stages` do resultado v2 **foi excluido de toda coleta** por minimizacao, decisao do
`seguranca` em 16/09 (`digai_agregado.py:42`, lista de campos suprimidos): ele carrega resposta e
julgamento sobre a pessoa. **Nao ha, portanto, uma lista de etapas do Digai medida.** O que FOI
medido e mais simples e mais forte:

> **Sem CPF = nao finalizou a triagem. Com CPF = finalizou.** 12% tem CPF (1.656 de 13.248), e o
> CPF **atualiza no mesmo registro**, o `userId` nao muda.

Entao o de/para do Digai tem **duas linhas**, e nenhuma delas e a etapa `inicial` (o indice parcial
unico `as_etapas_funil_inicial_unica` faria disso uma TROCA, mudando onde toda candidatura nova
nasce, inclusive as do Pandape). **O diretor valida os codigos, os rotulos e para qual etapa do
funil cada uma aponta.**

## 5. QUEM DEPENDE DO QUE VAI SER MEXIDO (a pergunta da secao A.27, e ela e LINHA FIXA do briefing)

**"QUEM MAIS ESCREVE ESTE DADO?"** tem de ser respondido com a lista COMPLETA provada por varredura,
nunca estimada (secao A.40, regra 3). Os dados em jogo:

- **`as_candidatos`**: escreve a ingestao do Pandape (`ingestao-ciclo.ts`), o cadastro manual e a
  importacao por planilha (`candidatos.service.ts`, `candidatos-import.service.ts`) e o expurgo
  (`retencao-candidatos.service.ts`). A ingestao do Digai vira o QUARTO escritor.
- **`as_identidades_externas`**: hoje so a ingestao do Pandape escreve, e o expurgo apaga.
- **`as_candidaturas.atualizado_em`**: e o insumo do relogio do expurgo. Escrita INCONDICIONAL aqui
  empurra o relogio a cada volta e **ninguem que a ingestao tocar expira mais**. A escrita tem de
  ser condicional de verdade (`comparaAntes`), como a do Pandape.
- **`vagas.posicoes_oficiais`**: e a **META guardada**, escrita pela rota `PATCH :id/posicoes`
  (`vagas.controller.ts:127`) e pela ingestao (`ingestao-repositorio.ts:489`). **A OCUPACAO e outra
  coisa: e DERIVADA e NUNCA guardada** (`ocupacaoDaVaga`, `domain/candidatura.ts:354`), contando
  quem satisfaz `consomePosicao`. *(Correcao do `seguranca`: a primeira versao desta linha dizia que
  `posicoes_oficiais` era a ocupacao. A conclusao operacional nao muda, mas o mecanismo sim, e quem
  construisse com o mecanismo errado procuraria uma coluna a proteger que nao existe.)* Candidato de
  triagem nascendo em situacao que consome posicao **TRANCA a vaga**, e por isso
  `SITUACAO_NASCIMENTO_DIGAI` nao pode satisfazer `consomePosicao`.
- **`vagas.status`, e este escritor nao estava no mapa**: `as/vagas/derivar-status-da-vaga.ts:118`
  **muda o status da vaga SOZINHO**, disparado por movimento de candidato, quando existe candidatura
  VIVA numa etapa marcada `entrega_ao_cliente`. **REGRA QUE PASSA A VALER:** nenhuma etapa alvo do
  de/para do Digai pode ter `entrega_ao_cliente = true`, senao a chegada em massa da triagem move o
  status de vagas sozinha, com `porId` nulo. Medido hoje: so `ENTREVISTA_CLIENTE` tem a marca (e a
  coluna **nem existe em producao** ainda), entao a proposta `CAPTACAO` esta segura. A regra fica
  escrita porque a marca e editavel pelo diretor na tela do funil.
- **`vagas` por `id_vacancy_pandape`**: o `partnerJobId` do Digai **E o id da vaga do Pandape**
  (confirmado pelo Ivan). Logo a vaga espelhada do Digai e a MESMA linha que o espelho do Pandape
  usa, e o upsert converge pela mesma chave de conflito. Isso e desenho, nao coincidencia.

## 6. O QUE PODE QUEBRAR DE LADO

1. **A contagem de posicoes da vaga**, se a situacao de nascimento consumir posicao.
2. **O relogio do expurgo**, se a escrita da candidatura for incondicional.
3. **O teto de 120 req/min**, se a importacao varrer sem limitador. O limiter do BullMQ e **por
   fila**, entao uma fila nova do Digai SOMA o teto dela ao das que ja existem. A conta do Digai e
   contra o teto do Digai, que e proprio, e nao contra o do Pandape.
4. **A tela de Revisao de Vaga**, que e codigo JA VALIDADO pelo diretor (secao A.26): a vaga do
   Digai entra na fila dela. O que for tocado ali se pergunta antes.
5. **O log do fornecedor**: o 401 do Digai ECOA o path. PII em path ou query vai parar num log que
   nao temos como apagar.

## 7. A REGRA QUE VALE PARA TUDO

`docs/PROTOCOLO-LGPD-FABRICA.md`. Producao de terceiro, CPF real, **sem sandbox**. Zero PII em log,
em pulso e em commit. A grade e obrigatoria e fail-closed. Secao A.11: travessao proibido em texto
de UI. Secao A.24: title case em titulo e tag. A integracao **nasce INERTE**: sem
`DIGAI_API_TOKEN`, nada sai para a rede, e sem `DIGAI_INGESTAO_ATIVA` nada e escrito.

---

## 8. ACHADO MEDIDO ANTES DA CONSTRUCAO (29/09, coordenador): OS DOIS BANCOS TEM CATALOGOS DIFERENTES

Consultados `ea_automatic` (producao) e `ea_automatic_homolog` no `ea-db`. **O catalogo
`as_etapas_funil` NAO e o mesmo nos dois**, e isso decide para onde o de/para do Digai pode apontar.

| codigo | producao | homologacao |
|---|---|---|
| `CANDIDATURA` | **NAO EXISTE** | existe, e e a **inicial**, rotulo "Candidatura" |
| `CAPTACAO` | existe, **inicial**, ativa, rotulo "Captação" | existe, ativa, rotulo "Triagem & Captação" |
| `TRIAGEM` | existe, **ativa** | existe, **INATIVA** |
| `ENTREVISTA_SOULAN` | ativa, "Entrevista Soulan" | ativa, "Etapa Soulan" |
| `ENTREVISTA_CLIENTE` | ativa, "Entrevista Cliente" | ativa, "Etapa Cliente" |
| `APROVACAO` | ativa, "Aprovação" | ativa, "Contratado" |
| `STAND_BY` | ativa | ativa |

Migrations aplicadas: producao **118**, homologacao **132**. A producao esta ATRAS, e os rotulos
divergentes sao edicao de operacao do diretor na tela do funil (a 0110 semeia com `DO NOTHING`
justamente para nao desfazer isso a cada deploy).

**A CONSEQUENCIA, e ela e dura:** a FK do de/para e **RESTRICT**. Uma semente apontando para
`CANDIDATURA` **derruba a migration em producao**, onde o codigo nao existe. Uma semente apontando
para `TRIAGEM` funciona em producao e, na homologacao, estaciona a pessoa numa etapa **INATIVA**,
que ninguem ve no seletor do funil.

**O UNICO conjunto de codigos presente E ATIVO nos DOIS bancos:** `CAPTACAO`, `ENTREVISTA_SOULAN`,
`ENTREVISTA_CLIENTE`, `APROVACAO`, `STAND_BY`.

**DECISAO TOMADA PARA CONSTRUIR (conservadora, e vai a validacao do diretor):** as DUAS linhas de
de/para do Digai apontam para **`CAPTACAO`**, que e a unica escolha segura nos dois ambientes. Duas
chaves externas apontando para a mesma etapa **ja e o padrao da casa** (`lead` e `inscritos` do
Pandape apontam ambas para `CAPTACAO`, 0110). O estagio "finalizou a triagem" continua distinguivel
pelo dado (`chaveDoRegistroDigai` e o CPF presente), so nao vira um caneco proprio no funil.

**O QUE O DIRETOR DECIDE:** para qual etapa do funil deve ir quem **FINALIZOU** a triagem do Digai.
A resposta natural seria `TRIAGEM`, e ela esta **INATIVA na homologacao**. Trocar isso e edicao de
catalogo, que e decisao dele (secao A.31), nao da fabrica.

**ALEM DISSO, e vale por si:** o de/para do Pandape em producao tem **25 linhas** e o da homologacao
tem **25**, mas varias delas apontam para `TRIAGEM` (`triado`, `triados`, `triagem`, `testes`,
`pre selecionado`, `pre selecionados`). Na homologacao, **essas seis ja estao mandando gente para
uma etapa inativa hoje**, antes e independentemente do Digai. Nao e desta OST, e esta registrado.

---

## 9. O ACHADO QUE O `seguranca` DEVOLVEU COMO DECISAO DO DIRETOR (29/09)

**"Quem entra sem vaga nunca expira" foi fechado. "Quem entra numa vaga que nunca sai da fila de
revisao nunca expira" esta ABERTO, e e a mesma consequencia por outra porta.**

Medido: `PENDENTE_REVISAO` tem `encerra = false` (`shared-types/src/index.ts:1171`). A regua de
protecao do expurgo (`retencao-candidatos.service.ts:295`) so deixa expurgar quem **nao** tem
candidatura VIVA em vaga **nao encerrada**. Logo, candidatura do Digai em situacao viva dentro de
uma vaga `PENDENTE_REVISAO` **protege a pessoa inteira do expurgo por tempo indefinido**, e o
relogio de 2 anos nunca comeca a correr.

**Por que importa agora:** a decisao da OST de hoje e que a vaga do Digai nasce em revisao **sem
cliente e sem posicoes**. Sao vagas de triagem, das menos provaveis de alguem revisar, e o universo
medido e de **12.445 pessoas**. O desenho e defensavel (o erro cai para o lado de NAO apagar), mas
o efeito e **retencao indefinida de dado pessoal em massa**, e isso e decisao do diretor, nao efeito
colateral que a fabrica escolhe em silencio.

**Nao e novidade do Digai:** a ingestao do Pandape ja produz exatamente a mesma situacao, e esta
inerte hoje. O Digai multiplica o volume. **Vai ao pulso como item de decisao.**

---

## 10. O QUE MUDOU EM 29/09/2026, DEPOIS DA CONFIRMACAO DO FORNECEDOR E DA SONDAGEM AO VIVO

O detalhe completo esta em `docs/MAPA-ALCANCE-DIGAI.md`, nas duas secoes finais. O que esta secao
registra e o efeito sobre ESTA construcao.

### 10.1 As confirmacoes do Ivan, e o que cada uma fecha

| confirmacao | efeito nesta frente |
|---|---|
| O webhook existe: **`NEW_APPLICATION`**, quando o candidato finaliza a triagem | o receptor construido (`digai-webhook.controller.ts`) e o caminho certo, e o polling nao e necessario |
| O **`userId` e unico e permanente**, o mesmo em todas as triagens | **a dedup DESTRAVA**. Era a unica pergunta que a segurava, e ela ja esta construida sobre essa chave |
| O **`partnerJobId` e o id da vaga no Pandape** | o elo com `vagas.id_vacancy_pandape` deixa de ser hipotese. **Medido: 58/58 numericos de 7 digitos** |
| A **ORIGEM** (planilha ou Pandape) so existe na interface web, nao na API | **o diretor decidiu que nao precisa**: a dedup por `userId` resolve. Nada a construir |
| Teto de **120 req/min** | ja adotado (`DIGAI_TETO_REQ_POR_MINUTO = 120`, limiter a 90) |

### 10.2 A sondagem derrubou TRES premissas do codigo ja construido

Os 174 testes estavam verdes sobre fakes escritos a partir da DOCUMENTACAO, e a documentacao nao
bate com a producao. **Teste verde sobre fake inventado nao prova integracao nenhuma**, e esta e a
licao a deixar escrita no proprio codigo.

1. **O envelope e `{ message, data: { value } }`**, e a lista de resultados chama-se **`candidates`**.
   `listaDaResposta` so reconhecia array no topo, `results` ou `data` array, entao devolveria `[]`
   contra a resposta real: **todo evento sairia por "sem registro correspondente", com zero escrito e
   nenhum erro.** Falha silenciosa completa.
2. **A rota do par e `v1`, nao `v2`.** No mesmo par, a v2 devolve **404**. A LISTAGEM de resultados
   continua v2. **A versao e por rota, nao por integracao.**
3. **Nao existe o campo `name`**: existem `firstname` e `lastname`. A projecao lia `o.name`, entao
   todo candidato nasceria sem nome.

Some-se: **os parametros de query sao ignorados pelo fornecedor** (nao ha filtro no servidor), e
**`curriculumUrl` entrou no mapa como PII pura**, fora da projecao, do log e do banco pela mesma
regua da URL do Pandape (secao A.6).

### 10.3 O token

Chegou em 29/09, foi usado **uma vez, somente para leitura**, na sondagem acima, e **expurgado
(`shred`) ao fim da sessao**. Nao esta no `.env` de nenhum ambiente. A integracao segue **inerte**:
sem `DIGAI_API_TOKEN` nada sai para a rede, sem `DIGAI_INGESTAO_ATIVA` nada e escrito.
