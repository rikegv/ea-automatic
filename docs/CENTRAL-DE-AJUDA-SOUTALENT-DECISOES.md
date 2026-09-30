# Central De Ajuda, módulo SouTalent: o que foi construído e o que o diretor decide

> Frente de 30/09/2026. O módulo SOUTALENT tinha 1 peça de 29. Esta entrega escreve as 28 que
> faltavam. Este documento existe porque o pulso é curto de propósito (§A.42): aqui fica o detalhe,
> e lá fica a decisão numerada.

---

## 1. O que foi construído

28 artigos novos em `apps/frontend/src/ajuda/conteudo/soutalent/`, mais 3 blocos compartilhados em
`apps/frontend/src/ajuda/conteudo/familias/`.

| frente | peças | rota |
|---|---:|---|
| Central De Vagas, leitura e ciclo de vida da vaga | 12 | `/as/vagas` |
| O funil da vaga, o que se faz com o candidato dentro dela | 8 | `/as/vagas` |
| Fila de liberação de vaga | 2 | `/as/vagas-pendentes-revisao` |
| Central De Candidatos | 6 | `/as/candidatos` |

As três famílias novas, que são o bloco que todos os artigos de uma mesma tela têm igual:
`as-vagas` (a lista e o ciclo de vida), `as-funil` (o funil dentro da vaga) e `as-candidatos` (a
base de pessoas e a fila de revisão). Sem elas, o mesmo pré-requisito e o mesmo erro seriam escritos
28 vezes, e no primeiro ajuste alguém corrigiria 12 e esqueceria 16.

---

## 2. Os prints: VETADOS, e o motivo é DADO, não gate

O agente `seguranca` auditou o mapa ANTES da construção (§A.40) e vetou a captura de toda superfície
de A&S. O veredito não é sobre o gate estar frouxo: é sobre não haver o que fotografar e haver gente
real onde não deveria.

**Medido por mim, por consulta direta à homologação:**

| tabela | linhas |
|---|---:|
| `as_candidatos` | **0** |
| `as_candidaturas` | **0** |
| `as_ingestao_conflitos` | **0** |
| `vagas` | 3, sendo 2 lixo de teste aberto por pessoa real |

Toda lista de A&S está vazia. O motor recusa lista vazia por construção, e com razão: print de tela
vazia parece pronto, que é pior do que print faltando.

**Além disso, dois bloqueios que travam o lote inteiro, em qualquer rota:**

1. Uma linha em `candidatos`, criada em 29/09, com **CPF de verificador válido e e-mail corporativo
   real**. Enquanto ela existir, nenhum lote começa. E há uma consequência que a mensagem de erro
   não mostra: se a base fosse aprovada, aquele CPF e aquele e-mail entrariam na **allowlist**, ou
   seja, virariam conteúdo autorizado a aparecer em print.
2. Duas vagas de teste em `/as/vagas` abertas por uma usuária real do time, que aparece como
   consultora, como quem abriu e como quem enviou a shortlist. O gate recusa a imagem por isso, e
   **recortar não resolve**: o mesmo nome volta por três caminhos diferentes, e o filtro de consultor
   carrega o catálogo inteiro no documento mesmo fora da área visível.

**O que já está no repositório está limpo.** Abri o print commitado de A&S: a coluna de consultor
mostra "não informado" e só aparece a vaga sintética. As duas vagas sujas nasceram depois da captura.

**Consequência aceita nesta entrega:** os 28 artigos nascem SEM imagem, com o texto escrito para
funcionar sem ela. Os prints entram em entrega própria, depois das decisões abaixo.

---

## 3. As decisões do diretor

### 3.1 Dado da homologação (destrava os prints de A&S)

**D1. A linha suja em `candidatos`.** Sai ou é anonimizada. Identificável sem ambiguidade por
`nome = 'Candidato teste testando'` e `criado_em = 2026-09-29 15:29`. O CPF e o e-mail ficam fora
deste documento por escrito (§A.6). Enquanto ela existir, nenhuma captura acontece, em nenhuma rota.

**D2. As duas vagas de teste.** Duas saídas, e a escolha é do diretor:
- **apagar**, que é mais limpo, porque elas são lixo de teste com conteúdo sem sentido; ou
- **reatribuir** à conta sintética de captura, preservando a trilha da usuária, em quatro pontos:
  o consultor e o autor da abertura das duas vagas, e o autor de três shortlists.

**D3. O arnês de A&S.** Não existe. Precisa nascer sintético para os prints existirem: candidatos com
CPF de família declarada e telefone que não fecha verificador, candidatura em cada uma das sete
etapas do funil, candidatura encerrada, shortlist com itens, vaga cancelada, conflito de ingestão,
posição finalizada em reserva e contato registrado. Tudo atribuído à conta de captura, e tudo
declarado em `tools/ajuda/allowlist-arnes.json`, que hoje não tem uma linha de A&S.

**Nota de processo que vale mais que os três itens juntos:** as duas sujeiras nasceram de uso normal
da homologação, em dois dias. A asserção de população vai reprovar o lote toda vez que alguém testar
na 3120 antes de uma captura. Isso não é defeito, é o controle funcionando, mas significa que a
janela de captura precisa ser **combinada**, não improvisada.

### 3.2 Uma régua de gate que o diretor afrouxou e que o auditor pede de volta

**V1.** A tabela `as_candidatos` está marcada como `LIBERADA` na régua das colunas de pessoa, por ato
do diretor em 28/09, sobre uma medição de 13 linhas. `LIBERADA` significa que a fonte não é lida, não
reprova e não alimenta a lista de nomes que o gate procura. Somado ao detector genérico de nome estar
desligado (também por ato do diretor), o resultado é que **nome de candidato vindo daquela tabela não
tem um único controle no caminho até o PNG**.

O insumo novo, que não existia quando a decisão foi tomada: aquela tabela foi **expurgada de 410
pessoas reais em 29/09**, e a frente de ingestão que está sendo construída existe justamente para
enchê-la de candidato real. Hoje ela está em zero, ou seja, a amostra de 13 linhas que embasou a
liberação não descreve o futuro dela.

**O auditor pede a volta para `ASSERCAO`.** Não é afrouxamento nenhum, é reacender um controle. O
conserto é uma palavra num arquivo. É decisão do diretor porque a liberação foi ato dele.

### 3.3 Vetos de superfície, que ficam de pé mesmo depois de D1, D2 e D3

**V2. A ficha do candidato: NÃO FOTOGRAFA.** É a única tela de A&S que concentra identificação
completa, e não há recorte honesto: o painel de identificação é um bloco só, com CPF, telefone,
e-mail e nascimento em quatro dos seis campos, e o que sobraria no quadro traz nome de colega e texto
livre escrito pela operação. Há ainda um **falso negativo provado**: o telefone é desenhado sem
máscara ao lado do rótulo "Telefone" e **não produz achado nenhum** no gate, porque a regra de forma
não casa onze dígitos colados e não existe regra de rótulo para telefone. Levanta-se com máscara no
campo ou com regra de rótulo nova, mais arnês. Os dois são gate **mais** estrito, nunca menos.

**V3. A confirmação de envio para a admissão: NÃO FOTOGRAFA.** Desenha e-mail do candidato
parcialmente mascarado com o domínio em claro.

**V4. Lacuna a fechar antes de fotografar a trilha da vaga.** As colunas de CPF e nome do substituído
são desenhadas na tela e **não estão** na asserção de população. Estão nulas hoje nas três vagas, e é
exatamente por isso que fechar agora custa zero.

### 3.4 As duas telas de entrada, pendência antiga que ficou resolvível

O artigo de entrar no sistema é o único dos 37 sem imagem, e o comentário dele diz que a falta foi
reportada como pedido de um modo de captura sem sessão. Esse modo **foi construído depois**.

- **`/login`: LIBERADO**, com recorte no cartão do formulário, que sai vazio. Duas proibições duras
  no roteiro: nenhum gesto de digitar, e **nenhum clique no botão que mostra a senha**, porque ele
  troca o tipo do campo e derruba de uma vez as duas camadas que protegem senha em print.
- **`/trocar-senha`: VETADO**, e não por dado pessoal: aquela tela **não renderiza sem sessão**, então
  o print sairia sendo a tela de login gravada com o nome de arquivo da troca de senha. Print que
  ensina a tela errada passa por todos os gates sem nada falhar. A saída óbvia é a insegura, porque
  exigiria digitar credencial na única tela em que isso não pode acontecer.
- **Proposta, e é decisão do diretor:** o artigo fica com **um print só, o de `/login`**, e descreve a
  troca de senha temporária em texto.

### 3.5 O tamanho do inventário

O `arquiteto` mediu **33 peças** para cobrir bem as três telas de A&S, contra as 29 planejadas. Eu
construí **as 28 que a ordem de serviço pediu** (§A.14, §A.31) e dobrei as quatro excedentes como
passo dentro do artigo pai, sem perder cobertura de controle. Fica registrado caso o diretor queira
as quatro como artigo próprio depois: voltar o candidato para a seleção, desvincular da vaga, editar
as posições da vaga, e de onde a vaga e o candidato vieram.

### 3.6 O piloto, e é a pergunta que só o diretor fecha

`abrir-uma-vaga-nova` é anterior ao veto e tem **quatro prints já commitados**, na superfície que
agora está vetada. Eu conferi a imagem: ela está limpa, porque foi capturada quando a base estava
limpa. **Minha leitura, e eu a assumo: o veto vale para captura NOVA, não é retroativo, e os quatro
prints ficam.** Se o diretor entender o contrário, eles saem.

Ligado a isso: o piloto é hoje o único artigo do módulo **sem família declarada**. Declarar
`as-vagas` nele acrescentaria pré-requisitos e erros ao texto de um artigo **já validado**, então eu
não mexi (§A.26). É decisão do diretor.

---

## 4. Três furos da própria casa, achados pela cobertura independente

Não são desta frente, e nenhum está sendo explorado hoje. Ficam registrados porque foram medidos.

1. **A proibição de travessão não alcança o texto que vem da família.** A varredura lê o artigo cru,
   e o bloco herdado nunca passa por ela. Travessão escrito numa família chegaria ao leitor em todos
   os artigos daquela tela sem nada falhar. **Medi as 10 famílias: zero travessão em todas.** O furo
   existe, a violação não.
2. **Família inexistente não é conferida por ninguém**, embora o contrato afirme, letra por letra, que
   é. O dano seria silencioso: o artigo simplesmente perde o bloco, e a tela não quebra.
3. **Os rótulos de controle não entram na varredura de travessão**, e eles chegam ao usuário: é deles
   que sai o índice da ajuda contextual da tela.

O `tester` cobriu os três para o módulo SouTalent. Nos outros módulos as frestas continuam abertas.

---

## 5. Um achado de código, fora do escopo desta entrega

`apps/frontend/src/components/as/vagas/CandidatosDaVagaModal.tsx`, 161 linhas, **não é importado por
nenhum arquivo do aplicativo**. Conferido por varredura. É código órfão, não ganhou artigo, e a
remoção pede ordem de serviço própria (§A.31: propõe, não constrói).

---

## 6. Achados de PRODUTO, medidos pelos agentes ao ler as telas

Nenhum foi corrigido: a ordem de serviço é escrever o manual, e mexer em tela fora dela é o que a regra
de escopo fechado proíbe. Ficam propostos, com o lugar exato, para o diretor decidir.

| # | achado | onde | por que importa |
|---|---|---|---|
| 1 | Duas etiquetas fora de title case: "Aguardando supervisão" e "Liberada pela diretoria" | tela de Não Conformidades | viola a régua de title case em tag, que é decisão permanente |
| 2 | Valor ausente desenhado com travessão | `ApresentacaoIntegracaoModal.tsx:51` | viola a proibição permanente do travessão; o certo é "não informado" |
| 3 | "Previsão do ASO" é OBRIGATÓRIA e o rótulo não tem asterisco | janela de agendamento do exame | a pessoa preenche tudo e o salvamento é recusado por um campo que não parecia obrigatório |
| 4 | Comentário defasado diz que só Super Admin libera apto sem ASO | `esteira/page.tsx:2897` | o código aceita Master e Super Admin; o comentário faz a próxima sessão restringir errado |
| 5 | O carimbo de quando a notificação de assinatura saiu NÃO aparece na tela | Gestão Das Assinaturas | quem opera não consegue responder "o funcionário foi chamado?" sem sair da tela, e não há ação para reenviar só a notificação |
| 6 | O fornecedor da clínica pode bloquear o status do exame e não está na janela | agendamento do exame | a pessoa preenche tudo e é recusada por um dado que ela não vê |
| 7 | O contador de reagendamentos sobe em qualquer salvamento | agendamento do exame | corrigir só o valor do exame conta como reagendamento |
| 8 | Estágio sai do relatório da clínica em silêncio, e cada endereço vira uma linha | aba Exame | a contagem do arquivo não fecha com a seleção, nos dois sentidos |
| 9 | A trava de capacidade da troca de vaga mede o total contra a meta oficial | troca de vaga em A&S | mover alguém do banco pode ser recusado por meta oficial cheia, com reserva sobrando |
| 10 | A janela se chama "Reentrada Em Vaga Encerrada", mas o encerrado é o PROCESSO | A&S, reentrada | a vaga precisa estar ABERTA para receber alguém; o rótulo diz o contrário |
| 11 | `CandidatosDaVagaModal.tsx` não é importado por nada | A&S | código órfão, 161 linhas; remoção pede ordem de serviço própria |
| 12 | A tela antiga de kit continua alcançável por URL | `/kit` | fora do menu de propósito, mas não removida, por dependência conhecida do reenvio por correção |
| 13 | O catálogo de etapas do funil diverge entre produção e homologação | A&S | o mesmo código de etapa tem rótulo diferente nos dois bancos, e a medição de cobertura foi feita sobre a homologação |
| 14 | A célula de SLA escreve `entregue` em minúscula, e o filtro escreve "Vaga Entregue" | `lib/as-vaga-sla.ts:214` (célula) contra `SLA_ESTADO_LABEL` (filtro) | o mesmo estado tem dois nomes na mesma tela, e a minúscula contraria a régua de title case em tag; achado ao fotografar a coluna para o manual, e o texto do artigo teve de ser corrigido para descrever os DOIS nomes |

**Um achado de PROCESSO, e ele vale mais do que os treze:** a medição de cobertura que orienta o manual
é de 28 de setembro e **não conhece os 21 artigos do Soul ADM** escritos depois. Os números de controle
órfão por tela estão superestimados; as listas de rótulo continuam válidas. Vale remedir antes de fechar
a próxima onda, senão a régua de "cobri a tela inteira" é julgada contra uma foto velha.

---

## 7. POSSÍVEL DEFEITO, encontrado ao escrever o manual, NÃO corrigido

É o achado mais pesado desta frente, e ele não é de conteúdo: é de produto. Um agente o encontrou ao ler
o código para escrever o artigo de desconsiderar a integração, e teve a disciplina de NÃO afirmar nada
sobre ele no texto.

**Existem DUAS portas que carimbam o farol de admissão concluída, e elas não têm a mesma guarda.**

- A porta do seletor de status (`esteira.service.ts`, por volta da linha 1479) **segura** o carimbo
  quando o Exame está no status de liberado sem o atestado. A guarda existe de propósito.
- A porta do **desconsiderar a integração** (mesma classe, por volta da linha 2942) escreve
  `farol_global = 'ADMISSAO_CONCLUIDA'` **sem condição nenhuma**.

Pela leitura, desconsiderar a integração de uma admissão liberada sem atestado carimbaria "concluída"
com o Exame ainda aberto, que é exatamente o que a guarda da outra porta existe para impedir.

**Por que isso merece a sua atenção agora:** é a MESMA família do defeito de 11/08/2026, quando o
carimbo do farol dependia de uma frente nascer e 56 admissões passaram a ser contadas duas vezes, em
três telas. A pergunta "quem mais escreve este dado?" é a linha fixa de briefing que existe justamente
para pegar isto.

**O que eu NÃO fiz, e por quê:** não medi contra a base e não corrigi. Corrigir é mudança de produto
fora da ordem de serviço, e medir mexe em dado de produção. O caminho que eu proponho, se você
autorizar, é despachar o `backend` para medir e o `tester` para travar a regra em teste, antes de
qualquer correção.

---

## 8. PENDÊNCIA ABERTA pela reversão do mascaramento da senha do iFractal (30/09/2026)

Outra sessão está revertendo, **por ordem do diretor**, o mascaramento do campo de senha da aba
iFractal: ele volta a ser texto claro, porque o time precisa ler a senha para repassar ao candidato.
A decisão é dele e está registrada como regra própria no CLAUDE.md. O que segue é só o alcance disso
sobre o manual.

### O que eu CONFERI, e a conclusão é que NÃO há emergência

O primeiro medo era o pior: print já commitado com senha legível, porque imagem entra no repositório e
não sai. **Não é o caso.** Medições:

- As 3 imagens daquela tela foram gravadas em 28/09 e mostram **todos os campos de senha vazios**, só
  com o texto de apoio. Nenhuma credencial aparece.
- Na base da homologação existe **UMA** linha com senha gravada. Ela é da população **anonimizada**
  (nome no padrão "Candidato NNN Homolog") e a senha tem **3 caracteres**, ou seja, string de teste.
  Não é credencial de ninguém.

### O que fica pendente, e é de TEXTO, não de vazamento

1. **O artigo e o print dizem que a senha vem mascarada, e isso vira falso** no instante em que a
   reversão chegar. O artigo é `soul-adm/gerenciar-as-credenciais-do-ifractal.ts` e a etiqueta
   desenhada na imagem 02 diz, letra por letra, "A senha fica mascarada".
2. **Corrigir agora seria errado**, e é por isso que eu não corrigi: a reversão ainda não está na
   `main`, e a homologação, que é a fonte dos prints, continua com o campo mascarado. Recapturar hoje
   reproduziria a mesma etiqueta. **A correção é uma entrega própria, depois de a reversão pousar**, e
   ela é pequena: trocar o texto do passo, trocar a etiqueta do roteiro e recapturar as 3 imagens.
3. **A captura daquela aba passa a exigir cuidado novo.** O filtro de dado pessoal só ignora campo de
   senha enquanto ele é do tipo senha. Virando texto, o filtro passa a LER o valor, e a regra de
   rótulo deve recusar a imagem. **Isso é o comportamento certo e não deve ser afrouxado.** As saídas
   legítimas são duas: recorte que deixe a coluna de senha fora do quadro, ou arnês com credencial
   sintética declarada.

### A distinção que precisa sobreviver a esta frente

A decisão do diretor é sobre a **TELA**: a senha fica visível para quem opera, e isso deixa de ser
tratado como achado de segurança. Ela **não** se estende ao **PRINT**, e a diferença não é formalismo:
a pessoa na tela é o time com acesso e com o documento de proteção de dados assinado; o arquivo no
repositório é qualquer um que clone o projeto, para sempre. Quem for corrigir o artigo precisa manter
as duas réguas separadas, senão a próxima sessão lê a regra nova como licença para fotografar senha.

---

## 9. PENDENTE: os renomeios da Central De Vagas alcançam o manual (aviso de 30/09/2026)

> **ESTA SEÇÃO TEM UM PAR: `docs/PUBLICACAO-PENDENTE-DAS-DUAS-FRENTES.md`**, escrito pela frente
> vizinha, com o protocolo de publicação conjunta. As duas descrevem a MESMA pendência por ângulos
> diferentes: aqui está o que muda no manual, lá está como as duas frentes sobem juntas.
>
> **Quem mexer numa, lê a outra.** Registro duplicado que ninguém costura é registro que diverge, e
> aí a próxima pessoa segue o que estiver mais à mão, que pode ser o desatualizado. É o mesmo modo de
> falha que a família de artigos existe para impedir, aparecendo em documento em vez de em código.
>
> **O combinado, em uma linha:** a frente vizinha avisa quando estiver PRONTA para publicar (não no
> momento de publicar), eu corrijo os cinco arquivos e recapturo contra o código dela, e sobe tudo
> numa janela só. Se a janela dela for curta demais, aceito a defasagem, mas exijo o aviso no
> momento da publicação, não depois.

Uma frente vizinha renomeia rótulos de tela da Central De Vagas. **Os textos abaixo ainda NÃO foram
corrigidos, e isso é deliberado:** o renomeio está no código e **não está publicado na homologação**,
que é a fonte dos prints. Corrigir agora faria o manual mentir sobre o que está no ar, e recapturar
reproduziria o rótulo velho. É o mesmo erro que esta frente já pagou hoje com o campo de senha.

**Corrigir QUANDO a frente vizinha publicar na 3120, e não antes.**

### O que muda

| era | passa a ser |
|---|---|
| Mover No Funil Em Massa | **Mover Etapa Em Massa** |
| Nome De Divulgação | **Nome Da Vaga** |
| Natureza | **Tipo De Vaga** |
| Sazonalidade | **Tipo De Processo** |
| Linha De Serviço (no formulário da vaga) | **Célula De Atendimento** |

Mais um ajuste de ordem: no cadastro de candidato novo, **UF passa a vir ANTES de Cidade**, e Cidade
vira seletor com busca.

### Os arquivos a tocar, quando chegar a hora

`soutalent/revisar-uma-vaga-pendente-de-revisao.ts` · `soutalent/corrigir-a-liberacao-de-uma-vaga-revisada.ts`
· `soutalent/abrir-uma-vaga-nova.ts` · `soutalent/agir-em-massa-no-funil-da-vaga.ts` ·
`soutalent/cadastrar-um-candidato-novo.ts` (a ordem dos campos).

### DUAS ARMADILHAS, e as duas fazem alguém "consertar" o que está certo

1. **O modal INDIVIDUAL continua "Mover No Funil"**, sem "Em Massa". Só o de LOTE foi renomeado.
   Então `mover-o-candidato-de-etapa` (artigo e roteiro) **está correto como está** e não se toca.
2. **A tela de catálogo e o menu continuam "Linhas De Serviço"**, de propósito: nome de menu é decisão
   do diretor, e a frente vizinha não a tomou. Ou seja, o sistema diz **"Célula De Atendimento"** no
   formulário da vaga e **"Linhas De Serviço"** no menu, ao mesmo tempo, até ele decidir. Os artigos
   `configuracao/o-catalogo-de-linhas-de-servico.ts` e
   `configuracao/reordenar-e-apagar-um-item-de-catalogo.ts` **estão certos** e NÃO devem ser
   "atualizados" para o nome novo.

### O que JÁ foi feito, porque não dependia da publicação

O roteiro `agir-em-massa-no-funil-da-vaga` apontava a janela pelo **título**, que é justamente o que
mudou. Foi reancorado no seletor de etapa de destino, que é **o que aquela janela faz** e não como ela
se chama. O alvo novo funciona contra o build antigo E contra o novo, então ele não precisou esperar a
publicação. Conferido três vezes seguidas, verde nas três.

**A régua que sai daqui, e ela já valeu três vezes num dia só:** alvo preso à REDAÇÃO quebra quando
alguém melhora a redação, e melhorar a redação é trabalho normal. Ancore no papel, na função ou no
comportamento, nunca no texto. Os três casos de hoje foram o tipo do campo de senha, a rota de exemplo
de dois testes, e agora o título de um modal.
