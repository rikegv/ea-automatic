# MAPA DE ALCANCE: tela unificada de vagas (passo 1 da §A.39)

> Levantado pelo COORDENADOR antes de despachar, como manda o passo 1 da §A.39. O `arquiteto` recebe
> este mapa junto do briefing: ele desenha COM o alcance na mão, em vez de descobrir depois.
> §A.11 (sem travessão) valendo.

---

## O QUE JÁ EXISTE E NÃO PRECISA NASCER

**A régua de posição derivada JÁ EXISTE, JÁ É TESTADA E JÁ É SERVIDA POR VAGA.**
`ocupacaoDaVaga(posicoesOficiais, situacoes)` em `apps/backend/src/domain/candidatura.ts:164` devolve
`{ ocupadas, livres, emSelecao, fora, excedida }`, derivando das candidaturas e **nunca armazenando**.
E `candidatos.service.painelVaga(vagaId)` (linha 992) já monta `{ ocupacao, candidaturas }` e é servida
em `GET /as/candidatos/vaga/:id`. **A Central de Vagas simplesmente não consome isso.**

**O serviço da Central de Candidatos já tem quase toda a operação do modal:**
`criar`, `editar`, `buscar`, `ficha`, `alocar`, `moverEtapa`, `aprovar`, `trocarVaga`,
`registrarSaida`, `registrarContato`, `listarHistoricoEtapas`, `listarContatos`, `painelVaga`.
O modal unificado é, em grande parte, **uma casca nova sobre rotas que já existem**.

---

## OS SEIS PONTOS DE ALCANCE (o que a mudança encosta)

### 1. OS DOIS NÚMEROS QUE DISCORDAM (a raiz dos bugs 11, 12 e 13)

| fonte | onde vive | quem lê |
|---|---|---|
| `vagas.vagas_fechadas` / `vagas_fechadas_banco` | digitado à mão no fechamento | o cilindro da listagem (`preenchidas`), `excessoDePosicoes` (`domain/vaga.ts`), a regra de status em `vagas.service.fechar` |
| `ocupacaoDaVaga` | derivado das candidaturas | a Central de Candidatos, `painelVaga`, `cabeMaisUm` |

A decisão do diretor é **manter só a derivada**. Consequência que o desenho precisa cobrir: as colunas
`vagas_fechadas` e `vagas_fechadas_banco` ficam órfãs, e `excessoDePosicoes` perde a razão de existir
na forma atual (a derivada não pode exceder a meta se a trava de alocação `cabeMaisUm` fizer o
trabalho na entrada). **Não apagar coluna sem decisão: o padrão da casa é deixar dormente.**

### 2. "ALOCADO" NÃO EXISTE COMO SITUAÇÃO, E MEXER NISSO TEM RASTRO

`CANDIDATURA_SITUACOES = ["ATIVO","APROVADO","DESCARTADO","DESISTIU","CONTRATADO"]`.
O "finalizar posição" pedido (posição entregue com o candidato X, candidato **continua no funil**
marcado como ALOCADO, posição conta preenchida) não tem estado hoje. Quem depende disso:

- `consomePosicao` (hoje `APROVADO || CONTRATADO`), que é a base de `ocupacaoDaVaga` e `cabeMaisUm`.
- `ehSaidaSemExito` e `candidaturaViva`, que é o **complemento** dela: situação nova nasce VIVA por
  construção (fail-closed deliberado, documentado no shared-types).
- `SITUACOES_DE_SAIDA` (inclui `CONTRATADO`), `SITUACOES_TRATADAS`, `pendentesDeTratamento`,
  `vagaPodeEncerrar`.
- **O ÍNDICE PARCIAL DO BANCO:** `uq_as_candidaturas_viva UNIQUE (candidato_id, vaga_id) WHERE situacao
  IN ('ATIVO','APROVADO','CONTRATADO')`. Situação nova **fora dessa lista** faz a trava de duplicata
  parar de cobrir em silêncio. É o ponto mais fácil de esquecer e o mais caro de descobrir depois.

### 3. `ENTREGUE` HOJE BLOQUEIA ALOCAR CANDIDATO, e isso É o bug 11

`STATUS_QUE_NAO_RECEBEM = ["FECHADA","CANCELADA","ENTREGUE"]` (`domain/candidatura.ts:213`), e
`fechar()` marca `ENTREGUE` assim que **uma** posição é preenchida. Ou seja: preencher a primeira
posição hoje **fecha a vaga para novas alocações**. O modelo novo (fecha só quando TODAS as posições
forem finalizadas) precisa mexer nessa lista, e ela é lida na alocação e na troca de vaga.

### 4. O QUE MAIS LÊ `vagas.status`

`STATUS_ENCERRADOS` congela o contador "Dias Em Aberto" na listagem; os 6 cards de KPI contam por
status; `editarPosicoes` recusa vaga encerrada; a trava 5 (`travaCandidatosPendentes`) exige todo
candidato tratado antes de encerrar; `TOM_STATUS_VAGA` pinta a pill. Mudar a semântica de
ENTREGUE/FECHADA alcança todos.

### 5. RBAC: O MODAL LÊ UMA CONTROLLER DE OUTRO MENU (achado principal deste levantamento)

`VagasController` é reivindicada **inteira** pelo menu `as-vagas`. `CandidatosController` é
reivindicada **inteira** pelo menu `as-candidatos`. O modal unificado vive na Central de Vagas e lê
`GET /as/candidatos/vaga/:id`.

**Consequência:** um usuário com `as-vagas` e SEM `as-candidatos` abre o modal e recebe a lista vazia,
**sem erro visível**. Hoje ninguém vê, porque quem valida é SUPER_ADMIN, que fica acima da
segmentação. Apareceria no dia em que o diretor liberasse a Central de Vagas para o time (§A.23).
É exatamente a mesma armadilha já documentada em `vagas.service.opcoes` para `/catalogos`.

### 6. §A.6: O CPF DO CANDIDATO

`as_candidatos.cpf` existe, com índice unique parcial e coluna `anonimizado_em`. **`painelVaga` NÃO
devolve CPF**, e o `CandidatosDaVagaModal` documenta essa escolha: puxar a ficha de cada pessoa para
enriquecer a lista traria o CPF da vaga inteira para o navegador. O modal unificado, que é maior e faz
mais coisa, tem de **preservar essa minimização**. Alvo direto da auditoria do `seguranca` (§A.38).

---

## O QUE JÁ ESTÁ DECIDIDO PELO DIRETOR (não redecidir, só desenhar o como)

- Modal premium no "Ver Vaga", sobrepondo a tabela.
- Trilha da vaga: processo seletivo concluído vs vaga aberta, entregue ao ADM, fechada. Vaga que não
  vai ao ADM **finaliza na A&S**.
- "Ver Candidatos" (todos da vaga) e "Ver Candidatos Alocados" (alocar existente ou novo, desvincular,
  pesquisar, finalizar posição, mover etapa, ficha).
- Cadastro de candidato novo **no modal** (entra na vaga) e **na Central de Candidatos** (entra no
  banco). A Central de Candidatos vira o **banco de gente** (sem vaga, ou que saiu de vaga), e as duas
  convivem sem duplicar.
- **A vaga conta POSIÇÕES, não linhas.**
- **A vaga só FECHA quando TODAS as posições forem finalizadas.** Master pode **FORÇAR** o fechamento
  com posições faltando. (Padrão de RBAC já existente na casa: `@Roles("MASTER","SUPER_ADMIN")` em
  `PATCH /as/candidatos/candidaturas/:id/vaga`.)
- **Finalizar posição** = "posição entregue com o candidato X"; o candidato **continua no funil**,
  marcado como ALOCADO; a posição conta preenchida.
- **A contagem vem da DERIVADA** (`ocupacaoDaVaga`), nunca do número digitado. **Uma fonte só.**

---

## LIMITES DESTA FRENTE

Fora: Clicksign, Pandapé, esteira admissional, iFractal, lojas, grupos. Nada aqui encosta neles.
O `shared-types` é do **coordenador** (§A.39, dono único do arquivo compartilhado).
