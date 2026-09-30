import type { Artigo } from "../../tipos";

/**
 * ─ LER A CENTRAL DE CANDIDATOS: a LEITURA da tela, e só ela ─────────────────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: o escopo (Em Andamento contra Histórico), o que cada card do topo conta, o
 * que cada coluna da tabela mostra, e as três leituras que mais geram mal-entendido nesta tela: a
 * linha ser uma CANDIDATURA e não uma pessoa, o "Vaga Não Alocada" das três colunas de vaga, e o
 * "Fora Do Funil" que substitui a etapa depois do desfecho.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE, E POR QUÊ ─────────────────────────────────────────┐
 * │ FILTRAR, ORDENAR, BUSCAR, USAR O CARD COMO FILTRO, VIRAR A PÁGINA e LER A LINHA DA TABELA já  │
 * │ são seis artigos do módulo de abertura, escritos uma vez para o sistema inteiro. Reexplicá-los │
 * │ aqui não acrescenta aula nenhuma e cria a divergência que a família existe para eliminar: dois │
 * │ textos sobre o mesmo controle, corrigidos em épocas diferentes. Eles entram por                │
 * │ `relacionados`.                                                                               │
 * │                                                                                               │
 * │ CADASTRAR, ADICIONAR À VAGA e LER A FICHA são as outras três peças desta mesma família, e os   │
 * │ botões delas aparecem AQUI. Esta peça diz que o botão existe e para que serve; o passo a passo │
 * │ de cada um mora no artigo dele.                                                               │
 * │                                                                                               │
 * │ MOVER DE ETAPA, REGISTRAR CONTATO, TROCAR VAGA e TRAZER DE VOLTA são as ações de LINHA, e cada │
 * │ uma é artigo próprio. Aqui elas são citadas como o que a coluna Ações oferece, sem ensinar o   │
 * │ gesto.                                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS TRÊS RÓTULOS DE CARD QUE VÊM DO CATÁLOGO, E NÃO DO CÓDIGO ───────────────────────────────┐
 * │ "Candidatura", "Etapa Cliente" e "Contratado" estão declarados em `controles` porque é assim   │
 * │ que a tela os escreve hoje, e é por eles que a pessoa procura. Mas eles NÃO são texto fixo da  │
 * │ tela: a fileira de cards de etapa é montada a partir do catálogo de etapas do funil, que o     │
 * │ diretor renomeia, reordena e colore. Por isso o TEXTO deste artigo nunca promete um nome de    │
 * │ etapa específico: ele ensina que os cards são as etapas cadastradas, na ordem do funil. Um     │
 * │ texto que citasse "Contratado" como se fosse parte da tela ficaria errado no dia seguinte a    │
 * │ uma renomeação, e ficaria errado em silêncio.                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa neste arquivo. Onde a tela mostra nome, o texto descreve a COLUNA, e a
 * única menção ao CPF é para dizer que a lista NÃO o mostra, que é a regra que mais interessa a quem
 * lê. O texto continua funcionando sem imagem: ele foi escrito assim e não passou a depender dos
 * prints.
 *
 * OS PRINTS EXISTEM DESDE 30/09/2026, e o que destravou foi DADO, não régua: as 15 linhas de
 * candidato da homologação são TODAS do arnês sintético, declaradas uma a uma na allowlist do
 * manual. As setas e o que cada imagem recorta vivem no roteiro, ao lado deste arquivo. A ficha da
 * pessoa continua SEM imagem, por veto do `seguranca`: ela concentra documento, telefone, e-mail e
 * nascimento num bloco só.
 */
export const artigo: Artigo = {
  slug: "ler-a-central-de-candidatos",
  titulo: "Ler A Central De Candidatos",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como ler a Central De Candidatos: a diferença entre Em Andamento e Histórico, o que cada card do topo conta e o que cada coluna da tabela está dizendo.",
  termos: [
    "central de candidatos",
    "lista de candidatos",
    "ver candidatos",
    "onde esta o candidato",
    "candidato sumiu",
    "funil de selecao",
    "quem esta em processo",
    "candidato sem vaga",
    "vaga nao alocada",
    "fora do funil",
    "em selecao",
    "situacao da candidatura",
    "etapa do candidato",
    "ultimo contato",
    "historico de candidatos",
    "cards de candidatos",
  ],
  preRequisitos: [
    "Ter ao menos uma vaga cadastrada: cliente e cargo de cada linha vêm da vaga em que a pessoa está.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Candidatos pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre já carregada, na frente de trabalho, e o texto logo abaixo do título diz quantas linhas a fila tem agora.",
      controles: ["Central De Candidatos"],
    },
    {
      gesto: "Escolha o escopo antes de qualquer outra coisa: Em Andamento ou Histórico.",
      detalhe:
        "Em Andamento é a frente de trabalho: quem está em seleção mais quem ainda não entrou em vaga. Histórico é quem já recebeu desfecho. Esta é a causa número um de alguém concluir que a pessoa desapareceu.",
      print: {
        arquivo: "01-visao-da-central.png",
        legenda:
          "A Central no escopo Em Andamento: o seletor de escopo, a fileira de cards do funil e a tabela logo abaixo.",
      },
      controles: ["Em Andamento", "Histórico"],
    },
    {
      gesto:
        "Leia a primeira fileira de cards: o total da fila e uma coluna por etapa do funil, na ordem do processo.",
      detalhe:
        "As etapas são as que estão cadastradas no catálogo do funil, então a fileira acompanha a lista do momento. Lida da esquerda para a direita, ela mostra o afunilamento. Etapa fora de circulação só aparece quando ainda tem gente dentro, e vem marcada como Inativa.",
      /*
       * `Stand By` ENTRA AQUI, E É CARD DE ETAPA COMO OS OUTROS TRÊS. Ele estava órfão na medição
       * desta rota, e o lugar dele é este: é a etapa de quem está parado no processo, e não um
       * desfecho de saída. Cuidado com os dois homônimos, porque o texto é idêntico e o significado
       * não: existe um motivo de descarte com o mesmo nome, e existe o status de vaga pausada.
       */
      controles: ["Total", "Candidatura", "Etapa Cliente", "Contratado", "Stand By"],
    },
    {
      gesto:
        "Leia a segunda fileira: os desfechos, um card por saída, mais quem está na base sem vaga.",
      detalhe:
        "Aprovado não é alocado, alocado não é enviado para admissão, e descartado não é desistiu. Cada um tem o seu card, porque cada um é um fato diferente.",
      print: {
        arquivo: "02-escopo-historico.png",
        legenda:
          "O escopo Histórico: a segunda fileira de cards, com um card por desfecho e o de quem está na base sem vaga.",
      },
      controles: [
        "Aprovados",
        "Alocados",
        "Enviados Para Admissão",
        "Descartados Pela Seleção",
        "Desistentes",
        "Sem Vaga",
      ],
    },
    {
      gesto:
        "Leia a linha da tabela da esquerda para a direita: a pessoa, a vaga dela, o cliente e o cargo.",
      detalhe:
        "Cada linha é uma candidatura, não uma pessoa. Quem está em duas vagas aparece em duas linhas. Quem está na base e ainda não entrou em vaga mostra Vaga Não Alocada nas três colunas, porque não há campo a preencher: o que falta é entrar em uma vaga.",
      controles: ["Candidato", "Vaga", "Cliente", "Cargo"],
    },
    {
      gesto: "Confira as duas etiquetas do meio da linha: a etapa e a situação.",
      detalhe:
        "A etapa diz onde a pessoa está no funil e vale só enquanto a candidatura está viva. Encerrada, a coluna passa a mostrar Fora Do Funil, e o caminho percorrido fica guardado na ficha. A situação diz se o processo dela segue vivo.",
      print: {
        arquivo: "03-linha-da-lista.png",
        legenda:
          "A tabela da Central: as colunas de etapa e situação, a data do último contato e os ícones da coluna Ações.",
      },
      controles: ["Etapa", "Situação", "Fora Do Funil", "Em Seleção"],
    },
    {
      gesto: "Olhe a data de Último Contato para saber de quem ninguém fala há tempo.",
      detalhe:
        "A data anda só quando alguém registra um contato naquela candidatura. Sem contato registrado, a célula diz não informado, que é diferente de uma data qualquer.",
      controles: ["Último Contato"],
    },
    {
      gesto: "Use os ícones da coluna Ações para agir na linha.",
      detalhe:
        "O olho abre a ficha da pessoa. Na candidatura viva aparecem também a seta, que move de etapa, e o telefone, que registra contato. Na candidatura encerrada, o telefone continua e entra a volta, que traz a pessoa para uma vaga de novo. Passe o mouse sobre o ícone para ver o nome da ação.",
      controles: ["Ações", "Mover de etapa", "Registrar contato"],
    },
    {
      gesto:
        "Use os três botões do topo à direita quando a resposta não estiver na fila: cadastrar, colocar em vaga ou trazer uma lista de fora.",
      detalhe: "Cada um deles tem o seu próprio artigo, com o passo a passo completo.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A mesma pessoa aparece em mais de uma linha.",
      acao: "É o esperado: cada linha é uma candidatura, e quem participa de duas vagas tem duas linhas, cada uma com a sua etapa. Para ver tudo da pessoa em um lugar só, abra a ficha pelo ícone de olho.",
    },
    {
      sintoma: "As colunas Vaga, Cliente e Cargo dizem Vaga Não Alocada.",
      acao: "Aquela pessoa está na base e ainda não entrou em vaga nenhuma. Cliente e cargo vêm da vaga, então não há campo a preencher: use Adicionar à vaga e as três colunas passam a ter conteúdo.",
    },
    {
      sintoma: "A coluna Etapa mostra Fora Do Funil e eu preciso saber por onde a pessoa passou.",
      acao: "Abra a ficha pelo ícone de olho. A seção Por Onde Passou lista a movimentação daquela candidatura, com data, etapa e quem registrou.",
    },
    {
      sintoma: "Um card do topo aparece com a borda tracejada e a tag Inativa.",
      acao: "Aquela etapa saiu de circulação e só continua aparecendo porque ainda tem gente dentro. Mova essas pessoas para uma etapa ativa e o card deixa de aparecer.",
    },
    {
      sintoma: "Eu quero ver o CPF de alguém e ele não está em coluna nenhuma.",
      acao: "A lista não mostra o CPF de propósito. Ele aparece na ficha, uma pessoa por vez, pelo ícone de olho. Para procurar alguém pelo número, use o campo de busca por CPF dentro dos filtros.",
    },
    {
      sintoma: "A tabela não mostra a coluna Ações.",
      acao: "Em tela estreita a tabela rola na horizontal, em vez de espremer as colunas. Role a tabela para a direita.",
    },
  ],
  regras: [
    "Cada linha é uma candidatura, não uma pessoa: quem está em duas vagas aparece em duas linhas.",
    "Pessoa na base sem vaga é estado normal, não cadastro pela metade, e aparece com Vaga Não Alocada nas colunas de vaga, cliente e cargo.",
    "Os cards contam dentro do escopo escolhido, então trocar de escopo muda os cards e a tabela juntos, e o número do card sempre bate com a lista.",
    "Na conta dos cards, a situação vence a etapa: quem já recebeu desfecho conta no card do desfecho, nunca no da etapa em que estava.",
    "A etapa só é mostrada enquanto a candidatura está viva. Encerrada, a coluna mostra Fora Do Funil, e o caminho percorrido continua na ficha.",
    "Os cards de etapa vêm do catálogo de etapas do funil: a lista muda quando o catálogo muda, e etapa fora de circulação só aparece quando ainda tem gente dentro.",
    "Último Contato anda só quando alguém registra um contato, e não quando a pessoa muda de etapa.",
    "A lista nunca mostra o CPF. Ele aparece só na ficha, uma pessoa por vez.",
  ],
  relacionados: [
    "filtrar-uma-lista",
    "ordenar-a-lista-pelo-cabecalho",
    "buscar-dentro-da-tela",
    "filtrar-pelo-card-de-indicador",
    "virar-a-pagina-da-lista",
    "ler-a-linha-da-tabela",
    "cadastrar-um-candidato-novo",
    "adicionar-um-candidato-a-uma-vaga",
    "ler-a-ficha-do-candidato",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/frontend/src/lib/as-candidatos.ts",
    "apps/frontend/src/lib/as-vagas-funil.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
