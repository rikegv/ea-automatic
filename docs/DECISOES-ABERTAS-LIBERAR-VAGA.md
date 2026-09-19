# Decisões abertas: a frente "Liberar Vaga", a simulação e o sal

Levantado na frente de 18/09/2026. §A.11: sem travessão. Nada aqui foi construído (§A.31: propõe).

---

## 1. VETO ATIVO do `seguranca`: o CPF do substituído sai no retorno de LISTA

`vagas.service.ts:466-467`: `list()` devolve `substituidoCpf` e `substituidoNome` **de toda vaga, para
todo usuário que abre a Central de Vagas**, mesmo que nenhuma coluna da tela mostre o campo. Fica em
payload, em cache de navegador e em qualquer log de proxy que registre corpo.

O próprio módulo escreveu a régua contrária para o CPF do candidato (`tables.ts:3178-3182`): "fora do
retorno de LISTA, sai só na ficha". O CPF do candidato obedece; o do substituído faz o oposto, na
mesma tela. E o comentário da coluna (`tables.ts:2597`) promete "nunca exportado".

**É PRÉ-EXISTENTE.** A frente não criou a exposição nem a alargou: ela alarga a **população** de
vagas que têm o campo preenchido, porque a fila do Pandapé passa a preenchê-lo.

**O conserto não é de uma linha:** a trilha lê `v.substituidoCpf` do `VagaListItem`
(`TrilhaDaVaga.tsx:570`), que vem da lista. Tirar da lista sem criar uma **porta de ficha da vaga**
(`GET /as/vagas/:id`) quebra o "continuar rascunho" e o "clonar".

**A decisão é sua:** trava este deploy, ou vira OST própria?

---

## 2. A varredura reescreve quatro campos a cada 30 minutos, e pode APAGAR obrigatório

`ingestao-repositorio.ts:571-582` reescreve `codigo`, `nome_divulgacao`, `cidade_id` e
`posicoes_oficiais` de toda vaga ativa no ATS, **sem nenhuma condição de status**. Três são
obrigatórios. O time corrige pela tela nova, e trinta minutos depois o ATS sobrescreve, inclusive
numa vaga já publicada.

**Pior que sobrescrever: pode gravar NULL.** `codigo` vira NULL com texto vazio, `posicoes_oficiais`
vira NULL com zero ou ausente. Meta nula deixa `travaPosicoesOficiais` devolver `null`, e **o
fechamento da vaga fica sem gate nenhum**, sem rastro em `vaga_meta_reducoes` e sem passar por
`excessoDePosicoes`, que são as duas travas que a auditoria de 09/09 pôs nas outras portas.

Hoje isso é inofensivo porque a varredura está inerte. Ligando a ponte, deixa de ser.

**Conserto recomendado, meia hora com teste:** uma cláusula no `where` do update, do tipo
`and (reabrir or v.status = <código do papel REVISAO>)`, mantendo intacto o ramo da reabertura. O ATS
é dono da vaga até um humano assumir.

---

## 3. O CPF do substituído é cobrado com rigor no salvamento PARCIAL

Na edição da vaga em revisão, `camposDaTrilha` só afrouxa o CPF quando o papel é RASCUNHO, então em
REVISAO o dígito é exigido e o 400 **derruba a gravação inteira**. Isso briga com a razão de a edição
existir ("salvar sem liberar e voltar depois").

O contorno previsível é a pessoa **inventar um CPF com dígito válido** para destravar o Salvar, e um
CPF válido inventado é o CPF de um terceiro real, indo para a coluna que **não tem TTL** (a da vaga,
que persiste por decisão sua de 22/08, diferente da coluna da admissão, que expira em 48h).

**Recomendação:** tratar como parcial na edição, e cobrar o dígito só na LIBERAÇÃO, que já cobra e é
o gate certo.

---

## 4. Salário, benefícios e escala continuam OPCIONAIS

A régua da abertura são **onze** campos, e nenhum dos três está nela. O formulário os pergunta, e a
liberação agora exige os onze. Torná-los obrigatórios **alcança a abertura inteira** (asterisco,
pendências, recusa do publicar) e toda vaga em rascunho que hoje passa sem eles. Decisão sua.

---

## 5. A ingestão move a etapa da pessoa SEM escrever histórico

`ingestao-repositorio.ts:369-377` atualiza `as_candidaturas.etapa` no lugar, e nada é escrito em
`as_candidatura_etapas` (os únicos escritores são as ações humanas). Efeitos:
- **na validação:** a ficha das pessoas simuladas abre com a linha do tempo VAZIA, e isso não é
  defeito da simulação;
- **em produção:** quando a varredura mover alguém de pasta no Pandapé, a etapa muda no EA **sem
  registro de quem moveu, quando e de onde para onde**.

É regra de negócio, não segurança: a movimentação automática deve entrar no histórico?

---

## 6. Outros três, menores

- **Vaga liberada entra sem consultor e sem recruiter** (`abertoPorId` é nulo na vaga espelhada),
  invisível no filtro "Consultor". Carimbar o autor na liberação muda semântica de campo auditado.
- **Vaga espelhada sem `codigo` no ATS não tem como ser liberada**: o campo é obrigatório e a origem
  é o ATS. Anda junto com a decisão 2.
- **A homologação não tem sal próprio** (`AS_MARCA_SAL`), então a varredura de lá fica inerte (correto)
  e quem roda o arnês do checkout principal herda o sal de produção no processo. Uma linha resolve.
