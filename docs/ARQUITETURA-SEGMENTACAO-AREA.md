# Segmentação de área por usuário (fundação do módulo de A&S)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-18 · **Tipo:** desenho de arquitetura (§A.27)
**Regra 3 desta OST:** nada construído, nada commitado. Só a segmentação, nenhuma tela de A&S.
**Substitui:** a proposta de "exceção no bypass do guard" do documento `ARQUITETURA-ATRACAO-SELECAO.md`
(seção D.1, opção i). O modelo por ÁREA é melhor e é o que vale daqui para frente.

---

## 0. O modelo em uma frase

**O papel deixa de significar "vê tudo" e passa a significar "manda na minha área".**

| Papel | Antes | Depois |
|---|---|---|
| SUPER_ADMIN | vê tudo | vê tudo, acima da segmentação (inalterado) |
| MASTER | vê tudo | manda nas SUAS áreas; fora delas, o menu não existe |
| COMUM | só o liberado | só o liberado, e dentro das suas áreas |

**Regra de ouro do desenho: a ÁREA nunca concede, só limita.** Ela é um TETO aplicado por cima da
permissão que já existe, nunca uma fonte de acesso novo. Isso é o que torna a transição segura: enquanto
o teto for "ADM" para todo mundo, absolutamente nada muda no que está no ar.

---

## 1. Como o bypass funciona hoje, e onde o filtro entra

### 1.1 Os cinco pontos de bypass (varredura completa)

| # | Onde | O que faz hoje | O que passa a fazer |
|---|---|---|---|
| 1 | `auth/guards/menu.guard.ts:48` | MASTER e SUPER_ADMIN passam sempre, antes de qualquer consulta | SUPER_ADMIN passa sempre; MASTER passa se o menu da operação for de uma área dele |
| 2 | `auth/auth.controller.ts:69` (`/auth/me`) | admin recebe `menus: {todos:true}` | passa a devolver também as `areas` do usuário |
| 3 | `auth/menus.service.ts:73` e `:111` | admin não sofre filtro ao salvar marcação | filtra também por área (não dá para marcar menu fora da área) |
| 4 | `domain/menus.ts:528` (`codigosPadraoDoPapel`) | MASTER recebe TODOS os códigos | recebe os códigos das suas áreas |
| 5 | `frontend/src/lib/auth-context.tsx:175` (`isAdmin`) | MASTER e SUPER_ADMIN: `temMenu` sempre true | ver 1.3, é o ponto mais delicado do frontend |

### 1.2 O BURACO: o filtro de área no guard de menu NÃO fecha tudo

Existem **duas** autorizações independentes no sistema, e só uma delas passa pelo menu:

- `MenuGuard`, por operação, derivada do menu. É onde a área entra naturalmente.
- `RolesGuard` com `@Roles("MASTER","SUPER_ADMIN")`, por papel puro, **sem qualquer relação com menu**.

A varredura encontrou **12 superfícies protegidas SÓ pelo papel**, que nenhum menu reivindica e que,
portanto, um filtro de área no `MenuGuard` **não alcançaria**:

| Superfície | Menu que a reivindica |
|---|---|
| `UsersController` (controller inteira) | menu `usuarios` tem `operacoes: []`, não reivindica nada |
| `DiagnosticoController` (controller inteira) | menu `diagnostico` tem `operacoes: []`, não reivindica nada |
| `AdmissoesController.trocarCliente` | nenhum |
| `AdmissoesController.corrigirCpf` | nenhum |
| `AdmissoesController.recusar` | nenhum |
| `AdmissoesController.reativarRecusada` | nenhum |
| `AdmissoesController.deletar` | nenhum |
| `NaoConformidadesController.decidirLiberacao` | nenhum |
| `ClientesController.removerVinculo` | nenhum |
| `CatalogosController.addMotivo` / `addBeneficio` / `addEscala` | nenhum |

**A consequência concreta, e é grave:** um Master de A&S continuaria alcançando a **tela de Usuários**
pela API. E a tela de Usuários é justamente onde as áreas são cadastradas, ou seja, ele poderia se
conceder a área ADM. A segmentação viraria decorativa no exato ponto em que precisa ser dura.

**Resolução recomendada:** o `RolesGuard` passa a olhar área também, com a regra "papel exigido **e**
área da operação". Como a maioria dessas superfícies tem um menu correspondente no catálogo (mesmo sem
reivindicar operações), a área sai do menu correspondente; as que não têm (as de admissão, não
conformidade, cliente e catálogos) recebem carimbo explícito de área ADM. É trabalho pequeno, mas
**precisa entrar junto**, senão a fundação nasce com a porta dos fundos aberta.

### 1.3 O frontend: `isAdmin` faz DUAS coisas, e só uma delas muda

`isAdmin` (MASTER ou SUPER_ADMIN) hoje governa duas coisas diferentes no mesmo booleano:

1. **Visibilidade de menu e guard de rota** (`layout.tsx`, `Sidebar.tsx`): isto DEVE virar sensível a área.
2. **Visibilidade de recurso**, sem relação com menu: as "correções de Master" no modal da Esteira
   (`AdmissaoDetalheModal.tsx`) e o alerta de diagnóstico (`DiagnosticoAlerta.tsx`).

Trocar `isAdmin` em bloco quebraria o item 2 em telas validadas (§A.26). O desenho: **`isAdmin`
permanece exatamente como está** (é papel, e papel não mudou), e nasce um `temMenu` sensível a área ao
lado. Quem decide visibilidade de MENU passa a usar o segundo; quem decide visibilidade de RECURSO
continua no primeiro.

### 1.4 De onde o guard lê a área

**Do banco, não do token.** O `JwtAuthGuard` monta o `req.user` a partir do payload do JWT, que é
imutável até o refresh. Área no token significaria "o Rike mudou a área e o usuário só sente ao
relogar", que é o tipo de comportamento que gera chamado.

Lendo do banco, a mudança vale na requisição seguinte. Custo: o MASTER, que hoje sai do guard antes de
qualquer consulta, passa a pagar uma consulta nas operações reivindicadas. Mitigação: **a área vem na
MESMA consulta que já busca os menus** (`codigosDoUsuario`), então é uma consulta, não duas, e só nas
operações que já eram gatadas.

---

## 2. Estratégia de transição (§A.26: ninguém pode perder acesso)

**Backfill explícito de ADM para todos os usuários existentes, na MESMA migration que cria a tabela.**
Atômico: ou as duas coisas acontecem, ou nenhuma.

Por que não um default permissivo ("sem área = vê tudo"): seria fail-open, e o primeiro Master de A&S
cadastrado sem área veria o módulo de Admissão inteiro **em silêncio**. Erro invisível é pior que erro
visível, e a §A.23 já fixou o princípio oposto ("menu que não aparece não é bug, é o diretor não ter
liberado").

Sequência da transição, sem janela de risco:

1. Migration cria o enum, a tabela e **carimba ADM em todos os usuários existentes**, tudo junto.
2. Todo menu que existe hoje é carimbado **ADM** no registro em código.
3. Só então o filtro de área entra nos guards. Como todo usuário é ADM e todo menu é ADM, **o filtro é
   uma identidade: ninguém perde nada, e o comportamento no ar é bit a bit o mesmo.**
4. O Rike passa a ajustar, usuário a usuário, quem é de A&S.
5. Só depois disso os menus de A&S nascem.

**Teste que trava a transição:** o conjunto de menus visíveis de cada usuário existente, antes e depois,
tem de ser idêntico. É verificável por consulta, usuário a usuário, antes de qualquer tela mudar.

**Um teste vai quebrar de propósito**, e é o sinal de que a mudança chegou:
`domain/menus.spec.ts:111` trava `codigosPadraoDoPapel("MASTER") === TODOS_CODIGOS_MENU`. Com área, o
MASTER passa a receber os códigos das suas áreas. A quebra é esperada e o teste é reescrito junto; fica
registrado aqui para não parecer regressão.

---

## 3. Onde o Rike cadastra a área, e a UX

**Sim, na tela que já existe.** A área entra em três lugares, e os três são necessários:

**a) No modal de permissão do usuário (`ConfigMenusModal`), NO TOPO.** A área governa o que a lista
abaixo mostra, então tem de vir antes dela. Marcação múltipla (o modelo é lista), e a lista de menus
abaixo passa a mostrar só os menus das áreas marcadas, ou a mostrar os demais desabilitados com a razão
à vista. Recomendação: **desabilitar em vez de esconder**, pelo mesmo motivo que a tela já desabilita
Diagnóstico e Usuários para COMUM: sumir sem explicação vira chamado.

**b) No formulário de criação de usuário.** Campo de área junto do Papel, para **nenhum usuário nascer
sem área**. Sem isso, todo usuário novo cai no caso da seção 5.

**c) Coluna "Área" na tabela de Usuários**, só leitura, com as áreas como tags. É o que permite ao Rike
auditar de relance quem está em quê, sem abrir um modal por pessoa. §A.12 e §A.20 valem: a coluna entra
com largura própria e com prova visual (§A.13), e as tags seguem §A.24 (title case).

**Um texto vira MENTIRA no dia da mudança, e precisa ser corrigido junto.** O `ConfigMenusModal` exibe
hoje: *"Este usuário é Master e enxerga TODOS os menus sempre, independentemente desta marcação."*
A partir da segmentação isso é falso para o Master. O texto entra no mesmo pacote, senão a tela passa a
ensinar o modelo errado para quem administra.

---

## 4. Como os menus se marcam por área

### 4.1 Área e grupo são coisas diferentes, e não podem se confundir

- **GRUPO** é visual: onde o item aparece na barra lateral (Operação, Administração).
- **ÁREA** é autoridade: quem pode enxergar aquilo.

São ortogonais: o módulo de A&S terá seus próprios itens de operação e de administração, e os dois são
da área AS.

### 4.2 A trava dupla contra o incidente da §A.23

`MENUS_PADRAO_COMUM` é hoje literalmente "todos os menus do grupo OPERACAO". Duas travas, e as duas
entram:

1. **Os menus de A&S nascem em GRUPO PRÓPRIO**, nunca em OPERACAO. É a trava que a OST pediu.
2. **`MENUS_PADRAO_COMUM` é redefinido como "grupo OPERACAO **e** área ADM".** É a trava de reserva: se
   um dia alguém criar um menu de A&S no grupo OPERACAO por engano, o `backfill-menus-comum` continua
   não o entregando a ninguém.

Uma trava sozinha depende de disciplina humana. Duas travam por construção.

### 4.3 A forma do carimbo

`MenuDef` ganha `areas: Area[]` (lista, não valor único, porque um menu pode servir às duas áreas). Todo
menu existente é carimbado `["ADM"]`; `inicio` é carimbado `["ADM","AS"]`, coerente com o
`MENU_SEMPRE_VISIVEL` que já existe (a home nunca some, para ninguém olhar uma barra vazia).

### 4.4 O modelo de dados

`usuario_areas` (`usuario_id`, `area`), chave primária composta. **Espelha `usuario_menus` de propósito**:
mesmo padrão, mesma forma de ler, mesma forma de salvar, nenhum conceito novo a aprender. Área como
`pgEnum` (`ADM` | `AS`) e não como tabela de catálogo, porque o carimbo dos menus vive em código: área
nova exigiria subir versão de qualquer jeito, e um catálogo editável prometeria uma flexibilidade que
não existe. §A.6: a tabela guarda id de usuário e um rótulo de área, sem PII.

---

## 5. Usuário sem área definida

**Regra recomendada: fail-closed. Sem área, o usuário enxerga apenas o Início.**

| Caso | O que acontece |
|---|---|
| Usuário NOVO | **Não existe nascer sem área**: o campo é obrigatório na criação (ADM pré-selecionado) |
| Usuários de hoje | Recebem ADM pelo backfill atômico da migration (seção 2) |
| Sobrou algum sem área (script, importação, falha) | Enxerga só o Início, e a tela de Usuários mostra a tag **"Sem Área"** em destaque |
| SUPER_ADMIN | **Não depende de área**, está acima da segmentação |

O SUPER_ADMIN fora da regra não é conveniência: é a mesma proteção que o código já documenta para o
bypass de menu ("evita alguém se trancar fora"). Com ela, nenhum erro de área é irrecuperável, porque o
Rike sempre entra e conserta.

O fail-closed só é seguro porque vem com o backfill atômico e com a tag visível. Sem esses dois, ele
viraria "usuário sumiu do sistema e ninguém sabe por quê"; com eles, o estado errado é impossível de
criar e visível se existir.

---

## 6. Ordem de construção (a fundação, antes de qualquer tela de A&S)

| Passo | O quê | Por que nesta ordem |
|---|---|---|
| 1 | Enum, tabela `usuario_areas` e backfill ADM, migration única | Nada funciona antes, e tem de ser atômico |
| 2 | Carimbo `areas` em todo menu (todos ADM) | Ainda é identidade: nada muda no ar |
| 3 | Área nos 5 pontos de bypass, mais o `RolesGuard` (o buraco da seção 1.2) | É a mudança de comportamento, e entra inteira ou não entra |
| 4 | UX: criação, modal, coluna, correção do texto que vira mentira | Sem isso o Rike não consegue cadastrar área nenhuma |
| 5 | Grupo próprio e menus de A&S | Só depois da fundação de pé |

---

## 7. Decisões que dependem do diretor

1. **O `RolesGuard` também passa a olhar área?** Recomendação: **sim**, senão um Master de A&S alcança a
   tela de Usuários e se autoconcede ADM (seção 1.2). É a pergunta mais importante desta OST.
2. **Master de A&S enxerga a tela de Usuários da área dele?** Ou seja: ele administra os usuários de A&S,
   ou gestão de usuários é exclusiva do SUPER_ADMIN? Recomendação: **exclusiva do SUPER_ADMIN por ora**,
   é o desenho mais simples e o mais fácil de afrouxar depois.
3. **Confirma o fail-closed** para usuário sem área (seção 5)?
4. **Nomes das áreas**: `ADM` e `AS` como códigos, e os rótulos de tela ("Admissão" e "Atração E
   Seleção", §A.24). Confirmar os rótulos.

---

## Anexo, evidências do levantamento (só leitura, nenhum arquivo alterado)

| Verificação | Resultado |
|---|---|
| Bypass de MASTER no backend | `menu.guard.ts:48`, regra 3, antes de qualquer consulta |
| Bypass de MASTER no frontend | `auth-context.tsx:175`, alimenta `temMenu`, layout e Sidebar |
| Outros pontos que tratam admin | `auth.controller.ts:69`, `menus.service.ts:73` e `:111`, `domain/menus.ts:528` |
| Superfícies só com `@Roles`, sem menu | **12** (2 controllers inteiras mais 10 handlers), listadas em 1.2 |
| Origem do `req.user` | payload do JWT (`jwt-auth.guard.ts`), sem consulta ao banco |
| Consulta de menu no guard | `codigosDoUsuario`, sem cache, uma por operação gatada |
| `MENUS_PADRAO_COMUM` | "todos os menus do grupo OPERACAO" (`domain/menus.ts:525`) |
| Quem usa o padrão | `users.controller.ts:79` (criação), `seed-menus.ts`, `backfill-menus-comum.ts` |
| Teste que quebra de propósito | `domain/menus.spec.ts:111` |
| Texto que vira mentira | `ConfigMenusModal.tsx:118` |

§A.6: este documento trata de estrutura de permissão, nomes de tabela e de arquivo. Sem PII.
