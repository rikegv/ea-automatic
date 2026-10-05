# Mapa de alcance: editar e excluir vaga JÁ LIBERADA (Central de Vagas)

Medido em 05/10/2026 contra a produção (`ea-db`, banco `ea_automatic`) e contra o código da `main` +
working tree. Investigação do coordenador ANTES de construir (§A.27, §A.39 passo 1, §A.40 regra 1).
**Nada foi construído.** Este mapa vai ao `seguranca` antes do primeiro despacho.

## 1. O que existe hoje

| ação | existe? | onde | RBAC | trilha |
|---|---|---|---|---|
| editar a vaga inteira (formulário) | **só em RASCUNHO e REVISAO** | `PATCH /as/vagas/:id`, `vagas.service.ts:1074` recusa com 409 qualquer outro papel | menu `as-vagas` | nenhuma (só `atualizado_em`) |
| liberar da revisão | sim | `POST :id/liberar-revisao`, `vagas.service.ts:3619` | menu | evento `REVISAO -> ABERTURA` em `as_vaga_status_eventos` |
| corrigir a liberação | **só o cliente**, e devolver à fila | `POST :id/corrigir-revisao`, `vagas.service.ts:3966` | MASTER, SUPER_ADMIN | `vaga_cliente_correcoes` (de/para) |
| editar posições | sim | `PATCH :id/posicoes`, `vagas.service.ts:1585` | menu | `vaga_meta_reducoes` (só redução) |
| transferir consultor | sim, **sem tela** | `PATCH :id/consultor`, `vagas.service.ts:4182` | menu | `vaga_consultor_transferencias` |
| mover status, fechar, cancelar, reabrir | sim | rotas próprias | variado | `as_vaga_status_eventos` |
| **excluir vaga** | **não existe** | nenhuma rota `@Delete` em `vagas.controller.ts`; nenhum botão | n/a | n/a |

**"Liberada" não é coluna.** É a existência do evento `REVISAO -> ABERTURA` na trilha
(`liberadasDaRevisao`, `vagas.service.ts:3924`).

**O formulário já existe e cobre tudo.** Abrir e revisar são o MESMO componente,
`components/as/vagas/TrilhaDaVaga.tsx`, com 4 modos (`nova`, `rascunho`, `clone`, `liberacao`). São ~55
campos em 5 passos. Nenhum `<select>` nativo (§A.35 ok).

**Nenhuma trilha é LIDA por tela hoje**, exceto `vaga_meta_reducoes` (no painel). Nenhuma tabela
existente tem forma de "campo, de, para" genérico.

## 2. Volume em produção (05/10)

| | |
|---|---|
| vagas | 506 (502 PENDENTE_REVISAO, 2 ABERTA, 2 FECHADA) |
| vagas vindas do Pandapé (`id_vacancy_pandape`) | 497 |
| vagas **sem `cod_cliente`** | **497** |
| vagas liberadas pela revisão (evento) | 2 |
| candidaturas | 100.761, todas com vaga; mediana 84 por vaga, máximo 2.483 |
| vagas com candidatura ligada a admissão | 13 (35 admissões; **26 vivas**, em 9 vagas) |
| admissões ligadas cujo `cod_cliente` JÁ difere do da vaga | **33 de 35** |
| vagas com mais enviados à admissão que posições oficiais | 23 |
| vagas **sem candidatura nem shortlist** (as únicas que um DELETE aceitaria) | **27** |

Hoje a edição alcança 2 vagas; ela passa a valer para as 502 da fila conforme forem liberadas.

## 3. Impacto medido, campo a campo

**Princípio que o código confirma:** a vaga NÃO é lida ao vivo por nada fora do A&S. A admissão copia
alguns campos UMA vez, no envio para admissão (`registrarSaida` -> `dadosDaPonteParaAdmissao`,
`candidatos.service.ts:2747`; `criarPreAdmissaoDoFunil`, `admissoes.service.ts:890`). O GI lê só a
admissão (`gi-leitor.service.ts:103`), nunca a vaga. Painel, Esteira e Alto Volume não leem `vagas`.

| campo | quem lê fora | snapshot ou ao vivo | o que acontece se editar | tratamento proposto |
|---|---|---|---|---|
| **cliente** (`cod_cliente`) | ponte -> `admissoes.cod_cliente`; segmento/comercial nulos HERDAM do cliente (`vaga-item-onda-e.ts:20`); entrevistas com o cliente | admissão: snapshot. herança: ao vivo | admissão já criada **não muda** (e o GI segue a admissão); segmento/comercial herdados mudam sozinhos; entrevistas com o cliente antigo ficam vivas (o `trocarVaga` as apaga, a edição pularia isso) | **aviso com confirmação**, mostrando quantos candidatos, quantas admissões já criadas (que NÃO mudam) e quantas entrevistas com o cliente antigo. Decisão do diretor sobre as entrevistas |
| **cargo** | ponte -> `admissoes.cargo_id` | snapshot | admissão já criada mantém o cargo antigo; as próximas saem com o novo | aviso com confirmação quando há admissão ligada |
| salário, escala, centro de custo, tempo de contrato, motivo, local de trabalho | ponte -> `dados_vaga_folha` | snapshot | só afeta admissões FUTURAS | aviso quando há admissão ligada: "as já enviadas não mudam" |
| benefícios (`vaga_beneficio`) | ninguém (a ponte NÃO copia) | n/a | nenhum fora da vaga | direto |
| **posições** oficiais/banco | travas de ocupação (`candidatos.service.ts:1506`, `:2940`), `ocupacaoPorVaga` | ao vivo | abaixo do ENTREGUE: hoje recusado; abaixo do ALOCADO e acima do entregue: hoje passa | **pela regra existente** de `editarPosicoes` (recusa abaixo do entregue, trilha da redução), nunca pelo corpo do formulário |
| **prazo** (`data_limite`) | SLA, só no front (`lib/as-vaga-sla.ts:154`); só esta data e `data_fechamento` entram | ao vivo | muda o SLA e **apaga o atraso** sem rastro | aviso + trilha com o prazo anterior |
| data de abertura, solicitação, alinhamento, realinhamento, envio de shortlist | só exibição, filtro e ordenação | ao vivo | muda o recorte por período | direto, com trilha |
| tipo de vaga, tipo de processo, célula, segmento, comercial, vínculo, modelo, escolaridade, faixa etária, gênero, idiomas, testes, perfil, atribuições, ambiente, etapas, observações, solicitante, regiões, confidencial | só A&S | ao vivo | nenhum fora | direto, com trilha |
| status | derivação automática lê **só** `status` e `status_manual_em` (`derivar-status-da-vaga.ts:56`) | ao vivo | a edição não toca, então a amarração automática **não quebra** | **fora do formulário de edição**: tem fluxo próprio (mover, fechar, cancelar, reabrir) |
| consultor | só `vagas.service` | ao vivo | nenhum fora | **pela rota de transferência existente**, que já tem trilha |

### NÃO editável mesmo liberada (quebraria algo)

- **`codigo` e `id_vacancy_pandape`**: são a identidade da vaga no Pandapé. A varredura procura a vaga
  por `id_vacancy_pandape` (`ingestao-repositorio.ts:709`); trocar faria a próxima volta criar uma
  vaga NOVA duplicada na fila.
- **`vagas_fechadas`, `vagas_fechadas_banco`**: carimbo do fechamento; editar faz o carimbo discordar
  da ocupação.
- **`data_reabertura`, `data_limite_anterior`, carimbos de fechamento e cancelamento**: rastro de
  evento, não dado de cadastro.
- **status**: fluxo próprio (acima).

**Campos importados do Pandapé** (`codigo`, `nome_divulgacao`, `cidade_id`, `posicoes_oficiais`):
depois da liberação a varredura **não reescreve** nenhum deles (`ingestao-repositorio.ts:878`);
diferença vira registro em `as_ingestao_divergencias`. Então só a IDENTIDADE precisa travar; nome,
cidade e posições podem ser editados, e o diretor pediu posições.

## 4. Excluir: o que o banco faz, e o defeito que a exclusão teria

- `as_candidaturas.vaga_id` e `as_shortlists.vaga_id` são **RESTRICT**: vaga com gente **não pode** ser
  apagada; o banco recusa. Ninguém some em silêncio por construção. Hoje isso deixa **27 de 506**
  vagas excluíveis.
- As trilhas da vaga são **CASCADE** (`as_vaga_status_eventos`, `vaga_meta_reducoes`,
  `vaga_cliente_correcoes`, `vaga_consultor_transferencias`, `vaga_beneficio`, `as_varredura_vagas`,
  `as_ingestao_divergencias`): apagar a vaga **apaga o histórico dela**. O registro da exclusão
  precisa viver numa tabela SEM FK para `vagas`.
- `as_candidatura_etapas.vaga_de/vaga_para`: SET NULL.
- **A vaga do Pandapé RENASCE.** Se a vaga ainda está ativa no Pandapé, a próxima volta da varredura
  (30 min) não acha o `id_vacancy_pandape` e cria a vaga de novo, com id novo, na fila de revisão.
  Excluir só é definitivo para vaga criada à mão ou já encerrada no Pandapé.

## 5. Proposta do CRUD

1. **Editar**: um modo novo `edicao` no MESMO `TrilhaDaVaga` (não um formulário novo), aberto por um
   botão "Editar vaga" no painel da vaga, para vaga em papel ABERTURA ou ENTREGA.
2. **Rota nova** `PATCH /as/vagas/:id/editar`, sem `@Roles` (menu `as-vagas`, qualquer consultor). **NÃO
   relaxar a guarda do `atualizar`**: ele grava NULO em todo campo ausente (`camposDaTrilha`) e
   apaga e reinsere benefícios; reaproveitá-lo numa vaga viva apagaria campo que a tela não mandou.
   A rota nova aplica uma **lista branca** de campos, calcula o de/para NO SERVIDOR, recusa os campos
   travados e passa posições pela regra de `editarPosicoes`, tudo na mesma transação com a linha
   travada (`for update`).
3. **Trilha**: tabela nova `vaga_edicoes` (vaga_id, por_id, em, campo, de, para), sem FK CASCADE que
   apague o histórico. **§A.6**: `substituido_cpf` e os dados do solicitante (telefone, e-mail) NÃO
   vão em claro para a trilha: registra-se "alterado", sem os valores.
4. **Excluir**: `DELETE /as/vagas/:id` com `@Roles("SUPER_ADMIN")` (o Master NÃO exclui, por decisão do
   diretor). Recusa com mensagem clara e contagem quando há candidatura ou shortlist (o banco já
   garante, a mensagem é para a pessoa). Registro em `vaga_exclusoes` sem FK, com quem, quando e o
   instantâneo dos campos de cadastro, sem PII. Aviso, no modal, quando a vaga é do Pandapé e pode
   renascer.
5. **Aviso com confirmação** só onde há efeito fora da vaga: cliente, cargo, campos copiados à
   admissão (quando há admissão ligada) e prazo.

## 6. Decisões do diretor

1. Editar vaga **encerrada** (FECHADA, CANCELADA) também, ou só em processo (ABERTURA/ENTREGA)?
2. Ao trocar o cliente: **apagar** as entrevistas marcadas com o cliente antigo (como o `trocarVaga` já
   faz) ou **manter**?
3. Ao editar salário, escala e o que a admissão copia: **não propagar** às admissões já criadas
   (proposta) ou propagar?
4. Excluir vaga do Pandapé ainda ativa lá: **bloquear**, ou permitir sabendo que ela volta à fila?
5. Posições abaixo do já ALOCADO (acima do entregue): manter como hoje (passa) ou exigir confirmação?

## 7. Alcance: o que NÃO se toca

- o `atualizar` (`PATCH :id`) e a liberação: validados, consumidos pela fila de revisão;
- a ingestão do Pandapé e do Digai;
- `as/candidatos/*` (Central de Candidatos, recém validada);
- qualquer arquivo de Portal, GI ou Digai: há outras sessões no ar.

**Arquivos que a frente toca:** `vagas.controller.ts`, `vagas.service.ts`, `vagas.dto.ts`, schema +
uma migration (duas tabelas novas), `packages/shared-types/src/index.ts` (dono: coordenador, §A.39),
`TrilhaDaVaga.tsx`, `VagaPainelModal.tsx`, `app/(app)/as/vagas/page.tsx`, `lib/as-vagas*.ts`.

---

# EMENDA, após o VETO do `seguranca` (05/10/2026, 12h55)

Veredito: **VETADO** nos itens 2 (dado pessoal na trilha) e 4 (lista branca); **APROVADO com
exigências** nos itens 1 (RBAC) e 3 (exclusão). Correções incorporadas abaixo; elas SUBSTITUEM o que
contradizem nas seções 3 a 5.

## E-1. Trilha (§A.6): lista fechada AO CONTRÁRIO

Só gravam `de`/`para` em claro os campos de TIPO FECHADO: referência a catálogo (cargo, cliente,
cidade, célula, segmento, comercial, benefício), enum, data, número, salário, booleano e lista de
catálogo (testes, etapas, regiões). **Todo texto livre grava só "alterado"**, sem valor: substituído
(CPF e NOME), solicitante (nome, telefone, e-mail), justificativa do motivo, observações, atribuições,
perfil, ambiente, experiência, cursos, local de trabalho, horário e escala e os campos "outros".
Campo não classificado cai em "alterado". Coluna `campo` com CHECK da lista. Nenhum valor em log ou
mensagem de erro. O instantâneo de `vaga_exclusoes` segue a mesma régua, e o nome de divulgação fica
FORA (o título do Pandapé já chegou com nome de gente dentro).

## E-2. Lista branca: o que a edição NÃO escreve, nunca

Além do que a seção 3 já travava: `contraparteId` (reescreve `consultor_id` e `recruiter_id`),
`aberto_por_id`, `status_manual_*`, `encerrada_em`, `cliente_proposto*` (teste de fonte admite só dois
escritores), `data_fechamento`, `data_prevista_inicio`, `enviar_para_admissao`, `fechamento_forcado_*`,
`cancelada_*`, `cancelamento_*`, `reabertura_por_id`, **`salario_fechamento`** (a ponte usa
`fechamento ?? abertura`: editar o de abertura numa vaga com salário de fechamento não muda nada, e o
aviso mentiria), **`centro_custo`** (desativado por decisão de 22/08, fora do escopo), **`envio_shortlist`**
(derivado de `as_shortlists`) e `regiao_estado` (derivado da cidade).

## E-3. Como a edição monta o resultado

**Resultado = vaga atual + campos enviados (só da lista branca)**, passado pelo PRÓPRIO `camposDaTrilha`
com o status atual, colunas proibidas descartadas, de/para calculado contra a vaga atual. Motivo: um
corpo parcial que troca só o vínculo deixaria o CPF do substituído ÓRFÃO no banco (hoje quem o apaga é
o corpo completo). Sobre o resultado rodam `travaObrigatorios` (não esvaziar cliente nem cargo de vaga
publicada) e a conferência do dígito do CPF como vaga PUBLICADA. Papel e encerramento são conferidos de
novo DEPOIS do `for update`, porque o fechamento automático da varredura pode rodar no meio. A rota
recusa explicitamente RASCUNHO e REVISAO.

## E-4. Posições dentro da transação

`editarPosicoes` abre a própria transação e confere o entregue fora dela: não serve para ser chamado
dentro da edição. Duas saídas, e a (a) toca código validado (§A.26), então vai ao diretor:
- **(a)** extrair um núcleo que recebe a transação aberta e passar as duas rotas por ele;
- **(b)** aplicar `excessoDePosicoes` e `reducaoDeMeta` dentro da transação nova, sem tocar o existente.

Nos dois, a redução grava **sempre** em `vaga_meta_reducoes` (senão volta o furo de 09/09: fechamento
após redução igual a entrega real). Vaga encerrada segue recusando posições.

## E-5. Cliente

A troca pela edição grava TAMBÉM em `vaga_cliente_correcoes` (senão aquela trilha mente por omissão),
confere `exigirClienteExistente` e **não aceita cliente vazio**: o cliente da vaga desce para a admissão
e decide régua documental e pasta do Drive. Conflito explícito, ACEITO pelo pedido do diretor: hoje
trocar cliente de vaga liberada é de MASTER (`corrigir-revisao`); com a edição, qualquer consultor troca.

## E-6. Exclusão

`vaga_edicoes` e `vaga_exclusoes` **sem FK nenhuma** para `vagas` (NO ACTION impediria excluir vaga
editada; SET NULL perderia o vínculo). Contagem e trava na mesma transação, `for update`, erro `23503`
vira 409 sem detalhe. O instantâneo leva o que o CASCADE apaga e não é PII: quem liberou e quando,
reduções de meta, trocas de cliente, transferências. **A vaga renasce também pelo Digai**
(`digai-repositorio.ts:403`), não só pela varredura do Pandapé. Teste próprio de que o MASTER recebe
403 (não entra no `rbac-exclusao.spec.ts`, que afirma o contrário para as rotas destrutivas). Medido às
12h56: **29** vagas excluíveis em 508 (a base cresceu), 26 delas da varredura.

## E-7. Efeitos colaterais a tratar na mesma frente

- Editar nome, cidade ou posições de vaga do Pandapé abre ou incrementa divergência a cada volta de 30
  min; a mensagem 409 em `ingestao-divergencias.service.ts` ("só voltam a ser editáveis quando um
  Master devolve") fica falsa e precisa ser reescrita.
- A edição NÃO escreve `data_limite_anterior` (carimbo da reabertura, MASTER); o prazo anterior fica só
  na trilha.
- O papel de RBAC vem do TOKEN (validade 900 s): um SUPER_ADMIN rebaixado exclui por até 15 min. Vale
  para todas as rotas com `@Roles`; registrado, não é veto.

## Decisões do diretor que a emenda acrescenta

6. Posições: caminho (a), que mexe no `editarPosicoes` validado, ou (b), que não mexe?
7. **Recrutador** (`recruiter_id`) e **consultor**: editáveis pela edição? Hoje o consultor tem rota
   própria com trilha e sem tela; o recrutador não tem rota nenhuma depois da liberação.
