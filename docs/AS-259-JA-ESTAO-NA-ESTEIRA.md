# As 259 pre-admissoes da varredura: medicao contra a producao

Medido em 02/10/2026 no banco `ea_automatic` (producao). Investigacao apenas, nada construido.

## Como o conjunto foi reidentificado

As 259 admissoes foram apagadas em 01/10 e o vinculo `as_candidaturas.admissao_id` foi
anulado no mesmo passo. O conjunto reidentifica exatamente por:

```sql
situacao = 'ENVIADO_PARA_ADMISSAO' and admissao_id is null and candidato.cpf is not null
```

Resultado: **259**, igual ao apagado. (Ha 291 nessas condicoes; 32 nao tem CPF e nunca
viraram pre-admissao.)

## 1. Quantas ja estao na esteira, e por qual chave

| chave | quantas |
|---|---|
| **CPF**, ja existe admissao | **254** |
| **nome**, bate sem o CPF bater | 0 |
| nao esta por nenhuma chave | 0 |
| fora da esteira | **5** |

O cruzamento por nome foi feito e nao acrescentou ninguem: quem esta, esta por CPF.

**Contaminacao descartada.** O cruzamento por `candidatos` (tabela da esteira) seria
circular, porque a propria varredura criou candidato. Medido: os `candidatos` das 254 sao
**anteriores** a varredura; so os 5 nasceram nela. E as admissoes das 254 sobreviveram ao
delete das 259, logo nao sao resto da varredura.

## 2. Por qual caminho as 254 entraram

| caminho | quantas |
|---|---|
| **webhook** (registro em `integracao_pandape`) | **250** |
| cadastro manual (`origem = MANUAL`, sem registro de webhook) | 4 a 6 |

Por linha de admissao: 252 webhook + 6 MANUAL (um mesmo CPF pode ter mais de uma admissao).
Idade: 251 anteriores a 30/09, 1 em 30/09, 6 manuais anteriores a 30/09. **Nenhuma do dia
da varredura.**

## 3. Por que os 5 ficaram de fora

Os 5 estao em duas vagas, **3603205** e **3603446**, criadas pela propria varredura em
01/10 as 21:47, status `PENDENTE_REVISAO`, sem `cod_cliente`.

**Nao e falta de cliente.** O webhook atendeu **43 pessoas dessas mesmas duas vagas** e
resolveu o cliente em 39 delas (38 no codigo 57269, 1 no 50124). Onde a varredura escreve
nulo, o webhook preenche.

**A causa e outra, e e ela que explica o defeito inteiro:** "Contratados" no funil do
Pandape **nao e** "enviado para admissao". O de/para `as_depara_etapa_externa` traduz duas
etapas para `ENVIADO_PARA_ADMISSAO`:

| etapa externa | etapa interna | situacao |
|---|---|---|
| `contratados` | APROVACAO | ENVIADO_PARA_ADMISSAO |
| `admissao` | APROVACAO | ENVIADO_PARA_ADMISSAO |

A varredura le a **etapa do funil**. O webhook dispara na **acao explicita** de enviar para
admissao, que e um gesto separado no Pandape. As 259 estao todas em etapa interna APROVACAO.
Os 5 estao no funil como contratados e ainda nao foram enviados: para o webhook, nao chegou
a hora; para a varredura, ja tinha chegado.

## 4. Isso muda o conserto, e simplifica

**Sim, e confirma a regra do diretor.** Os dois caminhos sao independentes por construcao e
nenhum enxerga o outro:

- `pandape/pandape-sync.service.ts` (webhook) grava `integracao_pandape` e cria a admissao.
- `as/ingestao-pandape/ingestao-ciclo.ts` (varredura de A&S) cria pela ponte, regida por
  `ponteDeveDisparar` (`domain/as-precedencia-ingestao.ts`).

E por isso que a mesma pessoa nasceu duas vezes.

**O webhook e melhor nos tres pontos que importam:**

| | webhook | varredura |
|---|---|---|
| cobertura das que estao na esteira | 250 de 254 | - |
| `cod_cliente` na admissao | **252 preenchidos**, 6 nulos | **nulo por construcao** |
| momento do disparo | a acao de enviar para admissao | a etapa do funil, que vem antes |

A varredura nao acrescenta nada: cria depois (ou antes da hora), sem cliente, para gente que
o webhook ja traz com cliente. **Ela nao precisa criar pre-admissao nunca.**

## O conserto que a medicao sustenta

1. A varredura **nunca** cria admissao, nem para quem esta em `contratados` ou `admissao`.
   Ela so atualiza o funil e a situacao da candidatura.
2. Quem cria admissao e **so o webhook**.
3. Regra do diretor, atendida de graca: se ja estiver na esteira, nao trazer de novo. Com a
   varredura sem criar, nao ha como trazer de novo.

**Ponto de atencao para quando o motor religar:** as 259 candidaturas seguem com situacao
`ENVIADO_PARA_ADMISSAO` e `admissao_id` nulo. Na regra atual (`jaTemAdmissao === false` mais
situacao na lista), o proximo ciclo **recria as 259**. E por isso que o motor fica parado ate
o conserto subir.
