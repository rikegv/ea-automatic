# Veto do `GI_DISPARO_ARMADO` (o AUTOR do envio): RESOLVIDO em 02/10/2026

Registro de encerramento, a pedido do diretor. Fica aqui para a proxima auditoria nao reabrir o
ponto, e para que o motivo nao dependa de memoria de sessao.

## O que o veto dizia

O gatilho manual do envio ao GI recebe o autor e **nao o persiste**:

```
apps/backend/src/gi/enviar-para-gi.service.ts:200
async enviarManual(admissaoId: string, _autorId: string): Promise<GiEnvioResultado>
```

O `_autorId` chega do `@CurrentUser()` (`enviar-para-gi.controller.ts:32`, rota restrita a
`MASTER`/`SUPER_ADMIN`) e morre no parametro. O EA carimba **que** enviou (`gi_enviado_em` e o id do
`FuncionarioSelecao`, em `marcarEnviado`), e **nao carimba QUEM**. A objecao era de trilha: envio para
a folha de um terceiro e acao de consequencia, e trilha sem autor nao responde "quem mandou".

## A decisao do diretor, por escrito

**O GI carimba quem enviou do lado dele.** A autoria existe, e mora no sistema de destino, que e o
sistema de registro daquele dado. O EA nao duplica o carimbo.

Isso e coerente com o resto da frente: a credencial do EA no GI e **uma**, a rota e restrita a
`MASTER`/`SUPER_ADMIN`, e o desfecho de cada tentativa fica no log do EA por MOTIVO
(`GI_ENVIADO`, `GI_JA_ENVIADO`, `GI_MONTADO_NAO_DISPARADO`, as recusas do passo 6), sem PII.

## O que FICA no codigo, e por que nao se mexe

O `_autorId` **permanece no parametro, com o underscore**. Nao e esquecimento: e o ponto de encaixe
pronto, caso o diretor um dia queira a trilha tambem no EA (a tela da peca 3 ja manda o autor).
Remover o parametro mexeria no controller e no contrato por nada (§A.14), e o underscore e justamente
a convencao que declara "recebido e deliberadamente nao usado".

## O limite deste registro

Isto encerra **a autoria do disparo**, e so ela. NAO encerra, e segue valendo inteiro:
- a trava `GI_DISPARO_ARMADO` em si (ligar/desligar e decisao do diretor, §A.9);
- as guardas duras do passo 6 encostadas no POST (empresa/filial, par conhecido, salario, unidade,
  jornada), que sao o que impede dado errado de chegar na folha;
- a §A.6 sobre o payload: PII e salario nao sao logados, nao sao retornados e morrem no escopo do
  metodo.

*(Decisao do diretor, 02/10/2026, na OST de fechar a ponte do GI.)*
