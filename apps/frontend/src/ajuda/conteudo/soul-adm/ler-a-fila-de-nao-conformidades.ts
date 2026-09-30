import type { Artigo } from "../../tipos";

/**
 * ─ 1 de 5 DA FILA DE NÃO CONFORMIDADES: LER, e só ler ──────────────────────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: as colunas da tabela, o quadro de contagem por consultor, os filtros (com
 * o de período à frente), a ordenação pelo cabeçalho, o olho da ficha e o que cada estado da linha
 * quer dizer.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ NENHUM GESTO DE JULGAR. Resolver, aprovar, reprovar e pedir a liberação por diretoria são     │
 * │ quatro verbos vizinhos que moram na MESMA coluna da MESMA linha, e é exatamente por isso que  │
 * │ cada um tem artigo próprio: explicados de passagem, viram "clique no botão que aparecer", que │
 * │ é o erro que a fila não perdoa, porque julgar é registro permanente de responsabilização.     │
 * │                                                                                               │
 * │ O POR QUE a fila tem dois tipos de linha também fica fora: é a peça das duas vias. Aqui a     │
 * │ pessoa aprende a LER o que está escrito, não a decidir sobre ele.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A auditoria de segurança vetou a captura das telas
 * que mostram pessoa enquanto a homologação não tiver dado sintético, e a coluna de consultor desta
 * tela é nome de colega de verdade. O texto foi escrito para funcionar sem nenhuma imagem: toda
 * coluna e todo controle aparecem pelo rótulo literal.
 *
 * Nenhum dado de pessoa neste arquivo, só rótulos de coluna, de campo e de botão.
 */
export const artigo: Artigo = {
  slug: "ler-a-fila-de-nao-conformidades",
  titulo: "Ler A Fila De Não Conformidades",
  modulo: "SOUL_ADM",
  rotas: ["/nao-conformidades"],
  menus: ["nao-conformidades"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nao-conformidades",
  resumo:
    "Como ler a tela de Não Conformidades: o que cada coluna mostra, o que o quadro de contagem por consultor conta, como recortar a fila por período e o que significa cada situação da linha.",
  termos: [
    "nao conformidade",
    "nc",
    "levei nc",
    "quantas nc eu tenho",
    "fui penalizado",
    "desvio de processo",
    "contador de nc",
    "nc por consultor",
    "nc do mes",
    "filtrar nc por data",
    "aguardando supervisao",
    "liberada pela diretoria",
    "nc aberta",
    "nc resolvida",
  ],
  preRequisitos: [
    "Nada a preencher: esta tela é de leitura. Ver a fila não exige papel de supervisão.",
  ],
  passos: [
    {
      gesto: "Abra Não Conformidades pelo menu da lateral esquerda.",
      detalhe:
        "A fila abre já carregada, com a não conformidade mais recente no topo e sem nenhum filtro aplicado.",
      controles: ["Não Conformidades"],
    },
    {
      gesto: "Leia o quadro de contagem que fica acima da lista.",
      detalhe:
        "Ele mostra um botão por consultor com o número de não conformidades que penalizam aquela pessoa. Clicar no botão filtra a lista por ela, e clicar de novo desmarca.",
      controles: ["NCs que penalizam, por consultor"],
    },
    {
      gesto: "Leia a linha da esquerda para a direita, coluna por coluna.",
      detalhe:
        "Candidato traz o nome e, embaixo, o detalhe do que aconteceu. Cliente traz a razão social e o código. Tipo traz a etiqueta curta e, embaixo, o nome do desvio.",
      controles: ["Candidato", "Cliente", "Tipo"],
    },
    {
      gesto: "Confira as três colunas do meio: quem responde e as duas datas.",
      detalhe:
        "Consultor é o responsável registrado, que é quem gerou a admissão, não quem registrou a não conformidade. Data adm. é a data de admissão da pessoa e Registrada é o dia em que o desvio entrou no sistema. Sem valor, a célula mostra não informado.",
      controles: ["Consultor", "Data adm.", "Registrada"],
    },
    {
      gesto: "Leia a etiqueta da coluna Situação / ação, que é o estado atual daquela linha.",
      detalhe:
        "São quatro. Aberta: o desvio está de pé e conta contra o consultor. Aguardando supervisão: alguém alegou determinação da diretoria e a supervisão ainda não decidiu. Resolvida: a pendência foi fechada, e o registro continua na fila como histórico. Liberada pela diretoria: exceção reconhecida, e essa é a única que deixa de contar contra o consultor.",
      controles: ["Situação / ação"],
    },
    {
      gesto: "Recorte a fila por período no painel de filtros, no canto superior direito.",
      detalhe:
        "Registrada de e Registrada até olham a data do REGISTRO do desvio, nunca a data de admissão. Preencher só a primeira lê dali para frente, só a segunda lê até aquele dia, e as duas juntas fecham a janela. As duas datas contam como um filtro só no número do painel.",
      controles: ["Período", "Registrada de", "Registrada até"],
    },
    {
      gesto: "Some os outros quatro filtros quando precisar afunilar mais.",
      detalhe:
        "Tipo, Situação, Consultor e Cliente aceitam mais de um valor ao mesmo tempo. A busca do topo procura por nome, CPF e cliente de uma vez, e Limpar filtro devolve a fila inteira.",
      controles: [
        "Tipo",
        "Situação",
        "Consultor",
        "Cliente",
        "Buscar por nome, CPF ou cliente",
        "Limpar filtro",
      ],
    },
    {
      gesto: "Clique no título de qualquer coluna para ordenar por ela.",
      detalhe:
        "Candidato, Cliente, Tipo e Consultor ordenam em ordem alfabética nos dois sentidos. As duas datas trazem a mais recente no primeiro clique. Situação / ação ordena pela ordem do processo, das abertas para as resolvidas, e não em ordem alfabética.",
    },
    {
      gesto: "Abra o olho no fim da linha para ver a ficha da pessoa.",
      detalhe: "A ficha abre somente para leitura: nada do que está nela pode ser alterado por ali.",
      controles: ["Ver ficha (somente leitura)"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O número do quadro de contagem não muda quando eu filtro a lista.",
      acao: "É assim de propósito. O quadro é a visão de gestão do que já aconteceu e não segue os filtros da tela: ele conta tudo o que penaliza, inclusive o que já foi resolvido. Quem responde ao filtro é a lista.",
    },
    {
      sintoma: "Um dos botões do quadro de contagem não clica.",
      acao: "É o botão das não conformidades sem consultor associado. Ele existe para você ver o número, e não há por quem filtrar, então ele fica desabilitado.",
    },
    {
      sintoma: "Uma não conformidade que eu sei que existe não aparece na lista.",
      acao: "Confira se a admissão daquela pessoa está pausada. Não conformidade de admissão pausada sai da fila enquanto a pausa dura, sem ser apagada nem resolvida, e volta com a data de registro original quando a admissão for retomada. No quadro de contagem ela continua contada.",
    },
    {
      sintoma: "Eu vejo uma coluna cortada ou a tabela mais larga que a tela.",
      acao: "Role a tabela na horizontal. As duas últimas colunas, a de situação e a do olho, ficam fixas à direita enquanto você rola.",
    },
  ],
  regras: [
    "A fila é a visão coletiva: todo mundo que tem o menu vê as não conformidades de todos, e não só as suas.",
    "O consultor da linha é quem gerou a admissão, não quem registrou o desvio.",
    "Resolver não apaga: o registro permanece na fila e no quadro de contagem, como histórico.",
    "Só a liberação aprovada pela diretoria deixa de contar contra o consultor.",
    "Não conformidade de admissão pausada sai da lista e continua no quadro de contagem.",
    "Registrada de e Registrada até filtram pela data do registro do desvio, nunca pela data de admissão.",
  ],
  relacionados: [
    "registrar-uma-nc-de-cadastro",
    "aprovar-ou-reprovar-uma-nao-conformidade",
    "resolver-uma-nao-conformidade",
    "as-duas-vias-da-nao-conformidade",
    "aceitar-o-avanco-com-pendencias",
    "ler-a-ficha-da-admissao",
    "ler-a-linha-da-tabela",
    "filtrar-uma-lista",
    "ordenar-a-lista-pelo-cabecalho",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nao-conformidades/page.tsx",
    "apps/backend/src/nao-conformidades/nao-conformidades.service.ts",
    "apps/backend/src/domain/nao-conformidade.ts",
  ],
  revisadoEm: "2026-09-30",
};
