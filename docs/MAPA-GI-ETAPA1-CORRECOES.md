# Correcoes da auditoria ao mapa da etapa 1 (05/10/2026)

Addendum de `MAPA-GI-FECHAR-A-PONTE-ETAPA1.md`. O `seguranca` auditou o mapa ANTES de qualquer
construcao (§A.40 regra 1). Veredito: **1 VETADO, 2 APROVADOS COM CORRECAO, 2 APROVADOS**. Tudo o que
entra aqui foi **reverificado por mim**, nao copiado do retorno dele.

## C1. "ZERO variaveis GI_ em producao" ESTA DEFASADO, e a frase era do mapa ANTERIOR

`docs/MAPA-GI-FECHAR-A-PONTE.md` secao 2 afirma "ZERO variaveis `GI_` no `.env` de producao" e conclui
que "armar a flag sozinho nao liga nada". **Era verdade em 02/10 pela manha e e FALSO hoje.** Medido:
**6** variaveis `GI_`, `GI_PARES_EMPRESA_FILIAL` com **127 pares** que parseiam, `.env` em 600. Logo
`configurado()` devolve **true**, e `enviarManual` ja le a pessoa, le a contratacao e **monta o payload
com PII e salario** antes de parar no `GI_MONTADO_NAO_DISPARADO`.

**Nao ha dois freios independentes. Ha UM: a linha ausente no `.env`.** Ela e relida a cada chamada,
entao acrescentar a linha e reiniciar o servico liga a escrita na folha de um terceiro sem revisao de
codigo e sem publicacao.

## C2. O gatilho automatico tem SETE chamadores, e dois nao sao humanos

Minha tabela dizia "ao fechar a regua obrigatoria na auditoria". Isso descreve o LUGAR, nao o ALCANCE.
`aplicarPosVeredito` (o metodo que contem o gatilho) e chamado por: veredito da IA, validacao humana,
descarte de documento, coleta de VT (**scheduler**), tela de Diagnostico, **reconciliacao do Drive**
(automatica, usuario `sistema@ea.local`, papel **SUPER_ADMIN**, `reconciliacao-drive.service.ts:241`
e `:253-254`) e o runner `db/rearquiva-drive.ts:86`, que **laca sobre TODA admissao** com
`drive_pasta_url` nulo.

**A CADENCIA, com o erro que eu cometi e que o `seguranca` derrubou.** Eu "corrigi" o numero dele de
10 para 5 min. **Estava errado, e a correcao foi REJEITADA com evidencia.** Sao DUAS constantes com o
MESMO nome, em arquivos diferentes:

| constante | arquivo:linha | o que e |
|---|---|---|
| `INTERVALO_MS = 10 * 60 * 1000` | `reconciliacao-drive-scheduler.service.ts:35` | a **CADENCIA** do `setInterval` (`:52-54`) |
| `INTERVALO_MS = 5 * 60 * 1000` | `reconciliacao-drive.service.ts:44` | o **PISO** entre duas varreduras (`:61`) |

**A formulacao certa:** timer automatico a cada **10 min**, mais disparo **sob demanda** pela tela de
Diagnostico (`diagnostico.controller.ts:97`), com **piso de 5 min** entre varreduras. O piso existe
para a abertura da tela nao revarrer.

**Licao de metodo, e ela e minha:** eu exigi "provar no artefato" e conferi uma constante num arquivo
para atribui-la a outro. E o mesmo genero de erro que grepar o fonte em vez do artefato servido.

Hoje isso e inofensivo **so porque o gatilho e stub**. O dia em que alguem preencher a porta
`enviarAoGi`, o timer de 10 min, o disparo sob demanda da tela e o runner viram **disparadores em
lote na folha de um terceiro**, sem clique e sem MASTER. A frase do cabecalho ("fechar auditoria em MASSA jamais dispara N criacoes")
e verdadeira pelo stub, **nao pelo desenho do chamador**.

## C3. A lista de recusas tem SEIS, nao cinco

Falta `GI_CLIENTE_NAO_RESOLVIDO` (`enviar-para-gi.service.ts:82` e `:110-111`;
`domain/portal-dados-gi.ts:1557-1559`). Nao muda a conclusao do 1B (tambem nao e sobre documento), mas
um mapa que se apresenta como "lista fechada medida" nao pode errar a contagem.

## C4. O risco do documento sao DOIS eixos, nao um

Eu escrevi "o certo e o errado saem iguais". E mais fundo:

1. **A regua mede ARQUIVO; o payload le CAMPO.** `progresso()` mede `DocumentoAdmissao` (status por
   tipo exigido); o payload le `admissao_dados_gi`. **Regua obrigatoria COMPLETA nao implica campo
   preenchido:** a CTPS pode estar ENTREGUE e VALIDADA no Drive e `ctpsNumero` sair **NULO**, porque a
   unica porta de escrita de `admissao_dados_gi` e o **Portal**
   (`portal/portal-gi-gravacao.service.ts:73-75`). Admissao que nunca passou pelo Portal tem a linha
   inexistente e **os 26 campos de documento nulos**, com a regua 100% fechada.
2. **E os campos tem TTL de 30 dias** (`RETENCAO_DADOS_GI_MS`, `domain/portal-dados-gi.ts:59`). Quem
   preencheu em marco e e enviado em maio sai **magro**, sem nada falhar.

Qualquer protecao futura tem de olhar **a regua daquele cliente E a presenca do campo**. Ler so a
regua nao resolve nada. **Proposta, nao construcao (§A.31).**

## C5. FURO NOVO, o achado mais grave: a IDEMPOTENCIA NAO SOBREVIVE AO EXPURGO

Verifiquei linha por linha e **confirmo**:

- `gi_enviado_em` mora em `admissao_dados_gi` (`db/schema/tables.ts:2160`).
- `expurgarDadosGi` (`admissoes/expurgo.service.ts:84-97`) **apaga a linha INTEIRA** quando
  `expurgar_em` vence, **sem isentar linha carimbada**. O proprio comentario diz "apaga a linha
  INTEIRA".
- `jaEnviado` (`gi/gi-leitor.service.ts:243-250`) le **justo aquela coluna**.

**Encadeado:** envia, carimba com teto de 30 dias, 30 dias depois a linha e apagada, `jaEnviado` volta
a `false`, e **o segundo clique cria uma SEGUNDA pre-admissao na folha do fornecedor**. E a familia da
§A.33: dano silencioso, nada falha. O schema ja declara que o id do `FuncionarioSelecao` **nao e PII**
(`tables.ts:2161-2163`), entao o conserto e compativel com a minimizacao: o expurgo **isenta** linha
com `gi_enviado_em`, **ou** anula as colunas de PII em vez de deletar a linha. **Com teste.** O
`seguranca` nao aprova armamento com esse relogio ligado, e eu concordo.

## C6. A EXPOSICAO REAL DO ARMAMENTO, medida pela FUNCAO de verdade (condicao 3 dele)

Rodei `montarContratacaoGi` + `recusaDaContratacaoGi` do **dist servido**, alimentados pelas linhas
reais do banco e pelos **127 pares do `.env` de producao**. Nao recriei regua nenhuma, que e o que a
§A.19 proibe.

| desfecho se alguem clicasse HOJE | admissoes vivas |
|---|---|
| `GI_SALARIO_SEM_UNIDADE` | 51 |
| `GI_SEM_EMPRESA_FILIAL` | 10 |
| **PASSARIA** | **3** |

**As TRES que passariam tem `admissao_dados_gi` = 0 linhas**, ou seja, sairiam com **todos** os campos
de documento nulos. Sao pessoas reais, origem PANDAPE.

**E O NUMERO SE MOVE ENQUANTO SE MEDE:** era **1** em 02/10 e e **3** agora. Medido: **19 admissoes
criadas hoje, 3 na ultima hora**, e as vivas foram de 61 para 64 **durante esta sessao**. O webhook do
Pandape esta alimentando de verdade. A decisao de armar nao pode ser tomada contra um numero fixo.

## C7. A GRADE: o VETO, as sete condicoes e a medicao

O `seguranca` **VETOU** a reabertura como estava escrita no mapa ("reabrir, medir, reendurecer"), e o
motivo nao era a autorizacao do diretor: era o **recorte**. O furo central, que eu confirmei:
`_autorizar` (`grade.py:180`) recebia `params` e **nunca** o `corpo_consulta`, que a `ler()`
(`grade.py:413`) mandava direto para a rede. Em `GetAllJson` o filtro e o expand viajam **no corpo**,
entao a barreira olhava para o lado errado.

As sete condicoes foram implementadas, a medicao foi feita e a grade foi **reendurecida no mesmo
turno**. Autoteste verde antes (51 bloqueios / 30 leituras) e depois (52 bloqueios / 29 leituras), e a
porta provada fechada por tres caminhos sem tocar a rede. O **validador de corpo FICOU**, porque fechou
um furo real.

**VEREDITO DA MEDICAO:** `POST FuncionarioSelecao/GetAllJson` com corpo vazio devolveu HTTP 200 e
`[]`, igual ao `GET GetAll`. **Os registros de teste NAO estao escondidos por filtro: eles sairam
mesmo da tabela de pre-admissao.**
