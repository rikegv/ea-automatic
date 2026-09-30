# MEDIÇÃO: a linha do tempo do candidato e o FILTRO DE ENTRADA do Pandapé

Medido em 30/09/2026 contra a API de produção do Pandapé, 50 chamadas, dentro do teto compartilhado.
**Nada foi ligado, nada foi construído.**

## 1. A LINHA DO TEMPO: o ATS não tem. A plataforma já tem

**O ATS entrega DUAS coisas: quando a pessoa se candidatou, e onde ela está AGORA.** Nada entre as
duas.

- `GET /v1/Match/Get` devolve **28 campos**, com **uma única data**: `insertDate`, a da candidatura.
  Os únicos arrays são formação acadêmica e um `requests` vazio. **Não existe `stages`, `folders`,
  `history`, `log`, `timeline` nem `events`.**
- `GET /v2/matches` devolve 58 campos e, de data, só `insertDate` e `modifyDate`.
- `idVacancyFolder` é a pasta **atual**: um retrato sem carimbo de quando entrou nela.
- `hasBeenSentToERP` é booleano, **sem data**.

**A linha do tempo do lado do ATS é IRRECUPERÁVEL.** Quando avançou em cada etapa e quando foi movido
para admissão o Pandapé não conta em nenhuma das duas versões da API.

### O QUE A PLATAFORMA JÁ GUARDA, e é mais do que o diretor pediu

`as_candidatura_etapas` já é a linha do tempo completa, e com mais do que datas:
`etapa_de` → `etapa_para`, `situacao`, `motivo`, **`por_id` (o autor)**, `ocorrido_em` (quando),
`vaga_de` → `vaga_para`, e o `aceite` quando houve passagem com pendência.

Duas consequências:
1. **Do momento em que o time trabalha na plataforma, a linha do tempo nasce completa, por
   construção.** Não há o que construir: cada movimento humano já grava uma linha com autor e hora.
2. **A ingestão NÃO escreve nessa trilha**, e isso é deliberado: a tabela está fora da lista
   fail-closed de seis tabelas do adaptador. Ou seja, movimento feito LÁ não entra na trilha daqui.
   Combinado com a régua de precedência (o EA vence, a diferença vai para a fila de revisão), o
   desenho fica coerente: **a plataforma é a autoridade da linha do tempo**, e o que o ATS diz de
   diferente aparece como divergência para uma pessoa decidir, nunca como reescrita silenciosa.

## 2. `modifyDate` NÃO É DATA DE MOVIMENTAÇÃO, e é pior do que inútil

Medido em **2.976 inscrições** de 12 vagas ativas:

| comparação | quantidade | % |
|---|---|---|
| `modifyDate` **MAIS ANTIGO** que a candidatura | 1.931 | **64,9%** |
| mais recente | 876 | 29,4% |
| igual | 7 | 0,2% |
| sentinela `0001-01-01` (vazio do .NET) | 162 | 5,4% |

Em **dois terços** dos casos ele é anterior à própria candidatura, e por anos: aparecem 2015, 2017,
2019, 2020, 2021, 2022, 2023 e 2024, enquanto todas as candidaturas da amostra são de 2025-12 a
2026-09.

**O teste decisivo, na pasta de admissão:** das 6 inscrições que estão em `Contratados`, duas têm o
sentinela e as **outras quatro têm `modifyDate` ANTERIOR à candidatura** (-4,8, -85,1, -87,7 e -956,2
dias). **Nenhuma** tem data posterior. Mover de pasta **não escreve** naquele campo.

**Por que usá-lo seria pior que o `insertDate`:** ele erraria nas duas pontas ao mesmo tempo, perdendo
quem foi movido hoje e trazendo quem editou o currículo hoje, **parecendo certo**. (Hipótese não
provada: o campo é do PERFIL do candidato, não da inscrição; o `Match/Get`, que é a entidade da
inscrição, não traz `modifyDate` nenhum.)

## 3. NÃO DÁ PARA FILTRAR NA ORIGEM. Doze parâmetros, doze ignorados

Baseline de uma vaga: `totalItems = 1178`. Os doze abaixo voltaram **HTTP 200 com o mesmo 1178**:
`ModifyDateFrom`, `ModifyDateSince`, `InsertDateFrom`, `InsertDateSince`, `InsertDateStart`,
`DateFrom`, `UpdatedSince`, `ModifiedSince`, a combinação com `InsertDateTo`, `IdVacancyFolder` nas
duas grafias, e `IsRead`. É o mesmo padrão do Digai: 200, silêncio, número igual.

**Até o filtro por PASTA é ignorado**, o que é mais grave que o de data: para achar quem está em
`Contratados` é obrigatório **baixar a vaga inteira e filtrar em memória**, que é o que a varredura já
faz. E `/v2/matches` **exige** `IdVacancy` (sem ele, HTTP 400): não existe listagem global.

## 4. O VOLUME POR JANELA (extrapolação declarada, não contagem)

Amostra de **12 das 471 vagas ativas**, por amostragem sistemática sobre a ordem de publicação (uma a
cada 39, para não enviesar para vaga nova), com **todas as páginas** baixadas: 2.976 inscrições
contadas. Fator 39,25.

| janela | pessoas ingeridas | vagas na FILA MANUAL | casos de admissão cobertos |
|---|---|---|---|
| **7 dias** | ~3.200 | ~275 | **0 de 6** |
| **30 dias** | ~20.700 | ~432 | 3 de 6 |
| **90 dias** | ~50.700 | ~432 | **6 de 6** |
| **6 meses** | ~67.100 | **471, todas** | 6 de 6 |

**A fila manual é por VAGA, não por pessoa**, porque toda vaga nasce em `PENDENTE_REVISAO` (o de/para
de cliente não existe e é impossível pela API) e o trabalho é **uma decisão humana por vaga**.

**MARGEM:** a amostra tem uma vaga com 1.178 inscrições e três com menos de 26. Pela mediana
(161/vaga) o total sairia ~76.000 em vez de ~117.000. **Leia como ordem de grandeza.** O número exato
custa 600 a 700 chamadas, o que exige a fila com limitador, não medição avulsa.

*Nota: o "137.654 inscrições em 621 vagas ativas" que circula nos registros é de sessão anterior e
está defasado: hoje são **471 vagas ativas** e a estimativa é de 76 a 117 mil.*

## 5. O QUE A MEDIÇÃO MUDA NA DECISÃO

**O dilema do filtro NÃO se dissolve**, porque `modifyDate` está desqualificado. O corte continua
sendo por data de candidatura, aplicado do nosso lado, depois de baixar a vaga.

**Mas a pergunta muda de eixo, e este é o achado que importa:** a janela **quase não mexe no trabalho
manual** (275 contra 432 vagas) e **mexe muito no volume de dado pessoal** (3,2 mil contra 50,7 mil
pessoas). Ou seja, **a janela é decisão de LGPD e de volume, não de carga de trabalho.** Quem governa
a carga manual é o de/para de cliente, que não existe e não pode existir pela API.

**E o corte decide só QUEM ENTRA na base, não quem é acompanhado depois.** A varredura relê tudo acima
do corte a cada volta, então quem já foi ingerido e for movido para admissão amanhã **é capturado**.
Quem se candidatou ANTES do corte nunca entra, e por isso nunca é visto. Logo a pergunta real é: **até
quantos dias atrás vale adotar o passivo para cobrir quem ainda vai ser movido para admissão?**

Empiricamente, e com base pequena (6 casos): **os 6 que estão na pasta de admissão se candidataram há
até 90 dias.** A cobertura satura em 90 dias, e os 6 meses não acrescentam caso nenhum, só 16 mil
pessoas. Em 30 dias cobre-se a metade.

**Recomendação:** **90 dias**, com a ressalva honesta de que 6 casos são base pequena para fechar o
número. Se o peso de §A.6 pesar mais que a cobertura, **30 dias** é o corte defensável, cobrindo
metade dos casos observados com 40% do dado pessoal.
