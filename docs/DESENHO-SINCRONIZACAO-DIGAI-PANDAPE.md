# Sincronização Digai E Pandapé: O Que Cabe No Teto

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Tipo:** desenho (§A.27), nada construído
**Ponto 5 da OST da plataforma unificadora.** Os demais pontos vivem em
`docs/DESENHO-PLATAFORMA-UNIFICADORA.md`.
§A.11 (sem travessão), §A.24 (title case em título e etiqueta).

---

## 1. A resposta curta

O diretor pediu polling de 5 a 10 minutos nas duas fontes. **Dá numa e não dá na outra**, e a razão
não é otimização: é que as duas APIs são diferentes em espécie.

| Fonte | Polling de 5 min | Por quê |
|---|---|---|
| **DIGAI** | **CABE, com folga** | A varredura COMPLETA custa 451 chamadas, e o teto de 5 minutos comporta 2.500. Usa 18% |
| **PANDAPÉ** | **NÃO CABE hoje, e não há nem entrada** | A varredura custa cerca de 1.800 chamadas por ciclo, quase o DOBRO do teto de 5 minutos, e o teto é COMPARTILHADO COM A FOLHA DE PAGAMENTO. Pior: o Pandapé **não alimenta o A&S por caminho nenhum** hoje, nem por webhook (ver peça 2) |

O Pandapé só cabe depois de uma peça que **não existe**: a ponte entre a vaga do EA e a vaga do
Pandapé. Com ela, o custo cai de 1.800 para cerca de 400 por ciclo. Sem ela, não há intervalo curto
possível, e insistir atrasa a folha.

---

## 2. DIGAI: a conta

**Medido na varredura de 16/09/2026**, registrada no `DIARIO.md`: 86 de 86 workspaces, 301 screenings
(196 com resultado), 13.248 registros únicos, **451 chamadas, zero falhas**, paginação por `page`
confirmada em 44 screenings.

| Item | Valor |
|---|---:|
| Teto declarado pelo diretor | 500 req/min |
| Orçamento de um ciclo de 5 min | **2.500 chamadas** |
| Custo da varredura COMPLETA, medido | **451 chamadas** |
| Ocupação do orçamento | **18%** |
| Margem para crescimento | A base pode **quintuplicar** antes de o ciclo de 5 min apertar |

**Conclusão: 5 minutos é confortável no Digai, até com varredura completa e sem nenhuma otimização.**

### 2.1 As três ressalvas honestas

1. **O teto de 500 req/min é ASSERÇÃO DO DIRETOR, não medição nossa.** A varredura de 16/09 fez 451
   chamadas com zero falhas, o que é COMPATÍVEL com esse teto, mas não o mede: nunca chegamos perto
   de estourar. **Confirmar com o Ivan.** Se o teto real for menor, a conta muda.
2. **Não sabemos se o Digai tem filtro de "mudou desde".** Se tiver, o ciclo fica muito mais barato
   que 451. Se não tiver, 451 é o custo permanente e o delta é no cliente, como no Pandapé.
   **Exige reconexão para testar**, e o token foi expurgado.
3. **451 chamadas não podem sair de uma vez.** Elas cabem no minuto, mas o padrão da casa é limitador
   com folga. Proposta: **300 por minuto**, 60% do teto declarado, que espalha o ciclo em cerca de 90
   segundos e deixa margem para qualquer outro consumo.

---

## 3. PANDAPÉ: a conta, e por que ela é outra história

**Medido ao vivo em 01/07/2026** e registrado em `docs/INVESTIGACAO-API-PANDAPE-CANDIDATOS.md`.

### 3.1 O teto é compartilhado com a folha de pagamento

**1.000 requisições a cada 5 minutos, e o teto é da CONTA, não do EA.** O mesmo teto serve o webhook
do G.Infor que alimenta a folha. **Estourar o teto do lado do EA atrasa a folha**, e isso está na
§A.5 do CLAUDE.md como requisito de segurança, não como recomendação.

O EA já opera hoje com limitador de **800 por 5 minutos** (`pandape.queue.ts:107`), concorrência 1,
que é a nossa fatia com folga deliberada. **Tudo o que a sincronização do A&S consumir sai dessa
mesma fatia**, competindo com a Admissão.

### 3.2 O fan-out, com números medidos

Não existe "me dê os candidatos novos". Existe "me dê os candidatos DESTA vaga". Descobrir candidato
novo é varrer vaga por vaga.

| Universo | Quantidade |
|---|---:|
| Vagas no histórico da conta Pandapé | 6.822 |
| Vagas ativas no Pandapé (`VacancyStatus=2`) | **907** |
| Vagas abertas na Central de Vagas do EA | 198 |

| Cenário | Custo por ciclo | Cabe em 5 min? |
|---|---:|---|
| Varrer as 907 ativas do Pandapé | **cerca de 1.800 chamadas** | **NÃO.** Quase o dobro do teto TOTAL, sozinho, sem a Admissão |
| Varrer só as 198 abertas do EA | **cerca de 400 chamadas** | Cabe, e consome **metade da nossa fatia de 800**, para sempre |

### 3.3 A peça que falta, e é ela que decide

**A ponte vaga do EA ↔ vaga do Pandapé NÃO EXISTE.** Medido por mim hoje na produção:

```
vagas: 3 linhas   com id_vacancy_pandape preenchido: 0
```

E os códigos não casam por acidente: os da base do EA são da família `522020`, `700123`, `SL0042`,
e os do Pandapé observados ao vivo são `847`, `850`, `61814`. Numerações de ordens de grandeza
diferentes.

**Sem a ponte, a varredura não pode ser escopada pelas vagas do EA e cai nas 907, que é o cenário que
não cabe.** É por isso que o Pandapé não tem intervalo curto hoje, e nenhuma otimização de código
resolve: falta um dado.

### 3.4 Não existe "mudanças desde" no Pandapé

Testadas ao vivo **catorze variantes** de filtro temporal, em `matches` e em `requests`. **Todas
responderam 200 e ignoraram o filtro**, com a contagem idêntica ao baseline.

Consequência: o delta é **sempre no cliente**. O EA baixa a página e compara com o que guardou do
ciclo anterior. Funciona, e significa **baixar para descartar**, que é custo de chamada gasto sem
resultado. É mais um motivo para o ciclo do Pandapé não ser curto.

---

## 4. AS OPÇÕES, para o diretor decidir

### Peça 1: a cadência do DIGAI

| | Opção | O que dá | Custo |
|---|---|---|---|
| **1a** | **5 minutos, varredura completa** | Quase tempo real, sem depender de nada | 451 chamadas por ciclo, 18% do orçamento. **Recomendada** |
| 1b | 10 minutos, varredura completa | Metade do consumo | Metade da atualidade, sem ganho de risco relevante |
| 1c | 5 minutos com delta, se o Digai tiver filtro temporal | Muito mais barato | **Exige reconexão para descobrir se existe.** Pode não existir |

**Recomendo 1a**, e testar o delta (1c) na reconexão: se existir, ele entra depois sem mudar o
desenho, só barateando o ciclo.

### Peça 2: a entrada do PANDAPÉ

**CORREÇÃO IMPORTANTE, medida depois da primeira versão deste documento.** A OST afirma que "já há
maturidade com o Pandapé". **É verdade para a ADMISSÃO e é falso para o A&S.** O módulo Pandapé tem
ZERO referências às tabelas da Central de Vagas e de Candidatos, provado por varredura: nenhum código
escreve `as_candidatos.id_candidate_pandape` nem `as_candidaturas.id_match_pandape`, que são gavetas
vazias com DTO de passagem que ninguém chama. Nenhuma tela do A&S sequer menciona o Pandapé.

**O webhook NÃO serve de entrada para o A&S**, e não é limitação de código: o evento que o Pandapé
emite é "Candidato enviado para admissão", que é o FIM do funil. O A&S vive ANTES disso, e para o
funil não chega evento nenhum.

**Portanto o Pandapé, hoje, não alimenta a Central de Vagas por caminho nenhum.** Não é questão de
cadência: é entrada inexistente.

| | Opção | O que dá | Custo |
|---|---|---|---|
| **2a** | **Varredura diária completa das 907 ativas**, fora do horário de pico da folha | Destrava a frente sem depender da ponte. Cerca de 1.800 chamadas uma vez por dia, espalhadas | Perde tempo real. **Recomendada para COMEÇAR** |
| **2b** | **Ponte vaga↔vacancy e varredura escopada nas 198 abertas do EA, a cada 5 min** | Paridade de cadência com o Digai | 400 chamadas por ciclo, metade da nossa fatia de 800, competindo com a Admissão. Depende da ponte (peça 3). **Recomendada como DESTINO** |
| 2c | Pedir ao Pandapé um webhook de MOVIMENTAÇÃO DE FUNIL | Tempo real de verdade, sem consumir teto | Webhook se configura no painel do Pandapé, não por API (`GET /v3/webhooks` responde 404). **Depende de pergunta ao suporte**, e pode não existir |
| 2d | Varrer as 907 a cada 5 minutos | Nada que as outras não deem | **Inviável.** Quase o dobro do teto compartilhado. Atrasa a folha. Registrada só para ficar recusada por escrito |

**Recomendo 2a agora e 2b em seguida**, exatamente como a investigação de 24/08 já havia recomendado:
começar pela varredura diária destrava sem depender de nada, e a partir do dia em que a vaga nascer
com o id da fonte, o ciclo vai ficando mais barato sozinho, vaga por vaga, até caber nos 5 minutos.

**E vale perguntar a 2c ao suporte do Pandapé na mesma conversa em que se pergunta o webhook do Digai
ao Ivan.** Se os dois existirem, as duas fontes ficam simétricas e o polling vira rede de segurança
nos dois lados, que é o desenho mais barato e mais atual de todos.

### Peça 3: a ponte vaga do EA ↔ vaga da fonte

Ela é necessária para o Pandapé (opção 2b) e **também para o Digai**, onde a hipótese de casamento é
o `partnerJobId` e está NÃO PROVADA.

| | Opção | O que é | Custo |
|---|---|---|---|
| **3a** | **A vaga nasce com o id da fonte**, preenchido na abertura | Uma coluna por fonte e um campo na trilha | Só vale para vaga NOVA. Não resolve as importadas. **Recomendada como base** |
| 3b | Casar por cargo mais cliente mais data, heurística | Barato | **INVENTA DADO.** É o erro que a §A.9 proíbe. Não recomendo |
| 3c | De/para manual, o diretor liga vaga a vaga numa tela | Exato, sem inventar nada | Trabalho humano proporcional ao volume |

**Recomendo 3a mais 3c:** vaga nova nasce ligada sozinha, e a tela de de/para resolve o passado e a
vaga manual (ponto 7 da OST) pelo mesmo mecanismo.

---

## 5. O QUE PRECISA DE RECONEXÃO AO DIGAI

O token foi expurgado em 16/09. Cada pergunta abaixo vale uma reconexão, e só o diretor destrava.

1. **O Digai tem filtro de "mudou desde"?** Decide a peça 1c e o custo permanente do ciclo.
2. **Qual é o teto real de requisição?** Confirma ou derruba a conta da seção 2.
3. **O mesmo `userId` aparece em várias vagas?** A varredura mediu 12.445 pessoas em 13.248 registros,
   ou seja, **803 registros são repetição de pessoa**. Isso é forte indício de que sim, e a prova
   direta é barata: contar `userId` distintos que aparecem em mais de um screening. É contagem, sem
   PII, e é o ponto 1 da OST.
4. **Existe evento de webhook para "candidato finalizou"?** Se existir, o polling do Digai vira rede
   de segurança também, e a arquitetura das duas fontes fica simétrica. **Pergunta ao Ivan**, já
   pendente desde 16/09.

---

## 6. O QUE NÃO MUDA, decidido antes e mantido

- A grade GET-only, fail-closed, com allowlist de método e de rota, alfabeto fechado de id e PII
  nunca em path nem em query (`docs/PROTOCOLO-LGPD-FABRICA.md`).
- A fila BullMQ com limitador sob o teto e backoff, que **já existe** para o Pandapé e é o padrão a
  copiar para o Digai.
- A inércia sem credencial: sem token, a integração nasce desligada, não toca a rede e não quebra
  nada.
- Quando a vaga não resolve, a criação é **ADIADA e reprocessável**, nunca inventa vínculo. Precedente
  da casa, §A.5.
