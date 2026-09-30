# GUIA DE VALIDAÇÃO: precedência, travas, duplicata e origem

**Estado: construído, gate verde, auditado. NADA commitado, NADA em produção.**
A prova visual (§A.13) e a sua validação dependem de uma decisão sua, no fim deste guia.

## O que mudou, em uma frase por item

| item | o que era | o que passa a ser |
|---|---|---|
| **1. Precedência** | a varredura sobrescrevia `etapa` em silêncio, e a pessoa voltava em até 30 min, em loop | **o EA vence sempre.** A diferença vira linha na fila de revisão, e o time decide |
| **2. Situação** | o ATS reescrevia `situacao`, inclusive desfazendo descarte do time | **nunca é escrita** em candidatura existente. `DESCARTADO` coberto |
| **3. Vaga liberada** | o ATS reescrevia código, nome, cidade e posições a cada volta | só escreve **enquanto a vaga está em revisão**. Depois de liberada, os quatro campos são do EA |
| **4. Duplicata** | transferir de vaga criava candidatura VIVA na vaga antiga, ocupando duas posições | a transferência é **detectada pela trilha** e não duplica: vira divergência |
| **7. Origem** | a pré-admissão da varredura nascia `MANUAL`, igual à de um consultor | nasce **`PANDAPE`**, marca única, webhook e varredura juntos |
| **6. Ponte adiada** | ponte que falhava nunca era retentada | **retenta**, e ficou seguro justamente por causa do item 2 |

## A tela: `/admin/divergencias-ingestao`

Nove colunas: Candidato, Cliente, Vaga, Campo, Valor No EA, Valor No Pandapé, Ocorrências,
Detectado Em, Ações. Três cartões clicáveis como filtro: Abertas, Resolvidas, Reincidentes.
Filtros múltiplos de Campo, Escopo, Cliente, Vaga e Situação.

**Duas ações por linha:**
- **"Manter o EA"** fecha a linha e **não escreve nada** no dado.
- **"Adotar o Pandapé"** pede confirmação e **aplica de verdade**, pelo caminho humano normal, com
  autor e trilha: move a pessoa de etapa, altera as posições da vaga, ou troca a vaga do candidato.

**Só TRÊS campos são adotáveis** (etapa, posições da vaga, vaga do candidato). Nos outros quatro o
botão **não aparece**, e no lugar dele há um cadeado dizendo o caminho real, porque não existe
caminho humano aplicável ao estado em que a divergência nasce. Preferimos recusar na tela a deixar
você clicar e tomar erro.

**Reincidência não cria linha nova:** a mesma divergência voltando incrementa "Ocorrências". Sem
isso, 48 voltas por dia viravam 48 linhas da mesma coisa e a fila deixava de ser fila.

## O que conferir na tela

1. A tabela desenha as nove colunas sem nada esmagado, cortado ou suprimido (§A.20).
2. Marcar **dois** valores no filtro de Campo soma as duas populações, não troca (§A.28).
3. Clicar no cabeçalho ordena, e clicar de novo inverte (§A.29).
4. Clicar num cartão liga o filtro; clicar de novo desliga.
5. "Adotar o Pandapé" abre a confirmação mostrando os dois valores, e **cancelar não escreve nada**.
6. Numa linha de campo não adotável, o botão de adotar **não existe** e o cadeado explica o caminho.
7. Célula vazia diz **"não informado"**, e não há travessão em nenhum texto (§A.11).

## O MENU, e ele está fechado de propósito

O menu `divergencias-ingestao` nasce **só para o SUPER_ADMIN** (§A.23). Ninguém mais o tem, nenhum
seed foi rodado, e **quem libera quem enxerga é você**. Não aparecer para os outros **não é bug**.
Para validar, abra a URL direto.

**Isto foi um VETO da auditoria, e vale saber:** na primeira versão o menu não estava na lista de
marcação nominal do MASTER, e por isso os **3 MASTER de A&S** ganhariam a fila **sozinhos**, no
primeiro boot depois do deploy, com leitura de nome de candidato e as duas rotas de escrita. Não
dependia de ninguém clicar. Fechado com a entrada nominal, e o teste que trava a lista foi atualizado.

## O QUE FALTA, e é decisão sua

**A prova visual não foi feita, e eu não a fiz de propósito.** A homologação (3120) está **105
commits atrás** da `main`, o banco dela em **132** migrations (o repositório está em 137), e ela **não
tem a ponte para a admissão**, que foi construída hoje. Ou seja: a tela não compila lá sem trazer a
homologação para a `main`.

Isso é mudança grande num ambiente **compartilhado** com outras sessões, e a sua OST diz que só você
coordena. Então eu paro aqui e pergunto. As opções:

1. **Trazer a homologação para a `main`** (105 commits), aplicar as migrations 133 a 136 no banco dela,
   copiar os arquivos desta frente e reiniciar os dois serviços da homologação. É o caminho normal, e
   é o que faz a 3120 voltar a valer como ambiente único (§A.32). Custo: interrompe por alguns
   segundos quem estiver validando lá, e muda o que as outras sessões veem.
2. **Eu levanto um ambiente isolado só para a prova visual**, tiro as screenshots e mostro a você,
   sem tocar a homologação. Você valida depois, quando a homologação for atualizada. Custo: mais
   tempo, e você valida em dois momentos.
3. **Publicar direto em produção depois da sua validação por screenshot**, pulando a homologação.
   **Não recomendo**, e a §A.32 é contra: a 3120 existe justamente para o impacto cruzado entre
   frentes aparecer antes de a operação encontrá-lo.

**Minha recomendação é a 1**, avisando as outras sessões, porque a homologação 105 commits atrás já é
um problema por si: ela deixou de servir para o que existe.

---

# PROVA VISUAL FEITA (§A.13), em 30/09/2026 na 3120

Aberta com conta SUPER_ADMIN na homologação, com 6 linhas sintéticas semeadas (§A.43). A população
foi conferida antes: **15 de 15** candidatos com CPF da família 999 e e-mail de homologação.

## O que ficou provado

| conferência | resultado |
|---|---|
| As 9 colunas desenham sem esmagar | **nenhuma cortada**, nenhuma célula truncada, a página não rola na horizontal |
| Travessão na tela (§A.11) | **zero** |
| Cabeçalhos centralizados e ordenáveis (§A.12/§A.29) | presentes, com o indicador de ordenação em cada um |
| Cartões como filtro | **5 Pendentes · 1 Resolvidas · 3 Reincidentes**, batendo com a semeadura |
| Célula vazia | diz **"não informado"**, nas linhas de escopo VAGA que não têm candidato |
| Modal de adotar (§A.41) | mostra o de/para (`APROVACAO > TRIAGEM`), o candidato e a vaga, com **Cancelar** e **Adotar o Pandapé**. Cancelar não escreve |
| Campo não adotável | o botão **não é desenhado**; no lugar, cadeado com "Resolva na ficha do candidato" e "Resolva pela revisão da vaga" |
| A porta no menu | **"Divergências Da Ingestão" logo abaixo de "Central De Candidatos"**, no grupo Atração E Seleção |

## Três observações medidas, e nenhuma é impeditiva

**1. A coluna Ações exige rolagem horizontal abaixo de 1920px.** Medido em quatro larguras: a
1920 e 2560 ela aparece **inteira**; a 1600 faltam **126px** e a 1366, **360px**. Não é esmagamento
(a tabela rola em vez de espremer, que é o que a §A.12 manda), mas em notebook de 1366 o time precisa
rolar para alcançar os botões da fila, que é o ponto da tela. **Proposta, não feita:** apertar duas
colunas largas (Vaga e Valor No Pandapé) para caber em 1366.

**2. Os dois botões de ação são SÓ ÍCONE, sem rótulo.** Um "✓" e um "↩", lado a lado. O "↩" abre a
confirmação, então erro ali é contido; mas o **"✓" ("Manter o EA") resolve a linha na hora, sem
confirmação**, e tira a divergência da fila. Dois ícones sem legenda, um deles com efeito imediato, é
o tipo de coisa que gera clique errado na primeira semana. **Proposta, não feita:** rótulo ao lado do
ícone, ou ao menos o "✓" pedir confirmação.

**3. Em largura de celular a barra lateral toma o espaço.** A 390px sobram 142px para o conteúdo.
**Medido nas três telas: `/gerenciador`, `/esteira` e esta dão exatamente o mesmo número.** É
comportamento da casca compartilhada, anterior a esta frente e igual em todo o sistema, e por isso
**não foi tocado** (§A.14).
