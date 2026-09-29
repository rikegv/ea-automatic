import type { Artigo } from "../../tipos";

/**
 * N1 DO PORTAL 2 de 2: ACOMPANHAR A COLETA E DESTRAVAR QUEM PAROU.
 *
 * ┌─ A RÉGUA DO CPF TRAVADO FOI LIDA DO BACKEND, E NÃO DEDUZIDA ────────────────────────────────┐
 * │ São CINCO tentativas de identificação numa janela de QUINZE minutos, e o bloqueio que vem depois │
 * │ dura os mesmos quinze e PASSA SOZINHO (`TENTATIVAS_LIMITE`, `TENTATIVAS_JANELA_MS` e             │
 * │ `TENTATIVAS_BLOQUEIO_MS`, em `portal/portal-identidade.service.ts`). A mensagem que o candidato   │
 * │ vê é literal: "Muitas tentativas. Aguarde alguns minutos e tente de novo, ou procure o RH."      │
 * │                                                                                                 │
 * │ ISSO IMPORTA PORQUE MUDA O QUE O TIME FAZ: não há botão de destravar CPF, e emitir link novo NÃO │
 * │ resolve o bloqueio da identificação. O que resolve é esperar. O artigo diz isso em vez de mandar │
 * │ a pessoa procurar um botão que não existe.                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O OUTRO TRAVAMENTO, QUE NÃO É O MESMO: A PENDÊNCIA QUE CAI PARA O TIME ────────────────────┐
 * │ São TRÊS reprovações no MESMO tipo de documento (`TETO_REPROVACOES_POR_PENDENCIA`, em            │
 * │ `domain/portal-tentativas.ts`). Passado o teto, o candidato para de tentar sozinho aquele        │
 * │ documento e a linha vira "Intervenção Humana". Não é punição: o documento continua chegando, e   │
 * │ quem decide passa a ser o time, pela aba Auditoria da Esteira. Confundir os dois travamentos é o │
 * │ erro mais fácil desta tela, e por isso eles têm passos separados.                               │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: esta tela não mostra IP, navegador, geografia nem contagem de tentativa, e não tem busca por
 * CPF. Nada disso é ensinado aqui porque nada disso está lá. Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "acompanhar-a-conferencia-do-portal",
  titulo: "Acompanhar A Conferência Do Portal",
  modulo: "SOUL_ADM",
  rotas: ["/admin/portal-links"],
  menus: ["portal-links"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "portal",
  resumo:
    "Como ler o funil da coleta, saber onde cada candidato parou na trilha de documentos, atender quem pediu ajuda para entrar e o que fazer quando o CPF da pessoa trava.",
  termos: [
    "acompanhar portal",
    "funil",
    "quem nao acessou",
    "quem concluiu",
    "intervencao humana",
    "nao consigo entrar",
    "cpf travou",
    "cpf bloqueado",
    "muitas tentativas",
    "candidato nao consegue entrar",
    "bloquear acesso",
    "desbloquear",
    "documento reprovado",
    "progresso da coleta",
    "ultimo acesso",
  ],
  preRequisitos: [
    "Saber que o painel é uma fotografia do momento em que você o carregou. Ele não se atualiza sozinho, e é o botão Atualizar que busca os números de agora.",
  ],
  passos: [
    {
      gesto: "Leia os cinco cards do topo, que são o funil inteiro.",
      detalhe:
        "Eles contam todo mundo, nas duas abas somadas, e cada um é clicável como filtro. Encaminhados é o conjunto todo; clicar nele, ou reclicar o card aceso, desfaz o recorte. Com um card aceso, as abas ficam suspensas, porque o recorte atravessa as duas.",
      controles: [
        "Encaminhados",
        "Acessaram",
        "Concluíram",
        "Intervenção Humana",
        "Não Acessaram",
        "Atualizar",
      ],
      print: {
        arquivo: "01-funil-da-coleta.png",
        legenda: "Passo 1: os cinco cards do funil e as duas abas do painel.",
      },
    },
    {
      gesto: "Escolha a aba conforme a pergunta: Em Andamento ou Concluído.",
      detalhe:
        "Em Andamento é quem ainda tem documento a enviar. Concluído é quem terminou a entrega. Quem não aparece em nenhuma das duas está no recorte de um card aceso.",
      controles: ["Em Andamento", "Concluído"],
    },
    {
      gesto: "Leia a linha da pessoa, da esquerda para a direita.",
      detalhe:
        "Documento Atual é o que ela precisa enviar agora. Progresso é a barra de aceitos sobre obrigatórios, e quem não tem documento a enviar mostra nada a enviar em vez de barra cheia. Situação resume o estado, Último Acesso diz quando ela entrou pela última vez, e Link diz se o acesso está de pé.",
      controles: [
        "Candidato",
        "Cliente",
        "Cargo",
        "Data De Admissão",
        "Documento Atual",
        "Progresso",
        "Situação",
        "Último Acesso",
        "Link",
        "Origem",
        "nada a enviar",
      ],
      print: {
        arquivo: "02-linha-da-trilha.png",
        legenda: "Passo 3: a linha do candidato, com Progresso, Situação e o estado do Link.",
      },
    },
    {
      gesto: "Entenda as cinco etiquetas da coluna Situação.",
      detalhe:
        "Não Acessou é quem recebeu o link e nunca entrou. Em Andamento é quem está enviando. Concluiu é quem entrou e entregou tudo. Sem Régua é o par de cliente e cargo que não pede documento nenhum. Intervenção Humana é quem esbarrou três vezes no mesmo documento e passou a depender do time.",
      controles: ["Não Acessou", "Em Andamento", "Concluiu", "Sem Régua", "Intervenção Humana"],
    },
    {
      gesto: "Abra o olho da linha para ver a ficha enxuta do candidato.",
      detalhe:
        "É leitura pura, sem CPF, sem e-mail e sem telefone: cliente, cargo, data de admissão, situação, documento atual, progresso da régua, último acesso, estado e origem do link. Quando a régua aparece completa e o último acesso está vazio, a própria ficha explica: os documentos foram entregues pelo consultor na Esteira, e a pessoa nunca entrou no portal.",
      controles: ["Ver as informações deste candidato", "Informações Do Candidato", "Progresso Da Régua", "Estado Do Link", "Origem Do Envio", "Fechar"],
    },
    {
      gesto: "Atenda a fila de Pedidos De Ajuda Para Entrar.",
      detalhe:
        "É quem clicou Não consigo entrar no portal. A lista traz quando a pessoa pediu e quantas vezes, e o badge da aba conta os pedidos abertos. Na linha, um botão gera um link novo e o outro leva ao painel já filtrado por aquele nome. Esta lista também não se atualiza sozinha.",
      controles: [
        "Pedidos De Ajuda Para Entrar",
        "Pediu Em",
        "Vezes",
        "Gerar o link do portal deste candidato e copiar. Se ele estiver usando o link dele agora, o sistema avisa e não troca",
        "Ver este candidato no painel",
        "Atualizar",
      ],
      print: {
        arquivo: "03-pedidos-de-ajuda.png",
        legenda: "Passo 6: a fila de quem clicou Não consigo entrar, com as duas ações da linha.",
      },
    },
    {
      gesto: "Quando o CPF da pessoa travar, confira a coluna Link e espere.",
      detalhe:
        "Depois de cinco tentativas erradas em quinze minutos, o acesso é suspenso por quinze minutos, e a coluna mostra Acesso Bloqueado Temporariamente. Isso passa sozinho, e não existe botão de destravar: o botão de bloqueio fica apagado dizendo o motivo. Oriente a pessoa a esperar e a conferir o CPF e a data de nascimento exatamente como estão no cadastro dela.",
      controles: ["Acesso Bloqueado Temporariamente", "Bloquear o acesso do candidato, sem trocar o link que ele já tem"],
    },
    {
      gesto: "Use o cadeado para fechar ou reabrir o acesso à mão.",
      detalhe:
        "O mesmo botão faz as duas coisas: bloqueia o link que está vivo e desbloqueia o que você bloqueou. Bloquear não troca o link que o candidato já tem, ele só para de abrir enquanto durar o bloqueio, e por isso não pede confirmação: desfazer é um clique no mesmo lugar.",
      controles: [
        "Bloquear o acesso do candidato, sem trocar o link que ele já tem",
        "Liberar de novo o acesso do candidato pelo mesmo link",
        "Bloqueado",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O candidato diz que aparece Muitas tentativas. Aguarde alguns minutos e tente de novo, ou procure o RH.",
      acao: "Ele errou a identificação cinco vezes em quinze minutos e o acesso está suspenso por quinze minutos. Isso passa sozinho. Não adianta emitir link novo: o bloqueio é da identificação, não do link. Combine de tentar de novo depois e confira com ele o CPF e a data de nascimento que estão no cadastro.",
    },
    {
      sintoma: "A linha mostra Intervenção Humana e o candidato reclama que não consegue mais enviar aquele documento.",
      acao: "Ele esbarrou três vezes no mesmo tipo de documento, e aquela pendência passou a ser do time. Não é punição, e o documento dele chegou: a conferência agora é feita na aba Auditoria da Esteira, à mão.",
    },
    {
      sintoma: "O botão do cadeado está apagado e não clica.",
      acao: "O aviso do mouse diz por quê. Link vencido ou revogado já está morto, e bloquear o que não abre não faria nada; o bloqueio temporário é do sistema e passa sozinho. O caminho, nos três casos, é emitir um link novo.",
    },
    {
      sintoma: "A linha mostra Progresso completo e o Último Acesso está vazio.",
      acao: "Não é defeito, e a ficha do olho explica isso na própria janela: os documentos foram entregues pelo consultor na Esteira, e a pessoa nunca chegou a entrar no portal.",
    },
    {
      sintoma: "A linha mostra nada a enviar no lugar da barra de progresso.",
      acao: "Aquele par de cliente e cargo não tem documento obrigatório na lista. Não há o que cobrar do candidato, e a situação dele fica Sem Régua.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar os pedidos de ajuda para entrar.",
      acao: "Só a lista de pedidos falhou, o painel segue funcionando. Clique em Atualizar dentro daquela aba. Se repetir, recarregue a página.",
    },
    {
      sintoma: "A tela respondeu Este candidato não tem link vivo para bloquear. Gere um link primeiro.",
      acao: "Não há acesso de pé para fechar. Emita o link pelo ícone de elo da mesma linha e, se ainda quiser fechar o acesso, bloqueie depois.",
    },
    {
      sintoma: "Procurei o candidato pelo CPF e não achei.",
      acao: "Esta tela não busca por CPF, de propósito. A busca é por nome do funcionário.",
    },
  ],
  regras: [
    "Os cards contam todo mundo, nas duas abas somadas. Com um card aceso, as abas não se aplicam e ficam suspensas.",
    "O painel não se atualiza sozinho. Isso é de propósito: o limite de requisições é dividido com a tela do candidato, e um painel que se atualizasse sozinho competiria com quem está tentando entrar.",
    "Cinco tentativas erradas de identificação em quinze minutos suspendem o acesso por quinze minutos. A suspensão passa sozinha, e não há botão para destravá-la.",
    "Três reprovações no mesmo tipo de documento tiram aquele documento das mãos do candidato e o passam para o time, na aba Auditoria da Esteira.",
    "Bloquear não troca o link nem o revoga: o link que a pessoa tem continua sendo o mesmo, e só para de abrir enquanto durar o bloqueio.",
    "Emitir um link novo não desfaz a suspensão por tentativa errada: uma coisa é o acesso, a outra é a identificação.",
    "Esta tela não mostra IP, navegador, localização nem a contagem de tentativas, e não busca por CPF. A busca é por nome.",
  ],
  relacionados: [
    "gerar-o-link-do-portal-para-o-candidato",
    "auditar-os-documentos-da-admissao",
    "ler-a-ficha-da-admissao",
    "filtrar-pelo-card-de-indicador",
    "ordenar-a-lista-pelo-cabecalho",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/portal-links/page.tsx",
    "apps/frontend/src/lib/portal-painel.ts",
    "apps/backend/src/portal/portal-painel.service.ts",
    "apps/backend/src/portal/portal-identidade.service.ts",
    "apps/backend/src/domain/portal-tentativas.ts",
  ],
  revisadoEm: "2026-09-28",
};
