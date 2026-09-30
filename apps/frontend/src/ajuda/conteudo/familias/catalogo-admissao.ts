import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: os catálogos simples da administração da admissão.
 *
 * Reúne as fichas de cargos, escalas, clínicas, benefícios, status da sala de espera, dicas de
 * documento e documentos da régua. Todas seguem o MESMO molde, e por isso a mecânica (criar,
 * renomear, inativar, reativar, filtrar, buscar) mora no artigo modelo, nunca na ficha.
 *
 * ┌─ POR QUE ESTA FAMÍLIA É SEPARADA DA DE ATRAÇÃO E SELEÇÃO ───────────────────────────────────┐
 * │ Parecem iguais e não são, em duas coisas que o leitor sente: o portão de acesso (aqui é papel, │
 * │ lá é ÁREA) e o texto de erro, que nomeia o catálogo. E os catálogos daqui NÃO TÊM excluir, os  │
 * │ de lá têm. Uma família só obrigaria metade das fichas a reescrever o bloco inteiro, que é       │
 * │ exatamente o retrabalho que a família existe para eliminar.                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const familia: FamiliaDeArtigos = {
  codigo: "catalogo-admissao",
  rotulo: "Catálogos Da Admissão",
  preRequisitos: [
    "Ter o menu daquele catálogo liberado para o seu usuário.",
    "Ser Master ou Super Admin: os catálogos da administração não abrem para o papel Comum.",
    "Saber onde o item é usado: o catálogo alimenta as listas de opção de outras telas, e mexer nele muda o que aparece lá.",
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema recusa o nome que você digitou e diz que ele já existe.",
      acao: "O nome repetido conta mesmo quando o item existente está INATIVO. Troque o filtro para os inativos, procure pelo nome e reative o que já existe, em vez de criar outro.",
    },
    {
      sintoma:
        "O sistema diz que o nome não pode ficar vazio.",
      acao: "Você salvou com o campo em branco ou só com espaços. Digite o nome e salve de novo.",
    },
    {
      sintoma:
        "O sistema pede um nome com ao menos uma letra ou número.",
      acao: "O texto digitado só tem pontuação ou símbolo. Nome de catálogo precisa de ao menos uma letra ou um número.",
    },
    {
      sintoma:
        "O sistema diz que o item não foi encontrado.",
      acao: "Alguém apagou ou inativou o item enquanto a sua tela estava aberta. Recarregue a página antes de tentar de novo.",
    },
    {
      sintoma:
        "Você procura o botão de excluir e não acha.",
      acao: "Nos catálogos da admissão ele não existe, e é de propósito: apagar levaria embora o histórico de quem já usou o item. O caminho é inativar, que tira o item das listas novas e preserva o passado.",
    },
    {
      sintoma:
        "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
