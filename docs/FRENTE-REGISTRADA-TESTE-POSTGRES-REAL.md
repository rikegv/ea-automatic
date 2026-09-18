# FRENTE REGISTRADA: teste com Postgres real

**Decisão do diretor, 18/09/2026: vira frente própria. REGISTRAR PARA DEPOIS, não construir agora.**
§A.11: sem travessão.

## O que é

**Não existe, neste repositório, nenhum teste que execute contra um Postgres de verdade.** Sem
testcontainers, sem pg-mem, sem serviço de banco no CI, sem `setupFiles`, sem spec que abra conexão.
Toda a suíte roda contra dublês.

## Por que virou frente: dois incidentes da MESMA família

**Primeiro, a régua.** Um `ON CONFLICT` que não inferia índice parcial **derrubou a tela da régua em
produção**. Nenhum banco fingido pegaria: o defeito só existe porque o Postgres real recusa a
instrução. O remendo foi `regua-on-conflict.spec.ts`, que parece conectar e não conecta (aponta para
um endereço morto e usa `.toSQL()`): é teste **por forma**, afirmando sobre o texto compilado.

**Segundo, o `encerrarAusentes` da ingestão do Pandapé, 18/09/2026.** A instrução
`<> all(${ativos}::text[])` **nunca executou**. O drizzle não recusa o array, ele o **ESPALHA**:
vira escalar com 1 id (`malformed array literal`) e construtor de LINHA com 3
(`cannot cast type record to text[]`).

**O número que dói: 3.680 testes verdes conviveram com a instrução central da frente sendo incapaz
de rodar.** E o efeito não era cosmético: sem o encerramento, a vaga espelhada nunca encerra,
`encerrada_em` fica nulo para sempre, e toda pessoa viva dentro dela fica **protegida do expurgo
indefinidamente**, com CPF, e-mail, telefone e nascimento. O furo teria continuado aberto **com
carimbo de corrigido**, que é pior do que aberto.

**A armadilha que fecha o argumento:** o MESMO texto (`ANY(...::uuid[])`) existe em
`db/regras-esteira-vivas.ts` e **funciona**, porque ali o cliente é o `Sql` do postgres-js direto,
que liga arrays nativamente. **Leitura de código não distingue os dois casos.** Só execução distingue.

## O que a frente precisa entregar

- um caminho de teste que execute contra Postgres de verdade, isolado do banco de produção e do de
  homologação, criado e derrubado pela própria suíte;
- cobertura das instruções que só o banco recusa: `ON CONFLICT` com índice parcial, bind de array,
  CTE que modifica dado, CHECK, FK `restrict` contra `cascade`, e cast;
- a régua de quando um teste PRECISA de banco real, para não virar obrigação de todos.

## O que NÃO se perde

O teste **por forma** continua valendo e fica. Ele é o que a casa usou nos dois incidentes e
funciona: `retencao-lgpd.tester-fake.ts` e os contratos da ingestão afirmam sobre o texto EXECUTADO,
com mutantes. O ponto é que ele só pega o defeito que alguém já conhece; o banco real pega o que
ninguém previu.

## Estado

**Registrada, aguardando o diretor acionar.** Não construir sem o aval dele.
