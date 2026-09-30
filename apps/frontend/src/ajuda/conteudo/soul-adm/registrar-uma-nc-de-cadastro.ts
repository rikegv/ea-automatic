import type { Artigo } from "../../tipos";

/**
 * ─ 2 de 5 DA FILA DE NÃO CONFORMIDADES: O REGISTRO MANUAL ──────────────────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: a janela do botão de registro, a busca da pessoa, as três marcações de
 * cadastro incompleto, o que é opcional e o que trava o botão de gravar.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ A NÃO CONFORMIDADE QUE NASCE SOZINHA. Duas das três nascem do aceite de avanço com pendências │
 * │ na Esteira, sem ninguém registrar nada, e só esta, a de cadastro, é digitada à mão. Ensinar as │
 * │ duas origens no mesmo artigo é o caminho mais curto para alguém abrir esta janela procurando  │
 * │ registrar um documento que faltou na auditoria, que não é o que ela faz. A distinção mora na  │
 * │ peça das duas vias, e o aceite tem artigo próprio.                                            │
 * │                                                                                               │
 * │ A PERGUNTA DA DIRETORIA APARECE AQUI COMO CAMPO, e só como campo: ela é um passo desta janela │
 * │ e omiti-la deixaria a pessoa sem saber o que responder. O sentido dela é da peça das vias.     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. A captura foi vetada enquanto a homologação não
 * tiver dado sintético, porque a busca desta janela lista nome de gente de verdade. O texto declara
 * todos os rótulos literais e funciona sem imagem.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "registrar-uma-nc-de-cadastro",
  titulo: "Registrar Não Conformidade De Cadastro",
  modulo: "SOUL_ADM",
  rotas: ["/nao-conformidades"],
  menus: ["nao-conformidades"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nao-conformidades",
  resumo:
    "Como registrar à mão o desvio de cadastro incompleto: achar a admissão que está em Cadastro, marcar o que faltou, escrever a observação opcional e gravar.",
  termos: [
    "registrar nc",
    "abrir nc",
    "nc de cadastro",
    "cadastro incompleto",
    "liberou sem kit",
    "finalizou sem assinatura",
    "cadastro nao marcado",
    "apontar erro do consultor",
    "lancar desvio",
    "nc manual",
  ],
  preRequisitos: [
    "A admissão precisa estar na fila de Cadastro: a busca desta janela só encontra quem está lá.",
    "Saber o que faltou naquele cadastro, porque é isso que você vai marcar.",
  ],
  passos: [
    {
      gesto: "Abra Não Conformidades pelo menu da lateral esquerda.",
      controles: ["Não Conformidades"],
    },
    {
      gesto: "Clique em Registrar NC de Cadastro, acima da lista, à direita.",
      detalhe: "A janela abre no campo de busca da pessoa.",
      controles: ["Registrar NC de Cadastro"],
    },
    {
      gesto: "Digite o nome ou o CPF no campo Nome (em Cadastro) e escolha a pessoa na lista.",
      detalhe:
        "A lista aparece embaixo do campo e mostra no máximo oito resultados, com o cliente em cada linha. Escolheu a pessoa errada, clique em trocar para voltar à busca.",
      controles: ["Nome (em Cadastro)", "trocar"],
    },
    {
      gesto: "Marque ao menos uma das três caixas de Flags de cadastro incompleto.",
      detalhe:
        "Pode marcar mais de uma. Nenhuma marcada, o botão de gravar continua apagado, porque é a marcação que diz o que aconteceu.",
      controles: [
        "Flags de cadastro incompleto",
        "Liberada sem kit adicionado",
        "Finalizada sem assinatura",
        'Flag "cadastro realizado" não marcada',
      ],
    },
    {
      gesto: "Escreva a observação, se quiser, no campo Observação (opcional).",
      detalhe:
        "É o único campo dispensável da janela. Deixando em branco, o sistema escreve sozinho o detalhe da linha a partir do que você marcou, e é esse texto que a fila mostra embaixo do nome.",
      controles: ["Observação (opcional)"],
    },
    {
      gesto: "Responda Esta liberação foi a pedido da diretoria?, escolhendo Não ou Sim.",
      detalhe:
        "Não é o caminho comum: o desvio fica no nome do consultor. Sim abre o campo Motivo, que passa a ser obrigatório, e em vez de gravar um desvio comum o registro vai para a supervisão decidir.",
      controles: ["Esta liberação foi a pedido da diretoria?", "Não", "Sim", "Motivo"],
    },
    {
      gesto: "Clique em Registrar NC para gravar.",
      detalhe:
        "Respondendo Sim à pergunta da diretoria, o mesmo botão passa a se chamar Enviar à supervisão. A janela fecha e a confirmação aparece acima da lista com o nome da pessoa.",
      controles: ["Registrar NC", "Enviar à supervisão", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A busca diz Nenhuma admissão em Cadastro com esse termo.",
      acao: "Esta janela só encontra quem está na fila de Cadastro. Se a pessoa ainda está em auditoria ou exame, o desvio dela não é de cadastro. Confira também se você digitou o nome como ele está cadastrado, ou tente pelo CPF.",
    },
    {
      sintoma: "O botão de gravar está apagado e eu não sei o que falta.",
      acao: "São três condições: escolher a pessoa na busca, marcar ao menos uma caixa e, tendo respondido Sim à pergunta da diretoria, escrever o motivo. Faltando qualquer uma, o botão não acende.",
    },
    {
      sintoma: "A tela mostra Marque ao menos uma flag de cadastro incompleto.",
      acao: "Nenhuma das três caixas foi marcada. Marque o que de fato faltou naquele cadastro e grave de novo.",
    },
    {
      sintoma: "A tela mostra Informe o motivo da liberação por diretoria.",
      acao: "Você respondeu Sim à pergunta da diretoria e o campo Motivo ficou vazio. Descreva a determinação, porque é esse texto que a supervisão lê para decidir.",
    },
    {
      sintoma: "A tela mostra Já existe uma NC de Cadastro registrada para esta admissão.",
      acao: "Cada admissão tem no máximo um desvio de cadastro. Procure a pessoa na fila e trabalhe o registro que já existe, em vez de abrir outro.",
    },
    {
      sintoma: "A tela mostra Falha ao registrar a NC.",
      acao: "Nada foi gravado. Confira a fila antes de repetir, para não registrar em duplicidade, e tente de novo.",
    },
    {
      sintoma: "A tela mostra Admissão não encontrada.",
      acao: "A admissão que você escolheu deixou de existir entre a busca e o registro. Feche a janela, recarregue a página e busque de novo.",
    },
  ],
  regras: [
    "Cada admissão tem no máximo um registro de cadastro incompleto.",
    "O desvio fica no nome do consultor que gerou a admissão, não no de quem registrou.",
    "Ao menos uma das três marcações é obrigatória; a observação nunca é.",
    "Sem observação escrita, o detalhe da linha é montado pelo sistema a partir do que foi marcado.",
    "Respondendo Sim à pergunta da diretoria, o registro nasce aguardando supervisão e não penaliza ninguém até a decisão sair.",
    "As três marcações são preenchidas à mão nesta etapa: o sistema ainda não sabe sozinho que o kit ou a assinatura faltaram.",
  ],
  relacionados: [
    "ler-a-fila-de-nao-conformidades",
    "as-duas-vias-da-nao-conformidade",
    "aprovar-ou-reprovar-uma-nao-conformidade",
    "resolver-uma-nao-conformidade",
    "concluir-o-cadastro-e-o-contrato",
    "aceitar-o-avanco-com-pendencias",
    "abrir-e-fechar-uma-janela-do-sistema",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nao-conformidades/page.tsx",
    "apps/backend/src/nao-conformidades/nao-conformidades.service.ts",
    "apps/backend/src/nao-conformidades/dto/nc.dto.ts",
  ],
  revisadoEm: "2026-09-30",
};
