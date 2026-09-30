import type { Artigo } from "../../tipos";

/**
 * N1 DE LEITURA da tela de assinatura. É a porta da família: ensina a LER os quatro recortes, a
 * etiqueta de cada envelope, o prazo e a sub-linha de quem assinou e quem está devendo.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE, e por quê:
 *   - DISPARAR, em um ou em lote: são os artigos irmãos. Quem chega aqui está tentando ENTENDER a
 *     tela; misturar a ação de criar envelope e mandar e-mail no artigo de leitura faria a pessoa
 *     disparar antes de saber ler o que ela disparou.
 *   - CANCELAR, REENVIAR e TROCAR O KIT: cada um muda o estado do MESMO objeto de um jeito
 *     diferente, e é por isso que eles têm artigo próprio nesta mesma família.
 *   - GERAR O KIT: o kit nasce no Gerador De Kit, que é outra tela e tem artigo próprio. Aqui o kit
 *     só aparece como anexo que já existe.
 *
 * A DÚVIDA QUE O ARTIGO EXISTE PARA MATAR: "concluí o cadastro, a pessoa saiu da fila do Cadastro e
 * eu achei que perdi o registro". Não perdeu: é aqui que ela continua, com o contrato em assinatura.
 *
 * A caixa de seleção de cada linha fica sem `controles` porque o nome acessível dela carrega o nome
 * da pessoa.
 */
export const artigo: Artigo = {
  slug: "ler-a-gestao-das-assinaturas",
  titulo: "Ler A Gestão Das Assinaturas",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinaturas",
  resumo:
    "Como ler a tela de assinatura de contrato: o que cada um dos quatro recortes lista, o que a etiqueta e o prazo de cada linha dizem, e como ver quem já assinou e quem está devendo.",
  termos: [
    "assinatura",
    "assinaturas",
    "contrato",
    "assinar contrato",
    "clicksign",
    "envelope",
    "quem assinou",
    "quem falta assinar",
    "aguardando assinatura",
    "contrato assinado",
    "cade o contrato",
    "onde vejo o contrato",
    "prazo do contrato",
    "contrato vencido",
    "sumiu da fila do cadastro",
    "ver o kit",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra o Ass. Click pelo menu da lateral esquerda.",
      detalhe:
        "É a tela de assinatura de contrato. Ela abre no primeiro recorte, que é a fila de trabalho.",
      controles: ["Ass. Click", "Assinatura de contrato"],
    },
    {
      gesto: "Escolha o recorte no topo da tela.",
      detalhe:
        "São quatro, na ordem do fluxo real. Prontos Para Solicitar é a fila de disparo: kits já anexados, esperando o envio. Gestão Das Assinaturas é o acompanhamento de quem já recebeu e ainda não terminou de assinar. Cancelados E Expirados guarda o que encerrou sem assinatura. Assinados é o histórico do contrato fechado. O número ao lado do recorte escolhido é quanta gente ele tem.",
      controles: [
        "Prontos Para Solicitar",
        "Gestão Das Assinaturas",
        "Cancelados E Expirados",
        "Assinados",
      ],
    },
    {
      gesto: "Leia a frase logo abaixo dos recortes antes de concluir que a lista está errada.",
      detalhe:
        "Ela explica o que aquele recorte lista. Cada um filtra por um estado diferente, então a mesma pessoa aparece em um e não no outro.",
    },
    {
      gesto: "Leia a linha da tabela da esquerda para a direita.",
      detalhe:
        "Candidato, Cliente, Cargo, Contrato e Data adm. identificam a pessoa. Campo que o cadastro ainda não tem aparece como não informado.",
      controles: ["Candidato", "Cliente", "Cargo", "Contrato", "Data adm.", "não informado"],
    },
    {
      gesto: "Na fila de disparo, leia a coluna Situação.",
      detalhe:
        "Ela diz se a linha pode ser disparada. Apta aparece em verde, com a data em que o kit foi anexado. Impedida aparece em vermelho, com o motivo escrito na própria célula, e a linha não pode ser marcada.",
      controles: ["Situação", "Apta, kit anexado em"],
    },
    {
      gesto: "Nos outros três recortes, leia a etiqueta da coluna Assinatura e o Prazo ao lado.",
      detalhe:
        "Aguardando Assinatura é envelope entregue e ainda em andamento. Assinado é contrato fechado. Cancelado e Expirado são encerrados sem assinatura. Sem Envelope é quem ainda não teve documento criado. Em quem está aguardando, o Prazo mostra quantos dias faltam para o envelope vencer, e fica vermelho nos últimos cinco dias; passado o prazo ele mostra vencido. Em quem já assinou, a mesma coluna mostra a data em que o contrato foi enviado. Nos demais casos ela mostra não informado.",
      controles: [
        "Assinatura",
        "Prazo",
        "Aguardando Assinatura",
        "Assinado",
        "Cancelado",
        "Expirado",
        "Sem Envelope",
      ],
    },
    {
      gesto: "Olhe a sub-linha embaixo do nome para saber QUEM está devendo.",
      detalhe:
        "A etiqueta da coluna diz que falta alguém, não diz quem. A sub-linha conta quantos de quantos já assinaram e mostra uma tag por pessoa: verde com a data para quem assinou, amarela com Pendente para quem falta. Quem está devendo vem primeiro, porque a tela existe para cobrar.",
      controles: ["assinaram", "Pendente", "Assinou"],
    },
    {
      gesto: "Confira há quanto tempo essa sub-linha foi atualizada.",
      detalhe:
        "O texto no começo dela diz isso, e existe justamente para a tela não se passar por tempo real: o painel é alimentado por ciclos e pode estar alguns minutos atrás. Quem precisa do estado exato agora usa o botão de atualizar ao lado, que consulta só aquele candidato.",
      controles: [
        "atualizado agora",
        "ainda não atualizado",
        "Atualizar assinantes deste candidato",
        "Consultar a Clicksign agora, só deste candidato",
      ],
    },
    {
      gesto: "Use o olho da coluna Ações para conferir o kit anexado antes de disparar.",
      detalhe:
        "Ele abre o PDF do kit em outra aba. O olho desaparece quando o contrato é assinado, porque a partir daí o documento vive no prontuário do Drive, e não mais na área temporária.",
      controles: ["Ações", "Visualizar o kit anexado"],
    },
    {
      gesto: "No contrato já assinado, abra o prontuário pelo ícone do Drive na própria linha.",
      detalhe: "Ele leva à pasta do candidato, onde o contrato assinado foi arquivado.",
      controles: ["Abrir contrato assinado no Google Drive"],
    },
    {
      gesto:
        "Para achar alguém, digite na busca do topo; para reordenar, clique no nome da coluna.",
      detalhe:
        "A busca procura por candidato, cliente, cargo e tipo de contrato dentro do recorte aberto. O Atualizar ao lado recarrega a lista inteira daquele recorte.",
      controles: ["Buscar por candidato, cliente ou cargo", "Atualizar", "Recarregar a fila"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Concluí o cadastro da pessoa e ela desapareceu da fila do Cadastro.",
      acao: "É o comportamento correto: cadastro concluído sai daquela fila mesmo com a assinatura pendente. Ela continua aqui, no recorte Gestão Das Assinaturas, e continua no Gerenciador e na busca por candidato.",
    },
    {
      sintoma: "Cliquei no olho e o sistema diz que o kit não está mais anexado.",
      acao: "A mensagem é: Kit não está mais anexado. Depois de assinado, o documento fica no prontuário do Drive. Se o contrato já foi assinado, use o ícone do Drive da mesma linha. Se ainda não foi, o kit venceu na área temporária e precisa ser gerado e enviado de novo pelo Gerador de Kit.",
    },
    {
      sintoma: "A tela avisa: Falha ao abrir o kit anexado.",
      acao: "Foi a abertura do arquivo que falhou, e nada do envelope mudou por isso. Tente o olho de novo; se repetir, recarregue a fila pelo Atualizar.",
    },
    {
      sintoma: "A pessoa me disse que assinou e a tag dela continua Pendente.",
      acao: "O painel é do último ciclo, e o começo da sub-linha diz de quando ele é. Clique no botão de atualizar daquela linha para consultar na hora. Só depois disso a tag Pendente significa que a assinatura realmente não entrou.",
    },
    {
      sintoma: "A sub-linha diz que ainda não foi atualizada.",
      acao: "Aquele envelope ainda não passou por um ciclo de leitura. Use o botão de atualizar da linha para trazer o estado agora, sem esperar o ciclo seguinte.",
    },
    {
      sintoma: "A sub-linha diz: Sem assinantes registrados no envelope.",
      acao: "O documento existe e ninguém foi registrado como assinante nele. Não é caso de disparar de novo: avise a administração, porque o envelope precisa ser refeito pelo reenvio por correção.",
    },
    {
      sintoma:
        "A pessoa terminou de assinar e a linha continua em Aguardando Assinatura, sem o ícone do Drive.",
      acao: "O sistema só arquiva o contrato quando confere que o arquivo é mesmo o assinado. Enquanto o documento assinado não estiver pronto, ele se abstém de arquivar, deixa a linha onde está e tenta de novo no ciclo seguinte. Essa espera é o comportamento correto, não uma falha: não force o disparo nem cancele o envelope por causa dela.",
    },
    {
      sintoma: "Um contrato antigo, de antes do sistema, não aparece no recorte Assinados.",
      acao: "Esse recorte lista só contrato que passou pela assinatura eletrônica de verdade. Admissão concluída na carga de histórico é consultada pelo Gerenciador.",
    },
  ],
  regras: [
    "Cadastro concluído sai da fila da aba Cadastro mesmo com a assinatura pendente. A admissão não sai do sistema: ela continua nesta tela, no Gerenciador e na busca por candidato.",
    "A fila Prontos Para Solicitar lista só quem tem kit anexado. Concluir as frentes não é suficiente: sem kit não há o que disparar.",
    "Linha impedida aparece na fila com o motivo visível, em vez de desaparecer, e não pode ser marcada até o motivo ser resolvido.",
    "Envelope encerrado sai do recorte de acompanhamento e vai para Cancelados E Expirados: processo encerrado não é trabalho de fila.",
    "O recorte Assinados lista só contrato que passou pela assinatura eletrônica. Admissão marcada como concluída na carga de histórico não entra ali.",
    "O envelope tem prazo de 30 dias contados do envio. Passado o prazo sem assinatura, ele vira Expirado e exige reenvio.",
    "A sub-linha de assinantes é o último estado lido, não tempo real. O texto de quando ela foi atualizada faz parte da informação.",
    "O sistema nunca arquiva contrato sem assinatura: ele confere o arquivo antes e se abstém quando não é o assinado, tentando de novo no ciclo seguinte.",
    "O kit anexado deixa de ser visível quando o contrato é assinado, porque a partir daí o documento vive no prontuário do Drive.",
  ],
  relacionados: [
    "disparar-a-assinatura-de-um-candidato",
    "disparar-a-assinatura-em-lote",
    "cancelar-o-documento-na-clicksign",
    "reenviar-por-correcao-com-o-pdf-corrigido",
    "trocar-o-kit-anexado",
    "concluir-o-cadastro-e-o-contrato",
    "enviar-o-kit-para-assinatura",
    "abrir-o-prontuario-no-drive",
    "ordenar-a-lista-pelo-cabecalho",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/frontend/src/lib/clicksign.ts",
    "apps/backend/src/clicksign/clicksign-gestao.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
    "apps/backend/src/domain/clicksign-assinantes.ts",
    "apps/backend/src/domain/contrato-assinado.ts",
  ],
  revisadoEm: "2026-09-30",
};
