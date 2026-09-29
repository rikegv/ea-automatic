import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 9 de 14: LER A LINHA.
 *
 * ┌─ O ARTIGO QUE TIRA A DÚVIDA MAIS BOBA E MAIS CARA DO SISTEMA ────────────────────────────────┐
 * │ A linha das tabelas fala por COR e por ÍCONE, e a regra é uma só em todo o sistema: check verde  │
 * │ é pronto, exclamação amarela é falta coisa, x vermelho é encerrado ou recusado. Quem não sabe     │
 * │ disso lê a cor como enfeite e vai abrir a ficha de cada linha para descobrir o que a linha já     │
 * │ estava dizendo.                                                                                  │
 * │                                                                                                  │
 * │ E tem a distinção que confunde todo mundo: a etiqueta SÓLIDA é informação, a etiqueta de BORDA    │
 * │ TRACEJADA é botão. Quem não percebe isso nunca clica na de pendências, que é justamente a que     │
 * │ responde "o que falta nesta admissão".                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "ler-a-linha-da-tabela",
  titulo: "Ler A Linha Da Tabela",
  modulo: "COMECAR_AQUI",
  rotas: ["/gerenciador", "/esteira", "/liberacao", "/beneficios", "/assinaturas"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "O que a cor, o ícone e as etiquetas da linha querem dizer, e qual delas é botão: a leitura que evita abrir a ficha de cada admissão para saber o que já está na tela.",
  termos: [
    "pill",
    "etiqueta",
    "tag",
    "status",
    "cor",
    "verde",
    "amarelo",
    "vermelho",
    "icone",
    "bolinha",
    "o que significa",
    "completo",
    "parcial",
    "declinio",
    "pendencia obrigatoria",
    "o que falta",
    "nao informado",
  ],
  preRequisitos: ["Estar em qualquer tela com tabela. A leitura é a mesma em todas."],
  passos: [
    {
      gesto: "Leia a coluna de status da linha.",
      detalhe:
        "Ela diz em que ponto a admissão está: em admissão, banco a aguardar, admissão concluída, declinou ou rescisão. É a situação geral, não a de uma etapa.",
      /*
       * "Em Andamento" é a MESMA etiqueta de processo em aberto com outro nome, e ela aparece onde a
       * lista não é de admissão: no Gerenciador Do Portal, no funil da Central De Candidatos e nos
       * painéis. Fica declarada aqui, e não num artigo novo, porque o que se aprende é a etiqueta, e
       * ela se aprende uma vez.
       */
      controles: [
        "Status",
        "Em Admissão",
        "Admissão Concluída",
        "Banco, Aguardar",
        "Em Andamento",
      ],
      print: {
        arquivo: "01-etiquetas-da-linha.png",
        legenda: "Passo 1: as etiquetas de status na linha, com o ícone acompanhando o estado.",
      },
    },
    {
      gesto: "Leia as colunas de cada frente.",
      detalhe:
        "Auditoria, Exame, Cadastro e Integração têm coluna própria e andam sozinhas: uma concluir não faz a outra andar. É por isso que existe uma etiqueta por frente, e não uma só.",
      controles: ["Auditoria", "Exame", "Cadastro"],
    },
    {
      gesto: "Use o ícone da etiqueta para varrer a lista com o olho.",
      detalhe:
        "O ícone nunca é fixo: ele acompanha o estado real. Check verde é pronto, exclamação amarela é falta alguma coisa, x vermelho é recusado ou encerrado. A cor diz o mesmo, e as duas concordam sempre.",
    },
    {
      gesto: "Repare na etiqueta de borda tracejada da coluna de pendências obrigatórias.",
      detalhe:
        "Borda tracejada quer dizer que é botão. Completo é zero pendência, Parcial é falta informação obrigatória, Declínio é processo encerrado e não tem pendência a cobrar.",
      controles: ["Pendências Obrig.", "Completo", "Parcial", "Declínio", "Competências"],
      print: {
        arquivo: "02-badge-de-pendencias.png",
        legenda: "Passo 4: a etiqueta de pendências obrigatórias, com a borda tracejada de botão.",
      },
    },
    {
      gesto: "Clique nessa etiqueta para ver exatamente o que falta.",
      detalhe:
        "Abre a lista dos campos obrigatórios pendentes daquela admissão. É a resposta direta para o Parcial, em vez de procurar campo a campo na ficha.",
      controles: ["Ver pendências obrigatórias"],
    },
    {
      gesto: "Leia a célula escrita não informado como campo vazio.",
      detalhe:
        "Onde o dado não existe, a célula diz não informado com letra apagada. Não é erro de carregamento: é ausência de dado.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A etiqueta diz Parcial e a lista de pendências abre vazia.",
      acao: "Isso não deveria acontecer: as duas leem a mesma régua. Avise a administração com o nome da pessoa e a tela em que você viu.",
    },
    {
      sintoma: "A linha está verde em uma frente e amarela em outra.",
      acao: "É o normal. As frentes correm em paralelo e cada coluna fala só da sua.",
    },
    {
      sintoma: "Cliquei na etiqueta sólida e nada aconteceu.",
      acao: "Etiqueta sólida é informação, não botão. A clicável é a de borda tracejada.",
    },
    {
      sintoma: "Não entendi a etiqueta de uma coluna.",
      acao: "Passe o mouse sobre ela: o aviso repete o texto completo, que é útil quando a coluna é estreita e o rótulo foi cortado.",
    },
    {
      sintoma: "A linha diz Declínio na coluna de pendências.",
      acao: "Está encerrada. Declínio não entra em fila de trabalho e não conta como pendência em nenhum indicador, mas continua consultável no Gerenciador.",
    },
  ],
  regras: [
    "O ícone da etiqueta acompanha o estado real: check verde é pronto, exclamação amarela é falta coisa, x vermelho é recusado ou encerrado.",
    "Etiqueta sólida é informação. Etiqueta de borda tracejada é botão.",
    "Cada frente tem coluna própria porque as frentes andam em paralelo, sem depender uma da outra.",
    "Completo quer dizer zero pendência obrigatória, e a lista que abre no clique diz a mesma coisa.",
    "Declínio e rescisão estão encerrados: não entram em fila de trabalho nem contam como pendência.",
    "Célula vazia é escrita não informado.",
  ],
  relacionados: [
    "ordenar-a-lista-pelo-cabecalho",
    "filtrar-pelo-card-de-indicador",
    "abrir-o-prontuario-no-drive",
  ],
  fontes: [
    "apps/frontend/src/components/ui/StatusPill.tsx",
    "apps/frontend/src/components/ui/PendenciasBadge.tsx",
    "apps/frontend/src/lib/pendencias-pill.ts",
    "apps/frontend/src/lib/farol.ts",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
