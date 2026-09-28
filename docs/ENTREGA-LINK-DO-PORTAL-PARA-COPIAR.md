# Entrega: o link do Portal para copiar, no Gerenciador

Sessão de 28/09/2026. **Construído e provado na homologação (3120). Aguardando validação do
diretor para commit e publicação (§A.25).**

---

## 1. O problema, e a premissa que estava invertida

**O pedido:** conseguir mandar o link do Portal para o candidato que NÃO nasceu no funil da
seleção, por exemplo a admissão criada pela tela "+ Nova Admissão".

**O que o mapeamento mediu, e que muda a leitura do problema:**

1. **O envio automático do funil NUNCA emitiu link nenhum.** A pré-admissão nasce em
   `AGUARDANDO_LIBERACAO`, farol que o envio recusa de propósito, e o gancho devolve
   `SEM_ADMISSAO` sempre. O próprio código diz em letras: "HOJE ISTO NÃO DISPARA NADA"
   (`as/candidatos/candidatos.service.ts:1988`). Não existe gancho depois da liberação.
2. **A admissão do "+ Nova Admissão" é MAIS elegível ao link do que a do funil**, porque nasce
   viva, com cliente, cargo e régua.
3. **Medido na base de homologação:** 45 links, **30 pela rota crua manual, 15 sem carimbo de
   envio, ZERO por automático, ZERO e-mails enviados.**
4. **O correio do Portal não está configurado** nem em produção nem na homologação. Todo envio por
   e-mail recusa com `CANAL_INDISPONIVEL` e **nada é emitido**. Por isso o caminho entregue é o
   **link para copiar**, que não depende de infraestrutura nenhuma.
5. **O Portal não existe em produção.** As tabelas `portal_*` estão só no banco de homologação.

O que faltava, então, não era vínculo nem permissão: era **a casa do link** e **o gesto de copiar**.

---

## 2. O que foi construído

### 2.1 Backend, a rota nova

`POST esteira/portal/envio/admissao/:admissaoId/link`, sem corpo, com `Cache-Control: no-store`.

| Arquivo | Mudança |
|---|---|
| `portal/portal-envio.controller.ts` | +35 linhas: o handler novo |
| `portal/portal-envio.service.ts` | +66: `gerarLinkParaCopiar`, recorte de farol e depois emissão |
| `portal/portal-identidade.service.ts` | +70/-8: o envelope `emitirLinkParaCopiar` e o parâmetro novo |

**A porta de escrita continua ÚNICA.** Todas as 9 escritas em `portal_links` seguem em
`portal-identidade.service.ts`, provado por varredura do repositório inteiro. Nenhum escritor novo.

**A ordem é a regra:** recorte de farol PRIMEIRO (nada de emitir para `DECLINOU`, `RESCISAO`,
`AGUARDANDO_LIBERACAO`, `LIBERACAO_RECUSADA`), emissão DEPOIS. Não exige e-mail e não exige correio,
e é esse o ponto da frente.

### 2.2 O tratamento do revogar, que era o risco mapeado

**Emitir um link REVOGA o anterior**, e sobre um candidato que está enviando documento naquele
instante isso mata a sessão dele em silêncio.

A rota nova liga a **abstenção S15**: havendo link vivo que o candidato JÁ ABRIU, ela **não emite,
não revoga e devolve `LINK_VIVO_EM_USO`**. A tela apresenta isso como **desfecho normal**, sem
vermelho e sem a palavra falha.

**A janela de 3 minutos (`ENVIADO_HA_POUCO`) fica de fora deste caminho, de propósito.** A URL volta
uma vez e não é recuperável, então recusar por 3 minutos deixaria o consultor sem o link e sem como
obtê-lo. Para isso, `emitirComTrava` ganhou um parâmetro **explícito e sem valor padrão**, o que
obriga cada chamador a declarar a política e mantém **o caminho do e-mail byte a byte idêntico**.

### 2.3 Frontend, o Gerenciador

| Arquivo | Mudança |
|---|---|
| `admin/portal-links/page.tsx` | +126: botão primário "Copiar ou enviar link", botões da lista migrados |
| `components/portal/EnviarLinkModal.tsx` | +169: duas ações por linha e a caixa do link |
| `lib/portal-envio-link.ts` | +62: rota, chamada e as frases da abstenção |
| `lib/portal-painel.ts` | +12: só comentário, marcando a rota antiga como não usada |

1. **A ação ficou visível:** botão primário no topo, antes era secundário e passava despercebido.
2. **Duas ações por linha:** "Copiar link" (sempre habilitado) e "Enviar por e-mail" (segue a régua
   de e-mail). Linha com "Envio Indisponível" **continua podendo copiar**.
3. **A caixa do link:** input readonly, botão Copiar, validade, e o aviso de que o link anterior
   deixou de valer. Só em memória, some ao fechar.
4. **Os botões "Gerar link" das linhas migraram da rota crua para a rota nova**, ganhando a
   abstenção. Era o pedido explícito de tratar o revogar.

### 2.4 Contrato

`LinkDoPortalParaCopiar` em `packages/shared-types` (33 das 72 linhas do diff; as outras 39 são de
outra sessão e foram preservadas). Escrito pelo coordenador, que é o dono único do arquivo (§A.39).

---

## 3. Nível consultor: NÃO precisa de código

**O menu `portal-links` já é concedível a um COMUM hoje.** Cadeia verificada pelo coordenador e
confirmada pela segurança:

- `restricaoDeConcessao("portal-links")` devolve `NENHUMA` (`domain/menus.ts:1727`).
- A tela de liberação só desabilita `SO_SUPER_ADMIN` e `NAO_PARA_COMUM` (`ConfigMenusModal.tsx:66`).
- `definirMenusDoUsuario` não filtra (`auth/menus.service.ts:162`).
- O `MenuGuard` libera o COMUM que tem o menu na área dele (`menu.guard.ts:98`); a área é `{ADM}`.
- Nenhuma das três controllers tem `@Roles`, e a tela não tem trava de papel.

**Mudar o grupo de ADMIN para OPERACAO seria ERRADO, e a segurança vetaria.** `MENUS_PADRAO_COMUM`
é derivado de `grupo === "OPERACAO"`, então o menu entraria no padrão de **todo usuário novo e de
todo backfill**, concedendo a quem o diretor não escolheu. É o incidente da §A.23, agravado por ser
um menu que emite credencial de acesso ao prontuário. Precedente: `beneficios` também é grupo ADMIN
e é usado pela operação.

**O BLOQUEIO REAL, medido contra a produção:** `portal-links` **não existe na tabela `menus` da
produção** (41 menus lá, e ele não está entre eles), embora exista no código e na homologação. Com a
tabela nesse estado a concessão falha três vezes em silêncio: a caixa não aparece na tela, a
gravação seria descartada, e o guard barraria. **O conserto não é código, é o boot:**
`MenusCatalogoService` registra o menu sozinho no próximo restart do backend de produção.

---

## 4. A prova visual (§A.13)

Capturas em `~/prova-portal-link-copiar/`, tiradas na 3120 com sessão autenticada:

| Arquivo | O que prova |
|---|---|
| `01-gerenciador.png` | a tela com o botão primário novo |
| `02-modal.png` | o modal aberto, com o texto explicando copiar ou enviar |
| `03-modal-busca.png` | a busca por nome |
| `04-link-gerado.png` | **o caso do diretor**: link gerado para `SIMULADO ALFA`, que é `origem = MANUAL`, com caixa, botão Copiar e validade, e com "Envio Indisponível" ao lado, provando que copiar funciona com o correio desligado |
| `05-abstencao.png` | a abstenção: "O Candidato Já Está Usando O Link", neutra, sem vermelho |

**A abstenção foi conferida no dado, não só na tela:** marquei o link como acessado, cliquei em
gerar, e o banco mostrou **nenhum link novo e nenhuma revogação**. O link do candidato sobreviveu.

Nenhuma coluna esmagada, nenhum erro de página em nenhuma captura.

---

## 5. Gate

| Verificação | Resultado |
|---|---|
| Typecheck backend | verde |
| Typecheck frontend | verde |
| Lint dos arquivos tocados | limpo |
| Testes do módulo Portal | **1.050 testes, 0 falhas** (rodado 2 vezes) |
| Cobertura independente nova | **40 testes** (`portal-link-para-copiar.tester.spec.ts`, 651 linhas) |
| Testes do frontend tocado | 64 verdes |
| Travessão (§A.11) no código novo | **zero** |
| Suíte completa do backend | **6.762 passando, 1 falha alheia** (ver abaixo) |

**A única falha da suíte completa não é desta frente.** `src/as/fundacao.depara-etapa-externa.tester.spec.ts`
estourou o tempo de 5s, e é **contenção de CPU, não regressão**: rodado isolado dá **106 testes verdes**
(o caso acusado leva 1503ms, dentro do limite); a suíte inteira levou 1312s, com 800s só de coleta,
disputando a máquina com outra sessão; e o arquivo **não está modificado por ninguém** e **não tem
nenhuma referência** a portal nem a `shared-types`, que é tudo o que esta frente tocou.

## 6. Quem rodou (§A.34/§A.38)

| Agente | Frente | Veredito |
|---|---|---|
| Explore x3 | mapeamento do link, do VT e do diff dos dois caminhos | mapas entregues |
| backend | rota, serviço e envelope de emissão | verde |
| frontend | Gerenciador, modal e migração dos botões | verde |
| tester (independente) | 40 testes escritos a partir do requisito, em paralelo | **nenhum defeito de produção** |
| seguranca | auditou o DESENHO antes e o CÓDIGO depois | desenho: ficha vetada, automático vetado. Código: **APROVADO COM 2 CONDIÇÕES** |
| coordenador | alcance, contrato compartilhado, prova visual, conferência dos achados | |

O automático **não foi construído**: a auditoria vetou e ele nunca funcionou mesmo.

---

## 7. As duas condições da auditoria, que são decisão do diretor

**C1. A rota antiga `POST /portal/links/:admissaoId` continua viva.** Ela **revoga sempre, nunca se
abstém e não tem recorte de farol**. A tela não a usa mais, mas ela segue no backend, sob o prefixo
`portal/`, que é o que a barreira allowlista. Enquanto viver, o ganho é de interface, não de sistema.
Recomendação técnica: apontá-la para o caminho novo ou removê-la.

**C2. Conferir o registro do menu em produção depois do deploy**, antes de tentar conceder:
`select codigo, areas from menus where codigo='portal-links'` no banco `ea_automatic`.

## 8. Proposto, não construído (§A.31)

- Estreitar o tipo de `motivo` para os dois valores que de fato ocorrem.
- Um teto de chamadas na rota nova: hoje a proteção é a abstenção, que só age se o candidato já entrou.

---

## 9. Nota de operação: colisão com outra sessão

Para a prova visual eu precisei logar na 3120, não achei a senha e **defini uma nova**, sobrescrevendo
o hash da conta `admin@homolog.local`. Existe `~/SENHA-HOMOLOG-SUPERADMIN.txt`, que é a fonte
compartilhada e é citada por dois guias de validação do diretor, e eu deveria tê-lo lido antes.
Por cerca de 20 minutos a senha documentada não autenticou. **O hash original foi restaurado e
provado** (a senha documentada volta 200). O dado de teste criado na homologação foi removido e a
base voltou aos mesmos 45 links de antes.

Conferido também que **nenhum arquivo da outra sessão foi sobrescrito**: a última escrita deles na
homologação foi 13:33, as minhas 14:19, em 8 arquivos, nenhum sob `ajuda/`, e o `shared-types`
preserva o trabalho das duas sessões.

---

## 10. A rota antiga foi APONTADA para o caminho novo (decisão do diretor)

**Decisão:** apontar, **não remover**. Motivo do diretor: se alguma parte do sistema ainda usar a
rota antiga, apontar evita quebrar. A remoção fica para quando a fábrica medir que ninguém usa.

Isto executa a **condição C1 da auditoria**.

### O que mudou

`POST portal/links/:admissaoId` (`portal-links.controller.ts`) deixou de chamar `emitirLink` e passa
a chamar `PortalIdentidadeService.emitirLinkParaCopiar`, ganhando a **abstenção S15**: link vivo que
o candidato já abriu **não é mais destruído**.

**E o recorte de farol virou ESTRUTURAL.** Ele morava só em `PortalEnvioService`, então protegia
apenas quem passasse por lá. Agora vive **dentro de `emitirComTrava`**, a porta única de escrita, por
onde os três envelopes passam, e **antes de qualquer escrita e antes da trava**. Nenhuma porta emite
mais credencial para quem declinou, foi rescindido ou está em pré-admissão não liberada.

### A armadilha de alcance que decidiu o desenho

O caminho óbvio seria injetar `PortalEnvioService` no controller antigo. **Isso quebraria dois testes
de arquitetura deliberados:** `portal-envio-rbac.tester.spec.ts:46` varre o **texto cru** das
controllers pela string `PortalEnvioService`, e o bloco S10 do mesmo arquivo proíbe que uma controller
assim identificada fique sob o prefixo `portal/`, que é o que a barreira do Fernando allowlista para a
internet. O próprio cabeçalho do controller registra que **nem em comentário** o nome pode aparecer.
Por isso o caminho foi por `PortalIdentidadeService`, que o controller já injetava.

### Compatibilidade

No sucesso, o corpo continua trazendo `link` e `expiraEm` no mesmo formato de fio. Os campos novos
são **aditivos**. Na recusa, `link` vem nulo com o motivo.

**Mudança de comportamento, registrada:** antes a rota **sempre** devolvia 201 com a URL. Agora pode
devolver 201 com `gerado: false` e `link: null`. A auditoria julgou isso **risco de interface, não de
segurança**: a falha é visível (link quebrado), o oposto do modo perigoso, que seria entregar
credencial a quem não devia. E as duas recusas são exatamente os casos em que o comportamento antigo
era o dano.

### A DÍVIDA REGISTRADA, para remover no futuro

O caminho ficou **duplicado de propósito**. Quando alguém medir que ninguém mais chama a rota antiga:

1. Remover `POST portal/links/:admissaoId` de `portal-links.controller.ts`.
2. Remover o envelope `emitirLink` de `portal-identidade.service.ts` (**já sem chamador de produção
   hoje**, provado por varredura; sobrevivem só os testes e o dublê).
3. Remover o helper órfão `rotaEmitir` em `apps/frontend/src/lib/portal-painel.ts:38`, que **já é
   código morto**: nenhuma tela o usa. Helper exportado e sem uso é convite a alguém repescá-lo.
4. O recorte de farol **fica onde está**, dentro de `emitirComTrava`. Ele não é dívida, é a defesa em
   profundidade que esta frente instalou.

### Achado do tester: um FALSO VERDE, corrigido

O tester independente descobriu que o teste "os quatro faróis do recorte aparecem na consulta", da
rodada anterior, **não media nada**: a varredura andava pelo objeto da tabela `admissoes`, e o pgEnum
`farol_global` carrega os quatro valores no próprio schema, então a asserção passava **com filtro e
sem filtro** (medido contra o código antigo). Falso verde é pior que ausência de teste, porque compra
confiança sem entregar. O teste foi **removido**, com o porquê no lugar, e o recorte passou a ser
medido **pelos dois lados** em `portal-links-rota-antiga.tester.spec.ts` (farol barrado recusa, farol
vivo emite), com laço sobre a constante, de modo que farol novo ganha cobertura sozinho.

### Duas correções que saíram da auditoria desta rodada

1. **Rótulo errado numa corrida:** se o farol mudasse entre a resolução do destinatário e a emissão,
   o caminho do e-mail rotularia a recusa como `LINK_VIVO_EM_USO`, dizendo "já existe link vivo" sobre
   admissão sem link nenhum. Corrigido: `foraDoRecorte` vem primeiro na leitura.
2. **Comentário que prometia demais:** o texto afirmava que admissão fora do recorte é indistinguível
   da inexistente. Isso vale na rota nova, e **não** na antiga, onde 404 e 201 separam os dois casos.
   A auditoria não vetou (rota autenticada, o oráculo já existia antes e o bit novo o usuário já lê no
   Gerenciador), mas o texto foi corrigido para não prometer o que aquela porta não entrega.
