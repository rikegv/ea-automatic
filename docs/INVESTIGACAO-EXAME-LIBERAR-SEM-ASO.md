# Investigação: Status "Liberar Admissão Para Cadastro Sem ASO" (frente EXAME)

> §A.27: mapa de alcance ANTES de escrever a primeira linha. Nada foi construído.
> Ambiente medido: **homologação** (`ea_automatic_homolog`, clone anonimizado, §A.6). Só contagens.

## 1. O que trava a admissão no Exame hoje

A trava é UMA linha, e ela é pura:

```ts
// domain/frentes.ts, regra 3
export function podeAbrirCadastro(frentes: EstadoFrente[]): boolean {
  const auditoria = frentes.find((f) => f.tipo === "AUDITORIA");
  const exame = frentes.find((f) => f.tipo === "EXAME");
  return Boolean(auditoria?.concluida && exame?.concluida);
}
```

`EstadoFrente` é `{ tipo, concluida }`, e **só conhece o booleano**. A frente EXAME só fica
`concluida = true` no status `APTO` (`STATUS_CONCLUI.EXAME`), e o `APTO` tem gate próprio: exige ASO
anexado E validado pela I.A. Consultor COMUM leva trava dura; Master e Super Admin podem forçar com
autorização registrada (NC-2, `TERMO_APTO_SEM_ASO`).

**Existe hoje uma liberação sem ASO, e ela NÃO serve para este pedido.** A que existe leva a frente a
`APTO`, conclui o Exame, **tira o candidato da fila** e gera não conformidade. O pedido do diretor é o
oposto: destravar o avanço **sem** concluir e **sem** tirar da fila.

Os três caminhos que abrem o gate (e a porta única por onde os três passam):

| Caminho | Quem dispara |
|---|---|
| `esteira.service.mudarStatus` | o consultor move o status na tela |
| `auditoria.service.concluirFrente` | a I.A fecha a Auditoria |
| `esteira.service.concluirExamePorAso` | o ASO validado pela I.A fecha o Exame |

Todos chamam `nascerCadastroEIntegracao`, que cria CADASTRO_CONTRATO + INTEGRACAO + IFRACTAL numa
transação só. **É essa porta que o status novo precisa abrir**, e é ela que garante que o avanço
funcione pelos três caminhos sem tocar em nenhum deles.

## 2. Mapa de alcance: quem lê "Exame concluído"

Varredura completa dos 17 serviços que leem `frentes_admissao`.

| # | Consumidor | O que lê | Efeito do status novo |
|---|---|---|---|
| 1 | `podeAbrirCadastro` (regra 3) | `exame.concluida` | **TEM DE MUDAR.** É a trava do pedido |
| 2 | `kitLiberado` (gate F9/F12) | reusa o `podeAbrirCadastro` | **MUDA POR TABELA.** Decisão D2 abaixo |
| 3 | `clicksign-sync.dispararEnvelope` | `kitLiberado` | idem, segue o item 2 |
| 4 | `clicksign-gestao.listarAptos` | nomeia AUDITORIA, EXAME, CADASTRO | fila de assinatura, segue o item 2 |
| 5 | `admissaoConcluidaSql` | Cadastro concluído + sem Integração pendente | **VAZAMENTO.** Não olha o Exame. Decisão D1 |
| 6 | Carimbo do farol `ADMISSAO_CONCLUIDA` | conclusão de INTEGRACAO ou de Cadastro sem integração | **VAZAMENTO 2.** Não olha o Exame. Decisão D1 |
| 7 | `exame-scheduler` (de hora em hora) | `STATUS_GOVERNADOS` | **ATROPELA** se o status entrar na lista. Fica fora |
| 8 | `marcarExameAgendado` (salvar agendamento) | pula concluída, CANCELADO e AGENDADO | **ATROPELA.** Reagendar desfaz a liberação em silêncio |
| 9 | `STATUS_EXAME_APTO_POR_ASO` | whitelist de 4 status | **PRECISA DO NOVO.** Senão o ASO não conclui depois |
| 10 | `deriveFarolGlobal` | `exame.concluida` | não muda (segue EM_ADMISSAO, que é o certo) |
| 11 | Fila da aba Exame (`itensWhere`) | `concluida = false` | não muda: continua na fila, que é o pedido |
| 12 | KPIs da aba (`porStatus`) | catálogo + `concluida = false` | **ganha card automático.** Decisão D3 |
| 13 | Card "Aptas" e "Total Já Realizado" | `concluida = true` | não muda: liberado não é apto |
| 14 | Gerenciador, coluna Exame e extração | rótulo do catálogo | não muda: lê o catálogo, mostra o rótulo novo |
| 15 | Painel Gerencial, segmento Exame | `group by fe.status` | ganha linha nova, leitura pura |
| 16 | Alto Volume | `admissaoConcluidaSql` e farol | só se mexer no item 5 |
| 17 | Fila de Benefícios | Cadastro concluído | não muda |
| 18 | `reversaoDerrubaCadastro` | só dispara se o status de origem conclui | **não alerta** ao desfazer a liberação. Item 6 do plano |
| 19 | `trocarCliente` | as 3 frentes concluídas | não muda |
| 20 | Régua documental e pendências obrigatórias | não leem status de frente | não muda |

## 3. Os dois vazamentos, medidos

**A conclusão da admissão NÃO olha o Exame.** É o achado mais pesado da investigação, e é o mesmo
tipo de dependência escondida do gate cego do iFractal.

```sql
-- admissaoConcluidaSql, hoje
EXISTS (cadastro concluído) AND NOT EXISTS (integração pendente)
```

Não há uma palavra sobre EXAME. Consequência: a admissão liberada sem ASO avança, o time conclui o
Cadastro, conclui a Integração, e **ela passa a contar como CONCLUÍDA nas três telas com o Exame
ainda aberto**, que é exatamente o que o diretor proibiu.

O mesmo buraco no farol: o carimbo `ADMISSAO_CONCLUIDA` é gravado na conclusão da Integração (ou do
Cadastro, para cliente que não exige integração) e também não pergunta pelo Exame.

**Medido na homologação, hoje, sem nenhuma mudança:**

| Medida | Número |
|---|---|
| Admissões contadas como concluídas | **1749** |
| Delas, com a frente EXAME ainda ABERTA | **3** |
| Vivas com Exame aberto | 67 |

Os 3 já existem hoje, sem o status novo. Se o status entrar sem tratar isso, esse balde cresce e a
diretoria passa a ver como concluída gente que não entregou ASO.

## 4. A população que a regra alcança

Vivas com Exame aberto, por status: **A_AGENDAR 31 · AGUARDANDO_ASO 26 · AGENDADO 7 · ASO_PENDENTE 3**
(total 67).

| Recorte | Número |
|---|---|
| Com previsão do ASO preenchida | 36 |
| **Elegíveis pela trava** (previsão > data de admissão) | **23** |
| Bloqueadas pela trava (previsão anterior ou igual) | 13 |
| Sem previsão do ASO (bloqueadas por falta de dado) | 31 |

**A trava tem um efeito colateral que o diretor precisa saber:** a previsão do ASO é **opcional** no
agendamento (decisão registrada: quem a informa é a clínica, e exigi-la travaria um exame legitimamente
agendado). Sem previsão preenchida não há como comparar, então **a liberação fica bloqueada em 31 das
67 vivas** até alguém preencher a previsão. É a consequência correta da regra, não um defeito, mas
muda a rotina do time.

## 5. Decisões que preciso do diretor

**D1. A conclusão da admissão, enquanto o ASO não chega.**
- **(a) Recomendada, cirúrgica:** `admissaoConcluidaSql` passa a excluir quem tem o Exame no status
  novo, e o carimbo do farol também espera. Como nenhuma admissão está nesse status hoje, o número
  **não se move**: 1749 antes, 1749 depois. Prova antes e depois obrigatória.
- (b) Ampla: exigir EXAME concluído na expressão. **Move 1749 para 1746 hoje** e reescreve o passado.
  Não recomendo.
- (c) Nenhuma: aceitar que a admissão conta como concluída com o Exame aberto. Contraria o que a OST
  pede.

**Cuidado embutido na (a):** suprimir o carimbo do farol e não recolocá-lo quando o ASO chegar cria
exatamente o defeito da Bienal (§A.27): farol nunca escrito, Gerenciador contando pelas frentes e
Painel não contando pelo farol. Por isso a peça 5 do plano existe e tem teste próprio.

**D2. O kit e a assinatura acompanham a liberação?**
Hoje o kit exige as três frentes concluídas. Liberada sem ASO, a admissão anda até o fim do Cadastro
e **para antes do contrato**. Duas leituras, e é decisão de negócio:
- **(a) Recomendada:** kit e assinatura **continuam esperando o ASO**. A pessoa começa a trabalhar, o
  contrato é assinado quando o exame fecha. Zero mudança em gate validado.
- (b) Liberar o kit junto: a pessoa começa a trabalhar **e** assina. Mexe no gate F12 e na fila do
  Ass.Click, que são produção validada.

**D3. O card novo na aba Exame.**
Todo status não concluinte do catálogo **ganha card de KPI automaticamente**. O status novo vai
aparecer como card clicável na fileira da aba Exame, sem eu escrever nada. §A.31: confirma ou tiro?

**D4. O rótulo exato.**
"Liberar Admissão Para Cadastro Sem ASO" é comando, e o catálogo é etiqueta de estado (§A.24). Sugiro
o código `LIBERADO_SEM_ASO` com rótulo **"Liberado Para Cadastro Sem ASO"**. Confirma o texto?

## 6. Plano de construção, por peça

Nada começa antes do OK. Pulso a cada peça.

**Peça 1. O status existe.** Migration nova (`LIBERADO_SEM_ASO`, `conclui = false`, ordem entre
`ASO_PENDENTE` e `APTO`), no molde exato da 0048, mais o código em `STATUS_EXAME` no shared-types.
Sem migration o status não aparece na tela; sem shared-types o `isStatusValido` recusa.

**Peça 2. O gate passa a enxergar o status.** `EstadoFrente` ganha `status?`, e `podeAbrirCadastro`
passa a aceitar EXAME concluído **ou** liberado. Quem não passar o status mantém o comportamento de
hoje (fail-closed, o padrão seguro). Os 9 pontos de chamada são atualizados juntos, porque um só que
fique para trás vira o defeito da §A.26.

**Peça 3. A trava da data.** Bloqueio duro em `mudarStatus`, no mesmo molde do gate do AGENDADO:
sem previsão do ASO, sem data de admissão, ou previsão menor ou igual à data, recusa com recado
claro. Regra pura e testada em `domain/`, não solta no serviço. Qualquer consultor libera, sem papel
especial, como pedido.

**Peça 4. Ninguém atropela a liberação.** O scheduler de hora em hora fica fora do status novo (não
entra em `STATUS_GOVERNADOS`) e o salvamento do agendamento para de sobrescrever, ao lado do
CANCELADO. Sem isso a liberação dura menos de uma hora, ou some no próximo reagendamento.

**Peça 5. O ASO chegando fecha de verdade.** O status novo entra na whitelist
`STATUS_EXAME_APTO_POR_ASO` (e no script gêmeo de recuperação), então o ASO validado leva a frente a
APTO, tira da fila e devolve a admissão ao fluxo normal. **Junto:** o recompute do desfecho, para a
admissão que já terminou Cadastro e Integração receber o farol de concluída no instante em que o
Exame fecha. É a peça que impede o buraco do farol descrito na D1.

**Peça 6. Desfazer avisa.** Sair do status novo de volta para AGENDADO fecha o gate com o Cadastro já
aberto, e hoje isso passaria em silêncio. Entra no `reversaoDerrubaCadastro`, que é o alerta que já
existe para o APTO.

**Peça 7. Testes.** Nos arquivos que já cobrem isto: `domain/frentes.spec.ts` (gate com o status
novo), `esteira.gates-exame.spec.ts` (a trava da data, os dois lados), `expressoes-admissao.spec.ts`
(a expressão nova), `esteira.farol-conclusao.spec.ts` (o farol que espera e depois carimba),
`esteira.transicao-pos-aso.spec.ts` (o ASO fechando a partir do status novo). Mais um spec de
alcance, no molde do `ifractal-alcance.spec.ts`, que reprova quem fizer o status novo concluir frente.

**Peça 8. Prova (§A.13/§A.20).** Homologação, screenshot da aba Exame com o status na fila, do
bloqueio pela data, da admissão aparecendo no Cadastro **enquanto continua no Exame**, e a contagem
das três telas antes e depois, lado a lado.

## 7. O que NÃO será tocado

Régua documental, pendências obrigatórias, sinalizador, iFractal, Auditoria, Integração, Benefícios,
Alto Volume, Gerenciador e as expressões do Painel (fora do recorte cirúrgico da D1, se aprovado).
Produção não recebe nada: a construção é toda em homologação, sem commit, até a validação do diretor.
