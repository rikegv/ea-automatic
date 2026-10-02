# Mapa de alcance: a varredura nunca cria admissao

Medido em 02/10/2026 por varredura de codigo e de banco de producao. Este mapa vai no
briefing dos tres agentes (§A.39 passo 3, §A.40 regra 1).

## A regra do diretor, a registrar como permanente

> "O UNICO GATILHO QUE ENVIA PARA ADMISSAO E O GATILHO DA ESTEIRA, E NAO DAS ATS."

Nem Pandape nem Digai criam admissao. As ATS alimentam o funil. Quem envia para admissao e
a esteira: o webhook (na acao explicita de enviar) e o envio manual do funil.

## Os tres caminhos que criam admissao hoje, e o que acontece com cada um

| caminho | arquivo | fica ou sai |
|---|---|---|
| **webhook do Pandape** | `pandape/pandape-sync.service.ts` | **FICA.** E o gatilho da esteira |
| **envio manual do funil** | `as/candidatos/candidatos.service.ts`, `registrarSaida` | **FICA.** Master, trilha, aceite |
| **varredura de A&S** | `as/ingestao-pandape/ingestao-ciclo.ts`, pela ponte | **SAI.** E o defeito |

Os tres chamam `AdmissoesService.criarPreAdmissaoDoFunil`. Removida a varredura, o metodo
segue vivo com dois chamadores: ele **nao** vira codigo morto.

**Digai: nada a fazer.** `as/digai/` nao tem ponte, nao chama `criarPreAdmissao` e nao
escreve `admissao_id`. Medido: zero ocorrencias. Ele usa `situacaoDeNascimentoDigai`
(`domain/digai.ts`), que so escreve situacao de candidatura. A regra ja esta satisfeita la,
e a trava nova tem de impedir que alguem ligue esse fio depois.

## Quem mais escreve o dado (§A.40 regra 3)

- **`admissoes`**: os tres caminhos da tabela acima, mais as rotinas de carga (`db/carga-*.ts`)
  e o Portal. Nenhuma delas e tocada por este conserto.
- **`as_candidaturas.admissao_id`**: duas escritas no sistema, a ponte da varredura (sai) e o
  `registrarSaida` manual (fica). O webhook **nao** escreve essa coluna, e e por isso que as
  250 admissoes que ele criou aparecem com `admissao_id` nulo do lado de A&S.

## O corte, arquivo por arquivo

| arquivo | o que sai |
|---|---|
| `as/ingestao-pandape/ingestao-ciclo.ts` | o `if (ponteDeveDisparar(...))` e a funcao `acionarPonte` |
| `as/ingestao-pandape/ingestao-portas.ts` | `ponteParaAdmissao`, `PortaPonteParaAdmissao` e os 3 contadores do resumo |
| `as/ingestao-pandape/ingestao-varredura.service.ts` | a injecao da ponte e os 3 contadores da linha de log |
| `as/ingestao-pandape/ingestao-ponte-admissao.ts` | **o arquivo inteiro** |
| `as/as.module.ts` | o provider `IngestaoPonteParaAdmissao` |
| `domain/as-precedencia-ingestao.ts` | a funcao `ponteDeveDisparar` |

**NAO SE TOCA:**
- `SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO` (`domain/as-ponte-admissao.ts`). Ela e a regua do
  **caminho manual**, que o diretor quer preservado. Mexer nela desliga o envio do funil.
- `decidirPrecedencia` e a trava de precedencia, no mesmo arquivo da funcao que sai.
- `AdmissoesService.criarPreAdmissaoDoFunil` e `vivasPorCpf`.
- Qualquer coisa do webhook.

## Raio medido, e ele e contido

Varredura em `apps` e `packages` por `pontesParaAdmissao`, `pontesAdiadas`,
`posicoesExcedidas`, `IngestaoPonteParaAdmissao` e `ponteDeveDisparar`:

- **nenhuma ocorrencia no frontend.** Nenhuma tela le os contadores.
- o unico consumidor deles e a **linha de log** do ciclo, em `ingestao-varredura.service.ts`.
- `ponteDeveDisparar` so e chamada no ciclo.

Por que remover os contadores em vez de deixa-los em zero: contador que nunca sobe e sinal
morto, e sinal morto foi exatamente a armadilha do fio morto do cliente da vaga (um valor
calculado e gravado nulo, que ninguem percebeu por semanas).

## As 259 candidaturas, e por que elas sao o teste de aceitacao

Em producao, 259 candidaturas estao com `situacao = ENVIADO_PARA_ADMISSAO` e
`admissao_id` nulo (o vinculo foi anulado quando as pre-admissoes foram apagadas em 01/10).

Na regua ATUAL, `ponteDeveDisparar` devolve **true** para elas (`jaTemAdmissao === false` e
situacao na lista), e o proximo ciclo **recria as 259**. O conserto tem de provar que nao.

## Perguntas do diretor, com a resposta a confirmar em teste

1. **Os dois caminhos continuam sem se enxergar?** Sim. E ha uma consequencia honesta: o
   webhook nao escreve `as_candidaturas.admissao_id`, logo o funil de A&S nao mostra o elo
   com a admissao que o webhook criou. A pessoa **nao se perde** (esta na esteira, com
   cliente preenchido), mas o elo do lado de A&S fica nulo. Isso ja e o estado de hoje, das
   250, e nao e efeito do conserto.
2. **A candidatura que a varredura ve em "Contratados" e o webhook ainda nao enviou:** ela
   espera. A varredura grava a etapa e a situacao (o funil fica certo) e **nada** cria
   admissao. Quando o gatilho da esteira disparar, a admissao nasce por ele, com cliente.

---

# EMENDA, apos o VETO da auditoria (02/10/2026)

O `seguranca` vetou a primeira versao deste mapa. Quatro exigencias eram minhas e estao
atendidas abaixo. Uma afirmacao dele eu medi e CONTRADIGO, com o numero.

## E-1. CORRECAO DE UM ERRO MEU: a regua do caminho manual NAO e a que eu disse

A primeira versao afirmava que `SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO`
(`domain/as-ponte-admissao.ts:31`) e a regua do envio manual do funil, e que mexer nela
desligaria o time. **Esta errado, e eu conferi.**

O envio manual abre o ramo por `ocupaPosicao(dto.situacao)`
(`as/candidatos/candidatos.service.ts:1878`, regua em `domain/candidatura.ts:197`), mais
`SITUACOES_DE_SAIDA` no `@IsIn` do DTO. **Ele nunca le aquela constante.**

Os dois unicos consumidores de producao dela sao **da varredura**:
`domain/as-ponte-admissao.ts:61` (dentro de `desfechoDaIngestaoExterna`) e
`domain/as-precedencia-ingestao.ts:219` (dentro de `ponteDeveDisparar`, que sai).

**Consequencia para o corte:** depois dele, a constante e a metade `pedePonteParaAdmissao` do
`desfechoDaIngestaoExterna` ficam **sem consumidor de producao**. Elas saem, pelo mesmo
critério que tirou os contadores. O que o comentario de `as-ponte-admissao.ts:22-29` diz e que
o RECORTE coincide com o do caminho manual, e isso e verdade; eu li aquilo como se a constante
GOVERNASSE o caminho manual, e nao governa.

## E-2. A tabela do corte estava incompleta: cinco arquivos de teste

| arquivo | o que referencia | destino |
|---|---|---|
| `as/ingestao-pandape/ingestao-ponte-admissao.ciclo.backend.spec.ts` | a porta, o tipo, os 3 contadores | sai com a ponte |
| `as/ingestao-pandape/ingestao-ponte-admissao.backend.spec.ts` | `IngestaoPonteParaAdmissao` | sai com a ponte |
| `as/ingestao-pandape/ingestao-origem-da-pre-admissao.backend.spec.ts` | le o arquivo da ponte para asserir `origem` | reescrito ou removido, conforme o que cobre |
| `domain/as-precedencia-ingestao.spec.ts` | 7 assercoes de `ponteDeveDisparar` | so essas assercoes saem; as de `decidirPrecedencia` FICAM |
| `as/ingestao-pandape/depara-cliente.fonte-e-inercia.tester.spec.ts:225` | **monta o caminho ABSOLUTO do arquivo da ponte e o LE** | o item sai da lista `NAO_PODEM_FALAR`; o resto da spec fica |

O ultimo e o pior e e de **outra frente** (a proposta de cliente da planilha): apagar o arquivo
da ponte faz a spec **estourar na leitura**. A propriedade que ela guardava (o de/para nao fala
com a pre-admissao) passa a ser garantida de forma **mais forte**, pela ausencia do caminho.

## E-3. O fio morto que o corte deixaria, e o destino dele

Quatro insumos ficariam calculados e propagados **sem leitor**, e eles levam ate a borda da
criacao de admissao. Pelo mesmo critério dos contadores, saem:

- `situacaoNoEa` e `jaTemAdmissao`, propagados por tres camadas
  (`ingestao-repositorio.ts:523-524`, `ingestao-portas.ts:96,98`, `ingestao-ciclo.ts:781-782,823-824`);
- o `admissao_id` no `select` de `ingestao-repositorio.ts:384`, que o proprio comentario declara
  ser insumo da ponte;
- `pedePonteParaAdmissao` (ver E-1);
- `CandidatosService.dadosDaPonteParaAdmissao`, tornado publico **so** para a ponte: fecha a
  visibilidade ou sai.

**FICA, e e decisao minha a reportar, nao do agente:** o parametro `origem` de
`criarPreAdmissaoDoFunil` (`admissoes/admissoes.service.ts:384`). Ele encosta na origem das
admissoes do webhook, e mexer ali e frente propria.

## E-4. Um comentario em producao afirma o CONTRARIO da regra nova

`as/ingestao-pandape/ingestao-varredura.service.ts:268-273` diz que uma segunda chave de
ambiente criaria um estado em que "a ingestao escreve situacao de contratado e nao abre
admissao, que e exatamente o buraco que esta frente fechou". **Esse estado e exatamente o que
o diretor mandou construir.** O comentario entra no corte e e reescrito. Deixa-lo e entregar a
proxima sessao uma justificativa escrita para religar o fio.

Mesma linha: os contadores tambem entram na **condicao de silencio** do log
(`ingestao-varredura.service.ts:291-292`), e nao so na frase. Removê-los muda **quando** a
volta e muda, e isso e ajuste conscientemente feito, nao efeito colateral.

## E-5. Escritores de `admissoes`: a lista completa

Alem dos tres caminhos, das rotinas de carga e do Portal, ha tres escritores que a primeira
versao omitiu, **nenhum deles porta de producao**:

- `as/ingestao-pandape/arnes-seed-manual.ts:330,448` (`insert into admissoes` em SQL cru,
  **dentro do diretorio do corte**; fail-closed por nome de database, via `conferirDatabase`);
- `db/seed-candidato-teste.ts:109`;
- `db/carga-provisorio.ts:89`.

Nao mudam o conserto, mas a §A.40 regra 3 pede a lista **provada completa**, e "os tres
caminhos mais a carga e o Portal" nao era.

## E-6. O RESIDUO DAS 259, e aqui eu CONTRADIGO a auditoria

A auditoria concluiu que o expurgo de 6 meses **nunca** alcanca as 259, porque todas estao em
vaga **nao encerrada**. **Eu medi e e o contrario.** A perna decisiva nao e "encerrada", e o
**papel** da vaga, e o proprio arquivo da retencao documenta isso em extenso.

A condicao de protecao e
`and (k.admissao_id is not null or (s.papel is distinct from 'REVISAO' and ...))`,
dentro de um `not exists` (`as/candidatos/retencao-candidatos.service.ts:394`).

Medido em producao, as **259 de 259**:

| perna da protecao | valor | efeito |
|---|---|---|
| `k.admissao_id is not null` | **falso** (o vinculo foi anulado em 01/10) | nao protege |
| `s.papel is distinct from 'REVISAO'` | **falso**: as 60 vagas sao `papel = REVISAO`, status `PENDENTE_REVISAO`, `encerra = false` | nao protege |

Logo o `not exists` **vale**, e as 259 **sao expurgaveis** no relogio normal de 6 meses. A fila
de revisao deixou de proteger por **decisao anterior do diretor**, justamente para a inercia de
quem revisa nao virar politica de retencao. **Nao ha retencao indefinida.**

**O QUE DE FATO MERECE A ATENCAO DO DIRETOR, e e o espelho do achado, nao ele:** para **254**
dessas pessoas existe admissao VIVA na esteira, com CPF inteiro, e o lado de A&S delas **vai**
ser anonimizado pelo relogio de 6 meses. O arquivo da retencao descreve exatamente esse dano
("o lado que some e o que preserva o historico; o que sobrevive e o que guarda o CPF") e a
protecao contra ele e `k.admissao_id is not null`, que e o campo que a limpeza de 01/10 anulou.
O prazo nao e urgente (o ultimo movimento delas e 01/10/2026, entao o relogio vence por volta
de abril de 2027), e a decisao e do diretor.

## E-7. Posicao consumida: 19 dos 21 estouros sao do residuo

`ENVIADO_PARA_ADMISSAO` **consome posicao** (`domain/candidatura.ts`). Medido nas 60 vagas do
residuo:

| | vagas |
|---|---|
| ocupacao oficial **acima** do teto, **com** o residuo | **21** |
| ocupacao oficial acima do teto, **sem** o residuo | **2** |
| teto das vagas (min / media / max) | 1 / 4 / 50 |

Ou seja, **19 vagas estouram o teto por causa do residuo**. As **60 sao espelhadas e ainda nao
revisadas** (`cod_cliente` nulo, papel REVISAO). O efeito pratico aparece **quando alguem
revisar e liberar** uma delas: ela chega cheia ou estourada, e o time encontra "as posicoes ja
estao preenchidas" numa vaga com lugar sobrando.

**Decisao do diretor**, e nao do coordenador: o que fazer com o residuo. As 259 linhas sao
candidaturas que a varredura escreveu lendo a ETAPA do funil como se fosse a ACAO de enviar,
que e o defeito que este conserto remove. O conserto **nao** as recria, e **nao** as limpa.

## E-8. O espelho fora do residuo: existe, e o numero exato NAO esta fechado

A auditoria retirou o achado de retencao (E-6) e trouxe, em troca, que o espelho nao se limita
as 259: haveria **271 pessoas** sem protecao e com admissao viva. **Eu repliquei o predicado por
conta propria e deu outro numero: 396** com admissao em qualquer farol, e apenas **5** com
admissao em farol VIVO.

**Nenhuma das duas contas vale como numero final, e o motivo e o mesmo nas duas:** nem eu nem a
auditoria reproduzimos o predicado INTEIRO de `retencao-candidatos.service.ts`, que tem ainda a
perna do **carimbo da vaga que entregou**. Toda replica parcial de um predicado de protecao erra
para o lado de dizer que ha menos protecao do que ha. Foi exatamente esse o erro do E-6, em
sentido contrario.

**O que esta FECHADO e medido tres vezes, e basta para a decisao:** as **259** do residuo nao
tem protecao, **254** delas tem admissao na esteira pelo CPF, e a marca de relogio das 259 e
`2026-10-01`, logo o expurgo do lado de A&S vence em **01/04/2027**, no mesmo dia para todas.

**O que a auditoria apontou e e o insumo que importa:** `as_candidaturas.admissao_id` nao e um
elo cosmetico, e a **primeira perna da protecao de retencao**. Preenchido, o dano desaparece sem
tocar politica nenhuma. Enquanto o webhook nao escreve a coluna, toda pessoa que ele traz nasce
sem essa protecao do lado de A&S. **Ligar o elo de quem ja tem admissao e a decisao barata;
mexer na regua de retencao e a caríssima, e as duas sao a mesma pergunta vista de dois lados.**

Isso e **frente propria**, a decidir pelo diretor (§A.31: propoe, nao constroi). Nao entra neste
conserto.
