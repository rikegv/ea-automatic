import type { Artigo } from "../../tipos";

/**
 * N1 DE BENEFÍCIOS 2 de 2: FECHAR A PENDÊNCIA DO BENEFÍCIO.
 *
 * ┌─ A TELA DIZ "CALCULADO", E O ARTIGO PRECISA DIZER "CALCULADO" TAMBÉM ───────────────────────┐
 * │ O estágio se chama, na tela, "Benefício Não Calculado" e "Benefício Calculado", e o botão diz   │
 * │ "Marcar como calculado". O manual NÃO renomeia isso (§A.14), então os `controles` e os passos    │
 * │ usam a palavra da tela, e o resumo e os `termos` carregam "cadastrado" e "lançar", que é como o  │
 * │ time fala. Quem procura pelo que vê acha pelo rótulo; quem procura pelo que diz acha pelo termo. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O LOTE É METADE DESTE ARTIGO ──────────────────────────────────────────────────────┐
 * │ Fechar um por um é um clique, e não precisaria de artigo. O que precisa é a ação em massa, e ela │
 * │ tem duas armadilhas que só se aprendem apanhando: a seleção vale SÓ a página que está na tela    │
 * │ (não a fila inteira), e a resposta diz quantas andaram e quantas ficaram. Sem as duas, o time    │
 * │ acha que finalizou trinta quando finalizou sete.                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ESTÁGIO É UM TOGGLE: o mesmo lugar marca e reverte. Isso é o que faz o artigo terminar em
 * "desfazer" em vez de em "avisar a administração".
 *
 * §A.6: nenhum dado de pessoa real. §A.11: nenhum travessão.
 */
export const artigo: Artigo = {
  slug: "marcar-o-beneficio-como-cadastrado",
  titulo: "Marcar O Benefício Como Cadastrado",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "beneficios",
  resumo:
    "Como fechar a pendência do benefício depois de lançar nos sistemas: marcar uma pessoa, marcar a página inteira de uma vez e reverter quando marcar errado.",
  termos: [
    "marcar como cadastrado",
    "beneficio calculado",
    "calcular beneficio",
    "lancar beneficio",
    "dar baixa no beneficio",
    "finalizar beneficio",
    "tirar da fila de beneficios",
    "reverter beneficio",
    "desfazer",
    "em lote",
    "em massa",
    "varios de uma vez",
  ],
  preRequisitos: [
    "Ter lançado o benefício no sistema em que ele é cadastrado. A marcação aqui é o registro de que o trabalho foi feito, ela não lança nada em lugar nenhum.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e fique na aba Fila De Trabalho.",
      detalhe:
        "É a fila de quem ainda aguarda cálculo. Os três indicadores do topo também são filtro: clicar em um deles troca a visão da tabela.",
      controles: [
        "Benefícios",
        "Fila De Trabalho",
        "Total Na Esteira De Benefícios",
        "Não Calculados, Aguardando Cálculo",
        "Calculados, Benefício Calculado",
      ],
      print: {
        arquivo: "01-fila-e-indicadores.png",
        legenda: "Passo 1: os três indicadores do topo e a aba Fila De Trabalho.",
      },
    },
    {
      gesto: "Leia a coluna Status para saber em que estágio cada pessoa está.",
      detalhe:
        "Benefício Não Calculado, em vermelho, é o que falta fazer. Benefício Calculado, em verde, é o que já foi feito. A coluna é informativa e não clica: quem age é a coluna Ações.",
      controles: ["Status", "Benefício Não Calculado", "Benefício Calculado"],
    },
    {
      gesto: "Para uma pessoa, clique no botão verde de check na coluna Ações.",
      detalhe:
        "O aviso do mouse escreve a ação por extenso. A linha muda de estágio, sai da Fila De Trabalho e passa a aparecer em Finalizados.",
      controles: ["Ações", "Marcar como calculado"],
      print: {
        arquivo: "02-acao-da-linha.png",
        legenda: "Passo 3: o botão que marca o benefício como calculado, na coluna Ações.",
      },
    },
    {
      gesto: "Para várias pessoas, marque as caixas da esquerda e use o botão da faixa azul.",
      detalhe:
        "A caixa do cabeçalho marca as admissões DESTA PÁGINA, e não a fila inteira. A faixa que aparece diz quantas estão selecionadas nesta página, e o botão traz a contagem entre parênteses. Limpar seleção desmarca tudo.",
      controles: [
        "Selecionar todas as admissões desta página",
        "selecionada(s) nesta página",
        "Marcar Calculado De Todos",
        "Limpar seleção",
      ],
      print: {
        arquivo: "03-acao-em-lote.png",
        legenda: "Passo 4: a faixa da ação em massa, com a contagem do que foi marcado.",
      },
    },
    {
      gesto: "Confirme a ação em massa na janela que abre.",
      detalhe:
        "Ela repete o número de admissões que vão ser atualizadas e avisa que as que já estiverem em outro estágio ficam como estão. Confirmada, a mensagem verde do topo diz quantas foram atualizadas e quantas ficaram de fora.",
      controles: ["Marcar Calculado De Todos", "Cancelar"],
    },
    {
      gesto: "Para desfazer, abra a aba Finalizados e clique no botão amarelo de reverter.",
      detalhe:
        "O estágio é um vai e volta: reverter traz a pessoa de volta para a Fila De Trabalho, sem perder nada do pacote. Em massa, o botão da faixa é Reverter Todos.",
      controles: [
        "Finalizados",
        "Reverter para Benefício Não Calculado, trazendo de volta para a fila",
        "Reverter Todos",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A mensagem diz que algumas já estavam em outro estágio.",
      acao: "Não é erro. Só anda quem está no estágio anterior: quem já tinha sido marcado por outra pessoa fica como está. O número que andou é o primeiro da mensagem.",
    },
    {
      sintoma: "A tela mostra Falha ao atualizar o estágio.",
      acao: "Nada mudou. Recarregue a página e confira a coluna Status antes de clicar de novo, para não marcar duas vezes o que já andou.",
    },
    {
      sintoma: "O sistema respondeu Nenhuma admissão selecionada.",
      acao: "A seleção se perdeu, normalmente por troca de página ou de filtro entre a marcação e o clique. Marque de novo na página em que você vai agir e repita.",
    },
    {
      sintoma: "Marquei a caixa do cabeçalho achando que pegava a fila inteira.",
      acao: "Ela marca só as admissões da página que está na tela, e o aviso do mouse diz isso. Para fechar uma fila grande, vá página por página, ou recorte por cliente no filtro antes de marcar.",
    },
    {
      sintoma: "A pessoa sumiu da tela depois que eu marquei.",
      acao: "É o esperado: a aba É o estágio. Ela está na aba Finalizados, ou no indicador Calculados, Benefício Calculado.",
    },
  ],
  regras: [
    "A marcação é registro de trabalho feito, não lançamento: o sistema não manda nada para nenhum sistema de benefício.",
    "O estágio é um vai e volta. Marcar e reverter acontecem no mesmo lugar, então marcar errado se desfaz com um clique.",
    "Só anda quem está no estágio anterior. Numa ação em massa, quem já andou é ignorado, e a mensagem diz quantos foram.",
    "A seleção vale a página que está na tela, e ela se perde ao trocar de página, de filtro ou de aba.",
    "A aba é o próprio estágio: não há marcação extra a fazer depois de clicar.",
  ],
  relacionados: [
    "montar-o-pacote-de-beneficios",
    "agir-em-varias-linhas-de-uma-vez",
    "filtrar-pelo-card-de-indicador",
    "filtrar-uma-lista",
    "virar-a-pagina-da-lista",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/backend/src/beneficios/beneficios-fila.service.ts",
    "apps/backend/src/beneficios/beneficios-fila.controller.ts",
  ],
  revisadoEm: "2026-09-28",
};
