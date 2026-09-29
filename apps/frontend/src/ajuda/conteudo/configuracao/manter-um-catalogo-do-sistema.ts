import type { Artigo } from "../../tipos";

/**
 * ARTIGO PILOTO 3 (Fase 0), o de catálogo, e ele é o ARTIGO MODELO.
 *
 * Os catálogos de administração são a mesma tela com outro título: criar, renomear, inativar,
 * reativar, filtrar e procurar. Este artigo ensina o gesto UMA vez, com os Motivos De Declínio como
 * exemplo, e os demais catálogos ganham depois uma ficha curta do que é diferente em cada um.
 *
 * Ele NÃO cita valor nenhum de catálogo de propósito: valor muda por dado, e nenhum detector de
 * manual velho pega mudança de dado. Artigo que lista os itens de um catálogo envelhece sozinho.
 *
 * O ARTIGO DIZ QUAL IMAGEM E O QUE ELA MOSTRA. ONDE AS SETAS VÃO é assunto do roteiro irmão, em
 * `capturas/manter-um-catalogo-do-sistema.roteiro.ts`.
 *
 * ┌─ O `controles` ENTROU DEPOIS, E AQUI A CAIXA IMPORTA MAIS QUE NO RESTO DO MANUAL ─────────────┐
 * │ Piloto: nasceu antes do campo, e o detector o media como N1 MUDO. Nesta tela os atalhos de linha │
 * │ são escritos em MINÚSCULA no componente ("editar", "inativar", "reativar"), e os botões do topo em │
 * │ title case ("Adicionar", "Salvar alterações"). Está declarado como está na tela: quem pergunta "o  │
 * │ que faz esse inativar" digita o que leu, e o índice "Nesta Tela" é gerado deste campo.            │
 * │                                                                                                   │
 * │ A CONTRADIÇÃO APARENTE COM O PARÁGRAFO ACIMA, e ela não é contradição: o artigo continua sem citar │
 * │ VALOR de catálogo (nenhum motivo de declínio aparece em lugar nenhum). "Ativos", "Inativos" e      │
 * │ "Ativo" não são valores do catálogo, são os controles da tela QUE MANTÉM o catálogo, e esses não    │
 * │ mudam quando o dado muda.                                                                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "manter-um-catalogo-do-sistema",
  titulo: "Manter Um Catálogo Do Sistema",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/motivos-declinio"],
  menus: ["motivos-declinio"],
  publico: "GESTAO",
  /*
   * N1: caminho principal. Quem ler só os N1 do módulo consegue trabalhar. O N2 é o recurso
   * secundário, e os três pilotos são N1 de propósito: eles existem para validar o FORMATO.
   */
  nivel: "N1",
  resumo:
    "Como criar, renomear, inativar e reativar itens de um catálogo, e por que inativar é o caminho certo em vez de apagar.",
  termos: [
    "catalogo",
    "cadastro",
    "criar item",
    "renomear",
    "inativar",
    "desativar",
    "reativar",
    "excluir",
    "apagar",
    "lista de opcoes",
    "motivo de declinio",
    "sumiu da lista",
  ],
  preRequisitos: [
    "Ter o menu daquele catálogo liberado para o seu usuário.",
    "Saber onde o item é usado: o catálogo alimenta as listas de opção de outras telas.",
  ],
  passos: [
    {
      gesto: "Abra o catálogo pelo Menu Gerencial.",
      detalhe:
        "O exemplo desta tela é o catálogo de Motivos De Declínio. Os outros catálogos funcionam do mesmo jeito.",
      controles: ["Menu Gerencial"],
      print: {
        arquivo: "01-tela-do-catalogo.png",
        legenda: "Passo 1: a tela do catálogo, com o campo de cadastro em cima e a lista embaixo.",
      },
    },
    {
      gesto: "Digite o nome do item novo no campo do topo e clique em Adicionar.",
      detalhe: "O item nasce ativo e passa a aparecer nas listas de opção que usam este catálogo.",
      controles: ["Novo motivo *", "Adicionar"],
      print: {
        arquivo: "02-adicionar-item.png",
        legenda: "Passo 2: o campo de nome e o botão de adicionar.",
      },
    },
    {
      gesto:
        "Para renomear, clique em editar na linha do item, ajuste o nome e clique em Salvar alterações.",
      detalhe:
        "O item continua sendo o mesmo registro, então o nome novo aparece também nos lançamentos antigos.",
      controles: ["editar", "Nome do motivo *", "Salvar alterações", "Cancelar"],
      print: {
        arquivo: "03-editar-item.png",
        legenda: "Passo 3: o atalho de editar, na ponta direita da linha.",
      },
    },
    {
      gesto: "Para tirar um item de circulação, clique em inativar e confirme.",
      detalhe:
        "Inativar não apaga: o item deixa de ser oferecido nas listas de opção e continua nos registros que já o usavam.",
      controles: ["inativar", "Inativar Motivo", "Inativar", "Ativo", "Inativo"],
      print: {
        arquivo: "04-inativar-item.png",
        legenda: "Passo 4: o atalho de inativar, na linha do item.",
      },
    },
    {
      gesto:
        "Para trazer de volta, troque o filtro para inativos ou para todos e clique em reativar na linha do item.",
      controles: ["Ativos", "Inativos", "Todos", "reativar"],
      print: {
        arquivo: "05-reativar-item.png",
        legenda: "Passo 5: o filtro da lista e o atalho de reativar.",
      },
    },
    {
      gesto:
        "Use a busca ao lado dos filtros para achar um item pelo nome, e clique no título de uma coluna para ordenar a lista.",
      detalhe: "O contador ao lado de cada filtro diz quantos itens estão em cada situação.",
      controles: ["Buscar motivo por nome", "Motivo", "Status"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Não encontro o botão de excluir.",
      acao: "Ele não existe, e é de propósito. Apagar levaria embora o histórico de quem já usou o item. O caminho é inativar.",
    },
    {
      sintoma: "O item não aparece na lista de opção da outra tela.",
      acao: "Confira se ele está ativo: troque o filtro para todos e veja a situação dele. Item inativo não é oferecido.",
    },
    {
      sintoma: "O sistema recusa o nome que eu digitei.",
      acao: "Provavelmente já existe um item com esse nome, ativo ou inativo. Filtre por todos, procure pelo nome e reative o que já existe em vez de criar um repetido.",
    },
    {
      sintoma: "Renomeei e o nome antigo continua aparecendo em algum lugar.",
      acao: "Recarregue a tela que mostra o nome antigo. As listas de opção são lidas na abertura da tela.",
    },
    {
      sintoma: "A lista aparece vazia.",
      acao: "Você pode estar num filtro sem itens, ou com texto na busca. Clique no filtro de todos e limpe a busca.",
    },
  ],
  regras: [
    "Inativar preserva os vínculos e o histórico: nada do que já usou o item se perde.",
    "Item inativo deixa de ser oferecido nas telas que consomem o catálogo, e continua visível nos registros antigos.",
    "Renomear muda o nome em todo o sistema, porque o registro é o mesmo.",
    "Todo item novo nasce ativo.",
  ],
  relacionados: [],
  fontes: ["apps/frontend/src/app/(app)/admin/motivos-declinio/page.tsx"],
  revisadoEm: "2026-09-27",
};
