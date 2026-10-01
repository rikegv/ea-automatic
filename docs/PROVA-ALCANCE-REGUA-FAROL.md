# Prova de alcance: o que muda se a régua de pendências passar a respeitar o farol

Pedida pelo diretor (§A.27: "digam se alguma contagem muda"). **Medida executando a régua REAL sobre
a base inteira de produção**, 3.018 admissões, em 01/10/2026, não deduzida do código.

## A resposta curta: MUDA MUITO, e é o colateral que o diretor já REJEITOU na outra opção

| farol | total | COM pendência hoje | % |
|---|---|---|---|
| **ADMISSAO_CONCLUIDA** | 1.963 | **1.619** | **82,5%** |
| **DECLINOU** | 895 | **809** | 90,4% |
| **RESCISAO** | 55 | **54** | 98,2% |
| EM_ADMISSAO | 64 | 24 | 37,5% |
| BANCO_AGUARDAR | 21 | 21 | 100% |
| LIBERACAO_RECUSADA | 15 | 15 | 100% |
| AGUARDANDO_LIBERACAO | 5 | 5 | 100% |

> **Fazer a leitura ao vivo respeitar `ehFarolVivo` apagaria a pendência de 2.482 admissões**
> (1.619 concluídas + 809 declinadas + 54 rescindidas) da coluna do Gerenciador, do modal, do radar,
> dos KPIs e do relatório, **de uma vez**.

**E isso é exatamente o motivo pelo qual o diretor recusou a outra opção.** A OST diz, sobre filtrar
no carregamento em lote: *"ele sumiria com TODAS as pendências das concluídas, não só a nova, e muda
o que o time vê hoje"*. **Alargar a função tem o MESMO efeito**, pelo mesmo motivo. As duas opções
que pareciam diferentes são a mesma coisa vista de dois lugares.

Não é risco teórico: **82,5% das concluídas têm pendência hoje**, quase sempre Uniforme (1.521),
Centro de custo (684), Gestor/BP (675) e Salário (273).

## O segundo achado, que ninguém tinha olhado: `ehFarolVivo` deixa de fora DOIS faróis de trabalho ativo

`ehFarolVivo` (`domain/admissao.ts:79`) é só `EM_ADMISSAO` e `BANCO_AGUARDAR`. A base tem outros dois
que **não são histórico**, são fila de trabalho:

- **`LIBERACAO_RECUSADA`, 15 admissões, todas as 15 com pendência**, e com a régua INTEIRA pendente
  (Cliente, Cargo, Salário, Tipo de contrato, Data, Benefícios, Escala, Centro de custo, Gestor/BP,
  Uniforme, Setor). É trabalho a fazer, não arquivo.
- **`AGUARDANDO_LIBERACAO`, 5 admissões, todas com pendência.**

Aplicar `ehFarolVivo` à leitura **apagaria a pendência dessas 20 também**, e aí a fila de liberação
recusada ficaria às escuras. O recorte foi escrito para proteger o histórico da carga, e **não previu
estes dois estados**.

## A proposta: recortar o ITEM NOVO, não a régua inteira

O objetivo do diretor é que a unidade do salário **não exploda em 1.690 concluídas**. Isso se consegue
cobrando **só o item novo** por farol, e deixando os itens existentes exatamente como estão:

- `SALARIO_UNIDADE` é cobrado **só** em admissão viva;
- Uniforme, Centro de custo, Gestor/BP, Salário e os demais **continuam sendo cobrados como hoje**, em
  todos os faróis;
- **nenhuma contagem de nenhuma das seis telas muda**, e é isso que a medição acima permite afirmar.

**O que NÃO resolve, e fica registrado em vez de ser escondido:** a inconsistência que o `backend`
achou continua de pé. O recorte por farol existe só na **ESCRITA** do `sinalizador_preenchimento`
(`admissoes.service.ts:3825`: farol não-vivo mantém o valor anterior em vez de recalcular), e a
**LEITURA ao vivo** não tem recorte nenhum. Então o sinalizador gravado e a coluna calculada **já
podem discordar hoje** numa concluída. Consertar isso de verdade é mexer em 2.482 linhas de tela, e
é decisão própria, não efeito colateral desta OST.
