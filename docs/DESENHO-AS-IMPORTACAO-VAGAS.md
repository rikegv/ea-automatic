# A&S Central de Vagas: importação da base real

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-21 · **Tipo:** levantamento e desenho (§A.27)
**Estado:** a base "BASE DE GESTÃO DE VAGA" **ainda não está na VM**. Este documento traz o que
independe do arquivo; o retrato numérico sai assim que ele chegar.
**Ambiente:** homologação. Nada construído, nada tocado em produção.

---

## 1. O que só o arquivo responde

Estas contas dependem do Excel e serão rodadas assim que ele estiver na VM:

- Contagem de vagas **únicas** depois de aparar espaço e resolver duplicados.
- Quantos códigos duplicados existem, e **o padrão deles** (ver a análise proposta em §5).
- Se existe coluna de **prazo** (a base tem Fechamento, que é fato consumado, não prazo).
- Quantos **nomes distintos** a coluna Vaga tem, e quantos casam com os 388 cargos do catálogo.
- Quantos **clientes** da base casam com os 238 do EA, e por qual chave.

---

## 2. Nove divergências entre a base e o que já foi decidido

São o miolo deste levantamento. Cada uma precisa de decisão antes da importação, porque todas fazem
a importação **inventar dado** se ficarem em aberto.

### 2.1 O código da vaga mudou de regra, e sobrou um caso

Em 20/08 ficou decidido que "a vaga TEM código próprio legível, **gerado** pelo sistema". Agora o
código **herda da base**, número puro. Absorvido.

**O caso que sobra:** e a vaga **criada manualmente** no EA, que não veio da base? Ela precisa de um
código, e o gerador foi descartado. Duas saídas:

| Opção | O que é |
|---|---|
| a | Sequência própria, começando **acima do maior código importado**. Convive com o herdado sem colidir |
| b | Código **obrigatório digitado** por quem cadastra, com unicidade validada |

Recomendo **a**: ninguém deveria precisar inventar número, e a colisão fica impossível por construção.

### 2.2 O Tipo de Vaga da base NÃO é o tipo de contratação aprovado

| Base de vagas | Lista aprovada em 20/08 |
|---|---|
| Efetiva, **Estágio**, Reposição Efetiva, Temporária, Terceira, Vaga Banco | Temporário, Terceirizado, **Estágio**, Interno, Fopag, Jovem Aprendiz |

Só **Estágio** coincide de verdade. "Temporária" e "Terceira" **provavelmente** correspondem a
Temporário e Terceirizado, mas são nomes diferentes e supor é inventar. E o resto não se encontra:
**Efetiva, Reposição Efetiva e Vaga Banco** não existem na lista aprovada; **Interno, Fopag e Jovem
Aprendiz** não existem na base.

**Recomendação: são duas taxonomias diferentes, e devem virar dois campos.** O tipo da base descreve
**a vaga** (é efetiva? é reposição?); a lista aprovada descreve **o vínculo da contratação**. Forçar
uma na outra faz a importação escolher por conta própria em 2.363 linhas. A vaga guarda `tipo_vaga`
com o vocabulário da base, e o tipo de contratação segue sendo assunto da admissão.

### 2.3 "Vaga Banco" está nos dois eixos ao mesmo tempo

Aparece **como Status** e **como Tipo de Vaga**. Se uma linha vier com Tipo "Temporária" e Status
"Vaga Banco", o que ela é? Precisa de regra, senão a importação decide sozinha.

### 2.4 Sazonal e Operação Padrão não existem na base

Foi decisão estrutural ("toda vaga marca na abertura"), mas a base não tem essa coluna. Três saídas:

| Opção | Risco |
|---|---|
| a | Tudo nasce **OPERACAO_PADRAO**, o time marca as sazonais depois | nenhum: erro visível |
| b | **Derivar** do Tipo de Vaga (Temporária vira sazonal?) | inventa classificação em massa |
| c | Nasce **vazio** e vira pendência de preenchimento | fila grande no dia 1 |

Recomendo **a**. Derivar parece esperto e é o caminho mais rápido para uma classificação errada em
2.363 linhas que ninguém vai auditar.

### 2.5 O vocabulário de status da base é melhor que o proposto

| Base | Proposto em 20/08 |
|---|---|
| Aberta, Cancelada, **Entregue**, **Fechada**, Vaga Banco | ABERTA, PAUSADA, ENCERRADA, CANCELADA |

"Entregue" e "Fechada" são coisas diferentes na operação (entregue = preenchida; fechada = encerrada),
e o proposto colapsa as duas em ENCERRADA. **Recomendo adotar o vocabulário da base**, porque é o que
a operação já fala, e porque perder a distinção Entregue x Fechada apaga justamente o indicador de
sucesso da vaga.

### 2.6 São duas pessoas, não uma

A base traz **Consultor Responsável** e **Recruiter**. O desenho aprovado tinha "quem abriu + consultor
que cadastrou". Mapeamento direto: Consultor Responsável vira o responsável pela vaga, Recruiter vira
o recrutador.

**A pegadinha:** os dois vêm como **texto**, e o EA tem tabela de usuários. Muitos nomes não vão casar
(gente que saiu, grafia diferente). Recomendo guardar **sempre o texto original** e, além dele, uma
ligação opcional ao usuário quando o nome casar. Assim nada se perde e o dado não trava a importação.

### 2.7 A região vem estruturada, e isso é melhor que o aprovado

O desenho aprovado tinha "local de trabalho" como texto livre. A base traz **Estado e Cidade
separados**. Recomendo aproveitar: guardar `uf` e `cidade` estruturados **e** manter o local livre para
o endereço completo. Estruturado é o que permite filtrar a Central de Vagas por região.

### 2.8 A base tem um ciclo de vida que o desenho não previa

O desenho tinha data de abertura e data limite. A base tem **Solicitação, Abertura, Reabertura,
Fechamento, Cancelamento e SLA**.

**"Reabertura" é a que muda o modelo:** significa que uma vaga **volta a abrir**, então o status não é
um caminho só de ida. Duas consequências: as datas todas precisam existir como campos, e o SLA da base
deve ser **importado como veio**, não recalculado, senão o número do EA passa a divergir do número que
a operação conhece.

### 2.9 "ETAPA DO PS" é da Central de Candidatos, não desta

É a etapa do processo seletivo, ou seja, **o funil do candidato**, que é a etapa 2 do roadmap. Modelar
agora seria antecipar frente. Recomendo **guardar o texto cru** numa coluna de origem, sem virar enum
nem regra, para não perder o dado e não criar estrutura que a etapa 2 vai refazer.

---

## 3. O ponto crítico: cargo é obrigatório e a base pode não ter

O desenho aprovado tem **cargo obrigatório, com ligação ao catálogo**. A base tem a coluna **Vaga**,
que é o **nome divulgado**, não necessariamente um cargo de catálogo.

**Isto não é detalhe de importação, é uma frente de curadoria**, e precisa entrar no prazo da etapa 1.

**Há precedente exato no projeto, e ele deve ser reusado.** A carga de admissões enfrentou o mesmo
problema e resolveu assim:

1. Gerou um CSV de conferência (`DEPARA_CARGOS.csv`) com quatro colunas: **nome na base, quantas
   linhas, cargo canônico, situação** (EXISTENTE ou NOVO).
2. O diretor **revisou e decidiu** caso a caso.
3. Só então a carga rodou, e os cargos novos aprovados foram criados **antes** dela
   (`carga-0308-catalogo.ts`).

**Recomendo repetir esse processo, e não deixar a máquina casar sozinha.** O registro daquela vez é a
razão: o diretor havia listado "usar existentes" para Vendedor I e Vendedor II, e **nenhum dos dois
existia**; fundi-los em "Vendedor" teria apagado em silêncio a distinção que ele pediu.

Se o volume de nomes não casados for grande, existe a saída de **cargo opcional só nas vagas
importadas** (as novas nascem com cargo obrigatório). É pior para a régua documental, que resolve por
cliente e cargo, mas é honesto: melhor vazio do que preenchido por adivinhação. **Decisão do diretor
depois que o número aparecer.**

O mesmo vale para **Cliente**: a base traz nome, e o EA tem 238 clientes com código. A carga anterior
casou por **CNPJ** onde deu; se a base de vagas não tiver CNPJ, sobra o nome, que é frágil. O mesmo CSV
de conferência resolve.

---

## 4. Desenho da tabela

Ajusta o desenho de 20/08 absorvendo as divergências acima.

| Campo | Nota |
|---|---|
| `id` | PK |
| `codigo` | **herdado da base**, número puro, limpo (trim). Unique |
| `cod_cliente` | ligação com clientes |
| `cliente_origem` | o nome do cliente como veio na base, preservado |
| `cargo_id` | ligação com cargos (ver §3) |
| `nomenclatura` | a coluna Vaga, o nome divulgado |
| `posicoes` | Nº de vagas, inteiro > 0 |
| `tipo_vaga` | vocabulário **da base** (§2.2) |
| `sazonal` | SAZONAL ou OPERACAO_PADRAO, nasce OPERACAO_PADRAO (§2.4) |
| `status` | vocabulário **da base** (§2.5) |
| `salario_abertura` | decimal |
| `uf`, `cidade` | estruturados (§2.7) |
| `local_trabalho` | texto livre, complementar |
| `consultor_responsavel`, `recruiter` | **texto** + ligação opcional a usuário (§2.6) |
| `data_solicitacao`, `data_abertura`, `data_reabertura`, `data_fechamento`, `data_cancelamento` | todas as datas da base |
| `sla_origem` | o SLA **como veio**, não recalculado (§2.8) |
| `etapa_ps_origem` | texto cru, sem modelar (§2.9) |
| `origem` | IMPORTACAO ou MANUAL |
| `linha_origem` | a linha do Excel, para rastrear a importação |
| `criado_por_id`, `criado_em`, `atualizado_em` | trilha |

Os campos de abertura e requisitos aprovados em 20/08 (confidencial, mostrar empresa, benefícios,
insalubridade, formação, experiência, cursos, idiomas, perfil, atribuições, observações) **continuam no
desenho e nascem vazios na importação**, porque a base não os tem.

**Escolaridade:** continua **não existindo** em lugar nenhum do sistema (o que existe é o tipo de
documento "Comprovante de Escolaridade"). A lista fechada nasce nova, vazia nas vagas importadas.

---

## 5. Desenho do importador

**Formato de entrada: o Excel direto.** `exceljs` **já é dependência** do backend, então não há
conversão para CSV, e ler o arquivo original elimina uma etapa manual onde se perde acento e zero à
esquerda.

**Filtro das linhas válidas.** A aba tem ~26 mil linhas e ~2.363 com código. O critério é **ter código
depois do trim**; o resto é descartado e **contado no relatório**, nunca em silêncio.

**Limpeza, na ordem:**
1. `trim` no código e conversão para número puro.
2. Descartar linha sem código.
3. Agrupar por código para tratar duplicados.

**Duplicados: a análise antes da regra.** Não dá para decidir sem ver os dados. O que será medido, por
grupo de código repetido:
- as linhas são **idênticas** (ruído puro, some com dedup);
- diferem só em **status ou datas** (é histórico, e a regra vira "a mais recente vence");
- diferem em **cliente, cargo ou nº de vagas** (são vagas diferentes com código repetido, e aí o código
  não serve de chave, o que muda o desenho).

O relatório traz os três casos com contagem e exemplos, e a regra sai da sua decisão.

**Idempotência:** a chave é o `codigo`. Rodar duas vezes **não duplica**: atualiza a linha existente.
É o mesmo padrão das cargas anteriores.

**Ensaio antes de gravar.** A importação roda primeiro em modo **relatório**, sem escrever: quantas
linhas válidas, quantos duplicados e de que tipo, quantos cargos e clientes casaram, e a **lista dos
que não casaram**. O diretor revisa, decide o de/para, e só então a importação de verdade roda.

**§A.6:** vaga não tem dado pessoal. Consultor e recruiter são nomes de colaborador, tratados como
cadastro interno, nunca em log.

---

## 6. Decisões do diretor: FECHADAS em 21/08

Todas as sete recomendações da versão anterior foram acatadas, com dois ajustes:

| # | Decisão |
|---|---|
| 1 | **Dois campos**, e não um: **natureza** da vaga (Efetiva, Estágio, Reposição Efetiva, Temporária, Terceira, Vaga Banco) e **vínculo** da contratação (Temporário, Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz) |
| 2 | **"Vaga Banco" é NATUREZA**, não status: o cliente pede para conduzir o processo e deixar candidatos aguardando chamada. **Não tem relação com o "banco" da Admissão**, que é status do candidato na esteira. Mundos separados, nunca cruzar. A Seleção precisa filtrar por natureza para medir quantas pessoas foram trabalhadas para vaga de banco |
| 3 | Sazonal: tudo nasce **Operação Padrão**, marcação manual depois. Não derivar |
| 4 | Status: **vocabulário da base**, sem colapsar Entregue e Fechada. Regra geral: sempre que der para manter o status da base, manter |
| 5 | Reabertura modelada (status não é caminho de ida só). **SLA importado como veio**, nunca recalculado |
| 6 | **Não existe gerador de código.** Importada mantém o código do Panda; vaga nova tem o código **digitado à mão**. O gerador proposto foi descartado |
| 7 | Cargo: **dois campos**, nome de divulgação e cargo técnico do catálogo, com vínculo **obrigatório**. De/para gerado pela fábrica e **validado em tela pelo diretor**. Vagas importadas entram como **já finalizadas** (são histórico) |

---

## 7. ACHADO QUE MUDA O TAMANHO: o cadastro cliente para cargos NÃO existe

**Verificado no banco antes de desenhar (§A.27), e a resposta é NÃO.**

Não há tabela de cliente e cargo no sistema. As únicas tabelas com "cargo" ou "cliente" no nome são
`cargos`, `clientes`, `regua_documental`, `projeto_vaga_cargo`, `cliente_beneficio_padrao`,
`cliente_beneficio_regra`, `cliente_pendencia_config` e `cliente_vinculos`. Esta última foi conferida
e liga cliente a **empresa do grupo e tipo de serviço**, não a cargo.

### Existe uma relação DERIVÁVEL, mas ela é resíduo, não cadastro

Dá para deduzir os pares de dois lugares: a **régua documental**, que é configurada por cliente e
cargo, e o **histórico de admissões**, que registra para quem já se contratou.

| Medida | Valor |
|---|---|
| Pares distintos cliente e cargo (união das duas fontes) | **514** |
| Clientes cobertos | **216** de 238 |
| Clientes sem nenhum cargo | 22, sendo **12 ativos** |
| **Clientes com APENAS 1 cargo** | **145** de 216 |

**O número que condena o filtro duro é o último.** Em **145 clientes, 67% dos cobertos**, o consultor
veria **uma única opção** no seletor de cargo. Numa operação com 2.363 vagas, isso não filtra, trava.

E o motivo é conceitual, não de volume: **nenhuma das duas fontes é um catálogo.** A régua só existe
onde alguém configurou um checklist; o histórico só mostra para quem já se contratou. Um cargo que o
cliente tem mas nunca teve régua nem admissão **simplesmente não aparece**.

### Recomendação: a importação É a curadoria

Em vez de abrir uma frente de curadoria manual antes da tela, usar o que já vai acontecer:

1. **Agora, seletor que sugere e não bloqueia.** Os cargos conhecidos do cliente aparecem no topo, e
   os demais 388 continuam alcançáveis. Zero trava, e a relação cresce pelo uso.
2. **A importação das 2.363 vagas enriquece a relação de graça.** Cada linha importada carrega um par
   cliente e cargo, revisado por você no de/para. Esses pares são exatamente o cadastro que falta.
3. **Depois da importação, apertar.** Com a relação alimentada por 2.363 vagas reais, o seletor pode
   passar a filtrar de verdade, com uma tela de manutenção para ajustar.

**O que isso custa:** a tela nasce sem o filtro duro que você desenhou, e ganha ele depois. **O que
isso evita:** uma frente de curadoria manual de 238 clientes contra 388 cargos antes de qualquer tela
existir, e um seletor de uma opção só em dois terços dos clientes.

Se preferir o filtro duro desde o começo, é decisão sua, e aí a curadoria entra como frente própria
**antes** da tela, com o prazo da etapa 1 crescendo.
