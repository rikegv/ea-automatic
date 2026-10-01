# Mapa de alcance: a unidade do salário, a auditoria do salário, e a colisão do `tipoContrato`

Investigação do coordenador ANTES de despachar (§A.27/§A.39 passo 1), medida contra a produção em
01/10/2026.

## 1. O achado que decide o tamanho da frente: `SALARIO` JÁ ESTÁ na régua unificada

`pendenciasObrigatorias` (`domain/admissao.ts:178`) já tem `cobra("SALARIO", ...)`. E a §A.19 diz que
essa função é a **fonte única**: o `sinalizador_preenchimento` deriva dela, e a coluna do Gerenciador,
o KPI, o radar e o modal concordam por construção.

**Então pôr a UNIDADE na régua não é acrescentar um campo: é mexer em contagem de várias telas de uma
vez**, que é exatamente o acidente da §A.27 (desmarcar uma exigência quebrou a contagem de três telas
e 56 admissões passaram a ser contadas duas vezes).

**O estouro medido, e o recorte muda tudo:**

| recorte | admissões que virariam pendentes |
|---|---|
| TODAS as que têm salário | **2.595** |
| só as **VIVAS** (`EM_ADMISSAO` / `BANCO_AGUARDAR`) | **84** |
| concluídas (`ADMISSAO_CONCLUIDA`) | 1.690 |
| encerradas (`DECLINOU` / `RESCISAO`) | 821 |

> **CORRIGIDO, e a primeira redação continha uma afirmação FALSA minha.** Eu escrevi que o recorte
> "não é decisão nova" porque a §A.19 "já estabeleceu". **O recorte NÃO EXISTE EM CÓDIGO.** A §A.19
> descreve o recorte de uma fila **que ainda não foi construída**, e nenhum caminho de pendência filtra
> farol: `regua/pendencias-lote.ts:80` filtra só por lista de ids, `regua/sinalizador.repo.ts` recomputa
> para qualquer id, e a coluna do Gerenciador passa os ids da página inteira, de todos os faróis.
> `ehFarolVivo` **existe** (`domain/admissao.ts:79`) com o comentário "só estas seguem a régua
> unificada", **e não é usado em caminho de pendência nenhum**: é intenção documentada, não régua
> aplicada. Achado do `seguranca`, conferido por mim.

**Então o recorte tem de ser CONSTRUÍDO**, num lugar só e provado por teste, nunca herdado. Sem ele, o
estouro real é **1.690 admissões CONCLUÍDAS virando pendentes na coluna, sem nenhum recompute**, porque
a coluna lê a régua ao vivo. É o acidente da §A.27 com 1.690 linhas em vez de 56.

**E um achado que muda o desenho da tela:** **55 concluídas têm salário abaixo de 30**, horistas que
**já foram para a folha**. Então o seletor tem de ser **editável em QUALQUER farol**, mesmo que a
pendência só cobre das vivas. Pendência e editabilidade são coisas diferentes, e o recorte "só vivas"
aplicado aos dois tiraria justamente o caminho de consertar o que já está errado.

## 2. Onde o salário é preenchido hoje: TRÊS telas, não uma

- **`app/(app)/nova/page.tsx`**, o wizard de Nova Admissão (o consultor cria);
- **`app/(app)/liberacao/page.tsx`**, a Liberação;
- **`components/gerenciador/EditAdmissaoModal.tsx`**, o lápis, compartilhado por **Gerenciador e
  Esteira** (as duas superfícies de quem cadastra).

Mais `lib/salario.ts`, que já é a casa compartilhada da máscara e do formato pt-BR do valor, com teste
de idempotência próprio. **É a casa natural do rótulo da unidade**, para a tela não ter três
implementações do mesmo seletor.

**Consequência: o seletor tem de entrar nas três**, senão a unidade é declarável num caminho e não nos
outros, e a guarda do envio recusaria admissão que o consultor jurava ter preenchido.

## 3. A regra permanente, e a proposta de onde ela morde

> **NENHUM SALÁRIO É GRAVADO NA FOLHA SEM AUDITORIA DO TIME.** O envio ao GI não leva salário que
> ninguém conferiu. *(Decisão do diretor.)*

**Proposta: a DECLARAÇÃO DA UNIDADE É o ato de auditoria, e não dois mecanismos.** Quem escolhe "por
hora" ou "mensal" está, nesse gesto, afirmando que olhou o valor. Então a marca é uma só:
`salario_unidade` mais `salario_auditado_em` e `salario_auditado_por` (autor), carimbados juntos.

**Onde ela morde, e é no único lugar que não dá para contornar:** a guarda do envio, encostada no
`POST`, no mesmo molde das que já existem. Sem unidade declarada, recusa com motivo fechado
(`GI_SALARIO_SEM_UNIDADE`), e o salário não sai. Isso é melhor que um passo de conferência na tela,
porque passo de tela se pula e guarda no `POST` não.

**Por que o FAROL não serve para isso:** o farol é derivado e tem valores manuais pegajosos (§A.3), e
pendurar auditoria de salário nele misturaria estado de processo com conferência de dado. A régua de
pendências é o lugar certo, e ela já existe.

**O que fazer com as 84 vivas sem unidade declarada:** ficam **pendentes** até alguém declarar, pela
régua que já existe, aparecendo no sinalizador, no modal de pendências e na coluna do Gerenciador sem
precisar de tela nova. **Não proponho mutirão nem tela nova** (§A.31): o lápis já abre a admissão e a
§A.19 mapeia a fila de pendências para depois do motor da esteira. As 1.690 concluídas e as 821
encerradas **não entram**.

## 4. A colisão do `tipoContrato`, e o conserto que o diretor autorizou

O GI tem `tipoContrato` **`D` Determinado / `I` Indeterminado**, com **default `I`**, que **não** é o
nosso `tipo_contrato`. O nosso vai para o `vinculo`. O invariante `7 → D` e `1 → I` já está travado nos
dois sentidos.

**O que falta, e é a decisão do diretor desta rodada:** `Temporário` (`4`), `Estágio` (`J`) e
`Jovem Aprendiz` (`H`) saíam com prazo **NULO**, e nulo faz o GI aplicar o default `I`
(Indeterminado), que está **errado** para os três: os três são contratos com prazo. Passam a sair
**`D`**. Fica assim:

| `vinculo` | prazo (`tipoContrato` do GI) |
|---|---|
| `1` Contrato CLT | `I` |
| `4` Temporário | **`D`** |
| `7` CLT Prazo Determinado | `D` |
| `J` Estagiário | **`D`** |
| `H` Menor Aprendiz | **`D`** |

## 5. A MIGRATION está bloqueada por coordenação, não por técnica

A coluna nova exige migration, e aqui há dois riscos reais:

- **O `_journal.json` está modificado no working tree por OUTRA sessão**, e a `0139`
  (`as_depara_cliente_vaga`) está no journal e **ainda não aplicada** no banco (o banco está em
  `when=1790646004719`, que é a `0138`). Dois agentes escrevendo o journal se sobrescrevem em silêncio.
- **A marca d'água já nos morreu:** migration com `when` abaixo do último aplicado é **pulada em
  silêncio**, e isso aconteceu com a `0134` nas duas bases. A minha tem de nascer com `when` acima de
  `1790646005719` (o da `0139`).

**Então o slot é coordenado com a sessão dona do journal antes de escrever**, não depois.

## 6. Registrado, por decisão do diretor

- **Os 127 pares de empresa/filial NÃO são urgência.** O time segue preenchendo manual até ajustar. A
  lista é gerada quando ele mandar, e enquanto `GI_PARES_EMPRESA_FILIAL` estiver vazio o envio recusa.
- **O vínculo com `empresa 99 / filial NULA` vai recusar até ser corrigido.** O diretor está ciente.
- **`GI_DEPARA_CIDADES` vazio**, então o código da cidade sai nulo. Segue como está.


---

# Os bloqueios da auditoria, e os três que derrubaram premissas minhas

## V1: o recorte não existe (acima, §1 corrigido)

## V2: a marca proposta é ESTADO, não trilha, e o selo LAVARIA a edição

Eu propus `salario_unidade` + `salario_auditado_em` + `salario_auditado_por` e perguntei se cumpria a
condição de trilha que o `seguranca` exigiu na rodada anterior. **Não cumpre**, por três razões:

1. **O carimbo não sobrevive a uma edição de salário.** O lápis (`admissoes.service.ts:3650`) grava
   `salario` e nada limparia o carimbo: o selo passaria a certificar um valor que ninguém auditou. **O
   selo LAVA a edição, que é o oposto da regra do diretor.** Toda escrita em `salario` tem de invalidar
   unidade e carimbo, em todos os escritores, fail-closed.
2. **Três colunas são estado sobrescrito**, sem histórico da declaração anterior. A exigência era uma
   linha **append-only**.
3. **A exigência era sobre o ENVIO, e o envio joga o autor no lixo.** `enviarManual(admissaoId,
   _autorId)` (`gi/enviar-para-gi.service.ts:147`) descarta o autor, e `marcarEnviado` carimba só a
   data. **Hoje não existe trilha de quem gravou remuneração na folha**, e declarar a unidade não
   resolve isso: é outro ato, em outro momento.

O molde certo é `portal_dados_gi_aceites` (append-only, ancorado em admissão, só rótulos), com `autor_id`
FK em vez do `jti_link` (lá o autor era o candidato; aqui é usuário do sistema).

## V3: declarar `H` grava salário errado DE OUTRO JEITO

Medido no contrato: além de `salario` e `tipoSalario`, existem **`salarioHora` (default 0),
`qtdeHorasMes` (default 0) e `qtdeHorasSem` (default 0)**. O EA emite só os campos nomeados da
allowlist, e o resto assume o default do fornecedor. Então `tipoSalario = H` grava contrato horista com
**ZERO horas por mês**, e o EA **não tem coluna de horas em lugar nenhum**.

**A correção trocaria "9,34 mensal" por "9,34 por hora vezes 0 horas".** Desfecho: `H` **RECUSA**
enquanto as horas não existirem, e a recusa é por **falta de insumo**, não regra de negócio.

## V4 a V6: condições

- **A Liberação tem régua PRÓPRIA** (`domain/liberacao-obrigatorios.ts:62`: CARGO, SEXO, TIPO_CONTRATO,
  DATA_ADMISSAO, BENEFICIOS, ESCALA) e **salário não está nela**. Tela que oferece campo que o gate
  ignora é gate que mente: qual dos dois muda é decisão do diretor.
- **Existem SEIS escritores de `salario`, não três telas.** Eu perdi a **ponte do funil de A&S**
  (`admissoes.service.ts:928`, `criarPreAdmissaoDoFunil`), que copia o salário do snapshot da vaga
  **sem humano nenhum**, mais `aplicarLiberacao` (`:1561`) e a carga. A ponte grava unidade nula e a
  auditoria acontece depois, na tela.
- **Oferecer só `H` e `M` FORÇA declaração falsa.** O GI aceita `A C D H M Q T`. Escolha binária
  obrigatória faz o time marcar `M` quando a verdade é `D` ou `Q`, e aí o valor errado passa a carregar
  um selo dizendo que alguém conferiu: **o selo vira o problema**. Ou a lista tem os 7, ou tem uma opção
  que **recusa**.

## O que o `seguranca` aprovou

A guarda no `POST` em vez da tela, o conceito da declaração como ato de auditoria (o conceito, não a
implementação), o par `D`/`I` conferido no contrato sem terceiro valor, a coordenação do slot da
migration, e não construir mutirão nem tela nova (condicionado ao V1).
