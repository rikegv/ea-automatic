import type { Artigo } from "../../tipos";

/**
 * ─ 5 de 5 DA FILA DE NÃO CONFORMIDADES: POR QUE EXISTEM DOIS TIPOS DE LINHA ────────────────────
 *
 * O QUE ESTA PEÇA COBRE: a diferença entre o desvio que fica no nome do consultor e a liberação por
 * determinação da diretoria, de onde cada uma nasce, e o único gesto que é dela, o PEDIDO.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ NENHUM GESTO DE JULGAR. Aprovar, reprovar e resolver têm artigo próprio cada um, e a razão de │
 * │ este artigo existir é oposta à deles: ele responde "por que a fila tem linha de dois tipos",  │
 * │ que é a pergunta que a pessoa faz ANTES de saber qual botão clicar. Misturar decisão aqui     │
 * │ transformaria a explicação num quarto passo a passo e apagaria a única coisa que só ela diz.  │
 * │                                                                                               │
 * │ E NÃO COBRE O ACEITE DE AVANÇO COM PENDÊNCIAS, que é a origem mais comum das duas vias: ele   │
 * │ é CITADO como de onde a linha nasce, e ensinado em artigo próprio. Aqui interessa o que a     │
 * │ resposta daquela janela produz nesta fila, não como preenchê-la.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. As telas envolvidas mostram pessoa, e a captura só
 * entra quando a homologação tiver dado sintético.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "as-duas-vias-da-nao-conformidade",
  titulo: "As Duas Vias Da Não Conformidade",
  modulo: "SOUL_ADM",
  rotas: ["/nao-conformidades"],
  menus: ["nao-conformidades"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nao-conformidades",
  resumo:
    "Por que a fila tem dois tipos de linha: o desvio que fica no nome do consultor e a liberação por determinação da diretoria. O que cada uma significa, de onde nasce e como se pede a segunda.",
  termos: [
    "duas vias",
    "via 1",
    "via 2",
    "liberacao por diretoria",
    "determinacao da diretoria",
    "quem liberou sem documento",
    "nc que nao penaliza",
    "excecao reconhecida",
    "foi a diretoria que pediu",
    "por que essa nc esta no meu nome",
    "tipos de nc",
    "auditoria sem documentos",
    "exame sem aso",
    "cadastro incompleto",
  ],
  preRequisitos: [
    "Nada a preencher: este artigo explica o que a fila mostra. Pedir a liberação exige só a tela aberta; decidir sobre o pedido é da supervisão.",
  ],
  passos: [
    {
      gesto:
        "Entenda a primeira via: o desvio comum, que fica no nome do consultor que gerou a admissão.",
      detalhe:
        "É o caminho normal. A linha nasce Aberta, entra na contagem por consultor do quadro acima da lista e continua contada mesmo depois de resolvida, porque o desvio aconteceu.",
    },
    {
      gesto:
        "Entenda a segunda via: a liberação por determinação da diretoria, que é exceção reconhecida.",
      detalhe:
        "Ela existe para o caso em que a diretoria manda seguir mesmo faltando algo. Nasce em Aguardando supervisão, com um motivo escrito, e não pesa no nome de ninguém enquanto a decisão não sai. Aprovada, deixa de contar contra o consultor; reprovada, volta a ser desvio comum.",
    },
    {
      gesto: "Saiba os três desvios que a fila registra, e a etiqueta de cada um na coluna Tipo.",
      detalhe:
        "Auditoria Sem Documentos: a auditoria foi concluída faltando documento obrigatório da régua. Exame Sem ASO: o exame foi marcado como apto sem o laudo validado. Cadastro Incompleto: faltou kit, assinatura ou a marcação de cadastro realizado.",
      controles: ["Tipo", "Auditoria Sem Documentos", "Exame Sem ASO", "Cadastro Incompleto"],
    },
    {
      gesto: "Saiba de onde a linha nasce, porque ninguém a digita nos dois primeiros casos.",
      detalhe:
        "Os dois primeiros nascem sozinhos, na Esteira, no instante em que alguém aceita avançar com pendência: é o aceite que cria a linha, com o autor e a data. O terceiro é o único registrado à mão, na própria tela de Não Conformidades. Marcar o exame como apto sem laudo é ação de Master ou Super Admin, então esse desvio nasce sempre de uma autorização de supervisão.",
    },
    {
      gesto: "Saiba onde a segunda via é escolhida: são três portas para a mesma pergunta.",
      detalhe:
        "Na janela de aceite da Esteira, na janela de registro manual e, depois, na própria linha da fila. Nas três, a pergunta é a mesma e o motivo passa a ser obrigatório quando a resposta é Sim.",
      controles: ["Esta liberação foi a pedido da diretoria?", "Não", "Sim"],
    },
    {
      gesto:
        "Para pedir a liberação de uma linha que já está na fila, clique em Liberação por diretoria.",
      detalhe:
        "O botão fica na coluna Situação / ação. A janela pede o Motivo, que é obrigatório, e o envio troca a etiqueta da linha para Aguardando supervisão com a confirmação Liberação enviada à supervisão.",
      controles: [
        "Liberação por diretoria",
        "Liberação por determinação da diretoria",
        "Motivo",
        "Enviar à supervisão",
        "Cancelar",
      ],
    },
    {
      gesto: "Leia o quadro de contagem sabendo o que ele conta.",
      detalhe:
        "Ele soma as não conformidades que penalizam, ou seja, tudo menos as liberações aprovadas pela diretoria. É por isso que a mesma pessoa pode ter linhas na fila e um número menor no quadro.",
      controles: ["NCs que penalizam, por consultor"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Liberação já aprovada pela diretoria.",
      acao: "Aquela linha já é exceção reconhecida e não aceita pedido novo. Não há o que fazer nela.",
    },
    {
      sintoma: "Eu pedi a liberação e a linha continua contando contra o consultor.",
      acao: "O pedido não tira a contagem: só a aprovação da supervisão tira. Enquanto a etiqueta estiver em Aguardando supervisão, a decisão ainda não saiu.",
    },
    {
      sintoma: "O botão Liberação por diretoria não aparece na linha.",
      acao: "Ele desaparece quando a linha já está em Aguardando supervisão ou já foi Liberada pela diretoria. Reprovado o pedido, ele volta a aparecer e você pode pedir de novo com outro motivo.",
    },
    {
      sintoma: "Eu não sei em que nome a linha vai cair.",
      acao: "Sempre no consultor que gerou a admissão, e não em quem registrou ou em quem aceitou o avanço. A coluna Consultor da fila mostra quem é.",
    },
  ],
  regras: [
    "Toda não conformidade penaliza o consultor, exceto a liberação aprovada pela diretoria.",
    "A liberação por determinação da diretoria sempre exige motivo escrito, em qualquer das três portas.",
    "O pedido de liberação não decide nada: quem decide é a supervisão.",
    "Pedido reprovado devolve a linha para desvio comum e aceita um pedido novo.",
    "Os dois desvios da esteira nascem do aceite de avanço com pendência; o de cadastro é o único registrado à mão.",
    "Cada admissão tem no máximo uma linha de cada um dos três tipos.",
  ],
  relacionados: [
    "ler-a-fila-de-nao-conformidades",
    "registrar-uma-nc-de-cadastro",
    "aprovar-ou-reprovar-uma-nao-conformidade",
    "resolver-uma-nao-conformidade",
    "aceitar-o-avanco-com-pendencias",
    "o-mapa-das-frentes-da-admissao",
    "o-vocabulario-da-admissao",
    "salvar-com-campo-obrigatorio-vazio",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nao-conformidades/page.tsx",
    "apps/backend/src/domain/nao-conformidade.ts",
    "apps/backend/src/esteira/esteira.service.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
