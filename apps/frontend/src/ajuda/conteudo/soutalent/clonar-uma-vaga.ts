import type { Artigo } from "../../tipos";

/**
 * ─ CLONAR UMA VAGA: abrir a próxima aproveitando o cadastro da anterior ─────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: de onde se clona (de qualquer vaga, inclusive encerrada), o que vem
 * copiado, o que NÃO vem, e o que precisa ser conferido antes de publicar.
 *
 * ┌─ O QUE NÃO É COPIADO, E ESTE É O PONTO INTEIRO DO ARTIGO ────────────────────────────────────┐
 * │ O CÓDIGO DA VAGA NÃO VEM. Conferido no componente da trilha: o clone entra com o campo do     │
 * │ código VAZIO, enquanto o rascunho o traz de volta. A razão está escrita ao lado da regra e é   │
 * │ ela que o artigo ensina: o código é o número do processo seletivo, e cada abertura tem o seu.  │
 * │ As DATAS seguem a mesma lógica: a data de abertura nasce com hoje (copiar a da vaga antiga     │
 * │ dataria a vaga nova no passado), e o prazo e o envio da shortlist nascem vazios.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ELA **NÃO** REEXPLICA A TRILHA ─────────────────────────────────────────────────────────────┐
 * │ Os passos e os campos estão em "abrir-uma-vaga-nova", e o clone é aquela MESMA janela já       │
 * │ preenchida. Aqui fica só o que muda: o que veio copiado, o que veio vazio, e o que conferir.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o passo da substituição encosta em dado de terceiro, então ele descreve O CAMPO e manda
 * conferir, sem nenhum valor de exemplo: nome e número de documento de pessoa não entram em artigo.
 * NENHUM print é declarado, e aqui o veto é explícito: a trilha desenha o documento da pessoa
 * substituída, e a auditoria vetou a captura desta janela. O texto funciona sem imagem.
 */
export const artigo: Artigo = {
  slug: "clonar-uma-vaga",
  titulo: "Clonar Uma Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-vagas",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como abrir uma vaga nova aproveitando o cadastro de outra, inclusive de uma vaga já encerrada, e por que o código da vaga não é copiado.",
  termos: [
    "clonar vaga",
    "copiar vaga",
    "duplicar vaga",
    "abrir vaga igual a outra",
    "mesma vaga de novo",
    "repetir vaga",
    "reabrir o mesmo processo",
    "vaga parecida",
  ],
  preRequisitos: [
    "Ter em mãos o número do processo seletivo da abertura NOVA: ele não vem copiado.",
  ],
  passos: [
    {
      gesto: "Encontre na lista a vaga que vai servir de modelo.",
      detalhe:
        "Clonar vale para qualquer vaga, inclusive fechada e cancelada. É justamente da vaga encerrada que costuma nascer a abertura seguinte do mesmo cliente.",
    },
    {
      gesto: "Clique em Gestão Da Vaga e depois em Clonar vaga.",
      detalhe:
        "A trilha abre com os campos da vaga modelo já preenchidos. A vaga modelo não é alterada em nada, e nada é gravado ainda.",
      controles: ["Clonar vaga"],
    },
    {
      gesto: "Digite o Código da vaga da abertura nova.",
      detalhe:
        "O campo abre vazio de propósito: o código é o número do processo seletivo e cada abertura tem o seu, então ele nunca é copiado.",
      controles: ["Código da vaga"],
    },
    {
      gesto: "Confira as datas do passo de quem pediu.",
      detalhe:
        "A data de abertura nasce com hoje, porque copiar a data da vaga antiga dataria a vaga nova no passado. O prazo de entrega e o envio da shortlist nascem vazios, para você informar os desta abertura.",
    },
    {
      gesto: "Confira o que veio copiado e ajuste o que mudou.",
      detalhe:
        "Cliente, cargo, nome de divulgação, número de posições, condições, requisitos e benefícios vieram da vaga modelo. Salário e escala são os campos que mais mudam entre uma abertura e a seguinte.",
    },
    {
      gesto:
        "Se o motivo da contratação for substituição, confira o nome e o documento da pessoa substituída.",
      detalhe:
        "Esses dois campos vêm copiados da vaga modelo, e a abertura nova quase sempre substitui outra pessoa. Corrija os dois ou limpe-os antes de publicar.",
    },
    {
      gesto: "No último passo, clique em Abrir Vaga para publicar.",
      detalhe:
        "Enquanto você não clicar em Abrir Vaga ou em Salvar Rascunho, o clone não existe: ele é uma abertura nova, e não uma cópia já gravada.",
      controles: ["Abrir Vaga"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O campo do código veio em branco.",
      acao: "É o comportamento correto. O código é o número do processo seletivo desta abertura, e cada abertura tem o seu, mesmo com o cliente e o cargo iguais aos da vaga modelo.",
    },
    {
      sintoma: "O código que eu digitei foi recusado.",
      acao: "A mensagem diz que aquele código já está em uso por outra vaga, porque cada processo seletivo tem um código próprio. Confira o número desta abertura no Pandapé e digite o dela, não o da vaga modelo.",
    },
    {
      sintoma: "Cliquei em Clonar vaga e fiquei na dúvida se mexi na vaga original.",
      acao: "Não mexeu. Clonar só preenche um formulário novo com os dados dela: a vaga modelo continua exatamente como estava, inclusive se estiver encerrada.",
    },
    {
      sintoma: "Fechei a janela e o clone não apareceu na lista.",
      acao: "O clone só passa a existir quando você clica em Salvar Rascunho ou em Abrir Vaga. Fechar antes disso não deixa vaga nenhuma no sistema.",
    },
    {
      sintoma: "A vaga modelo é antiga e alguns campos vieram vazios.",
      acao: "Campo que ainda não existia quando aquela vaga foi aberta abre vazio, e não impede o clone. Preencha o que faltar: a cobrança dos obrigatórios acontece na publicação.",
    },
    {
      sintoma: "Eu queria só corrigir a vaga que já existe, não abrir outra.",
      acao: "Clonar sempre gera uma abertura nova. Para ajustar os contadores da vaga viva, use editar posições; para mudar o estado dela, use mover status; para completar uma vaga guardada, use continuar rascunho.",
    },
  ],
  regras: [
    "O código da vaga não é copiado: ele é o número do processo seletivo, e cada abertura tem o seu.",
    "A data de abertura do clone é a de hoje. O prazo de entrega e o envio da shortlist nascem vazios.",
    "Clonar vale para qualquer vaga, inclusive fechada e cancelada, e não altera a vaga modelo.",
    "O clone é uma abertura nova: ele só existe depois de guardar como rascunho ou publicar.",
    "Os dados da substituição vêm copiados da vaga modelo e precisam ser conferidos antes de publicar.",
    "A classificação do clone herda a da vaga modelo do mesmo jeito: onde a original acompanhava o cadastro do cliente, o clone também acompanha.",
    "Nenhum candidato é copiado. O clone traz o cadastro da vaga, nunca as pessoas do processo anterior.",
  ],
  relacionados: [
    "abrir-uma-vaga-nova",
    "continuar-um-rascunho-de-vaga",
    "fechar-a-vaga",
    "abrir-o-painel-da-vaga",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/TrilhaDaVaga.tsx",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
