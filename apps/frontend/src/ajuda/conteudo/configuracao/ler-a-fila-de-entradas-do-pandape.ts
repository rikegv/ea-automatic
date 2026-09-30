import type { Artigo } from "../../tipos";

/**
 * FICHA: a fila de Entradas Do Pandapé, LEITURA.
 *
 * COBRE as oito colunas da tabela, o vocabulário da coluna Situação, o da coluna Motivo, e a razão
 * de tanta linha aparecer sem o nome do candidato. Esse último ponto é o que mais gera chamado
 * nesta tela: a ausência do nome PARECE defeito e não é, então ela é explicada como regra e não
 * como erro.
 *
 * NÃO COBRE o gesto de reprocessar: ele tem artigo próprio, apontado em `relacionados`. A separação
 * é a mesma do resto do manual, ler numa peça e agir na outra, e aqui ela paga em especial: quem
 * abre esta tela pela primeira vez precisa entender a fila ANTES de clicar em qualquer coisa.
 *
 * NÃO COBRE, de propósito, a régua de quais eventos são considerados pendentes. Ela mora no
 * servidor, a tela consome pronto, e descrevê-la aqui criaria uma segunda régua em texto, que
 * envelhece sem nada falhar.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: nenhuma. A entrada automática pelo Pandapé está configurada e a
 * fila se reproduz hoje. A única situação que depende de configuração é "Inerte", que é o estado
 * de quando a integração está sem credencial, e ela está descrita como sintoma.
 */
export const artigo: Artigo = {
  slug: "ler-a-fila-de-entradas-do-pandape",
  titulo: "Ler A Fila De Entradas Do Pandapé",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/entradas-pandape"],
  menus: ["entradas-pandape"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "saude-da-ingestao",
  resumo:
    "O que cada coluna da fila de Entradas Do Pandapé quer dizer, como ler a situação e o motivo de uma linha, e por que muita linha aparece sem o nome do candidato.",
  termos: [
    "candidato nao entrou",
    "o pandape nao trouxe",
    "nao virou admissao",
    "entrada do pandape",
    "fila de entradas",
    "candidato sumiu",
    "faltou candidato",
    "o ats mandou e nao chegou",
    "linha sem nome",
    "por que falhou",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Entradas Do Pandapé pelo menu da lateral esquerda.",
      detalhe:
        "A tela lista o que o Pandapé enviou e ainda não virou admissão. O contador acima da tabela diz quantas entradas estão na fila.",
      controles: ["Entradas Do Pandapé"],
    },
    {
      gesto: "Leia a coluna Candidato, que traz o nome e, embaixo dele, o identificador da entrada.",
      detalhe:
        "O nome só aparece quando o sistema já conseguiu resolvê-lo, então muita linha mostra não informado. Isso é esperado e não é erro: o identificador logo abaixo é o que sempre identifica a linha.",
      controles: ["Candidato"],
    },
    {
      gesto: "Confira em Vaga e em Chegou Em de onde veio a entrada e quando ela chegou.",
      detalhe: "A data e a hora de chegada são a referência para saber se o caso é recente.",
      controles: ["Vaga", "Chegou Em"],
    },
    {
      gesto: "Leia a coluna Situação, que é o desfecho da entrada.",
      detalhe:
        "Falhou, Não Enfileirado e Descartado Duplicado são as que pedem alguém. Recebido e Adiado ainda estão em curso. Admissão Criada, Pré-Admissão, Adotado e Já Conhecido terminaram bem. Inerte quer dizer que a integração está sem credencial. Passe o mouse na etiqueta para ver a explicação da situação daquela linha.",
      controles: [
        "Situação",
        "Recebido",
        "Adiado",
        "Falhou",
        "Não Enfileirado",
        "Descartado Duplicado",
        "Admissão Criada",
        "Pré-Admissão",
        "Adotado",
        "Já Conhecido",
        "Inerte",
      ],
    },
    {
      gesto: "Leia a coluna Motivo para saber o que faltou.",
      detalhe:
        "É o motivo que diz se o caso se resolve sozinho com o tempo, como Limite De Requisições e Tempo Esgotado, ou se depende de alguém, como Sem De/Para. Motivo em branco aparece como não informado.",
      controles: [
        "Motivo",
        "CPF Inválido",
        "Sem CPF Na Origem",
        "Sem Nome",
        "Sem De/Para",
        "Limite De Requisições",
        "Tempo Esgotado",
        "API Fora",
        "Duplicado",
        "Outro",
      ],
    },
    {
      gesto: "Olhe Tentativas e Última Tentativa antes de decidir o que fazer com a linha.",
      detalhe:
        "É o par que separa a entrada que acabou de chegar daquela que já tentou várias vezes e está parada há dias. Número alto com data antiga é o caso que mais precisa de alguém.",
      controles: ["Tentativas", "Última Tentativa"],
    },
    {
      gesto: "Use o filtro de Situação para recortar a fila, e clique no cabeçalho para ordenar.",
      detalhe:
        "O filtro aceita várias situações ao mesmo tempo, e nenhuma marcada significa todas. A ordenação por Situação segue a gravidade, e não a ordem alfabética.",
      controles: ["Filtrar por situação", "Todas as situações", "Atualizar a fila"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A situação da linha diz Inerte.",
      acao: "A integração está sem credencial, então não houve o que consultar. Não adianta reprocessar: escale para a administração e reprocesse depois que a credencial voltar.",
    },
    {
      sintoma: "A fila está vazia.",
      acao: "É o estado bom: tudo o que o Pandapé enviou virou admissão. A tela diz isso no lugar da tabela.",
    },
    {
      sintoma: "Você procura um candidato que já virou admissão e não o encontra na fila.",
      acao: "A fila mostra por padrão só o que continua pendente. Quem foi resolvido saiu dela. Para ver o histórico, marque as demais situações no filtro.",
    },
    {
      sintoma: "A tabela parece cortada na largura da tela.",
      acao: "Ela tem oito colunas e rola na horizontal de propósito, para nenhuma ficar espremida. Role a tabela para o lado.",
    },
  ],
  regras: [
    "A fila mostra o que o Pandapé enviou e ainda não virou admissão no sistema. Resolveu, a linha sai sozinha.",
    "O nome do candidato nem sempre está disponível na hora em que a linha entra na fila, e a linha aparece do mesmo jeito, com o identificador da entrada.",
    "A situação é o desfecho da entrada e o motivo é o que faltou para ela seguir. Os dois se leem juntos.",
    "Tentativas e Última Tentativa dizem há quanto tempo a entrada está parada, que é o que separa o caso recente do caso esquecido.",
  ],
  relacionados: [
    "reprocessar-uma-entrada-do-pandape",
    "ler-a-fila-de-divergencias-da-ingestao",
    "ler-o-diagnostico-do-sistema",
    "ordenar-a-lista-pelo-cabecalho",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/entradas-pandape/page.tsx",
    "apps/frontend/src/lib/pandape-entradas.ts",
    "apps/backend/src/domain/pandape-entrada.ts",
  ],
  revisadoEm: "2026-09-30",
};
