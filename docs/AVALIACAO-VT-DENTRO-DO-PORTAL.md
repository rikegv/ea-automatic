# Avaliação: Trazer O Formulário De Vale-Transporte Para Dentro Do Portal Do Candidato

> **Parecer do `arquiteto`. Nada foi construído e nada foi alterado.** Leitura de código, leitura do
> banco em modo somente leitura e comparação entre os ambientes. Todas as afirmações têm arquivo e
> linha, ou a contagem que as mediu. §A.6: nenhum CPF, nome, e-mail ou endereço aparece aqui, só
> contagens.

---

## 0. O Veredito, Em Uma Linha

**COMPLEXO. Não vale trazer o formulário para dentro do Portal agora.** A condição do diretor ("só
se for simples") não é atendida: o que existe do VT hoje não é um componente reusável, é **três
implementações paralelas do mesmo formulário**, nenhuma delas em forma de peça, e a que está viva de
verdade **não é a que mora neste repositório como tela**. Somado a isso, a casa do VT na trilha da
Sol precisaria virar um **segundo tipo de casa** (preencher, em vez de enviar arquivo), e o modelo
da trilha é de um tipo só, de ponta a ponta.

Existe, porém, um **caminho pequeno e honesto**, que não é "trazer para dentro" e sim "apontar de
dentro": a casa ganha um botão que abre o formulário de VT que já está no ar. Está dimensionado na
seção 6, com a fraqueza dele declarada.

---

## 1. O Achado Do Diretor: Confirmado, E Ele Muda A Pergunta

O diretor mediu que `FORMULARIO_VT` já aparece como casa da trilha, com exigência OBRIGATÓRIO.
**Está correto, e a medição no banco confirma.**

A trilha da Sol **não se monta pela `regua_documental`**, e isso está escrito e travado em teste:
a fonte dos passos é `documentos_admissao`
(`apps/backend/src/portal/portal-documentos.service.ts:37-52`, e o teste que proíbe o contrário em
`apps/backend/src/portal/portal-documentos.spec.ts:255`). A régua entra **só por `leftJoin`**, para
trazer a `exigencia` daquele par (cliente + cargo)
(`apps/backend/src/portal/portal-documentos.service.ts:212-221`).

Medido em `ea_automatic_homolog` (o banco da 3120, que é onde o diretor olhou):

| medida | valor |
|---|---|
| linhas de `regua_documental` com `FORMULARIO_VT` OBRIGATORIO | 19 |
| linhas de `regua_documental` com `FORMULARIO_VT` NAO_OBRIGATORIO | 58 |
| linhas de `documentos_admissao` de `FORMULARIO_VT` PENDENTE | 23 |
| linhas de `documentos_admissao` de `FORMULARIO_VT` ENTREGUE | 44 |
| regras de auditoria cadastradas para `FORMULARIO_VT` | 1 |

Em produção (`ea_automatic`) o mesmo tipo está em **138 linhas de régua** (80 OBRIGATORIO, 57
NAO_OBRIGATORIO, 1 FACULTATIVO), sobre **554 pares (cliente + cargo)**, e tem **205 documentos de
admissão** (158 ENTREGUE, 47 PENDENTE). Ou seja: o tipo **não é dormente**, e o texto da §A.17 que
diz "0 réguas, 0 documentos" está **defasado**.

**O que acontece hoje quando o candidato chega nessa casa:** ela se comporta como qualquer outra
casa de documento. Ele sobe uma foto ou um PDF, o Portal emite a credencial de escrita, o arquivo vai
para o balde do Portal, a IA audita (há regra cadastrada para o tipo) e o documento fica
`AGUARDANDO_AUDITORIA`, **nunca `ENTREGUE` direto**
(`apps/backend/src/portal/portal-credencial.service.ts:1235-1245`). **A casa funciona ponta a ponta
hoje.** Ela pede o papel preenchido, não o preenchimento.

**Conclusão do item:** a intuição do diretor está certa, o caminho a avaliar é "trocar o que a casa
faz", não "acrescentar uma casa". O que a medição mostra em seguida é que **trocar o que a casa faz é
a parte cara**, e não a barata.

---

## 2. (a) O Que Já Existe Do VT, E O Que É De Fato Reusável

### 2.1 Existem TRÊS formulários de VT, não um

| # | onde | linhas | estado real |
|---|---|---|---|
| 1 | `apps/frontend/src/app/vt/page.tsx` | 1012 | **órfão.** Nenhum link no frontend aponta para `/vt` (varredura feita). Sem mudança de conteúdo desde 2026-07-15 (`6260fcd`); o único toque posterior foi a renomeação global do sistema (`72ceb76`) |
| 2 | `apps/vt-online/public/app.js` | 1085 | **é o que está no ar.** JavaScript puro, app do Firebase, mantido de verdade (último ajuste em 2026-09-08, `2a682aa`) |
| 3 | `apps/ai-service/app/vt_pdf.py` e `apps/vt-online/functions/vt_pdf.py` | 314 cada | **duas cópias do gerador de PDF que JÁ DIVERGIRAM**: `diff` entre os dois devolve 68 linhas |

A prova de qual está viva é a configuração: em `apps/backend/.env` a variável `VT_LINK_BASE_URL`
**não existe**, e o padrão do código é o app externo
(`apps/backend/src/vt-coleta/vt-link-token.ts:33`,
`https://vt-online-soulan.web.app/vt`). Os números confirmam: em produção há **199 linhas em
`formularios_vt`** e **205 itens `CASADO` no ledger `vt_coleta`**, que é o caminho do app externo. O
caminho da tela interna praticamente não produziu nada.

### 2.2 O que é reusável, e é a boa notícia: o backend

| peça | arquivo | reusável? |
|---|---|---|
| validação do envio, regra do cartão OUTRO, **soma dos totais no servidor** | `apps/backend/src/vt/vt.service.ts:202-262` | **sim, quase como está.** Recebe `admissaoId` e o payload, não sabe de sessão |
| geração do PDF (optante e não optante) | `apps/backend/src/vt/vt.service.ts:271+` mais `apps/ai-service/app/vt_pdf.py` | **sim.** Monta a partir do banco, o binário só trafega e não é gravado |
| tabela de tarifas viva e a tela `/admin/tarifas` | `apps/backend/src/admin/tarifas/tarifas.service.ts`, `apps/frontend/src/app/(app)/admin/tarifas` | **sim.** 18 tarifas ativas em produção e 18 em homologação |
| consulta de CEP pelo servidor | `apps/backend/src/vt/vt.service.ts:166` | **sim**, mas hoje está atrás do `VtSessaoGuard` |
| baixa do documento na régua e reavaliação da esteira | `VtColetaService.darBaixaVt`, `apps/backend/src/vt-coleta/vt-coleta.service.ts:507-534` | **sim.** Método público, recebe `admissaoId` e `tipoDocumentoId` |

### 2.3 O que NÃO é reusável, e é a má notícia: a tela

Nenhuma das três implementações é um componente. A tela órfã é **uma página monolítica** com todo o
estado inline e **primitivos de UI próprios** (`Casca`, `Secao`, `Campo`, `BotaoOpcao`, `SelectBusca`
em `apps/frontend/src/app/vt/page.tsx:824-935`), fora do design system. No instante em que ela for
tocada, o `SelectBusca` caseiro entra em conflito com a §A.35 (todo seletor usa o `Select` do design
system) e vira conversão obrigatória.

Trazer o VT para dentro do Portal, portanto, **não é reusar uma peça: é escrever o QUARTO
formulário**, agora em React, mobile, com o design system e dentro da metáfora do tabuleiro da Sol
(`apps/frontend/src/app/portal/page.tsx`, 1726 linhas).

### 2.4 Um achado lateral, fora do escopo, que o diretor deve saber

O app externo, que é o que está no ar, **não lê a tabela de tarifas**: ele carrega um arquivo
estático, `fetch("/tarifas.json")` (`apps/vt-online/public/app.js:1063`), com 18 tarifas congeladas
no deploy. A frase da §A.17 "mantida pela tela `/admin/tarifas`" só vale para o caminho órfão. Quem
edita uma tarifa hoje **não muda o que o candidato vê**. Isto é registro, não proposta de trabalho
(§A.31).

---

## 3. (b) O Que Está Preso, Peça Por Peça

### 3.1 O link (`VT_LINK_PRIVATE_KEY`): DESENCAIXA, e é o único que desencaixa limpo

Dentro do Portal o candidato já provou quem é (link do RH mais CPF mais data de nascimento, em
`apps/backend/src/portal/portal-identidade.service.ts:668-790`) e carrega uma sessão curta que o
`PortalSessaoGuard` verifica. O link do VT seria **dispensável**, não é dependência de código: ele é
gerado por um serviço isolado (`apps/backend/src/vt-coleta/vt-link.service.ts`) cujo único papel é
assinar a URL do app externo.

**Mas a razão de ele desencaixar é um aviso, não um elogio.** O parecer de segurança do Portal
**proibiu explicitamente replicar o modelo de token do VT**, e a proibição está escrita no contrato
compartilhado: "nem o link nem a sessão carregam CPF, nome ou data de nascimento. O token do VT
carrega (`ClaimsTokenVt`), e foi justamente isso que o parecer proibiu replicar aqui"
(`packages/shared-types/src/index.ts:3801-3803`). E, mais adiante: "O casamento é contra a admissão
DO LINK, e não uma busca global por CPF como faz o VT"
(`packages/shared-types/src/index.ts:3817-3818`). As duas identidades não são irmãs: **uma foi
desenhada recusando a outra.**

### 3.2 A geração do PDF: DESENCAIXA

Roda no `ai-service` (reportlab), a partir do que está no banco, e o binário só trafega
(`apps/backend/src/vt/vt.service.ts:266-271`). Serve a qualquer chamador que tenha o `admissaoId`.
A duplicata do gerador dentro do app do Firebase (já divergida em 68 linhas) fica de fora da conta,
porque o caminho de dentro usaria a cópia do `ai-service`.

### 3.3 O armazenamento: NÃO DESENCAIXA, e são dois mecanismos, não um

| | Portal | VT |
|---|---|---|
| variável | `PORTAL_GCS_BUCKET` | `VT_COLETA_GCS_BUCKET` |
| quem escreve | o navegador do candidato, com bilhete Ed25519 e URL assinada por um **emissor** com identidade de runtime | o app do Firebase |
| quem lê | `apps/ai-service/app/portal_bucket.py`, conta **dedicada**, somente leitura, sem papel no Drive | `apps/ai-service/app/routers/coleta_vt.py`, pelo `gcs.py` |
| separação | o próprio módulo diz: "NÃO reusar `gcs.py` aqui, em hipótese nenhuma" (`apps/ai-service/app/portal_bucket.py:16`) | |

São **dois baldes, duas identidades de serviço e dois leitores, separados de propósito**
(`apps/backend/src/portal/portal-armazenamento.service.ts:24-31`: juntar as duas daria à identidade
que assina a credencial do candidato o poder de apagar o balde inteiro).

**E o ponto que decide:** no caminho de dentro do Portal o VT **não usaria nenhum dos dois**. Não há
objeto no balde, porque não há upload: o PDF nasce no processo. Ele precisa ir para o Drive, e o
**único caminho de VT para o Drive que existe hoje está embutido dentro de
`VtColetaService.processarItem`** (`apps/backend/src/vt-coleta/vt-coleta.service.ts:307-372`),
amarrado ao nome do objeto no balde, ao caminho de staging e ao ledger `vt_coleta`. Precisaria ser
**extraído**, e extrair rotina de arquivamento validada é exatamente o caso da §A.26.

### 3.4 A identificação do candidato: NÃO COLIDE, mas são duas portas

O VT identifica por **CPF mais data de nascimento, em busca global**
(`apps/backend/src/vt/vt.service.ts:109-130`, com balde de 10 tentativas por CPF). O Portal
identifica por **link mais CPF mais data de nascimento**, sem busca global. Dentro do Portal a porta
do VT simplesmente não seria usada: o `admissaoId` vem de `req.portal.admissaoId`, que o candidato
não tem como escolher (`apps/backend/src/portal/portal-documentos.service.ts:113-116`). Não há
colisão de identidade. **O que colide é o número de portas públicas**, e isso está no item 3.5.

### 3.5 O que a memória de sessão dizia, medido contra o código e contra os ambientes

A memória registra um pivô de Drive para balde GCS, com parte pronta e não deployada, travada em
infra. **Medido hoje, o quadro é outro e mais importante: não existe nenhum ambiente em que as duas
frentes funcionem juntas.**

| | produção (`apps/backend/.env`) | homologação (`/home/henrique/apps/ea-homolog/apps/backend/.env`) |
|---|---|---|
| `VT_LINK_PRIVATE_KEY` | preenchida | **VAZIA** |
| `VT_COLETA_GCS_BUCKET` | preenchida | **VAZIA** |
| `VT_LINK_BASE_URL` | ausente, cai no app do Firebase | `http://127.0.0.1:9`, ou seja, inerte de propósito |
| `PORTAL_LOG_PEPPER` | **ausente** | preenchida |
| `PORTAL_LINK_PRIVATE_KEY` e as demais chaves do Portal | **ausentes** | preenchidas |

E o Portal **não está commitado**: `git status` traz **52 arquivos de portal sem rastreamento**, e
`git log` do diretório `apps/backend/src/portal` (62 arquivos) **não devolve nenhum commit**.

Isto tem duas consequências diretas sobre a conta de esforço:
1. **A frente do Portal ainda não subiu.** Acrescentar VT a ela é acrescentar escopo a uma entrega
   que ainda não foi validada nem publicada.
2. **A validação (§A.32, na 3120) exigiria provisionar VT na homologação antes.** O caminho de
   dentro dispensa o balde e a chave do link, então o que faltaria é pouco (a tabela de tarifas já
   está lá, 18 linhas, e a rota de PDF do `ai-service` também), mas não é zero.

---

## 4. (c) Como Ele Entraria: As Duas Formas, E O Que "Opcional" Significa Aqui

### 4.1 Forma A, mais uma etapa na trilha (depois dos documentos)

Custa **mais**, e por um motivo estrutural: a trilha é de **um tipo de casa só**. O contrato
`PassoDaTrilhaPortal` (`packages/shared-types/src/index.ts:3741-3770`) não tem campo de "tipo de
casa", e toda a régua pura assume arquivo: `podeEnviar`, `estadoDaCasa`, `proximoPasso`,
`resumoFinal` e `validarArquivo`, em `apps/frontend/src/lib/portal-trilha.ts`. Do lado do servidor, o
mesmo: a contagem de tentativas, o teto e o "caiu para o time" vivem em
`PortalCredencialService`, e uma casa de preenchimento **não tem arquivo, não tem credencial, não tem
tentativa e não tem auditoria**. Uma casa de outro tipo obriga a mexer nos cinco pontos da régua
pura, no contrato compartilhado (que tem **dono único**, o coordenador, §A.39), na página do Portal e
nos testes que travam cada um deles.

### 4.2 Forma B, trocar o que a casa `FORMULARIO_VT` faz

Custa **menos que a Forma A**, e é o recorte certo: a casa já existe, já tem estado, já tem exigência
e já está nas 138 réguas de produção. Mas **ela continua sendo uma casa de outro tipo**, com
exatamente o mesmo custo estrutural do item 4.1. O que a Forma B economiza é a ordenação, a criação
do passo e a decisão de onde ele aparece. **Não economiza o segundo tipo de casa.**

Some-se a superfície pública: hoje o Portal tem **duas** rotas de escrita do candidato
(`portal/credencial` e `portal/confirmar`, em `apps/backend/src/portal/portal.controller.ts:85-105`),
as duas no formato de arquivo, atrás da barreira do Fernando com allowlist de caminho. O VT precisa
de pelo menos **mais três** (tarifas, CEP e envio) mais o PDF. Cada uma é caminho novo a allowlistar,
a limitar por taxa e a auditar, e o documento de segurança do Portal já registra como **veto aberto**
(V1) o fato de o Portal dividir o balde global do throttler com o sistema interno
(`docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md:404` e `:449`).

### 4.3 Quem decide que o VT é opcional, se a régua diz OBRIGATORIO

Esta é a melhor notícia do parecer, e ela **não custa nada**.

A régua **não precisa mudar**, e "opcional" não precisa virar conceito novo. O formulário de VT já
tem **duas saídas**, e as duas produzem documento: **optante** (com itinerário e compromisso) e
**não optante** (a recusa formal). Estão as duas no gerador
(`apps/backend/src/vt/vt.service.ts:266-269`), e o não optante **não descreve itinerário**
(`apps/backend/src/vt/vt.service.ts:203-204`).

Ou seja: **a casa é obrigatória, a resposta é que é livre.** O candidato que não usa vale-transporte
responde "não optante", o sistema gera o PDF de recusa, e a casa fecha. Ninguém fica preso e ninguém
precisa de uma régua por candidato. **Quem decide a exigência continua sendo a régua por (cliente +
cargo), como manda a §A.3 regra 4.** Nas 57 réguas em que o tipo está NAO_OBRIGATORIO, a casa aparece
como facultativa e pronto.

Registre-se o efeito colateral da alternativa ruim, para que ninguém a proponha depois: tornar a
exigência "por escolha do candidato" seria criar uma **segunda régua de exigência** ao lado da
`regua_documental`, que é exatamente a divergência que o ajuste da etapa 4 eliminou (§A.19).

---

## 5. (d) O Veredito, Dimensionado

### 5.1 COMPLEXO. Os oito motivos, cada um conferível

1. **Não existe componente para reusar.** Três formulários, nenhum em forma de peça: 1012 linhas
   órfãs, 1085 linhas de JavaScript puro no ar, e dois geradores de PDF já divergidos em 68 linhas.
   Trazer para dentro é escrever o quarto.
2. **A trilha ganha um segundo tipo de casa.** O modelo é de um tipo só, do contrato compartilhado
   (`packages/shared-types/src/index.ts:3741`) até a régua pura
   (`apps/frontend/src/lib/portal-trilha.ts`) e o contador de credenciais.
3. **Três rotas públicas novas**, no mínimo, numa superfície que hoje tem duas e que carrega um veto
   de throttler ainda aberto.
4. **O arquivamento no Drive precisa ser extraído** de dentro de `VtColetaService.processarItem`, que
   é código validado e em produção (§A.26 obriga perguntar antes).
5. **Dois escritores do mesmo dado, sem reconciliação.** O app do Firebase continua no ar, e cada
   envio de VT é um **insert**, não uma correção: "cada envio é uma DECLARAÇÃO NOVA do funcionário"
   (`apps/backend/src/vt/vt.service.ts:225-229`). Um candidato poderia declarar VT pelos dois
   caminhos, e a coleta ainda daria baixa por fora. É literalmente a pergunta obrigatória de briefing
   da §A.40, "quem mais escreve este dado?", e a resposta seria "dois, sem ninguém desempatando".
6. **Não há ambiente onde as duas coisas funcionem juntas** (tabela do item 3.5). A §A.32 exige
   validar na 3120, e hoje a 3120 tem o Portal e não tem o VT.
7. **O Portal ainda não está commitado nem em produção** (52 arquivos sem rastreamento, zero commits
   no diretório). Acrescentar VT é engordar uma frente que ainda não fechou.
8. **É acionamento obrigatório da frente de segurança** (§A.38), pelo motivo da seção 7. Isso é uma
   rodada a mais, por desenho, e entra na conta do "simples".

### 5.2 O tamanho de cada caminho

| caminho | frentes | o que precisa ser feito | o que arrasta |
|---|---|---|---|
| **Deixar separado (fazer nada)** | nenhuma | nada. A casa `FORMULARIO_VT` já funciona como casa de upload, com regra de auditoria cadastrada | nada |
| **Apontar de dentro (seção 6)** | `frontend` mais um toque de `backend` | um botão na casa do VT e uma rota que devolve o link já gerado por `VtLinkService` | a assincronia da baixa (até 15 minutos) |
| **Trazer para dentro (Forma B)** | `arquiteto`, `backend`, `frontend`, `ia`, `seguranca`, `tester`, mais o coordenador no contrato compartilhado | quarto formulário em React e design system; segundo tipo de casa no contrato, na régua pura e na página; três rotas públicas novas; extração do arquivamento no Drive; decisão sobre o app do Firebase; provisionamento do VT na homologação | o contrato compartilhado (dono único), a régua pura da trilha e seus testes, o `PortalCredencialService`, o `VtColetaService` em produção, a barreira do Fernando, e a frente de segurança com poder de veto |

---

## 6. O Caminho Pequeno, Se O Diretor Quiser Uma Ponte

Não é "trazer para dentro", e por isso ele é honesto: é **apontar de dentro**.

A casa `FORMULARIO_VT` da trilha ganha um botão "preencher o formulário" ao lado do envio de arquivo.
O botão abre o **link de VT que já existe e já está no ar** (`VtLinkService`, validade de 7 dias,
`apps/backend/src/vt-coleta/vt-link.service.ts`). O candidato preenche no app como preenche hoje, a
varredura recolhe, arquiva no Drive e **dá baixa na mesma casa**, que fecha sozinha
(`VtColetaService.darBaixaVt`).

**O que ele não toca:** não cria tipo de casa novo, não cria escritor novo do dado, não escreve PII
nova, não mexe na régua pura da trilha nem no `PortalCredencialService`.

**A fraqueza, dita na cara:** (1) o candidato **sai do Portal** para outro app, com outra aparência,
o que contraria o espírito de "tudo na trilha da Sol"; (2) a baixa é **assíncrona**, pela varredura
de 15 minutos (`apps/backend/src/vt-coleta/vt-coleta-scheduler.service.ts:18`), então a casa **não
fica verde enquanto o candidato está olhando**, e ele pode achar que não deu certo; (3) o link do VT
carrega CPF e nome no token, que é justamente o modelo que o parecer do Portal recusou
(`packages/shared-types/src/index.ts:3801-3803`), então mesmo esta ponte pequena passa pela frente de
segurança antes de subir.

---

## 7. (e) O Risco De §A.6, Mesmo Sem Construir

**O ponto mais sensível, e ele é de princípio, não de detalhe.**

Hoje o Portal **não persiste nada do que o candidato entrega**. O arquivo vai para o balde e não
entra no banco; o valor que a IA extrai **viaja na resposta e é descartado**, e o teste que prova as
duas metades está em `apps/backend/src/portal/portal-sugestao-pii.spec.ts:6-18`; e o veto V12 fecha a
regra: "nenhum campo vindo da IA escreve direto em dado autoritativo, quem confirma é humano, e a
confirmação é o que grava" (`docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md:267-269`).

O formulário de VT **quebra essa simetria**. Ele grava, a partir do que o candidato digitou e **sem
humano no meio**, o endereço completo em `formularios_vt`: `cep`, `logradouro`, `numero`,
`complemento`, `bairro`, `cidade`, `uf` (`apps/backend/src/vt/vt.service.ts:231-245`). Seria a
**primeira escrita de dado pessoal no banco do EA vinda da superfície pública do Portal**.

Três precisões, para o parecer não exagerar nem suavizar:
- **Não é violação do V12.** O V12 trata de valor extraído pela IA, e aqui o valor é digitado pela
  própria pessoa, o que é declaração e não inferência.
- **O precedente já existe**, pelo app externo: as 199 linhas de `formularios_vt` em produção foram
  escritas exatamente assim, sem humano no meio.
- **Mas o precedente é de outra porta.** Trazer a escrita para dentro do Portal muda o modelo de
  ameaça do Portal, que foi desenhado e auditado sobre a premissa "o candidato não escreve no nosso
  banco". Quem decide se a premissa muda **não é quem escreve o código** (§A.38): é a frente
  `seguranca`, de forma adversarial, antes do deploy.

Itens que a auditoria teria de responder, se o diretor mandar seguir:
1. Retenção do endereço declarado. Hoje `formularios_vt` não tem prazo nem expurgo; o Portal trabalha
   com prazos curtos e com truncamento (o IP completo é truncado aos 90 dias,
   `apps/backend/src/portal/portal-trilha.service.ts:9`).
2. Log e trilha. A trilha do Portal é sanitizada por allowlist num ponto único
   (`domain/portal-evento.ts`); um envio de VT teria de entrar por ali, e **nenhum campo de endereço
   pode virar evento**.
3. Teto e abuso. O envio de VT é barato de repetir e cada repetição é um insert. O balde do
   throttler já é veto aberto (V1).
4. CEP por serviço externo. O caminho de dentro consulta o CEP **pelo servidor**
   (`apps/backend/src/vt/vt.service.ts:166`), o que é melhor que o app externo, que chama o ViaCEP
   direto do navegador do candidato (`apps/vt-online/public/app.js:542`). Mas passa a ser o EA
   mandando CEP de candidato para fora, e isso precisa de aval.

---

## 8. O Que O Diretor Decide

1. **Aceitar o veredito e deixar o VT separado** (custo zero, a casa de upload já funciona).
2. **Ou mandar construir a ponte pequena da seção 6** (botão na casa, baixa assíncrona de até 15
   minutos, passa pela segurança).
3. **Ou mandar construir por dentro mesmo, ciente de que é frente grande** (tabela da seção 5.2).
4. **Fora de escopo, mas medido e registrado aqui:** o app de VT que está no ar lê tarifas de um
   arquivo estático, então editar `/admin/tarifas` hoje não muda o que o candidato vê.
5. **Correção de documento:** a §A.17 diz que `FORMULARIO_VT` está dormente com 0 réguas e 0
   documentos. São **138 réguas e 205 documentos** em produção. A etapa 3 da §A.17 ("VT compõe o
   Kit") continua a fazer, mas a premissa de que ninguém ligou os fios do documento **não é mais
   verdadeira**.
