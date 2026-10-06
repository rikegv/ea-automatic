# GI, rodada 4: o cliente final sem sufixo, as três cidades e o código IBGE

Medido contra a **produção do GI** em 02/10/2026. Dois registros criados: **27** e **28**.
Um envio por vez, com confirmação digitada por braço, sem laço e sem retentativa cega (§A.38).

## 1. A pergunta do diretor sobre o sufixo: RESPONDIDA, e provada ao vivo

Ele pediu: "Confirmem que o GI separa os quatro pelos `codigoEmpresa`/`codigoFilial`. Provem."

A prova foi desenhada para ser direta: **os dois registros levam o MESMO `codigoCliente`, 51525**, e
caem em empresas diferentes. Se o GI fundisse, os dois virariam a mesma coisa.

| | registro 27 | registro 28 |
|---|---|---|
| `codigoCliente` enviado | **51525** | **51525** |
| cadastro de origem no EA | `51525` (sem sufixo) | `51525-TEMP.` (**com** sufixo) |
| `codigoEmpresa` | **2** (SOULAN ADM) | **1** (SOULAN CONSULTORIA) |
| `codigoFilial` | 4 | 4 |
| `vinculo` | `1` CLT | `4` Temporário (Lei 6.019) |
| `tipoContrato` (prazo) | `I` | `D` |
| `tipoSalario` | `M` mensal | `H` por hora |
| `salario` | 2500,00 | 11,36 |
| jornada | não se aplica | 220 h/mês e 44 h/sem |

**O GI guardou os dois separados.** Logo tirar o sufixo **na saída** não funde contrato nenhum: quem
separa do lado dele é o par empresa/filial, que já vai no envio. O sufixo continua intacto no cadastro
da plataforma, que é regra de negócio do diretor.

### As duas exceções, medidas no cadastro

Todos os seis códigos com sufixo que têm vínculo estão em **1/4**:

| código | empresa/filial | tipo |
|---|---|---|
| `51525-TEMP.` | 1/4 | TEMPORARIO |
| `55642-TEMP.` | 1/4 | TEMPORARIO |
| `56085-TEMP.` | 1/4 | TEMPORARIO |
| `56702-TEMP.` | 1/4 | TEMPORARIO |
| `57315-T` | 1/4 | TEMPORARIO |
| `57315-TEMP.` | 1/4 | TEMPORARIO |

- **`57315` fica de fora**, como o diretor mandou: ele tem **duas** linhas com sufixo e **as duas no
  mesmo par 1/4**. Tirar o sufixo as deixaria idênticas em cliente, empresa e filial ao mesmo tempo, e
  aí o GI **não** teria por onde separar. É o único caso em que a separação por empresa não resolve.
- **`56702-T` não tem vínculo nenhum** no cadastro, então já recusa antes, por falta de empresa/filial.

## 2. Os cinco campos novos: chegaram todos, e nenhum trocou de lugar

Os nomes do GI **não são os nossos**, e a posição no schema é que define o significado
(`docs/MAPA-GI-CLIENTE-E-CIDADES.md`). Para que um troca-troca ficasse **visível**, os três valores
foram escolhidos **distintos entre si**: três "SAO PAULO" teriam chegado iguais no certo e no errado.

| campo do GI | enviado | o GI devolveu |
|---|---|---|
| `codigoCliente` | 51525 | **51525** |
| `cidadeNascimento` | CAMPINAS | **CAMPINAS** |
| `codMunicipioNascto` | 3509502 (IBGE de Campinas) | **3509502** |
| `cidadeRG` | SANTOS | **SANTOS** |
| `cidadeExpedicao` (a da CTPS) | OSASCO | **OSASCO** |

Nenhuma cidade apareceu no campo de outra. E o que já estava certo no registro 25 continuou certo:
`vinculo`, `tipoContrato`, `tipoSalario`, `salario`, `dataAdmissao`, jornada, empresa e filial.

## 3. O que se mediu de novo, sem ter sido pedido

- **O zero à esquerda do CPF continua sendo perdido.** Enviado `09876543200`, o GI devolveu
  `9876543200.0`. É o campo declarado como `double` no contrato dele, e isso não tem conserto do nosso
  lado: é da modelagem do fornecedor.

- **O SUMIÇÃO DOS REGISTROS ESTÁ EXPLICADO, e ninguém apagou nada.** Esta era a pergunta aberta:
  os registros 24, 25 e 26 desapareceram da fila e o diretor afirma não ter apagado nenhum. Em vez de
  supor, mediu-se: a fila foi lida **no minuto do envio** e **dez minutos depois**.

  | leitura | fila de pré-admissão |
  |---|---|
  | 13:38, logo após criar | **2** (os registros 27 e 28) |
  | 13:48, dez minutos depois | **0** |

  **O próprio GI consome a fila sozinho, em menos de dez minutos.** Não é apagamento, é o
  sincronizador do fornecedor promovendo a pré-admissão. Foi exatamente o que aconteceu com os 24, 25
  e 26, e explica por que o 25 **apareceu na tela do diretor** (ele olhou a tela da folha, que é onde a
  pessoa fica depois de promovida) enquanto a nossa fila já estava vazia.

  **A consequência prática, e ela é uma restrição de verdade:** a janela em que o EA consegue ler de
  volta o que mandou é de **menos de dez minutos**. Depois disso a pré-admissão saiu da fila e a tabela
  da folha responde **403** para a nossa credencial, então a conferência automática fica cega. Toda
  leitura de volta tem de acontecer **no mesmo ciclo do envio**, não em outro momento.

## 4. Como o arnês foi travado antes de tocar a produção

- `11111111111` é o **último** dígito repetido não usado; `09876543200` é da outra perna da classe
  (zero à esquerda com verificador **inválido**), que nenhuma pessoa real possui.
- O autoteste ganhou as asserções da rodada: os cinco campos presentes, `codigoCliente` **inteiro e
  sem sufixo**, as três cidades **distintas entre si** e dentro do `maxLength` 30, e os dois braços
  carregando o **mesmo** cliente (senão a prova da separação cairia).
- **Oito mutações foram testadas e as oito mordem**: cidade do RG igual à de nascimento, cidade da
  CTPS igual à do RG, braços com clientes diferentes, `codigoCliente` com sufixo, `codigoCliente`
  ausente, `codMunicipioNascto` ausente, as duas unidades iguais, cidade acima de 30.
- A primeira medição das mutações deu "não mordeu" em sete de sete. **Era o mutante crashando** (ele
  rodava de outro diretório e não achava o módulo de credencial), não a trava fraca. Uniformidade
  suspeita é sinal de instrumento quebrado, não de resultado.

## 5. As chaves para o diretor apagar

Nomes e CPFs sintéticos, para ele conferir na tela e remover:

| registro | nome | CPF enviado | empresa/filial |
|---|---|---|---|
| **27** | SIMULADO TERCEIRO MENSAL | `11111111111` | 2 / 4 |
| **28** | SIMULADO TEMPORARIO HORISTA | `09876543200` (o GI guardou `9876543200`) | 1 / 4 |

O **27** está no par **2/4**, o mesmo do registro 25, que foi o único que apareceu na tela dele. O
**28** está em **1/4**, par nunca testado: é o único jeito de levar um cliente com sufixo. Se o 28 não
aparecer, isso **não** é falha do sufixo, é mais uma medição da pergunta de quais pares aparecem.
