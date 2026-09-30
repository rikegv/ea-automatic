import type { Artigo } from "../../tipos";

/**
 * N1 DO MENU DO IFRACTAL: A CONFIGURAÇÃO POR CLIENTE.
 *
 * ┌─ DUAS TELAS PARECIDAS, E O ARTIGO PRECISA SEPARAR AS DUAS NA PRIMEIRA LINHA ──────────────────┐
 * │ Esta tela configura o CLIENTE: qual é o tipo de marcação dele e se ele está ativo. A aba        │
 * │ iFractal da Esteira preenche a CREDENCIAL da pessoa, e tem artigo próprio. Mesmo nome, trabalhos │
 * │ diferentes, e é a confusão mais comum aqui. A família já diz isso uma vez, então o artigo não    │
 * │ repete: ele só não deixa dúvida sobre onde está.                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ALCANCE DA COLUNA STATUS, QUE É MAIOR QUE ESTA TELA (medido no serviço) ───────────────────┐
 * │ Trocar o TIPO DE MARCAÇÃO alcança só o iFractal, e é leitura: as admissões herdam o tipo do     │
 * │ cliente, então não há nada a propagar. Já o STATUS (ativo ou inativo) é a situação do cliente no │
 * │ CADASTRO: cliente inativo desaparece dos seletores do sistema inteiro, e não só daqui. Os dois   │
 * │ ficam atrás do mesmo lápis, e é por isso que o artigo avisa antes, em passo separado.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ PENDÊNCIA CONHECIDA, REGISTRADA E NÃO CONSTRUÍDA ───────────────────────────────────────────┐
 * │ NÃO EXISTE catálogo próprio do tipo de marcação: a lista dos quatro tipos vive no sistema e não  │
 * │ é editável por tela. Ele é escolhido por cliente, aqui e na ficha do cliente, e o menu do        │
 * │ iFractal só gerencia a lista de STATUS. O artigo documenta o que existe e não promete tela que   │
 * │ não existe; a ausência está na família, como sintoma, para quem for procurar o catálogo.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a captura está suspensa enquanto a homologação não tiver arnês
 * sintético, então o texto foi escrito para funcionar sem imagem, nomeando cada coluna e controle.
 *
 * §A.6: nenhum dado de pessoa. Esta tela é de cliente, e nem assim aparece valor de linha nenhuma.
 */
export const artigo: Artigo = {
  slug: "configurar-o-tipo-de-marcacao-por-cliente",
  titulo: "Configurar O Tipo De Marcação Por Cliente",
  modulo: "SOUL_ADM",
  rotas: ["/ifractal"],
  menus: ["ifractal"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "ifractal",
  resumo:
    "Como escolher o tipo de marcação de ponto de cada cliente, o que a coluna de admissões diz sobre o alcance dessa troca e como usar os filtros próprios desta tela.",
  termos: [
    "tipo de marcacao",
    "marcacao de ponto",
    "biometria",
    "reconhecimento facial",
    "cartao de ponto",
    "aplicativo de ponto",
    "ponto do cliente",
    "configurar cliente no ifractal",
    "trocar tipo de marcacao",
    "cliente inativo",
  ],
  preRequisitos: [
    "Saber qual é o tipo de marcação combinado com aquele cliente: a tela grava a decisão, ela não a descobre.",
  ],
  passos: [
    {
      gesto: "Abra o iFractal pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre com a lista de clientes. Ela configura o cliente: a credencial de cada pessoa é preenchida na aba iFractal da Esteira, que é outra tela.",
      controles: ["iFractal"],
    },
    {
      gesto: "Leia as colunas da lista.",
      detalhe:
        "Código é o código do cliente, e não a matrícula de ninguém. Cliente é o nome de operação, ou a razão social quando não há nome de operação. Tipo De Marcação é o que você vai configurar. Admissões é quantas admissões daquele cliente já estão na frente do iFractal. Status é a situação do cliente no cadastro.",
      controles: ["Código", "Cliente", "Tipo De Marcação", "Admissões", "Status", "Ações"],
    },
    {
      gesto: "Ache o cliente pelos filtros do topo.",
      detalhe:
        "Os três filtros aceitam vários valores ao mesmo tempo e se somam: Cliente, Tipo De Marcação e Status. A caixa ao lado procura por código, nome de operação ou razão social, e o botão de atualizar recarrega a lista.",
      controles: ["Cliente", "Tipo De Marcação", "Status"],
    },
    {
      gesto: "Clique no lápis da coluna Ações para abrir a edição daquela linha.",
      detalhe:
        "Fora da edição a célula é só texto, de propósito: um seletor aberto na linha convidaria a trocar sem querer, e a troca alcança todas as admissões daquele cliente. É uma linha por vez.",
    },
    {
      gesto: "Escolha o Tipo De Marcação no seletor da linha.",
      detalhe:
        "São quatro: Cartão, Biometria, Reconhecimento Facial e Aplicativo. A coluna Admissões, ao lado, é o tamanho do que a escolha alcança: as admissões daquele cliente leem o tipo do cliente, então todas passam a mostrar o novo.",
      controles: ["Cartão", "Biometria", "Reconhecimento Facial", "Aplicativo"],
    },
    {
      gesto: "Mexa no Status só quando a intenção for inativar o cliente no cadastro.",
      detalhe:
        "Esse campo não é do iFractal: ele é a situação do cliente no sistema. Marcado como inativo, o cliente deixa de aparecer nos seletores das outras telas. Querendo mexer só no tipo de marcação, deixe o Status como está.",
      controles: ["Ativo", "Inativo"],
    },
    {
      gesto: "Clique no check para salvar, ou no X para cancelar a edição.",
      detalhe:
        "Só o que você mudou é gravado, então salvar depois de trocar o tipo não mexe na situação do cliente. A mensagem do topo confirma com o nome do cliente.",
    },
    {
      gesto: "Ordene pelo cabeçalho quando precisar de visão de conjunto.",
      detalhe:
        "As cinco colunas de conteúdo ordenam por clique. Ordenar por Admissões mostra onde uma troca de tipo pesa mais; ordenar por Tipo De Marcação agrupa quem já está configurado igual.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela responde Cliente não encontrado.",
      acao: "Aquele código de cliente não existe mais no cadastro. Clique no botão de atualizar para recarregar a lista antes de tentar de novo.",
    },
    {
      sintoma: "Troquei o tipo e as admissões que já estavam na frente continuaram como antes.",
      acao: "Recarregue a Esteira. As admissões não guardam o tipo, elas leem o do cliente, então o valor novo aparece na próxima leitura da tela. Nada precisa ser reprocessado.",
    },
    {
      sintoma: "Um cliente desapareceu dos seletores de outras telas depois que eu salvei aqui.",
      acao: "O Status foi para inativo. Esse campo é a situação do cliente no cadastro, e vale para o sistema inteiro. Volte nesta linha e marque Ativo.",
    },
    {
      sintoma: "A coluna Admissões está em zero e eu sei que o cliente tem gente admitida.",
      acao: "A coluna conta só quem já chegou à frente do iFractal, que nasce junto do Cadastro. Quem ainda está em Auditoria ou Exame não entra nessa conta.",
    },
    {
      sintoma: "Editei a linha errada e já salvei.",
      acao: "Abra o lápis daquele cliente e devolva o valor anterior. A tela grava o último valor salvo e não guarda histórico desta troca, então confira antes de sair.",
    },
    {
      sintoma: "O lápis abre em uma linha e eu quero editar duas ao mesmo tempo.",
      acao: "É uma linha por vez, de propósito. Salve ou cancele a atual e abra a seguinte.",
    },
    {
      sintoma: "O mesmo campo aparece também na ficha do cliente e eu não sei qual vale.",
      acao: "É o mesmo dado, escrito por duas portas: vale sempre o último salvo. Aqui ele está onde o time do ponto trabalha, com a contagem de admissões ao lado.",
    },
  ],
  regras: [
    "Esta tela configura o cliente. A credencial de cada pessoa é preenchida na aba iFractal da Esteira.",
    "São quatro tipos de marcação: Cartão, Biometria, Reconhecimento Facial e Aplicativo.",
    "A admissão herda o tipo de marcação do cliente por leitura: trocar aqui vale para todas as admissões daquele cliente, sem reprocessar nada.",
    "A coluna Admissões conta quem já está na frente do iFractal, e é a medida do alcance da troca.",
    "A coluna Status é a situação do cliente no cadastro, e não um estado do iFractal: cliente inativo sai dos seletores de todo o sistema.",
    "Só o que muda é gravado: salvar o tipo não mexe na situação, e salvar a situação não mexe no tipo.",
    "A edição é de uma linha por vez, e o lápis é o que abre os controles.",
    "Não existe catálogo do tipo de marcação: a lista dos quatro é do sistema, e o menu do iFractal gerencia a lista de status.",
  ],
  relacionados: [
    "gerenciar-a-lista-de-status-do-ifractal",
    "gerenciar-as-credenciais-do-ifractal",
    "filtrar-uma-lista",
    "ordenar-a-lista-pelo-cabecalho",
    "buscar-dentro-da-tela",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/ifractal/page.tsx",
    "apps/backend/src/ifractal/ifractal-gestao.service.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
