import type { Artigo } from "../../tipos";

/**
 * N1 DO GERADOR DE KIT, 4 de 4: A SAÍDA DA TELA.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA, QUE AQUI É O PONTO MAIS FÁCIL DE ERRAR ───────────┐
 * │ Ela cobre o botão que anexa o kit à admissão e a coloca na fila de assinatura, o porteiro das   │
 * │ três frentes, e a pergunta que o sistema faz quando não consegue identificar com certeza de     │
 * │ quem é aquele kit. Ela PARA no envio.                                                           │
 * │                                                                                                 │
 * │ O QUE ACONTECE DEPOIS É OUTRA TELA E OUTRO ARTIGO: enviar NÃO dispara o pedido de assinatura e  │
 * │ NÃO manda e-mail para ninguém. Quem dispara é a tela de gestão das assinaturas, em ação humana. │
 * │ Confundir os dois é o chamado clássico ("enviei e o candidato não recebeu nada"), então o texto │
 * │ diz isso na regra e no passo, e aponta o artigo daquela tela em vez de ensiná-la.               │
 * │                                                                                                 │
 * │ Também NÃO cobre: processar, baixar e reimportar, que são as outras três peças desta tela.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA E NÃO ESQUECIMENTO: a captura das telas que mostram pessoa está
 * vetada enquanto a homologação não tiver arnês de dado sintético, e tanto a lista de resultado como
 * a janela de escolha da admissão mostram nome. O texto foi escrito para funcionar lido.
 *
 * §A.6: o kit é o contrato da pessoa, e nada de nome, CPF ou valor visto em tela entra neste texto.
 * §A.11: nenhum travessão. §A.24: title case em título e etiqueta.
 */
export const artigo: Artigo = {
  slug: "enviar-o-kit-para-assinatura",
  titulo: "Enviar O Kit Para Assinatura",
  modulo: "SOUL_ADM",
  rotas: ["/gerador-kit"],
  menus: ["gerador-kit"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerador-kit",
  resumo:
    "Como anexar o kit de uma pessoa à admissão dela e colocá-la na fila de assinatura, o que o sistema exige antes de aceitar o envio, e por que enviar não é a mesma coisa que disparar a assinatura.",
  termos: [
    "enviar para assinatura",
    "mandar para assinar",
    "anexar kit na admissao",
    "fila de assinatura",
    "vincular kit ao candidato",
    "assinatura do contrato",
    "nao consigo enviar o kit",
    "contrato nao chegou",
  ],
  preRequisitos: [
    "A admissão daquela pessoa precisa estar ativa: admissão pausada não aceita o envio.",
    "Ter conferido o kit antes de enviar, porque é ele que vai para a assinatura.",
  ],
  passos: [
    {
      gesto: "Localize a pessoa na lista do resultado, pelo campo de busca por nome.",
      controles: ["Buscar funcionário por nome"],
    },
    {
      gesto: "Abra a linha dela e confira se o kit está Completo.",
      detalhe:
        "O sistema aceita o envio do que está na tela, então documento faltando vai faltando. Feche o que falta antes, pela reimportação.",
      controles: ["Completo"],
    },
    {
      gesto: "Clique em Enviar para assinatura.",
      detalhe:
        "O sistema procura a admissão daquela pessoa e anexa o kit a ela. O botão vira Na fila e a mensagem verde do topo confirma que a pessoa entrou na fila de assinatura com o kit anexado.",
      controles: [
        "Enviar para assinatura",
        "Na fila",
        "Anexar o kit à admissão e mandar para a fila de assinatura",
      ],
    },
    {
      gesto: "Se a janela Qual admissão? abrir, escolha a admissão certa na lista.",
      detalhe:
        "Ela aparece quando o sistema não consegue identificar uma única admissão para aquele kit. Cada opção é um candidato: clique na que corresponde à pessoa do kit. Preferir perguntar é deliberado, porque anexar contrato na pessoa errada não se desfaz sozinho.",
      controles: ["Qual admissão?", "Cancelar"],
    },
    {
      gesto: "Repita para as demais pessoas do lote.",
      detalhe:
        "O envio é de uma pessoa por vez. Quem já foi aparece com Na fila até você sair da tela.",
      controles: ["Na fila"],
    },
    {
      gesto: "Continue na tela de gestão das assinaturas para pedir a assinatura.",
      detalhe:
        "O envio daqui só coloca a pessoa na fila com o kit anexado. Nenhum e-mail sai e nenhum pedido de assinatura é criado neste momento: quem faz isso é a outra tela, com ação humana.",
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema responde O envio à assinatura exige as 3 frentes concluídas (Auditoria, Exame e Cadastro/Contrato).",
      acao: "O kit só sai para assinatura depois que a admissão fecha as três frentes. Confira na esteira o que ainda está aberto: enquanto uma delas estiver pendente, o envio é recusado, e isso é proteção, não bug.",
    },
    {
      sintoma: "O sistema responde Admissão pausada: retome a admissão para enviar à assinatura.",
      acao: "Aquela admissão está pausada. Retome a admissão antes, e então envie o kit de novo.",
    },
    {
      sintoma:
        "A janela diz Não foi possível identificar o CPF deste funcionário no kit. Escolha a admissão na lista.",
      acao: "As páginas daquele kit não trouxeram o CPF de forma legível, então o sistema não tem como casar sozinho. Escolha a admissão na lista da própria janela.",
    },
    {
      sintoma: "A janela diz que mais de uma admissão bate com aquele funcionário.",
      acao: "Há mais de uma admissão compatível, e quem escolhe é você. Confira na esteira qual é a admissão em curso daquela pessoa e selecione essa.",
    },
    {
      sintoma:
        "A janela diz Nenhuma admissão viva bate com este funcionário. Confira se a admissão existe e se as três frentes estão concluídas.",
      acao: "Ou a admissão daquela pessoa não existe no sistema, ou ela já tem um pedido de assinatura em andamento, ou ela está fora do estado que aceita o envio. Confira a admissão no gerenciador antes de tentar de novo.",
    },
    {
      sintoma: "A tela mostra Falha ao enviar para assinatura.",
      acao: "Nada foi anexado. Tente de novo na mesma tela. Se o resultado já tiver expirado, processe o lote outra vez e envie a partir do resultado novo.",
    },
    {
      sintoma: "Enviei e o candidato não recebeu nada.",
      acao: "É o esperado: o envio daqui não pede assinatura de ninguém, só coloca a pessoa na fila com o kit anexado. O pedido é disparado na tela de gestão das assinaturas.",
    },
    {
      sintoma: "O sistema responde Admissão não encontrada.",
      acao: "A admissão escolhida na janela não existe mais, normalmente porque foi alterada enquanto a tela estava aberta. Recarregue a página, confira a admissão e envie de novo.",
    },
  ],
  regras: [
    "Enviar anexa o kit à admissão e coloca a pessoa na fila de assinatura. Ele não cria o pedido de assinatura e não manda e-mail.",
    "O kit só sai para assinatura com as três frentes concluídas: Auditoria, Exame e Cadastro ou Contrato.",
    "Admissão pausada não aceita o envio.",
    "Quando o sistema não identifica uma única admissão para o kit, ele pergunta em vez de escolher sozinho.",
    "O envio é de uma pessoa por vez, e a marca Na fila vale para a sessão daquela tela: quem confere de verdade é a fila de assinatura.",
  ],
  relacionados: [
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "baixar-o-kit-de-um-funcionario",
    "reimportar-os-documentos-que-faltam",
    "montar-o-grupo-de-assinatura-da-empresa",
    "ler-a-gestao-das-assinaturas",
    "disparar-a-assinatura-de-um-candidato",
    "concluir-o-cadastro-e-o-contrato",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerador-kit/page.tsx",
    "apps/backend/src/kit/kit.controller.ts",
    "apps/backend/src/kit/kit.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
