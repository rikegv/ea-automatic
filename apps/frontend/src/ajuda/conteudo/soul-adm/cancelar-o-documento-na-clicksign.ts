import type { Artigo } from "../../tipos";

/**
 * N1 DO CANCELAMENTO. A ação mais destrutiva da tela, e a que mais precisa que a pessoa leia o aviso
 * antes de confirmar: o texto MUDA conforme o estado do documento, porque a consequência muda.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE:
 *   - REENVIAR POR CORREÇÃO: é outro artigo, e a diferença importa. Cancelar encerra e não gera nada
 *     novo; quem precisa do contrato de novo usa o reenvio, que já cancela o atual no caminho.
 *   - TROCAR O KIT: também encerra o documento, mas o objetivo dela é outro (substituir o arquivo).
 *   - LER A TELA: os recortes e as etiquetas estão no artigo de leitura.
 *
 * A VERDADE DURA QUE O ARTIGO PRECISA DIZER, e não é detalhe técnico: o cancelamento no serviço
 * externo é uma TENTATIVA. Ela pode não ser aceita, e nesse caso o documento continua de pé lá.
 * O estado que vale para o time é o que ESTA tela mostra, e a própria mensagem de retorno diz qual
 * dos dois casos aconteceu. Sem isso, alguém supõe que o funcionário foi avisado quando não foi.
 *
 * O aviso de retorno fica fora de `controles` porque carrega o nome da pessoa.
 */
export const artigo: Artigo = {
  slug: "cancelar-o-documento-na-clicksign",
  titulo: "Cancelar O Documento Na Clicksign",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinaturas",
  resumo:
    "Como cancelar o documento de assinatura de um candidato, o que muda no aviso conforme o estado dele e por que o estado que vale para o time é o que esta tela mostra.",
  termos: [
    "cancelar assinatura",
    "cancelar contrato",
    "cancelar envelope",
    "cancelar documento",
    "mandei errado",
    "contrato errado",
    "desfazer contrato assinado",
    "tirar da fila de assinatura",
    "anular contrato",
  ],
  preRequisitos: [
    "Saber se o objetivo é ENCERRAR aquele documento. Se a intenção é mandar o contrato corrigido, o caminho é o reenvio por correção, que já cancela o atual.",
  ],
  passos: [
    {
      gesto: "Abra o Ass. Click e ache o candidato no recorte em que ele está.",
      detalhe:
        "O cancelamento existe na fila de disparo, no acompanhamento e no contrato já assinado. Em documento já encerrado ele não aparece, porque não há o que cancelar.",
      controles: ["Ass. Click", "Prontos Para Solicitar", "Gestão Das Assinaturas", "Assinados"],
    },
    {
      gesto: "Clique no X vermelho da coluna Ações, o último dos botões de ação.",
      controles: ["Ações", "Cancelar o documento no SOUOperações e na Clicksign"],
    },
    {
      gesto: "LEIA o aviso da janela Cancelar O Documento antes de confirmar.",
      detalhe:
        "Ele muda conforme o estado. Sem documento criado, o aviso diz que ninguém é notificado, mas que o candidato SAI da fila de assinatura e o kit anexado é descartado. Com documento em andamento, ele diz que o documento em andamento é cancelado e o funcionário é notificado. Com o contrato já assinado, ele diz que um documento JÁ ASSINADO deixa de valer e o funcionário é notificado.",
      controles: ["Cancelar O Documento?"],
    },
    {
      gesto: "Clique em Cancelar documento para confirmar, ou em Voltar para desistir.",
      detalhe: "Voltar fecha a janela e não mexe em nada.",
      controles: ["Cancelar documento", "Voltar"],
    },
    {
      gesto: "Leia o aviso de retorno no alto da tela, porque ele diz o que aconteceu de cada lado.",
      detalhe:
        "Ou o documento foi cancelado nos dois lados, ou o serviço externo não aceitou o cancelamento e a mensagem avisa que o estado que vale é o desta tela. Sem documento criado, a mensagem diz que a pessoa saiu da fila e que o kit foi descartado.",
    },
    {
      gesto: "Confira onde a pessoa ficou.",
      detalhe:
        "Documento cancelado vai para o recorte Cancelados E Expirados. Cancelamento sem documento devolve a pessoa ao estado de quem ainda não tem kit, e ela só volta à fila quando o kit for enviado de novo pelo Gerador de Kit.",
      controles: ["Cancelados E Expirados", "Cancelado"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O aviso de retorno diz que a Clicksign não aceitou o cancelamento programático nesta conta.",
      acao: "O cancelamento no serviço externo é uma tentativa, e nesta conta ele pode não ser aceito. O sistema já registrou o documento como cancelado, e é esse registro que vale para o time. Atenção a uma consequência prática: quando o serviço externo não cancela, ele também não avisa o funcionário, então quem precisa que a pessoa saiba deve comunicá-la por outro caminho.",
    },
    {
      sintoma: "O sistema responde: Não há envelope nem kit anexado nesta admissão.",
      acao: "Não existe nada para cancelar naquela admissão. Ela provavelmente já foi encerrada antes, ou o kit já foi desanexado. Recarregue a fila pelo Atualizar e confira em qual recorte ela aparece.",
    },
    {
      sintoma: "A tela avisa: Falha ao cancelar o envelope.",
      acao: "O pedido não completou. Recarregue a fila pelo Atualizar e confira a etiqueta da pessoa antes de tentar de novo: se ela já está como Cancelado, o cancelamento aconteceu.",
    },
    {
      sintoma: "Cancelei sem querer alguém que ainda não tinha documento, e ele sumiu da fila.",
      acao: "Era o que o aviso avisava: sem documento criado, cancelar tira da fila e descarta o kit. Nada foi perdido de forma definitiva, mas o caminho de volta é gerar e enviar o kit de novo pelo Gerador de Kit.",
    },
    {
      sintoma: "O X não aparece na linha.",
      acao: "Documento já encerrado, cancelado ou expirado, não tem o que cancelar. Se aquela pessoa ainda precisa assinar, o caminho é o reenvio por correção.",
    },
    {
      sintoma: "Cancelei e o contrato assinado continua arquivado no prontuário.",
      acao: "É o esperado: o cancelamento encerra o documento e avisa o funcionário, mas não apaga o que já foi arquivado. O prontuário guarda as versões, e o registro desta tela é quem diz que aquele documento não vale mais.",
    },
  ],
  regras: [
    "O cancelamento no serviço externo é uma tentativa, e ela pode não ser aceita. O estado que vale para o time é o que esta tela mostra.",
    "A mensagem de retorno diz o que aconteceu de cada lado, para ninguém supor um aviso ao funcionário que não saiu.",
    "Quem avisa o funcionário é o cancelamento no serviço externo. Não aceito lá, o funcionário não é avisado por ele.",
    "Cancelar vale inclusive no contrato já assinado, justamente para o funcionário ser avisado de que o documento foi desfeito.",
    "Sem documento criado, cancelar significa tirar o candidato da fila e descartar o kit anexado. Para voltar, o kit tem de ser enviado de novo.",
    "O cancelamento não gera contrato novo. Quem precisa reenviar o contrato corrigido usa o reenvio por correção, que já cancela o atual no caminho.",
    "Documento encerrado sai do acompanhamento e passa a ser consultado em Cancelados E Expirados.",
  ],
  relacionados: [
    "ler-a-gestao-das-assinaturas",
    "reenviar-por-correcao-com-o-pdf-corrigido",
    "trocar-o-kit-anexado",
    "disparar-a-assinatura-de-um-candidato",
    "enviar-o-kit-para-assinatura",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/backend/src/clicksign/clicksign-gestao.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
    "apps/backend/src/domain/assinante-empresa.ts",
  ],
  revisadoEm: "2026-09-30",
};
