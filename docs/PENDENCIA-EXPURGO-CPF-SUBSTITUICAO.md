# PENDÊNCIA REGISTRADA: o expurgo do CPF de substituição derruba o backend inteiro

**Status:** registrada, aguardando o diretor acionar. **OST PRÓPRIA, separada** da frente da tela
unificada de vagas (decisão do diretor, 08/09/2026). Não misturar.

**Gravidade:** alta no tema, baixa na urgência. Não é regressão nova, é defeito antigo e latente.

---

## O QUE É

`apps/backend/src/admissoes/expurgo.service.ts:28-29` é a varredura que expurga o CPF da pessoa
substituída 48h após a assinatura do contrato (§A.3, regra 10, e §A.6).

```ts
onModuleInit(): void {
  void this.expurgar();
  this.timer = setInterval(() => void this.expurgar(), ExpurgoService.INTERVALO_MS);
```

O método `expurgar()` **não tem try/catch**, e as duas chamadas usam `void` **sem captura**.

## POR QUE ISSO DERRUBA O BACKEND INTEIRO

Três fatos, todos medidos nesta máquina e não deduzidos:

1. **Não existe handler global** de `unhandledRejection` nem de `uncaughtException` em
   `apps/backend/src` nem no `package.json`. Confirmado por busca.
2. **O Node é o v20.20.2**, e desde a versão 15 uma rejeição não tratada **mata o processo**.
3. **O serviço roda com `Restart=always`** (`systemd --user`). Conferido no unit.

Somando os três: qualquer falha da varredura vira **crash-loop**. E como o Nest chama o
`onModuleInit` **antes** de o servidor HTTP começar a escutar, o sintoma não é "uma requisição
falhou", é o **backend nunca ficar disponível**, levando junto Esteira, Admissões, Clicksign e o
tick do cron, que não têm nada a ver com admissão.

## COMO ELE FOI ENCONTRADO

Não foi procurado. O agente `seguranca` auditava a frente da tela unificada de vagas e achou o
**mesmo padrão** em `as/candidatos/retencao-candidatos.service.ts`, onde ele era alcançável de
imediato (a varredura passou a citar valores de enum que o banco podia não ter). Aquele foi
corrigido e travado em teste. Ao corrigir, o agente `backend` varreu os demais serviços de varredura
do sistema e achou este.

**Os outros seis não são o mesmo caso:** `staging-purge`, `exame-scheduler`, `pandape-scheduler`,
`clicksign-scheduler`, `vt-coleta-scheduler` e `reconciliacao-drive-scheduler` têm try/catch interno.
Este é o único gêmeo.

## POR QUE NÃO FOI CORRIGIDO JUNTO

§A.14 e §A.31: está fora do escopo da OST em curso, é código validado de outra frente, e o diretor
decidiu explicitamente que vai em OST própria.

## O CONSERTO, QUANDO FOR ACIONADO

É o mesmo recorte de sete linhas já aplicado e auditado no arquivo vizinho: as duas chamadas passam
por um método privado que captura a rejeição e a transforma em **ERRO no log**, com o processo
seguindo. A referência está em `as/candidatos/retencao-candidatos.service.ts`, e o teste de lá é
**comportamental** (instala um listener de `unhandledRejection` e afirma sobre o que NÃO chegou
nele), com seis mutações mortas pela auditoria.

**§A.6 no log:** só a mensagem do erro. Fora ficam o `detail`, a `query`, os `params` e o stack do
Postgres, que é justamente onde o valor violador viaja, e aqui esse valor **é um CPF**.

**Ressalva que o auditor deixou e vale herdar:** com a captura, a falha deixa de ser barulhenta e
passa a ser uma linha de log. Não há carimbo nem indicador que denuncie "o expurgo não roda desde
tal dia", e a obrigação é de LGPD. Vale avaliar um carimbo de última varredura bem-sucedida, no
espírito do `clicksign_notificado_em` da §A.5.
