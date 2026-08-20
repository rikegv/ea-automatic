# Arquitetura da frente de Atração e Seleção (A&S)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-18 · **Tipo:** desenho de arquitetura (§A.27)
**Regra 3 desta OST:** nada construído, nada commitado. Este documento é o mapa para o diretor aprovar.
**Materiais ainda ausentes:** relatório de vagas, relatório de candidatos e formulário Word. Por isso
aqui NÃO há coluna de tela nem layout: só o esqueleto e o caminho de migração.

---

## 0. As decisões do diretor que governam tudo

| # | Decisão | Consequência estrutural |
|---|---|---|
| 1 | A vaga do A&S é a fonte da verdade | O Alto Volume deixa de ser dono da meta e vira leitura filtrada |
| 2 | Uma vaga tem N posições | "Quantas faltam" passa a ser pergunta da vaga, não do projeto |
| 3 | Toda vaga marca SAZONAL ou OPERAÇÃO PADRÃO | É esse flag que transforma o Alto Volume em visão filtrada |
| 4 | Isolamento: A&S não vê Admissão; MASTER e padrão não veem A&S | Nasce na primeira tabela e no primeiro menu (§A.23) |
| 5 | Duas frentes: VAGAS primeiro, CANDIDATOS depois | O esqueleto nasce com as duas tabelas, a segunda espera a base |

---

## A. Migração da conta do Alto Volume (a parte perigosa)

### A.1 O que existe hoje, exatamente

Quatro tabelas, e uma superfície de leitura muito pequena. A varredura encontrou **apenas 4 arquivos**
que tocam essas tabelas em todo o sistema:

| Arquivo | Papel |
|---|---|
| `admin/alto-volume/alto-volume.service.ts` | CRUD de projeto, grupo e vagas por cargo |
| `admin/alto-volume/alto-volume-vinculos.service.ts` | Vínculo manual e correção (onda 3) |
| `admin/alto-volume/alto-volume-analise.service.ts` | A RÉGUA: baldes, faltam, termômetro, alerta |
| `admissoes/admissoes.service.ts` (2 inserts) | Grava o vínculo na liberação e no wizard |

Isso é a melhor notícia do levantamento: a régua não está espalhada. Ela mora em **um** arquivo de
leitura e é alimentada por **dois** pontos de escrita.

### A.2 A régua atual, escrita como invariante

```
META (por cargo)   = soma de projeto_vaga_cargo.quantidade
UNIVERSO           = quem está em admissao_projeto (o vínculo, e só ele)
Faltam             = META menos VINCULADAS
Identidade travada = Em Andamento + Concluídas + Faltam = Total De Vagas
                     Na Esteira + Faltam = Total De Vagas
Fora da conta      = DECLINOU, RESCISAO e BANCO_AGUARDAR
Dentro da conta    = pausada (está parada, mas ocupa a posição)
Informação à parte = declínio (recorte cliente + período, nunca soma nem subtrai)
```

Essa régua está **travada por 30 e poucos testes** em `alto-volume-analise.spec.ts`, cada um com o
número real que quebrou na Bienal escrito ao lado. Esse conjunto de testes é o ativo mais valioso da
migração: ele é o detector de regressão que faltou nas 4 rodadas de bug de contagem.

### A.3 O achado que torna a migração possível

`projeto_vaga_cargo` já É a vaga do A&S, só que presa dentro do projeto:

| projeto_vaga_cargo (hoje) | vaga do A&S (pedido) |
|---|---|
| projeto (que carrega o cliente) | cod_cliente |
| cargo_id | cargo_id |
| quantidade | posições |
| grupo_id (a leva) | (segue existindo, como agrupador) |
| implícito: é sempre sazonal | tipo = SAZONAL \| OPERACAO_PADRAO |

Ou seja: **não é substituir um conceito por outro, é PROMOVER um conceito que já existe.** A vaga sai
de dentro do projeto e passa a existir por si; o projeto deixa de ser dono da vaga e vira **agrupador**
de vagas (é ele que carrega período e grupos de entrada, que a vaga sozinha não tem).

E o flag SAZONAL da decisão 3 é exatamente o discriminador que o diretor pediu:
**Alto Volume = as vagas SAZONAIS, agrupadas pelo projeto.** Visão filtrada, não cálculo paralelo.

### A.4 O caminho, em estágios independentes e reversíveis

**Estágio 0, o esqueleto (é o que esta OST desenha).**
`vagas` e `vaga_candidato` nascem **vazias e paralelas**. `vagas` já nasce com `projeto_id` e
`grupo_id` opcionais. Nenhuma linha do Alto Volume muda; nenhum arquivo dos 4 é tocado. É a mesma
disciplina que salvou o Alto Volume na primeira vez: estrutura nova ao lado, não por cima.

**Estágio 1, a META migra (o único estágio obrigatório).**
Cada linha de `projeto_vaga_cargo` vira uma linha de `vagas` (o de/para é a própria FK `projeto_id`,
não há mapeamento a inventar). A análise passa a somar `vagas.posicoes` no lugar de
`projeto_vaga_cargo.quantidade`. **Uma expressão muda, o resto da régua não é tocado.**

A trava contra a 5ª rodada de bug: um comparador que roda a análise NOVA contra a ANTIGA em todos os
projetos e diffa campo a campo. Diferença de um único número em um único projeto barra a migração.
Isso é verificável em produção antes de qualquer tela mudar, porque as duas leituras podem conviver.

**Estágio 2, o vínculo, OPCIONAL e depois.**
Aqui mora o perigo real, e a recomendação é **não fazer junto com o estágio 1**. Motivo concreto:
`admissao_projeto` tem `unique(admissao_id)`, e é esse unique que mantém os baldes exclusivos. Se
`vaga_candidato` permitir a mesma admissão viva em duas vagas, a contagem dobra em silêncio, que é
precisamente o modo de falha que já custou 4 rodadas.

O desenho que dispensa o estágio 2: na liberação, o **projeto é DERIVADO da vaga** (`vaga.projeto_id`),
não escolhido à mão. `admissao_projeto` continua sendo escrito, mas deixa de ser uma decisão humana
paralela e passa a ser consequência da vaga. Não há duas verdades, há uma verdade e um índice.

Se um dia o estágio 2 for feito, o desenho de destino é `admissao_projeto` virar uma **view de mesmo
nome e mesmas colunas** sobre `vaga_candidato` join `vagas`: os 4 arquivos de leitura não mudam uma
linha. Para essa porta ficar aberta, `vaga_candidato` **já nasce** com `admissao_id`, `origem`,
`vinculado_por_id` e `vinculado_em`. Ressalva registrada: view exige mexer nos 2 pontos de escrita e
o drizzle-kit tenta gerenciar a tabela declarada; por isso é estágio à parte, nunca de carona.

### A.5 Riscos nomeados

| Risco | Como se manifesta | Contenção |
|---|---|---|
| Alocação sem admissão entrar na meta | "Na Esteira + Faltam = Total" deixa de fechar | Candidato em seleção NÃO consome posição (ver B.4) |
| Vínculo duplicado por vaga | Contagem dobra sem erro visível | `unique` parcial de admissão viva em `vaga_candidato` |
| Duas vagas do mesmo cargo no projeto | Meta dobra em silêncio | Manter o unique parcial de hoje dentro do projeto |
| Régua reescrita em vez de reusada | Volta a divergência de duas contas | Estágio 1 muda UMA expressão, nada mais |
| Migração sem conferência | Descoberto pela diretoria, na tela | Comparador nova x antiga, projeto a projeto |

---

## B. Modelo de dados do esqueleto

### B.1 Princípio confirmado

**NENHUMA coluna nova em `admissoes`. O vínculo mora em tabela própria.** Confirmado contra o código:
foi exatamente essa escolha que permitiu o Alto Volume nascer sem quebrar Esteira, Gerenciador e
Controle Gerencial, e é o que permite ligar e desligar a frente sem risco.

Ressalva de precisão: `admissoes.id_vacancy` **já existe** (desnormalizado, chave da dedup do Pandapé).
Ela **não** deve virar FK para `vagas.id`: é o id EXTERNO do Pandapé. A ponte é
`vagas.id_vacancy` = `admissoes.id_vacancy`, dois campos externos que se encontram.

### B.2 `vagas`

| Campo | Notas |
|---|---|
| `id` | PK |
| `cod_cliente` | FK clientes (a chave é sempre o cliente, §A.3) |
| `cargo_id` | FK cargos |
| `posicoes` | inteiro, check > 0 (mesmo check de `projeto_vaga_cargo`) |
| `tipo` | enum SAZONAL \| OPERACAO_PADRAO (decisão 3) |
| `status` | enum ABERTA \| PAUSADA \| ENCERRADA \| CANCELADA (vocabulário final depende do relatório) |
| `id_vacancy` | id da vaga no Pandapé, opcional, unique parcial. É o de/para da §A.9 |
| `projeto_id` | opcional, FK projetos_alto_volume. Preenchido = a vaga é do projeto |
| `grupo_id` | opcional, FK projeto_grupo_entrada. A leva de entrada |
| `data_abertura`, `data_limite` | limite obrigatório quando SAZONAL (espelha o período obrigatório do projeto) |
| `responsavel_id`, `criado_por_id`, datas | trilha |

**Unicidade, decisão a confirmar com o diretor:** dentro de um projeto, manter o unique de hoje
(projeto + cargo), que é o que impede a meta de dobrar. Fora de projeto, a mesma dupla cliente + cargo
pode ter várias vagas ao longo do ano, então **não pode haver unique de cliente + cargo**. Os dois
comportamentos convivem por índice parcial, que é o mesmo padrão que `projeto_vaga_cargo` já usa.

### B.3 `vaga_candidato` (o vínculo, a alocação)

| Campo | Notas |
|---|---|
| `id` | PK |
| `vaga_id` | FK vagas, único NOT NULL do desenho |
| referência ao candidato | ver B.5: depende da base de candidatos |
| `admissao_id` | opcional, FK admissoes. Preenchido quando vira admissão |
| `status` | etapa do funil (vocabulário depende do relatório de candidatos) |
| `origem` | AS \| LIBERACAO \| CORRECAO (herda o enum que já existe) |
| `vinculado_por_id`, `vinculado_em` | trilha, e são as colunas que a view do estágio 2 precisa |

**Unique parcial obrigatório:** uma admissão VIVA pertence a UMA vaga. É a tradução direta do
`unique(admissao_id)` de `admissao_projeto`, e é o que impede a contagem de dobrar.

### B.4 A régua de consumo de posição (a mais importante)

A vaga **não inventa régua**. Ela reusa as expressões compartilhadas (`admissaoConcluidaSql`,
`admissaoEmAndamentoExclusivoSql`) e o filtro de farol, exatamente como a análise faz hoje.

Recomendação sobre o candidato ainda em seleção, sem admissão: **NÃO consome posição.** Ele aparece
como balde próprio ("em seleção"), do mesmo jeito que o declínio é informação separada. Se ele
consumisse, a identidade "Na Esteira + Faltam = Total" quebraria no primeiro dia, porque passaria a
existir gente ocupando vaga sem estar na esteira. É a mesma armadilha das 4 rodadas, com roupa nova.

### B.5 O registro de candidato do A&S

`candidatos` tem **CPF como chave primária**, e candidato de seleção frequentemente ainda não tem CPF
conhecido. Isso já foi enfrentado uma vez: foi por isso que `sala_espera` nasceu como tabela separada,
com CPF opcional e sem criar linha em `candidatos`.

Portanto: o registro de candidato do A&S é **tabela própria com CPF opcional**, que aponta para
`candidatos` quando o CPF aparece. Se ela **é** a `sala_espera` promovida ou uma tabela nova ao lado é
decisão que depende do relatório de candidatos, e por isso fica em aberto (ver E).

---

## C. Encaixe com a Liberação

### C.1 Como é hoje

O webhook do Pandapé chama `resolverClienteCargo(idVacancy)`. A vaga do Pandapé **não expõe cliente**
(investigado e confirmado ao vivo, `docs/INVESTIGACAO-NIVEL-VAGA-PANDAPE.md`), então a resolução falha
sempre, e a admissão nasce como **pré-admissão** em `AGUARDANDO_LIBERACAO`, sem cliente e sem cargo. O
consultor digita os dois na tela `/liberacao`.

A fila da liberação **já devolve** `idVacancy`, e **já devolve** `codCliente` e `cargoId` como campos de
sugestão (hoje alimentados pelo match da Sala de Espera). A tela já sabe renderizar sugestão.

### C.2 Dois pontos de encaixe possíveis, e qual usar

| | Onde | Efeito | Veredito |
|---|---|---|---|
| 1 | `resolverClienteCargo` (pandapé) | Admissão nasce COMPLETA e **pula a Liberação** | **Não.** Some a confirmação humana e as respostas que só a liberação coleta (uniforme, contrato, projeto) |
| 2 | `listarAguardandoLiberacao` | A vaga **sugere** cliente e cargo; o consultor confirma | **Sim.** Aditivo, sem mudar comportamento |

O caminho 2 é um `leftJoin vagas on id_vacancy` na consulta da fila. A fila continua a mesma, a tela
continua a mesma, e o que era digitação vira conferência. **É exatamente o que a §A.9 chamava de "de/para
Pandapé para catálogo": ele deixa de ser uma planilha pendente e passa a ser o cadastro de vagas do A&S.**

### C.3 O que a liberação passa a gravar

Dentro da MESMA transação de `aplicarLiberacao`, ao lado do insert que já existe: uma linha em
`vaga_candidato` ligando admissão e vaga. E, quando a vaga pertence a um projeto, o vínculo de projeto
passa a ser **derivado da vaga** em vez de escolhido no seletor. Uma decisão, um lugar.

Ressalva §A.26: esses dois pontos de escrita são código validado. A alteração é aditiva, mas alcança o
nascimento da admissão, então entra como pergunta antes de construir, não como consequência.

---

## D. Permissão e isolamento (requisito de nascimento)

### D.1 O bloqueio real, e é preciso decidir antes de construir

O guard de menu (`auth/guards/menu.guard.ts`, regra 3) dá **BYPASS TOTAL a MASTER e SUPER_ADMIN**. O
frontend faz o mesmo (`isAdmin` = MASTER ou SUPER_ADMIN, no layout e na sidebar).

Logo: **"MASTER não vê as telas de A&S" é impossível no modelo atual.** Não é questão de marcar menu:
o MASTER passa antes de qualquer marcação ser consultada. A decisão 4 do diretor exige tocar o guard
que governa TODAS as operações do sistema, e isso é código validado (§A.26): é a pergunta principal
desta OST.

Três saídas, com recomendação:

| Opção | O que é | Alcance | Veredito |
|---|---|---|---|
| i | Bypass restrito: MASTER segue passando, EXCETO nos menus do grupo A&S | 1 ponto no backend, 1 no frontend | **Recomendada.** Cirúrgica, e travável por teste |
| ii | Papel novo `ATRACAO_SELECAO` | Todo `@Roles`, tela de Usuários, padrões de papel | Alcance grande demais para o ganho |
| iii | Usuário de A&S como COMUM só com os menus de A&S | Zero mudança | **Já funciona hoje**, e resolve metade do requisito |

Recomendação: **iii + i**. A metade "A&S não vê Admissão" sai de graça hoje (COMUM só vê o que foi
liberado). A metade "MASTER não vê A&S" precisa da opção i, e precisa do aval do diretor.

### D.2 A armadilha do grupo de menu

`MENUS_PADRAO_COMUM` é definido como **todos os menus do grupo OPERACAO**. Se os menus de A&S nascerem
nesse grupo, uma execução futura de `backfill-menus-comum` entrega o A&S inteiro a todos os COMUM, como
efeito colateral, que é exatamente o incidente que originou a §A.23.

Portanto: **grupo próprio (`ATRACAO_SELECAO`), nunca OPERACAO.** Consequências, todas pequenas e
mapeadas: o tipo `GrupoMenu` ganha o terceiro valor; a `ConfigMenusModal` já agrupa dinamicamente e só
precisa do rótulo; a `Sidebar` tem a lista de Operação escrita à mão e precisa da seção nova.

### D.3 Fechar a porta da URL desde o nascimento

- Toda rota de A&S entra em `ROTA_MENU` (`frontend/src/lib/menu-rotas.ts`) **junto com a tela**. Sem a
  linha, qualquer autenticado abre a tela digitando a URL, que já aconteceu duas vezes.
- Os menus nascem **só para o SUPER_ADMIN** (§A.23). O catálogo se registra sozinho no boot
  (`MenusCatalogoService`), então o menu aparece na tela de liberação sem ninguém rodar script.

### D.4 Leitura aberta x leitura fechada, a tensão que já mordeu

No Alto Volume, as leituras nascem **abertas** de propósito, senão o seletor da Liberação tomaria 403 na
cara do consultor COMUM (foi o que derrubou o dropdown do Gerador de Kit e o cliente e cargo da
Liberação). Mas as telas de A&S mostram **nome de candidato**, e leitura aberta ali é exposição (§A.6).

Resolução recomendada, que atende os dois lados: **a sugestão de cliente e cargo viaja dentro do payload
da fila da Liberação** (uma leitura que já é aberta e que o consultor já consome), e as rotas próprias
de `/vagas` e de candidatos do A&S **nascem fechadas por menu**. O consultor nunca chama a API de vagas;
ele recebe a sugestão pronta.

---

## E. O que falta para construir

### E.1 Depende de material do diretor

| Material | Trava o quê |
|---|---|
| Relatório de vagas (colunas) | Vocabulário de status, campos do funil, responsável, SLA, o que é filtro de tela |
| Relatório de candidatos (colunas) | O registro de candidato do A&S (tabela própria x sala de espera promovida) e as etapas |
| Formulário Word de abertura de vaga | Os campos da requisição, quem abre, quem aprova, o que é obrigatório |

### E.2 Já dá para fechar sem eles

- O esqueleto `vagas` + `vaga_candidato` com os campos **estruturais** (cliente, cargo, posições,
  sazonal ou padrão, status, id_vacancy, projeto e grupo, o vínculo com trilha).
- A régua de consumo de posição, reusando as expressões existentes.
- O caminho de migração do Alto Volume, com o comparador nova x antiga.
- O encaixe da Liberação como confirmação.
- O desenho de permissão e o grupo de menu próprio.

### E.3 Decisões que dependem só do diretor (bloqueiam o nascimento)

1. **MASTER deixa de ver o A&S?** Autoriza a exceção no bypass do guard (opção i de D.1)? Sem isso, a
   decisão 4 não é implementável.
2. **Candidato em seleção, sem admissão, consome posição?** Recomendação: não (ver B.4).
3. **Duas vagas do mesmo cargo no mesmo cliente?** Recomendação: sim fora de projeto, não dentro.
4. **A vaga do A&S substitui o cadastro de vagas na tela do Alto Volume?** Recomendação: sim, a tela do
   Alto Volume passa a agrupar e analisar, e deixa de cadastrar meta.
5. **Toda vaga sazonal pertence a um projeto?** Recomendação: não. Sazonal é atributo da vaga; projeto é
   o agrupador que carrega período e grupos de entrada.

---

## Anexo, evidências do levantamento (só leitura, nenhum arquivo alterado)

| Verificação | Resultado |
|---|---|
| Quem lê as tabelas do Alto Volume | 4 arquivos, nenhum fora de `admin/alto-volume` e `admissoes.service` |
| Quem escreve `admissao_projeto` | 2 inserts, ambos em `admissoes.service.ts` (liberação e wizard) |
| Testes que travam a régua | `alto-volume-analise.spec.ts`, mais de 30 casos com os números reais |
| Bypass de MASTER | `menu.guard.ts` regra 3, e `auth-context.tsx` (`isAdmin`), confirmados |
| Padrão do COMUM | `MENUS_PADRAO_COMUM` = todos os menus do grupo OPERACAO |
| Fila da Liberação | já devolve `idVacancy`, `codCliente` e `cargoId` como sugestão |
| Vaga do Pandapé | traz `numberVacancies`, NÃO traz cliente nem CNPJ (investigação de 01/07/2026) |
| Chave de `candidatos` | CPF é a PK, e foi por isso que `sala_espera` nasceu separada |

§A.6: este documento trata de estrutura, contagem e nomes de tabela. Sem CPF, sem nome de candidato,
sem URL externa.
