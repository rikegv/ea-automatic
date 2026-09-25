# Frente: envio do link do Portal (automático + manual, por e-mail)

Documento de detalhe da OST da lógica de envio. O pulso traz só a conclusão e as decisões.
Prints em `scratchpad/prints/`; mapa de alcance em `scratchpad/MAPA-ENVIO-LINK.md`.

## 1. As quatro decisões que o diretor tomou nesta frente

1. **Canal:** Gmail API com service account, reusando a delegação de domínio que já roda em
   produção no Drive. Escolhido porque não tem rastreamento de clique nem reescrita de link, que
   era a condição de segurança para pôr a URL do portal dentro de um e-mail.
2. **Caminho 1 (automático) ESPERA a ponte A&S -> Esteira.** Tudo foi construído; enquanto a
   candidatura não tiver admissão, o envio recusa com `SEM_ADMISSAO` e não emite nada. Liga sozinho
   no dia em que a outra frente escrever `as_candidaturas.admissao_id`.
3. **O lote dispara com lista nominal antes** (nome + destino mascarado por pessoa, e quem fica de
   fora aparece separado).
4. **Reverter o envio revoga o link.**

## 2. O que foi construído

**Backend.** Migration `0122` (quatro colunas de carimbo do envio em `portal_links`, nenhuma de
endereço). `domain/portal-envio.ts` (máscara, validação, frases de recusa, corpo do e-mail).
`portal-correio.service.ts` (Gmail API por service account, sem dependência nova: `node:crypto` +
`fetch`). `portal-envio.service.ts` (a orquestração). `PortalEnvioController`, sob
`esteira/portal/envio`, reivindicada nominalmente no menu. O gancho no ramo de
`ENVIADO_PARA_ADMISSAO` de `registrarSaida`, e a revogação em `reverterEnvioParaAdmissao`.

**Frontend.** A frase do diretor nos três lugares onde se envia para admissão; a prévia nominal no
modal do lote; no Gerenciador do Portal, o envio por e-mail na linha e o botão "Enviar link" do
topo, que é a porta que faltava.

**A porta que faltava, e ela não era óbvia.** A lista do Gerenciador sai de `from(portal_links)`, ou
seja, só mostra quem JÁ tem link, e a emissão só era clicável a partir de uma linha dela. Não havia,
em tela nenhuma, por onde nascer o PRIMEIRO link de uma admissão: os links da homologação tinham
sido semeados por script. O caminho 2 da OST pedia exatamente essa porta. Ela nasceu como BUSCA em
modal próprio, e não como alargamento da lista, para não encostar nos cinco contadores, nos filtros
nem na paginação, que são código validado (§A.26).

## 3. A ordem do envio, que é a regra que mais importa

1. resolve o destinatário e valida o e-mail; vazio ou inválido, RECUSA **sem emitir link nenhum**;
2. canal não configurado, RECUSA **sem emitir link**;
3. só então emite;
4. se o envio falhar, **revoga o link recém-emitido** e devolve `FALHA_NO_ENVIO`;
5. sucesso, grava os carimbos e a trilha.

O passo 1 antes do 3 é o coração: emitir e não entregar deixaria credencial viva que ninguém
recebeu, e a emissão REVOGA os links anteriores da admissão, ou seja, mataria a sessão de quem
estivesse enviando documento naquele instante.

## 4. A abstenção, que foi um achado do tester

Admissão que já tem link vivo e que o candidato JÁ ABRIU não é reemitida: o sistema se abstém
(`LINK_VIVO_EM_USO`). Antes desse código a abstenção voltava sem motivo e a tela lia "falhou" no
caso mais comum dos seis. O texto e a cor foram corrigidos: azul informativo, não amarelo de
pendência, porque é o único dos seis em que não há problema nenhum.

## 5. O que foi medido contra o servidor real da homologação

| prova | resultado |
|---|---|
| e-mail vazio, POST de envio | `{"enviado":false,"motivo":"SEM_EMAIL"}` e **zero** linhas em `portal_links` |
| canal sem credencial, POST de envio | `{"enviado":false,"motivo":"CANAL_INDISPONIVEL"}` e **zero** linhas |
| busca `sem-link` sem termo | `[]`, não despeja lista nominal |
| busca `sem-link` com termo | devolve destino MASCARADO (`c****6@homolog.local`) |
| log do backend depois dos envios | nenhum endereço, nenhuma URL, nenhum token |
| botão de enviar quando o sistema sabe que não vai | **desabilitado**, com a tag do motivo ao lado |
| suíte completa | backend 4.890 e frontend 844, zero falha |

## 6. Quem rodou, e o veredito de cada um (§A.38)

| agente | o que fez | veredito |
|---|---|---|
| `seguranca` (1) | auditou o MAPA antes da primeira linha de código | VETADO, com 20 exigências (S1..S20) que viraram o briefing |
| `Explore` | varreu o repositório atrás de canal de e-mail | NÃO existe; só a Clicksign envia, e é ela quem envia |
| `backend` (3 rodadas) | migration, domínio, correio, serviço, rotas, gancho, reverter | entregue |
| `frontend` (3 rodadas) | os três modais, a prévia do lote, a porta do Gerenciador, a cor | entregue |
| `tester` | cobertura escrita a partir do requisito, EM PARALELO à construção | 122 testes, 3 gaps reais, um deles defeito de credencial órfã |
| `seguranca` (2) | auditoria do CÓDIGO | VETADO, 12 achados; todos endereçados |
| `devops` | publicou na homologação com backup e rollback | 3120 no ar, produção intacta |
| coordenador | mapa de alcance, contrato compartilhado, as decisões, a prova visual | |

**O `arquiteto` não foi acionado**, e o motivo: o mapa de alcance já tinha o desenho, e um plano a
mais custaria uma rodada serial sem acrescentar achado (§A.40).

## 7. Os achados que a auditoria pegou e que teriam chegado à operação

- **credencial órfã:** o envio que LANÇASSE (em vez de devolver falso) deixaria link vivo por 72h
  que ninguém recebeu, com o anterior já revogado, e o gancho engoliria a exceção. Nada falharia.
- **rota de disparo sob `portal/`:** é o prefixo que a barreira do Fernando allowlista para a
  internet. Movida para `esteira/portal/envio`.
- **`MenuGuard`:** operação que nenhum menu reivindica passa LIVRE. Uma controller nova nasceria
  disparável por qualquer sessão autenticada, e o que ela faz é emitir E entregar credencial.
- **reverter não revogava:** o consultor desfazia o envio e o link seguia vivo na caixa do candidato.
- **o comentário do `as.module.ts` mentia:** dizia que entrava uma porta só; entram três, porque o
  Nest torna injetável tudo o que o módulo exporta. Agora há teste travando o uso.
- **colisão de rota:** `candidaturas/enviar` casava com `:admissaoId/enviar` e morria em 400.

## 8. O que ficou de fora, de propósito (§A.31: propõe, não constrói)

- **Coluna de origem (manual/automático) no Gerenciador.** O dado é gravado; a coluna não foi
  criada porque o diretor não a pediu. Se ele quiser, ela nasce com filtro e ordenação (§A.37).
- **A emissão manual antiga** (o "gerar link" que copia a URL) não carimba origem: link nascido por
  ali aparece no Gerenciador com origem vazia.
- **Janela de idempotência do envio.** Dois cliques seguidos sobre admissão cujo link ainda não foi
  aberto mandam dois e-mails. A direção da falha é segura (sobra e-mail com link MORTO, não
  credencial viva a mais), mas a exigência ficou meio cumprida e quem decide é o diretor.
- **As quatro rotas antigas de `portal/links`** (emitir, revogar, bloquear, desbloquear) já moravam
  sob `portal/` antes desta frente. Se a allowlist do Fernando for por PREFIXO e não por CAMINHO,
  elas já estão expostas hoje. É frente própria.

---

# RODADA 2, os bugs do Gerenciador e os ajustes aprovados (21/09)

## 9. O bug principal: os contadores estavam CERTOS, quem discordava era o recorte

O diretor viu "Acessaram 2" e a tabela zerar ao clicar. Medi os cinco contadores um a um contra as
três linhas da homologação: **todos corretos**. O defeito era outro, e em outro lugar.

- Os CONTADORES contam o recorte inteiro, as duas abas juntas.
- A TABELA é cortada pela ABA no servidor, e a aba padrão é "Em Andamento".
- O CARD, ao ser clicado, filtrava no CLIENTE, sobre a página que a aba já tinha cortado.

Os dois que tinham acessado já haviam concluído, ou seja, estavam na OUTRA aba. Clicar em
"Acessaram" filtrava para fora o único da aba corrente e a tabela zerava. Número certo, tabela
vazia, e nenhuma forma de descobrir isso olhando a tela.

**Havia um segundo defeito no mesmo ponto, que a base pequena escondia:** filtrando no cliente
sobre no máximo 100 linhas, o card passaria a recortar só a primeira página assim que houvesse mais
de 100 encaminhados, mentindo em silêncio (§A.28).

**A correção:** o recorte do card virou parâmetro do SERVIDOR, e **quando há card aceso a aba não
se aplica**, varrendo tudo, finalizados incluídos. As abas ficam visivelmente suspensas, com a
frase dizendo por quê. `contarPainel` foi reescrito para usar a MESMA função pura do card
(`noCard`), então não existe mais nenhuma condição escrita à mão nos dois lugares para divergirem
de novo. Recorte desconhecido devolve **400** em vez de cair em "todos", que devolveria mais linhas
do que o pedido apresentando-as como filtradas.

**Medido depois da correção, na 3120:**

| card | contador | total da tabela |
|---|---|---|
| Acessaram | 3 | **3** |
| Não Acessaram | 2 | **2** |
| Concluíram | 3 | **3** |
| Intervenção Humana | 1 | **1** |

## 10. O "último acesso não marca": NÃO era bug, e a prova é de laboratório

O carimbo funciona. Identifiquei de verdade o Candidato 304 no portal da homologação às 14:18:40, e
`primeiro_acesso_em` e `ultimo_acesso_em` foram gravados no mesmo segundo. O que havia era outra
coisa: ele **nunca tinha entrado no portal**. A régua dele aparecia 6/6 COMPLETA porque os
documentos foram entregues pelo consultor via Esteira, não pelo candidato. A tela estava dizendo a
verdade, e a confusão nasce de "régua completa" e "entrou no portal" serem coisas diferentes.

## 11. Os demais itens

- **Centralizar Cliente, Cargo e Documento Atual:** feito (§A.12). Só alinhamento, sem mexer em largura.
- **Coluna de Origem:** nasceu com célula, ORDENAÇÃO e FILTRO multiselect, as três juntas (§A.37),
  com catálogo vindo do endpoint e opção própria para o link antigo sem origem. A origem é a do
  link VIGENTE, nunca um `max` sobre todos os links da admissão (que devolveria a origem de um link
  revogado).
- **Modal do olho:** novo, de leitura, nove campos, "Fechar", não fecha ao clicar fora. **Sem CPF,
  sem e-mail, sem telefone, sem URL**, e a lista de campos mora fora da tela, sem token e sem
  chamada, então não há por onde buscar campo em outro endpoint.
- **Uniformizar a emissão antiga:** o "gerar link" passou a carimbar **`ENTREGA_A_MAO`**, código
  próprio e não `MANUAL`. `MANUAL` quer dizer "o RH enviou por e-mail"; aquele caminho não manda
  e-mail nenhum, devolve a URL para alguém entregar por fora. Ele carimba a origem mas **não**
  `enviado_em`, e essa distinção importa: carimbar ligaria a janela do item seguinte para um e-mail
  que ninguém mandou.
- **Janela de bloqueio: 3 minutos**, decidida dentro da transação, sob a mesma trava da emissão.
  Cobre o clique duplo e a retentativa de rede sem atrapalhar o reenvio por decisão. Recusa dentro
  da janela é abstenção com código próprio (`ENVIADO_HA_POUCO`), não erro, e a frase diz para
  esperar, não que falhou.
- **Remetente dedicado:** é configuração, já existe e está vazia. O canal continua INERTE.

## 12. A auditoria desta rodada

`seguranca`: **APROVADO**, com quatro ressalvas, nenhuma bloqueante. Ele provou o que mais
importava: **os cinco contadores continuam corretos depois de `contarPainel` ser reescrito**,
demonstrando que a régua nova e a antiga são equivalentes por construção.

Uma ressalva foi corrigida na hora (o catálogo dizia "Sem Origem" e a célula dizia "não informado",
duas palavras para o mesmo estado). As outras três estão na lista de decisões do diretor.

## 13. O estado da homologação depois desta rodada

Alterei dado de prova na 3120, e declaro: o Candidato 304 **passou a ter acesso registrado**
(fui eu, provando o carimbo), e os Candidatos 339 e 1246 ganharam link novo com origem
`ENTREGA_A_MAO`, para a coluna nova ter o que mostrar. O Candidato 1002 continua **sem e-mail**, a
pedido do diretor.

---

# RODADA 3: ordem dos documentos, menu de Dicas, título e a fresta (21/09)

## 14. A fresta da janela, fechada, com um ganho que ninguém pediu

O critério passou de "houve E-MAIL recente" para **"houve ENTREGA recente"** (`enviado_em ?? criado_em`).
O que a janela protege não é o e-mail, é a **credencial que já está na mão da pessoa**, e o estrago do
segundo link é idêntico tenha ela chegado por e-mail ou por WhatsApp.

**O ganho extra:** contar da criação fecha também uma CORRIDA que ninguém tinha visto. Entre o
nascimento da linha e o carimbo do envio existe um vão (o correio aceitando a mensagem) em que o
link está vivo, não aberto e **ainda sem `enviado_em`**: dois envios simultâneos, o segundo lia a
linha do primeiro, não via carimbo e reemitia, matando o link do e-mail que estava saindo.

**A válvula de escape continua aberta:** o "gerar link" não ganhou a janela, de propósito. É por ela
que se prova que não existe estado em que o time fique sem conseguir entregar um link.

A frase precisou mudar junto: ela dizia "acabou de ser enviado, confira a caixa de entrada", o que
mandaria a pessoa procurar numa caixa onde nunca chegou nada quando a entrega foi à mão. Agora fala
em **entrega**, e o rótulo é "Entregue Agora".

## 15. A ordem dos 7, e a medição que escolheu a leitura

Ordem: RG, CPF, Comprovante de Residência, Comprovante de Conta Bancária, Comprovante de
Escolaridade, CTPS, Certidão de Nascimento ou Casamento. **Ela vale DENTRO de cada faixa de
exigência**, e não por cima dela (decisão do diretor, sobre medição).

O que decidiu: **a certidão é não obrigatória em 133 das 135 réguas.** Pôr os 7 à frente de tudo
faria, em 98% dos cargos, um documento que ninguém exige aparecer antes dos obrigatórios, que é
exatamente o que a regra anterior existia para evitar.

**Medido na 3120, em dois cargos, e o segundo é o que prova a regra do diretor:**

| | Farmacêutico (RAIA) | Ajudante Geral (MEIWA) |
|---|---|---|
| 1 | RG | RG |
| 2 | CPF | CPF |
| 3 | Comprovante de Residência | Comprovante de Residência |
| 4 | Conta Bancária | Conta Bancária |
| 5 | Comprovante de Escolaridade | *(VT, obrigatório, fora da lista)* |
| 6 | *(VT, obrigatório, fora da lista)* | *(Foto Crachá, idem)* |
| 7 | CTPS *(não obrigatório)* | **Comprovante de Escolaridade** *(não obrigatório aqui)* |
| 8 | Certidão de Nasc. ou Casamento | CTPS |

No segundo cargo a Escolaridade **não é obrigatória**, então ela desce de faixa e **lidera a
seguinte**. É o "se o cargo não pede, pula" acontecendo sozinho.

**Um segundo leitor que o mapa não citava:** a coluna "Documento Atual" do Gerenciador declarava a
invariante "a ordem é a mesma que o candidato vê". Enquanto a régua era só alfabética, as duas
concordavam por coincidência. Com a lista fixa, o RH cobraria "Atestado De Antecedentes" enquanto o
candidato veria RG. As duas passaram a usar a mesma função.

## 16. O menu de Dicas

Tabela nova (migration `0123`), uma dica por tipo de documento, com a unicidade no BANCO e não na
tela. CRUD no molde dos outros catálogos. **O texto viaja DENTRO da trilha**, e não por rota
própria: uma superfície pública a menos, e o candidato recebe só as dicas dos documentos DELE, em
vez de uma rota que responderia sobre qualquer código do catálogo.

**Sem dica, o ícone não nasce.** Nada de ícone desabilitado, nada de modal vazio.

O texto é saneado **na escrita**: aparado, sem caractere de controle, **recusando** `<` e `>` em vez
de limpar em silêncio. Medido na 3120: `<script>alert(1)</script>` devolve **400**. A auditoria
mandou cobrir também as faixas invisíveis (largura zero e controle bidirecional, que invertem
visualmente o texto na tela do candidato), e elas entraram.

**§A.23 cumprida:** o menu foi apenas REGISTRADO. Nenhum script de concessão foi rodado.

## 17. O título

Sem o "Grupo Soulan", centralizado no centro óptico da faixa (grade de três colunas, não flex, senão
a diferença de largura entre a logo e o botão deixa o título torto), 28px no desktop.
**No celular os 14px ficaram, de propósito:** a 390px sobram ~103px para o título, e subir a fonte
reabriria o corte que o arquivo já registrava. Ele quebra em duas linhas, nunca corta.
**A cor é a do tema presa ao claro** (`#0d2b45`, o `--text` claro), e não o token: o portal é claro
sempre por decisão do diretor, e o `data-theme` mora no `<html>` compartilhado com o app, então o
token deixaria o título quase branco sobre fundo branco para quem tem o tema escuro salvo.

## 18. A auditoria

`seguranca`: **APROVADO**, quatro achados, nenhum bloqueante. Dois foram corrigidos na hora (as
faixas invisíveis no saneador, e um teste que afirmava cobertura que o dublê não podia dar). Dois
viraram decisão do diretor.

Ele confirmou o que mais me preocupava: **os cinco contadores continuam corretos** depois de a régua
ter sido reescrita, e a mudança na coluna "Documento Atual" **não altera o número** de pendentes, só
qual é o próximo.

---

# RODADA 4: a ponte para o VT (21/09)

O diretor escolheu a **ponte pequena** depois do parecer que mediu que trazer o formulário para
dentro é complexo (`docs/AVALIACAO-VT-DENTRO-DO-PORTAL.md`): um botão, na casa do VT que já existe,
que abre o formulário que já está no ar. A baixa na casa continua sendo da varredura, que já a fazia.

## 19. O que foi construído, e é pouco de propósito

Uma rota (`GET portal/vt-link`, do candidato, sob `portal/`, com o `admissaoId` vindo da SESSÃO) e
um botão na casa cujo código é `FORMULARIO_VT`. `VtLinkService` **não foi tocado**: ele já assinava
o token, já recusava sem CPF ou nascimento e já era inerte sem chave.

**Uma correção estrutural que não estava no pedido e valeu a pena:** importar o `VtColetaModule` no
Portal teria tornado injetáveis, no caminho PÚBLICO do candidato, o scheduler, o dono da escrita de
solicitações e os órfãos. Em vez de escrever um comentário dizendo "entra uma porta só" (que foi
exatamente a frase que mentiu no `as.module.ts` e que a auditoria pegou), o emissor foi extraído
para um módulo que exporta **um** provider. A afirmação virou lista conferível.

## 20. A auditoria VETOU, e o achado principal é grave

**O link do Portal REVOGADO ainda emitiria uma credencial de VT que ninguém consegue cancelar.**

A ponte não conferia se o link do portal estava vivo. As outras quatro portas conferem, e o
cabeçalho de uma delas registra por quê: o motivo mais comum de revogar é "o link foi para a pessoa
errada". Lá o estrago acabava quando o bilhete de 30 minutos vencia. Aqui o produto é um token
verificado **offline** pelo app externo, que nunca contata o EA: **não existe revogação**. E ele
carrega CPF e nome em claro.

**Segundo achado, medido contra o `.env` de produção:** o prazo do token não é 7 dias como o
comentário dizia, é **30**. A rota pública cunharia, sem trilha e sem cancelamento possível, a
credencial mais longeva do sistema, num produto cujas credenciais vivem 72 horas e 30 minutos.

**As correções:** a ponte passa pela mesma régua das outras portas (mesma função de domínio, mesma
projeção, mesma frase de recusa); o prazo do caminho do CANDIDATO caiu para **6 horas** (o do
consultor não mudou, porque lá o link vai por e-mail); a emissão passou a deixar **rastro**
(`PORTAL_VT_LINK_EMITIDO`, sem PII); e o teste da barreira de módulo, que proibia os quatro serviços
pelo nome mas **não proibia o nome do módulo**, foi fechado.

## 21. A credencial em QUERY STRING: aceitável com condições

O link do VT monta `?t=` e o token carrega CPF, nome e nascimento. O Portal usa **fragmento**
(`#t=`) justamente porque o fragmento não vai ao servidor e não cai em log nem no `Referer`.
Não é regressão (o link do VT já é assim), mas a ponte aumenta o volume desse caminho.
**Preço de arrumar depois, para o diretor saber:** trocar por `#t=` custa uma linha de cada lado; o
caro é a transição, porque o app precisa ler os dois formatos por uma janela igual ao prazo do
token. Com 6 horas em vez de 30 dias, essa janela passou de um mês para um dia.

## 22. O problema da retomada, que o diretor nomeou e que era real

Ele pediu atenção a "o candidato sai e volta". Medido: a página **apaga o `#t=` da barra** no
primeiro render, por proteção. Se o celular **descartar a aba** (comum quando a pessoa sai para
outro app), o recarregamento vem sem fragmento e a tela declarava **"Link Inválido"**, mandando a
pessoa procurar o RH, **com o link de 72h ainda vivo no WhatsApp dela**. A ponte torna isso
provável, porque ela manda o candidato para fora.

Corrigido **só no texto**: sem fragmento, a tela agora diz **"Abra O Link De Novo"**, com
instrução, e não com erro. O caso do servidor recusando um link de fato morto continua dizendo
"Link Inválido", intocado.

## 23. O que foi provado na 3120

| prova | resultado |
|---|---|
| a casa do VT troca o upload pelo botão | sim, com a instrução honesta e sem prometer prazo |
| clicar com a chave ausente | a frase do servidor mais o botão de RH, em vez de um botão morto |
| `/portal` sem fragmento | "Abra O Link De Novo", ícone de link, não de cadeado |
| a rota nova | mapeada no boot, **401** sem sessão, **503** sem chave |
| suíte completa | backend 5.058 e frontend 893, zero falha |

**O limite da prova, declarado:** a chave do VT existe em produção e **não** na homologação, de
propósito. O link de verdade só pode ser exercido em produção. Nenhum segredo foi copiado.

---

# RODADA 5: o fechamento (21/09)

Todas as pendências que o diretor tinha em aberto, fechadas numa rodada.

## 24. A lista de rotas do Portal para o Fernando, FECHADA

Estava como item F7 do desenho de segurança, sem a lista. Agora tem a seção **F7.1**, levantada do
**boot real do backend** e não do código: seis rotas do CANDIDATO entram na allowlist (incluindo a
nova `GET /api/portal/vt-link`) e quatro do TIME ficam de fora, sem exceção.

**A allowlist é por caminho NOMINAL, nunca por prefixo**, e a tabela tem duas metades por isso: um
`portal/*` largo arrastaria junto o `portal/links`, cuja primeira rota **fabrica credencial de
acesso ao prontuário**. Esquecer uma rota quebra e aparece; escrever por prefixo abre **em
silêncio**, que é pior.

## 25. A consolidação da trava, e o que ela custou em teste

`PortalDocumentosService` deixou de ter leitura própria de `portal_links` e passou a consumir o
serviço único. **O comportamento externo não mudou em borda nenhuma** (mesma recusa, mesma frase,
mesmo evento, e a conferência continua sendo o PRIMEIRO passo, antes de ler cabeçalho e antes de
registrar abertura).

**O cuidado estava nos testes, e eram TRÊS, não dois:** o terceiro é o canário em `src/domain`, que
eu não tinha mapeado e o agente achou. Cada asserção **mudou de arquivo** em vez de sumir, e a da
trilha ganhou o par negativo que antes não dava para escrever ("a leitura não voltou a existir lá
dentro").

**Uma frase minha foi corrigida por exigência da auditoria:** o cabeçalho dizia que o serviço era "a
única leitura que existe". Era **falso**, e a própria suíte contradizia ao listar quatro arquivos
espalhando a constante. Cabeçalho é memória de régua: afirmar unicidade que não existe faz o
próximo parar de procurar as outras.

## 26. O que foi provado na 3120

| prova | resultado |
|---|---|
| o texto do escape na casa do VT | **"Preencher depois"**, e as outras casas seguem com o texto antigo |
| o link do VT é cunhado | sim, com prazo de **6.0 horas** (era 30 dias antes da correção) |
| a recarga ao voltar o foco | a casa virou **verde sozinha** depois da baixa, sem recarregar à mão |
| MASTER sem a marcação: ler a lista | **403** |
| MASTER sem a marcação: **escrever** a dica | **403**, e a mensagem cita a MARCAÇÃO, não a área |
| o menu de Dicas na barra do MASTER | **não aparece** |
| SUPER_ADMIN escrevendo a dica | **200** |
| filtro sem nada / id inválido / situação inválida / válido | **31 / 0 / 0 / 2 linhas** |
| suítes | backend 5.063 e frontend 893, zero falha |

**A prova do MASTER é pelo motivo certo**, e isso foi conferido antes: ele e o menu estão os dois na
área ADM, então o 403 não pode vir do teto de área. Vem da marcação, que é o que o diretor pediu.

## 27. O que ficou pendente, e por quê

**A transição para o app externo não pôde ser vista de ponta a ponta na 3120.** A chave descartável
foi posta e o link passou a ser cunhado, mas a homologação aponta `VT_LINK_BASE_URL` para
`127.0.0.1:9`, o endereço de descarte, **de propósito e por configuração anterior a esta frente**.
O botão abre a aba, e a aba não vai a lugar nenhum. O app real é alcançável da VM (responde 200), e
apontar para ele é decisão do diretor, porque manda um CPF sintético para o log do app de produção.

**O estado temporário da homologação, que precisa ser desfeito depois da validação:** a chave
descartável do VT (com restart, senão ela sobrevive na memória do processo) e a senha temporária do
`usuario06`. Os dois têm roteiro de desfazer no backup da rodada.

---

# RODADA 6: os achados menores, e cinco passadas na mesma família (21/09)

## 28. O que o diretor pediu, e o que foi entregue

| item | estado |
|---|---|
| apontar a homologação para o app REAL do VT | feito, transição provada de ponta a ponta |
| motivo da trilha sempre correto | feito, e virou função pura no domínio |
| a rota pública de recuperação enchendo a trilha | fechada |
| o teste do filtro que não mordia | fechado, com prova de mutação |
| o CPF na URL do VT, para antes da produção real | **plano**, e a premissa estava errada (ver 31) |

## 29. A transição do VT, provada

Apontei a homologação para o app real e o botão abriu a aba: o app **carregou** e **recusou** o token
com a mensagem certa ("este link foi alterado depois de gerado"). É o esperado, porque a chave é
descartável e a pública dela não está na lista de confiança do app. O CPF que trafegou é da faixa
sintética da homologação.

## 30. CINCO PASSADAS NA MESMA FAMÍLIA, e é isto que vale registrar

A mesma falha reabriu **quatro vezes** depois de ser dada como fechada. Vale a pena listar, porque o
padrão é mais instrutivo que qualquer um dos casos:

| passada | a porta | por que a anterior não pegou |
|---|---|---|
| 1 | o `jti` declarado escolhia o balde | o furo original |
| 2 | a correção fechou a ESCRITA, e a DECISÃO continuou saindo do valor não verificado | fechou a letra, não o efeito |
| 3 | o balde do CPF, escolhido por campo de formulário | a correção cobriu o `jti`, não o CPF |
| 4 | o caminho INDIRETO: o atacante enche o balde do CPF, a vítima toma 429 e **a insistência dela** dispara a suspensão | ninguém tinha perguntado quem escolhe a CONDIÇÃO, só quem escolhe a chave |
| 5 | **auto-renovação**: a suspensão escrita torna o link não-vivo, o que faz a escalada disparar de novo e regravar +24h | **inobservável por construção**: nenhum dublê de banco da casa APLICA o que escreve |

**A consequência operacional da quinta era a pior:** o time bloqueia um link à mão, o candidato
insiste com a credencial CERTA, o RH clica em desbloquear e **o link continua morto**. Isso quebrava
a invariante que o domínio declara para o bloqueio manual (ele acaba quando uma pessoa decide, não
quando o candidato desiste).

**As duas coisas que fecharam, e nenhuma é código de negócio:**
1. **O auditor rodar o ataque**, em vez de ler o código. Pegou as cinco vezes.
2. **O dublê de banco APLICAR o que escreve.** Sem isso, a quinta era invisível: os testes não
   conseguiam sequer enunciar "o estado escrito muda a decisão seguinte?".

**A invariante final, e ela é explícita no código:** a escalada só dispara quando o link está VIVO
**e** a credencial está ERRADA. Escalar link já morto não protege nada e era exatamente o dano.

## 31. A correção de premissa do CPF na URL

O diretor registrou a dívida como "quando o VT for para produção com candidato real". **Medido: já
é hoje.** O app processou **202 formulários de candidatos reais** desde 24/07, com o ritmo quase
dobrando de agosto (74) para setembro (127). Não é dívida futura, é exposição corrente.
Plano em `docs/PLANO-CPF-NA-URL-DO-VT.md`, e ele pede três decisões do diretor.

## 32. O residual declarado, que o auditor pediu para levar ao diretor

1. `jti: string` **não** prova verificação, e um comentário do código dizia que provava. Um terceiro
   chamador com `jti` declarado **compila hoje**; quem barrou, no teste do auditor, foi a cobertura
   comportamental, não o tipo. O conserto real seria um tipo marcado.
2. As travas estruturais travam **a forma**, não a classe. Quem segura a classe é o ponto único de
   escrita mais a cobertura com banco mutável.
3. Canal de tempo: no caminho já recusado, link vivo custa duas consultas e link morto uma. Só
   alcança quem já tem o token.
4. O limitador é memória **por processo**: com N instâncias o teto efetivo é N vezes maior.
5. Quando o atacante estoura o próprio balde por link digitando o CPF da vítima, o evento sai com o
   hash de CPF **dela**.
6. **Outros dublês da casa ainda registram e não aplicam** (bloqueio manual, envio, teto de
   reprovações), então esta mesma classe pode estar escondida nesses três lugares. É a próxima
   varredura de método, não desta frente.
