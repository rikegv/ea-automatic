import type { Artigo } from "../../tipos";

/**
 * FICHA: a fila de Divergências Da Ingestão, LEITURA.
 *
 * COBRE, antes de qualquer coluna, o fato que tranquiliza e é verdadeiro: o valor que já estava no
 * sistema VENCEU. Nada foi sobrescrito, e a linha existe exatamente porque a diferença NÃO foi
 * aplicada. Essa frase vem primeiro de propósito: quem abre a tela e vê dois valores lado a lado
 * conclui, sozinho, que alguma coisa foi trocada por trás, e passa a desconfiar do próprio dado.
 *
 * COBRE também os três indicadores como RECORTE: eles não são placar, são filtro clicável, e é por
 * eles que a pessoa chega ao trabalho do dia (o que está pendente) e ao sintoma que interessa mais
 * (a mesma diferença voltando muitas vezes).
 *
 * NÃO COBRE as duas decisões, que têm artigo próprio em `relacionados`. Ler e decidir são momentos
 * diferentes, e misturar os dois aqui faria a peça de leitura ensinar a escrever no dado.
 *
 * NÃO COBRE como a diferença nasce do lado do servidor, nem com que frequência a leitura automática
 * roda. É comportamento de servidor, e repetido em texto ele envelhece sem nada falhar.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO, e ela é a razão de a fila poder estar VAZIA hoje: a leitura
 * automática que alimenta esta tela só roda com a data de corte e a chave de marcação configuradas
 * no servidor. Sem elas ela fica inerte, nenhuma diferença é detectada, e a tela abre corretamente
 * sem nenhuma linha. Isso é lacuna de configuração, não defeito da tela, e está descrito como
 * sintoma abaixo.
 */
export const artigo: Artigo = {
  slug: "ler-a-fila-de-divergencias-da-ingestao",
  titulo: "Ler A Fila De Divergências Da Ingestão",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/divergencias-ingestao"],
  menus: ["divergencias-ingestao"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "saude-da-ingestao",
  resumo:
    "Como ler a fila onde o Pandapé discorda do sistema: o que cada coluna compara, o que os três indicadores recortam, e por que nenhum dado seu foi sobrescrito.",
  termos: [
    "divergencia",
    "o pandape mudou o que eu fiz",
    "voltou de etapa sozinho",
    "o dado mudou sozinho",
    "sobrescreveu",
    "diferenca entre o pandape e o sistema",
    "candidato voltou para tras",
    "reincidente",
    "valor diferente",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Divergências Da Ingestão pelo menu da lateral esquerda.",
      detalhe:
        "Cada linha é uma diferença entre o que está no sistema e o que a leitura automática trouxe do Pandapé. O valor do sistema é o que continua valendo: a linha existe porque a diferença não foi aplicada.",
      controles: ["Divergências Da Ingestão"],
    },
    {
      gesto: "Leia os três indicadores do topo e use-os como filtro.",
      detalhe:
        "Pendentes é o trabalho que espera decisão, Resolvidas é o histórico de quem já decidiu, e Reincidentes é a mesma diferença que já voltou mais de uma vez. Cada card liga e desliga o seu recorte, e dá para ligar mais de um.",
      controles: ["Pendentes", "Resolvidas", "Reincidentes"],
    },
    {
      gesto: "Identifique a linha por Candidato, Cliente e Vaga.",
      detalhe: "Sem nome resolvido, a célula mostra não informado e as outras duas colunas situam o caso.",
      controles: ["Candidato", "Cliente", "Vaga"],
    },
    {
      gesto: "Leia a coluna Campo, que diz o que está sendo comparado.",
      detalhe:
        "A comparação é sempre de um campo só. Etapa Do Funil e Situação são da candidatura; Código Da Vaga, Nome Da Vaga, Cidade Da Vaga e Posições Da Vaga são da abertura da vaga; Vaga Do Candidato é a vaga em que a pessoa está. Passe o mouse na etiqueta para ver o escopo e a situação da linha.",
      controles: [
        "Campo",
        "Etapa Do Funil",
        "Situação",
        "Código Da Vaga",
        "Nome Da Vaga",
        "Cidade Da Vaga",
        "Posições Da Vaga",
        "Vaga Do Candidato",
      ],
    },
    {
      gesto: "Compare Valor No EA e Valor No Pandapé.",
      detalhe:
        "À esquerda está o que vale hoje no sistema, em destaque. À direita, o que o Pandapé trouxe e não foi aplicado. Valor ausente aparece como não informado.",
      controles: ["Valor No EA", "Valor No Pandapé"],
    },
    {
      gesto: "Olhe Ocorrências antes de decidir qualquer coisa.",
      detalhe:
        "É quantas vezes a leitura automática já trouxe essa mesma diferença. Número alto não é uma linha repetida: é sinal de que a origem insiste no mesmo valor, e costuma indicar cadastro errado na origem, não engano de quem operou.",
      controles: ["Ocorrências", "Detectado Em"],
    },
    {
      gesto: "Recorte a fila pelos cinco filtros e ordene pelo cabeçalho.",
      detalhe:
        "Campo, Escopo, Cliente, Vaga e Situação aceitam vários valores ao mesmo tempo, e nenhum marcado significa todos.",
      controles: [
        "Filtrar por campo",
        "Filtrar por escopo",
        "Filtrar por cliente",
        "Filtrar por vaga",
        "Filtrar por situação",
        "Candidatura",
        "Atualizar a fila",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A fila abre sem nenhuma linha.",
      acao: "Pode ser o estado bom, quando o que o Pandapé trouxe concorda com o sistema, e a tela diz isso no lugar da tabela. Pode também ser que a leitura automática ainda não esteja configurada no servidor, e nesse caso nenhuma diferença chega a ser detectada. Não havendo nenhuma linha há dias, confirme com a administração.",
    },
    {
      sintoma: "A mesma diferença aparece com um número alto em Ocorrências.",
      acao: "Não são linhas repetidas: é a origem insistindo no mesmo valor. Use o indicador de Reincidentes para juntar esses casos e trate a causa na origem, senão a diferença volta depois de resolvida.",
    },
    {
      sintoma: "Você não reconhece o valor que aparece em Valor No Pandapé.",
      acao: "Ele é o valor cru da origem, não uma edição de alguém do time. Confira a vaga e a etapa no Pandapé antes de decidir.",
    },
    {
      sintoma: "Você filtrou por cliente e a contagem dos indicadores não mudou.",
      acao: "Os indicadores contam o trabalho inteiro de propósito, sem os filtros, porque eles próprios são filtros. Quem responde ao recorte é o contador de linhas acima da tabela.",
    },
  ],
  regras: [
    "O valor que já estava no sistema vence sempre. A diferença vira linha aqui justamente por não ter sido aplicada.",
    "Cada linha compara um campo só, entre o que está no sistema e o que veio do Pandapé.",
    "A mesma diferença voltando não cria linha nova: ela soma em Ocorrências.",
    "Os indicadores contam o total, sem os filtros, e servem como filtro clicável.",
    "A fila mostra por padrão só o que está pendente. Resolvida, a linha sai.",
  ],
  relacionados: [
    "resolver-uma-divergencia-da-ingestao",
    "ler-a-fila-de-entradas-do-pandape",
    "reprocessar-uma-entrada-do-pandape",
    "ler-o-diagnostico-do-sistema",
    "filtrar-pelo-card-de-indicador",
    "mover-o-candidato-de-etapa",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/divergencias-ingestao/page.tsx",
    "apps/frontend/src/components/admin/divergencias/FilaDeDivergencias.tsx",
    "apps/frontend/src/lib/divergencias-ingestao.ts",
    "apps/backend/src/as/ingestao-pandape/ingestao-divergencias.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
