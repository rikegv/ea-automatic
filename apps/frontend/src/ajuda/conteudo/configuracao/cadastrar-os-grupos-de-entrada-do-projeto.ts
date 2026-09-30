import type { Artigo } from "../../tipos";

/**
 * GRUPOS DE ENTRADA: as levas por data, para o projeto que não entra de uma vez só.
 *
 * ┌─ A SEÇÃO PODE NÃO ESTAR NA TELA, E ISSO NÃO É DEFEITO ───────────────────────────────────────┐
 * │ A maioria dos projetos entra de uma vez, e para esses a seção de grupos fica escondida. Ela      │
 * │ aparece quando já existe grupo, e volta pelo link "usar grupos de entrada", que fica no título   │
 * │ das vagas. Sem esse aviso, quem precisa da primeira turma procura uma seção que não está lá, e   │
 * │ conclui que o recurso sumiu.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA PEÇA NÃO COBRE: a quantidade de vagas de cada cota, que é da peça das vagas por cargo,
 * e o vínculo das pessoas, que é da peça dos vínculos. Aqui só se cadastra a leva.
 *
 * FAMÍLIA: sem família até a família do cadastro de Alto Volume existir, pelo mesmo motivo escrito
 * na peça do projeto.
 *
 * PAPEL: escrita governada pelo menu `alto-volume`, sem `@Roles` de classe na controller
 * (`apps/backend/src/admin/alto-volume/alto-volume.controller.ts`).
 */
export const artigo: Artigo = {
  slug: "cadastrar-os-grupos-de-entrada-do-projeto",
  titulo: "Cadastrar Os Grupos De Entrada Do Projeto",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/alto-volume"],
  menus: ["alto-volume"],
  familia: "alto-volume-cadastro",
  publico: "GESTAO",
  nivel: "N1",
  resumo:
    "Como dividir o projeto em levas por data de entrada, quando o time não começa todo no mesmo dia, e o que acontece ao remover uma leva já usada.",
  termos: [
    "grupo de entrada",
    "turma",
    "leva",
    "onda de entrada",
    "data de entrada",
    "dividir o projeto",
    "entrada escalonada",
    "cota do grupo",
  ],
  preRequisitos: [
    "Ter o menu Alto Volume liberado para o seu usuário.",
    "O projeto já precisa estar cadastrado.",
    "Saber as datas em que cada leva começa.",
  ],
  passos: [
    {
      gesto: "Abra Alto Volume e clique em grupos e vagas na linha do projeto.",
      detalhe: "O painel do projeto abre logo abaixo da lista, e você continua vendo onde está.",
      controles: ["grupos e vagas"],
    },
    {
      gesto: "Se a seção Grupos De Entrada não estiver na tela, clique em usar grupos de entrada.",
      detalhe:
        "O link fica no título de Vagas Por Cargo. Projeto que entra de uma vez só não mostra a seção, para não ocupar metade do painel com o que ele não usa.",
      controles: ["usar grupos de entrada", "Grupos De Entrada"],
    },
    {
      gesto: "Digite o Rótulo do grupo e a data de entrada.",
      detalhe:
        "O rótulo é como o time chama aquela leva. A data é o dia em que ela começa, e é única dentro do projeto.",
      controles: ["Rótulo do grupo"],
    },
    {
      gesto: "Clique em Adicionar.",
      controles: ["Adicionar"],
    },
    {
      gesto: "Confira a leva na tabela, com as colunas Grupo, Entrada e as ações.",
      controles: ["Grupo", "Entrada"],
    },
    {
      gesto: "Para corrigir o rótulo ou a data, clique em editar na linha do grupo.",
      controles: ["editar", "Salvar"],
    },
    {
      gesto: "Para tirar uma leva do projeto, clique em remover e confirme.",
      detalhe:
        "As vagas cadastradas na cota daquele grupo saem junto. Leva com admissão já vinculada não é removida.",
      controles: ["remover", "Remover"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que o projeto já tem um grupo entrando nesta data.",
      acao: "A data de entrada é única no projeto. Use o grupo que já existe ou escolha outra data.",
    },
    {
      sintoma: "O sistema recusa remover o grupo.",
      acao: "Ele tem admissões vinculadas, e o número aparece no aviso. Mova essas pessoas para outro grupo, pela troca na linha de cada uma, e remova depois.",
    },
    {
      sintoma: "A seção de grupos não está na tela.",
      acao: "O projeto está sem nenhuma leva cadastrada. Clique em usar grupos de entrada, no título de Vagas Por Cargo, para cadastrar a primeira.",
    },
    {
      sintoma: "Você criou o grupo e as vagas continuam aparecendo como do projeto inteiro.",
      acao: "A cota é escolhida no cadastro da vaga, não no do grupo. Cadastre a linha de vagas escolhendo a leva no seletor de cota.",
    },
  ],
  regras: [
    "Cada leva tem uma data de entrada própria: duas levas não entram no mesmo dia dentro do mesmo projeto.",
    "Sem nenhuma leva cadastrada, todas as vagas ficam na cota do projeto inteiro.",
    "Remover a leva leva junto as vagas cadastradas na cota dela.",
    "Leva com admissão vinculada não é removida: as pessoas são movidas antes.",
  ],
  relacionados: [
    "cadastrar-um-projeto-de-alto-volume",
    "cadastrar-as-vagas-por-cargo",
    "vincular-e-desvincular-admissoes-do-projeto",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/alto-volume/page.tsx",
    "apps/backend/src/admin/alto-volume/alto-volume.controller.ts",
    "apps/backend/src/admin/alto-volume/alto-volume.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
