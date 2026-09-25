# Portal do Candidato: a trilha da Sol

Documento da frente que trocou a EXPERIÊNCIA do Portal do Candidato, de rolagem de formulário para
trilha guiada com persona. O MOTOR não mudou: teto de tentativas, frases da lista fechada, limites de
arquivo, documento único e veredito em tempo real continuam exatamente onde estavam.

Mockup aprovado pelo diretor em 19/09/2026. Construção em 20/09/2026.

---

## 1. As decisões do diretor, que a construção seguiu à risca

1. **A Sol é a aprovada**, as cinco poses, traço plano, cores Soulan. Não foi redesenhada.
2. **A lista da tela 2 vem da régua REAL** do cargo, automática, sem edição manual.
3. **O "pular" é discreto**, link pequeno no rodapé. O candidato deve entregar; pular é a exceção de
   quem não tem o documento na mão naquela hora.

## 2. O que existe agora

| arquivo | o que é |
|---|---|
| `packages/shared-types/src/index.ts` (bloco "A TRILHA DA SOL") | o contrato, escrito pelo coordenador (§A.39) |
| `apps/backend/src/portal/portal-documentos.service.ts` | monta a trilha da admissão do bilhete |
| `apps/backend/src/portal/portal-documentos.controller.ts` | `GET /portal/documentos`, público com guard de sessão |
| `apps/frontend/src/app/portal/page.tsx` | as quatro telas e o tabuleiro |
| `apps/frontend/src/lib/portal-trilha.ts` | a régua pura: estado da casa, próximo passo, validação do arquivo, placar |
| `apps/frontend/src/components/portal/Sol.tsx` | a persona, cinco poses, SVG inline |
| `apps/frontend/src/components/portal/IconesPortal.tsx` | os ícones, vetor, zero emoji |

As telas, na ordem: **Boas-Vindas** (a Sol se apresenta, termo de privacidade, o "Começar" só acende
com o aceite), **O Que Reunir** (a régua do cargo, obrigatório e facultativo distintos), **Como
Funciona** (a conferência em tempo real, as 3 tentativas, o pular que não trava) e **A Trilha** (o
tabuleiro, uma casa por documento, a Sol em pé na casa atual).

## 3. As três correções que a auditoria prévia pagou ANTES de existir código

A §A.40 manda auditar o MAPA antes do primeiro despacho. Foi o que mais economizou nesta frente: os
três achados abaixo teriam virado rodada de retrabalho depois do código pronto.

### 3.1 A trilha NÃO sai de `regua_documental` (veto V-1)

**Medido**: na admissão de homologação conferida, a régua do par (cliente + cargo) tem **32 linhas** e
a admissão tem **14 documentos**. A emissão de credencial exige a linha de `documentos_admissao`
existir (predicado `naRegua`) e responde "Este documento não faz parte da sua lista" quando não
existe. Montar a trilha pela régua faria a tela desenhar **18 casas que a própria API recusa no
toque**, logo depois de dizer que eram dela.

O mesmo defeito já foi pago uma vez, no modal de auditoria da esteira, e o comentário está lá.

**A régua entra**, mas só para emprestar a `exigencia`. Documento sem linha de régua sai como
`NAO_OBRIGATORIO`, o mais fraco dos três: o que a régua não cobra não pode aparecer como obrigação.

### 3.2 O contrato tem CINCO estados, não três (veto V-4)

Colapsar tudo que não é `ENTREGUE` em `PENDENTE` faria a casa convidar a um envio que a régua do
arquivo único RECUSA. O enum do banco tem quatro valores, e a tela precisa dos quatro mais o teto:

| estado | de onde vem | o que a tela faz |
|---|---|---|
| `ACEITO` | documento `ENTREGUE` | casa verde, não pede envio |
| `EM_ANALISE` | `AGUARDANDO_AUDITORIA` | avisa que chegou, não oferece segundo envio |
| `AJUSTAR` | `INCONFORME` com tentativa sobrando | pede o reenvio |
| `NO_TIME` | teto de 3 atingido | casa roxa, quem resolve é o consultor |
| `PENDENTE` | nada enviado ainda | casa cinza |

`PULADO` **não é estado do servidor**: pular é memória da VISITA. Persistir criaria um segundo estado
do documento, que o time veria na esteira sem significar nada.

### 3.3 Nenhuma contagem nova de tentativa (veto V-3)

Já existiam dois leitores da contagem de reprovações. Um terceiro seria a terceira verdade sobre o
número que TRANCA a pessoa fora do documento. A rota consome `situacaoParaATela`, que já existia e já
devolvia exatamente o formato do contrato; o método só foi promovido a público.

**Custo medido da delegação**: 2 consultas por passo, então uma régua de 32 casas custa 64 consultas
por abertura. Aceito nesta entrega (a alternativa era uma terceira contagem), e registrado como
candidato a consulta em lote quando o portal for dimensionado para produção.

## 4. As outras condições de saída da auditoria, todas cumpridas

- **`Cache-Control: no-store, private`**: é a primeira rota GET do portal que devolve dado pessoal, e
  ela atravessa o proxy do Next e a barreira externa.
- **Nenhum parâmetro de admissão na rota**, nem opcional. A admissão vem do bilhete, e de mais lugar
  nenhum.
- **O primeiro nome é recortado no SQL** (`split_part`), não em JavaScript: o nome completo não chega
  a existir no processo. `cliente` é o nome de operação, nunca razão social nem CNPJ.
- **O evento `PORTAL_LINK_ABERTO`** passa a ser emitido (o tipo existia no catálogo e ninguém o
  emitia). Ele é o que separa "o link não chegou" de "chegou e ele não enviou". Esta leitura NÃO é
  fail-closed: ninguém fica sem ver a própria lista por falta de variável de ambiente.
- **O bilhete vive só em memória do React**, lido do FRAGMENTO da URL e apagado da barra. Nunca
  `localStorage`, nunca `sessionStorage`.

## 5. O que ainda falta para a tela sair da inércia

1. **A camada de IDENTIDADE.** Não existe emissor do bilhete de sessão do candidato. Sem ele a tela
   abre, reconhece que não há bilhete e diz que o link não é válido. É a próxima frente, e ela decide
   como o candidato prova quem é (o precedente da casa é o `/vt`: CPF mais data de nascimento, com
   limite por CPF) e qual o prazo do bilhete.
2. **A allowlist da barreira** (item F7) precisa incluir `GET /portal/documentos`. Rota nova não
   avisada quebra em produção, em silêncio.
3. **O balde de throttle separado do portal** (veto V1, anterior a esta frente e ainda aberto): o
   balde global conta por `req.ip` e todo mundo chega como `127.0.0.1` atrás do proxy.
4. **O texto jurídico do termo de privacidade** é insumo do diretor. O que está na tela hoje são três
   parágrafos factuais escritos pela fábrica, provisórios.

---

# 6. A identidade: o que LIGA o Portal (20/09/2026)

Até aqui a tela abria e parava. Esta parte é o que faz o candidato entrar.

## 6.1 Como funciona, em uma passada

1. O consultor emite um **link pessoal** da admissão (`POST /portal/links/:admissaoId`). O link vale
   **72 horas**, é **revogável**, e **não é de uso único** (decisões 2, 3 e 4 do desenho de segurança).
2. O candidato abre o link no celular e digita **CPF e data de nascimento**.
3. O sistema confere contra a admissão **daquele link**, e não por busca global de CPF: sem link não
   há o que enumerar. Batendo, ele recebe uma **sessão de 30 minutos**, que é o que a trilha usa.
4. Expirou no meio do envio? A tela reabre a identificação com o link que ainda tem em memória, e
   **nada do que já foi enviado se perde**: a cota e as tentativas vivem por link, no servidor.

**Limite:** 5 tentativas por 15 minutos, por CPF e por link, com bloqueio progressivo. O terceiro
estouro **suspende o link**. E existe a **válvula**: o botão "Não consigo entrar" registra o pedido e
manda procurar o RH, porque o candidato cuja data de nascimento está errada NA NOSSA BASE ficaria
trancado para sempre.

## 6.2 O que a auditoria prévia achou antes de existir código

- **A sessão sobrevivia ao link revogado.** O guard nunca reconsultava o banco: consultor revogava
  às 14h00 e quem tivesse a sessão das 13h59 seguia escrevendo no armazenamento até 14h29. Hoje a
  linha do link é conferida na emissão de credencial, na confirmação e na leitura da trilha, e o
  prazo da sessão é cortado pelo prazo do link.
- **A ordem do limite estava invertida.** Contar por CPF antes de provar que o requisitante tem link
  deixava qualquer um trancar o CPF que quisesse por 15 minutos. Hoje: link, bilhete, linha, CPF.
- **A chave era uma só para link e sessão.** O `typ` discrimina, mas no dia em que a checagem caísse
  numa refatoração, um link de 72 horas passaria a valer como sessão de 72 horas, sem nada falhar.
  Hoje são dois pares.
- **Faltavam a válvula de recuperação e dois eventos do catálogo**, e faltava código de motivo para
  a revogação: um evento com motivo mudo é o defeito que a frente do teto de tentativas já pagou.

## 6.3 O que a auditoria de código achou depois

- **Suspensão gravada a partir de `jti` não verificado:** quem conhecesse um `jti` derrubava o link
  de outro por 24 horas, com requisições de lixo. Hoje a escalada só acontece depois da assinatura.
- **A revogação não valia para a LEITURA:** o motivo típico de revogar é "foi para a pessoa errada",
  e essa pessoa continuava lendo a lista de documentos por 30 minutos.
- **O link emitido nunca abria:** o backend escrevia `#t=` e a tela lia `#l=`. Falha do coordenador,
  por vocabulário compartilhado sem dono; virou `PORTAL_FRAGMENTO_LINK` no contrato.

## 6.4 O que ainda falta para ir ao ar

1. **Decisão do diretor (§A.23):** hoje TODO MASTER da área ADM já alcança a rota de emissão, por um
   mecanismo anterior a esta frente (`menu.guard`), e o menu registrado não tem tela (`/admin/portal-links`).
2. **Infra (Fernando):** o vhost da barreira em `ALLOWED_ORIGINS`, senão `POST /portal/identificar`
   devolve 403 em produção com tudo verde no repositório. E a allowlist da barreira por CAMINHO,
   nunca por prefixo, porque `portal/links/*` mora sob `portal/` e fabrica credencial.
3. **O balde de throttle do portal**, separado do da operação interna. Anterior a esta frente, e
   segue sendo veto de saída.
4. **O texto jurídico do termo de privacidade.**

---

# 7. O gerenciador, o WhatsApp e o PC (20/09/2026)

## 7.1 O gerenciador do Portal

Tela `/admin/portal-links`, menu **Portal Do Candidato**. Não é só emissor de link: é o funil da coleta.

Cinco números, no topo, cada um clicável como filtro: **Encaminhados**, **Acessaram**,
**Concluíram**, **Intervenção Humana** e **Não Acessaram**. Abaixo, uma linha por candidato com
cliente, cargo, documento atual, progresso ("7 de 7"), situação, último acesso, estado do link e o
botão de emitir. Ordenação por clique em toda coluna (§A.29), máscara única de tabela (§A.12).

**"Não acessaram" é DERIVADO** (encaminhados menos acessaram), não uma sexta consulta: derivado, os
dois números não têm como divergir na tela.

**O contador de acesso não é a trilha de eventos, e a escolha é deliberada.** `portal_eventos` já
registra `PORTAL_LINK_ABERTO`, e mesmo assim não serve para contar: a gravação da trilha engole
falha de propósito, a trilha tem retenção declarada (o KPI encolheria sozinho quando o expurgo
nascer), e um falso "não acessou" faz o consultor REEMITIR o link, o que revoga o link vivo e mata a
sessão de quem está enviando documento naquele instante. Os carimbos moram em `portal_links`
(`primeiro_acesso_em`, `ultimo_acesso_em`), só tempo, sem IP, sem navegador e sem CPF (§A.6).

**Régua vazia não conclui nada** (achado M1). Medido contra a produção: 1.963 admissões vivas, 6
delas sem nenhuma linha obrigatória na régua, todas dentro do recorte deste painel. "Zero pendentes"
ali não é coleta completa, é ninguém ter dito o que cobrar: a linha aparece como "nada a enviar", em
cinza, fora de CONCLUÍRAM.

## 7.2 O botão "Falar Com O RH"

WhatsApp em dois lugares: a tela de identificação e a casa que caiu para o consultor. O número vem
de `NEXT_PUBLIC_WHATSAPP_RH`, declarada em `apps/frontend/.env.production` e lida no build; o
literal que sobrou no código é REDE DE SEGURANÇA, para a tela nunca nascer com um link quebrado, e
não a fonte do número. A distinção importa porque a auditoria pegou a frase anterior mentindo: a
variável não existia em lugar nenhum, e o que subia era o literal. O texto pré-preenchido não leva
CPF nem nome, e o link sai com `rel="noopener noreferrer"` e `referrerPolicy="no-referrer"`.

**ACHADO ABERTO, e ele é do diretor decidir (ver o pulso):** a casa NO_TIME só é alcançável no
INSTANTE em que ela cai. `proximoPasso` (`lib/portal-trilha.ts`) só devolve casa onde `podeEnviar` é
verdadeiro, e a casa que caiu para o consultor não é, então o candidato que VOLTA pelo mesmo link
nunca mais abre aquela casa: ele vê o número dela roxo no tabuleiro e não tem como chegar nela. O
botão está lá, no código e na tela; o caminho até ele é que não existe na volta. Medido no navegador
contra a homologação, com a casa 10 em NO_TIME de verdade.

## 7.3 O PC

Mesma trilha, não uma segunda tela. A partir de 1024px o tabuleiro vira a coluna da ESQUERDA, as
casas descem na vertical, a Sol desce junto com a casa atual e o nome COMPLETO do documento fica ao
lado de cada casa. O cartão de envio ocupa a coluna da direita, centrado na altura, e o container
para de crescer em 1100px, porque numa tela de 1920 a linha de texto atravessaria o monitor inteiro.

No PC o botão primário é **"Escolher um arquivo"** e a câmera some (ela só existe onde existe), a
frase muda com o aparelho, e o arquivo pode ser ARRASTADO para o cartão. Abaixo de 1024px nada muda:
o celular continua exatamente como foi validado.

## 7.4 O que as duas auditorias desta entrega acharam

| agente | veredito | o que achou |
|---|---|---|
| `seguranca` | **APROVADO** | três achados não bloqueantes: a variável do WhatsApp não existia (o literal é que subia), o teste do carimbo não pega a volta do 500, e todo MASTER da área ADM já alcança a lista nominal pelo `menu.guard`, sem ninguém liberar. |
| `tester` | 67 testes novos, verdes | **8 de 17 mutações passavam verdes na suíte do autor**, as quatro piores na admissão com MAIS DE UM LINK (a agregação sumia do SQL e o banco de mentirinha agregava sozinho). |

O arquivo independente é `portal-painel.cobertura-independente.tester.spec.ts`. A varredura do
`tester` também mediu que `ADMISSAO_CONCLUIDA` nunca sai do funil: quem já foi admitido segue em
ENCAMINHADOS para sempre, e isso é recorte a decidir, não defeito.

## 7.5 O menu estava registrado no backend e INVISÍVEL na navegação

Medido no navegador, contra a homologação: o hub do Menu Gerencial tinha **zero** card apontando
para `/admin/portal-links`. O menu existia no catálogo (`domain/menus.ts`), era liberável na tela de
permissões e não tinha caminho nenhum pela navegação, que é exatamente o defeito que a §A.23
registra para o `clinicas` em 29/07/2026. O card foi registrado em
`app/(app)/admin/page.tsx` e o código entrou em `lib/admin-menus.ts`, para quem tiver só este menu
conseguir abrir a camada. **Registrar não é conceder:** a visibilidade continua sendo
`temMenu("portal-links")`, e quem libera é o diretor.

---

# 8. A segunda rodada de ajustes (20/09/2026)

O diretor validou a primeira versão e pediu dois blocos: o gerenciador e a trilha. O que segue é o
que mudou e, principalmente, o que a investigação prévia achou antes de a construção começar.

## 8.1 O gerenciador

Menu movido para a barra lateral, logo abaixo de Liberação Admissional, e fora do hub do Menu
Gerencial. Duas abas com recorte no SERVIDOR (**Em Andamento** e **Concluído**): quem termina a
entrega sai da frente de trabalho, e **os cinco cards continuam contando o universo inteiro**, que
é o que impede o funil de mentir conforme a aba. Coluna **Data De Admissão** (com filtro e
ordenação, §A.37), **cilindro de progresso** no lugar do texto, oito filtros de múltipla seleção
mais busca por nome, e o **CRUD do link** na coluna Ações.

**O botão Copiar estava quebrado e agora está provado.** A causa é a que se suspeitava e foi medida:
`navigator.clipboard` não existe fora de contexto seguro. O caminho de reserva entrou, e a prova é
de ponta a ponta na 3120: clicar em Copiar e colar em um campo devolve a URL do portal.

**A tabela de dez colunas não cabia em 1440.** Medido no navegador: 1.290px pedidos para 1.094
disponíveis, e o que sobrava de fora era justamente a coluna de AÇÕES. A variante `ds-table--densa`
(calha de 9px e título de coluna que pode quebrar em duas linhas) resolveu sem tocar em nenhuma das
outras tabelas do sistema: a máscara da §A.12 continua uma só.

## 8.2 O bloqueio do link, que é reversível e não é revogação

`REVOGADO` é terminal e nasce de toda emissão nova; `BLOQUEADO` é decisão manual que fecha a porta
agora e reabre depois, **sem trocar a URL que o candidato já tem no WhatsApp**; `SUSPENSO` é do
sistema e passa sozinho. A precedência é REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO, e
desbloquear zera só o bloqueio, então link revogado ou vencido não ressuscita.

A régua mora dentro de `estadoDaLinha`, e a projeção das colunas do link virou a constante única
`COLUNAS_DO_LINK`. Isso não é preciosismo: os campos de `estadoDaLinha` são opcionais, então
**coluna não projetada vira `undefined` vira "sem restrição"**, e uma das cinco leituras esquecida
seria sessão viva escrevendo com o link bloqueado.

**Limite declarado:** credencial de upload já emitida é URL pré-assinada e não passa pelo EA.
Bloquear não impede o arquivo de aterrissar no balde; impede a CONFIRMAÇÃO.

## 8.3 A reabertura de documento: a porta já existia, faltava a CONSEQUÊNCIA

A investigação prévia mudou esta frente inteira. O pedido era "qualquer consultor reabre a pendência
quando a IA aprovou errado", e a medição mostrou que **`POST /esteira/auditoria/:id/descartar` já
fazia isso desde antes**, operacional, sem papel exigido. Construir rota nova seria a segunda
escritora do mesmo dado, e qualquer guarda nela nasceria contornável pela antiga.

**O que faltava era o recuo, e a falta já era um defeito em produção:** `aplicarPosVeredito` só agia
com a régua completa, `autoConcluirAuditoria` só escrevia `ANALISE_OK`, e o farol deriva de
`frentes.concluida`. Ou seja, o estado "AUDITORIA concluída com régua obrigatória INCOMPLETA" já era
alcançável, e nele **a pendência reaberta some da fila**, porque a Esteira esconde frente concluída.

Agora, quando a régua deixa de fechar: a frente volta a `ANALISE_PENDENTE` com `concluida: false` e
data nula, o evento sai marcado como **reversão**, o Cadastro já aberto é derrubado pela régua que já
existia (`reversaoDerrubaCadastro`) e o farol é recomputado.

**A guarda protege o EFEITO, e não só as portas**, e este foi o veto da auditoria de código: o recuo
mora no pós-veredito compartilhado, então havia um caminho de UM clique por fora (o modal oferece
"Enviar novo arquivo" em documento já ENTREGUE, o upload comum sobrescreve o estado, a IA reprova, e
o Cadastro caía com o envelope da Clicksign vivo). A guarda é por `clicksign_status` e kit gerado,
nunca por farol, porque `ADMISSAO_CONCLUIDA` é flag manual até a INT-4 e passaria batido.

**Sem campo de motivo, de propósito** (§A.31): o diretor não pediu, e texto livre sobre o documento
de outra pessoa é coletor de dado pessoal de terceiro.

## 8.4 A trilha

Layout de PC de verdade (container de 1600px, tabuleiro como painel branco à esquerda com o nome
completo e o estado de cada casa, cartão de envio em duas colunas com área de arrastar grande),
banner com a marca em todas as telas, botão **Fale com o RH** em todas as telas, **Voltar** para a
casa anterior e casas clicáveis no tabuleiro. **Abaixo de 1024px nada mudou**, e a prova visual a
390px confirma: o celular é o mesmo que foi validado, mais o banner.

As casas clicáveis resolvem, de quebra, o achado da rodada anterior: a casa que caiu para o
consultor era inalcançável na volta, e com ela o botão do WhatsApp que mora nela.

## 8.5 Quem auditou, e o que cada um achou

| agente | veredito |
|---|---|
| `seguranca` (mapa, ANTES do código) | **VETOU os dois itens**, com 8 vetos e as condições de saída |
| `seguranca` (código) | Item B **APROVADO**; item A **VETADO** por 1 furo (a guarda não protegia o efeito), hoje corrigido e provado por mutação |
| `tester` (independente, em paralelo) | 75 testes escritos a partir do requisito; achou a divergência da sobre-entrega e 8 vermelhos por ausência do recuo |

O que a auditoria do MAPA economizou está medido: os oito vetos foram achados **sem uma linha de
código existir**, e três deles (a porta que já existia, a rotina de recuo que não existia e a
inversão da ordem do bloqueio) teriam virado rodada inteira de retrabalho depois do código pronto.
