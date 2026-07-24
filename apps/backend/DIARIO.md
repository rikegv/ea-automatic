
---

## 2026-07-24 (8): Gerador de kit, trava por papel removida (menu governa) + mapa das travas sobreviventes

O COMUM tinha o menu Gerador de kit na sidebar, mas a tela mostrava "Acesso restrito, exclusivo de
Master / Super Admin", checagem de PAPEL sobrevivente do modelo antigo. Gate verde (typecheck back+front,
13 testes de menu, lint). Sem travessão.

**1. Ponto exato.** `app/(app)/gerador-kit/page.tsx`: bloco `if (!isAdmin) return <Acesso restrito>`
(linhas ~245-255), mais um `if (!token || !isAdmin) return` no efeito de retenção (131) e o
destructuring de `isAdmin` (95).

**2. Trava removida.** Tirei o bloco, o `isAdmin` do efeito e do destructuring. Quem governa a tela é o
menu `gerador-kit`: o `(app)/layout` já bloqueia quem não tem o menu, e o backend gate as operações pelo
mesmo menu. `KitController` não tem `@Roles`.

**3. Backend junto, DEFEITO em outra camada achado e corrigido.** As 5 operações da tela (`processar`,
`statusProcessar`, `downloadFuncionario`, `reimportar`, `downloadZip`) já eram gated pelo menu
gerador-kit, sem `@Roles`. MAS a tela também monta o dropdown com `GET /admin/kit-tipos`
(`KitTiposController.list`), que estava gated pelo menu `kit-regras` (coringa `KitTiposController.*`): um
COMUM com gerador-kit mas sem kit-regras tomaria 403 no dropdown. Corrigido: o coringa virou lista
explícita das ESCRITAS (`criar`/`atualizar`/`remover`), então a LEITURA de tipos fica ABERTA (leitura de
catálogo, "ler é trabalho"); as escritas seguem gated por kit-regras.

**4. Varredura das travas por papel sobreviventes (mapa completo).** A ÚNICA trava errada era a do
gerador-kit. As demais são o modelo NOVO (guard por menu) ou ações admin INTENCIONAIS que espelham um
`@Roles` do backend:
- `(app)/layout` e `admin/layout` e o card "Menu Gerencial" da Sidebar: guard por MENU (admin bypass OU
  tem o menu), correto, MANTER.
- Liberação, botões Recusar/Reativar `disabled={!isAdmin}`: intencional, `recusar`/`reativarRecusada` são
  `@Roles` admin. MANTER.
- Não conformidades, decidir liberação por `isAdmin`: intencional, `decidirLiberacao` é `@Roles` admin.
  MANTER.
- Nova admissão, "+ criar catálogo" por `isAdmin`: intencional, os POST de catálogo são `@Roles` admin.
  MANTER.
- Gerenciador, botão Deletar por `isAdmin`: intencional, `deletar` é `@Roles` admin. MANTER.
- `DiagnosticoAlerta` só para admin: intencional (Diagnóstico é admin-only). MANTER.
- Backend `@Roles`: `users` e `diagnostico` (classe, admin-only DE PROPÓSITO, anti-escalonamento), e
  métodos `recusar`/`reativarRecusada`/`deletar`/`decidirLiberacao`/criar-catálogo. Nenhum bloqueia
  operação de tela de Operação por engano. Fora o kit-tipos (corrigido), não há trava de papel
  sobrevivente barrando o COMUM.

**5. Prova ponta a ponta (token de COMUM real mintado com o segredo do backend).**
- Bundle servido: o chunk do gerador-kit tem 0 "Acesso restrito" / "exclusivo de Master".
- COMUM COM o menu (`b3adf0ef`): `GET /admin/kit-tipos` -> 200; `status`/`funcionario`/`zip` de job
  inexistente -> 404 (passou o menu, não 403). Nenhuma operação da tela dá 403.
- Controle negativo, COMUM SEM o menu (`c76014df`, zero menus): a operação do kit -> 403 (o gate é real
  e por menu), e o dropdown `GET /admin/kit-tipos` -> 200 (leitura aberta, como projetado).

Deploy: backend (build+restart) e frontend (stop/backup/build/start), health OK, `/login` e
`/gerador-kit` 200, novos BUILD_ID. O diretor valida em produção com um COMUM real.

---

## 2026-07-24 (7): VT no Firebase com coleta pelo Drive, BLOCO 0 (levantamento) + BLOCO 2 (recomendações)

OST do diretor (sessão própria, paralela à da Clicksign). Manobra estratégica: o Fernando negou expor
o formulário de VT do EA para a internet, então o candidato passa a preencher num app FIREBASE (fora
da VM, fora do alcance da negativa), o Firebase gera o PDF e deposita numa pasta coletiva do Drive, e o
EA LÊ essa pasta com a credencial que já tem (admin.soulan@). O EA não precisa ficar exposto para ler
uma pasta. Esta OST ACRESCENTA um caminho, não substitui o interno. §A.11 (sem travessão) respeitada.

**TRAVA ABSOLUTA respeitada:** nada da estrutura de VT interna que já existe foi tocado (a tela `/vt`,
os 2 PDFs, o tipo `FORMULARIO_VT` no catálogo, a régua). Fica intacta e dormindo; quando o Fernando
liberar o caminho interno, é só ligar. Este registro é só levantamento e recomendações, ZERO código.

### BLOCO 0, levantamento (campo a campo)

**1. O que o formulário de VT do EA coleta hoje** (`apps/frontend/src/app/vt/page.tsx`, rota pública fora
do grupo `(app)`, DTOs em `apps/backend/src/vt/vt.dto.ts`). O Firebase precisa coletar o MESMO conjunto:
- **Identificação** (gate de token de 30 min): `cpf` (11 dígitos) + `dataNascimento` (ISO). O backend
  casa isso contra `candidatos` + a admissão viva mais recente (exclui DECLINOU/RESCISAO) e devolve
  `{ token, nome }`. CPF/nascimento tratados como credencial, nunca logados.
- **Endereço:** `cep` (8 díg, autopreenche via ViaCEP no `GET /vt/cep/:cep`), `logradouro`, `numero`,
  `complemento` (opcional), `bairro`, `cidade` (dropdown de cidades da tabela de tarifas + "Outra"),
  `uf` (2 letras).
- **Opção pelo VT:** `optante` (boolean). Se não optante, sem conduções.
- **Conduções** (só optante), por sentido IDA e VOLTA, N por sentido (máx 40): `cidade`,
  `tipoTransporte` (sugerido da tabela de tarifas ou texto livre em "Outra"), `cartao`
  (`BILHETE_UNICO`/`CARTAO_TOP`/`OUTRO`), `cartaoOutro` (só quando OUTRO), `valor` (0 = gratuidade).
- **Totais:** `totalIda`, `totalVolta`, `totalDia`, recalculados NO SERVIDOR (o cliente não é confiado).
- **Ciência:** 3 avisos sequenciais (assinatura digital, veracidade, uso do VT); `cienteEm` gravado.
- Payload de `POST /vt/formulario`: `{ optante, cep, logradouro, numero, complemento, bairro, cidade,
  uf, conducoes:[{ sentido, cidade, tipoTransporte, cartao, cartaoOutro?, valor }] }`. Totais NÃO vão
  no payload. Persistência em `formularios_vt` (1 por admissão, reenvio sobrescreve) +
  `formulario_vt_conducoes`.

**2. Como o PDF do VT é gerado hoje** (`apps/ai-service/app/vt_pdf.py`, biblioteca **reportlab**, o PDF é
DESENHADO de dados estruturados). São **2 PDFs**, despachados por `tipo`: **OPTANTE** (`gerar_optante`) e
**NAO_OPTANTE** (`gerar_nao_optante`). Logo Soulan embutida de `app/assets/logo-soulan.png` (52mm, paleta
AZUL `#4A7FA5` / VERDE `#9FC53D`). Optante: cabeçalho + "DADOS PESSOAIS" (nome, CPF, nascimento,
cidade/UF, endereço) + "DESCRITIVO DO ITINERÁRIO IDA/VOLTA" (meio de transporte, cartão/tipo, valor
unitário, total) + faixa verde "TOTAL A SER UTILIZADO NO DIA" + "COMPROMISSO DO COLABORADOR" (autoriza
desconto de até 6% do salário) + bloco de assinatura. Não optante: "DECLARAÇÃO DE NÃO OPÇÃO" com 3
parágrafos + assinatura. Nada gravado em disco, os bytes só trafegam. **O Firebase precisa produzir um
PDF equivalente** (mesmos campos, mesmo logo, mesmos 2 tipos), para o documento servir.

**3. Estado do `FORMULARIO_VT`:** tipo REGISTRADO no catálogo (`tipos_documento`), roteado para a subpasta
**BENEFICIOS** do Drive (`drive-routing.ts`, `SUBPASTA_POR_CODIGO`), mas **DORMENTE**: após o seed
`seed-regua-padrao.ts` (que faz `delete from regua_documental` e recria só com os 7 códigos padrão, sem
VT), o tipo fica com **0 réguas / 0 documentos**. Também está EXCLUÍDO DE PROPÓSITO do de/para do Pandapé
(`resolver-tipo-documento.ts`, "Informações de Vale Transporte" em `EXCLUIDOS_DE_PROPOSITO`, "sem destino
de propósito"). Consistente com a §A.17 (etapa 3, ligar VT ao kit/auditoria, ainda "a fazer").

### BLOCO 2, recomendações (como o EA identifica e casa o arquivo)

- **Padrão exato do nome do arquivo (contrato Firebase -> EA):** `NOME COMPLETO EM MAIUSCULAS CPF.pdf`,
  com o **CPF em 11 dígitos SEM máscara** ao final, ex.: `MARIA DA SILVA 11122233344.pdf`. Extração no EA:
  regex de um grupo de 11 dígitos consecutivos no final do nome (`(\d{11})(?!\d)`). Sem travessão no nome
  (§A.11). Exceção deliberada à §A.6 declarada pelo diretor: a pasta é interna e o nome ajuda o time
  humano a achar o prontuário.
- **Casamento:** CPF extraído contra as admissões **VIVAS** (EM_ADMISSAO / BANCO_AGUARDAR, exclui
  DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA), coerente com o `identificar` da `/vt` e com a régua unificada
  (§A.19). 
- **Casos de borda (nenhum quebra a varredura nem some em silêncio), via um livro-razão `vt_coleta`
  chaveado por md5 (unique), com status:**
  - **CPF não casa com nenhuma admissão viva** -> status `SEM_ADMISSAO`, acende sinal no Diagnóstico
    (BLOCO 5), e **continua sendo reavaliado** nos ciclos seguintes (candidato preencheu antes da
    admissão existir), sem re-arquivar. Só vira `CASADO` quando a admissão aparecer.
  - **CPF casa com mais de uma** -> `MULTIPLO`, acende sinal, exige desambiguação humana (o botão manual
    na ficha da admissão resolve, o consultor clica na admissão certa).
  - **Nome fora do padrão (sem 11 dígitos)** -> `NOME_FORA_PADRAO`, acende sinal, não casa.
  - **Não é PDF** -> a varredura filtra `mimeType='application/pdf'`; não-PDF é contado no ciclo
    (`ignorados`), nunca some calado.
- **Idempotência:** pelo **md5 do conteúdo**, o mesmo princípio de dedup que o Drive já usa
  (`md5_do_conteudo`/`md5_existentes` no `ai-service`). Md5 já `CASADO` no livro-razão é pulado; md5
  `SEM_ADMISSAO` é rebarateado (só rematch, sem re-arquivar). Dupla proteção com o dedup do próprio
  arquivamento na BENEFICIOS.

### Recomendações que EXTRAPOLAM o BLOCO 2 e precisam de decisão/insumo do diretor

- **PONTO CRÍTICO, "zerar a pendência de VT" (BLOCO 4) x TRAVA da régua.** Hoje `FORMULARIO_VT` está em
  0 réguas, então **não existe pendência de VT para zerar** (a régua está dormente e a TRAVA proíbe
  mexer nela). Recomendação: a coleta grava/atualiza um `documentos_admissao` de tipo `FORMULARIO_VT` como
  **ENTREGUE** para a admissão casada (registro de recebimento + arquivamento), de forma **ADITIVA, sem
  tocar a régua**. Isso registra o recebido hoje; vira "pendência zerada" de fato só quando a etapa 3 da
  §A.17 puser o VT na régua (fora desta OST). Reportado para o diretor confirmar que o recebimento
  aditivo, sem régua, é o comportamento desejado agora.
- **Arquivo permanece na pasta coletiva (não é movido).** O módulo de Drive é ADITIVO/somente-leitura por
  contrato (`drive.py`, sem `delete`/`update`/mover, vetado pela §A.6). Logo o PDF é **COPIADO** para a
  BENEFICIOS do prontuário e **permanece** na pasta coletiva, que vira a fonte/trilha de origem; o
  livro-razão md5 evita reprocessar. Decisão declarada.
- **Insumos do diretor/Fernando para o lado Firebase (BLOCO 1):** (a) projeto Firebase + hosting no
  padrão CentraFin/AudiPonto; (b) credencial de ESCRITA no Drive para o lado Firebase (service account
  dedicada com acesso só à pasta coletiva, o admin.soulan@ vive na VM e não deve ir para uma Cloud
  Function); (c) o **ID da pasta coletiva** do Drive. Sem esses três, o app Firebase não deposita.

### Plano de construção (ordem)

1. **Lado VM, coleta (nesta sessão, autocontido):** módulo `vt-coleta` no backend, scheduler in-process
   (`setInterval` -> BullMQ, no padrão provado do `pandape-scheduler`), livro-razão `vt_coleta` (md5
   unique + status), nova função read-only de LISTAGEM de PDFs numa pasta do Drive no `ai-service`
   (`files().list` com `mimeType='application/pdf'`, hoje inexistente), casamento por CPF, arquivamento
   na BENEFICIOS reusando `arquivarDrive` (md5 + reuso de pasta por nome), botão manual na ficha
   (mesmo caminho de processamento), sinais e card de último ciclo no Diagnóstico.
2. **Lado Firebase (BLOCO 1), quando os 3 insumos chegarem:** app do formulário fora da VM, gera o PDF
   equivalente e deposita na pasta coletiva com o nome padrão. Link disparado manualmente pelo consultor.

### DECISÃO DO DIRETOR (resposta ao ponto crítico) + verificação em código

**Decisão do Rike:** o VT é UM DOCUMENTO COMO QUALQUER OUTRO. Entra na RÉGUA DOCUMENTAL DO CLIENTE, e é na
régua que se define, cliente a cliente, se é obrigatório ou não. O que ele NÃO faz: travar fluxo
operacional. Consequências: (1) `FORMULARIO_VT` deixa de ser dormente, passa a poder ser incluído na régua
pelos caminhos que já existem (tela de Régua Documental por cliente/cargo); NÃO configurar régua de cliente
nenhum por conta própria (quem define é o time, na tela); esta OST só torna o tipo utilizável. (2) O PDF do
Firebase é registrado como documento RECEBIDO e dá baixa na linha da régua ONDE O VT EXISTIR; onde o cliente
não exigir VT, o PDF é apenas registrado e arquivado, sem criar pendência. (3) NÃO passa pela IA (mantido).
(4) O VT na régua NÃO pode travar conclusão nem o gate do kit; se a régua travasse por obrigatório pendente,
REPORTAR antes de aplicar. A TRAVA original segue: nada da estrutura de VT interna (`/vt`, PDF, fluxo
interno) muda; só o tipo deixa de ser dormente no catálogo de régua.

**Verificação em código (2 varreduras read-only), o ponto 4 NÃO dispara "reportar antes":**
- **`FORMULARIO_VT` JÁ é selecionável na tela de Régua** hoje. `admin/regua/page.tsx` lista TODOS os
  `tipos_documento` **ativos** (`tiposAtivos = tipos.filter(t => t.ativo)`), sem allowlist; `CODIGOS_REGUA_PADRAO`
  é só conveniência (botão "aplicar padrão"), não filtro. Única condição: a linha do catálogo estar
  `ativo=true`. Se estiver, nada a fazer para a seleção; se inativa, um clique reativa. **Tornar utilizável =
  garantir ativo.**
- **Nada trava (hard-block).** O gate do kit (`domain/frentes.ts kitLiberado`) checa SÓ os 3 `concluida`,
  nunca a régua. `ADMISSAO_CONCLUIDA` é flag manual pegajosa, sem pré-condição de documento. Avanço de frente
  com obrigatório pendente é liberado via **aceite** (regra 8, `esteira.service mudarStatus`), nunca barrado.
  VT obrigatório-e-ausente é **sinal suave**: conta no progresso/NC-1 e **adia o fechamento AUTOMÁTICO** da
  Auditoria (`progresso.completa`), mas o consultor conclui via aceite e kit/conclusão seguem alcançáveis.
  **Requisito "não travar" satisfeito por construção.**
- **Dar baixa reusa `ValidacaoHumanaService`/`AuditoriaService.aplicarPosVeredito`**: faz upsert do
  `documentos_admissao` para ENTREGUE (CRIA a linha se a admissão for anterior à edição da régua, via
  LEFT JOIN a régua atual já mostra o pendente), recalcula sinalizador + completude + auto-close da Auditoria.
  Enum de estado: `PENDENTE / ENTREGUE / INCONFORME / AGUARDANDO_AUDITORIA`.
- **Detalhe LGPD (§A.6) do livro-razão:** a extração do CPF do nome do arquivo fica no `ai-service`; o nome
  cru NÃO cruza para o backend nem é logado. O livro-razão `vt_coleta` persiste só `md5`, `drive_file_id`,
  `admissao_id` e status, SEM nome/CPF. O card de "não casou" no Diagnóstico mostra o `drive_file_id` (o
  admin abre no Drive para ver o nome). Passa pela Segurança antes do merge.

**Estado:** BLOCO 0 + BLOCO 2 entregues, decisão do diretor incorporada, desenho verificado em código.
Construção do lado VM (coleta) INICIADA nesta sessão. Lado Firebase aguarda os 3 insumos. Sem commit até
gate verde + validação do diretor em produção (§A.21).

---

## 2026-07-24 (6): padrão do COMUM invertido para toda a Operação + backfill (Opção B)

Decisão do diretor: o COMUM enxerga TUDO que é Operação por padrão, e a Administração vira concessão
pontual. Inverte o grandfather original (que dava só "o que já via", sem o Gerador de kit), que vinha
interrompendo a operação. Gate verde (typecheck back+front, 69 testes, lint dos tocados). Sem travessão.

**1. Novo padrão (código).** `domain/menus.ts`: `MENUS_COMUM_HOJE` (Operação menos gerador-kit) virou
`MENUS_PADRAO_COMUM` = TODO o grupo Operação (8 menus, incluindo Gerador de kit); `codigosGrandfather`
virou `codigosPadraoDoPapel`. Admin segue com todos (bypass). Atualizados os usos (seed-menus.ts) e o
spec (`menus.spec.ts`, 11 testes verdes).

**2. Backfill idempotente e ADITIVO.** Novo runner `db/backfill-menus-comum.ts`: concede os 8 menus de
Operação a todo COMUM ATIVO, com `onConflictDoNothing` (rodar 2x não duplica) e SÓ INSERT (nunca
remove). Preserva a Administração concedida pontualmente. **Antes/depois (2 COMUM ativos):**
- `b3adf0ef`: já tinha gerador-kit e o resto; faltava `nao-conformidades` -> adicionado. Admin extra
  (`escalas, motivos-declinio, regras, tarifas`) preservado.
- `f103fde6`: idem; faltava `nao-conformidades` -> adicionado. Admin extra (`cargos, escalas, regras,
  regua`) preservado.
- Ambos agora com os 8 de Operação. Nada removido.
- **3º COMUM (`c76014df`) está INATIVO** (soft-delete, não loga), então o backfill o pulou de
  propósito (só toca ativos). Reportado ao diretor: se quiser esse usuário de volta, é reativar, e aí
  ele precisa dos menus (a reativação não semeia sozinha; a semeadura de padrão é só na criação).

**Padrão também na CRIAÇÃO (para não recriar o buraco).** `users.controller.criar` passou a semear o
padrão do papel no usuário novo (`codigosPadraoDoPapel(papel)`), então consultor novo nasce com os 8
de Operação em vez de nascer vazio (que era "o caso mais grave"). Registrado como parte da decisão.

**3. Administração fora do padrão.** O padrão é só Operação; nenhum menu ADMIN entra por padrão nem no
backfill.

**4. Diagnóstico e Usuários bloqueados para COMUM.** São `@Roles` admin-only, então marcar para um
COMUM só mostraria o menu e o backend barraria os dados. Defesa em profundidade: `MENUS_BLOQUEADOS_COMUM`
(domain), o `definirMenusDoUsuario` FILTRA esses dois quando o alvo não é admin (recebe o papel), e a
tela de configuração (`ConfigMenusModal`) desabilita as duas caixas para COMUM ("somente
administração").

**5. Verificação de cobertura (o ponto crítico).** Auditei as 8 telas de Operação (chamada por chamada
-> Controller.handler -> menu). **gerador-kit: as 5 operações da tela (`processar`, `statusProcessar`,
`downloadFuncionario`, `reimportar`, `downloadZip`) caem TODAS no menu gerador-kit** (provado por
`menuDaOperacao`). As leituras de cliente/cargo (o que derrubou a Liberação) estão ABERTAS, correto.
Com o padrão novo, as 8 telas funcionam para o COMUM. **Dois defeitos LATENTES achados, REPORTADOS, NÃO
corrigidos (fora do escopo aprovado, decisão do diretor):**
- **A)** a Esteira abre o `EditAdmissaoModal` (lápis de toda linha) que salva via
  `AdmissoesController.editar`, gated só pelo menu `gerenciador`. Com o padrão novo o COMUM tem
  `gerenciador`, então funciona; só morderia se um admin tirasse `gerenciador` de um COMUM mantendo
  `esteira`. Mesma classe do incidente da Liberação.
- **B)** o menu `esteira` declara `AuditoriaController.documento`, mas o handler real chama-se
  `auditar`; a string nunca casa, então a auditoria de documento fica ABERTA a qualquer autenticado
  (deveria ser gated por esteira). É um erro de registro (um caractere), a mutação está sem gate.

**Deploy:** backend (build + restart) e frontend (stop/backup/build/start), health OK, `/login` 200,
novos BUILD_ID. O diretor valida em produção com um COMUM real.

---

## 2026-07-24 (5): levantamento do estado da integração Clicksign (INT-4), só retrato, sem implementar

Levantamento pedido pelo diretor antes de ativar a frente de assinatura. Nada alterado.

**1. Implementado x desenho.** O cliente da API (`clicksign-api.service.ts`) tem as 8 operações
JSON:API v3 PRONTAS e conferidas no sandbox (30/06): criar envelope, anexar documento (base64 inline),
signatário (CPF mascarado), 2 requirements (agree/sign + provide_evidence/email), ativar (running),
consultar status, obter URL do assinado, cancelar (draft=DELETE, running=best-effort). A orquestração
(`clicksign-sync.service.ts`) também está PRONTA em código: `criarEnvelope` (grava
AGUARDANDO_ASSINATURA, revalida gate F9), `processarTick` (varre AGUARDANDO, closed->arquiva,
canceled->CANCELADO), `arquivarAssinado` (baixa síncrono a URL S3 de ~5min, arquiva no Drive subpasta
ADMISSAO, grava contratoAssinadoDriveUrl + ASSINADO, recomputa farol, expurga staging) e
`reenviarCorrecao` (cancela best-effort, gate de dupla correção p/ Pandapé, regenera kit). Worker
BullMQ (consumidor) sobe no boot do backend. Módulo carregado no `app.module`. Inerte sem token.

**2. Ambiente: SANDBOX.** `CLICKSIGN_API_BASE_URL=https://sandbox.clicksign.com/api/v3`, token
sandbox configurado. Para produção: trocar base URL + token de produção e revalidar shapes/limites
(prod 50 req/10s vs sandbox 20; o limiter está em 18/10s, conservador) e o caso do cancelamento de
running (no sandbox não há cancelamento programático).

**3. Nunca rodou com envelope real nesta base.** `clicksign_envelope_id` preenchido: **0**. Contrato
arquivado (`contrato_assinado_drive_url`): **0**. Os **1.486 ASSINADO** são artefato da CARGA (§A.16
regra 1, concluídas entram ASSINADO), não Clicksign real. SEM_ENVELOPE: 864. O sandbox foi provado no
desenvolvimento, mas nada persistiu aqui.

**4. Job de verificação: worker vivo, gatilho do tick NÃO instalado.** O worker BullMQ roda dentro do
`ea-backend` (systemd) e conecta no `ea-redis` (6380, healthy), no padrão dos outros (não é processo
solto). MAS o `poll-tick` só é enfileirado pelo `POST /internal/clicksign/tick`, que depende de um
CRON externo. Esse cron **NÃO está instalado** (sem crontab, sem timer systemd);
`infra/install-clicksign-cron.sh` (cadência 1/min, 7h-23h) existe e nunca foi rodado. Ou seja: a
arquitetura está certa, mas na prática **o tick nunca dispara**, então nada é verificado/arquivado.

**5. Gatilho: NÃO é automático no fim das 3 frentes.** O envelope só nasce via `KitService.gerar`
(que enfileira `criar-envelope`), chamado por: (a) `/kit/:admissaoId/gerar`, a tela F9 ANTIGA, tirada
do menu (§A.15); (b) `reenviarCorrecao`. O gate F9 (`kitLiberado`, 3 frentes) é revalidado por DEFESA
dentro do `criarEnvelope`, mas não é o gatilho. O `/gerador-kit` novo (`processarMotor`) NÃO cria
envelope (o envelope por candidato é a evolução FUTURA junto do INT-4, §A.5). Então hoje **não há
caminho vivo de tela para criar o primeiro envelope**. Regra da fila do Cadastro
(`esteira.service.ts` ~168-183, os números do diretor deslocaram): na aba CADASTRO_CONTRATO a
admissão fica na fila se `nao_concluida OR clicksign_status IN (AGUARDANDO_ASSINATURA, CANCELADO)`;
mesmo com Cadastro concluído, "Aguardando assinatura"/"Cancelado" seguem visíveis, e só somem em
ASSINADO/SEM_ENVELOPE. Depende de `concluida` + `clicksign_status`, nunca do código do status.

**6. Falta para operar ponta a ponta (ordem de dependência):** (i) decidir sandbox x produção e, se
prod, base URL + token novos; (ii) **instalar o cron do tick** (sem ele nada é verificado); (iii)
definir o GATILHO do primeiro envelope (a evolução §A.5: envelope automático por candidato no
`/gerador-kit` com o gate F12, ou restaurar uma ação manual de gerar), hoje o maior buraco funcional;
(iv) candidato com e-mail (o `criarEnvelope` pula sem e-mail, por causa do requirement de e-mail);
(v) pasta-pai do Drive mapeada por cliente/contrato (`resolvePastaPaiId`), senão não arquiva; (vi)
validar cancelamento de running em produção; (vii) rodar um envelope real fim-a-fim e validação do
diretor.

**7. Riscos e dívidas:** rate limit tratado (limiter 18/10s + backoff 5x, concorrência 1); URL de
download expira ~5min, tratada por download SÍNCRONO no mesmo ciclo, nunca persistida/logada (§A.6);
se o download falha, o status fica AGUARDANDO e o PRÓXIMO tick retenta, MAS sem o cron não há próximo
tick (fica preso); **expiração de envelope (deadline 30 dias) não tem tratamento explícito**, se a
Clicksign não devolver closed/canceled o tick só ignora (fica AGUARDANDO para sempre); cancelamento de
running é best-effort (EA é autoritativo com CANCELADO + trilha de dupla correção); o reenvio depende
do `KitService.gerar` antigo (dívida §A.15, remover a F9 quebraria o reenvio); staging TTL 1h, se o
kit for expurgado antes do worker o job entra em backoff e o consultor regenera. Drive é REAL
(`DRIVE_MOCK=false`, `ea-ai-service` ativo em :8000).

---

## 2026-07-24 (4): bug do /vt (redirecionava para o login do EA), corrigido e provado

**Sintoma:** candidato preenchia CPF + data de nascimento no /vt, clicava em Entrar e caía no LOGIN
DO EA em vez de ver o formulário (ou a mensagem de erro).

**Causa raiz (front, `lib/api.ts`, regressão do refresh de sessão):** o `fetchComRenovacao` tratava
QUALQUER 401 fora de `/auth/` como sessão do EA expirada. `ehRotaDeSessao` só excluía `/auth/`, então
o 401 do `/vt/identificar` (que é o "Dados não encontrados", `UnauthorizedException`) disparava
`renovarSessao()` (`/auth/refresh`); o candidato não tem cookie de refresh do EA, o refresh falha,
`sessaoExpirou()` roda e o gancho `aoExpirar` (`auth-context.tsx`) faz `location.assign("/login")`. A
mensagem que a própria tela do VT já tinha nunca aparecia. Regressão: o refresh de sessão entrou no
lote `2bd12f4` e passou a interceptar o 401 do /vt; antes o 401 virava erro na tela (o próprio
comentário do arquivo descreve o mundo anterior). **O MenuGuard NÃO era o culpado** (isenta `@Public`,
inclusive VT) e o backend do /vt está correto (`@Public` + `VtSessaoGuard`).

**Varredura de outras rotas públicas com sessão própria:** a ÚNICA rota do browser pública com sessão
própria é `/vt/*`. As demais `@Public` são server-to-server (crons `/internal/*`, webhook Pandapé) ou
já isentas (`/auth/*`, `/health`). **O `/kit` NÃO sofre o problema:** todas as rotas `/kit` exigem o
JWT do EA (o consultor logado gera o kit), então um 401 lá é sessão do EA de verdade e o refresh é o
certo; o token de download do kit falha com **404** (`NotFoundException`), não 401, logo nunca entra
no ciclo. Fix escopado só ao /vt.

**Correção (aprovada, cirúrgica, só front):** novo predicado `ehFluxoPublicoComSessaoPropria(path)` =
`path.startsWith("/vt/")`, somado à guarda do 401: `if (res.status !== 401 || ehRotaDeSessao(path) ||
ehFluxoPublicoComSessaoPropria(path)) return res;`. Assim o 401 do /vt vira `ApiError` e a tela mostra
a mensagem, sem `renovarSessao` nem `sessaoExpirou`. Mudança puramente aditiva: rotas do sistema
seguem no ciclo de refresh como antes.

**Prova:**
- Bundle servido (chunk da lógica de sessão): `...startsWith("/auth/")||e.startsWith("/vt/"))return l;
  let a=await d();...`, ou seja o /vt sai antes de chamar renovar (`d`) e expirar (`f`); para as demais
  rotas segue chamando os dois (refresh do EA intacto).
- Ao vivo: `/vt/identificar` com candidato válido responde **201** (token, formulário abre); com dado
  inválido responde **401** (agora exibido como "Dados não encontrados" na própria tela, sem redirect).
- Typecheck e lint verdes. Deploy do frontend, `/login` e `/vt` -> 200, novo `BUILD_ID`. Sem travessão.

---

## 2026-07-24 (3): logo novo recebido com FUNDO EMBUTIDO, PARADO, aguardando reexport transparente

Rike mandou um logo com contorno melhorado (`/home/henrique/logo-atualizado.png`, md5 `461ca022…`).
Antes de aplicar, verifiquei os pixels (trava desta frente) e **PAREI**, sem aplicar, sem recortar,
sem sobrescrever. O `logo-ea.png` atual segue intacto no ar.

**Retrato do arquivo recebido:** PNG **1254x1254**, **RGB SEM canal alpha** (channels=3). Fundo
**branco sólido embutido** (~254,254,254), ~81% da imagem, zero transparência. Marca ~18%, bbox
1054x820, cor média **RGB (103,142,198)** = símbolo **azul/ciano** sobre o branco.

**Comparação com o atual** (`logo-ea.png` 1024x1024 RGBA, 79% transparente, marca branca): o novo tem
resolução maior e contorno melhor, mas **perdeu a transparência e trouxe fundo branco chapado**. Para
o nosso uso (sidebar/login/troca de senha em glass ESCURO) ele apareceria como retângulo branco, e a
sombra CSS (`.logo-ea-mist`) é feita para logo transparente. **Veredito: pior como asset**, então
parei em vez de trocar (trava: "se for pior, PARAR e reportar").

**Decisão do Rike (perguntei):** quando reexportar, a marca deve ser **BRANCA** (como hoje), para
manter o contraste no escuro e a sombra CSS como está.

**O que destrava (insumo do Rike, §A.0):** reexportar o desenho novo com **fundo TRANSPARENTE** (PNG
com alpha de verdade, ou SVG/vetor) e a **marca branca**. Assim que chegar, aplico em sidebar, login,
troca de senha e regenero o favicon a partir dele, tudo sem recorte. Nada mais a fazer do meu lado
até o arquivo transparente chegar.

---

## 2026-07-24 (2): OST dois ajustes de front, cabeçalho opaco e logo, deployado e provado

Frontend só. Gate verde (typecheck, lint dos arquivos tocados). Rebuild interno (stop, backup,
build, start), `/login` e `/trocar-senha` -> 200, novo `BUILD_ID`. Sem travessão (§A.11).

### Bloco 1, cabeçalho de tabela congelado ficou OPACO (modo escuro)
**Causa exata.** Os dois cabeçalhos congelados (`.list-head` das tabelas em grid e `.ds-table thead th`
das tabelas de admin) usavam `background: color-mix(in srgb, var(--surface-2) 94%, var(--bg))`. No
escuro `--surface-2` é `rgba(255,255,255,0.08)`, então o mix resultava em alpha ~0.135 (o cabeçalho
ficava ~86% transparente) e as linhas passavam legíveis por baixo ao rolar. No claro `--surface-2` é
0.93, então lá já estava ~93% opaco (ok).

**Correção (opacidade, não redesenho).** Novo token sólido `--table-head-bg`, tema-aware:
`#f6f9fc` no claro e `#1a2331` no escuro (leve lift sobre o `--bg` para ler como barra). Os dois
cabeçalhos passaram a usar `var(--table-head-bg)`. Hairline inferior, blur e divisórias de coluna
mantidos. Não mexi em `--surface-2` (usado por outros elementos que devem seguir translúcidos).
**Aplica em TODAS as tabelas com cabeçalho congelado:** grid (`.list-head`) na Esteira, Gerenciador e
Não-conformidades; admin (`.ds-table`) em Régua, Regras, Motivos de declínio, Escalas, Clientes,
Usuários, Tarifas, Cargos e na Liberação. Claro conferido: cabeçalho quase branco opaco, texto
`--faint` legível, sem estourar contraste.

**Prova no bundle servido:** o CSS servido traz `--table-head-bg:#1a2331` e `#f6f9fc`, os dois
cabeçalhos usam `var(--table-head-bg)`, e o antigo `color-mix(...surface-2 94%...)` sumiu (0
ocorrências).

### Bloco 2, logo e sombra
**Achado importante, verifiquei os pixels do arquivo antes de mexer.** O `public/logo-ea.png` (usado
no login e na sidebar) **já é PNG RGBA 1024x1024 com fundo TRANSPARENTE**: cantos com alpha 0, 79%
dos pixels transparentes, e as bordas anti-serrilhadas têm cor média **(204,206,207), cinza claro**
(só 5% de pixels escuros), ou seja **não há fundo azul/escuro embutido nem franja escura de recorte**.
É o arquivo bom da OST do login, não a versão achatada/recortada que o Rike citou como erro passado.
Por isso **NÃO reprocessei a imagem** (reprocessar seria exatamente o "recorte sobre a versão
achatada" que o Rike proibiu, e degradaria um asset que está limpo). Resolução/formato adotados
(declarados): **PNG, 1024x1024, RGBA com alpha, transparente**, nítido em alta densidade.
*Se o Rike tiver um ORIGINAL de maior fidelidade (SVG/vetor), é insumo dele (§A.0): mando trocar na
hora. O arquivo atual, porém, já está transparente e íntegro.*

**Sombra fortalecida (era o que estava fraco).** A classe `.logo-ea-mist` (halo esfumaçado atrás do
logo, em uso no `LogoEA` da sidebar, `LogoEA.tsx`) estava tímida: escuro só `rgba(255,255,255,0.10)` e
`blur(3.5px)`. Reforcei, tema-aware e mais esfumaçada: `blur(6px)`; no claro a fumaça escura passou de
0.62 para **0.85** no centro com mais espalhamento; no escuro o glow passou de 0.10 para **0.24**. Fica
um halo forte e difuso, sem borda dura. Na tela de troca de senha a sombra do logo vem por
`drop-shadow` (mesmo espírito do login).

**Prova no bundle servido:** o CSS traz `.logo-ea-mist{...rgba(30,38,52,.85)...;filter:blur(6px)...}`
e o override escuro `...hsla(0,0%,100%,.24)...` (o minificador reescreveu o rgba branco como hsla).

### Bloco 3, logo trocado onde faltava, e varredura completa
**Inventário de TODOS os pontos que renderizam logo no sistema:**
| Ponto | Logo | Estado |
|---|---|---|
| Sidebar | `LogoEA` -> `/logo-ea.png` (novo) | já era o novo |
| Login | `<img>` `/logo-ea.png` (novo) | já era o novo |
| **Troca de senha / primeiro acesso** (`/trocar-senha`) | era `Brand` (marca ANTIGA em CSS, quadro "EA") | **TROCADO para `/logo-ea.png`** com sombra por drop-shadow |
| Formulário VT público (`/vt`) | `/logo-soulan.png` | **logo da SOULAN**, de propósito (peça pública da marca Soulan), NÃO é o logo do app EA, mantido |
| PDF do VT (ai-service `vt_pdf.py`) | `logo-soulan.png` | **logo da SOULAN** em documento oficial, mantido |
| Favicon / ícone de aba | nenhum (`metadata` só tem título/descrição) | não existe logo hoje, navegador usa o default |
| Páginas de erro / not-found | não existem no projeto | nada a trocar |
| E-mails | não há envio de e-mail no sistema | nada a trocar |
| PDF do Kit | não embute logo | nada a trocar |

**O único ponto com logo ANTIGO era a troca de senha (o caso que o Rike achou), agora corrigido.**

**Órfão reportado, NÃO removido (§A.14):** o componente `Brand` (`components/ui/Brand.tsx`) e as
classes CSS `.brand-mark`/`.brand-name` no `globals.css` ficaram sem uso (só a troca de senha os
usava). Não excluí porque apagar componente + CSS compartilhado passa de "trocar o logo"; fica para o
Rike decidir (é uma linha, se ele quiser).

**Prova no bundle servido:** o chunk de `/trocar-senha` referencia `/logo-ea.png` e **não** tem mais
`brand-mark`.

**Pergunta em aberto para o Rike:** hoje não há **favicon** (a aba do navegador usa o ícone padrão).
Se quiser o logo EA como favicon, é um item novo (§A.14): faço quando ele pedir.

### Follow-up (mesmo dia), Rike aprovou remover o Brand órfão e criar o favicon
**1. Brand removido.** Confirmei por grep que nada mais usava `Brand`, `.brand-mark` nem `.brand-name`
(só a própria definição). Apaguei o componente `components/ui/Brand.tsx` e as três regras CSS no
`globals.css` (`.brand-mark`, `.brand-name`, `.brand-name span`). Prova no bundle: `brand-mark` = 0
ocorrências no CSS servido. Typecheck e lint verdes.

**2. Favicon criado a partir do `logo-ea.png` (1024x1024 íntegro).** Sem ImageMagick/Pillow/sharp na
VM, gerei com um encoder PNG/ICO em Python puro (stdlib zlib). Recortei o **símbolo** (a fita EA, não
o lockup com texto, que seria ilegível a 16px) pela bbox medida no `LogoEA.tsx`, centralizei num
quadrado com padding sobre um **fundo navy sólido `#0b1b30`** (o símbolo é branco, RGB médio ~232, e
num favicon transparente sumiria em aba clara: fundo é do ÍCONE, não embutido no logo). **Tamanhos
gerados e declarados:**
- `favicon.ico`: **16x16, 32x32, 48x48** (PNG embutido no container ICO).
- `icon.png`: **512x512** (alta densidade / PWA).
- `apple-icon.png`: **180x180** (apple-touch-icon).

Arquivos em `apps/frontend/src/app/` (convenção do App Router: o Next injeta os `<link>` sozinho).
Prova no bundle servido: o `<head>` traz `rel="icon" href="/favicon.ico"`, `rel="icon"
href="/icon.png" sizes="512x512"` e `rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180"`;
`/favicon.ico` responde 200 (image/x-icon, 3343 B), `/icon.png` e `/apple-icon.png` 200 (image/png).

**3. Logo em vetor/SVG:** o Rike vai verificar se tem o original. Por ora fica o PNG, que já está
transparente e íntegro. Nada a fazer do meu lado até ele trazer o vetor.

Deploy do frontend (stop, backup, build, start), `/login` 200, novo `BUILD_ID`. Sem travessão.

---

## 2026-07-24: OST modal do olho e tolerância no campo de VR, aguardando validação em produção

Duas frentes independentes, escopo fechado (§A.14). Gate verde (typecheck back+front, lint dos
arquivos tocados, 57 testes de DTO incluindo 14 novos). Rike valida na tela em produção.

### CORREÇÃO (mesmo dia), a lista não sumiu na primeira validação: causa raiz e re-deploy
Rike validou em produção e a lista de documentos continuava no modal do olho (nas 3 abas da Esteira
e no eye do Gerenciador). Investiguei ANTES de mexer, como pedido, e achei duas coisas:

1. **Causa raiz: o bundle servido estava velho.** O `.next` em produção era o build das 02:12 (deploy
   anterior, commit `b631fc7`), ANTERIOR à minha edição das 10:13. O serviço `ea-frontend` (systemd
   --user, `next start`) servia o build antigo, então a remoção no fonte nunca chegou à tela. Não era
   bug de código: era build não reconstruído. O modal do olho é UM componente só (`AdmissaoDetalheModal`),
   usado pelo eye das 3 abas da Esteira, pelo eye do Gerenciador e pelo de Não-conformidades. Não há
   segundo componente nem segundo bloco de documentos DENTRO dele (confirmado: zero renderização de
   documento no fonte).

2. **Achado colateral (fora do escopo desta OST, NÃO tocado, §A.14):** existe OUTRO bloco "Documentos
   pendentes" no `EditAdmissaoModal`, o modal de EDITAR (lápis) do Gerenciador, não no modal do olho.
   É outra superfície, aberta por outro botão. A OST fala do "modal do olho"; o de editar não foi
   pedido. Reportado ao Rike para decidir se remove lá também. Não removi por conta própria.

**Re-deploy interno (§A.0), sem git push (gate não envolvido).** Backend: build + restart do
`ea-backend` (para a tolerância do VR). Frontend: parei o `ea-frontend`, fiz backup do build das
02:12 (`.next` -> `.next.bak`, rollback se o build falhasse), rebuild do fonte, subi de novo. Sem
janela de 500 (regra da memória: não buildar com o serviço no ar). Health: backend
`/api/health` ok, frontend `/login` -> 200, ambos `active`. Novo `BUILD_ID` das 10:32.

**Prova no bundle SERVIDO (acentos são escapados no minificado, então usei marcadores ASCII e prova
estrutural por chunk):** o modal do olho compila no chunk `800-...js` (é onde vive o marcador único
dele, "Trilha de passagem"); esse chunk tem `Documentos pendentes` = **0** ocorrências, ou seja a
lista saiu do olho. A string "Documentos pendentes" que sobra vive no chunk `866-...js` (que tem
"Trilha de passagem" = 0), isto é, é o `EditAdmissaoModal`, não o olho. No fonte, só o
`EditAdmissaoModal` ainda contém "Documentos pendentes"; o `AdmissaoDetalheModal` tem zero. **Removido
nos QUATRO lugares do modal do olho** (Esteira Auditoria, Esteira Exame, Esteira Cadastro, Gerenciador),
porque os quatro são o MESMO componente. A "Observação da liberação" e os demais blocos seguem. A API
(`GET /esteira/admissao/:id`) e o `AuditoriaDocsModal` não foram tocados. Comentários órfãos que
citavam a lista removida foram limpos.

### CORREÇÃO parte 2, Rike pediu remover a lista TAMBÉM do modal de editar (EditAdmissaoModal)
Decisão do Rike após o achado colateral acima. Removida a mesma renderização "Documentos pendentes"
do `EditAdmissaoModal` (modal do lápis do Gerenciador): só a renderização (bloco JSX + o campo de
tipo `documentosPendentes`, que ficou órfão e ninguém mais lia). Mantidos todos os demais blocos do
editar (dados cadastrais, cliente, cargo, salário, benefícios, frentes, etc.). API e
`AuditoriaDocsModal` intocados. `camposFiltro` (prop) continua em uso amplo, não virou órfão.
Redeploy do frontend (stop, backup, build, start), `/login` -> 200, novo `BUILD_ID`.

**Prova no bundle servido:** `Documentos pendentes` agora dá **0 ocorrências em TODO o `.next`**
(saiu do olho E do editar; no fonte não existe mais em lugar nenhum). O editar segue inteiro
(marcadores ASCII "Centro de custo" e "Tipo de contrato" presentes), o olho segue inteiro
("Trilha de passagem" presente) e a Auditoria segue completa ("Auditoria documental" presente).

### Varredura pedida pelo Rike, onde mais o sistema renderiza lista de documentos da admissão
Fora do modal de Auditoria (`AuditoriaDocsModal`, onde a gestão documental deve viver), **não sobra
nenhuma outra lista de STATUS por documento de uma admissão real**. As três superfícies que mostravam
`estado` (pendente/entregue/inconforme) por documento eram: modal do olho, modal de editar (ambos
agora limpos) e a Auditoria (mantida). Outras listas "de documento" existem, mas são de OUTRA natureza
(não são o status da régua da admissão), então ficam **reportadas, não removidas** (Rike decide):
- **Wizard `/nova`:** PRÉVIA da régua do par cliente+cargo (tipos de documento + rótulo de exigência
  Obrigatório/Facultativo), antes de a admissão existir. Mostra `exigencia`, não `estado`.
- **Gerador de Kit (`/gerador-kit`):** documentos encontrados no PDF-mãe por funcionário, para montar o
  kit (F9). Domínio de montagem de kit, não status de auditoria.
- **Admin Régua (`/admin/regua`):** CRUD da régua (quais documentos são exigidos por cliente+cargo).
- **Admin Kit-regras (`/admin/kit-regras`):** contagem de documentos de uma regra de kit.
- Não confundir: `docsPendentes` na Esteira é um NÚMERO (badge, §A.22), não uma lista; e
  `/admin/diagnostico` lista `estado` de DEPENDÊNCIAS do sistema, não de documentos.

Aguardando Rike revalidar os dois modais no bundle novo.

### Bloco 1, remoção da lista de documentos do modal do olho
**O que era.** O modal do olho (`AdmissaoDetalheModal`, ficha só-leitura) tinha um "Bloco 5,
Documentos pendentes": lista dos documentos não-entregues mais o contador "X de Y documentos já
concluídos" que fora acrescentado depois. Era duplicação da gestão documental, que vive toda no
modal de Auditar (veredito, motivo, botões Auditar/Reauditar/Validar/Visualizar/Descartar), e foi
justamente essa lista que criou a falsa impressão de bug ao exibir linhas seguidas de estado
pendente sem denominador claro.

**O que foi feito.** Removida por completo a renderização dessa lista e do contador no modal do
olho: o JSX do Bloco 5, as variáveis `docsPendentes`/`docsTotal`/`docsConcluidos` e os helpers que
só serviam a ela (`docTone`, `docRotulo`, `EXIG_ROTULO`), mais a interface `DocDetalhe` e o campo
`documentos` do tipo espelho (que ninguém mais lê no componente) e o import agora órfão `cn`.
**Mantidos** intocados: a "Observação da liberação" (bloco âmbar no topo, é recado do consultor, não
documento) e todos os demais blocos (dados pessoais, trabalho/cadastro, exame, status das frentes,
trilha de passagem, histórico).

**Cuidado crítico respeitado: a API NÃO foi tocada.** O endpoint `GET /esteira/admissao/:id`
(`esteira.service.detalhe`) serve os DOIS modais e continua devolvendo `documentos[]` igual, porque
o modal de Auditar depende dele. Removeu-se SÓ a renderização no olho. Prova textual: `git diff`
não toca `esteira.service.ts`/`esteira.controller.ts` nem `AuditoriaDocsModal.tsx`; o typecheck do
front passa, o que confirma que o Auditar (que lê o mesmo endpoint e tem seu próprio mapa de
documentos) segue completo. O Rike prova o Auditar abrindo-o em produção.

**Código órfão reportado e removido junto** (nada morto deixado para trás): os três helpers, as três
variáveis do contador, a interface `DocDetalhe`, o campo `documentos` do tipo local e o import `cn`
eram usados EXCLUSIVAMENTE pela lista removida (confirmado por grep antes de apagar). `EXIG_ROTULO`
e equivalentes existem de forma independente e duplicada no `AuditoriaDocsModal`, então o Auditar não
foi afetado. Nenhum órfão no backend: os dois modais leem o mesmo endpoint, não há query separada.

### Bloco 2, tolerância pt-BR no campo de valor do benefício (VR/VA)
**O que era.** No mesmo modal de Liberação, o salário já aceitava o pt-BR do consultor ("R$ 2.500,00")
por máscara no front (`maskMoedaBR`) mais normalização robusta no back (`valor-monetario-br.ts`),
enquanto o valor do benefício (VR, VA e afins) era MAIS ESTRITO: sem máscara, e o `@Transform` do
backend só removia milhar e trocava vírgula por ponto, SEM tirar "R$"/espaço, então "R$ 44,00" virava
`NaN` e caía em 400 sem o consultor entender por quê.

**O que foi feito (reuso, sem reimplementar).**
- **Front:** aplicada a máscara existente `maskMoedaBR` aos inputs de valor de benefício nos DOIS
  modais da Liberação, individual e lote (`liberacao/page.tsx`). É a mesma peça já usada no salário do
  próprio arquivo.
- **Back:** o `@Transform` de `BeneficioAlocadoDto.valor` passou a reusar `parseValorBR` (de
  `valor-monetario-br.ts`, o MESMO parser do salário): tolera "R$", espaço (inclusive não-quebrável),
  ponto de milhar e vírgula decimal; vazio vira `undefined` (opcional, não bloqueia); inválido volta
  como texto cru e o `@IsNumber` barra com 400 claro ("Valor do benefício inválido. Use o formato
  500,00."). Zero segue válido.

**Nota de escopo (§A.14).** `BeneficioAlocadoDto` é compartilhado por Liberar (individual), Liberar
(lote), Create e Update. Não há como deixar o backend tolerante "só na Liberação" sem duplicar o DTO,
o que seria pior. A mudança só torna a validação MAIS tolerante (nunca muda o resultado de um valor
válido) e cobre exatamente os dois modais que a OST pede, endurecendo de quebra o ponto único de
validação daquele campo. Não introduz travessão (§A.11).

### Bloco 3, prova
- **Bloco 1:** provado textualmente que a lista/contador saíram do olho, que a "Observação da
  liberação" continua (linhas 304-310 do modal) e que a API e o modal de Auditar não foram tocados
  (diff limpo + typecheck verde). Validação visual do olho e do Auditar: com o Rike, em produção.
- **Bloco 2:** novo teste de DTO real (`beneficio-valor-dto.spec.ts`, 14 casos, roda o transform +
  validate como o ValidationPipe global). Prova os formatos da OST chegando iguais ao VR:
  `44` -> 44, `44,00` -> 44, `R$ 44,00` -> 44 (mais `2.500,00`, `2 500,00`, `0`, number direto), vazio
  opcional, e inválido (`abc`, `R$ dez`, `1,2,3`, `-44`, `44,reais`) virando 400 com mensagem clara.
  O DTO é o mesmo do individual e do lote, então a prova vale para os dois.

### Varredura de campos monetários (Bloco 2, reportar sem alterar)
Além do valor de benefício (agora corrigido nos dois modais da Liberação), a varredura achou outros
pontos de entrada de moeda SEM o tratamento pt-BR completo (máscara no front + parser robusto no
back). NÃO alterados, por estarem fora do escopo desta OST (§A.14), ficam registrados para decisão do
diretor:
- **Salário no wizard `/nova` e no Gerenciador (`EditAdmissaoModal`):** back forte (mesmo DTO robusto
  do salário), mas front SEM máscara (envia texto cru). Funciona, porém menos amigável que na
  Liberação.
- **Valor de benefício no wizard `/nova` e no Gerenciador:** mesmo `BeneficioAlocadoDto`, então já
  herdaram a tolerância do back desta OST; o front desses dois continua SEM máscara.
- **Valor da tarifa de transporte (`/admin/tarifas`) e valor da passagem/VT (formulário `/vt`):**
  transform mais fraco no back (só troca vírgula por ponto, não remove milhar nem "R$"/espaço), então
  "1.500,00" quebra; front sem máscara.
- **Valor do exame (`AgendamentoExameModal`):** mesmo padrão antigo do benefício (remove milhar e
  vírgula, mas não "R$"/espaço); front sem máscara.

Recomendação (não executada): unificar esses pontos no par `maskMoedaBR` + `parseValorBR` numa OST
própria fecharia o desalinhamento de vez. Aguarda decisão do diretor.

### Observação de higiene (fora do escopo, não tocado)
O `pnpm lint` da raiz acusa 2 erros PRÉ-EXISTENTES em arquivos que esta OST não toca
(`nova/page.tsx:299` e `vt/page.tsx:245`): um `eslint-disable` de `react-hooks/exhaustive-deps`, regra
que a config atual do eslint não carrega. Confirmado que existem no HEAD e não têm relação com esta
entrega. Os arquivos alterados por mim passam no lint. Deixado como está (§A.14); registrado para o
diretor decidir se vira OST de config.

---

## 2026-07-22 (noite, 2): OST B2, unificação de rótulo e três regras sobrepostas, aguardando validação

Fecha os itens que a OST B1 deixou em aberto. **Lote continua não rodado.**

### Bloco 1, "Parcial" unificado em todos os lugares
**Causa.** A Esteira já lia "Parcial", o Gerenciador ainda lia "Inconformidade" para o MESMO estado de
fundo. Pior: lá o mapa de rótulos alimentava também as opções do filtro multi-select, então trocar o
texto criaria três opções "Parcial" idênticas no dropdown, com efeitos diferentes.

**Decisão.** No Gerenciador, PARCIAL, PENDENTE e INCONFORMIDADE passam a ler **"Parcial"**, no mesmo
tom âmbar. O filtro deixou de ser derivado do mapa de rótulos e passou a ter uma lista própria de
**três opções** (Completo, Parcial, Competências); a opção "Parcial" carrega os três valores do enum e
é **expandida na hora de consultar** (`valoresDoFiltroSinal`), porque é assim que o backend filtra
(`inArray` sobre `sinalizador_preenchimento`). Filtro segue funcionando, sem opção repetida.

**Varredura das demais telas:** só existem TRÊS mapas de rótulo de sinalizador no sistema. Esteira
(feito na B1), Gerenciador (feito agora) e a ficha da admissão. O enum do domínio não foi tocado.

**CORREÇÃO DE UMA IMPRECISÃO MINHA, que virou premissa desta OST.** No relatório da B1 eu disse que a
ficha da admissão usava o termo "com significado próprio". Conferido no código: a ficha
(`AdmissaoDetalheModal`) renderiza o MESMO campo `sinalizador`, não um estado de documento. O que é
verdade é outra coisa, mais estreita: o VALOR do enum `INCONFORMIDADE` é atribuído quando existe
documento INCONFORME (é o `recalcularSinalizador` que o define, e ele domina os demais), então na
ficha, que é tela de detalhe, o termo ainda informa algo acionável que "Parcial" esconderia. Como a
OST excluiu a ficha explicitamente, **ela não foi alterada**. Se o diretor quiser unificar lá também,
é uma linha.

### Bloco 2, o que serve como comprovante de conta bancária
A régua não dizia O QUE é aceito, e a reprovação saía inconsistente. Lista do diretor gravada como
regra, no padrão do PIS: **foto do cartão, print da tela do banco, comprovante de transferência entre
contas, carta de abertura de conta e extrato bancário**, com a instrução explícita de NÃO reprovar por
"tipo de documento incorreto" quando for um desses e os dados estiverem legíveis.

### Bloco 3, CPF aceita CTPS digital
A CTPS digital traz os dados do candidato e o número identificador dela É o CPF. A regra do CPF passa
a listar: comprovante de inscrição no CPF, CNH, RG que traga o CPF e **CTPS digital**.

### Bloco 4, foto unificada
**Qual conjunto prevaleceu e por quê: o do `FOTO_3X4`.** Ele já descrevia uma foto USÁVEL (recente,
fundo claro, rosto descoberto e face inteira visível, imagem nítida sem filtros ou recortes),
enquanto o `FOTO_CRACHA` tinha só a regra geral e aprovava qualquer imagem legível. Adotar o conjunto
mais fraco baixaria o critério das duas; adotar o mais forte iguala por cima. As regras agora vivem
numa constante compartilhada (`REGRAS_FOTO`), então os dois tipos são julgados pelo mesmo texto, e uma
regra a mais fecha a sobreposição: uma foto serve no lugar da outra, sem reprovar por tipo.

**O ajuste de exibição da OST A continua intacto**: o slot "Foto 3x4", quando vazio, segue exibindo a
foto de crachá recebida (`domain/documentos-equivalentes`). Mexemos em REGRA, não em exibição.

**Fundir os dois TIPOS num só: NÃO foi feito, como manda a OST.** Fica reportado com o que a fusão
custaria: `FOTO_CRACHA` é destino do de/para do Pandapé (o formulário "Foto do rosto para crachá"
mapeia para ele, `resolver-tipo-documento`), tem documentos já gravados em produção e é tipo ativo do
catálogo. Fundir exigiria migrar os documentos existentes, reapontar o de/para e a equivalência de
exibição. Com as regras unificadas, o ganho da fusão passa a ser só de catálogo. Decisão do diretor.

### Bloco 5, prova na Silvia (antes → depois, reauditoria pela rota real)
| Documento | Antes | Depois | Leitura |
|---|---|---|---|
| Comprovante de Conta Bancária | PENDENTE, "nome do titular não visível e rasuras" | **INCONFORME** | "Nome do titular da conta não visível e nome do banco não identificado." É o **motivo REAL**, exatamente o que o diretor confirmou. **Não é mais "tipo incorreto"**: a lista do Bloco 2 tirou o tipo da discussão e sobrou o defeito de verdade |
| CPF | ENTREGUE | **ENTREGUE** | segue válido, agora citando a regra de aceitação ("RG aceito como comprovante de CPF") |
| Foto para Crachá | ENTREGUE | **PENDENTE** | ver abaixo |

**A foto ANDOU PARA TRÁS, e é consequência direta do Bloco 4.** Ela estava ENTREGUE porque o
`FOTO_CRACHA` só tinha a regra geral ("legível, sem rasuras"). Com o critério do `FOTO_3X4` valendo
para os dois, a IA passou a cobrar identidade do titular e **data de captura**, e devolveu PENDENTE:
"Não foi possível verificar a identidade do titular e a data de captura da foto."

Isto expõe um problema da REGRA, não da unificação: **"a foto deve ser recente (até 6 meses)" não é
verificável a partir de uma imagem** (não há data no arquivo), então ela empurra qualquer foto para
PENDENTE. A regra é antiga, do seed original, e o efeito só apareceu agora porque antes ela não valia
para a foto de crachá. Duas saídas, decisão do diretor: afrouxar a regra para os dois tipos (tirar a
exigência de data, que a IA não tem como conferir), ou manter e tratar foto por **validação humana**,
que é exatamente o botão entregue na OST B1. **Não decidi por conta própria** (§A.14).

**Por que parei nos três documentos:** são os afetados pelas regras desta OST. Reauditar os demais
(RG, CTPS, PIS, certidão, SUS, escolaridade, título, residência) gastaria chamada de IA sem regra nova
para testar, e o caso da foto mostra que reauditar não é neutro: pode mexer em veredito que estava bom.

### Gate
Backend **357 testes** verdes + typecheck dos 3 pacotes. Regras aplicadas no banco pelo
`db:seed:regras` (idempotente) e gravadas no seed: **7 novas** nesta OST. Frontend reconstruído e no
ar. Lint com os mesmos **2 erros pré-existentes** de `react-hooks/exhaustive-deps`, intocados.

### Aberto
Validação do diretor EM PRODUÇÃO (sem prints, por instrução da OST): Gerenciador (coluna e filtro de
Pendências) e Esteira. Duas decisões pendentes: a regra de data da foto (Bloco 5) e a eventual fusão
dos dois tipos de foto (Bloco 4). **Sem commit até a validação** (§A.21).
