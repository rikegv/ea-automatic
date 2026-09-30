import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: congelar a lista de nomes que vai ao cliente, a data do envio, o motivo
 * exigido a partir do segundo envio, a confirmação da lista curta e a leitura dos envios anteriores.
 *
 * O QUE ELA DELIBERADAMENTE NAO COBRE:
 *   . MOVER A ETAPA DE QUEM FOI APRESENTADO. Mandar o nome ao cliente não decide nada sobre a
 *     pessoa, e a etapa dela continua sendo mexida pelo artigo de mover no funil. Ensinar as duas
 *     coisas juntas faria parecer que o envio anda o funil sozinho, e ele não anda.
 *   . A SELEÇÃO DAS LINHAS e as outras ações da mesma barra, que são do artigo de agir em massa.
 *   . OS ERROS COMUNS DA CENTRAL DE VAGAS, que moram na família "as-vagas".
 */
export const artigo: Artigo = {
  slug: "enviar-a-shortlist-ao-cliente",
  titulo: "Enviar A Shortlist Ao Cliente",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "Como registrar a lista de candidatos apresentada ao cliente, com a data do envio, e como reenviar uma lista nova quando ela mudar.",
  termos: [
    "shortlist",
    "short list",
    "mandar nomes para o cliente",
    "apresentar candidatos",
    "enviar curriculos para o cliente",
    "lista para o cliente",
    "reenvio",
    "mandei a lista errada",
    "quando mandei a lista",
    "quantos nomes mandei",
  ],
  preRequisitos: [
    "As pessoas que vão na lista já precisam estar no funil desta vaga e ainda em processo.",
    "Para reenviar, o catálogo de motivos de reenvio já precisa ter pelo menos um motivo cadastrado.",
  ],
  passos: [
    {
      gesto:
        "Abra o painel da vaga, vá para a aba Ver Candidatos e marque quem vai ser apresentado.",
      controles: ["Ver Candidatos"],
    },
    {
      gesto: "Clique em Enviar shortlist, na barra da seleção.",
      detalhe:
        "O gesto só existe em vaga em processo, ou seja, vaga aberta ou entregue. Vaga fechada, cancelada ou em rascunho não manda lista ao cliente.",
      controles: ["Enviar shortlist", "Entregue"],
    },
    {
      gesto: "Confira a data do envio.",
      detalhe:
        "Ela nasce com o dia de hoje e é esta data que passa a responder pelo campo Envio da shortlist na ficha da vaga.",
      controles: ["Enviar Shortlist Ao Cliente", "Data Do Envio"],
    },
    {
      gesto: "A partir do segundo envio, escolha o motivo do reenvio.",
      detalhe:
        "É o que explica, depois, por que a lista mudou. No primeiro envio o campo não existe, porque não há envio anterior a justificar.",
      controles: ["Motivo Do Reenvio", "Motivos De Reenvio Da Shortlist"],
    },
    {
      gesto: "Confira a lista de Quem Vai Na Lista e clique em Enviar shortlist.",
      detalhe:
        "É a última tela antes de a lista ser congelada, e quem já saiu do processo aparece apontado pelo nome para você tirar da seleção.",
      controles: ["Quem Vai Na Lista", "Cancelar"],
    },
    {
      gesto: "Se a lista for curta, leia o aviso e confirme com Enviar assim mesmo.",
      detalhe:
        "O aviso traz a contagem medida pelo sistema e o número sugerido. Enviar assim é permitido, e a confirmação fica registrada naquele envio.",
      controles: ["Enviar assim mesmo"],
    },
    {
      gesto: "Confira o envio em Shortlists Enviadas, na aba A Vaga do painel.",
      detalhe:
        "Cada cartão traz o número do envio, a data, quem mandou, o motivo do reenvio e os nomes. A etapa e a situação ao lado de cada nome são as de hoje, não as do dia do envio.",
      controles: ["A Vaga", "Shortlists Enviadas", "Lista Curta Confirmada"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O Enviar shortlist não aparece na barra da seleção.",
      acao: "O gesto só existe em vaga em processo. Confira a pill de status da vaga: fechada, cancelada e rascunho não oferecem o envio.",
    },
    {
      sintoma:
        "A tela mostra que a vaga não recebe shortlist. Só vaga em processo (aberta ou entregue) tem lista para mandar ao cliente.",
      acao: "A vaga foi encerrada depois de você abrir a janela. Recarregue a página e confira o status. Não existe registrar shortlist de vaga encerrada.",
    },
    {
      sintoma:
        "A tela mostra que candidatos selecionados não estão mais nesta vaga ou já saíram do processo. Recarregue a página e monte a lista de novo.",
      acao: "Alguém da seleção mudou de estado enquanto a janela estava aberta, e nada foi registrado. Recarregue, marque de novo quem vai e envie.",
    },
    {
      sintoma: "O aviso amarelo aponta pessoas que já saíram do processo.",
      acao: "Quem saiu do processo não vai ao cliente. Desmarque os nomes apontados e envie, ou traga a pessoa de volta antes se a saída estiver errada.",
    },
    {
      sintoma:
        "A tela mostra A primeira shortlist não tem motivo de reenvio: não há envio anterior a justificar. O motivo passa a ser pedido a partir do segundo envio.",
      acao: "O primeiro envio desta vaga não aceita motivo. Recarregue a página: o campo não deveria estar desenhado, e a lista de envios lida na abertura estava velha.",
    },
    {
      sintoma: "A tela mostra Este é um reenvio de shortlist. Informe o motivo do reenvio.",
      acao: "Escolha o motivo na lista antes de enviar. A partir do segundo envio ele é obrigatório.",
    },
    {
      sintoma: "A tela mostra Motivo de reenvio inválido. Escolha um motivo da lista.",
      acao: "O motivo escolhido saiu de circulação enquanto a janela estava aberta. Recarregue a página e escolha um da lista atual.",
    },
    {
      sintoma: "O seletor de motivo do reenvio está vazio.",
      acao: "Nenhum motivo está cadastrado, e sem ele o reenvio não é registrado. Peça o cadastro em Motivos De Reenvio Da Shortlist, na administração.",
    },
    {
      sintoma: "Mandei a lista errada ao cliente.",
      acao: "A lista enviada não se edita nem se apaga. Monte a seleção certa e faça um reenvio, com o motivo que explica a troca: o histórico guarda os dois envios.",
    },
  ],
  regras: [
    "A lista enviada fica congelada: quem foi apresentado naquele dia é fato, e fato não se edita.",
    "Mudou quem vai, o caminho é um reenvio, com número, data e motivo próprios.",
    "Só vai ao cliente quem está no funil desta vaga e ainda em processo.",
    "O motivo do reenvio é obrigatório a partir do segundo envio e vem do catálogo mantido pela administração.",
    "A lista curta avisa e não impede: a confirmação fica registrada naquele envio.",
    "Nos cartões de Shortlists Enviadas, quem estava na lista fica congelado; a etapa e a situação são as de hoje.",
  ],
  relacionados: [
    "agir-em-massa-no-funil-da-vaga",
    "abrir-o-painel-da-vaga",
    "mover-o-candidato-de-etapa",
    "reprovar-o-candidato-pelo-cliente",
    "marcar-a-entrevista-do-candidato",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/EnviarShortlistModal.tsx",
    "apps/frontend/src/components/as/vagas/ShortlistsDaVaga.tsx",
    "apps/frontend/src/components/as/vagas/AcoesEmMassaDaVaga.tsx",
    "apps/backend/src/as/shortlists/shortlists.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
