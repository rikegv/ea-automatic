# Mapa De Alcance: A Fundação Da Plataforma Unificadora

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Tipo:** mapa de alcance (§A.27, §A.39 passo 1)
**Auditado pelo `seguranca` ANTES do primeiro despacho (§A.40, regra 1).**
§A.11 (sem travessão), §A.24 (title case em título e etiqueta).

## 1. O QUE A OST PEDE, e nada além (§A.31)

1. **Tabela de identidades externas.** Uma pessoa, N identidades de fonte externa, sem duplicar a
   pessoa. Estrutura preparada, **sem deduplicação** e **sem ingestão** nesta frente.
2. **As 5 etapas do funil**, pré-cadastradas (a base foi zerada em 17/09).
3. **O de/para das etapas externas**, configurável em tabela, nunca fixo no código.

**Fora de escopo, explicitamente:** nenhuma rota HTTP nova, nenhuma tela nova, nenhuma ingestão,
nenhuma chamada a API de terceiro, nenhuma deduplicação, nenhum espelho da fonte (D2).

## 2. AS 5 ETAPAS: CONFIRMADAS NO GIT, não é preciso perguntar ao diretor

A quinta etapa é **Aprovação**. Vem da migration `0100_as_etapas_funil.sql`, linhas 97 a 101, que
semeou o catálogo a partir do enum antigo `candidatura_etapa`:

| codigo | rotulo | ordem | tom | inicial |
|---|---|---|---|---|
| CAPTACAO | Captação | 1 | nt | **sim** |
| TRIAGEM | Triagem | 2 | in | não |
| ENTREVISTA_SOULAN | Entrevista Soulan | 3 | wn | não |
| ENTREVISTA_CLIENTE | Entrevista Cliente | 4 | or | não |
| APROVACAO | Aprovação | 5 | ok | não |

**Por que a 0100 não repõe sozinha:** ela já consta como aplicada no `_journal.json`, e o runner não
reexecuta migration aplicada. A reposição precisa de migration NOVA, idempotente.

## 3. AS 10 ETAPAS DO PANDAPÉ: os nomes REAIS, medidos, não supostos

`GET /v2/vacancy-folders?idVacancy=` devolveu 200 numa vaga real da conta
(`docs/MAPA-COMPLETO-API-PANDAPE.md`, seção 3.3). Os nomes, como vieram:

`Lead` · `Inscritos` · `triados` · `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` ·
`ENTREVISTA SOULAN` · `SHORT LIST, ENCAMINHADOS CLIENTE` · `Contratados` ·
`RETORNO VAGA STAND BY` · `RETORNO NEGATIVO` · `Descartados`

**São TEXTO LIVRE e mudam por vaga**, com caixa e pontuação irregulares. Logo a chave do de/para é o
nome **normalizado** (maiúsculas, sem acento, espaço colapsado), e nunca o nome cru.

## 4. QUEM MAIS ESCREVE ESTE DADO (§A.40, regra 3)

Levantado por varredura, não por memória:

| Dado | Quem escreve | Quem lê |
|---|---|---|
| `as_candidatos.id_candidate_pandape` | `candidatos.service.ts:210` (DTO do formulário) e o expurgo, que o NULA (`retencao-candidatos.service.ts:166`) | índice unique `uq_as_candidatos_id_candidate_pandape`, tratamento de erro em `candidatos.service.ts:2328` |
| `as_candidaturas.id_match_pandape` | `candidatos.service.ts:518` (DTO) | unique parcial, erro em `:2331`. **NADA o nula no expurgo** |
| `as_etapas_funil` | `EtapasFunilService` (escrita `@Roles("SUPER_ADMIN")`) e a migration 0100 | as 3 colunas com FK RESTRICT, a tela do funil, filtros e contagens |
| `as_identidades_externas` (nova) | **NINGUÉM ainda.** Não há ingestão nesta frente | ninguém ainda |
| `as_depara_etapa_externa` (nova) | a semente da migration | o serviço de resolução, com teste |

**A tabela nova nasce sem escritor, e isso é deliberado:** a porta nova ainda não abre.

**CORREÇÃO DO `seguranca`, e ela derruba a frase original deste bloco:** a porta ANTIGA está aberta e
SEM PAPEL. `candidatos.service.ts:210` grava `idCandidatePandape` a partir do corpo, `:518` grava
`idMatchPandape`, e as duas rotas não têm `@Roles` (`candidatos.controller.ts:281`, conferido pelo
coordenador). Hoje o risco é baixo porque as colunas têm ZERO valores nos dois bancos, e por isso o
adiamento fica de pé. **A TRAVA, escrita para não se perder:** a frente que abrir a INGESTÃO fecha a
porta do DTO no MESMO commit, antes de a primeira identidade real existir.

## 5. O QUE ESTA FRENTE TOCA DE CÓDIGO JÁ VALIDADO (§A.26)

**Um arquivo só, e por exigência do `seguranca`:** `as/candidatos/retencao-candidatos.service.ts`.

A exigência D1 do parecer diz, sem margem: *todo identificador externo novo nasce dentro do expurgo,
no mesmo commit, com teste que enumera a lista completa de colunas identificadoras.* A tabela de
identidades guarda identificador de terceiro, que o protocolo LGPD classifica como dado pessoal
(seção 1). Então o expurgo passa a **apagar as linhas de identidade** da pessoa anonimizada.

**Por que APAGAR a linha aqui, e não anonimizar como se faz no candidato:** a linha de identidade
**é** o identificador, inteira. Não sobra nada dela que sustente contagem histórica, ao contrário da
linha do candidato, que sustenta a contagem de aprovados das vagas passadas. Anonimizar seria deixar
uma linha vazia apontando para ninguém.

**O risco da mudança, dito antes de mexer:** o expurgo hoje é UM `update ... returning` atômico. Ele
passa a ser duas escritas, e as duas precisam cair juntas ou nenhuma. A construção exige transação
explícita, e o teste precisa provar que a falha da segunda desfaz a primeira.

## 6. O QUE ESTA FRENTE **NÃO** TOCA, e vira decisão do diretor

1. **As duas colunas antigas de id externo** (`id_candidate_pandape` no candidato,
   `id_match_pandape` na candidatura) **ficam onde estão**. Elas têm ZERO valores nos dois bancos,
   medido, e removê-las é o caminho certo pela decisão D1, mas remover alcança
   `candidatos.service.ts` e o DTO, que são código validado. **§A.26: pergunta antes.**
2. **O expurgo não alcança `id_match_pandape`** (D4 do parecer). É buraco **anterior** a esta frente,
   não criado por ela, e consertá-lo é escopo próprio.
3. **A retenção de quem não tem candidatura** (D3) segue como está. Hoje é teórico: a base está
   vazia. Passa a ser real no dia da ingestão.

## 7. LGPD, o protocolo aplicado a esta frente

| Item | Como fica |
|---|---|
| Dado sensível em log | A frente não loga nada além de contagem. Sem ingestão, não há payload |
| Minimização (seção 3) | A tabela guarda id técnico, fonte e data de coleta. **Nada mais**. Sem espelho, sem nome, sem e-mail |
| E5, origem e data por registro | `fonte` e `coletado_em`, NOT NULL, por linha |
| Expurgo (seção 5) | Seção 5 deste mapa: a identidade cai junto com a anonimização da pessoa |
| Rastro (seção 4) | Nada a registrar NESTA frente (zero integração). **O E18 item 4, rastro do atendimento do pedido do titular, continua EM ABERTO** e é carga da construção da ingestão, não some do radar |
| Grade de acesso (seção 2) | Não se aplica: zero chamada a terceiro |
| RBAC | Zero rota nova, logo zero superfície nova. O catálogo de etapas mantém a escrita em `SUPER_ADMIN` |

## 8. AS DUAS TABELAS NOVAS, na forma proposta

**`as_identidades_externas`**: `id` uuid, `candidato_id` uuid NOT NULL FK CASCADE,
`fonte` varchar(20) NOT NULL com CHECK de lista fechada, `identificador` varchar(120) NOT NULL,
`coletado_em` timestamptz NOT NULL default now(), `criado_em`, `atualizado_em`.
**UNIQUE (fonte, identificador)**: a mesma identidade externa não aponta para duas pessoas.
**SEM unique em (candidato_id, fonte)**: é justamente o que permite a mesma pessoa ter dois
registros na mesma fonte, que é o caso que a deduplicação vai resolver depois.

**`as_depara_etapa_externa`**: `id` serial, `fonte` varchar(20) NOT NULL com CHECK,
`chave_externa` varchar(160) NOT NULL (o nome NORMALIZADO), `rotulo_externo` varchar(200) NOT NULL
(o nome como veio, para a tela futura), `etapa_codigo` varchar(40) NULL FK RESTRICT para
`as_etapas_funil.codigo`, `situacao` varchar(40) NULL com CHECK contra a lista de situações,
`ativo` boolean, `criado_em`, `atualizado_em`.
**UNIQUE (fonte, chave_externa)**. **CHECK (etapa_codigo IS NOT NULL OR situacao IS NOT NULL)**.

**Por que os dois campos são nuláveis e um CHECK obriga um deles:** nem toda etapa externa é um
caneco do funil. `Descartados` não muda a etapa da pessoa, muda o **desfecho** dela, e forçar uma
etapa ali escreveria um movimento que não aconteceu.

**Ausência de linha = NÃO MAPEADA, e é fail-closed:** o resolvedor devolve "não mapeada" e o chamador
não faz nada. Nunca chuta caneco.


## 9. O VETO DO `seguranca` SOBRE ESTE MAPA, e o que mudou por causa dele

Auditoria de 17/09/2026, ANTES do primeiro despacho (§A.40 regra 1). Cinco caminhos pelos quais o
identificador externo sobreviveria à anonimização. Os cinco foram conferidos pelo coordenador contra
o código, um a um, e os cinco existem.

| # | O caminho | O que se faz |
|---|---|---|
| **P1** | Pessoa SEM candidatura nunca é varrida (`retencao-candidatos.service.ts:174`). A identidade dela é permanente | **Decisão do diretor.** Não há régua de prazo a aplicar sem ele |
| **P2** | `origem = BANCO_TALENTOS` isenta para sempre (`:172`), e `origem` é editável por QUALQUER autenticado, sem trilha | **Decisão do diretor** (é o D5). Toca código validado |
| **P3** | Identidade anexada DEPOIS da anonimização nunca é varrida (`:169` só olha `anonimizado_em is null`) | **CORRIGIDO nesta frente.** Varredura cicatrizante |
| **P4** | `as_candidaturas.id_match_pandape` não é nulado por ninguém | **CORRIGIDO nesta frente.** Uma linha a mais, zero registros afetados hoje |
| **P5** | O `ON DELETE CASCADE` nunca dispara, porque o expurgo anonimiza e jamais apaga a linha | **Reconhecido.** A FK não é rede de proteção, e o mapa não a conta mais como uma |
| **P6** | `CandidatosService.editar` (`candidatos.service.ts:228-256`) grava CPF, e-mail, telefone e nascimento **sem guarda de `anonimizado_em is null`**: re-identifica quem já foi expurgado, e a cicatrizante não re-anonimiza a linha da pessoa | **Decisão do diretor.** Achado da auditoria do CÓDIGO, pré-existente e fora deste recorte. É o gêmeo exato do P3, do outro lado |

**A trava do item 5 do parecer, aceita inteira:** o expurgo NÃO vira duas escritas em transação. Vira
**UMA instrução só**, com CTE que modifica dado (`with alvo as (update ... returning id) delete ...`).
O motivo é o modo de falha da §A.33 aplicado a dado pessoal: com duas escritas, a falha da segunda
deixa o candidato carimbado como anonimizado e a varredura **nunca volta naquela linha**, então o
identificador vira permanente em silêncio.

**As outras condições aceitas:** `coletado_em` é preenchido pelo ingestor, e o `default now()` fica só
como piso de escrita manual; `rotulo_externo` é alimentado por configuração revisada, NUNCA por cópia
automática de rótulo vindo da API; a migration das etapas é `on conflict (codigo) do nothing`, nunca
`do update`, não reativa etapa inativada e não cria um segundo `inicial`.
