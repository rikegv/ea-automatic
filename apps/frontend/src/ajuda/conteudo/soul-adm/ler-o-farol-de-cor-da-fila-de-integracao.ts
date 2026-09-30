import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA INTEGRAÇÃO: A COR DE FUNDO DA LINHA.
 *
 * ┌─ AS TRÊS CORES, E A REGRA QUE AS DECIDE (lida na tela, não suposta) ──────────────────────────┐
 * │ A pintura olha DOIS dados, nessa ordem:                                                        │
 * │   1. status Realizado          -> VERDE claro;                                                 │
 * │   2. status Agendado OU existe data de agendamento -> AMARELO claro;                           │
 * │   3. nada disso                -> VERMELHO claro.                                              │
 * │ O "ou existe data" do item 2 é o detalhe que ninguém adivinha: linha com data salva e status    │
 * │ ainda A Agendar já pinta AMARELO, e é correto, porque alguém já marcou algo.                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONSEQUÊNCIA QUE O TEXTO PRECISA ENTREGAR, e ela é o vermelho ─────────────────────────────┐
 * │ O vermelho não é o "algo deu errado" das outras telas: aqui ele é a AUSÊNCIA de agendamento, e  │
 * │ por isso ele é a cor da fila de trabalho. Quem lê vermelho como erro procura defeito onde só    │
 * │ falta marcar a data.                                                                           │
 * │                                                                                                 │
 * │ E HÁ UM CASO LEGÍTIMO DE VERMELHO EM LINHA JÁ CONCLUÍDA: quem foi concluído sem integração não  │
 * │ tem status Realizado nem data de agendamento, então cai no terceiro ramo. Ele não aparece na    │
 * │ fila do dia, mas reaparece pintado de vermelho quando se filtra por aquele status. Medido na    │
 * │ regra da cor, e escrito porque é justamente o caso que faria alguém abrir chamado.              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU DE FORA ────────────────────────────────────────────────────────────────────────┐
 * │ Agendar, reagendar e marcar como realizada são o caminho principal e têm artigo próprio. Este  │
 * │ artigo é só de LEITURA: ele ensina a varrer a fila com o olho, e aponta para os outros.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a fila mostra nome de pessoa, então a captura fica suspensa enquanto
 * a homologação não tiver dado sintético. É o artigo mais prejudicado pela ausência de imagem, por
 * ser sobre cor, e por isso cada cor é descrita junto do DADO que a produz, e não só pelo tom.
 *
 * §A.6: nenhum dado de pessoa. O seletor de status da linha carrega o nome do candidato no rótulo
 * acessível, então ele não é declarado em `controles`.
 */
export const artigo: Artigo = {
  slug: "ler-o-farol-de-cor-da-fila-de-integracao",
  titulo: "Ler O Farol De Cor Da Integração",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "O que cada cor de fundo da linha diz na aba Integração: verde para a integração realizada, amarelo para quem já tem agendamento e vermelho para quem ainda não tem nada marcado.",
  termos: [
    "linha colorida",
    "linha vermelha",
    "linha amarela",
    "linha verde",
    "cor de fundo",
    "farol da integracao",
    "por que a linha esta vermelha",
    "o que significa a cor",
    "fila da integracao",
    "sem agendamento",
  ],
  preRequisitos: [
    "Estar na aba Integração: as outras abas não pintam a linha, e procurar a cor nelas não leva a nada.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e vá para a aba Integração.",
      detalhe:
        "A pintura de fundo existe só nesta aba. Nas demais, a informação de estado fica nas etiquetas da coluna Status.",
      controles: ["Esteira Admissional", "INTEGRAÇÃO"],
    },
    {
      gesto: "Leia o vermelho claro como falta de agendamento, e não como erro.",
      detalhe:
        "Ninguém marcou data para essa pessoa ainda. É a cor do trabalho a fazer: essas são as linhas que a fila existe para consumir.",
      controles: ["A Agendar"],
    },
    {
      gesto: "Leia o amarelo claro como agendamento feito, aguardando confirmação.",
      detalhe:
        "A data já está lá e falta confirmar que a integração aconteceu. A cor aparece tanto com o status Agendado quanto quando existe data salva e o status ainda não foi movido, porque a cor olha os dois.",
      controles: ["Agendado", "Data de Agendamento"],
    },
    {
      gesto: "Leia o verde claro como integração realizada.",
      detalhe:
        "A frente está concluída e essa linha sai da fila padrão. Ela volta a aparecer, verde, quando você filtra pelo status de realizado ou clica no card das integrações realizadas.",
      controles: ["Realizado", "Integrações Realizadas"],
    },
    {
      gesto: "Confira a cor contra as colunas da própria linha.",
      detalhe:
        "A cor lê o mesmo dado que as colunas mostram, então ela nunca discorda delas: havendo dúvida, o Data de Agendamento, o Horário e o Status da linha respondem.",
      controles: ["Horário", "Status"],
    },
    {
      gesto: "Use a cor para varrer, e os cards e filtros para recortar.",
      detalhe:
        "A cor não é filtro: ela serve ao olho. Para trabalhar só um grupo, clique no card do status ou use o filtro de status, que aí a lista encolhe de verdade.",
      controles: ["Total na fila"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A linha está vermelha e eu acho que tem algo errado com o candidato.",
      acao: "Vermelho aqui é ausência de agendamento, não defeito. Abra o relógio da linha e marque data, horário, tipo e consultor: a linha passa a amarelo.",
    },
    {
      sintoma: "Salvei a data e a linha continuou amarela em vez de ficar verde.",
      acao: "Está certo: amarelo é agendado. O verde só chega quando alguém confirma que a integração aconteceu, movendo o status para realizado.",
    },
    {
      sintoma: "A linha está amarela e o status ainda diz A Agendar.",
      acao: "Não é contradição. A cor também acende no amarelo quando existe data salva, mesmo com o status parado. Confirme o status pelo seletor da linha para os dois passarem a dizer a mesma coisa.",
    },
    {
      sintoma:
        "Filtrei pelo status de concluída sem integração e as linhas apareceram em vermelho.",
      acao: "É esperado: a cor só conhece realizado e agendado. Quem foi concluído sem integração não tem nem um nem outro, então cai no vermelho. Nesse caso quem manda é a coluna Status, não a cor.",
    },
    {
      sintoma: "Nenhuma linha está colorida.",
      acao: "Você provavelmente não está na aba Integração. Só ela pinta o fundo da linha; nas outras, o estado está nas etiquetas da coluna Status.",
    },
    {
      sintoma: "Procuro pela cor quem declinou ou teve rescisão e não encontro.",
      acao: "Esses desfechos não pintam, porque a admissão sai da fila e a cor não teria a quem servir. Consulte esses casos no Gerenciador.",
    },
  ],
  regras: [
    "A pintura de fundo da linha existe só na aba Integração.",
    "Verde claro é integração realizada, amarelo claro é agendamento feito, vermelho claro é nada marcado ainda.",
    "O amarelo acende com o status de agendado ou com a simples existência de data salva.",
    "A cor lê o mesmo dado das colunas, então ela nunca discorda da linha.",
    "A cor não filtra nada: ela serve ao olho. Quem recorta a lista são os cards e os filtros de status.",
    "Declínio e rescisão não pintam: a admissão sai da fila.",
    "Quem foi concluído sem integração cai na cor de nada marcado, porque não tem realizado nem agendamento. Nesse caso a coluna Status é a informação boa.",
  ],
  relacionados: [
    "acompanhar-a-integracao",
    "desconsiderar-a-integracao",
    "filtrar-pelo-card-de-indicador",
    "ler-a-linha-da-tabela",
    "o-mapa-das-frentes-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
