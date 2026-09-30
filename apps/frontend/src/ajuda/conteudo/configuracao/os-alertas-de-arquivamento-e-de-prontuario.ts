import type { Artigo } from "../../tipos";

/**
 * FICHA: os cinco alertas do Diagnóstico Do Sistema que falam de pasta no Drive, e o que fazer em
 * cada um.
 *
 * COBRE por que eles são CINCO e não um: os cinco terminam com documento fora da pasta certa, mas o
 * conserto de cada um é diferente, e usar o botão do vizinho não resolve. O que separa os casos é a
 * pergunta "a pasta existe?": não existe e o cliente não tem pasta cadastrada, cadastra-se a pasta;
 * não existe porque a régua nunca fechou, gera-se o prontuário; existe e o sistema não sabe dela,
 * liga-se à pasta; existe e o arquivamento caiu no meio, rearquiva-se.
 *
 * COBRE também as duas baixas que NÃO consertam nada e só apagam o aviso, porque elas são as mais
 * fáceis de usar por engano: quem clica nelas achando que resolveu o caso apaga o único lugar em que
 * o caso estava visível.
 *
 * NÃO COBRE a leitura da tela nem as outras faixas: isso é da peça de leitura, em `relacionados`.
 *
 * NÃO COBRE como cadastrar a pasta de um cliente, que tem artigo próprio e é onde aquele gesto é
 * ensinado por inteiro. Aqui fica só a ponte.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: os gestos desta peça falam com o Google Drive. O cartão do Drive, na
 * segunda faixa da mesma tela, é o que diz se aquele serviço está respondendo, e nenhum destes
 * botões conclui enquanto ele não estiver.
 */
export const artigo: Artigo = {
  slug: "os-alertas-de-arquivamento-e-de-prontuario",
  titulo: "Os Alertas De Arquivamento E De Prontuário",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/diagnostico"],
  menus: ["diagnostico"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "saude-do-sistema",
  resumo:
    "Os alertas do Diagnóstico Do Sistema que falam de pasta no Drive: o que cada um quer dizer, qual botão resolve qual caso, e quais baixas só apagam o aviso sem consertar nada.",
  termos: [
    "documento nao foi para o drive",
    "prontuario nao criado",
    "pasta nao existe",
    "arquivamento falhou",
    "rearquivar",
    "gerar prontuario",
    "pasta duplicada",
    "cliente sem pasta",
    "faltou pasta no drive",
    "ligar a pasta existente",
  ],
  preRequisitos: [
    "Ter conferido, na segunda faixa da tela, que o cartão do Google Drive não está fora nem degradado.",
  ],
  passos: [
    {
      gesto: "Abra o cartão de régua fechada sem pasta no Drive.",
      detalhe:
        "São os casos em que a conferência dos documentos terminou e a pasta do funcionário não ficou registrada. É o alerta mais comum dos cinco.",
      controles: ["Régua fechada sem pasta no Drive"],
    },
    {
      gesto: "Clique em Rearquivar na linha do funcionário.",
      detalhe:
        "O sistema tenta o arquivamento de novo, do começo. É o botão para quando a pasta não existe e precisa ser criada e preenchida.",
      controles: ["Rearquivar"],
    },
    {
      gesto: "Existindo a pasta no Drive, use Ligar à pasta existente em vez de rearquivar.",
      detalhe:
        "O sistema pede o link da pasta que já tem os documentos e grava esse link na admissão. Serve para quando o arquivamento caiu no meio: o material está lá, só o registro do link não ficou.",
      controles: ["Ligar à pasta existente"],
    },
    {
      gesto: "Abra o cartão de admissão concluída sem prontuário e clique em Gerar prontuário.",
      detalhe:
        "É o caso da admissão que terminou sem a conferência de documentos fechar, então a pasta nunca chegou a ser criada. O sistema cria a pasta e mostra um atalho para abri-la no Drive. Ele não duplica: já existindo a pasta, ele só liga a admissão a ela e avisa.",
      controles: ["Concluída Sem Prontuário", "Gerar prontuário", "Prontuário no Drive"],
    },
    {
      gesto: "Abra o cartão de cliente sem pasta principal e clique em Cadastrar pasta.",
      detalhe:
        "O alerta quer dizer que falta a pasta principal daquele cliente, então não há onde criar o prontuário. O botão leva direto para a tela de Pastas Do Drive, já com o código do cliente preenchido. Cadastrada a pasta, volte e use o Rearquivar.",
      controles: ["Cliente Fopag sem pasta-pai no Drive", "Cadastrar pasta"],
    },
    {
      gesto: "Abra o cartão de arquivamento falhou e leia o detalhe de cada linha antes de qualquer botão.",
      detalhe:
        "O detalhe traz o motivo real da falha, e é ele que diz se o caso se resolve com o Rearquivar ou se precisa de alguém.",
      controles: ["Arquivamento No Drive Falhou"],
    },
    {
      gesto: "Use Zerar pendência e Zerar sinal só depois de confirmar que o caso está resolvido.",
      detalhe:
        "Esses dois não consertam nada: apagam o aviso e registram quem deu a baixa. No caso de pasta duplicada, nenhuma pasta é apagada no Drive, a remoção continua sendo feita à mão.",
      controles: ["Zerar pendência", "Pasta duplicada no Drive", "Zerar sinal"],
    },
    {
      gesto: "Feche a janela e clique em Atualizar para ver o número cair.",
      detalhe: "O cartão só reflete o resultado depois de uma fotografia nova da tela.",
      controles: ["Fechar", "Atualizar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você clicou em Rearquivar e o alerta continua lá.",
      acao: "Abra o cartão de novo e leia o detalhe da linha: ele traz o motivo da falha. Faltando a pasta principal do cliente, o rearquivamento não tem onde gravar, e o caminho é cadastrar a pasta primeiro.",
    },
    {
      sintoma: "Ao gerar o prontuário, o sistema avisa que a pasta já existia.",
      acao: "É a proteção contra pasta duplicada. Nada foi criado de novo: a admissão só foi ligada à pasta que já estava lá. O atalho ao lado do aviso abre essa pasta no Drive.",
    },
    {
      sintoma: "O mesmo funcionário aparece em mais de um alerta.",
      acao: "Resolva primeiro o que fala de pasta que falta, e só depois os demais. Criada a pasta, os outros costumam sair sozinhos na próxima atualização.",
    },
    {
      sintoma: "Você zerou um aviso sem querer.",
      acao: "A baixa fica registrada com o seu usuário e o caso persistindo o aviso volta a acender no próximo arquivamento. Havendo pressa, procure o funcionário pelo Gerenciador e confira a pasta dele no Drive.",
    },
  ],
  regras: [
    "Rearquivar refaz o arquivamento do começo. Ligar à pasta existente só registra o link de uma pasta que já tem o material.",
    "Gerar prontuário é para a admissão que terminou sem a pasta ter sido criada, e o sistema não duplica pasta.",
    "Sem a pasta principal do cliente cadastrada, nenhum arquivamento daquele cliente tem onde gravar.",
    "Zerar pendência e zerar sinal apagam o aviso e registram quem deu a baixa: não consertam o caso e não apagam nada no Drive.",
  ],
  relacionados: [
    "ler-o-diagnostico-do-sistema",
    "os-alertas-de-scheduler-desligado",
    "cadastrar-a-pasta-pai-de-um-cliente-fopag",
    "cadastrar-a-pasta-pai-do-drive-por-tipo-de-contrato",
    "abrir-o-prontuario-no-drive",
    "achar-uma-admissao-no-gerenciador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/diagnostico/page.tsx",
    "apps/backend/src/diagnostico/diagnostico.service.ts",
    "apps/backend/src/diagnostico/diagnostico.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
