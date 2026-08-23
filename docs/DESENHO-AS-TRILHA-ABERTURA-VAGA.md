# A&S Central de Vagas: a trilha de abertura, e o fechamento como ato separado

**Projeto:** EA AUTOMATIC · **Data:** 2026-08-22 · **Tipo:** desenho de experiência (§A.27)
**Regra desta OST:** nada construído até o diretor lapidar os passos. Este documento é o mapa.
**Ambiente:** homologação. §A.11 (sem travessão), §A.24 (title case em título e etiqueta).

---

## 1. O rumo que muda

Hoje a Central de Vagas tem UM modal que cadastra tudo, salário de fechamento incluído. O desenho
abaixo separa dois momentos que a operação já vive separados:

| Momento | Quem faz, e quando | Onde vive |
|---|---|---|
| **Abrir Vaga** | o consultor, quando o cliente solicita | trilha de 4 passos, no modal largo |
| **Fechar Vaga** | o consultor, semanas depois, quando o processo fecha | ação própria na linha da vaga |

**Consequência direta:** o campo "Salário de fechamento", que entrou no cadastro na correção de
21/08, **sai do formulário de abertura** e passa a ser preenchido só no Fechar Vaga. A coluna
continua na tabela e na listagem, exatamente como está hoje; muda só onde ela é preenchida.

---

## 2. A trilha proposta: 4 passos

São 38 campos de abertura e requisitos. Em 3 passos cada tela receberia 13 campos, que é a parede
que a OST pede para evitar; em 5 passos a trilha fica longa e o progresso perde sentido. **4 passos
deixam entre 8 e 12 campos por tela**, cada um com um assunto só.

A ordem segue o formulário de papel, que é a ordem em que o consultor recebe a informação do cliente.

### Passo 1 de 4 · A Vaga
*"Para quem é, e o que é"*

| Campo | Tipo | Obrigatório |
|---|---|---|
| Cliente | seletor com busca, rótulo "54028 - ADVANCE BIONICS" | não |
| Centro de custo | texto | não |
| Código da vaga | texto, único no sistema | **sim** |
| Nome de divulgação | texto | **sim** |
| Cargo | seletor com busca | **sim** |
| Nº de posições | número > 0 | **sim** |
| Natureza | lista (Efetiva, Temporária, Reposição Efetiva, Terceira, Estágio, Vaga Banco) | **sim** |
| Sazonalidade | lista (Operação Padrão, Sazonal) | **sim** |
| Status | lista (Aberta, Entregue, Fechada, Cancelada, Vaga Banco) | **sim**, nasce Aberta |

*Os cinco obrigatórios da vaga vivem todos aqui, de propósito: o único passo que pode travar o
avanço é o primeiro, e do passo 2 em diante o consultor caminha e sai quando quiser.*

### Passo 2 de 4 · Solicitação E Contratação
*"Quem pediu, com que vínculo, por qual motivo"*

| Campo | Tipo | Nota |
|---|---|---|
| Nome do solicitante / contato focal | texto | |
| Telefone do solicitante | texto | |
| E-mail do solicitante | texto | |
| Data de solicitação | data | |
| Consultor responsável | seletor de usuário do EA | lista de COMUM e MASTER, padrão das outras telas |
| Data de alinhamento da vaga | data | |
| Data de abertura | data | **obrigatória**, é a única data que a régua exige |
| Data limite | data | vale em qualquer natureza (correção de 21/08) |
| Envio da shortlist | data | |
| Vínculo | lista, **com PJ e Efetivo entrando agora** | Efetivo, PJ, Temporário, Terceirizado, Estágio, Interno, Fopag, Jovem Aprendiz |
| Tempo de contrato | ver questão **Q1** | |
| Motivo da contratação | seletor do catálogo `motivos_contratacao` que já existe | hoje traz Aumento de demanda e Substituição |
| Justificativa do motivo | texto | o "acréscimo de serviço (justificar)" do formulário |
| Tipo de substituição | lista (Férias, Licença Maternidade, Auxílio Doença, Substituição) | só aparece quando o motivo é Substituição |
| Nome do substituído | texto | idem. **CPF fica de fora** (decisão do diretor) |

*O bloco de substituição nasce escondido e abre sozinho quando o motivo é Substituição. Campo que
não se aplica não ocupa espaço na tela.*

### Passo 3 de 4 · Condições E Benefícios
*"O que a vaga oferece, e onde"*

| Campo | Tipo | Nota |
|---|---|---|
| Salário de abertura | valor com máscara de moeda pt-BR | já existe |
| Benefícios | lista do cadastro de benefícios, **cada um com o seu valor** | decisão do diretor; padrão da tela de Benefícios |
| Local de trabalho | texto longo | pré-preenche do `endereco_padrao` do cliente |
| Regiões possíveis para abordagem | texto | |
| Horário e escala | texto longo | pré-preenche do `escala_padrao` do cliente |
| Modelo de trabalho | lista (Presencial, Home Office, Híbrido) | |
| Detalhe do híbrido | texto | só aparece no Híbrido ("1x por semana") |
| Vaga confidencial | Sim / Não | padrão **Não** |
| Autorizar divulgar o nome da empresa | Sim / Não | padrão **Sim** |

*O benefício com valor repete a mecânica que a tela de Benefícios já usa: marcou, o campo de valor
acende ao lado; benefício que não pede valor (Seguro de vida, por exemplo) fica só marcado.*

### Passo 4 de 4 · Requisitos Da Posição
*"Quem a gente procura"*

| Campo | Tipo |
|---|---|
| Escolaridade | lista que já existe (é a Formação do formulário) |
| Faixa etária | texto ("20 a 50 anos", "Indiferente") |
| Gênero | lista (Indiferente, Masculino, Feminino), padrão Indiferente |
| Idiomas | texto |
| Cursos e conhecimentos necessários | texto longo |
| Aplicação de testes | seleção múltipla (Excel, Redação, Lógica, Inglês, Psicométrico) mais "outro" em texto |
| Experiência necessária | texto longo |
| Principais atribuições e responsabilidades | texto longo |
| Perfil comportamental | texto longo |
| Ambiente em que o profissional será inserido | texto longo |
| Etapas do processo seletivo com a empresa | texto longo |
| Observações | texto longo |

---

## 3. Como o progresso aparece

**Reuso, não invenção.** O EA já tem trilha: o wizard de Nova Admissão usa o componente `Stepper`,
com círculo numerado por passo, check verde no passo vencido, rótulo mais uma linha de apoio, e uma
barra de progresso no gradiente do sistema. A Central de Vagas usa **o mesmo componente, sem tocar
nele** (§A.26: importar não altera o wizard que já está validado).

```
 ①  A Vaga            ②  Solicitação        ③  Condições         ④  Requisitos
    Cliente e cargo      Quem pediu            O que oferece        Quem procuramos
 ████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

**A caixa.** Modal de **1100px** (o cadastro de hoje tem 900px), em três faixas fixas:

- **topo fixo:** título "Abrir Vaga" mais o Stepper. Nunca sai da vista, então a pessoa sempre sabe
  onde está.
- **miolo rolando:** só os campos do passo atual, em grade de 2 colunas para campo curto e largura
  inteira para texto longo. Campo respirando, sem três colunas espremidas.
- **rodapé fixo:** "Voltar" à esquerda, "Passo 2 de 4" no centro e "Continuar" à direita, virando
  **"Abrir Vaga"** no último passo.

**Navegação:** clicar num passo já visitado volta para ele (o Stepper vira atalho, não só enfeite).
Passo à frente só pelo "Continuar", para ninguém pular o passo 1 sem o obrigatório.

**Rascunho na sessão:** trocar de passo não perde o que foi digitado, e fechar o modal por engano
pergunta antes de descartar. A vaga só nasce no clique final.

---

## 4. O que trava o "Continuar"

Só o passo 1, e só nos cinco obrigatórios. Do passo 2 em diante o botão nunca fica cinza: o
consultor recebe a vaga do cliente pela metade, e a tela não pode ser mais exigente que a vida real.
No último passo, "Abrir Vaga" grava com o que houver.

O único aviso que aparece é o do **código duplicado**, e ele já existe: o backend responde com o
número em uso e a trilha volta ao passo 1 com o campo marcado.

---

## 5. A ação "Fechar Vaga"

Na linha da vaga, ao lado das outras ações, aparece **Fechar Vaga**, visível só enquanto a vaga
está Aberta. Abre um modal pequeno, de um bloco só:

| Campo | Tipo |
|---|---|
| Data do fechamento | data |
| Nº de vagas fechadas | número |
| Salário de fechamento | valor com máscara de moeda |
| Data prevista para início na empresa | data |
| Situação do fechamento | **Entregue** (foi preenchida) ou **Fechada** (encerrada sem preencher) |

A situação escolhida é o que grava o status da vaga, e é por isso que ela está aqui: o vocabulário
da base separa Entregue de Fechada justamente para não perder o indicador de êxito da vaga.

**Não entra aqui:** nome, telefone, RG e CPF do aprovado. É PII de candidato e vai para a Central de
Candidatos (§A.6, decisão do diretor).

---

## 6. O que isso pede no banco

- **`vagas` ganha 24 colunas** de abertura e requisitos, mais 4 de fechamento. Todas nuláveis, todas
  na própria tabela: é uma linha por vaga, sem join, e anexo 1:1 só multiplicaria consulta.
- **`vaga_beneficio` ganha `valor`** `numeric(12,2)` nulável, no espelho exato de `admissao_beneficio`.
- **Três enums novos:** modelo de trabalho, tipo de substituição e gênero.
- **`vaga_vinculo` ganha EFETIVO e PJ.**
- **Nada de unique em `vagas.codigo`** (decisão do diretor): a trava fica só no cadastro, para a
  importação da onda 3 não quebrar nos códigos repetidos da base.
- **Nenhuma coluna nova fora do módulo de A&S.** Esteira, Gerenciador, Benefícios e admissões ficam
  intactos.

---

## 7. As sete questões para o diretor lapidar

| # | Questão | Minha recomendação |
|---|---|---|
| **Q1** | **Tempo de contrato:** o EA tem lista fixa (30 a 270 dias, §A.22), o formulário de papel escreve solto ("3 a 6 meses", "indeterminado", "podendo prorrogar"). Lista ou texto? | **Lista de 30 a 270 dias mais "Indeterminado"**, e a nuance vai para Observações. Texto livre não é contável |
| **Q2** | **4 passos, ou os 3 que você citou** (dados, requisitos, benefícios)? | 4. Com 3, o primeiro passo fica com 20 campos |
| **Q3** | **O consultor responsável** é seletor de usuário do EA ou texto? A base de vagas traz nome escrito | **Seletor de usuário**, porque a vaga nasce dentro do EA. O texto solto é problema só da importação |
| **Q4** | **Fechar Vaga escolhe entre Entregue e Fechada**, ou fecha sempre como Entregue? | Escolhe. São coisas diferentes na operação |
| **Q5** | **Nº de vagas fechadas maior que o nº de posições:** avisa, barra, ou aceita? | **Avisa e deixa passar.** Barrar inventa regra que ninguém pediu |
| **Q6** | **Editar vaga:** a trilha também serve para editar, ou editar abre tudo numa tela só? | A mesma trilha, com os passos já preenchidos. Uma tela, um jeito de preencher |
| **Q7** | **Gênero na vaga:** o formulário pede, e é requisito sensível. Mantém como o cliente manda? | Manter, é o que o formulário registra hoje. Só registro o ponto |

---

## 8. O que fica de fora, e por quê

- **CPF do substituído e dados do aprovado:** PII, decisão do diretor.
- **Empresa, razão social e CNPJ:** herdam do cliente, não se digitam.
- **Comercial responsável:** é atributo do cadastro de cliente, em OS própria.
- **Alocação de candidato na vaga:** é a Central de Candidatos, etapa seguinte.
- **Importação da base:** onda 3, com desenho próprio.

§A.6: este documento trata de campo, tabela e tela. Sem CPF, sem nome de candidato, sem URL externa.
