import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA INTEGRAÇÃO: a janela do agendamento EM MASSA, campo por campo.
 *
 * ┌─ O QUE O ARTIGO IRMÃO JÁ COBRE, E POR ISSO SAI DAQUI ───────────────────────────────────────┐
 * │ O artigo de acompanhar a integração ensina a fila, o farol de cor da linha, as quatro colunas   │
 * │ do agendamento, o agendamento de UM e a marcação de realizado. Este aqui é a turma: o que a     │
 * │ janela do lote pede, o que ela faz diferente do individual e o aviso de quem já tem            │
 * │ agendamento. O gesto de marcar várias linhas tem artigo próprio no módulo de padrões, e é       │
 * │ apontado em vez de reexplicado.                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS DIFERENÇAS DO LOTE, LIDAS DO COMPONENTE ───────────────────────────────────────────┐
 * │ Ele é um componente SEPARADO do individual de propósito, e as regras são outras: os quatro      │
 * │ campos são obrigatórios, salvar JÁ move as frentes para agendado (no individual quem avança é o │
 * │ consultor pelo seletor) e existe um passo de confirmação de sobreposição que o individual não   │
 * │ tem. Quem aprendeu o individual e assume que o lote é igual erra nas três.                     │
 * │ (`AgendamentoIntegracaoLoteModal.tsx`, `esteira.service.agendarIntegracaoLote`.)               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O EFEITO NO FAROL DA ADMISSÃO, MEDIDO ─────────────────────────────────────────────────────┐
 * │ AGENDAR NÃO MEXE NO FAROL. O caminho do lote grava o status da frente e o evento da trilha, e   │
 * │ nada mais: o carimbo de admissão concluída é escrito só na conclusão da integração, nunca no    │
 * │ agendamento. O artigo diz isso para ninguém esperar que a turma agendada saia das contagens.   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o aviso de sobreposição lista NOMES de pessoas. Nenhum valor foi copiado para este texto, e
 * o que se descreve é a lista, nunca quem está nela.
 *
 * IMAGEM: pendência conhecida, não esquecimento. A fila e o aviso mostram pessoa, e a captura foi
 * vetada enquanto a homologação não tiver base sintética. O texto funciona sem imagem.
 */
export const artigo: Artigo = {
  slug: "agendar-a-integracao-de-uma-turma",
  titulo: "Agendar A Integração De Uma Turma",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como agendar a integração de várias pessoas de uma vez: os campos que a janela do lote pede, o que salvar já faz e o aviso de quem já tinha agendamento.",
  termos: [
    "agendar turma",
    "agendar em massa",
    "agendar varios",
    "agendar todos",
    "integracao da turma",
    "turma de integracao",
    "marcar integracao de varios",
    "mesmo horario para todos",
    "agendamento em lote",
    "sobrescrever agendamento",
    "ja tem agendamento",
    "trocar data da turma",
  ],
  preRequisitos: [
    "As pessoas já precisam estar na frente de Integração: quem não está não entra no lote.",
    "Ter a data, o horário, a modalidade e quem vai conduzir. No lote os quatro são obrigatórios.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba Integração.",
      controles: ["Esteira Admissional", "INTEGRAÇÃO"],
    },
    {
      gesto: "Marque as pessoas da turma pela caixa da esquerda de cada linha.",
      detalhe:
        "A caixa do cabeçalho marca a fila inteira que está na tela, já respeitando o filtro. A barra de ações aparece assim que a primeira linha é marcada.",
      controles: ["Selecionar todos os candidatos da fila", "Limpar seleção"],
    },
    {
      gesto: "Clique em Agendar em massa, na barra que apareceu acima da lista.",
      detalhe:
        "O botão traz entre parênteses quantas pessoas estão marcadas: confira esse número antes de abrir a janela.",
      controles: ["Agendar em massa", "Clientes diferentes podem ser agendados juntos."],
    },
    {
      gesto: "Confira, no alto da janela, quantos candidatos estão selecionados.",
      detalhe:
        "É a última chance de perceber que sobrou ou faltou alguém, porque daqui para frente os mesmos dados valem para todos.",
      controles: ["Agendar Em Massa"],
    },
    {
      gesto: "Preencha Data e Horário.",
      detalhe: "São os dois campos do alto, lado a lado, e valem para a turma inteira.",
      controles: ["Data", "Horário"],
    },
    {
      gesto: "Escolha o Tipo entre Online e Presencial.",
      detalhe:
        "Escolhendo Online, aparece o campo do link da reunião, que é opcional: a sala costuma ser criada depois de a data ser marcada. O mesmo endereço vale para o grupo inteiro, e voltar para Presencial descarta o link.",
      controles: ["Tipo", "Online", "Presencial", "Link da reunião"],
    },
    {
      gesto: "Escolha o Consultor responsável.",
      detalhe: "A lista tem busca: digite as primeiras letras em vez de rolar até achar.",
      controles: ["Consultor responsável"],
    },
    {
      gesto: "Leia o aviso de apoio abaixo dos campos antes de salvar.",
      detalhe:
        "Ele diz que os mesmos dados são aplicados a todos os selecionados, que passam a agendado, e que pessoas de clientes diferentes podem ser agendadas juntas.",
    },
    {
      gesto: "Clique em Agendar.",
      detalhe:
        "O botão fica apagado enquanto faltar um dos quatro campos. Salvar grava o agendamento e já move as frentes para Agendado, então não é preciso voltar ao seletor de status de cada linha.",
      controles: ["Agendar", "Cancelar"],
    },
    {
      gesto:
        "Havendo alguém que já tinha agendamento, leia a lista do aviso e decida antes de confirmar.",
      detalhe:
        "A janela mostra quantas dessas pessoas existem, lista os nomes e avisa que confirmar substitui a data, o horário, o tipo e o consultor atuais deles. O botão passa a ser o de sobrescrever.",
      controles: ["Confirmar e sobrescrever"],
    },
    {
      gesto: "Confira o aviso verde da tela e a fila recarregada.",
      detalhe:
        "A seleção é limpa sozinha depois do agendamento, e as linhas passam a mostrar a data, o horário, o tipo e o consultor nas colunas do agendamento.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de agendar fica apagado e eu não sei o que falta.",
      acao: "Falta um dos quatro campos: data, horário, tipo ou consultor responsável. No lote todos são obrigatórios, porque salvar move a turma inteira para agendado de uma vez. O link da reunião não conta, ele é opcional.",
    },
    {
      sintoma: "A janela avisa que alguns selecionados já têm agendamento.",
      acao: "A mensagem é \"Alguns selecionados já têm agendamento. Confirme para sobrescrever os dados atuais.\" Nada foi gravado ainda. Leia a lista de nomes: querendo trocar o agendamento deles, confirme; não querendo, cancele e tire essas pessoas da seleção.",
    },
    {
      sintoma: "O sistema diz que nenhum dos selecionados está na frente de Integração.",
      acao: "O texto exato é \"Nenhum dos selecionados está na frente de Integração.\" A frente nasce só para o cliente que exige integração, e agendar quem não está nela seria criar trabalho que a esteira não pediu. Confira se a seleção não ficou de outra aba.",
    },
    {
      sintoma: "Agendei o lote e falta uma pessoa que eu tinha marcado.",
      acao: "Quem não tem a frente de Integração é ignorado pelo lote, sem travar o resto. Procure essa pessoa na aba: não estando lá, o cliente dela não exige integração.",
    },
    {
      sintoma: "A janela diz que houve falha ao agendar o lote.",
      acao: "Nada foi gravado pela metade: a gravação do lote é uma só, ou vale para todos ou não vale para nenhum. Tente de novo e, persistindo, avise a TI.",
    },
    {
      sintoma: "Preciso corrigir só uma pessoa da turma.",
      acao: "Use o relógio da coluna Ações naquela linha, que é o agendamento individual. Reabrir o lote para uma pessoa só reescreveria os dados de todos os selecionados.",
    },
    {
      sintoma: "Agendei a turma e as admissões continuam contando como em andamento.",
      acao: "É o esperado: agendar não encerra nada. O que fecha a frente e encerra a esteira é marcar a integração como realizada, depois que ela acontecer.",
    },
  ],
  regras: [
    "No lote os quatro campos são obrigatórios: data, horário, tipo e consultor responsável.",
    "Salvar o lote já move as frentes para agendado. Isso é diferente do agendamento de um, em que o consultor avança pelo seletor.",
    "Os mesmos dados valem para todas as pessoas marcadas, inclusive o link da reunião.",
    "Pessoas de clientes diferentes podem ser agendadas na mesma integração, de propósito.",
    "Quem não está na frente de Integração não entra no lote e não trava o restante.",
    "Quem já tinha agendamento só é sobrescrito com confirmação expressa, e a confirmação troca data, horário, tipo e consultor.",
    "A gravação é uma só: ou a turma inteira é agendada, ou nada é.",
    "Agendar não mexe no farol da admissão. Quem encerra a esteira é a conclusão da integração.",
    "O link da reunião só existe na modalidade online, e trocar para presencial o descarta.",
  ],
  relacionados: [
    "acompanhar-a-integracao",
    "abrir-a-ficha-da-integracao",
    "agir-em-varias-linhas-de-uma-vez",
    "filtrar-uma-lista",
    "abrir-e-fechar-uma-janela-do-sistema",
    "concluir-o-cadastro-e-o-contrato",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AgendamentoIntegracaoLoteModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
