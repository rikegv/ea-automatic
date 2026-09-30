import type { Artigo } from "../../tipos";

/**
 * FICHA: as Dicas Por Documento.
 *
 * NÃO COBRE a mecânica geral de catálogo, que mora no artigo modelo.
 *
 * COBRE O QUE TORNA ESTE CATÁLOGO ÚNICO NO SISTEMA: o conteúdo dele SAI do sistema e chega a uma
 * pessoa de fora. A dica é o texto que o CANDIDATO lê no portal, no momento em que vai enviar aquele
 * documento. Todos os outros catálogos alimentam listas de opção de quem trabalha aqui dentro; este
 * fala com quem está do outro lado, e por isso o cuidado com o texto é de outra natureza.
 *
 * A REGRA DE LEITURA QUE A TELA INVERTE, e ela confunde quem chega: a lista mostra os TIPOS DE
 * DOCUMENTO, não as dicas escritas. É assim para responder "o que ainda falta escrever" em vez de
 * "o que eu já escrevi", e é por isso que existem linhas com a coluna Dica vazia.
 *
 * `seDerErrado` PRÓPRIO: a recusa dos sinais de maior e menor, o limite de caracteres e a troca de
 * documento travada na edição são exclusivos desta tela. O resto herda da família.
 *
 * §A.6: nenhum texto de dica real é reproduzido aqui, e nenhum exemplo com dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-dicas-de-documento",
  titulo: "O Catálogo De Dicas De Documento",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/dicas-documento"],
  menus: ["dicas-documento"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-admissao",
  resumo:
    "O texto que o candidato lê no portal antes de enviar cada documento: um por tipo de documento, escrito e mantido nesta tela.",
  termos: [
    "dica",
    "orientacao do documento",
    "texto para o candidato",
    "portal do candidato",
    "documento recusado",
    "como enviar o documento",
    "escrever a dica",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Use os filtros para achar o que ainda não tem dica escrita.",
      detalhe:
        "A lista traz os tipos de documento ativos, com e sem dica. A coluna Situação separa os três estados, e o contador do topo diz quantos já têm texto.",
      controles: ["Situação", "Documento", "Com Dica", "Sem Dica", "Dica Inativa", "Código"],
    },
    {
      gesto: "Clique em cadastrar na linha do documento, escreva a dica e clique em Salvar.",
      detalhe:
        "Escreva o que precisa estar visível e legível para o documento ser aceito. O texto sai para o candidato como foi escrito, com as quebras de linha preservadas.",
      controles: ["cadastrar", "Nova dica", "Nova Dica", "Dica", "Salvar", "Cancelar"],
    },
    {
      gesto:
        "Para mudar um texto já escrito, clique em editar; para tirá-lo do portal sem apagar, clique em ocultar.",
      detalhe:
        "A dica oculta some do portal e continua guardada aqui, e o atalho reativar a devolve ao candidato.",
      controles: ["editar", "Editar Dica", "ocultar", "Ocultar A Dica?", "Ocultar", "reativar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema recusa o texto por causa dos sinais de maior e menor.",
      acao: "A dica aceita só texto. Reescreva a frase sem esses dois sinais.",
    },
    {
      sintoma: "O sistema diz que a dica passou do limite de caracteres.",
      acao: "O contador embaixo do campo mostra quanto você já usou. Encurte o texto: a dica é uma orientação curta, lida no celular.",
    },
    {
      sintoma: "Você abriu para editar e o seletor de documento está travado.",
      acao: "O documento não muda na edição, para você não gravar por cima da dica de outro. Feche e abra a linha do documento certo.",
    },
    {
      sintoma: "Um tipo de documento não aparece na lista.",
      acao: "A lista traz só os tipos ativos do catálogo de documentos. Tipo inativo não entra em régua nenhuma, então ele nunca chegaria a um candidato.",
    },
  ],
  regras: [
    "É um texto por tipo de documento, e ele é o que o candidato lê no portal na hora de enviar aquele documento.",
    "Dica oculta deixa de aparecer para o candidato e continua guardada aqui: ocultar não apaga o texto.",
    "A lista traz os tipos de documento ativos, com dica e sem dica, porque a pergunta da tela é o que ainda falta escrever.",
    "O texto sai como foi escrito: o portal não formata nem interpreta marcação, e só as quebras de linha são preservadas.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-catalogo-de-documentos-da-regua",
    "gerar-o-link-do-portal-para-o-candidato",
    "acompanhar-a-conferencia-do-portal",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/dicas-documento/page.tsx",
    "apps/frontend/src/lib/dicas-documento.ts",
  ],
  revisadoEm: "2026-09-30",
};
