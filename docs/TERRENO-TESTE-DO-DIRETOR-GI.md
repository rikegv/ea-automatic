# Terreno para o teste do diretor: ele cria, ele percorre, sem roteiro

Ele decidiu fazer o teste **em producao**, com os **documentos reais** e o **CPF real** dele,
percorrendo como um usuario faria, **sem roteiro de proposito**, para ver **onde o sistema deixa
errar**. A fabrica **nao cria a admissao**: so prepara o terreno e diz o que esperar.

Medido contra a producao em 06/10/2026.

## 0. A DEPENDENCIA QUE PRECISA SER DITA PRIMEIRO: o teste ainda NAO PODE RODAR

**O gatilho automatico nao esta publicado.** O artefato servido e de 02/10 e o gatilho de la e
`async enviar(_admissaoId)`, com o underscore que prova que o id e ignorado: e stub, nao envia.
Medido: zero ocorrencias de `enviarComGuardas`, `transicionou` e `GI_ADMISSAO_NAO_OPERAVEL` no `dist`.

**Consequencia:** se ele fizer o teste **hoje**, a admissao e criada, o Portal funciona, a IA audita, a
auditoria fecha, e **nada nasce no GI**, porque o codigo que envia nao esta no ar. O teste terminaria
sem a unica prova que ele quer ver.

**O mesmo vale para a retencao:** o `apiSincAdmissaoDigital` entra pelo montador do payload. Sem
publicar, o campo nao e emitido, o GI aplica o default `false`, e o registro **some em menos de 10
minutos**, que e justamente o problema que ele quer evitar.

**Logo o teste depende de DUAS coisas, nenhuma delas minha:** (a) o `main` voltar a compilar, hoje
quebrado por um commit do Portal que levou o uso sem a declaracao; (b) a publicacao, que e o **ato 2**
e tem restart proprio por exigencia do `seguranca`.

## 1. O QUE O SISTEMA FAZ SE ELE DEIXAR CLIENTE OU CARGO VAZIO: BLOQUEIA NA CRIACAO

Medido no DTO (`admissoes/dto/create-admissao.dto.ts:262-268`): **os dois sao obrigatorios**.

| campo | validacao | o que ele ve |
|---|---|---|
| `codCliente` | `@IsString()`, sem `@IsOptional()` | erro de validacao, nao cria |
| `cargoId` | `@IsUUID()` com mensagem propria | **"Selecione um cargo valido."** |

**Isso NAO contraria a regra 5 do §A.3** ("admissao e criavel com obrigatorios vazios"): cliente e
cargo sao **estruturais**, porque e por `(cliente + cargo)` que a **regua documental** resolve. Sem
eles nao existe regua, e sem regua nao existe auditoria. O resto do wizard (salario, data, centro de
custo) **aceita vazio** e vira sinalizador, nao bloqueio.

## 2. ONDE O SISTEMA DE FATO DEIXA ELE ERRAR, e e aqui que o teste vai doer

**Nao e o par empresa/filial.** Medido: dos **251** vinculos ativos, **250 tem par conhecido** entre os
127 instalados. Sobra **um** (um FOPAG). Qualquer cliente que ele escolher, o par quase certamente
serve.

**O erro de verdade e o TIPO DE CONTRATO nao casar com o vinculo do cliente.** E a medicao que decide:

| medicao | resultado |
|---|---|
| clientes com **exatamente UM** tipo de vinculo | **251 de 251** |
| clientes com dois ou mais tipos | **ZERO** |

| tipo de vinculo | clientes |
|---|---|
| TEMPORARIO | **188** |
| TERCEIRO | 31 |
| FOPAG | 28 |
| INTERNO | 3 |
| ESTAGIO | 1 |

**Cada cliente aceita UM tipo de contrato e mais nenhum.** Se ele escolher um cliente de 188 (que e
TEMPORARIO) e marcar o contrato como **Terceirizado**, a resolucao de empresa/filial devolve **null** e
o envio ao GI e **RECUSADO** com `GI_SEM_EMPRESA_FILIAL`. Escolhendo um cliente ao acaso e marcando
Terceirizado, a chance de errar e de cerca de **tres em quatro**.

**E o sistema deixa ele errar em silencio:** a admissao **e criada**, a regua nasce, o Portal funciona,
a IA audita, a auditoria fecha, e **so no fim** o envio recusa. Nenhuma tela avisa antes. **Isso e
exatamente o que ele quer descobrir**, e por isso **nao vou travar o caminho** (ele pediu).

## 3. AS OUTRAS TRES RECUSAS QUE ELE PODE ENCONTRAR, e a mais provavel de todas

| desfecho | o que faltou | quao provavel |
|---|---|---|
| **`GI_SALARIO_SEM_UNIDADE`** | o salario foi digitado mas **ninguem declarou** se e MENSAL ou HORA | **a mais provavel: 51 de 64 admissoes vivas param aqui** |
| `GI_SALARIO_HORISTA_SEM_JORNADA` | unidade HORA sem a jornada mensal e semanal | so se ele escolher HORA |
| `GI_CLIENTE_NAO_RESOLVIDO` | `cod_cliente` nao vira inteiro valido | raro |
| `GI_ORIGEM_NAO_AUTORIZADA` | a admissao veio do webhook do Pandape | **nao alcanca o teste dele**: criada na plataforma, a origem e `MANUAL` |

**A unidade do salario e o degrau mais escorregadio da esteira**, e ele vai passar por ele.

## 4. O CAMINHO, passo a passo, sem roteiro de execucao

1. **Nova Admissao** (wizard): cliente, cargo, candidato. **Atencao ao tipo de contrato** (secao 2).
2. **Portal: Links** (`/admin/portal-links`): emite o link daquela admissao. Conferido: o menu **esta
   registrado** na tabela de producao.
3. **O link no celular dele:** dados, endereco e os documentos reais. A IA audita cada um.
4. **A conferencia humana** fecha a regua. **E nesse instante que o envio dispara**, sem clique.
5. **No GI:** procurar o nome em **pre-admissao** (`FuncionarioSelecao`). Com o `apiSinc` ligado, o
   registro **fica esperando** e nao some.
6. **Ele apaga** pela tela do GI quando terminar. A nossa ferramenta de leitura e so de consulta, de
   proposito.

## 5. O QUE A FABRICA PRECISA DELE, e sao duas coisas

1. **Nada sobre cliente e cargo:** ele disse que **nao vai escolher** de proposito, e a secao 2 diz o
   que acontece. Nao vou escolher por ele.
2. **A autorizacao da publicacao** (secao 0), sem a qual o teste nao tem como mostrar o GI.

## 6. §A.6 com o CPF real dele

O dado e dele e o consentimento e dele, e ele sabe que vira **pre-admissao real na producao do
fornecedor**, porque o GI **nao tem ambiente de teste**. O que a fabrica garante: o CPF **nao entra em
log** (os desfechos sao codigos fechados, sem PII), **nao entra no DIARIO** e **nao entra em print**.
Se alguma tela da trilha precisar de imagem depois, o recorte deixa o CPF fora do quadro (§A.46).
