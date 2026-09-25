# Impacto de sugerir o nº de vagas fechadas pela contagem de aprovados

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-24 · **Tipo:** investigação de impacto (§A.27)
**Autorização:** o diretor autorizou tocar a tela Fechar Vaga, validada em 23/08 (§A.26).
**Escopo autorizado:** SÓ a sugestão do número. Nada mais do Fechar Vaga.
**Estado:** nada construído, nada commitado. §A.11 (sem travessão).

---

## 1. O achado que muda a conversa

**O campo não está vazio hoje. Ele já vem pré-preenchido, com o número de POSIÇÕES da vaga.**

```
apps/frontend/src/app/(app)/as/vagas/page.tsx:682
    vagasFechadas: String(v.posicoes),
```

Então a melhoria autorizada **não é "acrescentar uma sugestão onde não havia"**. É **trocar a fonte
de uma sugestão que já existe**: sai a META da vaga, entra a CONTAGEM REAL de aprovados.

Isso importa porque muda o tamanho do risco. Acrescentar sugestão a um campo vazio não altera
comportamento nenhum. Trocar a fonte de um valor que já vem preenchido altera o que acontece quando
o operador simplesmente aceita o que a tela ofereceu, que é o caso da maioria dos cliques.

---

## 2. O impacto real: esse número decide o STATUS da vaga

```
apps/backend/src/as/vagas/vagas.service.ts:481
    status: (dto.vagasFechadas ?? 0) > 0 ? "ENTREGUE" : "FECHADA",
```

O nº de vagas fechadas não é só um dado guardado: **é ele que decide se a vaga fecha como ENTREGUE
ou como FECHADA.**

| | Sugestão | Aceitar o padrão resulta em |
|---|---|---|
| **Hoje** | `posicoes`, que é sempre 1 ou mais (obrigatório e maior que zero na abertura) | **Sempre ENTREGUE** |
| **Depois** | contagem de aprovados, que **pode ser 0** | **FECHADA** quando ninguém foi aprovado |

**Esta é a única mudança de comportamento de toda a alteração, e ela é significativa**, porque
ENTREGUE e FECHADA foram deliberadamente mantidas separadas pelo diretor. Está escrito no schema:

> ENTREGUE e FECHADA NÃO SÃO COLAPSADAS em um "ENCERRADA" (decisão do diretor): entregue é
> preenchida, fechada é encerrada, e juntar as duas apagaria justamente o indicador de sucesso da vaga.

Ou seja, o número mexe no **indicador de sucesso da vaga**.

**A leitura honesta:** a mudança provavelmente **corrige** o comportamento. Hoje uma vaga que fechou
sem contratar ninguém sai como ENTREGUE se o operador não apagou o número sugerido, e isso é um falso
positivo no indicador. Mas correção de indicador é decisão do diretor, não efeito colateral de uma
melhoria de digitação. Por isso está aqui, e não implementado.

---

## 3. As 2.363 vagas importadas fecham diferente

A base importada entra sem nenhuma candidatura no EA: a vaga existe, o funil dela nunca existiu.
Contagem de aprovados nessas vagas é **zero**, sempre.

Consequência: **toda vaga importada passaria a sugerir 0 e a fechar como FECHADA**, mesmo tendo sido
preenchida na vida real antes de o sistema existir. Hoje elas sugerem as posições e fecham ENTREGUE.

**Recomendação:** a sugestão vem da contagem **quando a vaga tem funil**; quando a vaga não tem
nenhuma candidatura, o campo mantém exatamente o comportamento de hoje. E, nos dois casos, uma linha
curta embaixo do campo diz de onde o número veio:

| Situação | Sugestão | Texto de apoio |
|---|---|---|
| Vaga com candidatos aprovados | a contagem | "3 candidatos aprovados no funil desta vaga" |
| Vaga com funil, nenhum aprovado | 0 | "Nenhum candidato aprovado no funil desta vaga" |
| Vaga sem nenhuma candidatura | `posicoes`, como hoje | "Esta vaga não tem funil no sistema, confira o número" |

Assim a melhoria ajuda onde há dado e não estraga onde não há. **Se o diretor preferir uma regra só,
sempre a contagem, é uma linha a menos e eu implemento assim.** É escolha dele, é a tela dele.

---

## 4. As duas travas passam a concordar sozinhas

Hoje existem duas travas independentes com a mesma régua, uma na tela e outra no serviço:

```
vagasFechadas > posicoes  →  recusa
```

Com a trava da aprovação decidida pelo diretor (não aprova além das posições), a contagem de
aprovados **nunca pode passar das posições**. Logo o valor sugerido nunca dispara a trava do
fechamento.

**Isso NÃO é motivo para remover a trava.** Ela continua sendo a autoridade sobre o número **editado
à mão**, que é justamente o caminho que a melhoria mantém aberto. O que muda é que ela deixa de
existir só no papel e passa a estar coerente com a trava do funil por construção. Nada a mexer.

---

## 5. Superfície tocada, arquivo a arquivo

| Arquivo | O que muda | Risco |
|---|---|---|
| `as/vagas/page.tsx` (`abrirFechamento`) | A origem do valor pré-preenchido, e o texto de apoio | Baixo, é a linha 682 |
| `as/vagas/vagas.service.ts` (`list`) | Passa a devolver a contagem de aprovados por vaga | **Médio.** Toca a consulta da listagem, que é código validado |
| `shared-types` (`VagaListItem`) | Um campo novo, `aprovados` | Baixo, aditivo |
| `as/vagas/vagas.service.ts` (`fechar`) | **NADA.** Não encosta | Zero |
| `domain/vaga.ts` (`vagasFechadasExcedemPosicoes`) | **NADA.** Segue a autoridade, com os 5 testes intactos | Zero |
| Modal de visualização (o olho) | **NADA** | Zero |

**O ponto de atenção é a consulta da listagem**, não o fechamento. A contagem precisa chegar à tela,
e a listagem é o lugar natural (ela já resolve cargo, cliente, autor e os dois lados num join só).
A alternativa, uma chamada extra ao abrir o modal, evita tocar a listagem mas acrescenta uma ida ao
servidor num clique que hoje é instantâneo.

**Recomendo pela listagem**, porque a coluna de ocupação da vaga ("3/10") já está prevista no desenho
da Central de Candidatos e vai precisar do mesmo número. Uma consulta serve às duas.

---

## 6. Sequenciamento: isto não pode vir antes

A contagem de aprovados vem de `as_candidaturas`, **que ainda não existe**. Portanto:

> **A melhoria do Fechar Vaga não é uma alteração isolada e não pode ser construída agora.
> Ela é o último passo da Central de Candidatos, não o primeiro.**

Fica registrada e autorizada, para entrar no fim da frente, quando houver funil de onde contar.

---

## 7. Uma lacuna encontrada no caminho

**Não existe nenhum teste do método `fechar`.** O que está coberto são os 5 testes da função pura
`vagasFechadasExcedemPosicoes`. A derivação ENTREGUE versus FECHADA, que é exatamente o que esta
mudança alcança, **não tem teste nenhum**.

Como a alteração muda o valor que alimenta essa derivação, ela deve entrar **com o teste junto**,
travando as duas pontas: número maior que zero fecha ENTREGUE, zero fecha FECHADA. Sem isso a
regressão só apareceria num relatório de indicador, semanas depois, sem ninguém ligar uma coisa à
outra.

---

## 8. Resumo para o diretor

| # | Achado | O que preciso de você |
|---|---|---|
| 1 | O campo já vinha pré-preenchido com as posições. A melhoria troca a fonte, não cria a sugestão | Nada, é informação |
| 2 | **O número decide ENTREGUE ou FECHADA.** A mudança altera o indicador de sucesso da vaga | **Confirmar que pode.** Acho que corrige, mas o indicador é seu |
| 3 | Vaga importada não tem funil e passaria a fechar como FECHADA | **Escolher:** regra dupla (recomendo) ou sempre a contagem |
| 4 | As duas travas passam a concordar. Nada a remover | Nada |
| 5 | Depende de `as_candidaturas`. É o último passo da frente, não um ajuste avulso | Nada, é sequenciamento |
| 6 | O `fechar` não tem teste. Entra com teste junto | Nada, é obrigação nossa |

---

*Investigação de impacto para validação. Nenhuma linha alterada.*
