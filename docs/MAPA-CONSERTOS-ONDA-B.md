# MAPA DE ALCANCE: os consertos de segurança da Onda B

Montado pelo coordenador ANTES do despacho (§A.39 passo 1). **O diretor APROVOU todas as
recomendações**; o que está aqui é o COMO, não o SE.

## 1. OS QUATRO CONSERTOS APROVADOS

| # | o quê | onde |
|---|---|---|
| A | o "enviar para admissão" passa a LIGAR a conferência de candidatura viva | `candidatos.service.ts` |
| B | a conferência vira ESTRUTURAL (obrigatória), não opcional com default silencioso | `candidatos.service.ts:1456` |
| C | a volta EM SELEÇÃO limpa a marca de posição herdada | `restaurar-candidatura.ts` |
| D | desvincular ALOCADO passa a exigir MASTER | `candidatos.service.ts` |
| E | a caixa de seleção da linha ENCERRADA fica desabilitada | `VagaPainelModal.tsx` |

**MANTIDO sem mexer:** a trava de capacidade do reabrir (decisão do diretor), o filtro de etapa com
"Fora Do Funil", o contador da aba com o total da vaga, e a contagem da vaga cancelada mostrando as
posições entregues (**já é o comportamento atual**, o `cancelar` grava `ocupacao.finalizadas`; nada a
construir, só confirmar).

## 2. A RÉGUA, na formulação REFINADA que o diretor aprovou

> **A fronteira ENCERRADA para VIVA tem DUAS portas declaradas, e nenhuma outra:**
> **(a) a RESTAURAÇÃO do reabrir**, com Master e escolha um a um, que **desfaz um gesto próprio e
> registrado**, e por isso **não pede aceite extra**;
> **(b) a REENTRADA que cria candidatura NOVA**, com aceite.
>
> A terceira porta (o "enviar para admissão" passando batido) **fecha**.

**NÃO é "sempre com aceite", e a diferença importa:** aplicar aceite ao reabrir COM ORIGEM seria
gravar ciência de uma guarda que não existiu, e **aceite que aparece em todo lugar deixa de
significar alguma coisa**. É o mesmo argumento que separou `REENTRADA` de `REABERTURA_SEM_ORIGEM`.

## 3. O ALCANCE MEDIDO DO CONSERTO D (o mais caro dos cinco)

Desvincular hoje não sabe quem é o usuário: as duas rotas têm `@CurrentUser()` mas passam **só
`user.id`** ao service (`candidatos.controller.ts:119,181`).

**O padrão da casa já existe e é o de receber o usuário inteiro:** `vagas.service.fechar(id, dto,
user: AuthUser)` e `.cancelar(id, dto, user: AuthUser)`. `registrarSaida` deve seguir o mesmo.

**Custo medido: 17 chamadas em 7 arquivos de spec**, todas passando `"user-1"` como terceiro
argumento. É mecânico, mas alcança spec de OUTRAS frentes (§A.26): a mudança é de assinatura, não de
comportamento delas, e **nenhum teste existente deve mudar de veredito**. Se algum mudar, é achado, e
para-se para reportar.

**A autoridade mora no SERVICE, nunca em `@Roles` na rota**, pelo mesmo argumento já escrito no
`fechar` e no `cancelar`: todo consultor desvincula quem está EM SELEÇÃO. O que vira de Master é
desvincular **ALOCADO**, porque alocado é **entrega**, e é por ali que o gate do fechamento era
contornável. Um `@Roles` no handler barraria o desvínculo normal do comum, que é regressão silenciosa.

## 4. O ALCANCE DO CONSERTO B, e por que ele é o que impede a reincidência

`mudarSituacaoOcupandoPosicao(..., opcoes?: { exigeCandidaturaViva: boolean })` tem **3 chamadores**:
`aprovar` (`:679`, liga), `finalizarPosicao` (`:738`, liga) e `registrarSaida` (`:971`, **não liga**).

O default silencioso é o defeito: quem escreveu o terceiro chamador **herdou** a ausência sem
decidir. Tornando o parâmetro **obrigatório**, o próximo a construir é forçado a escolher, e a
escolha fica escrita no ponto de chamada.

## 5. O QUE O CONSERTO A DEVOLVE DE GRAÇA

A tela **volta a dizer a verdade sozinha**. O aviso *"vão voltar na lista de falhas"* é hoje
verdadeiro no modo DESVINCULAR e falso no modo ENVIAR, **mesmo componente, mesmo texto**
(`AcoesEmMassaDaVaga.tsx:284` renderiza o mesmo modal para os dois). Com a conferência ligada, o
backend passa a recusar e a pessoa **realmente** volta na lista de falhas. **Nenhum texto precisa
mudar.**

## 6. O QUE NÃO ENTRA AGORA (registrado como pendente)

**A guarda perguntar pelo LADO USADO** em vez do lado escolhido (`candidatos.service.ts:1617`,
`posicao?.lado ?? ladoDaCandidatura(c.posicaoLado)`). Alcança o `aprovar`, que é código validado de
outra frente, e hoje afeta **0 linhas nas duas bases**. **Frente própria, decisão do diretor, NÃO
agora.**

## 7. RISCO DE REGRESSÃO A CONFERIR (§A.27)

Contagens e frentes que NÃO podem mudar de resposta: Clicksign, Pandapé, iFractal, lojas, grupos,
coluna Loja, e o A&S anterior. A suíte inteira roda uma vez no fim, e a prova é ela mais a leitura
das telas de contagem.
