# A&S: estimativa de entrega por etapa

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-20 (revisada) · **Uso:** apresentação à diretoria

> **Revisão de 20/08 (tarde).** A primeira versão estimou a etapa 4 em 8 a 13 dias supondo **duas
> integrações** (conector de WhatsApp via CentraAtend com template Meta, e leitura de caixa de
> e-mail). **Essa premissa estava errada.** O fluxo real é sempre **por anexo**: a pessoa anexa o
> arquivo e a IA lê. Não há conector com WhatsApp, e-mail ou qualquer sistema externo. A etapa 4
> passou de **8 a 13** para **2 a 4 dias**, e a dependência externa que existia **deixou de existir**.

## Premissas da conta

- Jornada de **segunda a sexta, 7 horas úteis por dia**, horário de Brasília. "Dia" abaixo é dia útil.
- Etapas em **sequência**, uma frente por vez. É como a fábrica opera e é o que evita retrabalho.
- A faixa **inclui** construção, testes, gate e as rodadas de validação na tela com o diretor.
- A faixa **não inclui** tempo parado esperando insumo. Esse tempo é de calendário, não de trabalho.
- São **faixas**, não datas. Onde há incerteza real, ela está declarada ao lado.

## As etapas

| # | Etapa | Estimativa | O que pesa no prazo |
|---|---|---|---|
| **0** | **Ambiente de homologação** | **FEITO**, menos de 1 dia | Entregue e validado. A construção levou cerca de 20 minutos; o tempo foi o levantamento e a prova de que a produção não é alcançada |
| **1** | **Central de Vagas** | **4 a 6 dias** | Cadastro com mais de 25 campos em 3 blocos, e a tabela segue a máscara única do sistema, que exige rodadas de ajuste de largura com prova na tela. O menu novo encosta em 4 pontos de código já validado, e cada um precisa de prova de que ninguém perde nem ganha acesso |
| **2** | **Central de Candidatos** | **6 a 9 dias** | A maior das etapas de base. O candidato em seleção muitas vezes ainda não tem CPF, e o CPF é a chave de identidade do sistema inteiro: exige registro próprio, com reconciliação quando o CPF aparecer. Soma o vínculo candidato para vaga, com trava contra contagem dupla. O vocabulário do funil ainda não está definido |
| **3** | **Leitura de anexo por IA: o pedido em Word** | **4 a 7 dias** | Constrói o motor inteiro: upload, extração, mapeamento para os campos da vaga e a **tela de conferência**, que é o coração (a IA propõe, a pessoa confirma, nunca cria sozinha). O motor de IA já existe, autenticado e em produção, o que encurta. **O Word é o único formato que o sistema ainda não lê**, então a extração de `.docx` é peça nova. Precisa de um lote real de pedidos para calibrar |
| **4** | **Ampliar os formatos: PDF e print de conversa** | **2 a 4 dias** | Encolheu de 8 a 13 para 2 a 4 porque **não há integração nenhuma**: é anexo, no mesmo motor da etapa 3. E porque **PDF e imagem já são lidos hoje em produção**, pela auditoria documental. O que resta é aceitar os formatos na tela da vaga, tratar **vários prints de uma mesma conversa** como um anexo só, e um perfil de leitura próprio: conversa não tem estrutura, então rende menos que um documento e a tela de conferência pesa mais |
| **5** | **Importação da planilha do cliente por IA** | **5 a 8 dias** | Ler planilha e importar já é caminho conhecido no sistema. O novo é o de/para **conversacional**: a IA propõe o mapeamento das colunas e a pessoa corrige em diálogo. Soma a importação idempotente, para rodar duas vezes não duplicar candidato |
| **6** | **Conexão com o módulo de Admissão** | **5 a 8 dias** | A **única** etapa que toca a produção já validada: liberação, vínculo de projeto e a régua de contagem do Alto Volume. O prazo carrega, de propósito, um comparador que roda a conta nova contra a antiga, projeto a projeto, antes de qualquer tela mudar. Contagem no Alto Volume já custou quatro rodadas de correção; a margem aqui é deliberada |

## Totais

| | Dias úteis | Semanas úteis |
|---|---|---|
| **Etapas 1 a 6, o módulo completo** | **26 a 42** | **5 a 8** |
| **Etapas 1 e 2, a base que substitui o sistema atual** | **10 a 15** | **2 a 3** |
| Etapas 3 a 5, os ganhos de IA | 11 a 19 | 2 a 4 |

*Versão anterior: 33 a 52 dias (7 a 10 semanas). A correção da premissa da etapa 4 devolveu **7 a 10
dias úteis**, cerca de duas semanas.*

## Recomendação: fundir a construção das etapas 3 e 4

As duas são o **mesmo motor**, mudando só o tipo de arquivo de entrada. Construídas juntas, o upload e
a tela de conferência nascem genéricos de uma vez, em vez de nascerem para Word e serem generalizados
depois: **5 a 9 dias em vez de 6 a 11**, uma economia de 1 a 2 dias.

Continuam separadas nesta tabela porque são numeradas assim na apresentação, e porque **entregam em
momentos diferentes**: o Word primeiro, os demais formatos logo em seguida.

## A leitura que interessa à diretoria

**A substituição do sistema de seleção descontinuado não espera o projeto inteiro.** Ela acontece nas
**etapas 1 e 2**, em 2 a 3 semanas úteis: vaga e candidato cadastrados, com a vaga como fonte da
verdade de quantidade e posição. As etapas 3 a 5 são **ganho de produtividade** sobre uma base que já
estará funcionando, e podem ser priorizadas, adiadas ou trocadas de ordem sem travar a operação.

**Não há mais nenhuma dependência fora do alcance da equipe.** A ressalva anterior era a ponte de
WhatsApp, que exigia o CentraAtend expor um serviço e um template aprovado pela Meta. Com o fluxo por
anexo, ela sai da conta: **todas as etapas dependem só da fábrica e do diretor.**

A etapa 6 é a que integra A&S e Admissão, e é a única com risco sobre o que já está no ar. Pode ser
feita a qualquer momento depois da etapa 2, e a recomendação é fazê-la **por último**, quando o A&S já
estiver rodando e provado.

## O que pode encurtar, e o que pode alongar

**Encurta:** insumo pronto no início de cada etapa (o lote de pedidos em Word da etapa 3, alguns
prints reais da etapa 4, uma planilha real da etapa 5, o vocabulário do funil da etapa 2). Etapa que
começa com o insumo na mão anda no piso da faixa.

**Alonga:** rodadas de ajuste visual, que historicamente são o maior consumidor de tempo do projeto.

**Uma ressalva honesta sobre a etapa 4:** a estimativa cobre **construir** a leitura de print, não
promete um índice de acerto. Print de conversa de WhatsApp é a entrada mais pobre de todas, sem
estrutura e com informação espalhada em várias mensagens, então a IA vai acertar menos ali do que num
pedido formal em Word. É exatamente por isso que a tela de conferência existe e é obrigatória: o
ganho é a pessoa **revisar** um rascunho preenchido em vez de digitar do zero, não a máquina acertar
sozinha.
