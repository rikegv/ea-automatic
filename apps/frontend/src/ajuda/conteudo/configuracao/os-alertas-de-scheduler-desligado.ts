import type { Artigo } from "../../tipos";

/**
 * FICHA: os cartões de rotina automática do Diagnóstico Do Sistema, e a quem escalar.
 *
 * COBRE as quatro rotinas que o painel vigia, os três estados que elas podem ter, e a diferença
 * entre DESLIGADA e PARADA, que é o que muda a conversa: desligada é uma decisão de alguém, parada
 * é a rotina ligada que não está mais concluindo os ciclos.
 *
 * DIZ COM TODAS AS LETRAS QUE RELIGAR NÃO É GESTO DE TELA, e a peça existe em grande parte por
 * isso. Uma rotina parada não volta por causa de um clique: o que faz ela rodar está no servidor, e
 * quem age ali é a administração. Sem essa frase escrita, a pessoa varre a tela procurando um botão
 * de conserto que não existe, e o tempo dela se gasta antes de o chamado ser aberto.
 *
 * O TEXTO DE USUÁRIO CHAMA A COISA DE "rotina automática". Os rótulos dos cartões estão em
 * `controles` como a tela os escreve, para quem procurar pelo rótulo achar esta peça, mas a prosa
 * não adota o vocabulário de quem construiu.
 *
 * NÃO COBRE a leitura das outras faixas da tela, que é da peça de leitura, em `relacionados`.
 *
 * NÃO COBRE ligar e desligar rotina. Os controles existem na janela e estão declarados para quem
 * perguntar o que eles são, e a resposta escrita é que a decisão é da administração, não de quem
 * está lendo o painel.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: cada rotina depende do serviço que ela consome, e o estado desses
 * serviços aparece na segunda faixa da mesma tela. Rotina que nunca concluiu um ciclo pode ser
 * rotina cujo serviço nunca esteve configurado neste ambiente.
 */
export const artigo: Artigo = {
  slug: "os-alertas-de-scheduler-desligado",
  titulo: "Os Alertas De Rotina Automática Desligada",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/diagnostico"],
  menus: ["diagnostico"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "saude-do-sistema",
  resumo:
    "Quais rotinas automáticas o Diagnóstico Do Sistema vigia, o que querem dizer ativa, desligada e parada, e a quem escalar quando uma delas para.",
  termos: [
    "rotina parada",
    "parou de rodar sozinho",
    "nao esta puxando automatico",
    "automatico desligado",
    "scheduler",
    "coleta automatica parou",
    "nao chega documento sozinho",
    "como religar",
    "ultimo ciclo",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra o Diagnóstico Do Sistema e vá até a terceira faixa de cartões.",
      detalhe:
        "É ali que ficam as rotinas automáticas. Cada cartão traz o nome da rotina e o estado dela em uma linha.",
      controles: ["Diagnóstico Do Sistema"],
    },
    {
      gesto: "Identifique as quatro rotinas que o painel vigia.",
      detalhe:
        "A de coleta busca documentos novos das admissões que vieram do Pandapé. A de coleta de vale-transporte recolhe os formulários preenchidos pelos candidatos. A da assinatura acompanha os contratos enviados para assinar. A do exame acompanha o resultado dos exames pendentes.",
      controles: [
        "Scheduler de coleta",
        "Scheduler da coleta de VT",
        "Scheduler da assinatura",
        "Verificador do exame",
      ],
    },
    {
      gesto: "Leia o estado escrito no cartão.",
      detalhe:
        "Ativo quer dizer rodando, e a linha traz o resultado do último ciclo. Desligado quer dizer que a rotina foi desativada de propósito. Parado é o caso que pede alguém: a rotina está ligada e não conclui um ciclo há tempo demais, e o cartão fica destacado em vermelho.",
    },
    {
      gesto: "Clique no cartão para abrir a janela com o detalhe.",
      detalhe:
        "Ela mostra o que a rotina faz, os números do último ciclo, o horário do último ciclo bem-sucedido e, quando houver, uma nota explicando a interrupção.",
      controles: ["Fechar"],
    },
    {
      gesto: "Anote o nome da rotina e o horário do último ciclo bem-sucedido.",
      detalhe:
        "São as duas informações que a administração precisa para agir. Sem elas, o chamado começa com uma pergunta em vez de um dado.",
    },
    {
      gesto: "Escale para a administração e acompanhe o cartão pelo Atualizar.",
      detalhe:
        "Não procure nesta tela um botão que conserte uma rotina parada: o que faz a rotina voltar a rodar é ação de servidor, feita fora do sistema. Os controles que a janela oferece pertencem à administração, e ligar ou desligar uma rotina é decisão dela, não de quem está lendo o painel.",
      controles: ["Rodar ciclo agora", "Ligar scheduler", "Desligar scheduler", "Atualizar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O cartão diz que a rotina está parada e você procura o botão que resolve.",
      acao: "Ele não existe, e isso não é falta de permissão sua. Parada quer dizer que a rotina está ligada e não conclui os ciclos, e isso se resolve no servidor. Anote o nome da rotina e o horário do último ciclo bem-sucedido e escale para a administração.",
    },
    {
      sintoma: "O cartão diz desligado e ninguém sabe desde quando.",
      acao: "Desligado é uma decisão registrada, não uma queda. Confirme com a administração se ela deveria estar ligada antes de qualquer outra coisa.",
    },
    {
      sintoma: "A rotina aparece parada e nunca teve um ciclo bem-sucedido.",
      acao: "Costuma ser serviço não configurado neste ambiente, e não rotina que caiu. Confira o cartão daquele serviço na segunda faixa da mesma tela e informe o que ele diz ao escalar.",
    },
    {
      sintoma: "A janela mostra que o último ciclo foi interrompido por um teto de segurança.",
      acao: "A rotina se protegeu de propósito e o próximo ciclo continua de onde parou. Repetindo por vários ciclos seguidos, escale com essa observação.",
    },
    {
      sintoma: "Documentos pararam de chegar sozinhos e você suspeita da rotina.",
      acao: "Confira antes a fila de Entradas Do Pandapé: entrada parada por motivo da origem não é rotina caída, e a fila diz o motivo por linha.",
    },
  ],
  regras: [
    "O painel vigia quatro rotinas automáticas: a coleta de documentos, a coleta de vale-transporte, o acompanhamento da assinatura e o do exame.",
    "Ativa, desligada e parada são coisas diferentes: desligada é decisão registrada, parada é rotina ligada que deixou de concluir os ciclos.",
    "Religar uma rotina parada não é gesto de tela: é ação de servidor, e quem age é a administração.",
    "O nome da rotina e o horário do último ciclo bem-sucedido são o que a administração precisa receber.",
  ],
  relacionados: [
    "ler-o-diagnostico-do-sistema",
    "os-alertas-de-arquivamento-e-de-prontuario",
    "ler-a-fila-de-entradas-do-pandape",
    "reprocessar-uma-entrada-do-pandape",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/diagnostico/page.tsx",
    "apps/backend/src/domain/scheduler-pandape.ts",
    "apps/backend/src/domain/scheduler-exame.ts",
    "apps/backend/src/domain/scheduler-vt-coleta.ts",
  ],
  revisadoEm: "2026-09-30",
};
