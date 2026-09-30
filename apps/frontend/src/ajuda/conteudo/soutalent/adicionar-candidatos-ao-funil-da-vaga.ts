import type { Artigo } from "../../tipos";

/**
 * ─ TRAZER GENTE PARA O FUNIL DA VAGA: um a um, em lote, e por transferência ────────────────────
 *
 * ┌─ A REGRA QUE ESTE ARTIGO EXISTE PARA FIXAR ──────────────────────────────────────────────────┐
 * │ ADICIONAR AO FUNIL NÃO CONSOME POSIÇÃO. Uma vaga de 10 recebe 40 pessoas no funil sem que a   │
 * │ meta se mexa, e é essa a diferença entre este gesto e a finalização de posição. A tela diz    │
 * │ isso em três lugares (o `title` do botão, o texto do cabeçalho do lote e a confirmação), e o  │
 * │ artigo tem de dizer o mesmo, porque é a dúvida que faz alguém queimar posição por engano.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE **NÃO** COBRE, e é decisão de escopo:
 *  . FINALIZAR A POSIÇÃO. É o gesto que consome a meta, e tem artigo próprio
 *    (`finalizar-a-posicao-da-vaga`). Ensinar as duas coisas na mesma peça é exatamente o jeito de
 *    a pessoa confundir uma com a outra.
 *  . MOVER DE ETAPA, os desfechos e o envio para a admissão: quem entra aqui nasce na primeira
 *    etapa do funil, e o que acontece depois é dos outros artigos da família.
 *  . CADASTRAR CANDIDATO NOVO. O caminho é citado (o botão existe na mesma barra) e a aula é do
 *    artigo `cadastrar-um-candidato-novo`.
 *
 * SEM ROTEIRO DE CAPTURA E SEM `print` NESTA ENTREGA: os gestos acontecem dentro do painel da vaga,
 * que lista nome de candidato por linha, e a liberação daquela superfície para o motor de captura
 * está em auditoria. O texto foi escrito para funcionar sem imagem nenhuma.
 */
export const artigo: Artigo = {
  slug: "adicionar-candidatos-ao-funil-da-vaga",
  titulo: "Adicionar Candidatos Ao Funil Da Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-funil",
  nivel: "N1",
  publico: "AMBOS",
  resumo:
    "Como trazer pessoas da base para o funil de uma vaga, uma a uma ou várias de uma vez, e como puxar para cá quem já está em outra vaga. Adicionar ao funil não consome posição da meta.",
  termos: [
    "adicionar candidato",
    "colocar na vaga",
    "vincular candidato",
    "alocar candidato",
    "por na vaga",
    "trazer candidato",
    "adicionar em massa",
    "adicionar vários",
    "funil da vaga",
    "transferir de vaga",
    "trocar a vaga da pessoa",
    "candidatos disponiveis",
    "quem pode entrar na vaga",
  ],
  preRequisitos: [
    "A vaga já precisa estar num status que recebe candidato novo. Em vaga encerrada a lista continua consultável e as ações ficam indisponíveis.",
  ],
  passos: [
    {
      gesto: "Abra o painel da vaga e fique na aba Ver Candidatos.",
      detalhe:
        "É a aba da lista completa de quem está na vaga, e é nela que ficam os botões de trazer gente.",
      controles: ["Ver Candidatos"],
    },
    {
      gesto: "Clique em Adicionar à vaga para trazer uma pessoa por vez.",
      detalhe:
        "A lista traz quem está na base e não está em vaga nenhuma, inclusive quem foi cadastrado sem CPF.",
      controles: ["Adicionar à vaga"],
    },
    {
      gesto: "Escolha a pessoa pelo nome e confirme em Alocar em vaga.",
      detalhe:
        "Quem entra nasce na primeira etapa do funil, como Em Seleção, e não ocupa posição da meta.",
      controles: ["Alocar em vaga"],
    },
    {
      gesto: "Clique em Adicionar vários ao funil para trazer várias pessoas de uma vez.",
      controles: ["Adicionar vários ao funil"],
    },
    {
      gesto:
        "Marque quem vai entrar, ou use Selecionar todos os visíveis, e clique em Adicionar ao funil.",
      print: {
        arquivo: "02-adicionar-varios-ao-funil.png",
        legenda: "A janela do lote, com a busca, a marcação em massa e o botão que aplica.",
      },
      detalhe:
        "O Selecionar todos os visíveis marca só quem está à vista: com a busca digitada, ele não alcança quem está fora da lista.",
      controles: ["Selecionar todos os visíveis", "Procurar pelo nome", "Adicionar ao funil"],
    },
    {
      gesto: "Leia o resultado do lote antes de fechar a janela.",
      detalhe:
        "Ele diz quantos entraram e quem ficou de fora, pessoa por pessoa. A janela não se fecha sozinha: quem adiciona trinta costuma adicionar mais.",
    },
    {
      gesto: "Abra a aba Candidatos Disponíveis para ver quem ainda pode entrar nesta vaga.",
      print: {
        arquivo: "01-candidatos-disponiveis.png",
        legenda:
          "A aba Candidatos Disponíveis: a coluna Vaga Atual separa quem está sem vaga de quem está em outra, e o botão do lote fica no alto.",
      },
      detalhe:
        "A lista junta duas populações, e a coluna Vaga Atual as separa: quem está com a tag Sem Vaga Alocada e quem já está em outra vaga.",
      controles: ["Candidatos Disponíveis", "Vaga Atual", "Sem Vaga Alocada"],
    },
    {
      gesto: "Clique em Vincular na linha de quem não está em vaga nenhuma.",
      controles: ["Vincular"],
    },
    {
      gesto: "Clique em Transferir na linha de quem já está em outra vaga.",
      detalhe:
        "Transferir move a mesma candidatura para cá e mantém a etapa da pessoa. A vaga de origem volta a ter aquela posição livre.",
      controles: ["Transferir"],
    },
    {
      gesto: "Volte à aba Ver Candidatos e confira quem entrou.",
      detalhe: "Quem acabou de entrar aparece na primeira etapa do funil, como Em Seleção.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A lista de quem pode entrar está vazia.",
      acao: 'A janela diz "Todo mundo que está na base já foi alocado em alguma vaga. Para trazer alguém novo, use o botão Cadastrar candidato." É isso: não há ninguém solto na base. Cadastre a pessoa, ou traga alguém de outra vaga pela aba Candidatos Disponíveis.',
    },
    {
      sintoma: "Ninguém aparece na aba Candidatos Disponíveis.",
      acao: 'A frase é "Ninguém está disponível agora: a base não tem pessoa sem vaga, e as outras vagas não têm candidatura em andamento para transferir." Cadastre a pessoa pelo botão Cadastrar candidato, na aba Ver Candidatos.',
    },
    {
      sintoma: "A lista avisa que está mostrando só parte dos candidatos.",
      acao: 'O aviso amarelo diz quantos estão à vista de quantos existem e termina com "Use a busca para encontrar quem não está na lista." Digite parte do nome no campo de busca: ela procura na base inteira, e não só no que está na tela.',
    },
    {
      sintoma: "O sistema recusa dizendo que a pessoa já está nesta vaga.",
      acao: 'A frase é "Esta pessoa já está nesta vaga." Ela já tem processo em andamento aqui. Procure o nome dela na aba Ver Candidatos, pelo campo Buscar Por Nome.',
    },
    {
      sintoma: "O sistema recusa por causa do status da vaga.",
      acao: 'A frase é "Esta vaga está Fechada e não recebe candidato novo.", com o status que a vaga tem hoje. Vaga encerrada não recebe gente nova: mova o status da vaga antes, ou use outra vaga.',
    },
    {
      sintoma: "Abriu a janela Reentrada Em Vaga Encerrada.",
      acao: "Não é erro: esta pessoa já teve um processo encerrado nesta vaga, e a janela mostra como terminou, quando e com que motivo. Confirmando em Estou Ciente, nasce uma candidatura nova em Captação, e o processo anterior continua no histórico.",
    },
    {
      sintoma: "Os botões de Vincular e Transferir estão cinza.",
      acao: "A vaga não recebe candidato novo no status atual. A lista segue consultável de propósito, e as ações voltam quando a vaga voltar a captar.",
    },
  ],
  regras: [
    "Adicionar ao funil não consome posição da meta: quem entra nasce em seleção e a conta de posições da vaga não se mexe.",
    "Entregar a posição é outro gesto, a finalização de posição, e é ele que consome a meta.",
    "A lista de quem pode entrar traz só quem não tem processo vivo em vaga nenhuma. Quem já está em outra vaga entra por transferência.",
    "Transferir mantém a etapa em que a pessoa está e devolve a posição que ela ocupava para a vaga de origem.",
    "Quem foi cadastrado sem CPF pode entrar no funil. O CPF passa a ser exigido só no envio para a admissão.",
    "Quem já teve processo encerrado nesta vaga só volta com a ciência da reentrada, e volta como candidatura nova.",
  ],
  relacionados: [
    "abrir-o-painel-da-vaga",
    "cadastrar-um-candidato-novo",
    "adicionar-um-candidato-a-uma-vaga",
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "ler-a-central-de-vagas",
    "agir-em-varias-linhas-de-uma-vez",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/components/as/vagas/CandidatosDisponiveisDaVaga.tsx",
    "apps/frontend/src/components/as/vagas/AdicionarCandidatosEmLoteModal.tsx",
    "apps/frontend/src/components/as/candidatos/AlocarCandidatoModal.tsx",
    "apps/frontend/src/components/as/candidatos/TrocarVagaModal.tsx",
    "apps/frontend/src/components/as/candidatos/ConfirmarReentradaModal.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
