import type { Artigo } from "../../tipos";

/**
 * N1 DO DISPARO DE UMA LINHA. É o momento em que o documento nasce e a pessoa é chamada para
 * assinar: nada antes disto manda e-mail para ninguém.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE:
 *   - O LOTE: tem artigo próprio. Aqui é o botão da linha, para quem quer disparar um só e não
 *     quer marcar caixa nenhuma.
 *   - GERAR O KIT: o kit chega anexado pelo Gerador De Kit, que é outra tela.
 *   - LER A TELA: os recortes, as etiquetas e a sub-linha de assinantes estão no artigo de leitura.
 *
 * A PARTE QUE O ARTIGO EXISTE PARA DIZER, e ela é um fato medido em produção: DEIXAR O DOCUMENTO
 * PRONTO E CHAMAR A PESSOA SÃO DUAS COISAS. Houve um período em que o sistema só fazia a primeira, e
 * mais de cem contratos ficaram válidos e parados sem que ninguém fosse chamado para assinar. Hoje o
 * sistema faz as duas no mesmo disparo, e guarda a hora em que a solicitação saiu.
 *
 * O aviso verde de confirmação e a caixa de seleção da linha ficam fora de `controles` porque os
 * dois carregam o nome da pessoa.
 */
export const artigo: Artigo = {
  slug: "disparar-a-assinatura-de-um-candidato",
  titulo: "Disparar A Assinatura De Um Candidato",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinaturas",
  resumo:
    "Como enviar o contrato de um candidato para assinatura pelo botão da própria linha, o que o sistema faz nesse clique e como conferir que a pessoa foi realmente chamada por e-mail.",
  termos: [
    "disparar assinatura",
    "enviar contrato",
    "enviar para assinar",
    "mandar contrato para o funcionario",
    "solicitar assinatura",
    "criar envelope",
    "funcionario nao recebeu o contrato",
    "nao chegou o email do contrato",
    "candidato sem email",
    "sem representante da empresa",
    "kit expirado",
  ],
  preRequisitos: [
    "O candidato precisa aparecer na fila Prontos Para Solicitar, com a Situação apta.",
    "O candidato precisa ter e-mail no cadastro: é por ele que a assinatura é autenticada.",
  ],
  passos: [
    {
      gesto: "Abra o Ass. Click e fique no recorte Prontos Para Solicitar.",
      detalhe: "É a fila de disparo, e ela já abre selecionada.",
      controles: ["Ass. Click", "Prontos Para Solicitar"],
    },
    {
      gesto: "Ache o candidato pela busca do topo.",
      controles: ["Buscar por candidato, cliente ou cargo"],
    },
    {
      gesto: "Confira a coluna Situação da linha antes de disparar.",
      detalhe:
        "Apta, em verde, com a data do anexo do kit, é o que libera o disparo. Qualquer texto em vermelho ali é um impedimento, e o botão de disparo não aparece na linha.",
      controles: ["Situação", "Apta, kit anexado em"],
    },
    {
      gesto: "Confira o kit pelo olho da coluna Ações, se quiser ver o que vai ser assinado.",
      detalhe: "Ele abre o PDF anexado em outra aba, sem disparar nada.",
      controles: ["Ações", "Visualizar o kit anexado"],
    },
    {
      gesto: "Clique no ícone de envio da linha, o segundo da coluna Ações.",
      detalhe:
        "É o disparo de um só. Neste clique o sistema cria o documento para assinatura, deixa ele pronto e CHAMA a pessoa por e-mail. Deixar pronto e chamar são etapas diferentes, e a tela faz as duas no mesmo clique.",
      controles: ["Disparar a assinatura só deste candidato", "Enviando"],
    },
    {
      gesto: "Leia o aviso verde que aparece no alto da tela.",
      detalhe:
        "Ele confirma, com o nome do candidato, que a assinatura foi disparada. A fila é recarregada em seguida e a linha sai dali.",
    },
    {
      gesto: "Confira o resultado no recorte Gestão Das Assinaturas.",
      detalhe:
        "A pessoa passa a aparecer com a etiqueta Aguardando Assinatura e com o prazo em dias. A sub-linha embaixo do nome mostra quem já assinou e quem está devendo.",
      controles: ["Gestão Das Assinaturas", "Aguardando Assinatura", "Prazo", "Pendente"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A Situação diz: Candidato sem e-mail. A assinatura é autenticada por e-mail, então não há como enviar.",
      acao: "Preencha o e-mail na ficha da admissão e volte. Sem e-mail não existe como autenticar nem como chamar a pessoa para assinar, então o disparo nem é oferecido.",
    },
    {
      sintoma:
        "A Situação diz: Kit expirado da área temporária (48h). Gere e envie o kit de novo pelo Gerador de Kit.",
      acao: "O kit anexado tem validade curta porque o arquivo não fica guardado no sistema. Gere o kit outra vez no Gerador de Kit e use lá o envio para assinatura; a linha volta apta para esta fila.",
    },
    {
      sintoma:
        "A Situação diz: Sem representante da empresa cadastrado. Cadastre em Administração, Assinante da empresa.",
      acao: "Falta quem assina pela empresa naquele cliente. Sem isso o documento não pode nascer, porque ele sairia com um assinante só. Cadastre o grupo de assinatura da empresa e volte.",
    },
    {
      sintoma: "O sistema recusa com: Não foi possível disparar esta assinatura.",
      acao: "A régua é conferida de novo no clique, e não só quando a tela carregou: entre uma coisa e outra o kit pode ter vencido ou o cadastro pode ter mudado. A mensagem completa traz o motivo. Recarregue a fila pelo Atualizar e resolva o que ela aponta.",
    },
    {
      sintoma: "O sistema recusa dizendo que o arquivo do kit está incompleto, truncado ou corrompido.",
      acao: "O arquivo anexado não abre como PDF válido, e enviar assim entregaria à pessoa um documento em branco. Gere o kit de novo no Gerador de Kit e envie outra vez para a fila.",
    },
    {
      sintoma: "O funcionário diz que não recebeu o e-mail do contrato.",
      acao: "Primeiro confira, na sub-linha da pessoa, se ela já não assinou. Depois peça ao candidato para olhar o lixo eletrônico. Para saber se a solicitação realmente saiu, o sistema guarda a hora em que ela foi enviada, e esse dado sai na exportação do Gerenciador, no grupo Assinatura, coluna Notificado Em: vazia significa que a pessoa não foi chamada. Nesse caso avise a administração, e não dispare de novo, porque o documento já existe.",
    },
    {
      sintoma: "O botão de envio não aparece na linha.",
      acao: "Ele só existe na fila de disparo e só em linha apta. Se a Situação mostra um impedimento, resolva o impedimento; se a pessoa já tem documento, ela está no recorte Gestão Das Assinaturas e não se dispara duas vezes.",
    },
  ],
  regras: [
    "É este clique que cria o documento e manda o e-mail. Nada antes disso chama ninguém para assinar.",
    "Deixar o documento pronto e chamar a pessoa são duas etapas diferentes, e a tela faz as duas no mesmo disparo.",
    "O sistema guarda a hora em que a solicitação de assinatura saiu, então dá para conferir em vez de supor. Esse carimbo é lido na exportação do Gerenciador, coluna Notificado Em.",
    "O funcionário assina primeiro e a empresa depois: o representante só é chamado quando chega a vez dele.",
    "Cada admissão tem um documento vivo por vez. Com um já aguardando assinatura, o sistema não cria um segundo.",
    "A régua de quem pode ser disparado é conferida de novo no clique, não só quando a tela carregou.",
    "O documento nasce com prazo de 30 dias. Sem assinatura nesse prazo ele expira e exige reenvio.",
    "O funcionário pode recusar a assinatura; o representante da empresa não tem essa opção no documento.",
  ],
  relacionados: [
    "ler-a-gestao-das-assinaturas",
    "disparar-a-assinatura-em-lote",
    "cancelar-o-documento-na-clicksign",
    "reenviar-por-correcao-com-o-pdf-corrigido",
    "trocar-o-kit-anexado",
    "enviar-o-kit-para-assinatura",
    "montar-o-grupo-de-assinatura-da-empresa",
    "editar-os-dados-de-uma-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/backend/src/clicksign/clicksign-gestao.service.ts",
    "apps/backend/src/clicksign/clicksign-sync.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
    "apps/backend/src/domain/pdf-kit.ts",
  ],
  revisadoEm: "2026-09-30",
};
