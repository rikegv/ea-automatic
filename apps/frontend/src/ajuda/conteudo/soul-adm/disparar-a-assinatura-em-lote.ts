import type { Artigo } from "../../tipos";

/**
 * N1 DO DISPARO EM LOTE. É o caminho normal do dia a dia: a fila enche com vários kits e o disparo
 * sai de uma vez.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE:
 *   - COMO MARCAR VÁRIAS LINHAS: delegado ao artigo da seleção múltipla, que é o mesmo gesto em todo
 *     o sistema. Reexplicar aqui criaria duas versões da mesma instrução.
 *   - O DISPARO DE UM SÓ, e o que o sistema faz ao criar o documento: está no artigo irmão. Aqui o
 *     foco é a SELEÇÃO, o disparo do conjunto e a LEITURA DO RESULTADO, que é a parte que só existe
 *     no lote.
 *   - GERAR O KIT: outra tela, outro artigo.
 *
 * O ponto que o lote acrescenta e que precisa estar escrito: o resultado é PARCIAL por desenho. Um
 * candidato recusado não derruba os outros, e a janela do resultado diz, por pessoa, o que houve.
 *
 * A caixa de seleção de cada linha fica fora de `controles` porque o nome acessível dela carrega o
 * nome da pessoa. A caixa do cabeçalho, que é estável, está declarada.
 */
export const artigo: Artigo = {
  slug: "disparar-a-assinatura-em-lote",
  titulo: "Disparar A Assinatura Em Lote",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinaturas",
  resumo:
    "Como selecionar vários candidatos da fila e disparar a assinatura de uma vez, e como ler o resultado candidato por candidato quando parte do lote é recusada.",
  termos: [
    "disparar em lote",
    "enviar vários contratos",
    "assinatura em massa",
    "disparar todos",
    "selecionar todos",
    "resultado do disparo",
    "nao consigo marcar a linha",
    "linha bloqueada",
    "mandei tudo de uma vez",
  ],
  preRequisitos: [
    "Os candidatos precisam estar na fila Prontos Para Solicitar com a Situação apta.",
  ],
  passos: [
    {
      gesto: "Abra o Ass. Click e fique no recorte Prontos Para Solicitar.",
      detalhe: "O lote existe só neste recorte: é a única fila em que há disparo a fazer.",
      controles: ["Ass. Click", "Prontos Para Solicitar"],
    },
    {
      gesto: "Marque as linhas que você quer disparar.",
      detalhe:
        "A caixa do cabeçalho marca de uma vez todas as linhas aptas que estão na tela. Linha impedida não é marcada nem por ela.",
      controles: ["Selecionar todas as admissões aptas"],
    },
    {
      gesto: "Leia o aviso amarelo ao lado do botão, quando ele aparecer.",
      detalhe:
        "Ele diz quantas linhas estão com pendência e por isso ficaram fora da seleção. O motivo de cada uma está escrito na coluna Situação da própria linha.",
      controles: ["com pendência, não selecionável até resolver.", "Situação"],
    },
    {
      gesto: "Clique em Disparar assinatura.",
      detalhe: "O botão mostra quantos estão selecionados e fica apagado enquanto nada foi marcado.",
      controles: ["Disparar assinatura"],
    },
    {
      gesto: "Leia a confirmação e clique em Disparar agora.",
      detalhe:
        "O aviso lembra o que vai acontecer: o documento é criado e o convite de assinatura vai por e-mail para cada candidato, e a empresa só é chamada depois que o funcionário assinar. Voltar cancela sem disparar nada.",
      controles: ["Disparar agora", "Voltar", "Disparando"],
    },
    {
      gesto: "Leia a janela Resultado do disparo, candidato por candidato.",
      detalhe:
        "O topo dela diz quantos de quantos foram aceitos. Cada linha tem um check verde, quando foi aceita, ou um alerta vermelho com o motivo da recusa. Um recusado não impede os outros.",
      controles: ["Resultado do disparo", "enfileirado(s).", "Fechar"],
    },
    {
      gesto: "Feche a janela e confira a fila.",
      detalhe:
        "A seleção é limpa e a lista recarregada: quem foi aceito sai desta fila e passa a aparecer no recorte Gestão Das Assinaturas. Quem foi recusado continua aqui, para você resolver o motivo.",
      controles: ["Gestão Das Assinaturas", "Atualizar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de disparo está apagado.",
      acao: "Nada está marcado, ou outro disparo ainda está em andamento. Marque ao menos uma linha apta e espere o anterior terminar.",
    },
    {
      sintoma: "A caixa de uma linha não deixa marcar.",
      acao: "Aquela linha está impedida. Leia a coluna Situação dela: o motivo está escrito ali, e a linha só fica selecionável depois de resolvido.",
    },
    {
      sintoma: "O sistema responde: Selecione ao menos uma admissão.",
      acao: "A seleção chegou vazia ao servidor, normalmente porque a lista foi recarregada no meio do caminho. Marque as linhas de novo e dispare.",
    },
    {
      sintoma:
        "O resultado traz: Saiu da fila de disparo (kit removido, envelope já criado ou admissão pausada).",
      acao: "Aquele candidato deixou de ser disparável entre a hora em que a tela carregou e a hora do clique. Recarregue pelo Atualizar e confira em qual recorte ele está agora: se o documento já foi criado, não há nada a fazer.",
    },
    {
      sintoma: "O resultado traz: Kit não está mais anexado. Envie de novo pelo Gerador de Kit.",
      acao: "O kit daquela pessoa saiu da área temporária. Gere e envie o kit outra vez pelo Gerador de Kit; ela volta apta para esta fila.",
    },
    {
      sintoma: "O resultado traz: A fila de disparo não aceitou o pedido. Tente de novo em instantes.",
      acao: "Foi o serviço interno de disparo que não respondeu, e nenhum documento foi criado para aquele candidato. Ele continua na fila: repita o disparo dele em alguns instantes.",
    },
    {
      sintoma: "O resultado diz que foi enfileirado e a pessoa ainda não aparece como aguardando.",
      acao: "Aceito quer dizer que o pedido entrou na fila de execução; a criação do documento acontece em seguida. Use o Atualizar depois de alguns instantes. Não dispare de novo nesse intervalo.",
    },
  ],
  regras: [
    "O lote é parcial por desenho: um candidato recusado não derruba o disparo dos demais.",
    "Linha impedida nunca entra na seleção, nem pela caixa do cabeçalho.",
    "A caixa do cabeçalho marca só as linhas aptas que estão na tela naquele momento, ou seja, o que o filtro e a busca deixaram visível.",
    "A régua de quem pode ser disparado é conferida de novo no clique, porque entre carregar a tela e clicar pode ter passado horas.",
    "Aceito no resultado significa pedido enfileirado: o documento é criado em seguida, e é por isso que a linha pode demorar alguns instantes para trocar de recorte.",
    "A empresa só é chamada a assinar depois que o funcionário assinar.",
  ],
  relacionados: [
    "ler-a-gestao-das-assinaturas",
    "disparar-a-assinatura-de-um-candidato",
    "cancelar-o-documento-na-clicksign",
    "trocar-o-kit-anexado",
    "agir-em-varias-linhas-de-uma-vez",
    "enviar-o-kit-para-assinatura",
    "montar-o-grupo-de-assinatura-da-empresa",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/backend/src/clicksign/clicksign-gestao.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
    "apps/backend/src/domain/pdf-kit.ts",
  ],
  revisadoEm: "2026-09-30",
};
