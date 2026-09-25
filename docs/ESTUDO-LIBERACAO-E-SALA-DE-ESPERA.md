# Estudo De Remoção: Liberação Admissional E Sala De Espera

Levantamento somente de leitura, pedido pelo diretor. Nada foi alterado no código nem no banco.
Pergunta: quando o A&S estiver conectado à esteira, estas duas telas podem sair sem quebrar nada, e
o que depende delas hoje.

Medições feitas no banco de **produção** (`ea_automatic`, container `ea-db`), somente `select`, em
21/09/2026. Nenhum dado pessoal foi extraído: só contagens, estados e rótulos de catálogo (§A.6).

---

## Veredito Em Uma Linha

| Tela | Veredito | O que a prende |
|---|---|---|
| Liberação Admissional | **NÃO PODE SAIR** hoje | É o **único** escritor que tira a admissão de `AGUARDANDO_LIBERACAO` e o único lugar onde nascem cliente, cargo, régua, frentes e documentos da admissão do Pandapé |
| Sala De Espera | **PODE SAIR EM PARTE** | O cadastro e a fila podem migrar para o funil do A&S; ficam presos o painel da Diretoria (card, sub-status e parcela do card de declínios) e o histórico de 133 linhas |

---

## 1. Liberação Admissional

### 1.a O Que É, Na Linguagem De Quem Opera

O candidato que o Pandapé manda para admissão chega ao EA como uma ficha **pela metade**: tem
pessoa, mas não tem cliente nem cargo, porque o Pandapé não diz de qual cliente do Grupo aquela vaga
é. A Liberação é a fila onde alguém **olha essa ficha, decide de quem é o candidato** (cliente,
cargo, loja, contrato, salário, benefícios, uniforme) e clica em liberar. É esse clique que faz a
admissão de fato nascer e entrar na esteira. Quem não deve entrar é recusado ali mesmo, e a recusa é
reversível.

Enquanto ninguém clica, a pessoa **não existe** para a esteira, para o Gerenciador do Portal, para os
KPIs de pendência nem para o Portal do candidato: os quatro excluem o farol de propósito.

### 1.b A Superfície

**Frontend**
- Tela: `/home/henrique/apps/ea-automatic/apps/frontend/src/app/(app)/liberacao/page.tsx` (2.430 linhas)
- Modal de vínculo com a Sala: `/home/henrique/apps/ea-automatic/apps/frontend/src/components/liberacao/VincularSalaModal.tsx`
- Pré-preenchimento: `/home/henrique/apps/ea-automatic/apps/frontend/src/lib/pre-preenchimento-liberacao.ts`
- Badge e popup insistente, montados na casca autenticada: `/home/henrique/apps/ea-automatic/apps/frontend/src/components/shell/LiberacaoAlerta.tsx` (polling de 90s em `/admissoes/aguardando-liberacao/contagem`, linha 73)
- Navegação: `/home/henrique/apps/ea-automatic/apps/frontend/src/lib/navegacao.ts:75`
- Rótulos e cores do farol: `/home/henrique/apps/ea-automatic/apps/frontend/src/lib/farol.ts:16,18,50,58`
- Reuso de blocos: `components/alto-volume/BlocoAltoVolume.tsx`, `components/admin/SeletorLoja.tsx`

**Rotas de backend** (`/home/henrique/apps/ea-automatic/apps/backend/src/admissoes/admissoes.controller.ts`)
- `GET /admissoes/aguardando-liberacao` (linha 165), `GET /admissoes/recusadas` (171), `GET /admissoes/aguardando-liberacao/contagem` (177)
- `PATCH /admissoes/liberar-lote` (201), `PATCH /admissoes/:id/liberar` (299)
- `PATCH /admissoes/:id/recusar` (305) e `PATCH /admissoes/:id/reativar-recusada` (312), ambos `@Roles("MASTER","SUPER_ADMIN")`
- A tela também consome `/admissoes/padrao-cliente-cargo`, `/admin/clientes`, `/admin/cargos`, `/catalogos/beneficios`, `/catalogos/escalas`, `/admin/alto-volume` e `/sala-espera/match`

**Serviço** (`/home/henrique/apps/ea-automatic/apps/backend/src/admissoes/admissoes.service.ts`)
- `criarPreAdmissao` (716), chamada **só** por `pandape-sync.service.ts:558`
- `liberar` (a partir de 860), `aplicarLiberacao` (1151, o miolo do nascimento), `liberarEmLote` (1355)
- `listarAguardandoLiberacao` (1506), `recusarLiberacao` (1538), `reativarRecusada` (1573), `contarAguardandoLiberacao` (1610), `listarRecusadas` (1632)
- `travarDuplicidadeDeCpf` (a trava de CPF duplicado com aceite, dentro do `liberar`)

**Tabelas que lê:** `admissoes`, `candidatos`, `clientes`, `cargos`, `regua_documental`, `beneficios`, `lojas`, `cliente_vinculo`, `projetos` do Alto Volume, `integracao_pandape`.
**Tabelas que escreve:** `admissoes` (cliente, cargo, loja, grupo, farol, sinalizador, vínculo, consultor, `observacao_liberacao`, `recusado_por_id`, `recusado_em`), `dados_vaga_folha`, `admissao_beneficio`, `frentes_admissao`, `documentos_admissao`, `admissao_projeto`, `candidatos` (sexo), `candidato_alteracoes_log`.

**Menu e permissão** (`/home/henrique/apps/ea-automatic/apps/backend/src/domain/menus.ts:123-131`)
- Código `liberacao`, grupo OPERACAO, ordem 2. Reivindica só `AdmissoesController.liberar` e `liberarEmLote`. As leituras ficam abertas de propósito (o badge roda para todo usuário autenticado). Recusar e reativar são de Master/Super Admin.
- Hoje **17 usuários** têm o menu concedido.

### 1.c Quem Mais Depende

**O ponto que decide tudo: o farol `AGUARDANDO_LIBERACAO` é PEGAJOSO em código.**
Em `/home/henrique/apps/ea-automatic/apps/backend/src/domain/admissao.ts:200-210`, tanto
`AGUARDANDO_LIBERACAO` quanto `LIBERACAO_RECUSADA` estão no conjunto `FAROL_MANUAL`, e
`deriveFarolGlobal` devolve o farol atual sem tocar nele. **Nenhuma automação tira a admissão
desse estado.** O único caminho de saída é `aplicarLiberacao`, e o único caminho de volta ao estado
vivo depois de uma recusa é `reativarRecusada`.

Consequência direta: **se a tela sair sem substituto, as pré-admissões do Pandapé param ali para
sempre**, e param invisíveis, porque quatro superfícies excluem esse farol de propósito:
- `esteira.service.listar`, `/home/henrique/apps/ea-automatic/apps/backend/src/esteira/esteira.service.ts:240-247` (filas e todos os KPIs)
- `FAROIS_FORA_DO_PAINEL`, `/home/henrique/apps/ea-automatic/apps/backend/src/portal/portal-painel.service.ts:129-134`
- `admissoesSemLink` do Portal, `/home/henrique/apps/ea-automatic/apps/backend/src/portal/portal-envio.service.ts:331`, que reusa a mesma lista
- `comPendenciaSql` do Gerenciador, `/home/henrique/apps/ea-automatic/apps/backend/src/admissoes/admissoes-filtros.ts:74`
- e ainda `alto-volume-vinculos.service.ts:68-80`, `auditoria.service.ts:199`, `pandape-scheduler.service.ts:161`, `varredura-documentos.ts:36`

Existe uma fuga teórica pelo `PATCH /admissoes/:id`, que aceita qualquer valor de `FAROL_GLOBAL`
(`dto/update-admissao.dto.ts:111`), mas ela é **inútil na prática**: a tela do Gerenciador esconde os
dois valores do seletor (`apps/frontend/src/lib/farol.ts:58`) e, mesmo forçando pela API, a admissão
chegaria a `EM_ADMISSAO` **sem cliente, sem cargo, sem régua, sem frentes e sem documentos**. Ela não
tem nada do nascimento; a Liberação é que faz o nascimento.

**Estado e coluna que só ela escreve**
- `admissoes.observacao_liberacao`: escrita só aqui, **lida** pela ficha da Esteira (`esteira.service.ts:1778,1972`; `components/esteira/AdmissaoDetalheModal.tsx:837`) e por `admissoes.service.ts:1934,2135`. Sai a tela, o campo fica órfão mas quem lê não quebra (trata nulo).
- `admissoes.recusado_por_id` / `recusado_em`: escritos e lidos só pelo par recusa/reativação e pela aba de recusadas (`admissoes.service.ts:1631`).
- `admissoes.possivel_duplicata`: escrita pelo `pandape-sync`, **consumida só aqui** (tag na lista e barra do lote). Sem a tela, o marcador de duplicata deixa de ter leitor.
- `admissao_projeto` com `origem = 'LIBERACAO'`: ponto único de gravação (`admissoes.service.ts:1310`). O Alto Volume perde a porta de entrada automática de vínculo.

**KPIs e telas que leem o que ela produz**
- Painel da Diretoria, card clicável "Aguardando Liberação": `gerencial.service.ts:568,582` e `apps/frontend/src/app/(app)/diretoria/page.tsx:54,154,633`.
- Badge e popup insistente da casca, para **todo** usuário logado: `LiberacaoAlerta.tsx`.
- Indiretamente, tudo que a esteira mostra: frentes, documentos, régua e sinalizador da admissão do Pandapé só existem porque a liberação os criou.

**Job, cron, worker, carga, migration**
- `pandape-sync.service.ts:554-560` é o **produtor** da fila (webhook e scheduler do Pandapé). Ele cria e para; quem consome é a tela.
- `pandape-scheduler.service.ts:161` pula explicitamente as pré-admissões no pull de documentos, porque sem cliente e cargo não há régua onde arquivar.
- `db/carga-0308.ts:57` trata `AGUARDANDO_LIBERACAO` como farol vivo; `db/recupera-transicao-pos-aso.ts:53` o exclui.
- O DIGAI **não** entra por aqui. O Pandapé **entra**, e é a razão de a tela existir.

**Testes:** 17 arquivos `.spec.ts` citam os faróis ou as rotas, entre eles `admissoes.liberar-lote.spec.ts`, `portal-painel.cobertura-independente.tester.spec.ts`, `esteira.farol-integracao.spec.ts`, `domain/pandape-entrada.tester.spec.ts`.

### 1.d O Volume Real

Banco `ea_automatic` (produção). Admissões por farol:

| Farol | Admissões |
|---|---|
| ADMISSAO_CONCLUIDA | 1.884 |
| DECLINOU | 878 |
| EM_ADMISSAO | 65 |
| RESCISAO | 55 |
| BANCO_AGUARDAR | 19 |
| **LIBERACAO_RECUSADA** | **15** |
| **AGUARDANDO_LIBERACAO** | **10** |

- As 10 na fila hoje são **todas de origem PANDAPE**, criadas entre 18/09 e 21/09, com **2,6 dias de espera média**. As 25 dos dois faróis somados são 100% PANDAPE: nenhuma admissão manual nunca entrou nesse estado.
- **539 admissões de origem PANDAPE** existem no total, e **514 já foram liberadas** (têm `consultor_id`, carimbado só pela liberação). Isso é o trabalho de julho a setembro de 2026: 124 entradas em julho, 266 em agosto, 149 em setembro até o dia 21. Ou seja, a tela processa da ordem de **200 fichas por mês**.
- **194** dessas 514 receberam observação livre na liberação.
- A trilha de recusa registra **20 recusas** (18/07 a 16/09) e **5 reativações** (todas em julho).
- `integracao_pandape` tem 535 linhas.

### 1.e O Que A Ponte A&S Para Esteira Teria De Absorver

A decisão humana que acontece ali hoje, item a item, e onde ela passaria a acontecer:

1. **De quem é este candidato (cliente e cargo).** É a decisão central, e é ela que o A&S resolve de
   graça: a vaga do A&S (`vagas`) já tem `cod_cliente`, `cargo_id` e, o que importa mais,
   **`id_vacancy_pandape`** (`apps/backend/src/as/ingestao-pandape/ingestao-repositorio.ts:105,164,469`).
   Chegando do funil, a admissão nasce sabendo o cliente, e a pergunta que a tela existe para
   responder desaparece.
2. **Dados da vaga e folha** (salário, centro de custo, tempo de contrato, motivo, escala, local).
   A vaga do A&S carrega quase todos: `salario_abertura`, `salario_fechamento`, `centro_custo`,
   `tempo_contrato`, `motivo`, `horario_escala`, `local_trabalho`, e há `vaga_beneficio` para o pacote.
3. **Não tem equivalente no funil, e é o que impede a remoção seca:**
   - **loja** do cliente (seletor validado contra o cliente),
   - **vínculo do cliente** quando ele tem mais de um contrato,
   - **tipo de contrato** da lista da admissão e **data de admissão**,
   - **gestor BP, setor, departamento**,
   - **uniforme** (resposta obrigatória para liberar, `admissoes.service.ts:897`) e **EPI**,
   - **confirmação ou correção do sexo**, que muda a régua documental (Reservista),
   - **aceite de CPF duplicado** (`travarDuplicidadeDeCpf`),
   - **vínculo com projeto de Alto Volume**,
   - **a recusa e a reativação**, que é o "este não entra" com trilha.
4. **A liberação em lote** (teto de 50, barra de par sem régua, barra de possível duplicata) não tem
   equivalente nenhum no funil.

Condição mínima para a tela sair: a ponte A&S para esteira precisa chamar o **mesmo miolo**
`aplicarLiberacao` (ou equivalente) para que continuem nascendo régua, frentes AUDITORIA e EXAME e
documentos, **e** precisa dar destino aos dez ou mais campos do item 3. O caminho barato é a ponte
criar a admissão **já em `EM_ADMISSAO`** pelo `create` (que é o caminho da admissão manual e já faz o
nascimento completo), deixando a Liberação viva só para o que continuar chegando pelo webhook do
Pandapé sem passar pelo funil.

### 1.f Veredito

**NÃO PODE SAIR.** O argumento é medido, não de impressão:

- Ela é o **único** ponto de escrita que tira uma admissão de `AGUARDANDO_LIBERACAO`, e esse farol é
  pegajoso por desenho (`domain/admissao.ts:200-210`). Tirar a tela e manter o `pandape-sync`
  produzindo pré-admissões cria uma fila que **ninguém consome e ninguém enxerga**, excluída de
  quatro superfícies ao mesmo tempo. Seriam 10 fichas hoje e da ordem de 200 por mês.
- Ela é o **único** ponto onde nascem frentes, documentos e régua da admissão do Pandapé.
- Ela concentra decisões que o funil não tem: loja, vínculo, uniforme, EPI, sexo, aceite de
  duplicidade, projeto de Alto Volume, recusa e lote.

**Condição para sair no futuro, em três partes, nesta ordem:**
1. Desligar o produtor: `pandape-sync.criarPreAdmissao` deixa de criar pré-admissão, e a entrada do
   Pandapé passa a ser exclusivamente pela ingestão do A&S.
2. A ponte A&S para esteira passa a criar a admissão completa, resolvendo os campos do item 1.e.3 ou
   deixando cada um deles virar pendência obrigatória da §A.19 (o que é legítimo: a regra 5 do §A.3
   permite nascer com obrigatório vazio).
3. **Zerar as duas filas antes de desligar**, e só então remover tela, rotas, menu e, por último, os
   dois valores do enum. Enquanto houver uma única linha em `AGUARDANDO_LIBERACAO` ou
   `LIBERACAO_RECUSADA`, remover é abandonar admissão no escuro.

Mesmo cumpridas as três, **a aba de recusadas e a reativação merecem sobreviver em algum lugar**: o
"este candidato não entra" é uma decisão de Master com trilha, e o funil do A&S tem o descarte da
candidatura, não a recusa da admissão. São gestos diferentes, em momentos diferentes.

---

## 2. Sala De Espera

### 2.a O Que É, Na Linguagem De Quem Opera

Às vezes o cliente ou a própria Seleção **avisa que vai mandar fulano** antes de fulano se candidatar
no Pandapé. Até existir candidatura, essa pessoa não existe em lugar nenhum do sistema, e o tempo que
ela ficou esperando some. A Sala De Espera é o caderninho dessa fase: nome, telefone, cliente, cargo,
de onde veio o pedido e em que situação está (aguardando candidatura, aguardando retorno, desistiu).
Quando a pessoa enfim aparece na fila da Liberação, alguém **casa** o registro com a admissão e a
linha sai da fila ativa, virando histórico consultável.

### 2.b A Superfície

**Frontend**
- Tela: `/home/henrique/apps/ea-automatic/apps/frontend/src/app/(app)/sala-espera/page.tsx` (678 linhas)
- Livreto de vínculo partindo da Sala: `/home/henrique/apps/ea-automatic/apps/frontend/src/components/sala-espera/VincularAdmissaoLivreto.tsx`
- Modal de vínculo partindo da Liberação: `/home/henrique/apps/ea-automatic/apps/frontend/src/components/liberacao/VincularSalaModal.tsx`
- Catálogo de status (Gerencial): `/home/henrique/apps/ea-automatic/apps/frontend/src/app/(app)/admin/sala-espera-status/page.tsx`
- Navegação: `/home/henrique/apps/ea-automatic/apps/frontend/src/lib/navegacao.ts:67`

**Backend** (`/home/henrique/apps/ea-automatic/apps/backend/src/sala-espera/`)
- `sala-espera.controller.ts`: `GET /sala-espera/status`, `GET /sala-espera/status/ativos`, `POST /sala-espera/status`, `PATCH /sala-espera/status/:id`, `GET /sala-espera/match`, `GET /sala-espera/:id/preencher`, `POST /sala-espera/:id/vincular`, `GET /sala-espera/admissoes-para-vincular`, `GET /sala-espera`, `POST /sala-espera`, `PUT /sala-espera/:id`
- `sala-espera.service.ts` (503 linhas), `sala-espera.dto.ts`, `sala-espera.module.ts`, registrado em `app.module.ts`
- Sem `@Roles`: o controle é por menu (comentário no topo do controller)

**Tabelas que escreve:** `sala_espera`, `sala_espera_status`, `candidato_alteracoes_log` (trilha do vínculo), e **por tabela de terceiro** `admissoes.cod_cliente` / `cargo_id` e `candidatos.telefone`, sempre **só quando vazios** (`sala-espera.service.ts:300-370`).
**Tabelas que lê:** `admissoes`, `candidatos`, `clientes`, `cargos`.
**Definição do schema:** `/home/henrique/apps/ea-automatic/apps/backend/src/db/schema/tables.ts:2023` (`sala_espera_status`) e `:2050` (`sala_espera`).
**Seed:** `/home/henrique/apps/ea-automatic/apps/backend/src/db/seed.ts:146` semeia o catálogo de status.

**Menus** (`/home/henrique/apps/ea-automatic/apps/backend/src/domain/menus.ts:485-511`)
- `sala-espera`, grupo OPERACAO, ordem 5. Reivindica `criar`, `atualizar` e `vincular`. **13 usuários**.
- `sala-espera-status`, grupo ADMIN, ordem 26. Reivindica `criarStatus` e `atualizarStatus`. **4 usuários**.

### 2.c Quem Mais Depende

**Quem lê o que ela produz, e é aqui que mora o risco real:** o **Painel da Diretoria / Controle
Gerencial** (`/home/henrique/apps/ea-automatic/apps/backend/src/gerencial/gerencial.service.ts`). Ele
lê `sala_espera` em quatro lugares independentes:
- `salaEspera()` (linha 381): os três números do card, `pendentes`, `emAdmissao` e `declinios`
- o desdobramento por sub-status (linha 407 em diante), que vira **linhas dentro da tabela de Farol**
- `segClienteSala` e `segCargoSala` (linhas 335-365): quando o recorte da Sala está ativo, as tabelas
  de Cliente e Cargo **trocam de fonte** e passam a ler `sala_espera`
- `parcelaDeclinioSala` (linha 434): a Sala **entra no card geral de declínios** do painel

Do lado da tela: `/home/henrique/apps/ea-automatic/apps/frontend/src/app/(app)/diretoria/page.tsx:60-64,120-126,299-308,611-629,668-670,710-714`, incluindo o componente `KpiSala` e o filtro por sub-status.

**Estado que só ela escreve:** as tabelas `sala_espera` e `sala_espera_status` **inteiras**. Ninguém
mais escreve nelas. Tirando a tela, o painel da Diretoria passa a somar um número congelado.

**Estado de terceiro que ela toca:** o pré-preenchimento de `admissoes.cod_cliente` / `cargo_id` e de
`candidatos.telefone`. Ela **nunca** libera, nunca cria frente e nunca mexe em farol (comentário no
próprio método, `sala-espera.service.ts:252-255`). Esse acoplamento é o único ponto em que a Sala
escreve na esteira, e ele é **sugestão**, não passagem de fase: removê-la não deixa dado órfão.

**Acoplamento com a Liberação, nos dois sentidos:** a tela de Liberação chama
`GET /sala-espera/match` (`liberacao/page.tsx:741`) e o `VincularSalaModal`; a Sala chama
`GET /sala-espera/admissoes-para-vincular`, que é a **mesma consulta** de
`farol = AGUARDANDO_LIBERACAO` (`sala-espera.service.ts:403`), servida por rota própria só para não
emprestar menu. **As duas telas caem juntas nesse ponto**: se a Liberação sair, essa rota da Sala
passa a devolver uma lista que nunca terá linha, e o match manual morre sozinho.

**Job, cron, worker, carga, migration:** **nenhum**. Só o `seed.ts` do catálogo de status. O Pandapé
não entra por aqui (a Sala é justamente o que existe **antes** do Pandapé) e o DIGAI também não.

### 2.d O Volume Real

Banco `ea_automatic` (produção), tabela `sala_espera`: **133 linhas no total**, todas criadas em dois
meses (64 em agosto de 2026, 69 em setembro até o dia 21).

| Recorte (a mesma régua do painel) | Linhas |
|---|---|
| Pendentes (status não terminal, sem vínculo) | **8** |
| Vinculadas a uma admissão | **86** |
| Declínios e cancelamentos (terminal, sem vínculo) | **39** |

Por status do catálogo: Aguardando candidatura na vaga 46, Aguardando retorno do candidato 36,
Declinou 26, Aguardando confirmação do link 12, Canceladas 7, Desistiu 6.
Por origem: 114 do Cliente, 19 da Seleção. **41 das 133 têm CPF** preenchido (o CPF é opcional ali e
serve só ao match).

Das 86 vinculadas, o destino na esteira foi: 47 em ADMISSAO_CONCLUIDA, 29 em EM_ADMISSAO, 9 em
DECLINOU e 1 em LIBERACAO_RECUSADA. A trilha `candidato_alteracoes_log` com campo `salaEspera` mostra
vínculos praticamente todo dia útil de 11/08 a 21/09. **A tela é usada de verdade, e é recente.**

### 2.e O Que A Ponte A&S Para Esteira Teria De Absorver

A decisão humana da Sala é simples e tem equivalente claro no funil:
1. **Registrar que uma pessoa foi anunciada e ainda não se candidatou.** No A&S isso é um candidato
   numa etapa inicial do funil (`as_candidatos` mais `as_candidaturas` mais `as_etapas_funil`). É
   exatamente o mesmo conceito, com estrutura melhor: o A&S tem etapa, trilha, motivo e catálogo.
2. **Acompanhar a situação** (aguardando candidatura, aguardando retorno, desistiu). O funil tem
   situação e etapa próprias, e `as_vaga_status` e `motivos_cancelamento_vaga` já cobrem o desfecho.
3. **Casar o anunciado com a admissão que chegou.** Esta decisão **desaparece** quando o A&S estiver
   conectado, e desaparece pelo motivo certo: a admissão passa a **nascer do próprio funil**, então
   não há dois registros para casar. O match manual existe hoje só porque as duas pontas são cegas
   uma para a outra.
4. **Sem equivalente:** a Sala aceita registro **sem CPF** (é a razão de ela ser tabela própria,
   `tables.ts:2035-2047`). O A&S precisa aceitar candidato sem CPF na entrada, ou o caso do cliente
   que manda só nome e telefone deixa de caber.
5. **Sem equivalente, e é o que segura de verdade:** os **números do painel da Diretoria**. Se a Sala
   sair, o card, as linhas de sub-status e a parcela do card de declínios precisam passar a ler o
   funil do A&S, com a mesma régua de não contar duas vezes quem já virou admissão
   (`gerencial.service.ts:370-378`).

### 2.f Veredito

**PODE SAIR EM PARTE.**

O que **pode** sair, e com folga: o cadastro, a fila operacional, o match manual e as rotas que os
servem. O conceito é absorvido pelo funil do A&S com vantagem, e a fila ativa é **pequena, 8 linhas**.
O match manual, especificamente, **morre sozinho** no dia em que a admissão nascer do funil, porque
deixam de existir dois registros a casar. E ela não deixa órfão nenhum na esteira: nunca escreve
farol, frente nem documento, só pré-preenche campo vazio.

O que **fica**, e precisa de destino antes de qualquer remoção:
1. **Os quatro pontos de leitura do painel da Diretoria** (`gerencial.service.ts:335,381,407,434` e
   `diretoria/page.tsx:611-629,668-670,710-714`). Remover a tela sem reapontar esses números deixa o
   painel exibindo um valor congelado, que é pior do que exibir zero.
2. **As 133 linhas de histórico**, sendo 86 com ponteiro para admissão. É a prova de que aquele
   candidato foi anunciado antes de aparecer no Pandapé, que é a razão declarada de a Sala existir
   (comentário em `sala-espera.service.ts:96-100`). A tabela deve ser preservada, ou migrada para o
   funil, nunca descartada.
3. **O aceite de candidato sem CPF**, se o A&S não o tiver.
4. **O catálogo `sala_espera_status`**, mantido pelo diretor por tela própria e semeado pelo
   `seed.ts:146`. Um catálogo que o diretor edita não pode virar lista fixa no código do A&S.

**Ordem sugerida:** migrar as leituras do painel para o funil, congelar a entrada de novos registros
na Sala, esvaziar as 8 pendentes, e só então remover tela, rotas e menus, deixando as tabelas de pé
como histórico.

---

## 3. Nota De Segurança (§A.6)

Nenhuma das duas remoções é neutra do ponto de vista de dado pessoal, e isso pede a frente de
segurança quando a construção for autorizada:
- A Liberação manipula **CPF** como chave, tem trava de duplicidade que lista admissões vivas, e o
  `travarDuplicidadeDeCpf` já cuida de não repetir o CPF na mensagem. Qualquer substituto herda essa
  régua.
- A Sala guarda **nome, telefone, e-mail, nascimento e CPF opcional** fora de `candidatos`, sem
  vínculo com a chave de identidade do sistema. Migrar 133 linhas dessas para o A&S é movimentação de
  dado pessoal e precisa de auditoria, inclusive quanto à retenção (o A&S já tem
  `as_retencao_eventos` e expurgo de identidades, a Sala não tem nenhum).
- As duas telas governam **RBAC por menu** (17, 13 e 4 usuários). Remoção de menu é decisão do
  diretor (§A.23), nunca efeito colateral da remoção do código.

## 4. Observação De Método

Este documento é parecer. Nada foi construído, nada foi alterado, e as consultas ao banco de produção
foram exclusivamente `select`.
