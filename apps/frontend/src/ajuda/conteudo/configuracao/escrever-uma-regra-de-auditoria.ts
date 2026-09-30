import type { Artigo } from "../../tipos";

/**
 * N1 DAS REGRAS DE AUDITORIA, 1 de 2: ESCREVER O CRITÉRIO.
 *
 * ┌─ O QUE FOI CONFERIDO NO MOTOR, E QUE MUDA O QUE SE ESCREVE NO CAMPO ─────────────────────────┐
 * │ O texto cadastrado aqui é a ÚNICA fonte de critério da conferência: o sistema manda a lista de  │
 * │ regras ATIVAS daquele tipo de documento e manda avaliar SOMENTE por ela. Três consequências     │
 * │ práticas, e todas viraram passo ou regra do artigo:                                             │
 * │                                                                                                 │
 * │   1. VÁRIAS regras por tipo, e todas precisam ser atendidas. Uma linha por critério é o formato  │
 * │      que o motor recebe, então critério ensacado num parágrafo só dificulta o veredito.          │
 * │   2. Conferir o TIPO do documento e a coincidência de titular com o cadastro já é feito sempre,  │
 * │      sem ninguém escrever. O que se escreve é o que aquele papel precisa TER.                    │
 * │   3. Regra de prazo funciona: a conferência recebe a data de hoje e avalia validade contra ela.  │
 * │      Data escrita na mão dentro da regra é o jeito de a regra envelhecer sozinha.                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A DISTINÇÃO ENTRE A RÉGUA E A REGRA aparece UMA vez, na lista de regras do artigo, e está aqui
 * porque é o que faz a pessoa confundir as duas telas. O resto da divisão (kit, pasta do Drive) é
 * do bloco da família e não se repete.
 *
 * O QUE ESTA PEÇA NÃO COBRE: ativar, desativar e excluir, que é a peça irmã; e AUDITAR o documento
 * de uma admissão, que é a tela de trabalho e já tem artigos próprios.
 *
 * §A.6: nenhum nome, documento ou valor visto em tela entra neste arquivo. O exemplo de critério é
 * genérico e fala do CAMPO, nunca de um dado. SEM IMAGEM DECLARADA: os prints vêm em entrega própria.
 */
export const artigo: Artigo = {
  slug: "escrever-uma-regra-de-auditoria",
  titulo: "Escrever Uma Regra De Auditoria",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regras"],
  menus: ["regras"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "motor-de-documentos",
  resumo:
    "Como cadastrar, por tipo de documento, o critério em texto que a conferência automática aplica para decidir se aquele documento está válido.",
  termos: [
    "regra de auditoria",
    "criterio de validade",
    "criterio do documento",
    "como a ia avalia",
    "inteligencia artificial documento",
    "documento reprovado sem motivo",
    "conferencia automatica",
    "validade do documento",
    "documento vencido",
    "aprovar documento automatico",
    "o que a ia confere",
  ],
  preRequisitos: [
    "Ter o tipo de documento já cadastrado no catálogo: a regra é sempre de um tipo.",
    "Saber, em português de operação, o que faz aquele documento ser aceito e o que faz ser recusado.",
  ],
  passos: [
    {
      gesto: "Abra Regras De Auditoria pelo menu da lateral esquerda.",
      detalhe:
        "A tela tem o formulário de cadastro no topo, o filtro logo abaixo e a lista das regras já cadastradas.",
      controles: ["Regras De Auditoria"],
    },
    {
      gesto: "Escolha o tipo de documento no seletor do formulário.",
      detalhe:
        "A lista vem do catálogo de tipos de documento. Tipo que não estiver lá precisa ser cadastrado antes.",
      controles: ["Tipo de documento", "Selecione o tipo…"],
    },
    {
      gesto: "Escreva o critério no campo de texto, em uma frase objetiva.",
      detalhe:
        "Escreva o que aquele papel precisa ter para ser aceito: estar legível, estar dentro do prazo, trazer determinado campo preenchido. Prazo pode ser escrito em dias ou em validade, porque a conferência sabe a data de hoje.",
      controles: ["Critério de validade"],
    },
    {
      gesto: "Clique em Adicionar.",
      detalhe:
        "A regra entra na lista já ativa, e passa a valer na próxima conferência daquele tipo de documento.",
      controles: ["Adicionar"],
    },
    {
      gesto: "Repita para cada critério, uma regra por linha de exigência.",
      detalhe:
        "Um tipo de documento pode ter várias regras, e o documento só é aprovado quando atende todas. Separar em linhas deixa claro qual delas reprovou.",
    },
    {
      gesto: "Use o filtro por tipo para revisar tudo que já existe de um documento.",
      detalhe:
        "Sem filtro, a lista mostra todos os tipos juntos. Com o filtro, você lê o conjunto de critérios de um documento de uma vez.",
      controles: ["Filtrar por tipo", "Todos os tipos"],
    },
    {
      gesto: "Para corrigir o texto de uma regra, clique no lápis da linha, ajuste e confirme no visto.",
      detalhe:
        "O texto novo vale da próxima conferência em diante. O que já foi auditado não é reavaliado sozinho.",
      controles: ["Editar texto", "Salvar", "Cancelar", "Documento", "Critério", "Estado"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A conferência aprovou um documento que a sua equipe recusaria.",
      acao: "O critério que faltou não está escrito. Acrescente uma regra para aquele tipo de documento dizendo exatamente o que faltou, e mande conferir de novo.",
    },
    {
      sintoma: "A conferência recusou um documento que deveria passar.",
      acao: "Leia as regras ativas daquele tipo usando o filtro. Normalmente há uma regra rígida demais ou escrita para outro caso. Ajuste o texto dela, ou desative a regra que não vale mais.",
    },
    {
      sintoma: "O documento é aceito em nome de outra pessoa, e a conferência reprova por isso.",
      acao: "A conferência sempre compara o titular do documento com o cadastro, a não ser que uma regra permita o contrário. Escreva a exceção na regra, dizendo em nome de quem aquele documento pode estar.",
    },
    {
      sintoma: "A regra de prazo parou de valer sozinha depois de um tempo.",
      acao: "Provavelmente a data foi escrita dentro do texto. Escreva o prazo em dias ou como validade, e não com uma data fixa: a conferência já sabe a data de hoje.",
    },
    {
      sintoma: "O botão de adicionar fica apagado.",
      acao: "Ele só liga com o tipo de documento escolhido e o critério escrito. Preencha os dois campos.",
    },
  ],
  regras: [
    "A régua diz QUAIS documentos são exigidos. A regra de auditoria diz SE cada documento está válido.",
    "O texto cadastrado aqui é a única fonte de critério da conferência automática.",
    "Um tipo de documento pode ter várias regras, e o documento só passa quando atende todas.",
    "Conferir se o documento é do tipo esperado e se o titular bate com o cadastro já é feito sempre, sem precisar de regra.",
    "Regra de prazo é avaliada contra a data de hoje, então não se escreve data fixa no texto.",
    "Só as regras ativas são aplicadas.",
    "Regra nova vale da próxima conferência em diante: o que já foi auditado não é reavaliado sozinho.",
  ],
  relacionados: [
    "ativar-desativar-e-excluir-uma-regra-de-auditoria",
    "o-catalogo-de-documentos-da-regua",
    "definir-a-exigencia-de-cada-documento",
    "auditar-os-documentos-da-admissao",
    "reauditar-um-documento",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regras/page.tsx",
    "apps/backend/src/admin/regras/regras.service.ts",
    "apps/backend/src/auditoria/auditoria.service.ts",
    "apps/ai-service/app/gemini.py",
  ],
  revisadoEm: "2026-09-30",
};
