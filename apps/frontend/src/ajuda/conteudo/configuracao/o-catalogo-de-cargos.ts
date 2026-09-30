import type { Artigo } from "../../tipos";

/**
 * FICHA: o catálogo de Cargos.
 *
 * O QUE ELA NÃO COBRE, E É DE PROPÓSITO: a mecânica de criar, renomear, inativar, reativar, filtrar
 * e buscar. Essa é a mesma de todo catálogo e mora no artigo modelo, que esta ficha aponta em
 * `relacionados`. Repeti-la aqui criaria duas versões da mesma instrução, e no primeiro ajuste uma
 * das duas ficaria mentindo.
 *
 * O QUE ELA COBRE, e é o único motivo de ela existir: o cargo é METADE da chave da régua documental,
 * junto com o cliente. Mexer neste catálogo mexe no checklist de documentos que a admissão cobra, e
 * essa consequência não está escrita em lugar nenhum da tela.
 *
 * `preRequisitos` e `seDerErrado` ficam VAZIOS: a família `catalogo-admissao` já cobre o acesso, o
 * nome repetido, o nome vazio, o item não encontrado e a ausência do excluir. Não há erro exclusivo
 * desta tela.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-cargos",
  titulo: "O Catálogo De Cargos",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/cargos"],
  menus: ["cargos"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O que o catálogo de cargos governa: ele é metade da chave da régua documental e alimenta o cargo escolhido na admissão.",
  termos: [
    "cargo",
    "funcao",
    "cadastrar cargo",
    "cargo novo",
    "cargo nao aparece",
    "renomear cargo",
    "mudei o cargo e mudou o checklist",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Procure o cargo pelo nome antes de criar outro.",
      detalhe:
        "O mesmo cargo escrito de dois jeitos vira dois cargos, e cada um resolve uma régua diferente.",
      controles: ["Buscar cargo por nome", "Ativos", "Inativos", "Todos", "Cargo", "Status"],
    },
    {
      gesto: "Digite o nome do cargo novo e clique em Adicionar.",
      detalhe:
        "Ele nasce ativo e passa a ser oferecido no cadastro da admissão e no cadastro da régua documental.",
      controles: ["Novo cargo *", "Adicionar"],
    },
    {
      gesto:
        "Para corrigir o nome, clique em editar na linha; para tirar o cargo de circulação, clique em inativar.",
      controles: [
        "editar",
        "Nome do cargo *",
        "Salvar alterações",
        "Cancelar",
        "inativar",
        "Inativar Cargo",
        "Inativar",
        "reativar",
      ],
    },
  ],
  seDerErrado: [],
  regras: [
    "A régua documental é resolvida pelo par de cliente e cargo: trocar o cargo da admissão troca o checklist de documentos que ela cobra.",
    "Cargo criado aqui passa a ser oferecido no cadastro da admissão e no cadastro da régua; cargo inativo deixa de ser oferecido nos dois, e as admissões que já o usam continuam com ele.",
    "Renomear não cria cargo novo: o nome novo aparece também nas admissões antigas, porque o registro é o mesmo.",
    "Cargo novo não nasce com régua: enquanto o par de cliente e cargo não tiver régua cadastrada, a admissão daquele par nasce sem documentos exigidos.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-catalogo-de-documentos-da-regua",
    "ler-a-regua-obrigatoria-da-admissao",
    "cadastrar-uma-admissao-nova",
  ],
  fontes: ["apps/frontend/src/app/(app)/admin/cargos/page.tsx"],
  revisadoEm: "2026-09-30",
};
