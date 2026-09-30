# PUBLICAÇÃO PENDENTE: as duas frentes que esperam a validação do diretor

Escrito em 30/09/2026. **Nada commitado.** Produção está em `b6e9397` e saudável.

> ## ⇄ ESTE DOCUMENTO TEM UM PAR. LEIA OS DOIS ANTES DE MEXER EM QUALQUER UM.
>
> A mesma pendência está descrita em **`docs/CENTRAL-DE-AJUDA-SOUTALENT-DECISOES.md`, seção 9**, por
> outro ângulo: **lá** está o que muda no MANUAL (quais artigos, quais rótulos, o que NÃO se
> corrige); **aqui** está como as duas frentes SOBEM juntas (a ordem, as migrations, as provas).
>
> **Quem mexer num, lê e atualiza o outro.** Registro duplicado que ninguém costura é registro que
> diverge, e aí a próxima pessoa segue o que estiver mais à mão, que pode ser o desatualizado. É o
> mesmo modo de falha que este projeto já paga em código, aparecendo em documento.

## O QUE ESTÁ PRONTO E ESPERANDO

**Frente A, precedência da ingestão e fila de divergências.** Gate verde, auditoria APROVADA COM
RESSALVA, **prova visual já feita** na 3120. Inclui a migration `0136` (cria
`as_ingestao_divergencias`), já aplicada na homologação e **não** em produção.

**Frente B, os 7 ajustes da Central de Vagas.** Seis prontos (gate: 232 arquivos, 4704 testes, zero
falha; auditoria APROVADA COM RESSALVA). **O item 4 está parado em três perguntas do diretor.**
Inclui a migration `0137` (cria `vaga_consultor_transferencias`), testada em banco descartável e
**não** aplicada em lugar nenhum.

## O COMBINADO COM A SESSÃO DA CENTRAL DE AJUDA, e ele é obrigatório

**PUBLICAR JUNTO, com um restart só.** Motivo, e não é cortesia: os renomeios da frente B mudam
quatro rótulos que **184 artigos do manual descrevem**. Publicar sozinho abre uma janela em que o
manual descreve a tela errada, e **manual defasado é pior que manual faltando**, porque ele tem a
autoridade da casa e a pessoa confia nele.

**O protocolo acordado, na ordem:**
1. Eu aviso a sessão da Central De Ajuda **quando estiver pronto para publicar**, não no momento de
   publicar.
2. Ela corrige os cinco arquivos de texto e refaz três capturas **contra o meu código**.
3. Publicamos os dois na mesma janela, com um restart só.
4. Se a minha janela for curta demais para isso, ela aceita a defasagem, **mas tem de ser avisada no
   momento da publicação, não depois**, para entrar com a correção pronta.

**Os cinco arquivos dela** (eu NÃO os toco): `conteudo/soutalent/revisar-uma-vaga-pendente-de-revisao.ts`,
`corrigir-a-liberacao-de-uma-vaga-revisada.ts`, `abrir-uma-vaga-nova.ts`,
`agir-em-massa-no-funil-da-vaga.ts` e `cadastrar-um-candidato-novo.ts`.

**Duas armadilhas que NÃO devem ser "corrigidas" no manual:** o modal individual continua
"Mover No Funil" (sem "Em Massa"), e a tela de catálogo e o menu continuam "Linhas De Serviço" de
propósito, porque nome de menu é decisão do diretor (§A.23).

## A SEQUÊNCIA DA PUBLICAÇÃO, quando o diretor liberar

1. Commitar as duas frentes, com recorte nominal (§A.14), separadas por assunto.
2. `merge --ff-only` do `ea-release-portal` para a `main`.
3. **Aplicar as migrations `0136` e `0137`** em produção (as duas são aditivas e idempotentes; eu
   testei as duas em banco descartável, aplicando duas vezes).
4. Rebuildar backend **e** frontend, e reiniciar os dois.
5. **Provar no artefato, nunca no fonte** (a régua que este dia produziu): conferir no chunk servido
   que os rótulos novos estão lá, e que o campo de senha do iFractal **continua sem** `type:"password"`
   (o canário da reversão, que não pode ser desfeita por um rebuild meu).
6. Conferir contagens antes e depois (§A.27) e o log de boot declarando a ingestão INERTE.

---

# PROVA VISUAL DOS 7 AJUSTES (§A.13), na 3120, em 30/09/2026

Homologação reconstruída com as migrations **0136, 0137 e 0138** aplicadas, e os dois serviços
reiniciados. Conta SUPER_ADMIN, base sintética.

| o que foi conferido | resultado |
|---|---|
| Central de Vagas: 10 colunas | **nenhuma cortada**, nenhuma célula truncada, não precisa rolar a 1920 |
| Travessão em toda a tela (§A.11) | **zero**, nas duas telas medidas |
| Rótulos **antigos** ("Nome de divulgação", "Natureza", "Sazonalidade", "Linha de serviço") | **nenhum** aparece, em nenhuma das telas |
| Rótulos **novos** na ficha da vaga | **Célula de atendimento**, **Tipo de vaga** e **Tipo de processo** visíveis |
| **Data de realinhamento** (item 4) | visível na ficha, ao lado da data de alinhamento |
| **SLA congelada na entrega** (item 4) | a vaga ENTREGUE mostra **"entregue"** na coluna, em vez de contar; a ABERTA mostra "faltam 18 dias" |
| Novo Candidato: **UF antes de Cidade** | confirmado, e a Cidade nasce travada com "Escolha a UF ao lado para buscar a cidade." |
| Modal de leitura com saída (§A.41) | a ficha da vaga tem **"Fechar"** no rodapé |

**O que NÃO foi provado no olho, e por quê:** o rótulo **"Nome da vaga"** e o campo de **faixa etária
em texto livre** vivem no FORMULÁRIO de edição, não na ficha (a ficha mostra o nome da vaga como
TÍTULO, não como campo rotulado). Os dois estão cobertos por teste de componente que **renderiza** o
formulário e afirma os quatro rótulos novos e a ausência dos quatro antigos
(`rotulos-da-vaga.spec.tsx`, 23 casos) e o campo de texto com teto de 80
(`TrilhaDaVaga.faixa-etaria.spec.tsx`). **Declaro a distinção em vez de dizer que vi tudo.**

**Duas armadilhas do harness que custaram rodadas, registradas para a próxima:**
1. **São DOIS modais que renascem** na homologação, o "Diagnóstico Do Sistema" e o aviso de Liberação
   Admissional. Um fechador que procure `/fechar|entendi|ok/` não pega o segundo, cujos botões são
   "Estou ciente" e "Ver liberação".
2. **Limpar modal DEPOIS de abrir o que se quer fotografar apaga o próprio alvo.** O modal da vaga é
   um `[role="dialog"]` como qualquer outro. A ordem certa é limpar ANTES de clicar, e a guarda
   `!querySelector("table")` é o que impede de apagar a página junto.

---

## O PACOTE DA PUBLICAÇÃO, montado e conferido antes da janela

Montado em 30/09/2026, com os serviços de produção no ar e sem tocar em nada. O release
`ea-release-portal` já está em `b6e9397`, **o mesmo commit da main**, então falta só levar as duas
frentes não commitadas. O que segue é o inventário e as três armadilhas que a montagem revelou.

### O que vai, e o que fica de fora

| grupo | quantos | destino |
|---|---|---|
| Frentes de A&S (precedência, fila de divergências, 7 ajustes da Central de Vagas) | 73 arquivos (41 backend, 32 frontend) | vão |
| Central De Ajuda (sessão vizinha) | 27 arquivos (13 de conteúdo, 14 prints) + 1 renomeação | vão, copiados pela sessão dona |
| `shared-types/src/index.ts` e `db/schema/tables.ts` | 2 arquivos | vão em **versão limpa**, montada por seleção de hunk |
| Migrations 0136, 0137, 0138 | 3 arquivos | vão, com o journal montado por programa |
| **Porta de e-mail do Portal** | 31 caminhos | **NÃO vão**, não autorizada |

### Armadilha 1: o journal do Drizzle omite a 0134 de propósito, e copiá-lo quebra o boot

O journal do release tem **135 entradas e pula de 133 para 135**: a `0134_portal_acesso_email` foi
deliberadamente deixada fora, porque é da frente não autorizada. Quem copiar o journal do repo de
trabalho por cima leva a 0134 para dentro, e o migrator do Drizzle lê **todos** os arquivos listados
no journal antes de filtrar por timestamp: um `.sql` listado e ausente **derruba o boot do backend**.

O journal do release é montado por programa, acrescentando só as três entradas novas, com asserção
explícita de que a 0134 ficou fora.

**E há uma consequência que vale além de hoje, para a decisão do diretor:** a 0134 tem `when`
**1790646000719**, **abaixo da marca d'água da produção** (1790646001719, que é a 0135). O dia em que
a porta de e-mail for autorizada, o Drizzle **pulará a migration dela em silêncio**, porque compara
timestamp e não conteúdo. As tabelas não nascerão e o código subirá referenciando tabela inexistente.
Conserto: reemitir a migration com `when` acima da marca.

### Armadilha 2: dez arquivos misturavam as duas frentes, e oito não eram mistura nenhuma

A medição desfez a suposição: **oito dos dez são byte a byte idênticos entre o release e a 3120**, o
que prova que a modificação deles no working tree é **inteira** da frente de e-mail. Esses oito
simplesmente não vão (`portal.module.ts`, `app/portal/page.tsx`, `domain/portal-envio.ts`,
`domain/portal-evento.ts`, `portal-correio.service.ts`, `portal-painel.controller.ts`,
`portal-painel.service.ts`, `lib/portal-painel.ts`, mais `.env.example` e `admin/portal-links/page.tsx`).

Sobraram **dois** de verdade, e neles a seleção foi por hunk: **3 de 5** no `shared-types`, **8 de 9**
no `tables.ts`.

**O hunk descartado do `tables.ts` teria quebrado o build de um jeito que o olho não pega:** ele é o
bloco de imports, e trazia o `MOTIVOS_DA_TRAVA_DE_ACESSO` (da frente de e-mail) **no meio dos três
imports dos meus tipos novos**. Copiar o arquivo inteiro levaria um import de símbolo que não existe
no `shared-types` limpo; descartar o hunk inteiro tiraria os três imports que os meus tipos precisam.
Só a edição do hunk resolve, e foi o que se fez.

### Armadilha 3: a 3120 estava ATRÁS do repo, e nos comentários

O primeiro plano era copiar os dois compartilhados da 3120, que é a versão limpa que o diretor
validou. A medição mostrou que a 3120 **não tem os blocos de comentário do item 4**, escritos depois
da cópia para lá. Comentário não compila, mas é o raciocínio que o projeto guarda, e a prática é
deixá-lo escrito. Então o artefato foi montado a partir do **repo**, por seleção de hunk, o que
preserva os comentários.

### Como os dois artefatos limpos foram validados

Três medições, e a primeira é a que decide:

1. **Diferença funcional vazia contra a 3120.** Com os comentários retirados dos dois lados, o
   artefato limpo é **idêntico** ao que o diretor validou. É isso que autoriza tratar a validação
   visual da 3120 como valendo para o que vai subir.
2. **Canário de presença:** o artefato contém os 3 campos novos do item 4 e os 4 rótulos renomeados.
   Sem ele, um artefato vazio passaria na medição 1 por acidente.
3. **Canário de ausência:** zero ocorrência de qualquer símbolo da frente de e-mail, tanto nos dois
   artefatos quanto nos 73 arquivos do pacote.

A medição 3 também é o que garante o build: a combinação limpa não tem referência pendente, e é
funcionalmente a mesma que a 3120 **construiu e rodou**.

### Contagens de produção, ANTES

| tabela | antes |
|---|---|
| admissoes | 3011 |
| usuarios | 39 |
| menus | 46 |
| usuario_menus (concessões) | 498 |
| as_etapas_funil | 6 |
| vagas / as_candidatos / as_candidaturas | 0 / 0 / 0 |
| migrations aplicadas | 135 |

As tabelas de A&S em zero são o esperado: A&S ainda não recebeu carga em produção. A publicação não
escreve dado nenhum, só estrutura.

### O roteiro

`publicar.sh` no scratchpad da sessão, em oito etapas: backup do banco com verificação de tamanho,
cópia dos 73, os dois artefatos limpos, as três migrations com o journal montado por programa, build,
migrations conferidas uma a uma (inclusive a asserção de que `portal_acesso_codigos` **não** nasceu),
restart dos dois serviços e saúde das rotas.
