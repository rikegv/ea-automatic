# Plano De Correção Do Balde Do VT

**O que é:** o plano da frente que o diretor mandou abrir, liderada pela Segurança, sobre o achado do
parecer `docs/PARECER-SEGURANCA-TROCA-MODELO-VT.md`, seção 4. **É produção viva.** É PLANO, não
execução: nada foi executado contra a produção do VT nesta auditoria, e o agente não tem escrita
(§A.39). **Gravado pelo coordenador.** **Data:** 18/09/2026.

**NÃO TRAVA O PORTAL.** As duas frentes não compartilham balde, identidade nem código. A única coisa que
compartilham é a lição.

**Os quatro defeitos, todos medidos:**

| # | defeito | evidência |
|---|---|---|
| D1 | nome e CPF sem máscara **no nome do objeto**, que vai para o registro de acesso do Google | `/home/henrique/vt-online-soulan/functions/main.py:204-206` e `:214-216` |
| D2 | o escritor é **administrador de objeto** (lê, lista, sobrescreve e apaga o balde inteiro) | `/home/henrique/vt-online-soulan/README.md:85` e `:133` |
| D3 | a leitura usa a **credencial unificada de Drive e Vertex** | `apps/ai-service/app/gcs.py:31-43`, escopo somente leitura no cliente, papel amplo na identidade |
| D4 | **sobrescrita silenciosa**: nome determinístico, sem trava de geração | `/home/henrique/vt-online-soulan/functions/main.py:293` |

**Uma boa notícia, medida, que encolhe o problema:** o nome e o CPF que entram no nome do objeto vêm dos
**claims do token assinado pelo EA** (`main.py:365` e `:375`), e **não** do corpo que o navegador manda.
Não há, portanto, nome de objeto controlado pelo candidato, nem travessia de caminho, nem gravação por
cima do arquivo de outra pessoa a pedido de quem envia. O defeito é de **conteúdo do nome**, não de
controle do nome. Isso também aponta o conserto: **quem já escolhe o que vai no nome é o EA**, e basta
ele passar a escolher outra coisa.

---

## 1. Tirar A PII Do Nome Do Objeto (D1)

### 1.1 O Que Quebra No EA Quando O Nome Mudar, Com Arquivo E Linha

O nome do objeto hoje é **a única chave de identidade** que o EA tem. Quatro consumidores, todos
listados:

| consumidor | linha | o que faz com o nome |
|---|---|---|
| extrator de CPF | `apps/ai-service/app/drive.py:591-605` | tira os 11 dígitos do fim do nome. **É assim que o EA sabe de quem é o formulário** |
| listagem da coleta | `apps/ai-service/app/routers/coleta_vt.py:47` | chama o extrator e devolve o CPF ao backend |
| diagnóstico de órfão | `apps/ai-service/app/routers/coleta_vt.py:117-118` | chama o extrator e o separador de nome (`:126-136`) para mostrar a pessoa na tela |
| irmão em JSON | `apps/ai-service/app/routers/coleta_vt.py:82` | troca o sufixo do PDF pelo do JSON, **derivado do lado do EA** |

E no backend: `vt-coleta/vt-coleta.service.ts:258-270` casa o CPF com as admissões vivas, `:391-397`
filtra a varredura de uma admissão pelo CPF, e `vt-coleta/orfao-vt.service.ts` consome o diagnóstico.

**Traduzindo sem rodeio: mudar o nome do objeto cega o casamento do VT inteiro.** Quatro pontos de
código param de encontrar o dono do arquivo, e o formulário vira órfão permanente.

**O que NÃO quebra, e é o que torna a transição segura:** a identidade do arquivo no ledger é o **md5**,
nunca o nome (`vt-coleta/vt-coleta.service.ts:717-724`, e a restrição de unicidade por md5 e origem em
`db/schema/tables.ts:1511`). O nome do objeto **jamais é persistido**. Portanto **renomear um objeto
existente não faz o EA recoletá-lo**, e não gera duplicata. Este é o fato que sustenta o item 7.

### 1.2 O Nome Novo, E Quem O Escolhe

**O EA escolhe o nome inteiro e o carrega DENTRO do token**, no mesmo princípio do Portal
(`apps/backend/src/domain/portal-credencial.ts:178-181`: o nome é escolhido por nós). A função deixa de
derivar nome: ela usa o que veio no claim. Isso elimina D1 na origem e ainda tira uma regra do
repositório de fora.

**Forma proposta:** um primeiro segmento opaco derivado do **id da admissão** com pepper, mais um sorteio
e a extensão, exatamente o molde de `portal-credencial.ts:178-181`. O irmão em JSON é o mesmo nome com o
sufixo trocado, e a derivação em `coleta_vt.py:82` continua funcionando sem mudança.

**Por que o id da admissão e não o CPF nem o identificador do link:** o id da admissão já viaja no token
(`vt-coleta/vt-link-token.ts:53-65`), e o EA consegue reconstruir o mesmo valor opaco para cada admissão
viva e montar o mapa na varredura. O identificador do link **não serve**: ele não é persistido em lugar
nenhum, então o EA não teria como voltar dele para a pessoa.

**Ganho colateral que vale registrar:** o casamento passa a ser **direto com a admissão**, em vez de por
CPF contra o conjunto de admissões vivas (`vt-coleta.service.ts:413-446`). Some a ambiguidade de
candidato com mais de uma admissão viva.

**Duas consequências a aceitar de olhos abertos, porque elas são o preço:**
1. **A tela de órfão perde o nome da pessoa lido do arquivo.** Ela passa a resolver o nome pelo id da
   admissão, no banco, que é melhor: hoje ela exibe nome lido de fora da base (`coleta_vt.py:117-118`).
   Formulário de alguém que o EA não conhece deixa de ter nome exibível, o que é o comportamento correto
   (§A.6, minimização).
2. **O pepper do nome não pode rotacionar.** Rotacionar renomeia tudo em silêncio. Pepper próprio,
   documentado como não rotacionável, separado de qualquer pepper de log.

### 1.3 A Transição Sem Perder O Que Já Está Gravado

**Janela de convivência, e o leitor aceita OS DOIS FORMATOS.** Nada de virada seca.

1. O extrator ganha uma segunda régua: nome no padrão novo devolve o segmento opaco; nome no padrão
   antigo continua devolvendo CPF, exatamente como hoje. **O padrão antigo continua a funcionar enquanto
   existir um objeto antigo no balde.**
2. A função passa a gravar só no padrão novo.
3. O padrão antigo só é removido do leitor quando o balde não tiver mais nenhum objeto antigo, o que é
   verificável por listagem.

Sem isso, todo formulário já enviado e ainda não casado vira órfão no instante da subida.

---

## 2. Rebaixar O Escritor (D2)

De administrador de objeto para **criador de objeto**, na identidade de runtime da função, no balde.

**O que a função faz hoje e continua fazendo:** criar objeto (`main.py:293` e o irmão em JSON).
**O que ela perde:** ler, listar, sobrescrever e apagar o balde inteiro. **Nada no código da função usa
nenhuma dessas quatro.** Este é o passo de menor risco e maior ganho da frente inteira, e por isso ele
vem cedo na ordem.

**Ressalva de ordem, e é a única que importa:** criador de objeto **não sobrescreve**. Enquanto o nome
for determinístico (item 1) e alguém reenviar o formulário, o segundo envio passa a FALHAR onde hoje
sobrescrevia. Com o nome novo carregando um sorteio, cada envio é objeto novo e a questão some. **Por
isso o item 2 não vai ao ar antes do item 1 estar valendo**, ou vai junto com ele.

---

## 3. Leitura Dedicada (D3)

Hoje o EA lê o balde do VT com a **mesma** identidade que serve Drive e Vertex
(`apps/ai-service/app/gcs.py:31-43`). O escopo do cliente é somente leitura, o que é bom, mas isso é
propriedade da **configuração do cliente**, não da **identidade**: a mesma conta, carregada em outro
ponto com escopo cheio, escreve. É o mesmo formato de dano do veto V3.

**O que fazer:** identidade de LEITURA própria, com visualizador de objeto **apenas** no balde do VT, sem
nenhum papel em Drive e sem nenhum papel em Vertex. O carregamento da credencial em `gcs.py:31-43` passa
a apontar para o caminho dela, no mesmo molde de `apps/ai-service/app/portal_bucket.py`, que já nasceu
certo.

**Não reusar `gcs.py` para o Portal**, em hipótese nenhuma, e vale o contrário também: o leitor do Portal
não empresta a sua conta para o VT.

**Corrigir junto a documentação que induz ao erro:** `portal_bucket.py:10-11` ainda afirma que o leitor
do Portal usa a credencial unificada. O código não usa. Com o VT ao lado, esse comentário é instrução
para a próxima pessoa fazer exatamente a coisa errada.

---

## 4. Proibir Sobrescrita Silenciosa (D4)

Trava de geração zero nas duas chamadas de envio da função (`main.py:293` e o irmão em JSON). Grava só se
o objeto ainda não existir; objeto existente devolve conflito em vez de apagar o que estava lá.

**Isto é defesa em profundidade, não a defesa principal.** A defesa principal é o nome com sorteio (item
1), que torna a colisão praticamente impossível. A trava existe para o caso em que a colisão aconteça
mesmo assim: sobrescrever é apagar prova sem que nada falhe, que é o padrão de dano da §A.33.

**Tratamento do conflito:** o formulário já está no balde, então o candidato **não** pode receber erro.
Conflito vira aviso no registro da função e resposta de sucesso, no mesmo espírito com que o irmão em
JSON já falha sem derrubar o PDF (`main.py:375-378`).

---

## 5. A Ordem Segura De Execução, Em Produção Viva

**Etapa 0, ANTES DE QUALQUER COISA: o backup, e ele é manual.** `/home/henrique/vt-online-soulan` **não é
repositório git**. Não há histórico para voltar, e o backup é o **único** caminho de volta do código.

O backup tem três partes, e nenhuma é dispensável:
1. **Cópia integral e datada da árvore do projeto**, fora dela, incluindo `functions/main.py`,
   `functions/vt_pdf.py`, `functions/vt_token.py`, `functions/requirements.txt`, `firebase.json` e
   `README.md`. **Sem o ambiente virtual e sem o `functions/.env`**: o `.env` carrega segredo e não entra
   em cópia espalhada. Se for copiado, é para um destino com permissão restrita, dito por escrito.
2. **Registro do estado atual do IAM e do ciclo de vida do balde**, lido antes de mudar qualquer papel.
   Sem isso não há como reverter uma concessão nem provar o que havia antes.
3. **Inventário do balde**: quantos objetos, quantos no padrão antigo, quantos no novo (zero, no início).
   É a linha de base que o item 7 e a prova final usam.

**A ordem, do menos arriscado ao mais arriscado, com o critério de reversibilidade em cada passo:**

| ordem | passo | reversível? | por que aqui |
|---|---|---|---|
| 1 | **Leitura dedicada** (item 3) | **sim**, trivial: reapontar o caminho da credencial | não toca a escrita, não toca o nome, não toca o que já está gravado. Ganho imediato e risco quase nulo |
| 2 | **Leitor aceita os dois padrões de nome** (item 1.3, só a régua de leitura) | **sim** | é preparação pura: nada muda de comportamento, porque ainda não existe nome novo |
| 3 | **Nome novo escolhido pelo EA e gravado pela função** (item 1) mais **trava de geração** (item 4) | **sim**, voltando a função para a cópia do backup | os dois juntos porque o item 4 depende do sorteio do item 1 para não transformar reenvio em erro |
| 4 | **Rebaixar o escritor** (item 2) | **sim**, reconcedendo o papel | depois do passo 3, senão reenvio passa a falhar sobre nome determinístico |
| 5 | **Dado já gravado** (item 7) | **o apagamento não é reversível**. Ver item 7 | por último, sempre, e só depois de o fluxo novo estar provado |

### Como Provar Que O VT De Hoje Não Quebrou

A prova é de ponta a ponta, com um formulário de teste, e ela vale por passo, não só no fim. Depois de
cada passo de 1 a 4:

1. Um envio novo de teste chega ao balde, com o nome no formato esperado daquele passo.
2. O irmão em JSON chega junto e continua sendo achado pela derivação de `coleta_vt.py:82`.
3. A coleta do EA **casa** o formulário com a admissão de teste e arquiva no Drive, que é o efeito que a
   operação enxerga.
4. **Um objeto no padrão ANTIGO, já existente, continua sendo casado.** Esta é a prova que a janela de
   convivência existe para dar, e ela é a que ninguém lembra de fazer.
5. O registro da função não traz nome nem CPF em nenhuma linha nova (§A.6).

**Critério de parada:** qualquer um dos cinco falhando, o passo volta pelo backup antes do passo
seguinte. Não se empilha passo sobre prova vermelha.

---

## 6. O Que É Do Diretor E O Que É Da Fábrica

**Do diretor, porque a fábrica não se autoconcede acesso (§A.0):**
1. Criar a identidade de LEITURA dedicada e conceder-lhe visualizador de objeto **só** no balde do VT.
2. Rebaixar a identidade de runtime da função de administrador para criador de objeto.
3. Decidir e aplicar o destino do dado já gravado (item 7), que inclui apagamento.
4. Confirmar o prazo do ciclo de vida do balde como rede de proteção declarada, e registrá-lo como
   exceção explícita, com o motivo.
5. A pergunta do antivírus, que continua aberta do parecer anterior: quem varre um balde em projeto
   nosso.

**Da fábrica:** toda a mudança de código (o nome escolhido pelo EA e carregado no token, a janela de
convivência no leitor, a trava de geração, o apontamento da credencial de leitura), o backup da etapa 0,
o inventário do balde, a execução das provas e o registro do resultado.

**Nenhum passo da fábrica depende de credencial nova**, e nenhum passo do diretor depende de código
pronto, com uma exceção: o passo 4 da ordem (rebaixar o escritor) só acontece **depois** de o passo 3
estar no ar.

---

## 7. O Dado Já Gravado, Item Por Item

Os objetos que já estão no balde continuam carregando nome e CPF no nome. Nenhuma das quatro correções
alcança o passado. Três destinos possíveis, e eles não são equivalentes:

**RENOMEAR: recomendado para o que ainda não foi casado.**
Renomear é copiar com nome novo e apagar o antigo, e ele **funciona sem perda**: o ledger é indexado pelo
md5 (`vt-coleta.service.ts:717-724`), o conteúdo não muda, o md5 não muda, e a coleta **não recoleta nem
duplica**. É o único destino que tira a PII do nome e preserva o arquivo. Exige, temporariamente,
permissão de escrita e remoção, que não deve viver na função: é operação nossa, pontual, com identidade
própria, e a permissão sai no fim.

**APAGAR: recomendado para o que já foi arquivado no Drive.**
Formulário já casado e arquivado no Drive **já cumpriu a função do balde**. O balde é transporte, e o
prontuário é o Drive. Apagar o objeto transportado é o expurgo que a §A.6 pede e que hoje não existe em
lugar nenhum do caminho do VT. **É irreversível**, então ele só acontece contra a lista dos que
comprovadamente têm o par no Drive, conferida uma vez e registrada, e nunca sobre o balde inteiro.

**DEIXAR EXPIRAR: aceitável só para o resto, e com a exceção registrada.**
Objeto que não casou com ninguém e que a tela de órfão ainda pode precisar mostrar. Deixar o ciclo de
vida levá-lo é aceitável **desde que** o prazo esteja registrado como exceção explícita pelo diretor, com
o motivo. Enquanto ele não expira, o nome com PII continua aparecendo em listagem e em registro de
acesso, e isso precisa estar dito, não subentendido.

**O que NÃO fazer, e vale dizer porque é o atalho tentador:** não apagar o balde inteiro para começar
limpo. Formulário não casado é trabalho que alguém já fez e que a tela de órfão existe para resgatar, e
apagá-lo joga sobre o candidato o custo de preencher tudo de novo.

**Nenhuma das três alternativas alcança o que já foi para o registro de acesso do Google.** Esse registro
tem o prazo dele e não é editável por nós. Fica dito, sem maquiagem: a correção impede que novos nomes
com PII entrem lá; ela não desfaz os que já entraram.

---

**Reauditar quando:** os passos 1 a 4 estiverem no ar, com as cinco provas da seção 5 registradas, e o
destino do item 7 decidido pelo diretor. O veto cai contra evidência, nunca contra declaração.
