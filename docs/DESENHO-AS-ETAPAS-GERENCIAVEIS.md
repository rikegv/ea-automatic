# DESENHO: as ETAPAS DO FUNIL viram TABELA GERENCIÁVEL (item 2.1 da leva)

> Entrega do agente `arquiteto`. É PLANO, não implementação (§A.39: o arquiteto desenha e não escreve
> código de produção). Tudo que está marcado **[REC]** é recomendação minha; **[PERGUNTA]** é decisão
> que não é minha nem da fábrica e precisa do diretor antes da construção começar.
>
> Medido contra o repositório em `main` e contra o banco real (`ea-db`) em 09/09/2026.

---

## 0. CORREÇÕES E ACRÉSCIMOS AO LEVANTAMENTO DO COORDENADOR

O levantamento está certo em quase tudo. Três correções e seis acréscimos.

### 0.1 Correções

**C1. Produção NÃO tem 0 candidaturas: tem 3, e o histórico tem 9 eventos.** Medido agora:

```
ea_automatic       as_candidaturas 3   (CAPTACAO 1, TRIAGEM 1, ENTREVISTA_SOULAN 1)
ea_automatic       as_candidatura_etapas 9
ea_automatic_homolog  as_candidaturas 52  (CAPTACAO 47, TRIAGEM 1, ENTREVISTA_SOULAN 2,
                                           ENTREVISTA_CLIENTE 1, APROVACAO 1)
ea_automatic_homolog  as_candidatura_etapas 82
```

As três de produção nasceram hoje às 17:24 UTC. Isso NÃO muda a conclusão ("a janela é agora"), muda o
plano de migração: a conversão precisa preservar linhas existentes em vez de assumir tabela vazia, e a
homologação (52 linhas, cobrindo as CINCO etapas) é o corpo de prova certo para ensaiar a migration
antes de tocar a produção.

**C2. A tabela de vagas se chama `vagas`, não `as_vagas`.** Só as quatro do módulo de candidatos têm
prefixo `as_` (`as_candidatos`, `as_candidaturas`, `as_candidatura_etapas`, `as_contatos`). Detalhe de
nomenclatura, mas ele decide o nome da tabela nova (ver §2.1).

**C3. `MoverEtapaDto` não é o único ponto de validação estática.** Há DOIS `@IsIn(CANDIDATURA_ETAPAS)`:
`candidatos.dto.ts:245` (mover uma) e `candidatos.dto.ts:536` (`MoverEtapaEmLoteDto`). Um plano que
converta só o primeiro deixa o lote aceitando etapa que não existe mais, ou recusando a etapa nova.

### 0.2 Acréscimos (o que o levantamento não viu, e cada um custa uma rodada se aparecer depois)

**A1. A ETAPA INICIAL NÃO ESTÁ EM CÓDIGO NENHUM: ela é o DEFAULT DA COLUNA NO BANCO.**
`as_candidaturas.etapa` é `NOT NULL DEFAULT 'CAPTACAO'::candidatura_etapa` (schema em
`tables.ts:2796`), e o service **conta com isso**: `candidatos.service.ts:445-458` insere a candidatura
SEM passar `etapa` e depois faz `.returning({ etapa })` para gravar o evento de ENTRADA do histórico
com o valor que o banco escolheu. Se a etapa vira linha de tabela e ninguém tocar nisso, o default do
banco vira um SEGUNDO lugar que decide o começo do funil, capaz de apontar para uma etapa que o diretor
inativou. O `NovoCandidatoModal.tsx:123` tem a MESMA constante escrita à mão no estado inicial da tela
(`useState<CandidaturaEtapa>("CAPTACAO")`), então hoje são três fontes concordando por coincidência.

**A2. A ORDEM DO FUNIL JÁ É LIDA COMO DADO EM QUATRO LUGARES, via `indexOf` da constante.**
`vagas.service.ts:1372` (ordena os candidatos pendentes do fechamento, do fim do funil para o começo),
`VagaPainelModal.tsx:744-745`, `as/candidatos/page.tsx:333` (ordenação da coluna Etapa) e
`MoverCandidaturaModal.tsx:362-364` (a fileira de cards). Os quatro passam a depender da coluna `ordem`
da tabela. Nenhum deles quebra "com erro": eles passam a ordenar errado em silêncio, que é pior.

**A3. `TOM_ETAPA` é `Record<CandidaturaEtapa, PillTone>` e a exaustividade do TypeScript é
DELIBERADA.** O comentário em `as-candidatos-visual.ts:53-61` diz, com todas as letras, que o `Record`
existe para o compilador EXIGIR a cor da etapa nova. Com a lista saindo do tipo, essa garantia morre e
precisa ser substituída por um fallback explícito em runtime mais teste (ver §4.3). Isso é um custo
real do desenho e está escrito aqui para não ser descoberto no meio da construção.

**A4. A paleta de tons úteis para etapa tem EXATAMENTE 5, e hoje há 5 etapas.** `PillTone` é
`ok | wn | or | dg | nt | in` (`Pill.tsx:4`), e o `dg` está fora de propósito (§A.12: vermelho é recusa,
e `StatusPill` põe o X vermelho nele; o comentário em `as-candidatos-visual.ts:64-70` já registra que
"a paleta fecha EXATA e não sobra tom para uma sexta etapa"). O gerenciador nasce para o diretor criar
a sexta etapa. Isso precisa de decisão ANTES da tela existir (ver §3.2).

**A5. O `kpiDaCandidatura` tem as cinco etapas como CHAVES LITERAIS de um union
(`as-candidatos.ts:305-352`), e a fileira de KPIs da Central de Candidatos escreve rótulo, ícone e cor
à mão, por etapa (`as/candidatos/page.tsx:527-563`).** É exatamente a peça 2.3 da leva. Se o item 2.1
não deixar isso preparado, a 2.3 vira gambiarra por construção (ver §7).

**A6. O filtro de Etapa de hoje é de valor ÚNICO (`Combobox`, `as/candidatos/page.tsx:465-476`) e
viola a §A.28.** Ele será tocado por esta frente de qualquer forma (a fonte das opções muda). Tocado,
converte junto para `MultiSelect`, com as opções vindas do ENDPOINT e não das linhas carregadas
(§A.37). Não é escopo novo: é a régua da casa aplicada ao que a OST já obriga a tocar.

**A7. Precedente exato para o desenho, e ele é do próprio sistema.** `frentes_admissao.status` é
`varchar(40)` apontando para o catálogo `frente_status_catalogo`, e o comentário do schema
(`tables.ts:1216-1229`) explica: "status é varchar + catálogo porque cada frente tem um conjunto
próprio de status; a integridade vem do catálogo/aplicação". O gerenciador do iFractal
(`ifractal-status.service.ts`) é a forma que o diretor pediu, e ele já resolveu, na produção, três dos
buracos que esta OST reabre: código estável derivado do rótulo, renomear sem mover ninguém, e recusa de
exclusão com a contagem de quem está lá dentro.

---

## 1. O RECORTE, e o que NÃO entra

**ETAPA é lugar no funil. DESFECHO é decisão.** O gerenciador administra SÓ etapas.

| | é | mora em | entra no gerenciador? |
|---|---|---|---|
| ETAPA | onde a pessoa está | `as_candidaturas.etapa` | **SIM**, vira tabela |
| SITUAÇÃO/DESFECHO | se o processo segue, entregou ou acabou | `as_candidaturas.situacao` | **NÃO**, e nem encosta |

`CANDIDATURA_SITUACOES` (`shared-types:2186`) e tudo que deriva dela (`consomePosicao`,
`finalizaPosicao`, `ehSaidaSemExito`, `candidaturaViva`) **NÃO É TOCADO POR ESTA FRENTE**. Elas carregam
REGRA (quem ocupa posição da vaga, quem enche o cilindro, quem sai da fila), e é por isso que o próprio
iFractal só pôde virar catálogo editável: "no iFractal não há regra por status" (`ifractal-status.service.ts:15`).
A etapa do funil está no mesmo caso desde 27/08, quando o diretor tirou o trilho: mover de etapa não
muda situação nenhuma (`domain/candidatura.ts:41-53`). É por isso que a ETAPA pode virar dado e a
SITUAÇÃO não pode.

**Consequência prática que precisa aparecer na tela:** o `MoverCandidaturaModal` mistura, no mesmo
seletor, os cards de ETAPA (que viram catálogo) e os de DESFECHO (que não viram). O modal continua com
os dois; o que muda é que a parte de cima passa a ser desenhada a partir do catálogo e a de baixo
continua vindo do vocabulário fixo. Nenhuma linha do bloco de desfechos é tocada (§A.14).

---

## 2. P1: ENUM DO POSTGRES PARA TABELA, sem o histórico passar a mentir

### 2.1 A tabela [REC]

`as_etapas_funil`, no molde do `frente_status_catalogo`:

| coluna | tipo | por quê |
|---|---|---|
| `id` | serial | chave técnica, igual ao catálogo do iFractal |
| `codigo` | `varchar(40) NOT NULL UNIQUE` | **a identidade**, derivada do rótulo na criação e **imutável para sempre** |
| `rotulo` | `varchar(120) NOT NULL` | o que a tela mostra, editável à vontade |
| `ordem` | `integer NOT NULL` | a ordem do funil (§3.1) |
| `tom` | `varchar(4) NOT NULL` + CHECK | a cor, da paleta fechada (§3.2) |
| `inicial` | `boolean NOT NULL DEFAULT false` | em qual etapa a candidatura NASCE. Exclusivo, igual ao `conclui` do iFractal |
| `ativa` | `boolean NOT NULL DEFAULT true` | inativar em vez de apagar (§2.4) |
| `criado_em` / `atualizado_em` | timestamptz | padrão da casa |

`codigo` reusa `codigoDoRotulo` (`ifractal-status.service.ts:177-186`, já em produção): "Entrevista
Cliente" vira `ENTREVISTA_CLIENTE`. **Reusar a função existente, não escrever outra** (duas normalizações
divergem no primeiro acento).

### 2.2 As três colunas que hoje são enum

```
as_candidaturas.etapa            enum  ->  varchar(40)  FK -> as_etapas_funil.codigo  (RESTRICT)
as_candidatura_etapas.etapa_de   enum  ->  varchar(40)  FK -> as_etapas_funil.codigo  (RESTRICT)  [nullable]
as_candidatura_etapas.etapa_para enum  ->  varchar(40)  FK -> as_etapas_funil.codigo  (RESTRICT)
```

**[REC] FK DE VERDADE, e é aqui que eu divirjo do precedente do `frentes_admissao`.** Lá a integridade
"vem do catálogo/aplicação" (`tables.ts:1219`). Aqui o risco INTEIRO desta OST é o diretor apagar uma
etapa e deixar linha apontando para o nada, e o banco fecha esse buraco de graça: com `RESTRICT`, o
`DELETE` é fisicamente impossível enquanto existir UMA linha, viva ou histórica, apontando para a
etapa. A checagem na aplicação continua existindo, mas para dar a MENSAGEM boa com a contagem, e não
para ser a única trava. Custo: `codigo` precisa de `UNIQUE` (já tem) e nunca pode ser alterado (é regra,
§2.3).

### 2.3 Por que o histórico NÃO passa a mentir [REC]

O desenho separa **identidade** de **nome**:

- **A identidade é o `codigo`, e ele é IMUTÁVEL.** Não existe operação "trocar o código". É a mesma
  decisão que o iFractal já tomou e documentou: "o CÓDIGO é derivado do rótulo e é ESTÁVEL: é ele que
  fica gravado, então renomear depois não pode mexer nele" (`ifractal-status.service.ts:76-79`).
- **O `rotulo` é resolvido pelo catálogo, por join**, tanto na leitura viva quanto no histórico.

Então "descartado na Triagem" continua apontando para a MESMA etapa para sempre. Se o diretor renomear
"Triagem" para "Triagem Inicial", o histórico passa a dizer "descartado na Triagem Inicial", que é a
leitura CERTA: é a mesma etapa, com o nome corrigido.

**O caso que este desenho NÃO cobre, e é preciso dizer:** se o diretor renomear "Triagem" para
"Entrevista Técnica" com a intenção de REUSAR a linha para outro conceito, o histórico antigo passa a
dizer "Entrevista Técnica" para gente que esteve na Triagem. Nenhum desenho impede isso sozinho, porque
é um ato humano deliberado. O que o desenho faz é (a) avisar na tela, no ato do rename, que o nome muda
em TODO o histórico daquela etapa, e (b) deixar o caminho certo mais fácil: criar etapa nova e inativar
a velha custa dois cliques.

**[PERGUNTA D1] O diretor quer o RÓTULO CONGELADO no evento do histórico?**
A alternativa é gravar `etapa_para_rotulo` (e `etapa_de_rotulo`) no momento do evento, congelado. Ela
torna o histórico imune até ao rename destrutivo. **Eu NÃO recomendo**, por um efeito medido no uso: a
linha do tempo de uma pessoa passaria a mostrar "Entrevista Soulan" nos eventos velhos e "Entrevista
RH" nos novos, para a MESMA etapa, e quem lê conclui que são duas. Como rename é, na esmagadora
maioria, correção de nome, congelar troca uma mentira rara por uma confusão frequente. Custo de mudar
de ideia depois: duas colunas e um backfill, barato, mas o backfill só saberia o rótulo ATUAL.

### 2.4 A migration, e a armadilha que já foi medida nesta casa

Um arquivo só, na ordem: cria a tabela, **semeia as cinco etapas atuais**, converte as três colunas
(`USING etapa::text`), tira o `DEFAULT` antigo, cria as FKs, e por último `DROP TYPE candidatura_etapa`.

**A armadilha do `ADD VALUE` NÃO se aplica aqui, e isso é bom:** o comentário da migration 0095
(`0095_as_situacao_alocado.sql:8-30`) mediu que o drizzle envolve **TODAS** as migrations pendentes em
UMA transação, então valor de enum criado em um arquivo não pode ser usado no seguinte. Esta frente não
cria valor de enum nenhum: ela SAI do enum. Tudo cabe numa transação sem esse problema.

O que exige cuidado, na ordem: (1) `DROP DEFAULT` **antes** do `ALTER TYPE` da coluna (o default é
tipado com o enum); (2) o `DROP TYPE` só depois das três colunas convertidas; (3) conferir que ninguém
mais depende do tipo (`select * from pg_depend` pelo oid do tipo) antes de dropar. **[REC] Ensaiar
contra um CLONE da homologação** (52 linhas, cobre as 5 etapas), que é o procedimento que a 0095 já
usou e que fez o erro aparecer em ensaio em vez de em produção.

**Sem `DEFAULT` novo na coluna** (acréscimo A1): quem decide a etapa de nascimento passa a ser o
catálogo (`inicial = true`), lido pelo service e passado explicitamente no INSERT. Um default no banco
seria um segundo dono da mesma decisão, capaz de apontar para etapa inativada, em silêncio.

---

## 3. P2 e P3: apagar, ordenar e colorir

### 3.1 O que acontece quando o diretor apaga uma etapa que tem gente [REC]

**Três camadas, em ordem de tentativa.** As duas primeiras são cópia do que o iFractal já faz em
produção (`ifractal-status.service.remover`, linhas 146-175):

1. **Tem candidatura VIVA na etapa: RECUSA, com o número.** "3 candidaturas estão nesta etapa. Mova
   essas pessoas para outra etapa antes de remover." Mesma frase-molde do iFractal, que já diz quantas
   são para o time saber o tamanho do trabalho.
2. **Não tem ninguém vivo, mas tem HISTÓRICO: NÃO apaga, INATIVA** (`ativa = false`). A etapa some dos
   seletores, dos filtros, dos cards e da tela de mover, e continua resolvendo o rótulo do histórico de
   quem passou por ela. É o padrão de todo catálogo do sistema ("inativar é exclusão lógica",
   `tables.ts`, projetos de alto volume). A FK `RESTRICT` garante que nem por SQL cru alguém apaga.
3. **Zero vivo e zero histórico: apaga de verdade.** É o caso real do primeiro dia: criou "Trigem" com
   erro de digitação e quer sumir com ela.

**Mais duas travas, que o iFractal ensina por analogia:**
- **Não se remove nem inativa a etapa INICIAL** sem marcar outra antes ("Este é o status que conclui a
  frente. Marque outro antes", `ifractal-status.service.ts:157-161`). Sem isso, a próxima candidatura
  nasce sem lugar.
- **Não se inativa a ÚLTIMA etapa ativa.** Funil sem etapa não é funil, e a tela de mover ficaria vazia.

**[REC] NÃO migrar candidatos automaticamente** ("apagar a Triagem move todo mundo para X"). É
irreversível, silencioso e escreve no histórico de gente um movimento que ninguém decidiu. A recusa com
a contagem, mais o mover em lote que a tela **já tem** (`moverEtapaEmLote`, `candidatos.service.ts:1070`),
resolve o mesmo problema com a decisão na mão de quem opera. **[PERGUNTA D2]:** o diretor aceita mover
em lote pela tela existente, ou quer o botão "mover todos para" dentro do próprio gerenciador? O segundo
é escopo novo e eu não construiria sem o pedido (§A.31).

### 3.2 Ordem [REC]

- Campo `ordem integer NOT NULL`, e a leitura ordena por `(ordem, id)`, exatamente como o iFractal
  (`ifractal-status.service.ts:73`). O desempate por `id` é o que impede que duas etapas com a mesma
  ordem troquem de lugar a cada consulta.
- **Reordenar é UMA rota que recebe a LISTA COMPLETA de ids na ordem nova** (`PATCH /admin/as/etapas/ordem`,
  corpo `{ ids: [...] }`), e reescreve `ordem = 1..N` numa transação. Não usar "sobe/desce" com troca
  de pares: dois cliques rápidos produzem ordem duplicada, e a colisão só aparece na tela do outro.
- **Sem `UNIQUE` em `ordem`.** A reescrita passa por estados transitórios com duplicata, e um unique
  não postergável recusaria a própria reordenação. A autoridade é a reescrita completa.
- Etapa nova nasce no fim (`max(ordem) + 1`), igual ao iFractal.

### 3.3 Cor [REC]: paleta FECHADA do design system, nunca cor livre

**Não é preferência estética, são três razões concretas:**
1. **Os dois temas saem de graça.** Cada tom já tem par claro/escuro em `globals.css:714-754`. Cor
   digitada pelo diretor (um `#hex`) que fica legível no tema escuro some no claro, e vice-versa. É o
   mesmo motivo da §A.35 para o `<select>` nativo: a única parte da interface que o sistema não
   controla é a que destoa.
2. **O ÍCONE da pill é DERIVADO do tom** (`StatusPill.tsx:11-18`, §A.12: o ícone acompanha o estado
   real). Cor livre não tem ícone associado, e a §A.12 deixaria de ser cumprível na coluna Etapa.
3. `dg` (vermelho) fica **fora da paleta oferecida**, e a razão está escrita em
   `as-candidatos-visual.ts:64-70`: vermelho é recusa (X vermelho), e etapa de funil é posição, não
   julgamento. Pintar uma etapa de vermelho diria que quem está nela foi reprovado.

Sobram **cinco** tons: `nt` (neutro), `in` (azul), `wn` (amarelo), `or` (laranja), `ok` (verde). Com
cinco etapas hoje, a paleta fecha exata (acréscimo A4).

**[PERGUNTA D3] O que fazer quando ele criar a SEXTA etapa?** Três saídas, e eu recomendo a primeira:
- **[REC] permitir REPETIR tom, com aviso e sem bloqueio** ("este tom já é usado por Triagem"). Duas
  etapas da mesma cor lêem pior, mas continuam legíveis, e o rótulo está escrito na pill.
- **ampliar a paleta em 1 ou 2 tons.** É barato para um: `--accent-2` (verde-limão) já existe nos dois
  temas (`globals.css:28` e `:81`) e não é usado por pill nenhuma, então bastaria uma classe `.pill.lm`.
  Um roxo exigiria variável nova nos dois temas. **É mexer no design system**, e eu não faria sem pedido.
- **cor livre**: não recomendo, pelas três razões acima.

### 3.4 [PERGUNTA D4] Ícone por etapa?

A fileira de KPIs de hoje tem um ícone POR etapa, escrito à mão (`as/candidatos/page.tsx:530-563`:
`users`, `filter`, `chart`, `peak`, `clock`). Com etapa gerenciável, ou o catálogo ganha uma coluna
`icone` (e a tela ganha um seletor de ícones), ou todas as etapas passam a usar UM ícone só, com o tom
fazendo a distinção. **[REC] um ícone só agora** (menos superfície, e a cor já distingue), e o seletor
de ícone só se o diretor pedir. A decisão precisa sair ANTES da 2.3, porque é ela que redesenha a
fileira.

---

## 4. P4: QUEM MAIS LÊ `etapa`. A lista completa

Levantada por `grep` sobre todo `apps/` e `packages/`. **QUEBRA** quer dizer "para de compilar ou passa
a se comportar errado se nada for feito"; **SILENCIOSO** é o perigoso: compila e mente.

### 4.1 Vocabulário e banco

| arquivo:linha | o que faz | efeito |
|---|---|---|
| `packages/shared-types/src/index.ts:2138-2153` | `CANDIDATURA_ETAPAS` + `CANDIDATURA_ETAPA_LABEL` | **SAI** (§5) |
| `packages/shared-types/dist/index.d.ts` | artefato de build | exige `pnpm --filter @ea/shared-types build` |
| `apps/backend/src/db/schema/enums.ts:404` | `pgEnum("candidatura_etapa", ...)` | **SAI** |
| `apps/backend/src/db/schema/tables.ts:2796` | coluna `etapa` + `default("CAPTACAO")` | **QUEBRA**: vira varchar, sem default |
| `apps/backend/src/db/schema/tables.ts:2963,2965` | `etapa_de` / `etapa_para` | **QUEBRA**: viram varchar + FK |
| `apps/backend/drizzle/0083_as_central_de_candidatos.sql` | migration histórica | **não se toca** |

### 4.2 Backend

| arquivo:linha | o que faz | efeito |
|---|---|---|
| `domain/candidatura.ts:56-70` | `destinosDeEtapa` / `proximasEtapas` (lê a constante) | **QUEBRA**: recebe a lista do catálogo por parâmetro |
| `domain/candidatura.ts:74-80` | `entrevistaClienteOpcional` (cita `ENTREVISTA_SOULAN`/`APROVACAO` literais) | **QUEBRA**: função de valor duvidoso hoje ("sempre verdadeira", diz o próprio comentário). **[REC] remover junto**, com aval |
| `domain/candidatura.ts:84-101` | `movimentoPermitido`, `avancoPermitido`, `ehEtapaConhecida` | **QUEBRA**: `ehEtapaConhecida` vira consulta ao catálogo |
| `domain/candidatura-historico.ts:21-22,107-112` | tipo do evento e `etapasPercorridas` | compila (é genérico sobre strings), **revisar tipos** |
| `as/candidatos/candidatos.dto.ts:245` e `:536` | os DOIS `@IsIn(CANDIDATURA_ETAPAS)` | **QUEBRA**: validação estática vira validação contra o catálogo (§5.2) |
| `as/candidatos/candidatos.service.ts:445-458` | insere SEM etapa e lê o default do banco | **SILENCIOSO**: passa a resolver `inicial` do catálogo |
| `as/candidatos/candidatos.service.ts:501-541` | `moverEtapa` | valida contra o catálogo |
| `as/candidatos/candidatos.service.ts:838-847`, `923-937`, `1470-1473` | grava `etapaPara: c.etapa` (troca de vaga, desfecho, finalização) | segue igual (copia o código gravado) |
| `as/candidatos/candidatos.service.ts:1063-1072` | `moverEtapaEmLote` | mesma validação |
| `as/candidatos/candidatos.service.ts:1563-1600` | monta o histórico | **acrescenta o join** para resolver o rótulo |
| `as/candidatos/candidatos.service.ts:1750` | mapeia `etapa` no item da lista | segue igual |
| `as/vagas/vagas.service.ts:1372` | **ordena por `CANDIDATURA_ETAPAS.indexOf`** | **SILENCIOSO**: passa a ordenar pela `ordem` do catálogo |
| `as/vagas/vagas.service.ts:91,1328,1386` | tipo e select do candidato pendente | tipo afrouxa para string |
| `as/candidatos/candidatos.controller.ts:124,130,212` | as rotas de etapa | inalteradas |
| `auditoria/auditoria.service.ts:238,253` | **falso positivo do grep**: a palavra "triagem" em comentário de auditoria documental | **nada a fazer** |

### 4.3 Frontend

| arquivo:linha | o que faz | efeito |
|---|---|---|
| `lib/as-candidatos-visual.ts:72-88` | `TOM_ETAPA: Record<CandidaturaEtapa, PillTone>` + `tomDaEtapa` | **QUEBRA**: vira lookup por código no catálogo, com fallback `nt`. Perde-se a exaustividade do compilador (acréscimo A3) |
| `lib/as-candidatos.ts:252-258` | `destinosDeEtapa` espelhado da constante | **QUEBRA**: lê o catálogo |
| `lib/as-candidatos.ts:262-278` | `caminhoAteEtapa` (etapa de entrada do cadastro) | **QUEBRA** |
| `lib/as-candidatos.ts:305-352` | `KpiFunil` (union literal) + `kpiDaCandidatura` | **QUEBRA**, e é a peça-chave da 2.3 (§7) |
| `lib/as-candidatos-lote.ts:114-122` | assinatura tipada | tipo afrouxa |
| `app/(app)/as/candidatos/page.tsx:122,240-241` | estado e filtro por etapa | **QUEBRA** + converter para multiselect (§A.28) |
| `.../page.tsx:272-283` | contagem dos cards | **QUEBRA** (2.3) |
| `.../page.tsx:302-335` | **ordenação da coluna Etapa por `indexOf`** | **SILENCIOSO** |
| `.../page.tsx:465-476` | `Combobox` de etapa (valor único) | **QUEBRA** + §A.28/§A.37 |
| `.../page.tsx:514-563` | fileira de KPIs com rótulo/ícone/cor à mão | **QUEBRA** (2.3) |
| `.../page.tsx:624-625,698-713` | coluna e pill de etapa | rótulo/tom vêm do catálogo |
| `components/as/candidatos/MoverCandidaturaModal.tsx:75-76,302,352-406` | os cards do funil, na ordem, com o tom | **QUEBRA** |
| `components/as/candidatos/NovoCandidatoModal.tsx:123,470-472` | `useState("CAPTACAO")` e o seletor | **SILENCIOSO** (acréscimo A1) |
| `components/as/candidatos/FichaCandidatoModal.tsx:24,96-108,303-304` | linha do tempo e pill | rótulo do catálogo |
| `components/as/vagas/AcoesEmMassaDaVaga.tsx:43-44,502-524` | seletor do lote | **QUEBRA** |
| `components/as/vagas/VagaPainelModal.tsx:66-67,744-745,906-907` | ordenação e pill | **SILENCIOSO** |
| `components/as/vagas/CandidatosDaVagaModal.tsx:40,134` | pill | rótulo do catálogo |
| `components/as/vagas/CandidatosPendentesModal.tsx:32,162-163` | pill | rótulo do catálogo |
| `components/as/vagas/VagaResumoModal.tsx` | **falso positivo** ("triagem" em comentário) | nada |

### 4.4 Testes que tocam etapa (insumo para o `tester`, §A.38/§A.40)

Backend: `domain/candidatura.spec.ts`, `domain/candidatura-historico.spec.ts`,
`as/candidatos/candidatos.{desvincular-da-vaga,finalizar-posicao,guardas-de-situacao,historico-aceite,lote-dto,lote-falhas,lote-ocupacao,vaga-encerrada}.spec.ts`,
`as/vagas/vagas.{fechamento-apos-reducao,fechamento-derivado,rastro-reducao-na-trilha,ocupacao-listagem}.spec.ts`.
Frontend: `lib/as-candidatos.spec.ts`, `lib/as-candidatos-visual.spec.ts` (afirma
`tomDaEtapa("APROVACAO") === "ok"`, vira teste de lookup com fallback),
`components/as/candidatos/MoverCandidaturaModal.desvincular.spec.tsx`,
`components/as/vagas/AcoesEmMassaDaVaga.spec.tsx`.

**A maioria continua passando sem alteração**, porque os CÓDIGOS não mudam ("CAPTACAO" segue sendo
"CAPTACAO"). Quebram os que importam a constante para iterar e os que dependem do `Record` exaustivo.

### 4.5 O que NÃO lê etapa, e é bom deixar registrado

`retencao-candidatos.service.ts` (expurgo LGPD) **não toca etapa** (as ocorrências de "etapa" ali são a
palavra em comentário sobre "duas etapas" de um update). O Pandapé, a Esteira, o Gerenciador e o
iFractal **não conhecem** `as_candidaturas`: o módulo A&S é ilha em relação a eles. Nenhum KPI de
diretoria lê etapa de funil hoje.

---

## 5. P5: o que sobra no `shared-types`, e como a tela recebe as etapas

### 5.1 O vocabulário novo [REC]

**SAI:** `CANDIDATURA_ETAPAS` e `CANDIDATURA_ETAPA_LABEL`.

**ENTRA** (escrito pelo COORDENADOR, dono único do arquivo, §A.39):

- `type CandidaturaEtapa = string`, **mantendo o nome**, com um bloco de comentário dizendo que ela
  deixou de ser union e por quê. Manter o nome evita reescrever mais de 20 assinaturas em backend e
  frontend, e o `grep` continua encontrando tudo por um nome só.
- `interface AsEtapaFunil { id: number; codigo: string; rotulo: string; ordem: number; tom: EtapaTom; inicial: boolean; ativa: boolean }`.
- `const ETAPA_TONS = ["nt","in","wn","or","ok"] as const` + `type EtapaTom`. É a paleta oferecida
  (§3.3), e ela é vocabulário compartilhado de verdade: o CHECK do banco, o DTO e o seletor da tela
  precisam concordar, e três listas concordam por coincidência.
- `const ETAPAS_FUNIL_SEMENTE = [...] as const`, as cinco de hoje com código, rótulo, ordem e tom
  (copiados de `TOM_ETAPA`), **consumida UMA vez no seed e nunca mais**. Espelho literal do
  `STATUS_IFRACTAL_SEMENTE` (`shared-types:212-217`), inclusive no comentário que avisa que a fonte da
  verdade passou a ser a tabela.
- `const ETAPA_TOM_PADRAO: EtapaTom = "nt"`, o fallback de quem não achar o código.

**O custo, escrito para não ser descoberto no meio:** com `CandidaturaEtapa = string`, o TypeScript para
de recusar `"TRIGEM"`. O que substitui a garantia: (a) o DTO valida contra o catálogo, em runtime, nas
DUAS rotas; (b) a FK do banco recusa em última instância; (c) o `tomDaEtapa` devolve o fallback em vez
de `undefined`, com teste. É menos garantia do que hoje. É o preço de a lista ser do diretor.

### 5.2 Como a etapa chega em quem precisa [REC]

**Duas superfícies, papéis diferentes:**

- **`GET /as/etapas`**, leitura, autenticada e **não gated por menu**. Mesmo tratamento das leituras de
  catálogo que já existem: "as GETs de lista de clientes/cargos/escalas e tudo em `/catalogos` NÃO são
  reivindicadas por menu nenhum" (`domain/menus.ts:16-18`). Devolve as ATIVAS por padrão e
  `?incluirInativas=1` para o histórico resolver rótulo de etapa inativada.
- **`/admin/as/etapas` (POST/PATCH/DELETE + `PATCH .../ordem`)**, gated pelo menu novo.

**No backend**, a validação do DTO precisa da lista viva. Duas formas:
- **[REC] `EtapasFunilService` com cache em memória**, invalidado nas escritas do próprio service
  (única porta de escrita). O catálogo tem 5 a 10 linhas e é lido em toda mudança de etapa; consultar o
  banco a cada `@IsIn` seria consulta por requisição para um dado que muda uma vez por mês.
- validação no service (não em decorator do DTO), lendo o cache. O `class-validator` não faz consulta
  assíncrona bem; o `@IsIn` estático simplesmente sai e a recusa passa a ser um `BadRequestException`
  com a frase certa ("Esta etapa não existe mais no funil.").

**No frontend**, `lib/as-etapas.ts` com **uma promessa memoizada** por carga de página (o mesmo dado
serve a 8 telas) e helpers: `rotuloDaEtapa(codigo)`, `tomDaEtapa(codigo)`, `etapasOrdenadas()`,
`etapaInicial()`. **[REC] NÃO criar contexto React novo** (superfície nova em `AppShell`, alcance
grande, §A.14/§A.26): um módulo com cache resolve, é testável sem montar árvore, e é o padrão que o
`lib/` já usa.

**Ponto operacional que morde:** valor novo no `shared-types` só aparece em runtime depois de
`pnpm --filter @ea/shared-types build`, e o arquivo é ÚNICO (`export *` para outro arquivo quebra
backend ou frontend, e a queda do backend só aparece no próximo restart). O passo do build entra
explicitamente na etapa E0.

---

## 6. P6: A ORDEM DE CONSTRUÇÃO

Sete passos. Cada um é publicável sozinho, e **nenhum quebra o anterior**, porque os CÓDIGOS não mudam:
`"CAPTACAO"` continua sendo `"CAPTACAO"` do começo ao fim. É essa propriedade que permite backend e
frontend andarem em passos separados.

| # | quem | o que | como o diretor valida |
|---|---|---|---|
| **E0** | **coordenador** | vocabulário no `shared-types` (§5.1) + `pnpm build` do pacote. Passa antes pelo `seguranca`, sobre o MAPA (§A.40, regra 1) | nada visível. Gate verde |
| **E1** | `backend` | tabela `as_etapas_funil` + migration (§2.4) + seed idempotente + FKs. Ensaio em clone da homologação primeiro | nada visível. Prova por SQL: 5 etapas semeadas, as 3 candidaturas de produção e os 9 eventos intactos |
| **E2** | `backend` | leitura `GET /as/etapas`, `EtapasFunilService` com cache, validação dos 2 DTOs contra o catálogo, `inicial` substituindo o default do banco, ordem do funil vinda da coluna `ordem` (`vagas.service.ts:1372`) | **a Central de Candidatos continua idêntica**. É o teste: nada mudou na tela e a lista agora vem do banco |
| **E3** | `backend` | CRUD admin (criar/renomear/reordenar/tom/inicial/inativar/remover) com as travas da §3.1 + registro do menu (§A.23: nasce SÓ para SUPER_ADMIN) | por rota, ou já na E4 |
| **E4** | `frontend` | a tela do gerenciador, molde iFractal, §A.12/§A.20/§A.24/§A.29/§A.35 | **a peça que ele pediu**: cadastra, renomeia, reordena, escolhe cor, tenta apagar uma etapa com gente e vê a recusa com o número |
| **E5** | `frontend` | as telas de consumo passam a ler o catálogo: pill, cards do mover, seletor do lote, cadastro, ordenação, e o filtro de etapa vira **multiselect** (§A.28/§A.37) | cria uma etapa nova na E4 e vê ela aparecer, com a cor certa, em TODAS as telas, sem a fábrica tocar em nada |
| **E6** | `seguranca` + `tester` | auditoria do RBAC da rota admin e cobertura independente | veredito no pulso (§A.38) |

**O `tester` entra na E1, não na E6** (§A.40, regra 2): ele escreve, a partir deste desenho, os testes
que devem falhar (apagar etapa com gente, reordenar com colisão, etapa inativa some do seletor e
continua resolvendo o histórico, candidatura nasce na etapa marcada `inicial`), enquanto backend e
frontend constroem. Não precisa do código, precisa do requisito.

**Sobre onde ele valida:** a §A.32 manda a validação acontecer na **3120 (homologação)**, e a §A.25
manda subir depois. O plano assume isso. Se o diretor quiser validar direto em produção, é decisão
dele, mas a E1 mexe em coluna de tabela viva e eu recomendo com força o ensaio na homologação antes.

**Linha fixa de todo briefing de backend (§A.40, regra 3), já respondida aqui:** quem mais escreve
`as_candidaturas.etapa`? Três lugares, todos em `candidatos.service.ts`: o INSERT de nascimento
(:445-458, hoje via default do banco), o `moverEtapa` (:533) e o `moverEtapaEmLote` (que chama o
`moverEtapa`, :1070). Mais nada no repositório escreve nessa coluna. Quem escreve
`as_candidatura_etapas`: cinco INSERTs, todos no mesmo arquivo (:454, :536, :844, :934, :1470).

---

## 7. P7: O QUE ISTO PRECISA OFERECER PARA 2.2, 2.3 e 2.4

### 7.1 Item 2.2, "Em Processo" no cilindro: **quase pronto, e ninguém percebeu**

`AsOcupacaoVaga.emSelecao` **já existe** (`shared-types:2655`), **já é calculado**
(`domain/candidatura.ts:346`: `situacoes.filter(s => s === "ATIVO").length`), **já vem em todo
`VagaListItem.ocupacao`** e **nenhum componente do frontend o renderiza** (grep: zero consumidores).
A 2.2 é, na maior parte, trabalho de frontend.

**O que este desenho precisa garantir para ela não virar gambiarra:** que ninguém conte de novo na tela.
A Central de Vagas tem a régua de contagem em `lib/as-vagas-ocupacao.ts` justamente porque "a régua
precisa de teste de unidade" (`as/vagas/page.tsx:210-215`). "Em Processo" lê a derivada, ponto.

**[PERGUNTA D5] O que "Em Processo" conta?** `emSelecao` conta SÓ `ATIVO`. Quem está `APROVADO` ou
`ALOCADO` continua no funil (o modelo de posição diz isso com todas as letras: "o alocado PREENCHE a
posição e CONTINUA no funil") e **não** entraria na conta. Se o diretor quiser "todo mundo no funil",
a régua muda em `ocupacaoDaVaga` e o campo passa a ser outro, ao lado de `emSelecao`, sem substituí-lo:
`emSelecao` já é lido pelos testes de ocupação.

### 7.2 Item 2.3, KPIs por etapa E por desfecho: o lugar exato onde encaixar

**A contagem por etapa por vaga sai de UMA coluna a mais num `group by` que já existe.**
`vagas.service.ocupacaoPorVaga` (:1566-1607) agrupa hoje por `(vagaId, situacao, posicaoLado)`
(:1586). Acrescentar `etapa` ao `group by` dá a contagem por etapa sem consulta nova, e o comentário do
próprio método já registra que o custo de mais uma dimensão ali é o número de linhas, não uma consulta
a mais (:1544-1560).

**O contrato tem de nascer DINÂMICO, e é aqui que a 2.1 decide o destino da 2.3:**
- `AsOcupacaoVaga` ganha `porEtapa: Record<string, number>` (chave = código da etapa), **nunca** cinco
  campos fixos. Cinco campos fixos seriam a mesma armadilha que a 2.1 está desmontando.
- `KpiFunil` (`lib/as-candidatos.ts:305-315`) **deixa de ser union de literais** e vira
  `{ tipo: "ETAPA"; codigo: string } | { tipo: "DESFECHO"; situacao: CandidaturaSituacao }`. A régua que
  já está escrita e é boa ("a SITUAÇÃO vence a ETAPA; a etapa só decide entre os cards de quem segue
  vivo", :296-299) **não muda**: só o formato da chave muda.
- **A fileira de cards passa a ser RENDERIZADA A PARTIR DO CATÁLOGO** (ordem, rótulo, tom), em vez de
  cinco blocos escritos à mão (`page.tsx:527-563`). É por isso que `ordem` e `tom` precisam estar na
  tabela desde a 2.1: sem eles, a 2.3 teria de inventar um segundo mapa de cor e uma segunda ordem na
  tela, que é exatamente a divergência que a §A.19 descreve para as pendências.
- **Os dois grupos vêm de fontes diferentes e isso é correto:** etapa vem do catálogo (lista variável),
  desfecho vem de `CANDIDATURA_SITUACOES` (lista fixa, com regra). Renderizados na mesma fileira, com
  origens distintas. O desenho da 2.1 não deve tentar unificar as duas: unificar é o erro que o diretor
  marcou logo no enunciado.
- **Etapa INATIVA:** os cards leem as ATIVAS. Se sobrar linha viva apontando para uma inativa (não
  deveria, pela trava da §3.1), ela **não pode sumir da contagem**: entra num card ao fim, com o rótulo
  da etapa inativa. Número que some é pior que número feio.

### 7.3 Item 2.4, filtro clicável por KPI

O card já é filtro em toggle na Central de Candidatos (`cardAtivo`, `page.tsx:276-289`). Para a versão
dinâmica: `cardAtivo` deixa de ser um literal e passa a ser a mesma chave estruturada do §7.2, e a
comparação passa a ser por código. Junto disso, o filtro de Etapa da barra vira **multiselect**
(§A.28), com as opções vindas do **endpoint** e não das linhas carregadas (§A.37: derivar das linhas
encolhe a lista assim que o primeiro valor é escolhido).

**A dependência é de mão única:** 2.2 não depende da 2.1 (pode ir antes ou em paralelo); 2.3 e 2.4
dependem de a 2.1 ter entregue `ordem`, `tom` e o endpoint de leitura. Fazer a 2.3 antes da 2.1 custaria
escrever a fileira de cards duas vezes.

---

## 8. RISCOS, na ordem em que doem

1. **A ordenação que passa a mentir em silêncio.** Quatro pontos ordenam por `indexOf` da constante
   (§0.2/A2). Se a constante sair e alguém deixar um `indexOf` sobre uma lista diferente, o funil
   ordena errado sem erro nenhum. **Mitigação:** o `tester` escreve o teste de ordenação ANTES,
   incluindo o caso "etapa nova criada no meio do funil".
2. **A etapa inicial com três donos** (default do banco, catálogo, tela). **Mitigação:** o default do
   banco morre na E1, e a tela lê `inicial` do catálogo. Um dono só.
3. **Perder a exaustividade do TypeScript** (§5.1). **Mitigação:** fallback explícito com teste, e a
   validação de runtime em DOIS lugares (DTO e FK).
4. **`shared-types` é arquivo único com dono único e exige build.** Editado por dois agentes na mesma
   frente, um apaga o outro em silêncio (§A.39). **Mitigação:** E0 é do coordenador, sozinho, antes de
   qualquer despacho.
5. **A migration em tabela viva.** 3 linhas em produção, 52 em homologação. **Mitigação:** ensaio em
   clone da homologação, o mesmo procedimento que a 0095 usou e que fez o erro aparecer no ensaio.
6. **A janela fecha.** Com o motor da esteira ligando (§A.18, item 2), candidato de verdade entra e cada
   linha nova encarece a conversão. Isto é argumento para fazer AGORA, e é do diretor a decisão de
   prioridade.

## 9. §A.6 (LGPD): o que esta frente toca

**Nada de dado pessoal.** O catálogo guarda código, rótulo, ordem, cor e dois booleanos. A candidatura
passa a guardar um `varchar` em vez de um enum, com o mesmo conteúdo. Nenhum CPF, nenhum contato,
nenhuma URL externa entra ou sai. **O gatilho da §A.38 que EXISTE aqui é outro:** a rota nova é
**administrativa** e precisa de RBAC/menu, e é por isso que o `seguranca` entra (auth/RBAC é gatilho de
tema, não de tamanho). O que ele tem de tentar provar: que a rota de escrita não é alcançável por
COMUM, que ela está reivindicada pelo menu (`operacoes: ["EtapasFunilController.*"]`) e que o menu
nasce só para SUPER_ADMIN (§A.23).

## 10. AS PERGUNTAS AO DIRETOR, reunidas

| # | pergunta | minha recomendação |
|---|---|---|
| **D1** | Rótulo do histórico: resolvido pelo catálogo (rename corrige tudo) ou congelado no evento? | catálogo (§2.3) |
| **D2** | O gerenciador ganha um "mover todos desta etapa para" ou o time usa o mover em lote que já existe? | usar o que existe (§3.1) |
| **D3** | Quando ele criar a 6ª etapa e a paleta acabar: repetir tom, ampliar a paleta do design system, ou cor livre? | repetir tom com aviso (§3.3) |
| **D4** | Ícone por etapa (coluna + seletor) ou um ícone só, com o tom distinguindo? | um ícone só (§3.4) |
| **D5** | "Em Processo" (2.2) conta só `ATIVO`, ou também `APROVADO` e `ALOCADO`? | precisa da decisão dele: os dois são defensáveis (§7.1) |
| **D6** | O menu novo nasce em que grupo/área? `ADMIN` + `areas: ["AS"]` é o que faz o time de A&S enxergar quando ele liberar; sem declarar a área, o padrão é ADM e o menu some para A&S | `grupo: "ADMIN"`, `areas: ["AS"]`, liberação por usuário é dele (§A.23) |
