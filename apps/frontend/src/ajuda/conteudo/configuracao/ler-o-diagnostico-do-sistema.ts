import type { Artigo } from "../../tipos";

/**
 * FICHA: o Diagnóstico Do Sistema, LEITURA.
 *
 * COBRE o que cada indicador mede e o que o verde quer dizer, que é a pergunta que a tela faz nascer
 * em quem a abre pela primeira vez: uma parede de cartões zerados parece uma tela que não mediu
 * nada. Mediu: zero é o estado correto, e dizer isso é metade do valor desta peça.
 *
 * COBRE as três faixas, porque elas respondem perguntas diferentes: a de cima conta CASOS abertos,
 * a do meio diz se os serviços de que o sistema depende respondem, e a de baixo mostra as rotinas
 * automáticas e as portas para as outras filas.
 *
 * NÃO ENSINA A AGIR, e isso é recorte deliberado. Os botões de dentro das janelas mudam o estado do
 * sistema, e cada família deles tem peça própria em `relacionados`: os alertas de arquivamento e de
 * prontuário numa, os de rotina automática desligada na outra. Ensinar a ler e a agir na mesma peça
 * faria a pessoa clicar antes de entender o que o número quer dizer.
 *
 * NÃO COBRE o painel do formulário de vale-transporte sem casar, que tem tela própria dentro da
 * janela daquele indicador e pede artigo dedicado.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: nenhuma para ler. Os indicadores das faixas de cima são calculados
 * do banco; os da faixa do meio dependem de o serviço correspondente estar configurado, e é isso
 * que o próprio cartão informa quando diz que está indisponível.
 */
export const artigo: Artigo = {
  slug: "ler-o-diagnostico-do-sistema",
  titulo: "Ler O Diagnóstico Do Sistema",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/diagnostico"],
  menus: ["diagnostico"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "saude-do-sistema",
  resumo:
    "O que cada indicador do Diagnóstico Do Sistema mede, o que significa o verde, e como a tela está organizada em casos abertos, serviços de que o sistema depende e rotinas automáticas.",
  termos: [
    "diagnostico",
    "saude do sistema",
    "o sistema esta com problema",
    "painel de erro",
    "tudo saudavel",
    "card vermelho",
    "o que significa esse indicador",
    "esta tudo funcionando",
    "monitoramento",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Diagnóstico Do Sistema pelo menu da lateral esquerda.",
      detalhe:
        "A tela é uma fotografia do momento em que ela foi aberta. A data e a hora dessa fotografia ficam ao lado do botão de atualizar.",
      controles: ["Diagnóstico Do Sistema", "Atualizar"],
    },
    {
      gesto: "Leia primeiro a etiqueta do canto superior direito.",
      detalhe:
        "Ela resume a tela inteira: dizendo que está tudo saudável, nenhum indicador tem ocorrência aberta. Do contrário, ela traz o número de problemas encontrados.",
      controles: ["Tudo saudável"],
    },
    {
      gesto: "Percorra a primeira faixa de cartões: cada um conta os casos abertos de um assunto.",
      detalhe:
        "O número é a quantidade de ocorrências, e o cartão fica destacado em vermelho só quando ela é maior que zero. Zero com o ícone de confirmação é o estado correto, e não uma medição que faltou.",
      controles: [
        "Coleta perdida (PENDENTE com arquivo)",
        "Régua fechada sem pasta no Drive",
        "Falha de sistema na auditoria (por família)",
        "Formulário de VT no bucket sem casar com admissão",
        "Envelope de assinatura expirado",
        "Arquivamento No Drive Falhou",
        "Pasta duplicada no Drive",
        "Concluída Sem Prontuário",
        "Cliente Fopag sem pasta-pai no Drive",
      ],
    },
    {
      gesto: "Clique em um cartão da primeira faixa para ver de quem são as ocorrências.",
      detalhe:
        "A janela lista os casos, um por linha, com o detalhe do que está pendente em cada um. Na lista longa de prontuário, um campo de busca por nome aparece acima dela. Saia pelo Fechar ou pela tecla Esc.",
      controles: ["Buscar funcionário pelo nome", "Fechar"],
    },
    {
      gesto: "Leia a segunda faixa: são os serviços de que o sistema depende.",
      detalhe:
        "Cada cartão traz o estado e uma frase curta do que foi verificado. Ok é o normal; fora e degradado destacam o cartão; indisponível quer dizer que aquele serviço não está configurado neste ambiente. Clique no cartão para abrir o detalhe.",
      controles: [
        "Banco de dados",
        "Fila (BullMQ)",
        "Vertex AI (auditoria)",
        "Google Drive",
        "Pandapé (API)",
      ],
    },
    {
      gesto: "Leia a terceira faixa: as rotinas automáticas e as portas para outras telas.",
      detalhe:
        "Os quatro primeiros cartões dizem se cada rotina está ativa, desligada ou parada. Os demais abrem o resumo da última coleta e o histórico de falhas, e o de entradas leva para a fila de Entradas Do Pandapé, em tela cheia.",
      controles: [
        "Scheduler de coleta",
        "Scheduler da coleta de VT",
        "Scheduler da assinatura",
        "Verificador do exame",
        "Última coleta do Pandapé",
        "Falhas por família (24h e 7 dias)",
        "Entradas Do Pandapé",
      ],
    },
    {
      gesto: "Clique em Atualizar para tirar uma fotografia nova.",
      detalhe:
        "A tela não se atualiza sozinha. Depois de alguém resolver um caso, é o Atualizar que faz o número cair.",
      controles: ["Atualizar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Um cartão da segunda faixa diz que o serviço está indisponível.",
      acao: "Aquele serviço não está configurado neste ambiente, o que é diferente de estar fora do ar. Abra o cartão para ler o detalhe e escale para a administração se ele deveria estar ativo.",
    },
    {
      sintoma: "Você resolveu um caso e o número do cartão continua o mesmo.",
      acao: "A tela é uma fotografia do momento em que foi aberta. Clique em Atualizar.",
    },
    {
      sintoma: "A etiqueta do topo diz que há problemas, mas todos os cartões da primeira faixa estão zerados.",
      acao: "O resumo do topo conta também os serviços da segunda faixa e as rotinas automáticas da terceira. Percorra as três antes de concluir.",
    },
    {
      sintoma: "Você não sabe o que fazer com o número que encontrou.",
      acao: "Os alertas de arquivamento e de prontuário e os de rotina automática desligada têm artigo próprio, apontados no fim desta página.",
    },
  ],
  regras: [
    "A tela é uma fotografia do momento da abertura e não se atualiza sozinha.",
    "Zero em um indicador é o estado correto, e quer dizer nenhuma ocorrência aberta naquele assunto.",
    "A primeira faixa conta casos abertos, a segunda diz se os serviços respondem, e a terceira mostra as rotinas automáticas.",
    "Serviço indisponível quer dizer não configurado neste ambiente, que é diferente de fora do ar.",
  ],
  relacionados: [
    "os-alertas-de-arquivamento-e-de-prontuario",
    "os-alertas-de-scheduler-desligado",
    "ler-a-fila-de-entradas-do-pandape",
    "ler-a-fila-de-divergencias-da-ingestao",
    "filtrar-pelo-card-de-indicador",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/diagnostico/page.tsx",
    "apps/frontend/src/components/diagnostico/DependenciaDrawer.tsx",
    "apps/backend/src/diagnostico/diagnostico.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
