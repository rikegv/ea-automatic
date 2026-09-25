# Banco de Talentos: plano do lado ADM, para o diretor aprovar o alcance (§A.27)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-25 · **Tipo:** plano de alcance, nada construído no ADM
**Regra desta OST:** a parte de A&S pura constrói em homologação; o que toca produção espera o OK.
**Documento anterior:** `docs/INVESTIGACAO-ADM-BANCO-DE-TALENTOS.md` (o levantamento que originou este plano)
**Aplica:** §A.2, §A.11 (nenhum travessão), §A.14, §A.26, §A.27.

---

## 0. Um bloqueio na lista do "pode construir já", que precisa da sua decisão

Você autorizou construir três coisas de A&S pura. **Duas dão, uma não dá ainda.**

| Item | Estado |
|---|---|
| Os 2 contadores na vaga (oficiais e banco) | **construindo agora**, é independente |
| O banco parado na seleção (`VAGA_BANCO`) | **já existe**, é valor do enum `vaga_natureza` e do `vaga_status` |
| **A marcação oficial/banco POR CANDIDATO** | **não tem onde morar** |

**Por quê.** A marcação por candidato precisa de uma linha que ligue uma pessoa a uma vaga. Essa
linha é a `as_candidaturas`, e ela **não existe**: é desenho seu de 24/08
(`docs/DESENHO-AS-CENTRAL-CANDIDATOS.md`), ainda com três perguntas abertas esperando você
(a ordem de Captação e Triagem, se a Entrevista Cliente é obrigatória, e a leitura A ou B da trava de
posições). Hoje a vaga tem um número de posições e mais nada; não existe candidato no módulo de A&S.

Inventar agora uma tabela de alocação mínima colidiria de frente com aquele desenho, e seria jogada
fora quando a Central de Candidatos for construída. Por isso parei e estou reportando (§A.14).

**A consequência é maior do que parece, e está na seção 3:** sem candidatura, o contador
"6 de 10 oficiais, 3 de 10 banco" só consegue contar quem **já foi para o ADM**. Quem está no banco
parado na seleção não tem admissão, então não entra em conta nenhuma.

---

## 1. Como evoluir o `is_banco` sem quebrar o que ele já faz

### 1.1 O mapa completo, antes de propor (§A.26)

Varri o campo inteiro: **58 referências em 21 arquivos**. O resultado é melhor do que se temia,
porque a superfície de ESCRITA é minúscula.

**ESCREVEM o `is_banco`, dois lugares e mais nada:**

| Onde | O quê |
|---|---|
| `admissoes.service.ts:359` | criação da admissão, sempre `false` |
| `admissoes.service.ts:2911-3011` | a edição (o lápis do Gerenciador), campo "Admissão de banco" |

A edição tem a cicatriz de 13/08 embutida, e ela importa para a seção 2: **o seletor de status e a
marca andam juntos**. Escolher "Banco, Aguardar" no seletor marca `is_banco = true`; escolher
"Em Admissão" **desmarca**. Os demais faróis (declínio, rescisão, concluída) não tocam a marca.

**LEEM o `is_banco`, e é aqui que mora o que não pode quebrar:**

| Quem lê | O que faz com isso |
|---|---|
| `deriveFarolGlobal` (`domain/admissao.ts:252`) | marcado, o farol é `BANCO_AGUARDAR` e a automação não o desfaz. **É a correção de 13/08** |
| `pendenciasObrigatorias` (`domain/admissao.ts:180`) | marcado, a ausência de data de admissão **deixa de ser pendência** e o **Termo de Banco vira obrigatório** |
| `pendencias-lote.ts`, `recalcula-sinalizador-vivas.ts` | aplicam a régua acima em lote |
| `esteira.service` (873, 1353, 1504, 1553) | aceite de passagem, listagem e ficha |
| `admissoes.service` (1122, 1551, 1859) | Gerenciador e ficha |
| `EditAdmissaoModal.tsx` | o campo na tela |

### 1.2 A proposta: a trava é um LEITOR NOVO, e não uma mudança no campo

**Nada do que está na tabela acima é tocado.** O campo continua significando o que significa, o farol
continua sendo forçado, o Termo de Banco continua obrigatório e a data continua dispensada. A
evolução é **acrescentar um único leitor**, no único lugar onde o Cadastro nasce.

**Onde:** `nascerCadastroEIntegracao()`, em `apps/backend/src/esteira/nascimento-cadastro.ts`.

Essa função existe justamente porque o Cadastro nasce em três caminhos (o consultor movendo o status,
a I.A fechando a Auditoria, o ASO fechando o Exame), e escrever a regra à mão nos três é o defeito
que originou a §A.26. Há teste dedicado travando os três (`nascimento-cadastro.tres-caminhos.spec.ts`).

**A leitura vai DENTRO da função, não nos parâmetros.** Ela já recebe `tx` e `admissaoId`, então lê o
`is_banco` sozinha. Se fosse parâmetro (como o `exigeIntegracao` é hoje), um caminho novo criado
amanhã poderia esquecer de passá-lo e a trava vazaria em silêncio, que é exatamente o modo de falha
que a porta única foi criada para eliminar.

**Um segundo ponto tem de entrar junto, e é fácil de esquecer.** O
`esteira.service.mudarStatus` calcula `gateVaiAbrir` **fora** da transação, para decidir se a
Integração nasce e para devolver `gate.nasceuAgora` ao frontend. Se só a função for travada, a API
responde "gate aberto" enquanto o banco não tem Cadastro nenhum, e a tela mente. Os dois pontos
mudam juntos ou nenhum muda.

### 1.3 O que muda para as admissões que já existem: medi na produção

| Medida | Valor |
|---|---|
| Admissões com `is_banco = true` | **22**, de 2.725 |
| Vivas (farol `BANCO_AGUARDAR`) | **18** |
| Declinadas | 4 |
| Dessas 18, quantas já têm o gate aberto (Auditoria e Exame concluídas) | **1** |
| Dessa 1, o Cadastro já nasceu? | **sim** |
| **Quantas seriam travadas se a trava subisse hoje** | **0** |

O número é zero porque a trava age **no nascimento** do Cadastro, e não no Cadastro que já existe. É a
mesma propriedade de não retroatividade que fez o nascimento da Integração ser seguro: quem já passou
pelo portão não volta para ele.

**Isso não é sorte, mas também não é garantia futura.** As outras 17 estão vivas, e no dia em que uma
delas concluir Auditoria e Exame ela **vai** ser travada. Se essas 17 são banco no sentido antigo do
ADM (uma marcação interna sua, sem relação com o banco de talentos da A&S), a trava vai prender gente
que não devia estar presa. **Vale você olhar a lista das 18 antes de a trava subir**, e eu mostro.

---

## 2. Os dois erros da trava, e como cada um é evitado

### 2.1 Destravar demais: finalizar um banco que não devia

**O risco real não é alguém clicar em "destravar" sem pensar.** É a cicatriz de 13/08: hoje,
**mudar o seletor de status para "Em Admissão" desmarca o `is_banco` como efeito colateral**. Ou
seja, com a trava no ar, um consultor que só queria arrumar o status estaria, sem saber, liberando
uma admissão de banco para o cadastro. A trava mais forte do sistema teria a chave mais fácil.

Três formas de evitar, da mais leve para a mais firme, e a escolha é sua:

| # | Proposta | Custo | O que muda para quem opera |
|---|---|---|---|
| A | Ação própria de "Confirmar Posição Oficial", com trilha de quem e quando, e o seletor de status **deixa de** desmarcar | médio | mexe na correção de 13/08, que é código validado. Precisa do seu OK explícito |
| B | Ação própria, e o seletor continua desmarcando como hoje | baixo | duas portas para a mesma coisa, e a porta lateral continua aberta |
| C | Só a ação própria, sem trilha | baixo | não recomendo: destravar é decisão com consequência, tem de ter dono e data |

**Recomendo a A.** É a única que faz a trava valer o que ela promete. Mas ela toca a correção de
13/08, então é §A.26 e não sigo sem você dizer.

Em qualquer das três, o destravar registra trilha no mesmo `candidato_alteracoes_log` que o
`is_banco` já usa hoje, então o histórico da pessoa continua sendo um só.

### 2.2 Travar demais: banco legítimo preso sem conseguir avançar

**Aqui existe um buraco concreto, e ele é o mais importante deste documento.**

Imagine: a pessoa de banco já concluiu Auditoria e Exame, e está travada. O cliente confirma. Alguém
tira o flag. **E não acontece nada.**

Por quê: o Cadastro só nasce quando **uma transição de status** passa por uma das três portas. Tirar o
flag não é transição de status nenhuma. As duas frentes já estão concluídas, então não há mais status
para mover. **A pessoa fica destravada e sem Cadastro, para sempre**, e a operação não tem o que
clicar para consertar.

**A correção é obrigatória e vem no mesmo pacote:** a ação de destravar **chama a mesma porta**
(`nascerCadastroEIntegracao`), reavaliando o gate na hora. Ela vira a quarta chamadora daquela
função, o que é exatamente para isso que a porta única existe. Sem esse pedaço, a trava é uma
armadilha.

**Um segundo caso de travar demais**, mais simples: alguém marca banco por engano numa admissão
normal. O remédio é o mesmo de sempre, desmarcar. Fica visível porque o farol vai para
`BANCO_AGUARDAR` na hora, que é comportamento que já existe hoje e a operação já reconhece.

**Um terceiro, e é o que eu vigiaria:** as 17 admissões da seção 1.3. Se alguma delas for banco no
sentido antigo, ela trava no dia em que concluir as duas frentes, e ninguém vai ligar o travamento à
subida desta OST porque pode acontecer semanas depois.

---

## 3. A ponte cara: qual tabela, qual coluna, e o que ela alcança

### 3.1 O que é

Coluna nova em `admissoes`, a tabela central: `vaga_id uuid NULL REFERENCES vagas(id)`.

| Aspecto | Avaliação |
|---|---|
| Custo do DDL | **baixo.** Coluna nulável sem default não reescreve a tabela no Postgres. 2.725 linhas é pequeno de qualquer forma |
| Registros antigos | ficam **NULL**, e NULL é a verdade: essas admissões não vieram de vaga nenhuma. **Não inventar vínculo por cliente e cargo**, isso chutaria vaga e é o oposto do §A.9 |
| Índice | `idx_admissoes_vaga` é necessário, o contador vai agrupar por ele |
| Quem mais lê `admissoes` | muita gente, mas **coluna nova nulável não muda nenhuma consulta existente**: nada seleciona `*` para decidir, e todas as expressões de contagem (`admissaoConcluidaSql`, `comPendenciaSql`, os KPIs) são explícitas nas colunas que usam |
| Bloqueio | **a FK exige que a tabela `vagas` exista em produção**, e ela não existe. Ver a seção 5 |

### 3.2 Onde a marcação oficial ou banco realmente mora

Aqui está a decisão fina, e ela precisa ser explícita para o contador não mentir.

- Para quem **foi para o ADM**, a marcação já tem casa: o `is_banco` da admissão. Com o `vaga_id`, o
  contador de banco encaminhado sai de uma consulta só: agrupa as admissões daquela vaga por
  `is_banco`.
- Para quem está no **banco parado na seleção**, não existe admissão. Não existe linha nenhuma.
  Esses **não entram em conta alguma** enquanto a `as_candidaturas` não existir.

**Portanto, com a ponte cara e sem a Central de Candidatos, o contador fica assim:**

| Contador | Fecha? |
|---|---|
| Oficiais encaminhados ao ADM | **sim** |
| Banco encaminhado ao ADM | **sim** |
| Banco parado na seleção | **não**, não há o que contar |
| "3 de 10 banco" incluindo o banco parado | **não** |

Ou seja: a ponte cara entrega metade do contador. A outra metade é a Central de Candidatos. Isso não
é motivo para não fazer a ponte, é motivo para você saber o que ela entrega no dia em que subir.

### 3.3 A alternativa, para você comparar

Deixar o `vaga_id` na **candidatura** em vez de na admissão (`as_candidaturas.admissao_id`, que o seu
desenho de 24/08 já previu) e não tocar em `admissoes`. Vantagem: **zero mudança na tabela central de
produção**, e o contador nasce completo, contando parado e encaminhado pela mesma tabela. Desvantagem:
depende inteiramente da Central de Candidatos, e a admissão não sabe de que vaga veio, então nenhuma
tela do ADM consegue mostrar isso.

Você decidiu ponte cara, e eu registro o alcance dela. Mas as duas se encontram no mesmo ponto: a
Central de Candidatos. Vale saber disso antes de escolher a ordem.

---

## 4. O aviso híbrido e o painel de saldo

### 4.1 O mecanismo que já existe

O "aviso chato" do ADM é o `LiberacaoAlertaProvider`
(`apps/frontend/src/components/shell/LiberacaoAlerta.tsx`), montado no `AppShell` por cima de toda a
casca autenticada. Ele faz **um** polling de 90 segundos num endpoint de contagem, alimenta o badge do
menu por contexto, sobe o popup quando a pendência aparece, **reaparece a cada 20 minutos** depois do
"Estou ciente", e **só resolver zera o contador**.

### 4.2 O que falta para ele ter destinatário diferente

Hoje ele avisa **todo mundo igual**. O sistema já tem o material para segmentar, e é o mesmo que
governa a barra lateral: `usuario_areas` (ADM e AS) e `menus.areas`, servidos no `/auth/me`, que já
devolve `areas: ["AS"]` para o consultor de A&S.

**Proposta:** generalizar o provider para receber três coisas (o endpoint de contagem, o texto e a
rota de destino) mais **a área a que aquele aviso pertence**, e montar duas instâncias no `AppShell`,
uma por área. Quem tem as duas áreas vê os dois avisos, o que é o comportamento certo.

Generalizar, e não copiar o arquivo: copiado, a regra dos 20 minutos passa a existir em dois lugares e
um dia vão divergir.

**O que cada lado recebe, no seu desenho:**

| Lado | Gatilho | Mensagem |
|---|---|---|
| **ADM** | houve declínio num cliente que **tem** banco | tem gente pronta, puxe do banco |
| **A&S** | houve declínio num cliente **qualquer** | o banco daquele cliente diminuiu ou a posição caiu, comece a repor |

**E isto não precisa de ponte nenhuma**, é o achado bom da investigação anterior: a pergunta "o
cliente desta admissão declinada tem banco?" se responde só pelo **cliente**, que os dois lados já
compartilham (`vagas.cod_cliente` e `admissoes.cod_cliente` apontam para a mesma
`clientes.cod_cliente`).

**E o aviso não encosta no declínio.** Ele lê o **estado** (`farol_global IN ('DECLINOU','RESCISAO')`),
não escuta o evento. É o que faz as **três portas** do declínio ficarem cobertas de graça (o botão da
Esteira, o lápis do Gerenciador e o desfecho da Integração), sem uma linha alterada em
`declinarAdmissao`.

**Uma pergunta que sobra para você:** o aviso "não some até resolver". O que conta como resolver, no
caso do declínio? Sugiro um "Estou ciente" por declínio, com trilha, senão o popup renasce a cada 20
minutos para sempre e a operação aprende a ignorá-lo, que é a morte de qualquer aviso.

### 4.3 O painel de saldo de banco por cliente

Tela nova no módulo de A&S: quais clientes têm banco e quanto resta em cada um. Menu novo nasce só
para o SUPER_ADMIN e você libera quem enxerga (§A.23), em grupo `SELECAO` e área `AS`.

O saldo por cliente sai de uma consulta só sobre as vagas daquele cliente, e ele tem a **mesma
limitação da seção 3.2**: enquanto não houver candidatura, o painel conta a meta de banco da vaga e o
banco encaminhado ao ADM, e não consegue contar o banco parado na seleção. Ele nasce honesto dizendo
isso, ou nasce mentindo. Prefiro que nasça honesto.

---

## 5. A junção das branches: o pré-requisito de tudo, e ele tem um problema real

### 5.1 Onde as duas estão

| Branch | Worktree | O que tem |
|---|---|---|
| `main` | `/home/henrique/apps/ea-automatic` | produção. O ADM inteiro |
| `homolog` | `/home/henrique/apps/ea-homolog` | o módulo de A&S |

Elas separaram no commit `77c2b42`. Desde então:
- `homolog` tem **5** commits que `main` não tem (todos de A&S).
- `main` tem **18** commits que `homolog` não tem (VT, Clicksign, catálogos, esteira).

Ou seja, **a homologação está atrasada em relação à produção**, e não só adiantada.

### 5.2 O problema: as duas branches usam os MESMOS números de migration para coisas diferentes

Conferido arquivo a arquivo. Os dois `_journal.json` têm 81 entradas, **idênticas até a 0074**, e
**seis colisões** logo em seguida:

| Número | Em `main` | Em `homolog` |
|---|---|---|
| 0075 | `url_do_vt_no_drive` | `vagas_central_as` |
| 0076 | `vt_multiversao` | `puzzling_blizzard` |
| 0077 | `solicitacoes_vt` | `many_mikhail_rasputin` |
| 0078 | `url_por_versao_do_vt` | `vagas_listas_e_regioes` |
| 0079 | `dispensar_sinal_vt_orfao` | `vaga_rascunho` |
| 0080 | `carimbo_da_notificacao_clicksign` | `vaga_rascunho_campos` |

**Um `git merge` não resolve isso.** Ele produziria um journal com números repetidos e arquivos de
snapshot de mesmo nome com conteúdo completamente diferente. O drizzle aplica por ordem e por hash do
journal, então o resultado seria uma sequência de migration que não descreve nem um banco nem o outro.

**E o banco de homologação já está nesse estado.** Ele tem **85** migrations aplicadas contra **81** da
produção, e contém **as tabelas das duas linhas ao mesmo tempo** (as do VT, que vêm do `main`, e a
`vagas`, que vem do `homolog`). Ele foi clonado da produção e recebeu as de A&S por cima. Nenhum dos
dois journals do git descreve fielmente esse banco.

### 5.3 O que a junção exige, na ordem

1. **Trazer o `main` para dentro do `homolog` primeiro**, os 18 commits. A A&S passa a rodar sobre a
   base atual, e o que quebrar quebra em homologação, não em produção.
2. **Renumerar as migrations de A&S** para 0081 em diante, reconstruindo o `_journal.json` e os
   snapshots. As de `main` (0075 a 0080) ficam como estão, porque **já foram aplicadas em produção** e
   mexer nelas é que seria destrutivo.
3. **Reclonar o banco de homologação** da produção depois da renumeração. Os hashes gravados no
   `__drizzle_migrations` de hoje não vão bater com os arquivos renumerados, e um banco que discorda
   do journal é uma bomba de efeito retardado.
4. Só então **`homolog` para `main`**, e a produção aplica as migrations de A&S limpas, na sequência.

**Quando.** Antes de qualquer linha do flag, da trava ou da ponte, porque as três precisam do ADM e da
`vagas` no mesmo lugar. A ponte cara é a mais dependente de todas: a FK `admissoes.vaga_id` só pode
existir depois que `vagas` existir em produção.

**Custo estimado:** a renumeração é mecânica mas não é automática, e o passo 1 é onde mora o risco
real (18 commits de frentes diferentes encontrando o módulo de A&S). É uma frente própria, com gate e
prova, não um passo dentro de outra OST.

---

## 6. A sequência que eu proponho

| # | O quê | Depende de | Toca produção? |
|:---:|---|---|:---:|
| 1 | Os 2 contadores na vaga | nada | não, homologação |
| 2 | **Junção das branches** (seção 5) | decisão sua | sim, é a virada |
| 3 | A trava do Cadastro + o destravar que reavalia o gate (seções 1 e 2) | 2 | sim |
| 4 | O aviso híbrido (seção 4.1 e 4.2) | 2 | sim, mas é leitura pura |
| 5 | A ponte cara `admissoes.vaga_id` (seção 3) | 2 | sim |
| 6 | Central de Candidatos (`as_candidatos`, `as_candidaturas`) | suas 3 perguntas de 24/08 | não |
| 7 | Contador completo e painel de saldo honesto | 5 e 6 | não |

O item 4 pode andar antes do 3, se você quiser resultado visível cedo: ele é leitura, não muda
comportamento nenhum e não tem risco de travar ninguém.

---

## 7. O que eu preciso de você para seguir

1. **A trava e o seletor de status** (seção 2.1): adoto a opção A, que tira do seletor de status o
   poder de desmarcar o banco? Ela mexe na correção de 13/08, que é código validado (§A.26).
2. **As 17 admissões de banco vivas** (seção 1.3): quer ver a lista antes de a trava subir? Alguma
   delas é banco no sentido antigo do ADM?
3. **O que conta como resolver o aviso de declínio** (seção 4.2), para ele não virar ruído.
4. **A junção das branches** (seção 5): autoriza abrir essa frente, e nessa ordem?
5. **A Central de Candidatos** (seção 0): suas três perguntas de 24/08 continuam abertas, e elas são
   o que destrava a marcação por candidato e o contador completo.
