import type { Artigo } from "../../tipos";

/**
 * N1 DAS REGRAS DO KIT, 1 de 3: O KIT EM SI. Criar, renomear, ativar, desativar e remover.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre a COLUNA DA ESQUERDA da tela: a lista de kits, um por tipo de vínculo, e os quatro   │
 * │ gestos que se fazem sobre ela. Ela para no momento em que o kit existe e está selecionado.     │
 * │                                                                                                │
 * │ O que ela deliberadamente NÃO cobre, e por quê:                                                │
 * │   . o DICIONÁRIO DE TÍTULOS daquele kit, que é a coluna da direita e tem peça própria;         │
 * │   . a diferença entre documento padrão e individual, que é peça própria;                       │
 * │   . GERAR o kit de um lote, que é outra tela, outro menu e já tem quatro peças escritas.       │
 * │                                                                                                │
 * │ A divisão entre régua, regra de auditoria, kit e pasta do Drive é dita UMA vez, no bloco da    │
 * │ família. Repeti-la aqui é exatamente a duplicação que a família existe para eliminar.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM DECLARADA: os prints desta frente entram em entrega própria.
 *
 * Os `controles` foram lidos letra por letra no componente. Duas armadilhas de caixa: os dois
 * estados do kit são etiquetas ("Ativo", "Inativo") e o botão do dicionário é comando ("Adicionar").
 * O aviso do apagar está declarado como a tela o escreve, com o parêntese e tudo.
 */
export const artigo: Artigo = {
  slug: "criar-e-renomear-um-tipo-de-kit",
  titulo: "Criar E Renomear Um Tipo De Kit",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/kit-regras"],
  menus: ["kit-regras"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "motor-de-documentos",
  resumo:
    "Como criar um kit por tipo de vínculo, renomear, ativar, desativar e remover, e o que o sistema apaga junto quando um kit é removido.",
  termos: [
    "criar kit",
    "novo kit",
    "tipo de kit",
    "renomear kit",
    "kit temporario",
    "kit por vinculo",
    "desativar kit",
    "apagar kit",
    "excluir kit",
    "sumiu o kit",
    "o kit nao aparece na lista",
    "regras do kit",
  ],
  preRequisitos: [
    "Saber para qual tipo de vínculo este kit serve: cada vínculo tem o seu, e o nome do kit é o que aparece na hora de gerar.",
  ],
  passos: [
    {
      gesto: "Abra Regras Do Kit pelo menu da lateral esquerda.",
      detalhe:
        "A tela tem duas colunas: à esquerda os kits, à direita os documentos do kit selecionado.",
      controles: ["Regras Do Kit", "Regras Do Gerador De Kit"],
    },
    {
      gesto: "Digite o nome do novo kit no campo do topo da coluna da esquerda.",
      detalhe:
        "Escreva o nome como você quer lê-lo na hora de gerar o kit: é esse texto que aparece no seletor da outra tela.",
    },
    {
      gesto: "Clique no botão de mais, ao lado do campo, para criar.",
      detalhe:
        "O kit nasce vazio, ativo e no fim da lista. A contagem de documentos dele fica zerada até você montar o dicionário.",
    },
    {
      gesto: "Clique no nome de um kit para selecioná-lo.",
      detalhe:
        "O kit selecionado ganha destaque e a coluna da direita passa a mostrar os documentos dele.",
      controles: ["Ver documentos deste kit"],
    },
    {
      gesto: "Para renomear, clique no lápis da linha do kit, ajuste o nome e confirme no visto.",
      detalhe:
        "A tecla Enter confirma e a tecla Esc cancela. Renomear não mexe em nenhum documento do kit: o dicionário continua inteiro.",
      controles: ["Renomear kit", "Salvar", "Cancelar"],
    },
    {
      gesto: "Para tirar um kit de uso sem perder nada, clique na etiqueta de estado dele.",
      detalhe:
        "A etiqueta alterna entre Ativo e Inativo. O kit inativo continua com todos os documentos cadastrados, pronto para voltar quando você quiser.",
      controles: ["Ativo", "Inativo", "Desativar o kit", "Ativar o kit"],
    },
    {
      gesto:
        "Para apagar de vez, clique na lixeira da linha e confirme em Remover Kit, na janela que abrir.",
      detalhe:
        "A janela diz quantos documentos vão junto. Remover o kit apaga o dicionário inteiro dele, e isso não tem como ser desfeito.",
      controles: [
        "Remover kit (apaga também seus documentos)",
        "Remover Kit",
        "Cancelar",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você removeu um kit e perdeu a lista de títulos que estava nele.",
      acao: "Remover apaga os documentos junto e não tem volta. Crie o kit de novo e monte o dicionário outra vez. Da próxima, prefira deixar o kit Inativo: ele some do uso e mantém tudo cadastrado.",
    },
    {
      sintoma: "O kit não aparece para quem vai gerar o kit do lote.",
      acao: "Confira se a etiqueta dele está em Ativo nesta tela. Kit inativo continua cadastrado, mas fora de uso.",
    },
    {
      sintoma: "O botão de criar fica apagado e não clica.",
      acao: "Ele só liga quando há um nome escrito no campo. Digite o nome do kit e tente de novo.",
    },
  ],
  regras: [
    "Um kit por tipo de vínculo, e o nome de cada kit não se repete.",
    "O kit novo nasce vazio e ativo: ele só passa a reconhecer documento depois que o dicionário de títulos é montado.",
    "Desativar guarda tudo e tira de uso. Remover apaga o kit e todos os documentos dele, sem volta.",
    "Renomear o kit não altera nenhum título do dicionário.",
  ],
  relacionados: [
    "montar-o-dicionario-de-titulos-do-kit",
    "padrao-ou-individual-o-que-muda-no-kit",
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "manter-um-catalogo-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/kit-regras/page.tsx",
    "apps/backend/src/admin/kit-regras/kit-tipos.service.ts",
    "apps/backend/src/admin/kit-regras/kit-tipos.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
