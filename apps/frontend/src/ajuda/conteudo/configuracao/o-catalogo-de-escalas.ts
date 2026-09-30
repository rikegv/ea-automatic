import type { Artigo } from "../../tipos";

/**
 * FICHA: o catálogo de Escalas.
 *
 * NÃO COBRE a mecânica do catálogo (criar, renomear, inativar, reativar, filtrar, buscar): ela é a
 * mesma de todos e mora no artigo modelo, apontado em `relacionados`.
 *
 * COBRE DUAS COISAS, e a segunda é a que evita promessa falsa:
 *   1. o que a escala alimenta a jusante, que é o campo Escala da Liberação e o padrão do cliente;
 *   2. que a lista é ABERTA, igual para todos os clientes. Filtrar escala por cliente é decisão
 *      CONGELADA do diretor, então a ficha diz o comportamento de hoje e não promete o outro. O
 *      cliente apenas PRÉ-PREENCHE a escala dele, e quem preenche continua podendo trocar.
 *
 * `preRequisitos` e `seDerErrado` vazios: a família `catalogo-admissao` cobre tudo o que esta tela
 * recusa, e ela não tem erro exclusivo.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-escalas",
  titulo: "O Catálogo De Escalas",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/escalas"],
  menus: ["escalas"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O que o catálogo de escalas governa: ele alimenta o campo Escala da Liberação, e a lista é a mesma para todos os clientes.",
  termos: [
    "escala",
    "jornada",
    "turno",
    "cadastrar escala",
    "escala nao aparece",
    "escala do cliente",
    "12x36",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Procure a escala pelo nome antes de criar outra.",
      detalhe:
        "Escala repetida com grafia diferente confunde quem escolhe na Liberação, porque as duas aparecem juntas na mesma lista.",
      controles: ["Buscar escala por nome", "Ativos", "Inativos", "Todos", "Escala", "Status"],
    },
    {
      gesto: "Digite o nome da escala nova e clique em Adicionar.",
      detalhe: "Ela nasce ativa e passa a ser oferecida na Liberação de qualquer cliente.",
      controles: ["Nova escala *", "Adicionar"],
    },
    {
      gesto:
        "Para corrigir o nome, clique em editar na linha; para tirar a escala de circulação, clique em inativar.",
      controles: [
        "editar",
        "Nome da escala *",
        "Salvar alterações",
        "Cancelar",
        "inativar",
        "Inativar Escala",
        "Inativar",
        "reativar",
      ],
    },
  ],
  seDerErrado: [],
  regras: [
    "A lista é aberta e igual para todos os clientes: ela não é filtrada por cliente, e toda escala ativa aparece em toda Liberação.",
    "O cliente tem uma escala padrão, que apenas PRÉ-PREENCHE o cadastro. Quem preenche pode trocar por qualquer outra escala ativa.",
    "Escala inativa deixa de ser oferecida na Liberação, e as admissões que já a gravaram continuam mostrando o nome dela.",
    "Renomear corrige o nome em todas as admissões que já usam a escala, porque o registro é o mesmo.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-padrao-do-cliente-que-pre-preenche-o-wizard",
    "liberar-uma-admissao",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/escalas/page.tsx"],
  revisadoEm: "2026-09-30",
};
