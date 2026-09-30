import type { Artigo } from "../../tipos";

/**
 * ─ 3 de 5 DA FILA DE NÃO CONFORMIDADES: A DECISÃO DA SUPERVISÃO ────────────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: os dois botões de decisão, quando eles aparecem, quem os vê, e o que muda
 * na linha e no quadro de contagem depois de cada um dos dois cliques.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ RESOLVER, que é o botão VIZINHO na mesma coluna e a confusão mais provável da tela. Resolver  │
 * │ fecha a pendência operacional e NÃO decide nada sobre responsabilidade; aprovar e reprovar    │
 * │ decidem responsabilidade e não fecham pendência nenhuma. Escritos juntos, os três viram "os   │
 * │ botões da linha", e é assim que alguém aprova achando que estava só fechando a tarefa.        │
 * │                                                                                               │
 * │ Também fica fora o PEDIDO da liberação, que é o gesto anterior a esta decisão e mora na peça  │
 * │ das duas vias, junto do motivo pelo qual as duas existem.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A coluna de consultor desta tela é nome de colega,
 * e a captura só entra quando a homologação tiver dado sintético. Os dois botões estão declarados
 * pelo rótulo literal.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "aprovar-ou-reprovar-uma-nao-conformidade",
  titulo: "Aprovar Ou Reprovar Uma Não Conformidade",
  modulo: "SOUL_ADM",
  rotas: ["/nao-conformidades"],
  menus: ["nao-conformidades"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nao-conformidades",
  resumo:
    "Como a supervisão decide um pedido de liberação por determinação da diretoria: onde estão os dois botões, o que cada decisão faz com a linha e o que acontece com a contagem do consultor.",
  termos: [
    "aprovar nc",
    "reprovar nc",
    "aprovar liberacao",
    "negar liberacao",
    "supervisao decide",
    "tirar a penalizacao",
    "quem aprova nc",
    "aguardando supervisao",
    "liberada pela diretoria",
    "nc voltou a penalizar",
  ],
  preRequisitos: [
    "Ser Master ou Super Admin. O consultor vê o pedido na fila e não decide sobre ele.",
    "A linha precisa estar em Aguardando supervisão: sem pedido pendente não há o que decidir.",
    "Ler o motivo que foi escrito no pedido, porque é ele que sustenta a decisão.",
  ],
  passos: [
    {
      gesto: "Abra Não Conformidades pelo menu da lateral esquerda.",
      controles: ["Não Conformidades"],
    },
    {
      gesto: "Filtre a fila por Situação e escolha Aguardando supervisão.",
      detalhe:
        "É o recorte do que espera decisão. Sem ele, os dois botões aparecem salteados no meio das demais linhas.",
      controles: ["Situação", "Aguardando supervisão"],
    },
    {
      gesto: "Leia o motivo do pedido antes de decidir.",
      detalhe:
        "Abra o olho no fim da linha para ver a ficha da admissão e conferir o caso. O detalhe do desvio aparece na fila embaixo do nome da pessoa.",
      controles: ["Ver ficha (somente leitura)"],
    },
    {
      gesto: "Clique em Aprovar para reconhecer a exceção.",
      detalhe:
        "A confirmação Liberação aprovada: exceção reconhecida. aparece acima da lista. A etiqueta da linha passa a Liberada pela diretoria, a linha deixa de contar contra o consultor e os botões de resolver e de pedir liberação somem dela: não há mais o que fazer ali.",
      controles: ["Aprovar"],
    },
    {
      gesto: "Clique em Reprovar quando a determinação não se sustenta.",
      detalhe:
        "A confirmação Liberação reprovada: volta a NC comum. aparece acima da lista. A linha volta para Aberta, volta a contar contra o consultor e aceita um pedido novo de liberação, com outro motivo.",
      controles: ["Reprovar"],
    },
    {
      gesto: "Confira o quadro de contagem acima da lista depois de decidir.",
      detalhe:
        "É ali que a decisão aparece em número: aprovada, a linha sai da contagem daquele consultor; reprovada, ela permanece.",
      controles: ["NCs que penalizam, por consultor"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Os botões Aprovar e Reprovar não aparecem na linha.",
      acao: "Ou a linha não está em Aguardando supervisão, ou o seu usuário não é de supervisão. O consultor vê no lugar dos botões o aviso de que aquele pedido aguarda supervisão.",
    },
    {
      sintoma: "A tela mostra Não há liberação pendente para decidir nesta NC.",
      acao: "Alguém decidiu antes de você, ou a tela estava desatualizada. Recarregue a página e leia a etiqueta atual da linha antes de clicar de novo.",
    },
    {
      sintoma: "Eu aprovei e a linha continua na fila.",
      acao: "Está correto. Aprovar não apaga o registro: ele permanece como histórico, com a etiqueta Liberada pela diretoria. O que a aprovação muda é a contagem contra o consultor.",
    },
    {
      sintoma: "Eu aprovei por engano.",
      acao: "A aprovação não tem desfazer nesta tela, e um pedido novo sobre a mesma linha é recusado depois de aprovado. Avise a administração para tratar o caso.",
    },
  ],
  regras: [
    "Decidir é ação de Master ou Super Admin; o consultor só enxerga o pedido.",
    "Só linha em Aguardando supervisão pode ser decidida.",
    "Aprovar é a única coisa no sistema que tira uma não conformidade da contagem do consultor.",
    "Reprovar devolve a linha para Aberta e permite um pedido novo, com outro motivo.",
    "Nenhuma das duas decisões apaga o registro: a fila guarda o que aconteceu.",
    "A decisão fica registrada no nome de quem decidiu, com a data.",
  ],
  relacionados: [
    "ler-a-fila-de-nao-conformidades",
    "as-duas-vias-da-nao-conformidade",
    "resolver-uma-nao-conformidade",
    "registrar-uma-nc-de-cadastro",
    "aceitar-o-avanco-com-pendencias",
    "ler-a-ficha-da-admissao",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nao-conformidades/page.tsx",
    "apps/backend/src/nao-conformidades/nao-conformidades.controller.ts",
    "apps/backend/src/nao-conformidades/nao-conformidades.service.ts",
    "apps/backend/src/domain/nao-conformidade.ts",
  ],
  revisadoEm: "2026-09-30",
};
