# Mapa de alcance: o expurgo, os 4 campos que faltam, e o de/para de cliente

Investigação do coordenador ANTES de despachar (§A.27/§A.39 passo 1). Medido contra o contrato do GI
e contra a PRODUÇÃO do EA em 01/10/2026.

## 1. Os nomes dos campos no contrato, e uma COLISÃO que daria erro grave

| o que o diretor pediu | campo do GI | tipo |
|---|---|---|
| SALARIO | `salario` | `double`, default `0` |
| DATA DE ADMISSAO | `dataAdmissao` | `date-time`, default nulo |
| VINCULO | `vinculo` | 1 caractere, **18 valores documentados** |
| CLIENTE | `codigoEmpresa` + `codigoFilial` | `int16`, **os dois sem default** |

**A COLISÃO: o GI TEM um campo chamado `tipoContrato`, e ele NÃO é o nosso.** No GI,
`tipoContrato` é **`D` Determinado / `I` Indeterminado** (default `I`). O nosso `tipo_contrato`
(Temporário, Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz) mapeia para o **`vinculo`**. Quem
ligasse um no outro pelo nome gravaria lixo num campo de folha sem nenhum erro aparecer.

## 2. A dúvida do `7`: a documentação responde, e a proposta muda

A `description` do `vinculo` traz os 18 valores, e os dois que importam são:

- **`1` Contrato CLT**
- **`7` CLT Prazo Determinado**

E o GI tem o `tipoContrato` **`D` Determinado / `I` Indeterminado** como campo SEPARADO. Então a
estrutura do GI separa o VÍNCULO do PRAZO, e a leitura que isso sugere é:

> **contrato com prazo definido = `vinculo` 7 + `tipoContrato` `D`; sem prazo = `vinculo` 1 +
> `tipoContrato` `I`.**

**Quem diz se há prazo é `dados_vaga_folha.tempo_contrato`** (a coluna existe ali, não em `admissoes`,
e guarda 30 a 270 dias). **Esta é a pergunta para o diretor**, porque muda o código que vai para a
folha e a fábrica não decide regra de folha. A proposta completa está no §5.

Nota: **`Temporário` não entra nessa dúvida.** Ele tem código próprio (`4` Temporário), que é o regime
de trabalho temporário (Lei 6.019), não CLT a prazo. Idem `Estágio` (`J`, Nova Lei 11.788) e
`Jovem Aprendiz` (`H`, Menor Aprendiz Lei 10.097).

## 3. O DE/PARA DO VÍNCULO JÁ EXISTE, e a minha proposta aqui estava ERRADA

> **CORRIGIDO. A primeira redação desta seção propunha construir uma tabela literal exaustiva com
> normalização e fail-closed, e perguntava ao diretor o que fazer com `ESTA. FOPAG`. As duas coisas
> estavam erradas: a tabela JÁ EXISTE, e a pergunta JÁ FOI RESPONDIDA por ele.** Achado do
> `seguranca`, conferido por mim no código.

`apps/backend/src/domain/vinculo.ts` já tem exatamente o que eu ia mandar construir:

- o `DE_PARA` (`:53`) cobre `temporario`, `temp`, `terceirizado`, `terceiro`, `terc`, `estagio`,
  `esta`, `interno`, `inter`, `fopag`, `jovem aprendiz`, `aprendiz`, `apren`;
- o `norm()` (`:37`) faz a MESMA normalização que eu propus: NFD, acento fora, minúsculas, e o ponto
  final da abreviação fora;
- o `tipoServicoDeContrato` (`:74`) é fail-closed, devolve `null` em grafia desconhecida;
- e o comentário dele **registra a decisão do diretor sobre `ESTA. FOPAG`**: fica como está, não se
  adivinha. **Eu ia gastar o turno do diretor com uma decisão que ele já tomou.**

Nas **85 admissões vivas** só há quatro valores, todos limpos (Temporário 74, Terceirizado 8,
Estágio 2, Fopag 1). As 67 vazias são pendência obrigatória que já existe, não assunto desta frente.

**A forma correta é composição em dois saltos, não uma segunda tabela:** `tipo_contrato → TipoServico`
**reusando** `tipoServicoDeContrato`, e `TipoServico → código do GI` como mapa novo de 6 entradas,
`Record<TipoServico, …>` FECHADO sobre `TIPOS_SERVICO`, para que tipo novo no enum **não compile** sem
decisão humana.

**ARMADILHA registrada:** NÃO reusar `vinculoDaAdmissao` (`vinculo.ts:97`) nem `resolverVinculoId`.
Os dois devolvem `null` quando o cliente tem **menos de dois** vínculos ativos (`:102`), **de
propósito**, porque servem para decidir se a TELA precisa perguntar. Isso é 233 de 234 clientes.
Reusar aquele caminho zeraria ~90% das resoluções com aparência de "o dado não existe".

## 4. A FILIAL EXISTE NO EA, e esta seção também estava ERRADA

> **CORRIGIDO. A primeira redação dizia "A FILIAL NÃO DERIVA DE NADA" e concluía que a frente não
> entraria em produção sem o diretor fornecer a tabela. É FALSO.** Achado do `seguranca`, medido por
> mim na produção.

`cliente_vinculos` tem, lado a lado, **`empresa_codigo`** (`varchar(10)`), **`filial`**
(`varchar(20)`), `tipo_servico` e `ativo`. Medido na produção:

- **244 vínculos, 243 com filial preenchida, 25 empresas distintas, 9 filiais distintas**;
- os pares são numéricos pequenos, exatamente o que o `int16` do GI espera: **`1/4` em 165 clientes**,
  `2/4` em 29, `1/2` em 7, `1/5` em 5, mais caudas (`29/4`, `33/2`, `44/0`, `43/0`);
- **e eles batem com os pares REAIS do GI**: a empresa 1 filial 4 existe lá, com `nomeFantasia`
  "SOULAN";
- há `unique(cod_cliente, tipo_servico)`, então a resolução por tipo é determinística.

**O caminho que eu havia escolhido, `clientes.empresa_grupo`, é a fonte PIOR:** é o nome por extenso,
em 114 de 251 clientes, e **não tem filial nenhuma**. A melhor estava a um join de distância.

**O que continua pendente de verdade, e é muito menor:** (a) os casos que não casam tipo; (b) **o
significado da filial `0`**, que aparece na base e é indistinguível do `0` do registro órfão, logo é
decisão do diretor antes de qualquer disparo; (c) 1 vínculo com filial nula; (d) os dois campos são
`varchar` livre e vão para `int16`: validar `^(?:0|[1-9]\d*)$` e a faixa **antes** de sair, e recusar
o resto.

**A recusa continua valendo:** sem empresa E filial resolvidas e validadas, o envio é RECUSADO com
motivo fechado, nunca `0`.

## 4B. O SALÁRIO NÃO TEM UNIDADE, e isso é bloqueio de disparo

Achado do `seguranca`, medido por mim: **7 admissões VIVAS têm salário `9,34` (2) e `10,90` (5)**, que
são valores de HORA, e na base inteira há **72 linhas com salário abaixo de 100**. E
`dados_vaga_folha` **não tem nenhuma coluna de unidade**: só `salario numeric(12,2)`.

No contrato do GI, **`tipoSalario` tem `default: 'M'` (Mês)** e existe um campo separado
`salarioHora`. Então enviar `salario` sem declarar a unidade faz **as 7 horistas entrarem na folha
como salário MENSAL de R$ 9,34 e R$ 10,90**. É a família da §A.33: o GI responde `sucess: true`,
o EA carimba o envio, nenhum alarme toca, e o erro aparece no holerite.

**Heurística por faixa de valor está VETADA** (casamento aproximado sobre remuneração). Ou o diretor
define a unidade, ou o envio do salário é recusado quando ela não estiver declarada.

## 5. O que muda no ALCANCE, e o invariante que será ROMPIDO

**`montarFuncionarioSelecao` tem uma allowlist cujo propósito declarado é impedir que SALÁRIO e
situação trabalhista atravessem** (§A.6), e há teste exigindo isso
(`portal/portal-dados-gi.contrato.tester.spec.ts`). O diretor autorizou enviar salário, então **o
invariante muda de "só dado de pessoa" para "dado de pessoa MAIS os quatro campos de contratação
nomeados"**. Isso precisa ser reescrito explicitamente no código e no teste, nunca contornado em
silêncio, e passa pelo `seguranca`.

**`GiLeitorService.lerPessoa` hoje lê `candidatos` + `admissao_dados_gi`.** Passa a precisar de
`admissoes` (`data_admissao`, `tipo_contrato`, `cod_cliente`) e `dados_vaga_folha` (`salario`,
`tempo_contrato`). Leitura mais larga, e salário é dado sensível de outra natureza.

## 6. O expurgo: a correção é segura nos dois consumidores, e tem um detalhe que passaria batido

`expurgarDadosGi` dá `DELETE` na linha inteira, e `gi_enviado_em` mora nela. Virando `UPDATE` que
anula o PII e preserva a marca:

- **`portal-documentos.service.ts:190`** lê a linha e itera `CAMPOS_GI` montando a lista de
  confirmados. Com o PII anulado a lista sai **vazia**, que é exatamente o que ele já devolve quando a
  linha não existe (`if (!linha) return []`). **Comportamento idêntico, sem regressão.**
- **`portal-gi-gravacao.service.ts:73`** já grava por `onConflictDoUpdate`, então linha sobrevivente
  anulada é só atualizada se o candidato reconfirmar. **Sem regressão.**
- **O DETALHE: o `UPDATE` tem de ANULAR o `expurgar_em` também.** A cláusula é
  `isNotNull(expurgar_em) AND expurgar_em <= agora`; mantendo o valor, a linha casaria em **todo ciclo
  para sempre**, o log contaria a mesma linha eternamente e a operação deixaria de ser idempotente.
  Anular o `expurgar_em` é a própria marca de "já expurgada".

---

## 7. DEFEITO DE CONTRATO NO PORTAL, e ele é bloqueador de publicação da Fase 2

Achado pelo agente `frontend` nesta frente e **provado por execução**, não por leitura. Não está no
escopo da OST e NÃO foi consertado: é decisão do diretor, porque mexe na trava do veto V12.

**O que o candidato confirma no Portal não persiste.** As duas pontas de `POST /portal/dados-gi` não
casam:

- a tela envia `{ campo, valor }` (`frontend/src/lib/portal-dados-gi.ts`, e
  `app/portal/page.tsx:704` mapeia explicitamente para `({ campo, valor })`, descartando o rótulo);
- o domínio exige quatro campos e filtra por `confirmadoPorHumano === true`
  (`domain/portal-dados-gi.ts:78`);
- o serviço repassa os campos **crus**, sem carimbar (`portal/portal-gi-gravacao.service.ts:47`), e o
  DTO só valida `IsArray` (`portal.dto.ts:61`), então **o TypeScript não pega**.

`undefined !== true`, logo **todo campo cai em `descartados`**. A linha nasce com os carimbos
(`confirmado_em`, `expurgar_em`) e **sem valor nenhum**, e `rotulosAceitos` sai vazio, então **a trilha
do aceite também fica vazia**. A tela diz que salvou.

**A prova:** rodando `montarGravacaoDadosGi` com o corpo exato que a tela monta, `valores` sai `{}` e
os campos vão para `descartados`; com o booleano, persiste.

**Nada foi perdido ainda, e é por isso que ninguém viu:** `admissao_dados_gi` e
`portal_dados_gi_aceites` têm **zero linhas** nas duas bases. A coleta nunca foi exercitada. **O
primeiro candidato que preencher perde tudo, em silêncio.**

### O critério que levanta o gate, verificável em uma linha

```sql
select count(*) total, count(confirmado_em) confirmadas,
       count(coalesce(rg_numero, nacionalidade, end_cep, filiacao_nome_mae)) com_valor
from admissao_dados_gi;
```

Hoje: `0 | 0 | 0`. **E aqui mora uma armadilha que eu quase deixei passar no próprio critério:**

- **a query é DETECTOR do defeito, NÃO prova do conserto.** `confirmadas > 0` com `com_valor = 0`
  **prova que está quebrado**. Mas `0 | 0 | 0` é **SILÊNCIO**, não aprovação: ninguém exercitou a
  coleta. Quem ler a tabela vazia como "não há confirmação sem valor, então está ok" conclui o oposto
  do que a medição permite, e o gate cairia **por omissão**.
- **a prova do conserto é AFIRMATIVA e exige exercitar:** uma confirmação de verdade tem de produzir
  valor, ou seja `com_valor` tem de acompanhar `confirmadas`. Isso se faz na homologação com dado
  sintético, que a §A.43 autoriza sem pedir nada a ninguém: preenche um candidato sintético pela tela,
  roda a query, e se a linha vier com os carimbos e sem valor, o defeito está lá.

Mede o efeito e não a intenção, que é o que serve de gate, desde que lido nos dois sentidos.

### Combinado entre frentes, 01/10/2026

A sessão da **Fase 1 do Portal** (entrada por e-mail) conferiu o alcance e confirmou que a publicação
dela **não** torna a coleta alcançável por candidato real: a Fase 1 é homologação em loopback, e o
endereço público é a Fase 2, que ainda não existe. A frente dela não toca `POST /portal/dados-gi`.

**Fica registrado como bloqueador DURO da Fase 2:** a trilha de coleta não pode ficar alcançável por
candidato real antes do conserto de contrato. **A decisão do lado a consertar é do diretor** (a tela
passa a mandar `rotulo` + `confirmadoPorHumano: true`, ou o serviço carimba `true`, já que chegar
naquela rota é o próprio gesto do candidato), e passa pelo `seguranca`, porque é a trava do V12.

---

# ADENDO 02/10/2026: a correcao da secao 6 foi DESCONSIDERADA pelo diretor, e o motivo e um fato novo

A secao 6 acima propoe trocar o `DELETE` do expurgo por um `UPDATE` que anula o PII e preserva a
marca. **ISSO NAO SERA FEITO. `expurgo.service.ts` fica como esta, e tocar nele esta proibido.**

## O que a auditoria levantou, e estava tecnicamente correto

`gi_enviado_em` (a marca de idempotencia do envio ao GI) mora na MESMA linha de
`admissao_dados_gi` que o expurgo apaga por TTL de 30 dias, e `jaEnviado` le essa linha. Medido e
confirmado: as duas colunas estao na mesma tabela, e o expurgo da `DELETE` na linha inteira. Logo,
30 dias depois de um envio a marca desaparece e uma retentativa **refaria o POST**.

## O FATO NOVO, que o diretor trouxe e que muda a conclusao

**O GI JA TEM TRAVA ANTI-DUPLICATA POR CPF.** Tentar cadastrar o mesmo CPF duas vezes faz o
fornecedor avisar que o funcionario ja esta cadastrado, e **ele nao duplica**.

Entao a marca sumir com o expurgo **nao cria duplicata na folha**: a nossa marca economiza uma
chamada, mas **quem garante a unicidade e o proprio GI**, no sistema que e o dono do cadastro. O
desfecho de uma retentativa pos-expurgo e a recusa do fornecedor, nao um segundo funcionario.

**A TRAVA ANTI-DUPLICATA E DO GI, NAO DA NOSSA MARCA.** Esta e a linha a lembrar, e e a razao de o
expurgo poder apagar a ficha inteira normalmente, como ele faz hoje, preservando a §A.6 (o PII do GI
nao fica retido alem do TTL).

## O limite deste adendo, para nao virar licenca

- Isto NAO dispensa a idempotencia do EA: `jaEnviado` continua valendo e continua sendo a primeira
  porta. O que se dispensa e o CONSERTO do caso "marca expurgada".
- Isto vale para DUPLICATA. Nao vale para nenhum outro desfecho de envio.
- O fato e **declarado pelo diretor a partir da operacao**, e o EA nao o exercitou. Medi-lo custaria
  um segundo envio com um CPF sintetico ja cadastrado (por exemplo o do registro 27), e a resposta
  esperada e a recusa do fornecedor. Fica oferecido, nao feito: ninguem pediu.

*(Decisao do diretor, 02/10/2026, na OST de fechar a ponte do GI.)*
