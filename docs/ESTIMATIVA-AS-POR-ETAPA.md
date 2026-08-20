# A&S: estimativa de entrega por etapa

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-20 · **Uso:** apresentação à diretoria

## Premissas da conta

- Jornada de **segunda a sexta, 7 horas úteis por dia**, horário de Brasília. "Dia" abaixo é dia útil.
- Etapas em **sequência**, uma frente por vez. É como a fábrica opera hoje e é o que mantém a
  qualidade; paralelizar encurtaria o calendário e aumentaria o risco de retrabalho.
- A faixa **inclui** construção, testes, gate e as rodadas de validação na tela com o diretor.
- A faixa **não inclui** tempo parado esperando insumo (documento de cliente, planilha de exemplo,
  acesso de terceiro). Esse tempo é de calendário, não de trabalho.
- São **faixas**, não datas. Onde há incerteza real, ela está declarada na coluna do lado.

## As etapas

| # | Etapa | Estimativa | O que pesa no prazo |
|---|---|---|---|
| **0** | **Ambiente de homologação** | **FEITO**, menos de 1 dia | Já entregue e validado. A construção em si levou cerca de 20 minutos; o que consumiu o tempo foi o levantamento e a prova de que a produção não é alcançada |
| **1** | **Central de Vagas** | **4 a 6 dias** | Cadastro com mais de 25 campos em 3 blocos, e a tabela segue a máscara única do sistema, que exige rodadas de ajuste de largura com prova na tela. O menu novo encosta em 4 pontos de código já validado, e cada um precisa de prova de que ninguém perde nem ganha acesso |
| **2** | **Central de Candidatos** | **6 a 9 dias** | A maior das etapas de base. O candidato em seleção muitas vezes ainda não tem CPF, e o CPF é a chave de identidade do sistema inteiro: exige registro próprio, com reconciliação quando o CPF aparecer. Soma o vínculo candidato para vaga, com trava contra contagem dupla. O vocabulário do funil ainda não está definido |
| **3** | **Leitura do pedido do cliente por IA (Word)** | **5 a 8 dias** | Encurta porque o motor de IA já existe, autenticado e em produção. Alonga pela variedade dos documentos de cliente e pela tela de conferência: a IA **propõe**, a pessoa confirma, nunca cria sozinha. Precisa de um lote real de documentos para calibrar |
| **4** | **Leitura de e-mail e WhatsApp por IA** | **8 a 13 dias**, com ressalva | A etapa de maior incerteza, e são **duas** integrações, não uma. O e-mail exige caixa dedicada e autenticação própria. **O WhatsApp não é do EA:** a plataforma de WhatsApp do grupo é o CentraAtend, e a ponte depende de o CentraAtend expor um serviço consumível e de template aprovado pela Meta. A faixa cobre o lado do EA; se a ponte não existir, esta etapa entrega só o e-mail |
| **5** | **Importação da planilha do cliente por IA** | **5 a 8 dias** | Ler planilha e importar já é caminho conhecido no sistema. O novo é o de/para **conversacional**: a IA propõe o mapeamento das colunas e a pessoa corrige em diálogo. Soma a importação idempotente, para rodar duas vezes não duplicar candidato |
| **6** | **Conexão com o módulo de Admissão** | **5 a 8 dias** | A **única** etapa que toca a produção já validada: liberação, vínculo de projeto e a régua de contagem do Alto Volume. O prazo carrega, de propósito, um comparador que roda a conta nova contra a antiga, projeto a projeto, antes de qualquer tela mudar. Contagem no Alto Volume já custou quatro rodadas de correção; a margem aqui é deliberada |

## Totais

| | Dias úteis | Semanas úteis |
|---|---|---|
| **Etapas 1 a 6, o módulo completo** | **33 a 52** | **7 a 10** |
| **Etapas 1 e 2, a base que substitui o sistema atual** | **10 a 15** | **2 a 3** |
| Etapas 3 a 5, os ganhos de IA | 18 a 29 | 4 a 6 |

## A leitura que interessa à diretoria

**A substituição do sistema de seleção descontinuado não espera o projeto inteiro.** Ela acontece nas
**etapas 1 e 2**, em 2 a 3 semanas úteis: vaga e candidato cadastrados, com a vaga como fonte da
verdade de quantidade e posição. As etapas 3 a 5 são **ganho de produtividade** sobre uma base que já
estará funcionando, e podem ser priorizadas, adiadas ou trocadas de ordem sem travar a operação.

A etapa 6 é a que integra A&S e Admissão, e é a única com risco sobre o que já está no ar. Ela pode
ser feita a qualquer momento depois da etapa 2, e a recomendação é fazê-la **por último**, quando o
A&S já estiver rodando e provado.

## O que pode encurtar, e o que pode alongar

**Encurta:** insumo pronto no início de cada etapa (o lote de documentos da etapa 3, uma planilha real
da etapa 5, o vocabulário do funil da etapa 2). Etapa que começa com o insumo na mão anda no piso da
faixa.

**Alonga:** rodadas de ajuste visual, que historicamente são o maior consumidor de tempo do projeto, e
qualquer dependência de terceiro. A ponte de WhatsApp da etapa 4 é a única dependência **fora** do
alcance da fábrica e da diretoria do EA.
