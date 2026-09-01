# Clicksign: o fallback que arquivava o contrato SEM assinatura

**Data:** 01/09/2026. **Ambiente:** produção. **Estado:** corrigido, 9 admissões recuperadas, tick religado.

## O defeito

`clicksign-api.service.ts`, `obterUrlAssinado`:

```ts
return files?.signed ?? files?.original ?? undefined;
```

O comentário ao lado dizia que "após o close, o `original` é o PDF finalizado". **É falso**, provado byte
a byte: o `original` é o kit CRU, sem o log de assinatura da Clicksign. O `signed` é um asset separado,
que a Clicksign leva alguns segundos para render izar depois do envelope fechar.

O estrago não era o download errado, era a **cascata irreversível** que vinha depois. Com o `original` em
mãos, o pipeline seguia como se tudo tivesse dado certo: arquivava no Drive com o nome "Contrato Assinado_<candidato>", marcava `clicksign_status = ASSINADO`, **apagava a cópia local do kit** e tirava a
admissão da fila. Uma ausência de poucos segundos virava dano permanente e silencioso. Ninguém era
avisado, porque do ponto de vista do sistema nada tinha falhado.

## A correção

`obterUrlAssinado` devolve **só o `signed`**, sem fallback. Sem ele, devolve `undefined`, e o
`arquivarAssinado` já sabia o que fazer com isso: não arquiva, não marca ASSINADO, não apaga o kit local,
não tira da fila, e o registro fica em `AGUARDANDO_ASSINATURA` para o ciclo seguinte tentar de novo. A
ausência momentânea passa a virar **nova tentativa**, não dano.

O ponto tocado foi **só o do arquivamento**. Os cinco passos do envelope, o balde de rate limit, as
notificações e o ritmo do tick não foram alterados.

Arquivos: `clicksign-api.service.ts` (a função e o cabeçalho, que repetia a afirmação falsa),
`clicksign-sync.service.ts` (só a mensagem de log, que agora diz que vai retentar),
`clicksign-api.service.spec.ts` e `clicksign-sync.tick.spec.ts` (regressão).

## Teto de tentativas: o que existe hoje

Não existe teto, e é preciso saber disso. O `envelopeExpirado` só é avaliado quando o envelope **não**
está `closed`, então um envelope `closed` cujo `signed` nunca aparecesse ficaria retentando a cada ciclo
para sempre, visível apenas no log de warn. O custo por ciclo é baixo (uma requisição), e a evidência
medida é de que o `signed` aparece em segundos, então o risco é de diagnóstico, não de carga.

**Proposta, não construída** (§A.31, aguarda o aval do diretor): contar quantos ciclos um envelope
`closed` passou sem `signed` e, acima de um limiar, marcá-lo na tela de diagnóstico do scheduler. Fica
registrado aqui para decisão.

## As 9 recuperadas

Identificadas pela varredura anterior: baixa o arquivo do Drive e procura o log de assinatura da
Clicksign no texto do PDF. 192 admissões varridas, 183 corretas, **9 sem assinatura**.

Para cada uma: baixado o `signed` real da Clicksign, conferido que carrega o log de assinatura, e
**substituído o conteúdo do arquivo no Drive pelo mesmo file id** (`files.update` com
`keepRevisionForever`). O link da ficha continua valendo e a versão anterior fica no histórico do Drive.
**Nada foi apagado.**

Prova: o sha256 do arquivo rebaixado do Drive é idêntico ao do que a Clicksign serviu, nas 9. E a
varredura original, rodada de novo sobre as 9, devolveu `ASSINADO_OK: 9, SEM_ASSINATURA: 0`.

| Cliente | Matrícula | Páginas antes → depois |
|---|---|---|
| 55469 VR BENEFICIOS | 60244 | 19 → 21 |
| 57269 CIA DAS LETRAS | (6 admissões, inclui 27764, 27776, 27795) | 10/12/29 → 12/14/31 |
| 50492 BLUE SKIES | 27891, 27886 | 12/29 → 14/31 |

O `+2` constante são as páginas do log de assinatura da Clicksign, que o kit cru não tinha.

## O gatilho: o que a medição mostra

Medido contra a Clicksign, comparando o instante da **última assinatura** com o instante do
**arquivamento**:

| Admissão (cliente/matrícula) | Gap entre a última assinatura e o arquivamento |
|---|---|
| 57269 | 59s |
| 57269 | 58s |
| 57269 / 27764 | 53s |
| 57269 / 27795 | 26s |
| 50492 / 27886 | 23s |
| 50492 / 27891 | 20s |
| 57269 / 27776 | 18s |
| 57269 | 30min |
| **55469 / 60244** | **13 dias** |

Sete das nove foram arquivadas entre 18 e 59 segundos depois da última assinatura: é a corrida, direta.
O tick pegou o `closed` antes de a Clicksign terminar de gerar o `signed`.

**As duas restantes (30 min e 13 dias) a corrida não explica**, e vale registrar o que se vê sem
cravar causa. A de 55469/60244 foi assinada em 12/08 e só arquivada em 25/08 às 18:12:00, na cauda da **primeira
varredura do scheduler novo**, que nesse minuto arquivou cerca de 170 admissões de uma vez (o pico é
18:11:08, com 9 arquivamentos no mesmo segundo). Todas as outras daquele lote arquivaram certo. O `signed`
dela existia havia treze dias, então "ainda não renderizou" não serve de explicação. A hipótese que sobra
é de comportamento da API sob rajada, e ela **não está provada**: fica anotada, não afirmada.

Nota de divergência, para não ficar escondida: o pedido falava em **5** casos que a corrida não explicaria.
A medição acima encontra **2**. O número de 5 pode vir de um corte diferente (por exemplo, contando as
janelas de 0 a 10 segundos de uma coluna anterior, que media contra o `updated` do envelope e não contra a
última assinatura). Registrado como divergência aberta, não como correção.

## Nota de LGPD (§A.6)

A URL S3 do assinado não foi persistida nem logada em nenhum momento. Os eventos de assinatura da
Clicksign carregam e-mail, CPF, IP e coordenadas de quem assinou: da investigação saíram **só instantes e
contagens**, nada disso atravessou.
