# O que olhar na Central de Candidatos, em PRODUCAO

A validacao e em producao por decisao do diretor: o 429 so aparece com o volume de producao
(76 mil candidatos) e a homologacao esta vazia, entao nao havia como reproduzir la.

## Onde

`http://10.18.117.235:3010`, menu **Central de Candidatos** (A&S).

## O que tem de acontecer

1. **A tela CARREGA.** Antes, a partir da 121a chamada vinha `429 Too Many Requests` e a lista nao
   montava. Agora sao **2 chamadas de dado** por carregamento, nao 483.
2. **A coluna de funil vem preenchida** para quem tem vaga. Antes, quando o lote estourava, TODA
   pessoa aparecia como "Vaga Nao Alocada", com vaga ou sem.
3. **Mexer nos filtros nao derruba a tela.** Antes, cada filtro refazia as 483 chamadas.
4. **"Vaga Nao Alocada" agora e uma afirmacao, nao um chute.** Ha um terceiro estado novo,
   **"Funil Nao Carregado"**, para quando o funil nao veio: a tela passa a dizer que nao sabe, em
   vez de afirmar que a pessoa nao tem vaga.
5. **O KPI "Sem Vaga" tem de bater com as linhas** marcadas "Vaga Nao Alocada".

## Uma medicao que muda o que voce vai ver

Em 02/10, as 17h, **nenhuma** das 76.658 pessoas da base esta sem candidatura. Antes eram 1 em
59.961 (a Gizele Alves, que a varredura do Pandape ja atendeu). Entao **o esperado hoje e o KPI
"Sem Vaga" em zero ou perto de zero**, e NAO uma lista cheia de "Vaga Nao Alocada". Se voce vir
muita gente "Vaga Nao Alocada", isso e sinal de que o funil nao chegou, nao de que a base esta
sem vaga.

## Se o 429 CONTINUAR

Diga, e o proximo passo e o que voce pediu: **carregar uma vez e deixar disponivel**, ou seja
guardar o resultado no cliente e parar de refazer a consulta a cada toque de filtro, filtrando o
que ja esta em memoria. Isso e frente propria, com decisao sua, porque muda o comportamento de
filtro da tela.

## Os dois casos que voce mandou investigar

- **Debora Lucia de Oliveira: nao existe na base.** Ha 8 pessoas com nome parecido ("Debora ...
  Oliveira"), e todas tem vaga.
- **Gizele Alves: existe, e o "Vaga Nao Alocada" dela era legitimo.** Ela era a unica pessoa em
  59.961 sem nenhuma candidatura. **Agora ela tem 1**, trazida pela varredura do Pandape.
