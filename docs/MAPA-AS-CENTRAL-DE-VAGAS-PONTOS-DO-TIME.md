# MAPA: Central de Vagas, os pontos que o time trouxe do teste

> Sessão A&S. **Investigação apenas, nada foi construído.** Nenhum arquivo de código foi tocado.
> Cada item vem classificado (existe / bug / campo faltando / novo), com ONDE mexe e o que precisa
> de decisão do diretor. §A.11 (sem travessão) valendo no documento inteiro.
>
> **Como foi apurado:** leitura do código (`apps/backend/src/as/vagas/`, `apps/backend/src/domain/vaga.ts`,
> `apps/backend/src/domain/candidatura.ts`, `packages/shared-types/src/index.ts`,
> `apps/frontend/src/app/(app)/as/vagas/page.tsx`) e **medição contra o banco de produção**
> (`ea_automatic`) e o de homologação (`ea_automatic_homolog`).

---

## O ACHADO QUE EXPLICA METADE DOS BUGS

Os itens **10, 11, 12 e 13 são o mesmo defeito**, e ele é de MODELO, não de tela:

**A Central de Vagas conta LINHAS DE VAGA. O time conta POSIÇÕES.** E o fechamento é um evento
ÚNICO e TOTAL: fechar uma posição encerra a vaga inteira.

A prova está na produção. Existem **três linhas de vaga** na base, não dez:

| código | status | posições oficiais | banco | fechadas oficiais | fechadas banco |
|---|---|---|---|---|---|
| 11111111111 | ABERTA | 10 | 5 | vazio | vazio |
| (sem código) | RASCUNHO | 9 | 0 | vazio | vazio |
| 987654321 | **ENTREGUE** | 9 | 0 | **1** | 0 |

A linha 987654321 é o relato inteiro: nove posições, **uma** fechada, **oito** que deveriam seguir
abertas (item 13, "deveriam ter 8 abertas"), e a vaga virou ENTREGUE e saiu da fila (itens 11 e 13).

E existe uma **segunda contabilidade, já pronta e em uso na outra tela**: `ocupacaoDaVaga`
(`domain/candidatura.ts:164`) deriva posições ocupadas e livres das candidaturas APROVADO/CONTRATADO,
sem nunca guardar contador. A Central de Candidatos usa. A Central de Vagas **não usa**: ela mostra
`vagas_fechadas`, um número digitado à mão no formulário de fechamento. **Dois números para a mesma
coisa, e eles discordam.** Uma vaga com três aprovados aparece como "0 / 9" na coluna Posições.

Isso precisa de desenho antes de código, e é o item mais caro da lista.

---

## GRUPO 1: campos do formulário de abertura

| # | Item | Classificação | Onde mexe |
|---|---|---|---|
| 1 | Motivo só em contratação temporária | **Ajuste de regra** (o campo existe, aparece sempre) | `page.tsx` passo 3 "Contratação"; `vagas.service.camposDaTrilha`; helper novo no shared-types |
| 2 | Cidades não aparece | **Campo faltando** (não existe coluna `cidade`) | `vagas` (coluna nova), shared-types, passo 4 |
| 3 | Escolaridade: Técnico Completo / Incompleto | **Campo faltando** (valor de lista) | enum `vaga_escolaridade` + `VAGA_ESCOLARIDADE` |
| 4 | Escolaridade: "Cursando" | **Campo faltando** (valor de lista) | idem |
| 5 | Idioma com níveis | **Funcionalidade nova** (muda a FORMA do dado) | `vagas.idiomas` (`text[]`), DTO, tela, ficha |
| 6 | Natureza: "Reposição" | **Já existe**, com outro nome | só decisão de rótulo |
| 7 | Natureza: "Vaga Interna" | **Já existe em Vínculo**, não em Natureza | decisão do diretor |
| 8 | Status: excluir "Vaga Banco" | **Existe, é remover** | `VAGA_STATUS`, KPI, filtro, botão de posições |
| 9 | "Etapa do Processo" depois do Status | **Funcionalidade nova, precisa desenho** | ver proposta abaixo |

### 1. Motivo de contratação
Hoje o campo é **sempre visível** (`page.tsx:2236`), no passo 3. O catálogo vem de
`motivos_contratacao`, que tem **duas linhas hoje**: "Aumento de demanda" e "Substituição". É o
**mesmo catálogo da Nova Admissão**, então mexer nele alcança a outra frente (§A.26).

O padrão de campo condicional já existe e é o de `exigeTempoContrato`: a tela esconde **e** o
servidor zera na gravação, senão fica dado órfão gravado numa vaga que não o mostra mais.

**Precisa de decisão, e é bloqueante:** "temporária" é a **Natureza** (`TEMPORARIA`) ou o **Vínculo**
(`TEMPORARIO`)? São dois campos diferentes e o time preencheu os dois.

**Impacto que o pedido não menciona (§A.27):** escolher "Substituição" no Motivo é o que **abre o
bloco de substituição** (tipo, nome do substituído e CPF, `page.tsx:2258`). Escondendo o Motivo fora
da temporária, **some também a substituição de efetivo**, que existe na vida real e cujo CPF o ADM
usa na folha e no eSocial. Precisa de resposta antes de construir.

### 2. Cidades
**Não existe campo de cidade em lugar nenhum.** A tabela `vagas` não tem coluna `cidade`. O que
existe, no **passo 4 (Condições)**, é o par encadeado **"Estado da abordagem"** (27 UFs) e
**"Regiões possíveis para abordagem"** (`REGIOES_POR_UF`, mais de 250 nomes, e boa parte deles é
nome de cidade: "Rio Branco", "Arapiraca", "Macapá").

Três leituras possíveis, e só o diretor fecha qual é:
1. **É campo faltando de verdade:** o time quer "Cidade" como campo próprio, separado de região.
2. **É o item 14 disfarçado:** o seletor está no fim do formulário e o dropdown corta (ver abaixo).
3. **É a lista encadeada:** a segunda lista **nasce fechada** e só abre depois de escolher o estado
   (`page.tsx:2395`). Quem não escolheu a UF vê uma frase de instrução, não um seletor.

Recomendo confirmar 2 e 3 com o time antes de criar campo novo, porque criar coluna que duplica o que
a régua de regiões já resolve é dívida.

### 3 e 4. Escolaridade
A lista de hoje, em `VAGA_ESCOLARIDADE` e no enum `vaga_escolaridade` do Postgres, é:
Fundamental Incompleto, Fundamental Completo, Médio Incompleto, Médio Completo, **Técnico**,
Superior Incompleto, Superior Completo, Pós-graduação.

Falta mesmo, confirmado. Duas observações que mudam o desenho:
- **"Técnico" hoje é um valor só**, sem completo/incompleto. Acrescentando os dois, é preciso decidir
  o que fazer com as vagas já gravadas como `TECNICO` (deixar dormente, ou migrar para Completo).
- **"Cursando" não é "Incompleto".** `SUPERIOR_INCOMPLETO` já existe e significa parou; "Superior
  Cursando" significa está estudando, que é justamente a exigência do estágio. Decisão: "Cursando"
  vira um valor por nível (Médio Cursando, Técnico Cursando, Superior Cursando) ou um campo à parte?
- Mecânica: `ALTER TYPE ... ADD VALUE` (acrescenta no fim, nunca remove), mais a lista do shared-types.

### 5. Idioma com níveis
**É o mais caro do Grupo 1**, e não é "acrescentar opção". Hoje `vagas.idiomas` é `text[]` de NOMES
("Inglês", "Espanhol"), com escape "Outros". Nível exige guardar um PAR por idioma
(Inglês/Avançado + Espanhol/Básico), o que muda a forma do dado: array de objetos (`jsonb`) ou tabela
filha `vaga_idioma`. Alcança coluna, DTO, tela, ficha do olho e clonagem de vaga.

### 6 e 7. Natureza
- **"Reposição" JÁ EXISTE**, com o nome **"Reposição Efetiva"** (`REPOSICAO_EFETIVA`). Pergunta ao
  diretor: renomear para "Reposição", ou acrescentar "Reposição" como valor separado dela?
- **"Vaga Interna" JÁ EXISTE, mas em outro campo**: o Vínculo tem `INTERNO` ("Interno"). Não está na
  Natureza. Decidir se vira valor de Natureza também, ou se o time estava procurando o Vínculo.

### 8. Excluir "Vaga Banco" do Status
Direto e barato, com uma ressalva de banco de dados:
- Sai de `VAGA_STATUS`, `VAGA_STATUS_LABEL`, do card de KPI (`page.tsx:1634`), do filtro de Status e
  do gatilho do botão "Editar posições" (`page.tsx:1841`, hoje `ABERTA || VAGA_BANCO`).
- **O valor do enum do Postgres NÃO sai:** Postgres não remove valor de enum. Ele fica dormente, como
  a coluna `centro_custo` já ficou. Isso é aceitável e não quebra nada.
- **Zero linhas usam esse status hoje**, conferido em produção e em homologação. Remoção sem migração
  de dados.
- **Cuidado de leitura:** o que sai é o **status**. O **contador** `posicoes_banco` e a coluna
  "Banco" da tabela são outra coisa e continuam.

### 9. "Etapa do Processo" depois do Status
**Não existe.** E existem hoje duas coisas parecidas que **não** são isso:
- `etapas_ps` (passo 5): quais etapas o processo **terá** (Entrevista com RH, Teste prático...). É
  configuração da vaga, seleção múltipla.
- `CANDIDATURA_ETAPAS`: em que etapa **cada candidato** está (Captação, Triagem, Entrevista Soulan,
  Entrevista Cliente, Aprovação). É por pessoa, não por vaga.

O que falta é **em que ponto a VAGA está**. Proposta (fica para o desenho, não construir):
**derivar, não criar campo.** A etapa da vaga é a etapa mais avançada entre os candidatos vivos dela,
lida de `as_candidaturas`, que já existe e já é consultada por vaga. Zero coluna nova, zero
preenchimento manual, e o número nunca discorda da Central de Candidatos. A alternativa (campo manual
ao lado do Status) cria um segundo número que envelhece sozinho, que é exatamente o defeito dos itens
10 a 13.

---

## GRUPO 2: os bugs

### 10. "Abri 10 vagas e apareceram 9"
**Bug de entendimento em cima de um defeito real.** A base de produção tem **três linhas de vaga**,
não dez: o time fala em "10 vagas" querendo dizer **10 POSIÇÕES**, e a tela conta linhas. É o item 12,
chegando pela porta do susto.

Dois agravantes reais que somam ao efeito:
- O **RASCUNHO não aparece no card "Abertas"** (há um na produção, com 9 posições), e é justamente a
  vaga que alguém deixou pela metade.
- O **Status é escolhido à mão no formulário de abertura** (`page.tsx:2062`), e a lista oferece
  ENTREGUE, FECHADA, CANCELADA e VAGA BANCO. Vaga aberta com o status errado some da fila de abertas
  sem ninguém perceber. O item 8 resolve um pedaço disso.

Para fechar com certeza, falta o relato exato do time: dez o quê, e em qual tela contaram nove.

### 11. "Fechei uma vaga e não deu opção de fechar as demais"
**Bug real, confirmado no código, e é comportamento por desenho, não falha.**
`fechar()` (`vagas.service.ts:707`) recusa qualquer vaga que não esteja `ABERTA` com 409
("Esta vaga já foi fechada"), e o botão de cadeado só é desenhado em `v.status === "ABERTA"`
(`page.tsx:1826`). Fechar **uma** posição muda o status da vaga, e o caminho de fechar as outras
**deixa de existir na tela e no servidor**.

**Não existe fechamento incremental por posição no sistema.** O fechamento é um formulário único, com
"quantas foram preenchidas", disparado uma vez só.

### 12. "O painel conta as VAGAS abertas, não as POSIÇÕES"
**Confirmado.** `kpis` (`page.tsx:1382`) faz `for (const v of filtradas) conta[v.status] += 1`: conta
LINHAS por status. Os sete cards são todos de linha.

E a régua de posições **já existe, pronta e testada**, em `ocupacaoDaVaga`
(`domain/candidatura.ts:164`): ocupadas, livres, em seleção, excedida, tudo derivado das candidaturas,
nunca armazenado. A Central de Candidatos consome
(`candidatos.service.ts:997`). A Central de Vagas não.

**Recomendação (desenho, não construção):** os KPIs de posição consomem `ocupacaoDaVaga`, não
`vagas_fechadas`. Assim as duas telas param de discordar por construção, que é a mesma correção que a
§A.19 registrou para as pendências obrigatórias.

### 13. "Ficou ENTREGUE em vez de FECHADA, e deveriam ter 8 abertas"
**Confirmado, com a linha da produção em cima.** A regra de hoje está em `vagas.service.ts:746`:

> ENTREGUE quando **alguma** posição foi preenchida, FECHADA quando **nenhuma** foi.

Ou seja: **FECHADA hoje significa fracasso** (encerrou sem entregar ninguém) e **ENTREGUE significa
êxito parcial ou total**. O time lê ao contrário: fechada é a vaga concluída.

Na vaga real: 9 posições, 1 fechada, `1 > 0` logo ENTREGUE, e as 8 restantes sumiram da conta.
O "deveriam ter 8" é `9 - 1`, aritmética de POSIÇÃO, que é o item 12.

**Os três (11, 12, 13) são UMA frente só, e ela precisa de desenho antes de código.** O que está em
jogo é: a vaga fecha por posição ou de uma vez; o que ENTREGUE e FECHADA passam a significar; e de
onde sai o número de preenchidas (o digitado no fechamento, ou o derivado das candidaturas).

### 14. Caixa de seleção cortada no fim da tela
**Bug real, confirmado no código, e o de MAIOR ALCANCE da lista: é do sistema inteiro, não da Central
de Vagas.**

`Select.tsx:80` e `MultiSelect.tsx:59` fazem a mesma coisa:

```
setPos({ top: r.bottom + 6, left: r.left, width: r.width });
```

O menu abre **sempre para baixo** do gatilho, em `position: fixed`, com altura de lista limitada a
`max-h-60` (240px). **Não há flip para cima e não há limite pela borda da viewport.** Perto do fim da
tela, o menu nasce parcialmente fora dela; e porque é `fixed`, rolar a página não o traz de volta: o
listener de scroll (`Select.tsx:104`) **reposiciona o menu de volta para baixo do gatilho** a cada
rolagem. As opções de baixo ficam inalcançáveis, exatamente como o time descreveu.

**Correção conceitual:** o popover passa a caber na viewport (inverte para cima quando não há espaço
abaixo, e limita a altura ao espaço disponível). É **um** ajuste, em **dois** componentes.

**§A.26, e é o motivo de isto não ser "só um CSS":** esses dois componentes são o seletor padrão de
**dezenas de telas já validadas** (§A.35 tornou obrigatório usá-los). O ajuste é pequeno em linhas e
grande em alcance, e a prova visual (§A.13) tem de cobrir mais tela que a Central de Vagas.

---

## GRUPO 3: inclusões na listagem

Regra que vale para todos: **§A.37, coluna nova nasce com filtro multiselect e ordenação junto**,
pelo `useOrdenacao`/`ColunaOrdenavel` e pelo componente de filtro que a tela já usa.
A tabela hoje tem 10 colunas: Código, Vaga, Cliente, Cargo, Vínculo, Posições, Status,
Data De Abertura, Dias Em Aberto, Ações.

| # | Item | Classificação | Custo |
|---|---|---|---|
| 15 | Farol de SLA | **Novo na tela**, insumo já existe | médio, precisa da régua do diretor |
| 16 | Coluna Consultor Responsável | **Dado JÁ EXISTE e já viaja** | **o mais barato do lote** |
| 17 | Anotações / Histórico da vaga | **Funcionalidade nova**, do zero | alto |
| 18 | Botão para Candidatos | **Parcialmente existe** (é modal, não navega) | baixo |
| 19 | "Data Limite" para "Previsão de Entrega" | **Renomear rótulo** | trivial |
| 20 | Candidatos Encaminhados | **Automático, o dado já existe** | baixo/médio |

### 15. Farol de SLA
Os dois insumos já estão na tela: `data_limite` (que o item 19 quer chamar de Previsão de Entrega) e a
coluna **Dias Em Aberto**, já calculada e congelada no fechamento. Falta **a régua de cor**, e ela é
decisão do diretor, não da fábrica: quantos dias antes da previsão vira amarelo, e o que é vermelho
(estourou, ou vai estourar). Também falta decidir o farol da vaga **sem** previsão preenchida, que
hoje é a maioria: sem cor, ou cinza de "sem prazo".

### 16. Coluna Consultor Responsável
**O dado já existe e já chega à tela.** `consultorNome` e `recruiterNome` já vêm resolvidos em nome no
`VagaListItem` (`vagas.service.ts:143`), e hoje aparecem **só no modal do olho**. É célula, ordenação e
filtro, sem tocar em backend. **É o item mais rápido e mais seguro da lista inteira.**

Pergunta ao diretor: a vaga tem **dois** lados (Consultor e Recruiter, §A.3 da frente). Entra uma
coluna ou as duas?

### 17. Anotações / Histórico da vaga
**Não existe nada.** Não há tabela, rota nem tela de anotação ou histórico de VAGA. O histórico que
existe no módulo é de **candidatura** (`as_candidatura_etapas`, com etapa de/para, motivo, autor e
data), e ele não cobre a vaga.

É tabela nova, rota nova e modal novo. Precisa de desenho: anotação livre com autor e data, trilha
automática das mudanças da vaga (mudou posições, mudou status, quem mudou), ou as duas coisas na mesma
linha do tempo. Recomendo perguntar, porque as duas custam bem diferente.

### 18. Botão para ir à página de Candidatos
**Existe pela metade.** O ícone de funil na coluna Ações (`page.tsx:1867`) abre o
`CandidatosDaVagaModal`, um modal de consulta. **A página `/as/vagas` não importa `useRouter` nem
`Link`: não há navegação nenhuma.**

O destino já está preparado: `/as/candidatos` já tem filtro por vaga (`fVaga`, `page.tsx:160`), só não
o lê da URL. Falta o botão que navega e a leitura do parâmetro. **§A.6 tranquilo:** o que viaja é o
`vagaId` (uuid), e a regra de nunca pôr CPF em URL, escrita no cabeçalho daquela página, continua
respeitada.

Pergunta: o modal **fica** (consulta rápida) e ganha um botão "abrir na Central De Candidatos", ou o
modal **sai** e o ícone passa a navegar direto?

### 19. "Data Limite" para "Previsão de Entrega"
Trivial e seguro. São **dois** textos visíveis: o rótulo do campo no passo 2 (`page.tsx:2137`) e a
linha da ficha do olho (`page.tsx:3104`). **A coluna `data_limite` do banco não precisa mudar de
nome**, e não deve: renomear coluna é migração destrutiva por um ganho de zero.

Se o campo virar coluna da tabela (junto com o item 15), o cabeçalho segue §A.24: "Previsão De Entrega".

### 20. Candidatos Encaminhados
**É automático, e o dado já existe. Nenhuma marcação manual é necessária.**

Como a relação candidato/vaga funciona hoje: `as_candidaturas` liga candidato e vaga, com `etapa`
(Captação, Triagem, Entrevista Soulan, **Entrevista Cliente**, Aprovação) e `situacao` (Em Seleção,
Aprovado, Descartado, Desistiu, Contratado). Cada movimento grava uma linha em
`as_candidatura_etapas` (etapa de, etapa para, autor, data). **"Encaminhado para o cliente avaliar" é
exatamente `ENTREVISTA_CLIENTE`.**

Duas leituras, e o diretor escolhe:
1. **Está lá agora:** `etapa = ENTREVISTA_CLIENTE` na candidatura. Simples, mas o número **cai** quando
   a pessoa avança para Aprovação ou é descartada.
2. **Já passou por lá:** existe linha em `as_candidatura_etapas` com `etapa_para = ENTREVISTA_CLIENTE`.
   O número **só sobe**, e sobrevive ao avanço e ao descarte.

**Recomendo a 2**, porque "quantos eu já encaminhei" é uma conta acumulada, não uma foto. Custa uma
consulta agregada por vaga, no mesmo lugar em que o painel da vaga já é montado.

---

## GRUPO 4: funcionalidades novas

### 21. Comercial e Segmento
**Nenhum dos dois existe. Confirmado no banco, não deduzido.**
- `clientes` tem: cod_cliente, cnpj, razao_social, nome_operacao, ativo, empresa_grupo, regiao,
  descricao_regiao, beneficios_padrao, escala_padrao, endereco_padrao, os três campos de benefício e
  tipo_marcacao. **Não tem `segmento`.**
- `vagas` tem 64 colunas e **nenhuma se chama comercial**. As únicas ocorrências da palavra no código
  são comentários.

São **dois campos novos, em dois lugares diferentes**, e vale separar:
- **SEGMENTO é atributo do CLIENTE** (varejo, indústria, logística). Cadastro de clientes, catálogo
  próprio, e a vaga apenas **herda** pelo `cod_cliente`. Gravar segmento na vaga duplicaria um dado
  que muda no cliente e envelheceria na vaga.
- **COMERCIAL é atributo da VAGA** (quem vendeu aquela abertura), e aí precisa de decisão: é um
  **usuário** do sistema (como Consultor e Recruiter, com papel próprio), ou um **catálogo de nomes**
  à parte? Se for usuário, encosta no `papel_as`, que é código validado (§A.26).

### 22. Cancelar Vaga
**O ESTADO existe. A AÇÃO não existe.** E o próprio código diz isso, em `page.tsx:312`:
"CANCELADA entra na lista porque ela É um encerramento, mesmo que hoje **nenhuma rota escreva esse
status**".

O que já está de pé: o valor `CANCELADA` no enum, o card de KPI "Canceladas", a lista
`STATUS_ENCERRADOS` (congela os Dias Em Aberto), a trava que impede a vaga cancelada de receber
candidato (`STATUS_QUE_NAO_RECEBEM`, `domain/candidatura.ts:213`) e o bloqueio de editar posições
depois de cancelada.

O que falta: **botão, rota, motivo e trilha.** Não há `motivo_cancelamento` na tabela, nem data, nem
autor, nem catálogo de motivos. Hoje o único jeito de chegar em CANCELADA é **escolher "Cancelada" no
seletor de Status do formulário de abertura**, que é caminho errado e não registra nada.

Existe um catálogo espelho para copiar: `motivos_declinio`, o da esteira de admissão.

**Decisão que o desenho precisa (§A.27):** o que acontece com os **candidatos vivos** de uma vaga
cancelada? O fechamento tem a trava 5 (`travaCandidatosPendentes`), que recusa encerrar deixando
gente pendurada no funil e devolve a lista para tratar ali mesmo. O cancelamento herda essa trava,
ou cancela em massa junto? São respostas diferentes para a pessoa que foi entrevistada e nunca soube.

---

## PRIORIZAÇÃO SUGERIDA

**Faixa A, rápido e seguro, mexe em pouco e não alcança código de outra frente**
16 (coluna Consultor, o dado já viaja), 19 (renomear rótulo), 8 (tirar Vaga Banco do Status),
18 (botão que navega), 3 e 4 (valores de escolaridade), 6 e 7 (só decisão de rótulo, se for isso).

**Faixa B, ajuste de regra ou alcance médio, dá para construir depois de uma resposta curta**
14 (dropdown cortado: **poucas linhas, alcance no sistema inteiro, e o de melhor retorno da lista**),
1 (motivo condicional, depende da resposta sobre substituição), 20 (candidatos encaminhados),
15 (farol de SLA, depende da régua de cor), 9 (etapa do processo, se for a proposta derivada).

**Faixa C, precisa de DESENHO antes de qualquer código**
**11 + 12 + 13 como uma frente só** (fechamento por posição, o que ENTREGUE e FECHADA significam, e de
onde sai o número de preenchidas), 22 (cancelar vaga, com o destino dos candidatos vivos), 5 (idioma
com nível, muda a forma do dado), 17 (anotações e histórico, do zero), 21 (comercial e segmento),
2 (cidades, depois de confirmar se não é o item 14 ou a lista encadeada).

## PERGUNTAS QUE TRAVAM CONSTRUÇÃO

1. **Item 1:** "temporária" é a **Natureza** ou o **Vínculo**? E a substituição de **efetivo**, some
   junto com o campo Motivo?
2. **Itens 11/12/13:** a vaga fecha **por posição** (fecha 1, restam 8, segue aberta) ou de uma vez? E
   o número de preenchidas sai do **digitado no fechamento** ou do **derivado das candidaturas**?
3. **Item 13:** ENTREGUE e FECHADA passam a significar o quê?
4. **Item 2:** cidade é campo novo, ou o time não achou o par Estado + Regiões?
5. **Item 6 e 7:** "Reposição Efetiva" vira "Reposição", ou entra "Reposição" separada? "Vaga Interna"
   entra na Natureza mesmo já existindo "Interno" no Vínculo?
6. **Item 4:** "Cursando" é valor por nível, ou campo à parte?
7. **Item 15:** a régua de cor do farol (dias para amarelo, o que é vermelho, e a vaga sem previsão).
8. **Item 16:** uma coluna (Consultor) ou duas (Consultor e Recruiter)?
9. **Item 18:** o modal fica e ganha botão, ou o ícone passa a navegar?
10. **Item 20:** "encaminhados" é quem **está** em Entrevista Cliente, ou quem **já passou** por ela?
11. **Item 21:** Comercial é **usuário** do sistema ou catálogo de nomes? Segmento fica no **cliente**?
12. **Item 22:** vaga cancelada herda a trava dos candidatos pendentes, ou cancela em massa?
