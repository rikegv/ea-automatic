# Banco de Talentos: investigação do lado ADM (§A.27)

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-25 · **Tipo:** levantamento de alcance, nada construído
**Regra desta OST:** nada alterado no ADM, nada commitado. Este documento é o mapa para o Rike decidir.
**Aplica:** §A.2 (stack), §A.26 (mexeu em validado, pergunta antes), §A.27 (mapear o alcance antes da
primeira linha). §A.11 observada: nenhum travessão.

---

## Nota de localização, que muda o tamanho de tudo

O módulo de A&S (Central de Vagas) **não está em `main`**. Ele vive na branch `homolog`, worktree
`/home/henrique/apps/ea-homolog`, pelos commits `a265fc5` (tabela `vagas`), `ac430fc` (backend da
Central de Vagas), `432f3b4` (a tela e a trilha de abertura em 5 passos) e `65cbc3d` (o desenho).

O ADM (esteira, frentes, declínio) está em `main`, em produção.

Consequência prática: a parte que é só de A&S se constrói em `homolog` sem encostar em produção,
como o Rike pediu. Mas **o dia em que o flag de banco e a trava entrarem no ADM, as duas linhas
precisam se encontrar**, e isso é um merge de `homolog` para `main` carregando junto o módulo inteiro
de A&S. Não é impedimento, é sequenciamento, e é melhor saber agora.

---

## 1. Onde mora o declínio no ADM hoje

### 1.1 O dado

O declínio **não é um evento e não é um estado de frente**. Ele é um **marcador da admissão**, duas
colunas na tabela `admissoes`:

| Coluna | O que guarda |
|---|---|
| `farol_global` | passa a `'DECLINOU'` (enum `farol_global`, junto de `RESCISAO`, `EM_ADMISSAO`, `BANCO_AGUARDAR`, `ADMISSAO_CONCLUIDA`, `AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`) |
| `motivo_declinio_id` | FK nullable para o catálogo `motivos_declinio` (25 motivos canônicos, soft-delete por `ativo`) |

A trilha de quando e por quem vai, append-only, para `candidato_alteracoes_log`, nas linhas
`farolGlobal` e `motivoDeclinio`.

### 1.2 O código

`EsteiraService.declinarAdmissao` (`apps/backend/src/esteira/esteira.service.ts:1257`), exposto em
`PATCH /esteira/admissao/:admissaoId/declinar` (`esteira.controller.ts:50`). O DTO
(`dto/declinar.dto.ts`) **exige** `motivoDeclinioId`: não existe declínio sem motivo escolhido da
lista.

Está escrita ali, em maiúsculas, a regra de ouro da OST do declínio não destrutivo: o declínio
**não toca em nenhuma frente**. O exame, o prontuário, o ASO e as datas ficam exatamente como estão.
A palavra "Declínio" que aparece nas colunas do Gerenciador é **derivada do farol**, não é dado
gravado na frente.

### 1.3 O detalhe que decide o desenho do aviso: o declínio tem MAIS DE UMA PORTA

`declinarAdmissao` é a porta principal, mas não é a única que escreve `farol_global = 'DECLINOU'`:

1. `PATCH /esteira/admissao/:id/declinar`, o botão da Esteira;
2. a edição da admissão (o lápis/olho do Gerenciador), que grava o farol pelo mesmo campo;
3. o desfecho da frente de INTEGRAÇÃO (`esteira.service.ts:1165-1174`), que carimba
   `ADMISSAO_CONCLUIDA`, `DECLINOU` ou `RESCISAO` conforme o status escolhido.

**Isto é o que mata a ideia de pendurar o aviso no endpoint.** Um gatilho no `declinarAdmissao`
pegaria a porta 1 e perderia as portas 2 e 3, em silêncio, e ninguém veria até faltar aviso numa
admissão real. É exatamente o defeito da §A.26 (a transição pós-ASO, que quebrou porque só dois dos
três caminhos foram tocados).

### 1.4 Resposta à pergunta

**Sim, dá para pendurar um aviso no declínio sem mexer no fluxo, desde que o aviso seja derivado do
ESTADO e não plugado no evento.** O aviso lê `farol_global IN ('DECLINOU','RESCISAO')` e pergunta se
o cliente daquela admissão tem banco. É leitura pura, roda fora da transação do declínio, e as três
portas ficam cobertas de graça, sem uma linha alterada em `declinarAdmissao`.

Esse é, por sinal, o mesmo desenho do aviso que o ADM já usa hoje (seção 3): a Liberação também
conta um farol em vez de escutar um evento.

**Alcance da mudança: zero em código validado.** Nada em `declinarAdmissao`, nada nas frentes, nada
nas expressões de contagem.

---

## 2. Como a esteira trata quem chega, e onde caberia o flag e a trava

### 2.1 O caminho da pessoa, do nascimento ao cadastro

1. **Nasce a admissão** (wizard de Nova Admissão, webhook do Pandapé ou carga). Junto nascem
   **AUDITORIA e EXAME**, simultâneas (`FRENTES_AO_NASCER`, regra 1 do §A.3).
2. As duas correm **independentes** (regra 2). Concluir uma não move a outra.
3. **AUDITORIA conclui** em `ANALISE_OK`, **EXAME** em `APTO` (`STATUS_CONCLUI`, `domain/esteira.ts`).
4. Quando as duas estão concluídas, o **gate do Cadastro** abre:
   `podeAbrirCadastro(frentes)` em `domain/frentes.ts:29`, função pura, três linhas.
5. Com o gate aberto, **a frente CADASTRO_CONTRATO nasce**, e a INTEGRAÇÃO nasce junto quando o
   cliente a exige.

### 2.2 A porta única, que já existe e foi feita para este tipo de regra

O nascimento do Cadastro passa por **uma função só**:
`nascerCadastroEIntegracao()` em `apps/backend/src/esteira/nascimento-cadastro.ts`.

Ela foi criada exatamente porque o Cadastro nasce em **três** lugares:

| # | Caminho | Arquivo |
|---|---|---|
| 1 | o consultor move o status na tela | `esteira.service.mudarStatus` |
| 2 | a I.A fecha a Auditoria sozinha | `auditoria.service.concluirFrente` |
| 3 | o ASO validado fecha o Exame | `esteira.service.concluirExamePorAso` |

O comentário da própria função diz por que ela existe: escrever a regra à mão nos três é a receita do
defeito que originou a §A.26. Há inclusive um teste dedicado,
`nascimento-cadastro.tres-caminhos.spec.ts`, travando os três.

**Então a trava do banco tem UM lugar, e só um: a condição de nascimento dentro de
`nascerCadastroEIntegracao`.** Marcada a admissão como banco, a frente de Cadastro não nasce.
Auditoria e Exame correm normalmente, a pessoa aparece na esteira normal como o Rike pediu, e o
Cadastro simplesmente não existe até alguém tirar o flag. Um caminho novo que nasça amanhã ou passa
por essa porta, ou não cria Cadastro nenhum.

Há um segundo ponto a cobrir junto, e ele é conhecido: `esteira.service.mudarStatus` calcula
`gateVaiAbrir` **fora** da transação para decidir se a Integração nasce. A trava tem de entrar nos
dois pontos, ou o gate abre no cálculo e não abre na escrita.

### 2.3 O achado pesado: `is_banco` JÁ EXISTE no ADM, com outro significado

`admissoes.is_banco` (boolean, `tables.ts:555`) está no ar hoje e **já quer dizer "admissão de
banco"**. Só que o que ele faz não é o que o Rike descreveu:

| O que `is_banco` faz hoje | Onde |
|---|---|
| Força o farol para `BANCO_AGUARDAR` enquanto marcado, e a marcação **manda** sobre a derivação automática | `domain/admissao.ts:252` |
| Muda a régua de pendências: a **ausência de `data_admissao` deixa de ser pendência**, e o **Termo de Banco vira pendência obrigatória** | `domain/admissao.ts:180`, `pendencias-lote.ts` |
| É editável pelo lápis do Gerenciador, campo "Admissão de banco" | `EditAdmissaoModal.tsx` |
| **Não trava absolutamente nada.** A pessoa marcada como banco hoje avança para o Cadastro normalmente | verificado: nenhum uso de `isBanco` no gate |

Vale registrar o histórico, porque ele custou caro: em 13/08/2026 esse campo foi objeto de uma
correção de bug (o farol voltava sozinho para "Em Admissão" depois de marcado). A escolha de fazer a
flag mandar sobre a derivação está documentada em maiúsculas dentro de `deriveFarolGlobal`. É código
validado, com cicatriz. Mexer no significado dele é §A.26 na veia.

**E há uma terceira acepção de banco, do lado A&S:** o enum `vaga_natureza` tem `VAGA_BANCO` e o
`vaga_status` tem `VAGA_BANCO`. Ou seja, na Central de Vagas o banco existe hoje como **atributo da
vaga inteira**, o que é justamente o modelo que o desenho novo abandona ("banco é marcação por
candidato, não cota cega").

**São três "bancos" diferentes no mesmo sistema.** Isto é decisão do Rike, não da fábrica, e está na
seção 5.

### 2.4 O que exatamente bloqueia o avanço, hoje

Para o Rike ter o vocabulário na mão, o sistema já sabe barrar de **três** maneiras distintas:

| Mecanismo | Como se comporta | Onde |
|---|---|---|
| **Gate duro** (regra 3) | o Cadastro simplesmente não existe até Auditoria e Exame concluírem. Não há o que clicar | `podeAbrirCadastro` |
| **Bloqueio com aceite** | o backend devolve `409 ConflictException` com `{needsConfirmation, reason}`; o front abre modal; confirmando, passa **e grava trilha permanente** em `passagem_aceites` (quem, quando, quais campos) | `esteira.service.ts:957`, regra 8 do §A.3 |
| **Confirmação de reversão** | recuar um status que derrubaria um Cadastro já aberto pede confirmação | `reversaoDerrubaCadastro` |

O banco do Rike ("o time do ADM **não consegue** avançar, para destravar alguém **tira o flag**") é o
primeiro tipo, o gate duro, e não o segundo: não é para existir botão de "passar assim mesmo".

---

## 3. O padrão de aviso chato do ADM, e ele é reusável inteiro

O que o Rike chama de "aviso igual aos do ADM" é o **`LiberacaoAlertaProvider`**,
`apps/frontend/src/components/shell/LiberacaoAlerta.tsx`, montado em `AppShell.tsx` por cima de toda
a casca autenticada, ao lado do `DiagnosticoAlertaProvider`.

Mecânica, exatamente como está escrita hoje:

| Peça | Comportamento |
|---|---|
| Fonte | **um** polling só, de 90s, num endpoint de contagem (`/admissoes/aguardando-liberacao/contagem`). Sem canal de push, então é polling do cliente |
| Badge | a contagem desce por React context (`useLiberacaoCount`) e vira o badge do menu lateral. Zero esconde |
| Popup | sobe quando a pendência aparece (0 para maior que 0), **para todos os perfis** |
| Insistência | "Estou ciente" fecha e **agenda a reaparição em 20 minutos**, se ainda houver pendência. Decisão do diretor, está no comentário |
| O que zera | **só resolver zera.** "Estou ciente" não mexe no contador |
| Anti empilhamento | um popup por vez |
| Refresh imediato | a tela de destino chama `useLiberacaoRefresh()` logo após resolver, para o badge não esperar os 90s |

É literalmente "não some até resolver". **Para o aviso de declínio, o padrão serve sem invenção
nenhuma:** troca-se o endpoint de contagem, o texto e a rota de destino. O caminho limpo é
generalizar o provider para receber esses três parâmetros, em vez de copiar o arquivo, porque copiar
duplicaria a regra dos 20 minutos em dois lugares.

Um detalhe do desenho do Rike que o padrão atual **não** cobre: o aviso de declínio tem **dois
destinatários** (tem banco, avisa o ADM; não tem, avisa a A&S). O provider de hoje avisa todo mundo
igual. Segmentar por área é possível, o sistema já tem área por menu (`menu-areas.service`, áreas ADM
e AS), mas é trabalho novo e precisa de decisão: quem exatamente vê cada aviso.

---

## 4. A ponte vaga A&S x esteira ADM: ela NÃO EXISTE hoje

Este é o achado que mais mexe no tamanho da frente.

**Não há nenhum vínculo entre uma vaga da Central de Vagas e uma admissão da esteira.** Conferido:

- `admissoes` **não tem** `vaga_id`. O único `vaga_id` do schema é o da tabela `vaga_beneficio`
  (benefícios da vaga), que não encosta em admissão.
- **Não existe tabela de candidato alocado à vaga.** As tabelas de A&S hoje são `vagas`,
  `vaga_beneficio` e as listas auxiliares. A vaga tem `posicoes integer`, e ocupação é derivada.
- `admissoes.id_vacancy` existe, mas é o **id da vaga no Pandapé**, de outro universo. Não é a chave
  da vaga do A&S e não serve de ponte.

O que existe de comum entre os dois lados, e é bastante:

| Chave | Na vaga | Na admissão |
|---|---|---|
| Cliente | `vagas.cod_cliente`, FK para `clientes.cod_cliente` | `admissoes.cod_cliente`, mesma FK |
| Cargo | `vagas.cargo_id`, FK para `cargos.id` | `admissoes.cargo_id`, mesmo catálogo |

Disso saem duas conclusões práticas, e elas separam a frente em dois pedaços de custo muito diferente:

**a) O aviso de declínio NÃO precisa da ponte.** A pergunta "o cliente desta admissão declinada tem
banco disponível?" se responde só pelo cliente, que os dois lados já compartilham. Cliente da
admissão, vagas daquele cliente, banco daquele cliente. Zero coluna nova na tabela `admissoes`.

**b) O flag de banco no ADM precisa de alguma ponte, e o tamanho dela é decisão do Rike.**
Quando a pessoa de banco é encaminhada da A&S para o ADM, alguém tem de carregar a marcação. As duas
formas possíveis:

- **Ponte por marcação, barata:** a admissão ganha só o flag de banco, e nenhuma referência à vaga.
  A trava funciona, o aviso funciona, e nada mais. O que se perde: o contador "6 de 10 oficiais, 3 de
  10 banco" nunca se fecha do lado do ADM, porque ninguém sabe de qual vaga aquela pessoa veio.
- **Ponte por vínculo, cara:** a admissão ganha referência à alocação (e portanto à vaga). Aí os
  contadores fecham ponta a ponta e a A&S enxerga o que aconteceu com cada pessoa que ela mandou.
  **Isto adiciona coluna na tabela `admissoes`, que é a tabela central do sistema em produção.**

---

## 5. As decisões que precisam do Rike antes da primeira linha no ADM

1. **Qual "banco" é o banco.** Reusar `admissoes.is_banco`, que já existe e já carrega farol
   `BANCO_AGUARDAR` e régua de pendências própria (Termo de Banco obrigatório, data de admissão
   dispensada), ou criar um flag novo e independente? Reusar é barato mas **muda o significado de
   código validado com cicatriz de bug**. Criar novo é limpo mas deixa dois campos parecidos na mesma
   tabela, e alguém vai confundir os dois em seis meses. A fábrica não decide isso sozinha (§A.26).
2. **O que fazer com `VAGA_BANCO`** em `vaga_natureza` e `vaga_status`, já que o desenho novo diz que
   banco é marcação por candidato e não natureza da vaga inteira.
3. **Ponte barata ou ponte cara** (seção 4b). Ou seja: os contadores da vaga precisam continuar
   corretos depois que a pessoa entra na esteira do ADM, ou basta a trava e o aviso?
4. **Quem vê cada aviso.** O provider de hoje avisa todos os perfis igual; o desenho pede ADM num
   caso e A&S no outro.
5. **Ordem de merge.** A&S está em `homolog` e o ADM está em `main`. O flag e a trava só existem no
   mesmo lugar depois que as duas linhas se encontrarem.

---

## 6. O que já dá para construir agora, sem tocar no ADM

Confirmado pela investigação: os dois contadores na vaga (oficiais e banco), a marcação oficial ou
banco por candidato alocado e o banco parado na seleção **não encostam em nada do ADM**. A tabela
`vagas` tem hoje um `posicoes integer` só, e a tabela de candidato alocado ainda não existe, então
tudo isso é construção nova dentro do módulo de A&S, em `homolog`.

O que só entra depois do OK: o flag no ADM, a trava do Cadastro e o aviso de declínio.
