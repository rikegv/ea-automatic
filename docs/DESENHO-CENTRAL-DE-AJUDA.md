# Desenho: Central De Ajuda (manual de uso dentro da plataforma)

> Entregue pelo agente `arquiteto`. É PLANO, não implementação: nenhuma linha de código de produção
> foi escrita nesta frente. O coordenador despacha a construção a partir daqui.
>
> **Resumo em uma linha (REVISADO em 27/09/2026):** **178 artigos mais 18 fichas** curtas de catálogo,
> cobrindo Soul ADM, SouTalent, painéis, configuração e as telas do candidato, entregues em **7 fases
> cortadas por PROFUNDIDADE** (N1, o caminho principal, e N2, o recurso secundário), com prints anotados
> gerados por um motor ancorado em SELETOR (regenerável), gate fail-closed de PII antes de gravar cada
> PNG, e **detector de controle órfão** que mede a cobertura de cada recurso de cada tela.
>
> **A revisão de 27/09 dobrou o inventário (100 peças para 196).** O diretor testou o piloto e apontou
> que o manual precisa cobrir **cada RECURSO de cada tela**, não só como usar a tela. A medição lhe deu
> razão: ver §1, reescrita, e §5, recortada de novo. O número antigo, 84 mais 16, era medido pela TELA.

---

## 0. O que foi medido, e o que foi conferido por amostragem

| Medida | Número | Como foi conferido aqui |
|---|---|---|
| Menus ativos no catálogo | 45 (30 ADMIN, 12 OPERACAO, 3 SELECAO) | `grep -c 'codigo: "'` em `apps/backend/src/domain/menus.ts` devolveu 45, e a extração rótulo por rótulo fecha 30/12/3 |
| Arquivos de tela | 52 `page.tsx` | listagem completa de `apps/frontend/src/app` |
| Telas fora de menu | 5 | `/login`, `/trocar-senha`, `/portal`, `/vt`, `/kit` (a `/kit` está fora de propósito, §A.15, e NÃO vira artigo) |
| Documentos em `docs/` | 103 | 10 deles são `DEMO-*` ou `GUIA-*`, os únicos com cara de passo a passo |
| Abas da Esteira | 5 | `const ABAS` em `esteira/page.tsx`: AUDITORIA, EXAME, CADASTRO, INTEGRAÇÃO, IFRACTAL |
| Telas com `PageHead` | 45 de 52 | as 7 sem: `/login`, `/trocar-senha`, `/portal`, `/vt`, `/esteira`, `/diretoria`, `/diretoria/alto-volume` |
| Maiores telas | `as/vagas` 4027 linhas, `esteira` 3058, `liberacao` 2712, `portal` 2501 | `wc -l` |

**Dois achados novos, que mudam o desenho e não estavam no briefing:**

1. **`PageHead` é o ponto único do botão contextual.** Ele é usado em 45 das 52 telas, e resolve a rota
   por `usePathname()`, então o botão de ajuda nasce em 45 telas **sem tocar nenhuma delas**. Só 3 telas
   internas ficam de fora (`/esteira`, `/diretoria`, `/diretoria/alto-volume`) e precisam do botão
   colocado à mão. Isso é o mesmo desenho que a §A.41 usou no `ui/Modal`: a regra mora no componente,
   não na disciplina de quem edita a tela.
2. **O padrão de dado sintético JÁ EXISTE e é maduro**: os `arnes-*` em
   `apps/backend/src/as/ingestao-pandape/` (`arnes-seed-demo-uma-vaga.ts`, `arnes-seed-tres-vagas.ts`,
   `arnes-limpeza-homolog.ts`). Eles já são fail-closed por nome de database (produção recusada),
   idempotentes, transacionais, com CPF sintético da faixa 999 de dígito válido, e-mail `.invalid`
   (RFC 2606) e telefone de zeros. **O manual não inventa dado de teste: ele ganha um arnês irmão.**

---

## 1. INVENTÁRIO: o tamanho da frente

> **REVISÃO DE 27/09/2026, e ela DOBRA o inventário.** O diretor testou o piloto e levantou a dúvida
> certa: o manual precisa cobrir **cada RECURSO de cada tela**, e não só como usar a tela. Os exemplos
> dele foram "como colocar filtro", "como auditar um documento", "como ver prontuário". A primeira
> versão desta seção dimensionou **84 artigos pela TELA**, e a medição abaixo prova que ele está certo:
> **estava subdimensionada**. O número novo é **178 artigos mais 18 fichas**. A seção antiga fica
> registrada em 1.5, porque a diferença é o que ele precisa ver para decidir.

### 1.1 O QUE FOI MEDIDO, control por control

Nada aqui é estimativa: cada linha saiu de contagem sobre o código.

| Medida | Número | Como foi medido |
|---|---:|---|
| `onClick` em `app/` mais `components/` (sem spec) | **803** | `grep -r onClick --include=*.tsx` |
| `onSubmit` | 36 | idem |
| Componentes de Modal distintos (fora o `ui/Modal`) | **39** | `find components -name "*Modal*.tsx"` |
| Arquivos que abrem `ui/Modal` | 67 | import do `ui/Modal` |
| Usos de `ConfirmDialog` | 39 | import |
| **Instâncias de `ColunaOrdenavel`** | **251**, em 38 telas | `grep -o "<ColunaOrdenavel"` |
| **Campos de filtro (`FiltroCampo`)** | **69**, em 10 telas | `grep -o "<FiltroCampo"` |
| Telas com `FiltroTrigger` | 10 | import |
| Telas com `MultiSelect` | 10 | import |
| Telas com `Select` do design system | 33 | import |
| Telas com exportação (`ExcelLogo`) | 4 | import |
| Telas com o logo do Drive (prontuário) | 4 telas mais a ficha | import de `GoogleDriveLogo` |
| Telas com seleção em massa | 7 | `selecionados` / "Selecionar todos" |
| Modais maiores que 500 linhas | **9** | `AdmissaoDetalheModal` 1812, `VagaPainelModal` 1709, `AuditoriaDocsModal` 1140, `EditAdmissaoModal` 1046, `MoverCandidaturaModal` 941, `ImportarCandidatosModal` 834, `NovoCandidatoModal` 720, `FichaCandidatoModal` 536, `AgendamentoExameModal` 504 |

**O achado que muda o desenho, e ele é o oposto de assustador: DAS 803 AÇÕES, A MAIORIA NÃO É RECURSO
NOVO, É O MESMO RECURSO REPETIDO.** As 251 colunas ordenáveis saem de **um** `ColunaOrdenavel`, e os 69
campos de filtro saem de **um** `FiltroTrigger` mais **um** `MultiSelect`. São **320 controles que a
pessoa aprende UMA vez**. O "como colocar filtro" que o diretor pediu não é um item por tela: é **um
artigo do padrão**, mais uma menção onde o filtro tem campo próprio. O mesmo vale para o
"ver prontuário": o logo do Drive é o MESMO controle em 4 telas e na ficha.

**E o achado que confirma o diretor: a TELA não é a unidade, mas o FLUXO da primeira versão também não
era pequeno o suficiente.** A Esteira foi dimensionada em 15 artigos. Ela tem **5 abas, 10 modais
distintos e 24 colunas ordenáveis**, e três dos seus modais têm mais de mil linhas cada. O
`AuditoriaDocsModal`, sozinho, oferece **visualizar o documento, reauditar, reabrir a pendência,
assumir como válido por decisão humana** e a barra de progresso da régua: eram **um** artigo
("auditar documento com a IA") e são **cinco tarefas** que a pessoa executa em momentos diferentes,
por motivos diferentes, e procura por nomes diferentes.

### 1.2 OS TRÊS BALDES, e o que cai em cada um

Todo recurso do sistema cai em um destes três, e é a classificação que separa 178 artigos de 400
verbetes.

**(c) PADRÃO DO SISTEMA: um artigo, e uma menção onde houver campo próprio.** Aprende-se uma vez e
vale em toda tela. É o balde que **absorve 320 dos 803 controles**, e é ele que impede o manual de
virar catálogo.

| Padrão | Onde repete | Vira |
|---|---|---|
| Filtrar (múltipla seleção, limpar, catálogo por endpoint) | 69 campos, 10 telas | 1 artigo mais uma linha por tela que tem campo próprio |
| Ordenar por clique no cabeçalho | 251 colunas, 38 telas | 1 artigo |
| Buscar dentro da tela | quase toda tela | 1 artigo |
| Card KPI como filtro (toggle) | Gerenciador, Esteira, Vagas, Diretoria | 1 artigo |
| Selecionar várias linhas e agir em lote | 7 telas | 1 artigo |
| Exportar para planilha | 4 telas | 1 artigo |
| Importar de planilha | 6 telas | 1 artigo |
| Abrir o prontuário no Drive | 4 telas mais a ficha | 1 artigo |
| Ler a linha: pill de status, ícone dinâmico, badge de pendência | toda tabela | 1 artigo |
| Como os modais se comportam (Cancelar, Salvar, Escape, e por que clicar fora não fecha, §A.41) | 67 usos | 1 artigo |
| Paginação | toda tabela | 1 artigo |

**(a) ARTIGO PRÓPRIO: tarefa com começo, meio e fim.** O teste é uma pergunta em voz alta com verbo
próprio e resultado próprio: "como eu reabro a pendência de um documento que eu validei sem querer?".
Todo modal de mais de 200 linhas cai aqui, e os 9 modais gigantes caem aqui **várias vezes**.

**(b) PASSO dentro de um artigo maior.** Controle que não tem vida fora da tarefa: o "Ver ASO" dentro de
anexar o ASO, o "Limpar seleção" dentro do lote, o seletor de status dentro de mudar o status. Ele é
**nomeado** (ver 1.4), então continua achável pela busca, mas não ganha artigo.

### 1.3 O NÚMERO NOVO, por módulo

| Módulo | Antes | **Agora** | Fichas | O que cresceu, e por quê |
|---|---:|---:|---:|---|
| 0. Padrões do sistema | 6 | **14** | 0 | absorveu filtro, ordenação, lote, exportar, importar, prontuário, modal, KPI. É o módulo que **encolhe** todos os outros |
| 1. Soul ADM | 45 | **87** | 0 | aberto em 1.3.1 |
| 2. SouTalent | 11 | **29** | 0 | `as/vagas` tem 4027 linhas e 5 modais, o `VagaPainelModal` tem 1709, e `as/candidatos` tem 9 modais próprios. Eram 11 artigos para 14 modais |
| 3. Painéis e gestão | 4 | **7** | 0 | Controle Gerencial (1561 linhas, 42 ações) e Alto Volume da diretoria (2066 linhas, 23 colunas) |
| 4. Catálogos e configuração | 15 | **36** | **18** | as 16 fichas se sustentam (ver 1.4), mas as telas de admin com regra própria não: `admin/alto-volume` 2429 linhas, `admin/portal-links` 1428, `admin/diagnostico` 1301, `admin/regua` 917, `admin/clientes` 937 |
| 5. Telas do candidato | 3 | **5** | 0 | `/portal` tem 2501 linhas e a conferência tem estado próprio |
| **Total** | **84 mais 16** | **178 mais 18** | | **196 peças, contra 100. 2,0x** |

#### 1.3.1 Módulo 1 aberto: 45 para 87

| Frente | Antes | Agora | O que entrou |
|---|---:|---:|---|
| Panorama e vocabulário | 1 | 2 | o mapa das frentes, mais um artigo só de vocabulário: farol, frente, régua, pendência obrigatória, banco |
| Nova Admissão (wizard, 1293 linhas) | 3 | 6 | uma etapa do wizard por artigo, mais reaproveitar por CPF, mais o padrão do cliente que pré-preenche, mais salvar com obrigatório vazio |
| Liberação Admissional (2712 linhas, 14 colunas) | 3 | 8 | liberar em lote, recusar, reativar recusada, vincular sala (modal próprio), pré-liberação, e os filtros próprios da fila |
| Esteira, aba Auditoria | 4 | 8 | o `AuditoriaDocsModal` rende 5 sozinho: visualizar, reauditar, assumir como válido, reabrir pendência, ler a régua. Mais solicitar reenvio e zerar tentativas |
| Esteira, aba Exame | 3 | 6 | reagendar é gesto diferente de agendar, ver o ASO, relatório da clínica em CSV, e "liberar apto sem ASO validado", que é aceite e gera trilha |
| Esteira, aba Cadastro | 3 | 5 | importar matrículas, e concluir e sair da fila |
| Esteira, aba Integração | 3 | 5 | lote, apresentação, e desconsiderar, que são três modais distintos |
| Esteira, aba iFractal | 2 | 3 | |
| **Aceite de avanço com pendências** | **0** | **1** | **não estava no inventário, e é regra de domínio 8**: o `AceiteLiberacaoModal` grava trilha permanente |
| **A ficha da admissão** | **0** | **3** | **não estava**, e o `AdmissaoDetalheModal` tem **1812 linhas** e é a tela mais aberta do sistema. Ler a ficha, o que cada bloco mostra, e o veredito do ASO pela IA |
| Declínio e pausa | 2 | 3 | |
| Gerenciador | 3 | 6 | os 5 KPIs como filtro, exportar relatório (modal próprio), editar a ficha |
| Não Conformidades | 3 | 5 | |
| Benefícios (1439 linhas) | 2 | 5 | regras do cliente (modal), a memória de pacote por cliente e cargo, marcar como cadastrado |
| Sala De Espera | 2 | 3 | |
| Gerador De Kit | 3 | 4 | |
| Ass.Click | 4 | 6 | |
| Assinante Da Empresa | 1 | 1 | |
| Portal, lado do time (2501 linhas) | 2 | 5 | gerar o link, reenviar, acompanhar a conferência, o que fazer quando o CPF trava, reprovar e pedir ajuste |
| VT, lado do time | 1 | 2 | |
| **Total** | **45** | **87** | |

### 1.4 A PERGUNTA "O QUE ESSE BOTÃO FAZ" SE RESPONDE SEM UM ARTIGO POR BOTÃO

O diretor quer poder perguntar de qualquer controle. Se isso virar um verbete por controle, são **550 a
650 verbetes** (os 803 `onClick` menos os 320 do balde (c), menos os fechar e cancelar), que ninguém lê
e que envelhecem todos juntos. **A resposta NÃO é o verbete. São quatro peças, e três delas são de
graça porque saem dos artigos que já vão existir.**

**1. Todo controle é NOMEADO em algum passo, e isso é um campo do contrato.** O `Passo` ganha
`controles: string[]`, que é o rótulo literal do controle como ele aparece na tela ("Reauditar",
"Assumir como válido", "Desconsiderar"). É o que a pessoa lê no botão, não o que a fábrica chama
internamente.

**2. A BUSCA indexa `controles` com peso ALTO, e `termos` continua sendo o sinônimo.** Quem digita
"reauditar" cai no artigo "Auditar Um Documento", **no passo certo**. Quem digita "como filtro por
cliente" cai no artigo do padrão de filtro. **A intuição do coordenador está CORRETA, e a medição a
reforça:** é a busca mais o sinônimo que respondem à pergunta, não o artigo por botão. O que faltava na
intuição é que `termos` sozinho não basta, porque `termos` é escrito pensando em SINÔNIMO e o diretor
está perguntando pelo **rótulo exato**. Sem `controles`, o rótulo exato de um controle que é passo
intermediário não está indexado em lugar nenhum.

**3. Link direto para o PASSO, não só para o artigo.** `/ajuda/auditar-documento#passo-4`. Sem isso a
busca acerta o artigo e a pessoa continua caçando entre doze passos, que é o mesmo fracasso com outra
cara.

**4. O índice "NESTA TELA", e é ele que fecha a promessa.** No painel contextual de cada tela, uma lista
**gerada** de todos os controles daquela tela, cada um com link para o artigo e o passo que o explica. É
o catálogo de botão que o diretor quer, **sem ser escrito como catálogo**: ele é derivado dos campos
`controles` dos artigos daquela rota, custa zero de redação e zero de manutenção própria, e morre junto
com o artigo quando o artigo morre.

**E agora a cobertura deixa de ser promessa e passa a ser MEDIDA: o DETECTOR DE CONTROLE ÓRFÃO.** O
motor de captura já abre cada tela logado. Ele passa a **enumerar os nomes acessíveis dos controles da
tela** (papel `button`, `link`, `tab`, `combobox`) e a comparar com a união dos `controles` declarados
pelos artigos daquela rota. Controle na tela e em nenhum artigo é **lacuna de documentação, reportada
por tela e por controle**. É o detector 6 da §7, ele nasce na Fase 0 junto do motor, e é a única forma
de responder ao diretor "o manual cobre cada recurso" com um número em vez de uma opinião. Nasce como
**relatório**, não como falha dura, porque no primeiro dia ele acusa 600 lacunas; vira falha dura no
fim da Fase 5, quando o número chegar a zero, e aí passa a ser o que impede a próxima tela de nascer
sem manual.

**Uma consequência que o diretor precisa saber, e ela é boa:** com `controles` no contrato, **a régua de
"cobri a tela inteira?" para de ser julgamento do agente que escreve**. Ele roda o detector, vê o que
sobrou, e escreve o passo que falta.

### 1.5 AS QUATRO REGRAS DE RECORTE, revisadas

1. ~~A unidade é o FLUXO~~ → **A unidade é a TAREFA, e tarefa é menor que fluxo.** O teste é ter verbo
   próprio e resultado próprio. "Operar a aba Auditoria" é fluxo e não é artigo; "assumir um documento
   como válido" é tarefa e é artigo. Foi esta troca que levou 84 a 178.
2. **Catálogo simples não ganha artigo, ganha FICHA, e isso se sustentou na medição.** Os 16 catálogos
   de ADMIN têm de 2 a 4 colunas ordenáveis, zero modal próprio e o mesmo CRUD. Um artigo modelo mais
   ficha de 5 linhas continua certo. **Dezoito** agora, com os catálogos de A&S.
3. **Padrão do sistema é UM artigo, nunca um por tela.** Regra nova, e é a mais valiosa: ela sozinha
   evitou algo entre 300 e 400 artigos.
4. **Tela que o TIME não opera vira conhecimento de suporte**, e **tela fora de menu de propósito não
   existe no manual** (a `/kit`, §A.15).

### 1.6 O CUSTO DE PRINT, reestimado, e ele NÃO dobra

Aqui a aritmética ingênua erra, e vale mostrar por quê. O artigo antigo era gordo, com 3 a 5 prints de
tela cheia; o artigo novo é magro, com **2 a 3 prints**, porque cobre uma tarefa só. E, mais importante:
**o que determina o custo de print é o número de CONTROLES anotados, não o número de artigos.** Os
controles são os mesmos 550 a 650 nas duas versões, porque o sistema é o mesmo; a versão antiga apenas
os empacotava em menos arquivos.

| | Antes | Agora |
|---|---:|---:|
| Peças de conteúdo | 100 | 196 |
| Prints por peça | 3 a 5 | 2 a 3 |
| **PNGs** | **280 a 400** | **450 a 600** |
| Controles anotados | 700 a 1200 (com repetição entre artigos gordos) | 550 a 650 (uma vez cada, e o detector prova) |
| Regeneração completa, em máquina | 1 a 2 horas | **2 a 3 horas** |

**Os PNGs sobem cerca de 60%, não 100%.** E o tempo de máquina sobe menos que o número de PNGs, porque
o caro de uma captura é o preparo (logar, semear, navegar, abrir o modal), e artigos da mesma aba
compartilham o mesmo preparo: o motor agrupa capturas por roteiro e amortiza.

**O que sobe de verdade é a REDAÇÃO**, e é honesto dizer: 196 cabeçalhos, 196 blocos "Antes De Começar"
e 196 blocos "Se Der Errado" contra 100. **A mitigação é de contrato, não de esforço:** "Antes De
Começar" e "Se Der Errado" passam a aceitar **referência a um bloco compartilhado** por família de
artigos (todos os artigos da aba Auditoria têm o mesmo pré-requisito e os mesmos três erros), em vez de
cópia. Sem isso, a redação é onde os 178 artigos ficariam caros, e onde eles divergiriam entre si.

---

## 2. ESTRUTURA: sumário, navegação, busca e a cara do artigo

### 2.1 Navegação

- **`/ajuda`**, o sumário: busca no topo, os 6 módulos como blocos, e as **trilhas** em destaque.
  Trilha é uma sequência ordenada de artigos que resolve um trabalho inteiro ("Admitir Alguém De Ponta
  A Ponta", 12 artigos; "Abrir Uma Vaga E Entregar A Posição", 7). É a diferença entre um índice e um
  treinamento.
- **`/ajuda/[slug]`**, o artigo: migalha (módulo, artigo), corpo, e no pé "Anterior E Próximo Da Trilha"
  mais "Artigos Relacionados".
- **Painel lateral contextual**, aberto pelo botão de ajuda de cada tela. Abre o artigo da rota atual
  **ao lado** da tela, não em cima dela.

**Por que painel lateral e não modal, e isto é decisão de desenho:** o manual existe para a pessoa
executar enquanto lê. Modal bloqueia justamente a tela que ela precisa clicar, e a §A.41 (modal não
fecha por clique fora) tornaria o bloqueio ainda mais firme, com razão. O painel tem "Fechar" no
cabeçalho e fecha com Escape, sem clique fora, no mesmo espírito da §A.41.

### 2.2 Busca, simples e sem IA

- **Índice gerado em build**, não em runtime. Um script varre os módulos de conteúdo e emite
  `ajuda-indice.json` com `slug`, `titulo`, `resumo`, `termos`, texto dos passos e o módulo.
- **Normalização**: minúsculas e sem acento nos dois lados (`NFD` mais remoção de diacrítico), então
  "liberacao" acha "Liberação".
- **Campo `termos`, e ele é o que faz a busca funcionar.** É a lista das palavras que a pessoa digita de
  verdade, e que não estão no título: "ASO", "atestado", "exame médico", "médico", "clínica" todos levam
  ao artigo do ASO. Sem sinônimo, busca por texto vira busca por sorte, e é aqui que a maioria dos
  manuais internos morre.
- **Ranking**, em quatro níveis: título, depois `termos`, depois gesto de passo, depois corpo. Todos os
  termos da consulta precisam bater (AND), com realce do trecho no resultado.
- **Tamanho**: 100 peças dão um índice na casa de 150 KB. Carregado sob demanda no primeiro toque na
  busca, não no bundle inicial.
- **Sem resultado** oferece duas saídas: os artigos do módulo da tela em que a pessoa estava, e o botão
  "Reportar" da §6.

### 2.3 A cara do artigo

Ordem fixa, e ela é parte do desenho: a pessoa que já sabe pula direto para os passos, e quem não sabe
lê o topo.

1. **Título** em title case (§A.24).
2. **Para Quem É** e **Quando Usar**, duas linhas.
3. **Antes De Começar**: qual menu é necessário, qual papel, e o que já tem de existir no sistema
   ("a admissão já precisa estar liberada").
4. **Passos numerados**. Um gesto por passo. Passo com print carrega o print logo abaixo, e a legenda
   do print repete o número do passo.
5. **Se Der Errado**: sintoma e ação, com os erros reais da tela ("o botão está apagado", "aparece
   Origin não permitida", "o CPF ficou bloqueado por 15 minutos").
6. **Regras Que Valem Aqui**: as regras de negócio em linguagem de usuário. "O Cadastro só abre depois
   que Auditoria e Exame fecham" e não "gate F12".
7. **Artigos Relacionados**.

**Travas de produto, todas checáveis em revisão:** §A.11 travessão proibido em todo o texto, célula
vazia é "não informado"; §A.24 title case em título, aba e tag, e escrita normal em frase de apoio e
em texto de botão de ação; §A.12/§A.20/§A.29 se o artigo tiver tabela, a tabela é a máscara única,
com larguras conferidas e ordenação por clique; §A.35 qualquer seletor da tela de ajuda é o `Select` do
design system, com busca quando a lista passa de 8 opções.

### 2.4 Onde o conteúdo mora, e por que não é markdown

```
apps/frontend/src/ajuda/tipos.ts                  contratos (Artigo, Passo, Print, Alvo, Roteiro)
apps/frontend/src/ajuda/conteudo/<modulo>/<slug>.ts   um artigo por arquivo, TypeScript tipado
apps/frontend/src/ajuda/conteudo/registro.gerado.ts   barrel GERADO por script, nunca editado à mão
apps/frontend/src/ajuda/capturas/<slug>.roteiro.ts    roteiro de captura, ao lado do artigo
apps/frontend/public/ajuda/<slug>/NN-<nome>.png       os prints
tools/ajuda/                                          o motor de captura e anotação
```

**Três motivos para TypeScript e não markdown ou MDX:** o frontend hoje não tem nenhum renderizador de
markdown nas dependências, e MDX puxa cadeia de build nova; o conteúdo tipado é **conferido pelo
typecheck** (artigo sem `fontes`, com `slug` duplicado ou com rota inexistente não compila); e o
`registro.gerado.ts` ser gerado por script, em vez de mantido à mão, é o que permite dois agentes
escreverem artigos em paralelo sem colidir num arquivo compartilhado (§A.39, dono único do arquivo
compartilhado, resolvido por geração em vez de por disciplina).

### 2.5 Contratos entre camadas

```ts
// apps/frontend/src/ajuda/tipos.ts  (dono: coordenador, é vocabulário compartilhado)
export type Alvo = {
  /** Papel acessível mais nome, o localizador preferido: sobrevive a mudança de CSS. */
  papel?: "button" | "link" | "tab" | "textbox" | "combobox" | "cell" | "heading";
  nome?: string | RegExp;
  /** Só quando não há papel acessível. Seletor de teste é preferido a seletor de classe. */
  seletor?: string;
  /** O rótulo vermelho desenhado ao lado da elipse. */
  texto: string;
  forma?: "elipse" | "retangulo";
  /** Sugestão de lado. O motor pode ignorar por falta de espaço ou por colisão. */
  lado?: "esquerda" | "direita" | "acima" | "abaixo";
};

export type Print = { arquivo: string; legenda: string; alvos: Alvo[] };
export type Passo = {
  gesto: string;
  detalhe?: string;
  print?: Print;
  /**
   * REVISÃO 27/09: os RÓTULOS LITERAIS dos controles que este passo explica, como eles aparecem na
   * tela ("Reauditar", "Assumir como válido"). Três usos, e nenhum deles é decorativo:
   *   1. a BUSCA os indexa com peso alto, logo abaixo do título (§1.4), então quem digita o nome do
   *      botão cai no artigo certo sem que exista um artigo por botão;
   *   2. o índice "Nesta Tela" é GERADO a partir deles;
   *   3. o DETECTOR DE CONTROLE ÓRFÃO compara esta lista com os nomes acessíveis da tela (detector 6).
   */
  controles?: string[];
  /** Âncora do link direto: `/ajuda/<slug>#<ancora>`. Sem ela a busca acerta o artigo e a pessoa
   *  continua caçando entre doze passos. */
  ancora?: string;
};

export type Artigo = {
  slug: string;
  titulo: string;
  modulo: ModuloAjuda;
  /** Rotas que este artigo ensina. Alimenta o botão contextual e o detector de rota morta. */
  rotas: string[];
  /** Códigos de menu necessários, lidos do registro de menus. */
  menus: string[];
  publico: "OPERACAO" | "GESTAO" | "AMBOS";
  resumo: string;
  /** Sinônimos de busca. O que a pessoa digita, não o que a tela escreve. */
  termos: string[];
  /**
   * REVISÃO 27/09: N1 é o caminho principal (quem lê só os N1 consegue trabalhar), N2 é o recurso
   * secundário (quem lê os N2 resolve o caso estranho). É o eixo de corte das fases (§5).
   */
  nivel: "N1" | "N2";
  /** Família de artigos que compartilham pré-requisito e erros comuns (ex.: "esteira-auditoria"). */
  familia?: string;
  /** Referência ao bloco compartilhado da família, em vez de CÓPIA. Sem isso, 87 artigos de Soul ADM
   *  nascem com o mesmo bloco duplicado e divergem no primeiro ajuste (§1.6). */
  preRequisitos: Array<string | { daFamilia: true }>;
  passos: Passo[];
  seDerErrado: Array<{ sintoma: string; acao: string } | { daFamilia: true }>;
  regras: string[];
  relacionados: string[];
  /** ARQUIVOS DE TELA que este artigo ensina. É a máquina de detecção da §7. */
  fontes: string[];
  /** Data da última conferência humana do conteúdo. */
  revisadoEm: string;
};

export type Roteiro = {
  slug: string;
  url: string;
  /** Arnês de dado sintético exigido por esta captura. */
  arnes?: string;
  /** Gestos de preparo antes do clique do print (abrir modal, trocar aba, digitar na busca). */
  preparo?: Array<{ acao: "clicar" | "digitar" | "abrirAba" | "rolarAte"; alvo: Alvo; valor?: string }>;
  capturas: Print[];
};
```

Backend: só `AjudaFeedbackDto` entra em `packages/shared-types`, e **quem escreve esse arquivo é o
coordenador** (§A.39, e o arquivo é único, §A.39 mais a nota de que `export *` quebra um dos dois lados).

---

## 3. OS PRINTS ANOTADOS: o que é automático, o que exige dado, o que é inviável

O spike (`scratchpad/spike-anotacao.mjs`, resultado em `prova/90-spike-anotacao.png`) foi lido linha por
linha. Ele prova o caminho e deixa claro o que falta.

### 3.1 O que o spike já provou

- O harness abre a tela logado, resolve a **caixa do elemento pelo localizador do Playwright** (papel e
  nome acessível, ou seletor CSS), injeta um SVG sobreposto com elipse e seta vermelhas nas coordenadas
  e tira o screenshot.
- **A anotação é descrita por SELETOR, não por pixel.** Esta é a única razão pela qual um manual com
  centenas de prints é sustentável: quando a tela muda, o print é **regerado**, e ninguém redesenha seta
  à mão.
- A divisão de responsabilidade está certa: o localizador é resolvido **fora** do navegador (só o
  Playwright entende papel e nome acessível) e só coordenadas cruas entram na página, onde existe apenas
  o CSS do próprio navegador.

### 3.2 Os sete consertos que o motor precisa, e o spike não tem

1. **Borda e colisão de rótulo, o defeito conhecido.** O spike ancora o rótulo em `cy-100` fixo, então
   elemento no topo da tela sai com rótulo cortado. O motor escolhe o lado **medindo a folga**: acima se
   couber a altura do rótulo mais margem, senão abaixo; esquerda ou direita pela metade da tela onde o
   elemento está. Em seguida **prende as coordenadas ao viewport** (clamp) e mantém a lista dos
   retângulos já desenhados para **empurrar o próximo rótulo** que colidiria. Sem isso, dois alvos
   próximos escrevem um sobre o outro, que é o mesmo defeito com outra causa.
2. **Largura do texto medida, não estimada.** O spike usa `texto.length * 8`, que erra com acento,
   maiúscula e fonte diferente. O motor insere o `<text>`, lê `getComputedTextLength()` e só então
   desenha o retângulo de fundo.
3. **Alvo não encontrado é FALHA DURA.** O spike só imprime "AVISO". No motor, alvo que não resolve
   **derruba a captura com código de saída diferente de zero**, porque é exatamente o detector de artigo
   velho da §7. Aviso que ninguém lê é a diferença entre detecção e esperança.
4. **Rolagem, e a armadilha do `position: fixed`.** Elemento abaixo da dobra exige
   `scrollIntoViewIfNeeded` antes de medir. E o overlay do spike é `position: fixed`, o que funciona no
   screenshot de viewport e **quebra em screenshot de página inteira**, porque o fixed acompanha a
   viewport e a anotação sai no lugar errado. O motor decide um caminho: captura de viewport com overlay
   `fixed`, ou captura de página inteira com overlay `absolute` em coordenadas de documento. Nunca os
   dois no mesmo caminho.
5. **Nitidez e estabilidade.** Viewport 1600x1000 com `deviceScaleFactor: 2`, animação e o fundo Aurora
   desligados por CSS injetado, para que dois prints da mesma tela saiam iguais e o diff do git só acuse
   mudança real.
6. **Tema claro, sempre.** Print de tema escuro fica ilegível impresso e em projeção. Decisão 4 da §10.
7. **Usuário de captura MASTER, não o super admin.** O super admin da homologação abre modais que
   renascem (Diagnóstico, "Estou ciente"), e o spike gasta seis linhas lutando com eles. Um usuário
   MASTER dedicado à captura não vê esses modais, e torna o motor determinístico.

### 3.3 O que exige DADO na tela, e a resposta

Tela vazia não ensina nada, e tela cheia com dado real é vazamento. A resposta é um arnês irmão dos que
já existem.

**`apps/backend/src/db/arnes-seed-manual.ts`**, no padrão comprovado dos `arnes-*` de A&S: fail-closed
por nome de database (produção `ea_automatic` recusada), idempotente com ids fixos e
`ON CONFLICT DO NOTHING`, transacional, não executável por import, e removível por
`arnes-limpeza-manual.ts`. Ele povoa, com 12 candidatos sintéticos de nome realista, CPF da faixa 999
com dígito válido, e-mail `.invalid` e telefone de zeros:

| Estado que o manual precisa mostrar | Quantos | Prints que dependem dele |
|---|---:|---|
| Admissão aguardando liberação, e uma recusada | 2 | Liberação (3 artigos) |
| Régua incompleta e documento inconforme | 2 | Auditoria (4) |
| Exame a agendar, agendado e apto | 3 | Exame (3) |
| Em Cadastro, com e sem matrícula | 2 | Cadastro (3) |
| Em Integração, sem agendamento e agendada | 2 | Integração (3) e o farol de cor da linha |
| Concluída com envelope assinado, e uma aguardando | 2 | Ass.Click (4), Gerador De Kit (3) |
| Declinada | 1 | a tag "Declínio" da coluna de pendências (§A.16) |
| Vaga em revisão e vaga aberta com funil povoado | 2 vagas, 7 pessoas | SouTalent (11). Aqui o `arnes-seed-demo-uma-vaga` existente já resolve quase tudo |

### 3.4 A GARANTIA DE QUE NENHUM PRINT CARREGA PII (§A.6, §A.38)

Print entra no git, e **git guarda para sempre**: um PNG com CPF real não se desfaz com um commit de
remoção. Então a garantia é em camadas, e a última é fail-closed, no mesmo espírito da §A.33 (abster-se
é seguro, gravar errado é irreversível).

1. **Ambiente travado.** O motor **recusa rodar** se a URL base não for a homologação
   `http://10.18.117.235:3120` (§A.32), ou se o database alvo do arnês não for o de homologação.
   Produção nunca é fonte de print.
2. **Dado sintético pelo arnês**, com allowlist explícita: o arnês **exporta** a lista dos nomes, CPFs e
   e-mails que criou. Essa lista é o contrato do gate.
3. **Gate determinístico ANTES de gravar o PNG.** Depois de preparar a tela e antes do `screenshot()`, o
   motor lê o **texto visível do DOM** da região que vai ser capturada e **recusa a captura** se achar:
   qualquer string com forma de CPF fora da faixa 999; qualquer nome de pessoa fora da allowlist do
   arnês; qualquer e-mail que não termine em `.invalid`; qualquer telefone que não seja o padrão de
   zeros. Recusou, **não grava arquivo nenhum** e sai com erro, nomeando o artigo e o alvo. A guarda mora
   no código, não na disciplina de quem edita.
4. **As telas que não se deixam povoar** ganham tratamento explícito no roteiro, artigo por artigo:
   - **Diagnóstico Do Sistema** e **Controle Gerencial**: são contagem agregada sobre a base inteira da
     homologação. Print **recortado** (`clip` na caixa do bloco) só no controle que o passo ensina, sem
     nenhuma lista de pessoa.
   - **Alto Volume, modal "Ver Pessoas"**: devolve nome por construção. Print recortado no cabeçalho e em
     duas linhas do arnês, com o resto fora do corte.
   - **Entradas Do Pandapé**: payload de terceiro. Print só do controle, nunca do corpo do payload.
5. **O gate vira TESTE, e o `tester` o escreve, não o autor** (§A.38): `ajuda-pii.spec.ts` sobre o
   detector, com casos que DEVEM ser recusados (CPF de faixa comum, nome fora da allowlist, e-mail
   `@gmail.com`) e casos que devem passar (faixa 999, `.invalid`). Qualquer mudança futura que enfraqueça
   o detector quebra o teste antes de existir print nenhum.

### 3.5 O que é inviável automatizar, e o plano assume

| Inviável | Por que | O que se faz |
|---|---|---|
| Print do celular do candidato (`/vt`, `/portal` em 4G) | o acesso público está pendente de infra com o Fernando (§A.17), e a homologação não tem a chave do link de VT | capturar em **viewport de celular** (390x844) no mesmo endereço interno. É a tela certa, no tamanho certo, sem depender do ingress |
| Anotar gesto que dura no tempo (arrastar, rolar, duplo clique) | print é quadro parado | dois prints, antes e depois, com o gesto escrito no passo. GIF e vídeo ficam **fora do escopo** |
| Print do e-mail que a Clicksign envia, e do PDF assinado | artefato de terceiro | descrever em texto, e usar o `demo-kit-pdf-mae.pdf` que já está em `public/` |
| Escolher **qual** elemento anotar | é julgamento pedagógico | é humano, e é o trabalho do agente que escreve o artigo. O motor executa a escolha, não a toma |
| Estado que depende de cron ou de terceiro ao vivo (tick da Clicksign, webhook do Pandapé) | não se fabrica por clique | o arnês grava o estado direto no banco, e o print é da tela lendo esse estado |

---

## 4. ONDE FICA: recomendação, sem empate

**Os dois, e o contextual é o que importa.**

1. **Menu próprio "Central De Ajuda"**, registrado em `domain/menus.ts` com `areas: ["ADM", "AS"]` (serve
   aos dois times, como o `inicio`), grupo `OPERACAO`. É a porta de quem vai **estudar**: sumário,
   trilhas e busca.
2. **Botão de ajuda em cada tela**, dentro do `PageHead`. É a porta de quem está **travado agora**, e é
   ela que decide se o manual é usado ou esquecido. Ninguém para o que está fazendo, navega até um menu e
   procura: a pessoa quer a resposta da tela em que ela já está.

**O que isso custa, e é pouco:** o botão nasce em **45 das 52 telas sem tocar nenhuma delas**, porque o
`PageHead` resolve a rota por `usePathname()` e consulta o registro de artigos. Só `/esteira`,
`/diretoria` e `/diretoria/alto-volume` precisam do botão colocado à mão; as 4 telas de candidato e de
autenticação ficam fora de propósito.

**Detalhe que não é detalhe:** a tela pode ter **vários** artigos (a Esteira tem 15). O botão abre o
painel com **a lista dos artigos daquela rota**, filtrada pela **aba ativa** quando a tela tem abas, e
não um artigo adivinhado. Adivinhar errado é pior que listar.

**§A.23 se aplica, e o diretor precisa saber:** menu novo nasce visível **só para o SUPER_ADMIN**. A
fábrica registra no catálogo e para aí; liberar quem vê é gesto dele, na tela de Usuários. O menu de
ajuda não aparecer para o time no primeiro dia **não é bug**.

---

## 5. FASES: sete, e o corte muda de MÓDULO para PROFUNDIDADE

> **REVISÃO DE 27/09/2026.** As seis fases foram dimensionadas para 100 peças e cortadas **por módulo**.
> Com 196 peças o corte por módulo **para de funcionar**, e não por tamanho: por consequência. Corte por
> módulo entrega um Soul ADM exaustivo e um SouTalent com zero artigo por meses, e o time de A&S fica
> sem manual enquanto a fábrica detalha o quinto botão da aba Auditoria. **O corte novo é por
> PROFUNDIDADE**, com dois níveis declarados no artigo:

- **N1, o caminho principal.** A tarefa que a pessoa faz todo dia, uma por tela ou por aba. Quem ler só
  os N1 **consegue trabalhar**.
- **N2, os recursos secundários.** Reabrir uma pendência, zerar tentativas, desconsiderar a integração,
  reativar uma recusada. Quem ler os N2 **consegue resolver o caso estranho**, que é exatamente o que o
  diretor pediu ao dizer "cada recurso".

**Por que isto é melhor, e é a §A.40 aplicada:** o manual fica ÚTIL de ponta a ponta na Fase 3, com
cerca de 70 artigos, e exaustivo na Fase 6. Cortando por módulo, ele só fica útil de ponta a ponta na
última fase.

| Fase | Entrega | Peças | O que o diretor valida |
|---|---|---:|---|
| **0. Motor, formato e MEDIÇÃO** | motor com os 7 consertos, gate de PII com teste, arnês do manual, shell `/ajuda` e `/ajuda/[slug]`, busca com `controles` indexado e link para o passo, índice "Nesta Tela", **detector de controle órfão em modo relatório**, e 3 artigos piloto | 3 | o FORMATO do artigo, a qualidade do print, **e o primeiro relatório de cobertura**, que é o número que responde à pergunta dele |
| **1. Padrões do sistema** | módulo 0 inteiro: filtrar, ordenar, buscar, KPI como filtro, lote, exportar, importar, prontuário, ler a linha, modais, paginação, entrar, tema e perfil, por que não vejo um menu | 14 | **é a fase que decide o tamanho de todas as outras.** Aprovado o artigo de filtro, 69 campos de filtro em 10 telas estão documentados |
| **2. N1 do Soul ADM** | panorama, vocabulário, Nova Admissão, Liberação, as 5 abas, a ficha, declínio, Gerenciador, Benefícios, Kit, Ass.Click, Portal e VT pelo lado do time | ~38 | **se o time admite alguém lendo só isso** |
| **3. N1 do SouTalent, painéis e candidato** | Central De Vagas, Central De Candidatos, a ponte para admissão, Controle Gerencial, Alto Volume, as telas do candidato | ~24 | **se A&S opera lendo só isso.** Aqui o manual passa a cobrir o sistema inteiro no nível de trabalho |
| **4. N2 do Soul ADM** | os recursos secundários das mesmas telas da Fase 2, o balde (a) que a versão antiga escondia em passos | ~49 | o caso estranho: reabrir pendência, reativar recusada, desconsiderar, zerar tentativa, aceite com pendência |
| **5. N2 do SouTalent, configuração e catálogos** | N2 de A&S e dos painéis, as 36 telas de configuração e as 18 fichas | ~59 | o artigo modelo de catálogo, que é o que decide se 18 fichas bastam. **E o detector de controle órfão chegando a zero** |
| **6. Manutenção viva** | detector de artigo velho no CI, **detector de controle órfão virando falha dura**, regeneração em lote, "Reportar Este Artigo", e a §A.43 no CLAUDE.md | 0 | que a frente seguinte **não** consiga mudar uma tela sem o manual entrar na conta |

**A Fase 1 subiu de lugar, e é a mudança mais importante desta revisão.** Na versão antiga os padrões
vinham embutidos num módulo 0 de 6 artigos junto do caminho crítico. Agora eles são fase própria e vêm
**antes de todo conteúdo de tela**, porque cada artigo de tela vai **referenciar** o artigo do padrão em
vez de reexplicar. Escrever a Fase 2 antes da Fase 1 é escrever 38 artigos que explicam filtro 38 vezes.

**A Fase 0 ganhou a peça que antes não existia: o DETECTOR DE CONTROLE ÓRFÃO (1.4).** Sem ele a fábrica
não tem como responder "o manual cobre cada recurso?" a não ser opinando, e foi justamente uma opinião
não medida que produziu o número 84.

**Paralelismo (§A.39):**
- **Fase 0, uma rodada com cinco frentes:** `seguranca` audita **o mapa** (arnês e gate de PII) antes da
  primeira captura em lote; `tester` escreve, contra o requisito, os testes do detector de PII, da
  normalização e do ranking da busca, **e do detector de controle órfão**, enquanto o código nasce;
  `frontend` faz shell, artigo, busca e o índice "Nesta Tela"; `backend` registra o menu; `devops` faz
  os comandos e o passo de CI.
- **Fases 2 a 5:** artigo é independente de artigo, e o `registro.gerado.ts` é **gerado**, então o
  conteúdo paraleliza quase sem limite. O limite prático deixa de ser colisão de arquivo e passa a ser
  **consistência de voz**, que é risco de revisão e não de merge.
- **Dependência dura 1:** nenhuma captura em lote antes do veredito do `seguranca` sobre o gate de PII.
- **Dependência dura 2, nova:** nenhum artigo de tela (Fase 2 em diante) antes dos padrões da Fase 1
  estarem aprovados, pelo motivo acima.
- **Dependência dura 3, nova:** os blocos compartilhados de "Antes De Começar" e "Se Der Errado" (1.6)
  existem no contrato **antes** da Fase 2, ou 87 artigos de Soul ADM nascem com o bloco copiado.

**Camadas impactadas, por fase:**

| Camada | O que toca | Fases |
|---|---|---|
| `frontend` | `src/ajuda/**`, `/ajuda`, `/ajuda/[slug]`, botão no `PageHead`, painel lateral, busca, índice "Nesta Tela", `public/ajuda/**` | 0 a 6 |
| `backend` | `domain/menus.ts` (menu novo), e só se a borda (a) da §6 for aprovada: tabela `ajuda_feedback`, migration, uma controller | 0 e 6 |
| `shared-types` | só `AjudaFeedbackDto`, e **escrito pelo coordenador** (§A.39) | 6 |
| `devops` | `tools/ajuda/`, scripts `ajuda:capturar`, `ajuda:conferir`, `ajuda:cobertura`, `ajuda:registro`, passo de CI e hook de pré-push | 0 e 6 |
| `ia` | **nada**. A busca é por texto, sem IA, por decisão do diretor. Declarado para o pulso da §A.38 | nenhuma |
| `seguranca` | audita o arnês, o gate de PII, o recorte das telas agregadas, e se o artigo alcançável por URL expõe algo | 0, e revisão em 2, 4 e 5 |
| `tester` | detector de PII, normalização e ranking da busca, **detector de controle órfão**, conferidor de seletores, tipagem de rota morta | 0 e 6 |

### 5.1 O CUSTO DE REGIME COM 178 ARTIGOS, e por que ele NÃO dobra

A §A.43 escala junto, e a pergunta é legítima: cada artigo novo é um artigo a manter. A resposta medida:

**O custo de regime é governado pelo número de SELETORES ANCORADOS, não pelo número de artigos.** Os
controles do sistema são os mesmos 550 a 650 nas duas versões do inventário. O que muda é como eles se
agrupam em arquivos, e agrupar mais fino **melhora** o regime em dois pontos concretos:

- **Granularidade reduz o alcance de cada mudança.** No inventário antigo, o artigo gordo "auditar
  documento com a IA" cobria 5 controles: mexer em **qualquer** um dos 5 exigia revisar aquele artigo
  inteiro e reler os seus 5 prints. No novo, mexer no botão "Reauditar" alcança **um** artigo e **dois**
  prints. O detector 4 (arquivo de tela tocado) passa a apontar menos trabalho por frente, não mais.
- **O detector de controle órfão vira prevenção, não conserto.** Frente que acrescenta um botão passa a
  **falhar o conferidor** (a partir da Fase 6), em vez de deixar o manual silenciosamente incompleto. É
  a diferença entre descobrir na entrega e descobrir seis meses depois, pela boca de um operador novo.

| | Antes (84 artigos) | Agora (178 artigos) |
|---|---|---|
| Frente que mexe numa tela | 1 a 4 artigos, 3 a 12 prints, 15 a 40 min | **1 a 3 artigos, 2 a 8 prints, 10 a 30 min** |
| Frente que acrescenta um controle | não detectada | **detectada pelo detector 6** |
| Frente que muda o design system | 280 a 400 prints, 1 a 2 h de máquina | 450 a 600 prints, **2 a 3 h de máquina**, sem gente |
| Revisão de voz e consistência | 100 peças | **196 peças, e é aqui que o custo realmente sobe** |

**O único custo que sobe de verdade é a REDAÇÃO INICIAL e a consistência de voz entre 196 peças.** É um
custo de construção, não de regime, e ele é mitigado pelos blocos compartilhados (1.6) e pela Fase 1
vindo antes de tudo. **Sim, continua sustentável**, e por um motivo que vale dizer sem rodeio: o regime
sustentável nunca dependeu do número de artigos, e sim de o print se **regerar** e de a lacuna se
**detectar**. As duas coisas são mecânicas, e escalam de graça.

---

## 6. GERENCIÁVEL OU NÃO: a resposta é NÃO no corpo, e SIM nas duas bordas

**Recomendação: o corpo do artigo NÃO é editável por gente. Nem por Super Admin.**

| Caminho | Custo de construir | Custo escondido |
|---|---|---|
| **Conteúdo em código, versionado** (recomendado) | baixo, é o que a fábrica já faz | o diretor depende da fábrica para corrigir uma frase. É real, e a borda (a) abaixo o mitiga |
| **Editor de artigo no sistema** | alto: tabela, editor de texto rico, upload de imagem, histórico de versão, quem pode editar, fila de revisão | **mata o detector da §7.** Artigo editado por gente sai do diff do git, e a fábrica perde a única forma automática de saber que ele ficou velho. E **print anotado por gente não é regenerável**: a seta volta a ser pixel, e mudança de tela volta a exigir redesenho à mão. É trocar um manual sustentável por um que envelhece em silêncio |
| **Híbrido: corpo em código, avisos em banco** (recomendado como borda) | baixo | nenhum relevante: o aviso é curto, datado, e não compete com o corpo |

**As duas bordas que eu recomendo, e são pequenas:**

**(a) "Reportar Este Artigo"**, no pé de cada artigo. Grava em `ajuda_feedback` (slug, rota, comentário,
autor, data, **sem PII e sem dado de candidato**) e vira fila para a fábrica. Custo: uma tabela, uma rota,
um painel. É isso que devolve ao time o poder de dizer "está errado" sem transformar o manual em dado que
ninguém versiona. **É o que substitui o editor, e resolve 90% da vontade de editar.**

**(b) "Avisos Do Artigo"**, opcional, decisão 3 da §10: faixa curta e datada que o diretor escreve por
artigo ("a partir de 01/10 a régua deste cliente mudou"), em tabela, **sem tocar o corpo**. Serve ao
recado urgente, que é o único caso em que esperar a fábrica dói de verdade.

---

## 7. O CUSTO DE MANUTENÇÃO, dito com honestidade

**Manual desatualizado é pior que manual nenhum**, porque ensina o errado com a autoridade da casa, e
quem foi ensinado errado não desconfia. A pergunta certa não é "quem lembra de atualizar", é **o que
falha quando alguém esquece**. Cinco detectores, do mais automático ao mais frágil.

| # | Detector | Pega o quê | Quando dispara | Confiabilidade |
|---|---|---|---|---|
| 1 | **Alvo não resolve** na regeneração | rótulo de botão mudou, aba renomeada, campo removido, papel acessível trocado | `pnpm ajuda:conferir` no CI, sem gravar print | **alta**, é falha dura |
| 2 | **Impressão digital da tela** | mudança de estrutura que não mexeu no alvo: cabeçalho de coluna novo, aba nova, KPI novo. O roteiro guarda a lista de rótulos de aba, cabeçalho de coluna e nome de botão, e compara | mesmo comando | **alta**, e é o que pega coluna nova, que é a mudança mais comum da casa |
| 3 | **Rota morta** | menu removido ou `href` mudado. `Artigo.rotas` é tipado contra a união derivada de `MENUS` e da árvore de `page.tsx` | typecheck, ou seja, no gate de toda frente | **alta**, e é de graça |
| 4 | **Arquivo de tela tocado** | a frente mexeu na usabilidade. `Artigo.fontes` lista os arquivos que o artigo ensina, e um script cruza o `git diff` da frente com essas listas, **exigindo** que os artigos alcançados sejam revisados ou dispensados por escrito na entrega | pré-push, junto do gate da §A.21 | **média a alta**, e é o **coração** da §A.43: é o único que age antes de o print ficar errado, e não depois |
| 5 | **"Reportar Este Artigo"** | tudo o que os quatro acima não pegam | quando alguém tropeça | **baixa**, depende de gente. É a rede, não o piso |
| **6** | **CONTROLE ÓRFÃO** (revisão 27/09). O motor enumera os nomes acessíveis dos controles da tela (`button`, `link`, `tab`, `combobox`) e compara com a união dos `controles` declarados pelos artigos daquela rota | **controle que existe na tela e não está explicado em nenhum artigo**, que é exatamente a lacuna que o diretor apontou, e o único detector que mede COBERTURA em vez de correção | `pnpm ajuda:cobertura`, como relatório até a Fase 5 e como falha dura a partir da Fase 6 | **alta**, e é o que transforma "o manual cobre cada recurso" de opinião em número |

### O que NENHUM detector pega, e o plano não finge que pega

**Mudança de SIGNIFICADO sem mudança de rótulo nem de estrutura.** O botão tem o mesmo nome, está no
mesmo lugar, o print continua correto, e a regra por trás dele mudou. O manual segue com o print certo e
a explicação errada, que é a pior combinação possível, porque o print empresta credibilidade ao texto.

O detector 4 é a única aproximação, e **falha em dois casos** que vale nomear: quando a regra mudou no
**backend** e `fontes` só lista a tela (mitigação: `fontes` aceita caminho de backend, e os artigos de
regra listam o serviço, não só a tela); e quando a regra mudou por **dado** e não por código, que é
exatamente o caso de catálogo, régua e obrigatoriedade por cliente (mitigação automática: nenhuma. Por
isso esses artigos são escritos para **não** citar valor de catálogo: ensinam "a régua do cliente diz", e
nunca "para este cliente são 12 documentos").

### O custo de regime, em números honestos

> Números atualizados para o inventário de 178 artigos (revisão 27/09). O detalhamento de por que o
> custo de regime **não** dobra com o inventário está em §5.1.

- **Por frente que mexe numa tela:** revisar de 1 a 3 artigos e regerar de 2 a 8 prints. Regerar é
  automático; reescrever passo é humano. De 10 a 30 minutos por frente, **menos** que na versão antiga,
  porque artigo mais fino tem alcance menor. O detector 4 é o que garante que esse tempo seja gasto **na
  frente**, e não seis meses depois.
- **Regeneração completa:** de 450 a 600 prints, na casa de 2 a 3 horas de máquina, sem gente. É o que
  se roda quando o design system muda (tema, tipografia, densidade de tabela).
- **O gasto grande é a REDAÇÃO das Fases 2 a 5**, e é custo de construção, não de regime. Depois disso o
  manual é barato, **se e somente se** o detector 4 estiver no pré-push e o detector 6 no gate. Sem eles
  o custo não cai: muda de lugar, e volta como retrabalho.
- **Número que dimensiona a frente:** de 450 a 600 PNGs, e **550 a 650 controles anotados uma vez cada**.
  É o print, não o texto, que determina o prazo. E é o CONTROLE, não o artigo, que determina o print.

---

## 8. O QUE JÁ EXISTE DE APROVEITÁVEL, E O QUE NASCE DO ZERO

| Ativo | Onde | Como entra |
|---|---|---|
| **O spike de anotação** | `scratchpad/spike-anotacao.mjs` | base do motor. A arquitetura está certa; faltam os 7 consertos da §3.2 |
| **Os arneses de dado sintético** | `apps/backend/src/as/ingestao-pandape/arnes-*.ts` | padrão copiado tal e qual para o `arnes-seed-manual.ts`: fail-closed por database, idempotente, transacional, faixa 999, `.invalid`, com limpeza. **Nada se reinventa aqui** |
| **`arnes-seed-demo-uma-vaga.ts`** | idem | já entrega vaga com funil povoado: cobre boa parte dos 11 artigos de SouTalent sem arnês novo |
| **Os 10 `GUIA-*` e `DEMO-*`** | `docs/` | são o **esqueleto de passo a passo** de 4 frentes (Central De Vagas, Portal, ingestão Pandapé, fundação). A sequência de gestos serve; a **linguagem não**: eles falam com o diretor validando ("confira que a tabela ordena por clique, §A.29"), não com o operador executando. Reescrita de voz, sequência reaproveitada, economia de 30% a 40% do tempo de redação **desses** artigos |
| **`domain/menus.ts`** | backend | é o **esqueleto do sumário** e a fonte do "Antes De Começar" ("você precisa do menu Esteira Admissional"). Também é a fonte do detector 3 |
| **`ui/PageHead`** | frontend | ponto único do botão contextual: 45 telas de graça |
| **`ui/Modal`, `Select`, `MultiSelect`, `Combobox`, `ColunaOrdenavel`, `useOrdenacao`, `Pill`, `GlassCard`** | `components/ui` | a tela de ajuda não inventa componente: §A.35, §A.29 e §A.41 saem cumpridas por reuso |
| **`public/demo-kit-pdf-mae.pdf`** | frontend | material de demonstração do Gerador De Kit, já sintético |
| **`public/sou-talent.png`, `sou-adm.png`** | frontend | identidade dos módulos no sumário |

**Nasce do zero:** todo o texto em linguagem de usuário (os 103 documentos de `docs/` são de **fábrica**:
explicam por que uma decisão foi tomada, e o operador quer saber onde clicar; **nenhum vira artigo por
cópia**, e este é o maior item de custo da frente, sem atalho); o motor endurecido, o gate de PII e os
roteiros; o índice de busca, os sinônimos e o ranking; a tela, o artigo e o painel contextual; e as
trilhas, que são conteúdo novo por definição, porque ninguém nunca escreveu a ordem.

---

## 9. PROPOSTA DE TEXTO DA §A.43, pronta para colar no CLAUDE.md

> Escrita no estilo das demais: a regra, o porquê, e o caso que a originaria. O diretor aprova, ajusta
> ou recusa; a fábrica não escreve no CLAUDE.md por iniciativa própria.

---

## A.43: MUDOU A TELA, MUDOU O MANUAL, NA MESMA ENTREGA (regra permanente)

**Frente que muda a USABILIDADE de uma tela não fecha sem o artigo da Central De Ajuda atualizado, na
MESMA entrega.** Não é item de backlog, não é fase 2, não é "depois a gente documenta": o manual é parte
da frente, como o teste e a prova visual.

**O gatilho é objetivo, e não depende de ninguém julgar se "mudou o suficiente":** mexeu em rótulo,
botão, campo, coluna, aba, filtro, ordem de passo, mensagem de erro ou no caminho que a pessoa percorre,
então o artigo entra na entrega. Mudança só interna (consulta, índice, refatoração sem efeito na tela)
não dispara nada.

- **A DETECÇÃO É AUTOMÁTICA, e não fica na memória de quem trabalha.** Cada artigo declara em `fontes`
  os arquivos de tela e de serviço que ele ensina. O conferidor cruza o diff da frente com essas listas e
  **lista os artigos alcançados**; e o conferidor de captura (`pnpm ajuda:conferir`) **falha** quando um
  alvo de print não resolve mais, o que é exatamente o sintoma de rótulo renomeado. **Alvo que não
  resolve derruba o gate**, como qualquer teste vermelho.
- **PRINT SE REGERA, não se redesenha.** A anotação é descrita por SELETOR, então o comando de
  regeneração produz o print novo com as setas nos lugares certos. Quem tiver de redesenhar seta à mão
  está usando o caminho errado, e é sinal de que o roteiro precisa de conserto, não o PNG.
- **PRINT NUNCA CARREGA DADO PESSOAL REAL, e a trava é de código.** A captura roda só na homologação,
  sobre o arnês de dado sintético, e o motor **lê o texto da tela e recusa gravar** o PNG se achar CPF
  fora da faixa 999, nome fora da allowlist do arnês ou e-mail que não seja `.invalid`. Print vai para o
  git, e **git guarda para sempre**: PNG com PII não se desfaz com um commit de remoção, que é por que
  aqui se aplica a mesma régua da §A.33, abster-se é seguro e gravar errado é irreversível.
- **CONTROLE NOVO NA TELA É ARTIGO OU PASSO NOVO NO MANUAL, e a falta é DETECTADA.** Cada passo declara
  em `controles` o rótulo literal dos controles que ele explica, e o conferidor enumera os controles
  reais da tela e **lista o que não está explicado em nenhum artigo**. Botão que ninguém documentou é
  lacuna medida, não esquecimento. É isso que faz o manual cobrir **cada recurso de cada tela**, e não
  só o caminho principal, sem virar um verbete por botão: a unidade continua sendo a TAREFA, e o rótulo
  do controle é o que a BUSCA indexa para levar a pessoa até o passo certo.
- **O artigo é escrito em linguagem de EXECUÇÃO, para o time operacional e para o gestor.** "O Cadastro
  só abre depois que Auditoria e Exame fecham", e nunca "gate F12". Valem a §A.11 (travessão proibido) e
  a §A.24 (title case em título e tag).
- **O CORPO DO ARTIGO NÃO É EDITÁVEL POR GENTE, e isso é desenho.** Conteúdo editado fora do git sai do
  diff, e com ele sai a detecção: ninguém mais sabe que o artigo ficou velho. Quem vê erro usa o
  "Reportar Este Artigo", e a fábrica corrige na fonte.

**O CASO QUE ORIGINARIA A REGRA, e ele é o padrão da casa, não hipótese:** a §A.22 registra um contador
que o backend já calculava e o frontend nunca renderizou, e a §A.17 registra um bloco inteiro do
CLAUDE.md que ficou **defasado** dizendo que o VT estava dormente enquanto em produção ele já rodava em
138 réguas. Documentação que depende de alguém lembrar de atualizar não fica incompleta: ela fica
**errada**, e é consultada com confiança justamente por quem tem menos condição de desconfiar, o operador
novo. Manual desatualizado ensina o errado com a autoridade da casa.

*(Decisão do diretor, na frente da Central De Ajuda.)*

---

## 10. DECISÕES QUE SÃO DO DIRETOR, uma por linha (§A.14, §A.30, §A.31)

1. **Quem pode LER um artigo?** Recomendo: qualquer usuário autenticado lê `/ajuda/*` (o conteúdo não tem
   dado de candidato e não dá acesso a nada), e o **menu** segue a régua normal da §A.23. Alternativa:
   gatar a leitura pelo menu, e aí quem não tem o menu não tem nem o botão de ajuda da própria tela.
2. **Construir o "Reportar Este Artigo"?** Recomendo sim, e é ele que substitui um editor de conteúdo.
3. **Construir os "Avisos Do Artigo" editáveis pelo diretor?** Recomendo deixar para depois da Fase 5, e
   só se a falta aparecer na prática.
4. **Tema dos prints: claro, escuro, ou os dois?** Recomendo **claro só**, porque dobrar os prints dobra o
   custo de regeneração sem ensinar nada novo.
5. **O motor de captura mora NO repositório?** A §A.13 diz que o harness de screenshot é insumo da
   fábrica, mantido **fora** do repositório. O motor do manual é diferente: os **roteiros** precisam estar
   versionados, porque são o detector de artigo velho. Recomendo **roteiros e tipos no repositório**, e o
   motor em `tools/ajuda/` também no repositório, com nota explicando por que ele é exceção à §A.13.
6. **Os 16 catálogos ficam em ficha curta, ou cada um vira artigo cheio?** Recomendo ficha. A Fase 4
   entrega o artigo modelo primeiro, para ele decidir vendo.
7. **Nome do menu: "Central De Ajuda" ou "Manual Do Sistema"?** Title case em qualquer um (§A.24).
8. **APROVAR O INVENTÁRIO NOVO: 178 artigos mais 18 fichas, contra 84 mais 16** (revisão 27/09, §1).
   Recomendo aprovar. Não é inflação: é o preço de cobrir cada recurso, que foi o que ele pediu. O corte
   que **não** recomendo é voltar a 84 tirando os N2, porque os N2 são exatamente "o que esse botão faz".
9. **Cortar por PROFUNDIDADE, e não por módulo** (§5). Recomendo por profundidade: o manual fica útil de
   ponta a ponta na Fase 3, contra só na última fase se for por módulo. O efeito colateral a aceitar é
   que cada tela é visitada **duas** vezes, uma em N1 e outra em N2.
10. **O detector de controle órfão vira FALHA DURA quando?** Recomendo relatório até a Fase 5 e falha
    dura a partir da Fase 6. Falha dura antes disso trava toda frente do sistema por 600 lacunas que a
    própria frente do manual ainda vai fechar.
11. **Ordem contra as frentes da §A.18.** A Central De Ajuda não está na §A.18, e a §A.18 diz que o
   coordenador não antecipa frente sem aval. Ele decide se ela entra antes, depois ou em paralelo ao item
   2 (ligar o motor da esteira). Em paralelo tem um efeito colateral bom e um ruim: bom, o manual da
   esteira nasce junto com a esteira viva; ruim, ele documenta uma tela que está mudando, e vai regerar
   print duas vezes.

---

## 11. RISCOS, e o que fazer com cada um

| Risco | Gravidade | Mitigação no desenho |
|---|---|---|
| **Print com PII real no git** | crítica, e irreversível | o gate fail-closed da §3.4, auditado pelo `seguranca` **antes** da primeira captura em lote, e travado em teste escrito pelo `tester` |
| **Manual envelhece e ensina errado** | alta | os 5 detectores da §7 e a §A.43. O detector 4 é o que importa; sem ele a frente não deve subir |
| **178 artigos escritos em linguagem de fábrica, e divergindo entre si** | alta, e é a falha mais provável, agravada pelo inventário dobrado: o risco novo é 87 artigos de Soul ADM discordarem sobre o mesmo pré-requisito (mitigado pelos blocos compartilhados de §1.6) | a Fase 0 valida a VOZ em 3 artigos. Régua explícita de revisão: nada de sigla interna, nada de número de fase, nada de "§A.x" no texto de usuário |
| **A frente compete com a §A.18 e atrasa o motor da esteira** | média | decisão 8 da §10, e é do diretor |
| **A homologação estar dezenas de commits atrás da `main`** (risco conhecido do projeto) | média | o motor grava, junto do lote de prints, o commit da homologação em que capturou. Print capturado de uma homologação velha ensina uma tela que já mudou |
| **Documentar a `/kit` antiga por engano** | baixa, mas é §A.14 | a `/kit` está explicitamente fora do inventário, e o conferidor falha se aparecer artigo apontando para ela |
| **Tabela da tela de ajuda nascer fora do padrão** | baixa | se houver tabela, valem §A.12, §A.20 e §A.29 por reuso de `ColunaOrdenavel` e `useOrdenacao` |

---

## 12. O QUE ESTE DOCUMENTO NÃO FAZ

Não decide quais agentes serão acionados (é do coordenador, §A.39), não implementa nada, e não altera o
CLAUDE.md: a §A.43 acima é **proposta**, e entra no documento só por decisão do diretor. Nenhum arquivo de
código foi tocado nesta frente.
