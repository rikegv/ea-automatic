# GUIA DE VALIDACAO, INGESTAO DIGAI

**Projeto:** EA AUTOMATIC · **Frente:** ingestao do Digai (mesma regua do Pandape)
**Ambiente de validacao:** homologacao, `http://10.18.117.235:3120` (secao A.32, ambiente unico)
Secao A.11 (sem travessao), secao A.24 (title case em titulo e tag).

---

## 1. O QUE ESTA FRENTE E, EM UMA FRASE

O Digai avisa quando um candidato finaliza a triagem, o EA recebe esse aviso, busca o resto pela
API do Digai, e a pessoa **nasce na fila de Revisao de Vaga**, exatamente como ja acontece com o
Pandape. O time completa cliente e posicoes e libera.

**Ela nasce INERTE.** Sem as variaveis de ambiente, nada sai para a rede e nada e escrito. Ligar e
decisao do diretor, e e um passo separado da publicacao.

---

## 2. A PROVA MAIS IMPORTANTE: ELA ESTA MESMO DESLIGADA

Esta e a primeira coisa a conferir, e nao a ultima. A integracao so pode ser publicada se, sem
credencial, ela for **inofensiva**.

| O que provar | Como | O que se espera |
|---|---|---|
| A rota do webhook esta FECHADA sem credencial | `curl -i -X POST http://127.0.0.1:3111/api/webhooks/digai -H 'content-type: application/json' -d '{}'` | **401**. Nunca 200, nunca 202 |
| O cliente da API nao chama o Digai sem token | log do backend no boot | uma linha dizendo que a ingestao do Digai esta **INERTE** e por que (qual variavel falta). Nunca o valor de nenhuma variavel |
| Nada foi escrito no banco | contagem de `as_identidades_externas` com `fonte = 'DIGAI'` | **zero**, antes de ligar |

---

## 3. O QUE O DIRETOR VALIDA NA TELA

A frente e de backend e **nao cria tela nova**. O que aparece na interface aparece por reuso do que
ja existe, e e isso que se confere:

1. **Central de Candidatos**: o filtro de Origem ja oferece **Digai** (o valor ja existia no
   vocabulario compartilhado; a tela le a mesma lista). Confira que a opcao esta la e que filtrar
   por ela nao da erro.
2. **Tela de Revisao de Vaga** (`Vagas Pendentes De Revisao`): e para ca que a vaga do Digai cai,
   sem cliente e sem posicoes, esperando o time completar. Hoje, com a ingestao desligada, ela deve
   estar exatamente como estava: **a frente nao muda essa tela**.
3. **Ficha do candidato**: nada muda visualmente. A identidade do Digai vive em
   `as_identidades_externas`, que nao e exibida.

---

## 4. O DE/PARA DAS ETAPAS, QUE E O QUE O DIRETOR DECIDE

O Digai **nao tem funil de pastas** como o Pandape. O que ele tem, e foi medido na varredura de
16/09, e um estagio so, legivel pela presenca do CPF:

- **sem CPF: a pessoa NAO finalizou a triagem** (88% dos 13.248 registros)
- **com CPF valido: ela FINALIZOU** (12%, e o CPF **atualiza no mesmo registro**, o `userId` nao muda)

O campo `stages` do Digai **nao foi coletado e nao sera**: ele carrega resposta e julgamento sobre
a pessoa, e saiu de toda coleta por minimizacao, decisao do `seguranca` em 16/09.

**A PROPOSTA QUE VAI A SUA VALIDACAO:**

| estagio do Digai | etapa do funil proposta | por que |
|---|---|---|
| Nao Finalizou A Triagem | `CAPTACAO` | a pessoa chegou e ainda nao concluiu |
| Finalizou A Triagem | `CAPTACAO` | **escolha conservadora**, ver abaixo |

**POR QUE OS DOIS VAO PARA A MESMA ETAPA, e por que isso precisa da sua decisao.** A etapa natural
para quem finalizou seria a **Triagem**. Medido hoje: `TRIAGEM` esta **ATIVA em producao e INATIVA
na homologacao**, e os dois bancos tem catalogos diferentes (`CANDIDATURA` existe so na
homologacao). A FK do de/para e **RESTRICT**, entao apontar para um codigo ausente **derruba a
migration**, e apontar para etapa inativa **estaciona a pessoa onde ninguem a ve**. `CAPTACAO` e o
unico codigo presente e ativo nos dois ambientes.

Duas chaves externas apontando para a mesma etapa ja e o padrao da casa: `lead` e `inscritos` do
Pandape apontam ambas para `CAPTACAO`.

**A pergunta para voce:** quem finaliza a triagem do Digai deve ir para qual etapa? Se a resposta
for Triagem, ela precisa ser reativada na homologacao antes, e isso e edicao de catalogo, que e sua
decisao e nao da fabrica.

---

## 5. COMO LIGAR, QUANDO VOCE MANDAR

Tres variaveis, e a ausencia de qualquer uma mantem a frente inerte:

| variavel | o que e | de onde vem |
|---|---|---|
| `DIGAI_API_TOKEN` | o Bearer da API do Digai | **foi expurgado em 16/09** (`shred`). Precisa voltar |
| `DIGAI_WEBHOOK_TOKEN` | o token que **NOS** definimos no cadastro do listener do Digai (`authType` BEARER) | voce define, e informa ao Ivan |
| `DIGAI_INGESTAO_ATIVA` | o corte final: mesmo com credencial, nada e escrito sem ela | voce liga |

Sem HMAC: o Digai nao assina o payload, entao a prova de origem e o token que nos definimos. Mesmo
modelo do Pandape, fail-closed.

---

## 6. AS PENDENCIAS DO FORNECEDOR (registradas, nao travam a construcao)

1. **O header exato do token do webhook.** Ate o Ivan confirmar, o receptor aceita o cabecalho
   padrao do modelo BEARER; trocar o nome do header e uma linha.
2. **120 ou 500 requisicoes por minuto.** A documentacao diz 500, o fornecedor disse 120.
   **Adotado 120**, que e o menor. Nao se pergunta de novo.
3. **O certificado quebrado de `api.hiring.digai.ai`.** O host da documentacao tem certificado
   invalido (cert `CN=digai.ai`, SAN `*.digai.ai`, e o wildcard cobre um rotulo so). O host que
   usamos e `api-screening.digai.ai`, que e o certo. **Desligar a verificacao de TLS esta vetado**,
   e a proibicao virou teste. So avisar o Ivan um dia.

---

## 7. O QUE ESTA FRENTE NAO FAZ, DE PROPOSITO

- **Nao reengaja candidato.** O reenvio do link de triagem estava desenhado e tem contrato de teste
  escrito, e **nao foi construido**: a OST nao pediu (secao A.31). Fica proposto.
- **Nao escreve nada no Digai.** A integracao e de LEITURA, GET apenas, e a proibicao de escrita e
  garantida por duas travas independentes (o verbo e o caminho) mais uma inspecao adversarial do
  proprio fonte.
- **Nao cria etapa nova no funil.** O de/para aponta para etapas que ja existem.
- **Nao varre o Digai periodicamente.** O Digai tem webhook, entao a entrada e por evento. E a
  diferenca dele para o Pandape, que precisa varrer por nao ter evento de funil.

---

## 8. A DECISAO QUE A AUDITORIA DEVOLVEU, E ELA E SUA

**Quem entra numa vaga que nunca sai da fila de revisao nunca expira.**

A regra de expurgo do EA protege quem tem processo vivo: ela nao apaga ninguem que tenha uma
candidatura VIVA numa vaga que ainda nao encerrou. A vaga `PENDENTE_REVISAO` **nao encerra**, por
construcao. Somando as duas coisas: **a pessoa que o Digai trouxer fica protegida do expurgo por
tempo indefinido**, e o relogio de dois anos nunca comeca a correr, enquanto ninguem revisar a vaga.

O desenho erra para o lado seguro (nao apaga por engano), e e por isso que ele nao e um defeito.
Mas o efeito e **retencao indefinida de dado pessoal em escala**: o universo medido no Digai e de
**12.445 pessoas**, e sao vagas de triagem sem cliente, das menos provaveis de alguem revisar.

**Isto ja vale hoje para a ingestao do Pandape**, que esta inerte. O Digai multiplica o volume. A
fabrica nao escolhe isso em silencio, entao vai a sua decisao: **aceitar como esta, ou tratar a
vaga de revisao parada como encerrada para efeito de retencao?**

---

## 9. AS DUAS AUDITORIAS QUE RODARAM NESTA FRENTE

| agente | quando | o que achou | veredito |
|---|---|---|---|
| `seguranca`, 1a rodada | **antes** da primeira linha de codigo (secao A.40 regra 1) | 6 pontos auditados, **4 VETADOS**. Os dois furos de LGPD confirmados fechados por leitura da instrucao | vetos viraram exigencia de briefing |
| `tester` | **junto** com a construcao (secao A.40 regra 2), **sem ver o codigo** | contrato do requisito mais 52 casos novos (webhook, teto, 2a chamada, vaga) | 174 verdes, 18 suspensos, 0 vermelho |
| `backend` | construcao | 11 pecas mais a migration 0133 | gate verde no modulo |
| `seguranca`, 2a rodada | **contra o codigo** (secao A.39 passo 5) | **2 VETADOS**: o `new URL` apagava segmento de ponto e quebrava o invariante uma linha depois da grade; a rota administrativa deixava documento virar chave de Redis | ambos corrigidos |
| `seguranca`, reauditoria | depois da correcao | **nao aceitou a evidencia apresentada**: onde a construcao mediu 3 casos, ele mediu **161**, com fuzz adversarial cruzando oito moldes de path com alfabeto hostil em quatro posicoes | **161 autorizados, 0 divergentes. APROVADO para subir** |

Nenhum dos dois construiu nada: o `seguranca` e o `arquiteto` nao tem poder de escrita por desenho
(secao A.39), e o `tester` so escreve teste.

---

## 10. A LINHA DE BASE DA HOMOLOGACAO, MEDIDA EM 29/09 ANTES DE QUALQUER COISA

Anotada para que, no dia em que a ingestao for ligada, se saiba o que era dela e o que ja estava la:

| o que | quanto |
|---|---|
| `as_identidades_externas` (qualquer fonte) | **0 linhas** |
| `as_candidatos` com `origem = 'DIGAI'` | **4** (cadastro anterior, sem identidade externa nenhuma, nao veio de ingestao) |
| `as_candidatos` com `origem = 'IMPORTACAO'` | 9 |
| `vagas` | 1, em `ENTREGUE` |
| `as_depara_etapa_externa` com `fonte = 'DIGAI'` | **0** (as 25 existentes sao todas `PANDAPE`) |

**Depois de ligar, a primeira coisa a conferir e que `as_identidades_externas` saiu de 0** com
`fonte = 'DIGAI'`. Se ela continuar em 0 e houver candidato novo, a dedup nao esta funcionando, e
isso e mais grave do que nao importar nada.
