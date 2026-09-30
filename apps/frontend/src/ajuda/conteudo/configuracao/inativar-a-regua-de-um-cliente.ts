import type { Artigo } from "../../tipos";

/**
 * INATIVAR A RÉGUA DE UM CLIENTE, que remove a régua INTEIRA daquele cliente, de todos os cargos.
 *
 * A CONFUSÃO QUE ESTA PEÇA EXISTE PARA DESFAZER: inativar a RÉGUA de um cliente e inativar um
 * DOCUMENTO do catálogo são coisas diferentes, feitas na mesma tela, com o mesmo verbo. A primeira
 * apaga o checklist do cliente; a segunda tira um nome de circulação e não altera régua nenhuma já
 * salva. O catálogo de documentos tem ficha própria e não é ensinado aqui.
 *
 * A AÇÃO NÃO TEM DESFAZER, e o texto diz isso antes do passo, não depois.
 */
export const artigo: Artigo = {
  slug: "inativar-a-regua-de-um-cliente",
  titulo: "Inativar A Régua De Um Cliente",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/regua"],
  menus: ["regua"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "regua-e-documentos",
  resumo:
    "Como remover toda a régua de um cliente, o que acontece com ele depois disso, e por que isso não é o mesmo que inativar um documento.",
  termos: [
    "inativar regua",
    "remover regua",
    "apagar checklist",
    "tirar regua do cliente",
    "cliente volta para sem regua",
    "zerar regua",
  ],
  preRequisitos: [
    "Ter certeza: a remoção alcança todos os cargos daquele cliente e não pode ser desfeita.",
  ],
  passos: [
    {
      gesto: "Na Régua Documental, procure o cliente no painel de clientes com régua.",
      detalhe: "A busca daquele painel procura por código, razão social e nome de operação.",
      controles: ["Régua Documental", "Clientes com régua cadastrada", "Buscar cliente…"],
    },
    {
      gesto: "Clique no ícone de lixeira, na ponta direita da linha do cliente.",
      detalhe: "Ele fica ao lado do nome, separado do botão que abre os cargos.",
    },
    {
      gesto: "Leia a confirmação com atenção e clique em Inativar régua.",
      detalhe:
        "A confirmação avisa que o cliente volta para a lista de sem régua e que a Nova Admissão passa a travar a seleção de cargo até alguém recadastrar.",
      controles: ["Inativar Régua Do Cliente", "Inativar régua", "Cancelar"],
    },
    {
      gesto: "Confira: o cliente sai do painel dos que têm régua e volta para o painel do topo.",
      controles: ["Clientes sem régua cadastrada"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Eu queria tirar a régua de um cargo só.",
      acao: "Esta ação remove todos os cargos daquele cliente. Para um cargo, abra o par nos seletores e ajuste a exigência documento a documento.",
    },
    {
      sintoma: "Inativei sem querer e preciso voltar atrás.",
      acao: "Não há desfazer. Recadastre a régua do cliente por cargo, ou use os documentos padrão para reconstruir o básico e ajuste o resto à mão.",
    },
    {
      sintoma: "Eu queria era tirar um documento de circulação.",
      acao: "Isso é outra coisa e fica na lista de documentos, mais abaixo na mesma tela. Inativar documento tira o nome de circulação e não altera as réguas já salvas.",
    },
    {
      sintoma: "Depois de inativar, a Nova Admissão parou de deixar escolher o cargo.",
      acao: "É o efeito esperado: cliente sem régua trava a seleção de cargo. Cadastre a régua de novo para destravar.",
    },
  ],
  regras: [
    "Inativar a régua remove o checklist do cliente inteiro, de todos os cargos.",
    "O cliente volta para a lista de clientes sem régua cadastrada.",
    "Sem régua, a Nova Admissão trava a seleção de cargo daquele cliente.",
    "A ação não pode ser desfeita.",
    "Inativar a régua do cliente não é o mesmo que inativar um documento do catálogo.",
  ],
  relacionados: [
    "cadastrar-a-regua-de-um-cliente-e-cargo",
    "definir-a-exigencia-de-cada-documento",
    "aplicar-os-documentos-padrao",
    "o-catalogo-de-documentos-da-regua",
    "inativar-e-reativar-um-cliente",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/regua/page.tsx",
    "apps/backend/src/admin/regua/regua.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
