# GI: os 4 envios mistos, lado a lado, campo a campo

Quatro pré-admissões sintéticas na PRODUÇÃO do GI, 01/10/2026, uma por vez, com confirmação digitada
por braço, sem laço e sem retentativa (§A.38). Payload idêntico no tronco; varia só o que o diretor
pediu. Mapa de alcance em `docs/MAPA-GI-CONSERTOS-E-4-ENVIOS.md`.

## Os quatro, e o que o diretor confere na tela do GI

| braço | `idRegistroWeb` | nome | CPF enviado | empresa / filial | sexo | documentos |
|---|---|---|---|---|---|---|
| COMPLETO-A | **20** | SIMULADO COMPLETO ALFA | `777.777.777-77` | 1 / 1 SOULAN CONSULTORIA | M | todos |
| INCOMPLETO-C | **21** | SIMULADA INCOMPLETA CHARLIE | `666.666.666-66` | 6 / 0 NEAT | **F** | sem PIS, sem título, sem reservista |
| INCOMPLETO-D | **22** | SIMULADO INCOMPLETO DELTA | `555.555.555-55` | 30 / 0 SELLAN | M | sem CNH, sem reservista |
| COMPLETO-B | **23** | SIMULADO AAAA... (60 caracteres) | `011.111.111-11` | 4 / 1 CENTRAL DE ESTAGIOS | M | todos |

Os quatro: `HTTP 200`, `sucess: true`, `"Cadastro Efetuado Com Sucesso!"`. Leitura projetada antes e
depois: **0 para 4, delta exatamente 4**. Todos nasceram com `statusPreCadastro: 2` e
`codigoFuncionario: 0`.

**Os CPFs são de classe que a Receita nunca emitiu**, e isso foi exigência do `seguranca`: três de
dígito repetido, e o quarto com zero à esquerda e **verificador deliberadamente inválido** (`01111111111`
espera `03` e leva `11`). Não existe faixa de CPF reservada para teste no Brasil, então essa é a única
garantia de que nenhum deles pertence a uma pessoa viva.

## O achado principal: o GI PERDE o zero à esquerda do CPF, e agora está medido

| | valor |
|---|---|
| enviado | `01111111111`, 11 dígitos |
| voltou do GI | **`1111111111.0`**, **10 dígitos** |
| reposto com padding de 11 | `01111111111`, **idêntico ao enviado** |

**O zero se perde no ARMAZENAMENTO do fornecedor, não no nosso envio.** O contrato declara `cpf` como
`format: double`, e o GI guarda o número: `01111111111` e `1111111111` são o mesmo valor numérico. Os
outros três braços voltaram com 11 dígitos, porque nenhum deles começa com zero.

**Isto confirma a refinação da régua de normalização, e contraria o pedido ao pé da letra.** Tirar o
zero à esquerda no nosso lado não "consertaria" nada: apagaria um dígito do documento antes de sair, e
o resultado no GI seria o mesmo. O conserto certo foi **preservar todos os dígitos**, que é o que o
produto passou a fazer. Nenhuma informação é perdida (o padding recupera o valor exato), mas **a tela
do GI pode exibir 10 dígitos**, e é isso que o diretor tem de conferir no registro 23.

## O corte de texto funciona e NÃO derruba o envio

O braço COMPLETO-B levou o nome **exatamente no `maxLength` 60**, e voltou com 60 caracteres: aceito,
gravado inteiro. Isso fecha a medição que faltava, porque a sonda já havia provado o outro lado: **um
caractere ACIMA do teto e o GI derruba o envio inteiro com 400**, reprovando 18 campos de uma vez.
Então a régua é dura e o corte do produto é o que separa "admissão entra" de "admissão se perde".

## O incompleto se comporta DIFERENTE do completo? Não, e a diferença é só o default

Os quatro registros diferem em **14 campos**, e todos os 14 são o que se variou de propósito: os dois
de empresa, o CPF, o nome, o sexo, o `idRegistroWeb` e os oito dos documentos ausentes. **Nenhum campo
divergiu por conta do GI.**

Campo omitido volta no **`default` declarado do contrato**, nunca em erro e nunca em comportamento
especial:

| campo omitido | voltou | é o default do contrato |
|---|---|---|
| `pis` | `0` | sim |
| `tituloEleitor` | `""` | sim |
| `titEleZona`, `titEleSecao` | `0` | sim |
| `reservista` | `""` | sim |
| `habilitacao` | `""` | sim |
| `cnhDataEmissao`, `dataVectoHabilitacao` | `None` | sim |

**Esta é a confirmação final do diagnóstico de 01/10:** o que "não gravou" no teste de 29/09 não foi
descartado pelo GI, foi campo que chegou nulo e caiu no default. O GI guarda exatamente o que recebe,
e o registro incompleto nasce igual ao completo, só com os defaults nos lugares vazios.

**O feminino não muda nada no GI.** O braço INCOMPLETO-C é `sexo: F` e não levou reservista: o GI
aceitou sem reclamar, porque nenhum campo é `required` no contrato. A régua do reservista por sexo é
nossa, não dele.

## Uma consequência honesta de ter medido o CPF

O arnês casa o registro lido com o braço **pelo CPF**, e para o registro 23 esse casamento **falhou**,
justamente porque o CPF voltou com 10 dígitos. Foi assim que a corrupção apareceu: o braço saiu
rotulado como `idRegistroWeb=23` na comparação, em vez de `COMPLETO-B`. Fica registrado porque é um
caso em que o defeito do fornecedor quebra uma inferência nossa, e qualquer código futuro que localize
pessoa no GI pelo CPF tem de comparar **por valor numérico**, nunca por string de 11 dígitos.

## Os registros 20 a 23 estão VIVOS e precisam ser apagados

As chaves estão em `~/gi-investigacao/.ENVIOS-POR-BRACO.json` (modo 600, fora do repositório, e o
arquivo não carrega nome nem CPF: só `idRegistroWeb`, empresa, filial e o `idRetorno`).
