import type { Artigo } from "../../tipos";

/**
 * ─ O ARTIGO DO PRIMEIRO DIA: A SEQUÊNCIA INTEIRA, SEM NENHUM GESTO DE TELA ─────────────────────
 *
 * O QUE ESTA PEÇA COBRE: a ordem em que a admissão caminha, quais etapas correm ao mesmo tempo,
 * qual etapa espera qual, quem trabalha em cada uma e o que fecha cada frente.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ NENHUM CLIQUE. Não há botão, não há caminho de menu e não há janela aqui, de propósito: cada  │
 * │ etapa já tem o seu passo a passo, e este artigo é o mapa que se lê ANTES de todos eles. Passo │
 * │ de tela dentro do mapa envelhece na primeira mudança de layout e arrasta o mapa com ele.      │
 * │                                                                                               │
 * │ CADA AFIRMAÇÃO AQUI FOI CONFERIDA NO CÓDIGO, e não escrita de memória: a ordem das etapas, o  │
 * │ que nasce junto com o quê, o que abre o gate do cadastro e o que fica fora de qualquer gate.  │
 * │ Manual que descreve o fluxo errado no artigo de primeiro dia é o pior lugar possível para um   │
 * │ erro, porque ele é lido por quem não tem como desconfiar.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. Um diagrama do fluxo seria útil e não é captura de
 * tela; ele entra em entrega própria. O texto foi escrito para dispensar figura.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "o-mapa-das-frentes-da-admissao",
  titulo: "O Mapa Das Frentes Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/"],
  menus: ["inicio"],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "A sequência da esteira do começo ao fim: a liberação, a auditoria e o exame correndo ao mesmo tempo, o cadastro e contrato que só abre quando os dois fecham, a integração e a credencial de ponto. Quem faz o quê em cada etapa.",
  termos: [
    "como funciona a esteira",
    "ordem das etapas",
    "fluxo da admissao",
    "o que vem antes",
    "o que vem depois",
    "primeiro dia",
    "treinamento",
    "por que o cadastro nao abre",
    "etapas paralelas",
    "quem faz o que",
    "frentes da admissao",
    "passo a passo da admissao",
  ],
  preRequisitos: [
    "Nada. Este é o artigo de leitura do primeiro dia: ele explica o caminho antes de qualquer tela.",
  ],
  passos: [
    {
      gesto: "A admissão começa na liberação, e é ela que decide quem entra na esteira.",
      detalhe:
        "A pessoa chega como pré-admissão, normalmente trazida do sistema de recrutamento, e entra sem cliente e sem cargo. Enquanto o par cliente e cargo não é atribuído, não há lista de documentos a exigir, então ela não aparece em fila nenhuma da esteira. Liberar é atribuir esse par e preencher os dados que travam a passagem. Recusar a pré-admissão é ação de Master ou Super Admin.",
    },
    {
      gesto: "Liberada, a admissão nasce com DUAS frentes abertas ao mesmo tempo: auditoria e exame.",
      detalhe:
        "As duas correm em paralelo e são independentes: concluir uma não mexe na outra, e cada uma tem o seu status, o seu responsável e as suas datas. Não existe ordem entre elas, e esperar uma para começar a outra só atrasa a pessoa.",
    },
    {
      gesto: "A auditoria confere os documentos contra a lista do par cliente e cargo.",
      detalhe:
        "A lista de documentos muda conforme o cliente e o cargo, e cada documento dela é obrigatório, não obrigatório ou facultativo. A frente fecha quando todos os obrigatórios estão validados, e nesse caso ela fecha sozinha, sem ninguém carimbar. O status que fecha se chama Análise Finalizada. Quem opera é a consultoria, com a leitura da inteligência artificial ajudando na conferência de cada documento.",
    },
    {
      gesto: "O exame cuida do agendamento e do laudo de aptidão.",
      detalhe:
        "O caminho é agendar, realizar e anexar o laudo. O único status que fecha a frente é Apto, e ele exige o laudo anexado e lido como apto. Entre o exame e o laudo existem dois estados de espera para a fila não mentir: Aguardando Liberação Do ASO, quando a previsão do laudo é posterior ao exame, e ASO Pendente, quando a data do exame já passou sem laudo.",
    },
    {
      gesto: "Existe uma saída para quem precisa começar a trabalhar antes do laudo.",
      detalhe:
        "O status Liberado Para Cadastro Sem ASO destrava o avanço sem fechar o exame: a admissão anda até o fim da trilha e continua na fila do exame até o laudo chegar. Qualquer consultor pode usá-lo, e ele exige que a previsão do laudo seja posterior à data de admissão. Marcar Apto sem laudo é coisa diferente, é ação de supervisão e gera registro de não conformidade.",
    },
    {
      gesto: "O cadastro e contrato só abre depois que a auditoria fecha e o exame libera.",
      detalhe:
        "É o único ponto do caminho em que uma etapa espera outra. Enquanto as duas anteriores não estiverem resolvidas, a admissão não aparece na fila de cadastro, e não existe atalho: o que existe é o aceite, que permite avançar com pendência e deixa registro.",
    },
    {
      gesto: "Quando esse portão abre, nascem TRÊS frentes de uma vez, e não uma.",
      detalhe:
        "Nascem o cadastro e contrato, a integração e a credencial do sistema de ponto. A integração nasce só para o cliente que a exige; a credencial de ponto nasce para todos, porque todo cliente marca ponto de alguma forma.",
    },
    {
      gesto: "No cadastro e contrato, a pessoa entra na folha e o contrato é montado.",
      detalhe:
        "Os status são A Cadastrar e Cadastrado, e o segundo fecha a frente. O kit de documentos para assinatura só pode nascer quando as TRÊS frentes estiverem concluídas: auditoria, exame e cadastro. Enviado para assinar, o contrato passa a ter o seu próprio acompanhamento, com os estados Sem Envelope, Aguardando Assinatura, Assinado, Cancelado e Expirado.",
    },
    {
      gesto: "A integração é a última etapa da esteira, e corre em paralelo com a assinatura.",
      detalhe:
        "Ela é agendada e depois confirmada como Realizado, que é o status que fecha. Há também o Concluída Sem Integração, para quem foi admitido sem passar pela integração: ele também fecha a frente. Como a integração não espera a assinatura, é comum a pessoa estar em integração enquanto o contrato ainda está para assinar.",
    },
    {
      gesto: "A credencial do sistema de ponto é a quinta frente, e ela não segura nada.",
      detalhe:
        "É controle do time de Ponto e corre ao lado do fim da esteira: ela não abre etapa, não libera kit e não impede a admissão de ser considerada concluída. A lista de status dela é a única que o próprio time edita.",
    },
    {
      gesto: "Avançar com pendência é permitido, e nunca é silencioso.",
      detalhe:
        "O sistema não trava quem precisa seguir com campo vazio ou documento faltando, mas cobra um aceite explícito e guarda quem aceitou, quando e o que faltava. Concluir a auditoria faltando documento obrigatório, ou marcar o exame como apto sem laudo, gera registro na fila de Não Conformidades.",
    },
    {
      gesto: "O farol resume, numa etiqueta só, onde a admissão está.",
      detalhe:
        "Ele nasce em Aguardando Liberação, passa a Em Admissão quando liberada e termina em Admissão Concluída. Pelo caminho pode ir para Banco, Aguardar, quando tudo está resolvido e não há data de admissão prevista, ou para Declinou e Rescisão, que encerram o processo.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A pessoa entrou no sistema e não aparece em nenhuma fila da esteira.",
      acao: "Ela ainda é pré-admissão, sem cliente e cargo. Procure na Liberação Admissional: é lá que ela espera.",
    },
    {
      sintoma: "A admissão não aparece na fila de cadastro.",
      acao: "Falta a auditoria fechar, ou falta o exame liberar, ou os dois. Confira as duas abas anteriores antes de procurar defeito no cadastro.",
    },
    {
      sintoma: "O exame está resolvido, a auditoria também, e ainda assim não consigo gerar o kit.",
      acao: "O kit espera as TRÊS frentes, e a terceira é o cadastro concluído. Integração e credencial de ponto não entram nessa conta.",
    },
    {
      sintoma: "A integração não nasceu para uma pessoa.",
      acao: "A integração nasce só para cliente que a exige. Não nascendo, aquele cliente fecha no cadastro, e isso não é falha.",
    },
    {
      sintoma: "Eu concluí uma frente e a outra continuou aberta.",
      acao: "É o desenho: auditoria e exame são independentes, e nenhuma das duas fecha a outra. Cada uma precisa ser trabalhada no seu lugar.",
    },
  ],
  regras: [
    "Sem cliente e cargo não há lista de documentos, então a pré-admissão não entra na esteira.",
    "Auditoria e exame nascem juntas e são independentes uma da outra.",
    "O cadastro e contrato é a única etapa que espera outras duas.",
    "Quando o cadastro nasce, nascem com ele a integração, para o cliente que a exige, e a credencial de ponto, para todos.",
    "O kit para assinatura exige auditoria, exame e cadastro concluídos.",
    "A integração corre em paralelo com a assinatura do contrato.",
    "A credencial do sistema de ponto não participa de nenhuma espera e não impede a conclusão da admissão.",
    "Pendência sinaliza e não bloqueia, mas avançar com ela exige aceite e fica registrado.",
  ],
  relacionados: [
    "o-vocabulario-da-admissao",
    "liberar-uma-admissao",
    "auditar-os-documentos-da-admissao",
    "anexar-o-aso-no-exame",
    "concluir-o-cadastro-e-o-contrato",
    "acompanhar-a-integracao",
    "gerenciar-as-credenciais-do-ifractal",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "as-duas-vias-da-nao-conformidade",
    "aceitar-o-avanco-com-pendencias",
  ],
  fontes: [
    "apps/backend/src/domain/frentes.ts",
    "apps/backend/src/esteira/nascimento-cadastro.ts",
    "apps/backend/src/domain/admissao.ts",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
  ],
  revisadoEm: "2026-09-30",
};
