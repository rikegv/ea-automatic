# MAPA DE ALCANCE: vaga PENDENTE DE REVISÃO, o de/para das etapas e o arnês

Levantado pelo coordenador (§A.39 passo 1, §A.26, §A.27) ANTES de despachar. §A.11: sem travessão.

---

## DECISÃO 4, a de risco: a vaga sem cliente nasce PENDENTE DE REVISÃO

### O achado que decide a forma: o domínio raciocina por PAPEL, não por CÓDIGO

`as_vaga_status` tem `codigo` (a identidade) e `papel` (o que ela significa). **Toda régua sensível
resolve pelo PAPEL**, e nunca pelo literal do código: o expurgo lê `s.encerra` e `s.papel`
(`retencao-candidatos.service.ts:340`), o encerramento da varredura pede o código **do papel**
FECHAMENTO ao catálogo, e a reabertura pede o do papel ABERTURA. O teste da reabertura já afirma
isso com todas as letras: "o destino é sempre o código do papel ABERTURA, resolvido no servidor pelo
catálogo, e nunca o literal ABERTA".

Papéis válidos hoje, com CHECK no banco: ABERTURA, CANCELAMENTO, ENTREGA, FECHAMENTO, LIVRE,
RASCUNHO.

**Portanto o status novo é CÓDIGO NOVO com PAPEL EXISTENTE.** `PENDENTE_REVISAO`, rótulo
**"Pendente De Revisão"** (§A.24, title case), papel **RASCUNHO**, `encerra = false`,
`recebe_candidato = true`.

**Por que isso é a escolha segura, e não só a conveniente:**
- **não toca o vocabulário de papéis**, então nenhuma cláusula já auditada muda de sentido. O expurgo
  continua enxergando exatamente o que enxergava para RASCUNHO;
- **`recebe_candidato = true` é obrigatório**, senão a vaga espelhada não recebe as candidaturas que
  a varredura acabou de ler, e a ingestão inteira para de funcionar em silêncio;
- **`encerra = false` é obrigatório** pelo mesmo motivo, e o risco que ele cria (gente protegida do
  expurgo enquanto a vaga não encerra) **já está fechado**: a vaga que sai das ativas do Pandapé vai
  para FECHAMENTO com `encerrada_em` de servidor, e isso vale para a PENDENTE DE REVISÃO como para
  qualquer outra. **Confirmar que vale**, porque é a trava mais cara da frente anterior.

### O fluxo, e a régua que o diretor pediu

1. a varredura espelha a vaga e ela nasce **PENDENTE_REVISAO**, com `cod_cliente` NULO (medido: o
   cliente **não tem caminho na API do Pandapé**, §A.5, adiar em vez de inventar);
2. ela aparece com **selo vermelho de alerta** na Central de Vagas;
3. ela entra na fila da tela nova **"Vagas Pendentes De Revisão"**;
4. o time **vincula o cliente** que falta;
5. o time **libera**, e a vaga vai para o código do papel **ABERTURA**;
6. **sem cliente vinculado, não libera.** A trava é do servidor, e a tela é o aviso.

**A trava mora no backend, não na tela.** Uma guarda só de frontend é contornável pela rota, e a
casa já registrou esse erro antes: a tela avisa, o servidor recusa.

### Quem conta vaga, e o que muda de número (§A.27)

`VagasService.list()` **não filtra por status** e usa `leftJoin` em todos os vínculos justamente para
que a vaga sem cliente apareça; os KPIs saem da mesma lista (`kpisDoFunil`). Então:
- as ~600 vagas espelhadas **aparecem** na Central de Vagas, como apareceriam em RASCUNHO;
- o que muda é **em qual balde elas caem** e o selo que carregam;
- **nenhuma tela quebra, todas mudam de número**, e isso é esperado e foi dito ao diretor.

### O modelo da tela: Liberação Admissional

`apps/frontend/src/app/(app)/liberacao/page.tsx` (2.430 linhas) mais
`AdmissoesController.aguardandoLiberacao`, `contarAguardandoLiberacao` e `liberar`. O padrão a
copiar: **fila, contador, ação de liberar individual, e a régua de papel no servidor**.

**Atenção à régua de papel:** na Liberação Admissional, liberar é operacional (sem `@Roles`) e só
RECUSAR é restrito. **Não presuma a mesma régua aqui**: liberar uma vaga vincula cliente, que é dado
de cadastro. Quem pode liberar é **pergunta para o diretor**, e até ele responder a régua nasce
restritiva.

### As regras de tela que valem sem precisar ser pedidas
§A.12 (máscara única de tabela), §A.20 (larguras, sem esmagar), §A.24 (title case em título e tag),
§A.29 (ordenação clicável, `useOrdenacao`/`ColunaOrdenavel`), §A.35 (`Select` do design system, com
busca; **nada de `<select>` cru**), §A.37 (coluna nova nasce com filtro multiselect junto),
§A.41 (modal de preenchimento não fecha ao clicar fora; modal de leitura nasce com "Fechar").
§A.23: **o menu novo nasce só para o SUPER_ADMIN**, registrado no catálogo e não concedido.

---

## DECISÃO 3, o de/para das etapas

As quatro que o diretor fechou:

| chave no Pandapé | destino | forma |
|---|---|---|
| `entrevista inteligente` | CAPTACAO | etapa |
| `pre selecionado` (singular) | TRIAGEM | etapa |
| `retorno negativo etapa soulan` | DESCARTADO | desfecho, motivo "retorno negativo" |
| `finalistas` | ver a ressalva abaixo | |

**RESSALVA que eu levo ao diretor em vez de resolver sozinho:** ele escreveu "NÃO usam, tratar como
**descarte/ignorada**", e essas duas coisas são opostas. **Descarte ESCREVE** `DESCARTADO` na
candidatura, que é um desfecho: carimba a pessoa como descartada, entra no funil e mexe no relógio de
retenção. **Ignorada NÃO ESCREVE NADA**, que é o fail-closed da casa.

**A fábrica adota IGNORADA por ora**, porque é o lado seguro e reversível: marcar como descartada
quem ninguém descartou falsearia a história de 174 vagas, e desfazer isso depois é caro. A forma é
uma linha de de/para **INATIVA**, e não a ausência de linha, para ficar registrado como decisão
deliberada em vez de esquecimento (o resolvedor já trata linha inativa como não mapeada).

As onze marginais, cada uma em 1 ou 2 vagas, com a proposta da fábrica para o diretor fechar:

| chave | proposta | por quê |
|---|---|---|
| `triagem` | TRIAGEM | o nome é a etapa |
| `triado` | TRIAGEM | variação de `triados`, que já está mapeada para TRIAGEM |
| `testes` | TRIAGEM | teste é instrumento de triagem, não etapa própria |
| `entrevistas soulan` | ENTREVISTA_SOULAN | plural de `entrevista soulan`, já mapeada |
| `entrevista` | ENTREVISTA_SOULAN | ambígua; na dúvida, a nossa, que é a que o time conduz |
| `entrevista cliente` | ENTREVISTA_CLIENTE | o nome é a etapa |
| `enviados para cliente` | ENTREVISTA_CLIENTE | variação de `short list encaminhados cliente` |
| `encaminhados cliente` | ENTREVISTA_CLIENTE | a mesma variação |
| `etapa inteligente` | CAPTACAO | irmã de `entrevista inteligente`, que o diretor mandou para CAPTACAO |
| `admissao` | APROVACAO + `ENVIADO_PARA_ADMISSAO` | mesmo destino de `contratados`, já mapeada |
| `abordados` | CAPTACAO | primeiro contato, como `lead` e `inscritos` |

**A normalização já existe e não se reinventa:** `lerLinhaDePara` casa por chave normalizada, que é o
que faz `triados` e `TRIADOS` caírem na mesma linha.

---

## DECISÃO 1, o arnês do lote fabricado

Alimenta a varredura com um lote inventado **pelo caminho real de escrita**: o mesmo ciclo, o mesmo
de/para, o mesmo repositório, as mesmas guardas. É o que o `seguranca` exigiu para a validação na
homologação, porque rodar a varredura real lá escreveria dado pessoal de gente real num database
declarado "clone ANONIMIZADO".

**Requisitos:**
- roda **fora da suíte**, sob comando, e **nunca no boot**;
- **recusa rodar contra produção**, por guarda no próprio arnês que confere o nome do database;
- o lote cobre as cinco fases do guia: uma vaga com três etapas mapeadas, a repetição idêntica, a
  pasta sem de/para, e o ciclo de vida da vaga (sai das ativas, volta);
- **§A.6: dado 100% sintético.** Nenhum CPF, nome, e-mail ou telefone real, nem "só para ilustrar".

---

## DECISÃO 5, teste com Postgres real

**REGISTRADA como frente própria, para depois. Não construir agora.** É o segundo incidente da mesma
família (o primeiro derrubou a tela da régua em produção por um `ON CONFLICT` que não inferia índice
parcial; o segundo foi o `encerrarAusentes` inexecutável). O remendo do teste por forma está no lugar
nos dois casos.
