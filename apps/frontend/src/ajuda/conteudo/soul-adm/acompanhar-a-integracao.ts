import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA INTEGRAÇÃO: marcar a integração e confirmar que ela aconteceu.
 *
 * ┌─ A ABA TEM COMPOSIÇÃO PRÓPRIA, E O ARTIGO PRECISA DIZER ISSO ────────────────────────────────┐
 * │ Ela é a única em que o seletor de status vive DENTRO da coluna Status (não há coluna de avanço), │
 * │ em que a LINHA INTEIRA é pintada por um farol de fundo, e em que a coluna de pendências           │
 * │ obrigatórias não existe. Quem chega aqui depois de trabalhar a Auditoria procura controles que    │
 * │ não estão no lugar de sempre, e é isso que os passos 4 e 6 endereçam.                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O GATE QUE NÃO É GATE DE FRENTE, E QUE MAIS GERA CHAMADO ───────────────────────────────────┐
 * │ Marcar Agendado exige o AGENDAMENTO COMPLETO (data, horário, tipo e consultor), e esse bloqueio  │
 * │ é DURO: não tem aceite, não tem exceção de papel. O erro do backend diz exatamente quais campos  │
 * │ faltam, e o artigo manda o caminho certo, que é a janela de agendamento, em vez de o seletor.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU FORA ──────────────────────────────────────────────────────────────────────────┐
 * │ Desconsiderar (concluir a admissão sem integração) é recurso de exceção e é N2, então não entra  │
 * │ no caminho principal. O agendamento EM MASSA entra, porque agendar uma turma junta é o jeito     │
 * │ normal de trabalhar esta fila, e não uma exceção; o gesto de selecionar várias linhas tem artigo │
 * │ próprio no módulo de padrões, e este referencia em vez de reexplicar.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "acompanhar-a-integracao",
  titulo: "Acompanhar A Integração",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como trabalhar a última etapa da esteira: agendar a integração de um candidato ou de uma turma, informar data, horário, modalidade e consultor, e marcar como realizada.",
  termos: [
    "integracao",
    "integrar",
    "boas vindas",
    "agendar",
    "agendamento",
    "agenda",
    "marcar integracao",
    "a agendar",
    "agendado",
    "realizado",
    "online",
    "presencial",
    "link da reuniao",
    "meet",
    "consultor",
    "turma",
    "agendar em massa",
    "ficha da integracao",
    "apresentacao",
  ],
  preRequisitos: [
    "A frente de Integração já precisa ter nascido para aquela admissão: ela abre junto do Cadastro, quando a Auditoria e o Exame fecham, e só para o cliente que exige integração.",
    "Ter em mãos a data, o horário, a modalidade e quem vai conduzir. Sem os quatro, o sistema grava o agendamento parcial mas não deixa marcar como Agendado.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba Integração.",
      controles: ["Esteira Admissional", "Farol Admissional", "INTEGRAÇÃO"],
      print: {
        arquivo: "01-aba-integracao.png",
        legenda: "Passo 1: a aba Integração aberta, com a fila e o farol de cor nas linhas.",
      },
    },
    {
      gesto: "Varra a fila pela cor de fundo da linha antes de olhar coluna por coluna.",
      detalhe:
        "Fundo avermelhado é ninguém agendou ainda, amarelo é agendado e esperando confirmação, verde é integração realizada. A cor lê o mesmo dado das colunas, então ela nunca discorda da linha.",
      controles: ["A Agendar", "Agendado", "Realizado", "Integrações Realizadas", "Total na fila"],
    },
    {
      gesto: "Ache a pessoa pela busca do topo, ou recorte a fila pelo ícone de funil.",
      detalhe:
        "Esta aba tem filtros próprios, que as outras não têm: data de integração, horário, tipo e consultor, além dos de sempre.",
      controles: [
        "Buscar por nome, CPF ou cliente",
        "Abrir filtros",
        "Data de Integração",
        "Horário Da Integração",
        "Tipo De Integração",
        "Consultor",
      ],
    },
    {
      gesto: "Leia as quatro colunas do agendamento na linha.",
      detalhe:
        "Data de Agendamento é o dia marcado, e não se confunde com Data adm., que é a data de admissão da pessoa. Horário, Tipo e Consultor completam o quadro. Onde ainda não há agendamento, a célula mostra um traço discreto.",
      controles: [
        "Data adm.",
        "Data de Agendamento",
        "Horário",
        "Tipo",
        "Consultor",
        "Online",
        "Presencial",
      ],
    },
    {
      gesto: "Clique no relógio da coluna Ações para abrir o agendamento daquela pessoa.",
      detalhe: "É por essa janela que o agendamento entra, nunca pelo seletor de status.",
      controles: ["Ações", "Agendar integração"],
      print: {
        arquivo: "02-botao-agendar.png",
        legenda: "Passo 5: o relógio da coluna Ações, que abre o agendamento da integração.",
      },
    },
    {
      gesto: "Preencha data, horário, tipo e consultor responsável, e clique em Salvar e agendar.",
      detalhe:
        "Os quatro são obrigatórios. Escolhendo Online aparece o campo do link da reunião, que é opcional: a sala costuma ser criada depois da data marcada. Ao salvar, a frente passa a Agendado sozinha.",
      controles: [
        "Agendamento Da Integração",
        "Data",
        "Horário",
        "Tipo",
        "Consultor responsável",
        "Link da reunião",
        "Salvar e agendar",
        "Cancelar",
      ],
      print: {
        arquivo: "03-janela-de-agendamento.png",
        legenda: "Passo 6: a janela Agendamento Da Integração, com os quatro campos obrigatórios.",
      },
    },
    {
      gesto:
        "Para uma turma inteira, marque as pessoas pela caixa da esquerda e clique em Agendar em massa.",
      detalhe:
        "Um agendamento só atende todas as marcadas. Clientes diferentes podem ser agendados juntos, e a tela avisa isso para você saber que é de propósito.",
      controles: [
        "Selecionar todos os candidatos da fila",
        "Agendar em massa",
        "Limpar seleção",
        "Clientes diferentes podem ser agendados juntos.",
      ],
    },
    {
      gesto:
        "Depois da integração acontecer, abra o seletor da coluna Status na linha e escolha Realizado.",
      detalhe:
        "Nesta aba o seletor vive dentro da própria coluna Status, porque aqui ele é o avanço. Realizado conclui a frente, encerra a esteira daquela pessoa e tira a linha da fila.",
      controles: ["Status", "Realizado"],
    },
    {
      gesto: "Use o olho da coluna Ações quando precisar conduzir a conversa com a pessoa.",
      detalhe:
        "Ele abre a ficha da integração, que reúne o contrato de trabalho e os benefícios daquela admissão em uma tela só de leitura.",
      controles: ["Ver ficha (somente leitura)", "Ficha Da Integração", "Contrato De Trabalho", "Benefícios"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "Escolhi Agendado no seletor e o sistema recusou, dizendo o que falta preencher.",
      acao: "Esse bloqueio não tem aceite: a frente não diz Agendado sem haver agendamento. Abra o relógio da coluna Ações, complete os quatro campos e salve. Salvar já move a frente para Agendado, então você não precisa voltar ao seletor.",
    },
    {
      sintoma: "A pessoa não aparece nesta aba, mas o cadastro dela já concluiu.",
      acao: "A frente de Integração nasce só para cliente que exige integração. Quando o cliente não exige, a admissão fecha no Cadastro e nunca passa por esta fila.",
    },
    {
      sintoma: "Marquei a modalidade como Online e esqueci o link da reunião.",
      acao: "O link é opcional de propósito e pode ser preenchido depois: abra o relógio de novo e salve com o endereço da sala. Trocar para Presencial limpa o link.",
    },
    {
      sintoma: "A coluna Data de Agendamento e a coluna Data adm. estão me confundindo.",
      acao: "Data adm. é a data em que a pessoa é admitida; Data de Agendamento é o dia marcado para a integração. Elas ficam lado a lado de propósito, e o filtro Data de Integração recorta a segunda.",
    },
    {
      sintoma:
        "Selecionei gente de clientes diferentes para agendar junto e fiquei em dúvida se podia.",
      acao: "Pode. Uma integração das 14h atende gente de clientes diferentes, e a tela avisa isso ao lado do botão justamente para não parecer engano.",
    },
    {
      sintoma: "Não encontro a coluna de pendências obrigatórias nesta aba.",
      acao: "Ela não existe aqui: esta aba tem composição própria, voltada ao agendamento. As pendências obrigatórias continuam nas outras abas e no Gerenciador.",
    },
  ],
  regras: [
    "A Integração é a última etapa da esteira. A frente nasce junto do Cadastro, quando a Auditoria e o Exame fecham, e só para o cliente que exige integração.",
    "Marcar Agendado exige o agendamento completo: data, horário, tipo e consultor. É bloqueio duro, sem aceite e sem exceção.",
    "Salvar o agendamento já move a frente para Agendado: não é preciso mexer no seletor depois.",
    "Realizado conclui a frente e encerra a esteira daquela pessoa, que passa a viver no Gerenciador.",
    "A integração corre em paralelo com a assinatura do contrato, e não depois dela: dá para estar em integração com o contrato ainda em assinatura.",
    "Nesta aba o seletor de status vive dentro da coluna Status, porque aqui ele é o avanço.",
    "A cor de fundo da linha lê o mesmo dado que as colunas mostram, então nunca discorda delas.",
    "Clientes diferentes podem ser agendados na mesma integração.",
  ],
  relacionados: [
    "concluir-o-cadastro-e-o-contrato",
    "agir-em-varias-linhas-de-uma-vez",
    "filtrar-uma-lista",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/AgendamentoIntegracaoModal.tsx",
    "apps/frontend/src/components/esteira/AgendamentoIntegracaoLoteModal.tsx",
    "apps/frontend/src/components/esteira/ApresentacaoIntegracaoModal.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
