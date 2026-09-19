# MAPA DE ALCANCE: a tela "Liberar Vaga" com o formulário completo, a simulação e as decisões

Levantado pelo coordenador (§A.39 passo 1, §A.26, §A.27) ANTES de despachar. §A.11: sem travessão.

---

## O ACHADO QUE MUDA O RECORTE: a régua de obrigatórios da abertura NÃO inclui benefícios

`VAGA_OBRIGATORIOS` (shared-types), mais a entrada da linha de serviço (`domain/vaga-obrigatorios.ts`),
cobra exatamente DEZ campos: **cliente, código da vaga, nome de divulgação, cargo, nº de posições
oficiais, natureza, sazonalidade, linha de serviço, status e data de abertura**.

**Salário, benefícios e escala NÃO são obrigatórios na abertura de hoje.** Eles existem no
formulário (`salarioAbertura`, `beneficios[]`, `horarioEscala`) e são OPCIONAIS. "Endereço" não
existe como campo da vaga: o que a vaga tem é **cidade** (`cidadeId`); o endereço completo vive na
admissão (`dados_vaga_folha.endereco`, §A.3).

Então há DUAS leituras do pedido, e elas dão trabalhos diferentes:
- **(i) o formulário completo, com a régua de hoje:** a liberação passa a pedir todos os campos da
  abertura, e recusa pelos mesmos dez obrigatórios. Não toca a abertura;
- **(ii) tornar salário, benefícios e escala OBRIGATÓRIOS:** muda `VAGA_OBRIGATORIOS`, que é a régua
  ÚNICA e declarativa. Isso alcança **a abertura de vaga também** (asterisco, lista de pendências,
  recusa do publicar) e **toda vaga em rascunho que hoje passa sem eles**. É decisão do diretor.

A fábrica constrói a **(i)** e leva a **(ii)** como pergunta (§A.31: propõe, não constrói).

## O QUE A LIBERAÇÃO FAZ HOJE, e o que falta

`liberarPendenteRevisao` (`vagas.service.ts:3060+`) recebe só `codCliente`, confere o cliente contra
o cadastro, exige que a vaga esteja no papel REVISAO, grava o vínculo e move para o papel ABERTURA,
tudo numa transação. **Ela NÃO aplica a régua dos dez obrigatórios.** A vaga do Pandapé sai da fila
com código, cargo, natureza, linha de serviço e data de abertura possivelmente vazios.

Quem aplica a régua hoje é a trilha de abertura do RASCUNHO (`vagas.service.ts:1398`,
`pendenciasDaVaga`). O `moverStatus` recusa explicitamente publicar uma vaga em REVISAO e manda usar
a liberação (`:2954`), então **a liberação é a única porta**, e é nela que a régua precisa entrar.

## O PONTO CARO: o formulário da abertura NÃO é componente

O wizard vive DENTRO de `app/(app)/as/vagas/page.tsx`, que tem **5.899 linhas**, na função
`CentralDeVagasPage` (linha 912). Não existe `FormularioDeVaga` para importar. Reusar de verdade
(§A.26, não duplicar) exige escolher entre:
- **A. extrair** o formulário para um componente compartilhado. É o reuso certo e o risco maior:
  cirurgia numa tela validada e crítica;
- **B. levar a liberação para a trilha que já existe**, abrindo a vaga do Pandapé no mesmo wizard em
  modo "completar", e deixando a liberação ser o passo final dele;
- **C. formulário próprio na tela da fila**, consumindo a mesma régua declarativa. É o menor risco
  imediato e a duplicação que a §A.26 manda evitar.

A escolha é de arquitetura e vai para o `arquiteto` (§A.39: ele entrega PLANO, não código).

**Em qualquer das três, o backend muda:** hoje `atualizar` (PATCH) exige papel RASCUNHO
(`vagas.service.ts:976`), então **a vaga em REVISAO não é editável por nenhuma rota**. Ou a edição
passa a aceitar o papel REVISAO, ou os campos viajam no corpo da liberação. As duas mexem em régua
auditada.

## CONTAGENS QUE MUDAM (§A.27)

A vaga em REVISAO já aparece na Central de Vagas e nos KPIs (`list()` não filtra status). Acrescentar
a régua na liberação **não muda contagem**: muda quem consegue sair da fila. A simulação de
candidatos **muda todos os números da homologação** (funil, cilindro, KPIs, Central de Candidatos),
e é isso que o diretor quer ver.

## O QUE É PEQUENO E NÃO PRECISA DE AGENTE

- **Renomear o menu** para "Liberar Vaga" (`domain/menus.ts` e o que consumir o rótulo). Coordenador,
  direto.
- **As duas linhas inativas** (`finalistas`, `retorno negativo etapa soulan`): decisão tomada, FICAM
  inativas. Nada a fazer.
- **A tela do rastro de correções de cliente**: anotada para depois, frente nova. Não construir.

## O QUE TOCA A §A.6, e por isso vai ao `seguranca` ANTES (§A.40 regra 1)

1. **A simulação de candidatos** escreve pessoa (nome, CPF, e-mail, telefone) no database declarado
   "clone ANONIMIZADO". Só dado sintético, pelo arnês, que recusa produção por allowlist.
2. **O sal fixo da pseudonimização**: a marca da chave externa passa a ser salgada, para deixar de
   ser confirmável por quem já suspeita do nome. É onde o sal mora, como ele nasce e o que acontece
   quando ele falta que precisa de auditoria.
