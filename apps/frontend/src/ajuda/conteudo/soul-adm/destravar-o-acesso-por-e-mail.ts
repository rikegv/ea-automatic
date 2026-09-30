import type { Artigo } from "../../tipos";

/**
 * N1 DO PORTAL: AS DUAS FILAS DE QUEM NÃO CONSEGUE ENTRAR.
 *
 * ┌─ O QUE FOI MEDIDO ANTES DE ESCREVER, PORQUE METADE DISTO AINDA NÃO ESTÁ LIGADO ──────────────┐
 * │ A tela tem TRÊS vistas, e as duas primeiras funcionam hoje: o painel e a fila "Pedidos De      │
 * │ Ajuda Para Entrar", alimentada pelo botão "Não consigo entrar" da tela do candidato            │
 * │ (`app/portal/page.tsx`, a válvula de recuperação).                                             │
 * │                                                                                                │
 * │ A TERCEIRA, "Travas Do Acesso Por E-mail", está PRONTA e INERTE, e a medição é esta: a porta    │
 * │ que cria trava recusa TODO pedido com 503 enquanto faltar o segredo do código ou o canal de     │
 * │ envio de e-mail (`garantirPorta`, em `portal/portal-acesso-email.service.ts`, que exige         │
 * │ `pepperDoCodigo`, a trilha configurada e `correio.configurado()`). No arquivo de configuração   │
 * │ do backend em uso, NENHUMA dessas variáveis de correio está presente, e o envio por conta de    │
 * │ serviço ainda depende de autorização no provedor de e-mail, que é concessão externa.            │
 * │                                                                                                │
 * │ CONSEQUÊNCIA PARA O TEXTO, e é por isso que ele ficou como ficou: enquanto isso não for ligado, │
 * │ NINGUÉM entra pelo e-mail, então nenhuma trava nasce e a fila fica legitimamente VAZIA. O       │
 * │ artigo ensina a LER e a DESTRAVAR uma linha (que é o que a tela faz de verdade quando existe    │
 * │ linha) e diz, no lugar certo, que fila vazia não é defeito. Nenhum passo promete que o          │
 * │ candidato consegue pedir o link por e-mail hoje.                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TRAVA NÃO É CASTIGO, E O DESTRAVE NÃO É CARIMBO ─────────────────────────────────────────┐
 * │ O sistema trava quando não consegue confirmar de quem é a caixa de e-mail: o dado informado     │
 * │ discorda do cadastro, o documento pertence a outro candidato, ou o mesmo e-mail resolve para    │
 * │ mais de uma pessoa. Destravar sem corrigir o cadastro faz o sistema travar de novo, e a própria │
 * │ janela diz isso. O motivo escolhido no destrave é CONFERIDO pelo servidor: errar o motivo não    │
 * │ destrava.                                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a fila não tem coluna de CPF, de e-mail, do valor informado nem do valor esperado, e não
 * existe campo de texto livre no destrave. Nenhum dado de pessoa aparece neste arquivo.
 *
 * IMAGEM: pendência conhecida. As duas filas mostram nome de pessoa, e a auditoria de segurança
 * recusou capturar tela com gente enquanto a homologação não tiver dado sintético.
 */
export const artigo: Artigo = {
  slug: "destravar-o-acesso-por-e-mail",
  titulo: "Destravar O Acesso Por E-mail",
  modulo: "SOUL_ADM",
  rotas: ["/admin/portal-links"],
  menus: ["portal-links"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "portal",
  resumo:
    "Como atender quem avisou que não consegue entrar no portal e como ler e desfazer uma trava de acesso por e-mail, conferindo o cadastro antes de liberar.",
  termos: [
    "candidato nao consegue entrar",
    "travou o cpf dele",
    "nao consigo entrar",
    "pedido de ajuda",
    "acesso por email",
    "trava de acesso",
    "destravar",
    "destravar acesso",
    "divergencia de cadastro",
    "cpf de outro candidato",
    "email ambiguo",
    "candidato pediu ajuda",
    "nao recebi o link",
    "liberar candidato",
  ],
  preRequisitos: [
    "Ter o cadastro do candidato à mão para conferir com ele. O destrave sem correção não resolve: o sistema trava de novo se a divergência continuar.",
    "Saber que a entrada por e-mail depende de o envio de e-mail estar ligado no sistema. Enquanto não estiver, nenhuma trava nasce e a fila fica vazia, o que é o estado correto e não um defeito.",
  ],
  passos: [
    {
      gesto: "Abra o menu Portal Do Candidato e veja as três vistas da tela.",
      detalhe:
        "Painel Do Portal é o funil da coleta. Pedidos De Ajuda Para Entrar é quem avisou que não consegue entrar. Travas Do Acesso Por E-mail é quem tentou receber o link pelo e-mail e não teve os dados confirmados. As duas últimas têm um número ao lado do nome quando há trabalho.",
      controles: [
        "Portal Do Candidato",
        "Painel Do Portal",
        "Pedidos De Ajuda Para Entrar",
        "Travas Do Acesso Por E-mail",
      ],
    },
    {
      gesto: "Abra Pedidos De Ajuda Para Entrar e leia a fila da esquerda para a direita.",
      detalhe:
        "Candidato, Cargo e Cliente identificam a pessoa. Pediu Em é a última vez que ela avisou, e Vezes é quantas vezes ela tentou: mais de uma vira uma etiqueta amarela na linha. Esta lista também não se atualiza sozinha.",
      controles: ["Candidato", "Cargo", "Cliente", "Pediu Em", "Vezes", "Atualizar"],
    },
    {
      gesto: "Atenda a linha por um dos dois botões dela.",
      detalhe:
        "Um gera um link novo para aquela pessoa e mostra a URL para você copiar. O outro leva ao painel já filtrado pelo nome dela, para você ver a situação antes de decidir. O link é a chave de acesso daquela pessoa: mande direto para ela, nunca em grupo, em lista nem em planilha compartilhada.",
      controles: [
        "Gerar o link do portal deste candidato e copiar. Se ele estiver usando o link dele agora, o sistema avisa e não troca",
        "Ver este candidato no painel",
      ],
    },
    {
      gesto: "Abra Travas Do Acesso Por E-mail quando houver número na aba.",
      detalhe:
        "A própria vista explica o que ela é: quem tentou entrar pelo e-mail e não teve os dados confirmados. Confira com a pessoa, corrija o cadastro e destrave.",
      controles: ["Travas Do Acesso Por E-mail", "Atualizar"],
    },
    {
      gesto: "Leia as colunas da fila de travas.",
      detalhe:
        "Motivo Da Trava diz por que o sistema não confirmou: Divergência De Cadastro, CPF De Outro Candidato, E-mail Ambíguo ou Trava Anterior. Travado Em é quando aconteceu, Tentativas é quantas vezes a pessoa tentou, Situação é Aberta ou Destravada, e Destravado Por mostra quem liberou, ou não informado enquanto ninguém liberou.",
      controles: [
        "Candidato",
        "Motivo Da Trava",
        "Travado Em",
        "Tentativas",
        "Situação",
        "Aberta",
        "Destravada",
        "Destravado Por",
        "Divergência De Cadastro",
        "CPF De Outro Candidato",
        "E-mail Ambíguo",
        "Trava Anterior",
      ],
    },
    {
      gesto: "Recorte a fila pelo filtro quando ela crescer.",
      detalhe:
        "Os dois filtros aceitam mais de um valor: Motivo da trava e Situação. Escolher as duas situações é o mesmo que não filtrar, porque uma é o contrário da outra.",
      controles: ["Motivo da trava", "Situação", "Todos os motivos", "Todas as situações"],
    },
    {
      gesto: "Antes de destravar, confira os dados com a pessoa e corrija o cadastro dela.",
      detalhe:
        "O motivo da trava diz o que conferir: dado que discorda do cadastro, documento que aparece em outro candidato, ou e-mail usado por mais de uma pessoa. Sem corrigir, o sistema trava de novo na próxima tentativa.",
    },
    {
      gesto: "Clique no botão de destravar da linha e confirme o motivo na janela.",
      detalhe:
        "A janela Destravar Acesso mostra Motivo desta trava em destaque e pede que você escolha o mesmo motivo no campo Confirme o motivo da trava. Ele nasce vazio de propósito: a escolha é o seu reconhecimento do que está sendo desfeito, e o sistema confere.",
      controles: [
        "Destravar o acesso por e-mail deste candidato",
        "Destravar Acesso",
        "Motivo desta trava",
        "Confirme o motivo da trava",
        "Selecionar o motivo desta trava",
        "Destravar acesso",
        "Cancelar",
      ],
    },
    {
      gesto: "Confira que a linha passou a Destravada e que o seu nome aparece em Destravado Por.",
      detalhe:
        "Linha já destravada não aceita a ação de novo: o botão fica apagado dizendo Este acesso já está destravado.",
      controles: ["Destravada", "Destravado Por", "Este acesso já está destravado"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A lista diz Nenhuma trava de acesso por e-mail no momento. e você esperava encontrar alguém.",
      acao: "Vazia é o estado normal quando ninguém tentou entrar pelo e-mail. A entrada por e-mail depende de o envio de e-mail estar ligado no sistema, e enquanto não estiver nenhuma trava nasce. Confirme com a administração antes de tratar o vazio como defeito, e atenda a pessoa pela outra fila, a de pedidos de ajuda, gerando um link novo.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar as travas do acesso por e-mail.",
      acao: "Só esta vista falhou, o painel segue funcionando. Clique em Atualizar dentro dela. Se repetir, recarregue a página e avise a administração.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar os pedidos de ajuda para entrar.",
      acao: "Só a fila de pedidos falhou. Clique em Atualizar dentro daquela aba e, se repetir, recarregue a página.",
    },
    {
      sintoma:
        "Confirmei o motivo e apareceu Não destravamos: a fila mudou desde que esta tela abriu. Acabamos de atualizar os dados, confira o motivo em destaque e confirme de novo.",
      acao: "A linha mudou depois que a tela carregou: outra pessoa destravou, ou a trava voltou com outro motivo. A lista já foi atualizada para você. Releia o motivo em destaque na janela e confirme com o motivo de agora.",
    },
    {
      sintoma: "A tela respondeu Esta trava não está mais na fila. Acabamos de atualizar a lista.",
      acao: "Aquela linha saiu da fila entre o carregamento e o seu clique. Não há o que confirmar: releia a lista e confira se a pessoa ainda precisa de você.",
    },
    {
      sintoma: "A tela mostra Falha ao destravar o acesso.",
      acao: "A chamada não completou e nada mudou. Clique em Atualizar, confira a situação da linha e tente de novo.",
    },
    {
      sintoma: "Destravei e a pessoa travou de novo.",
      acao: "O destrave não corrige a divergência: ele só desfaz a trava. Confira o cadastro contra o que a pessoa informou, corrija o que está diferente e destrave depois.",
    },
    {
      sintoma: "O botão de destravar da linha está apagado.",
      acao: "Aquela trava já foi desfeita, e o aviso do mouse diz isso. Confira a coluna Destravado Por para ver quem liberou.",
    },
    {
      sintoma: "Quero saber qual dado a pessoa digitou errado.",
      acao: "A fila não guarda o valor informado nem o valor esperado, de propósito, e não há campo de observação. O que ela diz é o motivo da trava, e a conferência é feita com a pessoa, olhando o cadastro dela.",
    },
  ],
  regras: [
    "A entrada por e-mail nunca abre o portal: ela pede que o sistema envie o link para a caixa da pessoa. Quem abre o portal continua sendo o link mais a identificação.",
    "A trava existe quando o sistema não consegue confirmar de quem é a caixa de e-mail. Ela protege a pessoa certa, e desfazê-la é ato registrado.",
    "Corrija o cadastro antes de destravar. Destravar sem corrigir faz o sistema travar de novo.",
    "O motivo escolhido no destrave precisa ser o motivo daquela trava: o sistema confere e recusa a liberação quando não bate.",
    "Só linha aberta se destrava. Linha já destravada guarda quem liberou e quando.",
    "O destrave fica registrado com o seu nome, que vem da sua sessão.",
    "A fila não guarda documento, e-mail, valor informado nem observação em texto livre.",
    "Nem esta fila nem a de pedidos de ajuda se atualizam sozinhas: cada uma tem o seu botão de atualizar.",
  ],
  relacionados: [
    "gerar-o-link-do-portal-para-o-candidato",
    "acompanhar-a-conferencia-do-portal",
    "bloquear-e-desbloquear-o-acesso-do-candidato",
    "atender-a-fila-de-intervencao-humana",
    "reaproveitar-um-candidato-pelo-cpf",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/portal-links/page.tsx",
    "apps/frontend/src/lib/portal-acesso-email.ts",
    "apps/backend/src/portal/portal-acesso-email.service.ts",
    "apps/backend/src/portal/portal-pedidos-ajuda.service.ts",
    "apps/backend/src/portal/portal-correio.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
