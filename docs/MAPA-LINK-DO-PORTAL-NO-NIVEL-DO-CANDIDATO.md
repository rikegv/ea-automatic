# Mapa: o link do Portal fora do fluxo do funil

Sessão de MAPEAMENTO (28/09/2026). Nada foi construído. Este documento existe para o diretor
decidir com o alcance na mão (§A.27, §A.31, §A.40).

---

## 0. A conclusão, antes do detalhe

**A premissa do pedido está invertida, e isso muda a decisão.** Não é que o link do Portal
funciona pelo funil e falha no "+ Nova Admissão". Medido no código e na base:

1. **O envio automático do funil NUNCA emitiu link nenhum.** O gancho existe, mas recusa sempre.
2. **A admissão criada pelo "+ Nova Admissão" é MAIS elegível ao link do que a que vem do funil**,
   porque nasce viva, com cliente, cargo e régua.
3. **Já existe hoje o caminho manual que atende o caso do diretor**, na tela do Gerenciador do
   Portal. Ele é pouco descobrível e só envia por e-mail, não devolve link para copiar.
4. **O que falta de verdade é a CASA do link**, na ficha da admissão, onde o VT já mora.

---

## 1. Como o link nasce hoje

**Tabela:** `portal_links` (`apps/backend/src/db/schema/tables.ts:5248`), chaveada por
`admissao_id` (linha 5257). Não tem `candidato_id` nem `cpf`. TTL de **72 horas**
(`domain/portal-identidade.ts:61`). Não tem unique: a unicidade do link vivo é garantida em
código, por trava de transação mais revogação dos anteriores.

**Porta única de escrita:** `portal-identidade.service.ts`, método `emitirComTrava` (linha 347).
Tudo o mais orquestra, ninguém mais escreve na tabela.

**Regra que manda no desenho:** **emitir um link REVOGA todos os links vivos daquela admissão**
(`portal-identidade.service.ts:461`). O link do Portal tem estado; o do VT não tem.

### As portas de emissão, todas as três

| # | Porta | Onde | Checa o quê | Carimbo |
|---|---|---|---|---|
| 1 | `POST portal/links/:admissaoId` | `portal-links.controller.ts:58` | só que a admissão existe. Não checa farol, e-mail nem régua | `ENTREGA_A_MAO` |
| 2 | `POST esteira/portal/envio/admissao/:id` | `portal-envio.controller.ts:132` | e-mail válido, correio ligado, farol elegível, tudo ANTES de emitir | `MANUAL` |
| 3 | gancho do funil, na saída para admissão | `as/candidatos/candidatos.service.ts:1998` | idem, mais vínculo `as_candidaturas.admissao_id` | `AUTOMATICO` |

Não existe cron, scheduler nem carga que emita link.

---

## 2. Por que o caso do diretor parece travado, e o que de fato trava

**O que NÃO trava:** nada no vínculo. A emissão só consulta a admissão por id
(`portal-identidade.service.ts:360`), e o destino do e-mail sai de `candidatos.email` e de mais
lugar nenhum (`portal-envio.service.ts:388`). Não há dependência de vaga, de shortlist nem de
candidato do funil. A tela "+ Nova Admissão" **coleta e-mail e telefone**
(`app/(app)/nova/page.tsx:1148`) e grava os dois em `candidatos`.

**O que trava, em três camadas:**

1. **Não há casa na ficha.** A ficha da admissão (`components/esteira/AdmissaoDetalheModal.tsx`)
   tem o bloco do VT na linha 1355 e **zero menção ao Portal**. O link do Portal só é alcançável
   pela tela `/admin/portal-links`, que é outro menu e outro papel.
2. **O Gerenciador do Portal lista `from(portal_links)`** (`portal-painel.service.ts:341`): quem
   ainda não tem link **não aparece na lista**. Ele aparece só dentro do modal "Enviar link", que
   busca por nome em `GET esteira/portal/envio/sem-link` (`portal-envio.service.ts:340`). É esse
   modal que já resolve o caso hoje, e é ele que ninguém acha.
3. **O modal só ENVIA por e-mail.** Ele não devolve o link para copiar e colar no WhatsApp, que é
   exatamente o gesto que o diretor faz no VT.

---

## 3. A correção de premissa que muda a decisão

### 3.1 O automático do funil não funciona, e o código diz isso

A pré-admissão do funil nasce em `AGUARDANDO_LIBERACAO` (`admissoes.service.ts:893`). Esse farol
está em `FAROIS_FORA_DO_PAINEL` (`portal-painel.service.ts:167`), e o lote recusa todo farol
dessa lista com o motivo `SEM_ADMISSAO` (`portal-envio.service.ts:489`). O comentário no próprio
gancho diz, em letras: "HOJE ISTO NÃO DISPARA NADA" (`candidatos.service.ts:1988`).

**E não há gancho depois da liberação.** `aplicarLiberacao` não chama o Portal em nenhuma linha.
Então, terminada a liberação, o link continua não nascendo sozinho.

**Medido na base de homologação:** 45 links emitidos, **30 pela rota crua manual e 15 sem carimbo
de envio. Zero por `AUTOMATICO`, zero por `MANUAL`, zero e-mails enviados.**

### 3.2 O VT também NÃO é automático, e não é enviado pelo sistema

O modelo citado como referência funciona assim: o link do VT é um **token assinado na hora**
(`vt-coleta/vt-link-token.ts:97`), **não persistido**, chaveado pela admissão, gerado por **clique
do consultor** na ficha, e o sistema **não manda nada**: o time copia e envia pelo canal que já
usa (decisão registrada em `solicitacao-vt.service.ts:40`).

Ou seja, o que o VT tem e o Portal não tem é **o botão na ficha**, não o automático.

### 3.3 A diferença estrutural que impede copiar o VT ao pé da letra

| | Link do VT | Link do Portal |
|---|---|---|
| Existe como linha no banco | não, é token derivado | sim, `portal_links` |
| Gerar de novo | inofensivo, os dois valem | **mata o anterior** |
| Revogável | não | sim |
| Validade | dias, configurável | 72 horas |

**Consequência direta:** um botão "gerar link" na ficha, clicado por engano ou por um segundo
consultor, **derruba a sessão do candidato que está enviando documento naquele momento**. No VT
esse risco não existe. A abstenção que protege disso (recusar quando há link vivo já acessado)
existe em `emitirLinkParaEnvio` (`portal-identidade.service.ts:400`) e **não existe** na rota crua
que a ficha usaria.

---

## 4. Os bloqueadores de infraestrutura, medidos

1. **O Portal não existe em produção.** As tabelas `portal_*` estão apenas no banco
   `ea_automatic_homolog`. Em `ea_automatic` (produção) não há nenhuma delas.
2. **O correio do Portal não está configurado** nem em produção nem na homologação
   (`PORTAL_CORREIO_*` ausentes nos dois `.env`). Sem ele, qualquer envio por e-mail, automático
   ou manual, recusa com `CANAL_INDISPONIVEL` e não emite link. Isso é config, não código.

---

## 5. O desenho, em opções para o diretor decidir

### Decisão 1: ONDE o link aparece

- **Opção 1A, a ponte curta.** Bloco "Portal Do Candidato" na ficha da admissão, ao lado do bloco
  do VT: gerar, copiar, validade, estado do link e reenviar por e-mail. Vale para qualquer
  admissão, venha de onde vier. **Reusa tudo**, as rotas já existem. É a que replica o VT.
- **Opção 1B, só descoberta.** Deixar onde está e tornar o modal "Enviar link" visível, por
  exemplo com um atalho a partir da ficha. Menor alcance, não entrega o copiar e colar.
- **Opção 1C, as duas.**

### Decisão 2: COMO o link nasce

- **Opção 2A, por clique, igual ao VT.** O consultor gera quando precisa. É o modelo que o
  diretor apontou como referência, e é o de menor risco.
- **Opção 2B, automático ao nascer a admissão viva.** Nos dois nascimentos: `AdmissoesService.
  create` (o "+ Nova Admissão") e `aplicarLiberacao` (funil e Pandapé). Custo: o link vive 72
  horas, então nasce e morre antes de a maioria dos candidatos ser contatada, e o consultor gera
  outro de todo jeito.
- **Opção 2C, automático com envio.** Só faz sentido depois de o correio ser configurado, e
  depende de o candidato ter e-mail, que hoje é campo opcional com aceite (`admissoes.service.
  ts:515`).

### Decisão 3: O QUE fazer com o gancho morto do funil

Ele está no código, recusa sempre e ninguém percebe. Ou ele passa a disparar no momento certo
(depois da liberação, não antes), ou é removido. Deixar como está é dívida invisível.

---

## 6. O que reusa e o que é novo

**Reusa inteiro:** a tabela `portal_links`, o emissor `PortalIdentidadeService`, o serviço de
envio com a ordem de passos já auditada, as rotas de emitir, revogar, bloquear e desbloquear, o
Gerenciador e o catálogo de motivos de recusa.

**É novo:** o bloco na ficha (frontend), a decisão de qual rota ele chama, e a guarda contra
matar o link vivo em uso. Se o diretor escolher o automático, mais o gancho no ponto certo.

---

## 7. Auditoria de segurança do DESENHO (§A.38, §A.40)

O desenho foi auditado **antes** de qualquer linha ser escrita. Veredito:
**bloco na ficha APROVADO COM CONDIÇÕES, emissão automática no nascimento VETADA.**

### 7.1 O que a auditoria achou, e o coordenador conferiu

**RBAC, e este é o achado que mais pesa.** O menu que hoje governa a emissão é `portal-links`,
**grupo ADMIN** (`domain/menus.ts:713` e `:720`), nunca concedido a ninguém. A ficha da admissão
vive em **quatro telas de uso diário** (Esteira, Gerenciador, Não Conformidades, Benefícios), e o
menu `esteira` é **grupo OPERACAO**, que todo COMUM recebe. Pôr o botão na ficha ou dá 403 para
quase todo o time, ou exige reivindicar a emissão pelo menu `esteira`, e aí **fabricar credencial
de acesso ao prontuário do candidato vira capacidade de todo COMUM**, sem o diretor liberar nada.
É o incidente da §A.23 repetido.

**Conferido pelo coordenador, e procede:** `portal-links` **não está** em
`MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER` (`menus.ts:1509`) nem em `MENUS_SOMENTE_SUPER_ADMIN`
(`:1678`). Pela regra do `MenuGuard` (`auth/guards/menu.guard.ts:83`), **todo MASTER da área ADM
já passa** por essas rotas sem concessão nominal. Em produção são **3 MASTER na área ADM**
(medido). Hoje isso é inofensivo porque não existe botão em tela nenhuma que eles usem. O bloco
na ficha **converte esse bypass latente em um clique**.

**A concentração dos três fatores, e esta é a parte que o coordenador não tinha visto.** O link
sozinho não abre nada: a identificação exige **link mais CPF mais data de nascimento**
(`portal-identidade.service.ts:712`). A ficha da admissão **já mostra o CPF em claro**
(`AdmissaoDetalheModal.tsx:960`) **e a data de nascimento** (`:964`). Somar o link ali põe, na
mesma tela e a três centímetros um do outro, **tudo o que é preciso para assumir a sessão do
candidato** e navegar o prontuário dele. Hoje esses fatores estão separados por tela e por menu.

**A rota crua não serve para a ficha.** `POST portal/links/:admissaoId` devolve a URL em claro no
corpo (`portal-identidade.service.ts:313`), enquanto a rota de envio **de propósito não devolve**
(`portal-envio.controller.ts:96`). Ela também **não checa farol**, então a ficha passaria a emitir
credencial de coleta para quem **declinou**, para quem foi **rescindido** e para pré-admissão cuja
liberação foi **recusada**. E ela mora sob o prefixo `portal/`, o mesmo que a barreira allowlista
para a internet, decisão que a casa já tomou uma vez ao mover o envio para fora dali.

**Destruição de sessão, gravidade alta.** A rota crua não tem a abstenção S15: clicar "gerar"
**mata a sessão do candidato que está enviando documento naquele instante**, em silêncio, com o
consultor vendo um link novo e bonito na tela. É o formato de dano da §A.33.

### 7.2 Por que o automático foi VETADO

1. **Não há a quem entregar.** O e-mail é opcional no wizard (`admissoes.service.ts:515`), então
   o `create` produziria links de 72h **sem destinatário**, carimbados `ENTREGA_A_MAO`, que é o
   carimbo de "alguém entregou por fora" aplicado a um link que ninguém entregou. A trilha passa a
   mentir sobre a origem.
2. **Estoque de credencial viva sem finalidade**, o oposto da minimização da §A.6.
3. **Expira antes de servir, e o reparo destrói.** Pior: a janela de reenvio de 3 minutos conta a
   partir da criação, então o link automático recém-nascido **bloqueia o envio legítimo** feito
   minutos depois. O automático atrapalha o caminho bom.
4. **`aplicarLiberacao` é pior que `create`**, porque a pré-admissão está justamente no farol que
   o envio recusa de propósito.

Se o diretor quiser automático, o desenho tem de partir do **gancho único que já existe**
(`candidatos.service.ts:1998`), corrigido para disparar **depois** da liberação, e não criar uma
segunda porta sobre as mesmas pessoas (§A.40, regra 3).

### 7.3 As seis condições bloqueantes para o bloco na ficha

1. O diretor decide **explicitamente qual menu** governa a emissão pela ficha (§A.23). Reivindicar
   `PortalLinksController.emitir` pelo menu `esteira` só para calar o 403 está **vetado**.
2. Decidir sobre o bypass do MASTER: ou `portal-links` entra em
   `MENUS_QUE_EXIGEM_MARCACAO_DO_MASTER`, ou fica registrado por escrito que os 3 MASTER da área
   ADM passam a emitir link com um clique.
3. **Abstenção S15 obrigatória** no caminho da ficha, apresentada como desfecho normal e não como
   erro.
4. **Recorte de farol** igual ao do envio: nada de emitir para `DECLINOU`, `RESCISAO`,
   `AGUARDANDO_LIBERACAO` e `LIBERACAO_RECUSADA`.
5. Toda rota nova, **inclusive a de ler o estado do link**, nasce reivindicada por menu. Operação
   que nenhum menu reivindica **passa livre** pelo guard, e este é o furo mais fácil de introduzir
   sem ninguém notar.
6. Nenhuma nova exposição de CPF no bloco, e o link fora de log, de trilha e do banco.

### 7.4 Quem rodou

| Agente | Frente | Veredito |
|---|---|---|
| Explore | ciclo de vida do link do Portal | mapa entregue |
| Explore | modelo do link do VT | mapa entregue |
| Explore | diff "+ Nova Admissão" versus funil | mapa entregue, achou o gancho morto |
| seguranca | auditoria do desenho, antes de construir | ficha APROVADA COM 6 CONDIÇÕES, automático VETADO |
| tester | não acionado | não há código escrito nesta sessão |

Coordenador: investigação de alcance, medição na base, e conferência dos dois achados decisivos
da auditoria (grupo do menu e bypass do MASTER), ambos procedentes.
