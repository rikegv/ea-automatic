# Investigação: encaixe da frente iFractal na Esteira

**Pedido.** 5ª frente na Esteira (iFractal), tipo de marcação no cliente, menu gerencial e colunas
na extração. **Investigação da parte 2 ANTES de construir** (§A.26/§A.27), porque a Esteira é código
validado em produção.
**Status.** Nada construído. Nada commitado.

---

## 1. O risco que o próprio CLAUDE.md já tinha documentado

A §A.3 registra, ao explicar por que `beneficios_entrou_em` virou COLUNA e não frente:

> A frente daria o mesmo comportamento e custaria alcance (...). Aquela tabela é lida por TODA
> consulta de contagem do sistema, e hoje elas só não erram porque **todas filtram por tipo**:
> bastaria uma futura esquecer o filtro para a conta quebrar em silêncio.

Então a investigação foi exatamente essa: **auditar os 25 consumidores de `frentes_admissao`, um a
um, e achar quem NÃO filtra por tipo.**

---

## 2. Resultado da auditoria: 24 seguros, 1 quebra em silêncio

### O ACHADO: `clicksign-gestao.service.ts`, a fila de assinatura

```
// linha ~199
const concluidas = this.db
  .select({
    admissaoId: frentesAdmissao.admissaoId,
    qtd: sql`count(*) filter (where ${frentesAdmissao.concluida})`.as("qtd"),   // <<< SEM TIPO
  })
  .from(frentesAdmissao)
  .groupBy(frentesAdmissao.admissaoId)

// linha ~239, o gate:
sql`${concluidas.qtd} >= 3`
```

**A contagem é numérica e cega ao tipo.** Hoje ela acerta por acidente: as frentes possíveis são 4, e
a Integração só nasce junto do Cadastro, então "3 concluídas" na prática só acontece com as 3 certas.

**Com o iFractal, o acidente acaba.** A frente nasce junto do Cadastro e o consultor a move livre até
"Finalizado". Uma admissão com **Auditoria + Exame + iFractal** concluídas e o **Cadastro ainda
aberto** passa a somar `qtd = 3` e **fura o gate F12** na defesa da fila de assinatura.

O próprio comentário do arquivo diz que essa contagem é hoje "defesa e não régua de entrada" (a régua
virou o kit anexado). Ou seja: **não é catástrofe imediata**, porque o kit ainda não estaria anexado.
Mas é uma defesa em profundidade que deixaria de defender, em silêncio. É o defeito da Bienal.

**Correção, cirúrgica, uma linha:**
```
qtd: sql`count(*) filter (where ${frentesAdmissao.concluida}
        and ${frentesAdmissao.tipo} in ('AUDITORIA','EXAME','CADASTRO_CONTRATO'))`.as("qtd")
```
Nomear os três tipos torna o gate imune a QUALQUER frente futura, não só ao iFractal.

### Os 24 seguros, e por quê

| Consumidor | Como se protege |
|---|---|
| `esteira.service` (14 consultas) | `clientePeriodo[0] = eq(frentesAdmissao.tipo, tipo)`. A tela inteira é **parametrizada por tipo**, e `kpiWhere`/`itensWhere` derivam dele. |
| `gerencial.service` | `left join ... and fe.tipo = 'EXAME'` (um join por tipo nomeado) |
| `expressoes-admissao` (`admissaoConcluidaSql`) | `f.tipo = 'CADASTRO_CONTRATO'` e `i.tipo = 'INTEGRACAO'` |
| `beneficios-fila.service` | `f.tipo = 'CADASTRO_CONTRATO'` nas duas expressões |
| `exame-scheduler` | `eq(tipo, "EXAME")` |
| `nascimento-cadastro` | insere e lê por tipo |
| `alto-volume-analise` | `fc.tipo = 'CADASTRO_CONTRATO'` |
| `farol.ts` | carrega tudo, mas decide com `.some(f => f.tipo === "AUDITORIA" ...)` |
| `kit.service`, `clicksign-sync`, `auditoria.service`, `admissoes.trocarCliente` | carregam todas as frentes e escolhem por tipo em JS (`podeAbrirCadastro`, `kitLiberado`, `TODAS.every`) |
| `regras-esteira-import` / `-vivas`, cargas | `tipo` explícito no UPDATE/INSERT |

`admissoes.trocarCliente` merece nota: usa `TODAS.every(...)`, mas `TODAS` é a **lista literal**
`["AUDITORIA","EXAME","CADASTRO_CONTRATO"]`. Frente nova não entra na conta. Seguro.

---

## 3. A DECISÃO que a investigação levanta (não é da fábrica)

`admissaoConcluidaSql` (`db/expressoes-admissao.ts`) é o que diz se uma admissão **terminou**, e
alimenta **Painel, Gerenciador e Alto Volume**:

```
EXISTS (... tipo='CADASTRO_CONTRATO' AND concluida=true)
AND NOT EXISTS (... tipo='INTEGRACAO' AND concluida=false)
```

O iFractal **não entra** ali por padrão. Consequência: **a admissão conta como concluída mesmo com o
iFractal pendente.**

**Recomendo manter assim**, e a razão é o §A.27: incluir o iFractal nessa expressão mexeria nas três
telas de contagem de uma vez, que é literalmente o defeito que originou a regra (56 admissões
contadas em dobro). O iFractal é controle administrativo POSTERIOR, não etapa que define o fim da
esteira. **Mas é decisão do diretor, não da fábrica.**

---

## 4. Como a 5ª frente encaixa (o caminho é curto, e isso não é acaso)

Duas peças do sistema foram desenhadas justamente para isto:

**a) O nascimento tem UMA PORTA SÓ.** `esteira/nascimento-cadastro.ts` existe porque o Cadastro
nascia em três lugares e a transição pós-ASO quebrou quando só dois foram tocados (o caso que
originou a §A.26). Hoje os três caminhos (`esteira.mudarStatus`, `auditoria.concluirFrente`,
`esteira.concluirExamePorAso`) passam pela MESMA função. **O iFractal se pendura ali, em ~10 linhas,
e herda os três gatilhos de graça.** É exatamente o "mesmo gatilho" que o pedido descreve.

**b) A Esteira é parametrizada por tipo.** A aba nova não pede consulta nova: passa a rota
`ifractal`, e `clientePeriodo` já filtra por ela.

**Os 4 mapas totais quebram no TYPECHECK, não em silêncio** (é a rede de proteção funcionando):
`STATUS_INICIAL_FRENTE` (`domain/admissao.ts`), `ORDEM_STATUS` e `STATUS_CONCLUI` (`domain/esteira.ts`).
`CONCLUI_TAMBEM` é `Partial`, não cobra entrada.

### Onde login e senha moram

**Tabela própria `admissao_ifractal`** (`admissao_id` unique, `login`, `senha`), espelhando
`exame_agendamento` e `integracao_agendamento`. NÃO em `frentes_admissao`, que é genérica e é lida
por todo mundo.

### Migration, com uma armadilha do Postgres

O precedente é a `0059`, que acrescentou `INTEGRACAO`. **`ALTER TYPE ... ADD VALUE` não permite USAR
o valor novo na mesma transação.** Então a migration acrescenta `IFRACTAL` ao enum e cria a tabela,
e o **seed das 4 linhas de `frente_status_catalogo` roda depois**, separado. Foi o que a `0059` fez.

---

## 5. Perguntas abertas, que preciso do diretor antes de construir

1. **O iFractal nasce para TODOS os clientes?** A Integração só nasce para cliente que **exige**
   (flag por cliente). Presumo que o iFractal nasce sempre, já que todo cliente tem tipo de marcação.
2. **Os status, exatos e em title case (§A.24).** O pedido cita "Não Cadastrada", "Não Cadastrado",
   "Cadastrado", "Pendente De Envio" e "Finalizado". Entendo **quatro**, nesta ordem:
   `Não Cadastrado` (inicial) → `Cadastrado` → `Pendente De Envio` → `Finalizado`.
3. **Qual status CONCLUI a frente?** `STATUS_CONCLUI` é mapa TOTAL, exige um. Presumo `Finalizado`.
4. **A admissão conta como concluída com o iFractal pendente?** (item 3 acima) Recomendo SIM,
   mantendo a expressão intocada.
5. **Tipo de marcação é obrigatório no cliente?** Presumo nullable, nascendo nula: cliente sem regra
   cadastrada não deve fingir que tem (o mesmo padrão dos campos de benefício do cliente).

---

## 6. §A.6, com a decisão do diretor registrada

A senha do iFractal é **descartável** (o iFractal envia ao funcionário e força a troca no primeiro
acesso), então fica em **texto normal e visível**, por decisão consciente do diretor. O que a fábrica
garante mesmo assim:

- **Nunca em log.** Nem em log de aplicação, nem em mensagem de erro, nem em trilha de alteração.
- **A coluna da extração nasce DESMARCADA**, como as outras 111: só sai do sistema se alguém marcar.
- **A rota é autenticada e com guard de menu**, como toda rota sensível.
- Menu novo nasce **só para o SUPER_ADMIN** (§A.23): a fábrica registra no catálogo e para aí.
