import type { Artigo } from "../../tipos";

/**
 * ─ O GLOSSÁRIO: NOVE TERMOS QUE O SISTEMA USA COMO SE TODOS SOUBESSEM ──────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: um verbete por passo, com o termo no lugar do gesto e a explicação no
 * detalhe. Farol, frente, régua documental, pendência obrigatória, admissão de banco, aceite, não
 * conformidade, kit e envelope de assinatura.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE NÃO COBRE, E POR QUÊ ─────────────────────────────────────────────┐
 * │ ONDE CLICAR. Nenhum verbete diz em que tela o termo aparece nem o que fazer com ele: quem     │
 * │ procura o glossário está tentando ENTENDER uma palavra que leu, não executar uma tarefa, e    │
 * │ cada um dos nove já tem artigo de tarefa em algum lugar do manual, citado nos relacionados.   │
 * │                                                                                               │
 * │ O RECORTE TAMBÉM É DE QUANTIDADE: são os nove termos que aparecem em tela sem nenhuma         │
 * │ explicação ao lado. Glossário que tenta cobrir o sistema inteiro deixa de ser lido.           │
 * │                                                                                               │
 * │ CADA VERBETE FOI CONFERIDO NO CÓDIGO, incluindo a lista de estados de cada um: glossário      │
 * │ errado é pior que glossário nenhum, porque a pessoa passa a usar a palavra com o sentido      │
 * │ trocado e ninguém percebe na conversa.                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. Glossário não pede captura de tela, e as telas em
 * que os termos aparecem estão com a captura vetada enquanto a homologação não tiver dado sintético.
 *
 * Nenhum dado de pessoa neste arquivo.
 */
export const artigo: Artigo = {
  slug: "o-vocabulario-da-admissao",
  titulo: "O Vocabulário Da Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/"],
  menus: ["inicio"],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "O que significam os nove termos que o sistema usa em toda tela: farol, frente, régua documental, pendência obrigatória, admissão de banco, aceite, não conformidade, kit e envelope de assinatura.",
  termos: [
    "glossario",
    "dicionario",
    "o que significa",
    "o que e farol",
    "o que e frente",
    "o que e regua",
    "o que e pendencia obrigatoria",
    "o que e admissao de banco",
    "o que e aceite",
    "o que e nc",
    "o que e kit",
    "o que e envelope",
    "vocabulario",
    "termos do sistema",
    "nao entendi a palavra",
  ],
  preRequisitos: ["Nada. É um glossário: leia só o verbete que você precisa."],
  passos: [
    {
      gesto: "Farol",
      detalhe:
        "A etiqueta única que resume onde a admissão está, olhando o processo inteiro. São sete: Aguardando Liberação e Liberação Recusada, antes de a pessoa entrar na esteira; Em Admissão, enquanto ela caminha; Banco, Aguardar, quando tudo está resolvido e não há data de admissão prevista; Admissão Concluída, no fim; e Declinou e Rescisão, que encerram o processo. Alguns o sistema escreve sozinho, e os de encerramento são escolha de quem opera e não são desfeitos por automação.",
    },
    {
      gesto: "Frente",
      detalhe:
        "Cada etapa da esteira, com status, responsável e datas próprios. São cinco: auditoria, exame, cadastro e contrato, integração e a credencial do sistema de ponto. Elas são independentes: concluir uma não altera as outras, e o único ponto em que uma espera outras é o cadastro, que só abre com a auditoria fechada e o exame liberado.",
    },
    {
      gesto: "Régua documental",
      detalhe:
        "A lista de documentos exigidos daquela pessoa, definida pelo par cliente e cargo. Muda o cargo, muda a lista. Cada documento dela é obrigatório, não obrigatório ou facultativo, e é a régua que diz quando a auditoria pode fechar. Ela é mantida em cadastro próprio, na administração.",
    },
    {
      gesto: "Pendência obrigatória",
      detalhe:
        "Campo do cadastro da admissão que ficou vazio. A lista é fixa: Cliente, Cargo, Salário, Tipo de contrato, Data de admissão, Pacote de benefícios, Escala, Centro de custo, Setor, Gestor / BP e Uniforme. Pendência sinaliza e nunca impede de salvar. A exigência de cada item pode ser desligada por cliente, na administração, e no Uniforme o que se cobra é a resposta: responder que não possui fecha a pendência.",
    },
    {
      gesto: "Admissão de banco",
      detalhe:
        "A admissão de quem foi aprovado e ainda não tem data de entrada definida. Nela a falta da data de admissão não é pendência, porque é esperada; no lugar, o sistema cobra o Termo de Banco, que é um documento da régua. Resolvidas a auditoria e o exame sem data prevista, o farol vai para Banco, Aguardar, e volta para Em Admissão no dia em que a data for preenchida.",
    },
    {
      gesto: "Aceite",
      detalhe:
        "A confirmação explícita que o sistema pede para avançar com pendência. Ele não é uma caixa a marcar por hábito: guarda quem aceitou, quando e o que estava faltando, e é consultável depois. É o mecanismo que permite ao processo andar sem travar a operação, mantendo claro quem decidiu andar.",
    },
    {
      gesto: "Não conformidade",
      detalhe:
        "O registro de um desvio de processo naquela admissão. São três: Auditoria Sem Documentos, quando a auditoria fechou faltando documento obrigatório; Exame Sem ASO, quando o exame foi marcado como apto sem o laudo validado; e Cadastro Incompleto, quando faltou kit, assinatura ou a marcação de cadastro realizado. Ela fica no nome do consultor que gerou a admissão, e a única forma de deixar de contar contra ele é a liberação por determinação da diretoria aprovada pela supervisão.",
    },
    {
      gesto: "Kit",
      detalhe:
        "O conjunto de documentos de admissão montado para a pessoa assinar. Ele só pode nascer com as três frentes concluídas: auditoria, exame e cadastro. Integração e credencial de ponto não entram nessa conta, porque correm em paralelo.",
    },
    {
      gesto: "Envelope de assinatura",
      detalhe:
        "O pacote enviado para assinatura eletrônica, com o kit dentro. O acompanhamento tem cinco estados: Sem Envelope, quando nada foi enviado; Aguardando Assinatura, depois do envio; Assinado, quando o contrato assinado volta e é arquivado; Cancelado, quando o envelope foi descartado por correção; e Expirado, quando o prazo terminou sem assinatura. Corrigir um contrato já enviado significa cancelar o envelope, corrigir e gerar outro.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Eu confundo régua documental com pendência obrigatória.",
      acao: "Régua é DOCUMENTO que a pessoa tem de entregar, e depende do cliente e do cargo. Pendência obrigatória é CAMPO do cadastro da admissão que ficou vazio, e a lista é a mesma para todos. Nenhuma das duas impede de salvar.",
    },
    {
      sintoma: "Eu confundo farol com status da frente.",
      acao: "O farol é um só por admissão e resume o processo inteiro. O status é de cada frente, e cinco frentes têm cinco status ao mesmo tempo. Uma admissão pode estar Em Admissão no farol e ter a auditoria já finalizada.",
    },
    {
      sintoma: "Eu confundo kit com envelope.",
      acao: "O kit é o conjunto de papéis. O envelope é o envio daquele kit para assinar. Sem kit não há envelope, e o mesmo kit pode virar um envelope novo depois de um cancelamento.",
    },
    {
      sintoma: "Eu confundo aceite com não conformidade.",
      acao: "O aceite é o gesto de assumir o avanço com pendência, no momento em que ele acontece. A não conformidade é o registro que sobra daquele avanço, e ela vive na fila de Não Conformidades.",
    },
  ],
  regras: [
    "O farol é um por admissão; o status é um por frente.",
    "A régua documental resolve pelo par cliente e cargo.",
    "Pendência obrigatória sinaliza e nunca bloqueia o salvamento.",
    "Em admissão de banco, a falta da data de admissão não é pendência; o Termo de Banco é.",
    "Avanço com pendência sempre exige aceite, e o aceite sempre fica registrado.",
    "A não conformidade fica no nome do consultor que gerou a admissão.",
    "O kit exige auditoria, exame e cadastro concluídos.",
  ],
  relacionados: [
    "o-mapa-das-frentes-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "as-duas-vias-da-nao-conformidade",
    "ler-a-fila-de-nao-conformidades",
    "aceitar-o-avanco-com-pendencias",
    "salvar-com-campo-obrigatorio-vazio",
    "auditar-os-documentos-da-admissao",
    "concluir-o-cadastro-e-o-contrato",
    "ler-a-ficha-da-admissao",
  ],
  fontes: [
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/domain/pendencia-config.ts",
    "apps/backend/src/domain/frentes.ts",
    "apps/backend/src/domain/nao-conformidade.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
