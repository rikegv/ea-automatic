import type { Artigo } from "../../tipos";

/**
 * ─ LER A RÉGUA OBRIGATÓRIA: entender o placar antes de mexer em documento ───────────────────────
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE O ARTIGO IRMÃO SÓ ENCOSTOU ─────────────────────────────────┐
 * │ O N1 da aba ("auditar-os-documentos-da-admissao") tem UM passo para a barra de progresso,      │
 * │ dentro do trabalho de mandar documento. Ele não ensina a LER a janela: por que as linhas vêm    │
 * │ naquela ordem, por que a régua de duas pessoas do mesmo cliente pode ser diferente, o que a     │
 * │ etiqueta de pendência do time significa no meio da conta, e o que é o aviso de tempo parado     │
 * │ dentro do "que falta". Esta peça é o placar, e só o placar.                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ──────────────────────────────────────────────────┐
 * │ CADASTRAR régua não é daqui: é outra tela, de outro módulo, e quem opera a Auditoria só       │
 * │ CONSOME a régua já cadastrada. Também não é daqui nenhum dos gestos sobre documento (enviar,   │
 * │ visualizar, reauditar, assumir, reabrir): cada um tem a sua peça, apontada em Relacionados.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A REGRA QUE MAIS IMPORTA, E ELA É A RAZÃO DA PEÇA EXISTIR ────────────────────────────────┐
 * │ A régua obrigatória completa leva a Auditoria a Análise Finalizada SOZINHA, sem clique. Quem  │
 * │ não sabe disso procura um botão de concluir que não existe ou força o status pelo seletor com  │
 * │ documento faltando, e aí cai no aceite, que fica registrado no nome dele. O último passo e     │
 * │ duas das regras existem para fechar esse caminho.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A IMAGEM É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO ────────────────────────────────────────┐
 * │ Captura vetada pela auditoria de segurança enquanto a homologação não tiver arnês sintético │
 * │ (a tela mostra documento de pessoa). Texto escrito para funcionar sem imagem; prints em      │
 * │ entrega própria.                                                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles` SÃO A PARTE FIXA de frases montadas: a barra escreve "9 de 11 obrigatórios
 * validados", o marcador escreve "Parado há 7 horas" e a pendência do time escreve "O candidato usou
 * 3 de 3 envios no Portal e não pode tentar sozinho de novo". O número vem do dado, então declarar o
 * número seria declarar rótulo que não existe. §A.6: nenhum nome, CPF ou número de documento aqui.
 */
export const artigo: Artigo = {
  slug: "ler-a-regua-obrigatoria-da-admissao",
  titulo: "Ler A Régua Obrigatória Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como ler o placar da auditoria de uma pessoa: quantos documentos obrigatórios já valeram, quais faltam, o que está preso na fila do time, e por que a frente fecha sozinha quando a conta zera.",
  termos: [
    "regua",
    "regua obrigatoria",
    "quantos faltam",
    "o que falta",
    "documentos exigidos",
    "checklist",
    "barra de progresso",
    "porcentagem",
    "regua completa",
    "faltam",
    "obrigatorios validados",
    "fila do time",
    "fechar auditoria sozinha",
    "por que nao concluiu",
    "reservista",
    "documento a mais",
    "documento a menos",
  ],
  preRequisitos: [
    "A régua do cliente mais o cargo já precisa estar cadastrada: é ela que diz quais documentos são exigidos daquela pessoa.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional pelo menu da lateral esquerda.",
      controles: ["Esteira Admissional"],
    },
    {
      gesto: "Na aba Auditoria, ache a pessoa e clique em Auditar, na coluna Avanço / Auditoria.",
      controles: ["AUDITORIA", "Avanço / Auditoria", "Auditar"],
    },
    {
      gesto: "Leia a barra de progresso no alto da janela: ela é o placar da régua obrigatória.",
      detalhe:
        "À esquerda, quantos obrigatórios já valeram do total. À direita, a porcentagem enquanto falta algo, que vira Régua completa em verde quando a conta zera.",
      controles: ["Auditoria documental por IA", "obrigatórios validados", "Régua completa"],
    },
    {
      gesto: "Leia a linha Faltam, abaixo da barra, para saber o nome do que está pendente.",
      detalhe:
        "Ela lista os obrigatórios que ainda não valeram, separados por ponto, e desaparece quando não falta nada. É a lista de cobrança do dia.",
      controles: ["Faltam:"],
    },
    {
      gesto: "Percorra a lista de documentos de cima para baixo: a ordem já é a de leitura.",
      detalhe:
        "Primeiro vêm os que têm resultado, depois os que chegaram e ainda não foram analisados, e por último os que ninguém mandou. Dentro de cada faixa, a ordem é a do checklist.",
      controles: ["Validado", "Inconforme", "Pendente", "Aguardando auditoria"],
    },
    {
      gesto: "Confira a exigência sob o nome de cada documento antes de se preocupar com ele.",
      detalhe:
        "Só Obrigatório entra na conta da barra. Não obrigatório e Facultativo podem ficar sem resultado sem travar nada, e é por isso que a régua fecha com linhas ainda sem etiqueta na lista.",
      controles: ["Obrigatório", "Não obrigatório", "Facultativo"],
    },
    {
      gesto: "Procure na lista os avisos que explicam por que um obrigatório está preso.",
      detalhe:
        "Parado há e o tempo diz que a leitura travou além do esperado, o que é diferente de documento não enviado. A etiqueta Na Fila Do Time diz que o candidato esgotou os envios dele e não consegue mais mandar sozinho: aquele documento só anda com ação do time.",
      controles: ["Parado há", "Na Fila Do Time", "envios no Portal e não pode tentar sozinho de novo."],
    },
    {
      gesto:
        "Quando a barra disser Régua completa, não procure botão de concluir: a frente fecha sozinha.",
      detalhe:
        "Com todos os obrigatórios validados, a Auditoria passa a Análise Finalizada automaticamente, o prontuário é arquivado no Drive e a linha sai da fila da aba. Forçar o status pelo seletor com documento faltando é o caminho oposto: ele exige aceite e fica registrado em seu nome.",
      controles: ["Régua completa", "Prontuário arquivado no Drive.", "Abrir pasta"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela diz: Sem régua para este par cliente+cargo (nenhum documento exigido).",
      acao: "Não há documento exigido cadastrado para essa combinação de cliente e cargo, então não existe placar a montar nem o que auditar. Peça à administração o cadastro da régua daquele cliente com aquele cargo.",
    },
    {
      sintoma: "Aparece: Falha ao carregar os documentos.",
      acao: "A janela não conseguiu montar a lista. Feche e abra de novo. Se repetir, avise a TI: nenhum documento é alterado por essa falha.",
    },
    {
      sintoma: "A lista fica em Carregando documentos e não avança.",
      acao: "Espere alguns segundos, porque a janela busca três coisas ao abrir: os documentos, o catálogo de tipos e o placar. Persistindo, feche e abra de novo.",
    },
    {
      sintoma: "A barra diz Régua completa e ainda vejo documento sem resultado na lista.",
      acao: "Está certo. A barra conta só os obrigatórios, e os não obrigatórios e facultativos aparecem na lista sem travar a frente.",
    },
    {
      sintoma:
        "Duas pessoas do mesmo cliente têm quantidades diferentes de documentos obrigatórios.",
      acao: "A régua resolve por cliente mais cargo, então cargo diferente é checklist diferente. Quando o cliente tem régua própria por vínculo, ela vence a régua geral do cliente naquele documento. E há exigência que depende da própria pessoa: a carteira de reservista só é obrigatória para candidato do sexo masculino, e sai da conta quando o sexo não está informado.",
    },
    {
      sintoma: "O total de obrigatórios mudou de uma abertura para a outra.",
      acao: "Ou a administração alterou a régua daquele cliente com aquele cargo, ou mudou o cargo, o vínculo ou o sexo no cadastro da pessoa. O placar sempre reflete a régua de agora, não a de quando a admissão nasceu.",
    },
    {
      sintoma: "A régua fechou e o aviso diz que ainda não há pasta no Drive.",
      acao: "Os documentos seguem guardados e o sistema tenta enviar de novo na próxima ação. Nada foi perdido. Se continuar assim, avise a TI.",
    },
    {
      sintoma:
        "O aviso diz que a pasta já existia no Drive e foi reaproveitada, nenhuma pasta nova foi criada.",
      acao: "Não é erro: o sistema escreveu dentro de uma pasta que já existia para aquela pessoa, em vez de criar uma segunda. O aviso existe para você saber em qual pasta olhar.",
    },
  ],
  regras: [
    "Quais documentos são exigidos vem da régua do cliente mais o cargo: muda o cargo, muda o checklist.",
    "Quando o cliente tem régua própria por vínculo, ela tem precedência sobre a régua geral do cliente para aquele documento, e o documento conta uma vez só.",
    "A carteira de reservista só é obrigatória para candidato do sexo masculino, e sai da conta quando o sexo não está informado.",
    "Só documento obrigatório entra na conta da barra. Não obrigatório e facultativo aparecem na lista e não travam o fechamento da frente.",
    "Quando todos os obrigatórios ficam validados, a frente de Auditoria vai para Análise Finalizada SOZINHA, sem ninguém clicar, e o prontuário é arquivado no Drive.",
    "Concluir a Auditoria pelo seletor da linha com documento obrigatório pendente exige aceite explícito, e esse aceite fica registrado em seu nome.",
    "Documento assumido à mão por alguém do time conta na régua igual a um aprovado pela máquina.",
    "O placar é sempre do estado de agora: alterar um documento recalcula a conta na mesma hora, para mais ou para menos.",
    "O aviso de tempo parado serve para separar falha de sistema de documento que ninguém enviou. Os dois aparecem como pendência na conta, mas se resolvem de formas diferentes.",
    "Documento na fila do time é pendência que o candidato não consegue mais resolver sozinho: ele esgotou os envios dele no Portal.",
  ],
  relacionados: [
    "auditar-os-documentos-da-admissao",
    "visualizar-um-documento-da-admissao",
    "reauditar-um-documento",
    "assumir-um-documento-como-valido",
    "reabrir-a-pendencia-de-um-documento",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "acompanhar-a-conferencia-do-portal",
    "abrir-o-prontuario-no-drive",
    "anexar-o-aso-no-exame",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AuditoriaDocsModal.tsx",
    "apps/backend/src/regua/regua-completude.service.ts",
    "apps/backend/src/domain/regua.ts",
    "apps/backend/src/domain/auditoria-parada.ts",
  ],
  revisadoEm: "2026-09-30",
};
