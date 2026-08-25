# A&S Fatia 1: fundação da tela de Vaga (a casa)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-20 · **Tipo:** levantamento e desenho (§A.27)
**Regra desta OST:** nada construído, nada commitado. Este documento é o mapa para o diretor validar.
**Complementa:** `ARQUITETURA-ATRACAO-SELECAO.md` (18/08) e `ARQUITETURA-SEGMENTACAO-AREA.md` (18/08,
já no ar pelo commit `713b33a`).

---

## STATUS: desenho VALIDADO pelo diretor em 20/08/2026

| Decisão | Resposta do diretor |
|---|---|
| Homologação antes da Fatia 1 | **APROVADA e CONSTRUÍDA.** Ver `infra/homolog/README.md` |
| Posições como inteiro, ocupação derivada | **APROVADO** |
| Tipo de contratação como enum limpo | **APROVADO** |
| `segmento` e `comercial` | **VÃO PARA O CADASTRO DE CLIENTE, EM OS SEPARADA.** A Fatia 1 deixa os dois FORA da herança e não os inventa na vaga. Quando a OS rodar, a vaga passa a herdar |
| Tela, menu em grupo próprio, área AS, só SUPER_ADMIN | **APROVADO** |
| Os 4 pontos de alcance da d.4 | **AUTORIZADOS**, com prova de que ninguém perde nem ganha acesso |

**Pendente para fechar a lista de campos:** as 6 perguntas da seção c.6, e a conferência da lista
contra o formulário de fechamento de vaga (o diretor tem o formulário e vai passar a estrutura real).

---

## a) Ambiente de homologação: NÃO EXISTE hoje

### a.1 O que existe, conferido container a container e unidade a unidade

| Peça | Onde | Observação |
|---|---|---|
| Banco | container `ea-db`, `127.0.0.1:5433` | **um único** database de aplicação: `ea_automatic`. Os outros três são `postgres`, `template0`, `template1` |
| Backend | systemd `ea-backend`, `127.0.0.1:3011` | lê `apps/backend/.env` |
| Frontend | systemd `ea-frontend`, `127.0.0.1:3020` | build de produção |
| Ingress | systemd `ea-proxy` (Caddy), `0.0.0.0:3010` | única porta pública |
| IA | systemd `ea-ai-service`, `127.0.0.1:8000` | |
| Fila | container `ea-redis`, `127.0.0.1:6380` | |

Não há database, container, unidade ou variável chamada homolog, staging ou hml em lugar nenhum.

### a.2 O falso positivo: o "harness" NÃO é homologação

Existem duas unidades paradas, `ea-harness-frontend` (porta 3099, worktree
`/home/henrique/apps/ea-tabelas-visual`) e `ea-harness-proxy` (porta 3098). Elas parecem um segundo
ambiente e não são.

O `proxy-origem.mjs` do harness encaminha para `127.0.0.1:3011`, que é o backend **de produção**.
Logo o harness lê e **escreve no banco de produção**. Ele é um visualizador de frontend de uma branch,
feito para tirar print (§A.13), e serve exatamente para o oposto do que esta OST pede: ele reusa a
produção de propósito, para o print sair com dado real.

**Conclusão: usar o harness como homologação de A&S violaria a regra de ouro da frente.**

### a.3 A boa notícia: o sistema já está preparado, falta só ligar

Nada está fixo no código. `drizzle.config.ts` lê `process.env.DATABASE_URL`, o backend lê o `.env` do
`WorkingDirectory` da unidade systemd, o frontend resolve o backend por `BACKEND_ORIGIN` em build
time. Um segundo ambiente é assunto de **configuração e processo**, não de código.

E o tamanho ajuda: o banco inteiro tem **26 MB, 56 tabelas, 2.651 admissões**. Clonar é questão de
segundos, dentro do próprio container.

### a.4 O que seria preciso para ter homologação (sem tocar em nada do Fernando)

| Passo | O que é | Custo |
|---|---|---|
| 1 | Database `ea_automatic_homolog` **no mesmo container `ea-db`**. Sem container novo, sem volume novo, sem porta nova | minutos |
| 2 | Worktree própria (`git worktree`, padrão já em uso) para o build de homologação nunca encostar no `.next` de produção | minutos |
| 3 | `.env` próprio apontando para o database de homologação, com prefixo/db próprio no `ea-redis` já existente | minutos |
| 4 | Duas unidades systemd novas em portas próprias (ex.: backend 3111, frontend 3120) | ~1h |
| 5 | Rotina de clone e de re-clone sob demanda (`pg_dump` dentro do container) | ~1h |

**Nada disso toca o Fernando.** Tudo vive dentro da VM, em loopback e no ZeroTier, que é o mesmo
regime da produção hoje. **A única coisa que tocaria o Fernando** seria querer a homologação
alcançável **de fora da VPN** (DNS, vhost, certificado). Se for isso, eu paro e reporto, conforme a
OST manda.

### a.5 Três armadilhas que precisam entrar no desenho desde o começo

1. **OriginGuard.** O `ALLOWED_ORIGINS` de produção não conhece a origem de homologação. Foi
   exatamente por isso que o harness precisou de um proxy que remove o header `Origin`. Com `.env`
   próprio isso se resolve limpo, sem gambiarra, mas tem de ser lembrado.
2. **Os agendadores precisam nascer DESLIGADOS em homologação.** Pandapé, Clicksign, exame e coleta
   de VT. Uma homologação com Clicksign ligado dispara **envelope de assinatura de verdade** para
   candidato de verdade. Este é o maior risco do ambiente, e é de configuração, não de código.
3. **§A.6/LGPD.** Um clone da produção carrega CPF e nome reais para um segundo banco. Ou o clone
   anonimiza na cópia, ou a homologação nasce com o mesmo controle de acesso da produção. Recomendo
   anonimizar: homologação é onde se testa, e testar não precisa de CPF verdadeiro.

### a.6 Recomendação

**Sim, vale construir**, e é barato (meio dia de fábrica, zero Fernando). Mas há um caminho ainda mais
seguro que merece ser dito: **o A&S nasce isolado por construção** (tabelas próprias, menu em grupo e
área próprios, sem FK para Admissão). Mesmo em produção, enquanto o menu existir só para o
SUPER_ADMIN, o módulo é invisível e inerte para a operação.

Então há duas opções reais, e a decisão é sua:

| Opção | O que é | Risco para o EA em produção |
|---|---|---|
| **A** | Homologação de verdade (a.4) | Nenhum. Custa meio dia antes de a Fatia 1 começar |
| **B** | Construir no isolamento estrutural: tabelas novas paralelas, menu só SUPER_ADMIN, zero alteração em fluxo existente | Muito baixo, mas não é zero: os 4 pontos da seção (d.4) encostam em código validado |

Minha recomendação: **A**, porque a frente inteira de A&S vem por cima desta fundação e a partir da
Fatia 2 (a IA de importação) o isolamento estrutural sozinho deixa de ser suficiente.

**Não criei nada. Aguardando sua decisão.**

---

## b) Modelo de dados proposto

### b.1 A decisão central: posições são um NÚMERO, não 50 linhas

A OST pede "as tabelas (vaga, posições)". Investiguei os dois desenhos e **recomendo posições como
inteiro na vaga**, não como uma linha por posição.

Motivo: as posições de uma vaga são **fungíveis**. São 50 contratações do mesmo cargo no mesmo
cliente; ninguém identifica "a posição 37". Materializar 50 linhas não compra nada e custa caro:
criar e apagar linhas toda vez que a quantidade muda, linhas órfãs quando a quantidade diminui, e
sobretudo **um segundo lugar onde "quantas faltam" pode discordar da contagem de alocações**.

Esse é precisamente o modo de falha que custou 4 rodadas de bug de contagem no Alto Volume, e a §A.27
nasceu dele.

**Portanto: `posicoes` é a meta (um inteiro), a ocupação é DERIVADA, e "faltam" nunca é armazenado.**
Duas verdades não podem divergir se só existe uma.

### b.2 `vagas` (a única tabela desta fatia)

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cod_cliente` | FK `clientes` | a chave é sempre o cliente (§A.3) |
| `cargo_id` | FK `cargos` | catálogo que já existe |
| `nomenclatura` | varchar(160) | o título como a vaga é divulgada, distinto do cargo do catálogo |
| `posicoes` | integer NOT NULL | CHECK > 0, mesmo check de `projeto_vaga_cargo` |
| `tipo` | enum `vaga_tipo` | SAZONAL \| OPERACAO_PADRAO |
| `status` | enum `vaga_status` | ABERTA \| PAUSADA \| ENCERRADA \| CANCELADA |
| `data_abertura` | date NOT NULL | |
| `data_limite` | date NULL | CHECK: obrigatória quando SAZONAL |
| `id_vacancy` | varchar NULL | id da vaga no Pandapé, unique parcial. É o de/para da §A.9 |
| `responsavel_id` | FK `usuarios` (set null) | quem conduz a vaga |
| `criado_por_id`, `criado_em`, `atualizado_em` | | trilha |
| (campos de abertura e requisitos) | | ver seção **c** |

**Sem unique de cliente + cargo.** O mesmo cliente abre a mesma vaga várias vezes ao ano, e um unique
ali impediria a operação normal. Índices por `cod_cliente`, `status`, `cargo_id` e `data_limite`.

### b.3 O que NÃO entra nesta fatia, e por quê

- **Nenhuma FK para `admissoes`**, conforme a OST.
- **Nenhuma coluna nova em `admissoes`.** Foi essa disciplina que deixou o Alto Volume nascer sem
  quebrar Esteira, Gerenciador e Controle Gerencial.
- **`projeto_id` e `grupo_id` ficam de FORA** desta fatia. *Divergência consciente do documento de
  18/08*, que os previa desde o nascimento: a OST desta fatia é enfática sobre isolamento, e
  acrescentar duas colunas nuláveis depois é uma migration de uma linha, com risco zero. Prefiro o
  isolamento agora à conveniência futura.
- **`vaga_candidato` (a alocação) fica DESENHADA e ADIADA.** As colunas dela dependem do vocabulário
  do funil, que vem do relatório de candidatos que ainda não chegou. Inventar agora é criar dívida.

### b.4 Consequência honesta do adiamento acima

Sem a tabela de alocação, **o indicador de posições mostra "0 de 50 preenchidas" em toda vaga** nesta
fatia. Isso é verdade, não é bug: nesta fatia ainda não existe candidato para alocar.

Para que isso não vire remendo depois, a ocupação nasce atrás de **uma única função**
(`posicoesOcupadas`), que hoje devolve zero e na fatia do candidato ganha a fonte real. Um lugar só
para mudar, e o resto da tela não sabe a diferença.

---

## c) Campos da vaga

### c.1 ACHADO QUE PRECISA DA SUA DECISÃO: o formulário não está no sistema

**Procurei o formulário de fechamento de vaga (blocos ABERTURA e REQUISITOS) e ele não está em lugar
nenhum**: nem no repositório, nem no `docs/`, nem no home, nem no DIARIO. O documento de arquitetura
de 18/08 já o listava como material ausente (seção E.1) e ele continua ausente.

A lista abaixo é, portanto, **reconstruída a partir da própria OST** mais o que já existe no EA. Ela
precisa ser conferida contra o formulário de verdade antes de virar código.

### c.2 Herdados do cliente (preenchem sozinhos ao escolher o cliente)

| Campo | Existe hoje em `clientes`? | Coluna |
|---|---|---|
| Empresa | **sim** | `empresa_grupo` |
| Razão social | **sim** | `razao_social` |
| CNPJ | **sim** | `cnpj` |
| **Segmento** | **NÃO EXISTE** | vai para o cadastro de cliente, em OS separada (decisão de 20/08) |
| **Comercial** | **NÃO EXISTE** | vai para o cadastro de cliente, em OS separada (decisão de 20/08) |

**Dois dos cinco campos herdados não têm de onde herdar.** Não existe `segmento` nem `comercial` no
cadastro de cliente, em nenhuma tabela do sistema.

Três saídas, com recomendação:

| Opção | O que é | Veredito |
|---|---|---|
| i | Acrescentar `segmento` e `comercial` a `clientes` (colunas nuláveis) e dois campos na tela de Clientes | **Recomendada.** É o lugar certo do dado, mas **encosta em tela validada** (§A.26), então depende do seu aval |
| ii | Guardar os dois na própria vaga | **Não.** São atributos do cliente; guardados na vaga, cada vaga teria a sua versão e elas divergiriam |
| iii | Deixar os dois de fora da Fatia 1 | Possível, e a vaga funciona sem eles |

Além dos cinco, o cadastro de cliente **já tem** outros campos que podem pré-preencher a vaga de graça:
`nome_operacao` (necessário para o rótulo "0060 - AVL"), `regiao`, `escala_padrao`, `endereco_padrao`
e `beneficios_padrao`. Ofereço, não decido.

### c.3 Bloco ABERTURA (campos próprios da vaga)

| Campo | Tipo | Obrigatório | Nota |
|---|---|---|---|
| Cliente | seletor | sim | rótulo sempre "0060 - AVL" |
| Nomenclatura da vaga | texto | sim | o título divulgado |
| Cargo | seletor do catálogo | sim | `cargos`, que já existe |
| Nº de posições | inteiro > 0 | sim | |
| Tipo de contratação | lista fixa | sim | ver c.5 |
| Salário | decimal | sim | ver a pergunta em c.6 |
| Local de trabalho | texto | sim | pré-preenche de `endereco_padrao` |
| Setor / departamento | texto | não | |
| Horário / escala | texto | não | pré-preenche de `escala_padrao` |
| Sazonal ou Operação Padrão | lista fixa | sim | é o discriminador da decisão 3 |
| Data de abertura | data | sim | |
| Data limite | data | só se SAZONAL | travado por CHECK no banco |
| Responsável pela vaga | seletor de usuário | não | |

### c.4 Bloco REQUISITOS

| Campo | Tipo | Obrigatório | Nota |
|---|---|---|---|
| Formação / escolaridade | texto | não | vira catálogo se o formulário trouxer lista fechada |
| Experiência | texto longo | não | |
| Perfil | texto longo | não | comportamental |
| Observações | texto longo | não | |

### c.5 Tipo de contratação: reusar o vocabulário que já existe

O EA já tem lista fixa de tipo de contrato (§A.22): **Temporário, Terceirizado, Estágio, Interno,
Fopag, Jovem Aprendiz**. Recomendo a vaga usar **exatamente esses seis valores**, para vaga e admissão
falarem a mesma língua no dia em que se encontrarem.

Ressalva importante: **vocabulário compartilhado, tabela não.** A coluna `tipo_contrato` de
`admissoes` é texto livre e carrega sujeira da carga histórica (`TEMP.`, `ESTA. FOPAG`, `APREN.`,
onze variações para seis conceitos). A vaga nasce com **enum de verdade**, limpa. Nenhuma FK, nenhum
acoplamento, e o A&S não herda a sujeira do histórico.

### c.6 Perguntas que só o formulário responde

1. Salário é **valor único** ou **faixa** (de / até)?
2. A vaga tem **código próprio** legível ("VAGA-2026-0001") ou o identificador é a nomenclatura?
3. Os requisitos separam **obrigatório** de **desejável**?
4. Formação é texto livre ou lista fechada (Fundamental, Médio, Técnico, Superior)?
5. O formulário tem campo de **aprovação** (quem abriu, quem aprovou)?
6. Benefícios entram na vaga ou só na admissão?

---

## d) Desenho da tela

### d.1 Estrutura, sem espalhar

Um prefixo de rota só para o módulo: **`/as/...`**. A Fatia 1 entrega `/as/vagas`, e toda tela futura
de A&S nasce embaixo dele. Uma linha em `ROTA_MENU` cobre o módulo inteiro.

### d.2 `/as/vagas`, a listagem

**Cards de KPI, clicáveis como filtro (§A.12):** Vagas Abertas · Posições Em Aberto · Vagas Sazonais ·
Vagas Encerradas.

**Filtros:** cliente, cargo, tipo, status e busca global.

**Tabela**, na máscara única do §A.12, **ordenável desde o nascimento** reusando o que já existe
(`useOrdenacao` + `ColunaOrdenavel`, os mesmos do Gerenciador e de Benefícios):

| Coluna | Ordena por |
|---|---|
| Vaga (nomenclatura) | texto |
| Cliente ("0060 - AVL") | texto |
| Cargo | texto |
| Tipo (Sazonal / Operação Padrão) | texto |
| Contratação | texto |
| **Posições** (Total · Preenchidas · Faltam) | número, por "faltam" |
| Status | status |
| Abertura | data |
| Limite | data |
| Ações | não ordena |

Cabeçalhos centralizados, divisória hairline, ícone dinâmico por status (vaga preenchida = check
verde; com posições em aberto = exclamação amarela; cancelada = X vermelho), célula vazia é **"não
informado"**, nunca travessão (§A.11). Larguras conferidas na tela contra esmagamento (§A.20), com
prova visual antes de reportar (§A.13).

**Nota técnica registrada:** o `useOrdenacao` é client-side e só é honesto quando a tela carrega o
conjunto inteiro. Com algumas centenas de vagas, carrega. Se um dia paginar no servidor, a ordenação
tem de ir para a API, senão ordena só a página visível e mostra ordem falsa.

### d.3 O modal de cadastrar e editar

Modal **largo**, `max-w-[900px]` (o mais largo do sistema hoje tem 560px), com três blocos na ordem
do formulário:

1. **Dados Do Cliente**, faixa somente leitura que se preenche ao escolher o cliente.
2. **Abertura**, os campos de c.3.
3. **Requisitos**, os campos de c.4.

O indicador de posições aparece na linha da tabela como contador compacto ("12 / 50") mais a etiqueta
**"Faltam 38"**, no mesmo idioma visual do badge de pendências que já existe. Title case em títulos e
etiquetas (§A.24).

### d.4 Menu, permissão, e os quatro pontos que encostam em código validado

O menu de A&S precisa de **grupo próprio**, e hoje `GrupoMenu` só tem dois valores. Nasce em
`areas: ["AS"]` (declarar é obrigatório: o default é ADM) e **só para o SUPER_ADMIN** (§A.23). O
catálogo se registra sozinho no boot pelo `MenusCatalogoService`, então aparece na sua tela de
liberação sem ninguém rodar script.

**Uma verificação que me tranquilizou:** `MENUS_PADRAO_COMUM` filtra por `grupo === "OPERACAO"` **e**
área ADM. Um menu de A&S em grupo novo e área AS fica **duplamente fora** de qualquer backfill futuro.
A armadilha que originou a §A.23 não alcança esta frente.

**§A.26, os quatro pontos de alcance, e eu paro aqui esperando seu aval:**

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `domain/menus.ts` | `GrupoMenu` ganha o terceiro valor, e entra 1 menu novo no registro |
| 2 | `frontend/lib/menu-rotas.ts` | 1 linha, `/as` → menu de A&S. Sem ela, qualquer autenticado abre a tela pela URL |
| 3 | `frontend/components/shell/Sidebar.tsx` | seção nova, visível só para quem tem menu do grupo |
| 4 | `frontend/components/admin/ConfigMenusModal.tsx` | 1 rótulo novo no `rotuloGrupo` |

São os quatro pontos **mínimos** para o menu existir. Nenhum deles muda comportamento de quem está no
ar hoje (grupo novo, área nova, menu concedido a ninguém), mas todos os quatro são código validado, e
a §A.26 manda perguntar antes.

**Nada além destes quatro é tocado.** Alto Volume, Esteira, Gerenciador, Liberação, régua e admissões
ficam intactos nesta fatia.

---

## Resumo das decisões que dependem de você

| # | Decisão | Minha recomendação |
|---|---|---|
| 1 | Construir homologação antes da Fatia 1? | **Sim** (opção A da seção a.6) |
| 2 | Homologação clona dado real ou anonimiza? | **Anonimiza** (§A.6) |
| 3 | Posições: inteiro derivado ou uma linha por posição? | **Inteiro**, com "faltam" sempre derivado |
| 4 | `segmento` e `comercial`: acrescentar ao cadastro de cliente? | **Sim**, é o lugar certo do dado, mas encosta em tela validada |
| 5 | **Enviar o formulário de fechamento de vaga** | Bloqueia a lista final de campos |
| 6 | Autoriza os 4 pontos de alcance da d.4? | Sem eles o menu não existe |
| 7 | Responder as 6 perguntas de c.6 | |

§A.6: este documento trata de estrutura, campo e nome de tabela. Sem CPF, sem nome de candidato, sem
URL externa.
