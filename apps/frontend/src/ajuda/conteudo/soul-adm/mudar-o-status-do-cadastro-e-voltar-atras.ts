import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA CADASTRO: o seletor de status da frente, a volta atrás e o que a volta NÃO desfaz.
 *
 * ┌─ O QUE O ARTIGO IRMÃO JÁ COBRE, E POR ISSO SAI DAQUI ───────────────────────────────────────┐
 * │ Concluir a frente, lançar a matrícula, ler a etiqueta da assinatura e entender por que a aba    │
 * │ abre só depois da Auditoria e do Exame são o caminho principal, e já têm artigo. Este aqui      │
 * │ responde o que sobra: o que o seletor lista, o que acontece ao RECUAR e o que o recuo deixa     │
 * │ como estava.                                                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA PREMISSA FOI MEDIDA E CORRIGIDA, E ELA MUDA O ARTIGO ──────────────────────────────────┐
 * │ O seletor NÃO oferece apenas os status alcançáveis a partir do estado atual: ele lista o        │
 * │ catálogo INTEIRO da frente daquela aba, que no Cadastro são dois (`STATUS_CADASTRO_CONTRATO`,   │
 * │ em `shared-types`), mais a opção de declínio, que a tela injeta nas frentes cujo catálogo não a │
 * │ tem (`esteira/page.tsx`). Quem filtra é o GATE, e ele não filtra a lista: enquanto a frente não │
 * │ abre, o seletor nem é desenhado, e no lugar dele a tela escreve que está pausado. O artigo       │
 * │ descreve esse comportamento, e não o que se supunha dele.                                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O RECUO NÃO DESFAZ, MEDIDO NO CÓDIGO E NÃO DEDUZIDO ────────────────────────────────┐
 * │ O farol de admissão concluída é PEGAJOSO: ele está na lista de faróis manuais                  │
 * │ (`domain/admissao.ts`), e nenhum recálculo o sobrescreve. Então, quando a conclusão do Cadastro  │
 * │ já carimbou a admissão como concluída (o caso do cliente que não exige integração), recuar o     │
 * │ status devolve a linha para a fila e NÃO devolve o farol. A frente de Integração já nascida      │
 * │ também fica onde está, e concluir de novo não cria uma segunda.                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A fila mostra nome de pessoa e a captura foi vetada
 * enquanto a homologação não tiver base sintética. O texto funciona sem imagem.
 *
 * O seletor não entra em `controles` como controle nomeado: o nome acessível dele carrega o nome da
 * pessoa. O que se declara são as opções e a coluna.
 */
export const artigo: Artigo = {
  slug: "mudar-o-status-do-cadastro-e-voltar-atras",
  titulo: "Mudar O Status Do Cadastro",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "O que o seletor de status da aba Cadastro oferece, como voltar a admissão para o estado anterior e o que essa volta não desfaz.",
  termos: [
    "mudar status do cadastro",
    "voltar status",
    "voltar atras",
    "desfazer cadastro",
    "reabrir cadastro",
    "desmarcar cadastrado",
    "cadastrei errado",
    "errei o status",
    "a cadastrar",
    "cadastrado",
    "seletor de status",
    "status nao aparece",
    "nao consigo mudar o status",
    "declinou no cadastro",
  ],
  preRequisitos: [
    "A frente de Cadastro já precisa estar aberta: fechada, o seletor não é desenhado.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional, clique na aba Cadastro e ache a pessoa pela busca.",
      controles: ["Esteira Admissional", "CADASTRO", "Buscar por nome, CPF ou cliente"],
    },
    {
      gesto: "Olhe a coluna Avanço da linha antes de qualquer coisa.",
      detalhe:
        "Havendo seletor, a frente está aberta. No lugar dele, a tela escreve que está pausado e o que está sendo esperado: aí não há status a mudar, e nada do que já foi lançado se perde.",
      controles: ["Avanço", "Pausado: aguarda Auditoria + Exame"],
    },
    {
      gesto: "Abra o seletor e leia as opções.",
      detalhe:
        "A frente de Cadastro tem dois status, A Cadastrar, que é como ela nasce, e Cadastrado, que conclui. A terceira opção, Declinou, não é status de Cadastro: ela encerra a admissão inteira.",
      controles: ["A Cadastrar", "Cadastrado", "Declinou"],
    },
    {
      gesto: "Para concluir, escolha Cadastrado e confirme na janela que aparece.",
      detalhe:
        "A confirmação é leve, só para você não concluir por engano. Concluído, a linha sai da fila desta aba.",
      controles: ["Concluir Frente", "Concluir"],
    },
    {
      gesto: "Para voltar atrás, escolha A Cadastrar no mesmo seletor.",
      detalhe:
        "A volta é aplicada direto e a linha reaparece na fila da aba, com a data de conclusão apagada. A mudança fica na trilha da admissão, marcada como recuo, com o seu nome e a hora.",
      controles: ["A Cadastrar"],
    },
    {
      gesto: "Depois de voltar atrás, confira o farol da admissão no Gerenciador.",
      detalhe:
        "Quando a conclusão do Cadastro já havia encerrado a esteira, o farol de admissão concluída continua lá: ele não é recalculado pela volta. Corrija o que precisa e conclua de novo, ou trate o farol pelo caminho dele.",
      controles: ["Gerenciador"],
    },
    {
      gesto: "Para achar quem você já concluiu, clique no card Cadastrado no alto da tela.",
      detalhe: "Ele é filtro e liga e desliga no clique.",
      controles: ["Cadastrado", "Total na fila"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor de status não existe na linha.",
      acao: "A frente ainda não abriu, e a tela diz isso no lugar do seletor. Confira a Auditoria e o Exame da mesma pessoa: quando as duas concluírem, o Cadastro reabre sozinho.",
    },
    {
      sintoma: "Procuro no seletor um status que a lista não tem.",
      acao: "A lista é o catálogo daquela frente, e o Cadastro tem dois status só. Status de exame, de auditoria e de integração vivem nas abas deles, e cada aba mostra apenas os seus.",
    },
    {
      sintoma: "Voltei o status e a admissão continua aparecendo como concluída em outra tela.",
      acao: "O farol de admissão concluída não volta com o recuo: ele é decidido por quem fecha a esteira e não é recalculado depois. A fila desta aba, sim, volta a mostrar a pessoa. Sendo engano, conclua de novo depois de corrigir, que o farol continua coerente.",
    },
    {
      sintoma: "Voltei o status e a pessoa continua na aba Integração.",
      acao: "Correto: a frente de Integração nasce quando o Cadastro conclui e não é apagada pela volta. Concluir o Cadastro outra vez não cria uma segunda integração.",
    },
    {
      sintoma: "Escolhi Declinou pensando que era um status da frente.",
      acao: "Declinou encerra a admissão inteira e pede o motivo numa janela. Clique em Cancelar: sem motivo escolhido e sem a confirmação, nada é gravado.",
    },
    {
      sintoma: "Mudei o status por engano e quero apagar o registro.",
      acao: "Não há como apagar: cada mudança é um evento da trilha, com autor e hora, e o recuo é registrado como recuo. Faça a correção pelo próprio seletor, que a trilha passa a contar a história completa.",
    },
  ],
  regras: [
    "A frente de Cadastro tem dois status: A Cadastrar, como ela nasce, e Cadastrado, que conclui.",
    "O seletor lista o catálogo completo da frente daquela aba, mais a opção de declínio. Ele não esconde opções conforme o estado atual.",
    "Enquanto a Auditoria e o Exame não fecham, o seletor não é desenhado: é o gate que impede a mudança, não a lista de opções.",
    "Voltar para A Cadastrar devolve a linha para a fila e apaga a data de conclusão da frente.",
    "A volta atrás não desfaz o farol de admissão concluída: ele é decidido no fechamento da esteira e não é recalculado.",
    "A volta atrás não apaga a frente de Integração que já nasceu, e concluir de novo não cria outra.",
    "Toda mudança de status é registrada com autor e hora, e o recuo fica marcado como recuo.",
    "Declinou não é status de Cadastro: escolhê-lo encerra a admissão inteira e exige motivo.",
  ],
  relacionados: [
    "concluir-o-cadastro-e-o-contrato",
    "importar-as-matriculas-por-planilha",
    "aceitar-o-avanco-com-pendencias",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "acompanhar-a-integracao",
    "achar-uma-admissao-no-gerenciador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/domain/esteira.ts",
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/esteira/esteira.service.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
