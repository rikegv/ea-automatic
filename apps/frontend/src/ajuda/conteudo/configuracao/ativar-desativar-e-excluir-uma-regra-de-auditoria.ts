import type { Artigo } from "../../tipos";

/**
 * N2 DAS REGRAS DE AUDITORIA, 2 de 2: OS TRÊS CAMINHOS DE TIRAR UMA REGRA DE USO.
 *
 * ┌─ AQUI O EXCLUIR EXISTE DE VERDADE, E ISSO CONTRARIA O RESTO DA ADMINISTRAÇÃO ────────────────┐
 * │ Nos catálogos da admissão o caminho é INATIVAR, porque o item está amarrado a registro antigo  │
 * │ e apagar quebraria histórico. A regra de auditoria não é assim: ela é um TEXTO DE CRITÉRIO,    │
 * │ lido no momento da conferência e nunca depois. Nenhuma admissão guarda um ponteiro para a       │
 * │ regra, então apagar não deixa buraco em lugar nenhum, e o botão de excluir apaga mesmo.         │
 * │                                                                                                 │
 * │ É por isso que o artigo existe separado do de escrever: o gesto é o mesmo de qualquer lista, e  │
 * │ o que precisa ser ensinado é QUAL dos dois caminhos é o certo em cada caso.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE NÃO COBRE: como escrever o critério, que é a peça irmã, e a conferência do documento na
 * tela de trabalho, que já tem artigos próprios. SEM IMAGEM DECLARADA: os prints vêm em entrega
 * própria.
 *
 * Um rótulo com armadilha de caixa, conferido no componente: a etiqueta de estado é "Ativa" e
 * "Inativa" (concorda com regra), enquanto o botão de apagar da linha é "Excluir Regra".
 */
export const artigo: Artigo = {
  slug: "ativar-desativar-e-excluir-uma-regra-de-auditoria",
  titulo: "Ativar, Desativar E Excluir Uma Regra De Auditoria",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regras"],
  menus: ["regras"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "motor-de-documentos",
  resumo:
    "Como tirar uma regra de uso sem perdê-la, como apagar de vez a regra que nasceu errada e como escolher entre os dois caminhos.",
  termos: [
    "desativar regra",
    "ativar regra",
    "excluir regra",
    "apagar regra",
    "remover criterio",
    "regra duplicada",
    "regra errada",
    "suspender regra",
    "parar de exigir",
    "voltar a exigir",
  ],
  preRequisitos: [
    "Saber se aquele critério pode voltar a valer: é essa resposta que decide entre desativar e excluir.",
  ],
  passos: [
    {
      gesto: "Abra Regras De Auditoria e localize a regra na lista.",
      detalhe:
        "Use o filtro por tipo quando o documento tiver muitas regras: fica mais fácil ler o conjunto inteiro.",
      controles: ["Regras De Auditoria", "Filtrar por tipo"],
    },
    {
      gesto: "Olhe a coluna Estado: ela mostra Ativa ou Inativa.",
      detalhe: "Só as regras ativas são aplicadas na conferência.",
      controles: ["Estado", "Ativa", "Inativa"],
    },
    {
      gesto: "Clique na etiqueta de estado para alternar entre ativa e inativa.",
      detalhe:
        "É um clique só, sem janela de confirmação, e vale da próxima conferência em diante. A regra desativada continua na lista, com o texto guardado.",
      controles: ["Ativa", "Inativa", "Desativar regra", "Ativar regra"],
    },
    {
      gesto:
        "Prefira desativar quando o critério pode voltar: mudança de política, exigência suspensa por um período, teste de um critério novo.",
      detalhe:
        "Desativar preserva o texto escrito, e reativar é um clique. Nada se perde no caminho.",
    },
    {
      gesto:
        "Para apagar de vez, clique na lixeira da linha e confirme em Excluir, na janela que abrir.",
      detalhe:
        "A janela diz de qual documento é a regra. Excluir não tem volta: o texto some e, para tê-lo de novo, é preciso escrever tudo outra vez.",
      controles: ["Excluir Regra", "Excluir", "Cancelar"],
    },
    {
      gesto:
        "Prefira excluir quando a regra nasceu errada: texto duplicado, critério de outro documento, regra escrita por engano.",
      detalhe:
        "Regra errada deixada inativa polui a lista e volta a valer no primeiro clique distraído. O que está errado sai, o que está suspenso fica.",
    },
    {
      gesto: "Confira o que sobrou ativo naquele tipo antes de sair da tela.",
      detalhe:
        "Tipo de documento sem nenhuma regra ativa passa a ser conferido só pelo básico: se o papel é do tipo esperado e se o titular bate com o cadastro.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você excluiu a regra errada.",
      acao: "Não há como desfazer. Escreva a regra de novo no formulário do topo, com o mesmo tipo de documento e o mesmo critério.",
    },
    {
      sintoma: "A regra está na lista, mas a conferência não a aplicou.",
      acao: "Confira a coluna Estado: regra inativa não é aplicada. Confira também se ela foi cadastrada no tipo de documento certo.",
    },
    {
      sintoma: "Você desativou a regra e a conferência anterior continua reprovando o documento.",
      acao: "O que já foi auditado não é reavaliado sozinho. Mande conferir o documento de novo na tela da admissão.",
    },
    {
      sintoma: "O documento passou a ser aprovado com quase nada conferido.",
      acao: "Provavelmente o tipo ficou sem regra ativa. Reative o que ainda vale ou escreva o critério de novo.",
    },
  ],
  regras: [
    "Só as regras ativas são aplicadas na conferência.",
    "Desativar guarda o texto e tira de uso. Excluir apaga, e não tem volta.",
    "Excluir aqui apaga de verdade, diferente dos catálogos da admissão, em que o caminho é inativar: a regra é um critério de conferência e nenhuma admissão guarda um ponteiro para ela.",
    "Nenhum dos dois caminhos reavalia o que já foi auditado.",
    "Tipo de documento sem regra ativa é conferido apenas pelo básico: se o papel é do tipo esperado e se o titular bate com o cadastro.",
  ],
  relacionados: [
    "escrever-uma-regra-de-auditoria",
    "manter-um-catalogo-do-sistema",
    "reauditar-um-documento",
    "auditar-os-documentos-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regras/page.tsx",
    "apps/backend/src/admin/regras/regras.service.ts",
    "apps/backend/src/auditoria/auditoria.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
