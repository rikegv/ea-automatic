# Guia De Validação: A Fundação Da Plataforma Unificadora

**Projeto:** EA AUTOMATIC · **Data:** 2026-09-17 · **Ambiente: HOMOLOGAÇÃO, `http://10.18.117.235:3120`** (§A.32)
**Nada commitado, nada em produção, até o diretor validar.**
§A.11 (sem travessão), §A.24 (title case em título e etiqueta).

Valide **peça por peça, na ordem**. Cada peça tem o que ela é, como conferir e o que significa passar.
Se uma peça reprovar, pare nela: as seguintes dependem dela.

---

## PEÇA 1. A TABELA DE IDENTIDADES (a janela vazia, fechada agora)

**O que é.** A estrutura que deixa **uma pessoa ter várias identidades externas** sem virar duas
pessoas. Uma pessoa, uma linha; o `userId` do Digai e o id do Pandapé são **vínculos** pendurados
nela, não cópias dela.

**O que ela NÃO é, e isto importa para a validação:** ela **não deduplica nada ainda**, e não
precisa saber a chave de casamento entre Digai e Pandapé, que depende do Ivan. Ela é a janela
aberta, vazia, no único momento em que abrir custa zero. Depois da ingestão ligada, a mesma
migration viraria backfill de dado pessoal.

**O que ela guarda, e só isto:** o id técnico na fonte, a **fonte** e a **data de coleta**
(exigência E5 do protocolo LGPD). Nenhum nome, nenhum e-mail, nenhum espelho da fonte.

**Como conferir (prova 1, roda na homologação):**

```
docker exec -e PGPASSWORD=<senha> ea-db psql -U ea -d ea_automatic_homolog -f /tmp/prova-fundacao.sql
```
*(já rodada, e o resultado está na seção "O que já foi medido", no fim deste guia)*

**O que a prova mostra, e o que cada linha quer dizer:**

| A prova mostra | Passou se |
|---|---|
| A tabela existe, com as 7 colunas | As 7 aparecem, e `fonte` e `coletado_em` são NOT NULL |
| A mesma pessoa aceita DUAS fontes | Aceitou. É a função inteira da tabela |
| A mesma pessoa aceita DUAS identidades da MESMA fonte | Aceitou. É o que permite a deduplicação depois |
| A MESMA identidade externa em DUAS pessoas | **Recusada**. Uma identidade externa é de uma pessoa só |
| Uma fonte inventada | **Recusada**. A lista de fontes é fechada no banco |

---

## PEÇA 2. AS 5 ETAPAS DO FUNIL, DE VOLTA

**O que é.** A base de A&S foi limpa e o funil ficou com zero etapas, como o senhor mandou. **Sem
etapa, nenhuma candidatura nasce**: a coluna tem chave estrangeira RESTRICT, e o banco recusa.
Estas cinco repõem o chão.

**Quais são, e de onde vieram.** Do histórico, conferido na migration `0100_as_etapas_funil.sql`,
linhas 97 a 101. A quinta, que faltava no pedido, é a **Aprovação**.

| Ordem | Etapa | Cor | Observação |
|---|---|---|---|
| 1 | Captação | neutro | **Etapa inicial**: é onde a candidatura nasce |
| 2 | Triagem | informação | |
| 3 | Entrevista Soulan | atenção | |
| 4 | Entrevista Cliente | alerta | |
| 5 | Aprovação | positivo | |

**Como conferir, e esta é a peça que se valida OLHANDO (§A.13):**

1. Abra `http://10.18.117.235:3120/admin/as/etapas`.
2. As cinco estão lá, nesta ordem, com estes nomes e estas cores.
3. **A Captação, e só ela, aparece marcada como inicial.**
4. O catálogo continua sendo **seu**: renomeie, reordene, recolora, crie uma sexta. A reposição
   **não sobrescreve** o que o senhor editar depois, por construção.

**Uma observação que vale a decisão do senhor:** no código está escrito que *"as seis que ele quer
não são estas cinco"*. Se a sexta existir, ela é sua para cadastrar nesta tela, e a proposta da
peça 3 sugere qual seria (a **Stand By**).

---

## PEÇA 3. O DE/PARA DO PANDAPÉ (as 10 caem nas 5)

**O que é.** A tradução entre as etapas do Pandapé e as suas. **Configurável, em tabela**, porque
os nomes do Pandapé são digitados à mão e mudam por vaga. Nada fixo no código.

**Os nomes reais, medidos na sua conta** (`GET /v2/vacancy-folders`, resposta 200 numa vaga de
verdade), com a caixa e a pontuação exatamente como vieram:

`Lead` · `Inscritos` · `triados` · `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` ·
`ENTREVISTA SOULAN` · `SHORT LIST, ENCAMINHADOS CLIENTE` · `Contratados` ·
`RETORNO VAGA STAND BY` · `RETORNO NEGATIVO` · `Descartados`

### 3.1 As que já entraram na primeira leva, porque não tinham dúvida

| Etapa no Pandapé | Cai em |
|---|---|
| `Lead` | Captação |
| `Inscritos` | Captação |
| `triados` | Triagem |
| `ENTREVISTA SOULAN` | Entrevista Soulan |
| `SHORT LIST, ENCAMINHADOS CLIENTE` | Entrevista Cliente |

### 3.2 As CINCO restantes: APROVADAS PELO DIRETOR em 17/09/2026, e já aplicadas

Ele aceitou a proposta inteira e acrescentou uma distinção: **`RETORNO NEGATIVO` e `Descartados`
NÃO caem no mesmo lugar**. Os dois continuam sendo descarte, e o que os separa é o **motivo**. Para
isso o de/para ganhou a coluna `motivo_padrao`, e nasceu a sexta etapa do funil, **Stand By**.

| Etapa no Pandapé | Proposta | Por quê |
|---|---|---|
| `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` | Etapa **Triagem** | É a peneira do questionário, que acontece dentro do que a Soulan chama de Triagem |
| `Contratados` | Etapa **Aprovação** mais desfecho **Enviado Para Admissão** | É o fim do funil e o começo da esteira |
| `RETORNO VAGA STAND BY` | Etapa **Stand By** (a sexta, criada na 0111) | Não é desfecho, é espera |
| `RETORNO NEGATIVO` | Desfecho **Descartado**, motivo **Retorno negativo do cliente** | O cliente disse não. A pessoa não muda de lugar no funil, ela sai dele |
| `Descartados` | Desfecho **Descartado**, motivo **Descartado na seleção** | A seleção descartou. Mesmo desfecho, motivo diferente |

**Duas coisas que o senhor precisa saber antes de aprovar, e as duas são medidas, não suposição:**

1. **`Contratados` custa uma posição da vaga.** A situação "Enviado Para Admissão" **consome
   posição oficial**. Quando a ingestão ligar, uma pessoa marcada como contratada no Pandapé passa a
   ocupar uma vaga aqui, automaticamente. É o comportamento certo, e é melhor saber dele antes.
2. **`RETORNO NEGATIVO` e `Descartados` já estão SEPARADOS**, por decisão sua. Os dois têm o mesmo
   desfecho (Descartado) e motivos diferentes, e é o motivo que vai para a ficha da candidatura.
   O texto dos dois motivos é seu: renomeie quando quiser, que a distinção continua valendo.

**Como conferir (prova 3):**

```
cd /home/henrique/apps/ea-homolog/apps/backend && npx tsx src/db/prova-fundacao.ts
```
*(já rodada, e o resultado está na seção "O que já foi medido", no fim deste guia)*

Ela passa os **dez nomes reais** pelo tradutor e imprime onde cada um caiu. As quatro primeiras
resolvem; as cinco de cima aparecem como **não mapeada**, que é o resultado CERTO até o senhor
decidir. Ela também prova que `triados`, `TRIADOS` e ` Triados ` caem todos no mesmo lugar, que é o
que faz o de/para aguentar a digitação livre do Pandapé.

---

## O QUE O SENHOR DECIDE, numerado (§A.42)

1. ~~As cinco etapas do Pandapé que faltam~~ **DECIDIDO em 17/09/2026: aprovadas e aplicadas.**
2. ~~A sexta etapa (Stand By)~~ **DECIDIDO: criada, ordem 6.**
3. ~~Distinguir `RETORNO NEGATIVO` de `Descartados`~~ **DECIDIDO: separados por motivo próprio.**
4. **As duas colunas antigas de id do Pandapé** (`id_candidate_pandape` no candidato,
   `id_match_pandape` na candidatura) têm ZERO valores e foram substituídas pela tabela de
   identidades. Remover as duas é o certo, e alcança código já validado: **autoriza?** (§A.26)
5. **Prazo de retenção de quem entra por fonte externa e NÃO tem vaga.** Hoje o expurgo só alcança
   quem teve candidatura: quem for importado e não casar com vaga nenhuma fica guardado **para
   sempre**. Isto não trava esta entrega (a base está vazia), mas **trava a ingestão**.
6. **O campo `origem` concede imortalidade e qualquer usuário pode editá-lo**, sem papel e sem
   trilha. Marcar alguém como Banco De Talentos isenta a pessoa do expurgo em silêncio. Exige papel
   e trilha?
7. **A edição do candidato re-identifica quem já foi expurgado.** A rota de editar grava CPF,
   e-mail, telefone e nascimento sem conferir se a pessoa já foi anonimizada, então o dado apagado
   volta e a varredura não desfaz. Achado da auditoria de código, anterior a esta frente. Fecha?

---

## O QUE **NÃO** FOI CONSTRUÍDO, de propósito (§A.31)

Nenhuma tela nova, nenhuma rota nova, nenhuma ingestão, nenhuma chamada ao Pandapé ou ao Digai,
nenhuma deduplicação e nenhum espelho da fonte. Esta entrega é **fundação**: a estrutura que as
próximas frentes vão usar. A tela de administração do de/para é a candidata natural à frente
seguinte, e ela **não** foi feita porque não estava na OST.


---

## O QUE JÁ FOI MEDIDO, na homologação, antes de o senhor abrir

Não é previsão, é o que rodou. Tudo contra o banco da homologação, em 17/09/2026.

**Peça 1, estrutura:** a tabela nasceu com as 7 colunas, `fonte` e `coletado_em` NOT NULL, e quatro
travas no banco: chave, vínculo com o candidato, lista fechada de fontes e o único de
(fonte, identificador). **Nenhum único toca a pessoa sozinha**, que é o que permite a deduplicação
depois.

**Peça 1, comportamento, medido ao vivo dentro de transação desfeita:**

| O que se tentou | Resultado |
|---|---|
| Mesma pessoa, DUAS fontes diferentes | aceito |
| Mesma pessoa, DUAS identidades da MESMA fonte | aceito |
| `coletado_em` preenchida sozinha nas 3 linhas | sim, 3 de 3 |
| A MESMA identidade externa em OUTRA pessoa | **recusado** pelo banco |
| Fonte fora da lista (um "LINKEDIN" inventado) | **recusado** pelo banco |

Tudo foi desfeito: a tabela voltou a zero linhas.

**Peça 2, na tela:** as 5 etapas aparecem em `/admin/as/etapas`, na ordem 1 a 5, com as cores certas,
a Captação marcada **Nasce Aqui** e o rodapé dizendo "5 etapas ativas de 5 cadastradas". Nenhuma
coluna cortada ou esmagada (medido célula a célula, zero). A imagem está em
`/home/henrique/prova-fundacao-unificadora/01-etapas-do-funil.png`.

**Peça 3, os dez nomes reais passados pelo tradutor:**

| Nome no Pandapé | Resolveu para |
|---|---|
| `Lead` | Captação |
| `Inscritos` | Captação |
| `triados` | Triagem |
| `ENTREVISTA SOULAN` | Entrevista Soulan |
| `SHORT LIST, ENCAMINHADOS CLIENTE` | Entrevista Cliente |
| `Pré-selecionadoS (MANTER SE HOUVER QUESTIONÁRIO)` | **não mapeada**, aguarda o senhor |
| `Contratados` | **não mapeada**, aguarda o senhor |
| `RETORNO VAGA STAND BY` | **não mapeada**, aguarda o senhor |
| `RETORNO NEGATIVO` | **não mapeada**, aguarda o senhor |
| `Descartados` | **não mapeada**, aguarda o senhor |

E as três grafias do mesmo nome (`triados`, `TRIADOS`, `  Triados  `) caem todas em Triagem, que é o
que faz o de/para aguentar a digitação livre do Pandapé. Fonte inventada e nome vazio devolvem
**não mapeada**, nunca um caneco de conveniência.

**Nada fora do escopo mudou.** Antes e depois da subida na homologação: admissões 2.731, candidatos
2.689, clientes 238, usuários 30, todos idênticos. O que mudou foram exatamente duas tabelas novas,
as 5 etapas e as 5 linhas de de/para.
