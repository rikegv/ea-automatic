import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 10 de 14: COMO AS JANELAS SE COMPORTAM.
 *
 * ┌─ ESTE ARTIGO EXISTE POR UM DEFEITO REAL, E A REGRA QUE NASCEU DELE ──────────────────────────┐
 * │ Encostar fora da janela FECHAVA o painel e jogava fora tudo o que a pessoa tinha digitado, sem   │
 * │ aviso e sem desfazer. Hoje a janela não fecha mais por clique fora, em nenhuma tela: ela fecha    │
 * │ por Cancelar, por Salvar, por Fechar, ou pela tecla Escape.                                      │
 * │                                                                                                  │
 * │ O artigo ensina o comportamento, e a pessoa ganha DUAS coisas: para de perder o preenchimento, e  │
 * │ para de achar que a tela travou quando o clique fora não faz nada.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * "Janela" e não o termo técnico: quem opera chama de janela o painel que abre por cima da tela.
 */
export const artigo: Artigo = {
  slug: "abrir-e-fechar-uma-janela-do-sistema",
  titulo: "Abrir E Fechar Uma Janela Do Sistema",
  modulo: "COMECAR_AQUI",
  rotas: ["/admin/dicas-documento", "/gerenciador", "/esteira", "/as/vagas", "/beneficios"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Por que a janela de preenchimento não fecha quando você clica fora dela, e quais são as saídas: Cancelar, Salvar, Fechar e a tecla Escape.",
  termos: [
    "janela",
    "modal",
    "popup",
    "pop up",
    "nao fecha",
    "travou",
    "clicar fora",
    "escape",
    "esc",
    "cancelar",
    "salvar",
    "perdi o que digitei",
    "apagou tudo",
    "sair sem salvar",
  ],
  preRequisitos: ["Nada. O comportamento é o mesmo em todas as janelas do sistema."],
  passos: [
    {
      gesto: "Abra a janela pelo controle da tela.",
      detalhe:
        "Pode ser um botão do topo, um atalho na linha ou uma etiqueta clicável. A janela abre por cima da tela, e a tela continua atrás dela.",
      controles: ["editar", "cadastrar", "Nova dica"],
      print: {
        arquivo: "01-janela-de-preenchimento.png",
        legenda: "Passo 1: uma janela de preenchimento aberta, com Cancelar e Salvar no rodapé.",
      },
    },
    {
      gesto: "Preencha sem medo de encostar fora.",
      detalhe:
        "Clicar fora da janela não fecha nada e não apaga nada. Isso é de propósito: fechar é decisão, não escorregão do ponteiro.",
    },
    {
      gesto: "Para gravar, clique em Salvar. Para sair sem gravar, clique em Cancelar.",
      detalhe:
        "Cancelar descarta o que você digitou naquela janela e não altera nada do que já estava guardado.",
      controles: ["Salvar", "Cancelar"],
    },
    {
      gesto: "Em janela que é só de leitura, a saída é o Fechar do rodapé.",
      detalhe:
        "Onde não há nada a gravar, não existe Salvar: existe Fechar. Nenhuma janela do sistema fica sem saída visível.",
      controles: ["Fechar"],
    },
    {
      gesto: "Pelo teclado, a tecla Escape fecha qualquer janela.",
      detalhe:
        "Escape continua fechando de propósito: é gesto deliberado, ninguém encosta nele sem querer. Em janela de preenchimento, ele funciona como Cancelar.",
    },
    {
      gesto: "Em janela que confirma uma ação, leia a pergunta antes de confirmar.",
      detalhe:
        "A janela de confirmação diz o que vai acontecer e quantos registros serão afetados. O botão da direita executa, o da esquerda desiste.",
      controles: ["Confirmar", "Cancelar", "Ocultar"],
      print: {
        arquivo: "02-janela-de-confirmacao.png",
        legenda: "Passo 6: uma janela de confirmação, com a ação à direita e a desistência à esquerda.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "Cliquei fora e a janela não fechou. Parece travada.",
      acao: "Não está travada: ela não fecha por clique fora, para não jogar fora o que você digitou. Use Cancelar, Fechar ou a tecla Escape.",
    },
    {
      sintoma: "A janela é longa e eu não acho o botão de fechar.",
      acao: "Role a janela até o rodapé, que é onde os botões ficam. Pelo teclado, Escape fecha de onde você estiver.",
    },
    {
      sintoma: "O botão Salvar está apagado.",
      acao: "Falta campo obrigatório, ou a gravação está em andamento. A janela mostra o motivo logo acima dos botões.",
    },
    {
      sintoma: "Fechei sem querer e perdi o preenchimento.",
      acao: "Não há como recuperar: refaça o preenchimento. Foi para reduzir esse caso que o clique fora deixou de fechar.",
    },
    {
      sintoma: "Abri uma janela dentro de outra e me perdi.",
      acao: "Feche a de cima primeiro, pelo botão dela. A de baixo continua com o que você já tinha preenchido.",
    },
  ],
  regras: [
    "Nenhuma janela do sistema fecha por clique fora.",
    "Janela de preenchimento fecha por Cancelar ou Salvar. Janela de leitura fecha por Fechar.",
    "A tecla Escape fecha qualquer janela, e em janela de preenchimento equivale a Cancelar.",
    "Cancelar descarta o que foi digitado ali e não altera nada do que já estava guardado.",
    "Nenhuma janela fica sem saída visível.",
  ],
  relacionados: ["agir-em-varias-linhas-de-uma-vez", "importar-uma-planilha", "filtrar-uma-lista"],
  fontes: [
    "apps/frontend/src/components/ui/Modal.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
    "apps/frontend/src/app/(app)/admin/dicas-documento/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
